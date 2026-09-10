#!/usr/bin/env node
// @ts-check
/**
 * Sessions and deflection CLI (D237, D239).
 *
 *   node bin/sessions.mjs list [--outcome resolved|escalated|unresolved|suppressed] [--limit N]
 *   node bin/sessions.mjs show <session-uuid>
 *   node bin/sessions.mjs deflection [--days N]
 *
 * THE SECOND READER, ON PURPOSE. The console's Metrics page computes deflection through
 * src/sessions/store.js; so does this command. When the page is doubted this is what gets trusted,
 * and that only proves something if the two cannot disagree — so there is NO SQL in this file (the
 * D224 pattern: tickets, devices, the knowledge base, and now sessions).
 *
 * Tenant: MATIC_TICKET_TENANT, or the single active tenant when there is exactly one — the same
 * resolution the hub uses for /v1/ticket and /v1/session, so the CLI and the routes cannot disagree
 * about where sessions live.
 */
import { closePool } from "../src/db/pool.js";
import { resolveTicketTenant } from "../src/tickets/file.js";
import { SESSION_OUTCOMES, deflectionOf, getSession, listSessions, outcomeCounts } from "../src/sessions/store.js";

const argv = process.argv.slice(2);
const cmd = argv[0] ?? "deflection";

function flag(name, fallback = null) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const positional = argv.filter((a, i) => i > 0 && !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));

function die(message) {
  console.error(message);
  process.exitCode = 1;
}
const pct = (x) => (x === null ? "-" : `${Math.round(x * 100)}%`);
const ts = (d) => (d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") : "-");

const tenant = await resolveTicketTenant(console.error);
if (!tenant) {
  die("no endpoint tenant. Set MATIC_TICKET_TENANT, or create one: node bin/db.mjs create-tenant <slug>");
} else {
  try {
    if (cmd === "list") {
      const outcome = flag("outcome");
      if (outcome && !SESSION_OUTCOMES.includes(outcome)) die(`--outcome must be one of: ${SESSION_OUTCOMES.join(", ")}`);
      else {
        const rows = await listSessions(tenant, { outcome, limit: Number(flag("limit", "50")) || 50 });
        if (!rows.length) console.log(outcome ? `  no ${outcome} sessions` : "  no sessions - the endpoint has not begun one against this hub");
        for (const s of rows) {
          console.log(`  ${s.id}  ${s.outcome.padEnd(10)} ${(s.category ?? "-").padEnd(22)} ${(s.machineName ?? "-").padEnd(16)} began ${ts(s.startedAt)}  ended ${ts(s.endedAt)}${s.tickets ? `  ${s.tickets} ticket(s)` : ""}${s.notFixedAt ? "  said NOT fixed" : ""}`);
        }
        if (rows.length) console.log(`\n  ${rows.length} session(s) shown in ${tenant}. Every id and machine name is the endpoint's own claim (no device auth, D61).`);
      }
    } else if (cmd === "show") {
      const id = positional[0];
      if (!id) die("usage: node bin/sessions.mjs show <session-uuid>");
      else {
        const s = await getSession(tenant, id);
        if (!s) die(`no session ${id} in ${tenant}`);
        else {
          console.log(`  ${s.id}`);
          console.log(`  outcome     ${s.outcome}${s.outcome === "unresolved" && s.notFixedAt ? " (the user said the fix did not work)" : ""}`);
          console.log(`  category    ${s.category ?? "- (unresolved sessions have none)"}`);
          console.log(`  machine     ${s.machineName ?? "-"} (self-asserted)`);
          console.log(`  began       ${ts(s.startedAt)}`);
          console.log(`  ended       ${ts(s.endedAt)}${s.endedAt ? "" : " (still open, or abandoned - both count as unresolved)"}`);
          console.log(`  resolved    ${ts(s.resolvedAt)}`);
          console.log(`  escalated   ${ts(s.escalatedAt)}  (${s.tickets} ticket(s) reference this session)`);
        }
      }
    } else if (cmd === "deflection") {
      const days = flag("days") ? Number(flag("days")) : null;
      const c = await outcomeCounts(tenant, { days });
      const t = c.total;
      console.log(`  ${tenant}${days ? `, last ${days} day(s)` : ", all time"}: ${t.sessions} session(s)`);
      if (!t.sessions) {
        console.log("  Deflection cannot be computed from zero sessions. The endpoint begins one on its first turn (POST /v1/session).");
      } else {
        console.log(`  resolved ${t.resolved}   escalated ${t.escalated}   unresolved ${t.unresolved} (${t.notFixed} said so explicitly)   suppressed ${t.suppressed} (reserved, D118 - nothing can produce it)`);
        console.log(`  deflection = resolved / (resolved + escalated + unresolved) = ${pct(deflectionOf(t))}   (D89: only an explicit "yes, that fixed it" counts)`);
        console.log("\n  by category (D186 - never only in aggregate):");
        for (const r of c.byCategory) {
          console.log(`    ${(r.category ?? "uncategorised").padEnd(24)} ${String(r.sessions).padStart(4)} sessions  ${String(r.resolved).padStart(3)} resolved  ${String(r.escalated).padStart(3)} escalated  ${String(r.unresolved).padStart(3)} unresolved  ${pct(deflectionOf(r)).padStart(4)}`);
        }
        console.log("\n  A category is the ticket's category for an escalated session, or the capability the user confirmed for a resolved one.");
      }
    } else {
      die(`unknown command ${JSON.stringify(cmd)}\nusage: node bin/sessions.mjs list | show <uuid> | deflection [--days N]`);
    }
  } finally {
    await closePool();
  }
}
