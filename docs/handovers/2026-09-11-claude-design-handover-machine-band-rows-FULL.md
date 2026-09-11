# Claude Design handover — the machine band outgrew its own design

**Matic Desk · 2026-09-11 · one question, three asks.**

**Open [`band-at-four-sizes.html`](band-at-four-sizes.html) first.** It is self-contained, it uses
your own stylesheet, and it shows the whole problem in about fifteen seconds. Everything below is
the argument behind it.

Nothing here says the design is wrong. It says the design was drawn against a **fixed** list of rows
and the list stopped being fixed — which is our doing, not yours. We added the rows.

---

## What is in this folder

| path | what it is |
|---|---|
| `band-at-four-sizes.html` | **Start here.** The machine band at 11, 12, 15 and 20 rows, plus one machine in trouble. Your CSS, inlined. Opens offline, from anywhere. |
| `their-last-delivery/matic-desk-panel.html` | **Your September re-export, byte for byte as we hold it.** This is the source of truth for the panel; we do not edit it. |
| `app/matic-panel.css` | What `npm run panel:build` generates by copying your `<style>` block out of that file. A test fails if it is stale. |
| `app/matic-panel.app.css` | **The 155 lines the app adds itself.** Worth a look — it is the standing list of things the delivery does not draw. |
| `app/index.html` | The app's markup. |
| `app/renderer.js` | The renderer. Together with `index.html` this **defines the class contract**. |
| `class-contract.md` | Generated from those two files: every class name the app depends on. |
| `screenshots/machine-band-15-rows-real-app.png` | The real thing, in Electron, on a five-volume machine. |

**Identity values in the samples are placeholders** (`PLACEHOLDER-PC`, `10.0.0.42`). **The disk
figures are real**, because they carry the constraint in §2.

---

## The number, because it is the whole brief

| | rows in the machine band |
|---|---|
| your mock (`matic-desk-panel.html`, `.mrow` × 6) | **6** |
| what shipped in September (we added the two address rows) | 8 |
| + `Last restarted` | 9 |
| + `Memory` | 10 |
| **+ one row per fixed disk volume** | **11 on a one-drive laptop, 15 on the machine this was written on, 20 on one with externals attached** |

**The last line is the change.** Every row before it was a fixed row — you could count them while
drawing. Disk is one row per volume, so **the count is a property of the machine and cannot be known
at design time.** Two of the rows are also conditional and drop out on a machine with no address.

`.mgrid` is `repeat(2, minmax(0,1fr))` and fills **row-major**, so the drives read *across* and
wrap — C,D / E,F / G alone in a half-empty final row — and which drive is the odd one out moves with
the drive count. Panels 3 and 4 of the sample page show this.

---

## 1. Does it want grouping?

Fifteen undifferentiated `label / value` pairs is a list, not a panel. There is an obvious grouping
in the content, and **we have deliberately not invented one**:

- **who and where** — This computer, Signed in as
- **how this machine is doing** — Last restarted, Memory, and the disks
- **what is running** — Printing, Sound
- **network** — Network adapter, Network, This machine's address, Router

We are not asking you to adopt that. We are asking whether the band wants grouping **at all** at this
size, and if so what it looks like — headings, rules, spacing, a second column that means something
rather than merely being narrower.

## 2. Does it want severity? — the one we think is worth most

**Open panel 5 of the sample page.** That machine has stopped printing, memory almost full, a drive
with 8 GB left, and has not been restarted in 41 days. **Find them.** Nothing on it looks any
different from panel 3, which is a machine in perfect health.

On six rows you read them all. On fifteen you scan, and scanning finds nothing.

Three constraints, each with a shipped defect behind it:

- **A row may not give advice.** *"Last restarted: 41 days ago"* is the fact; the recommendation to
  restart is a separate conversational moment, on purpose, because a row that argues argues **every
  time the band is opened**. Severity may say *"this one"*; it may never say *"do something"*.
- **A healthy machine must look healthy — and this is the subtle one.** In panel 3, **C: and E: are
  both at 17.5% free, with 163 GB each.** Our rule deliberately requires *both* a percentage below
  15% *and* an absolute figure below 25 GB, because **a percentage alone raises two false alarms on
  that machine.** If the design makes 17.5% look amber, it puts the false alarm straight back.
  **Severity must key off our verdict, never off the number in the string.** We will hand you
  whatever hook you want — a `data-state` on `.mrow`, a modifier class, a separate element.
