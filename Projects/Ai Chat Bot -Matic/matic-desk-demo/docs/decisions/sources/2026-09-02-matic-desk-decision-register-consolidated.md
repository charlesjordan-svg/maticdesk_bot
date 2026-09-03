# Matic Desk — Consolidated Decision Register

**Version:** 1.0
**Date:** 2026-09-02
**Covers:** D35–D83, invariants H1–H4, conflicts C1–C8, open items OPEN-1 to OPEN-4.

**Supersedes:**
- `2026-09-02-decisions-D35-D46-kb-connectivity-inference.md`
- `2026-09-02-decisions-D53-D67-device-auth-tickets-dashboard.md`

Both may be archived. This document is the register.

**Companion documents:**
- `2026-09-02-hub-server-side-spec-handover.md` — still v1 and now **partially stale**. Section 8
  lists every delta. A v2 rewrite has not been done.
- `2026-09-02-fable-evaluation-prompt.md` — independent review prompt. Section 9 items feed its
  Part A.

---

## 0. Provenance and gaps

**D1–D34 are not included.** They were not available to the session that produced this document. If
they exist as a written artifact, they belong at the front of this register; if they exist only in
conversation history, reconstructing them is the highest-value housekeeping task remaining, because
the invariants below reference decisions that live in that range.

**No web access was available.** Every vendor claim in this document carries `[VERIFY]`. Nothing
about ServiceNow's schema, AWS pricing, TPM behaviour, or RFC numbers has been confirmed against
primary sources. Two independent network paths were attempted and both were blocked.

**No performance number in this project has been measured.** Every figure is a target.

**All §2 constraints in the handover are single-source** from one design partner company.

---

## 1. Invariants

| ID | Rule | Status |
|---|---|---|
| **H1** | The signing key never lives on the hub | Locked |
| **H2** | The hub distributes policy; the endpoint enforces it | Locked |
| **H3** | No cloud credentials on the endpoint in joined mode (standalone is a bounded exception capped at R1) | Locked |
| **H3b** | Playbook parameters are schema-constrained, never freeform | Locked |
| **H3c** | `toolConfig` is a schema enforcement device, not an executor binding | Locked |
| **H3d** | Playbooks are typed primitives, never scripts | Locked |
| **H3e** | The endpoint owns consent wording | Locked |
| **H4** | **Hub-supplied policy may only narrow endpoint capability, never widen it.** Maximum risk tier and primitive allowlist are pinned at enrollment or carried in signed content. | **Proposed — not ratified** |

**Why H4 is needed.** H1 stops a compromised hub signing new playbooks. H2 does not stop a
compromised hub *widening the approved subset or raising the tier ceiling* using only correctly-
signed content. That is fleet-wide capability escalation to the union of everything in the catalog,
without violating any stated invariant, and the ceiling rises as the catalog grows. H2 as worded is
satisfied by an endpoint faithfully enforcing a policy telling it to do more. The invariant needs
the *direction* stated. Until H4 is ratified, handover §3's claim that hub compromise costs
confidentiality rather than control does not hold (C6).

---

## 2. Decisions

### 2.1 Knowledge base

| ID | Decision |
|---|---|
| **D35** | Hub connection grants KB access for answering before escalation. KB answering is a first-class deflection capability, not a secondary feature. Read-only, needs no privileged primitive, covers ticket classes the four Win32 primitives cannot reach. |
| **D36** | **Customer KB is never stored at rest on the endpoint.** Retrieval is hub-side. Reasons: query embedding needs the network anyway (D37); articles carry read criteria requiring per-user entitlement at query time; withdrawn articles must stop being served immediately, and sync protocols handle deletions badly. |
| **D37** | Query embedding requires a network call. **There is no offline dense retrieval path.** Titan Text Embeddings V2 is Bedrock-hosted `[VERIFY]`; dense retrieval requires query and corpus embedded by the same model, so a local substitute returns noise, not degraded results. Consequence of the existing embedding decision, not a new choice. |
| **D38** | **Generic KB ships inside the signed catalog bundle.** Vendor-authored, no entitlement rules, no customer data — safe at rest. Reuses an existing signed, versioned distribution channel; no new signing story; H1 unchanged. |
| **D39** | The generic bundle is pushed proactively, not fetched lazily. The moment it is needed is the moment the hub is unreachable. |
| **D40** | **Offline capability = tier-0 routing + lexical search over the generic bundle. No model, no customer content.** Converges with what §7 already specifies for standalone mode. |

