// @ts-check
/**
 * Ingesting the generic knowledge base. B7a (2026-09-04).
 *
 * A SCRIPT, NOT A UI. The authoring surface — review queue, gap detection, preview before publish
 * (D167-D192) — is explicitly out of B7a's scope (spec §7). This is the read path's fixture supply.
 *
 * RE-INGEST IS IDEMPOTENT AND CHANGE-AWARE, which is worth the thirty lines it costs. An article
 * whose hash is unchanged is skipped entirely, including its embedding. An article whose hash
 * changed has its chunks DELETED and rebuilt, because the alternative — updating chunk text in
 * place and leaving the vector — is a corpus whose vectors describe text that is no longer there.
 * That failure is invisible: retrieval keeps working and keeps being subtly wrong.
 *
 * EMBEDDING IS A SEPARATE PASS FROM WRITING, on purpose. Chunks land first with `embedding NULL`,
 * then are embedded. So an embedder outage mid-ingest leaves a corpus that still answers through
 * the lexical leg, and `embedPending()` finishes the job later without re-reading the bundle.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { withControl } from "../db/pool.js";
import { articleHash, chunkArticle } from "./chunk.js";
import { toVectorLiteral } from "./embed.js";

const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 32);

/**
 * Read and shape-check a bundle. Refuses rather than ingesting half of it: a partial corpus is the
 * state in which retrieval quietly misses articles that a reader believes are loaded.
 *
 * @param {string} path
 */
export function readBundle(path) {
  const raw = readFileSync(path, "utf8");
  const bundle = JSON.parse(raw);
  if (!Array.isArray(bundle.articles) || bundle.articles.length === 0) {
    throw new Error(`${path}: no articles array`);
  }
  const seen = new Set();
  for (const a of bundle.articles) {
    if (typeof a.id !== "string" || !a.id.trim()) throw new Error(`${path}: an article has no id`);
    if (seen.has(a.id)) throw new Error(`${path}: duplicate article id "${a.id}"`);
    seen.add(a.id);
    if (a.type !== "troubleshooting" && a.type !== "reference") {
      throw new Error(`${path}: article "${a.id}" has type "${a.type}"; migration 002 allows troubleshooting | reference`);
    }
    if (typeof a.title !== "string" || !a.title.trim()) throw new Error(`${path}: article "${a.id}" has no title`);
  }
  return bundle;
}

/**
 * Write one article and its chunks. Returns what happened, so the caller can report per-article
 * rather than "done".
 *
 * @param {any} client
 * @param {any} article
 * @param {string} bundleId
 * @returns {Promise<{ id: string, action: "inserted"|"updated"|"unchanged", chunks: number, long: string[] }>}
 */
export async function upsertArticle(client, article, bundleId) {
  const hash = articleHash(article, sha);
  const { rows: existing } = await client.query(
    "SELECT source_hash FROM control.kb_articles WHERE id = $1",
    [article.id],
  );
  if (existing.length && existing[0].source_hash === hash) {
    const { rows } = await client.query("SELECT count(*)::int AS n FROM control.kb_chunks WHERE article_id = $1", [article.id]);
    return { id: article.id, action: "unchanged", chunks: rows[0].n, long: [] };
  }

  const platform = String(article.platform ?? "any").toLowerCase();
  await client.query(
    `INSERT INTO control.kb_articles
       (id, bundle_id, type, title, category, platform, environment, lifecycle, problem, cause, body,
        scope_note, symptoms, keywords, guidance, escalate_when, do_not_attempt, provenance, source_hash, ingested_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19, now())
     ON CONFLICT (id) DO UPDATE SET
       bundle_id = EXCLUDED.bundle_id, type = EXCLUDED.type, title = EXCLUDED.title,
       category = EXCLUDED.category, platform = EXCLUDED.platform, environment = EXCLUDED.environment,
       lifecycle = EXCLUDED.lifecycle, problem = EXCLUDED.problem, cause = EXCLUDED.cause,
       body = EXCLUDED.body, scope_note = EXCLUDED.scope_note, symptoms = EXCLUDED.symptoms,
       keywords = EXCLUDED.keywords, guidance = EXCLUDED.guidance, escalate_when = EXCLUDED.escalate_when,
       do_not_attempt = EXCLUDED.do_not_attempt, provenance = EXCLUDED.provenance,
       source_hash = EXCLUDED.source_hash, ingested_at = now()`,
    [
      article.id, bundleId, article.type, article.title, article.category ?? null, platform,
      article.environment ?? null, article.lifecycle ?? null, article.problem ?? null,
      article.cause ?? null, article.body ?? null, article.scopeNote ?? null,
      article.symptoms ?? [], article.keywords ?? [], article.guidance ?? [],
      article.escalateWhen ?? [], article.doNotAttempt ?? [],
      article.provenance ? JSON.stringify(article.provenance) : null, hash,
    ],
  );

  // Rebuild, never patch. See the header: a stale vector over changed text is invisibly wrong.
  await client.query("DELETE FROM control.kb_chunks WHERE article_id = $1", [article.id]);
  const chunks = chunkArticle(article);
  for (const c of chunks) {
    await client.query(
      `INSERT INTO control.kb_chunks (article_id, ordinal, kind, text, weight, platform)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [article.id, c.ordinal, c.kind, c.text, c.weight, platform],
    );
  }
  return {
    id: article.id,
    action: existing.length ? "updated" : "inserted",
    chunks: chunks.length,
    long: chunks.filter((c) => c.long).map((c) => c.kind),
  };
}

/**
 * Ingest a whole bundle. One transaction: a half-ingested corpus is worse than none, because it
 * looks loaded.
 *
 * @param {{ path: string, log?: (s: string) => void }} opts
 */
export async function ingestBundle({ path, log = () => {} }) {
  const bundle = readBundle(path);
  log(`[kb] ${path}: bundle ${bundle.bundleId ?? "(unnamed)"}, ${bundle.articles.length} articles`);

  return withControl(async (client) => {
    const results = [];
    for (const a of bundle.articles) {
      const r = await upsertArticle(client, a, bundle.bundleId ?? "unknown");
      results.push(r);
      log(`[kb]   ${r.action.padEnd(9)} ${r.id} (${r.chunks} chunks)`);
      for (const kind of r.long) {
        log(`[kb]   WARNING ${r.id} chunk "${kind}" may exceed the embedder's 8192-token context and will be TRUNCATED SILENTLY`);
      }
    }
    return { bundleId: bundle.bundleId ?? "unknown", results };
  });
}

