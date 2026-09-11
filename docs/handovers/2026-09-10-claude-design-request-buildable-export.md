# Claude Design — one request: an export we can build from

**The design is finished and accepted.** Nothing below asks you to draw anything differently. Two
exports have now arrived and the difference between them was one line — a Google Fonts `<link>` —
so I am assuming the longer brief did not reach you. This is the whole request, on one page.

**Three things. The first is the one that matters.**

---

## 1. The visual decisions must be in the `<style>` block, as class rules

We do not edit your file. We run `npm run panel:build`, which **copies your `<style>` block verbatim**
into the app's stylesheet, and a test fails if the copy is stale. **A decision that is not in that
block does not reach the app.**

Both exports put them in inline attributes instead:

| | the delivery we integrated in September | both of your exports |
|---|---|---|
| `class=` attributes | 291 | **0** |
| inline `style=` attributes | 46 | **242** |
| `<style>` block | 25,369 chars | **2,293** |

So, concretely — this is the change, and it is mechanical:

```html
<!-- what both exports do: the decision is in the attribute, where we cannot copy it -->
<div style="font-family:var(--matic-ui-font-mono); font-size:12px; color:var(--matic-ui-ink-muted)">
  needs_human_judgement
</div>

<!-- what we need: the decision in the style block, the element carrying a name -->
<div class="raw">needs_human_judgement</div>
```
```css
.raw { font-family: var(--matic-ui-font-mono); font-size: 12px; color: var(--matic-ui-ink-muted); }
```

**The class names are fixed, because the app's markup and renderer already use them.** There are 90.
They are listed in §5 of
[`2026-09-10-claude-design-handover-panel-re-export.md`](2026-09-10-claude-design-handover-panel-re-export.md)
and generated from the two files sent with it — `index.html` and `renderer.js`. **A rule naming
something not on that list styles nothing.** You may add names; renaming one silently unstyles what
it was on.

### Two things that must not be in the file at all

- **`<link rel="stylesheet" href="https://…">`.** The second export added one for Barlow. This app
  runs on a laptop that is **routinely offline** — that is the premise of its whole connectivity
  model — and a font fetched from a CDN also tells Google every time a machine starts. **Name the
  families and let them fall back**, exactly as the September delivery did:
  ```
  --matic-ui-font-body:"Barlow",system-ui,-apple-system,"Segoe UI",sans-serif
  --matic-ui-font-head:"Barlow Condensed","Arial Narrow",system-ui,sans-serif
  --matic-ui-font-mono:ui-monospace,"Cascadia Mono","Segoe UI Mono",Consolas,monospace
  ```
- **Any `<script src>`, any framework, any `{{ }}` or `<sc-for>` templating.** The panel has no
  build step and no dependency. Repeated rows: draw two or three literal ones.

### How to check it before sending — one step

**Turn the network off and open the file.** If it still looks right, it is right. If anything
changes, something in it is being fetched and we cannot ship it.

Rough shape of a passing export: hundreds of `class=` attributes, fewer than ~50 inline `style=`,
and a `<style>` block in the tens of KB.

---

## 2. The tickets band says three things the product cannot say

**This one is my fault** — the first brief never mentioned this band, so you had no way to know.

| in both exports | why it cannot ship |
|---|---|
| **"Still being worked on"** (heading) | **Nobody is working on it.** This build sends no email and notifies no one; the ticket is stored and sits there. The endpoint cannot know a status and must not imply one. |
| **"Your five most recent. Anything older lives in the service desk."** | Implies a lookup that does not exist. The endpoint can see only what *this machine* filed, from its own local record. |
| **"Progress not visible" / "Filed from here" are absent** | Both are required on every row. They are the two phrases that stop the band reading as a status view. |

Use this, or better wording that keeps both facts:

- heading: **"Tickets I've filed from this machine"**
- every row: **"Filed from here"** and **"Progress not visible"**
- the note under them: *"This is what I sent from this machine. I can't see how they're getting on —
  checking a ticket's progress with the service desk isn't something I can do in this build — so
  quote the reference if you follow one up."*

That last sentence is word-for-word what the assistant says out loud, so the band and the voice
cannot describe one ticket two ways.

---

## 3. One number to pick

Your note says `--matic-ui-ink-quiet` at `#67696c` gives **4.66:1**. It gives **4.54:1** — your prose
matches `#656769`. Both pass AA; 4.54 is **0.04 above the floor**, so any later nudge to
`--matic-ui-surface` takes it under silently. **Tell us which you meant** — `#656769` is 4.68:1 and
has room in it.

---

## What happens if this one is not buildable either

We stop asking for a harness and implement your written decisions ourselves — retune the token,
apply §3a/§3b/§3d/§4, draw the four surfaces from your artwork. **Your delivery becomes reference
rather than source.**

Neither of us should want that. It makes every future change a re-drawing instead of a re-export,
and it puts the panel's design back in a stylesheet we maintain, which is the arrangement the
September delivery replaced on purpose.

---

## Everything else is accepted and should not change

The review card's two legends and its caveat; the wordmark; the live-blue split and its toggle (your
four `--matic-ui-live-*` values stay stand-ins — we substitute the app's, which are pinned to the
avatar by a test); the Lucide glyph replacing the bordered square; **mono for machine-exact strings
rather than for verbatim**, which is a better distinction than the one I asked about; "What I did";
D248 drawn and marked proposed; "Nothing in progress"; and "the service desk" as the vocabulary
throughout.
