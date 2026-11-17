// @ts-check
/**
 * POST /v1/nuance/session-token - the hub mints a Nuance Live session token for an enrolled
 * endpoint. (2026-11-16; D298-D300, all PROPOSED;
 * docs/handovers/2026-11-16-claude-code-handover-nuance-live-persona.md §5.2.)
 *
 * ===============================================================================================
 * WHY THIS ROUTE EXISTS AT ALL
 * ===============================================================================================
 *
 * A live persona session is started with a short-lived token, and a token is minted with an API
 * key that can spend the whole organisation's credits. The client ships to the customer's machine,
 * so the key cannot be there. It is HERE, it goes upstream in one header, and it appears in no
 * response, no log line and no ledger row - `test/nuance.test.mjs` plants a canary in it and looks.
 *
 * Every credit this product spends is spent by a token this route minted. So this is also THE ONLY
 * PLACE SPEND CAN BE CONTROLLED: the caps below, the refusal to mint without a credential, and the
 * ledger are the whole of the cost control, and there is no second place to add one later.
 *
 * ===============================================================================================
 * THE CLIENT CHOOSES NOTHING
 * ===============================================================================================
 *
 * The body is `{}`. The persona, the prompt, `interface_setup` and the end-user id are the hub's,
 * and a body that names any of them is refused BY NAME (400) rather than ignored - the posture
 * /v1/ask takes on a client-supplied tenant, for the same reason: a field that is quietly ignored
 * today is the field somebody starts honouring tomorrow. A client that could send a prompt could
 * make Matic say anything in Matic's face; one that could send `interface_setup` could turn the
 * camera on.
 *
 *   persona     `mira`. Charles, 2026-11-16: "Use Mira for our Nuance avatar." A hub may be
 *               configured otherwise, to one of the three stock ids and nothing else.
 *   delegation  `client` (D299, PROPOSED). Nuance is a face, a voice and an ear; Matic's router
 *               stays the brain, and Nuance never sees a tool. Not ratified, and no turn latency
 *               has been measured under it or under the alternative.
 *   camera      OFF. Matic has no use for it, and it is one fewer conversation in a security review.
 *   end_call    on, so a goodbye can end the session and stop the clock. `stay_quiet` is left at
 *               the service default (on) by not being sent.
 *   expressiveness  NOT SENT. There is no measurement behind any value, so the service's own
 *               default stands until someone has looked at one.
 *
 * ===============================================================================================
 * end_user_id IS A HASH OF WHAT THE HUB VERIFIED, NOT OF WHAT THE CLIENT TYPED (D298, PROPOSED)
 * ===============================================================================================
 *
 * Nuance applies a policy curfew per `end_user_id`, and with none it applies to EVERY conversation
 * the organisation starts without one - so one abusive user at one customer could switch the
 * product off for the fleet. An id is therefore sent on every mint, always.
 *
 * The plan this route was built from proposed hashing the D215 profile identity. That identity is
 * SELF-ASSERTED - the OS username, typed by the client - and this repo already refuses to use it
 * as a scope key (D284, CLAUDE.md). An abusive user who can choose the string a curfew attaches to
 * can step out of the curfew, or into somebody else's. The enrollment is the only identity the hub
 * has verified (D282: one credential per OS user's install), so the id is a hash of the tenant and
 * the enrollment's own id. It says what the credential says and no more: an install, not a person.
 *
 * ===============================================================================================
 * THE PROMPT IS CONFIGURED, AND THERE IS NO DEFAULT ONE
 * ===============================================================================================
 *
 * The handover names a draft prompt in a document that was not on disk when this was written, and
 * CLAUDE.md forbids reconstructing a missing document. So this file contains no prompt. A hub with
 * no prompt answers 503 and says so; it does not mint with one invented here. Nuance reviews a
 * prompt on first mint and caps new setups per day, so "mint with a placeholder and fix it later"
 * is not free either.
 *
 * ===============================================================================================
 * WHAT IS NOT BUILT
 * ===============================================================================================
 *
 *   - THE LEDGER IS IN MEMORY (D300, PROPOSED). `MintLedger` lives in the hub process: a restart
 *     forgets the day's count and the audit trail with it. That is a real gap in "the only place
 *     spend can be controlled" and it is here on purpose rather than by oversight: the durable
 *     version is a control-plane table, a migration cannot be un-applied (CLAUDE.md), and
 *     PostgreSQL was not running on the day this was written, so one could not have been run
 *     before it was committed. The handler takes the ledger as a dependency so the table replaces
 *     it without this file changing.
 *   - THE CAP NUMBERS ARE PROPOSALS, not measurements. What a credit buys is not known.
 *   - Tenant facts in the prompt. `prompt` is one string; per-tenant assembly has nowhere to read
 *     tenant facts from yet, and every distinct prompt is a new setup for Nuance to review.
 *   - No call to Nuance has been made through this route. The stub in the test is the only
 *     upstream it has ever had.
 */
