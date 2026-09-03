# CLAUDE.md — read before doing anything in this repo

**Then read [`PROJECT_START_HERE.md`](PROJECT_START_HERE.md)** — it is the index of status, documents
and blockers, and it is kept current. This file only tells you how to work here.

## Layout (since 2026-09-03)

| Path | What |
|---|---|
| `client/` | The Windows endpoint: Electron agent + privileged broker + four Win32 primitives. Runnable. All `npm` commands run **from `client/`**. |
| `server/` | The hub. Spec and phase-one scope only; **nothing built**. |
| `docs/decisions/DECISION-REGISTER.md` | **The** decision register. D1–D161, invariants H1–H6, conflicts, open items OPEN-1–OPEN-8. Cite it by this path. `docs/decisions/sources/` is superseded material with old numbering — never cite it. |
| `Projects/`, `.obsidian/` | The founder's Obsidian notes. Not product code. |

The client used to live at `Projects/Ai Chat Bot -Matic/matic-desk-demo`. Handovers dated 2026-09-02
and earlier use that path; do not "fix" them, they are records.

## Branches

- `main` — current code. Work here or on feature branches off it.
- `add-matic-desk-demo` — the **frozen demo build**. Rehearsals run from it. Do not merge into it
  without being asked; every code change resets the demo's clean-run counter.
- `post-demo` — merged into `main` on 2026-09-03; historical.

## Decisions

- New decisions are **appended** to the register with the next free ID (D162 onward), with a status
  (*done* / *decided* / *proposed* / *rejected*) and a forcing reason. **Nobody renumbers.**
- Two chat documents dated 2026-09-03 numbered their own content D130–D168 in parallel with the
  register. Those IDs are **void**; the register's §0 and §5.6 map them. Do not cite them.
- D130–D150 were assigned on 2026-09-03 from the independent design review; most are *proposed*,
  meaning the founder has not ratified them. Do not treat a proposed decision as settled.
- D1–D41 live only in `ASK-IT-questionnaire.xlsx`, which has never been downloaded. If it turns up,
  it goes into the register verbatim.
- Every document you write names other files **by path**, never by name alone. Two documents were
  declared missing in one day while sitting on disk.

## Commands (Windows)

```bash
cd client
npm.cmd install            # npm.cmd, not npm — PowerShell execution policy blocks npm.ps1
npm.cmd run fetch-voice    # 63 MB Piper model into client/voices/ (gitignored); needed for speech
npm.cmd test               # headless, no key, no admin: 211 assertions + 3 expected failures
npm.cmd run start:elevated # the app; needs .env with ANTHROPIC_API_KEY (see .env.example)
npm.cmd run count-tokens   # measures the shipped prompt prefix against the cache floor
npm.cmd run verify-cache   # TWO REAL CALLS to claude-sonnet-5: proves the cache_control breakpoint works (D161)
```

- `py -3`, not `python` — `python` is not on PATH. For scripted file edits use `node`, not Python.
- Bash heredocs in this environment mangle backslashes; put multi-line scripts in a file and run it.
- Many files are CRLF. Match the file's existing line endings when editing.

## Tests: what "3 known open (D130)" means

`client/test/consent-surface.test.mjs` demonstrates the review's largest finding (an unprivileged
agent can show one consent card and send a different proposal down the pipe) and carries the D130
acceptance test as **expected failures**. The suite exits 0 today. The day those three pass, the
suite exits 1 on purpose: promote them to hard checks and update D130 in the register. Do not
"fix" the XFAIL lines to make them pass by weakening them.

## Never

- Commit `.env`, an API key, or any `.onnx` file. Both are gitignored at two levels; keep it so.
- Claim a performance number. Only three things in this project have been measured: the model
  bake-off (one machine, 40 hand-written cases), the prompt prefix token count, and one live
  prompt-cache check on Sonnet 5 (two calls). Everything else is a target and the docs say so.
- Put broker logic in the renderer, or import `client/src/broker/win32/*` or `capabilities/*` from
  anywhere but a `Broker` implementation. `client/src/broker/broker.d.ts` explains why.
- Let the model author consent text. Consent wording is catalog data (`plain/*` in `catalog.json`).

## Working rules the project has learned the hard way

- Bugs are found by using the software, not reading it. Run the thing.
- State limitations before being asked; every handover carries an honesty ledger. Keep it.
- Commit messages: what changed and why, in prose. Co-author trailer for Claude:
  `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
