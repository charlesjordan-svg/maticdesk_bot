#!/usr/bin/env node
// @ts-check
/**
 * PREFLIGHT for `npm run test:db` (2026-11-17): refuse to run the database suite against a database
 * that cannot pass it, and say why, instead of emitting twenty-one red assertions that read like a
 * regression.
 *
 *   node test/db-preflight.mjs        standalone: prints the facts, exits 0 when the suite may run
 *   node test/run-all.mjs --excluded  runs this first and stops here when it fails
 *
 * WHY. The 2026-11-17 handover before this one reported `db.test` and `admin-db` red - 21 failures
 * in job-claim and time-window assertions on a branch that does not touch them, against a
 * database that had been off for nine weeks. The next session ran the same suite on the same
 * code: 3/3 green. It was the environment: a long-dormant container wakes up with its migrations
 * behind or its rows stale, and the assertions that break on exactly that are the time-window and
 * job-claim ones. An hour was spent on a handover item that should have been one line of output.
 *
 * WHAT IT CHECKS, and nothing more:
 *   1. the database answers on the configured URL (MATIC_DB_URL, default the dev container);
 *   2. the control schema is migrated to head - every migration on disk is in the ledger, and the
 *      ledger's checksum of each matches the file (the runner's own rule: a changed file is an
 *      error, not a skip);
 *   3. every tenant schema the runner would reach is at head too;
 *   and it PRINTS, for the reader: the server's start time (how long it has been up) and the age
 *   of the newest row in the control tables that get one per event, so "nine weeks stale" is a
 *   fact on the screen and not a guess.
 *
 * It does not migrate, ingest or create anything. Fixing is `npm.cmd run migrate`; this says so.
 * Not a `.test.mjs`: the runner must not discover it as a suite file.
 */
import { pathToFileURL } from "node:url";
import { closePool, getPool, DEFAULT_DB_URL } from "../src/db/pool.js";
import { readMigrations, tenantSchemas } from "../src/db/migrate.js";

const out = (s = "") => process.stdout.write(s + "\n");

/**
 * @param {Array<{ version: string, checksum: string }>} onDisk
 * @param {Map<string, string>} ledger
 * @returns {{ behind: string[], changed: string[] }}
 */
export function compareLedger(onDisk, ledger) {
  const behind = [], changed = [];
  for (const m of onDisk) {
    const have = ledger.get(m.version);
    if (have === undefined) behind.push(m.version);
    else if (have !== m.checksum) changed.push(m.version);
  }
  return { behind, changed };
}

/** @returns {Promise<{ ok: boolean, lines: string[], fix: string|null }>} */
export async function preflight() {
  const lines = [];
  const url = process.env.MATIC_DB_URL ?? DEFAULT_DB_URL;
  lines.push(`database: ${url.replace(/\/\/[^@]*@/, "//<credentials>@")}`);

  // 1. reachable, and since when
  let pool;
  try {
    pool = getPool();
    const { rows } = await pool.query("SELECT now() AS now, pg_postmaster_start_time() AS started, version() AS version");
    const upMs = new Date(rows[0].now).getTime() - new Date(rows[0].started).getTime();
    lines.push(`server: ${String(rows[0].version).split(" on ")[0]}, up ${describe(upMs)} (started ${new Date(rows[0].started).toISOString()})`);
  } catch (err) {
    lines.push(`NOT REACHABLE: ${err?.message ?? err}`);
    return { ok: false, lines, fix: "npm.cmd run db:up   (from server/; is Docker Desktop running?)" };
  }

  // 2. control plane at head
  const problems = [];
  const control = readMigrations("control");
  let ledger = new Map();
  try {
    const { rows } = await pool.query("SELECT version, checksum FROM control.schema_migrations");
    ledger = new Map(rows.map((r) => [r.version, r.checksum]));
  } catch { /* no ledger at all: every migration is behind */ }
  const c = compareLedger(control, ledger);
  lines.push(`control: ${control.length} migration(s) on disk, ${ledger.size} applied${c.behind.length ? `, BEHIND by ${c.behind.join(", ")}` : ""}${c.changed.length ? `, CHANGED since applied: ${c.changed.join(", ")}` : ""}`);
  if (c.behind.length) problems.push(`the control schema is behind by ${c.behind.length} migration(s)`);
  if (c.changed.length) problems.push(`applied control migration(s) differ from the files on disk (${c.changed.join(", ")}) - the runner will refuse; write a new migration instead of editing an applied one`);

  // 3. every tenant schema at head
  if (!c.behind.length) {
    const tenant = readMigrations("tenant");
    let schemas = [];
    try { schemas = await tenantSchemas(); } catch (err) { lines.push(`tenants: could not list (${err?.message ?? err})`); }
    for (const schema of schemas) {
      let tl = new Map();
      try {
        const { rows } = await pool.query(`SELECT version, checksum FROM ${schema}.schema_migrations`);
        tl = new Map(rows.map((r) => [r.version, r.checksum]));
      } catch { /* no ledger: behind by all */ }
      const t = compareLedger(tenant, tl);
      lines.push(`tenant ${schema}: ${tl.size}/${tenant.length} applied${t.behind.length ? `, BEHIND by ${t.behind.join(", ")}` : ""}${t.changed.length ? `, CHANGED: ${t.changed.join(", ")}` : ""}`);
      if (t.behind.length) problems.push(`tenant schema ${schema} is behind by ${t.behind.length} migration(s)`);
      if (t.changed.length) problems.push(`tenant schema ${schema} has applied migration(s) that differ from disk (${t.changed.join(", ")})`);
    }
    if (!schemas.length) lines.push("tenants: none (a fresh database; the suite creates its own)");
  }

  // The age of the data, for the reader. Each table that gets a row per event, newest first.
  for (const [table, col] of [["control.devices", "created_at"], ["control.enrollment_secrets", "created_at"], ["control.audit_log", "created_at"], ["control.job_queue", "created_at"]]) {
    try {
      const { rows } = await pool.query(`SELECT max(${col}) AS newest, count(*)::int AS n FROM ${table}`);
      const newest = rows[0].newest ? new Date(rows[0].newest) : null;
      lines.push(`${table}: ${rows[0].n} row(s)${newest ? `, newest ${describe(Date.now() - newest.getTime())} ago (${newest.toISOString()})` : ""}`);
    } catch { /* a table this build does not have is not a finding */ }
  }

  return problems.length
    ? { ok: false, lines: [...lines, ...problems.map((p) => `PROBLEM: ${p}`)], fix: "npm.cmd run migrate   (from server/), then run test:db again" }
    : { ok: true, lines, fix: null };
}

function describe(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  const d = Math.round(h / 24);
  return d < 14 ? `${d} days` : `${Math.round(d / 7)} weeks`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const r = await preflight().finally(closePool);
  out("  db preflight");
  for (const l of r.lines) out(`    ${l}`);
  if (!r.ok) {
    out(`\n  the database suite was NOT run: ${r.fix}`);
    out("  (this is the environment, not a regression - the suite cannot pass against a database that is unreachable or behind)\n");
    process.exit(1);
  }
  out("    ok - the suite may run\n");
}
