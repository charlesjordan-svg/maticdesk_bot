// @ts-check
/**
 * Enrollment — the client half of B3, unbuilt from 2026-09-10 until 2026-09-12 (D282, D285; P3b).
 *
 * ===============================================================================================
 * WHAT THIS DOES, IN ONE PARAGRAPH
 * ===============================================================================================
 *
 * At startup, if config.json carries the tenant's enrollment secret, the endpoint POSTs
 * /v1/enroll ONCE with an opaque device key it minted for itself, and keeps what the hub returns —
 * a device id and a credential the hub shows exactly once — in `enrollment.json` beside
 * `profile.json`, in Electron's per-user userData. HubClient presents that credential as
 * `Authorization: Bearer` on every later request (D282). Nothing here generates a key: D60/D63's
 * keypair and D64's custody are not built, and calling the device key a key would overstate it.
 * It is a random string that lets the hub tell two enrollments apart.
 *
 * ===============================================================================================
 * WHAT THE CREDENTIAL IS, AND IS NOT — SAID HERE BECAUSE THIS FILE IS WHERE IT LIVES
 * ===============================================================================================
 *
 * A PER-OS-USER ENROLLMENT OF THE SOFTWARE. userData is per-OS-user by construction (the same
 * property src/profile/profile.js relies on), so two people sharing a machine get two enrollments
 * without this file knowing anything about accounts — and anyone who can read this user's userData
 * IS this enrollment. Not a machine identity, not hardware-bound, not a person. The hub says the
 * same in words on every response that carries it (`identity`), and nothing here upgrades it.
 *
 * ===============================================================================================
 * WHERE THE SECRET COMES FROM (D285, Charles, 2026-09-12)
 * ===============================================================================================
 *
 * config.json's `enrollment: { tenant, secret }`, plaintext, per install — or the environment for
 * one run (MATIC_ENROLLMENT_TENANT / MATIC_ENROLLMENT_SECRET). Plan v3 §8.1 said a plaintext secret
 * in config.json is a decision, not a default; the decision was taken because there is no
 * installer to deliver it any other way (D82: install-time configuration; B3: "there is no
 * installer in this build"). The repository's config.json carries an EMPTY secret and a test fails
 * if it does not. With no secret this module does nothing but say so once.
 *
 * ===============================================================================================
 * THE OUTCOMES, AND WHAT THE CALLER DOES WITH EACH
 * ===============================================================================================
 *
 *   active       a credential is on disk (or just arrived). Present it. Done until it is revoked.
 *   pending      the hub queued the request for an administrator (D80 off, or D83's anomaly
 *                fallback). Retry later with the SAME device key; the approval mints the credential
 *                on that next submission.
 *   held         the hub says this device key already holds a credential this endpoint does not
 *                have. Nothing to retry: an administrator revokes the device and this file is
 *                deleted, then the endpoint enrolls afresh under a new key. Said in the log.
 *   refused      wrong or expired secret, or an unknown tenant — the hub says the same for both.
 *                Not retried automatically: the fix is in config.json, not in time.
 *   locked       D83's throttle. Retry later.
 *   unreachable  the hub did not answer. Retry later; HubLink is the surface that says so.
 *   disabled     no tenant or secret configured. Nothing sent; the log says how to enable it.
 *
 * Nothing here throws into the app: an enrollment that fails leaves the endpoint exactly where it
 * was before P3b — unauthenticated — which on a loopback hub still works (D283), and on a LAN hub
 * gets 401s whose sentences say what to do.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";

export const ENROLLMENT_FILENAME = "enrollment.json";

/** How long after a pending, locked or unreachable outcome the app tries again. */
export const ENROLL_RETRY_MS = 5 * 60_000;

/** The keys enrollment.json holds. Nothing else is read back, so a hand edit cannot smuggle a field. */
const KEYS = ["deviceKeyId", "deviceId", "credential", "tenant", "hubUrl", "status", "enrolledAt", "lastAttemptAt", "lastOutcome"];

/**
 * The endpoint's opaque device key: random, minted once per userData, derived from nothing. NOT a
 * cryptographic key (D60/D63 are not built) — a name the hub can tell apart from other names.
 */
export function newDeviceKeyId() {
  return "ep-" + randomBytes(16).toString("hex");
}

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

export class EnrollmentStore {
  /** @param {{ dir: string, onLog?: (s: string) => void }} deps  `dir` is Electron's userData path */
  constructor({ dir, onLog = () => {} }) {
    this.path = join(dir, ENROLLMENT_FILENAME);
    this.onLog = onLog;
  }

  /** The stored enrollment, or an empty one. A missing file is the normal first run. */
  read() {
    const empty = Object.fromEntries(KEYS.map((k) => [k, null]));
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf8"));
      const out = { ...empty };
      for (const k of KEYS) out[k] = str(raw?.[k]);
      return out;
    } catch (err) {
      if (err.code !== "ENOENT") this.onLog(`[enroll] ${this.path} could not be read (${err.message}); treating it as empty`);
      return empty;
    }
  }

  /** Merge and persist known keys only. Never logs the credential. */
  write(patch) {
    const merged = { ...this.read() };
    for (const k of KEYS) if (patch?.[k] !== undefined) merged[k] = str(patch[k]);
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify(merged, null, 2) + "\n", "utf8");
    } catch (err) {
      this.onLog(`[enroll] could not save ${this.path}: ${err.message}`);
    }
    return merged;
  }
}

