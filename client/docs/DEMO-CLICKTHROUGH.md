# Demo click-through — hub mode, in demo order

**Who runs this:** Charles. It needs the app on a screen with the hub behind it, and a UAC prompt, so
no automated session can. Same division as `D130-RENDERER-CHECK.md` and for the same reason.
**When:** before the demo on 2026-09-06, once, end to end, in this order.
**How long:** about fifteen minutes.
**Written:** 2026-09-05, from the handover `docs/handovers/2026-09-04-claude-code-handover-demo-prep.md`
Task 3. The strings below are what the code produces as of that date — verified by running
`eval/e2e-ask.mjs` and `eval/e2e-ticket.mjs` against a live hub and a real model, and by evaluating
the social templates against the real catalog. **What none of that can see is the screen**, which
is what this file is for.

**Rule for anything you find:** if it cannot be fixed safely tonight, **write it in §Result and
leave it.** A known defect is survivable in a demo; a half-fixed one is not. Every prior
click-through of this software found defects — two for two — so expect to write something.

---

## Setup

1. Double-click **Matic Desk Hub** (or `tools\launchers\start-hub.cmd`). Wait for `READY`. It has
   already counted the chunks, warmed both models and put one question and one proposal through
   the hub, and it printed how long each took. **Write those two numbers into §Result.**
2. Double-click **Matic Desk Agent** (or `tools\launchers\start-agent.cmd`). Accept UAC.
3. Confirm the app's log (the dev console, or the terminal it launched from) shows
   `[hub] provider "hub" -> http://127.0.0.1:8787` and
   `[ticket] filing enabled -> http://127.0.0.1:8787/v1/ticket`. If the second line instead says
   `filing is NOT available`, stop: the demo's step 6 cannot happen.
4. Have a second window ready in `server\`: `npm.cmd run tickets -- list`. That listing **is the
   queue** — there is no email — and it is how step 6 is proven.

Machine state: leave it clean (`npm.cmd run reset-demo` from `client\`, elevated, **before** you
start — it deletes `audit/audit.jsonl`, so never between using the app and reading a record).

---

## 1. A greeting — no consent card (D198, D212)

Type: **`Hello how are you?`**

| Check | ☐ |
|---|---|
| The avatar answers with a pleasantry and hands the turn back. Expected, verbatim: *"I'm running fine, thanks for asking. What's going on with your machine?"* | ☐ |
| **No consent card appears.** This exact sentence produced a `renew_dhcp` card on 2026-09-03 | ☐ |
| Inspector PROPOSAL panel reads `socialTemplate: "howareyou"`; EXECUTION reads *"nothing executed. This turn never reached the consent path (D198)."* | ☐ |
| The hub window shows **no** new `[turn]` or `[ask]` line — no model was called | ☐ |

Also try a bare **`hi`** (was misclassified as an action on 2026-09-04, fixed the same day — §5.19a).
Expected: *"Hello. I'm here to help with anything wrong on this machine — tell me what you're seeing
and I'll take a look."*

## 2. "What can you do?" — record the answer verbatim

Type: **`What can you do?`**

The answer is **generated from the catalog** (`broker.listCapabilities()`), not written by hand.
Against the catalog as committed on 2026-09-05 it must be, word for word:

> On this machine I can restart a Windows service; flush the DNS resolver cache; release and renew
> the DHCP lease; and disable and re-enable a network adapter. I always show you exactly what I'm
> about to do and wait for you to approve it — nothing happens until you do. One of those — disable
> and re-enable a network adapter — you'll notice happen, so I'll say so before asking. Anything
> beyond that list I can't do myself. I can look for company guidance on it, or hand it to IT with
> what I've already checked.

| Check | ☐ |
|---|---|
| **Write down what the avatar actually said**, in §Result, even if it matches | ☐ |
| The four abilities named are exactly the four `id`s in `src/broker/catalog.json` (`restart_service`, `flush_dns`, `renew_dhcp`, `reset_adapter`) — check by eye | ☐ |
| The one called out as noticeable is the only R2 (`reset_adapter`, tier label "Disruptive") | ☐ |
| The spoken version is intelligible — the semicolons exist because three of the titles contain "and" | ☐ |
| No consent card | ☐ |

## 3. An answered question — citation on its own line, NOT spoken (D211, H5)

Type: **`How do I take a screenshot?`**

Covered by the `keyboard-shortcuts-windows` article (platform `windows` — this is also the check
that the platform seam fixed in §5.18a is still fixed: if this declines, the endpoint is sending no
platform again).

| Check | ☐ |
|---|---|
| The avatar gives a short answer (Win+Shift+S or PrtScn — wording varies run to run) | ☐ |
| A **separate** grey system line reads `source: keyboard-shortcuts-windows` | ☐ |
| **The source line was not spoken.** Listen. The avatar must not say "according to" or the article id | ☐ |
| PROPOSAL panel: `answeredFromKnowledgeBase: true`, `citedArticleIds: ["keyboard-shortcuts-windows"]`, `retrieval.rerankerPresent: false` | ☐ |
| EXECUTION panel: *"nothing executed — this was a question, not an action."* | ☐ |
| How long from Enter to the first spoken word (stopwatch): ______ s. Warm, measured 2026-09-05: 4.6–7.7 s per question after the first | ☐ |

A second covered question if wanted: **`Why does my wireless mouse keep disconnecting?`** →
`source: bluetooth-peripheral-disconnects`.

## 4. A declined question — reads as an answer, not a failure, and says nothing was filed (D205)

Type: **`How do I request a payroll adjustment for last month?`**

| Check | ☐ |
|---|---|
| The avatar says, in substance, that it has no company guidance and can raise a ticket. Observed 2026-09-05: *"I do not have company guidance covering this. I can raise a ticket for you."* | ☐ |
| A red system line reads: *"no company guidance covers this — nothing was filed, and there is no ticketing integration in this build"* | ☐ |
| PROPOSAL panel: `answeredFromKnowledgeBase: false`, `citedArticleIds: []` | ☐ |
| **No consent card.** A declined question must not fall through to the proposal path | ☐ |
| It does not look like an error: no stack trace, no "could not reach", the avatar is not in an error pose | ☐ |

**Known wording defect, record it, do not fix tonight:** the avatar's decline says *"I can raise a
ticket for you"* but **the question path arms no ticket offer** — the intake is only armed by an
escalation from `/v1/turn`. If the user answers **"yes please"** here it is treated as a new problem
(tier-0 finds nothing, the hub is asked, it escalates or proposes). Note what actually happens in
§Result. The red system line above is the correct half; the spoken offer is the model's phrasing and
it over-promises. This is the same class as the D212/D213 "generated promise" finding in §5.20a.

## 5. A problem that reaches a proposal and a consent card

Inject: `npm.cmd run inject-fault -- -Fault printer` (elevated). Type: **`my printer isn't working`**

