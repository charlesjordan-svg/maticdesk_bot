# Claude Design handover — re-export, and two corrections

**Date:** 2026-09-10, night. **About:** `matic-desk-panel-delivery.html`, received the same evening
in answer to
[`2026-09-10-claude-design-handover-panel-copy-followups.md`](2026-09-10-claude-design-handover-panel-copy-followups.md).

**The design is accepted. Do not redesign anything.** Every open item is answered and the answers
are better than the questions: §3b's reframing of mono as *machine-exact* rather than *verbatim* is
a sharper distinction than the one I offered, and the payload frame carrying "sent exactly as it
reads" is the right place for the property I was trying to put in a typeface.

**This asks for three things and nothing else:** a re-export in a form we can build from, one
constraint I failed to give you, and one number to pick.

---

## 1. The blocker: we cannot build from this export

The panel's stylesheet is **generated** from the delivery's `<style>` block, whole and verbatim
(D241) — `npm run panel:build`, and `test/panel.test.mjs` fails while it is stale. The panel arrived
last time as a harness with no source files, so that block IS the source of truth and the direction
of truth is inverted: we copy from you, we do not edit.

This export puts the visual decisions somewhere we cannot copy from.

| | last delivery | this one |
|---|---|---|
| `class=` attributes | 291 | **0** |
| inline `style=` attributes | 46 | **242** |
| `<style>` block | 25,369 chars | **2,312** (tokens + 5 state rules) |

Everything else follows from that: `<x-dc>`, `<sc-for>` loops, `{{ }}` bindings, React and ReactDOM
from unpkg, an external `_ds/industry/styles.css`, and ~16 embedded `woff2` files. **The app has no
framework, no build step and no dependency**, and a delivery it cannot regenerate from would have to
be hand-converted — which is the "a copy diverges where a generated one cannot" problem D241 exists
to prevent. Hand-conversion is a rewrite, not an integration.

**This is a re-export, not re-drawing.** The pixels are agreed.

### What the re-export needs

1. **One self-contained `.html` file.** No external stylesheet, no CDN script, no build step, no
   framework. It opens from disk, offline.
2. **All visual decisions in ONE `<style>` block**, as class rules. Inline `style=` is fine where
   the last delivery used it (46 times, for one-off geometry); it is not fine as the carrier.
3. **The class names are a contract**, because the app's markup and its renderer already use them.
   `index.html` writes them and `renderer.js` builds elements with them — **90 of them**, listed in
   §5. A rule that styles a name not on that list styles nothing; a name on the list with no rule
   loses its treatment silently.
4. **Fonts are NAMED, not shipped.** The last delivery declared three stacks and embedded nothing:
   ```
   --matic-ui-font-body:"Barlow",system-ui,-apple-system,"Segoe UI",sans-serif
   --matic-ui-font-head:"Barlow Condensed","Arial Narrow",system-ui,sans-serif
   --matic-ui-font-mono:ui-monospace,"Cascadia Mono","Segoe UI Mono",Consolas,monospace
   ```
   Keep that. Self-hosting is a separate decision we have made once, for the admin console (D225),
   and it is not this panel's.
5. **Keep the harness**, the way the last one worked: a page that shows the states with a rail to
   switch between them. We strip nothing from the style block when we generate — including the
   harness's own chrome — because the moment a script decides which rules the app "needs", the check
   stops proving the app matches the delivery and starts proving it matches the script's opinion.

**The canvas export is still useful and we are keeping it** — it is the best record of intent we
have, and it is what Charles will look at. It is a review artifact, not a buildable one. Both are
worth having.

---

## 2. The constraint I owe you: the tickets band

**This one is my fault, not yours.** My brief never mentioned the tickets band, never named D242,
and never gave you the rule. You had no way to know, and what you drew is the natural thing to draw.

Three strings have to change:

| in the delivery | why it cannot ship |
|---|---|
| **"Still being worked on"** (band heading) | A status claim. **Nobody is working on it.** There is no outbound email in this build at all (D86/D213) — the hub stores the ticket and notifies no one. The endpoint cannot know a status and must not imply one. |
| **"Your five most recent. Anything older lives in the service desk."** | Implies a lookup that does not exist, and a cap on a larger set we can see. Neither is true. |
| **"Progress not visible" and "Filed from here" are gone** | D242 requires both on every row. |

**What the endpoint actually knows**: the tickets *this machine* filed and got a reference for, read
back from its own egress record. Not what happened to them. There is no route from the endpoint to
the hub's ticket table, and there will not be until device identity exists (D54, D68/D69) — a
hub-side lookup keyed on a self-asserted username is user identity through the back door.

**Why the wording is load-bearing and not pedantry.** D242's own reasoning: *a band that looked like
a status view and happened to be empty would be the worse outcome by a distance — the user would
read "no news" where the truth is "no lookup".* "Still being worked on" is that failure with the
sign flipped: it reads as news, and there is none.

**What it should say instead** — the app's current wording, which you are free to improve as long as
the two facts survive:

- heading: **"Tickets I've filed from this machine"**
- each row: **"Filed from here"** / **"Progress not visible"**
- the note under the rows: *"This is what I sent from this machine. I can't see how they're getting
  on — checking a ticket's progress with the service desk isn't something I can do in this build —
  so quote the reference if you follow one up."*

