// @ts-check
/**
 * The embedding provider interface, and one implementation. B7a (2026-09-04).
 *
 * WHY AN INTERFACE FOR ONE IMPLEMENTATION
 *
 * D175: the embedder is a schema decision, not a foundation — re-embedding 10,000 articles is under
 * $3. That is only true while swapping the embedder is a swap. This file is what keeps it a swap.
 *
 * THE FINDING THAT PRODUCED THIS FILE'S SHAPE (register §5.16, D203)
 *
 * B7a's spec asked whether D199's embedder is servable through Ollama. IT IS NOT.
 *
 *   D199 chose `Snowflake/snowflake-arctic-embed-m-v2.0`  — 305M params, 768 dims, GteModel
 *   Ollama's library has `snowflake-arctic-embed2:568m`    — 568M params, 1024 dims, XLMRobertaModel
 *
 * Those are the L and M variants of arctic-embed v2.0 and they are DIFFERENT ARCHITECTURES, not two
 * sizes of one model. There is no `-m-v2.0` tag in Ollama's library, and the tempting near-miss is a
 * trap: `snowflake-arctic-embed:m` DOES exist, but that is the v1.0 suite, which is ENGLISH-ONLY —
 * exactly what D199 rejected, because an English-only pick bets on Q35 being answered a particular
 * way.
 *
 * So the dev embedder is the L variant, and IT IS NOT THE SHIPPED MODEL. The consequence is stated
 * here rather than in a document nobody reads:
 *
 *   **DEV LATENCY IS A PESSIMISTIC PROXY AND DEV QUALITY IS AN OPTIMISTIC PROXY.** The L is 1.9x
 *   the parameters of the M, so it is slower than production and probably better than production.
 *   Both errors point the wrong way. No number measured against this provider says anything about
 *   the shipped system.
 *
 * And a sharper one: **the L is in the parameter class D199 explicitly rejected.** D199 turned down
 * Qwen3-Embedding-0.6B (509M-600M) because an unmeasured 1-2 vCPU latency was the wrong risk for an
 * interactive surface. The L is 568M. So adopting it in production would contradict D199's own
 * reasoning, and this is a dev runtime choice, NOT an amendment to D199.
 *
 * Configuration (environment; there is no config file yet, matching src/index.js and src/db/pool.js):
 *   MATIC_EMBED_PROVIDER  "ollama" | "none"   default "ollama"
 *   MATIC_EMBED_URL       default http://127.0.0.1:11434
 *   MATIC_EMBED_MODEL     default snowflake-arctic-embed2:568m
 *   MATIC_EMBED_TIMEOUT_MS default 120000
 */

/**
 * The dimension `control.kb_chunks.embedding` is declared with, in migration 002.
 *
 * A provider whose dimension disagrees with this is REFUSED at startup rather than allowed to write
 * a column of vectors that silently score zero against everything. Changing the embedder to one
 * with a different width needs a NEW migration — never an edit to 002, which the runner checksums
 * and refuses.
 */
export const EMBEDDING_DIM = 1024;

/**
 * @typedef {object} EmbeddingProvider
 * @property {string} name          transport, for logs ("ollama")
 * @property {string} model         the model tag, stored on every row it embeds
 * @property {number} dimensions    what this provider returns; asserted against EMBEDDING_DIM
 * @property {(texts: string[]) => Promise<number[][]>} embed
 *   One vector per input, in order. Throws on transport or protocol failure — callers decide
 *   whether a missing embedding is fatal (it is not, for ingestion: the lexical leg still works).
 */

/**
 * Arctic's own asymmetric prompting. The model was trained with a query prefix and no document
 * prefix, and using it is not optional dressing: embedding a question and a passage into the same
 * space with the same prefix is measurably worse on the model's own card.
 *
 * `query: ` is the prefix Snowflake documents for the arctic-embed family. Documents get none.
 */
export const QUERY_PREFIX = "query: ";

/**
 * Ollama's `/api/embed`. One runtime serving the chat model and the embedder, which is also the
 * customer-hosted deployment mode rather than a dev shortcut — the same argument B0 made for
 * running the hub locally.
 *
 * @implements {EmbeddingProvider}
 */
