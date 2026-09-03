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
 * OUT OF SCOPE AND VISIBLY SO: device auth, tenancy, persistence, KB retrieval, audit ingestion,
 * TLS, spend caps. None of them have a stub here that could be mistaken for a start.
 *
 * Configuration (environment; there is no config file yet):
 *   MATIC_HUB_PORT      default 8787
 *   MATIC_HUB_UPSTREAM  default http://127.0.0.1:11434/v1   (Ollama's OpenAI-compatible base)
 *   MATIC_HUB_MODEL     default mistral-small:24b           (the customer-hosted pick, D139)
 *   MATIC_HUB_TIMEOUT_MS default 300000
 */
import http from "node:http";
import { pathToFileURL } from "node:url";
import { OpenAICompatibleProvider } from "./providers/openai-compatible-provider.js";
import { turnHandler } from "./turn.js";

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
export function createHubServer({ provider, hubProvider = "local", log = console.log }) {
  const handleTurn = turnHandler({ provider, hubProvider, log });

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
    if (req.url === "/v1/health" && req.method === "GET") {
      return send(200, { ok: true, hub: "matic-desk-hub", phase: "B0 walking skeleton", auth: "none", provider: { name: provider.name, model: provider.model, hubProvider } });
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
  const server = createHubServer({ provider, hubProvider: "local" });
  server.listen(port, "127.0.0.1", () => {
    console.log("");
    console.log("################################################################################");
    console.log("#  MATIC DESK HUB - B0 WALKING SKELETON. NO AUTHENTICATION. LOOPBACK ONLY.     #");
    console.log("#  Nothing here identifies a device, a tenant or a user. Do not expose it.     #");
    console.log("#  Device assertion -> token exchange (D61, D132) is not built. Every response  #");
    console.log("#  carries x-matic-hub-auth: none so nobody can mistake this for a service.    #");
    console.log("################################################################################");
    console.log(`[hub] listening on http://127.0.0.1:${port}  POST /v1/turn  GET /v1/health`);
    console.log(`[hub] provider ${provider.name} -> ${provider.baseUrl} model ${provider.model} (claimed as hubProvider "local")`);
    console.log(`[hub] holds no catalog: the endpoint sends its tool schemas with every turn (D149)`);
  });
}
