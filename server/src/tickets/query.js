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
 * The transitions the console offers. A SUGGESTION, not the guard: since 2026-09-12 (D280) the
 * guard is in the UPDATE itself — `setTicketState()` and `resolveTicket()` take the state the
 * caller SAW (`from`) and the write matches zero rows if the ticket has moved since. The CLI passes
 * no `from` and takes any state, so an operator can correct a mistake.
 *
 * SINCE P2 (D279): `closed` is TERMINAL here — the console offers nothing from it; a recurrence is
 * a new ticket, and the CLI is the correction tool. And `closed` is offered ONLY from `resolved`,
 * so every ticket the console closes carries a resolution code (D278): a ticket to be withdrawn is
 * resolved as `withdrawn_by_user` or `duplicate` first. Until P2 the console offered
 * new → closed and open → closed directly, which would have produced exactly the code-less closed
 * ticket that the plan's §3.1 argument cut `pending_user` over.
 *
 * `resolved` appears here so the console knows WHEN to draw the Resolve form; the move itself
 * goes through `resolveTicket()`, never `setTicketState()`.
 *
 * @type {Record<string, string[]>}
 */
export const NEXT_STATES = {
  new: ["open", "resolved"],
  open: ["resolved"],
  resolved: ["closed", "open"],
  closed: [],
};

// ---- resolution (tenant/007, D278) ------------------------------------------------------------

/**
 * The six resolution codes — a count you can group by (D186), never free text. The database's
 * CHECK (tenant/007) is the copy no writer can skip. A first draft of the vocabulary: the plan's
 * kill criterion says revise it if the first ten real resolutions cannot fill it honestly, and its
 * open question 8 names the candidates (`user_educated`, `no_action_required`).
 */
export const RESOLUTION_CODES = Object.freeze(["fixed", "workaround", "no_fault_found", "duplicate", "withdrawn_by_user", "referred_to_vendor"]);

/**
 * The words for each code, shared by the console and the CLI so the two cannot gloss one code two
 * ways (D224's argument, one layer up). A closed enum reaching a screen as itself is D244's defect.
 */
export const RESOLUTION_CODE_WORDS = Object.freeze({
  fixed: "Fixed",
  workaround: "Workaround in place",
  no_fault_found: "No fault found",
  duplicate: "Duplicate of another ticket",
  withdrawn_by_user: "Withdrawn by the user",
  referred_to_vendor: "Referred to a vendor",
});

/** Who closed a ticket, by author kind. `agent` has no closing path; if one appears, decide its value then. */
const CLOSED_BY = Object.freeze({ console_user: "console_user", system: "system", requester: "requester" });

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
 * finding 8) and this list is what stops it being built by accident. `resolution` joined in P2
 * (D278): `resolveTicket()` writes one, public, with the requester-visible notes as its body.
 * test/admin-static.test.mjs §5d pins this list.
 */
export const WRITABLE_KINDS = Object.freeze(["work_note", "state_change", "resolution"]);

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
 * @returns {Promise<(TicketRow & { id: string, description: string, summary: string, whatWasChecked: string|null, profileSource: string|null, sessionId: string|null, internalResolutionNote: string|null, resolutionCode: string|null, resolutionNotes: string|null, resolvedAt: Date|null, closedAt: Date|null, closedBy: string|null })|null>}
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
      // The CURRENT resolution (tenant/007, D278). PUBLIC: `resolutionNotes` is what the requester
      // is told, once P4 can deliver it; both readers label it so and say nobody sees it yet.
      resolutionCode: t.resolution_code ?? null,
      resolutionNotes: t.resolution_notes ?? null,
      resolvedAt: t.resolved_at ?? null,
      closedAt: t.closed_at ?? null,
      closedBy: t.closed_by ?? null,
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
 * When a move did not happen and the row still exists. `refused` is a sentence for the operator;
 * `state` is the row's state NOW — or null when nothing was read (a refusal before the write).
 *
 * @typedef {object} RefusedMove
 * @property {string} refused
 * @property {string|null} state
 */

