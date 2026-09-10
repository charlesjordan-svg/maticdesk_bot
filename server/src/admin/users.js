// @ts-check
/**
 * Admin users, roles and grants — the control-plane reads and writes behind login and the CLI.
 *
 * D152: a user has roles; a role has permissions; `permissionsFor()` is the only place the two are
 * joined, and it is what every page check reads. There is no per-user permission anywhere, and
 * test/admin-static.test.mjs fails if a table or a query shaped like one appears.
 *
 * D155: local accounts, TOTP mandatory. `createAdminUser()` always mints a TOTP secret; there is
 * no flag to skip it, because the flag would be used.
 */
import { withControl } from "../db/pool.js";
import { hashPassword, newTotpSecret, randomToken } from "./auth.js";

/**
 * @typedef {object} AdminUser
 * @property {string} id
 * @property {string|null} tenantId
 * @property {string} email
 * @property {string|null} passwordHash
 * @property {Buffer|null} totpSecret
 * @property {number|null} totpLastStep
 * @property {string} status
 * @property {Date} createdAt
 * @property {Date|null} lastLoginAt
 */

const shape = (r) => ({
  id: r.id, tenantId: r.tenant_id, email: r.email, passwordHash: r.password_hash,
  totpSecret: r.totp_secret, totpLastStep: r.totp_last_step === null ? null : Number(r.totp_last_step),
  status: r.status, createdAt: r.created_at, lastLoginAt: r.last_login_at ?? null,
});

/** Case-insensitive on email; a tenant is required because emails are unique per tenant only. */
export async function findAdminByEmail(tenantId, email) {
  return withControl(async (c) => {
    const { rows } = await c.query(
      "SELECT * FROM control.admin_users WHERE tenant_id = $1 AND lower(email) = lower($2)",
      [tenantId, email],
    );
    return rows.length ? shape(rows[0]) : null;
  });
}

/**
 * Login lookup without a tenant: the login form has an email and no tenant picker. An email that
 * exists in TWO tenants is ambiguous and this returns null for it — the form then says "sign in
 * failed" like any other failure, and the fix is the operator's (bin/admin.mjs users shows the
 * collision). Vendor rows (tenant_id NULL) ARE returned, so the router can refuse them by name.
 *
 * @returns {Promise<AdminUser|null>}
 */
export async function findAdminForLogin(email) {
  if (typeof email !== "string" || !email.includes("@")) return null;
  return withControl(async (c) => {
    const { rows } = await c.query("SELECT * FROM control.admin_users WHERE lower(email) = lower($1)", [email.trim()]);
    return rows.length === 1 ? shape(rows[0]) : null;
  });
}

/** @returns {Promise<AdminUser|null>} */
export async function getAdminUser(id) {
  return withControl(async (c) => {
    const { rows } = await c.query("SELECT * FROM control.admin_users WHERE id = $1", [id]);
    return rows.length ? shape(rows[0]) : null;
  });
}

/** Role names granted to a user, sorted. */
export async function rolesFor(adminUserId) {
  return withControl(async (c) => {
    const { rows } = await c.query(
      `SELECT r.name FROM control.admin_role_grants g JOIN control.admin_roles r ON r.id = g.role_id
        WHERE g.admin_user_id = $1 ORDER BY r.name`,
      [adminUserId],
    );
    return rows.map((r) => r.name);
  });
}

/**
 * THE permission read: user -> grants -> roles -> role permissions. One query, one set.
 * @returns {Promise<Set<string>>}
 */
export async function permissionsFor(adminUserId) {
  return withControl(async (c) => {
    const { rows } = await c.query(
      `SELECT DISTINCT p.permission
         FROM control.admin_role_grants g
         JOIN control.admin_role_permissions p ON p.role_id = g.role_id
        WHERE g.admin_user_id = $1`,
      [adminUserId],
    );
    return new Set(rows.map((r) => r.permission));
  });
}

/** Every role with its scope and permission list. For the CLI and the Settings page. */
export async function listRoles() {
  return withControl(async (c) => {
    const { rows } = await c.query(
      `SELECT r.name, r.scope, coalesce(array_agg(p.permission ORDER BY p.permission) FILTER (WHERE p.permission IS NOT NULL), '{}') AS permissions
         FROM control.admin_roles r LEFT JOIN control.admin_role_permissions p ON p.role_id = r.id
        GROUP BY r.id ORDER BY r.scope, r.name`,
    );
    return rows.map((r) => ({ name: r.name, scope: r.scope, permissions: r.permissions }));
  });
}