**Rejected and recorded dead:** hub embeds query, endpoint searches a local index. Needs the network
anyway, so delivers no offline capability while still placing the corpus on disk with the
entitlement and retraction problems intact.

### 2.2 Connectivity

| ID | Decision |
|---|---|
| **D41** | **No user-facing mode toggle.** Mode is machine state, broker-owned, written at enrollment, changed only by authenticated enroll/unenroll. UI displays mode and cannot set it. A user-operable toggle is a security downgrade triggered by a button press. It also has nothing to toggle *to* — H3 means a joined endpoint holds no local credential. |
| **D41a** | The unenroll path is security-relevant and must be authenticated, or the downgrade is relocated rather than closed. |
| **D42** | **Three connectivity states:** joined-and-reachable, joined-and-unreachable, standalone. Surfaced distinctly — a user shown a generic "offline" for both will escalate about the wrong thing. |
| **D43** | Connectivity is determined by an **authenticated heartbeat** that also carries policy and catalog version. Not a reachability check: captive portals return 200 to anything, and a TCP connect proves nothing about credential validity. Collapses three signals that can otherwise disagree into one. |
| **D44** | Hysteresis: enter offline after N consecutive failures, leave only on a successful authenticated call. Mid-session capability loss is stated to the user rather than silently degrading. |

### 2.3 Hub inference

| ID | Decision |
|---|---|
| **D45** | In joined mode the endpoint uses the hub inference proxy, with device identity as the credential. |
| **D46** | **Single combined call.** Endpoint sends conversation state and user turn; hub retrieves, assembles, calls the model, returns a **structured proposal**. Retrieved chunks never leave the hub. The two-call alternative moves customer KB content hub → endpoint → hub and lands it in endpoint memory. |
| **D46a** | **Redaction stays on the endpoint**, before the hub call. §9 requires redaction before egress regardless of destination; endpoint → hub is egress. Hub-side redaction means the text already left the machine and the rule is decorative. |
| **D46b** | **Tier-0 routing stays on the endpoint** with no hub dependency. Preserves the network-outage case — where the agent is most valuable and the hub least reachable. |
| **D46c** | Haiku→Sonnet escalation policy and per-tenant metering/caps move to the hub. Escalation is a cost decision; `modelId` is already tenant config. Neither is possible in standalone. |

**Boundary clarification.** D46 does not violate "the hub must not own the conversation loop"
*provided* the invariant reads as **model proposes / endpoint validates / broker executes**. The
endpoint still validates every proposal against the signed catalog, still owns consent wording
(H3e), still owns execution. Where prompt concatenation happens is not a security boundary. See C1.

### 2.4 User schema

| ID | Decision |
|---|---|
| **D47** | Introduce a **user identity** entity distinct from device identity. D36 entitlement and D61 ticket history both require it. |
| **D48** | Model on **SCIM 2.0 core + enterprise extension**, not ServiceNow `sys_user`. The `sys_user` field set maps near one-to-one onto SCIM `[VERIFY]` — not coincidence, since enterprises typically drive `sys_user` from AD/Entra, making it a derived copy rather than a source of truth. SCIM buys ServiceNow compatibility plus Okta, Entra and Jira. Same reasoning as §12's refusal to depend on a vendor's tool-calling dialect. |
| **D49** | **`sys_id` is not the primary key** — it is one entry in an external-correlation map alongside Jira account ID, Entra object ID. §2 says most customers lack ServiceNow; a `sys_id` PK gives them all a null key. |
| **D50** | Retain `manager` explicitly. Required for approval routing on R2+ actions and for access/license request categories — the ticket classes the four primitives cannot touch. |
| **D51** | The user table is PII (email, employee number, manager chain, location) and is in scope for §9 retention and residency. Schema-per-tenant makes per-customer deletion tractable. |

### 2.5 Customer-hosted deployment

