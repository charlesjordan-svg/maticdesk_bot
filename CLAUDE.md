# CLAUDE.md — read before doing anything in this repo

**Then read [`PROJECT_START_HERE.md`](PROJECT_START_HERE.md)** — it is the index of status, documents
and blockers, and it is kept current. This file only tells you how to work here.

## Layout (since 2026-09-03)

| Path | What |
|---|---|
| `client/` | The Windows endpoint: Electron agent + privileged broker + four Win32 primitives. Runnable. All `npm` commands run **from `client/`**. |
| `server/` | The hub. **TWO ROUTES since 2026-09-04.** `POST /v1/turn` is B0's walking skeleton: proposes a machine change, one provider (Ollama), **stateless — a test fails if it imports `src/db/`, and B7a did not touch it** (D206). `POST /v1/ask` is B7a: answers a question from the knowledge base, and IS stateful. **No authentication and no tenancy on either, loudly** (`x-matic-hub-auth: none`, loopback only, a startup banner). **B1 control plane** (D143, D193–D197): `migrations/`, `src/db/`, the job queue, `bin/db.mjs`. **B7a knowledge base** (D203–D207): `migrations/control/002-generic-kb.sql`, `src/kb/`, `bin/kb.mjs`. `pg` is the only dependency. Docs: `server/docs/B1-CONTROL-PLANE.md`, `server/docs/B7a-KNOWLEDGE-BASE.md`. |
| `docs/decisions/DECISION-REGISTER.md` | **The** decision register, v2.13. D1–D207, invariants H1–H6, conflicts, open items OPEN-1–OPEN-9 (**OPEN-5 closed 2026-09-03**). Cite it by this path. `docs/decisions/sources/` is superseded material with old numbering — never cite it, **except the dated ratification notes**, which are records of a founder decision rather than superseded design. |
| `docs/` | Cross-cutting documents: the threat model (`2026-09-03-threat-model-v1.md` — adversaries A1–A11, gaps G1–G10, and the source of the G3/G4 labels other documents cite), the Phase 1 plan, the handover answers. |
| `docs/handovers/` | Handovers, kept for the record. **Start with the newest: `2026-09-04-claude-code-handover-b7a-built.md`.** The one before it (`2026-09-04-claude-code-handover-unblock-and-b7a.md`) set the tasks that produced it, and `2026-09-04-claude-code-handover-b2-and-open-items.md` before that. The 2026-09-03 ones run founder → session; the 2026-09-04 ones run the other way. |
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

- New decisions are **appended** to the register with the next free ID (**D213 onward**), with a status
  (*done* / *decided* / *proposed* / *rejected*) and a forcing reason. **Nobody renumbers.**
- **When a migration implements a decision, the SQL names it AND the status it held when the
  migration was written** (register §5.7b) — `-- D153 (PROPOSED when written; ratified 2026-09-04)`.
  **The comment is appended to, never rewritten**, because a comment that silently tracks current
  status loses the only fact worth recording: that the shape went in before the decision came out.
- Two chat documents dated 2026-09-03 numbered their own content D130–D168 in parallel with the
  register. Those IDs are **void**; the register's §0, §5.6 and §5.11a map them. Do not cite them.
  One of the two (`docs/kb/2026-09-03-kb-architecture-authoring-ux.md`) is now **in the repo** with a
  void-ID banner, merged as D167–D192. The other is still not on disk.
- **Two IDs are cited in the register but were never defined: `D46b` and `D52a`.** Register §5.11b
  says what to cite instead (`D46` + the `hub-client.test.mjs` pin; `D59a` + `D143`). Do not
  back-fill them — the register does not renumber.
- D130–D150 were assigned on 2026-09-03 from the independent design review; most are *proposed*,
  meaning the founder has not ratified them. Do not treat a proposed decision as settled.
- **Ratified by the founder on 2026-09-04: D199 (the embedder), D199a (as a revisit trigger only),
  D200 and D201 (the pipe protocol and its transport).** Two consequences worth knowing: the pipe
  **wire format is now a contract** — changing `execute`'s shape needs a new decision, not a patch —
  and D201's ratification **accepts a named growth of `BROKER-SURFACE.md`**, so the new pipe
  lifecycle calls must be listed there *before* any implementation merges.
