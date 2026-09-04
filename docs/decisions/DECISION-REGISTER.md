# Matic Desk — Decision Register

**Version:** 2.11 — the single register. **This file owns the numbering.** (2.11, 2026-09-04: **D167–D192 and D193–D197 RATIFIED AS SETS by the founder**, so the KB architecture and the B1 control plane are settled. §5.11c keeps three caveats that ratification does not soften (D173's premise was not confirmed against KCS; D174's reranker is unretrieved; nothing is measured on our corpus). §5.12 records a correction to this file's own bookkeeping: those five cells always read *decided*, while the indexes called them *proposed*. **D152–D160 (OPEN-6) remain proposed** and §5.11c's old "ratify alongside OPEN-6" pairing is void as guidance. 2.10, 2026-09-04: **D199, D199a, D200 and D201 RATIFIED by the founder.** The embedder is decided, the pipe protocol's wire format is now a contract rather than a proposal, and D201's exception to D98 is accepted — which commits us to listing the new pipe-lifecycle calls in `BROKER-SURFACE.md` before any implementation merges. D193–D197 (B1) and D167–D192 (KB architecture) remain **proposed** and still need ratifying as sets. 2.9, 2026-09-04: **D201's blocker is measured, not reasoned — §10.5.** The DACL Windows gives a Node pipe was read off a live one, and the access check refused `GENERIC_WRITE` with ERROR_ACCESS_DENIED from an unelevated token. Reproducible: `npm.cmd run verify:pipe` from `client/`. 2.8, 2026-09-04: **D200–D201 in §5.15 — the named-pipe protocol, designed.** D200 is the wire shape (JSON Lines, the four Broker methods, D133's single strict version, `execute` with nowhere to put a proposal). **D201 is a forcing discovery: the transport we assumed cannot work** — libuv passes NULL security attributes to `CreateNamedPipeW`, so a LocalSystem-hosted Node pipe grants the unprivileged agent read and no write. It needs native pipe creation, which is a costed exception to D98. §5.15a records that a pipe DACL is not a defence against A1 and cannot be. 2.7, 2026-09-04: **D199 in §5.14 — the embedder is `snowflake-arctic-embed-m-v2.0`, proposed**, resolving the last of the Phase 1 plan's two "blocking now" items and unblocking B7; **D199a records voyage-4-nano as open-weight now and the one to revisit if its shared-embedding-space claim is verified.** §5.14a notes that both "blocking now" items were already resolvable — the embedder's gating `[VERIFY]` had been confirmed in §10.4 the day before, so the decision was waiting on nothing. 2.6, night of 2026-09-03: **D198 in §5.13** — an unrequested consent card is a cost to D130, so D165's social layer is a safety requirement and must sit ahead of the state fallback; found by using the app, not by reading it. §10.3a records the D130 renderer check, verified on a screen. 2.5, night of 2026-09-03: B1's six exit criteria run and pass — 56 assertions on PostgreSQL 17.11 — so D193's extension arrangement and **D195's limit** are confirmed against a live server rather than reasoned; §10.2 updated. 2.4, night of 2026-09-03: **D193–D197 in §5.12, from building B1** — pgvector installed once per database rather than per tenant (D193, correcting an instruction that could not be carried out), `SET LOCAL search_path` inside the transaction as the tenant-scoping choice (D194), **`search_path` is not a permission boundary and criterion 2's limit is recorded (D195)**, the job queue carries references and not payloads (D196), PostgreSQL 17 pinned (D197). 2.3, night of 2026-09-03: the KB architecture document was **found on disk** and merged — **D167–D192** in §5.11, with its void D151–D168 mapped in §5.11a and four of its citations corrected in §5.11b; **OPEN-5 closed** by the threat model, now filed at `../2026-09-03-threat-model-v1.md`; two dangling IDs in this file recorded (`D46b`, `D52a`); the cross-encoder `[VERIFY]` added to §10.2. 2.2, night of 2026-09-03: D162–D166 and OPEN-9 appended in §5.10 (D166 added from the follow-ups handover A4); D130 implemented; §10.4 verification of the handover's Task 5 lookups; the hub bake-off added to §10.3. 2.1, evening of 2026-09-03: D151–D161 and OPEN-8 appended; D132 parameter values; D133 conflict resolved; D130 design filed; D140 decided; §0 records the D130–D168 double assignment.)
**Date:** 2026-09-03
**Covers:** D1–D201, invariants H1–H6, conflicts C1–C12 and X-1–X-7, reviewer tensions R-1–R-14, open items OPEN-1 to OPEN-9, values left unset, verification register.
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

**D130–D168 were briefly double-assigned on 2026-09-03, and this file's assignment is authoritative.** Two documents written in a chat session running in parallel with this consolidation — `2026-09-03-phase0-decisions-D130-D150.md` and `2026-09-03-kb-architecture-authoring-ux.md` — numbered their own content from D130 (the first as D130–D150, the second as D151–D168). Neither was on disk when this note was written; the founder's handover `2026-09-03-claude-code-handover-register-merge.md` (in `Downloads/`) carries a summary of the first and three corrections from the second, and §5.6–§5.9 below were merged from that summary. A reader who finds either document should treat every ID in it as void: §5.6 maps the first document's IDs onto this file, and its genuinely new content is D151–D160. **The second document was found on 2026-09-03 (night)** and is filed at `../kb/2026-09-03-kb-architecture-authoring-ux.md` — not in `sources/`, because it is the live KB architecture document rather than superseded material, and its §3 was rewritten against retrieved sources when it was filed. It carries a banner stating that its own IDs are void. **Its content is merged as D167–D192 in §5.11**, which supersedes §5.9. The first document (`2026-09-03-phase0-decisions-D130-D150.md`) is still not on disk; when found it goes into `sources/` verbatim and is not cited.

**Verification status.** Every vendor claim in D42–D129 was written without web access and carries `[VERIFY]`. The 2026-09-02 review researched most of them against primary sources; §10 maps each item to its answer. Where a claim below still says `[VERIFY]`, it is still unverified.

