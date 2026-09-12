# Claude Code Handover — 2026-09-11 — the scope language and the greeting system, BUILT

**Answers** `docs/handovers/2026-09-11-claude-code-handover-greeting-scope-and-voice.md` (the Cowork
session's brief, its addendum, and its §15 task).
**Repo:** `C:\Users\Charles\Downloads\maticdesk_bot`, branch `main`, commits `a2ee9b1` and `962300f`.
**Register:** §5.44 (D259–D261), §5.45 (D262), OPEN-10, one new `[VERIFY]` in §10.2.
**Tests:** 1808 client assertions across 22 files, up from 1739/21. Green.

---

## 0. What was asked, and what is done

The brief's ordered work list (§14), with what happened to each item.

| # | Item | Outcome |
|---|---|---|
| 1 | **§5 — the voice decision** | **NOT DONE. It is Charles's, it is still open, and it blocks nothing else.** §6 below. |
| 2 | Fix bugs 15 + 16 together | **Done.** D262. Both were real; the second is why the first could not be fixed alone. |
| 3 | ~~`classify()` on a request sentence~~ | Withdrawn by the brief itself. **Re-checked at source anyway; the withdrawal is correct.** |
| 4 | §11.1 — decide the two traps | **Done. Trap 1 as recommended; trap 2 went further than recommended and deleted two thirds of the feature.** §3. |
| 5 | Persona edits, §15 first | **Done**, in that order, in two commits. |
| 6 | Wire A/B/C selection | **Partly, and deliberately.** Only A (offline) ships. §3 is the argument and the evidence. |
| 7 | `npm.cmd test` | **Done**, and the copy rules were re-derived rather than trusted. |
| 8 | Audio per §4A | **Not started. Gated on item 1.** |

---

## 1. The scope language (D259–D261) — `a2ee9b1`

Five strings in `persona.json`, exactly as §15.4 specified. `capability.boundary` untouched;
`howareyou[2]` untouched; **`classify.js` untouched**.

**§15.1 re-checked at source, and it holds.** `classify.js:172`'s `offtopic` is an allowlist of
thirteen complete phrases. "What's the cafeteria menu", "how do I book leave" and "I need a new
monitor" match none of them and fall through to the KB. No classifier change was needed and none
was made.

**Two things the brief did not know, both in register §5.44c.**

1. **`persona.role` is dead data.** Nothing in `client/src` or `client/test` reads it. The string was
   still fixed — a stale scope statement in a data file is a trap for the next reader — but it
   changed no behaviour, and the persona file's own `$comment` implies it is read when it is not.
2. **`prompt.js:22` still says "an IT support assistant", and was left alone on purpose.** That is
   the shared system prompt, and it is the model's scope statement, so under D259 it is stale in
   exactly the way `social.offtopic` was. `prompt.js`'s own header is the reason not to touch it
   casually: *"If the cloud provider and a local one word the system prompt differently, the bake-off
   measures the wording and reports it as a property of the model."* **Changing the first line of the
   system prompt moves the §4 bake-off baseline** — a cost the scope change should pay knowingly
   rather than acquire as a side effect of a copy fix. **Decision for whoever owns the bake-off:**
   change it now and re-baseline, or change it when the bake-off next runs. The second-order risk if
   it is left indefinitely is that the model treats a non-machine question as out of scope rather
   than calling `escalate`, which is the route to the KB. Not observed; reasoning. Recorded in §10.2.

**OPEN-10 is the thing §15.5 exposed and did not solve.** With a KB that may hold anything, *"not in
the KB"* and *"not my remit"* have stopped being the same thing. A cafeteria question on a tenant
with no facilities content is not off-topic — it is a **gap record** (D223), which is how the KB
learns what it lacks. They are kept apart today by the narrowness of the allowlist, which is luck
rather than design. **Settle it before anyone widens the allowlist.**

---

## 2. The greeting system (D262) — `962300f`

### 2.1 "Only one greeting ever played" was two bugs, and the second is the interesting one

`renderer.js:1587` spoke `persona.boot[0]` — a hardcoded index, so `persona.boot[1]` had never once
been spoken. **And the rotation helper next door would not have fixed it.** `social.js`'s cursor is
a module-level `Map`; the boot line fires once per process; `pickVariant("boot", …)` therefore
returns `boot[0]` on every launch forever **and passes its test.**

So the cursor is persisted (localStorage, beside the theme), and the new test does not check that
the picker rotates. It checks that **three successive launches, each starting from what the previous
one persisted, say three different things.** That is the shape of the bug and the only shape that
catches it.

`social.js` is untouched. Its in-process cursor is correct for the mid-session hello that actually
uses it, and replacing a working mechanism to fix a path that never used it would be the wrong
repair.

### 2.2 What ships

- **`src/router/greeting.js`** — new, pure, no DOM. Chooses the set, advances the cursor, hands the
  next cursors back. The renderer persists them.
- **`persona.boot`** — three lines, escalation line first (worth 4.4 s at first contact, noise on
  the fifth hello of the day).
- **`persona.bootState.offline`** — two lines. The only degraded set. §3.
- **`persona.social.greeting`** — rewritten: machine-narrow scope out (D261), and **no
  self-introduction**, because the user is already in a conversation and introducing itself is the
  boot line's job.
- **Three of the six written greetings are NOT shipped**, and are recorded verbatim in the persona's
  `$bootComment` so they are one edit away. They offer to take a **request**, and request intake is
  not built. **A test fails on that word in any shipped greeting**, so they cannot arrive by
  accident — and §2's open question (whether `fix / find / request` is inside rule 1's spirit) never
  had to be answered, because the three lines carrying that phrase are the three being held.

