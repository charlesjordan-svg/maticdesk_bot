#!/usr/bin/env node
// @ts-check
/**
 * Admin-console account CLI. B2 (D222).
 *
 *   node bin/admin.mjs create-user <tenant-slug> <email> --role <role> [--password <p>]
 *   node bin/admin.mjs users [<tenant-slug>]
 *   node bin/admin.mjs roles
 *   node bin/admin.mjs disable <tenant-slug> <email>
 *   node bin/admin.mjs enable  <tenant-slug> <email>
 *   node bin/admin.mjs audit [<tenant-slug>] [--limit N]
 *   node bin/admin.mjs totp <base32-secret>          print the current code (smoke check)
 *
 * WHY THE FIRST ADMIN COMES FROM HERE AND NOT FROM A SIGN-UP PAGE. There is no account creation
 * in the console (src/admin/pages/settings.js says why), and a fresh database has no admin at
 * all, so somebody with access to the machine has to make one. Access to the machine is the
 * credential this step rests on, which is the same thing `bin/db.mjs create-tenant` rests on.
 *
 * WHAT `create-user` PRINTS, ONCE. The initial password (generated unless --password) and the
 * authenticator secret as base32 plus an otpauth:// URI. Neither is stored in the clear and
 * neither can be shown again — a lost secret means a new user. Paste the URI into an
 * authenticator app, or type the base32 secret into one by hand. This build ships no QR encoder.
 *
 * TOTP IS NOT OPTIONAL. There is no flag to create a user without one, because D156 says TOTP from
 * day one and a flag to skip it would be used on the day it mattered.
 *
 * Connects to MATIC_DB_URL, default the docker-compose.yml database. No production entry point,
 * same as bin/db.mjs.
 */
import { closePool } from "../src/db/pool.js";
import { base32Decode, base32Encode, otpauthUri, totpCode } from "../src/admin/auth.js";
import { createAdminUser, findAdminByEmail, listAdminUsers, listRoles, setAdminStatus } from "../src/admin/users.js";
import { revokeUserSessions } from "../src/admin/session.js";
import { audit, recentAudit } from "../src/admin/audit.js";
import { tenantBySlug } from "../src/admin/queries.js";
import { listTenants } from "../src/db/tenants.js";

const argv = process.argv.slice(2);
const cmd = argv[0];

function flag(name, fallback = null) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}
const positional = argv.filter((a, i) => i > 0 && !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));

const out = (s = "") => process.stdout.write(s + "\n");
function die(message) {
  process.stderr.write(message + "\n");
  process.exitCode = 1;
}

/** Resolve a slug, or the only tenant when there is exactly one and none was given. */
async function resolveTenant(slug) {
  if (slug) {
    const t = await tenantBySlug(slug);
    if (!t) throw new Error(`no tenant ${JSON.stringify(slug)}. See: node bin/db.mjs tenants`);
    return t;
  }
  const all = (await listTenants()).filter((t) => t.status === "active");
  if (all.length === 1) return tenantBySlug(all[0].slug);
  throw new Error(all.length === 0
    ? "no tenants exist. Create one: node bin/db.mjs create-tenant <slug>"
    : `${all.length} tenants exist; name one: ${all.map((t) => t.slug).join(", ")}`);
}

const USAGE = [
  "usage:",
  "  node bin/admin.mjs create-user <tenant-slug> <email> --role <role> [--password <p>]",
  "  node bin/admin.mjs users [<tenant-slug>]",
  "  node bin/admin.mjs roles",
  "  node bin/admin.mjs disable <tenant-slug> <email>",
  "  node bin/admin.mjs enable  <tenant-slug> <email>",
  "  node bin/admin.mjs audit [<tenant-slug>] [--limit N]",
  "  node bin/admin.mjs totp <base32-secret>",
].join("\n");

