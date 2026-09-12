// @ts-check
/**
 * The admin console's front door: `/admin/*` inside the hub process. B2 (D221–D224).
 *
 * ===============================================================================================
 * WHAT THIS IS
 * ===============================================================================================
 *
 * Server-rendered HTML, no build step, no framework, no new dependency (D221). One handler,
 * mounted by src/index.js AHEAD of the API routes for any URL under /admin. It owns:
 *
 *   - the session: cookie -> control.admin_sessions -> user -> permissions (src/admin/session.js,
 *     src/admin/users.js), loaded once per request;
 *   - the check: every route names the permission that opens it, and a session without it gets a
 *     403 page AND an audit row (src/admin/audit.js). Roles carry permissions, users carry roles,
 *     and this file never asks "who is this" — only "what may they do";
 *   - CSRF on every POST, checked before the handler runs;
 *   - tenant scope: the session's tenant_id resolves to ONE tenant row, and every tenant-data
 *     read passes that tenant's schema to src/tickets/query.js, which goes through withTenant().
 *     A vendor login (tenant_id NULL) is refused at the login form, by name: D153 makes vendor
 *     access a time-boxed grant the customer enables, and grant evaluation is not built.
 *
 * ===============================================================================================
 * WHAT IT IS NOT, AND HOW IT STAYS THAT WAY
 * ===============================================================================================
 *
 *   - Not an API. Nothing here returns JSON, GET / does not list it among the routes, and the
 *     unknown-route 404 does not name it (exit criterion 7). The hub's API stays unauthenticated
 *     and loud about it; adding this console did not add authentication to /v1/* (CLAUDE.md:
 *     "do not add authentication to the B0 hub piecemeal").
 *   - Not exposed. src/index.js refuses non-loopback peers before this handler runs, so the
 *     console is loopback-only by the same mechanism as the API, and the login page says so
 *     (exit criterion 8). Auth here is real; it has not been REVIEWED, and the binding is what
 *     stands in for the review until one happens.
 *   - Not a transcript reader. There is no route under /admin that reaches session content,
 *     because there is no session content (B1-CONTROL-PLANE.md §11) — and src/admin/tiers.js is
 *     what the first such route will have to call. test/admin-db.test.mjs tries /admin/sessions/*
 *     and asserts a 404 (exit criterion 4).
 *
 * The response header: authenticated console pages carry `x-matic-hub-auth: admin-session`, the
 * login page carries `none`. The header's meaning is unchanged — did the hub authenticate this
 * request — and here, for once, the answer can be yes.
 */
import { URL } from "node:url";
import { verifyPassword, verifyTotp } from "./auth.js";
import { BYPASS_ENV, BYPASS_EVENT_CLASS, bypassBannerLine, bypassStatus } from "./dev-bypass.js";
import { audit } from "./audit.js";
import { html, page } from "./html.js";
import { DESTINATIONS } from "./permissions.js";
import {
  COOKIE_NAME, clearedCookie, cookieSecure, createSession, csrfToken, csrfValid,
  loadSession, parseCookies, revokeSession, sessionCookie,
} from "./session.js";
import { findAdminForLogin, getAdminUser, permissionsFor, recordLogin, rolesFor } from "./users.js";
import { gapCount, tenantById } from "./queries.js";
import { countTicketsByState } from "../tickets/query.js";
import { pendingCount } from "../devices/enrollment.js";
import { loginPage } from "./pages/login.js";
import { reviewRoutes } from "./pages/review.js";
import { ticketRoutes } from "./pages/tickets.js";
import { knowledgeRoutes } from "./pages/knowledge.js";
import { agentsRoutes } from "./pages/agents.js";
import { metricsRoutes } from "./pages/metrics.js";
import { settingsRoutes } from "./pages/settings.js";
import { serveAsset } from "./assets.js";

export const ADMIN_PREFIX = "/admin";

