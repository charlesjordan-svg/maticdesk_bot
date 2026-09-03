# D130 — renderer click-through check

**Who runs this:** Charles. It needs an elevated window and a UAC prompt, so no automated session can.
**How long:** about ten minutes.
**Why it exists:** twelve headless checks already run the real `Agent`, `HubClient`, live hub, model,
broker and two-step consent (`../eval/e2e-hub-consent.mjs`, `../test/consent-surface.test.mjs`).
**They cannot reach the half that matters most.** D130's whole purpose is *what the user sees*; the
broker renders `rendered` and the guarantee is that the Electron renderer displays it verbatim. No
headless test can see a screen.

**Do this before B1.** The renderer contract is about to be frozen into a wire format (the named-pipe
protocol), and a wire format built on an unverified contract is the expensive kind of mistake.

---

## What "verbatim" means here

The broker builds nine fields in `renderConsent()`
(`../src/broker/in-process-broker.js`). Eight are displayed by `askConsent()`
(`../src/renderer/renderer.js`); the ninth is metadata.

| Field | Where it should appear on the card |
|---|---|
| `title` | The headline — *"Permission needed — …"* |
| `what` | The line under the headline |
| `detail` | The `capabilityId(param=value)` line |
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

The audit trail is `client/audit/audit.jsonl`, one JSON object per line. To read the last few
consent records:

```bash
node -e "const fs=require('fs');const L=fs.readFileSync('audit/audit.jsonl','utf8').trim().split(/\r?\n/).slice(-8).map(JSON.parse);for(const r of L)console.log(JSON.stringify({outcome:r.outcome,gate:r.gate,capabilityId:r.capabilityId,consentNonce:r.consentNonce,message:r.message,consentRendered:r.consentRendered},null,2))"
```

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

**Date run:**
**Build / commit:**
**Verdict:** ☐ D130 confirmed on screen  ☐ defects found (list below)

**Findings:**

<!-- Record what you saw here, including "everything matched". A blank result is indistinguishable
     from an unrun check, and this file is the only evidence that the human-facing half of D130 was
     ever verified. -->
