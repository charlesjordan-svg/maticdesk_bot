-- B1 009 — the tenant's auto-close interval: how long a resolved ticket waits for the requester
-- before the hub closes it on their behalf. P5 of the ticket-lifecycle plan (2026-09-12).
--
-- DECISION PROVENANCE (register §5.7b). Status is the status held WHEN THIS MIGRATION WAS WRITTEN.
--   D289 (PROPOSED 2026-09-12) — a resolved ticket auto-closes after a per-tenant interval unless
--     the requester confirms (closes it themselves) or comments (reopens it); the job is bound to
--     the RESOLUTION that enqueued it, and NULL here is the kill switch: nothing is enqueued.
--   D270 (RATIFIED 2026-09-12) — the job runtime; at-least-once; `ticket.autoclose` is its first
--     handler and proves the contract by running twice (admin-db P5).
--   D278 (PROPOSED 2026-09-12) — `closed_by = 'auto'` was reserved in tenant/007 for exactly this.
--   D143 (ratified 2026-09-04) — one row per tenant in the control plane carries tenant policy;
--     this is a policy value, not tenant data, so it sits beside `enrollment_auto_approve` (004).
--
-- WHY HOURS, WHY 72, WHY NULLABLE
--
-- Plan v3 §7.6: "a per-tenant setting. §2.1's 24–48h is what the industry does; 72 hours is the
-- safer first default for a desk where the user is on the machine — long enough to survive a
-- weekend, which is exactly when a premature close is most annoying." The plan's §9 also records
-- that no vendor's default was established from a primary source, so 72 is OUR default and is
-- labelled a proposal wherever it is shown. Hours, not days, because a test needs an interval
-- shorter than a day and a customer may want one; the CHECK caps it at a year (8760 h), which is
-- "never" in practice without being a magic value.
--
-- NULL means OFF: `resolveTicket()` enqueues nothing, and a job already queued finds the ticket's
-- `auto_close_job_id` cleared and does nothing (plan §8.4's kill switch: "Interval NULL stops
-- enqueueing; in-flight jobs no-op on re-read"). The default is 72 for tenants that exist and
-- tenants to come — a fresh tenant auto-closes unless somebody turns it off, because a resolved
-- ticket that waits forever for a requester who has moved on is the queue silting up.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; the CHECK is guarded by a pg_constraint lookup because
-- ADD CONSTRAINT has no IF NOT EXISTS (control/004's shape).

ALTER TABLE control.tenants
  ADD COLUMN IF NOT EXISTS ticket_autoclose_hours integer DEFAULT 72;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_autoclose_hours_range'
      AND conrelid = 'control.tenants'::regclass
  ) THEN
    ALTER TABLE control.tenants
      ADD CONSTRAINT tenants_autoclose_hours_range
      CHECK (ticket_autoclose_hours IS NULL OR (ticket_autoclose_hours BETWEEN 1 AND 8760));
  END IF;
END $$;
