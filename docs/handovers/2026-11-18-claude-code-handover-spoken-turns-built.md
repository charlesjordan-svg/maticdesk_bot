# Claude Code handback — the unrecognised sentence asks the knowledge base, the hand-off's legs are timed, her words are reachable

**Date:** 2026-11-18
**From:** a Claude Code session, working from
`docs/handovers/2026-11-18-claude-code-handover-spoken-turns-read-from-the-log.md` (the brief — the Cowork
reading of conversation `5b9fc18e…`, 2026-11-17 23:41:48–23:44:09 Z).
**Branch:** `v2-nuance-persona`. Register at **D328** (§5.62q); next free **D329**, and the register's own
next-free line was updated in the same pass.
**Read first:** `CLAUDE.md` (v2 section, the D327/D328 bullet), `PROJECT_START_HERE.md`, the brief.

Six pieces of work, done in the brief's §7 order. **Nothing was seen live** — the account has one concurrent
session and a live test is Charles at the microphone — so every behaviour below is unit-tested and unwatched,
and **no latency figure is written anywhere**, because the brief's §3 says none may be until the legs are
measured, and the legs are now logged and nothing more.

---

## 1. `[spoken]` carries `verb=`, `why=`, a turn id and the turn→decision lag (brief §6.1, §6.2)

**Built.**

- `client/src/renderer/persona-stage.js` numbers the user's finished turns (`turnNo`): the turn line reads
  `the user finished turn N (W words)` and `onUserTurn(text, { turn: N, endedAt })` carries the number and the
  instant into persona-ui.
- `client/src/renderer/persona-ui.js` has one builder, `spokenLine(info, route, outcome)`, called at the three
  sites. The line is now
  `[spoken] kind=… route=… outcome=… turn=N verb=<verb or -> decided=+<ms>ms why=<the classifier's sentence>`.
  `decided` is the gap from the turn ending to the routing decision — the 22-second lag the brief could only infer
  from ordering is a field now.
- `client/src/main/main.js` `agent:spoken` returns `why` beside `verb`. It is read on the log line and nowhere
  else; the decision still reads `verb`.
- `client/scripts/spoken-turns.mjs` parses the new fields, breaks the non-routed lines down by `why` (quoted
  matches elided), and prints the median and max lag, labelled as a gap between two client-side log lines.
  The three-field prefix is unchanged, so the script still counts the old lines (16 in today's `app.log`, across
  all of yesterday's sessions: 8 `action hers hers`, 4 `action route work`, 2 `question ask declined`,
  1 `question route work`, 1 `social hers hers`).

## 2. A hand-off's legs are timed (brief §6.3, §3)

**Built.** Each leg is a `[handoff]` line in `client/audit/app.log`, timestamps and ids only:

| Leg | Written by | Says |
|---|---|---|
| opened | the stage, on `session.delegation.created` for the client | `opened after turn N (+ms after the turn was submitted)` when the turn had already left |
| submitted | persona-ui → `stage.noteSubmitted(turn)` just before `submit()` | `turn N submitted to Matic +ms after the hand-off opened`, or `(no hand-off open yet)` |
| the main-process half | `main.js` | `[agent] propose answered in N ms (<shape>)` and `[agent] askKnowledge answered in N ms (…)` |
| relayed | the stage's `speak()`, when the answer goes back as the hand-off's result | `relayed as the result of her hand-off: +ms after the hand-off opened, +ms after the turn was submitted` |
| she began speaking | the first `session.output_transcript.delta` after the relay | `+ms after the relay` |
| she finished | `session.output_audio.done` | `+ms after the relay, +ms after the hand-off opened` |

**Where the 28 s went is still not known.** One real session with these lines answers it. Until then the
brief's two numbers (28.3 s, 4.6 s) remain what it called them: gaps between two client-side log lines.

## 3. The actual fix — an unrecognised sentence asks the knowledge base, behind the lexical gate (brief §2) — D327, proposed

**Built.** `spokenTurnRoute()` returns `ask` for `kind: "action"` with no `verb` — the classifier's default,
which was five of the seven turns in the session read. The window holds the floor, calls
`askKnowledge(text, { requireLexicalMatch: true })`, shows and says an answer, and on a decline adds nothing:
no ticket offer, no escalation, no proposal. D326's "never routed" half stands.

