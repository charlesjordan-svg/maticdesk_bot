// @ts-check
/**
 * Tickets: the queue and one ticket's detail, with a state change. The one fully working slice.
 *
 * Reads and the state change go through src/tickets/query.js — the SAME functions
 * bin/tickets.mjs calls (D224), so the CLI and this page cannot disagree about the rows.
 *
 * The state form is the console's first state-changing action: CSRF-checked by the router before
 * this file sees it, audited here with `{ from, to }`, and offered only for the transitions
 * NEXT_STATES allows. Viewing a ticket is audited too (`ticket.view`): the detail page carries the
 * reporter's name, location and contact and their own words, and D156's audit is about who read
 * which record, not only who changed one.
 *
 * "NOBODY HAS BEEN EMAILED" travels here too. That makes six surfaces for D213's caveat, and the
 * redundancy is the point (B6-TICKET-STORE.md §0).
 *
 * THE TIMELINE, SINCE 2026-09-12 (tenant/006, D275) — WORK NOTES ONLY. The detail page lists every
 * entry through `listEntries(…, { visibility: "all" })` — the console is the one reader entitled
 * to the internal rows, and it asks for them in words — and each entry carries its visibility AS
 * A LABEL, not only a colour, so a screenshot cannot lose it. ONE composer: "Add work note",
 * internal. There is deliberately NO "reply to requester" composer: nothing can deliver one until
 * P4 (gated on D271), and a button that reaches nobody for three phases is this project's signature
 * defect built on purpose (plan v3 §0 finding 8). `ticket.worknote` joins the audit log with who
 * and when and never the words. A state change writes its own entry inside `setTicketState()`.
 *
 * D276 — THE AGE, NOT THE COUNT. Both ticket screens carry, beside "NOBODY HAS BEEN EMAILED", the
 * age of the oldest requester comment nobody has answered. It reads "none" in this build because
 * no requester can comment yet, and it says why in words rather than drawing an empty cell. When
 * P4 lands the sentence changes on its own: `oldestUnansweredRequesterComment()` already reads the
 * clock (`tickets.awaiting_agent_since`) that P4 will start writing.
 */
import { html, notYet, empty, when, ago, csrfField, limit } from "../html.js";
import { route } from "../route.js";
import {
  countTicketsByState, getTicket, listTickets, setTicketState, NEXT_STATES, TICKET_STATES,
  addEntry, listEntries, oldestUnansweredRequesterComment,
} from "../../tickets/query.js";

const NOBODY_EMAILED = "Nobody has been emailed about any of these. This build has no outbound email (D86), so this list is the queue: if you do not look here, nobody knows.";

const pill = (state) => html`<span class="pill ${state}">${state}</span>`;

/** The console user as a timeline author: control-plane id recorded, email snapshotted (D143). */
const consoleAuthor = (ctx) => ({ kind: "console_user", adminUserId: ctx.user.id, label: ctx.user.email });

/**
 * D276's indicator. An AGE — "3" is ignorable, "41 h ago" is not. Null today, and the sentence
 * says why instead of showing nothing: no requester can comment until P4.
 */
function unansweredLimit(oldest) {
  if (!oldest) {
    return limit(html`<strong>Oldest unanswered requester comment: none.</strong> No requester can comment in this build — the panel has no ticket view and the hub has no comment route (P4, after D271). When one can, this line carries the <strong>age</strong> of the oldest comment nobody has answered, never a count.`);
  }
  return limit(html`<strong>Oldest unanswered requester comment: ${ago(oldest.since)}</strong>, on <a class="mono" href="/admin/tickets/${oldest.reference}">${oldest.reference}</a> — waiting since ${when(oldest.since)}.`);
}

const KIND_WORDS = { work_note: "work note", state_change: "state change", comment: "comment", resolution: "resolution" };

/**
 * One timeline entry. The visibility is a LABEL IN WORDS on every row (plan §7.4: it has to survive
 * a screenshot); the pill colour is secondary. "public" is honest about what it means today.
 */
