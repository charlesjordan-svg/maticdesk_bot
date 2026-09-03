// @ts-check
/**
 * Hub provider. The third provider beside CloudClient and OpenAICompatibleClient, same propose()
 * contract, wired by config (`provider: "hub"`). B0 walking skeleton, 2026-09-03.
 *
 * What it sends: the sentence, the machine state and THIS ENDPOINT'S tool schemas, to POST /v1/turn
 * on the hub (server/src/turn.js). The hub holds no catalog; it builds the prompt with the same
 * prompt.js this process uses and returns the model's tool call as the model returned it.
 *
 * What it does with the answer is exactly what OpenAICompatibleClient does with a direct answer:
 * parse the arguments, validate them with the broker's own validator, give the model ONE repair turn
 * (a second /v1/turn carrying the rejected call and the violations), pass an invalid capability
 * proposal through to be refused and audited, and enforce the escalation enums itself. That logic is
 * duplicated here rather than shared, deliberately, so the shipping direct provider - the one the
 * 35/40 bake-off measured - is not touched by the hub work. Factor it when a third dialect exists.
 *
 * `source: "hub"` and `hubProvider`: the endpoint KNOWS the sentence went to the hub. Everything the
 * hub says about where it went next is the hub's claim, recorded as such (broker.d.ts).
 *
 * TIER-0 NEVER ROUTES THROUGH HERE (D46b). The agent runs the deterministic router before any
 * provider is consulted; this class is only reached when tier-0 has nothing confident. Pinned by
 * test/hub-client.test.mjs against a hub that is not running.
 *
 * @typedef {import("../broker/broker.d.ts").Proposal} Proposal
 * @typedef {import("../broker/broker.d.ts").Capability} Capability
 */
import { validateAgainstSchema } from "../broker/schema.js";
import { escalationSchema, capabilityToolSchema, ESCALATION_CATEGORIES, ESCALATION_OWNERS } from "./prompt.js";

export class HubClient {
  /**
   * @param {{ hubUrl: string, capabilities: Capability[], timeoutMs?: number, onLog?: (s: string) => void, fetchImpl?: typeof fetch }} deps
   */
  constructor({ hubUrl, capabilities, timeoutMs = 90000, onLog = () => {}, fetchImpl }) {
    this.hubUrl = String(hubUrl ?? "").replace(/\/+$/, "");
    this.capabilities = capabilities;
    this.timeoutMs = timeoutMs;
    this.onLog = onLog;
    this.fetch = fetchImpl ?? globalThis.fetch;
    // Same validator, same schemas as the direct providers - so "valid" means the same thing on
    // every path, and means what the broker means.
    this.schemaFor = new Map([
      ...capabilities.map((c) => [c.id, capabilityToolSchema(c)]),
      ["escalate", escalationSchema()],
    ]);
    this.available = Boolean(this.hubUrl);
  }

  /** One POST /v1/turn. Throws only on transport failure; HTTP errors are returned. */
  async #turn(body) {
    const res = await this.fetch(`${this.hubUrl}/v1/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json, authHeader: res.headers?.get?.("x-matic-hub-auth") ?? null };
  }

  /** The hub's `call` -> { name, args, rawCall } or { error }. Tolerates both argument encodings. */
  #readCall(body) {
    const call = body?.call;
    if (!call || typeof call.name !== "string") return { error: body?.error ?? "the hub returned no tool call" };
    let args;
    try { args = typeof call.arguments === "string" ? JSON.parse(call.arguments) : call.arguments; }
    catch (err) { return { error: `the model's tool arguments were not valid JSON: ${err.message}` }; }
    if (args === null || typeof args !== "object" || Array.isArray(args)) return { error: "the model's tool arguments were not an object" };
    // The OpenAI-shaped call the hub appends on a repair turn.
    const rawCall = { id: call.id ?? "repair", type: "function", function: { name: call.name, arguments: typeof call.arguments === "string" ? call.arguments : JSON.stringify(call.arguments) } };
    return { name: call.name, args, rawCall };
  }