- **Ratified as sets on 2026-09-04: D167–D192** (the KB architecture) **and D193–D197** (B1). Three
  caveats in §5.11c survive that ratification and must not be softened by it: **D173 rests on
  "findability beats volume", which KCS retrieval did NOT confirm** (it is our own argument — do
  not cite KCS for it); the `k ≈ 60` RRF convention is still unretrieved; and nothing in the set is
  measured on our corpus, because there is no corpus. **D174's cross-encoder options ARE now
  retrieved (D207) but it is still not picked, and its CPU viability is still unmeasured** — and
  D207 records why that is a harder question than a parameter count: a cross-encoder costs
  per-query × per-candidate, not per-query.
- **B7a implemented D174's lexical leg, semantic leg and RRF fusion; the cross-encoder is absent**
  (D207). So B7a's retrieval numbers are a floor, not a measurement of the design.
- **Ratified as a set on 2026-09-04: D152–D160** (OPEN-6's human-identity and authorisation model,
  §5.7), as a **separate act** from B1's ratification the same day. Two consequences: **D158
  (author ≠ approver for the catalog) is ratified but INERT in Phase 1** — D149 deferred catalog
  distribution, so there are no drafts to approve, and **if B2 starts building an approval workflow
  that is Phase 2 scope arriving through the back door**; and **D202 is proposed and awaits Charles**
  (§5.7a: step-up for vendor-grant creation, the one item D157's list missed — it gates nothing,
  because `admin_audit.step_up` is indifferent to what is on the list).
- **Still proposed: D130–D150** (the design review) and **D202–D212**. Note that a proposed row's
  status cell reads the same as a ratified set's used to — **never search-and-replace a status
  file-wide.**
- **Q35 is ANSWERED: English only, FOR NOW** (founder, 2026-09-04 — D208, register §5.17). *"For
  now"* is part of the decision: it licenses choosing English-only components where they are
  cheaper, and does **not** license making a later reversal a migration rather than a redeploy.
  `control.kb_chunks.tsv` is already `to_tsvector('english', …)`, which is now backed by a
  decision rather than a default. Two consequences: **D209** makes the reranker pick
  `gte-reranker-modernbert-base` (150M, int8 ONNX) over the 306M multilingual one — selecting
  within D207's own recorded fork; and **D210 records that D199's DECIDING REASON IS SPENT**, since
  that reason was "it removes Q35 from the critical path". D199 stands,
  `nomic-embed-text-v1.5` (137M, same 768 dims) is the pre-argued alternative, and it is **not**
  adopted because no latency measurement exists for either and "for now" can revert.
- **Q35, Q9 and Q39 are cited in the register and defined nowhere in it** — their text is in
  `ASK-IT-questionnaire.xlsx`, which has never been on disk. Same class as `D46b` / `D52a`.
  §5.17 records what Q35 was taken to mean so its answer is unambiguous without the workbook.
- **Do not read a built schema as evidence that the decisions behind it were ratified.** B1's
  ratified schema implemented D152–D160's shapes before those decisions were accepted. That was
  correct (D160 asked for the shapes, and they are cheap now and expensive later) and it is NOT
  evidence of ratification. The same inference error had to be corrected once in §5.12 and once in
  §5.7, which is why §5.7b now puts the provenance in the SQL.
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
npm.cmd test               # ALL files, REPORTS ALL, exits non-zero at the end (test/run-all.mjs):
#                            headless, no key, no admin, no hub: 395 assertions across 10 files.
#                            It also PRINTS what it deliberately does not run and why -
#                            cloud.test.mjs (real API calls, costs money) and privileged.test.mjs
#                            (needs elevation). Both had silently fallen out of the old && chain.
# The renderer is NOT covered by any of it - no headless test can see a screen.
# client/docs/D130-RENDERER-CHECK.md is the manual click-through. Its §1 and §2 PASSED on
# 2026-09-03: the card on screen matched consentRendered field for field. §3 (supersede) and
# §4 (expired nonce) are still open. Charles runs it, not you.
npm.cmd run show-consent   # what the broker rendered and kept, for that comparison
npm.cmd run start:elevated # the app; needs .env with ANTHROPIC_API_KEY (see .env.example)
npm.cmd run count-tokens   # measures the shipped prompt prefix against the cache floor
npm.cmd run verify-cache   # TWO REAL CALLS to claude-sonnet-5: proves the cache_control breakpoint works (D161)
npm.cmd run verify:pipe    # D201: reads the DACL Windows gives a Node pipe and exercises the
#                            access check. RUN UNELEVATED - an elevated token has Administrators
#                            enabled rather than deny-only and the write succeeds (wrong answer).

