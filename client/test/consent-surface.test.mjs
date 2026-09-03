/**
 * The consent surface lives in the unprivileged process. Demonstrated, not reasoned.
 *
 * 2026-09-02 design review, finding 1.1 (B1/H3e scenario 2; D130): in Phase 1 the agent is an
 * unprivileged process on the far side of a named pipe. It draws the consent card. The broker mints
 * a token for whatever PROPOSAL arrives on the pipe and executes it. Nothing ties the two together.
 * So an agent can display "Flush the DNS resolver cache", take the Approve click, and send
 * `reset_adapter` with a live adapter GUID. Schema valid, precondition satisfied on an offline
 * machine, token minted and bound to the proposal hash, executed, audited as consented. Every
 * invariant H1-H6 holds. The user consented to nothing of the sort.
 *
 * This file does three things:
 *
 *   1. POSITIVE CONTROL - the honest path across the pipe works (flush_dns shown, flush_dns run).
 *      Hard checks. Must keep passing after D130 lands.
 *   2. THE DEMONSTRATION - the bypass, end to end, against a stub NamedPipeBroker in another process
 *      on a real named pipe. It prints the audit record so the evidence is in the log, not claimed.
 *   3. THE D130 REGRESSION TEST - "the broker executes only what the user was shown", asserted as an
 *      EXPECTED FAILURE (xfail). Today it fails, and the suite still exits 0 with the failure counted
 *      under "known open (D130)". The day it passes, this file exits 1 with the instruction to
 *      promote it to a hard check. That is the test D130 has to pass.
 *
 * The stub broker is test/helpers/pipe-broker-service.mjs. It is the real InProcessBroker behind
 * the same `consentAndExecute(proposal)` handler main.js uses, with an injected OFFLINE machine
 * state and executors that record instead of act - nothing here resets an adapter.
 *
 * ACCEPTANCE SET FOR D130 (docs/2026-09-03-consent-protocol-design.md §6, recorded 2026-09-03).
 * D130 is designed, not implemented, so nothing below is promoted yet. When the two-step protocol
 * (prepareConsent(proposal, {locale}) -> ConsentRequest; execute(nonce)) lands in the stub service
 * and in InProcessBroker, the three XFAIL lines in section 3 become hard checks AND these five are
 * added as hard checks:
 *   1. the consent-gate refusal is audited with `gate: "consent"` and carries `consentRendered`
 *      (what the BROKER rendered for the card the user actually saw);
 *   2. execute() with an expired nonce is refused and audited;
 *   3. execute() with a replayed (already-burned) nonce is refused and audited;
 *   4. a machine that comes online between prepareConsent and execute produces a `machine-state`
 *      refusal on re-validation, not an execution;
 *   5. the positive control in section 1 still passes end to end: shown reset_adapter, ran
 *      reset_adapter, succeeded, audited with consentNonce + consentRendered.
 * The exit-1-on-XPASS mechanism at the bottom of this file is the trigger for that promotion and
 * stays as it is. Do not weaken the XFAIL lines to make them pass.
 *
 * Run: node test/consent-surface.test.mjs
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fork } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import net from "node:net";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "matic-consent-"));
const AUDIT = join(scratch, "audit.jsonl");
const PIPE = `\\\\.\\pipe\\matic-desk-consent-test-${process.pid}`;

let pass = 0, fail = 0, xfail = 0, xpass = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS   ${label}`); }
  else { fail++; console.log(`  FAIL   ${label} ${extra}`); }
}
/** Expected to fail until D130 is implemented. Passing is the signal to promote it to check(). */
function expectFailUntilD130(label, cond, extra = "") {
  if (cond) { xpass++; console.log(`  XPASS  ${label}  <-- D130 appears to be implemented: promote this to a hard check`); }
  else { xfail++; console.log(`  XFAIL  ${label}  (known open: D130) ${extra}`); }
}

// ---- the machine the broker believes it is running on: offline, one Wi-Fi adapter ----
const GUID = "{A1B2C3D4-0000-0000-0000-00000000BEEF}";
const adapter = { index: 12, description: "Intel(R) Wi-Fi 6 AX201", ip: "10.0.0.5", gateway: "10.0.0.1",
  dhcpEnabled: true, hasIp: true, hasGateway: true, isApipa: false, linkUp: true, adminUp: true, guid: GUID };