import { createHash } from "node:crypto";
import { readJson } from "../turn.js";

/** The three stock personas. Any other id is a 400 from Nuance; here it is a refusal to start. */
export const NUANCE_PERSONAS = Object.freeze(["sam", "sonia", "mira"]);
/** Charles, 2026-11-16. */
export const DEFAULT_PERSONA = "mira";
export const NUANCE_BASE_URL = "https://api.nuancelabs.ai";
/** Nuance's own bound on `personality.system_prompt`. */
export const PROMPT_MAX_CHARS = 64_000;

const deepFreeze = (o) => { for (const v of Object.values(o)) if (v && typeof v === "object") deepFreeze(v); return Object.freeze(o); };

/** Sent on every mint, exactly. Frozen all the way down; the test compares it byte for byte. */
export const INTERFACE_SETUP = deepFreeze({
  delegation: { type: "client" },
  video: { input: { camera: false } },
  runtime_tools: { end_call: true },
});

/**
 * How many tokens may be minted. PROPOSALS: nobody knows what a credit buys, so these are sized
 * to stop a loop, not to fit a budget. A refused or failed attempt does not count; only a mint does.
 */
export const DEFAULT_CAPS = Object.freeze({ perDevicePerHour: 6, perTenantPerDay: 40 });
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

export const NEEDS_CREDENTIAL_TO_MINT = "starting a live session needs the enrollment credential - Authorization: Bearer <credential>, issued once by POST /v1/enroll - on every listener, loopback included: without one there is no enrollment to count against a cap and nobody to attach the session to";

/** Every field a client might send to choose something that is the hub's to choose. */
const REFUSED_FIELDS = Object.freeze([
  "tenant", "tenantId", "tenantLabel",
  "personality", "system_prompt", "prompt", "instructions", "persona", "persona_id",
  "interface", "interface_setup", "delegation", "tools", "end_user_id", "expressiveness",
]);

/**
 * Shape check. Returns a problem sentence or null.
 * @param {any} body
 */
export function checkMintRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "body must be a JSON object, and an empty one is the whole request";
  for (const k of REFUSED_FIELDS) {
    if (body[k] !== undefined) {
      return `this hub does not accept "${k}" from the client. The persona, the prompt, the session's setup, the end-user id and the tenant are chosen server-side on every mint - a client that could send them could change what the assistant is, or whose session it is.`;
    }
  }
  return null;
}

/**
 * The id Nuance attaches a policy curfew to: a hash of the tenant and the ENROLLMENT, both taken
 * from the verified credential. Never the OS username (self-asserted, D215) - see the header.
 *
 * @param {import("../devices/enrollment.js").AuthenticatedDevice | null | undefined} device
 */
