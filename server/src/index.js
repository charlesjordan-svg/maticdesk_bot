// @ts-check
/**
 * The Matic Desk hub - B0 walking skeleton (2026-09-03). Spec summary: handover Task 2.
 *
 * One Node HTTP service. One route, POST /v1/turn (src/turn.js). One provider, OpenAI-compatible,
 * pointed at local Ollama (src/providers/). Same runtime as the client - one toolchain.
 *
 * AUTHENTICATION SINCE 2026-09-12 (D282, D283) - AND WHAT IT STILL IS NOT.
 *   - Until then: 127.0.0.1 with a literal, every non-loopback peer refused, `x-matic-hub-auth:
 *     none` on every response, and `authenticate()` a slot that authenticated nobody and said so.
 *     D271 was answered that day (development on one machine; production on the customer's
 *     LAN/WAN), and P3b filled the slot with the WEAKER credential on D61's path: an enrollment
 *     credential (src/devices/enrollment.js, control/008), presented as `Authorization: Bearer mdc_…`.
 *   - `authenticate()` checks a credential WHENEVER one is presented - a bad one is a 401 on any
 *     listener - and the response is stamped `x-matic-hub-auth: device-credential`. Whether one is
 *     REQUIRED is the listener's decision (`credentialRequired`, D283): off loopback, every /v1 route
 *     but /v1/enroll and /v1/health needs one; on a loopback listener it is optional, because the
 *     only caller shares the machine with the database (the P3a/P3b handover's same-machine row).
 *     GET /v1/tickets needs one on every listener: with none there is no requester to scope to.
 *   - The LAN listener exists ONLY over TLS: `MATIC_HUB_BIND` off loopback without
 *     MATIC_HUB_TLS_CERT/KEY refuses to start (`listenPlanFromEnv`), and a plaintext connection
 *     from a non-loopback peer is refused in the handler too (`admitPeer`). The console is reachable
 *     from the LAN as well - the founder's choice, 2026-09-12 - and its cookie is Secure there
 *     because the socket is TLS (src/admin/session.js).
 *   - STILL NOT BUILT: D60's TPM-backed key, D61's signed assertion and token exchange, D63/D64's
 *     custody. A credential proves a per-OS-user enrollment of the software - not a machine, not a
 *     person - and every surface that hands one out says so (src/devices/route.js IDENTITY_NOTE).
 *
 * OUT OF SCOPE AND VISIBLY SO: tenancy on /v1/ask (the generic KB is cross-tenant, D45), audit
 * ingestion, spend caps. None of them have a stub here that could be mistaken for a start. TLS left
 * this list on 2026-09-12. Tenancy on /v1/ticket and /v1/session left it the same day for an
 * AUTHENTICATED call, whose tenant is the credential's device row (D284): MATIC_TICKET_TENANT now
 * names the tenant for UNauthenticated loopback calls only.
 *
 * ---------------------------------------------------------------------------------------------
 * B3 ADDED A THIRD ROUTE: POST /v1/enroll (2026-09-10). Device ENROLLMENT — a pending queue, a
 * rotatable time-boxed secret, auto-approve with a per-tenant toggle, rate limiting with a fallback
 * to queued approval, bulk revocation (src/devices/enrollment.js). It does NOT make `authenticate()`
 * below do anything: no route checks a device's signature or a token yet, because that is D61's
 * exchange, a layer over enrollment rather than enrollment itself, and it depends on custody
 * machinery (D60/D64's TPM-backed key in broker custody, reached over the named-pipe transport)
 * that is designed and not built (D200/D201). `server/docs/B3-DEVICE-ENROLLMENT.md` is the record
 * of exactly that cut. So: a device can now become KNOWN to a tenant. Nothing yet checks that a
 * request claiming to be a known device actually is one.
 * ---------------------------------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------------------------------
 * B7a ADDED A SECOND ROUTE, AND THE FIRST ONE DID NOT CHANGE (2026-09-04).
 *
 *   POST /v1/turn   STATELESS. Proposes a machine change. Reaches no database, and
 *                   test/db-static.test.mjs still enforces that. Untouched by B7a.
 *   POST /v1/ask    STATEFUL. Answers a question from the knowledge base: retrieve, assemble, call,
 *                   return (D53). Reaches the control plane. src/kb/ask.js says why this is a
 *                   route rather than a flag on /v1/turn (D206) — briefly, the spec asked for both
 *                   "add a database to /v1/turn" and "keep a stateless path", and a separate route
 *                   is the form of the second that a later edit cannot quietly undo.
 *
 * So "persistence" and "KB retrieval" have left the out-of-scope list above. **Tenancy has not.**
 * There is still no tenant here — only MATIC_KB_TENANT_LABEL, a server-side label that is not a
 * foreign key and that /v1/ask REFUSES to accept from a client.
 * ---------------------------------------------------------------------------------------------
 *
 * Configuration (environment; there is no config file yet):
 *   MATIC_HUB_PORT      default 8787
 *   MATIC_HUB_BIND      default 127.0.0.1. Anything else is a LAN listener and REQUIRES the two
 *                       below (D283); the hub refuses to start otherwise, with a banner saying why.
 *   MATIC_HUB_TLS_CERT  path to a PEM certificate (with its chain), for a LAN listener.
 *   MATIC_HUB_TLS_KEY   path to its PEM private key. Read once at start; never logged.
 *   MATIC_HUB_UPSTREAM  default http://127.0.0.1:11434/v1   (Ollama's OpenAI-compatible base)
 *   MATIC_HUB_MODEL     default mistral-small:24b           (the customer-hosted pick, D139)
 *   MATIC_HUB_TIMEOUT_MS default 300000
 *   MATIC_EMBED_PROVIDER "ollama" | "none"                  (src/kb/embed.js; "none" = lexical only)
 *   MATIC_EMBED_MODEL   default snowflake-arctic-embed2:568m
 *   MATIC_KB_TENANT_LABEL a development label for retrieval logs. NOT a tenant. NOT authenticated.
 *   MATIC_KB_LOG_QUERIES "1" to store the user's sentence in the retrieval log. Default OFF in the
 *                       code; the demo launcher sets it (D227, once D229 was ratified 2026-09-09).
 *   MATIC_KB_QUESTION_RETENTION_DAYS how long a logged question's text is kept before it is cleared
 *                       (D229). Default and MAXIMUM 90; lower is allowed, higher is held at 90;
 *                       0 logs no text at all. The sweep runs inside every log write.
 *   MATIC_JOBS_POLL_MS  how often this process polls control.job_queue (D270, src/jobs/runner.js).
 *                       Default 5000; floor 250; 0 runs no jobs at all (they stay queued). The
 *                       runner starts inside the listen callback and never decides whether the hub
 *                       starts: with PostgreSQL down it logs once and keeps polling.
 */
