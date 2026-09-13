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
  // A DO block against pg_constraint guards an ADD CONSTRAINT (002, 003); one against pg_attribute
  // guards a RENAME COLUMN (005). Neither statement has IF [NOT] EXISTS in PostgreSQL 17.
  check(`${m.version} is re-runnable in itself (IF NOT EXISTS or a guarded DO block)`,
    /IF NOT EXISTS/i.test(code) || /pg_constraint|pg_attribute/i.test(code));
}

console.log("\n=== 2a. tenant/005 renames close_note guarded, and retracts 004 rather than editing it (D269) ===");
{
  const m005 = tenant.find((m) => /internal-resolution-note/.test(m.version));
  check("tenant/005-internal-resolution-note.sql exists", Boolean(m005));
  const sql = m005?.sql ?? "", code = sqlCode(sql);
  check("the rename is guarded by BOTH pg_attribute questions - old name present AND new name absent",
    /EXISTS \(SELECT 1 FROM pg_attribute[\s\S]*?attname = 'close_note'/.test(code) && /NOT EXISTS \(SELECT 1 FROM pg_attribute[\s\S]*?attname = 'internal_resolution_note'/.test(code)
    && /ALTER TABLE tickets RENAME COLUMN close_note TO internal_resolution_note/.test(code));
  check("it resolves the table through current_schema(), so the same text runs against every tenant", /current_schema\(\) \|\| '\.tickets'/.test(code));
  check("it carries decision provenance with the status held when written (register §5.7b)",
    /DECISION PROVENANCE/.test(sql) && /D269 \(PROPOSED 2026-09-12\)/.test(sql) && /D239 \(DECIDED 2026-09-10\)/.test(sql));
  check("it QUOTES the sentence 004 got wrong, and says why 004 is not edited (the ledger checksums comments too)",
    /nothing reads it yet except the ticket's own detail page and the\s+-- CLI/.test(sql) && /checksum/.test(sql));
  // 004 is applied on every existing tenant with this checksum in its ledger. Editing it - even a
  // comment - makes migrate() refuse on all of them, so the retraction lives in 005 and this pin
  // is what turns "do not edit 004" from advice into a failing test.
  const m004 = tenant.find((m) => /session-outcomes/.test(m.version));
  check("tenant/004 is byte-for-byte what the tenant ledgers hold (checksum 6c888d52395e288a)", m004?.checksum === "6c888d52395e288a", m004?.checksum);
  check("...and still adds close_note, which a fresh tenant needs 004 to do before 005 renames it", /ADD COLUMN IF NOT EXISTS close_note text/.test(sqlCode(m004?.sql ?? "")));
  const namesOld = [...walk(join(SERVER, "src")), ...walk(join(SERVER, "bin"))]
    .filter((f) => /\.(m?js)$/.test(f) && /close_note|closeNote/.test(jsCode(readFileSync(f, "utf8"))));
  check("no JavaScript under src/ or bin/ names close_note or closeNote any more", namesOld.length === 0, namesOld.join(", "));
}

console.log("\n=== 2b. tenant/006 — the timeline's visibility is the KIND's, the database enforces it, and retention is decided (D275–D277) ===");
{
  const m006 = tenant.find((m) => /ticket-timeline/.test(m.version));
  check("tenant/006-ticket-timeline.sql exists", Boolean(m006));
  const sql = m006?.sql ?? "", code = sqlCode(sql);
  check("it carries decision provenance with the status held when written (register §5.7b)",
    /DECISION PROVENANCE/.test(sql) && /D275 \(PROPOSED 2026-09-12\)/.test(sql) && /D276 \(PROPOSED 2026-09-12\)/.test(sql) && /D277 \(PROPOSED 2026-09-12\)/.test(sql) && /D269 \(RATIFIED 2026-09-12\)/.test(sql));
  check("ticket_entries has the four kinds, two visibilities and four author kinds as CHECKs",
    /kind IN \('comment', 'work_note', 'state_change', 'resolution'\)/.test(code) && /visibility IN \('public', 'internal'\)/.test(code) && /author_kind IN \('requester', 'console_user', 'agent', 'system'\)/.test(code));
  check("a work note can never be public and a requester can never write an internal row — in the DATABASE, not only in query.js",
    /CHECK \(kind <> 'work_note' OR visibility = 'internal'\)/.test(code) && /CHECK \(author_kind <> 'requester' OR visibility = 'public'\)/.test(code));
  check("author_admin_user_id carries NO foreign key (a control-plane id in tenant data, D143); author_label is a snapshot",
    /author_admin_user_id\s+uuid,/.test(code) && !/author_admin_user_id\s+uuid\s+REFERENCES/.test(code) && /author_label\s+text/.test(code));
  check("the two indexes: (ticket_id, created_at) and the partial unnotified-requester scan",
    /ON ticket_entries \(ticket_id, created_at\)/.test(code) && /WHERE author_kind = 'requester' AND notified_at IS NULL/.test(code));
  check("tickets gains awaiting_agent_since (D276's clock)", /ALTER TABLE tickets ADD COLUMN IF NOT EXISTS awaiting_agent_since timestamptz/.test(code));
  check("RETENTION is decided in the header: names D277 and D229, refuses the per-column sweep, points at OPEN-12",
    /RETENTION \(D277\)/.test(sql) && /D229/.test(sql) && /OPEN-12/.test(sql) && /NOTHING here is\s+-- swept/.test(sql));
  check("it says in words why there is no requester-visible composer (plan v3 §0 finding 8)", /WHY NOT A REQUESTER-VISIBLE COMPOSER/.test(sql) && /finding 8/.test(sql));
  check("no jsonb, no payload-shaped column: body is the one free-text field", !/jsonb/i.test(code));
}

console.log("\n=== 2c. tenant/007 — resolution: the six codes, four closers, and the database's copy of D278 (D278–D280) ===");
{
  const m007 = tenant.find((m) => /007-resolution/.test(m.version));
  check("tenant/007-resolution.sql exists", Boolean(m007));
  const sql = m007?.sql ?? "", code = sqlCode(sql);
  check("it carries decision provenance with the status held when written (register §5.7b)",
    /DECISION PROVENANCE/.test(sql) && /D278 \(PROPOSED 2026-09-12\)/.test(sql) && /D279 \(PROPOSED 2026-09-12\)/.test(sql) && /D280 \(PROPOSED 2026-09-12\)/.test(sql) && /D275 \(PROPOSED 2026-09-12\)/.test(sql) && /D269 \(RATIFIED 2026-09-12\)/.test(sql));
  check("it adds the five columns, all IF NOT EXISTS", ["resolution_code", "resolution_notes", "resolved_at", "closed_at", "closed_by"].every((c) => new RegExp(`ADD COLUMN IF NOT EXISTS ${c}\\s`).test(code)));
  check("the resolution code is a CHECK over the six, never free text", /resolution_code IS NULL OR resolution_code IN \(\s*'fixed', 'workaround', 'no_fault_found', 'duplicate', 'withdrawn_by_user', 'referred_to_vendor'\s*\)/.test(code));
  check("closed_by has FOUR values — the CLI (system) is one, so a closed ticket never lies about its closer", /closed_by IS NULL OR closed_by IN \('requester', 'auto', 'console_user', 'system'\)/.test(code));
  check("the database holds D278's rule itself — a resolved row needs code AND notes — as NOT VALID so an old resolved ticket still migrates", /CHECK \(state <> 'resolved' OR \(resolution_code IS NOT NULL AND resolution_notes IS NOT NULL\)\) NOT VALID/.test(code));
  check("all three constraints are guarded through pg_constraint (ADD CONSTRAINT has no IF NOT EXISTS)", (code.match(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint/g) ?? []).length === 3);
  check("the header puts the two notes side by side so the next writer does not merge them", /THE TWO NOTES, SIDE BY SIDE/.test(sql) && /internal_resolution_note/.test(sql) && /resolution_notes/.test(sql));
  check("it says what a reopen does to the columns (cleared) and where the history lives (the timeline)", /WHAT THE COLUMNS MEAN ACROSS A REOPEN/.test(sql) && /resolution.{0,3} entry/.test(sql));
}

console.log("\n=== 2d. tenant/008 — tickets.device_id: the requester's scope is the enrollment, as a bare uuid (D284) ===");
{
  const m008 = tenant.find((m) => /008-ticket-device/.test(m.version));
  check("tenant/008-ticket-device.sql exists", Boolean(m008));
  const sql = m008?.sql ?? "", code = sqlCode(sql);
  check("it carries decision provenance with the status held when written (register §5.7b) — D271 DECIDED, D284/D281 PROPOSED, D269 RATIFIED",
    /DECISION PROVENANCE/.test(sql) && /D271 \(DECIDED 2026-09-12, founder\)/.test(sql) && /D284 \(PROPOSED 2026-09-12\)/.test(sql) && /D281 \(PROPOSED 2026-09-12; REKEYED by this\)/.test(sql) && /D269 \(RATIFIED 2026-09-12\)/.test(sql));
  check("it adds device_id as a uuid, IF NOT EXISTS, and a partial index for the requester's list read", /ADD COLUMN IF NOT EXISTS device_id uuid/.test(code) && /CREATE INDEX IF NOT EXISTS tickets_device ON tickets \(device_id, created_at DESC\) WHERE device_id IS NOT NULL/.test(code));
  check("device_id carries NO REFERENCES — a tenant schema must not hold a reference the control plane can follow back, and the header says so", !/REFERENCES/.test(code) && /WHY A BARE UUID AND NOT A FOREIGN KEY/.test(sql));
  check("it says what NULL means — filed with no credential, readable by no requester route — and why not the OS username", /WHAT NULL MEANS/.test(sql) && /no credential/.test(sql) && /self-asserted/.test(sql));
  const controlM008 = control.find((m) => /008-device-credential/.test(m.version));
  check("control/008 (the credential, D282) exists beside it and names D271 as decided", Boolean(controlM008) && /D271 \(DECIDED 2026-09-12, founder\)/.test(controlM008?.sql ?? "") && /D282 \(PROPOSED 2026-09-12\)/.test(controlM008?.sql ?? ""));
}

console.log("\n=== 2e. tenant/009 — tickets.reopened_from: a follow-up to a closed ticket, linked, with an FK inside the schema (D286) ===");
{
  const m009 = tenant.find((m) => /009-reopened-from/.test(m.version));
  check("tenant/009-reopened-from.sql exists", Boolean(m009));
  const sql = m009?.sql ?? "", code = sqlCode(sql);
  check("it carries decision provenance with the status held when written (register §5.7b) — D286/D279/D284 PROPOSED, D269 RATIFIED", /DECISION PROVENANCE/.test(sql) && /D286 \(PROPOSED 2026-09-12\)/.test(sql) && /D279 \(PROPOSED 2026-09-12\)/.test(sql) && /D284 \(PROPOSED 2026-09-12\)/.test(sql) && /D269 \(RATIFIED 2026-09-12\)/.test(sql));
  check("it adds reopened_from as a uuid REFERENCES tickets(id), IF NOT EXISTS, with a partial index", /ADD COLUMN IF NOT EXISTS reopened_from uuid REFERENCES tickets\(id\)/.test(code) && /CREATE INDEX IF NOT EXISTS tickets_reopened_from ON tickets \(reopened_from\) WHERE reopened_from IS NOT NULL/.test(code));
  check("the header says why THIS column has a foreign key when device_id has none (same schema; the earlier ticket must exist)", /WHY A FOREIGN KEY HERE/.test(sql) && /SAME tenant schema/.test(sql));
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
