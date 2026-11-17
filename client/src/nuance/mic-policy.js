// @ts-check
/**
 * The live persona's microphone: when it is on, who can turn it on, and what gets written down.
 * (2026-11-16; docs/handovers/2026-11-16-claude-code-handover-nuance-live-persona.md §5.4.)
 *
 * ===============================================================================================
 * WHY THIS IS A FILE OF ITS OWN, AND PURE
 * ===============================================================================================
 *
 * A live persona session streams the user's microphone to a third party for as long as it is
 * unmuted: the colleague in the background, the call they take, the password they read aloud
 * despite being told not to. None of that passes through `agent.js`'s `summary`, a consent card or
 * the egress record, because none of those was built for an open microphone. So the rule for when
 * the microphone is open is the one piece of v2 that must not be a side effect of how a session
 * object happens to be wired - it is decided HERE, by a function a headless test can drive through
 * every state, and the code that owns the WebRTC session applies what it is handed and holds no
 * policy of its own. `main/presence.js` is the same shape for the same reason.
 *
 * It imports nothing and reads no clock: `nowMs` arrives on the event. `test/persona-egress.test.mjs`
 * fails if either stops being true.
 *
 * ===============================================================================================
 * THE RULES
 * ===============================================================================================
 *
 *   1. OFF BY DEFAULT. Opening a session MUTES the microphone as its first command. The service's
 *      own default is not consulted and not trusted: a default that lives on someone else's server
 *      is a default that can change in a preview API without a line of this repo moving.
 *   2. ONLY THE USER TURNS IT ON. One event produces an unmute - `user.unmute` - and only with a
 *      gesture and a visible window. Not a session event, not a timer, not a message from the
 *      service asking for it. The unmute command is written once in this file and the test counts.
 *   3. HIDING THE WINDOW TURNS IT OFF, and showing it again does not turn it back on. D293 says
 *      nothing is spoken with no visible window; a microphone that listens behind a hidden window
 *      is the same promise broken from the other side.
 *   4. EVERY STRETCH OF AUDIO IS A LINE IN THE EGRESS RECORD when it starts and when it stops,
 *      with how long it ran. The start line is written at the START, so a session that dies with
 *      the microphone open has still said that audio left.
 *
 * WHAT THIS DOES NOT DO, said here so nobody reads more into it: a `session.input_audio.mute` is a
 * REQUEST to the service. Whether the local audio track is also stopped at the source is the
 * session code's job (it should be - a muted microphone that is still being published is a
 * setting, not a guarantee), and it is not built yet. This file says when; it cannot enforce how.
 *
 * MICROPHONE DEFAULTS ARE OFF-LIMITS WITHOUT CHARLES (handover §3.3). Do not change rule 1 or 2
 * in either direction to make something else work.
 */

/** Three, and the test pins the set. `unavailable` is "there is no session", not "muted". */
export const MIC_STATES = Object.freeze(["unavailable", "off", "live"]);

/**
 * @typedef {{ state: "unavailable" | "off" | "live", liveSinceMs: number | null, audioSentMs: number }} Mic
 * @typedef {{ type: string, nowMs: number, gesture?: boolean, windowVisible?: boolean, reason?: string }} MicEvent
 * @typedef {{ mic: Mic, commands: Array<{ type: string }>, egress: Array<{ event: string, detail: object }>, refused?: string }} MicStep
 */

/** The one place the unmute command is written. Two branches may return it; both are the user's. */
const unmute = () => ({ type: "session.input_audio.unmute" });

/** @returns {Mic} */
export function initialMic() {
  return { state: "unavailable", liveSinceMs: null, audioSentMs: 0 };
}

/** Close a live stretch: the time it ran, never negative, added to the running total. */
function stop(mic, nowMs, reason) {
  const ran = Math.max(0, nowMs - (mic.liveSinceMs ?? nowMs));
  const audioSentMs = mic.audioSentMs + ran;
  return {
    mic: { ...mic, liveSinceMs: null, audioSentMs },
    line: { event: "persona.audio.off", detail: { audioSentMs: ran, reason } },
  };
}

/**
 * One event in, the next state and what to do about it out. Never throws; an event it does not
 * know changes nothing, which is the conservative direction for a microphone.
 *
 * `commands` go to the service on the session's control channel, in order. `egress` lines go to
 * `EgressAudit.persona()` with the session's reference added by the caller. `refused` is a
 * sentence for the developer log when the user asked for something the rules do not allow.
 *
 * @param {Mic} mic
 * @param {MicEvent} event
 * @returns {MicStep}
 */
