// @ts-check
/**
 * Knowledge: what the corpus holds, SEARCH IT THE WAY THE ASSISTANT DOES, and put a bundle into it
 * from the browser. Three routes (handover of 2026-09-09, Tasks 1–3):
 *
 *   GET  /admin/knowledge          knowledge.read   the corpus, plus both forms
 *   GET  /admin/knowledge/search   knowledge.read   both retrieval legs unfused, then the fusion
 *   POST /admin/knowledge/ingest   knowledge.write  validate, write, embed, report what landed
 *
 * ===============================================================================================
 * THE CHUNK COUNT IS IN LARGE TYPE FOR A REASON
 * ===============================================================================================
 *
 * The demo-prep pass found that an empty corpus produces a hub that declines everything and looks
 * correct doing it (D220), and the launcher checks the chunk count for that reason. An admin
 * should not need the launcher to know.
 *
 * ===============================================================================================
 * CHUNK TEXT: ONLY FOR THE CHUNKS THE MODEL RECEIVES (D226)
 * ===============================================================================================
 *
 * Decided by the founder on 2026-09-09, and decided NARROWER than it was proposed. The text of a
 * chunk `/v1/ask` would send is quoted under its row; the text of a chunk that placed below
 * `DEFAULT_TOP_K` is not. The condition lives once, in `src/admin/kb-search.js`, which sets
 * `sentText` to null for everything else — so this file cannot render text for an unsent chunk by
 * forgetting a check, because there is no text in the view model to render. Read that file's header
 * for why the narrowing is what reconciles D53 with a screen somebody has to be able to use.
 *
 * The text goes through the `html` tag like everything else and is **not** rendered as markdown.
 * `raw()` stays unused; the sanitiser decision is still open, and this is the chunk exactly as
 * stored.
 *
 * ===============================================================================================
 * SEARCH IS NOT AUDITED, AND THAT IS A DECISION RATHER THAN AN OMISSION
 * ===============================================================================================
 *
 * Every other read in this console was audited deliberately: a ticket's detail page gets a
 * `ticket.view` row because it names a person, and src/admin/audit.js says the audit records
 * access to people rather than clicks. **A corpus search names nobody.** It reads the generic,
 * cross-tenant, admin-authored corpus (D45) — the same rows `bin/kb.mjs legs` prints with no audit
 * at all — so a row per search would be a log of an admin's typing, which is the thing D154 exists
 * to constrain, pointed at the wrong person. The ingest IS audited: it changes what every tenant's
 * assistant answers.
 *
 * ===============================================================================================
 * WHAT THE INGEST FORM IS, AND WHY IT IS A TEXTAREA
 * ===============================================================================================
 *
 * `readForm()` parses `application/x-www-form-urlencoded` only; there is no multipart parser and
 * D221 forbids adding a dependency for one. So the admin pastes the bundle's JSON. A real file
 * upload is a SECOND form on this page later, once somebody writes a multipart parser in
 * src/admin/ — not a different design, and not a reason to delay the thing that works today.
 *
 * One POST does everything: validate with parseBundle()'s rules, write, refuse a second embedding
 * model, embed, report. A two-step preview is a later refinement; a validate-only step that then
 * needed a second click would have been two ways to be half-done instead of one.
 *
 * THE REPORT IS THE FEATURE. "Done" is what the CLI used to say, and an empty corpus that looks
 * loaded is the exact failure D220 found on demo day. So the page reports articles inserted /
 * updated / unchanged (knowable because of `source_hash`), chunks written, chunks embedded, WHICH
 * MODEL embedded them, and the corpus totals after — every number returned by `ingestAndEmbed()`,
 * which is the same function `node bin/kb.mjs ingest` calls.
 */
import { html, notYet, stat, empty, when, csrfField, limit } from "../html.js";
import { corpusListing } from "../queries.js";
import { route } from "../route.js";
import { SEARCH_PLATFORMS, normalisePlatform, searchCorpus } from "../kb-search.js";
import { corpusStatus, ingestAndEmbed, parseBundle } from "../../kb/ingest.js";

/**
 * The three caveats that travel with every retrieval figure this console shows (CLAUDE.md's Never
 * list: "Quote a retrieval quality number from B7a without the caveat"). They are one constant so
 * that the search page and the corpus page cannot carry different versions of them, and so that
 * deleting one is a visible act.
 */
