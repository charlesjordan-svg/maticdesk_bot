/**
 * Pre-recorded greetings: the manifest, the matching rule, and the two things that must not happen.
 * D263, 2026-09-11.
 *
 * Run: node test/recorded-speech.test.mjs        (from client/; part of `npm test`)
 *
 * THE TWO FAILURES THIS FILE EXISTS FOR, both of which are silent:
 *
 *   1. **The avatar says something other than what the transcript shows.** `persona.boot` is
 *      ordered because it is rotated in order, so somebody will reorder it — and an index-keyed
 *      manifest would then play the wrong recording with nothing reporting it. The manifest is
 *      keyed by exact display text, and §2 is what keeps the two files in step.
 *   2. **A recording speaks something D249 says must never be spoken.** A fixed audio file cannot
 *      be rewritten before it plays, so a line the redaction would have changed is not eligible
 *      for a recording at all. §4.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import persona from "../src/router/persona.json" with { type: "json" };
import manifest from "../assets/greetings/greetings.manifest.json" with { type: "json" };
import { recordedFor, recordedLines, recordedSpeechEnabled, GREETINGS_DIR } from "../src/renderer/recorded-speech.js";
import { spokenForm } from "../src/renderer/spoken-form.js";
import { bootLines, BOOT_SETS } from "../src/router/greeting.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT = resolve(HERE, "..");
const ASSETS = join(CLIENT, "assets/greetings");
let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}

// ==============================================================================================
console.log("=== 1. the manifest is a manifest, and its files are on disk ===");
check("it is keyed by TEXT, not by index", recordedLines().every((l) => typeof l.text === "string" && l.text.length > 10));
check("no entry carries an index, a position or an id (that shape is the defect)",
  recordedLines().every((l) => !("index" in l) && !("position" in l) && !("id" in l)), JSON.stringify(recordedLines().map((l) => Object.keys(l))));
check("the voice is named, so a second render cannot quietly use a different one",
  typeof manifest.voice === "string" && typeof manifest.voiceId === "string" && typeof manifest.model === "string");
for (const l of recordedLines()) {
  const p = join(ASSETS, l.file);
  check(`${l.file} exists`, existsSync(p));
  check(`${l.file} is not an empty placeholder`, existsSync(p) && statSync(p).size > 10000, existsSync(p) ? `${statSync(p).size} bytes` : "missing");
}
check("every file is referenced exactly once", new Set(recordedLines().map((l) => l.file)).size === recordedLines().length);

// ==============================================================================================
console.log("\n=== 2. EVERY RECORDED LINE IS A LINE THE APP ACTUALLY SAYS ===");
// The failure mode is a recording of an older draft: the screen would show the current sentence and
// the voice would read the old one, differing by a few words, with nothing reporting it. Matched
// character for character against persona.json.
const shipped = new Set(BOOT_SETS.flatMap((k) => bootLines(k)));
for (const l of recordedLines()) {
  check(`recorded line is in the shipped persona, character for character: "${l.text.slice(0, 45)}…"`,
    shipped.has(l.text), l.text);
}
// The reverse is deliberately NOT required — an unmatched line falls through to Piper, which is how
// the offline set works and why adding a greeting cannot break this file. But the neutral set is
// the one that was recorded, so a gap there is a mistake rather than a decision.
for (const line of persona.boot) {
  check(`the neutral boot set has audio: "${line.slice(0, 45)}…"`, recordedFor(line) !== null, line);
}
check("the offline set deliberately has NO audio and falls through to Piper",
  bootLines("offline").every((l) => recordedFor(l) === null));

// ==============================================================================================
console.log("\n=== 3. the matching rule: exact, or nothing ===");
const one = persona.boot[0];
check("an exact line matches", recordedFor(one)?.file?.endsWith(".mp3") === true);
check("leading and trailing space is tolerated", recordedFor(`  ${one}  `)?.file === recordedFor(one)?.file);
check("a DIFFERENT case does not match (a near-match is not a match)", recordedFor(one.toUpperCase()) === null);
check("a truncated line does not match", recordedFor(one.slice(0, one.length - 5)) === null);
check("an extra clause does not match", recordedFor(`${one} And another thing.`) === null);
check("an empty string does not match", recordedFor("") === null && recordedFor("   ") === null);
check("a non-string does not throw", recordedFor(null) === null && recordedFor(undefined) === null);
check("a line nobody recorded returns null rather than a guess", recordedFor("My printer won't print") === null);

// ==============================================================================================
console.log("\n=== 4. D249: a line the redaction would rewrite may NEVER be recorded ===");
// A fixed file cannot be redacted before it plays. This is the gate `say()` applies; here it is
// checked against the manifest itself, with an environment that names everything D249 hides.
const env = { computer: "WAKANDA", user: "CORP\\charles", addresses: ["192.168.1.42", "192.168.1.1"] };
for (const l of recordedLines()) {
  check(`nothing in "${l.text.slice(0, 40)}…" would be redacted`, spokenForm(l.text, env) === l.text, spokenForm(l.text, env));
}
check("the gate is in say(), not only here",
  /if \(heard === said\) \{[\s\S]{0,200}?recordedFor\(said\)/.test(readFileSync(join(CLIENT, "src/renderer/renderer.js"), "utf8")));

// ==============================================================================================
console.log("\n=== 5. the file name becomes a URL, so it stays a bare file name ===");
const evil = (file) => recordedFor("x", { enabled: true, lines: [{ text: "x", file }] });
for (const f of ["../../../etc/passwd.mp3", "..\\secrets.mp3", "/abs/path.mp3", "http://example.com/a.mp3", "a.exe", "", "a.mp3.exe"]) {
  check(`refused: ${JSON.stringify(f)}`, evil(f) === null);
}
check("a plain name is accepted", evil("matic_greeting_03_own_words.mp3")?.src === `${GREETINGS_DIR}/matic_greeting_03_own_words.mp3`);

// ==============================================================================================
console.log("\n=== 6. the off switch is complete, and it is one value ===");
check("enabled is currently true (the experiment is running)", recordedSpeechEnabled() === true);
check("enabled:false returns null for a line that otherwise matches",
  recordedFor(one, { ...manifest, enabled: false }) === null);
check("a missing `enabled` is OFF, not on by accident", recordedFor(one, { lines: manifest.lines }) === null);

// ==============================================================================================
console.log("\n=== 7. the renderer plays it, and falls back rather than going silent ===");
const src = readFileSync(join(CLIENT, "src/renderer/renderer.js"), "utf8");
check("say() consults the manifest before reaching Piper",
  src.indexOf("recordedFor(said)") > 0 && src.indexOf("recordedFor(said)") < src.indexOf("window.matic.speak(heard)"));
check("a recording that will not play returns false, and say() continues to Piper",
  /devlog\(`\[tts\] recorded line did not play[\s\S]{0,120}?return false;/.test(src));
check("playRecorded never calls the viseme driver (an MP3 has no timeline)",
  !/playRecorded[\s\S]*?driver\.speak/.test(src.slice(src.indexOf("async function playRecorded"), src.indexOf("async function say("))));
check("it sets the speaking state, which is what animates the fallback mouth",
  /async function playRecorded[\s\S]{0,400}?setState\("speaking"\)/.test(src));
// The claim the whole approach rests on, read out of the delivery's own files rather than believed.
const avatarCss = readFileSync(join(CLIENT, "src/renderer/avatar/matic-avatar.css"), "utf8");
const avatarManifest = readFileSync(join(CLIENT, "src/renderer/avatar/matic-avatar.manifest.json"), "utf8");
check("the avatar animates the `talk` mouth", /animation:\s*matic-talk\s/.test(avatarCss));
check("…and stops only when a viseme stream IS bound, which is why no timeline is needed",
  /\.mav\[data-visemes\]\s*\.mav-talk\s*\{\s*animation:\s*none/.test(avatarCss));
check("the avatar's own manifest calls `talk` the no-stream fallback",
  /'talk' is the fallback when no viseme stream is bound/.test(avatarManifest));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
