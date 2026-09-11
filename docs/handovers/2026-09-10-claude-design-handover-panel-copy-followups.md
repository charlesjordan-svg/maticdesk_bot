# Claude Design handover — the next panel delivery

**Date:** 2026-09-10, end of day. **Supersedes its own earlier version from the same day** (the
four-item list); nothing has been delivered against it, so this is the whole brief rather than an
addendum. **From:** four app-side passes over the delivered panel — register §5.29–§5.33,
D244–D250.

**Reads with:** [`2026-09-10-claude-design-handover-agent-panel.md`](2026-09-10-claude-design-handover-agent-panel.md)
(the brief the current panel answers) and
[`2026-09-10-claude-code-handover-panel-integration-built.md`](2026-09-10-claude-code-handover-panel-integration-built.md)
(what integrating it found).

**Why this file exists.** `63011a4` set the rule: a change to the DESIGN is recorded and goes into
the next delivery rather than living in `client/src/renderer/panel/matic-panel.app.css` for ever.
The panel arrived as a harness with no source files, so the direction of truth is inverted — the app
cannot be where a design decision is made, or the delivery becomes a lie without a byte of it
changing. **Everything below is design. None of it has been resolved in the app**, except where a
section says exactly what was done and why it needed no decision.

**What is NOT here:** anything we fixed as glue. Those are in the register and the commits, and the
next delivery has nothing to carry for them. One example, so the line is clear: the delivery rotates
the disclosure chevron with a selector keyed on `data-set`, the harness's scene-switcher hook, which
the app removed on purpose — so the chevron sat inert. We re-keyed it onto the app's own attribute.
The design's intent was unchanged; only the attribute differed. Nothing for you there.

---

## 1. The biggest ask: four surfaces we drew ourselves

**These do not exist in the delivery at all** — `matic-desk-panel.html` contains none of these class
names — and all four are now permanent parts of the product, on screen in ordinary use. We built
them out of delivered parts (the `.bp` frame, the `.reply` padding, the token set) so they sit
inside the same visual language, but they are our drawings and they should be yours.

| surface | what it is | why it exists |
|---|---|---|
| `.turn-note` | A quiet line stating what the system did or did **not** do — "Nothing was filed", "No email went out", "whether it was stored is unknown", "the service desk is reachable again". Has a second flavour, `.unknown`, in the attention colour. | Every one of these lines exists because of a defect that shipped (D86, D205, D213, `700d920`). Deleting them to calm the surface would re-open all of them. |
| `.ticket-review` | A full card: editable fields, read-only fields, a label column, a caveat, two buttons. | **The one screen in the app through which user data leaves the machine.** The user reviews and edits the complete ticket before anything is sent (D213/D217). |
| `.todo-card` | A numbered list of checks the **user** has to carry out, with a "next step" footer. | A user read straight past these when they were grey system text. They need to read as instructions, not as logging. |
| `.transcript-turn` | The wrapper one turn's parts go in, so an answer's pieces stay together and the newest scrolls into view. | Structural. Probably nothing to draw, but it is the container everything above sits in and you should know it is there. |

**What we would like from you:** these four drawn properly, in the delivery, so they stop being our
approximations. The review card in particular is doing a lot of work with a two-column grid we
invented, and it is the highest-stakes screen in the product.

**Two constraints on it, both with defects behind them.** (a) The card must show **every field that
will be sent**, and editable-versus-fixed must be legible at a glance — a user who can retype the
model's case note turns the ticket into a document with two authors. (b) The caveat at the foot is
the single place the "no email is sent" fact is stated (D245); it may be restyled and may not be
removed.

---

## 2. Carried forward from `63011a4` — still open

| # | Item | Asked for by |
|---|---|---|
| 1.1 | **The wordmark is centred in the rail.** The delivery left-aligns it against the rail's padding while everything under it — avatar, status line, service note — is centred. | Charles, against the running panel |
| 1.2 | **The interactive chrome takes the avatar's blue.** The delivery's accent `#5980a6` IS `--matic-avatar-paper-line` — the quietest blue on the chassis, the one it uses for a ruled line on a sheet of paper — so every button, band and label was drawn in it while the pods, collar and halo sat beside them unused. The app added `--matic-ui-live`, `-deep`, `-wash`, `-edge` under the delivery's own prefix, copied **by value** from `matic-avatar.css` and pinned to it by a test. **No delivered token is redefined.** | Charles: *"Can we add some color to the menus that open and the buttons. Match with Avatar. Looks bland all one color."* |

