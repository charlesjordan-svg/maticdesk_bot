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
 *
 * SINCE 2026-09-12 THE REQUESTER'S READERS ARE HERE TOO (D281, P3a; rekeyed D284, P3b):
 * `getTicketForRequester()`, `listTicketsForRequester()` and `listEntriesForRequester()` — named
 * columns only, scoped to the ENROLLMENT that filed the ticket (`tickets.device_id`, tenant/008,
 * written from the credential the filing request presented, D282), the public timeline with the
 * argument fixed. P3a built them before the route, keyed on the OS username because no device
 * column existed; D271 was answered the same day (LAN) and P3b added the column and the clause
 * together. `GET /v1/tickets` (src/index.js) is their caller.
 */
import { withTenant } from "../db/tenant.js";
import { withControl } from "../db/pool.js";
import { enqueue, cancelJobsFor } from "../db/jobs.js";
// D224's sibling (admin-static §5b): control.devices is src/devices/enrollment.js's table, so the
// ticket store ASKS for the enrollment's key rather than writing a second query for it.
import { deviceKeyIdById } from "../devices/enrollment.js";

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

// ---- auto-close (tenant/010, control/009; D289, P5) ---------------------------------------------

/** The one job type this store enqueues. src/jobs/handlers.js registers the handler under this name. */
export const AUTOCLOSE_JOB = "ticket.autoclose";

/**
 * The tenant's auto-close interval in hours, by SCHEMA, or null when off. Read at resolve time and
 * never re-applied: a policy change is not a retroactive edit of instants already shown. A control
 * read from the ticket store is allowed here because the ticket store is what has to know it
 * (D224 puts the SQL about tickets in one place; this is that place).
 * @param {string} schema
 */
export async function autocloseHoursForSchema(schema) {
  const { rows } = await withControl((c) => c.query("SELECT ticket_autoclose_hours FROM control.tenants WHERE schema_name = $1", [schema]));
  return rows[0]?.ticket_autoclose_hours ?? null;
}

/**
 * Bind a fresh resolution to ONE auto-close job. Inside the resolving transaction, after the UPDATE
 * that set `resolved_at`: any queued job for this ticket is cancelled first (a re-resolve while one
 * waits), one job is enqueued for `resolvedAt + hours`, and its id and instant are written on the
 * ticket — the binding the handler checks (`closeByAutoclose`). Off (hours null): both columns are
 * cleared and nothing is enqueued. The enqueue commits on its own connection, so a resolve that
 * rolls back afterwards leaves an orphan job whose binding was never written: the handler finds no
 * row and does nothing, which is the contract.
 *
 * @param {import("pg").PoolClient} c  inside withTenant
 * @param {{ schema: string, ticketId: string, resolvedAt: Date }} p
 * @returns {Promise<{ autoCloseAt: Date|null, jobId: string|null }>}
 */
async function scheduleAutoclose(c, { schema, ticketId, resolvedAt }) {
  const hours = await autocloseHoursForSchema(schema);
  await cancelJobsFor(AUTOCLOSE_JOB, ticketId);
  if (hours === null) {
    await c.query("UPDATE tickets SET auto_close_at = NULL, auto_close_job_id = NULL WHERE id = $1", [ticketId]);
    return { autoCloseAt: null, jobId: null };
  }
  const at = new Date(new Date(resolvedAt).getTime() + hours * 3_600_000);
  const jobId = await enqueue({ type: AUTOCLOSE_JOB, tenantSchema: schema, refId: ticketId, runAfter: at });
  // D290: a fresh resolution is a fresh attempt to reach the requester — the re-arm count and any
  // previous "never delivered" verdict go with the resolution they were about.
  await c.query(
    `UPDATE tickets SET auto_close_at = $2, auto_close_job_id = $3::bigint,
            auto_close_rearms = 0, resolution_undelivered_at = NULL
      WHERE id = $1`,
    [ticketId, at, jobId],
  );
  return { autoCloseAt: at, jobId };
}

/**
 * D290 — RE-ARM. Move a resolved ticket's auto-close clock to `from + the tenant's interval`, and
 * bind it to a new job. Two callers, and the difference between them is the whole of D290:
 *
 *   - `ackEntries()`, when the endpoint acknowledges SHOWING the resolution. `attempt` is 0: the
 *     requester has seen it, the clock is theirs now, and it runs from the moment they saw it.
 *   - `closeByAutoclose()`, when the clock came due and the resolution had NOT been shown.
 *     `attempt` is the re-arm number, and at MAX_REARMS the caller gives up instead of calling this.
 *
 * The old job is withdrawn first, exactly as `scheduleAutoclose()` does, so one resolution is bound
 * to one job at a time. Off for the tenant (hours null): the binding is cleared and nothing is
 * enqueued — the same kill switch, reached from a different direction.
 *
 * @param {import("pg").PoolClient} c  inside withTenant
 * @param {{ schema: string, ticketId: string, from: Date, attempt: number }} p
 * @returns {Promise<{ autoCloseAt: Date|null, jobId: string|null }>}
 */
