# Consent protocol — attack notes before implementation (D130, A0)

**Date:** 2026-09-03. **Against:** `client/docs/2026-09-03-consent-protocol-design.md`, specifically
the `execute(nonce)` variant its §8 flags as having had no second opinion.
**Handover:** `Downloads\2026-09-03-claude-code-handover-first-build-steps.md` Task 1, "try to break
it" — the three named probes plus whatever else fell out of reading the code the design sits on
(`client/src/broker/in-process-broker.js`, `client/src/main/main.js`, `client/test/consent-surface.test.mjs`).

**Verdict: the design holds.** Nothing found needs the review's hash-comparison fallback. Two
things the spec leaves implicit must be pinned in the implementation or the guarantee leaks in the
in-process build (F1, F2). One naming mismatch is recorded so nobody "fixes" the wrong thing (F5).

---

## The guarantee, stated precisely

D130's two-step protocol guarantees exactly one thing: **what the broker rendered is what ran, and
the audit record proves it.** It does not and cannot guarantee that the unprivileged agent painted
what the broker rendered (design §5). Every probe below is read against that statement, because
several "attacks" turn out to be the §5 residual wearing a different coat.

---

## F1 — In-process, the agent still holds a reference to the proposal the broker retained

**Probe:** "the agent never sends a proposal again" is true over a pipe, where the broker's copy is
whatever it deserialised. In `InProcessBroker` the agent passes an object and, if the broker stores
that object, the agent still holds the same reference. `prepareConsent(reset)` → card rendered for
adapter A → agent sets `proposal.parameters.adapterId = B` → `execute(nonce)` re-validates and runs
against B. The rendering was honest; the execution was not; the audit record's `consentRendered`
would show A and `parameters` would show B — detectable, but the design's claim is *prevention*.

**Result:** real, and trivial to fix. **The broker retains a `structuredClone` of the proposal and
returns a clone of the `ConsentRequest`.** Pinned by `test/broker.test.mjs` §6: mutate the original
after `prepareConsent`, execute, observe the retained proposal ran. Over the pipe this is free; in
process it is the difference between a guarantee and a convention.

## F2 — Two outstanding nonces, and what "one outstanding request per session" must mean

**Probe:** a compromised agent calls `prepareConsent(X)` (shown), then `prepareConsent(Y)`, then
`execute(Y)`. Rule 3 says one outstanding request; it does not say what the second call does.

Two candidate semantics:

- **Refuse the second call while one is outstanding.** The attacker waits 120 s for X to expire and
  runs Y with a card the user never saw — delayed, not prevented. And it breaks the honest path: a
  user who clicks *Deny* and types another complaint inside two minutes is refused, because the
  denied request is still outstanding and there is no cancel in the contract.
- **Supersede: the new request burns the outstanding one, and the supersession is audited.** Y runs
  immediately, with `consentRendered` = Y's text. Same as the §5 residual — the agent painted X's
  pixels over Y's approval — *but the trail now shows X rendered, X superseded, Y rendered, Y run,
  all inside a few hundred milliseconds*, which is the forensic signature of exactly this attack.

Neither prevents the §5 residual; nothing short of a broker-owned window does. Supersede is chosen
because it is the only one that keeps the honest path working and leaves evidence. **Implementation:
a new `prepareConsent` burns any outstanding nonce and writes an audit record for it
(`outcome: "refused"`, `gate: "consent"`, `consentRendered` = the superseded text, message says
"superseded").** Pinned in `test/consent-surface.test.mjs` §5.

## F3 — Can step-2 re-validation be made to pass against a state step 1 would have refused?

**Probe:** the agent controls only *timing*. Both validations read the privileged probe. The agent
can wait for the machine to become favourable within the window (e.g. wait for the network to drop
so `reset_adapter` passes) — but the proposal was already validated and rendered at step 1 against a
state where it *did* pass, so waiting gains nothing. The reverse (machine recovers, so the retained
`reset_adapter` should now be refused) is what re-validation exists for and is acceptance item 4.

**Result:** holds. Order inside `execute()` matters and is fixed: **look up → burn → re-validate →
mint → run.** Burn-before-anything means a duplicated approval cannot run twice even if re-validation
or the executor is slow, and a concurrent second `execute(nonce)` sees `used` synchronously before
the first one awaits anything.

