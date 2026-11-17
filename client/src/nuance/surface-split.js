// @ts-check
/**
 * The surface split: what the live persona may say, and what stays on the panel.
 * (D305, PROPOSED, 2026-11-17. The contract is
 * docs/handovers/2026-11-16-v2-functional-analysis-persona-optimization.md §2.1; the decision it
 * enforces is the founder's - register D301, Decision D.)
 *
 * ===============================================================================================
 * THE ONE RULE
 * ===============================================================================================
 *
 * This product is built on *the model never authors what the user acts on*: consent text is catalog
 * data (D128), what the assistant can do is generated from the catalog (D165/D212), ticket wording
 * is shared with the band character for character (D288), and no line may claim an outcome the
 * system cannot attribute (persona.json rule 2).
 *
 * A Nuance persona ALWAYS REPHRASES. `response.create`'s instructions are "a note the persona reads
 * for that reply"; there is no event that makes it say an exact string. So a pinned line handed to
 * the persona stops being that line - and the likeliest rephrase of "I'm not sure that one got
 * through" is "I've sent that off for you".
 *
 * THEREFORE THE PERSONA CARRIES NO LOAD-BEARING STRING. Every surface is one of four kinds:
 *
 *   persona   the persona speaks, in its own words. Chit-chat (from a RULE - the template's words
 *             are not sent), and the router's or the knowledge base's actual answer.
 *   relay     (D308/D309, THE FOUNDER'S, 2026-11-17) the panel shows the exact text AND the
 *             persona is handed that text to tell the user, told not to add to it or change what
 *             it claims. This is a deliberate exception to "no load-bearing string", made by
 *             Charles after his first live session, for two surfaces: the tickets filed from this
 *             machine and the machine band. She will rephrase them; the panel is still the record.
 *   pinned    the panel shows the exact text; the persona is handed a POINTER at the screen and
 *             nothing of the text.
 *   silent    the panel shows it; the persona is handed nothing at all.
 *   degraded  not the persona's to say under any circumstances: it is what the local face and
 *             voice say when there is no persona.
 *
 * AN UNKNOWN SURFACE IS PINNED. A line nobody classified is shown and pointed at, never spoken.
 *
 * ===============================================================================================
 * THIS IS THE ONLY PLACE `response.create` IS BUILT
 * ===============================================================================================
 *
 * `personaTurn()` returns the events to send. The session code sends what it is handed and builds
 * none of its own; `test/surface-split.test.mjs` counts the literal across `src/nuance/` and looks
 * for it in the renderer, the main process and the agent. That is what makes the test in §2 of that
 * file - every pinned line in persona.json driven through here, none coming out - a statement
 * about the product rather than about one function.
 *
 * NOTHING CALLS THIS YET. There is no session code. It is pure - it imports the persona file for
 * nothing but its key names' sake and reads no clock, no network and no DOM.
 */

export const SURFACE_KINDS = Object.freeze(["persona", "relay", "pinned", "silent", "degraded"]);

/** Nuance's bound on `response.instructions`. */
export const INSTRUCTIONS_MAX = 2000;

/**
 * Every line in `persona.json`, by `group.key` (or the group, for a plain list), plus the surfaces
 * that are not persona lines at all (`@…`). `test/surface-split.test.mjs` §1 fails on a persona
 * line with no entry here and on an entry whose line is gone.
 *
 * Each choice is a row of the functional analysis §2.1 unless it says otherwise.
 */
