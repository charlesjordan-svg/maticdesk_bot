# Claude Code Handover — 2026-09-04 — B7a is built and verified, and three of its spec's premises were wrong

**Repo root:** `C:\Users\Charles\Downloads\maticdesk_bot`. Repo paths are relative to it.

**Previous handover:** [`2026-09-04-claude-code-handover-unblock-and-b7a.md`](2026-09-04-claude-code-handover-unblock-and-b7a.md)
— Tasks 0, 1, 2a, 2b, 3a, 3b and 4 are **done**. Task 3c was left for Charles as instructed.

**Register:** v2.13, **D1–D207, next free D208**. Build notes:
[`../../server/docs/B7a-KNOWLEDGE-BASE.md`](../../server/docs/B7a-KNOWLEDGE-BASE.md).

---

## State: everything is run

A Docker Desktop update (to 29.7.2) cleared the engine failure that had blocked the database half,
so nothing is left unverified.

| What | Result |
|---|---|
| `npm.cmd test` from `server/` — 33 + 43 + 93 | **169 assertions, all pass.** Nothing installed |
| `npm.cmd run migrate` — migration 002 against PostgreSQL 17.11 | **applied clean** |
| `npm.cmd run kb:ingest` | 6 articles → 18 chunks → 18 embeddings |
| `npm.cmd run test:db` — 56 (B1) + 52 (B7a) | **108 assertions, all pass** |
| `npm.cmd run kb:accept` — the spec's §8 list, end to end | **30/30**, incl. **5/5 on the negative test** |
| `npm.cmd run kb:answer` — the answer contract, real model, no database | **18/18** |
| `npm.cmd run kb:floor` — is a relevance floor possible? | **ran. Answer: not over fused RRF scores** |
| `client/` — unchanged by B7a | **278 assertions, 0 XFAIL** — closes acceptance item 9 |

One prediction confirmed rather than assumed: the bare `vector(1024)` resolves inside the `control`
schema through `withControl`'s `SET LOCAL search_path = extensions`. That was reasoning when it was
written; it is now fact. The HNSW index built without incident.

---

## Task 1 — the endpoint still has no way to ask a question

**This is the only real gap in "a local agent that can answer questions and a Hub it can connect
to."** The hub half is built and verified. The agent half is not: `client/src/agent/hub-client.js`
speaks `/v1/turn` only, and D205's answer shape is new, so `HubClient` needs an `ask()` path.

Four things to know before writing it:

- **`propose()` and `ask()` are different operations and should stay different methods.** `propose()`
  returns a `Proposal` for the broker; `ask()` returns `{answered, reply, citedArticleIds}` and
  never touches the broker. Multiplexing them re-creates the problem D206 avoided on the hub side.
- **The agent has to decide which one to call**, and that decision exists nowhere yet. It is a
  router question, not a provider question, and it sits next to **D165's social layer, which must go
  AHEAD of `routeByState()`** (D198). Both are "classify the input before routing it", and doing
  them separately means classifying twice.
- **Tier-0 still runs first** (D46b). A question tier-0 answers deterministically must not reach the
  hub.
- **The citation is attributed chrome under H5, not the avatar's voice.** `citedArticleIds` is a
  separate field precisely so the renderer can present it as a source rather than as speech. **Do
  not concatenate it into `reply`.**

---

## Task 2 — two carry-overs

### 2a. `client/package.json` still chains its tests with `&&`

`server/` now runs every file, reports every result, and exits non-zero at the end
(`server/test/run-all.mjs`). **`client/` does not** — nine files chained with `&&`, so the first
failure hides the other eight. That is the trap the register and the analysis document both list as
already paid for, and the fix is to port `run-all.mjs`. Small, and it is the one rule in `CLAUDE.md`
the repo does not yet satisfy everywhere.

### 2b. D148 and OPEN-1 — **still for Charles**

Unchanged and deliberately not done. §10.4's correction (the SID comes from
`GetTokenInformation(TokenUser)`, not from any `WTS_INFO_CLASS`) is not reflected in D148's text and
OPEN-1 carries no note. Recommendation stands: leave D148's text, add a dated correction note
beneath it, annotate OPEN-1 with the same. **The register does not silently rewrite a decision's
text, so this needs Charles's word.**

---

## The relevance floor is answered, and the answer is that the mechanism is wrong

This is the most useful thing the database run produced, and it is worth reading before anyone
reaches for a threshold. Register **§5.16c**; reproduce with `npm.cmd run kb:floor`.

Every fused top score across 20 questions was one of exactly five values:

| Score | What produced it |
|---|---|
| `2/61` = 0.032787 | the top chunk was found by **both legs**, rank 1 in each |
| `1/61` = 0.016393 | one leg only, rank 1 |
| `1/62` = 0.016129 | one leg only, rank 2 |
| `1/63` = 0.015873 | one leg only, rank 3 |
| `1/64` = 0.015625 | one leg only, rank 4 |

