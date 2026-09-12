-- B2 006 — the development TOTP bypass gets its own audit class, so a sign-in that skipped the
-- second factor can never be read as a normal one.
--
-- DECISION PROVENANCE (register §5.7b). Status is the status held WHEN THIS MIGRATION WAS WRITTEN.
--   D267 (DECIDED 2026-09-12, founder-authorised) — a development-only mode in which the admin
--     console accepts a password without an authenticator code. Six guards, none optional; this
--     migration is guard 6's half.
--   D156 (ratified 2026-09-04) — TOTP is mandatory. D267 does NOT amend it: no account can exist
--     without a secret, the secret is still checked for presence, and in every configuration but
--     this one the code is still required. What D267 suspends is the CODE, on a loopback dev hub.
--   D155 (ratified 2026-09-04) — event_class exists because 'break-glass' will one day mean
--     something. This adds the second member it was always going to need.
--
-- WHY A CLASS AND NOT A DETAIL KEY
--
-- `detail` is jsonb and nothing constrains its shape, so a bypassed sign-in recorded only as
-- `detail->>'bypass'` is findable exactly by whoever already knows to look. An event_class is the
-- column the audit page, `bin/admin.mjs audit` and any future alert already read. The question this
-- has to answer years from now is "did anything ever sign in to this console without a second
-- factor, and when" — and that question should be a WHERE clause, not an archaeology exercise.
--
-- The CHECK is replaced rather than dropped. A column that will accept any string is how
-- 'insecure-dev-bypass' quietly becomes 'insecure_dev_bypass' in one caller and stops matching.

ALTER TABLE control.admin_audit DROP CONSTRAINT IF EXISTS admin_audit_class_known;

ALTER TABLE control.admin_audit
  ADD CONSTRAINT admin_audit_class_known
  CHECK (event_class IN ('normal', 'break-glass', 'vendor-access', 'insecure-dev-bypass'));