async function rearmAutoclose(c, { schema, ticketId, from, attempt }) {
  const hours = await autocloseHoursForSchema(schema);
  await cancelJobsFor(AUTOCLOSE_JOB, ticketId);
  if (hours === null) {
    await c.query("UPDATE tickets SET auto_close_at = NULL, auto_close_job_id = NULL WHERE id = $1", [ticketId]);
    return { autoCloseAt: null, jobId: null };
  }
  const at = new Date(new Date(from).getTime() + hours * 3_600_000);
  const jobId = await enqueue({ type: AUTOCLOSE_JOB, tenantSchema: schema, refId: ticketId, runAfter: at });
  await c.query(
    `UPDATE tickets SET auto_close_at = $2, auto_close_job_id = $3::bigint,
            auto_close_rearms = $4, resolution_undelivered_at = NULL
      WHERE id = $1`,
    [ticketId, at, jobId, attempt],
  );
  return { autoCloseAt: at, jobId };
}

/**
 * The delivery stamp on the resolution a ticket is CURRENTLY resolved by (D287/D290). The newest
 * `resolution` entry written at or after `resolved_at` — a reopen clears `resolved_at` and a
 * re-resolve writes a newer entry, so "newest at or after" is exactly the current one and never an
 * earlier resolution the requester happened to have seen.
 *
 * `readByRequesterAt` is the one that counts. `notifiedAt` means the hub handed the entry to an
 * app; `readByRequesterAt` means the app said it SHOWED it. Handed to an app is not shown to a
 * person, and D290 is about the second.
 *
 * @returns {Promise<{ notifiedAt: Date|null, readByRequesterAt: Date|null }|null>} null when the
 *   ticket carries no resolution entry at all — which is a resolution written before tenant/006
 *   (or by a path that should not exist), and is treated as undelivered.
 */
async function currentResolutionDelivery(c, ticketId, resolvedAt) {
  const { rows } = await c.query(
    `SELECT notified_at, read_by_requester_at
       FROM ticket_entries
      WHERE ticket_id = $1::uuid AND kind = 'resolution' AND created_at >= $2::timestamptz
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [ticketId, resolvedAt],
  );
  if (!rows.length) return null;
  return { notifiedAt: rows[0].notified_at ?? null, readByRequesterAt: rows[0].read_by_requester_at ?? null };
}

/**
 * The handler's one write: resolved -> closed by 'auto'. FOUR conditions, not three (D289 + D290),
 * all checked under the row lock:
 *
 *   1. the ticket is still `resolved`;
 *   2. it is still bound to THIS job (`auto_close_job_id` = the job's own id) — D289's binding, which
 *      is what makes a job run twice, or a job for a resolution since undone, do nothing;
 *   3. `auto_close_at` has passed;
 *   4. **the resolution was DELIVERED** — the resolution entry the ticket is currently resolved by
 *      carries `read_by_requester_at` (D287): the endpoint said it SHOWED it to the requester.
 *
 * D290 IS THE FOURTH. Auto-close exists to convert SILENCE into consent. Before this it converted
 * UNREACHABILITY into consent, which is a different fact and one this project has a standing
 * position on: D238 gives the user's explicit "no, that did not fix it" its own timestamp precisely
 * so that a non-answer is not recorded as a "no". The same reasoning in reverse — a notice nobody
 * could receive is not a notice nobody answered. The click-through's T8.5 observed it: a ticket
 * resolved with the client shut closed itself, and the requester's first sight of the ticket was
 * its closure.
 *
 * UNDELIVERED IS NOT A FAILURE AND NOT A CLOSE — it RE-ARMS. The clock restarts for another of the
 * tenant's intervals, up to `maxRearms`; after that the hub gives up out loud
 * (`resolution_undelivered_at`, tenant/011) and the ticket goes on the console's "resolved, never
 * delivered" list, because a ticket that re-arms forever is its own quiet failure.
 *
 * Every non-close is SUCCESS, not an error: the world moved on (confirmed, reopened, moved by the
 * desk, re-resolved with a newer job, the interval turned off), or the requester has not been
 * reached yet. The handler never throws for any of it — D270's contract.
 *
 * @param {import("pg").PoolClient} c  inside withTenant(job.tenantSchema)
 * @param {{ schema: string, ticketId: string, jobId: string, author: EntryAuthor, maxRearms?: number }} p
 * @returns {Promise<{ closed: true, reference: string, seenAt: Date }|{ closed: false, why: string, rearmed?: boolean, gaveUp?: boolean, attempt?: number }>}
 */
export async function closeByAutoclose(c, { schema, ticketId, jobId, author, maxRearms = 3 }) {
  const { rows: locked } = await c.query(
    `SELECT id, reference, state, resolved_at, auto_close_at, auto_close_job_id, auto_close_rearms
       FROM tickets WHERE id = $1::uuid FOR UPDATE`,
    [ticketId],
  );
  if (!locked.length) return { closed: false, why: `no ticket ${ticketId} in this tenant` };
  const t = locked[0];

  // The binding, exactly as D289 left it. Every one of these is SUCCESS: the world moved on.
  if (t.state !== "resolved") return { closed: false, why: `${t.reference} is ${t.state}, not resolved` };
  if (t.auto_close_job_id === null) return { closed: false, why: `${t.reference} is resolved but auto-close is not bound to any job (the interval was off, or a move cleared it)` };
  if (String(t.auto_close_job_id) !== String(jobId)) return { closed: false, why: `${t.reference} is resolved by a NEWER resolution bound to job ${t.auto_close_job_id}` };
  if (!t.auto_close_at || new Date(t.auto_close_at).getTime() > Date.now()) return { closed: false, why: `${t.reference} is not due until ${new Date(t.auto_close_at).toISOString()}` };

  // D290 — THE DELIVERY GATE. Auto-close converts SILENCE into consent. Silence is a requester who
  // was shown the resolution and said nothing; a requester whose app never ran was never asked, and
  // closing their ticket tells them their unfixed problem is finished (plan v3 §8.1).
  const delivery = await currentResolutionDelivery(c, t.id, t.resolved_at);
  if (!delivery?.readByRequesterAt) {
    const attempt = (t.auto_close_rearms ?? 0) + 1;
    const shown = delivery?.notifiedAt ? `handed to their app ${new Date(delivery.notifiedAt).toISOString()} but never acknowledged as shown` : "never handed to their app";
    if (attempt > maxRearms) {
      // THE BACKSTOP. Re-arming forever leaves a ticket resolved and nobody looking at it, which is
      // its own quiet failure. The hub stops, keeps the ticket resolved, and says so to a person.
      await c.query(
        `UPDATE tickets SET auto_close_at = NULL, auto_close_job_id = NULL,
                resolution_undelivered_at = now(), updated_at = now()
          WHERE id = $1`,
        [t.id],
      );
      await cancelJobsFor(AUTOCLOSE_JOB, t.id);
      return { closed: false, gaveUp: true, rearmed: false, reference: t.reference, why: `${t.reference}: the resolution was NEVER DELIVERED to the requester (${shown}) after ${maxRearms} intervals. Auto-close has given up rather than close a ticket nobody was shown: the ticket stays resolved and is now on the console's 'resolved, never delivered' list for a person to pick up (D290)` };
    }
    const { autoCloseAt } = await rearmAutoclose(c, { schema, ticketId: t.id, from: new Date(), attempt });
    return { closed: false, rearmed: true, attempt, reference: t.reference, autoCloseAt, why: `${t.reference}: the resolution has NOT been delivered to the requester (${shown}), so nothing was closed. Re-armed for ${autoCloseAt ? new Date(autoCloseAt).toISOString() : "nothing — the interval is off"} (attempt ${attempt} of ${maxRearms}) (D290)` };
  }

  const { rows } = await c.query(
    `UPDATE tickets t
        SET state = 'closed', updated_at = now(), closed_at = now(), closed_by = 'auto',
            awaiting_agent_since = NULL, auto_close_at = NULL, auto_close_job_id = NULL,
            resolution_undelivered_at = NULL
      WHERE t.id = $1::uuid AND t.state = 'resolved' AND t.auto_close_job_id = $2::bigint AND t.auto_close_at <= now()
      RETURNING t.reference`,
    [t.id, jobId],
  );
  if (!rows.length) return { closed: false, why: `${t.reference} moved between the lock and the write` };
  await insertEntry(c, t.id, { kind: "state_change", body: "resolved → closed", author });
  return { closed: true, reference: rows[0].reference, seenAt: delivery.readByRequesterAt };
}

