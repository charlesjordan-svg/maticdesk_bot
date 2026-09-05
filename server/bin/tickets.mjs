#!/usr/bin/env node
// @ts-check
/**
 * B6-lite ticket CLI (D213).
 *
 *   node bin/tickets.mjs list [--state new|open|resolved|closed] [--limit N]
 *   node bin/tickets.mjs show <reference>          e.g. MD-1000
 *   node bin/tickets.mjs state <reference> <state>
 *   node bin/tickets.mjs users
 *
 * ===============================================================================================
 * THIS COMMAND IS THE QUEUE, AND THAT IS THE POINT OF IT EXISTING
 * ===============================================================================================
 *
 * D86 and OPEN-4 both say the ticket store without outbound email is not a queue: with the hub as
 * system of record and no ITSM there is no assignment group, no on-call rotation and no L2 queue,
 * because those came free with the ITSM. This build has no email.
 *
 * So somebody has to LOOK, and until B6 grows email this is how they look. It exists so that
 * "a ticket was filed" is a checkable claim rather than a row nobody can see without writing SQL —
 * an unreadable store and no store are the same thing to the person waiting for help, and the
 * difference between them is exactly the kind of gap this project keeps finding on screen rather
 * than in tests.
 *
 * Tenant: MATIC_TICKET_TENANT, or the single active tenant when there is exactly one — the same
 * resolution the hub itself uses (src/tickets/file.js), so the CLI and the route cannot disagree
 * about where tickets live.
 *
 * Connects to MATIC_DB_URL, default the docker-compose.yml database. As with bin/db.mjs and
 * bin/kb.mjs there is no production entry point.
 */
import { closePool } from "../src/db/pool.js";
import { withTenant } from "../src/db/tenant.js";
import { resolveTicketTenant } from "../src/tickets/file.js";

const STATES = ["new", "open", "resolved", "closed"];

const argv = process.argv.slice(2);
const cmd = argv[0] ?? "list";

/** `--flag value` out of the tail. Positional arguments are whatever is left. */
function flag(name, fallback = null) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const positional = argv.filter((a, i) => i > 0 && !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));

function die(message) {
  console.error(message);
  process.exitCode = 1;
}

const tenant = await resolveTicketTenant(console.error);
if (!tenant) {
  die("no ticket tenant. Set MATIC_TICKET_TENANT, or create one: node bin/db.mjs create-tenant <slug>");
} else {
  try {
    if (cmd === "list") {
      const state = flag("state");
      if (state && !STATES.includes(state)) die(`--state must be one of: ${STATES.join(", ")}`);
      const limit = Math.min(Number(flag("limit", "50")) || 50, 500);
      await withTenant(tenant, async (c) => {
        const { rows } = await c.query(
          `SELECT t.reference, t.state, t.category, t.suggested_owner, t.machine_name, t.created_at,
                  u.first_name, u.last_name, u.location, u.contact_id, u.os_username
             FROM tickets t LEFT JOIN users u ON u.id = t.user_id
            ${state ? "WHERE t.state = $2" : ""}
            ORDER BY t.created_at DESC LIMIT $1`,
          state ? [limit, state] : [limit],
        );
        if (!rows.length) {
          console.log(state ? `  no tickets in state "${state}"` : "  no tickets");
          return;
        }
        for (const r of rows) {
          const who = [r.first_name, r.last_name].filter(Boolean).join(" ") || r.os_username || "unknown";
          console.log(`  ${r.reference}  ${r.state.padEnd(8)} ${(r.suggested_owner ?? "unrouted").padEnd(17)} ${who} (${r.location ?? "no location"})  ${r.created_at.toISOString().slice(0, 16).replace("T", " ")}`);
        }
        console.log(`\n  ${rows.length} ticket(s) in ${tenant}. NOBODY HAS BEEN EMAILED — this build has no outbound email (D86).`);
      });
    } else if (cmd === "show") {
      const ref = positional[0];
      if (!ref) die("usage: node bin/tickets.mjs show <reference>");
      else {
        await withTenant(tenant, async (c) => {
          const { rows } = await c.query(
            `SELECT t.*, u.first_name, u.last_name, u.location, u.contact_id, u.os_username, u.profile_source
               FROM tickets t LEFT JOIN users u ON u.id = t.user_id WHERE t.reference = $1`,
            [ref],
          );
          if (!rows.length) return void die(`no ticket ${ref} in ${tenant}`);
          const t = rows[0];
          console.log(`  ${t.reference}   ${t.state}   ${t.created_at.toISOString()}`);
          console.log(`  category        ${t.category}`);
          console.log(`  suggested owner ${t.suggested_owner ?? "(none — the model would not guess, and that is allowed)"}`);
          console.log(`  machine         ${t.machine_name ?? "-"}`);
          console.log("");
          console.log(`  reporter        ${[t.first_name, t.last_name].filter(Boolean).join(" ") || "-"}`);
          console.log(`  location        ${t.location ?? "-"}`);
          console.log(`  contact         ${t.contact_id ?? "-"}`);
          // The one caveat that has to travel with a reporter's name on this build.
          console.log(`  identity        ${t.os_username ?? "-"} (${t.profile_source}) — NOT AUTHENTICATED. No device auth (D61/D132), no attested logon SID (D148).`);
          console.log("");
          console.log("  what the user said:");
          console.log(`    ${t.description}`);
          console.log("  case note for you:");
          console.log(`    ${t.summary}`);
          console.log("  already checked:");
          console.log(`    ${t.what_was_checked ?? "-"}`);
        });
      }
    } else if (cmd === "state") {
      const [ref, next] = positional;
      if (!ref || !STATES.includes(next)) die(`usage: node bin/tickets.mjs state <reference> <${STATES.join("|")}>`);
      else {
        await withTenant(tenant, async (c) => {
          const { rowCount } = await c.query(
            "UPDATE tickets SET state = $2, updated_at = now() WHERE reference = $1",
            [ref, next],
          );
          if (!rowCount) return void die(`no ticket ${ref} in ${tenant}`);
          console.log(`  ${ref} -> ${next}`);
        });
      }
    } else if (cmd === "users") {
      await withTenant(tenant, async (c) => {
        const { rows } = await c.query(
          `SELECT os_username, first_name, last_name, location, contact_id, profile_source,
                  (SELECT count(*) FROM tickets WHERE user_id = users.id) AS tickets
             FROM users ORDER BY last_name NULLS LAST, first_name NULLS LAST`,
        );
        if (!rows.length) return void console.log("  no users");
        for (const r of rows) {
          console.log(`  ${(r.os_username ?? "-").padEnd(16)} ${[r.first_name, r.last_name].filter(Boolean).join(" ").padEnd(24)} ${(r.location ?? "-").padEnd(20)} ${r.contact_id ?? "-"}  [${r.profile_source}, ${r.tickets} ticket(s)]`);
        }
        console.log(`\n  ${rows.length} user(s) in ${tenant}. Every profile here is SELF-ASSERTED unless it says otherwise.`);
      });
    } else {
      die(`unknown command ${JSON.stringify(cmd)}\nusage: node bin/tickets.mjs list | show <ref> | state <ref> <state> | users`);
    }
  } finally {
    await closePool();
  }
}
