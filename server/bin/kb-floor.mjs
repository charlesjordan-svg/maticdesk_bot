#!/usr/bin/env node
// @ts-check
/**
 * Measure whether a relevance floor is possible. B7a (2026-09-04).
 *
 *   node bin/kb-floor.mjs
 *
 * WHY THIS IS A SCRIPT AND NOT A NUMBER IN retrieve.js
 *
 * `RELEVANCE_FLOOR` is deliberately `null` (src/kb/retrieve.js). The B7a spec asked for it to be
 * set by measurement and recorded as unset until then, because **a too-low floor silently disables
 * the decline that is B7a's primary acceptance test, a too-high floor silently disables retrieval,
 * and both failures look like the system working.**
 *
 * The question a floor answers is not "what number" but **"do the covered and uncovered questions
 * produce separable top scores at all?"** If they overlap, no threshold exists and a floor is the
 * wrong mechanism — and knowing that is worth more than a number.
 *
 * This runs both sets through the real `retrieve()` and prints the two distributions plus the gap.
 * It calls no model: this is about retrieval scores, not about answers.
 *
 * Needs: `npm.cmd run db:up`, `npm.cmd run migrate`, `npm.cmd run kb:ingest`, and Ollama for the
 * semantic leg. **Run it with the semantic leg on** — with the lexical leg alone an uncovered
 * question returns zero chunks and the question is trivial.
 */
import { closePool } from "../src/db/pool.js";
import { embeddingProviderFromEnv } from "../src/kb/embed.js";
import { retrieve } from "../src/kb/retrieve.js";

const log = (m) => process.stdout.write(m + "\n");

/** Questions the six articles DO cover. Same ones the acceptance suite asserts on. */
const COVERED = [
  ["how do I take a screenshot", "windows"],
  ["my mouse keeps cutting out", "windows"],
  ["my external monitors are not detected through the dock", "windows"],
  ["DisplayLink", "windows"],
  ["my files are not syncing to OneDrive", "windows"],
  ["everyone sounds choppy on video calls", "windows"],
  ["everything is really slow at home", "windows"],
  ["what is the shortcut to open task manager", "windows"],
  ["my bluetooth keyboard keeps disconnecting", "windows"],
  ["wifi keeps cutting out when I work from home", "windows"],
];

/** Questions they do NOT cover. Deliberately IT-adjacent, not absurd. */
const UNCOVERED = [
  ["how do I request a payroll adjustment", "windows"],
  ["what is our policy on expensing a taxi", "windows"],
  ["how do I set up a new SQL Server availability group", "windows"],
  ["who approves a purchase order over ten thousand dollars", "windows"],
  ["how do I reset the badge reader on the lobby door", "windows"],
  ["how do I connect to the company VPN", "windows"],
  ["which docking station should I order for a new laptop", "windows"],
  ["how do I share a folder with someone outside the company", "windows"],
  ["can I get a second monitor approved for my home office", "windows"],
  ["how do I request a new laptop", "windows"],
];

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return { min: s[0], p25: s[Math.floor(s.length * 0.25)], median: s[Math.floor(s.length / 2)], p75: s[Math.floor(s.length * 0.75)], max: s[s.length - 1] };
};
const f = (x) => x.toFixed(6);

async function run(cases, embedder) {
  const out = [];
  for (const [q, platform] of cases) {
    const r = await retrieve({ query: q, platform, embedder });
    out.push({ q, top: r.topScore, chunks: r.chunks.length, articles: r.articles.map((a) => a.id) });
  }
  return out;
}

async function main() {
  const embedder = embeddingProviderFromEnv();
  const v = await embedder.verify();
  if (!v.ok) {
    log(`\n  THE SEMANTIC LEG IS UNAVAILABLE (${v.error}).`);
    log(`  With the lexical leg alone an uncovered question returns ZERO chunks, so the`);
    log(`  separation question is trivially "yes" and tells you nothing about the real system.`);
    log(`  Start Ollama and pull ${embedder.model}, then re-run.\n`);
    process.exitCode = 1;
    return;
  }
  log(`  embedder ${embedder.model}, ${v.dimensions} dims (NOT D199's model — see src/kb/embed.js)`);
  log(`  reranker ABSENT — a reranker is exactly the component that would change these numbers\n`);

  const cov = await run(COVERED, embedder);
  const unc = await run(UNCOVERED, embedder);

  log("  COVERED questions — the six articles DO answer these");
  log("  " + "-".repeat(90));
  for (const r of cov) log(`    ${f(r.top)}  ${r.chunks} chunk(s)  ${r.q.slice(0, 46).padEnd(48)} ${r.articles[0] ?? ""}`);
  log("\n  UNCOVERED questions — they do NOT");
  log("  " + "-".repeat(90));
  for (const r of unc) log(`    ${f(r.top)}  ${r.chunks} chunk(s)  ${r.q.slice(0, 46).padEnd(48)} ${r.articles[0] ?? ""}`);

  const cs = stats(cov.map((r) => r.top));
  const us = stats(unc.map((r) => r.top));
  log("\n  DISTRIBUTIONS");
  log("  " + "-".repeat(90));
  log(`    covered     min ${f(cs.min)}  p25 ${f(cs.p25)}  median ${f(cs.median)}  p75 ${f(cs.p75)}  max ${f(cs.max)}`);
  log(`    uncovered   min ${f(us.min)}  p25 ${f(us.p25)}  median ${f(us.median)}  p75 ${f(us.p75)}  max ${f(us.max)}`);

  const overlap = us.max >= cs.min;
  const misclassified = cov.filter((r) => r.top <= us.max).length;
  log("\n  VERDICT");
  log("  " + "=".repeat(90));
  if (!overlap) {
    const lo = us.max, hi = cs.min;
    log(`    THE DISTRIBUTIONS SEPARATE. Every covered question scores above every uncovered one.`);
    log(`    Any floor in (${f(lo)}, ${f(hi)}) separates this sample cleanly; the midpoint is ${f((lo + hi) / 2)}.`);
    log(`    BUT: 20 questions, 6 articles, no reranker, and the questions are MINE — so this is`);
    log(`    a sample I chose, not a measurement of the product. A floor set from it would be`);
    log(`    fitted to 20 sentences. Treat it as evidence a floor is POSSIBLE, not as the value.`);
  } else {
    log(`    THE DISTRIBUTIONS OVERLAP. ${misclassified}/${cov.length} covered question(s) score at or below the`);
    log(`    highest-scoring uncovered one (${f(us.max)}), so NO single threshold separates them.`);
    log(`    A RELEVANCE FLOOR IS THE WRONG MECHANISM at this corpus size, and this is the`);
    log(`    result worth having: it says leave RELEVANCE_FLOOR null and let the prompt carry`);
    log(`    the decline, rather than reaching for a number that cannot exist.`);
    log(`    Note WHY: RRF scores depend on RANK, not on similarity. A dense leg always returns`);
    log(`    its nearest neighbours, so the top-ranked chunk for an uncovered question gets`);
    log(`    almost the same 1/(k+1) contribution as for a covered one. THE SCORE BARELY`);
    log(`    ENCODES RELEVANCE — which is a property of RRF, not of this corpus, and it is a`);
    log(`    reason to be sceptical of ANY floor over fused RRF scores.`);
  }
  log("  " + "=".repeat(90));
}

main()
  .catch((err) => { process.stderr.write(`\n  ${err.stack ?? err.message}\n\n`); process.exitCode = 1; })
  .finally(() => closePool());
