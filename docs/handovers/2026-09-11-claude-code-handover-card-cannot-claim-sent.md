# Handover — the review card cannot say "sent" before the service desk has answered

**From:** Claude Code session, 2026-09-11
**Decision:** **D253**, register [`docs/decisions/DECISION-REGISTER.md`](../decisions/DECISION-REGISTER.md) §5.36
**Closes:** the item named as open in [`docs/handovers/2026-09-10-claude-code-handover-panel-re-export-built.md`](2026-09-10-claude-code-handover-panel-re-export-built.md) §9
**Charles:** *"fix the sent by you defect."*

---

## 1. What was wrong

`reviewTicket()`'s send handler wrote **"Sent by you"** into the card head **on the click** — before
`window.matic.fileTicket()` had been called, let alone answered. So a filing that then failed left
the card saying it had been sent, **three lines above a transcript note saying nothing was filed**,
with the card still on screen because the card does not go away when it is answered.

Two surfaces describing one thing differently is `700d920`'s defect exactly, one turn later. And
this is **the one screen in this product where a user approves data leaving the machine**, so it is
the screen whose claims have to be true.

## 2. The fix is a contract change, not a better string

The card **cannot** know the outcome — only the caller holds `filed`. So the fix is not "write a
better word later"; it is to stop the card being able to claim one at all.

`reviewTicket()` used to resolve with the approved draft or `null`. It now resolves with
`{ approved, report }`:

| Moment | Card head | Note where the buttons were |
|---|---|---|
| before the click | "Nothing has left this machine" | *(the buttons)* |
| on the click | **"Sending…"** | **"You chose to send this."** |
| `filed.ok` | "Sent by you" | *(unchanged)* |
| `filed.filed === false` | **"Not sent"** | *(unchanged)* |
| `filed.filed === null` | **"Sent, not confirmed"** | *(unchanged)* |
| cancelled | "Nothing was sent" | "Cancelled by you." |

**Three endings, because D213 has three.** The middle one is why this exists: `filed === null` is a
timeout, where the request went out and nothing came back, so neither "sent" nor "not sent" is a
fact. Picking one there is the confident guess D213 spent five surfaces avoiding.

`report(filed)` is called on **both** branches and **before either speaks**, so the card and the
spoken line cannot describe one filing differently. A cancel resolves with a `report` that does
nothing, so the caller never has to know which branch it is on before calling it.

## 3. A second defect of the same class, found by cancelling the card rather than reading it

The cancel note said *"Cancelled by you — nothing was sent."* and the caller's note three lines
below said *"Cancelled — nothing left this machine."* — **one fact about what the system did not do,
in two wordings, adjacent**, which is the whole of D245. It had been there since before the
re-export and no test caught it.

The split is now the one `persona.filing`'s own comment already names, and the one the send path
uses: **the card's note is the DECISION, the transcript's is the SYSTEM's half.** The card's note is
*"Cancelled by you."*

**The head label is not part of that duplication, deliberately.** The head carries a short status
for the *card* ("Not sent"); the transcript carries the *sentence* about the system ("Nothing was
filed."). D245 forbids one fact said twice in sentences; a card's own state label beside the card is
what "Sent by you" has always been, and removing it leaves an answered card with no state at all.

## 4. Pinned as the contract, not the wording

The rule this project has broken five times. The assertions read: the click writes no outcome; the
outcome derives from `filed`; a timeout is neither ending; the caller reports before it speaks; a
cancel still returns a callable `report`; each cancel note holds only its own half. **The words can
change without touching a test.**

**Seven mutations probed, all seven caught** — including the original defect reintroduced verbatim,
the caller never reporting, a timeout classed as a failure, the report moved after the success
branch speaks, and a cancel resolving with the bare draft again.

**One trap the probe found in the test itself:** reading the whole send handler for `"Sent by you"`
**passes on the defect**, because `report` is *defined* inside the handler and carries that string
legitimately. The assertion reads only what runs synchronously on the click. §10.5's class again,
this time inside a test rather than in the thing under test.

## 5. Driven, not reasoned about

All four endings were driven on `panel-check.html`, with the head sampled synchronously on the click
so the in-flight state is observed rather than assumed:

| | Head | Transcript note |
|---|---|---|
| success | "Sent by you" | "Stored as PLACEHOLDER-0001. The card above says what that does and does not do." (count 1 → 2) |
| unreachable | "Not sent" | "Nothing was filed." |
| timeout | "Sent, not confirmed" | "The service desk did not answer in time, so whether the ticket was stored is unknown…" |
| cancelled | "Nothing was sent" | "Cancelled — nothing left this machine." |

`"Sending…"` was observed in flight on all three send paths.

## 6. Honesty ledger

- **`npm.cmd test`: 17/17 files, 1144 assertions, 0 failed** (up from 1131). `panel:check` clean.
- **Still nobody has watched any of this in Electron.** [`client/docs/PANEL-RENDERER-CHECK.md`](../../client/docs/PANEL-RENDERER-CHECK.md)
  remains unrun; its §6.5 and §6a rows are rewritten for the states above, and the "known defect"
  warning row is gone because the defect is gone. The check page has no voice, so nothing on this
  path has been *heard*.
- **This was a renderer defect throughout.** The delivery draws the card's states correctly; nothing
  in `matic-panel.css` or `matic-panel.app.css` changed.
- **D242 (the tickets band) and D248 (the consent-call gloss) both remain PROPOSED and await
  Charles.** Neither was touched.
