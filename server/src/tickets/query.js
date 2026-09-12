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
 *
 * SINCE 2026-09-12 THE TIMELINE IS HERE TOO (tenant/006, D275): `addEntry()`, `listEntries()`
 * and `oldestUnansweredRequesterComment()` are the only code that touches `ticket_entries`
 * (test/admin-static.test.mjs §5 fails if SQL against it appears anywhere else). Visibility is a
 * property of the KIND and is decided in KIND_VISIBILITY below — no caller passes one — and
 * `listEntries()` takes a REQUIRED visibility with no default, because a default is how an
 * internal work note reaches a requester's screen eighteen months from now.
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

// ---- the timeline (tenant/006, D275) ------------------------------------------------------------

/** Every kind the table accepts. The shape is declared in full so P2 and P4 add no columns. */
export const ENTRY_KINDS = ["comment", "work_note", "state_change", "resolution"];

/**
 * VISIBILITY IS A PROPERTY OF THE KIND, DECIDED HERE AND NOWHERE ELSE. A work note is internal:
 * the requester can never see or be sent one (D69, D275). A comment, a state change and a
 * resolution are public — requester-visible the day something can deliver them, which nothing
 * can yet. No function in this file takes a visibility from its caller; tenant/006's two CHECKs
 * refuse the combinations this table forbids even if this map is edited.
 */
export const KIND_VISIBILITY = Object.freeze({
  comment: "public",
  work_note: "internal",
  state_change: "public",
  resolution: "public",
});

/**
 * THE KINDS THIS BUILD WRITES. `comment` is refused until P4 ships the delivery path — a
 * requester-visible entry that reaches nobody is this project's signature defect (plan v3 §0
 * finding 8) and this list is what stops it being built by accident. `resolution` is P2's, with
 * the resolution code. test/admin-static.test.mjs §5d pins this list.
 */
export const WRITABLE_KINDS = Object.freeze(["work_note", "state_change"]);

export const ENTRY_AUTHOR_KINDS = ["requester", "console_user", "agent", "system"];

/** The two arguments `listEntries()` accepts. "all" is the console's and the CLI's explicit choice. */
export const ENTRY_VISIBILITIES = Object.freeze(["public", "all"]);

/** The one author when nobody is attached: the CLI, or the hub acting on its own. */
const SYSTEM_AUTHOR = Object.freeze({ kind: "system", label: null });

/**
 * @typedef {object} EntryAuthor
 * @property {"requester"|"console_user"|"agent"|"system"} kind
 * @property {string|null} [adminUserId]  control.admin_users.id — recorded, never joined (D143)
 * @property {string|null} [userId]       the tenant's users.id, for a requester
 * @property {string|null} [label]        what to show: the console user's email as at write time
 */

/**
 * @typedef {object} TicketEntry
 * @property {string} id
 * @property {string} kind
 * @property {"public"|"internal"} visibility
 * @property {string} body
 * @property {string} authorKind
 * @property {string|null} authorLabel
 * @property {Date} createdAt
 */

const shapeEntry = (r) => ({
  id: r.id,
  kind: r.kind,
  visibility: r.visibility,
  body: r.body,
  authorKind: r.author_kind,
  authorLabel: r.author_label ?? null,
  createdAt: r.created_at,
  // notified_at and read_by_requester_at are NOT returned: P4's, reserved (admin-db §5c).
});

/**
 * The one INSERT. Takes the tenant-scoped client because `setTicketState()` writes its
 * state_change entry inside the same transaction as the move.
 *
 * @param {any} client
 * @param {string} ticketId
 * @param {{ kind: string, body: string, author?: EntryAuthor }} e
 * @returns {Promise<{ id: string, createdAt: Date }>}
 */
async function insertEntry(client, ticketId, { kind, body, author = SYSTEM_AUTHOR }) {
  if (!WRITABLE_KINDS.includes(kind)) {
    throw new Error(`entry kind must be one of: ${WRITABLE_KINDS.join(", ")} in this build (comment arrives with P4's delivery path, resolution with P2's code); got ${JSON.stringify(kind)}`);
  }
  if (!ENTRY_AUTHOR_KINDS.includes(author?.kind)) throw new Error(`author.kind must be one of: ${ENTRY_AUTHOR_KINDS.join(", ")}`);
  const text = typeof body === "string" ? body.trim().slice(0, 4000) : "";
  if (!text) throw new Error("an entry needs a body");
  const { rows } = await client.query(
    `INSERT INTO ticket_entries (ticket_id, kind, visibility, body, author_kind, author_user_id, author_admin_user_id, author_label)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, created_at`,
    [ticketId, kind, KIND_VISIBILITY[kind], text, author.kind, author.userId ?? null, author.adminUserId ?? null, author.label ?? null],
  );
  return { id: rows[0].id, createdAt: rows[0].created_at };
}

