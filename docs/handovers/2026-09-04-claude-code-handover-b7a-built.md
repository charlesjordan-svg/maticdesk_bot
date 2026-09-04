# Claude Code Handover — 2026-09-04 — B7a built, the endpoint can ask, the social layer is in

**Repo root:** `C:\Users\Charles\Downloads\maticdesk_bot`. Repo paths are relative to it.

**Previous handover:** [`2026-09-04-claude-code-handover-unblock-and-b7a.md`](2026-09-04-claude-code-handover-unblock-and-b7a.md)
— every task in it is **done**, except 3c, which was left for Charles as instructed.

**Register:** v2.16, **D1–D212, next free D213**. Build notes:
[`../../server/docs/B7a-KNOWLEDGE-BASE.md`](../../server/docs/B7a-KNOWLEDGE-BASE.md).

---

## The one thing to read if you read nothing else

**Everything below has been run headless. Almost none of it has been seen on a screen.**

`client/src/renderer/renderer.js` gained two new branches today — `res.social` and `res.answer` —
and **neither has ever been looked at by a person.** No headless test can see a screen; `CLAUDE.md`
says so, and [`../../client/docs/D130-RENDERER-CHECK.md`](../../client/docs/D130-RENDERER-CHECK.md)
exists because that gap cost an evening once already. **Task 1 is closing it.**

That is not a caveat on a small thing. Three of this session's five defects were found by *using*
the software rather than reading it, and the renderer is now the largest surface nobody has used.

---

## On `main`, and pushed

`50a6f4e..62b6513`, **twelve commits, 38 files, +6924/−99.** Pushed to `origin/main` and verified
against the remote. Nothing uncommitted, nothing unpushed. `add-matic-desk-demo` untouched — the
frozen Sunday demo build is unaffected and **rehearsals still run from that branch, not `main`.**

| Commit | What |
|---|---|
| `ffc8c8f` | File the four chat documents of 2026-09-04, unaltered |
| `fdf6b61` | Ratify D152–D160, and move decision provenance into the SQL |
| `d1c0c53` | Build B7a: the hub answers questions, and declines when it cannot |
| `b301139` | List D201's pipe calls before the code, turn the traps into rules, and hand over |
| `f342f59` | Add the B7a build document, which should have gone in with the build |
| `ad5e6c4` | Record the commit history in the handover, and that it is pushed |
| `1552b57` | Record two founder answers: Q35 English-only for now, certificate ~1 month |
| `c605943` | Give the hub an index, because opening it in a browser told you nothing |
| `138c026` | Answer EADDRINUSE with the fix instead of a stack trace |
| `6402448` | Compute the startup banners instead of hand-padding them, and test that they close |
| `bbef791` | Let the endpoint ask a question, and find the seam that was broken between the two halves |
| `62b6513` | Build D165's social layer, so a greeting stops producing a consent card |

**The commit messages carry reasoning that is not repeated anywhere else** — `d1c0c53` on why the
answer path is a tool rather than relaxed `tool_choice`, `fdf6b61` on why provenance records
write-time status, `62b6513` on why the social branch is unconditional. `git log` is part of this
project's record, not a changelog.

**The register could not be split**, so `fdf6b61` carries §5.16 as well as §5.7 — D203–D207 land one
commit before the code they describe. Decisions precede implementation, so that order is right.

---

## State: what has been run

| | Result |
|---|---|
| `server/` — `npm.cmd test` (33 + 43 + 93) | **169 assertions**, nothing installed |
| `server/` — `npm.cmd run test:db` (56 + 52) | **108 assertions**, PostgreSQL 17.11 |
| `server/` — `npm.cmd run kb:accept` | **30/30**, B7a spec §8 end to end, incl. **5/5 negative** |
| `server/` — `npm.cmd run kb:answer` | **18/18**, real model, no database |
| `server/` — `npm.cmd run kb:floor` | ran. **A floor over fused RRF scores cannot work** |
| `client/` — `npm.cmd test` | **395 assertions across 10 files**, 0 XFAIL |
| `client/` — `npm.cmd run e2e:ask` | real agent → real hub → real model, run twice |
| Migration 002 against PostgreSQL 17.11 | applied clean |
| **The renderer** | **NEVER SEEN. Task 1.** |
| The bake-off through the hub | **NOT re-run.** See the ledger |

