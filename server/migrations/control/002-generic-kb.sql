-- B7a 002 — the generic knowledge base: articles, chunks, and the two retrieval legs.
--
-- DECISION PROVENANCE (register §5.7b). Status is the status held WHEN THIS MIGRATION WAS WRITTEN.
--   D204 (PROPOSED 2026-09-04) — the generic corpus lives in the CONTROL PLANE, not per-tenant and
--     not in a third schema category. See "Why control" below.
--   D203 (PROPOSED 2026-09-04) — the development embedder is served by Ollama and is
--     `snowflake-arctic-embed2:568m` = arctic-embed-L-v2.0, 1024 dimensions. THIS IS NOT D199's
--     MODEL. D199 chose arctic-embed-M-v2.0 (768 dimensions), which is not in Ollama's library.
--     `kb_chunks.embedding` is therefore vector(1024) for now and the dimension is a property of
--     the embedding provider, asserted at startup (src/kb/embed.js). See "Why 1024" below.
--   D45  (ratified) — generic KB is vendor-authored, carries no entitlement rules and contains no
--     customer data. That is what makes a shared location legitimate at all.
--   D44  (ratified) — CUSTOMER KB is per-tenant and is NOT in this file. Do not add it here.
--   D162 (ratified) — an article never names a capability or says what the bot does.
--   D167-D192 (ratified as a set 2026-09-04) — hybrid retrieval: a lexical leg and a semantic leg,
--     fused with RRF. D174 is the hybrid decision; D175 is "the embedder is a schema decision, not
--     a foundation", which is the licence for the paragraph below.
--
-- WHY CONTROL, AND WHAT WOULD MOVE IT
--
-- The migration runner handles exactly two categories, `migrations/control/` and
-- `migrations/tenant/` (src/db/migrate.js). Generic KB is a third thing: vendor-authored,
-- cross-tenant, no entitlement rules. A dedicated `generic` schema would be one special-cased
-- instance under the same runner — cleaner in the abstract, and a runner change for six articles.
--
-- The control plane is a slightly odd home: 001's header says it holds records that are ABOUT
-- tenants and devices. This is content, with vectors. It still holds no customer data, so 001's
-- actual invariant is intact, but the description has widened and this comment is that admission.
--
-- MOVE IT WHEN either is true: (1) customer KB arrives and wants to share retrieval SQL with the
-- generic corpus, at which point the asymmetry between `control.kb_*` and `<tenant>.kb_*` starts
-- costing real query duplication; or (2) the corpus outgrows one migration's worth of attention.
-- The cost of moving is a re-embed, which for this corpus is seconds and for 10,000 articles is
-- under $3 (D175). That is why this was decided quickly rather than carefully.
--
-- WHY 1024, AND WHY NOT MATRYOSHKA-256
--
-- Both arctic-embed v2.0 variants declare `matryoshka_dimensions: [256]`, and truncating every
-- model to 256 would make this column survive an embedder change with no migration at all. It is
-- deliberately NOT done. Truncation buys away a migration that is already nearly free (a re-embed)
-- and pays for it in retrieval quality that NOBODY HAS MEASURED. Storing native dimensions keeps
-- MRL-256 available later as a measured choice; truncating now does not keep the reverse open.
--
-- So the dimension here is the dev embedder's native 1024. When the production embedder is settled
-- this needs a NEW migration (never an edit — the runner checksums applied files and refuses).
-- src/kb/embed.js exports EMBEDDING_DIM and asserts it against the live provider at startup, so a
-- mismatch is a loud failure and not a silent column of zero-similarity vectors.

-- ---------------------------------------------------------------------------------------------
-- Articles. One row per article in docs/kb/generic-kb-v2.json, stored close to its source shape.
--
-- The array fields are kept as arrays rather than flattened into text: `symptoms` is the field
-- that holds user phrasing ("can't get to the shared drive from home") and it is weighted above
-- `guidance` in retrieval, which is only possible while the fields are still distinguishable.
--
-- `source_hash` is over the article's JSON. Re-ingesting an unchanged article is then a no-op and
-- an EDITED article is visible as an edit, rather than silently keeping stale chunks and a stale
-- vector. This is the same argument the migration runner's checksum makes.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS control.kb_articles (
  -- The article's own id from the bundle ("keyboard-shortcuts-windows"). Stable, human-readable,
  -- and what a citation names, so it is the primary key rather than a surrogate.
  id             text        PRIMARY KEY,
  bundle_id      text        NOT NULL,
  -- 'troubleshooting' | 'reference'. The signal that a body is a single table and must not be
  -- split mid-rows (D171's structured-article shape; B7a spec §3).
  type           text        NOT NULL,
  title          text        NOT NULL,
  category       text,
  -- 'any' | 'windows' | 'macos' | ... Pre-filtered BEFORE retrieval, not after (D162): filtering
  -- after retrieval still lets a macOS article consume one of the 3-5 slots and compete for rank.
  platform       text        NOT NULL DEFAULT 'any',
  environment    text,
  -- The KCS v6 confidence states (D172). 'unvalidated' for everything in the v2 bundle.
  lifecycle      text,
  problem        text,
  cause          text,
  body           text,
  scope_note     text,
  symptoms       text[]      NOT NULL DEFAULT '{}',
  keywords       text[]      NOT NULL DEFAULT '{}',
  guidance       text[]      NOT NULL DEFAULT '{}',
  escalate_when  text[]      NOT NULL DEFAULT '{}',
  do_not_attempt text[]      NOT NULL DEFAULT '{}',
  provenance     jsonb,
  source_hash    text        NOT NULL,
  ingested_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kb_articles_type_known CHECK (type IN ('troubleshooting', 'reference'))
);