cd ../server
npm.cmd install            # pg - the only dependency
npm.cmd test               # ALL files, REPORTS ALL, exits non-zero at the end (test/run-all.mjs):
#                            B0 hub (33) + B1 source rules (43) + B7a source rules (93) = 169
npm.cmd run db:up          # PostgreSQL 17 + pgvector in Docker, loopback, port 5433 (D197)
npm.cmd run migrate        # control plane + every tenant schema in one run
npm.cmd run test:db        # the files that need the database: B1's six exit criteria (56) + B7a retrieval (52) = 108
npm.cmd run kb:ingest      # the six generic articles -> control.kb_* , then embed them
npm.cmd run kb:status      # what is loaded, and WHICH MODEL embedded it (two models = two spaces)
npm.cmd run kb -- legs "DisplayLink"      # the two retrieval legs, side by side, UNFUSED
npm.cmd run kb -- retrieve "my mouse cuts out" --platform windows
npm.cmd run kb:accept      # B7a's acceptance list end-to-end (30); needs db + Ollama. NEGATIVE TEST FIRST
npm.cmd run kb:answer      # the answer contract against a real model (18). Ollama only, NO database
npm.cmd run kb:floor       # is a relevance floor possible? Answer: NOT over fused RRF scores (§5.16c)
ollama pull snowflake-arctic-embed2:568m  # the DEV embedder. NOT D199's model - see D203
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

The `NamedPipeBroker` pipe protocol is **designed** (D200–D201,
`client/docs/2026-09-04-named-pipe-protocol-design.md`) and **not built**. It serialises the
two-step shape: `execute` takes a nonce and the wire schema has nowhere to put a proposal. **Do not
add a parameter to `execute`** and do not reintroduce a one-call `consentAndExecute` — either
re-opens the finding the whole design answers. Two things to know before touching it: **a
LocalSystem-hosted Node pipe gives the unprivileged agent read and no write** — libuv passes NULL
security attributes, and this is **measured, not assumed** (`npm.cmd run verify:pipe`, register
§10.5: `GENERIC_READ` allowed, `GENERIC_WRITE` refused with ERROR_ACCESS_DENIED) — so the transport
needs native creation with an explicit DACL (D201); and **that DACL is not a defence against
user-context malware and cannot be** — D130's audit trail is what covers that (§5.15a).

## Traps this project has actually fallen into — rules, not anecdotes

These are in the register, but the register is not what a session reads first. Every one produced a
**confident wrong answer that looked right.**

