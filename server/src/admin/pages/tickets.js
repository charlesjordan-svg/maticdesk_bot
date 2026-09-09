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
 */
import { html, notYet, empty, when, ago, csrfField } from "../html.js";
import { route } from "../route.js";
import { countTicketsByState, getTicket, listTickets, setTicketState, NEXT_STATES, TICKET_STATES } from "../../tickets/query.js";

const NOBODY_EMAILED = "Nobody has been emailed about any of these. This build has no outbound email (D86), so this list is the queue: if you do not look here, nobody knows.";

const pill = (state) => html`<span class="pill ${state}">${state}</span>`;
const owner = (o) => o ? o.replace(/_/g, " ") : html`<span class="muted">unrouted</span>`;
const category = (c) => c.replace(/_/g, " ");

async function listPage(ctx) {
  const state = ctx.url.searchParams.get("state");
  const filter = state && TICKET_STATES.includes(state) ? state : null;
  const schema = ctx.tenant.schemaName;
  const [rows, counts] = await Promise.all([listTickets(schema, { state: filter, limit: 200 }), countTicketsByState(schema)]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const body = html`
<h1>Tickets</h1>
<p class="lede">${total} in ${ctx.tenant.displayName}. ${NOBODY_EMAILED}</p>
<div class="grid">
  ${TICKET_STATES.map((s) => html`<a class="stat" href="/admin/tickets?state=${s}" style="text-decoration:none;color:inherit"><div class="n">${counts[s]}</div><div class="l">${s}</div></a>`)}
</div>
<div class="panel">
  <p class="filters"><strong>Show:</strong> <a href="/admin/tickets" class="${filter ? "" : "current"}">all</a>${TICKET_STATES.map((s) => html`<a href="/admin/tickets?state=${s}">${s}</a>`)}</p>
  ${rows.length ? html`
  <table>
    <thead><tr><th>Ref</th><th>State</th><th>Category</th><th>Suggested owner</th><th>Reporter</th><th>Machine</th><th>Filed</th></tr></thead>
    <tbody>${rows.map((t) => html`<tr>
      <td class="mono"><a href="/admin/tickets/${t.reference}">${t.reference}</a></td>
      <td>${pill(t.state)}</td>
      <td>${category(t.category)}</td>
      <td>${owner(t.suggestedOwner)}</td>
      <td>${t.reporter ?? html`<span class="muted">unknown</span>`}<div class="muted" style="font-size:12px">${t.location ?? "no location"}</div></td>
      <td class="mono">${t.machineName ?? "-"}</td>
      <td title="${t.createdAt.toISOString()}">${when(t.createdAt)}<div class="muted" style="font-size:12px">${ago(t.createdAt)}</div></td>
    </tr>`)}</tbody>
  </table>` : empty(filter ? `No tickets in state "${filter}".` : "No tickets have been filed in this tenant. The endpoint files one when a user accepts an escalation (POST /v1/ticket).")}
</div>
<p class="muted">The same rows, from a terminal: <span class="mono">npm.cmd run tickets -- list${filter ? ` --state ${filter}` : ""}</span> (server/).</p>`;
  await ctx.render(200, body, { title: "Tickets", current: "/admin/tickets" });
}

async function detailPage(ctx) {
  const ref = ctx.params.ref;
  const t = await getTicket(ctx.tenant.schemaName, ref);
  if (!t) {
    return ctx.render(404, html`<h1>No ticket ${ref}</h1><p class="lede">Not in ${ctx.tenant.displayName}.</p><p><a href="/admin/tickets">Back to tickets</a></p>`, { title: "Not found", current: "/admin/tickets" });
  }
  await ctx.audit("ticket.view", { subject: t.reference });
  const canWrite = ctx.permissions.has("tickets.write");
  const next = NEXT_STATES[t.state] ?? [];
  const flash = ctx.url.searchParams.get("changed");

  const body = html`
<p><a href="/admin/tickets">← Tickets</a></p>
<h1><span class="mono">${t.reference}</span> ${pill(t.state)}</h1>
<p class="lede">Filed ${when(t.createdAt)} (${ago(t.createdAt)}) · updated ${when(t.updatedAt)}. Nobody has been emailed (D86).</p>
${flash ? html`<div class="flash">State changed to ${t.state}.</div>` : ""}

<div class="panel">
  <h2>What the user said</h2>
  <blockquote>${t.description}</blockquote>
  <h2>Case note for the assignee</h2>
  <p class="muted" style="font-size:13px;margin:0 0 4px">Written by the model, third person, never shown to the user (D214).</p>
  <blockquote>${t.summary}</blockquote>
  <h2>Already checked</h2>
  <blockquote>${t.whatWasChecked ?? "-"}</blockquote>
</div>

<div class="grid">
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

<div class="panel">
  <h2>State</h2>
  ${canWrite
    ? (next.length
      ? html`<form method="post" action="/admin/tickets/${t.reference}/state">
          ${csrfField(ctx.csrf)}
          <label for="next">Move ${t.reference} from <strong>${t.state}</strong> to</label>
          <select id="next" name="next">${next.map((s) => html`<option value="${s}">${s}</option>`)}</select>
          <p><button class="primary" type="submit">Change state</button> <span class="muted">Recorded in the audit log with who did it.</span></p>
        </form>`
      : html`<p class="muted">No further transitions from ${t.state}.</p>`)
    : html`<p class="muted">Your roles (${ctx.roles.join(", ")}) can read tickets but not change them.</p>`}
</div>

${notYet({
  heading: "Assignment, comments, attachments, notification",
  missing: "This ticket cannot be assigned to a person, commented on, or sent anywhere.",
  why: "The store is create plus a four-state machine (B6-lite, D213). OPEN-4's subset — assign, visibility-split comments (D69), attachments, search — and D86's outbound email are not built, so a state change here tells nobody.",
  arrives: "B6 proper",
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
  const moved = await setTicketState(ctx.tenant.schemaName, ref, next);
  if (!moved) return ctx.render(404, html`<h1>No ticket ${ref}</h1>`, { title: "Not found", current: "/admin/tickets" });
  await ctx.audit("ticket.state", { subject: ref, detail: { from: moved.from, to: moved.to } });
  ctx.log(`[admin] ${ctx.user.email} moved ${ref} ${moved.from} -> ${moved.to}`);
  ctx.redirect(`/admin/tickets/${encodeURIComponent(ref)}?changed=1`);
}

const REF = "(?<ref>MD-\\d{1,12})";
export const ticketRoutes = [
  route("GET", /^\/admin\/tickets\/?$/, "tickets.read", listPage),
  route("GET", new RegExp(`^/admin/tickets/${REF}$`), "tickets.read", detailPage),
  route("POST", new RegExp(`^/admin/tickets/${REF}/state$`), "tickets.write", statePost),
];
