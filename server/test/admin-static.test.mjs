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
const offenders = allSrc.filter((f) => !ticketWriters.includes(rel(f)) && /\b(FROM|UPDATE|INTO)\s+tickets\b/.test(jsCode(readFileSync(f, "utf8"))));
check("only src/tickets/ touches the tickets table — the CLI and the console both read through query.js", offenders.length === 0, offenders.map(rel).join(", "));
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
  check("the state form carries a <textarea name=\"note\"> and statePost passes it to setTicketState()", /<textarea id="note" name="note"/.test(pageJs) && /setTicketState\(ctx\.tenant\.schemaName, ref, next, \{ note \}\)/.test(pageJs));
  check("the CLI's state command takes --note and passes it the same way", /setTicketState\(tenant, ref, next, \{ note: flag\("note"\) \}\)/.test(cliJs));
  check("neither reader makes the note mandatory (the mandatory field is the requester-visible one, P2)", !/name="note"[^>]*required/.test(pageJs) && !/note.*required/i.test(cliJs));
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
  check("metrics.js is still the only page that issues SQL at all",
    sqlPages.length === 1 && sqlPages[0] === "src/admin/pages/metrics.js", sqlPages.join(","));
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

console.log("\n=== 6. honest stubs: no zero stands in for an absent concept (exit criterion 6) ===");
const agents = read("src/admin/pages/agents.js");
check("the Agents page composes src/devices/enrollment.js rather than writing its own SQL (B3, same D224 argument as tickets/kb)",
  /from "\.\.\/\.\.\/devices\/enrollment\.js"/.test(jsCode(agents)) && !/\.query\(/.test(jsCode(agents)));
check("the Agents page says devices are KNOWN, not AUTHENTICATED, and names why (D61, D200/D201)",
  /not authenticated/i.test(agents) && /D61/.test(agents) && /D200\/D201/.test(agents));
for (const p of ["review", "knowledge", "agents", "metrics", "settings", "tickets"]) {
  check(`pages/${p}.js uses notYet() to say what is missing and why`, /notYet\(\{/.test(read(`src/admin/pages/${p}.js`)));
}
check("the Metrics page says deflection cannot be computed and why (D89/D90)", /cannot be computed/.test(read("src/admin/pages/metrics.js")) && /D90/.test(read("src/admin/pages/metrics.js")));
check("the Review page is home and names D177 and D223", /D177/.test(read("src/admin/pages/review.js")) && /D223/.test(read("src/admin/pages/review.js")));

console.log("\n=== 6a. the never-enrolls caveat is pinned to the CLIENT's behaviour (D272–D274) ===");
{
  // THE INVERSION IS THE WHOLE VALUE. While no file under client/src calls the enrollment route,
  // the Agents page must say, above the fold, that no endpoint enrolls itself, that its list is
  // hand-enrolled devices only, and that its counts are not a fleet (D272) — and "Last seen" must
  // read as enrollment activity and Revoke must say it blocks nothing (D273). The day a client
  // file DOES call POST /v1/enroll, every one of those sentences becomes false, and this block
  // fails with a message saying so rather than going on guarding stale copy. Same shape as §5c's
  // reserved list: the claim is enforced, and it can only change by being edited deliberately.
  //
  // The page is RENDERED, not read: agentsBody() is pure (no database), so it is called here with
  // fake rows and the assertions run against the HTML an operator would receive. Checking the
  // source for the string would pass with the caveat inside a comment.
  //
  // The client tree is reached the way turn.test.mjs reaches it (../../client/src). Comments are
  // stripped before the search, so hub-link.js explaining that it does NOT enroll cannot count as
  // enrolling; a string literal or a template containing the route does count.
  const CLIENT_SRC = join(SERVER, "..", "client", "src");
  const callsEnroll = (dir) => walk(dir).filter((f) => /\.(m?js)$/.test(f) && /\/v1\/enroll\b/.test(jsCode(readFileSync(f, "utf8"))));
  // The detector must be able to find the route where it IS named in code, or a pass below is
  // vacuous. src/index.js dispatches on the literal. A string literal naming the route counts,
  // deliberately: a false positive here is loud and read by a person; a false negative is silent.
  const onServer = callsEnroll(join(SERVER, "src"));
  check("the detector is not vacuous: pointed at server/src it finds the route (index.js dispatches on the literal)", onServer.some((f) => /index\.js$/.test(f)), onServer.map(rel).join(","));
  const inClient = callsEnroll(CLIENT_SRC);
  const { agentsBody } = await import("../src/admin/pages/agents.js");
  const fakeCtx = { permissions: new Set(["agents.read", "agents.manage"]), csrf: "test-csrf", tenant: { id: "t" } };
  const fakeDevice = { id: "d1", deviceKeyId: "demo-laptop-01", mode: "auto", status: "revoked", enrolledAt: new Date("2026-09-10T06:53:00Z"), lastSeenAt: new Date("2026-09-10T06:53:00Z") };
  const rendered = String(agentsBody(fakeCtx, { pending: [], devices: [fakeDevice, { ...fakeDevice, id: "d2", deviceKeyId: "b3-active", status: "active" }], autoApprove: false, secrets: [] }));
  check("agentsBody() renders without a database (the fake rows reached the HTML)", /demo-laptop-01/.test(rendered) && /b3-active/.test(rendered));
  if (inClient.length === 0) {
    check("client/src has NO call to POST /v1/enroll today (the premise of D272/D273)", true);
    check("D272: the rendered page says no Matic Desk endpoint enrolls itself", /No Matic Desk endpoint enrolls itself/.test(rendered));
    check("D272: …that the list is devices enrolled by hand (bin/devices.mjs enroll, curl, the test suite)", /devices enrolled by hand/.test(rendered) && /bin\/devices\.mjs enroll/.test(rendered) && /test suite/.test(rendered));
    check("D272: …and that a running endpoint does not appear here and the counts are not a fleet", /A running endpoint does not appear here, and these counts are not a fleet/.test(rendered));
    check("D272: the caveat is ABOVE THE FOLD — after the stat grid and before the first panel", rendered.indexOf("enrolls itself") > rendered.indexOf('class="grid"') && rendered.indexOf("enrolls itself") < rendered.indexOf('<div class="panel">'));
    check("D272: it is drawn as a limit() note, the position the Tickets page uses for NOBODY HAS BEEN EMAILED", /<p class="limit">[^]*?enrolls itself/.test(rendered));
    check("D272: the notYet() block is still there, below, answering the OTHER question (authenticated, not enrolled)", /Nothing here is authenticated yet/.test(rendered) && rendered.indexOf("Nothing here is authenticated yet") > rendered.indexOf("enrolls itself"));
    check("D273: the device table's column is headed Last enrollment activity, and Last seen is gone", /<th>Last enrollment activity<\/th>/.test(rendered) && !/Last seen/.test(rendered));
    check("D273: the muted line says it is not a heartbeat and why (D61)", /Not a heartbeat\. Nothing updates this when a device talks to the hub, because nothing identifies a device on a call \(D61\)/.test(rendered));
    check("D273: the revoke caveat sits beside the Revoke control and says it blocks nothing", /Revoke selected<\/button>\s*<span[^>]*>Revoking removes the row&#39;s standing\. It does not block anything/.test(rendered));
    // The two D273 sentences are conditions on the build, and the source says so where the next writer edits it.
    check("D273: the source marks both sentences TEMPORARY BY DESIGN and names the phase that reverts them", /TEMPORARY BY DESIGN/.test(agents) && /REVERT WHEN P3 LANDS/.test(agents));
    // Without agents.manage there is no Revoke button; the caveat must still be on the page, because the REVOKED pill is.
    const readOnly = String(agentsBody({ ...fakeCtx, permissions: new Set(["agents.read"]) }, { pending: [], devices: [fakeDevice], autoApprove: false, secrets: [] }));
    check("D273: a read-only role sees the revoke caveat too (the REVOKED pill is on its screen)", /Revoking removes the row&#39;s standing/.test(readOnly) && !/Revoke selected/.test(readOnly));
  } else {
    check(`THE CLIENT NOW ENROLLS (${inClient.map((f) => f.slice(CLIENT_SRC.length + 1).replace(/\\/g, "/")).join(", ")}) — D272/D273's copy is FALSE and must be revisited: the never-enrolls caveat, the 'Last enrollment activity' heading and its not-a-heartbeat note, and the revoke-blocks-nothing sentence in src/admin/pages/agents.js. Give last_seen_at its real writer (addendum G2), let revocation mean revocation, then rewrite this block for the new premise.`, false);
  }
}

console.log("\n=== 7. transcripts: no console route reads session content (exit criterion 4, D154) ===");
const sessionReaders = adminFiles.filter((f) => /FROM sessions/.test(jsCode(readFileSync(f, "utf8"))));
check("the only admin file that reads `sessions` is metrics.js, and it selects counts only",
  sessionReaders.length === 1 && rel(sessionReaders[0]) === "src/admin/pages/metrics.js" && !/SELECT \*|SELECT s\.\*/.test(jsCode(read("src/admin/pages/metrics.js"))), sessionReaders.map(rel).join(","));
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
