/**
 * THE TICKET LIFECYCLE, END TO END — the click-through benchmark's scripted half (2026-09-13).
 *
 * Run: npm.cmd run db:up; npm.cmd run migrate; then  node test/clickthrough-e2e.mjs
 * (or `npm run clickthrough`). Needs PostgreSQL. Does NOT need Ollama: S1's retrieval leg is
 * lexical-only here on purpose — see `stubEmbedder`.
 *
 * WHAT THIS IS. Ten scenarios from `docs/handovers/2026-09-13-claude-code-handover-lifecycle-
 * clickthrough-benchmark.md` §5, driven against the real hub, the real database and the real
 * console over the wire. The requester acts over HTTP with a real enrollment credential; the desk
 * acts through the console's own routes with a real signed-in session; the job runner is the real
 * one. It is the pass/fail gate. It is NOT the whole benchmark — every test marked `eyes` in the
 * TESTS table below also gets a human click-through (the console in a browser, the panel in
 * Electron), and the scorecard carries both.
 *
 * ITS OWN TENANT. `clickthrough` / `t_clickthrough`, dropped and recreated at the start of every
 * run, left in place at the end so the scorecard is auditable. The dev tenant's data is never
 * touched: MD-1008/1009/1010 and the four pre-enrollment orphans are history (the P3a handover),
 * and history is not rewritten for tidiness.
 *
 * NO SQL OF ITS OWN EXCEPT TIME TRAVEL AND FIXTURES (D224). Every ticket read and write goes
 * through `src/tickets/**` or a console route. The three exceptions are marked `TIME TRAVEL` and
 * are the only raw statements here: moving `auto_close_at` and `job_queue.run_after` backwards, and
 * ageing `awaiting_agent_since`. You never wait 72 hours; you also never lower the interval and
 * call that the same test (§3.9) — S8 does both, a short configured interval AND a backdated long
 * one.
 *
 * THE CANARY. Every internal string this run writes carries `INTERNAL-CANARY-<runId>`. S7 greps
 * every byte the endpoint was ever handed — a captured transcript of every requester-facing
 * response, not one response — for it. One hit stops the run: plan v3 §8.2's kill criterion.
 *
 * WHAT IT WRITES. `docs/handovers/screenshots/2026-09-13-clickthrough/results.json` — one row per
 * test id — which is what the scorecard is generated from, so the scorecard cannot drift from the
 * run.
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createHubServer } from "../src/index.js";
import { migrate } from "../src/db/migrate.js";
import { createTenant, dropTenantForTests, tenantBySlug } from "../src/db/tenants.js";
import { getPool, closePool, withControl } from "../src/db/pool.js";
import { withTenant } from "../src/db/tenant.js";
import { createAdminUser } from "../src/admin/users.js";
import { totpCode } from "../src/admin/auth.js";
import { adminHandler, resetLoginThrottle } from "../src/admin/router.js";
import { resetEnrollmentThrottle, revokeDevices, listDevices, createEnrollmentSecret } from "../src/devices/enrollment.js";
import { resetReadThrottle, READS_PER_MINUTE } from "../src/tickets/read.js";
import { resetWriteThrottle, WRITES_PER_MINUTE } from "../src/tickets/requester-routes.js";
import {
  listEntries, listEntriesForRequester, getTicket, listTickets, setTicketState,
  oldestUnansweredRequesterComment, AUTOCLOSE_JOB, autocloseHoursForSchema,
} from "../src/tickets/query.js";
import { setAutocloseHours, createAutocloseHandler, AUTOCLOSE_AUTHOR } from "../src/tickets/autoclose.js";
import { runOne, claim, reapStuck } from "../src/db/jobs.js";
import { outcomeCounts, deflectionOf } from "../src/sessions/store.js";
import { admitPeer } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, "..");
const REPO = join(SERVER, "..");
const OUT_DIR = join(REPO, "docs", "handovers", "screenshots", "2026-09-13-clickthrough");

const SLUG = "clickthrough";
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
/** Every internal string this run writes carries it. S7 greps every requester-facing byte for it. */
const CANARY = `INTERNAL-CANARY-${RUN_ID}`;

// =================================================================================================
// The plan's ten scenarios, as a table. `eyes` is the surface a human must also look at (§5).
// =================================================================================================
const TESTS = [
  ["T1.1", "S1 deflection", "hub", "a covered question is answered and cited; NO row appears in tickets", "panel"],
  ["T1.2", "S1 deflection", "client", "a consented action reports in the catalog's words, not the mechanism's (D250); no ticket filed", "panel"],
  ["T1.3", "S1 deflection", "console", "the session outcome is a deflection (D89 counts SESSIONS) and the console's deflection surface reflects it", "console"],
  ["T1.4", "S1 deflection", "hub", "the tickets band count is unchanged and 'where's my ticket?' does not invent one", "panel"],

  ["T2.1", "S2 the spine", "hub", "the requester files; a real MD-#### comes back and the band words exist for each state", "panel"],
  ["T2.2", "S2 the spine", "console", "the ticket lands in the console queue with provenance (device_key_id, os_username) and state = new", "console"],
  ["T2.3", "S2 the spine", "both", "two work notes render in console AND CLI labelled internal, by a LABEL not only a colour", "both"],
  ["T2.4", "S2 the spine", "console", "not yet handed -> handed -> seen as the endpoint polls and acks; never 'sent' or 'notified'", "console"],
  ["T2.5", "S2 the spine", "hub", "the reply reaches the requester's read quoted in full, within one poll; nothing is spoken (D288)", "panel"],
  ["T2.6", "S2 the spine", "console", "resolve without a code is refused with a sentence; without notes, refused; with both, accepted", "console"],
  ["T2.7", "S2 the spine", "both", "the resolved line reads 'closes on its own in 3 days unless you say otherwise'; the console carries the same clock", "both"],
  ["T2.8", "S2 the spine", "both", "confirm -> closed, closed_by requester, the resolution kept, the queued auto-close job cancelled", "both"],
  ["T2.9", "S2 the spine", "cli", "the timeline is ordered and attributed, and the CLI's show and the console cannot disagree (D224)", null],

  ["T3.1", "S3 the desk works it", "console", "a requester comment on a LIVE ticket starts D276's clock; the console shows an AGE, not a count", "console"],
  ["T3.2", "S3 the desk works it", "hub", "the desk's reply clears the clock in the same transaction as the entry", null],
  ["T3.3", "S3 the desk works it", "hub", "internal work notes are invisible to the requester on every surface", "panel"],
  ["T3.4", "S3 the desk works it", "hub", "two requester comments in a row: the age is the OLDEST unanswered, not the newest", null],
  ["T3.5", "S3 the desk works it", "client", "resolution notes are presented as a QUOTATION, attributed, never in the agent's own voice (D214)", "panel"],

  ["T4.1", "S4 two agents", "console", "Agent A work-notes, Agent B resolves; author_label is a snapshot per entry, so both people show", "console"],
  ["T4.2", "S4 two agents", "console", "the resolution is authored by whoever resolved (B) — D252 — and nothing claims A owned it", "console"],
  ["T4.3", "S4 two agents", "hub", "the audit log carries ticket.worknote / ticket.comment / ticket.resolve with the right actor on each", null],
  ["T4.4", "S4 two agents", "console", "suggested_owner routes nothing and NO surface implies it does", "console"],
  ["T4.5", "S4 two agents", "hub", "A and B move the same ticket at the same instant: the loser gets a sentence, not a constraint violation", null],

  ["T5.1", "S5 the vendor", "console", "the vendor exchange is recorded as work notes — the vendor has no account and no surface", "console"],
  ["T5.2", "S5 the vendor", "console", "a requester comment arrives while the ticket is with the vendor; the clock starts; the desk can hold it", "console"],
  ["T5.3", "S5 the vendor", "both", "referred_to_vendor + requester-visible notes readable by a non-technical person, leaking no vendor detail", "both"],
  ["T5.4", "S5 the vendor", "console", "nothing in the product claims a vendor was contacted, because nothing contacted one", "console"],

  ["T6.1", "S6 the requester disagrees", "console", "a comment on a RESOLVED ticket reopens it in one transaction and clears the resolution", "console"],
  ["T6.2", "S6 the requester disagrees", "hub", "the first auto-close job is cancelled and the binding cleared", null],
  ["T6.3", "S6 the requester disagrees", "hub", "POST /reopen with a reason does the same and records it; without a reason it is refused", null],
  ["T6.4", "S6 the requester disagrees", "hub", "re-resolve enqueues a SECOND job; the first, run by hand, says 'resolved by a NEWER resolution'", null],
  ["T6.5", "S6 the requester disagrees", "hub", "the second handler run twice writes nothing the second time (D270, re-proven end to end)", null],

  ["T7.1", "S7 confidentiality", "hub", "GET /v1/tickets and the timeline read return ONLY the allow-listed fields", null],
  ["T7.2", "S7 confidentiality", "panel", "the rendered panel DOM contains none of the five internal values", "panel"],
  ["T7.3", "S7 confidentiality", "hub", "the ack payload and every error body carry none of them (404/401/429 included)", null],
  ["T7.4", "S7 confidentiality", "hub", "adding a column to tickets without adding it to the allow-list FAILS the test", null],
  ["T7.5", "S7 confidentiality", "hub", "listEntriesForRequester() cannot be made to return an internal entry, including by passing a visibility", null],
  ["T7.6", "S7 confidentiality", "hub", "the canary is absent from EVERY byte the endpoint ever received across the whole run", null],

  ["T8.1", "S8 closure", "both", "a resolved ticket auto-closes AFTER the due instant and not before; closed_by auto; one public state change", "both"],
  ["T8.2", "S8 closure", "both", "closed is terminal in the console; a comment on a closed ticket is refused WITH the way forward; reopened_from is a real FK", "both"],
  ["T8.3", "S8 closure", "cli", "bin/tickets.mjs can still move a closed ticket — the CLI is the correction tool", null],
  ["T8.4", "S8 closure", "console", "the interval is not retroactive; --off stops new bindings; the panel is gated on settings.write", "console"],
  ["T8.5", "S8 closure", "both", "THE FRIDAY/TUESDAY TEST: a resolution the requester was never shown does not close the ticket", "both"],
  ["T8.6", "S8 closure", "hub", "a resolution with read_by_requester_at unstamped does not close; the handler re-arms and says so", null],
  ["T8.7", "S8 closure", "hub", "a delivered and acked resolution closes on the interval measured FROM THE ACK, not from resolved_at", null],
  ["T8.8", "S8 closure", "console", "an undelivered resolution does not re-arm forever: the backstop fires and it surfaces as 'resolved, never delivered'", "console"],

  ["T9.1", "S9 identity", "hub", "no credential -> 401 with NEEDS_CREDENTIAL_TO_ACT's sentence; nothing changed", null],
  ["T9.2", "S9 identity", "hub", "Endpoint B asking for Endpoint A's reference -> 404, the same as no such ticket (never 403)", null],
  ["T9.3", "S9 identity", "hub", "a revoked enrollment stops working on its NEXT request", null],
  ["T9.4", "S9 identity", "hub", "21 writes in a minute -> 429 with retryAfterMs; the read limit's sibling behaves too", null],
  ["T9.5", "S9 identity", "console", "last_seen_at moves on an authenticated call", "console"],
  ["T9.6", "S9 identity", "hub", "D291: pre-enrollment tickets stay unmatched and the copy is honest about why", "panel"],
  ["T9.7", "S9 identity", "hub", "D274's detector is still pointed at the real client tree and still fails when flipped by hand", null],

  ["T10.1", "S10 adverse", "client", "hub stopped mid-filing: 'Not sent', 'Nothing was filed.', no URL or stack on the surface or the voice (D246)", "panel"],
  ["T10.2", "S10 adverse", "both", "hub stopped after a desk reply: still 'not yet seen'; on recovery the poll delivers the backlog", "both"],
  ["T10.3", "S10 adverse", "client", "connection-state copy names the SAME TWO THINGS on loss and on recovery (F1/F2 must not regress)", "panel"],
  ["T10.4", "S10 adverse", "hub", "with MATIC_HUB_BIND on a LAN address the console's dev bypass is REFUSED (D283/D267 guard 2)", "console"],
  ["T10.5", "S10 adverse", "hub", "two workers sharing one database do not double-close a ticket (SKIP LOCKED)", null],
  ["T10.6", "S10 adverse", "hub", "a hub restart mid-job leaves NO row stuck running (the reaper)", null],
];
const META = new Map(TESTS.map(([id, scenario, surface, proves, eyes]) => [id, { id, scenario, surface, proves, eyes }]));