-- ---------------------------------------------------------------------------------------------
-- Chunks. The retrieval unit, and the thing a score is attached to.
--
-- CHUNKING IS BY FIELD, AND THAT IS THE WHOLE IMPLEMENTATION (see src/kb/chunk.js for why).
-- The generic corpus is already structured, so the semantic boundaries the B7a spec asks for ARE
-- the field boundaries. No chunking library, no character counts. A `type = 'reference'` body is
-- ONE chunk however long it is, because a markdown table split mid-rows retrieves badly.
--
-- `weight` implements "weight title and symptoms above guidance" (B7a spec §5). Users describe
-- problems, not fixes, so the fields holding user phrasing outrank the fields holding the answer.
-- It is applied in fusion (src/kb/retrieve.js), not in either leg, so each leg stays independently
-- testable — which the spec asks for, because a broken leg inside an RRF fusion is very hard to see.
--
-- BOTH LEGS LIVE ON THIS TABLE:
--   `tsv`       the lexical leg. GENERATED, so it cannot drift from `text`. This is what finds
--               `0x80070005` and `DisplayLink`, which dense embedding cannot.
--   `embedding` the semantic leg. Nullable on purpose: a chunk exists before it is embedded, so
--               ingestion is not one all-or-nothing transaction and an embedder outage leaves a
--               corpus that still answers through the lexical leg alone.
--
-- `platform` is denormalised from the article so the pre-filter costs no join.
-- `embedding_model` and `embedding_dim` are stored per row: a corpus embedded by two different
-- models is a silently-wrong corpus, and these columns are what make it detectable instead.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS control.kb_chunks (
  id              bigserial PRIMARY KEY,
  article_id      text      NOT NULL REFERENCES control.kb_articles(id) ON DELETE CASCADE,
  -- Position within the article. (article_id, ordinal) is the stable identity a retrieval log cites.
  ordinal         int       NOT NULL,
  -- 'title' | 'symptoms' | 'cause' | 'guidance' | 'body' | 'reference'. Which field this came from.
  kind            text      NOT NULL,
  text            text      NOT NULL,
  weight          real      NOT NULL DEFAULT 1.0,
  platform        text      NOT NULL DEFAULT 'any',
  embedding       vector(1024),
  embedding_model text,
  embedding_dim   int,
  tsv             tsvector  GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,
  CONSTRAINT kb_chunks_unique UNIQUE (article_id, ordinal),
  CONSTRAINT kb_chunks_kind_known CHECK (kind IN ('title', 'symptoms', 'cause', 'guidance', 'body', 'reference')),
  -- An embedding without the model that produced it is an unattributable vector, which is the
  -- state this table exists to make impossible.
  CONSTRAINT kb_chunks_embedding_attributed
    CHECK ((embedding IS NULL) = (embedding_model IS NULL))
);

CREATE INDEX IF NOT EXISTS kb_chunks_tsv ON control.kb_chunks USING gin (tsv);
CREATE INDEX IF NOT EXISTS kb_chunks_article ON control.kb_chunks (article_id);
-- The pre-filter (D162). Partial rather than full: 'any' is most of the corpus and is never excluded.
CREATE INDEX IF NOT EXISTS kb_chunks_platform ON control.kb_chunks (platform) WHERE platform <> 'any';

-- HNSW over cosine distance. Ollama returns unit-normalised vectors (measured 2026-09-04: L2 norm
-- 1.000000), so cosine and inner product rank identically here; cosine is used anyway because it
-- does not depend on that staying true of the next provider.
CREATE INDEX IF NOT EXISTS kb_chunks_embedding_hnsw
  ON control.kb_chunks USING hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------------------------
-- Retrieval log. SEPARATE FROM OUTCOME, DELIBERATELY (D166, Phase 1 plan C4).
--
-- Which chunks came back, with their scores, and which of them the model actually cited. This is
-- what distinguishes a RETRIEVAL miss (the right article never came back) from a REASONING miss
-- (it came back and the model ignored it or answered around it). They have different fixes, and
-- without this split a bad answer is just a bad answer.
--
-- Cheap now, hard to add later: the scores only exist at query time.
--
-- WHAT IS NOT HERE: the user's sentence. `query_text` holds it ONLY when
-- MATIC_KB_LOG_QUERIES=1 is set for development; the column is nullable and the default is off.
-- A hub-side table of what employees typed is exactly the transcript-access problem D154 exists to
-- constrain, and B7a has no admin model, no tenancy and no retention policy to constrain it with.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS control.kb_retrieval_log (
  id            bigserial   PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  -- Provisional tenancy. NOT authenticated, and B7a is loud about it (src/index.js). A text label
  -- from configuration, not a foreign key, precisely so it cannot be mistaken for identity.
  tenant_label  text,
  query_text    text,
  platform      text,
  -- The fused result: [{ chunkId, articleId, kind, lexRank, semRank, score }]. jsonb because the
  -- shape of a score is the thing most likely to change while this is being tuned.
  retrieved     jsonb       NOT NULL,
  -- Best fused score, lifted out of `retrieved` so a floor can be tuned with one query.
  top_score     real,
  -- Did the relevance floor suppress the chunks entirely? The negative acceptance test's mechanism.
  floor_applied boolean     NOT NULL DEFAULT false,
  -- What the model did with them: article ids it cited, and whether it answered at all.
  cited         text[]      NOT NULL DEFAULT '{}',
  answered      boolean,
  model         text
);
CREATE INDEX IF NOT EXISTS kb_retrieval_log_at ON control.kb_retrieval_log (at DESC);
