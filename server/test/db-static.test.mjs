/**
 * B1's design rules, checked WITHOUT a database.
 *
 * Run: node test/db-static.test.mjs        (from server/; part of `npm test`)
 *
 * These are the properties that make tenant isolation hold, and every one of them is a property of
 * the SOURCE rather than of a running system. They belong in the dependency-free suite so they are
 * enforced on every run, not only when someone has Postgres up — which is the difference between a
 * rule and a hope.
 *
 * The live behaviour is test/db.test.mjs (`npm run test:db`), which needs the database.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readMigrations } from "../src/db/migrate.js";
import { schemaNameFor } from "../src/db/tenants.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, "..");
const read = (p) => readFileSync(join(SERVER, p), "utf8");

let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}
function throws(label, fn, pattern) {
  try { fn(); fail++; console.log(`  FAIL  ${label} — it did NOT throw`); }
  catch (err) {
    if (pattern.test(err.message)) { pass++; console.log(`  PASS  ${label}`); }
    else { fail++; console.log(`  FAIL  ${label} — wrong message: ${err.message}`); }
  }
}
/**
 * Strip comments before scanning.
 *
 * This is not incidental. The rule these tests enforce is "there is no payload column", and the
 * files enforcing it carry paragraphs explaining why there is no payload column. Scanning raw text
 * therefore finds the explanation and reports it as a violation — which is how a test starts
 * failing for saying the right thing.
 */
function sqlCode(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}
function jsCode(js) {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");
}

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

console.log("=== 1. the migration set ===");
const control = readMigrations("control");
const tenant = readMigrations("tenant");
check("there is at least one control migration and two tenant migrations (one cannot demonstrate the path)",
  control.length >= 1 && tenant.length >= 2, `${control.length} / ${tenant.length}`);
check("versions are NNN-name and sort in numeric order",
  [...control, ...tenant].every((m) => /^\d{3}-[a-z0-9-]+$/.test(m.version)),
  [...control, ...tenant].map((m) => m.version).join(","));
check("readMigrations returns them sorted", tenant.map((m) => m.version).join(",") === [...tenant].map((m) => m.version).sort().join(","));
check("checksums are stable and normalise line endings",
  readMigrations("control")[0].checksum === control[0].checksum && /^[0-9a-f]{16}$/.test(control[0].checksum), control[0].checksum);
check("no two migrations share a version", new Set([...control, ...tenant].map((m) => m.version)).size === control.length + tenant.length);

console.log("\n=== 2. tenant migrations must run unchanged against every schema ===");
for (const m of tenant) {
  const code = sqlCode(m.sql);
  check(`${m.version} creates no schema`, !/CREATE\s+SCHEMA/i.test(code));
  check(`${m.version} names no schema at all - it must run unchanged against every one`,
    !/\b(control|public|extensions|t_[a-z0-9_]{3,})\./i.test(code),
    code.match(/\b(control|public|extensions|t_[a-z0-9_]{3,})\.\w+/i)?.[0] ?? "");
  check(`${m.version} is re-runnable in itself (IF NOT EXISTS or a guarded DO block)`,
    /IF NOT EXISTS/i.test(code) || /pg_constraint/i.test(code));
}

console.log("\n=== 3. the extension is installed once, database-wide ===");
const c001 = control.find((m) => /control-plane/.test(m.version)).sql;
check("control/001 creates the shared `extensions` schema", /CREATE SCHEMA IF NOT EXISTS extensions/i.test(c001));
check("and installs `vector` into it exactly once", (c001.match(/CREATE EXTENSION[^;]*vector/gi) ?? []).length === 1);
check("no tenant migration tries to CREATE EXTENSION - an extension is per DATABASE, so the second tenant would fail",
  tenant.every((m) => !/CREATE\s+EXTENSION/i.test(m.sql)));
check("src/db/tenant.js puts `extensions` on every tenant search_path so tenant DDL needs no qualification",
  /search_path = \$\{schema\}, extensions/.test(read("src/db/tenant.js")));

console.log("\n=== 4. the job queue carries references, not payloads ===");
const jobDdl = sqlCode(c001.slice(c001.indexOf("control.job_queue"), c001.indexOf("admin_users")));
check("control.job_queue declares no payload-shaped column", !/\b(payload|body|args|data)\b/i.test(jobDdl), jobDdl.match(/\b(payload|body|args|data)\b/i)?.[0] ?? "");
check("and no jsonb", !/jsonb/i.test(jobDdl));
check("it does declare tenant_schema and ref_id", /tenant_schema/.test(jobDdl) && /ref_id/.test(jobDdl));
check("tenant_schema is FK'd to control.tenants(schema_name), so a job cannot name a schema that does not exist",
  /tenant_schema\s+text\s+NOT NULL REFERENCES control\.tenants\(schema_name\)/.test(jobDdl));
