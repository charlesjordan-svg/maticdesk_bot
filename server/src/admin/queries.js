// @ts-check
/**
 * The control-plane reads the console's pages need that belong to no other module: the review
 * queue's gap feed, the metrics counts, the knowledge corpus listing, the tenant row.
 *
 * Tenant data (tickets) goes through src/tickets/query.js and `withTenant()`. Everything here is
 * control-plane and schema-qualified, per src/db/pool.js.
 *
 * ON TENANT SCOPE, HONESTLY. `control.kb_retrieval_log` is NOT tenant-scoped: its `tenant_label`
 * is a development log label and not a foreign key (src/kb/ask.js), because device authentication
 * (D61/D132) is not built and the generic corpus is cross-tenant by decision (D45). So the gap feed
 * and the question counts below are for THE HUB, not for the tenant the admin belongs to, and the
 * pages say so in a banner rather than filtering on a label that authenticates nothing. When
 * device auth lands and the log carries a real tenant_id, `gapFeed()` and `questionCounts()` gain a
 * WHERE clause and the banner goes.
 */
import { withControl } from "../db/pool.js";
import { corpusStatus } from "../kb/ingest.js";
// D229: the review page names the retention window; it reads it through here rather than importing
// src/kb/retrieve.js itself, because a page must not reach the retrieval legs directly (admin-static §5a).
export { questionLoggingEnabled, questionRetentionDays } from "../kb/retrieve.js";

