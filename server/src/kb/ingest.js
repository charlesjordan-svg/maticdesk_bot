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
 * The platform values the pre-filter can ever match, and therefore the only ones an article may
 * carry if it is to be retrievable at all.
 *
 * `'any'` plus whatever `platformFromProbe()` (src/kb/ask.js) can return. This list is here rather
 * than in ask.js because it is a property of the CORPUS — an article stamped `windows 11` or `win`
 * is written, indexed, embedded, and then **matched by nothing**, because `platformClause()`
 * compares the column to `'any'` or to the probe's exact word. That failure is invisible: the
 * article is on the Knowledge page, `kb:status` counts it, and retrieval never returns it.
 * `bundleWarnings()` below is what makes it visible; migration 002 has no CHECK for it, and adding
 * one would be a migration and a decision rather than a report.
 */
export const RETRIEVABLE_PLATFORMS = Object.freeze(["any", "windows", "macos", "linux"]);

/**
 * Shape-check a bundle that is already parsed text. Refuses rather than ingesting half of it: a
 * partial corpus is the state in which retrieval quietly misses articles that a reader believes
 * are loaded. **Every rule here is checked before anything is written** — exercised 2026-09-09
 * against a bundle whose SECOND article had a bad `type`, and nothing landed.
 *
 * `label` names the source in every message. A path for the CLI, "pasted bundle" for the console:
 * the console has no path, and an error reading `undefined: duplicate article id` is a worse
 * message than the rule it is reporting.
 *
 * @param {string} text
 * @param {string} [label]
 */
export function parseBundle(text, label = "bundle") {
  let bundle;
  try {
    bundle = JSON.parse(text);
  } catch (err) {
    // JSON.parse's message names the character position, which is the useful half; the label says
    // which document it was counting in.
    throw new Error(`${label}: not valid JSON — ${err.message}`);
  }
  if (bundle === null || typeof bundle !== "object" || Array.isArray(bundle)) {
    throw new Error(`${label}: the top level must be a JSON object with an "articles" array`);
  }
  if (!Array.isArray(bundle.articles) || bundle.articles.length === 0) {
    throw new Error(`${label}: no articles array`);
  }
  const seen = new Set();
  for (const a of bundle.articles) {
    if (a === null || typeof a !== "object") throw new Error(`${label}: an entry in "articles" is not an object`);
    if (typeof a.id !== "string" || !a.id.trim()) throw new Error(`${label}: an article has no id`);
    if (seen.has(a.id)) throw new Error(`${label}: duplicate article id "${a.id}"`);
    seen.add(a.id);
    if (a.type !== "troubleshooting" && a.type !== "reference") {
      throw new Error(`${label}: article "${a.id}" has type "${a.type}"; migration 002 allows troubleshooting | reference`);
    }
    if (typeof a.title !== "string" || !a.title.trim()) throw new Error(`${label}: article "${a.id}" has no title`);
  }
  return bundle;
}

/**
 * Read and shape-check a bundle from disk.
 *
 * @param {string} path
 */
export function readBundle(path) {
  return parseBundle(readFileSync(path, "utf8"), path);
}

/**
 * What is WRONG BUT NOT REFUSED about a bundle, as sentences. Not a validation layer: every item
 * here is legal against migration 002 and would be written without complaint, and every item makes
 * an article less retrievable than the person pasting it believes.
 *
 * A warning rather than a refusal because each one is a schema decision if enforced. Saying it at
 * the moment of ingest is the cheap half, and the moment of ingest is when somebody is looking.
 *
 * @param {{ articles: any[] }} bundle
 * @returns {string[]}
 */
export function bundleWarnings(bundle) {
  const out = [];
  for (const a of bundle.articles) {
    const platform = String(a.platform ?? "any").toLowerCase();
    if (!RETRIEVABLE_PLATFORMS.includes(platform)) {
      out.push(`"${a.id}" has platform "${a.platform}". The pre-filter (D162) matches ${RETRIEVABLE_PLATFORMS.join(", ")} and nothing else, so this article will be stored, indexed, embedded and RETRIEVED BY NOTHING.`);
    }
    const hasProse = [a.problem, a.cause, a.body].some((v) => typeof v === "string" && v.trim());
    const hasList = [a.symptoms, a.guidance].some((v) => Array.isArray(v) && v.length);
    if (!hasProse && !hasList) {
      out.push(`"${a.id}" has no problem, cause, body, symptoms or guidance. It will chunk to its title alone.`);
    }
  }
  return out;
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
 * Takes EITHER a `path` (the CLI) or an already-parsed `bundle` (the console, which has a textarea
 * and no file). Both go through the same `parseBundle()` rules; the split is only about where the
 * text came from.
 *
 * @param {{ path?: string, bundle?: any, label?: string, log?: (s: string) => void }} opts
 */
export async function ingestBundle({ path, bundle: parsed, label, log = () => {} }) {
  if (!path && !parsed) throw new Error("ingestBundle needs a path or a parsed bundle");
  const bundle = parsed ?? readBundle(path);
  const source = label ?? path ?? "bundle";
  log(`[kb] ${source}: bundle ${bundle.bundleId ?? "(unnamed)"}, ${bundle.articles.length} articles`);

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
    return { bundleId: bundle.bundleId ?? "unknown", results, warnings: bundleWarnings(bundle) };
  });
}