/**
 * Embed every chunk that has no embedding, or whose embedding was made by a different model.
 *
 * THE SECOND CONDITION IS THE POINT. A corpus embedded by two models is a corpus where half the
 * vectors are in a different space from the query, and it retrieves confidently and wrongly. Since
 * dev and production embedders are known to differ (see src/kb/embed.js), this is a configuration
 * this project will actually be in, not a hypothetical.
 *
 * @param {{ embedder: any, batchSize?: number, log?: (s: string) => void, reembed?: boolean }} opts
 */
export async function embedPending({ embedder, batchSize = 16, log = () => {}, reembed = false }) {
  let embedded = 0;
  let batches = 0;

  for (;;) {
    // A fresh transaction per batch: a long ingest then does not hold one connection open against
    // the 80-connection ceiling (src/db/pool.js), and a failure keeps the batches already done.
    const more = await withControl(async (client) => {
      const { rows } = await client.query(
        `SELECT id, text FROM control.kb_chunks
          WHERE ${reembed ? "TRUE" : "(embedding IS NULL OR embedding_model IS DISTINCT FROM $2)"}
          ORDER BY id LIMIT $1`,
        reembed ? [batchSize] : [batchSize, embedder.model],
      );
      if (rows.length === 0) return false;

      // Documents get NO prefix. arctic-embed is asymmetric: the query gets `query: ` and the
      // document gets nothing (src/kb/embed.js QUERY_PREFIX). Prefixing both is measurably worse
      // on the model's own card, and it is a silent kind of worse.
      const vectors = await embedder.embed(rows.map((r) => r.text));
      for (let i = 0; i < rows.length; i++) {
        await client.query(
          `UPDATE control.kb_chunks
              SET embedding = $1::vector, embedding_model = $2, embedding_dim = $3
            WHERE id = $4`,
          [toVectorLiteral(vectors[i]), embedder.model, vectors[i].length, rows[i].id],
        );
      }
      embedded += rows.length;
      batches++;
      return true;
    });
    if (!more) break;
    log(`[kb]   embedded ${embedded} chunks`);
  }
  return { embedded, batches, model: embedder.model };
}

/** What is loaded. For the CLI and for the health route. */
export async function corpusStatus() {
  return withControl(async (client) => {
    const { rows: [a] } = await client.query("SELECT count(*)::int AS articles FROM control.kb_articles");
    const { rows: [c] } = await client.query(
      `SELECT count(*)::int AS chunks,
              count(embedding)::int AS embedded,
              count(DISTINCT embedding_model)::int AS models
         FROM control.kb_chunks`,
    );
    const { rows: models } = await client.query(
      "SELECT embedding_model AS model, count(*)::int AS n FROM control.kb_chunks WHERE embedding_model IS NOT NULL GROUP BY 1 ORDER BY 1",
    );
    return { articles: a.articles, chunks: c.chunks, embedded: c.embedded, models };
  });
}