| ID | Decision |
|---|---|
| **D52** | Customer-local hub deployment remains supported; §5's dependency discipline is what preserves it. |
| **D52a** | **pgvector is a stated deployment requirement** on customer-supplied Postgres. D36 puts the vector index on the hub and §5 permits only Postgres and object storage. A version-and-extension constraint on hardware we do not control — surfaces on install day if undocumented. |
| **D52b** | Infrastructure cost falls in a local deployment; **inference cost does not.** The only genuinely low-cost configuration is customer-hosted hub *plus* customer-hosted OpenAI-compatible endpoint (§12 tier 3) — which is best-effort and excluded from deflection commitments. So the cheapest, most privacy-attractive configuration is the one we cannot make quality promises about. Recorded as a commercial position, not a defect. |
| **D52c** | A **minimum telemetry set is a condition of support** for customer-hosted deployments. Otherwise: no deflection measurement, no debugging, and canary rings mean nothing across a fleet we do not operate. Retrofitting onto an installed base is unpleasant. |

### 2.6 Session model

*(Recovered — these were discussed and assigned D53–D58 in conversation, then that range was reused
for device auth. Renumbered here. All ServiceNow claims unverified.)*

| ID | Decision |
|---|---|
| **D68** | A **session is a first-class entity**, distinct from any ticket. A session may produce zero, one, or several tickets. Modelled as session ↔ task with a many-to-many link. |
| **D69** | **Adopt the shape, not the schema.** ServiceNow's Interaction Management is believed to model exactly this — `interaction` plus `interaction_related_record` `[VERIFY]`. Field names remain ours; the ServiceNow adapter maps onto their tables, the Jira adapter maps the task half and keeps sessions entirely our side. **Note the contrast with D48:** there is no SCIM for tickets — Jira, ServiceNow and Zendesk disagree and no interchange standard has won — so the argument against modelling on a vendor schema applies to users but not to tickets. Borrowing the abstraction is still correct; borrowing the schema is not. |
| **D70** | Model the **base `task` fields**, not incident-specific ones `[VERIFY]`. Their inheritance model indicates which fields are universal; category, subcategory and `caller_id` are incident-flavoured and belong in the adapter. |
| **D71** | **`opened_by` is not `caller_id`** `[VERIFY]`. Filing on a user's behalf means `opened_by` is the integration account and `caller_id` is the affected user. Getting this wrong breaks their reporting, assignment rules, and any SLA keyed to the caller. Second place where D47/D48 user identity becomes load-bearing — we must resolve our user to their user reference. |
| **D72** | `assignment_group` is tenant configuration, never inferred. |
| **D72a** | **"ServiceNow adapter" is at minimum two record types.** Access, license and software-install requests are catalog requests with a different workflow and approval chain `[VERIFY: sc_req_item under sc_request]`, not incidents. §14 item 5 is scoped as one adapter and is not. |
| **D72b** | Session records are **ours by default**; mirroring sessions into the customer's ITSM is a per-tenant opt-in that changes the consent wording. Mirroring means every conversation leaves the endpoint, not just escalated ones — a categorically different privacy posture from "we file a ticket when we cannot fix it," and it collides with §8's instruction to give egress its own risk tier and consent wording. |
| **D72c** | §8's correlation requirement (audit carries ticket ID, ticket carries audit IDs) **is the session↔task relationship drawn by hand.** Adopting D68 replaces a bespoke correlation scheme with a modelled relationship. |

### 2.7 Device authentication

The space splits into two questions usually collapsed: **what credential the device holds**, and
**how it is presented on the wire**. Deciding "mTLS" answers only the second and silently commits to
operating a CA.

| ID | Decision |
|---|---|
| **D53** | Device identity is an **asymmetric keypair generated at enrollment by the broker**, TPM-backed and non-exportable where TPM 2.0 is present. Public key binds to a hub device record. Bearer tokens as steady-state identity are excluded for the reason H3 exists. |
| **D54** | Authentication is a **signed assertion exchanged for a short-lived access token**, not per-request signing. D46 makes every turn a hub call; TPM signing per-request is too slow `[VERIFY: order of tens of ms]`. Short expiry delivers revocation without CRL machinery. Pattern is OAuth 2.0 client credentials with private-key JWT client auth `[VERIFY: RFC 7523]`. |
| **D55** | **mTLS is rejected.** Three reasons, any one sufficient: (a) corporate TLS inspection terminates the connection and cannot present a client certificate, requiring a per-customer exemption negotiated at every deployment `[VERIFY: prevalence — ask design partner directly]`; (b) customer-hosted hubs would need our trust store or their own CA; (c) §5's "every extra daemon is a pager" applies harder to PKI than to Redis — certificate expiry is a fleet-wide outage with a date on it. |
| **D55a** | **Consequence:** ALB mutual-TLS is removed from the verification register. Device auth is decoupled from AWS ingress and behaves identically hosted or self-hosted. |
| **D56** | **No-TPM fallback:** software key under DPAPI machine scope in broker-owned ProgramData. The hub records key-protection level as device state, because weak-path devices may be capped at a lower risk tier. |
| **D57** | The device key lives **broker-side**. The agent requests tokens over the existing named pipe and never sees the key. Pipe is ACL'd and the calling binary's signature checked. Blast radius is bounded — a token grants what the agent already has — but the check is cheap. |
| **D58** | Same abstraction maps to macOS Secure Enclave. v1 Windows work is not throwaway. |

