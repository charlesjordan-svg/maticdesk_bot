// @ts-check
/**
 * Who answers a SPOKEN turn: the persona, or Matic's router. (D318, the founder's, 2026-11-17.)
 *
 * Charles, after his fifth live session: *"We should definitely leverage some of the Nuance
 * conversational responses for some of these things like how is your day ... take advantage of
 * the conversational functionality and world knowledge already part of the Nuance platform."*
 *
 * UNTIL THIS, EVERY SPOKEN SENTENCE WAS ROUTED. The router has two answers for a sentence it does
 * not recognise as small talk - a proposal or an escalation - because every sentence it was built
 * for was a problem typed into a box. Spoken to a face, most sentences are not problems. In that
 * session "It's a beautiful day. How are you doing?" went to the model and came back, twice, as
 * "I can't fix this one from here. It needs desktop support. I can open a ticket for you."
 *
 * The service's own design is the other way round (docs.nuancelabs.ai/delegation): the persona
 * converses, "decides on its own, and hands off when its instructions say to". So:
 *
 *   ROUTE to Matic when
 *     - Matic is waiting on an answer (a ticket offer, an intake question): the sentence is the
 *       answer, whatever it says;
 *     - the persona HANDED IT OFF: she decided it is work;
 *     - the local classifier - no model, no network - says it is a question about the user's
 *       tickets, about this machine, or about what the assistant can do. Those are answered from
 *       this machine's own records, and they are routed even if she did not hand them off: a
 *       missed hand-off must not cost a true answer.
 *   Otherwise it is HERS: conversation. Nothing is sent to the hub, no model is asked on Matic's
 *   side, and no proposal or ticket offer can come out of a pleasantry.
 *
 * What this gives up, said plainly: a real problem that she neither hands off nor the classifier
 * recognises is answered by HER model, which has no access to this machine. Her prompt tells her
 * to hand every such thing over. A prompt is a request.
 *
 *   ASK the knowledge base, and nothing else, when (D325, PROPOSED, 2026-11-17)
 *     - the classifier says it is a QUESTION. Until this, `question` fell through to "hers" and
 *       the company's written guidance was reachable from a spoken turn only through her hand-off:
 *       "how do I take a screenshot?" was answered from world knowledge while the knowledge base
 *       held the article. The sentence goes to POST /v1/ask ONLY - never the proposal path, never
 *       an escalation - and a DECLINE PRODUCES NOTHING: no ticket offer, no escalation line, no
 *       proposal. Her own answer stands. That is what keeps D318 intact: D318's defect was Matic
 *       VOLUNTEERING an offer for a pleasantry, and a silent decline cannot volunteer anything.
 *       The floor is held while the hub is asked, so she does not fill the round trip from world
 *       knowledge - which is the failure being fixed.
 *     The cost: a hub round trip, with a model call on the hub's side, on every spoken question.
 *     The typed path is untouched and still offers the ticket on a decline.
 *
 *   ROUTE an `action` ONLY when the classifier matched an explicit ACTION_VERB (D326, the founder's,
 *   2026-11-17 - "Yes, build it"). "Restart the spooler", "fix my printer": those are the sentences
 *   the 40-case bakeoff measured, and until this the voice path did not take that path unless she
 *   chose to hand them off. The classifier's DEFAULT - every unrecognised sentence is `action`
 *   (classify.js) - stays hers: routing it would be "route everything", which is pre-D318, and
 *   "it's a beautiful day" is that default. The decision is read from `verb`, a field the
 *   classifier sets only on a match, never from the `why` string.
 *
 *   ASK the knowledge base for the classifier's DEFAULT too - `action` with no verb (D327, PROPOSED,
 *   2026-11-18). D326 put the default on her side, and the first real session after it showed what
 *   that costs: seven turns, every one `action`, five with no verb, so five ordinary sentences -
 *   "my screen keeps going black" is the shape - were answered by her model, and the knowledge
 *   base built the same day was never reached. The default is where "I do not recognise this"
 *   already lives, so it is where the lookup goes; widening QUESTION_MARKERS would pull
 *   residue-carrying small talk into `question` and re-open D318. The argument D325 already won
 *   holds: a decline is silent, so this can only ADD a correct answer. The cost is a hub round
 *   trip on most spoken sentences; the window asks the hub to skip its model unless the lexical
 *   leg found at least one chunk (`requireLexicalMatch`), so small talk costs a retrieval only.
 *   A spoken QUESTION keeps D325's shape (the hub's model decides): a question whose phrasing
 *   shares no term with its article is what the dense leg is for.
 *
 * Typed turns are not touched by any of this: a sentence typed into the box always goes to Matic.
 * Pure. `test/turn-routing.test.mjs`.
 */

/**
 * @param {{ awaitingAnswer?: boolean, handedOff?: boolean, kind?: string, subkind?: string, verb?: string | null }} t
 * @returns {"route" | "ask" | "hers"}
 */
export function spokenTurnRoute({ awaitingAnswer = false, handedOff = false, kind = "", subkind = "", verb = null } = {}) {
  if (awaitingAnswer === true) return "route";
  if (handedOff === true) return "route";
  if (kind === "tickets" || kind === "machine") return "route";
  if (kind === "social" && subkind === "capability") return "route";
  if (kind === "action" && typeof verb === "string" && verb.trim() !== "") return "route";
  if (kind === "question") return "ask";
  // D327 (PROPOSED, 2026-11-18): the classifier's DEFAULT - `action` with no verb, which is every
  // sentence it does not recognise - is ASKED, as a question is. The 2026-11-17 23:41 session had
  // seven spoken turns, all `action`, five with no verb, so five were answered by her model and
  // D325 never fired. A decline is silent, so this can only add a correct answer; the window asks
  // the hub to skip its model unless the lexical leg found a chunk, so a pleasantry costs one
  // retrieval and no model call. The word "action" is read here because the classifier's default
  // IS that word; nothing reads the `why` string.
  if (kind === "action") return "ask";
  return "hers";
}
