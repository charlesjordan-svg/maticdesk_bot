// @ts-check
/**
 * Hybrid retrieval: two legs, fused. B7a (2026-09-04). D167-D192, ratified as a set 2026-09-04.
 *
 * EACH LEG IS A SEPARATE EXPORTED FUNCTION, AND THAT IS A REQUIREMENT RATHER THAN TIDINESS.
 * B7a spec §9 item 4: "Test each leg alone before fusing — a broken leg inside a fusion is very
 * hard to see." A fusion of one working leg and one dead leg returns plausible results in a
 * plausible order and looks like a working system. So `lexicalLeg` and `semanticLeg` are callable
 * and tested on their own, and `retrieve` only combines them.
 *
 * THE PRE-FILTER IS INSIDE EACH LEG, NOT AFTER FUSION (D162).
 * Filtering after retrieval still lets a macOS article consume one of the 3-5 slots and compete for
 * rank. Both legs therefore take the platform and apply it in SQL.
 *
 * WHAT IS UNMEASURED HERE, AND ALL OF IT IS:
 *   - `RRF_K = 60`. The convention is UNRETRIEVED (register §5.11c, §10.2). It is a convention we
 *     read somewhere, not a figure from a paper we have.
 *   - `KIND_WEIGHTS` (src/kb/chunk.js). Reasoned from "users describe problems, not fixes".
 *   - `CANDIDATES_PER_LEG = 20`.
 *   - THE RELEVANCE FLOOR IS DELIBERATELY UNSET. See `RELEVANCE_FLOOR` below.
 *   - **There is no cross-encoder reranker** (B7a spec §7, register §10.2, review A1). Any number
 *     this file produces is a FLOOR on retrieval quality, not a measurement of the design, and that
 *     caveat must travel with it.
 */
import { withControl } from "../db/pool.js";
import { toVectorLiteral } from "./embed.js";

/**
 * RRF's constant. `score = sum over legs of weight / (k + rank)`.
 *
 * Chosen because RRF needs no score normalisation: a BM25-ish `ts_rank` and a cosine distance are
 * not on a comparable scale and never will be, and rank is the only thing they share.
 *
 * `k = 60` is `[VERIFY]` — the convention is unretrieved. What k controls is how much a top rank
 * beats a mid rank: smaller k is sharper. With six articles it barely matters; with a real corpus
 * it will, and it should be measured then rather than inherited from a comment.
 */
export const RRF_K = 60;

/** How many candidates each leg contributes before fusion. Unmeasured. */
export const CANDIDATES_PER_LEG = 20;

/** How many fused chunks reach the model. B7a spec §5: "Top 3-5 chunks". */
export const DEFAULT_TOP_K = 5;