const RETRIEVAL_CAVEATS = html`<strong>Every ordering below is a floor, not a measurement of the design.</strong>
  There is <strong>no cross-encoder reranker</strong> (D207) — it is retrieved and deliberately not
  picked, because a cross-encoder costs per-query × per-candidate and no latency measurement exists.
  The development embedder is <strong>not the model D199 chose</strong> (D203): it is the L variant,
  1.9× the parameters, so dev quality is an optimistic proxy and dev latency a pessimistic one.
  And <strong>no relevance threshold is drawn on these scores, because one cannot be</strong> — a
  fused RRF score is <span class="mono">2/61</span> or <span class="mono">1/(60+rank)</span>, so it
  encodes rank and leg agreement and carries no similarity magnitude at all (register §5.16c,
  measured by <span class="mono">npm.cmd run kb:floor</span>).`;

const CROSS_TENANT = html`<strong>Cross-tenant: this changes what EVERY tenant's assistant answers.</strong>
  The corpus is <span class="mono">control.kb_*</span> and generic by decision (D45), so an article
  ingested here is not scoped to your tenant. Whether tenant-specific articles should exist is a
  decision nobody has taken.`;

// ---- shared form -------------------------------------------------------------------------------

/**
 * The search form. GET, so it carries no CSRF token — a token in a query string is a token in the
 * browser history — and so a result page is a URL an admin can keep or paste into a handover.
 */
function searchForm({ query = "", platform = "any" } = {}) {
  return html`
<form method="get" action="/admin/knowledge/search">
  <label for="q">Search the corpus the way the assistant searches it</label>
  <div class="row">
    <input id="q" name="q" type="text" value="${query}" placeholder="my mouse cuts out" style="max-width:520px">
    <select name="platform" aria-label="Platform pre-filter">${SEARCH_PLATFORMS.map((p) => html`<option value="${p}" ${p === platform ? html`selected=""` : ""}>${p === "any" ? "any machine" : p}</option>`)}</select>
    <button class="primary" type="submit">Search</button>
  </div>
  <p class="hint">Both retrieval legs, unfused, then the fusion — the same functions <span class="mono">/v1/ask</span> calls. The platform pre-filter applies inside each leg (D162), exactly as a real question's does.</p>
  <p class="hint"><strong>“any machine” matches articles marked <span class="mono">any</span> and nothing else.</strong> A <span class="mono">windows</span> or <span class="mono">macos</span> article is invisible under it — deliberately, because that is what a machine whose platform probe failed sees, and admitting everything on an unknown platform is how a macOS article reaches a Windows user. Pick the platform to see those articles.</p>
</form>`;
}

// ---- the corpus page ---------------------------------------------------------------------------

/**
 * The ingest form. Drawn only for a session with `knowledge.write`; a role with read alone is told
 * so in a sentence rather than shown a control that will refuse it (the pattern
 * pages/tickets.js's state block set).
 */
function ingestForm(ctx, status) {
  // ctx carries the limit rather than this file importing it: src/admin/route.js exists because
  // pages and the router must not import each other in a circle, and a constant is not worth
  // making one.
  const kb = Math.floor((ctx.maxFormBytes ?? 0) / 1024);
  if (!ctx.permissions.has("knowledge.write")) {
    return html`<div class="panel"><h2>Ingest a bundle</h2>
      <p class="muted">Your roles (${ctx.roles.join(", ") || "none"}) can read the knowledge base but not change it. Ingestion needs <span class="mono">knowledge.write</span>.</p></div>`;
  }
  return html`
<div class="panel">
  <h2>Ingest a bundle</h2>
  <p class="muted">Paste a bundle's JSON — the same shape as <span class="mono">docs/kb/generic-kb-v2.json</span>: an object with a <span class="mono">bundleId</span> and an <span class="mono">articles</span> array. Validated whole before anything is written, so a bad article anywhere means nothing lands.</p>
  ${limit(CROSS_TENANT)}
  ${status.models.length === 1
    ? html`<p class="muted">This corpus is embedded by <span class="mono">${status.models[0].model}</span>. If this hub's embedder is a different model the ingest still lands and <strong>the embedding step is refused</strong>, because two models are two vector spaces and retrieval is then confidently wrong for part of the corpus.</p>`
    : ""}
  <form method="post" action="/admin/knowledge/ingest">
    ${csrfField(ctx.csrf)}
    <label for="bundle">Bundle JSON</label>
    <textarea id="bundle" name="bundle" rows="10" placeholder='{ "bundleId": "my-bundle", "articles": [ { "id": "…", "type": "troubleshooting", "title": "…", "symptoms": [], "guidance": [] } ] }' style="max-width:100%;min-height:180px;font-family:var(--mono);font-size:13px"></textarea>
    <p class="hint">Up to ${kb} kB of form body. A bigger bundle belongs on disk: <span class="mono">node bin/kb.mjs ingest &lt;bundle.json&gt;</span> from <span class="mono">server/</span>.</p>
    <p class="hint">There is <strong>no file picker</strong>: this console has no multipart parser and D221 forbids adding a dependency for one. A file upload is a second form here once one is written.</p>
    <div class="row">
      <button class="primary" type="submit">Validate, ingest and embed</button>
      <span class="muted" style="font-size:13px">Recorded in the audit log with who did it, the counts and the model — never the article text.</span>
    </div>
  </form>
