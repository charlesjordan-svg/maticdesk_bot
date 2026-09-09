// @ts-check
/**
 * Credentials for the admin console: password hashing and TOTP. B2 (D155, D156).
 *
 * NO NEW DEPENDENCY. Both are in node:crypto — scrypt for passwords, HMAC-SHA1 for RFC 6238 —
 * and the handover's §5 argument ("every extra daemon is a pager", and a customer-hosted hub
 * must install by running the service) applies to an npm package as much as to a bundler. A
 * password-hashing library would also be the first dependency with a security surface of its own.
 *
 * Everything that compares a secret uses `timingSafeEqual`. Everything that generates one uses
 * `randomBytes`.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// ---- passwords ---------------------------------------------------------------------------------

/**
 * scrypt parameters. N=2^15, r=8, p=1 is the OWASP-cited minimum for scrypt and costs ~50 ms on
 * this machine (not measured formally; a login form does not need a performance number). The
 * parameters travel inside the stored string so they can be raised later without invalidating
 * anyone: a hash is verified with the parameters it was made with.
 */
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 };

/** @param {string} password @returns {string} `scrypt$N$r$p$saltB64$hashB64` */
export function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12) {
    throw new Error("password must be a string of at least 12 characters");
  }
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

/**
 * Constant-time verify. A malformed stored hash is `false`, not an exception: the login page must
 * not distinguish "no such user" from "bad password" from "corrupt row" by behaviour.
 *
 * @param {string} password
 * @param {string|null|undefined} stored
 */
export function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  if (!salt.length || !expected.length) return false;
  let actual;
  try {
    actual = scryptSync(password, salt, expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  } catch {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

// ---- base32 (RFC 4648), because every authenticator app speaks it --------------------------------

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** @param {Buffer} buf */
export function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** @param {string} s  case-insensitive, padding and spaces ignored @returns {Buffer} */
export function base32Decode(s) {
  const clean = s.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error(`not base32: ${JSON.stringify(ch)}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ---- TOTP, RFC 6238 over HOTP RFC 4226 ----------------------------------------------------------

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

/** A fresh 160-bit secret, the length RFC 4226 recommends for SHA-1. */
export function newTotpSecret() {
  return randomBytes(20);
}

/** @param {number|Date} [now] @returns {number} the current time step (RFC 6238 T) */
export function totpStep(now = Date.now()) {
  const ms = now instanceof Date ? now.getTime() : now;
  return Math.floor(ms / 1000 / TOTP_STEP_SECONDS);
}

/**
 * HOTP(secret, counter) truncated to TOTP_DIGITS. RFC 4226 §5.3.
 *
 * @param {Buffer} secret
 * @param {number} counter
 * @returns {string} zero-padded digits
 */
export function hotp(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", secret).update(msg).digest();
  const offset = mac[19] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/** The code for a moment in time. Used by tests and by `bin/admin.mjs totp` for a smoke check. */
export function totpCode(secret, now = Date.now()) {
  return hotp(secret, totpStep(now));
}

/**
 * Verify a code against the current step and one step either side (clock skew), REFUSING any step
 * at or below `lastStep` (replay, RFC 6238 §5.2). Returns the step that matched so the caller can
 * store it, or null.
 *
 * Constant-time on the digit comparison. The step search is not — there are three candidates and
 * which one matched is not a secret.
 *
 * @param {Buffer} secret
 * @param {string} code
 * @param {{ now?: number, lastStep?: number|null, window?: number }} [opts]
 * @returns {number|null}
 */
export function verifyTotp(secret, code, { now = Date.now(), lastStep = null, window = 1 } = {}) {
  if (typeof code !== "string") return null;
  const digits = code.replace(/\s/g, "");
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(digits)) return null;
  const centre = totpStep(now);
  const given = Buffer.from(digits);
  for (let d = -window; d <= window; d++) {
    const step = centre + d;
    if (lastStep !== null && lastStep !== undefined && step <= Number(lastStep)) continue;
    const expected = Buffer.from(hotp(secret, step));
    if (expected.length === given.length && timingSafeEqual(expected, given)) return step;
  }
  return null;
}

/**
 * The otpauth:// URI an authenticator app enrols from. Rendered as text (and as a QR by the app
 * if the operator pastes it into one); this build ships no QR encoder, and the console shows the
 * base32 secret alongside for manual entry.
 *
 * @param {{ secret: Buffer, email: string, issuer?: string }} p
 */
export function otpauthUri({ secret, email, issuer = "Matic Desk" }) {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret: base32Encode(secret),
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params}`;
}

// ---- random tokens -------------------------------------------------------------------------------

/** 256 bits, URL-safe. Session tokens and initial passwords. */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

/** Constant-time string equality for tokens of unknown provenance. */
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ba = Buffer.from(a), bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
