# Decision Register — D35–D46

**Date:** 2026-09-02
**Continues from:** D34
**Source:** working session against `2026-09-02-hub-server-side-spec-handover.md`
**Scope:** knowledge base placement, connectivity model, hub inference, user schema, and one
proposed new invariant.

**Reading note:** decisions are recorded with their forcing reason, because several of these are
consequences of earlier decisions rather than free choices. Where a decision creates a conflict with
the existing handover text, the conflict is recorded in §4 rather than resolved silently.

---

## 1. Proposed new invariant — H4

| | Rule |
|---|---|
| **H4** | Hub-supplied policy may only **narrow** endpoint capability, never widen it. The endpoint's maximum risk tier and primitive allowlist are pinned at enrollment or carried in signed content. |

**Why this is needed.** H1 prevents a compromised hub from signing new playbooks. H2 says the hub
distributes policy and the endpoint enforces it. Neither prevents a compromised hub from *widening
the approved subset or raising the tier ceiling* using only correctly-signed catalog content. That
is fleet-wide capability escalation to the union of everything in the signed catalog, achieved
without breaking a stated invariant, and the ceiling rises as the catalog grows.

H2 as currently worded is satisfied by an endpoint faithfully enforcing a policy that tells it to do
more. The invariant needs the *direction* stated.

**Status:** proposed, not yet ratified. §3 of the handover currently asserts that hub compromise
costs confidentiality, not control. That assertion does not hold until H4 (or equivalent) is in
place.

---

## 2. Decision register

### Knowledge base

| ID | Decision | Forcing reason |
|---|---|---|
| **D35** | Hub connection grants access to a knowledge base for answering questions prior to escalation. KB answering is a first-class deflection capability, not a secondary feature. | Read-only, requires no privileged primitive, and covers "how do I" / "why is this happening" ticket classes that the four Win32 primitives cannot reach. |
| **D36** | **Customer KB is never stored at rest on the endpoint.** Retrieval is hub-side; the endpoint never holds the corpus. | Three independent reasons: (a) query embedding requires Bedrock (see D37), so local search buys no offline capability; (b) KB articles carry read criteria, and entitlement must be enforced at query time against user identity; (c) withdrawn articles must stop being served immediately — sync protocols handle updates well and deletions badly. |
| **D37** | Query embedding requires a network call. There is no offline dense retrieval path. | Titan Text Embeddings V2 is Bedrock-hosted and not downloadable. Dense retrieval requires query and corpus be embedded by the same model; a substitute local embedder against a Titan-embedded corpus returns noise, not degraded results. This is a consequence of the existing embedding-model decision, not a new choice. |
| **D38** | **Generic KB ships inside the signed catalog bundle.** It is vendor-authored, carries no entitlement rules and contains no customer data, so it is safe at rest on the endpoint. | Reuses an existing signed, versioned, per-tenant distribution channel. No new signing story, H1 unchanged, already pull-based with version checking. |
| **D39** | The generic bundle is pushed proactively, not fetched lazily. | The moment it is needed is the moment the hub is unreachable. |
| **D40** | Offline capability = tier-0 deterministic routing + lexical search over the generic bundle. **No model, no customer content.** | Falls out of D36 + D37 + D38. Note this converges with what §7 already specifies for standalone mode — offline and standalone reach the same KB surface, which is evidence the model is coherent rather than two special cases. |

**Rejected alternative (recorded so it stays dead):** hub embeds the query, endpoint searches a local
index. Functionally works, but requires the network anyway — so it delivers no offline capability
while still placing the full corpus on disk with the entitlement and retraction problems intact.

### Connectivity model

| ID | Decision | Forcing reason |
|---|---|---|
| **D41** | **No user-facing mode toggle.** Mode is machine state, owned by the broker, written at enrollment, changed only by an authenticated enroll/unenroll operation. The UI displays mode and cannot set it. | A user-operable toggle is a security downgrade triggered by a button press — worse than the network-triggered downgrade §7 already forbids. It also has nothing to toggle *to*: H3 means a joined endpoint holds no local credential, so the "local" position is either dead or requires shipping a key to every joined endpoint. |
| **D41a** | The unenroll path is security-relevant and must be authenticated. | Otherwise the downgrade is relocated rather than closed. |
| **D42** | **Three connectivity states, not two:** joined-and-reachable, joined-and-unreachable, standalone. Surfaced distinctly in the UI. | A user shown a generic "offline" for both unreachable and unmanaged will escalate about the wrong thing. |
| **D43** | Connectivity is determined by an **authenticated heartbeat** that also carries policy and catalog version — not by a reachability check. | Captive portals return 200 to anything; a TCP connect to the ALB proves nothing about device credential validity. Collapses connectivity, authorization and content freshness into one signal instead of three that can disagree. |
| **D44** | Hysteresis on state transitions: enter offline after N consecutive heartbeat failures, leave only on a successful authenticated call. Mid-session capability loss is stated to the user. | Prevents a flaky VPN from flapping capability. If the hub drops mid-conversation the agent's capability has shrunk and it should say so rather than quietly getting worse at its job. `N` is unset — see §5. |

