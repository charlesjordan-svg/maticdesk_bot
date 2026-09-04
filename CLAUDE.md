# CLAUDE.md — read before doing anything in this repo

**Then read [`PROJECT_START_HERE.md`](PROJECT_START_HERE.md)** — it is the index of status, documents
and blockers, and it is kept current. This file only tells you how to work here.

## Layout (since 2026-09-03)

| Path | What |
|---|---|
| `client/` | The Windows endpoint: Electron agent + privileged broker + four Win32 primitives. Runnable. All `npm` commands run **from `client/`**. |
| `server/` | The hub. **B0 walking skeleton since 2026-09-03**: one route (`POST /v1/turn`), one provider (Ollama), **no authentication, loopback only**, and loud about both. **Plus the B1 control plane since 2026-09-03 night** (D143, D193–D197): `migrations/`, `src/db/`, the job queue, `bin/db.mjs`. `pg` is its first dependency, so `npm.cmd install` is now needed. **`/v1/turn` stayed stateless and must stay so** — a test fails if it imports `src/db/`. **B1's six exit criteria pass** — `npm.cmd run test:db`, 56 assertions on PostgreSQL 17.11: `server/docs/B1-CONTROL-PLANE.md`. |
| `docs/decisions/DECISION-REGISTER.md` | **The** decision register. D1–D197, invariants H1–H6, conflicts, open items OPEN-1–OPEN-9 (**OPEN-5 closed 2026-09-03**). Cite it by this path. `docs/decisions/sources/` is superseded material with old numbering — never cite it. |
| `docs/` | Cross-cutting documents: the threat model (`2026-09-03-threat-model-v1.md` — adversaries A1–A11, gaps G1–G10, and the source of the G3/G4 labels other documents cite), the Phase 1 plan, the handover answers. |
| `docs/handovers/` | Founder handovers, kept for the record. The current one is `2026-09-03-claude-code-handover-b1-schema.md`. |
| `server/docs/` | Hub-side documents. `2026-09-03-B0-walking-skeleton-spec.md` is the B0 spike's spec; read its status block before citing any number in it, and §5a for what its acceptance list actually maps to. |
| `docs/kb/` | The generic knowledge base (`generic-kb-v2.json`) and its rules (D162). An article never names a capability or says what the bot does. Also the schema findings and **the KB architecture document** — retrieval, authoring UX and client UI, merged into the register as D167–D192. **Every D-number written inside that document is void**; it carries a banner saying so. |
| `Projects/`, `.obsidian/` | The founder's Obsidian notes. Not product code. |

The client used to live at `Projects/Ai Chat Bot -Matic/matic-desk-demo`. Handovers dated 2026-09-02
and earlier use that path; do not "fix" them, they are records.

## Branches

- `main` — current code. Work here or on feature branches off it.
- `add-matic-desk-demo` — the **frozen demo build**. Rehearsals run from it. Do not merge into it
  without being asked; every code change resets the demo's clean-run counter.
- `post-demo` — merged into `main` on 2026-09-03; historical.

## Decisions

- New decisions are **appended** to the register with the next free ID (**D193 onward**), with a status
  (*done* / *decided* / *proposed* / *rejected*) and a forcing reason. **Nobody renumbers.**
- Two chat documents dated 2026-09-03 numbered their own content D130–D168 in parallel with the
  register. Those IDs are **void**; the register's §0, §5.6 and §5.11a map them. Do not cite them.
  One of the two (`docs/kb/2026-09-03-kb-architecture-authoring-ux.md`) is now **in the repo** with a
  void-ID banner, merged as D167–D192. The other is still not on disk.
- **Two IDs are cited in the register but were never defined: `D46b` and `D52a`.** Register §5.11b
  says what to cite instead (`D46` + the `hub-client.test.mjs` pin; `D59a` + `D143`). Do not
  back-fill them — the register does not renumber.
- D130–D150 were assigned on 2026-09-03 from the independent design review; most are *proposed*,
  meaning the founder has not ratified them. Do not treat a proposed decision as settled.
- D1–D41 live only in `ASK-IT-questionnaire.xlsx`, which has never been downloaded. If it turns up,
  it goes into the register verbatim.
- Every document you write names other files **by path**, never by name alone. Two documents were
  declared missing in one day while sitting on disk.
- **A chat-produced document must be confirmed present on disk before any task depends on it.**
  Check the path with `ls` (or `Test-Path`) at the start of the session and say what you found. Seven
  documents have now gone missing between a chat session and the repo, and two of those cost
  partial reviews. Never reconstruct a missing one from memory or from the register. **The four
  that went missing on 2026-09-03 were later supplied by the founder and are filed** (threat
  model, Phase 1 plan, B0 spec, KB schema findings), along with the KB architecture document —
  and filing them changed real conclusions, which is the argument for the rule: the B0 spec's
  acceptance target was wrong, and the KB document held the entire retrieval architecture, which
  the register had recorded nowhere. Still missing:
  `2026-09-03-phase0-decisions-D130-D150.md` and `ASK-IT-questionnaire.xlsx` (D1–D41).

