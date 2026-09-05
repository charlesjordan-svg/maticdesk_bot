/**
 * HubClient - the third provider, and the property that matters most about it: tier-0 never goes
 * through it (D46b).
 *
 * Three halves:
 *
 *   A. Stubbed transport. Pins the wire shape (what the endpoint sends the hub: text, probe and ITS
 *      tool schemas), the Proposal it builds (`source: "hub"`, `hubProvider` kept as a claim), the
 *      one repair turn, the escalation-enum enforcement, and honest degradation. Must pass with no
 *      hub on the machine.
 *   B. Tier-0 with the hub STOPPED. An Agent wired to a HubClient pointing at a port nothing
 *      listens on resolves a printer complaint locally and never touches the network.
 *   C. A live turn against a running hub, skipped unless MATIC_HUB_URL is set and answers /v1/health.
 *
 * Run: node test/hub-client.test.mjs
 *      MATIC_HUB_URL=http://127.0.0.1:8787 node test/hub-client.test.mjs   (includes the live turn)
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { HubClient } from "../src/agent/hub-client.js";
import { Agent } from "../src/agent/agent.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(join(ROOT, "src/broker/catalog.json"), "utf8"));
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

/** A fake hub. Records requests, returns scripted /v1/turn responses in hub shape. */
function stubHub(responses) {
  const sent = [];
  const queue = [...responses];
  let last = responses.at(-1);
  const fetchImpl = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    const next = queue.length ? (last = queue.shift()) : last;
    if (next.throws) throw Object.assign(new Error(next.throws), { name: next.errorName ?? "Error" });
    return {
      status: next.status ?? 200,
      headers: { get: (h) => (h === "x-matic-hub-auth" ? "none" : null) },
      json: async () => next.body,
    };
  };
  return { sent, fetchImpl };
}
const hubCall = (name, args, over = {}) => ({
  body: { ok: true, hubProvider: "local", model: "stub-model", call: { id: "call_1", name, arguments: JSON.stringify(args) }, finishReason: "tool_calls", usage: { prompt_tokens: 100, completion_tokens: 20 }, ...over },
});
const client = (hub) => new HubClient({ hubUrl: "http://hub.test", capabilities, fetchImpl: hub.fetchImpl, onLog: () => {} });

console.log("=== A1. the endpoint sends the hub its sentence, its machine state and ITS tool schemas ===");
{
  const hub = stubHub([hubCall("restart_service", { serviceName: "spooler", reasoning: "Spooler looks stuck.", confidence: 0.9 })]);
  const res = await client(hub).propose("my printer is jammed in software", { probe: PROBE });
  check("one POST /v1/turn", hub.sent.length === 1 && hub.sent[0].url === "http://hub.test/v1/turn");
  const body = hub.sent[0].body;
  check("text and probe go up", body.text === "my printer is jammed in software" && body.probe.online === true);
  check("the endpoint's capabilities go up - the hub holds no catalog", Array.isArray(body.capabilities) && body.capabilities.map((c) => c.id).join(",") === capabilities.map((c) => c.id).join(","));
  check("no repair on a first turn", body.repair === undefined);
  check("a Proposal comes back with source hub", res.ok && res.proposal.source === "hub" && res.proposal.capabilityId === "restart_service" && res.proposal.parameters.serviceName === "spooler", JSON.stringify(res));
  check("hubProvider is carried as the hub's claim", res.proposal.hubProvider === "local");
  check("reasoning and confidence split out of the parameters", res.proposal.reasoning === "Spooler looks stuck." && res.proposal.confidence === 0.9 && !("reasoning" in res.proposal.parameters));
  check("meta records the hub's auth header", res.meta.hubAuth === "none" && res.meta.requests === 1);
}

console.log("=== A2. an unstated provider claim is null, never guessed ===");
{
  const hub = stubHub([hubCall("flush_dns", { reasoning: "r", confidence: 0.7 }, { hubProvider: undefined })]);
  const res = await client(hub).propose("web pages are slow", { probe: PROBE });
  check("hubProvider null when the hub did not say", res.ok && res.proposal.hubProvider === null, JSON.stringify(res.proposal));
}

