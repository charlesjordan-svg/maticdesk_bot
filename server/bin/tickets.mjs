#!/usr/bin/env node
// @ts-check
/**
 * B6-lite ticket CLI (D213).
 *
 *   node bin/tickets.mjs list [--state new|open|resolved|closed] [--limit N]
 *   node bin/tickets.mjs show <reference>          e.g. MD-1000
 *   node bin/tickets.mjs state <reference> <new|open|closed> [--note "what fixed it"]
 *   node bin/tickets.mjs resolve <reference> --code <code> --resolution "what the requester is told" [--note "…"]
 *   node bin/tickets.mjs reply <reference> --body "…"           the desk's public reply (D287): shown in the requester's Matic Desk when it polls; not email
 *   node bin/tickets.mjs users
 *
 * `resolve` is the ONE way to reach `resolved` (D278, tenant/007): a code (one of RESOLUTION_CODES)
 * and requester-visible notes, both required, refused with a sentence without both — from the CLI
 * as much as from the console, because the correction tool must not be able to make a resolved
 * ticket with no resolution. `state … resolved` is refused and says to use this. The notes are
 * PUBLIC and reach nobody in this build; `show` says so beside them.
 *
 * `--note` is the INTERNAL resolution note (tenant/004, D239): the human's account of what fixed
 * it, kept for the desk and never shown to the requester. `show` prints it. Blank keeps the
 * previous one.
 *
 * `show` also prints the TIMELINE (tenant/006, D275) — every entry, oldest first, each line
 * labelled [INTERNAL] or [public] in words. It asks `listEntries()` for "all" explicitly; the
 * console does the same, so the two cannot disagree about which rows exist (D224). A `state` move
 * from here writes its own state_change entry, attributed to this program, because no person is
 * attached to a CLI call. There is no work-note command here: the one composer this build has is
 * the console's, on purpose.
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
import { TICKET_STATES, RESOLUTION_CODES, RESOLUTION_CODE_WORDS, countTicketsByState, getTicket, listEntries, listReporters, listTickets, resolveTicket, setTicketState, replyToRequester } from "../src/tickets/query.js";

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
          if (t.deviceId) {
            console.log(`  identity        ${t.osUsername ?? "-"} (${t.profileSource}) — filed with an enrollment credential: device ${t.deviceId} (D282, a per-OS-user enrollment of the software, not a person). No attested logon SID (D148).`);
          } else {
            console.log(`  identity        ${t.osUsername ?? "-"} (${t.profileSource}) — NOT AUTHENTICATED: filed with no enrollment credential (a loopback hub, or before tenant/008). No attested logon SID (D148).`);
          }
          console.log("");
          console.log("  what the user said:");
          console.log(`    ${t.description}`);
          console.log("  case note for you:");
          console.log(`    ${t.summary}`);
          console.log("  already checked:");
          console.log(`    ${t.whatWasChecked ?? "-"}`);
          console.log("  internal resolution note (the desk's own record; the requester never sees it):");
          console.log(`    ${t.internalResolutionNote ?? "-"}`);
          // The requester-visible half (D278). Public — and delivered to nobody until P4.
          console.log("  resolution (REQUESTER-VISIBLE: shown in their Matic Desk when it next polls, D287; not email):");
          if (t.resolutionCode) {
            console.log(`    code      ${t.resolutionCode} — ${RESOLUTION_CODE_WORDS[t.resolutionCode] ?? t.resolutionCode}`);
            console.log(`    resolved  ${t.resolvedAt ? t.resolvedAt.toISOString() : "-"}`);
            console.log(`    notes     ${t.resolutionNotes}`);
          } else {
            console.log(`    not resolved${t.state === "closed" ? " — closed without a resolution (this CLI, or before tenant/007)" : ""}`);
          }
          if (t.closedAt) console.log(`  closed          ${t.closedAt.toISOString()} by ${t.closedBy}`);
          if (t.reopenedFrom) console.log(`  follow-up to    ${t.reopenedFrom} (the requester raised this about a closed ticket, D286)`);
          // The timeline, through the same function the console's detail page calls (D224, D275).
          // "all" is asked for in words: this is an operator's tool and is entitled to internal rows.
          const entries = await listEntries(tenant, ref, { visibility: "all" });
          console.log("");
          console.log(`  timeline (${entries.length} entr${entries.length === 1 ? "y" : "ies"}, oldest first — [INTERNAL] never reaches the requester; [public] is shown in their Matic Desk when it polls, and each public line says whether it was handed over and seen, D287):`);
          if (!entries.length) console.log("    (none yet — a state change, a reply or a work note writes one)");
          for (const e of entries) {
            const label = e.visibility === "internal" ? "[INTERNAL]" : "[public]  ";
            const body = e.body.replace(/\r?\n/g, "\n" + " ".repeat(6));
            const who = e.authorKind === "requester" ? "the requester" : (e.authorLabel ?? e.authorKind);
            // D287: the hub's two stamps, in words. The requester's own comments are never "delivered".
            const delivery = e.visibility !== "public" || e.authorKind === "requester" ? ""
              : e.readByRequesterAt ? `  {seen ${e.readByRequesterAt.toISOString().slice(0, 16).replace("T", " ")}}`
                : e.notifiedAt ? `  {handed ${e.notifiedAt.toISOString().slice(0, 16).replace("T", " ")}, not yet seen}`
                  : "  {not yet handed to the requester's app}";
            console.log(`    ${e.createdAt.toISOString().slice(0, 16).replace("T", " ")}  ${label}  ${e.kind.replace(/_/g, " ").padEnd(12)} ${who.padEnd(24)} ${body}${delivery}`);
          }
        }
      }
    } else if (cmd === "state") {
      const [ref, next] = positional;
      if (!ref || !TICKET_STATES.includes(next)) die(`usage: node bin/tickets.mjs state <reference> <${TICKET_STATES.join("|")}> [--note "what fixed it"]   (resolved: use \`resolve\`)`);
      else {
        // Any state to any state, EXCEPT resolved: this is the operator's correction tool, and a
        // correction may not produce a resolved ticket with no resolution (D278) — setTicketState()
        // refuses that target with a sentence pointing at `resolve`. No `from`: unconditional.
        // The note goes through the same function the console's form calls, so `show` and the
        // detail page cannot disagree about it (D224). The state_change entry is attributed to this
        // program: a CLI call has no person on it.
        const moved = await setTicketState(tenant, ref, next, { note: flag("note"), author: { kind: "system", label: "bin/tickets.mjs" } });
        if (!moved) die(`no ticket ${ref} in ${tenant}`);
        else if ("refused" in moved) die(`  ${moved.refused}`);
        else console.log(`  ${ref}: ${moved.from} -> ${moved.to}${moved.noted ? " (internal note recorded)" : ""}`);
      }
    } else if (cmd === "resolve") {
      const ref = positional[0];
      const code = flag("code"), notes = flag("resolution");
      if (!ref) die(`usage: node bin/tickets.mjs resolve <reference> --code <${RESOLUTION_CODES.join("|")}> --resolution "what the requester is told" [--note "for the desk"]`);
      else {
        // The same function the console's Resolve form calls (D224). It refuses without both the
        // code and the notes; the sentence it returns is printed as-is.
        const r = await resolveTicket(tenant, ref, { code, notes, note: flag("note"), author: { kind: "system", label: "bin/tickets.mjs" } });
        if (!r) die(`no ticket ${ref} in ${tenant}`);
        else if ("refused" in r) die(`  ${r.refused}`);
        else {
          console.log(`  ${ref}: ${r.from} -> resolved (${r.code} — ${RESOLUTION_CODE_WORDS[r.code]})${r.noted ? " (internal note recorded)" : ""}`);
          console.log("  THE REQUESTER'S MATIC DESK SHOWS THIS WHEN IT NEXT POLLS (D287) — not email; nobody has been emailed (D86).");
        }
      }
    } else if (cmd === "reply") {
      // D287: the desk's public reply from a terminal — the SAME replyToRequester() the console's
      // composer calls, attributed to the CLI. It stops D276's clock. Not email.
      const ref = positional[0];
      const body = flag("body");
      if (!ref || !body) die('usage: node bin/tickets.mjs reply <reference> --body "what the requester is told"');
      else {
        const r = await replyToRequester(tenant, ref, { body, author: { kind: "system", label: "bin/tickets.mjs" } });
        if (!r) die(`no ticket ${ref} in ${tenant}`);
        else {
          console.log(`  ${ref}: reply recorded (entry ${r.id}) — PUBLIC. Shown in the requester's Matic Desk when it next polls (D287); not email, nobody emailed (D86).`);
        }
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
      die(`unknown command ${JSON.stringify(cmd)}\nusage: node bin/tickets.mjs list | show <ref> | state <ref> <new|open|closed> | resolve <ref> --code <code> --resolution "…" | users`);
    }
  } finally {
    await closePool();
  }
}
