# Matic Desk — Decision Register

**Version:** 2.0 — the single register. **This file owns the numbering.**
**Date:** 2026-09-03
**Covers:** D1–D150, invariants H1–H6, conflicts C1–C12 and X-1–X-7, reviewer tensions R-1–R-14, open items OPEN-1 to OPEN-7, values left unset, verification register.
**Location:** `docs/decisions/DECISION-REGISTER.md` at the repo root, beside `client/` and `server/`. Every handover and every review prompt references this file **by relative path**, never by name alone (D150).

**Supersedes** (verbatim copies kept in `sources/` for provenance; they carry the OLD numbering and must not be cited):

| Source | Old numbering | Here as |
|---|---|---|
| `sources/2026-09-02-matic-desk-decision-register-consolidated.md` (itself consolidating `...D35-D46...` and `...D53-D67...`) | D35–D83 | **D42–D90** (+7 to every ID, including cross-references) |
| `sources/2026-09-02-decisions-D91-D124-updates-notifications-kb-sync.md` | D91–D129 | **D91–D129** as written |
| `sources/2026-09-02-fable-design-review.md` (independent review, 2026-09-02/03) | proposals, unnumbered | **D130–D150**, X-1–X-7, R-1–R-14, OPEN-5–OPEN-7 |

---

## 0. Provenance, numbering and gaps

**D1–D41 are not in this file.** They live in `ASK-IT-questionnaire.xlsx`, which was never downloaded: it exists only as a chat artifact in the conversation *3D avatar with Amazon Bedrock architecture*. Section 1 below reserves the range and records what is known about it. Reconstructing D1–D41 into this file is the highest-value housekeeping task remaining, because H1–H3e are defined there and several decisions below reference that range.

**The +7 renumbering has been applied, once, here.** The two earlier decision files and the consolidated register numbered from D35 and collided with D35–D41 in the workbook. Per the D91–D124 document's §0, every ID in the consolidated register — headings, table cells and cross-references — has been shifted by +7 in this file. Nothing outside this file should be renumbered again; cite this file.

**D130–D150 were assigned in this file on 2026-09-03.** They are the decisions the independent design review (`sources/2026-09-02-fable-design-review.md`) proposed or forced. The review itself did not number them. Two anchors were fixed by the founder's task list before the range was filled: **D130** is the consent-surface finding (review §1.1) and **D139** is the C9 documentation correction. The remaining nineteen were ordered by the review's own priority. **Every D130–D150 entry is marked with a status**; "proposed" means the founder has not ratified it, and the review's argument is cited so it can be rejected on its merits.

**Verification status.** Every vendor claim in D42–D129 was written without web access and carries `[VERIFY]`. The 2026-09-02 review researched most of them against primary sources; §10 maps each item to its answer. Where a claim below still says `[VERIFY]`, it is still unverified.

**No endpoint performance number has been measured.** Two measurements now exist in the project: the model bake-off (one machine, 40 hand-written cases) and the prompt-prefix token count (D140). Everything else is a target.

**All §2 constraints in the hub handover are single-source** from one design-partner meeting.

---

## 1. D1–D41 — reserved (workbook, not on disk)

| Range | Where | What is known |
|---|---|---|
| **D1–D41** | `ASK-IT-questionnaire.xlsx`, tab *Hub scope* and others; chat artifact only | The original register: invariants H1–H3e as first written, verified AWS pricing at the time, the model matrix, customer questions (question 18 is data residency). Referenced by `PROJECT_START_HERE.md` §5 and by the hub spec. |

Nothing in this range may be reassigned. If the workbook is recovered, its rows go here verbatim; if it is not, reconstruct from the hub spec (`2026-09-02-hub-server-side-spec-handover.md`) and the chat, and mark each row *reconstructed*.

---

## 2. Invariants

| ID | Rule | Status | Notes |
|---|---|---|---|
| **H1** | The playbook signing key never lives on the hub | Locked (D1–D41) | Review B1/H1: the rule must also cover *authority to cause a signature* — a hub that can drive a signing service is equivalent to a hub with the key (see C3, D134). |
| **H2** | The hub distributes policy; the endpoint enforces it | Locked (D1–D41) | Direction added by H4. |
| **H3** | No cloud credentials on the endpoint in joined mode (standalone is a bounded exception capped at R1) | Locked (D1–D41) | Device key is broker-side (D64), which is what makes H3 hold for the hub credential. |
| **H3b** | Playbook parameters are schema-constrained, never freeform | Locked | Review: the escalation payload is freeform model text that reaches a privileged human via the ticket path; H3b's scope is the executor. Recorded, not changed. |
| **H3c** | `toolConfig` is a schema-enforcement device, never an executor binding | Locked | Review: `whenNotToUse` is catalog prose fed to the model — the catalog review checklist must include "read the model-facing prose as a prompt". |
| **H3d** | Playbooks are typed primitives, never scripts | Locked | Review: tier must become a property of the playbook, not only of each primitive (three R1 steps can exceed one R2). |
| **H3e** | The model never authors the text a user consents to (the endpoint owns consent wording) | Locked | **Holds and is insufficient**: nothing says which *process* displays the text. See D130 — demonstrated 2026-09-03. |
| **H4** | Hub-supplied policy may only **narrow** endpoint capability, never widen it. Maximum risk tier and primitive allowlist are pinned at enrollment or carried in signed content. | **Proposed — not ratified** | Ratify with the amendments in D134: tier labels and consent text are part of the signed floor; the vendor catalog is the floor. Until ratified, C6 stands. |
| **H5** | Hub-supplied text that reaches the user is inert and attributed. Plain text only — no links, no HTML, no actions. Rendered in chrome visually distinct from the agent's own voice, attributed to IT, never spoken by the avatar as its own words. | **Proposed** | Second clause needed (D136): hub text entering the *model's* context is wrapped as data and never enters the system prompt. Shipped code speaks the escalation summary in the avatar's voice — a UX change H5 forces (X-5). |
| **H6** | Signed content carries a freshness bound (not-valid-after or minimum-acceptable-version) so an endpoint can detect staleness the hub never advertises. | **Proposed** | Detects but does not decide (D135): on expiry drop to the vendor floor catalog — never refuse (fleet outage) or merely warn (nothing prevented). Only not-valid-after can detect silence; a version floor cannot. |

**Why H4.** H1 stops a compromised hub signing new playbooks. H2 does not stop a compromised hub *widening the approved subset or raising the tier ceiling* using only correctly-signed content. H2 as worded is satisfied by an endpoint faithfully enforcing a policy telling it to do more. The invariant needs the *direction* stated.

**Why H5.** Announcements are hub-supplied text rendered inside a trusted taskbar agent — content, not policy, so H2 and H4 do not reach it. A compromised hub could push *"IT needs you to re-enter your password here"* to every endpoint without violating any invariant. The same gap exists in shipped code: escalations are not re-validated by the broker and the transcript speaks the owner aloud. H5 is H3e one layer out.

**Why H6.** A compromised or failing hub can harm by **omission** — never advertising a new version. Because H1 keeps the signing key off the hub, the hub cannot forge a fresher bound, so the endpoint can detect the silence.

**What the invariants do not cover (review B8, unchanged).** No threat model names the adversaries each invariant stops (OPEN-5). B1 found its gaps by writing the adversaries down.

---
## 3. Decisions D42–D90 (consolidated register of 2026-09-02, every ID +7)

Text as written on 2026-09-02, with IDs renumbered. Vendor claims carry `[VERIFY]`; §10.1 gives the answer the review found for each. Where a later decision amends a row, the amending ID is noted in §5.


### 3.1 Knowledge base

| ID | Decision |
|---|---|
| **D42** | Hub connection grants KB access for answering before escalation. KB answering is a first-class deflection capability, not a secondary feature. Read-only, needs no privileged primitive, covers ticket classes the four Win32 primitives cannot reach. |
| **D43** | **Customer KB is never stored at rest on the endpoint.** Retrieval is hub-side. Reasons: query embedding needs the network anyway (D44); articles carry read criteria requiring per-user entitlement at query time; withdrawn articles must stop being served immediately, and sync protocols handle deletions badly. |
| **D44** | Query embedding requires a network call. **There is no offline dense retrieval path.** Titan Text Embeddings V2 is Bedrock-hosted `[VERIFY]`; dense retrieval requires query and corpus embedded by the same model, so a local substitute returns noise, not degraded results. Consequence of the existing embedding decision, not a new choice. |
| **D45** | **Generic KB ships inside the signed catalog bundle.** Vendor-authored, no entitlement rules, no customer data — safe at rest. Reuses an existing signed, versioned distribution channel; no new signing story; H1 unchanged. |
| **D46** | The generic bundle is pushed proactively, not fetched lazily. The moment it is needed is the moment the hub is unreachable. |
| **D47** | **Offline capability = tier-0 routing + lexical search over the generic bundle. No model, no customer content.** Converges with what §7 already specifies for standalone mode. |

**Rejected and recorded dead:** hub embeds query, endpoint searches a local index. Needs the network
anyway, so delivers no offline capability while still placing the corpus on disk with the
entitlement and retraction problems intact.

### 3.2 Connectivity

| ID | Decision |
|---|---|
| **D48** | **No user-facing mode toggle.** Mode is machine state, broker-owned, written at enrollment, changed only by authenticated enroll/unenroll. UI displays mode and cannot set it. A user-operable toggle is a security downgrade triggered by a button press. It also has nothing to toggle *to* — H3 means a joined endpoint holds no local credential. |
| **D48a** | The unenroll path is security-relevant and must be authenticated, or the downgrade is relocated rather than closed. |
| **D49** | **Three connectivity states:** joined-and-reachable, joined-and-unreachable, standalone. Surfaced distinctly — a user shown a generic "offline" for both will escalate about the wrong thing. |
| **D50** | Connectivity is determined by an **authenticated heartbeat** that also carries policy and catalog version. Not a reachability check: captive portals return 200 to anything, and a TCP connect proves nothing about credential validity. Collapses three signals that can otherwise disagree into one. |
| **D51** | Hysteresis: enter offline after N consecutive failures, leave only on a successful authenticated call. Mid-session capability loss is stated to the user rather than silently degrading. |

### 3.3 Hub inference

