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
import { classify, isQuestion, residue } from "../src/router/classify.js";
import { socialReply, capabilityReply, SOCIAL_SUBKINDS } from "../src/router/social.js";
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

console.log("\n=== 4. D165's SOCIAL LAYER — built 2026-09-04 ===");
// THE CASE D198 ACTUALLY OBSERVED. On 2026-09-03 this exact sentence produced a renew_dhcp consent
// card. It is the first assertion in this section on purpose.
{
  const r = classify("Hello how are you?");
  check("D198's EXACT sentence is now social, not an action",
    r.kind === "social" && r.subkind === "howareyou",
    `got ${r.kind}/${r.subkind} (${r.why})`);
}
for (const [t, want] of [
  ["hello", "greeting"],
  ["Hi", "greeting"],
  ["hey", "greeting"],
  ["Good morning!", "greeting"],
  ["how are you", "howareyou"],
  ["how's it going?", "howareyou"],
  ["thanks", "thanks"],
  ["thank you!", "thanks"],
  ["cheers", "thanks"],
  ["bye", "farewell"],
  ["goodbye", "farewell"],
  ["that's all", "farewell"],
  ["what can you do?", "capability"],
  ["what can you do", "capability"],
  ["who are you", "capability"],
  ["what are your capabilities?", "capability"],
  
  ["tell me a joke", "offtopic"],
]) {
  const r = classify(t);
  check(`social/${want}: "${t}"`, r.kind === "social" && r.subkind === want, `got ${r.kind}/${r.subkind}`);
}

console.log("\n  -- off-topic markers are COMPLETE PHRASES, so they cannot eat a real problem --");
// The first version listed bare topic nouns - "the weather", "a joke", "the score", "the news" -
// each of which appears inside a real complaint. A bare topic noun is a noun, not an off-topic
// question. And "what is the weather" had to STOP taking the residue test: it leaves "what is",
// which tripped the threshold and sent it to the KNOWLEDGE BASE. Observed 2026-09-04.
for (const t of ["what is the weather?", "whats the weather like today", "tell me a joke", "what time is it", "who won the game"]) {
  const r = classify(t);
  check(`offtopic: "${t}"`, r.kind === "social" && r.subkind === "offtopic", `got ${r.kind}/${r.subkind ?? "-"}`);
}
for (const t of ["the weather app won't open", "this printer is a joke", "the news site won't load", "my score sheet is corrupted"]) {
  const r = classify(t);
  check(`NOT offtopic - a real problem containing the topic noun: "${t}"`,
    !(r.kind === "social" && r.subkind === "offtopic"), `got ${r.kind}/${r.subkind ?? "-"}`);
}

console.log("\n  -- THE HARD PART: a greeting must not SWALLOW a real problem --");
// This is the failure that would be worse than the one D198 found, because it is silent: the
// assistant answers warmly and does nothing. Every one of these opens socially and carries a real
// complaint, and every one must reach the ordinary path.
for (const t of [
  "hi, my printer is broken",
  "hello my printer isn't working",
  "hey I have no internet",
  "good morning, the wifi keeps dropping",
  "thanks but it still doesn't work",
  "hi can you restart the spooler",
  "hello how do I take a screenshot",
]) {
  const r = classify(t);
  check(`NOT social: "${t}"`, r.kind !== "social", `got ${r.kind}/${r.subkind ?? "-"} (${r.why})`);
}
check("…and the polite question still classifies as a QUESTION, not an action",
  classify("hello how do I take a screenshot").kind === "question",
  "stripping the greeting must not also lose the question");
check("…and the polite action request still classifies as an ACTION",
  classify("hi can you restart the spooler").kind === "action");

console.log("\n  -- residue() is what decides it --");
check("a bare greeting leaves no residue", residue("hello") === "");
check("a greeting plus filler leaves no residue", residue("hello there, please") === "");
check("a greeting plus a complaint leaves the complaint",
  residue("hi my printer is broken") === "my printer is broken",
  residue("hi my printer is broken"));
check("ONE leftover word is already enough to not be social",
  classify("hello printer").kind !== "social",
  "a single noun is often the whole complaint from someone who does not want to type");

console.log("\n  -- every subkind classify() emits has a template, and vice versa --");
{
  const emitted = new Set();
  for (const t of ["hello", "how are you", "thanks", "bye", "what can you do", "the weather"]) {
    const r = classify(t);
    if (r.kind === "social") emitted.add(r.subkind);
  }
  check("classify() emits only subkinds social.js has templates for",
    [...emitted].every((k) => SOCIAL_SUBKINDS.includes(k)),
    [...emitted].filter((k) => !SOCIAL_SUBKINDS.includes(k)).join(", "));
  check("and socialReply() returns a non-empty string for each",
    [...emitted].every((k) => (socialReply(k, { capabilities: [] }) ?? "").length > 20));
  check("socialReply() returns null for an unknown subkind rather than an empty string",
    socialReply("nonsense") === null,
    "so a disagreement between the two is visible instead of silent");
}

