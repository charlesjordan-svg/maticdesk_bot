# Claude Design — the machine band outgrew its own design

**Date:** 2026-09-11. **One question, and it is a real one rather than a tidy-up.**

**You drew six rows. The band now renders fifteen, and the count changes from machine to machine.**

Nothing below says the design is wrong. It says the design was drawn against a fixed list and the
list stopped being fixed, which is our doing and not yours — we added the rows.

**Reads with:**
[`2026-09-10-claude-design-handover-panel-copy-followups.md`](2026-09-10-claude-design-handover-panel-copy-followups.md)
(answered in full by the re-export — nothing there is outstanding) and
[`2026-09-10-claude-design-request-buildable-export.md`](2026-09-10-claude-design-request-buildable-export.md)
(**the export rules still apply unchanged — please re-read §1 before sending; none of it is repeated
here**).

---

## The number, because it is the whole brief

| | rows in the machine band |
|---|---|
| your mock (`matic-desk-panel.html`, `.mrow` × 6) | **6** |
| what shipped in September (we added the two address rows) | 8 |
| + "Last restarted" (D256, 2026-09-11) | 9 |
| + "Memory" (D257, same day) | 10 |
| **+ one row per fixed disk volume** (D257) | **11 on a one-drive laptop, 15 on the machine this was written on** |

**The last line is the change that matters.** Every row before it was a fixed row: you could count
them while drawing. Disk is one row per volume, so the count is a property of the machine and is not
knowable at design time. A two-drive laptop gets 12. A five-volume workstation gets 15. A machine
with no address gets two fewer, because those two rows are conditional.

Here is the real band, on a five-volume machine, laid out the way `.mgrid` actually places it —
`repeat(2, minmax(0,1fr))`, filled **row-major**:

```
This computer           Wakanda                   │ Signed in as     Charles
Last restarted          1 day ago                 │ Memory           Plenty free
Printing                Running normally          │ Sound            Running normally
Network adapter         Intel(R) Ethernet Cont    │ Network          Connected, address given out automatically
This machine's address  192.168.50.223            │ Router           192.168.50.1
Disk space (C:)         Plenty of room — 163 GB   │ Disk space (D:)  Plenty of room — 414 GB free
Disk space (E:)         Plenty of room — 163 GB   │ Disk space (F:)  Plenty of room — 1659 GB free
Disk space (G:)         Plenty of room — 501 GB   │
```

**So the drives read across and wrap** — C, D / E, F / G alone in a half-empty final row — which is
not how anyone reads a list of drives, and the odd one out moves depending on how many drives the
machine has. On a four-drive machine the grid is square and on a three-drive machine the gap lands
somewhere else again.

---

## 1. Does it want grouping? (the ask)

Fifteen undifferentiated `label / value` pairs is a list, not a panel. There is an obvious grouping
in the content and we have deliberately not invented one:

- **who and where** — This computer, Signed in as
- **how this machine is doing** — Last restarted, Memory, and the disks
- **what is running** — Printing, Sound
- **network** — Network adapter, Network, This machine's address, Router

**We are not asking you to adopt that grouping.** We are asking whether the band wants grouping at
all at this size, and if so what it looks like — headings, rules, spacing, a second column that
means something rather than just being narrower. It is your call and we will build what arrives.

## 2. Does it want severity? (the one we think is worth most)

**Right now nothing in the band looks different when something is wrong.** `Printing — Stopped` and
`Printing — Running normally` are the same two shades of the same grey. So is a drive with 6 GB left.
On six rows you read them all; on fifteen you scan, and scanning finds nothing.

Three constraints on anything you draw here, all of which have shipped defects behind them:

- **A row may not give advice.** *"Last restarted: 1 day ago"* is the fact; the recommendation to
  restart is a separate conversational moment, on purpose, because a row that argues argues every
  time the band is opened. Severity may say **"this one"**; it may not say **"do something"**.
- **A healthy machine must look healthy.** Two of this machine's drives sit at 17.5% free — with
  163 GB each. The rule that flags them is deliberately `< 15%` **and** `< 25 GB`, precisely because
  a percentage alone raises two false alarms here. **If the design makes 17.5% look amber, it
  reintroduces the false alarm the logic exists to prevent.** Severity must key off the app's
  verdict, not off the number in the string.
- **Red is currently reserved for nothing at all** in this panel, and the copy-followups brief says
  a decline and a limit are correct outcomes rather than errors. If severity wants a colour, say
  which and what it means.

The app can supply whatever hook you want — a `data-state` on `.mrow`, a modifier class, a separate
element. Name it and we will set it.

## 3. What should five healthy drives look like?

Five rows that all read "Plenty of room" is most of the growth and almost none of the information.
Options we can see, none of them chosen:

- one row per volume, always (what it does now);
- a single "Disk space" row that names only the volumes worth naming, and says "all drives have
  room" otherwise;
- one row per volume but visually collapsed into a compact group.

**The constraint is that it must never aggregate**: a machine with 2.9 TB free across five drives
and 8 GB left on C: is in trouble, and a total says the opposite. Whatever it looks like, a bad
volume has to remain individually visible.

---

## What the app supplies, so you know what you can draw against

The renderer builds the band from a list of `[label, value]` pairs and appends `.mrow > dt + dd`.
Both the values below are **already words rather than numbers**, so nothing here needs you to
reformat a figure:

| row | values it can take |
|---|---|
| `Memory` | `Plenty free` · `Filling up` · `Almost full` · `Not known` — **never a percentage**, by decision |
| `Disk space (C:)` | `Plenty of room — 163 GB free` · `Getting full — 40 GB free` · `Almost full — 8.0 GB free` |
| `Last restarted` | `1 day ago` · `5 hours ago` · `Less than an hour ago` · `Not known` |
| `Printing` / `Sound` | `Running normally` · `Stopped` · `Couldn't read it from here` |

Disk carries its figure and memory does not, and that is deliberate: *"163 GB free"* is a sentence
someone can act on, *"commit charge 68.8%"* is not.

**Existing class contract for this band:** `.mgrid`, `.mrow`, and bare `dt` / `dd` inside it — all
four are yours already. New names are welcome; renaming one silently unstyles what it was on.

---

## How to check it before sending

The same one step as last time: **turn the network off and open the file.** Plus one more, because
of this brief specifically:

**Draw the band twice in the mock — once at about 9 rows and once at about 20.** If it only works at
one of them it will be wrong on half the machines it ships to. One drive is the common case on the
fleet this targets; five is this machine.

---

## What happens meanwhile

**Nothing. We hold.** The band works, the grid absorbs fifteen rows without breaking, and none of
this is blocking — which is exactly why it is a design question and not a patch. We are not going to
group or colour anything in `matic-panel.app.css` while waiting, because that is the inversion the
whole arrangement exists to prevent: the app is not where a design decision gets made.

The one number worth knowing: `matic-panel.app.css` is **155 lines**, and its "knowing exceptions"
section is empty. Keeping it empty is how we can tell this arrangement still works.

---

## Not in scope, and please leave alone

The copy in every row (it is decided, and several strings are word-for-word what the assistant says
out loud, so changing one breaks a pairing); the review card; the tickets band; the consent card;
the wordmark; the live-blue tokens; the rail. **D248 is still proposed and still awaits Charles** —
the re-export draws the gloss and the renderer deliberately does not render it. Nothing about it has
changed.
