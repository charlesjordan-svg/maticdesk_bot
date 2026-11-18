// @ts-check
/**
 * Does this spoken sentence ask to END the live session? (D331, PROPOSED, 2026-11-18.)
 *
 * Charles, after the 00:32 session: "She seems not to have the ability to close the session. I
 * tried several times and she wouldnt end it." Nothing in the client ended a session on a sentence:
 * the button did, and the service's own `end_call` tool, which she may or may not use. A goodbye
 * classified as `social.farewell` was handed to her to say goodbye in her own words - and the
 * session stayed open. "End the session" was the classifier's default and went to the knowledge
 * base.
 *
 * This is checked on the user's finished turn BEFORE it is queued behind anything (persona-ui.js),
 * because the session it ends may be the thing that is stuck: in that session a routed turn was
 * waiting on a hub that never answered, and twenty-two later sentences waited behind it.
 *
 * TWO SOURCES, ONE ANSWER: the classifier's farewell markers (persona.json's vocabulary, D165/D234)
 * and the explicit phrases below. Bare "stop" is NOT here - it is an ACTION_VERB and "stop the
 * spooler" is work - only "stop" with the session as its object. A phrase here must be the whole
 * of what was said, give or take a filler word, so "I'm done with this printer" is a complaint and
 * "I'm done" is a goodbye.
 *
 * Pure: imports the classifier (pure) and nothing else. `test/turn-routing.test.mjs` §13.
 */
import { classify } from "../router/classify.js";

/** The session, as people name it. */
const THING = "(?:the |this |that |my |our |)?(?:live )?(?:video|session|call|chat|conversation|visit|face to face)";

/** Whole-sentence phrases, lower-cased, punctuation stripped. */
export const END_PHRASES = Object.freeze([
  "hang up", "end it", "end this", "thats all", "thats all for now", "thats it", "thats it for now",
  "im done", "were done", "were done here", "all done", "im finished", "were finished",
  "that will be all", "thatll be all", "nothing else thanks", "no thats everything", "thats everything",
]);

const END_RULES = Object.freeze([
  new RegExp(`^(?:ok |okay |alright |right |so |please |can you |could you |you can |lets |let us )*(?:end|close|stop|finish|exit|quit|leave|turn off|switch off|shut down|hang up) ${THING}(?: now| please| for now)?$`),
  new RegExp(`^(?:ok |okay |alright |please )*end (?:it|this|the) (?:now|please|here)$`),
]);

const bare = (s) => String(s ?? "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * @param {string} text
 * @returns {boolean}
 */
export function wantsToEnd(text) {
  const t = bare(text);
  if (!t) return false;
  if (END_PHRASES.includes(t)) return true;
  if (END_RULES.some((r) => r.test(t))) return true;
  // The classifier's own goodbye: the whole sentence is a farewell marker with no residue. A
  // farewell wrapped around a complaint is not one, and classify() already refuses that.
  const k = classify(text);
  if (k.kind === "social" && k.subkind === "farewell") return true;
  // "ok bye", "thanks bye": a filler or a thank-you in front of a goodbye.
  return /^(?:ok|okay|alright|thanks|thank you|cheers)[ ,]+(?:bye|goodbye|good bye|see you|see ya|later)(?: now| for now)?$/.test(t);
}
