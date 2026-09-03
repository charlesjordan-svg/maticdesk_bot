import { readFileSync } from "node:fs";
import { validateAgainstSchema } from "../src/broker/schema.js";
import { probeMachine, describeAddress, describeServiceRestart } from "../src/broker/capabilities/index.js";

const cat = JSON.parse(readFileSync(new URL("../src/broker/catalog.json", import.meta.url), "utf8"));
const schema = cat.capabilities.find((c) => c.id === "restart_service").parameters;

console.log("=== schema enforcement (§5: no freeform param reaches a Win32 call) ===");
const cases = [
  ["valid enum value", { serviceName: "spooler" }],
  ["off-enum injection attempt", { serviceName: "spooler & calc.exe" }],
  ["extra parameter", { serviceName: "spooler", extra: "x" }],
  ["missing required", {}],
  ["wrong type", { serviceName: 5 }],
  ["null", null],
];
for (const [label, value] of cases) {
  const errs = validateAgainstSchema(schema, value);
  console.log(`  ${errs.length ? "REJECT" : "ACCEPT"}  ${label.padEnd(28)} ${errs.join("; ")}`);
}

console.log("=== probeMachine (unelevated detection) ===");
const p = probeMachine();
console.log("  online:", p.online);
console.log("  primary adapters:", p.primary.map((a) => `${a.index}:${a.ip}`).join(", ") || "(none)");
for (const [n, s] of Object.entries(p.services)) {
  console.log(`  ${n.padEnd(10)} ${s.stateName ?? s.error}  canStop=${s.canStop}`);
}

// ---------------------------------------------------------------------------------------------
// describeAddress: reporting a self-assigned address as success is the failure that matters here.
//
// verify-privileged.ps1 on this hardware produced:
//   "Reset the Intel(R) Ethernet Controller (2) I225-V adapter - it is back up on 169.254.17.252."
// which reads as success and means the opposite. resetAdapter() settles for 1.5 s; DHCP took
// longer than that, and the machine reached 192.168.50.223 only some seconds afterwards.
// ---------------------------------------------------------------------------------------------
let pass = 0;
let fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}

console.log("=== describeAddress: a 169.254 address is not a success ===");
{
  const real = describeAddress({ hasIp: true, isApipa: false, ip: "192.168.50.223" });
  check("a real lease reports ok", real.ok === true, JSON.stringify(real));
  check("and names the address", real.phrase === "on 192.168.50.223", real.phrase);
}
{
  const apipa = describeAddress({ hasIp: true, isApipa: true, ip: "169.254.17.252" });
  check("an APIPA address does NOT report ok", apipa.ok === false, JSON.stringify(apipa));
  check("the phrase says DHCP has not answered", /DHCP has not answered/.test(apipa.phrase), apipa.phrase);
  check("the phrase still shows the address, rather than hiding it", apipa.phrase.includes("169.254.17.252"), apipa.phrase);
  check("and it sets the expectation that this settles", /settles/.test(apipa.phrase), apipa.phrase);
}
{
  check("no address at all does not report ok", describeAddress({ hasIp: false, ip: "0.0.0.0" }).ok === false);
  check("a missing adapter does not throw and does not report ok", describeAddress(undefined).ok === false);
}
{
  // The reset message is assembled from the phrase; both readings must be grammatical.
  const sentence = (addr) => `Reset the Intel I225-V adapter - it is back up${addr.ok ? " " : ", "}${addr.phrase}.`;
  const ok = sentence(describeAddress({ hasIp: true, isApipa: false, ip: "192.168.50.223" }));
  const bad = sentence(describeAddress({ hasIp: true, isApipa: true, ip: "169.254.17.252" }));
  check("the success sentence reads correctly", ok === "Reset the Intel I225-V adapter - it is back up on 192.168.50.223.", ok);
  check("the APIPA sentence reads correctly", bad.startsWith("Reset the Intel I225-V adapter - it is back up, but so far only"), bad);
  console.log(`        ${bad}`);
}


