// @ts-check
/**
 * Ticket intake — the multi-turn state that turns an offer into a ticket (D216, 2026-09-04).
 *
 * ===============================================================================================
 * WHAT THIS FIXES
 * ===============================================================================================
 *
 * `Agent.propose(text)` is stateless per turn. On 2026-09-04 the escalation branch said "I would
 * hand this to desktop support", the user typed "yes please hand to it", and that sentence arrived
 * as a brand-new unrelated problem — because nothing was waiting for an answer. The offer was not
 * ignored so much as never expected.
 *
 * This is the smallest thing that can expect an answer: ONE pending intake, owned by the Agent,
 * checked before anything else on the next turn.
 *
 * ===============================================================================================
 * IT ONLY ASKS WHAT IT CANNOT WORK OUT, AND THAT IS STRUCTURAL
 * ===============================================================================================
 *
 * The founder's instruction was "a full multi-turn interview, but only ask required info it
 * doesn't already know". Those pull in opposite directions if "does it already know this?" is a
 * judgement made per question — so it is not made per question. `PROFILE_FIELDS` declares what is
 * required and the store answers what is missing; the intake asks for the difference and nothing
 * else. With a complete profile it asks NOTHING and goes straight to the draft.
 *
 * Adding a question later is a line in that list, not a change here. That is the property worth
 * having: the interview can grow without the "only what it doesn't know" rule being re-argued.
 *
 * Everything else a ticket needs is already on hand and is never asked for:
 *   - the problem, in the user's own words        the sentence that triggered the escalation
 *   - the case note for the assignee               escalation.summary (the model's, D214)
 *   - what was already checked                     escalation.whatWasChecked
 *   - category and suggested owner                 escalation, enum-checked
 *   - the machine                                  the probe
 *   - the OS account                               read live from the OS
 *
 * **The owner is deliberately not asked.** "Which team should own this?" is a question a user
 * cannot answer and should not be made to guess at; a null owner is a legitimate value the hub
 * accepts and the queue displays as "unrouted".
 *
 * ===============================================================================================
 * IT NEVER TRAPS THE USER
 * ===============================================================================================
 *
 * A conversation that can only be escaped by answering a question is worse than no intake at all.
 * Three escapes, in order of how likely they are to be needed:
 *
 *   1. **An unrecognised answer to the offer abandons the offer** and the sentence is handled as
 *      an ordinary turn. If someone answers "actually my printer is broken now", that is a new
 *      problem, not a malformed yes.
 *   2. **A cancel word cancels**, at any stage.
 *   3. **It expires.** A pending intake older than EXPIRY_MS is dropped, so a question asked
 *      before lunch cannot swallow the first sentence after it.
 *
 * The draft stage is NOT held here. Once the draft exists it is handed to the renderer, which owns
 * the review card the same way it owns the consent card — so there is no state to leak if the user
 * walks away from it.
 */
import { PROFILE_FIELDS } from "../profile/profile.js";

/** A pending intake older than this is dropped rather than answered. */
export const EXPIRY_MS = 15 * 60 * 1000;

/**
 * Yes. Deliberately generous — this is answering a question the assistant just asked, so the prior
 * is heavily towards agreement, and the cost of a false positive is a draft the user can cancel.
 */
const AFFIRMATIVE = /^(y|ye|yes|yeah|yep|yup|sure|ok|okay|please|go ahead|do it|open one|open it|file it|raise it|that would be great|sounds good|affirmative)\b|^yes\b|\byes please\b|\bplease do\b/i;

/**
 * No. Checked BEFORE the affirmative, because "no thanks" contains no affirmative token but
 * "no, go ahead" would match one — and a false cancel is the safer error of the two.
 */
