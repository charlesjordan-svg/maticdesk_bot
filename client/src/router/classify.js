// @ts-check
import persona from "./persona.json" with { type: "json" };
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
 * D165'S SOCIAL LAYER IS HERE, AND IT RUNS FIRST — BUILT 2026-09-04
 *
 * D198 found that "Hello how are you?" produced a `renew_dhcp` consent card, and pinned D165's
 * templates ahead of `routeByState()`. They sit ahead of everything: a greeting should not cost a
 * model call either, and classifying "is this social?" is the same act as classifying "is this a
 * question?" — doing them in two passes would mean classifying twice.
 *
 * Templates: `src/router/social.js`. Deterministic, client-shipped, never model-authored, and the
 * capability answer is GENERATED FROM THE CATALOG so it cannot claim an ability that is not there.
 *
 * **`Agent.propose()` calls this UNCONDITIONALLY**, unlike the question branch, which is gated on
 * the provider having an `ask()`. That difference is deliberate and was a correction: the social
 * layer is a safety requirement under D198 and must protect **every** provider — including
 * `provider: "cloud"`, which is what the frozen demo build uses and is the configuration D198's
 * defect was observed in.
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
 * D165's social layer. BUILT 2026-09-04. Templates: `src/router/social.js`.
 *
 * ---------------------------------------------------------------------------------------------
 * THE HARD PART IS NOT RECOGNISING "HELLO". IT IS NOT SWALLOWING "HI, MY PRINTER IS BROKEN".
 *
 * A naive substring match on greetings turns every polite problem report into a greeting, and the
 * user who opened with "hi" never gets help. That failure is worse than the one D198 found, because
 * it is silent: the assistant answers warmly and does nothing.
 *
 * So a greeting is social only when, with the greeting REMOVED, there is nothing of substance left.
 * `residue()` below does the removing, and `classify()` requires the remainder to be empty or
 * trivial. "hello" is social; "hello my printer is broken" is not, and falls through to the ordinary
 * classification, which sends it to the proposal path exactly as it does today.
 *
 * CAPABILITY QUESTIONS ARE THE EXCEPTION and fire on a marker alone, because they are substantial by
 * nature — "what can you do" has no residue to test and nothing else it could mean.
 * ---------------------------------------------------------------------------------------------
 */
/**
 * Normalise an utterance for WORD-BOUNDARY matching, and pad it with spaces.
 *
 * Social markers are short words, and substring matching on short words is wrong in both
 * directions. The first version listed `"hi "`, `"hi!"`, `"hi."` and `"hi?"` as separate markers to
 * stop `"hi"` matching inside "this" and "hint" — and a bare `"Hi"` with no trailing character
 * then matched none of them and was classified as an action. Enumerating punctuation is the wrong
 * fix for a boundary problem.
 *
 * So: apostrophes are REMOVED (so "how's it going" and "hows it going" are the same string), all
 * other punctuation becomes a space, runs of whitespace collapse, and the result is padded. A
 * marker is then matched as ` marker `, which is a whole-phrase match — ` hi ` is in " hi there "
 * and is not in " this ".
 *
 * @param {string} t
 */
