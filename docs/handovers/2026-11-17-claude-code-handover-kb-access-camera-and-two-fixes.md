# Claude Code handover — the knowledge base, the camera rule, and two loose ends

**Date:** 2026-11-17
**From:** a Cowork session, from the working tree, the live hub database and the Nuance docs.
**Branch:** `v2-nuance-persona` at `517bb98`, clean, in sync with origin. Register at **D323**;
next free is **D324** — confirm against the register's own header and fix its next-free line in the
same pass.
**Read first:** `CLAUDE.md`, `PROJECT_START_HERE.md`, and
`2026-11-16-v2-functional-analysis-persona-optimization.md` (§1 and §2.1 are the contract this
handover extends).

Four pieces of work, in the order I would do them. §1 is a decision of Charles's that needs
enforcing. §2 is the feature. §3 and §4 are loose ends, one of which is quietly breaking tickets.

---

## 1. The camera — Charles's rule, and it needs pinning

### 1.1 The decision

**Charles, 2026-11-17: *"Camera only comes on when user clicks talk face to face."***

This is not a reversal of D323. It is the **invariant underneath it**, stated so it can be enforced:

> The camera is on only as a direct consequence of the user clicking **Talk face to face**. No
> session event, no timer, no message from the service, and no config default reached any other way
> may turn it on.

Take **D324** for it.

### 1.2 Today it is true, and nothing makes it stay true

Read today. The behaviour is already correct:

| | Where |
|---|---|
| A session opens only on the user's summon, and only with a visible window | `main.js:594` |
| The camera goes on at open when `cameraAllowed && startWithCamera && windowVisible()` | `main.js:618` |
| The user's own toggle is the only other way on | `main.js:661–665` |
| Turning it on is refused while the window is hidden (D293 parity) | `main.js:662` |
| Hiding the window ends the whole session, so the camera goes with it | `main.js:275–277` |
| `persona.video.on` / `.off` are written at both edges | `main.js:620, 663, 665` |

**So why change anything?** Because the microphone has `mic-policy.js` — a pure module, four
numbered rules, a test that *counts the places the unmute command is written*, and a header that
says microphone defaults are off-limits without Charles. **The camera has none of that.** Its
policy is five inline conditions in an 855-line `main.js`, and `startWithCamera` is a config boolean
any future pass can read from anywhere.

The microphone got that treatment for a stated reason — a third party receives the stream and no
consent card covers it. **Every word of that reason applies to the camera, and more so:** the
service runs an **age check** on what it sees and can end the session on it, and whether the
picture is recorded is not documented anywhere.

### 1.3 What to build

Give the camera what the microphone has. Either extend `mic-policy.js` or add
`client/src/nuance/camera-policy.js` beside it — pure, importing nothing, reading no clock.

**The rules, to be written as rules and tested as rules:**

1. **OFF unless the user asked.** A session opens with the camera off unless this session was
   started by the user's **Talk face to face** gesture *and* the camera is allowed and the window is
   visible. `cameraAllowed` is the hub's permission; it is not a reason.
2. **ONLY THE USER TURNS IT ON.** One place in the codebase may set `cameraOn = true`, and the test
   counts it — exactly as `mic-policy.js` counts the unmute command. Not a session event, not a
   retry, not a reconnect, not the service asking.
3. **NO VISIBLE WINDOW, NO CAMERA**, in both directions — refused on, and off if the window goes.
   Today this holds only because hiding ends the session; make it hold on its own, so it survives a
   future change that lets a session outlive a hidden window.
4. **EVERY STRETCH OF PICTURE IS A LINE IN THE EGRESS RECORD**, at the start and at the stop, with
   how long it ran — the shape the microphone already uses. The camera currently writes `.on` and
   `.off` but **no duration**; add it, so "how long was the webcam on" is answerable from the record.

**A reconnect after a dropped session must not restore the camera by itself.** That is the most
likely way rule 2 gets broken by accident, and it is worth its own test.

Rename `startWithCamera` to something that cannot be misread as "always on" — `cameraOnSummon` or
similar — and make its note state the rule, not the mechanism.

### 1.4 Still owed, and not discharged by this

The disclosure. The decision is made; the writing is not:

