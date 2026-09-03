# B0 — Walking Skeleton: agent → hub → Ollama

**Date:** 2026-09-03
**Sits before:** B1 in `2026-09-03-phase1-plan.md`. This is a spike that proves a seam, **not a
Phase 1 deliverable.**
**Proves:** D53 (hub retrieves, assembles, calls the model, returns a structured proposal) — the
most load-bearing untested claim in the design.

> ## STATUS — BUILT AND MEASURED. §5's target number is superseded.
>
> Implemented in `server/` and measured 2026-09-03. Results in
> `docs/2026-09-03-handover-answers.md`, which supersedes this document wherever they differ.
>
> **The result: the hub is clean.** Direct and hub paths were run in the same session and were
> **identical on all 40 cases**, with a median latency difference of 1 ms. The hub does not alter
> the request, which is what this spike existed to determine.
>
> **§5's "should reproduce 35/40" is superseded. Both paths scored 33/40.** The two cases that moved
> against the recorded baseline (`net-09`, `prn-03`) moved *the same way on both paths*, both from
> correct to no-tool-call. **The drift is the model's between Ollama sessions at `temperature: 0`,
> not the hub's.**
>
> **Consequence beyond this document.** Observed run-to-run variance on one model is 2, while the
> post-hardening bake-off separates the top three models by 1 (mistral 35, Haiku 36, gemma 37) on
> single runs each. Those numbers are inside the noise floor and **the accuracy ranking between the
> top three is not established**. D97's safety conclusion is unaffected — zero false actions reaching
> the user came from catalog preconditions and is model-independent — but any external claim that one
> model beats another needs 3–5 runs per model first. Machine time, not engineering time.

---

## 1. Why this first

The client today calls a provider directly: `cloud-client.js` to Anthropic,
`openai-compatible-client.js` to Ollama. Both work. D53 says that in joined mode the hub does the
calling instead.

**Nothing has tested that.** The whole hub design assumes a seam that has never carried traffic.
This moves an already-working local path behind a hub and sees what breaks. Zero inference cost, no
Anthropic key, no spend cap, no device identity.

**It is explicitly not a security test.** H3 exists to keep cloud credentials off the endpoint;
with Ollama there are no credentials in play, so this skeleton says nothing about whether the
security model works. Do not let it be cited as though it did.

---

## 2. Scope

**In:** one hub process, one route, one provider adapter, one new client-side provider, `source`
reporting.

**Out, and each must stay visibly out:** device authentication, tenancy, persistence, KB retrieval,
audit ingestion, TLS, spend caps, rate limiting.

---

## 3. Hub

Minimal HTTP service. Node, same runtime as the client, so there is one toolchain.

### `POST /v1/turn`

**Request** — the endpoint supplies everything; the hub holds no state:

```jsonc
{
  "conversation": [ { "role": "user|assistant", "content": "..." } ],
  "machineState": { /* the existing machine-state block, verbatim */ },
  "tools": [ /* the client's existing tools array, verbatim from the catalog */ ],
  "model": "mistral-small:24b",
  "locale": "en-US"
}
```

**Response:**

```jsonc
{
  "proposal": {
    "capabilityId": "flush_dns",
    "parameters": {},
    "reasoning": "...",
    "confidence": 0.8
  },
  "provider": "local",
  "model": "mistral-small:24b",
  "usage": { /* whatever the provider reported, passed through unmodified */ }
}
```

### Rules

1. **The endpoint sends the tools. The hub never holds a catalog.** D149 keeps the catalog
   endpoint-side and frozen in the MSI. This keeps "the endpoint validates against its own catalog"
   literally true, and means Phase 1 needs no catalog distribution.
2. **The hub is a faithful pass-through for structure.** It must not reshape, repair or reinterpret
   the provider's tool call. If the provider returns something malformed, the hub returns an error —
   it does not guess. A hub that helpfully fixes proposals becomes an authority on capabilities,
   which is precisely what it must not be.
