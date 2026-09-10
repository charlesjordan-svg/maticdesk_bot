# Claude Code Handover — 2026-09-10 — the avatar is integrated; the endpoint knows whether the hub is there

**Answers** [`2026-09-09-claude-code-handover-avatar-integration.md`](2026-09-09-claude-code-handover-avatar-integration.md).
**Repo root:** `C:\Users\Charles\Downloads\maticdesk_bot`, branch `main`.
**Register:** [`../decisions/DECISION-REGISTER.md`](../decisions/DECISION-REGISTER.md) v2.27, D1–D233, §5.27, **next free D234.**
**Also asked for by Charles, beyond the handover:** a method for the agent reconnecting to the hub. That is §6 and D233.

**Client-side only, as the handover required. `server/` is untouched.** 650 assertions across 13
files pass (`npm.cmd test` from `client/`; was 492 across 11). Nothing here has been watched in the
Electron window by a person — §7 and [`../../client/docs/AVATAR-RENDERER-CHECK.md`](../../client/docs/AVATAR-RENDERER-CHECK.md).

---

## 1. The audit (handover §1), written down before anything was built

**1.1 What the avatar rendered.** A Web Component, `client/src/renderer/vendor/matic-bot-avatar.js`,
built from ~40 absolutely-positioned `<div>`s with CSS gradients and clip-paths — no SVG, no canvas, no
images. Eleven states in a hand-written `cfg()` map: `idle listening thinking speaking greeting
success apologising escalating error accept ingest`. **No `declining`.** Driven by two properties,
`state` and `viseme`, from `renderer.js`'s `setState()` and from `TTSVisemeDriver`. The delivery was a
**replacement**, not an adaptation: same driving contract, different renderer.

