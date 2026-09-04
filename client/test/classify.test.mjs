/**
 * The question/action classifier and the agent's question branch. D211, 2026-09-04.
 *
 * Run: node test/classify.test.mjs        (from client/; part of `npm test`)
 *
 * Two things are being pinned, and the second matters more than the first.
 *
 * 1. THE CLASSIFIER'S BIAS. Every ambiguous sentence must resolve to "action", because the
 *    proposal path is the one that has been measured (40 cases, five models, zero false actions
 *    reaching a user) and the question path has been measured on nothing. A future change that
 *    makes the classifier more eager will fail these.
 *
 * 2. THE DEMO IS UNREACHABLE FROM THIS FEATURE. The question branch is gated on the provider
 *    having an `ask` method. `CloudClient` has none, and the frozen demo build uses it. That is a
 *    property of construction rather than of configuration, and it is asserted here so nobody
 *    "simplifies" it into a provider-name check.
 */
import { readFileSync } from "node:fs";
import { classify, isQuestion } from "../src/router/classify.js";
import { Agent } from "../src/agent/agent.js";

let pass = 0, fail = 0;
/**
 * Strip comments before scanning source. Same helper as server/test/db-static.test.mjs, and here
 * for the same reason — see the note at its call site.
 */
function jsCode(js) {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");
}
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}

// ==============================================================================================
console.log("=== 1. questions are recognised ===");
for (const q of [
  "How do I take a screenshot?",
  "how do i take a screenshot",
  "What is the shortcut for task manager?",
  "what's the shortcut to lock my screen",
  "Where do I find my downloads?",
  "Is there a way to get a closed tab back?",
  "Why does my mouse keep cutting out?",
  "who should I ask about a new laptop",
]) {
  const r = classify(q);
  check(`question: "${q}"`, r.kind === "question", `got ${r.kind} (${r.why})`);
}

// ==============================================================================================
console.log("\n=== 2. THE BIAS: anything with an action verb is an ACTION, even phrased as a question ===");
// This is the section that encodes the judgement. "How do I fix my printer" is a request for a
// fix: the model on the proposal path can propose restart_service, and the six-article knowledge
// base certainly cannot. Being wrong towards the measured path costs a worse answer; being wrong
// the other way costs a decline where a fix existed.
for (const a of [
  "How do I fix my printer?",
  "how do i restart the spooler",
  "Can I reset my network adapter?",
  "what is the best way to flush my dns",
  "how do i clear the print queue",
  "Where do I go to disable this?",
  "how can i reinstall the driver",
]) {
  const r = classify(a);
  check(`action despite question grammar: "${a}"`, r.kind === "action", `got ${r.kind} (${r.why})`);
  check(`  …and the log says which verb decided it`, /action verb/.test(r.why), r.why);
}

console.log("\n=== 3. plain problem reports are actions, which is the existing path ===");
for (const a of [
  "my printer isn't working",
  "I have no internet",
  "this thing is useless",
  "my printer won't print?",           // a question mark alone is NOT enough
  "everything is really slow at home",
  "",
]) {
  const r = classify(a);
  check(`action: "${a || "(empty)"}"`, r.kind === "action", `got ${r.kind} (${r.why})`);
}
check("a trailing question mark alone does not make a question",
  classify("my printer won't print?").kind === "action",
  "an uncertain report of a problem is not a request for an article");

console.log("\n=== 4. D165's social layer is NOT built, and the absence is explicit ===");
check("classify() never returns 'social' today",
  ["hello", "hi there", "how are you", "good morning", "thanks!"].every((t) => classify(t).kind !== "social"),
  "the branch exists so D165 slots in; the branch is not the feature");
// D198: "Hello how are you?" produced a consent card. That is still true and this test records it
// rather than hiding it - "how are you" contains no action verb and no question marker, so it
// falls to "action" and reaches the proposal path exactly as it does today.
check("D198's greeting still routes to the proposal path (the defect is UNFIXED, not masked)",
  classify("Hello how are you?").kind === "action",
  "D165 is what fixes this; classify() is only where it will go");

console.log("\n=== 5. isQuestion is a thin wrapper, not a second opinion ===");
for (const t of ["how do i take a screenshot", "my printer is broken", "how do i fix my printer"]) {
  check(`isQuestion agrees with classify for "${t}"`, isQuestion(t) === (classify(t).kind === "question"));
}

// ==============================================================================================
console.log("\n=== 6. the agent's question branch ===");

const PROBE_OK = {
  online: true,
  services: { spooler: { name: "spooler", stateName: "RUNNING", canStop: true } },
  adapters: [{ index: 12, description: "Intel Wi-Fi", ip: "192.168.1.42", gateway: "192.168.1.1", dhcpEnabled: true, hasIp: true, guid: "{G}" }],
  primary: [{ index: 12, description: "Intel Wi-Fi", ip: "192.168.1.42", gateway: "192.168.1.1", dhcpEnabled: true, hasIp: true, guid: "{G}" }],
};
const stubBroker = { validate: () => ({ ok: true, capability: { id: "x", tier: "R1", rollback: "none" } }), listCapabilities: () => [] };

/** An agent whose diagnose() is stubbed, so no real probe runs. */
function agentWith(cloud) {
  const a = new Agent({ broker: stubBroker, cloud, onLog: () => {} });
  a.diagnose = () => ({ probe: PROBE_OK, summary: {}, identity: {}, panel: { computer: "T", user: "u" } });
  return a;
}

