// @ts-check
/**
 * POST /v1/enroll — a device asks to join a tenant. B3.
 *
 * ===============================================================================================
 * WHY A TENANT IN THE REQUEST BODY IS ACCEPTED HERE, WHEN /v1/ask AND /v1/ticket REFUSE ONE
 * ===============================================================================================
 *
 * CLAUDE.md's rule against a client naming its own tenant is about an UNAUTHENTICATED claim: with
 * no device auth, any string in the body would become the tenancy model by default, which is worse
 * than none. This route is different in the one way that matters — **the claim is authenticated by
 * the enrollment secret**, per tenant (D81: "the enrollment secret is the security boundary"). A
 * device does not get to say "I am tenant X" and be believed; it has to also produce the secret
 * that tenant issued, which nobody outside that tenant has (D82: delivered as install-time
 * configuration, not baked into the installer). That is the whole mechanism enrollment IS — the
 * secret is what turns an unauthenticated claim into a checked one, which is exactly what /v1/ask's
 * refusal is protecting against the ABSENCE of.
 *
 * ===============================================================================================
 * WHAT SUCCEEDS AND WHAT DOESN'T, AND WHY THE FAILURE MESSAGES MATCH
 * ===============================================================================================
 *
 * An unknown tenant slug and a wrong secret return the SAME 403 with the SAME message. Telling them
 * apart would let a caller enumerate real tenant slugs by comparing error text — a small thing on a
 * loopback-only, pre-review hub, and cheap to close, so it is closed rather than left as a footnote.
 *
 * See src/devices/enrollment.js for the state machine, the rate limiting and the anomaly fallback
 * (D83) this route is a thin HTTP wrapper over, and server/docs/B3-DEVICE-ENROLLMENT.md for what
 * this pass built against D60-D83a and what it deliberately left for the next one.
 */
import { readJson } from "../turn.js";
import { tenantBySlug } from "../db/tenants.js";
import { submitEnrollment } from "./enrollment.js";

/** Shape check. Request validation, not enrollment validation. */
export function checkEnrollRequest(body) {
  if (!body || typeof body !== "object") return "body must be a JSON object";
  if (typeof body.tenant !== "string" || !body.tenant.trim()) return "tenant must be a non-empty string (the tenant's slug)";
  if (typeof body.deviceKeyId !== "string" || !body.deviceKeyId.trim()) return "deviceKeyId must be a non-empty string";
  if (typeof body.secret !== "string" || !body.secret.trim()) return "secret must be a non-empty string";
  if (body.mode !== undefined && body.mode !== "standalone" && body.mode !== "joined") {
    return 'mode, when present, must be "standalone" or "joined"';
  }
  return null;
}

const REFUSED = { ok: false, error: "enrollment refused: unknown tenant, or the secret is wrong, expired or revoked" };

/**
 * @param {{ log?: (s: string) => void }} [deps]
 */
export function enrollHandler({ log = () => {} } = {}) {
  return async function handleEnroll(req, res, send) {
    const parsed = await readJson(req);
    if (parsed.error) return send(400, { ok: false, error: parsed.error });
    const problem = checkEnrollRequest(parsed.value);
    if (problem) return send(400, { ok: false, error: problem });
    const { tenant: slug, deviceKeyId, secret, mode } = parsed.value;

    const tenant = await tenantBySlug(String(slug).trim());
    if (!tenant || tenant.status !== "active") {
      log(`[enroll] refused: tenant "${slug}" is unknown or not active`);
      return send(403, REFUSED);
    }

    const result = await submitEnrollment({ tenantId: tenant.id, deviceKeyId, secret, mode, log });
    switch (result.outcome) {
      case "locked":
        return send(429, {
          ok: false,
          error: "too many enrollment attempts for this tenant recently; try again shortly",
          retryAfterMs: result.retryAfterMs,
        });
      case "refused":
        return send(403, REFUSED);
      case "already":
        return send(200, { ok: true, status: result.status, deviceId: result.deviceId });
      case "approved":
        return send(200, { ok: true, status: "active", deviceId: result.deviceId, requestId: result.requestId });
      case "queued":
        return send(202, {
          ok: true, status: "pending", deviceId: result.deviceId, requestId: result.requestId,
          why: result.why ?? "awaiting admin approval",
        });
      default:
        return send(500, { ok: false, error: "unreachable enrollment outcome" });
    }
  };
}
