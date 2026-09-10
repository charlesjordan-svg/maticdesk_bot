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
];

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
