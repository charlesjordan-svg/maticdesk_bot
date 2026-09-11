# D130 — renderer click-through check

**Who runs this:** Charles. It needs an elevated window and a UAC prompt, so no automated session can.
**How long:** about ten minutes.
**Why it exists:** twelve headless checks already run the real `Agent`, `HubClient`, live hub, model,
broker and two-step consent (`../eval/e2e-hub-consent.mjs`, `../test/consent-surface.test.mjs`).
**They cannot reach the half that matters most.** D130's whole purpose is *what the user sees*; the
broker renders `rendered` and the guarantee is that the Electron renderer displays it verbatim. No
headless test can see a screen.

**Why now.** The renderer contract is about to be frozen into a wire format (the named-pipe
protocol), and a wire format built on an unverified contract is the expensive kind of mistake. B1
went ahead of this check on 2026-09-03 because it is control-plane schema and touches neither the
renderer nor the pipe; the pipe protocol must not.

---

## What "verbatim" means here

The broker builds nine fields in `renderConsent()`
(`../src/broker/in-process-broker.js`). Eight are displayed by `askConsent()`
(`../src/renderer/renderer.js`); the ninth is metadata.

| Field | Where it should appear on the card |
|---|---|
| `title` | The headline — *"Permission needed — …"* |
| `what` | The line under the headline |
| `detail` | The `capabilityId(param=value)` line, in mono and subordinate |
| `detailPlain` | **D248, added 2026-09-11.** The plain-language line ABOVE `detail` — "Restart the Print Spooler service." It is catalog text the broker assembled, so it is compared field for field like the rest. **Null for a capability with no parameters (`flush_dns`), and then no element is drawn at all** — an empty labelled row would be a finding |
| `rollbackNote` | Its own line. Styled as a **warning box** on R2, as quiet text on R1 |
| `notice` | Explain panel → *"What you will notice"* |
| `undo` | Explain panel → *"Can it be undone"* |
| `why` | Explain panel → *"Why it usually helps"* |
| `risk` | Explain panel → *"Risk level"* |
| `locale` | **Not displayed.** Recorded in the audit only — see §5 |

The explain panel is behind the **"What is this, and why?"** button and is collapsed by default.
**Open it every time** — half the fields live there and they are the ones nobody has ever looked at
on screen.

One string on the card is *not* from `rendered`: **"Why this, here"** is `proposal.reasoning`, the
model's own sentence, and it is labelled as such. It is the only model-authored text on the card and
it must stay labelled.

---

## Setup

```bash
cd client
npm.cmd test
```

Expect 277+ assertions, 0 expected failures. If that does not pass, stop — nothing below means
anything.

Then, from an **elevated** PowerShell window in `client/`:

```bash
npm.cmd run start:elevated
```

Scenarios 1 and 2 are tier-0 and need no key. **Scenario 3 needs `ANTHROPIC_API_KEY` in `.env`.**
Fault injection and the exact phrasings are in `DEMO-RUNBOOK.md` §2 — use `-Fault dhcp` for
Scenario 2, never `-Fault network` (§3.2).

The audit trail is `client/audit/audit.jsonl`, one JSON object per line. Read the broker's side of
the comparison with:

```bash
npm.cmd run show-consent
```

`-- --all` for every rendered card, `-- -n 3` for the last three. It prints the eight displayed
fields in the order they appear on the card, marks which live in the explain panel, and flags a
`null` field as one that should **not** appear.

**`npm.cmd test` writes to this same log**, so it mixes test records with app records — the `at`
timestamp tells them apart, and `reset-demo` clears the file so a rehearsal starts from an empty
trail. Note that it clears it: do not reset between using the app and reading the record.

---

## 1. Three scenarios, card shown, approved, executed

For each of the three demo scenarios: get to the consent card, **open the explain panel**, approve,
confirm the action ran.

| Scenario | Card shown | Explain panel opens | Approved | Executed | Notes |
|---|---|---|---|---|---|
| 1 — printer offline | ☐ | ☐ | ☐ | ☐ | |
| 2 — no network (`-Fault dhcp`) | ☐ | ☐ | ☐ | ☐ | |
| 3 — escalation (cloud) | ☐ | ☐ | ☐ | ☐ | Scenario 3 ends in `escalate`; if no consent card appears, say so — that is the expected shape, not a failure |

---

## 2. Field for field against `consentRendered`

**This is the actual test.** Pick one executed action from §1 — Scenario 2 is the richest — and
compare the card you saw against the `consentRendered` object in its audit record.

Do not skim it. Read the eight displayed fields off the screen and off the record, and tick each
only if the strings match **character for character**.

| Field | On screen | In `consentRendered` | Match |
|---|---|---|---|
| `title` | | | ☐ |
| `what` | | | ☐ |
| `detail` | | | ☐ |
| `detailPlain` | | | ☐ |
| `rollbackNote` | | | ☐ |
| `notice` | | | ☐ |
| `undo` | | | ☐ |
| `why` | | | ☐ |
| `risk` | | | ☐ |

**Also check the two things a field comparison misses:**

- ☐ `rollbackNote` is styled as a **warning box** if the tier is R2, quiet text if R1.
- ☐ **Nothing on the card came from anywhere else.** If any visible string is not in
  `consentRendered` and is not the labelled `proposal.reasoning`, that is a D130 defect and the most
  important thing this check can find — the renderer is not allowed to be able to compose consent
  text.

---

## 3. Supersede (D166) — deny, then ask again inside 120 s

1. Get a consent card.
2. Click **Deny**.
3. Within 120 seconds, type another complaint that produces a proposal.

