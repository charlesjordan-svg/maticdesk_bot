-- B1 001 — the control plane, and the one shared extension schema.
--
-- D143: one shared control-plane schema, plus one data schema per tenant. This file is the shared
-- half. It holds the records that are ABOUT tenants and devices; it holds no customer data.
--
-- Everything here is created IF NOT EXISTS or is otherwise safe to re-run: the runner records
-- applied versions and skips them, but a migration that is also idempotent in itself survives a
-- half-applied run, which is the state you are actually in when something goes wrong at 2am.
--
-- ---------------------------------------------------------------------------------------------
-- DECISION PROVENANCE (register §5.7b)
--
-- Where this file implements a decision, the comment names the decision AND the status that
-- decision held WHEN THIS MIGRATION WAS WRITTEN. The status is not rewritten when a decision is
-- later ratified — it is only appended to, as "(PROPOSED when written; ratified <date>)".
--
-- That is deliberate and it is the whole point of the convention. A comment that silently tracked
-- current status would lose the only fact that made the finding in register §5.7 visible: that
-- these shapes went into a migration that ran against a real database BEFORE the decisions behind
-- them were accepted. That was not a defect — D160 asked for the shapes and shapes are free now
-- and expensive later — but it is not something a reader should have to reconstruct by hand.
-- Reconstructing it by hand is how the finding surfaced at all, and that does not repeat.
--
-- So: a reader can tell which shapes were bets, and the next ratification pass greps for
-- provenance instead of re-deriving it.
--
-- Status of every decision this file implements, as of 2026-09-04:
--   Ratified 2026-09-03 or earlier .... D143, D151
--   Ratified as a set 2026-09-04 ...... D152, D153, D154, D155, D156, D157, D158, D159, D160
--                                       (PROPOSED when this migration was written)
--   Ratified as a set 2026-09-04 ...... D193-D197 (B1's own decisions, from building this)
--   Still PROPOSED .................... D133, D146, D160's D56 precedent's own set (D42-D90 review
--                                       set), and D202 (register §5.7a) which would add vendor-grant
--                                       creation to D157's step-up list. D202 needs no schema change
--                                       either way: admin_audit.step_up is indifferent to the list.
-- ---------------------------------------------------------------------------------------------

-- ---------------------------------------------------------------------------------------------
-- Extensions. ONE schema, for the whole database.
--
-- A PostgreSQL extension is installed into a DATABASE, and its objects live in exactly one schema.
-- It cannot be installed once per tenant schema. So the plan of record — "pgvector enabled in the
-- per-tenant schema template" (the B1 handover, citing a `D52a` that does not exist; the real
-- citations are D59a and D143) — is not implementable as written, and would fail on the second
-- tenant.
--
-- What is implementable, and is what this does: install `vector` ONCE into a dedicated
-- `extensions` schema, and put that schema on every tenant's `search_path` (src/db/tenant.js).
-- Tenant tables then declare `vector` columns without qualifying the type, per-tenant HNSW indexes
-- still live inside the tenant's own schema, and there is one extension to upgrade instead of N.
-- ---------------------------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS control;

-- ---------------------------------------------------------------------------------------------
-- Tenants. The row that authorises a schema name.
--
-- `schema_name` is not decoration: src/db/tenant.js refuses to `SET LOCAL search_path` to any
-- value that is not in this column. `SET` cannot take a bind parameter, so the allow-list IS the
-- injection defence, not merely a tidiness check.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS control.tenants (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text        NOT NULL UNIQUE,
  schema_name  text        NOT NULL UNIQUE,
  display_name text        NOT NULL,
  -- 'active' | 'suspended' | 'offboarding'. Offboarding is a state, not a deletion: tenant
  -- offboarding is on OPEN-6's missing list and will need the row to outlive the data.
  status       text        NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_slug_shape CHECK (slug ~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$'),
  CONSTRAINT tenants_schema_shape CHECK (schema_name ~ '^t_[a-z0-9_]{1,54}$'),
  CONSTRAINT tenants_status_known CHECK (status IN ('active', 'suspended', 'offboarding'))
);

-- ---------------------------------------------------------------------------------------------
-- Devices and enrollment. Shapes only — B1 builds no enrollment logic (that is B3).
--
-- D160 (PROPOSED when this migration was written; ratified 2026-09-04) — the schema must not
--   foreclose what comes later. These tables exist now because adding columns to an empty table is
--   free and adding them to a populated one is not. D160 argued that about federation columns
--   specifically; it is not a general licence to front-run decisions (register §5.7b).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS control.devices (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES control.tenants(id),
  -- The device's public key / assertion identity (D60-D65, D146). Opaque here.
  device_key_id text        NOT NULL,
  -- 'standalone' | 'joined'. Written at enrollment, checked at RUNTIME, not install time (D151).
  mode          text        NOT NULL DEFAULT 'standalone',
  status        text        NOT NULL DEFAULT 'pending',
  enrolled_at   timestamptz,
  revoked_at    timestamptz,
  last_seen_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT devices_key_unique UNIQUE (tenant_id, device_key_id),
  CONSTRAINT devices_mode_known CHECK (mode IN ('standalone', 'joined')),
  CONSTRAINT devices_status_known CHECK (status IN ('pending', 'active', 'revoked'))
);
CREATE INDEX IF NOT EXISTS devices_tenant_status ON control.devices (tenant_id, status);

CREATE TABLE IF NOT EXISTS control.enrollment_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES control.tenants(id),
  device_key_id text       NOT NULL,
  -- 'pending' | 'approved' | 'rejected' | 'expired'. D83's anomaly fallback turns auto-approve
  -- into a queue, so the queue has to exist even when auto-approve is the default.
  status       text        NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  decided_by   uuid,
  CONSTRAINT enrollment_status_known CHECK (status IN ('pending', 'approved', 'rejected', 'expired'))
);
CREATE INDEX IF NOT EXISTS enrollment_pending ON control.enrollment_requests (tenant_id, status);

