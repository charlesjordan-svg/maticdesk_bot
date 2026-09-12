// @ts-check
import manifest from "../../assets/greetings/greetings.manifest.json" with { type: "json" };

/**
 * IS THERE A RECORDING FOR THIS SENTENCE? D263, 2026-09-11.
 *
 * Pure and separate for the reason `spoken-form.js` is: `renderer.js` touches `document` at module
 * scope, so nothing in it can be reached by a headless test, and the matching rule is exactly the
 * part that needs one.
 *
 * ==============================================================================================
 * EXACT TEXT, NEVER AN INDEX, AND NEVER A FUZZY MATCH
 * ==============================================================================================
 *
 * `persona.boot` is ORDERED, because the list is rotated in order (persona rule 4). Somebody will
 * reorder it. An index-keyed manifest would then play one recording while the transcript shows a
 * different sentence — **the avatar saying something other than what is on screen**, which is the
 * one failure this whole file exists to make impossible.
 *
 * So the key is the line's exact display text, and the match is exact. **No trimming beyond the
 * ends, no case folding, no punctuation normalisation.** A near-match is not a match: a recording
 * of an older draft is worse than Piper reading the current one, because the screen and the voice
 * would disagree by a few words and nothing would report it.
 *
 * **An unmatched line is not an error.** It falls through to Piper, which is why the offline
 * greeting set needs no entry, why adding a greeting cannot break this, and why `enabled: false`
 * is a complete off switch rather than a code path.
 */

/** @typedef {{ text: string, file: string, seconds?: number }} RecordedLine */

/** Where the files sit, relative to `index.html` — the renderer is loaded from `src/renderer/`. */
export const GREETINGS_DIR = "../../assets/greetings";

/**
 * The recording for a sentence, or null.
 *
 * @param {string} text  the DISPLAY text, exactly as the transcript shows it
 * @param {any} [m]      the manifest; injectable so a test can drive shapes that do not ship
 * @returns {{ file: string, src: string, seconds: number|null } | null}
 */
export function recordedFor(text, m = manifest) {
  if (!m || m.enabled !== true) return null;
  const want = String(text ?? "").trim();
  if (!want) return null;
  const lines = Array.isArray(m.lines) ? m.lines : [];
  const hit = lines.find((l) => l && typeof l.text === "string" && l.text.trim() === want);
  if (!hit || typeof hit.file !== "string" || !hit.file) return null;
  // A file name is data from a file, and this one becomes a URL. Keep it a bare name: no traversal,
  // no absolute path, no scheme. The manifest is ours, so this is a guard against a mistake rather
  // than against an attacker — but a mistake here loads something the app never meant to play.
  if (!/^[A-Za-z0-9._-]+\.mp3$/.test(hit.file) || hit.file.includes("..")) return null;
  return {
    file: hit.file,
    src: `${GREETINGS_DIR}/${hit.file}`,
    seconds: Number.isFinite(hit.seconds) ? hit.seconds : null,
  };
}

/** Every line the manifest claims to have a recording for. For tests and for the developer log. */
export function recordedLines(m = manifest) {
  return (Array.isArray(m?.lines) ? m.lines : []).filter((l) => l && typeof l.text === "string");
}

/** Whether recorded speech is switched on at all. The one toggle; see the manifest's comment. */
export function recordedSpeechEnabled(m = manifest) {
  return Boolean(m?.enabled);
}

export { manifest as greetingsManifest };