| Check | ☐ |
|---|---|
| The second card appears and is approvable | ☐ |
| The first request is audited with `outcome: "refused"`, `gate: "consent"` | ☐ |
| Its `message` says **superseded** | ☐ |
| Its `consentRendered` is the **first** card's text, not the second's | ☐ |
| The trail reads: first rendered → first superseded → second rendered → second run | ☐ |

That last line is the point of D166. Supersede was chosen over refusing the second call precisely so
the honest path keeps working, and the audit keeps the forensic signature. See
`2026-09-03-consent-protocol-attack-notes.md` F2.

---

## 4. Expired nonce — leave a card for over 120 s, then approve

1. Get a consent card. **Do not click.**
2. Wait more than 120 seconds (`CONSENT_TTL`).
3. Click **Approve**.

| Check | ☐ |
|---|---|
| The click is refused | ☐ |
| The refusal message is about expiry, not "unknown nonce" | ☐ |
| It is audited with `outcome: "refused"`, `gate: "consent"` | ☐ |
| `consentRendered` on the refusal is **the text the user actually saw** | ☐ |
| **Nothing executed** | ☐ |

The broker retains expired nonces past their TTL for exactly this reason: a late click should be
refused *with the text it was rendered for*, not as an unknown nonce.

---

## 5. Worth noticing while you are in there

Neither is a required check; both are cheap to observe once and expensive to discover later.

- **`locale` is recorded but never shown.** If the catalog does not carry the requested locale, the
  broker falls back and records the locale it actually used — and the card says nothing about it. A
  user asking in one language could be shown a card in another with nothing on screen indicating a
  substitution. Attack notes F4 names the fallback; whether the *card* should say so is undecided.
  If you have an opinion after seeing it, it is a decision worth recording.
- **The explain panel is collapsed by default.** It exists because someone approved an action and
  then said they felt they had approved it without enough information. Ask yourself, looking at the
  collapsed card alone: was that fixed, or was it moved one click away?

---

## Result

**Date run:** 2026-09-03 (night)
**Build / commit:** `8501ef1`, plus the uncommitted test and launcher fixes made the same evening
**Run by:** Charles, on the development machine
**Verdict:** **§1 and §2 PASS — the renderer displays what the broker rendered.** §3 partially
observed, §4 not attempted. See below; this is a partial pass and should not be cited as a full one.

### What was verified

**§2, the field-for-field comparison — the check this file exists for. PASS.**

One `flush_dns` card, reached through the app, explain panel opened, **approved**, executed for
real. Audit record `2026-09-04T00:36:28.675Z`, `outcome: "success"`, `detail: {"flushed": true}`.
All eight displayed fields matched `consentRendered` on screen — `title`, `what`, `detail`, and the
four in the explain panel (`notice`, `undo`, `why`, `risk`).

Two negative checks also held:

- `rollbackNote` is `null` for `flush_dns`, and **no rollback line appeared on the card.** The
  earlier `renew_dhcp` card in the same session did show one, and that capability has a non-null
  rollback — so the field is driven by the data, not by the renderer.
- **Nothing appeared on the card that was not in `consentRendered`**, other than the labelled
  "Why this, here" line, which is `proposal.reasoning` and is the only model-authored text allowed
  there.

**That is the D130 guarantee, confirmed on a screen for the first time.** Until this run it had only
ever been rendered into an assertion.

**§1, the scenarios. Partial.** The `flush_dns` path was completed end to end as above. The same
session's log also shows `[cloud] claude-haiku-4-5 chose escalate` (the Scenario 3 path) and a
`renew_dhcp` card under an injected DHCP fault (Scenario 2), but neither was carried through to an
approved execution with a field comparison. **Only `flush_dns` is fully evidenced.**

### What was NOT verified, and must not be claimed

- **§3, supersede (D166) — observed, not tested.** A superseded-consent record was seen in the
  Broker Inspector during an earlier session (`"request superseded by a new consent request for
  renew_dhcp before any decision reached the broker - nothing was executed"`), which is the right
  shape. But that was incidental, the audit log has since been cleared by `reset-demo`, and the
  deliberate sequence in §3 — deny, then a second request inside 120 s, then confirm the superseded
  record carries the **first** card's text — was never run. The headless equivalent passes
  (`consent-surface.test.mjs` §5); the on-screen half is open.
- **§4, the expired nonce — not attempted.** Nobody left a card unclicked for over 120 s and then
  approved it.
- **§5's two observations** were not recorded either way.

### Notes from the run, worth keeping

- **`npm.cmd test` writes to this same audit log**, so `audit/audit.jsonl` mixes test records with
  app records. The 00:29:51 and 00:38:30 entries are test runs; only 00:36:28 came from the app.
  `reset-demo` clears the file, which is what makes a rehearsal trail readable.
- **Read the broker's side with `npm.cmd run show-consent`.** It was a pasted one-liner during this
  run and failed twice — once with ENOENT after `reset-demo` deleted the log, once with "Illegal
  return statement", because top-level `return` is not legal in `node -e`. It is a script now.
- Two test-environment traps were found and fixed the same evening: `broker.test.mjs` case 8
  asserted the *unelevated* behaviour while running elevated, and case 10 assumed a healthy machine
  while a demo fault was injected. Because the npm script chains with `&&`, either one aborted the
  remaining eight test files — so a run that looked like a D130 failure never reached
  `consent-surface.test.mjs` at all.
- `start:elevated` launched `npx electron .` inside a `cmd /c` window that closed on error, and
  `npx.ps1` is blocked by the same execution policy that makes it `npm.cmd` here. It now launches
  the local `electron.cmd` directly.

### To close this file completely

Run §3 and §4 deliberately, in one sitting, and add the result above. Both are consent-layer and
**neither needs elevation** — the broker writes `consentRendered` on refusals and on
needs-the-broker denials as well as on successes.
