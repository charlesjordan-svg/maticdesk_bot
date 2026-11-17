// @ts-check
/**
 * The egress log — what left this machine, and who agreed to it (D217, 2026-09-04).
 *
 * ===============================================================================================
 * WHY THIS IS A SEPARATE LOG FROM audit/audit.jsonl
 * ===============================================================================================
 *
 * The broker's audit log answers *what changed on this machine*. This one answers *what left it*.
 * They are different questions with different readers, and two things follow from keeping them
 * apart:
 *
 *   1. **The broker owns its file.** `audit/audit.jsonl` is written by the Broker, from inside the
 *      privileged half, and every line is a capability execution with a consent nonce. Filing a
 *      ticket is not a capability, does not go through the broker, and has no nonce — writing it
 *      into that file from outside the broker would break the ownership that makes the audit log
 *      worth anything.
 *   2. **`npm test` writes to the broker's log and `reset-demo` deletes it** (CLAUDE.md). A record
 *      of personal data leaving the endpoint should not share a lifecycle with a demo reset.
 *
 * ===============================================================================================
 * WHY IT RECORDS THE PAYLOAD AND NOT JUST THE DECISION
 * ===============================================================================================
 *
 * Filing a ticket is the FIRST time identity leaves this endpoint. Until now `Agent.identify()`
 * carried a comment saying "Nothing here is sent anywhere" and tests asserted it: the machine name
 * and username go in the facts panel and never to a model.
 *
 * That is no longer unconditionally true, and the honest response is not to weaken the comment but
 * to make the exception observable. "The user consented to a ticket" is unfalsifiable a week later.
 * "Here is exactly what was sent" is checkable — and the threat model gives egress its own risk
 * tier for the same reason (D79b, §8).
 *
 * The consent recorded here is a PROSE confirmation in the conversation plus a submit on the review
 * card, NOT a broker consent card. That was a deliberate choice: the consent card means "a
 * privileged change to this machine", and D198 is about not diluting it. Routing a non-machine
 * action through it would make the broker an authority on something it has no business validating.
 *
 * ===============================================================================================
 * THE LIVE PERSONA'S MICROPHONE (2026-11-16) - THE FACT, NEVER THE CONTENT
 * ===============================================================================================
 *
 * A live persona session sends the user's microphone to a third party for as long as it is on.
 * That is egress of a kind this file was not built for: there is no payload to show, because the
 * payload is a stream, and there is no review card, because nobody reviews a sentence before
 * saying it. What CAN be recorded is that a session opened, where it was sending, how long it
 * ran, and for how much of that time audio left the machine. So that is what is recorded, and
 * this is an EXTENSION of what the record claims - "what left this machine" now includes "your
 * voice did, for this long" - not a narrowing of it.
 *
 * The ticket half records the payload verbatim, on purpose (above). THIS HALF RECORDS NO CONTENT
 * AT ALL, also on purpose, and the two rules do not conflict: a ticket is a document the user
 * approved, and writing it down again adds nothing to its exposure. A transcript of an open
 * microphone is the colleague in the background and the password read aloud - writing THAT to a
 * file on disk would create the very record the user never agreed to. `persona()` therefore takes
 * an allow-list of fields and drops everything else, so a caller cannot put words in this file by
 * forgetting a rule. When the microphone is on is decided in `src/nuance/mic-policy.js`.
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

/** Events, in the order one turn produces them. */
export const EGRESS_EVENTS = [
  "ticket.offered",   // the assistant offered; nothing has been sent
  "ticket.declined",  // the user said no; nothing has been sent
  "ticket.drafted",   // a draft exists and is on screen; nothing has been sent
  "ticket.submitted", // the user pressed submit - THIS IS THE MOMENT DATA LEAVES
  "ticket.filed",     // the hub accepted it
  "ticket.failed",    // it did not; nothing is stored on the hub
  // ---- the live persona (2026-11-16). Appended, never interleaved: the six above keep their order.
  "persona.opened",    // a live session started; the microphone starts OFF (mic-policy.js rule 1)
  "persona.audio.on",  // the user turned the microphone on - THIS IS THE MOMENT AUDIO LEAVES
  "persona.audio.off", // it stopped, with how long that stretch ran and why it ended
  "persona.closed",    // the session ended, with how long it ran and the total audio time
];

/** The four persona events `persona()` accepts. */
const PERSONA_EVENTS = Object.freeze(["persona.opened", "persona.audio.on", "persona.audio.off", "persona.closed"]);