const NEGATIVE = /^(n|no|nope|nah|don'?t|do not|cancel|stop|never ?mind|forget it|not now|no thanks|no thank you|leave it)\b/i;

/** Strip trailing punctuation so "no." and "cancel!" are recognised as whole-message cancels. */
const bare = (s) => String(s ?? "").trim().replace(/[.!?,;:]+$/, "").trim();

/**
 * @typedef {{
 *   stage: "offered" | "collecting",
 *   escalation: object,
 *   userText: string,
 *   machineName: string|null,
 *   pending: Array<{key: string, label: string, question: string}>,
 *   answers: Record<string, string>,
 *   startedAt: number,
 * }} IntakeState
 */

export class TicketIntake {
  /**
   * @param {{ profile: import("../profile/profile.js").ProfileStore, onLog?: (s: string) => void, now?: () => number }} deps
   */
  constructor({ profile, onLog = () => {}, now = () => Date.now() }) {
    this.profile = profile;
    this.onLog = onLog;
    this.now = now;
    /** @type {IntakeState|null} */
    this.state = null;
  }

  /** Is a question outstanding? Expired intakes report false and are cleared as a side effect. */
  get isPending() {
    if (!this.state) return false;
    if (this.now() - this.state.startedAt > EXPIRY_MS) {
      this.onLog("[ticket] the pending offer expired; treating the next sentence as a new problem");
      this.state = null;
      return false;
    }
    return true;
  }

  clear() { this.state = null; }

  /**
   * An escalation happened. Remember what it was, so the next turn can act on "yes".
   *
   * This does NOT ask anything and does not change the reply — the offer is already in the
   * escalation reply (see prompt.js escalationReply). It only makes the answer meaningful.
   *
   * @param {{ escalation: object, userText: string, machineName?: string|null }} ctx
   */
  offer({ escalation, userText, machineName = null }) {
    this.state = {
      stage: "offered",
      escalation,
      userText,
      machineName,
      pending: [],
      answers: {},
      startedAt: this.now(),
    };
  }

  /**
   * Handle a sentence while an intake is pending.
   *
   * @param {string} text
   * @returns {{ kind: "question", reply: string, field: string }
   *          | { kind: "draft", draft: object, reply: string }
   *          | { kind: "cancelled", reply: string }
   *          | { kind: "passthrough" }}
   */
  accept(text) {
    if (!this.isPending) return { kind: "passthrough" };
    const s = /** @type {IntakeState} */ (this.state);
    const said = bare(text);

    // Cancel wins everywhere. Checked before the affirmative for the reason NEGATIVE documents.
    if (NEGATIVE.test(said)) {
      this.clear();
      this.onLog("[ticket] the user declined the ticket - nothing was filed and nothing was sent");
      return {
        kind: "cancelled",
        reply: "No problem — I haven't opened anything, and nothing has left this machine. Tell me if you change your mind.",
      };
    }

    if (s.stage === "offered") {
      if (!AFFIRMATIVE.test(said)) {
        // Escape 1. Not a yes, not a no — so it is probably a new sentence, and forcing it into
        // this intake would be the trap this class is written to avoid.
        this.clear();
        this.onLog("[ticket] the offer was neither accepted nor declined - dropping it and handling the sentence normally");
        return { kind: "passthrough" };
      }
      s.pending = this.profile.missing().map((f) => ({ key: f.key, label: f.label, question: f.question }));
      s.stage = "collecting";
      return this.#next(true);
    }

    // stage === "collecting": this sentence IS the answer to the question at the head of the queue.
    const field = s.pending.shift();
    if (field) s.answers[field.key] = said;
    return this.#next(false);
  }

  /**
   * Ask the next question, or build the draft when there is nothing left to ask.
   * @param {boolean} justAccepted  true on the turn the user said yes, which changes the preamble
   */
  #next(justAccepted) {
    const s = /** @type {IntakeState} */ (this.state);
    const field = s.pending[0];

    if (field) {
      // The preamble only appears once, on the turn the offer was accepted, and it says WHY a
      // question is coming. Being asked your name with no explanation, immediately after saying
      // yes to something else, reads as a non-sequitur.
      const preamble = justAccepted
        ? "I'll need a few details for the ticket first — I only ask once and I'll remember them. "
        : "";
      return { kind: "question", field: field.key, reply: preamble + field.question };
    }

    // Nothing left to ask. Persist what was collected, then draft.
    if (Object.keys(s.answers).length) this.profile.write(s.answers);
    const draft = this.draft();
    this.clear();
    return {
      kind: "draft",
      draft,
      reply: justAccepted
        // The complete-profile path. Nothing was asked, so the user goes straight to the review.
        ? "Here's the ticket I'd open. Have a look and change anything that's wrong — nothing is sent until you submit it."
        : "Thanks. Here's the ticket I'd open — change anything that's wrong, and nothing is sent until you submit it.",
    };
  }

  /**
   * The draft. Exactly the body POST /v1/ticket takes, plus what the review card needs to show.
   *
   * Built from the profile store rather than from `s.answers`, so the draft reflects what is
   * actually saved — if a write failed, the user sees the field empty and can fix it here, rather
   * than approving a value that will not be there next time.
   */
  draft() {
    const s = /** @type {IntakeState} */ (this.state);
    const e = s.escalation ?? {};
    return {
      description: s.userText,
      summary: e.summary ?? "",
      whatWasChecked: e.whatWasChecked ?? "",
      category: e.category ?? "other",
      suggestedOwner: e.suggestedOwner ?? null,
      machineName: s.machineName,
      reporter: this.profile.reporter(),
    };
  }
}