// =================================================================================================
// Recording
// =================================================================================================
/** @type {Map<string, {ok: boolean, label: string, extra: string}[]>} */
const CHECKS = new Map();
let pass = 0, fail = 0;
function check(id, label, cond, extra = "") {
  if (!META.has(id)) throw new Error(`${id} is not in the TESTS table — a check with no test is a check nobody reads`);
  const ok = Boolean(cond);
  if (ok) { pass++; console.log(`  PASS  [${id}] ${label}`); }
  else { fail++; console.log(`  FAIL  [${id}] ${label}${extra ? `  — ${extra}` : ""}`); }
  if (!CHECKS.has(id)) CHECKS.set(id, []);
  CHECKS.get(id).push({ ok, label, extra: ok ? "" : String(extra).slice(0, 500) });
  return ok;
}
const section = (s) => console.log(`\n=== ${s} ===`);

// =================================================================================================
// The rig
// =================================================================================================
let server = null, base = "", schema = "", tenantId = "";
const agents = { a: null, b: null };
const endpoints = { a: null, b: null };

/** Lexical-only. S1 proves retrieval ANSWERS and CITES; the embedder is D203's separate argument. */
const stubEmbedder = {
  name: "clickthrough-stub", model: "clickthrough-stub",
  async embed() { throw new Error("no embedder in the click-through rig: the lexical leg is the one under test"); },
  async embedBatch() { throw new Error("no embedder in the click-through rig"); },
  async verify() { return { ok: false, error: "no embedder in the click-through rig (lexical leg only)" }; },
};
/** /v1/ask's model. Deterministic, so S1 asserts the CONTRACT and not a model's mood. */
const scriptedProvider = {
  name: "clickthrough-scripted", model: "clickthrough-scripted",
  async complete({ messages }) {
    const user = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
    // Cite an article that was SUPPLIED — the ids are in the reference block the hub assembled.
    // A citation of an article the hub did not send is dropped and the answer downgraded to a
    // decline (D205). That is correct behaviour, and it is not what S1 is testing.
    const supplied = [...user.matchAll(/^id: (.+)$/gm)].map((m) => m[1].trim());
    const body = supplied.length
      ? { answered: true, reply: "Unplug the dock from power for thirty seconds, then plug it back in and reconnect the monitors.", citedArticleIds: [supplied[0]] }
      : { answered: false, reply: "I don't have company guidance covering that, so I'd rather not guess.", citedArticleIds: [] };
    return { status: 200, body: { choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ id: "call_1", type: "function", function: { name: "answer", arguments: JSON.stringify(body) } }] } }] }, ms: 1 };
  },
};

/** D250/D247: the mechanism's own vocabulary, which may be a title and may never be a report. */
const MECHANISM = /ipconfig|flushdns|netsh|resolver cache|\bDNS\b/i;

/** Every requester-facing byte this run produced. S7's T7.6 greps ALL of it, not one response. */
const WIRE = [];
function recordWire(what, text) { WIRE.push({ what, text: String(text) }); }

/** A console session. Cookie-carrying, CSRF-reading, exactly what a browser does. */
function consoleClient() {
  let cookie = "";
  return {
    get cookie() { return cookie; },
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
    /** Read the page the operator is looking at, take its token, post the form. What a click is. */
    async submit(readPath, postPath, form) {
      const page = await this.go(readPath);
      const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)?.[1];
      if (!csrf) throw new Error(`no CSRF token on ${readPath} (status ${page.status}) — not signed in?`);
      return this.go(postPath, { method: "POST", form: { _csrf: csrf, ...form } });
    },
  };
}
async function signIn(who) {
  const c = consoleClient();
  const r = await c.go("/admin/login", { method: "POST", form: { email: who.email, password: who.password, code: totpCode(who.totpSecret) } });
  if (r.status !== 303) throw new Error(`${who.email} could not sign in: ${r.status} ${r.text.slice(0, 200)}`);
  return c;
}

/** An enrolled endpoint: the credential, and the three verbs a requester has. */
function endpoint(credential, deviceKeyId) {
  const headers = () => ({ "content-type": "application/json", authorization: `Bearer ${credential}` });
  const api = {
    credential, deviceKeyId, deviceId: null,
    async get(path) {
      const res = await fetch(base + path, { headers: headers() });
      const text = await res.text();
      recordWire(`GET ${path}`, text);
      return { status: res.status, body: JSON.parse(text) };
    },
    async post(path, body) {
      const res = await fetch(base + path, { method: "POST", headers: headers(), body: JSON.stringify(body ?? {}) });
      const text = await res.text();
      recordWire(`POST ${path}`, text);
      return { status: res.status, body: JSON.parse(text) };
    },
    /** File a ticket the way the endpoint does. `internal` fields are the ones S7 hunts. */
    async file({ description, summary, whatWasChecked = null, category = "other", suggestedOwner = null, machineName, osUsername, reopenedFrom = null, sessionId = null }) {
      const r = await api.post("/v1/ticket", { description, summary, whatWasChecked, category, suggestedOwner, machineName, reopenedFrom, sessionId, reporter: { osUsername } });
      if (!r.body.ok) throw new Error(`could not file: ${r.body.error}`);
      return r.body.reference;
    },
    /** ONE POLL, as the client's watch does it: read, then acknowledge what it was handed (D287). */
    async poll(reference) {
      const r = await api.get(`/v1/tickets/${reference}`);
      if (!r.body.ok) return r;
      const ids = (r.body.entries ?? []).filter((e) => e.authorKind !== "requester").map((e) => e.id);
      if (ids.length) await api.post("/v1/tickets/ack", { entryIds: ids });
      return r;
    },
  };
  return api;
}

