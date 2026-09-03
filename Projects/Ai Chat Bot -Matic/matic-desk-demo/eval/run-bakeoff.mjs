// @ts-check
/**
 * THE MODEL BAKE-OFF.
 *
 * Built as the Phase 3 model eval, not a throwaway: hand-written cases now, a customer's real
 * ticket export later, and the runner does not change between the two. Drop a differently-sourced
 * cases.json in and everything below still applies.
 *
 * It drives the SHIPPING PROVIDER - src/agent/openai-compatible-client.js - not a parallel
 * reimplementation of it. That matters more than it sounds. A harness with its own copy of the
 * prompt and its own tool-surface builder measures the harness; when the two drift, the eval
 * reports a model change that never happened. Every proposal here goes through the same repair
 * turn, the same enum enforcement and the same broker validation the app uses.
 *
 * Usage:
 *   node eval/run-bakeoff.mjs gpt-oss:20b gemma4:12b mistral-small:24b
 *   node eval/run-bakeoff.mjs --cloud claude-haiku-4-5          (needs ANTHROPIC_API_KEY)
 *   node eval/run-bakeoff.mjs --tag tier0-pinned gpt-oss:20b    (a subset)
 *   node eval/run-bakeoff.mjs --out results/run-2.json gpt-oss:20b
 *
 * The model must already be resident. Cold-load time is not latency and is timed separately by
 * whatever warms it; mixing the two produces a number that cannot be defended.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { OpenAICompatibleClient } from "../src/agent/openai-compatible-client.js";
import { CloudClient } from "../src/agent/cloud-client.js";
import { InProcessBroker } from "../src/broker/in-process-broker.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

// Load the gitignored .env for --cloud runs, the same way main.js does. Deliberately NOT passed
// on the command line: a key in argv shows up in the process list for every user on the box.
if (!process.env.ANTHROPIC_API_KEY) {
  try { process.loadEnvFile(join(ROOT, ".env")); } catch { /* no .env; --cloud will report itself unavailable */ }
}

