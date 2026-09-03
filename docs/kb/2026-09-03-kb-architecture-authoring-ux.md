# Knowledge Base — Architecture, Authoring UX, and Client UI

**Date:** 2026-09-03
**Decisions:** **every D-number in this document is void — see the banner below.**
**Continues:** D150. Register now at `docs/decisions/DECISION-REGISTER.md`.
**Inputs:** `04-TEAM-REVIEW-AND-DATA-REQUEST.md` §7 and §9, `2026-09-02-fable-design-review.md` A1,
D108–D113, D120–D121.

> **VOID IDs — READ BEFORE CITING ANYTHING HERE.** Every D-number written in this document was
> assigned in a chat session running in parallel with the register consolidation, which had already
> issued D130–D168 to other content. The register owns the numbering (D150). This document's
> content was merged on 2026-09-03 (night) as **D167–D192**; the mapping table is
> `docs/decisions/DECISION-REGISTER.md` §5.11. **Cite the register's IDs, never this document's.**
> §3's table below has already been converted to register IDs; §1, §2, §4, §5 and §6 have not.

---

## 0. Provenance of §3 — read this first

**No external research was possible in the session that wrote this document.** The Chrome extension
reported no connected browsers and the sandbox egress allowlist excluded documentation domains
(verified: `x-deny-reason: host_not_allowed`). §3 was therefore written from memory, about
Knowledge-Centered Service (KCS), from the Consortium for Service Innovation.

> **§3 HAS SINCE BEEN REWRITTEN AGAINST PRIMARY SOURCES (2026-09-03, night).** KCS v6 was retrieved
> in a later session — the KCS v6 Practices Guide, Techniques 2.1, 5.1, 5.2 and 5.3 at
> `library.serviceinnovation.org`. The findings are recorded in register §10.4 and
> `docs/2026-09-03-handover-answers.md` Q3 item 3, and **§3 below is written from them.** The
> original from-memory §3 is not preserved here; it was superseded, and what it got wrong is stated
> in §3 rather than hidden.
>
> **The rewrite was not itself a retrieval.** §3 is written from another session's recorded findings
> against a named source, not from the source directly. Every claim in §3 is now labelled
> **confirmed** (in those findings), **inference** (reasoning from them) or **still unverified**.

§1, §2, §4 and §5 are reasoning from documents on disk and do not depend on external research.

---

## 1. Catalog and knowledge base are different, and the distinction is load-bearing

`04-TEAM-REVIEW` §7 describes auto-drafting for the **fix catalog**. The request that generated this
document is about the **knowledge base**. Designing one authoring flow for both would be wrong.

| | Fix catalog | Knowledge base |
|---|---|---|
| Content | Typed primitives with parameters (H3d) | Prose articles |
| Effect | Causes machine change | Informs only |
| Must be signed | **Yes** (D111, D134) | **No** (D110) |
| Distribution | Signed bundle, versioned | None — live hub-side (D108) |
| Authoring constraint | C3: signing key is not on the hub, so per-tenant authoring needs an offline signing step | None |
| Approval | Author ≠ approver (D148) | Should be, but not for integrity reasons |
| Blast radius of a bad entry | An unwanted machine change | A wrong answer |
| Phase | Deferred out of phase one (D138) | **In phase one (D138)** |

**Consequence: the knowledge base is the easy half and it ships first.** Catalog authoring drags C3,
H1, signing ceremonies and per-tenant key management behind it, which is exactly why D138 defers it.
KB authoring has none of that.

| ID | Decision |
|---|---|
| **D151** | **Catalog authoring and KB authoring are separate surfaces with separate flows.** They share a review pattern and nothing else. Phase one builds KB authoring only. |
| **D152** | **`04-TEAM-REVIEW` §7's auto-drafting applies to both, but arrives in phase two for the catalog.** The drafting source differs: catalog drafts come from observed resolution sequences; KB drafts come from resolved sessions and unanswered queries (D160). |

---

## 2. The economic reframe

`04-TEAM-REVIEW` §9 lists **A5: "That one IT person can maintain a catalog. Even with automatic
drafting. If not, our unit economics change and we become a services business."** §10 lists
*"catalog authoring stays engineer-only"* as a stop condition.

The stated request — that KB admin is the main interaction and must be robust and intuitive — makes
the authoring UX the instrument that tests A5.

