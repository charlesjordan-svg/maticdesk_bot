// @ts-check
/**
 * POST /v1/ticket — file a ticket. B6-lite (2026-09-04, D213).
 *
 * ===============================================================================================
 * WHY THIS ROUTE EXISTS
 * ===============================================================================================
 *
 * On 2026-09-04 the renderer was clicked through for the first time. A user said "yes please hand
 * to it" to an escalation and the transcript answered *"nothing was filed — there is no ITSM
 * integration in this build"*. That line was correct and had been correct since 2026-09-02: the
 * escalation path rendered a payload and stopped.
 *
 * D73 made the internal ticket store core and D84 made the hub the system of record wherever no
 * ITSM exists. This is that store's create half.
 *
 * ===============================================================================================
 * WHAT THIS ROUTE DOES NOT DO, AND WHY THE RESPONSE SAYS SO
 * ===============================================================================================
 *
 * **It does not notify anybody.** D86 and OPEN-4 both say outbound email is not optional: with the
 * hub as system of record and no ITSM there is no assignment group, no on-call rotation and no L2
 * queue, because all three came free with the ITSM. A row in `tickets` is a record, not a queue.
 *
 * So every success response carries `notified: false` and `notifiedWhy`. That is not decoration.
 * The defect this project has already hit twice — once on the dev box on 2026-09-02, once on
 * screen on 2026-09-04 — is a UI implying an integration that does not exist, and the fix each
 * time was to say the true thing in the place the reader is looking. A client that files a ticket
 * and tells the user "IT has been notified" would be that defect again, and it would be reading
 * this response to do it. The field makes the lie require ignoring a value rather than not knowing
 * one.
 *
 * ===============================================================================================
 * TENANCY AND IDENTITY, BOTH PROVISIONAL, BOTH LOUD
 * ===============================================================================================
 *
 * Same posture as /v1/ask, and for the same reason (D61/D132 unbuilt):
 *
 *   - **A tenant in the request body is REFUSED.** The schema is chosen server-side: on an
 *     AUTHENTICATED call, from the credential's device row (D282/D284, since 2026-09-12); on an
 *     unauthenticated loopback call, from `MATIC_TICKET_TENANT`. A client that can name its own
 *     tenant IS the tenancy model - and a client that could name its own DEVICE would be naming
 *     which requester may read the ticket, so `device_id` comes from the verified credential too.
 *   - **The reporter is self-asserted.** `osUsername` is what the agent read from the OS in the
 *     user's own context; the profile fields are what a person typed. `users.logon_sid` — the
 *     column that would hold an attested identity (D148) — stays NULL, because the pipe that
 *     would carry an attestation is designed and not built (D200/D201). `profile_source` records
 *     'self_asserted' so a later directory sync can tell the two apart rather than guessing.
 *
 * Nothing here is authentication and the response does not imply it is.
 *
 * ===============================================================================================
 * THE ONLY DOOR
 * ===============================================================================================
 *
 * Every read and write goes through `withTenant()` (src/db/tenant.js), which asserts the schema
 * name against `control.tenants` before setting `search_path`. That allow-list is the injection
 * defence, not a tidiness check — `SET` takes no bind parameter. And it confines accident, not
 * intent (D195): this is not a claim of tenant isolation.
 */
import { readJson } from "../turn.js";
import { withTenant } from "../db/tenant.js";
import { listTenants } from "../db/tenants.js";
import { UUID_SHAPE } from "../kb/ask.js";
import { acceptStartedAt, markEscalated } from "../sessions/store.js";

/** The escalation enums, duplicated from the client on purpose — see checkTicketRequest. */
export const TICKET_CATEGORIES = [
  "hardware",
  "account_or_licensing",
  "server_side_outage",
  "physical",
  "needs_human_judgement",
  "other",
];

export const TICKET_OWNERS = [
  "desktop_support",
  "network_team",
  "identity_team",
  "vendor",
  "facilities",
];

/** Trimmed string or null. Empty strings become null so a blank field is not stored as "". */
const str = (v) => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};

/**
 * Shape check.
 *
 * THE ENUMS ARE CHECKED HERE EVEN THOUGH THE CLIENT ALREADY CHECKS THEM, and even though the
 * database has CHECK constraints. Three copies is right, not redundant: the client's copy stops a
 * model's invention reaching the user's screen, this one stops a bad request becoming a 500 with a
 * constraint violation in it, and the database's is the one no future writer can skip. The failure
 * modes are different at each layer.
 *
 * @param {any} body
 * @returns {string|null} a problem, or null
 */
