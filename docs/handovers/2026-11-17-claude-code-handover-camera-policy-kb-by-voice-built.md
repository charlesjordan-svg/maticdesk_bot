# Claude Code handback — the camera rule pinned, the knowledge base by voice, and the two loose ends measured

**Date:** 2026-11-17
**From:** a Claude Code session, working from
`2026-11-17-claude-code-handover-kb-access-camera-and-two-fixes.md` (the brief).
**Branch:** `v2-nuance-persona`. Register at **D326** (§5.62o, §5.62p); next free **D327**, and the register's own
next-free line was updated in the same pass.
**Read first:** `CLAUDE.md` (v2 section, four new bullets), `PROJECT_START_HERE.md`, the brief.

Four pieces of work, done in the brief's order. Two things are Charles's and are not done. The cause of
the enrollment defect is not known; what is built is the measurement that will name it in one launch.

---

## 1. `enrollment.json NOT FOUND` — measured, not guessed (brief §3)

**Built.**

- `client/src/agent/enrollment.js` gains `startupReport(facts)` — pure, formats thirteen named fields on two
  `[enroll]` lines: `userData name packaged exec cwd user elevated` / `path exists read mtime pid started`.
  `read` is a real `readFileSync`, not only `existsSync`: a folder-protection product leaves the file
  visible and refuses the open, and that is a different cause. `elevated` is shell32's `IsUserAnAdmin`
  through the broker's own `koffi` binding — no shell, no PowerShell.
- `client/src/main/main.js` prints it at startup from the real facts, in place of the one line that said
  neither which process looked nor where.
- `tools/launchers/start-v2.ps1` prints the same fields from OUTSIDE before it starts the app (expected
  userData from `client\package.json`'s name, user, elevation of the launcher's window, the path, exists,
  mtime, and every electron already running from this checkout as `pid@started`), so the two blocks can be
  put side by side.
- **The workaround is removed.** The launcher minted a one-day enrollment secret on EVERY launch; an app that
  could not find its file then enrolled afresh each time. Now a secret is minted only with **`-Enroll`**, for
  an endpoint that has none, and refused when a file already exists at the expected path.
- **A second trap closed:** if the launcher cannot stop a running Matic Desk (an elevated one, from an
  unelevated window), it **stops and says so** instead of handing over to it — a hand-over silently tests the
  old process with the old environment, which is one of the brief's candidate causes.
- `client/test/enrollment.test.mjs` §7 (7 checks): the formatter, purity, main's wiring, the launcher's
  fields, no per-launch minting.

**Not done, and why:** the cause. Not one launch has been run with this in place. The procedure is in §6.