| ID | Decision |
|---|---|
| **D153** | **Authoring effort is a measured product metric, not a UX aspiration.** Instrument: minutes per published article, drafts-reviewed per session, percentage of published articles that were drafted rather than authored, and abandonment rate mid-authoring. Q38 asks the design partner for an honest weekly time budget; D153 is how we find out whether we fit it. |
| **D154** | **The design target is review, not composition.** If the common path is a blank editor, A5 fails regardless of how good the editor is. Every screen should optimise for approving, correcting or rejecting something the system already wrote. |

---

## 3. KB practice — rewritten against KCS v6

Source: the KCS v6 Practices Guide, Techniques 2.1, 5.1, 5.2 and 5.3 (`library.serviceinnovation.org`),
retrieved 2026-09-03 and recorded in register §10.4. Each claim below is labelled.

### 3.1 The shape of KCS — **confirmed**

Eight practices in two loops. **Solve Loop:** 1 Capture, 2 Structure, 3 Reuse, 4 Improve.
**Evolve Loop:** 5 Content Health, 6 Process Integration, 7 Performance Assessment, 8 Leadership and
Communication.

That split is the useful part for us: capturing and structuring sit *inside* solving, and content
health is a separate, deliberate, measured activity. Our D177 review queue is an Evolve-Loop
instrument, and D169's authoring-effort metric is a Performance Assessment one. We had arrived at
both from `04-TEAM-REVIEW` §7 independently.

### 3.2 Article structure — **confirmed, and the from-memory version had the field name wrong**

KCS's structure is **Issue, Environment, Resolution, Cause (optional), Metadata**, plus an optional
**Internal Resolution** that is hidden when an article is externally visible.

Two corrections to what this document originally asserted:

- The first field is **Issue**, not "Problem". Our schema (register D162, `docs/kb/generic-kb-v2.json`)
  calls it `problem`. **This is a naming divergence and it is deliberate — do not silently rename
  it.** `problem` is what the register, the schema and the retrieval-weighting decision (D171) all
  say, and the field is populated from a user's own words via `symptoms`. Record the equivalence;
  do not churn the schema for vocabulary.
- **Metadata is part of the structure**, not an implementation detail bolted beside it. D171's field
  list already treats it that way.

**`Internal Resolution` is the find that matters here.** KCS already has a slot for resolution steps
that the reader must not see, gated by audience. Our equivalent rule is stricter, and for a different
reason: register D162 forbids *any* article field from describing what the bot does or naming a
capability, because under D53 article text enters the model's context, which is threat-model gap
**G4** (`docs/2026-09-03-threat-model-v1.md` §3). KCS hides internal steps from a *human* reader;
we must keep them out of a *model's* context, where hiding is not available. **Do not adopt
`Internal Resolution` as a field** — it would be a supported, structured place to write exactly the
content D162 exists to exclude.

### 3.3 Confidence states — **confirmed, exactly**

**"Work in Progress (WIP)", "Not Validated", "Validated", "Archived".** Partial knowledge is usable
immediately rather than blocked pending review, which is the behaviour D172 wants.

Our schema's `draft` maps to *Work in Progress* and `unvalidated` to *Not Validated*. Register D162
already records that the KCS names should be adopted at the next schema revision; **D172 is that
revision's decision** and the state list in it is the KCS one, not the from-memory one this document
originally printed (`Draft → Unvalidated → Validated → Archived`).

### 3.4 Audience is five levels, and we have no such attribute — **confirmed; a real gap**

**Internal, Within a Domain, Partners, Customers, Public.** Not a binary. This document's original §3
did not mention audience at all.

It is not the same axis as D44's entitlement filtering, and conflating them would be a mistake:

| | Audience level | Entitlement expression (D44) |
|---|---|---|
| Question it answers | How widely may this content be exposed at all? | Which of *this tenant's* users may retrieve it? |
| Set by | The author, as a publication property | The tenant's directory groups, via SCIM (D145) |
| Failure if wrong | Content reaches a class of reader it was never cleared for | One employee sees another department's article |

Both are needed. Generic KB (D45) is vendor-authored with no entitlement rules, so it needs the
audience attribute and not the entitlement one; customer KB needs both. Register D162 carries the
requirement that a KCS-style five-level audience attribute exists **before any article is
customer-visible.**

### 3.5 "Capture inside the workflow" — **confirmed as a practice; the strong claim is inference**

