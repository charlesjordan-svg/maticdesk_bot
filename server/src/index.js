// @ts-check
/**
 * The Matic Desk hub - B0 walking skeleton (2026-09-03). Spec summary: handover Task 2.
 *
 * One Node HTTP service. One route, POST /v1/turn (src/turn.js). One provider, OpenAI-compatible,
 * pointed at local Ollama (src/providers/). Same runtime as the client - one toolchain.
 *
 * NO AUTHENTICATION, AND THE ABSENCE IS LOUD.
 *   - Binds 127.0.0.1 only, and refuses any connection whose peer is not loopback anyway.
 *   - Warns on every start, and stamps every response with `x-matic-hub-auth: none`.
 *   - `authenticate()` below is where the device assertion -> access token exchange (D61, D132)
 *     slots in. It runs before the route body and the body does not depend on it, so adding real
 *     authentication later changes this function and nothing about /v1/turn.
 *   Do NOT implement authentication here (handover "what not to do"): the value of this skeleton is
 *   partly in being obviously unfinished. A half-built auth layer would invite someone to trust it.
 *
 * OUT OF SCOPE AND VISIBLY SO: device auth, tenancy, audit ingestion, TLS, spend caps. None of them
 * have a stub here that could be mistaken for a start.
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
 *   MATIC_HUB_UPSTREAM  default http://127.0.0.1:11434/v1   (Ollama's OpenAI-compatible base)
 *   MATIC_HUB_MODEL     default mistral-small:24b           (the customer-hosted pick, D139)
 *   MATIC_HUB_TIMEOUT_MS default 300000
 *   MATIC_EMBED_PROVIDER "ollama" | "none"                  (src/kb/embed.js; "none" = lexical only)
 *   MATIC_EMBED_MODEL   default snowflake-arctic-embed2:568m
 *   MATIC_KB_TENANT_LABEL a development label for retrieval logs. NOT a tenant. NOT authenticated.
 *   MATIC_KB_LOG_QUERIES "1" to store the user's sentence in the retrieval log. Default OFF.
 */
import http from "node:http";
import { pathToFileURL } from "node:url";
import { OpenAICompatibleProvider } from "./providers/openai-compatible-provider.js";
import { turnHandler } from "./turn.js";
import { askHandler } from "./kb/ask.js";
import { corpusStatus } from "./kb/ingest.js";
import { embeddingProviderFromEnv, EMBEDDING_DIM } from "./kb/embed.js";
import { ticketHandler, resolveTicketTenant } from "./tickets/file.js";
import { adminHandler } from "./admin/router.js";

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

/**
 * Where authentication WILL go. Today it authenticates nothing and says so. The shape - a result
 * the route can read - is the only thing that is real about it.
 * @returns {{ ok: true, mode: "none", principal: null }}
 */
export function authenticate(_req) {
  return { ok: true, mode: "none", principal: null };
}

/**
 * Build the server. Exported so tests can start it on an ephemeral port with a stub provider.
 * @param {{ provider: import("./providers/openai-compatible-provider.js").Provider, hubProvider?: "local" | "cloud", log?: (s: string) => void }} deps
 */
