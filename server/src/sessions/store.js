// @ts-check
/**
 * Sessions and their outcomes — THE ONE QUERY LAYER over the `sessions` table (D237, D239; the D224
 * pattern a fourth time). `POST /v1/session`, the ticket insert, the console's Metrics page and
 * `bin/sessions.mjs` all compose these functions and nothing else touches the table.
 * test/db-static.test.mjs fails if SQL against `sessions` appears anywhere but here.
 *
 * ===============================================================================================
 * THE ROW IS WRITTEN WHEN THE SESSION BEGINS. THAT IS THE WHOLE DESIGN.
 * ===============================================================================================
 *
 * tenant/002 declared `outcome NOT NULL DEFAULT 'unresolved'` and said why: a session nobody
 * classified is unresolved, never missing, so the denominator cannot quietly shrink. That only
 * holds if the row EXISTS before anyone knows how the session will end. So `beginSession()` runs on
 * the endpoint's first turn, and `resolved` / `escalated` are UPDATEs on a row that is already there.
 *
 * If the row were written at session end, an abandoned window would write nothing, vanish from the
 * denominator, and inflate deflection for a reason unrelated to the product — the failure D89 exists
 * to prevent, and the one that is easiest to build by accident.
 *
 * ===============================================================================================
 * THE TRANSITIONS, AND WHO MAY MAKE EACH
 * ===============================================================================================
 *
 *   unresolved  the default. Nobody sets it; it is what a row is until something happens.
 *   resolved    ONLY from an explicit confirmation in the session (D89: "user explicitly confirmed").
 *               Set by `resolveSession()`, called by POST /v1/session {event: "resolved"} — which the
 *               endpoint sends only after the user answered "yes" to "did that fix it?" (D238).
 *               Only from `unresolved`: an escalated session stays escalated.
 *   escalated   ONLY by a ticket insert (D89: "ticket created"), inside the SAME transaction as the
 *               ticket row (`markEscalated()` takes the client). NEVER from the client as an event —
 *               /v1/session refuses it with a 400 and says why. Overrides `resolved`: a session that
 *               ended in a ticket did not deflect one.
 *   suppressed  RESERVED (D118). An alert prevented the session, so there is no session to write
 *               and no code path here can produce the value. It stays in the CHECK so the schema
 *               does not need a migration on the day alerts exist, and the Metrics page says it is
 *               unreachable rather than showing a zero. /v1/session refuses it.
 *
 * `ended_at` is set by `endSession()` (the window closed, or the endpoint's idle timer rolled the
 * session) and changes the outcome of nothing. A row with `ended_at` NULL is a session that is
 * still open or was abandoned; both count as unresolved, and that is correct.
 *
 * ===============================================================================================
 * SELF-HEALING, BECAUSE THE BEGIN IS BEST-EFFORT
 * ===============================================================================================
 *
 * The endpoint sends `begin` without waiting for it (a user's first turn must not wait on the hub's
 * database). So the row may not exist yet when a `resolved` or a ticket arrives — the begin timed
 * out, or the hub was restarted between them. Every writer therefore UPSERTS the row first, with the
 * client's `startedAt`, so the transition lands on a row whose start time is still the real one.
 * This is "write at begin" applied as late as it can still be honoured, not an exception to it.
 *
 * ===============================================================================================
 * WHAT IS SELF-ASSERTED (EVERYTHING)
 * ===============================================================================================
 *
 * The session id is minted by the endpoint and taken at its word: no device authentication exists
 * (D61/D132), so a forged or colliding id is the same class of risk as a self-asserted `osUsername`
 * — a user-context process lying about itself — and is stated here rather than defended against.
 * `ON CONFLICT DO NOTHING` on begin means a retry after a timeout is safe and a second endpoint
 * presenting an existing id cannot overwrite it; the first writer wins. `user_id` and `device_id`
 * stay NULL until D148 / D61 exist.
 */
