// @ts-check
/**
 * GET /v1/tickets and GET /v1/tickets/:reference — a requester reads THEIR OWN tickets (D284, P3b,
 * 2026-09-12). The route P3a built the readers for and did not build.
 *
 * WHO "THEIR OWN" IS. The enrollment that filed them: `tickets.device_id` (tenant/008) equals the
 * control.devices.id the request's credential resolved to (D282). Not an OS username, not a
 * reference the caller happens to know — plan v3 §6.2's correction 1: our references are
 * sequential by design, so "knows the reference" is a thousand guesses, not authorization. This
 * route does not exist without a credential: with none there is no requester to scope the read to,
 * so the answer is a 401 and a sentence, never a list — on every listener, loopback included.
 *
 * WHAT IT RETURNS. P3a's shape (D281) and nothing else: `listTicketsForRequester()` /
 * `getTicketForRequester()` — eleven named columns — and `listEntriesForRequester()`, the PUBLIC
 * timeline with the visibility argument fixed in the query layer. `summary`, `what_was_checked`,
 * the internal resolution note and every internal entry cannot reach this response because the
 * readers cannot return them (test/admin-static.test.mjs §5f, test/admin-db.test.mjs §5e) — not
 * because this file remembers to strip them. This file holds no SQL (D224).
 *
 * THE HONESTY FIELD. Every response carries `identity`: what the credential proves and what it
 * does not, in words — the `notified: false` discipline applied to an identity. A client that
 * renders "your tickets" must be able to read that the hub knows an ENROLLMENT, not a person.
 *
 * THE RATE LIMIT IS THE POLL FLOOR'S SERVER HALF. A misconfigured fleet polling at 1 s is the
 * first load this hub will ever see (the P3a/P3b handover §2.2). READS_PER_MINUTE per enrollment,
 * in process, the shape of the enrollment throttle (D83): over it, 429 with `retryAfterMs` and the
 * floor in words. The client's own interval (P4) is the other half; this one holds when that one is
 * wrong.
 *
 * A reference that is not this enrollment's is a 404 with the same sentence as one that does not
 * exist. The query layer returns the same null for both, so this route could not tell them apart
 * if it wanted to.
 */
import { getTicketForRequester, listTicketsForRequester, listEntriesForRequester, markEntriesNotified } from "./query.js";
import { IDENTITY_NOTE } from "../devices/route.js";

/** Reads per enrollment per minute before a 429. Sixty: one a second is the fastest poll this hub will honour. */
export const READS_PER_MINUTE = 60;
const WINDOW_MS = 60_000;
/** A reference as 003-tickets.sql mints them. Anything else is a 404, not a query. */
const REF = /^MD-\d{1,12}$/;

/** @type {Map<string, number[]>} deviceId -> read timestamps inside the window */
const reads = new Map();

/** Records the attempt and returns ms until the window frees, or 0 when under the limit. */
function overLimit(deviceId, now = Date.now()) {
  const hits = (reads.get(deviceId) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  reads.set(deviceId, hits);
  return hits.length > READS_PER_MINUTE ? Math.max(1, WINDOW_MS - (now - hits[0])) : 0;
}

/** For tests: forget every enrollment's reads. */
export function resetReadThrottle() { reads.clear(); }

/** The sentence a credential-less call gets. Exported so the test can pin the words, not a paraphrase. */
export const NEEDS_CREDENTIAL = "GET /v1/tickets reads the tickets YOUR enrollment filed, so it needs the enrollment credential — Authorization: Bearer <credential> — issued once by POST /v1/enroll with the tenant's enrollment secret. Without one there is no requester to scope the read to, and nothing is returned (D284).";

/**
 * What the credential proves and does not, on every response, so a client cannot say more than
 * the hub knows.
 * @param {import("../devices/enrollment.js").AuthenticatedDevice} device
 */
export function identityFor(device) {
  return {
    kind: "enrollment-credential",
    deviceId: device.id,
    tenant: device.tenantSlug,
    proves: IDENTITY_NOTE,
    doesNotProve: "who is at the keyboard, which machine this is, or that the profile fields on a ticket are true — those are self-asserted (D215). Tickets filed before this enrollment, from another account on the same machine, or with no credential are not visible to it",
  };
}

/**
 * @param {{ log?: (s: string) => void }} [deps]
 */
export function ticketsReadHandler({ log = () => {} } = {}) {
  /**
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} _res
   * @param {(status: number, body: object) => void} send
   * @param {{ device: import("../devices/enrollment.js").AuthenticatedDevice|null }} ctx
   */
  return async function handleTicketsRead(req, _res, send, { device }) {
    if (req.method !== "GET") return send(405, { ok: false, error: "GET only" });
    if (!device) return send(401, { ok: false, error: NEEDS_CREDENTIAL });
    const wait = overLimit(device.id);
    if (wait > 0) {
      log(`[tickets] device ${device.id} read tickets more than ${READS_PER_MINUTE} times in a minute - 429`);
      return send(429, {
        ok: false,
        error: `this enrollment has read tickets more than ${READS_PER_MINUTE} times in the last minute. Poll no faster than once every ${Math.ceil(WINDOW_MS / READS_PER_MINUTE / 1000)} second(s); this limit is the floor, not a suggestion`,
        retryAfterMs: wait,
      });
    }
    const pathname = (req.url ?? "/").split("?")[0];
    const rest = pathname.slice("/v1/tickets".length);
    const identity = identityFor(device);
    try {
      if (rest === "" || rest === "/") {
        const tickets = await listTicketsForRequester(device.tenantSchema, { deviceId: device.id });
        return send(200, { ok: true, tickets, count: tickets.length, identity, note: "requester-safe columns only (D281); only tickets this enrollment filed (D284)" });
      }
      let reference;
      try { reference = decodeURIComponent(rest.slice(1)); } catch { reference = rest.slice(1); }
      if (!REF.test(reference)) return send(404, { ok: false, error: `no ticket ${reference.slice(0, 40)} is readable by this enrollment`, identity });
      const ticket = await getTicketForRequester(device.tenantSchema, reference, { deviceId: device.id });
      if (!ticket) return send(404, { ok: false, error: `no ticket ${reference} is readable by this enrollment`, identity });
      // D287: the hub HANDS the desk's public entries over — `notified_at` is stamped with the hub's
      // clock BEFORE the rows are read, so what the endpoint receives already says when it got it.
      // The requester's own comments are not "delivered" and get no stamp.
      const handed = await markEntriesNotified(device.tenantSchema, reference, { deviceId: device.id });
      const entries = await listEntriesForRequester(device.tenantSchema, reference, { deviceId: device.id });
      return send(200, { ok: true, ticket, entries, handed, identity, note: "public entries only; the desk's work notes are never here (D275). notifiedAt is when this hub handed an entry to you; readByRequesterAt is when you acknowledged showing it (POST /v1/tickets/ack) - both the hub's clock (D287)" });
    } catch (err) {
      log(`[tickets] read failed for device ${device.id}: ${err.stack ?? err.message}`);
      return send(500, { ok: false, error: `the tickets could not be read: ${err.message}` });
    }
  };
}