export function normalise(t) {
  const cleaned = String(t ?? "")
    .toLowerCase()
    .replace(/['\u2018\u2019]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ` ${cleaned} `;
}

const SOCIAL = [
  // Order matters within a subkind's list only for the log message; across subkinds, the first
  // match wins, so the more specific "how are you" is tested before the bare greetings.
  //
  // Widened 2026-09-10 after Charles's first two runs: "hello matic how are you today?" and "what can
  // you fix?" both went to the hub. A pleasantry with one extra word ("today", "doing") or a
  // synonym ("fix" for "do") must still be a pleasantry - see FILLER and VOCATIVES below too.
  { subkind: "howareyou", markers: [
    "how are you", "howre you", "how are things", "hows it going", "how is it going", "hows things",
    "how you doing", "how are you doing", "how have you been", "hows your day", "how is your day",
    "you ok", "you alright", "you good", "you doing ok", "hows life", "how goes it", "whats up",
  ] },
  { subkind: "capability", markers: [
    "what can you do", "what do you do", "what are you able", "what can you help",
    "what else can you do", "who are you", "what are you", "can you help me with",
    "what are your capabilities", "list your", "what can i ask",
    "what can you fix", "what do you fix", "what problems can you", "what kind of problems",
    "what kinds of problems", "what sort of things", "what kind of things", "what are you good at",
    "how can you help", "what do you know how", "what should i ask", "what can you actually do",
    "introduce yourself", "tell me about yourself",
  ] },
  // NOTHING IS WRONG. D265, and it is a defect Charles found by using the app: he typed
  // "Its all good thanks" and got an OFFER TO OPEN A TICKET.
  //
  // The subkind is the fix, and the residue rule is NOT the bug. "thanks" matched perfectly well;
  // what sank it was `residue()` returning "its good", because a non-empty residue vetoes the
  // social path — correctly, since that is what keeps "thanks but the printer still won't print" on
  // the problem path. The real gap is that **"nothing is wrong" is a speech act the classifier had
  // no vocabulary for**, so it reached the model, which had a problem-shaped slot to fill and
  // filled it. D198's defect arriving through a third route: not the ordering, not the residue
  // test, but a missing intent.
  //
  // IT SITS ABOVE `thanks` ON PURPOSE. "Its all good thanks" is a user telling us nothing is wrong
  // and being polite about it; the substance is the reassurance and the thanks is the wrapper.
  // "You're very welcome" is a worse answer than "glad to hear it" — and both are enormously better
  // than a consent-shaped card.
  //
  // COMPLETE PHRASES, for the reason the off-topic list gives: a bare "good" or "fine" is a word
  // that appears inside real complaints. And the residue rule still applies AFTER these are
  // stripped, which is the second guard — "it was all good until this morning" leaves "it was
  // until", "no issues with the printer but the scanner is dead" leaves most of itself, and both
  // go to the problem path exactly as they should.
  { subkind: "nothingneeded", markers: [
    "all good", "its all good", "were all good", "we are all good", "all sorted", "its sorted",
    "all fine", "its fine", "im fine", "i am fine", "im good", "i am good", "im ok", "im okay",
    "i am ok", "i am okay", "nothing wrong", "nothing is wrong", "no issues", "no issue",
    "no problems", "nothing to report", "nothing at the moment", "nothing right now",
    "nothing for now", "nothing thanks", "no thanks", "not right now", "not at the moment",
    "nothing broken", "nothing needed", "dont need anything", "do not need anything",
    // A bare "nope" or "nah" is a whole message, and one that reached the model would come back
    // with the same problem-shaped answer this subkind exists to prevent. Safe as a marker for the
    // same reason as the rest: "nope, the printer is still broken" leaves its residue behind.
    "nope", "nah",
  ] },
  { subkind: "thanks", markers: ["thanks", "thank you", "thank u", "thx", "ta", "cheers", "much appreciated", "appreciate it", "nice one", "well done", "good job", "great job", "brilliant", "perfect", "legend"] },
  { subkind: "farewell", markers: ["goodbye", "good bye", "bye for now", "bye", "see you", "see ya", "see you soon", "later", "thats all", "nothing else", "were done", "im done", "good night", "night", "have a good one", "ttyl", "catch you later"] },
  { subkind: "greeting", markers: [
    "hello", "hi", "hey", "hiya", "good morning", "good afternoon", "good evening", "good day",
    "morning", "afternoon", "evening", "howdy", "greetings", "yo", "hey there", "hello there",
    "nice to meet you", "pleased to meet you", "sup",
  ] },
  // OFF-TOPIC. A short, explicit list, and it must STAY short: anything not matched here goes to
  // the ordinary path, which is the conservative direction. Guessing that an unrecognised sentence
  // is off-topic would refuse to help with real problems phrased unusually — the same failure mode
  // as swallowing "hi, my printer is broken", arrived at from the other side.
  //
  // EVERY MARKER IS A COMPLETE PHRASE, and the first version's were not. It listed "the weather",
  // "a joke", "the score" and "the news" — all of which appear inside real complaints: "the weather
  // app won't open", "this printer is a joke", "the news site won't load". A bare topic noun is not
  // an off-topic question, it is a noun, and matching on it would refuse to help with a real
  // problem. Complete phrases cannot collide that way.
  { subkind: "offtopic", markers: [
    "whats the weather", "what is the weather", "the weather like", "the weather forecast",
    "tell me a joke", "know any jokes", "who won the", "whats the score", "what is the score",
    "what time is it", "whats the time", "your favourite", "your favorite",
    "who is the president", "write me a poem", "what do you think of",
  ] },
];

/** Every marker, longest first, so "how are you" is stripped before "hi". */
const ALL_SOCIAL_MARKERS = SOCIAL.flatMap((s) => s.markers).sort((a, b) => b.length - a.length);

/**
 * "Where's my ticket?" — a question about a ticket that already exists. D235, 2026-09-10.
 *
 * Observed: "what is the status of my open tickets?" and "i opened a ticket already what is the
 * status?" both went to the knowledge base and were declined, because the endpoint had no idea
 * what a ticket-status question was. It still cannot see the hub's ticket table, but it CAN say
 * what it filed from this machine (the egress log) and say plainly that checking status is not
 * built - which beats a decline about "company guidance".
 *
 * COMPLETE PHRASES, like the off-topic markers, and for the same reason: "ticket" alone is in
 * "please raise a ticket". The ASKING-FOR-A-NEW-TICKET phrases below veto the match, so "can you
 * raise my ticket now" is not read as a status question either.
 */
const TICKET_STATUS_MARKERS = [
  "my ticket", "my tickets", "my open ticket", "my open tickets", "my existing ticket", "open tickets",
  "ticket status", "status of my ticket", "status of the ticket", "status of that ticket", "status on my ticket",
  "where is my ticket", "wheres my ticket", "hows my ticket", "how is my ticket",
  "update on my ticket", "update on the ticket", "any news on my ticket", "any update on the ticket",
  "ticket i opened", "ticket i raised", "ticket i filed", "ticket i submitted",
  "i opened a ticket", "i raised a ticket", "i filed a ticket", "i submitted a ticket", "i already opened a ticket",
  "has my ticket", "did my ticket", "track my ticket", "check my ticket", "check on my ticket", "check the ticket",
  "what happened to my ticket", "what happened to the ticket", "is my ticket",
];
const NEW_TICKET_PHRASES = ["raise a ticket", "raise my ticket", "open a ticket", "open a new ticket", "create a ticket", "file a ticket", "log a ticket", "new ticket", "submit a ticket", "make a ticket"];

/** @param {string} padded  normalise()d text */
function isTicketStatusQuestion(padded) {
  if (NEW_TICKET_PHRASES.some((p) => hasMarker(padded, p))) return null;
  return TICKET_STATUS_MARKERS.find((m) => hasMarker(padded, m)) ?? null;
}

/** True when `marker` appears in `text` as a whole word or phrase. */
function hasMarker(paddedText, marker) {
  return paddedText.includes(` ${marker} `);
}

/**
 * Filler that carries no problem statement. Removed alongside the social markers so that
 * "hello there, thanks" reduces to nothing rather than to "there".
 */
const FILLER = [
  "there", "please", "mate", "buddy", "again", "quickly", "just", "so", "ok", "okay", "well", "um", "uh", "hi", "hey",
  // 2026-09-10: "how are you TODAY", "how are you DOING", "good morning EVERYONE", "hello THIS
  // MORNING". Time-of-day and pleasantry padding, none of which is ever the subject of a complaint.
  "today", "tonight", "doing", "this", "morning", "afternoon", "evening", "everyone", "all", "going",
  "now", "then", "yeah", "yes", "friend", "pal", "dear", "sir", "maam",
  // D265: "nope all good" left "nope" behind and went to the model. These are answers, never the
  // subject of a complaint - nobody reports that their nope is broken. NOT "no": "no internet" and
  // "no sound" are complaints, and "no" is doing real work in them.
  "nope", "nah", "nup",
  // NOT "my": "hi my printer is broken" must keep "my printer is broken" whole.
];

/**
 * The assistant's own name, used as a vocative. "hello matic how are you?" is a greeting addressed
 * to the assistant, not a greeting plus a one-word complaint about something called matic — but
 * that is exactly how residue() read it until 2026-09-10, when Charles typed it on the first run of
 * the new avatar and it went to the hub, cost a cold model load, and came back as "I could not reach
 * the model" (D198's defect, through the residue test rather than the ordering). Removed as whole
 * phrases, longest first. NOT "desk" alone: "my desk phone is dead" is a complaint.
 *
 * Read from persona.json (D234), so the name lives in one place with everything else it says.
 */
const VOCATIVES = [...persona.vocatives].sort((a, b) => b.length - a.length);

/**
 * What is left of an utterance once the social markers and filler are taken out.
 *
 * The residue is what decides whether a greeting was the whole message or the doormat in front of a
 * real one. Punctuation goes too, so "hello!!!" and "hello" behave the same.
 *
 * @param {string} t  already lowercased and trimmed
 * @returns {string}
 */
export function residue(t) {
  let r = normalise(t);
  // Whole-word removal, and repeated until nothing more comes out: taking " hi " out of " hi hi
  // there " leaves " hi there " on a single pass, because the two markers overlap on one space.
  for (const m of ALL_SOCIAL_MARKERS) {
    while (hasMarker(r, m)) r = r.split(` ${m} `).join(" ");
  }
  // The assistant's name is not a subject. Same whole-word treatment as the markers.
  for (const v of VOCATIVES) {
    while (r.includes(` ${v} `)) r = r.split(` ${v} `).join(" ");
  }
  const words = r.split(/\s+/).filter((w) => w && !FILLER.includes(w));
  return words.join(" ");
}

/**
 * How much residue still counts as "nothing of substance".
 *
 * ONE word, not two or three. "hello printer" should reach the proposal path — a single noun is
 * often the whole complaint from someone who does not want to type. The threshold is deliberately
 * at its most conservative setting, and raising it is how "hi, my printer is broken" starts getting
 * swallowed again.
 */
const MAX_SOCIAL_RESIDUE_WORDS = 0;

/**
 * @typedef {"social" | "tickets" | "question" | "action"} InputKind
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
  const padded = normalise(text);

  // ---- D235: a question about an EXISTING ticket. Before the social layer (it is not a pleasantry)
  // and before the question/action split (it is not for the knowledge base or the model).
  const ticketHit = isTicketStatusQuestion(padded);
  if (ticketHit) {
    return { kind: "tickets", why: `asks about an existing ticket ("${ticketHit}") - answered from this machine's own egress record, not the knowledge base (D235)` };
  }

  // ---- D165's social layer, FIRST. D198 requires it ahead of the state fallback; it is ahead of
  // every provider call too, because a greeting should not cost a model call either.
  for (const { subkind, markers } of SOCIAL) {
    const hit = markers.find((m) => hasMarker(padded, m));
    if (!hit) continue;

    // CAPABILITY and OFF-TOPIC questions fire on the marker alone, without the residue test.
    //
    // The residue test exists to stop a GREETING swallowing a real complaint — "hi" is politeness
    // wrapped around a message, so what is left after removing it decides what the message was.
    // These two are not politeness: they are content. "What can you do" has no residue to test, and
    // "what is the weather" leaves "what is", which trips the threshold and sent it to the KNOWLEDGE
    // BASE — observed 2026-09-04 before this branch existed. The protection they need is markers
    // specific enough not to collide with a real problem, which is the note above their lists.
    if (subkind === "capability" || subkind === "offtopic") {
      return {
        kind: "social",
        subkind,
        why: subkind === "capability"
          ? `capability question ("${hit}") - answered from the catalog (D165)`
          : `off-topic phrase ("${hit}") - redirected, not sent to the knowledge base`,
      };
    }

    // Everything else must be the WHOLE message. See the note above SOCIAL: swallowing
    // "hi, my printer is broken" is a worse failure than the one D198 found, because it is silent.
    const left = residue(t);
    const wordsLeft = left ? left.split(" ").length : 0;
    if (wordsLeft <= MAX_SOCIAL_RESIDUE_WORDS) {
      return { kind: "social", subkind, why: `social marker "${hit.trim()}" with no residue (D165)` };
    }
    // There IS something else in the sentence. Stop testing social markers and classify the rest
    // normally - do not let a later, shorter marker match on the same text.
    break;
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
