"""Persistent Piper worker.

Loads the voice model ONCE, then serves synthesis requests as newline-delimited JSON on
stdin/stdout. Reloading a 63 MB ONNX per utterance costs seconds; the demo cannot afford that.

Protocol
  in  : {"id": <int>, "text": <str>, "wav": <path>}
  out : {"id": <int>, "ok": true,  "wav": <path>, "sampleRate": <int>, "timeline": [[ph, ms], ...]}
        {"id": <int>, "ok": false, "error": <str>}
  Also emits {"ready": true, ...} on stdout once the model is loaded.

Timeline is [phoneme, durationMs] - the exact shape TTSVisemeDriver consumes.
"""
import io
import json
import math
import sys
import wave
from pathlib import Path

import numpy as np
from piper import PiperVoice, SynthesisConfig

# IPA is non-ASCII (ɛ ʃ θ ...). Without this, Windows' default codepage mangles the timeline.
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
# STDIN TOO. Without this the request JSON is decoded with the console codepage, so an em dash
# (E2 80 94) arrives as "â€”" and Amy says "a-circumflex euros" in the middle of a sentence -
# heard by Charles on 2026-09-10 as "the word circumflex". Node writes UTF-8; read it as UTF-8.
sys.stdin.reconfigure(encoding="utf-8")

# Stress and length marks modify an adjacent phoneme rather than being a sound of their own.
# Piper still assigns them their own duration, so left alone they make the mouth snap to a
# fallback shape mid-vowel on every long or stressed syllable. Merge their duration into the
# preceding real phoneme instead of emitting a timeline row for them.
# DO NOT BYPASS - this is the fix referenced in the handover §3.
MODIFIERS = {"\u02c8", "\u02cc", "\u02d0", "\u02d1"}  # ˈ ˌ ː ˑ


def build_timeline(alignments, sample_rate):
    timeline = []
    for a in alignments:
        dur_ms = a.num_samples / sample_rate * 1000
        if a.phoneme in MODIFIERS and timeline:
            timeline[-1][1] += dur_ms
        else:
            timeline.append([a.phoneme, dur_ms])
    for row in timeline:
        row[1] = round(row[1], 2)
    return timeline


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def highshelf(x, sr, gain_db, f0, q):
    """One high-shelf biquad, Audio EQ Cookbook.

    WHY THIS IS HERE AND NOT AN ffmpeg CALL. The samples Charles chose from were rendered with
    `treble=g=-2.3:f=2500`, so this has to reproduce that - but spawning ffmpeg per utterance to
    move a spectral centroid by 100 Hz would add a process to the speech path, and the speech path
    is the one thing in this app that must not acquire latency.

    Q IS 0.7 AND THAT IS A MEASUREMENT, NOT A DEFAULT. The cookbook formula at Q 0.5 gives a
    centroid of 1281 Hz where ffmpeg's own filter gives 1273; Q 0.7 gives 1273 exactly. The number
    is calibrated against what he actually heard rather than against ffmpeg's source.

    IT CANNOT DESYNC THE MOUTH. A biquad is sample-aligned - no resampling, no time shift beyond a
    group delay of a few samples - so every alignment the timeline was built from still points at
    the same audio. That is the whole reason the filter is a shelf and not, say, a time-stretch.
    """
    A = 10.0 ** (gain_db / 40.0)
    w0 = 2.0 * math.pi * f0 / sr
    alpha = math.sin(w0) / (2.0 * q)
    c, sq = math.cos(w0), math.sqrt(A)
    b = np.array([
        A * ((A + 1) + (A - 1) * c + 2 * sq * alpha),
        -2 * A * ((A - 1) + (A + 1) * c),
        A * ((A + 1) + (A - 1) * c - 2 * sq * alpha),
    ])
    a0 = (A + 1) - (A - 1) * c + 2 * sq * alpha
    a = np.array([1.0, (2 * ((A - 1) - (A + 1) * c)) / a0, ((A + 1) - (A - 1) * c - 2 * sq * alpha) / a0])
    b = b / a0
    try:
        # scipy is a Piper dependency on this machine and runs the recursion in C. It is not
        # REQUIRED, because a voice that will not speak is a worse failure than a slow filter.
        from scipy.signal import lfilter
        return lfilter(b, a, x)
    except Exception:
        y = np.zeros_like(x)
        x1 = x2 = y1 = y2 = 0.0
        for i, xi in enumerate(x):
            yi = b[0] * xi + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
            x2, x1 = x1, xi
            y2, y1 = y1, yi
            y[i] = yi
        return y


