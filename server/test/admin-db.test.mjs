/**
 * The admin console against a live PostgreSQL: the handover's eight exit criteria, each tried.
 *
 * Run: npm.cmd run db:up; npm.cmd run migrate; then  node test/admin-db.test.mjs   (or `npm run test:db`)
 *
 * It creates its own tenant (`b2-test-<random>`), two admins (a tenant owner and an auditor), a
 * vendor account and one ticket, starts the hub on an ephemeral port with a stub provider and no
 * knowledge base, drives it with fetch, and removes everything it made at the end. It is safe to
 * run against a database that has real tenants in it.
 *
 *   1. An admin logs in with password plus TOTP and reaches the console.
 *   2. A read-only role cannot reach a page its role forbids, proven by trying.
 *   3. Every admin action appears in admin_audit with actor, action and timestamp.
 *   4. An unescalated session's transcript is not reachable through any console route.
 *   5. The ticket list shows real rows, and bin/tickets.mjs shows the same rows.
 *   6. The five stub destinations each state what is missing and why.
 *   7. The console does not appear in GET /'s route list.
 *   8. The console refuses non-loopback (inherited; tested in turn.test.mjs) and says so.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHubServer } from "../src/index.js";
import { migrate } from "../src/db/migrate.js";
import { createTenant, dropTenantForTests } from "../src/db/tenants.js";
import { getPool, closePool, withControl } from "../src/db/pool.js";
import { createTicket } from "../src/tickets/file.js";
import { listTickets, getTicket } from "../src/tickets/query.js";
import { createAdminUser, setAdminStatus } from "../src/admin/users.js";
import { revokeUserSessions } from "../src/admin/session.js";
import { totpCode, totpStep } from "../src/admin/auth.js";
import { resetLoginThrottle } from "../src/admin/router.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, "..");

let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}

const stubProvider = { name: "stub", model: "stub", async complete() { return { status: 200, body: {}, ms: 1 }; } };
const slug = `b2-test-${Math.random().toString(36).slice(2, 8)}`;
let schema, tenantId, server, base;
const made = { owner: null, auditor: null, vendor: null };

/** fetch that does not follow redirects and carries a cookie jar of one. */
function client() {
  let cookie = "";
  return {
    get cookie() { return cookie; },
    set cookie(v) { cookie = v; },
    async go(path, { method = "GET", form = null, headers = {} } = {}) {
      const h = { ...headers };
      if (cookie) h.cookie = cookie;
      let body;
      if (form) { h["content-type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(form).toString(); }
      const res = await fetch(base + path, { method, headers: h, body, redirect: "manual" });
      const set = res.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0];
      const text = await res.text();
      return { status: res.status, headers: res.headers, text, location: res.headers.get("location") };
    },
  };
}
const csrfOf = (html) => html.match(/name="_csrf" value="([^"]+)"/)?.[1] ?? null;
/** The audit rows for this tenant, newest first. */
async function auditRows() {
  const { rows } = await getPool().query(
    "SELECT a.action, a.subject, a.detail, a.at, u.email FROM control.admin_audit a LEFT JOIN control.admin_users u ON u.id = a.admin_user_id WHERE a.tenant_id = $1 ORDER BY a.id DESC",
    [tenantId],
  );
  return rows;
}
async function login(c, who, { code } = {}) {
  const res = await c.go("/admin/login", { method: "POST", form: { email: who.email, password: who.password, code: code ?? totpCode(who.totpSecret) } });
  return res;
}

async function setup() {
  await migrate();
  const t = await createTenant(slug, { displayName: "B2 Test Co" });
  schema = t.schemaName; tenantId = t.id;
  made.owner = await createAdminUser({ tenantId, email: `owner@${slug}.test`, roleName: "tenant_owner", password: "owner-password-12" });
  made.auditor = await createAdminUser({ tenantId, email: `auditor@${slug}.test`, roleName: "auditor", password: "auditor-password-12" });
  made.vendor = await createAdminUser({ tenantId: null, email: `vendor@${slug}.test`, roleName: "vendor_staff", password: "vendor-password-12" });
  await createTicket(schema, {
    description: "the <b>screen</b> is cracked & flickering", summary: "The user reports a cracked screen.", whatWasChecked: "online", machineName: "TEST-PC",
    category: "hardware", suggestedOwner: "desktop_support", reporter: { osUsername: "tester", firstName: "Ada", lastName: "Lovelace", location: "Floor 2", contactId: "ada@example.test" },
  });
  server = createHubServer({ provider: stubProvider, log: () => {}, kb: false, ticketTenant: schema });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
}

