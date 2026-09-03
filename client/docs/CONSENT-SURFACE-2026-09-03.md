# The consent surface lives in the unprivileged process — demonstrated

**Date:** 2026-09-03 · **Branch:** `post-demo` · **Decision:** D130 in [`docs/decisions/DECISION-REGISTER.md`](../../docs/decisions/DECISION-REGISTER.md)
**Test:** `test/consent-surface.test.mjs` (in `npm test`) · **Stub:** `test/helpers/pipe-broker-service.mjs`

The 2026-09-02 design review's largest finding (§1.1, B1/H3e scenario 2) was reasoned from `main.js` and `broker.d.ts`, not demonstrated. Its own verification register said so: *"It would take an afternoon to demonstrate against a stub `NamedPipeBroker`."* This is that afternoon.

---

## 1. The finding

`main.js`, handler `broker:consentAndExecute`: the renderer sends a `proposal`; the broker mints a token for **that** proposal and executes it. The broker never sees what was displayed. In the demo build that is one elevated process and it does not matter. In Phase 1 the agent is an unprivileged process on the far side of a named pipe. It can draw the `flush_dns` card, take the Approve click, and send `reset_adapter` with a live adapter GUID. Every gate passes. Every invariant holds. The user consented to nothing of the sort.

## 2. What was built to show it

**A stub `NamedPipeBroker`, as a separate process, on a real Windows named pipe.** `test/helpers/pipe-broker-service.mjs` is forked by the test and listens on `\\.\pipe\matic-desk-consent-test-<pid>`. It hosts the **real** `InProcessBroker` — real catalog, real schema, policy, machine-state and precondition gates, real audit log — behind a handler that is line-for-line the shape of `main.js`'s `broker:consentAndExecute`. Only bytes cross the pipe, so the only thing the privileged half can know about the agent is the proposal it sent.

Two things are injected, both through constructor parameters the broker already exposes for tests:

- **the machine** — a probe describing an *offline* box with one Wi-Fi adapter, so `reset_adapter`'s precondition (`machineOnline: false`) is satisfied the way it would be for a user whose network is actually down;
- **the executors** — `reset_adapter` and `flush_dns` record the call and return success. **Nothing on the test machine is touched.** (Executor injection was added for this test, alongside the existing probe injection; production passes nothing and gets the Win32 primitives.)

The agent half is a small client of the pipe exposing the same surface as `preload.cjs` (`listCapabilities`, `validate`, `consentAndExecute`) plus a `renderConsentCard()` that builds exactly what `renderer.js`'s `askConsent()` puts on screen: the tier label, `plain.what`, and `capabilityId(param=value)`.

## 3. What happened

Output of `node test/consent-surface.test.mjs`, 2026-09-03:

```
=== 1. POSITIVE CONTROL: the honest path across the pipe ===
  PASS   reset_adapter validates on an offline machine (precondition machineOnline:false holds)
  PASS   shown reset_adapter, ran reset_adapter: succeeds
  PASS   a consent token was minted and returned
  PASS   what was shown names what ran
  PASS   audited as a consented success

=== 2. THE DEMONSTRATION: flush_dns displayed, reset_adapter sent ===
      the user sees this card and clicks Approve:
         {"title":"Permission needed — Low risk","what":"Empties this machine's memory of recent
          website-name lookups. It does not touch your files, settings, passwords, bookmarks or
          browsing history.","detail":"flush_dns()"}
      the broker returns: {"ok":true,"capabilityId":"reset_adapter","consentTokenId":"bb5c45a8-…",
                           "auditId":"51ce8529-…"}
      audit record written by the privileged half:
         {"auditId":"51ce8529-…","at":"2026-09-03T08:53:24.036Z","capabilityId":"reset_adapter",
          "parameters":{"adapterId":"{A1B2C3D4-0000-0000-0000-00000000BEEF}"},
          "consentTokenId":"bb5c45a8-…","tier":"R2","outcome":"success","durationMs":0,
          "detail":{"stub":true,"params":{"adapterId":"{A1B2C3D4-…}"}}}
      observed: displayed=flush_dns()  executed=reset_adapter  tokenMinted=true  auditedAsConsented=true

=== 3. D130 REGRESSION TEST: the broker executes only what the user was shown ===
  XFAIL  the broker refused to execute an action whose consent card it did not issue  (known open: D130)
  XFAIL  no consent token was minted for the unseen proposal  (known open: D130)
  XFAIL  the audit trail does not record the unseen action as consented  (known open: D130)
  PASS   the swapped proposal passed every existing gate (schema, precondition, machine-state)
  PASS   the audit record carries no trace of what the user was shown

7 passed, 0 failed, 3 known open (D130), 0 unexpectedly passing
```