function entryRow(e) {
  const vis = e.visibility === "internal"
    ? html`<span class="pill internal">internal</span> <span>the requester never sees this</span>`
    : html`<span class="pill">public</span> <span>reaches nobody in this build (D86) — requester-visible once P4 delivers</span>`;
  return html`<div class="entry">
    <div class="entry-head">${vis} · ${KIND_WORDS[e.kind] ?? e.kind} · <span class="mono">${e.authorLabel ?? e.authorKind}</span> · <span title="${e.createdAt.toISOString()}">${when(e.createdAt)} (${ago(e.createdAt)})</span></div>
    <blockquote>${e.body}</blockquote>
  </div>`;
}

/**
 * The timeline panel: every entry newest LAST, then the ONE composer this build has.
 *
 * NO "REPLY TO REQUESTER". Not an omission — a decision (D275, plan v3 §0 finding 8). Nothing can
 * deliver a requester-visible entry until P4, so a composer for one would be a control that reaches
 * nobody, three lines above a note saying so. It ships with the delivery path or not at all.
 */
function timelinePanel(ctx, t, entries) {
  const composer = !ctx.permissions.has("tickets.write")
    ? html`<p class="muted">Your roles (${ctx.roles.join(", ")}) can read the timeline but not add to it.</p>`
    : html`<form method="post" action="/admin/tickets/${t.reference}/worknote" style="margin-top:14px">
    ${csrfField(ctx.csrf)}
    <label for="body">Add work note (internal)</label>
    <textarea id="body" name="body" rows="3" maxlength="4000" placeholder="What you did, found, or are waiting on — for the desk." style="max-width:100%"></textarea>
    <p class="muted" style="font-size:13px;margin:4px 0 0">Internal: the requester never sees a work note. There is no reply-to-requester here on purpose — nothing can deliver one yet (P4, after D271).</p>
    <div class="row">
      <button class="primary" type="submit">Add work note</button>
      <span class="muted" style="font-size:13px">Recorded in the audit log as who wrote one and when — never the words.</span>
    </div>
  </form>`;
  return html`<div class="panel">
  <h2>Timeline<span class="count">${entries.length}</span></h2>
  ${entries.length ? entries.map(entryRow) : empty("Nothing yet. A state change writes an entry; so does a work note.")}
  ${composer}
</div>`;
}
const owner = (o) => o ? o.replace(/_/g, " ") : html`<span class="muted">unrouted</span>`;
const category = (c) => c.replace(/_/g, " ");

