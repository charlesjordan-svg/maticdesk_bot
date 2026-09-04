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

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

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
export function createHubServer({ provider, hubProvider = "local", log = console.log, embedder = null, tenantLabel = null, kb = true }) {
  const handleTurn = turnHandler({ provider, hubProvider, log });
  // Built even when `kb` is false, so the route can answer 503 with a reason rather than 404 with
  // none: "this hub has no knowledge base" and "no such route" are different facts for a client.
  const handleAsk = askHandler({ provider, embedder, hubProvider, tenantLabel, log });

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

    if (req.url === "/v1/turn") {
      if (req.method !== "POST") return send(405, { ok: false, error: "POST only" });
      return handleTurn(req, res, send);
    }
    if (req.url === "/v1/ask") {
      if (req.method !== "POST") return send(405, { ok: false, error: "POST only" });
      if (!kb) return send(503, { ok: false, error: "this hub is running without a knowledge base (kb: false)" });
      return handleAsk(req, res, send);
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
        // Loud, in the one response a client is most likely to read programmatically.
        rerankerPresent: false,
      });
    }
    return send(404, { ok: false, error: `no such route: ${req.method} ${req.url}` });
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
  const server = createHubServer({ provider, hubProvider: "local", embedder, tenantLabel });

  // Verify the embedder BEFORE serving, and do not exit if it fails. A hub with no embedder still
  // answers through the lexical leg, which is the degraded mode the endpoint sees when the embedder
  // is down (B7a spec §6) — so refusing to start would turn a degradation into an outage. What it
  // must not do is degrade quietly.
  void (async () => {
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

  server.listen(port, "127.0.0.1", () => {
    console.log("");
    console.log("################################################################################");
    console.log("#  MATIC DESK HUB - B0 WALKING SKELETON. NO AUTHENTICATION. LOOPBACK ONLY.     #");
    console.log("#  Nothing here identifies a device, a tenant or a user. Do not expose it.     #");
    console.log("#  Device assertion -> token exchange (D61, D132) is not built. Every response  #");
    console.log("#  carries x-matic-hub-auth: none so nobody can mistake this for a service.    #");
    console.log("################################################################################");
    console.log(`[hub] listening on http://127.0.0.1:${port}`);
    console.log(`[hub]   POST /v1/turn   stateless, proposes a machine change, reaches no database`);
    console.log(`[hub]   POST /v1/ask    stateful, answers from the knowledge base (B7a)`);
    console.log(`[hub]   GET  /v1/health`);
    console.log(`[hub] provider ${provider.name} -> ${provider.baseUrl} model ${provider.model} (claimed as hubProvider "local")`);
    console.log(`[hub] holds no catalog: the endpoint sends its tool schemas with every turn (D149)`);
    console.log("");
    console.log("################################################################################");
    console.log("#  /v1/ask HAS NO TENANCY. The corpus it reads is the GENERIC KB, which is       #");
    console.log("#  cross-tenant by decision (D45), so nothing it returns depends on a tenant.    #");
    console.log(`#  MATIC_KB_TENANT_LABEL is ${(tenantLabel ?? "unset").padEnd(20)} - a LOG LABEL, not an identity. #`);
    console.log("#  /v1/ask refuses a tenant in the request body: a client-supplied tenant       #");
    console.log("#  becomes the tenancy model by default, which is worse than having none.       #");
    console.log("#                                                                              #");
    console.log("#  NO CROSS-ENCODER RERANKER EXISTS (B7a spec §7). Retrieval quality numbers    #");
    console.log("#  from this hub are a FLOOR, not a measurement of the design.                  #");
    console.log("################################################################################");
  });
}
