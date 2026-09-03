// @ts-check
/**
 * The prompt, shared by every model provider.
 *
 * This is not tidiness. The §4 bake-off compares MODELS. If the cloud provider and a local one
 * word the system prompt differently, the bake-off measures the wording and reports it as a
 * property of the model. One definition, imported by both, is what makes the comparison mean
 * anything.
 *
 * Nothing here is privileged and nothing here decides anything - it is text handed to a model
 * that can only ever propose (§5).
 *
 * @typedef {import("../broker/broker.d.ts").Capability} Capability
 */

/**
 * @param {Capability[]} capabilities
 * @returns {string}
 */
export function systemPrompt(capabilities) {
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

/**
 * The machine facts the model is allowed to see.
 *
 * Deliberately NOT the whole probe, and deliberately no identity: `computer` and `user` are shown
 * in the facts panel and never sent to a model. Tests assert that. See Agent.identify().
 */
export function machineStateBlock(probe) {
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

/**
 * The escalation tool's schema, shared for the same reason as the prompt.
 *
 * `category` and `suggestedOwner` are closed enums. That matters more than it looks: unlike a
 * capability proposal, an escalation is NOT re-validated by the broker - it goes straight to the
 * UI, and the transcript speaks the owner aloud. Whatever a model puts here is what the room
 * hears. See OpenAICompatibleClient, which enforces this itself because not every server will.
 */
export const ESCALATION_CATEGORIES = [
  "hardware",
  "account_or_licensing",
  "server_side_outage",
  "physical",
  "needs_human_judgement",
  "other",
];

export const ESCALATION_OWNERS = [
  "desktop_support",
  "network_team",
  "identity_team",
  "vendor",
  "facilities",
];

export const ESCALATION_DESCRIPTION =
  "Use this when nothing in your capability list can fix the problem, or when the problem is " +
  "outside this machine (hardware failure, account/licensing, server-side outage, physical issue). " +
  "Do not guess at a capability that does not fit.";

/** JSON Schema for the escalation payload, in the subset the broker's validator understands. */
export function escalationSchema() {
  return {
    type: "object",
    properties: {
      summary: { type: "string", description: "One or two sentences on what the user is reporting." },
      category: { type: "string", enum: [...ESCALATION_CATEGORIES] },
      whatWasChecked: { type: "string", description: "What was already established from the machine state provided." },
      suggestedOwner: { type: "string", enum: [...ESCALATION_OWNERS] },
    },
    required: ["summary", "category", "whatWasChecked", "suggestedOwner"],
    additionalProperties: false,
  };
}

/**
 * The parameter schema for one capability, as sent to a model: the catalog's own parameters plus
 * the two fields every provider asks for. Generated from the catalog so the two cannot drift.
 *
 * @param {Capability} capability
 */
export function capabilityToolSchema(capability) {
  return {
    type: "object",
    properties: {
      ...capability.parameters.properties,
      reasoning: { type: "string", description: "Why this is the right fix, in one sentence, for the user to read." },
      confidence: { type: "number", description: "0 to 1. Be honest - a low number is better than a wrong fix." },
    },
    required: [...(capability.parameters.required ?? []), "reasoning", "confidence"],
    additionalProperties: false,
  };
}