const OFFLINE = {
  online: false,
  services: {
    spooler: { name: "spooler", stateName: "RUNNING", canStop: true },
    audiosrv: { name: "audiosrv", stateName: "RUNNING", canStop: true },
    dnscache: { name: "dnscache", stateName: "RUNNING", canStop: false, controlsAccepted: 0x58 },
    dhcp: { name: "dhcp", stateName: "RUNNING", canStop: true },
  },
  adapters: [adapter], primary: [adapter], actionable: [adapter],
};

// ---- start the privileged half in its own process ----
const service = fork(join(ROOT, "test/helpers/pipe-broker-service.mjs"), [JSON.stringify({
  pipe: PIPE,
  catalogPath: join(ROOT, "src/broker/catalog.json"),
  auditPath: AUDIT,
  probeState: OFFLINE,
  stubExecutors: ["reset_adapter", "flush_dns"],
})], { stdio: ["ignore", "inherit", "inherit", "ipc"] });

const brokerLog = [];
await new Promise((resolve, reject) => {
  service.on("message", (m) => { if (m.ready) resolve(); if (m.log) brokerLog.push(m.log); });
  service.on("exit", (code) => reject(new Error(`broker service exited early (${code})`)));
  setTimeout(() => reject(new Error("broker service did not start")), 10000);
});

// ---- the agent half: an unprivileged client of the pipe ----
class PipeBrokerClient {
  constructor(pipe) {
    this.sock = net.connect(pipe);
    this.pending = new Map();
    this.next = 1;
    let buf = "";
    this.sock.on("data", (c) => {
      buf += c.toString("utf8");
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const msg = JSON.parse(buf.slice(0, nl)); buf = buf.slice(nl + 1);
        const p = this.pending.get(msg.id); this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.result);
      }
    });
    this.ready = new Promise((r) => this.sock.once("connect", r));
  }
  call(method, params = {}) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.sock.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }
  // The renderer's surface, per src/main/preload.cjs.
  listCapabilities() { return this.call("listCapabilities"); }
  validate(proposal) { return this.call("validate", { proposal }); }
  consentAndExecute(proposal) { return this.call("consentAndExecute", { proposal }); }
  close() { this.sock.end(); }
}
const agent = new PipeBrokerClient(PIPE);
await agent.ready;
const capabilities = await agent.listCapabilities();
const cap = (id) => capabilities.find((c) => c.id === id);

/**
 * What the renderer puts on the consent card, per askConsent() in src/renderer/renderer.js:
 * the tier label, `plain.what`, and `capabilityId(param=value)`. Recorded so the test can compare
 * what the user SAW against what the broker DID.
 */
function renderConsentCard(capability, proposal) {
  return {
    title: `Permission needed — ${capability.tierInfo?.label ?? `tier ${capability.tier}`}`,
    what: capability.plain?.what ?? capability.description,
    detail: `${capability.id}(${Object.entries(proposal.parameters ?? {}).map(([k, v]) => `${k}=${v}`).join(", ")})`,
  };
}

