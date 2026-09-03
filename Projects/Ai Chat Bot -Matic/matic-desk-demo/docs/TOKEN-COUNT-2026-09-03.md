# Shipped prompt prefix vs. the prompt-caching floor — measured

**Date:** 2026-09-03 · **Branch:** `post-demo` · **Decision:** D140 in [`decisions/DECISION-REGISTER.md`](decisions/DECISION-REGISTER.md)
**Script:** `eval/count-tokens.mjs` (`npm run count-tokens [model]`) · **Endpoint:** `messages.count_tokens`, `@anthropic-ai/sdk` 0.123.0

The 2026-09-02 review estimated the shipped system prompt plus tool catalog at ~1,500 tokens (4 characters per token) plus 496 of tool-use overhead, against Haiku 4.5's 4,096-token minimum cacheable prefix, and asked for the estimate to be confirmed with `count_tokens` before the cost model relied on it. Confirmed.

---

## 1. Method

The script constructs a real `CloudClient` and reads its `tools` array, so the request counted is **byte-identical to what `src/agent/cloud-client.js` sends**: `systemPrompt(catalog)`, one `strict: true` tool per capability with `whenNotToUse` appended, the `escalate` tool, `tool_choice: {type: "any"}`. Parts are isolated by counting with a one-token placeholder message and subtracting. `count_tokens` is free and model-specific.

## 2. Results

### `claude-haiku-4-5` — the routine model, shipped in `config.json`

| Part | Tokens |
|---|---|
| System prompt (`prompt.js`, 1,304 chars) | **319** |
| Tools + tool-use system overhead, `tool_choice: any` (4,580 chars of JSON) | **1,784** |
| **Cacheable prefix, `tool_choice: any`** (system + tools) | **2,104** |
| Cacheable prefix, `tool_choice: auto` | 2,012 |
| Full shipped turn (prefix + machine-state block + one user sentence) | 2,261 |
| Haiku 4.5 minimum cacheable prefix (docs) | **4,096** |
| **Shortfall** | **1,992 tokens** |

Ratio: 2.8 characters per token on this prefix, not 4 — the JSON tool schemas tokenise densely. The review's estimate (~1,500 + 496 ≈ 2,000) was right in direction and close in total.

### `claude-sonnet-5` — the escalation model, for comparison

| Part | Tokens |
|---|---|
| System prompt | 447 |
| Tools + overhead, `tool_choice: any` | 2,153 |
| Cacheable prefix, `tool_choice: any` | 2,600 |
| Full shipped turn | 2,801 |
| Sonnet 5 minimum cacheable prefix | 1,024 |

Sonnet 5 uses a different tokenizer (about 24% more tokens on the same bytes) and its floor is lower, so the same prefix **would** cache there.

## 3. What this confirms and what it changes

1. **The finding is confirmed.** On the routine model the stable prefix is roughly half the cacheable minimum. A `cache_control` marker would be accepted and silently do nothing: `cache_creation_input_tokens: 0`, every token billed at full input price, every token counted toward input-tokens-per-minute.
2. **A second fact the review did not have: caching is not attempted in code at all.** `cloud-client.js` sets no `cache_control` on any block and no top-level `cache_control`. So the spec's assumption that caching cuts routine-turn cost is unimplemented as well as impossible on Haiku as shipped. The cost model must be built **uncached** unless one of the options below is taken.
3. **The shortfall is 1,992 tokens, and padding is cheap in dollars.** Cache writes cost 1.25× input for the written tokens once per five-minute window; reads cost 0.1×. Adding ~2,000 stable tokens to the prefix so that the whole ~4,100 caches would, on a busy fleet, cost less per turn than the 2,104 uncached tokens do today. The review called this "a real option, it is cheap."
4. **But padding is not free in this codebase.** `prompt.js` is shared by both providers *as a correctness requirement*: the bake-off compares models, and two providers wording the prompt differently would measure the wording. Any padding must therefore be **Anthropic-path only** (added in `cloud-client.js`, not `prompt.js`), must be **inert** for the model (not more instructions — the `whenNotToUse` experiment showed tool-description text changes behaviour), and must be **stable bytes** placed before the volatile machine-state block. A block of catalog `plain/*` text, which the model already sees indirectly and which is signed content, is the obvious candidate; it would need a bake-off re-run on Haiku to show the score did not move.
5. **The alternative is to write caching off for Haiku** and accept 2,261 uncached tokens per turn. At $1/MTok that is $0.0023 per turn; the A3 spend-cap arithmetic in the review already assumes the uncached case for the worst-case tier.

**D140 records the measurement; the choice between (3)/(4) and (5) is the founder's.** It interacts with D138 (Scale tier, workspaces) and with the caveat that per-tenant workspaces isolate caches, so a padded prefix is written once per tenant per window, not once for the fleet.

## 4. Re-measure when

`prompt.js`, `catalog.json` (any `description`, `whenNotToUse`, parameter schema or a fifth capability), the escalation schema, or the model changes. The script is provider-exact, so the number cannot drift from the code.

## 5. Honesty ledger

- Two API calls per model, no sampling: `count_tokens` is deterministic for a given request and model.
- The floors (4,096 / 1,024) are from the prompt-caching documentation as read on 2026-09-03 via the Claude API skill's cached reference; the endpoint itself does not report a floor. If Anthropic changes the floor, only the verdict line in the script changes.
- No dollar figure here is a cost model. §3 items 3 and 5 are per-turn arithmetic at list price to size the decision, nothing more.