---

## 3. The part that went further than the brief — and why

**Trap 2 (D245) was not a risk to manage. It was already happening, and I only saw it by running the
app.**

Four state sets were written from the brief's copy — `offline`, `standalone`, `hubUnreachable`,
neutral — built, and green on 63 headless assertions. I had reasoned trap 2 away on the grounds that
the renderer's loss note only fires on a *transition*, so it cannot collide with a boot line.
**That is true and it is the wrong surface.** The screenshot of the real window, standalone mode:

| Surface | Words |
|---|---|
| the rail | "Working on this machine only — No company guidance or service desk is set up here. That's normal for this machine." |
| the standing band | "ON THIS MACHINE — There's no company guidance or service desk connected here, so I'll stick to what I can check and fix on this machine itself." |
| **the avatar** | **"Hi, I'm Matic. There's no service desk connected to this machine, so it's just me and what I can see here…"** |

`index.html`'s own comment over that band states the rule without needing D245 cited: *"what the
assistant cannot do right now, **said once**, without apology"*, and *"two surfaces describing one
state differently is a shipped defect."* The `hubUnreachable` copy was worse — a near-verbatim
rewording of the band's own sentence, down to "I'll keep trying" against the band's "I'll tell you
as soon as that changes."

**The resolution is D245's own division of labour: the band says what is AVAILABLE; the greeting
says what to DO NEXT.** Take the availability half out of a `standalone` greeting and what is left
*is* the neutral boot set. So `standalone` and `hubUnreachable` use it, `bootSetFor` returns
`neutral` for every hub state **deliberately rather than by omission** (`hubState` stays in the
signature with the reason written at it, because that is where someone will come to change it), and
a test fails if any key but `offline` reappears in `bootState`.

**`offline` survives because it does the one thing no band does: it OFFERS to act.** Three of the
four capabilities are network faults. Two changes fell out of the above: the lines no longer name
the company's guidance or the service desk — the band's words — and name the **network route**
instead, which no other surface states in a sentence. It offers and never proposes (D198); the
user's answer goes down the ordinary turn path, which already reaches `diagnoseOffline()` when no
capability applies and the normal proposal flow when one does.

### 3.1 This partly declines what Charles asked for, and it is his call to reverse

He asked for a greeting that can *"report limited functionality"*. **It is already reported,
permanently, on two surfaces, and they were built that way on purpose.** What I removed is a third,
spoken, differently-worded copy of it.

**The one argument for putting it back**, and it is not nothing: the band and the rail are *shown*,
and the greeting is *spoken*. A user who is listening rather than looking gets the state only if it
is said. D245's text is about two adjacent visible texts, so this case is at its edge rather than
inside it. **If that matters more than the repetition, the copy is in register §5.45b and the
`standalone` / `hubUnreachable` sets are about twenty minutes of work to restore.** I did not make
that call because it trades a shipped-defect rule against an accessibility argument, and that is a
product decision.

---

## 4. Verified in the real window, not only headlessly

Driven the D254 way: `electron . --remote-debugging-port=9223`, `Runtime.evaluate` for the
transcript and the app's own `[greeting]` log line, `Page.captureScreenshot` for the screen.

| Launch | State read | Spoken | Cursor persisted |
|---|---|---|---|
| 1 | `online=yes hub=standalone` | neutral[0] | `{neutral:1}` |
| 2 | same | neutral[1] | `{neutral:2}` |
| 3 | same | neutral[2] | `{neutral:0}` |
| 4 | same | neutral[0] — wrapped | `{neutral:1}` |