CREATE TABLE IF NOT EXISTS control.enrollment_secrets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES control.tenants(id),
  -- A HASH. The secret itself is never stored, so a database read does not enrol a device.
  secret_hash bytea       NOT NULL,
  -- Rotatable and time-boxed, per D83's shape.
  issued_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);
CREATE INDEX IF NOT EXISTS enrollment_secrets_live ON control.enrollment_secrets (tenant_id, expires_at)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------------------------
-- Releases. Shape only. D133 moves both halves in one installer; D151 has standalone endpoints
-- fetching it from a pinned URL, which is why the row records a signature and not a blob.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS control.releases (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  version      text        NOT NULL UNIQUE,
  channel      text        NOT NULL DEFAULT 'stable',
  -- The pinned URL and the signature over the installer. Never the installer itself.
  artifact_url text        NOT NULL,
  signature    bytea,
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT releases_channel_known CHECK (channel IN ('stable', 'test-ring'))
);

-- ---------------------------------------------------------------------------------------------
-- The job queue. THE ONE DELIBERATE CROSS-TENANT TABLE.
--
-- It carries REFERENCES, NOT PAYLOADS. A job row names a tenant schema and a row id inside it;
-- it does not copy the row. There is deliberately no `payload jsonb` column, and adding one is
-- the change this comment exists to argue against: with references, a bug that leaks a job row
-- leaks a schema name and a uuid. With payloads, the same bug leaks customer data out of the one
-- table that is not tenant-scoped.
--
-- `tenant_schema` is FK'd to control.tenants(schema_name) so a job cannot name a schema that does
-- not exist — the worker's assertion (D143) then has something real to assert against.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS control.job_queue (
  id            bigserial   PRIMARY KEY,
  type          text        NOT NULL,
  tenant_schema text        NOT NULL REFERENCES control.tenants(schema_name),
  -- The reference. What it points AT is defined by `type`. Not a payload: no free-text, no jsonb.
  ref_id        uuid,
  status        text        NOT NULL DEFAULT 'queued',
  attempts      int         NOT NULL DEFAULT 0,
  run_after     timestamptz NOT NULL DEFAULT now(),
  locked_by     text,
  locked_at     timestamptz,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_status_known CHECK (status IN ('queued', 'running', 'done', 'failed'))
);

-- The index the claim query actually uses: FOR UPDATE SKIP LOCKED over queued rows due to run.
CREATE INDEX IF NOT EXISTS job_queue_claimable ON control.job_queue (run_after, id)
  WHERE status = 'queued';

-- ---------------------------------------------------------------------------------------------
-- Admin identity.
--
-- D155 (PROPOSED when written; ratified 2026-09-04) — local accounts are v1-testing-and-then-
--   break-glass, one per tenant, TOTP mandatory, use alerts the tenant owner.
-- D159, D160 (PROPOSED when written; ratified 2026-09-04) — the schema must not foreclose OIDC
--   federation, so external identity sits ALONGSIDE local credentials rather than replacing a
--   column later. The hub is a relying party and never an identity provider.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS control.admin_users (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL tenant_id = vendor staff. Vendor access is the highest-privilege position in the system
  -- (D153, threat model A6/G2) and is granted per-window in vendor_access_grants, never standing.
  tenant_id      uuid        REFERENCES control.tenants(id),
  email          text        NOT NULL,
  -- Local credential. NULL when the user only ever authenticates through the tenant's IdP.
  password_hash  text,
  -- D156 (PROPOSED when written; ratified 2026-09-04) — TOTP from day one, even in the
  --   local-accounts phase. A password alone will not survive a security review of a console that
  --   reads employee transcripts and the PII table (D58).
  totp_secret    bytea,
  -- Federation, alongside not instead: the issuer + subject the IdP asserts.
  external_issuer  text,
  external_subject text,
  status         text        NOT NULL DEFAULT 'active',
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_email_unique UNIQUE (tenant_id, email),
  CONSTRAINT admin_external_unique UNIQUE (external_issuer, external_subject),
  CONSTRAINT admin_status_known CHECK (status IN ('active', 'disabled')),
  -- Some credential must exist, or the row cannot authenticate anything.
  CONSTRAINT admin_has_a_credential CHECK (password_hash IS NOT NULL OR external_subject IS NOT NULL)
);