Capture and Structure being practices 1 and 2 of the *Solve* Loop confirms the ordering: knowledge is
structured while solving, not afterwards. The stronger phrasing this document used — that knowledge
is a byproduct of solving rather than a downstream documentation project — is a fair reading of that
ordering but is **our formulation, not a retrieved quotation.** It is also the same conclusion
`04-TEAM-REVIEW` §7 reached on its own, which is the better citation for us because it is a document
we own.

### 3.6 "Reuse is review" — **direction supported, mechanism is ours**

Reuse (3) and Improve (4) are adjacent in the Solve Loop, and Content Health (5) and Performance
Assessment (7) are named Evolve-Loop practices — so KCS does attach improvement to use and does
treat health as measured. **But the specific mechanism — that a retrieval which leads to a confirmed
resolution *is* the review event, replacing scheduled audits — is our inference.** It is also what
D177's queue and D185's separated retrieval logging are built on, so it should be **measured, not
cited**: D185 exists precisely so that "the article worked" and "the model reasoned well" can be
told apart.

### 3.7 "Findability beats volume" — **still unverified**

The claim that a large unmaintained KB retrieves worse than a small curated one, because
near-duplicates and stale articles crowd out correct ones, **was not confirmed by the retrieved
techniques.** Content Health (practice 5) is adjacent but does not establish it.

Keep it as our own argument, because two decisions rest on it — D173 (dedup and archival as
first-class operations) and D176 (corpus size as a tenant-tier input) — and both are cheap enough to
be worth doing on the argument alone. **Neither should be defended by citing KCS.**

### 3.8 The limit on all of it

**KCS is a practice for a human-authored, human-read knowledge base at a service desk.** Our primary
reader is a retrieval pipeline feeding a model, under an adversary model (G4) that a human-readership
practice never had to consider. Structure, confidence states and audience transfer well. Anything
about how readers find and judge articles transfers only as a hypothesis — the reader is not a
person.

| Register ID | Decision |
|---|---|
| **D171** *(this document had D155)* | **Articles are structured, not freeform.** Fields: Title, Problem, Environment, Resolution, Cause, plus metadata (owner, entitlement expression, lifecycle state, audience level, source). Retrieval weights Title and Problem above Resolution. KCS calls the first field *Issue*; we keep `problem` (§3.2). **`Internal Resolution` is deliberately not adopted** (§3.2). |
| **D172** *(this document had D156)* | **Lifecycle states are the KCS v6 confidence states, verbatim: Work in Progress (WIP) → Not Validated → Validated → Archived.** Not-Validated articles are retrievable at reduced ranking weight with a visible confidence marker. Archived articles are tombstoned, not deleted — D113 requires immediate vector removal, and the tombstone is what makes the retraction auditable. |
| **D173** *(this document had D157)* | **Deduplication and archival are first-class admin operations**, surfaced by the system rather than left to be remembered. Rests on §3.7, which is unverified — do not cite KCS for it. |

---

## 4. Retrieval — the shape, confirmed against review A1

Two methods that fail in opposite directions, fused, then reranked.

**Lexical (BM25 via Postgres `tsvector` + GIN).** Matches words, ranks by term rarity. Finds
`0x80070005`. Cannot connect "printer won't print" to "Spooler service failure" — no shared words.

**Semantic (pgvector).** Matches meaning. Gets the spooler case. **Bad at exact strings** —
`KB5034441` and `KB5034442` embed almost identically because they *mean* the same thing, while one is
the fix and the other is not.

IT knowledge is unusually dense in exactly the tokens that break semantic search: error codes, patch
numbers, registry paths, product names. **Hybrid is a requirement here, not a refinement.**

**Fusion: Reciprocal Rank Fusion.** Each method returns its top ~50; fused score is the sum of
`1/(k + rank)`, `k ≈ 60`. Chosen because it needs no score normalisation — BM25 rank 3 and vector
rank 3 contribute identically, so incomparable score scales never have to be reconciled. Both indexes
are in the same Postgres, so it is one query.

**Then rerank** the fused top ~20 with a cross-encoder scoring query-document pairs directly. This is
where most retrieval quality comes from — plausibly more than the embedder choice.
`[VERIFY: cross-encoder model sizes and CPU viability — cited from memory, and review A1 lists this as an unretrieved item.]`

