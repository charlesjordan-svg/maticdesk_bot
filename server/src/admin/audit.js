// @ts-check
/**
 * Admin-action audit (D156): one row per action, from the console's first request.
 *
 * WHAT GETS A ROW. Every state change (login, logout, a ticket's state), every failed login (with
 * the email tried, never the password), every REFUSAL (a role that could not open a page, a POST
 * without a CSRF token — "who tried" is as much the audit's job as "who did"), and every read of
 * a record that names a person: a ticket's detail page carries the reporter's name, location and
 * contact and the reporter's own words. Reads of lists and of aggregate figures do not get a row;
 * the audit should record access to people, not clicks.
 *
 * WHAT NEVER GOES IN `detail`. Passwords, TOTP codes, session tokens, and the CONTENT of anything
 * an employee said. The detail of a ticket-state change is `{ from, to }`; the detail of a
 * ticket view is the reference. An audit table that copies the record it audits becomes a second
 * copy of the record, with a different retention story, which is the mistake control.job_queue's
 * no-payload rule (D196) exists to prevent one table over.
 *
 * `event_class` is 'normal' for everything in this pass. D155 makes local-account use a distinct
 * class ('break-glass') ONCE federation exists and local accounts are the fallback; today they are
 * the only accounts, so classing them as break-glass would make every row an alarm and the alarm
 * meaningless. `step_up` is false throughout: none of D157's actions exists in the console yet
 * (src/admin/session.js records totp_verified_at for the day one does).
 *
 * A failed audit write FAILS THE ACTION. `audit()` is awaited before the response is sent, and if
 * it throws, the handler's catch turns that into a 500 — an action that happened but was not
 * recorded is the gap the handover said you end up unable to explain.
 */
import { withControl } from "../db/pool.js";

/**
 * @param {{
 *   adminUserId?: string|null,
 *   tenantId?: string|null,
 *   action: string,
 *   subject?: string|null,
 *   detail?: Record<string, unknown>|null,
 *   eventClass?: "normal"|"break-glass"|"vendor-access",
 *   stepUp?: boolean,
 *   client?: import("pg").PoolClient,
 * }} e
 * @returns {Promise<number>} the audit row id
 */
export async function audit({ adminUserId = null, tenantId = null, action, subject = null, detail = null, eventClass = "normal", stepUp = false, client }) {
  if (typeof action !== "string" || !/^[a-z]+(\.[a-z_]+)+$/.test(action)) {
    throw new Error(`audit action must be dotted lower-case, got ${JSON.stringify(action)}`);
  }
  const sql = `
    INSERT INTO control.admin_audit (admin_user_id, tenant_id, action, event_class, step_up, subject, detail)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id`;
  const params = [adminUserId, tenantId, action, eventClass, stepUp, subject, detail ? JSON.stringify(detail) : null];
  const run = async (c) => Number((await c.query(sql, params)).rows[0].id);
  return client ? run(client) : withControl(run);
}

/**
 * Recent audit rows for a tenant, newest first, with the actor's email joined in.
 *
 * @param {{ tenantId: string, limit?: number }} p
 */
export async function recentAudit({ tenantId, limit = 100 }) {
  const cap = Math.min(Math.max(Number(limit) || 100, 1), 1000);
  return withControl(async (c) => {
    const { rows } = await c.query(
      `SELECT a.id, a.at, a.action, a.event_class, a.step_up, a.subject, a.detail, u.email
         FROM control.admin_audit a
         LEFT JOIN control.admin_users u ON u.id = a.admin_user_id
        WHERE a.tenant_id = $1
        ORDER BY a.at DESC, a.id DESC
        LIMIT $2`,
      [tenantId, cap],
    );
    return rows.map((r) => ({
      id: Number(r.id), at: r.at, action: r.action, eventClass: r.event_class, stepUp: r.step_up,
      subject: r.subject, detail: r.detail, email: r.email ?? null,
    }));
  });
}
