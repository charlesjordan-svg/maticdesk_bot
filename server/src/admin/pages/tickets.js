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
 *
 * P2, SINCE 2026-09-12 — RESOLUTION MEANS SOMETHING (D278–D280, tenant/007). `resolved` is reached
 * only through the RESOLVE form, which requires a resolution code and requester-visible notes and is
 * refused with a sentence without both; the generic state form no longer offers `resolved` at all.
 * `closed` is TERMINAL here (D279) — nothing is offered from it; the CLI is the correction tool —
 * and is offered only from `resolved`, so every ticket this console closes carries a code. And the
 * TRANSITION GUARD IS IN THE UPDATE (D280): both forms carry the state the operator SAW as a hidden
 * `from`, `statePost()`/`resolvePost()` read nothing before writing, and a stale form gets a 409
 * naming where the ticket is now. The NEXT_STATES consult here is a suggestion about which buttons
 * to draw; the database is the arbiter.
 *
 * TWO NOTES ON ONE PAGE, AND THEY MUST NOT MERGE. The INTERNAL resolution note (D239/D269) is the
 * desk's account, optional, never shown. The RESOLUTION NOTES (D278) are written FOR the requester,
 * required to resolve, PUBLIC — and reach nobody in this build, which every label beside them says.
 */
import { html, notYet, empty, when, ago, csrfField, limit } from "../html.js";
import { route } from "../route.js";
import {
  countTicketsByState, getTicket, listTickets, setTicketState, resolveTicket, NEXT_STATES, TICKET_STATES,
  RESOLUTION_CODES, RESOLUTION_CODE_WORDS, addEntry, listEntries, oldestUnansweredRequesterComment,
} from "../../tickets/query.js";

const NOBODY_EMAILED = "Nobody has been emailed about any of these. This build has no outbound email (D86), so this list is the queue: if you do not look here, nobody knows.";

const pill = (state) => html`<span class="pill ${state}">${state}</span>`;

/** `closed_by` values as words — a closed enum reaching a screen as itself is D244's defect. */
const CLOSED_BY_WORDS = { console_user: "a console user", system: "the CLI, with no person attached", requester: "the requester", auto: "the auto-close job" };

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

/** The internal note field, shared by the state form and the Resolve form — one field, one wording. */
function internalNoteField(idSuffix) {
  return html`<label for="note${idSuffix}">Internal resolution note (optional)</label>
    <textarea id="note${idSuffix}" name="note" rows="3" maxlength="4000" placeholder="What actually fixed it, in your own words — for the desk." style="max-width:100%"></textarea>
    <p class="muted" style="font-size:13px;margin:4px 0 0">Internal: kept on the ticket for the desk, shown on this page and by the CLI. The requester never sees it. Leaving it blank keeps whatever was written before.</p>`;
}

/**
 * The state form: the moves NEXT_STATES offers OTHER THAN `resolved` (that is the Resolve form's,
 * below), an optional internal note, one button. It carries the state the operator is looking at as
 * a hidden `from` — the guard in the UPDATE compares against it (D280).
 *
 * `closed` is terminal here (D279): no form, a sentence saying so and naming the CLI as the
 * correction tool. From `open` the only move is to resolve, so this form says that and defers.
 */
function stateBlock(ctx, t, next) {
  if (!ctx.permissions.has("tickets.write")) return html`<p class="muted">Your roles (${ctx.roles.join(", ")}) can read tickets but not change them.</p>`;
  if (t.state === "closed") return html`<p class="muted"><strong>Closed is terminal in this console (D279).</strong> Nothing moves a closed ticket from here; a recurrence is a new ticket. The CLI (<span class="mono">npm.cmd run tickets -- state ${t.reference} open</span>) can still reopen it, as the correction tool.</p>`;
  const moves = next.filter((s) => s !== "resolved");
  if (!moves.length) return html`<p class="muted">From <strong>${t.state}</strong> the one move this console offers is to resolve it — the form below. Closing comes after resolving, so every closed ticket carries a resolution code (D279).</p>`;
  return html`<form method="post" action="/admin/tickets/${t.reference}/state">
    ${csrfField(ctx.csrf)}
    <input type="hidden" name="from" value="${t.state}">
    <label for="next">Move ${t.reference} from <strong>${t.state}</strong> to</label>
    <select id="next" name="next">${moves.map((s) => html`<option value="${s}">${s}</option>`)}</select>
    ${internalNoteField("")}
    <div class="row">
      <button class="primary" type="submit">Change state</button>
      <span class="muted" style="font-size:13px">Recorded in the audit log with who did it, and whether a note was written — never the note itself. If someone else moves the ticket first, this is refused, not applied over theirs.</span>
    </div>
  </form>`;
}