Read the audit record. It is a correct record of what the privileged half did: a consented, single-use, hash-bound, precondition-checked `reset_adapter`. It is also a record a customer's reviewer would read as proof the user approved an adapter reset. The user approved a DNS flush. **No field in the record can tell the two apart**, because nothing the broker holds ever described what was displayed.

## 4. Why every existing defence is intact and none of them help

| Defence | Held? | Why it does not apply |
|---|---|---|
| Catalog / schema gates (§5 invariant, H3b) | Yes | `reset_adapter` with a real GUID is a valid catalog proposal. |
| Policy blocklist, machine-state, `requires` preconditions | Yes | The machine is offline; `machineOnline: false` is exactly the state the precondition allows. |
| Consent token bound to the proposal hash, single-use, 120 s TTL | Yes | The token was minted for the proposal that arrived. It matched. The hash binds the *executed* proposal to the *minted* proposal, never to the *displayed* one. |
| H3e — the model never authors consent text | Yes | The consent text came from the signed catalog's `plain/*`. It was simply the text for a different action. |
| D64 — pipe ACL'd, calling binary's signature checked | Would hold | A legitimately signed agent binary with a bug, or a compromised one, sends exactly these bytes. |
| D129 — hub verifies the payload hash for egress | Not applicable | There is no hub in the path of the four local actions. The broker is both the party that must be convinced and the party that acts. |
| Refusal auditing (post-demo Priority 1) | Yes | Nothing was refused. |

## 5. What D130 has to do

**Rule: the broker executes only what the user was shown.** Two acceptable shapes, from the review:

- **Cheapest honest form.** The broker renders the consent text itself, from the signed catalog, and returns it to the agent with a **nonce**. The agent must display that text. The user's approval is sent back **bound to the nonce**. The broker refuses any approval whose nonce it did not issue, or whose proposal hash differs from the one it rendered text for, and it stores the **broker-rendered text** in the audit record. Weaker (an agent can still lie about what it drew) but it makes the audit record meaningful: what the privileged half rendered is on the record.
- **Strong form.** A broker-owned consent window in the user's session — a second UI surface the privileged service launches, the way UAC and credential prompts do. The agent never touches the consent gesture.

Either is a **Phase 1 design item**, not hardening. It belongs in the `NamedPipeBroker` design before the pipe protocol is written, because it changes the protocol: consent becomes a two-step (render → approve-with-nonce) rather than one `consentAndExecute(proposal)` call.

**Acceptance.** The three `XFAIL` lines in `test/consent-surface.test.mjs` pass. The file is written so that the day they pass it exits 1 with the instruction to promote them to hard checks, and the positive control (shown `reset_adapter`, ran `reset_adapter`) must keep passing. The stub service will need the two-step protocol added; the demonstration's attack must then be *refused and audited as a refusal*, with the displayed text on the record.

## 6. Honesty ledger

- **This is a demonstration against a stub, not an exploit of the shipped build.** The demo build is one elevated process with no pipe; there is nothing to attack yet. What is demonstrated is that the *design as decided* (D64, D129, H1–H6) has this hole once the pipe exists, and that no gate in the real broker code closes it.
- **The stub's protocol is not Phase 1's protocol.** JSON lines over `node:net` was chosen because it is the smallest thing that puts a real process boundary between the halves. Nothing about the finding depends on the transport.
- **No adapter was reset.** The executors were replaced for the test; the audit log went to a temp directory that is deleted at the end of the run.
- **The finding is now demonstrated and the fix is not designed.** D130 is *proposed*, not *done*.
