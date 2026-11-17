// @ts-check
/**
 * The live persona's camera: when it is on, who can turn it on, and what gets written down.
 * (D324, the founder's, 2026-11-17; docs/handovers/2026-11-17-claude-code-handover-kb-access-camera-and-two-fixes.md §1.)
 *
 * ===============================================================================================
 * THE RULE, IN CHARLES'S WORDS, AND WHY IT IS A FILE
 * ===============================================================================================
 *
 * Charles, 2026-11-17: "Camera only comes on when user clicks talk face to face."
 *
 * That is the invariant underneath D319 and D323, stated so that it can be enforced: the camera is
 * on only as a direct consequence of the user clicking Talk face to face (or the camera button it
 * reveals). No session event, no timer, no message from the service, no reconnect and no config
 * default reached any other way may turn it on.
 *
 * It was already true - five inline conditions in main.js made it so - and nothing made it STAY
 * true. The microphone has `mic-policy.js`: pure, four numbered rules, a test that counts the
 * places the unmute command is written. The microphone got that because a third party receives
 * the stream and no consent card covers it. Every word of that applies to the camera, and more
 * so: the service runs an AGE CHECK on what it sees and can end the session on it, and whether
 * the picture is recorded is not documented anywhere (D319's open question, still open). So the
 * camera gets what the microphone has, in a file of its own: `mic-policy.js` and this file are
 * the same shape for the same reason, and neither reaches into the other.
 *
 * It imports nothing and reads no clock: `nowMs` arrives on the event. `test/camera-policy.test.mjs`
 * fails if either stops being true.
 *
 * ===============================================================================================
 * THE RULES
 * ===============================================================================================
 *
 *   1. OFF UNLESS THE USER ASKED. A session opens with the camera off unless the session was
 *      opened by the user's own Talk face to face gesture AND the hub allowed a camera AND config
 *      says on-summon (`cameraOnSummon`, D323's default) AND the window is visible. "Allowed" is
 *      the hub's permission; it is not a reason.
 *   2. ONLY THE USER TURNS IT ON. One place in this file writes the live state, and the test
 *      counts it. Two events reach it - the summoning click (`session.opened` with `gesture`) and
 *      the camera button (`user.on`) - and both are the user's. Not a session event, not a retry,
 *      not a reconnect, not the service asking. A reconnect after a dropped session does NOT
 *      restore the camera: that is the most likely way this rule gets broken by accident, and it
 *      has its own test.
 *   3. NO VISIBLE WINDOW, NO CAMERA, in both directions: refused on while the window is hidden
 *      (D293), and off the moment the window hides. Today the window hiding also ends the session;
 *      this rule holds ON ITS OWN, so it survives a change that lets a session outlive a hidden
 *      window.
 *   4. EVERY STRETCH OF PICTURE IS A LINE IN THE EGRESS RECORD when it starts and when it stops,
 *      with how long it ran (`videoSentMs`). The start line is written at the START, so a session
 *      that dies with the camera open has still said that a picture left. The record holds the
 *      fact, never a frame.
 *
 * WHAT THIS DOES NOT DO: it decides WHEN. Whether the local video track is actually stopped is the
 * renderer's job (`setCameraEnabled(false)` on the room), applied from what main hands it, and a
 * track still published while this file says "off" is a defect in the renderer, not a policy.
 *
 * CAMERA DEFAULTS ARE OFF-LIMITS WITHOUT CHARLES, exactly as the microphone's are (D303, D320,
 * D323, D324 are all his). Do not change rule 1 or 2 in either direction to make something else work.
 */

/** Three, and the test pins the set. `unavailable` is "no session, or no camera in it", not "off". */
export const CAMERA_STATES = Object.freeze(["unavailable", "off", "live"]);

/**
 * @typedef {{ state: "unavailable" | "off" | "live", liveSinceMs: number | null, videoSentMs: number }} Camera
 * @typedef {{ type: string, nowMs: number, gesture?: boolean, windowVisible?: boolean, allowed?: boolean, onSummon?: boolean, reason?: string }} CameraEvent
 * @typedef {{ camera: Camera, egress: Array<{ event: string, detail: object }>, refused?: string }} CameraStep
 */

/** @returns {Camera} */
export function initialCamera() {
  return { state: "unavailable", liveSinceMs: null, videoSentMs: 0 };
}

