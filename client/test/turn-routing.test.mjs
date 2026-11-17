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
    check(`"${t}" -> hers (nothing routed, no model asked on Matic's side)`, routeOf(t) === "hers", routeOf(t));
  }
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
  check("a PROBLEM she did not hand off is hers - the cost of this design, and it is in the file's header", routeOf("my screen is flickering") === "hers");
  check("…and the same problem, handed off, is routed", routeOf("my screen is flickering", { handedOff: true }) === "route");
  check("only the three fields decide: a string 'true' is not a hand-off", spokenTurnRoute({ handedOff: /** @type {any} */ ("true") }) === "hers");
}

// ==============================================================================================
console.log("\n=== 3. the wiring ===");
{
  const ui = strip(read("../src/renderer/persona-ui.js"));
  check("the controls decide through spokenTurnRoute() and nothing else, handing it the verb too (D326)", /spokenTurnRoute\(\{ awaitingAnswer: info\.awaiting, kind: info\.kind, subkind: info\.subkind, verb: info\.verb \}\)/.test(ui));
  check("a hand-off is waited for only when the first two facts do not already route", /route === "hers" && stage && \(await stage\.waitForHandOff\(/.test(ui));
  check("a turn that is hers is SHOWN - the user's words, then hers - and not submitted", /showSpoken\(next\);\s*for \(const line of heldHers\.splice\(0\)\) showHers\(line\);[\s\S]{0,60}return;/.test(ui));
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
  check("the classifier's DEFAULT action - every unrecognised sentence - is neither asked nor routed: it stays hers", routeOf("my screen is flickering") === "hers" && routeOf("It's a beautiful day. How are you doing?") === "hers" && routeOf("did you see the game last night") === "hers");
  check("the pure function returns exactly three answers", new Set(["route", "ask", "hers"]).has(spokenTurnRoute({ kind: "question" })) && spokenTurnRoute({ kind: "question" }) === "ask");

  const { lookupHold, lookupRelease } = await import("../src/nuance/surface-split.js");
  const hold = lookupHold();
  check("the floor is held while the hub is asked, with a short reason, and the user talking does NOT end the hold", hold.type === "session.floor.hold" && typeof hold.reason === "string" && hold.reason.length <= 200 && hold.ends_on_speech === false);
  check("…and released afterwards, answered or declined", lookupRelease().type === "session.floor.release");

  const ui = strip(read("../src/renderer/persona-ui.js"));
  const askBranch = ui.slice(ui.indexOf('if (route === "ask") {'), ui.indexOf('if (route === "hers") {'));
  check("the window asks through askKnowledge() with the floor held BEFORE and released AFTER", /stage\?\.holdForLookup\(\);[\s\S]*bridge\.askKnowledge\?\.\(next\)[\s\S]*stage\?\.releaseLookup\(\);/.test(askBranch));
  check("an answer is shown and said through showAnswer(); the branch never calls submit() itself", /await showAnswer\(asked\)/.test(askBranch) && !/submit\(/.test(askBranch));
  check("a decline or an unreachable hub adds NOTHING: no offer, no escalation, no proposal - her answer stands", !/attachOffer|escalat|propose\(/.test(askBranch) && /nothing added; her answer stands/.test(askBranch));
  check("…unless she handed it off meanwhile, in which case D318 wins and it is routed", /waitForHandOff\(0\)[\s\S]{0,200}route = "route"/.test(askBranch));
  check("a hand-off ALREADY open wins before the lookup starts, and is not waited for", /if \(route === "ask" && stage && \(await stage\.waitForHandOff\(0\)\)\) route = "route";/.test(ui));
  check("every spoken turn writes one [spoken] line - kind, route, outcome, never words - so §2.5's number can be read from audit/app.log", (ui.match(/personaLog\?\.\(`\[spoken\] kind=\$\{info\.kind \?\? "\?"\} route=/g) ?? []).length === 3 && !/personaLog\?\.\([^)]*next/.test(ui));

  const stage = strip(read("../src/renderer/persona-stage.js"));
  check("the stage sends the hold and the release it is handed and writes no floor event of its own", /holdForLookup\(\) \{ if \(phase === "live"\) send\(lookupHold\(\)\); \}/.test(stage) && /releaseLookup\(\) \{ if \(phase === "live"\) send\(lookupRelease\(\)\); \}/.test(stage) && !/session\.floor\.hold/.test(stage));
  const agent = strip(read("../src/agent/agent.js"));
  const ask = agent.slice(agent.indexOf("async askKnowledge(text)"), agent.indexOf("async propose(text)"));
  check("agent.askKnowledge() reaches ask() on the hub client and nothing else: no propose, no broker, no escalation, no intake", /this\.cloud\.ask\(text, \{ probe \}\)/.test(ask) && !/propose|broker|escalat|intake/.test(ask));
  check("…gated as the typed path is: a provider with no ask() has no knowledge base", /typeof this\.cloud\?\.ask !== "function"/.test(ask));
  const main = strip(read("../src/main/main.js"));
  check("main.js exposes it as agent:ask, caught, and the preload names it askKnowledge", /ipcMain\.handle\("agent:ask"/.test(main) && /agent\.askKnowledge\(String\(text \?\? ""\)\)/.test(main) && /askKnowledge: \(text\) => ipcRenderer\.invoke\("agent:ask", text\)/.test(read("../src/main/preload.cjs")));
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
    check(`"${t}" -> the default action, no verb, hers`, k.kind === "action" && k.verb === undefined && routeOf(t) === "hers", `${k.kind}/${k.verb}/${routeOf(t)}`);
  }
  check("the decision reads the `verb` FIELD, not the why string: a kind of action with no verb is hers, with a verb is routed", spokenTurnRoute({ kind: "action" }) === "hers" && spokenTurnRoute({ kind: "action", verb: null }) === "hers" && spokenTurnRoute({ kind: "action", verb: "" }) === "hers" && spokenTurnRoute({ kind: "action", verb: "restart" }) === "route");
  check("a verb on any other kind changes nothing", spokenTurnRoute({ kind: "question", verb: "restart" }) === "ask" && spokenTurnRoute({ kind: "social", subkind: "greeting", verb: "restart" }) === "hers");
  const main = strip(read("../src/main/main.js"));
  check("agent:spoken hands the window the verb, null for the default", /verb: typeof k\.verb === "string" && k\.verb \? k\.verb : null/.test(main));
  const cls = strip(read("../src/router/classify.js"));
  check("classify() sets `verb` only on the ACTION_VERB match and not on the default", /return \{ kind: "action", verb: v\.trim\(\)/.test(cls) && /return \{ kind: "action", why: "no question marker/.test(cls));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