export function endUserIdFor(device) {
  if (!device?.id || !device?.tenantId) throw new Error("endUserIdFor() needs the authenticated device: an id hashed from nothing would be one id shared by everybody");
  return "md_" + createHash("sha256").update(`matic-desk/nuance-end-user/v1\n${device.tenantId}\n${device.id}`).digest("hex");
}

/**
 * Who minted, when, and how it went. IN MEMORY - see "what is not built". The method names are the
 * interface a table-backed ledger has to offer.
 */
export class MintLedger {
  constructor() { /** @type {Array<{ atMs: number, tenantId: string, tenantSchema: string, deviceId: string, endUserId: string, persona: string, outcome: string }>} */ this._rows = []; }
  /** @param {{ atMs: number, tenantId: string, tenantSchema: string, deviceId: string, endUserId: string, persona: string, outcome: string }} row */
  record(row) { this._rows.push({ ...row }); }
  /** Mints only - `outcome === "minted"` - at or after `sinceMs`, for a tenant and optionally one device. */
  mintsSince({ tenantId, deviceId = null, sinceMs }) {
    return this._rows.filter((r) => r.outcome === "minted" && r.tenantId === tenantId && r.atMs >= sinceMs && (deviceId === null || r.deviceId === deviceId));
  }
  countMints(q) { return this.mintsSince(q).length; }
  rows() { return this._rows.map((r) => ({ ...r })); }
}

/**
 * The handler.
 *
 * @param {{
 *   apiKey: string | null,
 *   prompt: string | null,
 *   persona?: string,
 *   caps?: { perDevicePerHour: number, perTenantPerDay: number },
 *   ledger?: MintLedger,
 *   fetchImpl?: typeof fetch,
 *   baseUrl?: string,
 *   log?: (s: string) => void,
 *   now?: () => number,
 * }} deps
 */
