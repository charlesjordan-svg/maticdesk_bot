/**
 * TTSVisemeDriver — drives a MaticBotAvatar's live `.viseme` from a phoneme timeline, synced to
 * an <audio> element's actual playback position.
 *
 * Input contract: an array of [phonemeId, durationMs] tuples — the exact shape the showcase page's
 * own TRACKS data already uses (see "Matic Bot Avatar System.dc.html" §03 — Speech), and the natural
 * output shape of an eSpeak-ng/Piper phonemization pass (a sequence of phonemes, each with a duration).
 * phonemeId strings are whatever MaticBotAvatar.resolveViseme() already understands: eSpeak/Piper
 * phoneme ids, the six shape names directly, or legacy OVR ids.
 *
 * WHERE THE TIMELINE COMES FROM (verified, not assumed - this paragraph used to say the opposite):
 * `scripts/piper_worker.py` loads the voice with `include_alignments=True` and builds the timeline
 * from the alignments `synthesize_wav` returns. Those phonemes are IPA (θ ʃ ɜː ...), with stress and
 * length marks merged into the preceding phoneme rather than emitted as rows. The table that turns
 * them into shapes is `../avatar/viseme-map.js`, which the <matic-avatar> element uses when this
 * driver writes `.viseme`. The element changed on 2026-09-10 (SVG chassis, D232); this driver did
 * not, because the `state`/`viseme` contract it drives was kept.
 *
 * Usage:
 *   import { TTSVisemeDriver } from './tts-viseme-driver.js';
 *   const driver = new TTSVisemeDriver(avatarEl, audioEl);
 *   driver.speak([["l",60],["E",90],["t",50], ...]);   // sets avatarEl.state = "speaking" for you
 *   // ...
 *   driver.stop();                                      // reverts viseme, does not touch state
 */

export class TTSVisemeDriver {
  /**
   * @param {{ viseme: string|null, state: string }} avatarEl - a MaticBotAvatar element, or anything
   *   exposing the same `viseme`/`state` properties.
   * @param {HTMLAudioElement} [audioEl] - if given, playback position drives timing (handles
   *   buffering/stalls correctly since it's read every frame, not assumed). If omitted, falls back to
   *   wall-clock timing via performance.now() — useful for silent preview/testing.
   */
  constructor(avatarEl, audioEl) {
    this.avatarEl = avatarEl;
    this.audioEl = audioEl || null;
    this._raf = null;
    this._cumulative = null;
    this._totalMs = 0;
    this._startPerfMs = 0;
    this._lastShape = undefined;
    this._speakingState = "speaking";
  }

  /**
   * Begin driving visemes from `timeline` ([phonemeId, durationMs] tuples). Sets avatarEl.state to
   * the speaking state (default "speaking") for the duration, and reverts on stop()/natural end.
   * If an audioEl was given, call audioEl.play() yourself before or after this — the driver only
   * reads currentTime, it doesn't control playback.
   */
  speak(timeline, { speakingState = "speaking" } = {}) {
    this.stop();
    this._speakingState = speakingState;
    let t = 0;
    this._cumulative = timeline.map(([phoneme, durMs]) => {
      const row = { phoneme, startMs: t, endMs: t + durMs };
      t += durMs;
      return row;
    });
    this._totalMs = t;
    this._startPerfMs = performance.now();
    this._lastShape = undefined;
    this.avatarEl.state = this._speakingState;
    this._tick();
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._cumulative = null;
    if (this._lastShape !== undefined) this.avatarEl.viseme = null;
    this._lastShape = undefined;
  }

  _elapsedMs() {
    if (this.audioEl && !this.audioEl.paused) return this.audioEl.currentTime * 1000;
    if (this.audioEl && this.audioEl.ended) return this._totalMs;
    return performance.now() - this._startPerfMs;
  }

  _phonemeAt(ms) {
    const rows = this._cumulative;
    // Linear scan is fine here — real timelines are a few hundred entries at most for a UI reply,
    // and this only runs once per rAF frame while actively speaking, not continuously.
    for (const row of rows) {
      if (ms >= row.startMs && ms < row.endMs) return row.phoneme;
    }
    return rows.length ? rows[rows.length - 1].phoneme : "sil";
  }

  _tick() {
    if (!this._cumulative) return;
    const elapsed = this._elapsedMs();
    if (elapsed >= this._totalMs) {
      this.stop();
      return;
    }
    const phoneme = this._phonemeAt(elapsed);
    if (phoneme !== this._lastShape) {
      this._lastShape = phoneme;
      this.avatarEl.viseme = phoneme;
    }
    this._raf = requestAnimationFrame(() => this._tick());
  }
}
