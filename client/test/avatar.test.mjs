/**
 * The bust avatar integration. D232, 2026-09-10.
 *
 * Run: node test/avatar.test.mjs        (from client/; part of `npm test`)
 *
 * The renderer cannot be seen from here - no headless test can look at a screen, and
 * client/docs/AVATAR-RENDERER-CHECK.md is the click-through for that. What CAN be pinned headless
 * is everything the avatar handover asked to be true by construction:
 *
 *   1. The state table is READ FROM THE MANIFEST, not transcribed. The model module and the element
 *      contain no state literals; the twelve states are whatever the JSON says today.
 *   2. The delivered CSS agrees with the manifest on every eye/mouth pairing (the CSS comment says
 *      "must not drift from it"; this is what makes that sentence true).
 *   3. The generated assets module is current with the delivered SVG and CSS.
 *   4. The manifest's size rules are ENFORCED: escalating is refused under 96, ingest is parked,
 *      nothing renders below the floor, accept warns under 96.
 *   5. THE MOUTH IS DRIVEN BY THE DEBUGGED MAPPING, not the manifest's table - and the reason is
 *      pinned as a fact about the two tables rather than as an opinion.
 *   6. The decline path sets `declining`, and the previous element is gone.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MANIFEST, STATES, VISEME_SHAPES, DEFAULT_STATE, stateSpec, isParked, cropFor, renderDecision,
  trayReadFor, resolvesAfterMs, manifestMouthFor, manifestPhonemeKeys,
} from "../src/renderer/avatar/avatar-model.js";
import { resolveViseme, isKnownViseme, compareWithManifest, PHONEME_MAP, SHAPES } from "../src/renderer/avatar/viseme-map.js";
import { assetsModuleIsCurrent } from "../scripts/build-avatar-assets.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT = resolve(HERE, "..");
const AVATAR = join(CLIENT, "src/renderer/avatar");
const read = (p) => readFileSync(p, "utf8");

let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}
/** Strip comments so a state name in prose does not count as a literal in code. */
function jsCode(js) {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .map((l) => l.replace(/\s\/\/.*$/, ""))
    .join("\n");
}

// ==============================================================================================
console.log("=== 1. the manifest is the source of truth ===");
const manifestOnDisk = JSON.parse(read(join(AVATAR, "matic-avatar.manifest.json")));
check("STATES is exactly the manifest's state keys, in order", JSON.stringify(STATES) === JSON.stringify(Object.keys(manifestOnDisk.states)));
check("twelve states", STATES.length === 12, `got ${STATES.length}`);
check("declining exists, round eyes, narrow mouth (v6 item 2)", stateSpec("declining")?.eyes === "round" && stateSpec("declining")?.mouth === "narrow");
check("declining is a needsYou tray read", trayReadFor("declining").read === "needsYou");
check("ingest is parked", isParked("ingest") === true);
check("'happy' is recorded as v7's 'arc-up' in the manifest (handover §4 - already there, not added)",
  JSON.stringify(manifestOnDisk.$comment_shapes ?? []).includes("arc-up") && manifestOnDisk.eyeShapes.includes("happy"));

// The separation rule: no two DELIVERED states share both eyes and mouth unless the manifest says
// so and names how they are told apart.
const pairs = new Map();
for (const s of STATES) {
  if (isParked(s)) continue;
  const spec = stateSpec(s);
  const key = `${spec.eyes}+${spec.mouth}`;
  pairs.set(key, [...(pairs.get(key) ?? []), s]);
}
for (const [key, names] of pairs) {
  if (names.length < 2) continue;
  const declared = names.every((n) => {
    const spec = stateSpec(n);
    return spec.uniquePairing === false && typeof spec.separatedBy === "string" && names.filter((m) => m !== n).every((m) => (spec.sharesPairingWith ?? []).includes(m));
  });
  check(`shared pairing ${key} (${names.join(", ")}) is declared with separatedBy on every member`, declared);
}

const modelCode = jsCode(read(join(AVATAR, "avatar-model.js")));
const elementCode = jsCode(read(join(AVATAR, "matic-avatar-element.js")));
for (const s of STATES) {
  if (s === DEFAULT_STATE) continue;
  const lit = new RegExp(`["'\`]${s}["'\`]`);
  check(`no "${s}" literal in avatar-model.js`, !lit.test(modelCode));
  check(`no "${s}" literal in matic-avatar-element.js`, !lit.test(elementCode));
}
check("the only state literal in the model is the manifest's default (idle)", (modelCode.match(/"idle"/g) ?? []).length >= 1);
check("the element imports the manifest through the model, never the JSON directly", !/manifest\.json/.test(elementCode));

