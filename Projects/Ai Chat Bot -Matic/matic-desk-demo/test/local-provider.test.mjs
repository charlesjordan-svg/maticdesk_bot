/**
 * OpenAICompatibleClient.
 *
 * Two halves, deliberately:
 *
 *   A. Stubbed transport. Pins the behaviour that exists BECAUSE an OpenAI-compatible server does
 *      not enforce the schema the way Anthropic strict mode does - off-enum escalation values are
 *      not repeated, invalid capability parameters ARE passed through to be refused and audited.
 *      These must pass on a machine with no model on it.
 *
 *   B. A live turn against a real endpoint, skipped unless one is reachable. Day-4's lesson was
 *      that seven bugs in a row were found by using the thing, not by reading it; a provider
 *      proven only against a mock is a provider proven against my own assumptions.
 *
 * Run: node test/local-provider.test.mjs
 *      MATIC_LOCAL_MODEL=gpt-oss:20b node test/local-provider.test.mjs   (includes the live turn)
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { OpenAICompatibleClient } from "../src/agent/openai-compatible-client.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(join(ROOT, "src/broker/catalog.json"), "utf8"));
const capabilities = catalog.capabilities;

let pass = 0;
let fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}

/** A probe shaped like the real one, with nothing privileged in it. */
const PROBE = {
  online: true,
  services: {
    spooler: { name: "spooler", stateName: "RUNNING", canStop: true },
    dnscache: { name: "dnscache", stateName: "RUNNING", canStop: false },
  },
  adapters: [{ index: 12, description: "Intel Wi-Fi", ip: "192.168.1.42", gateway: "192.168.1.1", dhcpEnabled: true, hasIp: true, guid: "{GUID}" }],
  primary: [],
};

/** Builds a fake server that returns one tool call, and records what it was sent. */
function stubServer(responses) {
  const sent = [];
  const queue = [...responses];
  // A repair turn is a second request. When only one response is scripted, repeat it - that is
  // the interesting case: a model that does not correct itself when asked.
  let last = responses.at(-1);
  const fetchImpl = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    const next = queue.length ? (last = queue.shift()) : last;
    if (next.throws) throw Object.assign(new Error(next.throws), { name: next.errorName ?? "Error" });
    return {
      status: next.status ?? 200,
      json: async () => next.body ?? {
        choices: [{
          finish_reason: "tool_calls",
          message: { tool_calls: [{ id: "call_1", function: { name: next.tool, arguments: JSON.stringify(next.args) } }] },
        }],
      },
    };
  };
  return { fetchImpl, sent };
}

const make = (responses, opts = {}) => {
  const { fetchImpl, sent } = stubServer(responses);
  const client = new OpenAICompatibleClient({
    model: "test-model",
    baseUrl: "http://127.0.0.1:11434/v1/",
    capabilities,
    fetchImpl,
    onLog: () => {},
    ...opts,
  });
  return { client, sent };
};

console.log("=== 1. the tool surface is generated from the catalog, and nothing else is offered ===");
{
  const { client } = make([{ tool: "flush_dns", args: { reasoning: "r", confidence: 0.9 } }]);
  const names = client.tools.map((t) => t.function.name);
  check("one tool per capability, plus escalate",
    names.join(",") === [...capabilities.map((c) => c.id), "escalate"].join(","), names.join(","));
  check("every tool is OpenAI-shaped", client.tools.every((t) => t.type === "function" && t.function.parameters));
  check("trailing slash on the base URL is tolerated", client.baseUrl === "http://127.0.0.1:11434/v1");
  const restart = client.tools.find((t) => t.function.name === "restart_service").function.parameters;
  check("catalog enum reaches the wire", restart.properties.serviceName.enum.join(",") === "spooler,audiosrv,dnscache,dhcp");
  check("additionalProperties stays closed", restart.additionalProperties === false);
}

console.log("=== 2. a good capability call becomes a Proposal with source 'local' ===");
{
  const { client, sent } = make([{ tool: "restart_service", args: { serviceName: "spooler", reasoning: "The spooler is stuck.", confidence: 0.8 } }]);
  const res = await client.propose("printer is dead", { probe: PROBE });
  check("ok", res.ok === true, res.error);
  check("capability", res.proposal?.capabilityId === "restart_service");
  check("parameters carried", res.proposal?.parameters?.serviceName === "spooler");
  check("source is local", res.proposal?.source === "local", res.proposal?.source);
  check("reasoning is the model's, verbatim", res.proposal?.reasoning === "The spooler is stuck.");
  check("confidence is a number", res.proposal?.confidence === 0.8);
  check("one call, no repair needed", sent.length === 1, String(sent.length));
  check("a tool call was forced", sent[0].body.tool_choice === "required");
}