/**
 * D290's backstop list: tickets whose resolution was written, never shown to the requester, and
 * whose auto-close has given up. The console's queue item for a person — the desk finds out it
 * could not reach someone, instead of the ticket quietly agreeing with itself.
 *
 * @param {string} schema
 * @returns {Promise<Array<{ reference: string, resolvedAt: Date, undeliveredSince: Date, attempts: number }>>}
 */
export async function listUndeliveredResolutions(schema) {
  return withTenant(schema, async (c) => {
    const { rows } = await c.query(
      `SELECT reference, resolved_at, resolution_undelivered_at, auto_close_rearms
         FROM tickets
        WHERE state = 'resolved' AND resolution_undelivered_at IS NOT NULL
        ORDER BY resolution_undelivered_at`,
    );
    return rows.map((r) => ({ reference: r.reference, resolvedAt: r.resolved_at, undeliveredSince: r.resolution_undelivered_at, attempts: r.auto_close_rearms }));
  });
}

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
 * THE KINDS THIS BUILD WRITES. `comment` was refused until something could deliver one — a
 * requester-visible entry that reaches nobody is this project's signature defect (plan v3 §0
 * finding 8) and this list is what stopped it being built by accident. `resolution` joined in P2
 * (D278). `comment` joined in P4 (D286, 2026-09-12), the day the endpoint could poll for it: it is
 * written by exactly two functions — `requesterComment()` (a TRANSITION, the requester's) and
 * `replyToRequester()` (the console's, which stops D276's clock) — and `addEntry()` still refuses
 * it, because a comment that only appended would be the one message here guaranteed to land where
 * nobody is watching. test/admin-static.test.mjs §5d pins the list and the two writers.
 */
export const WRITABLE_KINDS = Object.freeze(["work_note", "state_change", "resolution", "comment"]);

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
  // D287's two stamps, both the HUB's clock: when the hub handed the entry to the endpoint
  // (GET /v1/tickets/:ref), and when the endpoint acknowledged it was shown (POST /v1/tickets/ack).
  // Null on internal entries and on the requester's own comments, which are never "delivered".
  notifiedAt: r.notified_at ?? null,
  readByRequesterAt: r.read_by_requester_at ?? null,
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
    throw new Error(`entry kind must be one of: ${WRITABLE_KINDS.join(", ")}; got ${JSON.stringify(kind)}`);
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
  // D286 (P4). A comment is a TRANSITION, not an append: the requester's goes through
  // requesterComment() (it may reopen the ticket and starts D276's clock), the console's through
  // replyToRequester() (it stops the clock). A comment written here would do neither.
  if (kind === "comment") throw new Error("a comment is a transition, not an append (D286): a requester comments through requesterComment(), the console replies through replyToRequester(). addEntry() writes work notes.");
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
      `SELECT e.id, e.kind, e.visibility, e.body, e.author_kind, e.author_label, e.created_at, e.notified_at, e.read_by_requester_at
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
 * (tenant/006). Until P4 the column had NO WRITER and this returned null with both screens saying
 * why; since D286 (2026-09-12) `requesterComment()` sets it — COALESCE, so a second comment does
 * not restart the clock — and `replyToRequester()` and `confirmResolution()` clear it.
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
 * @returns {Promise<(TicketRow & { id: string, description: string, summary: string, whatWasChecked: string|null, profileSource: string|null, sessionId: string|null, deviceId: string|null, reopenedFrom: string|null, internalResolutionNote: string|null, resolutionCode: string|null, resolutionNotes: string|null, resolvedAt: Date|null, closedAt: Date|null, closedBy: string|null })|null>}
 */
export async function getTicket(schema, reference) {
  return withTenant(schema, async (c) => {
    // THE CONSOLE'S SHAPE — every column, because the console and the CLI are entitled to every
    // column. A requester-facing caller uses getTicketForRequester() below (D281): named columns,
    // scoped to the requester, and never this. Two functions rather than one narrower one: the
    // console needs `summary`, the checks and the internal note; the requester must never get them.
    const { rows } = await c.query(
      `SELECT t.*, u.first_name, u.last_name, u.location, u.contact_id, u.os_username, u.profile_source,
              p.reference AS reopened_from_reference
         FROM tickets t LEFT JOIN users u ON u.id = t.user_id
              LEFT JOIN tickets p ON p.id = t.reopened_from
        WHERE t.reference = $1`,
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
      // Which ENROLLMENT filed it (tenant/008, D284), or null: filed with no credential — a
      // loopback development hub, or before the column existed. Both readers say which.
      deviceId: t.device_id ?? null,
      // The CLOSED ticket this one follows up (tenant/009, D286), by reference, or null. Both readers
      // draw it as a link/line; the requester supplied it under their own credential (D284).
      reopenedFrom: t.reopened_from_reference ?? null,
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
      // When the CURRENT resolution closes on its own unless the requester acts (tenant/010, D289);
      // null when not resolved or the tenant's interval is off. Both readers draw it.
      autoCloseAt: t.auto_close_at ?? null,
      // D290 (tenant/011). How many of the tenant's intervals have passed with the resolution still
      // not SHOWN to the requester, and — once the hub has given up trying — when it gave up. Both
      // are internal: the requester whose app never ran is precisely the person who cannot be told.
      // Read by the console's detail page and by `bin/tickets.mjs show`.
      autoCloseRearms: t.auto_close_rearms ?? 0,
      resolutionUndeliveredAt: t.resolution_undelivered_at ?? null,
      // The ENROLLMENT'S OWN KEY, the string the Agents page lists and an operator can match to a
      // machine — not only the internal uuid, which appears on no other screen. One control read,
      // the way autocloseHoursForSchema() does it: the ticket store is what has to know.
      deviceKeyId: t.device_id ? await deviceKeyIdById(t.device_id) : null,
    };
  });
}

/**
 * @typedef {object} RequesterTicket  — the eleven fields a requester may receive; nothing else
 * @property {string} reference
 * @property {string} state
 * @property {string} category
 * @property {string|null} machineName
 * @property {Date} createdAt
 * @property {Date} updatedAt
 * @property {string|null} resolutionCode   glossed by the renderer (D244), never shown raw
 * @property {string|null} resolutionNotes  written FOR the requester (D278)
 * @property {Date|null} resolvedAt
 * @property {Date|null} closedAt
 * @property {string|null} closedBy         a kind, not a person: requester, auto, console_user, system
 */

/** A control.devices.id as the credential lookup returns it. Anything else is a programming error, not a miss. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * THE ELEVEN COLUMNS A REQUESTER MAY RECEIVE — one string, used by both requester readers, so the
 * list and the row cannot drift. Named. Never `t.*`. test/admin-static.test.mjs §5f reads this
 * constant and compares it to the allow-list; test/admin-db.test.mjs §5e classifies every column of
 * `tickets` as visible or hidden and fails on one that is neither.
 */
const REQUESTER_COLUMNS = `t.reference, t.state, t.category, t.machine_name, t.created_at, t.updated_at,
              t.resolution_code, t.resolution_notes, t.resolved_at, t.closed_at, t.closed_by, t.auto_close_at`;

/** ONE shaping function for both requester readers: the allow-list as an object literal. */
const shapeRequesterRow = (t) => ({
  reference: t.reference,
  state: t.state,
  category: t.category,
  machineName: t.machine_name ?? null,
  createdAt: t.created_at,
  updatedAt: t.updated_at,
  resolutionCode: t.resolution_code ?? null,
  resolutionNotes: t.resolution_notes ?? null,
  resolvedAt: t.resolved_at ?? null,
  closedAt: t.closed_at ?? null,
  closedBy: t.closed_by ?? null,
  autoCloseAt: t.auto_close_at ?? null,
});

/** The identity every requester reader takes: REQUIRED, no default, a uuid or a thrown error. */
function requesterDeviceId(fn, { deviceId } = {}) {
  if (typeof deviceId !== "string" || !UUID.test(deviceId)) {
    throw new Error(`${fn} needs identity.deviceId — the enrollment's control.devices.id, from the credential the request presented. No default requester, on purpose (D281/D284)`);
  }
  return deviceId;
}