**No endpoint performance number has been measured.** Four measurements now exist in the project (the fourth, 2026-09-03 night: the 40-case bake-off through the B0 hub reproduces the direct path case for case — §10.3): the model bake-off (one machine, 40 hand-written cases), the prompt-prefix token count (D140) and a live prompt-cache verification on `claude-sonnet-5` (D161). Everything else is a target.

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
| **D130** | **The privileged half must be able to prove the user saw the text it acts on.** In Phase 1 the consent card is drawn by the unprivileged agent and the broker mints a token for whatever proposal arrives on the pipe. Rule: *the broker executes only what the user was shown.* Cheapest honest form: the broker renders the consent text (from the signed catalog's `plain/*`) and returns it with a nonce; the approval binds to the nonce; the broker refuses any approval whose nonce does not match what it issued; the audit record stores the broker-rendered text. Strong form: a broker-owned consent window in the user's session (as UAC and credential prompts do). **Phase 1 design item, not hardening.** | **Proposed; the gap is demonstrated.** `client/test/consent-surface.test.mjs` (2026-09-03) drives it end to end against a stub `NamedPipeBroker` in a separate process on a real named pipe: `flush_dns` displayed, `reset_adapter` sent, token minted, executed, audited as a consented success — every gate and every invariant holding. The same file carries the acceptance test as three expected failures; it exits 1 the day they pass, which is the signal to promote them. Write-up: `../../client/docs/CONSENT-SURFACE-2026-09-03.md`. **Design filed 2026-09-03:** `../../client/docs/2026-09-03-consent-protocol-design.md` — a two-step protocol: `prepareConsent(proposal, {locale})` returns a nonce plus broker-rendered text; `execute(nonce)` runs the proposal the **broker retained** against that nonce, so the agent never supplies a proposal at approval time and the substitution has no surface. It changes `broker.d.ts` (`ConsentToken` stops crossing the boundary; `Gate` gains `consent`; `AuditRecord` gains `consentNonce` and `consentRendered`) and **must be settled before the `NamedPipeBroker` pipe protocol is written** — retrofitting a two-step exchange into a one-call protocol is the expensive version. Acceptance: the three XFAILs plus five checks (its §6; listed in the test file's header). **Its §8 flags that the `execute(nonce)` variant — retain the proposal, rather than the review's hash comparison — is the author's proposal and has had no second opinion**; worth one before implementation. **Implemented 2026-09-03 (night) in `InProcessBroker`** after a deliberate attack on the retain-the-proposal variant (`../../client/docs/2026-09-03-consent-protocol-attack-notes.md` — verdict: holds; two implementation requirements found, F1 clone-on-retain and F2 supersede-and-audit, plus the `precondition`/`machine-state` gate naming drift F5). The three XFAILs passed and were promoted to hard checks; the five §6 additions pass; `client/test/consent-surface.test.mjs` is 37 hard checks, 0 XFAIL. `main.js` exposes `broker:prepareConsent` and `broker:execute`; `consentAndExecute` is gone from the IPC surface and from the pipe stub. The `NamedPipeBroker` protocol can now be designed around the two-step shape. Status: **done** for the in-process build; the strong form (broker-owned window) stays deferred per design §5. | Review §1.1, B1/H3e scenario 2, C.7. D129's hub-verifies-the-hash trick solves display integrity for *egress* (a verifier exists) and cannot be reused for the four local actions (the broker is both the party that must be convinced and the party that acts). |
| **D131** | **The broker attests its posture.** The assertion the broker already signs with the device key (D61) carries **broker version, catalog hash, catalog-signature-verified flag, TPM present, key-protection level**. The hub gains a "minimum broker version" policy — narrowing, H4-legal — that disables capabilities on stale brokers instead of negotiating around them. The agent-sent heartbeat (D103) is not evidence of broker version; the agent can say anything. | Proposed | §1.2, B4, X-2. One field set, no new mechanism; it is what makes D107's telemetry and any canary ring real. |
| **D132** | **Access-token lifetime is a security parameter, not a tuning one.** Revocation latency equals it (D61 + D83a). Set it in the same decision as the heartbeat interval (D115). Sign once per session to mint a short-lived token, not per request; serialise TPM access. | Proposed; **values proposed 2026-09-03 — see the table under this section**, and §8 | X-3; A5 Q1b: TPM P50 ~200 ms / P95 ~600 ms means the exchange can run every few minutes at no cost. |
| **D133** | **Update model: one per-machine installer for both halves; the pipe carries a single protocol version and refuses a mismatch, logging the refusal to the hub.** The agent does not self-update in joined mode. The broker may be the updater: fetch the vendor-signed MSI from the origin the hub advertises (a customer-hosted hub may serve it from its own object store — no firewall exception, no contact with our origin, no hub signing anything), Authenticode-verify against a publisher pinned in the previous MSI, run `msiexec` as SYSTEM with major-upgrade semantics and `afterInstallInitialize` rollback. Customer-tooling deployment (D100) remains the first install and an opt-out for customers who insist, who accept divergence risk in writing. **Standalone mode gets the same updater**, otherwise standalone brokers never update (R-9). | **Proposed — amends D99, D101, D102, D104.** D99 is defensible for the design partner (Intune, quarterly change windows) and wrong as the product default. | B4, Part B addendum items 1 and the D99 engagement, R-9, A5 Q4. Every major endpoint agent updates itself as SYSTEM; Intune documents a flag precisely for self-updating apps; EDR allowlisting by certificate survives updates, which removes D100's allowlisting argument. |

#### D132 — proposed parameter values (2026-09-03)

D132 sets the principle and did not record the values. These come from the parallel Phase 0 document's timing table (its own D137), carried by the founder's handover of 2026-09-03 §1a. **Proposed**; §8 points here.

| Parameter | Value | Basis |
|---|---|---|
| Access token lifetime | 5 minutes | Equals revocation latency (D61 + D83a) |
| Heartbeat interval | 60 s, jittered ±15 s | Alert latency adequate for D114; jitter per D106 |
| Consecutive failures before offline (`N`, D51) | 3 | ~3 minutes; survives a transient VPN drop |
| Assertion clock-skew tolerance | ±120 s | Review B8 flagged clock tolerance as unspecified |
| Replay window | 60 s, server-supplied nonce | Mitigates the inspecting-proxy case (D146: the proxy sees the token) |

**Capacity consequence.** 5,000 devices on 5-minute tokens is ~17 token exchanges per second, each needing a device-status check. Against ~80 usable connections (D142) that lookup **must be cached in the Fargate task**, alongside the content-version vector (D114). Heartbeats at 60 s add ~83 requests per second (D115). The two are sized together, as D132 requires.

#### D133 — conflict with the parallel document, resolved 2026-09-03 in favour of D133

The Phase 0 document's D101/D102/D140–D143 shape had the agent self-updating independently, the pipe negotiating protocol versions, a mode-conditional self-update and an enrollment version-baseline check. **D133 is taken.** One installer moving both halves atomically eliminates version skew, which deletes the protocol negotiation, the enrollment baseline collision and most of what made the mode flag security-relevant. The founder's standalone self-updater, decided the same day, layers on top of D133 rather than replacing it — **D151** (§5.7).

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
| **D140** | **Prompt caching does not work on the routine model as shipped, and is not attempted.** Measured 2026-09-03 with `messages.count_tokens` (`client/eval/count-tokens.mjs`, `npm run count-tokens`): on `claude-haiku-4-5` the cacheable prefix — system prompt 319 tokens plus tools and tool-use overhead 1,784 — is **2,104 tokens** with `tool_choice: any` (2,012 with `auto`); a full shipped turn is 2,261. Haiku 4.5's minimum cacheable prefix is **4,096**, so the prefix is short by **1,992 tokens** and `cache_control` would silently do nothing. The review's 4-chars/token estimate (~2,000) was right in direction; the real ratio is 2.8 chars/token. On `claude-sonnet-5` the same prefix is above its 1,024-token floor (see `../../client/docs/TOKEN-COUNT-2026-09-03.md` for the number). **Separately: `client/src/agent/cloud-client.js` sets no `cache_control` at all, so caching is not attempted on any model today.** Options: pad the stable prefix past 4,096 (cheap in dollars: ~2,000 extra tokens written once per cache window, read at 0.1×) — but the prompt is shared with the local-model provider and the bake-off compares prompt wordings, so padding must be Anthropic-path-only and must not change model behaviour; or write caching off for Haiku and size the cost model uncached. | **Measured; decided 2026-09-03 — D161:** cache where the prefix reaches the model's floor (Sonnet-class), do not pad Haiku, revisit on volume | §1.3 row 2, A3 Q2d, verification register row "1.3, A3 lead". |
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

### 5.6 The two parallel documents of 2026-09-03 — ID mapping

Written in a chat session in parallel with this consolidation (§0), `2026-09-03-phase0-decisions-D130-D150.md` numbered its own content from D130. Its IDs are void; this table maps them. Where this file's version cites primary documentation and the chat version did not, this file's wording was kept. Merged 2026-09-03 from the summary in the founder's handover `2026-09-03-claude-code-handover-register-merge.md`, because the document itself was not on disk.

| Phase 0 document ID | Topic | In this file | Action taken |
|---|---|---|---|
| D130 | broker-rendered consent | **D130** | Same. This file's wording stands; the design is filed (see D130's status). |
| D131 | broker-attested SID | **D148** | Duplicate — chat ID discarded |
| D132 | audience-change predicate | **D137** | Duplicate — discarded |
| D133 | shared control-plane schema | **D143** | Duplicate — discarded |
| D134 | H4 + amendment | **D134** | This file's version is broader (two amendments, decides C3) — kept |
| D135 | H6 vendor floor | **D135** | Same |
| D136 | broker posture in the assertion | **D131** | Duplicate — discarded |
| D137 | timing parameters table | **D132** + the table under §5.1 | The principle was here; the values were not — added 2026-09-03 |
| D138 | phase-one hub scope | **D149** | Duplicate — discarded |
| D139 | C9 documentation fix | **D139** | Same |
| D140–D143 | self-updater: agent self-updates independently, pipe negotiates protocol versions, mode-conditional update, enrollment version baseline | conflicts with **D133** | **Resolved in favour of D133** (note under §5.1). The founder's standalone self-updater is **D151**, layered on D133 |
| D144–D150 | hub admin model | **D152–D160** | New — nothing in this file covered it (OPEN-6 was open) |

The second document, `2026-09-03-kb-architecture-authoring-ux.md`, used D151–D168. Those IDs are void too. **It has since been found and merged: the full mapping is §5.11a and the decisions are D167–D192 in §5.11c.** §5.9 is the record of what survived while it was missing.

### 5.7 D151–D160 — standalone self-updater and the hub admin model (2026-09-03)

D151 is a founder decision of 2026-09-03 (handover §1b). D152–D160 are §4 of the Phase 0 document as summarised in the handover §1c; the handover says *record*, not *ratified*, so they carry **proposed**.

> **D152–D160 ARE STILL PROPOSED, AND B1'S RATIFIED SCHEMA ALREADY IMPLEMENTS THEIR SHAPES.**
> Observed 2026-09-04 while ratifying, not looked for. `server/migrations/control/001-control-plane.sql`
> has run against a real PostgreSQL and contains: `admin_users.totp_secret` (D156);
> `admin_users.external_issuer` / `.external_subject` (D159, D160); `admin_roles`,
> `admin_role_grants` and `admin_roles.scope` (D152); `admin_audit.event_class` valued
> `break-glass` / `vendor-access` (D155, D156); `admin_audit.step_up` (D157); and
> `vendor_access_grants` with `level` and a window, plus the CHECK constraint
> `vendor_transcripts_need_a_window` (D153, D154).
>
> **This is not a defect and nothing needs undoing.** The shapes are free now and expensive later,
> which is D160's own argument, and B1 was scoped to establish shapes rather than features — none
> of those tables has logic behind it. **But ratifying B1 was not a ratification of D152–D160,
> and the built schema must not be read as evidence that it was.** That exact inference had to be
> corrected once already in §5.12.
>
> **It stops being academic at B2**, which writes logic against these tables. Decide the set before
> B2 starts, and record the answer here — a ratification note, or new IDs from D202 if anything
> changes. `../handovers/2026-09-04-claude-code-handover-b2-and-open-items.md` Task 1.
>
> §5.11c previously advised ratifying the KB set "alongside OPEN-6". The KB set was ratified
> separately on 2026-09-04, so that pairing is void as guidance and this set stands alone.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D151** | **Standalone endpoints self-update by fetching and running the one per-machine installer (D133), so both halves move together.** Joined endpoints update through customer deployment tooling (D100) and are the default. The check is at **runtime, not install time**: enrollment writes the mode state (D48, D67) and happens after install, so every fresh install is standalone and becomes joined later — one binary with a live mode check, not two install paths. The updater accepts **only an installer signed with our publisher certificate, fetched from a pinned URL**, which bounds the worst case of the mode flag being flipped on a stolen offline device to an unwanted genuine upgrade, not arbitrary code. **The path must be deliberately exercised:** if joined is the default and the design partner is joined, the self-updater never runs in the pilot and reaches production only on standalone SMBs — the customers least able to resolve an EDR false positive, and the EDR argument applies identically in standalone. Requires a test ring that runs standalone on purpose. | **Decided by the founder 2026-09-03.** Layers on D133 (still proposed) rather than replacing it; supersedes the parallel document's D101/D102/D140–D143 shape. Narrows D99's absolute ("the broker does not self-update") for standalone mode and retires §4.2's "deferred" note on an SMB broker updater. | Founder handover 2026-09-03 §1b; D133; R-9 (standalone brokers otherwise never update). Consequence: **OPEN-8** — build-pipeline integrity now blocks shipping standalone. |
| **D152** | **Five hub actors, not one:** vendor staff, tenant owner, tenant admin, IT agent/fulfiller, auditor/security. Every earlier document treats "admin" as a single role. Roles carry permissions; permissions never attach to users directly. | Proposed | Phase 0 document §4 via handover §1c; OPEN-6. |
| **D153** | **Vendor access is the highest-privilege position in the system and was previously unconstrained** — nothing in the invariants stopped a support engineer reading employee transcripts across every customer. Vendor access becomes a **time-boxed grant the customer enables**: default off, expires, visible to the tenant while active. Metadata, error state and version only; transcript content requires an explicit grant naming a window. **Self-hosted hubs default to no vendor access path at all.** | Proposed | Same source. This is OPEN-5's "vendor insider" adversary given a control. |
| **D154** | **Transcript access follows the audience-change predicate (D137). Three tiers:** aggregate metrics (any admin); transcripts of **escalated** sessions (ticket assignee, tenant admin); unescalated transcripts (nobody, including vendor staff, absent a loudly-audited break-glass event). A session that resolved without a ticket was addressed to the avatar alone; deflection metrics (D89) still count it — aggregate is not audience. **A legal exposure in jurisdictions requiring employee notice, not only a security control.** | Proposed | Same source; D137, D89. |
| **D155** | **Local accounts are v1 testing only and become break-glass:** one per tenant, TOTP mandatory, every action audited as a distinct event class, use alerts the tenant owner. If the customer's IdP is unreachable, federated login fails during exactly the incident in which someone must revoke a device (D83a). | Proposed | Same source. |
| **D156** | **TOTP and admin-action audit from day one**, even in the local-accounts phase. The console reads audit containing employee transcripts and the PII table (D58); a password alone will not survive a security review. Admin-action audit was listed as absent in review B8. | Proposed | Same source; B8, OPEN-6. |
| **D157** | **Step-up re-authentication** for fleet-wide revocation, audit export, transcript access, policy changes and IdP configuration. | Proposed | Same source. |
| **D158** | **Author ≠ approver for catalog changes, as a role constraint** enforced by the permission model — not a workflow default that can be switched off. | Proposed | Same source; draft-and-approve (D70a). |
| **D159** | **Target model: OIDC federation per tenant; the hub is a relying party, never an identity provider.** Provisioning reuses the SCIM sync already required for KB entitlement and `caller_id` resolution (D55, D145), so an admin removed from the directory loses hub access without anyone remembering to do it — the failure mode local accounts have. | Proposed | Same source; D55, D145, D148. |
| **D160** | **The schema must not foreclose federation:** external identity mapping alongside local credentials, roles first-class, vendor-access grants as records with expiry. Free now, expensive later — the same reasoning as keeping `sys_id` out of the primary key (D56). | Proposed | Same source; D56, D86a. |

### 5.8 D161 — prompt caching (2026-09-03)

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D161** | **Prompt caching is on for models whose floor the shipped prefix reaches, and off — not padded — on `claude-haiku-4-5`.** `client/src/agent/cloud-client.js` puts one `cache_control: {type: "ephemeral"}` breakpoint on the system block; tools render before system, so tools and system cache together, and the machine-state block and the user's sentence follow the breakpoint. The default is per model (`promptCacheByDefault()`): false for Haiku 4.5 (2,104 measured against a 4,096 floor), true for Sonnet 5 (2,600 against 1,024), with a constructor override. The shipped build (`config.json` → Haiku) sends the same request as before. **Verified live 2026-09-03** with `npm run verify-cache` (two real calls to `claude-sonnet-5`, same shipped turn): first call `cache_creation_input_tokens` 2,412 / `cache_read_input_tokens` 0; second call 0 / 2,412; 389 uncached input tokens each time — **86% of the 2,801-token prompt read from cache on the second call.** **Haiku is not padded to 4,096:** `prompt.js` is shared across providers as a correctness requirement of the bake-off, so padding would have to be Anthropic-path-only and inert, and the `whenNotToUse` result showed prefix text moves model behaviour — padding therefore needs a Haiku bake-off re-run to prove the score did not move. Real work and real risk against $0.0023 per turn at list price. **Revisit when volume justifies it.** Per-tenant workspaces (D138) isolate caches, so a cached prefix is written once per tenant per window, not once per fleet. | **Done 2026-09-03** (code and measurement). The pad-Haiku question is decided *no, for now*. Amends D140's "not attempted". | Founder handover 2026-09-03 Task 2; D140; `../../client/docs/TOKEN-COUNT-2026-09-03.md` §3 item 4 and §6. **Two premises of the task corrected while doing it:** (1) the client has no Sonnet escalation path — `main.js` builds one `CloudClient` on `config.model`, and the `escalate` tool hands off to a human; Haiku→Sonnet escalation lives on the hub (D53c), which is not built — so "Sonnet path only" is implemented as the per-model default above, not as a second code path; (2) **`claude-sonnet-5` rejects `temperature`** (400 "`temperature` is deprecated for this model", observed 2026-09-03), which `client/eval/run-bakeoff.mjs` pins to 0 for every model — a Sonnet 5 bake-off run needs that made conditional first. The app never sets it. |

### 5.9 The KB architecture document — what survived while it was missing (superseded by §5.11)

`2026-09-03-kb-architecture-authoring-ux.md` (its own D151–D168, all void) was not on disk when this section was written, so its decision content cannot be merged. Two things are recorded now so they are not lost:

- **D144 already decides the embedder direction.** The KB document's own "OPEN-7" framing of the embedder question (not this file's OPEN-7, which is the macOS mapping) is superseded; D144 stands.
- **Three corrections to earlier chat claims, from its §8, survive the merge:** (1) "KB authoring is a phase-one gap" was wrong — the team review document `04-TEAM-REVIEW` §7 already designs it (that document is cited by the KB document and is not on disk here); (2) "the Postgres you already have" — nothing is provisioned, consistent with `server/README.md`; (3) the product framing is *"reduces first-line volume"* (per that document's §9 A7), not *"replaces your service desk"*.

**The document was found the same night and is filed at `../kb/2026-09-03-kb-architecture-authoring-ux.md`; its decisions are merged as D167–D192 in §5.11.** This section is kept as the record of what the register held in the interval, and because both bullets above survive the merge unchanged. The `sources/` disposition anticipated here was not used, and §5.11 says why.

---

### 5.10 D162–D166 — from the first-build-steps handover and its follow-ups (2026-09-03, night)

Four things decided in chat and recorded here from `Downloads\2026-09-03-claude-code-handover-first-build-steps.md` Task 4. D164 is implemented; the other three are decided (founder) and not yet built.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D162** | **Generic KB article schema.** Fields as in `docs/kb/generic-kb-v2.json` (`schemaVersion: generic-kb/1`): `id`, `type: troubleshooting \| reference`, `title`, `category`, `platform`, `environment`, `lifecycle`, `problem`, `symptoms[]`, `keywords[]`, `guidance[]`, `escalateWhen[]`, `doNotAttempt[]`, `cause`, `body`, `provenance`, optional `scopeNote`. **`platform` is a pre-retrieval filter, not a display toggle** — an article for the wrong platform is never retrieved, so it never reaches the model's context. Lifecycle states are the KCS v6 confidence states, verified 2026-09-03 (§10.4): *Work in Progress*, *Not Validated*, *Validated*, *Archived*; v2's `unvalidated` maps to *Not Validated* and should adopt the KCS name when the schema is next revised, alongside a KCS-style five-level audience attribute (Internal / Within a Domain / Partners / Customers / Public) before any article is customer-visible. **The rule that produced the schema: an article describes the problem and what the user can do; it never describes what the bot does and never names a capability.** | Decided | Handover Task 4 §1. Forcing reason: the first six articles supplied contained "Bot resets credentials" — threat-model gap G4 (content reaching the model's context) arriving in the first content ever written. The catalog says what the bot does; the broker enforces it; the KB must not. The schema document itself (`2026-09-03-generic-kb-schema-and-findings.md`) was not on disk — `docs/kb/README.md`. |
| **D163** | **`doNotAttempt` on articles is a hypothesis, not a measured result.** Added by analogy with the `whenNotToUse` tool-description result that took R2 false actions to zero (§2b of `../../client/docs/BAKEOFF-2026-09-02.md`). It must be tested the same way — the same 40 cases (or the real ticket export), with and without the field in the retrieved context — before anyone cites it as a safety mechanism. | Proposed (hypothesis) | Handover Task 4 §2. A field that looks like a measured guard but is not one is worse than no field. |
| **D164** | **`Proposal.source` gains `"hub"`, with `hubProvider?: "local" \| "cloud" \| null` — the hub's claim, not the endpoint's knowledge.** The endpoint can attest that the sentence went to the hub; every statement past that hop is hearsay from the hub, recorded as a claim and never as a fact about the network. The renderer says so on screen; the bake-off records it per case. Implemented in `client/src/broker/broker.d.ts`, `client/src/agent/hub-client.js` (the third provider beside `CloudClient` and `OpenAICompatibleClient`, same `propose()` contract, selected by `config.provider: "hub"`), and the B0 hub in `server/`. Default provider unchanged: the demo build sends the same request it always sent. **Tier-0 never routes through the hub (D46b)** — pinned by `client/test/hub-client.test.mjs` against a hub that is not running. | **Done** (2026-09-03) | Handover Task 3/4 §3. The distinction a security review asks for is where the sentence went; a hub in the path must not blur it. |
| **D165** | **The social / tier-0 conversational layer is deterministic, not model-authored.** Greetings, capability questions and off-topic redirects are answered by templates. **Capability answers are generated from the catalog**, because a warm bot that claims a capability it lacks is worse than a curt one. Templates ship in the client or in the signed bundle — **never hub-authored (H5)**. Not yet built; recorded before anyone writes response strings, so there are not fifty inconsistent ones. **Amended 2026-09-03 by D198 (§5.13), from the first real use of the app: a greeting produced a consent card.** That makes this a safety requirement rather than a consistency one, and it fixes the ordering — the templates must be consulted **before** `routeByState()`, not after. | Decided, not built | Handover Task 4 §4. Same family as H3e: constrain what text the model is allowed to influence. |
| **D166** | **A new consent request supersedes the outstanding one; the supersession is audited.** The D130 design's rule 3 ("one outstanding `ConsentRequest` per session") did not say what a second `prepareConsent` does while one is outstanding. Two candidates: *refuse the second call*, or *supersede* — burn the outstanding nonce and write an audit record for it (`outcome: "refused"`, `gate: "consent"`, `consentRendered` = the superseded card, message says superseded). **Supersede is the decision.** Refusing would break the honest path: a user who clicks *Deny* and types another complaint inside the 120 s window would be refused, because the denied request is still outstanding and the contract has no cancel. Neither choice stops a compromised agent from painting one card and approving another (design §5 — only the broker-owned window does); supersede is the only one that keeps the honest path working *and* leaves the forensic signature of that attack in the trail: X rendered, X superseded, Y rendered, Y run, within milliseconds. Implemented in `client/src/broker/in-process-broker.js` `supersedeOutstanding()`; pinned by `client/test/consent-surface.test.mjs` §5. | **Done** (2026-09-03) | `../../client/docs/2026-09-03-consent-protocol-attack-notes.md` F2, promoted from attack notes to the register by the follow-ups handover A4: it is a decision, not an implementation detail. Amends D130's design rule 3 by specifying it. |

**OPEN-9 (code-signing certificate)** is added to §7. It blocks A6 (signed MSI), D151 (standalone self-updater) and OPEN-8 (build-pipeline integrity).

---

### 5.11 D167–D192 — the KB architecture document, found and merged (2026-09-03, night)

`2026-09-03-kb-architecture-authoring-ux.md` was supplied by the founder and **is now on disk at
`docs/kb/2026-09-03-kb-architecture-authoring-ux.md`.** §5.9 was written when it was not, and stands
as the record of what survived without it; this section replaces it as the merge.

**Its own D151–D168 remain void** (§0). The document carries a banner saying so and pointing here.
It was filed to `docs/kb/` rather than `sources/` because it is the live architecture document the KB
work will be built from, not superseded material — the founder's handover
(`docs/handovers/2026-09-03-claude-code-handover-b1-schema.md` Task 1) directs it there and asks for
§3 to be rewritten, which a `sources/` copy could not be. The banner is what keeps the void IDs from
being cited.

**Why this merge matters more than a filing exercise:** before it, the register contained **zero
occurrences of "hybrid" and zero of "review queue."** The retrieval architecture and the admin's
home surface — the two most load-bearing pieces of the KB half of the product — were recorded
nowhere, and B7 could have been built without them.

#### 5.11a Mapping — void ID to register ID

| Void ID in the document | Register ID | What it is |
|---|---|---|
| D151 | **D167** | Catalog and KB authoring are separate surfaces |
| D152 | **D168** | Auto-drafting applies to both; catalog in phase two |
| D153 | **D169** | Authoring effort is a measured metric |
| D154 | **D170** | The design target is review, not composition |
| D155 | **D171** | Articles are structured, not freeform |
| D156 | **D172** | Lifecycle states are the KCS v6 confidence states |
| D157 | **D173** | Dedup and archival are first-class operations |
| D158 | **D174** | **Hybrid retrieval** |
| D158a | **D175** | Hybrid de-risks the embedder choice |
| D159 | **D176** | Corpus size is a tenant-tier input |
| D160 | **D177** | **The admin's home surface is a review queue** |
| D160a | **D178** | Gap-driven authoring |
| D161 | **D179** | Admin search uses the agent's retrieval |
| D162 | **D180** | Preview before publish |
| D163 | **D181** | Bulk import connectors are phase-one scope |
| D164 | **D182** | Build the KB; do not adopt an open-source KB platform |
| D164a | **D183** | Take the chunking pipeline from open source |
| D165 | **D184** | Author ≠ approver for KB is a workflow default |
| D166 | **D185** | Retrieval quality is logged separately from outcome |
| D167 | **D186** | Trend is reported per category |
| D167a | **D187** | KB-specific admin metrics |
| D168 | **D188** | The end-of-session confirmation turn is load-bearing |
| *(§7 prose, unnumbered)* | **D189** | No KB browser for end users |
| *(§7 prose, unnumbered)* | **D190** | Sources are shown, as attributed chrome |
| *(§7 prose, unnumbered)* | **D191** | "That didn't work" is a first-class button |
| *(not in the document)* | **D192** | The bake-off's model ranking is inside the noise floor |

Its §6 outcome taxonomy (resolved / escalated / unresolved / suppressed, and the deflection
denominator) duplicates **D89 and D118** and is not renumbered. Its §8 corrections and its own
"OPEN-7" framing were already merged in §5.9 and are not repeated.

#### 5.11b Four citation errors in the document, and two dangling IDs in this register

The document cites register IDs and gets four of them wrong. **The register's IDs below are
authoritative; do not propagate the document's.**

| Document says | Should be | Where |
|---|---|---|
| Phasing of catalog vs KB authoring is **D138** | **D149** (endpoint stays phase one; hub-distributed privileged content becomes phase two). D138 is the cost-model rebuild. | §1 table, §1 prose |
| Author ≠ approver for the catalog is **D148** | **D158** (author ≠ approver as a role constraint), with **D70a** for draft-and-approve. D148 is the broker attesting the logged-on user. | §1 table, §5 D165 row |
| The end-of-session confirmation turn is **D83** | **D90.** D83 is enrollment rate limiting. The document used the pre-renumber ID for this one while using post-renumber IDs for D89 and D118 in the same section — the +7 renumbering half-applied. | §6 D168 row |
| Its own **OPEN-7** is the embedder question | This register's OPEN-7 is the macOS mapping. The embedder direction is **D144**. Already recorded in §5.9. | §9 |

Two further dangling IDs were found while merging, and are **not** the document's fault — they are
in this register:

- **`D46b` is cited but never defined.** "Tier-0 never routes through the hub" is cited as D46b in
  D164 and in `server/docs/2026-09-03-B0-walking-skeleton-spec.md` §4. D46 is the generic-bundle push
  decision; there is no D46b row. The behaviour is implemented and pinned by
  `client/test/hub-client.test.mjs`, so this is a missing register row, not a missing decision.
  **Do not create a D46b** — the register does not renumber or back-fill. If it needs an entry it
  takes the next free ID.
- **`D52a` is cited but does not exist anywhere in this file.** The B1 handover cites it for
  "pgvector must be enabled in the per-tenant schema template". The real citations are **D59a**
  (pgvector as a stated deployment requirement on customer-supplied Postgres) and **D143** (the
  per-tenant schema). Use those.

#### 5.11c The decisions

**RATIFIED AS A SET by the founder on 2026-09-04.** D192 was already decided from a measurement;
the rest were one session's design work, recorded so B7 would not be built without them, and they
are now settled.

**Three caveats survive ratification and are not softened by it.** **D173** (dedup and archival as
first-class operations) rests on *"findability beats volume"*, which §10.4's KCS retrieval did
**not** confirm — it is our own argument and must not be defended by citing KCS. **D174**'s
cross-encoder options, CPU viability and the `k ≈ 60` RRF convention remain unretrieved (§10.2),
and review A1 suggests the reranker may matter more to retrieval quality than the embedder does.
**Nothing in this set is measured on our corpus**, because there is no corpus — the generic KB is
eight articles.

**Not ratified, and still open: OPEN-6's own set, D152–D160** in §5.7. This section previously said
*"ratify alongside OPEN-6"*; ratification came separately, so that pairing is now void as guidance
and D152–D160 stay **proposed**.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D167** | **Catalog authoring and KB authoring are separate surfaces with separate flows.** They share a review pattern and nothing else. **Phase one builds KB authoring only.** Catalog authoring drags C3 (the signing key is not on the hub, so per-tenant authoring needs an offline signing step), H1, signing ceremonies and per-tenant key management behind it; KB authoring has none of that, because a bad KB article's blast radius is a wrong answer and a bad catalog entry's is an unwanted machine change. | **Ratified by the founder 2026-09-04** | KB document §1; D110/D111 (the signed/unsigned line is the at-rest/live line), D149 (phasing), C3. |
| **D168** | **`04-TEAM-REVIEW` §7's auto-drafting applies to both surfaces, but arrives in phase two for the catalog.** The drafting *source* differs and that is the point: catalog drafts come from observed resolution sequences, KB drafts from resolved sessions and unanswered queries (D177). | **Ratified by the founder 2026-09-04** | KB document §1. |
| **D169** | **Authoring effort is a measured product metric, not a UX aspiration.** Instrument four things: minutes per published article, drafts reviewed per session, percentage of published articles that were *drafted* rather than authored, and abandonment rate mid-authoring. | **Ratified by the founder 2026-09-04** | KB document §2. Forcing reason: `04-TEAM-REVIEW` §9 **A5** — *"that one IT person can maintain a catalog… if not, our unit economics change and we become a services business"* — and §10's stop condition *"catalog authoring stays engineer-only."* The authoring UX is the instrument that tests A5, and Q38 (the design partner's honest weekly time budget) is the number D169 has to fit inside. |
| **D170** | **The design target is review, not composition.** Every screen optimises for approving, correcting or rejecting something the system already wrote. **If the common path is a blank editor, A5 fails regardless of how good the editor is.** | **Ratified by the founder 2026-09-04** | KB document §2. |
| **D171** | **Articles are structured, not freeform.** Fields: Title, Problem, Environment, Resolution, Cause, plus metadata (owner, entitlement expression, lifecycle state, audience level, source). **Retrieval weights Title and Problem above Resolution**, because users describe problems and not fixes. KCS v6 calls the first field *Issue*; we keep `problem` — recorded as an equivalence, not churned (KB document §3.2). **`Internal Resolution` — KCS's optional field for steps hidden from external readers — is deliberately not adopted:** it would be a supported, structured place to write exactly what D162 forbids, and under D53 article text reaches the model's context where hiding is not available (G4). | **Ratified by the founder 2026-09-04** | KB document §3.2 (rewritten against KCS v6, register §10.4); D162, D53, threat model G4. |
| **D172** | **Lifecycle states are the KCS v6 confidence states, verbatim: Work in Progress (WIP) → Not Validated → Validated → Archived.** Not-Validated articles are retrievable at reduced ranking weight with a visible confidence marker, so partial knowledge is usable immediately rather than invisible until someone finds time. **Archived articles are tombstoned, not deleted** — D113 requires immediate vector removal, and the tombstone is what makes the retraction auditable. This is the schema revision D162 anticipated: `draft` → *Work in Progress*, `unvalidated` → *Not Validated*. | **Ratified by the founder 2026-09-04** | KB document §3.3; D162, D113, §10.4 (states confirmed exactly). |
| **D173** | **Deduplication and archival are first-class admin operations**, surfaced by the system rather than left to be remembered. | **Ratified by the founder 2026-09-04** | KB document §3.7. **Rests on an unverified premise** — that a large unmaintained KB retrieves worse than a small curated one was *not* confirmed against KCS. Cheap enough to do on the argument alone; do not defend it by citing KCS. |
| **D174** | **Hybrid retrieval: pgvector semantic leg + Postgres full-text (`tsvector` + GIN) lexical leg, fused by Reciprocal Rank Fusion, then cross-encoder reranked; 3–5 chunks reach the model.** Each leg returns its top ~50; fused score is the sum of `1/(k + rank)` with **k ≈ 60**, chosen because it needs no score normalisation — BM25 rank 3 and vector rank 3 contribute identically, so incomparable score scales never have to be reconciled. The fused top ~20 is reranked by a cross-encoder scoring query-document pairs directly. **Hybrid is a requirement, not a refinement:** IT knowledge is unusually dense in exactly the tokens semantic search breaks on — error codes, patch numbers, registry paths, product names. `KB5034441` and `KB5034442` embed almost identically because they *mean* the same thing while one is the fix and the other is not; conversely no lexical method connects "printer won't print" to "Spooler service failure", which shares no words. Both indexes live in the Postgres already committed to (D59a, D143), so this adds no dependency, and D47 already requires lexical search for the offline generic bundle — the lexical half is built regardless. | **Ratified by the founder 2026-09-04** | KB document §4; review A1. **`[VERIFY]` cross-encoder model options and CPU viability on Fargate-class hardware remain unretrieved** — added to §10.2. The `k ≈ 60` convention is also unconfirmed. |
| **D175** | **Hybrid retrieval de-risks the embedder choice: the embedder is a schema decision, not a foundation.** Combined with review A1's finding that re-embedding 10,000 articles costs under \$3, the hub spec §11 characterisation of the embedder as *"the least reversible decision in the system"* does not survive the number. D144 already sets the direction and stands. | **Ratified by the founder 2026-09-04** | KB document §4; D144, review A1. Superseded framing noted in §5.9. |
| **D176** | **Corpus size is a tenant-tier input.** A `db.t4g.micro` running HNSW plus GIN plus the ticket store plus the job queue is a pilot instance, not a 100,000-article one — HNSW wants its index resident and that instance has 1 GB. Per-tenant indexes (D133, D143) mean the binding constraint is **the largest single corpus, not the sum**. This is vertical scaling, not redesign, **but it must reach the pricing model rather than be discovered in production.** | **Ratified by the founder 2026-09-04** | KB document §3.7/§4. §10.1 already records the retrieved figure (pgvector 0.8.2 on PG 15–18, 2,000-dim index limit, micro holds one ~25k-chunk tenant); the residency claim itself is reasoning, not measurement. |
| **D177** | **The admin's home surface is a review queue, not an article list.** Four feeds, in value order: (1) **drafts from resolved sessions** — the agent resolved something with steps in no article; (2) **KB gaps** — queries that retrieved nothing above threshold, or where the user escalated immediately after an answer; (3) **staleness** — articles whose retrieval leads to escalation more often than resolution; (4) **duplicates**. **Each item opens pre-filled with a one-click approve.** | **Ratified by the founder 2026-09-04** | KB document §5.1. This is the decision D170 exists to serve, and the one the register was missing entirely. |
| **D178** | **Gap-driven authoring is the highest-value output of the whole system to a knowledge owner, and it costs nothing extra** — the queries are already logged. It also answers **Q39** directly: for line-of-business applications we cannot author content for, we can at least tell the customer exactly what is missing. The gap queue pre-fills the new article's `symptoms` from the unanswered query that created it. | **Ratified by the founder 2026-09-04** | KB document §5.1; `docs/kb/2026-09-03-generic-kb-schema-and-findings.md` §5. |
| **D179** | **Admin search runs the same hybrid retrieval pipeline the agent uses, showing retrieval rank and score.** Findability becomes diagnosable by the person who can fix it: **if the admin cannot find it, neither can the bot.** Free — the pipeline already exists. | **Ratified by the founder 2026-09-04** | KB document §5.2. |
| **D180** | **Every article edit offers a preview: the retrieval result and the model's answer with the edit applied, before publishing.** D108 means an edit is live on the next query with no distribution step — a feature, and the reason test-before-ship for content matters. | **Ratified by the founder 2026-09-04** | KB document §5.2; D108. |
| **D181** | **Bulk import connectors are phase-one scope** (Confluence, SharePoint, ServiceNow KB, generic Markdown/HTML). Customers have existing content; requiring re-authoring is a non-starter. **Chunk on semantic boundaries, not fixed character counts** — chunking quality affects retrieval more than embedder choice. | **Ratified by the founder 2026-09-04** | KB document §5.2. |
| **D182** | **Build the KB; do not adopt an open-source KB platform.** Wiki.js, Outline, BookStack and similar are human authoring-and-reading tools — WYSIWYG editors, page hierarchies, web readers. Three mismatches: they do not model D44's per-user entitlement filtering; they ship human full-text search, not hybrid retrieval with reranking for a model; and each is a full application with its own database, auth and upgrade path — **a second thing to install and patch in a customer-hosted deployment, which is the reason Zammad was rejected.** What is actually needed is small: articles, chunks with vectors and tsvectors, an entitlement expression, versions with tombstones, a query endpoint. **Import from them; do not run them.** | **Ratified by the founder 2026-09-04** | KB document §5.2; D44, D59a. |
| **D183** | **Take the chunking pipeline from open source.** Semantic-boundary splitting is solved under permissive licences. Do not reimplement it. | **Ratified by the founder 2026-09-04** | KB document §5.2. |
| **D184** | **Author ≠ approver for the KB is a workflow default, not an integrity control, and is tenant-configurable.** Contrast **D158**, where it is a role constraint enforced by the permission model for catalog changes. The KB blast radius is a wrong answer, and A5's target customer is a two-person IT team that cannot enforce separation of duties. | **Ratified by the founder 2026-09-04** | KB document §5.2; D158, D70a, A5. |
| **D185** | **Retrieval quality is logged separately from session outcome.** Which chunks were retrieved with their scores, which the model used, and the outcome — as distinct records. **This distinguishes a retrieval miss from a reasoning miss, which have entirely different fixes**, and it is what feeds D177's queue. | **Ratified by the founder 2026-09-04** | KB document §6. |
| **D186** | **Trend is reported per category, never only in aggregate.** Rising aggregate deflection can conceal a category getting worse. The Q1 ticket-category export is the measurement baseline as well as the scoping input. | **Ratified by the founder 2026-09-04** | KB document §6; D89, D118. |
| **D187** | **KB-specific metrics for the admin:** articles by lifecycle state; retrieval hit rate; **articles never retrieved** (deletion candidates); **articles retrieved often but followed by escalation** (repair candidates); time-to-publish on queue items. | **Ratified by the founder 2026-09-04** | KB document §6. |
| **D188** | **D90 — the agent explicitly asking "did that fix it?" at session end — is load-bearing and must not be dropped as UI polish.** Without that turn there is no `resolved` category and **the entire deflection metric does not exist.** It is a client behaviour requirement generated by an analytics decision, which is exactly the kind of requirement that gets cut. | **Ratified by the founder 2026-09-04** | KB document §6 (which cites it as D83 — the pre-renumber ID; see §5.11b). D89, D90, D118. |
| **D189** | **No KB browser for end users.** A search box invites keyword-guessing, which is the interaction hybrid retrieval exists to remove: the user describes the problem in their own words and retrieval is the agent's job. A browsable KB would be building the self-service portal this product exists to replace. | **Ratified by the founder 2026-09-04** | KB document §7 (prose, previously unnumbered); D120 stands — Chat, My Tickets, Notices, Status. |
| **D190** | **Sources are shown, not hidden.** When an answer comes from an article, name it and let the user open it — trust-building, and how users learn the KB exists. **Under H5 it must be attributed chrome, not the avatar's own voice.** | **Ratified by the founder 2026-09-04** | KB document §7; H5. |
| **D191** | **"That didn't work" is a first-class button, not a phrasing the user has to find.** It is the signal that populates D177's repair feed, and the same turn carries D90's confirmation. | **Ratified by the founder 2026-09-04** | KB document §7; D90, D177. |
| **D192** | **The bake-off's accuracy ranking between the top three models is not established, and no external claim may be made from single runs.** Observed run-to-run variance on one model at `temperature: 0` between Ollama sessions is **2 cases out of 40** (§10.3: `net-09` and `prn-03` moved identically on both the direct and hub paths), while the post-hardening bake-off separates the top three by **1** — mistral 35, Haiku 36, gemma 37, one run each. **Those numbers are inside the noise floor.** Any comparative model claim needs **3–5 runs per model** first: machine time, not engineering time. **D97's safety conclusion is unaffected** — zero false actions reaching the user came from catalog preconditions and is model-independent. | **Decided** (measurement-derived, 2026-09-03 night) | `server/docs/2026-09-03-B0-walking-skeleton-spec.md` status block; §10.3; `../../client/docs/BAKEOFF-2026-09-02.md` §2b, §2c. Requested as a register entry by the B1 handover Task 1b. **This directly qualifies D139**, whose ``Haiku 36/40 to mistral 35/40`` comparison is a 1-case gap measured once per model; D139 remains the right pick on cost and latency (D97), which is not what is in question. |

#### 5.11d What the document changed about its own §3

§3 was written from memory about Knowledge-Centered Service because the session had no external
access. It has been **rewritten in place** against the KCS v6 findings recorded in §10.4, and every
claim is now labelled confirmed, inference or still unverified. Three things came out of that:

- **Article structure and confidence states are confirmed**, and the field is *Issue* where we say
  `problem` — an equivalence, deliberately not renamed (D171).
- **KCS's audience attribute is five levels** (Internal, Within a Domain, Partners, Customers,
  Public), which the from-memory §3 did not mention at all. It is **a different axis from D44
  entitlement filtering** and both are needed; D162 already carries the requirement that it exist
  before any article is customer-visible.
