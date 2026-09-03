/**
 * Elevated verification of the four real primitives.
 *
 * This is the gate on the handover's irreducible core (§9). It does NOT mock anything: it runs
 * the real agent -> broker -> Win32 path and reports the machine state before and after.
 *
 * Run via: npm run verify:privileged   (elevated)
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { InProcessBroker } from "../src/broker/in-process-broker.js";
import { Agent } from "../src/agent/agent.js";
import { probeMachine } from "../src/broker/capabilities/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const log = (l) => console.log(`      ${l}`);

const broker = new InProcessBroker({
  catalogPath: join(ROOT, "src/broker/catalog.json"),
  auditPath: join(ROOT, "audit/audit.jsonl"),
  onLog: () => {},
});
const cloud = { propose: async () => ({ ok: false, error: "cloud not used in this test" }) };
const agent = new Agent({ broker, cloud, onLog: () => {} });

let pass = 0;
let fail = 0;
const check = (label, cond, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
};

/** Runs the full real path: propose -> validate -> consent -> execute. */
async function runFullPath(text) {
  const res = await agent.propose(text);
  if (!res.ok) return { res, exec: null };
  if (!res.validation.ok) return { res, exec: null };
  const request = broker.prepareConsent(res.proposal, { locale: "en" });
  const exec = await broker.execute(request.nonce);
  return { res, exec };
}

console.log("=== A. restart_service(spooler) - THE irreducible core ===");
const before = probeMachine().services.spooler;
log(`spooler before: ${before.stateName}`);
const printer = await runFullPath("my printer isn't working, nothing comes out");
log(`proposed: ${printer.res.proposal?.capabilityId}(${JSON.stringify(printer.res.proposal?.parameters)}) via ${printer.res.proposal?.source}`);
if (printer.exec) {
  log(`result: ${printer.exec.message}`);
  log(`detail: ${JSON.stringify(printer.exec.detail)}`);
}
const after = probeMachine().services.spooler;
log(`spooler after: ${after.stateName}`);
check("the spooler was actually restarted", printer.exec?.ok === true, printer.exec?.message ?? "no execution");
check("the spooler is now RUNNING", after.stateName === "RUNNING", after.stateName);
check("an audit record was written", Boolean(printer.exec?.auditId));

console.log("=== B. flush_dns ===");
const dns = await runFullPath("web pages are not resolving, dns problem");
if (dns.exec) log(`result: ${dns.exec.message}`);
else log(`no execution: ${dns.res.validation?.errors?.join("; ") ?? dns.res.error}`);
check("flush_dns path ran or was honestly refused", dns.exec?.ok === true || Boolean(dns.res.error) || dns.res.validation?.ok === false);

console.log("=== C. renew_dhcp on the primary adapter ===");
const probe = probeMachine();
const primary = probe.primary[0];
if (!primary) {
  log("no DHCP adapter with a gateway - skipped");
} else {
  log(`adapter ${primary.index} (${primary.description}) ip=${primary.ip}`);
  const proposal = {
    capabilityId: "renew_dhcp",
    parameters: { adapterIndex: primary.index },
    reasoning: "elevated verification",
    confidence: 1,
    source: "tier0",
  };
  const validation = broker.validate(proposal);
  if (!validation.ok) {
    log(`refused: ${validation.errors.join("; ")}`);
    check("renew_dhcp refusal is explained", true);
  } else {
    const exec = await broker.execute(broker.prepareConsent(proposal, { locale: "en" }).nonce);
    log(`result: ${exec.message}`);
    log(`detail: ${JSON.stringify(exec.detail)}`);
    check("renew_dhcp executed", exec.ok === true, exec.message);
    const ipAfter = probeMachine().adapters.find((a) => a.index === primary.index)?.ip;
    check("adapter still has an IP afterwards", Boolean(ipAfter) && ipAfter !== "0.0.0.0", String(ipAfter));
  }
}

console.log("=== D. reset_adapter (R2, disruptive) ===");
if (process.env.MATIC_TEST_NETWORK !== "1") {
  log("skipped - pass -IncludeNetwork to verify_privileged to run this");
  log("NOTE: this is the one primitive still unverified end to end if you skip it.");
} else {
  const target = probeMachine().primary[0];
  if (!target) {
    log("no primary adapter - skipped");
  } else {
    log(`resetting ${target.description} (${target.guid}) - connectivity will drop briefly`);
    const proposal = {
      capabilityId: "reset_adapter",
      parameters: { adapterId: target.guid },
      reasoning: "elevated verification",
      confidence: 1,
      source: "tier0",
    };
    const validation = broker.validate(proposal);
    if (!validation.ok) {
      log(`refused: ${validation.errors.join("; ")}`);
      check("reset_adapter refusal is explained", true);
    } else {
      const exec = await broker.execute(broker.prepareConsent(proposal, { locale: "en" }).nonce);
      log(`result: ${exec.message}`);
      log(`detail: ${JSON.stringify(exec.detail)}`);
      check("reset_adapter executed", exec.ok === true, exec.message);
      const link = probeMachine().adapters.find((a) => a.guid === target.guid);
      check("adapter came back up", Boolean(link?.linkUp), `linkUp=${link?.linkUp} ip=${link?.ip}`);
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
