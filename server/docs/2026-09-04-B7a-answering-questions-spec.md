# B7a — Answering Questions: hub-side KB retrieval

**Date:** 2026-09-04
**Goal:** a local agent that answers questions from a knowledge base, and a hub it connects to.
**Builds on:** B0 (agent → hub → model, measured clean), B1 (control-plane schema, run against real
PostgreSQL), D199 (embedder chosen), D167+ (hybrid retrieval, now in the register).

**Scope note:** this is the first half of B7. The cross-encoder reranker is unpicked and unretrieved
(§10.2), and review A1 suggests it may matter more to retrieval quality than the embedder does.
**B7a deliberately ships without it** and says so — see §7.

---

## 1. What already works, and what is actually missing

| | State |
|---|---|
| Agent → hub → model | **Works.** `HubClient`, `provider: "hub"`, identical to direct path on all 40 bake-off cases |
| Tier-0 deterministic routing | **Works**, endpoint-side, hub-independent (D46b) |
| Model declining to propose an action | **Works** — the no-tool-call cases in the bake-off |
| Control-plane schema, migrations, tenant isolation | **Built and tested**, PostgreSQL 17.11 |
| Embedder decision | **Ratified** (D199) |
| Hybrid retrieval design | **Recorded** (D167+). **Not built** |
| **A knowledge base anywhere in the loop** | **Missing. This is the whole of B7a** |

The agent can already reply in prose when it declines to call a tool. It has nothing authoritative
to reply *from*. B7a supplies that.

---

## 2. The one risk that matters

**With six articles, most questions are not covered, and the model will answer anyway.**

An IT assistant that invents a plausible registry path, or offers a fix that is wrong for this
company's environment, is worse than one that says it does not know — because the user acts on it,
and because the whole product premise is that it speaks with the company's authority.

