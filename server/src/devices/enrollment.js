// @ts-check
/**
 * B3 — device enrollment. The pending queue, the rotatable time-boxed secret, auto-approve with a
 * per-tenant toggle, rate limiting with a fallback to queued approval, and bulk revocation.
 *
 * ===============================================================================================
 * WHAT THIS PASS BUILDS, AND WHAT IT DELIBERATELY DOES NOT
 * ===============================================================================================
 *
 * The phase-1 plan's B3 row (`docs/2026-03-03-phase1-plan.md` §3) names exactly five things: "Pending
 * queue, auto-approve default with per-tenant toggle, rotatable time-boxed secret, rate limiting
 * with automatic fallback to queued approval, bulk revocation by batch." All five are here.
 *
 * D60's device identity (an asymmetric keypair) and D61's token exchange are a LAYER OVER this one,
 * not this one: this module answers "may this device_key_id join this tenant", not "does this
 * request actually come from the device that owns that key". A device presents a public key at
 * enrollment (`deviceKeyId` below is that key's fingerprint, opaque here per the migration 001
 * comment), and the row it earns is real — but nothing yet asks the device to PROVE it holds the
 * matching private key on every subsequent call. That proof (D61's signed assertion -> short-lived
 * token exchange) is the next slice, and register D231 records the cut precisely and why: D60/D64
 * ask for a TPM-backed key in broker custody reached over the named-pipe protocol, and that pipe
 * is DESIGNED, NOT BUILT (D200/D201) — building the full custody chain here would mean building
 * the pipe transport first, which is its own undertaking. `server/docs/B3-DEVICE-ENROLLMENT.md`
 * is the full record.
 *
 * ===============================================================================================
 * THE STATE MACHINE
 * ===============================================================================================
 *
 * Every device is 'pending' | 'active' | 'revoked' (migration 001's CHECK). Every enrollment
 * request is 'pending' | 'approved' | 'rejected' | 'expired'. A submission creates BOTH rows
 * together: the device starts 'pending' and the request starts 'pending'. Approval moves both to
 * 'active'/'approved'; rejection moves the device straight to 'revoked' — there is no state for "a
 * device that asked and was told no", because a device with no fleet membership and no path back in
 * without asking again again is exactly what 'revoked' already means (D66: an enrollment secret
 * buys a pending record, not fleet membership, so being refused costs nothing to try again from).
 *
 * ===============================================================================================
 * WHY THE SECRET'S HASH, NEVER THE SECRET
 * ===============================================================================================
 *
 * `enrollment_secrets.secret_hash` is sha256 of the plaintext, so a database read cannot enrol a
 * device (migration 001's own comment). The plaintext is returned exactly once, from
 * `createEnrollmentSecret()`, the same "print it once, never again" discipline `bin/admin.mjs`
 * already uses for a new admin's password and TOTP secret.
 *
 * ===============================================================================================
 * SINCE 2026-09-12 SOMETHING DOES ASK THE DEVICE TO PROVE ITSELF — WEAKLY, AND SAYING SO (D282)
 * ===============================================================================================
 *
 * D271 was answered by the founder the same day: development on one machine, production on the
 * customer's LAN/WAN. Under that answer a request from an endpoint is a request from another
 * machine, and "does this request come from the device that enrolled" stops being theatre. So a
 * device now holds ONE CREDENTIAL — a 256-bit random token minted when it becomes active, shown to
 * the endpoint exactly once, stored here only as its sha256 (control/008), presented as
 * `Authorization: Bearer mdc_…` on every /v1 request, looked up by hash. `authenticateDeviceCredential()`
 * below is what every authenticated route calls, and it is `last_seen_at`'s first real writer.
 *
 * WHAT IT IS AND IS NOT. It authenticates a PER-OS-USER ENROLLMENT OF THE SOFTWARE: the client
 * keeps it in Electron's per-user userData beside the profile (D215), so each Windows account on a
 * shared machine enrolls separately and anyone who can read that account's userData IS that
 * enrollment. It is not a machine identity, not hardware-bound, not a person. It is the weaker
 * credential on D61's path — the same route shape with a bearer secret where the signed assertion
 * will go; when D60/D63/D64 land, the secret is replaced and the routes do not move.
 *
 * ONE CREDENTIAL, MINTED ONCE. An active device that already holds one gets no second copy from a
 * re-submission, whoever presents the enrollment secret and the device key: the endpoint that has
 * the credential IS the enrollment, and rotation is revoke-and-re-enroll so the console sees every
 * replacement in its queue. A device approved BY HAND (console, CLI) has no credential until its
 * endpoint first submits — that submission mints it. `WHERE credential_hash IS NULL` on the mint
 * is what makes "once" a property of the database rather than of this file.
 */
