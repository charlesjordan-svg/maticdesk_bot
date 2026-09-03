-- B1 tenant 001 — the per-tenant baseline.
--
-- D143: one data schema per tenant. This file is the TEMPLATE: the runner applies it to every
-- schema named in control.tenants, and to each new schema at creation, so a tenant added in six
-- months gets every migration ever written without anyone remembering to run it.
--
-- IMPORTANT: no `CREATE SCHEMA` and no schema qualification anywhere in this file. The runner
-- opens a transaction, asserts the schema name against control.tenants, and sets `search_path`
-- inside that transaction (src/db/tenant.js). Unqualified DDL therefore lands in the right schema,
-- and the SAME file can run against every tenant unchanged — which is what makes exit criteria 3
-- and 4 possible at all.
--
-- What is deliberately NOT here: tickets, KB articles and chunks, ingested audit records. Those
-- arrive with the items that need them (B3, B5, B7). B1 establishes the pattern and the path, not
-- the features. `vector` is available to any of them without a further migration, because the
-- extension is installed once database-wide and `extensions` is on every tenant's search_path
-- (control/001) — a tenant table can declare a `vector(768)` column with no qualification.

-- ---------------------------------------------------------------------------------------------
-- The per-tenant migration ledger. Each schema records its own applied versions, so schemas can
-- legitimately be at different versions mid-rollout without the runner losing track.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    text        PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  -- The checksum of the file as applied. If the file later changes, the runner says so rather
  -- than silently treating a different migration as already done.
  checksum   text        NOT NULL
);

-- ---------------------------------------------------------------------------------------------
-- Users. The tenant's own people, resolved from their directory (D55, D145 SCIM) rather than
-- invented here. `caller_id` resolution and KB entitlement both read this.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The logon SID the broker attests (D148). The endpoint's answer to "who is this", not ours.
  logon_sid     text,
  -- The directory's identifier. Kept OUT of the primary key deliberately (D56, D86a): an ITSM or
  -- IdP id must never become the thing rows point at.
  external_id   text,
  upn           text,
  display_name  text,
  status        text        NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_sid_unique UNIQUE (logon_sid),
  CONSTRAINT users_external_unique UNIQUE (external_id),
  CONSTRAINT users_status_known CHECK (status IN ('active', 'disabled'))
);

-- ---------------------------------------------------------------------------------------------
-- Sessions. One conversation. Created here because nearly everything later references it, and
-- because it is what exit criterion 2's isolation test needs something real to try to read.
--
-- No transcript content in B1. D154 puts transcript access behind the audience-change predicate
-- and three tiers; storing the text before that mechanism exists would be storing something we
-- have not yet decided who may read.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES users(id),
  -- The control-plane device id, as a bare uuid. NOT a foreign key: a per-tenant schema must not
  -- hold a reference the control plane can follow back, and cross-schema FKs would make dropping
  -- a tenant schema depend on control-plane state. Integrity here is the application's job.
  device_id   uuid,
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id, started_at DESC);