import { withTenant } from "../db/tenant.js";
// The ticket count per session comes from src/tickets/query.js, not from a subquery here: SQL
// against `tickets` lives in that directory only (D224), and this store is the same rule applied to
// `sessions`. Each module owns its table; a read across the two composes the other's function.
import { ticketCountsBySession } from "../tickets/query.js";

export const SESSION_OUTCOMES = Object.freeze(["resolved", "escalated", "unresolved", "suppressed"]);

/** The outcomes an endpoint may REPORT. `escalated` is a ticket insert's; `suppressed` is nobody's. */
export const CLIENT_REPORTABLE_OUTCOMES = Object.freeze(["resolved"]);

/** The events POST /v1/session accepts. */
export const SESSION_EVENTS = Object.freeze(["begin", "resolved", "not_fixed", "end"]);

/** A category as the endpoint or the ticket names it: a short slug, nothing else. */
export const CATEGORY_SHAPE = /^[a-z][a-z0-9_-]{0,63}$/;

/**
 * A timestamp the client claims for its own session start. Accepted when it parses and is not in
 * the future (a small skew allowance), else `now()` — the row must have a start time, and a
 * client's clock is the only source of when the conversation actually began.
 *
 * @param {unknown} iso
 * @param {{ now?: () => number }} [opts]
 * @returns {Date}
 */
export function acceptStartedAt(iso, { now = () => Date.now() } = {}) {
  const t = typeof iso === "string" || typeof iso === "number" ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return new Date(now());
  if (t > now() + 5 * 60_000) return new Date(now());
  return new Date(t);
}

/**
 * The upsert every writer runs first. Same client, same transaction as the caller's.
 * @param {any} client
 * @param {{ id: string, startedAt?: Date|null, machineName?: string|null }} s
 */
async function ensureRow(client, { id, startedAt = null, machineName = null }) {
  await client.query(
    `INSERT INTO sessions (id, started_at, machine_name)
     VALUES ($1, COALESCE($2::timestamptz, now()), $3)
     ON CONFLICT (id) DO UPDATE SET machine_name = COALESCE(sessions.machine_name, EXCLUDED.machine_name)`,
    [id, startedAt, machineName],
  );
}

/**
 * The session begins. Idempotent: a retried begin is a no-op, and a begin arriving AFTER a resolved
 * or a ticket (the self-healing case) changes nothing about the outcome.
 *
 * @param {string} schema
 * @param {{ id: string, startedAt?: Date|null, machineName?: string|null }} s
 * @returns {Promise<{ id: string, created: boolean }>}
 */
export async function beginSession(schema, s) {
  return withTenant(schema, async (c) => {
    const { rowCount } = await c.query(
      `INSERT INTO sessions (id, started_at, machine_name)
       VALUES ($1, COALESCE($2::timestamptz, now()), $3)
       ON CONFLICT (id) DO NOTHING`,
      [s.id, s.startedAt ?? null, s.machineName ?? null],
    );
    return { id: s.id, created: (rowCount ?? 0) === 1 };
  });
}

/**
 * The user explicitly confirmed the fix worked (D89's only route to `resolved`).
 *
 * Only from `unresolved`. Returns what happened so the route can say it plainly: `resolved` when
 * the transition landed, `already` when the row was already resolved (a repeated yes), `escalated`
 * when the session had a ticket and therefore stays escalated.
 *
 * @param {string} schema
 * @param {{ id: string, category?: string|null, startedAt?: Date|null, machineName?: string|null }} s
 * @returns {Promise<{ outcome: string, changed: boolean }>}
 */
export async function resolveSession(schema, s) {
  return withTenant(schema, async (c) => {
    await ensureRow(c, s);
    const { rows } = await c.query(
      `UPDATE sessions
          SET outcome = 'resolved', resolved_at = now(), category = COALESCE($2, category)
        WHERE id = $1 AND outcome = 'unresolved'
        RETURNING outcome`,
      [s.id, s.category ?? null],
    );
    if (rows.length) return { outcome: "resolved", changed: true };
    const { rows: [cur] } = await c.query("SELECT outcome FROM sessions WHERE id = $1", [s.id]);
    return { outcome: cur?.outcome ?? "unresolved", changed: false };
  });
}

