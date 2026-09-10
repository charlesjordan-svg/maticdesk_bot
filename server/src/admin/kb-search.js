// @ts-check
/**
 * SEARCH THE CORPUS THE WAY THE ASSISTANT SEARCHES IT. The console's Knowledge search (handover
 * §2 Task 2), composed from the SAME exported functions `/v1/ask` and `bin/kb.mjs legs` call.
 *
 * ===============================================================================================
 * WHY THIS FILE EXISTS AT ALL, AND WHY IT COMPOSES RATHER THAN QUERIES
 * ===============================================================================================
 *
 * It writes no SQL. `lexicalLeg`, `semanticLeg` and `fuseRRF` (src/kb/retrieve.js) are the whole
 * of retrieval, and the reason they are three exported functions rather than one is B7a spec §9
 * item 4: **a broken leg inside a fusion returns plausible results in a plausible order.** So this
 * page runs both legs UNFUSED and then the fusion, and shows all three — because when an admin
 * cannot find an article, the useful fact is not "search found nothing", it is WHICH HALF FAILED.
 *
 * If this file ever grows a `SELECT` against `kb_chunks`, the console and the endpoint can disagree
 * about what retrieval is, and the console stops being evidence about the endpoint. Same argument
 * as D224 for tickets. The one query below is for article TITLES, which retrieval does not need
 * and a reader does.
 *
 * ===============================================================================================
 * TWO FUSIONS, ON PURPOSE
 * ===============================================================================================
 *
 * `forModel` is the fusion at `DEFAULT_TOP_K` — literally what `/v1/ask` would hand the model.
 * `fused` is the same fusion uncapped (to `MAX_ROWS`), which is what a person debugging needs: a
 * chunk that placed 6th is invisible to the assistant and is exactly the thing you want to see
 * when the right article is not being cited.
 *
 * ===============================================================================================
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ===============================================================================================
 *
 *   - **Chunk text ONLY for the chunks the model actually receives.** D226, decided by the founder
 *     on 2026-09-09, and decided NARROWER than it was proposed: the text of a chunk that `/v1/ask`
 *     would send is on the page; the text of a chunk that placed below `DEFAULT_TOP_K` is not.
 *     D53 says retrieved chunk text does not leave the hub, and the console is a different reader
 *     (rendered BY the hub, over loopback, to a session-authenticated admin who can already read
 *     every chunk through `bin/kb.mjs`) — but a browser page is screenshot-able in a way a terminal
 *     is not, and the corpus is cross-tenant (D45). The narrowing is what reconciles those: the
 *     sent set is exactly the text that produced (or failed to produce) an answer, which is the
 *     question the screen exists to answer, and it is the smallest disclosure that answers it.
 *
 *     **The guarantee is structural, not editorial.** `sentText` is the ONLY field carrying chunk
 *     text, and it is `null` for every chunk that was not sent — so a page cannot render text for
 *     an unsent chunk by forgetting a condition, because there is no text there to render.
 *     `test/admin-static.test.mjs` §5a asserts that this file assigns it guarded and that no page
 *     reads a chunk's `.text` at all.
 *   - **No threshold, no floor, no "good match" line.** §5.16c: a fused RRF score encodes rank and
 *     leg agreement and carries NO similarity magnitude, so any line drawn across these scores
 *     would be a one-bit test wearing a decimal point. `legScore` on the semantic leg IS a cosine
 *     and is shown as such, on the leg, where it means something.
 *   - **No reranker.** D207. Every ordering here is a floor on what the design can do.
 */
import { withControl } from "../db/pool.js";
import {
  CANDIDATES_PER_LEG, DEFAULT_TOP_K, RRF_K, fuseRRF, lexicalLeg, semanticLeg,
} from "../kb/retrieve.js";

/** How many fused rows the page will draw. A diagnostic, not a result list; 40 is already a lot. */
export const MAX_ROWS = 40;

/**
 * The platform values a search may pre-filter on: `'any'` plus every value
 * `platformFromProbe()` (src/kb/ask.js) can return from a real machine.
 *
 * Offering exactly these is the point. A free-text platform box would let an admin search
 * `windows 11`, get nothing, and conclude the corpus is missing an article — when what happened is
 * that the pre-filter matches a word the probe produces and nothing else (D162, and the
 * `"darwin".includes("win")` trap in register §5.16b).
 */
export const SEARCH_PLATFORMS = Object.freeze(["any", "windows", "macos", "linux"]);

/** `'any'`, or the platform of a real machine. Anything else is refused rather than guessed. */
export function normalisePlatform(value) {
  const p = String(value ?? "any").trim().toLowerCase();
  if (!p || p === "any") return "any";
  return SEARCH_PLATFORMS.includes(p) ? p : null;
}

/**
 * Both legs, unfused, then the fusion, then the article rows a reader needs.
 *
 * @param {{ query: string, platform?: string, embedder?: any|null, log?: (s: string) => void }} opts
 */
