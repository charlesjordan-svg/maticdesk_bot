// @ts-check
/**
 * POST /v1/ask — answering a question from the knowledge base. B7a (2026-09-04).
 *
 * ===============================================================================================
 * WHY THIS IS A SECOND ROUTE AND NOT A FLAG ON /v1/turn (D206, proposed)
 * ===============================================================================================
 *
 * The B7a spec §6 says *"/v1/turn acquires a database dependency and a retrieval step before the
 * model call"* and, two bullets later, *"Keep a stateless path"* behind a flag. **Those two
 * instructions fight each other, and the repo already resolved the fight in the stateless path's
 * favour.** `test/db-static.test.mjs` asserts:
 *
 *     check("src/turn.js acquired no database - the B1 handover's explicit 'also out'",
 *       !/db\/|from "pg"|Pool|withTenant/.test(jsCode(read("src/turn.js"))));
 *
 * Adding a database to `turn.js` behind a flag means deleting that check — removing a guard the
 * project deliberately built, in order to satisfy a spec bullet whose own next bullet asks for the
 * property the guard enforces.
 *
 * **So: `/v1/turn` is untouched and still cannot reach a database. Questions go to `/v1/ask`.**
 * The stateless path is not behind a flag that could be flipped by configuration or by a later edit
 * — it is a different route, and the check above keeps guarding it. That is a stronger form of what
 * the spec asked for, and it costs one `if` in src/index.js.
 *
 * It also happens to be the honest shape. A turn that proposes a machine change and a turn that
 * answers a question are different operations: different prompt, different tools, different failure
 * modes, and one of them touches a corpus. Multiplexing them behind a flag would have made the
 * request body's meaning depend on server configuration.
 *
 * ===============================================================================================
 * TENANCY IS PROVISIONAL AND THE PROVISIONALITY IS LOUD
 * ===============================================================================================
 *
 * Device authentication does not exist (D61/D132 unbuilt), so there is no tenant here — only a
 * label from server configuration, `MATIC_KB_TENANT_LABEL`. It is marked the way B0 marked missing
 * authentication:
 *
 *   - it is a `text` column in `control.kb_retrieval_log`, NOT a foreign key to `control.tenants`,
 *     precisely so it cannot be mistaken for identity;
 *   - **a tenant label in the REQUEST BODY IS REFUSED** (`checkAskRequest`). This is the specific
 *     thing the spec warned about: *"Do not let a header become the tenancy model by default."* A
 *     client-supplied tenant that the server trusts is not a provisional tenancy model, it is a
 *     broken one, and it becomes load-bearing by being convenient;
 *   - the loopback refusal and the `x-matic-hub-auth: none` header from B0 apply unchanged.
 *
 * The generic corpus is cross-tenant by decision (D45), so nothing here needs a tenant to be
 * correct. The label exists to make retrieval logs separable in development and for nothing else.
 *
 * ===============================================================================================
 * WHAT THIS ROUTE WILL NOT DO
 * ===============================================================================================
 *
 *   - **Chunks never leave the hub** (D53). The response carries the reply and article IDs. It does
 *     not carry chunk text, and adding it would move the corpus to the endpoint one debug field at a
 *     time.
 *   - It never returns an answer it cannot attribute. See `readAnswerCall` in src/kb/answer.js.
 *   - It does not fall back to a general-knowledge answer when retrieval finds nothing. That is the
 *     whole point of B7a and there is no flag for it.
 */
import { readJson } from "../turn.js";
import { buildAnswerInput, readAnswerCall, DECLINE_REPLY } from "./answer.js";
import { retrieve, logRetrieval, DEFAULT_TOP_K } from "./retrieve.js";

/**
 * Shape check. Request validation, not answer validation.
 *
 * `probe` is OPTIONAL here, unlike /v1/turn. A question does not need machine state to be
 * answerable, and requiring it would make "how do I take a screenshot" fail on a machine whose
 * probe did not run. When it is absent, the platform pre-filter (D162) falls back to `'any'` only,
 * which is the conservative direction: a Windows article is withheld rather than a macOS article
 * being offered to an unknown machine.
 */
export function checkAskRequest(body) {
  if (!body || typeof body !== "object") return "body must be a JSON object";
  if (typeof body.text !== "string" || !body.text.trim()) return "text must be a non-empty string";
  if (body.probe !== undefined && (body.probe === null || typeof body.probe !== "object")) {
    return "probe, when present, must be an object (machine state)";
  }
  // The guard described in the header. A client that can name its own tenant IS the tenancy model.
  if (body.tenant !== undefined || body.tenantId !== undefined || body.tenantLabel !== undefined) {
    return "this hub does not accept a tenant from the client. B7a's tenancy is a server-side label "
      + "(MATIC_KB_TENANT_LABEL) because device authentication is not built (D61, D132), and a "
      + "client-supplied tenant would become the tenancy model by default.";
  }
  return null;
}

/**
 * The platform to pre-filter on, from the machine-state block the endpoint already sends.
 *
 * Deliberately narrow: it reads a small set of known fields and otherwise returns `null`, which
 * means `'any'` articles only. Guessing a platform from an unrecognised probe shape is how a macOS
 * article reaches a Windows user.
 */