/**
 * THE RELEVANCE FLOOR IS UNSET, ON PURPOSE, AND `null` IS THE HONEST VALUE.
 *
 * B7a spec §2: "Threshold is a value to be set by measurement, not guessed; record it as unset until
 * then." Any number here would be invented, and an invented floor is worse than none, because a
 * floor that is too low silently disables the decline behaviour that is B7a's primary acceptance
 * test, and one that is too high silently disables retrieval. Either failure looks like the system
 * working.
 *
 * **With the floor unset, the DECLINE IS ENFORCED BY THE PROMPT ALONE** (src/kb/answer.js) and by
 * the `answered: false` branch of the answer schema. That is the lever the bake-off actually
 * measured — `whenNotToUse` moved every model — and it is load-bearing until a floor exists.
 *
 * ---------------------------------------------------------------------------------------------
 * IT STAYS `null`, AND THIS IS NO LONGER A DEFERRAL. `bin/kb-floor.mjs` RAN, 2026-09-04.
 *
 * **A FLOOR OVER FUSED RRF SCORES CANNOT WORK, BY CONSTRUCTION.** Not because the corpus is small —
 * because of what RRF is.
 *
 * Every top score the run produced was one of exactly five values:
 *
 *     2/61 = 0.032787   the top chunk was found by BOTH legs, at rank 1 in each
 *     1/61 = 0.016393   one leg only, rank 1
 *     1/62 = 0.016129   one leg only, rank 2
 *     1/63 = 0.015873   one leg only, rank 3
 *     1/64 = 0.015625   one leg only, rank 4
 *
 * That is the whole range, and it is arithmetic rather than a distribution. **The fused score is a
 * function of RANK AND LEG AGREEMENT ONLY.** It carries no similarity magnitude at all, because the
 * rank transform threw the magnitude away — which is RRF's *selling point* (no score normalisation
 * between a `ts_rank` and a cosine) and is exactly the information a relevance floor needs.
 *
 * **The two distributions therefore overlap, and they overlap for a reason that will not go away
 * with more articles.** The semantic leg returned ALL 18 chunks for every query, covered or not —
 * a dense leg has no notion of "no match" — so an uncovered question's nearest neighbour lands at
 * semantic rank 1 and scores `1/61`, which is *identical* to a covered question whose phrasing
 * shares no terms with the article ("everyone sounds choppy on video calls", "wifi keeps cutting out
 * when I work from home" — both `1/61`, both correctly retrieved).
 *
 * So a threshold over this score is really asking **"did the lexical leg agree?"** — a one-bit test
 * wearing a decimal point.
 *
 * **IF A RELEVANCE SIGNAL IS EVER WANTED, THESE ARE THE TWO CANDIDATES, AND NEITHER IS THIS
 * CONSTANT:**
 *
 *   1. **Threshold the raw semantic similarity BEFORE fusion.** `semanticLeg` returns `legScore` as
 *      a cosine in [-1, 1] — real magnitude, not a rank. That is where a floor belongs if anywhere,
 *      and it needs its own measurement.
 *   2. **Use leg agreement as an explicit signal.** `lexRank !== null && semRank !== null` is
 *      already computed and is the honest form of what a fused-score floor would be approximating.
 *
 * Both are new mechanisms rather than a value for this constant, so both need a decision. Until
 * then the prompt carries the decline, and the live results say it does so successfully (5/5 on the
 * uncovered set and 5/5 when handed a relevant-looking article that does not answer the question).
 *
 * **Caveat on the numbers above:** 20 questions I chose myself, 6 articles, no reranker. The
 * *distribution* is a sample and not a measurement. **The mechanism is not a sample** — `2/61` and
 * `1/(60+rank)` are what the formula computes, and a cross-encoder reranker would change the
 * ordering without giving this constant a magnitude to threshold.
 * ---------------------------------------------------------------------------------------------
 */
export const RELEVANCE_FLOOR = null;

/**
 * HOW a retrieval ran — recorded on every log row since migration control/005 (D236, 2026-09-10).
 *
 * The hub always knew this at query time (`legs` below has said which legs ran since B7a) and wrote
 * none of it down, so a decline made with the embedder down was indistinguishable in the review
 * queue from a real gap, and D227 logs every decline. The review queue's badge counts `hybrid`
 * declines ONLY; the others are shown and flagged.
 *
 *   hybrid       both legs ran — the only mode a decline can be called a gap under
 *   lexicalOnly  the semantic leg did not run (no embedder configured, or it failed on this call)
 *   emptyCorpus  no chunk was eligible for this platform — nothing to retrieve from at all
 *   unavailable  retrieve() itself threw (the database, most likely) — no legs ran
 */
export const RETRIEVAL_MODES = Object.freeze(["hybrid", "lexicalOnly", "emptyCorpus", "unavailable"]);

/**
 * Classify a retrieval. PURE, so test/kb-static.test.mjs pins every branch with no database.
 *
 * Order matters and is the honest one: a failed retrieval is `unavailable` whatever else is true;
 * an empty corpus is `emptyCorpus` even if the embedder was also down, because "nothing to search"
 * is the more fundamental fact and the one the admin has to fix first; only then does the leg
 * question arise.
 *
 * @param {{ result?: { legs?: { lexical?: boolean, semantic?: boolean }, eligibleChunks?: number|null }|null, error?: string|null }} p
 * @returns {"hybrid"|"lexicalOnly"|"emptyCorpus"|"unavailable"}
 */
