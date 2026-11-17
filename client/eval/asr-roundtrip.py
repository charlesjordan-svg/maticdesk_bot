"""
The real-ASR half of the transcript bakeoff (v2, 2026-11-16).

docs/handovers/2026-11-16-claude-code-handover-nuance-live-persona.md §5.1: "If you can get real
ASR output rather than hand-written spoken-form variants, that is a stronger experiment."

Every sentence - the 40 typed cases, their 160 spoken-form variants, and the vocative probes - is
SPOKEN by Piper (the voice this product already ships) and TRANSCRIBED by faster-whisper. The
transcripts are written to a JSON file that eval/run-spoken-bakeoff.mjs --asr reads.

WHAT THIS IS AND IS NOT, so nobody quotes it as more:
  - The recogniser is real. The speaker is synthetic: one voice, studio-clean, no room, no laptop
    microphone, no accent, no colleague in the background. A person is harder than this.
  - It is NOT Nuance's recogniser. Nobody on this project has seen a Nuance transcript. Whisper is
    a stand-in for "an ASR system", and what transfers is the CLASS of change (punctuation,
    casing, contractions, how an unusual name is written), not the rate.
  - So every count this produces is a FLOOR on the damage, not a measurement of the damage.

Usage (from client/):
    py -3 eval/asr-roundtrip.py --out eval/results/spoken-asr-2026-11-16.json
    py -3 eval/asr-roundtrip.py --models base.en small.en --voice voices/en_US-amy-medium.onnx

Needs: piper-tts, faster-whisper, and the voice model (npm.cmd run fetch-voice). Whisper models are
read from the local Hugging Face cache; this script downloads nothing (local_files_only).
"""
import argparse
import io
import json
import sys
import wave
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent


def main():
    for stream in (sys.stdin, sys.stdout, sys.stderr):  # all three: CLAUDE.md's mojibake rule
        stream.reconfigure(encoding="utf-8")

    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--voice", default=str(HERE.parent / "voices" / "en_US-amy-medium.onnx"))
    ap.add_argument("--models", nargs="+", default=["base.en", "small.en"])
    args = ap.parse_args()

    voice_path = Path(args.voice)
    if not voice_path.is_file():
        sys.exit(f"voice model not found: {voice_path} (npm.cmd run fetch-voice)")

    cases = json.loads((HERE / "cases.json").read_text(encoding="utf-8"))["cases"]
    spoken = json.loads((HERE / "spoken-cases.json").read_text(encoding="utf-8"))

    items = []
    for c in cases:
        items.append({"set": "case", "id": c["id"], "kind": "typed", "said": c["text"]})
        for kind, text in spoken["variants"][c["id"]].items():
            items.append({"set": "case", "id": c["id"], "kind": kind, "said": text})
    for text in spoken["vocativeProbes"]["probes"]:
        items.append({"set": "probe", "id": None, "kind": "probe", "said": text})

    from piper import PiperVoice
    voice = PiperVoice.load(str(voice_path), config_path=str(voice_path) + ".json")

    print(f"synthesising {len(items)} sentences with {voice_path.name} ...", flush=True)
    audio = []
    for it in items:
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            voice.synthesize_wav(it["said"], w)
        buf.seek(0)
        with wave.open(buf, "rb") as r:
            sr = r.getframerate()
            pcm = np.frombuffer(r.readframes(r.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
        # faster-whisper takes 16 kHz mono float32. Linear resample is enough for a recogniser.
        if sr != 16000:
            n = int(round(len(pcm) * 16000 / sr))
            pcm = np.interp(np.linspace(0, len(pcm), n, endpoint=False), np.arange(len(pcm)), pcm).astype(np.float32)
        audio.append(pcm)
        it["seconds"] = round(len(pcm) / 16000, 2)
        it["heard"] = {}

    from faster_whisper import WhisperModel
    for name in args.models:
        print(f"transcribing with faster-whisper {name} (cpu, int8, beam 5, temperature 0) ...", flush=True)
        model = WhisperModel(name, device="cpu", compute_type="int8", local_files_only=True)
        for it, pcm in zip(items, audio):
            segments, _info = model.transcribe(pcm, language="en", beam_size=5, temperature=0.0,
                                               condition_on_previous_text=False, vad_filter=False)
            it["heard"][name] = " ".join(s.text.strip() for s in segments).strip()

    out = {
        "producedAt": datetime.now(timezone.utc).isoformat(),
        "tts": f"piper {voice_path.name} (default synthesis config)",
        "models": args.models,
        "decoder": {"device": "cpu", "compute_type": "int8", "beam_size": 5, "temperature": 0.0},
        "_what": "Real ASR over a synthetic speaker. Not a person, not a microphone, not Nuance's recogniser. A floor.",
        "items": items,
    }
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