/**
 * The Resolve form (D278): a code, notes the requester will read, an optional internal note. Drawn
 * only when NEXT_STATES offers `resolved` from the current state. Refused server-side without both
 * required fields — the `required` attributes are a convenience, not the rule.
 *
 * THE NOTES REACH NOBODY IN THIS BUILD, and the form says so where the operator types them. They
 * are still written FOR the requester, because the day P4 delivers them the notes already written
 * must be readable by the person they are about. Nothing here implies delivery (D253's lesson: a
 * surface may not describe an egress outcome it has not been told).
 */
function resolveBlock(ctx, t, next) {
  if (!ctx.permissions.has("tickets.write") || !next.includes("resolved")) return "";
  return html`<div class="panel">
  <h2>Resolve</h2>
  <form method="post" action="/admin/tickets/${t.reference}/resolve">
    ${csrfField(ctx.csrf)}
    <input type="hidden" name="from" value="${t.state}">
    <label for="resolutionCode">Resolution code (required)</label>
    <select id="resolutionCode" name="resolutionCode" required>
      <option value="">— choose one —</option>
      ${RESOLUTION_CODES.map((c) => html`<option value="${c}">${RESOLUTION_CODE_WORDS[c]} (${c})</option>`)}
    </select>
    <label for="resolutionNotes">Resolution notes — for the requester (required)</label>
    <textarea id="resolutionNotes" name="resolutionNotes" rows="4" maxlength="4000" required placeholder="What was wrong and what was done, in words the person who reported it can read." style="max-width:100%"></textarea>
    <p class="muted" style="font-size:13px;margin:4px 0 0"><strong>Requester-visible — and delivered to nobody in this build.</strong> Nothing carries these notes to the requester until P4 (after D271); they sit on the ticket and on its timeline as a public entry. Write them for the requester anyway.</p>
    ${internalNoteField("-resolve")}
    <div class="row">
      <button class="primary" type="submit">Resolve ${t.reference}</button>
      <span class="muted" style="font-size:13px">Refused without both a code and notes. Audited as who resolved it and which code — never the notes.</span>
    </div>
  </form>
</div>`;
}