</div>`;
}

/** The corpus figures and the model note. Shared by the page and the ingest report. */
function corpusStats(status) {
  const unembedded = status.chunks - status.embedded;
  const modelNote = status.models.length === 0
    ? "no chunk is embedded — retrieval runs on the lexical leg only"
    : status.models.length === 1
      ? `all embedded by ${status.models[0].model}`
      : `EMBEDDED BY ${status.models.length} DIFFERENT MODELS — vectors are in different spaces and retrieval is confidently wrong for part of the corpus. Fix: node bin/kb.mjs reembed`;
  return { modelNote, body: html`
<div class="grid">
  ${stat(status.articles, "articles", status.articles === 0 ? "An empty corpus is a hub that declines everything and looks correct doing it. Ingest one below, or: npm.cmd run kb:ingest" : null)}
  ${stat(status.chunks, "chunks (the retrieval unit)", null)}
  ${stat(status.embedded, "chunks embedded", unembedded > 0 ? `${unembedded} not embedded yet — those retrieve lexically only` : modelNote)}
</div>
${status.models.length > 1 ? html`<div class="error">${modelNote}</div>` : ""}` };
}

/**
 * The corpus page. `report` is the ingest result when this render is a POST's answer — the report
 * is rendered in place rather than redirected to, because the counts are the whole point of the
 * action and a redirect would throw them away to get a tidier URL.
 */
async function renderKnowledge(ctx, { report = null, error = null } = {}) {
  const { status, articles } = await corpusListing();
  const stats = corpusStats(status);

  const body = html`
<h1>Knowledge</h1>
<p class="lede">The generic knowledge base the assistant answers from. Cross-tenant by decision (D45); tenant-specific articles are not yet a thing.</p>

${error ? html`<div class="error">${error}</div>` : ""}
${report ? ingestReport(report) : ""}

<div class="panel">${searchForm()}</div>

${stats.body}

<div class="panel">
  <h2>Articles<span class="count">${articles.length}</span></h2>
  ${articles.length ? html`<table>
    <thead><tr><th>Article</th><th>Type</th><th>Platform</th><th>Category</th><th>Lifecycle</th><th>Chunks</th><th>Ingested</th></tr></thead>
    <tbody>${articles.map((a) => html`<tr id="${a.id}">
      <td><strong>${a.title}</strong><div class="mono muted" style="font-size:12px">${a.id}</div></td>
      <td>${a.type}</td><td>${a.platform}</td><td>${a.category ?? "-"}</td>
      <td>${a.lifecycle ?? html`<span class="muted">-</span>`}</td>
      <td>${a.chunks}${a.embedded < a.chunks ? html` <span class="muted">(${a.embedded} embedded)</span>` : ""}</td>
      <td>${when(a.ingestedAt)}</td>
    </tr>`)}</tbody>
  </table>` : empty("No articles. Paste a bundle below, or from server/: npm.cmd run kb:ingest loads the six generic articles and embeds them.")}
</div>

${ingestForm(ctx, status)}

