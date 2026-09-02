/**
 * Agent wiring tests, with a STUB cloud and a STUB broker.
 *
 * The router itself is covered by router.test.mjs against synthetic machine states. What this
 * file covers is the thing that actually breaks on stage: which of the three routing paths the
 * agent picks, and whether it ever gives the user nothing.
 *
 * The stub cloud is what makes the cable-out case testable without a cable. `failing` returns the
 * same shape CloudClient returns for an unreachable model, and `spy` records whether it was
 * called at all - because on an offline machine it must NOT be.
 *
 * Run: node test/agent.test.mjs
 */
import { Agent } from "../src/agent/agent.js";

let pass = 0;
let fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}

// Accepts anything. The real broker's validation is broker.test.mjs's job; here it would only
// couple these assertions to whatever adapters happen to exist on the machine running them.
const stubBroker = {
  validate: (proposal) => ({ ok: true, errors: [], capability: { id: proposal.capabilityId, tier: "R1", rollback: "n/a" } }),
};

function stubCloud({ ok = false, error = "Could not reach the model - this machine may be offline." } = {}) {
  const calls = [];
  return {
    calls,
    available: true,
    async propose(text) { calls.push(text); return ok ? { ok: true, proposal: { capabilityId: "flush_dns", parameters: {}, reasoning: "cloud", confidence: 0.9, source: "cloud" }, reply: "cloud reply" } : { ok: false, error }; },
  };
}

// The agent reads real machine state through probeMachine(), which needs no elevation but does
// describe THIS box. Overriding diagnose() is how a synthetic machine gets in.
function agentOn(probe, cloud) {
  const agent = new Agent({ broker: stubBroker, cloud, onLog: () => {} });
  agent.diagnose = () => ({
    probe,
    summary: {
      online: probe.online ? "yes" : "no",
      adapter: probe.primary[0]?.description ?? "none",
      ip: probe.primary[0]?.ip ?? "-",
      gateway: probe.primary[0]?.gateway ?? "-",
      spooler: probe.services.spooler?.stateName ?? "?",
      audio: probe.services.audiosrv?.stateName ?? "?",
      dhcp: probe.services.dhcp?.stateName ?? "?",
    },
  });
  return agent;
}

const svc = (name, stateName, canStop = true) => ({ name, stateName, canStop, controlsAccepted: canStop ? 0x1 : 0x58 });
const adapter = (o) => ({
  index: 4, guid: "{TEST-GUID}", description: "Intel(R) Ethernet Controller I225-V",
  dhcpEnabled: true, ip: "", mask: "", gateway: "", dhcpServer: "",
  hasIp: false, isApipa: false, hasGateway: false, adminUp: true, linkUp: true, ...o,
});
function probe({ adapters = [], services = {}, online = false }) {
  return {
    services: { spooler: svc("spooler", "RUNNING"), audiosrv: svc("audiosrv", "RUNNING"), dnscache: svc("dnscache", "RUNNING", false), dhcp: svc("dhcp", "RUNNING"), ...services },
    adapters,
    primary: adapters.filter((a) => a.dhcpEnabled && a.hasGateway),
    actionable: adapters.filter((a) => a.dhcpEnabled && (a.linkUp || a.hasGateway)),
    online,
  };
}

const routed = adapter({ ip: "192.168.50.20", hasIp: true, gateway: "192.168.50.1", hasGateway: true });
const cableOut = probe({ adapters: [adapter({ ip: "169.254.10.22", hasIp: true, isApipa: true })], online: false });

console.log("=== an offline machine must not wait on a cloud that cannot answer ===");
{
  // A blackholed connection hangs for the full TCP timeout on every retry. On stage that is dead
  // air on the one scenario the whole demo rests on, so the call is not attempted at all.
  const cloud = stubCloud();
  const res = await agentOn(cableOut, cloud).propose("I have no internet");
  check("no cloud call is attempted while the machine is not routing", cloud.calls.length === 0, `${cloud.calls.length} calls`);
  check("the keyword match still lands", res.proposal?.capabilityId === "renew_dhcp", JSON.stringify(res.proposal));
  check("and it is labelled as a tier-0 match", res.proposal?.source === "tier0", res.proposal?.source);
}

console.log("=== off-script, cable out: a proposal rather than silence ===");
{
  // The Day-4 exit criterion, end to end through the agent.
  const offScript = ["this thing is useless", "nothing works", "help", "it is broken again", "why is this so slow"];
  let covered = 0;
  for (const text of offScript) {
    const res = await agentOn(cableOut, stubCloud()).propose(text);
    if (res.ok && res.proposal?.capabilityId === "renew_dhcp" && res.proposal.source === "tier0-state") covered++;
    else console.log(`        MISS: "${text}" -> ${JSON.stringify(res.proposal ?? res.error)}`);
  }
  check(`all ${offScript.length} off-script complaints produce a state-only proposal`, covered === offScript.length, `${covered} covered`);

  const res = await agentOn(cableOut, stubCloud()).propose("help");
  check("the reply is honest that it did not understand the words", /didn't catch/i.test(res.reply ?? ""), res.reply);
  check("the proposal is still validated by the broker before it is shown", res.validation?.ok === true);
}

console.log("=== the state-only path never runs while the model is reachable ===");
{
  const cloud = stubCloud({ ok: true });
  const res = await agentOn(probe({ adapters: [routed], online: true }), cloud).propose("this thing is useless");
  check("the cloud is asked when the machine is routing", cloud.calls.length === 1);
  check("and its answer is used, not the state fallback", res.proposal?.source === "cloud", res.proposal?.source);
}
{
  // Cloud reachable but erroring - e.g. the API key was rejected. The fallback covers it.
  const cloud = stubCloud({ error: "The API key was rejected." });
  const res = await agentOn(probe({ adapters: [routed], online: true, services: { spooler: svc("spooler", "STOPPED") } }), cloud).propose("this thing is useless");
  check("a rejected key still leaves the stopped spooler fixable", res.proposal?.parameters.serviceName === "spooler", JSON.stringify(res.proposal));
  check("labelled tier0-state, so the UI does not claim no cloud call was made", res.proposal?.source === "tier0-state");
}

console.log("=== nothing is invented when there is genuinely no lever ===");
{
  // Disabling the only NIC removes it from GetAdaptersInfo entirely: not routing, no adapter to
  // act on, no service down. The honest answer names the state and stops.
  const res = await agentOn(probe({ adapters: [], online: false }), stubCloud()).propose("help");
  check("no proposal is returned", res.ok === false && !res.proposal, JSON.stringify(res.proposal));
  check("the reply says what was actually observed", /not routing/i.test(res.reply ?? ""), res.reply);
  check("the reply does not pretend a fix exists", !/I can (restart|renew|reset|flush)/i.test(res.reply ?? ""), res.reply);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
