// @ts-check
/**
 * THE DEVELOPMENT TOTP BYPASS (D267). IT WEAKENS AUTHENTICATION ON PURPOSE AND IT CANNOT SHIP.
 *
 * Founder-authorised 2026-09-12, after the lockout that produced D266 and while the console is
 * being changed often enough that a six-digit code per sign-in is the slowest part of the loop.
 *
 * WHAT IT SKIPS, AND THE ONE THING IT NEVER SKIPS. It skips the authenticator code. It NEVER skips
 * the password, and the code path is arranged so that it cannot: the bypass is consulted at exactly
 * one point, after `passwordOk` has already decided, so there is no ordering a later edit could
 * choose that would let it stand in for the password. A bypass that skipped the password too would
 * make the console reachable by anything running as this user, which is a different proposition
 * from skipping a second factor on a loopback dev box.
 *
 * WHY IT IS DEFENSIBLE HERE. The hub binds loopback, refuses every non-local peer, advertises
 * `auth: none` on its own index, and the data is placeholder. TOTP there is protecting placeholder
 * data from an attacker who would already have to be on the machine — and who could, being on the
 * machine, run `bin/admin.mjs reset` and take the account outright.
 *
 * WHY IT IS DANGEROUS. None of that is true of a shipped build, and a bypass that survives into one
 * is a security incident rather than a bug. Hence the guards, and hence the name.
 *
 * ABOUT GUARD 2, HONESTLY. The handover called "refused unless the listener is loopback-bound" the
 * only thing standing between this and a real problem. As first specified it would have been a
 * check that cannot fail: `src/index.js` calls `server.listen(port, "127.0.0.1")` with a literal and
 * no override, so nothing can bind elsewhere and the guard could never fire. It is written here to
 * read the address the socket is ACTUALLY bound to, at sign-in time, rather than to assert what the
 * bind is — so it is correct by construction instead of by assumption, and it starts protecting the
 * day someone adds a host option without that person having to remember this file exists. A test
 * binds a server to 0.0.0.0 and proves the refusal fires, which is the part that was untestable
 * before. What is still true, and is the honest limit: in the shipped configuration the guard
 * cannot fire, because nothing can bind off loopback. It is the other five guards that are load
 * bearing today.
 */

/** The variable's name is a guard in itself: nobody sets this by accident or explains it in review. */
export const BYPASS_ENV = "MATIC_ADMIN_INSECURE_NO_TOTP";

/**
 * Its own audit class, so it is greppable and `bin/admin.mjs audit` shows it plainly
 * (migration control/006 widens the CHECK constraint for it).
 */
export const BYPASS_EVENT_CLASS = "insecure-dev-bypass";

/** The same set `src/index.js` uses for the per-request peer refusal. A bound address, not a peer. */
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1", "::ffff:127.0.0.1".toLowerCase()]);

/**
 * @typedef {object} BypassStatus
 * @property {boolean} on          the code may be skipped RIGHT NOW
 * @property {boolean} requested   the variable is set, whatever the verdict
 * @property {boolean} refused     requested and denied — the loudest state, and never silent
 * @property {string|null} boundAddress
 * @property {string} reason       one sentence, for a banner, a log line and /v1/health alike
 */

/**
 * The single verdict. Every surface that mentions the bypass calls this, so a banner, the index
 * page, the health route, the audit row and the login decision cannot describe it differently.
 *
 * @param {{ env?: Record<string, string|undefined>, boundAddress?: string|null }} [p]
 * @returns {BypassStatus}
 */
export function bypassStatus({ env = process.env, boundAddress = null } = {}) {
  const requested = env[BYPASS_ENV] === "1";
  const base = { requested, boundAddress };

  if (!requested) {
    return { ...base, on: false, refused: false, reason: `off — ${BYPASS_ENV} is not set to 1` };
  }
  // Unknown is refused, not assumed. This is reachable before `listen` has resolved an address, and
  // "we could not tell" must never be the branch that grants something.
  if (boundAddress === null || boundAddress === undefined) {
    return { ...base, on: false, refused: true, boundAddress: null,
      reason: `${BYPASS_ENV} is set and REFUSED: the listener's bound address could not be read, and an unknown binding is not a loopback one` };
  }
  if (!LOOPBACK.has(String(boundAddress).toLowerCase())) {
    return { ...base, on: false, refused: true,
      reason: `${BYPASS_ENV} is set and REFUSED: the listener is bound to ${boundAddress}, which is not loopback. The authenticator code is still required.` };
  }
  return { ...base, on: true, refused: false,
    reason: `${BYPASS_ENV}=1 on a loopback listener: THE AUTHENTICATOR CODE IS NOT REQUIRED. The password still is. Development only — this must not be set on a shipped build.` };
}

/**
 * The startup banner's content lines (D267 guard 3).
 *
 * HERE RATHER THAN INLINE IN src/index.js SO THAT A TEST CAN MEASURE THEM. `banner()` pads to
 * BANNER_WIDTH and does not truncate, so a line over the limit overflows the box — the cosmetic
 * defect that came back three times and is the reason `banner()` exists at all. Written inline,
 * these lines were invisible to `turn.test.mjs`'s width assertion, because this banner is only
 * drawn when the variable is set and no test run sets it. One of them was 87 characters and it
 * reached a real terminal.
 *
 * @returns {string[]}
 */
export function bypassStartupBanner() {
  return [
    "ADMIN CONSOLE: THE AUTHENTICATOR CODE IS NOT REQUIRED. PASSWORD ONLY.",
    `${BYPASS_ENV}=1 on a loopback listener, so the`,
    "second factor is disabled for /admin. The password is still required.",
    "Every sign-in that uses it is audited as 'insecure-dev-bypass'.",
    "DEVELOPMENT ONLY - unset the variable before anyone demonstrates,",
    "deploys or reviews this build.",
  ];
}

/** The line the startup banner, the console banner and preflight all show. */
export function bypassBannerLine(status) {
  if (status.on) return "INSECURE: the authenticator code is NOT required on this hub. Password only. Development only.";
  if (status.refused) return `INSECURE MODE REFUSED: ${status.reason}`;
  return null;
}