| ID | Decision |
|---|---|
| **D158** | **Hybrid retrieval: pgvector semantic + Postgres full-text lexical, fused by RRF, then cross-encoder reranked. 3–5 chunks reach the model.** Both indexes live in the Postgres already committed to by §5 — no new dependency. D47 already requires lexical search for the offline generic bundle, so the lexical half is built regardless. |
| **D158a** | **It de-risks OPEN-7.** Hybrid retrieval reduces the consequence of the embedder choice, which combined with review A1's finding that re-embedding 10,000 articles costs under \$3 means the embedder is a schema decision, not a foundation. Hub spec §11's "least reversible decision in the system" does not survive that number. |
| **D159** | **Corpus size is a tenant-tier input.** A `db.t4g.micro` running HNSW plus GIN plus the ticket store plus the job queue is a pilot instance, not a 100,000-article instance — HNSW wants its index resident and that instance has 1 GB. Per-tenant indexes (D133) mean the constraint is the largest single corpus, not the sum. **This is vertical scaling, not redesign**, but it must reach the pricing model rather than be discovered in production. |

---

## 5. Authoring UX

### 5.1 The inbox is the product

| ID | Decision |
|---|---|
| **D160** | **The admin's home surface is a review queue, not an article list.** Four sources, ordered by value: (1) **drafts from resolved sessions** — the agent resolved something with steps not in any article; (2) **KB gaps** — queries that retrieved nothing above threshold, or where the user escalated immediately after an answer; (3) **staleness** — articles whose retrieval leads to escalation more often than resolution; (4) **duplicates**. Each item opens pre-filled with a one-click approve. |
| **D160a** | **Gap-driven authoring is the highest-value output of the whole system to a knowledge owner**, and it costs nothing extra — the queries are already logged. It also directly answers Q39: for line-of-business applications we cannot author, we can at least tell the customer exactly what is missing. |

### 5.2 The four operations

**Adding.** Three paths, in expected-volume order: approve a draft (one click); answer a gap (the
question is the Problem field, so the page opens half-written); import in bulk from Confluence,
SharePoint, ServiceNow or a wiki. **A blank editor exists and is the rarest path** (D154).

**Viewing.** The list is secondary to search — an admin looking for an article will search, so
**admin search runs the same hybrid retrieval the agent uses** (D158). That gives the admin the
truth: if they cannot find it, neither can the bot. This is the single most useful diagnostic in the
console and it is free.

**Editing.** Inline, autosaved, with version history. D108 means an edit is live on the next query
with no distribution step — which is a feature, and also means **preview before publish matters**:
show the admin what the retrieval and the answer look like with the edit applied.

**Reporting.** See §6.

| ID | Decision |
|---|---|
| **D161** | **Admin search uses the same hybrid retrieval pipeline as the agent**, showing retrieval rank and score. Findability is diagnosable by the person who can fix it. |
| **D162** | **Every article edit offers a preview: the retrieval result and the model's answer with the edit applied**, before publishing. Test-before-ship for content. |
| **D163** | **Bulk import connectors are phase-one scope** (Confluence, SharePoint, ServiceNow KB, generic Markdown/HTML). Customers have existing content; requiring re-authoring is a non-starter. Chunking on semantic boundaries rather than fixed character counts — chunking quality affects retrieval more than embedder choice. |
| **D164** | **Build the KB, do not adopt an open-source KB platform.** Wiki.js, Outline, BookStack and similar are human authoring-and-reading tools: WYSIWYG editors, page hierarchies, web readers. Three mismatches: they do not model D44's per-user entitlement filtering; they ship human full-text search, not hybrid retrieval with reranking for a model; and each is a full application with its own database, auth and upgrade path — a second thing to install and patch in a customer-hosted deployment, which is what §5 rejected Zammad for. What is actually needed is small: articles, chunks with vectors and tsvectors, an entitlement expression, versions with tombstones, a query endpoint. **Import from them; do not run them.** |
| **D164a** | **Take the chunking pipeline from open source.** Semantic-boundary splitting is solved with permissive licences. Do not reimplement it. |
| **D165** | **Author ≠ approver applies to KB as a workflow default, not an integrity control** (contrast D148 for the catalog, where it is an integrity control). Tenant-configurable, because a two-person IT team cannot enforce it and A5 says that team is the target. |

---

## 6. Measurement

The stated metric — tickets resolved versus tickets opened — **is not measurable as stated**, per
D89 and D118. A session where the user got an answer and closed the window is indistinguishable from
one where they gave up and walked to IT. Counting the ambiguous case as resolved yields a larger
number that loses the room the first time a competent IT lead pushes on it.

**Outcomes: resolved** (explicitly confirmed), **escalated** (ticket created), **unresolved**
(everything else including abandonment), **suppressed** (an alert prevented a session; proxy-measured
against baseline).