Both test runners now **discover** their files and **declare** their exclusions with a reason,
printed on every run. `server/`: `test:db` is `--excluded`. `client/`: `cloud.test.mjs` (real API
calls, costs money) and `privileged.test.mjs` (needs elevation) — both had silently fallen out of the
old `&&` chain, which is how porting the runner found them.

---

## Task 1 — click through the two new renderer branches

**The only task here that cannot be done headless, and the largest unverified surface in the repo.**

Mirror [`../../client/docs/D130-RENDERER-CHECK.md`](../../client/docs/D130-RENDERER-CHECK.md): a
short checklist against the real app, recording what was and was not verified. **Write the
checklist, then Charles runs it** — the same division as D130, and for the same reason.

Start the hub, point the client at it (`config.provider: "hub"`), and look at:

- **A greeting.** `res.social`. Must NOT show a consent card, must speak the template, and the
  inspector should read *"nothing executed. This turn never reached the consent path (D198)."*
- **"What can you do?"** The capability answer, generated from the catalog. **Check it against
  `catalog.json` by eye** — the whole point is that it cannot claim an ability that is not there, and
  a screen is where a wrong claim would actually be believed.
- **An answered question.** `res.answer`. The reply is spoken; the citation appears as a **separate
  source line** and is **not** spoken (H5 — attributed chrome, not the avatar's voice). That
  distinction exists only visually, so only a screen can confirm it.
- **A declined question.** Must read as a correct answer rather than a failure, and must print
  *"nothing was filed"* — an offer to raise a ticket can be heard as the act, which is why the
  escalation branch already says the same thing.
- **A polite problem report** — "hi, my printer is broken". Must reach the proposal path and show a
  card. If a template answers this, the silent failure §5.19a warns about is live.

**Two known unknowns to look for specifically**, because no headless test can:

- `say()` is handed a long paragraph by the capability answer — **the longest string the avatar has
  ever been given.** Check the lip-sync and the timing.
- `res.answer`'s inspector JSON now carries a `retrieval` object, which may push the panel out of
  view. That is a defect this project has hit before.

---

## Task 2 — D148 and OPEN-1, still for Charles

Unchanged and deliberately not done. §10.4's correction (the SID comes from
`GetTokenInformation(TokenUser)`, not from any `WTS_INFO_CLASS`) is not reflected in D148's text and
OPEN-1 carries no note. Recommendation stands: leave D148's text, add a dated correction note
beneath it, annotate OPEN-1 with the same. **The register does not silently rewrite a decision's
text, so this needs Charles's word.**

---

## What is genuinely next, after Task 1

In the order I would take them, with why:

1. **The pipe (D200/D201).** `BROKER-SURFACE.md` already lists the calls, which was the precondition
   ratifying D201 accepted — the document work is done and the code is not. Still unchosen: koffi vs
   an N-API addon vs a small signed helper, which interacts with D147. And **the last mile of §10.5
   is still unrun** — a real LocalSystem service with a real standard-user agent. That experiment is
   minutes, and **if the write somehow succeeds, most of D201 is unnecessary.** Do it before any
   engineering.
2. **B2** — local accounts, TOTP, roles, admin-action audit. Days. Unblocked since `fdf6b61`. When it
   starts, **D158 is the thing to watch**: it is ratified and inert, and an approval workflow built
   against it is Phase 2 scope arriving through the back door.
3. **B3 / device authentication.** `authenticate()` in `server/src/index.js` is three lines returning
   `{mode: "none"}`, and everything else the hub needs hangs off fixing it — real tenancy is
   impossible before it and nearly free after. §9 puts it at **6–8 engineer-weeks on its own**, so it
   does not fit inside the certificate's month.
4. **The reranker measurement (D207/D209).** Q35's answer settled the pick; what is missing is a
   latency figure, and D207 records why that is a harder question than a parameter count.

**None of these is gated on Daniel.** The certificate gates the *endpoint* shipping — signed MSI,
then EDR. All four are server- or client-side and touch neither.

---

## What changed in the register

**v2.11 → v2.16, D201 → D212.** Ratified: **D152–D160** as a set (§5.7), as a separate act from
B1's the same day. Proposed and awaiting Charles: **D202**. Everything else new is proposed.