async function listPage(ctx) {
  const state = ctx.url.searchParams.get("state");
  const filter = state && TICKET_STATES.includes(state) ? state : null;
  const schema = ctx.tenant.schemaName;
  // Paging at 50 (handback §3): the design does not change at 300 rows, the list just has pages.
  const PAGE = 50;
  const counts = await countTicketsByState(schema);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const inFilter = filter ? counts[filter] : total;
  const pages = Math.max(1, Math.ceil(inFilter / PAGE));
  const page = Math.min(Math.max(Number(ctx.url.searchParams.get("page")) || 1, 1), pages);
  const rows = await listTickets(schema, { state: filter, limit: PAGE, offset: (page - 1) * PAGE });
  const oldest = await oldestUnansweredRequesterComment(schema);
  const pageHref = (p) => `/admin/tickets?${filter ? `state=${filter}&` : ""}page=${p}`;
  const body = html`
<h1>Tickets</h1>
<p class="lede">${total} in ${ctx.tenant.displayName}.</p>
${limit(NOBODY_EMAILED)}
${unansweredLimit(oldest)}
<p class="filters"><strong>Show</strong><a href="/admin/tickets" class="${filter ? "" : "current"}">All<span class="n">${total}</span></a>${TICKET_STATES.map((s) => html`<a href="/admin/tickets?state=${s}" class="${filter === s ? "current" : ""}">${s}<span class="n">${counts[s]}</span></a>`)}</p>
<div class="panel" style="padding:0 0 4px">
  ${rows.length ? html`
  <table>
    <thead><tr><th style="padding-inline-start:20px">Ref</th><th>State</th><th>Category</th><th>Suggested owner</th><th>Reporter</th><th>Machine</th><th style="padding-inline-end:20px">Filed</th></tr></thead>
    <tbody>${rows.map((t) => html`<tr>
      <td class="mono" style="padding-inline-start:20px"><a href="/admin/tickets/${t.reference}">${t.reference}</a></td>
      <td>${pill(t.state)}</td>
      <td>${category(t.category)}</td>
      <td>${owner(t.suggestedOwner)}</td>
      <td>${t.reporter ?? html`<span class="muted">unknown</span>`}<div class="muted" style="font-size:12px">${t.location ?? "no location"}</div></td>
      <td class="mono">${t.machineName ?? "-"}</td>
      <td title="${t.createdAt.toISOString()}" style="padding-inline-end:20px">${when(t.createdAt)}<div class="muted" style="font-size:12px">${ago(t.createdAt)}</div></td>
    </tr>`)}</tbody>
  </table>` : empty(filter ? `No tickets in state "${filter}".` : "No tickets have been filed in this tenant. The endpoint files one when a user accepts an escalation (POST /v1/ticket).")}
</div>
${pages > 1 ? html`<p class="filters pager"><strong>Page</strong>${page > 1 ? html`<a href="${pageHref(page - 1)}">Previous</a>` : ""}<a class="current" href="${pageHref(page)}">${page} of ${pages}</a>${page < pages ? html`<a href="${pageHref(page + 1)}">Next</a>` : ""}<span class="muted">${inFilter} ticket${inFilter === 1 ? "" : "s"}, ${PAGE} a page</span></p>` : ""}
<p class="muted">The same rows, from a terminal: <span class="mono">npm.cmd run tickets -- list${filter ? ` --state ${filter}` : ""}</span> (server/).</p>`;
  await ctx.render(200, body, { title: "Tickets", current: "/admin/tickets" });
}

/**
 * The one action on the detail page: the state, an optional internal note, one button (handback §3).
 *
 * The note is the INTERNAL resolution note (tenant/004, D239; wired 2026-09-12, D269): the human's
 * own account of what fixed it, kept for the desk. It is one field, always shown, never required —
 * the requester-facing note that P2 will require on `resolved` is a different field with a
 * different visibility, and it is not here yet. Two conditionals landing in two phases is how one
 * of them ends up wrong, so this one has none.
 */
function stateBlock(ctx, t, next) {
  if (!ctx.permissions.has("tickets.write")) return html`<p class="muted">Your roles (${ctx.roles.join(", ")}) can read tickets but not change them.</p>`;
  if (!next.length) return html`<p class="muted">No further transitions from ${t.state}.</p>`;
  return html`<form method="post" action="/admin/tickets/${t.reference}/state">
    ${csrfField(ctx.csrf)}
    <label for="next">Move ${t.reference} from <strong>${t.state}</strong> to</label>
    <select id="next" name="next">${next.map((s) => html`<option value="${s}">${s}</option>`)}</select>
    <label for="note">Internal resolution note (optional)</label>
    <textarea id="note" name="note" rows="3" maxlength="4000" placeholder="What actually fixed it, in your own words." style="max-width:100%"></textarea>
    <p class="muted" style="font-size:13px;margin:4px 0 0">Internal: kept on the ticket for the desk, shown on this page and by the CLI. The requester never sees it. Leaving it blank keeps whatever was written before.</p>
    <div class="row">
      <button class="primary" type="submit">Change state</button>
      <span class="muted" style="font-size:13px">Recorded in the audit log with who did it, and whether a note was written — never the note itself.</span>
    </div>
  </form>`;
}

