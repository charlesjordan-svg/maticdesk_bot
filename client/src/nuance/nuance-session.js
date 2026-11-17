// @ts-check
/**
 * Opening a live persona conversation. MAIN PROCESS. (D307, PROPOSED, 2026-11-17.)
 *
 * The order is Nuance's (docs.nuancelabs.ai/connect, read 2026-11-17):
 *
 *   1. the HUB mints a session token   - `mint()`, which is HubClient.mintNuanceToken(). The API
 *                                        key is on the hub and nowhere in this file or this client.
 *   2. POST /conversation              - with that token as the bearer. The token is spent.
 *   3. GET  /conversation/:id/events   - followed until `admitted`, which carries the room to join.
 *
 * The room itself is joined by the RENDERER, because that is where a `<video>` element and a
 * microphone are. This file hands it a URL and a room token and holds no media.
 *
 * EVERY FAILURE IS A REASON TO CARRY ON LOCALLY, NEVER A THROW. Decision C (register D301): when
 * the persona cannot be had - the hub refused, the service has no capacity, this organisation's one
 * session is in use, the network is gone - the assistant is the v7 avatar and Piper, exactly as it
 * was. So this returns `{ ok: false, degrade: true, stage, reason }` and the caller's whole job on
 * that branch is to do nothing new. `reason` is for the developer log; no user is shown it.
 *
 * A conversation that was started and then not admitted is ENDED before this returns: it would
 * otherwise sit there until the service's own timeout, and wall-clock is what is billed.
 *
 * max_session_seconds IS ALWAYS SENT. It bounds a forgotten window. The value is the caller's
 * (config.json), and it is a cap of ours - not a claim about what a session costs, which is not known.
 */

export const NUANCE_API = "https://api.nuancelabs.ai";

const bearer = (token) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
const fail = (stage, reason, extra = {}) => ({ ok: /** @type {const} */ (false), degrade: /** @type {const} */ (true), stage, reason, ...extra });
const codeOf = (body) => (typeof body?.error?.code === "string" && body.error.code) || (typeof body?.code === "string" && body.code) || null;

/**
 * End a conversation by id. Never throws.
 * @param {{ conversationId: string, token: string, fetchImpl?: typeof fetch, baseUrl?: string }} p
 */
export async function endConversation({ conversationId, token, fetchImpl = fetch, baseUrl = NUANCE_API }) {
  try {
    const r = await fetchImpl(`${baseUrl}/conversation/${encodeURIComponent(conversationId)}/end`, { method: "POST", headers: bearer(token), body: "{}" });
    return { ok: r.status >= 200 && r.status < 300, status: r.status };
  } catch (err) {
    return { ok: false, status: 0, detail: err.message };
  }
}

/**
 * @param {{
 *   mint: () => Promise<any>,
 *   maxSessionSeconds: number,
 *   fetchImpl?: typeof fetch,
 *   baseUrl?: string,
 *   admitTimeoutMs?: number,
 *   pollGapMs?: number,
 *   now?: () => number,
 *   sleep?: (ms: number) => Promise<void>,
 *   log?: (s: string) => void,
 * }} deps
 */
export async function openConversation({
  mint, maxSessionSeconds, fetchImpl = fetch, baseUrl = NUANCE_API, admitTimeoutMs = 75_000, pollGapMs = 500,
  now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {},
}) {
  // ---- 1. the hub mints.
  let minted;
  try { minted = await mint(); }
  catch (err) { log(`[persona] the hub could not be asked for a session: ${err.message}`); return fail("mint", "unreachable"); }
  if (!minted?.ok || typeof minted.token !== "string" || !minted.token) {
    const reason = minted?.cap || minted?.code || (minted?.reason === "unreachable" ? "unreachable" : "unavailable");
    log(`[persona] no session token from the hub (${reason}${minted?.status ? `, HTTP ${minted.status}` : ""}) - staying with the local face and voice`);
    return fail("mint", reason, minted?.retryAfterMs ? { retryAfterMs: minted.retryAfterMs } : {});
  }
  const token = minted.token;

  // ---- 2. start the conversation.
  let conversationId;
  try {
    const r = await fetchImpl(`${baseUrl}/conversation`, { method: "POST", headers: bearer(token), body: JSON.stringify({ max_session_seconds: maxSessionSeconds }) });
    let body = null;
    try { body = await r.json(); } catch { /* no body */ }
    if (r.status !== 201 && r.status !== 200) {
      const reason = codeOf(body) ?? `http-${r.status}`;
      const retry = Number(body?.retry_after_seconds ?? body?.error?.retry_after_seconds);
      log(`[persona] the service did not start a conversation: HTTP ${r.status} ${reason}`);
      return fail("conversation", reason, Number.isFinite(retry) && retry > 0 ? { retryAfterMs: Math.round(retry * 1000) } : {});
    }
    if (typeof body?.id !== "string" || !body.id) return fail("conversation", "unavailable");
    conversationId = body.id;
  } catch (err) {
    log(`[persona] the service could not be reached to start a conversation: ${err.message}`);
    return fail("conversation", "unreachable");
  }

  // ---- 3. follow its events until it is admitted to a room.
  const startedAt = now();
  let after = 0;
  const giveUp = async (reason) => {
    await endConversation({ conversationId, token, fetchImpl, baseUrl });
    log(`[persona] conversation ${conversationId} was not admitted (${reason}); it has been ended`);
    return fail("admit", reason);
  };
  while (now() - startedAt < admitTimeoutMs) {
    let events = [];
    try {
      const r = await fetchImpl(`${baseUrl}/conversation/${encodeURIComponent(conversationId)}/events?after=${after}`, { method: "GET", headers: bearer(token) });
      const body = await r.json();
      events = Array.isArray(body?.events) ? body.events : [];
    } catch (err) {
      return giveUp("unreachable");
    }
    for (const e of events) {
      // The cursor is the event's own sequence when it carries one, and a count when it does not.
      after = Number.isFinite(Number(e?.seq)) ? Number(e.seq) : Number.isFinite(Number(e?.event_id)) ? Number(e.event_id) : after + 1;
      if (e?.type === "admitted") {
        if (typeof e.livekit_url !== "string" || typeof e.token !== "string" || !e.livekit_url || !e.token) return giveUp("unavailable");
        let host = null;
        try { host = new URL(e.livekit_url).host; } catch { /* keep null */ }
        log(`[persona] conversation ${conversationId} admitted after ${Math.round((now() - startedAt) / 1000)} s; persona ${minted.persona ?? "?"}, room host ${host ?? "?"}`);
        return { ok: /** @type {const} */ (true), conversationId, sessionToken: token, livekitUrl: e.livekit_url, roomToken: e.token, persona: minted.persona ?? null, host, after };
      }
      if (e?.type === "ended") return giveUp(`ended:${e.reason ?? "unknown"}`);
    }
    await sleep(pollGapMs);
  }
  return giveUp("timeout");
}
