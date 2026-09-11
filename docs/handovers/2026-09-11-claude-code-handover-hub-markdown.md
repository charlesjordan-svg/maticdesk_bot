# Handover — the hub's markdown is read as data and built as nodes, never interpreted

**From:** Claude Code session, 2026-09-11
**Decision:** **D255**, register [`docs/decisions/DECISION-REGISTER.md`](../decisions/DECISION-REGISTER.md) §5.38
**Fixes:** the first of the four findings [`2026-09-11-claude-code-handover-panel-electron-click-through.md`](2026-09-11-claude-code-handover-panel-electron-click-through.md) §2 left open (F3)
**Charles:** *"fix the markdown backticks in the hub answers"*

---

## 1. What was wrong

A real knowledge-base answer reached the screen as

> The keyboard shortcut to redo something in Windows is \`Ctrl + Y\`. Some applications also accept \`Ctrl + Shift + Z\`.

with the backticks visible. The hub's answers are written by a language model and language models
emit markdown. The renderer set the string with `textContent`, which is **correct and is not the
bug** — `innerHTML` is what D130 forbids and what the entire consent-surface guarantee rests on.

## 2. The shape of the fix, which was the only one available

The panel may never be handed markup to interpret. So a new pure module reads the markers and
returns **data**:

```js
proseSegments("is `Ctrl + Y`.")  // → [{text:"is ", code:false}, {text:"Ctrl + Y", code:true}, …]
plainProse("is `Ctrl + Y`.")     // → "is Ctrl + Y."
```

`renderer.js`'s `prose()` appends a text node or a `<code>` per run with `document.createElement`.
**No HTML is parsed, none is produced, and nothing can inject.** `innerHTML` appears nowhere in the
renderer and a test asserts that.

**Both layers, deliberately.** The hub's `answer` tool now asks for plain sentences — *"It is read
aloud by a speech synthesiser as well as shown, so a marker is either a stumble or nothing"*, which
is a reason a model can act on — and that visibly worked: the same question came back clean. But
**a model is not a contract**, and the panel has to be right on the turn the prompt is ignored.

## 3. The load-bearing restraint: `*` and `_` alone are **not** emphasis

This is the decision to defend if anyone reaches for a tidier regex.

This product's own vocabulary is full of underscores — `needs_human_judgement`,
`server_side_outage`, `queue=identity_team`, `restart_service(serviceName=spooler)` — and D244/D128
put those raw values **on the review card**, the one screen where a user approves data leaving the
machine. A naive `_x_` rule turns `needs_human_judgement` into `needshumanjudgement` on exactly that
screen.

**A stray `*word*` is a blemish; a mangled enum is a lie.** So only `` `code` `` and paired
`**bold**` are handled. Headings, lists, tables and links are left exactly as written: a half-built
layout engine in a renderer that may not use `innerHTML` is a worse thing to own than a stray
character.

## 4. What is deliberately **not** transformed

**On the consent card, only `proposal.reasoning`** — the one model-authored string D130 allows
there. The four `consentRendered` clauses are the broker's retained catalog text, which the D130
click-through compares field for field on screen.

**The review card's case note is not transformed at all, although it is model-written.** The card
labels it *"Sent exactly as it reads."* and D128 requires the user to see what is being sent, so
dropping a marker from the display would make the card's own promise false. **A visible marker
there is honest; a tidied one is not.**

Both are pinned, because both are what a later session would helpfully extend.

## 5. An ordering bug avoided, and pinned

`say()` strips markers **before** D249's redaction, so the redaction sees the sentence a person
would read. The log line then compares `heard !== said`, **not** `heard !== text` — comparing
against the original would fire the D249 redaction notice on any answer that merely contained a
backtick, and **a log that cries redaction when nothing was redacted is worse than no log.**

## 6. Two defects in my own CSS, both found by measuring the rendered thing

`--matic-ui-hair` is a **width** (`1px`), not a colour — the delivery's own idiom is
`border: var(--matic-ui-hair) solid var(--matic-ui-line)`. Guessing from the name gave
`1px solid 1px`, an **invalid shorthand**, dropped whole: the chip had its tint and no hairline.

Worth knowing exactly which failure it was, because I got it wrong first: reading `borderColor`
alone returns `rgb(29,31,32)` and looks like a black box was drawn; only `border` shows `0px none`.
**My first write-up said it "resolved to `currentColor` and drew a near-black box", and that was
wrong.** Corrected in the file.

Second: `--matic-ui-radius` is `0px`. A rounded chip was the app overruling a square-cornered
design.

## 7. `matic-panel.app.css` grew 123 → 155 lines, and that is a cost

§5.35's own header says that if this file starts growing again, the thing to write is a design
handover. The rule is legitimate section (b) work — the delivery draws `.raw` for a block of machine
text and `.turn-note .ref` for a reference and **no inline treatment at all**, for the same reason
it drew no "JUST NOW" label: none of the strings it was given contained one. An unstyled `<code>`
then falls back to the *browser's* mono face at the browser's size, which is D252 §7's defect
exactly.

**It is written into the file as the first item for the next design ask**, so section (b) can shrink
again. Most of the 32 lines are the comment explaining §6.

## 8. The check page had no fixture with markdown in it

That is why this reached a real screen. Every canned reply was clean prose, so the one thing the hub
reliably does that our own strings never do was unmodelled. The docking answer now carries a
backticked version number, a bolded clause **and a filename with underscores in it** — so opening
the page shows what the renderer does with all three, and the underscore case sits permanently in
front of anyone who reaches for a tidier regex.

## 9. Honesty ledger

- **`npm.cmd test`: 18/18 files, 1202 assertions, 0 failed** (up from 1158; `model-prose.test.mjs`
  is the new file, 37). **Server: 5/5 files.** `panel:check` clean.
- **Seven mutations probed, six caught.** The seventh — removing `CODE.lastIndex = 0` — is
  **semantically equivalent**: an `exec` loop that runs to `null` resets `lastIndex` itself, so no
  test can catch it. The line stays as insurance against a future early `break` and says so.
- **One assertion passed for the wrong reason and the probe found it.** The "emphasis inside code"
  case used `` `a ** b` ``, which has only *one* `**`, so the transform was a no-op on it. The case
  that exercises the rule needs a complete pair: `` `a **b** c` ``.
- **Verified on the check page and on the real Electron window**, the latter by building the exact
  element the renderer builds and reading its computed style. The live hub answer came back *without*
  markdown after the prompt change, so the end-to-end run proves the hub path is clean but **does
  not** exercise the renderer's transform — the check-page fixture is what does that.
- **Nothing was heard.** Markers are now absent from the string handed to Piper, which is the point
  of the `plainProse` → `spokenForm` order, but no one has listened.
- Three findings from §5.37c remain open and **none is fixable in the renderer**: the citation shows
  the article's slug (`/v1/ask` returns no title), the model's `reasoning` renders twice, and its
  spoken proposal still names the mechanism. **D242 and D248 remain PROPOSED.**