export function retrievalModeOf({ result = null, error = null } = {}) {
  if (error || !result) return "unavailable";
  if (result.eligibleChunks === 0) return "emptyCorpus";
  if (!result.legs?.semantic) return "lexicalOnly";
  return "hybrid";
}

/**
 * @typedef {object} Candidate
 * @property {number} chunkId
 * @property {string} articleId
 * @property {string} kind
 * @property {string} text
 * @property {number} weight
 * @property {number} rank      1-based, within this leg
 * @property {number} legScore  the leg's own raw score. NOT comparable across legs.
 */

/**
 * Platform pre-filter as a SQL fragment. `'any'` articles are always eligible; a machine's platform
 * additionally admits articles for that platform and nothing else.
 *
 * A null/unknown platform admits `'any'` only — the conservative direction. An unknown platform
 * admitting everything would let a macOS article reach a Windows user because the probe failed,
 * which is the failure mode D162's pre-filter exists to prevent.
 *
 * @param {string|null|undefined} platform
 */
function platformClause(platform) {
  const p = typeof platform === "string" ? platform.trim().toLowerCase() : "";
  if (!p || p === "any") return { sql: "c.platform = 'any'", params: [] };
  return { sql: "(c.platform = 'any' OR c.platform = $PLATFORM)", params: [p] };
}

/**
 * LEXICAL LEG. `tsquery` against the generated `tsvector`, GIN indexed.
 *
 * **This is the leg that finds `0x80070005` and `DisplayLink`**, which dense embedding fails on:
 * a token the embedder never saw in training has no meaningful position in the vector space, and a
 * product name is exactly that. It is why the design is hybrid rather than "just use pgvector".
 *
 * `websearch_to_tsquery` rather than `plainto_tsquery`: it accepts quoted phrases and `-exclusions`
 * the way a user expects, and it never throws on punctuation — `plainto_tsquery` is fine but
 * `to_tsquery` would raise a syntax error on a sentence, which is a 500 on a user's question.
 *
 * @param {{ query: string, platform?: string|null, limit?: number, client?: any }} opts
 * @returns {Promise<Candidate[]>}
 */
export async function lexicalLeg({ query, platform, limit = CANDIDATES_PER_LEG, client }) {
  const pf = platformClause(platform);
  const params = [query, limit, ...pf.params];
  const sql = `
    SELECT c.id, c.article_id, c.kind, c.text, c.weight,
           ts_rank(c.tsv, websearch_to_tsquery('english', $1)) AS leg_score
      FROM control.kb_chunks c
     WHERE c.tsv @@ websearch_to_tsquery('english', $1)
       AND ${pf.sql.replace("$PLATFORM", "$3")}
     ORDER BY leg_score DESC, c.id
     LIMIT $2`;

  const run = async (cl) => (await cl.query(sql, params)).rows;
  const rows = client ? await run(client) : await withControl(run);
  return rows.map((r, i) => ({
    chunkId: Number(r.id),
    articleId: r.article_id,
    kind: r.kind,
    text: r.text,
    weight: Number(r.weight),
    rank: i + 1,
    legScore: Number(r.leg_score),
  }));
}

/**
 * SEMANTIC LEG. pgvector cosine distance, HNSW indexed.
 *
 * Takes a vector rather than a string: embedding is the caller's job, so this leg is testable with
 * a fixed vector and no embedder running, and so the query prefix (`query: `, which arctic was
 * trained with) is applied in exactly one place (src/kb/embed.js).
 *
 * Chunks with no embedding are excluded rather than treated as distant. A NULL embedding means
 * "not embedded yet", which is a different fact from "embedded and unrelated", and pgvector would
 * happily sort NULLs somewhere.
 *
 * `legScore` is SIMILARITY (1 - distance), so that higher is better in both legs. Fusion only uses
 * rank, but a human reading a retrieval log should not have to remember which column is inverted.
 *
 * @param {{ vector: number[], platform?: string|null, limit?: number, client?: any }} opts
 * @returns {Promise<Candidate[]>}
 */