/**
 * One ticket AS THE REQUESTER MAY SEE IT (D281; rekeyed by D284) — named columns only, scoped to
 * the ENROLLMENT that filed it.
 *
 * WHY A SECOND FUNCTION. `getTicket()` above does `SELECT t.*` for the console, which is entitled
 * to every column. A requester-facing route built on that shape ships `summary` — the model's
 * case note, written for the assignee, which 003-tickets.sql says is never shown to the user and
 * which D214 exists because on 2026-09-04 the avatar read it aloud to one — plus
 * `what_was_checked` and `internal_resolution_note` (D269). That hazard is independent of who may
 * call the route and of where the hub runs (D271), so this shape and its test were built before
 * the gate opened (P3a): D269's ratified condition — the test first, seen failing — discharged.
 * The fix is a second function, not a narrower `getTicket()`: the console needs those fields.
 *
 * NAMED COLUMNS. NEVER `SELECT t.*`, NEVER A SPREAD OF A ROW. `REQUESTER_COLUMNS` and
 * `shapeRequesterRow` above are the one list, used here and by `listTicketsForRequester()`.
 * test/admin-static.test.mjs §5f pins the shape's keys to an allow-list with a reason per field
 * and reads the column string to check the SQL agrees; test/admin-db.test.mjs §5e classifies every
 * column information_schema lists for `tickets` as visible or hidden, so a column added later and
 * put on neither list FAILS rather than leaks — an allow-list fails closed where a denylist of
 * names would have admitted it.
 *
 * KEYED BY THE ENROLLMENT, NOT THE OS USERNAME (D284, P3b, 2026-09-12). P3a keyed this on
 * `u.os_username` because tickets carried no device column, and said in this header that when P3b
 * gave a ticket a device to match, the column and the clause would arrive together. They have:
 * `tickets.device_id` (tenant/008) is written by `createTicket()` from the credential the filing
 * request presented (D282), and the WHERE here is `t.reference = $1 AND t.device_id = $2`. Why the
 * enrollment and not the name: the OS username is self-asserted at enrollment and at filing
 * (D215), so anyone holding the tenant's enrollment secret could enroll under any name and read
 * that name's tickets; the enrollment id is something only the credential-holder can present.
 * Two costs, both accepted in plan v3 §6.2: a reinstall or a cleared userData is a new enrollment
 * and sees no earlier tickets; and a ticket filed with NO credential — a loopback development hub,
 * or any ticket before tenant/008 — has `device_id` NULL and is readable by no requester route.
 *
 * Another enrollment's reference returns null — the same null as no such ticket, so this layer is
 * not an existence oracle. The identity is REQUIRED with no default, for the reason `listEntries()`
 * has no default visibility: a default is how one requester reads another's ticket eighteen months
 * from now.
 *
 * @param {string} schema
 * @param {string} reference  e.g. MD-1000
 * @param {{ deviceId: string }} identity  REQUIRED — the enrollment's control.devices.id
 * @returns {Promise<RequesterTicket|null>}  null for no such ticket AND for another enrollment's
 */