/**
 * Add an entry to a ticket's timeline. In this build only a work note can be added this way
 * (WRITABLE_KINDS; state changes come from `setTicketState()`). Returns null when no such ticket.
 *
 * Nothing here refuses a work note on a closed ticket: `closed` becomes terminal in the console in
 * P2, and until then the desk may annotate any ticket it can see.
 *
 * @param {string} schema
 * @param {string} reference
 * @param {{ kind: string, body: string, author: EntryAuthor }} e
 * @returns {Promise<{ id: string, createdAt: Date }|null>}
 */
export async function addEntry(schema, reference, { kind, body, author }) {
  return withTenant(schema, async (c) => {
    const { rows } = await c.query("SELECT id FROM tickets WHERE reference = $1", [reference]);
    if (!rows.length) return null;
    return insertEntry(c, rows[0].id, { kind, body, author });
  });
}

/**
 * One ticket's timeline, oldest first (the console and the CLI both render newest LAST).
 *
 * `visibility` IS REQUIRED AND HAS NO DEFAULT. "public" returns only rows a requester may see;
 * "all" is the console's and the CLI's explicit request for the internal rows too. Anything else —
 * including nothing — throws, so a requester-facing caller (P4) cannot get internal rows by
 * forgetting an argument, and test/admin-db.test.mjs §5 proves "public" cannot return one.
 *
 * @param {string} schema
 * @param {string} reference
 * @param {{ visibility: "public"|"all" }} opts
 * @returns {Promise<TicketEntry[]>}  empty when no such ticket or no entries
 */
export async function listEntries(schema, reference, { visibility }) {
  if (!ENTRY_VISIBILITIES.includes(visibility)) {
    throw new Error(`listEntries needs visibility: one of ${ENTRY_VISIBILITIES.join(", ")} — no default, on purpose (D275)`);
  }
  return withTenant(schema, async (c) => {
    const { rows } = await c.query(
      `SELECT e.id, e.kind, e.visibility, e.body, e.author_kind, e.author_label, e.created_at
         FROM ticket_entries e JOIN tickets t ON t.id = e.ticket_id
        WHERE t.reference = $1 ${visibility === "public" ? "AND e.visibility = 'public'" : ""}
        ORDER BY e.created_at ASC, e.id ASC`,
      [reference],
    );
    return rows.map(shapeEntry);
  });
}

/**
 * D276's indicator: the oldest requester comment nobody has answered, as the moment it began
 * waiting — the console turns that into an AGE, never a count. Reads `tickets.awaiting_agent_since`
 * (tenant/006), which in this build has NO WRITER: no requester can comment until P4. So this
 * returns null today, and both ticket screens say why rather than drawing an empty cell.
 *
 * @param {string} schema
 * @returns {Promise<{ reference: string, since: Date }|null>}
 */
export async function oldestUnansweredRequesterComment(schema) {
  return withTenant(schema, async (c) => {
    const { rows } = await c.query(
      "SELECT reference, awaiting_agent_since FROM tickets WHERE awaiting_agent_since IS NOT NULL ORDER BY awaiting_agent_since ASC LIMIT 1",
    );
    return rows.length ? { reference: rows[0].reference, since: rows[0].awaiting_agent_since } : null;
  });
}

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
 * @param {{ state?: string|null, limit?: number, offset?: number }} [opts]
 * @returns {Promise<TicketRow[]>}
 */
export async function listTickets(schema, { state = null, limit = 50, offset = 0 } = {}) {
  if (state !== null && !TICKET_STATES.includes(state)) {
    throw new Error(`state must be one of: ${TICKET_STATES.join(", ")}`);
  }
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const skip = Math.max(Number(offset) || 0, 0);
  return withTenant(schema, async (c) => {
    const { rows } = await c.query(
      `SELECT t.reference, t.state, t.category, t.suggested_owner, t.machine_name, t.created_at, t.updated_at,
              u.first_name, u.last_name, u.location, u.contact_id, u.os_username
         FROM tickets t LEFT JOIN users u ON u.id = t.user_id
        ${state ? "WHERE t.state = $3" : ""}
        ORDER BY t.created_at DESC LIMIT $1 OFFSET $2`,
      state ? [cap, skip, state] : [cap, skip],
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
 * @returns {Promise<(TicketRow & { id: string, description: string, summary: string, whatWasChecked: string|null, profileSource: string|null, sessionId: string|null, internalResolutionNote: string|null })|null>}
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
      // INTERNAL. Both readers label it so; a requester-facing route must never SELECT t.* —
      // it would ship this, `summary` (D214) and `what_was_checked` to the requester.
      internalResolutionNote: t.internal_resolution_note ?? null,
    };
  });
}

