# voices/

The Piper voice model lives here and is **not committed** (63 MB). Get it with:

```bash
npm run fetch-voice
```

That downloads `en_US-amy-medium.onnx` and its `en_US-amy-medium.onnx.json` sidecar from the public
Piper voices repository on Hugging Face (`rhasspy/piper-voices`, tag `v1.0.0`). `config.json`
points at `voices/en_US-amy-medium.onnx`, resolved against the app root at startup.

The voice moved from `en_US-amy-low` (16 kHz) to `en_US-amy-medium` (22.05 kHz) on 2026-09-11 —
same speaker and same dataset, higher quality. The low model may still be sitting in this folder
from before; it is ignored unless `config.json` or `MATIC_VOICE_MODEL` points back at it, which is
the rollback.

To use a model somewhere else, set `MATIC_VOICE_MODEL` to its path instead of editing `config.json`.

Without the model the app still runs, text-only with mouth animation, and the voice pill says so.
