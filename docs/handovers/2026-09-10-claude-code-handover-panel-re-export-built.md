# Handover — the panel re-export is integrated, and the app stylesheet lost two thirds of itself

**From:** Claude Code session, 2026-09-10 (late)
**Decision:** **D252**, register [`docs/decisions/DECISION-REGISTER.md`](../decisions/DECISION-REGISTER.md) §5.35
**Answers:** [`docs/handovers/2026-09-10-claude-design-request-buildable-export.md`](2026-09-10-claude-design-request-buildable-export.md)
**Delivery integrated:** `C:\Users\Charles\Downloads\matic-desk-panel-re-export hope.html`, copied verbatim to
[`client/src/renderer/panel/matic-desk-panel.html`](../../client/src/renderer/panel/matic-desk-panel.html); its
written notes are filed as [`docs/handovers/2026-09-10-claude-design-handover-panel-re-export.md`](2026-09-10-claude-design-handover-panel-re-export.md)
**Charles:** *"go, adopt their names and keep both token changes."*

---

## 1. What happened

The third export is buildable. The first two were canvas exports — **0 `class=` attributes, 242
inline `style=`, a 2.3 KB style block** — and `matic-panel.css` is GENERATED from that block, so
neither could be built from. This one has **515 classes, 36 inline styles and 38,392 characters of
CSS**, no CDN, no framework, no templating, and fonts named rather than fetched. D251's fallback —
*if the third export is not buildable either, D241 ends for the panel* — was not needed.

It is integrated whole. **All 1131 client assertions pass across 17 files** (up from 1113);
`npm.cmd run panel:check` is clean; the review card, the consent card, the todo card, the turn
notes, both bands, the inspector, the dark theme and the filed-ticket path were all driven on
`panel-check.html`.

## 2. The measure of it: `matic-panel.app.css` went from 280 lines to 123

That number is the whole argument for D241's arrangement, so it is worth saying plainly what
vanished. The app stylesheet used to carry a section headed *"surfaces the delivery did not draw"* —
`.turn-note`, `.ticket-review`, `.todo-card`, `.transcript-turn`, four permanent parts of the
product that were **our approximations of a design nobody had drawn**. The re-export draws all
four. It also applies the live-blue split itself and answers the four accessibility and copy items.
Every rule that existed to cover those gaps is gone.

What is left is three short sections:

| | What |
|---|---|
| (a) | the harness stage becoming a real Electron window — the panel IS the window |
| (b) | two display hooks the renderer sets that the harness set differently, plus one label (`.turn-note b`, the "JUST NOW" chip) the delivery had no string for |
| (c) | the four `--matic-ui-live-*` **values** |

The previous version of that file had a fourth section of knowing exceptions. It is empty now,
and keeping it empty is how you tell whether the arrangement is still working.

## 3. Their names are adopted, not renamed to ours

The request gave a 90-name class contract. The export invented **32 names of its own** and mapped
each to the contract. Adopting theirs rather than renaming their CSS to ours is the point of D241
working: **the delivery is the source**, and renaming it to match names the app invented inverts the
direction of truth again — which is the failure D241 exists to prevent.

They are also better names. `tr-grid` / `tr-label` / `tr-value` are namespaced to the card they
belong to; `fields` / `label` / `fixed` were not. The renderer was rebuilt against them:
`reviewTicket()` now emits `tr-head` / `tr-legends` / `tr-grid` / `tr-label` / `tr-value` /
`tr-field` / `tr-hint` / `tr-fixed` / `tr-caveat` / `tr-actions`, and `todoCard()` emits
`todo-head` / `todo-note` / `todo-row` / `todo-n` / `todo-body` / `todo-do` / `todo-why` /
`todo-next`.

## 4. Both token changes are kept — and their third find is a gap in **our** analysis

The export retuned two tokens nobody asked it to, flagged them as the only unrequested changes in
the file, and offered to revert. **Every one of its six contrast figures was re-derived here
independently and all six match to two decimals.**

| Token | Was | Now | Contrast was | Now |
|---|---|---|---|---|
| `--matic-ui-attn` | `#b8863b` | `#9a6c22` | 4.12:1 | 5.09:1 |
| `--matic-ui-ok` | `#3f8f5f` | `#2f7a4c` | 4.07:1 | 5.02:1 |
| dark `--matic-ui-ink-quiet` | `#7e8b94` | `#8b98a1` | **4.16:1 on `surface-2`** | 4.98:1 |

Both of the first two failed AA on body-sized text. The third is the one worth reading twice: it
fails on **`surface-2`, which is the review card's own ground** — and §5.29b's contrast analysis
never measured that pairing, **because the card had not been drawn yet.** A gap in our own work,
found by somebody drawing the thing.

