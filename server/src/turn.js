// @ts-check
/**
 * POST /v1/turn - the one route of the B0 walking skeleton (2026-09-03).
 *
 * The endpoint sends the sentence, the machine state and ITS tool schemas. The hub builds the
 * prompt with the client's own prompt module, hands the request to a provider, and returns what
 * the provider returned. It holds no catalog, keeps no state between requests, and repairs nothing.
 *
 * Request body (JSON):
 *   {
 *     text:         string          the user's sentence
 *     probe:        object          machine state, the shape machineStateBlock() takes
 *     capabilities: Capability[]    the ENDPOINT's catalog entries. The hub never holds a catalog,
 *                                   so "the endpoint validates against its own catalog" stays
 *                                   literally true and Phase 1 needs no catalog distribution (D149).
 *     repair?:      { call, violations: string[] }
 *                                   one repair turn. The endpoint found the previous call invalid
 *                                   against ITS schema and asks the model to try again; the hub
 *                                   appends the assistant tool_call and the rejection, exactly as
 *                                   the direct provider does, and still validates nothing.
 *   }
 *
 * Response 200:
 *   {
 *     ok: true,
 *     hubProvider: "local" | "cloud"   THE HUB'S CLAIM about where the sentence went next. The
 *                                      endpoint records it as hearsay (broker.d.ts Proposal.hubProvider).
 *     model: string,
 *     call: { id, name, arguments } | null   the provider's first tool call, arguments AS RETURNED
 *                                            (a JSON string on a conforming server; not parsed here)
 *     finishReason: string | null,
 *     usage: object | null
 *   }
 *
 * Errors: 400 malformed request; 502 the provider answered but not with a tool call, or answered
 * with an HTTP error; 504 the provider did not answer in time. Every error body is
 * { ok: false, error, hubProvider, model } and NOTHING is guessed on the endpoint's behalf.
 *
 * Imports from client/src/agent/ are deliberate and load-bearing: one prompt, one tool-surface
 * builder, across every provider and every hop. Two wordings measure the wording, not the model
 * (handover Task 2; client/eval/README.md).
 */
import { systemPrompt, machineStateBlock } from "../../client/src/agent/prompt.js";
import { toolsFromCatalog } from "../../client/src/agent/openai-compatible-client.js";

const MAX_BODY_BYTES = 1024 * 1024;

/** Read and parse a JSON body, bounded. Resolves null on malformed input (caller returns 400). */
export function readJson(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { resolve({ error: "body too large" }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve({ value: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); }
      catch (err) { resolve({ error: `body is not JSON: ${err.message}` }); }
    });
    req.on("error", (err) => resolve({ error: err.message }));
  });
}

/** Shape check only. This is request validation, not proposal validation - the hub does none of that. */
export function checkTurnRequest(body) {
  if (!body || typeof body !== "object") return "body must be a JSON object";
  if (typeof body.text !== "string" || !body.text.trim()) return "text must be a non-empty string";
  if (!body.probe || typeof body.probe !== "object") return "probe must be an object (machine state)";
  if (!Array.isArray(body.capabilities) || body.capabilities.length === 0) return "capabilities must be a non-empty array - the endpoint sends its tool schemas; the hub holds no catalog";
  for (const c of body.capabilities) {
    if (!c || typeof c.id !== "string" || !c.parameters || typeof c.parameters !== "object") return "every capability needs an id and a parameters schema";
  }
  if (body.repair !== undefined) {
    const r = body.repair;
    if (!r || typeof r !== "object" || !r.call || typeof r.call !== "object" || !Array.isArray(r.violations)) {
      return "repair must be { call, violations[] }";
    }
  }
  return null;
}

/**
 * Build the provider input. Same messages the direct path builds, from the same module.
 * @param {{ text: string, probe: object, capabilities: object[], repair?: { call: any, violations: string[] } }} body
 */
export function buildProviderInput(body) {
  const messages = [
    { role: "system", content: systemPrompt(body.capabilities) },
    { role: "user", content: `${machineStateBlock(body.probe)}\n\nThe user says: ${body.text}` },
  ];
  if (body.repair) {
    // Verbatim shape of the direct provider's repair turn (client/src/agent/openai-compatible-client.js).
    messages.push(
      { role: "assistant", content: null, tool_calls: [body.repair.call] },
      {
        role: "tool",
        tool_call_id: body.repair.call.id ?? "repair",
        content:
          `Rejected. ${body.repair.violations.join("; ")}. ` +
          `Call the tool again using only values the schema allows. Do not invent enum values.`,
      },
    );
  }
  return { messages, tools: toolsFromCatalog(body.capabilities) };
}

/**
 * The handler. `provider` is whatever implements Provider; `hubProvider` is the claim the hub makes
 * about it ("local" for a model the hub host runs, "cloud" for a vendor API).
 *
 * @param {{ provider: import("./providers/openai-compatible-provider.js").Provider, hubProvider: "local" | "cloud", log?: (s: string) => void }} deps
 */
export function turnHandler({ provider, hubProvider, log = () => {} }) {
  const errorBody = (error) => ({ ok: false, error, hubProvider, model: provider.model });

  return async function handleTurn(req, res, send) {
    const parsed = await readJson(req);
    if (parsed.error) return send(400, errorBody(parsed.error));
    const problem = checkTurnRequest(parsed.value);
    if (problem) return send(400, errorBody(problem));
    const body = parsed.value;

    let out;
    try {
      out = await provider.complete(buildProviderInput(body));
    } catch (err) {
      const timeout = err?.name === "TimeoutError" || err?.name === "AbortError";
      log(`[turn] provider ${provider.name}/${provider.model} ${timeout ? "timed out" : "unreachable"}: ${err.message}`);
      return send(timeout ? 504 : 502, errorBody(timeout
        ? `the model behind the hub did not answer in time (${provider.model})`
        : `the hub could not reach the model (${provider.model}): ${err.message}`));
    }

    if (out.status !== 200) {
      const detail = out.body?.error?.message ?? out.body?.error ?? JSON.stringify(out.body ?? {}).slice(0, 200);
      log(`[turn] provider ${provider.name}/${provider.model} HTTP ${out.status} in ${out.ms} ms: ${detail}`);
      return send(502, errorBody(`the model endpoint behind the hub returned ${out.status}: ${detail}`));
    }

    // Faithful pass-through. The first tool call, as returned. No parsing of arguments, no
    // validation, no repair, no reshaping. If there is no tool call, that is the answer, and the
    // answer is an error - not a guess at what the model meant.
    const choice = out.body?.choices?.[0];
    const call = choice?.message?.tool_calls?.[0];
    const finishReason = choice?.finish_reason ?? null;
    if (!call || !call.function || typeof call.function.name !== "string") {
      log(`[turn] ${provider.model} returned no tool call (finish_reason ${finishReason ?? "unknown"}) in ${out.ms} ms`);
      return send(502, { ...errorBody(`the model returned no tool call (finish_reason ${finishReason ?? "unknown"}).`), finishReason, usage: out.body?.usage ?? null });
    }

    // What is logged: model, tool name, timing. Not the sentence, not the machine state - the hub is
    // a pass-through, and the endpoint's audit trail is the record of what was decided.
    log(`[turn] ${provider.model} -> ${call.function.name} in ${out.ms} ms${body.repair ? " (repair turn)" : ""}`);
    return send(200, {
      ok: true,
      hubProvider,
      model: provider.model,
      call: { id: call.id ?? null, name: call.function.name, arguments: call.function.arguments },
      finishReason,
      usage: out.body?.usage ?? null,
    });
  };
}
