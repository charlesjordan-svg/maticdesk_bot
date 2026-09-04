/**
 * B7a's rules, checked WITHOUT a database and WITHOUT a model.
 *
 * Run: node test/kb-static.test.mjs        (from server/; part of `npm test`)
 *
 * Most of what B7a must get right is a property of source or of a pure function, and those belong
 * here rather than in the database suite — the difference between a rule and a hope is whether it
 * is enforced on a run that has nothing installed.
 *
 * What is here:
 *   1. Chunking — field boundaries, the reference table kept whole, the weights.
 *   2. RRF fusion — a pure function, so every fusion property is testable with no server.
 *   3. The answer contract — the decline, and the corrections that make an unattributable answer
 *      impossible to return. **This is B7a's primary acceptance property** and it is checkable
 *      here because the answer path was built as a schema rather than as prose (D205).
 *   4. Source rules — /v1/turn is still stateless, the corpus is not in the system prompt,
 *      the relevance floor is still unset, no reranker has been quietly added.
 *
 * The live behaviour is test/kb.test.mjs (`npm run test:db`) and test/kb-acceptance.mjs.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkArticle, articleHash, KIND_WEIGHTS, approxTokens } from "../src/kb/chunk.js";
import { fuseRRF, RRF_K, RELEVANCE_FLOOR, DEFAULT_TOP_K } from "../src/kb/retrieve.js";
import {
  answerToolSchema, answerSystemPrompt, articlesBlock, buildAnswerInput,
  readAnswerCall, DECLINE_REPLY, ANSWER_TOOL,
} from "../src/kb/answer.js";
import { checkAskRequest, platformFromProbe } from "../src/kb/ask.js";
import { EMBEDDING_DIM, toVectorLiteral, QUERY_PREFIX, NoEmbeddingProvider } from "../src/kb/embed.js";
import { readBundle } from "../src/kb/ingest.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, "..");
const read = (p) => readFileSync(join(SERVER, p), "utf8");
const BUNDLE = join(SERVER, "..", "docs", "kb", "generic-kb-v2.json");

let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}
function sqlCode(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}
function jsCode(js) {
  return js.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
}
const h = (s) => String(s.length).padStart(4, "0") + s.slice(0, 8);

// ==============================================================================================
console.log("\n=== 1. the bundle on disk is the one B7a was built against ===");
// This suite is worth nothing if the corpus changed shape underneath it, and the acceptance tests
// name specific articles and specific tokens.
const bundle = readBundle(BUNDLE);
check("docs/kb/generic-kb-v2.json parses and shape-checks", bundle.articles.length > 0);
check("it has six articles - every 'six articles' claim in B7a's documents refers to this",
  bundle.articles.length === 6, `found ${bundle.articles.length}`);
check("exactly one is type 'reference' (the B7a spec says 'the two reference articles'; there is ONE)",
  bundle.articles.filter((a) => a.type === "reference").length === 1);
check("the reference article is keyboard-shortcuts-windows, platform windows",
  bundle.articles.find((a) => a.type === "reference")?.id === "keyboard-shortcuts-windows"
  && bundle.articles.find((a) => a.type === "reference")?.platform === "windows");
const dock = bundle.articles.find((a) => a.id === "dock-external-monitors-not-detected");
check("acceptance item 4's exact-string token 'DisplayLink' is in the dock article",
  /DisplayLink/.test(JSON.stringify(dock)));
check("acceptance item 2's answer 'Win + Shift + S' is in the reference article",
  /Win \+ Shift \+ S/.test(bundle.articles.find((a) => a.type === "reference")?.body ?? ""));
check("no article is platform macos, so acceptance item 5 must ADD a throwaway one",
  bundle.articles.every((a) => a.platform !== "macos"));

// ==============================================================================================
console.log("\n=== 2. chunking is by field, and the reference table is never split ===");
const refChunks = chunkArticle(bundle.articles.find((a) => a.type === "reference"));
check("the reference article produces exactly ONE 'reference' chunk",
  refChunks.filter((c) => c.kind === "reference").length === 1);
check("that chunk holds the WHOLE body - a table split mid-rows loses the header that gives rows meaning",
  refChunks.find((c) => c.kind === "reference")?.text === bundle.articles.find((a) => a.type === "reference").body.trim());
check("a reference article gets no 'guidance' or 'body' chunk",
  refChunks.every((c) => c.kind !== "guidance" && c.kind !== "body"));

const tsChunks = chunkArticle(bundle.articles.find((a) => a.id === "home-network-slow-or-dropping"));
check("a troubleshooting article gets title, symptoms and guidance chunks",
  ["title", "symptoms", "guidance"].every((k) => tsChunks.some((c) => c.kind === k)));
check("ordinals are 0..n-1 with no gaps, so (article_id, ordinal) is a stable citation",
  tsChunks.every((c, i) => c.ordinal === i));
check("the title chunk carries title AND problem - a title alone is too short to embed well",
  tsChunks[0].kind === "title" && tsChunks[0].text.includes("slow") && tsChunks[0].text.split("\n\n").length === 2);
check("the symptoms chunk contains user phrasing, not IT phrasing",
  /everything is really slow at home/.test(tsChunks.find((c) => c.kind === "symptoms").text));
check("guidance is ONE chunk, numbered - the steps are an ordered procedure and the order is meaning",
  tsChunks.filter((c) => c.kind === "guidance").length === 1
  && /^1\. /.test(tsChunks.find((c) => c.kind === "guidance").text));
check("escalateWhen and doNotAttempt are NOT chunked - they constrain an answer, they are not one",
  tsChunks.every((c) => !/escalate/i.test(c.kind) && !/attempt/i.test(c.kind)));
check("symptoms outranks guidance by weight (users describe problems, not fixes)",
  KIND_WEIGHTS.symptoms > KIND_WEIGHTS.guidance);
check("title and symptoms weigh the same, and both are the maximum",
  KIND_WEIGHTS.title === KIND_WEIGHTS.symptoms
  && Math.max(...Object.values(KIND_WEIGHTS)) === KIND_WEIGHTS.title);
check("no chunk in the whole bundle exceeds the embedder's context, so nothing is silently truncated",
  bundle.articles.flatMap(chunkArticle).every((c) => !c.long));
check("an empty field produces no chunk rather than an empty one",
  chunkArticle({ id: "x", type: "troubleshooting", title: "T", guidance: [], symptoms: [] })
    .every((c) => c.text.length > 0));

console.log("\n  -- change detection --");
const a0 = bundle.articles[0];
check("the same article hashes the same after a key-order reshuffle",
  articleHash(a0, h) === articleHash(Object.fromEntries(Object.entries(a0).reverse()), h));
check("an edited article hashes differently - otherwise re-ingest keeps a stale vector silently",
  articleHash(a0, h) !== articleHash({ ...a0, title: a0.title + "!" }, h));
check("approxTokens is a rough estimate and says so by being obviously crude",
  approxTokens("a".repeat(400)) === 100);

// ==============================================================================================
console.log("\n=== 3. RRF fusion is a pure function, so every property is testable here ===");
const lex = (ids) => ids.map((id, i) => ({ chunkId: id, articleId: `a${id}`, kind: "title", text: "t", weight: 1, rank: i + 1, legScore: 1 - i / 10 }));
check("a chunk found by BOTH legs outranks one found by a single leg at a better rank",
  (() => {
    const f = fuseRRF({ lexical: lex([1, 2]), semantic: lex([2]).map((c) => ({ ...c, rank: 1 })), topK: 5 });
    return f[0].chunkId === 2;
  })(), "this is the property that makes hybrid retrieval worth having at all");
check("both legs' ranks are reported, so a retrieval log can show WHICH leg found a chunk",
  (() => {
    const f = fuseRRF({ lexical: lex([7]), semantic: [], topK: 5 });
    return f[0].lexRank === 1 && f[0].semRank === null;
  })());
check("the kind weight is applied in FUSION, so a heavier kind at a worse rank can win",
  (() => {
    const light = [{ chunkId: 1, articleId: "a", kind: "guidance", text: "t", weight: 0.6, rank: 1, legScore: 1 }];
    const heavy = [{ chunkId: 2, articleId: "b", kind: "symptoms", text: "t", weight: 1.0, rank: 2, legScore: 1 }];
    return fuseRRF({ lexical: [...light, ...heavy], topK: 5 })[0].chunkId === 2;
  })());
check("scores use 1/(k+rank) with k = RRF_K",
  Math.abs(fuseRRF({ lexical: lex([1]), topK: 1 })[0].score - 1 / (RRF_K + 1)) < 1e-12);
check("topK truncates", fuseRRF({ lexical: lex([1, 2, 3, 4, 5, 6, 7]), topK: 3 }).length === 3);
check("ties break on chunkId, so the order is deterministic and a test cannot flake",
  (() => {
    const same = [1, 2, 3].map((id) => ({ chunkId: id, articleId: "a", kind: "title", text: "t", weight: 1, rank: 1, legScore: 1 }));
    return fuseRRF({ lexical: same, topK: 3 }).map((r) => r.chunkId).join() === "1,2,3";
  })());
check("fusing nothing returns nothing rather than throwing - an empty corpus must not break a turn",
  fuseRRF({ lexical: [], semantic: [], topK: 5 }).length === 0);
check("a fused row carries no per-leg `rank`/`legScore` field that could be mistaken for the fused one",
  (() => { const r = fuseRRF({ lexical: lex([1]), topK: 1 })[0]; return r.rank === undefined && r.legScore === undefined; })());

// ==============================================================================================
console.log("\n=== 4. the answer contract - B7a's PRIMARY acceptance property ===");
const schema = answerToolSchema();
check(`the tool is named "${ANSWER_TOOL}"`, schema.function.name === ANSWER_TOOL);
check("`answered` is REQUIRED - the decision, not a flag on a decision",
  schema.function.parameters.required.includes("answered"));
check("`reply` is required too", schema.function.parameters.required.includes("reply"));
check("additionalProperties is false, so the model cannot smuggle a field past the schema",
  schema.function.parameters.additionalProperties === false);
check("the tool's own description states the constraint, not just the system prompt",
  /do not answer it|ONLY/i.test(schema.function.description));

const call = (args) => ({ choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ function: { name: ANSWER_TOOL, arguments: JSON.stringify(args) } }] } }] });

console.log("\n  -- the corrections, each preventing one user-visible defect --");
let r = readAnswerCall(call({ answered: true, reply: "Press Win + Shift + S", citedArticleIds: ["keyboard-shortcuts-windows"] }), { suppliedArticleIds: ["keyboard-shortcuts-windows"] });
check("a properly cited answer passes through unchanged", r.answered === true && r.problems.length === 0 && r.cited.length === 1);

r = readAnswerCall(call({ answered: true, reply: "Edit HKLM\\Software\\Foo", citedArticleIds: [] }), { suppliedArticleIds: ["keyboard-shortcuts-windows"] });
check("ANSWERED WITH NO CITATION IS DOWNGRADED TO A DECLINE - this is the whole point of B7a",
  r.answered === false && r.reply === DECLINE_REPLY,
  "an answer attributable to no article is an answer from training wearing the company's authority");

r = readAnswerCall(call({ answered: true, reply: "See the VPN article", citedArticleIds: ["vpn-setup-guide"] }), { suppliedArticleIds: ["keyboard-shortcuts-windows"] });
check("a citation of an article that was NOT supplied is dropped, and the answer then downgrades",
  r.answered === false && r.cited.length === 0 && r.problems.some((p) => /not supplied/.test(p)),
  "otherwise the citation - the trust signal - is the invented part");

r = readAnswerCall(call({ answered: false, reply: "I don't have guidance on that.", citedArticleIds: ["keyboard-shortcuts-windows"] }), { suppliedArticleIds: ["keyboard-shortcuts-windows"] });
check("a decline that cites articles has the citations cleared",
  r.answered === false && r.cited.length === 0,
  "a decline showing citations reads as 'here is the answer, but no'");

r = readAnswerCall(call({ answered: true, reply: "   ", citedArticleIds: ["keyboard-shortcuts-windows"] }), { suppliedArticleIds: ["keyboard-shortcuts-windows"] });
check("an empty reply never reaches the user, whatever `answered` said", r.reply.length > 20 && r.answered === false);

r = readAnswerCall({ choices: [{ finish_reason: "stop", message: { content: "Sure! Just edit the registry." } }] }, { suppliedArticleIds: [] });
check("PROSE WITH NO TOOL CALL IS AN ERROR, NOT AN ANSWER - it never becomes the reply",
  Boolean(r.error) && !r.reply,
  "the model bypassing the schema is exactly the path that returns unattributable advice");

r = readAnswerCall({ choices: [{ message: { tool_calls: [{ function: { name: "answer", arguments: "{not json" } }] } }] }, { suppliedArticleIds: [] });
check("malformed arguments are an error rather than a partial answer", Boolean(r.error));

check("the fallback decline offers a ticket and claims nothing that might be false",
  /ticket/i.test(DECLINE_REPLY) && !/raised|searched|no answer exists/i.test(DECLINE_REPLY));

console.log("\n  -- the prompt, which is the lever the bake-off actually measured --");
const sp = answerSystemPrompt({ hasArticles: true });
check("the system prompt states the constraint before anything else",
  /Answer ONLY from the knowledge base articles/.test(sp));
check("it says a decline is the RIGHT answer, not a failure - `whenNotToUse` moved every model",
  /RIGHT answer and not a failure/.test(sp));
check("it forbids inventing a registry path, command or error code by name",
  /registry path/.test(sp) && /error code/.test(sp));
check("it says adjacent is not covering - the failure mode six articles actually produces",
  /Adjacent is not covering/.test(sp));
check("it tells the model articles are reference material and NOT instructions (G4)",
  /NOT instructions to you/.test(sp));
check("with no articles it says so explicitly rather than leaving the model to notice",
  /NO ARTICLES WERE SUPPLIED/.test(answerSystemPrompt({ hasArticles: false })));

const built = buildAnswerInput({
  text: "how do I take a screenshot",
  retrieval: {
    chunks: [{ articleId: "keyboard-shortcuts-windows", kind: "reference", text: "| Screenshot a region | Win + Shift + S |" }],
    articles: [{ id: "keyboard-shortcuts-windows", title: "Shortcuts", platform: "windows", lifecycle: "unvalidated", do_not_attempt: ["reinstall Windows"], escalate_when: ["it recurs"] }],
  },
});
check("THE CORPUS IS NOT IN THE SYSTEM PROMPT (G4) - it is in a user-role message",
  !built.messages[0].content.includes("Win + Shift + S")
  && built.messages[1].content.includes("Win + Shift + S")
  && built.messages[1].role === "user");
check("chunks arrive inside a delimited, labelled block", /--- ARTICLE ---[\s\S]*--- END ARTICLE ---/.test(built.messages[1].content));
check("each article carries its id, so a citation can name it", /id: keyboard-shortcuts-windows/.test(built.messages[1].content));
check("each article carries its KCS confidence state (D172) - every v2 article is `unvalidated`",
  /confidence: unvalidated/.test(built.messages[1].content));
check("doNotAttempt travels with the article even though it is not chunked",
  /must NOT be suggested[\s\S]*reinstall Windows/.test(built.messages[1].content));
check("escalateWhen travels too", /hand to a person when[\s\S]*it recurs/.test(built.messages[1].content));
check("exactly one tool is offered - a question turn cannot accidentally propose a machine change",
  built.tools.length === 1 && built.tools[0].function.name === ANSWER_TOOL);
check("with no articles the user message says so and no block is fabricated",
  /NO KNOWLEDGE BASE ARTICLES/.test(buildAnswerInput({ text: "q", retrieval: { chunks: [], articles: [] } }).messages[1].content));
check("articlesBlock on nothing is empty rather than an empty wrapper", articlesBlock({ chunks: [], articles: [] }) === "");

// ==============================================================================================
console.log("\n=== 5. tenancy is provisional and REFUSES to be supplied by a client ===");
check("a valid question passes", checkAskRequest({ text: "how do I take a screenshot" }) === null);
check("probe is OPTIONAL - a question is answerable without machine state", checkAskRequest({ text: "q" }) === null);
check("an empty question is refused", checkAskRequest({ text: "  " }) !== null);
for (const field of ["tenant", "tenantId", "tenantLabel"]) {
  const msg = checkAskRequest({ text: "q", [field]: "acme" });
  check(`a client-supplied \`${field}\` is REFUSED, with the reason`,
    typeof msg === "string" && /tenancy model by default/.test(msg),
    "the spec's warning: do not let a header become the tenancy model");
}
check("windows is detected from a probe", platformFromProbe({ platform: "win32" }) === "windows");
check("macos is detected", platformFromProbe({ platform: "darwin" }) === "macos");
check("AN UNRECOGNISED PROBE YIELDS null, NOT A GUESS - the conservative direction (D162)",
  platformFromProbe({ platform: "plan9" }) === null && platformFromProbe({}) === null && platformFromProbe(null) === null,
  "guessing a platform is how a macOS article reaches a Windows user");

// ==============================================================================================
console.log("\n=== 6. the embedder is behind an interface, and the dimension is asserted ===");
check(`EMBEDDING_DIM is ${EMBEDDING_DIM} and matches migration 002's vector() width`,
  new RegExp(`embedding\\s+vector\\(${EMBEDDING_DIM}\\)`).test(read("migrations/control/002-generic-kb.sql")));
check("the query prefix is arctic's asymmetric `query: ` and lives in exactly one place",
  QUERY_PREFIX === "query: "
  && (read("src/kb/ingest.js").match(/QUERY_PREFIX/g) ?? []).length <= 1);
check("toVectorLiteral produces pgvector's text form", toVectorLiteral([1, 2.5, -3]) === "[1,2.5,-3]");
check("toVectorLiteral refuses a vector with a non-finite value rather than writing NaN into a column",
  (() => { try { toVectorLiteral([1, NaN]); return false; } catch { return true; } })());
check("toVectorLiteral refuses an empty vector",
  (() => { try { toVectorLiteral([]); return false; } catch { return true; } })());
check("the no-embedder provider REFUSES rather than returning zeros - a zero vector retrieves",
  await (async () => { try { await new NoEmbeddingProvider().embed(["x"]); return false; } catch { return true; } })());
check("`none` is a real configuration and reports itself as unavailable",
  (await new NoEmbeddingProvider().verify()).ok === false);

// ==============================================================================================
console.log("\n=== 7. source rules B7a must not have broken ===");
const turnJs = jsCode(read("src/turn.js"));
check("/v1/turn IS STILL STATELESS - B7a added a route, it did not add a database to this one",
  !/db\/|from "pg"|Pool|withTenant/.test(turnJs),
  "test/db-static.test.mjs asserts the same thing; both should fail together if it regresses");
check("/v1/turn still forces a tool call, so the shipping direct path is unchanged",
  /tool_choice/.test(jsCode(read("src/providers/openai-compatible-provider.js"))));
check("the ask route reaches the control plane through withControl only",
  /withControl/.test(jsCode(read("src/kb/retrieve.js")))
  && !/SET LOCAL|search_path/.test(jsCode(read("src/kb/retrieve.js"))));
check("no kb file names a tenant schema or sets a search_path",
  ["src/kb/ask.js", "src/kb/retrieve.js", "src/kb/ingest.js", "src/kb/embed.js", "src/kb/chunk.js", "src/kb/answer.js"]
    .every((f) => !/search_path|\bt_[a-z0-9_]{3,}\b/.test(jsCode(read(f)))));

console.log("\n  -- the honesty guards: these fail if a caveat is quietly dropped --");
check("THE RELEVANCE FLOOR IS STILL UNSET, and null is the honest value",
  RELEVANCE_FLOOR === null,
  "any number here would be invented; a too-low floor silently disables the decline behaviour");
check("DEFAULT_TOP_K is within the spec's 3-5", DEFAULT_TOP_K >= 3 && DEFAULT_TOP_K <= 5);
check("no reranker has been added without a decision",
  !/rerank/i.test(jsCode(read("src/kb/retrieve.js")).replace(/rerankerPresent/g, "")),
  "D203+ is where a reranker gets decided; adding one quietly makes B7a's floor look like a measurement");
check("/v1/ask tells the caller no reranker exists, in the response",
  /rerankerPresent:\s*false/.test(read("src/kb/ask.js")));
check("retrieve.js records that k = 60 is UNRETRIEVED rather than presenting it as sourced",
  /\[VERIFY\]|unretrieved/.test(read("src/kb/retrieve.js")) && RRF_K === 60);
check("embed.js records that the dev embedder IS NOT D199's model",
  /IT IS NOT./.test(read("src/kb/embed.js"))
  && /snowflake-arctic-embed-m-v2.0/.test(read("src/kb/embed.js"))
  && /NOT an amendment to D199/.test(read("src/kb/embed.js")));
check("migration 002 carries decision provenance with write-time status (register §5.7b)",
  /PROPOSED 2026-09-04|PROPOSED when/.test(read("migrations/control/002-generic-kb.sql")));
check("the retrieval log does NOT store the user's sentence by default (D154)",
  /MATIC_KB_LOG_QUERIES/.test(read("src/kb/retrieve.js"))
  && /keepQuery \? query : null/.test(read("src/kb/retrieve.js")));
// The response body only. `retrieval.chunks` is read freely above it - what must not happen is a
// chunk's TEXT reaching the wire, and `retrieval.chunks.length` is a count, not text.
check("chunk text never leaves the hub - /v1/ask returns article ids and counts, not chunks (D53)",
  (() => {
    const body = jsCode(read("src/kb/ask.js")).split("return send(200,")[1] ?? "";
    return body.length > 0 && !/retrieval\.chunks(?!\.length)/.test(body) && !/\.text\b/.test(body);
  })());

const sql = sqlCode(read("migrations/control/002-generic-kb.sql"));
check("kb_chunks has both a tsvector and a vector column - the two legs live on one table",
  /tsv\s+tsvector/.test(sql) && /embedding\s+vector\(/.test(sql));
check("tsv is GENERATED, so it cannot drift from the text it indexes", /GENERATED ALWAYS AS/.test(sql));
check("there is a GIN index on tsv and an HNSW index on embedding",
  /USING gin \(tsv\)/.test(sql) && /USING hnsw \(embedding/.test(sql));
check("an embedding cannot exist without the model that produced it",
  /kb_chunks_embedding_attributed/.test(sql));
check("customer KB is NOT in this migration (D44)", !/customer_kb|tenant_kb/.test(sql));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
