/**
 * End-to-end broker + agent + router test, headless (no Electron, no UI).
 * Run: node test/broker.test.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { InProcessBroker } from "../src/broker/in-process-broker.js";
import { Agent } from "../src/agent/agent.js";
import { probeMachine, describeAddress } from "../src/broker/capabilities/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Is this process elevated? Case 8 asserts opposite things either way, so guessing wrong makes
 * the suite fail for a reason that has nothing to do with the code.
 *
 * It used to trust `MATIC_ELEVATED` alone, which only `scripts/preflight.ps1` and
 * `scripts/verify-privileged.ps1` set. A bare `npm test` from an Administrator window therefore
 * took the unelevated branch, asserted "this should have needed the broker", watched the spooler
 * restart successfully, and failed - aborting the other eight test files, because the npm script
 * chains with `&&`. That happened, on the machine of the person the suite exists to serve.
 *
 * So: detect it. `fltmc` is a query that requires administrator and exits non-zero without it.
 * Run through `execFileSync` with no arguments and no shell - there is nothing to interpolate
 * here, and a test helper is a bad place to start a habit of building command strings.
 *
 * The environment variable still wins when set, so the two scripts above keep working and anyone
 * can force either branch.
 */
function isElevated() {
  if (process.env.MATIC_ELEVATED === "1") return true;
  if (process.env.MATIC_ELEVATED === "0") return false;
  if (process.platform !== "win32") return false;
  try {
    execFileSync("fltmc", [], { stdio: "ignore", windowsHide: true });
    return true;
  } catch {
    return false;
  }
}
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
// And the other direction (F1, second half): the ConsentRequest handed back must be a copy too. If
// the broker returned its own object, the agent could rewrite `rendered` after the fact and the
// audit record would say whatever the agent wanted the user to have seen.
const renderedAsIssued = JSON.stringify(request.rendered);
request.rendered.detail = "reset_adapter(adapterId=forged)";
request.rendered.title = "Permission needed — nothing at all";

console.log("=== 7. REAL EXECUTION: flush_dns with valid consent (works unelevated) ===");
const realExec = await broker.execute(request.nonce);
console.log("      message:", realExec.message);
console.log("      detail: ", JSON.stringify(realExec.detail));
check("executed for real", realExec.ok === true, realExec.message);
check("executed the RETAINED proposal, not the mutated one", realExec.capabilityId === "flush_dns", realExec.capabilityId);
check("wrote an audit record", Boolean(realExec.auditId));
await broker.audit.flush();
const realRecord = (await import("node:fs/promises")).readFile(join(ROOT, "audit/audit.jsonl"), "utf8")
  .then((t) => t.trim().split("\n").map((l) => JSON.parse(l)).find((r) => r.auditId === realExec.auditId));
const rec = await realRecord;
check("the audit record carries what the BROKER rendered, not the agent's rewritten copy",
  rec && JSON.stringify(rec.consentRendered) === renderedAsIssued && rec.consentRendered.detail === "flush_dns()", JSON.stringify(rec?.consentRendered));

const reuse = await broker.execute(request.nonce);
check("the same nonce cannot be used twice", reuse.ok === false);
console.log("      message:", reuse.message);

