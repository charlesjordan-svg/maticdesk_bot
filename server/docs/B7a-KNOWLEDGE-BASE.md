# B7a — the knowledge base, built

**Date:** 2026-09-04
**Spec:** [`2026-09-04-B7a-answering-questions-spec.md`](2026-09-04-B7a-answering-questions-spec.md)
**Register:** [`../../docs/decisions/DECISION-REGISTER.md`](../../docs/decisions/DECISION-REGISTER.md) §5.16 (D203–D207)
**Founder direction it serves:** *"We need to be able to produce a local agent that can answer questions and a Hub that it can connect to."*

---

## 0. Read this first: three of the spec's premises were wrong

The spec's own honesty ledger said the register and the code win where they disagree. They did, in
three places, and all three changed the build rather than a comment.

| Spec said | Actually |
|---|---|
| *"Serve the embedder through Ollama if the model is available there"* | **It is not there.** Ollama's library has the **L** variant of arctic-embed v2.0; D199 chose the **M**. They are different architectures, not two sizes. **D203** |
| *"The agent can already reply in prose when it declines to call a tool"* | **Nothing in this system could return prose.** `tool_choice: "required"` on both providers; `/v1/turn` returns **502** on a no-tool-call. **D205** |
| *"`/v1/turn` acquires a database dependency"* + *"Keep a stateless path"* | Those fight, and a test already resolved the fight. Questions went to a **second route**. **D206** |

---

## 1. What was built

```
server/
  migrations/control/002-generic-kb.sql   articles, chunks, retrieval log; GIN + HNSW
  src/kb/
    chunk.js       chunking by FIELD (not by character count) + kind weights
    embed.js       the embedding provider interface, Ollama impl, the dimension assertion
    ingest.js      bundle -> rows, change detection, embedding as a separate pass
    retrieve.js    lexicalLeg / semanticLeg / fuseRRF / retrieve / logRetrieval
    answer.js      the `answer` tool, the constraint prompt, the article wrapper, the downgrades
    ask.js         POST /v1/ask
  bin/kb.mjs       ingest | embed | reembed | status | legs | retrieve
  test/
    run-all.mjs           runs every file, reports every result, exits non-zero at the END
    kb-static.test.mjs    93 assertions, no database, no model
    kb.test.mjs           retrieval against real PostgreSQL
    kb-acceptance.mjs     the spec's §8 list, end to end
    kb-answer-live.mjs    the answer contract against a real model, NO database
```

`src/turn.js` and `src/providers/` were **not modified.** `src/index.js` gained the route, the
embedder wiring and a banner.

## 2. Commands

```bash
cd server
npm.cmd test                              # 169 assertions, nothing installed needed
ollama pull snowflake-arctic-embed2:568m   # the DEV embedder. NOT D199's model — see §4
npm.cmd run db:up
npm.cmd run migrate
npm.cmd run kb:ingest                     # six articles -> rows -> vectors
npm.cmd run kb:status                     # and WHICH model embedded them
npm.cmd run kb -- legs "DisplayLink"      # each leg alone, unfused
npm.cmd run kb -- retrieve "my mouse cuts out" --platform windows
npm.cmd run test:db                       # B1's exit criteria + B7a retrieval
npm.cmd run kb:accept                     # the spec's §8 list; needs db + Ollama
npm.cmd run kb:answer                     # the answer contract; needs Ollama only, NO database
npm.cmd run kb:floor                      # is a relevance floor possible? (it is not — §6)
```

---

## 3. Verification state — what has actually been run

**This section is the honest one. Read it before quoting anything below.**

