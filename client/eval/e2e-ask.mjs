#!/usr/bin/env node
// @ts-check
/**
 * End-to-end: the ENDPOINT's agent asking the LIVE hub a question. D211, 2026-09-04.
 *
 * Run:  cd server && npm.cmd start          (hub on 8787, with the corpus ingested)
 *       cd client && node eval/e2e-ask.mjs
 *
 * Sibling of `e2e-hub-consent.mjs`, which does the same for the PROPOSAL path. Between them they
 * cover both halves of what a hub-configured endpoint can do.
 *
 * WHAT THIS PROVES THAT test/classify.test.mjs CANNOT
 *
 * `test/classify.test.mjs` stubs the provider, so it proves the ROUTING: that a question reaches
 * `ask()`, that a decline does not fall through to a consent card, that tier-0 still wins. It says
 * nothing about whether a real hub and a real model actually answer.
 *
 * This runs the real `Agent`, the real `HubClient`, the real hub, the real corpus and the real
 * model. It is the only thing in the repo that exercises the whole question path, and it needs a
 * running hub, which is why it is an eval script rather than a test.
 *
 * IT ASSERTS NOTHING AND EXITS 0 ON A BAD ANSWER. That is deliberate — model output varies run to
 * run (measured variance: 2 cases in 40), and a script that fails the build on a phrasing change
 * would get disabled within a week. Read the output.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { InProcessBroker } from "../src/broker/in-process-broker.js";
import { HubClient } from "../src/agent/hub-client.js";
import { Agent } from "../src/agent/agent.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HUB = process.env.MATIC_HUB_URL ?? "http://127.0.0.1:8787";
const verbose = process.argv.includes("--verbose");
const log = (l) => { if (verbose) console.log("      " + l); };

const broker = new InProcessBroker({
  catalogPath: join(ROOT, "src/broker/catalog.json"),
  auditPath: join(ROOT, "audit/audit.jsonl"),
  onLog: () => {},
});
const cloud = new HubClient({ hubUrl: HUB, capabilities: broker.listCapabilities(), onLog: log });
const agent = new Agent({ broker, cloud, onLog: log });

/** Each case says what it is DEMONSTRATING, so a wrong result is legible without the source. */
const CASES = [
  { text: "How do I take a screenshot?", expect: "ANSWER citing keyboard-shortcuts-windows" },
  { text: "What is the shortcut to open task manager?", expect: "ANSWER from the same reference article" },
  { text: "Why does my mouse keep cutting out?", expect: "ANSWER citing bluetooth-peripheral-disconnects" },
  { text: "How do I request a payroll adjustment for last month?", expect: "DECLINE — outside the six articles" },
  { text: "What is our policy on expensing a taxi?", expect: "DECLINE — outside the six articles" },
  { text: "How do I fix my printer?", expect: "PROPOSAL — 'fix' is an action verb, so the classifier sends it to the measured path (D211)" },
  { text: "my printer isn't working", expect: "PROPOSAL — tier-0 or the model; never reaches ask()" },
];

const health = await fetch(`${HUB}/v1/health`).then((r) => r.json()).catch(() => null);
if (!health?.ok) {
  console.log(`\n  The hub at ${HUB} is not answering. Start it:  cd server && npm.cmd start\n`);
  process.exit(1);
}
console.log(`\n  hub      ${HUB}  model ${health.provider?.model}`);
console.log(`  corpus   ${health.corpus?.articles} articles, ${health.corpus?.embedded}/${health.corpus?.chunks} chunks embedded`);
console.log(`  reranker ${health.rerankerPresent ? "present" : "ABSENT - answers here are a floor, not a measurement"}`);

let answered = 0, declined = 0, proposed = 0, other = 0;
for (const c of CASES) {
  console.log("\n" + "=".repeat(94));
  console.log(`USER: ${c.text}`);
  console.log(`  expecting: ${c.expect}`);
  console.log("=".repeat(94));
  const res = await agent.propose(c.text);

  if (res.answer) {
    const { answered: yes, citedArticleIds } = res.answer;
    yes ? answered++ : declined++;
    console.log(`  -> ${yes ? "ANSWER" : "DECLINE"}   cited: [${citedArticleIds.join(", ")}]`);
    console.log(`     "${String(res.reply).replace(/\s+/g, " ")}"`);
    // The citation is chrome, not speech (H5). Shown separately here for the same reason the
    // renderer shows it as a source line rather than saying it aloud.
    if (citedArticleIds.length) console.log(`     source line the renderer would show: "source: ${citedArticleIds.join(", ")}"`);
  } else if (res.proposal) {
    proposed++;
    console.log(`  -> PROPOSAL  ${res.proposal.capabilityId}  (source ${res.proposal.source ?? "tier-0"})`);
    console.log(`     "${String(res.reply).replace(/\s+/g, " ").slice(0, 140)}"`);
  } else if (res.escalation) {
    other++;
    console.log(`  -> ESCALATION  ${res.escalation.category}`);
    console.log(`     "${String(res.reply).replace(/\s+/g, " ").slice(0, 140)}"`);
  } else {
    other++;
    console.log(`  -> NO LEVER  "${String(res.reply).replace(/\s+/g, " ").slice(0, 160)}"`);
  }
}

console.log("\n" + "=".repeat(94));
console.log(`  ${answered} answered, ${declined} declined, ${proposed} proposed, ${other} other`);
console.log("=".repeat(94));
console.log("  A decline is a CORRECT outcome, not a failure (D205). Six articles cover very little,");
console.log("  and confident invented IT advice is worse than 'I do not know' because the user acts on it.");
console.log("  No number here is a measurement: six articles, no reranker, and a development embedder");
console.log("  that is not the one D199 chose.");
console.log("");
