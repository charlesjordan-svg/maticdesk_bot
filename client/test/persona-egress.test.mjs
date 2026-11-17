/**
 * The live persona's microphone, and the record that audio left this machine - 2026-11-16.
 *
 * Run: node test/persona-egress.test.mjs        (from client/; part of `npm test`)
 *
 * docs/handovers/2026-11-16-claude-code-handover-nuance-live-persona.md §5.4. A live persona
 * session streams the user's microphone to a third party. `agent.js` keeps the machine name out of
 * the cloud-facing summary and `ticket/egress-audit.js` exists so a user can see what left the
 * machine - and neither was built for an open microphone, so before this file nothing recorded
 * that one had been open at all.
 *
 * Pinned here:
 *   1. THE MICROPHONE IS OFF BY DEFAULT. Opening a session mutes it, as the first command, whatever
 *      the service's own default is. (The handover lists microphone defaults as off-limits without
 *      Charles: this test is the thing that makes a change to it loud.)
 *   2. ONLY THE USER TURNS IT ON, by a gesture, with the window visible. Nothing else can produce
 *      an unmute - not a session event, not a timer, not the service.
 *   3. Hiding the window turns it off (D293: nothing is spoken with no visible window; nothing is
 *      listened to either).
 *   4. THE EGRESS RECORD SAYS A SESSION OPENED, HOW LONG IT RAN, AND THAT AUDIO WAS SENT - THE
 *      FACT, NEVER THE CONTENT. A transcript handed to it does not reach the file.
 *   5. What the record cannot know it says it does not know: a session with no closing line has no
 *      duration, and the reader does not invent one.
 *   6. The ticket half of the record (D235) reads exactly as it did.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EgressAudit, EGRESS_EVENTS, PERSONA_EGRESS_FIELDS } from "../src/ticket/egress-audit.js";
import { initialMic, micStep, micWords, MIC_STATES } from "../src/nuance/mic-policy.js";

const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}
const types = (r) => r.commands.map((c) => c.type);

// ==============================================================================================
console.log("=== 1. off by default ===");
{
  const m0 = initialMic();
  check("before any session there is no microphone to speak of", m0.state === "unavailable");
  check("exactly three states", JSON.stringify(MIC_STATES) === JSON.stringify(["unavailable", "off", "live"]));
  const r = micStep(m0, { type: "session.opened", nowMs: 1000 });
  check("opening a session leaves the microphone OFF", r.mic.state === "off", r.mic.state);
  check("…and MUTES it as the first command, rather than trusting the service's default", types(r)[0] === "session.input_audio.mute", JSON.stringify(types(r)));
  check("…and sends no unmute", !types(r).includes("session.input_audio.unmute"));
  check("opening is not audio: no audio line is written for it", !r.egress.some((e) => e.event.startsWith("persona.audio")));
}

// ==============================================================================================
console.log("\n=== 2. only the user turns it on ===");
{
  const open = micStep(initialMic(), { type: "session.opened", nowMs: 0 }).mic;
  const on = micStep(open, { type: "user.unmute", gesture: true, windowVisible: true, nowMs: 5000 });
  check("a user gesture with the window visible turns it on", on.mic.state === "live" && types(on).join() === "session.input_audio.unmute", JSON.stringify(on));
  check("…and that is the moment audio starts leaving, so it is recorded", on.egress.length === 1 && on.egress[0].event === "persona.audio.on");

  const noGesture = micStep(open, { type: "user.unmute", gesture: false, windowVisible: true, nowMs: 5000 });
  check("no gesture: refused, still off, nothing sent, and it says why", noGesture.mic.state === "off" && noGesture.commands.length === 0 && typeof noGesture.refused === "string");
  const hidden = micStep(open, { type: "user.unmute", gesture: true, windowVisible: false, nowMs: 5000 });
  check("window not visible: refused, still off, nothing sent", hidden.mic.state === "off" && hidden.commands.length === 0 && typeof hidden.refused === "string");
  const noSession = micStep(initialMic(), { type: "user.unmute", gesture: true, windowVisible: true, nowMs: 5000 });
  check("no session: there is nothing to unmute", noSession.mic.state === "unavailable" && noSession.commands.length === 0);

  // Every event that is NOT the user's unmute, from every state: none may produce an unmute.
  const others = ["session.opened", "session.closed", "user.mute", "window.hidden", "window.shown", "service.unmute", "timer", "response.done", "anything.else"];
  const live = on.mic;
  let leaked = [];
  for (const start of [initialMic(), open, live]) {
    for (const type of others) {
      const r = micStep(start, { type, gesture: true, windowVisible: true, nowMs: 9000 });
      if (types(r).includes("session.input_audio.unmute") || (start.state !== "live" && r.mic.state === "live")) leaked.push(`${start.state}+${type}`);
    }
  }
  check("no other event, from any state, can turn the microphone on", leaked.length === 0, leaked.join(", "));
  check("showing the window again does NOT turn it back on - the user does", micStep(micStep(live, { type: "window.hidden", nowMs: 9000 }).mic, { type: "window.shown", nowMs: 9500 }).mic.state === "off");

  // Structural: the unmute command is written in exactly one place in the source.
  const src = readFileSync(join(HERE, "../src/nuance/mic-policy.js"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check("the unmute command appears exactly once in mic-policy.js's code", (code.match(/session\.input_audio\.unmute/g) ?? []).length === 1);
  check("mic-policy.js is pure: it imports nothing", !/^\s*import\s/m.test(code) && !/require\(/.test(code));
}

// ==============================================================================================
console.log("\n=== 3. turning it off, and the time it was on ===");
{
  let m = micStep(initialMic(), { type: "session.opened", nowMs: 0 }).mic;
  m = micStep(m, { type: "user.unmute", gesture: true, windowVisible: true, nowMs: 10_000 }).mic;
  const off = micStep(m, { type: "user.mute", nowMs: 25_000 });
  check("the user turns it off", off.mic.state === "off" && types(off).join() === "session.input_audio.mute");
  check("…and the record says for how long it was on (15 s)", off.egress[0]?.event === "persona.audio.off" && off.egress[0].detail.audioSentMs === 15_000, JSON.stringify(off.egress));

  let again = micStep(off.mic, { type: "user.unmute", gesture: true, windowVisible: true, nowMs: 30_000 }).mic;
  const hid = micStep(again, { type: "window.hidden", nowMs: 34_000 });
  check("hiding the window turns it off and says that is why", hid.mic.state === "off" && types(hid).join() === "session.input_audio.mute" && hid.egress[0].detail.reason === "window-hidden");
  check("the time on accumulates across both stretches (15 s + 4 s)", hid.mic.audioSentMs === 19_000, String(hid.mic.audioSentMs));

  let third = micStep(hid.mic, { type: "user.unmute", gesture: true, windowVisible: true, nowMs: 40_000 }).mic;
  const closed = micStep(third, { type: "session.closed", nowMs: 41_000, reason: "error" });
  check("a session that ends with the microphone on closes the audio stretch too", closed.mic.state === "unavailable" && closed.egress.some((e) => e.event === "persona.audio.off"));
  check("…and nothing is sent to a session that has gone", closed.commands.length === 0);
  check("the total survives the close, for the closing line (15 + 4 + 1 s)", closed.mic.audioSentMs === 20_000, String(closed.mic.audioSentMs));
  check("a clock that runs backwards never produces negative time", micStep(third, { type: "user.mute", nowMs: 1 }).egress[0].detail.audioSentMs === 0);
}

// ==============================================================================================
console.log("\n=== 4. what the panel is told ===");
{
  check("no session: no microphone control is described at all", micWords("unavailable") === null);
  const off = micWords("off"), live = micWords("live");
  check("off and live both have a label and a sentence", !!off?.label && !!off?.detail && !!live?.label && !!live?.detail);
  check("the two labels differ in WORDS, never only in colour", off.label !== live.label);
  check("the live sentence says the audio LEAVES this PC", /leav|sent/i.test(live.detail) && /this PC/.test(live.detail), live.detail);
  check("the off sentence says nothing is being sent", /not|nothing/i.test(off.detail), off.detail);
  for (const w of [off, live]) {
    check(`"${w.label}": none of our vocabulary at the user (D246, D240)`, !/hub|nuance|livekit|webrtc|session\.|mute\b|egress/i.test(`${w.label} ${w.detail}`), `${w.label} ${w.detail}`);
  }
}

// ==============================================================================================
console.log("\n=== 5. the egress record: the fact, never the content ===");
{
  const dir = mkdtempSync(join(tmpdir(), "matic-persona-egress-"));
  const path = join(dir, "egress.jsonl");
  const egress = new EgressAudit({ path });
  check("the four persona events are in EGRESS_EVENTS", ["persona.opened", "persona.audio.on", "persona.audio.off", "persona.closed"].every((e) => EGRESS_EVENTS.includes(e)));
  check("the six ticket events are still there, in order", EGRESS_EVENTS.slice(0, 6).join() === "ticket.offered,ticket.declined,ticket.drafted,ticket.submitted,ticket.filed,ticket.failed");

  const SECRET = "my password is hunter2-CANARY";
  egress.persona("persona.opened", { sessionRef: "s1", persona: "mira", host: "live.example.test", microphone: "off", transcript: SECRET, instructions: SECRET, text: SECRET });
  egress.persona("persona.audio.on", { sessionRef: "s1", userSaid: SECRET });
  egress.persona("persona.audio.off", { sessionRef: "s1", audioSentMs: 15_000, reason: "user", heard: SECRET });
  egress.persona("persona.closed", { sessionRef: "s1", durationMs: 60_000, audioSentMs: 15_000, reason: "user", lastWords: SECRET });
  const raw = readFileSync(path, "utf8");
  check("four lines were written", raw.trim().split("\n").length === 4);
  check("NOTHING a caller handed it as content reached the file", !raw.includes("hunter2"), raw);
  check("every key on every persona line is on the allow-list (plus the three every line has)", raw.trim().split("\n").every((l) => Object.keys(JSON.parse(l)).every((k) => ["egressId", "at", "event", ...PERSONA_EGRESS_FIELDS].includes(k))));
  check("the allow-list itself names no content field", !PERSONA_EGRESS_FIELDS.some((f) => /transcript|text|said|heard|words|instruction|audio$|content|prompt/i.test(f)), PERSONA_EGRESS_FIELDS.join());
  check("the opening line says where it was sending and that the microphone started off", /"host":"live\.example\.test"/.test(raw) && /"microphone":"off"/.test(raw));

  let threw = false;
  try { egress.persona("ticket.submitted", { payload: { description: "x" } }); } catch { threw = true; }
  check("persona() refuses a ticket event - the payload door stays where it was", threw);
  try { threw = false; egress.persona("persona.transcript", {}); } catch { threw = true; }
  check("persona() refuses an event that is not one of the four", threw);

  // ---- reading it back ----
  const s = egress.personaSessions();
  check("one session reads back", s.length === 1, JSON.stringify(s));
  check("…with how long it ran and how long audio was sent", s[0].durationMs === 60_000 && s[0].audioSentMs === 15_000 && s[0].audioWasSent === true && s[0].persona === "mira");

  egress.persona("persona.opened", { sessionRef: "s2", persona: "mira", host: "live.example.test", microphone: "off" });
  egress.persona("persona.closed", { sessionRef: "s2", durationMs: 9_000, audioSentMs: 0, reason: "user" });
  egress.persona("persona.opened", { sessionRef: "s3", persona: "mira", host: "live.example.test", microphone: "off" });
  egress.persona("persona.audio.on", { sessionRef: "s3" });
  // s3 never closes: the process died, or the machine did.
  const all = egress.personaSessions();
  check("newest first", all.map((x) => x.sessionRef).join() === "s3,s2,s1", all.map((x) => x.sessionRef).join());
  const s2 = all[1], s3 = all[0];
  check("a session whose microphone was never on says NO audio was sent - a fact, and a reassuring one", s2.audioWasSent === false && s2.audioSentMs === 0);
  check("a session with no closing line has NO duration - unknown is not zero", s3.closedAt === null && s3.durationMs === null);
  check("…but it DOES say audio was sent, because the line that says so was written when it started", s3.audioWasSent === true && s3.audioSentMs === null);

  // ---- the ticket half is untouched ----
  const line = (o) => JSON.stringify({ egressId: "x", ...o }) + "\n";
  const p2 = join(dir, "mixed.jsonl");
  writeFileSync(p2, [
    line({ at: "2026-11-16T10:00:00.000Z", event: "ticket.submitted", payload: { description: "Printer jams", category: "printing" } }),
    line({ at: "2026-11-16T10:00:01.000Z", event: "persona.audio.on", sessionRef: "s9" }),
    line({ at: "2026-11-16T10:00:02.000Z", event: "persona.closed", sessionRef: "s9", durationMs: 1, audioSentMs: 1 }),
    line({ at: "2026-11-16T10:00:03.000Z", event: "ticket.filed", reference: "MD-2000", ticketId: "t", notified: false }),
  ].join(""));
  const mixed = new EgressAudit({ path: p2 });
  const filed = mixed.filedFromThisMachine();
  check("persona lines between a submit and its filing do not break the pairing (D235)", filed.length === 1 && filed[0].reference === "MD-2000" && filed[0].description === "Printer jams");
  check("a session with no opening line is still listed rather than dropped", mixed.personaSessions().length === 1 && mixed.personaSessions()[0].openedAt === null);
  check("a missing log is an empty list, not a throw", new EgressAudit({ path: join(dir, "nope.jsonl") }).personaSessions().length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