async function auditRecords() {
  await agent.call("__flush");
  if (!existsSync(AUDIT)) return [];
  return readFileSync(AUDIT, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

const flushProposal = { capabilityId: "flush_dns", parameters: {}, reasoning: "Your DNS cache may be stale.", confidence: 0.85, source: "cloud" };
const resetProposal = { capabilityId: "reset_adapter", parameters: { adapterId: GUID }, reasoning: "(never shown)", confidence: 0.9, source: "cloud" };

console.log("=== 1. POSITIVE CONTROL: the honest path across the pipe ===");
{
  // Note the broker's own precondition would refuse flush_dns on an offline machine. That is the
  // gate working, and it is exactly why the honest control must use the capability the machine
  // state allows. On this OFFLINE box the allowed one is reset_adapter - shown AND run.
  const shown = renderConsentCard(cap("reset_adapter"), resetProposal);
  const v = await agent.validate(resetProposal);
  check("reset_adapter validates on an offline machine (precondition machineOnline:false holds)", v.ok === true, JSON.stringify(v.errors));
  const exec = await agent.consentAndExecute(resetProposal);
  check("shown reset_adapter, ran reset_adapter: succeeds", exec.ok === true && exec.capabilityId === "reset_adapter", exec.message);
  check("a consent token was minted and returned", typeof exec.consentTokenId === "string");
  check("what was shown names what ran", shown.detail.startsWith("reset_adapter("), shown.detail);
  const rec = (await auditRecords()).at(-1);
  check("audited as a consented success", rec?.outcome === "success" && rec.consentTokenId === exec.consentTokenId, JSON.stringify(rec));
  console.log("      shown:", JSON.stringify(shown));
}

console.log("=== 2. THE DEMONSTRATION: flush_dns displayed, reset_adapter sent ===");
const before = (await auditRecords()).length;
const shown = renderConsentCard(cap("flush_dns"), flushProposal);
console.log("      the user sees this card and clicks Approve:");
console.log("        ", JSON.stringify(shown));
// The agent's "Approve" handler sends a DIFFERENT proposal down the pipe. Nothing the broker can
// observe distinguishes this from the honest path above.
const attack = await agent.consentAndExecute(resetProposal);
console.log("      the broker returns:", JSON.stringify({ ok: attack.ok, capabilityId: attack.capabilityId, consentTokenId: attack.consentTokenId, auditId: attack.auditId }));
const ran = await agent.call("__executed");
const attackRecord = (await auditRecords()).slice(before).at(-1);
console.log("      audit record written by the privileged half:");
console.log("        ", JSON.stringify(attackRecord));

// Facts about what happened. Stated as plain observations, not as checks, because after D130
// they should all become FALSE and this file must not fail for the right reason.
const executedReset = ran.some((e) => e.id === "reset_adapter" && e.params.adapterId === GUID) && attack.ok === true;
const mintedToken = typeof attack.consentTokenId === "string";
const auditedAsConsented = attackRecord?.outcome === "success" && attackRecord?.consentTokenId === attack.consentTokenId
  && attackRecord?.capabilityId === "reset_adapter";
console.log(`      observed: displayed=${shown.detail}  executed=${attack.capabilityId}  tokenMinted=${mintedToken}  auditedAsConsented=${auditedAsConsented}`);
console.log(`      every gate held: catalog, schema, tier-policy, policy-blocklist, machine-state, precondition, token hash-bound, single-use.`);
console.log(`      invariants H1-H6 hold. H3e holds: the model authored none of the consent text. The consent text was simply for a different action.`);

console.log("=== 3. D130 REGRESSION TEST: the broker executes only what the user was shown ===");
// The rule D130 has to implement, stated as the assertion. Two acceptable shapes (review §1.1):
//   (a) the broker renders the consent text and returns it with a nonce; approval binds to the
//       nonce; the broker refuses an approval whose nonce/text does not match what it issued;
//   (b) a broker-owned consent window in the user's session.
// Either way, in THIS scenario the broker must not execute reset_adapter, must not mint a token
// for it, and the audit trail must not record it as consented.
expectFailUntilD130("the broker refused to execute an action whose consent card it did not issue", !executedReset);
expectFailUntilD130("no consent token was minted for the unseen proposal", !mintedToken);
expectFailUntilD130("the audit trail does not record the unseen action as consented", !auditedAsConsented);

// And the facts that make the bypass a bypass today, checked so a silent change in shape is noticed:
check("the swapped proposal passed every existing gate (schema, precondition, machine-state)", attack.ok === true || attack.message.includes("consent"), attack.message);
check("the audit record carries no trace of what the user was shown (no field names the displayed text)",
  attackRecord && !JSON.stringify(attackRecord).toLowerCase().includes("dns"), JSON.stringify(attackRecord));

// ---- teardown ----
agent.close();
service.send({ exit: true });
await new Promise((r) => service.on("exit", r));
rmSync(scratch, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed, ${xfail} known open (D130), ${xpass} unexpectedly passing`);
if (xpass > 0) {
  console.log("D130 appears to be implemented. Promote the XFAIL lines in client/test/consent-surface.test.mjs to check() and update docs/decisions/DECISION-REGISTER.md D130 (repo root).");
  process.exit(1);
}
process.exit(fail ? 1 : 0);