const jobsJs = jsCode(read("src/db/jobs.js"));
check("enqueue() has no payload parameter", !/payload/i.test(jobsJs), jobsJs.match(/.*payload.*/i)?.[0] ?? "");
check("the claim query uses FOR UPDATE SKIP LOCKED", /FOR UPDATE SKIP LOCKED/.test(jobsJs));
check("the INSERT names only type, tenant_schema, ref_id and run_after",
  /INSERT INTO control\.job_queue \(type, tenant_schema, ref_id, run_after\)/.test(jobsJs));

console.log("\n=== 5. one door to a tenant, and it closes behind you ===");
const tenantJs = jsCode(read("src/db/tenant.js"));
check("src/db/tenant.js exports withTenant", /export async function withTenant/.test(tenantJs));
check("and exports NO way to get a tenant-pointed client outside a transaction",
  !/export\s+(async\s+)?function\s+(getTenantClient|setTenant|tenantClient)/.test(tenantJs));
check("withTenant asserts before it connects (the assertion is the injection defence - SET takes no bind parameter)",
  tenantJs.indexOf("await assertTenantSchema(schemaName)") < tenantJs.indexOf("getPool().connect()"));
check("assertTenantSchema checks the shape AND queries control.tenants",
  /SCHEMA_SHAPE\.test/.test(tenantJs) && /FROM control\.tenants WHERE schema_name = \$1/.test(tenantJs));
check("it excludes offboarding tenants", /status <> 'offboarding'/.test(tenantJs));
check("SET LOCAL, not SET - a pooled connection must not carry a path onward",
  /SET LOCAL search_path/.test(tenantJs) && !/[^_]\bSET search_path/.test(tenantJs));

const poolJs = jsCode(read("src/db/pool.js"));
check("the pool does NOT set search_path via connection options (the pooler-unsafe form)",
  !/options:\s*['\"`][^'\"`]*search_path/.test(poolJs));
check("withControl pins search_path to extensions only", /SET LOCAL search_path = extensions/.test(poolJs));

console.log("\n=== 6. B0 stayed stateless ===");
check("src/turn.js acquired no database - the B1 handover's explicit 'also out'",
  !/db\/|from \"pg\"|Pool|withTenant/.test(jsCode(read("src/turn.js"))));
check("src/index.js acquired none either", !/db\/|withTenant/.test(jsCode(read("src/index.js"))));
const outsideDb = walk(join(SERVER, "src")).filter((f) => !f.includes(join("src", "db")));
const offenders = outsideDb.filter((f) => /search_path|\bt_[a-z0-9_]{3,}\b/.test(jsCode(readFileSync(f, "utf8"))));
check("no file under src/ outside src/db sets search_path or names a tenant schema", offenders.length === 0, offenders.join(", "));

console.log("\n=== 7. the development database is pinned ===");
const compose = read("docker-compose.yml");
check("docker-compose pins PostgreSQL 17 with pgvector", /pgvector\/pgvector:pg17/.test(compose));
check("it binds to loopback only", /127\.0\.0\.1:\d+:5432/.test(compose));
check("and caps max_connections at the db.t4g.micro figure that killed per-tenant pollers", /max_connections=80/.test(compose));

console.log("\n=== 8. schema names are derived, not free text ===");
check("acme-corp -> t_acme_corp", schemaNameFor("acme-corp") === "t_acme_corp");
throws("an uppercase slug is refused", () => schemaNameFor("Acme"), /bad tenant slug/);
throws("a slug with a dot is refused", () => schemaNameFor("acme.corp"), /bad tenant slug/);
throws("a two-character slug is refused", () => schemaNameFor("ab"), /bad tenant slug/);
throws("an injection-shaped slug is refused", () => schemaNameFor("a; DROP SCHEMA x"), /bad tenant slug/);
check("every derived name satisfies the CHECK constraint in control/001",
  /^t_[a-z0-9_]{1,54}$/.test(schemaNameFor("acme-corp")) && /^t_[a-z0-9_]{1,54}$/.test(schemaNameFor("a-b-c")));
const tenantsJs = jsCode(read("src/db/tenants.js"));
check("dropTenantForTests is named so it cannot be mistaken for offboarding",
  /dropTenantForTests/.test(tenantsJs) && !/export async function dropTenant\b/.test(tenantsJs));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
