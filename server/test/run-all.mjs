#!/usr/bin/env node
// @ts-check
/**
 * Run every test file, report every result, THEN exit non-zero. B7a (2026-09-04).
 *
 * WHY THIS FILE EXISTS
 *
 * `npm test` was `node a.mjs && node b.mjs && node c.mjs`. `&&` short-circuits, so the FIRST
 * failure hides every later file. The register and the 2026-09-04 analysis both list this as a
 * trap the project has already paid for: two environment failures aborted eight other files, and
 * the run reported one problem when there were two and eight unknowns.
 *
 * **A red run should still tell you about the other files.** That is the whole rule, and it only
 * needs this much code.
 *
 *   node test/run-all.mjs               every *.test.mjs in test/
 *   node test/run-all.mjs --db          include the files that need a database
 *
 * Files are discovered rather than listed, so adding a test file cannot silently fail to be run —
 * which is the same class of mistake as the `&&`.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Files that need PostgreSQL running (`npm run db:up`). Kept as an explicit list rather than a
 * naming convention, because a file that silently needs a database is worse than one that is named
 * inconsistently: it fails on a laptop with no Docker and looks like a real defect.
 */
const NEEDS_DB = new Set(["db.test.mjs", "kb.test.mjs"]);

const withDb = process.argv.includes("--db");
const files = readdirSync(HERE)
  .filter((f) => f.endsWith(".test.mjs"))
  .filter((f) => withDb === NEEDS_DB.has(f))
  .sort();

if (files.length === 0) {
  process.stdout.write(`no ${withDb ? "database " : ""}test files found in ${HERE}\n`);
  process.exit(1);
}

/** @type {{ file: string, code: number }[]} */
const results = [];
for (const f of files) {
  process.stdout.write(`\n${"=".repeat(94)}\n  ${f}\n${"=".repeat(94)}\n`);
  const r = spawnSync(process.execPath, [join(HERE, f)], { stdio: "inherit" });
  // A crash (signal, or a non-zero that is not a test failure) counts as a failure rather than
  // being skipped: a file that could not run is not a file that passed.
  results.push({ file: f, code: r.status ?? 1 });
}

const failed = results.filter((r) => r.code !== 0);
process.stdout.write(`\n${"=".repeat(94)}\n  SUMMARY — ${results.length - failed.length}/${results.length} file(s) passed\n${"=".repeat(94)}\n`);
for (const r of results) process.stdout.write(`  ${r.code === 0 ? "ok  " : "FAIL"}  ${r.file}${r.code === 0 ? "" : `  (exit ${r.code})`}\n`);
if (failed.length) {
  process.stdout.write(`\n  ${failed.length} file(s) failed: ${failed.map((r) => r.file).join(", ")}\n`);
  process.stdout.write(`  Every file above was RUN. Nothing was skipped because something earlier failed.\n\n`);
}
process.exit(failed.length ? 1 : 0);
