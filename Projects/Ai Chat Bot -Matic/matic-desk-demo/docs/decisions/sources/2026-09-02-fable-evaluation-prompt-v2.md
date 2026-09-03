# Evaluation Prompt v2 — Matic Desk Hub Design Review

**Supersedes** `2026-09-02-fable-evaluation-prompt.md`. Bedrock is out; that changed Part A
materially.

**Run in:** a **fresh** Claude Fable session with web search enabled, or Claude Code with network
access. **Not** in the session that produced the design.

**Why fresh:** conflict detection degrades once a model has committed to a design. The session that
produced D42–D129 is the worst available evaluator of them.

**Attach:**
- `2026-09-02-hub-server-side-spec-handover.md` (v1, partially stale — §8 of the consolidated
  register lists the deltas)
- `2026-09-02-matic-desk-decision-register-consolidated.md` (**apply +7 to every ID** — see below)
- `2026-09-02-decisions-D91-D124-updates-notifications-kb-sync.md`
- `HANDOVER-2026-09-02-post-demo.md`
- `BAKEOFF-2026-09-02.md`
- `PHASE1-TICKETING.md`

**Do not attach** any chat transcript. The point is an unprimed reader.

**Numbering warning.** The consolidated register numbers from D35 and collides with the
authoritative D1–D41 in `ASK-IT-questionnaire.xlsx`, which is not on disk. Add 7 to every ID in that
file. The D91–D124 file is already correct. **If this bookkeeping confuses you, say so — that is
itself a finding.**

---

## THE PROMPT (copy from here down)

You are acting as **Principal Architect performing an independent design review** for a seed-stage
company. You did not write this design. You are paid for judgment, not agreement, and specifically
not for confirming what the previous reviewer found.

### Product

A locally-installed AI service desk technician: an animated avatar in the Windows taskbar that
converses with a user, diagnoses problems, applies fixes from a curated catalog of typed Win32
primitives, and escalates to a ticketing system when it cannot resolve the issue. Sold as an
alternative to outsourced L1 service desk. Two endpoint processes — an unprivileged agent and a
privileged broker. A hub provides fleet identity, signed content distribution, central audit,
inference proxying and ITSM integration.

**A working demo exists.** The hub does not — spec written, nothing built.

### Non-negotiable behaviors

1. **No invented facts.** No fabricated studies, benchmarks, pricing, schema field names, library
   versions or licence terms. Where you lack a verified source, write exactly: `I do not have a
   verified source for this.`
2. **Mark unverified claims inline** with `[VERIFY]` and collect them at the end.
3. **Cite what you retrieved** — URL and access date for every Part A answer. Prefer primary vendor
   documentation over blogs, Stack Overflow and AI-generated summaries. If only secondary sources
   exist, say so; do not launder one into a confident claim.
4. **Separate targets from measurements.** The model bake-off is the only measured artifact in the
   project, and it is single-machine, 40 hand-written cases, one run pair. Every endpoint
   performance figure is a target.
5. **Surface conflicts rather than resolving them quietly.**

### Sequencing — read carefully

Both decision documents contain conflict tables (C1–C12) found by the previous reviewer.

**Complete Part B before reading them.** Form your own list from the source documents, then compare
in Part C. Report: conflicts you found that they missed; conflicts they raised that you think are
wrong or overstated; where you agree.

If you read their list first you will anchor on it and this review is worthless.

---

## Part A — Verification

The previous reviewer had no web access. Each answer changes downstream work.

### A1. Embedding model — the highest-value item in this review

Amazon Titan Text Embeddings V2 was the choice; it went out with Bedrock. Hub spec §11 calls the
embedding model the least reversible decision in the system, and it is currently **undecided**.

- What are the credible current options, hosted and self-hostable? For each: dimensions, context
  length, licence, and whether weights are downloadable.
- **Can the same embedder serve both a managed hub and a customer-hosted hub?** If not, a customer
  can never be migrated between deployment modes without a full re-embed. Say plainly whether this
  is achievable.
- What does re-embedding an existing corpus actually cost in time and money at, say, 10,000
  articles? Vectors from different models are not comparable, so this is the true switching cost.
- Does a self-hostable embedder of adequate quality run on CPU, or does every customer-hosted hub
  need a GPU? This determines whether the self-contained SMB deployment is viable at all.
- Confirm `pgvector` on RDS PostgreSQL: versions, index types, dimension limits, instance-class
  caveats.

### A2. ServiceNow

- Do `interaction` and `interaction_related_record` exist? Fields, cardinality, does `interaction`
  extend `task`? **Is there a REST create API for interaction records?** Without one, the session
  model is not implementable.
- `task` base field list and inheritance to `incident` / `change_request` / `sc_req_item`.
- `opened_by` vs `caller_id` for integration-filed tickets.
- **Internal work notes vs customer-visible comments** — exact field names and visibility semantics.
  Load-bearing: reading internal engineer commentary aloud to the user it concerns is a serious and
  easily-shipped failure.
- KB read criteria: can entitlement be evaluated server-side from retrieved data, or must searches be
  proxied per-user through the customer instance? Does that need a licensed account per end user?
  **These differ by a large amount of engineering work.**
- Restricted ticket classes (HR, security, legal) needing explicit exclusion from retrieval.
- SCIM 2.0 attribute paths against RFC 7643.

### A3. Anthropic API

