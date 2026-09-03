# CLAUDE.md — read before doing anything in this repo

**Then read [`PROJECT_START_HERE.md`](PROJECT_START_HERE.md)** — it is the index of status, documents
and blockers, and it is kept current. This file only tells you how to work here.

## Layout (since 2026-09-03)

| Path | What |
|---|---|
| `client/` | The Windows endpoint: Electron agent + privileged broker + four Win32 primitives. Runnable. All `npm` commands run **from `client/`**. |
| `server/` | The hub. **B0 walking skeleton since 2026-09-03**: one route (`POST /v1/turn`), one provider (Ollama), **no authentication, loopback only**, and loud about both. `npm` commands run from `server/`; no dependencies. Everything else about the hub is unbuilt. |
| `docs/decisions/DECISION-REGISTER.md` | **The** decision register. D1–D165, invariants H1–H6, conflicts, open items OPEN-1–OPEN-9. Cite it by this path. `docs/decisions/sources/` is superseded material with old numbering — never cite it. |
| `docs/kb/` | The generic knowledge base (`generic-kb-v2.json`) and its rules (D162). An article never names a capability or says what the bot does. |
| `Projects/`, `.obsidian/` | The founder's Obsidian notes. Not product code. |

The client used to live at `Projects/Ai Chat Bot -Matic/matic-desk-demo`. Handovers dated 2026-09-02
and earlier use that path; do not "fix" them, they are records.

## Branches

- `main` — current code. Work here or on feature branches off it.
- `add-matic-desk-demo` — the **frozen demo build**. Rehearsals run from it. Do not merge into it
  without being asked; every code change resets the demo's clean-run counter.
- `post-demo` — merged into `main` on 2026-09-03; historical.

## Decisions

- New decisions are **appended** to the register with the next free ID (D166 onward), with a status
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
npm.cmd test               # headless, no key, no admin, no hub: 277 assertions, 0 expected failures
npm.cmd run start:elevated # the app; needs .env with ANTHROPIC_API_KEY (see .env.example)
npm.cmd run count-tokens   # measures the shipped prompt prefix against the cache floor
npm.cmd run verify-cache   # TWO REAL CALLS to claude-sonnet-5: proves the cache_control breakpoint works (D161)

cd ../server
npm.cmd test               # the B0 hub, headless with a stub provider: 33 assertions
npm.cmd start              # http://127.0.0.1:8787 - needs Ollama with mistral-small:24b resident
# then, from client/:  MATIC_HUB_URL=http://127.0.0.1:8787 node test/hub-client.test.mjs   (adds one live turn)
#                      node eval/run-bakeoff.mjs --hub http://127.0.0.1:8787 mistral-small:24b
```

- `py -3`, not `python` — `python` is not on PATH. For scripted file edits use `node`, not Python.
- Bash heredocs in this environment mangle backslashes; put multi-line scripts in a file and run it.
- Many files are CRLF. Match the file's existing line endings when editing.

## Tests: consent is two-step (D130, landed 2026-09-03)

`client/test/consent-surface.test.mjs` demonstrated the review's largest finding (an unprivileged
agent could show one consent card and send a different proposal down the pipe) and carried the D130
acceptance test as expected failures. **D130 is implemented**: `prepareConsent(proposal, {locale})`
renders the card in the broker and retains the proposal; `execute(nonce)` runs what was retained.
The XFAILs were promoted to hard checks the same day; the file's XFAIL helper and exit-1-on-XPASS
mechanism are kept for the next such decision. Read
`client/docs/2026-09-03-consent-protocol-attack-notes.md` before touching the consent path — it
says why each line is where it is (clone on retain, burn before run, supersede and audit).

The `NamedPipeBroker` pipe protocol has not been designed yet. When it is, it serialises the
two-step shape; do not reintroduce a one-call `consentAndExecute`.

## Never

- Commit `.env`, an API key, or any `.onnx` file. Both are gitignored at two levels; keep it so.
- Claim a performance number. Only four things in this project have been measured: the model
  bake-off (one machine, 40 hand-written cases), the prompt prefix token count, one live
  prompt-cache check on Sonnet 5 (two calls), and the same bake-off through the B0 hub (identical to
  the direct path on 40 of 40 cases, one session). Everything else is a target and the docs say so.
- Let the hub validate, repair or reshape a proposal. It passes the model's tool call through as
  returned; malformed output is an error. A hub that fixes proposals becomes an authority on
  capabilities (H2). And do not add authentication to the B0 hub piecemeal — its value is in being
  obviously unfinished.
- Put broker logic in the renderer, or import `client/src/broker/win32/*` or `capabilities/*` from
  anywhere but a `Broker` implementation. `client/src/broker/broker.d.ts` explains why.
- Let the model author consent text. Consent wording is catalog data (`plain/*` in `catalog.json`).

## Working rules the project has learned the hard way

- Bugs are found by using the software, not reading it. Run the thing.
- State limitations before being asked; every handover carries an honesty ledger. Keep it.
- Commit messages: what changed and why, in prose. Co-author trailer for Claude:
  `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
