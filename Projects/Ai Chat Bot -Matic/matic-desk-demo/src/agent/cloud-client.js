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
import {
  systemPrompt,
  machineStateBlock,
  escalationSchema,
  capabilityToolSchema,
  ESCALATION_DESCRIPTION,
} from "./prompt.js";

const ESCALATE_TOOL = {
  name: "escalate",
  description: ESCALATION_DESCRIPTION,
  input_schema: escalationSchema(),
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
    description: `${c.title}. ${c.description} Risk tier ${c.tier}.${c.whenNotToUse ? ` WHEN NOT TO USE: ${c.whenNotToUse}` : ""}`,
    // Shared shape, then sanitized for what strict mode on THIS API will accept.
    input_schema: strictSafeSchema(capabilityToolSchema(c)),
    // Verified working on claude-haiku-4-5 once the schema is sanitized above. This guarantees
    // the model’s tool arguments validate against the schema, on top of - never instead of - the
    // broker’s own validation. An OpenAI-compatible server offers no such guarantee, which is why
    // OpenAICompatibleClient validates its own output.
    strict: true,
  }));
}



export class CloudClient {
  /**
   * @param temperature Left undefined in the app, so the API default applies and nothing about the
   *   demo build changes. The bake-off passes 0: comparing a sampling cloud model against local
   *   models pinned at 0 measures sampling noise and reports it as a difference between models.
   */
  constructor({ model, capabilities, temperature, onLog = () => {} }) {
    this.model = model;
    this.capabilities = capabilities;
    this.onLog = onLog;
    this.temperature = temperature;
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
        ...(this.temperature === undefined ? {} : { temperature: this.temperature }),
        system: systemPrompt(this.capabilities),
        tools: this.tools,
        // Force a tool call so the reply is always schema-shaped. This is the whole reason
        // tool use is here - it is an output-schema mechanism, not an execution mechanism (§5).
        tool_choice: { type: "any" },
        messages: [
          {
            role: "user",
            content: `${machineStateBlock(probe)}\n\nThe user says: ${text}`,
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
      // `reason` distinguishes "the request never left this machine" from "the API answered and
      // said no". Only the former is evidence about the network, and the state-only fallback
      // relies on that distinction - see routeByState().
      if (err instanceof Anthropic.APIConnectionError) {
        return { ok: false, reason: "connection", error: "Could not reach the model - this machine may be offline." };
      }
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