Bedrock is out; the Anthropic API direct replaces it.

- Current per-token input and output pricing for Claude Haiku 4.5 and Sonnet 5.
- Rate limits and concurrency at a tier a seed-stage company would hold, and whether they constrain
  a 5,000-endpoint fleet.
- Data residency and retention terms — relevant to a design that proxies all customer conversation.

### A4. AWS

- RDS `db.t4g.micro` pricing in **us-east-1** and **us-east-2** (the cost model quotes the wrong
  region).
- `max_connections` on `db.t4g.micro` for PostgreSQL, and whether it forces a pooler under
  schema-per-tenant.
- Whether removing Bedrock changes the region calculus at all.

### A5. Endpoint

- TPM 2.0 signing latency via the Windows platform crypto provider, and TPM prevalence and failure
  modes in corporate fleets.
- **Corporate outbound TLS inspection prevalence and exemption process** — the strongest single
  argument for rejecting mTLS.
- EDR allowlisting guidance for a third-party privileged Windows service. Does frequent signed-binary
  updating invalidate hash-based exceptions?
- Standard practice for MSI-based update distribution where users have no local admin.

State plainly where you could not find authoritative answers.

---

## Part B — Independent evaluation

**Do not read any conflict table until this is complete.**

### B1. Invariant audit

Ten invariants: H1, H2, H3, H3b, H3c, H3d, H3e (locked), H4, H5, H6 (proposed).

For each, construct a scenario where an attacker or a bug achieves the prohibited outcome **without
violating the stated wording**. Invariants fail at their edges.

Pay particular attention to the three proposed ones, which exist because the previous reviewer found
exactly this kind of gap:
- **H4** — hub policy may only narrow capability, never widen it.
- **H5** — hub-supplied text reaching the user is inert and attributed. Covers announcements, alerts
  and escalation payloads. Note that shipped code already has this gap: escalations are not
  re-validated by the broker and the avatar speaks the owner aloud.
- **H6** — signed content carries a freshness bound, so a hub cannot pin a fleet to an old version by
  staying silent.

### B2. Conflict pass

List every pair of requirements in tension. Areas worth pressure:

- hub-side retrieval and prompt assembly vs "the endpoint owns the conversation loop"
- a Postgres `SKIP LOCKED` job queue vs schema-per-tenant (no third option exists)
- per-tenant signed catalogs vs the signing key never living on the hub
- customer-hosted deployment vs telemetry, deflection measurement and canary rings
- the broker never opening a socket vs one consent flow and one audit log
- offline capability vs a hosted embedding model

### B3. The egress model

The design resolves an `E1` egress tier proposal by making **egress a second axis** (a declarative
catalog property valued `none` / `hub` / `third-party`) rather than a fifth risk tier, and by ruling
that conversational turns need session-scoped disclosure while assembled payloads need per-action
consent.

Attack this. Is the axis separation real or a rationalisation? Is "data the user did not author"
a defensible consent boundary, or does it fail on a case the design has not considered?

### B4. The update trust model

Broker updates ship as an MSI through customer tooling; the agent may self-update; the hub advertises
binary availability but never delivers binaries; the named pipe becomes a version boundary requiring
protocol negotiation.

Find the failure this creates. Consider specifically: a fleet where agent and broker versions have
diverged for months, and a security fix that lands in the broker.

### B5. The load-bearing assumption

Identify the single assumption that, if false, wastes the most engineering. Argue for it over the
runners-up.

### B6. Scope challenge

The privileged execution path — broker service, signed catalogs, consent tokens, risk tiers,
rollback, EDR allowlisting — is the majority of the engineering and most of the invariants. It
enables four network-recovery primitives. Knowledge-base answering, ticket filing and alerts need
none of it.

Two measured findings bear on this. The bake-off's `tier0-pinned` column shows every model scoring
14–16 out of 16 on phrasings a deterministic router already handles with no model at all, while the
best adversarial result is 3/6 — *the model contributes least where it is most reliable*. And the
entire R2-false-action-to-zero improvement came from two catalog preconditions and a tool-description
field, not from model choice.

Argue that the endpoint agent should be **phase two**, with a chat surface doing KB answering, alerts
and ticket creation as phase one. Then argue the opposite. **Recommend one** and state what evidence
would change your mind.

### B7. Estimate

The hub was estimated at 8–14 engineer-weeks before roughly ninety further decisions were added.
Decompose the first work item — device identity, enrollment, issuance, rotation, revocation — and say
whether it fits the ~2 weeks the aggregate implies. Do not produce a competing total unless you can
justify it.

### B8. What is missing entirely

Not wrong — absent. Things a production system needs that appear in none of these documents.

---

## Part C — Comparison

Now read the conflict tables (C1–C12) and the open items.

Report conflicts you found that they missed; conflicts you believe are wrong, overstated or already
resolved by the text; and where you agree, noting whether your reasoning differs.

Disagreement is a useful output. If you agree with everything, say so plainly and say why — but check
first whether you are agreeing or anchoring.

---

## Output constraints

- Write for an engineer implementing from it, not for a pitch deck.
- Tables where structured; prose where reasoning matters.
- No restating the documents back. No motivational closing.
- **Lead with the three findings that most change what gets built next week.**
- If a section would be padding, cut it and say why.

## What good looks like

The founder learns at least one thing about their own product they did not already know —
specifically, one place where what they asked for is not what they want.

## (end of prompt)
