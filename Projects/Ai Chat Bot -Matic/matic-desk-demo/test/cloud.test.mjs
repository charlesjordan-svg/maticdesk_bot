/**
 * Diagnostic for the cloud path — bisects the real request to find what the API rejects.
 *
 * The first version of this file only ever sent ONE tool and so proved nothing about the
 * request the app actually makes, which sends five. This version sends the exact app request
 * first, then each tool on its own to isolate the offender.
 *
 * Reads ANTHROPIC_API_KEY from .env or the environment and NEVER prints it.
 * Run: node test/cloud.test.mjs
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { CloudClient } from "../src/agent/cloud-client.js";
import { probeMachine } from "../src/broker/capabilities/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

if (!process.env.ANTHROPIC_API_KEY) {
  try { process.loadEnvFile(join(ROOT, ".env")); } catch { /* handled below */ }
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.log("No ANTHROPIC_API_KEY found in the environment or .env — nothing to test.");
  process.exit(1);
}
console.log("key: present (value never printed)");

const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const catalog = JSON.parse(readFileSync(join(ROOT, "src/broker/catalog.json"), "utf8"));
const client = new Anthropic();
console.log(`model: ${config.model}`);

// Build the client exactly as the app does, so we test the real tool list and prompts.
const cloud = new CloudClient({
  model: config.model,
  capabilities: catalog.capabilities,
  onLog: () => {},
});
console.log(`tools the app sends: ${cloud.tools.map((t) => t.name).join(", ")}\n`);

const messages = [{
  role: "user",
  content: "The print spooler service is STOPPED on this machine. The user says their printer will not print.",
}];
const system = "You are an IT support assistant. You propose a fix by calling exactly one tool. You never execute anything yourself.";

/** Every attempt is recorded so the verdict reflects set-level results too, not just step 2. */
const setResults = [];

async function attempt(label, body) {
  process.stdout.write(`${label.padEnd(52)} `);
  try {
    const r = await client.messages.create(body);
    const call = r.content.find((b) => b.type === "tool_use");
    console.log(`OK    ${call ? call.name : `no tool call (${r.stop_reason})`}`);
    setResults.push({ label, ok: true });
    return { ok: true };
  } catch (err) {
    const type = err.error?.error?.type ?? "unknown";
    const msg = err.error?.error?.message ?? err.message ?? String(err);
    console.log(`FAIL  ${err.status ?? "?"} ${type}`);
    console.log(`      ${msg}`);
    setResults.push({ label, ok: false, msg });
    return { ok: false, msg };
  }
}

console.log("--- 1. the whole tool set, which the earlier diagnostic never tested ---");
await attempt("all 5 tools + tool_choice:any", {
  model: config.model, max_tokens: 2048, system,
  tools: cloud.tools,
  tool_choice: { type: "any" },
  messages,
});

console.log("--- 1a. the ORIGINAL failing shape: all 5 tools WITH strict:true ---");
await attempt("all 5 tools + strict:true + tool_choice:any", {
  model: config.model, max_tokens: 2048, system,
  tools: cloud.tools.map((t) => ({ ...t, strict: true })),
  tool_choice: { type: "any" },
  messages,
});

console.log("--- 1b. the real app path, end to end through CloudClient ---");
{
  const probe = probeMachine();
  const summary = { online: probe.online ? "yes" : "no" };
  const res = await cloud.propose("my laptop screen is cracked", { probe, summary });
  if (res.ok) {
    console.log(`  OK    ${res.escalate ? `escalate -> ${JSON.stringify(res.escalation)}` : `${res.proposal.capabilityId} ${JSON.stringify(res.proposal.parameters)}`}`);
  } else {
    console.log(`  FAIL  ${res.error}`);
  }
}

console.log("\n--- 2. each tool on its own (finds the offender) ---");
const failures = [];
for (const tool of cloud.tools) {
  const r = await attempt(`only ${tool.name}`, {
    model: config.model, max_tokens: 2048, system,
    tools: [tool],
    tool_choice: { type: "any" },
    messages,
  });
  if (!r.ok) failures.push({ tool, msg: r.msg });
}

console.log("\n--- 3. verdict ---");
if (failures.length === 0 && setResults.every((r) => r.ok)) {
  console.log("Every tool is accepted individually AND as a set, with and without strict.");
  console.log("If the app still 400s, the cause is outside the tool schemas —");
  console.log("read the [cloud] API line in the dev log panel.");
} else if (failures.length === 0) {
  // A set-level failure with every tool passing alone means the offending keyword is only
  // rejected under the stricter validation path, not by the tool in isolation.
  console.log("Each tool passes ALONE, but a set-level request failed:");
  for (const r of setResults.filter((x) => !x.ok)) console.log(`  ${r.label}\n    ${r.msg}`);
  console.log("Read the `tools.N.custom` index in that message — N is the offending tool.");
} else {
  for (const f of failures) {
    console.log(`REJECTED TOOL: ${f.tool.name}`);
    console.log(`  API said: ${f.msg}`);
    console.log(`  schema sent:\n${JSON.stringify(f.tool, null, 2).split("\n").map((l) => "    " + l).join("\n")}`);
  }
}
