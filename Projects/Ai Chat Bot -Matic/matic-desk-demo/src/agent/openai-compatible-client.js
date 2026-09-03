// @ts-check
/**
 * OpenAI-compatible model provider. The model PROPOSES; it never executes (§5).
 *
 * This is deliberately NOT an Ollama client. Ollama serves an OpenAI-compatible API at /v1, and so
 * do LM Studio, vLLM, llama.cpp's server, and OpenAI itself. One adapter covers all of them, and a
 * customer pointing this at their own endpoint is a config change, not a code change. Anything
 * server-specific belongs in `extraBody`, not in here.
 *
 * WHY THIS EXISTS AT ALL: cost. Eval iteration runs hundreds of ticket descriptions and that bill
 * grows. Nothing about the safety model changes - the broker re-validates every proposal from
 * scratch, whoever produced it.
 *
 * ---------------------------------------------------------------------------------------------
 * THE ONE THING THAT DIFFERS FROM THE ANTHROPIC CLIENT
 *
 * Anthropic's `strict: true` guarantees tool arguments match the schema. An OpenAI-compatible
 * server does not have to, and Ollama does not: measured 2026-09-02 on a quiet RTX 3090 Ti,
 * gpt-oss:20b returned, reproducibly at temperature 0,
 *
 *     category="Hardware"                          (enum wants "hardware")
 *     suggestedOwner="Laptop Manufacturer Support" (not in the enum at all)
 *     suggestedOwner="Adobe Support"               (not in the enum at all)
 *
 * Every violation was on `escalate`; capability parameters came back clean. That distinction is
 * the whole design here:
 *
 *   - A CAPABILITY proposal is re-validated by the broker. A bad one is refused and audited, which
 *     is the architecture working. So it is passed through unrepaired and allowed to be refused.
 *   - An ESCALATION is not. It goes straight to the inspector, and the transcript SPEAKS the owner
 *     aloud ("I would hand this to ..."). A model that invents "Adobe Support" puts a routing
 *     decision no one chose into the room. So escalations are validated HERE, and an off-list value
 *     is reported as unknown rather than repeated.
 *
 * Same family as H3e: constrain what the model is allowed to influence. It supplies the facts, not
 * the words a human acts on.
 * ---------------------------------------------------------------------------------------------
 *
 * @typedef {import("../broker/broker.d.ts").Proposal} Proposal
 * @typedef {import("../broker/broker.d.ts").Capability} Capability
 */
import { validateAgainstSchema } from "../broker/schema.js";
import {
  systemPrompt,
  machineStateBlock,
  escalationSchema,
  capabilityToolSchema,
  ESCALATION_DESCRIPTION,
  ESCALATION_CATEGORIES,
  ESCALATION_OWNERS,
} from "./prompt.js";

/** One tool per capability plus escalate, in OpenAI shape, generated from the catalog. */
function toolsFromCatalog(capabilities) {
  const tools = capabilities.map((c) => ({
    type: "function",
    function: {
      name: c.id,
      description: `${c.title}. ${c.description} Risk tier ${c.tier}.`,
      parameters: capabilityToolSchema(c),
    },
  }));
  tools.push({
    type: "function",
    function: { name: "escalate", description: ESCALATION_DESCRIPTION, parameters: escalationSchema() },
  });
  return tools;
}

export class OpenAICompatibleClient {
  /**
   * @param {{
   *   model: string,
   *   baseUrl: string,
   *   apiKey?: string,
   *   capabilities: Capability[],
   *   timeoutMs?: number,
   *   extraBody?: Record<string, unknown>,
   *   onLog?: (s: string) => void,
   *   fetchImpl?: typeof fetch,
   * }} deps
   */
  constructor({ model, baseUrl, apiKey, capabilities, timeoutMs = 90000, extraBody = {}, onLog = () => {}, fetchImpl }) {
    this.model = model;
    // Tolerate a trailing slash so a copied-and-pasted endpoint works.
    this.baseUrl = String(baseUrl ?? "").replace(/\/+$/, "");
    // Ollama ignores this; OpenAI and most gateways require it. Sending a placeholder to a server
    // that does not care is harmless, and omitting it from one that does is a confusing 401.
    this.apiKey = apiKey || "not-required";
    this.capabilities = capabilities;
    this.timeoutMs = timeoutMs;
    this.extraBody = extraBody;
    this.onLog = onLog;
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.tools = toolsFromCatalog(capabilities);
    this.schemaFor = new Map(this.tools.map((t) => [t.function.name, t.function.parameters]));
    this.available = Boolean(this.model && this.baseUrl);
  }

