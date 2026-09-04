# The embedder — recommendation for D199

**Date:** 2026-09-04 (continues the 2026-09-03 night session)
**Decides:** the model left unpicked by **D144**, which set the direction and the shortlist.
**Unblocks:** **B7**, KB retrieval — the last item in the Phase 1 plan's §5 "blocking now" list.
**Status: PROPOSED. The founder ratifies.** Nothing here is measured on our corpus.

---

## Recommendation

**`Snowflake/snowflake-arctic-embed-m-v2.0`.** Apache-2.0, 305M parameters (113M non-embedding),
768 dimensions natively with Matryoshka truncation to 256, 8,192-token context, 74–101 languages,
and explicitly supported by the Hugging Face TEI CPU image — which is the deployment mechanism D144
already specified.

**The reason it wins is not the benchmark. It is that it removes Q35 from the critical path.**

D144's shortlist splits on multilingual support, and **Q35 — whether the design partner needs it —
is open.** Picking an English-only model means a re-embed if Q35 comes back multilingual; waiting
for Q35 means B7 stays blocked on a question we do not control. Arctic-embed-m-v2.0 is multilingual
*and* English-competitive, so it is defensible under either answer, and the decision stops waiting.

The cost of being wrong is already known and it is small: **re-embedding 10,000 articles is under
\$3** (D175, from review A1). That is the argument for deciding now rather than deciding perfectly.

---

## 1. The constraints that actually filter

From D144, D59a, D143 and §10.1 of the register. Four of these eliminate candidates; the rest are
preferences.

| Constraint | Source | Filters? |
|---|---|---|
| Apache-2.0 or MIT, self-hostable | D144 | **Yes** — but all five candidates now pass, see §3 |
| **One model serves managed *and* customer-hosted**, or a customer can never migrate modes without a full re-embed | D144 | **Yes** |
| Runs via the **Hugging Face TEI CPU image** | D144 | **Yes** — and it eliminated nothing, see §3 |
| **≤ 2,000 dimensions**, or pgvector cannot build an HNSW index | §10.1 | **Yes — and it bites one candidate** |
| CPU-viable on 1–2 vCPU Fargate-class hardware | §10.2 | Preference; **unmeasured** |
| Multilingual | **Q35, open** | Would filter, if answered |
| Long context | — | **Irrelevant here.** A KB article chunk is short; 8,192 is already ample and 32,768 buys nothing |

---

## 2. The candidates

Everything in this table is retrieved from the model cards, the TEI documentation or the vendors'
own posts, on 2026-09-04. Sources in §6. **The MTEB ranks are a leaderboard snapshot quoted from
Hugging Face's TEI documentation, not a measurement of ours.**

