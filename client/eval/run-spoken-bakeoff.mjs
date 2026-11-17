// @ts-check
/**
 * THE TRANSCRIPT BAKEOFF (v2, 2026-11-16).
 *
 * docs/handovers/2026-11-16-claude-code-handover-nuance-live-persona.md §5.1. The 40 cases in
 * eval/cases.json were TYPED. v2's input is SPEECH. This asks one question and answers it with a
 * number: does the endpoint's own routing - `routeTier0()` then `classify()`, in the order
 * `Agent.propose()` runs them - land a spoken form of a sentence where it lands the typed one?
 *
 * NO MODEL IS CALLED AND NONE IS NEEDED. Both functions are local and deterministic, which is the
 * whole reason this can gate everything else: a routing shift here happens before any provider is
 * asked anything.
 *
 * It drives the SHIPPING functions, imported from src/, in the SHIPPING order, with the SHIPPING
 * threshold - the same rule run-bakeoff.mjs states for itself. A harness with its own copy of the
 * routing measures the harness.
 *
 * TWO METHODS, and a result says which produced it:
 *
 *   node eval/run-spoken-bakeoff.mjs
 *       METHOD A - hand-written spoken-form variants (eval/spoken-cases.json). Four kinds per
 *       case. THREE are the headline (disfluent, long, vocative: 120 sentences). The fourth,
 *       `asked`, changes grammatical mood and is reported apart.
 *
 *   node eval/run-spoken-bakeoff.mjs --asr eval/results/<file>.json
 *       METHOD B - real speech-to-text output, produced by eval/asr-roundtrip.py: every sentence
 *       synthesised by Piper and transcribed by faster-whisper. REAL ASR, SYNTHETIC SPEAKER - not
 *       a person, not a laptop microphone, and NOT Nuance's recogniser, which nobody here has
 *       seen the output of. Read its numbers as a floor on the damage, never as the damage.
 *
 * WHAT COUNTS AS "THE SAME". The routing outcome before any provider call:
 *     tier0:<capability>            tier-0 matched at or above the threshold; no model is asked
 *     classify:<kind>[/<subkind>]   what classify() made of it
 * Two sentences that reach the same outcome take the same path through the product. The
 * capability's PARAMETERS are part of a tier-0 outcome, because a right capability on the wrong
 * adapter is not the same answer.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "../src/router/classify.js";
import { routeTier0, TIER0_CONFIDENCE_THRESHOLD } from "../src/router/tier0.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const asrPath = opt("asr", null);
const outPath = opt("out", null);
const quiet = argv.includes("--quiet");

const cases = JSON.parse(readFileSync(join(HERE, "cases.json"), "utf8")).cases;
const states = JSON.parse(readFileSync(join(HERE, "states.json"), "utf8")).states;
const spoken = JSON.parse(readFileSync(join(HERE, "spoken-cases.json"), "utf8"));

/** The kinds that make up the headline delta. `asked` is not one of them - see spoken-cases.json. */
export const HEADLINE_KINDS = ["disfluent", "long", "vocative"];

/**
 * What the endpoint does with a sentence before any provider is called. Mirrors
 * `Agent.propose()` (src/agent/agent.js): tier-0 first, and only a confident tier-0 skips
 * `classify()`.
 *
 * @param {string} text
 * @param {any} probe
 */
export function route(text, probe) {
  const local = routeTier0(text, probe);
  if (local && local.proposal.confidence >= TIER0_CONFIDENCE_THRESHOLD) {
    const params = JSON.stringify(local.proposal.parameters ?? {});
    return { key: `tier0:${local.proposal.capabilityId}${params === "{}" ? "" : params}`, why: `tier-0 at ${local.proposal.confidence}` };
  }
  const k = /** @type {any} */ (classify(text));
  return { key: `classify:${k.kind}${k.subkind ? `/${k.subkind}` : ""}`, why: k.why };
}

function tally(rows) {
  const differing = rows.filter((r) => r.differs);
  return { n: rows.length, differing: differing.length, rows: differing };
}

const baseline = new Map();
for (const c of cases) {
  const probe = states[c.state];
  if (!probe) throw new Error(`case ${c.id} names state "${c.state}", which eval/states.json does not have`);
  baseline.set(c.id, { probe, typed: c.text, ...route(c.text, probe) });
}
for (const id of Object.keys(spoken.variants)) {
  if (!baseline.has(id)) throw new Error(`spoken-cases.json has variants for "${id}", which is not a case`);
}
for (const c of cases) {
  if (!spoken.variants[c.id]) throw new Error(`case ${c.id} has no spoken variants`);
}

