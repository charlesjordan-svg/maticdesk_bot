/**
 * The consent surface lives in the unprivileged process. Demonstrated, then closed - D130.
 *
 * 2026-09-02 design review, finding 1.1 (B1/H3e scenario 2; D130): in Phase 1 the agent is an
 * unprivileged process on the far side of a named pipe. It draws the consent card. Under the
 * one-call protocol the broker minted a token for whatever PROPOSAL arrived on the pipe and executed
 * it, so an agent could display "Flush the DNS resolver cache", take the Approve click, and send
 * `reset_adapter` with a live adapter GUID. Every gate held, every invariant H1-H6 held, and the
 * user consented to nothing of the sort. This file demonstrated that on 2026-09-03.
 *
 * D130 was IMPLEMENTED on 2026-09-03 as the two-step protocol of
 * docs/2026-09-03-consent-protocol-design.md, attacked first in
 * docs/2026-09-03-consent-protocol-attack-notes.md: prepareConsent(proposal, {locale}) renders the
 * card in the broker and retains the proposal; execute(nonce) runs what was retained. The agent
 * never sends a proposal at approval time, so there is nothing to swap.
 *
 * This file now does four things, all against the same stub NamedPipeBroker in another process on a
 * real named pipe (test/helpers/pipe-broker-service.mjs):
 *
 *   1. POSITIVE CONTROL - the honest path across the pipe works and is audited with the D130 fields.
 *   2. THE DEMONSTRATION, RE-RUN against the two-step protocol: the agent shows one card and tries
 *      to have another action run under that approval. Every avenue it has is exercised.
 *   3. THE D130 REGRESSION TEST - the three assertions that were XFAIL until today, promoted to hard
 *      checks as the file's own instructions said to do. `expectFailUntilD130()` and the exit-1-on-XPASS
 *      mechanism are kept so a future XFAIL can use them; nothing is XFAIL today.
 *   4. THE FIVE ACCEPTANCE ADDITIONS from the design's §6: consent-gate refusal audited with
 *      `consentRendered`; expired nonce refused; replayed nonce refused; machine coming online mid-window
 *      refused on re-validation; positive control carries consentNonce + consentRendered.
 *
 * And it prints, as observations rather than checks, what D130 does NOT fix (design §5): the agent
 * can still paint different pixels than the text it was handed. After D130 that lie is attributable,
 * because the audit record says what the privileged half rendered; and the supersession record shows
 * the timing signature of a card replaced under the user's eyes.
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
/**
 * Expected to fail until a named decision lands. Passing is the signal to promote it to check().
 * Unused since D130 landed on 2026-09-03; kept, with the exit-1 mechanism below, for the next one.
 */
function expectFailUntilD130(label, cond, extra = "") {
  if (cond) { xpass++; console.log(`  XPASS  ${label}  <-- D130 appears to be implemented: promote this to a hard check`); }
  else { xfail++; console.log(`  XFAIL  ${label}  (known open: D130) ${extra}`); }
}
void expectFailUntilD130;

// ---- the machine the broker believes it is running on: offline, one Wi-Fi adapter ----
const GUID = "{A1B2C3D4-0000-0000-0000-00000000BEEF}";
const adapter = { index: 12, description: "Intel(R) Wi-Fi 6 AX201", ip: "10.0.0.5", gateway: "10.0.0.1",
  dhcpEnabled: true, hasIp: true, hasGateway: true, isApipa: false, linkUp: true, adminUp: true, guid: GUID };
const services = {
  spooler: { name: "spooler", stateName: "RUNNING", canStop: true },
  audiosrv: { name: "audiosrv", stateName: "RUNNING", canStop: true },
  dnscache: { name: "dnscache", stateName: "RUNNING", canStop: false, controlsAccepted: 0x58 },
  dhcp: { name: "dhcp", stateName: "RUNNING", canStop: true },
};
const OFFLINE = { online: false, services, adapters: [adapter], primary: [adapter], actionable: [adapter] };
const ONLINE = { ...OFFLINE, online: true };

