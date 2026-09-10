-- B7a 005 — the retrieval log records HOW it retrieved, not only what it found.
--
-- DECISION PROVENANCE (register §5.7b). Status is the status held WHEN THIS MIGRATION WAS WRITTEN.
--   D236 (DECIDED 2026-09-10) — a decline records its retrieval mode, the review queue's badge counts
--     only declines made under full retrieval, and degraded declines are flagged rather than hidden.
--   D227 (ratified 2026-09-09) — every decline is a gap row. THAT is what made this necessary.
--   D237 (DECIDED 2026-09-10) — a session id from the endpoint rides on the question, so a gap can
--     later be correlated with the outcome of the session that asked it (feed 3, staleness).
--
-- WHY THIS COLUMN EXISTS — THE FALSE-GAP PROBLEM
--
-- A D205 decline has three causes that are indistinguishable from the row alone:
--
--   1. the corpus genuinely does not cover the question           a REAL gap
--   2. the embedder was down, so only the lexical leg ran          a degraded retrieval
--   3. the corpus was empty, or the database was unreachable       no retrieval at all
--
-- and D227 logs every decline with its question text. So when the embedder drops (observed on
-- 2026-09-10: `/v1/health` said `embedder: none` for a whole session), the review queue fills with
-- gaps for questions the system could already answer, an admin works the queue in good faith, and
-- AUTHORS DUPLICATES of articles that already exist. It is silent and it looks exactly like the
-- product working. The hub knew the mode at query time; it was simply not writing it down.
--
-- THE FOUR VALUES
--
--   hybrid       both legs ran. The ONLY mode whose declines count as gaps for the badge.
--   lexicalOnly  the semantic leg did not run (no embedder configured, or the embedder failed).
--   emptyCorpus  no chunk was eligible for this platform: nothing to retrieve from.
--   unavailable  retrieval itself failed (the database, most likely). No legs ran.
--
-- NULL means the row was written before this migration and its mode is NOT KNOWN. The backfill
-- below fills what the row itself proves and leaves the rest NULL; the review queue shows NULL as
-- "mode unknown" and does not count it toward the badge. A default of 'hybrid' would have been a
-- claim about rows nobody can check.
ALTER TABLE control.kb_retrieval_log
  ADD COLUMN IF NOT EXISTS retrieval_mode text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kb_retrieval_log_mode_known'
      AND conrelid = 'control.kb_retrieval_log'::regclass
  ) THEN
    ALTER TABLE control.kb_retrieval_log
      ADD CONSTRAINT kb_retrieval_log_mode_known
      CHECK (retrieval_mode IS NULL OR retrieval_mode IN ('hybrid', 'lexicalOnly', 'emptyCorpus', 'unavailable'));
  END IF;
END
$$;

-- BACKFILL: INFERENCE FROM THE ROW, AND ONLY WHERE THE ROW PROVES IT.
--
-- `retrieved` is the fused top-k as [{ chunkId, articleId, kind, lexRank, semRank, score }].
--   - any chunk with a semRank  -> the semantic leg ran -> 'hybrid'. Certain.
--   - chunks, but no semRank    -> the dense leg returns EVERY eligible chunk for EVERY query (it has
--                                  no "no match", register §5.16c), so a non-empty fused set with no
--                                  semantic rank means the leg did not run -> 'lexicalOnly'. Certain
--                                  for a corpus small enough that the semantic top-20 covers it,
--                                  which every hub so far has been; a heuristic beyond that, and the
--                                  comment says so.
--   - no chunks at all          -> a lexical-only miss and an empty corpus look identical. Left NULL.
UPDATE control.kb_retrieval_log
   SET retrieval_mode = 'hybrid'
 WHERE retrieval_mode IS NULL
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(retrieved) e WHERE (e->>'semRank') IS NOT NULL);

UPDATE control.kb_retrieval_log
   SET retrieval_mode = 'lexicalOnly'
 WHERE retrieval_mode IS NULL
   AND jsonb_array_length(retrieved) > 0;

-- The badge and the gap filter read this: "declines, by mode, newest first".
CREATE INDEX IF NOT EXISTS kb_retrieval_log_mode ON control.kb_retrieval_log (answered, retrieval_mode, at DESC);

-- ---------------------------------------------------------------------------------------------
-- The session that asked (D237). A BARE uuid, NOT a foreign key: sessions live in a tenant schema
-- and this table is control-plane, and a cross-schema FK is exactly what tenant/001 forbids. It is
-- the endpoint's own session id, self-asserted like everything else the endpoint sends until device
-- authentication exists (D61). Nullable: a question asked before the endpoint had a session, or by
-- curl, has none.
--
-- What it is FOR: feed 3 of the review queue (staleness) needs to correlate "this article was
-- retrieved" with "and the session still ended unresolved" — which is a join from here to
-- <tenant>.sessions on this column, once the tenant is known. Cheap now, impossible later.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE control.kb_retrieval_log
  ADD COLUMN IF NOT EXISTS session_id uuid;
