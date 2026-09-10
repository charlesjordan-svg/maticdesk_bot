/**
 * "Where's my ticket?" - D235, 2026-09-10.
 *
 * Run: node test/ticket-status.test.mjs        (from client/; part of `npm test`)
 *
 * Observed: "what is the status of my open tickets?" went to the knowledge base and was declined as
 * a gap in company guidance. The endpoint cannot see the hub's ticket table (no route, no user
 * identity - D54, D68/D69), but it knows what IT filed, and it can say so and say what it cannot do.
 *
 * Pinned here: the classifier recognises the question and does NOT mistake a request for a NEW
 * ticket for it; the egress log reads back as the list of filed tickets (submitted+filed pairs only,
 * never a failed or unanswered one); the agent answers from that list with no provider call and no
 * proposal; every reply says status lookup is not built; and a build with no ticket store says so.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classify } from "../src/router/classify.js";
import { ticketStatusReply } from "../src/router/social.js";
import { EgressAudit } from "../src/ticket/egress-audit.js";
import { Agent } from "../src/agent/agent.js";
import persona from "../src/router/persona.json" with { type: "json" };

let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}

// ==============================================================================================
console.log("=== 1. the classifier: a question about an EXISTING ticket, and not a request for a new one ===");
for (const t of [
  "what is the status of my open tickets?",
  "i opened a ticket already what is the status?",
  "where's my ticket",
  "any update on my ticket?",
  "has my ticket been looked at",
  "can you check the ticket I raised yesterday",
  "what happened to the ticket",
]) {
  const r = classify(t);
  check(`"${t}" -> tickets`, r.kind === "tickets", `${r.kind} (${r.why})`);
}
for (const t of [
  "can you raise a ticket for me",
  "please open a ticket, my screen is cracked",
  "i want to log a ticket",
  "raise my ticket now please",
  "my printer isn't working",
  "what is the shortcut to hide the desktop",
]) {
  const r = classify(t);
  check(`"${t}" is NOT tickets (${r.kind})`, r.kind !== "tickets", r.why);
}

// ==============================================================================================
console.log("\n=== 2. the egress log reads back as what was FILED, and nothing else ===");
const dir = mkdtempSync(join(tmpdir(), "matic-egress-"));
const path = join(dir, "egress.jsonl");
const line = (o) => JSON.stringify({ egressId: Math.random().toString(16).slice(2), ...o }) + "\n";
writeFileSync(path, [
  line({ at: "2026-09-06T16:17:00.000Z", event: "ticket.offered" }),
  line({ at: "2026-09-06T16:18:00.000Z", event: "ticket.submitted", hubUrl: "http://127.0.0.1:8787", payload: { description: "My screen is cracked.. it has a big line down it", category: "hardware", suggestedOwner: "desktop_support", reporter: { osUsername: "Charles" } } }),
  line({ at: "2026-09-06T16:18:06.713Z", event: "ticket.filed", reference: "MD-1006", ticketId: "71903d24", notified: false }),
  line({ at: "2026-09-07T09:00:00.000Z", event: "ticket.submitted", payload: { description: "Printer jams", category: "printing" } }),
  line({ at: "2026-09-07T09:00:03.000Z", event: "ticket.failed", error: "503", filed: false }),
  line({ at: "2026-09-08T10:00:00.000Z", event: "ticket.submitted", payload: { description: "Timed out one", category: "other" } }),
  "this line is not json\n",
  line({ at: "2026-09-09T11:00:00.000Z", event: "ticket.submitted", payload: { description: "Wifi keeps dropping in the meeting room", category: "network", suggestedOwner: "network_team" } }),
  line({ at: "2026-09-09T11:00:02.000Z", event: "ticket.filed", reference: "MD-1042", ticketId: "abc", notified: false }),
].join(""));
const egress = new EgressAudit({ path });
const filed = egress.filedFromThisMachine();
check("two filed tickets, newest first", filed.length === 2 && filed[0].reference === "MD-1042" && filed[1].reference === "MD-1006", JSON.stringify(filed.map((f) => f.reference)));
check("the failed one is not listed", !filed.some((f) => f.description === "Printer jams"));
check("the submitted-but-never-answered one is not listed", !filed.some((f) => f.description === "Timed out one"));
check("a filed ticket carries the user's own description from the paired submitted line", filed[1].description.startsWith("My screen is cracked") && filed[1].category === "hardware");
check("the unparseable line was skipped, not fatal", true);
check("notified is carried as false (D213)", filed.every((f) => f.notified === false));
check("a missing log is an empty list, not a throw", new EgressAudit({ path: join(dir, "nope.jsonl") }).filedFromThisMachine().length === 0);

// ==============================================================================================
console.log("\n=== 3. the reply: what was filed, and that status lookup is NOT built ===");
const now = new Date("2026-09-09T15:00:00.000Z");
const someReply = ticketStatusReply(filed, { now });
check("names both references", someReply.includes("MD-1042") && someReply.includes("MD-1006"), someReply);
check("uses the user's own words for the problem", /Wifi keeps dropping/.test(someReply) && /screen is cracked/.test(someReply), someReply);
check("says it cannot see status", /can't see how they're getting on|isn't something I can do/.test(someReply), someReply);
check("does NOT say IT has been notified or the ticket is being worked on", !/notified|being worked|in progress|IT has/.test(someReply));
check("no unfilled placeholder", !/\{(list|reference|when|description)\}/.test(someReply));
check("spoken time, not ISO", !/T\d\d:\d\d:\d\d|Z\b/.test(someReply), someReply);
check("empty list -> the 'none' line", ticketStatusReply([]) === persona.tickets.none);
check("null (cannot file) -> the 'unavailable' line", ticketStatusReply(null) === persona.tickets.unavailable);
const many = Array.from({ length: 5 }, (_, i) => ({ reference: `MD-${2000 + i}`, filedAt: "2026-09-09T10:00:00.000Z", description: `problem ${i}` }));
check("more than three -> three named and a count", /MD-2000/.test(ticketStatusReply(many, { now })) && /and 2 more before that/.test(ticketStatusReply(many, { now })) && !/MD-2004/.test(ticketStatusReply(many, { now })));

// ==============================================================================================
console.log("\n=== 4. the agent: answers from the record, calls no provider, proposes nothing ===");
const cloud = { available: true, calls: [], async propose(t) { this.calls.push(t); return { ok: false, error: "must not be called" }; }, async ask(t) { this.calls.push(t); return { ok: false }; } };
const stubBroker = { validate: () => ({ ok: true, errors: [] }), listCapabilities: () => [] };
function agentWith(deps) {
  const agent = new Agent({ broker: stubBroker, cloud, ...deps, onLog: () => {} });
  const probe = { online: true, primary: [], services: {} };
  agent.diagnose = () => ({ probe, summary: {}, identity: {}, panel: {} });
  return agent;
}
{
  const res = await agentWith({ egress }).propose("what is the status of my open tickets?");
  check("returns ticketStatus", Boolean(res.ticketStatus), JSON.stringify(res).slice(0, 200));
  check("no proposal, no answer, no social", !res.proposal && !res.answer && !res.social);
  check("the provider was not called", cloud.calls.length === 0);
  check("two filed, canFile true, canQueryHub FALSE", res.ticketStatus.filed.length === 2 && res.ticketStatus.canFile === true && res.ticketStatus.canQueryHub === false);
  check("the reply names the newest reference", /MD-1042/.test(res.reply));
}
{
  const res = await agentWith({ egress: null }).propose("where is my ticket");
  check("no egress (cannot file) -> the 'unavailable' line and canFile false", res.ticketStatus?.canFile === false && res.reply === persona.tickets.unavailable);
  check("still no provider call", cloud.calls.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