export const SURFACES = Object.freeze({
  // ---- handed over: chit-chat claims nothing, and the persona is better at it.
  "boot": "persona",                    // the launch hello. Decision A retired the recorded set from the live channel.
  "social.greeting": "persona",
  "social.howareyou": "persona",
  "social.thanks": "persona",
  "social.farewell": "persona",
  "social.nothingneeded": "persona",    // D265's behaviour is a rule, and a rule survives rephrasing.

  // ---- pinned.
  "social.offtopic": "pinned",          // a rephrased scope statement is a scope CLAIM (D260).
  // D311 (DECIDED by the founder, 2026-11-17: "yes Keep it"). These were pinned: D165/D212 generate the answer
  // from the catalog so it cannot drift, and a rephrased list is a promise the broker may refuse.
  // In his second live session Charles asked what she can do THREE times - "What can you do?",
  // "Tell me in your own words", "what is Matic's capabilities? Why would I engage Matic ever?" -
  // and was told "it's on the screen beside me" each time. A product that will not say what it
  // is for, to the person asking, is failing at something more basic than drift. So the GENERATED
  // answer is relayed: the words are still the catalog's, and she is told to add nothing to them.
  // Reversing this is six words below and one loop in the test.
  "capability.intro": "relay",
  "capability.consent": "relay",
  "capability.noticeOne": "relay",
  "capability.noticeSome": "relay",
  "capability.boundary": "relay",
  "capability.noCatalog": "relay",
  // D315: the same generated answer in a listener's shape. D311 is DECIDED (Charles: "yes Keep it").
  "capabilitySpoken.intro": "relay",
  "capabilitySpoken.item": "relay",
  "capabilitySpoken.consent": "relay",
  "capabilitySpoken.noticeOne": "relay",
  "capabilitySpoken.noticeSome": "relay",
  "capabilitySpoken.boundary": "relay",
  // D309 (the founder's, 2026-11-17): "enable her ability to ... speak on ... open tickets". These
  // were PINNED - D288 shares their wording with the band character for character, and a rephrase
  // can imply the desk was told something. They are relayed now: the exact reply is the note she
  // speaks from, and the band beside her is still the wording that counts.
  "tickets.item": "relay",
  "tickets.itemKnown": "relay",
  "tickets.some": "relay",
  "tickets.someKnown": "relay",
  "tickets.notListed": "relay",
  "tickets.noneListed": "relay",
  "tickets.unseen": "relay",
  "tickets.none": "relay",
  "tickets.unavailable": "relay",
  "fallback.hubUnreachable": "pinned",  // the fix is that it names BOTH things; a summary drops one (D244).
  "fallback.hubNoAnswer": "pinned",
  "filing.noDestination": "pinned",     // persona.json rule 2. An outcome is on the panel or it is nowhere.
  "filing.badDraft": "pinned",
  "filing.unreachable": "pinned",
  "filing.refused": "pinned",

  // ---- nothing at all.
  "filing.timeout": "silent",           // "I'm not sure that one got through." Every word is a hedge.

  // ---- not the persona's.
  "bootState.offline": "degraded",      // offline, there is no persona to say it.

  // ---- surfaces that are not persona.json lines.
  "@answer": "persona",                 // the diagnosis, the router's reply, the knowledge base's answer: the persona's job.
  // D312 (PROPOSED). A ticket-intake QUESTION - "what is your first name?" - is a question, and it
  // claims nothing. It was untagged, so it was pinned, so in Charles's first session five
  // questions in a row came out as "It's on the screen beside me" while he answered a form he was
  // not being asked. She asks it.
  "@intake": "persona",
  "@draft": "pinned",                   // the ticket before it is sent: on the screen, and NOT sent - its own pointer says so.
  "@filed": "relay",                    // "That's filed. Your reference is MD-1042": the hub said so, and D309 covers tickets.
  // The restart suggestion rides on a turn the user started, and has its own buttons on the panel. She
  // says NOTHING for it: heard live on 2026-11-17 it came out as a stray "it is on the screen beside me"
  // tacked onto the answer to a different question. Advice is not relayed (D256), so the rule is silence.
  "@restart": "silent",
  "@consent": "pinned",                 // the card is the catalog's, assembled by the broker (D128, D130, D248).
  "@consentVoice": "pinned",            // the same card, when it may also be approved by saying so (D310).
  "@execution": "pinned",               // what a change did is an outcome claim (D250's words stay on screen).
  // D308 (the founder's, 2026-11-17): "speak on the info from the 'what I can see about this machine'
  // tab". Was SILENT (D245: the band is never narrated). Relayed now - and only the sentence
  // src/agent/machine-summary.js builds from the band's own rows, when the user ASKS. Nothing
  // narrates the band unprompted, and the computer's name, the account and its addresses are still
  // never said (D249): they are left out of that sentence and redacted again by say().
  "@machine": "relay",
});

