# Consent Protocol — Two-Step Design (D130)

**Date:** 2026-09-03
**Implements:** D130. Closes G1 / review §1.1, demonstrated in
`client/docs/CONSENT-SURFACE-2026-09-03.md`.
**Filed:** `client/docs/2026-09-03-consent-protocol-design.md`, 2026-09-03, from the founder's handover of the same date. Referenced from D130 in `docs/decisions/DECISION-REGISTER.md` (repo root). Content below is as handed over; only this line was added.
**Status:** design. Must land in the `NamedPipeBroker` design **before the pipe protocol is
written** — it changes the protocol.
**Grounded in:** `client/src/broker/broker.d.ts` (the contract), `main.js`
`broker:consentAndExecute`, `renderer.js` `askConsent()`.

---

## 1. Why the obvious fix is the wrong one

The review offered two shapes: a **cheapest honest form** (broker renders text, returns a nonce,
approval binds to the nonce, broker stores the rendered text in the audit record) and a **strong
form** (broker-owned consent window in the user's session).

The cheap form as described still passes the proposal back at execute time, so it *detects*
substitution rather than preventing it. But reading the contract, there is a variant that costs no
more and prevents it outright:

> **The broker keeps the proposal. The agent gets a nonce and never sends a proposal again.**

`execute()` currently takes `(proposal, consentToken)`. If the broker holds the proposal against the
nonce it issued, then **nothing the agent sends at approval time can change what runs.** There is no
second proposal to swap. The attack in §3 of the demonstration has no surface to attack.

This is strictly stronger than hash comparison and strictly simpler: one fewer object on the wire,
and no hash to get wrong.

---

## 2. Contract change

### Removed

```ts
mintConsentToken(proposal: Proposal): ConsentToken;
execute(proposal: Proposal, consentToken: ConsentToken): Promise<ExecutionResult>;
```

### Added

```ts
/**
 * Step 1. Broker validates, renders the consent text ITSELF from the signed catalog,
 * and retains the proposal against a single-use nonce. The agent MUST display
 * `rendered` verbatim and MUST NOT construct consent text of its own.
 */
prepareConsent(proposal: Proposal, opts: { locale: string }): ConsentRequest;

/**
 * Step 2. The user approved. The broker re-validates, mints its own token internally,
 * and executes THE PROPOSAL IT RETAINED. The agent cannot supply a proposal here.
 */
execute(nonce: string): Promise<ExecutionResult>;
```

```ts
export interface ConsentRequest {
  /** Single-use, unguessable, short-lived. The only thing the agent holds. */
  nonce: string;
  /** Exactly what must appear on screen. Built by the broker from catalog `plain/*`. */
  rendered: {
    title: string;      // "Permission needed — Low risk"  (tier label, broker-authored)
    what: string;       // catalog plain.what
    detail: string;     // "flush_dns()" — capabilityId(param=value)
    rollbackNote: string | null;  // present when capability.rollback !== null
  };
  /** Epoch ms. Same 120 s window the old ConsentToken used. */
  expiresAt: number;
  /** For the agent's own logging only. Not required at execute time. */
  capabilityId: string;
  tier: Tier;
}
```

`ConsentToken` becomes **internal to the broker**. It no longer crosses the boundary. It stays in
the audit record as `consentTokenId`, so the existing trail shape is preserved.

### `Gate` gains one member

```ts
| "consent"   /** The nonce was unknown, expired, or already used. */
```

Ordered last — it is the only gate that fires after a user gesture.

### `AuditRecord` gains two fields

```ts
/** The nonce this execution was authorised by. Ties the record to a specific rendering. */
consentNonce?: string;
/** What the BROKER rendered. Not what the agent claims it drew. */
consentRendered?: ConsentRequest["rendered"];
```

**This is the field that fixes the demonstration's core complaint.** §3 of that document observes
that no field in the audit record could distinguish an approved `reset_adapter` from an approved
`flush_dns`. `consentRendered` is that field.

---

## 3. Flow

```
agent                                broker (privileged)
  │
  │ prepareConsent(proposal, {locale})
  ├───────────────────────────────────►
  │                                   validate()  ── refuses → audited, gate set, no nonce
  │                                   render text from signed catalog
  │                                   store {nonce → proposal, rendered, expiresAt}
  │ ◄───────────────────────────────── ConsentRequest
  │
  │ display `rendered` verbatim
  │ user clicks Approve
  │
  │ execute(nonce)
  ├───────────────────────────────────►
  │                                   look up nonce → proposal   ── miss/expired/used
  │                                   burn nonce (single-use)        → audited outcome:"refused",
  │                                   re-validate retained proposal     gate:"consent"
  │                                   mint token internally
  │                                   run THE RETAINED proposal
  │                                   audit with consentNonce +
  │                                     consentRendered
  │ ◄───────────────────────────────── ExecutionResult