**1.2 What a decline showed.** `renderer.js`'s `res.answer` branch with `answered: false`:
`thinking` → `speaking` (while the reply was spoken) → `idle`, then a transcript line styled
`sys bad` — **red**. So: not `apologising` (the handover's hypothesis was wrong in its specific form),
but the decline had **no state of its own** and the transcript dressed it as a failure. A correct
behaviour displayed as an error, in text rather than on the face. **This was the functional reason for
the pass and it was real.**

**1.3 Tray icon.** **None exists.** `src/main/main.js` imports `{ app, BrowserWindow, ipcMain,
Menu }` — no `Tray`, no `nativeImage`, no icon asset anywhere under `client/`. The status dot is a
separate piece of work; §8 scopes it.

**Also found, not asked:** three placement errors against v7's own rules were on screen —

| Situation | Was | v7 says | Now |
|---|---|---|---|
| A fix ran and did not help (`exec.ok === false`) | `error` | "Do not put error on a failed fix — that is apologising" | `apologising` |
| The escalation OFFER (`res.escalation`) | `escalating` | escalating "follows declining or apologising rather than replacing either"; it is the ticket that exists | `declining`, held while the offer is open |
| ACCESS_DENIED from the unprivileged half (`exec.needsBroker`) | `escalating` | a technical fault on our side, no ticket raised | `error` |
| Ticket filed with a reference (`filed.ok`) | no state change | the confirmation "must carry its number" | `escalating`, held |
| Ticket filing failed / timed out | no state change | our fault | `error`, held |

And one small defect: `TTSVisemeDriver.speak()` sets `avatar.state = "speaking"` directly, bypassing
`setState()`, so the label under the face never read `speaking` during a real spoken reply. The label
now follows the element's `statechange` event.

---

## 2. What was built

All under `client/`. **Verbatim delivery** (`cmp` identical to the zip): `src/renderer/avatar/matic-avatar.svg`,
`matic-avatar.css`, `matic-avatar.manifest.json`, `matic-avatar-harness.html`, and the README as
`DELIVERY-README.md`.

| File | What |
|---|---|
| `src/renderer/avatar/matic-avatar-element.js` | `<matic-avatar>`. Shadow DOM over the SVG chassis. Keeps `state`/`viseme`; adds `size` (crop bands and floors from the manifest) and `theme`. Enforces `minSize`, `degradedBelow`, `parked`, `belowFloor` with a console warning and a fallback to `idle`, never a "nearest" state. Writes `data-shape` on `.mav-mouth` + `data-visemes` for speech. Greeting's nod resolves to idle after the manifest's 1500 ms × 2. Emits `statechange` |
| `src/renderer/avatar/avatar-model.js` | The manifest, imported as a JSON module. `STATES`, `stateSpec`, `cropFor`, `renderDecision`, `trayReadFor`, `resolvesAfterMs`, `manifestMouthFor`. **No state literals** beyond the manifest's own default. Runs in Node for the tests |
| `src/renderer/avatar/viseme-map.js` | The debugged phoneme table, moved verbatim from the old element, plus five additions from §3. Drives the mouth. `compareWithManifest()` for the comparison script |
| `src/renderer/avatar/matic-avatar.assets.js` | **GENERATED** from the SVG + CSS by `scripts/build-avatar-assets.mjs` (`npm.cmd run avatar:build`). Exists because a `file://` page cannot `fetch()` its own directory in Chromium. `test/avatar.test.mjs` fails while it is stale |
| `src/renderer/avatar/avatar-check.html` | The element at every state × 200/160/96/64/44/32/24 px, a speech row on real IPA, theme toggle, the element's warnings. **Acceptance item 1's "side by side" with the harness** |
| `scripts/compare-phoneme-maps.mjs` | §3. Real strings → real Piper → both tables per phoneme → verdict (`npm.cmd run avatar:compare`) |
| `src/agent/hub-link.js` | D233, §6 |
| `test/avatar.test.mjs` (118), `test/hub-link.test.mjs` (40) | New |
| `docs/AVATAR-RENDERER-CHECK.md` | Charles's click-through |
| Removed | `src/renderer/vendor/matic-bot-avatar.js` |

**Acceptance item 5 ("read from the manifest, not transcribed") is demonstrable two ways:** edit any
`notes` string in the manifest and reload `avatar-check.html` — the header line quotes `declining`'s
note straight from the JSON; and `test/avatar.test.mjs` §1 fails if a state name appears as a
literal in the model or the element.

---

## 3. The phoneme comparison (handover §3) — measured, and it changed two things

`npm.cmd run avatar:compare`, 2026-09-10, `en_US-amy-low` at 16 kHz, six real product strings (the
boot greeting, `escalationReply()`'s offer, a ticket confirmation with `MD-1042`, a decline as the hub
phrases one, a representative capability answer, a consonant-heavy line). **732 phonemes, 47 distinct.**

**Finding 1 — the manifest's table does not describe what Piper emits.** It is eSpeak-ng ASCII
(`T D S Z tS dZ N V 3: @ @U oU`). `piper_worker.py` reads the alignments the Python `PiperVoice`
returns, and those are **IPA**: `θ ð ʃ ʒ tʃ dʒ ŋ ʌ ɜ ə ʊ ɪ ɛ æ ɹ ɐ ɾ ɡ ɑ ɔ ᵻ ʲ`. The manifest's table knew
**none** of them: 27 distinct, **428 of 732 occurrences (58%)** would have resolved to `closed`.
Where both tables know a key (23 ASCII keys) they agree on every one. **Verdict: keep the existing
table.** The handover's expectation ("the manifest's is very likely the correct choice") was wrong
for the reason the handover itself gave for being careful — the two documents describe two different
emitters, and the client uses the one the manifest did not model. The switch is not made, and
CLAUDE.md now says any change to which table drives the mouth re-runs this script first.

**Finding 2 — the existing table was wrong too, and nobody could have read it out.** It carried
`ɜː`, `iː`, `uː`, `ɑː`, `aɪ`, `aʊ`, `oʊ`, `ɔɪ` as single keys. **Piper never emits them.** A length
mark (`ː`) is its own alignment row, the worker merges its duration into the preceding phoneme, and
the key that reaches the table is the **bare** vowel; a diphthong arrives as two rows (`a ɪ`, `o ʊ`).
So bare `ɜ` ("w**or**k", "p**er**son", "th**ir**ty"), `ɚ` ("spool**er**", "adapt**er**"), `ɔ`, `ᵻ`
("r**e**start", "r**e**new") and the glide `ʲ` were falling to `closed` — 17 occurrences (2.3%), each
a closed mouth through a stressed syllable, the exact defect the worker's `MODIFIERS` merge was
written to remove. **Added** (`viseme-map.js`, with the reason in the comment): `ɜ ɚ` → roundSmall,
`ɔ` → roundLarge, `ᵻ ʲ` → wideFlat. After the additions the only keys unknown to the driving table are
boundaries and punctuation (` ^ $ . , ?`), which correctly close the mouth. The combined-character
entries are kept — they cost nothing and a hand-authored timeline would use them.

**Both tables are flat lookups built once at load** (the manifest's inverted in `avatar-model.js`;
the existing one in `viseme-map.js`), per the handover's request and the manifest's own comment.

---

## 4. Naming alias (handover §4)

Already in the manifest as delivered: `$comment_shapes` says *"'happy' is v7's 'arc-up'. The shape
id is 'happy'; use that in code and reserve 'arc-up' for prose."* Nothing added;
`test/avatar.test.mjs` asserts the line is there.

---

## 5. What was seen on a screen — and what was not

The element was driven in the Claude Code browser pane from `avatar-check.html` and the harness,
both served over `http://127.0.0.1:8765` from `client/src/renderer`. **This is a browser, not the
Electron window.** The window has the same element, the same manifest and the same generated module,
but nobody has watched it through a conversation — §7.

**5.1 Every state at every size, light and dark.** All twelve rows render from `data-state` alone.
`declining` at 200 and at 44: round eyes, narrow mouth, teal tip; at 44 the `?` badge is a sliver and
the face is still visibly neither `idle` (oval + smile) nor `apologising` (lowered eyes, bow).
`escalating` 200/160/96 show the ticket and `→`; **64/44/32 show `idle` with a red "refused → idle"
caption** and the warning names the 96px floor. `accept` renders at 96 and 64 (one "legible but weak"
warning at 64) and is refused at 44/32 (`minSize: 64`). `ingest` is refused everywhere. The 24px
column renders nothing. Dark panel: the field disappears, the shell lightens, state colours unchanged.

**5.2 A defect found by looking, not by the tests.** The first render showed a **200px bust in the
24px column**: the below-the-floor branch set the `hidden` attribute on the `<svg>`, and the UA
stylesheet gives `[hidden]` no effect on an SVG element. Fixed (`style.display`), and recorded in
CLAUDE.md's traps, because it is the class of wrong answer the tests cannot see.

**5.3 Two defects in the delivered harness, recorded rather than fixed** (its own README says to edit
sources and regenerate; no generator was delivered, and the handover said never to hand-edit the
copies):

- **"Dark panel" does not knock the field out.** The toggle puts `matic-avatar-theme-dark` on the
  `.panel`/`.wrap` ancestors; `.mav` declares the light tokens **on the svg**, and a custom property
  declared on an element beats one inherited from an ancestor. Seen: dark ground, light-blue field
  still present, shell unchanged. The element puts the class on the svg and the swap works (5.1).
  The CSS is fine; the harness's application of it is not.
- **"Reduced motion" does not reach the tray strip.** The harness's `.force-reduced` rules cover the
  rigs, tip and talk mouth; the tray's static vocabulary (hollow / solid / haloed / struck) lives only
  under the real `@media (prefers-reduced-motion: reduce)`. With Reduced motion **and** Greyscale on,
  the four dots in both strips were **identical filled circles** — which is exactly the failure the
  manifest's `reducedMotion.tray.acceptanceTest` describes, produced by the toggle rather than the
  fallback. The fallback itself is untested from the harness; it needs the OS setting
  (Settings → Accessibility → Visual effects → Animation effects off) and a re-open. **Acceptance
  item 7 is therefore verified for the avatar (rigs still, dots and rings static and visible) and
  NOT verified for the tray** — and there is no tray in the client, so nothing depends on it today.

Also: the harness does **not** inline the SVG byte-for-byte — the embedded C2PA `<metadata>` blob
differs from `matic-avatar.svg`'s (different instance ids). The CSS is inlined verbatim. And the
manifest says "the reference implementation logs a console warning" for `escalating` under 96px; the
harness shows a caption and logs nothing. The element logs.

**5.4 Speech.** The check page's speech row cycles real IPA through `viseme` at ~9/s at 200/96/64/44:
the mouth swaps, the rig keeps breathing, nothing else moves, `θ → narrow`, `ʃ → wideFlat`,
`ɜː → roundSmall` (the combined key, from the fixture; the bare `ɜ` resolves the same since §3).

---

## 6. Connectivity and the reconnect question (D233)

Charles asked: *"come up with a method for ensuring the agent reconnects to the hub, either by the hub
sending a signal to connect to previously attached agents. Come up with the optimal method."*

**The optimal method is the one the register already chose, built.** The hub **cannot** signal
endpoints — they sit behind corporate NAT, VPNs and host firewalls with no inbound path — and it
**need not**: D114 rules out a persistent connection in v1 (ALB idle timeouts, per-task connection
ceilings, reconnect storms), so the hub holds **no list of attached agents** to signal. Every endpoint
comes to the hub on its own jittered cadence; a hub that restarts is rediscovered by every endpoint
within one interval, with nothing to replay and nobody to notify. **The hub's "signal" is the
heartbeat response**: a server-directed interval (back the fleet off in an incident, tighten it when
an alert is pending), policy and catalog versions (D50, D114), later a directive to re-enrol. One
channel, client-initiated, response-carried. This is how Intune, every EDR agent and every fleet tool
of the class does it, and D50/D114 had already picked it.

**Built (client half), `client/src/agent/hub-link.js`:**

| Rule | Value | Source |
|---|---|---|
| States | `standalone` (no URL) · `checking` (startup) · `reachable` · `unreachable` | D49 |
| Probe | `GET /v1/health`, 5 s timeout, **shape-checked**: `ok: true` and `hub: "matic-desk-hub"`. A 200 with HTML or another JSON shape is a failure — a captive portal is not a hub | D50 |
| Evidence | Also every real request: `HubClient` calls `link.noteSuccess()` when the hub answered (any status) and `link.noteFailure()` on a transport failure, which brings the next probe forward to now | D51 |
| Enter unreachable | 3 consecutive failures | D51, D132 (N = 3) |
| Leave unreachable | **one** success, and nothing else — never a timer | D51 |
| Cadence, reachable | 60 s ± 15 s | D132 |
| Cadence, after a failure | ~20 s, so three failures declare in about a minute rather than three (faster to tell the user; still absorbs a VPN blip) | deviation from D132's "~3 minutes", proposed |
| Cadence, unreachable | full-jitter exponential backoff from 5 s, capped at the interval — a fleet does not hit a recovering hub in lockstep, and recovery is noticed within about one interval | D106/D114 |
| Server directive | `heartbeat.intervalMs` in the health body is honoured, clamped to 5 s … 10 min, only from a response whose shape passed | forward-compatible; the hub does not send it yet |
| Surface | pill under the voice pill; a transcript line on every loss ("I've lost my connection to the service desk…") and recovery; the `error` face while idle, back to `idle` on recovery; the next turn's own states always win | D51 "stated to the user", D120, v7 `error` copy |
| Persistent connection | none | D114 |
| Authentication | **none.** `status().authenticated === false` and the pill's tooltip says "identified by shape, NOT device-authenticated (D50 needs D61)" | D231 |

`test/hub-link.test.mjs` drives all of it with injected fetch and timers: hysteresis at exactly the
third failure, captive-portal 200s, one-success recovery, real-call evidence, bounded directives,
jitter range, coalesced probes, stop.

**Not built (server half), proposed in D233:** `POST /v1/heartbeat` taking the device key id from
enrollment (KNOWN, not PROVEN, until D61), returning `{ policyVersion, catalogVersion, heartbeat:
{ intervalMs } }` and, later, directives. It becomes D50's *authenticated* heartbeat when the device
assertion exists. Until then the client probes `/v1/health`, which already exists, and the seam is one
URL and one field name. **Also not built:** anything that persists the enrolled identity on the client
— `POST /v1/enroll` has no client caller at all (audit), so "previously attached" is a hub-side record
today and nothing the client remembers. That is B3's client half, and it is where re-enrolment on a
revoked device would go.

---

## 7. Acceptance (handover §7), honestly

| # | Criterion | Status |
|---|---|---|
| 1 | Harness opens from disk, offline; matches the app side by side, all twelve states | **Harness opens; the element matches it in a browser** (§5.1). The app's window: not watched — Charles, §1 of `AVATAR-RENDERER-CHECK.md` |
| 2 | `declining` is its own state — round eyes, narrow mouth, no bow — visibly not `apologising`, not `idle`, including at 44px | **Pass in a browser** (§5.1). Manifest pairing asserted by test; CSS pairing asserted by test |
| 3 | `escalating` refused below 96 with a console warning | **Pass**, by test (`renderDecision`) and on screen (§5.1) |
| 4 | Mouth shapes swap during speech with nothing else moving, every size, both themes | **Pass in a browser** on the speech row (§5.4). In the app with real audio: not watched |
| 5 | State table read from the manifest, not transcribed | **Pass, two ways** (§2) |
| 6 | Phoneme comparison exists and has run against real speech; agreement → old one gone, or disagreements recorded with which is correct and why | **Run against 732 real phonemes.** Disagreements recorded (§3): the manifest's table is for a different emitter; the existing table stays and gained five entries from the same run |
| 7 | Reduced motion verified through the harness toggle | **Avatar: pass. Tray: the harness toggle cannot verify it** (§5.3); needs the OS setting; no tray exists in the client |
| 8 | `client/` tests pass; lip-sync no worse than before | **650 / 13 pass.** Lip-sync: same table plus five entries that were closing the mouth mid-syllable — measured better, not just no worse. In the app with audio: not watched |

---

## 7a. Charles's first run, the same morning — two defects, fixed

Charles launched the app against a live hub and typed *"hello matic how are you?"*. Screenshot:
the new face rendered, the pill read `hub: reachable · last ok 7:39:45 AM`, the dev log showed
`[hub-link] checking -> reachable` and then `[hub] HTTP 502 ... the model returned no tool call
(finish_reason stop)`, and after a long wait the avatar said *"I could not reach the model…"*.
Charles read that as "doesn't see the hub". It did see the hub — the pill and the log say so — and
two things were wrong on the client:

1. **The greeting left the machine.** `residue("hello matic how are you")` was `"matic"` — one
   word, over the social threshold — so D198's defect returned through the residue test rather than
   the ordering: a greeting cost a hub call, a cold model load, and a 502 when the model answered in
   prose. Fix: `classify.js` treats the assistant's own name (`matic`, `matic desk`) as a vocative and
   strips it before the residue test; `"hey matic, my printer is broken"` is still an action and
   `"my desk phone is dead"` keeps its desk. Six new cases in `test/classify.test.mjs`.
2. **The fallback sentence was untrue.** `agent.js`'s last resort said *"I could not reach the
   model"* for every non-ok result, including a 502 — where the hub answered and the model behind it
   did not. `HubClient` already keeps that distinction (`reason: "connection"` only on transport
   failure); the sentence now does too: *"I could not reach the service desk…"* versus *"The service
   desk answered, but its model did not give me anything I can act on…"*. The renderer shows
   `apologising` there instead of `idle`. `docs/DEMO-DAY.md`'s recovery row is split the same way.

**The wait itself was the hub waiting on its model** (§5.22a: a cold `mistral-small:24b` load is
15 s with the GPU free and minutes with a game holding VRAM), and the client is right to wait —
D218 is why it no longer gives up first. What was wrong is that a greeting should never have started
that clock.

## 8. The tray status dot — scoped, not built (handover §6)

There is no Electron `Tray`. Building one is: `new Tray(nativeImage)` in `main.js`; a 16/24px icon
renderer for the four reads (the manifest's `trayReads` and `reducedMotion.tray` — motion first, static
form as the fallback), which in Electron means **rasterising to a PNG per read and per frame**, since
a tray icon is a bitmap and cannot run CSS; a mapping from the avatar's state to a read
(`trayReadFor()` is already exported from the manifest); a rule for when the tray follows the face
(v7: transient states return the tray to `resting`); the OS-level reduced-motion read
(`nativeTheme` does not expose it; `systemPreferences` on Windows needs a registry read of
`HKCU\Control Panel\Desktop\WindowMetrics\MinAnimate` or the accessibility API). Roughly a day, and it
wants its own manifest acceptance test (four reads at 16px, greyscale, no motion) run on a real
taskbar. **Named in `avatar-model.js` (`trayReadFor`) so the day it exists it reads the manifest.**

---

## 9. Sequencing — what the previous handover said comes next, still true

**Session outcomes (D89/D90/D188)** — still unbuilt; three of the review queue's four feeds and every
deflection number need it; it needs a client turn ("did that fix it?"), and that turn now has a face
to use (`success` for yes, `apologising` for no — never `error`, never a decline). Both are
client-side; do it next. Then the **server half of D233** (§6), which is small and unblocks the
authenticated heartbeat the day D61 lands. The **tray** (§8) after that.

---

## 10. Honesty ledger

- **Nothing in this pass has been seen in the Electron window by a person.** The element was driven in
  a browser from a check page and the harness; the app was not launched. The check page loads the
  same modules the app does, over `http` rather than `file://` — one difference that matters:
  JSON module import works on both, but `avatar-check.html` cannot prove `index.html`'s `file://`
  load, only reasoning can (the page already loads ES modules from `file://`, and a JSON module is
  the same mechanism). §1 of `AVATAR-RENDERER-CHECK.md` is the first thing to run.
- **The connectivity states have been driven only by injected fetch and timers.** No real hub was
  stopped and started against a running agent. §3 of the check doc does that.
- **The renderer changes are read, not run.** `renderer.js` has no test and cannot have one here. The
  branches touched are the decline, the escalation offer, the ticket outcomes, the fix outcomes and
  the new hub pill; every one is a one-line state change plus a held end state, and the `statechange`
  listener is new code that a typo would break silently — the label would stop updating.
- **The five phoneme additions are from six strings through one voice.** A different voice or a
  British model would emit other bare symbols (`əʊ`, `ɒ`); the comparison script is kept so the next
  voice runs it before shipping.
- **D233's timing values are proposed**, like D132's they derive from; the 20 s failure retry is a
  deviation from D132's "~3 minutes" and is recorded as one. D115 stands — the interval is a capacity
  parameter, and 5,000 endpoints × this cadence has not been sized.
- **`HubLink` is not authentication and the code says so in three places.** Anyone who reads
  "reachable" as "joined" has been told not to.
- **The harness findings (§5.3) are about the harness, not the CSS or the SVG.** The delivery's
  visual work is sound; two of its self-test toggles do not test what they say. Claude Design should
  hear that, with the cause (class placement; `@media`-only rules).
- **The `placement.do` line "Crop to the head below 64px" disagrees with the `crop` table**, which
  lists 64 under the head crop and 96 as the smallest full bust. The code follows the crop table and
  the delivered harness; recorded here rather than resolved.
- **`server/` was not touched and its tests were not re-run**, because no file under it changed.