/**
 * The row's state when a guarded write matched nothing: null when no such ticket, otherwise the
 * refusal that says who moved it (D280 — the guard is in the UPDATE, so this is the only way an
 * operator learns their page was stale).
 *
 * @returns {Promise<RefusedMove|null>}
 */
async function staleOrMissing(client, reference, from) {
  const { rows } = await client.query("SELECT state FROM tickets WHERE reference = $1", [reference]);
  if (!rows.length) return null;
  return {
    refused: `${reference} is ${rows[0].state} now, not ${from}: someone moved it after that state was read. Nothing was changed — look again and decide from where it actually is.`,
    state: rows[0].state,
  };
}

/**
 * Move a ticket to a state other than `resolved`. Returns the previous state, a refusal, or null
 * when no such ticket.
 *
 * THE GUARD IS IN THE UPDATE (D280, 2026-09-12). `from` is the state the caller SAW; the write is
 * `… WHERE reference = $1 AND state = $from`, so two operators racing from the same page can both
 * click and only one moves the ticket — the other gets `{ refused, state }` naming where it is
 * now. Before this the console checked NEXT_STATES against a separate read and then wrote: the
 * classic check-then-act, and a resolution written over a ticket somebody had just reopened. The
 * CLI passes no `from` (null): unconditional, the correction tool.
 *
 * `resolved` IS REFUSED HERE (D278). Reaching it takes a resolution code and requester-visible
 * notes, and `resolveTicket()` is the one function that writes them — so the CLI's any-state
 * correction cannot produce a resolved ticket with no resolution either. The refusal is a sentence
 * pointing there, not a constraint violation (tenant/007's CHECK is the copy behind it).
 *
 * What the move does to the resolution columns: a move to a LIVE state (`new`, `open`) clears
 * `resolution_code`, `resolution_notes` and `resolved_at` — an open ticket must not carry a
 * resolution for a problem the desk just agreed is not resolved; the timeline's `resolution`
 * entry keeps the history. A move to `closed` keeps them (a closed ticket's code is the point)
 * and stamps `closed_at`/`closed_by`; a move out of `closed` clears those two.
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
 * @param {{ note?: string|null, author?: EntryAuthor, from?: string|null }} [opts]  `author` defaults to the system; `from` null = unconditional
 * @returns {Promise<{ from: string, to: string, noted: boolean }|RefusedMove|null>}  `noted` — a note was written by THIS call
 */
export async function setTicketState(schema, reference, next, { note = null, author = SYSTEM_AUTHOR, from = null } = {}) {
  if (!TICKET_STATES.includes(next)) throw new Error(`state must be one of: ${TICKET_STATES.join(", ")}`);
  if (from !== null && !TICKET_STATES.includes(from)) throw new Error(`from must be null or one of: ${TICKET_STATES.join(", ")}`);
  if (next === "resolved") {
    return {
      refused: `${reference} cannot be moved to resolved by a state change: resolved needs a resolution code and notes the requester will read (D278). Use the console's Resolve form, or bin/tickets.mjs resolve <ref> --code <code> --resolution "…". Nothing was changed.`,
      state: null,
    };
  }
  if (next === "closed" && !(author.kind in CLOSED_BY)) throw new Error(`no closing path exists for author kind ${JSON.stringify(author.kind)}`);
  const trimmed = typeof note === "string" && note.trim() ? note.trim().slice(0, 4000) : null;
  return withTenant(schema, async (c) => {
    const { rows } = await c.query(
      `UPDATE tickets t
          SET state = $2, updated_at = now(),
              internal_resolution_note = COALESCE($3, t.internal_resolution_note),
              resolution_code  = CASE WHEN $2 IN ('new', 'open') THEN NULL ELSE t.resolution_code END,
              resolution_notes = CASE WHEN $2 IN ('new', 'open') THEN NULL ELSE t.resolution_notes END,
              resolved_at      = CASE WHEN $2 IN ('new', 'open') THEN NULL ELSE t.resolved_at END,
              closed_at = CASE WHEN $2 = 'closed' THEN now() ELSE NULL END,
              closed_by = CASE WHEN $2 = 'closed' THEN $5::text ELSE NULL END
         FROM (SELECT id, state AS was FROM tickets WHERE reference = $1 FOR UPDATE) prev
        WHERE t.id = prev.id AND ($4::text IS NULL OR t.state = $4::text)
        RETURNING t.id, prev.was`,
      [reference, next, trimmed, from, next === "closed" ? CLOSED_BY[author.kind] : null],
    );
    if (!rows.length) return staleOrMissing(c, reference, from);
    const was = rows[0].was;
    if (was !== next) await insertEntry(c, rows[0].id, { kind: "state_change", body: `${was} → ${next}`, author });
    return { from: was, to: next, noted: trimmed !== null };
  });
}