| Check | ☐ |
|---|---|
| Tier-0 proposes `restart_service(spooler)` — `source: tier0`, *"no cloud call made"*. The hub window shows **no** new line | ☐ |
| The consent card appears; open **"What is this, and why?"**; the four explain fields are present | ☐ |
| Approve; the spooler goes STOPPED → RUNNING; EXECUTION panel shows success | ☐ |

If the machine is clean (no fault injected), tier-0 has nothing and the sentence goes to the hub,
which on 2026-09-05 answered `restart_service` in ~3 s with `source: hub`. Either is a pass; note
which one you saw. **D130 §2 (field-for-field against `consentRendered`) already passed on
2026-09-03 — you do not need to repeat it, but `npm.cmd run show-consent` is there if you want to.**

## 6. Escalation → offer → intake → REVIEW CARD → filed — the card has never been rendered

**This is the step that matters.** `eval/e2e-ticket.mjs` approves the draft in code. Nobody has
seen the card. Reset first so the machine is clean and nothing in tier-0 fires.

Type: **`the screen on my laptop is cracked right across the bottom`**

| Check | ☐ |
|---|---|
| The avatar's reply is an **offer ending in a question**, first person, about the user's problem. Observed: *"I can't fix this one from here — it needs desktop support. I can open a ticket for you and include what I've already checked. Would you like me to?"* | ☐ |
| **It does not say "The user reports…"** — D214: the case note is never spoken | ☐ |
| EXECUTION panel: *"nothing executed — this is an escalation, not a machine change. Nothing has been SENT either: the offer is waiting for an answer."* | ☐ |
| There is **no** red *"nothing was filed — there is no ITSM integration"* line (that line is for `canFile: false` only) | ☐ |
| Stopwatch, Enter to first word: ______ s. Warm, measured 2026-09-05: 2.8–3.6 s (12.8 s if the proposal prefix was cold — the hub launcher warms it) | ☐ |

Type: **`yes please`**

On a machine with no saved profile (`%APPDATA%\matic-desk-demo\profile.json` did not exist on
2026-09-05) the interview asks **four** questions, one per turn, in this order. Answer each:

