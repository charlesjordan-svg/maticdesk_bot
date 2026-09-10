# Design handback — Matic Desk admin console

**From:** the Claude Design session, 2026-09-09. **For:** the Claude Code session that implements it.
**Owner:** Charles Jordan.

## What you are getting

This folder is the whole handback. Nothing in it needs a server, a network or a build step.

| | File |
|---|---|
| **The artboards** — 1a review queue, 1b ticket detail, 1c ticket list, 1d honest stub as a whole screen, 1e the same stub inside a live screen, 1f sign-in, 1g auditor. Open it in any browser; it is self-contained. Scroll to pan, ctrl/⌘-scroll to zoom | `admin-console-artboards.html` |
| **The stylesheet** — a drop-in replacement for the `CSS` constant in `server/src/admin/html.js` | `admin-console.css` |
| **Markup changes**, per template | §3 below |
| **What I did not do** | §5 below |

**To apply it:** replace the `CSS` template literal in `server/src/admin/html.js` with the contents
of `admin-console.css` (it is plain CSS, no imports, no external references), then work through §3
template by template. The 296 static assertions should still pass unchanged — the sheet adds no
script, no external URL and no unescaped interpolation. The two data-URI SVGs (the registration
mark and the select chevron) are inline images, permitted by §3.2; if an assertion greps for
`url(` it will need to allow `data:image/svg+xml`.

The artboards are rendered *by* `admin-console.css`. There is no second copy of the design, so the
drawings and the stylesheet cannot drift apart.

## 1. The system, in one paragraph

Steel on paper. Ground `#f2f2f3`, ink `#1d1f20`, one accent `#5980a6` and its ramp; no second hue
except one functional red for form errors. Barlow Condensed 600 for headings, nav, numerals, table
heads, buttons and labels; Barlow 400 for everything read as prose. Every corner is square
(`border-radius: 0` throughout). Panels, cards and figures are transparent line drawings — one
hairline, no surface fill, no shadow. The solid steel fill is reserved for exactly three things: the
primary button, the `new` state pill, and the sign-in field. Registration marks (four steel `+`,
class `.marks`) are reserved for the two objects that must read as special: the open gap card and
the honest stub. If marks spread to every panel they stop meaning anything.

Density is unchanged — 15px body, same paddings — but the measure went **1100px → 1240px** so the
gap list can carry a question sentence, a timestamp and a count on one line at 1366.

## 2. Fonts — the one thing that needs work outside the stylesheet

The system stack in the current build was a placeholder, so the design system's typefaces win.
§3.2 forbids a fetch, so the faces are inlined. The `@font-face` blocks at the top of
`admin-console.css` carry `INLINE-BASE64-HERE` tokens and the exact procedure: download Barlow
400/500 and Barlow Condensed 600 (SIL OFL — redistribution inside the hub is fine), subset to
latin + digits + punctuation with `pyftsubset --layout-features='' --flavor=woff2` (~14–20 kB a
face, ~50 kB on the stylesheet), base64 them in, delete the `src: local()` line.

Until that is done the stack falls back to `system-ui`, which is what the console looks like today —
so an un-inlined deploy degrades to the current build rather than to Times. **I could not produce
the base64 myself**; that is a build step for engineering, and it is the one item in this handback
that is not finished.

## 3. Markup changes, per file

### `src/admin/html.js`

1. **`CSS`** — replace wholesale with `admin-console.css`.
2. **`page()`** — no structural change. The nav badge already renders only when `count` is a
   number; keep that. `badge.zero` still exists but should not be reachable: a destination whose
   concept is not built passes `count: null`, not `0`.
3. **`notYet()`** — add `marks` to the class and drop nothing else:
   `<section class="notyet marks">`. The `::before` kicker ("Not in this build") is drawn by CSS,
   so the heading no longer has to carry that phrase; leave existing headings as they are if you
   would rather not touch the seven call sites.
4. **New helper `limit(text)`** — the standing limitation note (`<p class="limit">`). It exists so
   that a sentence stating a limitation is a *component*, not a paragraph someone can delete
   without noticing:
   ```js
   /** A stated limitation. Brief §3.5: the words stay, where the reader is looking. */
   export function limit(body) { return html`<p class="limit">${body}</p>`; }
   ```
