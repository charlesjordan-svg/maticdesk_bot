/**
 * Measure the shipped prompt prefix with messages.count_tokens, against the prompt-caching floor.
 *
 * Why: the 2026-09-02 design review estimated the system prompt plus tool catalog at ~1,500 tokens
 * (4 chars/token) and noted that Haiku 4.5's minimum cacheable prefix is 4,096 tokens, so caching
 * would silently do nothing on the routine model. It asked for the estimate to be confirmed with
 * count_tokens before the cost model relied on it. This script is that confirmation, and it stays
 * in the repo so the number can be re-measured whenever prompt.js or catalog.json changes.
 *
 * It builds EXACTLY the request src/agent/cloud-client.js sends - same systemPrompt(), same
 * toolsFromCatalog() shape (strict, whenNotToUse appended), same escalate tool, same tool_choice -
 * by constructing a CloudClient and reading its `tools`, so the two cannot drift.
 *
 * Usage:  node eval/count-tokens.mjs [model]      (default: the model in config.json)
 * Needs ANTHROPIC_API_KEY in the environment or in .env. Costs nothing: count_tokens is free.
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CloudClient } from "../src/agent/cloud-client.js";
import { systemPrompt, machineStateBlock } from "../src/agent/prompt.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(join(ROOT, ".env")); } catch { /* no .env; rely on the environment */ }

const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const model = process.argv[2] ?? config.model;
const catalog = JSON.parse(readFileSync(join(ROOT, "src/broker/catalog.json"), "utf8"));
for (const c of catalog.capabilities) c.tierInfo = catalog.tiers?.[c.tier] ?? null; // as the broker does

/** Minimum cacheable prefix per model, from the prompt-caching docs (read 2026-09-03). */
const CACHE_FLOOR = {
  "claude-haiku-4-5": 4096,
  "claude-sonnet-5": 1024,
  "claude-opus-5": 512,
};

const cloud = new CloudClient({ model, capabilities: catalog.capabilities, onLog: () => {} });
const system = systemPrompt(catalog.capabilities);
const tools = cloud.tools;

// A representative turn: the machine-state block the app sends, plus a short user sentence.
const probe = {
  online: true,
  services: {
    spooler: { name: "spooler", stateName: "RUNNING", canStop: true },
    audiosrv: { name: "audiosrv", stateName: "RUNNING", canStop: true },
    dnscache: { name: "dnscache", stateName: "RUNNING", canStop: false },
    dhcp: { name: "dhcp", stateName: "RUNNING", canStop: true },
  },
  adapters: [{ index: 12, description: "Intel(R) Wi-Fi 6 AX201", ip: "192.168.1.42", gateway: "192.168.1.1", dhcpEnabled: true, hasIp: true, guid: "{A1B2C3D4-0000-0000-0000-00000000BEEF}" }],
};
const userTurn = `${machineStateBlock(probe)}\n\nThe user says: my printer isn't working, nothing comes out`;

const client = new Anthropic();
const count = async (label, params) => {
  const r = await client.messages.countTokens({ model, ...params });
  return { label, input_tokens: r.input_tokens };
};

// A message is required by the endpoint, so a one-token placeholder is used to isolate the parts.
const stub = [{ role: "user", content: "." }];
const rows = [];
rows.push(await count("placeholder message only", { messages: stub }));
rows.push(await count("system prompt + placeholder", { system, messages: stub }));
rows.push(await count("system + tools (tool_choice any) + placeholder", { system, tools, tool_choice: { type: "any" }, messages: stub }));
rows.push(await count("system + tools (tool_choice auto) + placeholder", { system, tools, tool_choice: { type: "auto" }, messages: stub }));
rows.push(await count("tools only (tool_choice any) + placeholder", { tools, tool_choice: { type: "any" }, messages: stub }));
rows.push(await count("full shipped turn: system + tools + machine state + user sentence", {
  system, tools, tool_choice: { type: "any" }, messages: [{ role: "user", content: userTurn }],
}));

const by = (l) => rows.find((r) => r.label.startsWith(l)).input_tokens;
const base = by("placeholder");
const systemOnly = by("system prompt") - base;
const prefixAny = by("system + tools (tool_choice any)") - base;
const prefixAuto = by("system + tools (tool_choice auto)") - base;
const toolsAny = by("tools only") - base;
const fullTurn = by("full shipped turn");
const floor = CACHE_FLOOR[model] ?? null;

const result = {
  measuredAt: new Date().toISOString(),
  model,
  sdk: "@anthropic-ai/sdk",
  rows,
  derived: {
    systemPromptTokens: systemOnly,
    toolsPlusToolUseOverheadTokens_toolChoiceAny: toolsAny,
    cacheablePrefixTokens_toolChoiceAny: prefixAny,
    cacheablePrefixTokens_toolChoiceAuto: prefixAuto,
    fullShippedTurnTokens: fullTurn,
    characters: { system: system.length, toolsJson: JSON.stringify(tools).length },
    charsPerToken_prefix: Number(((system.length + JSON.stringify(tools).length) / prefixAny).toFixed(2)),
  },
  cacheFloor: floor,
  verdict: floor === null
    ? "no documented floor for this model in this script"
    : prefixAny >= floor
      ? `prefix (${prefixAny}) is at or above the ${floor}-token floor: cache_control would work on ${model}`
      : `prefix (${prefixAny}) is BELOW the ${floor}-token floor by ${floor - prefixAny} tokens: cache_control would silently do nothing on ${model}`,
  note: "src/agent/cloud-client.js currently sets no cache_control at all, so caching is not attempted on any model today.",
};
console.log(JSON.stringify(result, null, 2));