export function createHubServer({ provider, hubProvider = "local", log = console.log, embedder = null, tenantLabel = null, kb = true, ticketTenant = null, admin = true }) {
  const handleTurn = turnHandler({ provider, hubProvider, log });
  // Built even when `kb` is false, so the route can answer 503 with a reason rather than 404 with
  // none: "this hub has no knowledge base" and "no such route" are different facts for a client.
  const handleAsk = askHandler({ provider, embedder, hubProvider, tenantLabel, log });
  // Built unconditionally, like handleAsk: an unconfigured ticket tenant answers 503 with a reason
  // rather than 404 with none (B6-lite, D213).
  const handleTicket = ticketHandler({ tenantSchema: ticketTenant, log });
  // The admin console (B2, D221). HTML, session-authenticated, mounted under /admin and nowhere
  // else. It is NOT one of the API routes and is deliberately absent from the route lists below:
  // it has its own authentication, and listing it beside routes that carry x-matic-hub-auth: none
  // would blur the one property those lists exist to state. src/admin/router.js is the front door.
  // It takes the SAME embedder instance handleAsk got, because the console's Knowledge search
  // exists to say what the endpoint's retrieval does. Two providers would make it a report about a
  // pipeline nobody runs.
  const handleAdmin = admin ? adminHandler({ log, embedder }) : null;

  return http.createServer(async (req, res) => {
    const send = (status, body) => {
      const json = JSON.stringify(body);
      res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(json),
        // Loud. Every response says the hub authenticated nobody.
        "x-matic-hub-auth": "none",
        "cache-control": "no-store",
      });
      res.end(json);
    };

    if (!isLoopback(req.socket.remoteAddress)) {
      log(`[hub] refused non-loopback peer ${req.socket.remoteAddress}`);
      return send(403, { ok: false, error: "the B0 hub accepts loopback connections only" });
    }

    const auth = authenticate(req);
    if (!auth.ok) return send(401, { ok: false, error: "unauthenticated" }); // unreachable today; the shape is the point

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
    if (req.url === "/v1/ticket") {
      if (req.method !== "POST") return send(405, { ok: false, error: "POST only" });
      return handleTicket(req, res, send);
    }
    if (req.url === "/v1/health" && req.method === "GET") {
      // The corpus figures are best-effort: /v1/health must answer when the database does not,
      // because "is the hub up" and "is the corpus loaded" are different questions and the second
      // one failing is not the first one failing.
      let corpus = null;
      if (kb) {
        try { corpus = await corpusStatus(); }
        catch (err) { corpus = { error: err.message }; }
      }
      return send(200, {
        ok: true,
        hub: "matic-desk-hub",
        phase: "B0 walking skeleton + B7a knowledge base",
        auth: "none",
        tenancy: "none - MATIC_KB_TENANT_LABEL is a development label, not an authenticated tenant",
        provider: { name: provider.name, model: provider.model, hubProvider },
        embedder: embedder ? { name: embedder.name, model: embedder.model, dimensions: embedder.dimensions } : null,
        corpus,
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
        warning: "NO AUTHENTICATION. NO TENANCY. LOOPBACK ONLY. This is not a service - do not expose it.",
        auth: "none - every response carries x-matic-hub-auth: none. Device assertion -> token exchange (D61, D132) is NOT built",
        tenancy: "none - MATIC_KB_TENANT_LABEL is a development log label, not an authenticated tenant",
        routes: [
          { method: "GET", path: "/", what: "this" },
          { method: "GET", path: "/v1/health", what: "provider, embedder, corpus counts, and which model embedded it" },
          { method: "POST", path: "/v1/ask", what: "answer a question from the knowledge base, or decline", body: { text: "string (required)", probe: "object (optional machine state; supplies the platform pre-filter)" } },
          { method: "POST", path: "/v1/turn", what: "propose a machine change. STATELESS - reaches no database", body: { text: "string", probe: "object", capabilities: "array (the endpoint sends its own tool schemas; the hub holds no catalog)" } },
          { method: "POST", path: "/v1/ticket", what: "file a ticket. STORES ONLY - nobody is notified, there is no outbound email (D86)", body: { description: "string (the reporter's own words)", summary: "string (the case note for the assignee)", category: "enum", suggestedOwner: "enum or null", whatWasChecked: "string", machineName: "string", reporter: "{ osUsername, firstName, lastName, location, contactId } - SELF-ASSERTED, not authenticated" } },
        ],
        // The admin console (B2). A separate field, NOT an entry in routes: it is a browser surface
        // with its own session authentication, not an API, and it must not read as one (exit
        // criterion 7 of the console handover).
        console: admin
          ? { path: "/admin", what: "the admin console. HTML, for a browser. Local accounts with password + authenticator, roles, audit. Loopback only, like everything here, until the sign-in code has had a security review" }
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
      routes: ["GET /", "GET /v1/health", "POST /v1/ask", "POST /v1/turn", "POST /v1/ticket"],
    });
  });
}

// ---- entry point ------------------------------------------------------------------------------
const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.MATIC_HUB_PORT ?? 8787);
  const provider = new OpenAICompatibleProvider({
    model: process.env.MATIC_HUB_MODEL ?? "mistral-small:24b",
    baseUrl: process.env.MATIC_HUB_UPSTREAM ?? "http://127.0.0.1:11434/v1",
    timeoutMs: Number(process.env.MATIC_HUB_TIMEOUT_MS ?? 300000),
  });
  const embedder = embeddingProviderFromEnv();
  const tenantLabel = process.env.MATIC_KB_TENANT_LABEL ?? null;
  const ticketTenant = await resolveTicketTenant(console.log);
  const server = createHubServer({ provider, hubProvider: "local", embedder, tenantLabel, ticketTenant });

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

  server.listen(port, "127.0.0.1", () => {
    verifyEmbedder();
    console.log("");
    for (const l of banner([
      "MATIC DESK HUB - B0 WALKING SKELETON. NO AUTHENTICATION. LOOPBACK ONLY.",
      "Nothing here identifies a device, a tenant or a user. Do not expose it.",
      "Device assertion -> token exchange (D61, D132) is not built. Every response",
      "carries x-matic-hub-auth: none so nobody can mistake this for a service.",
    ])) console.log(l);
    console.log(`[hub] listening on http://127.0.0.1:${port}`);
    console.log(`[hub]   POST /v1/turn   stateless, proposes a machine change, reaches no database`);
    console.log(`[hub]   POST /v1/ask    stateful, answers from the knowledge base (B7a)`);
    console.log(`[hub]   GET  /v1/health`);
    console.log(`[hub]   GET  /admin        the admin console (B2) - a browser surface with its own sign-in, not an API route`);
    console.log(`[hub] provider ${provider.name} -> ${provider.baseUrl} model ${provider.model} (claimed as hubProvider "local")`);
    console.log(`[hub] holds no catalog: the endpoint sends its tool schemas with every turn (D149)`);
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
  });
}
