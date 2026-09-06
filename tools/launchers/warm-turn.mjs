#!/usr/bin/env node
// @ts-check
/**
 * One throwaway PROPOSAL turn through the hub, with the endpoint's real tool schemas. Stage
 * tooling for start-hub.ps1 (2026-09-05), not product.
 *
 * WHY /v1/ask ALONE IS NOT ENOUGH TO WARM THE HUB. Measured 2026-09-05 with the model already
 * resident: the first /v1/turn took 12.8 s and the next six took 2.8-3.6 s. The first /v1/ask took
 * 11.0 s and the next four 4.6-7.7 s. The model was warm both times - what was cold was the PROMPT
 * PREFIX: Ollama caches processed prompt tokens, and /v1/turn's prefix (system prompt + four tool
 * schemas + machine state) is a different prefix from /v1/ask's. So a launcher that warms only the
 * question path still hands the first PROPOSAL turn a ten-second silence.
 *
 * This sends the sentence the demo's step 6 uses, through the same HubClient the app uses, with
 * the same capabilities from the same catalog and the same machine probe (via Agent.diagnose(),
 * so nothing here reaches into broker/capabilities directly - broker.d.ts says why not). Nothing
 * is executed and nothing is filed: HubClient.propose() returns a proposal or an escalation and
 * never touches the broker, and no intake is attached so no ticket is offered.
 *
 * Exits 0 on any model answer (a proposal, an escalation, even a refusal) and 1 only if the hub
 * could not be reached or returned an error - wording is not asserted (eval/e2e-ask.mjs says why).
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { InProcessBroker } from "../../client/src/broker/in-process-broker.js";
import { HubClient } from "../../client/src/agent/hub-client.js";
import { Agent } from "../../client/src/agent/agent.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HUB = process.env.MATIC_HUB_URL ?? "http://127.0.0.1:8787";
const TEXT = process.argv[2] ?? "the screen on my laptop is cracked";

// A scratch audit path: propose() never executes, so nothing is written, but the constructor wants
// one and the app's real audit log is not a place for launcher noise.
const broker = new InProcessBroker({
  catalogPath: join(ROOT, "client/src/broker/catalog.json"),
  auditPath: join(tmpdir(), "matic-warm-turn-audit.jsonl"),
  onLog: () => {},
});
const hub = new HubClient({ hubUrl: HUB, capabilities: broker.listCapabilities(), onLog: () => {} });
// No intake: an escalation comes back with no offer armed, and nothing can be filed from here.
const agent = new Agent({ broker, cloud: hub, onLog: () => {} });

const { probe, summary } = agent.diagnose();
const t0 = Date.now();
const res = await hub.propose(TEXT, { probe, summary });
const ms = Date.now() - t0;

if (!res.ok && !res.escalate && !res.proposal) {
  console.log(`FAILED after ${ms} ms: ${res.error ?? "no answer"}`);
  process.exit(1);
}
let what = `answered (${res.error ?? "no proposal"})`;
if (res.escalate) what = `escalate (${res.escalation?.category ?? "?"} -> ${res.escalation?.suggestedOwner ?? "unrouted"})`;
else if (res.proposal) what = `propose ${res.proposal.capabilityId}`;
console.log(`${ms} ms  ${what}`);
