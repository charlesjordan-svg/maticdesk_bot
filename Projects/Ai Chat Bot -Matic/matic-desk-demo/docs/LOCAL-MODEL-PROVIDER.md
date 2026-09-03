# Local model provider

Branch `post-demo`. **Off by default** — the demo build talks to Anthropic and nothing here changes
that unless `config.localModel.enabled` is set or `MATIC_LOCAL_MODEL` is in the environment.

This note exists because the brief it was meant to follow — `2026-09-02-ollama-provider-brief.md` —
is not on this machine. Searched the whole user profile; the only file that mentions it is the
proceed handover itself. What follows is what §3 of that handover specified, plus what measurement
added.

---

## 1. What was built

`src/agent/openai-compatible-client.js` — `OpenAICompatibleClient`.

Deliberately **not** an Ollama client. Ollama serves an OpenAI-compatible API at `/v1`, and so do
LM Studio, vLLM, llama.cpp's server, and OpenAI. One adapter covers all of them, and a customer
pointing this at their own endpoint is a config change. Anything server-specific goes in
`extraBody`, not into the adapter.

- Same `propose()` contract as `CloudClient`, so it is a drop-in at the wiring site in `main.js`.
- Returns an ordinary `Proposal` with `source: "local"`, distinct from `tier0`, `tier0-state`
  and `cloud` — the distinction a security review cares about is whether the sentence left the
  machine, and `"local"` says it did not.
- Tool surface generated from `catalog.json`, so the model is structurally unable to name a
  capability that is not in it.
- Tool use is an output-schema mechanism, never an execution mechanism (§5). The broker
  re-validates every proposal from scratch regardless of who produced it.

`src/agent/prompt.js` — the system prompt, the machine-state block and the escalation schema, now
shared by both providers. **This is a correctness requirement, not tidiness.** The §4 bake-off
compares models; if two providers word the prompt differently, the bake-off measures the wording
and reports it as a property of the model.

### Wiring

`config.localModel.enabled` swaps the provider. `MATIC_LOCAL_MODEL` alone is enough to turn it on
for one run, with `MATIC_LOCAL_BASE_URL` and `MATIC_LOCAL_API_KEY` if needed.

**This swaps the provider; it does not add a routing tier.** Where a local model should sit
relative to tier-0 and the cloud — cost, latency, what to do when both are reachable — is a real
decision and it is not made here.

§3 of the proceed handover calls the adapter "provider Tier 3", which was ambiguous without the
brief. **The hub spec §12 settles it: the tiers are commercial, not routing** — 1. Managed (we
provide inference; Bedrock per §11), 2. Bring your own key, 3. Customer-hosted — and *"that single
adapter **is** the customer-hosted tier"*.

§12 also requires the provider interface to **return a structured proposal, not a tool call**,
because depending on a vendor's tool-calling dialect welds you to that vendor. This satisfies it:
`propose()` returns a `Proposal` or an escalation, and the dialect stays an implementation detail
inside each adapter — Anthropic's in `cloud-client.js`, OpenAI's here.

**Endpoint deployment is out of scope.** The design partner has confirmed no discrete GPUs and no
local LLM on endpoints (hub spec §2). This adapter is for hub-side and customer-hosted inference.

---

## 2. `[VERIFY]`: how structured output actually behaves

Settled empirically against the Ollama installed here (0.33.2), which is stronger than reading
docs. **Tool calling via `/v1/chat/completions` works** and is the mechanism used — no need for
the native `format` fallback, and certainly not prompt-and-validate.

- `tool_choice: "required"` forces a call.
- Arguments come back as a JSON string, per the OpenAI schema. The client tolerates an object too,
  because some servers return one.
- `max_tokens` must be set. Without it a verbose model spends its whole budget reasoning and
  returns `finish_reason: "length"` with no tool call, which looks like a refusal to use tools and
  is not one. Observed on `gemma4:12b`.

### The finding that shaped the design

**Ollama does not enforce the schema.** Anthropic's `strict: true` guarantees tool arguments match;
an OpenAI-compatible server does not have to, and this one does not. Measured on a quiet GPU at
temperature 0, reproducibly across two runs, `gpt-oss:20b` returned:

```
category="Hardware"                          (enum wants "hardware")
suggestedOwner="Laptop Manufacturer Support" (not in the enum at all)
category="Software Licensing"                (not in the enum at all)
suggestedOwner="Adobe Support"               (not in the enum at all)
```

Every violation was on `escalate`. Capability parameters came back clean every time — `serviceName`
never strayed off its enum. That distinction is the whole design:

| | re-validated by the broker? | what the client does |
|---|---|---|
| capability proposal | **yes** — refused and audited, naming the gate | passes it through unrepaired, so the refusal is recorded |
| escalation | **no** — goes straight to the inspector, and the transcript speaks the owner aloud | validates and enforces the enums itself |

An escalation with `suggestedOwner: "Adobe Support"` puts a routing decision nobody chose into the
room, spoken by the avatar. Same family as **H3e**: constrain what the model is allowed to
influence. It supplies the facts, not the words a human acts on.

So the client:

1. Validates the tool output with the **same validator the broker uses**, so both halves agree on
   what valid means.
