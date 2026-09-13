-- Tenant 011 — auto-close waits for DELIVERY, and gives up out loud rather than waiting forever.
-- The click-through benchmark's T8.5, 2026-09-13.
--
-- DECISION PROVENANCE (register §5.7b). Status is the status held WHEN THIS MIGRATION WAS WRITTEN.
--   D290 (PROPOSED 2026-09-13) — the auto-close clock starts at DELIVERY, not at resolution, and a
--     resolution the requester was never shown never closes their ticket. These two columns are the
--     backstop half: how many times the clock has been re-armed for want of delivery, and when the
--     hub gave up and handed the ticket back to a person.
--   D289 (PROPOSED 2026-09-12) — the binding this extends (tenant/010's two columns).
--   D287 (PROPOSED 2026-09-12) — the delivery record the gate reads:
--     `ticket_entries.notified_at` (the hub handed it over) and `read_by_requester_at` (the
--     endpoint acknowledged SHOWING it). D290 reads the second, not the first: handed to an app is
--     not shown to a person.
--   D238 / tenant-004 — the standing position this follows. A non-answer is not recorded as a "no".
--     Auto-close converts SILENCE into consent; before this migration it converted
--     UNREACHABILITY into consent, and those are different facts.
--
-- WHAT WENT WRONG, OBSERVED RATHER THAN REASONED
--
-- `2026-09-13-autoclose-delivery-gap-and-background-mode.md` predicted it from the code and said
-- plainly that nobody had run it. The click-through harness ran it (T8.5): a ticket resolved with
-- the client shut, the job made due, the client started. The ticket was CLOSED, `closed_by = 'auto'`,
-- and the requester's first sight of it was its closure — never the resolution, never the question,
-- never the chance to say it was not fixed. Plan v3 §8.1 wrote the stakes in advance: "an
-- incorrectly closed ticket is the single most damaging bug in this plan — it is the product
-- telling a user their unfixed problem is finished."
--
-- WHY A COUNTER AND NOT A DEADLINE
--
-- The re-arm interval is the tenant's own (control/009), so "how long have we been trying" is
-- `auto_close_rearms × interval` and needs no second unit. A tenant on 1 hour and a tenant on 72
-- hours both get three tries, which is the fact that matters — the hub tried, three times, over
-- three of this customer's own intervals, and could not reach them.
--
-- `resolution_undelivered_at` is the END of that road and is what the console lists: resolved,
-- never delivered, waiting for a human. It is HIDDEN from the requester — by definition they cannot
-- see it, and telling an app that never polled that its ticket is undelivered is not a message that
-- can land. Cleared whenever the ticket leaves `resolved` or a delivery finally happens.

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS auto_close_rearms         integer NOT NULL DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution_undelivered_at timestamptz;

-- The console's "resolved, never delivered" queue. Partial: only the given-up rows carry one, and
-- the whole point of the list is that it is short and someone works it.
CREATE INDEX IF NOT EXISTS tickets_resolution_undelivered
  ON tickets (resolution_undelivered_at) WHERE resolution_undelivered_at IS NOT NULL;