def apply_shelf(frames, sr, tuning):
    """int16 bytes -> filtered int16 bytes. Returns the input unchanged when there is no shelf."""
    if not tuning.get("enabled") or abs(float(tuning.get("shelfDb", 0))) < 0.05:
        return frames
    x = np.frombuffer(frames, dtype=np.int16).astype(np.float64) / 32768.0
    y = highshelf(x, sr, float(tuning["shelfDb"]), float(tuning["shelfHz"]), float(tuning["shelfQ"]))
    # A shelf that CUTS cannot clip, but the clamp stays: shelfDb is a config value a person edits,
    # and a positive one that wrapped int16 would sound like tearing rather than like brightness.
    return np.clip(np.round(y * 32768.0), -32768, 32767).astype(np.int16).tobytes()


def main():
    argv = list(sys.argv[1:])
    # D264. `--tuning <json>` is pulled out first so the positional arguments keep their old
    # meaning: a worker started without it behaves exactly as it did before the flag existed.
    tuning = {"enabled": False}
    if "--tuning" in argv:
        i = argv.index("--tuning")
        try:
            tuning = json.loads(argv[i + 1])
        except (IndexError, json.JSONDecodeError) as exc:
            emit({"ready": False, "error": f"bad --tuning json: {exc}"})
            return 1
        del argv[i:i + 2]
    if len(argv) < 1:
        emit({"ready": False, "error": "usage: piper_worker.py <model.onnx> [config.json] [--tuning <json>]"})
        return 1
    model = Path(argv[0])
    config = Path(argv[1]) if len(argv) > 1 else Path(str(model) + ".json")
    if not model.exists():
        emit({"ready": False, "error": f"voice model not found: {model}"})
        return 1

    try:
        voice = PiperVoice.load(str(model), config_path=str(config), include_alignments=True)
    except Exception as exc:
        emit({"ready": False, "error": f"model load failed: {exc}"})
        return 1

    sr = voice.config.sample_rate
    syn = None
    if tuning.get("enabled") and abs(float(tuning.get("lengthScale", 1.0)) - 1.0) > 0.001:
        syn = SynthesisConfig(length_scale=float(tuning["lengthScale"]))
    emit({"ready": True, "sampleRate": sr, "model": model.name, "tuning": tuning})
    print(f"tuning: {json.dumps(tuning)}", file=sys.stderr, flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as exc:
            emit({"id": None, "ok": False, "error": f"bad request json: {exc}"})
            continue
        req_id = req.get("id")
        if req.get("cmd") == "quit":
            return 0
        try:
            out_wav = Path(req["wav"])
            out_wav.parent.mkdir(parents=True, exist_ok=True)
            # Synthesised into memory so the shelf is applied on the way out rather than by reading
            # back a file we just wrote. `length_scale` goes in HERE, at synthesis, which is what
            # keeps the alignments honest: they come back scaled with the audio (measured - the
            # timeline sum equals the audio duration at both 1.0 and 0.65).
            buf = io.BytesIO()
            with wave.open(buf, "wb") as wav_file:
                alignments = voice.synthesize_wav(
                    req["text"], wav_file, syn_config=syn, include_alignments=True,
                )
            buf.seek(0)
            with wave.open(buf, "rb") as r:
                params = r.getparams()
                frames = r.readframes(r.getnframes())
            with wave.open(str(out_wav), "wb") as w:
                w.setparams(params)
                w.writeframes(apply_shelf(frames, params.framerate, tuning))
            if not alignments:
                # Honest failure: the caller falls back to a mouth-only animation rather than
                # pretending it has real alignment data (§13).
                emit({"id": req_id, "ok": False, "error": "no alignments returned by this voice model"})
                continue
            emit({
                "id": req_id,
                "ok": True,
                "wav": str(out_wav),
                "sampleRate": sr,
                "timeline": build_timeline(alignments, sr),
            })
        except Exception as exc:
            emit({"id": req_id, "ok": False, "error": f"{type(exc).__name__}: {exc}"})
    return 0


if __name__ == "__main__":
    sys.exit(main())