2. Tries **one** repair turn, feeding the violations back. One, not a loop — a model that cannot
   produce a closed enum on the second try will not manage it on the fifth, and a support assistant
   that thinks for a minute is worse than one that says it could not work it out.
3. If an escalation is still off-list: `category` falls back to `other` (which is what the enum has
   `other` for), `suggestedOwner` becomes `null`, and what the model actually said is kept in
   `offList` so the inspector shows it rather than hides it. The spoken line then says a person
   needs to route it, and **never names the invented owner**.

**The repair turn works in practice.** In a live end-to-end run, both escalations that failed on
the first attempt self-corrected to sensible enum members — `Hardware` + `Laptop manufacturer
support` became `physical` + `vendor`; `Software Licensing` + `Adobe Support` became
`account_or_licensing` + `vendor`. The `other`/`null` fallback never fired. Effective conformance
for `gpt-oss:20b` goes from 3/5 to 5/5 at the cost of one extra round trip.

---

## 3. Measurements

> **Superseded by the 40-case bake-off:** **[`BAKEOFF-2026-09-02.md`](BAKEOFF-2026-09-02.md)**,
> now five models including a cloud baseline. Headline: **`mistral-small:24b`** at 1.8 s per correct
> proposal with four false actions, against `claude-haiku-4-5` at 2.4 s and eight — the self-hosted
> model beats the cloud model it would replace on this task, rather than merely undercutting it.
> The five-case figures below are kept only because they are what the design decisions above were
> made against, and they were badly over-optimistic: `gpt-oss:20b` scored 5/5 here and **31/40 with
> eight false actions** on the full set. `mistral-small:24b` is the pick.

RTX 3090 Ti 24 GB, Ryzen 9 3900X, 32 GB RAM. Quiet GPU, 1.4–1.6 GB desktop baseline. Five
hand-written cases. **These are single-machine observations recorded for engineering purposes,
not benchmarks, and no performance claim rests on them.**

| | `gpt-oss:20b` | `gemma4:12b` | `gemma4:31b` |
|---|---|---|---|
| capability selection | 5/5 | 4/5 | not measurable |
| schema-valid parameters, first attempt | 3/5 | 4/4 of calls made | — |
| schema-valid after one repair turn | 5/5 | — | — |
| median warm latency | 1.8 s | 7.4 s | ~182 s for 8 tokens |
| cold load | 40 s | 34 s | > 10 min |
| peak VRAM over baseline | 13.1 GB | 8.9 GB | 21 GB, spills to CPU |

**`gemma4:31b` is ruled out on this hardware.** Not contention — re-run with the GPU idle. Ollama
places it `10%/90% CPU/GPU` at 16k context: 21 GB on a 23 GB card spills, and a trivial 8-token
reply took 182 seconds. §3 ruled out `llama4:scout` (67 GB) and `qwen3.6` (23 GB, no context
headroom) on size; `gemma4:31b` fits and still fails, which is the more useful kind of no.

**`gemma4:12b` inverts the trade.** It respected every enum unaided, but it is ~4× slower and on
"no internet, no IP at all" it never emitted a tool call — burned past 2048 tokens and returned
`finish_reason: length`. Reproduced with `max_tokens` set explicitly, so it is the model failing
the case, not a budget artefact in the probe. On §4's metric — false-action rate weighted hardest —
a model that produces nothing beats one that produces a confident wrong routing, so this is not the
straightforward loss the accuracy column suggests.

### Cold load is an operational problem, not a latency one

40 s of dead air on the first turn. The adapter does not paper over this: keeping a model resident
is a deployment concern (`keep_alive` on Ollama, via `extraBody`), and a timeout says plainly that
the model may still be loading rather than reporting a generic failure.

---

## 4. What is NOT built

- **The §4 bake-off harness.** Its design lives in the missing brief's §5. What exists is a probe
  in a scratch directory with 5 hand-written cases — not the ~30 labelled ones, not ≥8 escalation
  cases, not the 16 pinned tier-0 phrasings, and it measures nothing about cost per correct
  proposal. Deliberately not folded into the repo: §4 wants the harness built as the real Phase 3
  eval, not grown from a throwaway.
- **Any routing decision.** See §1.
- **Any claim that local models are production-ready.** §4 has to produce numbers first, and the
  numbers above are five cases on one machine.

---

## 5. Honesty ledger — additions

- **Hub spec §16 lists "Ollama's current structured-output API" as NOT verified. That is now
  closed.** Tool calling on `/v1/chat/completions` works, arguments return as a JSON string, and
  the server does **not** enforce the schema — see §2.

- **The local provider is off by default and the demo build does not use it.** Nothing on
  `add-matic-desk-demo` changes at all; this is `post-demo` only.
- **Ollama does not enforce tool schemas.** Saying "the schema constrains the model" is true of the
  Anthropic path (`strict: true`) and **not** of the local path, where enforcement is the client's
  own validator plus the broker's. Do not blur the two.
- **The escalation enums are enforced by the client, not by any server.** If someone points this at
  a different endpoint, that enforcement still holds — it is in `OpenAICompatibleClient`, not in
  the provider.
- **No performance claims.** Every number in §3 is a single observation from one machine.
- **`gemma4:31b` was ruled out by measurement on this machine**, not in general.
