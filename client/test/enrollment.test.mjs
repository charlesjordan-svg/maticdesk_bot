/**
 * Enrollment at startup, and the credential on every request (D282, D285; P3b, 2026-09-12).
 *
 * Headless: a temp userData directory and a fake hub. Nothing here reaches a network.
 *
 * Run: node test/enrollment.test.mjs
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EnrollmentStore, ensureEnrolled, newDeviceKeyId, ENROLLMENT_FILENAME, ENROLL_RETRY_MS } from "../src/agent/enrollment.js";
import { HubClient } from "../src/agent/hub-client.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}
const jsCode = (js) => js.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");

/** A fake hub: records every request; answers /v1/enroll from a script, everything else 200 {ok:true}. */
function fakeHub(script) {
  const sent = [];
  const queue = [...script];
  const fetchImpl = async (url, init) => {
    sent.push({ url, method: init?.method ?? "GET", headers: init?.headers ?? {}, body: init?.body ? JSON.parse(init.body) : null });
    const next = queue.length ? queue.shift() : { status: 200, body: { ok: true } };
    if (next.throws) throw Object.assign(new Error(next.throws), { name: next.name ?? "Error" });
    return { status: next.status, headers: { get: () => null }, json: async () => next.body };
  };
  return { sent, fetchImpl };
}
const CRED = "mdc_" + "A".repeat(43);
const HUB = "http://hub.test";
const dir = mkdtempSync(join(tmpdir(), "matic-enroll-"));
const quiet = () => {};

