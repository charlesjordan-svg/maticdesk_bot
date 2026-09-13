-- Tenant 007 — resolution means something: a code you can count, notes a requester will read, and
-- the timestamps that say when a ticket was resolved and closed, and by what.
--
-- DECISION PROVENANCE (register §5.7b). Status is the status held WHEN THIS MIGRATION WAS WRITTEN.
--   D278 (PROPOSED 2026-09-12) — `resolved` requires a resolution CODE and requester-visible
--     resolution NOTES, and is REFUSED without both, with a sentence rather than a constraint
--     violation. Two claims, two fields: the notes are written FOR the requester and are a
--     different thing from the INTERNAL resolution note (D239/D269), which stays the desk's own
--     account and is never shown. The code is one of six (below); the vocabulary is a first draft
--     and the plan's own kill criterion says to revise it if the first ten real resolutions cannot
--     fill it honestly. `resolveTicket()` in src/tickets/query.js is the ONE way to reach `resolved`;
--     `setTicketState()` refuses the target.
--   D279 (PROPOSED 2026-09-12) — `closed` is TERMINAL in the console; `bin/tickets.mjs` remains the
--     any-state correction tool. And the console offers `closed` ONLY from `resolved`, so every
--     ticket the console closes carries a resolution code — the argument that cut `pending_user`
--     (plan v3 §3.1: a closed ticket with no code undermines D278) applied to the console's own
--     moves. A ticket to be withdrawn is resolved as `withdrawn_by_user` or `duplicate`, then closed.
--   D280 (PROPOSED 2026-09-12) — the transition guard lives in the UPDATE: `… WHERE reference = $1
--     AND state = $from`, so the check and the write are one statement and a second operator's move
--     between an operator's page load and their click is REFUSED, not silently overwritten. The
--     console's NEXT_STATES consult is a suggestion; the database is the arbiter. Nothing in this
--     file implements it — it is recorded here because the columns below are what a stale move
--     would otherwise clobber (a resolution written over a ticket someone else had just reopened).
--   D275 (PROPOSED 2026-09-12) — the timeline. Resolving writes a `resolution` entry (public, the
--     notes as its body) beside the `state_change` entry, so resolve → reopen → resolve leaves two
--     resolutions in the history while the columns below hold the CURRENT one.
--   D269 (RATIFIED 2026-09-12) — every column has code naming it or a reserved-list entry. Every
--     column added here is written by `resolveTicket()` or `setTicketState()` and read by the detail
--     page and `bin/tickets.mjs show`. Nothing is reserved.
--
-- THE TWO NOTES, SIDE BY SIDE, SO THE NEXT WRITER DOES NOT MERGE THEM
--
--   internal_resolution_note  the desk's account of what fixed it, for the desk and the KB draft
--                             loop (D239). INTERNAL. Optional. tenant/004 as close_note, renamed 005.
--   resolution_notes          what the requester is told. PUBLIC — requester-visible once P4 can
--                             deliver it, which nothing can yet, and both readers say so in words.
--                             REQUIRED to reach `resolved`. The name follows ServiceNow's `close_notes`
--                             (requester-facing) so the industry's word keeps the industry's
--                             visibility (tenant/005's argument).
--
-- WHAT THE COLUMNS MEAN ACROSS A REOPEN. The columns hold the CURRENT resolution. A move back to a
-- live state (`new`, `open`) clears `resolution_code`, `resolution_notes` and `resolved_at`: an open
-- ticket carrying resolution notes would show a requester (P4) a resolution for a problem the desk
-- has just agreed is not resolved. The history is not lost — the timeline's `resolution` entry
-- keeps every one. Likewise `closed_at`/`closed_by` are set on the move to `closed` and cleared by
-- any move out of it (the CLI's correction).
--
-- `closed_by` has FOUR values, not the plan's three: `requester` (P4's confirm), `auto` (P5's
-- job), `console_user`, and `system` — the CLI, which has no person attached. Leaving the CLI out
-- would have meant either lying (`console_user`) or NULL on a closed ticket.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS; the two CHECKs are added through pg_constraint guards
-- because ADD CONSTRAINT has no IF NOT EXISTS (the shape 002/003 use). test/db.test.mjs §4 runs this
-- file a second time and asserts the catalog did not move.

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution_code  text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution_notes text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolved_at      timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS closed_at        timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS closed_by        text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_resolution_code_known'
      AND conrelid = (current_schema() || '.tickets')::regclass
  ) THEN
    -- The six. A count you can group by (D186), never free text. Revise by migration after the
    -- first real resolutions, not by widening to text.
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_resolution_code_known
      CHECK (resolution_code IS NULL OR resolution_code IN (
        'fixed', 'workaround', 'no_fault_found', 'duplicate', 'withdrawn_by_user', 'referred_to_vendor'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_closed_by_known'
      AND conrelid = (current_schema() || '.tickets')::regclass
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_closed_by_known
      CHECK (closed_by IS NULL OR closed_by IN ('requester', 'auto', 'console_user', 'system'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_resolved_has_resolution'
      AND conrelid = (current_schema() || '.tickets')::regclass
  ) THEN
    -- The database's copy of D278: a resolved ticket carries both. NOT VALID so a tenant that
    -- already holds a resolved ticket from before this file (resolved with no code, because the
    -- code did not exist) still migrates; the rule binds every write from here on, and those rows
    -- are corrected by resolving them again through resolveTicket().
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_resolved_has_resolution
      CHECK (state <> 'resolved' OR (resolution_code IS NOT NULL AND resolution_notes IS NOT NULL)) NOT VALID;
  END IF;
END
$$;
