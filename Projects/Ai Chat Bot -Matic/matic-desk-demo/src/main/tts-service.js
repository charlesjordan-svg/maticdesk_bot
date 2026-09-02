// @ts-check
/**
 * Owns the persistent Piper worker process.
 *
 * The model costs seconds to load, so it is loaded once at app start and kept warm.
 * Failure here degrades to text-only with mouth animation (cut-order item 3) - it never
 * blocks or fakes a spoken reply.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class TtsService {
  constructor(config, { onLog = () => {} } = {}) {
    this.config = config;
    this.onLog = onLog;
    this.proc = null;
    this.ready = false;
    this.readyError = null;
    this.sampleRate = null;
    this._nextId = 1;
    this._pending = new Map();
    this._tmpDir = null;
  }

  async start(workerScript) {
    if (!this.config.voiceEnabled) {
      this.readyError = "voice disabled in config";
      return false;
    }
    this._tmpDir = await mkdtemp(join(tmpdir(), "matic-tts-"));

    const args = [...(this.config.pythonArgs ?? []), workerScript, this.config.voiceModelPath];
    this.proc = spawn(this.config.pythonCommand ?? "py", args, { stdio: ["pipe", "pipe", "pipe"] });

    createInterface({ input: this.proc.stderr }).on("line", (l) => this.onLog(`[piper] ${l}`));
    createInterface({ input: this.proc.stdout }).on("line", (line) => this._onLine(line));

    this.proc.on("exit", (code) => {
      this.ready = false;
      this.onLog(`[piper] worker exited code=${code}`);
      for (const { reject } of this._pending.values()) reject(new Error("piper worker exited"));
      this._pending.clear();
    });
    this.proc.on("error", (err) => {
      this.readyError = err.message;
      this.onLog(`[piper] spawn failed: ${err.message}`);
    });

    return new Promise((resolve) => {
      this._readyResolve = resolve;
      setTimeout(() => {
        if (!this.ready) {
          this.readyError ??= "piper worker did not become ready within 30s";
          resolve(false);
        }
      }, 30000);
    });
  }

  _onLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      this.onLog(`[piper] non-json stdout: ${line}`);
      return;
    }
    if (Object.hasOwn(msg, "ready")) {
      this.ready = Boolean(msg.ready);
      this.sampleRate = msg.sampleRate ?? null;
      if (!this.ready) this.readyError = msg.error ?? "unknown";
      this.onLog(this.ready ? `[piper] ready (${msg.model}, ${msg.sampleRate} Hz)` : `[piper] NOT ready: ${this.readyError}`);
      this._readyResolve?.(this.ready);
      this._readyResolve = null;
      return;
    }
    const entry = this._pending.get(msg.id);
    if (!entry) return;
    this._pending.delete(msg.id);
    entry.resolve(msg);
  }

  /**
   * @returns {Promise<{ok:boolean, timeline?:[string,number][], audio?:Buffer, error?:string}>}
   * Never throws - a voice failure must not take down a reply.
   */
  async synthesize(text) {
    if (!this.ready) return { ok: false, error: this.readyError ?? "piper not ready" };
    const id = this._nextId++;
    const wav = join(this._tmpDir, `u${id}.wav`);
    const result = await new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify({ id, text, wav }) + "\n");
      setTimeout(() => {
        if (this._pending.delete(id)) resolve({ id, ok: false, error: "synthesis timed out" });
      }, 20000);
    }).catch((err) => ({ ok: false, error: err.message }));

    if (!result.ok) return { ok: false, error: result.error };
    try {
      const audio = await readFile(result.wav);
      return { ok: true, timeline: result.timeline, audio };
    } catch (err) {
      return { ok: false, error: `could not read synthesized wav: ${err.message}` };
    }
  }

  stop() {
    if (!this.proc) return;
    try {
      this.proc.stdin.write(JSON.stringify({ cmd: "quit" }) + "\n");
    } catch { /* already gone */ }
    this.proc.kill();
    this.proc = null;
  }
}