// ==============================================================================================
console.log("\n=== 2. the delivered CSS agrees with the manifest on every pairing ===");
const css = read(join(AVATAR, "matic-avatar.css"));
for (const s of STATES) {
  const spec = stateSpec(s);
  const eyeRule = new RegExp(`\\.mav\\[data-state="${s}"\\] \\.mav-eyes:not\\(\\[data-shape\\]\\)\\s*>\\s*\\.eye-shape\\[data-shape="([a-zA-Z]+)"\\]`);
  const mouthRule = new RegExp(`\\.mav\\[data-state="${s}"\\] \\.mav-mouth:not\\(\\[data-shape\\]\\)\\s*>\\s*\\.mouth-shape\\[data-shape="([a-zA-Z]+)"\\]`);
  const eye = css.match(eyeRule)?.[1];
  const mouth = css.match(mouthRule)?.[1];
  check(`css ${s}: eyes ${eye} / mouth ${mouth} match manifest ${spec.eyes} / ${spec.mouth}`, eye === spec.eyes && mouth === spec.mouth);
}
const svg = read(join(AVATAR, "matic-avatar.svg"));
for (const e of manifestOnDisk.eyeShapes) check(`svg has an eye shape "${e}"`, new RegExp(`class="eye-shape[^"]*"[^>]*data-shape="${e}"|data-shape="${e}"[^>]*class="eye-shape[^"]*"`).test(svg));
for (const m of manifestOnDisk.mouthShapes) check(`svg has a mouth shape "${m}"`, new RegExp(`class="mouth-shape[^"]*"[^>]*data-shape="${m}"|data-shape="${m}"[^>]*class="mouth-shape[^"]*"`).test(svg));
const svgBody = svg.replace(/<metadata>[\s\S]*?<\/metadata>/, "");
check("svg carries no bare hex colour outside a var() fallback", !/(?<!var\(--matic-avatar-[a-z-]+,\s*)#[0-9a-fA-F]{3,8}\b(?![^<>]*\))/.test(svgBody));
// url(#...) is an internal clip-path reference, which is fine; anything else url() points at is not.
check("svg has no raster, external or filter reference", !/<image|href="http|<filter|url\((?!#)/.test(svgBody));

// ==============================================================================================
console.log("\n=== 3. the generated assets module is current ===");
check("matic-avatar.assets.js matches matic-avatar.svg + matic-avatar.css (run `npm.cmd run avatar:build` if not)", assetsModuleIsCurrent());
check("the element reads the chassis from the generated module", /from "\.\/matic-avatar\.assets\.js"/.test(elementCode));

// ==============================================================================================
console.log("\n=== 4. size rules are enforced, not documented ===");
check("crop: 200 and 96 are full bust", cropFor(200)?.crop === "fullBust" && cropFor(96)?.crop === "fullBust");
check("crop: 95, 64, 44, 32 are the head crop with the manifest's fixed source box", [95, 64, 44, 32].every((s) => cropFor(s)?.crop === "head" && cropFor(s)?.viewBox === manifestOnDisk.crop.head.viewBox));
check("crop: below the floor is null (use the tray dot)", cropFor(31) === null && cropFor(16) === null);
const esc64 = renderDecision("escalating", 64);
check("escalating at 64px is REFUSED and falls back to idle with a warning", esc64.refused && esc64.state === DEFAULT_STATE && esc64.warnings.length === 1 && /96px/.test(esc64.warnings[0]));
check("escalating at 96px renders", renderDecision("escalating", 96).refused === false);
const acc64 = renderDecision("accept", 64);
check("accept at 64px renders but WARNS (degradedBelow 96)", !acc64.refused && acc64.state === "accept" && acc64.warnings.length === 1);
check("accept at 44px is refused (minSize 64)", renderDecision("accept", 44).refused === true);
check("ingest is refused at any size (parked)", renderDecision("ingest", 200).refused && renderDecision("ingest", 200).state === DEFAULT_STATE);
check("an unknown state is refused to idle, never thrown", renderDecision("nope", 200).refused && renderDecision("nope", 200).state === DEFAULT_STATE);
check("below the floor: state null, refused", renderDecision("idle", 24).state === null && renderDecision("idle", 24).refused);
check("every non-parked state renders at 200px with no warning", STATES.filter((s) => !isParked(s)).every((s) => { const d = renderDecision(s, 200); return !d.refused && d.warnings.length === 0; }));
check("greeting's nod resolves after 3000 ms (1500 x 2), idle's breathe never does", resolvesAfterMs("greeting") === 3000 && resolvesAfterMs("idle") === null);

// ==============================================================================================
console.log("\n=== 5. the mouth is driven by the debugged mapping, and the reason is a fact ===");
check("viseme-map exposes the six manifest viseme shapes", JSON.stringify(SHAPES) === JSON.stringify(VISEME_SHAPES));
check("the element imports resolveViseme from viseme-map.js", /from "\.\/viseme-map\.js"/.test(elementCode) && /resolveViseme/.test(elementCode));
check("the element does NOT drive the mouth from the manifest's table", !/manifestMouthFor/.test(elementCode));

// What piper_worker.py actually emits: IPA (see its MODIFIERS comment). This is the distinct
// non-ASCII set OBSERVED on 2026-09-10 by `npm.cmd run avatar:compare` - 732 phonemes over six
// product strings through en_US-amy-low. Note what is NOT in it: no `ɜː`, `iː`, `aɪ`, `oʊ` - length
// marks arrive as their own rows and are merged by the worker, and diphthongs arrive as two rows,
// so the key that reaches the table is always a single bare symbol. Every one below must resolve by
// a real entry; five of them (ɜ ɚ ɔ ᵻ ʲ) did not until that run, and were added from it.
const PIPER_IPA = ["ɪ", "æ", "ɛ", "ɹ", "ə", "ð", "ʌ", "ʊ", "θ", "ŋ", "ɐ", "ʃ", "ɜ", "ɚ", "ɾ", "ɡ", "ʒ", "ɑ", "ɔ", "ᵻ", "ʲ"];
// Boundaries and punctuation Piper also emits, which SHOULD fall to closed in both tables.
for (const p of ["^", "$", ".", ",", "?", " "]) check(`boundary ${JSON.stringify(p)} -> closed, unknown in both tables (correct)`, resolveViseme(p) === "closed" && !isKnownViseme(p) && !manifestMouthFor(p).known);
for (const p of PIPER_IPA) check(`existing table knows IPA ${p} -> ${resolveViseme(p)}`, isKnownViseme(p));
const manifestKnowsIpa = PIPER_IPA.filter((p) => manifestMouthFor(p).known);
check(`the manifest's table knows NONE of those IPA symbols (it is eSpeak ASCII) - which is why it does not drive the mouth`, manifestKnowsIpa.length === 0, `knows: ${manifestKnowsIpa.join(" ")}`);
check("unknown phoneme -> closed in both tables", resolveViseme("ⓧ") === "closed" && manifestMouthFor("ⓧ").shape === "closed");

// Where BOTH tables know a key, they must agree - otherwise one of them is wrong and the comparison
// script has to say which. Zero disagreements is the finding recorded on 2026-09-10.
const bothKnown = manifestPhonemeKeys().filter((k) => isKnownViseme(k));
const disagreements = bothKnown.map(compareWithManifest).filter((c) => !c.agree);
check(`the two tables agree on every key both know (${bothKnown.length} keys)`, disagreements.length === 0, JSON.stringify(disagreements));
const onlyManifest = manifestPhonemeKeys().filter((k) => !isKnownViseme(k));
check(`keys only the manifest knows are recorded (${onlyManifest.length}): ${onlyManifest.join(" ") || "none"}`, true);
const onlyExisting = Object.keys(PHONEME_MAP).filter((k) => !manifestMouthFor(k).known);
check(`keys only the existing table knows are the IPA ones (${onlyExisting.length})`, onlyExisting.length > 0 && onlyExisting.every((k) => /[^\x00-\x7f]/.test(k) || ["3:"].includes(k)), onlyExisting.filter((k) => !/[^\x00-\x7f]/.test(k)).join(" "));

// ==============================================================================================
console.log("\n=== 6. the app is wired to it ===");
const renderer = jsCode(read(join(CLIENT, "src/renderer/renderer.js")));
const html = read(join(CLIENT, "src/renderer/index.html"));
check("index.html mounts <matic-avatar>, not the old element", /<matic-avatar\b/.test(html) && !/<matic-bot-avatar/.test(html));
check("index.html loads the element module", /avatar\/matic-avatar-element\.js/.test(html));
check("the old CSS-div element is gone", !existsSync(join(CLIENT, "src/renderer/vendor/matic-bot-avatar.js")));
check("the decline path sets declining (the point of the pass)", /setState\("declining"\)/.test(renderer));
check("a failed fix is apologising, not error (v7 placement rule)", !/setState\("error"\);\s*await say\(exec\.message/.test(renderer));
check("the state label follows the element's statechange event (the TTS bypass is closed)", /statechange/.test(renderer));
check("the viseme driver's stale NOT VERIFIED note is gone", !/NOT VERIFIED/.test(read(join(CLIENT, "src/renderer/vendor/tts-viseme-driver.js"))));
check("the delivered harness is on disk beside the sources", existsSync(join(AVATAR, "matic-avatar-harness.html")));
check("the element check page is on disk", existsSync(join(AVATAR, "avatar-check.html")));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
