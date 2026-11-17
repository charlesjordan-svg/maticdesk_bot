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
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spokenTurnRoute } from "../src/nuance/turn-routing.js";
import { classify } from "../src/router/classify.js";
import { cameraWords } from "../src/nuance/mic-policy.js";
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
const routeOf = (text, extra = {}) => { const k = classify(text); return spokenTurnRoute({ kind: k.kind, subkind: k.subkind, ...extra }); };

// ==============================================================================================
console.log("=== 1. conversation is hers ===");
{
  for (const t of [
    "It's a beautiful day. How are you doing?",            // the sentence that got a ticket offer
    "Hello, can you hear me now?",
    "I'm good.",
    "what's the capital of France",
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
  check("the controls decide through spokenTurnRoute() and nothing else", /spokenTurnRoute\(\{ awaitingAnswer: info\.awaiting, kind: info\.kind, subkind: info\.subkind \}\)/.test(ui));
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
console.log("\n=== 4. the camera, on the microphone's terms (D319) ===");
{
  const on = cameraWords(true), off = cameraWords(false);
  check("two labels that differ in words", on.label === "Camera on" && off.label === "Camera off");
  check("on says the picture LEAVES this PC; off says nothing is sent", /being sent from this PC/.test(on.detail) && /nothing from your camera is being sent/.test(off.detail));
  check("none of our vocabulary at the user", !/hub|nuance|livekit|webrtc|track|egress/i.test(`${on.label} ${on.detail} ${off.label} ${off.detail}`));
  check("the two camera events are in the record's vocabulary", ["persona.video.on", "persona.video.off"].every((e) => EGRESS_EVENTS.includes(e)));

  const dir = mkdtempSync(join(tmpdir(), "matic-camera-"));
  const egress = new EgressAudit({ path: join(dir, "egress.jsonl") });
  egress.persona("persona.video.on", { sessionRef: "s1", frame: "PICTURE-CANARY", image: "PICTURE-CANARY" });
  egress.persona("persona.video.off", { sessionRef: "s1", reason: "user" });
  const raw = readFileSync(join(dir, "egress.jsonl"), "utf8");
  check("the record says the camera went on and off - and holds no picture", raw.trim().split("\n").length === 2 && !raw.includes("CANARY"));

  const main = strip(read("../src/main/main.js"));
  const cam = main.slice(main.indexOf('ipcMain.handle("persona:camera"'), main.indexOf('ipcMain.handle("agent:spoken"'));
  check("main turns it on only for a session the hub allowed a camera for", /!liveSession \|\| !liveSession\.cameraAllowed/.test(cam));
  check("…only with a visible window (D293)", /event === "user\.on"[\s\S]{0,80}if \(!windowVisible\(\)\) return/.test(cam));
  check("…and writes the line at the moment the picture starts leaving", /liveSession\.cameraOn = true; egress\?\.persona\("persona\.video\.on"/.test(cam));
  check("a session starts with the camera OFF, whatever the hub allowed", /cameraOn: false \}/.test(main) && /camera: liveSession\.cameraAllowed \? \{ on: false/.test(main));
  check("a session that ends with the camera on closes that in the record too", /if \(p\.cameraOn\) egress\?\.persona\("persona\.video\.off"/.test(main));
  check("the launcher is where the camera is allowed - the repository's config does not turn it on", !/"camera"\s*:\s*true/.test(read("../config.json")));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