/** The tenant an admin session is scoped to. */
export async function tenantById(tenantId) {
  return withControl(async (c) => {
    const { rows } = await c.query(
      "SELECT id, slug, schema_name, display_name, status, created_at FROM control.tenants WHERE id = $1",
      [tenantId],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return { id: r.id, slug: r.slug, schemaName: r.schema_name, displayName: r.display_name, status: r.status, createdAt: r.created_at };
  });
}

/** Tenant by slug, for the CLI. */
export async function tenantBySlug(slug) {
  return withControl(async (c) => {
    const { rows } = await c.query(
      "SELECT id, slug, schema_name, display_name, status, created_at FROM control.tenants WHERE slug = $1",
      [slug],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return { id: r.id, slug: r.slug, schemaName: r.schema_name, displayName: r.display_name, status: r.status, createdAt: r.created_at };
  });
}

// ---- the review queue (D177) ------------------------------------------------------------------

/**
 * The gap-feed filters (D236). `hybrid` is what the badge counts; `degraded` is every decline made
 * under lexicalOnly / emptyCorpus / unavailable OR before the mode was recorded (NULL); `all` is both.
 * Named here so the page's links and the query cannot disagree about what each word admits.
 */
export const GAP_FILTERS = Object.freeze(["all", "hybrid", "degraded"]);

/** The WHERE fragment for a gap filter. `l` is the retrieval-log alias. */
function gapFilterSql(filter) {
  if (filter === "hybrid") return "AND l.retrieval_mode = 'hybrid'";
  if (filter === "degraded") return "AND (l.retrieval_mode IS NULL OR l.retrieval_mode <> 'hybrid')";
  return "";
}

/**
 * Feed 2 of D177: KB gaps. Every question the hub DECLINED (D205's `answered: false`) is a gap
 * candidate with, when MATIC_KB_LOG_QUERIES=1 was set, the question attached. D223: a gap record
 * is not a transcript and is readable by any admin with review.read.
 *
 * SINCE D236 EVERY ROW CARRIES ITS RETRIEVAL MODE, AND A DEGRADED ROW IS FLAGGED, NOT HIDDEN. A
 * decline made with the embedder down (lexicalOnly), over an empty corpus, or with the database
 * gone is not evidence that the corpus lacks an article - the system could not have found one - and
 * D227 logs every decline. Hiding those rows would lose real questions asked in a degraded period;
 * counting them as gaps is how the queue filled with false gaps. So they are returned with
 * `retrievalMode` set, the page marks them, and `filter` lets the admin see one kind at a time. NULL
 * is a row written before migration control/005 whose mode is NOT KNOWN; it is shown as such and
 * grouped with the degraded rows because it cannot be called a gap either.
 *
 * Feeds 1, 3 and 4 (drafts from resolved sessions, staleness, duplicates) are still not built;
 * sessions ARE recorded now (D237/D239), which is what feeds 1 and 3 were waiting on.
 *
 * @param {{ limit?: number, filter?: "all"|"hybrid"|"degraded" }} [opts]
 */
export async function gapFeed({ limit = 50, filter = "all" } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const f = GAP_FILTERS.includes(filter) ? filter : "all";
  return withControl(async (c) => {
    const { rows } = await c.query(
      `SELECT l.id, l.at, l.tenant_label, l.query_text, l.platform, l.retrieved, l.top_score, l.model,
              l.retrieval_mode, l.session_id
         FROM control.kb_retrieval_log l
        WHERE l.answered = false ${gapFilterSql(f)}
        ORDER BY l.at DESC LIMIT $1`,
      [cap],
    );
    // Titles for the articles that came back and were not enough. One query for the whole page.
    const ids = new Set();
    for (const r of rows) for (const ch of r.retrieved ?? []) if (ch?.articleId) ids.add(ch.articleId);
    /** @type {Map<string, string>} */
    const titles = new Map();
    if (ids.size) {
      const { rows: arts } = await c.query("SELECT id, title FROM control.kb_articles WHERE id = ANY($1)", [[...ids]]);
      for (const a of arts) titles.set(a.id, a.title);
    }
    const shaped = rows.map((r) => {
      /** @type {Map<string, { articleId: string, title: string|null, bestScore: number }>} */
      const byArticle = new Map();
      for (const ch of r.retrieved ?? []) {
        if (!ch?.articleId) continue;
        const cur = byArticle.get(ch.articleId);
        if (!cur || ch.score > cur.bestScore) byArticle.set(ch.articleId, { articleId: ch.articleId, title: titles.get(ch.articleId) ?? null, bestScore: ch.score });
      }
      return {
        id: Number(r.id), at: r.at, tenantLabel: r.tenant_label, queryText: r.query_text, platform: r.platform,
        topScore: r.top_score, model: r.model,
        // D236. null = written before control/005; the page says "mode unknown".
        retrievalMode: r.retrieval_mode ?? null,
        // D237. The endpoint's session, when it sent one. Not resolved to a tenant row here: the log
        // is control-plane and the session is in a tenant schema. Shown as an id.
        sessionId: r.session_id ?? null,
        retrieved: [...byArticle.values()].sort((a, b) => b.bestScore - a.bestScore),
      };
    });
    return groupGaps(shaped);
  });
}

/** Is this decline evidence of a gap? Only a decline made with BOTH legs running (D236). */
export const isGapEvidence = (mode) => mode === "hybrid";

/**
 * Group declines on the normalised question text, so a row can carry a REAL hit count (handback
 * §3: "a real count or nothing"). Rows without text cannot be deduplicated and stay one row each
 * with hits = 1, which the page renders as no count. Newest first, by last occurrence.
 *
 * D236: a group also carries `hybridHits` (how many of its declines were made under full retrieval)
 * and `modes` (the distinct modes seen, so the page can say "3 asked, 1 under full retrieval"). A
 * group with `hybridHits === 0` is flagged whole: nothing in it is evidence of a gap.
 *
 * @param {Array<{ id: number, at: Date, queryText: string|null, retrievalMode?: string|null, [k: string]: any }>} rows  newest first
 */
export function groupGaps(rows) {
  /** @type {Map<string, any>} */
  const byText = new Map();
  const out = [];
  const start = (r) => ({
    ...r, hits: 1, firstAt: r.at, lastAt: r.at,
    hybridHits: isGapEvidence(r.retrievalMode) ? 1 : 0,
    modes: [r.retrievalMode ?? null],
  });
  for (const r of rows) {
    const key = r.queryText ? r.queryText.trim().toLowerCase().replace(/\s+/g, " ") : null;
    if (key === null) { out.push(start(r)); continue; }
    const g = byText.get(key);
    if (g) {
      g.hits += 1;
      g.firstAt = r.at; // rows arrive newest first, so each later row is earlier in time
      if (isGapEvidence(r.retrievalMode)) g.hybridHits += 1;
      if (!g.modes.includes(r.retrievalMode ?? null)) g.modes.push(r.retrievalMode ?? null);
      continue;
    }
    const fresh = start(r);
    byText.set(key, fresh);
    out.push(fresh);
  }
  return out;
}

/**
 * How many gaps there are — the review queue's badge, drawn on every screen.
 *
 * COUNTS `hybrid` DECLINES ONLY (D236). The badge is what decides whether an admin opens the queue
 * at all, so an inflated badge is the actual harm of the false-gap problem: it sends someone to
 * author articles for questions the system could already answer. A degraded decline is still IN
 * the queue (flagged, filterable) - it is simply not a reason to open it.
 */
export async function gapCount() {
  return withControl(async (c) => {
    const { rows } = await c.query("SELECT count(*)::int AS n FROM control.kb_retrieval_log WHERE answered = false AND retrieval_mode = 'hybrid'");
    return rows[0].n;
  });
}

/**
 * The declines by mode, for the review page's tiles: how many are gaps, how many were made under
 * degraded retrieval, how many predate the mode column. `hybrid` here equals `gapCount()` by
 * construction - same table, same predicate.
 */
export async function gapCounts() {
  return withControl(async (c) => {
    const { rows: [r] } = await c.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE retrieval_mode = 'hybrid')::int AS hybrid,
              count(*) FILTER (WHERE retrieval_mode = 'lexicalOnly')::int AS lexical_only,
              count(*) FILTER (WHERE retrieval_mode = 'emptyCorpus')::int AS empty_corpus,
              count(*) FILTER (WHERE retrieval_mode = 'unavailable')::int AS unavailable,
              count(*) FILTER (WHERE retrieval_mode IS NULL)::int AS unknown
         FROM control.kb_retrieval_log WHERE answered = false`,
    );
    return {
      total: r.total, hybrid: r.hybrid, lexicalOnly: r.lexical_only, emptyCorpus: r.empty_corpus,
      unavailable: r.unavailable, unknown: r.unknown, degraded: r.total - r.hybrid,
    };
  });
}

// ---- metrics ------------------------------------------------------------------------------------

/**
 * What the retrieval log can say: questions asked, answered, declined — all time and the last
 * seven days — and the same split per platform. This is real. It is NOT deflection (D89): a
 * declined question is not an unresolved session and an answered one is not a resolved one.
 */
export async function questionCounts() {
  // D236: a window that contained degraded retrieval is MARKED. `degraded` counts every question
  // retrieved under lexicalOnly / emptyCorpus / unavailable (or before the mode was recorded), and
  // `declined_degraded` the declines among them - the ones that are NOT gaps.
  const DEGRADED = "(retrieval_mode IS NULL OR retrieval_mode <> 'hybrid')";
  return withControl(async (c) => {
    const { rows: [all] } = await c.query(
      `SELECT count(*)::int AS asked,
              count(*) FILTER (WHERE answered = true)::int  AS answered,
              count(*) FILTER (WHERE answered = false)::int AS declined,
              count(*) FILTER (WHERE answered IS NULL)::int AS unknown,
              count(*) FILTER (WHERE ${DEGRADED})::int AS degraded,
              count(*) FILTER (WHERE answered = false AND ${DEGRADED})::int AS declined_degraded,
              count(query_text)::int AS with_text,
              min(at) AS first_at, max(at) AS last_at
         FROM control.kb_retrieval_log`,
    );
    const { rows: [week] } = await c.query(
      `SELECT count(*)::int AS asked,
              count(*) FILTER (WHERE answered = true)::int  AS answered,
              count(*) FILTER (WHERE answered = false)::int AS declined,
              count(*) FILTER (WHERE ${DEGRADED})::int AS degraded,
              count(*) FILTER (WHERE answered = false AND ${DEGRADED})::int AS declined_degraded
         FROM control.kb_retrieval_log WHERE at > now() - interval '7 days'`,
    );
    const { rows: byPlatform } = await c.query(
      `SELECT coalesce(platform, 'unknown') AS platform, count(*)::int AS asked,
              count(*) FILTER (WHERE answered = true)::int AS answered,
              count(*) FILTER (WHERE answered = false)::int AS declined
         FROM control.kb_retrieval_log GROUP BY 1 ORDER BY 2 DESC`,
    );
    return { all, week, byPlatform };
  });
}

// ---- knowledge ----------------------------------------------------------------------------------

/** The corpus: status figures plus one row per article with its chunk and embedding counts. */
export async function corpusListing() {
  const status = await corpusStatus();
  const articles = await withControl(async (c) => {
    const { rows } = await c.query(
      `SELECT a.id, a.title, a.type, a.category, a.platform, a.lifecycle, a.ingested_at, a.bundle_id,
              count(ch.id)::int AS chunks, count(ch.embedding)::int AS embedded
         FROM control.kb_articles a LEFT JOIN control.kb_chunks ch ON ch.article_id = a.id
        GROUP BY a.id ORDER BY a.platform, a.title`,
    );
    return rows.map((r) => ({
      id: r.id, title: r.title, type: r.type, category: r.category, platform: r.platform, lifecycle: r.lifecycle,
      ingestedAt: r.ingested_at, bundleId: r.bundle_id, chunks: r.chunks, embedded: r.embedded,
    }));
  });
  return { status, articles };
}

/**
 * One article, every column — for the editor (D230). `corpusListing()` above deliberately carries
 * only the columns the list table shows; this is the full row the edit form needs to prefill,
 * including the fields the editor does not offer (`body`, `scope_note`, `provenance`, `bundle_id`)
 * so a save can carry them forward unchanged rather than blanking them.
 */
export async function articleById(id) {
  return withControl(async (c) => {
    const { rows } = await c.query(
      `SELECT id, bundle_id, type, title, category, platform, environment, lifecycle,
              problem, cause, body, scope_note, symptoms, keywords, guidance,
              escalate_when, do_not_attempt, provenance, source_hash, ingested_at
         FROM control.kb_articles WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  });
}
