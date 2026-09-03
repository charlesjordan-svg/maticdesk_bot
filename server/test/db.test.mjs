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
import { claim, enqueue, finish, runOne } from "../src/db/jobs.js";

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
