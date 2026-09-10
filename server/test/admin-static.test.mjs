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
check("createAdminUser always mints a TOTP secret — there is no flag to skip it", /const totpSecret = newTotpSecret\(\);/.test(usersJs) && !/skipTotp|noTotp|totp\s*=\s*false/i.test(usersJs));
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
check("a state change is audited with from/to and never the ticket's text", /ctx\.audit\("ticket\.state", \{ subject: ref, detail: \{ from: moved\.from, to: moved\.to \} \}\)/.test(read("src/admin/pages/tickets.js")));

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
  check("the console's embedder is the one the ask route got, passed from src/index.js",
    /adminHandler\(\{ log, embedder \}\)/.test(index) && /embedder = null \} = \{\}\)/.test(routerJs));
}

console.log("\n=== 6. honest stubs: no zero stands in for an absent concept (exit criterion 6) ===");
const agents = read("src/admin/pages/agents.js");
check("the Agents page runs NO query and imports no data module", !/query\(|queries\.js|db\//.test(jsCode(agents)));
check("the Agents page says enrollment is not in this build and names B3", /not in this build/.test(agents) && /B3/.test(agents));
for (const p of ["review", "knowledge", "agents", "metrics", "settings", "tickets"]) {
  check(`pages/${p}.js uses notYet() to say what is missing and why`, /notYet\(\{/.test(read(`src/admin/pages/${p}.js`)));
}
check("the Metrics page says deflection cannot be computed and why (D89/D90)", /cannot be computed/.test(read("src/admin/pages/metrics.js")) && /D90/.test(read("src/admin/pages/metrics.js")));
check("the Review page is home and names D177 and D223", /D177/.test(read("src/admin/pages/review.js")) && /D223/.test(read("src/admin/pages/review.js")));

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

console.log("\n=== 9. escaping is the default ===");
const htmlJs = read("src/admin/html.js");
check("html`` escapes every interpolation unless Safe", /if \(v instanceof Safe\) return v\.s;/.test(htmlJs) && /return esc\(v\);/.test(htmlJs));
const rawUses = pageFiles.filter((f) => /\braw\(/.test(jsCode(readFileSync(f, "utf8"))));
check("no page uses raw() — the escape-hatch stays unused until a sanitiser exists", rawUses.length === 0, rawUses.map(rel).join(","));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