import { createHash, randomBytes } from "node:crypto";
import { withControl } from "../db/pool.js";

const sha256 = (s) => createHash("sha256").update(s).digest();

/** A random, URL-safe, high-entropy secret. Not a password: nobody types this. */
function randomSecret(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

// ---- the enrollment secret (D81, D82) -----------------------------------------------------------

/**
 * Mint a new secret for a tenant. Rotatable: minting a second one does not revoke the first, so a
 * rollout can hand out the new secret before the old one expires (D81's "rotatable", read as it is
 * meant — a secret with no successor is the skeleton key D81 warns against, and a rotation that
 * revokes-on-mint just moves the same problem to whoever has not updated yet).
 *
 * Returned once. `secret` is never written anywhere; only its hash is.
 *
 * @param {{ tenantId: string, ttlDays?: number }} p
 * @returns {Promise<{ id: string, secret: string, expiresAt: Date }>}
 */
export async function createEnrollmentSecret({ tenantId, ttlDays = 30 }) {
  const secret = randomSecret(32);
  const expiresAt = new Date(Date.now() + ttlDays * 86400_000);
  const { rows } = await withControl((c) => c.query(
    `INSERT INTO control.enrollment_secrets (tenant_id, secret_hash, expires_at)
     VALUES ($1, $2, $3) RETURNING id, issued_at, expires_at`,
    [tenantId, sha256(secret), expiresAt],
  ));
  return { id: rows[0].id, secret, issuedAt: rows[0].issued_at, expiresAt: rows[0].expires_at };
}

/** Every secret a tenant holds, newest first. Never the plaintext — it was never stored. */
export async function listEnrollmentSecrets({ tenantId }) {
  const { rows } = await withControl((c) => c.query(
    `SELECT id, issued_at, expires_at, revoked_at FROM control.enrollment_secrets
      WHERE tenant_id = $1 ORDER BY issued_at DESC`,
    [tenantId],
  ));
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id, issuedAt: r.issued_at, expiresAt: r.expires_at, revokedAt: r.revoked_at,
    live: !r.revoked_at && new Date(r.expires_at).getTime() > now,
  }));
}