| ID | Decision |
|---|---|
| **D52** | In joined mode the endpoint uses the hub inference proxy, with device identity as the credential. |
| **D53** | **Single combined call.** Endpoint sends conversation state and user turn; hub retrieves, assembles, calls the model, returns a **structured proposal**. Retrieved chunks never leave the hub. The two-call alternative moves customer KB content hub → endpoint → hub and lands it in endpoint memory. |
| **D53a** | **Redaction stays on the endpoint**, before the hub call. §9 requires redaction before egress regardless of destination; endpoint → hub is egress. Hub-side redaction means the text already left the machine and the rule is decorative. |
| **D53b** | **Tier-0 routing stays on the endpoint** with no hub dependency. Preserves the network-outage case — where the agent is most valuable and the hub least reachable. |
| **D53c** | Haiku→Sonnet escalation policy and per-tenant metering/caps move to the hub. Escalation is a cost decision; `modelId` is already tenant config. Neither is possible in standalone. |

**Boundary clarification.** D53 does not violate "the hub must not own the conversation loop"
*provided* the invariant reads as **model proposes / endpoint validates / broker executes**. The
endpoint still validates every proposal against the signed catalog, still owns consent wording
(H3e), still owns execution. Where prompt concatenation happens is not a security boundary. See C1.

### 3.4 User schema

| ID | Decision |
|---|---|
| **D54** | Introduce a **user identity** entity distinct from device identity. D43 entitlement and D68 ticket history both require it. |
| **D55** | Model on **SCIM 2.0 core + enterprise extension**, not ServiceNow `sys_user`. The `sys_user` field set maps near one-to-one onto SCIM `[VERIFY]` — not coincidence, since enterprises typically drive `sys_user` from AD/Entra, making it a derived copy rather than a source of truth. SCIM buys ServiceNow compatibility plus Okta, Entra and Jira. Same reasoning as §12's refusal to depend on a vendor's tool-calling dialect. |
| **D56** | **`sys_id` is not the primary key** — it is one entry in an external-correlation map alongside Jira account ID, Entra object ID. §2 says most customers lack ServiceNow; a `sys_id` PK gives them all a null key. |
| **D57** | Retain `manager` explicitly. Required for approval routing on R2+ actions and for access/license request categories — the ticket classes the four primitives cannot touch. |
| **D58** | The user table is PII (email, employee number, manager chain, location) and is in scope for §9 retention and residency. Schema-per-tenant makes per-customer deletion tractable. |

### 3.5 Customer-hosted deployment

| ID | Decision |
|---|---|
| **D59** | Customer-local hub deployment remains supported; §5's dependency discipline is what preserves it. |
| **D59a** | **pgvector is a stated deployment requirement** on customer-supplied Postgres. D43 puts the vector index on the hub and §5 permits only Postgres and object storage. A version-and-extension constraint on hardware we do not control — surfaces on install day if undocumented. |
| **D59b** | Infrastructure cost falls in a local deployment; **inference cost does not.** The only genuinely low-cost configuration is customer-hosted hub *plus* customer-hosted OpenAI-compatible endpoint (§12 tier 3) — which is best-effort and excluded from deflection commitments. So the cheapest, most privacy-attractive configuration is the one we cannot make quality promises about. Recorded as a commercial position, not a defect. |
| **D59c** | A **minimum telemetry set is a condition of support** for customer-hosted deployments. Otherwise: no deflection measurement, no debugging, and canary rings mean nothing across a fleet we do not operate. Retrofitting onto an installed base is unpleasant. |

### 3.6 Session model

*(Recovered — these were discussed and assigned D60–D65 in conversation, then that range was reused
for device auth. Renumbered here. All ServiceNow claims unverified.)*

| ID | Decision |
|---|---|
| **D75** | A **session is a first-class entity**, distinct from any ticket. A session may produce zero, one, or several tickets. Modelled as session ↔ task with a many-to-many link. |
| **D76** | **Adopt the shape, not the schema.** ServiceNow's Interaction Management is believed to model exactly this — `interaction` plus `interaction_related_record` `[VERIFY]`. Field names remain ours; the ServiceNow adapter maps onto their tables, the Jira adapter maps the task half and keeps sessions entirely our side. **Note the contrast with D55:** there is no SCIM for tickets — Jira, ServiceNow and Zendesk disagree and no interchange standard has won — so the argument against modelling on a vendor schema applies to users but not to tickets. Borrowing the abstraction is still correct; borrowing the schema is not. |
| **D77** | Model the **base `task` fields**, not incident-specific ones `[VERIFY]`. Their inheritance model indicates which fields are universal; category, subcategory and `caller_id` are incident-flavoured and belong in the adapter. |
| **D78** | **`opened_by` is not `caller_id`** `[VERIFY]`. Filing on a user's behalf means `opened_by` is the integration account and `caller_id` is the affected user. Getting this wrong breaks their reporting, assignment rules, and any SLA keyed to the caller. Second place where D54/D55 user identity becomes load-bearing — we must resolve our user to their user reference. |
| **D79** | `assignment_group` is tenant configuration, never inferred. |
| **D79a** | **"ServiceNow adapter" is at minimum two record types.** Access, license and software-install requests are catalog requests with a different workflow and approval chain `[VERIFY: sc_req_item under sc_request]`, not incidents. §14 item 5 is scoped as one adapter and is not. |
| **D79b** | Session records are **ours by default**; mirroring sessions into the customer's ITSM is a per-tenant opt-in that changes the consent wording. Mirroring means every conversation leaves the endpoint, not just escalated ones — a categorically different privacy posture from "we file a ticket when we cannot fix it," and it collides with §8's instruction to give egress its own risk tier and consent wording. |
| **D79c** | §8's correlation requirement (audit carries ticket ID, ticket carries audit IDs) **is the session↔task relationship drawn by hand.** Adopting D75 replaces a bespoke correlation scheme with a modelled relationship. |

### 3.7 Device authentication

The space splits into two questions usually collapsed: **what credential the device holds**, and
**how it is presented on the wire**. Deciding "mTLS" answers only the second and silently commits to
operating a CA.

| ID | Decision |
|---|---|
| **D60** | Device identity is an **asymmetric keypair generated at enrollment by the broker**, TPM-backed and non-exportable where TPM 2.0 is present. Public key binds to a hub device record. Bearer tokens as steady-state identity are excluded for the reason H3 exists. |
| **D61** | Authentication is a **signed assertion exchanged for a short-lived access token**, not per-request signing. D53 makes every turn a hub call; TPM signing per-request is too slow `[VERIFY: order of tens of ms]`. Short expiry delivers revocation without CRL machinery. Pattern is OAuth 2.0 client credentials with private-key JWT client auth `[VERIFY: RFC 7523]`. |
| **D62** | **mTLS is rejected.** Three reasons, any one sufficient: (a) corporate TLS inspection terminates the connection and cannot present a client certificate, requiring a per-customer exemption negotiated at every deployment `[VERIFY: prevalence — ask design partner directly]`; (b) customer-hosted hubs would need our trust store or their own CA; (c) §5's "every extra daemon is a pager" applies harder to PKI than to Redis — certificate expiry is a fleet-wide outage with a date on it. |
| **D62a** | **Consequence:** ALB mutual-TLS is removed from the verification register. Device auth is decoupled from AWS ingress and behaves identically hosted or self-hosted. |
| **D63** | **No-TPM fallback:** software key under DPAPI machine scope in broker-owned ProgramData. The hub records key-protection level as device state, because weak-path devices may be capped at a lower risk tier. |
| **D64** | The device key lives **broker-side**. The agent requests tokens over the existing named pipe and never sees the key. Pipe is ACL'd and the calling binary's signature checked. Blast radius is bounded — a token grants what the agent already has — but the check is cheap. |
| **D65** | Same abstraction maps to macOS Secure Enclave. v1 Windows work is not throwaway. |

### 3.8 Enrollment

| ID | Decision |
|---|---|
| **D66** | **An enrollment secret buys a pending record, not fleet membership.** A tenant-wide secret in the MSI is the credential most likely to leak; under this model a leak costs a spam queue, not a fleet breach. |
| **D67** | **Enrollment is the mechanism for standalone → joined conversion** (§7 requirement 1) and writes the broker-owned mode state (D48). Unenrollment is the only path back and is authenticated. |
| **D67a** | TPM attestation at enrollment deferred to v2 hardening. |
| **D80** | **Auto-approve is the default, with a per-tenant toggle to IT-approval-only.** Auto-approve still writes the pending record and then approves it — one code path, policy flag on the end. The queue becomes a permanent enrollment audit log rather than a mode. |
| **D81** | **Under D80 the enrollment secret is the security boundary**, so it must carry that weight: per-tenant, rotatable, time-boxed. An enrollment secret with no expiry is a permanent skeleton key. |
| **D82** | **The secret is not baked into the MSI.** Delivered as install-time configuration, so the installer binary is not itself a credential. Installers get emailed, dropped on shares, and posted to vendor portals. |
| **D83** | **Rate limiting and anomaly detection on the enrollment endpoint**, with automatic fallback to queued approval on anomaly. This is the safety net that costs IT nothing when nothing is wrong. |
| **D83a** | **Bulk revocation by enrollment batch** in the console. Under D61 revocation is a row delete and tokens expire on their own — make sure the console can act at batch granularity. |

### 3.9 Ticket history

| ID | Decision |
|---|---|
| **D68** | **Own-history retrieval is a live read-through query**, filtered to the requesting user, against the ITSM (integrated) or internal store (self-contained). No ingestion, no embedding, no corpus. Ticket data is high-volume, constantly changing, customer-owned and PII-dense; replicating it would put PII in a vector index and pull §9 retention across the whole corpus. Depends on OPEN-1. |
| **D69** | **Status readback uses customer-visible comments only. Internal work notes are never surfaced to the end user.** `[VERIFY: believed comments vs work_notes]`. Whatever the field names, the distinction is real and the default must be visible-only. Reading internal engineer commentary aloud to the user it concerns is a serious and easily-shipped failure. |
| **D70** | **Cross-user historical similarity is deferred**, pending entitlement research. Requires a searchable corpus of all tickets — embedding PII, replicating customer data, and an entitlement model over records that may include HR cases, security incidents, terminations and executive escalations. A project with a privacy review attached, not a feature. |
| **D70a** | If taken up later, the likely safe form is **retrieval over resolved-and-sanitised tickets promoted into the KB**, not raw ticket records. Converts an entitlement problem into a curation problem, which draft-and-approve already handles. |

**Why the split matters.** D68 is days of work and materially improves diagnosis and status
answering. D70 sounds similar and is not. Committing to both at once puts the cheap, high-value
feature behind the expensive, high-risk one.

### 3.10 System of record