### Hub inference

| ID | Decision | Forcing reason |
|---|---|---|
| **D45** | In joined mode the endpoint uses the **hub inference proxy**. Device identity is the credential. | Already §4; this confirms it and is what makes H3 work. |
| **D46** | **Single combined call.** Endpoint sends conversation state and user turn; hub retrieves, assembles the prompt, calls the model, returns a **structured proposal**. Retrieved chunks never leave the hub. | The naive two-call shape (fetch chunks → assemble locally → send back) moves customer KB content hub → endpoint → hub and lands it in endpoint memory. Transient rather than at rest is materially better than a synced copy, but it partially undoes D36. |
| **D46a** | **Redaction stays on the endpoint**, executed before the call to the hub. | §9 requires redaction before egress regardless of destination. Endpoint → hub is egress. Hub-side redaction means the unredacted text has already left the machine and the rule is decorative. |
| **D46b** | **Tier-0 routing stays on the endpoint** with no hub dependency. | Preserves the network-outage case — the scenario where an IT agent is most valuable and the hub is least reachable. |
| **D46c** | Haiku→Sonnet escalation policy and per-tenant metering/caps move to the hub. | Escalation is a cost decision and `modelId` is already tenant config. Neither is possible in standalone — a further argument that standalone is not the sales motion. |

**Boundary clarification.** D46 does not violate §4's "hub must not own the conversation loop"
*provided* the invariant is read as **model proposes / endpoint validates / broker executes**. The
endpoint still validates every proposal against the signed catalog, still owns consent wording
(H3e), still owns execution. Where prompt concatenation happens is not a security boundary. See
conflict C1.

### User schema

| ID | Decision | Forcing reason |
|---|---|---|
| **D47** | Introduce a **user identity** entity distinct from device identity. | D36's entitlement filtering requires it. The handover's identity model is per-endpoint only. |
| **D48** | Model the user schema on **SCIM 2.0 core + enterprise extension**, not on ServiceNow `sys_user`. | The `sys_user` field set maps near one-to-one onto SCIM (`userName`, `name.givenName`/`familyName`, `emails`, `active`, `employeeNumber`, `department`, `organization`, `manager`) — not a coincidence, since enterprises typically drive `sys_user` from AD/Entra. `sys_user` is a derived copy, not a source of truth. SCIM gets ServiceNow compatibility plus Okta, Entra and Jira for free. Same reasoning as §12's refusal to depend on a vendor's tool-calling dialect. |
| **D49** | **`sys_id` is not the primary key.** It is one entry in an external-correlation map alongside Jira account ID, Entra object ID, etc. | §2 states most customers will not have ServiceNow. A `sys_id` PK gives every one of them a null primary key. |
| **D50** | Retain `manager` explicitly. | Required for approval routing on R2+ actions and for access/license request categories — precisely the ticket classes the current four primitives cannot touch. |
| **D51** | The user table is PII (email, employee number, manager chain, location) and is in scope for §9 retention and residency. | Schema-per-tenant (D-prior) makes per-customer deletion tractable, which is the main thing working in favour here. |

### Customer-hosted deployment

| ID | Decision | Forcing reason |
|---|---|---|
| **D52** | Customer-local hub deployment remains supported; §5's two-stateful-dependency rule is what preserves it. | Confirms existing position. |
| **D52a** | **pgvector is now a stated deployment requirement** on customer-supplied Postgres. | D36 puts the vector index on the hub, and §5 permits only Postgres and object storage. This is a version-and-extension constraint on hardware not under our control and surfaces on install day if not documented. |
| **D52b** | Infrastructure cost falls in a customer-local deployment; **inference cost does not.** The only genuinely low-cost configuration is customer-hosted hub *plus* customer-hosted OpenAI-compatible endpoint (§12 tier 3). | Tier 3 is best-effort and excluded from deflection commitments. So the cheapest, most privacy-attractive configuration is the one we cannot make quality promises about. Recorded as a deliberate commercial position, not a defect. |
| **D52c** | A minimum telemetry set must be defined as a **condition of support** for customer-hosted deployments. | Customer-hosted removes audit reaching us: no deflection measurement, no debugging, and canary rings stop meaning anything across a fleet we do not operate. Retrofitting this onto an installed base is unpleasant. Content of the minimum set is unset — see §5. |