console.log("=== A3. an INVALID capability proposal is passed through to be refused and audited by the broker ===");
{
  const hub = stubHub([hubCall("restart_service", { serviceName: "spooler; calc.exe", reasoning: "r", confidence: 1 })]);
  const res = await client(hub).propose("printer", { probe: PROBE });
  check("one repair turn was attempted", hub.sent.length === 2 && hub.sent[1].body.repair && Array.isArray(hub.sent[1].body.repair.violations));
  check("the repair carries the rejected call in OpenAI shape", hub.sent[1].body.repair.call.function.name === "restart_service" && typeof hub.sent[1].body.repair.call.function.arguments === "string");
  check("still-invalid parameters are passed through unrepaired", res.ok && res.proposal.parameters.serviceName === "spooler; calc.exe");
  check("meta says so", res.meta.repaired === true && res.meta.firstAttemptViolations.length > 0);
}

console.log("=== A4. a repair turn that fixes the output is used ===");
{
  const hub = stubHub([
    hubCall("escalate", { summary: "s", category: "Hardware", whatWasChecked: "w", suggestedOwner: "Adobe Support" }),
    hubCall("escalate", { summary: "s", category: "hardware", whatWasChecked: "w", suggestedOwner: "vendor" }),
  ]);
  const res = await client(hub).propose("my screen is cracked", { probe: PROBE });
  check("second answer used", res.ok && res.escalate && res.escalation.category === "hardware" && res.escalation.suggestedOwner === "vendor", JSON.stringify(res.escalation));
  check("no offList when the repair succeeded", res.escalation.offList === undefined);
}

console.log("=== A5. an off-list escalation owner is NOT repeated back, on the hub path too ===");
{
  const hub = stubHub([hubCall("escalate", { summary: "Licence expired.", category: "Software Licensing", whatWasChecked: "w", suggestedOwner: "Adobe Support" })]);
  const res = await client(hub).propose("adobe says my licence expired", { probe: PROBE });
  check("category falls back to other, owner to null", res.escalate && res.escalation.category === "other" && res.escalation.suggestedOwner === null);
  check("what the model said is kept in offList", res.escalation.offList?.suggestedOwner === "Adobe Support");
  check("the spoken line never names the invented owner", !/Adobe/.test(res.reply) && /let IT route it/.test(res.reply), res.reply);
  // D214. The wording above changed on 2026-09-04; these two pin the CONTRACT rather than the
  // phrasing, so the next rewording cannot quietly put the case note back in the avatar's mouth.
  check("D214: the assignee's case note is never spoken", !res.reply.includes(res.escalation.summary), res.reply);
  check("D214: and the line is an offer, so it ends in a question", res.reply.trim().endsWith("?"), res.reply);
}

console.log("=== A6. failures degrade honestly, they never throw ===");
{
  const r1 = await client(stubHub([{ status: 502, body: { ok: false, error: "the model returned no tool call (finish_reason stop).", hubProvider: "local", model: "m" } }])).propose("x", { probe: PROBE });
  check("hub 502 -> ok:false with the hub's error, and NOT a connection reason (the hub answered)", r1.ok === false && /no tool call/.test(r1.error) && r1.reason === undefined, JSON.stringify(r1));
  const r2 = await client(stubHub([{ throws: "fetch failed" }])).propose("x", { probe: PROBE });
  check("hub unreachable -> reason connection", r2.ok === false && r2.reason === "connection");
  const r3 = await client(stubHub([{ throws: "t", errorName: "TimeoutError" }])).propose("x", { probe: PROBE });
  check("hub timeout -> reason connection", r3.ok === false && r3.reason === "connection" && /did not answer/.test(r3.error));
  const r4 = await client(stubHub([hubCall("format_disk", { reasoning: "r", confidence: 1 })])).propose("x", { probe: PROBE });
  check("a capability the catalog does not have is refused here", r4.ok === false && /not in the catalog/.test(r4.error));
  const r5 = await client(stubHub([{ body: { ok: true, hubProvider: "local", model: "m", call: { id: "c", name: "flush_dns", arguments: "{not json" } } }])).propose("x", { probe: PROBE });
  check("unparseable arguments -> ok:false, nothing guessed", r5.ok === false && /not valid JSON/.test(r5.error));
  const none = new HubClient({ hubUrl: "", capabilities, onLog: () => {} });
  check("no hubUrl -> unavailable, no call", none.available === false && (await none.propose("x", { probe: PROBE })).ok === false);
}

