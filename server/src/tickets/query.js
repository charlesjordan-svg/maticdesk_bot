// @ts-check
/**
 * The ticket store's READ AND STATE-CHANGE queries, shared by the CLI and the admin console (D224).
 *
 * ONE QUERY LAYER, TWO READERS. `bin/tickets.mjs` and the console (`src/admin/pages/tickets.js`)
 * both call these functions and nothing else touches the `tickets` table. The handover's reason is
 * the right one: two code paths to the same data diverge, and when the console is doubted the CLI
 * is what gets trusted — so the CLI has to be reading the same rows through the same SQL, or the
 * comparison proves nothing. Exit criterion 5 ("the ticket list shows real rows, and
 * `bin/tickets.mjs` shows the same rows") is a test that calls `listTickets()` once and compares it
 * with what the console rendered and what the CLI printed.
 *
 * Every function takes the tenant schema and goes through `withTenant()` — the only door
 * (src/db/tenant.js). Nothing here knows about sessions, roles or audit; that is the console's
 * job, and keeping it out of here is what lets the CLI stay a plain tool.
 *
 * `createTicket()` stays in src/tickets/file.js: it is the route's write and it upserts the
 * reporter in the same transaction, which neither reader needs.
 */
import { withTenant } from "../db/tenant.js";

export const TICKET_STATES = ["new", "open", "resolved", "closed"];

/**
 * The transitions the console offers. NOT enforced by the database (003-tickets.sql says the
 * state machine is "the smallest one that is not a lie") and not enforced by the CLI, which
 * takes any state so an operator can correct a mistake. The console offers the forward moves
 * and re-open, and refuses the rest, because a button is a suggestion and a suggestion should
 * be a sensible one.
 *
 * @type {Record<string, string[]>}
 */
export const NEXT_STATES = {
  new: ["open", "resolved", "closed"],
  open: ["resolved", "closed"],
  resolved: ["closed", "open"],
  closed: ["open"],
};

/**
 * @typedef {object} TicketRow
 * @property {string} reference
 * @property {string} state
 * @property {string} category
 * @property {string|null} suggestedOwner
 * @property {string|null} machineName
 * @property {Date} createdAt
 * @property {Date} updatedAt
 * @property {string|null} reporter    display name, else os_username, else null
 * @property {string|null} location
 * @property {string|null} contactId
 * @property {string|null} osUsername
 */

const shapeRow = (r) => ({
  reference: r.reference,
  state: r.state,
  category: r.category,
  suggestedOwner: r.suggested_owner ?? null,
  machineName: r.machine_name ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  reporter: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.os_username || null,
  location: r.location ?? null,
  contactId: r.contact_id ?? null,
  osUsername: r.os_username ?? null,
});

/**
 * The queue, newest first. Optionally one state.
 *
 * @param {string} schema
 * @param {{ state?: string|null, limit?: number }} [opts]
 * @returns {Promise<TicketRow[]>}
 */
export async function listTickets(schema, { state = null, limit = 50 } = {}) {
  if (state !== null && !TICKET_STATES.includes(state)) {
    throw new Error(`state must be one of: ${TICKET_STATES.join(", ")}`);
  }
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 500);
  return withTenant(schema, async (c) => {
    const { rows } = await c.query(
      `SELECT t.reference, t.state, t.category, t.suggested_owner, t.machine_name, t.created_at, t.updated_at,
              u.first_name, u.last_name, u.location, u.contact_id, u.os_username
         FROM tickets t LEFT JOIN users u ON u.id = t.user_id
        ${state ? "WHERE t.state = $2" : ""}
        ORDER BY t.created_at DESC LIMIT $1`,
      state ? [cap, state] : [cap],
    );
    return rows.map(shapeRow);
  });
}

/**
 * How many tickets sit in each state. The console shows these on every screen (handover §3:
 * "counts everywhere") and the CLI prints them under the list.
 *
 * @param {string} schema
 * @returns {Promise<Record<string, number>>} every state present, zero when absent
 */
