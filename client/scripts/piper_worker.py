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
import json
import sys
import wave
from pathlib import Path

from piper import PiperVoice

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


def main():
    if len(sys.argv) < 2:
        emit({"ready": False, "error": "usage: piper_worker.py <model.onnx> [config.json]"})
        return 1
    model = Path(sys.argv[1])
    config = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(str(model) + ".json")
    if not model.exists():
        emit({"ready": False, "error": f"voice model not found: {model}"})
        return 1

    try:
        voice = PiperVoice.load(str(model), config_path=str(config), include_alignments=True)
    except Exception as exc:
        emit({"ready": False, "error": f"model load failed: {exc}"})
        return 1

    sr = voice.config.sample_rate
    emit({"ready": True, "sampleRate": sr, "model": model.name})

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
            with wave.open(str(out_wav), "wb") as wav_file:
                alignments = voice.synthesize_wav(req["text"], wav_file, include_alignments=True)
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