/** The current resolution, glossed (D244): the words first, the stored value subordinate. */
function resolutionBlock(t) {
  if (!t.resolutionCode) {
    return html`<p class="muted">Not resolved.${t.state === "closed" ? " Closed without a resolution — by the CLI, or before resolution codes existed (tenant/007)." : ""}</p>`;
  }
  return html`<dl class="kv">
    <dt>Code</dt><dd>${RESOLUTION_CODE_WORDS[t.resolutionCode] ?? t.resolutionCode} <span class="muted mono">${t.resolutionCode}</span></dd>
    <dt>Resolved</dt><dd>${when(t.resolvedAt)}${t.resolvedAt ? html` <span class="muted">(${ago(t.resolvedAt)})</span>` : ""}</dd>
  </dl>
  <p class="muted" style="font-size:13px;margin:8px 0 4px">Resolution notes — <strong>requester-visible, delivered to nobody yet</strong> (P4).</p>
  <blockquote>${t.resolutionNotes}</blockquote>`;
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
  const resolvedNow = ctx.url.searchParams.get("resolved");
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
${flash ? html`<div class="flash">${resolvedNow ? "Resolved. The requester has NOT been told — nothing delivers resolution notes in this build." : `State changed to ${t.state}.`}${noted ? " Internal note recorded." : ""}</div>` : ""}
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
  <p class="muted" style="font-size:13px;margin:0 0 4px">Written by whoever moved the ticket, for the desk's own record (D239). Internal: the requester never sees it. The requester-facing account is the resolution notes below, a different field (D278).</p>
  <blockquote>${t.internalResolutionNote ?? html`<span class="muted">none yet</span>`}</blockquote>
  <h2>Resolution</h2>
  <p class="muted" style="font-size:13px;margin:0 0 4px">A code you can count and notes written for the requester (D278). Both are PUBLIC — requester-visible once P4 can deliver them; nobody sees them in this build.</p>
  ${resolutionBlock(t)}
  ${t.closedAt ? html`<p class="muted" style="font-size:13px">Closed ${when(t.closedAt)} by ${CLOSED_BY_WORDS[t.closedBy] ?? t.closedBy}.</p>` : ""}
</div>

<div class="panel">
  <h2>State</h2>
  ${stateBlock(ctx, t, next)}
</div>

${resolveBlock(ctx, t, next)}

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

/** The 400 both POSTs render when the form asks for a move this console does not offer. */
function notOffered(ctx, ref, from, next) {
  return ctx.render(400, html`<h1>Not a move this console offers</h1><p class="lede">From <strong>${from}</strong> this console offers ${(NEXT_STATES[from] ?? []).join(", ") || "nothing — closed is terminal here (D279)"}, not ${next}. The CLI (<span class="mono">npm.cmd run tickets -- state</span>) allows any state, for corrections.</p><p><a href="/admin/tickets/${ref}">Back to ${ref}</a></p>`, { title: "Refused", current: "/admin/tickets" });
}

/** The 409 both POSTs render when the guard in the UPDATE matched nothing (D280): the page was stale. */
function stale(ctx, ref, refusal) {
  return ctx.render(409, html`<h1>${ref} moved while you were looking at it</h1><p class="lede">${refusal.refused}</p><p><a href="/admin/tickets/${ref}">Look at ${ref} again</a></p>`, { title: "Not applied", current: "/admin/tickets" });
}

/**
 * NO READ BEFORE THE WRITE (D280). The form carries the state the operator saw as `from`; the
 * NEXT_STATES consult is on that, and the guard in the UPDATE decides whether the ticket is still
 * there. Until P2 this read the ticket, checked, then wrote in a separate transaction — the
 * check-then-act that lets two operators' moves land on top of each other.
 */
async function statePost(ctx) {
  const ref = ctx.params.ref;
  const next = String(ctx.form.next ?? "");
  const from = String(ctx.form.from ?? "");
  if (!TICKET_STATES.includes(from) || !TICKET_STATES.includes(next)) {
    return ctx.render(400, html`<h1>Not a state</h1><p class="lede">The form did not name a state this store has.</p><p><a href="/admin/tickets/${ref}">Back to ${ref}</a></p>`, { title: "Refused", current: "/admin/tickets" });
  }
  if (next === "resolved") {
    // resolved has its own form; a state change cannot produce a resolution with no code (D278).
    await ctx.audit("ticket.state.refused", { subject: ref, detail: { from, to: next, why: "resolved needs the Resolve form" } });
    return ctx.render(400, html`<h1>Resolving takes more than a state</h1><p class="lede">${ref} is resolved through the Resolve form — a resolution code and notes the requester will read (D278) — not by changing its state.</p><p><a href="/admin/tickets/${ref}">Back to ${ref}</a></p>`, { title: "Refused", current: "/admin/tickets" });
  }
  if (!(NEXT_STATES[from] ?? []).includes(next)) {
    await ctx.audit("ticket.state.refused", { subject: ref, detail: { from, to: next } });
    return notOffered(ctx, ref, from, next);
  }
  // The note travels as-is; setTicketState() trims, caps at 4000 and keeps the previous note when
  // this one is blank. The audit records THAT a note was written, never what it said (D156's audit
  // is about who touched which record; the note is the record).
  const note = typeof ctx.form.note === "string" ? ctx.form.note : null;
  const moved = await setTicketState(ctx.tenant.schemaName, ref, next, { note, author: consoleAuthor(ctx), from });
  if (!moved) return ctx.render(404, html`<h1>No ticket ${ref}</h1>`, { title: "Not found", current: "/admin/tickets" });
  if ("refused" in moved) {
    await ctx.audit("ticket.state.refused", { subject: ref, detail: { from, to: next, why: "stale", now: moved.state } });
    return stale(ctx, ref, moved);
  }
  await ctx.audit("ticket.state", { subject: ref, detail: { from: moved.from, to: moved.to, noted: moved.noted } });
  ctx.log(`[admin] ${ctx.user.email} moved ${ref} ${moved.from} -> ${moved.to}${moved.noted ? " with an internal note" : ""}`);
  ctx.redirect(`/admin/tickets/${encodeURIComponent(ref)}?changed=1${moved.noted ? "&noted=1" : ""}`);
}

/**
 * The Resolve form's POST (D278). Same shape as statePost: no read first, `from` from the form, the
 * guard in the UPDATE. `resolveTicket()` refuses without both required fields and its sentence is
 * rendered as the 400. The audit carries the CODE (an enum, countable) and whether an internal note
 * was written — never the notes' text, which is the record.
 */
async function resolvePost(ctx) {
  const ref = ctx.params.ref;
  const from = String(ctx.form.from ?? "");
  if (!TICKET_STATES.includes(from)) {
    return ctx.render(400, html`<h1>Not a state</h1><p class="lede">The form did not name a state this store has.</p><p><a href="/admin/tickets/${ref}">Back to ${ref}</a></p>`, { title: "Refused", current: "/admin/tickets" });
  }
  if (!(NEXT_STATES[from] ?? []).includes("resolved")) {
    await ctx.audit("ticket.state.refused", { subject: ref, detail: { from, to: "resolved" } });
    return notOffered(ctx, ref, from, "resolved");
  }
  const code = String(ctx.form.resolutionCode ?? "");
  const notes = typeof ctx.form.resolutionNotes === "string" ? ctx.form.resolutionNotes : "";
  const note = typeof ctx.form.note === "string" ? ctx.form.note : null;
  const r = await resolveTicket(ctx.tenant.schemaName, ref, { code, notes, note, author: consoleAuthor(ctx), from });
  if (!r) return ctx.render(404, html`<h1>No ticket ${ref}</h1>`, { title: "Not found", current: "/admin/tickets" });
  if ("refused" in r) {
    if (r.state !== null) {
      await ctx.audit("ticket.state.refused", { subject: ref, detail: { from, to: "resolved", why: "stale", now: r.state } });
      return stale(ctx, ref, r);
    }
    await ctx.audit("ticket.resolve.refused", { subject: ref, detail: { from, code: RESOLUTION_CODES.includes(code) ? code : null, notesGiven: notes.trim().length > 0 } });
    return ctx.render(400, html`<h1>Not resolved</h1><p class="lede">${r.refused}</p><p><a href="/admin/tickets/${ref}">Back to ${ref}</a></p>`, { title: "Refused", current: "/admin/tickets" });
  }
  await ctx.audit("ticket.resolve", { subject: ref, detail: { from: r.from, code: r.code, noted: r.noted } });
  ctx.log(`[admin] ${ctx.user.email} resolved ${ref} (${r.code})${r.noted ? " with an internal note" : ""} — the requester has not been told (nothing delivers)`);
  ctx.redirect(`/admin/tickets/${encodeURIComponent(ref)}?changed=1&resolved=1${r.noted ? "&noted=1" : ""}`);
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
  route("POST", new RegExp(`^/admin/tickets/${REF}/resolve$`), "tickets.write", resolvePost),
  route("POST", new RegExp(`^/admin/tickets/${REF}/worknote$`), "tickets.write", worknotePost),
];