try {
  console.log("=== 1. the store: a missing file is the normal first run; only known keys survive ===");
  {
    const store = new EnrollmentStore({ dir, onLog: quiet });
    const empty = store.read();
    check("read() on a missing file is an empty record, no throw", empty.credential === null && empty.deviceKeyId === null && !existsSync(store.path));
    store.write({ deviceKeyId: "ep-x", credential: "mdc_y", smuggled: "no" });
    const back = JSON.parse(readFileSync(store.path, "utf8"));
    check("write() persists known keys and DROPS unknown ones (a hand edit cannot smuggle a field)", back.deviceKeyId === "ep-x" && back.credential === "mdc_y" && !("smuggled" in back) && store.path.endsWith(ENROLLMENT_FILENAME));
    rmSync(store.path);
    check("newDeviceKeyId() is opaque and random: ep- plus 32 hex, different every time, and NOT a key", /^ep-[0-9a-f]{32}$/.test(newDeviceKeyId()) && newDeviceKeyId() !== newDeviceKeyId());
  }

  console.log("\n=== 2. ensureEnrolled(): disabled without a secret, one POST otherwise, the credential kept ===");
  {
    const store = new EnrollmentStore({ dir, onLog: quiet });
    const hub = fakeHub([]);
    const off = await ensureEnrolled({ store, hubUrl: HUB, tenant: "devco", secret: "", fetchImpl: hub.fetchImpl });
    check("no secret -> disabled, NOTHING sent, and the why names config.json, the CLI that mints a secret, and D283's loopback/LAN difference", off.state === "disabled" && hub.sent.length === 0 && /config\.json/.test(off.why) && /create-secret/.test(off.why) && /D283/.test(off.why), off.why);

    const first = fakeHub([{ status: 200, body: { ok: true, status: "active", deviceId: "dev-1", credential: CRED, identity: "a per-OS-user enrollment of the software" } }]);
    const logs = [];
    const r1 = await ensureEnrolled({ store, hubUrl: HUB + "/", tenant: "devco", secret: "s3cret", fetchImpl: first.fetchImpl, onLog: (l) => logs.push(l) });
    check("first run -> ONE POST /v1/enroll with the tenant, an ep- device key, the secret and mode standalone", first.sent.length === 1 && first.sent[0].url === `${HUB}/v1/enroll` && first.sent[0].method === "POST" && first.sent[0].body.tenant === "devco" && /^ep-[0-9a-f]{32}$/.test(first.sent[0].body.deviceKeyId) && first.sent[0].body.secret === "s3cret" && first.sent[0].body.mode === "standalone", JSON.stringify(first.sent[0]));
    check("…-> active, with the credential and the device id", r1.state === "active" && r1.credential === CRED && r1.deviceId === "dev-1" && r1.retry === false);
    const onDisk = store.read();
    check("…and the credential, device id, device key, tenant and hub URL are on disk beside the profile", onDisk.credential === CRED && onDisk.deviceId === "dev-1" && onDisk.deviceKeyId === first.sent[0].body.deviceKeyId && onDisk.tenant === "devco" && onDisk.hubUrl === HUB && onDisk.status === "active" && Boolean(onDisk.enrolledAt));
    check("the log says enrolled, names the file, and repeats the hub's identity sentence — and never prints the credential", logs.some((l) => /enrolled with/.test(l) && l.includes(store.path) && /per-OS-user enrollment/.test(l)) && !logs.some((l) => l.includes(CRED)));

    const second = fakeHub([]);
    const r2 = await ensureEnrolled({ store, hubUrl: HUB, tenant: "devco", secret: "s3cret", fetchImpl: second.fetchImpl });
    check("second run -> active from disk, NOTHING sent (enrollment is once)", r2.state === "active" && r2.credential === CRED && second.sent.length === 0);
    const r2b = await ensureEnrolled({ store, hubUrl: HUB, tenant: null, secret: null, fetchImpl: second.sent.length ? null : fakeHub([]).fetchImpl });
    check("…even with the secret removed from config afterwards: the credential on disk is what matters", r2b.state === "active" && r2b.credential === CRED);
    rmSync(store.path);
  }

  console.log("\n=== 3. pending -> approved: the SAME device key is re-submitted and the approval mints the credential ===");
  {
    const store = new EnrollmentStore({ dir, onLog: quiet });
    const hub = fakeHub([
      { status: 202, body: { ok: true, status: "pending", deviceId: "dev-2", requestId: "req-2", why: "awaiting admin approval" } },
      { status: 200, body: { ok: true, status: "active", deviceId: "dev-2", credential: CRED } },
      { status: 200, body: { ok: true, status: "active", deviceId: "dev-2", credential: null, why: "this device already holds a credential" } },
    ]);
    const p = await ensureEnrolled({ store, hubUrl: HUB, tenant: "devco", secret: "s", fetchImpl: hub.fetchImpl });
    check("202 -> pending, retry: true, no credential, the device id and the queue reason kept", p.state === "pending" && p.retry === true && p.credential === null && p.deviceId === "dev-2" && /administrator/.test(p.why) && store.read().status === "pending" && store.read().credential === null);
    const a = await ensureEnrolled({ store, hubUrl: HUB, tenant: "devco", secret: "s", fetchImpl: hub.fetchImpl });
    check("the retry re-submits the SAME device key (the approval was for that key) and the credential arrives", hub.sent[1].body.deviceKeyId === hub.sent[0].body.deviceKeyId && a.state === "active" && a.credential === CRED && store.read().credential === CRED);
    rmSync(store.path);
    store.write({ deviceKeyId: hub.sent[0].body.deviceKeyId });
    const held = await ensureEnrolled({ store, hubUrl: HUB, tenant: "devco", secret: "s", fetchImpl: hub.fetchImpl });
    check("a credential that exists on the hub but not here -> held, retry: false, and the why says revoke + delete the file + re-enroll", held.state === "held" && held.retry === false && held.credential === null && /revokes device/.test(held.why) && held.why.includes(store.path) && /enrolls afresh/.test(held.why), held.why);
    rmSync(store.path);
  }

  console.log("\n=== 4. refused, locked, unreachable: what is retried and what is not ===");
  {
    const store = new EnrollmentStore({ dir, onLog: quiet });
    const hub = fakeHub([
      { status: 403, body: { ok: false, error: "enrollment refused: unknown tenant, or the secret is wrong, expired or revoked" } },
      { status: 429, body: { ok: false, error: "too many enrollment attempts", retryAfterMs: 30000 } },
      { throws: "fetch failed" },
      { throws: "The operation was aborted due to timeout", name: "TimeoutError" },
      { status: 500, body: { ok: false, error: "boom" } },
    ]);
    const refused = await ensureEnrolled({ store, hubUrl: HUB, tenant: "devco", secret: "wrong", fetchImpl: hub.fetchImpl });
    check("403 -> refused, NOT retried (the fix is in config.json, not in time), the hub's sentence kept, nothing stored but the attempt", refused.state === "refused" && refused.retry === false && /wrong, expired or revoked/.test(refused.why) && /config\.json/.test(refused.why) && store.read().credential === null && store.read().lastOutcome === "refused");
    const locked = await ensureEnrolled({ store, hubUrl: HUB, tenant: "devco", secret: "s", fetchImpl: hub.fetchImpl });
    check("429 -> locked, retried", locked.state === "locked" && locked.retry === true);
    const down = await ensureEnrolled({ store, hubUrl: HUB, tenant: "devco", secret: "s", fetchImpl: hub.fetchImpl });
    check("a transport failure -> unreachable, retried, the error kept", down.state === "unreachable" && down.retry === true && /fetch failed/.test(down.why));
    const slow = await ensureEnrolled({ store, hubUrl: HUB, tenant: "devco", secret: "s", fetchImpl: hub.fetchImpl, timeoutMs: 1234 });
    check("a timeout -> unreachable, saying how long it waited", slow.state === "unreachable" && /1234 ms/.test(slow.why));
    const odd = await ensureEnrolled({ store, hubUrl: HUB, tenant: "devco", secret: "s", fetchImpl: hub.fetchImpl });
    check("an unexpected status -> unreachable with the status and the hub's reason, retried", odd.state === "unreachable" && /HTTP 500/.test(odd.why) && /boom/.test(odd.why) && odd.retry === true);
    check("every attempt stamped lastAttemptAt and the device key was minted ONCE across all five", Boolean(store.read().lastAttemptAt) && new Set(hub.sent.map((s) => s.body.deviceKeyId)).size === 1);
    check("the retry interval is minutes, not seconds — a fleet retrying enrollment is load the hub has never seen", ENROLL_RETRY_MS >= 60_000);
    rmSync(store.path);
  }

  console.log("\n=== 5. HubClient presents the credential on EVERY request, and the requester reads make no request without one ===");
  {
    const catalog = JSON.parse(readFileSync(join(ROOT, "src/broker/catalog.json"), "utf8"));
    // Answers by URL, not by order: propose() may make a repair turn, and the property under test
    // is "every request carries the header", not how many turns a proposal takes.
    const byUrl = {
      "/v1/turn": { status: 200, body: { ok: true, hubProvider: "local", model: "m", call: { id: "c", name: "escalate", arguments: JSON.stringify({ summary: "x", category: "other", whatWasChecked: "y", suggestedOwner: null }) }, finishReason: "tool_calls" } },
      "/v1/ask": { status: 200, body: { ok: true, answered: false, reply: "no" } },
      "/v1/ticket": { status: 201, body: { ok: true, reference: "MD-1", notified: false } },
      "/v1/tickets": { status: 200, body: { ok: true, tickets: [{ reference: "MD-1", state: "new" }], count: 1, identity: { kind: "enrollment-credential", proves: "…", doesNotProve: "…" } } },
      "/v1/tickets/MD-1": { status: 200, body: { ok: true, ticket: { reference: "MD-1" }, entries: [], identity: {} } },
      "/v1/tickets/MD-2": { status: 404, body: { ok: false, error: "no ticket MD-2 is readable by this enrollment" } },
    };
    const hub = { sent: [] };
    hub.fetchImpl = async (url, init) => {
      hub.sent.push({ url, method: init?.method ?? "GET", headers: init?.headers ?? {} });
      const next = byUrl[url.replace(HUB, "")] ?? { status: 404, body: { ok: false, error: `no such route ${url}` } };
      return { status: next.status, headers: { get: () => null }, json: async () => next.body };
    };
    const bare = new HubClient({ hubUrl: HUB, capabilities: catalog.capabilities, fetchImpl: hub.fetchImpl, onLog: quiet });
    check("with no credential the requester reads make NO request and say why", (await bare.listTickets()).reason === "no-credential" && (await bare.ticket("MD-1")).reason === "no-credential" && hub.sent.length === 0);
    bare.setCredential(CRED);
    await bare.propose("my thing is broken in a way tier-0 cannot see", { probe: { online: true, services: {}, adapters: [], primary: [] } });
    await bare.ask("how do I do a thing", { probe: {} });
    await bare.fileTicket({ description: "d", summary: "s", category: "other", suggestedOwner: null, reporter: { osUsername: "u" } });
    const list = await bare.listTickets();
    const one = await bare.ticket("MD-1");
    const other = await bare.ticket("MD-2");
    const auth = hub.sent.map((s) => s.headers.authorization);
    const urls = new Set(hub.sent.map((s) => s.url.replace(HUB, "")));
    check("after setCredential(): EVERY request — /v1/turn, /v1/ask, /v1/ticket, /v1/tickets and /v1/tickets/<ref> — carries Authorization: Bearer <credential>", hub.sent.length >= 6 && auth.every((a) => a === `Bearer ${CRED}`) && ["/v1/turn", "/v1/ask", "/v1/ticket", "/v1/tickets", "/v1/tickets/MD-1", "/v1/tickets/MD-2"].every((u) => urls.has(u)), JSON.stringify(hub.sent.map((s) => [s.url, s.headers.authorization?.slice(0, 12)])));
    check("listTickets() returns the hub's list and its identity field", list.ok === true && list.tickets.length === 1 && list.identity?.kind === "enrollment-credential");
    check("ticket(ref) returns the ticket and its entries; another enrollment's reference is refused with the hub's 404 sentence", one.ok === true && one.ticket.reference === "MD-1" && other.ok === false && other.reason === "refused" && other.status === 404 && /readable by this enrollment/.test(other.detail));
    const withCred = new HubClient({ hubUrl: HUB, capabilities: catalog.capabilities, fetchImpl: hub.fetchImpl, onLog: quiet, credential: CRED });
    check("the constructor takes a credential too, and setCredential(null) clears it", withCred.credential === CRED && (withCred.setCredential(null), withCred.credential === null));
    const source = readFileSync(join(ROOT, "src/agent/hub-client.js"), "utf8");
    check("every fetch in HubClient goes through #headers() — no request can forget the credential", !/headers: \{ "content-type": "application\/json" \}/.test(jsCode(source)) && (jsCode(source).match(/headers: this\.#headers\(\)/g) ?? []).length >= 4);
  }

  console.log("\n=== 6. main.js wires it; config.json carries an EMPTY secret; the client now calls /v1/enroll (D274's premise ends) ===");
  {
    const main = jsCode(readFileSync(join(ROOT, "src/main/main.js"), "utf8"));
    check("main.js builds the EnrollmentStore in userData, reads config.enrollment (env overrides), and hands the credential to HubClient", /new EnrollmentStore\(\{ dir: app\.getPath\("userData"\)/.test(main) && /config\.enrollment\?\.tenant/.test(main) && /MATIC_ENROLLMENT_SECRET/.test(main) && /hubClient\.setCredential\(r\.credential\)/.test(main));
    check("…and retries only when the outcome says to, on the module's interval, without blocking the window", /if \(r\.retry\) setTimeout\(enroll, ENROLL_RETRY_MS\)\.unref\(\)/.test(main) && /void enroll\(\)/.test(main));
    const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
    check("config.json has an enrollment block with a tenant and an EMPTY secret — this file is committed, and a filled-in secret here would be a secret in the repository", typeof config.enrollment?.tenant === "string" && config.enrollment.secret === "", JSON.stringify(config.enrollment));
    check("…and the note beside it says PLAINTEXT, names the CLI that mints a secret, and names this test", /PLAINTEXT/.test(config._enrollmentNote) && /create-secret/.test(config._enrollmentNote) && /enrollment\.test\.mjs/.test(config._enrollmentNote));
    const enrollSrc = jsCode(readFileSync(join(ROOT, "src/agent/enrollment.js"), "utf8"));
    check("client/src now names POST /v1/enroll in code — the premise the Agents page's D272/D273 copy rested on has ended, and the server's detector (admin-static §6a) is what says so", /\/v1\/enroll\b/.test(enrollSrc));
    check("the enrollment module generates NO key: no crypto beyond randomBytes for an opaque id (D60/D63/D64 are not built, and the header says so)", !/generateKeyPair|createSign|createPrivateKey|subtle/.test(enrollSrc) && /randomBytes\(16\)/.test(enrollSrc) && /NOT a\s+cryptographic key/.test(readFileSync(join(ROOT, "src/agent/enrollment.js"), "utf8").replace(/\n \* /g, " ")));
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
