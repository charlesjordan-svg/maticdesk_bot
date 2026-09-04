#!/usr/bin/env node
// @ts-check
/**
 * Run every test file, report every result, THEN exit non-zero.
 *
 *   node test/run-all.mjs               the default suite
 *   node test/run-all.mjs --excluded    only the files the default suite leaves out
 *
 * WHY THIS FILE EXISTS
 *
 * `npm test` was `node a.mjs && node b.mjs && ...` across nine files. `&&` short-circuits, so the
 * FIRST failure hides every later file. The register and the 2026-09-04 analysis both list this as
 * a trap already paid for: two environment failures once aborted eight other files, and the run
 * reported one problem when there were two and eight unknowns.
 *
 * **A red run should still tell you about the other files.** That is the whole rule.
 *
 * DISCOVERY, AND WHAT IT IMMEDIATELY FOUND
 *
 * Files are discovered rather than listed, so adding a test file cannot silently fail to be run.
 * That is not hypothetical: porting this file from `server/` on 2026-09-04 found **twelve** test
 * files where the hand-written chain ran **nine**. `cloud.test.mjs` and `privileged.test.mjs` had
 * fallen out of `npm test` with nothing recording that they had.
 *
 * Both turned out to belong out — one needs elevation, the other spends money — but "belongs out"
 * and "was forgotten" look identical in a hand-written chain, and only one of them is a decision.
 * So exclusions are now DECLARED WITH A REASON below, and the runner prints them on every run.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Files the DEFAULT suite leaves out, and why.
 *
 * A bare exclusion list would be no better than the `&&` chain it replaced — the reason is the part
 * that stops someone re-adding a file that costs money, or deleting one they assume is dead.
 *
 * Neither of these can go in the default run: a `npm test` that needs an Administrator window is a
 * `npm test` nobody runs, and one that bills an API key is worse.
 */
const EXCLUDED = {
  "privileged.test.mjs": {
    why: "runs the REAL agent -> broker -> Win32 path and needs ELEVATION (it fails with Win32 error 5 otherwise)",
    how: "npm.cmd run verify:privileged   (from an elevated window)",
  },
  "cloud.test.mjs": {
    why: "makes REAL Anthropic API calls and COSTS MONEY (it exits quietly when there is no key, which is not the same as passing)",
    how: "npm.cmd run test:cloud   (needs ANTHROPIC_API_KEY)",
  },
};

const onlyExcluded = process.argv.includes("--excluded");
const all = readdirSync(HERE).filter((f) => f.endsWith(".test.mjs")).sort();
const files = all.filter((f) => onlyExcluded === Object.hasOwn(EXCLUDED, f));

if (files.length === 0) {
  process.stdout.write(`no ${onlyExcluded ? "excluded " : ""}test files found in ${HERE}\n`);
  process.exit(1);
}

/** @type {{ file: string, code: number }[]} */
const results = [];
for (const f of files) {
  process.stdout.write(`\n${"=".repeat(94)}\n  ${f}\n${"=".repeat(94)}\n`);
  const r = spawnSync(process.execPath, [join(HERE, f)], { stdio: "inherit" });
  // A crash (a signal, or a non-zero that is not a test failure) counts as a failure rather than
  // being skipped: a file that could not run is not a file that passed.
  results.push({ file: f, code: r.status ?? 1 });
}

const failed = results.filter((r) => r.code !== 0);
process.stdout.write(`\n${"=".repeat(94)}\n  SUMMARY — ${results.length - failed.length}/${results.length} file(s) passed\n${"=".repeat(94)}\n`);
for (const r of results) process.stdout.write(`  ${r.code === 0 ? "ok  " : "FAIL"}  ${r.file}${r.code === 0 ? "" : `  (exit ${r.code})`}\n`);

// Printed on EVERY run, pass or fail. An exclusion nobody is reminded of becomes an exclusion
// nobody remembers deciding, which is how these two went missing in the first place.
if (!onlyExcluded) {
  const skipped = all.filter((f) => Object.hasOwn(EXCLUDED, f));
  if (skipped.length) {
    process.stdout.write(`\n  not run by \`npm test\`, on purpose:\n`);
    for (const f of skipped) {
      process.stdout.write(`    ${f}\n      ${EXCLUDED[f].why}\n      ${EXCLUDED[f].how}\n`);
    }
  }
}

if (failed.length) {
  process.stdout.write(`\n  ${failed.length} file(s) failed: ${failed.map((r) => r.file).join(", ")}\n`);
  process.stdout.write(`  Every file above was RUN. Nothing was skipped because something earlier failed.\n\n`);
}
process.exit(failed.length ? 1 : 0);
