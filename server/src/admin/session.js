// @ts-check
/**
 * Admin sessions: the cookie, the server-side row, and the CSRF token derived from it. B2.
 *
 * THE COOKIE HOLDS A RANDOM TOKEN; THE TABLE HOLDS ITS HASH. `control.admin_sessions.token_hash`
 * is sha256(token), so the database never contains anything that logs someone in. The cookie is
 * `HttpOnly` (no script reads it), `SameSite=Lax` (no cross-site POST carries it), `Path=/admin`
 * (the API routes never see it), and `Secure` when the connection is TLS or MATIC_ADMIN_COOKIE_SECURE
 * forces it — see `cookieSecure()` for why it is conditional today.
 *
 * CSRF: a token per session, `HMAC-SHA256(csrf_secret, "form")`, on every state-changing form as a
 * hidden `_csrf` field and checked in constant time before the handler runs. A per-session secret
 * means a token lifted from one session is useless in another, and nothing has to be stored per
 * form. SameSite=Lax is the first defence; the token is the second, because "the browser will
 * enforce it" is one browser setting away from not being true.
 *
 * Sessions expire after SESSION_HOURS of inactivity (last_seen_at is refreshed on each request,
 * cheaply, in the same query that loads the session) and absolutely after SESSION_MAX_HOURS.
 */
import { createHash, createHmac } from "node:crypto";
import { withControl } from "../db/pool.js";
import { randomToken, safeEqual } from "./auth.js";

export const COOKIE_NAME = "matic_admin";
export const SESSION_IDLE_HOURS = 8;
export const SESSION_MAX_HOURS = 24;

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/**
 * Whether the Secure flag goes on the cookie.
 *
 * The hub speaks plaintext HTTP on loopback and nothing else (it refuses non-loopback peers), so
 * there is no TLS for `Secure` to bind to. Browsers treat 127.0.0.1 as a secure context and most
 * accept a Secure cookie over it, but "most" is not "all" and a console whose login silently fails
 * in one browser is the kind of defect this project keeps finding on screen. So: Secure when the
 * socket is TLS, or when MATIC_ADMIN_COOKIE_SECURE=1 says the operator has TLS in front. The day
 * the hub binds to anything but loopback, this must become unconditional — src/index.js's
 * loopback refusal is what makes the conditional safe, and a test pins that both still exist.
 *
 * @param {import("node:http").IncomingMessage} req
 */
export function cookieSecure(req) {
  // @ts-ignore — TLSSocket has `encrypted`; a plain Socket does not
  return Boolean(req.socket?.encrypted) || process.env.MATIC_ADMIN_COOKIE_SECURE === "1";
}

/** @param {string} token @param {boolean} secure */
export function sessionCookie(token, secure) {
  const parts = [`${COOKIE_NAME}=${token}`, "Path=/admin", "HttpOnly", "SameSite=Lax", `Max-Age=${SESSION_MAX_HOURS * 3600}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** The cookie that removes the session cookie. */
export function clearedCookie(secure) {
  const parts = [`${COOKIE_NAME}=`, "Path=/admin", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** @param {string|undefined} header @returns {Record<string, string>} */
export function parseCookies(header) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k && !(k in out)) out[k] = v;
  }
  return out;
}

/**
 * @typedef {object} AdminSession
 * @property {string} token
 * @property {string} tokenHash
 * @property {string} adminUserId
 * @property {string|null} tenantId
 * @property {string} csrfSecret
 * @property {Date} createdAt
 * @property {Date} expiresAt
 * @property {Date|null} totpVerifiedAt
 */

/**
 * Start a session. Returns the token for the cookie; the row holds only its hash.
 *
 * @param {{ adminUserId: string, tenantId: string|null, totpVerified: boolean }} p
 * @returns {Promise<string>} the cookie token
 */
export async function createSession({ adminUserId, tenantId, totpVerified }) {
  const token = randomToken(32);
  const csrfSecret = randomToken(32);
  await withControl(async (c) => {
    await c.query(
      `INSERT INTO control.admin_sessions
         (token_hash, admin_user_id, tenant_id, csrf_secret, expires_at, totp_verified_at)
       VALUES ($1, $2, $3, $4, now() + ($5 || ' hours')::interval, $6)`,
      [sha256(token), adminUserId, tenantId, csrfSecret, String(SESSION_MAX_HOURS), totpVerified ? new Date() : null],
    );
  });
  return token;
}

/**
 * Load a live session by cookie token, refreshing last_seen_at. Null when absent, expired, idle
 * too long, or revoked — the caller treats all four the same (send to login).
 *
 * @param {string|undefined} token
 * @returns {Promise<AdminSession|null>}
 */
export async function loadSession(token) {
  if (!token || typeof token !== "string" || token.length < 20) return null;
  const tokenHash = sha256(token);
  return withControl(async (c) => {
    const { rows } = await c.query(
      `UPDATE control.admin_sessions s
          SET last_seen_at = now()
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND s.last_seen_at > now() - ($2 || ' hours')::interval
        RETURNING s.admin_user_id, s.tenant_id, s.csrf_secret, s.created_at, s.expires_at, s.totp_verified_at`,
      [tokenHash, String(SESSION_IDLE_HOURS)],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      token, tokenHash,
      adminUserId: r.admin_user_id,
      tenantId: r.tenant_id,
      csrfSecret: r.csrf_secret,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      totpVerifiedAt: r.totp_verified_at,
    };
  });
}

/** Revoke one session (logout). Idempotent. */
export async function revokeSession(tokenHash) {
  await withControl((c) => c.query(
    "UPDATE control.admin_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
    [tokenHash],
  ));
}

/** Revoke every live session of a user (disable, password change). Returns how many. */
export async function revokeUserSessions(adminUserId) {
  return withControl(async (c) => {
    const { rowCount } = await c.query(
      "UPDATE control.admin_sessions SET revoked_at = now() WHERE admin_user_id = $1 AND revoked_at IS NULL",
      [adminUserId],
    );
    return rowCount ?? 0;
  });
}

/** The CSRF token for this session's forms. */
export function csrfToken(session) {
  return createHmac("sha256", session.csrfSecret).update("form").digest("base64url");
}

/** Constant-time check of a submitted `_csrf` against the session. */
export function csrfValid(session, submitted) {
  return safeEqual(csrfToken(session), typeof submitted === "string" ? submitted : "");
}