export async function semanticLeg({ vector, platform, limit = CANDIDATES_PER_LEG, client }) {
  const pf = platformClause(platform);
  const lit = toVectorLiteral(vector);
  const params = [lit, limit, ...pf.params];
  const sql = `
    SELECT c.id, c.article_id, c.kind, c.text, c.weight,
           1 - (c.embedding <=> $1::vector) AS leg_score
      FROM control.kb_chunks c
     WHERE c.embedding IS NOT NULL
       AND ${pf.sql.replace("$PLATFORM", "$3")}
     ORDER BY c.embedding <=> $1::vector, c.id
     LIMIT $2`;

  const run = async (cl) => (await cl.query(sql, params)).rows;
  const rows = client ? await run(client) : await withControl(run);
  return rows.map((r, i) => ({
    chunkId: Number(r.id),
    articleId: r.article_id,
    kind: r.kind,
    text: r.text,
    weight: Number(r.weight),
    rank: i + 1,
    legScore: Number(r.leg_score),
  }));
}

/**
 * RECIPROCAL RANK FUSION. `score = sum over legs of (weight / (RRF_K + rank))`.
 *
 * The kind weight multiplies each leg's contribution, so a `symptoms` chunk at rank 3 can outrank a
 * `guidance` chunk at rank 2. That is the "weight title and symptoms above guidance" instruction
 * (B7a spec §5) implemented where it belongs: after both legs have ranked independently.
 *
 * A chunk found by BOTH legs gets both terms, which is the property that makes hybrid work — the
 * dock article matching both "DisplayLink" lexically and "monitors not working" semantically ends
 * up above something that matched only one.
 *
 * PURE FUNCTION, NO DATABASE. Every fusion property is therefore testable with no server running,
 * which is most of what `test/kb-static.test.mjs` checks.
 *
 * @param {{ lexical?: Candidate[], semantic?: Candidate[], k?: number, topK?: number }} opts
 * @returns {Array<Candidate & { score: number, lexRank: number|null, semRank: number|null }>}
 */
export function fuseRRF({ lexical = [], semantic = [], k = RRF_K, topK = DEFAULT_TOP_K }) {
  /** @type {Map<number, any>} */
  const byChunk = new Map();

  const add = (cands, legName) => {
    for (const c of cands) {
      let row = byChunk.get(c.chunkId);
      if (!row) {
        row = { ...c, score: 0, lexRank: null, semRank: null };
        delete row.rank;
        delete row.legScore;
        byChunk.set(c.chunkId, row);
      }
      row[legName === "lexical" ? "lexRank" : "semRank"] = c.rank;
      row[legName === "lexical" ? "lexScore" : "semScore"] = c.legScore;
      row.score += (c.weight ?? 1) / (k + c.rank);
    }
  };
  add(lexical, "lexical");
  add(semantic, "semantic");

  return [...byChunk.values()]
    // Tie-break on chunkId so the order is deterministic. Two chunks with identical scores in a
    // nondeterministic order make a test flaky in a way that looks like a retrieval bug.
    .sort((a, b) => b.score - a.score || a.chunkId - b.chunkId)
    .slice(0, topK);
}

/**
 * The whole read path: both legs, fused, with the article rows the model needs.
 *
 * DEGRADED MODES ARE FIRST-CLASS AND REPORTED, NOT SILENT. `legs` in the result says which legs
 * actually ran. Three real configurations reach this function:
 *   - both legs (normal)
 *   - lexical only (MATIC_EMBED_PROVIDER=none, or the embedder is down — B7a spec §6)
 *   - neither (the corpus is empty; a turn must still complete — acceptance item 7)
 * A caller that does not look at `legs` and reports a retrieval quality number is reporting a
 * number from an unknown pipeline.
 *
 * @param {{
 *   query: string,
 *   platform?: string|null,
 *   topK?: number,
 *   embedder?: { embedQuery: (t: string) => Promise<number[]> } | null,
 *   floor?: number|null,
 *   log?: (s: string) => void,
 * }} opts
 */
