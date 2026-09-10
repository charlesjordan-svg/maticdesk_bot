-- B3 004 — what device enrollment needs that control/001 did not give it.
--
-- control/001 put the SHAPES of D60-D67a and D80-D83a in place before B3 was built (same argument
-- as 003's header: "adding columns to an empty table is free and adding them to a populated one is
-- not" — D160, register §5.7b). This file is the one column and the one constraint the shapes were
-- missing once real enrollment logic had to run against them, not a redesign of them.
--
-- ---------------------------------------------------------------------------------------------
-- DECISION PROVENANCE (register §5.7b) — status of each decision WHEN THIS FILE WAS WRITTEN,
-- 2026-09-10. Appended to, never rewritten.
--   Proposed, 2026-09-03, NOT YET RATIFIED .... D60, D61, D64, D132, D148 (device identity, the
--                                               token exchange, broker custody, timing parameters,
--                                               logged-on-user attestation)
--   Decided as fact, 2026-09-03 ............... D146 (TPM implementation details — not a policy
--                                               choice; see server/docs/B3-DEVICE-ENROLLMENT.md)
--   Decided, 2026-09-03 ........................ D62/D62a/D63/D65/D66/D67/D67a/D80/D81/D82/D83/D83a
--                                               (mTLS rejected, no-TPM software fallback, broker
--                                               custody's macOS analogue, auto-approve + toggle,
--                                               the secret's shape, rate limiting, bulk revocation)
--   THIS PASS BUILDS AGAINST D63's no-TPM path, D80-D83a's enrollment mechanics, and a software
--   keypair for D60's identity — NOT D60/D64's TPM+broker-pipe custody or D61's token exchange.
--   See server/docs/B3-DEVICE-ENROLLMENT.md for exactly what that narrows and why.
-- ---------------------------------------------------------------------------------------------

-- ---------------------------------------------------------------------------------------------
-- 1. Auto-approve, with a per-tenant toggle (D80). "Auto-approve still writes the pending record
--    and then approves it — one code path, policy flag on the end" — so this is the one flag the
--    approval code reads, not a second code path alongside it.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE control.tenants
  ADD COLUMN IF NOT EXISTS enrollment_auto_approve boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------------------------
-- 2. `enrollment_requests.decided_by` was left a bare uuid in 001 — not wrong (the table existed
--    before there was any code to decide a request), but unenforced once an admin's id is what
--    actually gets written there. An approval/rejection is an admin action; the row should not be
--    able to outlive the account that made it, or point at nothing.
--
--    Idempotent by hand: ADD CONSTRAINT has no IF NOT EXISTS in PostgreSQL 17 (same shape as
--    migrations/tenant/002-session-outcome.sql and migrations/tenant/003-tickets.sql).
-- ---------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'enrollment_requests_decided_by_fkey'
      AND conrelid = 'control.enrollment_requests'::regclass
  ) THEN
    ALTER TABLE control.enrollment_requests
      ADD CONSTRAINT enrollment_requests_decided_by_fkey
      FOREIGN KEY (decided_by) REFERENCES control.admin_users(id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS enrollment_requests_decided_by ON control.enrollment_requests (decided_by);
