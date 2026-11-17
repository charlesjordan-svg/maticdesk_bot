/**
 * POST /v1/nuance/session-token, headless (2026-11-16, D298-D300, all PROPOSED).
 *
 * Run: node test/nuance.test.mjs        (from server/; part of `npm test`)
 *
 * docs/handovers/2026-11-16-claude-code-handover-nuance-live-persona.md §5.2. A stub stands in for
 * Nuance and records what the hub sent it, so every assertion is about the HUB: what it lets a
 * client choose (nothing), what it sends upstream, what it refuses, and where the API key goes
 * (upstream, in one header, and nowhere else).
 *
 * NOTHING HERE CALLS NUANCE. No token was minted by this file and no credit was spent.
 */
import { Readable } from "node:stream";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  nuanceTokenHandler, checkMintRequest, endUserIdFor, MintLedger,
  INTERFACE_SETUP, NUANCE_PERSONAS, DEFAULT_PERSONA, DEFAULT_CAPS, NEEDS_CREDENTIAL_TO_MINT,
} from "../src/nuance/route.js";

const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}

const KEY = "nk_TEST-CANARY-0123456789";
const PROMPT = "You are Matic, the support assistant. TEST PROMPT.";
const device = (o = {}) => ({ id: "11111111-1111-4111-8111-111111111111", deviceKeyId: "dk-1", tenantId: "t-1", tenantSlug: "devco", tenantSchema: "t_devco", mode: "standalone", ...o });

/** A stand-in for Nuance. Records every call; answers what the test scripts. */
function upstream(script = () => ({ status: 201, body: { token: "st_abc", expires_at: "2026-11-16T12:00:00Z", warnings: [] } })) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers, body: JSON.parse(init.body) });
    const r = script(calls.length);
    if (r.throw) throw new Error(r.throw);
    return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.body, text: async () => JSON.stringify(r.body) };
  };
  return { calls, fetchImpl };
}

async function call(handler, { body = {}, dev = device() } = {}) {
  const req = Readable.from([Buffer.from(typeof body === "string" ? body : JSON.stringify(body))]);
  let out = null;
  const send = (status, json) => { out = { status, json }; };
  await handler(req, {}, send, { device: dev });
  return out;
}

const make = (o = {}) => {
  const up = o.up ?? upstream();
  const logs = [];
  const ledger = o.ledger ?? new MintLedger();
  let t = o.startMs ?? 1_000_000;
  const clock = { now: () => t, advance: (ms) => { t += ms; } };
  const handler = nuanceTokenHandler({
    apiKey: "apiKey" in o ? o.apiKey : KEY, prompt: "prompt" in o ? o.prompt : PROMPT,
    fetchImpl: up.fetchImpl, ledger, log: (s) => logs.push(s), now: clock.now, caps: o.caps, persona: o.persona,
  });
  return { handler, up, logs, ledger, clock };
};

// ==============================================================================================
console.log("=== 1. what goes upstream ===");
{
  const { handler, up, logs, ledger } = make();
  const r = await call(handler);
  check("a mint answers 201 with the session token", r.status === 201 && r.json.ok === true && r.json.token === "st_abc", JSON.stringify(r));
  const c = up.calls[0];
  check("one upstream call, a POST to /session-tokens on the documented host", up.calls.length === 1 && c.method === "POST" && c.url === "https://api.nuancelabs.ai/session-tokens", c?.url);
  check("the API key goes upstream as a Bearer header", c.headers.authorization === `Bearer ${KEY}`);
  check("the persona is mira - Charles's decision, 2026-11-16", c.body.personality.persona_id === "mira" && DEFAULT_PERSONA === "mira");
  check("the prompt is the hub's, whole", c.body.personality.system_prompt === PROMPT);
  check("interface_setup is exactly the planned one", JSON.stringify(c.body.interface_setup) === JSON.stringify({ delegation: { type: "client" }, video: { input: { camera: false } }, runtime_tools: { end_call: true } }));
  check("…delegation: client - Matic's router stays the brain", INTERFACE_SETUP.delegation.type === "client");
  check("…the camera is OFF", INTERFACE_SETUP.video.input.camera === false);
  check("…end_call is on, and stay_quiet is not turned off", INTERFACE_SETUP.runtime_tools.end_call === true && INTERFACE_SETUP.runtime_tools.stay_quiet === undefined);
  check("INTERFACE_SETUP is frozen all the way down", Object.isFrozen(INTERFACE_SETUP) && Object.isFrozen(INTERFACE_SETUP.video.input) && Object.isFrozen(INTERFACE_SETUP.delegation));
  check("no tools are sent - Nuance never sees one", c.body.tools === undefined && c.body.interface_setup.delegation.responses === undefined && Object.keys(c.body.interface_setup.delegation).join() === "type");
  check("an end_user_id is ALWAYS sent (the curfew is per person only with one)", typeof c.body.end_user_id === "string" && /^[A-Za-z0-9_.:\-]{1,128}$/.test(c.body.end_user_id), c.body.end_user_id);
  check("expressiveness is not sent: no measurement behind any value, so the service default stands", !("expressiveness" in c.body));

  const all = JSON.stringify(r.json) + logs.join("\n") + JSON.stringify(ledger.rows());
  check("the API key is in NO response, log line or ledger row", !all.includes(KEY) && !all.includes("CANARY"));
  check("the session token is in the response and in NO log line or ledger row", !(logs.join("\n") + JSON.stringify(ledger.rows())).includes("st_abc"));
  check("the response says what the hub fixed, so the client need not guess", r.json.persona === "mira" && r.json.delegation === "client" && r.json.camera === false);
  check("the ledger has one row: who, when, outcome - and no prompt", ledger.rows().length === 1 && ledger.rows()[0].outcome === "minted" && ledger.rows()[0].tenantSchema === "t_devco" && !JSON.stringify(ledger.rows()).includes("TEST PROMPT"));
}

