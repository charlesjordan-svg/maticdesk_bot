/**
 * The B0 hub, headless. A stub provider records what the hub sent it and returns what the test
 * scripts, so every assertion is about the HUB's behaviour: what it forwards, what it refuses to
 * repair, and how loudly it says it authenticated nobody.
 *
 * Run: node test/turn.test.mjs        (from server/)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHubServer, isLoopback, authenticate } from "../src/index.js";
import { checkTurnRequest, buildProviderInput } from "../src/turn.js";
import { systemPrompt, machineStateBlock } from "../../client/src/agent/prompt.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, "..");
const catalog = JSON.parse(readFileSync(join(SERVER, "../client/src/broker/catalog.json"), "utf8"));
const capabilities = catalog.capabilities;

let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}

const PROBE = {
  online: true,
  services: { spooler: { name: "spooler", stateName: "RUNNING", canStop: true }, dnscache: { name: "dnscache", stateName: "RUNNING", canStop: false } },
  adapters: [{ index: 12, description: "Intel Wi-Fi", ip: "192.168.1.42", gateway: "192.168.1.1", dhcpEnabled: true, hasIp: true, guid: "{GUID}" }],
  primary: [],
};

/** A provider that records the input and returns a scripted response. */
function stubProvider(script) {
  const seen = [];
  return {
    seen,
    name: "stub",
    model: "stub-model",
    async complete(input) {
      seen.push(input);
      const next = typeof script === "function" ? script(seen.length) : script;
      if (next.throws) throw Object.assign(new Error(next.throws), { name: next.errorName ?? "Error" });
      return { status: next.status ?? 200, body: next.body, ms: 1 };
    },
  };
}
const toolCallBody = (name, args, finish = "tool_calls") => ({
  choices: [{ finish_reason: finish, message: { tool_calls: [{ id: "call_1", type: "function", function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) } }] } }],
  usage: { prompt_tokens: 100, completion_tokens: 20 },
});

async function withServer(provider, fn) {
  const logs = [];
  const server = createHubServer({ provider, hubProvider: "local", log: (l) => logs.push(l) });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { return await fn(base, logs); } finally { await new Promise((r) => server.close(r)); }
}
const post = (base, body) => fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const turn = (over = {}) => ({ text: "my printer isn't working", probe: PROBE, capabilities, ...over });

console.log("=== 1. faithful pass-through: what the model said is what the endpoint gets ===");
await withServer(stubProvider({ body: toolCallBody("restart_service", { serviceName: "spooler", reasoning: "Spooler looks stuck.", confidence: 0.9 }) }), async (base) => {
  const res = await post(base, turn());
  const body = await res.json();
  check("200", res.status === 200, String(res.status));
  check("ok, with the hub's provider claim", body.ok === true && body.hubProvider === "local" && body.model === "stub-model", JSON.stringify(body));
  check("the tool call name comes through", body.call?.name === "restart_service");
  check("arguments are passed AS RETURNED - a JSON string, not parsed", typeof body.call?.arguments === "string" && JSON.parse(body.call.arguments).serviceName === "spooler");
  check("usage and finish reason ride along", body.usage?.prompt_tokens === 100 && body.finishReason === "tool_calls");
  check("every response says nobody was authenticated", res.headers.get("x-matic-hub-auth") === "none");
});

console.log("=== 2. the hub repairs NOTHING: an invalid argument goes through untouched ===");
await withServer(stubProvider({ body: toolCallBody("escalate", { summary: "x", category: "Hardware", whatWasChecked: "y", suggestedOwner: "Adobe Support" }) }), async (base) => {
  const body = await (await post(base, turn())).json();
  const args = JSON.parse(body.call.arguments);
  check("off-enum values are forwarded verbatim for the ENDPOINT to refuse", args.category === "Hardware" && args.suggestedOwner === "Adobe Support", JSON.stringify(args));
});

console.log("=== 3. malformed provider output is an error, not a guess ===");
await withServer(stubProvider({ body: { choices: [{ finish_reason: "stop", message: { content: "I think you should restart the spooler." } }] } }), async (base) => {
  const res = await post(base, turn());
  const body = await res.json();
  check("no tool call -> 502", res.status === 502, String(res.status));
  check("the error names the finish reason and guesses nothing", body.ok === false && /no tool call.*stop/.test(body.error) && body.call === undefined, JSON.stringify(body));
});
await withServer(stubProvider({ status: 500, body: { error: { message: "model not found" } } }), async (base) => {
  const res = await post(base, turn());
  const body = await res.json();
  check("provider HTTP error -> 502 with the provider's detail", res.status === 502 && /500.*model not found/.test(body.error), JSON.stringify(body));
});
await withServer(stubProvider({ throws: "fetch failed" }), async (base) => {
  const res = await post(base, turn());
  check("provider unreachable -> 502", res.status === 502, String(res.status));
});
await withServer(stubProvider({ throws: "timeout", errorName: "TimeoutError" }), async (base) => {
  const res = await post(base, turn());
  check("provider timeout -> 504", res.status === 504, String(res.status));
});