${notYet({
  heading: "Write and edit articles here",
  missing: "An article cannot be typed or edited in this console — only ingested as a bundle.",
  why: "An editor shows admin-authored text back to OTHER admins, so it needs a markdown sanitiser before the first article is typed into a browser, and writing one (or taking the first dependency since pg) is a decision. The review queue's answer form is drawn and disabled for the same reason. Ingestion is the honest half and it is above.",
  arrives: "the KB editor, after the sanitiser decision",
})}
<p class="muted">The same corpus, from a terminal: <span class="mono">npm.cmd run kb:status</span> (server/).</p>`;
  await ctx.render(error ? 400 : 200, body, { title: "Knowledge", current: "/admin/knowledge" });
}

// ---- the ingest report -------------------------------------------------------------------------

/**
 * What landed. Every figure comes from `ingestAndEmbed()`'s return value, which is what
 * `node bin/kb.mjs ingest` prints — exit criterion 1 is that these two agree.
 */
function ingestReport(r) {
  const { articles, embed, status } = r;
  const wrote = articles.inserted + articles.updated;
  return html`
<div class="panel">
  <h2>Ingested — bundle <span class="mono">${r.bundleId}</span></h2>
  <div class="grid">
    ${stat(articles.inserted, "articles inserted", null)}
    ${stat(articles.updated, "articles updated", "their chunks were deleted and rebuilt, so no vector describes text that has changed")}
    ${stat(articles.unchanged, "unchanged", articles.unchanged ? "identical source_hash — skipped entirely, including embedding" : null)}
    ${stat(r.chunksWritten, "chunks written", wrote === 0
      ? `nothing was rewritten — the bundle's ${r.chunksInBundle} chunks were already in the corpus, unchanged`
      : `out of ${r.chunksInBundle} in the bundle. A rewritten article's chunks are DELETED and rebuilt, never patched`)}
  </div>

  ${embed.refused
    ? html`<div class="error"><strong>The articles and chunks are written. THE EMBEDDING STEP WAS REFUSED.</strong> ${embed.refused.reason}</div>`
    : embed.error
      ? html`<div class="error"><strong>The articles and chunks are written. Embedding did not run:</strong> ${embed.error}.
          Those chunks <strong>retrieve through the lexical leg only</strong> until <span class="mono">node bin/kb.mjs embed</span> runs — the same degraded mode the hub has when the embedder is down. Nothing is lost; the corpus is just half-indexed, and the figure above says by how much.</div>`
      : html`<p><strong>${embed.embedded} chunk(s) embedded</strong> by <span class="mono">${embed.model}</span>${embed.batches ? html` in ${embed.batches} batch(es)` : ""}.
          ${embed.embedded === 0 ? html`<span class="muted">Nothing needed embedding: every chunk already had a vector from this model.</span>` : ""}</p>`}

  ${r.warnings.length ? html`<div class="error"><strong>Written, and worth knowing:</strong><ul style="margin:6px 0 0">${r.warnings.map((w) => html`<li>${w}</li>`)}</ul></div>` : ""}

  <p class="muted">Corpus now: <strong>${status.articles}</strong> articles, <strong>${status.chunks}</strong> chunks, <strong>${status.embedded}</strong> embedded${status.models.length === 1 ? html` by <span class="mono">${status.models[0].model}</span>` : status.models.length === 0 ? " by nothing" : html` by <strong>${status.models.length} different models</strong>`}.
  Check it independently: <span class="mono">npm.cmd run kb:status</span> from <span class="mono">server/</span> — it reads the same function and must print the same numbers.</p>
  <p class="muted">Re-ingesting the same bundle is a no-op by <span class="mono">source_hash</span>. That is not a nicety: an article whose text changed has its chunks <em>deleted and rebuilt</em>, because updating text in place and leaving the vector produces a corpus whose vectors describe text that is no longer there, and that failure is invisible.</p>