**The data under it, re-read today from the live database by the new preflight:** `control.devices` has
**9 rows, newest 2026-11-17T05:29:31Z** — the row the brief names. Nothing was revoked or re-pointed
(§3.3 of the brief is Charles's).

## 2. The camera — D324, the founder's (brief §1)

**Built.** `client/src/nuance/camera-policy.js`: pure, imports nothing, reads no clock. Four rules in the
microphone's shape, and `client/test/camera-policy.test.mjs` (36 checks) pins each:

1. **Off unless the user asked.** `session.opened` opens live only with `allowed && onSummon && gesture
   && windowVisible`; any missing → off with the button; not allowed → unavailable.
2. **Only the user turns it on.** `turnOn()` is the one place the live state is written; the test counts
   `state: "live"` in the file's code (exactly one) and `cameraOn = true` in `main.js` (zero). Twelve
   non-user events from each of three states — including `session.reconnected`, `session.resumed`,
   `service.video.on`, a second `session.opened` with every flag set — turn nothing on and write no
   on-line. **A reconnect restores nothing.**
3. **No visible window, no camera, both ways.** `user.on` is refused while hidden; `window.hidden` closes
   the stretch on its own, and `main.js` now sends it BEFORE `personaOver("window-hidden")`, so the rule
   survives a session that one day outlives a hidden window. `window.shown` does not turn it back on.
4. **Every stretch is a line with its duration.** `persona.video.off` carries `videoSentMs` and a reason;
   `persona.closed` carries the session total. `PERSONA_EGRESS_FIELDS` gains `videoSentMs`;
   `personaSessions()` reads back `videoWasSent` / `videoSentMs`.

`main.js` applies it through `personaCameraEvent()` (the shape of `personaMicEvent`). `cameraWords()` moved
out of `mic-policy.js`. `config.json` `persona.startWithCamera` → **`cameraOnSummon`**, and its note says the
rule. The renderer's contract (`{ on, words, refused }`) is unchanged, so `persona-stage.js` and
`persona-ui.js` were not touched for this.

**Not done:** the disclosure (brief §1.4) — the age check, retention, G11. `I do not have a verified source
for this.` on whether the picture is recorded; it is not in the Nuance docs. A support question.

## 3. The knowledge base by voice — D325, proposed (brief §2.3)

**Built, not seen live.**

- `client/src/nuance/turn-routing.js`: a third answer, **`ask`**, for `kind === "question"`, after the four
  routed cases and before "hers". `action` is neither asked nor routed (§5).
- `client/src/nuance/surface-split.js`: `lookupHold()` (`session.floor.hold`, reason "looking that up",
  `ends_on_speech: false`) and `lookupRelease()`. The stage still writes no floor event of its own.
- `client/src/renderer/persona-stage.js`: `holdForLookup()` / `releaseLookup()`.
- `client/src/agent/agent.js`: `askKnowledge(text)` — reaches `cloud.ask()` and nothing else; a test
  reads the method and forbids `propose|broker|escalat|intake` in it. Same duck-typed gate as the typed path.
- `main.js` `agent:ask` (caught) and `preload.cjs` `askKnowledge`.
- `client/src/renderer/renderer.js`: the answered half of D211's branch is now `knowledgeAnswered()`,
  called from the typed path and from a new `showAnswer` callback for the spoken one — same inspector
  lines, same `forPersona("@answer")`, same citation chrome.
- `client/src/renderer/persona-ui.js`: the `ask` branch. Hold → ask → release. **Answered:** the user's
  words, then any line she said meanwhile, then the answer shown and said. **Declined or unreachable:
  nothing** — the user's words and her lines go on the panel and that is all. A hand-off already open
  wins before the lookup (D318) and is not waited for; one that arrives during the lookup wins after a
  decline and the turn goes down the routed path.
- `client/test/turn-routing.test.mjs` §7 (21 checks). "what's the capital of France" moved from §1
  ("hers") to §7 ("ask"): it is asked, declined, and nothing happens — today's behaviour with company
  knowledge underneath.

**What the classifier actually does with the brief's examples** (run today, `classify()`):
*"How do I take a screenshot?"* → question → **ask**. *"What's our policy on expensing a taxi?"* → question →
**ask**. *"It's a beautiful day. How are you doing?"* → **action** (the social marker has residue, no question
marker matches "how are") → hers, as before. So the brief's §2.2 worry — that sentence coming back as
`question` — does not arise on this classifier; the design is the same either way.

**The number (brief §2.5).** Every spoken turn now writes `[spoken] kind=… route=… outcome=…` to
`client/audit/app.log` — never words. `node client/scripts/spoken-turns.mjs` prints the counts, the
**denominator** (question/action turns that stayed hers) and the conversation ids to read. The
**numerator** — replies asserting a fact about the company, the machine or the tickets — cannot be
computed here: her words exist only in the service's transcript. Zero is the only acceptable number for
the machine and the tickets. Run today against the existing log: 0 spoken turns logged (the lines did not
exist before this pass), 12 conversations.

## 4. `test:db` preflighted (brief §4)

**Built.** `server/test/db-preflight.mjs`, run first by `run-all.mjs --excluded`; the run stops there with
the fix. Reachable; control at head against the checksummed ledger; every tenant schema at head; a changed
applied file reported as CHANGED, not behind; uptime and the newest row's age printed. It migrates nothing.
Run today:

```
server: PostgreSQL 17.11, up 18 h (started 2026-11-17T03:33:26Z)
control: 9 migration(s) on disk, 9 applied
tenant t_clickthrough: 11/11 applied;  tenant t_devco: 11/11 applied
control.devices: 9 row(s), newest 16 h ago (2026-11-17T05:29:31Z)
control.job_queue: 39 row(s), newest 18 h ago
ok - the suite may run
```

Against port 5999: `NOT REACHABLE … the database suite was NOT run: npm.cmd run db:up`, exit 1, no suite
file spawned. `server/test/db-static.test.mjs` gains 7 checks on `compareLedger()` and the runner's wiring.
`npm.cmd run test:db` today: **3/3** (admin-db 514, db 108, kb 52).

## 5. Needs Charles

| # | What | One line |
|---|---|---|
| 1 | ~~**`action` by explicit verb** (brief §2.4 b)~~ | **Answered the same evening: *"Yes, build it."* Built as D326** — `classify()` sets `verb` on an ACTION_VERB match and never on its default; `agent:spoken` passes it; `spokenTurnRoute()` routes `action` with a verb and leaves the default hers. `turn-routing.test.mjs` §8 (12 checks). Not seen live. |
| 2 | **The orphaned tickets** (brief §3.3) | Nine device rows; today's two tickets sit on superseded enrollments and are invisible to the newest. Revoke the stale devices and leave the tickets unmatched (the `notListed` copy already covers it), or re-point the two at the surviving enrollment? A data edit; not done. |
| 3 | **Camera disclosure** (brief §1.4) | The age check and retention: a question to Nuance support, then G11. |

## 6. The one launch that answers §1

Full paths and steps, for Charles or the next session:

1. Quit any Matic Desk in the tray (right-click its icon → Quit). An elevated one cannot be stopped by the
   launcher and the launcher now refuses to hand over to it.
2. Run `C:\Users\Charles\Downloads\maticdesk_bot\tools\launchers\start-v2.cmd` (the Desktop shortcut passes
   `-KeyFile`). Read the two `[enroll]` lines it prints — `path=` and `exists=`.
3. Open `C:\Users\Charles\Downloads\maticdesk_bot\client\audit\app.log`, find the two `[enroll]` lines the
   app wrote at startup, and compare field by field. A different `userData=` or `user=` or `elevated=`,
   or `exists=true` with `read=` not `ok`, or `pid=` matching an electron the launcher listed as already
   running, each names a different cause.
4. Only if the app's `path=` is the launcher's `path=` and `exists=false` there is genuinely no enrollment:
   run the launcher once with `-Enroll` (`powershell -NoProfile -ExecutionPolicy Bypass -File
   C:\Users\Charles\Downloads\maticdesk_bot\tools\launchers\start-v2.ps1 -KeyFile "<key file>" -Enroll`).
5. In the window, say *"where are my tickets?"* — the brief's `[VERIFY]` that tickets on a superseded
   enrollment are invisible has still not been reproduced in the app.

## 7. Honesty ledger

- **Not run in the window.** None of this was run in Electron. The camera policy, the `ask` branch, the
  floor hold and the `[enroll]` block are tested headless and structurally; `CLAUDE.md`'s rule — run it in
  the window, read the developer log — is owed to the next session. The account has one concurrent
  session and I did not start one.
- **`session.floor.hold` semantics are from the docs, not observed.** Whether a hold sent after her
  generation has begun stops her, and whether `ends_on_speech: false` behaves as named, is `[VERIFY]`.
- **Latency of the lookup is unmeasured** (brief §2.3). The lexical pre-filter it suggests is not built;
  nothing on the hub changed.
- **The enrollment cause is unknown.** Only the measurement is built; no launch has been diffed.
- **`IsUserAnAdmin` returns false from an unelevated node** (checked); true from an elevated one is
  assumed from Microsoft's documentation, not observed here.
- **The orphaned tickets were not touched.**
- **Two [spoken] lines per decline-then-hand-off turn:** when the hub declines and she handed off during the
  lookup, the turn writes `route=ask outcome=declined` and then goes down the routed path without a second
  line; the counter under-counts routed turns by those. Rare, and noted.
- **Test totals:** client 33/33 files (was 32; `camera-policy.test.mjs` is new), server headless 8/8, db
  3/3 with the preflight in front. Per-file totals touched: enrollment 47, camera-policy 36,
  turn-routing 74, persona-egress 66, db-static 121.
- **Commit messages and this document carry no transcript text**; conversation ids only.

## 8. Verification register

| Claim | How known |
|---|---|
| `classify()`'s verdicts on the brief's example sentences | **Run 2026-11-17**, `node -e` against `client/src/router/classify.js` |
| `IsUserAnAdmin()` loads through `koffi` and returns false unelevated | **Run 2026-11-17** from an unelevated node |
| 9 rows in `control.devices`, newest 2026-11-17T05:29:31Z; server up 18 h; both tenants 11/11 | **Run 2026-11-17**, `node test/db-preflight.mjs` against the live container |
| The preflight refuses an unreachable database before any suite file | **Run 2026-11-17** with `MATIC_DB_URL` on port 5999 |
| `test:db` 3/3 with the preflight in front | **Run 2026-11-17** |
| The camera policy's twelve non-user events turn nothing on from any state | **Tested**, `camera-policy.test.mjs` §2 |
| The `ask` branch never calls `submit()`, `attachOffer` or a proposal | **Structural test** on the branch's text, `turn-routing.test.mjs` §7 |
| That a floor hold stops her answering from world knowledge | **Not observed.** Docs only |
| That the picture is recorded; retention | **I do not have a verified source for this.** |
| The cause of `NOT FOUND` | **Not known.** |