| Model | Licence | Params | Dims | Languages | Context | TEI | MTEB rank |
|---|---|---|---|---|---|---|---|
| **arctic-embed-m-v2.0** | Apache-2.0 | **305M** (113M non-emb) | **768**, MRL→256 | **74–101** | 8,192 | **Yes** (Alibaba GTE) | 41 |
| Qwen3-Embedding-0.6B | Apache-2.0 | 509–600M | 1024 (32–1024) | **100+** | 32,768 | Yes (Qwen3) | **4** |
| voyage-4-nano | Apache-2.0 | 340M | 256/512/1024/**2048** | multilingual | 32,768 | Yes (Qwen3) | n/a |
| nomic-embed-text-v1.5 | Apache-2.0 | **137M** | 768, MRL→64 | **English only** | 8,192 | Yes (NomicBERT) | 79 |
| gte-large-en-v1.5 | Apache-2.0 | 434M | 1024 | English | 8,192 | Yes (Alibaba GTE) | n/a |

---

## 3. Three things that changed since D144 was written

**(a) voyage-4-nano is no longer a hosted-only model, and that matters more than its rank.** D144
lists it as a candidate; it is now **open-weight under Apache-2.0, on Hugging Face, and named
explicitly in TEI's supported-models table** (340M, model type Qwen3). More importantly, Voyage
claims all four Voyage 4 models share an embedding space: *"All four models produce compatible
embeddings, meaning embeddings generated from different models can be used interchangeably"*, and
that you can *"upgrade to voyage-4 or voyage-4-large for query embeddings … without re-vectorizing
documents."*

**If that claim holds, it is the only candidate that does something none of the others can**: run
nano self-hosted for customer-hosted tenants, and query the *same vectors* with a stronger hosted
model in managed mode. That is D144's deciding constraint satisfied by construction rather than by
using one model everywhere.

**It is not recommended, for three reasons.** The claim is the vendor's, and §10.2 already carries
it as `[VERIFY]` — this research corroborates that Voyage *says* it, which is not the same as it
being true. The upgrade is **asymmetric and query-side**: documents are vectorised once, so the
benefit is a better *query* encoder, not a free migration in both directions. And **its headline
2048 dimensions exceed pgvector's 2,000-dimension HNSW limit** (§10.1), so it would have to be run
truncated to 1024 — which is fine, but means the configuration that sells the model is not the
configuration we could index.

**(b) The `[VERIFY]` that D144 said could change the pick outright is resolved.** The Phase 1 plan
§5 calls ONNX Runtime on ARM/Graviton *"the one item that could change the pick outright."* Register
§10.4 already records it **confirmed**. This research adds a second, independent route to the same
conclusion: **TEI publishes an `aarch64` CPU image** (`cpu-arm64-1.9`) and states ARM64 is supported
for CPU-only workloads. The Graviton question is closed on two mechanisms, not one.

**(c) TEI support eliminated nobody.** This was the constraint most likely to disqualify a candidate,
because D144 names the TEI CPU image as *the* mechanism. Every one of the five shortlisted models is
TEI-supported. The constraint is real and worth keeping, but it did no work here.

---

## 4. Why arctic-embed-m-v2.0 rather than the other two live options

**Against Qwen3-Embedding-0.6B, which is the quality pick.** MTEB rank 4 versus 41 is not a small
gap and it is the honest reason to hesitate. But it is **509M–600M parameters against 305M**, on
1–2 vCPU with **no latency measurement of any kind** (§10.2), for a surface that has to feel
interactive. It is also instruction-tuned — the card says instructions are worth 1–5% — which adds
a prompt-engineering surface to a component whose job is to be boring. **The upgrade path is open
and cheap:** if measurement shows headroom, re-embedding costs under \$3 per 10,000 articles, and
D175 already establishes that the embedder is a schema decision rather than a foundation.

**Against nomic-embed-text-v1.5, which is the cheap pick.** 137M parameters is less than half, and
if Q35 comes back "English only" it is arguably the right answer. But it is **English-only** — the
model card is explicit — so choosing it is a bet on an unanswered question, and losing the bet costs
a re-embed *plus* the decision again. Arctic costs 168M more parameters to not have to care.

**On D174's hybrid retrieval, which lowers the stakes.** The lexical leg (`tsvector` + GIN) is what
finds `KB5034441` and `0x80070005`; the dense leg only has to connect *"printer won't print"* to
*"Spooler service failure"*. **The embedder is not the component carrying the error codes**, which is
precisely why D175 says it is a schema decision. A rank-41 model doing semantic work behind a
cross-encoder reranker is a different proposition from a rank-41 model being the whole pipeline.

---

## 5. What would change this

- **Q35 comes back "English only" AND latency measurement is tight** → nomic-embed-text-v1.5. Saves
  more than half the parameters.
- **Measurement shows CPU headroom and retrieval quality is the binding constraint** → Qwen3-Embedding-0.6B.
- **The Voyage shared-space claim is independently verified** → voyage-4-nano becomes seriously
  interesting, because it changes the *managed-versus-self-hosted story* rather than just the score.
  Worth an hour to test directly: embed a corpus with nano, query it with hosted voyage-4, and see
  whether retrieval holds. That is a cheap experiment against a claim currently taken on trust.
- **Anything measured at all.** See below.

---

## 6. Honesty ledger

- **Nothing here is measured on our corpus, and there is no corpus to measure on.** The generic KB
  is eight articles, and its own §8 says so. The bake-off harness in `client/eval/` scores *tool
  selection*, not retrieval; a retrieval eval does not exist and would need the top-30 ticket
  categories to be worth building.
- **Every number is retrieved, not reproduced.** Parameter counts, dimensions, context lengths and
  licences come from model cards and vendor posts read on 2026-09-04. The MTEB ranks are a
  leaderboard snapshot quoted from Hugging Face's own TEI documentation. **I ran no benchmark.**
- **`[VERIFY]` the Voyage shared embedding space.** Corroborated as a *claim* — it is stated on
  Voyage's blog and repeated in Hugging Face integration material — and **not independently
  verified**. §10.2's entry stands.
- **`[VERIFY]` CPU latency for any of these on 1–2 vCPU**, unchanged from §10.2. This is the input
  that would most change the recommendation and it remains unmeasured.
- **One reconciliation I could not close.** voyage-4-nano's `config.json` reports `hidden_size` 1024
  while the model is advertised at up to 2048 dimensions, which implies a projection I did not
  confirm. It does not affect the recommendation, but do not quote 2048 as a native width without
  checking.
- **arctic-embed-m-v2.0's language count is stated inconsistently by its own publisher** — the
  Snowflake blog says 74 languages, the model card metadata lists 101. Either way it is multilingual;
  the exact number should not be quoted.
- **The cross-encoder reranker (D174) is still unpicked and still unretrieved.** It is a separate
  decision, and review A1 suggests it may matter more to retrieval quality than the embedder does.
  Deciding the embedder does not decide it.

---

## 7. Sources

Retrieved 2026-09-04.

- [Snowflake/snowflake-arctic-embed-m-v2.0](https://huggingface.co/Snowflake/snowflake-arctic-embed-m-v2.0) — licence, languages, ONNX availability
- [Snowflake's Arctic Embed 2.0 Goes Multilingual](https://www.snowflake.com/en/blog/engineering/snowflake-arctic-embed-2-multilingual/) — parameter counts, base architecture, context length
- [Arctic-Embed 2.0: Multilingual Retrieval Without Compromise](https://arxiv.org/html/2412.04506v2) — the paper behind it
- [nomic-ai/nomic-embed-text-v1.5](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5) — Apache-2.0, 768/MRL, 8192, **English-only**, task prefixes, MTEB by dimension
- [Qwen/Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) — Apache-2.0, 1024 (32–1024), 32k, 100+ languages, instruction gain 1–5%
- [The Voyage 4 model family](https://blog.voyageai.com/2026/01/15/voyage-4/) — the shared-embedding-space claim, dimensions, open-weight status
- [voyageai/voyage-4-nano](https://huggingface.co/voyageai/voyage-4-nano) — the weights and config
- [TEI supported models and hardware](https://huggingface.co/docs/text-embeddings-inference/en/supported_models) — the supported-architecture list, the MTEB ranks quoted above, and the `cpu-arm64-1.9` image