/**
 * The form-body ceiling. Raised from 64 kB to 1 MB on 2026-09-09 for ONE reason: the Knowledge
 * ingest form is a textarea holding a bundle's JSON, and the generic bundle is 12.7 kB of JSON
 * that becomes ~35 kB once a browser urlencodes it. 64 kB would have fitted that one bundle and
 * refused the second real one, which is the worst place for a limit to be.
 *
 * It is still a limit, and it is still the only backstop against an unbounded read in this
 * process — `readForm()` destroys the request the moment it is passed. The ingest page states the
 * number, so a refusal is a known boundary rather than a mystery.
 */
export const MAX_FORM_BYTES = 1024 * 1024;

/**
 * Failed-login throttle, per email, in this process. Five failures lock the email for a minute.
 * It is a speed bump against a script, not a control: it resets on restart and does not span
 * processes, and the audit row per failure (`login.failed`) is the durable record.
 */
const failures = new Map();
const LOCK_AFTER = 5, LOCK_MS = 60_000;
function locked(email) {
  const f = failures.get(email);
  return Boolean(f && f.count >= LOCK_AFTER && Date.now() < f.until);
}
function noteFailure(email) {
  const f = failures.get(email) ?? { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= LOCK_AFTER) f.until = Date.now() + LOCK_MS;
  failures.set(email, f);
}
function clearFailures(email) { failures.delete(email); }
/** For tests. */
export function resetLoginThrottle() { failures.clear(); }

/** Parse an application/x-www-form-urlencoded body. */
function readForm(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_FORM_BYTES) { resolve({ error: `form too large — over ${MAX_FORM_BYTES} bytes. A bundle that big belongs on disk: node bin/kb.mjs ingest <bundle.json> from server/.` }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      const params = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
      resolve({ value: Object.fromEntries(params) });
    });
    req.on("error", (err) => resolve({ error: err.message }));
  });
}

/**
 * @typedef {object} Ctx
 * @property {import("node:http").IncomingMessage} req
 * @property {import("node:http").ServerResponse} res
 * @property {URL} url
 * @property {string} method
 * @property {import("./session.js").AdminSession|null} session
 * @property {import("./users.js").AdminUser|null} user
 * @property {Set<string>} permissions
 * @property {string[]} roles
 * @property {{ id: string, slug: string, schemaName: string, displayName: string, status: string, createdAt: Date }|null} tenant
 * @property {string|null} csrf
 * @property {Record<string, string>} form
 * @property {Record<string, string>|null} params
 * @property {(s: string) => void} log
 * @property {(status: number, body: import("./html.js").Safe, opts?: { title?: string, current?: string, notice?: string|null }) => Promise<void>} render
 * @property {(path: string) => void} redirect
 * @property {(action: string, extra?: { subject?: string|null, detail?: Record<string, unknown>|null }) => Promise<number>} audit
 * @property {{ name: string, model: string, embedQuery: (t: string) => Promise<number[]> }|null} embedder
 * @property {number} maxFormBytes
 * @property {(status: number, body: import("./html.js").Safe, opts?: { title?: string, current?: string, notice?: string|null }) => Promise<void>} renderPublic
 */

const ROUTES = [
  ...reviewRoutes,
  ...ticketRoutes,
  ...knowledgeRoutes,
  ...agentsRoutes,
  ...metricsRoutes,
  ...settingsRoutes,
];

/** Every destination the session may open, with its live badge count. */
async function navFor(ctx) {
  const items = [];
  for (const d of DESTINATIONS) {
    if (!ctx.permissions.has(d.permission)) continue;
    let count = null;
    try {
      if (d.badge === "review") count = await gapCount();
      else if (d.badge === "tickets" && ctx.tenant) count = (await countTicketsByState(ctx.tenant.schemaName)).new;
      else if (d.badge === "agents" && ctx.tenant) count = await pendingCount({ tenantId: ctx.tenant.id });
    } catch { count = null; } // a badge is not worth a 500
    items.push({ path: d.path, label: d.label, count });
  }
  return items;
}

