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
 *
 * ===============================================================================================
 * AND, SINCE 2026-09-09, THE KNOWLEDGE PASS'S EIGHT (handover §3)
 * ===============================================================================================
 *
 *   1. A pasted bundle lands, and the page's counts equal what `node bin/kb.mjs status` prints.
 *   2. An ingest with the embedder DOWN succeeds, says the chunks are lexical-only, and a later
 *      embed completes them.
 *   3. An ingest that would introduce a SECOND embedding model is refused, with the reason, and
 *      the corpus still has one model.
 *   4. `kb.ingest` is in admin_audit with actor, counts and model — and no article text.
 *   5. A search shows the same chunks at the same ranks as `bin/kb.mjs legs`, and an uncovered
 *      query draws NO threshold.
 *   6. An `auditor` cannot open the search or the ingest; an `it_agent` can do both.
 *   7/8. Escaping, CSRF, no script — asserted in test/admin-static.test.mjs and here.
 *
 * KB-8, ADDED 2026-09-09 WITH THE ARTICLE EDITOR (D230): create and edit through the structured
 * form, both going through ingestAndEmbed() like the paste-bundle path; every save lands as
 * `unvalidated`; `kb.article.write`/`.refused` audits the id and the changed FIELD NAMES, never
 * text; a "new article" colliding with an existing id is refused rather than silently overwriting
 * it; an edit carries `body` forward unchanged (the one field the editor does not offer); a
 * platform nothing can match is warned, not refused, same as ingest; and the editor is gated on
 * knowledge.write like the ingest form.
 *
 * THE KNOWLEDGE BASE IS CONTROL-PLANE AND CROSS-TENANT (D45), SO IT HAS NO TEST NAMESPACE.
 * This suite therefore ingests articles whose ids all start `b2test-` and deletes them BY ID in
 * teardown — dropping the tenant does not touch them, because they were never in it. Everything
 * this suite embeds is embedded under THE MODEL NAME THE CORPUS ALREADY USES (see `stubEmbedder`),
 * so it can never introduce the second model whose absence it is also asserting.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHubServer } from "../src/index.js";
import { migrate } from "../src/db/migrate.js";
import { createTenant, dropTenantForTests } from "../src/db/tenants.js";
import { getPool, closePool, withControl } from "../src/db/pool.js";
import { createTicket } from "../src/tickets/file.js";
import { listTickets, getTicket } from "../src/tickets/query.js";
import { createAdminUser, resetAdminCredentials, setAdminStatus } from "../src/admin/users.js";
import { corpusStatus } from "../src/kb/ingest.js";
import { gapFeed } from "../src/admin/queries.js";
import { resetEnrollmentThrottle } from "../src/devices/enrollment.js";
import { lexicalLeg } from "../src/kb/retrieve.js";
import { verifyPassword } from "../src/admin/auth.js";
import { revokeUserSessions } from "../src/admin/session.js";
import { totpCode, totpStep } from "../src/admin/auth.js";
import { logRetrieval, pruneQuestionText, questionRetentionDays } from "../src/kb/retrieve.js";
import { adminHandler, resetLoginThrottle } from "../src/admin/router.js";
import { BYPASS_ENV } from "../src/admin/dev-bypass.js";
import http from "node:http";

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
const made = { owner: null, auditor: null, agent: null, vendor: null };

/** Article ids this suite creates. Deleted by id in teardown — the corpus is cross-tenant (D45). */
const KB_IDS = ["b2test-vpn", "b2test-badplat", "b2test-down", "b2test-editor-new"];

/**
 * A DETERMINISTIC STUB EMBEDDER, and two things about it that are deliberate.
 *
 * (1) `model` is set in setup() to WHATEVER MODEL THE CORPUS ALREADY USES. That looks like a lie
 * and is the only safe choice: `embedPending()` re-embeds every chunk whose model differs from the
 * current embedder's, so a stub with its own name would either be refused (correct, and then the
 * happy path is untestable) or, without the refusal, would overwrite the REAL corpus's 18 vectors
 * with stub ones. Borrowing the name confines this suite's writes to its own chunks. The
 * second-model refusal is then tested by temporarily setting `model` to something else, which
 * cannot write anything, because being refused is the assertion.
 *
 * (2) `mode = "down"` throws, which is the embedder outage the two-pass ingest exists for.
 *
 * The vectors are meaningless as similarity and that is fine here: this suite asserts that the
 * pipeline ran and reported itself honestly. Retrieval QUALITY is kb.test.mjs's job, against the
 * real embedder.
 */
const stubEmbedder = {
  name: "stub",
  model: "unset",
  mode: "ok",
  vector(text) {
    // A cheap deterministic unit-ish vector of the width migration 002 declared.
    let h = 2166136261;
    for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    const out = new Array(1024);
    for (let i = 0; i < 1024; i++) { h = Math.imul(h ^ i, 16777619); out[i] = ((h >>> 8) % 2000 - 1000) / 1000; }
    const norm = Math.sqrt(out.reduce((a, b) => a + b * b, 0)) || 1;
    return out.map((x) => x / norm);
  },
  async embed(texts) {
    if (this.mode === "down") throw new Error("stub embedder is down");
    return texts.map((t) => this.vector(t));
  },
  async embedQuery(text) {
    if (this.mode === "down") throw new Error("stub embedder is down");
    return this.vector(text);
  },
  async verify() { return this.mode === "down" ? { ok: false, error: "stub embedder is down" } : { ok: true, dimensions: 1024 }; },
};

/** A valid CSRF token from the it_agent's session, so §2 can prove a token is not a permission. */
let agentCsrf = null;

const bundleJson = (articles) => JSON.stringify({ bundleId: "b2test-bundle", articles });
const VPN_ARTICLE = {
  id: "b2test-vpn", type: "troubleshooting", title: "B2TEST VPN certificate expired",
  problem: "The VPN refuses to connect and names a certificate.",
  symptoms: ["b2testvpnphrase will not connect", "certificate expired on the vpn"],
  guidance: ["1. Sign out and back in to fetch a new certificate."],
  platform: "any",
};

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
/** The console's own escaping (src/admin/html.js), so a text assertion compares like with like. */
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
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
  made.agent = await createAdminUser({ tenantId, email: `agent@${slug}.test`, roleName: "it_agent", password: "agent-password-12" });
  made.vendor = await createAdminUser({ tenantId: null, email: `vendor@${slug}.test`, roleName: "vendor_staff", password: "vendor-password-12" });
  await createTicket(schema, {
    description: "the <b>screen</b> is cracked & flickering", summary: "The user reports a cracked screen.", whatWasChecked: "online", machineName: "TEST-PC",
    category: "hardware", suggestedOwner: "desktop_support", reporter: { osUsername: "tester", firstName: "Ada", lastName: "Lovelace", location: "Floor 2", contactId: "ada@example.test" },
  });
  // Borrow the corpus's own embedding-model name — see stubEmbedder's comment for why that is the
  // safe choice rather than the dishonest one. An empty corpus gets an arbitrary name.
  const existing = await corpusStatus();
  stubEmbedder.model = existing.models[0]?.model ?? "b2test-stub-embedder";
  stubEmbedder.mode = "ok";
  server = createHubServer({ provider: stubProvider, log: () => {}, kb: false, ticketTenant: schema, embedder: stubEmbedder });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
}

async function teardown() {
  await new Promise((r) => server?.close(r));
  await withControl(async (c) => {
    // B3: enrollment_requests.decided_by FKs to admin_users(id) (migration 004), and devices /
    // enrollment_secrets FK to tenants(id) — all three must go before admin_users and the tenant
    // row, or both later deletes fail with a foreign key violation.
    await c.query("DELETE FROM control.enrollment_requests WHERE tenant_id = $1", [tenantId]);
    await c.query("DELETE FROM control.devices WHERE tenant_id = $1", [tenantId]);
    await c.query("DELETE FROM control.enrollment_secrets WHERE tenant_id = $1", [tenantId]);
    await c.query("DELETE FROM control.admin_audit WHERE tenant_id = $1 OR admin_user_id IN (SELECT id FROM control.admin_users WHERE email LIKE $2)", [tenantId, `%@${slug}.test`]);
    await c.query("DELETE FROM control.admin_users WHERE email LIKE $1", [`%@${slug}.test`]); // cascades sessions and grants
    // THE KB IS CROSS-TENANT, so dropping the tenant leaves these behind. Delete by id; chunks go
    // with them by ON DELETE CASCADE (migration 002). Also the retrieval-log row §gaps inserted.
    await c.query("DELETE FROM control.kb_articles WHERE id = ANY($1)", [KB_IDS]);
    await c.query("DELETE FROM control.kb_retrieval_log WHERE tenant_label = $1", [`b2test-${slug}`]);
  });
  await dropTenantForTests(slug);
}