console.log("=== B. TIER-0 NEVER ROUTES THROUGH THE HUB (D46b): printer complaint, hub process stopped ===");
{
  // A port nothing listens on, and a fetch that would fail loudly if it were ever called.
  let hubCalls = 0;
  const dead = new HubClient({
    hubUrl: "http://127.0.0.1:1",
    capabilities,
    onLog: () => {},
    fetchImpl: async () => { hubCalls++; throw Object.assign(new Error("ECONNREFUSED 127.0.0.1:1"), { name: "TypeError" }); },
  });
  const stubBroker = { validate: (p) => ({ ok: true, errors: [], capability: { id: p.capabilityId, tier: "R1", rollback: "n/a" } }) };
  const agent = new Agent({ broker: stubBroker, cloud: dead, onLog: () => {} });
  const svc = (name, stateName, canStop = true) => ({ name, stateName, canStop, controlsAccepted: canStop ? 0x1 : 0x58 });
  const routed = { index: 4, guid: "{TEST-GUID}", description: "Intel(R) Ethernet Controller I225-V", dhcpEnabled: true, ip: "192.168.50.20", hasIp: true, gateway: "192.168.50.1", hasGateway: true, isApipa: false, adminUp: true, linkUp: true };
  const probeWith = (spoolerState) => ({
    services: { spooler: svc("spooler", spoolerState), audiosrv: svc("audiosrv", "RUNNING"), dnscache: svc("dnscache", "RUNNING", false), dhcp: svc("dhcp", "RUNNING") },
    adapters: [routed], primary: [routed], actionable: [routed], online: true,
  });
  let probe = probeWith("STOPPED");
  agent.diagnose = () => ({ probe, summary: {}, identity: { computer: "TEST-PC", user: "tester" }, panel: {} });

  // The deterministic case: the spooler is OBSERVED stopped, tier-0 is confident (0.95), and the
  // sentence never leaves the machine - whichever provider is configured.
  const res = await agent.propose("my printer isn't working, nothing comes out");
  check("resolved locally: restart_service(spooler)", res.ok && res.proposal?.capabilityId === "restart_service" && res.proposal.parameters.serviceName === "spooler", JSON.stringify(res.proposal));
  check("source is tier0, not hub", res.proposal?.source === "tier0");
  check("the hub was never contacted", hubCalls === 0, `hub calls: ${hubCalls}`);

  // The educated-guess case, for the record: spooler RUNNING puts tier-0 at 0.7, under the 0.8
  // threshold, so the model IS consulted by design (tier0.js) - and with the hub down the agent
  // falls back to the tier-0 match rather than inventing anything. Not a D46b violation: D46b is
  // about tier-0 resolutions, and this one was not confident enough to be one.
  probe = probeWith("RUNNING");
  const guess = await agent.propose("my printer isn't working, nothing comes out");
  check("low-confidence tier-0 consults the hub once, by design", hubCalls === 1, `hub calls: ${hubCalls}`);
  check("...and with the hub down falls back to the tier-0 match, source tier0, never source hub", guess.ok && guess.proposal?.source === "tier0" && /not reachable/.test(guess.proposal.reasoning), JSON.stringify(guess.proposal));

  // And when tier-0 has nothing at all, the dead hub degrades honestly rather than crashing the
  // turn: whatever comes back is a local decision (tier0-state, or guidance, or an honest failure),
  // and never carries source "hub".
  const off = await agent.propose("my chair is broken and my monitor is cracked");
  check("off-script with the hub down: no proposal claims to have come from the hub", (off.proposal?.source ?? null) !== "hub" && hubCalls === 2, JSON.stringify({ ok: off.ok, source: off.proposal?.source ?? null, error: off.error, hubCalls }));
}

console.log("=== C. LIVE: a real turn through a running hub (skipped unless MATIC_HUB_URL answers) ===");
{
  const url = process.env.MATIC_HUB_URL;
  let health = null;
  if (url) { try { health = await (await fetch(`${url}/v1/health`, { signal: AbortSignal.timeout(2000) })).json(); } catch { health = null; } }
  if (!health?.ok) {
    console.log(`  SKIP  ${url ? `no hub answering at ${url}` : "MATIC_HUB_URL not set"}`);
  } else {
    console.log(`  hub: ${JSON.stringify(health.provider)} auth=${health.auth}`);
    const live = new HubClient({ hubUrl: url, capabilities, timeoutMs: 300000, onLog: (l) => console.log("       ", l) });
    const startedAt = Date.now();
    const res = await live.propose("the print spooler seems stuck, nothing prints", { probe: PROBE });
    console.log(`        ${Date.now() - startedAt} ms:`, JSON.stringify(res.proposal ?? res.escalation ?? res.error));
    check("live: a proposal or an escalation came back", res.ok === true, res.error);
    if (res.proposal) check("live: source hub with the hub's claim recorded", res.proposal.source === "hub" && ["local", "cloud", null].includes(res.proposal.hubProvider));
  }
}