### 2.8 Enrollment

| ID | Decision |
|---|---|
| **D59** | **An enrollment secret buys a pending record, not fleet membership.** A tenant-wide secret in the MSI is the credential most likely to leak; under this model a leak costs a spam queue, not a fleet breach. |
| **D60** | **Enrollment is the mechanism for standalone → joined conversion** (§7 requirement 1) and writes the broker-owned mode state (D41). Unenrollment is the only path back and is authenticated. |
| **D60a** | TPM attestation at enrollment deferred to v2 hardening. |
| **D73** | **Auto-approve is the default, with a per-tenant toggle to IT-approval-only.** Auto-approve still writes the pending record and then approves it — one code path, policy flag on the end. The queue becomes a permanent enrollment audit log rather than a mode. |
| **D74** | **Under D73 the enrollment secret is the security boundary**, so it must carry that weight: per-tenant, rotatable, time-boxed. An enrollment secret with no expiry is a permanent skeleton key. |
| **D75** | **The secret is not baked into the MSI.** Delivered as install-time configuration, so the installer binary is not itself a credential. Installers get emailed, dropped on shares, and posted to vendor portals. |
| **D76** | **Rate limiting and anomaly detection on the enrollment endpoint**, with automatic fallback to queued approval on anomaly. This is the safety net that costs IT nothing when nothing is wrong. |
| **D76a** | **Bulk revocation by enrollment batch** in the console. Under D54 revocation is a row delete and tokens expire on their own — make sure the console can act at batch granularity. |

### 2.9 Ticket history

| ID | Decision |
|---|---|
| **D61** | **Own-history retrieval is a live read-through query**, filtered to the requesting user, against the ITSM (integrated) or internal store (self-contained). No ingestion, no embedding, no corpus. Ticket data is high-volume, constantly changing, customer-owned and PII-dense; replicating it would put PII in a vector index and pull §9 retention across the whole corpus. Depends on OPEN-1. |
| **D62** | **Status readback uses customer-visible comments only. Internal work notes are never surfaced to the end user.** `[VERIFY: believed comments vs work_notes]`. Whatever the field names, the distinction is real and the default must be visible-only. Reading internal engineer commentary aloud to the user it concerns is a serious and easily-shipped failure. |
| **D63** | **Cross-user historical similarity is deferred**, pending entitlement research. Requires a searchable corpus of all tickets — embedding PII, replicating customer data, and an entitlement model over records that may include HR cases, security incidents, terminations and executive escalations. A project with a privacy review attached, not a feature. |
| **D63a** | If taken up later, the likely safe form is **retrieval over resolved-and-sanitised tickets promoted into the KB**, not raw ticket records. Converts an entitlement problem into a curation problem, which draft-and-approve already handles. |

**Why the split matters.** D61 is days of work and materially improves diagnosis and status
answering. D63 sounds similar and is not. Committing to both at once puts the cheap, high-value
feature behind the expensive, high-risk one.

### 2.10 System of record

| ID | Decision |
|---|---|
| **D77** | **The hub is the system of record for tickets unless an ITSM integration exists.** Where one exists, the ITSM is SoR and the hub reads through. |
| **D78** | **The SoR flip must be supported** — a customer running self-contained for months then connecting ServiceNow. Must not lose history, must not require reinstall or reset. Structurally the same problem as §7's standalone → joined conversion and deserves the same treatment. Currently undefined; the first customer to do it will be an escalation. Open sub-questions: migrate, orphan, or dual-read; and what happens to reports spanning the flip. |
| **D79** | **Self-contained mode requires outbound email.** With the hub as SoR there is no assignment group, no on-call rotation, no L2 queue — those came free with the ITSM. Needed: notification to an IT alias, status updates to the requester, probably inbound reply handling. **This is a third dependency** and §5's "exactly two stateful dependencies" framing needs updating rather than quietly breaking. Deliverability, bounce handling and inbound parsing are real work, and it must also exist in customer-hosted deployments. |
| **D79a** | Binary SoR is likely too coarse for real orgs (ITSM for one department; incidents routed to ITSM while low-value requests stay local). **Not built in v1**, but the schema must not foreclose it. |