</div>`;
}

// ---- routes ------------------------------------------------------------------------------------

async function knowledgePage(ctx) {
  await renderKnowledge(ctx);
}

async function ingestPost(ctx) {
  const text = String(ctx.form.bundle ?? "").trim();
  if (!text) {
    return renderKnowledge(ctx, { error: "Nothing to ingest: the bundle box was empty." });
  }

  // Parse and shape-check BEFORE the database is touched, and report the refusal as the message the
  // rule itself produced. `parseBundle` names the offending article id, which is the only useful
  // thing to say about a bundle of forty.
  let bundle;
  try {
    bundle = parseBundle(text, "pasted bundle");
  } catch (err) {
    await ctx.audit("kb.ingest.refused", { detail: { why: err.message.slice(0, 400), bytes: text.length } });
    return renderKnowledge(ctx, { error: `Refused, and nothing was written. ${err.message}` });
  }

  const report = await ingestAndEmbed({
    bundle,
    label: "pasted bundle",
    embedder: ctx.embedder,
    log: ctx.log,
  });

  // The audit row carries counts and the model and NEVER the article text (src/admin/audit.js: an
  // audit table that copies the record it audits becomes a second copy of the record).
  await ctx.audit("kb.ingest", {
    subject: report.bundleId,
    detail: {
      bundleId: report.bundleId,
      articles: report.articles,
      chunksWritten: report.chunksWritten,
      embedded: report.embed.embedded,
      model: report.embed.model,
      embedRefused: report.embed.refused ? report.embed.refused.reason.slice(0, 200) : null,
      embedError: report.embed.error,
      warnings: report.warnings.length,
    },
  });
  ctx.log(`[admin] ${ctx.user.email} ingested ${report.bundleId}: ${report.articles.inserted} inserted, ${report.articles.updated} updated, ${report.articles.unchanged} unchanged, ${report.embed.embedded} embedded`);

  await renderKnowledge(ctx, { report });
}

/**
 * SEARCH. Both legs unfused, then the fusion, with the ranks from each leg on every row.
 *
 * Not audited — see this file's header. Nothing here names a person.
 */
async function searchPage(ctx) {
  const query = String(ctx.url.searchParams.get("q") ?? "").trim();
  const asked = String(ctx.url.searchParams.get("platform") ?? "any");
  const platform = normalisePlatform(asked);
  const status = await corpusStatus();

  if (platform === null) {
    const body = html`
<p><a href="/admin/knowledge">← Knowledge</a></p>
<h1>Not a platform this corpus can be filtered on</h1>
<p class="lede">You asked for <span class="mono">${asked}</span>. The pre-filter matches ${SEARCH_PLATFORMS.map((p, i) => html`${i ? ", " : ""}<span class="mono">${p}</span>`)} and nothing else, because those are the values <span class="mono">platformFromProbe()</span> can produce from a real machine (D162). Guessing at anything else is how a macOS article reaches a Windows user.</p>
<div class="panel">${searchForm({ query })}</div>`;
    return ctx.render(400, body, { title: "Search", current: "/admin/knowledge" });
  }

  const result = query
    ? await searchCorpus({ query, platform, embedder: ctx.embedder, log: ctx.log })
    : null;

  const body = html`
<p><a href="/admin/knowledge">← Knowledge</a></p>
<h1>Search the corpus</h1>
<p class="lede">The retrieval the assistant runs, with its two legs pulled apart. If you cannot find an article here, neither can the assistant — and the legs say which half is failing.</p>

<div class="panel">${searchForm({ query, platform })}</div>

${limit(RETRIEVAL_CAVEATS)}

${status.chunks === 0
  ? empty("The corpus is empty, so every search returns nothing and every question is declined. Ingest a bundle from the Knowledge page.")
  : result === null
    ? empty("Type a question a user would type. Retrieval is over chunks, not articles, so a sentence works better than a keyword.")
    : searchResults(result, status)}

<p class="muted">The same two legs, from a terminal: <span class="mono">npm.cmd run kb -- legs "${query || "my mouse cuts out"}"</span>, and with the fusion: <span class="mono">npm.cmd run kb -- retrieve "${query || "my mouse cuts out"}"${platform === "any" ? "" : ` --platform ${platform}`}</span> (server/). Same functions, same ranks.</p>`;
  await ctx.render(200, body, { title: query ? `Search: ${query}` : "Search", current: "/admin/knowledge" });
}

// ---- search rendering --------------------------------------------------------------------------

const rank = (n) => n === null || n === undefined ? html`<span class="muted">—</span>` : html`<span class="mono">#${n}</span>`;

