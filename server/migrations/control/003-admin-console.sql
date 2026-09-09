-- B2 003 — what the admin console needs that control/001 did not give it.
--
-- control/001 put the SHAPES of D152–D160 in place before those decisions were ratified (register
-- §5.7b), and it deliberately built no logic. B2 is the logic. Three things were missing from the
-- shapes once a login page and a permission check actually had to run against them, and one of
-- them is a decision rather than a column.
--
-- Everything here is IF NOT EXISTS / ON CONFLICT DO NOTHING, for the same reason as 001: the state
-- you are in when a run fails is half-applied.
--
-- ---------------------------------------------------------------------------------------------
-- DECISION PROVENANCE (register §5.7b) — status of each decision WHEN THIS FILE WAS WRITTEN,
-- 2026-09-09. Appended to, never rewritten.
--   Ratified as a set 2026-09-04 .......... D152, D155, D156, D157, D160
--   Ratified as a set 2026-09-04 .......... D177 (the admin's home surface is a review queue)
--   Decided by the founder 2026-09-09 ..... D221–D224 (register §5.23; recorded by the session
--                                           that wrote this file, from answers given in chat)
-- ---------------------------------------------------------------------------------------------

-- ---------------------------------------------------------------------------------------------
-- 1. Roles carry permissions. control/001 had the role and the grant but NOWHERE FOR A PERMISSION
--    TO LIVE, so "permissions never attach to users directly" (D152) was a comment rather than a
--    constraint. This is the table the comment was about. There is deliberately no
--    admin_user_permissions table and none should ever be added; test/admin-static.test.mjs fails
--    if one appears.
--
--    A permission is a dotted string ("tickets.write"), not an enum: the console adds screens
--    faster than anyone should be writing ALTER TYPE. The known set is in src/admin/permissions.js
--    and the seed below; a permission string nobody checks for is harmless.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS control.admin_role_permissions (
  role_id    uuid NOT NULL REFERENCES control.admin_roles(id) ON DELETE CASCADE,
  permission text NOT NULL,
  PRIMARY KEY (role_id, permission),
  CONSTRAINT admin_permission_shape CHECK (permission ~ '^[a-z]+(\.[a-z_]+)+$')
);

-- ---------------------------------------------------------------------------------------------
-- 2. Server-side sessions (handover §2: "HttpOnly, Secure, SameSite=Lax, server-side store").
--
--    The cookie carries a random token; THIS TABLE STORES ITS SHA-256, never the token. A read of
--    this table therefore does not log anyone in, which is the same posture as
--    control.enrollment_secrets.secret_hash.
--
--    tenant_id is denormalised from admin_users so every request's tenant scope is one row read,
--    and so a user moved between tenants (there is no such path today) would not carry an old
--    session's scope with them — the session would simply stop matching.
--
--    csrf_secret is per session: the CSRF token on every form is HMAC(csrf_secret, purpose), so
--    a token cannot be replayed into another session and nothing about it needs storing per form.
--
--    totp_verified_at is what D157's step-up will read ("re-authenticated within the last N
--    minutes"). Nothing consumes it in this pass — none of D157's five actions exists in the
--    console yet — and the column is here so that step-up is a check to add, not a migration.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS control.admin_sessions (
  token_hash       text        PRIMARY KEY,
  admin_user_id    uuid        NOT NULL REFERENCES control.admin_users(id) ON DELETE CASCADE,
  tenant_id        uuid        REFERENCES control.tenants(id),
  csrf_secret      text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  revoked_at       timestamptz,
  totp_verified_at timestamptz
);
CREATE INDEX IF NOT EXISTS admin_sessions_user ON control.admin_sessions (admin_user_id)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------------------------
-- 3. TOTP replay defence (D156). RFC 6238 §5.2: a verifier MUST NOT accept the same one-time code
--    twice. The counter of the last accepted step is stored per user, and a code whose step is not
--    greater than it is refused even when it would otherwise verify. Without this a code read over
--    someone's shoulder is good for the rest of its thirty seconds.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE control.admin_users ADD COLUMN IF NOT EXISTS totp_last_step bigint;
ALTER TABLE control.admin_users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- ---------------------------------------------------------------------------------------------
-- 4. The five roles (D152), seeded. Names are stable identifiers the CLI and the tests use;
--    display is the console's problem.
--
--    vendor_staff carries NO permissions. D153 makes vendor access a time-boxed grant the customer
--    enables, never a standing permission, and vendor_access_grants is the shape for that. The
--    console refuses a vendor login outright in this pass and says why (src/admin/router.js),
--    because a grant-evaluation path is not built and a vendor row that can log in to nothing is
--    more honest than one that can log in to something by accident.
--
--    auditor is the read-only role exit criterion 2 needs: it can see audit, metrics, tickets and
--    settings, and it CANNOT see the review queue or the knowledge base, and it cannot change a
--    ticket. A test logs in as one and tries.
-- ---------------------------------------------------------------------------------------------
INSERT INTO control.admin_roles (name, scope) VALUES
  ('vendor_staff', 'vendor'),
  ('tenant_owner', 'tenant'),
  ('tenant_admin', 'tenant'),
  ('it_agent',     'tenant'),
  ('auditor',      'tenant')
ON CONFLICT (name) DO NOTHING;

INSERT INTO control.admin_role_permissions (role_id, permission)
SELECT r.id, p.permission
  FROM control.admin_roles r
  JOIN (VALUES
    -- tenant_owner: everything a tenant can do, including managing its admins.
    ('tenant_owner', 'review.read'),   ('tenant_owner', 'review.act'),
    ('tenant_owner', 'tickets.read'),  ('tenant_owner', 'tickets.write'),
    ('tenant_owner', 'knowledge.read'),('tenant_owner', 'knowledge.write'),
    ('tenant_owner', 'metrics.read'),
    ('tenant_owner', 'agents.read'),   ('tenant_owner', 'agents.manage'),
    ('tenant_owner', 'settings.read'), ('tenant_owner', 'settings.write'),
    ('tenant_owner', 'admins.manage'),
    ('tenant_owner', 'audit.read'),
    -- tenant_admin: the same minus managing admins. The owner is the one who appoints admins.
    ('tenant_admin', 'review.read'),   ('tenant_admin', 'review.act'),
    ('tenant_admin', 'tickets.read'),  ('tenant_admin', 'tickets.write'),
    ('tenant_admin', 'knowledge.read'),('tenant_admin', 'knowledge.write'),
    ('tenant_admin', 'metrics.read'),
    ('tenant_admin', 'agents.read'),   ('tenant_admin', 'agents.manage'),
    ('tenant_admin', 'settings.read'), ('tenant_admin', 'settings.write'),
    ('tenant_admin', 'audit.read'),
    -- it_agent / fulfiller: the person who works the queue and the tickets. No settings.
    ('it_agent', 'review.read'),       ('it_agent', 'review.act'),
    ('it_agent', 'tickets.read'),      ('it_agent', 'tickets.write'),
    ('it_agent', 'knowledge.read'),    ('it_agent', 'knowledge.write'),
    ('it_agent', 'metrics.read'),
    -- auditor / security: reads, and only some of them.
    ('auditor', 'audit.read'),
    ('auditor', 'metrics.read'),
    ('auditor', 'tickets.read'),
    ('auditor', 'settings.read')
  ) AS p(role_name, permission) ON p.role_name = r.name
ON CONFLICT DO NOTHING;