try {
  await setup();
  resetLoginThrottle();
  resetEnrollmentThrottle();

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

  console.log("\n=== D229: logged question text expires at the window; the row and its counts stay ===");
  {
    const LABEL = "d229-test";
    const saved = { log: process.env.MATIC_KB_LOG_QUERIES, days: process.env.MATIC_KB_QUESTION_RETENTION_DAYS };
    try {
      await withControl((c) => c.query("DELETE FROM control.kb_retrieval_log WHERE tenant_label = $1", [LABEL]));
      // Plant two rows by hand: one 100 days old, one 30 days old, both with text.
      await withControl((c) => c.query(
        `INSERT INTO control.kb_retrieval_log (tenant_label, query_text, retrieved, answered, at)
         VALUES ($1, 'old question', '[]'::jsonb, false, now() - interval '100 days'),
                ($1, 'recent question', '[]'::jsonb, false, now() - interval '30 days')`, [LABEL]));
      process.env.MATIC_KB_LOG_QUERIES = "1"; delete process.env.MATIC_KB_QUESTION_RETENTION_DAYS;
      check("the default window is 90 days", questionRetentionDays() === 90);
      const id = await logRetrieval({ query: "a fresh question", platform: "windows", tenantLabel: LABEL, result: { chunks: [], topScore: 0, floorApplied: false }, answered: false, mode: "hybrid" });
      const { rows } = await getPool().query("SELECT id, query_text, at FROM control.kb_retrieval_log WHERE tenant_label = $1 ORDER BY at", [LABEL]);
      check("three rows remain — the sweep clears text, it never deletes a row", rows.length === 3);
      check("the 100-day-old row's text is gone", rows[0].query_text === null);
      check("the 30-day-old row's text survives", rows[1].query_text === "recent question");
      check("the fresh row keeps its text because logging is on", rows[2].query_text === "a fresh question" && Number(rows[2].id) === id);
      process.env.MATIC_KB_QUESTION_RETENTION_DAYS = "7";
      check("a customer may shorten the window", questionRetentionDays() === 7);
      const n = await pruneQuestionText();
      check("the manual sweep at 7 days clears the 30-day row and nothing else", n === 1 && (await getPool().query("SELECT query_text FROM control.kb_retrieval_log WHERE tenant_label = $1 AND query_text IS NOT NULL", [LABEL])).rows.length === 1);
      process.env.MATIC_KB_QUESTION_RETENTION_DAYS = "400";
      check("nobody may lengthen it past 90", questionRetentionDays() === 90);
      process.env.MATIC_KB_QUESTION_RETENTION_DAYS = "0";
      const id0 = await logRetrieval({ query: "should not be kept", platform: null, tenantLabel: LABEL, result: { chunks: [], topScore: 0, floorApplied: false }, answered: false, mode: "hybrid" });
      check("retention 0 logs the row with NO text even with the switch on", (await getPool().query("SELECT query_text FROM control.kb_retrieval_log WHERE id = $1", [id0])).rows[0].query_text === null);
    } finally {
      if (saved.log === undefined) delete process.env.MATIC_KB_LOG_QUERIES; else process.env.MATIC_KB_LOG_QUERIES = saved.log;
      if (saved.days === undefined) delete process.env.MATIC_KB_QUESTION_RETENTION_DAYS; else process.env.MATIC_KB_QUESTION_RETENTION_DAYS = saved.days;
      await withControl((c) => c.query("DELETE FROM control.kb_retrieval_log WHERE tenant_label = $1", [LABEL]));
    }
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
    // The page explained how to CREATE an account and not how to get back into one. The generic
    // error is correct and stays; what was missing is where to go once you have read it.
    check("it points a locked-out reader at the three CLI commands that answer this screen",
      /totp --user/.test(login.text) && /--keep-totp/.test(login.text) && /admin\.mjs audit/.test(login.text));
    check("…and states the lockout duration, which is the one number the error cannot give",
      /one minute/.test(login.text));
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
    // Real since B3 (2026-09-10) — B3-1..B3-N below exercise the mechanism against a live database;
    // this is just "the page renders for the tenant owner role" as part of the six-destination pass.
    check("Agents: 200, real stat tiles (no devices enrolled here yet)", agents.status === 200 && /waiting for approval/.test(agents.text));
    const metrics = await owner.go("/admin/metrics");
    check("Metrics: 200, real question counts, deflection explained as not computable", metrics.status === 200 && /asked, all time/.test(metrics.text) && /cannot be computed/.test(metrics.text));
    check("Metrics: the tenant's tickets by category are real (hardware: 1)", /<td>hardware<\/td><td>1<\/td>/.test(metrics.text));
    const knowledge = await owner.go("/admin/knowledge");
    // Was: "…and the search/ingest stubs". All three are real since 2026-09-09 (the editor as of
    // D230): the corpus page now draws a "New article" link for a knowledge.write role.
    check("Knowledge: 200 with corpus figures, a real search form and a real ingest form",
      knowledge.status === 200 && /articles<\/div>/.test(knowledge.text)
      && /action="\/admin\/knowledge\/search"/.test(knowledge.text) && /action="\/admin\/knowledge\/ingest"/.test(knowledge.text));
    check("Knowledge: the article EDITOR is real (D230) — a New article link, and no sanitiser stub left",
      /href="\/admin\/knowledge\/new"/.test(knowledge.text) && /D230/.test(knowledge.text) && !/Write and edit articles here/.test(knowledge.text));
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

    // D269: the internal resolution note, written from the console's state form, read back on the
    // detail page and by the CLI — the round trip tenant/004's comment claimed and nothing did.
    const NOTE = "swapped the <dock> & re-seated the cable";
    const cliEnv = { ...process.env, MATIC_TICKET_TENANT: schema };
    const resolved = await owner.go(`/admin/tickets/${ref}/state`, { method: "POST", form: { next: "resolved", note: `  ${NOTE}\r\n`, _csrf: csrf } });
    check("POST resolved with a note -> 303, and the redirect says a note was recorded", resolved.status === 303 && /noted=1/.test(resolved.location ?? ""), `${resolved.status} ${resolved.location}`);
    const afterNote = await getTicket(schema, ref);
    check("the query layer returns the note, trimmed", afterNote.state === "resolved" && afterNote.closeNote === NOTE, JSON.stringify(afterNote.closeNote));
    const page2 = await owner.go(`/admin/tickets/${ref}`);
    check("the detail page renders it, ESCAPED, under a heading that says it is internal and that the requester never sees it",
      page2.text.includes(escapeHtml(NOTE)) && !page2.text.includes("<dock>") && /Internal resolution note/.test(page2.text) && /requester never sees it/.test(page2.text));
    const cliNote = spawnSync(process.execPath, [join(SERVER, "bin/tickets.mjs"), "show", ref], { encoding: "utf8", env: cliEnv });
    check("bin/tickets.mjs show prints the same note and says it is internal", cliNote.status === 0 && cliNote.stdout.includes(NOTE) && /internal resolution note/.test(cliNote.stdout), cliNote.stderr.slice(0, 200));
    const noteRow = (await auditRows()).find((r) => r.action === "ticket.state" && r.detail.to === "resolved");
    check("audited with noted: true and NOT the note's text", Boolean(noteRow) && noteRow.detail.noted === true && !JSON.stringify(noteRow).includes("dock"), JSON.stringify(noteRow?.detail));
    const closed = await owner.go(`/admin/tickets/${ref}/state`, { method: "POST", form: { next: "closed", note: "   ", _csrf: csrf } });
    check("a later move with a blank note -> 303 without noted=1, and the earlier note is KEPT (COALESCE)",
      closed.status === 303 && !/noted=1/.test(closed.location ?? "") && (await getTicket(schema, ref)).closeNote === NOTE, `${closed.status} ${closed.location}`);
    const blankRow = (await auditRows()).find((r) => r.action === "ticket.state" && r.detail.to === "closed");
    check("…and that move is audited with noted: false", Boolean(blankRow) && blankRow.detail.noted === false);
    const cliState = spawnSync(process.execPath, [join(SERVER, "bin/tickets.mjs"), "state", ref, "open", "--note", "reopened: the dock failed again"], { encoding: "utf8", env: cliEnv });
    check("bin/tickets.mjs state --note writes through the same function and says so", cliState.status === 0 && /internal note recorded/.test(cliState.stdout) && (await getTicket(schema, ref)).closeNote === "reopened: the dock failed again", cliState.stderr.slice(0, 200));
    const page3 = await owner.go(`/admin/tickets/${ref}`);
    check("…and the console shows what the CLI wrote", page3.text.includes("reopened: the dock failed again"));
  }

  console.log("\n=== 5c. no orphan columns: every column of the ticket store has code that names it, or a reserved-list entry (D269) ===");
  {
    // The columns come from information_schema on THIS tenant's schema — what the migrations
    // actually produced, not what a file says they produce. The code is the two files D224 lets
    // touch the store, with comments stripped, so a paragraph explaining why a column is unused
    // cannot count as using it. The static half — every FIELD the query layer returns has a
    // reader — is admin-static.test.mjs §5c; it is the one that fails on 2026-09-12's defect.
    const stripJs = (js) => js.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
    const storeCode = ["src/tickets/query.js", "src/tickets/file.js"].map((p) => stripJs(readFileSync(join(SERVER, p), "utf8"))).join("\n");
    /**
     * Columns that deliberately have no writer and no reader yet. One line, one reason, one decision.
     * An entry that gains code naming it FAILS below, so the list can only shrink by being edited —
     * "keep only if genuinely unread" is enforced, not hoped for.
     *
     * KNOWN LIMIT: the check is textual and per file, not per table. A column whose name is also a
     * field of something else in those two files counts as named — `users.status` is one (file.js
     * filters TENANTS by `status`), `users.created_at` another (the ticket INSERT returns its own).
     * Neither is on this list for that reason, and this comment is where that is admitted rather
     * than a list entry pretending the check saw them.
     */
    const RESERVED_COLUMNS = {
      tickets: {},
      users: {
        logon_sid: "D148 — the broker-attested identity; the pipe that would carry it is designed and not built (D200/D201)",
        external_id: "D55/D145 — written by a directory sync (SCIM) that does not exist",
        upn: "D55/D145 — the same directory sync",
      },
    };
    for (const table of Object.keys(RESERVED_COLUMNS)) {
      const cols = (await getPool().query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position",
        [schema, table],
      )).rows.map((r) => r.column_name);
      check(`${table}: information_schema lists its columns (${cols.length})`, cols.length >= 6, cols.join(","));
      const named = (c) => new RegExp(`\\b${c}\\b`).test(storeCode);
      const orphans = cols.filter((c) => !(c in RESERVED_COLUMNS[table]) && !named(c));
      check(`${table}: every column is named by src/tickets/query.js or src/tickets/file.js, or is on the reserved list with a reason`,
        orphans.length === 0, `orphans: ${orphans.join(", ")}`);
      const stale = Object.keys(RESERVED_COLUMNS[table]).filter((c) => !cols.includes(c) || named(c));
      check(`${table}: the reserved list names only columns that exist and that no store code names`, stale.length === 0, `stale: ${stale.join(", ")}`);
    }
  }

  console.log("\n=== KB-1. a pasted bundle lands, and the page's counts equal bin/kb.mjs status ===");
  {
    const before = await corpusStatus();
    const page = await owner.go("/admin/knowledge");
    const token = csrfOf(page.text);
    check("the Knowledge page draws the search form and the ingest form", /action="\/admin\/knowledge\/search"/.test(page.text) && /action="\/admin\/knowledge\/ingest"/.test(page.text));
    check("…and states, in words, that the corpus is cross-tenant (D45)", /Cross-tenant: this changes what EVERY tenant/.test(page.text));
    check("the ingest form carries a CSRF token", Boolean(token));

    const noCsrf = await owner.go("/admin/knowledge/ingest", { method: "POST", form: { bundle: bundleJson([VPN_ARTICLE]) } });
    check("POST /admin/knowledge/ingest without the token -> 403, and nothing landed",
      noCsrf.status === 403 && (await corpusStatus()).articles === before.articles);

    // A bad article in position TWO refuses the whole bundle. Verified against a live database,
    // which is the honesty-ledger item the handover left open.
    const bad = await owner.go("/admin/knowledge/ingest", { method: "POST", form: {
      _csrf: token,
      bundle: bundleJson([VPN_ARTICLE, { id: "b2test-nope", type: "howto", title: "Wrong type" }]),
    } });
    check("a bad type in the SECOND article refuses the WHOLE bundle -> 400, naming the article",
      bad.status === 400 && /b2test-nope/.test(bad.text) && /nothing was written/.test(bad.text), String(bad.status));
    check("…and the corpus did not move — a partial corpus is the state that looks loaded",
      (await corpusStatus()).articles === before.articles);
    check("…and the refusal was audited (kb.ingest.refused) with the reason and no article text",
      (await auditRows()).some((r) => r.action === "kb.ingest.refused" && /b2test-nope/.test(JSON.stringify(r.detail)) && !/certificate expired/.test(JSON.stringify(r))));

    const notJson = await owner.go("/admin/knowledge/ingest", { method: "POST", form: { _csrf: token, bundle: "{ nope" } });
    check("text that is not JSON -> 400 naming the position, not 'invalid'", notJson.status === 400 && /not valid JSON/.test(notJson.text));
    const emptyBox = await owner.go("/admin/knowledge/ingest", { method: "POST", form: { _csrf: token, bundle: "  " } });
    check("an empty box -> 400 saying so, rather than an ingest of nothing", emptyBox.status === 400 && /the bundle box was empty/.test(emptyBox.text));

    // The real thing. Two articles, one of them with a platform the pre-filter cannot match.
    const ok = await owner.go("/admin/knowledge/ingest", { method: "POST", form: {
      _csrf: token,
      bundle: bundleJson([VPN_ARTICLE, { id: "b2test-badplat", type: "reference", title: "B2TEST wrong platform", body: "x", platform: "Windows 11" }]),
    } });
    const after = await corpusStatus();
    check("a good bundle -> 200 with a report naming the bundle", ok.status === 200 && /b2test-bundle/.test(ok.text), String(ok.status));
    check("the report says 2 articles inserted", /<div class="n">2<\/div><div class="l">articles inserted/.test(ok.text));
    check("THE PAGE'S COUNTS EQUAL corpusStatus() — the same function bin/kb.mjs status reads (exit criterion 1)",
      ok.text.includes(`<strong>${after.articles}</strong> articles`) && ok.text.includes(`<strong>${after.chunks}</strong> chunks`) && ok.text.includes(`<strong>${after.embedded}</strong> embedded`),
      `page vs ${JSON.stringify({ a: after.articles, c: after.chunks, e: after.embedded })}`);
    check("the corpus grew by exactly the two articles", after.articles === before.articles + 2);
    check("the chunks were embedded, by the model named on the page", after.embedded === after.chunks && ok.text.includes(stubEmbedder.model));
    check("a legal-but-unretrievable platform is REPORTED, not refused — 'RETRIEVED BY NOTHING'",
      /RETRIEVED BY NOTHING/.test(ok.text) && /b2test-badplat/.test(ok.text));
    const cli = spawnSync(process.execPath, [join(SERVER, "bin/kb.mjs"), "status"], { encoding: "utf8" });
    check("bin/kb.mjs status prints the same three numbers (exit criterion 1, independently)",
      cli.status === 0 && new RegExp(`articles\\s+${after.articles}`).test(cli.stdout) && new RegExp(`chunks\\s+${after.chunks}\\s+\\(${after.embedded} embedded\\)`).test(cli.stdout),
      cli.stdout.slice(0, 300));

    // Exit criterion 4.
    const row = (await auditRows()).find((r) => r.action === "kb.ingest");
    check("kb.ingest is audited with the actor, the counts and the model (exit criterion 4)",
      Boolean(row) && row.email === made.owner.email && row.subject === "b2test-bundle"
      && row.detail.articles.inserted === 2 && row.detail.embedded > 0 && row.detail.model === stubEmbedder.model,
      JSON.stringify(row?.detail));
    check("…and NO article text is in the audit row",
      !/certificate|Sign out and back in|wrong platform/i.test(JSON.stringify(row)));

    // Re-ingest. source_hash makes it a no-op, and the counts must say so honestly: "0 inserted,
    // 0 updated, 2 unchanged" beside "0 chunks written". Reporting the bundle's existing chunk
    // count as "written" was a real defect here, found on 2026-09-09 by reading the page.
    const again = await owner.go("/admin/knowledge/ingest", { method: "POST", form: {
      _csrf: token,
      bundle: bundleJson([VPN_ARTICLE, { id: "b2test-badplat", type: "reference", title: "B2TEST wrong platform", body: "x", platform: "Windows 11" }]),
    } });
    check("a re-ingest of the identical bundle reports 2 unchanged and 0 written", /<div class="n">2<\/div><div class="l">unchanged/.test(again.text) && /<div class="n">0<\/div><div class="l">chunks written/.test(again.text));
    check("…and adds nothing to the corpus", JSON.stringify(await corpusStatus()) === JSON.stringify(after));
  }

  console.log("\n=== KB-2. the embedder is down: the ingest still lands, lexical only, and says so ===");
  {
    stubEmbedder.mode = "down";
    const page = await owner.go("/admin/knowledge");
    const token = csrfOf(page.text);
    const res = await owner.go("/admin/knowledge/ingest", { method: "POST", form: {
      _csrf: token,
      bundle: bundleJson([{ id: "b2test-down", type: "reference", title: "B2TEST embedder was down", body: "b2testdownphrase is in this body" }]),
    } });
    const status = await corpusStatus();
    check("the ingest SUCCEEDS with the embedder down -> 200", res.status === 200, String(res.status));
    check("the article and its chunks are written", status.chunks > status.embedded);
    check("the page says embedding did not run, names the error, and says the chunks retrieve LEXICALLY ONLY",
      /Embedding did not run/.test(res.text) && /stub embedder is down/.test(res.text) && /lexical leg only/.test(res.text));
    check("…and names the command that finishes the job", /node bin\/kb\.mjs embed/.test(res.text));
    check("the lexical leg DOES find it with no vector at all — this is the degraded mode, working",
      (await lexicalLeg({ query: "b2testdownphrase", platform: null })).some((c) => c.articleId === "b2test-down"));
    check("the audit row records the embed error rather than claiming a clean ingest",
      (await auditRows()).some((r) => r.action === "kb.ingest" && /stub embedder is down/.test(String(r.detail?.embedError))));

    // A later embed completes them, exactly as the CLI would.
    stubEmbedder.mode = "ok";
    const { embedPending } = await import("../src/kb/ingest.js");
    const done = await embedPending({ embedder: stubEmbedder });
    const final = await corpusStatus();
    check("a later embed completes them (exit criterion 2)", done.embedded > 0 && final.embedded === final.chunks, JSON.stringify({ done: done.embedded, final }));
    check("…and the corpus still holds exactly ONE embedding model", final.models.length === 1, JSON.stringify(final.models));
  }

  console.log("\n=== KB-3. an ingest that would add a SECOND embedding model is refused (exit criterion 3) ===");
  {
    const beforeModels = (await corpusStatus()).models;
    const real = stubEmbedder.model;
    stubEmbedder.model = "b2test-a-different-model";
    const page = await owner.go("/admin/knowledge");
    const token = csrfOf(page.text);
    const res = await owner.go("/admin/knowledge/ingest", { method: "POST", form: {
      _csrf: token,
      bundle: bundleJson([{ ...VPN_ARTICLE, title: "B2TEST VPN certificate expired, edited" }]),
    } });
    const after = await corpusStatus();
    check("the ingest lands (200) and the page says THE EMBEDDING STEP WAS REFUSED",
      res.status === 200 && /THE EMBEDDING STEP WAS REFUSED/.test(res.text), String(res.status));
    check("…the reason names both models and points at reembed",
      res.text.includes(real) && /b2test-a-different-model/.test(res.text) && /node bin\/kb\.mjs reembed/.test(res.text));
    check("THE CORPUS STILL HAS ONE MODEL, and it is the one it had", after.models.length === 1 && after.models[0].model === real, JSON.stringify(after.models));
    check("the edited article's chunks were rewritten and are now unembedded — the honest half-state",
      after.embedded < after.chunks);
    check("the refusal is on the audit row", (await auditRows()).some((r) => r.action === "kb.ingest" && /different-model/.test(String(r.detail?.embedRefused))));
    // Put the corpus back the way it was.
    stubEmbedder.model = real;
    const { embedPending } = await import("../src/kb/ingest.js");
    await embedPending({ embedder: stubEmbedder });
    const restored = await corpusStatus();
    check("re-embedding with the corpus's own model restores it to one model, fully embedded",
      restored.models.length === 1 && restored.embedded === restored.chunks && restored.models[0].model === beforeModels[0]?.model);
  }

  console.log("\n=== KB-4. search: the console and bin/kb.mjs legs agree, and no threshold is drawn ===");
  {
    const res = await owner.go("/admin/knowledge/search?q=b2testvpnphrase&platform=any");
    check("GET /admin/knowledge/search -> 200", res.status === 200, String(res.status));
    check("the three caveats travel with the results (D207, D203, §5.16c)",
      /D207/.test(res.text) && /D203/.test(res.text) && /5.16c/.test(res.text) && /no relevance threshold is drawn/.test(res.text));
    check("the matched article is on the page, and the table has a rank column per leg",
      /b2test-vpn/.test(res.text) && /<th>Lex<\/th><th>Sem<\/th>/.test(res.text) && /<th>RRF score<\/th>/.test(res.text));
    check("both legs are shown unfused", /The two legs, unfused/.test(res.text) && /Lexical<span class="count">/.test(res.text));
    check("the page says how many chunks were eligible under the pre-filter",
      /chunks were eligible/.test(res.text));

    // EXIT CRITERION 5, the half that matters: the same ranks as the CLI, from the same functions.
    const legs = await lexicalLeg({ query: "b2testvpnphrase", platform: null });
    check("the lexical leg found the article (so the comparison below is not vacuous)", legs.some((c) => c.articleId === "b2test-vpn"), JSON.stringify(legs.map((c) => c.articleId)));
    check("EVERY lexical candidate appears on the page at ITS OWN RANK (exit criterion 5)",
      legs.every((c) => new RegExp(`<td class="mono">${c.rank}</td>\\s*<td><a href="/admin/knowledge#${c.articleId}"`).test(res.text)),
      legs.map((c) => `${c.rank}:${c.articleId}`).join(","));
    const cli = spawnSync(process.execPath, [join(SERVER, "bin/kb.mjs"), "legs", "b2testvpnphrase"], { encoding: "utf8" });
    check("…and bin/kb.mjs legs prints the same article in the lexical leg", cli.status === 0 && /b2test-vpn/.test(cli.stdout), cli.stdout.slice(0, 400));

    // D226, AS DECIDED: the text of a chunk the model receives is on the page; the text of a chunk
    // below DEFAULT_TOP_K is not. Asserted from the RESULT rather than from the markup, so the two
    // halves cannot both be satisfied by an empty page.
    {
      const { searchCorpus } = await import("../src/admin/kb-search.js");
      const model = await searchCorpus({ query: "b2testvpnphrase", platform: "any", embedder: stubEmbedder });
      const sent = model.byArticle.flatMap((a) => a.chunks).filter((c) => c.forModel);
      const unsent = model.byArticle.flatMap((a) => a.chunks).filter((c) => !c.forModel);
      check("the search returned both sent and unsent chunks, so the next two checks are not vacuous",
        sent.length > 0 && unsent.length > 0, `${sent.length} sent, ${unsent.length} unsent`);
      check("EVERY SENT chunk's text is quoted on the page, escaped (D226)",
        sent.every((c) => c.sentText && res.text.includes(escapeHtml(c.sentText))),
        sent.filter((c) => !c.sentText || !res.text.includes(escapeHtml(c.sentText))).map((c) => c.kind).join(","));
      check("NO UNSENT chunk carries text at all — the view model has none to render (D226's narrowing)",
        unsent.every((c) => c.sentText === null));
      check("…and the legs, the fusion and the sent list carry no `text` field out of the module",
        [...model.legs.lexical, ...model.legs.semantic, ...model.fused, ...model.forModel].every((c) => !("text" in c)));
      check("the page says what is shown and what is not, citing D226 and D53", /D226/.test(res.text) && /D53/.test(res.text));
    }

    // An uncovered query: no threshold, and the page says the rows are the dense leg's neighbours.
    const miss = await owner.go("/admin/knowledge/search?q=zzqqxx+nothing+matches+this&platform=any");
    check("an uncovered query -> 200 and draws no threshold line",
      miss.status === 200 && !/threshold of|below the floor|relevance floor of/i.test(miss.text), String(miss.status));
    check("…and says the rows are the dense leg alone, which has no 'no match'",
      /a dense leg has no/.test(miss.text));
    check("a platform the pre-filter cannot match -> 400 rather than an empty result",
      (await owner.go("/admin/knowledge/search?q=x&platform=Windows+11")).status === 400);
    check("a search is NOT audited — it names nobody (see pages/knowledge.js)",
      !(await auditRows()).some((r) => /^kb\.search/.test(r.action)));
  }

  console.log("\n=== KB-5. the review queue's gap row links into the search, when there is text ===");
  {
    await withControl((c) => c.query(
      `INSERT INTO control.kb_retrieval_log (tenant_label, query_text, platform, retrieved, top_score, answered, model)
       VALUES ($1, $2, 'windows', '[]'::jsonb, 0.0164, false, 'stub')`,
      [`b2test-${slug}`, "why does my <b>vpn</b> certificate expire"],
    ));
    await withControl((c) => c.query(
      `INSERT INTO control.kb_retrieval_log (tenant_label, query_text, platform, retrieved, top_score, answered, model)
       VALUES ($1, NULL, 'windows', '[]'::jsonb, 0.0164, false, 'stub')`,
      [`b2test-${slug}`],
    ));
    const home = await owner.go("/admin");
    check("the gap WITH text carries a link into the search, with the question and platform prefilled",
      /href="\/admin\/knowledge\/search\?q=why%20does%20my%20%3Cb%3Evpn%3C%2Fb%3E%20certificate%20expire&amp;platform=windows"/.test(home.text),
      home.text.match(/href="\/admin\/knowledge\/search[^"]*"/)?.[0] ?? "no link");
    check("the question text is escaped in the link and in the row — it is an employee's own words",
      !/<b>vpn<\/b>/.test(home.text) && /&lt;b&gt;vpn&lt;\/b&gt;/.test(home.text));
    // The page is hub-wide (gaps are not tenant-scoped), so a real hub running alongside this suite
    // can add its own gap rows with text — asserting a hardcoded link count would then be testing
    // whatever else happened to be in the database. gapFeed() is the same function the page calls
    // (review.js), grouped exactly as it groups, so the expected count is ground truth rather than
    // an assumption about how quiet the database is.
    const gaps = await gapFeed({ limit: 50 });
    const expectedLinks = gaps.filter((g) => g.queryText).length;
    const links = (home.text.match(/\/admin\/knowledge\/search\?q=/g) ?? []).length;
    check("every gap WITH text gets exactly one link, and a gap WITHOUT text gets none",
      links === expectedLinks, `${links} search link(s) for ${expectedLinks} gap(s) with text (of ${gaps.length} gaps)`);
    check("the disabled answer form is STILL disabled — answering a gap is the editor's job, not this pass's",
      /name="title" type="text" value="[^"]*" disabled="disabled"/.test(home.text)
      && /<textarea [^>]*disabled="disabled"/.test(home.text)
      && (home.text.match(/type="submit" name="action" value="\w+" disabled="disabled"/g) ?? []).length >= 3);

    // The link is drawn on permission, not on role name: an auditor has neither review.read nor
    // knowledge.read, so the it_agent is the interesting case and it is covered in KB-6.
    const searchFromLink = await owner.go("/admin/knowledge/search?q=why%20does%20my%20%3Cb%3Evpn%3C%2Fb%3E%20certificate%20expire&platform=windows");
    check("following the link renders a search for that question, escaped", searchFromLink.status === 200 && /&lt;b&gt;vpn&lt;\/b&gt;/.test(searchFromLink.text) && !/<b>vpn<\/b>/.test(searchFromLink.text));
  }

  console.log("\n=== KB-6. an it_agent can search AND ingest (exit criterion 6; the auditor half is in §2) ===");
  // ONE SIGN-IN PER ACCOUNT IN THIS FILE. A TOTP code is single-use inside its 30-second step
  // (RFC 6238 §5.2, and the replay is asserted above), so a second `login()` for the same account
  // in the same step is refused — which looks exactly like a permission bug. The it_agent's
  // session is created here and reused by KB-7; the auditor's is created in §2 and its Knowledge
  // refusals are asserted there.
  const agent = client();
  {
    check("the it_agent signs in", (await login(agent, made.agent)).status === 303);
    const kb = await agent.go("/admin/knowledge");
    check("it_agent: GET /admin/knowledge -> 200 with the ingest form drawn", kb.status === 200 && /action="\/admin\/knowledge\/ingest"/.test(kb.text));
    check("it_agent: GET /admin/knowledge/search -> 200", (await agent.go("/admin/knowledge/search?q=b2testvpnphrase")).status === 200);
    const ingest = await agent.go("/admin/knowledge/ingest", { method: "POST", form: { _csrf: csrfOf(kb.text), bundle: bundleJson([VPN_ARTICLE]) } });
    check("it_agent: POST the ingest -> 200 (knowledge.write)", ingest.status === 200, String(ingest.status));
    check("…audited as that person", (await auditRows()).some((r) => r.action === "kb.ingest" && r.email === made.agent.email));
    // A token from ANOTHER session must not open this route either — kept here because the
    // it_agent's token is the only valid one in hand, and reused by §2's auditor assertions.
    agentCsrf = csrfOf(kb.text);
  }

  console.log("\n=== KB-7. bin/admin.mjs reset: new password, new secret, sessions gone (Task 5) ===");
  {
    const live = agent; // the session KB-6 created; a second login() would hit the TOTP replay guard
    check("the it_agent's session from KB-6 is live", (await live.go("/admin/knowledge")).status === 200);
    const { rows: [pre] } = await getPool().query("SELECT password_hash, totp_secret, totp_last_step FROM control.admin_users WHERE id = $1", [made.agent.id]);
    check("…and totp_last_step is set from that login (the replay defence)", pre.totp_last_step !== null);

    const fresh = await resetAdminCredentials({ adminUserId: made.agent.id });
    const revoked = await revokeUserSessions(made.agent.id);
    const { rows: [post] } = await getPool().query("SELECT password_hash, totp_secret, totp_last_step, status FROM control.admin_users WHERE id = $1", [made.agent.id]);
    check("the password hash changed and the new password verifies against it",
      post.password_hash !== pre.password_hash && verifyPassword(fresh.password, post.password_hash));
    check("the old password no longer verifies", !verifyPassword("agent-password-12", post.password_hash));
    check("the TOTP secret is a NEW one", !Buffer.from(post.totp_secret).equals(Buffer.from(pre.totp_secret)));
    check("totp_last_step is CLEARED — a step number from the old secret would refuse the first new code",
      post.totp_last_step === null);
    check("the live session was revoked", revoked >= 1);
    check("the revoked session is sent back to sign-in", (await live.go("/admin/knowledge")).status === 303);
    const back = client();
    check("the person signs in with the new password and the new authenticator",
      (await back.go("/admin/login", { method: "POST", form: { email: made.agent.email, password: fresh.password, code: totpCode(fresh.totpSecret) } })).status === 303);
    check("the row kept its id, so the audit trail is still that person's", post.status === "active");
    const cliUsage = spawnSync(process.execPath, [join(SERVER, "bin/admin.mjs")], { encoding: "utf8" });
    check("bin/admin.mjs lists reset in its usage", /admin\.mjs reset/.test(cliUsage.stdout));
  }

  console.log("\n=== KB-7b. reset can keep either half, and the live code is readable (2026-09-12 lockout) ===");
  {
    // WHY THIS EXISTS. Thirty minutes were lost on 2026-09-12 because `reset` replaced the
    // authenticator secret as a side effect of fixing a password, and because the CLI's own header
    // said the secret could never be shown again. Both halves are pinned here.
    const subject = await createAdminUser({ tenantId, email: `keep@${slug}.test`, roleName: "it_agent", password: "keep-password-12" });
    const read = async () => (await getPool().query(
      "SELECT password_hash, totp_secret, totp_last_step FROM control.admin_users WHERE id = $1", [subject.id])).rows[0];

    // --keep-totp: the password moves, the authenticator does not.
    const before = await read();
    const kt = await resetAdminCredentials({ adminUserId: subject.id, keepTotp: true });
    const afterKt = await read();
    check("--keep-totp returns no secret, because it minted none", kt.totpSecret === null);
    check("--keep-totp changed the password", afterKt.password_hash !== before.password_hash && verifyPassword(kt.password, afterKt.password_hash));
    check("--keep-totp left the authenticator secret BYTE-IDENTICAL",
      Buffer.from(afterKt.totp_secret).equals(Buffer.from(before.totp_secret)));
    check("…so the code from the ORIGINAL enrolment still signs in",
      (await client().go("/admin/login", { method: "POST", form: { email: subject.email, password: kt.password, code: totpCode(subject.totpSecret) } })).status === 303);

    // --keep-password: the mirror case.
    const kp = await resetAdminCredentials({ adminUserId: subject.id, keepPassword: true });
    const afterKp = await read();
    check("--keep-password returns no password, because it minted none", kp.password === null);
    check("--keep-password left the password hash untouched", afterKp.password_hash === afterKt.password_hash);
    check("--keep-password minted a NEW authenticator secret",
      !Buffer.from(afterKp.totp_secret).equals(Buffer.from(afterKt.totp_secret)));
    check("…and cleared totp_last_step, because the step referred to the old secret", afterKp.totp_last_step === null);

    // The combination that resets nothing is refused rather than silently doing nothing.
    let refused = false;
    try { await resetAdminCredentials({ adminUserId: subject.id, keepTotp: true, keepPassword: true }); } catch { refused = true; }
    check("keeping BOTH halves is refused: it is not a reset", refused);

    // The secret is recoverable, which is the fact the CLI header used to deny.
    const live = await read();
    const cli = spawnSync(process.execPath, [join(SERVER, "bin/admin.mjs"), "totp", "--user", subject.email, slug], { encoding: "utf8" });
    check("totp --user prints the code the live secret is currently producing",
      cli.stdout.includes(totpCode(Buffer.from(live.totp_secret))), cli.stdout + cli.stderr);
    check("…and it does NOT print the secret unless --secret is given", !/authenticator secret/.test(cli.stdout));
    const cliSecret = spawnSync(process.execPath, [join(SERVER, "bin/admin.mjs"), "totp", "--user", subject.email, slug, "--secret"], { encoding: "utf8" });
    check("--secret prints the base32 and the otpauth URI, for re-enrolling a launcher",
      /authenticator secret/.test(cliSecret.stdout) && /otpauth:\/\//.test(cliSecret.stdout));
    // The print block itself, through the CLI: under --keep-totp there is no secret to encode, and
    // a crash there would land only on the person already locked out.
    const adminMjs = join(SERVER, "bin/admin.mjs");
    const rKeep = spawnSync(process.execPath, [adminMjs, "reset", slug, subject.email, "--keep-totp"], { encoding: "utf8" });
    check("CLI reset --keep-totp exits clean and prints a new password", rKeep.status === 0 && /new password/.test(rKeep.stdout), rKeep.stderr);
    check("…and says the authenticator is UNCHANGED, printing no secret",
      /authenticator is UNCHANGED/.test(rKeep.stdout) && !/authenticator secret/.test(rKeep.stdout));
    const rBoth = spawnSync(process.execPath, [adminMjs, "reset", slug, subject.email], { encoding: "utf8" });
    check("CLI reset with no flag prints the NO LONGER WORKS line — the sentence this pass exists for",
      /PREVIOUS AUTHENTICATOR SECRET NO LONGER WORKS/.test(rBoth.stdout), rBoth.stdout);
    check("…and offers --keep-totp as the way to avoid it next time", /--keep-totp/.test(rBoth.stdout));
    const rBad = spawnSync(process.execPath, [adminMjs, "reset", slug, subject.email, "--keep-totp", "--keep-password"], { encoding: "utf8" });
    check("CLI refuses both --keep flags together rather than resetting nothing", rBad.status === 1);

    const reads = await withControl((c) => c.query(
      "SELECT detail FROM control.admin_audit WHERE tenant_id = $1 AND action = 'admin.totp_read' ORDER BY id", [tenantId]));
    check("every code read wrote an audit row saying whether the secret was shown",
      reads.rows.length === 2 && reads.rows[0].detail.secretShown === false && reads.rows[1].detail.secretShown === true);
  }

  console.log("\n=== KB-7c. the development TOTP bypass, end to end (D267) ===");
  {
    // The subject is a fresh account so this section cannot be affected by, or affect, the replay
    // state of anything KB-6 or KB-7 signed in as.
    const dev = await createAdminUser({ tenantId, email: `dev@${slug}.test`, roleName: "it_agent", password: "dev-password-12" });
    const lastStep = async () => (await getPool().query("SELECT totp_last_step FROM control.admin_users WHERE id = $1", [dev.id])).rows[0].totp_last_step;
    const post = (baseUrl, form) => fetch(`${baseUrl}/admin/login`, {
      method: "POST", redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    });

    // ---- unset: today's behaviour, exactly (acceptance 8) ------------------------------------
    delete process.env[BYPASS_ENV];
    resetLoginThrottle();
    check("UNSET: an empty code is refused", (await post(base, { email: dev.email, password: dev.password, code: "" })).status === 401);
    check("UNSET: the right code still signs in", (await post(base, { email: dev.email, password: dev.password, code: totpCode(dev.totpSecret) })).status === 303);
    check("UNSET: /v1/health says the second factor is required",
      (await (await fetch(`${base}/v1/health`)).json()).adminAuth.totpRequired === true);
    check("UNSET: no insecure banner anywhere on the sign-in page", !/class="insecure"/.test(await (await fetch(`${base}/admin/login`)).text()));

    // ---- set, on a LOOPBACK listener: the code is not required, the password is ---------------
    process.env[BYPASS_ENV] = "1";
    resetLoginThrottle();
    const stepBefore = await lastStep();

    // THE ASSERTION THAT MATTERS. A bypass that skipped the password too would make this console
    // reachable by anything running as this user, which is a different proposition entirely.
    check("SET+loopback: a WRONG PASSWORD is still refused, with no code supplied",
      (await post(base, { email: dev.email, password: "wrong-password-99", code: "" })).status === 401);
    check("SET+loopback: an EMPTY password is refused",
      (await post(base, { email: dev.email, password: "", code: "" })).status === 401);
    check("SET+loopback: a wrong password with a VALID code is still refused",
      (await post(base, { email: dev.email, password: "wrong-password-99", code: totpCode(dev.totpSecret) })).status === 401);
    resetLoginThrottle(); // those three deliberate failures would otherwise trip the throttle

    const ok = await post(base, { email: dev.email, password: dev.password, code: "" });
    check("SET+loopback: the right password with NO code signs in", ok.status === 303, String(ok.status));
    check("…and it set a session cookie", /matic_admin=/.test(ok.headers.get("set-cookie") ?? ""));

    const bypassRow = (await auditRows()).find((r) => r.action === "login.ok" && r.email === dev.email && r.detail?.insecure);
    const cls = bypassRow && (await getPool().query(
      "SELECT event_class FROM control.admin_audit WHERE tenant_id = $1 AND action = 'login.ok' ORDER BY id DESC LIMIT 1", [tenantId])).rows[0].event_class;
    check("…and wrote an audit row in its OWN event class, so it can never read as a normal sign-in",
      cls === "insecure-dev-bypass", String(cls));
    check("…whose detail says a code was not required", /no authenticator code was required/.test(bypassRow?.detail?.insecure ?? ""));
    check("…and totp_last_step was LEFT ALONE: the bypass skips a check, it does not undo one",
      (await lastStep()) === stepBefore, `${stepBefore} -> ${await lastStep()}`);
    const sess = (await getPool().query(
      "SELECT totp_verified_at FROM control.admin_sessions WHERE admin_user_id = $1 ORDER BY created_at DESC LIMIT 1", [dev.id])).rows[0];
    check("…and the session does NOT claim a second factor was verified (D157's clock stays honest)",
      sess.totp_verified_at === null, String(sess?.totp_verified_at));

    // FOUND BY THIS TEST FAILING, and worth pinning rather than tidying away: with the bypass on, a
    // code that would be REFUSED AS A REPLAY still signs in — through the bypass, audited as one.
    // That is correct (the mode means no code is required, so a bad one is no worse than none) and
    // it is surprising, because the same request without the bypass is a 401.
    check("SET+loopback: a REPLAYED code signs in via the bypass, and is audited as a bypass",
      (await post(base, { email: dev.email, password: dev.password, code: totpCode(dev.totpSecret) })).status === 303
      && (await getPool().query("SELECT event_class FROM control.admin_audit WHERE tenant_id = $1 AND action = 'login.ok' ORDER BY id DESC LIMIT 1", [tenantId])).rows[0].event_class === "insecure-dev-bypass");

    // A genuinely fresh code has to come from a step this account has not used, because the replay
    // defence is still armed under the bypass — which is the point of the previous assertion.
    const clearReplay = () => getPool().query("UPDATE control.admin_users SET totp_last_step = NULL WHERE id = $1", [dev.id]);
    await clearReplay();
    check("SET+loopback: a FRESH valid code still works — the bypass widens what is accepted, it does not replace it",
      (await post(base, { email: dev.email, password: dev.password, code: totpCode(dev.totpSecret) })).status === 303);
    check("…and THAT one is audited as normal, not as a bypass",
      (await getPool().query("SELECT event_class FROM control.admin_audit WHERE tenant_id = $1 AND action = 'login.ok' ORDER BY id DESC LIMIT 1", [tenantId])).rows[0].event_class === "normal");

    // Guard 5 on an AUTHENTICATED page, which is the half a sign-in-page check cannot reach: the
    // handover asks for the banner "on every page, not only at sign-in", because a reader who
    // arrives at Tickets from a bookmark must not see a console that looks normal.
    {
      const c = client();
      await c.go("/admin/login", { method: "POST", form: { email: dev.email, password: dev.password, code: "" } });
      const inside = await c.go("/admin/tickets");
      check("SET+loopback: an authenticated page carries the insecure banner too",
        inside.status === 200 && /class="insecure"/.test(inside.text), String(inside.status));
      check("…above the page's own header, so it cannot be scrolled past as a page element",
        inside.text.indexOf('class="insecure"') < inside.text.indexOf('class="top"'));
    }

    // Guards 4 and 5, on the live surfaces.
    const health = await (await fetch(`${base}/v1/health`)).json();
    check("SET+loopback: /v1/health reports it ACTIVE and the factor not required",
      health.adminAuth.insecureBypass === "ACTIVE" && health.adminAuth.totpRequired === false, JSON.stringify(health.adminAuth));
    const index = await (await fetch(`${base}/`)).json();
    check("SET+loopback: GET / reports it too, in the console object", index.console.insecureBypass === "ACTIVE");
    const signin = await (await fetch(`${base}/admin/login`)).text();
    check("SET+loopback: the sign-in page carries the insecure banner", /class="insecure"/.test(signin));
    check("…and the code field is no longer required, so an empty submit actually reaches the server",
      !/name="code"[^>]*\srequired[\s>]/.test(signin));

    // ---- set, on a NON-LOOPBACK listener: refused outright (acceptance 5) ---------------------
    // The router is mounted on a loopback socket and told the listener is bound to 0.0.0.0, which
    // is the state guard 2 exists for. Driven this way rather than by really binding 0.0.0.0 so
    // that running the suite cannot raise a Windows firewall prompt on the founder's machine; the
    // guard reads whatever getBoundAddress() returns, and src/index.js supplies it from the real
    // socket (asserted in admin-static.test.mjs).
    const exposedHandler = adminHandler({ log: () => {}, embedder: stubEmbedder, getBoundAddress: () => "0.0.0.0" });
    const exposed = http.createServer(async (req, res) => { if (!(await exposedHandler(req, res))) { res.writeHead(404); res.end(); } });
    await new Promise((r) => exposed.listen(0, "127.0.0.1", r));
    const exposedBase = `http://127.0.0.1:${exposed.address().port}`;
    try {
      resetLoginThrottle();
      check("SET+non-loopback: sign-in STILL DEMANDS A CODE — the variable does nothing",
        (await post(exposedBase, { email: dev.email, password: dev.password, code: "" })).status === 401);
      resetLoginThrottle();
      await clearReplay(); // the code above was consumed by the loopback sign-in a few lines up
      check("SET+non-loopback: the right password AND the right code still work",
        (await post(exposedBase, { email: dev.email, password: dev.password, code: totpCode(dev.totpSecret) })).status === 303);
      const exposedPage = await (await fetch(`${exposedBase}/admin/login`)).text();
      check("SET+non-loopback: the page says REFUSED rather than pretending nothing was asked",
        /class="insecure"/.test(exposedPage) && /REFUSED/.test(exposedPage));
      check("…and the code field is required again", /name="code"[^>]*\srequired[\s>]/.test(exposedPage));
    } finally {
      await new Promise((r) => exposed.close(r));
      delete process.env[BYPASS_ENV];
      resetLoginThrottle();
    }
    check("cleanup: with the variable removed the console demands a code again",
      (await post(base, { email: dev.email, password: dev.password, code: "" })).status === 401);
  }

  console.log("\n=== KB-8. the article editor (D230): create, edit, and what it refuses ===");
  {
    const newPage = await owner.go("/admin/knowledge/new");
    check("GET /admin/knowledge/new -> 200, a form posting to /admin/knowledge/save", newPage.status === 200 && /action="\/admin\/knowledge\/save"/.test(newPage.text));
    const token = csrfOf(newPage.text);
    check("the new-article form carries a CSRF token", Boolean(token));

    const before = await corpusStatus();
    const created = await owner.go("/admin/knowledge/save", { method: "POST", form: {
      _csrf: token, _editing: "",
      id: "b2test-editor-new", type: "troubleshooting", title: "B2TEST editor-created article",
      category: "b2test-cat", platform: "any", environment: "",
      problem: "b2testeditorphrase will not do the thing", cause: "a setting is wrong",
      symptoms: "b2testeditorphrase happens\nit also happens on wake",
      keywords: "b2testeditorphrase", guidance: "1. Do the first step\n2. Do the second step",
      escalateWhen: "it happens more than once a day", doNotAttempt: "do not reinstall the driver",
    } });
    check("POST /admin/knowledge/save (create) -> 200, reusing the ingest report", created.status === 200 && /<div class="n">1<\/div><div class="l">articles inserted/.test(created.text), String(created.status));
    check("the corpus grew by exactly one article", (await corpusStatus()).articles === before.articles + 1);

    const { rows: [row] } = await getPool().query(
      "SELECT lifecycle, category, platform, problem, symptoms, guidance, escalate_when, do_not_attempt FROM control.kb_articles WHERE id = $1", ["b2test-editor-new"]);
    check("D230: saved as unvalidated, never validated, regardless of the form", row.lifecycle === "unvalidated", String(row.lifecycle));
    check("the array fields split one entry per line", row.symptoms.length === 2 && row.guidance.length === 2 && row.escalate_when.length === 1 && row.do_not_attempt.length === 1, JSON.stringify(row));
    check("scalar fields landed", row.category === "b2test-cat" && row.problem === "b2testeditorphrase will not do the thing");

    const createRow = (await auditRows()).find((r) => r.action === "kb.article.write" && r.subject === "b2test-editor-new");
    check("kb.article.write is audited with the id and action, and NO article text",
      Boolean(createRow) && createRow.email === made.owner.email && createRow.detail.action === "inserted"
      && !/b2testeditorphrase|do the first step/i.test(JSON.stringify(createRow)), JSON.stringify(createRow?.detail));
    check("…and the changed-fields list names fields, not values", Array.isArray(createRow.detail.fields) && createRow.detail.fields.includes("title") && createRow.detail.fields.includes("guidance"));

    // The edit page prefills from the row just written, and the id is not an editable input.
    const editPage = await owner.go("/admin/knowledge/b2test-editor-new/edit");
    check("GET .../edit -> 200, prefilled from the saved row", editPage.status === 200
      && /value="B2TEST editor-created article"/.test(editPage.text)
      && /b2testeditorphrase will not do the thing/.test(editPage.text)
      && />b2testeditorphrase happens\nit also happens on wake</.test(editPage.text));
    check("the id is shown but not an editable text input", /<input type="hidden" name="id" value="b2test-editor-new">/.test(editPage.text) && !/<input id="id" name="id" type="text"/.test(editPage.text));
    const editToken = csrfOf(editPage.text);

    // Edit: change ONLY the category. changedFields() must name exactly that one field.
    const edited = await owner.go("/admin/knowledge/save", { method: "POST", form: {
      _csrf: editToken, _editing: "1",
      id: "b2test-editor-new", type: "troubleshooting", title: "B2TEST editor-created article",
      category: "a-different-category", platform: "any", environment: "",
      problem: "b2testeditorphrase will not do the thing", cause: "a setting is wrong",
      symptoms: "b2testeditorphrase happens\nit also happens on wake",
      keywords: "b2testeditorphrase", guidance: "1. Do the first step\n2. Do the second step",
      escalateWhen: "it happens more than once a day", doNotAttempt: "do not reinstall the driver",
    } });
    check("POST save (edit) -> 200, the report says 1 updated", edited.status === 200 && /<div class="n">1<\/div><div class="l">articles updated/.test(edited.text));
    const editRow = (await auditRows()).find((r) => r.action === "kb.article.write" && r.subject === "b2test-editor-new" && r.detail.action === "updated");
    check("the edit's changed-fields list is EXACTLY [\"category\"] — a diff of names, never values",
      Boolean(editRow) && JSON.stringify(editRow.detail.fields) === JSON.stringify(["category"]), JSON.stringify(editRow?.detail));
    check("lifecycle is still unvalidated after an edit", (await getPool().query("SELECT lifecycle FROM control.kb_articles WHERE id = $1", ["b2test-editor-new"])).rows[0].lifecycle === "unvalidated");

    // The `body` field this editor does not offer: an edit must carry it forward, never blank it.
    // b2test-badplat (from KB-1) is type "reference" with body "x" and an unmatchable platform —
    // editing it also exercises the warn-not-refuse path (D230 reuses bundleWarnings via the report).
    const badplatPage = await owner.go("/admin/knowledge/b2test-badplat/edit");
    check("GET .../edit for a reference article shows its body, unedited, with a note that it is not editable here",
      badplatPage.status === 200 && /not editable here \(D230\)/.test(badplatPage.text) && /<blockquote>x<\/blockquote>/.test(badplatPage.text));
    const badplatEdit = await owner.go("/admin/knowledge/save", { method: "POST", form: {
      _csrf: csrfOf(badplatPage.text), _editing: "1",
      id: "b2test-badplat", type: "reference", title: "B2TEST wrong platform, re-titled",
      category: "", platform: "windows 11", environment: "",
      problem: "", cause: "", symptoms: "", keywords: "", guidance: "", escalateWhen: "", doNotAttempt: "",
    } });
    check("the edit lands and still WARNS rather than refuses on the unmatchable platform",
      badplatEdit.status === 200 && /RETRIEVED BY NOTHING/.test(badplatEdit.text) && /b2test-badplat/.test(badplatEdit.text));
    check("`body` was carried forward from the existing row, not blanked",
      (await getPool().query("SELECT body FROM control.kb_articles WHERE id = $1", ["b2test-badplat"])).rows[0].body === "x");

    // A "new article" whose id collides with an existing one must be refused, not silently upsert
    // into overwriting it (upsertArticle() writes ON CONFLICT DO UPDATE by id).
    const beforeVpn = (await getPool().query("SELECT title FROM control.kb_articles WHERE id = $1", ["b2test-vpn"])).rows[0];
    const collide = await owner.go("/admin/knowledge/save", { method: "POST", form: {
      _csrf: token, _editing: "",
      id: "b2test-vpn", type: "troubleshooting", title: "This should never land",
      category: "", platform: "any", environment: "", problem: "", cause: "",
      symptoms: "", keywords: "", guidance: "", escalateWhen: "", doNotAttempt: "",
    } });
    check("'New article' with an id that already exists -> 409, refused before validation", collide.status === 409, String(collide.status));
    check("the existing article was NOT overwritten", (await getPool().query("SELECT title FROM control.kb_articles WHERE id = $1", ["b2test-vpn"])).rows[0].title === beforeVpn.title);
    check("the collision was audited", (await auditRows()).some((r) => r.action === "kb.article.write.refused" && r.subject === "b2test-vpn" && /already in use/.test(String(r.detail?.why))));

    // A blank title is refused before anything is written, and the admin's other fields survive
    // the re-render rather than being lost.
    const blankTitle = await owner.go("/admin/knowledge/save", { method: "POST", form: {
      _csrf: token, _editing: "",
      id: "b2test-editor-blank", type: "troubleshooting", title: "",
      category: "", platform: "any", environment: "",
      problem: "b2testblanktitlephrase", cause: "", symptoms: "", keywords: "", guidance: "", escalateWhen: "", doNotAttempt: "",
    } });
    check("a blank title -> 400, nothing written", blankTitle.status === 400 && !(await getPool().query("SELECT 1 FROM control.kb_articles WHERE id = $1", ["b2test-editor-blank"])).rows.length);
    check("the refused form keeps what was typed rather than losing it", /b2testblanktitlephrase/.test(blankTitle.text));
    check("the refusal was audited (kb.article.write.refused)", (await auditRows()).some((r) => r.action === "kb.article.write.refused" && /no title/.test(String(r.detail?.why))));

    // Saving without a CSRF token is refused like every other console form.
    const noCsrf = await owner.go("/admin/knowledge/save", { method: "POST", form: {
      _editing: "", id: "b2test-editor-nocsrf", type: "troubleshooting", title: "should not land",
    } });
    check("POST /admin/knowledge/save without the token -> 403, nothing written", noCsrf.status === 403 && !(await getPool().query("SELECT 1 FROM control.kb_articles WHERE id = $1", ["b2test-editor-nocsrf"])).rows.length);

    // Edit a nonexistent id.
    const noSuch = await owner.go("/admin/knowledge/no-such-article-id/edit");
    check("GET .../edit for an id that does not exist -> 404", noSuch.status === 404);

    // The corpus list draws an Edit link per row, and a New-article link, for a knowledge.write role.
    const listPage = await owner.go("/admin/knowledge");
    check("the Articles table draws an Edit link for a knowledge.write role", new RegExp(`href="/admin/knowledge/${"b2test-editor-new"}/edit"`).test(listPage.text));
  }

  console.log("\n=== B3-1. enrollment secrets: mint, list, revoke (console) ===");
  {
    const page = await owner.go("/admin/agents");
    check("GET /admin/agents -> 200, no secret minted yet", page.status === 200 && /No enrollment secret has ever been minted/.test(page.text));
    const token = csrfOf(page.text);

    const minted = await owner.go("/admin/agents/secrets/new", { method: "POST", form: { _csrf: token, ttlDays: "30" } });
    check("POST secrets/new -> 200, the plaintext is shown once", minted.status === 200 && /shown once, then never again/.test(minted.text));
    const b3Secret = minted.text.match(/<div class="mono" style="margin-top:6px;font-size:15px;word-break:break-all">([^<]+)<\/div>/)?.[1];
    check("a real secret string came back", typeof b3Secret === "string" && b3Secret.length > 20, String(b3Secret));
    check("minting is audited (device.secret.create), never the secret itself",
      (await auditRows()).some((r) => r.action === "device.secret.create" && r.email === made.owner.email) &&
      !(await auditRows()).some((r) => r.action === "device.secret.create" && JSON.stringify(r.detail).includes(b3Secret)));
  }

  console.log("\n=== B3-2. POST /v1/enroll: auto-approve on (the default), then off ===");
  {
    // Mint a secret dedicated to this block so it does not depend on B3-1's intermediate state.
    const page = await owner.go("/admin/agents");
    const secretResp = await owner.go("/admin/agents/secrets/new", { method: "POST", form: { _csrf: csrfOf(page.text), ttlDays: "1" } });
    const secret = secretResp.text.match(/<div class="mono" style="margin-top:6px;font-size:15px;word-break:break-all">([^<]+)<\/div>/)?.[1];

    const enroll1 = await fetch(`${base}/v1/enroll`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenant: slug, deviceKeyId: "b3test-device-auto", secret }),
    });
    const e1 = await enroll1.json();
    check("auto-approve is the default (D80) -> 200, status active", enroll1.status === 200 && e1.ok === true && e1.status === "active", JSON.stringify(e1));
    check("re-submitting the SAME device -> 200, 'already active', not a new row", (await (await fetch(`${base}/v1/enroll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant: slug, deviceKeyId: "b3test-device-auto", secret }) })).json()).status === "active");

    const wrongTenant = await fetch(`${base}/v1/enroll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant: "no-such-tenant-slug", deviceKeyId: "x", secret }) });
    check("an unknown tenant slug -> 403, same message as a wrong secret (no enumeration)", wrongTenant.status === 403);
    const wrongSecret = await fetch(`${base}/v1/enroll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant: slug, deviceKeyId: "x", secret: "not-the-secret" }) });
    check("…and a real tenant with a wrong secret -> the SAME 403 body shape", wrongSecret.status === 403 && (await wrongSecret.json()).error === (await wrongTenant.json()).error);
    resetEnrollmentThrottle(); // the two refusals above should not count toward B3-4's lockout test

    // Turn auto-approve off, then enroll a second device — it must land in the pending queue.
    // The form's hidden field carries the value that FLIPS the current setting (empty string when
    // it is currently on, per autoApproveForm()) — submit that, not a hardcoded "1", which would
    // just re-affirm "on" and silently not toggle anything.
    const off = await owner.go("/admin/agents/auto-approve", { method: "POST", form: { _csrf: csrfOf((await owner.go("/admin/agents")).text), enabled: "" } });
    check("toggling auto-approve off -> 200, and the page says it is off", off.status === 200 && /Auto-approve is now OFF/.test(off.text));
    check("device.auto_approve.set is audited", (await auditRows()).some((r) => r.action === "device.auto_approve.set" && r.detail?.enabled === false));

    const enroll2 = await fetch(`${base}/v1/enroll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant: slug, deviceKeyId: "b3test-device-pending", secret }) });
    const e2 = await enroll2.json();
    check("with auto-approve off -> 202, status pending", enroll2.status === 202 && e2.status === "pending", JSON.stringify(e2));

    const queue = await owner.go("/admin/agents");
    check("the pending device is on the Agents page queue", /b3test-device-pending/.test(queue.text));
    check("the active device from before is listed too, with a checkbox to revoke it", new RegExp(`name="device_${e1.deviceId}"`).test(queue.text));

    const approveToken = csrfOf(queue.text);
    const approved = await owner.go(`/admin/agents/${e2.requestId}/approve`, { method: "POST", form: { _csrf: approveToken } });
    check("Approve -> 200, and the device is now active", approved.status === 200 && /Approved b3test-device-pending/.test(approved.text));
    check("device.enroll.approve is audited with the actor and the device", (await auditRows()).some((r) => r.action === "device.enroll.approve" && r.email === made.owner.email && r.subject === "b3test-device-pending"));

    // A third device, this time rejected — it must end up revoked, not stuck pending (state-machine note in enrollment.js).
    const enroll3 = await fetch(`${base}/v1/enroll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant: slug, deviceKeyId: "b3test-device-rejected", secret }) });
    const e3 = await enroll3.json();
    const rejected = await owner.go(`/admin/agents/${e3.requestId}/reject`, { method: "POST", form: { _csrf: csrfOf((await owner.go("/admin/agents")).text) } });
    check("Reject -> 200", rejected.status === 200 && /Rejected b3test-device-rejected/.test(rejected.text));
    const { rows: [byKey] } = await getPool().query(
      `SELECT d.status FROM control.devices d JOIN control.tenants tn ON tn.id = d.tenant_id WHERE tn.slug = $1 AND d.device_key_id = $2`,
      [slug, "b3test-device-rejected"],
    );
    check("a rejected request's device is REVOKED, not left pending forever", byKey?.status === "revoked", JSON.stringify(byKey));
  }

  console.log("\n=== B3-3. bulk revocation by batch (D83a), and revoking a secret ===");
  {
    const page = await owner.go("/admin/agents");
    const { rows: devices } = await getPool().query(
      `SELECT d.id FROM control.devices d JOIN control.tenants tn ON tn.id = d.tenant_id WHERE tn.slug = $1 AND d.status = 'active'`,
      [slug],
    );
    check("there are at least two active devices to bulk-revoke (auto and pending-then-approved)", devices.length >= 2, String(devices.length));
    const form = { _csrf: csrfOf(page.text) };
    for (const d of devices) form[`device_${d.id}`] = "1";
    const revoked = await owner.go("/admin/agents/revoke", { method: "POST", form });
    check(`Revoke selected -> 200, revoked ${devices.length}`, revoked.status === 200 && new RegExp(`Revoked ${devices.length} device`).test(revoked.text));
    check("device.revoke is audited with the count and the ids", (await auditRows()).some((r) => r.action === "device.revoke" && r.detail?.count === devices.length));
    const { rows: stillActive } = await getPool().query(
      `SELECT count(*)::int AS n FROM control.devices d JOIN control.tenants tn ON tn.id = d.tenant_id WHERE tn.slug = $1 AND d.status = 'active'`,
      [slug],
    );
    check("none of them are active any more", stillActive[0].n === 0);

    const secretsPage = await owner.go("/admin/agents");
    const { rows: liveSecrets } = await getPool().query(
      `SELECT es.id FROM control.enrollment_secrets es JOIN control.tenants tn ON tn.id = es.tenant_id WHERE tn.slug = $1 AND es.revoked_at IS NULL`,
      [slug],
    );
    check("at least one live secret exists to revoke", liveSecrets.length > 0);
    const secretRevoke = await owner.go(`/admin/agents/secrets/${liveSecrets[0].id}/revoke`, { method: "POST", form: { _csrf: csrfOf(secretsPage.text) } });
    check("revoking a secret -> 200", secretRevoke.status === 200 && /Secret revoked/.test(secretRevoke.text));
    const afterRevoke = await fetch(`${base}/v1/enroll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant: slug, deviceKeyId: "b3test-should-fail", secret: "irrelevant-now" }) });
    check("…and a fresh enrollment attempt with ANY secret for this tenant is refused once nothing is live (if this was the only secret)", afterRevoke.status === 403 || liveSecrets.length > 1);
  }

  console.log("\n=== B3-4. rate limiting: five bad secrets lock enrollment for the tenant, even for a good one (D83) ===");
  {
    resetEnrollmentThrottle();
    for (let i = 0; i < 5; i++) {
      const r = await fetch(`${base}/v1/enroll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant: slug, deviceKeyId: `b3test-fail-${i}`, secret: "wrong-every-time" }) });
      check(`bad attempt ${i + 1}/5 -> 403`, r.status === 403);
    }
    const sixth = await fetch(`${base}/v1/enroll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant: slug, deviceKeyId: "b3test-should-be-locked", secret: "wrong-every-time" }) });
    check("the 6th attempt -> 429, locked, not 403", sixth.status === 429);
    const sixthBody = await sixth.json();
    check("…and it names a retry window", typeof sixthBody.retryAfterMs === "number" && sixthBody.retryAfterMs > 0);
    resetEnrollmentThrottle();
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
    // Exit criterion 6's other half: the auditor can open neither the search nor the ingest.
    const aSearch = await auditor.go("/admin/knowledge/search?q=anything");
    check("GET /admin/knowledge/search -> 403, naming knowledge.read", aSearch.status === 403 && /knowledge\.read/.test(aSearch.text), String(aSearch.status));
    const aIngest = await auditor.go("/admin/knowledge/ingest", { method: "POST", form: { _csrf: agentCsrf, bundle: bundleJson([VPN_ARTICLE]) } });
    check("POST /admin/knowledge/ingest -> 403 (knowledge.write) even with a CSRF token from another session — a token is not a permission",
      aIngest.status === 403, String(aIngest.status));
    // D230: the editor is gated on knowledge.write like the ingest form, not on knowledge.read.
    check("GET /admin/knowledge/new -> 403, naming knowledge.write", (await auditor.go("/admin/knowledge/new")).status === 403);
    check("GET /admin/knowledge/b2test-vpn/edit -> 403, naming knowledge.write", (await auditor.go("/admin/knowledge/b2test-vpn/edit")).status === 403);
    const aSave = await auditor.go("/admin/knowledge/save", { method: "POST", form: { _csrf: agentCsrf, _editing: "", id: "b2test-should-not-land", type: "troubleshooting", title: "x" } });
    check("POST /admin/knowledge/save -> 403 even with a CSRF token from another session", aSave.status === 403);
    check("…and nothing landed", !(await getPool().query("SELECT 1 FROM control.kb_articles WHERE id = $1", ["b2test-should-not-land"])).rows.length);
    check("…and both refusals were audited with the permission that was missing",
      (await auditRows()).filter((r) => r.action === "access.denied" && r.email === made.auditor.email && /^knowledge\./.test(String(r.detail?.needs))).length >= 2);
    check("the permission check runs BEFORE the CSRF check, so the auditor's refusal is access.denied and not csrf.refused",
      (await auditRows()).some((r) => r.action === "access.denied" && r.email === made.auditor.email && r.detail?.needs === "knowledge.write"));
    check("the corpus still holds exactly one embedding model and nothing the auditor sent landed",
      (await corpusStatus()).models.length === 1);
    const agents = await auditor.go("/admin/agents");
    check("GET /admin/agents -> 403", agents.status === 403);
    const aAgentsAction = await auditor.go("/admin/agents/auto-approve", { method: "POST", form: { _csrf: agentCsrf, enabled: "" } });
    check("POST /admin/agents/auto-approve -> 403 (agents.manage), even with a CSRF token from another session", aAgentsAction.status === 403);
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