// ==============================================================================================
console.log("\n=== ask(): POST /v1/ask, and the platform bug that only an end-to-end run found ===");
{
  const hub = stubHub([{ body: { ok: true, answered: true, reply: "Press Win + Shift + S.", citedArticleIds: ["keyboard-shortcuts-windows"], retrieval: { chunks: 3, rerankerPresent: false }, logId: 7 } }]);
  const r = await client(hub).ask("How do I take a screenshot?", { probe: { online: true, services: {}, adapters: [], primary: [] } });
  check("ask() posts to /v1/ask, not /v1/turn", hub.sent[0].url.endsWith("/v1/ask"), hub.sent[0].url);
  check("it returns the hub's answered flag, reply and citations",
    r.ok === true && r.answered === true && /Win \+ Shift \+ S/.test(r.reply) && r.citedArticleIds[0] === "keyboard-shortcuts-windows");
  check("the citation is a separate field and is NOT concatenated into the reply (H5)",
    !r.reply.includes("keyboard-shortcuts-windows"));

  // THE REGRESSION. probeMachine() returns no `platform`, so with the real probe the hub's
  // pre-filter admitted only `platform: "any"` articles and EVERY WINDOWS-ONLY ARTICLE WAS
  // INVISIBLE. "How do I take a screenshot" declined through the agent while answering through
  // curl, because curl was sending a platform by hand. Found by eval/e2e-ask.mjs, 2026-09-04.
  check("A PLATFORM IS ALWAYS SENT, even though probeMachine() does not supply one",
    hub.sent[0].body.probe?.platform === process.platform,
    JSON.stringify(hub.sent[0].body.probe));

  const noProbe = stubHub([{ body: { ok: true, answered: false, reply: "I don't have guidance on that.", citedArticleIds: [] } }]);
  await client(noProbe).ask("anything");
  check("…and with NO probe at all it still sends the platform",
    noProbe.sent[0].body.probe?.platform === process.platform,
    JSON.stringify(noProbe.sent[0].body.probe));

  const realPlatform = stubHub([{ body: { ok: true, answered: false, reply: "no", citedArticleIds: [] } }]);
  await client(realPlatform).ask("anything", { probe: { platform: "darwin" } });
  check("a probe that DOES carry a platform wins over process.platform",
    realPlatform.sent[0].body.probe.platform === "darwin",
    "so this fix disappears cleanly the day probeMachine() reports one");

  check("NO TENANT is ever sent - the hub 400s on one, and a client-supplied tenant would become the tenancy model",
    !("tenant" in hub.sent[0].body) && !("tenantId" in hub.sent[0].body) && !("tenantLabel" in hub.sent[0].body));
}
{
  const hub = stubHub([{ body: { ok: true, answered: false, reply: "I don't have company guidance covering that. I can raise a ticket.", citedArticleIds: [] } }]);
  const r = await client(hub).ask("How do I request a payroll adjustment?");
  check("A DECLINE IS ok:true WITH answered:false - not a failure (D205)",
    r.ok === true && r.answered === false && r.reply.length > 20);
}
{
  const hub = stubHub([{ status: 502, body: { ok: false, error: "the model returned nothing" } }]);
  const r = await client(hub).ask("x");
  check("a hub 5xx is ok:false with NO reason:connection - it is not evidence about this machine's network",
    r.ok === false && r.reason === undefined && /502/.test(r.error));
}
{
  const hub = stubHub([{ body: { ok: true, answered: true, reply: "   ", citedArticleIds: [] } }]);
  const r = await client(hub).ask("x");
  check("a 200 with an empty reply is a hub bug, not an answer - no prose is manufactured for it",
    r.ok === false && !r.reply);
}
{
  const dead = new HubClient({ hubUrl: "http://127.0.0.1:1", capabilities, timeoutMs: 500, onLog: () => {} });
  const r = await dead.ask("x");
  check("an unreachable hub is reason:connection and never throws", r.ok === false && r.reason === "connection");
}
{
  const none = new HubClient({ hubUrl: "", capabilities, onLog: () => {} });
  const r = await none.ask("x");
  check("no hub URL configured -> ok:false without a call", r.ok === false && /No hub URL/.test(r.error));
}

console.log(`\n${pass} passed, ${fail} failed`);
// exitCode rather than process.exit(): after a LIVE fetch, process.exit() on Windows trips a libuv
// teardown assertion (`!(handle->flags & UV_HANDLE_CLOSING)`, node 24) and exits 127. Letting the
// loop drain exits cleanly; nothing here holds the loop open.
process.exitCode = fail ? 1 : 0;
