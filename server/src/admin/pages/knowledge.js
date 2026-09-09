// @ts-check
/**
 * Knowledge: what the corpus holds. Real figures from control.kb_articles / kb_chunks, and honest
 * stubs for search, ingest and editing.
 *
 * The chunk count is on the page in large type on purpose: the demo-prep pass found that an empty
 * corpus produces a hub that declines everything and looks correct doing it (D220), and the
 * launcher checks it for that reason. An admin should not need the launcher to know.
 */
import { html, notYet, stat, empty, when } from "../html.js";
import { corpusListing } from "../queries.js";
import { route } from "../route.js";

async function knowledgePage(ctx) {
  const { status, articles } = await corpusListing();
  const unembedded = status.chunks - status.embedded;
  const modelNote = status.models.length === 0
    ? "no chunk is embedded — retrieval runs on the lexical leg only"
    : status.models.length === 1
      ? `all embedded by ${status.models[0].model}`
      : `EMBEDDED BY ${status.models.length} DIFFERENT MODELS — vectors are in different spaces and retrieval is confidently wrong for part of the corpus. Fix: node bin/kb.mjs reembed`;

  const body = html`
<h1>Knowledge</h1>
<p class="lede">The generic knowledge base the assistant answers from. Cross-tenant by decision (D45); tenant-specific articles are not yet a thing.</p>
<div class="grid">
  ${stat(status.articles, "articles", status.articles === 0 ? "An empty corpus is a hub that declines everything and looks correct doing it. Ingest: npm.cmd run kb:ingest" : null)}
  ${stat(status.chunks, "chunks (the retrieval unit)", null)}
  ${stat(status.embedded, "chunks embedded", unembedded > 0 ? `${unembedded} not embedded yet — those retrieve lexically only` : modelNote)}
</div>
${status.models.length > 1 ? html`<div class="error">${modelNote}</div>` : ""}

<div class="panel">
  <h2>Articles</h2>
  ${articles.length ? html`<table>
    <thead><tr><th>Article</th><th>Type</th><th>Platform</th><th>Category</th><th>Lifecycle</th><th>Chunks</th><th>Ingested</th></tr></thead>
    <tbody>${articles.map((a) => html`<tr id="${a.id}">
      <td><strong>${a.title}</strong><div class="mono muted" style="font-size:12px">${a.id}</div></td>
      <td>${a.type}</td><td>${a.platform}</td><td>${a.category ?? "-"}</td>
      <td>${a.lifecycle ?? html`<span class="muted">-</span>`}</td>
      <td>${a.chunks}${a.embedded < a.chunks ? html` <span class="muted">(${a.embedded} embedded)</span>` : ""}</td>
      <td>${when(a.ingestedAt)}</td>
    </tr>`)}</tbody>
  </table>` : empty("No articles. From server/: npm.cmd run kb:ingest loads the six generic articles and embeds them.")}
</div>

${notYet({
  heading: "Search as the assistant searches",
  missing: "Admin search over the corpus is not on this page yet.",
  why: "It is the single most useful thing the console can do and the retrieval code exists (src/kb/retrieve.js, hybrid lexical + semantic with RRF). If the admin cannot find an article, neither can the assistant. It is next, with ingestion, so that a search result can show rank and score per leg.",
  arrives: "the next pass (KB ingestion and search)",
})}
${notYet({
  heading: "Ingest, edit, and answer a gap",
  missing: "Articles cannot be added or edited here.",
  why: "Ingestion works from the terminal (node bin/kb.mjs ingest <bundle.json>, then embed) and reports what landed, including chunk counts. A browser upload needs the same path plus a report on this page. Editing needs the article editor, and rendering admin-authored markdown to other admins needs a sanitiser (handover §2) before the first article is typed into a browser.",
  arrives: "the next pass",
})}`;
  await ctx.render(200, body, { title: "Knowledge" });
}

export const knowledgeRoutes = [
  route("GET", /^\/admin\/knowledge\/?$/, "knowledge.read", knowledgePage),
];
