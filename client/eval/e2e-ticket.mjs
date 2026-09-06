#!/usr/bin/env node
// @ts-check
/**
 * End-to-end: escalation -> offer -> interview -> draft -> a REAL ticket on a REAL hub. D213-D217.
 *
 * Run:  cd server && npm.cmd start                (hub on 8787, with a tenant)
 *       cd client && node eval/e2e-ticket.mjs
 *
 *       MATIC_HUB_URL=http://127.0.0.1:8788 node eval/e2e-ticket.mjs     (another hub)
 *
 * Third sibling of `e2e-ask.mjs` (the question path) and `e2e-hub-consent.mjs` (the proposal
 * path). This one covers the third thing a hub-configured endpoint can do: hand a problem to a
 * person.
 *
 * WHAT THIS PROVES THAT test/ticket.test.mjs CANNOT
 *
 * The unit tests stub the provider and the hub. They prove the ROUTING and the refusals — that an
 * unrelated sentence passes through, that the case note is never spoken, that a complete profile
 * asks nothing. They say nothing about whether a real model actually calls `escalate`, or whether
 * the body this endpoint builds is one the hub will accept.
 *
 * That second gap is the one that matters. On 2026-09-04 an integration bug sat between two halves
 * whose own tests both passed — `probeMachine()` had no `platform`, so every Windows-only article
 * was invisible to the endpoint — and only an end-to-end run could show it. This script exists so
 * the ticket path has the same kind of check.
 *
 * IT FILES A REAL TICKET. Two of them, in the configured tenant, which will be visible in
 * `node bin/tickets.mjs list` afterwards. That is the point, not a side effect: a run that did not
 * write anything would not be proving the thing this script is for. Use a dev tenant.
 *
 * IT ASSERTS NOTHING ABOUT WORDING and exits 0 on a bad answer, for the same reason e2e-ask.mjs
 * does — model output varies run to run and a build that fails on a rephrasing gets disabled. It
 * DOES exit non-zero if the ticket was not stored, because that is not a matter of phrasing.
 */
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { InProcessBroker } from "../src/broker/in-process-broker.js";
import { HubClient } from "../src/agent/hub-client.js";
import { Agent } from "../src/agent/agent.js";
import { ProfileStore } from "../src/profile/profile.js";
import { TicketIntake } from "../src/ticket/intake.js";
import { EgressAudit } from "../src/ticket/egress-audit.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HUB = process.env.MATIC_HUB_URL ?? "http://127.0.0.1:8787";
const verbose = process.argv.includes("--verbose");
const log = (l) => { if (verbose) console.log("      " + l); };

// A TEMPORARY profile directory, so a run never touches the real one in Electron's userData and
// the "empty profile" scenario below is genuinely empty on every run.
const profileDir = mkdtempSync(join(tmpdir(), "matic-e2e-ticket-"));
const egressPath = join(profileDir, "egress.jsonl");

const broker = new InProcessBroker({
  catalogPath: join(ROOT, "src/broker/catalog.json"),
  auditPath: join(ROOT, "audit/audit.jsonl"),
  onLog: () => {},
});
const cloud = new HubClient({ hubUrl: HUB, capabilities: broker.listCapabilities(), onLog: log });
const profile = new ProfileStore({ dir: profileDir, onLog: log });
const egress = new EgressAudit({ path: egressPath, onLog: log });
const intake = new TicketIntake({ profile, onLog: log });
const agent = new Agent({ broker, cloud, intake, onLog: log });

const rule = (s) => console.log(`\n${"=".repeat(94)}\n${s}\n${"=".repeat(94)}`);
const said = (who, text) => console.log(`${who.padEnd(6)} ${text}`);

let filedRefs = [];
let problems = 0;

/**
 * Drive one conversation to completion, answering the interview from `answers` and auto-approving
 * the draft. The approval here stands in for the renderer's review card — which is the ONE thing
 * this script cannot exercise, because a card is a screen. Said plainly rather than glossed.
 */