console.log("=== 4. the hub builds the prompt with the CLIENT'S prompt module, and the tool surface from what the endpoint sent ===");
{
  const provider = stubProvider({ body: toolCallBody("flush_dns", { reasoning: "r", confidence: 0.8 }) });
  await withServer(provider, async (base) => { await post(base, turn({ text: "web pages will not load" })); });
  const sent = provider.seen[0];
  check("system message IS systemPrompt(capabilities) from client/src/agent/prompt.js", sent.messages[0].role === "system" && sent.messages[0].content === systemPrompt(capabilities));
  check("user message IS machineStateBlock(probe) + the sentence", sent.messages[1].content === `${machineStateBlock(PROBE)}\n\nThe user says: web pages will not load`);
  check("tool surface = the endpoint's capabilities + escalate, nothing the hub invented",
    sent.tools.map((t) => t.function.name).join(",") === [...capabilities.map((c) => c.id), "escalate"].join(","), sent.tools.map((t) => t.function.name).join(","));
  // The hub's tool for renew_dhcp must carry the endpoint's own schema - `minimum: 0` included.
  const renew = sent.tools.find((t) => t.function.name === "renew_dhcp");
  check("the endpoint's parameter schema is forwarded intact", renew?.function.parameters.properties.adapterIndex.minimum === 0);
}

console.log("=== 5. a repair turn is appended exactly as the direct provider appends it ===");
{
  const provider = stubProvider({ body: toolCallBody("escalate", { summary: "x", category: "hardware", whatWasChecked: "y", suggestedOwner: "vendor" }) });
  await withServer(provider, async (base) => {
    const priorCall = { id: "call_1", type: "function", function: { name: "escalate", arguments: JSON.stringify({ category: "Hardware" }) } };
    const res = await post(base, turn({ repair: { call: priorCall, violations: ["escalate.category: \"Hardware\" is not one of the allowed values"] } }));
    check("repair turn accepted", res.status === 200, String(res.status));
  });
  const sent = provider.seen[0];
  check("assistant tool_call message precedes the rejection", sent.messages[2]?.role === "assistant" && sent.messages[2].tool_calls[0].id === "call_1");
  check("rejection is a tool message naming the violation and forbidding invented enums", sent.messages[3]?.role === "tool" && sent.messages[3].tool_call_id === "call_1" && /Rejected.*Hardware.*Do not invent enum values/.test(sent.messages[3].content));
}

console.log("=== 6. request validation - shape only ===");
await withServer(stubProvider({ body: toolCallBody("flush_dns", {}) }), async (base) => {
  check("no capabilities -> 400 (the hub holds no catalog to fall back on)", (await post(base, turn({ capabilities: [] }))).status === 400);
  check("no text -> 400", (await post(base, turn({ text: "" }))).status === 400);
  check("no probe -> 400", (await post(base, { text: "x", capabilities })).status === 400);
  check("not JSON -> 400", (await post(base, "{not json")).status === 400);
  check("GET /v1/turn -> 405", (await fetch(`${base}/v1/turn`)).status === 405);
  check("unknown route -> 404", (await fetch(`${base}/v1/nope`)).status === 404);
  const health = await (await fetch(`${base}/v1/health`)).json();
  check("health says what it is and that auth is none", health.phase?.includes("B0") && health.auth === "none");
});
check("checkTurnRequest rejects a capability without a schema", checkTurnRequest({ text: "x", probe: {}, capabilities: [{ id: "a" }] }) !== null);
check("buildProviderInput with no repair has exactly two messages", buildProviderInput(turn()).messages.length === 2);

console.log("=== 7. loopback only, and the auth hook authenticates nobody and says so ===");
check("127.0.0.1 is loopback", isLoopback("127.0.0.1") && isLoopback("::1") && isLoopback("::ffff:127.0.0.1"));
check("a LAN peer is not", !isLoopback("192.168.1.10") && !isLoopback(undefined));
const auth = authenticate({});
check("authenticate() returns mode none with no principal - the slot for D61/D132, not a start on it", auth.ok === true && auth.mode === "none" && auth.principal === null);

console.log("=== 8. the hub holds no catalog ===");
function walk(dir) { return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; }); }
const srcFiles = walk(join(SERVER, "src"));
check("no file under server/src reads catalog.json or imports broker/", srcFiles.every((f) => { const s = readFileSync(f, "utf8"); return !/catalog\.json|\/broker\//.test(s); }), srcFiles.join(", "));
check("server/src imports the client's prompt module rather than carrying its own", srcFiles.some((f) => /client\/src\/agent\/prompt\.js/.test(readFileSync(f, "utf8"))));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