// ---- arguments -------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const useCloud = argv.includes("--cloud");
const tagFilter = opt("tag", null);
const casesPath = opt("cases", join(HERE, "cases.json"));
const outPath = opt("out", join(HERE, "results", `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
const baseUrl = opt("base-url", process.env.MATIC_LOCAL_BASE_URL ?? "http://127.0.0.1:11434/v1");
// --cloud takes no value, so "preceded by a flag" is not enough to tell a value from a model name.
const VALUE_FLAGS = new Set(["--tag", "--cases", "--out", "--base-url"]);
const models = argv.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(argv[i - 1]));

if (models.length === 0) {
  console.error("usage: node eval/run-bakeoff.mjs [--cloud] [--tag T] [--cases F] [--out F] <model> [model...]");
  process.exit(2);
}

const { states } = JSON.parse(readFileSync(join(HERE, "states.json"), "utf8"));
const casesFile = JSON.parse(readFileSync(casesPath, "utf8"));
const cases = casesFile.cases.filter((c) => !tagFilter || (c.tags ?? []).includes(tagFilter));

// ---- the broker, pointed at a scratch audit log ------------------------------------------------
// The eval refuses proposals by design and every refusal is audited. Pointing that at the real
// audit/audit.jsonl would bury a rehearsal trail under hundreds of eval records.
const auditPath = join(tmpdir(), `matic-eval-audit-${process.pid}.jsonl`);
// The broker validates against whichever machine the current case describes, not the box this is
// running on. That is what makes the state-derived gate - the one that stops a model acting against
// reality - measurable at all.
let currentProbe = null;
const broker = new InProcessBroker({
  catalogPath: join(ROOT, "src/broker/catalog.json"),
  auditPath,
  probe: () => currentProbe,
  onLog: () => {},
});
const capabilities = broker.listCapabilities();

// ---- helpers ------------------------------------------------------------------------------------
const vram = () => {
  try {
    return Number(execFileSync("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"]).toString().trim().split("\n")[0]);
  } catch { return NaN; }
};
const median = (xs) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (n, d) => (d === 0 ? "  n/a" : `${((100 * n) / d).toFixed(0).padStart(3)}%`);

/**
 * Score one answer.
 *
 * The classes are deliberately not symmetric. §4 says weight the false-action rate hardest, and
 * that is a judgement about consequences, not accuracy: proposing an action on a machine where the
 * honest answer was "a human needs to look at this" is the failure that reaches a user's machine.
 * Escalating something a capability could have fixed is a worse product and a safe one. Keeping
 * them in separate columns is the whole point - a single accuracy number hides the difference.
 */
function classify(expected, answer) {
  if (!answer.ok) return { outcome: "no_answer", note: answer.error ?? "no answer" };

  if (answer.escalate) {
    if (!expected.escalate) return { outcome: "over_escalation", note: `expected ${expected.capability}` };
    const catOk = !expected.category || expected.category.includes(answer.escalation.category);
    const ownerOk = !expected.owner || expected.owner.includes(answer.escalation.suggestedOwner);
    return {
      outcome: "correct",
      routingOk: catOk && ownerOk,
      note: `${answer.escalation.category} / ${answer.escalation.suggestedOwner}${catOk && ownerOk ? "" : "  (off the acceptable set)"}`,
    };
  }

  const proposed = answer.proposal.capabilityId;
  if (expected.escalate) return { outcome: "false_action", note: `proposed ${proposed} where a human was needed` };
  if (proposed !== expected.capability) return { outcome: "false_action", note: `proposed ${proposed}, expected ${expected.capability}` };

  for (const [k, v] of Object.entries(expected.parameters ?? {})) {
    if (answer.proposal.parameters?.[k] !== v) {
      return { outcome: "wrong_parameters", note: `${k}=${JSON.stringify(answer.proposal.parameters?.[k])}, expected ${JSON.stringify(v)}` };
    }
  }
  return { outcome: "correct", note: proposed };
}

// ---- run ------------------------------------------------------------------------------------
const runs = [];

for (const model of models) {
  const client = useCloud
    // temperature 0 so the cloud path is measured the same way the local ones are.
    ? new CloudClient({ model, capabilities, temperature: 0, onLog: () => {} })
    : new OpenAICompatibleClient({ model, baseUrl, capabilities, onLog: () => {}, timeoutMs: 300000 });

  if (!client.available) {
    console.error(`\n### ${model} - SKIPPED, provider not available (missing key or endpoint)`);
    continue;
  }

  console.log(`\n### ${model}   (${cases.length} cases)`);
  // The driver measures idle VRAM before it loads anything and passes it in. Sampling it here
  // would measure the desktop PLUS the model already resident and report a delta near zero -
  // which is exactly what the first run of this harness did.
  const baselineVram = process.env.MATIC_IDLE_VRAM_MIB ? Number(process.env.MATIC_IDLE_VRAM_MIB) : vram();
  let peakVram = baselineVram;
  const sampler = setInterval(() => { const v = vram(); if (v > peakVram) peakVram = v; }, 500);

  const results = [];
  for (const c of cases) {
    const probe = states[c.state];
    if (!probe) throw new Error(`case ${c.id} names an unknown state "${c.state}"`);

    currentProbe = probe;

    const startedAt = Date.now();
    const answer = await client.propose(c.text, { probe, summary: {} });
    const ms = Date.now() - startedAt;

    const scored = classify(c.expect, answer);

    // What the broker would say - the real gate, so "schema valid" means valid to the thing that
    // actually decides rather than to a copy of the rules living in this file.
    //
    // With one exception. checkPolicy() reads the LIVE machine, and these cases describe fictional
    // ones: adapter index 12 is real in states.json and absent from whatever box this runs on, so
    // every renew_dhcp proposal trips `machine-state` no matter how correct it is. That gate is
    // not evidence about the model here, so it is recorded and excluded from scoring. The gates
    // that ARE evidence - catalog, schema, tier-policy - depend only on the proposal itself.
    // Only machine-state is unscorable. policy-blocklist looked like a sibling of it and is not:
    // checkPolicy() consults catalog.policy BEFORE it probes anything, so a dnscache refusal is
    // deterministic on any machine and is real evidence about the model.
    // Every gate is scorable now that the broker validates against the case's own machine rather
    // than the host. machine-state and precondition used to be meaningless here; they are the two
    // that matter most, because they are what stops a wrong proposal from reaching a consent prompt.
    const SCORABLE_GATES = new Set(["catalog", "schema", "tier-policy", "policy-blocklist", "machine-state", "precondition"]);
    let brokerGate = null;
    let brokerOk = null;
    if (answer.proposal) {
      const v = broker.validate(answer.proposal, { audit: false });
      brokerGate = v.ok ? null : v.gate;
      brokerOk = v.ok ? true : !SCORABLE_GATES.has(v.gate) ? null : false;
    }

    results.push({
      id: c.id,
      tags: c.tags ?? [],
      text: c.text,
      state: c.state,
      ms,
      // What it actually proposed, structured. A false flush_dns and a false reset_adapter are
      // both "false actions" and are not remotely the same thing to a user.
      proposed: answer.escalate ? "escalate" : (answer.proposal?.capabilityId ?? null),
      // The model’s own stated confidence. Captured so a confidence gate can be evaluated against
      // real outcomes rather than assumed to work: the question is whether it separates correct
      // proposals from false actions at all.
      confidence: answer.proposal?.confidence ?? null,
      proposedTier: answer.proposal
        ? (capabilities.find((x) => x.id === answer.proposal.capabilityId)?.tier ?? null)
        : null,
      outcome: scored.outcome,
      routingOk: scored.routingOk ?? null,
      note: scored.note,
      brokerOk,
      brokerGate,
      repaired: answer.meta?.repaired ?? false,
      firstAttemptViolations: answer.meta?.firstAttemptViolations ?? [],
      offList: answer.escalation?.offList ?? null,
      usage: answer.meta?.usage ?? null,
      requests: answer.meta?.requests ?? null,
    });

    const mark = { correct: "OK  ", false_action: "FALSE", over_escalation: "over", wrong_parameters: "param", no_answer: "none" }[scored.outcome];
    const flags = [
      results.at(-1).repaired ? "repaired" : "",
      brokerOk === false ? `broker:${brokerGate}` : brokerGate ? `(${brokerGate}, not scored)` : "",
      scored.routingOk === false ? "off-list" : "",
    ].filter(Boolean).join(" ");
    console.log(`  ${String(c.id).padEnd(7)} ${mark.padEnd(6)} ${String(scored.note).slice(0, 62).padEnd(62)} ${(ms / 1000).toFixed(1)}s ${flags}`);
  }

  clearInterval(sampler);

  const n = results.length;
  const count = (o) => results.filter((r) => r.outcome === o).length;
  const proposals = results.filter((r) => r.brokerOk !== null);   // null = gate not scorable here
  const escalationCases = cases.filter((c) => c.expect.escalate);
  const escalated = results.filter((r, i) => cases[i].expect.escalate && r.outcome === "correct");
  const totalMs = results.reduce((a, r) => a + r.ms, 0);
  const correct = count("correct");

  const summary = {
    model,
    provider: useCloud ? "anthropic" : "openai-compatible",
    cases: n,
    correct,
    falseActions: count("false_action"),
    // Weighted view. R2 is the one that drops every connection on the machine; R1 is reversible or
    // idempotent. Counting them together hides the difference that actually matters to a user.
    falseActionsR2: results.filter((r) => r.outcome === "false_action" && r.proposedTier === "R2").length,
    falseActionsR1: results.filter((r) => r.outcome === "false_action" && r.proposedTier === "R1").length,
    // THE number. A false action the broker refuses never reaches a consent prompt, so the user is
    // never asked to approve it and nothing touches the machine. What the model proposes wrongly
    // matters far less than what survives validation - this is the figure to drive toward zero.
    falseActionsBlockedByBroker: results.filter((r) => r.outcome === "false_action" && r.brokerOk === false).length,
    falseActionsReachingUser: results.filter((r) => r.outcome === "false_action" && r.brokerOk !== false).length,
    falseActionsReachingUserR2: results.filter((r) => r.outcome === "false_action" && r.brokerOk !== false && r.proposedTier === "R2").length,
    falseActionsByCapability: Object.fromEntries(
      Object.entries(
        results.filter((r) => r.outcome === "false_action").reduce((a, r) => {
          a[r.proposed ?? "unknown"] = (a[r.proposed ?? "unknown"] ?? 0) + 1;
          return a;
        }, {})
      ).sort((a, b) => b[1] - a[1])
    ),
    overEscalations: count("over_escalation"),
    wrongParameters: count("wrong_parameters"),
    noAnswer: count("no_answer"),
    // Validity against the broker, which is the gate that actually decides.
    proposalsMade: proposals.length,
    brokerAccepted: proposals.filter((r) => r.brokerOk).length,
    brokerNotScorable: results.filter((r) => r.brokerOk === null && r.outcome !== "no_answer" && !r.offList).length,
    // How much of that validity the provider had to buy with a second round trip.
    validFirstAttempt: results.filter((r) => !r.repaired && r.outcome !== "no_answer").length,
    repaired: results.filter((r) => r.repaired).length,
    escalationCases: escalationCases.length,
    escalatedCorrectly: escalated.length,
    routingOffList: results.filter((r) => r.routingOk === false).length,
    medianMs: median(results.map((r) => r.ms)),
    totalSeconds: Math.round(totalMs / 1000),
    peakVramMiB: Number.isFinite(peakVram) ? peakVram : null,
    // Supplied by bakeoff-all.mjs, which does the loading. Recorded, never folded into latency.
    coldLoadMs: process.env.MATIC_COLD_LOAD_MS ? Number(process.env.MATIC_COLD_LOAD_MS) : null,
    vramOverBaselineMiB: Number.isFinite(peakVram) ? peakVram - baselineVram : null,
    promptTokens: results.reduce((a, r) => a + (r.usage?.prompt_tokens ?? 0), 0),
    completionTokens: results.reduce((a, r) => a + (r.usage?.completion_tokens ?? 0), 0),
    // §4's deciding number. Not accuracy, and not token price: what one TRUSTWORTHY proposal costs.
    // A model that is fast and wrong scores badly here, which is the point.
    secondsPerCorrectProposal: correct ? Number((totalMs / 1000 / correct).toFixed(1)) : null,
  };

  // Per-tag breakdown. An aggregate can look fine while every failure sits in one bucket -
  // which is what happened the first time this was run: all 8 false actions were on adversarial
  // and escalation cases, none on the happy path.
  const tags = [...new Set(cases.flatMap((c) => c.tags ?? []))];
  summary.byTag = Object.fromEntries(tags.map((t) => {
    const idx = cases.map((c, i) => ((c.tags ?? []).includes(t) ? i : -1)).filter((i) => i >= 0);
    const rs = idx.map((i) => results[i]);
    return [t, {
      cases: rs.length,
      correct: rs.filter((r) => r.outcome === "correct").length,
      falseActions: rs.filter((r) => r.outcome === "false_action").length,
    }];
  }));

  runs.push({ summary, results });

  console.log(`  ${"-".repeat(72)}`);
  console.log(`  correct                  ${String(correct).padStart(3)}/${n}  ${pct(correct, n)}`);
  console.log(`  FALSE ACTIONS            ${String(summary.falseActions).padStart(3)}/${n}  ${pct(summary.falseActions, n)}   <- weighted hardest`);
  console.log(`    of which R2 (disruptive) ${String(summary.falseActionsR2).padStart(3)}      <- the ones a user would notice`);
  console.log(`    of which R1 (reversible) ${String(summary.falseActionsR1).padStart(3)}`);
  console.log(`    blocked by the broker    ${String(summary.falseActionsBlockedByBroker).padStart(3)}      (refused before any consent prompt)`);
  console.log(`    REACHING THE USER        ${String(summary.falseActionsReachingUser).padStart(3)}      <- the number that matters, R2 of those: ${summary.falseActionsReachingUserR2}`);
  if (Object.keys(summary.falseActionsByCapability).length) {
    console.log(`    by capability            ${Object.entries(summary.falseActionsByCapability).map(([k, v]) => `${k}×${v}`).join(", ")}`);
  }
  console.log(`  over-escalations         ${String(summary.overEscalations).padStart(3)}/${n}  ${pct(summary.overEscalations, n)}   (safe, unhelpful)`);
  console.log(`  wrong parameters         ${String(summary.wrongParameters).padStart(3)}/${n}`);
  console.log(`  no answer                ${String(summary.noAnswer).padStart(3)}/${n}`);
  console.log(`  broker accepted          ${String(summary.brokerAccepted).padStart(3)}/${summary.proposalsMade} proposals it could score`);
  console.log(`  needed a repair turn     ${String(summary.repaired).padStart(3)}/${n}`);
  console.log(`  escalated when it should ${String(summary.escalatedCorrectly).padStart(3)}/${summary.escalationCases}`);
  console.log(`  routing off acceptable   ${String(summary.routingOffList).padStart(3)}`);
  console.log(`  median latency           ${(summary.medianMs / 1000).toFixed(1)}s`);
  console.log(`  peak VRAM                ${summary.peakVramMiB ?? "n/a"} MiB (+${summary.vramOverBaselineMiB ?? "n/a"})`);
  console.log(`  SECONDS PER CORRECT      ${summary.secondsPerCorrectProposal ?? "n/a"}   <- the deciding number`);
  console.log("  by tag:");
  for (const [t, v] of Object.entries(summary.byTag)) {
    console.log(`    ${t.padEnd(14)} ${String(v.correct).padStart(3)}/${String(v.cases).padEnd(3)} correct, ${v.falseActions} false`);
  }
}