## Commands (Windows)

```bash
cd client
npm.cmd install            # npm.cmd, not npm — PowerShell execution policy blocks npm.ps1
#                            (same for npx: `npx.ps1` is blocked, so `npx.cmd`, or just use an npm script)
npm.cmd run fetch-voice    # 63 MB Piper model into client/voices/ (gitignored); needed for speech
npm.cmd test               # headless, no key, no admin, no hub: 278 assertions, 0 expected failures
# The renderer is NOT covered by any of it - no headless test can see a screen.
# client/docs/D130-RENDERER-CHECK.md is the manual click-through. Its §1 and §2 PASSED on
# 2026-09-03: the card on screen matched consentRendered field for field. §3 (supersede) and
# §4 (expired nonce) are still open. Charles runs it, not you.
npm.cmd run show-consent   # what the broker rendered and kept, for that comparison
npm.cmd run start:elevated # the app; needs .env with ANTHROPIC_API_KEY (see .env.example)
npm.cmd run count-tokens   # measures the shipped prompt prefix against the cache floor
npm.cmd run verify-cache   # TWO REAL CALLS to claude-sonnet-5: proves the cache_control breakpoint works (D161)

cd ../server
npm.cmd install            # pg - B1's dependency, and server/'s first
npm.cmd test               # B0 hub (33) + B1's source-level rules (43) = 76 assertions, no database
npm.cmd run db:up          # PostgreSQL 17 + pgvector in Docker, loopback, port 5433 (D197)
npm.cmd run migrate        # control plane + every tenant schema in one run
npm.cmd run test:db        # B1's six exit criteria: 56 assertions; needs db:up first
npm.cmd start              # http://127.0.0.1:8787 - needs Ollama with mistral-small:24b resident
# then, from client/:  MATIC_HUB_URL=http://127.0.0.1:8787 node test/hub-client.test.mjs   (adds one live turn)
#                      MATIC_HUB_URL=http://127.0.0.1:8787 node eval/e2e-hub-consent.mjs    (three demo scenarios, hub + two-step consent, headless)
#                      node eval/run-bakeoff.mjs --hub http://127.0.0.1:8787 mistral-small:24b
```

- `py -3`, not `python` — `python` is not on PATH. For scripted file edits use `node`, not Python.
- Bash heredocs in this environment mangle backslashes; put multi-line scripts in a file and run it.
- Line endings are governed by `.gitattributes` since 2026-09-03 (LF for source and docs, CRLF for
  `.ps1`). Write whatever your tool writes; Git normalises on add. Do not hand-convert.

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
- **Reach a tenant's tables by any route other than `withTenant()`** (`server/src/db/tenant.js`). It
  asserts the schema name against `control.tenants` before setting `search_path`, and `SET` takes no
  bind parameter — so the allow-list is the injection defence, not a tidiness check. Do not add a
  `getTenantClient()`; do not set `search_path` on checkout; do not schema-qualify tenant queries
  (D194 chose the other option, and the migration path depends on it). And do not claim tenant
  isolation: `search_path` stops accidents, not intent (**D195**, `server/docs/B1-CONTROL-PLANE.md`
  §6).
- **Add a payload column to `control.job_queue`** (D196). It is the one cross-tenant table and it
  carries references only. If a job seems to need data, put a row in the tenant's schema and
  reference it.
- Let the hub validate, repair or reshape a proposal. It passes the model's tool call through as
  returned; malformed output is an error. A hub that fixes proposals becomes an authority on
  capabilities (H2). And do not add authentication to the B0 hub piecemeal — its value is in being
  obviously unfinished.
- Put broker logic in the renderer, or import `client/src/broker/win32/*` or `capabilities/*` from
  anywhere but a `Broker` implementation. `client/src/broker/broker.d.ts` explains why.
- Let the model author consent text. Consent wording is catalog data (`plain/*` in `catalog.json`).
  **Verified on screen 2026-09-03:** the only model-authored string on the card is the labelled
  "Why this, here" line (`proposal.reasoning`). Nothing else on the card came from anywhere but
  `consentRendered`. If you add a string to the card, that stops being true.

## Working rules the project has learned the hard way

- Bugs are found by using the software, not reading it. Run the thing.
- State limitations before being asked; every handover carries an honesty ledger. Keep it.
- Commit messages: what changed and why, in prose. Co-author trailer for Claude:
  `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
