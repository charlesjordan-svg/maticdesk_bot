#!/usr/bin/env node
// @ts-check
/**
 * Device enrollment CLI. B3.
 *
 *   node bin/devices.mjs create-secret <tenant-slug> [--ttl-days N]     mint a secret (default 30d)
 *   node bin/devices.mjs secrets       <tenant-slug>                    list them (never the plaintext)
 *   node bin/devices.mjs revoke-secret <tenant-slug> <secret-id>
 *   node bin/devices.mjs auto-approve  <tenant-slug> [on|off]           show, or set, D80's toggle
 *   node bin/devices.mjs pending       <tenant-slug>                    the queue
 *   node bin/devices.mjs approve       <tenant-slug> <request-id>
 *   node bin/devices.mjs reject        <tenant-slug> <request-id>
 *   node bin/devices.mjs list          <tenant-slug>                    every device
 *   node bin/devices.mjs revoke        <tenant-slug> <device-id...>     bulk, by batch (D83a)
 *   node bin/devices.mjs enroll        <tenant-slug> <device-key-id> <secret> [--mode standalone|joined]
 *
 * `enroll` calls the SAME `submitEnrollment()` the console and `POST /v1/enroll` call — the D224
 * argument one layer over: when a browser or a real device is doubted, this command is what gets
 * trusted, and that only proves something if all three cannot disagree about what enrollment is.
 * It exists to simulate a device without one, and to unblock a demo or a support call where an
 * admin needs a device enrolled from a terminal rather than waiting on the endpoint to ask.
 *
 * Every action here is audited with `by: "bin/devices.mjs"`, the same convention `bin/admin.mjs`
 * and `bin/tickets.mjs` use, and with no admin user attached (a CLI run has no admin session) —
 * `decided_by` stays NULL for a CLI approve/reject, exactly as it would for a script.
 *
 * Connects to MATIC_DB_URL, default the docker-compose.yml database. No production entry point,
 * same as bin/db.mjs and bin/admin.mjs.
 */
import { closePool } from "../src/db/pool.js";
import { tenantBySlug, listTenants } from "../src/db/tenants.js";
import { audit } from "../src/admin/audit.js";
import {
  createEnrollmentSecret, listEnrollmentSecrets, revokeEnrollmentSecret, autoApproveSetting,
  setAutoApprove, listPendingRequests, approveEnrollment, rejectEnrollment, listDevices,
  revokeDevices, submitEnrollment,
} from "../src/devices/enrollment.js";

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

/** Resolve a slug, or the only active tenant when there is exactly one and none was given. */
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
  "  node bin/devices.mjs create-secret <tenant-slug> [--ttl-days N]",
  "  node bin/devices.mjs secrets       <tenant-slug>",
  "  node bin/devices.mjs revoke-secret <tenant-slug> <secret-id>",
  "  node bin/devices.mjs auto-approve  <tenant-slug> [on|off]",
  "  node bin/devices.mjs pending       <tenant-slug>",
  "  node bin/devices.mjs approve       <tenant-slug> <request-id>",
  "  node bin/devices.mjs reject        <tenant-slug> <request-id>",
  "  node bin/devices.mjs list          <tenant-slug>",
  "  node bin/devices.mjs revoke        <tenant-slug> <device-id...>",
  "  node bin/devices.mjs enroll        <tenant-slug> <device-key-id> <secret> [--mode standalone|joined]",
].join("\n");