### 2.11 Dashboard, reporting and deflection

| ID | Decision |
|---|---|
| **D64** | **The dashboard's differentiated content is session and deflection analytics, not ticket analytics.** Customers with an ITSM already have ticket reporting and it is a large part of what they pay for; ours will be worse. What no other tool can produce is sessions that did not become tickets. |
| **D64a** | This is reinforced by D77: session analytics are **uniform across both deployments** because that data is always ours, whereas ticket analytics are degraded (read-through, rate-limited, subject to their field customizations) exactly where the customer already has better reporting. Build the uniform half first. |
| **D65** | Dimensions: by user, by category, by time, by outcome, by risk tier of actions taken. "By outcome" and "by risk tier" are ours alone and are what an IT lead wants during a rollout. |
| **D80** | **Two views: IT-lead operational and buyer/exec ROI.** |
| **D81** | The exec view is a **renewal artifact** — exportable and schedulable (monthly PDF or email), because executives do not log into vendor tools. |
| **D82** | **Three session outcomes: resolved (user explicitly confirmed), escalated (ticket created), unresolved (everything else, including abandonment). Only confirmed-resolved counts toward deflection.** A session where the user asked, got an answer and closed the window is indistinguishable in our data from one where they gave up and walked to IT. Counting abandonment as deflection produces a bigger number and loses the room the first time a competent IT lead challenges it. Every exec-view number drills down to underlying sessions. |
| **D83** | **The agent must request end-of-session confirmation.** This is a client behaviour requirement created by D82 and is not currently written down anywhere. |

**Defining deflection is a commercial decision, not a metrics one.** D82 produces a smaller headline
figure that survives scrutiny, which is worth more than a large one that does not.

### 2.12 Internal ticket store

| ID | Decision |
|---|---|
| **D66** | **Promoted from §4 priority 3 to core.** It is the system of record for every customer without an ITSM, and §2 states that is most of them. **Resolves C4.** |

**Scope warning.** §5 rejected Zammad and Chatwoot as dependencies for sound reasons. Promoting the
internal store does not remove the requirements those products exist to satisfy — it relocates them
into our codebase where we also own the bugs. A store an IT lead will accept needs assignment and
reassignment, SLA timers on business calendars, queues and routing, email ingest with threaded
reply, attachments, audit history, search, saved views, bulk operations, and a permissions model.

**Recommendation:** define an explicit v1 subset in writing and defend it, rather than discovering
the list feature by feature. Plausible pilot subset: create, assign, state machine, comments split
by visibility (D62), attachments, search, dashboard. Everything else is a deliberate later decision.

### 2.13 Terminology

| ID | Decision |
|---|---|
| **D67** | **"Standalone" is overloaded and must be split in all documents.** §7 uses it for the endpoint deployment mode (local API key, capped R1, no hub). Later usage means the product operating without ITSM integration. These are independent axes — a fully joined fleet with no ServiceNow is hub-connected and ITSM-less. **Proposed terms: endpoint mode = standalone / joined; ITSM posture = integrated / self-contained.** Used consistently throughout this document. |

---

## 3. Open items

| ID | Item |
|---|---|
| **OPEN-1** | **User identity binding.** Device auth authenticates the machine; D36 KB entitlement and D61 ticket history need the user. If the endpoint asserts "user X is logged in," a compromised endpoint reads any user's articles and any user's tickets — the device credential does not constrain the claim. Alternatives: real user authentication (OIDC against their IdP, interactive sign-in), which damages the "already there, just works" quality of a taskbar agent; or accept the device assertion with blast radius bounded to one machine in one tenant. Matters most on shared and shift-worker machines, plausibly common at the design partner. **Not resolved by D53–D60.** |
| **OPEN-2** | **Whose AWS account** (carried from handover §15). |
| **OPEN-3** | **Retention and residency** (handover §9). Legal-adjacent, cannot be compressed by adding engineers, and D51 added a PII table to its scope. |
| **OPEN-4** | **v1 subset of the internal ticket store** (D66). Needs defending in writing before anyone starts. |