(These are arithmetic over declared tokens — WCAG 2.1 relative luminance — not measurements. They
do not join register §10.3's four measured numbers.)

## 5. The four live tokens are now a named, tested exception — and the test can outlive nothing

D241 says the hand-written half **may not redefine a delivered token**, because an override there
makes the delivery a lie without changing a byte of it. The re-export adopted the four
`--matic-ui-live-*` names and declares the values as placeholders, because Claude Design does not
have `matic-avatar.css` and cannot know them:

> *"…are placeholders. Substitute the app's values, which are pinned to matic-avatar.css by a test.
> Only the roles are the delivery's."*

So `matic-panel.app.css` declares exactly those four and nothing else. **The test does not hard-code
an allow-list.** It reads the delivery's own words and fails if the delivery stops calling them
stand-ins — so the exception cannot outlive its justification, which is the failure mode an
allow-list has.

## 6. Three changes worth knowing about

**6a. The build script now chooses a `<style>` block.** The re-export has two: the panel's, and
`<style id="sheet-only">` — the contact sheet's own chrome. `buildPanelCss()` used to throw on a
second block, deliberately. It takes the unlabelled one now and **still throws on anything it does
not recognise**. The rule it must not break is that *this script never decides which rules the app
needs* — the moment it does, the check proves the app matches the script's opinion rather than the
delivery. An `id` on the block is the DELIVERY's decision, visible in both files. Different thing.

**6b. The chevron and the open-state wash now hang off `aria-expanded`, which is better than what
was asked for.** The September delivery keyed them off `data-set`, the harness's scene-switcher
hook, so app.css had to re-key them — and the first attempt at that missed the chevron, leaving a
disclosure whose only state indicator was inert (§5.29's "found by clicking"). The re-export keys
both off the attribute the renderer already maintains for screen readers, **so the visual state and
the announced state cannot disagree, because there is only one of them.**

**6c. Two markup changes the delivery asked for, both made, because CSS cannot make them.**
`.glyph-machine`, `.glyph-ticket` and `.chev` are SVG holders now, carrying the delivery's
thin-stroke glyphs — its §3a answer to the bordered square that read as a checkbox; an empty span
renders nothing. And `.crosshair`, which read as "+" / "add" — the opposite of what it does — is
replaced by `.ins-glyph` + `.ins-label` ("What I did"), a labelled control that no longer needs a
hover to be understood.

## 7. One defect found by looking, and it was ours

`.tr-field` is drawn for the artwork's `<div>`s. It sets the field's padding, ground, border and
even a `caret-color` — so the delivery knew those fields are editable — but no `font-family`,
because a `<div>` does not need one. **A real `<textarea>` does**, and browsers default form
controls to their own face. The first render put the user's own words in a monospace box one line
tall.

The fix is not a fourth override. The element carries `class="input tr-field"` — the delivery's own
form-control rule for `font: inherit`, its card rule for everything else, `.tr-field` winning the
conflicts because it sits later in the sheet — with `rows` in the markup for the height. Two
delivered rules and nothing for a handover to carry.

## 8. What was **not** taken

**The delivery's copy is placeholder; ours is product.** That was on the original brief's "what not
to send back" list and it has not moved. The caveat keeps D246's wording, the tickets band keeps
D242's, the turn notes keep D244–D250's.

**D248's gloss is drawn in the delivery and deliberately not rendered.** D248 is still PROPOSED and
awaits Charles. There is no field on the rendered contract to draw that sentence from, and inventing
it in the renderer is precisely what D130 forbids. The delivery's `.call-gloss` rule is in
`matic-panel.css`, unused, and a test asserts both halves of that: drawn there, absent here.

The delivery is a **contact sheet of one state per surface**, so it carries the hub-unreachable band
and not the no-service one. The standing-sentence test now pins each sentence where it CAN be pinned
against the delivery and says in a comment which is which — rather than failing because a correct
delivery drew one state.

**One copy change came from the delivery and was kept:** the tickets trigger reads *"Tickets I've
filed from this machine"* rather than *"Tickets you've opened"*. That is D242's own constraint said
better — the endpoint knows what it FILED, never what a person opened elsewhere — so it is an
improvement on our string, not a placeholder overwriting it.

## 9. Honesty ledger

- **`npm.cmd test`: 17/17 files, 1131 assertions, 0 failed.** `npm.cmd run panel:check`: clean.
- **Nobody has watched this in Electron.** [`client/docs/PANEL-RENDERER-CHECK.md`](../../client/docs/PANEL-RENDERER-CHECK.md)
  is still unrun — against three deliveries now. Everything above was driven on `panel-check.html`,
  which is the real renderer against a fake bridge in an iframe. **It has no voice**, so nothing in
  D249/D250's spoken-form work has been HEARD since the panel changed either.
- **The "Sent by you" defect still stands and was NOT fixed here.** The review card labels a turn
  "Sent by you" before `fileTicket()` has been called, so a filing that then fails has already been
  described as sent. It was identified while answering Claude Design's review-card-states question
  and left alone deliberately, to avoid widening an already large pass. It is a renderer bug, not a
  design one; the delivery draws the states correctly.
- The six contrast figures are **arithmetic, not measurement**, and do not lengthen register §10.3's
  list of four measured numbers.
- **D242 (the tickets band) and D248 (the consent-call gloss) both remain PROPOSED and await
  Charles.** Neither was resolved by this pass.
