// @ts-check
/**
 * POST /v1/session — the endpoint tells the hub a conversation began, was confirmed fixed, was
 * confirmed NOT fixed, or ended. The fifth API route (D237, D239; 2026-09-10).
 *
 * ===============================================================================================
 * WHAT IT ACCEPTS, AND THE TWO THINGS IT REFUSES BY NAME
 * ===============================================================================================
 *
 *   { event: "begin",     sessionId, startedAt?, machineName? }   the first turn. Idempotent.
 *   { event: "resolved",  sessionId, category?, startedAt? }      the user said "yes" to
 *                                                                 "did that fix it?" (D238)
 *   { event: "not_fixed", sessionId, startedAt? }                 the user said "no". The outcome
 *                                                                 does not move; the fact is kept.
 *   { event: "end",       sessionId }                             the window closed / idle rolled it
 *
 *   `escalated` as an event is REFUSED (400). Escalation is a fact about a ticket, and the ticket
 *   insert sets it inside its own transaction (src/tickets/file.js -> markEscalated). A client that
 *   could say "escalated" without a ticket could inflate the denominator's escalated bucket — or,
 *   more likely, forget to, and leave a filed ticket's session looking unresolved.
 *
 *   `suppressed` is REFUSED (400). Reserved by D118 for a session an alert prevented; no alerts
 *   exist, no session is prevented, and no client is in a position to know. The value stays in the
 *   CHECK so the day it is reachable is a code change and not a migration.
 *
 * ===============================================================================================
 * TENANCY AND IDENTITY: SAME POSTURE AS /v1/ticket, SAME REASON
 * ===============================================================================================
 *
 *   - A tenant in the body is REFUSED. The schema is the hub's endpoint tenant, resolved server-side
 *     exactly as /v1/ticket resolves it (`resolveTicketTenant`), so a session and the ticket it
 *     produces land in the same schema without either side being able to say which.
 *   - The session id is the endpoint's own uuid and is taken at its word (no device auth, D61). A
 *     forged id is a user-context process lying about itself; the store's header says what that is
 *     worth and `ON CONFLICT DO NOTHING` means a stranger's id cannot overwrite an existing row.
 *
 * ===============================================================================================
 * IT IS FAST AND IT IS BEST-EFFORT FROM THE ENDPOINT'S SIDE
 * ===============================================================================================
 *
 * No model call, one or two statements. The endpoint fires `begin` without awaiting it (a first
 * turn must not wait on a database), so the store upserts the row on every later event and the
 * ticket insert does too — see src/sessions/store.js "self-healing". A 503 here (no tenant) or a
 * 500 (database) costs the endpoint nothing but a log line: the conversation proceeds, and the row
 * is written by whichever event next reaches a working hub.
 */
import { readJson } from "../turn.js";
import { UUID_SHAPE } from "../kb/ask.js";
import {
  CATEGORY_SHAPE, CLIENT_REPORTABLE_OUTCOMES, SESSION_EVENTS, SESSION_OUTCOMES,
  acceptStartedAt, beginSession, endSession, noteNotFixed, resolveSession,
} from "./store.js";

/**
 * Shape check. Returns a problem sentence or null.
 * @param {any} body
 */
export function checkSessionRequest(body) {
  if (!body || typeof body !== "object") return "body must be a JSON object";
  if (body.tenant !== undefined || body.tenantId !== undefined || body.tenantLabel !== undefined) {
    return "this hub does not accept a tenant from the client. The tenant schema is chosen "
      + "server-side because device authentication is not built (D61, D132), and a client-supplied "
      + "tenant would become the tenancy model by default.";
  }
  if (typeof body.sessionId !== "string" || !UUID_SHAPE.test(body.sessionId)) return "sessionId must be a uuid";
  if (!SESSION_EVENTS.includes(body.event)) {
    // The two refusals are named, because "unknown event" would send someone to look for a typo.
    if (body.event === "escalated") {
      return "escalated is not an event a client may send: a session becomes escalated when a ticket is filed (POST /v1/ticket with this sessionId), inside the ticket's own transaction (D89, D239).";
    }
    if (body.event === "suppressed") {
      return "suppressed is reserved (D118): an alert prevented the session, so there is no session and no client that could know. Nothing can produce it in this build.";
    }
    if (SESSION_OUTCOMES.includes(body.event) || body.outcome !== undefined) {
      return `an outcome is reported by event, and a client may report only: ${CLIENT_REPORTABLE_OUTCOMES.join(", ")} (plus begin, not_fixed and end)`;
    }
    return `event must be one of: ${SESSION_EVENTS.join(", ")}`;
  }
  if (body.category !== undefined && body.category !== null && !(typeof body.category === "string" && CATEGORY_SHAPE.test(body.category))) {
    return "category, when present, must be a short slug (a capability id or a ticket category)";
  }
  if (body.machineName !== undefined && body.machineName !== null && typeof body.machineName !== "string") return "machineName, when present, must be a string";
  return null;
}

/**
 * The handler.
 * @param {{ tenantSchema: string|null, log?: (s: string) => void }} deps
 */
export function sessionHandler({ tenantSchema, log = () => {} }) {
  return async function handleSession(req, res, send) {
    if (!tenantSchema) {
      return send(503, {
        ok: false,
        error: "this hub has no endpoint tenant configured, so it records no sessions. Set MATIC_TICKET_TENANT "
          + "to a schema that exists in control.tenants (create one with `node bin/db.mjs create-tenant <slug>`).",
      });
    }
    const parsed = await readJson(req);
    if (parsed.error) return send(400, { ok: false, error: parsed.error });
    const problem = checkSessionRequest(parsed.value);
    if (problem) return send(400, { ok: false, error: problem });
    const b = parsed.value;
    const s = {
      id: b.sessionId,
      startedAt: acceptStartedAt(b.startedAt),
      machineName: typeof b.machineName === "string" && b.machineName.trim() ? b.machineName.trim().slice(0, 200) : null,
      category: typeof b.category === "string" ? b.category : null,
    };

    try {
      if (b.event === "begin") {
        const r = await beginSession(tenantSchema, s);
        log(`[session] ${r.created ? "began" : "already known"} ${s.id}${s.machineName ? ` on ${s.machineName}` : ""} (unresolved until something happens)`);
        return send(r.created ? 201 : 200, { ok: true, event: "begin", sessionId: s.id, created: r.created, outcome: "unresolved" });
      }
      if (b.event === "resolved") {
        const r = await resolveSession(tenantSchema, s);
        log(`[session] ${s.id} ${r.changed ? "RESOLVED - the user confirmed the fix" : `stays ${r.outcome} (a confirmation arrived, and it does not move an ${r.outcome} session)`}${s.category ? ` [${s.category}]` : ""}`);
        return send(200, { ok: true, event: "resolved", sessionId: s.id, outcome: r.outcome, changed: r.changed });
      }
      if (b.event === "not_fixed") {
        await noteNotFixed(tenantSchema, s);
        log(`[session] ${s.id} the user said the fix did NOT work - stays unresolved, and the "no" is recorded`);
        return send(200, { ok: true, event: "not_fixed", sessionId: s.id, outcome: "unresolved" });
      }
      // end
      const r = await endSession(tenantSchema, s);
      log(`[session] ${s.id} ended${r.ended ? "" : " (already ended)"}`);
      return send(200, { ok: true, event: "end", sessionId: s.id, ended: r.ended });
    } catch (err) {
      log(`[session] ${b.event} failed: ${err.stack ?? err.message}`);
      return send(500, { ok: false, error: `the session could not be recorded: ${err.message}` });
    }
  };
}