---

## 4. Conflicts

| ID | Conflict | Status |
|---|---|---|
| **C1** | §4 says the hub must not own the conversation loop; §4 also places prompt versioning on the hub; D46 places retrieval and assembly on the hub. Three statements, unreconciled. | Needs wording decision. Recommended: restate as *model proposes / endpoint validates / broker executes*. |
| **C2** | §5 commits to a Postgres `SKIP LOCKED` job queue; §6 commits to schema-per-tenant. Per-schema queues mean N pollers or one poller iterating every schema; a shared queue table reintroduces the cross-tenant surface schema-per-tenant was chosen to eliminate. No third option. | **Open. Blocks the first migration.** |
| **C3** | H1 says the signing key never lives on the hub; §4 describes signed catalog distribution as per-tenant and as the path for draft-and-approve authoring. Together these require a human to sign every customer's catalog edit offline, indefinitely. | **Open.** Probable resolution: the signed artifact is the vendor-authored primitive/playbook catalog; per-tenant approved-subset and risk policy is unsigned config enforced by the endpoint against it (H2 + H4). Not yet stated. |
| **C4** | §2 says most customers lack ServiceNow; §4 puts the internal ticket store at priority 3 behind a ServiceNow adapter built for one design partner. | **Resolved by D66.** |
| **C5** | §10 quotes RDS/NAT/endpoint rates for US East (Ohio); §11 commits to us-east-1. | **Open.** Re-price. |
| **C6** | §3 asserts hub compromise costs confidentiality, not control. | **Open.** Does not hold until H4 is ratified. |
| **C7** | §4 puts the inference proxy at priority 2; §14 says items 1–4 are the minimum that makes joined mode mean anything, and the proxy is item 6. Under D45/D46 joined mode requires it. | **Open.** Both cannot hold. |
| **C8** | §4 puts interaction history at priority 3; under D46 the hub receives conversation state every turn regardless. | **Open.** We take the data at priority 2 and call storing it priority 3. A retention question (§9), not a feature question. |

---

## 5. Values left unset

Recorded so they are not invented by whoever writes the code first.

- `N` — consecutive heartbeat failures before entering offline (D44)
- Heartbeat interval (D43)
- Access token lifetime (D54)
- Enrollment secret validity window (D74)
- Enrollment rate-limit thresholds and anomaly trigger (D76)
- Minimum telemetry set for customer-hosted support (D52c)
- Retrieval chunk budget per turn — directly drives input token cost, currently unmodelled

---

## 6. Estimate status

**The 8–14 engineer-week figure predates D35–D83 and should be rebuilt, not adjusted.**

Work now in scope and absent from that estimate:

- corpus ingestion, chunking, embedding pipeline, index maintenance (D35–D40)
- retrieval API with per-user entitlement filtering (D36)
- user identity entity, SCIM mapping, directory sync (D47–D51)
- a new PII store with its own retention obligations (D51)
- session entity and analytics store (D68, D64)
- read-through ticket query with comment-visibility filtering (D61, D62)
- dashboard and reporting, two views, export and scheduling (D80, D81)
- outbound email subsystem (D79)
- internal ticket store at whatever subset OPEN-4 defines (D66)
- second ITSM record type for catalog requests (D72a)

**The internal ticket store is the largest single addition and the most likely to be
underestimated**, because it is currently described as "~15 fields, a status machine, a list view."

**Scope observation, recorded deliberately.** Across the sessions producing D35–D83 the product moved
from "endpoint agent plus a thin hub" to "endpoint agent, hub, knowledge platform, ticketing system,
and analytics product." Each addition was individually justified. The aggregate has not been
re-estimated, and the ordering in §14 no longer reflects it.

---

## 7. Unblocked decisions

Three decisions need no research and block the first work item and the first migration:

1. **C2** — queue placement versus tenancy model.
2. **C3** — what exactly is signed.
3. **H4** — ratify or reject.

Device authentication (§2.7) was previously on this list and is now decided, subject only to
`[VERIFY]` on TPM signing latency, which affects only whether the token exchange is worth it — and
it is, even if signing turns out fast.

---

## 8. Handover v1 deltas

`2026-09-02-hub-server-side-spec-handover.md` has not been revised. Sections needing change:

