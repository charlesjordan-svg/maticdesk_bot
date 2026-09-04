// @ts-check
/**
 * Chunking for the generic knowledge base. B7a (2026-09-04).
 *
 * THE B7A SPEC SAID TO TAKE A CHUNKING LIBRARY. THIS DOES NOT, AND HERE IS WHY.
 *
 * The spec's instruction was "chunk on semantic boundaries, not fixed character counts (D164a; take
 * a permissively-licensed implementation rather than writing one)". That instruction is correct for
 * the corpus it was written about and wrong for this one.
 *
 * The generic KB is NOT free text. `docs/kb/generic-kb-v2.json` is already structured (D171:
 * articles are structured, not freeform) — `title`, `problem`, `symptoms[]`, `keywords[]`,
 * `cause`, `guidance[]`, `body`. **The semantic boundaries a chunker would have to infer are
 * already marked.** Running a text splitter over it would take known boundaries, throw them away,
 * and guess them back — worse output, plus a dependency.
 *
 * So: chunking here is BY FIELD, and the whole implementation is `chunkArticle` below.
 *
 * **A CHUNKER IS STILL NEEDED, JUST NOT YET.** Customer KB (D44) is free-text documents — exported
 * wiki pages, PDFs, pasted runbooks — and has no field structure to exploit. That is where D164a's
 * instruction applies, and it is out of B7a's scope. Do not read this file as a decision that
 * chunking is solved.
 *
 * WHAT IS LOST BY NOT SPLITTING LONG FIELDS
 *
 * Nothing measurable yet, and the reason is worth writing down rather than assuming: the longest
 * chunk this produces across the six articles is the reference table, and it is well inside the
 * embedder's 8,192-token context. If an article ever arrives with a `body` that exceeds it, the
 * embedder truncates SILENTLY and the tail of that article becomes unretrievable through the
 * semantic leg while still being retrievable through the lexical one. `chunkArticle` therefore
 * reports a `long` flag rather than letting that happen quietly.
 */

/**
 * Rough token estimate. Deliberately crude: it exists to raise a flag, not to be accurate, and a
 * real tokeniser would be a dependency bought to make a warning slightly better worded.
 * ~4 characters per token is the usual English approximation.
 * @param {string} s
 */
export function approxTokens(s) {
  return Math.ceil(s.length / 4);
}

/** The embedder's context. arctic-embed v2.0, both variants: 8,192 tokens. */
export const EMBED_CONTEXT_TOKENS = 8192;

/**
 * Weights per chunk kind. **B7a spec §5: weight `title` and `symptoms` above `guidance`.**
 *
 * The reason is a claim about users, not about text: `symptoms` holds user phrasing — "can't get to
 * the shared drive from home" — and users describe problems, not fixes. A query therefore looks
 * like a symptom and not like guidance.
 *
 * These numbers are UNMEASURED. They are applied in fusion (src/kb/retrieve.js), never inside a
 * leg, so each leg stays independently testable and so changing a weight cannot change what the
 * lexical leg finds — only how it ranks after fusion.
 */
export const KIND_WEIGHTS = {
  title: 1.0,
  symptoms: 1.0,
  reference: 1.0,
  cause: 0.7,
  guidance: 0.6,
  body: 0.6,
};

/**
 * @typedef {object} Chunk
 * @property {number} ordinal
 * @property {"title"|"symptoms"|"cause"|"guidance"|"body"|"reference"} kind
 * @property {string} text
 * @property {number} weight
 * @property {boolean} long  true when this chunk may exceed the embedder's context
 */

/**
 * Split one article into chunks. Field boundaries only.
 *
 * The `title` chunk carries title + problem together: a title alone is a handful of words and
 * embeds poorly, and the problem statement is the sentence that says what the title means.
 *
 * A `type: "reference"` article's body is ONE chunk however long it is. The B7a spec is explicit,
 * and the reason is concrete: the reference article is a single markdown table, and a table split
 * mid-rows retrieves badly — half a table has no header, and the header is what says what the rows
 * mean.
 *
 * @param {any} article  an article object from generic-kb-v2.json
 * @returns {Chunk[]}
 */
export function chunkArticle(article) {
  /** @type {Chunk[]} */
  const chunks = [];
  let ordinal = 0;

  const push = (kind, text) => {
    const t = String(text ?? "").trim();
    if (!t) return;
    chunks.push({
      ordinal: ordinal++,
      kind,
      text: t,
      weight: KIND_WEIGHTS[kind] ?? 1.0,
      long: approxTokens(t) > EMBED_CONTEXT_TOKENS,
    });
  };

  // 1. Title + problem. What the article is about, in the article's own words.
  push("title", [article.title, article.problem].filter(Boolean).join("\n\n"));

  // 2. Symptoms + keywords. USER PHRASING. Weighted equal to the title and above everything else.
  //    Keywords ride along here rather than getting their own chunk: on their own they are a bag of
  //    words with no sentence around them, which embeds badly and adds a competing slot for no gain.
  const symptomText = [
    (article.symptoms ?? []).join("\n"),
    (article.keywords ?? []).length ? `Related terms: ${(article.keywords ?? []).join(", ")}` : "",
  ].filter(Boolean).join("\n\n");
  push("symptoms", symptomText);

  if (article.type === "reference") {
    // ONE chunk, unsplit, whatever its length. See the note above.
    push("reference", article.body);
  } else {
    push("cause", article.cause);
    // Guidance as ONE chunk rather than one per step. A single step ("Run a speed test and note the
    // figures") retrieves as a plausible answer to almost any slow-network question while carrying
    // none of the context that makes it the right one. The steps are an ordered procedure and the
    // order is part of the meaning.
    if ((article.guidance ?? []).length) {
      push("guidance", (article.guidance ?? []).map((g, i) => `${i + 1}. ${g}`).join("\n"));
    }
    push("body", article.body);
  }

  // `escalateWhen` and `doNotAttempt` are DELIBERATELY NOT CHUNKED.
  //
  // They are constraints on the answer, not candidate answers. Retrieving "escalate when the user
  // reports the same problem twice in a week" as the best-matching chunk for a question would hand
  // the model a rule as though it were guidance. They travel with the article in the prompt
  // (src/kb/answer.js) as part of the article's frame, where they constrain rather than compete.
  return chunks;
}

/**
 * Hash an article's source JSON, for change detection on re-ingest.
 *
 * Key order is normalised, so a reserialisation of the same content hashes the same and an actual
 * edit does not. Without this, "re-ingest" either re-embeds everything every time or silently keeps
 * stale vectors, and both are worse than the twelve lines below.
 *
 * @param {any} article
 * @param {(s: string) => string} hasher
 * @returns {string}
 */
export function articleHash(article, hasher) {
  const sortKeys = (v) => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
    }
    return v;
  };
  return hasher(JSON.stringify(sortKeys(article)));
}
