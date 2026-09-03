# Shipped prompt prefix vs. the prompt-caching floor — measured

**Date:** 2026-09-03 · **Branch:** `post-demo` · **Decisions:** D140 (the measurement) and D161 (caching on the Sonnet-class path, no Haiku padding — §6) in [`docs/decisions/DECISION-REGISTER.md`](../../docs/decisions/DECISION-REGISTER.md)
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

**D140 records the measurement; the choice between (3)/(4) and (5) is the founder's.** **Made 2026-09-03: (5) for Haiku — uncached and unpadded, revisit on volume — and caching turned on where the floor is met. D161; verified in §6.** It interacts with D138 (Scale tier, workspaces) and with the caveat that per-tenant workspaces isolate caches, so a padded prefix is written once per tenant per window, not once for the fleet.

## 4. Re-measure when

`prompt.js`, `catalog.json` (any `description`, `whenNotToUse`, parameter schema or a fifth capability), the escalation schema, or the model changes. The script is provider-exact, so the number cannot drift from the code.

## 5. Honesty ledger (of §1–§4)

- Two API calls per model, no sampling: `count_tokens` is deterministic for a given request and model.
- The floors (4,096 / 1,024) are from the prompt-caching documentation as read on 2026-09-03 via the Claude API skill's cached reference; the endpoint itself does not report a floor. If Anthropic changes the floor, only the verdict line in the script changes.
- No dollar figure here is a cost model. §3 items 3 and 5 are per-turn arithmetic at list price to size the decision, nothing more.

---

## 6. Verified live — caching turned on where it can work (added 2026-09-03, D161)

**Decision D161:** `src/agent/cloud-client.js` sets one `cache_control: {type: "ephemeral"}` breakpoint on the system block whenever `promptCache` is on. Tools render before system, so the one marker caches tools + system together; the machine-state block and the user's sentence are in `messages`, after the breakpoint. `promptCache` defaults per model from the floors above and the measured prefixes in §2 — **true for Sonnet 5 and Opus 5, false for Haiku 4.5** — with a constructor override. `config.json` names Haiku, so the shipped build sends exactly the request it sent before.

**Measured with `npm run verify-cache -- claude-sonnet-5`** (`eval/verify-cache.mjs`; two real calls of the same shipped turn, well under a cent at list price; not part of `npm test`):

| Call | `input_tokens` | `cache_creation_input_tokens` | `cache_read_input_tokens` | `output_tokens` |
|---|---|---|---|---|
| first | 389 | **2,412** | 0 | 126 |
| second | 389 | 0 | **2,412** | 127 |

2,412 of 2,801 prompt tokens (86%) were served from cache on the second call, at 0.1× input price. The total (389 + 2,412 = 2,801) matches §2's "full shipped turn" for Sonnet 5 exactly. The cached part is 2,412, not the 2,600 that `count_tokens` attributes to system + tools in §2: the 188-token difference is whatever the API renders after the system block — plausibly the `tool_choice: any` framing (§2 shows `any` and `auto` differing by ~92 tokens on Haiku) and the message envelope. Not investigated further; 2,412 is the number the cost model should use for the cached share.

**Sonnet 5 rejects `temperature`.** The first attempt passed `temperature: 0`, as `eval/run-bakeoff.mjs` does for every model, and got `400 invalid_request_error: "temperature" is deprecated for this model`. The app never sets it and is unaffected. **A Sonnet 5 bake-off run needs `run-bakeoff.mjs` to omit `temperature` for that model first**, and its results would not be pinned the way the others are. Recorded in D161.

**Haiku stays uncached and unpadded** for the §3 item 4 reasons; D161 records that so it is not rediscovered. **There is no Sonnet path in the client today** — one `CloudClient` on `config.model`, and the `escalate` tool hands off to a human — so this is a per-model default, not a second code path; it becomes live the day `config.model` or a hub-side escalation names a Sonnet-class model.

**Re-verify with this script** whenever `prompt.js`, `catalog.json` or the model changes. Caching regressions are silent: requests keep succeeding and the bill is just higher. The usage fields are the only ground truth.

### Honesty ledger (of §6)

- Two calls, one machine, one moment. Enough to prove the mechanism; not a hit-rate.
- The 188-token explanation is a plausible reading of §2's numbers, not a measurement.
- The floors are still the documentation's as read on 2026-09-03 (§5).