| § | Change |
|---|---|
| 3 | "The seven invariants" → eight (H4). Header, count, table. |
| 3 | The claim that hub compromise costs confidentiality not control — untrue until H4 (C6). |
| 4 | **No knowledge base or retrieval component exists in the component list, priorities, or §14.** Largest single omission. |
| 4 | Identity is device-scoped only; D47 adds user identity. |
| 4 | Inference proxy priority contradicts §14 (C7). |
| 4 | Interaction history priority contradicts D46 data flow (C8). |
| 4 | "The conversation loop stays on the endpoint" needs restating (C1). |
| 4 | Internal ticket store priority 3 → core (D66). |
| 5 | Two stateful dependencies → Postgres **with pgvector** (D52a), plus outbound email (D79). |
| 5+6 | C2 unresolved. |
| 7 | KB row needs the at-rest distinction (D36, D38). |
| 7 | Three connectivity states (D42), broker-owned mode (D41), authenticated heartbeat (D43) absent. |
| 7 | "Standalone" terminology split (D67). |
| 8 | No retrieval or inference endpoints specified — D46's combined call is the highest-traffic endpoint in the system and has no surface defined. |
| 9 | D51 adds a PII table; D46a redaction placement should be explicit, not implied. |
| 10 | Re-price in us-east-1 (C5). |
| 11 | Add D37: no offline dense retrieval path at all — a capability statement, not just lock-in. |
| 13 | State pgvector in the same Postgres; hub-side only; entitlement-filtered at query time. |
| 14 | Missing retrieval/KB, user identity, session model, ticket store scope; proxy position contradicts joined-mode claim; estimate stale (§6 above). |
| 15 | Decided/open lists predate D35–D83. |
| 16 | Verification register incomplete — see §9. |

**Held up unchanged:** §2 constraints, §12 provider abstraction, and the core of §5's dependency
reasoning. §12's "the interface returns a structured proposal, not a tool call" is what makes D46
safe, and it was written before D46 existed.

---

## 9. Verification register

Nothing below has been checked against a primary source.

**ServiceNow**
- Existence, fields and inheritance of `interaction` and `interaction_related_record` (D69)
- `task` base field list and inheritance to `incident` / `change_request` / `sc_req_item` (D70)
- `opened_by` vs `caller_id` semantics for integration-filed tickets (D71)
- Whether a REST create API exists for interaction records — **load-bearing**; without it D72b is not implementable
- `comments` vs `work_notes` field names and visibility semantics (D62) — **load-bearing**
- KB read criteria: can entitlement be evaluated server-side, or must searches be proxied per-user? **These differ by a large amount of engineering work** (D36)
- Whether reading a user's own tickets needs a licensed account per end user (D61)
- Restricted ticket classes (HR, security, legal) needing explicit exclusion (D61, D63)
- SCIM 2.0 attribute paths against RFC 7643 (D48)

**AWS / Bedrock**
- Per-token pricing, us-east-1, for Haiku 4.5, Sonnet 5, Nova Lite, Titan Embeddings V2 — **the cost model rests on this and it is entirely unverified**
- Titan V2 hosted-only status (D37)
- RDS `db.t4g.micro` pricing in us-east-1 (C5)
- `max_connections` on `db.t4g.micro`, and whether it forces a pooler under schema-per-tenant
- pgvector support on RDS PostgreSQL: versions and instance-class caveats (D52a)

**Endpoint**
- TPM 2.0 signing latency via Windows platform crypto provider (D54)
- TPM 2.0 prevalence and failure modes in corporate fleets (D56)
- Corporate TLS inspection prevalence and exemption process (D55) — **strongest single argument for D55**
- EDR allowlisting guidance for a third-party privileged Windows service, and whether frequent signed-binary updates invalidate hash-based exceptions

**Standards**
- RFC numbers for private-key JWT client auth, DPoP, HTTP Message Signatures (D54) — cited from memory

**Removed:** ALB mutual-TLS behaviour and CRL handling — no longer relevant under D55.

**Outstanding from the design partner, five weeks:**
- Top-30 L1 ticket categories by volume. **Every substantive question in these sessions eventually points back at this.**
- Incident table fields as actually used, including `u_` custom fields
- `sys_user` fields as actually used, including `u_` custom fields
- Whether they use Interaction Management, and whether Virtual Agent is deployed
- Whether they run outbound TLS inspection
