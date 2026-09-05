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
 *   - **A tenant in the request body is REFUSED.** The schema is chosen server-side from
 *     `MATIC_TICKET_TENANT`. A client that can name its own tenant IS the tenancy model.
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
      + "server-side (MATIC_TICKET_TENANT) because device authentication is not built (D61, D132), "
      + "and a client-supplied tenant would become the tenancy model by default.";
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
 * @param {string} schema
 * @param {object} body
 * @returns {Promise<{reference: string, ticketId: string, userId: string, createdAt: string}>}
 */
export async function createTicket(schema, body) {
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

    // The reference is drawn from the sequence inside the same transaction. A rolled-back insert
    // burns a number — sequences are non-transactional by design — which is correct: a reference
    // must never be reused, and a gap in MD-#### is meaningless to everyone who reads one.
    const ticketSql = `
      INSERT INTO tickets
        (reference, user_id, description, summary, what_was_checked, machine_name, category, suggested_owner)
      VALUES
        ('MD-' || nextval('ticket_reference_seq'), $1, $2, $3, $4, $5, $6, $7)
      RETURNING id, reference, created_at`;
    const t = await client.query(ticketSql, [
      userId,
      str(body.description),
      str(body.summary),
      str(body.whatWasChecked),
      str(body.machineName),
      body.category,
      body.suggestedOwner ?? null,
    ]);

    return {
      reference: t.rows[0].reference,
      ticketId: t.rows[0].id,
      userId,
      createdAt: t.rows[0].created_at.toISOString(),
    };
  });
}

/**
 * The handler.
 *
 * @param {{ tenantSchema: string|null, log?: (s: string) => void }} deps
 */
export function ticketHandler({ tenantSchema, log = () => {} }) {
  return async function handleTicket(req, res, send) {
    if (!tenantSchema) {
      // A 503 with a reason, not a 404. "This hub files no tickets" and "no such route" are
      // different facts for a client, and the second one sends someone reading the wrong code.
      return send(503, {
        ok: false,
        error: "this hub has no ticket tenant configured. Set MATIC_TICKET_TENANT to a schema that "
          + "exists in control.tenants (create one with `node bin/db.mjs create-tenant <slug>`).",
      });
    }

    const parsed = await readJson(req);
    if (parsed.error) return send(400, { ok: false, error: parsed.error });
    const problem = checkTicketRequest(parsed.value);
    if (problem) return send(400, { ok: false, error: problem });

    try {
      const filed = await createTicket(tenantSchema, parsed.value);
      log(`[hub] filed ${filed.reference} in ${tenantSchema} (category ${parsed.value.category}, owner ${parsed.value.suggestedOwner ?? "unrouted"})`);
      return send(201, {
        ok: true,
        ...filed,
        tenant: tenantSchema,
        // The two fields that stop a client claiming more than happened. See the header.
        notified: false,
        notifiedWhy:
          "This build has no outbound email, so nobody has been told. D86 and OPEN-4 both treat "
          + "email to an IT alias as part of the ticket store rather than an enhancement: without "
          + "an ITSM there is no assignment group and no queue, so the store alone is a record and "
          + "not a queue. Do not tell the user that IT has been notified.",
      });
    } catch (err) {
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