| ID | Decision |
|---|---|
| **D84** | **The hub is the system of record for tickets unless an ITSM integration exists.** Where one exists, the ITSM is SoR and the hub reads through. |
| **D85** | **The SoR flip must be supported** — a customer running self-contained for months then connecting ServiceNow. Must not lose history, must not require reinstall or reset. Structurally the same problem as §7's standalone → joined conversion and deserves the same treatment. Currently undefined; the first customer to do it will be an escalation. Open sub-questions: migrate, orphan, or dual-read; and what happens to reports spanning the flip. |
| **D86** | **Self-contained mode requires outbound email.** With the hub as SoR there is no assignment group, no on-call rotation, no L2 queue — those came free with the ITSM. Needed: notification to an IT alias, status updates to the requester, probably inbound reply handling. **This is a third dependency** and §5's "exactly two stateful dependencies" framing needs updating rather than quietly breaking. Deliverability, bounce handling and inbound parsing are real work, and it must also exist in customer-hosted deployments. |
| **D86a** | Binary SoR is likely too coarse for real orgs (ITSM for one department; incidents routed to ITSM while low-value requests stay local). **Not built in v1**, but the schema must not foreclose it. |

### 3.11 Dashboard, reporting and deflection

| ID | Decision |
|---|---|
| **D71** | **The dashboard's differentiated content is session and deflection analytics, not ticket analytics.** Customers with an ITSM already have ticket reporting and it is a large part of what they pay for; ours will be worse. What no other tool can produce is sessions that did not become tickets. |
| **D71a** | This is reinforced by D84: session analytics are **uniform across both deployments** because that data is always ours, whereas ticket analytics are degraded (read-through, rate-limited, subject to their field customizations) exactly where the customer already has better reporting. Build the uniform half first. |
| **D72** | Dimensions: by user, by category, by time, by outcome, by risk tier of actions taken. "By outcome" and "by risk tier" are ours alone and are what an IT lead wants during a rollout. |
| **D87** | **Two views: IT-lead operational and buyer/exec ROI.** |
| **D88** | The exec view is a **renewal artifact** — exportable and schedulable (monthly PDF or email), because executives do not log into vendor tools. |
| **D89** | **Three session outcomes: resolved (user explicitly confirmed), escalated (ticket created), unresolved (everything else, including abandonment). Only confirmed-resolved counts toward deflection.** A session where the user asked, got an answer and closed the window is indistinguishable in our data from one where they gave up and walked to IT. Counting abandonment as deflection produces a bigger number and loses the room the first time a competent IT lead challenges it. Every exec-view number drills down to underlying sessions. |
| **D90** | **The agent must request end-of-session confirmation.** This is a client behaviour requirement created by D89 and is not currently written down anywhere. |

**Defining deflection is a commercial decision, not a metrics one.** D89 produces a smaller headline
figure that survives scrutiny, which is worth more than a large one that does not.

### 3.12 Internal ticket store

| ID | Decision |
|---|---|
| **D73** | **Promoted from §4 priority 3 to core.** It is the system of record for every customer without an ITSM, and §2 states that is most of them. **Resolves C4.** |

**Scope warning.** §5 rejected Zammad and Chatwoot as dependencies for sound reasons. Promoting the
internal store does not remove the requirements those products exist to satisfy — it relocates them
into our codebase where we also own the bugs. A store an IT lead will accept needs assignment and
reassignment, SLA timers on business calendars, queues and routing, email ingest with threaded
reply, attachments, audit history, search, saved views, bulk operations, and a permissions model.

**Recommendation:** define an explicit v1 subset in writing and defend it, rather than discovering
the list feature by feature. Plausible pilot subset: create, assign, state machine, comments split
by visibility (D69), attachments, search, dashboard. Everything else is a deliberate later decision.

### 3.13 Terminology

| ID | Decision |
|---|---|
| **D74** | **"Standalone" is overloaded and must be split in all documents.** §7 uses it for the endpoint deployment mode (local API key, capped R1, no hub). Later usage means the product operating without ITSM integration. These are independent axes — a fully joined fleet with no ServiceNow is hub-connected and ITSM-less. **Proposed terms: endpoint mode = standalone / joined; ITSM posture = integrated / self-contained.** Used consistently throughout this document. |


---

## 4. Decisions D91–D129 (2026-09-02, numbered as written)

Text as written. Cross-references of the form *D53 (was D46)* are the author's own +7 annotations and agree with §3. Invariants H5 and H6, first stated in this document, are in §2 above.

### 4.1 Bedrock removal

**Scope confirmed: Amazon Bedrock the service is out. Cloud inference is not.** The Anthropic API
direct remains available. Most of hub spec §11 becomes a provider swap rather than a redesign.

| ID | Decision |
|---|---|
| **D91** | **Amazon Bedrock is removed as the managed inference path.** Cloud inference continues via the Anthropic API directly. |
| **D92** | **Consequence — the model stack loses two of three members.** Nova Lite (vendor-diversity fallback) and the Bedrock routing for Haiku/Sonnet go with it. Haiku 4.5 and Sonnet 5 remain reachable directly. D53c (was D46c) — Haiku→Sonnet escalation on the hub — survives; only its transport changes. |
| **D93** | **Consequence — region choice is now free.** us-east-1 was selected because it was the only US commercial region with In-Region support across both the Anthropic and Nova families. That constraint is gone. **Region should now follow data residency** (OPEN-3), not model availability. Partly moots C5. |
| **D94** | **Consequence — hub spec §8 item 4 resolves itself.** §12's OpenAI-compatible adapter and §11's managed inference were described as two products. One of them no longer exists. §12 is now the only self-hosted path and the Anthropic API the only managed one. |
| **D95** | **Consequence — the largest unverified item in the project is retired.** Bedrock per-token pricing has been the missing denominator for the whole commercial case. It comes out of the verification register and out of the Fable prompt's Part A3. **A cost model is still required** — Anthropic API pricing now replaces it and is itself unverified. |

#### D96 — the embedding model is now undecided, and it is the most expensive open item

**Titan Text Embeddings V2 was Bedrock.** Hub spec §11 calls the embedding model the least
reversible decision in the system, and D42/D43/D47 (was D35/D36/D40) all rest on it.

This is **not** merely a substitution. D43 (was D37) recorded that query embedding requires a network
call *because* Titan is hosted-only, and D47 (was D40) set the offline floor at "no model, no
customer content" as a consequence. **A self-hostable embedder changes both.** A customer-hosted hub
could embed locally, and offline dense retrieval stops being impossible.

D44 (was D36) — customer KB never at rest on the endpoint — **survives regardless**, because its
other two arguments are independent of the embedder: entitlement must be enforced per-user at query
time, and withdrawn articles must stop being served immediately.

**Recorded as the top open item in the hub design.** Do not let it be settled by whichever library
gets imported first.

#### D97 — model selection is now a cost-and-latency decision, not a safety one

`BAKEOFF-2026-09-02.md` §2b: two catalog preconditions and a `whenNotToUse` tool-description field
took **R2 false actions to zero on all five models**, and raised accuracy on every one. That safety
improvement is **model-independent** and shipped as data.

| | correct | reaches user | s/correct |
|---|---|---|---|
| `claude-haiku-4-5` | **36/40** | 0 | 2.0 |
| `mistral-small:24b` | 35/40 | 0 | 1.7 |

**Haiku gained the most from hardening (32 → 36) and now leads on accuracy** while matching mistral
at zero false actions reaching a user. The gap is 0.3 s per correct proposal.

**Documentation conflict (C9).** BAKEOFF §1 still reads *"It beats the cloud model it would replace,
not merely undercuts it."* That was true of the pre-hardening table in the same file. After §2b it is
not. **§1 is the part that will be quoted.** Fix before it reaches a sales conversation.

This also corrects D59b (was D52b), which recorded the customer-hosted-model tier as quality-limited.
The real constraint is hardware: mistral-small needs 16 GB of VRAM, which most SMBs do not have.

---

### 4.2 Update distribution

Three channels with different privilege, cadence and risk. **Treating them as one update system is
the error**, because the third is dangerous and the first carries nearly all the value.

| Channel | Changes | Privilege | Sensitive to |
|---|---|---|---|
| Content — catalog, generic KB, policy | Often | None | Nothing |
| Agent binary — UI, avatar, model client, router | Sometimes | User | Restart |
| Broker binary — privileged Windows Service | Rarely | Admin | EDR, change control |

| ID | Decision |
|---|---|
| **D98** | **Design rule: anything that can live in signed content does. The broker binary stays as small and stable as possible.** The bake-off is the evidence — the entire R2-to-zero safety improvement shipped as two catalog preconditions and a tool-description field. No binary, no elevation, no EDR re-approval, no restart. The catalog is already the trust root (H3d); making it the update root follows. |
| **D99** | **The broker does not self-update.** A privileged Windows Service that downloads and executes code has a larger blast radius than every playbook combined, and is precisely the behaviour EDR exists to detect. It contradicts the design's own shape — typed primitives, no scripts, nothing freeform. |
| **D100** | **Broker updates ship as an MSI deployed through the customer's existing tooling.** Users have no local admin, so there is no other honest answer. This also routes broker changes through the customer's change process — the same process that grants EDR allowlisting. |
| **D101** | **The agent may self-update.** Unprivileged, user-scoped, changes often. Maps cleanly onto the existing two-process split. |
| **D102** | **The named pipe becomes a version boundary and requires protocol version negotiation.** Agent 1.4 against broker 1.2 must either work or refuse cleanly. Not currently designed anywhere, and it is what makes independent update cadences possible. |
| **D103** | **Content updates ride the existing mechanism** — signed bundle, version in the heartbeat, pushed proactively (D45/D46, was D38/D39). No new channel. |
| **D104** | **The hub advertises binary availability; it does not deliver binaries.** Endpoints must not fetch binaries from our origin — that breaks the customer-hosted isolation story and adds a firewall exception to every deployment. |
| **D105** | **User-facing update UI is status only**, in the Status destination (D116): current version, up-to-date or update-available, last checked. "Check now" forces a heartbeat and nothing more. **If an update requires IT, say so plainly** — never offer a button that fails on a machine where the user has no admin rights. |
| **D106** | **Heartbeat intervals are jittered.** A fleet checking on a fixed interval synchronises into a thundering herd. |
| **D107** | **D59c (was D52c) minimum telemetry must include hub version**, or a security advisory cannot be matched to exposed customer-hosted deployments. |

**Rollback asymmetry, recorded.** Rolling back a signed versioned catalog is trivial. Rolling back a
privileged service is not. A further argument for D98.