The split we applied, for you to accept or replace: **structure stays the delivery's** (ground,
surface, ink, hairlines, the muted accent on borders and focus), and **anything that RESPONDS** — a
button, a band that opens, the label on a thing you can act on — takes the live blue. The ticket
reference deliberately did not take it: a mono string in that blue reads as a link and nothing is
behind it.

---

## 3. The four observations from the screenshot review — two of them answered

### 3a. The disclosure bands carry a square and a chevron — and it is NOT a checkbox

*"What I can see about this machine"* and *"Tickets you've opened"* each have a small square and a
chevron. The square reads as a **checkbox**, which implies selection rather than disclosure.

**The markup was checked.** Both triggers are `<button>`; `.glyph-machine` and `.glyph-ticket` are
decorative `<span>`s with a 1px border. A screen reader announces a button. **The accessibility
defect that was feared does not exist.** The visual ambiguity is real and is yours: one control
should have one affordance.

*Fixed here, because it was ours:* neither trigger carried `aria-expanded`, so the open state was
drawn and not announced.

### 3b. Prose is set in monospace — a question, not a fault

`CASE NOTE` and `ALREADY CHECKED` on the ticket review card are sentences in
`--matic-ui-font-mono`. Mono signals machine output.

**There is a real argument the other way and it may be the one you intended:** mono signals
*verbatim, not paraphrased*, which is exactly the property D128 and D130 want of a payload view.
This is the one card through which user data leaves the machine, and everything on it is either the
user's own words or the model's, shown unedited.

**Please say which you meant.** It now decides more than it did: §4's exact-call line and the
glossed enum rows below both sit in that same mono column, and we chose mono for them on the
assumption that it reads as *verbatim*.

### 3c. The label column fails AA in light and passes in dark — computed

`CATEGORY` / `GOES TO` / `CASE NOTE` / `ALREADY CHECKED` are `--matic-ui-ink-quiet` at 11px on
`--matic-ui-surface`.

| | light | dark |
|---|---|---|
| `--matic-ui-ink-quiet` on `--matic-ui-surface` | **3.53:1** | 4.65:1 |
| `--matic-ui-ink-quiet` on `--matic-ui-ground` | **3.82:1** | 5.10:1 |
| `--matic-ui-ink-muted` on `--matic-ui-surface` | 5.41:1 | 6.93:1 |

WCAG 2.1 AA wants **4.5:1** for normal text and 3:1 for large (≥18.66px bold, or ≥24px). **11px
uppercase is not large.** So light fails AA for every body-sized use of `ink-quiet`, and dark passes.
The quiet token is used well beyond this card — the rail's sub-lines, the band notes, the inspector's
step labels — so this is a **token decision**, not a card fix.

**This is arithmetic over two declared hex values, not a measurement**, and it does not join the four
measured numbers in register §10.3. No audit tool has been run over the panel; see §8.

*Why it already changed a decision of ours:* D244 put a second line in that column (the stored enum
under its plain-language gloss). We kept that line at `ink-muted` (5.41:1) and bought its
subordination by **darkening the gloss** to `--matic-ui-ink` instead — rather than answer a copy
defect by adding a second instance of a suspected accessibility one.

### 3d. The `+` in the top right is unlabelled — visually

It is `<button class="inspector-trigger">` with both `title` and `aria-label` reading *"Show what I
proposed, checked and did"*, so it has an accessible name and a tooltip. The glyph is `.crosshair` —
two 1px rules — and to anyone who has not hovered it reads as **"+" / "add"**, which is the opposite
of what it does. It opens the inspector: the developer surface D240 hid. A visible label, a glyph
that does not read as "new", or both.

---

## 4. The consent card's exact-call line — done as far as it can be, and a question behind it

`rendered.detail` is `restart_service(serviceName=spooler)` — the machine-readable form of what will
run, built from the validated parameters. `broker.d.ts` defines the field,
`client/docs/D130-RENDERER-CHECK.md` checks it by name, and it was verified on screen on 2026-09-03
and ticked. **It is deliberate and it stays.**

The delivery draws `.consent-verbatim p` as body prose, and that paragraph is not prose. At body size
beside the plain sentence it belongs to, it reads as prose that has gone wrong.

