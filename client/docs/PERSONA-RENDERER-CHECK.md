# The live persona — the click-through

**What this is.** `client/src/renderer/persona-stage.js` and `persona-ui.js` cannot be tested headless:
they need a window, a room and a microphone. This is what to do with the real app, and what was seen
when it was done. Register D307; handback `docs/handovers/2026-11-16-claude-code-handover-nuance-live-persona-first-pass.md`, third pass.

## Running it

Needs PostgreSQL up, a hub with the key, and an enrolled endpoint. From PowerShell, in two windows:

```powershell
cd C:\Users\Charles\Downloads\maticdesk_bot\server
npm.cmd run db:up
$env:MATIC_NUANCE_API_KEY = (Get-Content "C:\Users\Charles\Downloads\Nuance Labs\Nuance Key.txt" -Raw).Trim()
npm.cmd start
```

```powershell
cd C:\Users\Charles\Downloads\maticdesk_bot\client
$env:MATIC_PERSONA = "1"
npm.cmd start
```

**If Matic Desk is already in the notification area, the second command hands over to it and exits**
— it is a single-instance app, and the one already running was started before `MATIC_PERSONA` was
set. Quit it from the tray first. (A session driving it for a test used a separate profile instead:
`electron.cmd . --user-data-dir=<a scratch folder>`, with `MATIC_ENROLLMENT_SECRET` set.)

**Every session spends credits**, from the moment the face appears until it ends, silence included.

## What to look for

| # | Do | Expect |
|---|---|---|
| 1 | Launch | **Talk face to face** under the v7 bust. No video, no microphone button |
| 2 | Click it | *Starting…*, then the face where the bust was, labelled **Live video · AI**; **Microphone off** and its sentence; she says hello in her own words |
| 3 | Say something, microphone still off | **Nothing.** She cannot hear you |
| 4 | Click **Microphone off** | It reads **Microphone on** and says your voice is leaving this PC |
| 5 | Say "hello Matic, how are you" | Your words appear as your turn; she answers |
| 6 | Type "what can you do" | The list is on the panel. She says it is on the screen and **lists nothing** |
| 7 | Ask for something that raises a consent card | She says it is on the screen and that nothing happens until you approve. **She does not describe the change**, and stays quiet while you read |
| 8 | Approve a network change (`renew_dhcp`, `reset_adapter`) | She says she is stepping away, the face goes, the bust is back, and the result is spoken by the built-in voice |
| 9 | Talk over her | She stops |
| 10 | **Make the video bigger** | The rail widens; the conversation is narrower and nothing is behind the face |
| 11 | Close the window with the X, mid-session | The session ends. `client/audit/egress.jsonl` has a `persona.closed` line with reason `window-hidden` |
| 12 | **End live video** | The bust is back, the conversation is where it was |
| 13 | Read `client/audit/egress.jsonl` | `persona.opened` (microphone off), an `audio.on`/`audio.off` pair per stretch, `persona.closed` with both durations — **and not one word anyone said** |

## What was seen — 2026-11-17

Driven over the DevTools Protocol against a real session with `mira`, first with a synthetic
microphone (`--use-fake-device-for-media-stream`, a Piper recording of one sentence), and — unplanned —
by Charles clicking the same window. Screenshots: `docs/handovers/screenshots/2026-11-17-persona/`.

| # | Result |
|---|---|
| 1, 2 | **Seen.** Face on screen a few seconds after the click, 704 × 640, playing. The service's own **AI** mark is in the picture, lower centre, as well as our label |
| 3 | **Seen, by its record:** a session ended with the microphone never clicked wrote `audioSentMs: 0`, and the service confirmed the opening mute (`session.input_audio.muted`) |
| 4 | **Seen.** Label, pressed state and sentence all changed; the service confirmed `unmuted` |
| 5 | **Seen, twice,** with the synthetic voice: transcribed as *"Hello Matic. How are you today"*, routed as `social.howareyou`, answered. **The name was written "Matic" both times** |
| 6 | **NOT RUN** (the capability answer) |
| 7 | **Seen**, with D310 on top: a `flush_dns` card came up, the log read `@consentVoice -> pinned/pointer + floor held`, and the service reported the quiet period. What she SAID was not captured |
| 7a | **D310 seen, by Charles's own voice:** a one-word answer ignored as unclear; *"I approve."* approved; the card read *Approved by you, by voice*; the broker ran it; `audit/voice-consent.jsonl` has the line and its nonce matches the broker's audit line |
| 8, 9 | **NOT RUN** (the pre-emptive close; talking over her) |
| — | **D308 seen:** typed "how is my computer doing" → the band opened and *"Two things stand out: last restarted — 16 hours ago and memory — almost full…"* was relayed. **D309 seen:** typed "where is my ticket" → the filed-tickets reply was relayed |
| 10 | **Seen.** 460 × 418, rail 500 px, class gone when the session ended |
| 11 | **FAILED, then fixed, and the fix has NOT been watched.** Charles closed the window mid-session and no `persona.closed` line was written. Main now ends the session itself; `test/nuance-session.test.mjs` §4 pins the code, nobody has closed a window on it since |
| 12 | **Seen**, three times |
| 13 | **Seen.** Lines as described, no content |

**Not observed by anyone:** anything heard by a person in a room; echo on speakers; a real human
voice through the recogniser; barge-in; the consent hold; the pre-emptive close.