/**
 * Resolve a ticket: the ONE way to reach `resolved` (D278). Refused, with a sentence naming what
 * is missing, unless BOTH a resolution code (one of RESOLUTION_CODES) and requester-visible
 * resolution notes are given. The optional internal note travels too, as on any move.
 *
 * Writes, in one transaction: the row (state, code, notes, `resolved_at`, the internal note by
 * COALESCE, `closed_at`/`closed_by` cleared), a public `state_change` entry when the state
 * actually changed, and a public `resolution` entry whose body is the notes — so the timeline
 * keeps every resolution across a reopen while the columns hold the current one. The `from`
 * guard is the same as `setTicketState()`'s (D280).
 *
 * The notes are PUBLIC and reach NOBODY in this build: nothing delivers them until P4. Both
 * readers say so beside them. They are written FOR the requester anyway, because the day delivery
 * exists the notes already written must be the kind a requester can read.
 *
 * @param {string} schema
 * @param {string} reference
 * @param {{ code: string, notes: string, note?: string|null, author?: EntryAuthor, from?: string|null }} r
 * @returns {Promise<{ from: string, to: "resolved", code: string, noted: boolean }|RefusedMove|null>}
 */
export async function resolveTicket(schema, reference, { code, notes, note = null, author = SYSTEM_AUTHOR, from = null }) {
  if (from !== null && !TICKET_STATES.includes(from)) throw new Error(`from must be null or one of: ${TICKET_STATES.join(", ")}`);
  const missing = [];
  if (!RESOLUTION_CODES.includes(code)) missing.push(`a resolution code (one of ${RESOLUTION_CODES.join(", ")})`);
  const text = typeof notes === "string" ? notes.trim().slice(0, 4000) : "";
  if (!text) missing.push("resolution notes the requester will read");
  if (missing.length) {
    return { refused: `${reference} cannot be resolved without ${missing.join(" and ")} (D278). Nothing was changed.`, state: null };
  }
  const trimmed = typeof note === "string" && note.trim() ? note.trim().slice(0, 4000) : null;
  return withTenant(schema, async (c) => {
    const { rows } = await c.query(
      `UPDATE tickets t
          SET state = 'resolved', updated_at = now(),
              resolution_code = $2, resolution_notes = $3, resolved_at = now(),
              internal_resolution_note = COALESCE($4, t.internal_resolution_note),
              closed_at = NULL, closed_by = NULL
         FROM (SELECT id, state AS was FROM tickets WHERE reference = $1 FOR UPDATE) prev
        WHERE t.id = prev.id AND ($5::text IS NULL OR t.state = $5::text)
        RETURNING t.id, prev.was`,
      [reference, code, text, trimmed, from],
    );
    if (!rows.length) return staleOrMissing(c, reference, from);
    const was = rows[0].was;
    if (was !== "resolved") await insertEntry(c, rows[0].id, { kind: "state_change", body: `${was} → resolved`, author });
    await insertEntry(c, rows[0].id, { kind: "resolution", body: text, author });
    return { from: was, to: "resolved", code, noted: trimmed !== null };
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
