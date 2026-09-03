// @ts-check
/**
 * The hub's OpenAI-compatible provider. B0 walking skeleton, 2026-09-03.
 *
 * Targets local Ollama by default, and anything else that speaks /v1/chat/completions. It is the
 * provider abstraction from the first commit even though there is one provider: the route talks to
 * `complete()`, never to HTTP, so a second provider (Anthropic, for the managed tier - D97) slots in
 * beside this file without the route changing.
 *
 * WHAT THIS DOES NOT DO, on purpose: it does not read the tool call out of the response, does not
 * parse the arguments, does not validate, repair or reshape anything. It returns the provider's
 * response as it came. A hub that fixes proposals becomes an authority on capabilities, which is
 * exactly what it must not be (handover Task 2; H2). Validation belongs to the endpoint's broker,
 * which validates against its own catalog (D149).
 *
 * The request body is the SAME body `client/src/agent/openai-compatible-client.js` sends on the
 * direct path - temperature 0, max_tokens 2048, tool_choice "required" - so a bake-off through the
 * hub measures the hop and nothing else.
 *
 * @typedef {{
 *   name: string,
 *   model: string,
 *   complete(input: { messages: object[], tools: object[] }): Promise<{ status: number, body: any, ms: number }>,
 * }} Provider
 */

export class OpenAICompatibleProvider {
  /**
   * @param {{ model: string, baseUrl: string, apiKey?: string, timeoutMs?: number, extraBody?: Record<string, unknown>, fetchImpl?: typeof fetch }} deps
   */
  constructor({ model, baseUrl, apiKey, timeoutMs = 300000, extraBody = {}, fetchImpl }) {
    this.name = "openai-compatible";
    this.model = model;
    this.baseUrl = String(baseUrl ?? "").replace(/\/+$/, "");
    // Ollama ignores this; OpenAI-shaped gateways require it (same reasoning as the client adapter).
    this.apiKey = apiKey || "not-required";
    this.timeoutMs = timeoutMs;
    this.extraBody = extraBody;
    this.fetch = fetchImpl ?? globalThis.fetch;
  }

  /**
   * One POST to /chat/completions. Throws only on transport failure (the route maps that to 504 or
   * 502); an HTTP error from the provider is RETURNED with its status so the route can pass it on.
   * @param {{ messages: object[], tools: object[] }} input
   */
  async complete({ messages, tools }) {
    const startedAt = Date.now();
    const res = await this.fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: this.model,
        messages,
        tools,
        tool_choice: "required",
        temperature: 0,
        max_tokens: 2048,
        ...this.extraBody,
      }),
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body, ms: Date.now() - startedAt };
  }
}