/** @param {unknown} surface */
export function surfaceOf(surface) {
  return typeof surface === "string" && Object.hasOwn(SURFACES, surface) ? SURFACES[/** @type {keyof typeof SURFACES} */ (surface)] : "pinned";
}

/**
 * What the persona is told when the content is on the panel. Each one points and claims nothing:
 * no capability, no outcome, no status. They are notes the persona will put in its own words,
 * which is safe precisely because there is nothing in them to get wrong.
 */
export const POINTERS = Object.freeze({
  screen: "What you need to tell them is written on the screen beside you. Say only that it is on the screen. Do not read it out, summarise it or add to it.",
  consent: "You have put the details of a change you want to make on the screen beside you. Tell them it is there and that nothing happens until they approve it. Do not describe what the change does - the card on the screen does that.",
  result: "What happened is written on the screen beside you. Say only that it is on the screen. Do not say whether anything worked, and do not describe it.",
  tickets: "Their tickets are listed on the screen beside you. Say only that they are listed there. Do not say what state any ticket is in, and do not say anyone has been told anything.",
  abilities: "What you can help with is shown on the screen beside you. Say only that it is on the screen. Do not list anything yourself.",
  // D310: the same pointer as `consent`, plus HOW. The phrase is one voice-consent.js accepts, and a
  // test checks that it is.
  // D321: it may be submitted aloud. The phrase taught here is one voice-consent.js accepts; a test checks.
  draft: "The ticket you would open is on the screen beside you. Tell them it is there to check, that it stays on this PC until they submit it, and that they can press submit or say 'submit the ticket'. Do not say it has gone anywhere.",
  consentVoice: "You have put the details of a change you want to make on the screen beside you. Tell them it is there, that nothing happens until they approve it, and that they can approve it with the button or by saying 'yes, approve it'. Do not describe what the change does - the card on the screen does that. Then say nothing more until they answer.",
});

/** Which pointer a pinned surface gets. Anything not named gets the plainest one. */
function pointerFor(surface) {
  if (surface === "@consent") return POINTERS.consent;
  if (surface === "@consentVoice") return POINTERS.consentVoice;
  if (surface === "@draft") return POINTERS.draft;
  if (surface === "@execution") return POINTERS.result;
  if (typeof surface === "string" && surface.startsWith("tickets.")) return POINTERS.tickets;
  if (typeof surface === "string" && surface.startsWith("capability.")) return POINTERS.abilities;
  return POINTERS.screen;
}

/**
 * The RULE a handed-over surface is spoken from. The template's own words are deliberately not
 * here and not sent: the persona saying a greeting in its own words is the point of handing it over.
 */
const RULES = Object.freeze({
  "boot": "The person has just opened you. Say hello in one short sentence and say your name is Matic. Do not list what you can do.",
  "social.greeting": "They said hello. Say hello back in one short sentence. Do not introduce yourself again and do not list what you can do.",
  "social.howareyou": "They asked how you are. Answer in one short, warm sentence and ask what you can help with.",
  "social.thanks": "They thanked you. Acknowledge it in one short sentence.",
  "social.farewell": "They are leaving. Say goodbye in one short sentence.",
  "social.nothingneeded": "They have told you nothing is wrong. Agree warmly in one short sentence. Do not ask a follow-up question and do not offer anything.",
});

/**
 * Her hello, when she is summoned (D320: "the avatar giving a random greeting to get started").
 * RULES, not lines: she says each in her own words, so the variety is in what she is asked to do.
 * None lists what she can do and none claims anything. The first is the original.
 */
