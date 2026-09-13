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
import { join, resolve, isAbsolute } from "node:path";

export class TtsService {
  /**
   * @param rootDir Directory a relative `voiceModelPath` is resolved against - the app root, so
   *   `voices/en_US-amy-medium.onnx` in config.json means the same file on every machine. Without it
   *   a relative path would resolve against whatever the current directory happened to be.
   */
  constructor(config, { onLog = () => {}, rootDir = process.cwd() } = {}) {
    this.config = config;
    this.onLog = onLog;
    this.rootDir = rootDir;
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
    // D293: the worker is STOPPED when the window hides and STARTED again when it shows, so this
    // runs more than once per process. Each start begins clean, and the previous worker's late
    // exit event (below) must not be allowed to mark the new one not-ready.
    this.readyError = null;
    this._tmpDir = await mkdtemp(join(tmpdir(), "matic-tts-"));

    // MATIC_VOICE_MODEL overrides config.json, the same way MATIC_LOCAL_MODEL does for the model
    // provider - so a machine with the model somewhere else does not edit a committed file.
    const modelPath = resolveVoiceModelPath(this.config, this.rootDir);
    this.onLog(`[piper] voice model: ${modelPath}${process.env.MATIC_VOICE_MODEL ? " (from MATIC_VOICE_MODEL)" : ""}`);
    // D264. The tuning goes to the worker as one JSON argument rather than five flags: it is one
    // decision, it is logged as one line, and adding a knob later does not change the arg list.
    const tuning = resolveVoiceTuning(this.config);
    this.tuning = tuning;
    this.onLog(tuning.enabled
      ? `[piper] voice tuning: length_scale ${tuning.lengthScale}, shelf ${tuning.shelfDb} dB at ${tuning.shelfHz} Hz Q ${tuning.shelfQ} (D264)`
      : `[piper] voice tuning: OFF - plain Amy${process.env.MATIC_VOICE_TUNING ? " (MATIC_VOICE_TUNING=off)" : ""}`);
    const args = [...(this.config.pythonArgs ?? []), workerScript, modelPath, "--tuning", JSON.stringify(tuning)];
    const proc = spawn(this.config.pythonCommand ?? "py", args, { stdio: ["pipe", "pipe", "pipe"] });
    this.proc = proc;

    createInterface({ input: proc.stderr }).on("line", (l) => this.onLog(`[piper] ${l}`));
    createInterface({ input: proc.stdout }).on("line", (line) => this._onLine(line));

    proc.on("exit", (code) => {
      // A worker that was replaced (stop() then start(), D293) exits AFTER its successor may
      // already be ready; its exit says nothing about the current one.
      if (this.proc !== null && this.proc !== proc) return;
      this.ready = false;
      this.onLog(`[piper] worker exited code=${code}`);
      for (const { reject } of this._pending.values()) reject(new Error("piper worker exited"));
      this._pending.clear();
      // A start() still waiting for "ready" from THIS worker gets its answer now rather than at
      // the 30 s timeout - otherwise a hide during startup leaves the next show without a voice.
      this._readyResolve?.(false);
      this._readyResolve = null;
    });
    proc.on("error", (err) => {
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
    const proc = this.proc;
    // Cleared FIRST, so a synthesize() that races the kill is refused rather than written to a
    // closing pipe, and so the exit handler above knows this worker was ours when it fires.
    this.proc = null;
    this.ready = false;
    try {
      proc.stdin.write(JSON.stringify({ cmd: "quit" }) + "\n");
    } catch { /* already gone */ }
    proc.kill();
  }
}

/**
 * The voice model path the worker is given: MATIC_VOICE_MODEL if set, else config.voiceModelPath,
 * resolved against `rootDir` when relative. Exported so preflight-style checks use the same rule.
 * @param {{voiceModelPath?: string}} config
 * @param {string} rootDir
 */
export function resolveVoiceModelPath(config, rootDir) {
  const p = process.env.MATIC_VOICE_MODEL || config.voiceModelPath || "voices/en_US-amy-medium.onnx";
  return isAbsolute(p) ? p : resolve(rootDir, p);
}

/** Plain Amy: the voice exactly as the model was trained, with nothing done to it. */
export const NO_TUNING = { enabled: false, lengthScale: 1.0, shelfDb: 0, shelfHz: 2500, shelfQ: 0.7 };

/**
 * HOW the voice is delivered - not WHICH voice, which is `resolveVoiceModelPath` above. D264.
 *
 * Pure, and exported, for the same reason `resolveVoiceModelPath` is: this decides what the worker
 * is told, and a headless test can check the decision without a 63 MB model or a Python process.
 *
 * EVERY VALUE IS CLAMPED, because these reach a DSP filter and a synthesis engine. A `lengthScale`
 * of 0 divides by nothing and a shelf of +40 dB is not a voice, and config.json is a file a person
 * edits. Out of range is pulled to the edge rather than refused - a mistyped number should make the
 * voice slightly wrong, not silent.
 *
 * `MATIC_VOICE_TUNING=off` turns it off for one run without editing a committed file, the same
 * shape as `MATIC_VOICE_MODEL`. It exists so the A/B that chose these numbers can be repeated.
 *
 * @param {{voiceTuning?: {enabled?: boolean, lengthScale?: number, shelfDb?: number, shelfHz?: number, shelfQ?: number}}} config
 */
export function resolveVoiceTuning(config) {
  if (String(process.env.MATIC_VOICE_TUNING ?? "").toLowerCase() === "off") return { ...NO_TUNING };
  const t = config?.voiceTuning;
  if (!t || t.enabled !== true) return { ...NO_TUNING };
  const num = (v, fallback, lo, hi) => {
    // `null` is what JSON gives for a value someone blanked out, and `Number(null)` is 0 - which
    // would clamp `lengthScale: null` to 0.3 and make the voice gabble, instead of falling back to
    // 1.0 like the absent key it actually means. Absent and blank are the same intent here.
    if (v === null || v === undefined || v === "") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  };
  return {
    enabled: true,
    lengthScale: num(t.lengthScale, 1.0, 0.3, 2.5),
    shelfDb: num(t.shelfDb, 0, -18, 18),
    shelfHz: num(t.shelfHz, 2500, 200, 10000),
    shelfQ: num(t.shelfQ, 0.7, 0.1, 4.0),
  };
}