- **Red is currently reserved for nothing at all** in this panel, and a decline or a limit is a
  correct outcome rather than an error. If severity wants a colour, tell us which and what it means.

## 3. What should five healthy drives look like?

Five rows all reading "Plenty of room" is most of the growth and almost none of the information.
Options we can see, none chosen:

- one row per volume, always (what it does now);
- a single "Disk space" row naming only the volumes worth naming, and saying *"all drives have room"*
  otherwise;
- one row per volume, visually collapsed into a compact group.

**The hard constraint is that it must never aggregate.** A machine with 2.9 TB free across five
drives and 8 GB left on C: is in trouble, and a total says the opposite. Whatever it looks like, **a
bad volume has to stay individually visible.**

---

## What the app supplies, so you know what you can draw against

The renderer builds the band from a list of `[label, value]` pairs and appends `.mrow > dt + dd`.
Both new values are **already words rather than numbers**, so nothing needs a figure reformatting:

| row | the values it can take |
|---|---|
| `Memory` | `Plenty free` · `Filling up` · `Almost full` · `Not known` — **never a percentage**, by decision |
| `Disk space (C:)` | `Plenty of room — 163 GB free` · `Getting full — 47 GB free` · `Almost full — 8.0 GB free` |
| `Last restarted` | `1 day ago` · `5 hours ago` · `Less than an hour ago` · `Not known` |
| `Printing` / `Sound` | `Running normally` · `Stopped` · `Couldn't read it from here` |
| `Network` | `Connected, address given out automatically` · `Connected, address not given out automatically` · `Not connected` |

**Disk carries its figure and memory does not, and that is deliberate:** *"163 GB free"* is a
sentence someone can act on and is the first thing a support call asks after which drive; *"commit
charge 68.8%"* is neither.

**This band's class contract is small:** `.mgrid` (the grid, in our markup), `.mrow` (the row
wrapper, created by the renderer), and bare `dt` / `dd` inside it. `class-contract.md` has the full
generated list. New names are welcome; **renaming one silently unstyles what it was on.**

---

## How the delivery has to arrive — unchanged, and the reason it is restated

We do not edit your file. `npm run panel:build` **copies your `<style>` block verbatim** into the
app's stylesheet, and a test fails if the copy is stale. **A decision that is not in that block does
not reach the app.**

- **Visual decisions belong in the `<style>` block as class rules**, not in `style=` attributes.
  Your September re-export gets this right — 515 `class=` attributes, 36 inline styles, 38 KB of
  CSS — and it is the reason it was the first buildable one.
- **No `<link rel="stylesheet" href="https://…">`.** This app runs on a laptop that is routinely
  offline; that is the premise of its whole connectivity model. Name the families and let them fall
  back, exactly as you already do.
- **No `<script src>`, no framework, no templating.** The panel has no build step and no dependency.
  For repeated rows, draw two or three literal ones.

### How to check it before sending — two steps

1. **Turn the network off and open the file.** If it still looks right, it is right.
2. **Draw the band twice — once at about 9 rows and once at about 20.** If it only works at one of
   them it will be wrong on half the machines it ships to. One drive is the common case on the fleet
   this targets; five is the machine this was written on; twenty is a workstation with externals.

---

## Not in scope — please leave alone

The copy in every row (it is decided, and several strings are word-for-word what the assistant says
out loud, so changing one breaks a pairing); the review card; the tickets band; the consent card;
the wordmark; the live-blue tokens; the rail; the inspector.

The previous brief — the four undrawn surfaces, the contrast values, the disclosure glyph — was
**answered in full by your re-export.** Nothing from it is outstanding. The one item still open is
**D248**, the consent card's exact-call gloss: you drew it and marked it proposed, our renderer
deliberately does not render it yet, and it is waiting on a decision at our end rather than yours.

---

## What we are doing meanwhile

**Nothing. We are holding.** The band works, the grid absorbs fifteen rows without breaking, and
none of this is blocking — which is exactly why it is a design question and not a patch. We are not
going to group or colour anything in `matic-panel.app.css` while we wait, because the app is not
where a design decision gets made; the moment it is, your delivery becomes a lie without a byte of it
changing.

One number worth knowing: `matic-panel.app.css` is **155 lines**, and its "knowing exceptions"
section is **empty**. Keeping it empty is how we can tell this arrangement still works.
