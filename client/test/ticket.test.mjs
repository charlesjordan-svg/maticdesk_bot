/**
 * The ticket path: profile, intake, and the agent branch that arms it. D213-D217, 2026-09-04.
 *
 * Run: node test/ticket.test.mjs        (from client/; part of `npm test`)
 *
 * Headless. No hub, no database, no Electron — the profile store takes its directory as a
 * parameter and the intake takes a clock, precisely so this file can exist.
 *
 * WHAT IS BEING PINNED, in the order it matters:
 *
 * 1. **THE INTAKE NEVER TRAPS A TURN.** This is the property that makes it safe to run the intake
 *    check ahead of tier-0 in Agent.propose. If it can be wrong in a way that swallows a real
 *    problem statement, the feature is a net loss whatever else it does.
 * 2. **THE CASE NOTE IS NEVER SPOKEN** (D214). The defect that started this: `summary` is written
 *    for the assignee, in the third person, and reading it aloud made the avatar talk about the
 *    user as if they were not there.
 * 3. **NOTHING IS OFFERED THAT CANNOT BE DELIVERED.** With no filing path the escalation says so
 *    instead of asking a question no code would hear — and the frozen demo build (`provider:
 *    "cloud"`, no `fileTicket`) is in exactly that configuration BY CONSTRUCTION.
 * 4. **ONLY WHAT IT DOES NOT KNOW IS ASKED.** A complete profile produces zero questions.
 */
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProfileStore, PROFILE_FIELDS, osUsername } from "../src/profile/profile.js";
import { TicketIntake, EXPIRY_MS } from "../src/ticket/intake.js";
import { EgressAudit } from "../src/ticket/egress-audit.js";
import { escalationReply } from "../src/agent/prompt.js";
import { Agent } from "../src/agent/agent.js";

let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}

const dirs = [];
function tempDir() {
  const d = mkdtempSync(join(tmpdir(), "matic-ticket-"));
  dirs.push(d);
  return d;
}

const ESCALATION = {
  summary: "The user reports a cracked laptop screen; physical damage.",
  category: "hardware",
  whatWasChecked: "Machine is online; no service faults.",
  suggestedOwner: "desktop_support",
};

const COMPLETE = { firstName: "Ada", lastName: "Lovelace", location: "HQ Floor 2", contactId: "ada@example.com" };