export async function getTicketForRequester(schema, reference, identity) {
  const deviceId = requesterDeviceId("getTicketForRequester", identity);
  return withTenant(schema, async (c) => {
    const { rows } = await c.query(
      `SELECT ${REQUESTER_COLUMNS}
         FROM tickets t
        WHERE t.reference = $1 AND t.device_id = $2::uuid`,
      [reference, deviceId],
    );
    return rows.length ? shapeRequesterRow(rows[0]) : null;
  });
}

/**
 * Every ticket THIS enrollment filed, newest first — what `GET /v1/tickets` returns (D284). Same
 * columns, same shaping function, same scope as `getTicketForRequester()`. A ticket filed with no
 * credential is nobody's and does not appear.
 *
 * @param {string} schema
 * @param {{ deviceId: string }} identity  REQUIRED, as above
 * @param {{ limit?: number }} [opts]  capped at 200 — a requester's view, not an export
 * @returns {Promise<RequesterTicket[]>}
 */
export async function listTicketsForRequester(schema, identity, { limit = 50 } = {}) {
  const deviceId = requesterDeviceId("listTicketsForRequester", identity);
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 200);
  return withTenant(schema, async (c) => {
    const { rows } = await c.query(
      `SELECT ${REQUESTER_COLUMNS}
         FROM tickets t
        WHERE t.device_id = $1::uuid
        ORDER BY t.created_at DESC LIMIT $2`,
      [deviceId, cap],
    );
    return rows.map(shapeRequesterRow);
  });
}

