-- B1 tenant 002 — the session outcome.
--
-- A second migration exists partly to prove the path: exit criterion 3 requires a migration to
-- apply to the control plane and to every tenant schema in one run, and criterion 4 requires a
-- new tenant to receive every migration automatically. One migration cannot demonstrate either.
--
-- It is not filler. The four outcomes are D89 plus D118, and the CHECK constraint is where the
-- deflection definition stops being a paragraph and becomes something the database enforces:
--
--   resolved   — the user explicitly confirmed it. ONLY this counts toward deflection (D89).
--   escalated  — a ticket was created.
--   unresolved — everything else, INCLUDING abandonment. A session where the user got an answer
--                and closed the window is indistinguishable from one where they gave up and
--                walked to IT, and it is counted as unresolved on purpose.
--   suppressed — an alert prevented the session (D118). Proxy-measured against a baseline.
--
-- `resolved` is only reachable if the agent asks (D90/D188). The column being NOT NULL DEFAULT
-- 'unresolved' is deliberate: a session that nobody classified is unresolved, never missing, so
-- the denominator cannot quietly shrink.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'unresolved';

-- Idempotent by hand: ADD CONSTRAINT has no IF NOT EXISTS in PostgreSQL 17.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_outcome_known'
      AND conrelid = (current_schema() || '.sessions')::regclass
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_outcome_known
      CHECK (outcome IN ('resolved', 'escalated', 'unresolved', 'suppressed'));
  END IF;
END
$$;

-- Trend is reported per category and never only in aggregate (D186), so the outcome has to be
-- groupable cheaply from the start.
CREATE INDEX IF NOT EXISTS sessions_outcome ON sessions (outcome, started_at DESC);
