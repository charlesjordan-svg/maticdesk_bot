# voices/

The Piper voice model lives here and is **not committed** (63 MB). Get it with:

```bash
npm run fetch-voice
```

That downloads `en_US-amy-low.onnx` and its `en_US-amy-low.onnx.json` sidecar from the public
Piper voices repository on Hugging Face (`rhasspy/piper-voices`, tag `v1.0.0`). `config.json`
points at `voices/en_US-amy-low.onnx`, resolved against the app root at startup.

To use a model somewhere else, set `MATIC_VOICE_MODEL` to its path instead of editing `config.json`.

Without the model the app still runs, text-only with mouth animation, and the voice pill says so.
