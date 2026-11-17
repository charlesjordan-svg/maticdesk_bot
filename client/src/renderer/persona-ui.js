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
export function mountPersonaUi({ bridge, avatar, note, devlog, setState, submit, stopLocalVoice }) {
  const els = {
    stage: /** @type {HTMLElement} */ (document.getElementById("persona-stage")),
    video: /** @type {HTMLVideoElement} */ (document.getElementById("persona-video")),
    controls: /** @type {HTMLElement} */ (document.getElementById("persona-controls")),
    toggle: /** @type {HTMLButtonElement} */ (document.getElementById("persona-toggle")),
    mic: /** @type {HTMLButtonElement} */ (document.getElementById("persona-mic")),
    micNote: /** @type {HTMLElement} */ (document.getElementById("persona-mic-note")),
    size: /** @type {HTMLButtonElement} */ (document.getElementById("persona-size")),
  };
  const rail = els.stage?.closest(".rail");
  // The size is the user's and is remembered, like the theme (D243). Asked for by Charles on the
  // first live run: at the rail's own width the face is a thumbnail.
  let large = false;
  try { large = localStorage.getItem("matic.persona.large") === "1"; } catch { /* no storage: small */ }
  let isLive = false;
  function applySize() {
    rail?.classList.toggle("persona-large", isLive && large);
    if (els.size) {
      els.size.hidden = !isLive;
      els.size.textContent = large ? "Make the video smaller" : "Make the video bigger";
      els.size.setAttribute("aria-pressed", large ? "true" : "false");
    }
  }
  function toggleSize() {
    large = !large;
    try { localStorage.setItem("matic.persona.large", large ? "1" : "0"); } catch { /* not remembered */ }
    applySize();
  }
  /** @type {any} */
  let stage = null;

  function apply({ phase, mic, reason }) {
    const live = phase === "live";
    isLive = live;
    applySize();
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
      els.micNote.textContent = mic.words.detail;
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
          // A finished spoken turn goes exactly where a typed one goes.
          onUserTurn: (text) => { void submit(text); },
          onChange: apply,
          devlog,
        });
      }
      // Two voices at once is neither.
      stopLocalVoice();
      await stage.start();
    };
    els.mic.onclick = () => { void stage?.toggleMic(); };
    // The button, and the face itself: both make it bigger or smaller.
    if (els.size) els.size.onclick = toggleSize;
    els.stage.onclick = toggleSize;
    bridge.onPersonaEnd?.((reason) => { void stage?.stop(String(reason ?? "ended")); });
  }

  return {
    get live() { return Boolean(stage?.live); },
    speak: (turn) => stage.speak(turn),
    releaseFloor: () => { stage?.releaseFloor(); },
    beforeExecute: async (capabilityId) => (stage ? stage.beforeExecute(capabilityId) : false),
  };
}
