// @ts-check
/**
 * End to end, headless: hub provider AND two-step consent on the same turn (follow-ups handover Q7).
 *
 * What is real: the shipping Agent, the shipping HubClient against a RUNNING B0 hub (which calls a
 * real model), the shipping InProcessBroker with the real catalog and gates, the real audit log,
 * and the two-step consent exchange exactly as main.js drives it. What is stubbed: the executors
 * (recorded, not run - nothing on this box is touched) and the machine (an injected probe, so the
 * three demo scenarios can be staged from any desk). What is NOT here: the renderer and the avatar.
 * This is every step of a demo turn except the pixels and the elevation; run the Electron app for those.
 *
 * Run (from client/, with the hub up):
 *   MATIC_HUB_URL=http://127.0.0.1:8787 node eval/e2e-hub-consent.mjs
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { InProcessBroker } from "../src/broker/in-process-broker.js";
import { HubClient } from "../src/agent/hub-client.js";
import { Agent } from "../src/agent/agent.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const hubUrl = process.env.MATIC_HUB_URL ?? "http://127.0.0.1:8787";
const scratch = mkdtempSync(join(tmpdir(), "matic-e2e-"));
const AUDIT = join(scratch, "audit.jsonl");

let pass = 0, fail = 0;
const check = (label, cond, extra = "") => { if (cond) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label} ${extra}`); } };

const health = await fetch(`${hubUrl}/v1/health`, { signal: AbortSignal.timeout(3000) }).then((r) => r.json()).catch(() => null);
if (!health?.ok) { console.error(`no hub answering at ${hubUrl} - start it with: cd server && npm.cmd start`); process.exit(2); }
console.log(`hub: ${JSON.stringify(health.provider)} auth=${health.auth}`);

// ---- the machines the three demo scenarios describe ----
const GUID = "{A1B2C3D4-0000-0000-0000-00000000BEEF}";
const svc = (name, stateName, canStop = true) => ({ name, stateName, canStop, controlsAccepted: canStop ? 0x1 : 0x58 });
const adapter = (o) => ({ index: 12, guid: GUID, description: "Intel(R) Wi-Fi 6 AX201", dhcpEnabled: true, ip: "192.168.1.42", gateway: "192.168.1.1", hasIp: true, hasGateway: true, isApipa: false, adminUp: true, linkUp: true, ...o });
const machine = ({ spooler = "RUNNING", online = true, adapters = [adapter({})] } = {}) => ({
  online,
  services: { spooler: svc("spooler", spooler), audiosrv: svc("audiosrv", "RUNNING"), dnscache: svc("dnscache", "RUNNING", false), dhcp: svc("dhcp", "RUNNING") },
  adapters, primary: adapters.filter((a) => a.hasGateway), actionable: adapters,
});
let probe = machine();

const executed = [];
const stub = (id) => async (params) => { executed.push({ id, params }); return { message: `[STUB] ${id} would run with ${JSON.stringify(params)}`, detail: { stub: true } }; };
const broker = new InProcessBroker({
  catalogPath: join(ROOT, "src/broker/catalog.json"),
  auditPath: AUDIT,
  probe: () => probe,
  executors: { restart_service: stub("restart_service"), flush_dns: stub("flush_dns"), renew_dhcp: stub("renew_dhcp"), reset_adapter: stub("reset_adapter") },
  onLog: () => {},
});
const hubLog = [];
const hub = new HubClient({ hubUrl, capabilities: broker.listCapabilities(), timeoutMs: 300000, onLog: (l) => hubLog.push(l) });
const agent = new Agent({ broker, cloud: hub, onLog: (l) => hubLog.push(l) });
// The Agent reads THIS box through probeMachine(); the injected machine goes in the same way agent.test.mjs does it.
agent.diagnose = () => ({ probe, summary: {}, identity: { computer: "E2E-PC", user: "tester" }, panel: {} });
const records = async () => { await broker.audit.flush(); return readFileSync(AUDIT, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); };

/** One demo turn, exactly as main.js + renderer.js drive it, minus the pixels. */
async function turn(label, text, { approve = true } = {}) {
  console.log(`\n=== ${label}: "${text}" ===`);
  const t0 = Date.now();
  const res = await agent.propose(text);
  console.log(`  propose -> ${res.ok ? `${res.proposal?.capabilityId ?? "(no proposal)"} source=${res.proposal?.source} hubProvider=${res.proposal?.hubProvider ?? "-"}` : `ok:false ${res.error ?? ""}`} (${Date.now() - t0} ms)`);
  if (res.escalation) { console.log(`  escalation: ${JSON.stringify(res.escalation)}`); return { res }; }
  if (!res.ok || !res.validation?.ok) { console.log(`  validation: ${JSON.stringify(res.validation?.errors ?? res.error)}`); return { res }; }
  // consent step 1 - what main.js's broker:prepareConsent does
  const request = broker.prepareConsent(res.proposal, { locale: "en-GB" });
  console.log(`  card (rendered by the broker): ${request.rendered.title} | ${request.rendered.detail}`);
  if (!approve) { console.log("  user: Deny -> nothing sent back to the broker"); return { res, request }; }
  // consent step 2 - what main.js's broker:execute does
  const exec = await broker.execute(request.nonce);
  console.log(`  execute(nonce) -> ok=${exec.ok} ${exec.capabilityId} auditId=${exec.auditId}`);
  const rec = (await records()).find((r) => r.auditId === exec.auditId);
  return { res, request, exec, rec };
}

