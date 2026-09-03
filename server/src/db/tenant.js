// @ts-check
/**
 * Tenant-scoped database access. THE SECURITY-RELEVANT FILE IN B1.
 *
 * D143's rule is that the worker asserts the tenant schema from the job row before every query.
 * The B1 handover says that assertion "belongs in one place that every worker path goes through,
 * not repeated at call sites." This is that one place.
 *
 * TWO THINGS HAPPEN HERE AND NEITHER IS OPTIONAL
 *
 * 1. **The schema name is checked against `control.tenants` on every entry.** Not a regex check —
 *    a database lookup. This matters more than it looks: `SET` cannot take a bind parameter, so
 *    the schema name is interpolated into SQL. The allow-list is therefore the injection defence,
 *    and a regex alone would let `t_anything` through to `SET LOCAL search_path`. The shape check
 *    runs too, first, because it is free and it rejects the obvious before touching the database.
 *
 * 2. **`search_path` is set with `SET LOCAL`, inside a transaction this function owns.** See
 *    src/db/pool.js for why: on a pooled connection, a path set at checkout can be inherited by
 *    the next caller. `SET LOCAL` reverts at COMMIT or ROLLBACK, so a returned connection carries
 *    nothing.
 *
 * WHAT IS DELIBERATELY ABSENT
 *
 * There is no `getTenantClient()`, no `setTenant()`, and no way to obtain a connection already
 * pointed at a tenant. If such a function existed, someone would call it and hold the client, and
 * the property this file provides would be gone. The only door is `withTenant`, and it closes
 * behind you.
 *
 * The tenant's `search_path` is `<schema>, extensions` and nothing else. `public` is NOT on it:
 * an unqualified name that is not a tenant table should fail rather than silently resolve
 * somewhere shared. `extensions` is there so tenant DDL can say `vector(768)` without qualifying
 * the type — the extension is installed once, database-wide (migrations/control/001).
 */
import { getPool } from "./pool.js";

/**
 * The shape a tenant schema name is allowed to have, matching the CHECK constraint on
 * `control.tenants.schema_name`. Cheap pre-filter; the authoritative check is the lookup below.
 */
const SCHEMA_SHAPE = /^t_[a-z0-9_]{1,54}$/;

/** Schema names confirmed present in control.tenants. Cleared by `forgetTenants()`. */
const known = new Set();

/**
 * Assert that `schemaName` names a real tenant. Throws otherwise.
 *
 * Cached after the first successful lookup, because this runs before every tenant query and a
 * round trip per query would make the safe path the slow path — which is how safe paths get
 * removed. Tenant rows are created rarely and never renamed (`schema_name` is UNIQUE and there is
 * no rename path), so the cache cannot go stale in the dangerous direction: it can only fail to
 * know about a NEW tenant, and `createTenant()` warms it.
 *
 * @param {string} schemaName
 * @returns {Promise<string>} the same name, once it is proven
 */
export async function assertTenantSchema(schemaName) {
  if (typeof schemaName !== "string" || !SCHEMA_SHAPE.test(schemaName)) {
    throw new Error(`refusing tenant schema ${JSON.stringify(schemaName)}: not a tenant schema name`);
  }
  if (known.has(schemaName)) return schemaName;

  // Not withControl(): this is called from inside other transactions, and nesting BEGIN would
  // either be a no-op with a warning or a savepoint we do not want. A bare pooled query is right.
  const { rows } = await getPool().query(
    "SELECT 1 FROM control.tenants WHERE schema_name = $1 AND status <> 'offboarding'",
    [schemaName],
  );
  if (rows.length !== 1) {
    throw new Error(`refusing tenant schema ${JSON.stringify(schemaName)}: no such active tenant`);
  }
  known.add(schemaName);
  return schemaName;
}

/** Drop the assertion cache. For tests, and for a process that has just created a tenant. */
export function forgetTenants() {
  known.clear();
}

/** Remember a schema as valid without a lookup. Only `createTenant()` should call this. */
export function rememberTenant(schemaName) {
  if (SCHEMA_SHAPE.test(schemaName)) known.add(schemaName);
}

/**
 * Run `fn` inside a transaction whose `search_path` is `schemaName, extensions`.
 *
 * This is the only way to reach a tenant's tables. The assertion runs first; if it throws,
 * no connection is taken and nothing is set.
 *
 * @template T
 * @param {string} schemaName
 * @param {(client: import("pg").PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTenant(schemaName, fn) {
  const schema = await assertTenantSchema(schemaName);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // Interpolated, because SET takes no parameters. Safe only because of the assertion above
    // AND the shape check inside it. Do not relax either one.
    await client.query(`SET LOCAL search_path = ${schema}, extensions`);
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* the connection is already gone */ }
    throw err;
  } finally {
    // Released with no path set, because SET LOCAL died with the transaction.
    client.release();
  }
}