  #violations(name, args) {
    const schema = this.schemaFor.get(name);
    if (!schema) return [`"${name}" is not a tool that was offered`];
    return validateAgainstSchema(schema, args, name);
  }

  /**
   * @returns {Promise<{ok:boolean, proposal?:Proposal, reply?:string, escalate?:boolean, escalation?:object, error?:string, reason?:string, meta?:object}>}
   * Never throws - an unreachable hub must degrade to tier-0, not crash a turn.
   */
  async propose(text, { probe }) {
    if (!this.available) return { ok: false, error: "No hub URL is configured, so no hub call was made." };

    const request = { text, probe, capabilities: this.capabilities };
    const meta = { requests: 0, repaired: false, firstAttemptViolations: [], usage: { prompt_tokens: 0, completion_tokens: 0 }, hubProvider: null, hubAuth: null };
    const count = (r) => {
      meta.requests++;
      meta.hubAuth = r.authHeader;
      const u = r.body?.usage;
      if (u) { meta.usage.prompt_tokens += u.prompt_tokens ?? 0; meta.usage.completion_tokens += u.completion_tokens ?? 0; }
    };

    try {
      let r = await this.#turn(request);
      count(r);
      if (r.status !== 200) {
        const detail = r.body?.error ?? JSON.stringify(r.body).slice(0, 200);
        this.onLog(`[hub] HTTP ${r.status} from ${this.hubUrl}: ${detail}`);
        // 502/504 mean the hub answered and the model behind it did not. That is not evidence
        // about THIS machine's network, so no `reason: "connection"`.
        return { ok: false, error: `The hub returned ${r.status}: ${detail}`, meta };
      }
      // The hub's claim. Kept as a claim.
      const hubProvider = r.body?.hubProvider === "local" || r.body?.hubProvider === "cloud" ? r.body.hubProvider : null;
      meta.hubProvider = hubProvider;
      if (r.authHeader === "none") this.onLog(`[hub] the hub authenticated nobody (x-matic-hub-auth: none) - B0 skeleton`);

      let read = this.#readCall(r.body);
      if (read.error) return { ok: false, error: read.error, meta };

      let violations = this.#violations(read.name, read.args);
      meta.firstAttemptViolations = [...violations];

      // One repair turn, through the hub. The hub appends the rejected call and the violations and
      // still validates nothing; the decision about what is valid stays on this side.
      if (violations.length) {
        this.onLog(`[hub] ${r.body.model ?? "model"} returned invalid ${read.name} arguments, asking it to correct: ${violations.join("; ")}`);
        const retry = await this.#turn({ ...request, repair: { call: read.rawCall, violations } });
        count(retry);
        meta.repaired = true;
        if (retry.status === 200) {
          const reread = this.#readCall(retry.body);
          if (!reread.error) {
            const stillBad = this.#violations(reread.name, reread.args);
            if (stillBad.length < violations.length) { read = reread; violations = stillBad; }
          }
        }
      }

      if (read.name === "escalate") return { ...this.#escalation(read.args, violations), meta };
      return { ...this.#capabilityProposal(read.name, read.args, violations, hubProvider), meta };
    } catch (err) {
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        return { ok: false, reason: "connection", error: `The hub did not answer within ${Math.round(this.timeoutMs / 1000)}s.`, meta };
      }
      this.onLog(`[hub] ${err.stack ?? err.message}`);
      return { ok: false, reason: "connection", error: `Could not reach the hub at ${this.hubUrl}: ${err.message}`, meta };
    }
  }

  /** A capability proposal - passed through even when invalid, to be refused and audited by the broker. */
  #capabilityProposal(name, args, violations, hubProvider) {
    const capability = this.capabilities.find((c) => c.id === name);
    if (!capability) return { ok: false, error: `the model named a capability that is not in the catalog: ${name}` };
    if (violations.length) this.onLog(`[hub] passing an invalid ${name} proposal to the broker to be refused and audited: ${violations.join("; ")}`);

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
      source: "hub",
      hubProvider,
    };
    this.onLog(`[hub] chose ${name} (confidence ${proposal.confidence}; hub claims provider "${hubProvider ?? "unstated"}")`);
    return { ok: true, proposal, reply: proposal.reasoning };
  }

  /** An escalation. The broker never sees it, so the enums are enforced here, as on the direct path. */
  #escalation(args, violations) {
    const category = ESCALATION_CATEGORIES.includes(args.category) ? args.category : "other";
    const suggestedOwner = ESCALATION_OWNERS.includes(args.suggestedOwner) ? args.suggestedOwner : null;
    const offList = {};
    if (category !== args.category) offList.category = args.category ?? null;
    if (suggestedOwner !== args.suggestedOwner) offList.suggestedOwner = args.suggestedOwner ?? null;
    const corrected = Object.keys(offList).length > 0;
    if (corrected) this.onLog(`[hub] off-list escalation values, not repeating them: ${JSON.stringify(offList)}`);
    else if (violations.length) this.onLog(`[hub] escalation had schema problems outside the enums: ${violations.join("; ")}`);

    const escalation = {
      summary: String(args.summary ?? "").trim() || "The user described a problem this assistant cannot act on.",
      category,
      whatWasChecked: String(args.whatWasChecked ?? "").trim() || "Nothing beyond the machine state shown.",
      suggestedOwner,
      ...(corrected ? { offList } : {}),
    };
    const owner = suggestedOwner
      ? `I would hand this to ${suggestedOwner.replace(/_/g, " ")}.`
      : `I could not work out from the list who should own this, so it needs a person to route it.`;
    return { ok: true, escalate: true, escalation, reply: `This one I can't fix from here. ${escalation.summary} ${owner}` };
  }
}
