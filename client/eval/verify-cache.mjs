/**
 * Prove - or disprove - that prompt caching works on a model, from the live usage fields.
 *
 * Why: `docs/TOKEN-COUNT-2026-09-03.md` measured the shipped prefix at 2,104 tokens on
 * claude-haiku-4-5 (floor 4,096 - cannot cache) and 2,600 on claude-sonnet-5 (floor 1,024 - can).
 * D161 in ../../docs/decisions/DECISION-REGISTER.md turns caching on for the models whose floor the
 * prefix reaches and leaves Haiku uncached and unpadded. The usage fields are the only ground truth
 * that caching is working, so this script sends the SAME shipped turn twice through the real
 * CloudClient and prints `cache_creation_input_tokens` / `cache_read_input_tokens` for each.
 *
 * Expected on a cacheable model with a cold cache: first call writes (creation > 0, read 0), second
 * call reads (read > 0). If the cache is already warm from a run in the last five minutes the first
 * call reads too - still a pass. On claude-haiku-4-5 both calls show 0/0 by design: promptCache
 * defaults to false there, and even forced on it would be inert (below the floor).
 *
 * Usage:  node eval/verify-cache.mjs [model] [--force-cache]     (default: claude-sonnet-5)
 * Needs ANTHROPIC_API_KEY in the environment or in .env. COSTS TWO REAL CALLS (~2,800 input tokens
 * each on Sonnet 5 - well under a cent at list price). Not part of `npm test`.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CloudClient } from "../src/agent/cloud-client.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(join(ROOT, ".env")); } catch { /* no .env; rely on the environment */ }

const args = process.argv.slice(2);
const forceCache = args.includes("--force-cache");
const model = args.find((a) => !a.startsWith("--")) ?? "claude-sonnet-5";

const catalog = JSON.parse(readFileSync(join(ROOT, "src/broker/catalog.json"), "utf8"));
for (const c of catalog.capabilities) c.tierInfo = catalog.tiers?.[c.tier] ?? null; // as the broker does

const cloud = new CloudClient({
  model,
  capabilities: catalog.capabilities,
  // No `temperature`: the app leaves it undefined, and claude-sonnet-5 rejects it outright
  // (400 `temperature` is deprecated for this model - observed 2026-09-03). The bake-off pins 0.
  ...(forceCache ? { promptCache: true } : {}),
  onLog: (line) => console.log("  " + line),
});
if (!cloud.available) {
  console.log("No ANTHROPIC_API_KEY found in the environment or .env - nothing to verify.");
  process.exit(1);
}
console.log(`model: ${model}   promptCache: ${cloud.promptCache}${forceCache ? " (forced)" : " (default for this model)"}`);

// The same representative turn count-tokens.mjs uses, so the prefix under test is the shipped one.
const probe = {
  online: true,
  services: {
    spooler: { name: "spooler", stateName: "STOPPED", canStop: true },
    audiosrv: { name: "audiosrv", stateName: "RUNNING", canStop: true },
    dnscache: { name: "dnscache", stateName: "RUNNING", canStop: false },
    dhcp: { name: "dhcp", stateName: "RUNNING", canStop: true },
  },
  adapters: [{ index: 12, description: "Intel(R) Wi-Fi 6 AX201", ip: "192.168.1.42", gateway: "192.168.1.1", dhcpEnabled: true, hasIp: true, guid: "{A1B2C3D4-0000-0000-0000-00000000BEEF}" }],
};
const text = "my printer isn't working, nothing comes out";

const runs = [];
for (const label of ["first call", "second call"]) {
  const r = await cloud.propose(text, { probe });
  if (!r.ok) {
    console.log(`${label}: the call failed - ${r.error}`);
    process.exit(1);
  }
  runs.push({ label, ...r.usage, chose: r.escalate ? "escalate" : r.proposal.capabilityId });
}

console.log("");
console.log("| call | input_tokens | cache_creation_input_tokens | cache_read_input_tokens | output_tokens | chose |");
console.log("|---|---|---|---|---|---|");
for (const r of runs) {
  console.log(`| ${r.label} | ${r.input_tokens} | ${r.cache_creation_input_tokens} | ${r.cache_read_input_tokens} | ${r.output_tokens} | ${r.chose} |`);
}

const [a, b] = runs;
const wroteOrWarm = a.cache_creation_input_tokens > 0 || a.cache_read_input_tokens > 0;
const readBack = b.cache_read_input_tokens > 0;
console.log("");
if (!cloud.promptCache) {
  console.log(`VERDICT: caching is OFF for ${model} by default (prefix below the model's floor - see cloud-client.js). Nothing to verify; pass --force-cache to show the marker is inert.`);
  process.exit(0);
}
if (wroteOrWarm && readBack) {
  const cached = b.cache_read_input_tokens;
  const total = b.input_tokens + b.cache_creation_input_tokens + b.cache_read_input_tokens;
  console.log(`VERDICT: CACHING WORKS on ${model}. Second call served ${cached} of ${total} prompt tokens from cache (${Math.round((100 * cached) / total)}%).` +
    (a.cache_creation_input_tokens > 0 ? ` First call wrote ${a.cache_creation_input_tokens}.` : " First call already found a warm cache."));
  process.exit(0);
}
console.log(`VERDICT: CACHING DID NOT WORK on ${model}. A marker was sent but the second call read 0 tokens from cache. ` +
  "Either the prefix is below the model's floor or something in the prefix varies between requests.");
process.exit(1);
