/**
 * The voice tuning: what reaches the worker, and what the toggles actually turn off. D264.
 *
 * Run: node test/voice-tuning.test.mjs        (from client/; part of `npm test`)
 *
 * THE HEADLESS HALF. Whether the audio is faster and darker needs the 63 MB model and a Python
 * process, so it is `npm.cmd run verify:voice` and not a test — a red run caused by a missing
 * download teaches people to ignore red runs. What IS testable here is every decision made before
 * a sample exists: which numbers are chosen, what happens to a mistyped one, and that the two
 * separate off switches stay separate.
 *
 * THE TWO TOGGLES ARE DIFFERENT THINGS AND §4 EXISTS BECAUSE THEY WILL BE CONFUSED:
 *   config.json `voiceTuning.enabled`                    - HOW Piper speaks (this file)
 *   assets/greetings/greetings.manifest.json `enabled`   - WHETHER the boot line is Piper at all (D263)
 * Turning one off must not touch the other.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveVoiceTuning, NO_TUNING } from "../src/main/tts-service.js";
import { recordedSpeechEnabled } from "../src/renderer/recorded-speech.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT = resolve(HERE, "..");
const config = JSON.parse(readFileSync(join(CLIENT, "config.json"), "utf8"));
let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}
const withEnv = (v, fn) => {
  const had = process.env.MATIC_VOICE_TUNING;
  if (v === null) delete process.env.MATIC_VOICE_TUNING; else process.env.MATIC_VOICE_TUNING = v;
  try { return fn(); } finally { if (had === undefined) delete process.env.MATIC_VOICE_TUNING; else process.env.MATIC_VOICE_TUNING = had; }
};

// ==============================================================================================
console.log("=== 1. the shipped config carries the settings Charles chose ===");
const t = withEnv(null, () => resolveVoiceTuning(config));
check("tuning is ON in the shipped config", t.enabled === true);
check("length_scale is 0.65 (the '07' he picked)", t.lengthScale === 0.65, String(t.lengthScale));
check("shelf is -2.3 dB at 2500 Hz", t.shelfDb === -2.3 && t.shelfHz === 2500, JSON.stringify(t));
// Q is 0.7 and NOT the cookbook default of 0.5, because 0.7 is what reproduces the ffmpeg filter
// the audition samples were rendered with. A "tidy" 0.5 would quietly change what he approved.
check("shelf Q is 0.7 — calibrated against the samples he heard, not a default", t.shelfQ === 0.7, String(t.shelfQ));
check("config.json explains itself", typeof config._voiceTuningNote === "string" && config._voiceTuningNote.length > 200);

// ==============================================================================================
console.log("\n=== 2. the off switch is a real off switch ===");
check("enabled:false -> plain Amy", JSON.stringify(withEnv(null, () => resolveVoiceTuning({ voiceTuning: { ...config.voiceTuning, enabled: false } }))) === JSON.stringify(NO_TUNING));
check("a missing voiceTuning block -> plain Amy", JSON.stringify(withEnv(null, () => resolveVoiceTuning({}))) === JSON.stringify(NO_TUNING));
check("enabled must be exactly true, not truthy", withEnv(null, () => resolveVoiceTuning({ voiceTuning: { enabled: "yes", lengthScale: 0.5 } })).enabled === false);
check("MATIC_VOICE_TUNING=off overrides a config that says on", withEnv("off", () => resolveVoiceTuning(config)).enabled === false);
check("MATIC_VOICE_TUNING=OFF is case-insensitive", withEnv("OFF", () => resolveVoiceTuning(config)).enabled === false);
check("any other value of the env var leaves config in charge", withEnv("on", () => resolveVoiceTuning(config)).enabled === true);
check("plain Amy means length_scale 1.0 and NO shelf", NO_TUNING.lengthScale === 1.0 && NO_TUNING.shelfDb === 0);

// ==============================================================================================
console.log("\n=== 3. config.json is a file a person edits, so every value is clamped ===");
// These reach a DSP filter and a synthesis engine. Out of range is pulled to the edge rather than
// refused: a mistyped number should make the voice slightly wrong, never silent.
const cl = (v) => withEnv(null, () => resolveVoiceTuning({ voiceTuning: { enabled: true, ...v } }));
check("length_scale 0 cannot reach the synthesiser", cl({ lengthScale: 0 }).lengthScale >= 0.3);
check("a negative length_scale is clamped", cl({ lengthScale: -5 }).lengthScale >= 0.3);
check("an absurd length_scale is clamped", cl({ lengthScale: 99 }).lengthScale <= 2.5);
check("a +40 dB shelf is clamped", cl({ shelfDb: 40 }).shelfDb <= 18);
check("a shelf above Nyquist-ish is clamped", cl({ shelfHz: 999999 }).shelfHz <= 10000);
check("Q of 0 cannot divide by zero in the biquad", cl({ shelfQ: 0 }).shelfQ >= 0.1);
for (const junk of [null, undefined, "fast", NaN, {}]) {
  check(`length_scale ${JSON.stringify(junk)} falls back to 1.0 rather than NaN`, cl({ lengthScale: junk }).lengthScale === 1.0);
}
check("every field is a finite number", Object.values(cl({})).filter((v) => typeof v === "number").every(Number.isFinite));

// ==============================================================================================
console.log("\n=== 4. TWO TOGGLES, AND THEY MUST NOT BE THE SAME SWITCH ===");
check("the recorded-greeting toggle is independent of the tuning toggle",
  recordedSpeechEnabled() === true && withEnv("off", () => resolveVoiceTuning(config)).enabled === false);
check("config.json's note says which switch is which",
  /greetings\.manifest\.json/.test(config._voiceTuningNote) && /recorded-greeting toggle/i.test(config._voiceTuningNote));

// ==============================================================================================
console.log("\n=== 5. the worker is actually told, and the pieces line up ===");
const service = readFileSync(join(CLIENT, "src/main/tts-service.js"), "utf8");
const worker = readFileSync(join(CLIENT, "scripts/piper_worker.py"), "utf8");
check("tts-service passes --tuning to the worker", /"--tuning", JSON\.stringify\(tuning\)/.test(service));
check("the worker parses --tuning", /--tuning/.test(worker) && /json\.loads\(argv\[i \+ 1\]\)/.test(worker));
check("the worker still works with NO --tuning (the flag is additive)", /tuning = \{"enabled": False\}/.test(worker));
check("length_scale goes in at SYNTHESIS, which is what keeps alignments honest", /SynthesisConfig\(length_scale=/.test(worker));
check("the shelf is applied to frames, not by re-reading the file", /apply_shelf\(frames,/.test(worker));
// Checked as "imports nothing that can start a process", NOT as "the string ffmpeg is absent":
// the first draft grepped for `ffmpeg` and failed on the COMMENT explaining why ffmpeg is not
// called, which is a test that punishes the documentation for describing the decision.
check("the worker cannot spawn anything in the speech path",
  !/^\s*import subprocess/m.test(worker) && !/subprocess\.(run|Popen|call)/.test(worker) && !/os\.system/.test(worker));
check("scipy is optional — a missing dependency must not silence the voice",
  /from scipy\.signal import lfilter/.test(worker) && /except Exception:/.test(worker));
// The claim the whole filter rests on: a biquad does not move audio in time, so the viseme
// timeline built from the alignments still points at the right samples. verify:voice measures it.
check("verify:voice exists and checks timeline drift",
  /drift/.test(readFileSync(join(CLIENT, "scripts/verify-voice.mjs"), "utf8")));
check("verify:voice is an npm script", JSON.parse(readFileSync(join(CLIENT, "package.json"), "utf8")).scripts["verify:voice"] === "node scripts/verify-voice.mjs");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
