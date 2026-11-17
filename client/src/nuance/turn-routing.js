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
 * Typed turns are not touched by any of this: a sentence typed into the box always goes to Matic.
 * Pure. `test/voice-consent.test.mjs` §9.
 */

/**
 * @param {{ awaitingAnswer?: boolean, handedOff?: boolean, kind?: string, subkind?: string }} t
 * @returns {"route" | "hers"}
 */
export function spokenTurnRoute({ awaitingAnswer = false, handedOff = false, kind = "", subkind = "" } = {}) {
  if (awaitingAnswer === true) return "route";
  if (handedOff === true) return "route";
  if (kind === "tickets" || kind === "machine") return "route";
  if (kind === "social" && subkind === "capability") return "route";
  return "hers";
}
