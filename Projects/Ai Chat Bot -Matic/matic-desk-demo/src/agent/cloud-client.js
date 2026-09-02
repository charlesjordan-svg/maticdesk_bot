// @ts-check
/**
 * Anthropic client. The model PROPOSES; it never executes (§5).
 *
 * Two deliberate choices here:
 *
 * 1. The tool surface is GENERATED FROM catalog.json - one tool per capability, named after the
 *    capability id. The catalog stays the single source of truth, and the model is structurally
 *    unable to name a capability that is not in it. Each tool therefore has exactly its own
 *    parameters, all required, additionalProperties:false, so `strict: true` applies cleanly.
 *
 * 2. Tool use here is ONLY an output-schema mechanism. The result is read as data and handed to
 *    the broker, which re-validates it from scratch. Nothing the model returns is trusted, and
 *    no model-supplied string is ever used as a command argument.
 *
 * @typedef {import("../broker/broker.d.ts").Proposal} Proposal
 */
import Anthropic from "@anthropic-ai/sdk";

const ESCALATE_TOOL = {
  name: "escalate",
  description:
    "Use this when nothing in your capability list can fix the problem, or when the problem is " +
    "outside this machine (hardware failure, account/licensing, server-side outage, physical issue). " +
    "Do not guess at a capability that does not fit.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "One or two sentences on what the user is reporting." },
      category: {
        type: "string",
        enum: ["hardware", "account_or_licensing", "server_side_outage", "physical", "needs_human_judgement", "other"],
      },
      whatWasChecked: { type: "string", description: "What was already established from the machine state provided." },
      suggestedOwner: { type: "string", enum: ["desktop_support", "network_team", "identity_team", "vendor", "facilities"] },
    },
    required: ["summary", "category", "whatWasChecked", "suggestedOwner"],
    additionalProperties: false,
  },
  strict: true,
};

/**
 * JSON Schema keywords that a `strict: true` tool schema rejects.
 *
 * Verified against the live API: sending `renew_dhcp` with `{"type":"integer","minimum":0}`
 * under strict mode returns
 *   400 invalid_request_error - tools.2.custom: For 'integer' type, property 'minimum' is not supported
 *
 * So the WIRE schema carries only the strict-safe subset. The FULL catalog schema - `minimum`
 * included - is still enforced by the broker's own validator, which re-validates every proposal
 * from scratch and is the actual gate (§5). Nothing is loosened; the constraint just moves to the
 * layer that is allowed to express it.
 */
const STRICT_UNSUPPORTED_KEYWORDS = new Set([
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minLength", "maxLength", "pattern", "format",
  "minItems", "maxItems", "uniqueItems", "default",
]);

/** Recursively strip keywords strict mode will not accept. */
function strictSafeSchema(node) {
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(strictSafeSchema);
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (STRICT_UNSUPPORTED_KEYWORDS.has(key)) continue;
    out[key] = strictSafeSchema(value);
  }
  return out;
}

/** One tool per capability, built from the catalog so the two can never drift apart. */
function toolsFromCatalog(capabilities) {
  return capabilities.map((c) => ({
    name: c.id,
    description: `${c.title}. ${c.description} Risk tier ${c.tier}.`,
    input_schema: strictSafeSchema({
      type: "object",
      properties: {
        ...c.parameters.properties,
        reasoning: { type: "string", description: "Why this is the right fix, in one sentence, for the user to read." },
        confidence: { type: "number", description: "0 to 1. Be honest - a low number is better than a wrong fix." },
      },
      required: [...(c.parameters.required ?? []), "reasoning", "confidence"],
      additionalProperties: false,
    }),
    // Verified working on claude-haiku-4-5 once the schema is sanitized above. This guarantees
    // the model's tool arguments validate against the schema, on top of - never instead of - the
    // broker's own validation.
    strict: true,
  }));
}

function systemPrompt(capabilities) {
  return [
    "You are Matic Desk, an IT support assistant running as software ON the user's Windows machine.",
    "",
    "You do not execute anything yourself. You choose one capability from your tool list and propose it.",
    "A separate privileged broker then validates your proposal, asks the user to consent, and only then acts.",
    "",
    "Rules:",
    "- Use the live machine state you are given. Prefer what it actually shows over what is usually true.",
    "- Choose exactly one tool.",
    "- If nothing in your tool list fits the problem, call escalate. Never bend an unrelated capability to fit.",
    "- Be honest in `confidence`. A low confidence is useful; a confident wrong fix is not.",
    "- `reasoning` is shown to the user. Write it in plain language, no jargon, one sentence.",
    "",
    "Your capabilities are limited to exactly these:",
    ...capabilities.map((c) => `- ${c.id} (tier ${c.tier}): ${c.description}`),
  ].join("\n");
}