**Trap 1 was observed rather than reasoned about.** Against a hub URL with nothing behind it, the
greeting went out at `hub=checking` with its probe already failed once — D51's hysteresis needs
three — so a state-aware greeting read that early would have announced an outage the app had not
established. It claimed nothing, which is the whole of the rule.

**Each set's cursor advances independently**, shown by two offline-state launches leaving the
neutral cursor untouched.

### 4.1 It caught a harness bug wearing the product bug's exact shape — §10.5's class, again

**The second launch spoke the same line as the first.** That is precisely the bug being fixed, and
it was not the bug: **a hard kill loses the localStorage write**, because Chromium flushes it
asynchronously. Established by a separate four-run probe that wrote a marker and read it back across
graceful closes and hard kills, before anything in the product was touched. The harness closes the
window properly now.

**The same measurement is the limitation, stated rather than discovered later (§5.45f):** an unclean
exit — crash, kill, forced logoff — loses that launch's advance and the next launch repeats a
greeting. It is kept in localStorage anyway: the theme already lives there, the failure mode is
hearing one sentence twice, and moving it to disk means a main-process store and an IPC channel for
a rotation cursor. **If the recorded greeting audio ever ships, revisit** — an audible repeat is
more noticeable than a read one.

### 4.2 What was NOT observed in the real app

- **The `offline` set on a real machine with no route.** It needs the adapter disabled, which needs
  elevation and takes this machine off the network. The *selection* mechanism is proven on two of
  the four branches in the real app and on every branch headlessly; `offline` differs only in which
  key `bootSetFor` returns, down the same code path. **Do not round that up to "verified on screen".**
- **Anything heard.** Same standing limit as every other click-through item: a session cannot listen.

---

## 5. Honesty ledger

- **`prompt.js` is still stale under D259** and was left so deliberately. §1, register §10.2.
- **`persona.role` is dead data** — the fix is correct and inert.
- **Three greetings are held back** for a capability that does not exist. The day request intake
  ships, add them to `persona.boot` and delete the assertion that forbids the word.
- **The `offline` greeting has never run on a machine with no route.**
- **No audio ships, and none was rendered for the offline lines**, because §5 is unresolved and a
  "Piper everywhere" answer discards every MP3. The irony the brief noted stands and is worth
  repeating: **the offline greeting is the one that matters most, and a runtime cloud TTS is the one
  thing that could never produce it at the moment it is needed.** Both Piper and a pre-rendered file
  are local; only a cloud call is not.
- **The greeting cursor does not survive an unclean exit.** Measured. §4.1.

---

## 6. The one thing still waiting on Charles — §5, the voice seam

Nothing below was decided by this session, and nothing below is blocked by anything except the
answer. **The whole audio path (brief §4A) is gated on it**, and so is whether the six rendered MP3s
ship at all.

The four options, unchanged from the brief:

| | | Seam | Offline | Note |
|---|---|---|---|---|
| **A** | ElevenLabs everywhere | None | **Breaks it** | Narrower than it sounds — the *voice* could be online-only while reasoning stays local |
| **B** | Piper everywhere, greetings pre-rendered from Piper at build time | None | Yes | Amy is the ceiling; kills the premium intro, but is consistent and free |
| **C** | ElevenLabs greetings + Piper runtime | **Audible every session** | Yes | What the six MP3s implicitly commit to, and the default by inaction |
| **D** | Choose the Piper voice first, re-record greetings in the nearest ElevenLabs voice | Reduced | Yes | The compromise |

Two things this session can add to that table.

1. **The runtime voice is confirmed as `en_US-amy-medium`** — brief §8 item 7 was open on this. It
   is in `client/config.json` as `voices/en_US-amy-medium.onnx`, the file is present, and commit
   `99a116c` (the commit immediately before this work) is *"Speak with en_US-amy-medium: same voice,
   22.05 kHz instead of 16"*. **Resolved.**
2. **If the answer is B, there is now a build-time job worth doing that did not exist before:**
   `persona.boot` and `persona.bootState.offline` are five fixed strings in one data file, so
   pre-rendering them from Piper is a script over a known list rather than a per-line task. If the
   answer is A or D, brief §4A's alignment tooling applies to those same five strings.

Also still open and not this session's to settle: the ElevenLabs commercial terms for shipped
product audio (brief §8 item 6), the ad narrator vs the product voice (brief §6), and **§3.1 above**.

---

*Produced by a Claude Code session on wakanda, 2026-09-11. Two commits, both pushed. The Electron
runs are reproducible: the driver is a scratch script, and its method is the one register §5.37a
records.*