export async function countTicketsByState(schema) {
  return withTenant(schema, async (c) => {
    const { rows } = await c.query("SELECT state, count(*)::int AS n FROM tickets GROUP BY state");
    const out = Object.fromEntries(TICKET_STATES.map((s) => [s, 0]));
    for (const r of rows) out[r.state] = r.n;
    return out;
  });
}

/**
 * Tickets per category (D186: trend per category, never only in aggregate), with how many are
 * still new or open. The Metrics page's one real tenant figure.
 *
 * @param {string} schema
 * @returns {Promise<Array<{ category: string, n: number, open: number }>>}
 */
export async function countTicketsByCategory(schema) {
  return withTenant(schema, async (c) => {
    const { rows } = await c.query(
      "SELECT category, count(*)::int AS n, count(*) FILTER (WHERE state IN ('new','open'))::int AS open FROM tickets GROUP BY category ORDER BY n DESC",
    );
    return rows.map((r) => ({ category: r.category, n: r.n, open: r.open }));
  });
}

/**
 * One ticket, with the reporter's profile and its provenance.
 *
 * @param {string} schema
 * @param {string} reference  e.g. MD-1000
 * @returns {Promise<(TicketRow & { id: string, description: string, summary: string, whatWasChecked: string|null, profileSource: string|null, sessionId: string|null })|null>}
 */
export async function getTicket(schema, reference) {
  return withTenant(schema, async (c) => {
    const { rows } = await c.query(
      `SELECT t.*, u.first_name, u.last_name, u.location, u.contact_id, u.os_username, u.profile_source
         FROM tickets t LEFT JOIN users u ON u.id = t.user_id WHERE t.reference = $1`,
      [reference],
    );
    if (!rows.length) return null;
    const t = rows[0];
    return {
      ...shapeRow(t),
      id: t.id,
      description: t.description,
      summary: t.summary,
      whatWasChecked: t.what_was_checked ?? null,
      profileSource: t.profile_source ?? null,
      sessionId: t.session_id ?? null,
    };
  });
}

/**
 * Move a ticket to a state. Returns the previous state, or null when no such ticket.
 *
 * The caller decides whether the move is allowed (the console consults NEXT_STATES; the CLI
 * allows anything). This function only refuses a state that the database would refuse anyway,
 * so the error is a sentence rather than a constraint violation.
 *
 * @param {string} schema
 * @param {string} reference
 * @param {string} next
 * @returns {Promise<{ from: string, to: string }|null>}
 */
export async function setTicketState(schema, reference, next) {
  if (!TICKET_STATES.includes(next)) throw new Error(`state must be one of: ${TICKET_STATES.join(", ")}`);
  return withTenant(schema, async (c) => {
    const { rows } = await c.query(
      `UPDATE tickets t SET state = $2, updated_at = now()
         FROM (SELECT id, state AS was FROM tickets WHERE reference = $1 FOR UPDATE) prev
        WHERE t.id = prev.id
        RETURNING prev.was`,
      [reference, next],
    );
    if (!rows.length) return null;
    return { from: rows[0].was, to: next };
  });
}

/**
 * The tenant's people, with a ticket count each. Every profile is self-asserted unless
 * `profileSource` says otherwise (003-tickets.sql).
 *
 * @param {string} schema
 */
export async function listReporters(schema) {
  return withTenant(schema, async (c) => {
    const { rows } = await c.query(
      `SELECT os_username, first_name, last_name, location, contact_id, profile_source,
              (SELECT count(*)::int FROM tickets WHERE user_id = users.id) AS tickets
         FROM users ORDER BY last_name NULLS LAST, first_name NULLS LAST`,
    );
    return rows.map((r) => ({
      osUsername: r.os_username ?? null,
      name: [r.first_name, r.last_name].filter(Boolean).join(" ") || null,
      location: r.location ?? null,
      contactId: r.contact_id ?? null,
      profileSource: r.profile_source,
      tickets: r.tickets,
    }));
  });
}
