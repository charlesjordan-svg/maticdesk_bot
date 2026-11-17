# livekit-client, vendored

| | |
|---|---|
| Package | `livekit-client` |
| Version | **2.24.1** |
| File | `dist/livekit-client.esm.mjs` from the npm tarball, byte for byte, source map not included |
| sha256 of the file | `360c155384ffcbfa53e5ec871b21de945d6017315c466f692904dde8d3a7a888` |
| Tarball shasum (matches the registry's `dist.shasum`) | `49f3cd0c8338a51209583ebf05974860c50824c2` |
| Licence | Apache-2.0 (`livekit-client.LICENSE`, beside this file) |
| Fetched | 2026-11-17, `npm pack livekit-client@2.24.1` |

**Why it is a file and not a dependency.** The renderer runs with `contextIsolation: true` and
`nodeIntegration: false` and cannot `require` anything, so a browser library is vendored as one
self-contained ESM file - the pattern `tts-viseme-driver.js` already set. It has no bare imports.
`client/package.json` still has two runtime dependencies.

**What it costs.** 1.47 MB of third-party WebRTC code inside a binary whose code-signing is already a
recorded blocker. It is the largest dependency this client has taken. Only `persona-stage.js` imports
it, and only when a live session is started.

**To update:** `npm pack livekit-client@<version>`, copy the same file, and update the three hashes
above. `test/nuance-session.test.mjs` §4 fails if the file and the sha256 here disagree.

Nuance's own `@nuancelabs/js-sdk` (0.37.1, which depends on this package) is NOT used: its docs
say any LiveKit SDK works, and one fewer layer is one fewer thing in the signed binary.