/**
 * Build the handler. `log` is the hub's logger. Returns `(req, res) => Promise<boolean>`: true
 * when the URL was under /admin and has been answered, false otherwise so the hub carries on.
 *
 * `embedder` is THE SAME PROVIDER INSTANCE `/v1/ask` uses (src/index.js passes one object to
 * both). That is the whole point of the Knowledge search: a console that searched with a different
 * embedder from the endpoint's would be a confident answer about a pipeline nobody runs. It may be
 * null — a hub started with `MATIC_EMBED_PROVIDER=none`, or in a test — and both the search page
 * and the ingest form say so in words rather than showing a shorter list.
 *
 * `retrievalHealth` is THE SAME READER `/v1/health` answers from (src/kb/health.js, D236): the
 * console draws a banner on every authenticated page while it says retrieval is degraded, and it
 * has to be the same function so the banner and the health route cannot describe two different
 * hubs. Optional, like the embedder: a test or a hub without one gets no banner and no error.
 *
 * @param {{ log?: (s: string) => void, embedder?: any|null, retrievalHealth?: (() => Promise<{ degraded: boolean, mode: string, why: string|null }>)|null }} [deps]
 */
export function adminHandler({ log = () => {}, embedder = null, retrievalHealth = null, getBoundAddress = () => null } = {}) {
  /**
   * The bypass verdict, read FRESH on every use (D267). `getBoundAddress` is a getter rather than a
   * value because the address does not exist until `listen` resolves, and this handler is built
   * before that. Read per request, so nothing caches a permissive answer from start-up.
   */
  const bypassNow = () => bypassStatus({ boundAddress: getBoundAddress() });

  /**
   * The banner text, or null. Best-effort: a health reader that throws must not take the console
   * down with it, so the failure becomes a banner of its own rather than a 500.
   */
  async function degradedBanner() {
    if (!retrievalHealth) return null;
    let h;
    try { h = await retrievalHealth(); }
    catch (err) { return `Retrieval health could not be read (${err.message}). Treat declines made now as unverified, not as gaps.`; }
    if (!h?.degraded) return null;
    const mode = h.mode;
    const what = mode === "lexicalOnly" ? "the semantic leg is not running"
      : mode === "emptyCorpus" ? "the corpus is empty"
        : "the knowledge base cannot be read";
    return `Retrieval is degraded (${mode}): ${what}. A question declined now is NOT evidence of a gap, and the review queue's badge does not count it. ${h.why ?? ""}`.trim();
  }

  return async function handleAdmin(req, res) {
    const url = new URL(req.url ?? "/", "http://admin.local");
    if (url.pathname !== ADMIN_PREFIX && !url.pathname.startsWith(ADMIN_PREFIX + "/")) return false;
    const method = (req.method ?? "GET").toUpperCase();
    const secure = cookieSecure(req);

    // Static assets (the three font files) need no session — the sign-in page uses them — and
    // touch no database. Answered from an allow-list before anything else (src/admin/assets.js).
    if (serveAsset(req, res, url.pathname)) return true;

    const writeHtml = (status, htmlText, authed, extraHeaders = {}) => {
      res.writeHead(status, {
        "content-type": "text/html; charset=utf-8",
        "content-length": Buffer.byteLength(htmlText),
        "x-matic-hub-auth": authed ? "admin-session" : "none",
        "cache-control": "no-store",
        "referrer-policy": "same-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        ...extraHeaders,
      });
      res.end(htmlText);
    };

    // ---- session --------------------------------------------------------------------------------
    const cookies = parseCookies(req.headers.cookie);
    let session = null, user = null, tenant = null;
    let permissions = new Set(), roles = [];
    try {
      session = await loadSession(cookies[COOKIE_NAME]);
      if (session) {
        user = await getAdminUser(session.adminUserId);
        if (!user || user.status !== "active") { session = null; user = null; }
      }
      if (session && user) {
        [permissions, roles] = await Promise.all([permissionsFor(user.id), rolesFor(user.id)]);
        tenant = user.tenantId ? await tenantById(user.tenantId) : null;
      }
    } catch (err) {
      log(`[admin] session load failed: ${err.message}`);
      return void writeHtml(503, page({ title: "Console unavailable", body: unavailableBody(err.message) }), false), true;
    }

    /** @type {Ctx} */
    const ctx = {
      req, res, url, method, session, user, permissions, roles, tenant,
      csrf: session ? csrfToken(session) : null,
      form: {}, params: null, log, embedder, maxFormBytes: MAX_FORM_BYTES,
      render: async (status, body, { title = "Matic Desk", current = url.pathname, notice = null } = {}) => {
        // The nav badges and the degraded-retrieval banner (D236) are independent reads; neither is
        // worth a 500, and both are drawn on every authenticated page.
        const [nav, warning] = await Promise.all([navFor(ctx), degradedBanner()]);
        writeHtml(status, page({
          title, body, nav, current,
          who: user ? { email: user.email, roles, tenant: tenant?.displayName ?? tenant?.slug ?? "no tenant" } : null,
          csrf: ctx.csrf, notice, warning,
          // Guard 5 (D267). EVERY page, not only sign-in: a reader who lands on Tickets from a
          // bookmark must not be able to mistake a bypassed console for a normal one.
          insecure: bypassBannerLine(bypassNow()),
        }), true);
      },
      renderPublic: async (status, body, { title = "Matic Desk", notice = null } = {}) => {
        // Public pages (sign-in) are their own composition: no header, nav or footer — but the
        // insecure banner is drawn on them too, which is why `page()` renders it outside `bare`.
        writeHtml(status, page({ title, body, notice, bare: true, insecure: bypassBannerLine(bypassNow()) }), false);
      },
      redirect: (path) => { res.writeHead(303, { location: path, "cache-control": "no-store", "x-matic-hub-auth": session ? "admin-session" : "none" }); res.end(); },
      audit: (action, { subject = null, detail = null } = {}) => audit({ adminUserId: user?.id ?? null, tenantId: tenant?.id ?? user?.tenantId ?? null, action, subject, detail }),
    };

    try {
      // ---- login / logout: the two routes with no permission --------------------------------------
      if (url.pathname === `${ADMIN_PREFIX}/login`) {
        if (method === "GET") {
          if (session) return void ctx.redirect(ADMIN_PREFIX), true;
          return void (await ctx.renderPublic(200, loginPage({ bypass: bypassNow() }), { title: "Sign in" })), true;
        }
        if (method === "POST") {
          const parsed = await readForm(req);
          if (parsed.error) return void (await ctx.renderPublic(400, loginPage({ error: parsed.error, bypass: bypassNow() }), { title: "Sign in" })), true;
          const { email = "", password = "", code = "" } = parsed.value;
          const result = await attemptLogin({ email, password, code, log, bypass: bypassNow() });
          if (!result.ok) {
            await audit({ tenantId: result.tenantId ?? null, adminUserId: result.userId ?? null, action: "login.failed", subject: email.slice(0, 200), detail: { why: result.why } });
            return void (await ctx.renderPublic(401, loginPage({ error: result.message, email, bypass: bypassNow() }), { title: "Sign in" })), true;
          }
          // `totpVerified` is D157's step-up clock and it must tell the truth: under the bypass no
          // authenticator code was verified, so nothing may later treat this session as having
          // satisfied a second factor. Today nothing reads it (no D157 action exists yet); the day
          // one does, this is the line that decides whether a bypassed session can perform it.
          const token = await createSession({ adminUserId: result.user.id, tenantId: result.user.tenantId, totpVerified: !result.usedBypass });
          // `null` leaves totp_last_step alone. Clearing it would re-open the replay window, and
          // the bypass has no step to record — it verified no code.
          await recordLogin(result.user.id, result.step);
          await audit({
            adminUserId: result.user.id, tenantId: result.user.tenantId, action: "login.ok", subject: result.user.email,
            eventClass: result.usedBypass ? BYPASS_EVENT_CLASS : "normal",
            detail: result.usedBypass ? { insecure: `no authenticator code was required (${BYPASS_ENV}=1)`, boundAddress: bypassNow().boundAddress } : null,
          });
          log(`[admin] ${result.user.email} signed in`);
          res.writeHead(303, { location: ADMIN_PREFIX, "set-cookie": sessionCookie(token, secure), "cache-control": "no-store", "x-matic-hub-auth": "admin-session" });
          res.end();
          return true;
        }
        return void (await ctx.renderPublic(405, loginPage({ error: "GET or POST", bypass: bypassNow() }), { title: "Sign in" })), true;
      }

      if (url.pathname === `${ADMIN_PREFIX}/logout`) {
        if (method !== "POST") return void ctx.redirect(ADMIN_PREFIX), true;
        if (session) {
          const parsed = await readForm(req);
          if (!parsed.error && csrfValid(session, parsed.value?._csrf)) {
            await revokeSession(session.tokenHash);
            await ctx.audit("session.logout", { subject: user?.email ?? null });
          }
        }
        res.writeHead(303, { location: `${ADMIN_PREFIX}/login`, "set-cookie": clearedCookie(secure), "cache-control": "no-store", "x-matic-hub-auth": "none" });
        res.end();
        return true;
      }

      // ---- everything else needs a session --------------------------------------------------------
      if (!session || !user) {
        if (method === "GET") return void ctx.redirect(`${ADMIN_PREFIX}/login`), true;
        return void (await ctx.renderPublic(401, loginPage({ error: "Your session has ended. Sign in again.", bypass: bypassNow() }), { title: "Sign in" })), true;
      }

      // Every tenant-scoped page needs a tenant. A session whose tenant row vanished is a broken
      // session, not a vendor session.
      if (!tenant) {
        await ctx.audit("access.denied", { subject: url.pathname, detail: { why: "no tenant on session" } });
        return void (await ctx.render(403, deniedBody("This account is not scoped to a tenant. Vendor access (D153) is not built in this console."), { title: "No tenant" })), true;
      }

      // ---- match a route --------------------------------------------------------------------------
      let matched = null, params = null;
      for (const r of ROUTES) {
        if (r.method !== method) continue;
        const m = r.pattern.exec(url.pathname);
        if (m) { matched = r; params = m.groups ?? {}; break; }
      }
      if (!matched) {
        const known = ROUTES.some((r) => r.pattern.test(url.pathname));
        return void (await ctx.render(known ? 405 : 404, notFoundBody(url.pathname, known), { title: known ? "Method not allowed" : "Not found" })), true;
      }
      ctx.params = params;

      if (!permissions.has(matched.permission)) {
        await ctx.audit("access.denied", { subject: url.pathname, detail: { needs: matched.permission, roles } });
        return void (await ctx.render(403, deniedBody(`This page needs the ${matched.permission} permission. Your roles (${roles.join(", ") || "none"}) do not carry it.`), { title: "Not allowed" })), true;
      }

      if (method === "POST") {
        const parsed = await readForm(req);
        if (parsed.error) return void (await ctx.render(400, deniedBody(parsed.error), { title: "Bad request" })), true;
        ctx.form = parsed.value;
        // Defence in depth ahead of the token: a browser that sends Sec-Fetch-Site says where the
        // POST came from, and anything but same-origin (or none, for a typed URL) is refused.
        const sfs = String(req.headers["sec-fetch-site"] ?? "");
        if (sfs && sfs !== "same-origin" && sfs !== "none") {
          await ctx.audit("csrf.refused", { subject: url.pathname, detail: { secFetchSite: sfs } });
          return void (await ctx.render(403, deniedBody("Cross-site request refused."), { title: "Refused" })), true;
        }
        if (!csrfValid(session, ctx.form._csrf)) {
          await ctx.audit("csrf.refused", { subject: url.pathname, detail: { why: "token missing or wrong" } });
          return void (await ctx.render(403, deniedBody("The form token was missing or did not match this session. Go back, reload the page, and try again."), { title: "Refused" })), true;
        }
      }

      await matched.handler(ctx);
      return true;
    } catch (err) {
      log(`[admin] ${method} ${url.pathname} failed: ${err.stack ?? err.message}`);
      if (!res.headersSent) {
        writeHtml(500, page({ title: "Error", body: unavailableBody(err.message) }), Boolean(session));
      } else {
        res.end();
      }
      return true;
    }
  };
}