| | |
|---|---|
| **§5.7b** | Migration provenance: SQL names the decision **and the status it held when the migration was written**, appended to and never rewritten. **Limitation found the same day:** once a migration is applied its comment is frozen by the runner's checksum, so this covers decisions predating first application and nothing after. **Never edit an applied migration to add provenance.** |
| **D203** | D199's embedder is **not in Ollama's library**. The dev embedder is the **L** variant — different architecture, 568M vs 305M, 1024 dims vs 768, and MTEB-ranked *better*. So **dev latency is a pessimistic proxy and dev quality an optimistic one**, and the L sits in the parameter class D199 rejected. **A dev runtime choice, not an amendment to D199.** |
| **D204** | The generic corpus lives in the control plane. Decided quickly, and the register says so rather than implying deliberation. |
| **D205** | **Nothing in this system could return a prose answer** — `tool_choice: "required"` on both providers, HTTP 502 on a no-tool-call. An `answer` tool makes the decline a **testable field**, and an answer citing no supplied article is **downgraded to a decline**. |
| **D206** | Questions go to a second route, `/v1/ask`. Adding a database to `/v1/turn` would have meant deleting the test that keeps it stateless. |
| **D207** | The reranker is retrieved and **not picked**: a cross-encoder costs **per-query × per-candidate**, which is the real question and was in none of the handovers. |
| **D208** | **Q35: English only, for now** (founder). *"For now"* is part of it — it licenses cheaper English-only components and does **not** license making a reversal a migration rather than a redeploy. |
| **D209** | Selects within D207's own recorded fork: the reranker pick becomes **`gte-reranker-modernbert-base`** (150M, int8 ONNX, 8192 context) over the 306M multilingual one. Still not a decision to build — no latency figure exists. |
| **D210** | **D199's deciding reason is spent.** It was "this removes Q35 from the critical path", and Q35 is answered. D199 stands; `nomic-embed-text-v1.5` (137M, same 768 dims) is the pre-argued alternative and is **not** adopted, because no latency measurement exists for either and "for now" can revert. |
| **D211** | The endpoint classifies question vs action and calls `HubClient.ask()`. Biased towards the measured path; a declined question does **not** fall through to a consent card; gated **by capability, not provider name**, so the demo cannot reach it. |
| **D212** | **D165's social layer, built.** D198's defect is fixed. The capability answer is **generated from `broker.listCapabilities()`**; with an unreadable catalog it promises nothing. Called **unconditionally**, which corrects D211's gating. |

### The relevance floor is answered, and the mechanism is wrong (§5.16c)

Worth reading before anyone reaches for a threshold. Reproduce with `npm.cmd run kb:floor`.

Every fused top score is `2/61` (both legs, rank 1) or `1/(60 + rank)`. **That is arithmetic, not a
distribution: the score encodes rank and leg agreement and carries no similarity magnitude**, because
the rank transform discarded it — which is what RRF is *for* (D174 chose it so a `ts_rank` and a
cosine never need reconciling) and is exactly what a floor needs.

The distributions overlap for a reason more articles will not fix: **a dense leg has no notion of
"no match"** and returns every chunk for every query, so an uncovered question's nearest neighbour
scores the same `1/61` as a correctly-retrieved covered question whose phrasing shares no terms with
its article. Two of ten covered questions did exactly that. **A threshold there is really asking
"did the lexical leg agree?" — a one-bit test wearing a decimal point.**

If a relevance signal is ever wanted: the raw semantic cosine *before* fusion, or leg agreement made
explicit. Neither is a value for that constant. **The mechanism generalises; the 20-question
distribution is a sample and is not a measurement.**

---

## Traps, all of them found the hard way

`CLAUDE.md` carries these as rules. Four are instances of one class — **a false signal wearing the
shape of the expected answer**, where care does not help and only an independent check does.

- **A pipe replaces the exit code with the last stage's.** A backgrounded
  `docker compose up -d 2>&1 | tail -20` was reported as exiting 0 — that was `tail`'s status —
  while its own output said it could not reach the Docker daemon. **Read the output, not the status.**
- **`"darwin".includes("win")` is true.** `platformFromProbe` classified every Mac as Windows — the
  exact D162 failure the pre-filter prevents, arriving through the pre-filter, and it **would have
  presented as a pass.**
