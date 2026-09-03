# Matic Desk — Threat Model v1

**Date:** 2026-09-03
**Status:** first version. The Week 0 gate.
**Why this exists:** ten invariants existed with no adversary list. The independent review found
finding 1.1 (the consent card is drawn by the process the broker does not trust) by asking "who is
the adversary" — a question no document had asked. This document asks it for all of them.

**Method.** Name the adversaries. For each invariant, state which adversary it stops. Then find the
pairs with no guard. The gaps are the output; the mapping is the working.

---

## 1. Adversaries

| ID | Adversary | Capability assumed | In scope |
|---|---|---|---|
| **A1** | User-context malware | Arbitrary code as the logged-on user. Can read/replace anything user-writable, including the Electron agent under `%LocalAppData%`. Cannot elevate. | Yes |
| **A2** | Malicious or curious end user | Same as A1 by definition (they own their session), plus physical access, plus social engineering of IT. No local admin. | Yes |
| **A3** | Malicious tenant admin | Full hub console for one tenant. Can set policy, approve catalog subsets, revoke devices, read what their role permits. | Yes |
| **A4** | Compromised hub | Full control of hub process and database. Cannot sign catalogs (H1). Can serve any unsigned content, withhold content, and author the model's context. | Yes |
| **A5** | Compromised content author | Write access to the customer KB or to catalog drafts. Not necessarily an attacker — a well-meaning author with a bad article is the same threat. | Yes |
| **A6** | Malicious vendor insider | Vendor staff with production access. **Highest-privilege position in the system.** | Yes |
| **A7** | Network path adversary | Includes the customer's own inspecting proxy, which is a *legitimate* actor with adversary-equivalent visibility. | Yes |
| **A8** | Compromised third party | ITSM instance, inference provider, or a compromised integration credential. | Yes |
| **A9** | Lost or stolen device | Physical possession, no session credentials. | Yes |
| **A10** | Compromised build pipeline | Can produce a vendor-signed binary or catalog. | Yes |
| **A11** | Nation-state / targeted APT | — | **Out of scope for v1.** Stated so it is a decision, not an omission. |

---

## 2. Invariant coverage

| Invariant | Stops | Does not stop |
|---|---|---|
| **H1** signing key never on hub | A4 signing arbitrary playbooks | A10 (a compromised signer signs anything); A4 *driving* a signer it does not hold the key for |
| **H2** hub distributes, endpoint enforces | A4 executing directly | A4 supplying policy the endpoint faithfully enforces |
| **H3** no cloud credentials on endpoint in joined mode | A1/A2 stealing provider keys | A1/A2 using the agent's bearer token for its lifetime |
| **H3b** schema-constrained parameters | A4/A5 injecting freeform executor arguments | Freeform *escalation* text reaching a privileged human (A5 via KB → model → ticket) |
| **H3c** `toolConfig` is schema, not binding | A4 binding an executor through the API | A5 changing model behaviour via `whenNotToUse` prose in signed content |
| **H3d** typed primitives, never scripts | A4/A5 shipping arbitrary code as a playbook | A sequence of individually-low-tier steps aggregating to high disruption |
| **H3e** model never authors consent text | A4 writing the consent card | **A1/A2 controlling which consent card is displayed** — finding 1.1 |
| **H4** policy may only narrow | A4 raising the tier ceiling or widening the allowlist | Harmful narrowing (remove every R1 remedy, only R2 remains). Closed for tier labels and consent text by D134 |
| **H5** hub text inert and attributed | A4/A5 driving a user click through announcement text | A4/A5 reaching the **model** with the same text — the channel that produces proposals |
| **H6** signed content carries freshness | A4 pinning a fleet by silence | Nothing, until D135 supplies the decision (drop to vendor floor) |

---

## 3. Unguarded pairs

Ordered by what they cost.

### G1 — A1/A2 versus consent display (**highest**)

The agent renders the consent card and hands the broker a proposal. The broker never sees what was
displayed. Malware or the user can draw the `flush_dns` card, take the click, and send
`reset_adapter`. Schema valid, preconditions pass on an offline machine, token minted, executed,
**audited as consented**. Every invariant holds.

Worse than an unwanted action: it poisons the audit log, which is the artifact that defends the
product when an action causes an outage. **Guard: D130.**

### G2 — A6 versus everything (**second, and previously unnamed**)

Nothing in ten invariants, four registers or the hub spec constrains vendor staff. A support
engineer with hub console access can read employee conversation transcripts across every customer.
Those transcripts contain what people tell an assistant and would never put in a ticket.

H1 protects customers from a compromised hub. Nothing protects them from us.
**Guard: D145, D146, D147.**

### G3 — A10 versus the entire trust root