This is threat-model **G4** (content reaching the model's context) approached from the other side:
not malicious content, but *absent* content filled in by the model's own training.

**So B7a's primary acceptance test is a negative one.** A question with no supporting article must
produce a decline, not an answer. That test comes before any retrieval-quality test, because a
system that answers everything scores well on recall and is unshippable.

### How to get it

- **Retrieved chunks enter the prompt inside a provenance wrapper, treated as data, never as
  instruction, and never in the system prompt.** Same rule the threat model set for G4.
- **The prompt states the constraint explicitly:** answer only from the supplied articles; if they do
  not cover the question, say so and offer to raise a ticket.
- **A relevance floor.** If the best fused score is below threshold, do not send chunks at all —
  send none and let the constraint fire. Threshold is a value to be set by measurement, not guessed;
  record it as unset until then.
- **Cite the article.** The answer names which article it came from, which is both a trust signal and
  a debugging tool. Under H5 it is attributed chrome, not the avatar's own voice.

`whenNotToUse` measurably moved every model in the bake-off. The same lever applies here: telling the
model what it must *not* do is likely to matter more than the retrieval quality.

---

## 3. Where the corpus lives

**Generic KB goes in a shared schema, not per-tenant.** It is vendor-authored, carries no entitlement
rules and contains no customer data (D45), so duplicating it into every tenant schema buys nothing
and costs a re-embed per tenant.

**Customer KB is per-tenant** (D44) and is not in B7a. B7a establishes the retrieval path; customer
corpora and entitlement filtering follow.

Tables needed: `articles` and `chunks`, the latter carrying both a `vector` column and a `tsvector`
column. pgvector is already enabled in the schema template (D52a).

**Ingest `docs/kb/generic-kb-v2.json`** — six articles. Chunk on semantic boundaries, not fixed
character counts (D164a; take a permissively-licensed implementation rather than writing one).

Note the two reference articles are single tables and should chunk as one unit each — a table split
mid-rows retrieves badly. The schema's `type: "reference"` field is the signal.

---

## 4. Embedding in development

**Serve the embedder through Ollama if the model is available there.** `[VERIFY]` whether
`snowflake-arctic-embed` or the v2.0 variant D199 selected is in Ollama's library, and whether the
tag matches what D199 actually chose — the register's §5 on D199 is the authority, not this document.

If it is: the dev path is one runtime serving both the chat model and the embedder, no ONNX
toolchain, and it is *also* the customer-hosted deployment mode rather than a dev shortcut. That is
the same argument B0 made for running the hub locally.

If it is not: ONNX Runtime, with the caveat that D199's aarch64 confirmation was about Fargate and
the dev machine is x64 — a different build, and worth confirming before assuming.

**Either way, put embedding behind a provider interface**, the same shape as the chat provider. The
embedder is a schema decision, not a foundation — re-embedding 10,000 articles is under \$3 — and the
interface is what keeps that true.

---

## 5. Retrieval

Per D167+:

1. **Lexical leg** — `tsquery` against the `tsvector`, GIN indexed. This is what finds `0x80070005`
   and `DisplayLink`, which dense embedding cannot.
2. **Semantic leg** — pgvector cosine, HNSW indexed.
3. **Fuse with RRF** — `1/(k + rank)`, `k ≈ 60`. Chosen because it needs no score normalisation.
   `[VERIFY]` the `k` convention is unretrieved (§5.11c).
4. **No reranker.** See §7.
5. **Top 3–5 chunks** to the model.

**Weight `title` and `symptoms` above `guidance`.** The `symptoms` field holds user phrasing — "can't
get to the shared drive from home" — and users describe problems, not fixes.

**Pre-filter on `platform`** before retrieval, not after (D162). Platform comes from the
machine-state block the endpoint already sends. Filtering after retrieval still lets a macOS article
consume one of the 3–5 slots and compete for rank.

Both legs run in one query against the same Postgres. No new dependency.

---

## 6. The hub becomes stateful — deliberately

B0's `/v1/turn` is stateless by design and I previously argued against retrofitting persistence into
it. **B7a is the point where that changes, and it should be a decision rather than a drift.**

- `/v1/turn` acquires a database dependency and a retrieval step before the model call. This is D53
  working as designed: the hub retrieves, assembles, calls, returns. **Chunks never leave the hub.**
- **Tenancy is provisional and the provisionality must be loud.** Device authentication does not
  exist yet, so the tenant comes from configuration or a header. Mark it the way B0 marked missing
  auth: refuse non-loopback, warn on every start. Do not let a header become the tenancy model by
  default.
- **Keep a stateless path.** If retrieval fails or the corpus is empty, the turn should still work
  without chunks rather than erroring. That is also the degraded mode the endpoint sees when the KB
  is unavailable.
- **Log retrieval separately from outcome** (D166 / plan C4): which chunks, with scores, which the
  model used, and the session outcome. This is what distinguishes a retrieval miss from a reasoning
  miss, and they have different fixes. Cheap now, hard to add later.

---

## 7. Explicitly not in B7a

- **The cross-encoder reranker.** Unpicked, unretrieved, and plausibly the largest single lever on
  retrieval quality. B7a's numbers are therefore a floor, not a measurement of the design. **Do not
  conclude anything about retrieval quality from B7a without noting the reranker is absent.**
- **Customer KB, entitlement filtering, per-tenant corpora** (D44). Needs user identity (D131/D148),
  which needs the broker-attested SID, which needs the pipe.
- **The authoring surface** — review queue, gap detection, preview before publish (D167+). B7a is
  read-path only. Ingestion is a script, not a UI.
- **Any claim that the product answers questions well.** Six articles is not a corpus. D199 was
  ratified with nothing measured on our corpus because there is no corpus, and B7a does not change
  that.

---

## 8. Acceptance — falsifiable, negative test first

1. **A question with no supporting article produces a decline and an offer to raise a ticket. No
   invented answer.** Test with at least five questions deliberately outside the six articles.
2. "How do I take a screenshot" retrieves `keyboard-shortcuts-windows` and answers `Win + Shift + S`,
   **citing the article**.
3. "My mouse keeps cutting out" retrieves `bluetooth-peripheral-disconnects` and gives its guidance,
   not the model's own.
4. An exact-string query (`DisplayLink`) retrieves the dock article — **proving the lexical leg
   works**, since that token is what dense embedding fails on.
5. A `platform: "macos"` article is never retrieved for a Windows machine-state block. Add a throwaway
   macOS article to test this, then remove it.
6. Tier-0 phrasings still resolve **with the hub stopped**.
7. A turn still completes with the corpus empty — degraded, not broken.
8. Retrieval logs contain chunk ids and scores for every turn that retrieved.
9. `server/` tests pass; `client/` tests pass; the bake-off through the hub still lands where it did
   (33/40 on the current Ollama session, and re-baseline in the same session rather than trusting the
   recorded number — run-to-run variance is 2).

---

## 9. Suggested order

1. Tables and migration for `articles` / `chunks` in a shared generic schema.
2. Ingestion script for `generic-kb-v2.json`, with chunking.
3. Embedding provider interface, one implementation.
4. Retrieval: lexical leg, then semantic leg, then RRF. **Test each leg alone before fusing** — a
   broken leg inside a fusion is very hard to see.
5. Wire into `/v1/turn` behind a flag, so the stateless path stays runnable.
6. The prompt constraint and relevance floor. **Then acceptance item 1, before anything else.**
7. Retrieval logging.

---

## 10. Honesty ledger

- **I have not read** the register at v2.11, `docs/2026-09-04-embedder-decision.md`, or
  `server/docs/B1-CONTROL-PLANE.md`. Where this document and those disagree, they win — particularly
  on which embedder tag D199 actually selected.
- The relevance floor threshold in §2 is **unset on purpose**. Any number I supplied would be
  invented.
- `k ≈ 60` for RRF and the chunking-quality claim are unretrieved (§5.11c).
- Ollama's embedder availability (§4) is unverified.
- **Nothing about retrieval quality can be concluded from B7a.** Six articles, no reranker, no
  measurement on a real corpus. Its purpose is to prove the path works and that the system declines
  when it should.