export async function retrieve({ query, platform, topK = DEFAULT_TOP_K, embedder = null, floor = RELEVANCE_FLOOR, log = () => {} }) {
  /** @type {{ lexical: boolean, semantic: boolean, semanticError: string|null }} */
  const legs = { lexical: false, semantic: false, semanticError: null };

  return withControl(async (client) => {
    // HOW MANY CHUNKS THE PRE-FILTER EVEN ADMITTED. Zero is `emptyCorpus` (D236): a decline over
    // nothing is not a gap in the corpus, it is the absence of one, and the two used to log
    // identically. Same shape as the console's search-scope count (src/admin/kb-search.js), and the
    // same platform rule: `'any'` admits `platform = 'any'` only.
    const pf = typeof platform === "string" && platform.trim() && platform.trim().toLowerCase() !== "any" ? platform.trim().toLowerCase() : "any";
    const { rows: [scope] } = await client.query(
      "SELECT count(*) FILTER (WHERE platform = 'any' OR platform = $1)::int AS eligible FROM control.kb_chunks",
      [pf],
    );
    const eligibleChunks = Number(scope.eligible);

    const lexical = await lexicalLeg({ query, platform, client });
    legs.lexical = true;

    /** @type {Candidate[]} */
    let semantic = [];
    if (embedder) {
      try {
        const vector = await embedder.embedQuery(query);
        semantic = await semanticLeg({ vector, platform, client });
        legs.semantic = true;
      } catch (err) {
        // The semantic leg failing is a DEGRADED MODE, not an error. The lexical leg still
        // answers, and the endpoint's alternative is no answer at all.
        legs.semanticError = err.message;
        log(`[kb] the semantic leg is unavailable, retrieving lexically only: ${err.message}`);
      }
    }

    const fused = fuseRRF({ lexical, semantic, topK });
    const topScore = fused.length ? fused[0].score : 0;

    // The floor, when one exists. With `floor === null` this branch never fires and the decline is
    // the prompt's job alone — see RELEVANCE_FLOOR above.
    const floorApplied = floor !== null && floor !== undefined && fused.length > 0 && topScore < floor;
    const chunks = floorApplied ? [] : fused;
    if (floorApplied) log(`[kb] relevance floor ${floor} suppressed ${fused.length} chunks (top score ${topScore.toFixed(5)})`);

    // The articles the surviving chunks came from, for citation and for the constraint fields
    // (`escalateWhen`, `doNotAttempt`) that are deliberately not chunked.
    const articleIds = [...new Set(chunks.map((c) => c.articleId))];
    /** @type {any[]} */
    let articles = [];
    if (articleIds.length) {
      const { rows } = await client.query(
        `SELECT id, type, title, platform, problem, cause, escalate_when, do_not_attempt, lifecycle
           FROM control.kb_articles WHERE id = ANY($1)`,
        [articleIds],
      );
      // Preserve retrieval order rather than the database's.
      articles = articleIds.map((id) => rows.find((r) => r.id === id)).filter(Boolean);
    }

    return { chunks, articles, legs, topScore, floorApplied, floor, eligibleChunks, candidates: { lexical: lexical.length, semantic: semantic.length } };
  });
}

/**
 * Write one retrieval log row (D166, Phase 1 plan C4). Separate from the outcome, on purpose:
 * a retrieval miss and a reasoning miss have different fixes, and without the split a bad answer
 * is just a bad answer.
 *
 * The user's sentence is stored ONLY when MATIC_KB_LOG_QUERIES=1 (`questionLoggingEnabled()`). A
 * hub-side table of what employees typed is the transcript-access problem D154 exists to constrain.
 * B7a had no admin model, no tenancy and no retention policy to constrain it with; the admin model
 * arrived with B2 (D223 says who may read a logged question) and the retention policy is D229,
 * ratified 2026-09-09: text is kept QUESTION_RETENTION_DAYS and then cleared, the row staying so the
 * counts do not move. THE SWEEP RUNS HERE, inside every write, so retention is a property of
 * logging rather than of a job somebody remembers to schedule — the control plane has no worker
 * loop, and "we will prune later" is how a log becomes permanent by default. `node bin/kb.mjs
 * prune-questions` is the manual form of the same statement.
 *
 * `mode` is the retrieval mode (D236, `retrievalModeOf`) and is REQUIRED from the caller rather than
 * recomputed here, because the caller is the one that saw the error: a `result` that arrived means
 * retrieval ran, and only ask.js knows whether it did. `sessionId` is the endpoint's session (D237),
 * a bare uuid or null, validated by the route before it gets here.
 *
 * @param {{
 *   query: string, platform?: string|null, tenantLabel?: string|null,
 *   result: { chunks: any[], topScore: number, floorApplied: boolean },
 *   cited?: string[], answered?: boolean|null, model?: string|null, client?: any,
 *   mode: "hybrid"|"lexicalOnly"|"emptyCorpus"|"unavailable", sessionId?: string|null,
 * }} opts
 */