async function main() {
  switch (cmd) {
    case "create-user": {
      const [slug, email] = positional;
      const roleName = flag("role");
      if (!slug || !email || !roleName) throw new Error("usage: create-user <tenant-slug> <email> --role <role>   (roles: node bin/admin.mjs roles)");
      const tenant = await resolveTenant(slug);
      const made = await createAdminUser({ tenantId: tenant.id, email, roleName, password: flag("password") ?? undefined });
      await audit({ tenantId: tenant.id, action: "admin.created", subject: made.email, detail: { role: roleName, by: "bin/admin.mjs" } });
      out("");
      out(`  created ${made.email} in ${tenant.slug} with role ${made.role}`);
      out("");
      out("  HAND THESE TO THE PERSON ONCE. They are not stored in the clear and cannot be shown again.");
      out("");
      out(`  initial password     ${made.password}`);
      out(`  authenticator secret ${base32Encode(made.totpSecret)}`);
      out(`  otpauth URI          ${otpauthUri({ secret: made.totpSecret, email: made.email })}`);
      out("");
      out(`  Sign in at http://127.0.0.1:${process.env.MATIC_HUB_PORT ?? 8787}/admin/login with the email, the password and the six-digit code.`);
      out("  Loopback only: the hub refuses any other peer.");
      out("");
      break;
    }

    case "users": {
      const tenant = await resolveTenant(positional[0]);
      const users = await listAdminUsers(tenant.id);
      if (!users.length) return void out(`  no admin users in ${tenant.slug}. Create one: node bin/admin.mjs create-user ${tenant.slug} <email> --role tenant_owner`);
      for (const u of users) {
        out(`  ${u.email.padEnd(36)} ${u.status.padEnd(9)} ${(u.roles.join(",") || "no-roles").padEnd(24)} ${u.hasTotp ? "totp" : "NO-TOTP"}  last login ${u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 16) : "never"}`);
      }
      out(`\n  ${users.length} admin user(s) in ${tenant.slug}. Local accounts (D155); every one has an authenticator or cannot sign in (D156).`);
      break;
    }

    case "roles": {
      for (const r of await listRoles()) {
        out(`  ${r.name.padEnd(14)} ${r.scope.padEnd(7)} ${r.permissions.length ? r.permissions.join(" ") : "(no permissions — vendor access is a grant, D153)"}`);
      }
      break;
    }

    case "disable":
    case "enable": {
      const [slug, email] = positional;
      if (!slug || !email) throw new Error(`usage: ${cmd} <tenant-slug> <email>`);
      const tenant = await resolveTenant(slug);
      const u = await findAdminByEmail(tenant.id, email);
      if (!u) throw new Error(`no admin ${email} in ${tenant.slug}`);
      const status = cmd === "disable" ? "disabled" : "active";
      await setAdminStatus(u.id, status);
      const revoked = status === "disabled" ? await revokeUserSessions(u.id) : 0;
      await audit({ tenantId: tenant.id, action: `admin.${status}`, subject: u.email, detail: { by: "bin/admin.mjs", sessionsRevoked: revoked } });
      out(`  ${u.email} -> ${status}${revoked ? ` (${revoked} live session(s) revoked)` : ""}`);
      break;
    }

    case "audit": {
      const tenant = await resolveTenant(positional[0]);
      const rows = await recentAudit({ tenantId: tenant.id, limit: Number(flag("limit", "50")) });
      if (!rows.length) return void out(`  no audit rows for ${tenant.slug}`);
      for (const r of rows) {
        out(`  ${r.at.toISOString().slice(0, 19).replace("T", " ")}  ${(r.email ?? "-").padEnd(30)} ${r.action.padEnd(22)} ${(r.subject ?? "").padEnd(24)} ${r.detail ? JSON.stringify(r.detail) : ""}`);
      }
      out(`\n  ${rows.length} row(s), newest first. Every console action, refusal and record view (D156).`);
      break;
    }

    case "totp": {
      const secret = positional[0];
      if (!secret) throw new Error("usage: totp <base32-secret>");
      out(`  ${totpCode(base32Decode(secret))}   (valid for the current 30-second step)`);
      break;
    }

    default:
      out(USAGE);
      process.exitCode = 2;
  }
}

main()
  .catch((err) => {
    die(`\nFAILED: ${err.message}`);
    if (/ECONNREFUSED|connect|timeout/i.test(err.message)) die("Is the development database up?  npm.cmd run db:up   (from server/)");
    if (/does not exist/i.test(err.message)) die("Is the schema migrated?  npm.cmd run migrate   (from server/)");
  })
  .finally(closePool);
