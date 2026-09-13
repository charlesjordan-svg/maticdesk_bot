// @ts-check
/**
 * Metrics: what can be counted honestly today, and a plain statement of what cannot.
 *
 * REAL: questions asked / answered / declined from the retrieval log, all-time and last seven
 * days, and per platform; tickets per category from the tenant (D186: per category, never only in
 * aggregate).
 *
 * DEFLECTION (D89) IS REAL WHEN THERE ARE SESSIONS, AND SAYS SO WHEN THERE ARE NOT. It is
 * resolved / (resolved + escalated + unresolved) over SESSIONS — never over tickets — and it is
 * computed by `deflectionOf()` in src/sessions/store.js, the same function `bin/sessions.mjs
 * deflection` prints, so the page and the CLI cannot disagree about the number (D224's pattern).
 *
 * WHAT CHANGED, 2026-09-13. This page used to state flatly that deflection "cannot be computed",
 * on two grounds: that the endpoint creates no session rows, and that D90's confirmation turn is
 * not built. The first stopped being true when `POST /v1/session` and the outcome store landed
 * (D236–D239) — the hub has been able to count this for a while and the page went on saying it
 * could not. The second is still true of the SHIPPED CLIENT and is now said where it belongs:
 * beside the number, as the reason the denominator is what it is, rather than as a refusal to
 * show one. A screen that refuses to show a number it has is the same defect as one that shows a
 * number it does not have.
 *
 * AND IT IS PER CATEGORY (D186): never only in aggregate.
 */
import { html, notYet, stat } from "../html.js";
import { questionCounts } from "../queries.js";
import { route } from "../route.js";
import { countTicketsByCategory } from "../../tickets/query.js";
import { outcomeCounts, deflectionOf } from "../../sessions/store.js";

async function metricsPage(ctx) {
  // THE SESSIONS STORE'S OWN READER, not a query written here. This page had its own SELECT over
  // the sessions table while outcomeCounts() sat three files away — which is how two surfaces come
  // to describe one number differently (D224's argument, applied to sessions).
  const [q, outcomes, byCategory] = await Promise.all([questionCounts(), outcomeCounts(ctx.tenant.schemaName), countTicketsByCategory(ctx.tenant.schemaName)]);
  const t = { sessions: outcomes.total };
  const deflection = deflectionOf(outcomes.total);
  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : "-");

  const body = html`
<h1>Metrics</h1>
<p class="lede">What this build can count. Every figure names its source; the one that matters most cannot be computed yet, and the page says why rather than showing a zero.</p>

<h2>Questions to the assistant <span class="muted" style="font-weight:400;font-size:13px">— control.kb_retrieval_log, hub-wide (not tenant-scoped until device auth exists)</span></h2>
<div class="grid">
  ${stat(q.all.asked, "asked, all time", q.all.first_at ? `since ${new Date(q.all.first_at).toISOString().slice(0, 10)}` : "no questions logged yet")}
  ${stat(q.all.answered, "answered from an article", pct(q.all.answered, q.all.asked) + " of asked")}
  ${stat(q.all.declined, "declined (not covered)", pct(q.all.declined, q.all.asked) + " of asked — each is a gap in the review queue")}
  ${stat(q.week.asked, "asked, last 7 days", `${q.week.answered} answered, ${q.week.declined} declined`)}
</div>
<div class="panel">
  <h2>By platform</h2>
  ${q.byPlatform.length ? html`<table><thead><tr><th>Platform</th><th>Asked</th><th>Answered</th><th>Declined</th><th>Declined %</th></tr></thead>
  <tbody>${q.byPlatform.map((p) => html`<tr><td>${p.platform}</td><td>${p.asked}</td><td>${p.answered}</td><td>${p.declined}</td><td>${pct(p.declined, p.asked)}</td></tr>`)}</tbody></table>`
    : html`<p class="muted">Nothing logged yet.</p>`}
  <p class="muted" style="font-size:13px">"Answered" is the model's own claim that an article covered it (D205's <span class="mono">answered</span>). It is not "resolved": nobody has confirmed the answer fixed anything. Retrieval quality figures from this hub are a floor, not a measurement (no reranker, D207; dev embedder, D203).</p>
</div>

<h2>Tickets by category <span class="muted" style="font-weight:400;font-size:13px">— ${ctx.tenant.displayName} (D186: per category, never only in aggregate)</span></h2>
<div class="panel">
  ${byCategory.length ? html`<table><thead><tr><th>Category</th><th>Tickets</th><th>Still new or open</th></tr></thead>
  <tbody>${byCategory.map((c) => html`<tr><td>${c.category.replace(/_/g, " ")}</td><td>${c.n}</td><td>${c.open}</td></tr>`)}</tbody></table>`
    : html`<p class="muted">No tickets filed in this tenant yet.</p>`}
</div>

${deflectionBlock(ctx, outcomes, deflection)}`;
  await ctx.render(200, body, { title: "Metrics" });
}

