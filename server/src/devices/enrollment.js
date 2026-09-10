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
 *   { outcome: "already", status: "pending"|"active"|"revoked", deviceId: string } |
 *   { outcome: "approved", deviceId: string, requestId: string } |
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
      if (existing.status === "active") {
        await client.query("UPDATE control.devices SET last_seen_at = now() WHERE id = $1", [existing.id]);
      }
      return { outcome: "already", status: existing.status, deviceId: existing.id };
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
    log(`[devices] ${deviceKeyId} auto-approved for tenant ${tenantId}`);
    return { outcome: "approved", deviceId: device.id, requestId: request.id };
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
 * Under D61's design revocation is meant to be a row delete or status flip and nothing more — no
 * token to invalidate exists yet in this pass (see the header), so this IS the whole of revocation
 * today: the row stops being 'active' and a future request from that key finds no active device.
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
export async function listDevices({ tenantId }) {
  const { rows } = await withControl((c) => c.query(
    `SELECT id, device_key_id, mode, status, enrolled_at, revoked_at, last_seen_at, created_at
       FROM control.devices WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId],
  ));
  return rows.map((r) => ({
    id: r.id, deviceKeyId: r.device_key_id, mode: r.mode, status: r.status,
    enrolledAt: r.enrolled_at, revokedAt: r.revoked_at, lastSeenAt: r.last_seen_at, createdAt: r.created_at,
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
