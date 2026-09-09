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

console.log("\n=== 9. escaping is the default ===");
const htmlJs = read("src/admin/html.js");
check("html`` escapes every interpolation unless Safe", /if \(v instanceof Safe\) return v\.s;/.test(htmlJs) && /return esc\(v\);/.test(htmlJs));
const rawUses = pageFiles.filter((f) => /\braw\(/.test(jsCode(readFileSync(f, "utf8"))));
check("no page uses raw() — the escape-hatch stays unused until a sanitiser exists", rawUses.length === 0, rawUses.map(rel).join(","));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