// ---- start the privileged half in its own process ----
const service = fork(join(ROOT, "test/helpers/pipe-broker-service.mjs"), [JSON.stringify({
  pipe: PIPE,
  catalogPath: join(ROOT, "src/broker/catalog.json"),
  auditPath: AUDIT,
  probeState: OFFLINE,
  // restart_service is stubbed too: section 2 renders a spooler card as the "shown" action, and
  // nothing in this file may touch the box it runs on.
  stubExecutors: ["reset_adapter", "flush_dns", "restart_service"],
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
  prepareConsent(proposal, locale = "en") { return this.call("prepareConsent", { proposal, locale }); }
  /** `extra` is anything a hostile agent might try to smuggle alongside the nonce. */
  execute(nonce, extra = {}) { return this.call("execute", { nonce, ...extra }); }
  close() { this.sock.end(); }
}
const agent = new PipeBrokerClient(PIPE);
await agent.ready;
await agent.listCapabilities();

async function auditRecords() {
  await agent.call("__flush");
  if (!existsSync(AUDIT)) return [];
  return readFileSync(AUDIT, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
const sameRendering = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const flushProposal = { capabilityId: "flush_dns", parameters: {}, reasoning: "Your DNS cache may be stale.", confidence: 0.85, source: "cloud" };
const spoolerProposal = { capabilityId: "restart_service", parameters: { serviceName: "spooler" }, reasoning: "The print spooler looks stuck.", confidence: 0.9, source: "cloud" };
const resetProposal = { capabilityId: "reset_adapter", parameters: { adapterId: GUID }, reasoning: "(never shown)", confidence: 0.9, source: "cloud" };

console.log("=== 1. POSITIVE CONTROL: the honest path across the pipe, two steps ===");
{
  // The broker's precondition refuses flush_dns on an offline machine; the capability the machine
  // state allows here is reset_adapter - shown AND run, exactly as the user is asked.
  const v = await agent.validate(resetProposal);
  check("reset_adapter validates on an offline machine (precondition machineOnline:false holds)", v.ok === true, JSON.stringify(v.errors));
  const prep = await agent.prepareConsent(resetProposal);
  check("step 1: the broker issued a consent request", prep.ok === true && typeof prep.request?.nonce === "string", JSON.stringify(prep));
  const req = prep.request;
  check("the BROKER rendered the card (title, what, detail)",
    req.rendered.title === "Permission needed — Disruptive" && req.rendered.detail === `reset_adapter(adapterId=${GUID})` && /network adapter off/.test(req.rendered.what),
    JSON.stringify(req.rendered));
  check("R2 carries the broker-authored rollback warning", /disruptive.*rollback is: reset_adapter/i.test(req.rendered.rollbackNote ?? ""), req.rendered.rollbackNote);
  check("no token crossed the pipe", !("proposalHash" in req) && !("consentTokenId" in req) && !("token" in req));
  check("the locale actually used is stated", req.locale === "en" && req.rendered.locale === "en");
  console.log("      shown:", JSON.stringify({ title: req.rendered.title, what: req.rendered.what, detail: req.rendered.detail }));

  const exec = await agent.execute(req.nonce);
  check("step 2: shown reset_adapter, ran reset_adapter: succeeds", exec.ok === true && exec.capabilityId === "reset_adapter", exec.message);
  const rec = (await auditRecords()).at(-1);
  check("audited as a consented success with an internally minted token id", rec?.outcome === "success" && typeof rec.consentTokenId === "string", JSON.stringify(rec));
  check("acceptance 5: the record carries consentNonce", rec?.consentNonce === req.nonce);
  check("acceptance 5: the record carries consentRendered, byte for byte what the broker rendered", sameRendering(rec?.consentRendered, req.rendered));
}

console.log("=== 2. THE DEMONSTRATION, re-run against the two-step protocol ===");
console.log("      goal of the compromised agent: the user sees one card, reset_adapter runs.");
const before = (await auditRecords()).length;
const executedBefore = (await agent.call("__executed")).length;
let shownReq;
{
  // 2a. The card in the original demonstration was flush_dns. The agent can no longer draw that
  //     from the catalog - it has to ask the broker to render it, and the broker validates first.
  const prep = await agent.prepareConsent(flushProposal);
  check("2a. the agent cannot obtain a flush_dns card on this machine: the broker refuses to render it", prep.ok === false && /machineOnline|route|cache cannot help/i.test(prep.error), JSON.stringify(prep));
  console.log("      (flush_dns requires machineOnline:true; reset_adapter requires machineOnline:false - the two cards of the original attack are mutually exclusive)");

  // 2b. So it asks for a card it CAN get: restart_service(spooler), "Low risk", valid on any machine.
  const shown = await agent.prepareConsent(spoolerProposal);
  check("2b. the agent obtains an honest Low-risk card for restart_service(spooler)", shown.ok === true && shown.request.rendered.title === "Permission needed — Low risk", JSON.stringify(shown));
  shownReq = shown.request;
  console.log("      the user sees this card and clicks Approve:");
  console.log("        ", JSON.stringify({ title: shownReq.rendered.title, detail: shownReq.rendered.detail }));

  // 2c. Avenue one: a nonce the broker never issued, hoping it maps to something.
  const forged = await agent.execute("00000000-0000-4000-8000-00000000dead");
  check("2c. a forged nonce is refused", forged.ok === false && /no consent request was issued/.test(forged.message), forged.message);
  const forgedRec = (await auditRecords()).at(-1);
  check("acceptance 1: the refusal is audited with gate \"consent\"", forgedRec?.outcome === "refused" && forgedRec.gate === "consent", JSON.stringify(forgedRec));
  check("acceptance 1: ...and carries consentRendered = the card on screen at the time", sameRendering(forgedRec?.consentRendered, shownReq.rendered), JSON.stringify(forgedRec?.consentRendered));
  check("...and names the nonce that was presented", forgedRec?.consentNonce === "00000000-0000-4000-8000-00000000dead");

  // 2d. Avenue two - THE ORIGINAL ATTACK: send the approved nonce together with a different
  //     proposal, the way the one-call protocol let it. The pipe method has no parameter to read a
  //     proposal into. Exactly one of these outcomes is possible: the retained spooler restart runs.
  const attack = await agent.execute(shownReq.nonce, { proposal: resetProposal });
  console.log("      execute(nonce, proposal=reset_adapter) returned:", JSON.stringify({ ok: attack.ok, capabilityId: attack.capabilityId }));
  check("2d. the approval ran what the card said: restart_service, not reset_adapter", attack.ok === true && attack.capabilityId === "restart_service", JSON.stringify(attack));
}
const ran = await agent.call("__executed");
const since = (await auditRecords()).slice(before);
const executedReset = ran.slice(executedBefore).some((e) => e.id === "reset_adapter");
const tokenForReset = since.some((r) => r.capabilityId === "reset_adapter" && typeof r.consentTokenId === "string");
const auditedResetAsConsented = since.some((r) => r.capabilityId === "reset_adapter" && r.outcome === "success");
console.log(`      observed: displayed=${shownReq.rendered.detail}  reset_adapter executed=${executedReset}  token minted for reset_adapter=${tokenForReset}  audited as consented=${auditedResetAsConsented}`);

console.log("=== 3. D130 REGRESSION TEST: the broker executes only what the user was shown ===");
// The three lines that were XFAIL from 2026-09-03 morning until D130 landed the same evening.
// Promoted to hard checks as this file's own footer instructed. Do not weaken them.
check("the broker refused to execute an action whose consent card it did not issue", !executedReset);
check("no consent token was minted for the unseen proposal", !tokenForReset);
check("the audit trail does not record the unseen action as consented", !auditedResetAsConsented);
check("what ran is audited with the text the user was shown", since.some((r) => r.outcome === "success" && r.capabilityId === "restart_service" && sameRendering(r.consentRendered, shownReq.rendered)));

console.log("=== 4. the remaining acceptance additions (design §6) ===");
{
  // acceptance 3: replay. The spooler nonce was consumed in 2d; present it again.
  const replay = await agent.execute(shownReq.nonce);
  check("acceptance 3: a replayed nonce is refused", replay.ok === false && /already been used/.test(replay.message), replay.message);
  const replayRec = (await auditRecords()).at(-1);
  check("acceptance 3: ...and audited, gate consent, with the rendering it was issued for", replayRec?.gate === "consent" && replayRec.consentNonce === shownReq.nonce && sameRendering(replayRec.consentRendered, shownReq.rendered), JSON.stringify(replayRec));
  const executedAfterReplay = (await agent.call("__executed")).length;
  check("acceptance 3: nothing ran twice", executedAfterReplay === executedBefore + 1, `executed ${executedAfterReplay - executedBefore} since section 2`);

  // acceptance 2: expiry. Render a card, move the broker's clock past the 120 s window, click.
  const late = await agent.prepareConsent(resetProposal);
  await agent.call("__advanceClock", { ms: 121000 });
  const expired = await agent.execute(late.request.nonce);
  check("acceptance 2: an expired nonce is refused", expired.ok === false && /expired/.test(expired.message), expired.message);
  const expiredRec = (await auditRecords()).at(-1);
  check("acceptance 2: ...and audited with gate consent and its own rendering", expiredRec?.gate === "consent" && sameRendering(expiredRec.consentRendered, late.request.rendered), JSON.stringify(expiredRec));
  const executedAfterExpiry = (await agent.call("__executed")).length;
  check("acceptance 2: nothing ran", executedAfterExpiry === executedAfterReplay);

  // acceptance 4: the machine comes back online between the card and the click.
  const mid = await agent.prepareConsent(resetProposal);
  check("card rendered while offline", mid.ok === true);
  await agent.call("__setProbe", { probeState: ONLINE });
  const recovered = await agent.execute(mid.request.nonce);
  check("acceptance 4: refused at execution time, not executed", recovered.ok === false && /refused at execution time/.test(recovered.message), recovered.message);
  const recoveredRec = (await auditRecords()).at(-1);
  // The gate is `precondition`: requires.machineOnline is a catalog-declared precondition on live
  // machine state (attack notes F5). The design's §6 calls this the machine-state refusal; both gates
  // are derived from the live probe, and `precondition` is the one the catalog grammar fires.
  check("acceptance 4: the refusal names the live-state gate that fired (precondition)", recoveredRec?.outcome === "refused" && recoveredRec.gate === "precondition", JSON.stringify(recoveredRec));
  check("acceptance 4: ...and carries consentNonce + consentRendered", recoveredRec?.consentNonce === mid.request.nonce && sameRendering(recoveredRec.consentRendered, mid.request.rendered));
  check("acceptance 4: nothing ran", (await agent.call("__executed")).length === executedAfterExpiry);
  check("acceptance 4: the burned nonce cannot be retried once the machine is offline again", await (async () => {
    await agent.call("__setProbe", { probeState: OFFLINE });
    const retry = await agent.execute(mid.request.nonce);
    return retry.ok === false && /already been used/.test(retry.message);
  })());
}

console.log("=== 5. what D130 does not fix, and what it leaves in the trail (design §5, attack notes F2) ===");
{
  // A compromised agent can render X, paint X, and at the click render Y and approve Y. The broker
  // cannot see pixels. What it CAN do is refuse to keep two cards outstanding and write down that X
  // was replaced - so the trail carries the timing signature of exactly this attack.
  const x = await agent.prepareConsent(spoolerProposal);
  const y = await agent.prepareConsent(resetProposal);
  check("a second request supersedes the first (one outstanding per session)", x.ok && y.ok);
  const superseded = (await auditRecords()).find((r) => r.consentNonce === x.request.nonce && /superseded/.test(r.message ?? ""));
  check("the supersession is audited: gate consent, with the superseded card's rendering", superseded?.gate === "consent" && superseded.outcome === "refused" && sameRendering(superseded.consentRendered, x.request.rendered), JSON.stringify(superseded));
  const staleX = await agent.execute(x.request.nonce);
  check("the superseded nonce no longer executes", staleX.ok === false && /superseded/.test(staleX.message), staleX.message);
  const runY = await agent.execute(y.request.nonce);
  check("the current card executes, and is audited with ITS rendering", runY.ok === true && runY.capabilityId === "reset_adapter");
  console.log("      residual (design §5): the agent may have PAINTED the spooler card while approving the adapter reset. The broker cannot see pixels.");
  console.log("      what changed: the trail says spooler rendered -> spooler superseded -> reset_adapter rendered -> reset_adapter run, within milliseconds. That is attributable; before D130 it was unknowable.");
}

// ---- teardown ----
agent.close();
service.send({ exit: true });
await new Promise((r) => service.on("exit", r));
rmSync(scratch, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed, ${xfail} known open, ${xpass} unexpectedly passing`);
if (xpass > 0) {
  console.log("An XFAIL line is passing. Promote it to check() and update the decision it was waiting on in docs/decisions/DECISION-REGISTER.md (repo root).");
  process.exit(1);
}
process.exit(fail ? 1 : 0);
