// @ts-check
/**
 * Approving a fix by voice. (D310 - THE FOUNDER'S, 2026-11-17, and a change to how consent is given.)
 *
 * Charles, after his first live session: *"enable her ability to do approve fixes."* Asked what
 * that should mean, he chose: **voice for low-risk fixes only** - a change that does not drop the
 * network may be approved by saying so; one that does still needs the button.
 *
 * WHAT DID NOT CHANGE, because the consent protocol is the product's trust root (D130):
 *   - The card is still rendered by the BROKER from catalog text, and is on screen.
 *   - Approval still presents the single-use nonce and nothing else; the broker runs what IT
 *     rendered. No parameter was added to `execute`.
 *   - A spoken approval does exactly what the Approve button does. It is a second way to press it.
 *
 * WHAT IS NEW, AND WHAT IT COSTS: the evidence of consent for these fixes may now be a transcript
 * written by a third party's speech recogniser - the one that heard "Matic" as "Maddox" in the
 * same test that prompted this. So the rule is narrow on purpose:
 *
 *   1. LOW-RISK ONLY. A capability may be voice-approved only if `beforeExecute()` in
 *      surface-split.js says it leaves the session up - the same list that decides a pre-emptive
 *      close, so "drops the network" has one definition. Unknown capabilities are NOT approvable.
 *   2. THE WHOLE UTTERANCE MUST BE AN APPROVAL. Short (six words at most), containing "approve" or
 *      "go ahead", and containing no word that negates or hesitates. "Yes" alone approves nothing:
 *      it is the most misheard word there is and the answer to a hundred other questions.
 *   3. ANYTHING ELSE CHANGES NOTHING. An unclear sentence leaves the card where it is. Only an
 *      explicit refusal dismisses it.
 *   4. ARMED ONLY WHILE THE CARD IS UP, the session is live and the microphone is on - and only
 *      after the persona has finished saying the card is there, so her own "…until you approve it"
 *      coming back through the speakers is not an approval. (The floor is held while it is up.)
 *   5. EVERY VOICE DECISION IS WRITTEN DOWN, with the words heard: `audit/voice-consent.jsonl`.
 *      The broker's own audit line cannot say how the button was pressed - it sees a nonce.
 *
 * Pure. `test/voice-consent.test.mjs`.
 */
import { beforeExecute } from "./surface-split.js";

/** @param {string} capabilityId */
export function voiceApprovable(capabilityId) {
  return typeof capabilityId === "string" && beforeExecute(capabilityId).closeSession === false;
}

const MAX_WORDS = 6;
const APPROVE = [" approve ", " approved ", " go ahead "];
/** Any of these anywhere and it is not an approval. */
const BLOCKERS = ["no", "not", "dont", "do not", "never", "wait", "stop", "cancel", "hold", "maybe", "unless", "until", "before", "why", "what", "which", "how", "should", "if", "nothing", "happens"];
/** The whole utterance, or these phrases inside a short one, is a refusal. */
const DENY_WHOLE = ["no", "no thanks", "no thank you", "nope", "cancel", "cancel it", "cancel that", "stop", "dont", "do not", "leave it", "not now", "never mind", "nevermind"];
const DENY_PHRASES = [" dont approve ", " do not approve ", " dont do it ", " do not do it ", " dont do that ", " cancel it ", " cancel that "];

/**
 * SUBMITTING A TICKET BY VOICE (D321, the founder's, 2026-11-17: "ensure I can submit ticket
 * audibly without requiring me to click"). The review card is the moment personal data leaves this
 * machine (D217), and until now only its Submit button could send it. A spoken instruction may
 * now press that button - on the same narrow terms as a spoken approval: a short sentence that
 * says "submit" or "send", with nothing in it that negates or hesitates. "Yes" alone sends
 * nothing. Anything unclear leaves the card where it is. Written to audit/voice-consent.jsonl.
 * @param {string} text
 * @returns {"submit" | "cancel" | "unclear"}
 */
export function ticketVerdict(text) {
  const p = norm(text);
  const words = p.trim().split(" ").filter(Boolean);
  if (words.length === 0 || words.length > MAX_WORDS) return "unclear";
  if (DENY_WHOLE.includes(p.trim()) || [" dont send ", " do not send ", " dont submit ", " do not submit ", " cancel it ", " cancel that ", " cancel the ticket "].some((d) => p.includes(d))) return "cancel";
  if (BLOCKERS.some((b) => p.includes(` ${b} `))) return "unclear";
  if ([" submit ", " send "].some((a) => p.includes(a))) return "submit";
  return "unclear";
}

const norm = (t) => ` ${String(t ?? "").toLowerCase().replace(/['‘’]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()} `;

/**
 * What a spoken sentence means while a consent card is waiting.
 * @param {string} text
 * @returns {"approve" | "deny" | "unclear"}
 */
export function voiceVerdict(text) {
  const p = norm(text);
  const words = p.trim().split(" ").filter(Boolean);
  if (words.length === 0 || words.length > MAX_WORDS) return "unclear";
  if (DENY_WHOLE.includes(p.trim()) || DENY_PHRASES.some((d) => p.includes(d))) return "deny";
  if (BLOCKERS.some((b) => p.includes(` ${b} `))) return "unclear";
  if (APPROVE.some((a) => p.includes(a))) return "approve";
  return "unclear";
}