export function checkTicketRequest(body) {
  if (!body || typeof body !== "object") return "body must be a JSON object";

  // Same guard as /v1/ask, same reason. A client-supplied tenant becomes the tenancy model by
  // being convenient.
  if (body.tenant !== undefined || body.tenantId !== undefined || body.tenantLabel !== undefined) {
    return "this hub does not accept a tenant from the client. The tenant schema is chosen "
      + "server-side: from the enrollment credential on an authenticated call (D284), from MATIC_TICKET_TENANT "
      + "on an unauthenticated loopback call - never from the body, where a client-supplied tenant would become "
      + "the tenancy model by default.";
  }

  if (!str(body.description)) return "description must be a non-empty string (the reporter's own words)";
  if (!str(body.summary)) return "summary must be a non-empty string (the case note for the assignee)";
  if (!TICKET_CATEGORIES.includes(body.category)) {
    return `category must be one of: ${TICKET_CATEGORIES.join(", ")}`;
  }
  if (body.suggestedOwner !== null && body.suggestedOwner !== undefined && !TICKET_OWNERS.includes(body.suggestedOwner)) {
    // null is legitimate and is NOT an error: the model is told not to guess an owner, and an
    // unroutable problem is still worth filing.
    return `suggestedOwner, when present, must be null or one of: ${TICKET_OWNERS.join(", ")}`;
  }

  // D237/D239: the session this ticket came from. Optional (a ticket filed by curl or by an
  // endpoint whose session begin never landed still files), shape-checked, self-asserted like the
  // reporter. When present, the insert flips that session to `escalated` in the same transaction.
  if (body.sessionId !== undefined && body.sessionId !== null && !(typeof body.sessionId === "string" && UUID_SHAPE.test(body.sessionId))) {
    return "sessionId, when present, must be a uuid";
  }
  if (body.sessionStartedAt !== undefined && body.sessionStartedAt !== null && typeof body.sessionStartedAt !== "string") {
    return "sessionStartedAt, when present, must be an ISO timestamp string";
  }

  // D286 (P4): a follow-up to a CLOSED ticket, by reference. Shape-checked here; resolved to the
  // earlier ticket's id inside createTicket() under the SAME device_id, so a client cannot link to a
  // ticket it did not file. Without a credential there is no device to check against -> refused.
  if (body.reopenedFrom !== undefined && body.reopenedFrom !== null && !(typeof body.reopenedFrom === "string" && /^MD-\d{1,12}$/.test(body.reopenedFrom))) {
    return "reopenedFrom, when present, must be a ticket reference (MD-…) that this enrollment filed and that is closed";
  }
  const r = body.reporter;
  if (!r || typeof r !== "object") return "reporter must be an object";
  if (!str(r.osUsername)) return "reporter.osUsername must be a non-empty string";
  // firstName/lastName/location/contactId are NOT required here. The endpoint's intake collects
  // them and will not file without them, but the hub accepting a partial profile is deliberate: a
  // ticket with a name and no location is worth more than a 400, and refusing one here would make
  // the hub an authority on what a customer's profile must contain.
  return null;
}

/**
 * Upsert the reporter and insert the ticket, in ONE transaction.
 *
 * One transaction matters: a user row created for a ticket that then fails to insert leaves a
 * profile in the directory for a report that does not exist. `withTenant` already wraps the
 * callback in BEGIN/COMMIT, so this is a property of using it rather than something added here.
 *
 * `deviceId` (D284, tenant/008) is the ENROLLMENT that filed the ticket — the control.devices.id
 * the route took from a verified credential (D282). It is an OPTION, never read from the body: a
 * client that could name its own device would be naming which requester may read the ticket. null
 * means filed with no credential (a loopback listener, where the credential is optional), and such
 * a ticket is readable by no requester route.
 *
 * `reopenedFrom` (D286, tenant/009) is the REFERENCE of a closed ticket this same enrollment filed;
 * it is resolved to an id here, under `deviceId`, and refused — a thrown Error the route turns into
 * a 400 — when the earlier ticket is not this enrollment's or is not closed. Never accepted without a
 * device: an unauthenticated filing has nothing to prove the link with.
 *
 * @param {string} schema
 * @param {object} body
 * @param {{ deviceId?: string|null, reopenedFrom?: string|null }} [opts]
 * @returns {Promise<{reference: string, ticketId: string, userId: string, createdAt: string, reopenedFrom: string|null}>}
 */
