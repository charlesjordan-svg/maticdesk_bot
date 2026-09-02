/**
 * Tier-0 router tests against SYNTHETIC machine states.
 *
 * Why this file exists: the dev box is always online, so the router's offline branches - APIPA,
 * no-IP, has-IP-but-no-route - had never once executed. On the demo machine, with the cable out,
 * Scenario 2 takes one of those branches for the first time. Feeding the router fabricated probe
 * states exercises them deterministically, without needing to unplug anything.
 *
 * Run: node test/router.test.mjs
 */
import { routeTier0, TIER0_CONFIDENCE_THRESHOLD } from "../src/router/tier0.js";

let pass = 0;
let fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}

const svc = (name, stateName, canStop = true) => ({ name, stateName, canStop, controlsAccepted: canStop ? 0x1 : 0x58 });

/** Builds a probe shaped exactly like probeMachine() returns. */
function probe({ adapters = [], services = {}, online = false }) {
  const merged = {
    spooler: svc("spooler", "RUNNING"),
    audiosrv: svc("audiosrv", "RUNNING"),
    dnscache: svc("dnscache", "RUNNING", false),
    dhcp: svc("dhcp", "RUNNING"),
    ...services,
  };
  return {
    services: merged,
    adapters,
    primary: adapters.filter((a) => a.dhcpEnabled && a.hasGateway),
    actionable: adapters.filter((a) => a.dhcpEnabled && (a.linkUp || a.hasGateway)),
    online,
  };
}

const adapter = (o) => ({
  index: 4, guid: "{TEST-GUID}", description: "Intel(R) Ethernet Controller I225-V",
  dhcpEnabled: true, ip: "", mask: "", gateway: "", dhcpServer: "",
  hasIp: false, isApipa: false, hasGateway: false, adminUp: true, linkUp: true,
  ...o,
});

// A permanently-idle virtual adapter: DHCP-enabled, never has an IP, no link. This is the shape
// that previously fooled the router into proposing a DHCP renew on a Bluetooth PAN device.
const virtualAdapter = adapter({
  index: 13, guid: "{BT-PAN}", description: "Bluetooth Device (Personal Area Network)",
  ip: "0.0.0.0", linkUp: false,
});

console.log("=== Scenario 2 branches: the cable is out ===");

{
  // DHCP asked and nothing answered -> self-assigned address.
  const r = routeTier0("I have no internet", probe({
    adapters: [adapter({ ip: "169.254.10.22", hasIp: true, isApipa: true })],
    online: false,
  }));
  check("APIPA address proposes renew_dhcp", r?.proposal.capabilityId === "renew_dhcp", JSON.stringify(r?.proposal));
  check("APIPA targets the right adapter", r?.proposal.parameters.adapterIndex === 4);
  check("APIPA is confident enough to skip the cloud", (r?.proposal.confidence ?? 0) >= TIER0_CONFIDENCE_THRESHOLD);
  console.log(`        reply: ${r?.reply}`);
}

{
  // Link up, but no address at all.
  const r = routeTier0("wifi is not working", probe({
    adapters: [adapter({ ip: "0.0.0.0" })],
    online: false,
  }));
  check("no IP proposes renew_dhcp", r?.proposal.capabilityId === "renew_dhcp", JSON.stringify(r?.proposal));
  check("no IP skips the cloud", (r?.proposal.confidence ?? 0) >= TIER0_CONFIDENCE_THRESHOLD);
}

{
  // Addressed and routed on paper, but nothing actually gets out.
  const r = routeTier0("cannot connect to anything", probe({
    adapters: [adapter({ ip: "192.168.50.20", hasIp: true, gateway: "192.168.50.1", hasGateway: true })],
    online: false,
  }));
  check("address but no route proposes reset_adapter", r?.proposal.capabilityId === "reset_adapter", JSON.stringify(r?.proposal));
  check("reset_adapter is targeted by GUID, not index", r?.proposal.parameters.adapterId === "{TEST-GUID}");
  check("reset_adapter skips the cloud", (r?.proposal.confidence ?? 0) >= TIER0_CONFIDENCE_THRESHOLD);
  check("the reply warns that connections will drop", /drop/i.test(r?.reply ?? ""), r?.reply);
}

console.log("=== the online case must not reach for adapter surgery ===");
{
  const r = routeTier0("web pages are slow to load", probe({
    adapters: [adapter({ ip: "192.168.50.20", hasIp: true, gateway: "192.168.50.1", hasGateway: true })],
    online: true,
  }));
  check("online proposes flush_dns only", r?.proposal.capabilityId === "flush_dns", JSON.stringify(r?.proposal));
}

