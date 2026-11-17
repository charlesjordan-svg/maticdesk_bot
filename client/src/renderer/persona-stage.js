// @ts-check
/**
 * The live persona, in the renderer: the room, the face, the microphone, the event channel.
 * (D307, PROPOSED, 2026-11-17.)
 *
 * THIS FILE HOLDS NO POLICY. It is glue, and each decision it applies is made somewhere a headless
 * test can reach:
 *
 *   whether a session may start, and with what      main process  (`persona:start`, the hub's mint)
 *   when the microphone is on                        src/nuance/mic-policy.js, applied in MAIN,
 *                                                    because only main knows the window is visible
 *   what the persona may be told to say              src/nuance/surface-split.js `personaTurn()` -
 *                                                    the ONE builder of a reply event
 *   what a consent card and a network change do      the same file
 *
 * So `speak()` below sends exactly what `personaTurn()` returns and builds nothing of its own, and
 * `toggleMic()` sends exactly the commands main hands back. If a reply event is ever assembled in
 * this file, `test/surface-split.test.mjs` §6 fails.
 *
 * THE LOCAL MICROPHONE TRACK IS MUTED AT THE SOURCE WHENEVER THE POLICY SAYS OFF. The service's
 * `session.input_audio.mute` is a request to someone else's server; `setMicrophoneEnabled(false)`
 * is this machine not sending the audio. Both are done, in that order of trust.
 *
 * NOTHING SAID IS LOGGED. The developer log gets event TYPES and counts. The user's finished turn
 * is handed to the same `submit()` a typed sentence goes to, so it is shown in the transcript and
 * routed like one - and that is the only place its words go.
 *
 * It cannot be tested headless - it needs a window, a microphone and a room - which is why it is
 * kept this thin. `client/docs/PERSONA-RENDERER-CHECK.md` is its click-through.
 */
import { Room, RoomEvent } from "./vendor/livekit-client.esm.mjs";
import { personaTurn, consentRelease, beforeExecute, isRepeatPointer, asHandOffResult } from "../nuance/surface-split.js";

const TOPIC = "nuance_live";
const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * @param {{
 *   bridge: any,
 *   videoEl: HTMLVideoElement,
 *   onUserTurn: (text: string) => void,
 *   onChange: (s: { phase: "off" | "starting" | "live", mic: { state: string, words: any } | null, reason?: string }) => void,
 *   devlog: (s: string) => void,
 * }} deps
 */