```

**Re-validation at step 2 is retained.** State can change inside the 120 s window — a machine can
come back online between render and click, which would invalidate `reset_adapter`'s
`machineOnline: false` precondition. Re-validating catches that, and it is why the existing
`execute()` re-validates today.

**Nonce is burned before execution**, not after, so a duplicated approval cannot run twice even if
the first execution is slow or throws.

---

## 4. Rules the implementation must hold

1. **The broker renders. The agent displays.** Move the string construction in `renderer.js`'s
   `askConsent()` into the broker. The tier label ("Low risk" / "This will disrupt your
   connection") is broker-authored, not catalog text, so it must be built broker-side too.
2. **The agent has no path to consent text.** After this change there is no reason for the agent to
   read `plain/*` from the catalog for consent purposes. If it can construct consent text, someone
   will.
3. **One outstanding `ConsentRequest` per session at a time.** Bounds memory in the service and
   removes any question about which pending render a click belongs to.
4. **A `consent`-gate refusal is audited.** The demonstration's attack must, after D130, produce
   `outcome: "refused"`, `gate: "consent"`, **with `consentRendered` on the record** — so the trail
   shows what the user was actually shown when someone tried to run something else.
5. **`locale` is a required parameter, not an afterthought.** Rendering moves into the broker, and
   the broker only has the signed catalog. Every `plain/*` string is currently English and signed,
   so localisation becomes a catalog-signing event per language. Taking `locale` now costs nothing
   and avoids a contract change later. (Relates to the unscheduled accessibility and localisation
   item, and to Q34/Q35.)
6. **`InProcessBroker` implements the same protocol.** The demo build changes too. Both
   implementations behind one contract is the property `broker.d.ts` exists to protect.

---

## 5. What this does not fix

**A compromised agent can still draw different pixels than the text it was handed.** It receives
`rendered` and is trusted to paint it. Nothing in an unprivileged process can be trusted to paint
honestly.

What changes is that the **lie is now detectable and attributable**: the audit record contains what
the privileged half rendered, so a post-incident review can establish that the displayed text and
the executed action disagreed. Before D130 that was unknowable.

**The strong form — a broker-owned consent window in the user's session — is deferred.** Reasoning,
so it is a decision rather than an omission: it requires a privileged service painting UI into an
interactive session (session-0 isolation, `WTSQueryUserToken`, `CreateProcessAsUser`, and a UI
framework inside the privileged process). That is exactly the growth of the privileged surface that
D98 exists to prevent, and it materially expands `BROKER-SURFACE.md` — the document EDR
allowlisting depends on. **Revisit if a security review requires it**; it is the correct answer for a
high-assurance buyer and the wrong trade for Phase 1.

---

## 6. Acceptance

The three `XFAIL` lines in `client/test/consent-surface.test.mjs` pass:

- the broker refuses to execute an action whose consent card it did not issue
- no consent token is minted for the unseen proposal
- the audit trail does not record the unseen action as consented

Plus, added to that test:

- the refusal is audited with `gate: "consent"` and carries `consentRendered`
- the positive control still passes: shown `reset_adapter`, ran `reset_adapter`, succeeded, audited
- `execute()` with an expired nonce is refused and audited
- `execute()` with a replayed nonce is refused and audited
- a machine that comes online between `prepareConsent` and `execute` causes an
  `machine-state`-gate refusal, not an execution

The stub pipe service in `test/helpers/pipe-broker-service.mjs` needs the two-step protocol added.
The test file already exits 1 the day the XFAILs pass, with instructions to promote them — that
mechanism is correct and should be kept.

---

## 7. Consequences elsewhere

**D129 gets stronger for free.** For ticket filing, "the broker mints and audits, the agent
transmits, the hub verifies" now has the broker retaining the payload it rendered consent for. The
hub's hash check becomes a second line rather than the only one.

**D124's pattern is unchanged in shape** — propose → validate → show exactly what will happen →
single-use token → execute → audit — but "show" is now performed by the party that acts.

**H3e is enforced structurally rather than by convention.** "The model never authors consent text"
was previously true because the code happened to read from the catalog. After D130 the agent has no
way to author it.

---

## 8. Honesty ledger

- Nothing here is measured. It is a design against a demonstrated finding.
- The `execute(nonce)` variant is my proposal, not the review's. The review offered hash comparison;
  this keeps the proposal broker-side instead. I believe it is strictly stronger and simpler, but it
  has not been reviewed by anyone else and it is the one part of this document that has had no
  second opinion.
- Session-0 isolation and `CreateProcessAsUser` in §5 are cited from memory as the reason the strong
  form is expensive. `[VERIFY]` before using that reasoning to justify the deferral to a customer.
