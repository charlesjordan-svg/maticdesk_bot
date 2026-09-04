// @ts-check
/**
 * Is this a QUESTION to answer, or a REQUEST to change the machine? (D211, 2026-09-04)
 *
 * Runs locally, after tier-0 and before any provider call. Tier-0 keeps precedence (D46b): a
 * sentence tier-0 matches with confidence never reaches this function at all.
 *
 * ---------------------------------------------------------------------------------------------
 * THE BIAS IS DELIBERATE AND IT IS TOWARDS THE MEASURED PATH.
 *
 * The proposal path has been measured: 40 hand-written cases, five models, zero false actions
 * reaching a user (`docs/BAKEOFF-2026-09-02.md`). The question path has been measured on nothing —
 * six articles, no reranker, no corpus. So **every ambiguous sentence resolves to `"action"`**, and
 * `"question"` is returned only when the text looks like a question AND carries no imperative verb.
 *
 * "How do I take a screenshot" is a question. **"How do I fix my printer" is an ACTION**, because it
 * contains `fix` — and that is the right answer even though it is phrased as a question, because the
 * model on the proposal path can propose `restart_service` while the six-article KB certainly
 * cannot. Being wrong towards the measured path costs a worse answer; being wrong towards the
 * unmeasured one costs a decline where a fix existed.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY A DECLINED QUESTION DOES NOT FALL THROUGH TO THE PROPOSAL PATH
 *
 * It is tempting: ask the KB, and if it declines, let the model try to propose something. **It is
 * wrong, and D198 is why.** A question that the knowledge base does not cover would then produce a
 * consent card — a card the user did not provoke, for a machine change they did not ask for, in
 * answer to "what is our policy on expensing a taxi". D198 records that an unprovoked card is a
 * defect even when every gate behaves correctly, because it teaches the user that the card is noise
 * to click past.
 *
 * So a question is answered or declined, and a decline offers a ticket. That is B7a §2's whole
 * premise and there is no flag for it.
 *
 * ---------------------------------------------------------------------------------------------
 * WHERE D165'S SOCIAL LAYER GOES
 *
 * **Here, ahead of everything else, and it is NOT built.** D198 found that "Hello how are you?"
 * produced a consent card, and pinned D165's social templates ahead of `routeByState()`. This
 * function is the place: classifying "is this social?" is the same act as classifying "is this a
 * question?", and doing them in two passes means classifying twice.
 *
 * `SOCIAL_MARKERS` below is deliberately empty and `classify()` never returns `"social"` yet —
 * the shape is here so D165 slots in without moving anything, and the absence is explicit rather
 * than forgotten. **Do not treat the presence of the branch as the presence of the feature.**
 */

/**
 * Imperative verbs that make a sentence a request to DO something, whatever its grammar.
 *
 * Substrings, like tier-0's keywords, and for the same reason: "restart" covers "restarting" and
 * "please restart". Short stems beat exhaustive phrase lists.
 *
 * These are drawn from what the catalog can actually do plus the ordinary English for asking for
 * it. A verb that no capability implements still belongs here — "reinstall" is not a capability,
 * and someone asking for it wants an action rather than an article, so it should reach the model
 * that can escalate rather than the KB that will decline.
 */
const ACTION_VERBS = [
  "restart", "reboot", "reset", "flush", "renew", "clear", "fix", "repair",
  "reinstall", "install", "uninstall", "update", "upgrade", "enable", "disable",
  "start ", "stop ", "kill", "remove", "delete", "change", "set ", "turn on", "turn off",
  "unblock", "reconnect", "rejoin", "re-enroll", "reenroll", "wipe", "roll back", "rollback",
];

/**
 * Phrases that make a sentence a question about how something works.
 *
 * Longer and more specific than the action verbs, on purpose. A bare "how" or "what" appears in
 * plenty of action requests ("what a mess, restart it"), so the markers carry enough context to be
 * a question by themselves.
 */
const QUESTION_MARKERS = [
  "how do i", "how do you", "how can i", "how would i", "how does", "how did",
  "what is", "what's", "whats", "what are", "what does", "what do i",
  "where is", "where's", "where do i", "where can i", "which is", "which one",
  "who do i", "who should i", "when should i", "when do i",
  "is there a way", "can i ", "could i ", "am i able",
  "what's the shortcut", "shortcut for", "shortcut to",
  "why does", "why do", "why is", "why are",
];

/**
 * D165's social layer. EMPTY ON PURPOSE — see the header. Populating this is D165's job, not this
 * function's, and the empty array is the honest record that it has not been done.
 */
const SOCIAL_MARKERS = [];

/**
 * @typedef {"social" | "question" | "action"} InputKind
 */

/**
 * @param {string} text
 * @returns {{ kind: InputKind, why: string }}
 *   `why` is for the log. A router that cannot say why it routed is a router nobody will trust
 *   enough to leave in the path.
 */
export function classify(text) {
  const t = String(text ?? "").toLowerCase().trim();
  if (!t) return { kind: "action", why: "empty input - the existing path already handles it" };

  // D165, when it exists. Never fires today.
  for (const m of SOCIAL_MARKERS) {
    if (t.includes(m)) return { kind: "social", why: `social marker "${m}" (D165)` };
  }

  // An action verb wins over question grammar. See the header: the bias is towards the measured
  // path, and "how do I fix my printer" is a request for a fix.
  for (const v of ACTION_VERBS) {
    if (t.includes(v)) return { kind: "action", why: `action verb "${v.trim()}" - resolving to the proposal path even if phrased as a question` };
  }

  for (const m of QUESTION_MARKERS) {
    if (t.includes(m)) return { kind: "question", why: `question marker "${m}"` };
  }

  // A trailing question mark alone is NOT enough. "My printer won't print?" is a report of a
  // problem with uncertain punctuation, not a request for an article, and the proposal path is
  // the one that has been measured on sentences like it.
  return { kind: "action", why: "no question marker - defaulting to the proposal path (the measured one)" };
}

/** Convenience for call sites that only care about the one branch. */
export function isQuestion(text) {
  return classify(text).kind === "question";
}
