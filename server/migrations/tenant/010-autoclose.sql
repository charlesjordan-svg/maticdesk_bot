-- Tenant 010 — a resolved ticket knows when it will close on its own, and by which job.
-- P5 of the ticket-lifecycle plan (2026-09-12).
--
-- DECISION PROVENANCE (register §5.7b). Status is the status held WHEN THIS MIGRATION WAS WRITTEN.
--   D289 (PROPOSED 2026-09-12) — auto-close after the tenant's interval (control/009), bound to
--     the RESOLUTION that enqueued it. These two columns ARE the binding.
--   D270 (RATIFIED 2026-09-12) — at-least-once: the handler re-checks `auto_close_job_id = <its
--     own id>` inside the tenant transaction before it closes anything, so a job run twice, or a
--     job for a resolution that was since undone, does nothing.
--   D196 (ratified 2026-09-04) — control.job_queue carries references only. The job's ref_id is
--     the ticket; everything else it needs is HERE, in the tenant's row.
--   D284 (PROPOSED 2026-09-12) — `auto_close_at` joins the requester-visible allow-list: the
--     requester is told when their ticket will close unless they say otherwise. `auto_close_job_id`
--     is hidden: a control-plane reference is not a fact about their ticket.
--
-- WHY THE JOB ID IS ON THE TICKET, NOT resolved_at ON THE JOB
--
-- Plan v3 §7.6 offers two bindings: store the job id on the ticket, or compare `resolved_at`. The
-- queue row has no payload column (D196) and must not grow one, so the comparison would need a
-- second tenant table keyed by job; the job id on the ticket is one column and one equality. It
-- also makes the cancel paths trivial to reason about: a reopen (requesterComment), a confirm
-- (confirmResolution) or any move out of `resolved` (setTicketState) clears the column, and a job
-- whose id is no longer there finds nothing to do — whether or not cancelJobsFor() reached it
-- first. The column is a bare bigint — control.job_queue.id is a bigserial (control/001), not a
-- uuid — with NO foreign key, for tenant/008's reason: a tenant schema must not reference the
-- control plane.
--
-- `auto_close_at` is `resolved_at + interval` as computed when the ticket was resolved; the job's
-- run_after carries the same instant. It is shown to the desk ("closes automatically on …") and to
-- the requester (GET /v1/tickets), and NULL whenever the ticket is not resolved or the tenant's
-- interval is off.

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS auto_close_at     timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS auto_close_job_id bigint;

-- The reader that asks "what closes soon" — the console's list page — filters resolved tickets by
-- this instant; partial, because only resolved rows carry one.
CREATE INDEX IF NOT EXISTS tickets_auto_close ON tickets (auto_close_at) WHERE auto_close_at IS NOT NULL;
