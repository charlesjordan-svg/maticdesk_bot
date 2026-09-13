/**
 * B1 — the control plane, the migration path and tenant isolation. Against a real PostgreSQL.
 *
 * Run:  docker compose up -d  &&  node test/db.test.mjs        (from server/)
 *
 * This is NOT part of `npm test`. The B0 suite runs with no dependencies and no services, and that
 * property is worth keeping; this one needs a database. It fails loudly rather than skipping when
 * the database is absent, because a test that quietly skips is how an exit criterion goes
 * unverified for a month.
 *
 * The numbered sections are the six B1 exit criteria, in the order they can be checked (3 comes
 * first, because everything else needs a migrated database). Sections 0, 2a, 7 and 9 test the
 * mechanisms that make them true rather than accidental. The SOURCE-level rules are in
 * db-static.test.mjs, which needs no database and runs in `npm test`.
 */
import { closePool, getPool, withControl } from "../src/db/pool.js";
import { migrate, readMigrations } from "../src/db/migrate.js";
import { createTenant, dropTenantForTests, listTenants, schemaNameFor } from "../src/db/tenants.js";
import { assertTenantSchema, forgetTenants, withTenant } from "../src/db/tenant.js";
import { cancelJobsFor, claim, enqueue, finish, reapStuck, runOne } from "../src/db/jobs.js";
import { createJobRunner } from "../src/jobs/runner.js";
import { randomUUID } from "node:crypto";

let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}
/** Assert that `fn` rejects, and that the message matches. Refusals are half of this file. */
async function refuses(label, fn, pattern) {
  try {
    await fn();
    fail++; console.log(`  FAIL  ${label} — it did NOT refuse`);
  } catch (err) {
    const ok = pattern.test(err.message);
    if (ok) { pass++; console.log(`  PASS  ${label}`); }
    else { fail++; console.log(`  FAIL  ${label} — refused with the wrong message: ${err.message}`); }
  }
}

const A = "b1-test-alpha";
const B = "b1-test-beta";
const C = "b1-test-gamma";
const SA = schemaNameFor(A), SB = schemaNameFor(B), SC = schemaNameFor(C);

