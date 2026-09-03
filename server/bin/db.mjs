#!/usr/bin/env node
// @ts-check
/**
 * B1 database CLI.
 *
 *   node bin/db.mjs migrate                 apply pending control + tenant migrations
 *   node bin/db.mjs create-tenant <slug>    row, schema, every tenant migration
 *   node bin/db.mjs tenants                 list
 *   node bin/db.mjs status                  what is applied where
 *
 * Connects to MATIC_DB_URL, default postgres://matic:matic@127.0.0.1:5433/matic - the
 * docker-compose.yml database. There is no production entry point here on purpose: a migration
 * against a real control plane is a release step with a change record, not a script someone runs
 * from a laptop.
 */
import { closePool, getPool } from "../src/db/pool.js";
import { migrate, readMigrations, tenantSchemas } from "../src/db/migrate.js";
import { createTenant, listTenants } from "../src/db/tenants.js";

const log = (m) => process.stdout.write(m + "\n");

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  switch (cmd) {
    case "migrate": {
      log("migrating");
      await migrate({ log });
      break;
    }

    case "create-tenant": {
      const slug = args[0];
      if (!slug) throw new Error("usage: create-tenant <slug>");
      log(`creating tenant ${slug}`);
      const t = await createTenant(slug, { log });
      log(`  ${t.slug} -> ${t.schemaName}  (${t.applied.length} migration(s) applied)`);
      break;
    }

    case "tenants": {
      const ts = await listTenants();
      if (ts.length === 0) log("  no tenants");
      for (const t of ts) log(`  ${t.slug.padEnd(20)} ${t.schemaName.padEnd(24)} ${t.status}`);
      break;
    }

    case "status": {
      const control = await getPool().query(
        "SELECT version FROM control.schema_migrations ORDER BY version",
      ).catch(() => ({ rows: [] }));
      log(`  control (${readMigrations("control").length} on disk): ${control.rows.map((r) => r.version).join(", ") || "none applied"}`);
      const onDisk = readMigrations("tenant").length;
      for (const schema of await tenantSchemas()) {
        const { rows } = await getPool().query(`SELECT version FROM ${schema}.schema_migrations ORDER BY version`);
        log(`  ${schema} (${onDisk} on disk): ${rows.map((r) => r.version).join(", ") || "none applied"}`);
      }
      break;
    }

    default:
      log("usage: node bin/db.mjs migrate | create-tenant <slug> | tenants | status");
      process.exitCode = 2;
  }
}

main()
  .catch((err) => {
    process.stderr.write(`\nFAILED: ${err.message}\n`);
    if (/ECONNREFUSED|connect|timeout/i.test(err.message)) {
      process.stderr.write("Is the development database up?  docker compose up -d   (from server/)\n");
    }
    process.exitCode = 1;
  })
  .finally(closePool);