console.log("=== the virtual-adapter trap (regression) ===");
{
  // Online machine that also has an idle Bluetooth PAN adapter. The router must not "fix" it.
  const r = routeTier0("no internet", probe({
    adapters: [
      adapter({ ip: "192.168.50.20", hasIp: true, gateway: "192.168.50.1", hasGateway: true }),
      virtualAdapter,
    ],
    online: true,
  }));
  check("does not renew DHCP on an idle virtual adapter", r?.proposal.capabilityId === "flush_dns", JSON.stringify(r?.proposal));
}
{
  // Offline machine whose ONLY DHCP adapter is the idle virtual one - there is no local lever.
  const r = routeTier0("no internet", probe({ adapters: [virtualAdapter], online: false }));
  check("offline with only virtual adapters proposes nothing", r === null, JSON.stringify(r?.proposal));
}

console.log("=== Scenario 1 and the sound case ===");
{
  const r = routeTier0("my printer isn't working", probe({ services: { spooler: svc("spooler", "STOPPED") } }));
  check("stopped spooler proposes restart_service", r?.proposal.capabilityId === "restart_service");
  check("stopped spooler skips the cloud", (r?.proposal.confidence ?? 0) >= TIER0_CONFIDENCE_THRESHOLD);
}
{
  const r = routeTier0("my printer isn't working", probe({ services: { spooler: svc("spooler", "RUNNING") } }));
  check("running spooler still proposes a restart", r?.proposal.capabilityId === "restart_service");
  check("but defers to the cloud first (below threshold)", (r?.proposal.confidence ?? 1) < TIER0_CONFIDENCE_THRESHOLD,
    String(r?.proposal.confidence));
}
{
  const r = routeTier0("I have no sound", probe({ services: { audiosrv: svc("audiosrv", "STOPPED") } }));
  check("stopped audio proposes restart_service(audiosrv)",
    r?.proposal.capabilityId === "restart_service" && r?.proposal.parameters.serviceName === "audiosrv");
}

console.log("=== nothing is invented for an unrelated complaint ===");
for (const text of ["my chair is broken", "outlook keeps crashing", "I forgot my password"]) {
  const r = routeTier0(text, probe({ online: true }));
  check(`"${text}" produces no proposal`, r === null, JSON.stringify(r?.proposal));
}

console.log("=== phrasing robustness: nobody speaks from a script on stage ===");
{
  const offline = probe({ adapters: [adapter({ ip: "169.254.1.1", hasIp: true, isApipa: true })], online: false });
  const networkPhrasings = [
    "cannot connect to anything",
    "can not connect",
    "I can't connect",
    "my connection is dead",
    "I got disconnected",
    "the internet is down",
    "no network access",
    "wifi says no internet",
    "nothing loads in the browser",
    "this machine is offline",
  ];
  let ok = 0;
  for (const text of networkPhrasings) {
    const r = routeTier0(text, offline);
    if (r?.proposal.capabilityId === "renew_dhcp") ok++;
    else console.log(`        MISS: "${text}" -> ${r?.proposal.capabilityId ?? "no proposal"}`);
  }
  check(`all ${networkPhrasings.length} network phrasings route correctly`, ok === networkPhrasings.length, `${ok} matched`);

  const stopped = probe({ services: { spooler: svc("spooler", "STOPPED") } });
  const printerPhrasings = [
    "my printer isn't working",
    "nothing comes out of the printer",
    "cannot print",
    "the print queue is stuck",
    "printer shows offline",
    "print jobs just sit there",
  ];
  let pOk = 0;
  for (const text of printerPhrasings) {
    const r = routeTier0(text, stopped);
    if (r?.proposal.parameters.serviceName === "spooler") pOk++;
    else console.log(`        MISS: "${text}" -> ${r?.proposal.capabilityId ?? "no proposal"}`);
  }
  check(`all ${printerPhrasings.length} printer phrasings route correctly`, pOk === printerPhrasings.length, `${pOk} matched`);

  // "printer" must win over "connect" when both appear.
  const both = routeTier0("I can't connect to my printer", stopped);
  check("printer beats network when both keywords appear",
    both?.proposal.parameters.serviceName === "spooler", JSON.stringify(both?.proposal));
}

console.log("=== every proposal names a real capability with tier0 as its source ===");
const KNOWN = new Set(["restart_service", "flush_dns", "renew_dhcp", "reset_adapter"]);
const states = [
  probe({ adapters: [adapter({ ip: "169.254.1.1", hasIp: true, isApipa: true })] }),
  probe({ adapters: [adapter({ ip: "0.0.0.0" })] }),
  probe({ adapters: [adapter({ ip: "10.0.0.5", hasIp: true, gateway: "10.0.0.1", hasGateway: true })] }),
  probe({ services: { spooler: svc("spooler", "STOPPED") } }),
];
let allValid = true;
for (const p of states) {
  for (const text of ["no internet", "printer broken", "no sound"]) {
    const r = routeTier0(text, p);
    if (r && (!KNOWN.has(r.proposal.capabilityId) || r.proposal.source !== "tier0")) allValid = false;
  }
}
check("no proposal escapes the catalog or mislabels its source", allValid);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
