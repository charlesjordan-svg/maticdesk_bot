-- B6-lite tenant 003 — the internal ticket store, and the user profile that fills it.
--
-- D213 (PROPOSED when written). D73 made the internal ticket store core and D84 made the hub the
-- system of record for tickets wherever no ITSM integration exists — which, per the Phase 1 plan
-- §2, is most customers. This migration is the smallest thing that makes "open a ticket for me"
-- true rather than a promise the UI cannot keep.
--
-- WHAT THIS IS NOT. OPEN-4's v1 subset is create, assign, state machine, visibility-split comments
-- (D69), attachments, search, dashboard, PLUS email notification to an IT alias (D86). This file
-- is create and a minimal state machine. **There is no outbound email**, and D86 is explicit that
-- without it the store is not a queue: with the hub as system of record and no ITSM there is no
-- assignment group, no on-call rotation and no L2 queue, because those came free with the ITSM.
--
-- That gap is deliberate and it is CARRIED IN THE UI, not just in this comment. The endpoint tells
-- the user the ticket reference and that no one has been emailed yet. The failure this avoids is
-- specific and was observed on the dev box on 2026-09-02: a UI that implies an integration that
-- does not exist. Filing into a table nobody watches, and saying "a ticket has been raised", would
-- be that same defect wearing a database.
--
-- WHY TENANT AND NOT CONTROL. A ticket carries the reporter's name, location and contact details.
-- That is tenant data under D143's one-schema-per-tenant rule, and it is reached only through
-- withTenant() (src/db/tenant.js). Note what that does NOT buy: search_path confines accident,
-- not intent (D195, B1-CONTROL-PLANE.md §6).

-- ---------------------------------------------------------------------------------------------
-- The user profile.
--
-- `users` already exists from tenant/001, shaped for a directory (D55, D145 SCIM) that does not
-- exist yet. These columns are the self-asserted profile the endpoint can actually supply today:
-- the person types them once and the endpoint keeps them locally (D215).
--
-- SELF-ASSERTED IS THE WHOLE CAVEAT. `logon_sid` is the column that would carry an attested
-- identity (D148, the broker's answer to "who is this"), and it stays NULL because the pipe that
-- would carry it is designed and not built (D200/D201). `os_username` is what the agent read from
-- the OS in the user's own context, so it is worth exactly what user-context software is worth.
-- Nothing here should be read as authentication, and the hub has none either (no device auth,
-- D61/D132). The columns are separate from `external_id` on purpose: when a directory does arrive,
-- it writes `external_id`/`upn` and these become the fallback, rather than a sync having to
-- overwrite whatever a person once typed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name  text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name   text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location    text;
-- Free text on purpose. "Contact id" is whatever this org reaches people by — a work email, an
-- extension, an employee number, a Teams handle. Constraining it to an email address would be
-- deciding a customer's directory shape from here.
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_id  text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS os_username text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_source text NOT NULL DEFAULT 'self_asserted';

-- Idempotent by hand: ADD CONSTRAINT has no IF NOT EXISTS in PostgreSQL 17. Same shape as
-- tenant/002's, for the same reason.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_profile_source_known'
      AND conrelid = (current_schema() || '.users')::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_profile_source_known
      CHECK (profile_source IN ('self_asserted', 'directory', 'attested'));
  END IF;
END
$$;

-- The upsert key, in the absence of device auth. NOT the primary key and NOT unique-with-nulls
-- by accident: a partial unique index so rows that predate a profile (or arrive from a directory
-- with no OS name) do not collide with each other on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS users_os_username_unique
  ON users (os_username) WHERE os_username IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- The human-facing reference.
--
-- A separate sequence rather than the uuid, because a person reads this one out on the phone.
-- Starts at 1000 so the first ticket is MD-1000 and the format does not change width immediately.
-- ---------------------------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS ticket_reference_seq START WITH 1000;

-- ---------------------------------------------------------------------------------------------
-- Tickets.
--
-- D75: a session is a first-class entity DISTINCT from a ticket, and one session may produce zero,
-- one or several tickets. `session_id` is therefore nullable and carries no uniqueness — it is the
-- many side of that relationship drawn cheaply. When sessions are actually created by the endpoint
-- this becomes the link table D75 describes; today the endpoint has no session, and a nullable
-- column records that honestly rather than inventing one per ticket.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tickets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What the user is told and what IT quotes back. Unique, and generated from the sequence above.
  reference    text        NOT NULL UNIQUE,
  user_id      uuid        REFERENCES users(id),
  session_id   uuid        REFERENCES sessions(id),

  -- The reporter's own words, as typed. Kept separate from `summary` because they are different
  -- claims: this is evidence, and the summary is a model's reading of it (D214).
  description       text   NOT NULL,
  -- The model's case note, written FOR THE ASSIGNEE. Never shown to the user as the assistant's
  -- own voice — that was the 2026-09-04 defect D214 records.
  summary           text   NOT NULL,
  what_was_checked  text,
  machine_name      text,

  -- The two escalation enums, enforced here as well as in the client. The client validates them
  -- because a model can invent a value (client/src/agent/prompt.js); the database validates them
  -- because a CHECK is the only version of that rule a future writer cannot skip.
  category      text NOT NULL,
  suggested_owner text,

  -- OPEN-4 asks for a state machine. This is the smallest one that is not a lie: a ticket is new
  -- until a person touches it. No assignment, no transitions enforced, no SLA — those arrive with
  -- the console (B2) that would drive them.
  state        text        NOT NULL DEFAULT 'new',

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tickets_category_known CHECK (category IN (
    'hardware', 'account_or_licensing', 'server_side_outage', 'physical',
    'needs_human_judgement', 'other'
  )),
  -- NULL is a legitimate value: the model is told not to guess an owner, and an unroutable ticket
  -- is still worth filing. The endpoint says so out loud rather than picking a team at random.
  CONSTRAINT tickets_owner_known CHECK (suggested_owner IS NULL OR suggested_owner IN (
    'desktop_support', 'network_team', 'identity_team', 'vendor', 'facilities'
  )),
  CONSTRAINT tickets_state_known CHECK (state IN ('new', 'open', 'resolved', 'closed'))
);

-- The queue read: what is not yet dealt with, newest first. Until B6 grows outbound email this
-- index IS the queue, which is the honest description of where this build stands.
CREATE INDEX IF NOT EXISTS tickets_state ON tickets (state, created_at DESC);
CREATE INDEX IF NOT EXISTS tickets_user ON tickets (user_id, created_at DESC);
-- D186 reports trend per category and never only in aggregate, so make it groupable from the
-- start — the same reasoning as tenant/002's outcome index.
CREATE INDEX IF NOT EXISTS tickets_category ON tickets (category, created_at DESC);
