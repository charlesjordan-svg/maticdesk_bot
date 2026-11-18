/**
 * Who answers a spoken turn (D318), and the camera on the microphone's terms (D319). Both the
 * founder's, 2026-11-17.
 *
 * Run: node test/turn-routing.test.mjs        (from client/; part of `npm test`)
 *
 * D318 exists because of one transcript: "It's a beautiful day. How are you doing?" was routed to
 * Matic's model as a problem and answered, twice, with an offer to open a ticket. What is pinned
 * here is that conversation stays hers, and that nothing true is lost by it: a question this
 * machine can answer from its own records is routed whether or not she hands it off.
 */
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spokenTurnRoute } from "../src/nuance/turn-routing.js";
import { classify } from "../src/router/classify.js";
import { EgressAudit, EGRESS_EVENTS } from "../src/ticket/egress-audit.js";

const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}
const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const read = (rel) => readFileSync(join(HERE, rel), "utf8");
/** What the window would do with a spoken sentence, given what the classifier says and nothing else. */
const routeOf = (text, extra = {}) => { const k = classify(text); return spokenTurnRoute({ kind: k.kind, subkind: k.subkind, verb: k.verb ?? null, ...extra }); };

// ==============================================================================================
console.log("=== 1. conversation is hers ===");
{
  for (const t of [
    "It's a beautiful day. How are you doing?",            // the sentence that got a ticket offer
    "Hello, can you hear me now?",
    "I'm good.",
    "did you see the game last night",
    "thank you so much",
    "tell me something interesting",
    "But we haven't even talked about opening a ticket yet.",
  ]) {
    // Since D327 the classifier's DEFAULT (no verb, no question marker - which is most of these)
    // is ASKED of the knowledge base with a silent decline, so "hers" and "ask" are both
    // conversation here. What may never happen to any of them is "route".
    const r = routeOf(t);
    check(`"${t}" -> never routed (${r}: hers, or asked with a silent decline)`, r === "hers" || r === "ask", r);
  }
  check("a sentence the social layer recognises is hers outright, no hub round trip", routeOf("I'm good.") === "hers", routeOf("I'm good."));
  check("with no facts at all, it is hers", spokenTurnRoute() === "hers" && spokenTurnRoute({}) === "hers");
}

// ==============================================================================================
console.log("\n=== 2. work is Matic's ===");
{
  check("she handed it off: routed, whatever it says", spokenTurnRoute({ handedOff: true, kind: "action" }) === "route" && routeOf("I'm good.", { handedOff: true }) === "route");
  check("Matic is waiting on an answer: routed, whatever it says - 'yes' to a ticket offer is an answer, not small talk", routeOf("Yes.", { awaitingAnswer: true }) === "route" && routeOf("Charles", { awaitingAnswer: true }) === "route");
  for (const t of ["where is my ticket", "do I have any open tickets", "how is my computer doing", "how much disk space do I have", "what can you do", "what are your capabilities"]) {
    check(`"${t}" -> routed even with NO hand-off: this machine's own records answer it`, routeOf(t) === "route", routeOf(t));
  }
  check("a PROBLEM she did not hand off is ASKED of the knowledge base (D327) and never routed - the cost is in the file's header", routeOf("my screen is flickering") === "ask", routeOf("my screen is flickering"));
  check("…and the same problem, handed off, is routed", routeOf("my screen is flickering", { handedOff: true }) === "route");
  check("only the three fields decide: a string 'true' is not a hand-off", spokenTurnRoute({ handedOff: /** @type {any} */ ("true") }) === "hers");
}