/**
 * WOULD EMBEDDING WITH `model` PUT TWO MODELS IN THE CORPUS? A pure function over
 * `corpusStatus()`, so the answer is testable with no database and the same answer is given to the
 * CLI and to the console.
 *
 * CLAUDE.md's Never list: "Embed a corpus with two different models." Vectors from two models are
 * in two spaces, so retrieval is confidently wrong for part of the corpus and nothing about the
 * result looks wrong. `embedPending()` on its own would in fact converge — its WHERE clause picks
 * up every chunk whose model differs — but it converges one BATCH at a time, so an interrupted run
 * leaves the mixed state, and "the fix happens to be the same call" is not a reason to let a
 * browser form start it. `node bin/kb.mjs reembed` is the deliberate way to change models.
 *
 * @param {{ models: Array<{ model: string, n: number }> }} status
 * @param {string} model
 * @returns {null | { reason: string, present: string[], model: string }}
 */
export function embeddingModelConflict(status, model) {
  const present = (status.models ?? []).map((m) => m.model);
  if (present.length === 0) return null;
  if (present.length === 1 && present[0] === model) return null;
  const reason = present.length > 1
    ? `the corpus already holds ${present.length} embedding models (${present.join(", ")}), which is the broken state itself`
    : `the corpus is embedded by ${present[0]} and this hub's embedder is ${model}`;
  return {
    reason: `${reason}. Vectors from two models are in two different spaces, so retrieval would be confidently wrong for part of the corpus. The articles and chunks are written; the embedding step is refused. Fix from server/: node bin/kb.mjs reembed`,
    present,
    model,
  };
}

/**
 * ONE INGEST, FOR BOTH CALLERS: validate, write, refuse a second embedding model, embed, report.
 *
 * The console (POST /admin/knowledge/ingest) and the CLI (`node bin/kb.mjs ingest`) call THIS, for
 * the same reason the console and the CLI share one ticket query layer (D224): when the browser is
 * doubted the terminal is what gets trusted, and that only proves something if the two cannot
 * disagree. Every number the console reports is a number this function returned.
 *
 * THE EMBED STEP IS ALLOWED TO FAIL AND THE INGEST STILL SUCCEEDS. That is not leniency, it is the
 * degradation the hub already has: chunks land with `embedding NULL`, the lexical leg still
 * retrieves them, and `node bin/kb.mjs embed` finishes the job. The report says which happened.
 *
 * @param {{ path?: string, bundle?: any, label?: string, embedder?: any|null, log?: (s: string) => void }} opts
 */
export async function ingestAndEmbed({ path, bundle, label, embedder = null, log = () => {} }) {
  const ingested = await ingestBundle({ path, bundle, label, log });
  const articles = { inserted: 0, updated: 0, unchanged: 0 };
  // TWO CHUNK COUNTS, BECAUSE ONE OF THEM LIED. `upsertArticle` reports an UNCHANGED article's
  // EXISTING chunk count — correct for "how big is this article" and wrong for "what did this
  // action do". A re-ingest of an unchanged bundle reported "5 chunks written" beside "0 inserted,
  // 0 updated" (seen 2026-09-09, before this split). `chunksWritten` counts only the articles that
  // were actually rewritten; `chunksInBundle` is the whole bundle's size.
  let chunksWritten = 0;
  let chunksInBundle = 0;
  for (const r of ingested.results) {
    articles[r.action] += 1;
    chunksInBundle += r.chunks;
    if (r.action !== "unchanged") chunksWritten += r.chunks;
  }

  // Read the corpus AFTER writing: an updated article's chunks were deleted and rebuilt, so its
  // old vectors are gone and the set of models present can have SHRUNK. Checking before the write
  // would refuse on a model that no longer exists.
  const afterWrite = await corpusStatus();
  /** @type {{ embedded: number, batches: number, model: string|null, refused: null|{reason:string,present:string[],model:string}, error: string|null }} */
  const embed = { embedded: 0, batches: 0, model: embedder?.model ?? null, refused: null, error: null };

  if (!embedder) {
    embed.error = "no embedder is configured or available";
  } else {
    embed.refused = embeddingModelConflict(afterWrite, embedder.model);
    if (!embed.refused) {
      try {
        const r = await embedPending({ embedder, log });
        embed.embedded = r.embedded;
        embed.batches = r.batches;
      } catch (err) {
        // The embedder going down mid-ingest is the case the two-pass design exists for.
        embed.error = err.message;
        log(`[kb] embedding failed after a successful ingest; the chunks retrieve lexically only: ${err.message}`);
      }
    }
  }

  return {
    bundleId: ingested.bundleId,
    results: ingested.results,
    warnings: ingested.warnings,
    articles,
    chunksWritten,
    chunksInBundle,
    embed,
    status: await corpusStatus(),
  };
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
