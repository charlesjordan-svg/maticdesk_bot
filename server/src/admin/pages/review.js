// @ts-check
/**
 * Home: the review queue (D177). Four feeds in value order; ONE of them has data in this build.
 *
 *   1. Drafts from resolved sessions   NOT YET — nothing writes session outcomes (the endpoint
 *                                      creates no sessions; D90's confirmation turn is unbuilt),
 *                                      and there is no drafting.
 *   2. KB gaps                         REAL — every D205 decline in control.kb_retrieval_log.
 *   3. Staleness                       NOT YET — needs outcomes to correlate with.
 *   4. Duplicates                      NOT YET — needs an article-to-article comparison nobody
 *                                      has written.
 *
 * "Approve" (D177: each item opens pre-filled with a one-click approve) is NOT built: answering a
 * gap is article authoring, which is the next pass (KB ingestion, then the editor). The card says
 * so where the button would be. The page does not pretend the button exists and does not hide the
 * gap because it cannot yet be acted on — a gap the admin can SEE is already D160a's "we can tell
 * the customer exactly what is missing".
 */
import { html, notYet, empty, when, ago } from "../html.js";
import { gapFeed } from "../queries.js";
import { route } from "../route.js";

async function reviewPage(ctx) {
  const gaps = await gapFeed({ limit: 50 });
  const withText = gaps.filter((g) => g.queryText).length;

  const cards = gaps.map((g) => html`
    <article class="card">
      <div class="meta">${when(g.at)} <span class="muted">(${ago(g.at)})</span> · platform ${g.platform ?? "unknown"} · declined by ${g.model ?? "unknown model"}${
        g.tenantLabel ? html` · label <span class="mono">${g.tenantLabel}</span>` : ""}</div>
      <div class="q">${g.queryText
        ? html`“${g.queryText}”`
        : html`<span class="muted">The question text was not logged. <span class="mono">MATIC_KB_LOG_QUERIES</span> was off when this was asked (the hub default), so only the fact of the decline and what was retrieved are here.</span>`}</div>
      <div class="retrieved">${g.retrieved.length
        ? html`Retrieved and not enough: ${g.retrieved.map((r, i) => html`${i ? ", " : ""}<a href="/admin/knowledge#${r.articleId}">${r.title ?? r.articleId}</a>`)}`
        : "Nothing was retrieved."}</div>
      <div class="retrieved muted">Answer this gap: not yet — article authoring arrives with the knowledge editor.</div>
    </article>`);

  const body = html`
<h1>Review queue</h1>
<p class="lede">Where a few minutes make the product better. Four feeds (D177); one has data in this build.</p>

<div class="grid">
  <div class="stat"><div class="n">${gaps.length}</div><div class="l">KB gaps — questions the assistant declined</div><div class="why">${withText} with the question text logged</div></div>
  <div class="stat"><div class="n muted">—</div><div class="l">Drafts from resolved sessions</div><div class="why">No session outcomes are recorded yet (below)</div></div>
  <div class="stat"><div class="n muted">—</div><div class="l">Stale articles</div><div class="why">Needs outcomes to correlate against</div></div>
  <div class="stat"><div class="n muted">—</div><div class="l">Duplicates</div><div class="why">No comparison is built</div></div>
</div>

<h2>KB gaps</h2>
<p class="muted">Every question the assistant could not attribute to an article and therefore declined (D205). A gap record is a single question, not a transcript, and is readable by any role with the review permission (D223, founder 2026-09-09). <strong>Hub-wide, not tenant-scoped:</strong> the retrieval log's tenant label is a development label, not an identity, until device authentication exists (D61/D132).</p>
${gaps.length ? cards : empty("No declined questions in the retrieval log. Either nobody has asked the assistant anything yet, or everything asked was covered.")}

${notYet({
  heading: "Drafts, staleness and duplicates",
  missing: "These three feeds have no data source in this build.",
  why: "All three need session outcomes (resolved / escalated / unresolved, D89). The endpoint creates no sessions and D90's end-of-session confirmation turn is not built, so the sessions table has no rows and nothing writes an outcome. Drafting from a resolved session (D168) additionally needs a drafting step that does not exist.",
  arrives: "the session-outcome work (D89/D90/D188) and then the KB editor",
})}`;
  await ctx.render(200, body, { title: "Review queue" });
}

export const reviewRoutes = [
  route("GET", /^\/admin\/?$/, "review.read", reviewPage),
];