**What we did, because it needed no decision:** gave it the review card's raw-value treatment — mono,
a step down, subordinate by size and position. **Not one byte of the text changed**, D130's verbatim
rule is intact, and the field-for-field check still passes. This is the one rule in
`matic-panel.app.css` that restyles something the delivery drew, and it is filed in that file's §d
for exactly that reason.

**The question for you — and it is a real one.** Should the exact call also be **glossed**, the way
the review card's `CATEGORY` now is: a plain-language line above, the exact call below and
subordinate? That is **D248, proposed, awaiting Charles**, and it needs a new field on the rendered
contract — which the named-pipe protocol serialises — so it is a decision rather than a patch. If the
answer is yes, the shape is yours to draw. If it is no, the styling above stands on its own.

---

## 5. Copy: where the app now differs from the delivery

**One string, and it is ours deliberately.** The rail's idle sub-line under *"Ready when you are"* is
**"Nothing in progress"**; the delivery says **"Nothing running"**.

"Nothing running" means no task is in progress. It sits a few centimetres from *"What I can see about
this machine"*, which opens a band listing this machine's **services** — and on an IT tool, next to
that, it reads as *no services are running*, which is alarming and wrong. A task is what is "in
progress"; a service is not.

**Please take the new wording, or give us a better one.** `index.html` carries a comment at that line
so the next reader finds this.

**Everything else that changed is app-authored copy and is not yours** — the glossed enums, the
review card's caveat, the ticket band's rows, the failure sentences, the machine's name and account
being shown but never spoken. They are recorded at D244–D250 and they do not touch the delivery.
**One of them is worth knowing about anyway:** the panel now says "the service desk", never "the
hub", everywhere a person can read — the rail, the standing band, the review card, every persona
line. If a future delivery writes placeholder copy, that is the word.

---

## 6. What not to change

- **The other two hub sub-lines** — "Some help unavailable", "This machine only". They describe
  capability rather than activity and neither can be read as a machine state.
- **The two standing degraded sentences** under the utility bar. They are pinned word-for-word by
  `client/test/panel.test.mjs`, against both `index.html` and the delivery, **because the panel and
  the assistant's spoken reply have to describe one connection state the same way** — a defect that
  has shipped once already (`700d920`).
- **The ticket review card's structure.** It is a payload view: the user is approving the thing that
  gets sent, field for field, and a field that disappears to tidy the layout re-opens D128.
- **The lines that say what the system did NOT do.** Each exists because of a shipped defect (D86,
  D205, D213). D245 makes each appear once rather than twice; it does not make any of them optional.
- **The inspector, hidden by default.** D240. No developer control returns to the end-user surface —
  no scene switcher, no state name, no variant toggle. The theme is the one control that IS the
  user's, and it persists (D243).
- **The 35 `--matic-ui-*` tokens as a namespace.** The app may add under the same prefix and may not
  redefine one; a test enforces it, because an override there makes the delivery a lie without
  changing a byte of it.

---

## 7. If something here conflicts

Say so and stop, rather than resolving it in the design. Several constraints above exist because of
defects that already shipped, and a design that quietly works around one of them would reintroduce
it. §1's two constraints and §6's whole list are in that category.

---

## 8. Honesty ledger

- **§3a–§3d came from one screenshot of one session**, written before anything was checked against
  the source. **Two of them were partly wrong and the record says so:** 3a's feared accessibility
  defect does not exist, and 3d's button is not unlabelled to a screen reader.
- **§3c's numbers are computed, not audited.** Two declared hex values through the WCAG 2.1 formula.
  **No audit tool has been run over the panel**, and no other accessibility question has been asked
  at all — focus order, keyboard traps, reduced motion, the avatar's role in the tree, whether the
  transcript announces new turns. This file lists one contrast column because one contrast column
  was noticed, which is not the same as the panel having one problem.
- **§3b may not be a defect.** It is a question, and we have now built two more things on the
  assumption that mono reads as *verbatim*.
- **Nobody has watched the panel in Electron**, against a real broker, probe and hub.
  `client/docs/PANEL-RENDERER-CHECK.md` is the click-through and it has not been run. Everything in
  this file was seen either in the source or through `panel-check.html`, which has no broker, no hub
  and **no voice**.
- **§1's four surfaces are described as we built them, not as they should be.** We are not proposing
  a design for them; we are telling you they exist and asking for one.
- **The live-blue split in §2 is our judgement**, made against a one-line brief. "Anything that
  responds takes the live blue" is a rule we invented to carry it out consistently, and you may
  disagree with the rule rather than the colour.