export async function createTicket(schema, body, { deviceId = null, reopenedFrom = null } = {}) {
  const r = body.reporter;
  const displayName = [str(r.firstName), str(r.lastName)].filter(Boolean).join(" ") || null;

  return withTenant(schema, async (client) => {
    // Upsert on os_username. That is the only stable key the endpoint can supply today; when a
    // directory arrives it writes external_id/upn and this becomes the fallback (see the migration).
    //
    // COALESCE on update, not overwrite: a later ticket filed from a machine whose profile has
    // been half-cleared must not blank fields the user already gave us. EXCLUDED wins when it has
    // a value, the existing row wins when it does not.
    const userSql = `
      INSERT INTO users (os_username, first_name, last_name, location, contact_id, display_name, profile_source)
      VALUES ($1, $2, $3, $4, $5, $6, 'self_asserted')
      ON CONFLICT (os_username) WHERE os_username IS NOT NULL
      DO UPDATE SET
        first_name   = COALESCE(EXCLUDED.first_name,   users.first_name),
        last_name    = COALESCE(EXCLUDED.last_name,    users.last_name),
        location     = COALESCE(EXCLUDED.location,     users.location),
        contact_id   = COALESCE(EXCLUDED.contact_id,   users.contact_id),
        display_name = COALESCE(EXCLUDED.display_name, users.display_name)
      RETURNING id`;
    const userRes = await client.query(userSql, [
      str(r.osUsername), str(r.firstName), str(r.lastName), str(r.location), str(r.contactId), displayName,
    ]);
    const userId = userRes.rows[0].id;

    // D286: the follow-up link, proven against THIS enrollment's own closed ticket.
    let reopenedFromId = null;
    if (reopenedFrom) {
      if (!deviceId) throw new Error(`reopenedFrom needs the enrollment credential: only the enrollment that filed ${reopenedFrom} can file a follow-up to it (D284)`);
      const { rows: prior } = await client.query("SELECT id, state FROM tickets WHERE reference = $1 AND device_id = $2::uuid", [reopenedFrom, deviceId]);
      if (!prior.length) throw new Error(`reopenedFrom: no ticket ${reopenedFrom} is readable by this enrollment`);
      if (prior[0].state !== "closed") throw new Error(`reopenedFrom: ${reopenedFrom} is ${prior[0].state}, not closed. A live ticket takes a comment (POST /v1/ticket/${reopenedFrom}/comment); a follow-up is for a closed one`);
      reopenedFromId = prior[0].id;
    }

    // THE SESSION BECOMES ESCALATED HERE, IN THIS TRANSACTION (D89: "escalated = a ticket was
    // created"; D239: set automatically, never asked, never sent by the client as an event). The
    // row is upserted first because the endpoint's `begin` is best-effort and may not have landed
    // (src/sessions/store.js, "self-healing") — and `tickets.session_id` is a foreign key, so the
    // row has to exist before the ticket can point at it. The ticket's category is the session's
    // category from here on (D186 groups by it).
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
    if (sessionId) {
      await markEscalated(client, {
        id: sessionId,
        category: body.category,
        startedAt: acceptStartedAt(body.sessionStartedAt),
        machineName: str(body.machineName),
      });
    }

    // The reference is drawn from the sequence inside the same transaction. A rolled-back insert
    // burns a number — sequences are non-transactional by design — which is correct: a reference
    // must never be reused, and a gap in MD-#### is meaningless to everyone who reads one.
    const ticketSql = `
      INSERT INTO tickets
        (reference, user_id, session_id, description, summary, what_was_checked, machine_name, category, suggested_owner, device_id, reopened_from)
      VALUES
        ('MD-' || nextval('ticket_reference_seq'), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, reference, created_at`;
    const t = await client.query(ticketSql, [
      userId,
      sessionId,
      str(body.description),
      str(body.summary),
      str(body.whatWasChecked),
      str(body.machineName),
      body.category,
      body.suggestedOwner ?? null,
      deviceId,
      reopenedFromId,
    ]);

    return {
      reference: t.rows[0].reference,
      ticketId: t.rows[0].id,
      userId,
      sessionId,
      createdAt: t.rows[0].created_at.toISOString(),
      reopenedFrom: reopenedFromId ? reopenedFrom : null,
    };
  });
}

/**
 * The handler.
 *
 * @param {{ tenantSchema: string|null, log?: (s: string) => void }} deps
 */
