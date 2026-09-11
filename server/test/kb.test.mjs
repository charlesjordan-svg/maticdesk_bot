/**
 * B7a against a real PostgreSQL. No model is called; every assertion here is about retrieval.
 *
 * Run: npm.cmd run db:up   (once)
 *      node test/kb.test.mjs        (from server/; part of `npm run test:db`)
 *
 * WHAT THIS FILE IS FOR, AND WHAT IT DELIBERATELY IS NOT
 *
 * It proves the RETRIEVAL PATH works: the migration applies, ingestion is idempotent, EACH LEG
 * WORKS ALONE, fusion combines them, and the platform pre-filter excludes before ranking rather
 * than after. B7a spec §9 item 4 asks for exactly this ordering, because a broken leg inside an RRF
 * fusion returns plausible results in a plausible order.
 *
 * **It says nothing about retrieval QUALITY.** Six articles, no cross-encoder reranker, and no
 * corpus to measure on. Every number this file could produce is a floor.
 *
 * IT MIGRATES FIRST AND CLEANS UP AFTER ITSELF. It runs against the shared generic corpus (there is
 * no per-test namespace for a cross-tenant corpus by construction — D45), so it re-ingests the real
 * bundle, which is idempotent, and any throwaway article it adds is named `zz-test-` and removed in
 * a `finally`. Safe on a fresh database or a used one.
 *
 * The SEMANTIC LEG IS SKIPPED, NOT FAILED, when no embedder is reachable, and the skip is loud. A
 * lexical-only run is a real configuration (B7a spec §6) and a suite that fails on it would push
 * someone towards making the semantic leg pass by weakening it.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, withControl } from "../src/db/pool.js";
import { migrateControl } from "../src/db/migrate.js";
import { corpusStatus, embedPending, ingestBundle, upsertArticle } from "../src/kb/ingest.js";
import { embeddingProviderFromEnv } from "../src/kb/embed.js";
import { fuseRRF, lexicalLeg, semanticLeg, retrieve, logRetrieval, retrievalModeOf } from "../src/kb/retrieve.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(HERE, "..", "..", "docs", "kb", "generic-kb-v2.json");
const THROWAWAY = "zz-test-macos-only";

let pass = 0, fail = 0, skipped = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}
function skip(label, why) { skipped++; console.log(`  SKIP  ${label} — ${why}`); }

async function main() {
  console.log("\n=== 0. migrate, then load the corpus ===");
  const applied = await migrateControl({ log: (m) => console.log(m) });
  check("migrateControl runs (it applies 002-generic-kb on a fresh database and skips it on a used one)",
    Array.isArray(applied), `applied: ${applied.join(", ") || "nothing pending"}`);

  const first = await ingestBundle({ path: BUNDLE, log: () => {} });
  check("the bundle ingests", first.results.length === 6, `${first.results.length} articles`);
  const s1 = await corpusStatus();
  check("six articles are loaded", s1.articles >= 6, `${s1.articles}`);
  check("every article produced at least two chunks (title + symptoms at minimum)",
    s1.chunks >= s1.articles * 2, `${s1.chunks} chunks for ${s1.articles} articles`);

  console.log("\n  -- re-ingest is idempotent, and that is not cosmetic --");
  const second = await ingestBundle({ path: BUNDLE, log: () => {} });
  check("a second ingest reports every article UNCHANGED",
    second.results.every((r) => r.action === "unchanged"),
    second.results.filter((r) => r.action !== "unchanged").map((r) => `${r.id}=${r.action}`).join(", "));
  const s2 = await corpusStatus();
  check("and adds no chunks - re-ingesting does not duplicate the corpus",
    s2.chunks === s1.chunks, `${s1.chunks} -> ${s2.chunks}`);

  console.log("\n  -- an EDIT rebuilds chunks rather than leaving a stale vector --");
  const edited = await withControl(async (client) => {
    const bundle = JSON.parse((await import("node:fs")).readFileSync(BUNDLE, "utf8"));
    const a = { ...bundle.articles.find((x) => x.id === "bluetooth-peripheral-disconnects") };
    a.symptoms = [...a.symptoms, "zzz-edit-marker-unique-token"];
    const r = await upsertArticle(client, a, "test");
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM control.kb_chunks WHERE article_id = $1 AND embedding IS NULL",
      [a.id],
    );
    return { action: r.action, unembedded: rows[0].n };
  });
  check("an edited article is reported as `updated`, not `unchanged`", edited.action === "updated");
  check("ITS CHUNKS LOSE THEIR EMBEDDINGS, so a stale vector cannot describe changed text",
    edited.unembedded > 0,
    "this is the failure that is invisible: retrieval keeps working and keeps being subtly wrong");
  // Put it back.
  await ingestBundle({ path: BUNDLE, log: () => {} });

  // ==========================================================================================
  console.log("\n=== 1. THE LEXICAL LEG, ALONE ===");
  const dl = await lexicalLeg({ query: "DisplayLink", platform: null });
  check("acceptance item 4: an exact-string query for `DisplayLink` retrieves the dock article",
    dl.length > 0 && dl.some((c) => c.articleId === "dock-external-monitors-not-detected"),
    "this is the leg dense embedding cannot replace - a product name has no position in the vector space");
  check("and the dock article is the TOP lexical hit, not merely present",
    dl[0]?.articleId === "dock-external-monitors-not-detected", dl[0]?.articleId ?? "(nothing)");

  const bt = await lexicalLeg({ query: "bluetooth mouse keeps disconnecting", platform: null });
  check("a natural-language query also hits lexically",
    bt.some((c) => c.articleId === "bluetooth-peripheral-disconnects"));
  check("lexical ranks are 1..n with no gaps", bt.every((c, i) => c.rank === i + 1));
  check("a query matching nothing returns nothing rather than everything at rank 1",
    (await lexicalLeg({ query: "xylophone quantum souffle", platform: null })).length === 0);
  check("punctuation does not raise a syntax error (websearch_to_tsquery, not to_tsquery)",
    Array.isArray(await lexicalLeg({ query: "why won't my dock work?! (urgent)", platform: null })));

  // ==========================================================================================
  console.log("\n=== 2. THE SEMANTIC LEG, ALONE ===");
  const embedder = embeddingProviderFromEnv();
  const v = await embedder.verify();
  let semanticRan = false;
  if (!v.ok) {
    skip("the semantic leg", `no embedder: ${v.error ?? "wrong dimensions"}. Lexical-only is a REAL configuration (B7a spec §6), not a failure.`);
  } else {
    console.log(`  (embedder ${embedder.model}, ${v.dimensions} dims, L2 ${v.l2.toFixed(6)} — NOT D199's model; see src/kb/embed.js)`);
    const e = await embedPending({ embedder, log: () => {} });
    const s3 = await corpusStatus();
    check("every chunk is embedded after embedPending", s3.embedded === s3.chunks, `${s3.embedded}/${s3.chunks}`);
    check("exactly ONE embedding model is present - two models means two vector spaces",
      s3.models.length === 1, s3.models.map((m) => m.model).join(", "));
    check("embedPending is idempotent - a second run embeds nothing",
      (await embedPending({ embedder, log: () => {} })).embedded === 0, `(first run: ${e.embedded})`);

    const sem = await semanticLeg({ vector: await embedder.embedQuery("my wireless mouse cuts out"), platform: null });
    check("the semantic leg returns candidates", sem.length > 0);
    check("it finds the bluetooth article WITHOUT the word 'bluetooth' in the query",
      sem.slice(0, 5).some((c) => c.articleId === "bluetooth-peripheral-disconnects"),
      `top 5: ${sem.slice(0, 5).map((c) => c.articleId).join(", ")}`);
    check("legScore is a SIMILARITY in [-1, 1] and descends, so higher is better in both legs",
      sem.every((c) => c.legScore >= -1.001 && c.legScore <= 1.001)
      && sem.every((c, i) => i === 0 || sem[i - 1].legScore >= c.legScore - 1e-9));
    semanticRan = true;

    console.log("\n  -- the semantic leg does what the lexical leg cannot, and vice versa --");
    const paraphrase = "I can't hear anyone properly on video calls";
    const semP = await semanticLeg({ vector: await embedder.embedQuery(paraphrase), platform: null });
    const lexP = await lexicalLeg({ query: paraphrase, platform: null });
    check("a paraphrase with no shared vocabulary is found semantically",
      semP.slice(0, 3).some((c) => c.articleId === "meeting-audio-video-poor-quality"),
      `semantic top 3: ${semP.slice(0, 3).map((c) => c.articleId).join(", ")}`);
    console.log(`  (for the same query the lexical leg returned ${lexP.length} candidate(s): ${lexP.slice(0, 3).map((c) => c.articleId).join(", ") || "nothing"})`);

    const semDL = await semanticLeg({ vector: await embedder.embedQuery("DisplayLink"), platform: null });
    const lexBeatsSem = semDL[0]?.articleId !== "dock-external-monitors-not-detected";
    console.log(`  (for "DisplayLink" the semantic leg's top hit was ${semDL[0]?.articleId ?? "nothing"}`
      + ` — the lexical leg's was ${dl[0]?.articleId}. ${lexBeatsSem ? "The legs disagree, which is why there are two." : "They agree here."})`);
  }

  // ==========================================================================================
  console.log("\n=== 3. FUSION, over real candidates ===");
  const lexF = await lexicalLeg({ query: "external monitors not detected through my dock", platform: null });
  const semF = semanticRan
    ? await semanticLeg({ vector: await embedder.embedQuery("external monitors not detected through my dock"), platform: null })
    : [];
  const fused = fuseRRF({ lexical: lexF, semantic: semF, topK: 5 });
  check("fusion returns at most topK", fused.length <= 5);
  check("fusion finds the dock article", fused.some((c) => c.articleId === "dock-external-monitors-not-detected"));
  check("every fused row reports which leg(s) found it",
    fused.every((c) => c.lexRank !== null || c.semRank !== null));
  check("scores descend", fused.every((c, i) => i === 0 || fused[i - 1].score >= c.score - 1e-12));

  // ==========================================================================================
  console.log("\n=== 4. THE PLATFORM PRE-FILTER EXCLUDES BEFORE RANKING (D162) ===");
  // Acceptance item 5: add a throwaway macOS article, prove it is never retrieved for Windows,
  // then remove it. The bundle contains no macOS article, so the test has to make one.
  await withControl((client) => upsertArticle(client, {
    id: THROWAWAY,
    type: "troubleshooting",
    title: "External monitors are not detected through a docking station on a Mac",
    platform: "macos",
    lifecycle: "unvalidated",
    problem: "Monitors connected through a dock are not detected.",
    symptoms: ["my monitors aren't working through the dock", "external displays not detected", "DisplayLink"],
    keywords: ["dock", "DisplayLink", "monitor", "display"],
    guidance: ["Check System Settings > Displays."],
    escalateWhen: [], doNotAttempt: [],
  }, "test"));
  if (semanticRan) await embedPending({ embedder, log: () => {} });

  const anyOnly = await lexicalLeg({ query: "DisplayLink dock monitors", platform: null });
  check("with NO platform, only `any` articles are eligible - the conservative direction",
    !anyOnly.some((c) => c.articleId === THROWAWAY),
    "an unknown platform admitting everything is how a macOS article reaches a Windows user");

  const win = await lexicalLeg({ query: "DisplayLink dock monitors", platform: "windows" });
  check("ACCEPTANCE ITEM 5: a macos article is NEVER retrieved for a windows machine (lexical)",
    !win.some((c) => c.articleId === THROWAWAY),
    `got: ${win.map((c) => c.articleId).join(", ")}`);
  check("but the windows-platform reference article IS eligible for a windows machine",
    (await lexicalLeg({ query: "keyboard shortcut screenshot", platform: "windows" }))
      .some((c) => c.articleId === "keyboard-shortcuts-windows"));
  check("and it is NOT eligible when the platform is unknown",
    !(await lexicalLeg({ query: "keyboard shortcut screenshot", platform: null }))
      .some((c) => c.articleId === "keyboard-shortcuts-windows"));

  if (semanticRan) {
    const semWin = await semanticLeg({ vector: await embedder.embedQuery("monitors not detected through the dock"), platform: "windows" });
    check("ACCEPTANCE ITEM 5, semantic leg too - the pre-filter is in BOTH legs, not after fusion",
      !semWin.some((c) => c.articleId === THROWAWAY),
      "filtering after fusion still lets it consume one of the 3-5 slots and compete for rank");
    const semMac = await semanticLeg({ vector: await embedder.embedQuery("monitors not detected through the dock"), platform: "macos" });
    check("a macos machine CAN see it, so the filter is a filter and not a delete",
      semMac.some((c) => c.articleId === THROWAWAY));
  }

  // ==========================================================================================
  console.log("\n=== 5. the full retrieve(), as the route calls it ===");
  const full = await retrieve({ query: "how do I take a screenshot", platform: "windows", embedder: semanticRan ? embedder : null });
  check("it returns chunks and the articles they came from", full.chunks.length > 0 && full.articles.length > 0);
  check("ACCEPTANCE ITEM 2: 'how do I take a screenshot' retrieves keyboard-shortcuts-windows",
    full.articles.some((a) => a.id === "keyboard-shortcuts-windows"),
    `got: ${full.articles.map((a) => a.id).join(", ")}`);
  check("the retrieved chunk contains the actual answer, so a model has something to cite",
    full.chunks.some((c) => /Win \+ Shift \+ S/.test(c.text)));
  check("`legs` reports which legs ran, so a caller cannot report a number from an unknown pipeline",
    full.legs.lexical === true && full.legs.semantic === semanticRan);
  check("articles carry doNotAttempt / escalateWhen, which are not chunked but must reach the prompt",
    full.articles.every((a) => Array.isArray(a.do_not_attempt) && Array.isArray(a.escalate_when)));

  const mouse = await retrieve({ query: "my mouse keeps cutting out", platform: "windows", embedder: semanticRan ? embedder : null });
  check("ACCEPTANCE ITEM 3: 'my mouse keeps cutting out' retrieves bluetooth-peripheral-disconnects",
    mouse.articles.some((a) => a.id === "bluetooth-peripheral-disconnects"),
    `got: ${mouse.articles.map((a) => a.id).join(", ")}`);

  console.log("\n  -- the negative side of retrieval: nothing matched means NOTHING returned --");
  for (const q of [
    "how do I request a payroll adjustment",
    "what is our policy on expensing a taxi",
    "how do I set up a new SQL Server availability group",
    "who approves a purchase order over ten thousand dollars",
    "how do I reset the door badge reader in the lobby",
  ]) {
    const r = await retrieve({ query: q, platform: "windows", embedder: null });
    check(`no lexical match for "${q.slice(0, 44)}..." -> zero chunks`, r.chunks.length === 0,
      `got ${r.chunks.length}: ${r.articles.map((a) => a.id).join(", ")}`);
  }
  if (semanticRan) {
    console.log("\n  -- WITH the semantic leg the same questions DO return chunks, and that is expected --");
    const withSem = await retrieve({ query: "how do I request a payroll adjustment", platform: "windows", embedder });
    console.log(`  (payroll question, both legs: ${withSem.chunks.length} chunk(s), top score ${withSem.topScore.toFixed(5)},`
      + ` articles ${withSem.articles.map((a) => a.id).join(", ") || "none"})`);
    console.log("  A dense leg always returns its nearest neighbours - there is no such thing as 'no match'.");
    console.log("  THIS IS WHY THE DECLINE IS THE PROMPT'S JOB (src/kb/answer.js) AND NOT RETRIEVAL'S,");
    console.log("  and why the relevance floor is unset rather than guessed (src/kb/retrieve.js).");
  }

  console.log("\n  -- the relevance floor, when one is supplied --");
  const floored = await retrieve({ query: "how do I take a screenshot", platform: "windows", embedder: semanticRan ? embedder : null, floor: 99 });
  check("an absurdly high floor suppresses every chunk and says so",
    floored.chunks.length === 0 && floored.floorApplied === true);
  check("a floor of 0 suppresses nothing",
    (await retrieve({ query: "how do I take a screenshot", platform: "windows", embedder: null, floor: 0 })).floorApplied === false);

  // ==========================================================================================
  console.log("\n=== 6. the retrieval log (D166) ===");
  const logId = await logRetrieval({
    query: "how do I take a screenshot", platform: "windows", tenantLabel: "zz-test",
    result: full, cited: ["keyboard-shortcuts-windows"], answered: true, model: "test-model",
    mode: retrievalModeOf({ result: full }),
  });
  check("a log row is written and returns its id", Number.isInteger(logId) && logId > 0);
  const row = await withControl(async (client) => {
    const { rows } = await client.query("SELECT * FROM control.kb_retrieval_log WHERE id = $1", [logId]);
    return rows[0];
  });
  check("ACCEPTANCE ITEM 8: the log contains chunk ids AND scores for every retrieved chunk",
    Array.isArray(row.retrieved) && row.retrieved.length === full.chunks.length
    && row.retrieved.every((r) => Number.isInteger(r.chunkId) && typeof r.score === "number"));
  check("it records which leg found each chunk, so a retrieval miss is distinguishable from a reasoning miss",
    row.retrieved.every((r) => "lexRank" in r && "semRank" in r));
  check("it records what the model cited and whether it answered - the OUTCOME, kept separate",
    row.cited.includes("keyboard-shortcuts-windows") && row.answered === true);
  check("THE USER'S SENTENCE IS NOT STORED unless MATIC_KB_LOG_QUERIES=1 (D154)",
    process.env.MATIC_KB_LOG_QUERIES === "1" ? row.query_text !== null : row.query_text === null,
    "a hub-side table of what employees typed is the transcript-access problem D154 constrains");
  await withControl((c) => c.query("DELETE FROM control.kb_retrieval_log WHERE tenant_label = 'zz-test'"));

  console.log("\n=== 7. degraded modes are real configurations, not failures ===");
  const noEmbed = await retrieve({ query: "DisplayLink", platform: null, embedder: null });
  check("with no embedder, retrieval still works through the lexical leg",
    noEmbed.chunks.length > 0 && noEmbed.legs.semantic === false);
  const brokenEmbedder = { embedQuery: async () => { throw new Error("connection refused"); } };
  const broken = await retrieve({ query: "DisplayLink", platform: null, embedder: brokenEmbedder });
  check("AN EMBEDDER THAT THROWS DEGRADES, IT DOES NOT FAIL THE TURN",
    broken.chunks.length > 0 && broken.legs.semantic === false && /connection refused/.test(broken.legs.semanticError),
    "the endpoint's alternative to a degraded answer is no answer at all");
  check("and the failure is reported rather than swallowed", broken.legs.semanticError !== null);
}

main()
  .catch((err) => { fail++; console.log(`\n  FAIL  the suite threw: ${err.stack ?? err.message}`); })
  .finally(async () => {
    // The throwaway macOS article, always, even on a throw. It is `zz-test-` prefixed so that a
    // leaked row is obvious rather than looking like corpus.
    try { await withControl((c) => c.query("DELETE FROM control.kb_articles WHERE id = $1", [THROWAWAY])); } catch { /* nothing to clean */ }
    try { await ingestBundle({ path: BUNDLE, log: () => {} }); } catch { /* leave it */ }
    await closePool();
    console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ""}`);
    if (fail > 0) process.exitCode = 1;
  });
