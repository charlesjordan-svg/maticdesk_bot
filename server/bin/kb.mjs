#!/usr/bin/env node
// @ts-check
/**
 * B7a knowledge-base CLI.
 *
 *   node bin/kb.mjs ingest [path]     read a bundle, write articles + chunks, then embed
 *   node bin/kb.mjs embed             embed every chunk that has no vector from the current model
 *   node bin/kb.mjs reembed           re-embed EVERYTHING (after an embedder change)
 *   node bin/kb.mjs status            what is loaded, and which model embedded it
 *   node bin/kb.mjs retrieve <query>  BOTH LEGS SEPARATELY, then the fusion. No model call.
 *   node bin/kb.mjs legs <query>      the two legs only, side by side
 *
 * `retrieve` and `legs` exist because of a specific instruction in the B7a spec (§9 item 4): test
 * each leg alone before fusing, because a broken leg inside an RRF fusion is very hard to see. A
 * fusion of one working leg and one dead leg returns plausible results in a plausible order.
 *
 * Default bundle: ../docs/kb/generic-kb-v2.json (six articles, D45 generic KB).
 *
 * Connects to MATIC_DB_URL, default the docker-compose.yml database. As with bin/db.mjs there is no
 * production entry point: ingesting a corpus into a real control plane is a release step.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool } from "../src/db/pool.js";
import { corpusStatus, embedPending, ingestBundle } from "../src/kb/ingest.js";
import { embeddingProviderFromEnv } from "../src/kb/embed.js";
import { fuseRRF, lexicalLeg, semanticLeg, retrieve, RRF_K, DEFAULT_TOP_K, RELEVANCE_FLOOR } from "../src/kb/retrieve.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BUNDLE = join(HERE, "..", "..", "docs", "kb", "generic-kb-v2.json");
const log = (m) => process.stdout.write(m + "\n");

/** Report the embedder honestly before anything uses it. */
async function embedderOrNull() {
  const e = embeddingProviderFromEnv();
  const v = await e.verify();
  if (v.ok) {
    log(`  embedder ${e.name} -> ${e.model}, ${v.dimensions} dimensions (L2 norm ${v.l2?.toFixed(6)})`);
    log(`  NOTE: this is arctic-embed-L-v2.0, NOT D199's arctic-embed-M-v2.0. See src/kb/embed.js.`);
    return e;
  }
  log(`  embedder UNAVAILABLE (${e.name}): ${v.error ?? `${v.dimensions} dimensions`}`);
  log(`  the semantic leg will not run; the lexical leg still does`);
  return null;
}

