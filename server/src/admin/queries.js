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
 * Feed 2 of D177: KB gaps. Every question the hub DECLINED (D205's `answered: false`) is a gap
 * candidate with, when MATIC_KB_LOG_QUERIES=1 was set, the question attached. D223: a gap record
 * is not a transcript and is readable by any admin with review.read.
 *
 * Feeds 1, 3 and 4 (drafts from resolved sessions, staleness, duplicates) need session outcomes
 * that nothing writes yet; the page says so rather than showing them empty.
 *
 * @param {{ limit?: number }} [opts]
 */
export async function gapFeed({ limit = 50 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 500);
  return withControl(async (c) => {
    const { rows } = await c.query(
      `SELECT l.id, l.at, l.tenant_label, l.query_text, l.platform, l.retrieved, l.top_score, l.model
         FROM control.kb_retrieval_log l
        WHERE l.answered = false
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
        retrieved: [...byArticle.values()].sort((a, b) => b.bestScore - a.bestScore),
      };
    });
    return groupGaps(shaped);
  });
}

/**
 * Group declines on the normalised question text, so a row can carry a REAL hit count (handback
 * §3: "a real count or nothing"). Rows without text cannot be deduplicated and stay one row each
 * with hits = 1, which the page renders as no count. Newest first, by last occurrence.
 *
 * @param {Array<{ id: number, at: Date, queryText: string|null, [k: string]: any }>} rows  newest first
 */
export function groupGaps(rows) {
  /** @type {Map<string, any>} */
  const byText = new Map();
  const out = [];
  for (const r of rows) {
    const key = r.queryText ? r.queryText.trim().toLowerCase().replace(/\s+/g, " ") : null;
    if (key === null) { out.push({ ...r, hits: 1, firstAt: r.at, lastAt: r.at }); continue; }
    const g = byText.get(key);
    if (g) { g.hits += 1; g.firstAt = r.at; continue; } // rows arrive newest first, so each later row is earlier in time
    const fresh = { ...r, hits: 1, firstAt: r.at, lastAt: r.at };
    byText.set(key, fresh);
    out.push(fresh);
  }
  return out;
}

/** How many gaps there are — the review queue's badge, drawn on every screen. */
export async function gapCount() {
  return withControl(async (c) => {
    const { rows } = await c.query("SELECT count(*)::int AS n FROM control.kb_retrieval_log WHERE answered = false");
    return rows[0].n;
  });
}

// ---- metrics ------------------------------------------------------------------------------------

/**
 * What the retrieval log can say: questions asked, answered, declined — all time and the last
 * seven days — and the same split per platform. This is real. It is NOT deflection (D89): a
 * declined question is not an unresolved session and an answered one is not a resolved one.
 */
export async function questionCounts() {
  return withControl(async (c) => {
    const { rows: [all] } = await c.query(
      `SELECT count(*)::int AS asked,
              count(*) FILTER (WHERE answered = true)::int  AS answered,
              count(*) FILTER (WHERE answered = false)::int AS declined,
              count(*) FILTER (WHERE answered IS NULL)::int AS unknown,
              count(query_text)::int AS with_text,
              min(at) AS first_at, max(at) AS last_at
         FROM control.kb_retrieval_log`,
    );
    const { rows: [week] } = await c.query(
      `SELECT count(*)::int AS asked,
              count(*) FILTER (WHERE answered = true)::int  AS answered,
              count(*) FILTER (WHERE answered = false)::int AS declined
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
