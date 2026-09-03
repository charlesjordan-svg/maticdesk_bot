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
    async propose(text, ctx) { calls.push(text); this.lastContext = ctx; return ok ? { ok: true, proposal: { capabilityId: "flush_dns", parameters: {}, reasoning: "cloud", confidence: 0.9, source: "cloud" }, reply: "cloud reply" } : { ok: false, error }; },
  };
}

// The agent reads real machine state through probeMachine(), which needs no elevation but does
// describe THIS box. Overriding diagnose() is how a synthetic machine gets in.
function agentOn(probe, cloud) {
  const agent = new Agent({ broker: stubBroker, cloud, onLog: () => {} });
  const summary = {
    online: probe.online ? "yes" : "no",
    adapter: probe.primary[0]?.description ?? "none",
    ip: probe.primary[0]?.ip ?? "-",
    gateway: probe.primary[0]?.gateway ?? "-",
    spooler: probe.services.spooler?.stateName ?? "?",
    audio: probe.services.audiosrv?.stateName ?? "?",
    dhcp: probe.services.dhcp?.stateName ?? "?",
  };
  const identity = { computer: "TEST-PC", user: "tester" };
  agent.diagnose = () => ({ probe, summary, identity, panel: { ...identity, ...summary } });
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
  // Every NIC disabled: they vanish from GetAdaptersInfo entirely (measured 2026-09-02).
  const res = await agentOn(probe({ adapters: [], online: false }), stubCloud()).propose("help");
  check("no proposal is returned", res.ok === false && !res.proposal, JSON.stringify(res.proposal));
  check("guidance is returned instead of silence", Boolean(res.guidance));
  check("it says it cannot see an adapter at all", /cannot see a network adapter/i.test(res.reply ?? ""), res.reply);
  check("it does not pretend a fix exists", !/I can (restart|renew|reset|flush)/i.test(res.reply ?? ""), res.reply);
  check("checking the adapter is not disabled comes first", /disabled/i.test(res.guidance.checks[0].label), JSON.stringify(res.guidance.checks[0]));
}
{
  // The real thing, reproduced: Ethernet unplugged and Wi-Fi switched off, 2026-09-02.
  //
  // The Wi-Fi entry is the trap. Windows keeps its gateway after the radio goes off, so it stays
  // in `actionable` while having no link and no address - and the router used to propose renewing
  // a lease on it, or resetting it. Neither can work: there is no radio.
  const ethUnplugged = adapter({ index: 4, guid: "{E}", ip: "0.0.0.0", linkUp: false });
  const wifiRadioOff = adapter({
    index: 9, guid: "{W}", description: "Intel(R) Wi-Fi 6 AX200 160MHz",
    ip: "0.0.0.0", linkUp: false, hasGateway: true,
  });
  const dead = probe({ adapters: [ethUnplugged, wifiRadioOff], online: false });
  check("the stale-gateway adapter is still in actionable (the trap is real)",
    dead.actionable.some((a) => a.index === 9), JSON.stringify(dead.actionable.map((a) => a.index)));

  const res = await agentOn(dead, stubCloud()).propose("I have no internet");
  check("no lease is renewed on an adapter with no link", res.proposal?.capabilityId !== "renew_dhcp", JSON.stringify(res.proposal));
  check("no adapter is reset when there is no link to restore", res.proposal?.capabilityId !== "reset_adapter", JSON.stringify(res.proposal));
  check("no proposal at all", !res.proposal, JSON.stringify(res.proposal));
  check("guidance is given", Boolean(res.guidance));
  check("it names the link as the problem", /Nothing on this machine has a network link/i.test(res.reply ?? ""), res.reply);
  check("it tells the user to check the cable", res.guidance.checks.some((c) => /cable/i.test(c.label)));
  check("and to check the radio", res.guidance.checks.some((c) => /Airplane Mode/i.test(c.detail)));
  check("it does not claim to have done anything", !/I (restarted|renewed|reset|flushed)/i.test(res.reply ?? ""), res.reply);
  check("every check has a short label and a detail, so it can be scanned",
    res.guidance.checks.every((c) => c.label && c.detail && c.label.length <= 40), JSON.stringify(res.guidance.checks));
  check("the guidance tells the user what to do next",
    /tell me/i.test(res.guidance.nextStep ?? ""), res.guidance.nextStep);
  check("the headline is one short sentence, not a paragraph",
    res.guidance.headline.length <= 70 && res.guidance.headline.split(". ").length === 1, res.guidance.headline);
  console.log("        " + res.reply);
  for (const c of res.guidance.checks) console.log("        " + c.label + " - " + c.detail);
}
{
  // Scenario 2 as it is actually demoed - lease released, link still up - must be unaffected.
  const res = await agentOn(probe({
    adapters: [adapter({ ip: "0.0.0.0" })], online: false,
  }), stubCloud()).propose("I have no internet");
  check("a live link with no lease still proposes renew_dhcp", res.proposal?.capabilityId === "renew_dhcp", JSON.stringify(res.proposal));
  check("and gives no guidance, because there is a real fix", !res.guidance);
}

console.log("=== the facts panel identifies the machine, and the cloud does not see it ===");
{
  const real = new Agent({ broker: stubBroker, cloud: stubCloud(), onLog: () => {} });
  const id = real.identify();
  check("a computer name is reported", typeof id.computer === "string" && id.computer.length > 0, JSON.stringify(id));
  check("a logged-in user is reported", typeof id.user === "string" && id.user.length > 0, JSON.stringify(id));
  console.log(`        computer=${id.computer}  user=${id.user}`);
}
{
  const res = await agentOn(probe({ adapters: [routed], online: true }), stubCloud({ ok: true })).propose("help");
  check("the panel carries the machine name", res.facts.computer === "TEST-PC", JSON.stringify(res.facts));
  check("and the logged-in user", res.facts.user === "tester", JSON.stringify(res.facts));
  check("identity comes before the diagnostics", Object.keys(res.facts)[0] === "computer", JSON.stringify(Object.keys(res.facts)));
}
{
  // The object handed to the cloud client must not carry who or where. A machine name and a
  // username are the customer's environment, not something the model needs to pick a service.
  const cloud = stubCloud({ ok: true });
  await agentOn(probe({ adapters: [routed], online: true }), cloud).propose("help");
  const sentSummary = cloud.lastContext?.summary ?? {};
  check("the cloud is given no computer name", !("computer" in sentSummary), JSON.stringify(sentSummary));
  check("the cloud is given no username", !("user" in sentSummary), JSON.stringify(sentSummary));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
