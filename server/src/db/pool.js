// @ts-check
/**
 * The one connection pool. B1 (D143).
 *
 * WHY THERE IS EXACTLY ONE, AND WHY IT IS SMALL
 *
 * A `db.t4g.micro` has roughly 80 usable connections. That number is why per-tenant pollers were
 * rejected: N tenants times one long-lived connection each exhausts the instance before the
 * product has customers. Everything tenant-scoped therefore borrows from this single pool and
 * gives the connection back (src/db/tenant.js), and nothing holds one open across requests.
 *
 * THE POOLER PROBLEM, WHICH IS THE WHOLE REASON THIS FILE HAS RULES
 *
 * With a pooler in front of Postgres, a connection is handed from one caller to the next. Setting
 * `search_path` on checkout is therefore unsafe: the next caller can inherit a stale path and read
 * another tenant's tables while believing it is reading its own. That is not a theoretical failure
 * mode — it is the exact shape of a cross-tenant leak.
 *
 * The B1 handover said: either schema-qualify every query, or set `search_path` inside the
 * transaction. Pick one and enforce it; mixing them is how leaks happen.
 *
 * **THE CHOICE IS: `SET LOCAL search_path` INSIDE AN EXPLICIT TRANSACTION.** `SET LOCAL` is scoped
 * to the transaction and reverts on COMMIT or ROLLBACK, so a returned connection carries no path.
 * It was chosen over schema-qualifying because the migration path depends on it: the same tenant
 * migration file has to run unchanged against every tenant schema, which is impossible if every
 * statement names its schema.
 *
 * The enforcement is that `getTenantClient()` does not exist. The only way to reach a tenant's
 * tables is `withTenant()`, which owns the transaction. See src/db/tenant.js.
 *
 * Configuration (environment; there is no config file yet, matching src/index.js):
 *   MATIC_DB_URL   default postgres://matic:matic@127.0.0.1:5433/matic  (docker-compose.yml)
 *   MATIC_DB_MAX   default 10
 */
import pg from "pg";

export const DEFAULT_DB_URL = "postgres://matic:matic@127.0.0.1:5433/matic";

/** @type {pg.Pool | null} */
let pool = null;

/**
 * The process's pool. Created on first use.
 *
 * @param {{ url?: string, max?: number }} [opts]
 * @returns {pg.Pool}
 */
export function getPool(opts = {}) {
  if (pool) return pool;
  const url = opts.url ?? process.env.MATIC_DB_URL ?? DEFAULT_DB_URL;
  const max = opts.max ?? Number(process.env.MATIC_DB_MAX ?? 10);
  pool = new pg.Pool({
    connectionString: url,
    max,
    // A hung checkout should fail fast and loudly rather than stack up behind the 80-connection
    // ceiling. Both numbers are development figures; neither is measured.
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    // Deliberately NOT setting `options: '-c search_path=...'`. That is the pooler-unsafe form
    // this module exists to avoid; see the header.
  });
  return pool;
}

/** Close the pool. Tests and CLI entry points call this; the server would not. */
export async function closePool() {
  if (!pool) return;
  const p = pool;
  pool = null;
  await p.end();
}

/**
 * Run `fn` against the CONTROL PLANE inside a transaction.
 *
 * `control` is schema-qualified in SQL rather than reached through `search_path`, because control
 * queries are written by hand in this repo and qualification costs nothing there. The search_path
 * is pinned to `extensions` only, so an unqualified table name in a control query is an error
 * rather than an accidental read of whatever is on the path.
 *
 * @template T
 * @param {(client: pg.PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withControl(fn) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL search_path = extensions");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* the connection is already gone */ }
    throw err;
  } finally {
    client.release();
  }
}