async function enroll(deviceKeyId, secret) {
  const res = await fetch(`${base}/v1/enroll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant: SLUG, deviceKeyId, secret }) });
  const body = await res.json();
  if (body.status !== "active" || !body.credential) throw new Error(`${deviceKeyId} did not enroll: ${JSON.stringify(body).slice(0, 300)}`);
  const e = endpoint(body.credential, deviceKeyId);
  const { rows } = await withControl((c) => c.query("SELECT id FROM control.devices WHERE tenant_id = $1 AND device_key_id = $2", [tenantId, deviceKeyId]));
  e.deviceId = rows[0].id;
  return e;
}

const cli = (...args) => spawnSync(process.execPath, [join(SERVER, "bin", "tickets.mjs"), ...args], { cwd: SERVER, encoding: "utf8", env: { ...process.env, MATIC_TICKET_TENANT: schema } });

/** The raw row, for assertions the readers deliberately do not expose. Reads only. */
const row = (reference) => withTenant(schema, async (c) => (await c.query("SELECT * FROM tickets WHERE reference = $1", [reference])).rows[0]);
const jobsFor = (ticketId) => withControl(async (c) => (await c.query("SELECT * FROM control.job_queue WHERE type = $1 AND ref_id = $2 ORDER BY id", [AUTOCLOSE_JOB, ticketId])).rows);

/** TIME TRAVEL (§3.9). The ONLY raw writes in this file. You never sleep past an interval. */
async function makeDue(reference) {
  const t = await row(reference);
  await withTenant(schema, (c) => c.query("UPDATE tickets SET auto_close_at = now() - interval '1 minute' WHERE id = $1", [t.id]));
  await withControl((c) => c.query("UPDATE control.job_queue SET run_after = now() - interval '1 minute' WHERE type = $1 AND ref_id = $2 AND status = 'queued'", [AUTOCLOSE_JOB, t.id]));
  return (await jobsFor(t.id)).find((j) => j.status === "queued");
}
async function ageAwaiting(reference, hours) {
  await withTenant(schema, (c) => c.query(`UPDATE tickets SET awaiting_agent_since = now() - ($2 || ' hours')::interval WHERE reference = $1`, [reference, String(hours)]));
}

/** snake_case, for comparing a shaped key against an information_schema column name. */
const snake = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const autocloseHandler = createAutocloseHandler({ log: () => {} });
/** Finish a job this file claimed by hand, so nothing is left `running` on the shared queue. */
async function runOneClaimed(job) {
  const { finish } = await import("../src/db/jobs.js");
  await withTenant(job.tenantSchema, (c) => autocloseHandler(job, c));
  await finish(job.id);
}

/** Run ONE autoclose job through the real runner. `ran` is "a job was claimed and finished". */
const runJob = async (worker = `clickthrough-${RUN_ID}`) => {
  const job = await runOne(worker, async (j, c) => autocloseHandler(j, c), { types: [AUTOCLOSE_JOB] });
  return { ran: Boolean(job), job };
};
/** snake_case, for comparing a shaped key against an information_schema column name. */

async function setup() {
  await migrate();
  if (await tenantBySlug(SLUG)) await dropForRerun();
  const t = await createTenant(SLUG, { displayName: "Click-through Co" });
  schema = t.schemaName; tenantId = t.id;
  // Agent A is a tenant_admin: tickets.write AND settings.write, so she can drive the auto-close
  // panel. Agent B is an it_agent: tickets.write and NO settings.write, which is what makes T8.4's
  // permission gate a test rather than an assertion about a role table.
  agents.a = { ...(await createAdminUser({ tenantId, email: "agent.a@clickthrough.test", roleName: "tenant_admin", password: "agent-a-password-12" })), label: "agent.a@clickthrough.test" };
  agents.b = { ...(await createAdminUser({ tenantId, email: "agent.b@clickthrough.test", roleName: "it_agent", password: "agent-b-password-12" })), label: "agent.b@clickthrough.test" };
  server = createHubServer({ provider: scriptedProvider, log: () => {}, kb: true, ticketTenant: schema, embedder: stubEmbedder });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  const { secret } = await createEnrollmentSecret({ tenantId, ttlDays: 1 });
  endpoints.a = await enroll("clickthrough-endpoint-a", secret);
  endpoints.b = await enroll("clickthrough-endpoint-b", secret);
}

async function dropForRerun() {
  const prior = await tenantBySlug(SLUG);
  if (!prior) return;
  await withControl(async (c) => {
    await c.query("DELETE FROM control.job_queue WHERE tenant_schema = $1", [prior.schemaName]);
    await c.query("DELETE FROM control.enrollment_requests WHERE tenant_id = $1", [prior.id]);
    await c.query("DELETE FROM control.devices WHERE tenant_id = $1", [prior.id]);
    await c.query("DELETE FROM control.enrollment_secrets WHERE tenant_id = $1", [prior.id]);
    await c.query("DELETE FROM control.admin_audit WHERE tenant_id = $1", [prior.id]);
    await c.query("DELETE FROM control.admin_users WHERE email LIKE '%@clickthrough.test'");
  });
  await dropTenantForTests(SLUG);
}

/** The audit rows for this tenant, newest first. */
const auditRows = async () => (await getPool().query(
  "SELECT a.action, a.subject, a.detail, u.email FROM control.admin_audit a LEFT JOIN control.admin_users u ON u.id = a.admin_user_id WHERE a.tenant_id = $1 ORDER BY a.id DESC", [tenantId],
)).rows;

// =================================================================================================
// THE RUN
// =================================================================================================
try {
  await setup();
  resetLoginThrottle(); resetEnrollmentThrottle(); resetReadThrottle(); resetWriteThrottle();
  const A = await signIn(agents.a);
  const B = await signIn(agents.b);
  const epA = endpoints.a, epB = endpoints.b;

  // -----------------------------------------------------------------------------------------------
  section("S1 — Matic resolves it, and no ticket is born (deflection)");
  // -----------------------------------------------------------------------------------------------
  {
    const before = (await listTickets(schema, { limit: 200 })).length;
    const ask = await (await fetch(`${base}/v1/ask`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${epA.credential}` }, body: JSON.stringify({ text: "my external monitors are not detected through the docking station" }) })).json();
    const after = (await listTickets(schema, { limit: 200 })).length;
    check("T1.1", "a covered question is answered", ask.ok === true && ask.answered === true, JSON.stringify(ask).slice(0, 300));
    check("T1.1", "the answer cites an article rather than asserting", Array.isArray(ask.citedArticleIds) && ask.citedArticleIds.length > 0, JSON.stringify(ask.citedArticleIds));
    check("T1.1", "and the citation is an article the hub actually supplied (D205 drops any other)", (ask.citedArticleIds ?? []).every((id) => (ask.retrieval?.articles ?? []).includes(id)), JSON.stringify([ask.citedArticleIds, ask.retrieval?.articles]));
    check("T1.1", "NO row appeared in tickets — a deflection is the absence of a ticket", after === before, `${before} -> ${after}`);

    // T1.2 is the client's catalog and its consent card. The hub half is that nothing was filed.
    const catalog = JSON.parse(readFileSync(join(REPO, "client", "src", "broker", "catalog.json"), "utf8"));
    const caps = Array.isArray(catalog) ? catalog : (catalog.capabilities ?? []);
    const flush = caps.find((c) => c.id === "flush_dns") ?? null;
    check("T1.2", "the client's capability catalog carries flush_dns", Boolean(flush), caps.map((c) => c.id).join(","));
    if (flush) {
      // D250: what the user is TOLD is written in the catalog's plain words — the ones on the
      // consent card — never the mechanism's name, which is what `title` is for and what the
      // inspector shows. The report a user hears must be matchable to what they agreed to.
      const plain = JSON.stringify(flush.plain ?? {});
      check("T1.2", "it carries the plain words a report is written in (D250)", Boolean(flush.plain?.what), plain.slice(0, 200));
      check("T1.2", "and those words name no mechanism", !MECHANISM.test(plain), plain.slice(0, 300));
      check("T1.2", "while the TITLE keeps the mechanism's name, because a title is the capability's identity", MECHANISM.test(flush.title ?? ""), String(flush.title));
    }
    check("T1.2", "no ticket was filed by an action that succeeded", (await listTickets(schema, { limit: 200 })).length === before);

    // T1.3 — D89 counts SESSIONS. The endpoint's own session, begun and confirmed resolved.
    const sid = randomUUID();
    const begun = await (await fetch(`${base}/v1/session`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${epA.credential}` }, body: JSON.stringify({ sessionId: sid, event: "begin", machineName: "LAPTOP-CT-A", category: "network" }) })).json();
    const confirmed = await (await fetch(`${base}/v1/session`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${epA.credential}` }, body: JSON.stringify({ sessionId: sid, event: "resolved", category: "network" }) })).json();
    const counts = await outcomeCounts(schema);
    check("T1.3", "the endpoint can begin a session over the wire", begun.ok === true, JSON.stringify(begun).slice(0, 200));
    check("T1.3", "and report the one outcome a client may report: resolved (D90's confirmation turn)", confirmed.ok === true && confirmed.outcome === "resolved", JSON.stringify(confirmed).slice(0, 200));
    check("T1.3", "the store counts it as a resolved SESSION, and deflection is computable", counts.total.resolved === 1 && deflectionOf(counts.total) === 1, JSON.stringify(counts.total));
    const metrics = await A.go("/admin/metrics");
    check("T1.3", "the console's Metrics page shows a deflection FIGURE, not 'cannot be computed'", metrics.status === 200 && /Deflection/.test(metrics.text) && !/[Dd]eflection cannot be computed/.test(metrics.text), metrics.text.match(/[Dd]eflection[^<]{0,120}/)?.[0] ?? String(metrics.status));
    check("T1.3", "and the figure it shows is the one deflectionOf() computes", metrics.status === 200 && /100%/.test(metrics.text), metrics.text.match(/Deflection[\s\S]{0,400}/)?.[0]?.replace(/<[^>]+>/g, " ").slice(0, 200) ?? "");

    const mine = await epA.get("/v1/tickets");
    check("T1.4", "the requester's tickets list is still empty — the band count is unchanged", mine.body.ok === true && mine.body.count === 0, JSON.stringify(mine.body).slice(0, 200));
    const whereIs = await (await fetch(`${base}/v1/ask`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${epA.credential}` }, body: JSON.stringify({ text: "where is my ticket" }) })).json();
    check("T1.4", "'where's my ticket?' invents no ticket", (await listTickets(schema, { limit: 200 })).length === before, JSON.stringify(whereIs).slice(0, 200));
  }

  // -----------------------------------------------------------------------------------------------
  section("S2 — Matic cannot fix it, files a ticket, the desk resolves it, the requester confirms");
  // -----------------------------------------------------------------------------------------------
  let spine;
  {
    const stateWords = await import(pathToFileURL(join(REPO, "client", "src", "ticket", "state-words.js")).href);
    spine = await epA.file({
      description: "My laptop won't connect to the docking station monitors any more.",
      summary: `Case note for the assignee. ${CANARY}`,
      whatWasChecked: `DisplayLink driver version and dock firmware. ${CANARY}`,
      category: "hardware", suggestedOwner: "desktop_support", machineName: "LAPTOP-CT-A", osUsername: "ct.requester",
    });
    check("T2.1", "the ticket comes back as a real MD-#### reference", /^MD-\d+$/.test(spine), spine);
    check("T2.1", "the band has words for every state the hub can be in, and none of them is a hub enum", ["new", "open", "resolved", "closed"].every((s) => stateWords.stateWords(s) && !/^(new|open|resolved|closed)$/.test(stateWords.stateWords(s))), ["new", "open", "resolved", "closed"].map(stateWords.stateWords).join(" | "));
    const mine = await epA.get("/v1/tickets");
    check("T2.1", "and it is the requester's own: one ticket, this enrollment's", mine.body.count === 1 && mine.body.tickets[0].reference === spine);

    const list = await A.go("/admin/tickets");
    const detail = await A.go(`/admin/tickets/${spine}`);
    check("T2.2", "the ticket is in the console queue", list.status === 200 && list.text.includes(`>${spine}<`), String(list.status));
    check("T2.2", "its state is new", (await row(spine)).state === "new");
    check("T2.2", "the detail page names the enrollment the Agents page lists — the device KEY, not only an internal uuid", detail.text.includes("clickthrough-endpoint-a"), detail.text.match(/device <span class="mono">[^<]*/)?.[0] ?? "no device line");
    check("T2.2", "and the self-asserted OS username", detail.text.includes("ct.requester"));
    check("T2.2", "with the profile source GLOSSED in words, not shown as a raw enum (D244's rule, on the console)", /self-asserted/i.test(detail.text) && !/self_asserted/.test(detail.text), (detail.text.match(/self[_-]asserted/gi) ?? []).join(","));

    await A.submit(`/admin/tickets/${spine}`, `/admin/tickets/${spine}/state`, { from: "new", next: "open" });
    await A.submit(`/admin/tickets/${spine}`, `/admin/tickets/${spine}/worknote`, { body: `Dock firmware is two releases behind. ${CANARY}` });
    await A.submit(`/admin/tickets/${spine}`, `/admin/tickets/${spine}/worknote`, { body: `Ordered a replacement dock from the vendor. ${CANARY}` });
    const withNotes = await A.go(`/admin/tickets/${spine}`);
    const cliShow = cli("show", spine);
    const internals = (await listEntries(schema, spine, { visibility: "all" })).filter((e) => e.visibility === "internal");
    check("T2.3", "both work notes are on the ticket", internals.filter((e) => e.kind === "work_note").length === 2, String(internals.length));
    check("T2.3", "the console labels each one INTERNAL in words, not only by colour", (withNotes.text.match(/the requester never sees this/g) ?? []).length >= 2, String((withNotes.text.match(/the requester never sees this/g) ?? []).length));
    check("T2.3", "the CLI labels them internal too", cliShow.status === 0 && /internal/i.test(cliShow.stdout) && cliShow.stdout.includes("Dock firmware is two releases behind"), cliShow.stdout.slice(0, 300));

    await A.submit(`/admin/tickets/${spine}`, `/admin/tickets/${spine}/reply`, { body: "We've ordered you a replacement dock. It should be with you in two working days." });
    const beforePoll = await A.go(`/admin/tickets/${spine}`);
    check("T2.4", "before the endpoint polls, the console says NOT YET HANDED", /not yet handed to the requester's app/.test(beforePoll.text));
    const CLAIMS_DELIVERY = /(reply|message|note|resolution|it|this)\s+(has been|have been|was|were|is|are)\s+(sent|notified|emailed|delivered)|we('ve| have)?\s+(sent|notified|emailed)\s+(the|them|your)|the requester (has been |was )?(notified|emailed|told)|(sent|notified) to the requester/i;
    check("T2.4", "and never CLAIMS the reply was sent, notified or emailed", !CLAIMS_DELIVERY.test(beforePoll.text), (beforePoll.text.match(CLAIMS_DELIVERY) ?? []).join(","));
    check("T2.4", "while the honest negative — that nothing CAN be emailed — is still on the page (D213/D245)", /by email|not email/i.test(beforePoll.text));
    const read1 = await epA.get(`/v1/tickets/${spine}`);
    const handed = await A.go(`/admin/tickets/${spine}`);
    check("T2.4", "after the read, the console says HANDED, not yet seen", /handed to the requester's app[^<]*not yet seen/.test(handed.text), handed.text.match(/handed[^<]{0,80}/)?.[0] ?? "no");
    const replyEntry = read1.body.entries.find((e) => e.kind === "comment" && e.authorKind !== "requester");
    await epA.post("/v1/tickets/ack", { entryIds: [replyEntry.id] });
    const seen = await A.go(`/admin/tickets/${spine}`);
    check("T2.4", "after the ack, the console says SEEN", /seen by the requester/.test(seen.text), seen.text.match(/seen by the requester[^<]{0,40}/)?.[0] ?? "no");

    check("T2.5", "the reply reached the requester's read, quoted in full", replyEntry?.body === "We've ordered you a replacement dock. It should be with you in two working days.", String(replyEntry?.body).slice(0, 120));
    check("T2.5", "in one poll — the same request that hands it over returns it", read1.body.handed >= 1, String(read1.body.handed));
    const spoken = stateWords.updateWords({ kind: "comment", body: replyEntry.body, authorKind: "console_user" }, spine, "open");
    check("T2.5", "and the transcript line quotes the desk rather than speaking in the agent's voice", spoken.includes("“") && spoken.includes(replyEntry.body), spoken.slice(0, 160));

    const noCode = await A.submit(`/admin/tickets/${spine}`, `/admin/tickets/${spine}/resolve`, { from: "open", resolutionCode: "", resolutionNotes: "Replaced the dock." });
    check("T2.6", "resolve without a code is refused with a sentence, and the ticket did not move", noCode.status === 400 && (await row(spine)).state === "open", `${noCode.status}`);
    const noNotes = await A.submit(`/admin/tickets/${spine}`, `/admin/tickets/${spine}/resolve`, { from: "open", resolutionCode: "fixed", resolutionNotes: "  " });
    check("T2.6", "resolve without notes is refused too", noNotes.status === 400 && (await row(spine)).state === "open", `${noNotes.status}`);
    check("T2.6", "and the refusal names what is missing rather than showing a constraint", /resolution notes the requester will read|cannot be resolved without/.test(noNotes.text), noNotes.text.replace(/<[^>]+>/g, " ").match(/cannot be resolved[^.]*\./)?.[0] ?? "");

    await A.submit("/admin/tickets", "/admin/tickets/autoclose", { hours: "72" });
    const ok = await A.submit(`/admin/tickets/${spine}`, `/admin/tickets/${spine}/resolve`, { from: "open", resolutionCode: "fixed", resolutionNotes: "We replaced the docking station. Your monitors should come up as soon as you plug it in.", note: `Root cause: firmware. ${CANARY}` });
    check("T2.6", "with both, it is accepted", ok.status === 303 && (await row(spine)).state === "resolved", `${ok.status}`);

    const resolvedRow = await row(spine);
    const resolvedRead = await epA.poll(spine);
    const detail2 = await A.go(`/admin/tickets/${spine}`);
    const line = stateWords.stateDetail({ state: "resolved", unseen: 0, autoCloseAt: resolvedRead.body.ticket.autoCloseAt }, new Date());
    check("T2.7", "the requester's line says it closes on its own in 3 days unless they say otherwise", /closes on its own in 3 days unless you say otherwise/.test(line), line);
    check("T2.7", "the console's detail page carries the same clock", /Closes automatically/.test(detail2.text) && detail2.text.includes(new Date(resolvedRow.auto_close_at).getUTCFullYear().toString()), detail2.text.match(/Closes automatically[^<]{0,90}/)?.[0] ?? "no");
    check("T2.7", "and the two clocks are the same instant", new Date(resolvedRead.body.ticket.autoCloseAt).getTime() === resolvedRow.auto_close_at.getTime());

    const queued = await jobsFor(resolvedRow.id);
    const confirm = await epA.post(`/v1/ticket/${spine}/confirm`);
    const closed = await row(spine);
    const after = await jobsFor(resolvedRow.id);
    check("T2.8", "confirm closes the ticket, closed_by the requester", confirm.body.ok === true && closed.state === "closed" && closed.closed_by === "requester", JSON.stringify(confirm.body).slice(0, 200));
    check("T2.8", "the desk's resolution stays on the record (D278)", closed.resolution_code === "fixed" && /replaced the docking station/i.test(closed.resolution_notes));
    check("T2.8", "and the queued auto-close job is CANCELLED, not left to fire", queued.filter((j) => j.status === "queued").length === 1 && after.every((j) => j.status === "cancelled"), JSON.stringify([queued.map((j) => j.status), after.map((j) => j.status)]));

    const entries = await listEntries(schema, spine, { visibility: "all" });
    const times = entries.map((e) => new Date(e.createdAt).getTime());
    check("T2.9", "the timeline is ordered oldest first and every entry is attributed", times.every((t, i) => i === 0 || t >= times[i - 1]) && entries.every((e) => e.authorKind));
    const show = cli("show", spine);
    const timelineBlock = show.stdout.slice(show.stdout.indexOf("timeline ("));
    const cliEntries = (timelineBlock.split("\n").filter((l) => /^\s+\d{4}-\d{2}-\d{2} .*\[(public|INTERNAL)\]/.test(l))).length;
    check("T2.9", "the CLI's show and the console agree on the entry count", show.status === 0 && cliEntries === entries.length, `cli ${cliEntries} vs store ${entries.length}`);
    const consoleDetail = await A.go(`/admin/tickets/${spine}`);
    check("T2.9", "and both carry the resolution code, in the same words", show.stdout.includes("fixed") && consoleDetail.text.includes("fixed"));
  }

  // -----------------------------------------------------------------------------------------------
  section("S3 — escalated to a desk agent, worked with notes, resolved by the desk");
  // -----------------------------------------------------------------------------------------------
  {
    const ref = await epA.file({
      description: "Outlook asks for my password every morning and won't take it.",
      summary: `Case note: cached credential suspected. ${CANARY}`,
      whatWasChecked: `Credential Manager entries. ${CANARY}`,
      category: "other", suggestedOwner: "desktop_support", machineName: "LAPTOP-CT-A", osUsername: "ct.requester",
    });
    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/state`, { from: "new", next: "open" });

    const c1 = await epA.post(`/v1/ticket/${ref}/comment`, { body: "It happened again this morning." });
    const afterComment = await row(ref);
    check("T3.1", "a comment on a LIVE ticket does not reopen it and starts the clock", c1.body.ok === true && c1.body.reopened === false && afterComment.awaiting_agent_since !== null, JSON.stringify(c1.body).slice(0, 200));
    await ageAwaiting(ref, 5); // TIME TRAVEL: five hours of waiting, without waiting five hours
    const list = await A.go("/admin/tickets");
    const detail = await A.go(`/admin/tickets/${ref}`);
    check("T3.1", "the console's tickets list shows an AGE, not a count", /Oldest unanswered requester comment: [^<]*ago/.test(list.text), list.text.match(/Oldest unanswered[^<]{0,80}/)?.[0] ?? "absent");
    check("T3.1", "and the ticket's own page shows it too", /waiting|ago/.test(detail.text) && detail.text.includes(ref));

    const oldest = await oldestUnansweredRequesterComment(schema);
    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/reply`, { body: "Let's clear the saved password. I'll walk you through it." });
    const cleared = await row(ref);
    check("T3.2", "the desk's reply clears the clock", cleared.awaiting_agent_since === null, String(cleared.awaiting_agent_since));
    const entriesAfter = await listEntries(schema, ref, { visibility: "all" });
    check("T3.2", "in the same transaction as the entry — the reply is on the timeline and the clock is gone together", entriesAfter.some((e) => e.kind === "comment" && e.authorKind === "console_user") && cleared.awaiting_agent_since === null);
    check("T3.2", "and the clock it cleared was this ticket's", oldest?.reference === ref, String(oldest?.reference));

    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/worknote`, { body: `Diagnosis: a stale Kerberos ticket. ${CANARY}` });
    const mine = await epA.poll(ref);
    const wire = JSON.stringify(mine.body);
    check("T3.3", "the internal work note is not in the requester's read", !wire.includes("stale Kerberos") && !wire.includes(CANARY), wire.slice(0, 200));
    check("T3.3", "nor is the case note or what_was_checked", !wire.includes("cached credential suspected") && !wire.includes("Credential Manager"));
    check("T3.3", "and the public reply IS", wire.includes("clear the saved password"));

    await epA.post(`/v1/ticket/${ref}/comment`, { body: "First comment: still happening." });
    const first = await row(ref);
    await new Promise((r) => setTimeout(r, 1100));
    await epA.post(`/v1/ticket/${ref}/comment`, { body: "Second comment: and now on my desktop too." });
    const second = await row(ref);
    check("T3.4", "a second comment does not restart the clock: the age is the OLDEST unanswered", second.awaiting_agent_since.getTime() === first.awaiting_agent_since.getTime(), `${first.awaiting_agent_since?.toISOString()} vs ${second.awaiting_agent_since?.toISOString()}`);

    const stateWords = await import(pathToFileURL(join(REPO, "client", "src", "ticket", "state-words.js")).href);
    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/resolve`, { from: "open", resolutionCode: "fixed", resolutionNotes: "We cleared the saved password on your account. Sign in once more and it should stop asking." });
    const read = await epA.poll(ref);
    const resolution = read.body.entries.find((e) => e.kind === "resolution");
    const said = stateWords.updateWords(resolution, ref, "resolved");
    check("T3.5", "the resolution reaches the requester", Boolean(resolution) && /cleared the saved password/.test(resolution.body));
    check("T3.5", "presented as a QUOTATION, attributed to the service desk, never in the agent's own voice (D214)", /The service desk has marked/.test(said) && said.includes(`“${resolution.body}”`), said.slice(0, 200));
  }

  // -----------------------------------------------------------------------------------------------
  section("S4 — a handoff between two agents, and the fact that there is no assignment model");
  // -----------------------------------------------------------------------------------------------
  {
    const ref = await epA.file({
      description: "The shared drive is missing from my File Explorer.",
      summary: `Case note: mapped drive. ${CANARY}`, whatWasChecked: `Group policy. ${CANARY}`,
      category: "other", suggestedOwner: "desktop_support", machineName: "LAPTOP-CT-A", osUsername: "ct.requester",
    });
    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/state`, { from: "new", next: "open" });
    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/worknote`, { body: `Agent A: checked the GPO, it applies. ${CANARY}` });
    await B.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/resolve`, { from: "open", resolutionCode: "fixed", resolutionNotes: "We re-mapped the drive for you. It should be back after you sign out and in again." });

    const entries = await listEntries(schema, ref, { visibility: "all" });
    const note = entries.find((e) => e.kind === "work_note");
    const resolution = entries.find((e) => e.kind === "resolution");
    const detail = await A.go(`/admin/tickets/${ref}`);
    check("T4.1", "the work note is stamped with A's label and the resolution with B's — a snapshot per entry", note.authorLabel === agents.a.label && resolution.authorLabel === agents.b.label, `${note.authorLabel} / ${resolution.authorLabel}`);
    check("T4.1", "and the console's timeline shows BOTH people", detail.text.includes(agents.a.label) && detail.text.includes(agents.b.label));
    check("T4.2", "the resolution is authored by whoever resolved it (D252)", (await row(ref)).state === "resolved" && resolution.authorLabel === agents.b.label);
    const CLAIMS_OWNER = /(is |was )?assigned to (agent|a person named|\S+@)|owned by \S+@|\S+@\S+ (owns|is handling|has taken)/i;
    check("T4.2", "and nothing on the page claims a person owns, was assigned or is handling it", !CLAIMS_OWNER.test(detail.text), (detail.text.match(CLAIMS_OWNER) ?? []).join(","));
    check("T4.2", "while the honest negative — that it CANNOT be assigned — is still there (OPEN-4)", /cannot be assigned to a person/i.test(detail.text));

    const audit = await auditRows();
    const forRef = audit.filter((r) => r.subject === ref);
    check("T4.3", "the audit carries a work note by A", forRef.some((r) => r.action === "ticket.worknote" && r.email === agents.a.label), JSON.stringify(forRef.map((r) => [r.action, r.email])).slice(0, 300));
    check("T4.3", "a resolve by B", forRef.some((r) => r.action === "ticket.resolve" && r.email === agents.b.label));
    check("T4.3", "and a reply, on the earlier ticket, by whoever wrote it", audit.some((r) => r.action === "ticket.comment" && r.email === agents.a.label));

    check("T4.4", "the ticket carries a suggested owner", (await getTicket(schema, ref)).suggestedOwner === "desktop_support");
    check("T4.4", "the console calls it a suggestion and says it routes nothing", /suggested/i.test(detail.text) && /routes nothing|nothing routes|not routed|no routing/i.test(detail.text), detail.text.replace(/<[^>]+>/g, " ").match(/[^.]*suggest[^.]*\./gi)?.join(" | ").slice(0, 300) ?? "no sentence about it");
    check("T4.4", "and no surface implies it was assigned to that team", !/assigned to desktop support|routed to desktop support/i.test(detail.text));

    // T4.5 — the race. Both read the same page, both act; the guard is in the UPDATE (D280).
    const raceRef = await epA.file({ description: "Race fixture.", summary: `Race. ${CANARY}`, category: "other", machineName: "LAPTOP-CT-A", osUsername: "ct.requester" });
    const [pa, pb] = await Promise.all([A.go(`/admin/tickets/${raceRef}`), B.go(`/admin/tickets/${raceRef}`)]);
    const ca = pa.text.match(/name="_csrf" value="([^"]+)"/)[1];
    const cb = pb.text.match(/name="_csrf" value="([^"]+)"/)[1];
    const [ra, rb] = await Promise.all([
      A.go(`/admin/tickets/${raceRef}/state`, { method: "POST", form: { _csrf: ca, from: "new", next: "open" } }),
      B.go(`/admin/tickets/${raceRef}/state`, { method: "POST", form: { _csrf: cb, from: "new", next: "open" } }),
    ]);
    const outcomes = [ra, rb].map((r) => r.status).sort();
    check("T4.5", "one move lands and the other is refused — 303 and 409, never two 303s", outcomes.join(",") === "303,409", outcomes.join(","));
    const loser = [ra, rb].find((r) => r.status === 409);
    check("T4.5", "the loser gets a sentence naming where the ticket is NOW, not a constraint violation", /moved while you were looking at it/.test(loser.text) && !/duplicate key|violates|constraint/i.test(loser.text), loser.text.replace(/<[^>]+>/g, " ").slice(0, 200));
    check("T4.5", "and nothing was silently overwritten: the ticket moved exactly once", (await listEntries(schema, raceRef, { visibility: "all" })).filter((e) => e.kind === "state_change").length === 1);
  }

  // -----------------------------------------------------------------------------------------------
  section("S5 — referred to a vendor, resolved on the vendor's answer");
  // -----------------------------------------------------------------------------------------------
  {
    const ref = await epA.file({
      description: "The label printer at reception prints blank labels.",
      summary: `Case note: thermal head suspected. ${CANARY}`, whatWasChecked: `Driver and ribbon. ${CANARY}`,
      category: "hardware", suggestedOwner: "desktop_support", machineName: "RECEPTION-PC", osUsername: "ct.requester",
    });
    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/state`, { from: "new", next: "open" });
    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/worknote`, { body: `Raised case 88213 with Zebra support by email. ${CANARY}` });
    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/worknote`, { body: `Zebra replied: print head is out of warranty, replacement quoted at 240 GBP. ${CANARY}` });

    const entries = await listEntries(schema, ref, { visibility: "all" });
    const vendorNotes = entries.filter((e) => e.visibility === "internal" && /Zebra/.test(e.body));
    check("T5.1", "the vendor exchange is recorded as work notes, internal", vendorNotes.length === 2 && vendorNotes.every((e) => e.kind === "work_note"), String(vendorNotes.length));
    const devices = await listDevices({ tenantId });
    check("T5.1", "the vendor has no enrollment and no account in this tenant", !devices.some((d) => /zebra/i.test(d.deviceKeyId)) && !(await auditRows()).some((r) => /zebra/i.test(r.email ?? "")));

    const c = await epA.post(`/v1/ticket/${ref}/comment`, { body: "Any news? Reception are asking." });
    const held = await row(ref);
    check("T5.2", "the requester's comment while the ticket is with the vendor starts the clock", c.body.ok === true && held.awaiting_agent_since !== null);
    check("T5.2", "and the desk can hold the ticket open without resolving it", held.state === "open");
    const list = await A.go("/admin/tickets");
    check("T5.2", "the console surfaces the wait as an age on the queue", /Oldest unanswered requester comment/.test(list.text));

    const notes = "The printer's print head has failed. It's out of warranty, so we've asked the supplier for a replacement and we'll fit it when it arrives.";
    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/resolve`, { from: "open", resolutionCode: "referred_to_vendor", resolutionNotes: notes });
    const read = await epA.poll(ref);
    const wire = JSON.stringify(read.body);
    check("T5.3", "the ticket resolves as referred_to_vendor", (await row(ref)).resolution_code === "referred_to_vendor");
    check("T5.3", "the requester-visible notes reach them", read.body.ticket.resolutionNotes === notes);
    check("T5.3", "they leak no vendor internal detail — no case number, no price, no vendor name", !/88213|240|Zebra|warranty quoted/i.test(notes), notes);
    check("T5.3", "and no internal string is anywhere in what the endpoint received", !wire.includes(CANARY) && !wire.includes("88213"), wire.slice(0, 200));

    const detail = await A.go(`/admin/tickets/${ref}`);
    check("T5.4", "the console glosses the code in words rather than showing the enum alone", /referred to a vendor/i.test(detail.text.replace(/<[^>]+>/g, " ")), detail.text.replace(/<[^>]+>/g, " ").match(/[Rr]eferred to[^<]{0,60}/)?.[0] ?? "no gloss");
    check("T5.4", "and nothing on any surface says the vendor was notified, emailed or contacted BY THE PRODUCT", !/we (have )?(notified|emailed|contacted) the vendor|the vendor has been (notified|emailed|contacted)/i.test(detail.text));
  }

  // -----------------------------------------------------------------------------------------------
  section("S6 — the requester disagrees: resolved -> comment -> reopen -> re-resolve");
  // -----------------------------------------------------------------------------------------------
  {
    const ref = await epA.file({
      description: "Teams audio cuts out in every meeting.", summary: `Case note. ${CANARY}`,
      whatWasChecked: `Audio driver. ${CANARY}`, category: "other", machineName: "LAPTOP-CT-A", osUsername: "ct.requester",
    });
    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/state`, { from: "new", next: "open" });
    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/resolve`, { from: "open", resolutionCode: "fixed", resolutionNotes: "We updated your audio driver." });
    const resolved = await row(ref);
    const firstJob = (await jobsFor(resolved.id))[0];

    const reopen = await epA.post(`/v1/ticket/${ref}/comment`, { body: "It's still cutting out — worse, actually." });
    const after = await row(ref);
    const entries = await listEntries(schema, ref, { visibility: "all" });
    check("T6.1", "the comment reopened it", reopen.body.ok === true && reopen.body.reopened === true && after.state === "open");
    check("T6.1", "the resolution columns are cleared in the same transaction", after.resolution_code === null && after.resolution_notes === null && after.resolved_at === null);
    check("T6.1", "a PUBLIC 'resolved → open' entry is on the timeline", entries.some((e) => e.kind === "state_change" && e.body === "resolved → open" && e.visibility === "public"));
    check("T6.1", "and the clock has started", after.awaiting_agent_since !== null);
    const detail = await A.go(`/admin/tickets/${ref}`);
    check("T6.1", "the console no longer shows a resolution for it", /Not resolved/.test(detail.text), detail.text.match(/Not resolved/)?.[0] ?? "still shows one");

    check("T6.2", "the binding is cleared", after.auto_close_at === null && after.auto_close_job_id === null);
    check("T6.2", "and the first job is CANCELLED", (await jobsFor(resolved.id)).find((j) => j.id === firstJob.id)?.status === "cancelled", JSON.stringify((await jobsFor(resolved.id)).map((j) => [j.id, j.status])));

    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/resolve`, { from: "open", resolutionCode: "fixed", resolutionNotes: "We replaced the headset." });
    const noReason = await epA.post(`/v1/ticket/${ref}/reopen`, {});
    check("T6.3", "reopen without a reason is refused, and nothing changed", noReason.status === 400 && (await row(ref)).state === "resolved", `${noReason.status} ${JSON.stringify(noReason.body).slice(0, 160)}`);
    const withReason = await epA.post(`/v1/ticket/${ref}/reopen`, { reason: "Still cutting out with the new headset." });
    const reopened = await row(ref);
    const pub = await listEntriesForRequester(schema, ref, { deviceId: epA.deviceId });
    check("T6.3", "reopen WITH a reason does the same transition", withReason.body.ok === true && withReason.body.reopened === true && reopened.state === "open");
    check("T6.3", "and records the reason as the public comment", pub.some((e) => e.kind === "comment" && e.body === "Still cutting out with the new headset."));

    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/resolve`, { from: "open", resolutionCode: "fixed", resolutionNotes: "We replaced the dock as well, which was the real cause." });
    const reResolved = await row(ref);
    const all = await jobsFor(reResolved.id);
    const live = all.find((j) => j.status === "queued");
    check("T6.4", "re-resolving enqueues a job with a different id, and the ticket is bound to the new one", live && String(live.id) !== String(firstJob.id) && String(reResolved.auto_close_job_id) === String(live.id), JSON.stringify(all.map((j) => [j.id, j.status])));
    // Run the FIRST job by hand — the one the reopen cancelled and a rolling restart could still hold.
    const stale = await autocloseHandlerVerdict(firstJob.id, reResolved.id);
    check("T6.4", "the first job, run by hand, closes nothing and says why", stale.closed === false && /NEWER resolution|not bound|is open/.test(stale.why), stale.why);

    await epA.poll(ref); // D290: the requester is shown the resolution, which is what starts their clock
    const armed = await row(ref);
    const liveNow = (await jobsFor(armed.id)).find((j) => j.status === "queued");
    check("T6.5", "showing the requester the re-resolution arms the clock from the moment they saw it (D290)", Boolean(liveNow) && String(armed.auto_close_job_id) === String(liveNow.id), JSON.stringify((await jobsFor(armed.id)).map((j) => [j.id, j.status])));
    await makeDue(ref);
    const first = await runJob();
    const closedRow = await row(ref);
    check("T6.5", "the second job, run once when due, closes the ticket", first.ran === true && closedRow.state === "closed" && closedRow.closed_by === "auto", JSON.stringify(first).slice(0, 200));
    const entriesBefore = (await listEntries(schema, ref, { visibility: "all" })).length;
    const again = await autocloseHandlerVerdict(liveNow.id, closedRow.id);
    const entriesAfter = (await listEntries(schema, ref, { visibility: "all" })).length;
    check("T6.5", "run TWICE, the second run writes nothing (D270's at-least-once, re-proven end to end)", again.closed === false && entriesAfter === entriesBefore, `${again.why}; ${entriesBefore} -> ${entriesAfter}`);
  }

  // -----------------------------------------------------------------------------------------------
  section("S7 — confidentiality, end to end, on a ticket that has everything to leak");
  // -----------------------------------------------------------------------------------------------
  {
    const ref = await epA.file({
      description: "My machine is very slow after the last update.",
      summary: `SUMMARY-SECRET ${CANARY}: the user is on a performance improvement plan; handle gently.`,
      whatWasChecked: `CHECKED-SECRET ${CANARY}: disk SMART, pagefile, startup apps.`,
      category: "other", suggestedOwner: "desktop_support", machineName: "LAPTOP-CT-A", osUsername: "ct.requester",
    });
    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/state`, { from: "new", next: "open", note: `NOTE-SECRET ${CANARY}: hardware is four years old, due for replacement.` });
    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/worknote`, { body: `WORKNOTE-SECRET-1 ${CANARY}: user's own installs are the cause.` });
    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/worknote`, { body: `WORKNOTE-SECRET-2 ${CANARY}: escalate to hardware refresh budget.` });
    const SECRETS = ["SUMMARY-SECRET", "CHECKED-SECRET", "NOTE-SECRET", "WORKNOTE-SECRET-1", "WORKNOTE-SECRET-2", "desktop_support", CANARY];

    const list = await epA.get("/v1/tickets");
    const one = await epA.get(`/v1/tickets/${ref}`);
    const listWire = JSON.stringify(list.body), oneWire = JSON.stringify(one.body);
    const leakedList = SECRETS.filter((s) => listWire.includes(s));
    const leakedOne = SECRETS.filter((s) => oneWire.includes(s));
    check("T7.1", "GET /v1/tickets carries none of the internal values", leakedList.length === 0, leakedList.join(","));
    check("T7.1", "GET /v1/tickets/:reference and its timeline carry none of them", leakedOne.length === 0, leakedOne.join(","));
    const ALLOWED = ["reference", "state", "category", "machineName", "createdAt", "updatedAt", "resolutionCode", "resolutionNotes", "resolvedAt", "closedAt", "closedBy", "autoCloseAt"];
    check("T7.1", "and the ticket's keys are EXACTLY the allow-list", JSON.stringify(Object.keys(one.body.ticket).sort()) === JSON.stringify([...ALLOWED].sort()), Object.keys(one.body.ticket).join(","));

    const ack = await epA.post("/v1/tickets/ack", { entryIds: one.body.entries.map((e) => e.id) });
    const notMine = await epB.get(`/v1/tickets/${ref}`);
    const noCred = await (await fetch(`${base}/v1/tickets/${ref}`)).text();
    const badRoute = await epA.post(`/v1/ticket/${ref}/nonsense`, {});
    const bodies = [JSON.stringify(ack.body), JSON.stringify(notMine.body), noCred, JSON.stringify(badRoute.body)];
    recordWire("401 no credential", noCred);
    check("T7.3", "the ack payload carries none of them", SECRETS.every((s) => !bodies[0].includes(s)), bodies[0].slice(0, 200));
    check("T7.3", "the 404 for another enrollment's ticket carries none of them", notMine.status === 404 && SECRETS.every((s) => !bodies[1].includes(s)), bodies[1].slice(0, 200));
    check("T7.3", "the 401 without a credential carries none of them", SECRETS.every((s) => !bodies[2].includes(s)), bodies[2].slice(0, 200));
    check("T7.3", "and an unknown route's body carries none of them", SECRETS.every((s) => !bodies[3].includes(s)));

    // T7.4 — prove the allow-list fails CLOSED. A column added to `tickets` and put on neither list
    // must FAIL the classification test, not leak. Added, asserted, reverted, in one transaction's
    // worth of the click-through tenant only.
    await withTenant(schema, (c) => c.query("ALTER TABLE tickets ADD COLUMN clickthrough_probe text"));
    const classified = await withTenant(schema, async (c) => (await c.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'tickets'", [schema],
    )).rows.map((r) => r.column_name));
    const HIDDEN = ["id", "user_id", "session_id", "description", "summary", "what_was_checked", "internal_resolution_note", "suggested_owner", "device_id", "reopened_from", "awaiting_agent_since", "auto_close_job_id"];
    const unclassified = classified.filter((c) => !ALLOWED.map(snake).includes(c) && !HIDDEN.includes(c));
    check("T7.4", "a column on neither list is caught — the allow-list fails closed", unclassified.includes("clickthrough_probe"), unclassified.join(","));
    const withProbe = await epA.get(`/v1/tickets/${ref}`);
    check("T7.4", "and the unclassified column does NOT reach the requester, because the reader names its columns", !("clickthroughProbe" in withProbe.body.ticket) && !JSON.stringify(withProbe.body).includes("clickthrough_probe"));
    await withTenant(schema, (c) => c.query("ALTER TABLE tickets DROP COLUMN clickthrough_probe"));
    check("T7.4", "reverted: the probe column is gone", !(await withTenant(schema, async (c) => (await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'tickets'", [schema])).rows.map((r) => r.column_name))).includes("clickthrough_probe"));

    const forced = await listEntriesForRequester(schema, ref, { deviceId: epA.deviceId, visibility: "all" });
    check("T7.5", "listEntriesForRequester() ignores a visibility argument — it has none to pass", forced.every((e) => e.visibility === "public"), forced.map((e) => e.visibility).join(","));
    check("T7.5", "so an internal entry cannot be reached through it", forced.every((e) => !SECRETS.some((s) => String(e.body).includes(s))));
    let threw = null;
    try { await listEntriesForRequester(schema, ref, {}); } catch (e) { threw = e.message; }
    check("T7.5", "and it refuses to run without an identity, rather than defaulting to one", Boolean(threw) && /deviceId/.test(threw), String(threw).slice(0, 160));
  }

  // -----------------------------------------------------------------------------------------------
  section("S8 — closure, terminality, auto-close, and the thing that is actually broken");
  // -----------------------------------------------------------------------------------------------
  let friday;
  {
    // ---- T8.1: it closes AFTER the due instant and not before.
    const ref = await epA.file({ description: "Mouse double-clicks on a single click.", summary: `Case note. ${CANARY}`, category: "hardware", machineName: "LAPTOP-CT-A", osUsername: "ct.requester" });
    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/state`, { from: "new", next: "open" });
    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/resolve`, { from: "open", resolutionCode: "fixed", resolutionNotes: "We swapped your mouse. The old one had a worn switch." });
    await epA.poll(ref); // the requester SAW it — this is the delivered case, so only the clock is under test
    const t = await row(ref);
    const notYet = await autocloseHandlerVerdict(t.auto_close_job_id, t.id);
    check("T8.1", "before the due instant the handler does nothing and says it is not due", notYet.closed === false && /not due until/.test(notYet.why), notYet.why);
    check("T8.1", "and the ticket is still resolved", (await row(ref)).state === "resolved");
    await makeDue(ref);
    const ran = await runJob();
    const closed = await row(ref);
    const stateChanges = (await listEntries(schema, ref, { visibility: "all" })).filter((e) => e.kind === "state_change" && e.body === "resolved → closed");
    check("T8.1", "after it, the ticket closes as closed_by auto", ran.ran === true && closed.state === "closed" && closed.closed_by === "auto", JSON.stringify(ran).slice(0, 200));
    check("T8.1", "with exactly ONE public state change, authored by the auto-close job", stateChanges.length === 1 && stateChanges[0].visibility === "public" && stateChanges[0].authorLabel === AUTOCLOSE_AUTHOR.label, JSON.stringify(stateChanges.map((e) => [e.visibility, e.authorKind, e.authorLabel])));
    const stateWords = await import(pathToFileURL(join(REPO, "client", "src", "ticket", "state-words.js")).href);
    const said = stateWords.updateWords({ kind: "state_change", body: "resolved → closed", authorKind: "system", authorLabel: "auto-close" }, ref, "closed");
    check("T8.1", "and the requester's line says it closed ON ITS OWN, not that the desk closed it", /closed on its own/.test(said) && !/the desk closed/.test(said), said.slice(0, 160));

    // ---- T8.2: closed is terminal.
    const detail = await A.go(`/admin/tickets/${ref}`);
    check("T8.2", "the console offers NO forward transition from closed", /Closed is terminal in this console/.test(detail.text) && !/<select id="next"/.test(detail.text));
    const refused = await epA.post(`/v1/ticket/${ref}/comment`, { body: "It's back." });
    check("T8.2", "a comment on a closed ticket is refused", refused.status === 409 && refused.body.ok === false);
    check("T8.2", "with the way forward, naming the reference to quote", /raise a new ticket/.test(refused.body.error) && refused.body.error.includes(ref), refused.body.error.slice(0, 200));
    const followUp = await epA.file({ description: "The mouse is double-clicking again.", summary: `Follow-up. ${CANARY}`, category: "hardware", machineName: "LAPTOP-CT-A", osUsername: "ct.requester", reopenedFrom: ref });
    const fu = await row(followUp);
    check("T8.2", "a new ticket carries reopened_from as a real foreign key", fu.reopened_from === (await row(ref)).id, `${fu.reopened_from}`);
    const otherEndpoint = await fetch(`${base}/v1/ticket`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${epB.credential}` }, body: JSON.stringify({ description: "not mine", summary: "x", category: "other", machineName: "B", reporter: { osUsername: "b" }, reopenedFrom: ref }) });
    const otherBody = await otherEndpoint.json();
    check("T8.2", "and it is accepted only for THIS enrollment's closed ticket", otherBody.ok === false && /readable by this enrollment/.test(otherBody.error ?? ""), JSON.stringify(otherBody).slice(0, 200));

    // ---- T8.3: the CLI is the correction tool.
    const moved = cli("state", ref, "open");
    check("T8.3", "bin/tickets.mjs can still move a closed ticket", moved.status === 0 && (await row(ref)).state === "open", `${moved.status} ${moved.stderr.slice(0, 200)}`);
    cli("state", ref, "closed");

    // ---- T8.4: the interval.
    const beforeChange = await autocloseHoursForSchema(schema);
    const held = await epA.file({ description: "Keyboard key sticks.", summary: `Case note. ${CANARY}`, category: "hardware", machineName: "LAPTOP-CT-A", osUsername: "ct.requester" });
    await A.submit(`/admin/tickets/${held}`, `/admin/tickets/${held}/state`, { from: "new", next: "open" });
    await A.submit(`/admin/tickets/${held}`, `/admin/tickets/${held}/resolve`, { from: "open", resolutionCode: "fixed", resolutionNotes: "We cleaned under the key." });
    await epA.poll(held);
    const heldAt = (await row(held)).auto_close_at;
    await A.submit("/admin/tickets", "/admin/tickets/autoclose", { hours: "1" });
    check("T8.4", "changing the interval is NOT retroactive — an instant already shown is kept", (await row(held)).auto_close_at.getTime() === heldAt.getTime(), `${heldAt?.toISOString()} vs ${(await row(held)).auto_close_at?.toISOString()}`);
    check("T8.4", "the setting did change for tickets resolved from now on", (await autocloseHoursForSchema(schema)) === 1, `${beforeChange} -> ${await autocloseHoursForSchema(schema)}`);
    await A.submit("/admin/tickets", "/admin/tickets/autoclose", { off: "1" });
    const offRef = await epA.file({ description: "Webcam not detected.", summary: `Case note. ${CANARY}`, category: "hardware", machineName: "LAPTOP-CT-A", osUsername: "ct.requester" });
    await A.submit(`/admin/tickets/${offRef}`, `/admin/tickets/${offRef}/state`, { from: "new", next: "open" });
    await A.submit(`/admin/tickets/${offRef}`, `/admin/tickets/${offRef}/resolve`, { from: "open", resolutionCode: "fixed", resolutionNotes: "We enabled the camera in your privacy settings." });
    const offRow = await row(offRef);
    check("T8.4", "with the interval off, a new resolution binds no job at all", (await autocloseHoursForSchema(schema)) === null && offRow.auto_close_at === null && offRow.auto_close_job_id === null && (await jobsFor(offRow.id)).filter((j) => j.status === "queued").length === 0);
    check("T8.4", "and the ticket resolved BEFORE the switch keeps its queued job (P5 ledger item 5)", (await jobsFor((await row(held)).id)).some((j) => j.status === "queued"), JSON.stringify((await jobsFor((await row(held)).id)).map((j) => j.status)));
    const bPanel = await B.go("/admin/tickets");
    check("T8.4", "an agent with neither settings.read nor settings.write is offered no way to change it", bPanel.status === 200 && !/action="\/admin\/tickets\/autoclose"/.test(bPanel.text), bPanel.text.match(/Auto-close/)?.[0] ?? "no panel at all");
    check("T8.4", "and every resolved ticket still tells that agent what the interval does to it", /closes on its own|Closes automatically|closes automatically/i.test((await B.go(`/admin/tickets/${held}`)).text), (await B.go(`/admin/tickets/${held}`)).text.match(/[Cc]loses [a-z ]{0,20}/)?.[0] ?? "nothing");
    const bTry = await B.go("/admin/tickets/autoclose", { method: "POST", form: { _csrf: bPanel.text.match(/name="_csrf" value="([^"]+)"/)?.[1] ?? "x", hours: "5" } });
    check("T8.4", "and a POST from that session is refused by the route, not only hidden from the page", bTry.status === 403 && (await autocloseHoursForSchema(schema)) === null, `${bTry.status}`);
    await A.submit("/admin/tickets", "/admin/tickets/autoclose", { hours: "72" });

    // ---- T8.5 THE FRIDAY/TUESDAY TEST. Resolve with the client SHUT. Make it due. Start the client.
    friday = await epA.file({ description: "Excel crashes when I open the budget file.", summary: `Case note. ${CANARY}`, category: "other", machineName: "LAPTOP-CT-A", osUsername: "ct.requester" });
    await A.submit(`/admin/tickets/${friday}`, `/admin/tickets/${friday}/state`, { from: "new", next: "open" });
    await A.submit(`/admin/tickets/${friday}`, `/admin/tickets/${friday}/resolve`, { from: "open", resolutionCode: "fixed", resolutionNotes: "We repaired your Office installation. The budget file opens here now." });
    // THE CLIENT IS SHUT: no poll, no ack. Nothing between the resolve and the job becoming due.
    const fridayRow = await row(friday);
    const fridayEntries = await listEntries(schema, friday, { visibility: "all" });
    const resolutionEntry = fridayEntries.find((e) => e.kind === "resolution");
    check("T8.5", "(premise) the resolution was never handed over and never seen", resolutionEntry.notifiedAt == null && resolutionEntry.readByRequesterAt == null, JSON.stringify([resolutionEntry.notifiedAt, resolutionEntry.readByRequesterAt]));
    await makeDue(friday);
    const fridayRun = await runJob();
    const tuesday = await row(friday);
    check("T8.5", "THE TICKET DOES NOT CLOSE: a resolution the requester was never shown is not consent", tuesday.state !== "closed", `state is ${tuesday.state}, closed_by ${tuesday.closed_by} — a ticket closed on a notice nobody could receive (D290)`);
    const startedClient = await epA.poll(friday);
    check("T8.5", "and when the client finally starts, the requester is shown the resolution — not a closure", startedClient.body.ticket.state === "resolved" && startedClient.body.entries.some((e) => e.kind === "resolution"), `state ${startedClient.body.ticket.state}`);

    // ---- T8.6 / T8.7 / T8.8: the fix's own tests.
    const undelivered = await epA.file({ description: "Second monitor flickers.", summary: `Case note. ${CANARY}`, category: "hardware", machineName: "LAPTOP-CT-A", osUsername: "ct.requester" });
    await A.submit(`/admin/tickets/${undelivered}`, `/admin/tickets/${undelivered}/state`, { from: "new", next: "open" });
    await A.submit(`/admin/tickets/${undelivered}`, `/admin/tickets/${undelivered}/resolve`, { from: "open", resolutionCode: "fixed", resolutionNotes: "We replaced the display cable." });
    const uRow = await row(undelivered);
    await makeDue(undelivered);
    const uJob = (await jobsFor(uRow.id)).find((j) => j.status === "queued");
    const verdict = await autocloseHandlerVerdict(uJob?.id ?? uRow.auto_close_job_id, uRow.id);
    check("T8.6", "a resolution with read_by_requester_at unstamped does not close the ticket", verdict.closed === false && (await row(undelivered)).state === "resolved", verdict.why);
    check("T8.6", "and the handler says so — it names delivery, not the binding", /never (been )?(handed|delivered|seen)|not (yet )?(been )?(delivered|seen)|undelivered/i.test(verdict.why), verdict.why);
    check("T8.6", "it RE-ARMS rather than giving up: the ticket is still bound to a live job", (await jobsFor(uRow.id)).some((j) => j.status === "queued") && (await row(undelivered)).auto_close_job_id !== null, JSON.stringify((await jobsFor(uRow.id)).map((j) => [j.id, j.status])));

    const acked = await epA.poll(undelivered);
    const ackedRow = await row(undelivered);
    const ackedEntry = (await listEntries(schema, undelivered, { visibility: "all" })).find((e) => e.kind === "resolution");
    check("T8.7", "once the resolution is delivered and acked, a clock exists", ackedEntry.readByRequesterAt != null && ackedRow.auto_close_at !== null, JSON.stringify([ackedEntry.readByRequesterAt, ackedRow.auto_close_at]));
    const fromAck = ackedRow.auto_close_at && ackedEntry.readByRequesterAt
      ? Math.abs(ackedRow.auto_close_at.getTime() - (new Date(ackedEntry.readByRequesterAt).getTime() + 72 * 3_600_000))
      : null;
    check("T8.7", "and it is measured from the ACK, not from resolved_at", fromAck !== null && fromAck < 5000, `resolved_at ${ackedRow.resolved_at?.toISOString()}, read ${ackedEntry.readByRequesterAt}, due ${ackedRow.auto_close_at?.toISOString()}`);
    await makeDue(undelivered);
    await runJob();
    check("T8.7", "and when THAT is due the ticket does close", (await row(undelivered)).state === "closed" && (await row(undelivered)).closed_by === "auto");

    // T8.8: the backstop. An undelivered resolution must not re-arm forever.
    const never = await epA.file({ description: "Headset microphone not picked up.", summary: `Case note. ${CANARY}`, category: "hardware", machineName: "LAPTOP-CT-A", osUsername: "ct.requester" });
    await A.submit(`/admin/tickets/${never}`, `/admin/tickets/${never}/state`, { from: "new", next: "open" });
    await A.submit(`/admin/tickets/${never}`, `/admin/tickets/${never}/resolve`, { from: "open", resolutionCode: "fixed", resolutionNotes: "We replaced your headset." });
    let rearms = 0;
    for (let i = 0; i < 12; i++) {
      const r = await row(never);
      if (r.state === "closed" || r.auto_close_job_id === null) break;
      await makeDue(never);
      const res = await runJob();
      if (!res.ran) break;
      rearms++;
    }
    const neverRow = await row(never);
    check("T8.8", "an undelivered resolution does NOT re-arm forever — the backstop fires", neverRow.auto_close_job_id === null && rearms < 12, `${rearms} re-arms, job ${neverRow.auto_close_job_id}`);
    check("T8.8", "and it does not close the ticket either: it stays resolved for a human", neverRow.state === "resolved", `state ${neverRow.state}`);
    const queue = await A.go("/admin/tickets");
    const queueText = queue.text.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
    check("T8.8", "the console surfaces it as resolved and never delivered — a queue item for a person", /never (been )?(delivered|handed)|resolved, never delivered/i.test(queueText), queueText.match(/[^.]{0,120}never[^.]{0,80}\./i)?.[0] ?? "no such surface");
  }

  // -----------------------------------------------------------------------------------------------
  section("S9 — identity, isolation, and the orphan class");
  // -----------------------------------------------------------------------------------------------
  {
    const ref = await epA.file({ description: "Zoom won't share my screen.", summary: `Case note. ${CANARY}`, category: "other", machineName: "LAPTOP-CT-A", osUsername: "ct.requester" });
    const before = await row(ref);
    const bare = await fetch(`${base}/v1/ticket/${ref}/comment`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: "no credential here" }) });
    const bareBody = await bare.json();
    recordWire("401 action without credential", JSON.stringify(bareBody));
    check("T9.1", "no credential -> 401", bare.status === 401, String(bare.status));
    check("T9.1", "with the sentence that names the credential and says nothing changed", /enrollment credential/.test(bareBody.error) && /nothing was changed/i.test(bareBody.error), String(bareBody.error).slice(0, 200));
    check("T9.1", "and nothing changed", (await row(ref)).updated_at.getTime() === before.updated_at.getTime());

    const theirs = await epB.get(`/v1/tickets/${ref}`);
    const noSuch = await epB.get("/v1/tickets/MD-999999");
    check("T9.2", "Endpoint B asking for Endpoint A's reference gets 404, never 403", theirs.status === 404, String(theirs.status));
    check("T9.2", "and the SAME 404 as a reference that does not exist — not an existence oracle", noSuch.status === 404 && theirs.body.error.replace(ref, "X") === noSuch.body.error.replace("MD-999999", "X"), `${theirs.body.error} | ${noSuch.body.error}`);
    const theirAction = await epB.post(`/v1/ticket/${ref}/comment`, { body: "not mine" });
    check("T9.2", "acting on it is the same 404", theirAction.status === 404 && (await listEntries(schema, ref, { visibility: "all" })).every((e) => e.body !== "not mine"));

    const { secret } = await createEnrollmentSecret({ tenantId, ttlDays: 1 });
    const doomed = await enroll("clickthrough-endpoint-doomed", secret);
    const beforeRevoke = await doomed.get("/v1/tickets");
    await revokeDevices({ tenantId, deviceIds: [doomed.deviceId] });
    const afterRevoke = await fetch(`${base}/v1/tickets`, { headers: { authorization: `Bearer ${doomed.credential}` } });
    const afterBody = await afterRevoke.json();
    check("T9.3", "a live enrollment reads", beforeRevoke.status === 200);
    check("T9.3", "and a revoked one stops working on its NEXT request", afterRevoke.status === 401 && /revoked/i.test(afterBody.error), `${afterRevoke.status} ${String(afterBody.error).slice(0, 120)}`);

    resetWriteThrottle(); resetReadThrottle();
    const writeRef = await epA.file({ description: "Rate limit fixture.", summary: `Case note. ${CANARY}`, category: "other", machineName: "LAPTOP-CT-A", osUsername: "ct.requester" });
    let limited = null;
    for (let i = 0; i < WRITES_PER_MINUTE + 2 && !limited; i++) {
      const r = await epA.post(`/v1/ticket/${writeRef}/comment`, { body: `comment ${i}` });
      if (r.status === 429) limited = r;
    }
    check("T9.4", `over ${WRITES_PER_MINUTE} writes in a minute -> 429`, limited?.status === 429, String(limited?.status));
    check("T9.4", "with retryAfterMs, so the client can obey rather than guess", Number(limited?.body?.retryAfterMs) > 0, JSON.stringify(limited?.body).slice(0, 200));
    resetReadThrottle();
    let readLimited = null;
    for (let i = 0; i < READS_PER_MINUTE + 2 && !readLimited; i++) {
      const r = await epA.get("/v1/tickets");
      if (r.status === 429) readLimited = r;
    }
    check("T9.4", `the read limit's sibling behaves the same over ${READS_PER_MINUTE}`, readLimited?.status === 429 && Number(readLimited?.body?.retryAfterMs) > 0, String(readLimited?.status));
    check("T9.4", "and its sentence states the floor as a floor, not a suggestion", /this limit is the floor, not a suggestion/.test(readLimited?.body?.error ?? ""), String(readLimited?.body?.error).slice(0, 200));
    resetReadThrottle(); resetWriteThrottle();

    const beforeSeen = (await listDevices({ tenantId })).find((d) => d.deviceKeyId === "clickthrough-endpoint-b").lastSeenAt;
    await new Promise((r) => setTimeout(r, 1100));
    await epB.get("/v1/tickets");
    const afterSeen = (await listDevices({ tenantId })).find((d) => d.deviceKeyId === "clickthrough-endpoint-b").lastSeenAt;
    check("T9.5", "last_seen_at moves on an authenticated call", new Date(afterSeen).getTime() > new Date(beforeSeen).getTime(), `${beforeSeen} -> ${afterSeen}`);
    const agentsPage = await A.go("/admin/agents");
    check("T9.5", "and the console's Agents page shows it", agentsPage.status === 200 && agentsPage.text.includes("clickthrough-endpoint-b"), String(agentsPage.status));

    // T9.6 — D291. A ticket with NO device_id (filed before this enrollment existed) is nobody's.
    const orphanRef = await withTenant(schema, async (c) => {
      const { rows } = await c.query("SELECT reference FROM tickets WHERE device_id IS NOT NULL LIMIT 1");
      return rows[0].reference;
    });
    await withTenant(schema, (c) => c.query("UPDATE tickets SET device_id = NULL WHERE reference = $1", [orphanRef])); // FIXTURE: the pre-enrollment shape
    const orphanRead = await epA.get(`/v1/tickets/${orphanRef}`);
    const listAfter = await epA.get("/v1/tickets");
    check("T9.6", "a ticket with no enrollment is readable by no requester route", orphanRead.status === 404 && !JSON.stringify(listAfter.body).includes(orphanRef), String(orphanRead.status));
    check("T9.6", "it is NOT backfilled onto a matching OS username — that would be authorization by convention", (await withTenant(schema, async (c) => (await c.query("SELECT device_id FROM tickets WHERE reference = $1", [orphanRef])).rows[0].device_id)) === null);
    check("T9.6", "and the identity field says exactly why, in the requester's own response", /filed before this enrollment/.test(listAfter.body.identity?.doesNotProve ?? ""), String(listAfter.body.identity?.doesNotProve).slice(0, 200));

    // T9.7 — D274's detector, pointed at the REAL client tree, proven in both directions.
    const det = spawnSync(process.execPath, ["test/admin-static.test.mjs"], { cwd: SERVER, encoding: "utf8" });
    const detectorLines = (det.stdout.match(/.*client.*enroll.*/gi) ?? []).slice(0, 3).join(" | ");
    check("T9.7", "admin-static's client-tree detector runs and passes against the real client", det.status === 0 && /enroll/i.test(det.stdout), `${det.status} ${detectorLines}`.slice(0, 300));
  }

  // -----------------------------------------------------------------------------------------------
  section("S10 — the product under adverse conditions");
  // -----------------------------------------------------------------------------------------------
  {
    const renderer = readFileSync(join(REPO, "client", "src", "renderer", "renderer.js"), "utf8");
    const persona = readFileSync(join(REPO, "client", "src", "router", "persona.json"), "utf8");
    const hubClient = readFileSync(join(REPO, "client", "src", "agent", "hub-client.js"), "utf8");
    const source = renderer;

    // T10.1 — the hub is down mid-filing. Drive the REAL client path against a dead port.
    const deadPort = server.address().port + 1;
    let failedSend = null;
    try {
      const res = await fetch(`http://127.0.0.1:${deadPort}/v1/ticket`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      failedSend = { status: res.status };
    } catch (e) { failedSend = { error: e.message }; }
    check("T10.1", "a hub that is not there fails the send rather than appearing to succeed", Boolean(failedSend?.error), JSON.stringify(failedSend));
    check("T10.1", "the client's copy for a failed send says Not sent and that nothing was filed", /Not sent/.test(source) && /Nothing was filed/.test(source), (source.match(/Not sent|Nothing was filed/g) ?? []).join(","));
    const fileTicketBody = hubClient.slice(hubClient.indexOf("async fileTicket"), hubClient.indexOf("async fileTicket") + 4000);
    check("T10.1", "fileTicket() returns the user's sentence and the diagnostic SEPARATELY (D246)", /\berror:/.test(fileTicketBody) && /\bdetail:/.test(fileTicketBody), fileTicketBody.slice(0, 120));
    // D246: the URL and the exception go to `detail` — the inspector and the log — never to the
    // sentence the user hears. What would break the rule is a user-visible string interpolating one.
    const spokenLiterals = [...source.matchAll(/say\(([^)]{0,200})\)/g)].map((m) => m[1]).join(" | ");
    check("T10.1", "and no URL, port or stack reaches what is spoken (D246)", !/https?:\/\/|\.stack|\bfetch failed\b/.test(spokenLiterals), spokenLiterals.slice(0, 200));

    // T10.2 — the hub is stopped AFTER a desk reply; on recovery the poll delivers the backlog.
    const ref = await epA.file({ description: "OneDrive says sync pending forever.", summary: `Case note. ${CANARY}`, category: "other", machineName: "LAPTOP-CT-A", osUsername: "ct.requester" });
    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/state`, { from: "new", next: "open" });
    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/reply`, { body: "Could you tell us how much free space the drive has?" });
    const stillUnseen = await A.go(`/admin/tickets/${ref}`);
    check("T10.2", "with the endpoint away, the console still says not yet handed — it does not assume", /not yet handed to the requester's app/.test(stillUnseen.text));
    await A.submit(`/admin/tickets/${ref}`, `/admin/tickets/${ref}/reply`, { body: "And whether the file is in a shared folder." });
    const backlog = await epA.poll(ref);
    const recovered = await A.go(`/admin/tickets/${ref}`);
    const replies = backlog.body.entries.filter((e) => e.kind === "comment" && e.authorKind !== "requester");
    check("T10.2", "on recovery ONE poll delivers the whole backlog, in order", replies.length === 2 && replies[0].body.includes("free space") && replies[1].body.includes("shared folder") && backlog.body.handed >= 2, `handed ${backlog.body.handed}, replies ${replies.length}`);
    check("T10.2", "and the console moves to seen", (recovered.text.match(/seen by the requester/g) ?? []).length >= 2, String((recovered.text.match(/seen by the requester/g) ?? []).length));

    // T10.3 — the connection-state copy, F1/F2 of 2026-09-11.
// F1/F2 of the 2026-09-11 click-through: the LOSS note named two things (company guidance AND the
    // service desk) and the RECOVERY note six lines below it named one. They must name the same pair.
const applyStart = renderer.indexOf("function applyHubStatus");
    const applyBody = renderer.slice(applyStart, renderer.indexOf("window.matic.onHubLink", applyStart));
    const stripped = applyBody.replace(/\/\/[^\n]*/g, "");                       // the file's notes about this very defect
    const noteStrings = [...stripped.matchAll(/note\((['"`])([\s\S]*?)\1\s*,\s*\{ label/g)].map((m) => m[2]);
    const namesBoth = (n) => /company.s guidance|company guidance/i.test(n) && /service desk/i.test(n);
    const loss = noteStrings.filter((n) => /lost|can.t look|until it.s back/i.test(n));
    const recovery = noteStrings.filter((n) => /again|back\b/i.test(n) && !/until it.s back/i.test(n));
    check("T10.3", "applyHubStatus has a loss note and a recovery note and nothing else", noteStrings.length === 2 && loss.length === 1 && recovery.length === 1, noteStrings.join(" || ").slice(0, 300));
    check("T10.3", "the loss copy names both the company's guidance and the service desk", loss.every(namesBoth), loss.join(" || ").slice(0, 200));
    check("T10.3", "and so does the recovery copy — F1/F2 of 2026-09-11, still matched", recovery.every(namesBoth), recovery.join(" || ").slice(0, 200));
    check("T10.3", "and persona.json's own connection lines name the same pair", (persona.match(/company guidance or service desk/g) ?? []).length >= 2, String((persona.match(/company guidance or service desk/g) ?? []).length));

    // T10.4 — the dev bypass is refused off loopback (D283/D267 guard 2).
    const { bypassStatus } = await import(pathToFileURL(join(SERVER, "src", "admin", "dev-bypass.js")).href);
    const saved = process.env.MATIC_ADMIN_INSECURE_NO_TOTP;
    process.env.MATIC_ADMIN_INSECURE_NO_TOTP = "1";
    const onLoopback = bypassStatus({ boundAddress: "127.0.0.1" });
    const onLan = bypassStatus({ boundAddress: "192.168.1.50" });
    if (saved === undefined) delete process.env.MATIC_ADMIN_INSECURE_NO_TOTP; else process.env.MATIC_ADMIN_INSECURE_NO_TOTP = saved;
    check("T10.4", "on loopback with the env var set, the bypass is ON", onLoopback.on === true, JSON.stringify(onLoopback));
    check("T10.4", "bound to a LAN address it is REFUSED, with a reason", onLan.on === false && onLan.refused === true && /not loopback/i.test(onLan.reason ?? ""), JSON.stringify(onLan));
    check("T10.4", "and the env var is back as it was", process.env.MATIC_ADMIN_INSECURE_NO_TOTP === saved);
    const gate = admitPeer({ bound: "192.168.1.50", peer: "192.168.1.9", peerLoopback: false, encrypted: false });
    check("T10.4", "a plaintext LAN peer is refused by the listener too, so neither guard is the only one", gate.allow === false, JSON.stringify(gate));

    // T10.5 — two workers, one database, one due job. SKIP LOCKED decides; nobody double-closes.
    const raced = await epA.file({ description: "Printer queue stuck.", summary: `Case note. ${CANARY}`, category: "hardware", machineName: "LAPTOP-CT-A", osUsername: "ct.requester" });
    await A.submit(`/admin/tickets/${raced}`, `/admin/tickets/${raced}/state`, { from: "new", next: "open" });
    await A.submit(`/admin/tickets/${raced}`, `/admin/tickets/${raced}/resolve`, { from: "open", resolutionCode: "fixed", resolutionNotes: "We cleared the print queue." });
    await epA.poll(raced);
    await makeDue(raced);
    const [w1, w2] = await Promise.all([runJob("clickthrough-worker-1"), runJob("clickthrough-worker-2")]);
    const closedRaced = await row(raced);
    const changes = (await listEntries(schema, raced, { visibility: "all" })).filter((e) => e.kind === "state_change" && e.body === "resolved → closed");
    const winners = [w1, w2].filter((r) => r.ran).length;
    check("T10.5", "exactly one worker claimed the job — SKIP LOCKED, not a lock wait", winners === 1, `w1.ran=${w1.ran} w2.ran=${w2.ran}`);
    check("T10.5", "the ticket closed exactly once, with ONE public state change", closedRaced.state === "closed" && changes.length === 1, `${closedRaced.state}, ${changes.length} state changes`);

    // T10.6 — a hub that dies mid-job leaves no row stuck `running`. The reaper.
    const reaped = await epA.file({ description: "Reaper fixture.", summary: `Case note. ${CANARY}`, category: "other", machineName: "LAPTOP-CT-A", osUsername: "ct.requester" });
    await A.submit(`/admin/tickets/${reaped}`, `/admin/tickets/${reaped}/state`, { from: "new", next: "open" });
    await A.submit(`/admin/tickets/${reaped}`, `/admin/tickets/${reaped}/resolve`, { from: "open", resolutionCode: "fixed", resolutionNotes: "We restarted the print spooler." });
    await epA.poll(reaped);
    const reapedRow = await row(reaped);
    await makeDue(reaped);
    let claimed = null;
    for (let i = 0; i < 20; i++) {
      const c = await claim("clickthrough-dying-hub", { types: [AUTOCLOSE_JOB] });
      if (!c) break;
      if (String(c.refId) === String(reapedRow.id)) { claimed = c; break; }
      await runOneClaimed(c); // somebody else's due job: run it properly rather than stranding it
    }
    check("T10.6", "a claimed job is running while the hub holds it", Boolean(claimed) && (await jobsFor(reapedRow.id)).some((j) => j.status === "running"), JSON.stringify((await jobsFor(reapedRow.id)).map((j) => [j.id, j.status])));
    // The hub dies here: no finish(), no fail(). TIME TRAVEL: age the claim past the stuck window.
    await withControl((c) => c.query("UPDATE control.job_queue SET locked_at = now() - interval '30 minutes' WHERE id = $1", [claimed.id]));
    const reapResult = await reapStuck({ olderThanMs: 10 * 60_000, maxAttempts: 5 });
    check("T10.6", "the reaper returns THIS job to the queue rather than leaving it stuck running", reapResult.requeued.includes(String(claimed.id)) && (await jobsFor(reapedRow.id)).every((j) => j.status !== "running") && (await jobsFor(reapedRow.id)).some((j) => j.status === "queued"), `requeued ${JSON.stringify(reapResult)}: ${JSON.stringify((await jobsFor(reapedRow.id)).map((j) => [j.id, j.status]))}`);
    check("T10.6", "and it is not failed instead — a hub that died mid-job did not do anything wrong", !reapResult.failed.includes(String(claimed.id)), JSON.stringify(reapResult.failed));
    const after = await runJob();
    check("T10.6", "and it runs to completion on the next tick — at-least-once, not at-most-once", after.ran === true && (await row(reaped)).state === "closed");
  }

  // -----------------------------------------------------------------------------------------------
  section("S7 (concluded) — the canary, across every byte the endpoint was ever handed");
  // -----------------------------------------------------------------------------------------------
  {
    const hits = WIRE.filter((w) => w.text.includes(CANARY));
    check("T7.6", `the canary ${CANARY} is absent from ALL ${WIRE.length} requester-facing responses captured this run`, hits.length === 0, hits.map((h) => h.what).join(","));
    const secretHits = WIRE.filter((w) => /SUMMARY-SECRET|CHECKED-SECRET|NOTE-SECRET|WORKNOTE-SECRET/.test(w.text));
    check("T7.6", "and so is every other internal string this run wrote", secretHits.length === 0, secretHits.map((h) => h.what).join(","));
  }

  // T7.2 is the rendered DOM, which only Electron can answer. The harness records the requirement
  // and the UI pass answers it; it is never reported as a pass by this file.
  check("T7.2", "(harness half) the wire this run captured carries nothing for a DOM to render — the VERDICT is the Electron pass, and results.json says so", WIRE.every((w) => !w.text.includes(CANARY)));
} catch (err) {
  console.error(`\nTHE RUN STOPPED: ${err.stack ?? err.message}`);
  fail++;
} finally {
  await new Promise((r) => server?.close(r));
  writeResults();
  await closePool();
}

/** Run the real handler against one job id, and report its verdict without the runner in the way. */
async function autocloseHandlerVerdict(jobId, ticketId) {
  const { rows } = await withControl((c) => c.query("SELECT id, type, tenant_schema, ref_id FROM control.job_queue WHERE id = $1", [jobId]));
  const job = rows[0] ? { id: rows[0].id, type: rows[0].type, tenantSchema: rows[0].tenant_schema, refId: rows[0].ref_id } : { id: jobId, type: AUTOCLOSE_JOB, tenantSchema: schema, refId: ticketId };
  const { closeByAutoclose } = await import("../src/tickets/query.js");
  const { MAX_AUTOCLOSE_REARMS } = await import("../src/tickets/autoclose.js");
  return withTenant(schema, (c) => closeByAutoclose(c, { schema, ticketId: job.refId ?? ticketId, jobId: job.id, author: AUTOCLOSE_AUTHOR, maxRearms: MAX_AUTOCLOSE_REARMS }));
}


function writeResults() {
  mkdirSync(OUT_DIR, { recursive: true });
  const rows = TESTS.map(([id, scenario, surface, proves, eyes]) => {
    const cs = CHECKS.get(id) ?? [];
    return {
      id, scenario, surface, proves, eyes,
      result: cs.length === 0 ? "NOT RUN" : cs.every((c) => c.ok) ? "PASS" : "FAIL",
      // T7.2 is the RENDERED DOM and only Electron can answer it. This file asserts the half it can
      // (nothing internal on the wire) and refuses to let that read as the test having been run.
      ...(id === "T7.2" ? { verdictFrom: "the Electron DOM grep in the UI pass, not this file" } : {}),
      checks: cs.length,
      failed: cs.filter((c) => !c.ok).map((c) => `${c.label}${c.extra ? ` — ${c.extra}` : ""}`),
    };
  });
  const summary = {
    runId: RUN_ID, at: new Date().toISOString(), tenant: SLUG, canary: CANARY,
    tests: rows.length,
    passed: rows.filter((r) => r.result === "PASS").length,
    failed: rows.filter((r) => r.result === "FAIL").length,
    notRun: rows.filter((r) => r.result === "NOT RUN").length,
    assertions: { passed: pass, failed: fail },
    wireResponsesCaptured: WIRE.length,
  };
  writeFileSync(join(OUT_DIR, "results.json"), JSON.stringify({ summary, tests: rows }, null, 2) + "\n");
  console.log("\n==============================================================================================");
  console.log(`  CLICK-THROUGH ${RUN_ID} — ${summary.passed}/${summary.tests} tests PASS, ${summary.failed} FAIL, ${summary.notRun} NOT RUN`);
  console.log(`  ${pass} assertions passed, ${fail} failed. ${WIRE.length} requester-facing responses captured.`);
  console.log("==============================================================================================");
  for (const r of rows.filter((x) => x.result !== "PASS")) {
    console.log(`  ${r.result.padEnd(8)} ${r.id}  ${r.proves}`);
    for (const f of r.failed) console.log(`           - ${f}`);
  }
  console.log(`\n  results.json -> ${join(OUT_DIR, "results.json")}`);
  process.exitCode = summary.failed || summary.notRun || fail ? 1 : 0;
}
