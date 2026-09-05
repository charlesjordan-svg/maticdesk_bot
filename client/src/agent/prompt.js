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

/**
 * How an owner is SAID, as opposed to how it is stored. Generated from ESCALATION_OWNERS would be
 * wrong: `identity_team` de-underscored is "identity team", and the avatar has to say "the identity
 * team". A table, so the spoken form is a decision and not a string transform.
 */
export const ESCALATION_OWNER_LABELS = {
  desktop_support: "desktop support",
  network_team: "the network team",
  identity_team: "the identity team",
  vendor: "the vendor",
  facilities: "facilities",
};

export const ESCALATION_DESCRIPTION =
  "Use this when nothing in your capability list can fix the problem, or when the problem is " +
  "outside this machine (hardware failure, account/licensing, server-side outage, physical issue). " +
  "Do not guess at a capability that does not fit.";

/** JSON Schema for the escalation payload, in the subset the broker's validator understands. */
export function escalationSchema() {
  return {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description:
          "One or two sentences for the IT person who will pick this ticket up. Write it about the " +
          "user, in the third person, as a case note - this is NOT said to the user and is never " +
          "read aloud.",
      },
      category: { type: "string", enum: [...ESCALATION_CATEGORIES] },
      whatWasChecked: { type: "string", description: "What was already established from the machine state provided." },
      suggestedOwner: { type: "string", enum: [...ESCALATION_OWNERS] },
    },
    required: ["summary", "category", "whatWasChecked", "suggestedOwner"],
    additionalProperties: false,
  };
}

/**
 * WHAT THE AVATAR SAYS WHEN IT ESCALATES. Client-shipped text, generated here, spoken by the UI.
 *
 * ==============================================================================================
 * THIS EXISTS BECAUSE OF A DEFECT FOUND ON SCREEN ON 2026-09-04 (D214). All three providers built
 * the spoken reply as:
 *
 *     `This one I can't fix from here. ${escalation.summary} I would hand this to ${owner}.`
 *
 * `summary` is schema'd as a CASE NOTE FOR THE ASSIGNEE, written in the third person - so the
 * avatar said "The user reports a cracked screen. I would hand this to desktop support." One
 * string was serving two audiences, and the model was obeying its instructions exactly. The
 * register was wrong, not the model.
 *
 * Two things follow, and both are the point:
 *
 * 1. **`summary` never reaches the user.** It goes in the ticket, where its audience is. The
 *    schema now says so in the field description, which is where a model actually reads it.
 * 2. **The spoken line is GENERATED HERE, not authored by a model.** Same principle as D165's
 *    capability answer: a hand-written list is a claim and a generated one is a fact. It also
 *    means the avatar's register cannot drift turn to turn, which is the failure a model-authored
 *    line invites.
 *
 * AND IT IS AN OFFER, NOT A REPORT. "I would hand this to desktop support" is reported speech
 * with nothing for the user to answer - which is why "yes please hand to it" landed nowhere on
 * 2026-09-04. The line ends in a question because the next turn is expected to answer it
 * (see src/ticket/intake.js).
 * ==============================================================================================
 *
 * `canFile` SAYS WHETHER THIS BUILD CAN ACTUALLY OPEN A TICKET. It is a parameter rather than
 * something the caller patches out of the returned string, because the two forms are two
 * sentences, not one sentence with an optional clause — and a caller editing prose by regular
 * expression is a coupling that breaks silently the first time either side is reworded. Providers
 * do not know whether filing is wired, so they get the default; `Agent.propose` knows and
 * regenerates. There is no configuration in which the offer is spoken and cannot be honoured.
 *
 * @param {{ suggestedOwner?: string|null }} escalation
 * @param {{ canFile?: boolean }} [opts]
 * @returns {string}
 */
export function escalationReply(escalation, { canFile = true } = {}) {
  const owner = ESCALATION_OWNER_LABELS[escalation?.suggestedOwner];
  // No owner is a real outcome, not an error: the model is told not to guess, and an unroutable
  // problem is still worth a ticket. Saying so plainly beats naming a team at random.
  const cannotFix = owner
    ? `I can't fix this one from here — it needs ${owner}.`
    : "I can't fix this one from here, and I can't tell from what I have who it should go to.";

  if (!canFile) {
    // No offer, because there is nothing behind one. Ends in a statement, so nothing is waiting
    // for an answer that no code would hear.
    return `${cannotFix} This build cannot open a ticket, so nothing has been filed.`;
  }
  const offer = owner
    ? "I can open a ticket for you and include what I've already checked."
    : "I can still open a ticket and let IT route it, with what I've already checked.";
  return `${cannotFix} ${offer} Would you like me to?`;
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
