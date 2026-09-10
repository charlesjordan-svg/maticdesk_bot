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
 * THE GAP LIST, AFTER THE DESIGN PASS (2026-09-09, handback §3). Fourteen identical cards became a
 * list of native `<details>` rows, the first one open. No script: `<details>` opens with scripting
 * off. A row carries the time, the platform, the question (or the short "not logged" form), a
 * per-row hit count WHEN IT IS REAL, and a caret. The open row wears registration marks — one of
 * the two objects in the console that do (the other is the honest stub).
 *
 * "Approve" (D177: each item opens pre-filled with a one-click approve) is NOT built: answering a
 * gap is article authoring, which is the next pass. The handback drew the form so the screen is
 * built once, and named the honest way to ship it before the route exists: every control
 * `disabled`, and the sentence saying why immediately above the buttons. That is what this does.
 * Nothing here posts to a route that does not exist; a disabled form cannot post at all.
 *
 * THE HIT COUNT IS A REAL COUNT OR NOTHING. Rows are grouped on the normalised question text in
 * queries.js; a gap whose text was not logged cannot be deduplicated and gets no count rather than
 * a "1" (handback §3: "the .hits count is a real count or nothing").
 */
import { html, notYet, empty, when, ago, csrfField } from "../html.js";
import { gapFeed } from "../queries.js";
import { route } from "../route.js";
import { questionLoggingEnabled, questionRetentionDays } from "../queries.js";

const UNLOGGED_SHORT = "Question text was not logged";
const UNLOGGED_LONG = html`The question text was not logged. <span class="mono">MATIC_KB_LOG_QUERIES</span> was off when this was asked (the hub default), so only the fact of the decline and what was retrieved are here.`;
const AUTHORING_NOT_YET = "Answering a gap writes an article, and article authoring arrives with the knowledge editor.";

/**
 * "Search for this" — the gap row's one working action (handover Task 3).
 *
 * DRAWN ONLY FOR A ROW THAT HAS THE QUESTION TEXT, because a row without it has nothing to search
 * for: `MATIC_KB_LOG_QUERIES` was off, so the record holds the fact of the decline and what was
 * retrieved, and no sentence. A link that searched for an empty string would be a control that
 * looks like the answer to "why was this declined" and is not.
 *
 * And only for a session with `knowledge.read`: an `it_agent` and an owner have it, and a role that
 * does not would get a 403 and an `access.denied` audit row for clicking a link this page drew.
 * The nav follows the same rule — a destination a role cannot open is not drawn at all.
 */
function searchLink(ctx, g) {
  if (!g.queryText || !ctx.permissions.has("knowledge.read")) return "";
  return html`<p class="retrieved"><a href="/admin/knowledge/search?q=${encodeURIComponent(g.queryText)}${g.platform ? `&platform=${encodeURIComponent(g.platform)}` : ""}">Search the corpus for this</a>
          <span class="muted">— the same retrieval that declined it, both legs shown separately, so you can see whether the article is missing or merely unfindable.</span></p>`;
}

/** One row of the gap list. `open` on the first only. */
function gapRow(ctx, g, open) {
  const logged = Boolean(g.queryText);
  return html`
    <details class="gap ${open ? "marks" : ""}" ${open ? html`open=""` : ""}>
      <summary>
        <span class="at">${when(g.lastAt)}</span>
        <span class="plat">${g.platform ?? "unknown"}</span>
        <span class="q ${logged ? "" : "unlogged"}">${logged ? g.queryText : UNLOGGED_SHORT}</span>
        <span class="hits">${logged && g.hits > 1 ? `asked ${g.hits}×` : ""}</span>
        <span class="chev">▸</span>
      </summary>
      <div class="gap-body">
        <p class="q-full ${logged ? "" : "unlogged"}">${logged ? html`“${g.queryText}”` : UNLOGGED_LONG}</p>
        <div class="facts">
          <span>${g.hits > 1 ? html`First asked ${when(g.firstAt)} · last ${when(g.lastAt)}` : html`Asked ${when(g.lastAt)} <span class="muted">(${ago(g.lastAt)})</span>`}</span>
          ${logged && g.hits > 1 ? html`<span>Asked ${g.hits} times</span>` : ""}
          <span>Declined by <span class="mono">${g.model ?? "unknown model"}</span></span>
          ${g.tenantLabel ? html`<span>Label <span class="mono">${g.tenantLabel}</span></span>` : ""}
        </div>
        <p class="retrieved">${g.retrieved.length
          ? html`Retrieved and not enough: ${g.retrieved.map((r, i) => html`${i ? ", " : ""}<a href="/admin/knowledge#${r.articleId}">${r.title ?? r.articleId}</a>`)}`
          : "Nothing was retrieved."}</p>
        ${searchLink(ctx, g)}
        ${answerForm(g)}
      </div>
    </details>`;
}

