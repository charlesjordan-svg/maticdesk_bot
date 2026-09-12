-- B1 007 — the job queue learns the word "cancelled".
--
-- DECISION PROVENANCE (register §5.7b). Status is the status held WHEN THIS MIGRATION WAS WRITTEN.
--   D270 (PROPOSED 2026-09-12) — control.job_queue gets a runtime: an in-process poller started by
--     the hub, a reaper for rows a dead process left `running`, and a way to cancel a job that has
--     not started. This file is the status the last of those needs.
--   D196 (ratified 2026-09-04) — references, never payloads. Unchanged: this adds a VALUE to a
--     CHECK, not a column.
--   D143 (ratified 2026-09-04) — one schema per tenant; the job queue is the deliberate
--     cross-tenant exception, so it stays as small as it is.
--
-- WHY A FIFTH STATUS
--
-- The lifecycle plan's auto-close (its D248-numbered item; the register number is assigned when it
-- is built) enqueues `ticket.autoclose` when a ticket is resolved, to run after an interval. Two
-- things then have to be able to withdraw it before it runs: the requester confirming the fix
-- (the job has nothing left to do), and the requester reopening the ticket (the job would close a
-- ticket that is open again). Until now the queue had `queued`, `running`, `done` and `failed` —
-- no word for "withdrawn before it started". `failed` is a lie for it (nothing went wrong) and
-- DELETE loses the record that a job existed and was withdrawn, which the audit of a closure
-- dispute will want.
--
-- `cancelJobsFor(type, refId)` in src/db/jobs.js moves QUEUED rows only. A job already `running`
-- is inside a handler and cannot be recalled; the handler re-checks its own precondition when it
-- runs (the runner's contract is at-least-once, so it must anyway). That is why the plan binds the
-- auto-close job to the specific resolution that created it and not merely to the ticket.
--
-- The CHECK is replaced rather than dropped, for the reason control/006 gives: a column that
-- accepts any string is how 'cancelled' becomes 'canceled' in one caller and stops matching.
-- The partial index job_queue_claimable (WHERE status = 'queued') is unaffected; a cancelled row
-- simply leaves it.

ALTER TABLE control.job_queue DROP CONSTRAINT IF EXISTS job_status_known;

ALTER TABLE control.job_queue
  ADD CONSTRAINT job_status_known
  CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled'));
