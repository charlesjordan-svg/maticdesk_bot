// @ts-check
/**
 * The avatar's state model, READ FROM THE MANIFEST. No DOM in this file, so it runs in Node for
 * the tests and in the renderer for the element.
 *
 * `matic-avatar.manifest.json` is the source of truth for the twelve states, the crop bands, the
 * size floors and the phoneme table (BUST AVATAR SPECIFICATION v7, delivered 2026-09-09). This
 * module has NO state literals of its own beyond the two the manifest itself designates as
 * fallbacks (`idle` as the default state, `closed` as the unknown-phoneme mouth) — a hand-copied
 * state table is the failure the manifest exists to prevent, for the same reason the capability
 * answer is generated from the catalog and not typed (D212).
 *
 * If a name in here is not in the manifest, the manifest is wrong or the name is; do not add the
 * name here.
 */
import manifest from "./matic-avatar.manifest.json" with { type: "json" };

export const MANIFEST = manifest;

/** The twelve state names, in manifest order. `ingest` is among them and is PARKED (see isParked). */
export const STATES = Object.freeze(Object.keys(manifest.states));

/** The six mouth shapes a phoneme can resolve to. The other three (smile, grin, talk) are state mouths. */
export const VISEME_SHAPES = Object.freeze(Object.keys(manifest.phonemeToMouth).filter((k) => !k.startsWith("$")));

export const DEFAULT_STATE = "idle";
const UNKNOWN_PHONEME_MOUTH = "closed";

/** @param {string} name */
export function stateSpec(name) {
  return Object.hasOwn(manifest.states, name) ? manifest.states[name] : null;
}

/** @param {string} name */
export function isParked(name) {
  return stateSpec(name)?.parked === true;
}

/**
 * Which crop a mount of `size` pixels gets. Below the floor the manifest says not to render the
 * avatar at all (use the tray dot), so this returns null there.
 *
 * The head crop applies below the smallest full-bust size the manifest lists (96), which is what the
 * delivered harness does too. Note `placement.do` says "crop to the head below 64px" while
 * `crop.head.sizes` lists 64 under the head crop — the crop table is the operative one here and the
 * disagreement is recorded in the integration handover rather than resolved in code.
 *
 * @param {number} size
 * @returns {{ crop: "fullBust" | "head", viewBox: string } | null}
 */
export function cropFor(size) {
  const { crop } = manifest;
  if (!Number.isFinite(size) || size < crop.floor) return null;
  const smallestFullBust = Math.min(...crop.fullBust.sizes);
  if (size < smallestFullBust) return { crop: "head", viewBox: crop.head.viewBox };
  return { crop: "fullBust", viewBox: crop.fullBust.viewBox };
}

/**
 * What to actually render for a requested state at a given size, and every warning that decision
 * carries. This is where the manifest's `minSize`, `degradedBelow`, `parked` and `belowFloor` rules
 * are ENFORCED rather than documented — v7 §05's misuse row asks for a console warning, and the
 * client refusing the state is the manifest's own instruction for `escalating` under 96px.
 *
 * Refusal falls back to `idle`, the manifest's default, never to a "nearest" state: a substitute
 * that looks nearly right is the wrong-answer-in-the-right-shape class of failure this project keeps
 * a list of.
 *
 * @param {string} requested
 * @param {number} size
 * @returns {{ state: string | null, refused: boolean, warnings: string[] }}
 */
export function renderDecision(requested, size) {
  const warnings = [];
  if (cropFor(size) === null) {
    warnings.push(`avatar: ${size}px is below the ${manifest.crop.floor}px floor - ${manifest.crop.belowFloor}`);
    return { state: null, refused: true, warnings };
  }
  const spec = stateSpec(requested);
  if (!spec) {
    warnings.push(`avatar: "${requested}" is not a state in the manifest (${STATES.join(", ")}); rendering ${DEFAULT_STATE}`);
    return { state: DEFAULT_STATE, refused: true, warnings };
  }
  if (spec.parked) {
    warnings.push(`avatar: "${requested}" is PARKED in the manifest and not delivered; rendering ${DEFAULT_STATE}`);
    return { state: DEFAULT_STATE, refused: true, warnings };
  }
  if (typeof spec.minSize === "number" && size < spec.minSize) {
    warnings.push(`avatar: "${requested}" needs ${spec.minSize}px and this mount is ${size}px - refused, rendering ${DEFAULT_STATE}. ${spec.constraint ?? spec.separatedBy ?? ""}`.trim());
    return { state: DEFAULT_STATE, refused: true, warnings };
  }
  if (typeof spec.degradedBelow === "number" && size < spec.degradedBelow) {
    warnings.push(`avatar: "${requested}" is legible but weak below ${spec.degradedBelow}px (${size}px here). ${spec.separatedBy ?? ""}`.trim());
  }
  return { state: requested, refused: false, warnings };
}

/**
 * The tray read a state maps to: resting / working / needsYou / unavailable / none. There is no
 * tray icon in the client yet (audit §1.3 of the avatar handover); this is exported so the day one
 * exists it reads the manifest rather than a second table.
 * @param {string} name
 */
export function trayReadFor(name) {
  const read = stateSpec(name)?.trayRead ?? "resting";
  return { read, ...(manifest.trayReads[read] ?? {}) };
}

/**
 * A rig motion that RESOLVES (greeting's nod) rather than loops: how long until it is done, so the
 * element can fall the state back to idle as the manifest asks. Null for looping motions.
 * @param {string} name
 * @returns {number | null} milliseconds
 */
export function resolvesAfterMs(name) {
  const spec = stateSpec(name);
  const motion = spec?.rigMotion ? manifest.motion[spec.rigMotion] : null;
  if (!motion || motion.resolvesToRest !== true) return null;
  const iterations = typeof motion.iterations === "number" ? motion.iterations : 1;
  return motion.durationMs * iterations;
}

// The manifest's phoneme table, keyed BY SHAPE with phoneme arrays. Inverted ONCE here into the
// flat lookup its own comment asks for ("indexed every few milliseconds - keep it a flat lookup"),
// plus the legacy OVR ids. This is the table the §3 comparison runs against; it is NOT what drives
// the mouth - see viseme-map.js for which table does and why.
const MANIFEST_PHONEME_LOOKUP = new Map();
for (const [shape, phonemes] of Object.entries(manifest.phonemeToMouth)) {
  if (shape.startsWith("$")) continue;
  for (const p of phonemes) MANIFEST_PHONEME_LOOKUP.set(p, shape);
}
for (const [ovr, shape] of Object.entries(manifest.ovrToMouth)) {
  if (ovr.startsWith("$")) continue;
  if (!MANIFEST_PHONEME_LOOKUP.has(ovr)) MANIFEST_PHONEME_LOOKUP.set(ovr, shape);
}

/**
 * Mouth shape for a phoneme ACCORDING TO THE MANIFEST. Unknown resolves to `closed`, as the
 * manifest specifies.
 * @param {string} phoneme
 * @returns {{ shape: string, known: boolean }}
 */
export function manifestMouthFor(phoneme) {
  const shape = MANIFEST_PHONEME_LOOKUP.get(phoneme);
  return shape ? { shape, known: true } : { shape: UNKNOWN_PHONEME_MOUTH, known: false };
}

/** Every phoneme key the manifest table knows, for the comparison. */
export function manifestPhonemeKeys() {
  return [...MANIFEST_PHONEME_LOOKUP.keys()];
}