/**
 * One ticket's PUBLIC timeline, for the requester, and only if the ticket is theirs (D281).
 *
 * This is `listEntries(…, { visibility: "public" })` with the argument FIXED — not passed
 * through. A requester path with a visibility parameter is a requester path that can be called
 * wrong; this one has nothing to call wrong. The ownership check is `getTicketForRequester()`'s,
 * so another enrollment's reference yields [] — not even the public rows, because "public" means
 * visible to the ticket's requester, not to every requester. Two round trips; the second is the
 * shared reader, which is the point (D224).
 *
 * @param {string} schema
 * @param {string} reference
 * @param {{ deviceId: string }} identity  REQUIRED, as above
 * @returns {Promise<TicketEntry[]>}  [] when no such ticket, another enrollment's ticket, or no entries
 */
export async function listEntriesForRequester(schema, reference, identity) {
  if (!(await getTicketForRequester(schema, reference, identity))) return [];
  return listEntries(schema, reference, { visibility: "public" });
}

// ---- the requester's actions, and what the desk sends back (D286, D287; P4, 2026-09-12) ------------

/**
 * A requester's comment is a TRANSITION, not an append (D286; plan v3 §6.3, its "D255"). The comment
 * has to change what the QUEUE looks like, because nothing can notify anyone (D86): a comment that
 * only appended would be the one message in this store guaranteed to land where nobody is watching.
 *
 *   resolved     -> open. The desk said it was fixed; the requester says otherwise. The current
 *                  resolution columns are cleared exactly as setTicketState() clears them on any
 *                  move to a live state (the history stays in the timeline), and a `state_change`
 *                  entry is written in the requester's name. `awaiting_agent_since` starts.
 *   new, open    -> stays. `awaiting_agent_since` is set if it is not already running (COALESCE):
 *                  D276's clock measures the OLDEST unanswered comment, so a second one does not
 *                  restart it.
 *   closed       -> REFUSED (D279: closed is terminal). The sentence says to raise a new ticket
 *                  about it, with `reopenedFrom` naming this one, so the link survives.
 *
 * The ticket is locked (FOR UPDATE) and scoped to the requester's ENROLLMENT in the same SELECT
 * (D284): another enrollment's reference is the same null as no ticket. `onlyFromResolved` is
 * `POST /v1/ticket/:ref/reopen`'s shape — the same transition, requiring the ticket to be resolved,
 * so "reopen" can never be a no-op comment on a live ticket by mistake.
 *
 * D289 (P5): the resolved -> open branch clears the auto-close binding (`auto_close_at`,
 * `auto_close_job_id`) in its UPDATE and withdraws the queued `ticket.autoclose` job — the job was
 * bound to the resolution just undone, and a job whose binding is gone does nothing even if the
 * withdrawal misses it (closeByAutoclose's guard).
 *
 * @param {string} schema
 * @param {string} reference
 * @param {{ deviceId: string, body: string, onlyFromResolved?: boolean }} p
 * @returns {Promise<{ from: string, to: string, entryId: string, reopened: boolean, awaitingSince: Date|null }|RefusedMove|null>}
 */
export async function requesterComment(schema, reference, { deviceId, body, onlyFromResolved = false } = {}) {
  const dev = requesterDeviceId("requesterComment", { deviceId });
  const text = typeof body === "string" ? body.trim().slice(0, 4000) : "";
  if (!text) throw new Error("a requester comment needs words");
  return withTenant(schema, async (c) => {
    const { rows } = await c.query(
      "SELECT id, state, user_id FROM tickets WHERE reference = $1 AND device_id = $2::uuid FOR UPDATE",
      [reference, dev],
    );
    if (!rows.length) return null;
    const t = rows[0];
    if (t.state === "closed") {
      return { refused: `${reference} is closed, and a closed ticket is read-only (D279). If the problem is back, raise a new ticket about it - POST /v1/ticket with reopenedFrom: "${reference}" - so the two are linked. Nothing was changed.`, state: "closed" };
    }
    if (onlyFromResolved && t.state !== "resolved") {
      return { refused: `${reference} is ${t.state}, not resolved: there is no resolution to reopen. A comment on a live ticket is POST /v1/ticket/${reference}/comment. Nothing was changed.`, state: t.state };
    }
    // The requester as author: the tenant's users row by id, no label — the console glosses the
    // kind as "the requester" rather than showing a self-asserted name as if it were verified.
    const who = { kind: "requester", userId: t.user_id, label: null };
    const entry = await insertEntry(c, t.id, { kind: "comment", body: text, author: who });
    let to = t.state;
    if (t.state === "resolved") {
      await c.query(
        `UPDATE tickets
            SET state = 'open', updated_at = now(),
                resolution_code = NULL, resolution_notes = NULL, resolved_at = NULL,
                closed_at = NULL, closed_by = NULL,
                auto_close_at = NULL, auto_close_job_id = NULL,
                auto_close_rearms = 0, resolution_undelivered_at = NULL,
                awaiting_agent_since = COALESCE(awaiting_agent_since, now())
          WHERE id = $1`,
        [t.id],
      );
      await insertEntry(c, t.id, { kind: "state_change", body: "resolved → open", author: who });
      to = "open";
      // D289: the auto-close job bound to the resolution just undone is withdrawn. The UPDATE above
      // already cleared the binding, which is the guarantee; this is the fast path.
      await cancelJobsFor(AUTOCLOSE_JOB, t.id);
    } else {
      await c.query("UPDATE tickets SET updated_at = now(), awaiting_agent_since = COALESCE(awaiting_agent_since, now()) WHERE id = $1", [t.id]);
    }
    const { rows: [after] } = await c.query("SELECT awaiting_agent_since FROM tickets WHERE id = $1", [t.id]);
    return { from: t.state, to, entryId: entry.id, reopened: t.state === "resolved", awaitingSince: after.awaiting_agent_since ?? null };
  });
}