import http from "node:http";
import https from "node:https";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { OpenAICompatibleProvider } from "./providers/openai-compatible-provider.js";
import { turnHandler } from "./turn.js";
import { askHandler } from "./kb/ask.js";
import { corpusStatus } from "./kb/ingest.js";
import { embeddingProviderFromEnv, EMBEDDING_DIM } from "./kb/embed.js";
import { ticketHandler, resolveTicketTenant } from "./tickets/file.js";
import { sessionHandler } from "./sessions/route.js";
import { retrievalHealthReader } from "./kb/health.js";
import { enrollHandler, IDENTITY_NOTE } from "./devices/route.js";
import { authenticateDeviceCredential } from "./devices/enrollment.js";
import { ticketsReadHandler } from "./tickets/read.js";
import { requesterActionHandler, ACTION_PATH, ACK_PATH } from "./tickets/requester-routes.js";
import { questionLoggingEnabled, questionRetentionDays, QUESTION_RETENTION_MAX_DAYS } from "./kb/retrieve.js";
import { adminHandler } from "./admin/router.js";
import { bypassStartupBanner, bypassStatus } from "./admin/dev-bypass.js";
import { createJobRunner, pollIntervalFromEnv } from "./jobs/runner.js";
import { JOB_HANDLERS } from "./jobs/handlers.js";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * Every banner box in this file is this wide.
 *
 * THIS EXISTS BECAUSE HAND-PADDING FAILED THREE TIMES. The startup banners were drawn with
 * hand-counted runs of trailing spaces, and on 2026-09-04 the founder ran the hub and the right-hand
 * border was visibly ragged: SEVEN of sixteen banner lines were 81 or 82 characters against an
 * 80-character border. One of them had been wrong since B0; six were added with B7a; and the
 * EADDRINUSE box added an hour earlier was wrong the same way, for the same reason.
 *
 * It is a cosmetic bug three times over, and that is the point — it kept coming back because the
 * mechanism invited it. `banner()` computes the padding, and `test/turn.test.mjs` asserts that
 * every line the real banners produce is exactly this wide, so a fourth instance fails a test
 * instead of reaching a screen.
 */
export const BANNER_WIDTH = 80;

/**
 * Draw a boxed banner. Returns the lines rather than printing them, so they can be measured.
 *
 * A line longer than the box is NOT silently truncated — truncating would hide the warning text
 * that is the whole reason these boxes exist. It overflows, and the test catches it.
 *
 * @param {string[]} lines  content lines, without the border or the leading "#  "
 * @returns {string[]}
 */
export function banner(lines) {
  const bar = "#".repeat(BANNER_WIDTH);
  return [bar, ...lines.map((l) => "#  " + l.padEnd(BANNER_WIDTH - 4) + "#"), bar];
}

/** True when the peer is this machine. Defence in depth behind the 127.0.0.1 bind. */
export function isLoopback(remoteAddress) {
  return typeof remoteAddress === "string" && LOOPBACK.has(remoteAddress);
}

/** The routes a caller may reach with NO credential on a LAN listener: how a device gets one, and whether the hub is up. */
const PUBLIC_ON_LAN = new Set(["/v1/enroll", "/v1/health"]);

/**
 * The peer gate (D283). Pure, so test/bind.test.mjs drives every branch without a socket.
 *
 *   - bound unknown (before listen resolves, or unreadable): non-loopback peers refused. Unknown is
 *     never the permissive branch (D267's rule, again).
 *   - loopback listener: non-loopback peers refused — B0's rule, unchanged since 2026-09-03.
 *   - LAN listener: a non-loopback peer is admitted ONLY over TLS. The entry point refuses to start
 *     a plaintext LAN listener (listenPlanFromEnv); this is the same rule enforced per request, so a
 *     caller that builds the server another way still cannot serve credentials in the clear.
 *
 * @param {{ bound: string|null|undefined, peer: string|undefined, peerLoopback: boolean, encrypted: boolean }} p
 * @returns {{ allow: true } | { allow: false, status: 403, error: string }}
 */
export function admitPeer({ bound, peer, peerLoopback, encrypted }) {
  if (peerLoopback) return { allow: true };
  if (bound === null || bound === undefined) return { allow: false, status: 403, error: "the hub could not read its own bound address and refuses non-loopback peers until it can" };
  if (isLoopback(bound)) return { allow: false, status: 403, error: "the B0 hub accepts loopback connections only" };
  if (!encrypted) return { allow: false, status: 403, error: `this hub is bound to ${bound}, off loopback, and serves the network over TLS only (D283); a plaintext connection from ${peer} is refused` };
  return { allow: true };
}

/**
 * Whether THIS listener requires a credential on THIS path (D283). Loopback listener: never — the
 * only caller shares the machine with the database, which is the handover's same-machine row and
 * the development shape. LAN listener: every /v1 route but the two a device needs before it has a
 * credential. The console (/admin) has its own sign-in; GET / is discovery. An unknown bound
 * address requires one.
 *
 * @param {{ bound: string|null|undefined, pathname: string }} p
 */
export function credentialRequired({ bound, pathname }) {
  if (!pathname.startsWith("/v1/")) return false;
  if (PUBLIC_ON_LAN.has(pathname)) return false;
  if (bound === null || bound === undefined) return true;
  return !isLoopback(bound);
}