export function ticketHandler({ tenantSchema, log = () => {} }) {
  /**
   * @param {{ device?: import("../devices/enrollment.js").AuthenticatedDevice|null }} [ctx]  the
   *   authenticated device from src/index.js's authenticate(); null on an unauthenticated call
   */
  return async function handleTicket(req, res, send, { device = null } = {}) {
    // D284: an authenticated call's tenant is the CREDENTIAL's. The configured tenant serves an
    // unauthenticated loopback call only, and a hub with neither files nothing, with a reason.
    const schema = device?.tenantSchema ?? tenantSchema;
    if (device && tenantSchema && device.tenantSchema !== tenantSchema) {
      log(`[hub] ticket from device ${device.id} lands in its own tenant ${device.tenantSchema}, not the configured ${tenantSchema} (D284)`);
    }
    if (!schema) {
      // A 503 with a reason, not a 404. "This hub files no tickets" and "no such route" are
      // different facts for a client, and the second one sends someone reading the wrong code.
      return send(503, {
        ok: false,
        error: "this hub has no ticket tenant configured for an unauthenticated call. Set MATIC_TICKET_TENANT to a "
          + "schema that exists in control.tenants (create one with `node bin/db.mjs create-tenant <slug>`), or "
          + "present an enrollment credential, whose tenant is used instead (D284).",
      });
    }

    const parsed = await readJson(req);
    if (parsed.error) return send(400, { ok: false, error: parsed.error });
    const problem = checkTicketRequest(parsed.value);
    if (problem) return send(400, { ok: false, error: problem });

    try {
      const filed = await createTicket(schema, parsed.value, { deviceId: device?.id ?? null, reopenedFrom: parsed.value.reopenedFrom ?? null });
      log(`[hub] filed ${filed.reference} in ${schema} (category ${parsed.value.category}, owner ${parsed.value.suggestedOwner ?? "unrouted"})${device ? ` by device ${device.id}` : " - unauthenticated"}`);
      return send(201, {
        ok: true,
        ...filed,
        tenant: schema,
        // D282/D284: whether a credential was presented, so the endpoint can say what the hub knows
        // about who filed this - an enrollment, or nobody in particular.
        authenticated: Boolean(device),
        // The two fields that stop a client claiming more than happened. See the header.
        notified: false,
        notifiedWhy:
          "This build has no outbound email, so nobody has been told. D86 and OPEN-4 both treat "
          + "email to an IT alias as part of the ticket store rather than an enhancement: without "
          + "an ITSM there is no assignment group and no queue, so the store alone is a record and "
          + "not a queue. Do not tell the user that IT has been notified.",
      });
    } catch (err) {
      // D286: a refused follow-up link is the client's mistake, said back as a 400 — not a 500.
      if (/^reopenedFrom/.test(err.message)) return send(400, { ok: false, error: err.message, filed: false });
      // The database being down must not look like the ticket being rejected.
      log(`[hub] ticket insert failed: ${err.stack ?? err.message}`);
      return send(500, {
        ok: false,
        error: `the ticket could not be stored: ${err.message}`,
        // So the endpoint can say "nothing was filed" with confidence rather than guessing.
        filed: false,
      });
    }
  };
}

/**
 * Which tenant schema tickets are written to (B6-lite, D213).
 *
 * `MATIC_TICKET_TENANT` wins. With it unset, a hub that has EXACTLY ONE tenant uses that one and
 * says so loudly on startup.
 *
 * THE INFERENCE IS DELIBERATELY NARROW, and the narrowness is the whole design. "Convenience
 * becomes the model by default" is the failure /v1/ask's tenant refusal exists to prevent, so:
 *
 *   - it never runs on a hub with two or more tenants — with a choice to make, the operator makes
 *     it, because picking one would be inventing a routing rule nobody decided;
 *   - it is SERVER-SIDE. Nothing a client sends can influence it, which is the property that
 *     matters; a request body naming a tenant is still refused;
 *   - it prints what it chose and why. An inferred value that nobody can see is how a default
 *     becomes load-bearing without a decision.
 *
 * A database that cannot be reached returns null rather than throwing: the hub must start when
 * PostgreSQL is down (the same reason /v1/health reports corpus errors instead of refusing), and
 * /v1/ticket then answers 503 with the reason.
 *
 * @param {(s: string) => void} log
 * @returns {Promise<string|null>}
 */
export async function resolveTicketTenant(log = () => {}) {
  const configured = process.env.MATIC_TICKET_TENANT;
  if (configured) return configured;
  try {
    // Static import at the top of this file: `src/tickets/` is a feature module and may reach the
    // database. `src/index.js` may not, which is why this function lives here and not there
    // (test/db-static.test.mjs §6).
    // Suspended and deleted tenants are not candidates: filing into one would be writing to a
    // schema somebody deliberately took out of service.
    const tenants = (await listTenants()).filter((t) => t.status === "active");
    if (tenants.length === 1) {
      const only = tenants[0].schemaName;
      log(`[hub] ticket tenant not set; this hub has exactly one active tenant, using "${only}". Set MATIC_TICKET_TENANT to be explicit.`);
      return only;
    }
    if (tenants.length === 0) log("[hub] no tenants exist, so /v1/ticket will answer 503. Create one: node bin/db.mjs create-tenant <slug>");
    else log(`[hub] ${tenants.length} tenants exist and MATIC_TICKET_TENANT is not set, so /v1/ticket will answer 503. Naming one is an operator decision, not a guess this hub should make.`);
    return null;
  } catch (err) {
    log(`[hub] could not read control.tenants (${err.message}); /v1/ticket will answer 503`);
    return null;
  }
}