console.log("\n  -- THE CAPABILITY ANSWER IS GENERATED FROM THE CATALOG (D165) --");
{
  const caps = [
    { id: "restart_service", title: "Restart a Windows service", tier: "R1", tierInfo: { label: "Low risk" } },
    { id: "flush_dns", title: "Flush the DNS resolver cache", tier: "R1", tierInfo: { label: "Low risk" } },
    { id: "reset_adapter", title: "Disable and re-enable a network adapter", tier: "R2", tierInfo: { label: "Disruptive" } },
  ];
  const r = capabilityReply({ capabilities: caps });
  check("it names every capability in the catalog", caps.every((c) => r.includes(c.title.toLowerCase().slice(1, 20)) || r.includes(c.title.slice(1, 20))), r);
  check("it lowercases a title mid-sentence without mangling an acronym",
    r.includes("flush the DNS resolver cache") && !r.includes("dns resolver"), r);
  check("it NAMES the disruptive one rather than summarising it (tierInfo, from the catalog)",
    /disable and re-enable a network adapter/.test(r) && /notice/.test(r), r);
  check("it says nothing happens without approval", /approve|approval/.test(r));
  check("IT STATES THE BOUNDARY - a user who hears three things assumes the fourth is included",
    /beyond that list I can't/.test(r), r);

  // The whole reason this is generated: it cannot claim what is not there.
  const fewer = capabilityReply({ capabilities: caps.slice(0, 1) });
  check("REMOVE a capability and the answer shrinks - there is no hand-written list to drift",
    fewer.includes("restart a Windows service") && !fewer.includes("flush the DNS"), fewer);
  check("with one capability it does not say 'One of those' about a tier that is not there",
    !/notice happen/.test(fewer), fewer);
  const empty = capabilityReply({ capabilities: [] });
  check("AN UNREADABLE CATALOG PROMISES NOTHING rather than claiming from memory",
    /can't see my own list/.test(empty) && !/restart/.test(empty), empty);
  check("titles containing 'and' do not produce three ands in a row",
    !/ and \w+ and \w+ and /.test(r), r);
}

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

// D165 / D198 AT THE AGENT LEVEL, AND ON THE DEMO'S PROVIDER.
//
// This is the assertion that matters most in this file. D198's defect was observed on
// `provider: "cloud"` — the configuration the frozen demo build uses — so a social layer gated on
// the provider having `ask()` would have left the observed defect in place on the path it was
// observed on. The social branch is therefore UNCONDITIONAL, and these prove it.
{
  const cloud = { ...proposeOnly, proposed: 0 };  // no ask(), like CloudClient
  const res = await agentWith(cloud).propose("Hello how are you?");
  check("D198'S DEFECT IS FIXED ON THE DEMO'S OWN PROVIDER - a greeting returns res.social",
    res.ok === true && res.social?.subkind === "howareyou",
    JSON.stringify({ social: res.social, proposal: res.proposal }));
  check("…with NO PROPOSAL, so the turn never reaches the consent path",
    res.proposal === undefined && res.validation === undefined);
  check("…and NO PROVIDER CALL AT ALL - the templates are local and deterministic (D165)",
    cloud.proposed === 0);
  check("…and it still speaks", typeof res.reply === "string" && res.reply.length > 20);
  check("…and the facts panel is still populated", res.facts?.computer === "T");
}
{
  // The capability answer through the agent, generated from whatever the broker reports.
  // Two brokers, because the two outcomes are different assertions and the first version of this
  // block asserted BOTH against an empty one, which cannot pass: the fallback says "I can't see my
  // own list", and `/I can /` does not match `I can't`.
  const withCatalog = {
    validate: () => ({ ok: true, capability: { id: "x" } }),
    listCapabilities: () => [
      { id: "flush_dns", title: "Flush the DNS resolver cache", tier: "R1", tierInfo: { label: "Low risk" } },
      { id: "reset_adapter", title: "Disable and re-enable a network adapter", tier: "R2", tierInfo: { label: "Disruptive" } },
    ],
  };
  const cloud = { ...proposeOnly, proposed: 0 };
  const a = new Agent({ broker: withCatalog, cloud, onLog: () => {} });
  a.diagnose = () => ({ probe: PROBE_OK, summary: {}, identity: {}, panel: {} });
  const res = await a.propose("what can you do?");
  check("'what can you do' is answered FROM THE CATALOG via the agent, with no provider call",
    res.social?.subkind === "capability" && cloud.proposed === 0
    && /flush the DNS resolver cache/.test(res.reply)
    && /disable and re-enable a network adapter/.test(res.reply),
    res.reply);
  check("…and the disruptive one is named as such, from tierInfo", /notice/.test(res.reply), res.reply);

  // The stub broker used everywhere else in this file reports NO capabilities, which is what an
  // unsigned or unreadable catalog looks like. The honest fallback is the assertion.
  const empty = await agentWith({ ...proposeOnly, proposed: 0 }).propose("what can you do?");
  check("…and with NO readable catalog it PROMISES NOTHING rather than claiming from memory",
    /can't see my own list/.test(empty.reply) && !/flush/.test(empty.reply), empty.reply);
}
{
  // A greeting wrapped around a real problem must still reach the proposal path.
  const cloud = { ...proposeOnly, proposed: 0 };
  const res = await agentWith(cloud).propose("hi, my printer is broken");
  check("a POLITE PROBLEM REPORT still reaches the proposal path, not a template",
    res.social === undefined && res.proposal !== undefined && cloud.proposed === 1,
    "swallowing this would be a silent failure: warm answer, no help");
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