const report = { generatedAt: new Date().toISOString(), threshold: TIER0_CONFIDENCE_THRESHOLD, method: asrPath ? "B-real-asr" : "A-hand-written", sections: {} };
const say = (...a) => { if (!quiet) console.log(...a); };

// ---- METHOD A ---------------------------------------------------------------------------------
if (!asrPath) {
  const rows = [];
  for (const c of cases) {
    const b = baseline.get(c.id);
    for (const [kind, text] of Object.entries(spoken.variants[c.id])) {
      const r = route(text, b.probe);
      rows.push({ id: c.id, kind, typed: b.typed, typedOutcome: b.key, text, outcome: r.key, why: r.why, differs: r.key !== b.key });
    }
  }
  const headline = tally(rows.filter((r) => HEADLINE_KINDS.includes(r.kind)));
  const asked = tally(rows.filter((r) => r.kind === "asked"));
  report.sections.headline = headline;
  report.sections.asked = asked;
  report.sections.byKind = Object.fromEntries([...HEADLINE_KINDS, "asked"].map((k) => [k, (({ n, differing }) => ({ n, differing }))(tally(rows.filter((r) => r.kind === k)))]));

  const probes = spoken.vocativeProbes.probes.map((text) => ({ text, ...route(text, states.healthy) }));
  report.sections.vocativeProbesTyped = probes;

  say(`METHOD A - hand-written spoken-form variants. ${cases.length} cases.`);
  say(`\nHEADLINE (disfluent + long + vocative): ${headline.differing} of ${headline.n} route differently from the typed sentence.`);
  for (const k of HEADLINE_KINDS) say(`   ${k.padEnd(10)} ${report.sections.byKind[k].differing} of ${report.sections.byKind[k].n}`);
  for (const r of headline.rows) say(`   - ${r.id} [${r.kind}] ${r.typedOutcome}  ->  ${r.outcome}\n       "${r.text}"\n       ${r.why}`);
  say(`\nASKED (the same complaint as a spoken question - reported apart): ${asked.differing} of ${asked.n} route differently.`);
  for (const r of asked.rows) say(`   - ${r.id} ${r.typedOutcome}  ->  ${r.outcome}\n       "${r.text}"\n       ${r.why}`);
  say(`\nVOCATIVE PROBES, as typed (every one should be social):`);
  for (const p of probes) say(`   ${p.key.padEnd(28)} "${p.text}"`);
}