/**
 * The designed place for "answer this gap", shipped disabled (handback §3, preferred state). The
 * day the knowledge editor's route exists: remove `disabled` from the three controls and the
 * sentence above them, and give the form its action.
 */
function answerForm(g) {
  const seed = g.retrieved[0]?.title ? `${g.retrieved[0].title} — ` : "";
  return html`
        <form class="answer" method="post" action="/admin/review/gaps/${g.id}/answer">
          ${csrfField("")}
          <label for="ans-title-${g.id}">Answer this gap — new article title</label>
          <input id="ans-title-${g.id}" name="title" type="text" value="${seed}" disabled="disabled">
          <label for="ans-body-${g.id}">Answer</label>
          <textarea id="ans-body-${g.id}" name="body" disabled="disabled" placeholder="Write the answer an IT person would give. It becomes an article the assistant can cite."></textarea>
          <p class="hint">Publishing writes an article attributed to you and closes this gap. The gap stays open until it does.</p>
          <p class="hint"><strong>${AUTHORING_NOT_YET}</strong></p>
          <div class="row">
            <button class="primary" type="submit" name="action" value="publish" disabled="disabled">Publish answer</button>
            <button type="submit" name="action" value="draft" disabled="disabled">Save as draft</button>
            <button class="link" type="submit" name="action" value="dismiss" disabled="disabled">Not a gap — dismiss</button>
          </div>
        </form>`;
}

async function reviewPage(ctx) {
  const gaps = await gapFeed({ limit: 50 });
  const withText = gaps.filter((g) => g.queryText).length;
  const declines = gaps.reduce((n, g) => n + g.hits, 0);

  const body = html`
<h1>Review queue</h1>
<p class="lede">Where a few minutes make the product better. Four feeds (D177); one has data in this build.</p>

<div class="grid">
  <div class="stat"><div class="n">${gaps.length}</div><div class="l">KB gaps — questions the assistant declined</div><div class="why">${withText} with the question text logged${declines !== gaps.length ? html`; ${declines} declines in all` : ""}</div></div>
  <div class="stat"><div class="n muted">—</div><div class="l">Drafts from resolved sessions</div><div class="why">No session outcomes are recorded yet (below)</div></div>
  <div class="stat"><div class="n muted">—</div><div class="l">Stale articles</div><div class="why">Needs outcomes to correlate against</div></div>
  <div class="stat"><div class="n muted">—</div><div class="l">Duplicates</div><div class="why">No comparison is built</div></div>
</div>

<h2>KB gaps<span class="count">${gaps.length} open</span></h2>
<p class="muted">Every question the assistant could not attribute to an article and therefore declined (D205). A gap record is a single question, not a transcript, and is readable by any role with the review permission (D223, founder 2026-09-09). <strong>Hub-wide, not tenant-scoped:</strong> the retrieval log's tenant label is a development label, not an identity, until device authentication exists (D61/D132). ${questionLoggingEnabled() ? html`A logged question carries no user identity and its text is kept <strong>${questionRetentionDays()} days</strong>, then cleared; the record of the decline stays (D229).` : html`This hub is <strong>not logging question text</strong> right now; new declines will show no sentence either.`}</p>
${gaps.length
  ? html`<div class="gaps">${gaps.map((g, i) => gapRow(ctx, g, i === 0))}</div>`
  : empty("No declined questions in the retrieval log. Either nobody has asked the assistant anything yet, or everything asked was covered.")}

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
