/**
 * The live persona's camera: on only as a direct consequence of the user's click (D324, the
 * founder's, 2026-11-17: "Camera only comes on when user clicks talk face to face").
 *
 * Run: node test/camera-policy.test.mjs        (from client/; part of `npm test`)
 *
 * The microphone had mic-policy.js, four numbered rules and a test that COUNTS the places the
 * unmute command is written. The camera had five inline conditions in main.js and a config boolean
 * any later pass could read from anywhere - and the service runs an age check on what it sees and
 * can end a session on it, and whether the picture is recorded is not documented. So the camera
 * gets what the microphone has, and this file is the thing that keeps it.
 *
 * Pinned here:
 *   1. OFF UNLESS THE USER ASKED. A session opens with the camera off unless it was opened by the
 *      user's own gesture, the hub allowed a camera, config says on-summon and the window is
 *      visible. "Allowed" is the hub's permission, not a reason.
 *   2. ONLY THE USER TURNS IT ON. One place in the source sets the state to live, and this test
 *      counts it. Not a session event, not a reconnect, not the service asking, not a timer.
 *   3. NO VISIBLE WINDOW, NO CAMERA, both ways: refused on, and off when the window hides - on its
 *      own, without relying on the session ending.
 *   4. EVERY STRETCH OF PICTURE IS A LINE IN THE EGRESS RECORD, at the start and at the stop, with
 *      how long it ran.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initialCamera, cameraStep, cameraWords, CAMERA_STATES } from "../src/nuance/camera-policy.js";
import { PERSONA_EGRESS_FIELDS, EGRESS_EVENTS } from "../src/ticket/egress-audit.js";

const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}
const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const read = (rel) => readFileSync(join(HERE, rel), "utf8");
const events = (r) => r.egress.map((l) => l.event).join();

// ==============================================================================================
console.log("=== 1. off unless the user asked (rule 1) ===");
{
  check("three states, and the test pins the set", CAMERA_STATES.join() === "unavailable,off,live");
  check("before any session there is no camera to speak of", initialCamera().state === "unavailable" && initialCamera().videoSentMs === 0);

  const summoned = cameraStep(initialCamera(), { type: "session.opened", allowed: true, onSummon: true, gesture: true, windowVisible: true, nowMs: 1000 });
  check("summoned by the user's click, allowed, on-summon, window visible: it opens LIVE and the line is written at that moment", summoned.camera.state === "live" && summoned.camera.liveSinceMs === 1000 && events(summoned) === "persona.video.on");

  const notAllowed = cameraStep(initialCamera(), { type: "session.opened", allowed: false, onSummon: true, gesture: true, windowVisible: true, nowMs: 1000 });
  check("the hub allowed no camera: unavailable, no line - there is no camera in this session", notAllowed.camera.state === "unavailable" && notAllowed.egress.length === 0);
  const noGesture = cameraStep(initialCamera(), { type: "session.opened", allowed: true, onSummon: true, gesture: false, windowVisible: true, nowMs: 1000 });
  check("allowed is not a reason: a session the user did not summon opens with the camera OFF", noGesture.camera.state === "off" && noGesture.egress.length === 0);
  const notOnSummon = cameraStep(initialCamera(), { type: "session.opened", allowed: true, onSummon: false, gesture: true, windowVisible: true, nowMs: 1000 });
  check("config says not on summon: off, with the button to turn it on", notOnSummon.camera.state === "off" && notOnSummon.egress.length === 0);
  const hidden = cameraStep(initialCamera(), { type: "session.opened", allowed: true, onSummon: true, gesture: true, windowVisible: false, nowMs: 1000 });
  check("window not visible: off, even when summoned and allowed", hidden.camera.state === "off" && hidden.egress.length === 0);
  const stringTrue = cameraStep(initialCamera(), { type: "session.opened", allowed: true, onSummon: true, gesture: /** @type {any} */ ("true"), windowVisible: true, nowMs: 1000 });
  check("a string 'true' is not a gesture", stringTrue.camera.state === "off");
}