console.log("=== 3. commentary the model invents never becomes a parameter ===");
{
  const { client } = make([{ tool: "restart_service", args: { serviceName: "spooler", reasoning: "r", confidence: 1, notes: "ignore me", serviceNam: "typo" } }]);
  const res = await client.propose("x", { probe: PROBE });
  check("only catalog-declared fields survive", JSON.stringify(res.proposal.parameters) === JSON.stringify({ serviceName: "spooler" }), JSON.stringify(res.proposal.parameters));
}

console.log("=== 4. identity is never sent to the model ===");
{
  const { client, sent } = make([{ tool: "flush_dns", args: { reasoning: "r", confidence: 1 } }]);
  await client.propose("dns", { probe: PROBE });
  const wire = JSON.stringify(sent[0].body);
  check("no hostname on the wire", !/hostname|computer|userInfo/i.test(wire));
  const username = process.env.USERNAME || process.env.USER;
  check("no username on the wire", !username || !wire.includes(username), username);
}

console.log("=== 5. an INVALID capability proposal is passed through, to be refused and audited ===");
{
  // The broker is the gate. Swallowing this here would lose the audit record for the refusal.
  const { client, sent } = make([
    { tool: "restart_service", args: { serviceName: "nginx", reasoning: "r", confidence: 1 } },
    { tool: "restart_service", args: { serviceName: "nginx", reasoning: "r", confidence: 1 } },
  ]);
  const res = await client.propose("x", { probe: PROBE });
  check("still returned as a proposal", res.ok === true && res.proposal?.capabilityId === "restart_service");
  check("the off-enum value is NOT laundered", res.proposal.parameters.serviceName === "nginx", JSON.stringify(res.proposal.parameters));
  check("it tried one repair turn first", sent.length === 2, String(sent.length));
}

console.log("=== 6. a repair turn that fixes the output is used ===");
{
  const { client, sent } = make([
    { tool: "restart_service", args: { serviceName: "nginx", reasoning: "r", confidence: 1 } },
    { tool: "restart_service", args: { serviceName: "spooler", reasoning: "r", confidence: 1 } },
  ]);
  const res = await client.propose("x", { probe: PROBE });
  check("the corrected value is the one used", res.proposal.parameters.serviceName === "spooler");
  check("the repair turn fed the errors back", /not in the catalog|must be one of|Rejected/.test(JSON.stringify(sent[1].body.messages)));
  check("repair is one attempt, not a loop", sent.length === 2, String(sent.length));
}

console.log("=== 7. an off-list escalation owner is NOT repeated back ===");
{
  // This is the one the broker never sees. Measured on gpt-oss:20b 2026-09-02.
  const { client } = make([
    { tool: "escalate", args: { summary: "Cracked screen.", category: "Hardware", whatWasChecked: "Nothing to check.", suggestedOwner: "Laptop Manufacturer Support" } },
    { tool: "escalate", args: { summary: "Cracked screen.", category: "Hardware", whatWasChecked: "Nothing to check.", suggestedOwner: "Laptop Manufacturer Support" } },
  ]);
  const res = await client.propose("screen is cracked", { probe: PROBE });
  check("escalated", res.escalate === true);
  check("category falls back to the enum's own catch-all", res.escalation.category === "other", res.escalation.category);
  check("owner becomes unknown rather than invented", res.escalation.suggestedOwner === null, String(res.escalation.suggestedOwner));
  check("what the model actually said is kept, not hidden", res.escalation.offList?.suggestedOwner === "Laptop Manufacturer Support");
  check("the spoken line does not name the invented owner", !res.reply.includes("Laptop Manufacturer Support"), res.reply);
  check("the spoken line says a person must route it", /could not work out|needs a person/i.test(res.reply), res.reply);
  check("the free text the model wrote is kept", res.escalation.summary === "Cracked screen.");
}