export function platformFromProbe(probe) {
  if (!probe || typeof probe !== "object") return null;
  const raw = String(probe.platform ?? probe.os ?? probe.osPlatform ?? "").toLowerCase();
  if (!raw) return null;
  // ORDER MATTERS, AND THE FIRST VERSION OF THIS FUNCTION GOT IT WRONG.
  //
  // `"darwin".includes("win")` is TRUE. A `win` test placed first classifies every macOS machine as
  // Windows — which is precisely the D162 failure this pre-filter exists to prevent, arriving
  // through the filter itself, and it would have shown up as "the macOS article was correctly
  // withheld" on a Mac. It was caught by test/kb-static.test.mjs asserting darwin -> macos, not by
  // reading the line.
  //
  // So: macOS is tested first, and `win32`/`windows` are matched at a word boundary rather than as
  // a substring. Both belt and braces, because the substring bug was invisible.
  if (raw.includes("darwin") || raw.includes("mac")) return "macos";
  if (/\bwin(32|64|dows|nt)?\b/.test(raw)) return "windows";
  if (raw.includes("linux")) return "linux";
  return null;
}

/**
 * The handler.
 *
 * @param {{
 *   provider: { name: string, model: string, complete: (i: any) => Promise<any> },
 *   embedder: any|null,
 *   hubProvider: "local"|"cloud",
 *   tenantLabel?: string|null,
 *   topK?: number,
 *   log?: (s: string) => void,
 * }} deps
 */
export function askHandler({ provider, embedder, hubProvider, tenantLabel = null, topK = DEFAULT_TOP_K, log = () => {} }) {
  const errorBody = (error) => ({ ok: false, error, hubProvider, model: provider.model });

  return async function handleAsk(req, res, send) {
    const parsed = await readJson(req);
    if (parsed.error) return send(400, errorBody(parsed.error));
    const problem = checkAskRequest(parsed.value);
    if (problem) return send(400, errorBody(problem));
    const body = parsed.value;
    const platform = platformFromProbe(body.probe);

    // ---- Retrieval. A failure here is DEGRADED, NOT FATAL (acceptance item 7). --------------
    // An empty corpus and an unreachable database both produce zero chunks, and zero chunks is a
    // valid input to the answer path: the prompt declines. The turn completes either way.
    let retrieval = { chunks: [], articles: [], legs: { lexical: false, semantic: false, semanticError: null }, topScore: 0, floorApplied: false, floor: null, candidates: { lexical: 0, semantic: 0 } };
    let retrievalError = null;
    try {
      retrieval = await retrieve({ query: body.text, platform, topK, embedder, log });
    } catch (err) {
      retrievalError = err.message;
      log(`[ask] retrieval failed, answering with no articles (the decline path): ${err.message}`);
    }

    const suppliedArticleIds = retrieval.articles.map((a) => a.id);
    log(`[ask] retrieved ${retrieval.chunks.length} chunks from ${suppliedArticleIds.length} articles`
      + ` (lexical ${retrieval.candidates.lexical}, semantic ${retrieval.candidates.semantic}`
      + `${retrieval.legs.semantic ? "" : ", SEMANTIC LEG DID NOT RUN"})`
      + ` platform ${platform ?? "any-only"} top score ${retrieval.topScore.toFixed(5)}`);

    // ---- The model call. --------------------------------------------------------------------
    let out;
    try {
      out = await provider.complete(buildAnswerInput({ text: body.text, retrieval }));
    } catch (err) {
      const timeout = err?.name === "TimeoutError" || err?.name === "AbortError";
      log(`[ask] provider ${provider.name}/${provider.model} ${timeout ? "timed out" : "unreachable"}: ${err.message}`);
      return send(timeout ? 504 : 502, errorBody(timeout
        ? `the model behind the hub did not answer in time (${provider.model})`
        : `the hub could not reach the model (${provider.model}): ${err.message}`));
    }
    if (out.status !== 200) {
      const detail = out.body?.error?.message ?? out.body?.error ?? JSON.stringify(out.body ?? {}).slice(0, 200);
      log(`[ask] provider returned HTTP ${out.status}: ${detail}`);
      return send(502, errorBody(`the model endpoint behind the hub returned ${out.status}: ${detail}`));
    }

    const read = readAnswerCall(out.body, { suppliedArticleIds });

    // A model that failed to call the tool at all is NOT turned into a general-knowledge answer.
    // It becomes a decline, because a decline is true and an invented answer is not.
    let answered, reply, cited, problems;
    if (read.error) {
      log(`[ask] ${read.error} - returning a decline`);
      answered = false; reply = DECLINE_REPLY; cited = []; problems = [read.error];
    } else {
      ({ answered, reply, cited, problems } = read);
    }
    for (const p of problems) log(`[ask] answer was corrected: ${p}`);

    // ---- The retrieval log (D166). Separate from the outcome. -------------------------------
    // A logging failure must not fail a turn the user is waiting on.
    let logId = null;
    if (!retrievalError) {
      try {
        logId = await logRetrieval({
          query: body.text, platform, tenantLabel, result: retrieval,
          cited, answered, model: provider.model,
        });
      } catch (err) {
        log(`[ask] could not write the retrieval log: ${err.message}`);
      }
    }

    log(`[ask] ${provider.model} ${answered ? `answered citing ${cited.join(", ")}` : "DECLINED"} in ${out.ms} ms`);
    return send(200, {
      ok: true,
      hubProvider,
      model: provider.model,
      answered,
      reply,
      // The citation. Article IDs only — chunk text never leaves the hub (D53).
      citedArticleIds: cited,
      // Enough for an endpoint to know how much to trust the answer, without carrying the corpus.
      retrieval: {
        chunks: retrieval.chunks.length,
        articles: suppliedArticleIds,
        legs: { lexical: retrieval.legs.lexical, semantic: retrieval.legs.semantic },
        topScore: Number(retrieval.topScore.toFixed(6)),
        floorApplied: retrieval.floorApplied,
        // Loud: any quality judgement made from this response is a FLOOR, not a measurement.
        rerankerPresent: false,
        error: retrievalError,
      },
      logId,
      finishReason: read.finishReason ?? null,
      usage: out.body?.usage ?? null,
    });
  };
}