function machineStateBlock(summary, probe) {
  const adapters = probe.adapters
    .filter((a) => a.dhcpEnabled || a.hasIp)
    .map((a) => `  - [index ${a.index}] ${a.description}: ip=${a.ip || "none"} gateway=${a.gateway || "none"} dhcp=${a.dhcpEnabled} guid=${a.guid}`)
    .join("\n");
  const services = Object.values(probe.services)
    .map((s) => `  - ${s.name}: ${s.stateName ?? "unreadable"}${s.stateName === "RUNNING" && s.canStop === false ? " (cannot be stopped)" : ""}`)
    .join("\n");
  return [
    "Live state of this machine, read just now:",
    `  online: ${probe.online ? "yes" : "no"}`,
    "Services:",
    services,
    "Network adapters:",
    adapters || "  (none reported)",
  ].join("\n");
}

export class CloudClient {
  constructor({ model, capabilities, onLog = () => {} }) {
    this.model = model;
    this.capabilities = capabilities;
    this.onLog = onLog;
    this.tools = [...toolsFromCatalog(capabilities), ESCALATE_TOOL];
    this.available = Boolean(process.env.ANTHROPIC_API_KEY);
    this.client = this.available ? new Anthropic() : null;
  }

  /**
   * @returns {Promise<{ok:boolean, proposal?:Proposal, reply?:string, escalate?:boolean, escalation?:object, error?:string}>}
   * Never throws - an unreachable model must degrade to tier-0, not crash a turn.
   */
  async propose(text, { probe, summary }) {
    if (!this.available) {
      return {
        ok: false,
        error: "ANTHROPIC_API_KEY is not set, so no cloud call was made.",
      };
    }
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: systemPrompt(this.capabilities),
        tools: this.tools,
        // Force a tool call so the reply is always schema-shaped. This is the whole reason
        // tool use is here - it is an output-schema mechanism, not an execution mechanism (§5).
        tool_choice: { type: "any" },
        messages: [
          {
            role: "user",
            content: `${machineStateBlock(summary, probe)}\n\nThe user says: ${text}`,
          },
        ],
      });

      const call = response.content.find((b) => b.type === "tool_use");
      if (!call) {
        return { ok: false, error: `the model returned no tool call (stop_reason ${response.stop_reason}).` };
      }
      this.onLog(`[cloud] ${this.model} chose ${call.name} (in ${response.usage.input_tokens}/out ${response.usage.output_tokens} tokens)`);

      if (call.name === "escalate") {
        const e = call.input;
        return {
          ok: true,
          escalate: true,
          escalation: e,
          reply:
            `This one I can't fix from here. ${e.summary} ` +
            `I would hand this to ${String(e.suggestedOwner).replace(/_/g, " ")}.`,
        };
      }

      // Split the model's output into capability parameters vs. its commentary. Only fields the
      // catalog declares are carried into `parameters`; anything else the model invented is dropped
      // here and would be rejected by the broker's validator regardless.
      const capability = this.capabilities.find((c) => c.id === call.name);
      if (!capability) {
        return { ok: false, error: `the model named a capability that is not in the catalog: ${call.name}` };
      }
      const { reasoning, confidence, ...rest } = call.input;
      const parameters = {};
      for (const key of Object.keys(capability.parameters.properties ?? {})) {
        if (Object.hasOwn(rest, key)) parameters[key] = rest[key];
      }

      /** @type {Proposal} */
      const proposal = {
        capabilityId: call.name,
        parameters,
        reasoning: String(reasoning ?? ""),
        confidence: Number(confidence ?? 0),
        source: "cloud",
      };
      return { ok: true, proposal, reply: proposal.reasoning };
    } catch (err) {
      // Typed SDK errors, most specific first.
      if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: "The API key was rejected." };
      if (err instanceof Anthropic.RateLimitError) return { ok: false, error: "The model is rate limited right now." };
      if (err instanceof Anthropic.APIConnectionError) return { ok: false, error: "Could not reach the model - this machine may be offline." };
      if (err instanceof Anthropic.APIError) {
        // A bare status code is not diagnosable on stage. Dig the API's own message out of the
        // parsed body and log it in full, then hand back a short version for the transcript.
        const apiMessage = err.error?.error?.message ?? err.error?.message ?? err.message ?? "no detail";
        const apiType = err.error?.error?.type ?? "unknown_error";
        this.onLog(`[cloud] API ${err.status} ${apiType}: ${apiMessage}`);
        return { ok: false, error: `Model API error ${err.status} (${apiType}): ${apiMessage}` };
      }
      this.onLog(`[cloud] unexpected: ${err.stack ?? err.message}`);
      return { ok: false, error: `Unexpected error calling the model: ${err.message}` };
    }
  }
}