- **The age check.** The service looks at the picture and can end a session on it. No customer has
  been told that, and no document says it.
- **Is the picture recorded?** `I do not have a verified source for this.` Not in the Nuance docs.
  Ask support, with the retention question.
- **G11, the threat model's open-microphone addendum, predates the camera entirely.** Extend it.

---

## 2. The knowledge base — she cannot reach it, and the fix is small

### 2.1 What is wrong

`client/src/nuance/turn-routing.js`, verbatim:

```js
if (awaitingAnswer === true) return "route";
if (handedOff === true)      return "route";
if (kind === "tickets" || kind === "machine") return "route";
if (kind === "social" && subkind === "capability") return "route";
return "hers";
```

`classifySpoken` is `classify` from `router/classify.js` (`main.js:35`), which returns **five**
kinds: `tickets`, `machine`, `social`, **`question`**, **`action`**. The router acts on three.
`question` and `action` fall through to `"hers"`.

| Spoken | `kind` | Today |
|---|---|---|
| "Where are my tickets?" | `tickets` | routed |
| "How's this machine doing?" | `machine` | routed |
| "What can you do?" | `social`/`capability` | routed |
| **"How do I take a screenshot?"** | `question` | **hers** — and the KB *has* this article |
| **"What's our policy on expensing a taxi?"** | `question` | **hers** — answered from world knowledge |
| **"My printer won't print."** | `action` | **hers** unless she hands off |

`/v1/ask` is reachable only through `handedOff`. Her prompt does instruct a hand-off for "company
guidance or policy" — and the last handover is right that **a prompt is a request**.

**The sharper half is `action`.** `classify.js:433` defaults *every unrecognised sentence* to
`action`. On the voice path that makes D211's measured bias inert: the 40-case bakeoff measured a
path spoken turns do not take unless she chooses to take it.

### 2.2 Why you cannot simply add `question` to the list

It re-breaks D318. `classify` returns a social kind only when the marker has **no residue**
(`classify.js:413`). *"It's a beautiful day. How are you doing?"* has residue, falls through, hits a
question marker, and comes back `question`. Routing `question` sends that sentence back to the
router — the exact regression D318 exists to prevent.

### 2.3 Build this: ask the KB, and let a miss be silent

Route `question` to **`/v1/ask` only** — never the proposal path, never escalation — and make a
decline produce **nothing**.

```
spoken turn, kind === "question"
  → session.floor.hold { reason: "looking that up", ends_on_speech: false }
  → POST /v1/ask
  → answered → floor.release, relay the answer for her to read (D311's mechanism)
  → declined → floor.release, say NOTHING. Her conversational answer stands.
               No ticket offer. No escalation line. No proposal.
```

Four reasons this shape and not another:

1. **It cannot reproduce D318's defect.** That defect was Matic *volunteering* an escalation or a
   ticket offer for a pleasantry. A silent decline cannot volunteer anything. "It's a beautiful day,
   how are you doing?" asks the KB, is declined, and nothing happens — today's behaviour exactly,
   with company knowledge added underneath it.
2. **`session.floor.hold` is already built**, for consent cards. It matters here for more than
   tidiness: without it she fills the round trip by answering from world knowledge, which is the
   failure being fixed.
3. **B7a's shape survives.** "A question is answered or declined" still holds; only the *consequence*
   of a decline is suspended, and only on the voice path. The typed path is untouched and still
   offers the ticket.
4. **Additive and reversible.** One branch, one call path, one flag.

**The cost, honestly:** a hub round trip on conversational questions, including a model call on the
KB's side — `kb.test.mjs` says it in its own output, *"a dense leg always returns its nearest
neighbours — there is no such thing as 'no match'"*, so **the decline is the prompt's job**, not
retrieval's. If the latency hurts a live turn, gate the model call on the **lexical** leg returning
at least one chunk: the same suite shows the lexical leg returns **zero** for off-corpus questions,
which is precisely the cheap pre-filter this wants. `[VERIFY]` — latency unmeasured, either way.

### 2.4 `action` — needs Charles, so ask him rather than choosing

Routing all of `action` is "route everything", which is pre-D318. The options:

- **(a)** Leave `action` to the hand-off and measure how often that fails (§2.5).
- **(b)** Route `action` **only when it matched an explicit ACTION_VERB**. `classify` already
  distinguishes *matched a verb* (`classify.js:423`) from *defaulted here* (`:433`) in its `why`
  string, and **nothing currently reads it**. This restores the measured path for "restart the
  spooler" and "fix my printer" without touching "it's a beautiful day". **This is the one I would
  build** — a small change to what `agent:spoken` returns, plus the branch.
- **(c)** Route all `action` and suppress the ticket offer on voice. Closest to the typed path,
  furthest from D318.

**(b) changes what she may be interrupted for, so it is Charles's.** Put it to him in one line.

### 2.5 Make "read transcripts" a number

The standing advice to read transcripts is right and will not survive a busy week. Make it
falsifiable:

> Over N spoken turns: how many had `kind` of `question` or `action`, stayed `"hers"`, and produced
> a reply asserting a fact about the company, the machine, or the tickets?

That is the D318 regression metric and it belongs beside the bakeoff delta. **Zero is the only
acceptable number for the machine and the tickets** — those are the claims `persona.json` rule 2
exists to prevent.

---

## 3. `enrollment.json NOT FOUND` — the workaround is breaking tickets

**Do this first. It is live, it is silent, and it gets worse every launch.**

### 3.1 The damage, measured

Queried against the live hub database today, `control.devices`:

| Device | Key | Created | Tickets |
|---|---|---|---|
| `b706a7d8…` | `ep-91b8c42bf` | 2026-11-17 05:29:31 | **0** |
| `c9a81393…` | `ep-036a79e17` | 2026-11-17 05:15:55 | 1 |
| `d4494605…` | `ep-cb48bf034` | 2026-11-17 03:44:22 | 1 |

**Three device rows inside two hours, one per launch, each with its own key.** Nine rows in total
where there should be about two.

P3b/D284 scopes a requester's reads to the enrollment that filed the ticket. The newest enrollment
has **no** tickets, while both of today's sit on superseded ones. So:

> **"Where are my tickets?" now answers from the `notListed` / `noneListed` branch** — *"they were
> filed before this machine was enrolled with the service desk"* — which is **true, correct, and
> completely misleading**, because it was Matic that re-enrolled, forty minutes earlier, not the
> user who changed machines.

The copy is doing its job. The data under it is wrong. This silently breaks the feature P4 and P5
were built for.

`[VERIFY]` — the invisibility is an inference from D284's documented scoping plus the rows above.
**Not reproduced in the app.** Confirm it in one launch by asking "where are my tickets?".

### 3.2 Do not guess the cause — make one launch answer it

`enrollment.js:84` builds the path from Electron's userData. `main.js:501` logs the path and
`existsSync`. The comment above it already names the problem — *"nothing in the log said which path
had been read"* — and is one field short of being the fix.

Every plausible cause produces the identical symptom and is separated by data the app already has:

| Cause | Separated by |
|---|---|
| userData differs between launches (app name, `--user-data-dir`, cwd, packaged vs `electron .`) | `app.getPath("userData")`, `app.getName()`, `app.isPackaged` |
| An elevated launch resolving a different profile | OS username + elevation |
| **A second launch handing over to the tray instance, so new env tests the old process** (the handover names this trap) | pid, process start time |
| A read racing a write | file mtime vs process start |
| Controlled Folder Access or AV blocking the read | `existsSync` true but the read throws |

**Widen the one line, print it once at startup, and print the same block from the launcher before it
starts the app so the two can be diffed:**

```
[enroll] userData=… name=… packaged=… exec=… cwd=… user=… elevated=…
         path=… exists=… mtime=… pid=… started=…
```

One launch eliminates every row. This is the repo's own habit — D256 and D258 were both found by
measuring rather than reasoning — and it is cheaper than any of the fixes it chooses between.

**Then remove the workaround.** Enrolling afresh per launch was never a steady state: it mints
credentials and orphans tickets to paper over an unexplained `existsSync`.

### 3.3 Clean up what it made

Nine device rows, several of them launch artifacts. Whatever the cause turns out to be, the orphaned
tickets need a decision: revoke the stale devices and leave the tickets unmatched (honest, and the
`notListed` copy already covers it), or re-point today's two at the surviving enrollment.
**The second is a data edit and is Charles's call, not a session's.** Do not do it unasked.