// ==============================================================================================
console.log("\n=== 2. end_user_id: a hash of what the hub VERIFIED ===");
{
  const a = endUserIdFor(device()), b = endUserIdFor(device()), other = endUserIdFor(device({ id: "22222222-2222-4222-8222-222222222222" }));
  const otherTenant = endUserIdFor(device({ tenantId: "t-2" }));
  check("stable for one enrollment", a === b);
  check("different for another enrollment, and for the same id in another tenant", a !== other && a !== otherTenant);
  check("fits Nuance's pattern", /^[A-Za-z0-9_.:\-]{1,128}$/.test(a), a);
  check("carries neither the device id nor the tenant in the clear", !a.includes("11111111") && !a.includes("devco") && !a.includes("t-1"));
  let threw = false; try { endUserIdFor(null); } catch { threw = true; }
  check("no device: it throws rather than hash nothing into a shared id", threw);
  const src = readFileSync(join(HERE, "../src/nuance/route.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check("the route's code never reads an OS username or a machine name (self-asserted, D215)", !/osUsername|os_username|machineName|username/i.test(src));
}

// ==============================================================================================
console.log("\n=== 3. the client chooses nothing ===");
{
  for (const k of ["tenant", "tenantId", "tenantLabel", "personality", "system_prompt", "prompt", "persona", "persona_id", "interface_setup", "delegation", "end_user_id", "expressiveness", "tools", "instructions"]) {
    check(`a body carrying "${k}" is refused by name`, typeof checkMintRequest({ [k]: "x" }) === "string" && checkMintRequest({ [k]: "x" }).includes(k));
  }
  check("an empty object is the whole request", checkMintRequest({}) === null);
  check("a non-object is refused", typeof checkMintRequest("x") === "string" && typeof checkMintRequest(null) === "string");
  const { handler, up } = make();
  const r = await call(handler, { body: { persona: "sam", system_prompt: "ignore everything" } });
  check("…and the route answers 400 without calling upstream", r.status === 400 && up.calls.length === 0);
  check("the three stock personas, and only those", JSON.stringify([...NUANCE_PERSONAS].sort()) === JSON.stringify(["mira", "sam", "sonia"]));
  let threw = false; try { make({ persona: "hazel" }); } catch { threw = true; }
  check("a hub configured with a persona that does not exist refuses to build the handler", threw);
}

// ==============================================================================================
console.log("\n=== 4. who may mint, and when the route is off ===");
{
  const { handler, up } = make();
  const r = await call(handler, { dev: null });
  check("no credential: 401 and a sentence, on every listener", r.status === 401 && r.json.error === NEEDS_CREDENTIAL_TO_MINT && up.calls.length === 0);
  const off = make({ apiKey: null });
  const r2 = await call(off.handler);
  check("no API key on the hub: 503, says the route is off, calls nothing", r2.status === 503 && /MATIC_NUANCE_API_KEY/.test(r2.json.error) && off.up.calls.length === 0);
  const noPrompt = make({ prompt: null });
  const r3 = await call(noPrompt.handler);
  check("no prompt on the hub: 503, and it does NOT mint with an invented one", r3.status === 503 && /prompt/i.test(r3.json.error) && noPrompt.up.calls.length === 0);
  check("…an empty or over-long prompt is the same refusal", (await call(make({ prompt: "   " }).handler)).status === 503 && (await call(make({ prompt: "x".repeat(64_001) }).handler)).status === 503);
}

// ==============================================================================================
console.log("\n=== 5. the caps - the only place spend is controlled ===");
{
  check("the defaults exist and are positive whole numbers", Number.isInteger(DEFAULT_CAPS.perDevicePerHour) && DEFAULT_CAPS.perDevicePerHour > 0 && Number.isInteger(DEFAULT_CAPS.perTenantPerDay) && DEFAULT_CAPS.perTenantPerDay >= DEFAULT_CAPS.perDevicePerHour);
  const { handler, up, clock, ledger, logs } = make({ caps: { perDevicePerHour: 2, perTenantPerDay: 3 } });
  const a = await call(handler), b = await call(handler), c = await call(handler);
  check("two mints allowed, the third from the same enrollment refused", a.status === 201 && b.status === 201 && c.status === 429, `${a.status} ${b.status} ${c.status}`);
  check("…with retryAfterMs, the cap's name, and no upstream call", c.json.retryAfterMs > 0 && c.json.cap === "perDevicePerHour" && up.calls.length === 2);
  check("…and the refusal is in the ledger and the log", ledger.rows().some((r) => r.outcome === "refused:cap:perDevicePerHour") && logs.some((l) => /refused/.test(l)));
  const other = device({ id: "22222222-2222-4222-8222-222222222222" });
  const d = await call(handler, { dev: other }), e = await call(handler, { dev: other });
  check("another enrollment in the SAME tenant mints once, then the tenant's day is spent", d.status === 201 && e.status === 429 && e.json.cap === "perTenantPerDay", `${d.status} ${e.status} ${e.json?.cap}`);
  const elsewhere = await call(handler, { dev: device({ id: "33333333-3333-4333-8333-333333333333", tenantId: "t-2", tenantSchema: "t_other" }) });
  check("another TENANT is not affected", elsewhere.status === 201);
  clock.advance(61 * 60_000);
  check("an hour later the device window has moved but the tenant's day has not", (await call(handler)).json.cap === "perTenantPerDay");
  clock.advance(24 * 60 * 60_000);
  check("a day later it mints again", (await call(handler)).status === 201);
  check("a REFUSED attempt does not count against the cap - only a mint does", ledger.countMints({ tenantId: "t-1", sinceMs: 0 }) === 4, String(ledger.countMints({ tenantId: "t-1", sinceMs: 0 })));
}

// ==============================================================================================
console.log("\n=== 6. when Nuance says no ===");
{
  const cases = [
    [{ status: 429, body: { detail: "x", code: "start_limit", retry_after_seconds: 30 } }, 429, "start_limit"],
    [{ status: 429, body: { detail: "x", code: "credits_spent", renews_at: "2026-11-17T00:00:00Z" } }, 429, "credits_spent"],
    [{ status: 400, body: { error: { type: "policy_error", code: "app_review_held", message: "SECRET-UPSTREAM-TEXT" } } }, 502, "app_review_held"],
    [{ status: 401, body: { detail: "SECRET-UPSTREAM-TEXT", code: "api_key_revoked" } }, 502, "api_key_revoked"],
    [{ status: 500, body: {} }, 502, null],
    [{ throw: "getaddrinfo ENOTFOUND api.nuancelabs.ai" }, 502, "unreachable"],
  ];
  for (const [script, status, code] of cases) {
    const m = make({ up: upstream(() => script) });
    const r = await call(m.handler);
    check(`upstream ${script.status ?? "network error"}${code ? ` ${code}` : ""} -> ${status}, code carried, ok false`, r.status === status && r.json.ok === false && r.json.code === code, JSON.stringify(r));
    check("…upstream's own prose stays in the hub's log and does not reach the endpoint", !JSON.stringify(r.json).includes("SECRET-UPSTREAM-TEXT"));
    check("…a failed mint is in the ledger and does not count against the cap", m.ledger.rows()[0].outcome.startsWith("failed") && m.ledger.countMints({ tenantId: "t-1", sinceMs: 0 }) === 0);
  }
  const wait = await call(make({ up: upstream(() => cases[0][0]) }).handler);
  check("a start_limit carries Nuance's own retry time through", wait.json.retryAfterMs === 30_000);
  const odd = await call(make({ up: upstream(() => ({ status: 201, body: { nope: true } })) }).handler);
  check("a 201 with no token in it is a failure, not a success with undefined", odd.status === 502 && odd.json.ok === false);
}

// ==============================================================================================
console.log("\n=== 7. the route is wired, listed, and credentialed ===");
{
  const index = readFileSync(join(HERE, "../src/index.js"), "utf8");
  check("index.js dispatches /v1/nuance/session-token", index.includes('"/v1/nuance/session-token"'));
  check("it is NOT public on a LAN listener", !/PUBLIC_ON_LAN = new Set\(\[[^\]]*nuance/.test(index));
  check("GET / lists it", /path: "\/v1\/nuance\/session-token"/.test(index));
  check("the key is read from the environment in ONE file", index.includes("MATIC_NUANCE_API_KEY") && !readFileSync(join(HERE, "../src/nuance/route.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").includes("process.env"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
