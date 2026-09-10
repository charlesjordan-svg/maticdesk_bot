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
 * SINCE 2026-09-09 THERE IS A SECOND READER: the admin console's Tickets page (src/admin/pages/
 * tickets.js). Both read through src/tickets/query.js — the same functions, the same SQL (D224).
 * When the console is doubted this command is what gets trusted, and the comparison only means
 * something if the two cannot disagree about the rows. So this file holds NO SQL of its own; if
 * you need a new query, add it to query.js and both readers get it.
 *
 * Tenant: MATIC_TICKET_TENANT, or the single active tenant when there is exactly one — the same
 * resolution the hub itself uses (src/tickets/file.js), so the CLI and the route cannot disagree
 * about where tickets live.
 *
 * Connects to MATIC_DB_URL, default the docker-compose.yml database. As with bin/db.mjs and
 * bin/kb.mjs there is no production entry point.
 */
import { closePool } from "../src/db/pool.js";
import { resolveTicketTenant } from "../src/tickets/file.js";
import { TICKET_STATES, countTicketsByState, getTicket, listReporters, listTickets, setTicketState } from "../src/tickets/query.js";

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
      if (state && !TICKET_STATES.includes(state)) die(`--state must be one of: ${TICKET_STATES.join(", ")}`);
      else {
        const rows = await listTickets(tenant, { state, limit: Number(flag("limit", "50")) || 50 });
        if (!rows.length) {
          console.log(state ? `  no tickets in state "${state}"` : "  no tickets");
        } else {
          for (const r of rows) {
            console.log(`  ${r.reference}  ${r.state.padEnd(8)} ${(r.suggestedOwner ?? "unrouted").padEnd(17)} ${r.reporter ?? "unknown"} (${r.location ?? "no location"})  ${r.createdAt.toISOString().slice(0, 16).replace("T", " ")}`);
          }
          const counts = await countTicketsByState(tenant);
          console.log(`\n  ${rows.length} ticket(s) shown in ${tenant}; ${TICKET_STATES.map((s) => `${counts[s]} ${s}`).join(", ")}.`);
          console.log("  NOBODY HAS BEEN EMAILED — this build has no outbound email (D86).");
        }
      }
    } else if (cmd === "show") {
      const ref = positional[0];
      if (!ref) die("usage: node bin/tickets.mjs show <reference>");
      else {
        const t = await getTicket(tenant, ref);
        if (!t) die(`no ticket ${ref} in ${tenant}`);
        else {
          console.log(`  ${t.reference}   ${t.state}   ${t.createdAt.toISOString()}`);
          console.log(`  category        ${t.category}`);
          console.log(`  suggested owner ${t.suggestedOwner ?? "(none — the model would not guess, and that is allowed)"}`);
          console.log(`  machine         ${t.machineName ?? "-"}`);
          console.log("");
          console.log(`  reporter        ${t.reporter ?? "-"}`);
          console.log(`  location        ${t.location ?? "-"}`);
          console.log(`  contact         ${t.contactId ?? "-"}`);
          // The one caveat that has to travel with a reporter's name on this build.
          console.log(`  identity        ${t.osUsername ?? "-"} (${t.profileSource}) — NOT AUTHENTICATED. No device auth (D61/D132), no attested logon SID (D148).`);
          console.log("");
          console.log("  what the user said:");
          console.log(`    ${t.description}`);
          console.log("  case note for you:");
          console.log(`    ${t.summary}`);
          console.log("  already checked:");
          console.log(`    ${t.whatWasChecked ?? "-"}`);
        }
      }
    } else if (cmd === "state") {
      const [ref, next] = positional;
      if (!ref || !TICKET_STATES.includes(next)) die(`usage: node bin/tickets.mjs state <reference> <${TICKET_STATES.join("|")}>`);
      else {
        // Any state to any state: this is the operator's correction tool. The console offers only
        // NEXT_STATES; the CLI does not, on purpose.
        const moved = await setTicketState(tenant, ref, next);
        if (!moved) die(`no ticket ${ref} in ${tenant}`);
        else console.log(`  ${ref}: ${moved.from} -> ${moved.to}`);
      }
    } else if (cmd === "users") {
      const rows = await listReporters(tenant);
      if (!rows.length) console.log("  no users");
      else {
        for (const r of rows) {
          console.log(`  ${(r.osUsername ?? "-").padEnd(16)} ${(r.name ?? "").padEnd(24)} ${(r.location ?? "-").padEnd(20)} ${r.contactId ?? "-"}  [${r.profileSource}, ${r.tickets} ticket(s)]`);
        }
        console.log(`\n  ${rows.length} user(s) in ${tenant}. Every profile here is SELF-ASSERTED unless it says otherwise.`);
      }
    } else {
      die(`unknown command ${JSON.stringify(cmd)}\nusage: node bin/tickets.mjs list | show <ref> | state <ref> <state> | users`);
    }
  } finally {
    await closePool();
  }
}