// ==============================================================================================
console.log("\n=== 3. the wiring ===");
{
  const ui = strip(read("../src/renderer/persona-ui.js"));
  check("the controls decide through spokenTurnRoute() and nothing else, handing it the verb too (D326)", /spokenTurnRoute\(\{ awaitingAnswer: info\.awaiting, kind: info\.kind, subkind: info\.subkind, verb: info\.verb \}\)/.test(ui));
  check("a hand-off is waited for only when the first two facts do not already route", /route === "hers" && stage && \(await stage\.waitForHandOff\(/.test(ui));
  check("a turn that is hers is SHOWN - the user's words, then hers - remembered as unrouted (D329), and not submitted", /showSpoken\(next\);\s*for \(const line of heldHers\.splice\(0\)\) showHers\(line\);\s*lastUnrouted = \{[^}]*\};\s*deciding = false;\s*return;/.test(ui));
  // 2026-11-17: the import of spokenTurnRoute was written INSIDE a comment block. `node --check`
  // passes that, every structural check here passed that, and in the window every spoken turn
  // threw "spokenTurnRoute is not defined" into a promise nobody was watching. So: it is imported
  // in CODE, and a failure in a spoken turn is caught and said.
  check("spokenTurnRoute is imported in code, not in a comment", /^import \{ spokenTurnRoute \} from "\.\.\/nuance\/turn-routing\.js";/m.test(ui));
  check("a spoken turn that throws is caught and said in the developer log, and does not poison the ones after it", /chain = chain\.then\(\(\) => handleSpoken\(\)\)\.catch\(/.test(ui) && /a spoken turn could not be handled/.test(ui));
  const main = strip(read("../src/main/main.js"));
  check("the classifier is asked in the main process, locally", /ipcMain\.handle\("agent:spoken"/.test(main) && /classifySpoken\(/.test(main));
  check("'waiting on an answer' means this sentence answers it - and an offer talked past is dropped", /intake\?\.answers\?\.\(/.test(main) && /if \(pending && !awaiting\) \{\s*intake\.clear\(\);/.test(main));
  {
    const { TicketIntake } = await import("../src/ticket/intake.js");
    const mk = () => { const i = new TicketIntake({ profile: { missing: () => [{ key: "firstName", label: "First name", question: "What is your first name?" }] }, now: () => 1000 }); i.offer({ escalation: { category: "hardware" }, userText: "my screen is cracked" }); return i; };
    const offered = mk();
    check("no offer: nothing answers", new TicketIntake({ profile: { missing: () => [] } }).answers("yes") === false);
    for (const t of ["Yes.", "yes please", "sure", "go ahead", "No thanks", "cancel"]) check(`an offer is answered by "${t}"`, mk().answers(t) === true);
    for (const t of ["It's a beautiful day. How are you doing?", "But we haven't even talked about opening a ticket yet.", "I'm good.", "what's the capital of France"]) {
      check(`…and NOT by "${t}"`, mk().answers(t) === false);
    }
    check("answers() changes nothing: the offer is still there afterwards", offered.answers("how are you") === false && offered.isPending === true);
    const collecting = mk(); collecting.accept("yes");
    check("while details are being collected, every sentence is the answer", collecting.answers("Charles") === true && collecting.answers("Building A") === true);
  }
  const stage = strip(read("../src/renderer/persona-stage.js"));
  check("her own words are shown only when the client did not just speak for her", /if \(!weSpoke && hers\) onPersonaSaid\(hers\)/.test(stage));
  check("…and are still never logged", !/devlog\([^;]*(herWords|hers\b)/.test(stage));
  const r = strip(read("../src/renderer/renderer.js"));
  check("typed turns are untouched: the Send button and Enter still go straight to submit()", /sendBtn\.addEventListener\("click", \(\) => submit\(inputEl\.value\)\)/.test(r));
}

// ==============================================================================================
console.log("\n=== 4. the camera (D319, D324) ===");
{
  // Since D324 the camera has a policy file of its own, and test/camera-policy.test.mjs is where
  // its four rules and main.js's wiring are pinned. What stays here is the record: the fact, never
  // the picture.
  check("the two camera events are in the record's vocabulary", ["persona.video.on", "persona.video.off"].every((e) => EGRESS_EVENTS.includes(e)));
  const dir = mkdtempSync(join(tmpdir(), "matic-camera-"));
  const egress = new EgressAudit({ path: join(dir, "egress.jsonl") });
  egress.persona("persona.video.on", { sessionRef: "s1", frame: "PICTURE-CANARY", image: "PICTURE-CANARY" });
  egress.persona("persona.video.off", { sessionRef: "s1", reason: "user", videoSentMs: 1500 });
  const raw = readFileSync(join(dir, "egress.jsonl"), "utf8");
  check("the record says the camera went on and off, for how long - and holds no picture", raw.trim().split("\n").length === 2 && !raw.includes("CANARY") && /"videoSentMs":1500/.test(raw));
  check("the camera's policy lives in its own file, and this test no longer pins main.js's inline conditions", existsSync(join(HERE, "../src/nuance/camera-policy.js")) && existsSync(join(HERE, "camera-policy.test.mjs")));
}

// ==============================================================================================
console.log("\n=== 5. the self-view is a corner, not the frame ===");
{
  const css = read("../src/renderer/panel/matic-panel.app.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const general = css.match(/\.persona-stage video \{[^}]*\}/)?.[0] ?? "";
  const self = css.match(/\.persona-stage video\.persona-self \{[^}]*\}/)?.[0] ?? "";
  check("the persona's video fills the frame", /width:100%/.test(general) && /height:100%/.test(general));
  // 2026-11-17: `.persona-self` alone lost to `.persona-stage video` and the user's own picture
  // was drawn full-frame, over her face.
  check("the self-view's rule is MORE specific than the frame-filling one, so it cannot be overridden by it", self.length > 0 && !/^\.persona-self \{/m.test(css));
  check("it is small", /width:(1\d|2\d|3[0-3])%/.test(self) && !/height:100%/.test(self), self);
  check("it sits in the LOWER LEFT, above the label bar", /left:\d+px/.test(self) && /bottom:\d+px/.test(self) && /right:auto/.test(self) && /top:auto/.test(self));
}

// ==============================================================================================
console.log("\n=== 6. one size, and it is the large one (D323) ===");
{
  const ui = strip(read("../src/renderer/persona-ui.js"));
  check("there is no size button and no size toggle", !/persona-size/.test(read("../src/renderer/index.html")) && !/toggleSize|matic\.persona\.large/.test(ui));
  check("the rail is large whenever a session is live", /rail\?\.classList\.toggle\("persona-large", live\)/.test(ui));
  check("clicking the face does nothing", !/els\.stage\.onclick/.test(ui));
}

// ==============================================================================================
console.log("\n=== 7. a spoken QUESTION asks the knowledge base, and a decline is silent (D325) ===");
{
  // Until this, `question` fell through to "hers": "how do I take a screenshot?" was answered
  // from world knowledge while the knowledge base held the article. Now it is ASKED - the hub's
  // /v1/ask and nothing else - and a decline produces nothing, so D318's defect (Matic
  // volunteering an offer for a pleasantry) cannot come back through this door.
  for (const t of ["How do I take a screenshot?", "What's our policy on expensing a taxi?", "what's the capital of France"]) {
    check(`"${t}" -> ask (the knowledge base only)`, routeOf(t) === "ask", routeOf(t));
  }
  check("a question Matic is waiting on an answer to is the ANSWER, not a lookup", routeOf("How do I take a screenshot?", { awaitingAnswer: true }) === "route");
  check("a question she handed off is routed, whatever it says (D318 wins)", routeOf("How do I take a screenshot?", { handedOff: true }) === "route");
  check("tickets, the machine and capabilities still route ahead of the lookup", routeOf("where is my ticket") === "route" && routeOf("how is my computer doing") === "route" && routeOf("what can you do") === "route");
  check("the classifier's DEFAULT action - every unrecognised sentence - is ASKED since D327, and never routed", routeOf("my screen is flickering") === "ask" && routeOf("It's a beautiful day. How are you doing?") === "ask" && routeOf("did you see the game last night") === "ask");
  check("the pure function returns exactly three answers", new Set(["route", "ask", "hers"]).has(spokenTurnRoute({ kind: "question" })) && spokenTurnRoute({ kind: "question" }) === "ask");

  const { lookupHold, lookupRelease } = await import("../src/nuance/surface-split.js");
  const hold = lookupHold();
  check("the floor is held while the hub is asked, with a short reason, and the user talking does NOT end the hold", hold.type === "session.floor.hold" && typeof hold.reason === "string" && hold.reason.length <= 200 && hold.ends_on_speech === false);
  check("…and released afterwards, answered or declined", lookupRelease().type === "session.floor.release");

  const ui = strip(read("../src/renderer/persona-ui.js"));
  const askBranch = ui.slice(ui.indexOf('if (route === "ask") {'), ui.indexOf('if (route === "hers") {'));
  check("the window asks through askKnowledge() with the floor held BEFORE and released AFTER, asking for the lexical gate on the default action only (D327)", /stage\?\.holdForLookup\(\);[\s\S]*bridge\.askKnowledge\?\.\(next, \{ requireLexicalMatch: info\.kind === "action" \}\)[\s\S]*stage\?\.releaseLookup\(\);/.test(askBranch));
  check("an answer is shown and said through showAnswer(); the branch never calls submit() itself", /await showAnswer\(asked\)/.test(askBranch) && !/submit\(/.test(askBranch));
  check("a decline or an unreachable hub adds NOTHING: no offer, no escalation, no proposal - her answer stands", !/attachOffer|escalat|propose\(/.test(askBranch) && /nothing added; her answer stands/.test(askBranch));
  check("…unless she handed it off meanwhile, in which case D318 wins and it is routed", /waitForHandOff\(0\)[\s\S]{0,200}route = "route"/.test(askBranch));
  check("a hand-off ALREADY open wins before the lookup starts, and is not waited for", /if \(route === "ask" && stage && \(await stage\.waitForHandOff\(0\)\)\) route = "route";/.test(ui));
  check("every spoken turn writes one [spoken] line - kind, route, outcome, never words - so §2.5's number can be read from audit/app.log", (ui.match(/spokenLine\(info, "(ask|hers|route)", /g) ?? []).length === 3 && /personaLog\?\.\(`\[spoken\] kind=\$\{info\.kind \?\? "\?"\} route=\$\{route\} outcome=\$\{outcome\}/.test(ui) && !/personaLog\?\.\([^)]*next/.test(ui));

  const stage = strip(read("../src/renderer/persona-stage.js"));
  check("the stage sends the hold and the release it is handed and writes no floor event of its own", /holdForLookup\(\) \{ if \(phase === "live"\) send\(lookupHold\(\)\); \}/.test(stage) && /releaseLookup\(\) \{ if \(phase === "live"\) send\(lookupRelease\(\)\); \}/.test(stage) && !/session\.floor\.hold/.test(stage));
  const agent = strip(read("../src/agent/agent.js"));
  const ask = agent.slice(agent.indexOf("async askKnowledge(text"), agent.indexOf("async propose(text)"));
  check("agent.askKnowledge() reaches ask() on the hub client and nothing else: no propose, no broker, no escalation, no intake", /this\.cloud\.ask\(text, \{ probe, requireLexicalMatch \}\)/.test(ask) && !/propose|broker|escalat|intake/.test(ask));
  check("…gated as the typed path is: a provider with no ask() has no knowledge base", /typeof this\.cloud\?\.ask !== "function"/.test(ask));
  const main = strip(read("../src/main/main.js"));
  check("main.js exposes it as agent:ask, caught, and the preload names it askKnowledge - the gate flag rides along and is read as a strict boolean", /ipcMain\.handle\("agent:ask"/.test(main) && /agent\.askKnowledge\(String\(text \?\? ""\), \{ requireLexicalMatch: opts\?\.requireLexicalMatch === true \}\)/.test(main) && /askKnowledge: \(text, opts\) => ipcRenderer\.invoke\("agent:ask", text, opts \?\? \{\}\)/.test(read("../src/main/preload.cjs")));
  const r = strip(read("../src/renderer/renderer.js"));
  check("the renderer's showAnswer says it came from the company's written guidance and shows and says it as a typed answer is", /showAnswer: async \(r\) => \{[\s\S]*answered from your company's written guidance[\s\S]*await knowledgeAnswered\(r\.reply/.test(r) && (r.match(/await knowledgeAnswered\(/g) ?? []).length === 2);
  check("typed turns are untouched: handleTurn still asks the agent through propose() and still offers on a decline", /const res = await window\.matic\.propose\(text\);/.test(r) && /No company guidance covers this — nothing was filed\./.test(read("../src/renderer/renderer.js")));
}

// ==============================================================================================
console.log("\n=== 8. an action that matched an explicit VERB is routed; the default is not (D326, the founder's) ===");
{
  // Charles, 2026-11-17: "Yes, build it." "Restart the spooler" and "fix my printer" are the
  // sentences the bakeoff measured; the voice path now takes that path for them without waiting
  // for her hand-off. The classifier's default stays hers, so "it's a beautiful day" cannot come
  // back as a ticket offer through this door.
  for (const t of ["restart the spooler", "fix my printer", "can you reset my network adapter", "please clear the print queue"]) {
    const k = classify(t);
    check(`"${t}" -> routed, on verb "${k.verb}"`, k.kind === "action" && typeof k.verb === "string" && k.verb.length > 0 && routeOf(t) === "route", `${k.kind}/${k.verb}/${routeOf(t)}`);
  }
  for (const t of ["my screen is flickering", "My printer won't print.", "Hello, can you hear me now?", "But we haven't even talked about opening a ticket yet."]) {
    const k = classify(t);
    check(`"${t}" -> the default action, no verb, NOT routed (asked, D327)`, k.kind === "action" && k.verb === undefined && routeOf(t) === "ask", `${k.kind}/${k.verb}/${routeOf(t)}`);
  }
  check("the decision reads the `verb` FIELD, not the why string: a kind of action with no verb is asked, with a verb is routed", spokenTurnRoute({ kind: "action" }) === "ask" && spokenTurnRoute({ kind: "action", verb: null }) === "ask" && spokenTurnRoute({ kind: "action", verb: "" }) === "ask" && spokenTurnRoute({ kind: "action", verb: "restart" }) === "route");
  check("a verb on any other kind changes nothing", spokenTurnRoute({ kind: "question", verb: "restart" }) === "ask" && spokenTurnRoute({ kind: "social", subkind: "greeting", verb: "restart" }) === "hers");
  const main = strip(read("../src/main/main.js"));
  check("agent:spoken hands the window the verb, null for the default", /verb: typeof k\.verb === "string" && k\.verb \? k\.verb : null/.test(main));
  const cls = strip(read("../src/router/classify.js"));
  check("classify() sets `verb` only on the ACTION_VERB match and not on the default", /return \{ kind: "action", verb: v\.trim\(\)/.test(cls) && /return \{ kind: "action", why: "no question marker/.test(cls));
}

// ==============================================================================================
console.log("\n=== 9. an UNRECOGNISED sentence asks the knowledge base, behind the lexical gate (D327) ===");
{
  // The 2026-11-17 23:41 session, read from its log: seven spoken turns, every one `action`, five
  // with no verb - the classifier's default - and so five answered by her model, which has no
  // access to this machine or the knowledge base. D326 was right that the default must not be
  // ROUTED; nothing had been put in the gap it opened. So the default is ASKED, as a question is
  // (D325): a decline is silent, so this can only ADD a correct answer and cannot volunteer a
  // ticket offer for a pleasantry (D318's defect).
  for (const t of ["my screen keeps going black", "it's doing that thing again", "nothing happens when I click it", "thank you so much"]) {
    const k = classify(t);
    check(`"${t}" -> the default action -> ask`, k.kind === "action" && k.verb === undefined && routeOf(t) === "ask", `${k.kind}/${k.verb}/${routeOf(t)}`);
  }
  check("the three facts that already route still win over the lookup", spokenTurnRoute({ kind: "action", awaitingAnswer: true }) === "route" && spokenTurnRoute({ kind: "action", handedOff: true }) === "route" && spokenTurnRoute({ kind: "action", verb: "fix" }) === "route");
  check("social small talk the classifier recognises is still hers with no round trip at all", spokenTurnRoute({ kind: "social", subkind: "greeting" }) === "hers" && spokenTurnRoute({ kind: "social", subkind: "thanks" }) === "hers");
  check("still exactly three answers, and `ask` is the default action's", spokenTurnRoute({ kind: "action" }) === "ask" && spokenTurnRoute({}) === "hers");

  // THE GATE. kb.test.mjs shows the lexical leg returns ZERO chunks for an off-corpus sentence while
  // the dense leg always returns neighbours. So for the default action - which is most sentences
  // spoken to a face - the hub is asked NOT to call its model unless the lexical leg found at
  // least one chunk: a pleasantry costs one retrieval and no model call. A spoken QUESTION keeps
  // D325's shape (the model decides), because a question whose phrasing shares no term with its
  // article is exactly the case the dense leg exists for.
  const hub = strip(read("../src/agent/hub-client.js"));
  check("the hub client sends `requireLexicalMatch: true` ONLY when asked to, and never otherwise", /requireLexicalMatch \? \{ requireLexicalMatch: true \} : \{\}/.test(hub));
  check("…and the flag is read off the response for the log, never used to change what is said", /modelCalled/.test(hub) && !/UNCHECKED|DECLINE_REPLY/.test(hub));
  const ui = strip(read("../src/renderer/persona-ui.js"));
  check("the window names the two cases apart in its own log - a question, and an unrecognised sentence", /an unrecognised spoken sentence/.test(ui) && /a spoken question/.test(ui));
}

// ==============================================================================================
console.log("\n=== 10. the next session diagnoses itself: verb, why, turn id, the hand-off's legs, the latch ===");
{
  // Everything in handover 2026-11-18 §1-§5 cost a careful read of sixty log lines and two of its
  // findings were inferences. These are the fields that make them facts.
  const ui = strip(read("../src/renderer/persona-ui.js"));
  check("one builder for the [spoken] line, carrying turn=, verb=, the turn-to-decision lag and the classifier's why - and never the words", /function spokenLine\(info, route, outcome\)/.test(ui) && /turn=\$\{turn\}/.test(ui) && /verb=\$\{info\.verb \?\? "-"\}/.test(ui) && /decided=\+\$\{/.test(ui) && /why=\$\{info\.why \?\? "\?"\}/.test(ui) && !/spokenLine\([^)]*next/.test(ui));
  check("a spoken turn is queued WITH its id and the instant it ended, from the stage", /function enqueue\(text, meta = \{\}\)/.test(ui) && /onUserTurn: \(text, meta\) =>/.test(ui));
  const main = strip(read("../src/main/main.js"));
  check("agent:spoken hands the window the classifier's why as well", /why: typeof k\.why === "string" \? k\.why : null/.test(main));
  check("a talked-past offer logs what the sentence that followed CLASSIFIED as, and the stage the offer was at - not the words", /talked past in conversation - dropped \(the sentence that followed classified as \$\{k\.kind\}/.test(main) && /const stageWas = intake\?\.state\?\.stage \?\? "\?";/.test(main) && /the offer was at stage \$\{stageWas\}/.test(main) && !/talked past[^\n]*\$\{text/.test(main));
  check("propose and askKnowledge each log how long the main-process half took, in ms", /\[agent\] propose answered in \$\{Date\.now\(\) - t0\} ms/.test(main) && /\[agent\] askKnowledge answered in \$\{Date\.now\(\) - t0\} ms/.test(main));

  const stage = strip(read("../src/renderer/persona-stage.js"));
  check("the stage numbers the user's turns and the turn line carries the number", /let turnNo = 0;/.test(stage) && /the user finished turn \$\{turnNo\}/.test(stage) && /onUserTurn\(text, \{ turn: turnNo, endedAt: Date\.now\(\) \}\)/.test(stage));
  check("the hand-off's legs are each a [handoff] line: opened, submitted, relayed, she began speaking, she finished", /\[handoff\] opened/.test(stage) && /\[handoff\] turn \$\{turn\} submitted/.test(stage) && /\[handoff\] relayed as the result of her hand-off/.test(stage) && /\[handoff\] she began speaking/.test(stage) && /\[handoff\] she finished speaking/.test(stage));
  check("…each with the gap in ms from the leg before it, and persona-ui marks the submission", /ms after the hand-off/.test(stage) && /ms after the relay/.test(stage) && /stage\?\.noteSubmitted\?\.\(turn\)/.test(ui));
  check("…and the legs say nothing anybody said", !/\[handoff\][^\n]*(text|transcript|delta|herWords)/.test(stage));
  // §5: the no-sound hint fired five times in one session on a microphone that was producing
  // sound between the pauses, because `heard` was reset every time the watcher was (re)started.
  check("the no-sound hint is a per-session LATCH: once the microphone has produced sound in this session the hint is spent", /let heardThisSession = false;/.test(stage) && /heardThisSession = true;/.test(stage) && /if \(!heardThisSession\) \{\s*micHint =/.test(stage));
  check("…reset only when the session ends, not when the watcher restarts", (stage.match(/heardThisSession = false;/g) ?? []).length === 2 && /async function finish\(reason\) \{[\s\S]*heardThisSession = false;/.test(stage) && !/function watchMic\(\) \{[\s\S]{0,400}heardThisSession = false;/.test(stage));

  const script = read("../scripts/spoken-turns.mjs");
  check("scripts/spoken-turns.mjs reads the new fields and breaks the hers/ask lines down by why", /turn=/.test(script) && /why=/.test(script) && /decided=/.test(script));
}

// ==============================================================================================
console.log("\n=== 11. the open-ticket process, tightened from the 00:12 session's log (D329) ===");
{
  // Read from client/audit/app.log, conversation c0a946c0, 2026-11-18 00:12:54-00:16:27 Z, eleven
  // turns. Three things went wrong with the offer:
  //  (a) a question the knowledge base DECLINED was answered with the hub's own words - "I can
  //      raise a ticket for someone in IT to pick up, if you'd like" - and nothing was waiting for
  //      the answer: the next turn (one word) went to the knowledge base as an unrecognised
  //      sentence and was declined in silence;
  //  (b) she handed off a sentence a few milliseconds AFTER the silent decline had checked for a
  //      hand-off, so the hand-off stayed open and swallowed the NEXT sentence - "yes", two words -
  //      which the hub's model answered with no tool call (502) and she pointed at the screen;
  //  (c) a spoken question was asked of the knowledge base twice - once by the voice path
  //      (11.8 s, a model call) and again by propose() when she handed it off (7.7 s).
  const { Agent } = await import("../src/agent/agent.js");
  const { TicketIntake } = await import("../src/ticket/intake.js");
  const probe = { online: true, primary: [], services: {}, adapters: [], actionable: [] };
  const mk = (cloud) => {
    const intake = new TicketIntake({ profile: { missing: () => [], reporter: () => ({ osUsername: "tester" }), write: () => {} }, now: () => 1000 });
    const agent = new Agent({ broker: { validate: () => ({ ok: true, errors: [] }) }, cloud, intake, onLog: () => {} });
    agent.diagnose = () => ({ probe, summary: {}, identity: { computer: "TEST-PC", user: "tester" }, panel: {} });
    return { agent, intake };
  };
  const declining = () => {
    const calls = [];
    return { calls, available: true, async ask(text) { calls.push(text); return { ok: true, answered: false, reply: "I don't have company guidance covering that. I can raise a ticket for someone in IT to pick up, if you'd like.", citedArticleIds: [] }; }, async fileTicket() { return { ok: true }; }, async propose() { return { ok: false, error: "not reached" }; } };
  };
  // (a) the offer the decline makes is REAL: the next "yes" opens the draft.
  {
    const cloud = declining();
    const { agent, intake } = mk(cloud);
    const res = await agent.propose("what's the policy on expensing a taxi");
    check("a declined question comes back as an answer with the offer ARMED", res.ok === true && res.answer?.answered === false && res.answer?.offered === true && res.canFile === true, JSON.stringify(res.answer));
    check("…so Matic is waiting on an answer, and 'yes' is one", intake.isPending === true && intake.answers("yes") === true && intake.answers("It's a beautiful day") === false);
    const step = intake.accept("yes please");
    check("…and 'yes' opens the draft, with the question as the description and the decline as the case note", step.kind === "draft" && step.draft.description === "what's the policy on expensing a taxi" && step.draft.category === "needs_human_judgement" && step.draft.suggestedOwner === null && /written guidance/i.test(step.draft.whatWasChecked) && /^The user asked/.test(step.draft.summary), JSON.stringify(step));
    const { agent: a2, intake: i2 } = mk({ available: true, async ask() { return { ok: true, answered: true, reply: "Press Win+Shift+S.", citedArticleIds: ["kb-1"] }; }, async fileTicket() { return { ok: true }; } });
    const r2 = await a2.propose("how do I take a screenshot");
    check("an ANSWERED question arms nothing", r2.answer?.answered === true && r2.answer?.offered === false && i2.isPending === false);
    const { agent: a3, intake: i3 } = mk({ available: true, async ask() { return { ok: true, answered: false, reply: "decline" }; } });
    const r3 = await a3.propose("what's the policy on expensing a taxi");
    check("a build that cannot file arms nothing and says so", r3.answer?.offered === false && r3.canFile === false && i3.isPending === false);
  }
  // (c) the voice path's answer is reused by propose() for the same sentence, not fetched twice.
  {
    const cloud = declining();
    const { agent } = mk(cloud);
    await agent.askKnowledge("what's the policy on expensing a taxi");
    const res = await agent.propose("what's the policy on expensing a taxi");
    check("askKnowledge() then propose() of the SAME sentence asks the hub ONCE, and the offer is still armed", cloud.calls.length === 1 && res.answer?.offered === true, String(cloud.calls.length));
    await agent.propose("what's the policy on expensing a bus");
    check("a different sentence is asked afresh", cloud.calls.length === 2);
    const stale = mk(cloud).agent;
    await stale.askKnowledge("what's the policy on expensing a taxi");
    stale.lastAsked.at -= 10 * 60_000;
    await stale.propose("what's the policy on expensing a taxi");
    check("…and a result older than the window is not reused", cloud.calls.length === 4, String(cloud.calls.length));
  }
  // (b) a hand-off that arrives after a silent decline is answered with THAT sentence, not the next one.
  const stage = strip(read("../src/renderer/persona-stage.js"));
  check("the stage tells persona-ui when she hands something off to the client", /onHandOff = \(\) => \{\}/.test(stage) && /openHandOff = id;[\s\S]{0,400}onHandOff\(\);/.test(stage));
  const ui = strip(read("../src/renderer/persona-ui.js"));
  check("persona-ui remembers the last sentence it left unrouted - hers, or declined in silence - and for how long", /lastUnrouted = \{ text: next, meta: item\.meta, at: Date\.now\(\) \}/.test(ui) && (ui.match(/lastUnrouted = \{ text: next/g) ?? []).length === 2 && /UNROUTED_FOR_MS = 30_000/.test(ui));
  check("…and when her hand-off arrives with nothing in flight, that sentence is queued as the hand-off's, within the window", /onHandOff: \(\) => \{[\s\S]{0,600}enqueue\(lastUnrouted\.text, \{ \.\.\.lastUnrouted\.meta, handedOff: true \}\)/.test(ui) && /Date\.now\(\) - lastUnrouted\.at > UNROUTED_FOR_MS/.test(ui));
  check("…a queued hand-off is routed outright - no classifier wait, no lookup - and the [spoken] line says so", /if \(item\.meta\?\.handedOff === true\) route = "route";/.test(ui) && /spokenLine\(info, "route", info\.awaiting \? "answer" : item\.meta\?\.handedOff === true \? "handoff" : "work"\)/.test(ui));
  check("…and a routed turn clears the memory, so a later hand-off cannot re-send an answered sentence", /lastUnrouted = null;[\s\S]{0,200}stage\?\.noteSubmitted/.test(ui));
  const main = strip(read("../src/main/main.js"));
  check("the untagged fallback say() is tagged from the agent's own word for which fallback it was", /fallback: cloudResult\.reason === "connection" \? "hubUnreachable" : "hubNoAnswer"/.test(strip(read("../src/agent/agent.js"))) && /forPersona\(`fallback\.\$\{res\.fallback\}`\)/.test(strip(read("../src/renderer/renderer.js"))) && main.length > 0);
}

// ==============================================================================================
console.log("\n=== 12. fewer pointers: she is handed the words, not told to point (D330, the founder's) ===");
{
  // Charles, 2026-11-18, after the 00:12 session: "Reduce the times she says it's on the screen
  // beside you. She should be able to read what's on the screen beside me and summarize." In that
  // session she pointed at the screen four times in 213 s - for three hub errors and one executed
  // change. She cannot see the panel; "reading it" means being HANDED its words, with the guard
  // that she adds nothing (the relay, D308/D309). The words stay ours.
  const { SURFACES, personaTurn } = await import("../src/nuance/surface-split.js");
  for (const s of ["@execution", "@draft", "@consent", "@consentVoice", "@refused", "@consentRefused", "@consentDeclined", "fallback.hubUnreachable", "fallback.hubNoAnswer", "filing.noDestination", "filing.badDraft", "filing.unreachable", "filing.refused", "social.offtopic"]) {
    check(`${s} is relayed: the exact line, with the guard`, SURFACES[s] === "relay", SURFACES[s]);
  }
  check("filing.timeout is still silent, and the restart advice too", SURFACES["filing.timeout"] === "silent" && SURFACES["@restart"] === "silent");
  const c = personaTurn({ surface: "@consentVoice", text: "Restart the Print Spooler service. Nothing happens until you approve it." });
  check("a relayed consent card still holds the floor, hold first, and carries the card's own words", c.speak === "own" && c.floor?.type === "session.floor.hold" && c.send[0] === c.floor && /Print Spooler/.test(c.event.response.instructions) && /do not add to it/i.test(c.event.response.instructions));
  const r = strip(read("../src/renderer/renderer.js"));
  check("the consent line is spoken AFTER the broker rendered the card, from the card's own catalog words - never the model's reasoning", r.indexOf("const prepared = await window.matic.prepareConsent(proposal, navigator.language);") < r.indexOf('forPersona(personaUi?.live && voiceApprovable(proposal.capabilityId) ? "@consentVoice" : "@consent", consentSpoken(') && /function consentSpoken\(rendered, byVoice\)/.test(r) && /rendered\?\.detailPlain \|\| rendered\?\.what/.test(r) && !/consentSpoken\([^)]*reasoning/.test(r));
  check("…and it teaches the voice phrase only when the card may be approved by voice", /byVoice \? ".*yes, approve it.*" : /.test(r.slice(r.indexOf("function consentSpoken"), r.indexOf("function consentSpoken") + 900)));
  check("the draft is SUMMARISED to her - the user's words, the category in plain words, who it goes to, and that it stays here until submitted", /forPersona\("@draft", draftSpoken\(res\.ticketDraft\)\)/.test(r) && /function draftSpoken\(draft\)/.test(r) && /ESCALATION_PLAIN\.category\[draft\.category\]/.test(r) && /stays on this PC until you submit it/.test(r) && /say 'submit the ticket'/.test(r));
  check("a refused proposal, a refused card and a declined card are tagged, not left to the default pointer", /forPersona\("@refused"\);/.test(r) && /forPersona\("@consentRefused"\);/.test(r) && /forPersona\("@consentDeclined"\);/.test(r));
  check("a knowledge-base decline on the TYPED path attaches the offer it just made", /forPersona\("@answer"\);\s*const spoken = await say\(res\.reply, "declining"\);\s*if \(res\.answer\?\.offered\) attachOffer\(spoken\);/.test(r));
}

// ==============================================================================================
console.log("\n=== 13. she can end the session when asked, and a hung hub cannot hold the conversation (D331, D332) ===");
{
  // The 00:32 session (conversation 5fb05ace, 235 s, 25 turns): turn 3 was routed to Matic at
  // 00:33:13 and the hub never answered it inside the session (the one before had a propose take
  // 300 054 ms - the hub's own timeout). Every spoken turn is taken IN ORDER behind the one before
  // (D312), so turns 4 to 25 - twenty-two of them, several of which were Charles asking her to end
  // it - waited behind that submit and nothing happened: "She seems not to have the ability to
  // close the session. I tried several times and she wouldnt end it."
  const { wantsToEnd, END_PHRASES } = await import("../src/nuance/session-end.js");
  for (const t of ["end the session", "End the call.", "stop the video", "close the session", "end live video", "hang up", "that's all for now", "I'm done", "goodbye", "bye for now", "ok bye", "we're done here", "turn off the video", "end the conversation", "let's stop the chat"]) {
    check(`"${t}" ends the session`, wantsToEnd(t) === true);
  }
  for (const t of ["my screen keeps going black", "stop", "stop the spooler", "end of the month reports are slow", "can you close the ticket", "the call keeps dropping", "the video is choppy", "I'm done with this printer", "restart the spooler", "what can you do", "yes", ""]) {
    check(`"${t}" does NOT end the session`, wantsToEnd(t) === false, String(wantsToEnd(t)));
  }
  check("the phrases are a frozen list, and bare 'stop' is not on it", Object.isFrozen(END_PHRASES) && !END_PHRASES.includes("stop"));
  const ui = strip(read("../src/renderer/persona-ui.js"));
  check("the end check runs on the user's turn BEFORE anything is queued - it does not wait behind a routed turn", /onUserTurn: \(text, meta\) => \{\s*if \(wantsToEnd\(text\)\) \{ void endByVoice\(text, meta\); return; \}/.test(ui));
  check("…and ending is: one [spoken] line, her goodbye waited for briefly, then the same stop the button does", /async function endByVoice\(text, meta\)/.test(ui) && /spokenLine\(\{ kind: "end" \}, "end", "end"\)/.test(ui) && /await stage\.waitForReply\(END_REPLY_WAIT_MS\)/.test(ui) && /await stage\.stop\("user"\)/.test(ui));
  const stage = strip(read("../src/renderer/persona-stage.js"));
  check("the stage exposes the reply waiter it already had, bounded", /waitForReply\(ms\) \{ return audioDone\(ms\); \}/.test(stage));
  // D332: a routed turn is awaited for at most ROUTED_WAIT_MS by the chain; the submit itself goes on.
  check("a routed turn holds the chain for at most a ceiling, after which later turns are taken while its answer is still awaited", /const ROUTED_WAIT_MS = 20_000;/.test(ui) && /Promise\.race\(\[sent\.then\(\(\) => "done"\), new Promise\(\(resolve\) => setTimeout\(\(\) => resolve\("ceiling"\), ROUTED_WAIT_MS\)\)\]\)/.test(ui) && /its answer will still be relayed/.test(ui));
  check("…and the submit's own completion, not the ceiling, is what clears the spoken-turn flag", /const sent = submit\(next\)\.catch\(\(\) => \{\}\)\.finally\(\(\) => \{ if \(stage\) stage\.spokenTurn = false; \}\);/.test(ui) && !/await submit\(next\)/.test(ui));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