-- D152 (PROPOSED when this migration was written; ratified 2026-09-04) — five hub actors, not one.
--   Roles are first-class and carry permissions; permissions NEVER attach to users directly. The
--   alternative becomes unauditable at roughly five hundred grants.
CREATE TABLE IF NOT EXISTS control.admin_roles (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name      text NOT NULL UNIQUE,
  -- 'vendor' | 'tenant'. A vendor role can never be granted on a tenant and vice versa.
  scope     text NOT NULL,
  CONSTRAINT admin_role_scope_known CHECK (scope IN ('vendor', 'tenant'))
);

CREATE TABLE IF NOT EXISTS control.admin_role_grants (
  admin_user_id uuid NOT NULL REFERENCES control.admin_users(id) ON DELETE CASCADE,
  role_id       uuid NOT NULL REFERENCES control.admin_roles(id),
  granted_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (admin_user_id, role_id)
);

-- D156 (PROPOSED when this migration was written; ratified 2026-09-04) — admin-action audit from
--   day one, even in the local-accounts phase. Listed as absent in review B8.
CREATE TABLE IF NOT EXISTS control.admin_audit (
  id            bigserial   PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  admin_user_id uuid        REFERENCES control.admin_users(id),
  tenant_id     uuid        REFERENCES control.tenants(id),
  action        text        NOT NULL,
  -- D155 (PROPOSED when written; ratified 2026-09-04) — break-glass local-account use is its own
  --   event class and alerts the tenant owner.
  event_class   text        NOT NULL DEFAULT 'normal',
  -- D157 (PROPOSED when written; ratified 2026-09-04) — step-up re-authentication was satisfied
  --   for this action, or was not required. D157's list is fleet-wide revocation, audit export,
  --   transcript access, policy changes and IdP configuration.
  --
  -- D202 (PROPOSED, register §5.7a, awaiting the founder) would add vendor-grant creation and
  --   modification to that list. NO SCHEMA CHANGE either way: this column is indifferent to what
  --   is on the list, which is why D202 gates nothing.
  step_up       boolean     NOT NULL DEFAULT false,
  subject       text,
  detail        jsonb,
  CONSTRAINT admin_audit_class_known CHECK (event_class IN ('normal', 'break-glass', 'vendor-access'))
);
CREATE INDEX IF NOT EXISTS admin_audit_at ON control.admin_audit (at DESC);

-- ---------------------------------------------------------------------------------------------
-- D153 (PROPOSED when this migration was written; ratified 2026-09-04) — vendor access is the
--   highest-privilege position in the system and was previously unconstrained: nothing in the
--   invariants stopped a support engineer reading employee transcripts across every customer. It
--   becomes a time-boxed grant the customer enables: default off, expiring, visible to the tenant
--   while active. This is threat-model A6/G2 given a control.
-- D154 (PROPOSED when written; ratified 2026-09-04) — transcript content requires a grant naming a
--   window; metadata does not.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS control.vendor_access_grants (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES control.tenants(id),
  granted_to     uuid        NOT NULL REFERENCES control.admin_users(id),
  -- 'metadata' | 'transcripts'. Two tiers, because they are different decisions for the customer.
  level          text        NOT NULL,
  -- The window the grant names. For transcripts this is the SESSION window, not the grant's own
  -- validity: "you may read what happened last Tuesday", which is not "you may read for a week".
  window_start   timestamptz,
  window_end     timestamptz,
  granted_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  granted_by     uuid        REFERENCES control.admin_users(id),
  CONSTRAINT vendor_level_known CHECK (level IN ('metadata', 'transcripts')),
  -- A transcript grant with no window is the unbounded access D153 exists to prevent.
  CONSTRAINT vendor_transcripts_need_a_window
    CHECK (level <> 'transcripts' OR (window_start IS NOT NULL AND window_end IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS vendor_grants_live ON control.vendor_access_grants (tenant_id, expires_at)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------------------------
-- D158 (PROPOSED when this migration was written; ratified 2026-09-04) — DELIBERATELY NO TABLE.
--
-- Author /= approver for catalog changes, as a role constraint enforced by the permission model.
-- It is the one decision in the D152-D160 set with no shape behind it, and that absence is the
-- correct signal rather than an omission: D149 deferred catalog distribution out of Phase 1, so
-- there are no drafts to approve and nothing for the constraint to act on.
--
-- D158 is RATIFIED AND INERT IN PHASE 1. If a later migration adds an approval workflow here, that
-- is Phase 2 scope arriving through the back door and should be stopped rather than absorbed
-- (register §5.7).
-- ---------------------------------------------------------------------------------------------