## F4 — Can `locale` vary the rendered text between what the broker stores and what it returns?

**Probe:** render once at `prepareConsent`, store, return the same object. The only lever is the
locale string. The catalog is English-only and signed; an unknown locale must not select anything.

**Result:** holds, with one rule: **unknown locale falls back to the catalog's language, and the
request echoes the locale actually used** (`ConsentRequest.locale`, also inside `rendered.locale`),
so the audit record says what language the user was shown. The agent cannot vary the text by locale
because there is one text. When a second language is signed into the catalog this becomes a real
lookup, and the fallback-and-echo rule still holds.

A second, adjacent point: `rendered.detail` is `capabilityId(param=value)` built from parameters.
**It is safe only because validation runs before rendering.** `serviceName` is an enum,
`adapterIndex` an integer, `adapterId` is checked against the live adapter list — so no model-supplied
free text can reach the card. Do not reorder validate and render.

## F5 — The "machine-state" refusal in acceptance item 4 fires the `precondition` gate

**Probe:** design §6 says a machine coming online mid-window produces a `machine-state`-gate
refusal. In code, `requires.machineOnline` is enforced by `checkPreconditions()`, which emits
`gate: "precondition"`; `machine-state` is the gate for adapter/service reads in `checkPolicy()`.
Both are derived from the live probe. `broker.d.ts`'s `Gate` type never listed `"precondition"`
although the code and `test/preconditions.test.mjs` have used it since 2026-09-02.

**Result:** not a security finding, a naming drift. **`Gate` gains `"precondition"` (drift fix) and
`"consent"` (D130).** The acceptance test asserts `gate === "precondition"` and says why. Nobody
should rename the precondition gate to satisfy the spec's wording.

## F6 — What does a refused nonce carry as `consentRendered`?

**Probe:** acceptance item 1 wants the consent-gate refusal to carry "what the BROKER rendered for
the card the user actually saw". A forged nonce has no rendering of its own.

**Result:** **the record carries the rendering for the presented nonce if the broker still knows it
(replayed, expired, superseded), otherwise the rendering of the outstanding request — the card on
screen at the moment of the click.** Burned and expired nonces are kept for ten minutes after expiry
so a late or replayed click is refused *with its text*, not as an unknown. Bounded: one outstanding
plus a ten-minute tail.

---

## Smaller points, checked and closed

- **Nonce entropy:** `randomUUID()`, 122 bits. Not guessable inside a 120 s window.
- **Executor throws after burn:** the nonce is gone; the user re-consents. Correct — the alternative
  (un-burn on failure) is a replay window.
- **`consentTokenId` stays on the record.** The token is minted internally at step 2 and never
  crosses the boundary, so the existing trail shape is preserved and `consentNonce` sits beside it.
- **The original demonstration's two cards are mutually exclusive.** `flush_dns` requires
  `machineOnline: true`; `reset_adapter` requires `machineOnline: false`. No single machine state lets
  the broker render both, so "show flush_dns, run reset_adapter" cannot even be *set up* against the
  two-step broker. The regression test therefore uses `restart_service(spooler)` (valid on any
  machine) as the shown card and `reset_adapter` as the intended substitution.
- **Explain-panel text** (`plain.notice`, `plain.undo`, `plain.why`, the tier summary) was still
  read from the catalog by the renderer. Design rule 2 says the agent should have *no* path to
  consent-time catalog text, so **the broker renders those too** (`rendered.notice`, `.undo`, `.why`,
  `.risk`). The audit record grows by a few hundred bytes per execution; the renderer now reads
  nothing from the capability to draw the card.

## What this does not change

Design §5 stands in full: a compromised agent can paint anything. After A0 the lie is attributable
(the record says what the privileged half rendered); the strong form — a broker-owned consent window
in the interactive session — is the only prevention and stays deferred for the reasons §5 gives,
with its `[VERIFY]` on session-0 isolation still open (Task 5 of the handover covers the Win32 side).

## Honesty ledger

- Half an hour of reading by one person who then implemented it. Not an independent review.
- F1 is the only probe that found a way to make the executed proposal differ from the rendered one,
  and only in the in-process build.
- None of this is measured. It is reasoning against the code as it stands on 2026-09-03.
