import { readFileSync } from "node:fs";
import { validateAgainstSchema } from "../src/broker/schema.js";
import { probeMachine, describeAddress } from "../src/broker/capabilities/index.js";

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