5. **`stat()`** — unchanged. The tiles are now hairline cells in one rail; that is pure CSS.

### `pages/review.js` — the substantial change

The fourteen `<article class="card">` become a `<div class="gaps">` of native `<details>`. No
script: `<details>` opens with scripting off, and the first item is rendered `open`.

```html
<div class="gaps">
  <details class="gap marks" open>            <!-- first item only -->
    <summary>
      <span class="at">2026-09-06 03:00</span>
      <span class="plat">windows</span>
      <span class="q">How do I get my laptop to see two monitors through the dock?</span>
      <span class="hits">asked 3×</span>       <!-- omit the span's text when unknown -->
      <span class="chev">▸</span>
    </summary>
    <div class="gap-body">
      <p class="q-full">…the question…</p>
      <div class="facts"><span>First asked … · last …</span><span>Asked 3 times</span><span>Declined by <span class="mono">…</span></span></div>
      <p class="retrieved">Retrieved and not enough: <a…>…</a></p>
      <div class="answer">…the form, see below…</div>
    </div>
  </details>
  …
</div>
```

- `summary` is a five-column grid: `132px 96px 1fr auto 18px`. Keep the order.
- **When the question text was not logged**, put the existing sentence in
  `<span class="q unlogged">` and leave `.hits` empty — a gap with no text cannot be deduplicated,
  so it gets no count rather than a `1`. The full sentence
  ("Question text was not logged. `MATIC_KB_LOG_QUERIES` was off when this was asked…") stays in
  the markup; the row shows the short form, the open body shows the long one.
- **The `.hits` count is a real count or nothing.** It needs a `GROUP BY` on the normalised
  question text in the retrieval log. If that query is not cheap, ship the rows without `.hits`
  rather than with a `1` on every row.
- Section count in the rule: `<h2>KB gaps<span class="count">14 open</span></h2>`.

### The "answer this gap" form (`pages/review.js`, not built)

Drawn as a real form, per Charles's instruction, so engineering builds the screen once:

```html
<form class="answer" method="post" action="/admin/review/gaps/{id}/answer">
  {csrfField(token)}
  <label for="ans-title-{id}">Answer this gap — new article title</label>
  <input id="ans-title-{id}" name="title" type="text" value="{a title seeded from the top retrieved article}">
  <label for="ans-body-{id}">Answer</label>
  <textarea id="ans-body-{id}" name="body" placeholder="Write the answer an IT person would give. It becomes an article the assistant can cite."></textarea>
  <p class="hint">Publishing writes an article attributed to you and closes this gap. The gap stays open until it does.</p>
  <div class="row">
    <button class="primary" type="submit" name="action" value="publish">Publish answer</button>
    <button type="submit" name="action" value="draft">Save as draft</button>
    <button class="link" type="submit" name="action" value="dismiss">Not a gap — dismiss</button>
  </div>
</form>
```

**It must not ship as a form that posts to a route that does not exist.** Until the knowledge
editor lands, one of two honest states:

- *Preferred:* render the form with `disabled` on the three controls and, immediately above the
  `.row`, the existing sentence — "Answering a gap writes an article, and article authoring
  arrives with the knowledge editor." The layout is then already correct on the day the route
  exists; you delete one attribute and one sentence.
- *Or:* omit the `<form>` and keep today's line in the `.gap-body`. The card is still designed for
  it; nothing is implied.

Either way the words stay. Do not ship an enabled button that 404s.

### `pages/tickets.js`

- The four state tiles and the filter row were the same four numbers twice. **Delete the
  `<div class="grid">` of `a.stat` tiles** and keep one `.filters` row where each link carries its
  count: `<a href="…" class="current">All<span class="n">7</span></a>`. Zeroes stay here — an open
  count of zero is a real count of a real concept.
- Move "Nobody has been emailed about any of these…" out of the `.lede` into `limit(…)` directly
  under it. Same words, verbatim.
- Wrap the table in `<div class="panel" style="padding:0 0 4px">`; first and last cells take
  `padding-inline` 20px so the rules run to the frame.