/** Admin users of one tenant with their roles. NEVER returns a hash or a secret. */
export async function listAdminUsers(tenantId) {
  return withControl(async (c) => {
    const { rows } = await c.query(
      `SELECT u.id, u.email, u.status, u.created_at, u.last_login_at,
              (u.totp_secret IS NOT NULL) AS has_totp, (u.password_hash IS NOT NULL) AS has_password,
              coalesce(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
         FROM control.admin_users u
         LEFT JOIN control.admin_role_grants g ON g.admin_user_id = u.id
         LEFT JOIN control.admin_roles r ON r.id = g.role_id
        WHERE ($1::uuid IS NULL AND u.tenant_id IS NULL) OR u.tenant_id = $1
        GROUP BY u.id ORDER BY u.email`,
      [tenantId],
    );
    return rows.map((r) => ({
      id: r.id, email: r.email, status: r.status, createdAt: r.created_at, lastLoginAt: r.last_login_at,
      hasTotp: r.has_totp, hasPassword: r.has_password, roles: r.roles,
    }));
  });
}

/**
 * Create a local admin with a password and a TOTP secret, and grant one role. Returns what the
 * operator must hand to the person ONCE: the initial password (generated when not supplied) and
 * the TOTP secret. Neither is stored in the clear and neither is ever shown again.
 *
 * @param {{ tenantId: string|null, email: string, roleName: string, password?: string }} p
 * @returns {Promise<{ id: string, email: string, password: string, totpSecret: Buffer, role: string }>}
 */
export async function createAdminUser({ tenantId, email, roleName, password }) {
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`not an email address: ${JSON.stringify(email)}`);
  const initial = password ?? randomToken(18);
  const passwordHash = hashPassword(initial);
  const totpSecret = newTotpSecret();
  return withControl(async (c) => {
    const { rows: roles } = await c.query("SELECT id, scope FROM control.admin_roles WHERE name = $1", [roleName]);
    if (!roles.length) throw new Error(`no such role ${JSON.stringify(roleName)}; see bin/admin.mjs roles`);
    const role = roles[0];
    // A vendor role can never be granted on a tenant and vice versa (control/001's comment on scope).
    if (role.scope === "vendor" && tenantId !== null) throw new Error(`role ${roleName} is vendor-scoped and cannot be granted to a tenant user`);
    if (role.scope === "tenant" && tenantId === null) throw new Error(`role ${roleName} is tenant-scoped and needs a tenant`);
    const { rows } = await c.query(
      `INSERT INTO control.admin_users (tenant_id, email, password_hash, totp_secret)
       VALUES ($1, $2, $3, $4) RETURNING id, email`,
      [tenantId, email.trim(), passwordHash, totpSecret],
    );
    await c.query(
      "INSERT INTO control.admin_role_grants (admin_user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [rows[0].id, role.id],
    );
    return { id: rows[0].id, email: rows[0].email, password: initial, totpSecret, role: roleName };
  });
}

/**
 * NEW PASSWORD AND NEW AUTHENTICATOR SECRET for an existing admin, printed once by
 * `bin/admin.mjs reset`. Returns what the operator must hand over; nothing is stored in the clear.
 *
 * WHY THIS EXISTS. `create-user` prints the TOTP secret once and there is no QR code and no
 * enrolment page, so a secret that was not written down is gone — and on day one one was, which
 * left `disable` + `create-user` as the only remedy: a new account, a new row, and the old one's
 * audit history detached from the person still using the console. This makes the remedy a reset.
 *
 * THREE THINGS MOVE TOGETHER AND ALL THREE MATTER:
 *   - `totp_last_step` is CLEARED. It is the replay defence (RFC 6238 §5.2), and it holds a step
 *     number from the OLD secret. A step number means nothing against a new secret, but leaving a
 *     stale one in place makes the first code from the new authenticator refusable for no reason
 *     the person could work out. NULL is the honest value for "this secret has never been used".
 *   - Every live session is revoked BY THE CALLER (`revokeUserSessions`), because a reset that
 *     leaves the old browser signed in has not taken the account back.
 *   - The row keeps its id, so the audit trail stays attached to the same person.
 *
 * It does NOT re-enable a disabled account. A reset is about credentials; `enable` is about
 * status, and quietly doing both would make one command two decisions.
 *
 * @param {{ adminUserId: string, password?: string }} p
 * @returns {Promise<{ password: string, totpSecret: Buffer }>}
 */
export async function resetAdminCredentials({ adminUserId, password }) {
  const initial = password ?? randomToken(18);
  const passwordHash = hashPassword(initial);
  const totpSecret = newTotpSecret();
  await withControl((c) => c.query(
    `UPDATE control.admin_users
        SET password_hash = $2, totp_secret = $3, totp_last_step = NULL
      WHERE id = $1`,
    [adminUserId, passwordHash, totpSecret],
  ));
  return { password: initial, totpSecret };
}

/** Record a successful login: the TOTP step just accepted (replay defence) and the time. */
export async function recordLogin(adminUserId, totpStep) {
  await withControl((c) => c.query(
    "UPDATE control.admin_users SET totp_last_step = $2, last_login_at = now() WHERE id = $1",
    [adminUserId, totpStep],
  ));
}

/** Disable a user. Their sessions are revoked by the caller (src/admin/session.js). */
export async function setAdminStatus(adminUserId, status) {
  if (!["active", "disabled"].includes(status)) throw new Error("status must be active or disabled");
  await withControl((c) => c.query("UPDATE control.admin_users SET status = $2 WHERE id = $1", [adminUserId, status]));
}