---

## 3. Consequences for effort and phasing

D35–D40 and D47–D51 introduce work not present in §14's ordering and not inside the 8–14
engineer-week estimate:

- corpus ingestion, chunking, embedding pipeline, index maintenance
- retrieval API with entitlement filtering at query time
- user identity entity, SCIM mapping, directory sync
- a new PII store with its own retention obligations

If KB answering is a primary deflection lever (D35), it belongs near the top of the §14 order, where
it currently does not appear at all.

**The joined/offline cliff is steeper than the handover implies.** Under D36 + D40, joined-and-
connected is the full product; offline is tier-0 plus generic articles plus no model. "Degrades to
offline mode" understates this. It raises the stakes on the single-AZ Phase 1 posture — an RDS
maintenance window now removes the KB as well as the model.

---

## 4. Conflicts recorded, not resolved

These are recorded so they are visible rather than smoothed over. None is resolved by this document.

| ID | Conflict | Status |
|---|---|---|
| **C1** | §4 states the hub must not own the conversation loop; §4 also places prompt versioning on the hub; D46 places retrieval and prompt assembly on the hub. Two of these statements currently stand unreconciled in the handover text. | Needs a wording decision. Recommended resolution: restate the invariant as *model proposes / endpoint validates / broker executes*, which is what actually carries the security weight. |
| **C2** | §5 commits to a Postgres job queue via `SELECT … FOR UPDATE SKIP LOCKED`; §6 commits to schema-per-tenant. Per-schema queues mean N pollers or one poller iterating every tenant schema; a shared queue table reintroduces the cross-tenant surface schema-per-tenant was chosen to eliminate. There is no third option. | **Blocks the first migration.** Unresolved. |
| **C3** | H1 says the signing key never lives on the hub; §4 describes signed catalog distribution as per-tenant and as the delivery path for draft-and-approve authoring. Together these require a human to sign every customer's catalog edit offline, indefinitely. | Probable resolution: the *signed* artifact is the vendor-authored primitive/playbook catalog; per-tenant approved-subset and risk policy is unsigned config enforced by the endpoint against the signed catalog (i.e. H2 + H4). Not yet stated in the handover. |
| **C4** | §2 states most customers will not have ServiceNow; §4 places the internal ticket store at priority 3, behind a ServiceNow adapter built for one design partner. | Phasing appears inverted relative to the stated market. Unresolved. |
| **C5** | §10 quotes RDS/NAT/endpoint rates for US East (Ohio); §11 commits to us-east-1 (N. Virginia) for Bedrock In-Region residency. | Cost model quotes a region we have decided not to use. Re-price. |
| **C6** | §3 asserts hub compromise costs confidentiality, not control. | Does not hold until H4 is ratified. |

---

## 5. Values left unset

Recorded so they are not invented later by whoever writes the code first.

- `N` — consecutive heartbeat failures before entering offline (D44)
- Heartbeat interval (D43)
- Minimum telemetry set for customer-hosted support (D52c)
- Retrieval chunk budget per turn — directly drives input token cost, currently unmodeled

---

## 6. Verification register

**Unverified, flagged:**

- Titan Text Embeddings V2 is not available as downloadable weights. Consistent with what is known
  but this is exactly the kind of thing that moves. **Check current Bedrock model access options
  before treating D37 as settled.**
- Whether ServiceNow's KB API exposes read criteria in a form evaluable server-side, or whether
  entitlement filtering requires proxying searches through the customer's instance per-user. **These
  are very different amounts of work** and D36's implementation cost depends on the answer.
- Exact SCIM 2.0 attribute paths — check against RFC 7643 before writing the migration (D48).
- ALB mutual-TLS behaviour and trust-store/CRL handling, if mTLS is chosen for device auth.
- Bedrock per-token pricing for any model in the certified set. Still unverified; the cost model
  rests on it.

**Screenshot provenance note:** the `sys_user` field list reviewed in session appeared to be an
AI-generated summary with citation badges rather than primary vendor documentation. The field list
looked correct for out-of-box `sys_user`, but out-of-box is not the thing that matters. **Add
"`sys_user` fields as actually used, including `u_` custom fields" to the outstanding design-partner
request** alongside the existing ask for incident table fields.

**Unchanged from the source handover:** no performance number in this project has been measured.
Every figure is a target. All §2 constraints are single-source from one company.