async function conversation(opening, answers) {
  said("USER:", opening);
  let res = await agent.propose(opening);
  said("  ->", res.reply);

  if (!res.escalation) {
    console.log("  !! the model did not escalate. Nothing further to drive - this is model variance, not a defect.");
    return null;
  }
  if (!res.canFile) {
    console.log("  !! canFile is false, so no offer was made. Is the hub reachable and a tenant configured?");
    problems++;
    return null;
  }
  egress.record("ticket.offered", { category: res.escalation.category, owner: res.escalation.suggestedOwner });

  // "yes", then each interview answer in turn.
  const queue = ["yes please", ...answers];
  for (const reply of queue) {
    said("USER:", reply);
    res = await agent.propose(reply);
    said("  ->", res.reply);
    if (res.ticketDraft) break;
    if (!res.ticketIntake) {
      console.log("  !! the intake dropped the turn - it was neither a question nor a draft");
      problems++;
      return null;
    }
  }

  if (!res.ticketDraft) {
    console.log("  !! ran out of answers before a draft appeared");
    problems++;
    return null;
  }

  console.log("\n  THE DRAFT THE USER WOULD SEE ON THE CARD (nothing has been sent yet):");
  const d = res.ticketDraft;
  console.log(`    reporter    ${d.reporter.firstName} ${d.reporter.lastName}  (${d.reporter.osUsername}, self-asserted)`);
  console.log(`    location    ${d.reporter.location}`);
  console.log(`    contact     ${d.reporter.contactId}`);
  console.log(`    machine     ${d.machineName}`);
  console.log(`    problem     ${d.description}`);
  console.log(`    category    ${d.category}   goes to: ${d.suggestedOwner ?? "unrouted"}`);
  console.log(`    case note   ${d.summary}`);
  // The check that the D214 defect has not come back, on a REAL model's output rather than a stub.
  if (String(res.reply).includes(d.summary)) {
    console.log("  !! D214 REGRESSION: the case note appeared in the spoken reply");
    problems++;
  }

  console.log("\n  [the user presses Send on the card]");
  egress.submitted(d, HUB);
  const filed = await cloud.fileTicket(d);
  if (!filed.ok) {
    console.log(`  !! NOT FILED: ${filed.error}`);
    egress.record("ticket.failed", { error: filed.error });
    problems++;
    return null;
  }
  egress.record("ticket.filed", { reference: filed.reference, notified: filed.notified });
  said("  ->", `That's filed. Your reference is ${filed.reference} — quote that if you follow it up.`);
  console.log(`  sys    ${filed.reference} is stored for IT to pick up. No email was sent — notified=${filed.notified}`);
  filedRefs.push(filed.reference);
  return filed;
}

rule("1. FIRST EVER TICKET — the profile is empty, so the interview asks for all four fields");
await conversation(
  "the screen on my laptop is cracked right across the bottom",
  ["Ada", "Lovelace", "HQ, second floor, desk 14", "ada.lovelace@example.com"],
);

rule("2. SECOND TICKET — the profile is now complete, so it asks NOTHING and goes straight to the draft");
await conversation("my desk phone has no dial tone at all this morning", []);

rule("3. THE USER DECLINES — nothing is filed and nothing leaves the machine");
{
  said("USER:", "the ceiling light above my desk keeps flickering");
  let res = await agent.propose("the ceiling light above my desk keeps flickering");
  said("  ->", res.reply);
  if (res.escalation && res.canFile) {
    said("USER:", "no thanks");
    res = await agent.propose("no thanks");
    said("  ->", res.reply);
    if (res.ticketIntake?.stage !== "cancelled") { console.log("  !! declining did not cancel"); problems++; }
  } else {
    console.log("  (the model did not escalate this one - model variance)");
  }
}

rule("4. AN UNRELATED SENTENCE AFTER AN OFFER IS A NEW PROBLEM, NOT A MALFORMED YES");
{
  said("USER:", "my monitor has a dead pixel in the corner");
  let res = await agent.propose("my monitor has a dead pixel in the corner");
  said("  ->", res.reply);
  if (res.escalation && res.canFile) {
    said("USER:", "my printer isn't working");
    res = await agent.propose("my printer isn't working");
    said("  ->", res.reply);
    // The whole point: this must be handled as a printer problem, NOT swallowed by the intake.
    const trapped = Boolean(res.ticketIntake || res.ticketDraft);
    console.log(trapped ? "  !! THE INTAKE SWALLOWED A NEW PROBLEM" : `  ok    handled as a new problem (${res.proposal ? `proposal: ${res.proposal.capabilityId}` : "no proposal"})`);
    if (trapped) problems++;
  } else {
    console.log("  (the model did not escalate this one - model variance)");
  }
}

rule("WHAT LEFT THIS MACHINE, from the egress log");
try {
  for (const line of readFileSync(egressPath, "utf8").trim().split("\n")) {
    const l = JSON.parse(line);
    const extra = l.event === "ticket.submitted"
      ? `${l.payload.reporter.firstName} ${l.payload.reporter.lastName} <${l.payload.reporter.contactId}> -> ${l.hubUrl}`
      : JSON.stringify(Object.fromEntries(Object.entries(l).filter(([k]) => !["egressId", "at", "event"].includes(k))));
    console.log(`  ${l.at}  ${l.event.padEnd(18)} ${extra}`);
  }
} catch { console.log("  (no egress log was written)"); }

rule("RESULT");
console.log(`  filed: ${filedRefs.length ? filedRefs.join(", ") : "none"}`);
console.log(`  Read them back with:  cd server && npm.cmd run tickets -- list`);
console.log("");
console.log("  NOBODY HAS BEEN EMAILED. This build stores tickets and sends no notification (D86,");
console.log("  OPEN-4): without an ITSM there is no assignment group and no queue, so the store");
console.log("  alone is a record. `bin/tickets.mjs` is how anyone finds out a ticket exists.");
console.log("");
console.log("  NOT COVERED HERE: the review card itself. This script approves the draft in code;");
console.log("  whether the card renders its fields correctly on a screen is a click-through, and");
console.log("  client/docs/DEMO-CLICKTHROUGH.md step 6 is where that is recorded.");

try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* windows file locks */ }
// exitCode rather than exit(): the broker holds koffi handles, and process.exit() while libuv
// still has them open trips an assertion in async.c AFTER all output, which reads like a crash.
process.exitCode = problems ? 1 : 0;