- **A FALSE SIGNAL WEARING THE SHAPE OF THE EXPECTED ANSWER IS THE ONE CLASS WHERE CARE DOES NOT
  HELP. Only an independent check does.** Three instances now:
  - A Windows pipe path lost its backslashes through bash, and the resulting `EACCES` was
    **indistinguishable from the finding being sought** (D201's blocker). Hit **twice** — the second
    time while writing the note about the first. **Build Windows paths inside the script, and assert
    a path is well-formed BEFORE drawing any conclusion from a failure to open it.**
  - `"darwin".includes("win")` is **true**. `platformFromProbe` (`server/src/kb/ask.js`) tested
    `win` first and classified every macOS machine as Windows — the exact D162 failure the platform
    pre-filter exists to prevent, arriving through the pre-filter, and it would have PRESENTED AS A
    PASS (the macOS article correctly withheld from a Mac, for entirely the wrong reason). Caught by
    a test asserting `darwin -> macos`, not by reading the line. Register §5.16b.
- **PowerShell helpers return ONE thing.** Status goes to `Write-Host`; cast booleans explicitly at
  the call site (`[bool]`). A function that prints status *and* returns a boolean puts both on the
  pipeline, the caller captures an array, **every array is truthy**, and a verdict silently inverts.
  **PowerShell is 7.1% of this repo — this will recur.**
- **Reproduce a measured ACL exactly; never approximate one.** Use the mask you measured. And
  `verify:pipe` runs **unelevated or not at all** — an elevated token has Administrators enabled
  rather than deny-only, and the write wrongly succeeds.
- **`npm test` runs every file, reports every result, and exits non-zero at the END.** `&&`
  short-circuits, so the first failure hides every later file: two environment failures once aborted
  eight others. `server/` does this via `test/run-all.mjs`. **`client/package.json` still chains
  with `&&` and should be moved to the same shape.**
- **A PIPE REPLACES THE EXIT CODE WITH THE LAST STAGE'S.** `some-command | tail -20` exits 0
  whenever `tail` succeeds, *however hard `some-command` failed* — so anything reporting "exit code
  0" for a piped command is reporting `tail`. Hit on 2026-09-04: a backgrounded
  `docker compose up -d | tail -20` was announced as having completed successfully while its own
  output said it could not reach the Docker daemon, and port 5433 was closed. **Read the output, not
  the status, whenever a command is piped** — or drop the pipe when the exit code is what you care
  about. Same class as the `&&` rule above and as the two false-signal traps: the wrong answer
  arrived wearing the shape of the right one.
- **`npm.cmd test` writes to the app's audit log, and `reset-demo` deletes it.** Do not reset
  between using the app and reading a record.
- **`npm.cmd run <script>`, never `npx.ps1`** — execution policy blocks it. `npm.cmd`, not
  `npm`. `py -3`, not `python`.
- **NEVER HAND CHARLES A COMMAND CHAINED WITH `&&`.** He runs **Windows PowerShell 5.1**, where
  `&&` is a **parser error**, not a fallback: *"The token '&&' is not a valid statement separator in
  this version."* The whole line fails before anything runs. Hit on 2026-09-04 —
  `cd server && npm.cmd run db:up && npm.cmd start` was pasted into an Administrator PowerShell and
  produced two parser errors and no server. The command blocks in this file are fenced ```bash and
  are written for the Bash tool; **a command meant for Charles must be PowerShell, on separate
  lines, with an absolute path** (his prompt is usually `C:\Users\Charles`, not the repo):

  ```powershell
  cd C:\Users\Charles\Downloads\maticdesk_bot\server
  npm.cmd run db:up
  npm.cmd start
  ```

  Sequential-if-success in PowerShell 5.1 is `A; if ($?) { B }`, and unconditional is `A; B` — but
  separate lines are clearer and there is no reason to chain an interactive command anyway.
  `npm.cmd start` blocks, so anything after it never runs regardless.
- **A chat-produced document is not on disk until you have looked.** `ls` the path at the start of
  the session and say what you found. **Never reconstruct a missing one** — from memory or from the
  register's summary of it.

## Never

- Commit `.env`, an API key, or any `.onnx` file. Both are gitignored at two levels; keep it so.
- Claim a performance number. Only four things in this project have been measured: the model
  bake-off (one machine, 40 hand-written cases), the prompt prefix token count, one live
  prompt-cache check on Sonnet 5 (two calls), and the same bake-off through the B0 hub (identical to
  the direct path on 40 of 40 cases, one session). Everything else is a target and the docs say so.
  **Verifications are not measurements and do not lengthen that list.** B1's exit criteria (§10.3a
  family), the D130 renderer check and the D201 pipe DACL are *pass/fail against a real system* —
  they establish that something behaves as claimed, and none of them is a latency, throughput or
  cost figure. The register keeps them in §10.3a/§10.5, apart from §10.3's four numbers, on purpose.
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
- **Add a database dependency to `server/src/turn.js`** (D206). B7a added `/v1/ask` rather than a
  flag, precisely so the stateless path is not something a later edit can quietly undo, and
  `test/db-static.test.mjs` enforces it. Questions go to `/v1/ask`; proposals go to `/v1/turn`.
- **Return an answer the system cannot attribute to a retrieved article** (D205). `/v1/ask` answers
  through an `answer` tool with an `answered` boolean; a citation of an article that was not
  supplied is dropped, and `answered: true` with no surviving citation is **downgraded to a
  decline** — an unattributable answer is an answer from training wearing the company's authority.
  Do not relax `tool_choice`, and **do not add a general-knowledge fallback when retrieval finds
  nothing.** That is the whole of B7a and there is no flag for it.
- **Set `RELEVANCE_FLOOR` over a fused RRF score** (`server/src/kb/retrieve.js`). It is `null`,
  and that is now **measured rather than deferred** — `npm.cmd run kb:floor`, register §5.16c.
  **A floor over fused RRF scores cannot work by construction:** every top score is `2/61` (both
  legs agreed at rank 1) or `1/(60 + rank)`, so **the score encodes rank and leg agreement and
  carries no similarity magnitude** — discarding magnitude is what RRF is *for* (D174 chose it so a
  `ts_rank` and a cosine never have to be reconciled), and magnitude is exactly what a floor needs.
  The distributions overlap because the dense leg returns **every** chunk for **every** query — a
  dense leg has no "no match" — so an uncovered question's nearest neighbour scores the same
  `1/61` as a correctly-retrieved covered question whose phrasing shares no terms with its article.
  **If a relevance signal is wanted, threshold the raw semantic cosine BEFORE fusion, or use leg
  agreement explicitly** — both are new mechanisms needing a decision, not a value for this constant.
- **Let a client name its own tenant.** `/v1/ask` refuses `tenant`/`tenantId`/`tenantLabel` in
  the request body with a 400. B7a's tenancy is a server-side log label because device
  authentication is not built (D61, D132), and a client-supplied tenant becomes the tenancy model by
  default — which is worse than having none.
- **Put retrieved chunk text in a system prompt, or let it leave the hub** (G4, D53). Articles go in
  a user-role message inside a delimited block, marked as reference material and not instruction;
  `/v1/ask` returns article IDs and counts, never chunk text.
- **Quote a retrieval quality number from B7a without the caveat.** Six articles, **no
  cross-encoder reranker** (D207), and a dev embedder that is **not D199's model** (D203). Every
  figure is a FLOOR, not a measurement of the design.
- **Embed a corpus with two different models.** Vectors from different models are in different
  spaces and retrieval is then confidently wrong for part of the corpus.
  `control.kb_chunks.embedding_model` exists to make that detectable; `npm.cmd run kb:status`
  reports it, and `node bin/kb.mjs reembed` is the fix.
- Put broker logic in the renderer, or import `client/src/broker/win32/*` or `capabilities/*` from
  anywhere but a `Broker` implementation. `client/src/broker/broker.d.ts` explains why.
- **Offer a consent card the user did not provoke** (**D198**). A greeting answered with a card is a
  defect even when every gate behaved correctly: it teaches the user that the card is noise to click
  past, and `consent-surface.test.mjs` will still pass on the day it has become furniture.
  **D165's social layer is BUILT as of 2026-09-04** (D212, register §5.19):
  `client/src/router/social.js` plus the social branch of `classify()`, called **unconditionally**
  from `Agent.propose()` ahead of every provider call and of `routeByState()`. The observed case
  ("Hello how are you?" → a `renew_dhcp` card) is the first assertion in
  `client/test/classify.test.mjs` §4. **This removed one source of unprovoked cards, not the
  general possibility** — the rule stands.
- **Hand-write a list of what the assistant can do.** The capability answer is generated from
  `broker.listCapabilities()` (D165, D212): a hand-written list is a claim, a generated one is a
  fact, and with an unreadable catalog the assistant promises nothing rather than claiming from
  memory. Read tier labels from `capability.tierInfo`, never from `broker.catalog` — reaching
  through a Broker into its catalog is the layering violation `broker.d.ts` exists to prevent.
- Let the model author consent text. Consent wording is catalog data (`plain/*` in `catalog.json`).
  **Verified on screen 2026-09-03:** the only model-authored string on the card is the labelled
  "Why this, here" line (`proposal.reasoning`). Nothing else on the card came from anywhere but
  `consentRendered`. If you add a string to the card, that stops being true.

## Working rules the project has learned the hard way

- Bugs are found by using the software, not reading it. Run the thing.
- State limitations before being asked; every handover carries an honesty ledger. Keep it.
- Commit messages: what changed and why, in prose. Co-author trailer for Claude:
  `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
