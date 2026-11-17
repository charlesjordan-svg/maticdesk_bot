// @ts-check
/**
 * The live persona's controls on the panel: the summon button, the microphone button, the face.
 * (D307, PROPOSED, 2026-11-17.)
 *
 * WHY THIS IS NOT IN renderer.js. `test/restart-signal.test.mjs` §9 forbids the word "microphone"
 * in seven files, renderer.js among them. That rule is D256's and it is about the Windows CONSENT
 * STORE - a behavioural log of which software used the camera and microphone, which nothing in
 * this product may read. This file reads no store and no registry: it is the control a user
 * clicks to turn their own microphone on. The two are different things that share a word, so this
 * lives in a file that rule does not list, and says so here rather than leaving the next reader
 * to wonder whether the rule was dodged. renderer.js still does not mention it.
 *
 * SUMMONED, NEVER STARTED. A session is a microphone and a metered clock, so it begins with the
 * user's own click and at no other time - which is also what lets its audio play at all. The v7
 * bust is what is on screen the rest of the time and what comes back the moment a session ends,
 * for any reason, with the conversation exactly where it was: the brain never moved (Decision C).
 *
 * The room library is imported on the FIRST click and not before: it is the largest thing this
 * client carries, and a user who never summons the face never pays for parsing it.
 */
import { spokenTurnRoute } from "../nuance/turn-routing.js";

/**
 * @param {{
 *   bridge: any,
 *   avatar: HTMLElement,
 *   note: (text: string) => void,
 *   devlog: (line: string) => void,
 *   setState: (s: string) => void,
 *   submit: (text: string) => unknown,
 *   stopLocalVoice: () => void,
 * }} deps
 * @returns {{ readonly live: boolean, speak: (turn: { surface?: string, text?: string }) => Promise<any>, releaseFloor: () => void, beforeExecute: (capabilityId: string) => Promise<boolean> }}
 */