async function main() {
  // ---- reachability -------------------------------------------------------------------------
  try {
    await getPool().query("SELECT 1");
  } catch (err) {
    console.error(`\nCannot reach the database: ${err.message}`);
    console.error("Start it first:  docker compose up -d     (from server/)");
    console.error("Or point MATIC_DB_URL at a PostgreSQL 17 with pgvector.");
    process.exit(1);
  }
  const { rows: ver } = await getPool().query("SHOW server_version");
  console.log(`PostgreSQL ${ver[0].server_version}`);
  const major = Number(String(ver[0].server_version).split(".")[0]);

  // Bring the database up to date BEFORE anything else looks at it. On a fresh database there is
  // no control schema at all, so neither the teardown below nor §0's extension check has anything
  // to read. §3's assertions still hold: the run below is the "one run", and §3's own call is the
  // second one that must apply nothing.
  await migrate();

  // Leftovers from a failed run would make every count wrong.
  for (const slug of [A, B, C]) await dropTenantForTests(slug);

  // =============================================================================================
  console.log("\n=== 0. the pin and the extension ===");
  check("server major is 17, matching docker-compose.yml and the intended RDS major", major === 17, String(major));
  const { rows: ext } = await getPool().query(
    "SELECT extversion, n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE extname = 'vector'",
  );
  check("pgvector is installed ONCE, in the shared `extensions` schema (not per tenant - an extension is per DATABASE)",
    ext.length === 1 && ext[0].nspname === "extensions", JSON.stringify(ext));

  // =============================================================================================
  console.log("\n=== 3. one run applies the control plane and every tenant schema, and is idempotent ===");
  // Criterion 3 is checked first because everything else needs a migrated database. The first run
  // happened above; this is the second, and it must find nothing to do.
  const again = await migrate();
  check("a second run applies nothing - the runner is idempotent",
    again.control.length === 0 && Object.values(again.tenants).every((v) => v.length === 0), JSON.stringify(again));

  const controlOnDisk = readMigrations("control").map((m) => m.version);
  const { rows: controlApplied } = await getPool().query("SELECT version FROM control.schema_migrations ORDER BY version");
  check("every control migration on disk is recorded as applied",
    controlOnDisk.join(",") === controlApplied.map((r) => r.version).join(","),
    `${controlOnDisk} vs ${controlApplied.map((r) => r.version)}`);

  // D282: control/008 is all IF NOT EXISTS. Running it a second time must leave the devices
  // catalog byte for byte where it was (the shape tenant/006 and /007 are held to).
  const m008 = readMigrations("control").find((m) => /008-device-credential/.test(m.version));
  const devicesCatalog = async () => JSON.stringify({
    cols: (await getPool().query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'control' AND table_name = 'devices' ORDER BY 1")).rows.map((r) => r.column_name),
    idx: (await getPool().query("SELECT indexname FROM pg_indexes WHERE schemaname = 'control' AND tablename = 'devices' ORDER BY 1")).rows.map((r) => r.indexname),
  });
  const snap008 = await devicesCatalog();
  check("control/008 gave devices credential_hash, credential_issued_at and the partial unique index on the hash", Boolean(m008) && /credential_hash/.test(snap008) && /credential_issued_at/.test(snap008) && /devices_credential_hash/.test(snap008), snap008);
  await getPool().query(m008.sql);
  check("running control/008's SQL a SECOND time changes nothing in the catalog", (await devicesCatalog()) === snap008);

  // D289: control/009 — the auto-close interval on the tenant row; re-run a no-op; the CHECK refuses 0 and 8761.
  const m009c = readMigrations("control").find((m) => /009-ticket-autoclose-interval/.test(m.version));
  const tenantsCatalog = async () => JSON.stringify({
    cols: (await getPool().query("SELECT column_name, column_default FROM information_schema.columns WHERE table_schema = 'control' AND table_name = 'tenants' ORDER BY 1")).rows,
    cons: (await getPool().query("SELECT conname FROM pg_constraint WHERE conrelid = 'control.tenants'::regclass ORDER BY 1")).rows.map((r) => r.conname),
  });
  const snap009c = await tenantsCatalog();
  check("control/009 gave tenants ticket_autoclose_hours with DEFAULT 72 and the range CHECK", Boolean(m009c) && /"column_name":"ticket_autoclose_hours","column_default":"72"/.test(snap009c) && /tenants_autoclose_hours_range/.test(snap009c), snap009c);
  await getPool().query(m009c.sql);
  check("running control/009's SQL a SECOND time changes nothing in the catalog", (await tenantsCatalog()) === snap009c);
  for (const bad of [0, 8761, -5]) {
    check(`the CHECK refuses ${bad} hours`, /violates check constraint|tenants_autoclose_hours_range/.test(await getPool().query("INSERT INTO control.tenants (slug, schema_name, display_name, ticket_autoclose_hours) VALUES ('zz-autoclose-probe', 't_zz_autoclose_probe', 'probe', $1)", [bad]).then(() => "accepted", (e) => e.message)));
  }
  check("…and NULL (off) and 1 and 8760 are accepted", await getPool().query("INSERT INTO control.tenants (slug, schema_name, display_name, ticket_autoclose_hours) VALUES ('zz-autoclose-probe', 't_zz_autoclose_probe', 'probe', NULL) RETURNING id").then(async (r) => { await getPool().query("UPDATE control.tenants SET ticket_autoclose_hours = 1 WHERE id = $1", [r.rows[0].id]); await getPool().query("UPDATE control.tenants SET ticket_autoclose_hours = 8760 WHERE id = $1", [r.rows[0].id]); await getPool().query("DELETE FROM control.tenants WHERE id = $1", [r.rows[0].id]); return true; }, () => false));

  // =============================================================================================
  console.log("\n=== 1. two tenants, two schemas ===");
  const ta = await createTenant(A, { displayName: "Alpha" });
  const tb = await createTenant(B, { displayName: "Beta" });
  check("two tenant rows exist", ta.id !== tb.id && ta.slug === A && tb.slug === B);
  check("with different schema names", ta.schemaName === SA && tb.schemaName === SB && SA !== SB);

  const tenantOnDisk = readMigrations("tenant").map((m) => m.version);
  check("each new tenant received every tenant migration on disk",
    ta.applied.join(",") === tenantOnDisk.join(",") && tb.applied.join(",") === tenantOnDisk.join(","),
    `${ta.applied} / ${tb.applied} vs ${tenantOnDisk}`);

  const { rows: schemas } = await getPool().query(
    "SELECT nspname FROM pg_namespace WHERE nspname IN ($1, $2) ORDER BY nspname", [SA, SB],
  );
  check("both schemas exist in the database", schemas.length === 2);
  check("createTenant is re-runnable", (await createTenant(A)).id === ta.id);

  // =============================================================================================
  console.log("\n=== 2. a query in tenant A's context cannot read tenant B's rows ===");
  await withTenant(SA, (c) => c.query("INSERT INTO sessions (device_id) VALUES (gen_random_uuid())"));
  await withTenant(SB, (c) => c.query("INSERT INTO sessions (device_id) VALUES (gen_random_uuid())"));
  await withTenant(SB, (c) => c.query("INSERT INTO sessions (device_id) VALUES (gen_random_uuid())"));

  const inA = await withTenant(SA, async (c) => ({
    schema: (await c.query("SELECT current_schema() AS s")).rows[0].s,
    path: (await c.query("SHOW search_path")).rows[0].search_path,
    count: Number((await c.query("SELECT count(*)::int AS n FROM sessions")).rows[0].n),
  }));
  check("current_schema() inside withTenant is the tenant's", inA.schema === SA, inA.schema);
  check("search_path is the tenant plus extensions, and NOT public", /^t_b1_test_alpha, extensions$/.test(inA.path), inA.path);
  check("A sees its own one row and not B's two", inA.count === 1, String(inA.count));
  check("B sees its own two", (await withTenant(SB, async (c) =>
    Number((await c.query("SELECT count(*)::int AS n FROM sessions")).rows[0].n))) === 2);

  // The connection must come back clean, or a pooled hand-off carries a stale path.
  const afterRelease = (await getPool().query("SHOW search_path")).rows[0].search_path;
  check("a released connection carries NO tenant on its search_path (SET LOCAL died with the transaction)",
    !afterRelease.includes("t_b1_test"), afterRelease);

  // ---- and the honest half of criterion 2 ---------------------------------------------------
  // `search_path` is a NAME RESOLUTION mechanism, not a permission boundary. It stops an
  // accidental cross-tenant read; it does not stop a deliberate one, because the application role
  // owns every schema. This is recorded as a test so that nobody reads criterion 2 as a stronger
  // guarantee than it is. See docs/B1-CONTROL-PLANE.md 6.
  const crossed = await withTenant(SA, async (c) =>
    Number((await c.query(`SELECT count(*)::int AS n FROM ${SB}.sessions`)).rows[0].n));
  check("KNOWN LIMIT, asserted deliberately: a SCHEMA-QUALIFIED read from A does reach B (2 rows). "
    + "search_path confines accident, not intent - per-tenant roles or RLS is the next step, and is not B1",
    crossed === 2, String(crossed));

  // =============================================================================================
  console.log("\n=== 2a. the assertion is the injection defence (SET takes no bind parameter) ===");
  await refuses("a schema that is not a tenant is refused", () => withTenant("public", async () => {}), /not a tenant schema name/);
  await refuses("a well-shaped name with no tenant row is refused", () => withTenant("t_no_such_tenant", async () => {}), /no such active tenant/);
  await refuses("a comma injection is refused by the shape check before any SQL",
    () => withTenant(`${SA}, public`, async () => {}), /not a tenant schema name/);
  await refuses("a statement injection is refused", () => withTenant(`${SA}; DROP SCHEMA ${SB} CASCADE`, async () => {}), /not a tenant schema name/);
  await refuses("a non-string is refused", () => withTenant(null, async () => {}), /not a tenant schema name/);
  check(`${SB} still exists after the injection attempt`,
    (await getPool().query("SELECT 1 FROM pg_namespace WHERE nspname = $1", [SB])).rows.length === 1);

  // An offboarding tenant's row outlives its data, and must stop granting access.
  await getPool().query("UPDATE control.tenants SET status = 'offboarding' WHERE slug = $1", [B]);
  forgetTenants();
  await refuses("an offboarding tenant is refused", () => withTenant(SB, async () => {}), /no such active tenant/);
  await getPool().query("UPDATE control.tenants SET status = 'active' WHERE slug = $1", [B]);
  forgetTenants();
  check("and allowed again once active", (await withTenant(SB, async () => "ok")) === "ok");

  // =============================================================================================
  console.log("\n=== 4. a third tenant applies every existing migration automatically ===");
  const tc = await createTenant(C);
  check("the third tenant got every migration with nobody asking",
    tc.applied.join(",") === tenantOnDisk.join(","), `${tc.applied} vs ${tenantOnDisk}`);
  const cCols = await withTenant(SC, async (c) => (await c.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'sessions' ORDER BY column_name",
  )).rows.map((r) => r.column_name));
  check("including the SECOND migration - `sessions.outcome` is present on a schema created after it was written",
    cCols.includes("outcome"), cCols.join(","));
  check("and the four-outcome constraint came with it (D89 + D118)", await withTenant(SC, async (c) => {
    try { await c.query("INSERT INTO sessions (outcome) VALUES ('probably-fine')"); return false; }
    catch { return true; }
  }));
  check("a valid outcome inserts", await withTenant(SC, async (c) => {
    const { rowCount } = await c.query("INSERT INTO sessions (outcome) VALUES ('escalated')");
    return rowCount === 1;
  }));
  check("three tenants are listed", (await listTenants()).filter((t) => t.slug.startsWith("b1-test-")).length === 3);

  // D269: tenant/005 renames close_note -> internal_resolution_note behind a pg_attribute guard,
  // because RENAME COLUMN has no IF EXISTS and the runner may meet a tenant mid-flight. A fresh
  // tenant runs 004 (adds close_note) and 005 (renames it) in one run and lands renamed.
  const ticketCols = () => withTenant(SC, async (c) => (await c.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tickets' ORDER BY column_name",
  )).rows.map((r) => r.column_name));
  const before = await ticketCols();
  check("tickets carries internal_resolution_note and no close_note on a schema created after tenant/005",
    before.includes("internal_resolution_note") && !before.includes("close_note"), before.join(","));
  const m005 = readMigrations("tenant").find((m) => /internal-resolution-note/.test(m.version));
  await withTenant(SC, (c) => c.query(m005.sql));
  check("running tenant/005's SQL a SECOND time changes nothing (the guard's no-op branch - the already-migrated tenant)",
    (await ticketCols()).join(",") === before.join(","));
  await withTenant(SC, (c) => c.query("ALTER TABLE tickets RENAME COLUMN internal_resolution_note TO close_note"));
  await withTenant(SC, (c) => c.query(m005.sql));
  const after = await ticketCols();
  check("and against a tenant still carrying close_note it renames forward (the guard's rename branch - the not-yet-migrated tenant)",
    after.includes("internal_resolution_note") && !after.includes("close_note"), after.join(","));

  // D275: tenant/006 is all IF NOT EXISTS. Running it a second time against a migrated tenant must
  // leave the catalog - columns, indexes, constraints - byte for byte where it was (P1 exit
  // criterion 3), and its two visibility CHECKs must refuse what query.js's map forbids even when
  // asked directly in SQL.
  const m006 = readMigrations("tenant").find((m) => /ticket-timeline/.test(m.version));
  const timelineCatalog = () => withTenant(SC, async (c) => JSON.stringify({
    cols: (await c.query("SELECT table_name || '.' || column_name AS x FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('tickets', 'ticket_entries') ORDER BY 1")).rows.map((r) => r.x),
    idx: (await c.query("SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'ticket_entries' ORDER BY 1")).rows.map((r) => r.indexname),
    cons: (await c.query("SELECT conname FROM pg_constraint WHERE conrelid = (current_schema() || '.ticket_entries')::regclass ORDER BY 1")).rows.map((r) => r.conname),
  }));
  const snap006 = await timelineCatalog();
  check("tenant/006 gave the fresh tenant ticket_entries with both visibility CHECKs, the partial index, and tickets.awaiting_agent_since",
    Boolean(m006) && /ticket_entries_work_note_internal/.test(snap006) && /ticket_entries_requester_public/.test(snap006) && /ticket_entries_unnotified/.test(snap006) && /tickets\.awaiting_agent_since/.test(snap006), snap006);
  await withTenant(SC, (c) => c.query(m006.sql));
  check("running tenant/006's SQL a SECOND time changes nothing in the catalog (all IF NOT EXISTS)", (await timelineCatalog()) === snap006);
  const refused = (sql) => withTenant(SC, async (c) => { try { await c.query(sql); return ""; } catch (e) { return e.message; } });
  check("the DATABASE refuses a public work note, whatever the code asked for (ticket_entries_work_note_internal)",
    /ticket_entries_work_note_internal/.test(await refused("INSERT INTO ticket_entries (ticket_id, kind, visibility, body, author_kind) VALUES (gen_random_uuid(), 'work_note', 'public', 'x', 'system')")));
  check("...and an internal row from a requester (ticket_entries_requester_public)",
    /ticket_entries_requester_public/.test(await refused("INSERT INTO ticket_entries (ticket_id, kind, visibility, body, author_kind) VALUES (gen_random_uuid(), 'comment', 'internal', 'x', 'requester')")));

  // D278: tenant/007's columns and constraints, re-run as a no-op, and the CHECKs refusing what
  // resolveTicket() refuses in code - a resolved row with no code or notes, and a code outside the six.
  const m007 = readMigrations("tenant").find((m) => /007-resolution/.test(m.version));
  const ticketsCatalog = () => withTenant(SC, async (c) => JSON.stringify({
    cols: (await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tickets' ORDER BY 1")).rows.map((r) => r.column_name),
    cons: (await c.query("SELECT conname, convalidated FROM pg_constraint WHERE conrelid = (current_schema() || '.tickets')::regclass ORDER BY 1")).rows,
  }));
  const snap007 = await ticketsCatalog();
  check("tenant/007 gave the fresh tenant the five resolution columns and three constraints, the D278 one NOT VALID",
    Boolean(m007) && /resolution_code/.test(snap007) && /closed_by/.test(snap007) && /tickets_resolution_code_known/.test(snap007) && /tickets_closed_by_known/.test(snap007) && /"conname":"tickets_resolved_has_resolution","convalidated":false/.test(snap007), snap007);
  await withTenant(SC, (c) => c.query(m007.sql));
  check("running tenant/007's SQL a SECOND time changes nothing in the catalog", (await ticketsCatalog()) === snap007);
  const minimal = "INSERT INTO tickets (reference, description, summary, category, state, resolution_code, resolution_notes) VALUES ";
  check("the DATABASE refuses a resolved ticket with no code and no notes (tickets_resolved_has_resolution binds new rows though NOT VALID)",
    /tickets_resolved_has_resolution/.test(await refused(minimal + "('MD-B1-1', 'x', 'x', 'other', 'resolved', NULL, NULL)")));
  check("...and a resolution code outside the six (tickets_resolution_code_known)",
    /tickets_resolution_code_known/.test(await refused(minimal + "('MD-B1-2', 'x', 'x', 'other', 'resolved', 'sorted', 'notes')")));
  check("...and accepts a resolved row carrying both", (await refused(minimal + "('MD-B1-3', 'x', 'x', 'other', 'resolved', 'fixed', 'notes')")) === "");

  // D284: tenant/008 is all IF NOT EXISTS. Re-run against a migrated tenant, the tickets catalog —
  // columns AND indexes — must not move; and device_id is a bare uuid, no foreign key.
  const m008t = readMigrations("tenant").find((m) => /008-ticket-device/.test(m.version));
  const deviceCatalog = () => withTenant(SC, async (c) => JSON.stringify({
    cols: (await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tickets' ORDER BY 1")).rows,
    idx: (await c.query("SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'tickets' ORDER BY 1")).rows.map((r) => r.indexname),
    fks: (await c.query("SELECT conname FROM pg_constraint WHERE conrelid = (current_schema() || '.tickets')::regclass AND contype = 'f' ORDER BY 1")).rows.map((r) => r.conname),
  }));
  const snap008t = await deviceCatalog();
  check("tenant/008 gave the fresh tenant tickets.device_id (uuid) and the partial index tickets_device, with NO foreign key on it (a tenant schema must not reference the control plane)",
    Boolean(m008t) && /"column_name":"device_id","data_type":"uuid"/.test(snap008t) && /tickets_device/.test(snap008t) && !/device/.test(JSON.parse(snap008t).fks.join(",")), snap008t);
  await withTenant(SC, (c) => c.query(m008t.sql));
  check("running tenant/008's SQL a SECOND time changes nothing in the catalog", (await deviceCatalog()) === snap008t);

  // D286: tenant/009 — the follow-up link, WITH a foreign key (same schema), re-run a no-op.
  const m009t = readMigrations("tenant").find((m) => /009-reopened-from/.test(m.version));
  const snap009t = await deviceCatalog();
  check("tenant/009 gave the fresh tenant tickets.reopened_from (uuid) with a foreign key onto tickets and the partial index", Boolean(m009t) && /"column_name":"reopened_from","data_type":"uuid"/.test(snap009t) && /tickets_reopened_from/.test(snap009t) && /reopened_from/.test(JSON.parse(snap009t).fks.join(",")), snap009t);
  await withTenant(SC, (c) => c.query(m009t.sql));
  check("running tenant/009's SQL a SECOND time changes nothing in the catalog", (await deviceCatalog()) === snap009t);
  check("the database refuses a follow-up to a ticket that does not exist (the FK)", /violates foreign key|not present in table/.test(await withTenant(SC, async (c) => { try { await c.query("INSERT INTO tickets (reference, description, summary, category, reopened_from) VALUES ('MD-B1-9', 'x', 'x', 'other', gen_random_uuid())"); return ""; } catch (e) { return e.message; } })));

  // D289: tenant/010 — the auto-close binding on the ticket, re-run a no-op, NO foreign key on the job id.
  const m010t = readMigrations("tenant").find((m) => /010-autoclose/.test(m.version));
  const snap010t = await deviceCatalog();
  check("tenant/010 gave the fresh tenant tickets.auto_close_at (timestamptz) and auto_close_job_id (uuid) with the partial index and NO new foreign key", Boolean(m010t) && /"column_name":"auto_close_at","data_type":"timestamp with time zone"/.test(snap010t) && /"column_name":"auto_close_job_id","data_type":"bigint"/.test(snap010t) && /tickets_auto_close/.test(snap010t) && !/auto_close/.test(JSON.parse(snap010t).fks.join(",")), snap010t);
  await withTenant(SC, (c) => c.query(m010t.sql));
  check("running tenant/010's SQL a SECOND time changes nothing in the catalog", (await deviceCatalog()) === snap010t);

  // =============================================================================================
  console.log("\n=== 5. a job for tenant B is picked up by a worker that sees only B's data ===");
  const bSessionId = await withTenant(SB, async (c) =>
    (await c.query("INSERT INTO sessions (device_id) VALUES (gen_random_uuid()) RETURNING id")).rows[0].id);
  const jobId = await enqueue({ type: "b1-probe", tenantSchema: SB, refId: bSessionId });

  let seenSchema = null, seenCount = null, seenRef = null;
  const ran = await runOne("worker-1", async (job, client) => {
    seenSchema = (await client.query("SELECT current_schema() AS s")).rows[0].s;
    seenCount = Number((await client.query("SELECT count(*)::int AS n FROM sessions")).rows[0].n);
    // The job carried a REFERENCE. The worker resolves it inside the tenant - that is the point.
    seenRef = (await client.query("SELECT id FROM sessions WHERE id = $1", [job.refId])).rows.length;
  });
  check("the job was claimed", ran?.id === jobId && ran.type === "b1-probe");
  check("the worker's schema came off the job row and was asserted", seenSchema === SB, String(seenSchema));
  check("it sees B's three rows, not A's one and not C's two", seenCount === 3, String(seenCount));
  check("the reference resolved inside the tenant", seenRef === 1);
  check("the job is done", (await getPool().query("SELECT status FROM control.job_queue WHERE id = $1", [jobId])).rows[0].status === "done");

  await refuses("a job naming a schema with no tenant row cannot even be enqueued (FK to control.tenants)",
    () => enqueue({ type: "x", tenantSchema: "t_not_a_tenant" }), /foreign key|violates/i);

  // A worker whose handler throws must leave the job failed and re-raise, not swallow it.
  const badId = await enqueue({ type: "b1-explode", tenantSchema: SB });
  await refuses("a throwing handler propagates", () => runOne("worker-1", async () => { throw new Error("boom"); }), /boom/);
  const badRow = (await getPool().query("SELECT status, last_error FROM control.job_queue WHERE id = $1", [badId])).rows[0];
  check("and the job is recorded failed with the message", badRow.status === "failed" && badRow.last_error === "boom", JSON.stringify(badRow));

  // =============================================================================================
  console.log("\n=== 6. FOR UPDATE SKIP LOCKED hands one job to exactly one of two workers ===");
  const one = await enqueue({ type: "b1-single", tenantSchema: SA });
  const [c1, c2] = await Promise.all([claim("worker-1"), claim("worker-2")]);
  const got = [c1, c2].filter((j) => j?.id === one);
  check("exactly one of two concurrent claims got the single job", got.length === 1, JSON.stringify([c1, c2]));
  check("the other got nothing rather than blocking or duplicating", [c1, c2].filter((j) => j === null).length === 1);
  await finish(one);

  const many = [
    await enqueue({ type: "b1-many", tenantSchema: SA }),
    await enqueue({ type: "b1-many", tenantSchema: SB }),
    await enqueue({ type: "b1-many", tenantSchema: SC }),
  ];
  const claims = await Promise.all([claim("w1"), claim("w2"), claim("w3")]);
  const ids = claims.map((j) => j?.id).filter(Boolean);
  check("three workers on three jobs take three DIFFERENT jobs", new Set(ids).size === 3, ids.join(","));
  check("and each carries its own tenant schema",
    new Set(claims.map((j) => j?.tenantSchema)).size === 3, claims.map((j) => j?.tenantSchema).join(","));
  for (const id of many) await finish(id);

  // Scheduling: a job not yet due is not claimable.
  const later = await enqueue({ type: "b1-later", tenantSchema: SA, runAfter: new Date(Date.now() + 3600_000) });
  check("a job with run_after in the future is not claimed", (await claim("w1")) === null);
  await getPool().query("DELETE FROM control.job_queue WHERE id = $1", [later]);

  // =============================================================================================
  console.log("\n=== 6b. the runtime (D270): two runners race one due job, a future job waits, an unknown type fails, the reaper unsticks, cancel cancels ===");
  {
    const row = async (id) => (await getPool().query("SELECT status, attempts, locked_by, last_error FROM control.job_queue WHERE id = $1", [id])).rows[0];
    /** @type {string[]} */
    const seen = [];
    const handlers = {
      "b1-runner-probe": async (job, client) => {
        seen.push(`${job.id}@${(await client.query("SELECT current_schema() AS s")).rows[0].s}`);
      },
    };
    const quiet = () => {};
    const r1 = createJobRunner({ handlers, workerId: "r1", log: quiet, stuckAfterMs: 60_000 });
    const r2 = createJobRunner({ handlers, workerId: "r2", log: quiet, stuckAfterMs: 60_000 });

    // Exit criterion 1 and 2: a due job runs exactly once under two racing runners; a future job waits.
    const due = await enqueue({ type: "b1-runner-probe", tenantSchema: SB, runAfter: new Date(Date.now() - 1000) });
    const future = await enqueue({ type: "b1-runner-probe", tenantSchema: SB, runAfter: new Date(Date.now() + 3600_000) });
    await Promise.all([r1.tick(), r2.tick()]);
    check("a job with run_after in the past ran EXACTLY ONCE with two runners racing", seen.filter((s) => s.startsWith(`${due}@`)).length === 1, seen.join(","));
    check("…inside its own tenant, on a client the runner got from withTenant", seen.includes(`${due}@${SB}`), seen.join(","));
    check("…and is done", (await row(due)).status === "done");
    check("the job with run_after in the future did NOT run early and is still queued", !seen.some((s) => s.startsWith(`${future}@`)) && (await row(future)).status === "queued");
    check("the two runners' stats add up to one job run", r1.stats.ran + r2.stats.ran === 1, `${r1.stats.ran}+${r2.stats.ran}`);

    // A type this process has no handler for is NOT claimed: it stays queued for a process that
    // knows it, and the runner reports it. (A running dev hub with an empty registry therefore
    // cannot touch this suite's jobs - which is also why this suite can run beside one.)
    const orphan = await enqueue({ type: "b1-no-such-handler", tenantSchema: SA });
    const r1said = [];
    const r1v = createJobRunner({ handlers, workerId: "r1v", log: (l) => r1said.push(l), stuckAfterMs: 60_000 });
    await r1v.tick();
    const orphanRow = await row(orphan);
    check("a due job of a type with no registered handler is LEFT QUEUED - not claimed, not failed, attempts still 0",
      orphanRow.status === "queued" && orphanRow.attempts === 0 && orphanRow.locked_by === null, JSON.stringify(orphanRow));
    check("…and the runner reported it, by type, as waiting for a hub that knows it", r1v.stats.waiting === 1 && r1said.some((l) => /1 due job\(s\) of 1 type\(s\).*b1-no-such-handler \(1\)/.test(l)), r1said.join(" | "));
    const empty = createJobRunner({ handlers: {}, workerId: "empty", log: quiet, stuckAfterMs: 60_000 });
    await empty.tick();
    check("a runner with an EMPTY registry claims nothing at all (the hub as shipped today)", empty.stats.ran === 0 && (await row(orphan)).status === "queued" && (await row(orphan)).attempts === 0);
    await getPool().query("DELETE FROM control.job_queue WHERE id = $1", [orphan]);

    // Exit criterion 3: a process that dies mid-job leaves the row running; the reaper returns it.
    const stuck = await enqueue({ type: "b1-runner-probe", tenantSchema: SA });
    const claimed = await claim("a-worker-that-then-died");
    check("claim() leaves the job running with attempts 1", claimed?.id === stuck && (await row(stuck)).status === "running" && (await row(stuck)).attempts === 1);
    const notYet = await reapStuck({ olderThanMs: 600_000, maxAttempts: 5 });
    check("a job running for less than the timeout is NOT reaped", !notYet.requeued.includes(stuck) && !notYet.failed.includes(stuck) && (await row(stuck)).status === "running");
    const reaped = await reapStuck({ olderThanMs: 0, maxAttempts: 5 });
    const afterReap = await row(stuck);
    check("past the timeout the reaper returns it to queued, keeps the attempt count, clears the lock and says why",
      reaped.requeued.includes(stuck) && afterReap.status === "queued" && afterReap.attempts === 1 && afterReap.locked_by === null && /reaped: still running after 0 ms .*attempt 1 of 5/.test(afterReap.last_error), JSON.stringify(afterReap));
    await r1.tick();
    const rerun = await row(stuck);
    check("the next tick runs it (attempt 2) and it is done — at-least-once, which is why handlers must be idempotent",
      rerun.status === "done" && rerun.attempts === 2 && seen.includes(`${stuck}@${SA}`), JSON.stringify(rerun));

    // The retry cap: reaped on its fifth claim -> failed, not requeued forever.
    const doomed = await enqueue({ type: "b1-runner-probe", tenantSchema: SA });
    await getPool().query("UPDATE control.job_queue SET attempts = 4 WHERE id = $1", [doomed]);
    check("(fixture) the fifth claim takes it", (await claim("dies-again"))?.id === doomed && (await row(doomed)).attempts === 5);
    const capped = await reapStuck({ olderThanMs: 0, maxAttempts: 5 });
    const doomedRow = await row(doomed);
    check("a job reaped on its 5th of 5 attempts is FAILED, and last_error says which attempt",
      capped.failed.includes(doomed) && doomedRow.status === "failed" && /attempt 5 of 5/.test(doomedRow.last_error), JSON.stringify(doomedRow));
    check("…and a failed row is not claimable", (await claim("w")) === null);

    // Exit criterion 4: cancel. Queued -> cancelled; done and running are left alone; the CHECK
    // accepts the new status and still refuses an unknown one.
    const ref = randomUUID();
    const pending = await enqueue({ type: "b1-autoclose-probe", tenantSchema: SA, refId: ref });
    const cancelled = await cancelJobsFor("b1-autoclose-probe", ref);
    check("cancelJobsFor(type, refId) cancels the queued job and returns its id", cancelled.length === 1 && cancelled[0] === pending && (await row(pending)).status === "cancelled", JSON.stringify(cancelled));
    check("(that UPDATE succeeding is the proof) the status CHECK accepts 'cancelled' after control/007", (await row(pending)).status === "cancelled");
    await refuses("and still refuses a status it does not know",
      () => getPool().query("UPDATE control.job_queue SET status = 'bogus' WHERE id = $1", [pending]), /job_status_known/);
    check("a cancelled job is not claimed", (await claim("w")) === null);
    check("cancelling again is a no-op that returns []", (await cancelJobsFor("b1-autoclose-probe", ref)).length === 0);
    const doneRef = randomUUID();
    const finished = await enqueue({ type: "b1-runner-probe", tenantSchema: SA, refId: doneRef });
    await r1.tick();
    check("(fixture) it ran", (await row(finished)).status === "done");
    check("cancelJobsFor is a no-op on a DONE job and leaves it done", (await cancelJobsFor("b1-runner-probe", doneRef)).length === 0 && (await row(finished)).status === "done");
    const runningRef = randomUUID();
    const inFlight = await enqueue({ type: "b1-runner-probe", tenantSchema: SA, refId: runningRef });
    check("(fixture) claimed", (await claim("busy"))?.id === inFlight);
    check("a RUNNING job is not cancelled — cancel wins only before the claim; the handler's own precondition check is the guarantee (at-least-once)",
      (await cancelJobsFor("b1-runner-probe", runningRef)).length === 0 && (await row(inFlight)).status === "running");
    await finish(inFlight);

    // A runner whose primitives cannot reach the database does not throw out of tick(); it logs once.
    const said = [];
    const down = createJobRunner({ handlers, log: (l) => said.push(l), primitives: {
      reapStuck: async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:5999"); },
      waitingOfOtherTypes: async () => [],
      runOne: async () => { throw new Error("should not be reached"); },
    } });
    await down.tick(); await down.tick();
    check("with the database down, tick() resolves, says so ONCE, and keeps counting ticks", said.filter((l) => /unreachable/.test(l)).length === 1 && down.stats.ticks === 2 && down.stats.outages === 1, said.join(" | "));

    await getPool().query("DELETE FROM control.job_queue WHERE id = $1", [future]);
  }

  // =============================================================================================
  console.log("\n=== 7. the extension arrangement actually works from a tenant ===");
  const vec = await withTenant(SA, async (c) =>
    (await c.query("SELECT '[1,2,3]'::vector AS v")).rows[0].v);
  check("a tenant transaction resolves `vector` UNQUALIFIED, so tenant DDL needs no extension migration (D59a, D143)",
    String(vec) === "[1,2,3]", String(vec));
  const dist = await withTenant(SA, async (c) =>
    (await c.query("SELECT '[1,0]'::vector <-> '[0,1]'::vector AS d")).rows[0].d);
  check("and its operators resolve too", Number(dist) > 1.41 && Number(dist) < 1.42, String(dist));

  // =============================================================================================
  console.log("\n=== 8. an edited migration is an error, not a silent skip ===");
  // Build the fixture in memory rather than on disk: apply a fake version, then ask the runner to
  // reconcile a different checksum for it.
  await getPool().query(
    "INSERT INTO control.schema_migrations (version, checksum) VALUES ('001-control-plane', 'deadbeefdeadbeef') ON CONFLICT (version) DO UPDATE SET checksum = 'deadbeefdeadbeef'",
  );
  await refuses("the runner refuses when an applied migration's checksum has changed",
    () => migrate(), /must not be edited/);
  // Put it back so the rest of the file, and the next run, are sane.
  const real = readMigrations("control").find((m) => m.version === "001-control-plane");
  await getPool().query("UPDATE control.schema_migrations SET checksum = $1 WHERE version = $2", [real.checksum, real.version]);
  check("checksums are line-ending independent", real.checksum === readMigrations("control")[0].checksum);

  // =============================================================================================
  console.log("\n=== 9. the live half of the design rules ===");
  // The SOURCE-level rules (no payload column declared, one door to a tenant, B0 stayed
  // stateless, the pin, schema-name derivation) are test/db-static.test.mjs and run in `npm test`.
  // What can only be checked against a live server is what the DDL actually produced.
  const jobCols = (await getPool().query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'control' AND table_name = 'job_queue'",
  )).rows;
  check("control.job_queue as BUILT has no payload column and no jsonb - it carries references, not data",
    !jobCols.some((c) => /payload|body|args|^data$/.test(c.column_name)) && !jobCols.some((c) => c.data_type === "jsonb"),
    jobCols.map((c) => `${c.column_name}:${c.data_type}`).join(", "));
  check("and it does carry tenant_schema and ref_id",
    jobCols.some((c) => c.column_name === "tenant_schema") && jobCols.some((c) => c.column_name === "ref_id"));

  const { rows: fks } = await getPool().query(`
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'control.job_queue'::regclass AND contype = 'f'`);
  check("the tenant_schema foreign key exists in the built schema, so the worker's assertion has something real to assert against",
    fks.length >= 1, JSON.stringify(fks));

  await withControl(async (c) => {
    const { rows } = await c.query("SHOW search_path");
    check("withControl pins search_path to extensions only, so an unqualified control query is an error",
      rows[0].search_path === "extensions", rows[0].search_path);
    await refuses("an unqualified control query therefore fails rather than resolving somewhere shared",
      () => c.query("SELECT 1 FROM tenants"), /does not exist/);
  });
  check("assertTenantSchema returns the name it proved", (await assertTenantSchema(SA)) === SA);

  // The four CHECK constraints that encode decisions rather than hygiene.
  const constraintNames = (await getPool().query(`
    SELECT conname FROM pg_constraint
     WHERE connamespace = 'control'::regnamespace AND contype = 'c'`)).rows.map((r) => r.conname);
  check("a transcript-level vendor grant cannot exist without a window (D153)",
    constraintNames.includes("vendor_transcripts_need_a_window"), constraintNames.join(","));
  check("an admin user must carry some credential - local or federated (D155, D159)",
    constraintNames.includes("admin_has_a_credential"));
  await refuses("and the database enforces it",
    () => getPool().query("INSERT INTO control.admin_users (email) VALUES ('nobody@example.com')"),
    /admin_has_a_credential/);
  await refuses("a transcript grant with no window is refused by the database", async () => {
    await getPool().query(`
      INSERT INTO control.admin_users (email, password_hash) VALUES ('vendor@example.com', 'x')
      ON CONFLICT DO NOTHING`);
    const { rows: u } = await getPool().query("SELECT id FROM control.admin_users WHERE email = 'vendor@example.com'");
    const { rows: t } = await getPool().query("SELECT id FROM control.tenants WHERE slug = $1", [A]);
    await getPool().query(
      `INSERT INTO control.vendor_access_grants (tenant_id, granted_to, level, expires_at)
       VALUES ($1, $2, 'transcripts', now() + interval '1 day')`,
      [t[0].id, u[0].id],
    );
  }, /vendor_transcripts_need_a_window/);
  await getPool().query("DELETE FROM control.admin_users WHERE email = 'vendor@example.com'");

  // ---- teardown -----------------------------------------------------------------------------
  for (const slug of [A, B, C]) await dropTenantForTests(slug);
  const left = (await listTenants()).filter((t) => t.slug.startsWith("b1-test-"));
  check("teardown removed the test tenants and their schemas", left.length === 0, JSON.stringify(left));
}

main()
  .catch((err) => { fail++; console.error(`\nUNCAUGHT: ${err.stack}`); })
  .finally(async () => {
    await closePool();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  });