/**
 * D89's ratio and the four counts under it, with the caveat that applies to THIS tenant's rows
 * rather than a blanket refusal.
 *
 * The denominator is resolved + escalated + unresolved. `suppressed` is outside it and always will
 * be (D118: an alert prevented the session, so there is no session), and the panel says so where
 * the count is rather than in a footnote.
 *
 * THE CLAIM THIS PANEL MUST NOT MAKE is that an unresolved session was a failure. A session is
 * `unresolved` the moment it begins and stays there unless the user confirms a fix or a ticket is
 * filed — so abandonment, a window closed mid-sentence and a genuine dead end are one bucket, and
 * the copy says which. D238's distinction is drawn where it exists: an explicit "that did not fix
 * it" has its own timestamp and is NOT an outcome, so a non-answer is never written down as a no.
 */
function deflectionBlock(ctx, outcomes, deflection) {
  const c = outcomes.total;
  const denom = c.resolved + c.escalated + c.unresolved;
  if (!c.sessions) {
    return notYet({
      heading: "Deflection",
      missing: `No sessions yet. The sessions table for ${ctx.tenant.displayName} is empty, so there is nothing to compute a ratio over.`,
      why: "Deflection (D89) is confirmed-resolved sessions over all sessions, and only an explicit yes-that-fixed-it counts. The HUB can record all of it — POST /v1/session takes begin, resolved, not_fixed and end, and a ticket escalates its session inside the ticket's own transaction (D236-D239) — so this figure appears as soon as an endpoint reports one. What has not shipped is the CLIENT half: D90's end-of-session confirmation turn, the only source of a resolved outcome, which D188 says is load-bearing and must not be cut as polish.",
      arrives: "the endpoint reporting its sessions and asking D90's question",
    });
  }
  return html`<h2>Deflection <span class="muted" style="font-weight:400;font-size:13px">— ${ctx.tenant.displayName}'s sessions (D89: over SESSIONS, never over tickets)</span></h2>
<div class="grid">
  ${stat(deflection === null ? "-" : `${Math.round(deflection * 100)}%`, "deflection", denom ? `${c.resolved} of ${denom} sessions ended with the user confirming a fix` : "nothing in the denominator yet")}
  ${stat(c.resolved, "resolved", "the user said the fix worked — the only route to this outcome (D89)")}
  ${stat(c.escalated, "escalated", "a ticket was filed from the session; nobody is asked whether it was fixed, because opening a ticket IS the outcome")}
  ${stat(c.unresolved, "unresolved", "everything else, a window closed mid-sentence included — this is not the same as failed")}
</div>
<div class="panel">
  <h2>By category <span class="muted" style="font-weight:400;font-size:13px">— D186: per category, never only in aggregate</span></h2>
  ${outcomes.byCategory.length ? html`<table><thead><tr><th>Category</th><th>Sessions</th><th>Resolved</th><th>Escalated</th><th>Unresolved</th><th>Deflection</th></tr></thead>
  <tbody>${outcomes.byCategory.map((r) => html`<tr>
    <td>${(r.category ?? "uncategorised").replace(/_/g, " ")}</td><td>${r.sessions}</td><td>${r.resolved}</td><td>${r.escalated}</td><td>${r.unresolved}</td>
    <td>${deflectionOf(r) === null ? html`<span class="muted">-</span>` : `${Math.round(deflectionOf(r) * 100)}%`}</td>
  </tr>`)}</tbody></table>` : html`<p class="muted">No session carries a category yet.</p>`}
</div>
<p class="muted" style="font-size:13px">${c.suppressed} suppressed session${c.suppressed === 1 ? " is" : "s are"} outside the ratio and always will be: suppressed means an alert prevented the session, so there was no session to deflect (D118). ${c.notFixed} session${c.notFixed === 1 ? "" : "s"} carr${c.notFixed === 1 ? "ies" : "y"} an explicit "that did not fix it" — recorded as a timestamp, never as an outcome (D238).</p>
<p class="muted" style="font-size:13px">The same figure from a terminal: <span class="mono">node bin/sessions.mjs deflection</span> (server/) — the same <span class="mono">outcomeCounts()</span> and <span class="mono">deflectionOf()</span> this page calls, so the two cannot disagree (D224).</p>`;
}

export const metricsRoutes = [
  route("GET", /^\/admin\/metrics\/?$/, "metrics.read", metricsPage),
];