// ==============================================================================================
console.log("=== 1. D214: the assignee's case note is never in the avatar's mouth ===");
{
  const reply = escalationReply(ESCALATION);
  check("the spoken line does not contain the summary", !reply.includes(ESCALATION.summary), reply);
  check("it says who it needs, in speakable form", /desktop support/.test(reply), reply);
  check("it does NOT say the raw enum value", !/desktop_support/.test(reply), reply);
  check("it is an offer, so it ends in a question", reply.trim().endsWith("?"), reply);

  const unrouted = escalationReply({ ...ESCALATION, suggestedOwner: null });
  check("an unknown owner still offers a ticket", /open a ticket/.test(unrouted) && unrouted.trim().endsWith("?"), unrouted);
  check("and does not invent a team", !/desktop|network|identity|vendor|facilities/i.test(unrouted), unrouted);

  // The offer must not be spoken where nothing can honour it.
  const cannot = escalationReply(ESCALATION, { canFile: false });
  check("canFile:false makes no offer", !/Would you like me to\?/.test(cannot), cannot);
  check("and says plainly that nothing was filed", /nothing has been filed/.test(cannot), cannot);
  check("and still says what it cannot fix", /can't fix this one from here/.test(cannot), cannot);
}

// ==============================================================================================
console.log("\n=== 2. the profile store ===");
{
  const store = new ProfileStore({ dir: tempDir() });
  check("a missing file is empty, not an error", store.read().firstName === null);
  check("every required field is missing on a fresh profile", store.missing().length === PROFILE_FIELDS.filter((f) => f.required).length);

  store.write({ firstName: "Ada", lastName: "  Lovelace  " });
  check("values are trimmed on write", store.read().lastName === "Lovelace");
  check("a partial write leaves the rest missing", store.missing().map((f) => f.key).join(",") === "location,contactId");

  store.write({ location: "HQ Floor 2", contactId: "ada@example.com" });
  check("nothing is missing once complete", store.missing().length === 0);

  // The one field that is never taken from the file.
  store.write({ osUsername: "somebody-else" });
  check("osUsername cannot be written into the profile", !("osUsername" in JSON.parse(readFileSync(store.path, "utf8"))));
  check("and reporter() reads it live from the OS instead", store.reporter().osUsername === osUsername());

  // A hand-edited file must not be able to smuggle fields into a ticket.
  writeFileSync(store.path, JSON.stringify({ ...COMPLETE, evil: "x", osUsername: "root" }), "utf8");
  const reporter = store.reporter();
  check("unknown keys in the file are dropped", reporter.evil === undefined);
  check("and a planted osUsername is overwritten by the real one", reporter.osUsername === osUsername());
}
{
  const store = new ProfileStore({ dir: tempDir() });
  writeFileSync(store.path, "{ this is not json", "utf8");
  check("a corrupt profile reads as empty rather than throwing", store.read().firstName === null);
}

// ==============================================================================================
console.log("\n=== 3. THE INTAKE NEVER TRAPS A TURN ===");
{
  const store = new ProfileStore({ dir: tempDir() });
  store.write(COMPLETE);

  // 3a. An unrecognised answer to the offer is a NEW PROBLEM, not a malformed yes.
  const intake = new TicketIntake({ profile: store });
  intake.offer({ escalation: ESCALATION, userText: "my screen is cracked" });
  const stray = intake.accept("actually my printer has stopped working");
  check("an unrelated sentence passes through", stray.kind === "passthrough", JSON.stringify(stray));
  check("and the intake is cleared, so it cannot swallow the turn after it either", intake.isPending === false);

  // 3b. Cancel words cancel, at the offer stage.
  for (const no of ["no", "No.", "no thanks", "nope", "cancel", "never mind", "forget it", "not now"]) {
    const i = new TicketIntake({ profile: store });
    i.offer({ escalation: ESCALATION, userText: "x" });
    const r = i.accept(no);
    check(`"${no}" cancels`, r.kind === "cancelled" && i.isPending === false, r.kind);
    if (r.kind === "cancelled") check(`  and "${no}" says nothing was sent`, /nothing has left this machine/.test(r.reply));
  }

  // 3c. A stale intake expires rather than answering.
  let clock = 1_000_000;
  const stale = new TicketIntake({ profile: store, now: () => clock });
  stale.offer({ escalation: ESCALATION, userText: "x" });
  check("pending while fresh", stale.isPending === true);
  clock += EXPIRY_MS + 1;
  check("expired after EXPIRY_MS", stale.isPending === false);
  check("and accept() on an expired intake passes through", stale.accept("yes").kind === "passthrough");
}

// ==============================================================================================
console.log("\n=== 4. yes -> draft, and ONLY what is not already known is asked ===");
{
  // 4a. A complete profile asks NOTHING.
  const complete = new ProfileStore({ dir: tempDir() });
  complete.write(COMPLETE);
  const i1 = new TicketIntake({ profile: complete });
  i1.offer({ escalation: ESCALATION, userText: "my screen is cracked", machineName: "WAKANDA" });
  const r1 = i1.accept("yes please hand to it");
  check("a complete profile goes straight to the draft, asking nothing", r1.kind === "draft", r1.kind);
  check("the draft carries the user's OWN WORDS as the description", r1.draft.description === "my screen is cracked");
  check("and the model's case note as the summary, kept separate", r1.draft.summary === ESCALATION.summary);
  check("category and owner come from the escalation", r1.draft.category === "hardware" && r1.draft.suggestedOwner === "desktop_support");
  check("the machine is carried", r1.draft.machineName === "WAKANDA");
  check("the reporter is complete", r1.draft.reporter.firstName === "Ada" && r1.draft.reporter.contactId === "ada@example.com");
  check("the intake is finished once the draft exists", i1.isPending === false);

  // The exact sentence from the 2026-09-04 click-through, which previously landed nowhere.
  const i2 = new TicketIntake({ profile: complete });
  i2.offer({ escalation: ESCALATION, userText: "x" });
  check('THE OBSERVED DEFECT: "yes please hand to it" is heard', i2.accept("yes please hand to it").kind === "draft");

  // 4b. An empty profile asks for each missing field, in order, and only once.
  const empty = new ProfileStore({ dir: tempDir() });
  const i3 = new TicketIntake({ profile: empty });
  i3.offer({ escalation: ESCALATION, userText: "my screen is cracked" });
  const asked = [];
  let step = i3.accept("yes");
  while (step.kind === "question") {
    asked.push(step.field);
    step = i3.accept({ firstName: "Ada", lastName: "Lovelace", location: "HQ Floor 2", contactId: "ada@example.com" }[step.field]);
  }
  check("it asked for exactly the missing fields, in declaration order",
    asked.join(",") === "firstName,lastName,location,contactId", asked.join(","));
  check("and then produced the draft", step.kind === "draft", step.kind);
  check("what was collected is remembered", empty.read().location === "HQ Floor 2");
  check("so a SECOND ticket asks nothing", (() => {
    const i4 = new TicketIntake({ profile: empty });
    i4.offer({ escalation: ESCALATION, userText: "y" });
    return i4.accept("yes").kind === "draft";
  })());
  // The preamble appears ONCE, on the turn the offer is accepted. Being asked your name with no
  // explanation, straight after saying yes to something else, reads as a non-sequitur.
  const fresh = new ProfileStore({ dir: tempDir() });
  const i6 = new TicketIntake({ profile: fresh });
  i6.offer({ escalation: ESCALATION, userText: "x" });
  const q1 = i6.accept("yes");
  const q2 = i6.accept("Ada");
  check("the first question explains why it is being asked", /I'll need a few details for the ticket/.test(q1.reply), q1.reply);
  check("and the second does not repeat the preamble", !/I'll need a few details/.test(q2.reply), q2.reply);

  // 4c. Cancel mid-interview.
  const empty2 = new ProfileStore({ dir: tempDir() });
  const i5 = new TicketIntake({ profile: empty2 });
  i5.offer({ escalation: ESCALATION, userText: "x" });
  i5.accept("yes");
  const cancelled = i5.accept("cancel");
  check("cancelling mid-interview cancels", cancelled.kind === "cancelled" && i5.isPending === false);
  check("and nothing half-collected is written to the profile", empty2.read().firstName === null);
}

// ==============================================================================================
console.log("\n=== 5. the agent arms the intake ONLY when the provider can file ===");
{
  const broker = { listCapabilities: () => [], validate: () => ({ ok: true, violations: [] }) };
  const escalating = { propose: async () => ({ ok: true, escalate: true, escalation: ESCALATION, reply: escalationReply(ESCALATION) }) };

  // 5a. With a filing provider: the offer is armed and the reply asks.
  const store = new ProfileStore({ dir: tempDir() });
  store.write(COMPLETE);
  const intake = new TicketIntake({ profile: store });
  const canFile = new Agent({ broker, cloud: { ...escalating, fileTicket: async () => ({ ok: true }) }, intake });
  const r = await canFile.propose("my screen is cracked");
  check("escalated", r.escalation === ESCALATION);
  check("canFile is reported to the renderer", r.canFile === true);
  check("the reply asks", r.reply.trim().endsWith("?"), r.reply);
  check("THE CASE NOTE IS NOT IN THE REPLY", !r.reply.includes(ESCALATION.summary), r.reply);
  check("and the intake is now pending, so the next turn is heard", intake.isPending === true);

  const next = await canFile.propose("yes please");
  check("the next turn produces a draft rather than a new proposal", Boolean(next.ticketDraft), JSON.stringify(Object.keys(next)));
  check("and the draft never reached the broker", next.proposal === undefined && next.validation === undefined);

  // 5b. THE FROZEN DEMO BUILD. CloudClient has no fileTicket, so this is its configuration.
  const cannot = new Agent({ broker, cloud: escalating, intake: new TicketIntake({ profile: store }) });
  const r2 = await cannot.propose("my screen is cracked");
  check("no fileTicket -> canFile is false", r2.canFile === false);
  check("and the reply makes NO offer", !/Would you like me to\?/.test(r2.reply), r2.reply);
  check("and says plainly that nothing was filed", /nothing has been filed/.test(r2.reply), r2.reply);

  // 5c. No intake at all is a supported configuration, not a crash.
  const noIntake = new Agent({ broker, cloud: escalating });
  const r3 = await noIntake.propose("my screen is cracked");
  check("no intake -> still escalates, still makes no offer", r3.escalation === ESCALATION && r3.canFile === false);
}

// ==============================================================================================
console.log("\n=== 6. the egress log records WHAT LEFT, not just that something did ===");
{
  const dir = tempDir();
  const path = join(dir, "egress.jsonl");
  const audit = new EgressAudit({ path });
  const draft = { description: "d", summary: "s", category: "hardware", reporter: COMPLETE };
  audit.submitted(draft, "http://127.0.0.1:8787");
  audit.record("ticket.filed", { reference: "MD-1000", notified: false });

  const lines = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  check("two lines", lines.length === 2);
  check("the submitted line carries the WHOLE payload", lines[0].payload.reporter.contactId === "ada@example.com");
  check("and where it was sent", lines[0].hubUrl === "http://127.0.0.1:8787");
  check("and the filed line carries notified:false, so the record cannot imply an alert",
    lines[1].event === "ticket.filed" && lines[1].notified === false);
  check("every line is individually parseable JSONL with a timestamp and an id",
    lines.every((l) => l.egressId && l.at));
}
{
  // An unwritable path must not throw: losing the audit line is bad, losing the ticket is worse.
  const audit = new EgressAudit({ path: join(tempDir(), "nope bad", "e.jsonl") });
  let threw = false;
  try { audit.record("ticket.offered", {}); } catch { threw = true; }
  check("a failed egress write does not throw", threw === false);
}

for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* windows file locks */ } }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
