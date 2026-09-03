# Claude Code Handover — 2026-09-03 — filing, the renderer gap, then B1

**Repo root:** `C:\Users\Charles\Downloads\maticdesk_bot`. Repo paths below are relative to it;
non-repo paths are absolute.

**Context:** `main` is at `f1c6a37`. B0 is built and measured, D130 is implemented, the register is
at D166 with D167 the next free ID. `docs/2026-09-03-handover-answers.md` holds the previous
answers.

**Three tasks, in order.** Task 1 is filing and includes a content gap that matters. Task 2 is a
ten-minute manual check that closes the last D130 gap. Task 3 is B1 and is the substantial work.

---

## Task 1 — File six documents

All six are now in `C:\Users\Charles\Downloads\`. Confirm each before acting; do not reconstruct any
that are missing.

| Source (in `Downloads\`) | Destination | Note |
|---|---|---|
| `2026-09-03-threat-model-v1.md` | `docs/` | **Closes OPEN-5** |
| `2026-09-03-phase1-plan.md` | `docs/` | Tracks A/B/C, twelve exit criteria |
| `2026-09-03-B0-walking-skeleton-spec.md` | `server/docs/` | Directory needs creating. **Carries a supersession note** — see below |
| `2026-09-03-generic-kb-schema-and-findings.md` | `docs/kb/` | Beside `generic-kb-v2.json` |
| `2026-09-03-kb-architecture-authoring-ux.md` | `docs/kb/` | **New to the repo, and it contains unrecorded decisions** — see 1b |
| `2026-09-03-claude-code-handover-questions-and-followups.md` | `docs/handovers/` | Previous handover, for the record |

### 1a. Two documents carry status notes rather than being filed as written

**`2026-09-03-B0-walking-skeleton-spec.md`** now opens with a supersession block: §5's "should
reproduce 35/40" is wrong, both paths scored 33/40, they were identical on all 40 cases, and the
drift is the model's between Ollama sessions rather than the hub's. It points at
`docs/2026-09-03-handover-answers.md`.

**`2026-09-03-kb-architecture-authoring-ux.md`** §0 now records that KCS was partially verified —
lifecycle state names confirmed, the rest not individually checked. **Please rewrite §3 against the
sources you actually retrieved** rather than leaving the note bolted on. You have the sources; the
author of §3 did not.

### 1b. **A content gap, not just a filing gap**

`2026-09-03-kb-architecture-authoring-ux.md` was never on disk when the register merge ran, so its
decisions were never merged. Searching `docs/decisions/DECISION-REGISTER.md` on 2026-09-03 returns
**zero matches for "hybrid" and zero for "review queue."**

That means **the retrieval architecture is not recorded anywhere in the register**, and B7 could be
built without it. Merge these as D167+:

- **Hybrid retrieval.** pgvector semantic leg + Postgres full-text lexical leg, fused by Reciprocal
  Rank Fusion (`1/(k+rank)`, k≈60, chosen because it needs no score normalisation), then a
  cross-encoder rerank of the fused top ~20, with 3–5 chunks reaching the model. **Hybrid is a
  requirement, not a refinement**: IT knowledge is dense in error codes, patch numbers and registry
  paths — exactly the tokens dense embedding fails on and BM25 succeeds on. Both indexes live in the
  Postgres already committed to, so no new dependency. `[VERIFY]` cross-encoder options and CPU
  viability remain unretrieved.
- **The admin's home surface is a review queue, not an article list.** Four feeds: drafts from
  resolved sessions, KB gaps (queries retrieving nothing above threshold, or where the user escalated
  immediately after an answer), staleness, duplicates. Each opens pre-filled with a one-click
  approve. The design target is **review, not composition** — if the common path is a blank editor,
  `04-TEAM-REVIEW` §9 A5 fails regardless of editor quality.
- **Admin search runs the same hybrid retrieval the agent uses**, showing rank and score. Free
  diagnostic: if the admin cannot find it, neither can the bot.
- **Preview before publish** — show the retrieval result and the model's answer with the edit applied.
- **Build the KB; do not adopt an open-source KB platform.** Wiki.js, Outline, BookStack and similar
  are human authoring-and-reading tools; they do not model per-user entitlement, they ship human
  full-text search rather than hybrid retrieval with reranking, and each is a second application to
  install and patch in a customer-hosted deployment — which is what §5 rejected Zammad for. **Import
  from them; take their chunking pipeline; do not run them.**
- **Corpus size is a tenant-tier input.** A `db.t4g.micro` running HNSW plus GIN plus the ticket store
  plus the job queue is a pilot instance, not a 100,000-article one. Per-tenant indexes mean the
  constraint is the largest single corpus, not the sum. Vertical scaling, not redesign — but it must
  reach the pricing model rather than be discovered in production.

Also worth an entry: **run-to-run variance on the bake-off is 2 while the top three models are
separated by 1.** The accuracy ranking between mistral, Haiku and gemma is not established by
single runs. D97's safety conclusion is unaffected. Any external model claim needs 3–5 runs per
model first — machine time, not engineering time.

---

## Task 2 — The renderer click-through (ten minutes, closes the last D130 gap)

Twelve headless checks pass through the real Agent, HubClient, live hub, model, broker and two-step
consent. The untested half is **the human-facing half of a mechanism whose entire purpose is what the
user sees.** The broker renders `rendered`; whether the Electron renderer displays it verbatim is
precisely what D130 guarantees, and no headless test can reach it.

Needs elevation and a UAC prompt, so **Charles runs this, not you.** Prepare a short checklist at
`client/docs/D130-RENDERER-CHECK.md` for him to work through:

1. All three demo scenarios, consent card shown, approved, executed.
2. The card's visible text matches `consentRendered` in the audit record, field for field —
   including the explain-panel text (`notice`, `undo`, `why`, `risk`) now that the broker renders
   those too.
3. Deny, then a second request within 120 s: the supersede path (D166) works and the superseded
   request is audited.
4. An expired nonce — leave a card unclicked for over 120 s, then approve. Refused, audited, with
   its text.

Record the result in the same file. **Do not start Task 3's schema work before this is done** — the
renderer contract is about to be frozen into a wire format.

---

## Task 3 — B1: control-plane schema and first migration

D143's decision, and the foundation for everything hub-side. It gates the two longest items:
**enrollment (6–8 engineer-weeks, the largest single item in Phase 1)** and **KB retrieval**.

### Scope — build the foundation, not the features

**In:** schema definition, a migration runner that applies to the control plane and to every tenant
schema, tenant creation, and a test proving isolation.

**Out:** enrollment logic, the ticket store, KB tables, audit ingestion. Those are separate items
that sit on this.

**Also out: do not retrofit persistence into `server/src/turn.js`.** B0's statelessness is a
property worth keeping — the `/v1/turn` route needs no database and should not acquire one here.

### Shape

**Control-plane schema** — one, shared: `tenants`, `devices`, `enrollment_requests`,
`enrollment_secrets`, `releases`, `job_queue`, `admin_users`, `admin_audit`,
`vendor_access_grants`.

**Per-tenant schemas** — one each: sessions, tickets, KB articles and chunks, ingested audit
records, users. Create the tables as later items need them; B1 establishes the pattern and the
migration path.

### Four things to get right, because they are expensive later

**The job queue carries references, not payloads.** It is the one deliberate cross-tenant table.
Rows should carry a job id, a type, and a tenant schema name — so a bug leaks a job id and a schema
name rather than customer data.

**The worker asserts the tenant schema from the job row before every query** (D143). This is the
security-relevant line in the whole design and belongs in one place that every worker path goes
through, not repeated at call sites.

**Connection handling.** A `db.t4g.micro` has roughly 80 usable connections, which is why per-tenant
pollers were rejected. With a pooler, setting `search_path` on checkout is unsafe — a pooled
connection can be handed on with a stale path. **Either schema-qualify every query, or set
`search_path` inside the transaction.** Pick one and enforce it; mixing them is how cross-tenant
leaks happen.

**pgvector must be enabled** in the per-tenant schema template even though KB tables come later
(D52a). Cheaper to establish now than to add to N existing schemas.

### Development database

Local Postgres in Docker, pinned to the RDS major version you intend to run, with pgvector
available. `[VERIFY]` pgvector's supported versions on RDS PostgreSQL — the review retrieved the
`maintenance_work_mem` formula but I do not believe the extension version matrix was checked.

### Exit criteria — falsifiable

1. Two tenants exist with separate schemas.
2. A query executed in tenant A's context **cannot** read tenant B's rows, proven by a test that
   tries.
3. A migration applies to the control plane and to both tenant schemas in one run, and is
   idempotent.
4. Adding a third tenant applies every existing migration to the new schema automatically.
5. A job enqueued for tenant B is picked up by a worker that asserts B's schema and can see only B's
   data.
6. `SELECT ... FOR UPDATE SKIP LOCKED` hands the same job to exactly one of two concurrent workers.

---

## Out of scope, and why

- **Named-pipe transport and the Windows Service.** Track A. Not blocked by the certificate — only
  the MSI and the EDR submission are — but B1 gates longer items, so it goes first.
- **Enrollment, ticket store, KB retrieval.** All sit on B1.
- **Code-signing certificate.** With Daniel Chow. OPEN-9. Blocks the signed MSI, D151's standalone
  updater, and OPEN-8.

## Standing note

The **top-30 ticket categories are six weeks outstanding.** Nothing here is blocked on them; the
Phase 1 exit criteria are — particularly the product criterion from
`C:\Users\Charles\Downloads\Happy People\04-TEAM-REVIEW-AND-DATA-REQUEST.md` §9 A2: a non-technical
person with a genuinely broken laptop resolves it unassisted three times out of five.

## Note on tooling

Desktop Commander's file search **does not support `|` alternation** — a multi-term pattern returns
zero matches silently rather than erroring. This produced two false "not found" results in the
session that wrote this handover. Use single substrings.