// A provider with NO ask(), like CloudClient and OpenAICompatibleClient.
const proposeOnly = {
  proposed: 0,
  async propose() { this.proposed++; return { ok: true, proposal: { capabilityId: "flush_dns", parameters: {}, reasoning: "r", confidence: 0.9, source: "cloud" }, reply: "proposed" }; },
};
{
  const cloud = { ...proposeOnly, proposed: 0 };
  const res = await agentWith(cloud).propose("How do I take a screenshot?");
  check("A PROVIDER WITHOUT ask() NEVER TAKES THE QUESTION BRANCH - the frozen demo is unreachable",
    res.answer === undefined && res.proposal !== undefined && cloud.proposed === 1,
    JSON.stringify({ answer: res.answer, proposed: cloud.proposed }));
  // Comments are stripped before scanning, and that is NOT incidental. The rule is "no
  // provider-name check", and the code enforcing it carries a comment EXPLAINING that it is a
  // capability check and not `if (config.provider === "hub")` - so scanning raw text finds the
  // explanation and reports it as a violation. This test failed exactly that way when first
  // written, which is the trap server/test/db-static.test.mjs already documents: a test starting
  // to fail for saying the right thing.
  const agentSrc = jsCode(readFileSync(new URL("../src/agent/agent.js", import.meta.url), "utf8"));
  check("…and it is a CAPABILITY check, not a provider-name check",
    /typeof this\.cloud\?\.ask === "function"/.test(agentSrc) && !/provider\s*===\s*"hub"/.test(agentSrc),
    "a name check would break the moment a second question-capable provider exists");
}

// A hub-like provider that answers.
{
  const cloud = {
    askedWith: null, proposed: 0,
    async ask(text, opts) { this.askedWith = { text, opts }; return { ok: true, answered: true, reply: "Press Win + Shift + S.", citedArticleIds: ["keyboard-shortcuts-windows"], retrieval: { chunks: 3, rerankerPresent: false } }; },
    async propose() { this.proposed++; return { ok: true, proposal: {}, reply: "should not happen" }; },
  };
  const res = await agentWith(cloud).propose("How do I take a screenshot?");
  check("a question reaches ask() and NOT propose()", cloud.askedWith !== null && cloud.proposed === 0);
  check("the probe is passed, so the platform pre-filter (D162) has something to filter on",
    cloud.askedWith.opts?.probe === PROBE_OK);
  check("the result carries res.answer, not res.proposal", res.ok === true && res.answer && res.proposal === undefined);
  check("the citation stays a SEPARATE field and is not concatenated into the reply (H5)",
    res.answer.citedArticleIds.join() === "keyboard-shortcuts-windows"
    && !res.reply.includes("keyboard-shortcuts-windows"),
    res.reply);
  check("facts still come through for the panel", res.facts?.computer === "T");
}

// A hub-like provider that declines.
{
  const cloud = {
    proposed: 0,
    async ask() { return { ok: true, answered: false, reply: "I don't have company guidance covering that. I can raise a ticket.", citedArticleIds: [] }; },
    async propose() { this.proposed++; return { ok: true, proposal: { capabilityId: "flush_dns" }, reply: "proposed" }; },
  };
  const res = await agentWith(cloud).propose("How do I request a payroll adjustment?");
  check("A DECLINE IS ok:true WITH answered:false - not a failure", res.ok === true && res.answer.answered === false);
  check("A DECLINED QUESTION DOES NOT FALL THROUGH TO THE PROPOSAL PATH (D198)",
    cloud.proposed === 0 && res.proposal === undefined,
    "falling through would raise a consent card for a question the user never asked to act on");
  check("the decline reaches the user as prose", /guidance|ticket/i.test(res.reply));
}

// A hub that cannot be reached: fall through, because that is a network problem and not a decline.
{
  const cloud = {
    proposed: 0,
    async ask() { return { ok: false, reason: "connection", error: "Could not reach the hub" }; },
    async propose() { this.proposed++; return { ok: true, proposal: { capabilityId: "flush_dns", parameters: {}, reasoning: "r", confidence: 0.9 }, reply: "proposed" }; },
  };
  const res = await agentWith(cloud).propose("How do I take a screenshot?");
  check("AN UNREACHABLE hub falls through to the proposal path rather than declining",
    cloud.proposed === 1 && res.proposal !== undefined && res.answer === undefined,
    "a decline would blame the knowledge base for a network failure");
}

// Tier-0 keeps precedence (D46b).
{
  const cloud = { asked: 0, async ask() { this.asked++; return { ok: true, answered: true, reply: "x", citedArticleIds: [] }; }, async propose() { return { ok: true, proposal: {}, reply: "x" }; } };
  const stopped = { ...PROBE_OK, services: { spooler: { name: "spooler", stateName: "STOPPED", canStop: true } } };
  const a = new Agent({ broker: stubBroker, cloud, onLog: () => {} });
  a.diagnose = () => ({ probe: stopped, summary: {}, identity: {}, panel: {} });
  // A printer sentence with a stopped spooler is tier-0's strongest case.
  const res = await a.propose("my printer isn't working");
  check("TIER-0 STILL RUNS FIRST (D46b) - a confident local match never reaches ask()",
    cloud.asked === 0 && res.proposal !== undefined,
    JSON.stringify({ asked: cloud.asked, hasProposal: Boolean(res.proposal) }));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