/**
 * How many tickets each of the given sessions produced. Takes the caller's TENANT-SCOPED CLIENT
 * (from `withTenant()`) rather than a schema, because the caller - src/sessions/store.js - is
 * already inside a tenant transaction and this is one more read in it.
 *
 * Here and not in the sessions store because of D224: SQL against `tickets` lives in this
 * directory and nowhere else, so the CLI, the console and the sessions store cannot disagree about
 * what a ticket row is. test/admin-static.test.mjs §5 fails if the query moves.
 *
 * @param {any} client
 * @param {string[]} sessionIds
 * @returns {Promise<Map<string, number>>}  sessionId -> count (absent = 0)
 */
export async function ticketCountsBySession(client, sessionIds) {
  const out = new Map();
  if (!sessionIds.length) return out;
  const { rows } = await client.query(
    "SELECT session_id, count(*)::int AS n FROM tickets WHERE session_id = ANY($1::uuid[]) GROUP BY session_id",
    [sessionIds],
  );
  for (const r of rows) out.set(String(r.session_id), r.n);
  return out;
}

/**
 * Move a ticket to a state. Returns the previous state, or null when no such ticket.
 *
 * The caller decides whether the move is allowed (the console consults NEXT_STATES; the CLI
 * allows anything). This function only refuses a state that the database would refuse anyway,
 * so the error is a sentence rather than a constraint violation.
 *
 * `note` is the INTERNAL resolution note — `internal_resolution_note`, added by tenant/004 as
 * `close_note` and renamed by tenant/005 (D269), D239's "somewhere for the second-phase result to
 * land": the human's own account of what fixed it, written when they move the ticket. Optional;
 * trimmed; capped at 4000; kept when the next move carries none (the COALESCE). WRITTEN by the
 * console's state form (src/admin/pages/tickets.js, statePost) and by `bin/tickets.mjs state
 * --note`; READ by the detail page and by `bin/tickets.mjs show`, both of which label it internal —
 * the requester never sees it. Until 2026-09-12 this paragraph claimed the two readers and no
 * writer existed; none of them did (tenant/005's header has the record). The ticket-close-to-draft
 * loop is the thing this column exists for and is NOT built.
 *
 * SINCE tenant/006 (D275) A MOVE ALSO WRITES A `state_change` ENTRY — "open → resolved", public,
 * attributed to `author` — in the same transaction, so the timeline and the row cannot disagree
 * about when the state changed. A move to the state the ticket is already in (the CLI's
 * correction tool allows it) writes no entry: nothing changed. The internal note is NOT copied
 * into the entry; it stays the column D269 wired, read by the two readers that label it internal.
 *
 * @param {string} schema
 * @param {string} reference
 * @param {string} next
 * @param {{ note?: string|null, author?: EntryAuthor }} [opts]  `author` defaults to the system
 * @returns {Promise<{ from: string, to: string, noted: boolean }|null>}  `noted` — a note was written by THIS call
 */
export async function setTicketState(schema, reference, next, { note = null, author = SYSTEM_AUTHOR } = {}) {
  if (!TICKET_STATES.includes(next)) throw new Error(`state must be one of: ${TICKET_STATES.join(", ")}`);
  const trimmed = typeof note === "string" && note.trim() ? note.trim().slice(0, 4000) : null;
  return withTenant(schema, async (c) => {
    const { rows } = await c.query(
      `UPDATE tickets t SET state = $2, updated_at = now(), internal_resolution_note = COALESCE($3, t.internal_resolution_note)
         FROM (SELECT id, state AS was FROM tickets WHERE reference = $1 FOR UPDATE) prev
        WHERE t.id = prev.id
        RETURNING t.id, prev.was`,
      [reference, next, trimmed],
    );
    if (!rows.length) return null;
    const from = rows[0].was;
    if (from !== next) await insertEntry(c, rows[0].id, { kind: "state_change", body: `${from} → ${next}`, author });
    return { from, to: next, noted: trimmed !== null };
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