// ---- METHOD B ---------------------------------------------------------------------------------
if (asrPath) {
  const asr = JSON.parse(readFileSync(isAbsolute(asrPath) ? asrPath : join(process.cwd(), asrPath), "utf8"));
  report.asr = { file: asrPath, tts: asr.tts, models: asr.models, producedAt: asr.producedAt };
  say(`METHOD B - real ASR output. Speaker: ${asr.tts}. Recognisers: ${asr.models.join(", ")}.`);

  for (const model of asr.models) {
    const rows = [];
    for (const item of asr.items.filter((i) => i.set === "case")) {
      const b = baseline.get(item.id);
      const heard = item.heard[model];
      const asSaid = route(item.said, b.probe);     // the sentence as written, through the router
      const asHeard = route(heard, b.probe);        // what the recogniser made of it, through the router
      rows.push({
        id: item.id, kind: item.kind, said: item.said, heard,
        typedOutcome: b.key, saidOutcome: asSaid.key, heardOutcome: asHeard.key, why: asHeard.why,
        // THE ASR'S OWN EFFECT: same words in, did transcription alone move the route?
        differs: asHeard.key !== asSaid.key,
        // END TO END: against the typed original, which is what the 40-case bakeoff measured.
        differsFromTyped: asHeard.key !== b.key,
        textChanged: normaliseForCompare(heard) !== normaliseForCompare(item.said),
      });
    }
    const typedOnly = rows.filter((r) => r.kind === "typed");
    const headlineRows = rows.filter((r) => HEADLINE_KINDS.includes(r.kind));
    const section = {
      typedThroughAsr: { ...tally(typedOnly), wordsChanged: typedOnly.filter((r) => r.textChanged).length },
      headlineAsrEffect: { ...tally(headlineRows), wordsChanged: headlineRows.filter((r) => r.textChanged).length },
      headlineEndToEnd: (() => { const d = headlineRows.filter((r) => r.differsFromTyped); return { n: headlineRows.length, differing: d.length, rows: d }; })(),
    };

    const probeRows = asr.items.filter((i) => i.set === "probe").map((item) => {
      const heard = item.heard[model];
      const a = route(item.said, states.healthy), h = route(heard, states.healthy);
      return { said: item.said, heard, saidOutcome: a.key, heardOutcome: h.key, differs: a.key !== h.key, nameSurvived: /\bmatic\b/i.test(heard) };
    });
    section.vocativeProbes = { n: probeRows.length, differing: probeRows.filter((r) => r.differs).length, nameSurvived: probeRows.filter((r) => r.nameSurvived).length, rows: probeRows };

    // Every sentence in the whole set that carried the name: how did the recogniser write it?
    const named = asr.items.filter((i) => /\bmatic\b/i.test(i.said));
    const spellings = {};
    for (const i of named) {
      const m = i.heard[model];
      const hit = /\bmatic\b/i.test(m) ? "matic" : (guessNameToken(i.said, m) ?? "(not found)");
      spellings[hit] = (spellings[hit] ?? 0) + 1;
    }
    section.nameSpellings = { sentencesCarryingTheName: named.length, spellings };
    report.sections[model] = section;

    say(`\n=== ${model} ===`);
    say(`The 40 TYPED sentences, spoken and transcribed: ${section.typedThroughAsr.differing} of ${section.typedThroughAsr.n} route differently (words changed in ${section.typedThroughAsr.wordsChanged}).`);
    for (const r of section.typedThroughAsr.rows) say(`   - ${r.id} ${r.saidOutcome} -> ${r.heardOutcome}\n       said:  "${r.said}"\n       heard: "${r.heard}"`);
    say(`The 120 spoken variants, ASR effect alone: ${section.headlineAsrEffect.differing} of ${section.headlineAsrEffect.n} (words changed in ${section.headlineAsrEffect.wordsChanged}).`);
    for (const r of section.headlineAsrEffect.rows) say(`   - ${r.id} [${r.kind}] ${r.saidOutcome} -> ${r.heardOutcome}\n       said:  "${r.said}"\n       heard: "${r.heard}"`);
    say(`The 120 spoken variants, END TO END against the typed original: ${section.headlineEndToEnd.differing} of ${section.headlineEndToEnd.n}.`);
    say(`Vocative probes: ${section.vocativeProbes.differing} of ${section.vocativeProbes.n} route differently once transcribed; the name survived as "matic" in ${section.vocativeProbes.nameSurvived} of ${section.vocativeProbes.n}.`);
    for (const r of probeRows) say(`   ${r.differs ? "DIFFERS" : "same   "} ${r.saidOutcome.padEnd(24)} -> ${r.heardOutcome.padEnd(24)} said "${r.said}" heard "${r.heard}"`);
    say(`How the name was written across all ${named.length} sentences carrying it: ${JSON.stringify(spellings)}`);
  }
}

/** Lowercase, strip punctuation: "did the WORDS change", ignoring what a recogniser adds for free. */
function normaliseForCompare(t) {
  return String(t ?? "").toLowerCase().replace(/['‘’]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * The word the recogniser wrote where the sentence said "matic", found by position: the word after
 * the same lead-in. Reported so a reader sees the actual spellings; nothing is decided from it.
 */
function guessNameToken(said, heard) {
  const s = normaliseForCompare(said).split(" "), h = normaliseForCompare(heard).split(" ");
  const i = s.indexOf("matic");
  if (i < 0) return null;
  // Align on the word that follows the name, when there is one.
  const next = s[i + 1] === "desk" ? s[i + 2] : s[i + 1];
  if (next) {
    const j = h.indexOf(next);
    if (j > 0) return h.slice(Math.max(0, j - (s[i + 1] === "desk" ? 2 : 1)), j).join(" ");
  }
  return h[Math.min(i, h.length - 1)] ?? null;
}

if (outPath) {
  const full = isAbsolute(outPath) ? outPath : join(process.cwd(), outPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(report, null, 2) + "\n");
  say(`\nwrote ${full}`);
}
