# Avatar renderer check — for Charles to run

**Written 2026-09-10 with the bust avatar integration (D232).** Same shape as
[`D130-RENDERER-CHECK.md`](D130-RENDERER-CHECK.md): the renderer is not covered by `npm test`
because no headless test can see a screen, so this is the list of things a person looks at. The
session that built this drove the element in a browser (see the handover's §5 for what it saw and
did not see); **the Electron app itself has not been watched through a real conversation with the
new face.** That is this document.

Everything below is pass/fail against the manifest at
[`../src/renderer/avatar/matic-avatar.manifest.json`](../src/renderer/avatar/matic-avatar.manifest.json).
Where a row says "manifest", the manifest is the answer key, not this file.

## 0. Before starting

```powershell
cd C:\Users\Charles\Downloads\maticdesk_bot\client
npm.cmd test
npm.cmd run avatar:check
```

Both green. Then start the hub (Desktop icon "Matic Desk Hub") and the agent ("Matic Desk Agent"),
or `npm.cmd run start:elevated` from `client/`.

## 1. The two pages side by side (acceptance item 1)

Serve the renderer directory and open both pages:

```powershell
py -3 -m http.server 8765 --directory C:\Users\Charles\Downloads\maticdesk_bot\client\src\renderer --bind 127.0.0.1
```

- `http://127.0.0.1:8765/avatar/avatar-check.html` — **the element the app renders**, every state at
  200/160/96/64/44/32/24 px, from the real manifest and the real generated assets.
- `http://127.0.0.1:8765/avatar/matic-avatar-harness.html` — **the designer's reference**, opened
  from the same directory (it also opens from disk with no server).

| # | Look at | Pass when |
|---|---|---|
| 1.1 | Any state, any size, both pages | Same eyes, same mouth, same badge, same tip colour. A difference is a finding, not a taste question |
| 1.2 | `declining` at 200 and at 44 | Round eyes, narrow mouth, no bow. At 44 the `?` badge is cropped and it is STILL not `idle` (oval + smile) and STILL not `apologising` (lowered eyes, bowing) |
| 1.3 | `escalating` row on the check page | 200/160/96 render with the ticket and `→` badge; **64/44/32 show `idle` with a red "refused → idle" caption**, and the warnings box at the bottom names the 96px floor |
| 1.4 | `ingest` row | Every cell is `idle` with "refused → idle"; the row is grey and says parked |
| 1.5 | 24px column | Nothing rendered, caption "below floor: not rendered" |
| 1.6 | `accept` at 64 | Renders, and the warnings box has one "legible but weak below 96px" line for it |
| 1.7 | Dark panel button on the check page | The circular field disappears and the shell goes to the lighter grey. **Then the same button on the harness** — the handover records what the session saw there (§5.3) |
| 1.8 | Speech row | Mouth shapes change at ~9/s with the caption naming each IPA phoneme and its shape. Nothing else moves at any of the four sizes. `θ` reads `narrow`, `ʃ` `wideFlat`, `əʊ` `roundLarge`, `_` `closed` |
| 1.9 | Reduced motion, on the HARNESS ("Force reduced motion" toggle) | Rigs hold still, the tip is at full brightness, the three thinking dots are visible and static, the listening rings are one static ring per pod, the tray row still separates four reads by shape |

## 2. In the app (the states that matter)

Watch the face AND the small state label under it. The label follows what the element actually
rendered; if it ever reads `idle (refused: …)` that is a bug in a call site, not the label.

| # | Do | Face | Label ends at |
|---|---|---|---|
| 2.1 | Start the app | `greeting`: grin, a two-beat nod that STOPS (no arm — the old wave is gone), then idle breathing | `idle` |
| 2.2 | Ask a question the KB does not cover — *"what is our policy on expensing a taxi"* | **`declining`** the whole time it speaks, and it STAYS declining after: round eyes, narrow mouth, `?` badge, teal tip, no bow. Transcript line "no company guidance covers this — nothing was filed" is grey, **not red** | `declining` |
| 2.3 | Ask a question the KB covers — *"how do I take a screenshot"* | `thinking` → `speaking` → `idle`, with a grey `source:` line | `idle` |
| 2.4 | Say *"my laptop screen is cracked"* (the escalation) | **`declining`** (an offer, nothing raised), held | `declining` |
| 2.5 | Accept the offer, answer the interview, press **Send it** | After filing: **`escalating`** — amber tip, `→` badge, the ticket in hand — held while the reference is on screen | `escalating` |
| 2.6 | Stop the hub, then repeat 2.5's Send | **`error`**: cross eyes, `!` badge, no breathing. The transcript says whether the ticket is UNKNOWN (timeout) or not filed | `error` |
| 2.7 | *"my printer isn't working"* → Approve | `listening` while the card waits (round eyes, head tilt, ear rings) → `accept` on Approve (aperture) → `success` (happy eyes, tick) | `idle` |
| 2.8 | Inject a fault that makes the fix FAIL (`npm.cmd run inject-fault`, pick one the primitive cannot clear) → Approve | **`apologising`** — lowered eyes, bow — NOT `error`. v7: "Do not put error on a failed fix" | `idle` |
| 2.9 | Say *"hello"* | `thinking` → `speaking` → `idle`; no card | `idle` |
| 2.10 | While it speaks any reply | The mouth changes shape with the audio; the rig keeps breathing; nothing else moves |

## 3. Connectivity (D49 / D51 / D233)

The pill under the voice pill is the link's state. Hover it for the basis and the last error.

| # | Do | Expect |
|---|---|---|
| 3.1 | Start with the hub UP | Pill `hub: reachable · last ok <time>` within a few seconds of the window |
| 3.2 | Stop the hub (close its window) and wait | **About a minute**, not instantly: three failures at the retry cadence, then the pill goes red `hub: UNREACHABLE (3 failures)`, a red transcript line *"I've lost my connection to the service desk…"*, and — if the face was idle — `error` |
| 3.3 | While unreachable, say *"my printer isn't working"* | Tier-0 still proposes and the card still works. The turn's states take the face back; the pill stays red |
| 3.4 | While unreachable, ask a question | The fallback reply says the model could not be reached; the pill's failure count goes up **immediately** (a real failed call is evidence, no waiting for the clock) |
| 3.5 | Start the hub again | Within about a minute (backoff, jittered) the pill goes green, a green line *"the service desk is reachable again"*, and an `error` face returns to `idle` |
| 3.6 | Run with `MATIC_PROVIDER=cloud` | Pill reads `hub: standalone (no hub configured)` and never changes |
| 3.7 | Point `MATIC_HUB_URL` at something that answers 200 with HTML (any web server) | Stays `checking` then goes UNREACHABLE: "answered 200 but the body is not the hub's". A captive portal is not a hub (D50) |

## 4. Record what you saw

Append a dated line per row to this file's history in the handover
(`docs/handovers/2026-09-10-claude-code-handover-avatar-integration-built.md` §7), pass or fail.
A fail with a screenshot is worth more than a pass without one.
