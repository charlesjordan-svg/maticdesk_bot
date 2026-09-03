# Decision Register — D53–D66

**Date:** 2026-09-02
**Continues from:** D52c
**Covers:** device authentication, enrollment, ticket history retrieval, admin dashboard and
reporting, standalone/integrated operation.

**Status note:** no web access was available in the session that produced this. Every vendor claim
carries `[VERIFY]`. Section 6 lists additions to the Fable evaluation prompt's Part A.

---

## 1. Device authentication

The design space splits into two questions that are usually collapsed: **what credential the device
holds**, and **how it is presented on the wire**. An X.509 certificate can be presented by mTLS or
used to sign an application-layer assertion. Deciding "mTLS" answers only the second question and
silently commits to operating a CA.

| ID | Decision | Reasoning |
|---|---|---|
| **D53** | Device identity is an **asymmetric keypair generated at enrollment by the broker**, TPM-backed and non-exportable where a TPM 2.0 is present (Windows platform crypto provider). Public key binds to a device record in hub Postgres. | Bearer tokens as steady-state identity are excluded for the reason H3 exists: anything readable off disk lets one compromised machine impersonate any machine. |
| **D54** | Authentication is a **signed assertion exchanged for a short-lived access token**, not per-request signing. Broker signs a JWT with the device key; hub returns a session token; turns and heartbeats carry the cheap token. | D46 makes every conversational turn a hub call. TPM signing per-request is too slow `[VERIFY]` — order of tens of ms. Short token expiry also delivers revocation without CRL machinery. Pattern is OAuth 2.0 client credentials with private-key JWT client auth `[VERIFY: RFC 7523]`. |
| **D55** | **mTLS is rejected.** | Three reasons, any one sufficient: (a) corporate TLS inspection terminates the connection and cannot present a client certificate, requiring a per-customer domain exemption negotiated at every deployment `[VERIFY: prevalence in target segment — ask design partner directly]`; (b) customer-hosted hubs (D52) would need our trust store or their own CA; (c) §5's "every extra daemon is a pager" applies harder to PKI than to Redis — certificate expiry is a fleet-wide outage with a date on it. |
| **D55a** | **Consequence:** ALB mutual-TLS behaviour is removed from the verification register. Device auth is now decoupled from AWS ingress entirely, and behaves identically hosted or self-hosted. | |
| **D56** | **Fallback for machines without usable TPM:** software key under DPAPI machine scope in broker-owned ProgramData. The hub records which devices are on the weak path. | Weak-path status is a policy input — those devices may be capped at a lower risk tier. Requires the hub to model key-protection level as device state, not just presence of a key. |
| **D57** | The device key lives **broker-side**. The agent requests tokens over the existing named pipe and never sees the key. | Extends an existing privilege boundary rather than creating a new one. Pipe must be ACL'd and the calling binary's signature checked so arbitrary user processes cannot request tokens. Blast radius is bounded — a token grants what the agent already has — but the check is cheap. |
| **D58** | **Portability:** the same abstraction maps to macOS Secure Enclave. v1 Windows work is not throwaway. | Relevant to post-v1 macOS scope. |

### Enrollment

Steady-state auth is the tractable half. Bootstrapping is where these designs leak, and the
handover does not cover it.

| ID | Decision | Reasoning |
|---|---|---|
| **D59** | **An enrollment secret buys a pending record, not fleet membership.** Device self-enrolls into a pending queue; IT approves in the hub console; an auto-approve policy may admit devices meeting a stated condition (e.g. domain membership). | A tenant-wide secret in the MSI is the credential most likely to leak. Under this model a leak costs a spam queue, not a fleet breach. Per-device pre-provisioned tokens are stronger but do not survive 5,000 seats. |
| **D60** | **Enrollment is the mechanism for standalone → joined conversion** (§7 requirement 1) and is what writes the broker-owned mode state from D41. Unenrollment is the only path back and is authenticated (D41a). | Gives §7's no-reinstall requirement a concrete home and closes the mode-downgrade path in the same mechanism. |
| **D60a** | TPM attestation at enrollment (proving a genuine TPM) is **deferred to v2 hardening**. | Recorded so it is not silently forgotten. |

### Open item raised by this work

**OPEN-1 — user identity binding.** Device auth authenticates the *machine*. D36's KB entitlement
and D61's ticket history both need the *user*. Nothing in the documents connects them.

If the endpoint simply asserts "user X is logged in," a compromised endpoint can read any user's
entitled articles and any user's ticket history — the device credential does not constrain the
claim. The alternatives:

- **Real user authentication** (OIDC against the customer IdP, interactive sign-in). Strong, but
  damages the "it's already there and it just works" quality that is the point of a taskbar agent.
- **Accept the device assertion**, with blast radius bounded to one machine within one tenant.

This matters most on shared and shift-worker machines, where the logged-in user changes through the
day — plausibly common in the design partner's environment. **Not resolved by D53–D60. Needs its own
decision.**

---

## 2. Ticket history

### The split

"Look at user ticket history to help diagnose" contains two features with an order-of-magnitude
difference in cost and risk. They are separated here deliberately.