**Deferred:** SMB self-contained customers with no deployment tooling will eventually need a broker
updater. It is a second privileged surface with its own review. **Not v1**, and recorded so it is not
added casually.

---

### 4.3 Knowledge-base changes

**No, a KB edit does not require an app update — and under D44 it requires no distribution at all.**

| ID | Decision |
|---|---|
| **D108** | **Customer KB edits need no sync mechanism.** D44 keeps the customer corpus hub-side and live-retrieved, so an edited article is visible on the next query. No bundle, no signature, no version, no push. This is D44's payoff and it should be stated as such. |
| **D109** | **Generic KB edits ride the signed bundle** (D45) — vendor-authored, changes rarely, no customer edits. |
| **D110** | **The signed/unsigned line and the at-rest/live line are the same line.** Not a coincidence: content at rest on an endpoint must be signed because it is out of our sight; content fetched live over an authenticated channel need not be. |
| **D111** | **General rule: content that can cause an action must be signed. Content that can only inform need not be.** This is why KB edits are trivial and catalog edits are not — and why C3 (per-tenant signing versus H1) bites on playbooks but not on knowledge. |

#### D112 — the limitation this creates, stated plainly

**Customer KB content cannot be available offline.** Offline availability requires being at rest,
which requires signing (D110), which requires the vendor signing key (H1) — which is C3. So under the
current model, offline mode reaches generic articles only, never the customer's own.

A per-tenant customer-held signing key would resolve it and introduces key management at the
customer. **Not v1.** Recorded because customers will ask, and the honest answer is a design
consequence rather than an oversight.

#### D113 — "no distribution" is not "no work"

A KB edit still requires the hub to **re-embed and update the index**: change detection, incremental
embedding of the changed article only, and immediate vector removal on delete. That last one is what
makes D44's retraction argument true rather than aspirational. Full reindexing on every edit is not
acceptable and should not be how this gets built.

---

### 4.4 Notifications, announcements and alerts

Three classes with different delivery, entitlement and interruption semantics.

| Class | Audience | Urgency | Delivery |
|---|---|---|---|
| Ticket update | One user, their own ticket | Low | Poll |
| Announcement | Broadcast or segment | Low | Poll |
| Alert — user-impacting incident | Broadcast or segment | High | Latency-sensitive |

| ID | Decision |
|---|---|
| **D114** | **All three ride the heartbeat. No persistent connection in v1.** The heartbeat (D50, was D43) already carries policy and catalog version; add a content-version vector so the endpoint fetches detail only when something changed, keeping the hot path small. A persistent connection brings ALB idle timeouts, per-task connection ceilings and reconnect storms for latency the product does not need. |
| **D115** | **Heartbeat interval is a capacity parameter, not a UX one.** 5,000 endpoints at 60 s is roughly 83 req/s of pure heartbeat against one Fargate task and a `db.t4g.micro`. Interval, fleet size and hub sizing must be decided together. |
| **D116** | **Audience targeting reuses the user schema** (D54–D57, was D47–D50): department, location, manager chain. Those fields move from useful to load-bearing. |
| **D117** | **Interruption policy: badge always; toast only above a severity threshold; never steal focus; alerts auto-expire.** A taskbar agent that pops up unbidden is a known uninstall risk on this project. |
| **D118** | **Alerts require a fourth session outcome: `suppressed`.** D89 (was D82) counts deflection as confirmed-resolved sessions. An alert that prevents a ticket produces **no session at all**, so the highest-leverage deflection in the product is invisible to the metric. Measured as a proxy: ticket volume in the alerted category during an active alert versus baseline. |
| **D119** | **Alerts are the cheapest deflection per engineer-week in the product** — no conversation, no model call, no tokens. **Build order:** after ticket filing (specced in `PHASE1-TICKETING.md`, owed to the honesty ledger), but ahead of cross-user similarity (D70, was D63) and ahead of ticket charts in the dashboard. They are not a large piece of work: once the heartbeat exists they are a content-version field and a rendering surface. |

**Honest limitation, to be stated in the design.** Alerts matter most during incidents, and network
incidents are exactly when the hub is unreachable. *"The VPN is down"* cannot be delivered to people
whose VPN is down.

---

### 4.5 Client menu

**Principle: the menu is for state you check; the conversation is for problems you solve.** No menu
item for anything the conversation does better.

