# Claude Design handover — panel follow-ups for the next delivery

**Date:** 2026-09-10. **From:** the app-side copy-and-vocabulary pass (register §5.29, D244–D245).
**Reads with:** `2026-09-10-claude-design-handover-agent-panel.md` (the brief the current panel
answers) and `2026-09-10-claude-code-handover-panel-integration-built.md` (what integrating it
found).

**Why this file exists.** `63011a4` set the rule: a change to the DESIGN is recorded and goes into
the next delivery rather than living in `client/src/renderer/panel/matic-panel.app.css` for ever.
The panel arrived as a harness with no source files, so the direction of truth is inverted — the
app cannot be the place a design decision is made, or the delivery becomes a lie without a byte of
it changing. Everything below is design. **None of it has been restyled in the app.**

**What is NOT in this file:** anything we fixed ourselves, because it was app glue and not design.
Those are in the register at §5.29 and in the commit, and the next delivery has nothing to carry
for them.

---

## 1. Carried forward from `63011a4` — still open

| # | Item | Asked for by |
|---|---|---|
| 1.1 | **The wordmark is centred in the rail.** | Charles, against the running panel, 2026-09-10 |
| 1.2 | **The interactive chrome takes the avatar's blue.** The delivery's accent `#5980a6` IS `--matic-avatar-paper-line` — the quietest blue on the chassis, the one it uses for a ruled line on a sheet of paper — so every button, band and label was drawn in it while the pods, collar and halo sat beside them unused. The app added `--matic-ui-live`, `-deep`, `-wash`, `-edge` under the delivery's own prefix, copied by value from `matic-avatar.css` and pinned to it by a test. **No delivered token is redefined.** | Charles: *"Can we add some color to the menus that open and the buttons. Match with Avatar. Looks bland all one color."* |

Both live in `matic-panel.app.css` §d today and should come back as part of the delivery.

---

## 2. New, from a screenshot of a running session (2026-09-10)

### 2a. The disclosure bands carry a square and a chevron — two affordances on one control

*"What I can see about this machine"* and *"Tickets you've opened"* each have a small square and a
chevron. The square reads as a **checkbox**, which implies selection rather than disclosure.

**The markup was checked, and it is not a checkbox.** Both triggers are `<button>`; `.glyph-machine`
and `.glyph-ticket` are decorative `<span>`s with a 1px border. A screen reader announces a button.
**So the accessibility defect that was feared does not exist** — but the visual ambiguity is real,
and it is yours to resolve. One control should have one affordance.

*Fixed here, because it was ours:* neither trigger carried `aria-expanded`, so the open state was
drawn and not announced. `toggleBand()` keeps it in step now. Nothing for a delivery to carry.

### 2b. Prose is set in monospace — a question, not a fault

`CASE NOTE` and `ALREADY CHECKED` on the ticket review card are sentences, rendered in
`--matic-ui-font-mono` (`.ticket-review .fixed`). Mono signals machine output.

**There is a real argument the other way and it may be the one you intended:** mono signals
*verbatim, not paraphrased*, which is exactly the property D128 and D130 want of a payload view —
this is the one card in the app through which user data leaves the machine, and everything on it is
either the user's own words or the model's, shown unedited. **Please say which you meant.** If it
was deliberate we will write it down rather than keep re-noticing it.

Note that the glossed rows (D244, below) sit in the same mono column, so an answer here decides
their treatment too.

### 2c. The label column fails AA in light and passes in dark — measured

`CATEGORY` / `GOES TO` / `CASE NOTE` / `ALREADY CHECKED` are `--matic-ui-ink-quiet` at 11px on
`--matic-ui-surface`. Contrast ratios, computed from the declared token values:

| | light | dark |
|---|---|---|
| `--matic-ui-ink-quiet` on `--matic-ui-surface` | **3.53:1** | 4.65:1 |
| `--matic-ui-ink-quiet` on `--matic-ui-ground` | **3.82:1** | 5.10:1 |
| `--matic-ui-ink-muted` on `--matic-ui-surface` | 5.41:1 | 6.93:1 |