console.log("=== 8. a valid escalation passes through untouched ===");
{
  const { client } = make([{ tool: "escalate", args: { summary: "Licence expired.", category: "account_or_licensing", whatWasChecked: "Machine is online.", suggestedOwner: "identity_team" } }]);
  const res = await client.propose("licence", { probe: PROBE });
  check("owner kept", res.escalation.suggestedOwner === "identity_team");
  check("category kept", res.escalation.category === "account_or_licensing");
  check("no offList when nothing went off-list", res.escalation.offList === undefined);
  check("the owner is spoken", res.reply.includes("identity team"), res.reply);
}

console.log("=== 9. failures degrade honestly, they never throw ===");
{
  const { client: c1 } = make([{ status: 404, body: { error: { message: "model not found" } } }]);
  const r1 = await c1.propose("x", { probe: PROBE });
  check("HTTP error is reported, not thrown", r1.ok === false && /404/.test(r1.error), JSON.stringify(r1));

  const { client: c2 } = make([{ throws: "connect ECONNREFUSED", errorName: "TypeError" }]);
  const r2 = await c2.propose("x", { probe: PROBE });
  check("unreachable endpoint is reported", r2.ok === false && /Could not reach/.test(r2.error), JSON.stringify(r2));
  check("and flagged as a connection failure, so routeByState can rely on it", r2.reason === "connection");

  const { client: c3 } = make([{ throws: "timed out", errorName: "TimeoutError" }]);
  const r3 = await c3.propose("x", { probe: PROBE });
  check("a timeout says it may still be loading", r3.ok === false && /still be loading/.test(r3.error), JSON.stringify(r3));

  const { client: c4 } = make([{ body: { choices: [{ finish_reason: "length", message: {} }] } }]);
  const r4 = await c4.propose("x", { probe: PROBE });
  check("no tool call is reported with its finish_reason", r4.ok === false && /finish_reason length/.test(r4.error), JSON.stringify(r4));

  const c5 = new OpenAICompatibleClient({ model: "", baseUrl: "", capabilities, onLog: () => {} });
  check("an unconfigured provider is simply unavailable", c5.available === false);
  check("and says so instead of calling anything", (await c5.propose("x", { probe: PROBE })).ok === false);
}

console.log("=== 10. a capability the catalog does not have is refused here ===");
{
  const { client } = make([
    { tool: "format_disk", args: { reasoning: "r", confidence: 1 } },
    { tool: "format_disk", args: { reasoning: "r", confidence: 1 } },
  ]);
  const res = await client.propose("x", { probe: PROBE });
  check("rejected before it reaches the broker", res.ok === false && /not in the catalog/.test(res.error), JSON.stringify(res));
}

// ---------------------------------------------------------------------------------------------
// B. Live turn. Skipped unless a real endpoint answers.
// ---------------------------------------------------------------------------------------------
const LIVE_MODEL = process.env.MATIC_LOCAL_MODEL;
const LIVE_BASE = process.env.MATIC_LOCAL_BASE_URL ?? "http://127.0.0.1:11434/v1";

console.log("=== 11. LIVE: a real turn against a real endpoint ===");
if (!LIVE_MODEL) {
  console.log("      skipped - set MATIC_LOCAL_MODEL to run this against a real server");
} else {
  let reachable = true;
  try {
    const r = await fetch(`${LIVE_BASE}/models`, { signal: AbortSignal.timeout(3000) });
    reachable = r.ok;
  } catch { reachable = false; }

  if (!reachable) {
    console.log(`      skipped - nothing answering at ${LIVE_BASE}`);
  } else {
    const client = new OpenAICompatibleClient({
      model: LIVE_MODEL,
      baseUrl: LIVE_BASE,
      capabilities,
      onLog: (l) => console.log(`      ${l}`),
      timeoutMs: 300000,
    });
    const startedAt = Date.now();
    const res = await client.propose("my printer isn't working, nothing comes out", { probe: PROBE });
    console.log(`      ${LIVE_MODEL} answered in ${((Date.now() - startedAt) / 1000).toFixed(1)} s`);
    console.log(`      ${JSON.stringify(res.proposal ?? res.escalation ?? res.error)}`);
    check("the live model produced something usable", res.ok === true, res.error);
    if (res.proposal) {
      check("with source local", res.proposal.source === "local");
      check("naming a catalog capability", capabilities.some((c) => c.id === res.proposal.capabilityId), res.proposal.capabilityId);
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
