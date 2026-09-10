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
import { escalationSchema, capabilityToolSchema, escalationReply, ESCALATION_CATEGORIES, ESCALATION_OWNERS } from "./prompt.js";

export class HubClient {
  /**
   * @param {{ hubUrl: string, capabilities: Capability[], timeoutMs?: number, onLog?: (s: string) => void, fetchImpl?: typeof fetch }} deps
   */
  /**
   * THE DEFAULT TIMEOUT MATCHES THE HUB'S OWN, AND IT USED TO BE 90s. Changed 2026-09-04.
   *
   * The hub waits `MATIC_HUB_TIMEOUT_MS` (default 300000) for its model. This client waited 90000.
   * So on any call the model could not answer inside 90 seconds, THE ENDPOINT GAVE UP 3.5 MINUTES
   * BEFORE THE HUB DID — and a `mistral-small:24b` cold load is comfortably over 90 seconds.
   *
   * Found by `eval/e2e-ticket.mjs` on 2026-09-04 and then reproduced deliberately with
   * `timeoutMs: 50`, which yields the identical reply. It matters more than a slow first turn
   * because of WHAT THE FALLBACK SAYS: `routeByState` answers with whatever happens to be wrong on
   * the machine, so "the screen on my laptop is cracked" was answered with "the print spooler
   * service is stopped, I can start it again". Confident, unrelated, and with nothing in the
   * transcript saying the model was never reached.
   *
   * The consequence for THIS feature is the sharp one: the first escalation after a cold start
   * silently did not offer a ticket. That is the first turn of any demo.
   *
   * **This raises the ceiling; it does not fix the fallback.** A state-fallback answer to a
   * physical-damage report is a non-sequitur whatever the timeout is, and that is a separate
   * defect in `routeByState` that is NOT addressed here.
   */
  constructor({ hubUrl, capabilities, timeoutMs = 300000, onLog = () => {}, fetchImpl, link = null }) {
    this.hubUrl = String(hubUrl ?? "").replace(/\/+$/, "");
    this.capabilities = capabilities;
    this.timeoutMs = timeoutMs;
    this.onLog = onLog;
    this.fetch = fetchImpl ?? globalThis.fetch;
    // D233: every real request is evidence about the hub's reachability, and a HubLink (if one is
    // wired) is told about it — `noteSuccess()` when the hub ANSWERED, whatever the status, and
    // `noteFailure()` when the transport did not deliver. Optional, so tests and the eval scripts
    // that build a bare HubClient are unchanged.
    this.link = link;
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
    this.link?.noteSuccess();
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
      this.link?.noteFailure(`POST /v1/turn: ${err.name}`);
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        return { ok: false, reason: "connection", error: `The hub did not answer within ${Math.round(this.timeoutMs / 1000)}s.`, meta };
      }
      this.onLog(`[hub] ${err.stack ?? err.message}`);
      return { ok: false, reason: "connection", error: `Could not reach the hub at ${this.hubUrl}: ${err.message}`, meta };
    }
  }

  /**
   * ANSWER A QUESTION from the hub's knowledge base. POST /v1/ask (D206). Added 2026-09-04.
   *
   * **A SEPARATE METHOD FROM `propose()`, AND IT MUST STAY SEPARATE.** `propose()` returns a
   * `Proposal` for the broker to validate and execute; `ask()` returns prose and article ids and
   * **never touches the broker at all**. Multiplexing them behind one method would re-create on the
   * endpoint exactly the problem D206 avoided on the hub — a call whose meaning depends on
   * configuration rather than on which method you invoked.
   *
   * **`answered` is the hub's own field, not an inference from `reply` being non-empty.** The hub
   * downgrades an answer it cannot attribute to a supplied article into a decline (D205), so
   * `answered: false` with a non-empty `reply` is the NORMAL decline case and must not be read as
   * failure. `ok: false` means the hub could not be reached or refused the request; it does not
   * mean the question went unanswered.
   *
   * **`citedArticleIds` is kept as a separate field and never concatenated into `reply`.** Under H5
   * a citation is attributed chrome, not the avatar's own voice, and the renderer can only present
   * it that way while it is a distinct value.
   *
   * Never throws — an unreachable hub must degrade, not crash a turn.
   *
   * @param {string} text
   * @param {{ probe?: object }} [opts]
   * @returns {Promise<{ok:boolean, answered?:boolean, reply?:string, citedArticleIds?:string[], retrieval?:object, error?:string, reason?:string, meta?:object}>}
   */
  async ask(text, { probe } = {}) {
    if (!this.available) return { ok: false, error: "No hub URL is configured, so no hub call was made." };

    const meta = { requests: 0, hubAuth: null, usage: { prompt_tokens: 0, completion_tokens: 0 }, logId: null };
    try {
      // `probe` is optional on /v1/ask, unlike /v1/turn: a question is answerable without machine
      // state. It is sent when we have it because it supplies the platform pre-filter (D162).
      //
      // ==========================================================================================
      // THE PLATFORM IS ADDED HERE, AND A BUG IS WHY. Found by `eval/e2e-ask.mjs` on 2026-09-04.
      //
      // `probeMachine()` returns { services, adapters, primary, actionable, online } — NO PLATFORM.
      // It never needed one: every capability is Windows-only, so nothing on the proposal path ever
      // asked. But the hub's pre-filter reads `probe.platform`, and with it absent
      // `platformFromProbe()` correctly returns null, which admits `platform: "any"` articles ONLY.
      //
      // So EVERY WINDOWS-ONLY ARTICLE WAS INVISIBLE TO THE ENDPOINT. "How do I take a screenshot"
      // declined through the agent while answering correctly through curl, because curl was sending
      // `{"platform":"win32"}` by hand and the agent was sending the real probe. Both sides were
      // behaving exactly as designed and the integration was broken — which is why this needed an
      // end-to-end run and could not have been caught by either side's tests.
      //
      // Fixed HERE rather than in `probeMachine()` on purpose: `machineStateBlock(probe)` renders
      // the probe into the prompt the 40-case bake-off measured, and adding a field to the probe
      // risks changing that prompt. This path is the only consumer of a platform, so this is the
      // narrowest place the fix can live. **If the probe ever grows a real `platform`, it wins** —
      // the spread below defers to it.
      // ==========================================================================================
      const withPlatform = probe
        ? { platform: process.platform, ...probe }
        : { platform: process.platform };

      // NO TENANT IS SENT, and the hub returns 400 if one is. B7a's tenancy is a server-side label
      // because device authentication is not built (D61, D132), and a client-supplied tenant would
      // become the tenancy model by default.
      const res = await this.fetch(`${this.hubUrl}/v1/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({ text, probe: withPlatform }),
      });
      this.link?.noteSuccess();
      const body = await res.json().catch(() => ({}));
      meta.requests = 1;
      meta.hubAuth = res.headers?.get?.("x-matic-hub-auth") ?? null;
      if (body?.usage) {
        meta.usage.prompt_tokens += body.usage.prompt_tokens ?? 0;
        meta.usage.completion_tokens += body.usage.completion_tokens ?? 0;
      }
      meta.logId = body?.logId ?? null;

      if (res.status !== 200) {
        const detail = body?.error ?? JSON.stringify(body).slice(0, 200);
        this.onLog(`[hub] /v1/ask HTTP ${res.status}: ${detail}`);
        // As in propose(): 5xx means the hub answered and the model behind it did not, which is
        // not evidence about THIS machine's network, so no `reason: "connection"`.
        return { ok: false, error: `The hub returned ${res.status}: ${detail}`, meta };
      }
      if (meta.hubAuth === "none") this.onLog(`[hub] the hub authenticated nobody (x-matic-hub-auth: none) - B0 skeleton`);

      const answered = body?.answered === true;
      const reply = String(body?.reply ?? "").trim();
      // Only ids the hub actually returned. The hub has already dropped any the model invented
      // (D205); this is defence in depth on a field the renderer will display as provenance.
      const citedArticleIds = Array.isArray(body?.citedArticleIds) ? body.citedArticleIds.map(String) : [];

      if (!reply) {
        // A 200 with no reply is a hub bug, not an answer. Do not manufacture prose for it.
        this.onLog(`[hub] /v1/ask returned 200 with no reply`);
        return { ok: false, error: "The hub answered without saying anything.", meta };
      }

      if (body?.retrieval && body.retrieval.rerankerPresent === false) {
        this.onLog(`[hub] retrieved ${body.retrieval.chunks ?? 0} chunk(s) from ${(body.retrieval.articles ?? []).length} article(s); NO RERANKER, so quality here is a floor`);
      }
      this.onLog(answered
        ? `[hub] answered from ${citedArticleIds.join(", ") || "no cited article"}`
        : `[hub] DECLINED - the knowledge base does not cover this`);

      return { ok: true, answered, reply, citedArticleIds, retrieval: body?.retrieval ?? null, meta };
    } catch (err) {
      this.link?.noteFailure(`POST /v1/ask: ${err.name}`);
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        return { ok: false, reason: "connection", error: `The hub did not answer within ${Math.round(this.timeoutMs / 1000)}s.`, meta };
      }
      this.onLog(`[hub] ${err.stack ?? err.message}`);
      return { ok: false, reason: "connection", error: `Could not reach the hub at ${this.hubUrl}: ${err.message}`, meta };
    }
  }

  /**
   * FILE A TICKET on the hub. POST /v1/ticket (D213). Added 2026-09-04.
   *
   * **A third method, kept separate for the same reason `ask()` is separate from `propose()`.**
   * This one neither proposes nor answers: it SENDS THE USER'S IDENTITY AND PROBLEM OFF THE
   * MACHINE. That is a different kind of act from the other two and it should be a different call,
   * so that "what can leave this endpoint" is answerable by reading the method list.
   *
   * **The caller must already have the user's consent.** Nothing in here asks. By the time this
   * runs the user has said yes in the conversation and pressed submit on a card showing exactly
   * these fields — see src/ticket/intake.js and the renderer's review card.
   *
   * **`notified` is the hub's field and must be repeated, not interpreted.** The hub stores tickets
   * and emails nobody (D86: without an ITSM there is no queue, so a store alone is a record). A
   * caller that turns `ok: true` into "IT has been notified" reintroduces the exact defect this
   * whole path exists to remove.
   *
   * Never throws — a hub that cannot be reached must leave the user knowing nothing was filed,
   * not crash the turn.
   *
   * @param {object} draft  the POST body: description, summary, whatWasChecked, category,
   *                        suggestedOwner, machineName, reporter
   * @returns {Promise<{ok:boolean, reference?:string, ticketId?:string, notified?:boolean, notifiedWhy?:string, error?:string, filed?:boolean}>}
   */
  async fileTicket(draft) {
    if (!this.available) return { ok: false, filed: false, error: "No hub URL is configured, so nothing was sent." };
    try {
      const res = await this.fetch(`${this.hubUrl}/v1/ticket`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify(draft),
      });
      this.link?.noteSuccess();
      const body = await res.json().catch(() => ({}));
      if (res.status === 201 && body?.ok) {
        this.onLog(`[hub] filed ${body.reference} (nobody was emailed: notified=${body.notified})`);
        return body;
      }
      const detail = body?.error ?? `HTTP ${res.status}`;
      this.onLog(`[hub] /v1/ticket refused: ${detail}`);
      // `filed: false` explicitly, so the caller says "nothing was filed" as a fact rather than as
      // an inference from `ok` being false.
      return { ok: false, filed: false, error: detail };
    } catch (err) {
      this.link?.noteFailure(`POST /v1/ticket: ${err.name}`);
      const timedOut = err.name === "TimeoutError" || err.name === "AbortError";
      this.onLog(`[hub] /v1/ticket ${timedOut ? "timed out" : "failed"}: ${err.message}`);
      return {
        ok: false,
        // A TIMEOUT IS THE ONE CASE WE GENUINELY DO NOT KNOW. The request may have been stored
        // before the answer was lost. Saying "nothing was filed" would be a guess, and a confident
        // wrong one is how a user ends up with two tickets or none.
        filed: timedOut ? null : false,
        error: timedOut
          ? `The hub did not answer within ${Math.round(this.timeoutMs / 1000)}s, so I cannot tell you whether the ticket was stored. Check with IT before opening another.`
          : `Could not reach the hub at ${this.hubUrl}: ${err.message}. Nothing was sent.`,
      };
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
    // The spoken line is built by the shared generator and does NOT contain `escalation.summary`
    // (D214). See escalationReply() for why that is not a style preference.
    return { ok: true, escalate: true, escalation, reply: escalationReply(escalation) };
  }
}