**The gate, end to end:**

- persona-ui sends `{ requireLexicalMatch: info.kind === "action" }` → `preload.cjs` → `main.js` `agent:ask`
  (read as a strict boolean) → `agent.askKnowledge()` → `HubClient.ask()`, which puts `requireLexicalMatch: true`
  on the body only when true.
- Hub: `checkAskRequest()` accepts a boolean and refuses anything else by name. `retrieve()` stops after the
  lexical leg when it found nothing — **no embedding is computed, the semantic leg is not run** —
  returning `gated: "no-lexical-match"`. `modelCallSkipped()` in `src/kb/ask.js` (pure, exported) returns
  `no-lexical-match` and the handler declines with `DECLINE_REPLY` and no model call. The response carries
  `modelCalled: false` and `retrieval.skipped`; the client's log says so; nothing the client SAYS changes.
- A spoken **question** keeps D325's shape — no gate, the model decides — because a question whose phrasing
  shares no term with its article is what the dense leg is for. The typed path is untouched.

**Why it is safe** is D325's own argument, restated in the register: a silent decline can only add a correct
answer. **What it costs, named:** a hub round trip with the floor held on most spoken sentences — see §7 for
the finding that makes "most" bigger than the brief assumed. The gate makes the common case a database query.
**What is given up:** a real problem whose words share nothing with its article is declined without the dense
leg's chance, and its log row reads `lexicalOnly`, which the review queue treats as not evidence of a gap (D236).

**Tests:** `client/test/turn-routing.test.mjs` §1, §2, §7, §8 rewritten for the new default, new §9 (the
rule, the gate's wiring, the hub client sends the flag only when asked); `server/test/kb-static.test.mjs` §7
(every `modelCallSkipped()` case, the request shape, the handler consults it before `provider.complete()`,
`retrieve()` stops before `embedder.embedQuery()`); `server/test/kb.test.mjs` — **against the real database:**
an off-corpus sentence with the gate on stops before an embedder that THROWS if asked, and a sentence the
lexical leg matches goes on as before.

## 4. The no-sound hint is a per-session latch (brief §5) — D328, proposed

**Built.** `heardThisSession` in `persona-stage.js`, set by the level watcher, reset only in `finish()`. The
hint is shown only while nothing has been heard this session; the `NO SOUND` log line is still written every
time and says when the hint was withheld. D323(d)'s narrowing did not hold because `heard` belonged to one run
of the watcher and the watcher restarts every time the microphone comes back on.

## 5. A talked-past offer logs what the next sentence classified as (brief §4)

**Built.** `main.js`: `the offer was talked past in conversation - dropped (the sentence that followed
classified as <kind>[/verb <verb>][/<subkind>]; the offer was at stage <offered|collecting>); nothing was filed
and nothing was sent`. Never the words. **Which of the brief's two candidates caused yesterday's two drops is
still not known.** One thing was read: `intake.answers()`'s affirmative already accepts *"yeah go on then"*,
*"sure, do that"*, *"please"* and ASR's *"Yes."* (the typed-path test in `turn-routing.test.mjs` §3 pins six
forms), which makes "the conversation had moved on" the likelier candidate and the measurement the way to know.

## 6. `server/bin/transcript.mjs` — her actual words, from the repo (brief §6)

