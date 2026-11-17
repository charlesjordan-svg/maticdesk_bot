/**
 * Approving a fix by voice (D310), and the machine band as a sentence (D308). Both the founder's,
 * 2026-11-17, after his first live session with the persona.
 *
 * Run: node test/voice-consent.test.mjs        (from client/; part of `npm test`)
 *
 * D310 changes how consent may be GIVEN, so what is pinned here is how narrow it is: low-risk
 * capabilities only, the whole utterance an approval, everything unclear changing nothing.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import catalog from "../src/broker/catalog.json" with { type: "json" };
import { voiceApprovable, voiceVerdict, ticketVerdict } from "../src/nuance/voice-consent.js";
import { NETWORK_DROPPING_CAPABILITIES, POINTERS, personaTurn } from "../src/nuance/surface-split.js";
import { machineSummaryReply } from "../src/agent/machine-summary.js";
import { classify } from "../src/router/classify.js";

const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}

// ==============================================================================================
console.log("=== 1. which fixes may be approved by voice ===");
{
  for (const c of catalog.capabilities) {
    const drops = NETWORK_DROPPING_CAPABILITIES.includes(c.id);
    check(`${c.id}: ${drops ? "the button only - it drops the network" : "voice or the button"}`, voiceApprovable(c.id) === !drops);
  }
  check("a capability nobody has heard of is NOT voice-approvable", voiceApprovable("something_new") === false && voiceApprovable(undefined) === false);
  check("at least one is approvable and at least one is not", catalog.capabilities.some((c) => voiceApprovable(c.id)) && catalog.capabilities.some((c) => !voiceApprovable(c.id)));
}

// ==============================================================================================
console.log("\n=== 2. what counts as saying yes ===");
{
  for (const t of ["yes, approve it", "Approve it.", "approve", "I approve", "Yes approve", "go ahead", "Yes, go ahead.", "yes please go ahead", "approved", "okay approve it"]) {
    check(`"${t}" approves`, voiceVerdict(t) === "approve", voiceVerdict(t));
  }
  for (const t of ["yes", "yeah", "ok", "okay", "sure", "yes please", "do it", "fine", "", "   ", "yep that one", "sounds good"]) {
    check(`"${t}" approves NOTHING - it is not an approval in so many words`, voiceVerdict(t) === "unclear", voiceVerdict(t));
  }
  for (const t of [
    "don't approve it", "do not approve", "I do not approve", "no don't go ahead", "wait don't approve it yet",
    "should I approve it", "what happens if I approve", "why would I approve that", "not approved", "never approve that",
    "nothing happens until you approve it",            // the persona's own line, back through the speakers
    "and that nothing happens until they approve it",
    "I'll approve it once you tell me what it does and whether it is safe",   // too long to be one
    "maybe approve", "hold on approve", "approve it if it is safe",
  ]) {
    check(`"${t}" does NOT approve`, voiceVerdict(t) !== "approve", voiceVerdict(t));
  }
  for (const t of ["no", "No thanks.", "cancel", "cancel that", "don't approve it", "do not do it", "stop", "leave it", "not now", "never mind"]) {
    check(`"${t}" refuses`, voiceVerdict(t) === "deny", voiceVerdict(t));
  }
  for (const t of ["what does it do", "tell me more", "is it safe", "my printer is still broken", "hello matic"]) {
    check(`"${t}" is unclear, and unclear changes nothing`, voiceVerdict(t) === "unclear", voiceVerdict(t));
  }
}

// ==============================================================================================
console.log("\n=== 3. the consent pointer says how, and only when voice is allowed ===");
{
  const voice = personaTurn({ surface: "@consent", text: "x", voice: true });
  const click = personaTurn({ surface: "@consent", text: "x" });
  check("with voice allowed the persona is told they may say so, in the words that work", /approve it/i.test(voice.event.response.instructions) && voice.event.response.instructions === POINTERS.consentVoice);
  check("without it the pointer is the original and mentions no saying", click.event.response.instructions === POINTERS.consent && !/say|aloud|voice/i.test(POINTERS.consent));
  check("both still refuse to describe the change, and both hold the floor", /do not describe/i.test(POINTERS.consentVoice) && voice.floor?.type === "session.floor.hold" && click.floor?.type === "session.floor.hold");
  check("the phrase the pointer teaches is one the rule accepts", voiceVerdict("yes, approve it") === "approve" && POINTERS.consentVoice.includes("yes, approve it"));
}

// ==============================================================================================
console.log("\n=== 4. the wiring: armed late, recorded, and never for a network change ===");
{
  const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const r = strip(readFileSync(join(HERE, "../src/renderer/renderer.js"), "utf8"));
  const ask = r.slice(r.indexOf("function askConsent("), r.indexOf("// ═══ the turn"));
  check("askConsent arms voice only through the one rule: voiceApprovable(...)", /voiceApprovable\(proposal\.capabilityId\)/.test(ask));
  check("a spoken decision goes through voiceVerdict, and only approve or deny settles", /voiceVerdict\(/.test(ask) && /verdict === "approve"/.test(ask) && /verdict === "deny"/.test(ask));
  check("the listener is taken away when the card is settled, however it was settled", /personaUi\?\.onSpokenTurn\(null\)/.test(ask));
  check("a voice decision is recorded with the words heard", /recordVoiceConsent\?\.\(\{[^}]*heard/.test(ask));
  check("the card says, in words, when it was approved by voice", /by voice/i.test(ask));
  const main = strip(readFileSync(join(HERE, "../src/main/main.js"), "utf8"));
  check("main writes voice decisions to their own file, not the broker's audit log or the egress record", /voice-consent\.jsonl/.test(main) && !/egress\?\.record\("consent/.test(main));
  check("execute still takes a nonce and nothing else (D130/D200)", /window\.matic\.execute\(request\.nonce\)/.test(r) && !/execute\(request\.nonce,/.test(r));
}

// ==============================================================================================
console.log("\n=== 5. the machine band, as a sentence (D308) ===");
{
  const groups = [
    { group: "Who and where", rows: [{ label: "This computer", value: "WAKANDA-CANARY" }, { label: "Signed in as", value: "charles-canary" }] },
    { group: "How this machine is doing", rows: [{ label: "Last restarted", value: "16 hours ago", state: "watch" }, { label: "Memory", value: "Almost full", state: "attn" }] },
    { group: "What is running", rows: [{ label: "Printing", value: "Running normally" }, { label: "Sound", value: "Running normally" }] },
    { group: "Network", rows: [{ label: "Network adapter", value: "Intel(R) Ethernet CANARY" }, { label: "Network", value: "Connected, address given out automatically" }, { label: "This machine's address", value: "192.168.50.222" }, { label: "Router", value: "192.168.50.1" }] },
    { group: "Storage", rows: ["C:", "D:", "E:"].map((d) => ({ label: `Disk space (${d})`, value: "Plenty of room — 71 GB free" })) },
  ];
  const s = machineSummaryReply(groups);
  console.log(`        ${s}`);
  check("it leads with what is marked, in the band's own words", /^Two things stand out: last restarted — 16 hours ago and memory — almost full\./.test(s), s);
  check("it says the rest looks normal, and collapses healthy drives to one clause", /printing — running normally/.test(s) && /all 3 drives have room/.test(s));
  check("it never says the computer's name, the account, an address, the router or the adapter (D249)", !/CANARY|charles|192\.168|Intel/i.test(s), s);
  check("it gives no advice (D256: a mark is not advice)", !/should|recommend|restart it|try |you need/i.test(s));
  check("it points at the band", /on the screen/.test(s));
  const healthy = machineSummaryReply(groups.map((g) => ({ ...g, rows: g.rows.map(({ state, ...r }) => r) })));
  check("a healthy machine: nothing stands out", /^Nothing stands out\./.test(healthy), healthy);
  const oneFull = machineSummaryReply([{ group: "Storage", rows: [{ label: "Disk space (C:)", value: "Getting full — 8 GB free", state: "attn" }, { label: "Disk space (D:)", value: "Plenty of room — 463 GB free" }] }]);
  check("a full drive is named and the others are 'the other'", /One thing stands out: disk space \(C:\) — getting full — 8 GB free\./.test(oneFull) && /the drive has room|the other 1 drives have room/.test(oneFull), oneFull);
  check("an unread row is said as unread, not as fine", /I couldn't read memory\./.test(machineSummaryReply([{ group: "How this machine is doing", rows: [{ label: "Memory", value: "Could not be read", state: "unread" }] }])));
  check("no rows at all: it says it cannot tell, rather than that all is well", /can't read anything/.test(machineSummaryReply([])) && /can't read anything/.test(machineSummaryReply(null)));
  check("the file imports nothing, reads no probe and holds no figure of its own - it has only the band's rows", !/^\s*import\s|probe|commitUsed|uptimeMs|Fraction|\bGB\b|percent|\d{2,}/m.test(readFileSync(join(HERE, "../src/agent/machine-summary.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));

  for (const t of ["how is my computer doing", "How's my PC?", "what can you see about this machine", "is my computer ok", "how much disk space do I have", "when was it last restarted", "tell me about this machine", "how is this machine doing today"]) {
    check(`"${t}" -> machine`, classify(t).kind === "machine", `${classify(t).kind} (${classify(t).why})`);
  }
  for (const t of ["my computer is broken", "my machine won't turn on", "restart my computer", "my printer isn't working", "hello", "where's my ticket", "the machine in the meeting room is jammed"]) {
    check(`"${t}" is NOT machine (${classify(t).kind})`, classify(t).kind !== "machine");
  }
}

// ==============================================================================================
console.log("\n=== 6. the name, as real recognisers write it (D313, proposed) ===");
{
  // From the service's own transcripts of Charles's two sessions, and the bakeoff: "Malik", "Malic",
  // "Maddox", and base.en's Maddick / Maddock / Mattick / Madic.
  for (const t of ["Hello, Malik. How you doing?", "Hello Maddox, how you doing?", "hey malic", "Hey, Malic.", "good morning maddick", "thanks mattick", "hi matic how are you"]) {
    check(`"${t}" is social, not a problem for the model`, classify(t).kind === "social", `${classify(t).kind} (${classify(t).why})`);
  }
  for (const t of ["matic", "Matic?", "malik", "matic desk", "hey matic"]) {
    check(`"${t}" alone is a greeting - saying its name is how people start`, classify(t).kind === "social" && classify(t).subkind === "greeting", `${classify(t).kind}/${classify(t).subkind}`);
  }
  for (const t of ["matic my printer is broken", "malik's laptop will not turn on", "hey matic I can't get online", "maddox said the projector is dead"]) {
    check(`"${t}" is still NOT social`, classify(t).kind !== "social", classify(t).kind);
  }
  check('"medic" is not taken as the name - it is a word', classify("I need a medic").kind !== "social");
}

// ==============================================================================================
console.log("\n=== 7. the capability answer, shaped to be said (D315) ===");
{
  const { capabilityReply, capabilitySpokenReply } = await import("../src/router/social.js");
  const persona = (await import("../src/router/persona.json", { with: { type: "json" } })).default;
  const tiers = catalog.tiers ?? {};
  const caps = catalog.capabilities.map((c) => ({ id: c.id, title: c.title, plain: c.plain, tierInfo: tiers[c.tier] ?? { label: c.id === "reset_adapter" ? "Disruptive" : "Low risk" } }));
  const written = capabilityReply({ capabilities: caps }), spoken = capabilitySpokenReply({ capabilities: caps });
  console.log(`        ${spoken}`);
  check("every ability the written answer names is in the spoken one, in the catalog's own words", caps.every((c) => written.includes(c.plain.helpsWith) && spoken.includes(c.plain.helpsWith.replace(/[.;]+$/, ""))));
  check("it says how many first, so a listener knows how long the list is", spoken.includes(`I can help with ${["no things", "one thing", "two things", "three things", "four things"][caps.length]} on this machine.`));
  check("one short sentence per ability, each a whole sentence with its 'when'", (spoken.match(/, when /g) ?? []).length === caps.length && /First, when /.test(spoken) && /And (second|third|fourth|fifth), when /.test(spoken));
  check("no semicolons, dashes or brackets - nothing a voice has to guess how to read", !/[;—–()\[\]{}:]/.test(spoken), spoken.match(/[;—–()\[\]{}:]/)?.[0]);
  const longest = Math.max(...spoken.split(/(?<=[.!?])\s+/).map((s) => s.split(/\s+/).length));
  check("no sentence over 30 words", longest <= 30, String(longest));
  check("it names no mechanism: no capability id and no catalog title (D250)", !caps.some((c) => spoken.toLowerCase().includes(c.id) || spoken.toLowerCase().includes(String(c.title).toLowerCase())));
  check("it still says nothing changes without approval, and where its edge is", /nothing changes until you approve/.test(spoken) && /hand it to IT/.test(spoken));
  check("with no catalog it promises nothing - the same line as the written answer", capabilitySpokenReply({ capabilities: [] }) === persona.capability.noCatalog);
  const one = capabilitySpokenReply({ capabilities: caps.slice(0, 1) });
  check("one ability: 'one thing', 'First', and no 'And first'", /one thing/.test(one) && /First, when /.test(one) && !/And first/.test(one));
  check("it fits one note to the persona", spoken.length < 1800, String(spoken.length));
  const agentSrc = readFileSync(join(HERE, "../src/agent/agent.js"), "utf8");
  check("the agent returns it beside the written reply for a capability question, and only then", /kind\.subkind === "capability" \? \{ spokenReply: capabilitySpokenReply\(/.test(agentSrc));
  const r = readFileSync(join(HERE, "../src/renderer/renderer.js"), "utf8");
  check("the spoken shape goes through D249's redaction before it reaches her", /spokenShape \? spokenForm\(plainProse\(spokenShape\), spokenEnv\) : heard/.test(r));
}

// ==============================================================================================
console.log("\n=== 8. a problem introduced with 'can you help me' is a problem (D316) ===");
{
  for (const t of ["I'm having problems with my network printer. Can you help me with it?", "can you help me with my email", "my screen is flickering, can you help me with that"]) {
    check(`"${t}" is NOT a capability question`, !(classify(t).kind === "social" && classify(t).subkind === "capability"), `${classify(t).kind}/${classify(t).subkind ?? ""}`);
  }
  for (const t of ["what can you help me with", "what can you do", "what are your capabilities", "tell me about yourself", "what can you help with"]) {
    check(`"${t}" still is`, classify(t).kind === "social" && classify(t).subkind === "capability", `${classify(t).kind}/${classify(t).subkind ?? ""}`);
  }
  const prompt = readFileSync(join(HERE, "../../server/src/nuance/persona-prompt.txt"), "utf8");
  check("the prompt no longer tells her not to read out what she is given", !/Never read those out/.test(prompt) && !/ask for it to be shown/.test(prompt));
  check("…it tells her to say all of what she is given, even when it is on the screen", /Say all of it, out loud, even when it is also on the screen/.test(prompt) && /never shorten a list you are given/.test(prompt));
  check("…and still that she cannot see the screen and must not describe it", /You cannot see it\. Never describe it/.test(prompt));
}

// ==============================================================================================
console.log("\n=== 10. D321 (the founder's): a ticket may be submitted by voice ===");
{
  for (const t of ["submit the ticket", "Submit.", "send it", "Send.", "yes, submit it", "go ahead and send", "submit it please", "send the ticket"]) {
    check(`"${t}" submits`, ticketVerdict(t) === "submit", ticketVerdict(t));
  }
  for (const t of ["yes", "ok", "sure", "go ahead", "", "that looks right", "Charles", "Building A"]) {
    check(`"${t}" sends NOTHING`, ticketVerdict(t) === "unclear", ticketVerdict(t));
  }
  for (const t of ["don't send it", "do not submit", "wait don't send that yet", "should I send it", "what happens if I submit", "not yet, I need to change the description before you send it"]) {
    check(`"${t}" does NOT submit`, ticketVerdict(t) !== "submit", ticketVerdict(t));
  }
  for (const t of ["cancel", "cancel the ticket", "no", "don't send it", "never mind"]) check(`"${t}" cancels`, ticketVerdict(t) === "cancel", ticketVerdict(t));
  check("the phrase the draft pointer teaches is one the rule accepts", POINTERS.draft.includes("submit the ticket") && ticketVerdict("submit the ticket") === "submit");
  const r = readFileSync(join(HERE, "../src/renderer/renderer.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const card = r.slice(r.indexOf("function reviewTicket("), r.indexOf("function askConsent("));
  check("the review card listens only through ticketVerdict(), and only during a live session", /personaUi\?\.live/.test(card) && /ticketVerdict\(/.test(card));
  check("a spoken submit presses the SAME button - there is no second way to send", /send\.onclick\(\)/.test(card) && /cancel\.onclick\(\)/.test(card));
  check("…and it is written down with the words heard", /recordVoiceConsent\?\.\(\{[^}]*ticket\.submit[^}]*heard/.test(card));
  check("the listener is taken away when the card is answered, either way", (card.match(/personaUi\?\.onSpokenTurn\(null\)/g) ?? []).length >= 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