/**
 * Every field a persona line may carry besides `egressId`, `at` and `event`. Facts about the
 * session and nothing about what was said in it:
 *
 *   sessionRef   this endpoint's own reference for the session, so its lines can be paired
 *   persona      which stock persona was on screen
 *   host         the endpoint's own claim about where it was sending (same reason `hubUrl` is kept)
 *   microphone   the state the microphone STARTED in. "off", unless a founder decision changes it
 *   durationMs   how long the session ran, on the closing line
 *   audioSentMs  how long audio was being sent - one stretch on `audio.off`, the total on `closed`
 *   reason       why a stretch or a session ended, as a short code
 *
 * `test/persona-egress.test.mjs` fails if a name that could hold content is added here.
 */
export const PERSONA_EGRESS_FIELDS = Object.freeze(["sessionRef", "persona", "host", "microphone", "durationMs", "audioSentMs", "reason"]);

export class EgressAudit {
  /** @param {{ path: string, onLog?: (s: string) => void }} deps */
  constructor({ path, onLog = () => {} }) {
    this.path = path;
    this.onLog = onLog;
  }

  /**
   * Append one line. Never throws.
   *
   * A failure to write must not fail the ticket: the user asked for help, and losing the audit
   * line is worse than losing the ticket only if the ticket is the thing that gets lost. It is
   * logged loudly instead, because an audit log that silently stops being written is the worst of
   * the three outcomes.
   *
   * @param {string} event  one of EGRESS_EVENTS
   * @param {object} detail
   */
  record(event, detail = {}) {
    const line = {
      egressId: randomUUID(),
      at: new Date().toISOString(),
      event,
      // The endpoint's own claim about where it was sending. Kept even on failure, so an attempt
      // to reach the wrong hub is visible.
      ...detail,
    };
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      appendFileSync(this.path, JSON.stringify(line) + "\n", "utf8");
    } catch (err) {
      this.onLog(`[egress] COULD NOT WRITE THE EGRESS LOG (${err.message}). The action still happened: ${event}`);
    }
    return line.egressId;
  }

  /**
   * What was actually sent, for a `ticket.submitted` line.
   *
   * The whole body, verbatim, including the reporter's name and contact details. That is the point
   * — a record of an egress event that omits the personal data is a record of the wrong thing, and
   * this file already lives on the user's own machine holding their own information.
   *
   * @param {object} draft
   * @param {string} hubUrl
   */
  submitted(draft, hubUrl) {
    return this.record("ticket.submitted", {
      hubUrl,
      // Named `payload` rather than spread, so a reader can tell at a glance where the boundary
      // between "our metadata" and "what we sent" is.
      payload: draft,
    });
  }

  /**
   * One line about the live persona: that a session opened or closed, or that audio started or
   * stopped leaving this machine. THE FACT, NEVER THE CONTENT - see the header.
   *
   * Throws on an event that is not one of the four, which is the one place this class throws: a
   * caller reaching for `persona("ticket.submitted", { payload })` or inventing a
   * `persona.transcript` is a programming error to find in a test, not something to write down
   * and carry on. Writing the line itself still never throws (`record()`).
   *
   * Fields not on `PERSONA_EGRESS_FIELDS` are DROPPED and the drop is logged by NAME only - the
   * value of a field that should not be here is exactly what must not reach a log either.
   *
   * @param {string} event  one of the four `persona.*` events
   * @param {object} detail
   */
  persona(event, detail = {}) {
    if (!PERSONA_EVENTS.includes(event)) {
      throw new Error(`EgressAudit.persona() records only ${PERSONA_EVENTS.join(", ")} - not "${event}"`);
    }
    const kept = {};
    const dropped = [];
    for (const [k, v] of Object.entries(detail ?? {})) {
      if (PERSONA_EGRESS_FIELDS.includes(k)) kept[k] = v;
      else dropped.push(k);
    }
    if (dropped.length) {
      this.onLog(`[egress] ${event}: dropped ${dropped.length} field(s) that are not facts about the session (${dropped.join(", ")}). Nothing said in a session is written to the egress record.`);
    }
    return this.record(event, kept);
  }

  /**
   * The live persona sessions THIS MACHINE has opened, newest first, read back from the log - so
   * "what left this machine?" has an answer for a microphone as well as for a ticket.
   *
   * WHAT IT WILL NOT INVENT. A session with no `persona.closed` line - the process died, or the
   * machine did - has `closedAt: null` and `durationMs: null`: how long it ran is not known and
   * zero would be a claim. But `audioWasSent` is still TRUE for it if an `audio.on` line exists,
   * because that line is written when audio STARTS, precisely so that this case can say so; its
   * `audioSentMs` is null for the same reason its duration is. A session that closed with the
   * microphone never turned on reports `audioWasSent: false` and `audioSentMs: 0`, which is a fact
   * and the reassuring one.
   *
   * Never throws; same degradation as `filedFromThisMachine()`.
   *
   * @returns {Array<{ sessionRef: string, persona: string|null, host: string|null, microphoneStartedAs: string|null, openedAt: string|null, closedAt: string|null, durationMs: number|null, audioWasSent: boolean, audioSentMs: number|null, reason: string|null }>}
   */
  personaSessions() {
    let text;
    try { text = readFileSync(this.path, "utf8"); } catch { return []; }
    /** @type {Map<string, any>} */
    const byRef = new Map();
    const get = (ref) => {
      if (!byRef.has(ref)) {
        byRef.set(ref, { sessionRef: ref, persona: null, host: null, microphoneStartedAs: null, openedAt: null, closedAt: null, durationMs: null, audioWasSent: false, audioSentMs: null, reason: null });
      }
      return byRef.get(ref);
    };
    for (const raw of text.split("\n")) {
      if (!raw.trim()) continue;
      let line;
      try { line = JSON.parse(raw); } catch { continue; }
      if (!PERSONA_EVENTS.includes(line.event) || typeof line.sessionRef !== "string") continue;
      const s = get(line.sessionRef);
      if (line.event === "persona.opened") {
        s.openedAt = line.at ?? null;
        s.persona = line.persona ?? null;
        s.host = line.host ?? null;
        s.microphoneStartedAs = line.microphone ?? null;
      } else if (line.event === "persona.audio.on" || line.event === "persona.audio.off") {
        s.audioWasSent = true;
      } else if (line.event === "persona.closed") {
        s.closedAt = line.at ?? null;
        s.durationMs = typeof line.durationMs === "number" ? line.durationMs : null;
        s.audioSentMs = typeof line.audioSentMs === "number" ? line.audioSentMs : null;
        if (s.audioSentMs !== null && s.audioSentMs > 0) s.audioWasSent = true;
        s.reason = line.reason ?? null;
      }
    }
    // Insertion order is first-seen order, so reversing it is newest first.
    return [...byRef.values()].reverse();
  }

  /**
   * The tickets THIS MACHINE has filed, newest first, read back from the log. Added 2026-09-10
   * (D235) so "where's my ticket?" gets an answer from something the endpoint actually knows.
   *
   * WHAT THIS IS AND IS NOT. It is the endpoint's own record that a `ticket.submitted` was followed
   * by a `ticket.filed` with a reference — the hub said it stored it (and, per D213, notified
   * nobody). It is NOT the ticket's current status: nothing on the endpoint can see the hub's
   * ticket table, that needs a route and a user identity that do not exist (D54, D68/D69), and
   * the reply that uses this list says so. A `submitted` with no `filed` after it is not listed -
   * it either failed (its own line says so) or the answer never came back (`filed: null`), and
   * listing it would claim a filing the hub never confirmed.
   *
   * Never throws. No file, an unreadable line, or a half-written last line all degrade to "fewer
   * rows", never to an exception in a conversational turn.
   *
   * @returns {Array<{ reference: string, ticketId: string|null, filedAt: string, submittedAt: string|null, description: string, category: string|null, suggestedOwner: string|null, notified: boolean }>}
   */
  filedFromThisMachine() {
    let text;
    try { text = readFileSync(this.path, "utf8"); } catch { return []; }
    const out = [];
    let pending = null;
    for (const raw of text.split("\n")) {
      if (!raw.trim()) continue;
      let line;
      try { line = JSON.parse(raw); } catch { continue; }
      if (line.event === "ticket.submitted") {
        pending = line;
      } else if (line.event === "ticket.filed" && line.reference) {
        out.push({
          reference: String(line.reference),
          ticketId: line.ticketId ?? null,
          filedAt: line.at,
          submittedAt: pending?.at ?? null,
          description: String(pending?.payload?.description ?? "").trim(),
          category: pending?.payload?.category ?? null,
          suggestedOwner: pending?.payload?.suggestedOwner ?? null,
          notified: line.notified === true,
        });
        pending = null;
      } else if (line.event === "ticket.failed") {
        pending = null;
      }
    }
    return out.reverse();
  }
}