async function detailPage(ctx) {
  const ref = ctx.params.ref;
  const t = await getTicket(ctx.tenant.schemaName, ref);
  if (!t) {
    return ctx.render(404, html`<h1>No ticket ${ref}</h1><p class="lede">Not in ${ctx.tenant.displayName}.</p><p><a href="/admin/tickets">Back to tickets</a></p>`, { title: "Not found", current: "/admin/tickets" });
  }
  await ctx.audit("ticket.view", { subject: t.reference });
  const next = NEXT_STATES[t.state] ?? [];
  const flash = ctx.url.searchParams.get("changed");
  const noted = ctx.url.searchParams.get("noted");
  const workNoted = ctx.url.searchParams.get("worknote");
  // "all": this page is the one reader entitled to internal rows, and it says so in the call (D275).
  const [entries, oldest] = await Promise.all([
    listEntries(ctx.tenant.schemaName, ref, { visibility: "all" }),
    oldestUnansweredRequesterComment(ctx.tenant.schemaName),
  ]);

  const body = html`
<p><a href="/admin/tickets">← Tickets</a></p>
<h1><span class="mono">${t.reference}</span> ${pill(t.state)}</h1>
<p class="lede">Filed ${when(t.createdAt)} (${ago(t.createdAt)}) · updated ${when(t.updatedAt)}.</p>
${limit("Nobody has been emailed about this ticket (D86). Changing its state here tells no one; the queue is the only place it is visible.")}
${unansweredLimit(oldest)}
${flash ? html`<div class="flash">State changed to ${t.state}.${noted ? " Internal note recorded." : ""}</div>` : ""}
${workNoted ? html`<div class="flash">Work note added — internal, on the timeline below.</div>` : ""}

<div class="detail">
<div>
<div class="panel">
  <h2>What the user said</h2>
  <blockquote>${t.description}</blockquote>
  <h2>Case note for the assignee</h2>
  <p class="muted" style="font-size:13px;margin:0 0 4px">Written by the model, third person, never shown to the user (D214).</p>
  <blockquote>${t.summary}</blockquote>
  <h2>Already checked</h2>
  <blockquote>${t.whatWasChecked ?? "-"}</blockquote>
  <h2>Internal resolution note</h2>
  <p class="muted" style="font-size:13px;margin:0 0 4px">Written by whoever moved the ticket, for the desk's own record (D239). Internal: the requester never sees it, and this build has no requester-facing note.</p>
  <blockquote>${t.internalResolutionNote ?? html`<span class="muted">none yet</span>`}</blockquote>
</div>

<div class="panel">
  <h2>State</h2>
  ${stateBlock(ctx, t, next)}
</div>

${timelinePanel(ctx, t, entries)}
</div>
<div>
  <div class="panel">
    <h2>Routing</h2>
    <dl class="kv">
      <dt>Category</dt><dd>${category(t.category)}</dd>
      <dt>Suggested owner</dt><dd>${t.suggestedOwner ? owner(t.suggestedOwner) : html`<span class="muted">none — the model would not guess, and that is allowed</span>`}</dd>
      <dt>Machine</dt><dd class="mono">${t.machineName ?? "-"}</dd>
      <dt>Session</dt><dd class="muted">${t.sessionId ?? "none — the endpoint creates no sessions yet (D75)"}</dd>
    </dl>
  </div>
  <div class="panel">
    <h2>Reporter</h2>
    <dl class="kv">
      <dt>Name</dt><dd>${t.reporter ?? "-"}</dd>
      <dt>Location</dt><dd>${t.location ?? "-"}</dd>
      <dt>Contact</dt><dd>${t.contactId ?? "-"}</dd>
      <dt>OS user</dt><dd class="mono">${t.osUsername ?? "-"}</dd>
      <dt>Identity</dt><dd><strong>${t.profileSource ?? "unknown"}</strong> — not authenticated. No device auth (D61/D132), no attested logon SID (D148).</dd>
    </dl>
  </div>
</div>

</div>
</div>

${notYet({
  heading: "Assignment, requester comments, attachments, notification",
  missing: "This ticket cannot be assigned to a person, commented on by the requester, or sent anywhere. The work notes above are internal and reach nobody outside this console.",
  why: "The store is create plus a four-state machine (B6-lite, D213) and, since 2026-09-12, an internal timeline (D275). OPEN-4's subset — assign, requester-visible comments (D69; P4, after D271), attachments, search — and D86's outbound email are not built, so a state change or a work note here tells nobody.",
  arrives: "B6 proper; requester comments with P4's delivery path",
})}`;
  await ctx.render(200, body, { title: t.reference, current: "/admin/tickets" });
}

