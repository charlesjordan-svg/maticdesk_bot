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
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHubServer, resetCredentialThrottle } from "../src/index.js";
import { resetReadThrottle, READS_PER_MINUTE, NEEDS_CREDENTIAL } from "../src/tickets/read.js";
import { migrate } from "../src/db/migrate.js";
import { createTenant, dropTenantForTests } from "../src/db/tenants.js";
import { getPool, closePool, withControl } from "../src/db/pool.js";
import { createTicket } from "../src/tickets/file.js";
import { listTickets, getTicket, listEntries, addEntry, setTicketState, resolveTicket } from "../src/tickets/query.js";
import { createAdminUser, resetAdminCredentials, setAdminStatus } from "../src/admin/users.js";
import { corpusStatus } from "../src/kb/ingest.js";
import { gapFeed } from "../src/admin/queries.js";
import { resetEnrollmentThrottle, authenticateDeviceCredential } from "../src/devices/enrollment.js";
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
    // D272, on the REAL page over HTTP: the never-enrolls caveat sits between the counters and the
    // first panel. The static half (rendered with fake rows, and pinned to client/src's behaviour)
    // is admin-static.test.mjs §6a; this is the same sentence reaching a browser.
    check("Agents (D272): the page says no Matic Desk endpoint enrolls itself, above the first panel",
      /No Matic Desk endpoint enrolls itself/.test(agents.text) && agents.text.indexOf("enrolls itself") < agents.text.indexOf('<div class="panel">'));
    check("Agents (D272): …and that a running endpoint does not appear here and the counts are not a fleet", /these counts are not a fleet/.test(agents.text));
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

    // Since D280 every state form carries the state the operator SAW as `from`; the guard in the
    // UPDATE compares against it and the NEXT_STATES consult is on it too.
    const bad = await owner.go(`/admin/tickets/${ref}/state`, { method: "POST", form: { next: "new", from: "new", _csrf: csrf } });
    check("a transition the console does not offer (new -> new) -> 400 and audited", bad.status === 400 && (await auditRows()).some((r) => r.action === "ticket.state.refused"));
    const moved = await owner.go(`/admin/tickets/${ref}/state`, { method: "POST", form: { next: "open", from: "new", _csrf: csrf } });
    check("POST with the token -> 303 back to the ticket", moved.status === 303 && moved.location === `/admin/tickets/${ref}?changed=1`, `${moved.status} ${moved.location}`);
    check("the row changed", (await getTicket(schema, ref)).state === "open");
    const row = (await auditRows()).find((r) => r.action === "ticket.state");
    check("audited as ticket.state with actor, subject and {from, to} — and no ticket text", Boolean(row) && row.email === made.owner.email && row.subject === ref && row.detail.from === "new" && row.detail.to === "open" && !/cracked/.test(JSON.stringify(row)));
    const cliShow = spawnSync(process.execPath, [join(SERVER, "bin/tickets.mjs"), "show", ref], { encoding: "utf8", env: { ...process.env, MATIC_TICKET_TENANT: schema } });
    check("the CLI sees the change through the same query layer", cliShow.status === 0 && new RegExp(`${ref}\\s+open`).test(cliShow.stdout));

    // D269: the internal resolution note, written from the console — since P2 through the RESOLVE
    // form (D278), where the internal note rides beside the requester-visible one — read back on
    // the detail page and by the CLI: the round trip tenant/004's comment claimed and nothing did.
    const NOTE = "swapped the <dock> & re-seated the cable";
    const RES_NOTES = "Your dock's firmware was out of date; it is updated & the cable re-seated. Please try again.";
    const cliEnv = { ...process.env, MATIC_TICKET_TENANT: schema };
    const resolved = await owner.go(`/admin/tickets/${ref}/resolve`, { method: "POST", form: { from: "open", resolutionCode: "fixed", resolutionNotes: `  ${RES_NOTES}  `, note: `  ${NOTE}\r\n`, _csrf: csrf } });
    check("POST resolve with a code, notes and an internal note -> 303, and the redirect says resolved and noted", resolved.status === 303 && /resolved=1/.test(resolved.location ?? "") && /noted=1/.test(resolved.location ?? ""), `${resolved.status} ${resolved.location}`);
    const afterNote = await getTicket(schema, ref);
    check("the query layer returns the internal note, trimmed, AND the resolution: code, notes trimmed, resolved_at", afterNote.state === "resolved" && afterNote.internalResolutionNote === NOTE && afterNote.resolutionCode === "fixed" && afterNote.resolutionNotes === RES_NOTES && afterNote.resolvedAt instanceof Date, JSON.stringify([afterNote.internalResolutionNote, afterNote.resolutionCode, afterNote.resolutionNotes]));
    const page2 = await owner.go(`/admin/tickets/${ref}`);
    check("the detail page renders it, ESCAPED, under a heading that says it is internal and that the requester never sees it",
      page2.text.includes(escapeHtml(NOTE)) && !page2.text.includes("<dock>") && /Internal resolution note/.test(page2.text) && /requester never sees it/.test(page2.text));
    const cliNote = spawnSync(process.execPath, [join(SERVER, "bin/tickets.mjs"), "show", ref], { encoding: "utf8", env: cliEnv });
    check("bin/tickets.mjs show prints the same note and says it is internal", cliNote.status === 0 && cliNote.stdout.includes(NOTE) && /internal resolution note/.test(cliNote.stdout), cliNote.stderr.slice(0, 200));
    const noteRow = (await auditRows()).find((r) => r.action === "ticket.resolve");
    check("audited as ticket.resolve with from, the code and noted: true — and NOT the internal note's text or the resolution notes'", Boolean(noteRow) && noteRow.detail.from === "open" && noteRow.detail.code === "fixed" && noteRow.detail.noted === true && !/dock|firmware/.test(JSON.stringify(noteRow)), JSON.stringify(noteRow?.detail));
    const closed = await owner.go(`/admin/tickets/${ref}/state`, { method: "POST", form: { next: "closed", from: "resolved", note: "   ", _csrf: csrf } });
    check("a later move with a blank note -> 303 without noted=1, and the earlier note is KEPT (COALESCE)",
      closed.status === 303 && !/noted=1/.test(closed.location ?? "") && (await getTicket(schema, ref)).internalResolutionNote === NOTE, `${closed.status} ${closed.location}`);
    const blankRow = (await auditRows()).find((r) => r.action === "ticket.state" && r.detail.to === "closed");
    check("…and that move is audited with noted: false", Boolean(blankRow) && blankRow.detail.noted === false);
    const cliState = spawnSync(process.execPath, [join(SERVER, "bin/tickets.mjs"), "state", ref, "open", "--note", "reopened: the dock failed again"], { encoding: "utf8", env: cliEnv });
    check("bin/tickets.mjs state --note writes through the same function and says so", cliState.status === 0 && /internal note recorded/.test(cliState.stdout) && (await getTicket(schema, ref)).internalResolutionNote === "reopened: the dock failed again", cliState.stderr.slice(0, 200));
    const page3 = await owner.go(`/admin/tickets/${ref}`);
    check("…and the console shows what the CLI wrote", page3.text.includes("reopened: the dock failed again"));
    check("the CLI's reopen (a LIVE state) cleared the current resolution and the closed stamps; the internal note stays", (({ resolutionCode, resolutionNotes, resolvedAt, closedAt, closedBy, internalResolutionNote }) => resolutionCode === null && resolutionNotes === null && resolvedAt === null && closedAt === null && closedBy === null && internalResolutionNote === "reopened: the dock failed again")(await getTicket(schema, ref)));

    // D275/D276: THE TIMELINE. The four moves above each wrote a public state_change entry inside
    // the move's own transaction — three attributed to the console user's email, one to
    // bin/tickets.mjs — and the work note is the ONE composer this build has. Then the rule that
    // matters: listEntries(public) cannot return the internal row, and there is no default.
    const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const before6 = await listEntries(schema, ref, { visibility: "all" });
    check("the four state changes above each wrote a state_change entry, public, in order — and the resolve wrote a public resolution entry with the notes as its body",
      before6.length === 5 && before6.every((e) => e.visibility === "public") && before6.filter((e) => e.kind === "state_change").map((e) => e.body).join("|") === "new → open|open → resolved|resolved → closed|closed → open"
      && before6.filter((e) => e.kind === "resolution").length === 1 && before6.find((e) => e.kind === "resolution").body === RES_NOTES,
      before6.map((e) => `${e.kind}:${e.visibility}:${e.body}`).join("|"));
    check("four are attributed to the console user's email (snapshot, D143) and one to bin/tickets.mjs",
      before6.filter((e) => e.authorKind === "console_user" && e.authorLabel === made.owner.email).length === 4 && before6.filter((e) => e.authorKind === "system" && e.authorLabel === "bin/tickets.mjs").length === 1);
    const page4 = await owner.go(`/admin/tickets/${ref}`);
    check("the detail page draws the timeline: 5 entries, each labelled public IN WORDS", /Timeline<span class="count">5<\/span>/.test(page4.text) && (page4.text.match(/reaches nobody in this build \(D86\)/g) ?? []).length === 5);
    check("D276: the indicator reads none, with the reason in words (no requester can comment in this build)", /Oldest unanswered requester comment: none\./.test(page4.text) && /No requester can comment in this build/.test(page4.text));
    check("D276: the list page carries the same indicator", /Oldest unanswered requester comment: none\./.test((await owner.go("/admin/tickets")).text));
    check("the page offers ONE composer — Add work note — and no reply-to-requester", new RegExp(`action="/admin/tickets/${ref}/worknote"`).test(page4.text) && !/[Rr]eply to requester/.test(page4.text) && !/name="visibility"/.test(page4.text));
    const csrf4 = csrfOf(page4.text);
    const NOTE_BODY = "called the user; <dock> firmware & cable both replaced";
    const noCsrfWn = await owner.go(`/admin/tickets/${ref}/worknote`, { method: "POST", form: { body: NOTE_BODY } });
    check("POST worknote without the token -> 403", noCsrfWn.status === 403);
    const emptyWn = await owner.go(`/admin/tickets/${ref}/worknote`, { method: "POST", form: { body: "   ", _csrf: csrf4 } });
    check("an empty work note -> 400 saying it needs words, and nothing was added", emptyWn.status === 400 && /needs words/.test(emptyWn.text) && (await listEntries(schema, ref, { visibility: "all" })).length === 5);
    const wn = await owner.go(`/admin/tickets/${ref}/worknote`, { method: "POST", form: { body: `  ${NOTE_BODY}\r\n`, _csrf: csrf4 } });
    check("POST worknote with the token -> 303 back to the ticket, flagged worknote=1", wn.status === 303 && wn.location === `/admin/tickets/${ref}?worknote=1`, `${wn.status} ${wn.location}`);
    const all6 = await listEntries(schema, ref, { visibility: "all" });
    const note6 = all6.find((e) => e.kind === "work_note");
    check("listEntries(all) returns the work note: trimmed, INTERNAL, attributed to the console user's email",
      all6.length === 6 && Boolean(note6) && note6.body === NOTE_BODY && note6.visibility === "internal" && note6.authorKind === "console_user" && note6.authorLabel === made.owner.email, JSON.stringify(note6));
    const pub6 = await listEntries(schema, ref, { visibility: "public" });
    check("listEntries(public) CANNOT return the internal row — 5 entries, none internal, no work note (P1 exit criterion 2)",
      pub6.length === 5 && pub6.every((e) => e.visibility === "public") && !pub6.some((e) => e.kind === "work_note"));
    check("listEntries() with no visibility THROWS — there is no default", await listEntries(schema, ref, {}).then(() => false, (e) => /no default/.test(e.message)));
    check("…and so does visibility: 'internal' — only 'public' and 'all' exist", await listEntries(schema, ref, { visibility: "internal" }).then(() => false, (e) => /public, all/.test(e.message)));
    check("addEntry() REFUSES a comment in this build (WRITABLE_KINDS): no requester-visible entry can be written before P4 can deliver one",
      await addEntry(schema, ref, { kind: "comment", body: "x", author: { kind: "console_user", label: "x" } }).then(() => false, (e) => /P4/.test(e.message)));
    const page5 = await owner.go(`/admin/tickets/${ref}`);
    check("the detail page renders the work note ESCAPED, labelled internal in words, newest last",
      page5.text.includes(escapeHtml(NOTE_BODY)) && !page5.text.includes("<dock>") && /pill internal">internal<\/span> <span>the requester never sees this/.test(page5.text) && page5.text.indexOf(escapeHtml(NOTE_BODY)) > page5.text.lastIndexOf("closed → open"));
    check("…and the redirect target shows the flash", /Work note added — internal/.test((await owner.go(`/admin/tickets/${ref}?worknote=1`)).text));
    const cliTl = spawnSync(process.execPath, [join(SERVER, "bin/tickets.mjs"), "show", ref], { encoding: "utf8", env: cliEnv });
    check("bin/tickets.mjs show prints the timeline through the SAME listEntries(): 6 entries, the work note [INTERNAL], the four moves and the resolution [public] (P1 exit criterion 1)",
      cliTl.status === 0 && /timeline \(6 entries/.test(cliTl.stdout)
      && new RegExp(`\\[INTERNAL\\]  work note\\s+${reEsc(made.owner.email)}\\s+${reEsc(NOTE_BODY)}`).test(cliTl.stdout)
      // Entry LINES only: the timeline's heading also says "[public]" while explaining the label.
      && (cliTl.stdout.match(/^\s+\d{4}-\d\d-\d\d \d\d:\d\d  \[public\]/gm) ?? []).length === 5 && /bin\/tickets\.mjs\s+closed → open/.test(cliTl.stdout),
      cliTl.stdout.slice(-700) + cliTl.stderr.slice(0, 200));
    const wnRow = (await auditRows()).find((r) => r.action === "ticket.worknote");
    check("audited as ticket.worknote with actor, subject and the entry id — and NOT the words",
      Boolean(wnRow) && wnRow.email === made.owner.email && wnRow.subject === ref && wnRow.detail.entry === note6.id && !/firmware|dock/.test(JSON.stringify(wnRow)), JSON.stringify(wnRow?.detail));
  }

  console.log("\n=== 5d. resolution means something: refused without code and notes, closed terminal, the guard in the UPDATE (D278–D280) ===");
  {
    const rows = await listTickets(schema);
    const ref = rows.find((r) => r.state === "open").reference;
    const cliEnv = { ...process.env, MATIC_TICKET_TENANT: schema };
    const cliRun = (...args) => spawnSync(process.execPath, [join(SERVER, "bin/tickets.mjs"), ...args], { encoding: "utf8", env: cliEnv });

    // The page for an OPEN ticket: no state form (the one move is to resolve), the Resolve form drawn.
    const openPage = await owner.go(`/admin/tickets/${ref}`);
    check("from open the console draws NO state form and says the one move is to resolve — closing comes after resolving (D279)", !/action="\/admin\/tickets\/[^"]+\/state"/.test(openPage.text) && /the one move this console offers is to resolve it/.test(openPage.text));
    check("…and draws the Resolve form with the six codes glossed, a required notes field, and the delivered-to-nobody sentence", new RegExp(`action="/admin/tickets/${ref}/resolve"`).test(openPage.text) && /<option value="no_fault_found">No fault found \(no_fault_found\)<\/option>/.test(openPage.text) && /name="resolutionNotes"[^>]*required/.test(openPage.text) && /delivered to nobody in this build/.test(openPage.text));
    check("the page says the ticket is Not resolved (the CLI's reopen cleared the current resolution)", /Not resolved\./.test(openPage.text));
    const csrfR = csrfOf(openPage.text);

    // D278 — refused without both, with a sentence naming what is missing; nothing changes.
    const noNotes = await owner.go(`/admin/tickets/${ref}/resolve`, { method: "POST", form: { from: "open", resolutionCode: "fixed", resolutionNotes: "   ", _csrf: csrfR } });
    check("resolve with a code and NO notes -> 400 naming the notes, and the ticket is still open", noNotes.status === 400 && /cannot be resolved without resolution notes the requester will read \(D278\)/.test(noNotes.text) && (await getTicket(schema, ref)).state === "open", String(noNotes.status));
    const badCode = await owner.go(`/admin/tickets/${ref}/resolve`, { method: "POST", form: { from: "open", resolutionCode: "sorted", resolutionNotes: "done", _csrf: csrfR } });
    check("resolve with a code outside the six -> 400 naming the six", badCode.status === 400 && /a resolution code \(one of fixed, workaround/.test(badCode.text) && (await getTicket(schema, ref)).state === "open");
    const neither = await owner.go(`/admin/tickets/${ref}/resolve`, { method: "POST", form: { from: "open", _csrf: csrfR } });
    check("resolve with neither -> 400 naming BOTH, joined with 'and'", neither.status === 400 && /a resolution code \(one of [^)]+\) and resolution notes the requester will read/.test(neither.text));
    check("each refusal is audited as ticket.resolve.refused, with the code (or null) and whether notes were given — never text", (await auditRows()).filter((r) => r.action === "ticket.resolve.refused").length === 3 && (await auditRows()).every((r) => r.action !== "ticket.resolve.refused" || !/done|sorted/.test(JSON.stringify(r.detail))));

    // D278 — resolved properly, from the console.
    const RES2 = "Workaround: use the <left> USB-C port until the dock is replaced.";
    const ok = await owner.go(`/admin/tickets/${ref}/resolve`, { method: "POST", form: { from: "open", resolutionCode: "workaround", resolutionNotes: RES2, _csrf: csrfR } });
    check("resolve with code and notes -> 303 flagged resolved=1 and no noted=1 (no internal note this time)", ok.status === 303 && /resolved=1/.test(ok.location ?? "") && !/noted=1/.test(ok.location ?? ""), `${ok.status} ${ok.location}`);
    const t2 = await getTicket(schema, ref);
    check("the row: resolved, code workaround, notes as given, resolved_at set, the earlier internal note untouched", t2.state === "resolved" && t2.resolutionCode === "workaround" && t2.resolutionNotes === RES2 && t2.resolvedAt instanceof Date && t2.internalResolutionNote === "reopened: the dock failed again", JSON.stringify([t2.resolutionCode, t2.internalResolutionNote]));
    const resolvedPage = await owner.go(`/admin/tickets/${ref}?changed=1&resolved=1`);
    check("the detail page glosses the code (D244), renders the notes ESCAPED under a requester-visible-but-delivered-to-nobody caption, and the flash says the requester has NOT been told",
      /Workaround in place <span class="muted mono">workaround<\/span>/.test(resolvedPage.text) && resolvedPage.text.includes(escapeHtml(RES2)) && !resolvedPage.text.includes("<left>") && /requester-visible, delivered to nobody yet/.test(resolvedPage.text) && /The requester has NOT been told/.test(resolvedPage.text));
    check("…the state form now offers closed and open from resolved, with from=resolved hidden, and no Resolve form", /<option value="closed">closed<\/option>/.test(resolvedPage.text) && /<input type="hidden" name="from" value="resolved">/.test(resolvedPage.text) && !new RegExp(`action="/admin/tickets/${ref}/resolve"`).test(resolvedPage.text));
    const cliShow2 = cliRun("show", ref);
    check("bin/tickets.mjs show prints the resolution — code glossed, notes, and REQUESTER-VISIBLE … nobody sees it", cliShow2.status === 0 && /code      workaround — Workaround in place/.test(cliShow2.stdout) && cliShow2.stdout.includes(RES2) && /REQUESTER-VISIBLE once P4 delivers it; nobody sees it in this build/.test(cliShow2.stdout), cliShow2.stdout.slice(-500));
    const resEntries = (await listEntries(schema, ref, { visibility: "public" })).filter((e) => e.kind === "resolution");
    check("the timeline keeps EVERY resolution as a public entry — two now, across the reopen — while the row holds the current one", resEntries.length === 2 && resEntries[1].body === RES2 && resEntries[1].authorLabel === made.owner.email);
    // auditRows() is newest first; the workaround resolve is the newest ticket.resolve row.
    const okRow = (await auditRows()).find((r) => r.action === "ticket.resolve" && r.detail.code === "workaround");
    check("audited as ticket.resolve {from: open, code: workaround, noted: false} — and no notes text", Boolean(okRow) && okRow.detail.from === "open" && okRow.detail.code === "workaround" && okRow.detail.noted === false && !/USB-C|left/.test(JSON.stringify(okRow)), JSON.stringify(okRow?.detail));

    // D280 — a stale form: the operator's page said `new` (a state from which open IS offered), but the ticket is resolved now.
    const staleMove = await owner.go(`/admin/tickets/${ref}/state`, { method: "POST", form: { next: "open", from: "new", _csrf: csrfR } });
    check("a stale form (from=new, ticket is resolved) -> 409, the sentence names where it is NOW, and nothing moved", staleMove.status === 409 && new RegExp(`${ref} is resolved now, not new`).test(staleMove.text) && (await getTicket(schema, ref)).state === "resolved", String(staleMove.status));
    check("…audited as ticket.state.refused with why: stale and now: resolved", (await auditRows()).some((r) => r.action === "ticket.state.refused" && r.detail.why === "stale" && r.detail.now === "resolved"));
    const staleResolve = await owner.go(`/admin/tickets/${ref}/resolve`, { method: "POST", form: { from: "open", resolutionCode: "fixed", resolutionNotes: "again", _csrf: csrfR } });
    check("a stale Resolve form (from=open) -> 409 too, and the current resolution is untouched", staleResolve.status === 409 && (await getTicket(schema, ref)).resolutionCode === "workaround");
    const stateToResolved = await owner.go(`/admin/tickets/${ref}/state`, { method: "POST", form: { next: "resolved", from: "resolved", _csrf: csrfR } });
    check("POST state next=resolved -> 400 pointing at the Resolve form (a state change cannot make a resolution)", stateToResolved.status === 400 && /Resolving takes more than a state/.test(stateToResolved.text));

    // D279 — closed is terminal in the console.
    const closeIt = await owner.go(`/admin/tickets/${ref}/state`, { method: "POST", form: { next: "closed", from: "resolved", _csrf: csrfR } });
    const t3 = await getTicket(schema, ref);
    check("resolved -> closed from the console: 303; closed_at set, closed_by console_user, the resolution KEPT", closeIt.status === 303 && t3.state === "closed" && t3.closedAt instanceof Date && t3.closedBy === "console_user" && t3.resolutionCode === "workaround" && t3.resolutionNotes === RES2);
    const closedPage = await owner.go(`/admin/tickets/${ref}`);
    check("the closed page draws NO form at all and says closed is terminal here, naming the CLI as the correction tool", !/action="\/admin\/tickets\/[^"]+\/(state|resolve)"/.test(closedPage.text) && /Closed is terminal in this console \(D279\)/.test(closedPage.text) && /Closed \d{4}-\d\d-\d\d \d\d:\d\d by a console user\./.test(closedPage.text));
    const reopenTry = await owner.go(`/admin/tickets/${ref}/state`, { method: "POST", form: { next: "open", from: "closed", _csrf: csrfR } });
    check("POST closed -> open from the console -> 400: not offered, closed is terminal here", reopenTry.status === 400 && /closed is terminal here \(D279\)/.test(reopenTry.text) && (await getTicket(schema, ref)).state === "closed");

    // The CLI: the correction tool, except that it cannot make a resolved ticket with no resolution.
    const cliResolvedByState = cliRun("state", ref, "resolved");
    check("bin/tickets.mjs state <ref> resolved is REFUSED with a sentence pointing at resolve (exit 1)", cliResolvedByState.status === 1 && /cannot be moved to resolved by a state change/.test(cliResolvedByState.stderr), cliResolvedByState.stderr.slice(0, 200));
    const cliReopen = cliRun("state", ref, "open");
    const t4 = await getTicket(schema, ref);
    check("bin/tickets.mjs state <ref> open reopens a CLOSED ticket (the correction tool, D279) and clears the closed stamps and the current resolution", cliReopen.status === 0 && t4.state === "open" && t4.closedAt === null && t4.closedBy === null && t4.resolutionCode === null, cliReopen.stderr.slice(0, 200));
    const cliNoNotes = cliRun("resolve", ref, "--code", "fixed");
    check("bin/tickets.mjs resolve without --resolution is refused through the SAME function, with the same sentence", cliNoNotes.status === 1 && /cannot be resolved without resolution notes the requester will read/.test(cliNoNotes.stderr));
    const cliOk = cliRun("resolve", ref, "--code", "fixed", "--resolution", "Replaced the dock. Please confirm it works for you.");
    const t5 = await getTicket(schema, ref);
    check("bin/tickets.mjs resolve --code --resolution resolves, prints the glossed code, and says THE REQUESTER HAS NOT BEEN TOLD", cliOk.status === 0 && /-> resolved \(fixed — Fixed\)/.test(cliOk.stdout) && /THE REQUESTER HAS NOT BEEN TOLD/.test(cliOk.stdout) && t5.state === "resolved" && t5.resolutionCode === "fixed", cliOk.stdout + cliOk.stderr);
    check("…and the timeline's third resolution entry is attributed to bin/tickets.mjs", (await listEntries(schema, ref, { visibility: "public" })).filter((e) => e.kind === "resolution").length === 3 && (await listEntries(schema, ref, { visibility: "all" })).at(-1).authorLabel === "bin/tickets.mjs");

    // D280 — the race. Two moves from the same seen state, concurrently: exactly one lands.
    const { reference: ref2 } = await createTicket(schema, {
      description: "second ticket for the race", summary: "Two operators click at once.", category: "other", suggestedOwner: null, reporter: { osUsername: "racer" },
    });
    const author = { kind: "console_user", adminUserId: made.owner.id, label: made.owner.email };
    const [a, b] = await Promise.all([
      setTicketState(schema, ref2, "open", { from: "new", author, note: "operator A" }),
      setTicketState(schema, ref2, "open", { from: "new", author, note: "operator B" }),
    ]);
    const landed = [a, b].filter((r) => r && !("refused" in r)), refusedOnes = [a, b].filter((r) => r && "refused" in r);
    check("TWO CONCURRENT MOVES FROM THE SAME SEEN STATE: exactly one lands and exactly one is refused, naming the state now (the guard is in the UPDATE, D280)",
      landed.length === 1 && refusedOnes.length === 1 && landed[0].from === "new" && refusedOnes[0].state === "open" && /is open now, not new/.test(refusedOnes[0].refused), JSON.stringify([a, b]));
    check("…and the ticket has exactly ONE state_change entry — the loser wrote nothing", (await listEntries(schema, ref2, { visibility: "all" })).filter((e) => e.kind === "state_change").length === 1);
    check("…the winner's internal note is the one kept; the loser's never landed", ["operator A", "operator B"].includes((await getTicket(schema, ref2)).internalResolutionNote) && (await getTicket(schema, ref2)).internalResolutionNote === (landed[0] === a ? "operator A" : "operator B"));
    check("an unconditional move (from: null — the CLI's shape) still lands", ((await setTicketState(schema, ref2, "closed", { author: { kind: "system", label: "bin/tickets.mjs" } })) ?? {}).to === "closed" && (await getTicket(schema, ref2)).closedBy === "system");
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
      ticket_entries: {
        // tenant/006's header carries the reason at length; one line each here (D269's rule).
        notified_at: "D275 → P4 — hub-stamped when an entry is handed to the endpoint; nothing delivers in this build",
        read_by_requester_at: "D275 → P4 — hub-stamped on the endpoint's ack, never client-sent; nothing acks in this build",
      },
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

  console.log("\n=== 5e. the requester-safe read shape, live: every column classified, this ENROLLMENT's tickets only, no internal row (D281/D284; D269's condition) ===");
  {
    // THE COLUMN CLASSIFICATION IS THE FEATURE. Every column information_schema lists for
    // `tickets` must be on exactly one of these two lists. A column added later and put on
    // neither FAILS here — the allow-list fails closed where a denylist of names would have
    // admitted it silently. The FIELD half (what the readers return, by name, with a reason per
    // field) is admin-static §5f and runs headless; this half is what the migrations actually
    // produced, joined to what the functions actually returned, on a ticket that has every
    // internal field POPULATED — not one where they happen to be null.
    /** column -> the field the requester readers return it as. Reasons are in admin-static §5f. */
    const REQUESTER_VISIBLE = {
      reference: "reference", state: "state", category: "category", machine_name: "machineName",
      created_at: "createdAt", updated_at: "updatedAt",
      resolution_code: "resolutionCode", resolution_notes: "resolutionNotes", resolved_at: "resolvedAt",
      closed_at: "closedAt", closed_by: "closedBy",
    };
    /** Columns the requester never receives. One line, one reason. */
    const REQUESTER_HIDDEN = {
      id: "the join key; the requester holds `reference` (D213)",
      user_id: "the reporter's row id — the requester IS the reporter; echoing their profile back is P4's decision, not this shape's",
      session_id: "D75's link to a session the endpoint does not have yet",
      device_id: "the enrollment that filed it — the SCOPE KEY the credential supplies (D284), not a fact for the requester",
      description: "the requester's own words — theirs already; the P3a handover's draft omits it, and P4's view decides whether to show what they typed",
      summary: "THE CASE NOTE — written for the assignee, never shown to the user (003-tickets.sql; D214: read aloud to one on 2026-09-04)",
      what_was_checked: "the model's checks, written for the assignee (D214)",
      suggested_owner: "routing is internal",
      internal_resolution_note: "INTERNAL by name (D269): the desk's account, the KB draft loop's input",
      awaiting_agent_since: "D276's indicator — the desk's queue age, not the requester's",
    };
    const cols = (await getPool().query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'tickets' ORDER BY ordinal_position", [schema],
    )).rows.map((r) => r.column_name);
    const unclassified = cols.filter((c) => !(c in REQUESTER_VISIBLE) && !(c in REQUESTER_HIDDEN));
    check(`tickets: every one of its ${cols.length} columns is on the requester-visible list or the hidden list — a column on neither FAILS (the allow-list fails closed)`,
      cols.length >= 15 && unclassified.length === 0, `unclassified: ${unclassified.join(", ")}`);
    const gone = [...Object.keys(REQUESTER_VISIBLE), ...Object.keys(REQUESTER_HIDDEN)].filter((c) => !cols.includes(c));
    check("…both lists name only columns that exist", gone.length === 0, `gone: ${gone.join(", ")}`);
    const onBoth = Object.keys(REQUESTER_VISIBLE).filter((c) => c in REQUESTER_HIDDEN);
    check("…and no column is on both", onBoth.length === 0, onBoth.join(","));

    // Imported here rather than at the top so a missing export fails THESE checks and not the file.
    const q = await import("../src/tickets/query.js");
    const exists = typeof q.getTicketForRequester === "function" && typeof q.listTicketsForRequester === "function" && typeof q.listEntriesForRequester === "function";
    check("getTicketForRequester(), listTicketsForRequester() and listEntriesForRequester() exist in src/tickets/query.js", exists);
    if (exists) {
      // The sentinel words appear nowhere else in this suite, so a wire-level search is decisive.
      const SUMMARY = "CASE-NOTE-SENTINEL the user reports a dock that flickers";
      const CHECKED = "CHECKED-SENTINEL the dock was power-cycled";
      const INOTE = "INTERNAL-NOTE-SENTINEL swapped it from the spares cupboard";
      const WNOTE = "WORK-NOTE-SENTINEL rang the user, no answer";
      const RES = "Your dock has been replaced. Please try it again and tell us if it still flickers.";
      const desk = { kind: "console_user", adminUserId: made.owner.id, label: made.owner.email };
      // Two enrollments (D284): the one that files, and a stranger.
      const MINE = randomUUID(), THEIRS = randomUUID();
      const { reference: rref } = await createTicket(schema, {
        description: "my dock keeps flickering", summary: SUMMARY, whatWasChecked: CHECKED, machineName: "LAPTOP-P3A",
        category: "hardware", suggestedOwner: "desktop_support",
        reporter: { osUsername: "p3a.requester", firstName: "Pat", lastName: "Requester", location: "Floor 3", contactId: "pat@example.test" },
      }, { deviceId: MINE });
      await setTicketState(schema, rref, "open", { from: "new", note: INOTE, author: desk });
      await addEntry(schema, rref, { kind: "work_note", body: WNOTE, author: desk });
      await resolveTicket(schema, rref, { code: "fixed", notes: RES, from: "open", author: desk });
      const full = await getTicket(schema, rref);
      check("(fixture) the console's getTicket() carries summary, whatWasChecked and the internal note, ALL POPULATED, the resolution — and the enrollment that filed it",
        Boolean(full) && full.summary === SUMMARY && full.whatWasChecked === CHECKED && full.internalResolutionNote === INOTE && full.resolutionCode === "fixed" && full.suggestedOwner === "desktop_support" && full.deviceId === MINE);

      const mine = await q.getTicketForRequester(schema, rref, { deviceId: MINE });
      check("the enrollment's own ticket comes back: reference, state, the code, the notes written for them, their machine",
        Boolean(mine) && mine.reference === rref && mine.state === "resolved" && mine.resolutionCode === "fixed" && mine.resolutionNotes === RES && mine.machineName === "LAPTOP-P3A" && mine.resolvedAt instanceof Date, JSON.stringify(mine));
      check("its keys are EXACTLY the requester-visible list's fields — nothing more, nothing less",
        Boolean(mine) && Object.keys(mine).sort().join(",") === Object.values(REQUESTER_VISIBLE).sort().join(","), mine ? Object.keys(mine).join(",") : "null");
      const wire = JSON.stringify(mine);
      check("ON THE WIRE (JSON): not the case note, not the checks, not the internal note — for a ticket that HAS all three", Boolean(mine) && !wire.includes("SENTINEL"), wire);
      check("…nor the reporter's profile echoed back, nor the routing, nor the session, the uuid or the device id", Boolean(mine) && !/Pat|Requester|Floor 3|pat@example|desktop_support|p3a\.requester/.test(wire) && !wire.includes(MINE) && !("suggestedOwner" in mine) && !("sessionId" in mine) && !("id" in mine) && !("deviceId" in mine), wire);
      check("ANOTHER enrollment's read of the same reference returns null — the same null as no such ticket (this layer is not an existence oracle)", (await q.getTicketForRequester(schema, rref, { deviceId: THEIRS })) === null);
      check("an unknown reference returns null", (await q.getTicketForRequester(schema, "MD-0", { deviceId: MINE })) === null);
      check("no identity THROWS — there is no default requester, as there is no default visibility", await q.getTicketForRequester(schema, rref, {}).then(() => false, (e) => /deviceId/.test(e.message)));
      check("…and so does an identity that is not a uuid (the credential lookup hands us one; anything else is a programming error, not a miss)", await q.getTicketForRequester(schema, rref, { deviceId: "p3a.requester" }).then(() => false, (e) => /deviceId/.test(e.message)));

      // The list read (GET /v1/tickets's body): this enrollment's tickets, newest first, and nobody else's.
      const { reference: rref2 } = await createTicket(schema, {
        description: "second one from the same enrollment", summary: SUMMARY, category: "other", suggestedOwner: null,
        reporter: { osUsername: "p3a.requester" },
      }, { deviceId: MINE });
      const list = await q.listTicketsForRequester(schema, { deviceId: MINE });
      check("listTicketsForRequester(): both tickets this enrollment filed, newest first, each in the allow-list shape and none carrying a sentinel",
        list.length === 2 && list[0].reference === rref2 && list[1].reference === rref && list.every((t) => Object.keys(t).sort().join(",") === Object.values(REQUESTER_VISIBLE).sort().join(",")) && !JSON.stringify(list).includes("SENTINEL"), JSON.stringify(list.map((t) => t.reference)));
      check("…another enrollment lists [] — and so would any enrollment for the tickets §5 filed with NO credential (device_id NULL is nobody's)", (await q.listTicketsForRequester(schema, { deviceId: THEIRS })).length === 0 && (await listTickets(schema)).some((t) => t.reference !== rref && t.reference !== rref2));
      check("…and it takes the identity the same way: no identity throws", await q.listTicketsForRequester(schema, {}).then(() => false, (e) => /deviceId/.test(e.message)));

      const all = await listEntries(schema, rref, { visibility: "all" });
      check("(fixture) the ticket has an INTERNAL entry — the work note — among four", all.length === 4 && all.some((e) => e.visibility === "internal" && e.body === WNOTE));
      const theirs = await q.listEntriesForRequester(schema, rref, { deviceId: MINE });
      check("listEntriesForRequester() CANNOT return the internal row: three public entries (two state changes, the resolution), no work note, no sentinel on the wire",
        theirs.length === 3 && theirs.every((e) => e.visibility === "public") && !theirs.some((e) => e.kind === "work_note") && !JSON.stringify(theirs).includes("SENTINEL"), JSON.stringify(theirs));
      check("…the resolution entry carries the notes written for them", theirs.some((e) => e.kind === "resolution" && e.body === RES));
      check("…another enrollment gets [] for the same reference — public rows included; 'public' means the ticket's requester, not every requester", (await q.listEntriesForRequester(schema, rref, { deviceId: THEIRS })).length === 0);
      check("…and it has no visibility argument: passing one changes nothing", (await q.listEntriesForRequester(schema, rref, { deviceId: MINE, visibility: "all" })).length === 3);
      check("…and no identity throws here too", await q.listEntriesForRequester(schema, rref, {}).then(() => false, (e) => /deviceId/.test(e.message)));

      // The console says which enrollment filed a ticket, and that the older ones had none.
      const detailMine = await owner.go(`/admin/tickets/${rref}`);
      check("the detail page says the ticket was filed WITH an enrollment credential, names the device, and keeps the profile fields self-asserted", /filed with an enrollment credential/.test(detailMine.text) && detailMine.text.includes(MINE) && /self_asserted/.test(detailMine.text));
      const older = (await listTickets(schema)).find((t) => t.reference !== rref && t.reference !== rref2);
      const detailOlder = await owner.go(`/admin/tickets/${older.reference}`);
      check("…and for a ticket filed with NO credential it says so — not authenticated, no enrollment", /not authenticated/.test(detailOlder.text) && /no enrollment credential/.test(detailOlder.text));
      const cliMine = spawnSync(process.execPath, [join(SERVER, "bin/tickets.mjs"), "show", rref], { encoding: "utf8", env: { ...process.env, MATIC_TICKET_TENANT: schema } });
      check("bin/tickets.mjs show prints the same fact through the same getTicket()", cliMine.status === 0 && /filed with an enrollment credential/.test(cliMine.stdout) && cliMine.stdout.includes(MINE), cliMine.stdout.slice(0, 400));
    } else {
      check("the live checks ran against the requester shape", false, "the requester readers do not exist");
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

  /** D282: the auto-approved device's credential, kept across blocks so B3-3 can prove revocation refuses it. */
  const p3b = { credential: null, deviceId: null };

  console.log("\n=== B3-2. POST /v1/enroll: auto-approve on (the default), then off — and the credential, once (D282) ===");
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
    check("D282: the response that made it active carries the credential ONCE — mdc_ + 43 url-safe chars — a handling note, and what it proves in words",
      typeof e1.credential === "string" && /^mdc_[A-Za-z0-9_-]{43}$/.test(e1.credential) && /shown ONCE/.test(e1.credentialNote) && /Authorization: Bearer/.test(e1.credentialNote) && /per-OS-user enrollment/.test(e1.identity) && /Not a machine identity/.test(e1.identity), JSON.stringify(e1).slice(0, 400));
    p3b.credential = e1.credential; p3b.deviceId = e1.deviceId;
    check("the hub stored the HASH, never the credential", (await getPool().query("SELECT credential_hash, credential_issued_at FROM control.devices WHERE id = $1", [e1.deviceId])).rows[0].credential_hash?.length === 32 && !JSON.stringify((await getPool().query("SELECT * FROM control.devices WHERE id = $1", [e1.deviceId])).rows[0]).includes(e1.credential.slice(4)));
    const again = await (await fetch(`${base}/v1/enroll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant: slug, deviceKeyId: "b3test-device-auto", secret }) })).json();
    check("re-submitting the SAME device -> 200, 'already active', not a new row — and NO second credential, with the reason", again.status === "active" && again.deviceId === e1.deviceId && again.credential === null && /already holds a credential/.test(again.why) && /revoke the device/.test(again.why), JSON.stringify(again));

    // authenticateDeviceCredential(): what every authenticated route calls, and last_seen_at's writer.
    const { rows: [seen0] } = await getPool().query("SELECT last_seen_at FROM control.devices WHERE id = $1", [e1.deviceId]);
    await new Promise((r) => setTimeout(r, 25));
    const authed = await authenticateDeviceCredential(e1.credential);
    check("authenticateDeviceCredential(): the credential resolves to THIS device, THIS tenant's schema and slug, and the device key", authed.ok === true && authed.device.id === e1.deviceId && authed.device.tenantSchema === schema && authed.device.tenantSlug === slug && authed.device.deviceKeyId === "b3test-device-auto", JSON.stringify(authed));
    const { rows: [seen1] } = await getPool().query("SELECT last_seen_at FROM control.devices WHERE id = $1", [e1.deviceId]);
    check("…and it MOVED last_seen_at — the column's first writer that is not enrollment (addendum G2)", seen1.last_seen_at > seen0.last_seen_at, `${seen0.last_seen_at?.toISOString()} -> ${seen1.last_seen_at?.toISOString()}`);
    check("a credential nobody issued -> refused: unknown, pointing at POST /v1/enroll", (await authenticateDeviceCredential("mdc_" + "A".repeat(43))).why === "unknown" && /POST \/v1\/enroll/.test((await authenticateDeviceCredential("mdc_" + "A".repeat(43))).message));
    check("a string that is not a credential -> refused: malformed, saying they begin mdc_", (await authenticateDeviceCredential("not-a-credential")).why === "malformed" && /begin mdc_/.test((await authenticateDeviceCredential("not-a-credential")).message));
    check("…and so does nothing at all", (await authenticateDeviceCredential(undefined)).why === "malformed");

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
    check("D282: a QUEUED device gets no credential — it has not been approved", e2.credential === undefined || e2.credential === null);

    const queue = await owner.go("/admin/agents");
    check("the pending device is on the Agents page queue", /b3test-device-pending/.test(queue.text));
    check("the active device from before is listed too, with a checkbox to revoke it", new RegExp(`name="device_${e1.deviceId}"`).test(queue.text));

    const approveToken = csrfOf(queue.text);
    const approved = await owner.go(`/admin/agents/${e2.requestId}/approve`, { method: "POST", form: { _csrf: approveToken } });
    check("Approve -> 200, and the device is now active", approved.status === 200 && /Approved b3test-device-pending/.test(approved.text));
    check("device.enroll.approve is audited with the actor and the device", (await auditRows()).some((r) => r.action === "device.enroll.approve" && r.email === made.owner.email && r.subject === "b3test-device-pending"));
    const askAgain = await (await fetch(`${base}/v1/enroll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant: slug, deviceKeyId: "b3test-device-pending", secret }) })).json();
    check("D282: a device approved BY HAND gets its credential on its next submission — minted on the approval its endpoint did not see", askAgain.status === "active" && /^mdc_/.test(askAgain.credential ?? ""), JSON.stringify(askAgain));
    check("…and a third submission yields none", (await (await fetch(`${base}/v1/enroll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant: slug, deviceKeyId: "b3test-device-pending", secret }) })).json()).credential === null);

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
    const afterRevokeAuth = await authenticateDeviceCredential(p3b.credential);
    check("D282: a REVOKED device's credential is refused on its NEXT request — revocation is a control now, not a status change", Boolean(p3b.credential) && afterRevokeAuth.ok === false && afterRevokeAuth.why === "revoked" && /REVOKED by an administrator/.test(afterRevokeAuth.message), JSON.stringify(afterRevokeAuth));
    // D273, on the real page with real rows: the column heading and the two caveats.
    const pageD273 = await owner.go("/admin/agents");
    check("Agents (D273): the device table is headed 'Last enrollment activity', never 'Last seen'", /<th>Last enrollment activity<\/th>/.test(pageD273.text) && !/Last seen/.test(pageD273.text));
    check("Agents (D273): the not-a-heartbeat note is under the table", /Not a heartbeat\. Nothing updates this when a device talks to the hub/.test(pageD273.text));
    check("Agents (D273): the revoke caveat says revoking blocks nothing (D61)", /Revoking removes the row&#39;s standing\. It does not block anything/.test(pageD273.text));

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

  console.log("\n=== B3-5. the credential on the wire: GET /v1/tickets is this enrollment's tickets, the tenant comes from the credential, revocation bites (D282–D284) ===");
  {
    resetEnrollmentThrottle(); resetReadThrottle(); resetCredentialThrottle();
    // B3-2 turned auto-approve OFF and left it there; this block wants the endpoint's enrollment to
    // activate on submission, as a fresh tenant's would (D80's default).
    const before = await owner.go("/admin/agents");
    if (/Auto-approve is <strong>off<\/strong>/.test(before.text)) {
      const on = await owner.go("/admin/agents/auto-approve", { method: "POST", form: { _csrf: csrfOf(before.text), enabled: "1" } });
      check("(fixture) auto-approve turned back on", on.status === 200 && /Auto-approve is now ON/.test(on.text), String(on.status));
    }
    const page = await owner.go("/admin/agents");
    const fresh = await owner.go("/admin/agents/secrets/new", { method: "POST", form: { _csrf: csrfOf(page.text), ttlDays: "1" } });
    const secret = fresh.text.match(/<div class="mono" style="margin-top:6px;font-size:15px;word-break:break-all">([^<]+)<\/div>/)?.[1];
    const enrolled = await (await fetch(`${base}/v1/enroll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant: slug, deviceKeyId: "p3b-endpoint", secret }) })).json();
    check("(fixture) the endpoint enrolls and gets its credential", enrolled.status === "active" && /^mdc_/.test(enrolled.credential ?? ""), JSON.stringify(enrolled).slice(0, 200));
    const cred = enrolled.credential, dev = enrolled.deviceId;
    const asDevice = (path, init = {}) => fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${cred}`, ...(init.headers ?? {}) } });
    const json = (p) => fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ description: "anon", summary: "anon", category: "other", suggestedOwner: null, reporter: { osUsername: "someone" } }) });

    // Without a credential: nothing, and why.
    const anon = await fetch(`${base}/v1/tickets`);
    const anonBody = await anon.json();
    check("GET /v1/tickets with NO credential -> 401 with the exact sentence: names the header, names POST /v1/enroll, returns no list, x-matic-hub-auth none", anon.status === 401 && anonBody.error === NEEDS_CREDENTIAL && !("tickets" in anonBody) && anon.headers.get("x-matic-hub-auth") === "none", JSON.stringify(anonBody));
    const wrong = await fetch(`${base}/v1/tickets`, { headers: { authorization: `Bearer mdc_${"B".repeat(43)}` } });
    check("…with a well-formed credential nobody issued -> 401 'not one this hub issued', nothing returned", wrong.status === 401 && /not one this hub issued/.test((await wrong.json()).error));
    const malformed = await fetch(`${base}/v1/tickets`, { headers: { authorization: "Bearer hello" } });
    check("…with a malformed one -> 401 saying credentials begin mdc_", malformed.status === 401 && /begin mdc_/.test((await malformed.json()).error));

    // With it: empty, honestly.
    const empty = await asDevice("/v1/tickets");
    const emptyBody = await empty.json();
    check("with the credential -> 200, an empty list, and the response is stamped x-matic-hub-auth: device-credential", empty.status === 200 && emptyBody.ok === true && Array.isArray(emptyBody.tickets) && emptyBody.count === 0 && empty.headers.get("x-matic-hub-auth") === "device-credential", JSON.stringify(emptyBody).slice(0, 300));
    check("…and carries the honesty field: what the credential proves (a per-OS-user enrollment) and does not (who is at the keyboard; the profile is self-asserted)", emptyBody.identity?.kind === "enrollment-credential" && emptyBody.identity.deviceId === dev && emptyBody.identity.tenant === slug && /per-OS-user enrollment/.test(emptyBody.identity.proves) && /self-asserted/.test(emptyBody.identity.doesNotProve), JSON.stringify(emptyBody.identity));

    // File a ticket WITH the credential: device_id lands and the tenant is the credential's.
    const filed = await asDevice("/v1/ticket", { method: "POST", body: JSON.stringify({ description: "p3b: my badge reader is dead", summary: "P3B-SENTINEL badge reader unresponsive", category: "hardware", suggestedOwner: "desktop_support", machineName: "LAPTOP-P3B", reporter: { osUsername: "p3b.user", firstName: "Sam", lastName: "P3b", location: "Floor 9", contactId: "sam@example.test" } }) });
    const filedBody = await filed.json();
    check("POST /v1/ticket with the credential -> 201 in the credential's tenant, marked authenticated, x-matic-hub-auth device-credential", filed.status === 201 && filedBody.ok === true && filedBody.tenant === schema && filedBody.authenticated === true && filed.headers.get("x-matic-hub-auth") === "device-credential", JSON.stringify(filedBody).slice(0, 300));
    check("…and the row carries the enrollment: getTicket().deviceId is the device from the credential", (await getTicket(schema, filedBody.reference)).deviceId === dev);
    const anonFiled = await json("/v1/ticket");
    const anonFiledBody = await anonFiled.json();
    check("POST /v1/ticket with NO credential on this LOOPBACK listener still files — the credential is optional here — unauthenticated, device_id NULL", anonFiled.status === 201 && anonFiledBody.authenticated === false && (await getTicket(schema, anonFiledBody.reference)).deviceId === null, JSON.stringify(anonFiledBody).slice(0, 200));

    // Read back: own ticket only, allow-list shape, public entries only.
    const desk = { kind: "console_user", adminUserId: made.owner.id, label: made.owner.email };
    await setTicketState(schema, filedBody.reference, "open", { from: "new", note: "P3B-INTERNAL-SENTINEL", author: desk });
    await addEntry(schema, filedBody.reference, { kind: "work_note", body: "P3B-WORKNOTE-SENTINEL", author: desk });
    const list = await (await asDevice("/v1/tickets")).json();
    check("GET /v1/tickets -> exactly the ticket this enrollment filed, in the allow-list shape, no sentinel on the wire", list.count === 1 && list.tickets[0].reference === filedBody.reference && Object.keys(list.tickets[0]).sort().join(",") === "category,closedAt,closedBy,createdAt,machineName,reference,resolutionCode,resolutionNotes,resolvedAt,state,updatedAt" && !JSON.stringify(list).includes("SENTINEL"), JSON.stringify(list).slice(0, 400));
    const one = await asDevice(`/v1/tickets/${filedBody.reference}`);
    const oneBody = await one.json();
    check("GET /v1/tickets/<ref> -> the ticket and its PUBLIC entries only: the state change, not the work note, no sentinel", one.status === 200 && oneBody.ticket?.reference === filedBody.reference && oneBody.entries?.length === 1 && oneBody.entries[0].kind === "state_change" && !JSON.stringify(oneBody).includes("SENTINEL"), JSON.stringify(oneBody).slice(0, 400));
    const notMine = await asDevice(`/v1/tickets/${anonFiledBody.reference}`);
    check("GET /v1/tickets/<a ticket filed without a credential> -> 404 'readable by this enrollment', the same as a reference that does not exist", notMine.status === 404 && /readable by this enrollment/.test((await notMine.json()).error) && (await asDevice("/v1/tickets/MD-999999")).status === 404);
    check("…and a path that is not a reference -> 404 too, not a 500", (await asDevice("/v1/tickets/..%2Fadmin")).status === 404);
    check("POST /v1/tickets -> 405 GET only", (await asDevice("/v1/tickets", { method: "POST", body: "{}" })).status === 405);

    // The tenant comes from the credential, not the environment: a hub with NO ticket tenant configured.
    const noTenant = createHubServer({ provider: stubProvider, log: () => {}, kb: false, ticketTenant: null, embedder: stubEmbedder, admin: false });
    await new Promise((r) => noTenant.listen(0, "127.0.0.1", r));
    const ntBase = `http://127.0.0.1:${noTenant.address().port}`;
    try {
      const nt503 = await fetch(`${ntBase}/v1/ticket`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ description: "x", summary: "x", category: "other", suggestedOwner: null, reporter: { osUsername: "u" } }) });
      check("a hub with NO MATIC_TICKET_TENANT: an unauthenticated POST /v1/ticket -> 503 as before, and the sentence now names the credential as the other way in", nt503.status === 503 && /credential/.test((await nt503.json()).error));
      const ntOk = await fetch(`${ntBase}/v1/ticket`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${cred}` }, body: JSON.stringify({ description: "p3b: filed on a hub that knows no tenant", summary: "tenant from the credential", category: "other", suggestedOwner: null, reporter: { osUsername: "p3b.user" } }) });
      const ntBody = await ntOk.json();
      check("…and the SAME POST with the credential -> 201 into the credential's tenant: the tenant came from the device row, not from the environment (D284)", ntOk.status === 201 && ntBody.tenant === schema && (await getTicket(schema, ntBody.reference))?.deviceId === dev, JSON.stringify(ntBody).slice(0, 200));
      const ntList = await (await fetch(`${ntBase}/v1/tickets`, { headers: { authorization: `Bearer ${cred}` } })).json();
      check("…and GET /v1/tickets on that hub lists both of this enrollment's tickets — scoped by the credential's tenant and device, on a hub configured with neither", ntList.count === 2, JSON.stringify(ntList).slice(0, 200));
      const ntSession = await fetch(`${ntBase}/v1/session`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${cred}` }, body: JSON.stringify({ event: "begin", sessionId: randomUUID() }) });
      check("POST /v1/session with the credential on that hub -> 201: sessions take their tenant from the credential too", ntSession.status === 201, String(ntSession.status));
      const ntSessionAnon = await fetch(`${ntBase}/v1/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "begin", sessionId: randomUUID() }) });
      check("…and without one -> 503, as before", ntSessionAnon.status === 503);
    } finally { await new Promise((r) => noTenant.close(r)); }

    // last_seen_at moves on an authenticated call.
    const { rows: [s0] } = await getPool().query("SELECT last_seen_at FROM control.devices WHERE id = $1", [dev]);
    await new Promise((r) => setTimeout(r, 25));
    await asDevice("/v1/health");
    const { rows: [s1] } = await getPool().query("SELECT last_seen_at FROM control.devices WHERE id = $1", [dev]);
    check("an authenticated GET /v1/health moved last_seen_at (G2): the column is written by the request now, not by enrollment alone", s1.last_seen_at > s0.last_seen_at, `${s0.last_seen_at?.toISOString()} -> ${s1.last_seen_at?.toISOString()}`);

    // The poll floor's server half.
    resetReadThrottle();
    let last = 200;
    for (let i = 0; i < READS_PER_MINUTE; i++) last = (await asDevice("/v1/tickets")).status;
    const over = await asDevice("/v1/tickets");
    const overBody = await over.json();
    check(`read ${READS_PER_MINUTE} in a minute is still 200; read ${READS_PER_MINUTE + 1} is 429 with retryAfterMs and the floor in words`, last === 200 && over.status === 429 && typeof overBody.retryAfterMs === "number" && overBody.retryAfterMs > 0 && /Poll no faster/.test(overBody.error), `${last} then ${over.status}: ${JSON.stringify(overBody)}`);
    resetReadThrottle();

    // Revocation bites on the next request.
    const agents = await owner.go("/admin/agents");
    const revoke = await owner.go("/admin/agents/revoke", { method: "POST", form: { _csrf: csrfOf(agents.text), [`device_${dev}`]: "1" } });
    check("(fixture) the console revokes the endpoint", revoke.status === 200 && /Revoked 1 device/.test(revoke.text));
    const afterRevoke = await asDevice("/v1/tickets");
    check("the revoked endpoint's NEXT request -> 401 REVOKED, x-matic-hub-auth none, nothing returned", afterRevoke.status === 401 && /REVOKED by an administrator/.test((await afterRevoke.json()).error) && afterRevoke.headers.get("x-matic-hub-auth") === "none");
    check("…and its POST /v1/ticket is refused too — a presented credential is checked everywhere, even on a loopback listener where none is required", (await asDevice("/v1/ticket", { method: "POST", body: JSON.stringify({ description: "x", summary: "x", category: "other", suggestedOwner: null, reporter: { osUsername: "u" } }) })).status === 401);
    resetCredentialThrottle();
    let st = 401;
    for (let i = 0; i < 20; i++) st = (await asDevice("/v1/tickets")).status;
    const throttled = await asDevice("/v1/tickets");
    check("twenty refused credentials from one peer in a minute -> the 21st is 429 with retryAfterMs (a speed bump against a misconfigured endpoint's tight loop)", st === 401 && throttled.status === 429 && typeof (await throttled.json()).retryAfterMs === "number");
    resetCredentialThrottle();
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
    // Whatever state §5/§5d left it in (P2 resolves and closes tickets there), it must not move.
    const stateBefore = (await getTicket(schema, ref)).state;
    const post = await auditor.go(`/admin/tickets/${ref}/state`, { method: "POST", form: { next: "open", from: stateBefore, _csrf: csrfOf(detail.text) } });
    check("POST a state change as the auditor -> 403 (tickets.write), even with a valid CSRF token", post.status === 403);
    check("the ticket did not change", (await getTicket(schema, ref)).state === stateBefore);
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
    check("the run produced login.failed, login.ok, ticket.view, csrf.refused, ticket.state.refused, ticket.state, ticket.worknote, ticket.resolve, ticket.resolve.refused, access.denied, session.logout",
      ["login.failed", "login.ok", "ticket.view", "csrf.refused", "ticket.state.refused", "ticket.state", "ticket.worknote", "ticket.resolve", "ticket.resolve.refused", "access.denied", "session.logout"].every((a) => actions.has(a)), [...actions].join(","));
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