async function main() {
  switch (cmd) {
    case "create-secret": {
      const tenant = await resolveTenant(positional[0]);
      const ttlDays = Math.min(Math.max(Number(flag("ttl-days", "30")) || 30, 1), 365);
      const s = await createEnrollmentSecret({ tenantId: tenant.id, ttlDays });
      await audit({ tenantId: tenant.id, action: "device.secret.create", subject: s.id, detail: { by: "bin/devices.mjs", ttlDays, expiresAt: s.expiresAt } });
      out("");
      out(`  minted for ${tenant.slug}, expires ${s.expiresAt.toISOString().slice(0, 10)}`);
      out("");
      out("  HAND THIS TO WHOEVER CONFIGURES THE DEVICE, ONCE. It is not stored in the clear and cannot be shown again.");
      out("");
      out(`  secret  ${s.secret}`);
      out("");
      break;
    }

    case "secrets": {
      const tenant = await resolveTenant(positional[0]);
      const rows = await listEnrollmentSecrets({ tenantId: tenant.id });
      if (!rows.length) return void out(`  no enrollment secret has ever been minted for ${tenant.slug}. No device can enroll: node bin/devices.mjs create-secret ${tenant.slug}`);
      for (const s of rows) {
        const state = s.revokedAt ? "revoked" : s.live ? "live" : "expired";
        out(`  ${s.id}  issued ${s.issuedAt.toISOString().slice(0, 10)}  expires ${s.expiresAt.toISOString().slice(0, 10)}  ${state}`);
      }
      break;
    }

    case "revoke-secret": {
      const tenant = await resolveTenant(positional[0]);
      const id = positional[1];
      if (!id) throw new Error("usage: revoke-secret <tenant-slug> <secret-id>");
      const ok = await revokeEnrollmentSecret({ tenantId: tenant.id, id });
      await audit({ tenantId: tenant.id, action: "device.secret.revoke", subject: id, detail: { by: "bin/devices.mjs", revoked: ok } });
      out(ok ? `  revoked ${id}` : `  ${id} was already revoked, or does not belong to ${tenant.slug}`);
      break;
    }

    case "auto-approve": {
      const tenant = await resolveTenant(positional[0]);
      const want = positional[1];
      if (want !== undefined) {
        if (want !== "on" && want !== "off") throw new Error('usage: auto-approve <tenant-slug> [on|off]');
        await setAutoApprove({ tenantId: tenant.id, enabled: want === "on" });
        await audit({ tenantId: tenant.id, action: "device.auto_approve.set", detail: { by: "bin/devices.mjs", enabled: want === "on" } });
      }
      out(`  auto-approve for ${tenant.slug}: ${(await autoApproveSetting({ tenantId: tenant.id })) ? "on" : "off"}`);
      break;
    }

    case "pending": {
      const tenant = await resolveTenant(positional[0]);
      const rows = await listPendingRequests({ tenantId: tenant.id });
      if (!rows.length) return void out(`  no requests are waiting for ${tenant.slug}`);
      for (const r of rows) out(`  ${r.id}  ${r.deviceKeyId.padEnd(40)}  requested ${r.requestedAt.toISOString().slice(0, 19).replace("T", " ")}`);
      out(`\n  ${rows.length} pending. Approve: node bin/devices.mjs approve ${tenant.slug} <request-id>`);
      break;
    }

    case "approve":
    case "reject": {
      const tenant = await resolveTenant(positional[0]);
      const requestId = positional[1];
      if (!requestId) throw new Error(`usage: ${cmd} <tenant-slug> <request-id>`);
      const fn = cmd === "approve" ? approveEnrollment : rejectEnrollment;
      const r = await fn({ tenantId: tenant.id, requestId, decidedBy: null });
      if (!r) throw new Error(`no PENDING request ${requestId} in ${tenant.slug} — it may already be decided`);
      await audit({ tenantId: tenant.id, action: `device.enroll.${cmd}`, subject: r.deviceKeyId, detail: { by: "bin/devices.mjs", requestId, deviceId: r.deviceId } });
      out(`  ${cmd === "approve" ? "approved" : "rejected"} ${r.deviceKeyId}`);
      break;
    }

    case "list": {
      const tenant = await resolveTenant(positional[0]);
      const rows = await listDevices({ tenantId: tenant.id });
      if (!rows.length) return void out(`  no device has enrolled in ${tenant.slug} yet`);
      for (const d of rows) {
        out(`  ${d.id}  ${d.deviceKeyId.padEnd(40)}  ${d.mode.padEnd(11)} ${d.status.padEnd(8)}  last seen ${d.lastSeenAt ? d.lastSeenAt.toISOString().slice(0, 19).replace("T", " ") : "never"}`);
      }
      out(`\n  ${rows.length} device(s) in ${tenant.slug}.`);
      break;
    }

    case "revoke": {
      const tenant = await resolveTenant(positional[0]);
      const ids = positional.slice(1);
      if (!ids.length) throw new Error("usage: revoke <tenant-slug> <device-id...>");
      const n = await revokeDevices({ tenantId: tenant.id, deviceIds: ids });
      await audit({ tenantId: tenant.id, action: "device.revoke", detail: { by: "bin/devices.mjs", count: n, deviceIds: ids } });
      out(`  revoked ${n} of ${ids.length} requested`);
      break;
    }

    case "enroll": {
      const tenant = await resolveTenant(positional[0]);
      const [, deviceKeyId, secret] = positional;
      if (!deviceKeyId || !secret) throw new Error("usage: enroll <tenant-slug> <device-key-id> <secret> [--mode standalone|joined]");
      const mode = flag("mode", "standalone");
      const r = await submitEnrollment({ tenantId: tenant.id, deviceKeyId, secret, mode, log: (m) => out(`  ${m}`) });
      out(`  outcome: ${r.outcome}`);
      if (r.outcome === "refused" || r.outcome === "locked") { process.exitCode = 1; break; }
      out(`  device ${r.deviceId ?? ""}${r.requestId ? `, request ${r.requestId}` : ""}`);
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