That last sentence is **the same words the spoken answer uses**, deliberately, so the band and the
avatar cannot describe one ticket two ways.

**One more thing that belongs with it:** the tickets band itself is **D242, proposed, and still
awaiting Charles.** If he says no, the band comes out. Draw it, but know it may not ship.

---

## 3. The number to pick: §3c

Your §3c says `--matic-ui-ink-quiet` at `#67696c` gives **4.66:1 on surface, 5.05:1 on ground**. The
value shipped in the token block gives **4.54:1 and 4.92:1** — your prose matches roughly `#656769`,
one step darker.

**Both pass AA**, so nothing is broken. But 4.54 sits **0.04 above the 4.5 floor**, which is no
headroom: any later nudge to `--matic-ui-surface` takes it under without anyone noticing. Either the
prose or the token is a step out. **Pick the one you meant** — `#656769` gives 4.68 / 5.08 and has
room in it.

(Formula and both backgrounds: WCAG 2.1 relative luminance, `#e9e9ea` surface and `#f2f2f3` ground.
Still arithmetic over declared values, not an audit — that caveat of yours stands.)

---

## 4. Accepted as written — do not revisit

- **§1** and its two sub-items. The two legends in the card head, the filled-box/left-rule marks, the
  caveat at the foot with the attention rule.
- **§2.1** and **§2.2**, including the `liveBlue` toggle. **Keep your note that the four
  `--matic-ui-live-*` values are stand-ins** — we will substitute the app's, which are copied by
  value from `matic-avatar.css` and pinned to it by a test, so a repainted avatar fails our build
  rather than leaving the panel in last month's blue. **Names, roles and the split are what we are
  adopting from you; the four hex values stay ours.**
- **§3a.** The Lucide glyph replacing the bordered square, chevron as the only affordance.
- **§3b.** Mono reserved for machine-exact strings; sentences stay in Barlow. This is a better
  distinction than the one I asked about.
- **§3d.** "What I did" as a labelled control.
- **§4 / D248.** Drawn and labelled proposed — correct. It needs a new field on the rendered
  contract, which the named-pipe protocol serialises, so it is Charles's decision and not a patch.
  **Leave it exactly as it is**, including the `(D248, proposed)` marker.
- **§5.** "Nothing in progress", and "the service desk" as the vocabulary throughout.

---

## 5. The class contract — 90 names

A rule that styles a name not on this list styles nothing. A name on this list with no rule loses
its treatment silently, and no test can see that, because no headless test can see a screen.

```
actionbar actions aside-note band band-head band-machine band-note band-tickets band-title
band-trigger bp brand btn btn-ghost btn-primary btn-secondary caveat chev citation composer consent
consent-head consent-verbatim count crosshair degraded degraded-none degraded-unreachable devlog dot
exact fields from glyph-machine glyph-ticket hint hub-checked hub-none hub-ok hub-unreachable hubcopy
input ins-body ins-head inspector inspector-trigger lede less main mgrid more mrow next opener
panelbody plain rail raw reply row said scene scene-first scrim send service service-detail
service-title src status-head status-sub status-sub-busy status-sub-idle step tagword tbody
ticket-review ticket-review-body todo-card transcript transcript-turn tref trow tset tset-open tstat
turn-note utility why window
```

**Where they come from:** `client/src/renderer/index.html` writes most of them; `renderer.js` builds
the rest at run time with `el(tag, class, text)`. Both files are attached. **You may add names** —
the app will carry markup you introduce — but renaming an existing one silently unstyles the thing
it was on.

**Four of them are the §1 surfaces** and had no rules in the last delivery at all: `turn-note`,
`ticket-review`, `todo-card`, `transcript-turn`. Those are the ones this delivery exists to draw.

**Two are new since the last delivery and are ours, not yours to justify:** `exact` (the consent
card's machine-readable call, §4) and `raw` (the stored enum under a glossed one). They are in the
list because they need rules, not because they need designing — you have already drawn both.

---

## 6. What to send back

1. **The buildable export** — one self-contained `.html`, class-based, per §1.
2. **A one-line answer on §3c** — which value you meant.
3. **The tickets band redrawn** with §2's constraint.

Nothing else. The written answers you sent are complete and we are keeping them as the record.

---

## 7. Honesty ledger

- **§2 is my omission.** The brief listed what not to change and did not include the tickets band,
  D242, or the no-lookup rule. Four passes of app work had that constraint in front of me the whole
  time and it did not reach the brief.
- **§1 is a format problem, not a quality one**, and I contributed to it: I answered your export
  question with "standalone HTML" and said the artifact must be "one complete self-contained harness
  file", which I thought was specific enough. It was not — it did not say *class-based*, and it did
  not say the style block is what we copy. §1.1–1.5 is the version I should have sent.
- **Nobody has watched any panel in Electron**, this one included. `client/docs/PANEL-RENDERER-CHECK.md`
  is the click-through and it has not been run once, against either delivery.
- **The 90 names are generated from the two files, not curated.** If one is a typo in our source, it
  is on the list and it is still a name you have to match; tell us and we will fix ours.
- **The contrast figures on both sides are arithmetic**, not an audit. No accessibility tool has been
  run over this panel, and §3c is the only accessibility question anyone has asked.