/**
 * What this listener requires, in words — for /v1/health, GET / and anyone reading either. ONE
 * function, so the two cannot disagree (the shape adminAuthReport() set for the bypass).
 * @param {string|null|undefined} bound
 */
export function authPolicy(bound) {
  const lan = bound !== null && bound !== undefined && !isLoopback(bound);
  return lan
    ? `required - this hub is bound to ${bound}, off loopback: every /v1 route but /v1/enroll and /v1/health needs an enrollment credential (Authorization: Bearer <credential>, D282/D283), and the tenant comes from the credential (D284). D60/D61/D63/D64 are NOT built: a credential proves a per-OS-user enrollment of the software, not a machine or a person`
    : "optional - loopback listener: an enrollment credential (D282) is checked whenever one is presented and refused when bad, but an unauthenticated call from this machine is accepted and its tenant is MATIC_TICKET_TENANT. GET /v1/tickets needs a credential on every listener: without one there is no requester to scope the read to";
}

/**
 * The startup banner's content lines for this listener (D283). Exported so test/bind.test.mjs can
 * measure them against BANNER_WIDTH — the padding defect's fifth instance, denied in advance. The
 * bind goes on its own line because an IPv6 address with a zone is 45 characters.
 * @param {{ bind: string, port: number, tls: boolean }} p
 */
export function listenerBanner({ bind, port, tls }) {
  if (isLoopback(bind)) {
    return [
      "MATIC DESK HUB - LOOPBACK LISTENER. Enrollment credentials (D282) are",
      "checked when presented and OPTIONAL from this machine; an unauthenticated",
      "call's tenant is MATIC_TICKET_TENANT. Do not expose this listener: a LAN",
      "listener needs MATIC_HUB_BIND + MATIC_HUB_TLS_CERT/KEY and REQUIRES them.",
    ];
  }
  return [
    `MATIC DESK HUB - LAN LISTENER over ${tls ? "TLS" : "PLAINTEXT (!!)"} (D283) on:`,
    `  ${bind}:${port}`,
    "Every /v1 route but /v1/enroll and /v1/health REQUIRES an enrollment",
    "credential, and the tenant comes from it (D284). The console is on the",
    "network too; its cookie is Secure. D60/D61/D63/D64 are NOT built.",
  ];
}

