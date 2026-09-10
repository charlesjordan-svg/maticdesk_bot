// @ts-check
/**
 * What the hub can say about its own retrieval right now — and the ONE place that says it (D236).
 *
 * ===============================================================================================
 * THE THIRD INSTANCE OF INFORMATION EXISTING AND THE SURFACE NOT USING IT
 * ===============================================================================================
 *
 * On 2026-09-10 the running hub's `/v1/health` reported `embedder: none` for a whole session while
 * Ollama had the embed model loaded, so every question was retrieved on the lexical leg alone and
 * every decline landed in the review queue as a gap. Nothing read the field. The launcher checks
 * the embedder at START and the hub prints a banner at START, and after that the state is nobody's.
 *
 * And `/v1/health` was reporting a CLAIM, not a fact: `embedder.name`/`.model` come from the
 * constructor, so a configured embedder whose Ollama had lost the model would still have shown as
 * present. `verify()` was the fact and it ran once, at startup.
 *
 * This module runs `verify()` on demand with a short cache, and computes the retrieval MODE the hub
 * would use for a question asked now — the same vocabulary the log rows carry (retrievalModeOf). Two
 * surfaces read it: `GET /v1/health` (so the endpoint's HubLink and a person with curl see the
 * truth) and the admin console (a banner on every page while retrieval is degraded, and the Metrics
 * page). Both read THIS function, so they cannot disagree.
 *
 * THE CACHE IS THE COST OF READING THE TRUTH EVERY TIME. `verify()` embeds one short string. A fleet
 * of endpoints probing /v1/health every 60 s ± 15 s (HubLink) would embed once per probe per
 * endpoint; the cache bounds that to once per TTL per hub. 20 s is short enough that a recovered
 * embedder is seen within a probe interval and long enough that a console page load costs nothing.
 * Unmeasured, like every other interval in this project (D115 stands).
 */
import { retrievalModeOf } from "./retrieve.js";
import { corpusStatus } from "./ingest.js";

export const HEALTH_CACHE_MS = 20_000;

/**
 * Build the health reader for one embedder instance.
 *
 * `readCorpus` defaults to the real `corpusStatus()` and is injectable so test/admin.test.mjs can pin
 * every mode without a database: the mode logic is the part worth a test, the query is B7a's.
 *
 * @param {{ embedder: any|null, kb?: boolean, now?: () => number, cacheMs?: number, readCorpus?: () => Promise<any> }} deps
 * @returns {() => Promise<{
 *   embedder: null | { name: string, model: string, dimensions: number, available: boolean, error: string|null, checkedAt: string },
 *   corpus: null | { articles?: number, chunks?: number, embedded?: number, models?: any[], error?: string },
 *   mode: "hybrid"|"lexicalOnly"|"emptyCorpus"|"unavailable",
 *   degraded: boolean,
 *   why: string|null,
 * }>}
 */
export function retrievalHealthReader({ embedder, kb = true, now = () => Date.now(), cacheMs = HEALTH_CACHE_MS, readCorpus = corpusStatus }) {
  /** @type {{ at: number, value: any }|null} */
  let cached = null;
  /** @type {Promise<any>|null} */
  let inFlight = null;

  async function compute() {
    // The embedder: verified live, not described from the constructor. `none` (NoEmbeddingProvider)
    // verifies as unavailable by design — MATIC_EMBED_PROVIDER=none IS the lexical-only mode.
    let emb = null;
    if (embedder) {
      let v;
      try { v = await embedder.verify(); }
      catch (err) { v = { ok: false, error: err?.message ?? String(err) }; }
      emb = {
        name: embedder.name,
        model: embedder.model,
        dimensions: embedder.dimensions,
        available: v.ok === true,
        error: v.ok ? null : (v.error ?? `returned ${v.dimensions} dimensions, expected ${embedder.dimensions}`),
        checkedAt: new Date(now()).toISOString(),
      };
    }

    // The corpus: best-effort, exactly as /v1/health always did — "is the hub up" and "is the corpus
    // loaded" are different questions, and the second failing is not the first failing.
    let corpus = null;
    if (kb) {
      try { corpus = await readCorpus(); }
      catch (err) { corpus = { error: err.message }; }
    }

    // The mode a question asked NOW would be retrieved under. Same function, same vocabulary as the
    // log rows, so the banner and the gap flags cannot describe two different things.
    const mode = !kb
      ? "unavailable"
      : retrievalModeOf({
        result: corpus && !corpus.error
          ? { legs: { lexical: true, semantic: Boolean(emb?.available) }, eligibleChunks: corpus.chunks ?? null }
          : null,
        error: corpus?.error ?? (corpus ? null : "no corpus status"),
      });

    const why = mode === "hybrid" ? null
      : mode === "unavailable" ? (kb ? `the corpus cannot be read: ${corpus?.error ?? "unknown"}` : "this hub is running without a knowledge base (kb: false)")
        : mode === "emptyCorpus" ? "the corpus has no chunks - nothing can be retrieved"
          : embedder ? `the embedder is unavailable (${emb?.error ?? "unknown"}) - retrieval is running on the lexical leg alone`
            : "no embedding provider is configured (MATIC_EMBED_PROVIDER=none) - retrieval is running on the lexical leg alone";

    return { embedder: emb, corpus, mode, degraded: mode !== "hybrid", why };
  }

  return async function retrievalHealth() {
    if (cached && now() - cached.at < cacheMs) return cached.value;
    if (!inFlight) {
      inFlight = compute().then((value) => {
        cached = { at: now(), value };
        inFlight = null;
        return value;
      }, (err) => {
        inFlight = null;
        throw err;
      });
    }
    return inFlight;
  };
}
