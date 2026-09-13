// @ts-check
/**
 * The requester's four POSTs (D286, D287; P4, 2026-09-12): comment, reopen, confirm, ack.
 *
 *   POST /v1/ticket/:reference/comment   { body }    a comment — and a TRANSITION (D286): on a
 *                                                     resolved ticket it reopens; on a live one it
 *                                                     starts D276's clock; on a closed one it is
 *                                                     refused with the way forward
 *   POST /v1/ticket/:reference/reopen    { reason }  the same transition, requiring the ticket to be
 *                                                     resolved and a reason, recorded as the comment
 *   POST /v1/ticket/:reference/confirm   {}          resolved -> closed, closed_by requester (D278's
 *                                                     resolution stays on the record)
 *   POST /v1/tickets/ack                 { entryIds } the endpoint SHOWED these entries; the hub
 *                                                     stamps read_by_requester_at with ITS clock
 *
 * EVERY ONE NEEDS THE CREDENTIAL, ON EVERY LISTENER. Without a device there is no requester to act
 * as, and the answer is a 401 and a sentence. The device scopes every write to its own tickets in
 * the query layer's SQL (D284): another enrollment's reference is the same 404 as no such ticket.
 *
 * NOTHING HERE HOLDS SQL (D224) OR DECIDES A TRANSITION: `requesterComment()` and
 * `confirmResolution()` in src/tickets/query.js do, under a row lock, in one transaction. This file
 * validates the body, applies the per-enrollment write limit, and puts the outcome into words —
 * including, on every response, what the credential proves and does not (`identity`), and that
 * nobody has been emailed (D86): the desk sees the comment in the console's queue, and that is the
 * whole delivery.
 *
 * THE WRITE LIMIT is the read limit's sibling: WRITES_PER_MINUTE per enrollment, in process, 429 with
 * `retryAfterMs` over it. A comment loop is the second load this hub will ever see.
 */
import { readJson } from "../turn.js";
import { requesterComment, confirmResolution, ackEntries } from "./query.js";
import { identityFor } from "./read.js";

/** Writes per enrollment per minute before a 429. */
export const WRITES_PER_MINUTE = 20;
const WINDOW_MS = 60_000;
/** The three actions on one ticket. The reference shape is 003-tickets.sql's. */
export const ACTION_PATH = /^\/v1\/ticket\/(MD-\d{1,12})\/(comment|reopen|confirm)$/;
export const ACK_PATH = "/v1/tickets/ack";
/** Exported so the test pins the words. */
export const NEEDS_CREDENTIAL_TO_ACT = "acting on a ticket — comment, reopen, confirm, ack — needs the enrollment credential: Authorization: Bearer <credential>, issued once by POST /v1/enroll. Without one there is no requester to act as, and nothing was changed (D286).";

/** @type {Map<string, number[]>} */
const writes = new Map();
function overLimit(deviceId, now = Date.now()) {
  const hits = (writes.get(deviceId) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  writes.set(deviceId, hits);
  return hits.length > WRITES_PER_MINUTE ? Math.max(1, WINDOW_MS - (now - hits[0])) : 0;
}
/** For tests. */
export function resetWriteThrottle() { writes.clear(); }

const notYours = (reference, identity) => ({ ok: false, error: `no ticket ${reference} is readable by this enrollment`, identity });

/**
 * @param {{ log?: (s: string) => void }} [deps]
 */
export function requesterActionHandler({ log = () => {} } = {}) {
  /**
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} _res
   * @param {(status: number, body: object) => void} send
   * @param {{ device: import("../devices/enrollment.js").AuthenticatedDevice|null, pathname: string }} ctx
   */
  return async function handleRequesterAction(req, _res, send, { device, pathname }) {
    if (req.method !== "POST") return send(405, { ok: false, error: "POST only" });
    if (!device) return send(401, { ok: false, error: NEEDS_CREDENTIAL_TO_ACT });
    const wait = overLimit(device.id);
    if (wait > 0) {
      log(`[tickets] device ${device.id} wrote more than ${WRITES_PER_MINUTE} times in a minute - 429`);
      return send(429, { ok: false, error: `this enrollment has acted on tickets more than ${WRITES_PER_MINUTE} times in the last minute; wait before trying again`, retryAfterMs: wait });
    }
    const parsed = await readJson(req);
    if (parsed.error) return send(400, { ok: false, error: parsed.error });
    const body = parsed.value && typeof parsed.value === "object" && !Array.isArray(parsed.value) ? parsed.value : {};
    const identity = identityFor(device);
    try {
      if (pathname === ACK_PATH) {
        if (!Array.isArray(body.entryIds)) return send(400, { ok: false, error: "entryIds must be an array of the entry ids (uuids) this endpoint has SHOWN the requester" });
        const acknowledged = await ackEntries(device.tenantSchema, { deviceId: device.id, entryIds: body.entryIds });
        return send(200, { ok: true, acknowledged, identity, note: "stamped with the hub's clock on the entries that are this enrollment's and were not yet acknowledged; an id that is not yours stamps nothing and is not an error (D287)" });
      }
      const m = ACTION_PATH.exec(pathname);
      if (!m) return send(404, { ok: false, error: `no such route: POST ${pathname}` });
      const [, reference, action] = m;
      if (action === "confirm") {
        const r = await confirmResolution(device.tenantSchema, reference, { deviceId: device.id });
        if (!r) return send(404, notYours(reference, identity));
        if ("refused" in r) return send(409, { ok: false, error: r.refused, state: r.state, identity });
        log(`[tickets] ${reference} confirmed fixed by device ${device.id} - closed`);
        return send(200, { ok: true, reference, from: r.from, state: r.to, closedBy: r.closedBy, identity, note: "closed by you; the desk's resolution stays on the record (D278). A closed ticket is read-only - if the problem comes back, raise a new ticket about it with reopenedFrom (D279)" });
      }
      const text = typeof body.body === "string" ? body.body.trim() : typeof body.reason === "string" ? body.reason.trim() : "";
      if (!text) {
        return send(400, { ok: false, error: action === "reopen" ? 'reopening needs a reason: { reason: "…" }. It is recorded on the ticket as your comment, public' : 'a comment needs words: { body: "…" }' });
      }
      if (text.length > 4000) return send(400, { ok: false, error: "a comment is at most 4000 characters" });
      const r = await requesterComment(device.tenantSchema, reference, { deviceId: device.id, body: text, onlyFromResolved: action === "reopen" });
      if (!r) return send(404, notYours(reference, identity));
      if ("refused" in r) return send(409, { ok: false, error: r.refused, state: r.state, identity });
      log(`[tickets] ${reference}: requester ${action} from device ${device.id} - ${r.from} -> ${r.to}${r.reopened ? " (REOPENED)" : ""}`);
      return send(200, {
        ok: true, reference, from: r.from, state: r.to, reopened: r.reopened, entryId: r.entryId, identity,
        note: r.reopened
          ? "your comment reopened the ticket: the desk's resolution is undone and the ticket is back in their queue (D286). Nobody is emailed (D86) - the desk sees it in the console"
          : "your comment is on the ticket, and the desk's queue shows how long it has waited (D286). Nobody is emailed (D86) - the desk sees it in the console",
      });
    } catch (err) {
      log(`[tickets] requester action failed for device ${device.id} on ${pathname}: ${err.stack ?? err.message}`);
      return send(500, { ok: false, error: `the action could not be recorded: ${err.message}` });
    }
  };
}