| Question (verbatim from `src/profile/profile.js`) | Your answer | Asked? |
|---|---|---|
| *"What is your first name?"* | | ☐ |
| *"And your last name?"* | | ☐ |
| *"Where are you based? A building, floor or office is enough — it tells IT where to come."* | | ☐ |
| (contact — how IT should reach you) | | ☐ |

| Check | ☐ |
|---|---|
| Each question is spoken by the avatar and **no card and no proposal** appears between them | ☐ |
| PROPOSAL panel during the interview: `ticketIntake: "collecting"` with the field name | ☐ |
| After the last answer the avatar says the draft is ready — observed: *"Here's the ticket I'd open. Have a look and change anything that's wrong — nothing is sent until you submit it."* | ☐ |

**The review card.** Compare it against the PROPOSAL panel's `ticketDraft` object — the card must
show exactly those values.

| On the card | Editable? | Matches `ticketDraft`? |
|---|---|---|
| Title *"Review before sending"*, lede *"This is exactly what will be sent. Nothing leaves this machine until you press Send."* | — | ☐ |
| First name | editable | ☐ |
| Last name | editable | ☐ |
| Location | editable | ☐ |
| Contact | editable | ☐ |
| OS account — `<your Windows username>  (self-asserted — not authenticated)` | **fixed** | ☐ |
| Machine — this computer's name | **fixed** | ☐ |
| Problem — your sentence, verbatim | editable (multiline) | ☐ |
| Category — `hardware` (or what the model chose) | **fixed** | ☐ |
| Goes to — `desktop support` (underscore removed) or *"unrouted — IT will decide"* | **fixed** | ☐ |
| Case note — the model's third-person note. **Shown, never spoken** | **fixed** | ☐ |
| Already checked — present only if the model filled `whatWasChecked` | **fixed** | ☐ |
| Caveat, verbatim: *"This is stored on the hub for IT to pick up. No email is sent in this build, so nobody is alerted automatically."* | — | ☐ |
| Two buttons: **Send it** and **Cancel** | — | ☐ |

**Edit before sending — required.** Change the **Location** to something else (add a desk number).
Then press **Send it**.

| Check | ☐ |
|---|---|
| The avatar says: *"That's filed. Your reference is MD-10xx — quote that if you follow it up."* Reference: ______ | ☐ |
| A grey system line: *"MD-10xx is stored for IT to pick up. No email was sent — this build has no outbound notification."* | ☐ |
| EXECUTION panel shows `reference`, `ticketId`, `notified: false`, `notifiedWhy` | ☐ |
| In the server window: `npm.cmd run tickets -- show MD-10xx` — **the location is the EDITED one**, the reporter is marked self-asserted, the description is your sentence | ☐ |
| `npm.cmd run tickets -- list` prints *"NOBODY HAS BEEN EMAILED"* | ☐ |
| `client\audit\egress.jsonl` has `ticket.offered`, `ticket.submitted` (with the edited location), `ticket.filed` | ☐ |
| The edited profile was saved: `%APPDATA%\matic-desk-demo\profile.json` now has your four fields | ☐ |

**Then run step 6 a second time** with a different sentence (e.g. *"my desk phone has no dial
tone"*). With a complete profile it must ask **nothing** and go straight to the card. Observed
2026-09-05 (headless): it did. Press **Cancel** this time and check the grey line *"cancelled —
nothing left this machine"* and that `tickets -- list` did not grow.

## 7. The awkward one — an unrecognised reply to the offer is a new problem (D216)

Type: **`my monitor has a dead pixel in the corner`** → an offer. Then, instead of yes or no, type:
**`my printer isn't working`**

| Check | ☐ |
|---|---|
| The printer sentence is handled as a **printer problem** (tier-0 `restart_service` proposal, or the hub's) — **not** swallowed as a malformed yes, and no ticket question is asked | ☐ |
| No ticket was filed (`tickets -- list` unchanged) | ☐ |
| The earlier offer is simply gone; nothing refers back to the monitor | ☐ |

Also try declining: offer → **`no thanks`** → *"No problem — I haven't opened anything, and nothing
has left this machine. Tell me if you change your mind."* PROPOSAL panel: `ticketIntake: "cancelled"`.

---

## Result

**Date run:** ____________ **Build / commit:** ____________ **Run by:** Charles
**Hub launcher numbers:** `/v1/ask` warm turn ______ s; `/v1/turn` warm turn ______ s; model load ______ s

**Step 2, verbatim as spoken:**

> 

**Step 4, what "yes please" did after a decline:**

> 

**Defects found (cannot fix tonight — record and leave):**

-

**Verdict:**