export async function searchCorpus({ query, platform = "any", embedder = null, log = () => {} }) {
  const q = String(query ?? "").trim();
  // `'any'` and null mean the same thing to platformClause(): only `platform = 'any'` articles are
  // eligible. Passing the string through keeps the page and the SQL saying the same word.
  const pf = platform === "any" ? null : platform;

  /** @type {{ lexical: any[], semantic: any[], semanticRan: boolean, semanticError: string|null }} */
  const legs = { lexical: [], semantic: [], semanticRan: false, semanticError: null };

  /**
   * HOW MANY CHUNKS THE PRE-FILTER EVEN ALLOWED INTO THE SEARCH, and how many exist. This is the
   * difference between "there is no article about this" and "the article was filtered out before
   * either leg saw it", which is the question an admin is actually asking when a search comes back
   * thin. `'any'` admits `platform = 'any'` ONLY, so searching "any machine" cannot return the
   * Windows reference article — correct (D162) and surprising, so the page says the numbers.
   */
  const scope = { eligible: 0, total: 0 };

  await withControl(async (client) => {
    const { rows: [s] } = await client.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE platform = 'any' OR platform = $1)::int AS eligible
         FROM control.kb_chunks`,
      [pf ?? "any"],
    );
    scope.total = s.total;
    scope.eligible = s.eligible;

    legs.lexical = await lexicalLeg({ query: q, platform: pf, client });
    if (!embedder) {
      legs.semanticError = "no embedding provider is configured on this hub (MATIC_EMBED_PROVIDER)";
      return;
    }
    try {
      const vector = await embedder.embedQuery(q);
      legs.semantic = await semanticLeg({ vector, platform: pf, client });
      legs.semanticRan = true;
    } catch (err) {
      // Exactly the degradation `/v1/ask` has: the lexical leg still answers. The page says so
      // rather than showing a shorter list and letting the reader think the corpus is thin.
      legs.semanticError = err.message;
      log(`[admin] the semantic leg is unavailable, searching lexically only: ${err.message}`);
    }
  });

  const fused = fuseRRF({ lexical: legs.lexical, semantic: legs.semantic, topK: MAX_ROWS });
  const forModel = fuseRRF({ lexical: legs.lexical, semantic: legs.semantic, topK: DEFAULT_TOP_K });
  const forModelChunks = new Set(forModel.map((c) => c.chunkId));

  const articleIds = [...new Set(fused.map((c) => c.articleId))];
  const titles = await articleRows(articleIds);

  // Grouped by article, articles in fused order, chunks in fused order inside each. An admin reads
  // "did the right ARTICLE come back", and a chunk is an implementation detail of that answer.
  const byArticle = articleIds.map((id) => {
    const chunks = fused
      .filter((c) => c.articleId === id)
      .map((c) => {
        const forModel = forModelChunks.has(c.chunkId);
        return {
          chunkId: c.chunkId,
          kind: c.kind,
          weight: c.weight,
          score: c.score,
          lexRank: c.lexRank,
          semRank: c.semRank,
          lexScore: c.lexScore ?? null,
          semScore: c.semScore ?? null,
          bothLegs: c.lexRank !== null && c.semRank !== null,
          forModel,
          // D226, as decided: the text of a SENT chunk, and null for every other chunk. The
          // conditional is here, once, rather than at each render site — see the header.
          sentText: forModel ? c.text : null,
        };
      });
    return {
      articleId: id,
      article: titles.get(id) ?? null,
      chunks,
      bestScore: chunks[0]?.score ?? 0,
      forModel: chunks.some((c) => c.forModel),
    };
  });

  // STRIP `text` FROM EVERYTHING ELSE. `lexicalLeg`/`semanticLeg`/`fuseRRF` return the chunk text on
  // every candidate — up to 20 per leg, most of which were never sent — and D226 covers the sent
  // set only. Removing it here rather than trusting each render site means `sentText` is the ONLY
  // chunk text in this view model, so "the page shows text for an unsent chunk" is not a bug that
  // can be written; there is nothing there to write it from.
  const noText = (c) => { const { text, ...rest } = c; return rest; };

  return {
    query: q,
    platform,
    legs: { ...legs, lexical: legs.lexical.map(noText), semantic: legs.semantic.map(noText) },
    fused: fused.map(noText),
    forModel: forModel.map(noText),
    byArticle,
    scope,
    truncated: fused.length >= MAX_ROWS,
    params: { rrfK: RRF_K, candidatesPerLeg: CANDIDATES_PER_LEG, topK: DEFAULT_TOP_K, maxRows: MAX_ROWS },
    embedder: embedder ? { name: embedder.name, model: embedder.model } : null,
  };
}

/**
 * Titles and fields for the articles a search hit. NOT chunk text: this reads the columns the
 * Knowledge page already lists.
 *
 * @param {string[]} ids
 */
async function articleRows(ids) {
  /** @type {Map<string, { id: string, title: string, type: string, platform: string, category: string|null, lifecycle: string|null }>} */
  const map = new Map();
  if (!ids.length) return map;
  await withControl(async (c) => {
    const { rows } = await c.query(
      "SELECT id, title, type, platform, category, lifecycle FROM control.kb_articles WHERE id = ANY($1)",
      [ids],
    );
    for (const r of rows) {
      map.set(r.id, { id: r.id, title: r.title, type: r.type, platform: r.platform, category: r.category, lifecycle: r.lifecycle });
    }
  });
  return map;
}