**Built.** `node bin/transcript.mjs <conversationId> [--key-file <path>] [--json]` from `server/`. The key
comes from `--key-file`, `MATIC_NUANCE_KEY_FILE`, or `MATIC_NUANCE_API_KEY` (the hub's own variable); it is
sent in one header and printed nowhere — `server/test/nuance.test.mjs` §11 counts one interpolation of it in
the file and none in any write. The transcript is printed to the terminal and written to no file, under a
line saying it holds the user's words and is not to be pasted into the repo. **The response shape is not
documented in this repo:** `formatTranscript()` (pure, tested on four shapes) reads an array, or an object
holding one under `transcript`/`messages`/`turns`/`items`/`entries`, with role-like and text-like fields, and
shows the JSON for anything else rather than silently emptying it. **Nothing in this pass called the service.**

For Charles, from a PowerShell window, with the key file the launcher uses:

```powershell
cd C:\Users\Charles\Downloads\maticdesk_bot\server
node bin\transcript.mjs 5b9fc18e-36b0-44f8-b658-e49d25b9427c --key-file "<the file -KeyFile names>"
```

## 7. Found while writing the tests, and NOT fixed

`classify()` makes **"It's a beautiful day. How are you doing?"** and **"thank you so much"** the default
`action`, not `social` — the social markers want the whole sentence, with no residue, and "how are you" with
"it's a beautiful day" in front of it has residue. Yesterday's session read `0 social` for the same reason.
Under D327 those sentences now cost one lexical retrieval (held floor, no model call) before she answers them
herself. Widening the markers is the shape the brief warns against (§2), so it is recorded here and in
§5.62q and left; it becomes worth deciding once the held floor's cost is a measured number.

## 8. Needs Charles

1. **One live session**, then read `client\audit\app.log`:
   - `[handoff]` lines name where the 28 s went — that is §3 of the brief, answered;
   - `node scripts\spoken-turns.mjs` from `client\` prints the kinds, the `why` breakdown and the
     turn→decision lag;
   - **does she still answer the sentence after the floor is released?** `[VERIFY]` — D325's hold was never
     seen live either, and D327 holds it on most sentences.
2. The transcript, with the command in §6, for the same session: it settles §4's two candidates.
3. Still his from the previous handback: the shortcut-vs-session `[enroll]` diff; the camera disclosure.

## 9. Honesty ledger

- **Nothing seen live.** D327, D328, every `[spoken]`/`[handoff]` field and the transcript CLI are
  unit-tested and unwatched. The transcript CLI has never contacted the service; its formatter was written
  against shapes I guessed, which is why it falls back to JSON.
- **No latency figure exists.** The ms fields are written by code that has not run.
- **The 28 s is unexplained.** Instrumented, not diagnosed.
- **§4's cause is unexplained.** Instrumented, not diagnosed; `intake.answers()` was read, not run against
  real ASR output.
- **The cost of D327 is a judgement, not a measurement:** "a database query" is what the gated path does by
  construction; how long it takes with the floor held is unmeasured.
- **Retrieval numbers are floors** (D207, D203) — unchanged by this pass.
- **The social-marker finding (§7) is recorded and not fixed.**
- `git diff` and `git status` were read before the commit; the working copy's `preload.cjs` is CRLF and Git
  normalises it (`.gitattributes`), as before.

## 10. Verification register

| Claim | How known |
|---|---|
| Seven `[spoken]` lines, all `action`, five `route=hers` | **Read 2026-11-18** by the brief — `client/audit/app.log`; re-run here: `spoken-turns.mjs` over the whole log, 16 lines |
| The classifier's default is `action` with no verb for "my screen keeps going black", "thank you so much", "It's a beautiful day. How are you doing?" | **Run 2026-11-18** — `classify()` from `client/`, and `turn-routing.test.mjs` §9 pins it |
| D327: the default is asked, questions ungated, the gate reaches the hub, the hub skips the model and the embedder | **Run 2026-11-18** — client `npm.cmd test` 33/33 files; server `npm.cmd test` 8/8; `npm.cmd run test:db` 3/3 (514 + 108 + 54), the gate against PostgreSQL 17.11 with a throwing embedder |
| The lexical leg returns zero chunks off-corpus; the dense leg always returns neighbours | **Run 2026-11-18** — `kb.test.mjs` (the five negative questions, unchanged) |
| D328: the latch | **Source-pinned** — `turn-routing.test.mjs` §10 (two resets, one in `finish()`, none in `watchMic()`). **Not seen live** |
| The hand-off's legs are logged in the right order with the right gaps | **Source-pinned only.** No session has run |
| Where the 28 s went | **Not known** |
| Which of §4's candidates caused the two drops | **Not known** |
| `intake.answers()` accepts the spoken affirmatives the brief listed | **Run 2026-11-18** — `turn-routing.test.mjs` §3 (six forms) |
| `bin/transcript.mjs` reads the service's real response shape | **Not known** — never called; the formatter falls back to JSON |
| The key is printed nowhere by the CLI | **Source-pinned** — `nuance.test.mjs` §11 |
| Whether she still answers after the floor is released | **Not known** — `[VERIFY]`, from D325 |
| That widening the social or question markers would re-break D318 | **Judgement** (the brief's), not a measurement |