/**
 * The login decision. One outcome for the user ("sign in failed"), several for the audit row.
 *
 * Password is checked BEFORE TOTP and both are checked even when the first fails, so timing does
 * not say which one was wrong. An account with no TOTP secret cannot sign in at all (D156): there
 * is no "TOTP not yet enrolled" path, because `createAdminUser()` always mints one.
 *
 * `bypass` (D267) defaults to OFF. It is passed in rather than read from the environment here so
 * that a test can drive both verdicts without mutating `process.env`, and so that the verdict the
 * banners show and the verdict the login uses are the same object rather than two readings.
 *
 * @param {{ email: string, password: string, code: string, log?: (s: string) => void, bypass?: import("./dev-bypass.js").BypassStatus }} p
 * @returns {Promise<{ ok: true, user: import("./users.js").AdminUser, step: number|null, usedBypass: boolean } | { ok: false, message: string, why: string, userId?: string, tenantId?: string|null }>}
 */
export async function attemptLogin({ email, password, code, log = () => {}, bypass = { on: false, requested: false, refused: false, boundAddress: null, reason: "not supplied" } }) {
  const generic = "Sign in failed. Check the email, password and authenticator code.";
  const key = String(email).trim().toLowerCase();
  if (locked(key)) return { ok: false, message: "Too many attempts. Wait a minute and try again.", why: "locked" };

  const user = await findAdminForLogin(email);
  // Run the password check even with no user so the response time does not reveal which emails exist.
  const passwordOk = verifyPassword(password, user?.passwordHash ?? "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  const step = user?.totpSecret ? verifyTotp(user.totpSecret, code, { lastStep: user.totpLastStep }) : null;

  if (!user) { noteFailure(key); return { ok: false, message: generic, why: "no such user or ambiguous email" }; }
  if (user.status !== "active") { noteFailure(key); return { ok: false, message: generic, why: "disabled", userId: user.id, tenantId: user.tenantId }; }
  if (user.tenantId === null) {
    noteFailure(key);
    return { ok: false, message: "Vendor accounts cannot use this console: vendor access is a time-boxed grant the customer enables (D153), and grant evaluation is not built.", why: "vendor account", userId: user.id, tenantId: null };
  }
  if (!user.passwordHash) { noteFailure(key); return { ok: false, message: generic, why: "no local password (federated user)", userId: user.id, tenantId: user.tenantId }; }
  if (!passwordOk) { noteFailure(key); return { ok: false, message: generic, why: "password", userId: user.id, tenantId: user.tenantId }; }
  if (!user.totpSecret) { noteFailure(key); return { ok: false, message: generic, why: "no TOTP secret on the account (D156 requires one)", userId: user.id, tenantId: user.tenantId }; }
  if (step === null) {
    // THE ONLY POINT AT WHICH THE BYPASS IS CONSULTED (D267), and it is below every check above it.
    // The password has already decided by the time control reaches here — `passwordOk` is three
    // lines up and returns — so there is no arrangement of this function in which the bypass can
    // stand in for a password. Keep it here. Moving it earlier is the change that turns a
    // single-factor dev mode into an open door.
    if (bypass.on) {
      clearFailures(key);
      log(`[admin] login ok for ${user.email} WITHOUT an authenticator code (${BYPASS_ENV}=1, loopback)`);
      return { ok: true, user, step: null, usedBypass: true };
    }
    noteFailure(key);
    return { ok: false, message: generic, why: "totp (wrong, expired or replayed)", userId: user.id, tenantId: user.tenantId };
  }

  clearFailures(key);
  log(`[admin] login ok for ${user.email}`);
  return { ok: true, user, step, usedBypass: false };
}

// ---- small bodies -------------------------------------------------------------------------------

function deniedBody(message) {
  return html`<h1>Not allowed</h1><p class="lede">${message}</p><p><a href="/admin">Back to the review queue</a></p>`;
}
function notFoundBody(path, known) {
  return html`<h1>${known ? "Method not allowed" : "No such page"}</h1><p class="lede mono">${path}</p><p><a href="/admin">Back to the review queue</a></p>`;
}
function unavailableBody(message) {
  return html`<h1>The console could not answer</h1><p class="lede">${message}</p>
    <p class="muted">Usually the database. From <span class="mono">server/</span>: <span class="mono">npm.cmd run db:up</span>, then <span class="mono">npm.cmd run migrate</span>.</p>`;
}