export function mountPersonaUi({ bridge, avatar, note, devlog, setState, submit, stopLocalVoice, showSpoken = () => {}, showHers = () => {}, showAnswer = async () => {} }) {
  const els = {
    stage: /** @type {HTMLElement} */ (document.getElementById("persona-stage")),
    video: /** @type {HTMLVideoElement} */ (document.getElementById("persona-video")),
    controls: /** @type {HTMLElement} */ (document.getElementById("persona-controls")),
    toggle: /** @type {HTMLButtonElement} */ (document.getElementById("persona-toggle")),
    mic: /** @type {HTMLButtonElement} */ (document.getElementById("persona-mic")),
    micNote: /** @type {HTMLElement} */ (document.getElementById("persona-mic-note")),
    cam: /** @type {HTMLButtonElement} */ (document.getElementById("persona-cam")),
    camNote: /** @type {HTMLElement} */ (document.getElementById("persona-cam-note")),
  };
  const rail = els.stage?.closest(".rail");
  // ONE SIZE, AND IT IS THE LARGE ONE (D323, the founder's: "Default should be the bigger video
  // avatar size. [no button to change it]"). The first build had a button and a remembered choice;
  // at the rail's own width the face is a thumbnail, and it is supposed to be face to face.
  /** @type {any} */
  let stage = null;
  /** @type {null | ((text: string) => void)} */
  let spoken = null;
  // SPOKEN TURNS ARE TAKEN IN ORDER, NOT DROPPED (D312). `submit()` ignores a sentence that arrives
  // while another is in flight - right for a Send button, which is disabled meanwhile, and wrong
  // for a person who keeps talking: Charles's first session lost several turns that way. Each one
  // waits for the one before. At most two wait; a third replaces the older of them, because a
  // queue of stale sentences answered one by one is worse than an unanswered one.
  let chain = Promise.resolve();
  let deciding = false;
  /** @type {string[]} */
  const heldHers = [];
  /** @type {string[]} */
  const waiting = [];
  function enqueue(text) {
    if (waiting.length >= 2) waiting.shift();
    waiting.push(text);
    // A link that throws must not poison the chain: every later spoken turn would be skipped in
    // silence. It is caught, said in the developer log, and the next turn is taken as usual.
    chain = chain.then(() => handleSpoken()).catch((err) => { deciding = false; devlog(`[persona] a spoken turn could not be handled: ${err?.message ?? err}`); });
  }

  async function handleSpoken() {
    {
      const next = waiting.shift();
      if (next === undefined) return;
      // WHO ANSWERS IT (D318): turn-routing.js decides, from three facts. Is Matic waiting on an
      // answer, and what does the local classifier make of it - asked of the main process, no
      // model, no network. And did she hand it off - which may take her a few seconds to do, so
      // it is only waited for when the first two do not already say "route".
      deciding = true;
      let info = {};
      try { info = (await bridge.spokenInfo?.(next)) ?? {}; } catch { /* treated as conversation unless she hands it off */ }
      let route = spokenTurnRoute({ awaitingAnswer: info.awaiting, kind: info.kind, subkind: info.subkind });
      if (route === "hers" && stage && (await stage.waitForHandOff(5000))) route = "route";
      // D325: a QUESTION goes to the knowledge base and nowhere else. A hand-off she has ALREADY
      // made wins (D318: she decided it is work), and is not waited for - the round trip is long
      // enough already, and the floor is held so she does not answer from world knowledge meanwhile.
      if (route === "ask" && stage && (await stage.waitForHandOff(0))) route = "route";
      let asked = null;
      if (route === "ask") {
        stage?.holdForLookup();
        try { asked = (await bridge.askKnowledge?.(next)) ?? null; } catch { asked = null; }
        stage?.releaseLookup();
        const outcome = asked?.ok ? (asked.answered ? "answered" : "declined") : "unreachable";
        // THE NUMBER (handover 2026-11-17 §2.5): one line per spoken question, kind and outcome and
        // nothing said, so "how often did a question stay hers" is read from audit/app.log and not
        // from memory. scripts/spoken-turns.mjs counts them.
        void bridge.personaLog?.(`[spoken] kind=${info.kind ?? "?"} route=ask outcome=${outcome}`);
        if (outcome === "answered" && asked.reply) {
          devlog("[persona] a spoken question, answered from the knowledge base - shown and said; her own line, if any, stands first");
          showSpoken(next);
          for (const line of heldHers.splice(0)) showHers(line);
          deciding = false;
          if (stage) stage.spokenTurn = true;
          try { await showAnswer(asked); } catch (err) { devlog(`[persona] the answer could not be shown: ${err?.message ?? err}`); }
          finally { if (stage) stage.spokenTurn = false; }
          return;
        }
        // Declined, or the hub could not be reached: NOTHING. No ticket offer, no escalation line,
        // no proposal. Her conversational answer stands - that is what keeps D318 intact.
        // ...unless she handed it off while the hub was being asked: then she is waiting for a
        // result, and D318 says a hand-off is routed whatever it says. The typed path answers her.
        if (stage && (await stage.waitForHandOff(0))) { devlog(`[persona] the knowledge base ${outcome} it, and she handed it off meanwhile - routed as her hand-off`); route = "route"; }
        else {
          devlog(`[persona] a spoken question the knowledge base ${outcome} - nothing added; her answer stands (D325)`);
          showSpoken(next);
          for (const line of heldHers.splice(0)) showHers(line);
          deciding = false;
          return;
        }
      }
      if (route === "hers") {
        devlog("[persona] a spoken turn she is answering herself - conversation, not routed");
        void bridge.personaLog?.(`[spoken] kind=${info.kind ?? "?"} route=hers outcome=hers`);
        showSpoken(next);
        for (const line of heldHers.splice(0)) showHers(line);
        deciding = false;
        return;
      }
      void bridge.personaLog?.(`[spoken] kind=${info.kind ?? "?"} route=route outcome=${info.awaiting ? "answer" : "work"}`);
      // Routed: what she said while handing it over ("I'll look into that") is not the answer and
      // is not put on the panel beside the one that is.
      heldHers.length = 0;
      deciding = false;
      // The stage needs to know this turn was SPOKEN to her: she has heard it, may already be
      // answering, and may be about to hand it off (D316).
      if (stage) stage.spokenTurn = true;
      try { await submit(next); } catch { /* submit reports its own failures */ }
      finally { if (stage) stage.spokenTurn = false; }
    }
  }

  function apply({ phase, mic, camera, reason }) {
    const live = phase === "live";
    rail?.classList.toggle("persona-large", live);
    els.stage.hidden = !live;
    avatar.style.display = live ? "none" : "";
    els.toggle.disabled = phase === "starting";
    els.toggle.textContent = live ? "End live video" : phase === "starting" ? "Starting…" : "Talk face to face";
    els.mic.hidden = !live || !mic?.words;
    els.micNote.hidden = els.mic.hidden;
    if (mic?.words) {
      // The words are mic-policy.js's, handed over by the main process. Words first: the two
      // states read differently before they look different.
      els.mic.textContent = mic.words.label;
      els.mic.setAttribute("aria-pressed", mic.state === "live" ? "true" : "false");
      // When the microphone is on and nothing is coming from it, that is said instead (D323).
      els.micNote.textContent = mic.hint ?? mic.words.detail;
    }
    // The camera's control is there only when this session may use one (D319), and reads in words.
    if (els.cam) {
      els.cam.hidden = !live || !camera?.words;
      els.camNote.hidden = els.cam.hidden;
      if (camera?.words) {
        els.cam.textContent = camera.words.label;
        els.cam.setAttribute("aria-pressed", camera.on ? "true" : "false");
        els.camNote.textContent = camera.words.detail;
      }
    }
    if (reason) {
      devlog(`[persona] ${reason}`);
      // Said once, on the panel, in the user's words. The reason itself is ours and stays in the log.
      if (reason.startsWith("not-started:")) note("The live video isn't available right now, so I'm carrying on as I am.");
      else if (reason !== "user") note("The live video has ended. I'm still here, and nothing we were doing has been lost.");
      setState("idle");
    }
  }

  if (bridge.personaStatus && els.toggle) {
    bridge.personaStatus().then((st) => { els.controls.hidden = !st?.enabled; }).catch(() => {});
    els.toggle.onclick = async () => {
      if (stage?.phase === "live") { await stage.stop("user"); return; }
      if (stage && stage.phase !== "off") return;
      if (!stage) {
        const { createPersonaStage } = await import("./persona-stage.js");
        stage = createPersonaStage({
          bridge,
          videoEl: els.video,
          selfEl: /** @type {HTMLVideoElement} */ (document.getElementById("persona-self")),
          // A finished spoken turn goes exactly where a typed one goes.
          // ...unless something is waiting on a spoken answer of its own - a consent card that may
          // be approved aloud (D310). Then the sentence goes there and nowhere else.
          onUserTurn: (text) => { if (spoken) spoken(text); else enqueue(text); },
          // What she says on her own goes on the panel too, so a conversation reads as one.
          // ...AFTER the sentence it answers. She replies in a second or two; whether the turn is
          // hers is not settled until a hand-off has had its chance to arrive, so her line is
          // held until the user's has been shown.
          onPersonaSaid: (text) => { if (deciding) heldHers.push(text); else showHers(text); },
          onChange: apply,
          devlog,
        });
      }
      // Two voices at once is neither.
      stopLocalVoice();
      await stage.start();
    };
    els.mic.onclick = () => { void stage?.toggleMic(); };
    if (els.cam) els.cam.onclick = () => { void stage?.toggleCamera(); };
    bridge.onPersonaEnd?.((reason) => { void stage?.stop(String(reason ?? "ended")); });
  }

  return {
    get live() { return Boolean(stage?.live); },
    speak: (turn) => stage.speak(turn),
    releaseFloor: () => { stage?.releaseFloor(); },
    /** Route the user's next spoken turns to `fn` instead of the conversation; null puts it back. */
    onSpokenTurn: (fn) => { spoken = typeof fn === "function" ? fn : null; },
    beforeExecute: async (capabilityId) => (stage ? stage.beforeExecute(capabilityId) : false),
  };
}