/** Revoke one secret. A leaked installer is a leaked secret (D66); this is the remedy. */
export async function revokeEnrollmentSecret({ tenantId, id }) {
  const { rowCount } = await withControl((c) => c.query(
    `UPDATE control.enrollment_secrets SET revoked_at = now()
      WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
    [id, tenantId],
  ));
  return rowCount > 0;
}

/**
 * Does this tenant have a live secret matching this plaintext? A live, unexpired, unrevoked
 * `secret_hash` match — the same "look up by hash" shape `admin/session.js` uses for session
 * tokens, not a manual scan: the hash IS the lookup key, so equality in SQL is already the safe
 * comparison (sha256 of a 256-bit random value has no meaningful timing side-channel to defend).
 *
 * @param {{ tenantId: string, secret: string }} p
 */
export async function verifyEnrollmentSecret({ tenantId, secret }) {
  if (typeof secret !== "string" || !secret) return false;
  const { rows } = await withControl((c) => c.query(
    `SELECT 1 FROM control.enrollment_secrets
      WHERE tenant_id = $1 AND secret_hash = $2 AND revoked_at IS NULL AND expires_at > now()`,
    [tenantId, sha256(secret)],
  ));
  return rows.length > 0;
}

// ---- the enrollment credential (D282, 2026-09-12) ------------------------------------------------

/**
 * Every credential begins with this, so a log line or a config file can be recognised as carrying
 * one, and so `authenticateDeviceCredential()` can refuse a string that cannot be a credential
 * without a database round trip.
 */
export const CREDENTIAL_PREFIX = "mdc_";

/** The credential on the wire: the prefix plus 43 base64url characters (32 random bytes). */
const CREDENTIAL_SHAPE = /^mdc_[A-Za-z0-9_-]{43}$/;

/**
 * Mint the ONE credential a device holds. Takes the control-plane client because it runs inside
 * `submitEnrollment()`'s transaction. `WHERE credential_hash IS NULL` makes mint-once a property of
 * the database: two concurrent first submissions cannot both walk away with a credential — the
 * second UPDATE matches nothing, this returns null, and the caller reports "already holds one".
 *
 * @returns {Promise<string|null>} the plaintext — returned once, never stored, never logged
 */
async function mintCredential(client, deviceId) {
  const credential = CREDENTIAL_PREFIX + randomSecret(32);
  const { rowCount } = await client.query(
    "UPDATE control.devices SET credential_hash = $2, credential_issued_at = now() WHERE id = $1 AND credential_hash IS NULL",
    [deviceId, sha256(credential)],
  );
  return rowCount === 1 ? credential : null;
}

/**
 * @typedef {object} AuthenticatedDevice
 * @property {string} id            control.devices.id — the requester's scope key (tickets.device_id, D284)
 * @property {string} deviceKeyId
 * @property {string} tenantId
 * @property {string} tenantSlug
 * @property {string} tenantSchema  the schema every authenticated route reads and writes — NOT MATIC_TICKET_TENANT
 * @property {"standalone"|"joined"} mode
 */

/**
 * Check a credential presented on a request, and STAMP `last_seen_at` when it is good (the
 * console-honesty addendum's G2: the column had no writer but enrollment; this is the writer).
 *
 * Refused with a reason a route can put in a sentence:
 *   malformed        not a credential at all — no database round trip
 *   unknown          no device holds this hash: never issued, or the device row is gone
 *   revoked          the device was revoked — this is D83a becoming a control
 *   inactive         the device is not active (a credential is minted only on activation, so this
 *                    should not happen; the database is the arbiter, not that sentence)
 *   tenant-inactive  the tenant is suspended or deleted
 *
 * Lookup is hash equality in SQL, the same argument as `verifyEnrollmentSecret()`: sha256 of 256
 * random bits has no meaningful timing side-channel to defend, and the hash IS the key.
 *
 * @param {unknown} token
 * @returns {Promise<{ ok: true, device: AuthenticatedDevice } | { ok: false, why: "malformed"|"unknown"|"revoked"|"inactive"|"tenant-inactive", message: string }>}
 */
export async function authenticateDeviceCredential(token) {
  if (typeof token !== "string" || !CREDENTIAL_SHAPE.test(token)) {
    return { ok: false, why: "malformed", message: "the Authorization header does not carry an enrollment credential (they begin mdc_)" };
  }
  return withControl(async (c) => {
    const { rows } = await c.query(
      `SELECT d.id, d.device_key_id, d.status, d.mode, d.tenant_id, t.slug, t.schema_name, t.status AS tenant_status
         FROM control.devices d JOIN control.tenants t ON t.id = d.tenant_id
        WHERE d.credential_hash = $1`,
      [sha256(token)],
    );
    const d = rows[0];
    if (!d) return { ok: false, why: "unknown", message: "this enrollment credential is not one this hub issued, or its device no longer exists. Enroll again: POST /v1/enroll with the tenant's enrollment secret" };
    if (d.status === "revoked") return { ok: false, why: "revoked", message: "this device's enrollment was REVOKED by an administrator and the credential no longer works. If that was a mistake, enroll again under a new device key" };
    if (d.status !== "active") return { ok: false, why: "inactive", message: `this device is ${d.status}, not active` };
    if (d.tenant_status !== "active") return { ok: false, why: "tenant-inactive", message: "this device's tenant is not active" };
    await c.query("UPDATE control.devices SET last_seen_at = now() WHERE id = $1", [d.id]);
    return { ok: true, device: { id: d.id, deviceKeyId: d.device_key_id, tenantId: d.tenant_id, tenantSlug: d.slug, tenantSchema: d.schema_name, mode: d.mode } };
  });
}

// ---- rate limiting and the anomaly fallback (D83) -------------------------------------------------

/**
 * Per-tenant, in this process, exactly like the admin console's login throttle
 * (`src/admin/router.js`'s `failures` Map) — a speed bump, not a control, reset on restart. Two
 * independent counters:
 *
 *   - FAILURES: a wrong secret repeatedly is a guess. Five in a row locks enrollment for the
 *     tenant for a minute, same shape and same numbers as the login throttle.
 *   - VOLUME: a burst of enrollment activity — right secret or wrong — is the case D83 actually
 *     names ("automatic fallback to queued approval on anomaly"). More than ANOMALY_MAX attempts
 *     in the window forces every submission for the rest of the window into the pending queue,
 *     REGARDLESS of the tenant's auto-approve setting. Auto-approve is a convenience for the
 *     ordinary case; it is not a promise that a burst of a hundred devices in a minute walks
 *     straight into the fleet unattended.
 */
const FAILURE_LOCK_AFTER = 5, FAILURE_LOCK_MS = 60_000;
const ANOMALY_WINDOW_MS = 60_000, ANOMALY_MAX = 20;

/** @type {Map<string, { count: number, until: number }>} */
const failures = new Map();
/** @type {Map<string, number[]>} */
const volume = new Map();

function locked(tenantId) {
  const f = failures.get(tenantId);
  return Boolean(f && f.count >= FAILURE_LOCK_AFTER && Date.now() < f.until);
}
function noteFailure(tenantId) {
  const f = failures.get(tenantId) ?? { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= FAILURE_LOCK_AFTER) f.until = Date.now() + FAILURE_LOCK_MS;
  failures.set(tenantId, f);
}
function clearFailures(tenantId) { failures.delete(tenantId); }

/** Record one attempt (of either outcome) and report whether the tenant is currently "hot". */
function noteVolumeAndCheckAnomaly(tenantId) {
  const now = Date.now();
  const hits = (volume.get(tenantId) ?? []).filter((t) => now - t < ANOMALY_WINDOW_MS);
  hits.push(now);
  volume.set(tenantId, hits);
  return hits.length > ANOMALY_MAX;
}

/** For tests: clear all in-process throttle state. */
export function resetEnrollmentThrottle() { failures.clear(); volume.clear(); }

// ---- devices and requests -------------------------------------------------------------------------

/** One device row, or null. */
async function deviceByKey(client, tenantId, deviceKeyId) {
  const { rows } = await client.query(
    "SELECT * FROM control.devices WHERE tenant_id = $1 AND device_key_id = $2",
    [tenantId, deviceKeyId],
  );
  return rows[0] ?? null;
}

/**
 * Submit an enrollment. The one entry point a device (or, today, the CLI standing in for one)
 * calls, and the one place D83's three behaviours meet: the secret is checked, the volume and
 * failure counters are updated, and the result is exactly one of five shapes below.
 *
 * @param {{ tenantId: string, deviceKeyId: string, secret: string, mode?: "standalone"|"joined", log?: (s:string)=>void }} p
 * @returns {Promise<
 *   { outcome: "locked", retryAfterMs: number } |
 *   { outcome: "refused", reason: string } |
 *   { outcome: "already", status: "pending"|"active"|"revoked", deviceId: string, credential: string|null, why?: string } |
 *   { outcome: "approved", deviceId: string, requestId: string, credential: string|null } |
 *   { outcome: "queued", deviceId: string, requestId: string, why?: string }
 * >}
 */
export async function submitEnrollment({ tenantId, deviceKeyId, secret, mode = "standalone", log = () => {} }) {
  if (locked(tenantId)) {
    const f = failures.get(tenantId);
    return { outcome: "locked", retryAfterMs: Math.max(0, (f?.until ?? 0) - Date.now()) };
  }
  const anomalous = noteVolumeAndCheckAnomaly(tenantId);

  const secretOk = await verifyEnrollmentSecret({ tenantId, secret });
  if (!secretOk) {
    noteFailure(tenantId);
    log(`[devices] enrollment refused for tenant ${tenantId}: bad or expired secret`);
    return { outcome: "refused", reason: "the enrollment secret is wrong, expired or revoked" };
  }
  clearFailures(tenantId);

  return withControl(async (client) => {
    const existing = await deviceByKey(client, tenantId, deviceKeyId);
    if (existing) {
      if (existing.status !== "active") return { outcome: "already", status: existing.status, deviceId: existing.id, credential: null };
      await client.query("UPDATE control.devices SET last_seen_at = now() WHERE id = $1", [existing.id]);
      // D282. An ACTIVE device with no credential was approved by hand (console or CLI) and its
      // endpoint is asking for the first time: mint now, once. One that already holds a
      // credential gets no second copy — the endpoint that has it IS the enrollment, and a copy
      // minted to whoever else presents the secret and this key would be a takeover. Replacement
      // is revoke-and-re-enroll, so the console sees it.
      if (existing.credential_hash) {
        return {
          outcome: "already", status: "active", deviceId: existing.id, credential: null,
          why: "this device already holds a credential; the endpoint that has it is the enrollment. To replace it, revoke the device in the console and enroll again under a new device key",
        };
      }
      const credential = await mintCredential(client, existing.id);
      log(`[devices] ${deviceKeyId} (approved by hand) submitted for the first time — credential minted for tenant ${tenantId}`);
      return { outcome: "already", status: "active", deviceId: existing.id, credential };
    }

    const { rows: [device] } = await client.query(
      `INSERT INTO control.devices (tenant_id, device_key_id, mode, status)
       VALUES ($1, $2, $3, 'pending') RETURNING id`,
      [tenantId, deviceKeyId, mode],
    );
    const { rows: [request] } = await client.query(
      `INSERT INTO control.enrollment_requests (tenant_id, device_key_id, status)
       VALUES ($1, $2, 'pending') RETURNING id`,
      [tenantId, deviceKeyId],
    );

    const { rows: [tenant] } = await client.query(
      "SELECT enrollment_auto_approve FROM control.tenants WHERE id = $1", [tenantId],
    );

    if (anomalous) {
      log(`[devices] tenant ${tenantId} is over ${ANOMALY_MAX} enrollment attempts in ${ANOMALY_WINDOW_MS / 1000}s — queuing regardless of auto-approve (D83)`);
      return { outcome: "queued", deviceId: device.id, requestId: request.id, why: "enrollment activity for this tenant is unusually high right now; an admin will review it" };
    }
    if (!tenant?.enrollment_auto_approve) {
      return { outcome: "queued", deviceId: device.id, requestId: request.id };
    }

    // Auto-approve still writes the pending record and then approves it (D80) — one code path,
    // policy flag on the end, so the queue is a complete audit log rather than a mode that some
    // devices skip.
    await client.query(
      "UPDATE control.devices SET status = 'active', enrolled_at = now(), last_seen_at = now() WHERE id = $1",
      [device.id],
    );
    await client.query(
      "UPDATE control.enrollment_requests SET status = 'approved', decided_at = now() WHERE id = $1",
      [request.id],
    );
    // D282: the credential is minted on the activation and rides back on the same response, once.
    const credential = await mintCredential(client, device.id);
    log(`[devices] ${deviceKeyId} auto-approved for tenant ${tenantId}; credential minted`);
    return { outcome: "approved", deviceId: device.id, requestId: request.id, credential };
  });
}

/** Approve a pending request. Moves the request AND the device together (see the state-machine note above). */
export async function approveEnrollment({ tenantId, requestId, decidedBy }) {
  return withControl(async (client) => {
    const { rows: [request] } = await client.query(
      "SELECT * FROM control.enrollment_requests WHERE id = $1 AND tenant_id = $2 AND status = 'pending'",
      [requestId, tenantId],
    );
    if (!request) return null;
    await client.query(
      "UPDATE control.enrollment_requests SET status = 'approved', decided_at = now(), decided_by = $2 WHERE id = $1",
      [requestId, decidedBy],
    );
    const { rows: [device] } = await client.query(
      `UPDATE control.devices SET status = 'active', enrolled_at = now(), last_seen_at = now()
        WHERE tenant_id = $1 AND device_key_id = $2 RETURNING id`,
      [tenantId, request.device_key_id],
    );
    return { requestId, deviceId: device?.id ?? null, deviceKeyId: request.device_key_id };
  });
}

/** Reject a pending request. The device it created goes straight to revoked — see the header note. */
export async function rejectEnrollment({ tenantId, requestId, decidedBy }) {
  return withControl(async (client) => {
    const { rows: [request] } = await client.query(
      "SELECT * FROM control.enrollment_requests WHERE id = $1 AND tenant_id = $2 AND status = 'pending'",
      [requestId, tenantId],
    );
    if (!request) return null;
    await client.query(
      "UPDATE control.enrollment_requests SET status = 'rejected', decided_at = now(), decided_by = $2 WHERE id = $1",
      [requestId, decidedBy],
    );
    const { rows: [device] } = await client.query(
      `UPDATE control.devices SET status = 'revoked', revoked_at = now()
        WHERE tenant_id = $1 AND device_key_id = $2 RETURNING id`,
      [tenantId, request.device_key_id],
    );
    return { requestId, deviceId: device?.id ?? null, deviceKeyId: request.device_key_id };
  });
}

/**
 * Revoke devices by id, in one batch (D83a: "make sure the console can act at batch granularity").
 * Under D61's design revocation is a row delete or status flip and nothing more, and since D282
 * that IS enough: `authenticateDeviceCredential()` reads the row's status on every request, so a
 * revoked device's credential is refused on its NEXT request. No token list, no CRL. Before
 * 2026-09-12 this changed a status and blocked nothing, and the Agents page said so (D273).
 *
 * @param {{ tenantId: string, deviceIds: string[] }} p
 * @returns {Promise<number>} how many rows actually changed
 */
export async function revokeDevices({ tenantId, deviceIds }) {
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) return 0;
  const { rowCount } = await withControl((c) => c.query(
    `UPDATE control.devices SET status = 'revoked', revoked_at = now()
      WHERE tenant_id = $1 AND id = ANY($2) AND status <> 'revoked'`,
    [tenantId, deviceIds],
  ));
  return rowCount;
}

/** Toggle D80's per-tenant default. */
export async function setAutoApprove({ tenantId, enabled }) {
  await withControl((c) => c.query(
    "UPDATE control.tenants SET enrollment_auto_approve = $2 WHERE id = $1",
    [tenantId, Boolean(enabled)],
  ));
}

/** Every device for a tenant, newest first. */
/**
 * The device_key_id behind one control.devices.id — the string the Agents page lists and the one an
 * operator can match to a machine. The ticket store calls it to put the ENROLLMENT on a ticket
 * beside the internal uuid, which appears on no other screen.
 *
 * Here rather than in src/tickets/query.js for D224's sibling rule (test/admin-static.test.mjs §5b):
 * this file is the one that touches control.devices, so a reader added anywhere else is a second
 * definition of what a device is. Null when the row is gone.
 *
 * @param {string} deviceId
 * @returns {Promise<string|null>}
 */
export async function deviceKeyIdById(deviceId) {
  const { rows } = await withControl((c) => c.query("SELECT device_key_id FROM control.devices WHERE id = $1::uuid", [deviceId]));
  return rows[0]?.device_key_id ?? null;
}

export async function listDevices({ tenantId }) {
  const { rows } = await withControl((c) => c.query(
    `SELECT id, device_key_id, mode, status, enrolled_at, revoked_at, last_seen_at, created_at, credential_issued_at
       FROM control.devices WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId],
  ));
  return rows.map((r) => ({
    id: r.id, deviceKeyId: r.device_key_id, mode: r.mode, status: r.status,
    enrolledAt: r.enrolled_at, revokedAt: r.revoked_at, lastSeenAt: r.last_seen_at, createdAt: r.created_at,
    // D282. When the credential was minted, or null: an active device with null was approved by
    // hand and its endpoint has not asked yet. The hash itself is never returned.
    credentialIssuedAt: r.credential_issued_at ?? null,
  }));
}

/** Pending requests for a tenant, oldest first — a queue, read in the order it should be worked. */
export async function listPendingRequests({ tenantId }) {
  const { rows } = await withControl((c) => c.query(
    `SELECT id, device_key_id, requested_at FROM control.enrollment_requests
      WHERE tenant_id = $1 AND status = 'pending' ORDER BY requested_at ASC`,
    [tenantId],
  ));
  return rows.map((r) => ({ id: r.id, deviceKeyId: r.device_key_id, requestedAt: r.requested_at }));
}

/** How many requests are waiting — the Agents nav badge. */
export async function pendingCount({ tenantId }) {
  const { rows } = await withControl((c) => c.query(
    "SELECT count(*)::int AS n FROM control.enrollment_requests WHERE tenant_id = $1 AND status = 'pending'",
    [tenantId],
  ));
  return rows[0].n;
}

/** The tenant's current auto-approve setting, for the console and the CLI to report identically. */
export async function autoApproveSetting({ tenantId }) {
  const { rows } = await withControl((c) => c.query(
    "SELECT enrollment_auto_approve FROM control.tenants WHERE id = $1", [tenantId],
  ));
  return rows[0]?.enrollment_auto_approve ?? null;
}
