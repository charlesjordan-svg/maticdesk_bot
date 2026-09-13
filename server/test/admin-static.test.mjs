/**
 * The admin console's design rules, checked WITHOUT a database — properties of the SOURCE.
 *
 * Run: node test/admin-static.test.mjs        (from server/; part of `npm test`)
 *
 * Same idea as test/db-static.test.mjs: the rules that make the console safe are enforced on every
 * run, not only when Postgres is up. Each block names the rule and the file it lives in.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readMigrations } from "../src/db/migrate.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, "..");
const read = (p) => readFileSync(join(SERVER, p), "utf8");

let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}
/** Strip comments so a rule's explanation cannot trip the rule (see db-static.test.mjs). */
function jsCode(js) {
  return js.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
}
function sqlCode(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const adminFiles = walk(join(SERVER, "src", "admin")).filter((f) => f.endsWith(".js"));
/** The CSS constant's text, out of html.js. */
function htmlJsCss() {
  const src = read("src/admin/html.js");
  const start = src.indexOf("const CSS = `") + "const CSS = `".length;
  return src.slice(start, src.indexOf("`;", start));
}
/** The asset allow-list, read as data rather than imported, so a broken module still reports. */
function readAssets() {
  const src = read("src/admin/assets.js");
  const body = src.slice(src.indexOf("Object.freeze({") + "Object.freeze(".length, src.indexOf("});", src.indexOf("Object.freeze({")) + 1);
  return Function(`return (${body})`)();
}
const pageFiles = adminFiles.filter((f) => f.includes(join("admin", "pages")));
const rel = (f) => f.slice(SERVER.length + 1).replace(/\\/g, "/");

console.log("=== 1. the console is not an API surface (exit criterion 7) ===");
const index = jsCode(read("src/index.js"));
const routesArray = index.slice(index.indexOf("routes: ["), index.indexOf("]", index.indexOf("routes: [")));
check("GET /'s route list does not contain /admin", !/admin/.test(routesArray), routesArray.match(/.*admin.*/)?.[0] ?? "");
const notFound = index.slice(index.indexOf("Unknown route"), index.indexOf("});", index.indexOf("Unknown route")));
check("the 404's route list does not contain /admin", !/admin/.test(notFound));
check("GET / names the console in a SEPARATE field, so a human finds it without it reading as a route", /console: admin/.test(index));
check("the console is mounted AFTER the loopback refusal (exit criterion 8)", index.indexOf("isLoopback(req.socket.remoteAddress)") < index.indexOf("await handleAdmin(req, res)"));
check("…and BEFORE the API routes", index.indexOf("await handleAdmin(req, res)") < index.indexOf('req.url === "/v1/turn"'));
check("src/index.js still imports nothing from src/db (B0 stays stateless; db-static §6 also checks this)", !/db\/|withTenant/.test(index));
check("createHubServer can be built with admin: false (tests of the API alone)", /admin = true/.test(index) && /admin \? adminHandler/.test(index));

// D282/D283/D284 — the credential on the wire, the LAN listener over TLS, the requester route.
check("the peer gate (admitPeer) runs BEFORE the credential check, so a refused peer costs no database lookup", index.indexOf("admitPeer({") > 0 && index.indexOf("admitPeer({") < index.indexOf("const auth = await authenticate(req)"));
check("a presented credential is CHECKED before the console and before any API route, on every listener", index.indexOf("const auth = await authenticate(req)") > 0 && index.indexOf("const auth = await authenticate(req)") < index.indexOf("await handleAdmin(req, res)"));
check("whether a credential is REQUIRED is the listener's decision (credentialRequired), consulted after authenticate() and before the routes", index.indexOf('if (auth.mode === "none" && credentialRequired({ bound, pathname }))') > index.indexOf("const auth = await authenticate(req)") && index.indexOf('if (auth.mode === "none" && credentialRequired({ bound, pathname }))') < index.indexOf('pathname === "/v1/tickets"'));
check("x-matic-hub-auth is stamped from THIS request's authentication, never a constant", /"x-matic-hub-auth": authMode/.test(index) && !/"x-matic-hub-auth": "none"/.test(index));
check("GET /v1/tickets is dispatched to src/tickets/read.js with the authenticated device, and POST /v1/ticket and /v1/session receive it too (the tenant comes from it, D284)", /handleTicketsRead\(req, res, send, \{ device: auth\.principal \}\)/.test(index) && /handleTicket\(req, res, send, \{ device: auth\.principal \}\)/.test(index) && /handleSession\(req, res, send, \{ device: auth\.principal \}\)/.test(index));
check("the read route holds no SQL — it composes the requester readers (D224) — and refuses without a device with the exported sentence", !/SELECT|UPDATE|INSERT/.test(jsCode(read("src/tickets/read.js"))) && /listTicketsForRequester|getTicketForRequester|listEntriesForRequester/.test(read("src/tickets/read.js")) && /if \(!device\) return send\(401, \{ ok: false, error: NEEDS_CREDENTIAL \}\)/.test(jsCode(read("src/tickets/read.js"))));
check("a LAN listener is TLS or nothing: listenPlanFromEnv refuses a non-loopback bind without a certificate, the handler refuses a plaintext non-loopback peer, and the server is https when tls is given", /is not loopback, and no TLS certificate is configured/.test(index) && /serves the network over TLS only \(D283\)/.test(index) && /https\.createServer\(\{ cert: tls\.cert, key: tls\.key \}, handler\)/.test(index));
check("the entry point computes the plan FIRST and refuses to start on a refusal — nothing is built, nothing listens", index.indexOf("const plan = listenPlanFromEnv()") < index.indexOf('createHubServer({ provider, hubProvider: "local", embedder') && /if \(plan\.refusal\)/.test(index) && /THIS HUB DID NOT START/.test(index) && /server\.listen\(port, plan\.bind/.test(index));
check("GET /'s route list and the 404's both name the requester route", /path: "\/v1\/tickets"/.test(index) && /"GET \/v1\/tickets"/.test(index));
check("the console reads where it is reachable from the bound SOCKET (reachNow), and the login page and footer render it", /const reachNow = \(req\) =>/.test(read("src/admin/router.js")) && /listener: reach/.test(read("src/admin/router.js")) && /reach: reach\.line/.test(read("src/admin/router.js")) && /listener\?\.lan/.test(read("src/admin/pages/login.js")) && /\$\{esc\(reach\)\} Server-rendered/.test(read("src/admin/html.js")));

console.log("\n=== 2. roles carry permissions; users never do (D152) ===");
const c003 = readMigrations("control").find((m) => /admin-console/.test(m.version));
check("control/003 exists and creates admin_role_permissions", Boolean(c003) && /CREATE TABLE IF NOT EXISTS control\.admin_role_permissions/.test(c003.sql));
check("no migration creates a per-user permission table", readMigrations("control").every((m) => !/admin_user_permissions|user_permissions/i.test(sqlCode(m.sql))));
check("no admin source file names a per-user permission table", adminFiles.every((f) => !/admin_user_permissions|user_permissions/.test(jsCode(readFileSync(f, "utf8")))));
const usersJs = jsCode(read("src/admin/users.js"));
check("permissionsFor joins grants -> role permissions and nothing else", /FROM control\.admin_role_grants g\s+JOIN control\.admin_role_permissions p ON p\.role_id = g\.role_id/.test(usersJs));
check("the five D152 actors are seeded", ["vendor_staff", "tenant_owner", "tenant_admin", "it_agent", "auditor"].every((r) => c003.sql.includes(`('${r}',`)));
check("vendor_staff is seeded with NO permissions (D153: a grant, never standing)", !/\('vendor_staff', '[a-z]+\.[a-z_]+'\)/.test(c003.sql));
check("auditor cannot read the review queue or the knowledge base, and cannot write tickets (the read-only role criterion 2 tries)",
  !/\('auditor', 'review\.read'\)/.test(c003.sql) && !/\('auditor', 'knowledge\.read'\)/.test(c003.sql) && !/\('auditor', 'tickets\.write'\)/.test(c003.sql));
check("003 carries decision provenance with status-when-written (register §5.7b)", /DECISION PROVENANCE/.test(c003.sql) && /D152/.test(c003.sql) && /D177/.test(c003.sql) && /2026-09-09/.test(c003.sql));

console.log("\n=== 3. TOTP is mandatory and audit is from the first request (D156) ===");
// Scoped to createAdminUser's own body since 2026-09-12. It used to scan the whole file for
// /totp\s*=\s*false/i, which `resetAdminCredentials({ keepTotp = false })` trips — and keepTotp is
// the opposite of a skip flag: it declines to REPLACE a secret that already exists. The rule being
// defended is D156's, that no account can come into existence without one, so it is asserted where
// accounts come into existence.
const createAdminUserBody = usersJs.slice(usersJs.indexOf("export async function createAdminUser")).split("\nexport ")[0];
check("createAdminUser always mints a TOTP secret — there is no flag to skip it",
  /const totpSecret = newTotpSecret\(\);/.test(createAdminUserBody) && !/skipTotp|noTotp|totp\s*=\s*false/i.test(createAdminUserBody));
check("…and no caller can create an account without one: createAdminUser takes no totp parameter",
  !/function createAdminUser\([^)]*totp/i.test(usersJs));
const routerJs = jsCode(read("src/admin/router.js"));
check("login refuses an account with no TOTP secret", /!user\.totpSecret/.test(routerJs));
check("login refuses a vendor (tenant_id NULL) account by name, citing D153", /user\.tenantId === null/.test(routerJs) && /D153/.test(read("src/admin/router.js")));
check("a failed login is audited (login.failed) and a success is audited (login.ok)", /action: "login\.failed"/.test(routerJs) && /action: "login\.ok"/.test(routerJs));
check("a permission refusal is audited (access.denied) BEFORE the 403 is rendered", routerJs.indexOf('ctx.audit("access.denied"') < routerJs.indexOf("deniedBody(`This page needs"));
check("a CSRF refusal is audited (csrf.refused)", /"csrf\.refused"/.test(routerJs));
check("the CSRF check runs BEFORE the route handler", routerJs.indexOf("csrfValid(session, ctx.form._csrf)") < routerJs.indexOf("await matched.handler(ctx)"));
check("the permission check runs BEFORE the CSRF check and the handler", routerJs.indexOf("permissions.has(matched.permission)") < routerJs.indexOf("csrfValid(session, ctx.form._csrf)"));
for (const f of pageFiles) {
  const src = readFileSync(f, "utf8");
  if (/route\("POST"/.test(src)) check(`${rel(f)} has a POST route and audits in it`, /ctx\.audit\(/.test(jsCode(src)));
  const forms = (src.match(/<form method="post"/g) ?? []).length;
  // The login form is the one exception: there is no session yet, so no per-session token. SameSite=Lax
  // is its defence, and a login-CSRF (logging the victim into the attacker's account) needs a
  // pre-session token — noted in B2-ADMIN-CONSOLE.md's honesty ledger.
  if (forms && !/login\.js$/.test(f)) check(`${rel(f)}: every POST form carries _csrf (${forms} form(s))`, (src.match(/csrfField\(ctx\.csrf\)|name="_csrf"/g) ?? []).length >= forms);
}
check("viewing a ticket's detail is audited (ticket.view) — a record naming a person", /ctx\.audit\("ticket\.view"/.test(read("src/admin/pages/tickets.js")));
check("a state change is audited with from/to and WHETHER a note was written — never the ticket's text or the note's", /ctx\.audit\("ticket\.state", \{ subject: ref, detail: \{ from: moved\.from, to: moved\.to, noted: moved\.noted \} \}\)/.test(read("src/admin/pages/tickets.js")) && !/ctx\.audit\([^)]*(ctx\.form\.note|\bnote\b)/.test(jsCode(read("src/admin/pages/tickets.js"))));

console.log("\n=== 4. sessions: the cookie and the store ===");
const sessionJs = jsCode(read("src/admin/session.js"));
check("the table stores sha256(token), never the token", /INSERT INTO control\.admin_sessions[\s\S]*?VALUES \(\$1/.test(sessionJs) && /sha256\(token\), adminUserId/.test(sessionJs));
check("the cookie is HttpOnly, SameSite=Lax and scoped to /admin", /"Path=\/admin", "HttpOnly", "SameSite=Lax"/.test(sessionJs));
check("Secure is conditional on TLS or MATIC_ADMIN_COOKIE_SECURE, and the file says why", /MATIC_ADMIN_COOKIE_SECURE/.test(sessionJs) && /loopback/i.test(read("src/admin/session.js")));
check("the cookie is read from the request and never from a query string", !/searchParams\.get\(COOKIE_NAME|url\.search.*token/.test(routerJs) && /parseCookies\(req\.headers\.cookie\)/.test(routerJs));
check("sessions expire on idle and absolutely", /SESSION_IDLE_HOURS/.test(sessionJs) && /SESSION_MAX_HOURS/.test(sessionJs) && /revoked_at IS NULL/.test(sessionJs));
check("responses carry a CSP with no script source and a same-origin form-action", /default-src 'none'/.test(routerJs) && /form-action 'self'/.test(routerJs));
for (const f of pageFiles) check(`${rel(f)} has no inline event handler or script (the CSP would block it; forms must work without JS)`, !/ on[a-z]+="|<script/.test(readFileSync(f, "utf8")));

console.log("\n=== 5. one query layer for tickets (D224) ===");
const ticketWriters = ["src/tickets/query.js", "src/tickets/file.js"];
const allSrc = [...walk(join(SERVER, "src")), ...walk(join(SERVER, "bin"))].filter((f) => /\.(m?js)$/.test(f));
// Since tenant/006 (D275) the rule covers ticket_entries too: the timeline's SQL lives in query.js
// and nowhere else, or the console and the CLI could disagree about which rows exist.
const offenders = allSrc.filter((f) => !ticketWriters.includes(rel(f)) && /\b(FROM|UPDATE|INTO)\s+(tickets|ticket_entries)\b/.test(jsCode(readFileSync(f, "utf8"))));
check("only src/tickets/ touches the tickets and ticket_entries tables — the CLI and the console both read through query.js", offenders.length === 0, offenders.map(rel).join(", "));
check("bin/tickets.mjs imports from src/tickets/query.js and holds no SQL", /from "\.\.\/src\/tickets\/query\.js"/.test(read("bin/tickets.mjs")) && !/SELECT|UPDATE/.test(jsCode(read("bin/tickets.mjs"))));
check("the console's ticket page imports the same module", /from "\.\.\/\.\.\/tickets\/query\.js"/.test(read("src/admin/pages/tickets.js")));
check("the console's ticket page says nobody has been emailed (D213's sixth surface)", /[Nn]obody has been emailed/.test(read("src/admin/pages/tickets.js")));

console.log("\n=== 5c. every field the ticket query layer returns has a reader (D269) ===");
{
  // THE DEFECT THIS EXISTS TO CATCH, found 2026-09-12: tenant/004 added a close-note column,
  // query.js SELECTed it and returned it, and two comments said the detail page and the CLI read
  // it. Neither did — and neither did anything write it. A column can sit behind a working SELECT
  // for a week with nothing rendering it, and §5's "one query layer" rule cannot notice, because
  // the query layer was doing its half. The test that notices walks the SHAPE the query layer
  // returns and asks, field by field, who reads it.
  //
  // THE RESERVED LIST IS THE FEATURE. A field with no reader is either a defect or a decision, and
  // the difference is an entry here carrying a reason and a decision number — the same move D224
  // made for SQL. "Deliberately unused" stops being a claim in a comment and becomes a line the
  // suite reads. The live half (every COLUMN of the table has a writer or a reader, from
  // information_schema) is admin-db.test.mjs §5.
  const q = read("src/tickets/query.js");
  const keysIn = (from, to) => {
    const s = q.indexOf(from); const e = q.indexOf(to, s);
    return s < 0 || e < 0 ? [] : [...q.slice(s, e).matchAll(/^\s+([a-zA-Z]+):/gm)].map((m) => m[1]);
  };
  const fields = new Set([...keysIn("const shapeRow = (r) => ({", "});"), ...keysIn("export async function getTicket", "\n}\n")]);
  check("the field extraction found the shape (a broken extraction must fail, not pass vacuously)", fields.size >= 14, [...fields].join(","));
  const pageJs = jsCode(read("src/admin/pages/tickets.js")), cliJs = jsCode(read("bin/tickets.mjs"));
  /** Fields getTicket() returns that deliberately reach no screen. One line, one reason, one decision. */
  const RESERVED_FIELDS = {
    id: "the uuid is the join key; both readers show `reference`, the human-facing key (003-tickets.sql, D213)",
  };
  const readBy = (f) => [pageJs, cliJs].filter((src) => new RegExp(`\\bt\\.${f}\\b`).test(src)).length;
  const unread = [...fields].filter((f) => !(f in RESERVED_FIELDS) && readBy(f) === 0);
  check("every field getTicket() returns is rendered by the console's detail page or printed by the CLI's show, or is declared reserved here with a reason",
    unread.length === 0, `no reader: ${unread.join(", ")}`);
  const stale = Object.keys(RESERVED_FIELDS).filter((f) => !fields.has(f) || readBy(f) > 0);
  check("the reserved list names only fields that exist and that nothing reads (an entry that gained a reader comes off the list)", stale.length === 0, stale.join(","));

  // The note specifically: the handover asks for BOTH readers, and for the word "internal" in words
  // on each, not only by colour — plan §7.4's rule, applying already because this is the first
  // internal-only field either reader shows.
  const noteField = [...fields].find((f) => /Note$/.test(f));
  check("the query layer returns a resolution-note field", Boolean(noteField), [...fields].join(","));
  check("the note is rendered by the detail page AND printed by the CLI", noteField && readBy(noteField) === 2);
  check("the detail page labels it internal, in words, and says the requester never sees it", /Internal resolution note/.test(pageJs) && /requester never sees it/.test(pageJs));
  check("the CLI labels it the same way", /internal resolution note/.test(cliJs) && /requester never sees it/.test(cliJs));
  // Since D275 the call also carries the AUTHOR of the state_change entry the move writes.
  check("the state form carries a <textarea name=\"note\"> and statePost passes it to setTicketState()", /<textarea id="note\$\{idSuffix\}" name="note"/.test(pageJs) && /setTicketState\(ctx\.tenant\.schemaName, ref, next, \{ note, author: consoleAuthor\(ctx\), from \}\)/.test(pageJs));
  check("the CLI's state command takes --note and passes it the same way", /setTicketState\(tenant, ref, next, \{ note: flag\("note"\), author: \{ kind: "system", label: "bin\/tickets\.mjs" \} \}\)/.test(cliJs));
  check("neither reader makes the note mandatory (the mandatory field is the requester-visible one, P2)", !/name="note"[^>]*required/.test(pageJs) && !/note.*required/i.test(cliJs));
}

console.log("\n=== 5d. the timeline: visibility is the KIND's, never the caller's; one composer; no default (D275/D276) ===");
{
  // THE RULE THAT MATTERS EIGHTEEN MONTHS FROM NOW. listEntries() has a required visibility and no
  // default, so a requester-facing caller (P4) cannot receive internal rows by forgetting an
  // argument; the INSERT takes visibility from the kind, so no caller can make a work note public;
  // and WRITABLE_KINDS refuses 'comment' until something can deliver one — the plan's finding 8,
  // enforced rather than remembered. Each is asserted on the SOURCE so it holds with no database.
  const q = read("src/tickets/query.js"), qCode = jsCode(q);
  check("listEntries() takes a REQUIRED visibility with no default", /export async function listEntries\(schema, reference, \{ visibility \}\)/.test(qCode));
  check("…and throws on anything but 'public' and 'all'", /ENTRY_VISIBILITIES = Object\.freeze\(\["public", "all"\]\)/.test(qCode) && /if \(!ENTRY_VISIBILITIES\.includes\(visibility\)\)/.test(qCode));
  check("…and the public branch filters in SQL (visibility = 'public'), not in JavaScript after the rows arrived", /visibility === "public" \? "AND e\.visibility = 'public'" : ""/.test(qCode));
  check("KIND_VISIBILITY is frozen: work_note -> internal; comment, state_change, resolution -> public", /KIND_VISIBILITY = Object\.freeze\(\{[^}]*work_note: "internal"[^}]*\}\)/.test(qCode) && /comment: "public"/.test(qCode) && /state_change: "public"/.test(qCode) && /resolution: "public"/.test(qCode));
  check("the INSERT takes visibility from KIND_VISIBILITY[kind]; no writer accepts one from a caller", /KIND_VISIBILITY\[kind\]/.test(qCode) && !/function (addEntry|insertEntry|setTicketState)\([^)]*visibility/.test(qCode));
  check("WRITABLE_KINDS is work_note, state_change, resolution and — since P4 (D286) — comment", /WRITABLE_KINDS = Object\.freeze\(\["work_note", "state_change", "resolution", "comment"\]\)/.test(qCode) && /WRITABLE_KINDS\.includes\(kind\)/.test(qCode));
  check("a comment has exactly TWO writers — requesterComment() and replyToRequester() — and addEntry() refuses it as a transition, not an append (D286)", (qCode.match(/kind: "comment"/g) ?? []).length === 2 && /if \(kind === "comment"\) throw new Error\("a comment is a transition, not an append \(D286\)/.test(qCode) && /export async function requesterComment\(/.test(qCode) && /export async function replyToRequester\(/.test(qCode));
  check("setTicketState() writes its state_change entry INSIDE the same transaction (insertEntry on the same client)", /await insertEntry\(c, rows\[0\]\.id, \{ kind: "state_change"/.test(qCode));
  const shapeEntry = q.slice(q.indexOf("const shapeEntry"), q.indexOf("});", q.indexOf("const shapeEntry")));
  check("shapeEntry returns notifiedAt and readByRequesterAt — D287's two hub-stamped marks, readers on the console (P4)", /notifiedAt: r\.notified_at \?\? null/.test(shapeEntry) && /readByRequesterAt: r\.read_by_requester_at \?\? null/.test(shapeEntry));

  const page = read("src/admin/pages/tickets.js"), pageCode = jsCode(page), cli = read("bin/tickets.mjs"), cliCode = jsCode(cli);
  check("the console asks for 'all' in words, and so does the CLI — the two readers (D224)", /listEntries\(ctx\.tenant\.schemaName, ref, \{ visibility: "all" \}\)/.test(pageCode) && /listEntries\(tenant, ref, \{ visibility: "all" \}\)/.test(cliCode));
  check("TWO composers since P4 (D287) — Reply to requester (public) and Add work note (internal) — two forms, two actions, and NO visibility control on either", (pageCode.match(/action="\/admin\/tickets\/\$\{t\.reference\}\/worknote"/g) ?? []).length === 1 && (pageCode.match(/action="\/admin\/tickets\/\$\{t\.reference\}\/reply"/g) ?? []).length === 1 && !/name="visibility"/.test(pageCode));
  check("the reply composer says in-app, only while their app is open and polling, NOT email; the work-note composer says the requester never sees a work note", /The requester sees this only while their Matic Desk app is open and polling\. This is not email/.test(page) && /the requester never sees a work note/.test(page));
  check("the reply route requires tickets.write and writes through replyToRequester(), audited as ticket.comment with the entry id and never the body", /route\("POST", new RegExp\(`\^\/admin\/tickets\/\$\{REF\}\/reply\$`\), "tickets\.write", replyPost\)/.test(pageCode) && /replyToRequester\(ctx\.tenant\.schemaName, ref, \{ body, author: consoleAuthor\(ctx\) \}\)/.test(pageCode) && /ctx\.audit\("ticket\.comment", \{ subject: ref, detail: \{ entry: added\.id \} \}\)/.test(pageCode) && !/ctx\.audit\("ticket\.comment"[^)]*body/.test(pageCode));
  check("every entry is labelled in WORDS — internal, or public WITH its delivery state (D287): not yet handed / handed, not yet seen / seen — and the requester's own as 'from the requester'", /<span class="pill internal">internal<\/span> <span>the requester never sees this<\/span>/.test(page) && /<span class="pill">public<\/span> \$\{deliveryWords\(e\)\}/.test(page) && /not yet handed to the requester's app/.test(page) && /handed to the requester's app \$\{ago\(e\.notifiedAt\)\} — not yet seen/.test(page) && /seen by the requester \$\{ago\(e\.readByRequesterAt\)\}/.test(page) && /from the requester/.test(page));
  check("no public row ever says sent, notified or emailed (D253's rule, D86)", !/<span>(sent|notified|emailed)/i.test(page));
  check("'awaiting the requester' is DERIVED from the timeline (plan v3 §3.1's substitute for a fifth state), never a stored state", /export function awaitingRequester\(entries, state\)/.test(pageCode) && /last\.authorKind !== "requester"/.test(pageCode) && !/pending_user/.test(pageCode));
  check("the CLI labels every line [INTERNAL] or [public]", /"\[INTERNAL\]"/.test(cliCode) && /"\[public\]  "/.test(cliCode));
  check("the worknote POST is audited as ticket.worknote with the entry id and never the body", /ctx\.audit\("ticket\.worknote", \{ subject: ref, detail: \{ entry: added\.id \} \}\)/.test(pageCode) && !/ctx\.audit\("ticket\.worknote"[^)]*body/.test(pageCode));
  check("the worknote route requires tickets.write", /route\("POST", new RegExp\(`\^\/admin\/tickets\/\$\{REF\}\/worknote\$`\), "tickets\.write", worknotePost\)/.test(pageCode));
  check("the state_change entry is attributed: the console user by email, the CLI as itself", /author: consoleAuthor\(ctx\)/.test(pageCode) && /consoleAuthor = \(ctx\) => \(\{ kind: "console_user", adminUserId: ctx\.user\.id, label: ctx\.user\.email \}\)/.test(pageCode) && /author: \{ kind: "system", label: "bin\/tickets\.mjs" \}/.test(cliCode));
  check("there is no work-note command in the CLI — the one composer is the console's", !/worknote|work_note/.test(cliCode.replace(/\[INTERNAL\]|never reaches the requester/g, "")));

  // D276: an AGE, never a count, on both ticket screens, saying why it is empty today.
  check("D276: both ticket screens draw unansweredLimit(oldest) from oldestUnansweredRequesterComment()", (pageCode.match(/\$\{unansweredLimit\(oldest\)\}/g) ?? []).length === 2 && (pageCode.match(/oldestUnansweredRequesterComment\(/g) ?? []).length >= 2);
  check("D276: it renders an AGE via ago(oldest.since) and never a count", /ago\(oldest\.since\)/.test(pageCode) && !/oldest\.length|unanswered[^;]*count\(/i.test(pageCode));
  check("D276: with nothing to show it says none AND what none means now that requesters CAN comment (answered, or none arrived)", /Oldest unanswered requester comment: none\./.test(page) && /Every requester comment has been answered, or none has arrived/.test(page) && !/No requester can comment in this build/.test(page));
  check("D276: the query reads tickets.awaiting_agent_since, and since P4 it has WRITERS: requesterComment() starts it with COALESCE (a second comment does not restart it); replyToRequester(), confirmResolution() and (P5) closeByAutoclose() clear it", /FROM tickets WHERE awaiting_agent_since IS NOT NULL ORDER BY awaiting_agent_since ASC LIMIT 1/.test(qCode) && (qCode.match(/awaiting_agent_since = COALESCE\(awaiting_agent_since, now\(\)\)/g) ?? []).length === 2 && (qCode.match(/awaiting_agent_since = NULL/g) ?? []).length === 3);
  // D286/D287 — the requester's actions and the hub's two stamps, structurally.
  const rc = qCode.slice(qCode.indexOf("export async function requesterComment"), qCode.indexOf("\n}\n", qCode.indexOf("export async function requesterComment")));
  check("requesterComment() locks the row AND scopes it to the enrollment in one SELECT … FOR UPDATE (D284), so the transition is decided under the lock", /SELECT id, state, user_id FROM tickets WHERE reference = \$1 AND device_id = \$2::uuid FOR UPDATE/.test(rc));
  check("…closed is REFUSED with the way forward (reopenedFrom); resolved reopens: the current resolution cleared, a state_change in the requester's name; the requester is the author with no label", /is closed, and a closed ticket is read-only \(D279\)/.test(rc) && /reopenedFrom/.test(rc) && /SET state = 'open'/.test(rc) && /resolution_code = NULL, resolution_notes = NULL, resolved_at = NULL/.test(rc) && /body: "resolved → open", author: who/.test(rc) && /kind: "requester", userId: t\.user_id, label: null/.test(rc));
  const cf = qCode.slice(qCode.indexOf("export async function confirmResolution"), qCode.indexOf("\n}\n", qCode.indexOf("export async function confirmResolution")));
  check("confirmResolution(): the guard is IN the UPDATE (t.state = 'resolved', D280), closed_by is the literal 'requester', the clock is cleared, and a refusal names the state now", /WHERE t\.id = prev\.id AND t\.state = 'resolved'/.test(cf) && /closed_by = 'requester'/.test(cf) && /awaiting_agent_since = NULL/.test(cf) && /not resolved: only a resolved ticket can be confirmed fixed/.test(cf));
  check("both stamps are the HUB's now(), scoped to the enrollment's tickets, and never taken from the body: markEntriesNotified() skips the requester's own comments; ackEntries() stamps only public, unacknowledged, own entries", /SET notified_at = now\(\)[\s\S]*?e\.author_kind <> 'requester' AND e\.notified_at IS NULL/.test(qCode) && /SET read_by_requester_at = now\(\)[\s\S]*?t\.device_id = \$1::uuid AND e\.id = ANY\(\$2::uuid\[\]\)[\s\S]*?e\.visibility = 'public' AND e\.read_by_requester_at IS NULL/.test(qCode));
  check("the P5 hooks are BUILT where the placeholders said they would go (D289): the resolved -> open branch and confirm both withdraw the auto-close job, and no placeholder survives", (q.match(/D289 \(P5\)/g) ?? []).length >= 2 && !/P5 WILL CANCEL|P5: cancel the ticket\.autoclose job/.test(q));
  const rr = jsCode(read("src/tickets/requester-routes.js"));
  check("the requester routes hold no SQL (D224), require the device on every action with the exported sentence, and decide no transition themselves", !/SELECT|UPDATE|INSERT/.test(rr) && /if \(!device\) return send\(401, \{ ok: false, error: NEEDS_CREDENTIAL_TO_ACT \}\)/.test(rr) && /requesterComment\(device\.tenantSchema, reference/.test(rr) && /confirmResolution\(device\.tenantSchema, reference/.test(rr) && /ackEntries\(device\.tenantSchema/.test(rr));
  check("index.js dispatches the four POSTs to the action handler BEFORE the read route (they share /v1/tickets' prefix), with the authenticated device", index.indexOf("ACTION_PATH.test(pathname)") > 0 && index.indexOf("ACTION_PATH.test(pathname)") < index.indexOf('pathname === "/v1/tickets"') && /handleRequesterAction\(req, res, send, \{ device: auth\.principal, pathname \}\)/.test(index));
  check("GET /'s route list and the 404's name all four", /path: "\/v1\/ticket\/:reference\/comment"/.test(index) && /path: "\/v1\/tickets\/ack"/.test(index) && /"POST \/v1\/ticket\/:reference\/confirm"/.test(index) && /"POST \/v1\/ticket\/:reference\/reopen"/.test(index));
  check("the read route stamps the hand-off BEFORE listing the entries (markEntriesNotified, then listEntriesForRequester) and reports how many it handed", (() => { const r = jsCode(read("src/tickets/read.js")); return r.indexOf("markEntriesNotified(device.tenantSchema, reference") > 0 && r.indexOf("markEntriesNotified(device.tenantSchema, reference") < r.indexOf("listEntriesForRequester(device.tenantSchema, reference") && /handed,/.test(r); })());
  check("the detail page's notYet() names assignment, attachments and email as missing — requester comments are BUILT — and says how far a reply reaches", /Assignment, attachments, email/.test(page) && !/commented on by the requester/.test(page) && /reaches the requester's Matic Desk while their app is open and polling/.test(page));
}

console.log("\n=== 5e. resolution means something: refused without code and notes, closed terminal, the guard in the UPDATE (D278–D280) ===");
{
  const q = read("src/tickets/query.js"), qCode = jsCode(q);
  const page = read("src/admin/pages/tickets.js"), pageCode = jsCode(page), cli = read("bin/tickets.mjs"), cliCode = jsCode(cli);
  const { RESOLUTION_CODES, RESOLUTION_CODE_WORDS, NEXT_STATES } = await import("../src/tickets/query.js");
  // D278 — the code and the notes, both required, refused with a sentence
  check("RESOLUTION_CODES is frozen and is the six", Object.isFrozen(RESOLUTION_CODES) && RESOLUTION_CODES.join(",") === "fixed,workaround,no_fault_found,duplicate,withdrawn_by_user,referred_to_vendor");
  check("every code has words (D244: a closed enum never reaches a screen as itself), shared by the console and the CLI", RESOLUTION_CODES.every((c) => typeof RESOLUTION_CODE_WORDS[c] === "string" && !/_/.test(RESOLUTION_CODE_WORDS[c])) && /RESOLUTION_CODE_WORDS\[/.test(pageCode) && /RESOLUTION_CODE_WORDS\[/.test(cliCode));
  check("resolveTicket() refuses without BOTH a code and notes, naming what is missing, and writes nothing first", /if \(!RESOLUTION_CODES\.includes\(code\)\) missing\.push/.test(qCode) && /if \(!text\) missing\.push\("resolution notes the requester will read"\)/.test(qCode) && qCode.indexOf("if (missing.length)") < qCode.indexOf("SET state = 'resolved'"));
  check("setTicketState() REFUSES resolved as a target — the CLI's any-state correction cannot make a code-less resolved ticket", /if \(next === "resolved"\) \{\s*return \{\s*refused:/.test(qCode));
  check("resolving writes a public `resolution` entry with the notes as its body, and a state_change, in the same transaction", /await insertEntry\(c, rows\[0\]\.id, \{ kind: "resolution", body: text, author \}\)/.test(qCode) && /body: `\$\{was\} → resolved`/.test(qCode));
  check("a move to a LIVE state clears the resolution columns; a move to closed keeps them and stamps closed_at/closed_by", /resolution_code  = CASE WHEN \$2 IN \('new', 'open'\) THEN NULL ELSE t\.resolution_code END/.test(qCode) && /closed_at = CASE WHEN \$2 = 'closed' THEN now\(\) ELSE NULL END/.test(qCode));
  // D279 — closed terminal in the console, and offered only from resolved
  check("NEXT_STATES: closed offers nothing; closed is offered ONLY from resolved; resolved is reached from new and open", NEXT_STATES.closed.length === 0 && Object.entries(NEXT_STATES).filter(([, tos]) => tos.includes("closed")).map(([f]) => f).join() === "resolved" && NEXT_STATES.new.includes("resolved") && NEXT_STATES.open.includes("resolved"));
  check("the state <select> never offers resolved — that is the Resolve form's — and closed draws a terminal sentence naming the CLI", /next\.filter\(\(s\) => s !== "resolved"\)/.test(pageCode) && /Closed is terminal in this console \(D279\)/.test(page) && /tickets -- state \$\{t\.reference\} open/.test(page));
  check("the Resolve form is drawn only when NEXT_STATES offers resolved, and requires code and notes", /if \(!ctx\.permissions\.has\("tickets\.write"\) \|\| !next\.includes\("resolved"\)\) return "";/.test(pageCode) && /name="resolutionCode" required/.test(page) && /name="resolutionNotes" rows="4" maxlength="4000" required/.test(page));
  check("the Resolve form says the notes are shown in the requester's Matic Desk when it next polls, while open, and that this is NOT email (D253's rule: describe the reach, imply no more)", /Requester-visible — shown in the requester's Matic Desk the next time it polls, while their app is open\. This is not email/.test(page) && !/delivered to nobody/.test(page));
  check("the detail page and the CLI label the resolution notes the same way — shown in their Matic Desk when it next polls, not emailed", /requester-visible; shown in their Matic Desk when it next polls/.test(page) && /REQUESTER-VISIBLE: shown in their Matic Desk when it next polls, D287; not email/.test(cli) && !/nobody sees it in this build/.test(cli));
  check("the CLI has reply (--body) through the SAME replyToRequester(), attributed to itself", /cmd === "reply"/.test(cliCode) && /replyToRequester\(tenant, ref, \{ body, author: \{ kind: "system", label: "bin\/tickets\.mjs" \} \}\)/.test(cliCode));
  check("the two notes are named side by side so they are not merged: the internal note's caption points at the resolution notes as a different field", /The requester-facing account is the resolution notes below, a different field \(D278\)/.test(page));
  // D280 — the guard in the UPDATE, no read before the write
  check("the guard is IN the UPDATE for both writers: … AND ($n::text IS NULL OR t.state = $n::text)", /WHERE t\.id = prev\.id AND \(\$4::text IS NULL OR t\.state = \$4::text\)/.test(qCode) && /WHERE t\.id = prev\.id AND \(\$5::text IS NULL OR t\.state = \$5::text\)/.test(qCode));
  check("a guarded write that matched nothing asks the row where it is now and says so (staleOrMissing), or null when no such ticket", /if \(!rows\.length\) return staleOrMissing\(c, reference, from\);/.test(qCode) && (qCode.match(/return staleOrMissing\(c, reference, from\)/g) ?? []).length === 2 && /someone moved it after that state was read/.test(q));
  const statePostBody = pageCode.slice(pageCode.indexOf("async function statePost"), pageCode.indexOf("async function resolvePost"));
  const resolvePostBody = pageCode.slice(pageCode.indexOf("async function resolvePost"), pageCode.indexOf("const REF ="));
  check("statePost and resolvePost read NOTHING before the write — no getTicket() in either; the form's hidden `from` is what the guard compares", !/getTicket\(/.test(statePostBody) && !/getTicket\(/.test(resolvePostBody) && (page.match(/<input type="hidden" name="from" value="\$\{t\.state\}">/g) ?? []).length === 2);
  check("both POSTs pass `from` to the query layer and render a 409 on a stale form, audited as ticket.state.refused with why: stale", /setTicketState\(ctx\.tenant\.schemaName, ref, next, \{ note, author: consoleAuthor\(ctx\), from \}\)/.test(pageCode) && /resolveTicket\(ctx\.tenant\.schemaName, ref, \{ code, notes, note, author: consoleAuthor\(ctx\), from \}\)/.test(pageCode) && /ctx\.render\(409/.test(pageCode) && (pageCode.match(/why: "stale"/g) ?? []).length === 2);
  check("resolving is audited as ticket.resolve with from, the CODE and noted — never the notes", /ctx\.audit\("ticket\.resolve", \{ subject: ref, detail: \{ from: r\.from, code: r\.code, noted: r\.noted \} \}\)/.test(pageCode) && !/ctx\.audit\("ticket\.resolve"[^)]*notes[^G]/.test(pageCode));
  check("the CLI has resolve (--code, --resolution), refuses through the same function, and says the requester's Matic Desk shows it when it next polls (P4)", /cmd === "resolve"/.test(cliCode) && /flag\("code"\), notes = flag\("resolution"\)/.test(cliCode) && /THE REQUESTER'S MATIC DESK SHOWS THIS WHEN IT NEXT POLLS/.test(cli) && /"refused" in moved\) die/.test(cliCode));
}

console.log("\n=== 5f. the requester-safe read shape: an allow-list, not whatever getTicket() returns (D281, rekeyed D284; D269's condition) ===");
{
  // WHY THIS EXISTS. getTicket() does SELECT t.* — the console's reader, and the right shape for
  // it. Any requester-facing route built on that shape ships `summary` (the model's case note,
  // written for the assignee; 003-tickets.sql says "never shown to the user", and D214 exists
  // because on 2026-09-04 the avatar read it aloud to one), `what_was_checked`, and the internal
  // resolution note (D269). That hazard does not depend on who may call the route or on where the
  // hub runs (D271), so the safe shape and this test were built BEFORE the gate opened (P3a).
  // D269's ratified condition: this test was written first and seen failing before any requester
  // route existed — its first run (756ad74) failed on the missing export.
  //
  // ALLOW-LIST, NOT DENYLIST. A denylist of field names silently admits every column added after
  // it is written; an allow-list fails closed. Same shape as §5c's RESERVED_FIELDS and admin-db
  // §5c's RESERVED_COLUMNS: one line, one reason. The live half — every COLUMN of `tickets` is on
  // this list or on admin-db §5e's HIDDEN list, from information_schema — is what makes a column
  // added tomorrow fail rather than slip through.
  //
  // REKEYED IN P3b (D284). P3a scoped the read by `u.os_username` because tickets carried no device
  // column. tenant/008 added `device_id` and the clause together, as P3a's header said it would,
  // and this block moved with it: the identity is the enrollment's control.devices.id.
  const REQUESTER_VISIBLE = {
    reference: "the key the requester was told and quotes back (D213)",
    state: "where their ticket is — the one fact a requester view exists to show",
    category: "the escalation category the endpoint itself chose and said aloud at filing time",
    machineName: "the requester's own machine, read by the endpoint they were sitting at",
    createdAt: "when it was filed",
    updatedAt: "when it last moved",
    resolutionCode: "the six-code outcome (D278); glossed by the renderer, never shown raw (D244)",
    resolutionNotes: "written FOR the requester (D278) — this shape is the first reader allowed to carry them",
    resolvedAt: "when it was resolved",
    closedAt: "when it was closed",
    closedBy: "by what kind of actor — requester, auto, console_user, system (D278); glossed by the renderer",
    autoCloseAt: "when the current resolution closes on its own unless they act (D289) — the requester is TOLD the date; the job id behind it is hidden",
  };
  const q = read("src/tickets/query.js"), qCode = jsCode(q);
  const mod = await import("../src/tickets/query.js");
  check("getTicketForRequester() is exported from the one query layer (D224)", typeof mod.getTicketForRequester === "function");
  check("listTicketsForRequester() and listEntriesForRequester() are exported beside it", typeof mod.listTicketsForRequester === "function" && typeof mod.listEntriesForRequester === "function");

  // ONE shape, ONE column list, used by both readers.
  const shapeStart = qCode.indexOf("const shapeRequesterRow = (t) => ({");
  const returned = shapeStart < 0 ? "" : qCode.slice(shapeStart, qCode.indexOf("});", shapeStart));
  const fields = [...returned.matchAll(/^\s+([a-zA-Z]+):/gm)].map((m) => m[1]);
  check("the extraction found the requester shape (a broken extraction must fail, not pass vacuously)", fields.length >= 8, fields.join(","));
  check("the requester shape returns EXACTLY the allow-list — every field named here with a reason, and nothing else",
    fields.length > 0 && fields.slice().sort().join(",") === Object.keys(REQUESTER_VISIBLE).sort().join(","), `returns: ${fields.join(",")}`);
  check("the shape never names summary, whatWasChecked, internalResolutionNote, suggestedOwner, sessionId, deviceId, description, or the reporter's profile",
    returned.length > 0 && !/summary|what_was_checked|whatWasChecked|internal_resolution_note|internalResolutionNote|suggested_owner|suggestedOwner|session_id|sessionId|device_id|deviceId|reporter|first_name|last_name|location|contact_id|contactId|os_username|osUsername|profile_source|profileSource|description|user_id|\bid\b/.test(returned), returned);
  const colsStart = qCode.indexOf("const REQUESTER_COLUMNS = `");
  const colsSrc = colsStart < 0 ? "" : qCode.slice(colsStart, qCode.indexOf("`;", colsStart));
  const cols = [...colsSrc.matchAll(/\bt\.([a-z_]+)/g)].map((m) => m[1]);
  const camel = (c) => c.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
  check("the column list names exactly the allow-list's columns — never `t.*` (the SQL and the object agree)", cols.length === Object.keys(REQUESTER_VISIBLE).length && cols.every((c) => camel(c) in REQUESTER_VISIBLE) && !/\*/.test(colsSrc), cols.join(","));

  const fnOf = (name) => { const s = qCode.indexOf(`export async function ${name}`); return s < 0 ? "" : qCode.slice(s, qCode.indexOf("\n}\n", s)); };
  const one = fnOf("getTicketForRequester"), many = fnOf("listTicketsForRequester"), le = fnOf("listEntriesForRequester");
  check("both readers SELECT the shared column list and return through the shared shape — no t.*, no spread, no second list",
    [one, many].every((fn) => fn.length > 0 && /SELECT \$\{REQUESTER_COLUMNS\}/.test(fn) && /shapeRequesterRow/.test(fn) && !/\bt\.\*/.test(fn) && !/\.\.\.\s*(shapeRow|t\b|rows)/.test(fn)));
  check("the one-ticket read is scoped to the ENROLLMENT in SQL — WHERE t.reference = $1 AND t.device_id = $2::uuid — so another enrollment's reference is the same null as no ticket", /WHERE t\.reference = \$1 AND t\.device_id = \$2::uuid/.test(one));
  check("the list read is scoped the same way, newest first, with a LIMIT", /WHERE t\.device_id = \$1::uuid\s+ORDER BY t\.created_at DESC LIMIT \$2/.test(many));
  check("neither reader joins users or names os_username — the key is the credential's device, not a name the client typed (D284)", [one, many].every((fn) => !/users|os_username|osUsername/.test(fn)));
  check("the identity is REQUIRED with no default: both readers go through requesterDeviceId(), which throws naming deviceId", /function requesterDeviceId\(fn, \{ deviceId \} = \{\}\)/.test(qCode) && /needs identity\.deviceId/.test(qCode) && /requesterDeviceId\("getTicketForRequester", identity\)/.test(one) && /requesterDeviceId\("listTicketsForRequester", identity\)/.test(many));
  const header = q.slice(q.lastIndexOf("/**", q.indexOf("export async function getTicketForRequester")), q.indexOf("export async function getTicketForRequester"));
  check("the header says why the key moved from the OS username to the enrollment, and names both accepted costs (plan v3 §6.2)", /KEYED BY THE ENROLLMENT, NOT THE OS USERNAME/.test(header) && /self-asserted/.test(header) && /reinstall/.test(header) && /NULL/.test(header));

  check("listEntriesForRequester() takes NO visibility parameter — a requester path with one is a requester path that can be called wrong", le.length > 0 && !/^export async function listEntriesForRequester\([^)]*visibility/.test(le));
  check("…and calls listEntries() with the argument FIXED to \"public\" — never passed through", /listEntries\(schema, reference, \{ visibility: "public" \}\)/.test(le) && !/visibility: visibility|\{ visibility \}\)/.test(le));
  check("…and only after getTicketForRequester() says the ticket is theirs — another enrollment's public rows are not this requester's", /await getTicketForRequester\(schema, reference, identity\)/.test(le));

  // getTicket() keeps SELECT t.* — the console is entitled to every column. The fix is a SECOND
  // function, not a narrower one, and getTicket() says where the requester's is.
  const gtStart = q.indexOf("export async function getTicket(");
  const gt = q.slice(gtStart, q.indexOf("\n}\n", gtStart));
  check("getTicket() still does SELECT t.* for the console, and points at getTicketForRequester() in words", /SELECT t\.\*/.test(gt) && /getTicketForRequester/.test(gt) && /D281/.test(gt));
  check("getTicket() returns deviceId — the console sees which enrollment filed a ticket, or that none did", /deviceId: t\.device_id \?\? null/.test(gt));

  // D284: the writer. createTicket() takes the device from the caller — the route, which took it
  // from a verified credential — and never from the request body.
  const file = jsCode(read("src/tickets/file.js"));
  check("createTicket() writes device_id from its options argument, never from the body", /export async function createTicket\(schema, body, \{ deviceId = null, reopenedFrom = null \} = \{\}\)/.test(file) && /device_id, reopened_from\)/.test(file) && !/body\.deviceId|body\.device_id/.test(file));

  // P3a's "called by nothing" line is RETIRED here, as its label said: the route exists
  // (src/tickets/read.js, D284) and the live route test is admin-db B3-5. What stays is the
  // narrower property: ONE caller, the route. A second one is a second requester surface to review.
  const callers = allSrc.filter((f) => rel(f) !== "src/tickets/query.js" && /getTicketForRequester|listTicketsForRequester|listEntriesForRequester/.test(jsCode(readFileSync(f, "utf8"))));
  check("the requester readers are called by exactly ONE file — src/tickets/read.js, the route — and by nothing else", callers.length === 1 && rel(callers[0]) === "src/tickets/read.js", `callers: ${callers.map(rel).join(", ")}`);
}

console.log("\n=== 5b. one query layer for devices (D224's pattern, B3) ===");
{
  const deviceWriters = ["src/devices/enrollment.js"];
  const offenders = allSrc.filter((f) => !deviceWriters.includes(rel(f)) && /\b(FROM|UPDATE|INTO)\s+control\.(devices|enrollment_requests|enrollment_secrets)\b/.test(jsCode(readFileSync(f, "utf8"))));
  check("only src/devices/enrollment.js touches devices/enrollment_requests/enrollment_secrets — the CLI, the console and POST /v1/enroll all read through it", offenders.length === 0, offenders.map(rel).join(", "));
  check("bin/devices.mjs imports from src/devices/enrollment.js and holds no SQL", /from "\.\.\/src\/devices\/enrollment\.js"/.test(read("bin/devices.mjs")) && !/SELECT|UPDATE|INSERT/.test(jsCode(read("bin/devices.mjs"))));
  check("the console's Agents page imports the same module", /from "\.\.\/\.\.\/devices\/enrollment\.js"/.test(read("src/admin/pages/agents.js")));
  check("POST /v1/enroll composes submitEnrollment() rather than writing its own SQL", /from "\.\/enrollment\.js"/.test(read("src/devices/route.js")) && !/\.query\(/.test(jsCode(read("src/devices/route.js"))));
}

console.log("\n=== 5a. one retrieval layer, and one ingest, for the console and the CLI (D224's pattern) ===");
{
  const kbSearch = jsCode(read("src/admin/kb-search.js"));
  const knowledgePage = jsCode(read("src/admin/pages/knowledge.js"));
  // The console's search must COMPOSE src/kb/retrieve.js, not re-implement it. A console that
  // wrote its own SQL over kb_chunks could disagree with /v1/ask about what retrieval is, and it
  // would then be evidence about nothing. Same argument as tickets (§5 above).
  check("the console's search imports the legs and the fusion from src/kb/retrieve.js",
    /from "\.\.\/kb\/retrieve\.js"/.test(kbSearch) && /lexicalLeg/.test(kbSearch) && /semanticLeg/.test(kbSearch) && /fuseRRF/.test(kbSearch));
  check("…and writes no SQL against kb_chunks beyond the platform-scope count, and none against tsv or embedding",
    !/FROM control\.kb_chunks c\b|websearch_to_tsquery|<=>|ts_rank/.test(kbSearch),
    "retrieval belongs to src/kb/retrieve.js; a second copy here is a second answer");
  // A page RENDERS. It may name `ts_rank` in a sentence explaining a column — pages/knowledge.js
  // does — but it must not issue a query or reach into retrieve.js itself, or the composition in
  // kb-search.js stops being the single definition of what the console searched.
  //
  // metrics.js is the ONE page that issues SQL, and §7 below constrains it to counts. It is named
  // here rather than excluded silently: an exception a rule does not mention is a rule that has
  // quietly stopped applying.
  const sqlPages = pageFiles.filter((f) => /\.query\(/.test(jsCode(readFileSync(f, "utf8")))).map(rel);
  // 2026-09-13: metrics.js was the one exception and no longer is. It had its own SELECT over the
  // sessions table while outcomeCounts() and deflectionOf() sat in src/sessions/store.js - which is
  // how a page comes to say a number cannot be computed while the store computes it. NO page issues
  // SQL now, so this is the stronger statement rather than the named exception.
  check("NO admin page issues SQL at all - every figure on every page comes from a store (D224)",
    sqlPages.length === 0, sqlPages.join(","));
  check("no admin page imports the retrieval legs directly — the composition in kb-search.js is the console's one definition of a search",
    pageFiles.every((f) => !/from "[^"]*kb\/retrieve\.js"/.test(jsCode(readFileSync(f, "utf8")))));
  check("the console's ingest goes through ingestAndEmbed() in src/kb/ingest.js",
    /ingestAndEmbed/.test(knowledgePage) && /from "\.\.\/\.\.\/kb\/ingest\.js"/.test(knowledgePage));
  check("bin/kb.mjs ingest calls THE SAME function, so the CLI and the console cannot disagree",
    /ingestAndEmbed\(\{/.test(jsCode(read("bin/kb.mjs"))));
  check("the console never writes to kb_articles or kb_chunks itself",
    adminFiles.every((f) => !/(INSERT INTO|UPDATE|DELETE FROM)\s+control\.kb_/.test(jsCode(readFileSync(f, "utf8")))));

  // CLAUDE.md's Never list: "Embed a corpus with two different models."
  const ingestJs = jsCode(read("src/kb/ingest.js"));
  check("a second embedding model is refused by a pure function over corpusStatus(), not by a guess at a call site",
    /export function embeddingModelConflict\(status, model\)/.test(ingestJs) && /present\.length === 1 && present\[0\] === model/.test(ingestJs));
  check("ingestAndEmbed consults it BEFORE embedding, and the ingest still lands when it refuses",
    ingestJs.indexOf("embed.refused = embeddingModelConflict") < ingestJs.indexOf("await embedPending(") &&
    ingestJs.indexOf("await ingestBundle(") < ingestJs.indexOf("embed.refused = embeddingModelConflict"));

  // §5.16c and D207 and D203. These are the three caveats CLAUDE.md forbids quoting a retrieval
  // figure without, and the search page is the console's only retrieval figure.
  check("the search page carries the no-reranker caveat (D207)", /D207/.test(knowledgePage) && /reranker/.test(knowledgePage));
  check("…the dev-embedder caveat (D203)", /D203/.test(knowledgePage));
  check("…and says NO THRESHOLD is drawn and why (§5.16c)",
    /5\.16c/.test(knowledgePage) && /threshold/.test(knowledgePage) && /2\/61/.test(read("src/admin/pages/knowledge.js")));
  check("the search page draws no floor, threshold or 'good match' line in code either",
    !/RELEVANCE_FLOOR|floor\s*[:=]|score\s*[<>]=?\s*0\./.test(jsCode(read("src/admin/pages/knowledge.js"))));
  check("the platform select offers exactly the values a real probe can produce (D162), not free text",
    /SEARCH_PLATFORMS = Object\.freeze\(\["any", "windows", "macos", "linux"\]\)/.test(kbSearch)
    && /normalisePlatform/.test(knowledgePage));

  // D226, DECIDED 2026-09-09 AND DECIDED NARROWER THAN PROPOSED: the text of a chunk the model
  // receives is on the page; the text of a chunk below DEFAULT_TOP_K is not. These four assertions
  // are the whole of that guarantee, and they check it STRUCTURALLY — the view model carries no
  // text for an unsent chunk, so a page cannot leak one by forgetting a condition.
  check("chunk text reaches the view model ONLY through sentText, guarded by forModel (D226)",
    /sentText: forModel \? c\.text : null/.test(kbSearch)
    && (kbSearch.match(/c\.text/g) ?? []).length === 1, (kbSearch.match(/c\.text/g) ?? []).join(","));
  check("…and the legs, the fusion and the sent list are stripped of text before they leave this module",
    /const noText = \(c\) => \{ const \{ text, \.\.\.rest \} = c; return rest; \}/.test(kbSearch)
    && /lexical: legs\.lexical\.map\(noText\), semantic: legs\.semantic\.map\(noText\)/.test(kbSearch)
    && /fused: fused\.map\(noText\)/.test(kbSearch) && /forModel: forModel\.map\(noText\)/.test(kbSearch));
  check("no console page reads a chunk's `.text` at all — it can only read `.sentText`",
    pageFiles.every((f) => !/\b(c|chunk|ch)\.text\b/.test(jsCode(readFileSync(f, "utf8")))),
    pageFiles.filter((f) => /\b(c|chunk|ch)\.text\b/.test(jsCode(readFileSync(f, "utf8")))).map(rel).join(","));
  check("the page renders sentText escaped, through the html tag, and never as markdown",
    /<blockquote>\$\{c\.sentText\}<\/blockquote>/.test(read("src/admin/pages/knowledge.js"))
    && !/\braw\(/.test(jsCode(read("src/admin/pages/knowledge.js"))));
  check("the page says what is shown, what is not, and cites D226 and D53",
    /D226/.test(knowledgePage) && /D53/.test(knowledgePage) && /what the model was given/.test(read("src/admin/pages/knowledge.js")));

  // A search names nobody, so it is not audited — and that is stated where a reader will look.
  check("search is NOT audited, and the file says why rather than leaving it to inference",
    !/ctx\.audit\("kb\.search/.test(knowledgePage) && /SEARCH IS NOT AUDITED/.test(read("src/admin/pages/knowledge.js")));
  check("an ingest IS audited, with counts and the model and NEVER article text",
    /ctx\.audit\("kb\.ingest"/.test(knowledgePage) && /ctx\.audit\("kb\.ingest\.refused"/.test(knowledgePage)
    && !/detail: \{[^}]*bundle\b|articles: bundle\.articles/.test(knowledgePage));
  check("the ingest form states that the corpus is cross-tenant, in words, above the button (D45)",
    /Cross-tenant: this changes what EVERY tenant/.test(read("src/admin/pages/knowledge.js")));
  check("the review queue's gap row links into the search and only when the question text exists",
    /\/admin\/knowledge\/search\?q=\$\{encodeURIComponent\(g\.queryText\)/.test(read("src/admin/pages/review.js"))
    && /if \(!g\.queryText \|\| !ctx\.permissions\.has\("knowledge\.read"\)\) return "";/.test(read("src/admin/pages/review.js")));
  // The rule is that the console gets the SAME instances the ask route got — not that the argument
  // list never grows. Anchored on the two names in order rather than on a closing brace, so D267's
  // getBoundAddress could be added without loosening what this actually defends.
  check("the console's embedder and retrieval health reader are the ones the ask route got, passed from src/index.js",
    /adminHandler\(\{ log, embedder, retrievalHealth[,}]/.test(index)
    && /embedder = null, retrievalHealth = null[,}]/.test(routerJs));
}

console.log("\n=== 5g. auto-close (P5, D289): bound to the resolution, cancelled on every way out, the setting under settings.write ===");
{
  const q = read("src/tickets/query.js"), qCode = jsCode(q);
  const page = read("src/admin/pages/tickets.js"), pageJs = jsCode(page);
  const cli = read("bin/tickets.mjs"), cliJs = jsCode(cli);
  const ac = read("src/tickets/autoclose.js"), acJs = jsCode(ac);
  check("resolveTicket() binds the fresh resolution to ONE job inside its transaction, after the UPDATE, and returns the instant",
    /RETURNING t\.id, prev\.was, t\.resolved_at/.test(qCode) && /const \{ autoCloseAt \} = await scheduleAutoclose\(c, \{ schema, ticketId: rows\[0\]\.id, resolvedAt: rows\[0\]\.resolved_at \}\);/.test(qCode) && /return \{ from: was, to: "resolved", code, noted: trimmed !== null, autoCloseAt \};/.test(qCode));
  check("scheduleAutoclose(): reads the tenant's hours, cancels any queued job for the ticket FIRST, enqueues at resolved_at + hours, writes id and instant on the row; off -> both null and nothing enqueued",
    /const hours = await autocloseHoursForSchema\(schema\);\s*await cancelJobsFor\(AUTOCLOSE_JOB, ticketId\);/.test(qCode) && /if \(hours === null\) \{\s*await c\.query\("UPDATE tickets SET auto_close_at = NULL, auto_close_job_id = NULL WHERE id = \$1"/.test(qCode) && /hours \* 3_600_000/.test(qCode) && /enqueue\(\{ type: AUTOCLOSE_JOB, tenantSchema: schema, refId: ticketId, runAfter: at \}\)/.test(qCode) && /SET auto_close_at = \$2, auto_close_job_id = \$3::bigint,\s*auto_close_rearms = 0, resolution_undelivered_at = NULL/.test(qCode));
  // D290. TWO functions bind a clock now, and the difference between them IS the decision: one
  // runs from when the desk wrote the resolution, one from when the requester was SHOWN it.
  check("rearmAutoclose() binds the clock to a moment passed IN, so one function serves the ack (from the moment they saw it) and the re-arm (from now)",
    /async function rearmAutoclose\(c, \{ schema, ticketId, from, attempt \}\)/.test(qCode) && /new Date\(from\)\.getTime\(\) \+ hours \* 3_600_000/.test(qCode) && /auto_close_rearms = \$4, resolution_undelivered_at = NULL/.test(qCode));
  check("ARM ON ACK: acknowledging a resolution re-arms that ticket's clock FROM the acknowledgement, and only the FIRST ack can, because the UPDATE stamps only a null column",
    /RETURNING e\.ticket_id, e\.kind, e\.read_by_requester_at/.test(qCode) && /rows\.filter\(\(x\) => x\.kind === "resolution"\)/.test(qCode) && /rearmAutoclose\(c, \{ schema, ticketId: t\[0\]\.id, from: r\.read_by_requester_at, attempt: 0 \}\)/.test(qCode) && /e\.read_by_requester_at IS NULL/.test(qCode));
  check("the delivery the gate reads is read_by_requester_at on the CURRENT resolution entry - the newest written at or after resolved_at, so an EARLIER resolution the requester did see cannot close this one",
    /async function currentResolutionDelivery\(c, ticketId, resolvedAt\)/.test(qCode) && /kind = 'resolution' AND created_at >= \$2::timestamptz/.test(qCode) && /ORDER BY created_at DESC, id DESC LIMIT 1/.test(qCode));
  check("EVERY way out of resolved clears the binding in its UPDATE and withdraws the job: requesterComment (reopen), confirmResolution, setTicketState",
    (qCode.match(/auto_close_at = NULL, auto_close_job_id = NULL/g) ?? []).length >= 5 && (qCode.match(/await cancelJobsFor\(AUTOCLOSE_JOB, /g) ?? []).length >= 4 && /if \(was === "resolved"\) await cancelJobsFor\(AUTOCLOSE_JOB, rows\[0\]\.id\);/.test(qCode));
  check("…and clears D290's two columns with it: a new resolution is a fresh attempt to reach the requester, and a ticket that has left resolved carries no verdict about delivery",
    (qCode.match(/auto_close_rearms = 0, resolution_undelivered_at = NULL/g) ?? []).length >= 4);
  check("closeByAutoclose() is the handler's one write and it is guarded on state, the job id AND the due instant, in the WHERE (D280's rule, D270's contract)",
    /export async function closeByAutoclose\(c, \{ schema, ticketId, jobId, author, maxRearms = 3 \}\)/.test(qCode) && /WHERE t\.id = \$1::uuid AND t\.state = 'resolved' AND t\.auto_close_job_id = \$2::bigint AND t\.auto_close_at <= now\(\)/.test(qCode) && /closed_by = 'auto'/.test(qCode) && /FOR UPDATE/.test(qCode));
  // D290 - THE FOURTH CONDITION, and the one the click-through's T8.5 was written to catch.
  check("…and it does not close at all until the resolution has been DELIVERED: the gate is read_by_requester_at, not notified_at - handed to an app is not shown to a person",
    /if \(!delivery\?\.readByRequesterAt\)/.test(qCode) && /const delivery = await currentResolutionDelivery\(c, t\.id, t\.resolved_at\);/.test(qCode));
  check("…undelivered RE-ARMS rather than closing or failing, and gives up out loud after maxRearms rather than waiting forever",
    /if \(attempt > maxRearms\)/.test(qCode) && /resolution_undelivered_at = now\(\)/.test(qCode) && /gaveUp: true/.test(qCode) && /rearmed: true/.test(qCode));
  check("…and the console has a reader for the give-up list, so 'resolved, never delivered' is a queue item and not only a column",
    /export async function listUndeliveredResolutions\(schema\)/.test(qCode) && /state = 'resolved' AND resolution_undelivered_at IS NOT NULL/.test(qCode) && /listUndeliveredResolutions/.test(read("src/admin/pages/tickets.js")));
  check("…and a miss returns a sentence rather than throwing - the four reasons, each named", /is \$\{t\.state\}, not resolved/.test(qCode) && /not bound to any job/.test(qCode) && /NEWER resolution bound to job/.test(qCode) && /is not due until/.test(qCode));
  check("the job type is ONE constant, exported from query.js and re-exported by autoclose.js; nothing spells the string twice", (q.match(/"ticket\.autoclose"/g) ?? []).length === 1 && !/"ticket\.autoclose"/.test(acJs) && /export \{ AUTOCLOSE_JOB \};/.test(acJs));
  check("no P5 placeholder comment survives in query.js", !/P5 WILL CANCEL|P5: cancel the ticket\.autoclose job/.test(q));
  check("the requester shape carries autoCloseAt and the column string carries t.auto_close_at; the job id is NOT in either", /t\.closed_by, t\.auto_close_at`/.test(qCode) && /autoCloseAt: t\.auto_close_at \?\? null,\n\}\);/.test(qCode) && !/auto_close_job_id/.test(qCode.slice(qCode.indexOf("const REQUESTER_COLUMNS"), qCode.indexOf("export async function getTicketForRequester"))));
  check("the setting: control.tenants.ticket_autoclose_hours, read by schema in the store and by tenant id for the console, written by ONE function that refuses out-of-range and takes null as off",
    /SELECT ticket_autoclose_hours FROM control\.tenants WHERE schema_name = \$1/.test(qCode) && /SELECT ticket_autoclose_hours FROM control\.tenants WHERE id = \$1/.test(acJs) && /UPDATE control\.tenants SET ticket_autoclose_hours = \$2 WHERE id = \$1/.test(acJs) && /n < 1 \|\| n > MAX_AUTOCLOSE_HOURS/.test(acJs) && /export const DEFAULT_AUTOCLOSE_HOURS = 72;/.test(acJs) && /export const MAX_AUTOCLOSE_HOURS = 8760;/.test(acJs));
  check("the console's interval route is POST /admin/tickets/autoclose under settings.write, calls setAutocloseHours(), audits the VALUE (never a ticket) and the refusal",
    /route\("POST", \/\^\\\/admin\\\/tickets\\\/autoclose\\\/\?\$\/, "settings\.write", autoclosePost\)/.test(pageJs) && /await setAutocloseHours\(\{ tenantId: ctx\.tenant\.id, hours:/.test(pageJs) && /ctx\.audit\("ticket\.autoclose\.set", \{ detail: \{ hours: r\.hours \} \}\)/.test(pageJs) && /ctx\.audit\("ticket\.autoclose\.refused"/.test(pageJs));
  check("…the panel is drawn only for settings.read, the form only for settings.write, and the copy calls 72 a PROPOSAL and says a change is not retroactive",
    /ctx\.permissions\.has\("settings\.read"\) \? await autocloseSetting\(\{ tenantId: ctx\.tenant\.id \}\) : undefined/.test(pageJs) && /ctx\.permissions\.has\("settings\.write"\) \? html/.test(pageJs) && /is the default and a proposal, not a measured figure/.test(page) && /an instant already shown to a requester is kept/.test(page));
  check("the detail page says when a resolved ticket closes on its own and what stops it; the Resolve form says resolving starts the clock; a closed-by-auto ticket says why",
    /Closes automatically \$\{when\(t\.autoCloseAt\)\}/.test(page) && /a comment from them reopens it, a confirmation closes it as theirs/.test(page) && /Resolving starts a \$\{autocloseHours\}-hour clock \(D289\)/.test(page) && /neither confirmed nor reopened within the tenant's interval \(D289\)/.test(page) && /Will not close on its own/.test(page));
  check("…and neither surface says the requester was emailed or notified of the close", !/emailed about the close|requester (is|was|has been) notified/.test(page + cli));
  check("the CLI: show prints auto-close and glosses closed_by auto; resolve prints the instant or that auto-close is off; autoclose reads/sets through the SAME setAutocloseHours()",
    /t\.autoCloseAt/.test(cliJs) && /the auto-close job: neither confirmed nor reopened/.test(cli) && /closes automatically at \$\{r\.autoCloseAt\.toISOString\(\)\}/.test(cliJs) && /cmd === "autoclose"/.test(cliJs) && /await setAutocloseHours\(\{ tenantId: row\.id/.test(cliJs) && /await autocloseSetting\(\{ tenantId: row\.id \}\)/.test(cliJs));
  const idx = read("src/index.js");
  check("index.js no longer says nothing is registered", !/Nothing is registered yet/.test(idx) && /One handler is registered since P5/.test(idx));
}

console.log("\n=== 6. honest stubs: no zero stands in for an absent concept (exit criterion 6) ===");
const agents = read("src/admin/pages/agents.js");
check("the Agents page composes src/devices/enrollment.js rather than writing its own SQL (B3, same D224 argument as tickets/kb)",
  /from "\.\.\/\.\.\/devices\/enrollment\.js"/.test(jsCode(agents)) && !/\.query\(/.test(jsCode(agents)));
check("the Agents page says what a credential proves (a per-OS-user enrollment) and does NOT prove (machine, hardware, person), and names why D61 is still owed (D200/D201)",
  /does NOT prove which machine/.test(agents) && /per-OS-user enrollment/.test(agents) && /D61/.test(agents) && /D200\/D201/.test(agents));
for (const p of ["review", "knowledge", "agents", "metrics", "settings", "tickets"]) {
  check(`pages/${p}.js uses notYet() to say what is missing and why`, /notYet\(\{/.test(read(`src/admin/pages/${p}.js`)));
}
check("the Metrics page says deflection cannot be computed and why (D89/D90)", /cannot be computed/.test(read("src/admin/pages/metrics.js")) && /D90/.test(read("src/admin/pages/metrics.js")));
check("the Review page is home and names D177 and D223", /D177/.test(read("src/admin/pages/review.js")) && /D223/.test(read("src/admin/pages/review.js")));

console.log("\n=== 6a. the Agents page's premise is pinned to the CLIENT's behaviour — INVERTED on 2026-09-12: the client enrolls now (D272–D274, D282) ===");
{
  // THE INVERSION IS THE WHOLE VALUE, AND IT HAS NOW RUN BOTH WAYS. From 2026-09-12 (P0.75) this
  // block required the Agents page to say that no endpoint enrolls itself, and failed the day a
  // client file called POST /v1/enroll. That day was the same day: P3b added
  // client/src/agent/enrollment.js and this block failed with the message it was written to print
  // ("THE CLIENT NOW ENROLLS … D272/D273's copy is FALSE and must be revisited"). The writer
  // (last_seen_at on every authenticated request) and the enforcement (a revoked credential refused
  // on its next request) landed FIRST, in the hub commits; then this copy was rewritten; then this
  // block was inverted. Now it requires the page to say what the list IS, and it fails the day
  // client/src STOPS calling the route — because then the new copy is the false one.
  //
  // The page is RENDERED, not read: agentsBody() is pure, called with fake rows, and the assertions
  // run against the HTML an operator receives. Comments are stripped before the client search, so a
  // file explaining that it enrolls cannot count as enrolling; a string literal naming the route can.
  const CLIENT_SRC = join(SERVER, "..", "client", "src");
  const callsEnroll = (dir) => walk(dir).filter((f) => /\.(m?js)$/.test(f) && /\/v1\/enroll\b/.test(jsCode(readFileSync(f, "utf8"))));
  const onServer = callsEnroll(join(SERVER, "src"));
  check("the detector is not vacuous: pointed at server/src it finds the route (index.js dispatches on the literal)", onServer.some((f) => /index\.js$/.test(f)), onServer.map(rel).join(","));
  const inClient = callsEnroll(CLIENT_SRC);
  const { agentsBody } = await import("../src/admin/pages/agents.js");
  const fakeCtx = { permissions: new Set(["agents.read", "agents.manage"]), csrf: "test-csrf", tenant: { id: "t" } };
  const issued = new Date("2026-09-12T20:00:00Z");
  const fakeDevice = { id: "d1", deviceKeyId: "demo-laptop-01", mode: "auto", status: "revoked", enrolledAt: new Date("2026-09-10T06:53:00Z"), lastSeenAt: new Date("2026-09-10T06:53:00Z"), credentialIssuedAt: null };
  const active = { ...fakeDevice, id: "d2", deviceKeyId: "ep-0123456789abcdef0123456789abcdef", status: "active", credentialIssuedAt: issued, lastSeenAt: issued };
  const rendered = String(agentsBody(fakeCtx, { pending: [], devices: [fakeDevice, active], autoApprove: false, secrets: [] }));
  check("agentsBody() renders without a database (the fake rows reached the HTML)", /demo-laptop-01/.test(rendered) && /ep-0123456789abcdef/.test(rendered));
  if (inClient.length > 0) {
    check("client/src calls POST /v1/enroll — in src/agent/enrollment.js, the client half of B3 (D282); the premise D272/D273 rested on has ended", inClient.some((f) => /agent[\\/]enrollment\.js$/.test(f)), inClient.map((f) => f.slice(CLIENT_SRC.length + 1)).join(","));
    check("D272 revisited: the page says endpoints enroll THEMSELVES at startup, and how (config.json's secret)", /Matic Desk endpoints enroll themselves at startup/.test(rendered) && /config\.json/.test(rendered) && /enrollment secret/.test(rendered));
    check("…that each row is ONE ENROLLMENT, per OS user and not per machine, and why (the credential lives in that account's userData)", /per OS user, not per machine/.test(rendered) && /userData/.test(rendered));
    check("…that an endpoint with no secret is absent, that hand-enrolled devices are here too, and that the counts are enrollments, not people or machines", /no\s+secret configured does not appear/.test(rendered.replace(/\s+/g, " ")) && /bin\/devices\.mjs enroll/.test(rendered) && /enrollments, not\s+people or machines/.test(rendered.replace(/\s+/g, " ")));
    check("…and it is still ABOVE THE FOLD, a limit() note between the stat grid and the first panel", rendered.indexOf("enroll themselves") > rendered.indexOf('class="grid"') && rendered.indexOf("enroll themselves") < rendered.indexOf('<div class="panel">') && /<p class="limit">[^]*?enroll themselves/.test(rendered));
    check("the old caveat is GONE from the page: no 'No Matic Desk endpoint enrolls itself', no 'not a fleet'", !/No Matic Desk endpoint enrolls itself/.test(rendered) && !/counts are not a fleet/.test(rendered));
    check("D273 REVERTED: the device table is headed 'Last seen' again, with a Credential column beside it", /<th>Enrolled<\/th><th>Credential<\/th><th>Last seen<\/th>/.test(rendered) && !/Last enrollment activity/.test(rendered));
    check("D273 REVERTED: the note says it is a heartbeat written on every request that presents the credential, and what a never-presented device shows", /A heartbeat: written on every request that presents this device&#39;s credential \(D282\)/.test(rendered) && /never presented its credential shows when it was enrolled/.test(rendered) && !/Not a heartbeat/.test(rendered));
    check("D273 REVERTED: the revoke caveat says revoking blocks the endpoint's NEXT authenticated request, and names the loopback exception (D283)", /Revoke selected<\/button>\s*<span[^>]*>Revoking blocks the endpoint&#39;s NEXT authenticated request/.test(rendered) && /D283/.test(rendered) && !/does not block anything/.test(rendered));
    check("the Credential column reads 'issued <when>' for a device that has one and 'none yet' for a hand-approved device whose endpoint has not asked", /issued 2026-09-12 \d\d:\d\d/.test(rendered) && /none yet/.test(rendered));
    check("the notYet() block answers the OTHER question honestly: what the credential proves (a per-OS-user enrollment) and what it does not (machine, hardware, person)", /What is authenticated here, and what is not/.test(rendered) && /per-OS-user enrollment of the software/.test(rendered) && /does NOT prove which machine/.test(rendered) && !/Nothing here is authenticated yet/.test(rendered));
    check("the source no longer marks the D273 sentences TEMPORARY BY DESIGN — the condition they were written under was met, and the header says so", !/TEMPORARY BY DESIGN/.test(agents) && !/REVERT WHEN P3 LANDS/.test(agents) && /D273, REVERTED on 2026-09-12/.test(agents));
    const readOnly = String(agentsBody({ ...fakeCtx, permissions: new Set(["agents.read"]) }, { pending: [], devices: [fakeDevice], autoApprove: false, secrets: [] }));
    check("a read-only role sees the revoke caveat too (the REVOKED pill is on its screen), without the button", /Revoking blocks the endpoint&#39;s NEXT authenticated request/.test(readOnly) && !/Revoke selected/.test(readOnly));
  } else {
    check("client/src has NO call to POST /v1/enroll — but it did from 2026-09-12 (src/agent/enrollment.js, D282). If that file is gone, the Agents page's copy ('endpoints enroll themselves at startup') is FALSE and D272's never-enrolls caveat must return; re-invert this block for whichever premise is true now.", false);
  }
}

console.log("\n=== 7. transcripts: no console route reads session content (exit criterion 4, D154) ===");
const sessionReaders = adminFiles.filter((f) => /FROM sessions/.test(jsCode(readFileSync(f, "utf8"))));
check("NO admin file reads `sessions` directly - the console asks the sessions store for counts and gets counts, so exit criterion 4 is structural rather than a promise about one SELECT",
  sessionReaders.length === 0, sessionReaders.map(rel).join(","));
check("…and the readers it uses return counts and a ratio, never a row with content in it",
  /import \{ outcomeCounts, deflectionOf \} from "\.\.\/\.\.\/sessions\/store\.js"/.test(read("src/admin/pages/metrics.js")) && !/listSessions|getSession/.test(jsCode(read("src/admin/pages/metrics.js"))));
check("no admin route pattern mentions sessions or transcripts", pageFiles.every((f) => !/route\("(GET|POST)", [^,]*(session|transcript)/i.test(readFileSync(f, "utf8"))));
check("tiers.js refuses the unescalated tier unconditionally (no 'unless')", /case "unescalated":\s*return \{ allowed: false/.test(jsCode(read("src/admin/tiers.js"))));

console.log("\n=== 8. no new dependency (D221) ===");
const pkg = JSON.parse(read("package.json"));
check("pg is still the only dependency", JSON.stringify(Object.keys(pkg.dependencies)) === '["pg"]' && Object.keys(pkg.devDependencies ?? {}).length === 0);
const imports = adminFiles.flatMap((f) => [...jsCode(readFileSync(f, "utf8")).matchAll(/from "([^"]+)"/g)].map((m) => m[1]));
check("every import under src/admin is node: or relative", imports.every((i) => i.startsWith("node:") || i.startsWith("./") || i.startsWith("../")), imports.filter((i) => !(i.startsWith("node:") || i.startsWith("."))).join(","));
check("no bundler, no framework: no package.json build script", !("build" in pkg.scripts));

console.log("\n=== 8a. fonts are self-hosted, never fetched (D225) ===");
{
  const css = htmlJsCss();
  const faces = [...css.matchAll(/@font-face \{[\s\S]*?\}/g)].map((m) => m[0]);
  check("three @font-face blocks", faces.length === 3, String(faces.length));
  check("every src is a same-origin /admin/assets/ url, not http(s), not data:, not local()",
    faces.every((f) => /src: url\("\/admin\/assets\/[a-z0-9-]+\.woff2"\) format\("woff2"\);/.test(f) && !/https?:|data:font|local\(/.test(f)));
  check("the stylesheet fetches nothing from another host", !/url\(\s*["']?https?:/.test(css));
  const assetsJs = jsCode(read("src/admin/assets.js"));
  check("assets are served from an allow-list, never a directory listing or a path built from the URL",
    /Object\.hasOwn\(ASSETS, name\)/.test(assetsJs) && !/readdirSync|join\(HERE, "assets", name\)/.test(assetsJs));
  check("every file the allow-list names exists on disk", Object.values(JSON.parse(JSON.stringify(readAssets()))).every((a) => statSync(join(SERVER, "src", "admin", "assets", a.file)).size > 1000));
  check("the CSP admits self-hosted fonts and data: images and nothing else new", /font-src 'self'/.test(routerJs) && /img-src data:/.test(routerJs) && !/script-src/.test(routerJs));
  check("assets are answered before the session is loaded", routerJs.indexOf("serveAsset(req, res, url.pathname)") < routerJs.indexOf("await loadSession("));
  check("assets/SOURCES.md records the licence and where each file came from", /SIL Open Font License/.test(read("src/admin/assets/SOURCES.md")) && /fonts\.gstatic\.com/.test(read("src/admin/assets/SOURCES.md")));
}

console.log("\n=== 8b. logged question text expires (D229), and the demo hub logs (D227) ===");
{
  const retrieveJs = jsCode(read("src/kb/retrieve.js"));
  check("the retention window defaults to 90 and cannot be raised above it", /QUESTION_RETENTION_MAX_DAYS = 90/.test(retrieveJs) && /Math\.min\(n, QUESTION_RETENTION_MAX_DAYS\)/.test(retrieveJs));
  check("MATIC_KB_QUESTION_RETENTION_DAYS=0 turns text logging off entirely", /questionRetentionDays\(\) > 0/.test(retrieveJs));
  check("the sweep NULLs the text and keeps the row", /SET query_text = NULL/.test(retrieveJs) && !/DELETE FROM control\.kb_retrieval_log/.test(retrieveJs));
  check("the sweep runs INSIDE every log write, on the same client — not a scheduled job", retrieveJs.indexOf("await pruneQuestionText({ client: cl })") > retrieveJs.indexOf("INSERT INTO control.kb_retrieval_log") && /if \(keepQuery\) await pruneQuestionText/.test(retrieveJs));
  check("logRetrieval decides whether to keep the sentence through questionLoggingEnabled()", /const keepQuery = questionLoggingEnabled\(\);/.test(retrieveJs));
  check("bin/kb.mjs has the manual sweep", /case "prune-questions"/.test(read("bin/kb.mjs")) && /prune-questions/.test(read("bin/kb.mjs").split("usage:")[1] ?? ""));
  check("the demo launcher turns logging on for the hub it starts (D227)", /\$env:MATIC_KB_LOG_QUERIES = '1'/.test(read("../tools/launchers/start-hub.ps1")));
  check("src/index.js says at startup whether text is logged and for how long", /question text IS LOGGED/.test(read("src/index.js")) && /question text is NOT logged/.test(read("src/index.js")));
  check("the review page tells the admin the window, from the same function", /questionRetentionDays\(\)/.test(read("src/admin/pages/review.js")) && /D229/.test(read("src/admin/pages/review.js")));
  check("no scheduled worker was added for this (the control plane has none)", !/setInterval|cron|schedule/i.test(retrieveJs));
}

console.log("\n=== 9. escaping is the default ===");
const htmlJs = read("src/admin/html.js");
check("html`` escapes every interpolation unless Safe", /if \(v instanceof Safe\) return v\.s;/.test(htmlJs) && /return esc\(v\);/.test(htmlJs));
const rawUses = pageFiles.filter((f) => /\braw\(/.test(jsCode(readFileSync(f, "utf8"))));
check("no page uses raw() — the escape-hatch stays unused until a sanitiser exists", rawUses.length === 0, rawUses.map(rel).join(","));

console.log("\n=== 10. the development TOTP bypass cannot drift into skipping the password (D267) ===");
{
  const bypassJs = read("src/admin/dev-bypass.js");
  const routerRaw = read("src/admin/router.js");

  // THE ONE THAT MATTERS. The bypass is consulted at a single point, and that point is BELOW the
  // password check. A later edit that moves it above — to "simplify the branches", say — turns a
  // single-factor dev mode into an open door, and would otherwise pass every behavioural test
  // written against the loopback case. Positions in the source, so the ordering itself is pinned.
  const pwAt = routerJs.indexOf("if (!passwordOk)");
  const bypassAt = routerJs.indexOf("bypass.on");
  check("attemptLogin checks the password BEFORE it consults the bypass", pwAt > 0 && bypassAt > pwAt, `password@${pwAt} bypass@${bypassAt}`);
  check("…and consults it exactly once", (routerJs.match(/bypass\.on/g) ?? []).length === 1);
  check("…inside the step === null branch, not beside the password", /step === null\)\s*\{[\s\S]{0,600}?bypass\.on/.test(routerJs));

  // Guard 1, structurally: exactly one place READS the variable, so there is one verdict.
  // bin/dev.mjs (D268, `npm run start:dev`) SETS it for the child hub and reads nothing — it is the
  // launcher the mode was missing, not a second reader. It is exempted by name so a third file
  // naming the variable still fails here.
  const readers = allSrc.filter((f) => /MATIC_ADMIN_INSECURE_NO_TOTP/.test(readFileSync(f, "utf8")) && !/dev-bypass\.js$/.test(f) && rel(f) !== "bin/dev.mjs");
  check("only src/admin/dev-bypass.js reads the environment variable (bin/dev.mjs sets it, by exemption)", readers.length === 0, readers.map(rel).join(","));
  check("bin/dev.mjs sets the variable on the CHILD's environment and never consults it", /env: \{[^}]*MATIC_ADMIN_INSECURE_NO_TOTP/.test(read("bin/dev.mjs")) && !/process\.env\.MATIC_ADMIN_INSECURE_NO_TOTP/.test(jsCode(read("bin/dev.mjs"))));
  check("the variable name incriminates itself — INSECURE is in it", /MATIC_ADMIN_INSECURE_NO_TOTP/.test(bypassJs));

  // Guard 2, structurally: the address comes from the SOCKET, not from a constant or an env var.
  check("src/index.js reads the bound address from the listening socket, not from configuration",
    /httpServer\?\.address\(\)/.test(index) && /getBoundAddress/.test(index));
  check("…and hands it to the console as a GETTER, since no address exists before listen() resolves",
    /adminHandler\(\{[^)]*getBoundAddress \}\)/.test(index));
  check("an unknown bound address is REFUSED, not treated as loopback",
    /boundAddress === null \|\| boundAddress === undefined/.test(bypassJs) && /refused: true/.test(bypassJs));

  // Guard 6: the audit class is a real constrained value, not a free-text detail key.
  check("the event class is declared once and used by the router", /BYPASS_EVENT_CLASS = "insecure-dev-bypass"/.test(bypassJs) && /BYPASS_EVENT_CLASS/.test(routerJs));
  const migration = read("migrations/control/006-dev-bypass-event-class.sql");
  check("migration 006 widens the CHECK constraint rather than dropping it",
    /ADD CONSTRAINT admin_audit_class_known/.test(migration) && /insecure-dev-bypass/.test(migration) && /CHECK \(event_class IN/.test(migration));
  check("…and carries decision provenance with the status held when written (register §5.7b)",
    /DECISION PROVENANCE/.test(migration) && /D267 \(DECIDED 2026-09-12/.test(migration) && /D156/.test(migration));

  // The bypass must not be able to undo the replay defence on its way past it.
  check("recordLogin leaves totp_last_step alone when no code was verified",
    /totpStep === null/.test(usersJs) && /SET last_login_at = now\(\) WHERE id = \$1/.test(usersJs));

  // Guard 5: drawn outside the `bare` ternary, or the sign-in page would never show it.
  const htmlJs = read("src/admin/html.js");
  const insecureAt = htmlJs.indexOf(`insecure ? `), bareAt = htmlJs.indexOf("${bare ? body");
  check("the insecure banner is rendered BEFORE the bare/full branch, so sign-in shows it too",
    insecureAt > 0 && bareAt > 0 && insecureAt < bareAt, `insecure@${insecureAt} bare@${bareAt}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