3. **No authentication, and the absence is loud.** Bind `127.0.0.1` only, refuse any non-loopback
   origin, and log a warning on every start: *"B0 skeleton: unauthenticated, loopback only, not for
   any real machine."* The route signature must be shaped so the assertion → token exchange (D61,
   D132) slots in front of it later without changing the body.
4. **`prompt.js` is reused, not reimplemented.** Import it. The bake-off's validity depends on one
   prompt across providers — two wordings measure the wording, not the model.
5. **Provider abstraction from the first commit.** One `OpenAICompatibleProvider` on the hub side,
   the same shape as the client's. `provider: "local"` is the only value B0 needs, but the seam
   exists so Anthropic slots in without a rewrite.

---

## 4. Client

**A third provider, alongside the two that exist.** `HubClient` implements the same interface as
`CloudClient` and `OpenAICompatibleClient` — the client already has this abstraction and B0 should
use it rather than special-casing.

`config.json` gains `provider: "hub"` and `hubUrl`. Default stays as shipped, so the demo build is
untouched.

### `Proposal.source` gains a value

`broker.d.ts` currently allows `"tier0" | "tier0-state" | "cloud" | "local"`, and the comment
explains why the field exists: it *"says something different about where the sentence went, which is
the question a security review asks."*

Through a hub is a third answer. Add:

```ts
/** "hub" = the sentence went to the hub, which chose a provider. See hubProvider. */
| "hub"
```

And on `Proposal`:

```ts
/** Present only when source === "hub". What the hub reported it used. UNVERIFIED by the endpoint. */
hubProvider?: "local" | "cloud" | null;
```

**`hubProvider` is the hub's claim, not the endpoint's knowledge**, and the type comment must say
so. The endpoint knows the sentence went to the hub; everything past that is hearsay. That
distinction is the honest version and it is the one a security reviewer will ask about.

### Tier-0 is untouched

D46b: tier-0 routing stays endpoint-side with no hub dependency. B0 must not route tier-0 matches
through the hub. If the hub is unreachable, tier-0 still answers — and that is worth testing in B0
because it is cheap to test now and expensive to discover later.

---

## 5. Acceptance

Falsifiable, each one runnable:

1. All three demo scenarios complete end to end with `provider: "hub"` and produce the same
   capability proposals they produce with `provider: "local"` directly.
2. A tier-0 phrasing resolves **with the hub process stopped.**
3. With the hub stopped, a non-tier-0 turn fails with a clear message and no invented proposal.
4. A malformed provider response produces a hub error, not a repaired proposal.
5. A request from a non-loopback address is refused.
6. The audit record for an executed action shows `source: "hub"` and `hubProvider: "local"`.
7. `npm test` still passes, including `consent-surface.test.mjs` with its three known-open XFAILs.

**Then run the bake-off through the hub.** `eval/run-bakeoff.mjs` against `mistral-small:24b` via
`provider: "hub"` should reproduce 35/40 within noise. If it does not, the hub is changing the
request — and that is exactly the bug this skeleton exists to find, discovered against a measured
baseline rather than a hunch.

---

## 5a. Acceptance, checked against what was actually built (added 2026-09-03, night)

The hub was built from the founder's handover summary while this document was not on disk, so §5's
list was unknown to the builder. It has now been read against the tests that exist. **Every item is
covered, and three carry qualifications** — stated here rather than left for someone to discover.