/**
 * The requester confirms the fix (D286): resolved -> closed, `closed_by = 'requester'`, the
 * resolution KEPT (a closed ticket's code is the point, D278), D276's clock cleared — nobody is
 * waiting on the desk any more. Guarded in the UPDATE like every other move (D280): only a
 * `resolved` ticket of THIS enrollment closes; anything else is a refusal naming the state now.
 *
 * D289 (P5): a confirmed closure makes the timer moot — the binding is cleared in the UPDATE and the
 * queued `ticket.autoclose` job withdrawn.
 *
 * @param {string} schema
 * @param {string} reference
 * @param {{ deviceId: string }} identity
 * @returns {Promise<{ from: "resolved", to: "closed", closedBy: "requester" }|RefusedMove|null>}
 */
export async function confirmResolution(schema, reference, { deviceId } = {}) {
  const dev = requesterDeviceId("confirmResolution", { deviceId });
  return withTenant(schema, async (c) => {
    const { rows } = await c.query(
      `UPDATE tickets t
          SET state = 'closed', updated_at = now(), closed_at = now(), closed_by = 'requester', awaiting_agent_since = NULL,
              auto_close_at = NULL, auto_close_job_id = NULL,
              auto_close_rearms = 0, resolution_undelivered_at = NULL
         FROM (SELECT id, state AS was, user_id FROM tickets WHERE reference = $1 AND device_id = $2::uuid FOR UPDATE) prev
        WHERE t.id = prev.id AND t.state = 'resolved'
        RETURNING t.id, prev.user_id`,
      [reference, dev],
    );
    if (!rows.length) {
      const { rows: r2 } = await c.query("SELECT state FROM tickets WHERE reference = $1 AND device_id = $2::uuid", [reference, dev]);
      if (!r2.length) return null;
      return { refused: `${reference} is ${r2[0].state}, not resolved: only a resolved ticket can be confirmed fixed. Nothing was changed.`, state: r2[0].state };
    }
    await insertEntry(c, rows[0].id, { kind: "state_change", body: "resolved → closed", author: { kind: "requester", userId: rows[0].user_id, label: null } });
    // D289: a confirmed closure makes the timer moot; the binding is cleared above, the job withdrawn here.
    await cancelJobsFor(AUTOCLOSE_JOB, rows[0].id);
    return { from: "resolved", to: "closed", closedBy: "requester" };
  });
}

/**
 * The desk replies to the requester (D287): a PUBLIC `comment` in the console user's name, and
 * D276's clock STOPS — the oldest unanswered requester comment is answered. One transaction, so the
 * entry and the cleared clock cannot disagree. This is the console's second composer, the one P1
 * refused to build until something could deliver what it wrote; since D282 the endpoint polls for
 * it, and the composer's copy says exactly how far that reaches (in-app, while the app is open —
 * not email).
 *
 * @param {string} schema
 * @param {string} reference
 * @param {{ body: string, author: EntryAuthor }} r  author.kind is console_user (the console) or system (the CLI, as the desk)
 * @returns {Promise<{ id: string, createdAt: Date }|null>}
 */
export async function replyToRequester(schema, reference, { body, author }) {
  if (author?.kind !== "console_user" && author?.kind !== "system") throw new Error("replyToRequester() is the DESK's reply: author.kind must be console_user (the console) or system (bin/tickets.mjs). A requester's comment is requesterComment(), a transition");
  return withTenant(schema, async (c) => {
    const { rows } = await c.query("SELECT id FROM tickets WHERE reference = $1 FOR UPDATE", [reference]);
    if (!rows.length) return null;
    const entry = await insertEntry(c, rows[0].id, { kind: "comment", body, author });
    await c.query("UPDATE tickets SET awaiting_agent_since = NULL, updated_at = now() WHERE id = $1", [rows[0].id]);
    return entry;
  });
}

/**
 * The hub HANDS the desk's public entries to the endpoint (D287): `notified_at` is stamped, by the
 * hub's clock, on every public entry of THIS enrollment's ticket that the requester did not write
 * and that has not been handed over before. Called by `GET /v1/tickets/:reference` before it lists
 * the entries, so the rows the endpoint receives already carry the stamp. Never client-sent.
 *
 * @returns {Promise<number>} how many entries were stamped now
 */