export class OllamaEmbeddingProvider {
  /**
   * @param {{ model?: string, baseUrl?: string, timeoutMs?: number, dimensions?: number, fetchImpl?: typeof fetch }} [opts]
   */
  constructor(opts = {}) {
    this.name = "ollama";
    this.model = opts.model ?? process.env.MATIC_EMBED_MODEL ?? "snowflake-arctic-embed2:568m";
    this.baseUrl = String(opts.baseUrl ?? process.env.MATIC_EMBED_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
    this.timeoutMs = Number(opts.timeoutMs ?? process.env.MATIC_EMBED_TIMEOUT_MS ?? 120000);
    // The width this provider claims. Verified against a live response by `verify()`, because a
    // claim in a constructor is not a measurement.
    this.dimensions = opts.dimensions ?? EMBEDDING_DIM;
    this.fetch = opts.fetchImpl ?? globalThis.fetch;
  }

  /**
   * @param {string[]} texts
   * @returns {Promise<number[][]>}
   */
  async embed(texts) {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    const res = await this.fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`the embedder at ${this.baseUrl} returned ${res.status}: ${detail.slice(0, 200)}`);
    }
    const body = await res.json();
    const out = body?.embeddings;
    if (!Array.isArray(out) || out.length !== texts.length) {
      throw new Error(`the embedder returned ${Array.isArray(out) ? out.length : "no"} vectors for ${texts.length} inputs`);
    }
    for (const v of out) {
      if (!Array.isArray(v) || v.length !== this.dimensions) {
        throw new Error(
          `the embedder returned ${Array.isArray(v) ? v.length : "a non-array"} dimensions, but `
          + `control.kb_chunks.embedding is vector(${this.dimensions}) (migration 002). `
          + `A different-width model needs a NEW migration, not an edit to 002.`,
        );
      }
    }
    return out;
  }

  /** Embed one query, with the asymmetric prefix the model was trained with. */
  async embedQuery(text) {
    const [v] = await this.embed([QUERY_PREFIX + text]);
    return v;
  }

  /**
   * Prove the provider is reachable and returns the declared width, before anything writes a row.
   * Returns the live figures rather than a boolean, so a caller can log what it actually got.
   *
   * @returns {Promise<{ ok: boolean, dimensions?: number, l2?: number, error?: string }>}
   */
  async verify() {
    try {
      const [v] = await this.embed(["dimension probe"]);
      const l2 = Math.sqrt(v.reduce((a, b) => a + b * b, 0));
      return { ok: v.length === this.dimensions, dimensions: v.length, l2 };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}

/**
 * The explicit no-embedder provider. NOT a stub that could be mistaken for a start — it refuses.
 *
 * Its purpose is the degraded mode the B7a spec asks for: with `MATIC_EMBED_PROVIDER=none` the
 * corpus ingests and retrieves through the LEXICAL LEG ALONE, which is a real configuration (an
 * embedder outage) and not a test fixture. Retrieval says so in its result rather than quietly
 * returning half a pipeline.
 *
 * @implements {EmbeddingProvider}
 */
export class NoEmbeddingProvider {
  constructor() {
    this.name = "none";
    this.model = "none";
    this.dimensions = 0;
  }

  async embed(texts) {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    throw new Error("no embedding provider is configured (MATIC_EMBED_PROVIDER=none): the semantic leg is unavailable");
  }

  async embedQuery() {
    throw new Error("no embedding provider is configured (MATIC_EMBED_PROVIDER=none): the semantic leg is unavailable");
  }

  async verify() {
    return { ok: false, error: "MATIC_EMBED_PROVIDER=none" };
  }
}

/**
 * Build the provider the environment asks for.
 * @param {{ provider?: string }} [opts]
 * @returns {EmbeddingProvider & { embedQuery: (t: string) => Promise<number[]>, verify: () => Promise<any> }}
 */
export function embeddingProviderFromEnv(opts = {}) {
  const which = opts.provider ?? process.env.MATIC_EMBED_PROVIDER ?? "ollama";
  if (which === "none") return new NoEmbeddingProvider();
  if (which === "ollama") return new OllamaEmbeddingProvider();
  throw new Error(`unknown MATIC_EMBED_PROVIDER "${which}" (expected "ollama" or "none")`);
}

/**
 * pgvector's text input format. `pg` has no native vector type, so the parameter goes down as a
 * string and is cast in SQL (`$1::vector`). Building it here rather than at three call sites means
 * one place can be wrong.
 *
 * @param {number[]} v
 * @returns {string}
 */
export function toVectorLiteral(v) {
  if (!Array.isArray(v) || v.length === 0) throw new Error("toVectorLiteral: not a vector");
  for (const x of v) if (!Number.isFinite(x)) throw new Error("toVectorLiteral: vector contains a non-finite value");
  return `[${v.join(",")}]`;
}