| § | Item | Where it is checked | Status |
|---|---|---|---|
| 1 | Three demo scenarios via `provider: "hub"` produce the same proposals as `provider: "local"` | `client/eval/e2e-hub-consent.mjs` — the real `Agent`, `HubClient`, live hub, live model, shipping `InProcessBroker`, real catalog and audit | **Covered, headless only.** Needs the hub running; not part of `npm test`. **Never clicked through in the Electron renderer** — the open gap, and `client/docs/D130-RENDERER-CHECK.md` is the checklist for it |
| 2 | A tier-0 phrasing resolves **with the hub stopped** | `client/test/hub-client.test.mjs`; `e2e-hub-consent.mjs` asserts *"tier-0 resolved it locally; the hub was not consulted"* | Covered |
| 3 | With the hub stopped, a non-tier-0 turn fails with a clear message and **no invented proposal** | `hub-client.test.mjs`: hub unreachable and hub timeout both give `ok:false` with `reason: "connection"`; a 502 from the hub gives the hub's own error and *no* connection reason, because the hub answered | Covered, and the distinction between "could not reach" and "reached and was refused" is pinned |
| 4 | A malformed provider response produces a **hub error, not a repaired proposal** | `server/test/turn.test.mjs`: no tool call → 502 with *"the error names the finish reason and guesses nothing"*; provider HTTP error → 502 with the provider's detail; unreachable → 502; timeout → 504. Endpoint side: unparseable tool arguments → `ok:false`, *"nothing guessed"* | Covered on both sides of the seam |
| 5 | A request from a non-loopback address is refused | `server/test/turn.test.mjs` checks the `isLoopback` predicate (`127.0.0.1`, `::1`, `::ffff:127.0.0.1` in; a LAN peer out). The guard itself is `server/src/index.js:67`, the **first** thing in the request chain, ahead of `authenticate()` and routing | **Covered at the predicate level.** No test connects from a real non-loopback address — the server binds `127.0.0.1`, so there is nothing to connect from. Verified by reading the one guard |
| 6 | The audit record for an executed action shows `source: "hub"` and `hubProvider: "local"` | `e2e-hub-consent.mjs` executes through the real broker and asserts the record carries `consentNonce` and `consentRendered`, and that its `capabilityId` matches a proposal whose `source` is `"hub"` with `hubProvider: "local"` | **Covered indirectly.** The assertion is on the *proposal*; the record's own `source` field is written (`in-process-broker.js` records `source: proposal.source`) but not asserted equal to `"hub"`. A one-line strengthening if anyone touches that file |
| 7 | `npm test` still passes, including `consent-surface.test.mjs` **with its three known-open XFAILs** | `client/`: 277+ assertions, 0 expected failures. `server/`: 33 assertions | **Superseded.** D130 landed the same day and the three XFAILs were promoted to hard checks, so the clause about them describes a state that no longer exists. The requirement — `npm test` passes — holds |
| §5 tail | The bake-off through the hub should reproduce 35/40 within noise | `client/eval/run-bakeoff.mjs --hub …` | **Superseded — see the status block at the top of this document.** Identical to direct on 40/40 cases; both scored 33/40, and the drift is the model's between Ollama sessions, not the hub's. The register records this as **D192**: single-run differences of 1 between models are inside a measured run-to-run variance of 2 |

**The one thing §5 asked for that has not happened:** item 1 in front of a human. Everything above
is machine-checked, and the consent card — the thing D130 exists to guarantee — has still only ever
been rendered into an assertion, never onto a screen.

---

## 6. What this earns

- **The seam is real, or it isn't.** D53 stops being an assumption.
- **Customer-hosted mode is exercised** from the first commit rather than retrofitted. Hub plus
  local model on the customer's own hardware is §12 tier 3, and this is it.
- **The provider abstraction is proven on the hub side** before any credential is involved.
- **A regression baseline** — the bake-off number, now measurable through the hub.

## 7. What it does not earn

- Nothing about H3, device identity, tenancy or audit integrity.
- Nothing about latency at scale: one machine, one user, no network.
- Nothing about whether hub-side retrieval works — there is no retrieval in B0.

## 8. Verification

- `[VERIFY]` Ollama's structured-output and tool-calling behaviour was flagged in the
  ollama-provider brief §3 as *"around May 2026 and the area has moved fast."* The direct client
  path works, so it is proven for that shape; whether a hub hop changes anything is what acceptance
  item 1 tests.
- No figure in this document is measured. The 35/40 in §5 is the bake-off's post-hardening result
  for the direct path.
