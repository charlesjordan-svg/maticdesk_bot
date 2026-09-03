// @ts-check
/**
 * The migration runner. B1 (D143).
 *
 * ONE RUN MOVES EVERYTHING. `migrate()` applies pending control-plane migrations and then applies
 * pending tenant migrations to every schema in `control.tenants`. That is exit criterion 3, and it
 * is also the only arrangement in which criterion 4 — a new tenant receives every migration ever
 * written, automatically — is true without anyone remembering anything.
 *
 * TWO LEDGERS, ON PURPOSE
 *
 *   control.schema_migrations   — one row per applied control migration
 *   <tenant>.schema_migrations  — one row per applied tenant migration, INSIDE each tenant schema
 *
 * Per-tenant ledgers rather than one central table with a schema column: a tenant schema then
 * carries its own version, so it can be dumped, restored or moved and still know what it is. The
 * central alternative makes the version a fact about the control plane rather than about the data,
 * and they can disagree.
 *
 * IDEMPOTENT TWICE OVER. The runner skips versions already in the ledger, and every migration file
 * is written to be individually re-runnable (`IF NOT EXISTS`). The second belt matters because the
 * state you are actually in when something fails is half-applied.
 *
 * A CHANGED FILE IS AN ERROR, NOT A SKIP. The ledger stores a checksum. Editing an applied
 * migration is the mistake that makes two environments diverge silently, so the runner refuses
 * instead of shrugging. Write a new migration.
 *
 * Migrations run one per transaction, not all in one. A DDL failure then leaves the ledger and the
 * schema agreeing with each other about what happened.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool, withControl } from "./pool.js";
import { withTenant } from "./tenant.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(HERE, "..", "..", "migrations");

/** @typedef {{ version: string, path: string, sql: string, checksum: string }} Migration */

/**
 * Read one migration directory, sorted by filename. Filenames are `NNN-name.sql` and the numeric
 * prefix is the ordering; the version is the filename without `.sql`.
 *
 * @param {"control" | "tenant"} kind
 * @param {string} [root]
 * @returns {Migration[]}
 */
export function readMigrations(kind, root = MIGRATIONS_DIR) {
  const dir = join(root, kind);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => {
      const sql = readFileSync(join(dir, f), "utf8");
      return {
        version: f.replace(/\.sql$/, ""),
        path: join(dir, f),
        sql,
        // Line endings are normalised before hashing. `.gitattributes` stores LF and the working
        // tree shows CRLF, so hashing the raw bytes would make every checksum machine-dependent.
        checksum: createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex").slice(0, 16),
      };
    });
}

/** Create the control schema and its ledger. Safe to run always; the first migration needs it. */
async function bootstrap() {
  await getPool().query("CREATE SCHEMA IF NOT EXISTS control");
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS control.schema_migrations (
      version    text        PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      checksum   text        NOT NULL
    )`);
}

/**
 * Compare a set of pending migrations against a ledger.
 *
 * @param {Migration[]} all
 * @param {Map<string, string>} applied  version -> checksum
 * @returns {Migration[]} the ones still to run, in order
 */
function pending(all, applied) {
  const out = [];
  for (const m of all) {
    const was = applied.get(m.version);
    if (was === undefined) { out.push(m); continue; }
    if (was !== m.checksum) {
      throw new Error(
        `migration ${m.version} was applied with checksum ${was} but the file now hashes to ${m.checksum}. `
        + `An applied migration must not be edited - write a new one. (${m.path})`,
      );
    }
  }
  return out;
}

/**
 * Apply pending control-plane migrations.
 *
 * @param {{ log?: (msg: string) => void, root?: string }} [opts]
 * @returns {Promise<string[]>} versions applied by this call
 */
export async function migrateControl({ log = () => {}, root = MIGRATIONS_DIR } = {}) {
  await bootstrap();
  const all = readMigrations("control", root);
  const { rows } = await getPool().query("SELECT version, checksum FROM control.schema_migrations");
  const todo = pending(all, new Map(rows.map((r) => [r.version, r.checksum])));

  const done = [];
  for (const m of todo) {
    await withControl(async (client) => {
      await client.query(m.sql);
      await client.query(
        "INSERT INTO control.schema_migrations (version, checksum) VALUES ($1, $2)",
        [m.version, m.checksum],
      );
    });
    log(`  control  ${m.version}`);
    done.push(m.version);
  }
  return done;
}

/**
 * Apply pending tenant migrations to one schema.
 *
 * Runs inside `withTenant`, so the schema name is asserted against `control.tenants` first and
 * `search_path` is set for the transaction. The migration files are therefore unqualified and the
 * same text runs against every tenant.
 *
 * @param {string} schemaName
 * @param {{ log?: (msg: string) => void, root?: string }} [opts]
 * @returns {Promise<string[]>} versions applied by this call
 */
export async function migrateTenant(schemaName, { log = () => {}, root = MIGRATIONS_DIR } = {}) {
  const all = readMigrations("tenant", root);
  const done = [];

  for (const m of all) {
    // One transaction per migration, and the ledger read is inside it: two runners racing on the
    // same schema then serialise on the ledger row instead of both applying the same DDL.
    const applied = await withTenant(schemaName, async (client) => {
      // The ledger is itself created by tenant/001, so it may not exist yet.
      const { rows: exists } = await client.query("SELECT to_regclass('schema_migrations') IS NOT NULL AS ok");
      /** @type {Map<string, string>} */
      let ledger = new Map();
      if (exists[0]?.ok) {
        const { rows } = await client.query("SELECT version, checksum FROM schema_migrations");
        ledger = new Map(rows.map((r) => [r.version, r.checksum]));
      }
      if (pending([m], ledger).length === 0) return false;

      await client.query(m.sql);
      await client.query(
        "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
        [m.version, m.checksum],
      );
      return true;
    });
    if (applied) {
      log(`  ${schemaName}  ${m.version}`);
      done.push(m.version);
    }
  }
  return done;
}

/**
 * Every schema a tenant migration should reach.
 *
 * `offboarding` tenants are excluded: their rows outlive their data on purpose (tenant offboarding
 * is on OPEN-6's missing list), and running new DDL against a schema being torn down is pointless
 * at best. `suspended` tenants ARE included — a suspended tenant is expected back, and letting its
 * schema fall behind turns reinstatement into a migration project.
 *
 * @returns {Promise<string[]>}
 */
export async function tenantSchemas() {
  const { rows } = await getPool().query(
    "SELECT schema_name FROM control.tenants WHERE status <> 'offboarding' ORDER BY schema_name",
  );
  return rows.map((r) => r.schema_name);
}

/**
 * One run: control plane, then every tenant schema. Exit criterion 3.
 *
 * @param {{ log?: (msg: string) => void, root?: string }} [opts]
 * @returns {Promise<{ control: string[], tenants: Record<string, string[]> }>}
 */
export async function migrate({ log = () => {}, root = MIGRATIONS_DIR } = {}) {
  const control = await migrateControl({ log, root });
  /** @type {Record<string, string[]>} */
  const tenants = {};
  for (const schema of await tenantSchemas()) {
    tenants[schema] = await migrateTenant(schema, { log, root });
  }
  const n = control.length + Object.values(tenants).reduce((a, b) => a + b.length, 0);
  log(n === 0 ? "  nothing to apply" : `  applied ${n}`);
  return { control, tenants };
}