| ID | Decision |
|---|---|
| **D120** | **Four destinations: Chat (home), My Tickets, Notices, Status.** Chat is the home surface. My Tickets carries list, status and visible comments (D68/D69, was D61/D62), badged on update. Notices carries announcements and alerts, newest first, badged on unread with alerts pinned. Status carries connection state (D49's three states, was D42), mode, version and update status (D105). |
| **D121** | **Everything else is reachable by asking** — KB search, session history, "what did you do to my machine." Two badges are the entire notification UI. |

---

### 4.6 Conflicts found against `PHASE1-TICKETING.md`

| ID | Conflict | Status |
|---|---|---|
| **C9** | BAKEOFF §1 vs §2b — see D97. | Open. Documentation fix. |
| **C10** | **PHASE1-TICKETING §3 proposes an egress tier `E1`** — "sends data off this machine" as a capability class distinct from R1/R2. **D53 (was D46) makes every conversational turn an outbound hub call.** Either D53 needs an explicit exemption or E1 means nothing. | **Resolved — D125–D129.** |
| **C11** | **PHASE1-TICKETING §4 records an existing policy D53 may break:** computer name and username are deliberately *not* sent to the model. Under D53 the hub assembles the prompt. That line must be preserved explicitly in the hub contract, not assumed. | Open. |
| **C12** | **PHASE1-TICKETING §5 lands on a user profile "read from the machine and confirmed by the user on first run."** Adequate for filing a ticket. **Not adequate for D44 KB entitlement or D68 ticket history**, where a self-asserted editable profile lets a user claim to be someone else. Same field, two trust requirements. | **Open. This is OPEN-1 with a concrete fork in it.** |

#### D122–D124 — screenshots

Absent from the earlier register entirely. `PHASE1-TICKETING.md` §4 is adopted unchanged.

| ID | Decision |
|---|---|
| **D122** | **Screenshot handling per PHASE1-TICKETING §4**, adopted as written: exact image shown full size before approval, user-chosen window or region never full desktop by default, opt-in per ticket and never remembered, nothing captured until asked, audit records hash and dimensions but never the image. |
| **D123** | **Open question created by D53:** under hub-side prompt assembly, does an attached screenshot ever reach the hub as part of conversation state? §4 does not address it because it predates D53. **Must be answered before either is built.** |
| **D124** | **The consent pattern is reused, not reinvented** (PHASE1-TICKETING §2): propose → validate → show exactly what will happen → single-use token bound to a hash of the draft → execute → audit. A draft altered after approval cannot ride the old token. |

---

### 4.7 C10 resolved — egress

**The conflict was a category error.** R0–R3 measure **local disruption** — what breaks on this
machine if an action goes wrong. `reset_adapter` is R2 because it drops every connection including a
remote session. That scale says nothing about data. Egress measures **what leaves**: `file_ticket` is
near-R0 locally, changing nothing on the machine, while being the highest-consequence capability in
the catalog for data.

PHASE1-TICKETING §3 senses this — *"not R1/R2, which describe local disruption"* — then places `E1`
alongside them as a fifth rung. **Egress is a second axis, not another tier.**

**And D53 does not create egress; it changes the destination.** Standalone mode already sends the
conversation and machine-state block to a cloud provider on every turn — that is how the shipping
demo works. Joined mode sends the same material to the customer's own hub instead, which is the
better posture for a security-conscious buyer. "Every turn is egress" was already true before D53
existed. The hub made an existing fact visible rather than introducing a new one.

The real question is therefore not *does data leave* — it always does — but **does data leave that
the user did not author and cannot see.**

| ID | Decision |
|---|---|
| **D125** | **No per-turn approval for conversational egress. Decided.** Typing a message and having it sent is the thing the user asked for; consent is implicit in the act. |
| **D126** | **`E1` is dropped as a tier. `egress` becomes a declarative catalog property** valued `none` / `hub` / `third-party`, per capability, orthogonal to R0–R3. It rides the signed catalog, inheriting the trust root, the signing, and the same precondition machinery that took R2 false actions to zero. New property, existing enforcement path. |
| **D127** | **Session-scoped disclosure for conversation.** One clear statement at session start and permanently in Status: *"What you type and your machine's network status go to your company's Matic Desk hub."* In standalone the string names the provider instead. |
| **D128** | **Per-action consent for assembled payloads** — anything containing data the user did not author in this session (machine diagnostics, transcript history, profile, screenshot). This is where PHASE1-TICKETING §6 step 3 belongs, and its wording *"Sends data off this machine"* stands. **The destination is shown, not just the fact** — "your company's hub" and "Anthropic" are materially different to a user and to a security reviewer, and mode determines which. |
| **D129** | **The broker mints and audits; the agent transmits; the hub verifies.** PHASE1-TICKETING §3 recommends extending the broker to file tickets. The instinct — one consent flow, one audit log — is right, but it puts an HTTP client, TLS configuration and destination handling inside the privileged service, which **collides with D98**. Instead: the broker validates the draft, mints a single-use consent token bound to the payload hash, and writes the audit record; the agent performs the send. **The broker never opens a socket.** The agent could in principle send something other than what was approved — closed by the hub rejecting any payload whose hash does not match the token. The hub becomes the integrity check at no cost, because the payload is going there anyway. Ticket filing is joined-only, so a verifier always exists. |

**Cost of being wrong.** If the two-axis model is wrong it errs permissive about conversational
egress — a customer whose security team objects to *any* conversation leaving the endpoint. That
customer's answer is a self-contained hub, which the architecture already supports. The failure mode
has a product answer, not a redesign.

**What would change this:** a design partner stating users must approve each turn. Worth asking
alongside the TLS-inspection question, though it is not how anyone uses a chat interface.


---

## 5. Decisions D130–D150 — from the independent design review (2026-09-02/03)

Source: `sources/2026-09-02-fable-design-review.md`. Section references (§1.1, A3, B4, C.3 X-2, …) are to that file. **Status key:** *done* — carried out and verifiable in the repo; *decided* — the review's finding is a fact, not a choice; *proposed* — needs the founder's ratification; the review's argument is cited so it can be rejected on the merits.

### 5.1 Endpoint trust boundary

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D130** | **The privileged half must be able to prove the user saw the text it acts on.** In Phase 1 the consent card is drawn by the unprivileged agent and the broker mints a token for whatever proposal arrives on the pipe. Rule: *the broker executes only what the user was shown.* Cheapest honest form: the broker renders the consent text (from the signed catalog's `plain/*`) and returns it with a nonce; the approval binds to the nonce; the broker refuses any approval whose nonce does not match what it issued; the audit record stores the broker-rendered text. Strong form: a broker-owned consent window in the user's session (as UAC and credential prompts do). **Phase 1 design item, not hardening.** | **Proposed; the gap is demonstrated.** `client/test/consent-surface.test.mjs` (2026-09-03) drives it end to end against a stub `NamedPipeBroker` in a separate process on a real named pipe: `flush_dns` displayed, `reset_adapter` sent, token minted, executed, audited as a consented success — every gate and every invariant holding. The same file carries the acceptance test as three expected failures; it exits 1 the day they pass, which is the signal to promote them. Write-up: `../../client/docs/CONSENT-SURFACE-2026-09-03.md`. | Review §1.1, B1/H3e scenario 2, C.7. D129's hub-verifies-the-hash trick solves display integrity for *egress* (a verifier exists) and cannot be reused for the four local actions (the broker is both the party that must be convinced and the party that acts). |
| **D131** | **The broker attests its posture.** The assertion the broker already signs with the device key (D61) carries **broker version, catalog hash, catalog-signature-verified flag, TPM present, key-protection level**. The hub gains a "minimum broker version" policy — narrowing, H4-legal — that disables capabilities on stale brokers instead of negotiating around them. The agent-sent heartbeat (D103) is not evidence of broker version; the agent can say anything. | Proposed | §1.2, B4, X-2. One field set, no new mechanism; it is what makes D107's telemetry and any canary ring real. |
| **D132** | **Access-token lifetime is a security parameter, not a tuning one.** Revocation latency equals it (D61 + D83a). Set it in the same decision as the heartbeat interval (D115). Sign once per session to mint a short-lived token, not per request; serialise TPM access. | Proposed (value still unset — §8) | X-3; A5 Q1b: TPM P50 ~200 ms / P95 ~600 ms means the exchange can run every few minutes at no cost. |
| **D133** | **Update model: one per-machine installer for both halves; the pipe carries a single protocol version and refuses a mismatch, logging the refusal to the hub.** The agent does not self-update in joined mode. The broker may be the updater: fetch the vendor-signed MSI from the origin the hub advertises (a customer-hosted hub may serve it from its own object store — no firewall exception, no contact with our origin, no hub signing anything), Authenticode-verify against a publisher pinned in the previous MSI, run `msiexec` as SYSTEM with major-upgrade semantics and `afterInstallInitialize` rollback. Customer-tooling deployment (D100) remains the first install and an opt-out for customers who insist, who accept divergence risk in writing. **Standalone mode gets the same updater**, otherwise standalone brokers never update (R-9). | **Proposed — amends D99, D101, D102, D104.** D99 is defensible for the design partner (Intune, quarterly change windows) and wrong as the product default. | B4, Part B addendum items 1 and the D99 engagement, R-9, A5 Q4. Every major endpoint agent updates itself as SYSTEM; Intune documents a flag precisely for self-updating apps; EDR allowlisting by certificate survives updates, which removes D100's allowlisting argument. |

### 5.2 Invariant amendments

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D134** | **H4 is ratified with two amendments, and C3 is decided rather than probable.** (a) The vendor-signed catalog is the floor: preconditions, blocklist, **tier labels and consent text** are part of it and a tenant delta cannot change them (relabelling `reset_adapter` R2→R1 through tenant policy is otherwise not forbidden by H4's words). (b) A tenant delta may add preconditions, remove capabilities and raise tiers, and may not do the inverse. Consequence stated for sales: **customers select and constrain vendor playbooks; they do not author them.** Customer-held signing keys (D112's idea) are the eventual answer for tenants who insist. | Proposed | C.0 item 2, C3, B1/H4. Also note narrowing can still harm: remove every R1 network remedy and the model's only lever is R2. |
| **D135** | **H6 decides as well as detects: on expiry the endpoint drops to the vendor floor catalog** (long validity, shipped in the MSI, signed offline). Never refuse (a hub outage becomes a fleet outage) and never merely warn (nothing is prevented). Use not-valid-after, not a version floor — the floor arrives inside the content the silent hub is not sending. Dropping to the floor is narrowing, so it is H4-legal. Requires the floor to be good enough to run on alone (D149). | Proposed | B1/H6, Part B addendum. Clock skew against corporate NTP is recorded, not solved. |
| **D136** | **H5 gains a second clause and forces one UX change.** Hub-supplied text (KB chunks, announcements, ticket updates) enters the model's context only inside a provenance wrapper the prompt treats as data, never as instruction, and never enters the system prompt — a mitigation, not a guarantee, and the design says so. In joined mode the escalation `summary` is **not spoken as the avatar's own words**; it is rendered as attributed IT chrome. Attribution must be audible where TTS is used. The hub must be structurally unable to forward `work_notes` (D145). | Proposed; the UX change appears on no build list | B1/H5, X-5, Part B addendum item 3. Under D53 the hub authors the model's whole context; H5 as written protects the broker from hub text and not the model, which is the component that turns text into proposals. |
| **D137** | **The egress consent predicate is audience change, not authorship.** Data needs per-action consent when it is about to reach an audience the user did not address it to. Machine state and transcript to the inference proxy: session-scoped (the user asked the assistant to look). Transcript or summary into a ticket or into persistent interaction history a fulfiller can open: per-action. Screenshot: per-action (unbounded audience). **Supersedes D128's "data the user did not author" predicate; D79b wins X-1 over D127.** A session needs a defined **start** as well as its end (D89/D90): the user opens the panel and sees the D127 disclosure; idle timeout ends it. | Proposed | B3, X-1, §1 "the one place what was asked for is not what is wanted". `PHASE1-TICKETING.md` §4 already says the user's own words leaving the machine must be visible in the validation step; D127 says the opposite. |

### 5.3 Cost, hosting and region (facts from Part A)

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D138** | **The cost model is rebuilt before any hosting commitment.** Anthropic **Scale tier** is a commercial prerequisite (monthly spend cap binds before rate limits: $500 Start, $1,000 Build, $200,000 Scale; one hour of a 1,000-RPM Haiku storm is ~$360 uncached; the cap returns 429 with no `retry-after` until month start; Scale is reached by usage history plus a Console request, not by payment). Per-tenant **workspaces** with spend limits and archive as kill switch (caches are isolated per workspace — the cross-tenant prefix cache is forfeited). Admission control from rate-limit headers; per-tenant and per-device token caps per day. Pricing confirmed standing: Haiku 4.5 $1/$5, Sonnet 5 $2/$10 per MTok, cache read 0.1×. No SLA at any purchasable tier; observed 90-day uptime 99.54%. | **Decided (facts)**; the rebuilt model is not yet written | §1.3, A3 Q1–Q5, C7. Replaces the Bedrock denominator D95 retired. |
| **D139** | **C9 documentation correction: the managed tier's model is `claude-haiku-4-5` (D97); `mistral-small:24b` is the customer-hosted pick, hardware permitting.** After §2b hardening Haiku scores 36/40 to mistral's 35/40, both at zero false actions reaching a user; mistral is 0.3 s faster per correct proposal. "Beats the cloud model" was true of the pre-hardening table only. Corrected on 2026-09-03 in `BAKEOFF-2026-09-02.md` §1, `HANDOVER-2026-09-02-post-demo.md` §4, `LOCAL-MODEL-PROVIDER.md` §3 and `PROJECT_START_HERE.md` §2. The GPU-cost incompatibility (R-7) therefore applies to the customer-hosted tier only; `[VERIFY]` GPU instance pricing was not researched. | **Done 2026-09-03** | C9, D97, §1.3 row 5, Part B addendum item 4, C.2. |
| **D140** | **Prompt caching does not work on the routine model as shipped, and is not attempted.** Measured 2026-09-03 with `messages.count_tokens` (`client/eval/count-tokens.mjs`, `npm run count-tokens`): on `claude-haiku-4-5` the cacheable prefix — system prompt 319 tokens plus tools and tool-use overhead 1,784 — is **2,104 tokens** with `tool_choice: any` (2,012 with `auto`); a full shipped turn is 2,261. Haiku 4.5's minimum cacheable prefix is **4,096**, so the prefix is short by **1,992 tokens** and `cache_control` would silently do nothing. The review's 4-chars/token estimate (~2,000) was right in direction; the real ratio is 2.8 chars/token. On `claude-sonnet-5` the same prefix is above its 1,024-token floor (see `../../client/docs/TOKEN-COUNT-2026-09-03.md` for the number). **Separately: `client/src/agent/cloud-client.js` sets no `cache_control` at all, so caching is not attempted on any model today.** Options: pad the stable prefix past 4,096 (cheap in dollars: ~2,000 extra tokens written once per cache window, read at 0.1×) — but the prompt is shared with the local-model provider and the bake-off compares prompt wordings, so padding must be Anthropic-path-only and must not change model behaviour; or write caching off for Haiku and size the cost model uncached. | **Measured; choice not yet made** | §1.3 row 2, A3 Q2d, verification register row "1.3, A3 lead". |
| **D141** | **Region: us-east-2 unless residency question 18 says otherwise — and residency is now an Anthropic model-and-provider question, not an AWS one.** Every Phase 1 line item (db.t4g.micro $0.016/hr, ALB, Fargate ARM, public IPv4, gp3, RDS Proxy) is priced identically in us-east-1 and us-east-2; us-east-2 has no entries on AWS's post-event-summary list against ten for us-east-1. `inference_geo: "us"` is **rejected on Haiku 4.5** (4.6-and-later only); there is no EU inference or EU at-rest on the first-party API; ZDR is sales-gated per org; default retention 30 days. So a US-only tenant cannot use the routine model as certified and an EU tenant cannot use the first-party API at all. **Go back to the design partner with those two sentences.** Resolves C5; reframes OPEN-3. | Proposed (region); decided (facts) | A3 Q3, A4 Q1–Q3, C5, C.4 OPEN-3, D93. |
| **D142** | **The free-tier assumption is dropped.** The 12-month RDS free tier is a legacy offer for accounts activated before 2025-07-15; a new account gets $100 in credits, up to $200, and a Free-plan account closes after six months. Budget **~$46/month from month one** on the Paid plan with $100–200 of credits against it. `max_connections` on db.t4g.micro is ~80–90 usable; a pooler is not forced at Phase 1 if each task caps its pool near 10 and tasks stay at four or fewer; RDS Proxy would cost $21.90/month, nearly twice the database. | Decided (facts) | A4 Q1–Q2, D115. |

### 5.4 Hub architecture

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D143** | **C2 has a third option and it is taken: a shared control-plane schema (tenants, devices, enrollment queue, releases, job queue) plus per-tenant data schemas.** The worker takes the tenant schema from the job row and asserts it before every query. Per-tenant queue tables need N pollers, which do not fit ~80 usable connections (D142). | Proposed — **unblocks the first migration** | R-2, C.1 C2, A4 Q2. |
| **D144** | **Embedding (resolves the direction of D96): one self-hostable Apache-2.0/MIT embedder, run by us in managed mode and by the customer in customer-hosted mode via the Hugging Face TEI CPU image**, so the two tiers share one vector space and migration between them needs no re-embed. Candidates: nomic-embed-text-v1.5, arctic-embed-m-v2.0, gte-base/large, Qwen3-Embedding-0.6B, voyage-4-nano. Anthropic has no embeddings API. Re-embedding 10,000 articles is ~12M tokens: under $3 hosted, minutes to hours on CPU — "least reversible" was overstated; the real switching costs are operational. On db.t4g.micro do not run HNSW for more than one ~25k-chunk tenant; use Matryoshka truncation or `halfvec`; budget a larger instance for the second tenant. A 100–350M embedder on the *endpoint* is 100 MB–1.4 GB and collides with hub spec §2; D96 therefore enables offline dense retrieval of the generic KB only, and only if §2 is renegotiated. | Proposed | A1, R-6, Part B addendum (D96 and A1). |
| **D145** | **ServiceNow adapter facts, from primary documentation.** Build the session model on `POST /api/now/table/interaction` with the `interaction_agent` role; treat the dedicated Interaction Management API as unavailable until tested. `interaction` almost certainly does **not** extend `task` `[VERIFY on instance]` — no `correlation_id`, task SLAs or task ACLs. Never request journal fields on task-table GETs; read customer-visible updates only from `sys_journal_field` with `element=comments` hard-coded; **give the integration account a role without `itil`** so `work_notes` are ACL-denied at the source regardless of hub bugs. Query child tables, never `task`; HR (`sn_hr_core_case`), SecOps (`sn_si_incident`), GRC and Legal are `task` children in their own scopes; the legal table is `sn_lg_ops_request`, not `sn_legal_request`. KB entitlement: declarative User Criteria can be evaluated offline, scripted criteria cannot (Microsoft's connector treats them deny-all); either proxy per user via `/api/sn_km_api/knowledge/articles` or fail closed on any KB with scripted criteria. The hub is a **SCIM 2.0 service provider** receiving pushes from the IdP, not a puller (pulling needs admin-equivalent `scim_admin`). Set `caller_id` explicitly; `opened_by` is the integration account. | Decided (facts) `[VERIFY]` where marked | A2 Q1–Q7, C.5. Amends D69–D71, D75–D77 (was D62–D64, D68–D70). |
| **D146** | **Device authentication stands on documentation, not statistics, and gains three details.** Zscaler documents mutual TLS as unsupported under inspection; Palo Alto auto-excludes a destination for 12 hours after a client-auth failure; Microsoft exempts its own agents — so D62 (mTLS rejected) holds without a prevalence survey. A signed device token over ordinary TLS survives inspection with two consequences: the proxy sees the token (sign a server nonce, short lifetimes, audience binding) and **the agent must not pin the hub certificate** (validate against the OS store). Publish a stable FQDN list. TPM key details for D60: create it with **no TPM authorisation value** so Windows Hello lockouts do not block the broker `[VERIFY: PCP default]`; never create it inside `StartService`; detect duplicate public keys across devices (cloned vSphere VMs share one vTPM); record TPM vendor and firmware at enrolment and gate trust on it (old Intel fTPM leaks ECDSA nonces). TPM 2.0 is universal on Windows 11; ~30% Windows 10 residue (consumer-weighted) needs a "TPM required" statement or D63's software-key tier. | Decided (facts) | A5 Q1–Q2, X-6, C.5. |
| **D147** | **Build-pipeline requirements from EDR research.** Sign broker and agent with an **RSA** code-signing certificate (App Control signer rules do not support ECDSA). Keep every broker binary and native DLL under `%ProgramFiles%` (path rules are honoured only for admin-writable paths). Ask customers for **certificate/publisher rules, never hash rules** — Microsoft's own docs say hash exceptions break on every update. Ship the agent's DLLs separately from the broker's so Windows Installer can restart the service without a reboot. Electron/koffi as an EDR false-positive class: no authoritative source; treat as unknown. | Decided (facts) | A5 Q3–Q4. |
| **D148** | **OPEN-1 resolution: the broker attests the logged-on user.** The broker runs as LocalSystem and reads the interactive session's logon SID (`WTSQueryUserToken` / `WTSQuerySessionInformation` `[VERIFY against learn.microsoft.com]`) and puts it into the assertion it signs with the device key (D61). The hub maps SID → IdP object via SCIM (`externalId` or the on-premises SID attribute Entra syncs). No interactive sign-in, no self-asserted profile; the claim is made by the privileged half. Shift-worker machines are handled because the SID changes with the session. C12's first-run profile becomes display-only. | Proposed | C.4 OPEN-1, C12. |

### 5.5 Scope and documentation

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D149** | **Endpoint stays phase one; hub-distributed privileged content becomes phase two.** Freeze the four-primitive catalog as a vendor-signed static bundle shipped inside the MSI. The first hub is **identity + inference proxy + audit ingestion + tickets (internal store, D73) + KB retrieval + email (D86)** — not catalog distribution, per-tenant catalogs, release channels, canary rings or a tenant policy engine. H1, H4 and H6 then have nothing to bite on in phase one because nothing privileged moves over the wire. The register's §6 estimate is rebuilt against this scope. **What would change it:** the ticket export showing resolvable network/service faults under roughly one in ten L1 tickets (then the chat surface is phase one alone), or the design partner's security team refusing a third-party privileged service under any allowlisting. | Proposed | B5, B6, B7 (item 1 alone is 6–8 engineer-weeks, in the range the spec gave for the whole hub), X-7, C4. |
| **D150** | **One checked-in decisions directory; one register that owns its numbering; every handover and prompt references it by relative path.** This file. Sources are kept verbatim under `sources/` and are not to be cited. New decisions are appended here with the next free ID; nobody renumbers. A handover that names a document without a path is a defect (the ollama brief and this register were each "missing" while present on disk). | **Done 2026-09-03** | Review §0.2, D91 file §0. |

---

## 6. Conflicts

### 6.1 Conflicts C1–C8 (consolidated register, IDs +7)

| ID | Conflict | Status |
|---|---|---|
| **C1** | §4 says the hub must not own the conversation loop; §4 also places prompt versioning on the hub; D53 places retrieval and assembly on the hub. Three statements, unreconciled. | Needs wording decision. Recommended: restate as *model proposes / endpoint validates / broker executes*. |
| **C2** | §5 commits to a Postgres `SKIP LOCKED` job queue; §6 commits to schema-per-tenant. Per-schema queues mean N pollers or one poller iterating every schema; a shared queue table reintroduces the cross-tenant surface schema-per-tenant was chosen to eliminate. No third option. | **Open. Blocks the first migration.** |
| **C3** | H1 says the signing key never lives on the hub; §4 describes signed catalog distribution as per-tenant and as the path for draft-and-approve authoring. Together these require a human to sign every customer's catalog edit offline, indefinitely. | **Open.** Probable resolution: the signed artifact is the vendor-authored primitive/playbook catalog; per-tenant approved-subset and risk policy is unsigned config enforced by the endpoint against it (H2 + H4). Not yet stated. |
| **C4** | §2 says most customers lack ServiceNow; §4 puts the internal ticket store at priority 3 behind a ServiceNow adapter built for one design partner. | **Resolved by D73.** |
| **C5** | §10 quotes RDS/NAT/endpoint rates for US East (Ohio); §11 commits to us-east-1. | **Open.** Re-price. |
| **C6** | §3 asserts hub compromise costs confidentiality, not control. | **Open.** Does not hold until H4 is ratified. |
| **C7** | §4 puts the inference proxy at priority 2; §14 says items 1–4 are the minimum that makes joined mode mean anything, and the proxy is item 6. Under D52/D53 joined mode requires it. | **Open.** Both cannot hold. |
| **C8** | §4 puts interaction history at priority 3; under D53 the hub receives conversation state every turn regardless. | **Open.** We take the data at priority 2 and call storing it priority 3. A retention question (§9), not a feature question. |


### 6.2 Conflicts C9–C12

Recorded in §4.7 above with their D122–D129 resolutions. Verdicts below.

### 6.3 Review verdicts on C1–C12 (2026-09-02/03)

| ID | Verdict | Where it now stands |
|---|---|---|
| C1 | Agree on the restatement *model proposes / endpoint validates / broker executes*; it carries the security weight but not the measurement weight — standalone assembles the prompt on the endpoint, joined on the hub, and the bake-off measured only the first (R-1). | Open. The prompt template should be a versioned, signed artifact both assemblers read. |
| C2 | Disagree that there is no third option. | **Resolved by D143** (shared control-plane schema + per-tenant data schemas), pending ratification. |
| C3 | Agree with the probable resolution; decide it. | **Decided by D134.** Customers select and constrain vendor playbooks; they do not author them. |
| C4 | Agree; the largest scope decision in the register. | Resolved by D73. Counterweight: D149 defers catalog distribution instead. |
| C5 | Re-pricing changes nothing; the question is different now. | **Resolved by D141/D93.** Residency is an Anthropic question. |
| C6 | Agree. | Open until H4 is ratified (D134). Even then, "confidentiality, not control" is too strong: under D53 hub compromise costs the model's instructions on every joined turn — "confidentiality plus persuasion, not execution". |
| C7 | Agree. | The proxy is item 2, after identity (D138, D149). |
| C8 | Agree; also a consent question. | D79b already says mirroring changes the privacy posture; D125–D128 flatten it to a disclosure string. **X-1**; resolved in D79b's favour by D137. |
| C9 | Agree; verified; in four documents. | **Done — D139.** |
| C10 | Agree on the axis and on D125, D126, D129; disagree on D128's predicate. | D128's predicate superseded by D137. |
| C11 | Agree; a hub-side contract test. | Open. The rule is "not to the model", not "not to the hub". |
| C12 | Agree; this is OPEN-1. | **Resolved by D148**, pending ratification and `[VERIFY]`. |

### 6.4 Cross-register conflicts X-1–X-7 (review C.3)

Tensions between decisions written in different sessions, neither of which saw the other.

| ID | Between | Conflict |
|---|---|---|
| **X-1** | D79b (was D72b) and D125/D127/D128 | D79b: session mirroring is a categorically different privacy posture needing its own consent wording. D127: a session-start disclosure string covers conversation to the hub. Under D53 every turn reaches the hub and under C8 the hub keeps it. Whether that stored transcript then reaches fulfillers (interaction records, D75/D76 was D68/D69) is exactly D79b's case, and D127 does not cover it. Decide which register wins; I say D79b. |
| **X-2** | D64 (was D57) and D99/D102 | The register put the device key, the mode state (D48 was D41), enrollment and token minting into the broker, making it the trust anchor for everything. The later document put the broker on the slowest update channel with protocol negotiation to paper over drift. The more the broker holds, the worse D99's trade becomes. B4 and the Part B addendum. |
| **X-3** | D61 (was D54) and register §5 | D61 says short token expiry "delivers revocation without CRL machinery"; D83a (was D76a) says revocation is a row delete and tokens expire on their own. Revocation latency therefore equals the token lifetime, which §5 lists as unset. It is a security parameter, not a tuning one, and D83a's bulk revocation is only as fast as it. Set it in the same decision as the heartbeat interval; A5's TPM latency (P95 ~600 ms) says the exchange can happen every few minutes without cost. |
| **X-4** | D45/D46 (was D38/D39) and D104 | Generic KB and catalog bundles are pushed proactively by the hub; binaries are not delivered by the hub. Content yes, code no. That is a coherent line (D110/D111), so this is not a conflict. Recorded because the next reader will ask. |
| **X-5** | D53 (was D46) and H5 | H5 governs hub text reaching the *user*. D53 makes the hub the author of the *model's* entire context. The escalation `summary` is hub-returned text that the shipped code speaks in the avatar's voice; H5 as written forbids that. Nobody has listed the UX change (Part B addendum item 3). |
| **X-6** | D60 (was D53) and A5 | Not a conflict; three additions the register needs. Create the device key with no TPM authorisation value so Windows Hello lockouts do not block the broker (`[VERIFY]` PCP default). Do not create it inside `StartService` (Microsoft documents the deadlock). Detect duplicate public keys across devices, because cloned VMs on vSphere 6.7/7 share one vTPM. |
| **X-7** | Register §6 (rebuild the estimate) and B6 | The register asks for the estimate to be rebuilt after adding a knowledge platform, a ticketing system, email and analytics. B6 asks for the privileged-content distribution half of the hub to be deferred. Both are true; together they say the phase-one hub is identity + proxy + tickets + KB + email, and not catalogs, rings or tenant policy. Neither register draws that conclusion. |

### 6.5 Reviewer tensions R-1–R-14 (review B2)

Found from the source documents before either register was read; numbered R- so they cannot be confused with C-numbers. R-4 and R-8 were later withdrawn as conflicts (already decided by D59c and D53a); R-7 is half-moot (D97, D139).

| # | Requirement A | Requirement B | Why they collide | Resolution I would take |
|---|---|---|---|---|
| R-1 | Hub does retrieval, prompt assembly and "versions prompts" (§4 inference proxy) | "The conversation loop stays on the endpoint, or offline mode dies" (§4); one shared prompt is a correctness requirement for the bake-off (`prompt.js`) | If the hub assembles the prompt online, the endpoint assembles a *different* prompt offline. Two prompts, two behaviours to certify, and the bake-off measures neither of them. | The endpoint owns the prompt template (signed, in the catalog bundle). The hub supplies only retrieved chunks and the tenant policy block as data. "Prompt versioning" becomes catalog versioning. |
| R-2 | Job queue in Postgres via `SKIP LOCKED` (§5) | Schema-per-tenant as a hard boundary (§6) | A queue table per tenant schema needs N pollers or a UNION across schemas that grows with tenants. One shared queue table breaks the boundary: a worker must `SET search_path` per job, and a bug there is the exact cross-tenant leak schema-per-tenant was chosen to prevent. | Accept a shared **control-plane** schema (tenants, devices, queue, releases) and per-tenant **data** schemas. It is a third option, and it is the honest one. Write the worker so the tenant schema comes from the job row and is asserted before every query. |
| R-3 | Per-tenant signed catalogs, draft-and-approve in the hub (§4) | H1 | See B1/H1. The hub cannot be the thing that triggers signing. | Vendor floor catalog signed offline by us. Tenant delta signed by the **customer** with a key they hold (their own KMS, their own HSM, or a hardware token), and the endpoint trusts vendor key + tenant key, delta constrained by H4. The product cost is that customers must run a signing step. That is the cost of H1. |
| R-4 | Customer-hosted hub (§5, §15) | Telemetry, deflection measurement, canary rings, token metering (§4, §12) | Everything we sell (deflection) and everything we bill on (tokens) is measured on a server the customer runs and we cannot see. Canary rings across a fleet we do not control are the customer's Intune rings, not ours. | Say it in the contract: customer-hosted is excluded from deflection commitments (§12 already does this for tier 3) *and* from usage billing (flat per-seat). Ship a signed weekly usage report the customer can choose to send. |
| R-5 | The broker never opens a socket | One consent flow and one audit log for ticket egress (PHASE1-TICKETING §3 "extend the broker") | If the broker never transmits, the broker consents to a payload it cannot verify was the payload sent. The agent can add fields after consent. One audit log of "what left the machine" cannot be written by the process that did not send it. | Hub returns a signed receipt containing the hash of what it received. Broker logs consent hash and receipt hash; a mismatch is an audited incident. The broker still never opens a socket, and the audit record is honest. |
| R-6 | Offline capability / customer boundary (§13 "corpus can stay inside the customer boundary") | Any hosted embedding API for the managed tier | A customer-hosted hub calling OpenAI, Voyage or Cohere to embed their KB defeats the reason they host. If managed uses a hosted API and customer-hosted uses a local model, the two tiers have incomparable vectors and no migration path. | One self-hostable embedder, run by us in managed mode too. Whether that is viable on CPU is Part A, A1. |
| R-7 | Bake-off recommendation: `mistral-small:24b`, 16 GB VRAM (BAKEOFF §1) | Phase 1 hosting at ~$46/month with no GPU anywhere (§10) | The model the project recommends cannot run on the infrastructure the project costed. A GPU instance capable of a 16 GB resident model is an order of magnitude above the entire Phase 1 budget. `[VERIFY]` current GPU instance pricing; I do not have a verified source for this in this review. | Decide which tier the recommendation is for. If "managed", the cost model is wrong and needs a GPU line. If "customer-hosted only", say so in the bake-off, and the managed tier's routine model is still Haiku 4.5 with eight false actions before preconditions, four after. |
| R-8 | "Redaction runs before egress regardless of destination" (§9) | Hub-side retrieval and hub-side interaction history (§4) need the un-redacted question to retrieve well | Redaction on the endpoint removes the names, hostnames and error strings that make retrieval work. Redaction on the hub means un-redacted text has already left the machine. | Redact on the endpoint with a *tenant-configured* rule set (H2: policy is data). Accept the retrieval loss. Never let "we redact on the hub" be the answer; it contradicts §9 in one sentence. |
| R-9 | Standalone installs convert to joined without reinstall (§7) | Agent self-updates, broker updates only via customer tooling (B4 model) | Standalone has no customer tooling. Standalone brokers never update. The divergence B4 worries about is *guaranteed* in the mode the product ships first. | Broker updates itself in standalone mode (signed MSI from CDN, run by the service). Which is the mechanism B4 recommends anyway. |
| R-10 | Idempotency keys from day one (§8) | "Do not build a queue by accident" (§8, PHASE1 §5) | The only reason to have an idempotency key is that you intend to retry. The first retry-after-5xx is a queue of length one with no visibility, no expiry and no cancel. | Choose: refuse on failure and tell the user (no key needed), or build the queue deliberately. The spec currently has the key and not the queue, which is the accident it warns about. |
| R-11 | us-east-1 chosen for Bedrock In-Region coverage (§11) | Bedrock is out | The only stated reason for the region is gone. Data-residency question 18 is still outstanding and the Anthropic API's residency controls are a different mechanism entirely (A3). | Re-decide region on cost and blast radius (A4). Re-open residency as an Anthropic-API question, not an AWS one. |
| R-12 | Per-device rate limiting so a looping client cannot flood the hub (§8) | Incident storms are the product's reason to exist | When a customer's network breaks, endpoints cannot reach the hub, so the hub's storm is not network incidents but everything else (a printer driver push, an Outlook update). Per-device limits do nothing against 5,000 well-behaved devices arriving at once; the constraint is the Anthropic tier ITPM (A3). | Per-tenant concurrency cap at the proxy with a queue-position message to the user, in addition to per-device. Size it from A3 numbers, not from "rate limiting per device". |
| R-13 | `tool_choice: {type: "any"}` forces a tool call (`cloud-client.js`) | Certified model set includes newer models | Forced tool choice is rejected with a 400 on the Fable/Mythos 5.1 tier per the API skill's migration notes `[VERIFY against live docs]`. Haiku 4.5 and Sonnet 5 accept it. Not a today problem; a "swap the model in config" problem, which the design says is free. | Move to `tool_choice: auto` plus an instruction, or structured outputs. Cheap now, a production incident later. |
| R-14 | "macOS eventually required; no decision may foreclose macOS" (§2) | TPM-keyed device identity, MSI updates, named pipe, SCM primitives, Win32 FFI | Every concrete mechanism in the identity, update and execution design is Windows-specific. Nothing forecloses macOS in principle; nothing in the documents names the macOS equivalent of any of it either. | Write the one-page mapping (Secure Enclave, pkg/MDM, XPC, launchd) before locking identity. If TPM-attested identity is chosen, the macOS answer is Secure Enclave attestation, which is a different protocol. |

---

## 7. Open items

| ID | Item | Where it stands after the review |
|---|---|---|
| **OPEN-1** | **User identity binding.** Device auth authenticates the machine; KB entitlement (D43) and ticket history (D68) need the user. A self-asserted "user X is logged in" lets a compromised endpoint read any user's articles and tickets. | **Answered by D148** (broker-attested logon SID). Ratify, then `[VERIFY]` the Win32 route. |
| **OPEN-2** | **Whose AWS account** (carried from hub spec §15). | Both; the architecture supports both (D59). The commercial answer: customer-hosted hubs cannot be metered or measured by us (R-4, D59c), so they are flat-priced and excluded from deflection commitments. Decide the price list, not the architecture. |
| **OPEN-3** | **Retention and residency** (hub spec §9, question 18). D58 added a PII table. | **Reframed by D141.** Anthropic retention is 30 days by default; ZDR is sales-gated; no EU inference or at-rest; no US pin on Haiku 4.5. Two sentences go back to the design partner. |
| **OPEN-4** | **v1 subset of the internal ticket store** (D73). | Their list — create, assign, state machine, visibility-split comments (D69), attachments, search, dashboard — **plus email notification to an IT alias (D86)**. Without an ITSM there is no queue; the store plus an email alias *is* the queue. |
| **OPEN-5** | **A threat model.** Ten invariants and no adversary list: user-context malware, a malicious end user, a malicious tenant admin, a compromised hub, a vendor insider, a compromised KB author, the network path. Each invariant should name which it stops. | New (review B8). B1 found its gaps by writing the adversaries down. |
| **OPEN-6** | **Human identity and authorisation for the hub.** Who logs in to approve a catalog, revoke a device, read audit, configure a tenant; SSO, roles, MFA, admin audit. Draft-and-approve is meaningless without it. | New (review B8). Also missing: key-compromise runbooks, observability and on-call, backup/restore, tenant offboarding, a device lab, clock tolerance, uninstall, DPA and subprocessor list, end-user notice text, accessibility, change-management integration, the billing model the metering must support, and liability record contents. Listed in review B8; not individually numbered here. |
| **OPEN-7** | **macOS mapping.** D65 maps device identity to Secure Enclave. Nothing maps MSI, the named pipe, SCM primitives or Win32 FFI (R-14). | New. Write the one-page mapping (pkg/MDM, XPC, launchd) before locking identity. |

---

## 8. Values left unset

Recorded so they are not invented by whoever writes the code first.

- `N` — consecutive heartbeat failures before entering offline (D51)
- Heartbeat interval (D50) — a capacity parameter (D115); **decide together with the access-token lifetime (D132)**
- Access-token lifetime (D61) — **a security parameter: revocation latency equals it (D132, X-3)**
- Enrollment secret validity window (D81)
- Enrollment rate-limit thresholds and anomaly trigger (D83)
- Minimum telemetry set for customer-hosted support (D59c) — must include hub version (D107) and, per D131, broker version as attested by the broker
- Retrieval chunk budget per turn — drives input token cost; the only measured input figure is the 2,261-token shipped turn with no retrieval (D140)
- Consent TTL, freshness bound, replay window and clock tolerance (review B8 "clock and time")
- Session start definition and idle timeout (D137)

---

## 9. Estimate status

**The 8–14 engineer-week figure predates D42–D90 and should be rebuilt, not adjusted** (consolidated register §6, carried forward). Work now in scope and absent from that estimate: corpus ingestion, chunking, embedding pipeline and index maintenance (D42–D47, D144); retrieval API with per-user entitlement filtering (D43, D145); user identity entity, SCIM mapping and directory sync (D54–D58); a PII store with its own retention obligations (D58); session entity and analytics store (D75, D71); read-through ticket query with comment-visibility filtering (D68, D69); dashboard and reporting, two views, export and scheduling (D87, D88); outbound email (D86); the internal ticket store at whatever subset OPEN-4 defines (D73); a second ITSM record type for catalog requests (D79a).

**Two review corrections.** (1) Item 1 of the hub — device identity, enrollment, issuance, rotation, revocation — decomposes to roughly **6–8 engineer-weeks on its own** (review B7), three to four times the implied two. (2) D149 removes catalog distribution, release channels and the tenant policy engine from phase one, which is the only thing that brings the total back toward the original range. Re-estimate after D149 is decided, not before.

**Scope observation, carried forward.** Across the sessions producing D42–D90 the product moved from "endpoint agent plus a thin hub" to "endpoint agent, hub, knowledge platform, ticketing system and analytics product." Each addition was individually justified; the aggregate has never been re-estimated.

---

## 10. Verification register

### 10.1 What the review answered (its §C.5, reproduced)

| Register §9 item | Answer | Where |
|---|---|---|
| `interaction` / `interaction_related_record` existence, fields, inheritance | Exist (plugin `com.glide.interaction`); fields documented by label; `interaction` almost certainly does **not** extend `task` `[VERIFY on instance]` | A2 Q1 |
| REST create for interaction — load-bearing | Table API `POST /api/now/table/interaction` with `interaction_agent`; dedicated API undocumented in practice | A2 Q1 |
| `task` base fields and inheritance | Documented list retrieved; `caller_id`, `category`, `incident_state` are not on it, confirming D77 (was D70) | A2 Q2 |
| `opened_by` vs `caller_id` | Confirmed (secondary sources only); set `caller_id` explicitly | A2 Q3 |
| `comments` vs `work_notes` — load-bearing | Confirmed: `work_notes` "viewable only by ITIL users"; read via `sys_journal_field` `element=comments`; deny `itil` to the integration account | A2 Q4 |
| KB read criteria evaluable server-side? | Declarative criteria yes, scripted criteria no; Microsoft's connector documents the same wall; per-user proxy via `/api/sn_km_api/knowledge/articles` | A2 Q5 |
| Licensed account per end user for own tickets? | KB reading is Requester activity (secondary sources); `[VERIFY]` against the order form | A2 Q5 |
| Restricted classes | HR, SecOps, GRC, Legal are `task` children in own scopes; never query `task`; legal table is `sn_lg_ops_request` | A2 Q6 |
| SCIM paths vs RFC 7643 | Confirmed and listed; ServiceNow is a SCIM server but pulling needs admin-equivalent `scim_admin`; be a SCIM provider instead | A2 Q7 |
| Per-token pricing | Haiku $1/$5, Sonnet 5 $2/$10, standing; Bedrock and Nova moot | A3 Q1 |
| Titan V2 hosted-only | Moot; Anthropic has no embeddings API; open-weight alternatives listed | A1 |
| db.t4g.micro us-east-1 | $0.016/hr, identical to us-east-2 | A4 Q1 |
| `max_connections` and pooler | ~80–90 usable; pooler not forced if pools capped; RDS Proxy $21.90/mo | A4 Q2 |
| pgvector on RDS | 0.8.2 on PG 15–18; HNSW; 2,000-dim index limit; micro holds one ~25k-chunk tenant | A1 Q5 |
| TPM signing latency (D61 premise "tens of ms") | Worse than the premise: medians 10–500 ms across firmware; P50 200 / P95 600 ms in Chrome telemetry. The token-exchange design is more necessary, not less | A5 Q1b |
| TPM prevalence and failure modes | Universal on Windows 11; ~30% Windows 10 residue (consumer-weighted); clear/re-image/swap = re-enrol; lockout survivable with no-authValue keys; cloned vTPMs duplicate identity | A5 Q1c–d |
| TLS inspection prevalence — strongest argument for D62 (was D55) | Prevalence unmeasured; unnecessary: Zscaler documents mutual TLS as unsupported under inspection, Palo Alto auto-excludes on client-auth failure, Microsoft exempts its own agents. D62 stands on documentation, not statistics | A5 Q2 |
| EDR allowlisting; do updates break hash exceptions | Yes by definition and Microsoft says so; use certificate/publisher rules; sign with RSA; keep binaries under `%ProgramFiles%` | A5 Q3 |
| RFC numbers (private-key JWT, DPoP, HTTP signatures) | RFC 7523 is private-key JWT client authentication; DPoP is RFC 9449; HTTP Message Signatures is RFC 9421 `[VERIFY: from memory; not retrieved in Part A]` | — |

### 10.2 Still unverified

- `[VERIFY]` GPU instance pricing for a 16 GB-resident model (R-7, D139) — not researched; the "order of magnitude above the Phase 1 budget" claim is reasoning from the $46/month total.
- `[VERIFY]` `interaction` not extending `task`; the Interaction Management API's behaviour; requester-vs-fulfiller licensing for KB reads — all against the design partner's instance and order form (D145).
- `[VERIFY]` PCP default for the TPM authorisation value (D146); `WTSQueryUserToken` / `WTSQuerySessionInformation` as the SID route (D148); RFC 7523 / 9449 / 9421 numbers (cited from memory twice).
- `[VERIFY]` Voyage 4 hosted-plus-nano shared vector space (vendor claim, D144); interactive embedding latency on 1–2 vCPU Fargate (unmeasured).
- `[VERIFY]` whether a seed-stage self-serve org can obtain Zero Data Retention (D141).
- `[VERIFY]` forced `tool_choice: any` returns 400 on the Fable/Mythos 5.1 tier (R-13) — from cached skill documentation, not a live page; irrelevant unless the certified model set changes.
- Every `[VERIFY]` inside the five Part A research reports' own "Unverified / could not find" lists (`sources/2026-09-02-fable-design-review.md`).

### 10.3 Measured — the only two measurements in the project

| What | Result | Where |
|---|---|---|
| Model bake-off | 5 models, 40 hand-written cases, one machine, one run pair; zero R2 false actions reach a user after two catalog preconditions and `whenNotToUse` | `../../client/docs/BAKEOFF-2026-09-02.md`, `../../client/eval/` |
| Shipped prompt prefix, `claude-haiku-4-5` | 2,104 tokens (system 319 + tools and overhead 1,784) against a 4,096 cache floor; full turn 2,261 | `../../client/docs/TOKEN-COUNT-2026-09-03.md`, `npm run count-tokens` |

**Outstanding from the design partner, now five weeks:** top-30 L1 ticket categories by volume — every substantive question eventually points at it (B5); incident and `sys_user` fields as actually used including `u_` custom fields; whether they use Interaction Management and Virtual Agent; whether they run outbound TLS inspection (now moot for the mTLS decision, D146, still useful for the FQDN allowlist conversation).

---

## 11. How to add to this register

1. Take the next free ID (D151 onward). Never reuse, never renumber.
2. One row: decision, status (*done* / *decided* / *proposed* / *rejected*), source and forcing reason. A decision without a forcing reason is an opinion.
3. If it amends an earlier decision, say so in both rows.
4. If it depends on an unverified claim, tag `[VERIFY]` inline and add it to §10.2.
5. Update `PROJECT_START_HERE.md` only if the status table changes; that file is an index, not content.