const elevated = isElevated();
console.log(`=== 8. privileged action ${elevated ? "ELEVATED succeeds" : "UNELEVATED surfaces as 'needs the broker', not a user error"} ===`);
console.log(`      (detected: ${elevated ? "elevated" : "not elevated"}${process.env.MATIC_ELEVATED ? " - forced by MATIC_ELEVATED" : ""})`);
const spooler = { capabilityId: "restart_service", parameters: { serviceName: "spooler" }, reasoning: "x", confidence: 1, source: "tier0" };
const spoolerValidation = broker.validate(spooler);
if (!spoolerValidation.ok) {
  console.log("      (skipped - spooler is not currently restartable:", spoolerValidation.errors[0], ")");
} else {
  const spoolerRequest = broker.prepareConsent(spooler, { locale: "en" });
  const spoolerExec = await broker.execute(spoolerRequest.nonce);
  console.log("      ok:", spoolerExec.ok, " needsBroker:", spoolerExec.needsBroker);
  console.log("      message:", spoolerExec.message);
  if (elevated) {
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
// This one assumes a HEALTHY machine, and says so rather than failing as though the code were
// wrong. With a demo fault injected - a stopped spooler, a released DHCP lease - the tier0-state
// path correctly proposes the fix for what it can see, which is the designed behaviour and not an
// invented capability. Diagnosing that from a bare "no proposal invented FAIL" cost real time.
const faulted = [];
const probe10 = broker.probe(); // synchronous, as in-process-broker.js calls it
if (probe10.services?.spooler && probe10.services.spooler.stateName !== "RUNNING") faulted.push("the spooler is stopped");
if (probe10.online === false) faulted.push("this machine is offline");
if (faulted.length > 0) {
  console.log(`      (skipped - ${faulted.join(" and ")}. A demo fault is injected, so tier0-state has`);
  console.log("       something real to propose. Run `npm.cmd run reset-demo` and re-run this suite.)");
} else {
  const weird = await agent.propose("my chair is broken and my monitor is cracked");
  check("no proposal invented", !weird.proposal, JSON.stringify(weird.proposal));
  console.log("      reply:", weird.reply);
}

// ==============================================================================================
console.log("=== 11. WHAT THE BROKER SAYS OUT LOUD, and what it keeps for the record (D247) ===");
//
// The renderer SPEAKS `ExecutionResult.message` on every path — success, failure, needs-broker and
// every consent-gate refusal. It used to carry the machine's own vocabulary into the avatar's
// mouth: `OpenServiceW(spooler) failed (Win32 error 5)`, `refused at execution time: capability
// "reset_adapter" …`, `no consent nonce was presented`. The diagnostics are not gone — they are on
// `detail` and in the audit record, which is where the question they answer gets asked.
//
// `validate().errors` is DELIBERATELY NOT on this list. Those strings name capability ids, adapter
// GUIDs and control masks on purpose — they are the gate explaining itself, they go to the
// inspector, and §2/§3/§4 above assert their content. What changed is that the renderer no longer
// interpolates one into `say()`.
{
  /** Anything that is ours rather than the user's: an API name, a key, a code, a GUID, an id. */
  const OURS = /\b(Win32|OpenServiceW|OpenSCManagerW|GetAdaptersInfo|IpRenewAddress|SetIfEntry|DnsFlushResolverCache)\b|\bnonce\b|0x[0-9a-f]+|\{[0-9A-Fa-f-]{8}|\b[a-z][a-z0-9]*_[a-z0-9_]+\b/;

  const spoken = [];
  spoken.push(["nothing presented", (await broker.execute(null)).message]);
  spoken.push(["a forged nonce", (await broker.execute("00000000-0000-4000-8000-000000000000")).message]);

  // A real run, whichever way it goes: flush_dns works unelevated, so this is the success line on
  // this machine and the failure line on one where it does not.
  const req = broker.prepareConsent({ capabilityId: "flush_dns", parameters: {}, reasoning: "r", confidence: 1, source: "tier0" }, { locale: "en" });
  const ran = await broker.execute(req.nonce);
  spoken.push([ran.ok ? "a successful run" : "a failed run", ran.message]);
  if (!ran.ok) {
    check("a failed run keeps the Win32 call site, in detail", typeof ran.detail?.win32 === "string", JSON.stringify(ran.detail));
  }

  for (const [label, line] of spoken) {
    check(`${label}: the spoken line names nothing of ours — "${String(line).slice(0, 44)}…"`,
      typeof line === "string" && line.length > 0 && !OURS.test(line), line);
  }

  // D250: the mechanism's NAME belongs to the catalog title and the inspector, not to the report a
  // user hears. "Flushed the DNS resolver cache" and "Renewed the DHCP lease" were the two, and the
  // catalog already had the user's version of each in `plain.what` — which is the text on the card
  // they read before agreeing, so the report now echoes what they approved.
  const JARGON = /\bDHCP\b|\bDNS\b|\bresolver\b|\blease\b|\bTCP\b|\bIP address\b|\bAPIPA\b/;
  {
    const flushed = await (async () => {
      const r = broker.prepareConsent({ capabilityId: "flush_dns", parameters: {}, reasoning: "r", confidence: 1, source: "tier0" }, { locale: "en" });
      return broker.execute(r.nonce);
    })();
    check("a successful flush is reported without naming the mechanism",
      !JARGON.test(flushed.message), flushed.message);
    check("…and it echoes the catalog's plain description, which is what the user approved",
      /website lookups|website-name lookups/i.test(flushed.message), flushed.message);
  }
  {
    // describeAddress feeds BOTH network capabilities' reports; all three of its phrases are spoken.
    const phrases = [
      describeAddress({ hasIp: true, isApipa: false, ip: "192.168.50.223" }).phrase,
      describeAddress({ hasIp: true, isApipa: true, ip: "169.254.17.252" }).phrase,
      describeAddress({ hasIp: false }).phrase,
    ];
    for (const p of phrases) check(`no mechanism named in: "${p.slice(0, 44)}…"`, !JARGON.test(p), p);
  }

  // And the service name: `spooler` is a registry key, and the report of a restart is spoken.
  const cap = JSON.parse(readFileSync(join(ROOT, "src/broker/catalog.json"), "utf8"))
    .capabilities.find((c) => c.id === "restart_service");
  check("the catalog carries a display name for every service in the enum (D247)",
    cap.parameters.properties.serviceName.enum.every((k) => typeof cap.plain?.serviceNames?.[k] === "string"),
    JSON.stringify(cap.plain?.serviceNames));
}

console.log("\n=== 12. the exact call, GLOSSED — the unit rules (D248) ===");
//
// `consent-surface.test.mjs` §4c asserts the gloss over the PIPE, which is what makes D248 a
// contract change. These are the rules that need an injectable probe and a capability the
// precondition gates would refuse there.
{
  const catalog = JSON.parse(readFileSync(join(ROOT, "src/broker/catalog.json"), "utf8"));
  const capOf = (id) => catalog.capabilities.find((c) => c.id === id);
  const GUID = "{45F2A1C0-1111-2222-3333-444455556666}";
  // A broker whose probe reports one adapter we can name, so the two live resolvers are exercised.
  const named = new InProcessBroker({
    catalogPath: join(ROOT, "src/broker/catalog.json"),
    auditPath: join(ROOT, "audit/audit.jsonl"),
    probe: () => ({
      services: {}, primary: [], actionable: [], online: true,
      adapters: [{ index: 12, guid: GUID, description: "Intel(R) Ethernet Controller (2) I225-V" }],
    }),
    onLog: () => {},
  });
  const gloss = (id, parameters) => named.renderCallGloss(capOf(id), { capabilityId: id, parameters });

  // A CAPABILITY WITH NO PARAMETERS HAS NOTHING TO POINT AT, so it gets no gloss rather than a
  // restatement of `plain.what` two lines below `plain.what` — which is D245's defect.
  check("flush_dns() has no parameters and therefore no gloss", gloss("flush_dns", {}) === null);
  check("…and the catalog simply omits `plain.call` for it, rather than carrying an empty one",
    capOf("flush_dns").plain.call === undefined);

  // THE TWO LIVE RESOLVERS. A GUID is the parameter that would otherwise put a GUID on the screen
  // where a person grants permission.
  check("an adapter index resolves to the adapter's description",
    gloss("renew_dhcp", { adapterIndex: 12 }) === "Renew the address on the Intel(R) Ethernet Controller (2) I225-V connection.",
    gloss("renew_dhcp", { adapterIndex: 12 }));
  check("an adapter GUID resolves too, so no GUID reaches the card",
    !/\{[0-9A-Fa-f-]{8,}/.test(gloss("reset_adapter", { adapterId: GUID })),
    gloss("reset_adapter", { adapterId: GUID }));

  // THE HONEST FALLBACK. An adapter gone between probe and render yields the raw value, which is no
  // worse than the exact call printed directly beneath it — and far better than naming the WRONG
  // adapter, which is the one outcome a gloss must never produce.
  const gone = gloss("reset_adapter", { adapterId: "{NOT-A-REAL-GUID}" });
  check("an unresolvable parameter falls back to the raw value", gone.includes("{NOT-A-REAL-GUID}"), gone);
  check("…and never to \"undefined\" or to silence", !/undefined/.test(gone) && gone.length > 0, gone);
  const unmapped = gloss("restart_service", { serviceName: "not_in_the_map" });
  check("an unmapped service name falls back to itself", unmapped.includes("not_in_the_map"), unmapped);

  // A probe that throws must not take the card down with it.
  {
    const blind = new InProcessBroker({
      catalogPath: join(ROOT, "src/broker/catalog.json"),
      auditPath: join(ROOT, "audit/audit.jsonl"),
      probe: () => { throw new Error("no probe"); },
      onLog: () => {},
    });
    const g = blind.renderCallGloss(capOf("reset_adapter"), { capabilityId: "reset_adapter", parameters: { adapterId: GUID } });
    check("a probe that throws still yields a gloss, falling back to the raw value",
      typeof g === "string" && g.includes(GUID), String(g));
  }
  // A placeholder with no matching parameter stays VISIBLE: obviously wrong beats invisibly wrong.
  check("a placeholder naming an absent parameter is left in place",
    named.renderCallGloss({ id: "x", plain: { call: "Do it to {nothing}." } }, { capabilityId: "x", parameters: {} })
      === "Do it to {nothing}.");
  // And every capability that HAS a gloss declares a resolver for each placeholder it uses.
  for (const c of catalog.capabilities) {
    if (typeof c.plain?.call !== "string") continue;
    const placeholders = [...c.plain.call.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    check(`${c.id}: every placeholder is a real parameter`,
      placeholders.every((p) => Object.hasOwn(c.parameters?.properties ?? {}, p)), placeholders.join(", "));
    check(`${c.id}: every placeholder declares a resolver`,
      placeholders.every((p) => typeof c.plain?.callParams?.[p] === "string"), JSON.stringify(c.plain?.callParams));
    check(`${c.id}: the gloss itself names no capability id`, !c.plain.call.includes(c.id));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
console.log("\n--- broker log ---");
for (const l of lines) console.log(l);
process.exit(fail ? 1 : 0);