- **A Windows pipe path losing backslashes through bash** produced an `EACCES` indistinguishable
  from D201's finding. Hit **twice**, the second time while writing the note about the first.
- **A bare `"Hi"` classified as an action.** Punctuation was enumerated (`"hi "`, `"hi!"`, `"hi."`)
  where the problem was word boundaries.
- **Never hand Charles a `&&` command.** Windows PowerShell 5.1 makes it a **parser error**, so the
  whole line fails before anything runs. PowerShell, separate lines, absolute path.
- **PowerShell helpers return one thing.** Status to `Write-Host`; explicit `[bool]` at the call
  site. 7.1% of this repo — this will recur.
- **Comments are stripped before scanning source in a test.** A test forbidding
  `provider === "hub"` failed on the comment *explaining* that the check is a capability check —
  "a test starting to fail for saying the right thing", which `db-static.test.mjs` already documents.
- **`npm test` runs every file and reports all before exiting non-zero.** Both packages now do. And
  **exclusions are declared with a reason**, because "belongs out" and "was forgotten" look
  identical in a hand-written chain and only one of them is a decision.

---

## On Charles, not the next session

- **Task 1's click-through**, once the checklist exists. Needs a screen; no elevation.
- **§3 and §4 of [`../../client/docs/D130-RENDERER-CHECK.md`](../../client/docs/D130-RENDERER-CHECK.md)** — supersede and expired nonce. Five minutes, still open.
- **D202** — yes or no (§5.7a). Gates nothing.
- **D148 and OPEN-1 wording** (Task 2).
- **Q9 — which EDR products the design partner runs.** Q35 is answered, so this goes on its own.
  **It is now the item on the critical path**: the certificate has an estimate (≈2026-10-04) and Q9
  has none, and Q9 can be answered *during* the wait so the submission is ready when the binary is.
- **The top-30 ticket categories.** ~7 weeks outstanding. Gates *evaluating* Phase 1, not building it.
- **The Anthropic Scale tier.** The certificate's month is exactly the window — it accrues by spend
  history rather than by payment, nothing is accruing, and running part of the eval loop against
  `claude-haiku-4-5` would start it *and* give regression coverage on the shipped model. If that
  month passes with nothing accruing, next month is the same conversation.

---

## Honesty ledger

- **The renderer has never been looked at.** Two new branches, zero screens. Task 1.
- **The bake-off through the hub was not re-run** (B7a spec §8 item 9's third clause). `/v1/turn`
  was not modified and a test still asserts it reaches no database, so there is no reason to expect
  movement — **but that is an argument, not a run.**
- **Nothing about retrieval quality can be concluded from B7a.** Six articles, **no reranker**, no
  corpus, and a dev embedder that is not the shipped model. Every figure is a floor.
- **`RRF_K = 60` is still an unretrieved convention.** `CANDIDATES_PER_LEG = 20` where D174 says
  ~50 — with six articles neither is reachable. The kind weights are reasoned from "users describe
  problems, not fixes", not measured.
- **The floor result's mechanism generalises; its distribution does not.** 20 questions this session
  chose, 6 articles. Not a measurement, and it does not join §10.3.
- The claim that no GGUF of `arctic-embed-m-v2.0` exists **because** of its custom architecture is
  **inference, not retrieved.** The observable facts are retrieved; the causal link is ours.
- **D165's templates are one person's wording.** Deterministic and catalog-checked, which is what
  D165 required — but nobody has read them aloud to a user. **The capability answer is the one to be
  least confident about: it is long, and it is the only template that grows with the catalog.**
- **The classifier's marker lists are judgement, not data.** No corpus of real utterances exists to
  tune them against; the bias towards the measured path is what makes being wrong survivable.
- **`ASK-IT-questionnaire.xlsx` (D1–D41) and `2026-09-03-phase0-decisions-D130-D150.md` are still
  not on disk.** Do not reconstruct either. **D130–D150 are still proposed and the document arguing
  for them cannot be read**, so anyone ratifying that set works from the register's summary of an
  argument that no longer exists in full. **Q35, Q9 and Q39 are the same problem one level down:**
  cited throughout the register, defined nowhere in it (§5.17).
- Work is **committed and pushed** — `50a6f4e..62b6513` on `origin/main`, verified against the remote.