/**
 * The ceiling on how long a logged question may be kept, in days (D229). Configurable DOWNWARD
 * only: a customer-hosted hub may keep less, never more, and there is no "forever" value.
 */
export const QUESTION_RETENTION_MAX_DAYS = 90;

/**
 * How many days a logged question is kept before its text is cleared (D229). Default and maximum
 * 90; `MATIC_KB_QUESTION_RETENTION_DAYS` lowers it; a value above the maximum is held at the
 * maximum (and src/index.js says so at startup); 0 means "log no text at all".
 */
export function questionRetentionDays() {
  const raw = process.env.MATIC_KB_QUESTION_RETENTION_DAYS;
  if (raw === undefined || raw === "") return QUESTION_RETENTION_MAX_DAYS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return QUESTION_RETENTION_MAX_DAYS;
  return Math.min(n, QUESTION_RETENTION_MAX_DAYS);
}

/** Is the user's sentence being stored? MATIC_KB_LOG_QUERIES=1 AND a retention window above zero. */
export function questionLoggingEnabled() {
  return process.env.MATIC_KB_LOG_QUERIES === "1" && questionRetentionDays() > 0;
}

/**
 * Clear question text older than the retention window. The ROW stays — the fact that a question
 * was asked, what was retrieved and whether it was answered are what Metrics and the review queue
 * count; only the sentence expires. Returns how many rows were cleared.
 *
 * @param {{ client?: any, days?: number }} [opts]
 * @returns {Promise<number>}
 */
export async function pruneQuestionText({ client, days = questionRetentionDays() } = {}) {
  const sql = `
    UPDATE control.kb_retrieval_log
       SET query_text = NULL
     WHERE query_text IS NOT NULL
       AND at < now() - ($1 || ' days')::interval`;
  const run = async (cl) => (await cl.query(sql, [String(Math.max(0, Math.floor(days)))])).rowCount ?? 0;
  return client ? run(client) : withControl(run);
}

export async function logRetrieval({ query, platform, tenantLabel = null, result, cited = [], answered = null, model = null, client, mode, sessionId = null }) {
  if (!RETRIEVAL_MODES.includes(mode)) {
    // A row without a mode is the row that produced the false-gap problem. Refuse to write one
    // rather than default it: a default here is a claim about a retrieval nobody looked at.
    throw new Error(`logRetrieval: mode must be one of ${RETRIEVAL_MODES.join(", ")} (got ${JSON.stringify(mode)})`);
  }
  const keepQuery = questionLoggingEnabled();
  const retrieved = (result?.chunks ?? []).map((c) => ({
    chunkId: c.chunkId, articleId: c.articleId, kind: c.kind,
    lexRank: c.lexRank ?? null, semRank: c.semRank ?? null,
    score: Number(c.score.toFixed(6)),
  }));
  const params = [
    tenantLabel,
    keepQuery ? query : null,
    platform ?? null,
    JSON.stringify(retrieved),
    result?.topScore ?? 0,
    result?.floorApplied ?? false,
    cited,
    answered,
    model,
    mode,
    sessionId,
  ];
  const sql = `
    INSERT INTO control.kb_retrieval_log
      (tenant_label, query_text, platform, retrieved, top_score, floor_applied, cited, answered, model, retrieval_mode, session_id)
    VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id`;
  const run = async (cl) => {
    const id = Number((await cl.query(sql, params)).rows[0].id);
    // D229: every write sweeps. Same client, same transaction, so a row can never be written by a
    // process that has forgotten to prune — the sweep is not optional and not scheduled.
    if (keepQuery) await pruneQuestionText({ client: cl });
    return id;
  };
  return client ? run(client) : withControl(run);
}
