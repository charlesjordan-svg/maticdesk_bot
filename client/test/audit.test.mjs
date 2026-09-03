/**
 * Audit coverage of the PRE-CONSENT path.
 *
 * The gap this pins: audit records used to be written by execute() only, tied to a consent token,
 * so a refusal at validate() - including the dnscache policy block - left the log empty. A trail
 * that records what a privileged component did but not what it refused is one-sided, and denied
 * attempts are exactly where attacks and misconfigurations surface first.
 *
 * Writes to a scratch log, not audit/audit.jsonl, so it reads back exactly what this run wrote
 * and does not disturb a rehearsal trail.
 *
 * Run: node test/audit.test.mjs
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { InProcessBroker } from "../src/broker/in-process-broker.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "matic-audit-"));
const AUDIT = join(scratch, "audit.jsonl");

const broker = new InProcessBroker({
  catalogPath: join(ROOT, "src/broker/catalog.json"),
  auditPath: AUDIT,
  onLog: () => {},
});

let pass = 0;
let fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}

/** Every record written so far. Awaits the queued writes first - validate() queues, it does not await. */
async function readLog() {
  await broker.audit.flush();
  if (!existsSync(AUDIT)) return [];
  return readFileSync(AUDIT, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

const proposal = (capabilityId, parameters, source = "cloud") =>
  ({ capabilityId, parameters, reasoning: "test", confidence: 0.9, source });

console.log("=== 1. a proposal that passes validation writes NOTHING ===");
const okFlush = broker.validate(proposal("flush_dns", {}, "tier0"));
check("validated", okFlush.ok === true, JSON.stringify(okFlush.errors));
check("no audit record for a passing validation", (await readLog()).length === 0);

console.log("=== 2. the dnscache policy block is audited, and names the gate ===");
const dns = proposal("restart_service", { serviceName: "dnscache" });
const dnsResult = broker.validate(dns);
check("refused", dnsResult.ok === false);
check("refusal carries an audit id", typeof dnsResult.auditId === "string" && dnsResult.auditId.length > 0);

let log = await readLog();
check("exactly one record was written", log.length === 1, `got ${log.length}`);
const rec = log[0];
console.log("      record:", JSON.stringify(rec));
check("outcome is refused", rec.outcome === "refused", rec.outcome);
check("names the gate that fired", rec.gate === "policy-blocklist", rec.gate);
check("no consent token, explicitly", rec.consentTokenId === null);
check("capability id recorded", rec.capabilityId === "restart_service");
check("parameters recorded as proposed", rec.parameters?.serviceName === "dnscache");
check("proposal source recorded", rec.source === "cloud", rec.source);
check("tier recorded", rec.tier === "R1", rec.tier);
check("refusal reason recorded", /does not accept stop requests|flush_dns/.test(rec.message ?? ""));
check("reason is attributed to its gate", rec.reasons?.[0]?.gate === "policy-blocklist");
check("audit id matches the one returned to the caller", rec.auditId === dnsResult.auditId);
check("timestamp parses", Number.isFinite(Date.parse(rec.at ?? "")));

console.log("=== 3. each gate is distinguishable in the log ===");
// Schema: an off-enum service name, the injection gate.
const schemaRefusal = broker.validate(proposal("restart_service", { serviceName: "spooler; calc.exe" }));
// Catalog: something that is not a capability at all.
const catalogRefusal = broker.validate(proposal("format_disk", {}));
// Machine state: an adapter index that is not on this machine. Not a catalog rule - a live probe.
const stateRefusal = broker.validate(proposal("renew_dhcp", { adapterIndex: 999999 }));

check("schema refusal", schemaRefusal.gate === "schema", schemaRefusal.gate);
check("catalog refusal", catalogRefusal.gate === "catalog", catalogRefusal.gate);
check("state-derived refusal", stateRefusal.gate === "machine-state", `${stateRefusal.gate}: ${stateRefusal.errors[0]}`);

log = await readLog();
check("all four refusals are on disk", log.length === 4, `got ${log.length}`);
check("gates recorded distinctly",
  log.map((r) => r.gate).join(",") === "policy-blocklist,schema,catalog,machine-state",
  log.map((r) => r.gate).join(","));
check("every refusal record is tokenless", log.every((r) => r.consentTokenId === null));

console.log("=== 4. one refusal produces one record, not one per internal re-check ===");
// execute() re-validates and prepareConsent() validates again. Neither may log a second time for
// the same user-visible refusal - the consent-gate record below is the one record for this path.
const before = (await readLog()).length;
const exec = await broker.execute(null);
check("execution refused", exec.ok === false);
log = await readLog();
check("execute added exactly one record", log.length === before + 1, `added ${log.length - before}`);
const execRec = log[log.length - 1];
check("execute-path consent refusal is attributed to the consent gate (D130)", execRec.gate === "consent", JSON.stringify(execRec));
check("and is tokenless", execRec.consentTokenId === null);

console.log("=== 5. the execute path still writes what it always wrote, plus the D130 fields ===");
const flush = proposal("flush_dns", {}, "tier0");
const request = broker.prepareConsent(flush, { locale: "en" });
const ran = await broker.execute(request.nonce);
check("flush_dns executed", ran.ok === true, ran.message);
log = await readLog();
const success = log[log.length - 1];
console.log("      record:", JSON.stringify(success));
check("outcome is success (unchanged)", success.outcome === "success", success.outcome);
check("carries an internally minted consent token id", typeof success.consentTokenId === "string" && success.consentTokenId.length > 20);
check("carries the consent nonce (D130)", success.consentNonce === request.nonce);
check("carries what the broker rendered (D130)", success.consentRendered?.detail === "flush_dns()" && success.consentRendered?.title === request.rendered.title);
check("carries tier, duration and detail", success.tier === "R1" && typeof success.durationMs === "number" && success.detail !== undefined);
check("success records carry no gate", success.gate === undefined);
check("preparing consent did not add a record of its own", log.length === before + 2, `total ${log.length}`);

rmSync(scratch, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