/** Word-wrap a sentence into banner content lines. */
export function wrap(text, width) {
  const out = [];
  let line = "";
  for (const word of String(text).split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) { out.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

/**
 * How the entry point will listen, from the environment (D283): the bind, the TLS material, or a
 * REFUSAL to start. Pure — `read` is injected so a test can drive it without files.
 *
 *   MATIC_HUB_BIND       default 127.0.0.1. Anything the LOOPBACK set does not name — 0.0.0.0, a LAN
 *                        address, even "localhost" — is a LAN listener and needs both TLS variables.
 *   MATIC_HUB_TLS_CERT   PEM certificate (with its chain). MATIC_HUB_TLS_KEY  its PEM private key.
 *
 * A LAN bind without a certificate does not fall back to plaintext and does not fall back to
 * loopback: it refuses, with a sentence, because either fallback would be the operator's intent
 * silently replaced. One TLS variable without the other is refused on any bind for the same reason.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {(path: string) => Buffer} [read]
 * @returns {{ bind: string, tls: { cert: Buffer, key: Buffer }|null, refusal: string|null }}
 */
export function listenPlanFromEnv(env = process.env, read = (p) => readFileSync(p)) {
  const bind = String(env.MATIC_HUB_BIND ?? "127.0.0.1").trim() || "127.0.0.1";
  const certPath = env.MATIC_HUB_TLS_CERT, keyPath = env.MATIC_HUB_TLS_KEY;
  if (Boolean(certPath) !== Boolean(keyPath)) {
    return { bind, tls: null, refusal: "MATIC_HUB_TLS_CERT and MATIC_HUB_TLS_KEY go together; one without the other is a misconfiguration, not a choice. Set both, or neither" };
  }
  if (!isLoopback(bind) && !certPath) {
    return { bind, tls: null, refusal: `MATIC_HUB_BIND=${bind} is not loopback, and no TLS certificate is configured. A LAN listener serves TLS only (D283): set MATIC_HUB_TLS_CERT and MATIC_HUB_TLS_KEY, or bind 127.0.0.1` };
  }
  if (!certPath) return { bind, tls: null, refusal: null };
  try {
    return { bind, tls: { cert: read(certPath), key: read(keyPath) }, refusal: null };
  } catch (err) {
    return { bind, tls: null, refusal: `the TLS files could not be read: ${err.message}. A LAN listener does not fall back to plaintext` };
  }
}

/**
 * Bad-credential throttle, per PEER, in process — the shape of the enrollment throttle (D83) and
 * the console's login throttle. Twenty refused credentials from one address inside a minute and
 * that address gets 429 for the rest of it. A speed bump, not a control: the credential is 256
 * random bits and guessing is not the threat; a misconfigured endpoint retrying a revoked
 * credential in a tight loop is, and this keeps that loop off the database.
 */
const BAD_CREDENTIALS_PER_MINUTE = 20, BAD_WINDOW_MS = 60_000;
/** @type {Map<string, number[]>} */
const badCredentials = new Map();
function noteBadCredential(peer) {
  const now = Date.now();
  const hits = (badCredentials.get(peer) ?? []).filter((t) => now - t < BAD_WINDOW_MS);
  hits.push(now);
  badCredentials.set(peer, hits);
  return hits.length > BAD_CREDENTIALS_PER_MINUTE ? Math.max(1, BAD_WINDOW_MS - (now - hits[0])) : 0;
}
/** For tests: forget every peer's refusals. */
export function resetCredentialThrottle() { badCredentials.clear(); }

/**
 * @typedef {{ ok: true, mode: "none", principal: null }
 *   | { ok: true, mode: "device-credential", principal: import("./devices/enrollment.js").AuthenticatedDevice }
 *   | { ok: false, status: 401|429|503, why: string, error: string, retryAfterMs?: number }} AuthResult
 */

/**
 * Who is calling, if they say (D282). This is the D61 slot B0 left empty, filled on 2026-09-12 with
 * the weaker credential on D61's path; when the signed assertion arrives this function changes and
 * nothing about the routes does.
 *
 *   NO Authorization header -> `mode: "none"`, the shape B0 always returned. The CALLER decides
 *   whether that is allowed on this listener (credentialRequired).
 *   A header -> CHECKED, on every listener. `Bearer mdc_…` is looked up by hash
 *   (src/devices/enrollment.js) and a refusal is a 401 with the reason in words — malformed,
 *   unknown, revoked — never a fall-through to unauthenticated. A credential the control plane
 *   cannot check (database down) is refused with 503, not assumed: "we could not tell" is never
 *   the branch that grants something.
 *
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<AuthResult>}
 */
export async function authenticate(req) {
  const header = req?.headers?.authorization;
  if (header === undefined) return { ok: true, mode: "none", principal: null };
  const peer = String(req.socket?.remoteAddress ?? "?");
  const m = /^Bearer\s+(\S+)\s*$/i.exec(String(header));
  if (!m) return { ok: false, status: 401, why: "malformed", error: "Authorization must be `Bearer <enrollment credential>`; nothing else is understood (D282)" };
  let result;
  try { result = await authenticateDeviceCredential(m[1]); }
  catch (err) {
    return { ok: false, status: 503, why: "unverifiable", error: `the enrollment credential could not be checked (${err.message}); refused rather than assumed` };
  }
  if (result.ok) return { ok: true, mode: "device-credential", principal: result.device };
  if (result.why !== "malformed") {
    const wait = noteBadCredential(peer);
    if (wait > 0) return { ok: false, status: 429, why: "throttled", error: `too many refused credentials from ${peer} in the last minute; try again shortly`, retryAfterMs: wait };
  }
  return { ok: false, status: 401, why: result.why, error: result.message };
}

/**
 * Build the server. Exported so tests can start it on an ephemeral port with a stub provider.
 * @param {{ provider: import("./providers/openai-compatible-provider.js").Provider, hubProvider?: "local" | "cloud", log?: (s: string) => void }} deps
 */
/**
 * What `/` and `/v1/health` say about the console's authentication (D267 guard 4). ONE function, so
 * the two pages cannot disagree about whether the second factor is live — and it reports the
 * REFUSED state as loudly as the on state, because "I set the variable" and "the variable is doing
 * something" are different facts and a reader needs to be able to tell them apart.
 *
 * @param {string|null} boundAddress
 */
function adminAuthReport(boundAddress) {
  const s = bypassStatus({ boundAddress });
  return {
    totpRequired: !s.on,
    insecureBypass: s.on ? "ACTIVE" : s.refused ? "REQUESTED AND REFUSED" : "off",
    insecureBypassDetail: s.reason,
  };
}

export function createHubServer({ provider, hubProvider = "local", log = console.log, embedder = null, tenantLabel = null, kb = true, ticketTenant = null, admin = true, tls = null }) {
  const handleTurn = turnHandler({ provider, hubProvider, log });
  // Built even when `kb` is false, so the route can answer 503 with a reason rather than 404 with
  // none: "this hub has no knowledge base" and "no such route" are different facts for a client.
  const handleAsk = askHandler({ provider, embedder, hubProvider, tenantLabel, log });
  // Built unconditionally, like handleAsk: an unconfigured ticket tenant answers 503 with a reason
  // rather than 404 with none (B6-lite, D213).
  const handleTicket = ticketHandler({ tenantSchema: ticketTenant, log });
  // B3. Unlike /v1/ask and /v1/ticket, this route DOES take a tenant from the client — see
  // src/devices/route.js's header for why that is not the same mistake those two routes refuse.
  const handleEnroll = enrollHandler({ log });
  // D284: the requester's own tickets - GET /v1/tickets and /v1/tickets/:reference. Needs the
  // authenticated device on every listener; src/tickets/read.js holds no SQL and composes P3a's readers.
  const handleTicketsRead = ticketsReadHandler({ log });
  // D286/D287: the requester's four POSTs - comment, reopen, confirm, ack. src/tickets/requester-routes.js.
  const handleRequesterAction = requesterActionHandler({ log });
  // D237/D239: the endpoint's session lifecycle. SAME tenant resolution as tickets, so a session and
  // the ticket it produces land in one schema without either side naming it (src/sessions/route.js).
  const handleSession = sessionHandler({ tenantSchema: ticketTenant, log });
  // D236: what retrieval would do RIGHT NOW — the embedder verified live (not described from its
  // constructor), the corpus, and the resulting mode. ONE reader for /v1/health AND the console's
  // degraded-retrieval banner, so the two cannot disagree (src/kb/health.js).
  const retrievalHealth = retrievalHealthReader({ embedder, kb });
  // The admin console (B2, D221). HTML, session-authenticated, mounted under /admin and nowhere
  // else. It is NOT one of the API routes and is deliberately absent from the route lists below:
  // it has its own authentication, and listing it beside routes that carry x-matic-hub-auth: none
  // would blur the one property those lists exist to state. src/admin/router.js is the front door.
  // It takes the SAME embedder instance handleAsk got, because the console's Knowledge search
  // exists to say what the endpoint's retrieval does. Two providers would make it a report about a
  // pipeline nobody runs. And the same health reader, for the same reason.
  // D267 guard 2. The bypass is refused unless the listener is bound to loopback, and this is how
  // the guard learns what it is bound to: the socket itself, read at sign-in time. Not a constant,
  // not an environment variable, and not an assumption about what `listen` was called with — the
  // address the server actually has. `httpServer` is assigned below, before it can accept anything.
  /** @type {import("node:http").Server|null} */
  let httpServer = null;
  const getBoundAddress = () => {
    const a = httpServer?.address();
    return a && typeof a === "object" ? a.address : null;
  };
  const handleAdmin = admin ? adminHandler({ log, embedder, retrievalHealth, getBoundAddress }) : null;

  // D283: a LAN listener is TLS or nothing. `tls` is { cert, key } from listenPlanFromEnv(); with
  // it the server is HTTPS and `req.socket.encrypted` is true on every connection, which is what
  // admitPeer() and the console's cookie both read.
  const create = (handler) => (tls ? https.createServer({ cert: tls.cert, key: tls.key }, handler) : http.createServer(handler));
  httpServer = create(async (req, res) => {
    // What THIS response's authentication was: "none" until authenticate() says otherwise. Stamped
    // on every response, so a client can always read whether the hub knew who was calling.
    let authMode = "none";
    const send = (status, body) => {
      const json = JSON.stringify(body);
      res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(json),
        // Loud. Every response says whether the hub authenticated this request, and how.
        "x-matic-hub-auth": authMode,
        "cache-control": "no-store",
      });
      res.end(json);
    };
    const pathname = (req.url ?? "/").split("?")[0];
    const bound = getBoundAddress();
    const peer = req.socket.remoteAddress;

    // 1. The peer gate (D283), BEFORE any credential is looked at: a refused peer costs no database
    //    round trip. Loopback listener -> loopback peers only (B0's rule). LAN listener -> TLS only.
    const gate = admitPeer({ bound, peer, peerLoopback: isLoopback(req.socket.remoteAddress), encrypted: Boolean(req.socket.encrypted) });
    if (!gate.allow) {
      log(`[hub] refused peer ${peer} on ${pathname}: ${gate.error}`);
      return send(gate.status, { ok: false, error: gate.error });
    }

    // 2. A presented credential is CHECKED, on every listener (D282). A bad one is refused here even
    //    where none is required, so a revoked endpoint on the hub's own machine learns it is revoked.
    const auth = await authenticate(req);
    if (!auth.ok) {
      log(`[hub] refused credential from ${peer} on ${pathname}: ${auth.why}`);
      return send(auth.status, { ok: false, error: auth.error, ...(auth.retryAfterMs ? { retryAfterMs: auth.retryAfterMs } : {}) });
    }
    authMode = auth.mode;

    // 3. Whether one was REQUIRED is the listener's decision (D283).
    if (auth.mode === "none" && credentialRequired({ bound, pathname })) {
      return send(401, { ok: false, error: `this hub is bound to ${bound}, off loopback, and ${pathname} requires an enrollment credential there: Authorization: Bearer <credential>, issued once by POST /v1/enroll with the tenant's enrollment secret (D283). /v1/enroll and /v1/health need none` });
    }

    // The console answers its own URLs and nothing else. It runs AFTER the loopback refusal, so it
    // is loopback-only by the same mechanism as the API, and BEFORE the API routes, so nothing
    // below ever sees a /admin request.
    if (handleAdmin && (req.url === "/admin" || req.url?.startsWith("/admin/") || req.url?.startsWith("/admin?"))) {
      if (await handleAdmin(req, res)) return;
    }

    if (req.url === "/v1/turn") {
      if (req.method !== "POST") return send(405, { ok: false, error: "POST only" });
      return handleTurn(req, res, send);
    }
    if (req.url === "/v1/ask") {
      if (req.method !== "POST") return send(405, { ok: false, error: "POST only" });
      if (!kb) return send(503, { ok: false, error: "this hub is running without a knowledge base (kb: false)" });
      return handleAsk(req, res, send);
    }
    if (pathname === ACK_PATH || ACTION_PATH.test(pathname)) {
      // D286/D287. The requester acts on a ticket; every one of the four needs the device. Dispatched
      // BEFORE the read route because /v1/tickets/ack shares its prefix.
      return handleRequesterAction(req, res, send, { device: auth.principal, pathname });
    }
    if (pathname === "/v1/tickets" || pathname.startsWith("/v1/tickets/")) {
      // D284. The requester's own tickets; the route refuses without a device on every listener.
      return handleTicketsRead(req, res, send, { device: auth.principal });
    }
    if (req.url === "/v1/ticket") {
      if (req.method !== "POST") return send(405, { ok: false, error: "POST only" });
      return handleTicket(req, res, send, { device: auth.principal });
    }
    if (req.url === "/v1/enroll") {
      if (req.method !== "POST") return send(405, { ok: false, error: "POST only" });
      return handleEnroll(req, res, send);
    }
    if (req.url === "/v1/session") {
      if (req.method !== "POST") return send(405, { ok: false, error: "POST only" });
      return handleSession(req, res, send, { device: auth.principal });
    }
    if (req.url === "/v1/health" && req.method === "GET") {
      // The corpus figures are best-effort: /v1/health must answer when the database does not,
      // because "is the hub up" and "is the corpus loaded" are different questions and the second
      // one failing is not the first one failing. Since D236 the embedder figures are LIVE too —
      // `available` is a verify() that ran within the last few seconds, not the constructor's
      // description — and `retrieval.mode` is what a question asked now would be retrieved under.
      let health = { embedder: null, corpus: null, mode: "unavailable", degraded: true, why: "health reader failed" };
      try { health = await retrievalHealth(); }
      catch (err) { health = { ...health, why: `health reader failed: ${err.message}` }; }
      return send(200, {
        ok: true,
        hub: "matic-desk-hub",
        phase: "B0 walking skeleton + B7a knowledge base",
        // D282/D283. What THIS listener requires, in words, and what a credential proves.
        auth: authPolicy(bound),
        listener: { address: bound, port: (() => { const a = httpServer?.address(); return a && typeof a === "object" ? a.port : null; })(), loopback: bound !== null && bound !== undefined && isLoopback(bound), tls: Boolean(tls) },
        enrollment: { route: "POST /v1/enroll", identity: IDENTITY_NOTE },
        tenancy: "from the credential on an authenticated call (control.devices.tenant_id -> the tenant's schema, D284); MATIC_TICKET_TENANT for an unauthenticated loopback call; /v1/ask reads the GENERIC KB, cross-tenant by D45, so MATIC_KB_TENANT_LABEL is a log label and not an authenticated tenant",
        // D267 guard 4, the machine-readable half. A monitor, a preflight script or a reviewer
        // should be able to answer "is the second factor disabled on that box" without a browser.
        adminAuth: admin ? adminAuthReport(getBoundAddress()) : { enabled: false },
        provider: { name: provider.name, model: provider.model, hubProvider },
        embedder: health.embedder,
        corpus: health.corpus,
        // D236. `degraded: true` means a decline made now is NOT evidence of a gap, and the console
        // shows a banner for as long as this says so.
        retrieval: { mode: health.mode, degraded: health.degraded, why: health.why },
        // D237/D239. Whether this hub records sessions at all; the endpoint's session id is
        // self-asserted either way.
        sessions: ticketTenant
          ? { enabled: true, tenant: ticketTenant, note: "POST /v1/session; ids are the endpoint's own claim (no device auth, D61)" }
          : { enabled: false, why: "no endpoint tenant is configured (MATIC_TICKET_TENANT, or a single tenant in control.tenants)" },
        // B6-lite (D213). `notifies` is false in EVERY build that has a ticket store, until
        // outbound email exists (D86) — a client reading this must not conclude that filing a
        // ticket tells anybody, because that is the one wrong thing it would be convenient to say.
        tickets: ticketTenant
          ? { enabled: true, tenant: ticketTenant, notifies: false, note: "stored only; there is no outbound email in this build (D86, OPEN-4)" }
          : { enabled: false, why: "no ticket tenant is configured (MATIC_TICKET_TENANT, or a single tenant in control.tenants)" },
        // Loud, in the one response a client is most likely to read programmatically.
        rerankerPresent: false,
      });
    }
    // GET / — the index. Added 2026-09-04 because the founder opened the hub in a browser and got
    // `{"ok":false,"error":"no such route: GET /"}`, which is correct and useless.
    //
    // THE POINT IS CONSISTENCY WITH THE REST OF THIS FILE. Every other surface is loud about what
    // this service is and is not — the startup banner, `x-matic-hub-auth: none` on every response,
    // /v1/health's `auth` and `tenancy` fields. The one surface a HUMAN reaches first was silent.
    // A person who opens a port in a browser is diagnosing, and "no such route" answers none of
    // the three questions they have: what is this, what can it do, is it healthy.
    //
    // JSON rather than HTML, deliberately: this service has no rendering surface and should not
    // acquire one for a diagnostic page. Browsers pretty-print JSON.
    if (req.url === "/" && req.method === "GET") {
      return send(200, {
        ok: true,
        hub: "matic-desk-hub",
        phase: "B0 walking skeleton + B7a knowledge base",
        // Repeated here rather than only in the banner, because the banner is in a terminal the
        // reader of this page is probably not looking at.
        warning: bound !== null && bound !== undefined && !isLoopback(bound)
          ? `LAN LISTENER on ${bound} over TLS (D283). Every /v1 route but /v1/enroll and /v1/health REQUIRES an enrollment credential (Authorization: Bearer, D282); the tenant comes from it (D284). D60/D61/D63/D64 are NOT built - a credential proves a per-OS-user enrollment of the software, not a machine or a person.`
          : "LOOPBACK LISTENER. Enrollment credentials (D282) are checked when presented and OPTIONAL from this machine; an unauthenticated call's tenant is MATIC_TICKET_TENANT. Do not expose this listener - a LAN listener is MATIC_HUB_BIND + MATIC_HUB_TLS_CERT/KEY, and it requires credentials (D283).",
        auth: authPolicy(bound),
        tenancy: "from the credential on an authenticated call (D284); MATIC_TICKET_TENANT for an unauthenticated loopback call; /v1/ask reads the GENERIC KB, cross-tenant by D45, so MATIC_KB_TENANT_LABEL is a log label and not an authenticated tenant",
        routes: [
          { method: "GET", path: "/", what: "this" },
          { method: "GET", path: "/v1/health", what: "provider, embedder, corpus counts, and which model embedded it; the listener and what it requires" },
          { method: "GET", path: "/v1/tickets", what: "the tickets YOUR enrollment filed - requester-safe columns only (D281/D284). Requires the enrollment credential on every listener", headers: { authorization: "Bearer <the credential POST /v1/enroll returned once>" } },
          { method: "GET", path: "/v1/tickets/:reference", what: "one of them, with its PUBLIC timeline entries. Same credential; another enrollment's reference is a 404. Reading it stamps notifiedAt on the desk's entries - the hub's clock (D287)" },
          { method: "POST", path: "/v1/ticket/:reference/comment", what: "the requester comments - a TRANSITION (D286): a resolved ticket reopens, a live one starts the desk's waiting clock, a closed one is refused with the way forward. Credential required", body: { body: "string (required, at most 4000 characters)" } },
          { method: "POST", path: "/v1/ticket/:reference/reopen", what: "the requester says a resolved ticket is not fixed: resolved -> open, the reason recorded as a public comment (D286). Credential required", body: { reason: "string (required)" } },
          { method: "POST", path: "/v1/ticket/:reference/confirm", what: "the requester confirms the fix: resolved -> closed, closed_by requester, the resolution kept (D286). Credential required" },
          { method: "POST", path: "/v1/tickets/ack", what: "the endpoint acknowledges it SHOWED entries; the hub stamps readByRequesterAt with its own clock (D287). Credential required", body: { entryIds: "array of entry ids (uuids)" } },
          { method: "POST", path: "/v1/ask", what: "answer a question from the knowledge base, or decline", body: { text: "string (required)", probe: "object (optional machine state; supplies the platform pre-filter)" } },
          { method: "POST", path: "/v1/turn", what: "propose a machine change. STATELESS - reaches no database", body: { text: "string", probe: "object", capabilities: "array (the endpoint sends its own tool schemas; the hub holds no catalog)" } },
          { method: "POST", path: "/v1/ticket", what: "file a ticket. STORES ONLY - nobody is notified, there is no outbound email (D86)", body: { description: "string (the reporter's own words)", summary: "string (the case note for the assignee)", category: "enum", suggestedOwner: "enum or null", whatWasChecked: "string", machineName: "string", reporter: "{ osUsername, firstName, lastName, location, contactId } - SELF-ASSERTED, not authenticated" } },
          { method: "POST", path: "/v1/enroll", what: "a device asks to join a tenant (B3). The one route that DOES take a tenant from the client - the enrollment secret is what authenticates the claim. The response that makes the device active carries its credential ONCE (D282)", body: { tenant: "string (the tenant's slug)", deviceKeyId: "string (opaque device identity)", secret: "string (the tenant's enrollment secret)", mode: "'standalone' | 'joined' (optional)" } },
          { method: "POST", path: "/v1/session", what: "the endpoint's conversation began / was confirmed fixed / was confirmed not fixed / ended (D237, D239). The row is written at BEGIN, defaulting to unresolved; 'escalated' is set by POST /v1/ticket, never by this route; 'suppressed' is reserved", body: { event: "'begin' | 'resolved' | 'not_fixed' | 'end'", sessionId: "uuid, minted by the endpoint - SELF-ASSERTED", startedAt: "ISO timestamp (optional)", category: "slug (optional, with resolved: the capability confirmed)", machineName: "string (optional)" } },
        ],
        // The admin console (B2). A separate field, NOT an entry in routes: it is a browser surface
        // with its own session authentication, not an API, and it must not read as one (exit
        // criterion 7 of the console handover).
        console: admin
          ? {
            path: "/admin", what: "the admin console. HTML, for a browser. Local accounts with password + authenticator, roles, audit. Reachable wherever this hub is bound (D283): from this machine on a loopback listener, from the network on a LAN listener over TLS. The sign-in code has not had a security review",
            // D267 guard 4. This page already tells the truth about authentication and tenancy; a
            // reader must not be able to mistake a bypassed console for a normal one, and this is
            // the object they are reading when they check.
            ...adminAuthReport(getBoundAddress()),
          }
          : { enabled: false },
        // The caveat that has to travel with any number this hub produces.
        rerankerPresent: false,
        note: "Retrieval quality figures from this hub are a FLOOR, not a measurement: six articles, no cross-encoder reranker, and a development embedder that is not the one D199 chose. See server/docs/B7a-KNOWLEDGE-BASE.md",
      });
    }

    // Unknown route. Now names the routes that DO exist, for the same reason as the index.
    return send(404, {
      ok: false,
      error: `no such route: ${req.method} ${req.url}`,
      routes: ["GET /", "GET /v1/health", "GET /v1/tickets", "GET /v1/tickets/:reference", "POST /v1/ticket/:reference/comment", "POST /v1/ticket/:reference/reopen", "POST /v1/ticket/:reference/confirm", "POST /v1/tickets/ack", "POST /v1/ask", "POST /v1/turn", "POST /v1/ticket", "POST /v1/enroll", "POST /v1/session"],
    });
  });

  return httpServer;
}