- **At 300 rows:** the design does not change. Add server-side paging at 50 with the same
  `.filters` markup for the pager, and keep the header row `position: sticky; top: 0` — one line of
  CSS I have not added because it needs a scroll container decision.

### `pages/tickets.js` (detail)

- Two-column body: `1fr 400px`, content left, Routing and Reporter right.
- "Nobody has been emailed" moves from the lede to `limit(…)`, with the second sentence added:
  "Changing its state here tells no one; the queue is the only place it is visible."
- The State panel is titled "State — the one action on this page" and its `<select>` and
  `<button class="primary">` sit on one row.
- The reporter's `self_asserted` line is unchanged, in `dl.kv`, which is now a ruled table rather
  than a loose grid.

### `pages/agents.js`, `pages/metrics.js`, `pages/knowledge.js`, `pages/settings.js`

No markup change beyond `notYet()` gaining `marks`. That is the point of the component: 1d and 1e
are the same object.

### `pages/login.js`

Replaces `.login` with a two-column field:

```html
<div class="signin">
  <div class="signin-field">
    <div class="brand">Matic Desk<small>Admin console</small></div>
    <div class="note">…the loopback paragraph, the local-accounts paragraph, the create-user line…</div>
  </div>
  <div class="signin-form">
    <h1>Sign in</h1>
    <p class="lede">Password and a six-digit authenticator code.</p>
    <form method="post" action="/admin/login" autocomplete="on">…unchanged…</form>
  </div>
</div>
```

The loopback notice is no longer a `notyet` box under the form — it is the first thing on the page,
on the steel field. Every word is retained. The error block (`.error`) sits above the first label.
`.login` is still in the stylesheet, so an un-migrated login page still renders.

## 4. The three asks, answered

1. **The gap card.** A compact list of hairline rows, one open, sized for a question sentence, with
   a per-row hit count and a designed home for the answer form. The open card is one of only two
   objects in the console wearing registration marks — it is the screen's subject.
2. **Counts.** Nav badges only where a real number exists (Review queue, Tickets — the other four
   carry none, not a zero). A section count in the `h2` rule where the section has one. A per-row
   count on a gap when the text was logged. Filter links carry their own counts on the ticket list,
   so the tiles and the filters stopped being two rows of the same numbers. Nowhere else.
3. **The honest stub.** A reserved area on a drawing: steel hairline, 45° hatch at 7% accent,
   registration marks, a CSS-drawn kicker "NOT IN THIS BUILD", and the "Arrives with" line
   separated by its own rule. Nothing beige, nothing dashed, nothing that reads as a warning. One
   component, no variants: 1d is a whole screen of it, 1e is one section of a live screen.

Smaller asks: ticket queue at 7 and at 300 (above); the ticket detail's single action (above);
the sign-in loopback notice (above); density kept at 15px, measure widened to 1240px.

## 5. What I did not do, and why

- **The base64 fonts.** Named, specified, not produced. §2.
- **Audit-log scannability.** It was in the brief's smaller list and I have no audit-log artboard —
  none of the eleven canvas screens showed one, so I would have been designing from the schema.
  Give me `admin_audit` rows and it is a short pass: it wants the same hairline row treatment as
  the gap list with a monospaced actor column.
- **Knowledge and Settings.** Untouched beyond the shared components. Both are stubs today; both
  get a brief after the next engineering pass.
- **Sticky table headers at 300 rows.** Needs a scroll-container decision I should not make alone.
- **An icon set.** The design system specifies Lucide at 1.5, and each icon would be an inline SVG
  in the markup. The console needs exactly two glyphs (the disclosure caret and the select chevron)
  and both are drawn in CSS. Adding a Lucide set is a later decision, not a gap.
- **Anything needing JavaScript.** Two ideas are worth recording as wishes rather than drawings: a
  live filter on the gap list, and a toast confirming a state change. Both are currently served by
  a full page render, which is fine at this scale.
- **I did not touch a single limitation sentence.** Every one of them is in the artboards verbatim,
  in the markup, at the size the surrounding text is read at. The `.limit` component exists to make
  deleting one a visible act.