// Scenario 1 - printer. Spooler STOPPED is tier-0's confident case and must never reach the hub;
// RUNNING is the educated guess that consults the model - here, the hub.
probe = machine({ spooler: "STOPPED" });
{
  const { res, exec, rec } = await turn("Scenario 1a (printer, spooler stopped)", "my printer isn't working, nothing comes out");
  check("tier-0 resolved it locally; the hub was not consulted", res.proposal?.source === "tier0" && !hubLog.some((l) => l.startsWith("[hub] chose")));
  check("two-step consent ran the retained proposal", exec?.ok && exec.capabilityId === "restart_service" && rec?.consentNonce && rec.consentRendered?.detail === "restart_service(serviceName=spooler)");
}
probe = machine({ spooler: "RUNNING" });
{
  const { res, exec, rec } = await turn("Scenario 1b (printer, spooler running -> hub)", "my printer isn't working, nothing comes out");
  check("the hub was consulted and answered with source hub", res.proposal?.source === "hub" && res.proposal.hubProvider === "local", JSON.stringify(res.proposal));
  check("the broker validated the hub's proposal from scratch", res.validation?.ok === true, JSON.stringify(res.validation?.errors));
  check("two-step consent: executed, audited with consentNonce + consentRendered", exec?.ok && rec?.consentNonce && rec.consentRendered && rec.consentTokenId, JSON.stringify(rec));
  check("the audit record says where the sentence went, and that the rest is the hub's claim", rec?.capabilityId === res.proposal.capabilityId && res.proposal.source === "hub" && "hubProvider" in res.proposal);
}

// Scenario 2 - network: cable out, APIPA address. The machine is offline so the agent must not call
// the hub at all; tier-0 proposes renew_dhcp from state.
probe = machine({ online: false, adapters: [adapter({ ip: "169.254.10.22", gateway: "", hasGateway: false, isApipa: true })] });
{
  const before = hubLog.length;
  const { res, exec, rec } = await turn("Scenario 2 (no internet, APIPA)", "I have no internet, web pages won't load");
  check("offline: the hub was not called", !hubLog.slice(before).some((l) => l.startsWith("[hub] chose") || /HTTP|Could not reach/.test(l)), hubLog.slice(before).join(" | "));
  check("tier-0 proposed renew_dhcp and consent ran it", res.proposal?.capabilityId === "renew_dhcp" && exec?.ok && rec?.consentRendered?.detail === "renew_dhcp(adapterIndex=12)", JSON.stringify(res.proposal));
}

// Scenario 3 - escalation through the hub: nothing in the catalog fixes a cracked screen.
probe = machine();
{
  const { res } = await turn("Scenario 3 (escalation via hub)", "my laptop screen is cracked and half of it is black");
  check("the hub's model escalated rather than bending a capability", res.escalation && res.error === "escalation", JSON.stringify(res.escalation ?? res.proposal));
  check("escalation enums held on the client side", ["hardware", "physical", "other", "needs_human_judgement", "account_or_licensing", "server_side_outage"].includes(res.escalation?.category));
}

// And the deny path, then a new question inside the window - the F2 case.
{
  const first = await turn("Deny, then ask again (F2 supersede)", "my printer isn't working, nothing comes out", { approve: false });
  const second = await turn("...the next question", "web pages are really slow to load");
  const recs = await records();
  const superseded = recs.find((r) => r.consentNonce === first.request?.nonce && /superseded/.test(r.message ?? ""));
  check("the denied card was superseded and audited when the next card was rendered", Boolean(superseded), JSON.stringify(superseded));
  check("the next turn's consent worked normally", second.exec?.ok === true, second.exec?.message);
}

console.log(`\nexecutors touched nothing real; stub calls: ${executed.map((e) => e.id).join(", ")}`);
console.log(`hub lines: ${hubLog.filter((l) => l.startsWith("[hub]")).length}`);
console.log(`\n${pass} passed, ${fail} failed`);
rmSync(scratch, { recursive: true, force: true });
process.exitCode = fail ? 1 : 0;