/**
 * THE ONE PLACE THE CAMERA GOES ON. Two branches below may call it; both are the user's gesture.
 * The on-line is written here too, so a live state and its line cannot come apart.
 * @param {Camera} cam
 * @param {number} nowMs
 * @returns {CameraStep}
 */
function turnOn(cam, nowMs) {
  return {
    camera: { ...cam, state: "live", liveSinceMs: nowMs },
    egress: [{ event: "persona.video.on", detail: {} }],
  };
}

/** Close a live stretch: the time it ran, never negative, added to the running total. */
function stop(cam, nowMs, reason) {
  const ran = Math.max(0, nowMs - (cam.liveSinceMs ?? nowMs));
  return {
    camera: { ...cam, liveSinceMs: null, videoSentMs: cam.videoSentMs + ran },
    line: { event: "persona.video.off", detail: { videoSentMs: ran, reason } },
  };
}

/**
 * One event in, the next state and what to write about it out. Never throws; an event it does
 * not know changes nothing, which is the conservative direction for a camera.
 *
 * `egress` lines go to `EgressAudit.persona()` with the session's reference added by the caller.
 * `refused` is a sentence for the developer log when the user asked for something the rules do
 * not allow. There are no commands: the camera is a local track, applied by the renderer from the
 * state main hands it; nothing is asked of the service.
 *
 * @param {Camera} cam
 * @param {CameraEvent} event
 * @returns {CameraStep}
 */
export function cameraStep(cam, event) {
  const nowMs = Number(event.nowMs) || 0;
  const same = { camera: cam, egress: [] };

  switch (event.type) {
    case "session.opened": {
      // A session that is already known is not opening: a second `session.opened` is a reconnect
      // in disguise, and a reconnect restores nothing (rule 2).
      if (cam.state !== "unavailable") return same;
      if (event.allowed !== true) return { camera: initialCamera(), egress: [] };
      const fresh = { state: /** @type {const} */ ("off"), liveSinceMs: null, videoSentMs: 0 };
      // Rule 1. D323 (the founder's): "Camera should default to on when starting face to face."
      // The click that SUMMONS her is the gesture; config says whether that click means the
      // camera too; and the window must be visible. Any of the four missing: off, with the button.
      if (event.onSummon === true && event.gesture === true && event.windowVisible === true) return turnOn(fresh, nowMs);
      return { camera: fresh, egress: [] };
    }

    case "user.on": {
      // Rule 2 - the camera button. The only other branch that can turn the camera on.
      if (cam.state === "unavailable") return { ...same, refused: "there is no live session with a camera to turn on" };
      if (cam.state === "live") return same;
      if (event.gesture !== true) return { ...same, refused: "the camera is turned on by the user's own click or key press, and this was not one" };
      if (event.windowVisible !== true) return { ...same, refused: "the camera is not turned on while the window is not visible (D293)" };
      return turnOn(cam, nowMs);
    }

    case "user.off":
    case "window.hidden": {
      // Rule 3 (window.hidden) and the button. A stretch that was running is closed and written.
      if (cam.state !== "live") return same;
      const s = stop(cam, nowMs, event.type === "user.off" ? "user" : "window-hidden");
      return { camera: { ...s.camera, state: "off" }, egress: [s.line] };
    }

    case "session.closed": {
      // The session is gone. If the camera was on, the stretch still ends and still gets its line.
      if (cam.state === "unavailable") return same;
      if (cam.state === "live") {
        const s = stop(cam, nowMs, event.reason ? `session-closed:${String(event.reason).slice(0, 60)}` : "session-closed");
        return { camera: { ...s.camera, state: "unavailable" }, egress: [s.line] };
      }
      return { camera: { ...cam, state: "unavailable" }, egress: [] };
    }

    default:
      // Including `session.reconnected`, `session.resumed`, `window.shown` and anything the
      // service sends: none of them is the user, so none of them changes the camera.
      return same;
  }
}

/**
 * The camera's two labels (D319). Words, not a colour (D275's rule for every label), and none of
 * our own vocabulary (D240, D246). The two FACTS in them are not negotiable copy: when it is on,
 * the user's picture leaves this PC; when it is off, it does not.
 * @param {boolean} on
 */
export function cameraWords(on) {
  return on
    ? { label: "Camera on", detail: "Matic can see you. Your camera's picture is being sent from this PC to the service that runs Matic's live face." }
    : { label: "Camera off", detail: "Matic cannot see you, and nothing from your camera is being sent anywhere." };
}