  /** One POST to /chat/completions. Throws only on transport failure; HTTP errors are returned. */
  async #call(messages) {
    const res = await this.fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: this.model,
        messages,
        tools: this.tools,
        // Force a tool call so the reply is always schema-shaped. Tool use here is an
        // output-schema mechanism, not an execution mechanism (§5).
        tool_choice: "required",
        temperature: 0,
        // A verbose model can otherwise spend its whole budget reasoning and return
        // finish_reason "length" with no tool call at all - which looks like a refusal to use
        // tools and is not one. Observed on gemma4:12b.
        max_tokens: 2048,
        ...this.extraBody,
      }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  /** Pull the single tool call out of a response, tolerating both argument encodings. */
  #readToolCall(body) {
    const choice = body?.choices?.[0];
    const call = choice?.message?.tool_calls?.[0];
    if (!call) return { error: `the model returned no tool call (finish_reason ${choice?.finish_reason ?? "unknown"}).` };
    const raw = call.function?.arguments;
    let args;
    try {
      // The OpenAI schema says this is a JSON string. Some servers hand back an object instead.
      args = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (err) {
      return { error: `the model's tool arguments were not valid JSON: ${err.message}` };
    }
    if (args === null || typeof args !== "object" || Array.isArray(args)) {
      return { error: "the model's tool arguments were not an object" };
    }
    return { name: call.function?.name, args, rawCall: call };
  }

  /** Errors from the same validator the broker uses, so both halves agree on what valid means. */
  #violations(name, args) {
    const schema = this.schemaFor.get(name);
    if (!schema) return [`"${name}" is not a tool that was offered`];
    return validateAgainstSchema(schema, args, name);
  }

  /**
   * @returns {Promise<{ok:boolean, proposal?:Proposal, reply?:string, escalate?:boolean, escalation?:object, error?:string, reason?:string}>}
   * Never throws - an unreachable model must degrade to tier-0, not crash a turn.
   */
  async propose(text, { probe }) {
    if (!this.available) {
      return { ok: false, error: "No local model endpoint is configured, so no local call was made." };
    }

    const messages = [
      { role: "system", content: systemPrompt(this.capabilities) },
      { role: "user", content: `${machineStateBlock(probe)}\n\nThe user says: ${text}` },
    ];

    try {
      let { status, body } = await this.#call(messages);
      if (status !== 200) {
        const detail = body?.error?.message ?? body?.error ?? JSON.stringify(body).slice(0, 200);
        this.onLog(`[local] HTTP ${status} from ${this.baseUrl}: ${detail}`);
        return { ok: false, error: `Local model endpoint returned ${status}: ${detail}` };
      }

      let read = this.#readToolCall(body);
      if (read.error) return { ok: false, error: read.error };

      let violations = this.#violations(read.name, read.args);

      // One repair turn. The server did not enforce the schema, so ask the model to fix its own
      // output with the errors in front of it. One attempt, not a loop: a model that cannot
      // produce a closed enum on the second try will not manage it on the fifth, and a support
      // assistant that thinks for a minute is worse than one that says it could not work it out.
      if (violations.length) {
        this.onLog(`[local] ${this.model} returned invalid ${read.name} arguments, asking it to correct: ${violations.join("; ")}`);
        const repairMessages = [
          ...messages,
          { role: "assistant", content: null, tool_calls: [read.rawCall] },
          {
            role: "tool",
            tool_call_id: read.rawCall.id ?? "repair",
            content:
              `Rejected. ${violations.join("; ")}. ` +
              `Call the tool again using only values the schema allows. Do not invent enum values.`,
          },
        ];
        const retry = await this.#call(repairMessages);
        if (retry.status === 200) {
          const reread = this.#readToolCall(retry.body);
          if (!reread.error) {
            const stillBad = this.#violations(reread.name, reread.args);
            if (stillBad.length < violations.length) {
              read = reread;
              violations = stillBad;
            }
          }
        }
      }

      if (read.name === "escalate") return this.#escalation(read.args, violations);
      return this.#capabilityProposal(read.name, read.args, violations);
    } catch (err) {
      // `reason: "connection"` distinguishes "the request never left this machine" from "the
      // server answered and said no". Only the former is evidence about the network, and
      // routeByState() relies on that distinction.
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        return { ok: false, reason: "connection", error: `The local model did not answer within ${Math.round(this.timeoutMs / 1000)}s. If it was cold, it may still be loading.` };
      }
      this.onLog(`[local] ${err.stack ?? err.message}`);
      return { ok: false, reason: "connection", error: `Could not reach the local model at ${this.baseUrl}: ${err.message}` };
    }
  }

  /**
   * A capability proposal. Passed through even when it did not validate: the broker re-validates
   * from scratch, refuses it, and AUDITS the refusal naming the gate. That is the architecture
   * working, and hiding it here would remove the record.
   */
  #capabilityProposal(name, args, violations) {
    const capability = this.capabilities.find((c) => c.id === name);
    if (!capability) {
      return { ok: false, error: `the model named a capability that is not in the catalog: ${name}` };
    }
    if (violations.length) {
      this.onLog(`[local] passing an invalid ${name} proposal to the broker to be refused and audited: ${violations.join("; ")}`);
    }

    // Only fields the catalog declares are carried into `parameters`. Anything else the model
    // invented is dropped here, and would be rejected by the broker's validator regardless.
    const { reasoning, confidence, ...rest } = args;
    const parameters = {};
    for (const key of Object.keys(capability.parameters.properties ?? {})) {
      if (Object.hasOwn(rest, key)) parameters[key] = rest[key];
    }

    /** @type {Proposal} */
    const proposal = {
      capabilityId: name,
      parameters,
      reasoning: String(reasoning ?? ""),
      confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : 0,
      source: "local",
    };
    this.onLog(`[local] ${this.model} chose ${name} (confidence ${proposal.confidence})`);
    return { ok: true, proposal, reply: proposal.reasoning };
  }

  /**
   * An escalation. The broker never sees this, so the enums are enforced HERE.
   *
   * An off-list value is NOT repeated back and NOT quietly swapped for a plausible one. `category`
   * falls back to "other", which is what the enum has "other" for; `suggestedOwner` becomes null,
   * because there is no honest default for "who owns this" and guessing is the failure mode. What
   * the model actually said is kept in `offList` so the inspector can show it rather than hide it.
   */
  #escalation(args, violations) {
    const category = ESCALATION_CATEGORIES.includes(args.category) ? args.category : "other";
    const suggestedOwner = ESCALATION_OWNERS.includes(args.suggestedOwner) ? args.suggestedOwner : null;

    const offList = {};
    if (category !== args.category) offList.category = args.category ?? null;
    if (suggestedOwner !== args.suggestedOwner) offList.suggestedOwner = args.suggestedOwner ?? null;
    const corrected = Object.keys(offList).length > 0;

    if (corrected) {
      this.onLog(`[local] ${this.model} returned off-list escalation values, not repeating them: ${JSON.stringify(offList)}`);
    } else if (violations.length) {
      this.onLog(`[local] escalation had schema problems outside the enums: ${violations.join("; ")}`);
    }

    const escalation = {
      summary: String(args.summary ?? "").trim() || "The user described a problem this assistant cannot act on.",
      category,
      whatWasChecked: String(args.whatWasChecked ?? "").trim() || "Nothing beyond the machine state shown.",
      suggestedOwner,
      // Present only when the model went off-list. The inspector shows this; §13 says the demo
      // shows what happened rather than a tidied version of it.
      ...(corrected ? { offList } : {}),
    };

    // The transcript speaks this line. It must not name an owner the model invented.
    const owner = suggestedOwner
      ? `I would hand this to ${suggestedOwner.replace(/_/g, " ")}.`
      : `I could not work out from the list who should own this, so it needs a person to route it.`;

    return { ok: true, escalate: true, escalation, reply: `This one I can't fix from here. ${escalation.summary} ${owner}` };
  }
}