export async function markEntriesNotified(schema, reference, { deviceId } = {}) {
  const dev = requesterDeviceId("markEntriesNotified", { deviceId });
  return withTenant(schema, async (c) => {
    const { rowCount } = await c.query(
      `UPDATE ticket_entries e SET notified_at = now()
         FROM tickets t
        WHERE e.ticket_id = t.id AND t.reference = $1 AND t.device_id = $2::uuid
          AND e.visibility = 'public' AND e.author_kind <> 'requester' AND e.notified_at IS NULL`,
      [reference, dev],
    );
    return rowCount;
  });
}

/**
 * The endpoint ACKNOWLEDGES that it SHOWED entries (D287): `read_by_requester_at` is stamped, by
 * the hub's clock, on the public entries named — and only those that belong to THIS enrollment's
 * tickets and were not already acknowledged. An id from another enrollment's ticket stamps nothing
 * and is not reported as a miss: the count is what was stamped, and that is all the endpoint needs.
 * The timestamp is the hub's, never the client's (plan v3 §7.1: "hub-stamped on ack, never
 * client-sent").
 *
 * @param {string} schema
 * @param {{ deviceId: string, entryIds: string[] }} p
 * @returns {Promise<number>} how many entries were acknowledged now
 */
export async function ackEntries(schema, { deviceId, entryIds } = {}) {
  const dev = requesterDeviceId("ackEntries", { deviceId });
  const ids = (Array.isArray(entryIds) ? entryIds : []).filter((x) => typeof x === "string" && UUID.test(x)).slice(0, 200);
  if (!ids.length) return 0;
  return withTenant(schema, async (c) => {
    const { rows } = await c.query(
      `UPDATE ticket_entries e SET read_by_requester_at = now()
         FROM tickets t
        WHERE e.ticket_id = t.id AND t.device_id = $1::uuid AND e.id = ANY($2::uuid[])
          AND e.visibility = 'public' AND e.read_by_requester_at IS NULL
        RETURNING e.ticket_id, e.kind, e.read_by_requester_at`,
      [dev, ids],
    );
    // D290 — ARM ON ACK. The interval is the requester's time to disagree, so it starts when they
    // were SHOWN the resolution, not when the desk wrote it. Only the first acknowledgement of a
    // resolution re-arms: the UPDATE above stamps only rows where the column was still null, so a
    // client that acks the same entry twice cannot keep pushing its own ticket's clock back.
    for (const r of rows.filter((x) => x.kind === "resolution")) {
      const { rows: t } = await c.query(
        "SELECT id, state, auto_close_job_id FROM tickets WHERE id = $1::uuid FOR UPDATE", [r.ticket_id],
      );
      if (!t.length || t[0].state !== "resolved" || t[0].auto_close_job_id === null) continue;
      await rearmAutoclose(c, { schema, ticketId: t[0].id, from: r.read_by_requester_at, attempt: 0 });
    }
    return rows.length;
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
              closed_by = CASE WHEN $2 = 'closed' THEN $5::text ELSE NULL END,
              auto_close_at = NULL, auto_close_job_id = NULL,
              auto_close_rearms = 0, resolution_undelivered_at = NULL
         FROM (SELECT id, state AS was FROM tickets WHERE reference = $1 FOR UPDATE) prev
        WHERE t.id = prev.id AND ($4::text IS NULL OR t.state = $4::text)
        RETURNING t.id, prev.was`,
      [reference, next, trimmed, from, next === "closed" ? CLOSED_BY[author.kind] : null],
    );
    if (!rows.length) return staleOrMissing(c, reference, from);
    const was = rows[0].was;
    if (was !== next) await insertEntry(c, rows[0].id, { kind: "state_change", body: `${was} → ${next}`, author });
    // D289: this cannot TARGET resolved, so every move here leaves it or never had it; a queued
    // auto-close job for a ticket that is no longer resolved by that resolution is withdrawn.
    if (was === "resolved") await cancelJobsFor(AUTOCLOSE_JOB, rows[0].id);
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
 * The notes are PUBLIC and reach the requester's Matic Desk when it next polls (P4, D287); both
 * readers say so beside them, and neither says "sent".
 *
 * D289 (P5): the resolution is BOUND to one auto-close job. `scheduleAutoclose()` runs inside this
 * transaction after the UPDATE — the tenant's interval read, any older queued job for the ticket
 * cancelled, one job enqueued for `resolved_at + interval`, its id and instant written on the row.
 * Off for the tenant: nothing enqueued, both columns null, `autoCloseAt` null in the result.
 *
 * @param {string} schema
 * @param {string} reference
 * @param {{ code: string, notes: string, note?: string|null, author?: EntryAuthor, from?: string|null }} r
 * @returns {Promise<{ from: string, to: "resolved", code: string, noted: boolean, autoCloseAt: Date|null }|RefusedMove|null>}
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
        RETURNING t.id, prev.was, t.resolved_at`,
      [reference, code, text, trimmed, from],
    );
    if (!rows.length) return staleOrMissing(c, reference, from);
    const was = rows[0].was;
    if (was !== "resolved") await insertEntry(c, rows[0].id, { kind: "state_change", body: `${was} → resolved`, author });
    await insertEntry(c, rows[0].id, { kind: "resolution", body: text, author });
    const { autoCloseAt } = await scheduleAutoclose(c, { schema, ticketId: rows[0].id, resolvedAt: rows[0].resolved_at });
    return { from: was, to: "resolved", code, noted: trimmed !== null, autoCloseAt };
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
