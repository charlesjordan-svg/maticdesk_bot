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
import { personaTurn, consentRelease, beforeExecute, isRepeatPointer, asHandOffResult, lookupHold, lookupRelease } from "../nuance/surface-split.js";
import { greetingGuard } from "../nuance/mic-policy.js";

const TOPIC = "nuance_live";
const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * @param {{
 *   bridge: any,
 *   videoEl: HTMLVideoElement,
 *   onUserTurn: (text: string) => void,
 *   onPersonaSaid?: (text: string) => void,
 *   onChange: (s: { phase: "off" | "starting" | "live", mic: { state: string, words: any } | null, reason?: string }) => void,
 *   devlog: (s: string) => void,
 * }} deps
 */
export function createPersonaStage({ bridge, videoEl, selfEl = null, onUserTurn, onPersonaSaid = () => {}, onChange, devlog: devlogLocal }) {
  // Everything this file logs goes to the developer pane AND to audit/app.log (D323): event types,
  // microphone levels and device names. Never a word anybody said.
  const devlog = (line) => { devlogLocal(line); try { void bridge.personaLog?.(line); } catch { /* the pane has it */ } };
  // IS THE MICROPHONE ACTUALLY PRODUCING SOUND? "On" is a setting; this is the fact. When it is on
  // and silent for ten seconds the panel says so, in the user's words, and the log says which device.
  let micHint = null;
  let watch = null;
  function stopWatch() {
    if (!watch) return;
    clearInterval(watch.timer);
    try { void watch.ctx.close(); } catch { /* already closed */ }
    watch = null;
  }
  function watchMic() {
    stopWatch();
    micHint = null;
    const pub = room ? [...room.localParticipant.audioTrackPublications.values()].find((p) => p.track) : null;
    const mst = pub?.track?.mediaStreamTrack;
    if (!mst) { devlog("[persona] there is no local microphone track to listen to"); return; }
    devlog(`[persona] microphone device: ${mst.label || "unnamed"} (enabled ${mst.enabled}, muted by the system ${mst.muted}, ${mst.readyState})`);
    try {
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      ctx.createMediaStreamSource(new MediaStream([mst])).connect(an);
      const buf = new Float32Array(an.fftSize);
      let quiet = 0, heard = false;
      const timer = setInterval(() => {
        if (mic?.state !== "live") { quiet = 0; return; }
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const x of buf) sum += x * x;
        if (Math.sqrt(sum / buf.length) > 0.003) {
          if (!heard || quiet >= 10) devlog("[persona] the microphone is picking up sound");
          heard = true; quiet = 0;
          if (micHint) { micHint = null; changed(); }
        } else if (++quiet === 10) {
          // Logged every time; SAID ON THE PANEL only when nothing has been heard at all this session.
          // A person who stops talking for ten seconds has a working microphone, and telling them
          // otherwise would be the false alarm.
          devlog(`[persona] NO SOUND from the microphone for 10 s while it is on (${mst.label || "unnamed"}; enabled ${mst.enabled}, muted by the system ${mst.muted}, ${mst.readyState})`);
          if (!heard) {
            micHint = "I'm not picking up any sound from your microphone. Check it isn't muted, and that Windows is using the one you're speaking into.";
            changed();
          }
        }
      }, 1000);
      watch = { ctx, timer };
    } catch (err) { devlog(`[persona] the microphone's level could not be watched: ${err.message}`); }
  }
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
  // HER OWN WORDS, for the panel (D318). When she answers a turn herself the conversation would
  // otherwise be one-sided on screen: the user's sentence and nothing after it. Her reply is
  // gathered from the service's own transcript of her speech and shown when she finishes - IN
  // MEMORY ONLY, never logged, never written to disk. A reply that came from something the client
  // sent is not shown this way: the panel already has that line, exactly.
  let herWords = "";
  let weSpoke = false;
  let camera = null;
  /** @type {HTMLAudioElement[]} */ let audioEls = [];
  const parts = new Map();
  const seen = new Map();

  /** The user's own picture, small, in the corner: what is being sent is what they can see. */
  function showSelf() {
    if (!selfEl) return;
    const pub = camera?.on && room ? [...room.localParticipant.videoTrackPublications.values()].find((p) => p.track) : null;
    if (pub?.track) { pub.track.attach(selfEl); selfEl.hidden = false; }
    else { selfEl.hidden = true; selfEl.srcObject = null; }
  }

  const changed = (reason) => onChange({ phase, mic: mic ? { ...mic, hint: mic.state === "live" ? micHint : null } : null, camera, ...(reason ? { reason } : {}) });

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
    if (result.state === "live") watchMic(); else { stopWatch(); micHint = null; }
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
      // A different hello each time (D320): the rule is picked here, the words are hers.
      // And she is left to finish it (D323): when the session started with the microphone on, the
      // service is asked for silence until the hello is over - or twelve seconds, whichever is first.
      const guard = greetingGuard(mic?.state);
      for (const e of guard.before) sendNow(e);
      void Promise.race([speak({ surface: "boot", variant: Math.floor(Math.random() * 1000) }), new Promise((r) => setTimeout(r, 12_000))]).then(() => {
        if (phase === "live" && mic?.state === "live") for (const e of guard.after) sendNow(e);
      });
      return;
    }
    if (type === "session.input_transcript.done") {
      const text = String(evt.transcript ?? "").trim();
      devlog(`[persona] the user finished a turn (${text.split(/\s+/).filter(Boolean).length} words)${evt.replaces_event_id ? " - a correction of an earlier one" : ""}`);
      if (text && !evt.replaces_event_id) onUserTurn(text);
      return;
    }
    if (type === "session.output_transcript.delta") {
      if (typeof evt.delta === "string") herWords += evt.delta;
      return;
    }
    if (type === "session.output_audio.done") {
      const hers = herWords.replace(/\s+/g, " ").trim();
      herWords = "";
      if (!weSpoke && hers) onPersonaSaid(hers);
      weSpoke = false;
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
    stopWatch();
    micHint = null;
    mic = null;
    camera = null;
    showSelf();
    herWords = "";
    weSpoke = false;
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
      camera = r.camera ?? null;
      await applyMic(r.mic);
      // D323: the camera starts on when main said so - main has already written that down.
      if (camera?.on) {
        try { await room.localParticipant.setCameraEnabled(true); }
        catch (err) { devlog(`[persona] the camera could not be turned on: ${err.message}`); }
        showSelf();
        changed();
      }
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
    if (t.event) { lastInstructions = t.event.response.instructions; weSpoke = true; }
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
    /** Did she hand this turn off? Resolves true at once if a hand-off is open, or when one arrives within `ms`. */
    waitForHandOff(ms = 5000) {
      if (openHandOff) return Promise.resolve(true);
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(Boolean(openHandOff)), ms);
        handOffWaiters.push(() => { clearTimeout(timer); resolve(true); });
      });
    },
    /** The user's own click on the camera button. Main decides; this applies it to the local track. */
    async toggleCamera() {
      if (phase !== "live" || !camera) return;
      const r = await bridge.personaCamera(camera.on ? "user.off" : "user.on");
      if (r?.refused) devlog(`[persona] camera: ${r.refused}`);
      camera = r?.words ? { on: Boolean(r.on), words: r.words } : camera;
      try { await room?.localParticipant.setCameraEnabled(Boolean(camera?.on)); }
      catch (err) { devlog(`[persona] the camera could not be ${camera?.on ? "turned on" : "turned off"}: ${err.message}`); }
      showSelf();
      changed();
    },
    /** persona-ui sets this around the submit() of a turn that was spoken to her. */
    set spokenTurn(v) { spokenTurn = Boolean(v); },
    start, stop, speak, toggleMic,
    /** The consent card was approved or dismissed. */
    releaseFloor() { if (phase === "live") send(consentRelease()); },
    /** D325: the knowledge base is being asked about what the user just said; she waits rather than answering from world knowledge. */
    holdForLookup() { if (phase === "live") send(lookupHold()); },
    /** …and it has answered or declined. Either way the floor is hers again. */
    releaseLookup() { if (phase === "live") send(lookupRelease()); },
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
