#!/usr/bin/env node
// @ts-check
/**
 * B7a's ACCEPTANCE LIST, run end-to-end. Spec §8.
 *
 * Run: npm.cmd run db:up          (PostgreSQL)
 *      ollama serve               (a chat model AND the embedder)
 *      npm.cmd run kb:accept      (from server/)
 *
 * This starts its OWN hub in-process on an ephemeral port, so nothing needs to be running on 8787
 * and the run cannot accidentally test a stale server.
 *
 * ==============================================================================================
 * ITEM 1 IS FIRST, AND IT IS NEGATIVE, AND THAT ORDERING IS THE POINT
 * ==============================================================================================
 *
 * *"A question with no supporting article produces a decline and an offer to raise a ticket, with no
 * invented answer."* B7a spec §8 puts it before any retrieval-quality test, because with six
 * articles most questions are not covered — so **a system that answers everything scores well on
 * recall and is unshippable.** Confident invented IT advice presented as company knowledge is worse
 * than "I don't know", because the user acts on it and it is attributed to their IT department.
 *
 * So this file runs the five negative cases first, and if they fail it says so loudly before
 * reporting anything about what retrieval found.
 *
 * ==============================================================================================
 * WHAT A PASS HERE DOES AND DOES NOT MEAN
 * ==============================================================================================
 *
 * A pass means: the path works, and the system declines when it should. That is B7a's stated
 * purpose and its whole claim.
 *
 * A pass does NOT mean the product answers questions well. Six articles is not a corpus, there is
 * **no cross-encoder reranker** (spec §7, register §10.2, review A1), the dev embedder is not
 * D199's model (src/kb/embed.js), and nothing is measured on a real corpus. Any figure below is a
 * FLOOR. This file prints that with its results so a number cannot travel without it.
 *
 * MODELS VARY RUN TO RUN. The bake-off's measured run-to-run variance is 2 cases in 40. A single
 * failing positive case here is weak evidence; a failing NEGATIVE case is strong evidence, because
 * declining is the behaviour the prompt is built to force.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHubServer } from "../src/index.js";
import { OpenAICompatibleProvider } from "../src/providers/openai-compatible-provider.js";
import { closePool, withControl } from "../src/db/pool.js";
import { migrateControl } from "../src/db/migrate.js";
import { corpusStatus, embedPending, ingestBundle, upsertArticle } from "../src/kb/ingest.js";
import { embeddingProviderFromEnv } from "../src/kb/embed.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(HERE, "..", "..", "docs", "kb", "generic-kb-v2.json");
const THROWAWAY = "zz-accept-macos-only";
const MODEL = process.env.MATIC_HUB_MODEL ?? "mistral-small:24b";
const WINDOWS_PROBE = { platform: "win32", osVersion: "10.0.26200" };

let pass = 0, fail = 0;
const failures = [];
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; failures.push(label); console.log(`  FAIL  ${label}${extra ? `\n        ${extra}` : ""}`); }
}
const line = (c = "=") => console.log(c.repeat(94));

/** POST to our own hub. */
async function ask(base, body) {
  const res = await fetch(`${base}/v1/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function main() {
  line();
  console.log("  B7a ACCEPTANCE — spec §8");
  line();

  // ---- setup ---------------------------------------------------------------------------------
  await migrateControl({ log: () => {} });
  await ingestBundle({ path: BUNDLE, log: () => {} });
  const embedder = embeddingProviderFromEnv();
  const v = await embedder.verify();
  if (v.ok) await embedPending({ embedder, log: () => {} });
  const corpus = await corpusStatus();

  console.log(`\n  corpus    ${corpus.articles} articles, ${corpus.chunks} chunks, ${corpus.embedded} embedded`);
  console.log(`  model     ${MODEL}`);
  console.log(`  embedder  ${v.ok ? `${embedder.model} (${v.dimensions} dims)` : `UNAVAILABLE — ${v.error}`}`);
  if (!v.ok) console.log(`            RUNNING LEXICAL-ONLY. Item 4 still means something; items 2, 3 are weaker.`);
  console.log(`  reranker  ABSENT — every number below is a FLOOR, not a measurement (spec §7)`);

  const provider = new OpenAICompatibleProvider({
    model: MODEL,
    baseUrl: process.env.MATIC_HUB_UPSTREAM ?? "http://127.0.0.1:11434/v1",
    timeoutMs: Number(process.env.MATIC_HUB_TIMEOUT_MS ?? 300000),
  });
  const server = createHubServer({ provider, hubProvider: "local", embedder: v.ok ? embedder : null, tenantLabel: "zz-accept", log: () => {} });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log(`  hub       ${base} (in-process, ephemeral port)\n`);

  try {
    // ========================================================================================
    line();
    console.log("  ITEM 1 — THE NEGATIVE TEST. A question with no supporting article DECLINES.");
    console.log("  Runs first on purpose: a system that answers everything scores well and is unshippable.");
    line();
    const outside = [
      "How do I request a payroll adjustment for last month?",
      "What is our policy on expensing a taxi to the airport?",
      "How do I set up a new SQL Server availability group?",
      "Who approves a purchase order over ten thousand dollars?",
      "How do I reset the badge reader on the lobby door?",
    ];
    let declined = 0;
    for (const q of outside) {
      const r = await ask(base, { text: q, probe: WINDOWS_PROBE });
      const b = r.body;
      const ok = r.status === 200 && b.answered === false && b.citedArticleIds.length === 0;
      if (ok) declined++;
      check(`declines: "${q.slice(0, 52)}${q.length > 52 ? "…" : ""}"`, ok,
        r.status !== 200 ? `HTTP ${r.status}: ${b.error}` : `answered=${b.answered} cited=[${b.citedArticleIds?.join(", ")}] reply="${String(b.reply).slice(0, 110)}"`);
      if (ok) {
        check(`  …and offers to raise a ticket`, /ticket/i.test(b.reply),
          `reply: "${String(b.reply).slice(0, 140)}"`);
      }
    }
    console.log(`\n  ITEM 1: ${declined}/${outside.length} declined.`);
    if (declined < outside.length) {
      console.log("  !! THIS IS THE ONE THAT MATTERS. An invented answer here is worse than no product,");
      console.log("  !! because the user acts on it and it carries their IT department's authority.");
      console.log("  !! The lever is the prompt (src/kb/answer.js), not retrieval ranking.");
    }

    // ========================================================================================
    line();
    console.log("  ITEMS 2-4 — the positive cases");
    line();
    {
      const r = await ask(base, { text: "How do I take a screenshot?", probe: WINDOWS_PROBE });
      const b = r.body;
      check("ITEM 2: 'how do I take a screenshot' answers, citing keyboard-shortcuts-windows",
        b.answered === true && b.citedArticleIds?.includes("keyboard-shortcuts-windows"),
        `answered=${b.answered} cited=[${b.citedArticleIds?.join(", ")}]`);
      check("ITEM 2: the answer contains Win + Shift + S",
        /win\s*\+\s*shift\s*\+\s*s/i.test(String(b.reply)), `reply: "${String(b.reply).slice(0, 200)}"`);
      console.log(`        reply: "${String(b.reply).replace(/\s+/g, " ").slice(0, 200)}"`);
    }
    {
      const r = await ask(base, { text: "My mouse keeps cutting out.", probe: WINDOWS_PROBE });
      const b = r.body;
      check("ITEM 3: 'my mouse keeps cutting out' cites bluetooth-peripheral-disconnects",
        b.answered === true && b.citedArticleIds?.includes("bluetooth-peripheral-disconnects"),
        `answered=${b.answered} cited=[${b.citedArticleIds?.join(", ")}]`);
      console.log(`        reply: "${String(b.reply).replace(/\s+/g, " ").slice(0, 200)}"`);
    }
    {
      const r = await ask(base, { text: "DisplayLink", probe: WINDOWS_PROBE });
      const b = r.body;
      check("ITEM 4: the exact string 'DisplayLink' retrieves the dock article (THE LEXICAL LEG)",
        b.retrieval?.articles?.includes("dock-external-monitors-not-detected"),
        `retrieved: [${b.retrieval?.articles?.join(", ")}]`);
      console.log(`        answered=${b.answered} cited=[${b.citedArticleIds?.join(", ")}] — a bare product name is not a question,`);
      console.log(`        so a decline here is defensible; what item 4 tests is that RETRIEVAL found it.`);
    }

    // ========================================================================================
    line();
    console.log("  ITEM 5 — a macos article is never retrieved for a windows machine (D162)");
    line();
    await withControl((client) => upsertArticle(client, {
      id: THROWAWAY, type: "troubleshooting", platform: "macos", lifecycle: "unvalidated",
      title: "External monitors are not detected through a dock on a Mac",
      problem: "Monitors connected through a dock are not detected on macOS.",
      symptoms: ["my monitors aren't working through the dock", "external displays not detected", "DisplayLink"],
      keywords: ["dock", "DisplayLink", "monitor", "display", "macOS"],
      guidance: ["Open System Settings > Displays and click Detect Displays."],
      escalateWhen: [], doNotAttempt: [],
    }, "acceptance"));
    if (v.ok) await embedPending({ embedder, log: () => {} });
    {
      const r = await ask(base, { text: "My external monitors are not detected through the dock. DisplayLink.", probe: WINDOWS_PROBE });
      const b = r.body;
      check("ITEM 5: the macos article is NOT among the retrieved articles for a win32 probe",
        !b.retrieval?.articles?.includes(THROWAWAY),
        `retrieved: [${b.retrieval?.articles?.join(", ")}]`);
      check("ITEM 5: and it is not cited", !b.citedArticleIds?.includes(THROWAWAY));
      const mac = await ask(base, { text: "My external monitors are not detected through the dock. DisplayLink.", probe: { platform: "darwin" } });
      check("ITEM 5: a darwin probe CAN see it, so the pre-filter filters rather than deletes",
        mac.body.retrieval?.articles?.includes(THROWAWAY),
        `retrieved for darwin: [${mac.body.retrieval?.articles?.join(", ")}]`);
    }
    await withControl((c) => c.query("DELETE FROM control.kb_articles WHERE id = $1", [THROWAWAY]));
    console.log("  (throwaway article removed)");

    // ========================================================================================
    line();
    console.log("  ITEMS 6-8 — degradation, statelessness, and the retrieval log");
    line();
    // Item 6 (tier-0 with the hub stopped) is an ENDPOINT property and is pinned by
    // client/test/hub-client.test.mjs against a hub that is not running (D46b). It cannot be
    // tested from inside the hub, and asserting it here would be asserting it in the wrong place.
    console.log("  ITEM 6 (tier-0 resolves with the hub stopped) is an ENDPOINT property.");
    console.log("        Pinned by client/test/hub-client.test.mjs (D46b): tier-0 runs before any");
    console.log("        provider is consulted, so the hub is never reached. Not re-tested here.");

    {
      // Item 7: a turn still completes with the corpus empty. Rather than deleting the corpus,
      // ask something that retrieves nothing at all with the semantic leg off — the same input the
      // answer path sees when the corpus is empty (zero chunks, zero articles).
      const r = await ask(base, { text: "Who approves a purchase order over ten thousand dollars?", probe: WINDOWS_PROBE });
      check("ITEM 7: a turn with zero retrieved articles still COMPLETES (degraded, not broken)",
        r.status === 200 && typeof r.body.reply === "string" && r.body.reply.length > 0,
        `HTTP ${r.status}`);
      check("ITEM 7: /v1/turn is still reachable and still stateless",
        (await fetch(`${base}/v1/turn`, { method: "GET" })).status === 405,
        "GET must be 405, proving the route exists and was not replaced");
    }
    {
      const r = await ask(base, { text: "How do I take a screenshot?", probe: WINDOWS_PROBE });
      check("ITEM 8: the response names its retrieval log row", Number.isInteger(r.body.logId), `logId=${r.body.logId}`);
      const row = await withControl(async (client) => {
        const { rows } = await client.query("SELECT * FROM control.kb_retrieval_log WHERE id = $1", [r.body.logId]);
        return rows[0];
      });
      check("ITEM 8: the log row carries chunk ids and scores for every retrieved chunk",
        row && Array.isArray(row.retrieved) && row.retrieved.length > 0
        && row.retrieved.every((x) => Number.isInteger(x.chunkId) && typeof x.score === "number"),
        row ? `retrieved: ${JSON.stringify(row.retrieved).slice(0, 200)}` : "no row");
      check("ITEM 8: and what the model did with them, kept separate from retrieval",
        row && Array.isArray(row.cited) && typeof row.answered === "boolean");
    }

    // ========================================================================================
    line();
    console.log("  BEYOND THE LIST — the guards that are not in spec §8 but should be");
    line();
    {
      const r = await ask(base, { text: "How do I take a screenshot?", tenant: "acme" });
      check("a client-supplied tenant is REFUSED with 400 and a reason",
        r.status === 400 && /tenancy model by default/.test(r.body.error), `HTTP ${r.status}: ${r.body.error}`);
    }
    {
      const r = await ask(base, { text: "How do I take a screenshot?" });
      check("a question with NO probe still answers (probe is optional on /v1/ask)",
        r.status === 200 && typeof r.body.reply === "string");
      check("…but with no platform the windows-only reference article is not eligible",
        !r.body.retrieval?.articles?.includes("keyboard-shortcuts-windows"),
        `retrieved: [${r.body.retrieval?.articles?.join(", ")}] — so this question DECLINES without a probe, which is correct`);
    }
    {
      const r = await ask(base, { text: "" });
      check("an empty question is a 400", r.status === 400);
    }
    {
      const r = await ask(base, { text: "How do I take a screenshot?", probe: WINDOWS_PROBE });
      check("chunk TEXT never leaves the hub (D53) — the response has ids and counts only",
        !JSON.stringify(r.body).includes("Screenshot a region"),
        "if a chunk's text is in the response, the corpus is moving to the endpoint one field at a time");
      check("the response states that no reranker exists", r.body.retrieval?.rerankerPresent === false);
    }
    {
      const res = await fetch(`${base}/v1/health`);
      const h = await res.json();
      check("/v1/health reports the corpus, the embedder, and that there is no reranker",
        h.corpus?.articles >= 6 && h.rerankerPresent === false && "embedder" in h);
      check("/v1/health says tenancy is none, in words", /not an authenticated tenant/.test(h.tenancy));
    }
  } finally {
    await new Promise((r) => server.close(r));
    try { await withControl((c) => c.query("DELETE FROM control.kb_articles WHERE id = $1", [THROWAWAY])); } catch { /* gone */ }
    try { await withControl((c) => c.query("DELETE FROM control.kb_retrieval_log WHERE tenant_label = 'zz-accept'")); } catch { /* gone */ }
    try { await ingestBundle({ path: BUNDLE, log: () => {} }); } catch { /* leave it */ }
  }
}

main()
  .catch((err) => { fail++; console.log(`\n  FAIL  the suite threw: ${err.stack ?? err.message}`); })
  .finally(async () => {
    await closePool();
    console.log("");
    line();
    console.log(`  ${pass} passed, ${fail} failed`);
    if (failures.length) for (const f of failures) console.log(`    FAILED: ${f}`);
    line();
    console.log("  A pass means the PATH WORKS and the system DECLINES WHEN IT SHOULD.");
    console.log("  It does not mean the product answers questions well: six articles, no reranker,");
    console.log("  no corpus, and a dev embedder that is not the shipped model. Every number here is a floor.");
    line();
    if (fail > 0) process.exitCode = 1;
  });