| | State |
|---|---|
| `npm.cmd test` — 33 + 43 + **93** = **169 assertions** | **RUN, ALL PASS.** No database, no model |
| `node test/kb-answer-live.mjs` — **18 assertions** against `mistral-small:24b` | **RUN, ALL PASS.** Real model, no database |
| One live `POST /api/embed` — 1024 dims, L2 norm 1.000000 | **RUN** (D203's measurement) |
| `npm.cmd run migrate` — **migration 002 against PostgreSQL 17.11** | **RUN, APPLIED CLEAN** |
| `npm.cmd run kb:ingest` — 6 articles → 18 chunks → 18 embeddings | **RUN** |
| `npm.cmd run test:db` — 56 (B1) + **52** (B7a) = **108 assertions** | **RUN, ALL PASS** |
| `npm.cmd run kb:accept` — the spec's §8 list, end to end | **RUN, 30/30 PASS** |
| `npm.cmd run kb:floor` — is a relevance floor possible? | **RUN. Answer: not over fused RRF scores — see §6** |
| `client/` — 278 assertions, 0 XFAIL (unchanged by B7a) | **RUN, ALL PASS** — closes acceptance item 9 |

**Everything is now run.** A Docker Desktop update (to 29.7.2) cleared the engine failure that had
blocked the database half; before that, migration 002 had never been applied and no SQL in
`src/kb/` had executed.

**The one prediction worth recording as confirmed:** the bare `vector(1024)` type resolved inside
the `control` schema through `withControl`'s `SET LOCAL search_path = extensions`. That was
reasoning at the time it was written ("*should* make it resolve — but 'should' is doing the work in
that sentence"), and it is now fact. The HNSW index built without incident.

To reproduce from nothing:

```bash
cd server
npm.cmd run db:up && npm.cmd run migrate && npm.cmd run kb:ingest && npm.cmd run test:db && npm.cmd run kb:accept
```

### What the 18 live-model assertions DID establish

This is the part that matters most, because it is B7a's whole claim, and it turned out to be
testable without a database — the decline belongs to the prompt and the schema, not to retrieval:

- **5/5 declines with no articles supplied**, each offering a ticket.
- **5/5 declines when handed a RELEVANT-LOOKING article that does not answer the question** — a VPN
  question with the home-network article, a "which dock should I order" question with the dock
  troubleshooting article, and so on. **This is the case the six-article corpus produces most
  often**, and it is the one the spec meant by *"adjacent is not covering."*
- **The positive cases still answer**, citing the article, with `Win + Shift + S` coming from the
  article rather than from training — so it is not a system that declines everything.
- **With two articles supplied it cites only the relevant one.**
- **It cannot cite an article that was not supplied, even when the question explicitly asks it to.**
- **G4: an instruction planted inside the article block does not flip the decline.**

---

## 4. The embedder is not D199's model (D203)

**Answering the spec's `[VERIFY]` and Task 2a: no.**

| | D199's pick | What Ollama has |
|---|---|---|
| Model | `Snowflake/snowflake-arctic-embed-m-v2.0` | `snowflake-arctic-embed2:568m` = `…-l-v2.0` |
| Architecture | `GteModel` (Alibaba GTE, custom remote code) | `XLMRobertaModel` |
| Parameters | 305M | **568M** |
| Dimensions | 768 | **1024** (measured) |
| MTEB rank (TEI's table) | 41 | **35** |

**The near-miss is a trap.** `snowflake-arctic-embed:m` *does* exist in Ollama's library — but that
is the **v1.0** suite, two years old and **English-only**, which is exactly what D199 rejected
because an English-only pick bets on Q35.

**Both errors point the wrong way.** The dev embedder is bigger *and* better ranked than the
production one, so **dev latency is a pessimistic proxy and dev quality an optimistic proxy.** No
figure produced against it says anything about the shipped system.

**And it is in the parameter class D199 rejected.** D199 turned down Qwen3-Embedding-0.6B (509M–600M)
on unmeasured 1–2 vCPU latency. The L is 568M. **So this is a dev runtime choice and NOT an
amendment to D199**; adopting the L in production would contradict D199's own argument.

The production path is confirmed available: both variants publish full ONNX including
`model_int8.onnx`, and TEI publishes `cpu-arm64-1.9`.

**What keeps this reversible:** `EMBEDDING_DIM` in `src/kb/embed.js` is asserted against the live
provider at startup, and `kb_chunks` stores `embedding_model` and `embedding_dim` per row. A width
mismatch is a loud refusal; a two-model corpus is detectable (`npm.cmd run kb:status` reports it,
`node bin/kb.mjs reembed` fixes it). Changing the embedder needs a **new migration** — the runner
checksums applied files and refuses edits.

**Why not truncate everything to Matryoshka-256** and make the column model-agnostic? Both variants
declare `matryoshka_dimensions: [256]`, so it would work. It is deliberately not done: it buys away
a migration that is already nearly free and pays in retrieval quality **nobody has measured.**
Storing native dimensions keeps MRL-256 available later as a measured choice; truncating now does not
keep the reverse open.

---

## 5. The answer path, and why it is a tool (D205)

**The finding: nothing in this system could return a prose answer from a model.** Four surfaces:

- `client/src/agent/openai-compatible-client.js` → `tool_choice: "required"`
- `server/src/providers/openai-compatible-provider.js` → the same, hard-coded
- `server/src/turn.js` → **HTTP 502**, *"the model returned no tool call"*
- `client/src/agent/hub-client.js#readCall` → `{ ok: false }`

What the spec saw was the `escalate` tool, whose `reply` is a template the client assembles from
schema fields. Real, useful, and not an answer to a question.

**So a question is answered through an `answer` tool** — `{ answered: boolean, reply: string,
citedArticleIds: string[] }`, `additionalProperties: false`, `answered` and `reply` required.

The load-bearing reason is not tidiness: **it makes the decline a field rather than a phrasing.**
B7a's primary acceptance test against free prose is string-matching a model's wording, which is not
a test. Against `answered: false` it is an assertion. Everything in §3's live results is checkable
because of this choice.

**The cost, stated: `answered` is the model's own claim about itself.** So the read path constrains
it:

| Model returned | What the user gets |
|---|---|
| `answered: true`, citing a supplied article | that answer |
| citing an article that was **not supplied** | citation dropped → then the rule below |
| `answered: true`, **no surviving citation** | **DOWNGRADED to a decline** |
| `answered: false` **with** citations | citations cleared |
| **no tool call at all** (prose) | a decline. Never the prose |
| empty `reply` | a decline |

An answer attributable to no article is an answer from training wearing the company's authority. It
is downgraded rather than flagged because a flag reaches a log and the sentence reaches a person.

That makes lying **attributable, not impossible** — the same concession D130 made about the consent
card.

**Retrieved chunks are data, never instruction, and never in the system prompt** (G4). They go in a
user-role message inside a delimited block carrying each article's id, its KCS confidence state
(D172 — every v2 article is `unvalidated`), and its `doNotAttempt` / `escalateWhen`, which are
deliberately **not chunked** because they constrain an answer rather than being one.

---

## 6. Retrieval, and one finding that inverts the intuition

Two legs on one table, fused by RRF, per D174.

- **Lexical** — `websearch_to_tsquery` against a **generated** `tsvector`, GIN indexed. This is what
  finds `DisplayLink` and `0x80070005`.
- **Semantic** — pgvector cosine, HNSW indexed. Nullable embedding, so a chunk exists before it is
  embedded and an embedder outage leaves a corpus that still answers.
- **Fusion** — `weight / (RRF_K + rank)`, summed. Kind weights applied **in fusion**, never inside a
  leg, so each leg stays independently testable — which the spec asked for.
- **The platform pre-filter is inside BOTH legs** (D162). After fusion is too late: a macOS article
  would still consume one of the 3–5 slots and compete for rank.

`lexicalLeg`, `semanticLeg` and `fuseRRF` are separately exported and separately tested, and
`node bin/kb.mjs legs "<query>"` prints them side by side unfused. Spec §9 item 4: a broken leg
inside a fusion returns plausible results in a plausible order.

### The finding: the semantic leg makes declining HARDER, not easier

With the lexical leg alone, an uncovered question returns **zero chunks**. With the semantic leg on,
the same question returns its nearest neighbours — because **a dense leg has no concept of "no
match."** It always returns something.

So better retrieval does not make declining easier; it makes the decline the prompt's entire job.
That is the opposite of the intuition, and it is why §3's section B (declining while holding a
relevant-looking article) is the number to watch rather than section A.

### The relevance floor stays `null` — measured, and the mechanism is wrong

`npm.cmd run kb:floor` ran 10 covered and 10 uncovered questions with both legs on. **A floor over
fused RRF scores cannot work, and the reason is structural rather than a consequence of six
articles.**

Every top score was one of exactly five values: `2/61` (both legs agreed at rank 1), or
`1/(60 + semantic rank)` for ranks 1–4. That is arithmetic, not a distribution. **The fused score
is a function of rank and leg agreement only — it carries no similarity magnitude, because the rank
transform discarded it.** Discarding magnitude is RRF's selling point (D174 chose it so a `ts_rank`
and a cosine never have to be reconciled) and it is precisely what a floor needs.

The distributions therefore **overlap**: the semantic leg returned **all 18 chunks for every query**,
covered or not, so an uncovered question's nearest neighbour scores `1/61` — identical to a covered
question whose phrasing shares no terms with its article. Two of the ten covered questions did
exactly that and were retrieved correctly. **A threshold here is really asking "did the lexical leg
agree?" — a one-bit test wearing a decimal point.**

If a relevance signal is ever wanted, **neither candidate is this constant**: threshold the raw
semantic similarity *before* fusion (a real cosine in [-1, 1]), or use leg agreement
(`lexRank !== null && semRank !== null`) explicitly. Both need their own decision.

**The mechanism is not a sample** — `2/61` and `1/(60+rank)` are what the formula computes. **The
distribution is** (20 questions chosen by this session, 6 articles, no reranker) and is not a
measurement. A reranker would change the ordering without giving this constant a magnitude to
threshold.

### Unmeasured, all of it

`RRF_K = 60` (the convention is still unretrieved), `CANDIDATES_PER_LEG = 20` (D174 says ~50; with
six articles neither is reachable), `DEFAULT_TOP_K = 5`, and the kind weights — title and symptoms
above guidance, reasoned from *"users describe problems, not fixes"*, not measured.

---

## 7. Chunking is by field, and the spec's instruction was wrong for this corpus

The spec said to take a permissively-licensed chunking library (D164a). **That instruction is right
for the corpus it was written about and wrong for this one.**

`docs/kb/generic-kb-v2.json` is already structured (D171). The semantic boundaries a text splitter
would have to infer are **already marked** — `title`, `problem`, `symptoms[]`, `keywords[]`, `cause`,
`guidance[]`, `body`. Running a splitter over it would discard known boundaries and guess them back:
worse output, plus a dependency.

Two consequences worth knowing:

- **A `type: "reference"` body is ONE chunk however long it is.** It is a single markdown table, and
  half a table has no header — the header is what says what the rows mean.
- **`guidance` is one chunk, not one per step.** A single step ("Run a speed test and note the
  figures") retrieves as a plausible answer to almost any slow-network question while carrying none
  of the context that makes it the right one. The steps are an ordered procedure and the order is
  part of the meaning.

**A chunker is still needed, just not yet.** Customer KB (D44) is free-text documents with no field
structure to exploit. That is where D164a applies, and it is out of B7a's scope. Do not read this as
"chunking is solved."

A chunk that would exceed the embedder's 8,192-token context is **flagged** (`long`) rather than
silently truncated. Nothing in the current bundle is close.

---

## 8. Tenancy, and the guard the spec asked for

There is no tenant. `MATIC_KB_TENANT_LABEL` is a **log label**, and:

- it is a `text` column in `kb_retrieval_log`, **not** a foreign key to `control.tenants`;
- **`/v1/ask` returns 400 if the request body carries `tenant`, `tenantId` or `tenantLabel`.** This
  is the spec's *"do not let a header become the tenancy model by default"* made enforceable. A
  client-supplied tenant the server trusts is not a provisional tenancy model, it is a broken one,
  and it becomes load-bearing by being convenient;
- the loopback refusal, `x-matic-hub-auth: none`, and a startup banner naming all of it are B0's and
  are unchanged.

The generic corpus is cross-tenant by decision (D45), so nothing here needs a tenant to be correct.

**The user's sentence is not stored** unless `MATIC_KB_LOG_QUERIES=1`. A hub-side table of what
employees typed is the transcript-access problem D154 exists to constrain, and B7a has no admin
model, no tenancy and no retention policy to constrain it with.

---

## 9. What B7a does NOT include

- **The cross-encoder reranker** (D207). Options are now retrieved; it is **not picked**, because
  a cross-encoder costs **per-query × per-candidate** — ~20 forward passes of a ~300M model per
  question on 1–2 vCPU — and no latency measurement exists. **Every retrieval number from B7a is a
  FLOOR, not a measurement of the design**, and review A1 suggests the reranker may matter more to
  quality than the embedder does.
- **Customer KB, entitlement filtering, per-tenant corpora** (D44). Needs user identity
  (D131/D148) → the broker-attested SID → the pipe.
- **The authoring surface** — review queue, gap detection, preview before publish (D167+). Read path
  only; ingestion is a script.
- **An endpoint caller.** `/v1/ask` has no client. `HubClient` speaks `/v1/turn` only, and D205's
  answer shape is new, so it needs an `ask()` path. **That is the next step in Track A.**
- **Any claim that the product answers questions well.** Six articles is not a corpus.

---

## 10. Honesty ledger

- **Everything is now run** (§3): 169 static + 108 database + 30 acceptance + 18 live-model
  assertions, plus `client/`'s 278. Migration 002 applied clean against PostgreSQL 17.11.
- Nothing is measured on a real corpus, and there is no real corpus.
- The dev embedder is not the production embedder, and the difference biases in two directions at
  once.
- `RRF_K`, `CANDIDATES_PER_LEG` and the kind weights are reasoned, not measured. The relevance floor
  is unset.
- **A trap was hit and is worth carrying:** `"darwin".includes("win")` is **true**. The first
  `platformFromProbe` tested `win` first and classified every macOS machine as Windows — the exact
  D162 failure the pre-filter exists to prevent, arriving through the pre-filter. **It would have
  presented as a pass** (the macOS article correctly withheld from a Mac, for the wrong reason). A
  test asserting `darwin -> macos` caught it; reading the line did not. Register §5.16b.
- The claim that no GGUF of `arctic-embed-m-v2.0` exists *because* of its custom architecture is
  **inference, not retrieved**. The observable facts are retrieved; the causal link is ours.
- `whenNotToUse` moving every model in the bake-off is the one measured prompt result this design
  leans on. It is one machine and 40 hand-written cases.