export function createPersonaStage({ bridge, videoEl, onUserTurn, onChange, devlog }) {
  /** @type {"off" | "starting" | "live"} */
  let phase = "off";
  /** @type {any} */ let room = null;
  let started = false;
  let mic = null;
  /** @type {object[]} */ let queue = [];
  /** @type {Array<() => void>} */ let audioDoneWaiters = [];
  let closedWaiter = null;
  /** @type {string | null} */ let lastInstructions = null;
  // The hand-off she is waiting on, if any (D316): the id of the latest one addressed to the client.
  /** @type {string | null} */ let openHandOff = null;
  /** @type {Array<() => void>} */ let handOffWaiters = [];
  // True while the turn being answered was SPOKEN to her (set by persona-ui around submit()).
  let spokenTurn = false;
  /** @type {HTMLAudioElement[]} */ let audioEls = [];
  const parts = new Map();
  const seen = new Map();

  const changed = (reason) => onChange({ phase, mic, ...(reason ? { reason } : {}) });

  function sendNow(evt) {
    if (!room) return;
    room.localParticipant.publishData(enc.encode(JSON.stringify(evt)), { reliable: true, topic: TOPIC }).catch((err) => devlog(`[persona] could not send ${evt.type}: ${err.message}`));
  }
  /** Nothing is sent before `session.started`: an earlier event can be lost with no error (the service's own rule). */
  function send(evt) {
    if (!evt) return;
    if (started) sendNow(evt); else queue.push(evt);
  }

  async function applyMic(result) {
    if (!result) return;
    mic = { state: result.state, words: result.words ?? null };
    try { await room?.localParticipant.setMicrophoneEnabled(result.state === "live"); }
    catch (err) { devlog(`[persona] the local microphone track could not be ${result.state === "live" ? "turned on" : "muted"}: ${err.message}`); }
    for (const c of result.commands ?? []) send(c);
    if (result.refused) devlog(`[persona] microphone: ${result.refused}`);
    changed();
  }

  function onEvent(evt) {
    const type = String(evt?.type ?? "?");
    seen.set(type, (seen.get(type) ?? 0) + 1);
    if (seen.get(type) === 1) devlog(`[persona] first ${type} (${Object.keys(evt).filter((k) => k !== "type" && k !== "event_id").join(", ") || "no fields"})`);

    if (type === "session.started") {
      started = true;
      for (const e of queue.splice(0)) sendNow(e);
      phase = "live";
      changed();
      // The persona never opens a conversation on its own. This is its hello - a rule, not a line.
      void speak({ surface: "boot" });
      return;
    }
    if (type === "session.input_transcript.done") {
      const text = String(evt.transcript ?? "").trim();
      devlog(`[persona] the user finished a turn (${text.split(/\s+/).filter(Boolean).length} words)${evt.replaces_event_id ? " - a correction of an earlier one" : ""}`);
      if (text && !evt.replaces_event_id) onUserTurn(text);
      return;
    }
    if (type === "session.output_audio.done") {
      for (const w of audioDoneWaiters.splice(0)) w();
      return;
    }
    if (type === "session.delegation.created") {
      const target = evt.target ?? evt.delegation?.target;
      const id = evt.delegation?.id ?? evt.id ?? null;
      // She has said she will look into it and is waiting for the answer. The next thing the
      // router says is that answer, and it goes back AS this hand-off's result.
      if (target === "client" && typeof id === "string") {
        openHandOff = id;
        for (const w of handOffWaiters.splice(0)) w();
      }
      // KEYS ONLY, never values: what a hand-off carries is not yet known, and it may carry the user's words.
      devlog(`[persona] the persona handed something off (target ${target ?? "?"}) - ${openHandOff === id ? "the next answer goes back as its result" : "not ours to answer"}`);
      return;
    }
    if (type === "error") {
      devlog(`[persona] the service reported ${evt.error?.type ?? "an error"}: ${evt.error?.code ?? "no code"}${started ? "" : " - before the session started"}`);
      if (!started) void finish(`refused:${evt.error?.code ?? "unknown"}`);
      return;
    }
    if (type === "session.closed") {
      closedWaiter?.();
      void finish(String(evt.reason ?? "closed"));
    }
  }

  function onData(payload, _participant, _kind, topic) {
    if (topic !== TOPIC) return;
    let evt;
    try { evt = JSON.parse(dec.decode(payload)); } catch { return; }
    // A large event arrives as a numbered series of parts.
    if (evt?.type === "message.part" && typeof evt.text === "string") {
      const key = String(evt.id ?? evt.message_id ?? "one");
      const got = parts.get(key) ?? [];
      got[Number(evt.index) || 0] = evt.text;
      parts.set(key, got);
      if (got.filter((x) => typeof x === "string").length >= Number(evt.count)) {
        parts.delete(key);
        try { onEvent(JSON.parse(got.join(""))); } catch { /* an unreadable event is dropped */ }
      }
      return;
    }
    onEvent(evt);
  }

  /** Tear down. Safe to call twice; tells main once. */
  async function finish(reason) {
    if (phase === "off") return;
    const was = phase;
    phase = "off";
    started = false;
    queue = [];
    openHandOff = null;
    lastInstructions = null;
    for (const w of handOffWaiters.splice(0)) w();
    for (const w of audioDoneWaiters.splice(0)) w();
    const r = room;
    room = null;
    try { await r?.disconnect(); } catch { /* already gone */ }
    for (const a of audioEls.splice(0)) a.remove();
    videoEl.srcObject = null;
    mic = null;
    devlog(`[persona] session over (${reason}); events seen: ${[...seen].map(([t, n]) => `${t}×${n}`).join(", ") || "none"}`);
    seen.clear();
    try { await bridge.personaClosed(reason); } catch { /* main logs its own half */ }
    changed(was === "live" ? reason : `not-started:${reason}`);
  }

  async function start() {
    if (phase !== "off") return { ok: false, reason: "already" };
    phase = "starting";
    changed();
    const r = await bridge.personaStart();
    if (!r?.ok) {
      phase = "off";
      changed(`not-started:${r?.reason ?? "unavailable"}`);
      return r ?? { ok: false, reason: "unavailable" };
    }
    try {
      room = new Room();
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === "video") track.attach(videoEl);
        else if (track.kind === "audio") { const a = track.attach(); a.hidden = true; document.body.append(a); audioEls.push(a); }
      });
      room.on(RoomEvent.DataReceived, onData);
      room.on(RoomEvent.Disconnected, () => { void finish("connection_lost"); });
      await room.connect(r.livekitUrl, r.roomToken);
      // Echo cancellation ON: without it the persona hears itself through the speakers and answers
      // its own voice. Published so the session can start - then muted at the source at once.
      await room.localParticipant.setMicrophoneEnabled(true, { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      await applyMic(r.mic);
      return { ok: true };
    } catch (err) {
      devlog(`[persona] could not join the room: ${err.message}`);
      await finish("join-failed");
      return { ok: false, reason: "join-failed" };
    }
  }

  /** The user's own click. Main decides; this applies. */
  async function toggleMic() {
    if (phase !== "live") return;
    await applyMic(await bridge.personaMic(mic?.state === "live" ? "user.mute" : "user.unmute"));
  }

  /** Resolves when the persona has finished the reply, or after `ms` - a lost event must not hang a turn. */
  const audioDone = (ms = 45_000) => new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    audioDoneWaiters.push(() => { clearTimeout(t); resolve(undefined); });
  });

  /**
   * One spoken surface. Sends what `personaTurn()` returns, in its order, and waits for the reply
   * to finish when there is one. Returns what was decided, for the developer log.
   * @param {{ surface?: string, text?: string }} turn
   */
  async function speak(turn) {
    if (phase !== "live") return null;
    const t = personaTurn(turn);
    // The same pointer she said last is not said again (D312): the panel has the line either way.
    if (isRepeatPointer(lastInstructions, t)) {
      devlog(`[persona] ${turn.surface ?? "(untagged)"} -> ${t.kind}/pointer, the same as her last line - not said again`);
      return t;
    }
    if (t.event) lastInstructions = t.event.response.instructions;
    // D316: when she is waiting on a hand-off, the answer goes back as that hand-off's result
    // rather than as a second request to speak beside her. Same words either way.
    if (spokenTurn) {
      // SHE HEARD THIS TURN HERSELF, so two things differ from a typed one (D316):
      //  - small talk she has already answered, in her own words and well. Sending her a rule for
      //    it as well is the second speaker; the panel has the line.
      if (t.kind === "persona" && String(turn.surface ?? "").startsWith("social.")) {
        devlog(`[persona] ${turn.surface} -> she heard it and answers small talk herself - nothing sent`);
        return t;
      }
      //  - her hand-off for it may not have ARRIVED yet. The router answers a template question
      //    in a millisecond; her "I'll get you the list" and the hand-off behind it take longer.
      //    Seen live: the answer was sent first, she was mid-sentence, and it was lost. So wait
      //    briefly for the hand-off before falling back to asking her to speak.
      if (t.event && !openHandOff) {
        await new Promise((resolve) => { const timer = setTimeout(resolve, 4000); handOffWaiters.push(() => { clearTimeout(timer); resolve(undefined); }); });
      }
    }
    const handOff = t.event && openHandOff ? openHandOff : null;
    if (handOff) openHandOff = null;
    for (const e of handOff ? [t.floor, asHandOffResult(t.event, handOff)].filter(Boolean) : t.send) send(e);
    devlog(`[persona] ${turn.surface ?? "(untagged)"} -> ${t.kind}/${t.speak}${t.floor ? " + floor held" : ""}${handOff ? " (as the result of her hand-off)" : ""}`);
    if (t.event) await audioDone();
    return t;
  }

  async function stop(reason = "user") {
    if (phase === "off") return;
    if (started) {
      sendNow({ type: "session.close" });
      await new Promise((resolve) => { closedWaiter = resolve; setTimeout(resolve, 3000); });
      closedWaiter = null;
    }
    await finish(reason);
  }

  return {
    get phase() { return phase; },
    get live() { return phase === "live"; },
    /** persona-ui sets this around the submit() of a turn that was spoken to her. */
    set spokenTurn(v) { spokenTurn = Boolean(v); },
    start, stop, speak, toggleMic,
    /** The consent card was approved or dismissed. */
    releaseFloor() { if (phase === "live") send(consentRelease()); },
    /** The user started typing or pressed stop: cut the persona off. */
    interrupt() { if (phase === "live") send({ type: "session.output_audio.interrupt" }); },
    /**
     * Before the broker runs an approved capability. For one that drops the network: one line,
     * then the session is closed, and the caller carries on with the local face and voice.
     * @returns {Promise<boolean>} true when the session was closed for it
     */
    async beforeExecute(capabilityId) {
      if (phase !== "live") return false;
      const b = beforeExecute(capabilityId);
      if (!b.closeSession) return false;
      send(b.send[0]);
      await audioDone(15_000);
      await stop(`before:${capabilityId}`);
      return true;
    },
  };
}