WCAG 2.1 AA wants **4.5:1** for normal text and 3:1 for large (≥18.66px bold, or ≥24px). **11px
uppercase is not large.** So light fails AA for every use of `ink-quiet` as body-sized text, and
dark passes. The quiet token is used well beyond this card — the rail's sub-lines, the band notes,
the inspector's step labels — so this is a token decision, not a card fix.

**This is arithmetic over two hex strings, not a measurement of anything on a machine**, and it does
not join the four measured numbers in register §10.3. Accessibility conformance is an open question
for this product and is the kind of thing a procurement review measures for itself.

*Why it mattered to this pass:* D244 puts a second line in that column (the stored enum under its
plain-language gloss). We deliberately kept that line at `ink-muted` (5.41:1) and bought its
subordination by darkening the gloss to `--matic-ui-ink` instead, rather than adding a second
instance of a suspected accessibility defect to answer a copy one.

### 2d. The `+` in the top right is unlabelled — visually

It is `<button class="inspector-trigger">` with both `title` and `aria-label` reading *"Show what I
proposed, checked and did"*, so it has an accessible name and a tooltip. The glyph is
`.crosshair` — two 1px rules — and to anyone who has not hovered it reads as **"+" / "add"**, which
is the opposite of what it does.

It opens the inspector, which is the developer surface D240 hid: state names, capability ids,
source lines, broker JSON. A visible label, or a glyph that does not read as "new", or both.

---

## 3. One string where the app now differs from the delivery, and why

The rail's idle sub-line under *"Ready when you are"* is **"Nothing in progress"** in
`client/src/renderer/index.html`; the delivery's word is **"Nothing running"**.

"Nothing running" means no task is in progress. It sits a few centimetres from *"What I can see
about this machine"*, which opens a band listing this machine's services — and on an IT tool, next
to that, it can be read as **no services are running**, which is alarming and wrong. A task is what
is "in progress"; a service is not.

This is app-side copy and Charles asked for it directly, so it was changed rather than recorded —
but the delivery and the app now say different words in one place, and that is exactly the drift
this file exists to close. **Please take the new wording, or give us a better one.** The comment at
that line in `index.html` says the same thing, so whoever reads the app next finds it.

---

## 4. What not to change

- The other two hub sub-lines (**"Some help unavailable"**, **"This machine only"**). They describe
  capability, not activity, and neither can be read as a machine state.
- The two standing degraded sentences under the utility bar. They are pinned word-for-word by
  `client/test/panel.test.mjs`, against both `index.html` and the delivery, **because the panel and
  the assistant's spoken reply have to describe one connection state the same way** — a defect that
  has shipped once already (`700d920`).
- Anything on the ticket review card's structure. It is a payload view: the user is approving the
  thing that gets sent, field for field, and a field that disappears to tidy the layout re-opens
  D128.
- The lines that say what the system did NOT do — "nothing was filed", "no email was sent",
  "whether it was stored is unknown". Each exists because of a shipped defect (D86, D205, D213).
  **D245 makes each of them appear once rather than twice; it does not make any of them optional.**

---

## 5. Honesty ledger

- **Items 2a–2d came from one screenshot of one session**, written before anything was checked
  against the source. Two of them were partly wrong and the record says so: 2a's feared
  accessibility defect does not exist, and 2d's button is not unlabelled to a screen reader.
- **2c's numbers are computed, not measured.** Two declared hex values through the WCAG formula.
  Nobody has run an audit tool over the panel, and no other accessibility question has been asked at
  all — focus order, keyboard traps, reduced motion, the avatar's role in the tree. This file lists
  one contrast column because one contrast column was noticed.
- **2b may not be a defect.** It is a question.
- **Nobody has watched the panel in Electron**, against a real broker, probe and hub.
  `client/docs/PANEL-RENDERER-CHECK.md` is the click-through and it has not been run.