// ---- comparison table ---------------------------------------------------------------------------
if (runs.length > 1) {
  console.log(`\n${"=".repeat(96)}`);
  console.log("model".padEnd(22) + "correct".padEnd(10) + "FALSE".padEnd(8) + "over".padEnd(7) + "none".padEnd(7) + "repair".padEnd(8) + "med s".padEnd(8) + "VRAM".padEnd(9) + "s/correct");
  console.log("-".repeat(96));
  for (const { summary: s } of runs) {
    console.log(
      s.model.slice(0, 21).padEnd(22) +
      `${s.correct}/${s.cases}`.padEnd(10) +
      String(s.falseActions).padEnd(8) +
      String(s.overEscalations).padEnd(7) +
      String(s.noAnswer).padEnd(7) +
      String(s.repaired).padEnd(8) +
      (s.medianMs / 1000).toFixed(1).padEnd(8) +
      String(s.vramOverBaselineMiB ?? "n/a").padEnd(9) +
      String(s.secondsPerCorrectProposal ?? "n/a")
    );
  }
  console.log("=".repeat(96));
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({
  at: new Date().toISOString(),
  casesVersion: casesFile.version,
  casesPath,
  tagFilter,
  runs,
}, null, 2));
console.log(`\nwritten: ${outPath}`);
console.log("NOTE: single-machine observations, not benchmarks. Re-run on a quiet GPU before quoting anything.");