export function micStep(mic, event) {
  const nowMs = Number(event.nowMs) || 0;
  const same = { mic, commands: [], egress: [] };

  switch (event.type) {
    case "session.opened":
      // D320 (THE FOUNDER'S, 2026-11-17): "When a user clicks face to face they are saying they
      // want to talk. Start the face to face chats unmuted." The click that SUMMONS her is the
      // gesture, so a session may open with the microphone already on - when the caller says the
      // product is configured that way (`startLive`), and only with that gesture and a visible
      // window, exactly as for the button. The moment audio starts leaving is still written down.
      // This changes rule 1's default and nothing else: no event the user did not cause turns it on.
      if (event.startLive === true && event.gesture === true && event.windowVisible === true) {
        return {
          mic: { state: "live", liveSinceMs: nowMs, audioSentMs: 0 },
          commands: [unmute()],
          egress: [{ event: "persona.audio.on", detail: {} }],
        };
      }
      // Rule 1. A fresh session starts its own count; the mute goes first, before anything else
      // the session code sends.
      return {
        mic: { state: "off", liveSinceMs: null, audioSentMs: 0 },
        commands: [{ type: "session.input_audio.mute" }],
        egress: [],
      };

    case "user.unmute": {
      // Rule 2 - the only branch in this file that can turn the microphone on.
      if (mic.state === "unavailable") return { ...same, refused: "there is no live session to turn the microphone on for" };
      if (mic.state === "live") return same;
      if (event.gesture !== true) return { ...same, refused: "the microphone is turned on by the user's own click or key press, and this was not one" };
      if (event.windowVisible !== true) return { ...same, refused: "the microphone is not turned on while the window is not visible (D293)" };
      return {
        mic: { ...mic, state: "live", liveSinceMs: nowMs },
        commands: [unmute()],
        egress: [{ event: "persona.audio.on", detail: {} }],
      };
    }

    case "user.mute":
    case "window.hidden": {
      if (mic.state !== "live") return same;
      const s = stop(mic, nowMs, event.type === "user.mute" ? "user" : "window-hidden");
      return { mic: { ...s.mic, state: "off" }, commands: [{ type: "session.input_audio.mute" }], egress: [s.line] };
    }

    case "session.closed": {
      // The session is gone, so there is nobody to send a command to. If the microphone was on,
      // the stretch still ends and still gets its line.
      if (mic.state === "unavailable") return same;
      if (mic.state === "live") {
        const s = stop(mic, nowMs, event.reason ? `session-closed:${event.reason}` : "session-closed");
        return { mic: { ...s.mic, state: "unavailable" }, commands: [], egress: [s.line] };
      }
      return { mic: { ...mic, state: "unavailable" }, commands: [], egress: [] };
    }

    default:
      return same;
  }
}

/**
 * What the panel says about the microphone. Words, not a colour (D275's rule for every label),
 * and none of our own vocabulary (D240, D246).
 *
 * `null` for `unavailable`: with no live session there is no microphone control to describe, and
 * a "Microphone off" on a panel that has no microphone feature in play is a row about nothing.
 *
 * THE COPY IS A PROPOSAL. Nobody has seen it on a screen, and where the control sits is a design
 * question that has not been asked. The two FACTS in it are not negotiable copy: when it is on,
 * the user's voice leaves this PC; when it is off, it does not.
 *
 * @param {"unavailable" | "off" | "live"} state
 * @returns {{ label: string, detail: string } | null}
 */
/**
 * The camera's two labels (D319). The camera has no policy file of its own because its rule is the
 * microphone's with nothing added: off when a session opens, on only by the user's own click with
 * the window visible, off when the window hides or the session ends. main.js applies it.
 * @param {boolean} on
 */
export function cameraWords(on) {
  return on
    ? { label: "Camera on", detail: "Matic can see you. Your camera's picture is being sent from this PC to the service that runs Matic's live face." }
    : { label: "Camera off", detail: "Matic cannot see you, and nothing from your camera is being sent anywhere." };
}

export function micWords(state) {
  if (state === "live") {
    return {
      label: "Microphone on",
      detail: "Matic can hear you. What your microphone picks up is being sent from this PC to the service that runs Matic's live face.",
    };
  }
  if (state === "off") {
    return {
      label: "Microphone off",
      detail: "Matic cannot hear you, and nothing from your microphone is being sent anywhere. Type instead, or turn it on to talk.",
    };
  }
  return null;
}