async function statePost(ctx) {
  const ref = ctx.params.ref;
  const next = String(ctx.form.next ?? "");
  const current = await getTicket(ctx.tenant.schemaName, ref);
  if (!current) return ctx.render(404, html`<h1>No ticket ${ref}</h1>`, { title: "Not found", current: "/admin/tickets" });
  if (!(NEXT_STATES[current.state] ?? []).includes(next)) {
    await ctx.audit("ticket.state.refused", { subject: ref, detail: { from: current.state, to: next } });
    return ctx.render(400, html`<h1>Not a move this console offers</h1><p class="lede">${ref} is <strong>${current.state}</strong>; it can go to ${(NEXT_STATES[current.state] ?? []).join(", ") || "nowhere"}. The CLI (<span class="mono">npm.cmd run tickets -- state</span>) allows any state, for corrections.</p><p><a href="/admin/tickets/${ref}">Back to ${ref}</a></p>`, { title: "Refused", current: "/admin/tickets" });
  }
  // The note travels as-is; setTicketState() trims, caps at 4000 and keeps the previous note when
  // this one is blank. The audit records THAT a note was written, never what it said (D156's audit
  // is about who touched which record; the note is the record).
  const note = typeof ctx.form.note === "string" ? ctx.form.note : null;
  const moved = await setTicketState(ctx.tenant.schemaName, ref, next, { note, author: consoleAuthor(ctx) });
  if (!moved) return ctx.render(404, html`<h1>No ticket ${ref}</h1>`, { title: "Not found", current: "/admin/tickets" });
  await ctx.audit("ticket.state", { subject: ref, detail: { from: moved.from, to: moved.to, noted: moved.noted } });
  ctx.log(`[admin] ${ctx.user.email} moved ${ref} ${moved.from} -> ${moved.to}${moved.noted ? " with an internal note" : ""}`);
  ctx.redirect(`/admin/tickets/${encodeURIComponent(ref)}?changed=1${moved.noted ? "&noted=1" : ""}`);
}

/**
 * The work-note composer's POST (D275). Internal, always: `addEntry()` decides the visibility from
 * the kind and takes none from here. The audit row carries the entry's id and never its text —
 * D156's audit is about who touched which record; the note IS the record.
 */
async function worknotePost(ctx) {
  const ref = ctx.params.ref;
  const body = typeof ctx.form.body === "string" ? ctx.form.body.trim() : "";
  if (!body) {
    return ctx.render(400, html`<h1>A work note needs words</h1><p class="lede">Nothing was added to ${ref}.</p><p><a href="/admin/tickets/${ref}">Back to ${ref}</a></p>`, { title: "Nothing to add", current: "/admin/tickets" });
  }
  const added = await addEntry(ctx.tenant.schemaName, ref, { kind: "work_note", body, author: consoleAuthor(ctx) });
  if (!added) return ctx.render(404, html`<h1>No ticket ${ref}</h1>`, { title: "Not found", current: "/admin/tickets" });
  await ctx.audit("ticket.worknote", { subject: ref, detail: { entry: added.id } });
  ctx.log(`[admin] ${ctx.user.email} added a work note to ${ref}`);
  ctx.redirect(`/admin/tickets/${encodeURIComponent(ref)}?worknote=1`);
}

const REF = "(?<ref>MD-\\d{1,12})";
export const ticketRoutes = [
  route("GET", /^\/admin\/tickets\/?$/, "tickets.read", listPage),
  route("GET", new RegExp(`^/admin/tickets/${REF}$`), "tickets.read", detailPage),
  route("POST", new RegExp(`^/admin/tickets/${REF}/state$`), "tickets.write", statePost),
  route("POST", new RegExp(`^/admin/tickets/${REF}/worknote$`), "tickets.write", worknotePost),
];