console.log("=== describeServiceRestart: a real restart must not read as a no-op ===");
{
  const r = describeServiceRestart('spooler', { stateBefore: 'STOPPED', stateAfter: 'RUNNING', steps: ['already stopped', 'started'] });
  check("the Scenario 1 money line is unchanged", r === "Restarted the spooler service — it went STOPPED → RUNNING.", r);
}
{
  // The healthy-service case: identical before/after, but it really was bounced.
  const r = describeServiceRestart('spooler', { stateBefore: 'RUNNING', stateAfter: 'RUNNING', steps: ['stopped', 'started'] });
  check("an already-running service does not report RUNNING to RUNNING", !/RUNNING → RUNNING/.test(r), r);
  check("it says the service was stopped and started", /stopped and started again/.test(r), r);
  check("and confirms the end state", /running now/.test(r), r);
  console.log("        " + r);
}
{
  const r = describeServiceRestart('spooler', { stateBefore: 'RUNNING', stateAfter: 'STOPPED', steps: ['stopped'] });
  check("a service that did not come back is not reported as restarted", !/^Restarted/.test(r), r);
  check("and the failure names the actual state", /STOPPED now, not running/.test(r), r);
}
{
  const r = describeServiceRestart('spooler', { stateBefore: 'RUNNING', stateAfter: 'RUNNING', steps: [] });
  check("a no-op is reported as a no-op, not as a restart", /not actually stopped and started/.test(r), r);
}

// -------------------------------------------------------------------------------------------
// The consent prompt's plain-language text.
//
// A user approved an action and then said "I feel like I approved that with not enough
// information". The catalog description they were shown read "Idempotent - no rollback needed".
// These assertions exist so that never regresses into engineer-speak.
// -------------------------------------------------------------------------------------------
console.log("=== consent prompt: plain language, present and actually plain ===");
{
  let complete = true;
  for (const c of cat.capabilities) {
    const pl = c.plain;
    if (!pl || !pl.what || !pl.why || !pl.notice || !pl.undo) { complete = false; console.log(`        MISSING on ${c.id}`); }
  }
  check("every capability explains what/why/notice/undo", complete);

  // Words the person whose machine it is should never have to decode.
  // Terms distinctive enough not to need word boundaries.
  const JARGON = /idempotent|rollback|invariant|daemon|stdout|schema|mutex|deserialise|payload|marshalling/i;
  const offenders = [];
  for (const c of cat.capabilities) {
    for (const [k, v] of Object.entries(c.plain ?? {})) {
      if (JARGON.test(v)) offenders.push(`${c.id}.${k}: ${v.match(JARGON)[0]}`);
    }
  }
  check("no engineer jargon survives in the consent text", offenders.length === 0, offenders.join("; "));

  // The R2 action is the one that costs the user something. It must say so, unmissably.
  const reset = cat.capabilities.find((c) => c.id === "reset_adapter");
  check("the disruptive action spells out that EVERY connection drops",
    /every network connection/i.test(reset.plain.notice), reset.plain.notice);
  check("and says how long it may take to come back",
    /[0-9]+ to [0-9]+ seconds/i.test(reset.plain.notice), reset.plain.notice);

  check("flush_dns reassures that personal data is untouched",
    /does not touch/i.test(cat.capabilities.find((c) => c.id === "flush_dns").plain.what));

  // "tier R1" means nothing to someone being asked to approve something.
  check("the catalog carries a plain risk label for every tier used",
    cat.capabilities.every((c) => cat.tiers?.[c.tier]?.label && cat.tiers[c.tier].summary),
    JSON.stringify(cat.tiers));

  for (const c of cat.capabilities) console.log(`        ${c.id.padEnd(16)} ${cat.tiers[c.tier].label.padEnd(11)} ${c.plain.what.slice(0, 74)}...`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