export const BOOT_RULES = Object.freeze([
  RULES.boot,
  "The person has just started a face to face chat with you. Greet them warmly in one short sentence, say your name is Matic, and ask what is going on.",
  "The person has just opened a face to face chat. Say hello and your name, Matic, in a few words, and invite them to tell you what they need in their own words.",
  "The person has just come to talk to you. Give a short, friendly hello, say you are Matic, and ask how you can help today.",
  "The person has just started talking to you. Say hi, say your name is Matic, and say you are ready when they are. One short sentence, then stop.",
]);

/** The single place a reply event is made. */
function reply(instructions) {
  return { type: "response.create", response: { instructions } };
}

/**
 * One turn's worth of what to send the persona and what to show on the panel.
 *
 * @param {{ surface?: string, text?: string, voice?: boolean }} turn
 *   `surface` is a key of SURFACES; `text` is the exact line the product produced for it;
 *   `voice` (or the surface `@consentVoice`) says this consent card may be approved aloud (D310).
 * @returns {{
 *   kind: "persona" | "pinned" | "silent" | "degraded",
 *   speak: "own" | "pointer" | "none",
 *   panelText: string | null,
 *   event: { type: string, response: { instructions: string } } | null,
 *   floor: { type: string, reason: string, ends_on_speech: boolean } | null,
 *   send: Array<object>,
 * }}
 *   `panelText` is `text`, untouched - the panel always shows the exact line. `send` is `floor`
 *   then `event`, whichever exist, in the order to send them.
 */
export function personaTurn({ surface, text, voice = false, variant = 0 } = {}) {
  const kind = surfaceOf(surface);
  const panelText = typeof text === "string" ? text : null;
  const done = (speak, event, floor = null) => ({ kind, speak, panelText, event, floor, send: [floor, event].filter(Boolean) });

  if (kind === "silent" || kind === "degraded") return done("none", null);

  if (kind === "relay") {
    // D308/D309. The exact text is the note; she is told to add nothing and change no claim in it.
    const note = `Tell them this, in plain spoken sentences. Do not add to it, and do not change what it says has or has not happened: ${panelText ?? ""}`;
    if (!panelText || note.length > INSTRUCTIONS_MAX) return done("pointer", reply(pointerFor(surface)));
    return done("own", reply(note));
  }

  if (kind === "persona") {
    if (surface === "@answer" || surface === "@intake") {
      const note = `Tell them this, in plain spoken sentences, without adding to it: ${panelText ?? ""}`;
      // Too long for one note: it is NOT cut. Half an answer is a wrong answer; the whole one is on
      // the screen and the persona says so.
      if (!panelText || note.length > INSTRUCTIONS_MAX) return done("pointer", reply(POINTERS.screen));
      return done("own", reply(note));
    }
    // `variant` picks among the hellos; any number is taken modulo how many there are.
    const rule = surface === "boot"
      ? BOOT_RULES[Math.abs(Math.trunc(Number(variant) || 0)) % BOOT_RULES.length]
      : RULES[/** @type {keyof typeof RULES} */ (surface)];
    // A surface marked for the persona with no rule to speak from is shown and pointed at.
    return rule ? done("own", reply(rule)) : done("pointer", reply(POINTERS.screen));
  }

  // pinned
  if (surface === "@consent" || surface === "@consentVoice") {
    // Functional analysis §2.2: keep quiet while they read. The hold goes first.
    const said = voice || surface === "@consentVoice" ? POINTERS.consentVoice : POINTERS.consent;
    return done("pointer", reply(said), { type: "session.floor.hold", reason: "the user is reading a consent card", ends_on_speech: true });
  }
  return done("pointer", reply(pointerFor(surface)));
}

/**
 * Should this turn be left unsaid because it is the SAME pointer she said last? (D312, PROPOSED.)
 *
 * Charles's first session, from the service's own transcript: "It's on the screen beside me." five
 * times running. A pointer said twice in a row tells the user nothing the first did not - and the
 * prompt's own rule is "if you have nothing to add to what the screen says, say nothing". The
 * panel still shows every line; only the repeat is dropped. A consent card is never suppressed:
 * it holds the floor, and each card is a new thing to approve.
 *
 * @param {string | null} lastInstructions  the instructions of the last reply that was sent
 * @param {{ speak: string, event: { response: { instructions: string } } | null, floor: object | null }} turn
 */