---

## 4. The red database suite — it is green, and it was the environment

**Run today: `npm.cmd run test:db` → 3/3 files pass.** `admin-db.test.mjs` ok, `db.test.mjs` ok,
`kb.test.mjs` ok (52 passed, 0 failed in that file alone). No code changed — the tree was clean and
nothing in this branch touches it. The container reports `Up 2 hours (healthy)`.

The previous handover reported 21 failing in `db.test` plus `admin-db`, "in job-claim and
time-window assertions this branch does not touch, on a database that had been off nine weeks."

**It was an environment artifact, not a defect.** Job-claim and time-window assertions are exactly
the ones that fail against a database whose rows are nine weeks stale or whose migrations are
behind — the two states a long-dormant container wakes up in.

**Recommendation — stop it recurring rather than just closing it.** Add a preflight to `test:db`
that refuses to run and says why, instead of emitting 21 red assertions that read like a regression:

- database reachable on the configured port;
- schema **migrated to head**, against the migration ledger the repo already checksums;
- container uptime and the newest row's age, printed.

An hour's work. The next person then reads *"the database is nine weeks stale, run `npm run
migrate`"* instead of opening a handover item called "the server's database suite is red, not
investigated."

**§5.8 of the previous handover can be closed: it was investigated, and it was nothing.**

---

## 5. Order, and what needs Charles

| # | Work | Blocked on |
|---|---|---|
| 1 | §3.2 the enrollment log line, then remove the workaround | nothing |
| 2 | §1.3 the camera policy module and its four rules (**D324**) | nothing |
| 3 | §2.3 KB on `question`, silent decline | nothing |
| 4 | §2.4 the `action`-verb question | **Charles**, one line |
| 5 | §4 the `test:db` preflight | nothing |
| 6 | §3.3 the orphaned tickets | **Charles**, a data edit |
| 7 | §1.4 the camera and retention disclosure, G11 | a support answer |

---

## 6. Reporting

Charles's standing rules, unchanged: no invented facts; `I do not have a verified source for this.`
where there is none; `[VERIFY]` inline and a verification register at the end; design targets
separated from measurements; an honesty ledger saying what was not built, not run and not measured.
Write the test first and watch it fail. `git diff` and `git status`, read, before anything leaves
the tree.

---

## 7. Verification register

| Claim | How known |
|---|---|
| `spokenTurnRoute`'s five branches, verbatim | **Read 2026-11-17** — `nuance/turn-routing.js` |
| `classifySpoken` is `classify`; the five kinds; unrecognised defaults to `action`; social needs no residue; `why` distinguishes verb-matched from defaulted | **Read 2026-11-17** — `main.js:35`, `classify.js:360–433` |
| The camera's six behaviours in §1.2, with line numbers | **Read 2026-11-17** — `main.js` |
| `mic-policy.js`'s four rules and its counted-unmute test | **Read 2026-11-17** — `nuance/mic-policy.js` |
| The camera writes `.on`/`.off` but no duration | **Read 2026-11-17** — `main.js:620, 663, 665` |
| The prompt instructs hand-off for "company guidance or policy" | **Read 2026-11-17** — `server/src/nuance/persona-prompt.txt` |
| The KB's dense leg always returns neighbours, so the decline is the prompt's job; the lexical leg returns zero off-corpus | **Read 2026-11-17** — `kb.test.mjs` output, run today |
| `npm run test:db` 3/3 today, no code change, container up 2 hours | **Run 2026-11-17** |
| Nine rows in `control.devices`; three created 2026-11-17 within two hours with distinct keys; newest has zero tickets; today's two tickets on two earlier devices | **Queried 2026-11-17** against the live hub database |
| That tickets on a superseded enrollment are invisible to the app | **Inference** from D284's scoping plus those rows. Not reproduced. §3.1 |
| The cause of `enrollment.json NOT FOUND` | **Not known.** §3.2 lists candidates; none tested |
| Latency of the §2.3 round trip | **Unmeasured** |
| Whether the camera's picture is recorded; transcript and audio retention | **I do not have a verified source for this.** Not in the Nuance docs |
| That a reconnect could restore the camera | **Judgement**, not an observed defect. §1.3 rule 2 |