- **"Findability beats volume" was not confirmed** and D173 rests on it. Recorded as our own
  argument, not as practice.

---

### 5.12 D193–D197 — from building B1 (2026-09-03, night)

**RATIFIED AS A SET by the founder on 2026-09-04.**

**A correction to this register's own bookkeeping, made while ratifying.** These five cells have
read *"Decided"* since they were written, because each was a decision taken under D143's authority
while building — but `CLAUDE.md` and `PROJECT_START_HERE.md` described them as *"still proposed"*.
Both were wrong, in the safer direction. The distinction that actually mattered is the one the
founder has now closed: **an engineering decision taken while building is not a founder
ratification**, and B1 running green was never evidence of one. D197 was the exception — it was a
founder decision from the start.

Five decisions forced by implementing D143's control plane. Details and the exit-criteria status:
`../../server/docs/B1-CONTROL-PLANE.md`. **B1's schema is built and run:** 43 source-level rules pass in `npm test` with no database, and
the **six exit criteria pass — 56 assertions on PostgreSQL 17.11 with pgvector** (`npm.cmd run
test:db`), against a fresh database, a reused one, and a destroyed-and-rebuilt volume. Running it
found one bug, in the test fixture rather than the schema; **no migration SQL needed a correction.**
§10.3 gains no measurement from this work and none is claimed — passing functional tests is not a
performance number.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D193** | **pgvector is installed ONCE per database, into a shared `extensions` schema that sits on every tenant's `search_path` — not into each per-tenant schema.** *(Verified in place 2026-09-03: `db.test.mjs` §0 confirms exactly one `vector` extension, in `extensions`, and §7 confirms a tenant transaction resolves the type and its operators unqualified.)* The plan of record could not be carried out: **a PostgreSQL extension is installed into a *database* and its objects live in exactly one schema**, so `CREATE EXTENSION vector` in a per-tenant template succeeds for the first tenant and fails for the second. The intent is met exactly — a tenant table declares `vector(768)` unqualified and no tenant needs a further migration before it can hold vectors — and there is one extension to upgrade instead of N. Per-tenant HNSW indexes still live in the tenant's own schema, so D176's "the constraint is the largest single corpus, not the sum" is unaffected. Implemented in `server/migrations/control/001-control-plane.sql`; `server/test/db-static.test.mjs` §3 fails if any tenant migration ever contains `CREATE EXTENSION`. | **Decided and built**; exit criteria pass 2026-09-03; **ratified by the founder 2026-09-04** | B1 handover Task 3, which asked for pgvector "in the per-tenant schema template" and cited **`D52a`, an ID that does not exist in this register** (§5.11b; the real citations are D59a and D143). Two defects in one line, and the technical one would have failed on the second tenant. |
| **D194** | **Tenant scoping is `SET LOCAL search_path` inside a transaction owned by `withTenant()`, not schema-qualification of every query.** The handover required a choice between the two and said mixing them is how cross-tenant leaks happen. **The deciding reason is the migration path:** exit criteria 3 and 4 require the same tenant migration file to run unchanged against every tenant schema, which is impossible if every statement names its schema. `SET LOCAL` is transaction-scoped and reverts at COMMIT or ROLLBACK, so a pooled connection carries no path onward — the failure mode that makes setting `search_path` on checkout unsafe. **Enforced structurally rather than by convention: there is no function anywhere that returns a connection already pointed at a tenant.** `withTenant()` is the only door and it owns the transaction; `db-static.test.mjs` §5 fails if a `getTenantClient`-shaped export ever appears, if the pool sets `options: '-c search_path=…'`, or if `SET` is used where `SET LOCAL` is meant. Neither the tenant path nor the control path includes `public`, so an unqualified name that is not where it should be is an error rather than an accidental read of something shared. | **Decided and built**; exit criteria pass 2026-09-03; **ratified by the founder 2026-09-04** | B1 handover Task 3, "pick one and enforce it". D143. |
| **D195** | **`search_path` is a name-resolution mechanism, not a permission boundary. Exit criterion 2 therefore holds against accidental cross-tenant access and NOT against deliberate access, and that limit is recorded rather than papered over.** *(Confirmed against a live PostgreSQL 17.11 on 2026-09-03, not reasoned: inside `withTenant(A)` an unqualified count returns A's 1 row, and a schema-qualified count of B's table returns B's 2. Both are passing assertions in `db.test.mjs` §2.)* Inside `withTenant(A)`, an unqualified query sees only A's rows — but a **schema-qualified** `SELECT … FROM <B>.sessions` reads B's rows, because the application role owns every schema. `server/test/db.test.mjs` §2 asserts **both halves**, the second as a deliberately passing test labelled a known limit, so that nobody reads the criterion as a stronger guarantee than it is. Making it a real boundary means **a database role per tenant** with `REVOKE USAGE ON SCHEMA` for the others — which collides with the ~80-connection ceiling, since a pool per role reintroduces the arithmetic that killed per-tenant pollers. **That is a pooling decision, not a schema decision, and it is deferred.** Row-level security does not apply as things stand: RLS gates rows inside a shared table, and D143 separates tenants by schema. Until then the guarantee rests on `withTenant()` being the only door, which is why that is asserted in the dependency-free suite rather than left to code review. | **Decided** (the limit is accepted for B1; the fix is deferred); **ratified by the founder 2026-09-04** | Found while writing criterion 2's test. **A security review will ask this question, and the answer must be the table in `server/docs/B1-CONTROL-PLANE.md` §6, not a claim of isolation.** Belongs against threat model A3 (malicious tenant admin) and A4 (compromised hub): a compromised hub process already has the application role, so this changes nothing for A4 — it matters for a hub-side code defect, which is the accident case, and that is the case it does cover. |
| **D196** | **`control.job_queue` carries references, never payloads: job id, type, tenant schema, reference id, and no `payload` column or `jsonb` of any kind.** It is the one deliberately cross-tenant table, because per-tenant queues need per-tenant pollers and the connection arithmetic forbids them — so it holds as little as possible. A bug that leaks a job row then leaks a schema name and a uuid; the same bug with a payload column leaks customer data out of the only table that is not tenant-scoped. `enqueue()` has no parameter for one, the table has no column for one, and `db-static.test.mjs` §4 fails if either appears. Two consequences: **`tenant_schema` is a foreign key to `control.tenants(schema_name)`**, so a job cannot name a schema that does not exist and the worker's assertion has something real to assert against; and **`fail()` truncates the error to 500 characters**, because an error string is the most likely accidental route for customer data into this table. Claiming is `FOR UPDATE SKIP LOCKED`, so a second worker steps over a locked row rather than blocking, and one job reaches exactly one worker. | **Decided and built**; exit criteria pass 2026-09-03; **ratified by the founder 2026-09-04** | B1 handover Task 3's four "things to get right", none of which had a register row. D143. |
| **D197** | **PostgreSQL 17 is the RDS major, and the development container is pinned to it.** pgvector 0.8.2 covers PG 15–18 (§10.1) and 17 is the current RDS default track. `server/docker-compose.yml` pins `pgvector/pgvector:pg17`, binds loopback-only on **port 5433** so a real local Postgres cannot be connected to by accident, and caps `max_connections=80` — the `db.t4g.micro` figure that killed per-tenant pollers — so connection exhaustion surfaces on a laptop rather than in the pilot. | **Decided** (founder, 2026-09-03); **ratified by the founder 2026-09-04** | B1 handover Task 3 asked for a pin and attached a `[VERIFY]` on pgvector's supported versions on RDS. **That `[VERIFY]` was already answered in §10.1** — 0.8.2 on PG 15–18, HNSW, 2,000-dimension index limit, micro holds roughly one 25,000-chunk tenant — and no lookup was needed. |

---

### 5.13 D198 — from the first real use of the app (2026-09-03, night)

One decision, forced by an observation rather than by a document. The founder used the app during
the D130 renderer check and typed a greeting. **It answered with a consent card.**

#### What was observed

With a DHCP fault injected — so the machine was offline and the cloud unreachable — the founder
typed *"Hello how are you?"* and got:

> `source: tier0-state (from machine state alone - nothing matched what was typed, and the cloud was unreachable)`
>
> "I didn't catch which part is failing, so I looked at the machine itself. Intel(R) Ethernet
> Controller (2) I225-V has fallen back to a self-assigned address, 169.254.17.252, which means the
> network never gave it a real one. I can renew the lease."
>
> **PERMISSION NEEDED — LOW RISK** … `renew_dhcp(adapterIndex=4)`

**Every mechanism worked exactly as designed.** `routeByState()` is reached only when tier-0 matched
nothing *and* the cloud was unreachable; `client/src/agent/agent.js` is its only caller and says why
("a proposal made without reading the sentence must never run ahead of a model that could have read
it"); the reply opens by admitting it did not understand; the renderer labelled the provenance
honestly; and the consent gate held. Nothing here is a defect in D130, D46 or the router.

**The gap is that nothing classifies the input as social before the state fallback runs.** A
greeting and an inarticulate complaint are treated identically, because the fallback does not read
the sentence at all — which also means it returns the *same* proposal whatever is typed, for as long
as the machine has a visible fault.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D198** | **An unrequested consent card is a cost to D130, not a cosmetic wart — so the social layer (D165) is a safety requirement and not polish, and it must sit AHEAD of the state fallback.** Two parts. **(a) The ordering is load-bearing.** D165's templates must be consulted *before* `routeByState()`, not after: a social classifier added downstream of the fallback leaves this behaviour exactly as observed, and downstream is where it would naturally be written, because the fallback is already the last resort. `client/src/agent/agent.js` is the only caller of `routeByState()`, which is what makes the constraint enforceable in one place. **(b) The reason it matters is habituation.** D130 makes the consent card the thing a user reads before their machine changes; every card offered in response to something the user did not ask for teaches them the card is noise to click past. The mechanism stays intact and the guarantee gets weaker, which is the failure mode no test can catch — `consent-surface.test.mjs` will pass on the day the card has become furniture. **A card the user did not provoke is therefore a defect, even when every gate behaved correctly.** What replaces it is a template answer plus, at most, an *observation* — "while you're here: this machine has no network address, want me to look at that?" — a question, not a proposal, and no card until the user says yes. | **Decided 2026-09-03**, from an observed instance. Not built; D165 is not built either and this is a constraint on how it gets built. | First real use of the app, during the D130 renderer check. **Amends D165**, which argued the social layer on consistency grounds ("so there are not fifty inconsistent ones") — a tone argument. This is the safety argument, and it did not exist in this file: the register contains no other mention of habituation or consent fatigue. Related: D130 (the card), D191 ("that didn't work" as a first-class button — the same instinct, that the user's actual intent should have somewhere to go), H5. |

#### Worth noting about how it was found

**The observation cost nothing and was not looked for.** It appeared within a minute of the first
person using the software for a purpose unrelated to it — the renderer check — and it is the kind of
thing no test would have produced, because a test would have typed a complaint. That is the working
rule in `CLAUDE.md` ("bugs are found by using the software, not reading it") paying for itself, and
it is an argument for the founder running the demo scenarios more often than the three rehearsed
ones.

---

### 5.14 D199 — the embedder (2026-09-04)

Resolves the model D144 left unpicked, which the Phase 1 plan §5 lists as the last of its two
"blocking now" items. Full reasoning and every retrieved figure:
`../2026-09-04-embedder-decision.md`. **Proposed — the founder ratifies.**

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D199** | **The embedder is `Snowflake/snowflake-arctic-embed-m-v2.0`.** Apache-2.0; **305M parameters** (113M non-embedding); **768 dimensions** natively with Matryoshka truncation trained for 256 (retaining ~99% of MTEB-R at 256, per the publisher); 8,192-token context; multilingual (its publisher says 74 languages in the blog and 101 in the card metadata — do not quote a number); and named in Hugging Face's TEI supported-models table as model type Alibaba GTE, which is the deployment mechanism D144 already specified. **The deciding reason is not the benchmark — it is that this choice removes Q35 from the critical path.** D144's shortlist splits on multilingual support and Q35 is open; an English-only pick bets on an unanswered question, and waiting for Q35 leaves B7 blocked on something we do not control. Arctic is multilingual *and* English-competitive, so it is defensible under either answer. **Cost of being wrong is bounded and known: re-embedding 10,000 articles is under \$3 (D175).** Rejected, with reasons: **Qwen3-Embedding-0.6B** is the quality pick at MTEB rank 4 against arctic's 41, but 509M–600M parameters on 1–2 vCPU with **no latency measurement in existence** (§10.2) is the wrong risk for an interactive surface, and it is instruction-tuned, which adds a prompt surface to a component whose job is to be boring — it is the documented upgrade if measurement shows headroom. **nomic-embed-text-v1.5** is 137M and would be right if Q35 came back English-only, but its card is explicit that it is **English-only**. **gte-large-en-v1.5** is English and larger than arctic for no offsetting gain. **D174's hybrid retrieval lowers the stakes throughout**: the lexical leg carries the error codes and patch numbers, so the dense leg only has to connect "printer won't print" to "Spooler service failure" — a rank-41 model doing semantic work behind a cross-encoder reranker is not the same proposition as a rank-41 model being the whole pipeline. | **Decided by the founder 2026-09-04.** Unblocks B7. **Ratified without a measurement on our corpus, deliberately** — there is no corpus to measure on (the generic KB is eight articles), and D175 bounds the cost of being wrong at under \$3 per 10,000 articles. The reasons to revisit are written into the decision document §5 and are unchanged by ratification. | D144 (direction and shortlist), D175 (the embedder is a schema decision, not a foundation), D174, §10.1 (pgvector's 2,000-dimension HNSW limit), §10.2, Q35. Forcing reason: it is the last "blocking now" item in `../2026-09-03-phase1-plan.md` §5, and both of that section's gating `[VERIFY]`s are now resolved — so the decision was being deferred against nothing. |
| **D199a** | **voyage-4-nano is the one to revisit, and only if its shared-embedding-space claim is verified.** It is no longer hosted-only: **open-weight under Apache-2.0**, on Hugging Face, and in TEI's supported table (340M, model type Qwen3). Voyage claims all four Voyage 4 models produce interchangeable embeddings and that query encoders can be upgraded *"without re-vectorizing documents"*. **If true, it is the only candidate that satisfies D144's migration constraint by construction** rather than by running one model everywhere — nano self-hosted for customer-hosted tenants, the same vectors queried by a stronger hosted model in managed mode. Three reasons it is not the pick: the claim is **the vendor's own** and stays `[VERIFY]` in §10.2 (this research corroborates that Voyage *says* it, which is not that it is true); the upgrade is **asymmetric and query-side** — documents are vectorised once, so it is a better query encoder and not a free migration in both directions; and its **headline 2,048 dimensions exceed pgvector's 2,000-dimension HNSW limit** (§10.1), so it would run truncated to 1024 and the configuration that sells the model is not the one we could index. **The experiment that would settle it is about an hour:** embed a corpus with nano, query it with hosted voyage-4, measure whether retrieval holds. | **Decided by the founder 2026-09-04 as a standing revisit trigger — NOT a decision to adopt voyage-4-nano.** What is ratified is that the shared-embedding-space claim is worth an hour to test, and that a positive result reopens the embedder choice; the model itself is not chosen and remains `[VERIFY]` in §10.2. | Found while researching D199. It changes the *managed-versus-self-hosted story* rather than a score, which is why it is recorded rather than dismissed. |

#### 5.14a Both of the Phase 1 plan's "blocking now" items are now resolved

`../2026-09-03-phase1-plan.md` §5 lists two. **Neither is still blocking, and one had already been
answered before this session:**

- **The embedder** — D199 above. Its stated gating unknown, *"`[VERIFY]` on ONNX Runtime on
  ARM/Graviton — the one item that could change the pick outright"*, was **already confirmed in
  §10.4** on 2026-09-03. Researching D199 closed it a second way: **TEI publishes an `aarch64` CPU
  image** (`cpu-arm64-1.9`) and documents ARM64 as supported for CPU-only workloads. Two independent
  mechanisms, not one. **The decision had been waiting on nothing.**
- **The WTS APIs `[VERIFY]`** for A4 — **confirmed in §10.4** on 2026-09-03, with the correction that
  the SID comes from `GetTokenInformation(TokenUser)` on the token rather than from any
  `WTS_INFO_CLASS`. **Loose end: the handover answers say D148's wording should name the token → SID
  step and that this was "noted on OPEN-1". OPEN-1's row does not carry that note.** Not fixed here,
  because the register does not silently rewrite a decision's text — it needs the founder's call on
  whether D148 is amended or OPEN-1 annotated.

**What remains from the plan's §9 first week:** the Anthropic Scale-tier clock and the EDR
conversation (item 5, external lead time), and the top-30 ticket categories (item 6, which blocks
evaluating Phase 1 rather than building it).

---

### 5.15 D200–D201 — the named-pipe protocol (2026-09-04)

Designed, not built. Full design, with the primary sources for every claim below:
`../../client/docs/2026-09-04-named-pipe-protocol-design.md`. **Proposed.**

Unblocked by D130 being **verified on a screen** (§10.3a) — the renderer contract this serialises has
now been looked at, which was the stated precondition for freezing it into a wire format.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D200** | **The pipe protocol is JSON Lines over a Windows named pipe, carrying the four `Broker` methods and nothing else.** `listCapabilities`, `validate`, `prepareConsent`, `execute` — the interface in `client/src/broker/broker.d.ts` verbatim, because its whole purpose is that call sites do not change when `InProcessBroker` becomes `NamedPipeBroker`. Request `{v, id, method, params}`, reply `{v, id, result\|error}`, correlated by `id`, replies allowed out of order (an `execute` took 3,064 ms in the real audit trail and must not block a `listCapabilities`). **`execute` takes a nonce and the schema has nowhere to put a proposal** — that is D130 on the wire, and adding a parameter to `execute` re-opens the finding this whole design answers. Byte-mode pipe, so readers buffer and split on `\n`. Limits, all enforced broker-side and all audited: **64 KiB per line** (over-length closes the connection rather than resynchronising a stream whose framing is lost), **8 in-flight requests per connection**, **15-minute idle timeout**, and **deliberately no request timeout** — the consent window is the timeout that matters and the broker already owns it; a request timeout would race a real machine change. **Versioning is D133 exactly: one integer, strict equality, no negotiation.** One installer moves both halves atomically, so skew is not a state the system should reach; a mismatch means a partial upgrade or something impersonating a half, and the answer is to stop loudly and tell the hub, not to find a common subset. **Do not add negotiation later** — it re-introduces the skew D133 deleted and lets an attacker pick the version. Closed error-code set with `consent` refusals explicitly **not** auto-retried by the agent (a silent re-prepare is how an unprovoked second card appears — D198). **One outstanding `ConsentRequest` per CONNECTION, not per process** — per-process would let a second user's card supersede the first user's, a cross-user defect wearing D166's clothing, and it is flagged in the design as the most likely implementation bug. | **Decided by the founder 2026-09-04.** Designed, **nothing built** — ratification settles the shape, not the schedule. The wire format is now the contract: `execute` takes a nonce and has nowhere to put a proposal, and changing that needs a new decision, not a patch. | `CLAUDE.md` carried "the pipe protocol has not been designed yet"; D130 verified on screen removed the reason to wait. The shape is already proven between real processes on a real pipe by `client/test/helpers/pipe-broker-service.mjs`, whose `__`-prefixed introspection methods are test-only and must not exist in the service. |
| **D201** | **The broker hosts the pipe and creates it with an explicit security descriptor, which needs native calls Node cannot make — and this is a deliberate, costed exception to D98.** **The forcing discovery: the transport we assumed cannot work.** libuv passes `NULL` as `lpSecurityAttributes` to `CreateNamedPipeW`, and Microsoft documents that the resulting default DACL grants full control to LocalSystem, administrators and creator-owner but only **read** access to Everyone — so a pipe the LocalSystem broker creates through `node:net` gives the unprivileged agent **read and no write. The agent could connect and never speak.** libuv also omits `PIPE_REJECT_REMOTE_CLIENTS`, leaving a pre-authentication surface on a privileged service. Node offers no API to fix either (nodejs/node#30823, closed `wontfix`). **The DACL:** LocalSystem and Administrators full control; **the interactive user's LOGON SID** granted `FILE_READ_DATA \| FILE_WRITE_DATA \| SYNCHRONIZE` — **never `FILE_GENERIC_WRITE`**, because Microsoft's own note is that `FILE_APPEND_DATA` and `FILE_CREATE_PIPE_INSTANCE` are the same bit, so `FILE_GENERIC_WRITE` would hand the agent **the right to create instances of the broker's own pipe name**, turning an IPC client into an impersonation primitive. Logon SID rather than user SID on Microsoft's explicit guidance for keeping other terminal-services sessions and remote users out — **and it is the same value D148 already reads to attest the user.** Plus `PIPE_REJECT_REMOTE_CLIENTS` and `FILE_FLAG_FIRST_PIPE_INSTANCE`: the broker is a service that starts at boot, before any user session, so it wins the race for the name, and the flag turns losing that race into a loud startup failure instead of a silent compromise. **Rejected alternatives, with reasons:** hardening the DACL after Node creates the pipe (Node does not expose the HANDLE, and the pipe would exist with the wrong DACL for a window — a race in the security of the privileged channel is not a saving); and **inverting it so the agent hosts** (no native code at all, and tempting for that reason, but the pipe namespace is machine-global, so a name the user creates can be squatted by another user's process before the target logs in). **The cost is real and is not hidden: this expands `BROKER-SURFACE.md`, the document EDR allowlisting depends on, which D98 exists to keep small.** The argument for paying it is that the privileged half must have some channel, this is the smallest correct one, and the alternative is not a smaller surface but a wrong DACL — and the calls are pipe-lifecycle only, made once at service start, not growing with the catalog and not reachable by any proposal, which is the property D98 actually protects. | **Decided by the founder 2026-09-04.** Amends D98 by exception, with the exception scoped and argued. **The forcing claim is MEASURED, not reasoned — §10.5.** Ratifying this accepts a named growth of `BROKER-SURFACE.md`, which is what a customer's EDR team reads: the pipe-lifecycle calls must be listed there **before** any implementation merges (design §8 item 9). Still open, and not settled by ratification: the last mile of §10.5 (a real LocalSystem service with a real standard-user agent) and the choice of koffi vs an N-API addon vs a signed helper. | Found while designing D200, from libuv's source and Microsoft's documentation (design §10). `[VERIFY]` **the blocker is retrieved, not measured** — nobody has stood up a LocalSystem service and watched a standard user's write fail. That experiment is minutes and **if the write somehow succeeds, most of D201 is unnecessary**; it should happen before any engineering does. Also unchosen: koffi vs an N-API addon vs a small signed helper, which interacts with D147's `%ProgramFiles%` and separate-DLL requirements. |

#### 5.15a The uncomfortable half, recorded so nobody believes otherwise

**The pipe's DACL is not a defence against threat-model A1, and cannot be.** A1 is user-context
malware; it runs as the user, so it is inside the DACL by construction. Anything running as that
user can open the pipe, obtain a nonce and approve it, and no peer check fixes that — verifying the
client's image path or signature is defeated by injection into the real signed agent, and would
manufacture the appearance of a boundary that is not there.

**What the DACL actually buys:** other users on the same machine cannot reach the channel, remote
callers cannot reach it, and the name cannot be squatted. Those are real threats (A2/A3-adjacent,
A7, A10) and they are worth the DACL.

**What defends against A1 is D130** — the broker executes only what it rendered, and
`AuditRecord.consentRendered` makes a lying agent attributable after the fact. The consent design's
§5 already conceded this (*"nothing in an unprivileged process can be trusted to paint honestly"*);
this section is that concession restated where a reader of the *transport* will meet it, because the
mistake available here is to read a DACL as a trust boundary.

**If a real boundary is ever required**, the answer is the strong form deferred in the consent design
§5 — a broker-owned consent window inside the user's session — which the register's §10.4 has since
**evidenced rather than merely reasoned** (session 0 is non-interactive; `WTSQueryUserToken` plus
`CreateProcessAsUser` with `lpDesktop = winsta0\default` is the route, with its own privilege and
profile-loading requirements). That is a decision with its own cost, not a tweak to this one.

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
| **OPEN-1** | **User identity binding.** Device auth authenticates the machine; KB entitlement (D43) and ticket history (D68) need the user. A self-asserted "user X is logged in" lets a compromised endpoint read any user's articles and tickets. | **Answered by D148** (broker-attested logon SID). Ratify. **Win32 route verified 2026-09-03 against learn.microsoft.com (§10.4), with one correction:** `WTSQueryUserToken` (LocalSystem + `SE_TCB_NAME`) yields the session's primary token; **no `WTS_INFO_CLASS` returns a SID** — the SID comes from `GetTokenInformation(TokenUser)` on that token. The active console session comes from `WTSGetActiveConsoleSessionId` / `WTSEnumerateSessions`. D148's wording should be amended to name the token → SID step. |
| **OPEN-2** | **Whose AWS account** (carried from hub spec §15). | Both; the architecture supports both (D59). The commercial answer: customer-hosted hubs cannot be metered or measured by us (R-4, D59c), so they are flat-priced and excluded from deflection commitments. Decide the price list, not the architecture. |
| **OPEN-3** | **Retention and residency** (hub spec §9, question 18). D58 added a PII table. | **Reframed by D141.** Anthropic retention is 30 days by default; ZDR is sales-gated; no EU inference or at-rest; no US pin on Haiku 4.5. Two sentences go back to the design partner. |
| **OPEN-4** | **v1 subset of the internal ticket store** (D73). | Their list — create, assign, state machine, visibility-split comments (D69), attachments, search, dashboard — **plus email notification to an IT alias (D86)**. Without an ITSM there is no queue; the store plus an email alias *is* the queue. |
| **OPEN-5** | **A threat model.** Ten invariants and no adversary list: user-context malware, a malicious end user, a malicious tenant admin, a compromised hub, a vendor insider, a compromised KB author, the network path. Each invariant should name which it stops. | New (review B8). B1 found its gaps by writing the adversaries down. **2026-09-03 night:** the threat model was written (`2026-09-03-threat-model-v1.md`, adversaries A1–A11, gaps G1–G10; it generated H5, D152–D154 and OPEN-8) **but exists only as a chat artifact — not on disk anywhere under the user profile when the first-build-steps handover was applied.** **CLOSED 2026-09-03 (night): the file is at `../2026-09-03-threat-model-v1.md`.** Adversaries A1–A11 (A11, nation-state, is explicitly out of scope for v1 so that it is a decision rather than an omission), invariant coverage in §2, and ten unguarded pairs G1–G10 in §3. The two labels other rows in this register cite by name now resolve: **G3** is A10 versus the entire trust root (OPEN-8's adversary) and **G4** is A5 versus the model context (D162's forcing reason). |
| **OPEN-6** | **Human identity and authorisation for the hub.** Who logs in to approve a catalog, revoke a device, read audit, configure a tenant; SSO, roles, MFA, admin audit. Draft-and-approve is meaningless without it. | **Answered in outline by D152–D160 (2026-09-03):** five actors, vendor access as a time-boxed customer-enabled grant, three transcript-access tiers, break-glass local accounts, TOTP and admin-action audit from day one, step-up re-authentication, author ≠ approver, OIDC federation with the hub as relying party, and a schema that does not foreclose it. Ratify as a set, then design. The rest of this row stands. New (review B8). Also missing: key-compromise runbooks, observability and on-call, backup/restore, tenant offboarding, a device lab, clock tolerance, uninstall, DPA and subprocessor list, end-user notice text, accessibility, change-management integration, the billing model the metering must support, and liability record contents. Listed in review B8; not individually numbered here. |
| **OPEN-7** | **macOS mapping.** D65 maps device identity to Secure Enclave. Nothing maps MSI, the named pipe, SCM primitives or Win32 FFI (R-14). | New. Write the one-page mapping (pkg/MDM, XPC, launchd) before locking identity. |
| **OPEN-8** | **Build-pipeline integrity — blocks shipping standalone.** With standalone confirmed as a real configuration (D151), a vendor-signed installer has automatic reach to every standalone endpoint: the self-updater fetches and runs whatever carries our publisher signature from the pinned URL. A compromised build pipeline or signing key is therefore a fleet-wide code-execution path with no customer change process between it and the machine. **Promoted from "blocks a pilot" to "blocks shipping standalone."** D147 carries the EDR-derived signing requirements (RSA certificate, publisher rules, `%ProgramFiles%`); this is the adversary case those requirements exist for. | New 2026-09-03 (founder handover §1b). Belongs in the threat model (OPEN-5) as the compromised-vendor adversary; the handover cites it as the threat model's "G3" — **which now resolves: `../2026-09-03-threat-model-v1.md` §3 G3 is A10 versus the entire trust root.** Before D151 ships: signing-key custody (HSM or equivalent), attested or reproducible builds, two-person release, and a pinned-URL story a customer-hosted hub can mirror (D133). |
| **OPEN-9** | **Code-signing certificate purchase — in progress with Daniel Chow.** Blocks A6 (signed MSI), D151 (standalone self-updater) and OPEN-8 (build-pipeline integrity): nothing standalone can ship, and no publisher rule can be written for a customer's EDR, until the certificate exists. Requirements: **RSA** per D147 (App Control signer rules do not support ECDSA), and **cloud-HSM-backed rather than a USB token**, because two-party approval and an audit trail over signing operations are only possible at all when the key sits behind a service with its own access control and log. | New 2026-09-03 (first-build-steps handover, Task 4). Owner: founder, with Daniel Chow. The HSM requirement is what makes OPEN-8's "signing-key custody, two-person release" implementable rather than aspirational. |

---

## 8. Values left unset

Recorded so they are not invented by whoever writes the code first.

- `N` — consecutive heartbeat failures before entering offline (D51) — **proposed 3** (D132 table, 2026-09-03)
- Heartbeat interval (D50) — a capacity parameter (D115); **decide together with the access-token lifetime (D132)** — **proposed 60 s, jittered ±15 s** (D132 table)
- Access-token lifetime (D61) — **a security parameter: revocation latency equals it (D132, X-3)** — **proposed 5 minutes** (D132 table)
- Enrollment secret validity window (D81)
- Enrollment rate-limit thresholds and anomaly trigger (D83)
- Minimum telemetry set for customer-hosted support (D59c) — must include hub version (D107) and, per D131, broker version as attested by the broker
- Retrieval chunk budget per turn — drives input token cost; the only measured input figure is the 2,261-token shipped turn with no retrieval (D140)
- Consent TTL (120 s in the shipped `ConsentToken` and kept by the D130 design), freshness bound (H6 — still unset), replay window (**proposed 60 s with a server-supplied nonce**) and assertion clock-skew tolerance (**proposed ±120 s**) — D132 table; review B8 "clock and time"
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
- `[VERIFY]` PCP default for the TPM authorisation value (D146); ~~`WTSQueryUserToken` / `WTSQuerySessionInformation` as the SID route (D148)~~ — **verified 2026-09-03, §10.4, with a correction: the SID comes from the token, not from any WTS info class**; RFC 7523 / 9449 / 9421 numbers (cited from memory twice).
- `[VERIFY]` Voyage 4 hosted-plus-nano shared vector space — **still a vendor claim (D144, D199a). Corroborated 2026-09-04 only as a claim**: Voyage's own post says all four Voyage 4 models "produce compatible embeddings" and that query encoders upgrade "without re-vectorizing documents", and Hugging Face integration material repeats it. **Nobody outside Voyage has verified it and we have not.** The settling experiment is about an hour — embed with nano, query with hosted voyage-4, measure whether retrieval holds. Note also that the upgrade is asymmetric and query-side, and that nano's headline 2,048 dimensions exceed pgvector's 2,000-dimension HNSW limit (§10.1).
- ~~`[VERIFY]` that a standard user cannot write to a LocalSystem-hosted Node named pipe (D201)~~ — **measured 2026-09-04, §10.5. The blocker holds.** What is still unrun is the last mile: **a real LocalSystem service with a real standard-user agent**, which needs an elevated window. The DACL was read off a user-created pipe and the access check was exercised against a reproduction of it. Also still unchosen: koffi vs an N-API addon vs a small signed helper for the native calls, which interacts with D147.
- `[VERIFY]` **interactive embedding latency on 1–2 vCPU Fargate, for any candidate (unmeasured, and the input that would most change D199).** Arctic-embed-m-v2.0 was chosen at 305M partly because Qwen3-Embedding-0.6B's 509M–600M is the wrong risk to take against a number nobody has.
- `[VERIFY]` whether a seed-stage self-serve org can obtain Zero Data Retention (D141).
- `[VERIFY]` forced `tool_choice: any` returns 400 on the Fable/Mythos 5.1 tier (R-13) — from cached skill documentation, not a live page; irrelevant unless the certified model set changes.
- **B1 is run, on one machine, once, against an empty database** (D193–D197): 56 assertions pass on PostgreSQL 17.11 with pgvector in Docker. **Nothing has been applied to RDS**, to a non-empty schema, or under concurrency beyond the three-worker `SKIP LOCKED` check, and no latency, connection-behaviour or migration-timing figure exists. `server/docs/B1-CONTROL-PLANE.md` §10.
- `[VERIFY]` cross-encoder reranker options, model sizes and CPU viability on Fargate-class hardware (D174) — cited from memory in the KB architecture document and listed as unretrieved by review A1. Also unconfirmed: **RRF's `k ≈ 60` convention** (D174), and pgvector HNSW index residency against `db.t4g.micro`'s 1 GB (D176) — §10.1 retrieved the `maintenance_work_mem` formula, but the residency claim is reasoning.
- `[VERIFY]` the claims in the KB architecture document's §3 that KCS v6 retrieval did **not** confirm: "capture in the workflow" as KCS's own phrasing, "reuse is review" as a KCS mechanism, and **findability beats volume** (which D173 rests on). §10.4 confirmed the article structure, the confidence-state names and the five-level audience attribute; it did not confirm these.
- Every `[VERIFY]` inside the five Part A research reports' own "Unverified / could not find" lists (`sources/2026-09-02-fable-design-review.md`).

### 10.3 Measured — the only four measurements in the project

| What | Result | Where |
|---|---|---|
| Model bake-off | 5 models, 40 hand-written cases, one machine, one run pair; zero R2 false actions reach a user after two catalog preconditions and `whenNotToUse` | `../../client/docs/BAKEOFF-2026-09-02.md`, `../../client/eval/` |
| Shipped prompt prefix, `claude-haiku-4-5` | 2,104 tokens (system 319 + tools and overhead 1,784) against a 4,096 cache floor; full turn 2,261 | `../../client/docs/TOKEN-COUNT-2026-09-03.md`, `npm run count-tokens` |
| Bake-off **through the B0 hub** vs direct, `mistral-small:24b`, 40 cases, same session (D164) | **Identical on 40 of 40 cases** — same outcome and same proposed capability on every case; per-case latency delta median 1 ms (mean −67 ms, max +259 ms). Both 33/40 that session; the recorded §2b baseline is 35/40 and the two cases that moved (`net-09`, `prn-03`, correct → no tool call) moved identically on both paths, so the drift is the model's between Ollama sessions at temperature 0, not the hub's. Zero false actions reaching a user on all three runs. | `../../client/docs/BAKEOFF-2026-09-02.md` §2c; `client/eval/results/hub-2026-09-03.*` and `direct-2026-09-03.*` (gitignored, on this machine) |
| Prompt cache, `claude-sonnet-5`, live (D161) | Two identical shipped turns, 2026-09-03: first call `cache_creation_input_tokens` 2,412 / `cache_read_input_tokens` 0; second call 0 / 2,412; 389 uncached input tokens each; 86% of a 2,801-token prompt served from cache on the second call | `../../client/docs/TOKEN-COUNT-2026-09-03.md` §6, `npm run verify-cache` (two real calls; not in `npm test`) |

**Outstanding from the design partner, now five weeks:** top-30 L1 ticket categories by volume — every substantive question eventually points at it (B5); incident and `sys_user` fields as actually used including `u_` custom fields; whether they use Interaction Management and Virtual Agent; whether they run outbound TLS inspection (now moot for the mTLS decision, D146, still useful for the FQDN allowlist conversation).

---

### 10.3a Verified on a screen — the D130 renderer check (2026-09-03, night)

**The only thing in this project verified by a human looking at it**, and the only way this
particular guarantee can be verified at all: D130 exists to make the consent card show what the
broker rendered, and no headless test can see a screen.

| What | Result |
|---|---|
| A `flush_dns` card, reached through the app, explain panel opened, **approved**, executed | `outcome: "success"`, `detail: {"flushed": true}`, audit `2026-09-04T00:36:28.675Z` |
| All **eight displayed fields** against `consentRendered` — `title`, `what`, `detail`, `rollbackNote`, and `notice` / `undo` / `why` / `risk` in the explain panel | **Matched.** |
| `rollbackNote` is `null` for `flush_dns` | **No rollback line on the card.** The same session's `renew_dhcp` card did show one, and that capability's rollback is non-null — so the field is driven by the data, not by the renderer |
| Any string on the card not in `consentRendered` | **None**, other than the labelled "Why this, here" line, which is `proposal.reasoning` — the only model-authored text allowed there |

**Not verified, and not to be claimed:** §3 (supersede on screen — a superseded record was seen
incidentally in an earlier session, but the deliberate deny-then-ask-again sequence was never run;
the headless equivalent passes in `consent-surface.test.mjs` §5) and §4 (the expired nonce — not
attempted). Both are consent-layer and neither needs elevation.

Run by the founder on the development machine. Recorded in
`../../client/docs/D130-RENDERER-CHECK.md`, which states exactly what was and was not covered.

---

### 10.4 Verified 2026-09-03 (night) — the first-build-steps handover's Task 5, against primary sources

Retrieved live from the publishers' pages, with verbatim quotes on file (`Downloads\2026-09-03-claude-code-handover-first-build-steps.md` Task 5; working notes in the session scratchpad, findings recorded here). Nothing in this table is from memory.

| Claim checked | Verdict | What the sources say | Where |
|---|---|---|---|
| `WTSQueryUserToken` / `WTSQuerySessionInformation` as the broker's route to the interactive session's logon SID (D148, OPEN-1) | **Confirmed with one correction** | `WTSQueryUserToken` returns the session user's primary token; caller must run as LocalSystem with `SE_TCB_NAME`; "intended for highly trusted services". `WTSQuerySessionInformation` returns user and domain **as strings** (`WTSUserName`, `WTSDomainName`, `WTSSessionInfo`) — **no info class returns a SID**; the SID is `GetTokenInformation(TokenUser)` → `TOKEN_USER.User`. Console session: `WTSGetActiveConsoleSessionId` (winbase.h; 0xFFFFFFFF when none) or `WTSEnumerateSessions`. Session 0 isolation and `CreateProcessAsUser` (needs `SE_INCREASE_QUOTA_NAME`, may need `SE_ASSIGNPRIMARYTOKEN_NAME`; `lpDesktop = "winsta0\default"`; does not load the profile or build the environment block) are Microsoft's documented route for a service to run UI in the user's session — which also closes the design's §5 `[VERIFY]` on why the strong consent form is expensive. | learn.microsoft.com: `wtsapi32/nf-wtsapi32-wtsqueryusertoken`, `...-wtsquerysessioninformationw`, `ne-wtsapi32-wts_info_class`, `winbase/nf-winbase-wtsgetactiveconsolesessionid`, `securitybaseapi/nf-securitybaseapi-gettokeninformation`, `services/interactive-services`, `processthreadsapi/nf-processthreadsapi-createprocessasusera` |
| ONNX Runtime on ARM64 / Graviton for the embedder shortlist (review A1, D144) | **Confirmed — the pick need not change** | Official CPU builds for Linux aarch64 exist at v1.29.0 (2026-08-12): PyPI `onnxruntime` wheels `manylinux_2_28_aarch64` for cp311–cp314; GitHub asset `onnxruntime-linux-aarch64-1.29.0.tgz`; `onnxruntime-node` 1.29.0 README marks CPU on Linux arm64 supported. **No CUDA or WebGPU prebuilts for Linux arm64**; the onnxruntime.ai install page does not mention ARM64 at all — cite the artifacts, not the page. Quantization doc: the U8S8 saturation issue is x64-only; Arm dot-product instructions are the fast path. | pypi.org/project/onnxruntime/#files; github.com/microsoft/onnxruntime/releases (v1.29.0); registry.npmjs.org/onnxruntime-node/latest; js/node/README.md; onnxruntime.ai/docs/install/ (silent) |
| KCS v6 article structure and lifecycle states (D162; §3 of the missing KB schema document) | **Confirmed** | Structure: **Issue, Environment, Resolution, Cause (optional), Metadata**, plus an optional *Internal Resolution* hidden on externally visible articles. States, exactly: **"Work in Progress (WIP)", "Not Validated", "Validated", "Archived"**. Solve Loop practices 1–4 (Capture, Structure, Reuse, Improve); Evolve Loop 5–8 (Content Health, Process Integration, Performance Assessment, Leadership and Communication). Audience is **five levels** — Internal, Within a Domain, Partners, Customers, Public — not a binary. | library.serviceinnovation.org: KCS v6 Practices Guide, Techniques 2.1, 5.1, 5.2, 5.3 |
| Windows redo binding (generic KB) | **Confirmed: Ctrl+Y; Ctrl+Shift+Z is not Windows-wide** | Microsoft's "Keyboard shortcuts in Windows" lists **Ctrl+Y** for redo and contains no Ctrl+Shift+Z; the only Microsoft page documenting Ctrl+Shift+Z as redo is Visual Studio's (`Edit.Redo`). The v2 article's "Ctrl+Shift+Z in most other applications" was corrected in `docs/kb/generic-kb-v2.json`. | support.microsoft.com/.../keyboard-shortcuts-in-windows-dcc61a57-8ff0-cffe-9796-cb9706c75eec; learn.microsoft.com/visualstudio/ide/default-keyboard-shortcuts-in-visual-studio |
| macOS show-desktop (generic KB, out of scope for v2) | **Confirmed** | Apple: **Command–Mission Control, Fn-H, or Fn-F11**; top-row keys need Fn/Globe unless "Use F1, F2, etc. keys as standard function keys" is on; user-configurable in Keyboard settings. Command+F3 appears on no Apple page fetched. | support.apple.com/en-us/102650; Mac User Guide (Mission Control; function keys) |

Still unverified after this pass: everything else in §10.2, and every remaining row and step of the generic KB (`docs/kb/README.md`).

---

### 10.5 Measured 2026-09-04 — the named-pipe DACL blocker (D201)

**Run, not cited.** `npm.cmd run verify:pipe` from `client/`
(`../../client/scripts/verify-pipe-security.ps1`). Windows 11 26200, Node 24.19.0, unelevated
`WAKANDA\Charles`.

**Part 1 — the DACL Windows actually gives a Node pipe**, read via `GetSecurityInfo` on a handle
(`GetNamedSecurityInfoW` with `SE_FILE_OBJECT` returns ERROR_INVALID_PARAMETER for a `\\.\pipe\`
path; a pipe is a kernel object and needs `SE_KERNEL_OBJECT`):

```
O:<creator>D:(A;;FA;;;SY)(A;;FA;;;BA)(A;;FA;;;<creator>)(A;;FR;;;WD)(A;;FR;;;AN)
```

| Principal | Mask | Decoded |
|---|---|---|
| LocalSystem, Administrators, creator owner | `0x001F01FF` | full control |
| **Everyone** | **`0x00120089`** | READ_DATA, READ_ATTRS, READ_CONTROL, SYNCHRONIZE — **no WRITE_DATA** |
| **Anonymous Logon** | **`0x00120089`** | the same |

This matches Microsoft's documented default exactly, and confirms the second half of the finding
too: **anonymous logon gets read access**, while libuv omits `PIPE_REJECT_REMOTE_CLIENTS` — a
pre-authentication surface on what would be a privileged service.

**Part 2 — the access check.** That exact DACL rebuilt with **no ace for the caller**, mirroring a
LocalSystem-created pipe, then opened from an unelevated token:

| Requested access | Result |
|---|---|
| `GENERIC_READ` | **ALLOWED** |
| `GENERIC_WRITE` | **REFUSED — ERROR_ACCESS_DENIED** |
| `FILE_WRITE_DATA` | **REFUSED — ERROR_ACCESS_DENIED** |
| `GENERIC_READ \| GENERIC_WRITE` | **REFUSED — ERROR_ACCESS_DENIED** |

**Conclusion: D201's blocker is real.** A request/response protocol cannot run on a pipe the
LocalSystem broker creates through `node:net` — the agent can connect and never speak.

**What this is not.** The pipe whose DACL was read was created by a normal user, so its creator ace
names that user; the load-bearing ace is Everyone's, which is identical either way, and the
LocalSystem case only merges the creator ace into `SY`. The access check ran against a
*reproduction*. **A real LocalSystem service with a real standard-user agent has still never been
tried** — that is §10.2's remaining line and it needs an elevated window.

**Two bugs in the verification itself**, recorded because both produced a confident wrong answer that
looked right. Passing `\\.\pipe\name` through bash ate the backslashes and produced an `EACCES`
indistinguishable from the finding being sought — **a false positive for the correct conclusion**. And
a PowerShell helper that emitted status strings *and* returned a boolean put both on the pipeline, so
the caller captured an array, every array is truthy, and the verdict silently inverted to "the write
was ALLOWED". Neither was caught by the answer looking wrong.

**Also observed:** the `FILE_READ_DATA` line in part 2 reports win32 **231 = ERROR_PIPE_BUSY**, not an
access failure — the preceding successful open consumed the single listening instance. It is noise,
and the script now says so, because a reader would otherwise take it for a permission result.

---

## 11. How to add to this register

1. Take the next free ID (**D202 onward**, as of 2026-09-04). Never reuse, never renumber. IDs D130–D168 that appear in the two parallel documents named in §0 are void — §5.6 and §5.11a map them onto this file. **Two IDs are cited in this file but were never defined (`D46b`, `D52a`); §5.11b says what to cite instead. Do not back-fill them.**
2. One row: decision, status (*done* / *decided* / *proposed* / *rejected*), source and forcing reason. A decision without a forcing reason is an opinion.
3. If it amends an earlier decision, say so in both rows.
4. If it depends on an unverified claim, tag `[VERIFY]` inline and add it to §10.2.
5. Update `PROJECT_START_HERE.md` only if the status table changes; that file is an index, not content.