/**
 * The user explicitly said the fix did NOT work (D238). The outcome does not move — the session is
 * `unresolved`, which it already was — but "told us no" is a different fact from "went quiet", and
 * the register asked that the two not be conflated. Recorded as a timestamp, never as an outcome.
 *
 * @param {string} schema
 * @param {{ id: string, startedAt?: Date|null, machineName?: string|null }} s
 */
export async function noteNotFixed(schema, s) {
  return withTenant(schema, async (c) => {
    await ensureRow(c, s);
    await c.query("UPDATE sessions SET not_fixed_at = now() WHERE id = $1", [s.id]);
    return { ok: true };
  });
}

/**
 * A ticket was filed from this session. Called by createTicket() WITH ITS CLIENT, inside the ticket
 * insert's transaction, so a session cannot be escalated without a ticket or a ticket filed without
 * the session knowing. Overrides `resolved`: a ticket means the conversation did not deflect one.
 *
 * @param {any} client  the caller's tenant-scoped client (withTenant)
 * @param {{ id: string, category?: string|null, startedAt?: Date|null, machineName?: string|null }} s
 */
export async function markEscalated(client, s) {
  await ensureRow(client, s);
  await client.query(
    `UPDATE sessions
        SET outcome = 'escalated', escalated_at = COALESCE(escalated_at, now()), category = COALESCE($2, category)
      WHERE id = $1 AND outcome <> 'escalated'`,
    [s.id, s.category ?? null],
  );
}

/**
 * The session ended: the window closed, or the endpoint's idle timer rolled it. Sets `ended_at`
 * once; a second end is a no-op. Changes no outcome.
 *
 * @param {string} schema
 * @param {{ id: string, startedAt?: Date|null, machineName?: string|null }} s
 */
export async function endSession(schema, s) {
  return withTenant(schema, async (c) => {
    await ensureRow(c, s);
    const { rowCount } = await c.query("UPDATE sessions SET ended_at = now() WHERE id = $1 AND ended_at IS NULL", [s.id]);
    return { ended: (rowCount ?? 0) === 1 };
  });
}

/**
 * One session's row, for the CLI and for a ticket's detail page. Counts and timestamps only: the
 * table has no content column (B1 §11) and this function must never grow one to read.
 *
 * @param {string} schema
 * @param {string} id
 */
export async function getSession(schema, id) {
  return withTenant(schema, async (c) => {
    const { rows } = await c.query(
      `SELECT s.id, s.outcome, s.category, s.machine_name, s.started_at, s.ended_at, s.resolved_at, s.escalated_at, s.not_fixed_at
         FROM sessions s WHERE s.id = $1`,
      [id],
    );
    if (!rows[0]) return null;
    const tickets = await ticketCountsBySession(c, [rows[0].id]);
    return shape(rows[0], tickets);
  });
}

const shape = (r, tickets) => ({
  id: r.id, outcome: r.outcome, category: r.category ?? null, machineName: r.machine_name ?? null,
  startedAt: r.started_at, endedAt: r.ended_at ?? null, resolvedAt: r.resolved_at ?? null,
  escalatedAt: r.escalated_at ?? null, notFixedAt: r.not_fixed_at ?? null, tickets: tickets.get(String(r.id)) ?? 0,
});

/**
 * Recent sessions, newest first. The CLI's list; D89's "every figure drills down to its sessions".
 *
 * @param {string} schema
 * @param {{ outcome?: string|null, limit?: number }} [opts]
 */
