// @ts-check
/**
 * Metrics: what can be counted honestly today, and a plain statement of what cannot.
 *
 * REAL: questions asked / answered / declined from the retrieval log, all-time and last seven
 * days, and per platform; tickets per category from the tenant (D186: per category, never only in
 * aggregate).
 *
 * NOT REAL, AND SAID SO: deflection (D89). It is resolved / (resolved + escalated + unresolved)
 * over SESSIONS, and there are no sessions: the endpoint does not create them and D90's
 * end-of-session confirmation — the only source of `resolved` — is not built. The page shows the
 * session count from the tenant's table (it is zero) WITH the reason, because a zero that
 * explains itself is a fact and one that does not is a broken dashboard.
 */
import { html, notYet, stat } from "../html.js";
import { questionCounts } from "../queries.js";
import { route } from "../route.js";
import { withTenant } from "../../db/tenant.js";
import { countTicketsByCategory } from "../../tickets/query.js";

async function tenantFigures(schema) {
  return withTenant(schema, async (c) => {
    const { rows: [s] } = await c.query(
      `SELECT count(*)::int AS sessions,
              count(*) FILTER (WHERE outcome = 'resolved')::int AS resolved,
              count(*) FILTER (WHERE outcome = 'escalated')::int AS escalated,
              count(*) FILTER (WHERE outcome = 'unresolved')::int AS unresolved,
              count(*) FILTER (WHERE outcome = 'suppressed')::int AS suppressed
         FROM sessions`,
    );
    return { sessions: s };
  });
}

async function metricsPage(ctx) {
  const [q, t, byCategory] = await Promise.all([questionCounts(), tenantFigures(ctx.tenant.schemaName), countTicketsByCategory(ctx.tenant.schemaName)]);
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

${notYet({
  heading: "Deflection",
  missing: `Deflection cannot be computed. The sessions table for ${ctx.tenant.displayName} holds ${t.sessions.sessions} row${t.sessions.sessions === 1 ? "" : "s"}.`,
  why: "Deflection (D89) is confirmed-resolved sessions over all sessions, and only an explicit \"yes, that fixed it\" counts. Two things are missing: the endpoint creates no session rows (D75 — tickets carry session_id NULL for the same reason), and D90's end-of-session confirmation turn, the ONLY source of a resolved outcome, is not built (D188 says this is load-bearing and must not be cut as polish). Until both exist every session would be 'unresolved' by default and the number would be zero for a reason unrelated to the product.",
  arrives: "session creation on the endpoint and the D90 confirmation turn; then this page computes per category (D186) and every figure drills to its sessions (D89)",
})}`;
  await ctx.render(200, body, { title: "Metrics" });
}

export const metricsRoutes = [
  route("GET", /^\/admin\/metrics\/?$/, "metrics.read", metricsPage),
];