That is arithmetic, not a distribution. **The fused score is a function of rank and leg agreement
only — it carries no similarity magnitude**, because the rank transform discarded it. Discarding
magnitude is RRF's *selling point* (D174 chose it so a `ts_rank` and a cosine never have to be
reconciled) and it is precisely what a relevance floor needs.

**So the covered and uncovered distributions overlap, for a reason more articles will not fix.** The
semantic leg returned **all 18 chunks for every query**, covered or not — a dense leg has no notion
of "no match" — so an uncovered question's nearest neighbour lands at semantic rank 1 and scores
`1/61`, *identical* to a covered question whose phrasing shares no terms with its article. Two of
the ten covered questions did exactly that and were retrieved correctly. **A threshold here is
really asking "did the lexical leg agree?" — a one-bit test wearing a decimal point.**

**If a relevance signal is ever wanted, neither candidate is `RELEVANCE_FLOOR`:** threshold the raw
semantic cosine *before* fusion (`semanticLeg`'s `legScore`, real magnitude in [-1, 1]), or use leg
agreement (`lexRank !== null && semRank !== null`) explicitly. Both are new mechanisms needing their
own decision.

**Until then the prompt carries the decline, and the live results say it does so** — 5/5 on the
uncovered set through real retrieval, and 5/5 when handed a relevant-looking article that does not
answer the question.

**What is and is not evidence:** the **mechanism is not a sample** — `2/61` and `1/(60+rank)` are
what the formula computes. The **distribution is** a sample (20 questions this session chose, 6
articles, no reranker) and is **not** a measurement; it does not join §10.3.

---

## What changed in the register

**D152–D160 are ratified** (§5.7). Two things attached that are easy to lose:

- **D158 is ratified but INERT in Phase 1.** Author ≠ approver governs catalog changes; D149
  deferred catalog distribution. **If B2 starts building an approval workflow, that is Phase 2 scope
  arriving through the back door** and should be stopped rather than absorbed.
- **D202 is proposed and awaits Charles** (§5.7a). It gates nothing.

**The finding §5.7 exists to preserve:** B1's ratified schema already implemented D152–D160's
shapes. That was correct — D160 asked for them, and shapes are cheap now and expensive later — and
it was **never evidence those decisions were accepted.** The same inference error had to be
corrected twice. So **§5.7b now puts the provenance in the SQL**: a migration names the decision it
implements *and the status that decision held when the migration was written*, appended to and never
rewritten. `001-control-plane.sql` carries it retroactively.

### The three B7a findings that contradicted the spec

D203, D205, D206 in §5.16. Each changed code rather than a comment.

1. **D199's embedder is not in Ollama's library.** The tag that exists is the **L** variant — a
   different architecture (`XLMRobertaModel` vs `GteModel`), 568M against 305M, 1024 dims against
   768, and MTEB-ranked **better** (35 vs 41). **The near-miss is a trap:**
   `snowflake-arctic-embed:m` exists but is the **v1.0** suite, English-only — precisely what D199
   rejected. Consequence: **dev latency is a pessimistic proxy and dev quality an optimistic one**,
   both wrong directions. And the L sits in the parameter class D199 explicitly rejected (it turned
   down Qwen3-0.6B at 509–600M), so this is a **dev runtime choice and not an amendment to D199**.
2. **Nothing in this system could return a prose answer.** `tool_choice: "required"` on both
   providers; `/v1/turn` returns **502** on a no-tool-call; `HubClient` turns it into `{ok:false}`.
   What the spec mistook for prose was the `escalate` tool's template. Answers now come through an
   `answer` tool, and **an answer citing no supplied article is downgraded to a decline** —
   unattributable advice wearing the company's authority is the failure B7a exists to prevent.
3. **Questions went to `/v1/ask`, not a flag on `/v1/turn`**, because the second option meant
   deleting the test that keeps `/v1/turn` stateless.

### The reranker is retrieved and deliberately not picked (D207)

Options, licences, parameter counts, contexts and architectures are in §5.16. **The finding is a
cost shape that is in none of the handover documents: a cross-encoder costs per-query ×
per-candidate.** An embedder runs one forward pass per question; a reranker runs one per (query,
chunk) pair — ~20 passes of a ~300M model per question on 1–2 vCPU. **So "is it CPU-viable on
Fargate" is not answerable by comparing parameter counts**, and the mitigation may be architectural
(rerank 10 not 20; managed-mode only) rather than a model choice.

If one is forced today: **`Alibaba-NLP/gte-multilingual-reranker-base`** — 306M against
arctic-embed-m-v2.0's 305M, same GTE family, Apache-2.0, 8192 context, multilingual, TEI-named.
`gte-reranker-modernbert-base` is the fallback **if Q35 comes back English-only** (150M, int8 ONNX,
but English-only). Note that **both `bge-reranker` base and large cap at 514 tokens**, close to
disqualifying here — the reference article is a single unsplit markdown table.

**Every retrieval number B7a produces is still a FLOOR, not a measurement of the design.** Review A1
suggests the reranker may matter more to quality than the embedder does.

---

## Two traps, and both are the same class

**`"darwin".includes("win")` is true.** The first `platformFromProbe` (`server/src/kb/ask.js`)
tested `win` before `darwin` and classified **every macOS machine as Windows** — the exact D162
failure the platform pre-filter exists to prevent, arriving through the pre-filter itself. **It would
have presented as a pass:** the macOS article correctly withheld from a Mac, for entirely the wrong
reason. A test asserting `darwin -> macos` caught it; reading the line did not.

**A pipe replaces the exit code with the last stage's.** A backgrounded
`docker compose up -d 2>&1 | tail -20` was reported as completing with exit code 0 — that was
`tail`'s status — while its own output said it could not reach the Docker daemon. **Read the output,
not the status, whenever a command is piped.**

Both are §10.5's class: **a false signal wearing the shape of the expected answer.** That one was hit
twice, the second time while writing the note about the first. `CLAUDE.md` now carries all of them as
rules rather than anecdotes, along with the PowerShell single-return rule (7.1% of this repo, so it
will recur).

---

## B2 is still deferred, and still unblocked

Task 1 of the previous handover was the only thing gating it, and it is done. B2 is days of work:
local accounts, TOTP, roles, admin-action audit. **It stays deferred on the founder's direction** —
B7a needed no admin console, and neither does Task 1 above. When B2 starts, D158 is the thing to
watch.

---

## On Charles, not the next session

- **D202** — yes or no (§5.7a). Gates nothing.
- **D148 and OPEN-1 wording** (Task 2b). The register will not rewrite a decision's text without it.
- **§3 and §4 of [`../../client/docs/D130-RENDERER-CHECK.md`](../../client/docs/D130-RENDERER-CHECK.md)** — supersede and expired nonce. Five minutes, no elevation, needs a screen.
- **A DATE from Daniel** on the code-signing certificate, not a status. **This currently sets the
  pilot date rather than any engineering decision** — EDR allowlisting cannot start without a signed
  binary, and if that review takes weeks, the sequence is longer than B2 plus B3 combined.
- **Q9 and Q35 in one message.** Q9 (which EDR products the design partner runs) is a prerequisite
  for identifying the vendor to talk to at all. **Q35 (multilingual) now has a second consumer:** it
  decides whether D207's reranker can be the 150M English-only one or has to be the 306M
  multilingual one.
- **The top-30 ticket categories.** Roughly seven weeks outstanding. Nothing here is blocked on
  them; the Phase 1 exit criteria are.
- **Two unstarted clocks with no owner:** the Anthropic Scale tier (accrues by spend history, and
  nothing is accruing — running part of the eval loop against `claude-haiku-4-5` would start it and
  give regression coverage on the shipped model at the same time) and the EDR conversation. Four
  sessions have now flagged both.

---

## Honesty ledger

- **Everything written this session has been run** (see the table at the top). The database half was
  unrun for most of it and is not any more.
- **Nothing about retrieval quality can be concluded from B7a.** Six articles, **no reranker**, no
  corpus, and a dev embedder that is not the shipped model. Every figure is a floor.
- **The floor result's mechanism generalises; its distribution does not.** 20 questions this session
  chose, 6 articles. It is not a measurement and does not join §10.3.
- The claim that no GGUF of `arctic-embed-m-v2.0` exists **because** of its custom architecture is
  **inference, not retrieved**. The observable facts are retrieved; the causal link is ours.
- `RRF_K = 60` is still an unretrieved convention. `CANDIDATES_PER_LEG = 20` where D174 says ~50 —
  with six articles neither is reachable. The kind weights are reasoned from "users describe
  problems, not fixes", not measured.
- **The bake-off through the hub was NOT re-run** (spec §8 item 9's third clause). `/v1/turn` was not
  modified and `test/db-static.test.mjs` still asserts it reaches no database, so there is no reason
  to expect movement — but that is an argument, not a run.
- **`ASK-IT-questionnaire.xlsx` (D1–D41) and `2026-09-03-phase0-decisions-D130-D150.md` are still
  not on disk.** Do not reconstruct either. The second still matters more than it looks:
  **D130–D150 are still proposed and the document arguing for them cannot be read**, so anyone
  ratifying that set is working from the register's summary of an argument that no longer exists in
  full.
- Work is **uncommitted**. Charles has not asked for a commit.
