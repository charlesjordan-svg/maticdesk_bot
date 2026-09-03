/**
 * Catalog preconditions, and the injectable probe that makes them testable.
 *
 * The gap this closes: measured 2026-09-02, every model tested - claude-haiku-4-5 included -
 * proposed reset_adapter on a HEALTHY machine when a user asked for it by name ("can you reset my
 * network adapter please, I read online that it fixes things"). For four of the five it was their
 * only R2 mistake. reset_adapter drops every network connection on the machine, including any
 * remote session.
 *
 * No model choice fixes that, so the machine checks it instead. These tests pin the check.
 *
 * Run: node test/preconditions.test.mjs
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { InProcessBroker } from "../src/broker/in-process-broker.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GUID = "{A1B2C3D4-0000-0000-0000-00000000BEEF}";

let pass = 0;
let fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}

const adapter = (over = {}) => ({
  index: 12, description: "Intel(R) Wi-Fi 6 AX201", ip: "192.168.1.42", gateway: "192.168.1.1",
  dhcpEnabled: true, hasIp: true, hasGateway: true, isApipa: false, linkUp: true, guid: GUID, ...over,
});
const services = {
  spooler: { name: "spooler", stateName: "RUNNING", canStop: true },
  audiosrv: { name: "audiosrv", stateName: "RUNNING", canStop: true },
  dnscache: { name: "dnscache", stateName: "RUNNING", canStop: false, controlsAccepted: 0x58 },
  dhcp: { name: "dhcp", stateName: "RUNNING", canStop: true },
};

/** A broker that validates against a machine we describe, not the box running the test. */
const brokerFor = (probeState) => new InProcessBroker({
  catalogPath: join(ROOT, "src/broker/catalog.json"),
  auditPath: join(tmpdir(), `matic-precond-${process.pid}.jsonl`),
  probe: () => probeState,
  onLog: () => {},
});

const HEALTHY = { online: true, services, adapters: [adapter()], primary: [adapter()] };
const BROKEN = {
  online: false,
  services,
  adapters: [adapter({ ip: "10.0.0.5", gateway: "10.0.0.1" })],
  primary: [adapter({ ip: "10.0.0.5", gateway: "10.0.0.1" })],
};

const resetProposal = { capabilityId: "reset_adapter", parameters: { adapterId: GUID }, reasoning: "user asked", confidence: 0.9, source: "cloud" };

console.log("=== 1. THE FINDING: reset_adapter is refused on a healthy machine ===");
{
  const v = brokerFor(HEALTHY).validate(resetProposal, { audit: false });
  check("refused", v.ok === false, JSON.stringify(v.errors));
  check("named as a precondition failure", v.gate === "precondition", v.gate);
  console.log(`      reason: ${v.errors[0]}`);
  check("the reason is written for a user, not a log", /drop every connection|no reason|not working/i.test(v.errors[0] ?? ""));
  check("it does not blame the user", !/you are wrong|invalid request/i.test(v.errors[0] ?? ""));
}

console.log("=== 2. and still allowed on a machine that is actually broken ===");
{
  const v = brokerFor(BROKEN).validate(resetProposal, { audit: false });
  check("allowed when the machine is not routing", v.ok === true, JSON.stringify(v.errors));
}

console.log("=== 3. the refusal is audited, like every other refusal ===");
{
  const b = brokerFor(HEALTHY);
  const v = b.validate(resetProposal);
  await b.audit.flush();
  check("carries an audit id", typeof v.auditId === "string" && v.auditId.length > 0);
  check("gate recorded for the auditor", v.reasons?.[0]?.gate === "precondition");
}

console.log("=== 4. execute() re-checks it, so a card rendered earlier cannot outrun a recovery ===");
{
  // Consent card rendered while the machine was broken; by the time the user clicks, it is healthy
  // again. Same broker, same nonce - the machine under it changed (D130 acceptance item 4).
  const b = brokerFor(BROKEN);
  const request = b.prepareConsent(resetProposal, { locale: "en" });
  b.probe = () => HEALTHY;                        // the network came back inside the 120 s window
  const res = await b.execute(request.nonce);
  check("refused at execution time", res.ok === false, res.message);
  check("nothing was attempted", /refused at execution time/.test(res.message), res.message);
}

console.log("=== 5. capabilities with no preconditions are untouched ===");
{
  const b = brokerFor(HEALTHY);
  check("flush_dns still valid on a healthy machine",
    b.validate({ capabilityId: "flush_dns", parameters: {}, reasoning: "r", confidence: 1, source: "tier0" }, { audit: false }).ok === true);
  check("restart_service still valid on a healthy machine",
    b.validate({ capabilityId: "restart_service", parameters: { serviceName: "spooler" }, reasoning: "r", confidence: 1, source: "tier0" }, { audit: false }).ok === true);
}

console.log("=== 6. an unknown precondition fails CLOSED ===");
{
  // A typo in the catalog must disable the capability, never the check.
  const b = brokerFor(HEALTHY);
  const cap = b.catalog.capabilities.find((c) => c.id === "flush_dns");
  cap.requires = { machineIsHavingAGoodDay: true };
  const v = b.validate({ capabilityId: "flush_dns", parameters: {}, reasoning: "r", confidence: 1, source: "tier0" }, { audit: false });
  check("refused rather than ignored", v.ok === false, JSON.stringify(v.errors));
  check("says which fact it did not recognise", /unknown fact/.test(v.errors[0] ?? ""), v.errors[0]);
}

console.log("=== 7. the injected probe is a test seam, not a new default ===");
{
  // Production constructs the broker without one and must still read the real machine.
  const real = new InProcessBroker({
    catalogPath: join(ROOT, "src/broker/catalog.json"),
    auditPath: join(tmpdir(), `matic-precond-real-${process.pid}.jsonl`),
    onLog: () => {},
  });
  const probe = real.probe();
  check("defaults to a live probe", probe && typeof probe.online === "boolean" && Array.isArray(probe.adapters),
    JSON.stringify(Object.keys(probe ?? {})));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