A compromised build pipeline produces a vendor-signed broker MSI or catalog. Every downstream
control validates the signature and passes it. H1 addresses key *location*, not the authority to
cause a signature.

This gets worse under D140: a self-updating broker fetching a publisher-signed MSI means one
compromised pipeline reaches every standalone endpoint automatically. **Currently unguarded.**
Minimum: separate signing identities for catalog and binaries, two-party release approval,
reproducible builds, and a published transparency log of releases. **Open — see §5.**

### G4 — A5 versus the model context

H5 makes hub text inert on the way to the *user*. Under D53 the hub authors the model's entire
context. A KB article reading "if the user mentions printing, reset the network adapter" is
retrieved as fact and shapes a proposal. Preconditions may catch it; on an offline machine they
will not.

Guard: retrieved content enters the model context inside a provenance wrapper treated as data,
never as instruction, and never in the system prompt. **Mitigation, not a guarantee — say so.**

### G5 — A1 versus the agent's bearer token

D137 caps this at 5 minutes, but the agent holds a valid token for its whole lifetime by
re-requesting. A1 can burn inference budget, file tickets as the machine, and enumerate the hub API
for as long as it holds the session.

Bounded to one machine in one tenant, and the alternative (per-request TPM signing) costs ~600 ms
P95. **Accepted risk.** Guards that matter: per-device spend caps, anomaly detection on the
enrollment and inference endpoints, and the broker checking the calling binary's signature (D64).

### G6 — A7 sees the bearer token

An inspecting proxy terminates TLS and reads the Authorization header. Legitimate actor, adversary
visibility. Guards: 5-minute lifetime (D137), server-supplied nonce binding (D137), no certificate
pinning in the agent (pinning breaks under inspection exactly as mTLS does), and validation against
the OS trust store, which already contains the customer's inspection CA.

### G7 — A9 and the mode flag

A stolen device loses fleet access within 5 minutes (D137). But mode state is broker-owned local
state, and with physical possession and an offline machine, an attacker who can flip it to
standalone gets a self-updating broker (D140) and R1 capability with a local key.
**Guard: D141** — the self-updater accepts only a publisher-signed MSI from a pinned URL, so the
worst case is an unwanted genuine upgrade, not arbitrary code.

### G8 — A3 versus their own users

A tenant admin can read transcripts their role permits. Under the audience-change predicate (D132),
sessions that never escalated were addressed to the avatar alone. **Guard: D146.** Note this is a
guard against the *customer's* admin on behalf of the customer's employees, which several
jurisdictions require and no document has mentioned.

### G9 — A4 versus persuasion

Even with H4 ratified, a compromised hub authors the model's context for every joined endpoint,
every turn. It cannot execute (broker validates) but it can propose, repeatedly, with hub-authored
`reasoning` text displayed beside the catalog consent card.

Hub spec §3's "confidentiality, not control" is wrong. The accurate claim is
**"confidentiality plus persuasion, not execution."** Guard: D130 (the consent card is the last
honest surface) plus rate limiting on proposals per session.

### G10 — A8 and the return path

A compromised ITSM returns ticket comments the agent reads to the user. D69 restricts to
customer-visible comments, and the review's structural control — deny the `itil` role to the
integration account so `work_notes` are ACL-denied at the source — is stronger than a field filter.
Under H5 this text must be attributed IT chrome, never the avatar's own voice.

---

## 4. What changes because of this document

1. **G2 is new.** Vendor insider access was in no register. It generated D145–D147.
2. **G3 is unguarded and is the one remaining hole in the trust root.** D140 makes it worse.
3. **Hub spec §3's compromise claim needs rewording** even after H4 (G9).
4. **H5 needs a second clause** for the model-facing channel (G4).
5. **G8 is a legal exposure**, not only a security one.

---

## 5. Open

- **OPEN-5:** A10 / G3 — build pipeline integrity. Separate signing identities, two-party release
  approval, reproducible builds, transparency log. Not designed. Blocks nothing this week; blocks a
  pilot with a security-conscious buyer.
- **OPEN-6:** Is standalone a phase-one *customer* configuration or a trial/development mode? If
  nobody ships standalone in phase one, D140's self-updater defers entirely and G3's automatic reach
  shrinks to zero.
- **A11 out of scope** — revisit if a customer's threat model requires it.

## 6. Verification

Nothing here is measured. G1 is reasoned from `main.js` and `broker.d.ts`, not demonstrated — the
review estimates an afternoon to demonstrate against a stub `NamedPipeBroker`, and doing so converts
a reasoned finding into a regression test. Adversary capabilities are assumptions; A1's assumed
inability to elevate depends on the fleet having no local admin, which is single-source from one
design partner.