| ID | Decision | Reasoning |
|---|---|---|
| **D61** | **Own-history retrieval is a live read-through query**, filtered to the requesting user, executed at query time against the ITSM (integrated) or the internal store (standalone-ITSM). No ingestion, no embedding, no corpus. | Ticket data is high-volume, constantly changing, customer-owned and PII-dense. Replicating it into our hub would put PII into a vector index and pull §9 retention obligations across the entire ticket corpus. Read-through avoids all of it. Depends on OPEN-1 for the user identity. |
| **D62** | **Status readback uses customer-visible comments only. Internal work notes are never surfaced to the end user.** | `[VERIFY]` — believed to be `comments` (customer-visible) vs `work_notes` (internal) on ServiceNow task records. Whatever the field names, the distinction is real and the default must be visible-only. Reading internal engineer commentary aloud to the user it concerns is a serious and easily-shipped failure. |
| **D63** | **Cross-user historical similarity ("has anyone else seen this?") is deferred**, pending the entitlement research in §6. | Requires a searchable corpus of all tenants' tickets — embedding PII, replicating customer data, and an entitlement model over records that may include HR cases, security incidents, terminations and executive escalations. This is a project with a privacy review attached, not a feature. |
| **D63a** | If D63 is later taken up, the likely safe form is **retrieval over resolved-and-sanitised tickets promoted into the KB**, not over raw ticket records. | Converts an entitlement problem into a curation problem, which the catalog authoring model (draft-and-approve) already handles. |

### Why this is worth the split

D61 is days of work and materially improves diagnosis and status answering. D63 is the one that
sounds similar and is not. Committing to both at once would put the cheap, high-value feature behind
the expensive, high-risk one.

---

## 3. Admin dashboard and reporting

| ID | Decision | Reasoning |
|---|---|---|
| **D64** | **The dashboard's differentiated content is session and deflection analytics, not ticket analytics.** Build session metrics first; ticket charts are table stakes. | Customers with an ITSM already have ticket reporting, and it is a large part of what they pay for — ours will be worse. What no other tool can produce is *sessions that did not become tickets*: deflection by category, by user, over time. This is the sales instrument, the renewal argument, and the measurement the business case rests on. It exists as data only because of the session entity (D53-prior interaction work). |
| **D65** | Dashboard dimensions: by user, by category, by time, by outcome (resolved / escalated / abandoned), by risk tier of actions taken. | "By outcome" and "by risk tier" are ours alone and are what an IT lead will actually want during a rollout. |
| **D66** | **The internal ticket store is promoted from §4 priority 3 to core.** It is the system of record for every customer without an ITSM, and §2 states that is most of them. **This resolves C4.** | Standalone-ITSM operation is not a fallback mode; it is the majority deployment. See scope warning below. |

### Scope warning attached to D66

§5 rejected running Zammad or Chatwoot as dependencies for sound reasons. Promoting the internal
ticket store does not remove the requirements those products exist to satisfy — it relocates them
into our codebase, where we also own the bugs. A ticket store an IT lead will accept needs
assignment and reassignment, SLA timers on business calendars, queues and routing, email ingest with
threaded reply, attachments, audit history, search, saved views, bulk operations, and a permissions
model.

**Recommendation:** define a explicit v1 subset in writing and defend it, rather than discovering the
list feature by feature. The subset that plausibly suffices for a pilot: create, assign, state
machine, comments split by visibility (D62), attachments, search, and the dashboard. Everything else
is a deliberate later decision.

---

## 4. Terminology fix

| ID | Decision |
|---|---|
| **D67** | **"Standalone" is overloaded and must be split in all documents.** §7 uses it for the endpoint deployment mode (local API key, capped at R1, no hub). The new requirement uses it for the product operating without ITSM integration. These are independent axes: a fully joined fleet with no ServiceNow is *hub-connected* and *ITSM-less*. Proposed terms: **endpoint mode** = standalone / joined; **ITSM posture** = integrated / self-contained. |

---

## 5. Consequences for phasing

D61, D64, D65 and D66 add work not in §14's ordering and not inside the 8–14 engineer-week estimate:

- read-through ticket query and status rendering with comment-visibility filtering
- session analytics store and aggregation
- dashboard and reporting UI
- internal ticket store, at whatever the defended v1 subset turns out to be

The internal ticket store in particular is the single largest addition and the one most likely to be
underestimated, because "~15 fields, a status machine, a list view" is how it is currently described.

---

## 6. Additions to the Fable prompt, Part A

Append these to `2026-09-02-fable-evaluation-prompt.md`:

**A6. ServiceNow ticket access and comment visibility**
- Confirm the field distinction between internal work notes and customer-visible comments on `task`
  / `incident`, and the exact field names.
- Can the Table API filter incidents by caller, and what authentication and licensing does that
  require? Does reading a user's own tickets need a licensed account per end user, or can an
  integration account query on their behalf?
- How are ACLs on `incident` expressed, and can an integration determine server-side whether a given
  user may read a given ticket?
- Are there ticket classes (HR, security, legal) that are separately restricted and would need
  explicit exclusion from any retrieval path?

**A7. TPM and Windows platform crypto**
- Signing latency for a TPM 2.0-backed key via the Windows platform crypto provider — enough to
  confirm or refute D54's premise.
- Expected prevalence of usable TPM 2.0 in a corporate Windows fleet, and typical failure modes
  (disabled in firmware, cleared on reimage).

**A8. Corporate TLS inspection**
- How common is outbound TLS inspection in mid-market and enterprise environments, and what is the
  standard exemption process? This is the primary evidence for D55.

---

## 7. Verification register additions

- `comments` vs `work_notes` field names and semantics — **unverified**, and D62 depends on it.
- RFC numbers for private-key JWT client authentication, DPoP, and HTTP Message Signatures —
  **unverified**, cited from memory.
- TPM 2.0 signing latency — **unverified**, D54's efficiency argument depends on the order of
  magnitude only.
- Prevalence of corporate TLS inspection — **unverified**, and the strongest single argument for
  D55.

**Removed from the register:** ALB mutual-TLS behaviour and CRL handling, no longer relevant under
D55.
