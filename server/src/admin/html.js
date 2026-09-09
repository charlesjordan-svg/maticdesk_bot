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
:root{--bg:#f6f7f9;--panel:#fff;--ink:#1a1d21;--muted:#5d6570;--line:#e2e5ea;--accent:#1f5eff;--accent-ink:#fff;--warn-bg:#fff7e6;--warn-line:#f0c36d;--warn-ink:#7a4d00;--danger:#b42318;--ok:#1a7f37;--badge:#d92d20}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
header.top{background:var(--panel);border-bottom:1px solid var(--line);padding:0 24px;display:flex;align-items:center;gap:24px;height:56px}
header.top .brand{font-weight:700;letter-spacing:.2px}
header.top .brand small{font-weight:400;color:var(--muted);margin-left:8px}
nav.primary{display:flex;gap:4px;flex:1}
nav.primary a{padding:8px 12px;border-radius:8px;color:var(--ink)}
nav.primary a.current{background:var(--bg);font-weight:600}
nav.primary a:hover{text-decoration:none;background:var(--bg)}
.badge{display:inline-block;min-width:20px;padding:0 6px;border-radius:10px;background:var(--badge);color:#fff;font-size:12px;line-height:20px;text-align:center;margin-left:6px;font-weight:600}
.badge.zero{background:var(--line);color:var(--muted)}
.who{color:var(--muted);font-size:13px;display:flex;align-items:center;gap:12px}
.who form{margin:0}
.notice{background:var(--warn-bg);border-bottom:1px solid var(--warn-line);color:var(--warn-ink);padding:8px 24px;font-size:13px}
main{max-width:1100px;margin:0 auto;padding:24px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px}
.lede{color:var(--muted);margin:0 0 20px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin-bottom:16px}
.panel h2{margin-top:0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.stat .n{font-size:28px;font-weight:700;line-height:1.1}
.stat .l{color:var(--muted);font-size:13px}
.stat .why{font-size:12px;color:var(--muted);margin-top:6px}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);padding:8px 10px;border-bottom:1px solid var(--line)}
td{padding:10px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
.mono{font-family:ui-monospace,Consolas,monospace;font-size:13px}
.muted{color:var(--muted)}
.pill{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;border:1px solid var(--line);background:var(--bg)}
.pill.new{border-color:#b7d3ff;background:#eaf1ff;color:#0b3fb3}
.pill.open{border-color:#f0c36d;background:var(--warn-bg);color:var(--warn-ink)}
.pill.resolved{border-color:#a6dcb3;background:#e9f8ec;color:var(--ok)}
.pill.closed{color:var(--muted)}
.notyet{border:1px dashed var(--warn-line);background:var(--warn-bg);color:var(--warn-ink);border-radius:12px;padding:16px 20px;margin-bottom:16px}
.notyet h2{margin-top:0;color:var(--warn-ink)}
.notyet p:last-child{margin-bottom:0}
.empty{color:var(--muted);padding:24px;text-align:center;border:1px dashed var(--line);border-radius:12px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin-bottom:12px}
.card .meta{color:var(--muted);font-size:13px;margin-bottom:6px}
.card .q{font-size:16px}
.card .retrieved{margin-top:8px;font-size:13px;color:var(--muted)}
form.inline{display:inline}
button,.btn{font:inherit;border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:6px 12px;cursor:pointer;color:var(--ink)}
button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
button.link{border:0;background:none;color:var(--accent);padding:0}
button.link:hover{text-decoration:underline}
button:disabled{opacity:.5;cursor:default}
label{display:block;font-size:13px;color:var(--muted);margin:12px 0 4px}
input[type=text],input[type=email],input[type=password],select{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;width:100%;max-width:420px;background:var(--panel)}
.error{color:var(--danger);background:#fef3f2;border:1px solid #f6c4bf;border-radius:8px;padding:10px 12px;margin-bottom:12px}
.flash{color:var(--ok);background:#e9f8ec;border:1px solid #a6dcb3;border-radius:8px;padding:10px 12px;margin-bottom:12px}
dl.kv{display:grid;grid-template-columns:160px 1fr;gap:6px 16px;margin:0}
dl.kv dt{color:var(--muted);font-size:13px}dl.kv dd{margin:0}
blockquote{margin:6px 0 0;padding:8px 12px;border-left:3px solid var(--line);background:var(--bg);border-radius:0 8px 8px 0;white-space:pre-wrap}
.login{max-width:420px;margin:60px auto}
.filters a{margin-right:10px}
footer.foot{color:var(--muted);font-size:12px;padding:24px;text-align:center}
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
 * }} p
 * @returns {string}
 */
export function page({ title, body, nav = [], current = "", who = null, csrf = null, notice = null }) {
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
<header class="top"><div class="brand">Matic Desk<small>admin console</small></div><nav class="primary">${navHtml.join("")}</nav>${whoHtml}</header>
${notice ? `<div class="notice">${esc(notice)}</div>` : ""}
<main>${body}</main>
<footer class="foot">Loopback only. Server-rendered; every form works without JavaScript.</footer>
</body></html>`;
}

/**
 * The honest-stub block (handover §0, exit criterion 6). Says WHAT is missing and WHY, and names
 * the item that supplies it. Never a zero standing in for an absent concept.
 *
 * @param {{ heading: string, missing: string, why: string, arrives?: string }} p
 */
export function notYet({ heading, missing, why, arrives }) {
  return html`<section class="notyet"><h2>${heading}</h2><p><strong>${missing}</strong></p><p>${why}</p>${
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

/** The hidden CSRF field every state-changing form carries. */
export function csrfField(token) {
  return html`<input type="hidden" name="_csrf" value="${token}">`;
}
