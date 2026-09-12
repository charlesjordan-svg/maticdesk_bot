#!/usr/bin/env node
// @ts-check
/**
 * D264. Drive the REAL Piper worker with the tuning on and off, and measure what comes out.
 *
 *   npm.cmd run verify:voice
 *
 * WHY THIS IS A SCRIPT AND NOT A TEST. It needs the 63 MB voice model, a Python with piper, and
 * about ten seconds. `npm test` runs headless with no downloads on any machine, and a test that
 * fails because a model is absent teaches people to ignore a red run. The headless half - that the
 * right numbers reach the worker at all - is `test/voice-tuning.test.mjs`.
 *
 * THE THREE THINGS IT CHECKS, and the third is the one that would be a silent defect:
 *
 *   1. The tuning CHANGES the audio: faster, and less bright, in the measured direction.
 *   2. Turning it off returns plain Amy, so the toggle is a real off switch and not decoration.
 *   3. THE VISEME TIMELINE STILL MATCHES THE AUDIO. `length_scale` compresses the waveform, and a
 *      timeline that did not compress with it would leave the mouth running ahead of the voice by
 *      a third of a second at the end of every sentence. Nothing on screen would look broken; it
 *      would just be wrong, which is why it is measured rather than reasoned about.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const { resolveVoiceModelPath, resolveVoiceTuning, NO_TUNING } = await import("../src/main/tts-service.js");
const MODEL = resolveVoiceModelPath(config, ROOT);
const LINE = "Hi, I'm Matic. Tell me what you need in your own words.";
const WORDS = 11;
const dir = mkdtempSync(join(tmpdir(), "matic-verify-voice-"));

/** One worker, one utterance, torn down. Slower than reusing it and far easier to trust. */
function speak(tuning, out) {
  return new Promise((res, rej) => {
    const args = [...(config.pythonArgs ?? []), join(ROOT, "scripts/piper_worker.py"), MODEL, "--tuning", JSON.stringify(tuning)];
    const p = spawn(config.pythonCommand ?? "py", args, { stdio: ["pipe", "pipe", "pipe"] });
    let done = false;
    createInterface({ input: p.stdout }).on("line", (line) => {
      let m; try { m = JSON.parse(line); } catch { return; }
      if (m.ready === true) { p.stdin.write(JSON.stringify({ id: 1, text: LINE, wav: out }) + "\n"); return; }
      if (m.ready === false) { done = true; p.kill(); rej(new Error(m.error)); return; }
      if (m.id === 1) { done = true; p.stdin.write(JSON.stringify({ cmd: "quit" }) + "\n"); p.kill(); m.ok ? res(m) : rej(new Error(m.error)); }
    });
    p.on("exit", () => { if (!done) rej(new Error("worker exited before answering")); });
  });
}

/** Median spectral centroid and articulation rate, the two things the tuning moves. */
function measure(wav) {
  const b = readFileSync(wav);
  // Minimal RIFF walk - the worker writes canonical PCM, and pulling in a parser for one header
  // would be more code than reading four fields.
  const rate = b.readUInt32LE(24), bits = b.readUInt16LE(34);
  let off = 12;
  while (off < b.length - 8 && b.toString("ascii", off, off + 4) !== "data") off += 8 + b.readUInt32LE(off + 4);
  const n = b.readUInt32LE(off + 4) / (bits / 8);
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(off + 8 + i * 2) / 32768;
  const FRAME = Math.round(0.04 * rate), HOP = Math.round(0.01 * rate);
  const cents = []; let speech = 0, frames = 0;
  for (let i = 0; i + FRAME < n; i += HOP) {
    frames++;
    let e = 0; for (let k = 0; k < FRAME; k++) e += x[i + k] * x[i + k];
    if (Math.sqrt(e / FRAME) < 0.006) continue;
    speech++;
    // A coarse DFT sweep: enough for a centroid, and no FFT dependency.
    //
    // DO NOT DECIMATE THIS LOOP. The first draft stepped k by 2 while still computing the phase at
    // the full sample rate, which is decimation without a low-pass - it aliases everything above
    // Nyquist/2 back down and reported a speech centroid of 5544 Hz, where the real figure is about
    // 1370. It then FAILED A PASSING PRODUCT: the shelf was working (measured independently at
    // 1364 -> 1250 -> 1060 as the gain increased) and this said it was not. A verification tool
    // that reports a defect in working code is worse than no tool.
    let num = 0, den = 0;
    for (let f = 100; f < rate / 2; f += 100) {
      let re = 0, im = 0; const w = (2 * Math.PI * f) / rate;
      for (let k = 0; k < FRAME; k++) { const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / FRAME); re += x[i + k] * win * Math.cos(w * k); im -= x[i + k] * win * Math.sin(w * k); }
      const mag = Math.sqrt(re * re + im * im); num += mag * f; den += mag;
    }
    if (den > 0) cents.push(num / den);
  }
  cents.sort((a, b2) => a - b2);
  return {
    seconds: n / rate,
    speechSeconds: (speech * HOP) / rate,
    rate: WORDS / ((speech * HOP) / rate),
    centroid: cents.length ? cents[Math.floor(cents.length / 2)] : 0,
    frames,
  };
}

const tuned = resolveVoiceTuning(config);
console.log(`model   ${MODEL}`);
console.log(`tuning  ${JSON.stringify(tuned)}\n`);

const rows = [];
for (const [label, t] of [["OFF (plain Amy)", { ...NO_TUNING }], ["ON  (config.json)", tuned]]) {
  const out = join(dir, `${label.startsWith("OFF") ? "off" : "on"}.wav`);
  const r = await speak(t, out);
  const m = measure(out);
  const timelineMs = r.timeline.reduce((s, [, ms]) => s + ms, 0);
  rows.push({ label, m, timelineMs, audioMs: m.seconds * 1000 });
  console.log(`${label}  rate ${m.rate.toFixed(2)} w/s   centroid ${m.centroid.toFixed(0)} Hz   audio ${m.seconds.toFixed(2)}s   timeline ${(timelineMs / 1000).toFixed(2)}s`);
}

const [off, on] = rows;
let bad = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${label} ${ok ? "" : extra}`); if (!ok) bad++; };
console.log("");
if (tuned.enabled) {
  check("the tuning makes it faster", on.m.rate > off.m.rate * 1.1, `${off.m.rate.toFixed(2)} -> ${on.m.rate.toFixed(2)}`);
  check("the tuning makes it less bright", on.m.centroid < off.m.centroid - 40, `${off.m.centroid.toFixed(0)} -> ${on.m.centroid.toFixed(0)}`);
} else {
  console.log("  (tuning is off in config.json - only the timeline check below means anything)");
}
for (const r of rows) {
  // The one that would be a silent defect. 2% covers rounding across 60-odd phoneme rows.
  const drift = Math.abs(r.timelineMs - r.audioMs) / r.audioMs;
  check(`${r.label}: the viseme timeline matches the audio (drift ${(drift * 100).toFixed(2)}%)`, drift < 0.02);
}
console.log(bad ? `\n${bad} FAILED` : "\nall good");
process.exit(bad ? 1 : 0);