Deflection = resolved ÷ (resolved + escalated + unresolved).

| ID | Decision |
|---|---|
| **D166** | **Retrieval quality is logged separately from session outcome.** Which chunks were retrieved, with scores; which the model used; the outcome. This distinguishes a retrieval miss from a reasoning miss — different fixes entirely — and is what feeds D160's queue. |
| **D167** | **Trend is reported per category, never only in aggregate.** Aggregate deflection rising can conceal a category getting worse. The Q1 ticket-category export is the measurement baseline as well as the scoping input. |
| **D167a** | **KB-specific metrics for the admin:** articles by lifecycle state, retrieval hit rate, articles never retrieved (deletion candidates), articles retrieved often but followed by escalation (repair candidates), and time-to-publish on queue items. |
| **D168** | **D83 is load-bearing and must not be dropped as UI polish.** The agent must explicitly ask "did that fix it?" at session end. Without that turn there is no `resolved` category and the entire deflection metric does not exist. It is a client behaviour requirement generated by an analytics decision, which is exactly the kind of thing that gets cut. |

---

## 7. Client UI

D120 stands: **Chat (home), My Tickets, Notices, Status.** Two badges are the whole notification UI.
The principle — the menu is for state you check, the conversation is for problems you solve — is what
keeps it four items instead of nine.

Three additions from this work:

**No KB browser for end users.** A search box invites keyword-guessing, which is the interaction
hybrid retrieval exists to remove. The user describes the problem in their own words; retrieval is
the agent's job. Adding a browsable KB would be building the self-service portal this product exists
to replace.

**Sources are shown, not hidden.** When an answer comes from an article, name it and let the user
open it. This is trust-building, it is how users learn the KB exists, and under H5 it must be
attributed chrome rather than the avatar's own voice.

**"That didn't work" is a first-class button, not a phrasing the user has to find.** It is the
signal that populates D160's repair queue, and the same turn that captures D168's confirmation.

`04-TEAM-REVIEW` Q33 asks how users would react to a talking avatar and invites pessimism; §9 A4
notes the avatar may be the first thing users disable. **The disable rate is already planned as a
measured input.** Nothing in this document depends on the avatar.

---

## 8. Corrections to earlier claims

- **"KB authoring is a phase-one gap" — withdrawn.** `04-TEAM-REVIEW` §7 designs it and Q36–Q39
  test it. I asserted a gap in a document I had not read.
- **"The Postgres you already have" — corrected.** Nothing is provisioned; no hub code exists.
  Postgres is committed to in three places (§5's dependency rule, D133's schema, D59a's
  customer-hosted requirement), which is what makes pgvector an extension rather than a dependency.
- **"Replace offshore L1" — corrected.** `04-TEAM-REVIEW` §9 A7 records that the team deliberately
  backed off *"replaces your service desk"* in favour of *"reduces first-line volume."* I have used
  the stronger framing throughout this project's sessions. The weaker claim is the current position
  and is the honest one.

---

## 9. Verification register

**Unverified — external research was not possible in this session:**

- All of §3. KCS's actual article structure, lifecycle state names, and any claim about its
  effectiveness. **`I do not have a verified source for this.`**
- Cross-encoder reranker options, model sizes, and CPU viability on Fargate-class hardware (D158).
  Review A1 also lists this as unretrieved.
- RRF's `k ≈ 60` convention — widely used as I recall it, source unconfirmed.
- pgvector HNSW memory behaviour against `db.t4g.micro`'s 1 GB (D159). Review A1 retrieved the
  `maintenance_work_mem` formula; the runtime residency claim here is reasoning, not measurement.
- ONNX Runtime support for the candidate embedders on ARM/Graviton — **the one item that could
  change the OPEN-7 recommendation outright.**

**Open questions this document does not answer:**

- **OPEN-7** — the embedder. Decidable this week from review A1's shortlist. Deciding constraint:
  one model must serve both managed and customer-hosted hubs, or a customer can never migrate between
  modes without a full re-embed.
- **Q35** — multilingual. If yes, `arctic-embed-m-v2.0` moves ahead of `nomic-embed-text-v1.5`.
- **Q34** — accessibility conformance. B8 flagged accessibility as unscheduled; Q34 asks what
  procurement requires. Both still open.
- **Q38** — the honest weekly maintenance budget, which is the number D153 has to fit inside.

**Nothing in this document is measured.** The model bake-off remains the only measurement in the
project.
