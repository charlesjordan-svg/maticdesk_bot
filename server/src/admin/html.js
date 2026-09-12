// @ts-check
/**
 * HTML for the admin console: escaping, the page shell, and the few components every screen uses.
 *
 * ESCAPE BY DEFAULT IS THE WHOLE DESIGN OF THIS FILE. `html` is a tagged template: every
 * interpolated value is escaped unless it is the result of another `html` call or of `raw()`.
 * A ticket's `description` is an employee's own words; a KB article is admin-authored markdown
 * shown back to OTHER admins; an audit `subject` can be anything a request carried. All of it
 * crosses between people, so all of it is untrusted here (handover §2, the same audience problem
 * as D214's `summary` one layer out). Getting this wrong once is XSS in a console that holds a
 * session cookie, so it is not left to each page to remember.
 *
 * No framework, no bundler, no build step (D221): the shell is a string, the CSS is inline, and
 * the one script is optional progressive enhancement (a confirm on the state form). Every form
 * works with JavaScript off.
 */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** @param {unknown} v */
export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** A marker for HTML that has already been escaped or is trusted literal markup. */
export class Safe {
  /** @param {string} s */
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

/** Mark a string as already-safe HTML. Use sparingly and only on markup this file produced. */
export function raw(s) {
  return new Safe(String(s));
}

/**
 * The tagged template. Arrays are joined (each element escaped or Safe), null/undefined render
 * as nothing, everything else is escaped.
 *
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 * @returns {Safe}
 */
export function html(strings, ...values) {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) out += render(values[i]);
  }
  return new Safe(out);
}

function render(v) {
  if (v === null || v === undefined || v === false) return "";
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(render).join("");
  return esc(v);
}