// ==============================================================================================
console.log("\n=== 2. only the user turns it on (rule 2) ===");
{
  const off = cameraStep(initialCamera(), { type: "session.opened", allowed: true, onSummon: false, gesture: true, windowVisible: true, nowMs: 1000 }).camera;
  const on = cameraStep(off, { type: "user.on", gesture: true, windowVisible: true, nowMs: 5000 });
  check("the user's own click with the window visible turns it on, and the line is written", on.camera.state === "live" && on.camera.liveSinceMs === 5000 && events(on) === "persona.video.on");
  const noGesture = cameraStep(off, { type: "user.on", gesture: false, windowVisible: true, nowMs: 5000 });
  check("without a gesture it is refused, with a sentence for the developer log", noGesture.camera.state === "off" && typeof noGesture.refused === "string" && noGesture.egress.length === 0);
  const noSession = cameraStep(initialCamera(), { type: "user.on", gesture: true, windowVisible: true, nowMs: 5000 });
  check("no session (or no camera in it): there is nothing to turn on", noSession.camera.state === "unavailable" && typeof noSession.refused === "string");
  const again = cameraStep(on.camera, { type: "user.on", gesture: true, windowVisible: true, nowMs: 6000 });
  check("already on: nothing changes and no second line", again.camera.state === "live" && again.camera.liveSinceMs === 5000 && again.egress.length === 0);

  // Every event that is NOT the user's, from every state: none may turn the camera on. A reconnect
  // after a dropped session is the most likely way this breaks by accident, so it is named.
  const starts = { unavailable: initialCamera(), off, live: on.camera };
  const others = ["session.opened", "session.reconnected", "session.resumed", "session.closed", "user.off", "window.hidden", "window.shown", "service.video.on", "service.camera.request", "timer", "response.done", "anything.else"];
  const leaked = [];
  for (const [name, start] of Object.entries(starts)) {
    for (const type of others) {
      // `session.opened` from an existing state is a reconnect in disguise: it carries every flag and still may not turn it on.
      const r = cameraStep(start, { type, nowMs: 9000, gesture: true, windowVisible: true, allowed: true, onSummon: true, ...(name === "unavailable" ? { gesture: false } : {}) });
      if (start.state !== "live" && r.camera.state === "live") leaked.push(`${name}+${type}`);
      if (r.egress.some((l) => l.event === "persona.video.on")) leaked.push(`${name}+${type}:line`);
    }
  }
  check("no event but the user's turns it on, from any state - a reconnect does not restore it", leaked.length === 0, leaked.join(" "));
  check("a reconnect while OFF stays off, and while LIVE does not write a second on-line", cameraStep(off, { type: "session.reconnected", nowMs: 9000 }).camera.state === "off" && cameraStep(on.camera, { type: "session.reconnected", nowMs: 9000 }).egress.length === 0);

  // Structural: the live state is written in exactly one place in the source, and main.js does
  // not set the camera on itself anywhere.
  const code = strip(read("../src/nuance/camera-policy.js"));
  check("the live state is written exactly once in camera-policy.js's code", (code.match(/state: "live"/g) ?? []).length === 1, String((code.match(/state: "live"/g) ?? []).length));
  check("camera-policy.js is pure: it imports nothing and reads no clock", !/^\s*import\s/m.test(code) && !/require\(/.test(code) && !/Date\.now|performance\.now/.test(code));
  const main = strip(read("../src/main/main.js"));
  check("main.js never sets the camera on itself: no `cameraOn = true`, every change goes through cameraStep()", !/cameraOn\s*=\s*true/.test(main) && /cameraStep\(/.test(main));
  check("…and config's name says the rule, not the mechanism: cameraOnSummon, and startWithCamera is gone", /cameraOnSummon/.test(main) && !/startWithCamera/.test(main) && /cameraOnSummon/.test(read("../config.json")) && !/startWithCamera/.test(read("../config.json")));
}

// ==============================================================================================
console.log("\n=== 3. no visible window, no camera (rule 3) ===");
{
  const off = cameraStep(initialCamera(), { type: "session.opened", allowed: true, onSummon: false, gesture: true, windowVisible: true, nowMs: 1000 }).camera;
  const hidden = cameraStep(off, { type: "user.on", gesture: true, windowVisible: false, nowMs: 5000 });
  check("refused on while the window is not visible (D293), with the reason", hidden.camera.state === "off" && /not visible/.test(hidden.refused ?? ""));
  const live = cameraStep(off, { type: "user.on", gesture: true, windowVisible: true, nowMs: 5000 }).camera;
  const hid = cameraStep(live, { type: "window.hidden", nowMs: 9000 });
  check("hiding the window turns it OFF on its own - not by relying on the session ending - and closes the stretch", hid.camera.state === "off" && events(hid) === "persona.video.off" && hid.egress[0].detail.reason === "window-hidden" && hid.egress[0].detail.videoSentMs === 4000);
  check("showing the window again does NOT turn it back on - the user does", cameraStep(hid.camera, { type: "window.shown", nowMs: 9500 }).camera.state === "off");
  const main = strip(read("../src/main/main.js"));
  check("main.js sends window.hidden to the camera policy when the window hides, BEFORE the session is ended for it", /personaCameraEvent\("window\.hidden"\)[\s\S]{0,200}personaOver\("window-hidden"\)/.test(main));
}

// ==============================================================================================
console.log("\n=== 4. every stretch of picture is a line in the record, with how long it ran (rule 4) ===");
{
  let c = cameraStep(initialCamera(), { type: "session.opened", allowed: true, onSummon: true, gesture: true, windowVisible: true, nowMs: 1000 }).camera;
  const off = cameraStep(c, { type: "user.off", nowMs: 4000 });
  check("the user turning it off closes the stretch: an off-line with the time it ran and why", events(off) === "persona.video.off" && off.egress[0].detail.videoSentMs === 3000 && off.egress[0].detail.reason === "user" && off.camera.state === "off" && off.camera.videoSentMs === 3000);
  c = cameraStep(off.camera, { type: "user.on", gesture: true, windowVisible: true, nowMs: 10_000 }).camera;
  const closed = cameraStep(c, { type: "session.closed", reason: "user", nowMs: 12_000 });
  check("a session that ends with the camera on closes the stretch too, and the total is the sum of both", closed.camera.state === "unavailable" && closed.egress[0].detail.videoSentMs === 2000 && closed.egress[0].detail.reason === "session-closed:user" && closed.camera.videoSentMs === 5000);
  const closedOff = cameraStep(off.camera, { type: "session.closed", nowMs: 12_000 });
  check("a session that ends with the camera off writes nothing more", closedOff.camera.state === "unavailable" && closedOff.egress.length === 0);
  check("time never runs backwards: a clock that went back closes the stretch at zero", cameraStep(c, { type: "user.off", nowMs: 1 }).egress[0].detail.videoSentMs === 0);
  check("the two camera events and the duration field are in the record's vocabulary", ["persona.video.on", "persona.video.off"].every((e) => EGRESS_EVENTS.includes(e)) && PERSONA_EGRESS_FIELDS.includes("videoSentMs"));
  const main = strip(read("../src/main/main.js"));
  check("main.js writes every camera line the policy hands it, with the session's reference, and puts the video total on the closing line", /for \(const line of step\.egress\) egress\?\.persona\(line\.event, \{ sessionRef: liveSession\.ref, \.\.\.line\.detail \}\)/.test(main) && /videoSentMs: /.test(main.slice(main.indexOf("function personaOver"), main.indexOf("function personaOver") + 1500)));
}

// ==============================================================================================
console.log("\n=== 5. the words, and the wiring ===");
{
  const on = cameraWords(true), off = cameraWords(false);
  check("two labels that differ in words", on.label === "Camera on" && off.label === "Camera off");
  check("on says the picture LEAVES this PC; off says nothing is sent", /being sent from this PC/.test(on.detail) && /nothing from your camera is being sent/.test(off.detail));
  check("none of our vocabulary at the user", !/hub|nuance|livekit|webrtc|track|egress/i.test(`${on.label} ${on.detail} ${off.label} ${off.detail}`));
  const mic = strip(read("../src/nuance/mic-policy.js"));
  check("the camera's words moved out of mic-policy.js: the camera has a policy file of its own now", !/cameraWords/.test(mic));
  const main = strip(read("../src/main/main.js"));
  const start = main.slice(main.indexOf('ipcMain.handle("persona:start"'), main.indexOf('ipcMain.handle("persona:mic"'));
  check("at session open main asks the policy with the hub's allowance, config's on-summon, the summoning click as the gesture, and the window read HERE", /personaCameraEvent\("session\.opened", \{ allowed: opened\.camera === true, onSummon: personaConfig\.cameraOnSummon, gesture: true \}\)/.test(start));
  check("…and what the window is told is what the policy decided", /camera: liveSession\.cameraAllowed \? \{ on: liveSession\.camera\.state === "live", words: cameraWords\(liveSession\.camera\.state === "live"\) \} : null/.test(start));
  const cam = main.slice(main.indexOf('ipcMain.handle("persona:camera"'), main.indexOf('ipcMain.handle("agent:spoken"'));
  check("the camera button's channel takes user.on and user.off only, as the user's gesture, and the policy decides", /event !== "user\.on" && event !== "user\.off"/.test(cam) && /personaCameraEvent\(event, \{ gesture: true \}\)/.test(cam));
  check("the launcher is where the camera is allowed - the repository's config does not turn it on", !/"camera"\s*:\s*true/.test(read("../config.json")));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