async function teardown() {
  await new Promise((r) => server?.close(r));
  await withControl(async (c) => {
    await c.query("DELETE FROM control.admin_audit WHERE tenant_id = $1 OR admin_user_id IN (SELECT id FROM control.admin_users WHERE email LIKE $2)", [tenantId, `%@${slug}.test`]);
    await c.query("DELETE FROM control.admin_users WHERE email LIKE $1", [`%@${slug}.test`]); // cascades sessions and grants
  });
  await dropTenantForTests(slug);
}

try {
  await setup();
  resetLoginThrottle();

  console.log("=== 7. the console is not in GET /'s route list, and the 404 does not name it ===");
  {
    const idx = await (await fetch(`${base}/`)).json();
    check("routes has no /admin entry", Array.isArray(idx.routes) && !idx.routes.some((r) => /admin/.test(r.path)));
    check("but the index names the console in its own field", idx.console?.path === "/admin");
    const nf = await (await fetch(`${base}/no-such`)).json();
    check("the 404 route list has no admin entry", !nf.routes.some((r) => /admin/.test(r)));
    const health = await fetch(`${base}/v1/health`);
    check("API responses still say x-matic-hub-auth: none", health.headers.get("x-matic-hub-auth") === "none");
  }

  console.log("\n=== fonts: self-hosted, no session needed, allow-listed (D225) ===");
  {
    const f = await fetch(`${base}/admin/assets/barlow-400.woff2`);
    const bytes = Buffer.from(await f.arrayBuffer());
    check("GET /admin/assets/barlow-400.woff2 without a session -> 200 font/woff2", f.status === 200 && f.headers.get("content-type") === "font/woff2", `${f.status} ${f.headers.get("content-type")}`);
    check("it is a woff2 file and is cached immutably", bytes.subarray(0, 4).toString("ascii") === "wOF2" && /immutable/.test(f.headers.get("cache-control") ?? ""));
    const bad = await fetch(`${base}/admin/assets/..%2F..%2Fpackage.json`);
    check("a path that is not on the allow-list -> 404, filesystem never consulted", bad.status === 404);
    const bad2 = await fetch(`${base}/admin/assets/router.js`);
    check("a real file that is not an asset -> 404", bad2.status === 404);
    const login = await (await fetch(`${base}/admin/login`)).text();
    check("the sign-in page's stylesheet points at the self-hosted files", /url\("\/admin\/assets\/barlow-400\.woff2"\)/.test(login) && !/url\(["']?https?:/.test(login));
  }

  console.log("\n=== 8. unauthenticated: redirected to a login page that says loopback-only ===");
  {
    const c = client();
    const home = await c.go("/admin");
    check("GET /admin without a session -> 303 to /admin/login", home.status === 303 && home.location === "/admin/login", `${home.status} ${home.location}`);
    const post = await c.go("/admin/tickets/MD-1000/state", { method: "POST", form: { next: "open" } });
    check("a POST without a session -> 401, not a redirect", post.status === 401);
    const login = await c.go("/admin/login");
    check("the login page is 200 HTML", login.status === 200 && /text\/html/.test(login.headers.get("content-type")));
    check("it says loopback only and that auth is unreviewed", /Loopback only/.test(login.text) && /security review/.test(login.text));
    check("it carries x-matic-hub-auth: none (nobody is authenticated yet)", login.headers.get("x-matic-hub-auth") === "none");
    check("it sets no cookie", !login.headers.get("set-cookie"));
    check("a CSP is present", /default-src 'none'/.test(login.headers.get("content-security-policy") ?? ""));
  }

  console.log("\n=== 1. login: password alone fails, password + TOTP succeeds, a replayed code fails ===");
  const owner = client();
  {
    const bad = await login(owner, made.owner, { code: "000000" });
    check("wrong TOTP -> 401, generic message, no cookie", bad.status === 401 && /Sign in failed/.test(bad.text) && !owner.cookie);
    const badPw = await owner.go("/admin/login", { method: "POST", form: { email: made.owner.email, password: "wrong-password-12", code: totpCode(made.owner.totpSecret) } });
    check("wrong password -> 401 with the SAME message", badPw.status === 401 && /Sign in failed/.test(badPw.text));
    const nobody = await owner.go("/admin/login", { method: "POST", form: { email: "nobody@nowhere.test", password: "whatever-123456", code: "123456" } });
    check("unknown email -> 401 with the SAME message (no enumeration)", nobody.status === 401 && /Sign in failed/.test(nobody.text));
    const audit = await auditRows();
    check("each failure left a login.failed audit row naming the email tried, never the password",
      audit.filter((r) => r.action === "login.failed").length >= 2 && audit.every((r) => !/password-12/.test(JSON.stringify(r))));

    const code = totpCode(made.owner.totpSecret);
    const ok = await login(owner, made.owner, { code });
    check("password + TOTP -> 303 to /admin", ok.status === 303 && ok.location === "/admin", `${ok.status} ${ok.location} ${ok.text.slice(0, 200)}`);
    const setCookie = ok.headers.get("set-cookie") ?? "";
    check("the session cookie is HttpOnly, SameSite=Lax, Path=/admin", /HttpOnly/.test(setCookie) && /SameSite=Lax/.test(setCookie) && /Path=\/admin/.test(setCookie), setCookie);
    check("and NOT Secure over plaintext loopback (session.js says why)", !/Secure/.test(setCookie));
    const { rows: sess } = await getPool().query("SELECT token_hash, totp_verified_at FROM control.admin_sessions WHERE admin_user_id = $1", [made.owner.id]);
    check("the store holds a sha256, not the cookie token", sess.length === 1 && /^[0-9a-f]{64}$/.test(sess[0].token_hash) && !owner.cookie.includes(sess[0].token_hash));
    check("totp_verified_at is recorded for D157's step-up to read", sess[0].totp_verified_at !== null);

    const replay = client();
    const again = await login(replay, made.owner, { code });
    check("REPLAY: the same code a second time is refused (RFC 6238 §5.2)", again.status === 401);
    const { rows: [u] } = await getPool().query("SELECT totp_last_step, last_login_at FROM control.admin_users WHERE id = $1", [made.owner.id]);
    check("the accepted step and the login time were recorded", Number(u.totp_last_step) === totpStep() || Number(u.totp_last_step) === totpStep() - 1 || Number(u.totp_last_step) === totpStep() + 1, String(u.totp_last_step));
    check("login.ok was audited with the actor", (await auditRows()).some((r) => r.action === "login.ok" && r.email === made.owner.email));
  }

  console.log("\n=== home is the review queue (D177); every page renders; stubs explain themselves (6) ===");
  {
    const home = await owner.go("/admin");
    check("GET /admin -> 200 'Review queue'", home.status === 200 && /<h1>Review queue<\/h1>/.test(home.text), String(home.status));
    check("authenticated pages carry x-matic-hub-auth: admin-session", home.headers.get("x-matic-hub-auth") === "admin-session");
    check("the nav shows all six destinations for the owner", ["Review queue", "Tickets", "Knowledge", "Agents", "Metrics", "Settings"].every((l) => home.text.includes(`>${l}<`) || home.text.includes(`>${l}<span`)));
    check("the tickets badge shows the tenant's new-ticket count (1)", /Tickets<span class="badge ">1<\/span>/.test(home.text));
    check("the review page names what is missing (drafts, staleness, duplicates) and why", /no data source in this build/.test(home.text) && /D90/.test(home.text));

    const agents = await owner.go("/admin/agents");
    check("Agents: 200, says enrollment is not in this build, shows NO count", agents.status === 200 && /not in this build/.test(agents.text) && !/<div class="n">\d+<\/div>/.test(agents.text));
    const metrics = await owner.go("/admin/metrics");
    check("Metrics: 200, real question counts, deflection explained as not computable", metrics.status === 200 && /asked, all time/.test(metrics.text) && /cannot be computed/.test(metrics.text));
    check("Metrics: the tenant's tickets by category are real (hardware: 1)", /<td>hardware<\/td><td>1<\/td>/.test(metrics.text));
    const knowledge = await owner.go("/admin/knowledge");
    check("Knowledge: 200 with corpus figures and the search/ingest stubs", knowledge.status === 200 && /articles<\/div>/.test(knowledge.text) && /Search as the assistant searches/.test(knowledge.text));
    const settings = await owner.go("/admin/settings");
    check("Settings: 200, lists both admins with roles and no secrets", settings.status === 200 && settings.text.includes(made.owner.email) && settings.text.includes(made.auditor.email) && !/scrypt\$/.test(settings.text) && !/totp_secret/.test(settings.text));
    check("Settings: names the CLI as the way to add an admin", /bin\/admin\.mjs create-user/.test(settings.text));
  }

  console.log("\n=== 5. tickets: the console, the query layer and the CLI show the same rows ===");
  let csrf;
  {
    const rows = await listTickets(schema);
    const list = await owner.go("/admin/tickets");
    check("GET /admin/tickets -> 200", list.status === 200);
    check("every row from listTickets() is on the page", rows.length === 1 && rows.every((r) => list.text.includes(`>${r.reference}<`)));
    check("the page says nobody has been emailed (D213's sixth surface)", /[Nn]obody has been emailed/.test(list.text));
    const cli = spawnSync(process.execPath, [join(SERVER, "bin/tickets.mjs"), "list"], { encoding: "utf8", env: { ...process.env, MATIC_TICKET_TENANT: schema } });
    check("bin/tickets.mjs list shows the same reference(s)", cli.status === 0 && rows.every((r) => cli.stdout.includes(r.reference)), cli.stderr.slice(0, 300));
    check("…and says NOBODY HAS BEEN EMAILED", /NOBODY HAS BEEN EMAILED/.test(cli.stdout));

    const ref = rows[0].reference;
    const detail = await owner.go(`/admin/tickets/${ref}`);
    check("the detail page renders", detail.status === 200 && detail.text.includes(ref));
    check("the reporter's own words are ESCAPED, not rendered", detail.text.includes("the &lt;b&gt;screen&lt;/b&gt; is cracked &amp; flickering") && !detail.text.includes("<b>screen</b>"));
    check("it says the identity is self-asserted and not authenticated", /self_asserted/.test(detail.text) && /not authenticated/.test(detail.text));
    check("viewing it was audited (ticket.view) — a record naming a person", (await auditRows()).some((r) => r.action === "ticket.view" && r.subject === ref && r.email === made.owner.email));
    csrf = csrfOf(detail.text);
    check("the state form carries a CSRF token", Boolean(csrf));

    const noCsrf = await owner.go(`/admin/tickets/${ref}/state`, { method: "POST", form: { next: "open" } });
    check("POST without the token -> 403", noCsrf.status === 403);
    check("…and was audited (csrf.refused)", (await auditRows()).some((r) => r.action === "csrf.refused"));
    const wrongCsrf = await owner.go(`/admin/tickets/${ref}/state`, { method: "POST", form: { next: "open", _csrf: "x".repeat(43) } });
    check("POST with a wrong token -> 403", wrongCsrf.status === 403);
    const crossSite = await owner.go(`/admin/tickets/${ref}/state`, { method: "POST", form: { next: "open", _csrf: csrf }, headers: { "sec-fetch-site": "cross-site" } });
    check("POST marked cross-site by the browser -> 403 even with a valid token", crossSite.status === 403);
    check("the ticket is still new", (await getTicket(schema, ref)).state === "new");

    const bad = await owner.go(`/admin/tickets/${ref}/state`, { method: "POST", form: { next: "new", _csrf: csrf } });
    check("a transition the console does not offer (new -> new) -> 400 and audited", bad.status === 400 && (await auditRows()).some((r) => r.action === "ticket.state.refused"));
    const moved = await owner.go(`/admin/tickets/${ref}/state`, { method: "POST", form: { next: "open", _csrf: csrf } });
    check("POST with the token -> 303 back to the ticket", moved.status === 303 && moved.location === `/admin/tickets/${ref}?changed=1`, `${moved.status} ${moved.location}`);
    check("the row changed", (await getTicket(schema, ref)).state === "open");
    const row = (await auditRows()).find((r) => r.action === "ticket.state");
    check("audited as ticket.state with actor, subject and {from, to} — and no ticket text", Boolean(row) && row.email === made.owner.email && row.subject === ref && row.detail.from === "new" && row.detail.to === "open" && !/cracked/.test(JSON.stringify(row)));
    const cliShow = spawnSync(process.execPath, [join(SERVER, "bin/tickets.mjs"), "show", ref], { encoding: "utf8", env: { ...process.env, MATIC_TICKET_TENANT: schema } });
    check("the CLI sees the change through the same query layer", cliShow.status === 0 && new RegExp(`${ref}\\s+open`).test(cliShow.stdout));
  }

  console.log("\n=== 2. a read-only role cannot reach a page its role forbids ===");
  const auditor = client();
  {
    const ok = await login(auditor, made.auditor);
    check("the auditor signs in", ok.status === 303);
    const home = await auditor.go("/admin");
    check("GET /admin (review.read) -> 403 for the auditor", home.status === 403 && /review\.read/.test(home.text), String(home.status));
    check("the refusal was audited (access.denied, needs review.read)", (await auditRows()).some((r) => r.action === "access.denied" && r.email === made.auditor.email && r.detail?.needs === "review.read"));
    const kb = await auditor.go("/admin/knowledge");
    check("GET /admin/knowledge -> 403", kb.status === 403);
    const agents = await auditor.go("/admin/agents");
    check("GET /admin/agents -> 403", agents.status === 403);
    const tickets = await auditor.go("/admin/tickets");
    check("GET /admin/tickets -> 200 (tickets.read)", tickets.status === 200);
    check("the auditor's nav does not draw the destinations the role lacks", !tickets.text.includes(">Review queue<") && !tickets.text.includes(">Knowledge<") && tickets.text.includes(">Metrics<"));
    const ref = (await listTickets(schema))[0].reference;
    const detail = await auditor.go(`/admin/tickets/${ref}`);
    check("the auditor sees the ticket but no state form", detail.status === 200 && !/name="next"/.test(detail.text) && /can read tickets but not change them/.test(detail.text));
    const post = await auditor.go(`/admin/tickets/${ref}/state`, { method: "POST", form: { next: "resolved", _csrf: csrfOf(detail.text) } });
    check("POST a state change as the auditor -> 403 (tickets.write), even with a valid CSRF token", post.status === 403);
    check("the ticket did not change", (await getTicket(schema, ref)).state === "open");
    const audit = await auditor.go("/admin/settings/audit");
    check("the auditor CAN read the audit log (audit.read) and sees login.ok rows", audit.status === 200 && /login\.ok/.test(audit.text));
  }

  console.log("\n=== 4. no console route reaches a session transcript (D154) ===");
  {
    for (const p of ["/admin/sessions", "/admin/sessions/00000000-0000-0000-0000-000000000000", "/admin/transcripts", "/admin/transcript/1", "/admin/tickets/MD-1000/transcript"]) {
      const r = await owner.go(p);
      check(`${p} -> 404`, r.status === 404, String(r.status));
    }
    const { rows: [cols] } = await getPool().query("SELECT string_agg(column_name, ',') AS c FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'sessions'", [schema]);
    check("and the sessions table holds no content column to reach (B1 §11)", !/text|transcript|content|body/.test(cols.c), cols.c);
  }

  console.log("\n=== vendor and disabled accounts ===");
  {
    const v = client();
    const res = await login(v, made.vendor);
    check("a vendor account (tenant_id NULL) is refused at login, citing D153", res.status === 401 && /D153/.test(res.text) && !v.cookie);
    await setAdminStatus(made.auditor.id, "disabled");
    const revoked = await revokeUserSessions(made.auditor.id);
    check("disabling revokes the live session", revoked === 1);
    const after = await auditor.go("/admin/tickets");
    check("the revoked session is sent to login", after.status === 303 && after.location === "/admin/login");
    const d = client();
    check("a disabled account cannot sign in", (await login(d, made.auditor)).status === 401);
  }

  console.log("\n=== logout ===");
  {
    const home = await owner.go("/admin");
    const token = csrfOf(home.text);
    const out = await owner.go("/admin/logout", { method: "POST", form: { _csrf: token } });
    check("POST /admin/logout -> 303 to login and clears the cookie", out.status === 303 && /Max-Age=0/.test(out.headers.get("set-cookie") ?? ""));
    owner.cookie = "";
    check("logout was audited", (await auditRows()).some((r) => r.action === "session.logout" && r.email === made.owner.email));
  }

  console.log("\n=== 3. every action appears in admin_audit with actor, action and timestamp ===");
  {
    const rows = await auditRows();
    const actions = new Set(rows.map((r) => r.action));
    check("the run produced login.failed, login.ok, ticket.view, csrf.refused, ticket.state.refused, ticket.state, access.denied, session.logout",
      ["login.failed", "login.ok", "ticket.view", "csrf.refused", "ticket.state.refused", "ticket.state", "access.denied", "session.logout"].every((a) => actions.has(a)), [...actions].join(","));
    check("every row has a timestamp and an action", rows.every((r) => r.at instanceof Date && typeof r.action === "string"));
    check("every row that is an admin's action names the actor", rows.filter((r) => !/^login\.failed|^admin\./.test(r.action)).every((r) => r.email));
  }
} catch (err) {
  fail++;
  console.log(`  FAIL  the suite threw: ${err.stack ?? err.message}`);
} finally {
  try { await teardown(); } catch (err) { console.log(`  (teardown: ${err.message})`); }
  await closePool();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