/** Date -> "2026-09-09 14:03" in UTC, or "-" */
export function when(d) {
  if (!d) return "-";
  const iso = (d instanceof Date ? d : new Date(d)).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

/** Date -> relative words for a badge: "3 min ago", "2 days ago". Not for anything precise. */
export function ago(d) {
  if (!d) return "";
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400 * 1.5) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

const CSS = `
/* ============================================================================
   Matic Desk admin console — stylesheet
   Replacement for the \`CSS\` constant in server/src/admin/html.js
   Design pass 2026-09-09. Industry design system (steel-on-paper wireframe).

   Rules this sheet obeys, from the brief §3:
     - No JavaScript is required by anything here. Every state is :hover,
       :focus-visible, :target or a native <details>.
     - No external asset. The only images are inline data-URI SVGs.
     - Plain CSS, custom properties, no build step.

   FONTS — SHIPPED 2026-09-09, SELF-HOSTED (D225, src/admin/assets.js). The handback below
   proposed inlining them as base64; the hub serves the three woff2 files from /admin/assets/
   instead — same origin (font-src 'self'), offline-safe, and cacheable. The original note:

   FONTS — read this before shipping.
   The design is Barlow Condensed (headings, numerals, table heads, nav) over
   Barlow (body). §3.2 forbids a fetch, so the two faces must be inlined:

     1. Download Barlow 400/500 and Barlow Condensed 600 (SIL OFL, so
        redistribution inside the hub is fine) from fonts.google.com.
     2. Subset each to latin + digits + the punctuation the console uses
        (pyftsubset --layout-features='' --flavor=woff2). ~14-20 kB per face.
     3. Base64 them into the four @font-face blocks below, replacing the
        INLINE-BASE64-HERE tokens, and delete the src: local() line.

   Until step 3 is done the stack falls back to the system UI face, which is
   what the current build already looked like — so an un-inlined deploy
   degrades to today rather than to Times.
   ========================================================================= */

@font-face {
  font-family: "Barlow C";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/admin/assets/barlow-400.woff2") format("woff2");
}
@font-face {
  font-family: "Barlow C";
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("/admin/assets/barlow-500.woff2") format("woff2");
}
@font-face {
  font-family: "Barlow Cond C";
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/admin/assets/barlow-condensed-600.woff2") format("woff2");
}

:root {
  /* ground and ink */
  --bg: #f2f2f3;
  --ink: #1d1f20;
  --muted: #5d5d60;          /* 6.1:1 on --bg */
  --faint: #7a7a7d;          /* 4.6:1 on --bg — smallest text still legal */
  --line: #d4d4d7;           /* hairline */
  --line-2: #b7b7ba;         /* emphasised hairline */

  /* the one accent: steel */
  --accent: #5980a6;         /* chrome, marks, rules — 3.2:1, never body copy */
  --accent-ink: #416180;     /* accent AS TEXT — 5.4:1 on --bg */
  --accent-hover: #4c7096;
  --accent-press: #416180;
  --accent-tint: #e9f0f7;    /* row hover, current nav, tinted fills */
  --accent-tint-2: #d8e5f0;
  --accent-field: #1d2d3d;   /* the one reversed field (sign-in) */
  --paper: #f2f2f3;          /* type reversed onto the field */

  /* the single functional non-steel colour: form errors. Not decorative. */
  --danger: #8f2417;
  --danger-tint: #f7ecea;

  --mono: ui-monospace, "Cascadia Mono", Consolas, monospace;
  --head: "Barlow Cond C", "Barlow Condensed", system-ui, sans-serif;
  --body: "Barlow C", "Barlow", system-ui, -apple-system, "Segoe UI", sans-serif;

  --w: 1240px;               /* content measure — was 1100 */
  --pad: 24px;

  /* registration mark: a 9px steel "+" drawn as inline SVG */
  --mark: url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='9'%3E%3Cpath d='M4.5 0v9M0 4.5h9' stroke='%235980a6' stroke-width='1'/%3E%3C/svg%3E");
  /* reserved-area hatch: 45° steel rule every 8px, very light */
  --hatch: repeating-linear-gradient(45deg, rgba(89,128,166,.07) 0 1px, transparent 1px 8px);
}

* { box-sizing: border-box }

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 400 15px/1.5 var(--body);
  -webkit-font-smoothing: antialiased;
}

a { color: var(--accent-ink); text-decoration: none; text-underline-offset: 3px }
a:hover { text-decoration: underline }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }
::selection { background: var(--accent-tint-2) }

/* --- registration marks -------------------------------------------------
   Four steel "+" inside the corners of a framed object. Applied by class,
   no extra markup. Reserved (design decision, 2026-09-09) for the two
   objects that must read as special: the review queue's gap card and the
   honest stub. Do not spread it to every panel — it stops meaning anything. */
.marks {
  background-image: var(--mark), var(--mark), var(--mark), var(--mark);
  background-repeat: no-repeat;
  background-position: 4px 4px, calc(100% - 4px) 4px, 4px calc(100% - 4px), calc(100% - 4px) calc(100% - 4px);
}

/* --- header -------------------------------------------------------------- */
header.top {
  background: var(--bg);
  border-bottom: 1px solid var(--line-2);
  padding: 0 var(--pad);
  display: flex; align-items: center; gap: 28px;
  height: 56px;
}
header.top .brand {
  font: 600 19px/1 var(--head);
  letter-spacing: .01em; text-transform: uppercase;
}
header.top .brand small {
  display: inline-block; margin-left: 10px; padding-left: 10px;
  border-left: 1px solid var(--line-2);
  font: 400 12px/1 var(--body); letter-spacing: .1em;
  text-transform: uppercase; color: var(--muted);
}
nav.primary { display: flex; gap: 0; flex: 1; align-self: stretch }
nav.primary a {
  display: flex; align-items: center; gap: 7px;
  padding: 0 14px; color: var(--ink);
  font: 600 15px/1 var(--head); letter-spacing: .01em;
  border-bottom: 2px solid transparent;
}
nav.primary a:hover { text-decoration: none; background: var(--accent-tint) }
nav.primary a:active { background: var(--accent-tint-2) }
nav.primary a.current { border-bottom-color: var(--accent); background: var(--accent-tint) }

/* Counts. A count is drawn only where a real number exists — a destination
   whose concept is not built carries no badge, not a zero (brief §3.6). */
.badge {
  min-width: 20px; padding: 0 5px;
  background: var(--accent); color: var(--paper);
  font: 600 13px/18px var(--head); text-align: center;
  border-radius: 0;
}
.badge.zero { background: transparent; color: var(--faint); box-shadow: inset 0 0 0 1px var(--line-2) }

.who { color: var(--muted); font-size: 13px; display: flex; align-items: center; gap: 14px }
.who form { margin: 0 }

.notice {
  background: var(--accent-tint); border-bottom: 1px solid var(--accent);
  color: var(--ink); padding: 9px var(--pad); font-size: 13px;
}
/* The degraded-retrieval banner (D236, 2026-09-10). The one standing warning the console has:
   drawn on EVERY page while /v1/health says retrieval is not running both legs, because a decline
   made in that state is not evidence of a gap and an admin working the queue has to know before
   they author an article. Steel, not the danger red - nothing is broken, something is missing. */
.notice.warn {
  background: var(--accent-tint-2); border-bottom: 1px solid var(--accent-ink);
  font-weight: 500;
}
.notice.warn .mono { font-weight: 400; color: var(--muted) }

/* The insecure-mode banner (D267, 2026-09-12). Deliberately the ugliest thing in the console, and
   deliberately NOT the steel of .notice.warn: that one says "something is missing", this one says
   "authentication has been weakened on purpose". It sits above the header on every page, including
   the bare sign-in page, so no screenshot of this console taken while it is on can look normal. */
.insecure {
  background: #7f1d1d; color: #fff; padding: 10px var(--pad);
  font: 600 13px/1.35 var(--head); letter-spacing: .02em; text-transform: uppercase;
  border-bottom: 3px solid #450a0a;
}

main { max-width: var(--w); margin: 0 auto; padding: 28px var(--pad) 40px }

/* --- type ---------------------------------------------------------------- */
h1 {
  font: 600 30px/1.1 var(--head); letter-spacing: -.005em;
  margin: 0 0 6px; display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
}
h2 {
  font: 600 13px/1.2 var(--head); letter-spacing: .12em; text-transform: uppercase;
  color: var(--muted); margin: 30px 0 10px;
  padding-bottom: 6px; border-bottom: 1px solid var(--line);
  display: flex; align-items: baseline; gap: 10px;
}
h2 .muted { text-transform: none; letter-spacing: 0 }
/* the count that belongs to a section sits in its rule */
h2 .count {
  margin-left: auto; color: var(--accent-ink);
  font: 600 13px/1.2 var(--head); letter-spacing: .06em;
}
.lede { color: var(--muted); margin: 0 0 22px; max-width: 78ch }
.mono { font-family: var(--mono); font-size: 13px; letter-spacing: -.01em }
.muted { color: var(--muted) }

/* --- panels: line drawings, never filled boxes --------------------------- */
.panel {
  background: transparent; border: 1px solid var(--line);
  border-radius: 0; padding: 18px 20px; margin-bottom: 16px;
}
.panel h2 { margin-top: 0 }
.panel > :last-child { margin-bottom: 0 }

.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0 }

/* --- measures ------------------------------------------------------------
   A rail of cells divided by hairlines rather than four floating boxes:
   the grid stays visible and a missing figure reads as part of the same rail. */
.stat {
  background: transparent; border: 1px solid var(--line);
  border-radius: 0; padding: 14px 16px; margin: 0 -1px -1px 0;
  display: block; color: inherit;
}
a.stat:hover { background: var(--accent-tint); text-decoration: none }
a.stat:active { background: var(--accent-tint-2) }
.stat .n {
  font: 600 34px/1 var(--head); letter-spacing: -.01em;
  font-variant-numeric: tabular-nums;
}
.stat .n.muted { color: var(--faint) }
.stat .l { color: var(--ink); font-size: 13px; margin-top: 6px }
.stat .why { font-size: 12px; color: var(--muted); margin-top: 4px; line-height: 1.4 }

/* --- tables -------------------------------------------------------------- */
table { width: 100%; border-collapse: collapse }
th {
  text-align: left; font: 600 11px/1.2 var(--head);
  text-transform: uppercase; letter-spacing: .1em; color: var(--muted);
  padding: 8px 10px; border-bottom: 1px solid var(--line-2); white-space: nowrap;
}
td { padding: 11px 10px; border-bottom: 1px solid var(--line); vertical-align: top }
tbody tr:hover td { background: var(--accent-tint) }
tr:last-child td { border-bottom: 0 }
td .mono a { font-weight: 500 }

/* --- state pills: mono palette, weight not hue --------------------------- */
.pill {
  display: inline-block; padding: 1px 9px; border-radius: 0;
  font: 600 11px/18px var(--head); letter-spacing: .08em; text-transform: uppercase;
  border: 1px solid var(--line-2); background: transparent; color: var(--muted);
}
.pill.new { background: var(--accent); border-color: var(--accent); color: var(--paper) }
.pill.open { background: var(--accent-tint); border-color: var(--accent); color: var(--accent-ink) }
.pill.resolved { border-color: var(--line-2); color: var(--ink) }
.pill.closed { border-color: var(--line); color: var(--faint) }

/* --- the honest stub -----------------------------------------------------
   Not broken, not a warning: a reserved area on a drawing. Steel hairline,
   registration marks, a hatched ground that says "nothing is drawn here
   yet", and a kicker naming it. Works as a whole screen (Agents) and as one
   section inside a live screen (Metrics) with no variant. */
.notyet {
  position: relative; border: 1px solid var(--accent);
  background: var(--hatch); background-color: transparent;
  border-radius: 0; padding: 22px 24px 20px; margin-bottom: 18px; color: var(--ink);
}
.notyet::before {
  content: "Not in this build";
  display: block; margin-bottom: 10px;
  font: 600 11px/1 var(--head); letter-spacing: .16em; text-transform: uppercase;
  color: var(--accent-ink);
}
.notyet h2 {
  margin: 0 0 10px; padding: 0; border: 0;
  font: 600 21px/1.15 var(--head); letter-spacing: -.005em;
  text-transform: none; color: var(--ink);
}
.notyet p { margin: 0 0 10px; max-width: 82ch }
.notyet p strong { font-weight: 500; color: var(--ink) }
.notyet p:last-child { margin-bottom: 0 }
/* "Arrives with:" — the one line that says what supplies it */
.notyet p.muted:last-child {
  margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--accent);
  font: 400 13px/1.4 var(--body); color: var(--muted);
}
.notyet.marks { padding: 22px 24px 20px }

.empty {
  color: var(--muted); padding: 26px; text-align: center;
  border: 1px solid var(--line); border-radius: 0; background: var(--hatch);
}

/* --- a stated limitation -------------------------------------------------
   Brief §3.5: the words stay, where the reader is looking. This styles them
   and does nothing else — it is not an icon, a tooltip or a colour code. */
.limit {
  border-left: 3px solid var(--accent);
  padding: 2px 0 2px 14px; margin: 0 0 18px;
  font-size: 14px; color: var(--ink); max-width: 80ch;
}
.limit b, .limit strong { font-weight: 500 }

/* --- review queue: the gap list -----------------------------------------
   Fourteen rows you can read at once, one open. <details>/<summary> is
   native: it opens with scripting off and keeps the open row on the page. */
.gap {
  border: 1px solid var(--line); border-bottom: 0; background: transparent;
}
.gaps > .gap:last-of-type { border-bottom: 1px solid var(--line) }
.gap > summary {
  display: grid; grid-template-columns: 132px 96px 1fr auto 18px;
  align-items: baseline; gap: 14px;
  padding: 11px 14px; cursor: pointer; list-style: none;
}
.gap > summary::-webkit-details-marker { display: none }
.gap > summary:hover { background: var(--accent-tint) }
.gap > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px }
.gap .at { font-family: var(--mono); font-size: 12px; color: var(--muted); white-space: nowrap }
.gap .plat {
  font: 600 11px/18px var(--head); letter-spacing: .08em; text-transform: uppercase;
  color: var(--muted);
}
.gap .q {
  font-size: 15px; color: var(--ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.gap .q.unlogged { color: var(--muted) }
/* per-row count: how many times this gap was hit. Absent when unknown. */
.gap .hits {
  font: 600 13px/18px var(--head); color: var(--accent-ink);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.gap .chev { width: 18px; color: var(--accent); font-size: 12px; text-align: right }
/* the retrieval-mode flag (D236): drawn ONLY on a row whose decline was made under degraded
   retrieval or before the mode was recorded. A hybrid row carries nothing - the flag means "do
   not author from this", and a flag on every row would mean nothing. */
.gap .mode {
  font: 600 11px/16px var(--head); letter-spacing: .06em; text-transform: uppercase;
  color: var(--accent-ink); border: 1px solid var(--accent); padding: 0 6px; white-space: nowrap;
}
.gap .mode.unknown { color: var(--faint); border-color: var(--line-2) }
.gap[open] { border-color: var(--accent); position: relative; z-index: 1 }
.gap[open] > summary { background: var(--accent-tint); border-bottom: 1px solid var(--accent) }
.gap[open] .chev { transform: rotate(90deg); display: inline-block }
.gap-body { padding: 18px 18px 20px }
.gap-body .q-full {
  font: 400 19px/1.35 var(--body); margin: 0 0 4px; max-width: 70ch;
}
.gap-body .q-full.unlogged { color: var(--muted); font-size: 15px }
.gap-body .facts {
  display: flex; flex-wrap: wrap; gap: 6px 20px; margin: 0 0 16px;
  font-size: 13px; color: var(--muted);
}
.gap-body .retrieved { font-size: 13px; color: var(--muted); margin: 0 0 6px }
.gap-body .retrieved a { color: var(--accent-ink) }

/* the designed place for "answer this gap" (not built — see the handback) */
.answer {
  margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line);
}
.answer .row { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap }
.answer textarea {
  font: 400 15px/1.5 var(--body); width: 100%; max-width: 720px;
  min-height: 96px; padding: 10px 12px; resize: vertical;
  border: 1px solid var(--line-2); border-radius: 0; background: var(--bg); color: var(--ink);
}
.answer textarea:hover, .answer input:hover { border-color: var(--accent) }
.answer .hint { font-size: 12px; color: var(--muted); margin: 6px 0 0 }

/* --- buttons ------------------------------------------------------------- */
button, .btn {
  font: 600 14px/1.2 var(--head); letter-spacing: .04em; text-transform: uppercase;
  border: 1px solid var(--line-2); background: transparent; color: var(--ink);
  border-radius: 0; padding: 9px 16px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 8px;
}
button:hover, .btn:hover { border-color: var(--accent); background: var(--accent-tint); text-decoration: none }
button:active, .btn:active { background: var(--accent-tint-2) }
/* the one solid object on the board */
button.primary, .btn.primary {
  position: relative;
  background: var(--accent); border-color: var(--accent); color: var(--paper);
}
button.primary:hover, .btn.primary:hover { background: var(--accent-hover); border-color: var(--accent-hover) }
button.primary:active, .btn.primary:active { background: var(--accent-press); border-color: var(--accent-press) }
button.link {
  border: 0; background: none; color: var(--accent-ink); padding: 0;
  font: 400 13px/1.4 var(--body); text-transform: none; letter-spacing: 0;
}
button.link:hover { text-decoration: underline; background: none }
button:disabled { opacity: .45; cursor: not-allowed }
form.inline { display: inline }

/* --- forms --------------------------------------------------------------- */
label {
  display: block; font: 600 11px/1.2 var(--head);
  letter-spacing: .12em; text-transform: uppercase;
  color: var(--muted); margin: 16px 0 5px;
}
label strong { color: var(--ink) }
input[type=text], input[type=email], input[type=password], select, textarea {
  font: 400 15px/1.4 var(--body);
  padding: 9px 11px; border: 1px solid var(--line-2); border-radius: 0;
  width: 100%; max-width: 420px; background: var(--bg); color: var(--ink);
}
input:hover, select:hover { border-color: var(--accent) }
select {
  appearance: none; padding-right: 34px;
  background-image: url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='7'%3E%3Cpath d='M1 1l4.5 4.5L10 1' fill='none' stroke='%235980a6' stroke-width='1.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 12px center;
}
::placeholder { color: var(--faint) }

.error {
  color: var(--danger); background: var(--danger-tint);
  border: 1px solid var(--danger); border-radius: 0;
  padding: 10px 14px; margin-bottom: 14px; font-size: 14px;
}
.flash {
  color: var(--ink); background: var(--accent-tint);
  border: 1px solid var(--accent); border-radius: 0;
  padding: 10px 14px; margin-bottom: 14px; font-size: 14px;
}

/* --- key/value and quoted content ---------------------------------------- */
dl.kv { display: grid; grid-template-columns: 150px 1fr; gap: 0; margin: 0 }
dl.kv dt {
  color: var(--muted); font: 600 11px/1.2 var(--head);
  letter-spacing: .1em; text-transform: uppercase;
  padding: 9px 0; border-top: 1px solid var(--line); align-self: center;
}
dl.kv dd { margin: 0; padding: 9px 0; border-top: 1px solid var(--line) }
dl.kv dt:first-of-type, dl.kv dt:first-of-type + dd { border-top: 0 }
dl.kv dd strong { font-weight: 500 }

blockquote {
  margin: 6px 0 0; padding: 12px 16px;
  border: 1px solid var(--line); border-left: 3px solid var(--accent);
  border-radius: 0; background: transparent; white-space: pre-wrap;
  font-size: 15px;
}

/* --- filters ------------------------------------------------------------- */
.filters { display: flex; align-items: baseline; gap: 0; margin: 0 0 4px; flex-wrap: wrap }
.filters strong {
  font: 600 11px/1.2 var(--head); letter-spacing: .12em; text-transform: uppercase;
  color: var(--muted); margin-right: 12px;
}
.filters a {
  margin: 0; padding: 6px 14px; color: var(--ink);
  font: 600 13px/1.2 var(--head); letter-spacing: .04em; text-transform: uppercase;
  border: 1px solid var(--line-2); margin-left: -1px;
}
.filters a:hover { background: var(--accent-tint); text-decoration: none }
.filters a.current { background: var(--accent); border-color: var(--accent); color: var(--paper) }
.filters .n { font-variant-numeric: tabular-nums; opacity: .7; margin-left: 6px }

/* --- sign-in -------------------------------------------------------------
   The one reversed field in the console: steel ground, paper type. It gives
   the product a front door and marks the boundary between outside and in. */
.signin { display: grid; grid-template-columns: 1fr 1fr; min-height: 100vh }
.signin-field {
  background: var(--accent-field); color: var(--paper);
  padding: 56px 56px 40px; display: flex; flex-direction: column;
}
.signin-field .brand { font: 600 34px/1 var(--head); text-transform: uppercase; letter-spacing: .01em }
.signin-field .brand small {
  display: block; margin-top: 10px;
  font: 400 13px/1 var(--body); letter-spacing: .18em; text-transform: uppercase;
  color: #a9bccd;
}
.signin-field .note {
  margin-top: auto; max-width: 46ch; font-size: 14px; line-height: 1.55; color: #d3dde6;
}
.signin-field .note strong { color: var(--paper); font-weight: 500 }
.signin-field .note p { margin: 0 0 12px }
.signin-field .note .mono { color: #a9bccd }
.signin-field .note hr { border: 0; border-top: 1px solid #3c586f; margin: 18px 0 }
.signin-form { padding: 56px; display: flex; flex-direction: column; justify-content: center }
.signin-form h1 { margin-bottom: 4px }
.signin-form form { max-width: 380px }
.signin-form .go { margin-top: 26px }
.login { max-width: 420px; margin: 60px auto }   /* legacy wrapper, still honoured */

footer.foot {
  color: var(--muted); font-size: 12px; padding: 22px var(--pad);
  text-align: center; border-top: 1px solid var(--line);
  max-width: var(--w); margin: 32px auto 0;
  letter-spacing: .02em;
}

@media (prefers-reduced-motion: no-preference) {
  nav.primary a, .gap > summary, button, .btn, .filters a, a.stat { transition: background-color .12s linear, border-color .12s linear }
}

/* --- engineering additions on applying the handback (2026-09-09) ---------
   Three things the handback described but the sheet did not carry, plus one
   fix: the ellipsised question needs min-width: 0 or the 1fr column will not
   shrink past the sentence's min-content width. */
.gap .q { min-width: 0 }
.detail { display: grid; grid-template-columns: 1fr 400px; gap: 16px; align-items: start }
.detail > .panel { margin-bottom: 0 }
.row { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap }
.row > * { margin: 0 }
.row select { width: auto; min-width: 200px }
/* Sticky table headers (handback §5): the page is the scroll container, so a header sticks to the
   viewport's top. Opaque ground, or the rows scroll through it. */
thead th { position: sticky; top: 0; background: var(--bg); z-index: 1 }
/* the pager reuses the filter row */
.pager { margin-top: 12px }
.pager .muted { margin-left: 12px; font-size: 13px }

/* --- engineering addition, KB search (2026-09-09) ------------------------
   TWO EQUAL COLUMNS, for the two retrieval legs side by side. The .detail
   grid is 1fr/400px (a record and its metadata) and .grid collapses
   hairlines into a rail of measures; neither is two peers. NOTE: no
   backticks in this comment — the sheet is a JS template literal, and one
   stray backtick here ended it and broke every page (caught 2026-09-09).
   The legs have to be peers on the
   page, because the whole reason for showing them unfused is that EITHER can
   be the broken half — a narrower column would read as the lesser leg.
   Stacks below 900px rather than squeezing two tables side by side.
   Nothing else is new: the result tables, pills, panels, empty states and
   stat rail are the existing components, and registration marks stay
   reserved for the gap card and the honest stub. */
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start }
.cols > .panel { margin-bottom: 0; min-width: 0 }
@media (max-width: 900px) { .cols { grid-template-columns: 1fr } }
/* A rank and a score are read DOWN a column, so the digits have to line up. */
td.mono { font-variant-numeric: tabular-nums }
`;

/**
 * The shell every page renders inside.
 *
 * @param {{
 *   title: string,
 *   body: Safe,
 *   nav?: Array<{ path: string, label: string, count?: number|null }>,
 *   current?: string,
 *   who?: { email: string, roles: string[], tenant: string } | null,
 *   csrf?: string | null,
 *   notice?: string | null,
 *   warning?: string | null,
 *   bare?: boolean,
 * }} p
 * @returns {string}
 *
 * `warning` is the standing banner (D236): the router fills it from the hub's own retrieval-health
 * reader on every authenticated page while retrieval is degraded, and it renders ABOVE `notice`
 * because a flash about the last action is less important than the state every action is made in.
 */
export function page({ title, body, nav = [], current = "", who = null, csrf = null, notice = null, warning = null, bare = false, insecure = null }) {
  const navHtml = nav.map((d) => html`<a href="${d.path}" class="${d.path === current ? "current" : ""}">${d.label}${
    d.count === null || d.count === undefined ? "" : html`<span class="badge ${d.count === 0 ? "zero" : ""}">${d.count}</span>`
  }</a>`);
  const whoHtml = who
    ? html`<div class="who"><span>${who.email} <span class="muted">· ${who.roles.join(", ")} · ${who.tenant}</span></span>
        <form method="post" action="/admin/logout"><input type="hidden" name="_csrf" value="${csrf ?? ""}"><button class="link" type="submit">Sign out</button></form></div>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Matic Desk admin</title><style>${CSS}</style></head>
<body>
${/* D267 guard 5. OUTSIDE the `bare` ternary on purpose: the sign-in page is bare, and it is the
     one page where a bypassed console most needs to announce itself. Drawn above everything,
     including the degraded-retrieval warning, because it is a statement about the console's
     authentication rather than about its data. */""}
${insecure ? `<div class="insecure">${esc(insecure)}</div>` : ""}
${bare ? body : `<header class="top"><div class="brand">Matic Desk<small>admin console</small></div><nav class="primary">${navHtml.join("")}</nav>${whoHtml}</header>
${warning ? `<div class="notice warn">${esc(warning)}</div>` : ""}
${notice ? `<div class="notice">${esc(notice)}</div>` : ""}
<main>${body}</main>
<footer class="foot">Loopback only. Server-rendered; every form works without JavaScript.</footer>`}
</body></html>`;
}

/**
 * The honest-stub block (handover §0, exit criterion 6). Says WHAT is missing and WHY, and names
 * the item that supplies it. Never a zero standing in for an absent concept.
 *
 * @param {{ heading: string, missing: string, why: string, arrives?: string }} p
 */
export function notYet({ heading, missing, why, arrives }) {
  return html`<section class="notyet marks"><h2>${heading}</h2><p><strong>${missing}</strong></p><p>${why}</p>${
    arrives ? html`<p class="muted">Arrives with: ${arrives}</p>` : ""
  }</section>`;
}

/** A count tile. `why` is shown under the number so a zero explains itself. */
export function stat(n, label, why = null) {
  return html`<div class="stat"><div class="n">${n}</div><div class="l">${label}</div>${why ? html`<div class="why">${why}</div>` : ""}</div>`;
}

/** An empty-state line. Always with a reason. */
export function empty(reason) {
  return html`<div class="empty">${reason}</div>`;
}

/**
 * A stated limitation (brief §3.5): the words stay, where the reader is looking. This is a
 * component rather than a paragraph so that deleting one is a visible act, not an edit to prose.
 * It styles the sentence and does nothing else — not an icon, a tooltip or a colour code.
 */
export function limit(body) {
  return html`<p class="limit">${body}</p>`;
}

/** The hidden CSRF field every state-changing form carries. */
export function csrfField(token) {
  return html`<input type="hidden" name="_csrf" value="${token}">`;
}