export function nuanceTokenHandler({ apiKey, prompt, persona = DEFAULT_PERSONA, caps = DEFAULT_CAPS, ledger = new MintLedger(), fetchImpl = fetch, baseUrl = NUANCE_BASE_URL, log = () => {}, now = Date.now }) {
  if (!NUANCE_PERSONAS.includes(persona)) {
    throw new Error(`the Nuance persona must be one of ${NUANCE_PERSONAS.join(", ")} - not "${persona}". There is no custom persona to configure.`);
  }
  const promptText = typeof prompt === "string" ? prompt.trim() : "";
  const promptProblem = !promptText ? "no persona prompt is configured on this hub (MATIC_NUANCE_PROMPT_FILE)"
    : promptText.length > PROMPT_MAX_CHARS ? `the configured persona prompt is ${promptText.length} characters and the service takes at most ${PROMPT_MAX_CHARS}`
    : null;

  /** @param {{ device?: import("../devices/enrollment.js").AuthenticatedDevice|null }} [ctx] */
  return async function handleNuanceToken(req, res, send, { device = null } = {}) {
    if (!device) return send(401, { ok: false, error: NEEDS_CREDENTIAL_TO_MINT });
    if (!apiKey) {
      return send(503, { ok: false, error: "live sessions are switched off on this hub: no MATIC_NUANCE_API_KEY is set in its environment. Nothing was minted. The assistant's built-in face and voice do not need this route." });
    }
    if (promptProblem) {
      return send(503, { ok: false, error: `live sessions are not ready on this hub: ${promptProblem}. Nothing was minted - the hub does not start a session with a prompt of its own invention.` });
    }
    const parsed = await readJson(req);
    if (parsed.error) return send(400, { ok: false, error: parsed.error });
    const problem = checkMintRequest(parsed.value);
    if (problem) return send(400, { ok: false, error: problem });

    const atMs = now();
    const endUserId = endUserIdFor(device);
    const row = (outcome) => ({ atMs, tenantId: device.tenantId, tenantSchema: device.tenantSchema, deviceId: device.id, endUserId, persona, outcome });
    const who = `enrollment ${device.id} (${device.tenantSlug})`;

    // ---- the caps. Checked before anything is sent anywhere.
    const overCap = (cap, limit, windowMs, deviceId) => {
      const mints = ledger.mintsSince({ tenantId: device.tenantId, deviceId, sinceMs: atMs - windowMs + 1 });
      if (mints.length < limit) return null;
      const oldest = Math.min(...mints.map((m) => m.atMs));
      return { cap, limit, retryAfterMs: Math.max(1, oldest + windowMs - atMs) };
    };
    const over = overCap("perDevicePerHour", caps.perDevicePerHour, HOUR_MS, device.id) ?? overCap("perTenantPerDay", caps.perTenantPerDay, DAY_MS, null);
    if (over) {
      ledger.record(row(`refused:cap:${over.cap}`));
      log(`[nuance] refused a mint for ${who}: ${over.cap} is ${over.limit} and it is spent; next in ${Math.ceil(over.retryAfterMs / 1000)} s. Nothing was sent upstream.`);
      return send(429, {
        ok: false, cap: over.cap, retryAfterMs: over.retryAfterMs,
        error: over.cap === "perDevicePerHour"
          ? "this install has started as many live sessions as it may in an hour. Nothing was minted."
          : "this organisation has started as many live sessions as it may in a day. Nothing was minted.",
      });
    }

    // ---- upstream. The key is in this one header and nowhere else.
    let status = 0, body = null;
    try {
      const r = await fetchImpl(`${baseUrl}/session-tokens`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          interface: "nuance_live",
          personality: { system_prompt: promptText, persona_id: persona },
          end_user_id: endUserId,
          interface_setup: INTERFACE_SETUP,
        }),
      });
      status = r.status;
      try { body = await r.json(); } catch { body = null; }
    } catch (err) {
      ledger.record(row("failed:unreachable"));
      log(`[nuance] could not reach the service to mint for ${who}: ${err.message}`);
      return send(502, { ok: false, code: "unreachable", error: "the live-session service could not be reached. Nothing was minted." });
    }

    if (status === 201 && typeof body?.token === "string" && body.token) {
      ledger.record(row("minted"));
      const warnings = Array.isArray(body.warnings) ? body.warnings.map(String) : [];
      // The token is NOT logged: for a minute it is a bearer credential for a session.
      log(`[nuance] minted a session token for ${who}, persona ${persona}${warnings.length ? `; the service warned: ${warnings.join(" | ")}` : ""}`);
      return send(201, {
        ok: true,
        token: body.token,
        expiresAt: body.expires_at ?? null,
        warnings,
        // What the hub fixed, so the client can show and record it without guessing.
        persona, delegation: INTERFACE_SETUP.delegation.type, camera: INTERFACE_SETUP.video.input.camera,
      });
    }

    // ---- the service said no. Its code is carried; its prose stays in this hub's log.
    const code = (typeof body?.error?.code === "string" && body.error.code) || (typeof body?.code === "string" && body.code) || null;
    const retrySeconds = Number(body?.retry_after_seconds ?? body?.error?.retry_after_seconds);
    ledger.record(row(`failed:${status}${code ? `:${code}` : ""}`));
    log(`[nuance] the service refused a mint for ${who}: HTTP ${status}${code ? ` ${code}` : ""} - ${JSON.stringify(body ?? null).slice(0, 600)}`);
    if (status === 429) {
      return send(429, {
        ok: false, code,
        ...(Number.isFinite(retrySeconds) && retrySeconds > 0 ? { retryAfterMs: Math.round(retrySeconds * 1000) } : {}),
        ...(typeof body?.renews_at === "string" ? { renewsAt: body.renews_at } : {}),
        error: "the live-session service is not starting sessions for this organisation right now. Nothing was minted.",
      });
    }
    return send(502, { ok: false, code, error: "the live-session service did not issue a session. Nothing was minted; the hub's log has the service's own answer." });
  };
}