// ---- entry point ------------------------------------------------------------------------------
const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  // D283: how to listen is decided BEFORE anything is built. A LAN bind without TLS does not start.
  const plan = listenPlanFromEnv();
  if (plan.refusal) {
    console.log("");
    for (const l of banner(["THIS HUB DID NOT START.", "", ...wrap(plan.refusal, BANNER_WIDTH - 4)])) console.log(l);
    console.log("");
    process.exitCode = 1;
  } else {
    const port = Number(process.env.MATIC_HUB_PORT ?? 8787);
    const provider = new OpenAICompatibleProvider({
      model: process.env.MATIC_HUB_MODEL ?? "mistral-small:24b",
      baseUrl: process.env.MATIC_HUB_UPSTREAM ?? "http://127.0.0.1:11434/v1",
      timeoutMs: Number(process.env.MATIC_HUB_TIMEOUT_MS ?? 300000),
    });
    const embedder = embeddingProviderFromEnv();
    const tenantLabel = process.env.MATIC_KB_TENANT_LABEL ?? null;
    const ticketTenant = await resolveTicketTenant(console.log);
    const server = createHubServer({ provider, hubProvider: "local", embedder, tenantLabel, ticketTenant, tls: plan.tls });

    // Verify the embedder, and do not exit if it fails. A hub with no embedder still answers through
    // the lexical leg, which is the degraded mode the endpoint sees when the embedder is down (B7a
    // spec §6) — so refusing to start would turn a degradation into an outage. What it must not do is
    // degrade quietly.
    //
    // It runs from INSIDE the listen callback rather than before it. When it ran first, an EADDRINUSE
    // failure printed "embedder ollama -> ... 1024 dimensions" AFTER the "did not start" banner,
    // which reads as though the hub had started. Do not probe a dependency of a server that is not
    // listening.
    const verifyEmbedder = () => void (async () => {
      const v = await embedder.verify();
      if (v.ok) {
        console.log(`[hub] embedder ${embedder.name} -> ${embedder.model}, ${v.dimensions} dimensions (L2 norm ${v.l2?.toFixed(6)})`);
      } else if (embedder.name === "none") {
        console.log("[hub] NO EMBEDDER (MATIC_EMBED_PROVIDER=none). /v1/ask retrieves through the LEXICAL LEG ONLY.");
      } else {
        console.log("");
        console.log(`[hub] !! THE EMBEDDER IS UNAVAILABLE: ${v.error ?? `returned ${v.dimensions} dimensions, expected ${EMBEDDING_DIM}`}`);
        console.log("[hub] !! /v1/ask will retrieve through the LEXICAL LEG ONLY. Answers are degraded, not absent.");
        console.log(`[hub] !! ${v.dimensions && v.dimensions !== EMBEDDING_DIM ? "A width mismatch needs a NEW migration, not an edit to 002." : `Is ${embedder.model} pulled? \`ollama pull ${embedder.model}\``}`);
        console.log("");
      }
    })();

    // Starting the hub twice is a NORMAL mistake, not an exceptional one - you forget the first one
    // is running, or a previous run is still alive in another window. Node's default answer is an
    // unhandled 'error' event and a fifteen-line stack trace ending in EADDRINUSE, which buries the
    // one fact that matters and the one command that resolves it.
    //
    // Observed 2026-09-04: the founder hit exactly this while a hub was already running.
    //
    // It is handled here rather than left to crash because this service's whole design is to be
    // legible about its own state - the banner, the index route, x-matic-hub-auth: none - and a raw
    // stack trace on the most common startup failure is the same gap the missing GET / route was.
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.log("");
        for (const l of banner([`PORT ${port} IS ALREADY IN USE. This hub did not start.`])) console.log(l);
        console.log("");
        console.log("  Almost certainly a hub is ALREADY RUNNING - check before starting another:");
        console.log("");
        console.log(`    curl.exe http://127.0.0.1:${port}/v1/health`);
        console.log("");
        console.log("  If that answers, use the one that is already up. To find and stop it:");
        console.log("");
        console.log(`    Get-NetTCPConnection -LocalPort ${port} -State Listen | Select-Object OwningProcess`);
        console.log("    Stop-Process -Id <that id>");
        console.log("");
        console.log(`  Or run this one on a different port:  $env:MATIC_HUB_PORT=8788; npm.cmd start`);
        console.log("");
        process.exitCode = 1;
        return;
      }
      // Anything else is genuinely unexpected and should not be swallowed to look tidy.
      console.log("");
      console.log(`[hub] failed to start: ${err.code ?? "error"} - ${err.message}`);
      console.log("");
      process.exitCode = 1;
    });

    server.listen(port, plan.bind, () => {
      verifyEmbedder();
      console.log("");
      // D283: the listener's own banner - loopback or LAN - measured by test/bind.test.mjs.
      for (const l of banner(listenerBanner({ bind: plan.bind, port, tls: Boolean(plan.tls) }))) console.log(l);
      // D267 guard 3. In the same place as the loopback and `auth: none` warnings, and read from the
      // socket that is now actually listening, so the banner cannot claim a binding the server does
      // not have. A REFUSED bypass is printed too: setting the variable and getting nothing must not
      // look the same as not setting it.
      {
        const b = bypassStatus({ boundAddress: server.address()?.address ?? null });
        if (b.on) {
          console.log("");
          for (const l of banner(bypassStartupBanner())) console.log(l);
        } else if (b.refused) {
          console.log("");
          console.log(`[hub] ${b.reason}`);
        }
      }
      console.log(`[hub] listening on ${plan.tls ? "https" : "http"}://${plan.bind}:${port}${plan.tls ? " (TLS)" : ""}`);
      console.log(`[hub]   POST /v1/turn   stateless, proposes a machine change, reaches no database`);
      console.log(`[hub]   POST /v1/ask    stateful, answers from the knowledge base (B7a)`);
      console.log(`[hub]   POST /v1/enroll device enrollment (B3); the activating response carries the credential once (D282)`);
      console.log(`[hub]   GET  /v1/tickets, /v1/tickets/:ref  the requester's own tickets - credential required (D284)`);
      console.log(`[hub]   GET  /v1/health`);
      console.log(`[hub]   GET  /admin        the admin console (B2) - a browser surface with its own sign-in, not an API route`);
      console.log(`[hub] provider ${provider.name} -> ${provider.baseUrl} model ${provider.model} (claimed as hubProvider "local")`);
      console.log(`[hub] holds no catalog: the endpoint sends its tool schemas with every turn (D149)`);
      // D229: say what happens to what employees type, every start, in one line.
      if (questionLoggingEnabled()) {
        console.log(`[hub] question text IS LOGGED (MATIC_KB_LOG_QUERIES=1) and kept ${questionRetentionDays()} day(s), then cleared; the row stays (D229)`);
        if (Number(process.env.MATIC_KB_QUESTION_RETENTION_DAYS) > QUESTION_RETENTION_MAX_DAYS) console.log(`[hub] !! MATIC_KB_QUESTION_RETENTION_DAYS=${process.env.MATIC_KB_QUESTION_RETENTION_DAYS} exceeds the ceiling; held at ${QUESTION_RETENTION_MAX_DAYS} (D229: configurable downward only)`);
      } else {
        console.log(`[hub] question text is NOT logged (MATIC_KB_LOG_QUERIES unset or retention 0); the review queue's gaps carry no sentence`);
      }
      console.log("");
      for (const l of banner([
        "/v1/ask HAS NO TENANCY. The corpus it reads is the GENERIC KB, which is",
        "cross-tenant by decision (D45), so nothing it returns depends on a tenant.",
        `MATIC_KB_TENANT_LABEL is ${tenantLabel ?? "unset"} - a LOG LABEL, not an identity.`,
        "/v1/ask refuses a tenant in the request body: a client-supplied tenant",
        "becomes the tenancy model by default, which is worse than having none.",
        "",
        "NO CROSS-ENCODER RERANKER EXISTS (B7a spec §7). Retrieval quality numbers",
        "from this hub are a FLOOR, not a measurement of the design.",
      ])) console.log(l);

      // D270: control.job_queue's runtime. Started HERE, after the socket is listening and the
      // banners are out, and never awaited: a tick that cannot reach PostgreSQL logs once and keeps
      // polling (src/jobs/runner.js), so the runner cannot delay "listening" or stop the hub starting
      // — the same property /v1/health has, reporting corpus errors rather than refusing to boot.
      // Nothing is registered yet (src/jobs/handlers.js says why). The runner claims only the types
      // it has handlers for and LOGS how many due jobs of other types are waiting, so an empty
      // registry is visible in this log, not silent in the table — and it cannot fail work that a
      // hub with a fuller registry, or a test suite sharing this database, enqueued.
      {
        const pollMs = pollIntervalFromEnv();
        if (pollMs === 0) {
          console.log("[hub] jobs: NOT polling control.job_queue (MATIC_JOBS_POLL_MS=0); queued jobs stay queued until a hub with the runner on picks them up");
        } else {
          const runner = createJobRunner({ handlers: JOB_HANDLERS, pollMs, log: console.log });
          runner.start();
          const n = Object.keys(JOB_HANDLERS).length;
          console.log(`[hub] jobs: polling control.job_queue every ${pollMs} ms as ${runner.workerId}; ${n} handler(s) registered${n === 0 ? " - this process claims NO jobs and only reports what is waiting" : ""}; a job of an unknown type is left queued and reported, not run. At-least-once: every handler must tolerate running twice`);
        }
      }
    });
  }
}
