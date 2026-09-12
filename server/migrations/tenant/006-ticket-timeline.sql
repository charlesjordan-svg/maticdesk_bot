-- Tenant 006 — the ticket timeline: one table for work notes, comments and state changes, with
-- visibility a property of the row. WORK NOTES ONLY are written in this build.
--
-- DECISION PROVENANCE (register §5.7b). Status is the status held WHEN THIS MIGRATION WAS WRITTEN.
--   D275 (PROPOSED 2026-09-12) — a ticket carries a timeline with two visibilities, `internal`
--     (work notes; the requester can never see or be sent one) and `public` (comments and state
--     changes; requester-visible ONCE something can deliver them, which nothing can yet). Visibility
--     is decided by the kind of entry, in one write path (src/tickets/query.js), never by a caller;
--     the two CHECKs below are the database's copy of that rule. This phase ships ONE composer, the
--     console's "Add work note", and NO requester-visible composer — see WHY NOT below.
--   D276 (PROPOSED 2026-09-12) — the console shows the AGE of the oldest unanswered requester
--     comment on every ticket screen, not a count. `tickets.awaiting_agent_since` is its clock: set
--     when a requester comments on a live ticket, cleared when a console user answers publicly. In
--     this build it has a READER and no writer — no requester can comment — and the indicator says
--     so in words rather than showing an empty cell.
--   D277 (PROPOSED 2026-09-12) — retention: see RETENTION below. Decided here, in the migration that
--     creates the table, rather than after it fills (plan v3 §7.1).
--   D269 (RATIFIED 2026-09-12) — every column of the ticket store has code naming it or an entry on
--     the reserved list the suite reads. `notified_at` and `read_by_requester_at` are RESERVED in
--     test/admin-db.test.mjs §5c with this file's reason: they are P4's, stamped by the hub on
--     delivery and on the endpoint's ack, and nothing in this build delivers or acks.
--   D224 (ratified 2026-09-09) — one query layer. All SQL against this table is in
--     src/tickets/query.js; the console and `bin/tickets.mjs show` render the same rows through
--     `listEntries()`, which takes a REQUIRED visibility argument with no default.
--   D143 (ratified 2026-09-04) — one schema per tenant. `author_admin_user_id` carries NO foreign
--     key on purpose: console users live in the control plane (control.admin_users) and this is
--     tenant data; a cross-schema FK would tie a tenant's rows to the control plane's lifecycle.
--     `author_label` is the console user's email AS AT WRITE TIME — a snapshot, not a join, so the
--     timeline still reads correctly after that account is renamed or removed.
--   D229 (ratified 2026-09-09) — the KB question log's 90-day text sweep, the precedent RETENTION
--     below considers and deliberately does not copy.
--
-- WHY NOT A REQUESTER-VISIBLE COMPOSER IN THIS BUILD (plan v3 §0 finding 8)
--
-- A "Reply to requester" button that reaches nobody for three phases is this project's signature
-- defect — a UI implying an integration that does not exist — built on purpose, for three or four
-- weeks. So `kind = 'comment'` is a legal value here (the shape is cheap now and expensive later,
-- D160's argument) and `addEntry()` REFUSES to write one: WRITABLE_KINDS in query.js is work_note
-- and state_change, and test/admin-static.test.mjs §5d pins that list. Comments arrive in P4 with
-- the delivery path and per-entry delivery state; `resolution` arrives in P2 with the resolution
-- code. Both need the columns and constraints declared here to already exist.
--
-- STATE CHANGES ARE PUBLIC. `setTicketState()` writes a `state_change` entry ("open → resolved")
-- inside the same transaction as the move. It is public because the moment a requester can see a
-- ticket (P4), the state moving is the fact they most need to see (§3 of the plan: "Requester
-- told: yes — the notification that matters most"). The INTERNAL resolution note written on the
-- same move stays a column on `tickets` (D269) and is never copied into the entry.
--
-- RETENTION (D277) — decided: ticket free text lives as long as the ticket record, and the ticket
-- record's own retention is ONE future decision, not a per-column sweep.
--
-- The obvious move is to mirror D229 — clear `body` after 90 days and keep the row. It is refused,
-- for a reason worth writing down. D229's text is INCIDENTAL: a question the hub happened to log
-- for gap analysis, with no user attached, whose value decays in weeks. A work note is THE RECORD:
-- the desk's own account of what was done, on a ticket whose `description` (the reporter's own
-- words, the same PII class) and `internal_resolution_note` have no sweep at all. Sweeping entry
-- bodies at 90 days while both of those stand would delete the half of the record the desk wrote
-- and keep the half the reporter wrote — retention theatre pointed at the wrong column. And
-- `body` is NOT NULL, so D229's "NULL the text, keep the row" is not even the same operation here.
--
-- So: `ticket_entries` rows live and die with their ticket (the FK below; a ticket purge, when one
-- exists, removes its entries in the same statement or the FK refuses), and the retention of the
-- ticket record as a whole — description, summary, notes, entries, the reporter's profile row —
-- is OPEN-12 in the register: a decision for a customer's retention schedule and D127's disclosure
-- wording, made once for the record and not once per column. Until it is made, NOTHING here is
-- swept, and this paragraph is where that is said rather than left to be discovered.
--
-- IDEMPOTENT: CREATE TABLE / ADD COLUMN / CREATE INDEX all IF NOT EXISTS; the CHECKs are inline in
-- the CREATE TABLE so they need no pg_constraint guard. test/db.test.mjs §4 runs this file a second
-- time against a migrated tenant and asserts the catalog did not change.

CREATE TABLE IF NOT EXISTS ticket_entries (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id             uuid        NOT NULL REFERENCES tickets(id),

  -- What kind of entry, and who may see it. `visibility` is written by ONE code path from `kind`
  -- (query.js KIND_VISIBILITY); the two constraints after the enums are the database's version of
  -- that rule, so a future writer cannot make a work note public or let a requester write an
  -- internal row, whatever its own code says.
  kind                  text        NOT NULL,
  visibility            text        NOT NULL,
  body                  text        NOT NULL,

  -- Who wrote it. A console user is identified by control-plane id (no FK, D143) and by the email
  -- they had at the time; a requester by the tenant's users row; `agent` is reserved for the
  -- endpoint's own software; `system` is the hub or the CLI acting without a person attached.
  author_kind           text        NOT NULL,
  author_user_id        uuid        REFERENCES users(id),
  author_admin_user_id  uuid,
  author_label          text,

  created_at            timestamptz NOT NULL DEFAULT now(),

  -- P4's two stamps, both HUB-STAMPED and never client-sent: when the entry was handed to the
  -- endpoint, and when the endpoint acknowledged it was shown. No writer in this build (reserved,
  -- D269). They exist now so D258's per-entry delivery state is renderable the day delivery exists.
  notified_at           timestamptz,
  read_by_requester_at  timestamptz,

  CONSTRAINT ticket_entries_kind_known       CHECK (kind IN ('comment', 'work_note', 'state_change', 'resolution')),
  CONSTRAINT ticket_entries_visibility_known CHECK (visibility IN ('public', 'internal')),
  CONSTRAINT ticket_entries_author_known     CHECK (author_kind IN ('requester', 'console_user', 'agent', 'system')),
  -- A work note is internal, always. A requester writes public entries, only.
  CONSTRAINT ticket_entries_work_note_internal CHECK (kind <> 'work_note' OR visibility = 'internal'),
  CONSTRAINT ticket_entries_requester_public   CHECK (author_kind <> 'requester' OR visibility = 'public')
);

-- The timeline read: one ticket's entries in order.
CREATE INDEX IF NOT EXISTS ticket_entries_ticket ON ticket_entries (ticket_id, created_at);
-- P4's delivery scan: requester entries the hub has not yet handed to anyone. Partial, so it stays
-- small; unused until P4 writes notified_at.
CREATE INDEX IF NOT EXISTS ticket_entries_unnotified ON ticket_entries (ticket_id)
  WHERE author_kind = 'requester' AND notified_at IS NULL;

-- D276's clock. NULL means no requester comment is waiting. Set by the requester-comment route
-- (P4, gated on D271), cleared by a console user's public reply (also P4). Read now by
-- `oldestUnansweredRequesterComment()` so the indicator exists before the thing it measures does,
-- and says so.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS awaiting_agent_since timestamptz;