function searchResults(r, status) {
  const semanticNote = r.legs.semanticRan
    ? html`ran against <span class="mono">${r.embedder?.model}</span>`
    : html`<strong>did not run</strong>: ${r.legs.semanticError}`;

  /**
   * THE SHAPE AN UNCOVERED QUESTION MAKES, said out loud. The lexical leg found nothing, the dense
   * leg returned its nearest neighbours anyway — because a dense leg has no notion of "no match" —
   * and so five chunks are still marked "sent". A reader who does not know that reads this screen
   * as five relevant results. It is the same arithmetic that makes a relevance floor impossible
   * (§5.16c), so it is worth one sentence every time it happens rather than a footnote.
   */
  const noAgreement = r.fused.length > 0 && r.legs.semanticRan && r.legs.lexical.length === 0;

  return html`
<div class="grid">
  ${stat(r.legs.lexical.length, "lexical candidates", `tsvector + GIN, up to ${r.params.candidatesPerLeg}. This is the leg that finds a product name or an error code`)}
  ${stat(r.legs.semanticRan ? r.legs.semantic.length : "—", "semantic candidates", r.legs.semanticRan ? `pgvector cosine + HNSW, up to ${r.params.candidatesPerLeg}. A dense leg has no "no match": it returns its nearest neighbours whatever you ask` : "the semantic leg did not run — see below")}
  ${stat(r.fused.length, "chunks after fusion", `RRF, k=${r.params.rrfK}, kind weights applied${r.truncated ? `; capped at ${r.params.maxRows} for this page` : ""}`)}
  ${stat(r.forModel.length, "would reach the model", `/v1/ask sends the top ${r.params.topK}. Anything below that line is invisible to the assistant`)}
</div>

${r.scope.eligible < r.scope.total
  ? html`<p class="muted"><strong>${r.scope.eligible} of ${r.scope.total} chunks were eligible</strong> under the <span class="mono">${r.platform}</span> pre-filter; the other ${r.scope.total - r.scope.eligible} belong to articles for a different platform and neither leg saw them. If an article you expected is missing, check its platform on the Knowledge page before concluding it is not there.</p>`
  : html`<p class="muted">All ${r.scope.total} chunks were eligible under the <span class="mono">${r.platform}</span> pre-filter, so nothing was withheld before the legs ran.</p>`}

${r.legs.semanticRan ? "" : html`<div class="error"><strong>Half of retrieval did not run.</strong> The semantic leg ${semanticNote}. What you see below is the lexical leg alone, which is a real degraded mode of the hub (the endpoint's alternative is no answer at all) — but it is <strong>not</strong> what a working system returns, so do not read a missing article as an absent article until this is fixed.</div>`}

${noAgreement ? limit(html`<strong>The lexical leg found nothing, so these rows are the dense leg alone — and a dense leg has no “no match”.</strong>
  It returns its nearest neighbours for any question at all, so chunks are still marked “sent” below and the top score is still <span class="mono">1/61</span>. <strong>This is what an uncovered question looks like</strong>, and it is indistinguishable by score from a covered question whose phrasing shares no terms with its article — which is why no threshold is drawn here and why the decline is the prompt's job (D205, §5.16c). Read the “both” column and the cosine values on the semantic leg, not the ordering.`) : ""}

<h2>What came back<span class="count">${r.byArticle.length} article(s), ${r.fused.length} chunk(s)</span></h2>
${r.fused.length === 0
  ? empty(`Nothing matched "${r.query}"${r.platform === "any" ? "" : ` for platform ${r.platform}`}. No threshold was applied and none could be — this is genuinely nothing, not something filtered out. If the lexical count above is 0 and the semantic count is not, the phrasing shares no terms with any article; if both are 0, the platform pre-filter or an empty corpus is the reason.`)
  : html`
<table>
  <thead><tr><th>Article</th><th>Chunk</th><th>Lex</th><th>Sem</th><th>Both</th><th>Weight</th><th>RRF score</th><th>To model</th></tr></thead>
  <tbody>${r.byArticle.flatMap((a) => a.chunks.flatMap((c, i) => [html`<tr>
    <td>${i === 0
      ? html`<a href="/admin/knowledge#${a.articleId}"><strong>${a.article?.title ?? a.articleId}</strong></a>
          <div class="mono muted" style="font-size:12px">${a.articleId} · ${a.article?.type ?? "?"} · ${a.article?.platform ?? "?"}</div>`
      : html`<span class="muted" style="font-size:12px">↳ same article</span>`}</td>
    <td><span class="pill">${c.kind}</span></td>
    <td>${rank(c.lexRank)}</td>
    <td>${rank(c.semRank)}</td>
    <td>${c.bothLegs ? html`<strong>yes</strong>` : html`<span class="muted">no</span>`}</td>
    <td class="mono">${c.weight.toFixed(2)}</td>
    <td class="mono">${c.score.toFixed(6)}</td>
    <td>${c.forModel ? html`<span class="pill new">sent</span>` : html`<span class="muted">below the top ${r.params.topK}</span>`}</td>
  </tr>`,
    // D226, AS DECIDED: the text of a chunk the model receives, and of no other chunk. `sentText`
    // is null for anything below the line (src/admin/kb-search.js), so this row simply does not
    // appear for those — the condition is the absence of the data, not a rule to remember.
    c.sentText ? html`<tr><td></td><td colspan="7"><blockquote>${c.sentText}</blockquote></td></tr>` : "",
  ]))}</tbody>
</table>
<p class="muted"><strong>The quoted text is what the model was given, and only that.</strong> A chunk
  below the top ${r.params.topK} shows its ranks and its score and not its text (D226, founder
  2026-09-09: the sent set is the text that produced or failed to produce an answer, and it is the
  smallest disclosure that answers the question this screen exists to answer). Read it against
  D53's rule that chunk text does not leave the hub: this page IS the hub, and the article text is
  already readable through <span class="mono">node bin/kb.mjs</span> — but the corpus is
  cross-tenant (D45), so this is every tenant's article text, and a page is easier to screenshot
  than a terminal. It is not rendered as markdown; it is the chunk, escaped, exactly as stored.</p>
<p class="muted"><strong>“Both” is the column worth reading.</strong> A chunk found by both legs gets both RRF terms, and that agreement is the property that makes hybrid retrieval work — it is also the honest form of the relevance signal a score threshold would be approximating (§5.16c). The score itself is <span class="mono">Σ weight/(${r.params.rrfK}+rank)</span> and nothing else: it is not a similarity.</p>`}

<h2>The two legs, unfused</h2>
<p class="muted">Shown separately because a fusion of one working leg and one dead leg returns plausible results in a plausible order and looks like a working system (B7a spec §9). Each leg's score is its own and the two are <strong>not comparable</strong> — that is why fusion uses rank.</p>
<div class="cols">
  ${legPanel("Lexical", "ts_rank over the generated tsvector, GIN indexed. websearch_to_tsquery, so quoted phrases and -exclusions work as a user expects.", r.legs.lexical, "ts_rank")}
  ${r.legs.semanticRan
    ? legPanel("Semantic", `cosine similarity over pgvector, HNSW indexed, query embedded by ${r.embedder?.model} with arctic's "query: " prefix. This score IS a magnitude in [-1, 1] — it is the one place a relevance floor could ever live (§5.16c), and no floor is set here either.`, r.legs.semantic, "cosine")
    : html`<div class="panel"><h2>Semantic</h2><p class="muted">Did not run: ${r.legs.semanticError}</p><p class="muted">${status.embedded} of ${status.chunks} chunks have a vector. With no semantic leg, a question whose phrasing shares no words with its article cannot be found at all.</p></div>`}
</div>

${notYet({
  heading: "The text of a chunk the model did NOT receive",
  missing: "A chunk below the top " + r.params.topK + " shows its ranks and its score, and not its text.",
  why: "D226 was decided narrower than it was proposed (founder, 2026-09-09): the sent set is exactly the text that produced or failed to produce an answer, so it is the smallest disclosure that answers the question this screen exists to answer, and D53's rule against chunk text leaving the hub is respected everywhere else. If you need the rest, node bin/kb.mjs legs <query> prints every candidate's text in a terminal, where it cannot be screenshot out of context as easily — and the article itself is on the Knowledge page.",
  arrives: "nothing — this is the decided shape, not a gap",
})}`;
}

function legPanel(name, what, rows, scoreLabel) {
  return html`
<div class="panel">
  <h2>${name}<span class="count">${rows.length}</span></h2>
  <p class="muted" style="font-size:13px">${what}</p>
  ${rows.length === 0
    ? empty(`The ${name.toLowerCase()} leg returned nothing.`)
    : html`<table>
      <thead><tr><th>#</th><th>Article</th><th>Chunk</th><th>${scoreLabel}</th></tr></thead>
      <tbody>${rows.map((c) => html`<tr>
        <td class="mono">${c.rank}</td>
        <td><a href="/admin/knowledge#${c.articleId}" class="mono">${c.articleId}</a></td>
        <td><span class="pill">${c.kind}</span></td>
        <td class="mono">${c.legScore.toFixed(5)}</td>
      </tr>`)}</tbody>
    </table>`}
</div>`;
}

export const knowledgeRoutes = [
  route("GET", /^\/admin\/knowledge\/?$/, "knowledge.read", knowledgePage),
  route("GET", /^\/admin\/knowledge\/search\/?$/, "knowledge.read", searchPage),
  route("POST", /^\/admin\/knowledge\/ingest\/?$/, "knowledge.write", ingestPost),
];
