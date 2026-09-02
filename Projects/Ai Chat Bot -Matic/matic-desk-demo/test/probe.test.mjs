import { readFileSync } from "node:fs";
import { validateAgainstSchema } from "../src/broker/schema.js";
import { probeMachine } from "../src/broker/capabilities/index.js";

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
