/**
 * End-to-end broker + agent + router test, headless (no Electron, no UI).
 * Run: node test/broker.test.mjs
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { InProcessBroker } from "../src/broker/in-process-broker.js";
import { Agent } from "../src/agent/agent.js";
import { probeMachine } from "../src/broker/capabilities/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lines = [];
const log = (l) => lines.push(l);

const broker = new InProcessBroker({
  catalogPath: join(ROOT, "src/broker/catalog.json"),
  auditPath: join(ROOT, "audit/audit.jsonl"),
  onLog: log,
});

// Cloud stub: this run has no API key, which is exactly the "cloud unavailable" path.
const cloud = { propose: async () => ({ ok: false, error: "no API key in this test run" }) };
const agent = new Agent({ broker, cloud, onLog: log });

let pass = 0;
let fail = 0;
function check(label, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label} ${extra}`);
  }
}

console.log("=== 1. tier-0 routes a printer complaint locally, with no cloud call ===");
const printer = await agent.propose("my printer isn't working, nothing comes out");
console.log("      proposal:", JSON.stringify(printer.proposal));
check("proposed restart_service", printer.proposal?.capabilityId === "restart_service");
check("targeted the spooler", printer.proposal?.parameters?.serviceName === "spooler");
check("source is tier0 (no cloud call)", printer.proposal?.source === "tier0");
check("broker validated it", printer.validation?.ok === true, JSON.stringify(printer.validation?.errors));

console.log("=== 2. broker REFUSES a policy-blocked proposal (dnscache cannot be stopped) ===");
const dnsProposal = {
  capabilityId: "restart_service",
  parameters: { serviceName: "dnscache" },
  reasoning: "pretend the model suggested this",
  confidence: 0.9,
  source: "cloud",
};
const dnsValidation = broker.validate(dnsProposal);
check("refused", dnsValidation.ok === false);
console.log("      reason:", dnsValidation.errors[0]);
check("refusal explains why", /does not accept stop requests|flush_dns/.test(dnsValidation.errors[0] ?? ""));

console.log("=== 3. off-enum parameter is rejected before any Win32 call ===");
const injection = broker.validate({
  capabilityId: "restart_service",
  parameters: { serviceName: "spooler; calc.exe" },
  reasoning: "x", confidence: 1, source: "cloud",
});
check("rejected", injection.ok === false);
console.log("      reason:", injection.errors[0]);

console.log("=== 4. unknown capability is rejected ===");
const unknown = broker.validate({ capabilityId: "format_disk", parameters: {}, reasoning: "x", confidence: 1, source: "cloud" });
check("rejected", unknown.ok === false);
console.log("      reason:", unknown.errors[0]);

console.log("=== 5. execution without a consent nonce does nothing ===");
const noConsent = await broker.execute(null);
check("refused", noConsent.ok === false);
check("audited anyway", Boolean(noConsent.auditId));
console.log("      message:", noConsent.message);
const forged = await broker.execute("00000000-0000-4000-8000-000000000000");
check("a nonce the broker never issued is refused", forged.ok === false, forged.message);

console.log("=== 6. the broker runs what IT retained - the agent's copy of the proposal is not consulted (D130) ===");
const flush = { capabilityId: "flush_dns", parameters: {}, reasoning: "clear stale DNS", confidence: 0.9, source: "tier0" };
const request = broker.prepareConsent(flush, { locale: "en" });
check("a nonce came back, not a token", typeof request.nonce === "string" && request.nonce.length > 20 && !("proposalHash" in request));
check("the broker rendered the card", request.rendered.detail === "flush_dns()" && /Permission needed/.test(request.rendered.title), JSON.stringify(request.rendered));
// The old attack, in-process form: change the proposal AFTER the card was rendered. If the broker
// had kept a reference to this object rather than a copy, restart_service(spooler) would run under
// a card that said flush_dns (attack notes F1).
flush.capabilityId = "restart_service";
flush.parameters = { serviceName: "spooler" };

console.log("=== 7. REAL EXECUTION: flush_dns with valid consent (works unelevated) ===");
const realExec = await broker.execute(request.nonce);
console.log("      message:", realExec.message);
console.log("      detail: ", JSON.stringify(realExec.detail));
check("executed for real", realExec.ok === true, realExec.message);
check("executed the RETAINED proposal, not the mutated one", realExec.capabilityId === "flush_dns", realExec.capabilityId);
check("wrote an audit record", Boolean(realExec.auditId));

const reuse = await broker.execute(request.nonce);
check("the same nonce cannot be used twice", reuse.ok === false);
console.log("      message:", reuse.message);

console.log("=== 8. privileged action unelevated surfaces as 'needs the broker', not a user error ===");
const spooler = { capabilityId: "restart_service", parameters: { serviceName: "spooler" }, reasoning: "x", confidence: 1, source: "tier0" };
const spoolerValidation = broker.validate(spooler);
if (!spoolerValidation.ok) {
  console.log("      (skipped - spooler is not currently restartable:", spoolerValidation.errors[0], ")");
} else {
  const spoolerRequest = broker.prepareConsent(spooler, { locale: "en" });
  const spoolerExec = await broker.execute(spoolerRequest.nonce);
  console.log("      ok:", spoolerExec.ok, " needsBroker:", spoolerExec.needsBroker);
  console.log("      message:", spoolerExec.message);
  if (process.env.MATIC_ELEVATED === "1") {
    check("succeeded when elevated", spoolerExec.ok === true, spoolerExec.message);
  } else {
    check("reported as needing the broker (not as a user error)", spoolerExec.needsBroker === true, spoolerExec.message);
  }
}

console.log("=== 9. tier-0 network routing reflects live adapter state ===");
const probe = probeMachine();
const net = await agent.propose("I have no internet, web pages won't load");
console.log(`      machine online=${probe.online} -> proposed ${net.proposal?.capabilityId ?? net.error}`);
check("produced a network-related proposal or an honest failure",
  ["flush_dns", "renew_dhcp", "reset_adapter"].includes(net.proposal?.capabilityId) || net.ok === false);

console.log("=== 10. an unmatched complaint does not invent a capability ===");
const weird = await agent.propose("my chair is broken and my monitor is cracked");
check("no proposal invented", !weird.proposal, JSON.stringify(weird.proposal));
console.log("      reply:", weird.reply);

console.log(`\n${pass} passed, ${fail} failed`);
console.log("\n--- broker log ---");
for (const l of lines) console.log(l);
process.exit(fail ? 1 : 0);