function printLeg(name, rows) {
  log(`\n  --- ${name} leg: ${rows.length} candidate(s) ---`);
  if (rows.length === 0) log("    (nothing)");
  for (const r of rows.slice(0, 10)) {
    log(`    ${String(r.rank).padStart(2)}. ${r.legScore.toFixed(5)}  ${r.articleId} [${r.kind}]  ${r.text.replace(/\s+/g, " ").slice(0, 70)}`);
  }
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  switch (cmd) {
    case "ingest": {
      const path = args[0] ? resolve(args[0]) : DEFAULT_BUNDLE;
      await ingestBundle({ path, log: (m) => log(m) });
      const e = await embedderOrNull();
      if (e) {
        const r = await embedPending({ embedder: e, log: (m) => log(m) });
        log(`  embedded ${r.embedded} chunk(s) with ${r.model}`);
      } else {
        log(`  SKIPPED embedding. The corpus is loaded and retrievable through the lexical leg only.`);
        log(`  Run \`node bin/kb.mjs embed\` once the embedder is up.`);
      }
      const s = await corpusStatus();
      log(`  corpus: ${s.articles} articles, ${s.chunks} chunks, ${s.embedded} embedded`);
      break;
    }

    case "embed":
    case "reembed": {
      const e = await embedderOrNull();
      if (!e) throw new Error("no embedder is available, so there is nothing to embed with");
      const r = await embedPending({ embedder: e, log: (m) => log(m), reembed: cmd === "reembed" });
      log(`  embedded ${r.embedded} chunk(s) in ${r.batches} batch(es) with ${r.model}`);
      break;
    }

    case "status": {
      const s = await corpusStatus();
      log(`  articles  ${s.articles}`);
      log(`  chunks    ${s.chunks}  (${s.embedded} embedded)`);
      if (s.models.length === 0) log(`  models    none - nothing is embedded, the semantic leg returns nothing`);
      for (const m of s.models) log(`  model     ${m.model.padEnd(34)} ${m.n} chunk(s)`);
      if (s.models.length > 1) {
        log("");
        log(`  !! MORE THAN ONE EMBEDDING MODEL IS PRESENT. Vectors from different models are in`);
        log(`  !! different spaces, so retrieval is confidently wrong for part of the corpus.`);
        log(`  !! Fix with: node bin/kb.mjs reembed`);
      }
      if (s.chunks > s.embedded) log(`  ${s.chunks - s.embedded} chunk(s) have no vector: node bin/kb.mjs embed`);
      break;
    }

    case "legs":
    case "retrieve": {
      const query = args.join(" ").trim();
      if (!query) throw new Error(`usage: ${cmd} <query>`);
      // --platform is a flag rather than a probe here: this command exists to test retrieval, and
      // the pre-filter (D162) is part of what needs testing.
      let platform = null;
      const pi = args.indexOf("--platform");
      const q = pi >= 0 ? args.slice(0, pi).join(" ").trim() : query;
      if (pi >= 0) platform = args[pi + 1] ?? null;

      log(`  query    "${q}"`);
      log(`  platform ${platform ?? "(none - 'any' articles only)"}`);
      const e = await embedderOrNull();

      const lex = await lexicalLeg({ query: q, platform });
      printLeg("LEXICAL", lex);
      let sem = [];
      if (e) {
        try {
          sem = await semanticLeg({ vector: await e.embedQuery(q), platform });
          printLeg("SEMANTIC", sem);
        } catch (err) {
          log(`\n  --- SEMANTIC leg FAILED: ${err.message} ---`);
        }
      } else {
        log(`\n  --- SEMANTIC leg SKIPPED (no embedder) ---`);
      }

      if (cmd === "legs") break;

      const fused = fuseRRF({ lexical: lex, semantic: sem, topK: DEFAULT_TOP_K });
      log(`\n  --- FUSED (RRF k=${RRF_K}, top ${DEFAULT_TOP_K}, kind weights applied) ---`);
      if (fused.length === 0) log("    (nothing)");
      for (const [i, r] of fused.entries()) {
        log(`    ${i + 1}. ${r.score.toFixed(6)}  ${r.articleId} [${r.kind}] w=${r.weight}`
          + `  lex#${r.lexRank ?? "-"} sem#${r.semRank ?? "-"}`);
      }
      log(`\n  relevance floor: ${RELEVANCE_FLOOR === null ? "UNSET (deliberately - see src/kb/retrieve.js)" : RELEVANCE_FLOOR}`);
      log(`  reranker:        ABSENT. Any quality judgement from this output is a FLOOR, not a measurement.`);

      // Same call the route makes, so the CLI and the route cannot disagree about what retrieval is.
      const full = await retrieve({ query: q, platform, embedder: e, log: (m) => log("  " + m) });
      log(`\n  route would supply ${full.articles.length} article(s): ${full.articles.map((a) => a.id).join(", ") || "(none)"}`);
      break;
    }

    default:
      log(`usage:
  node bin/kb.mjs ingest [path]     read a bundle, write articles + chunks, then embed
  node bin/kb.mjs embed             embed chunks with no vector from the current model
  node bin/kb.mjs reembed           re-embed everything (after an embedder change)
  node bin/kb.mjs status            what is loaded, and which model embedded it
  node bin/kb.mjs legs <query>      the two retrieval legs, side by side, unfused
  node bin/kb.mjs retrieve <query>  both legs, then the fusion  [--platform windows]`);
      process.exitCode = cmd ? 1 : 0;
  }
}

main()
  .catch((err) => { process.stderr.write(`\n  ${err.message}\n\n`); process.exitCode = 1; })
  .finally(() => closePool());