export async function listSessions(schema, { outcome = null, limit = 50 } = {}) {
  if (outcome !== null && !SESSION_OUTCOMES.includes(outcome)) throw new Error(`outcome must be one of: ${SESSION_OUTCOMES.join(", ")}`);
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 500);
  return withTenant(schema, async (c) => {
    const { rows } = await c.query(
      `SELECT s.id, s.outcome, s.category, s.machine_name, s.started_at, s.ended_at, s.resolved_at, s.escalated_at, s.not_fixed_at
         FROM sessions s
        ${outcome ? "WHERE s.outcome = $2" : ""}
        ORDER BY s.started_at DESC LIMIT $1`,
      outcome ? [cap, outcome] : [cap],
    );
    const tickets = await ticketCountsBySession(c, rows.map((r) => r.id));
    return rows.map((r) => shape(r, tickets));
  });
}

/**
 * Deflection, D89-style, and per category (D186) — the Metrics page's figures and the CLI's.
 *
 *   deflection = resolved / (resolved + escalated + unresolved)
 *
 * `suppressed` is EXCLUDED from the denominator and reported separately, because D118's proxy
 * measurement is a different kind of number and because nothing can produce it yet — the page says
 * "reserved, unreachable" beside a dash, never a zero that looks like a measurement.
 *
 * Returned as plain counts; the page does the division so a zero denominator renders as "-" rather
 * than NaN, and so the number shown is derivable from the numbers beside it.
 *
 * @param {string} schema
 * @param {{ days?: number|null }} [opts]  a window in days, or null for all time
 * @returns {Promise<{
 *   total: { sessions: number, resolved: number, escalated: number, unresolved: number, suppressed: number, notFixed: number, ended: number },
 *   byCategory: Array<{ category: string|null, sessions: number, resolved: number, escalated: number, unresolved: number }>,
 * }>}
 */
export async function outcomeCounts(schema, { days = null } = {}) {
  const where = days ? "WHERE started_at > now() - ($1 || ' days')::interval" : "";
  const params = days ? [String(Math.max(1, Math.floor(days)))] : [];
  return withTenant(schema, async (c) => {
    const { rows: [t] } = await c.query(
      `SELECT count(*)::int AS sessions,
              count(*) FILTER (WHERE outcome = 'resolved')::int   AS resolved,
              count(*) FILTER (WHERE outcome = 'escalated')::int  AS escalated,
              count(*) FILTER (WHERE outcome = 'unresolved')::int AS unresolved,
              count(*) FILTER (WHERE outcome = 'suppressed')::int AS suppressed,
              count(not_fixed_at)::int AS not_fixed,
              count(ended_at)::int AS ended
         FROM sessions ${where}`,
      params,
    );
    const { rows } = await c.query(
      `SELECT category, count(*)::int AS sessions,
              count(*) FILTER (WHERE outcome = 'resolved')::int   AS resolved,
              count(*) FILTER (WHERE outcome = 'escalated')::int  AS escalated,
              count(*) FILTER (WHERE outcome = 'unresolved')::int AS unresolved
         FROM sessions ${where}
        GROUP BY category ORDER BY sessions DESC, category NULLS LAST`,
      params,
    );
    return {
      total: { sessions: t.sessions, resolved: t.resolved, escalated: t.escalated, unresolved: t.unresolved, suppressed: t.suppressed, notFixed: t.not_fixed, ended: t.ended },
      byCategory: rows.map((r) => ({ category: r.category ?? null, sessions: r.sessions, resolved: r.resolved, escalated: r.escalated, unresolved: r.unresolved })),
    };
  });
}

/**
 * The D89 ratio from a count row, or null when the denominator is zero. Pure, so the page and the
 * CLI compute it the same way and a test can pin it.
 *
 * @param {{ resolved: number, escalated: number, unresolved: number }} c
 * @returns {number|null}  0..1
 */
export function deflectionOf(c) {
  const denom = (c.resolved ?? 0) + (c.escalated ?? 0) + (c.unresolved ?? 0);
  return denom ? (c.resolved ?? 0) / denom : null;
}
