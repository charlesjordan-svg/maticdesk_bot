-- Tenant 004 — sessions get written, so the outcome columns tenant/002 declared can carry a fact.
--
-- DECISION PROVENANCE (register §5.7b). Status is the status held WHEN THIS MIGRATION WAS WRITTEN.
--   D237 (DECIDED 2026-09-10) — the endpoint has a session identity: a client-minted uuid, created
--     on the first turn, carried on every hub request, ended by the window closing or by inactivity.
--   D238 (DECIDED 2026-09-10) — the confirmation turn ("did that fix it?") after a fix that ran and
--     did not escalate; an escalated session is NEVER asked.
--   D239 (DECIDED 2026-09-10) — the row is written when the session BEGINS, defaulting to
--     'unresolved'; 'resolved' and 'escalated' are transitions on it; 'suppressed' is reserved.
--   D89, D90, D118, D186, D188 (ratified) — the outcome vocabulary and why the turn is load-bearing.
--
-- WHAT tenant/002 ALREADY HAD, AND WHY NOTHING HERE CHANGES IT
--
-- `sessions.outcome text NOT NULL DEFAULT 'unresolved'` with the four-value CHECK. Its own comment
-- said the column being NOT NULL DEFAULT 'unresolved' is deliberate: a session nobody classified is
-- unresolved, never missing, so the denominator cannot quietly shrink. That was the right shape and
-- it sat unused for a week because nothing created a session. This migration adds the columns the
-- WRITERS need and touches neither the CHECK nor the default.
--
-- WRITE AT BEGIN, NOT AT END. This is the design point D89 exists to protect: if the row were written
-- when the session ends, only sessions that ended politely would exist, an abandoned window would
-- write nothing and vanish from the denominator, and deflection would inflate for a reason
-- unrelated to the product. So `POST /v1/session {event: "begin"}` inserts the row on the first turn,
-- and `ended_at` staying NULL is what an abandoned session looks like.

-- Which machine. Self-asserted (the endpoint's own hostname), like tickets.machine_name, and kept
-- for the same reason: D89 says every figure drills down to its sessions, and a session with
-- nothing on it drills down to a uuid.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS machine_name text;

-- WHY THE OUTCOME IS WHAT IT IS. D186 reports trend per category and never only in aggregate, so a
-- session needs a category to group by. It is ONE column with TWO vocabularies, stated honestly:
--   escalated  -> the ticket's category ('hardware', 'account_or_licensing', ...), set by the ticket
--                 insert in the same transaction that flips the outcome;
--   resolved   -> the capability the user confirmed fixed it ('flush_dns', 'restart_service', ...),
--                 sent by the endpoint with the confirmation;
--   unresolved -> NULL, shown as "uncategorised". A session that never reached a fix or a ticket
--                 has no category to have.
-- A reader of the Metrics table sees both kinds in one column and the page says so. Splitting them
-- would be two half-empty columns saying the same thing.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS category text;

-- When each transition happened. `resolved_at` is the moment the user said yes; `escalated_at` is
-- the ticket insert. Both nullable, both set by exactly one code path each (src/sessions/store.js).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS resolved_at  timestamptz;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS escalated_at timestamptz;

-- The user's explicit "no, that did not fix it" (D238). It does NOT change `outcome` — the session
-- stays 'unresolved', which is what it was — but it is a different fact from silence, and the
-- register asked that a non-answer not be recorded as a "no". So the "no" gets its own timestamp
-- and silence gets none. Metrics can then say "of N unresolved, M told us so".
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS not_fixed_at timestamptz;

-- Reporting reads "outcome by category over a window"; tenant/002's (outcome, started_at) index
-- covers the aggregate, this covers the D186 breakdown.
CREATE INDEX IF NOT EXISTS sessions_category ON sessions (category, outcome);

-- ---------------------------------------------------------------------------------------------
-- Tickets: the human's own account of what fixed it.
--
-- NOT BUILT AS A LOOP, DELIBERATELY NOT FORECLOSED. When a ticket closes, the person who solved it
-- has written why. That close note is the highest-value text in the system — authoritative because
-- it worked, free because they were closing the ticket anyway — and turning it into a draft in the
-- review queue is the compounding loop (D168's drafts feed). The loop needs session outcomes first
-- (this migration) and a drafting step (not built). What it needs from the SCHEMA is one column for
-- the note to land in, on the record whose author writes it: the ticket. The console's state form
-- offers it as an optional field when moving to resolved or closed; nothing reads it yet except the
-- ticket's own detail page and the CLI.
--
-- The session it belongs to is `tickets.session_id`, which is populated from this pass on (the
-- endpoint sends its session id with the ticket, and the insert flips that session to 'escalated').
-- ---------------------------------------------------------------------------------------------
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS close_note text;
