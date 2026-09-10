// @ts-check
/**
 * Tenant creation. B1 (D143).
 *
 * Creating a tenant is three things that must all happen or none of them: the control-plane row,
 * the schema, and every tenant migration ever written applied to it.
 *
 * The row comes FIRST and in its own transaction, because `withTenant()` refuses a schema that is
 * not in `control.tenants` — the assertion is not bypassable, including by the code that is
 * creating the tenant. So the order is: insert the row, create the schema, then migrate.
 *
 * If migration fails halfway, the tenant is left present-but-behind rather than half-deleted, and
 * the next `migrate()` run finishes it. That is the safer failure: a tenant whose schema is at
 * version 1 of 2 is visible and fixable; a tenant whose row was rolled back while its schema
 * survived is an orphan schema nobody will find.
 */
import { getPool, withControl } from "./pool.js";
import { forgetTenants, rememberTenant } from "./tenant.js";
import { migrateTenant } from "./migrate.js";

/** `acme-corp` -> `t_acme_corp`. Deterministic, so the schema name is derivable from the slug. */
export function schemaNameFor(slug) {
  if (!/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) {
    throw new Error(`bad tenant slug ${JSON.stringify(slug)}: lowercase letters, digits and hyphens, 3-40 chars`);
  }
  return `t_${slug.replace(/-/g, "_")}`;
}

/**
 * Create a tenant: row, schema, and all tenant migrations. Exit criteria 1 and 4.
 *
 * @param {string} slug
 * @param {{ displayName?: string, log?: (msg: string) => void, root?: string }} [opts]
 * @returns {Promise<{ id: string, slug: string, schemaName: string, applied: string[] }>}
 */
export async function createTenant(slug, { displayName, log = () => {}, root } = {}) {
  const schemaName = schemaNameFor(slug);

  const row = await withControl(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO control.tenants (slug, schema_name, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO NOTHING
       RETURNING id, slug, schema_name`,
      [slug, schemaName, displayName ?? slug],
    );
    if (rows.length === 1) return rows[0];
    // Already there. Creating a tenant twice is not an error - it is what re-running a setup
    // script looks like - and the schema still needs its migrations checked.
    const { rows: existing } = await client.query(
      "SELECT id, slug, schema_name FROM control.tenants WHERE slug = $1",
      [slug],
    );
    return existing[0];
  });

  // Interpolated. `schemaNameFor` built this string from a slug it validated, and it is about to
  // be checked against control.tenants by every later access anyway.
  await getPool().query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
  rememberTenant(schemaName);

  const applied = await migrateTenant(schemaName, { log, root });
  return { id: row.id, slug: row.slug, schemaName: row.schema_name, applied };
}

/**
 * Remove a tenant entirely: schema and row. **Development and tests only.**
 *
 * Real offboarding is not this. D153/D154 and the retention story mean a real offboarding has to
 * decide what is exported, what is retained and for how long, and the tenant row is expected to
 * outlive the data (`status = 'offboarding'`). This function is the test fixture teardown, and it
 * is named to be hard to mistake for the product feature.
 *
 * @param {string} slug
 */
export async function dropTenantForTests(slug) {
  const schemaName = schemaNameFor(slug);
  await getPool().query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
  // B3: devices, enrollment_requests and enrollment_secrets FK to tenants(id) (migration
  // 001/004), so they go before the tenant row or the DELETE below fails with a foreign key
  // violation. Tolerant of a database that predates B3 (to_regclass guards every table, same
  // reasoning as the loop below) and of a tenant that was never used for enrollment (a subquery
  // matching nothing deletes nothing).
  for (const table of ["control.enrollment_requests", "control.devices", "control.enrollment_secrets"]) {
    const { rows } = await getPool().query("SELECT to_regclass($1) IS NOT NULL AS ok", [table]);
    if (!rows[0].ok) continue;
    await getPool().query(`DELETE FROM ${table} WHERE tenant_id = (SELECT id FROM control.tenants WHERE slug = $1)`, [slug]);
  }
  // Tolerant of a database that has never been migrated: a teardown that throws on a fresh
  // database makes the first run of the suite fail for a reason that has nothing to do with what
  // it is testing. (It did, on the first real run.) Job rows go first - they reference the tenant.
  for (const table of ["control.job_queue", "control.tenants"]) {
    const { rows } = await getPool().query("SELECT to_regclass($1) IS NOT NULL AS ok", [table]);
    if (!rows[0].ok) continue;
    const column = table === "control.job_queue" ? "tenant_schema" : "slug";
    const value = table === "control.job_queue" ? schemaName : slug;
    await getPool().query(`DELETE FROM ${table} WHERE ${column} = $1`, [value]);
  }
  forgetTenants();
}

/** @returns {Promise<Array<{ id: string, slug: string, schemaName: string, status: string }>>} */
export async function listTenants() {
  const { rows } = await getPool().query(
    "SELECT id, slug, schema_name, status FROM control.tenants ORDER BY slug",
  );
  return rows.map((r) => ({ id: r.id, slug: r.slug, schemaName: r.schema_name, status: r.status }));
}

/**
 * One tenant by its slug, or null. The lookup a device presents at enrollment: it is given a slug
 * and a secret at install time (D82 — not baked into the installer), never the tenant's uuid.
 *
 * @param {string} slug
 * @returns {Promise<{ id: string, slug: string, schemaName: string, status: string }|null>}
 */
export async function tenantBySlug(slug) {
  const { rows } = await getPool().query(
    "SELECT id, slug, schema_name, status FROM control.tenants WHERE slug = $1",
    [slug],
  );
  if (!rows.length) return null;
  const r = rows[0];
  return { id: r.id, slug: r.slug, schemaName: r.schema_name, status: r.status };
}