export function isRepeatPointer(lastInstructions, turn) {
  return turn.speak === "pointer" && turn.floor === null && turn.event !== null && turn.event.response.instructions === lastInstructions;
}

/**
 * The same reply, as the RESULT OF A HAND-OFF. (D316, PROPOSED, 2026-11-17.)
 *
 * Under `delegation: client` the persona is a conversational front end: she answers the user
 * herself, and when something needs doing she says she will look into it and HANDS IT OFF
 * (`session.delegation.created`, target `client`). The service's way to answer a hand-off is
 * `session.commentary.append` carrying the delegation's id - "something to tell the user", after
 * which "the task is done". Until this existed the client ignored every hand-off and pushed its
 * answer in beside her with a second request to speak, so two speakers raced: in Charles's fourth
 * session the router's answers arrived a turn late, after she had already said something of her own.
 *
 * It CONVERTS an event `personaTurn()` built and adds nothing to it - same words, different
 * envelope - so every rule about what she may be handed still has exactly one author. The stage
 * does not write this event type itself; a test looks.
 *
 * @param {{ response: { instructions: string } }} event  a reply event from `personaTurn()`
 * @param {string} delegationId
 */
export function asHandOffResult(event, delegationId) {
  return { type: "session.commentary.append", content: event.response.instructions, delegation_id: delegationId };
}

/** Sent when the consent card is approved or dismissed. */
export function consentRelease() {
  return { type: "session.floor.release" };
}

/**
 * The floor, held while the knowledge base is asked about a SPOKEN question (D325, PROPOSED).
 *
 * Without it she fills the round trip by answering from world knowledge - the thing being fixed.
 * `ends_on_speech: false`: the user talking over the wait does not hand her the floor back; the
 * answer or the decline does, through `lookupRelease()`. The reason is short and in plain words,
 * and it is a reason for the SERVICE, not a line she is told to say. Built here and not in the
 * stage so the stage keeps writing no floor event of its own (the consent card's hold is here too).
 */
export function lookupHold() {
  return { type: "session.floor.hold", reason: "looking that up", ends_on_speech: false };
}

/** The lookup is over - answered or declined - and the floor is hers again. The same event as a consent release. */
export function lookupRelease() {
  return consentRelease();
}

/**
 * The capabilities whose own consent notice says the network drops. Running one kills the WebRTC
 * session, and a persona that vanishes mid-sentence while the user watches their network die reads
 * as the assistant having broken the machine.
 *
 * A LIST HERE AND NOT A FLAG IN THE CATALOG, on purpose: the catalog is the trust root and is not
 * this file's to extend. The test reads the catalog's `plain.notice` for each capability and fails
 * if one says the network drops and is not named here.
 */
export const NETWORK_DROPPING_CAPABILITIES = Object.freeze(["reset_adapter", "renew_dhcp"]);

/** The known capabilities that leave the session alone. Anything not on either list closes it. */
const SESSION_SAFE_CAPABILITIES = Object.freeze(["restart_service", "flush_dns"]);

/**
 * What to do to the session before the broker executes an approved capability.
 *
 * For a network-dropping one: one line first (a pointer - it describes no change and claims no
 * outcome), then `session.close`. The caller then switches to the local face and voice, and offers
 * to bring the persona back once the network is. A capability this file has never heard of closes
 * the session too: unknown is never the permissive branch.
 *
 * @param {string} capabilityId
 */
export function beforeExecute(capabilityId) {
  if (SESSION_SAFE_CAPABILITIES.includes(capabilityId)) {
    return { closeSession: false, send: [], degradeTo: null, offerToReturn: false };
  }
  return {
    closeSession: true,
    send: [
      reply("Tell them you are going to step away for a moment while this runs, and that you will be back on the screen beside them. Say nothing else."),
      { type: "session.close" },
    ],
    degradeTo: "local",
    offerToReturn: true,
  };
}
