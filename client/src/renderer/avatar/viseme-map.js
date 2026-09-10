// @ts-check
/**
 * Phoneme -> mouth shape. THE TABLE THAT DRIVES THE MOUTH.
 *
 * This is the mapping that was debugged against real Piper output in the previous avatar
 * (`vendor/matic-bot-avatar.js`, 2026-09-02/03), moved here VERBATIM when the SVG chassis replaced
 * it on 2026-09-10. It was not replaced by the manifest's `phonemeToMouth`, and the reason is
 * recorded rather than assumed:
 *
 *   The manifest's table is in eSpeak-ng ASCII mnemonics (`T`, `D`, `S`, `tS`, `3:`, `@U`).
 *   The client's Piper path does NOT emit those. `scripts/piper_worker.py` reads the alignments
 *   `PiperVoice.synthesize_wav(include_alignments=True)` returns, and those carry IPA
 *   (`θ ð ʃ tʃ ɜː əʊ`), with stress and length marks merged into the preceding phoneme. This table
 *   carries BOTH notations, so hand-authored ASCII timelines and real Piper timelines both resolve;
 *   the manifest's would resolve every IPA consonant and long vowel to `closed`.
 *
 *   `scripts/compare-phoneme-maps.mjs` runs real product strings through Piper and compares the two
 *   tables phoneme by phoneme; the avatar integration handover of 2026-09-10 records the result.
 *   test/avatar.test.mjs pins that this table, not the manifest's, is the one the element imports.
 *
 * Flat lookup, built once at load. The buckets are the readable form; PHONEME_MAP is what runs at
 * speech rate.
 */
import { manifestMouthFor } from "./avatar-model.js";

export const SHAPES = ["closed", "narrow", "wideFlat", "roundSmall", "roundLarge", "open"];

export const PHONEME_BUCKETS = {
  // Each bucket lists the ASCII stand-ins used by hand-authored demo data (v4's showcase page)
  // alongside the real IPA characters espeak-ng/Piper actually emit — confirmed by running Piper
  // with alignment extraction and inspecting its raw phoneme output directly (not assumed).
  //
  // 2026-09-10 ADDITIONS, FROM MEASUREMENT (`npm.cmd run avatar:compare`, 732 phonemes of real
  // product strings through en_US-amy-low): Piper emits length marks as their OWN alignment rows
  // and piper_worker.py merges their duration into the preceding phoneme — so the key that reaches
  // this table is the BARE vowel. `ɜː` here was therefore never matched; what arrives is `ɜ`, and
  // it fell to `closed` for the whole stressed syllable of "work", "person", "thirty". Same for
  // `ɔ` (bare), `ɚ` (r-coloured schwa: "spooler", "adapter"), `ᵻ` (reduced i: "restart", "renew")
  // and `ʲ` (a palatal glide with real duration). Diphthongs arrive split too (`a ɪ`, `o ʊ`), which
  // already resolved through their halves. The combined-character entries are kept: they are what
  // a hand-authored timeline or a different worker would send, and they cost nothing.
  closed: ["p", "b", "m", "_", "", "sil"],
  narrow: ["f", "v", "s", "z", "T", "D", "θ", "ð", "t", "d", "n", "l", "ɾ", "ts", "dz"],
  wideFlat: ["e", "E", "ɛ", "eI", "S", "ʃ", "Z", "ʒ", "tS", "tʃ", "dZ", "dʒ", "k", "g", "ɡ", "N", "ŋ", "i", "i:", "iː", "I", "ɪ", "j", "ᵻ", "ʲ"],
  roundSmall: ["u", "U", "ʊ", "u:", "uː", "w", "r", "ɹ", "3:", "ɜː", "ɜ", "ɚ", "@", "ə"],
  roundLarge: ["o", "O", "ɔː", "ɔ", "o:", "OI", "ɔɪ", "oU", "oʊ", "ɒ"],
  open: ["a", "A", "ɑ", "ɑː", "a:", "aI", "aɪ", "aU", "aʊ", "V", "ʌ", "h", "æ", "ɐ"]
};
export const PHONEME_MAP = {};
for (const shape in PHONEME_BUCKETS) for (const p of PHONEME_BUCKETS[shape]) PHONEME_MAP[p] = shape;

export const OVR_MAP = {
  sil: "closed", PP: "closed", nn: "narrow", FF: "narrow", SS: "narrow",
  TH: "narrow", DD: "narrow", kk: "wideFlat", ih: "wideFlat", E: "wideFlat",
  CH: "wideFlat", RR: "roundSmall", ou: "roundSmall", oh: "roundLarge", aa: "open"
};

/**
 * A viseme id -> one of the six shapes, or null for "no override". Accepts a shape name directly,
 * a legacy OVR id, or a phoneme in either notation. Unknown -> `closed`, deliberately: a closed
 * mouth on an unrecognised phoneme is a short gap, where a fallback to "open" would be a flap.
 * @param {string | null | undefined} v
 * @returns {string | null}
 */
export function resolveViseme(v) {
  if (!v || v === "auto") return null;
  if (SHAPES.indexOf(v) >= 0) return v;
  if (OVR_MAP[v]) return OVR_MAP[v];
  if (PHONEME_MAP[v]) return PHONEME_MAP[v];
  return "closed";
}

/** True when `v` resolves through this table by a real entry rather than the `closed` fallback. */
export function isKnownViseme(v) {
  return Boolean(v) && (SHAPES.includes(v) || Object.hasOwn(OVR_MAP, v) || Object.hasOwn(PHONEME_MAP, v));
}

/**
 * The §3 comparison for ONE phoneme: what this table says, what the manifest's says, and whether
 * they agree. Used by scripts/compare-phoneme-maps.mjs over real Piper output; never on the speech
 * path, which must not do two lookups per phoneme.
 * @param {string} phoneme
 */
export function compareWithManifest(phoneme) {
  const existing = resolveViseme(phoneme) ?? "closed";
  const m = manifestMouthFor(phoneme);
  return {
    phoneme,
    existing,
    existingKnown: isKnownViseme(phoneme),
    manifest: m.shape,
    manifestKnown: m.known,
    agree: existing === m.shape,
  };
}