/**
 * @typedef {object} EnrollmentOutcome
 * @property {"active"|"pending"|"held"|"refused"|"locked"|"unreachable"|"disabled"} state
 * @property {string|null} credential   present only when `state` is "active"
 * @property {string|null} deviceId
 * @property {string|null} deviceKeyId
 * @property {string|null} why          a sentence for the log; null when nothing needs saying
 * @property {boolean} retry            whether the caller should try again later
 */

/**
 * Make sure this endpoint is enrolled with the hub, doing as little as that takes: nothing if a
 * credential is already on disk for this hub, one POST otherwise.
 *
 * @param {{ store: EnrollmentStore, hubUrl: string, tenant: string|null, secret: string|null, fetchImpl?: typeof fetch, onLog?: (s: string) => void, timeoutMs?: number, now?: () => Date }} p
 * @returns {Promise<EnrollmentOutcome>}
 */
export async function ensureEnrolled({ store, hubUrl, tenant, secret, fetchImpl = globalThis.fetch, onLog = () => {}, timeoutMs = 10_000, now = () => new Date() }) {
  const base = String(hubUrl ?? "").replace(/\/+$/, "");
  const s = store.read();
  const done = (state, extra = {}) => ({ state, credential: null, deviceId: s.deviceId, deviceKeyId: s.deviceKeyId, why: null, retry: false, ...extra });

  // Already enrolled with THIS hub: nothing to send. A credential from another hub is not presented
  // — the other hub would only refuse it — and this hub is enrolled with afresh below.
  if (s.credential && s.hubUrl === base) return done("active", { credential: s.credential });

  if (!str(tenant) || !str(secret)) {
    return done("disabled", { why: "no enrollment is configured. Set enrollment.tenant and enrollment.secret in config.json (mint a secret on the hub: node bin/devices.mjs create-secret <tenant> --ttl-days 30, or the console's Agents page), or MATIC_ENROLLMENT_TENANT / MATIC_ENROLLMENT_SECRET for one run. Until then this endpoint is unauthenticated, which a loopback hub accepts and a LAN hub refuses (D283)" });
  }

  // One device key per userData, minted the first time and kept — a pending request must be
  // re-submitted under the SAME key for the administrator's approval to mint the credential.
  const deviceKeyId = s.deviceKeyId ?? newDeviceKeyId();
  if (!s.deviceKeyId) store.write({ deviceKeyId });
  const stamp = { lastAttemptAt: now().toISOString(), tenant: str(tenant), hubUrl: base };

  let res, body;
  try {
    res = await fetchImpl(`${base}/v1/enroll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ tenant: str(tenant), deviceKeyId, secret: str(secret), mode: "standalone" }),
    });
    body = await res.json().catch(() => ({}));
  } catch (err) {
    store.write({ ...stamp, lastOutcome: `unreachable: ${err?.message ?? err}` });
    return done("unreachable", { deviceKeyId, retry: true, why: `POST ${base}/v1/enroll did not answer (${err?.name === "TimeoutError" ? `no reply within ${timeoutMs} ms` : err?.message ?? err}); will try again` });
  }

  if (res.status === 429) {
    store.write({ ...stamp, lastOutcome: "locked" });
    return done("locked", { deviceKeyId, retry: true, why: `the hub is throttling enrollment for this tenant (${body?.error ?? "429"}); will try again` });
  }
  if (res.status === 403) {
    store.write({ ...stamp, lastOutcome: "refused" });
    return done("refused", { deviceKeyId, why: `${body?.error ?? "refused (403)"}. Check enrollment.tenant and enrollment.secret in config.json — an expired or revoked secret needs a new one from the hub. Not retried until the app restarts` });
  }
  if (res.status === 202 && body?.status === "pending") {
    store.write({ ...stamp, deviceId: body.deviceId ?? null, status: "pending", lastOutcome: "pending" });
    return done("pending", { deviceKeyId, deviceId: body.deviceId ?? null, retry: true, why: `queued for an administrator's approval on the hub's Agents page (${body.why ?? "auto-approve is off"}); will ask again` });
  }
  if (res.status === 200 && body?.status === "active") {
    if (str(body.credential)) {
      store.write({ ...stamp, deviceId: body.deviceId ?? null, credential: body.credential, status: "active", enrolledAt: now().toISOString(), lastOutcome: "active" });
      onLog(`[enroll] enrolled with ${base} as device ${body.deviceId ?? "?"} — the credential is kept in ${store.path} and presented on every request. It is ${body.identity ?? "a per-OS-user enrollment of the software, not a machine identity (D282)"}`);
      return done("active", { credential: body.credential, deviceId: body.deviceId ?? null, deviceKeyId });
    }
    store.write({ ...stamp, deviceId: body.deviceId ?? null, status: "active", lastOutcome: "held" });
    return done("held", { deviceKeyId, deviceId: body.deviceId ?? null, why: `${body.why ?? "the hub says this device is active but returned no credential"}. This endpoint has none: an administrator revokes device ${body.deviceId ?? deviceKeyId} in the console, ${store.path} is deleted, and the endpoint enrolls afresh at the next start` });
  }
  if (res.status === 200 && body?.status) {
    store.write({ ...stamp, deviceId: body.deviceId ?? null, status: body.status, lastOutcome: body.status });
    return done(body.status === "pending" ? "pending" : "held", { deviceKeyId, deviceId: body.deviceId ?? null, retry: body.status === "pending", why: `the hub reports this device as ${body.status}` });
  }
  store.write({ ...stamp, lastOutcome: `HTTP ${res.status}` });
  return done("unreachable", { deviceKeyId, retry: true, why: `POST ${base}/v1/enroll answered HTTP ${res.status}: ${body?.error ?? "no reason given"}; will try again` });
}
