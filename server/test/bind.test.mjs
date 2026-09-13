/**
 * The listener decides what a peer may do (D283) — headless, against real sockets on this machine.
 *
 * Run: node test/bind.test.mjs      (part of `npm test`; needs no database and no service)
 *
 * WHY THIS FILE EXISTS. Until 2026-09-12 the hub bound 127.0.0.1 with a literal and refused every
 * non-loopback peer, and D267's guard 2 admitted in writing that it could never fire "because
 * nothing can bind off loopback". D271 was answered that day — production is on the customer's
 * LAN/WAN — so a LAN listener now exists, and the rule that came with it is: TLS or nothing, and a
 * credential on every /v1 route but /v1/enroll and /v1/health. Every branch of that rule is driven
 * here, first as pure functions and then over real sockets.
 *
 * HOW A "LAN PEER" IS MADE ON ONE MACHINE. Windows' loopback adapter covers all of 127.0.0.0/8, but
 * the hub's LOOPBACK set names three addresses exactly. So a server bound to 127.0.0.2 is a
 * "non-loopback listener" to the hub, and a request sent from 127.0.0.3 (`localAddress`) is a
 * "non-loopback peer" — the LAN path, exercised without leaving the machine and without a second
 * network interface. Probed on 2026-09-12 before this file was written; if the probe below fails on
 * a machine that does not route 127.0.0.2/3, the live sections say so and skip rather than fail.
 *
 * THE CERTIFICATE. `openssl` (Git for Windows ships one) mints a throwaway self-signed certificate
 * into a temp directory for the TLS section. No key is checked in. If openssl is absent the TLS
 * section prints why it did not run — a skipped check is reported, never counted as a pass.
 */
import http from "node:http";
import https from "node:https";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHubServer, admitPeer, credentialRequired, listenPlanFromEnv, listenerBanner, banner, BANNER_WIDTH, authPolicy, isLoopback } from "../src/index.js";
import { NEEDS_CREDENTIAL } from "../src/tickets/read.js";

let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}
const skip = (label, why) => console.log(`  SKIP  ${label} — ${why}`);

const stubProvider = { name: "stub", model: "stub", baseUrl: "http://stub", async complete() { return { status: 200, body: { choices: [] }, ms: 1 }; } };

/**
 * One request with a chosen SOURCE address. Node's fetch cannot pick one; http.request can.
 * For TLS the caller passes the certificate it just minted as `ca`, so verification stays ON and
 * trusts exactly that one certificate — never `rejectUnauthorized: false`.
 */
function request({ tls = false, ca = undefined, host, port, path, method = "GET", body = null, headers = {}, localAddress }) {
  return new Promise((resolve, reject) => {
    const mod = tls ? https : http;
    const rq = mod.request({ host, port, path, method, localAddress, headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers }, ...(tls ? { ca } : {}) }, (res) => {
      let s = "";
      res.on("data", (c) => (s += c));
      res.on("end", () => { let json = null; try { json = JSON.parse(s); } catch {} resolve({ status: res.statusCode, headers: res.headers, json, text: s }); });
    });
    rq.on("error", reject);
    if (body) rq.write(typeof body === "string" ? body : JSON.stringify(body));
    rq.end();
  });
}

console.log("=== 1. admitPeer(): the peer gate, every branch, no sockets ===");
{
  check("a loopback peer is admitted whatever the listener is", admitPeer({ bound: "127.0.0.1", peer: "127.0.0.1", peerLoopback: true, encrypted: false }).allow === true && admitPeer({ bound: "192.168.1.5", peer: "::1", peerLoopback: true, encrypted: false }).allow === true);
  const unknown = admitPeer({ bound: null, peer: "10.0.0.9", peerLoopback: false, encrypted: true });
  check("an UNKNOWN bound address refuses a non-loopback peer — unknown is never the permissive branch (D267's rule)", unknown.allow === false && unknown.status === 403 && /could not read its own bound address/.test(unknown.error));
  const onLoopback = admitPeer({ bound: "127.0.0.1", peer: "10.0.0.9", peerLoopback: false, encrypted: true });
  check("a loopback LISTENER refuses a non-loopback peer, TLS or not — B0's rule, unchanged", onLoopback.allow === false && onLoopback.status === 403 && /loopback connections only/.test(onLoopback.error));
  const plaintext = admitPeer({ bound: "192.168.1.5", peer: "10.0.0.9", peerLoopback: false, encrypted: false });
  check("a LAN listener refuses a PLAINTEXT non-loopback peer, naming the bind, the peer and D283", plaintext.allow === false && plaintext.status === 403 && /192\.168\.1\.5/.test(plaintext.error) && /10\.0\.0\.9/.test(plaintext.error) && /TLS only \(D283\)/.test(plaintext.error));
  check("…and admits the same peer over TLS", admitPeer({ bound: "192.168.1.5", peer: "10.0.0.9", peerLoopback: false, encrypted: true }).allow === true);
}

console.log("\n=== 2. credentialRequired(): the listener's decision, per route ===");
{
  const api = ["/v1/turn", "/v1/ask", "/v1/ticket", "/v1/session", "/v1/tickets", "/v1/tickets/MD-1000"];
  check("on a loopback listener NO route requires a credential — the only caller shares the machine with the database", api.every((p) => credentialRequired({ bound: "127.0.0.1", pathname: p }) === false) && credentialRequired({ bound: "::1", pathname: "/v1/turn" }) === false);
  check("on a LAN listener every /v1 route requires one…", api.every((p) => credentialRequired({ bound: "0.0.0.0", pathname: p }) === true));
  check("…except the two a device needs BEFORE it has one: /v1/enroll and /v1/health", credentialRequired({ bound: "0.0.0.0", pathname: "/v1/enroll" }) === false && credentialRequired({ bound: "0.0.0.0", pathname: "/v1/health" }) === false);
  check("…and the index and the console, which have their own answers (GET / is discovery; /admin has its own sign-in)", credentialRequired({ bound: "0.0.0.0", pathname: "/" }) === false && credentialRequired({ bound: "0.0.0.0", pathname: "/admin/login" }) === false);
  check("an unknown bound address requires a credential — again, unknown is not the permissive branch", credentialRequired({ bound: null, pathname: "/v1/turn" }) === true);
  check("authPolicy() says 'optional' for a loopback listener and 'required' for a LAN one, both naming GET /v1/tickets or the credential", /^optional/.test(authPolicy("127.0.0.1")) && /GET \/v1\/tickets/.test(authPolicy("127.0.0.1")) && /^required/.test(authPolicy("10.1.2.3")) && /10\.1\.2\.3/.test(authPolicy("10.1.2.3")));
}

console.log("\n=== 3. listenPlanFromEnv(): a LAN bind is TLS or nothing ===");
{
  const dflt = listenPlanFromEnv({});
  check("no variables -> 127.0.0.1, no TLS, no refusal (the development shape)", dflt.bind === "127.0.0.1" && dflt.tls === null && dflt.refusal === null);
  const bare = listenPlanFromEnv({ MATIC_HUB_BIND: "0.0.0.0" });
  check("MATIC_HUB_BIND off loopback with no certificate -> REFUSED to start, naming the bind, both variables and D283", bare.refusal !== null && /0\.0\.0\.0/.test(bare.refusal) && /MATIC_HUB_TLS_CERT and MATIC_HUB_TLS_KEY/.test(bare.refusal) && /D283/.test(bare.refusal) && bare.tls === null);
  check("'localhost' is NOT loopback to this hub (the set names addresses) and so needs TLS too — bind 127.0.0.1 instead", listenPlanFromEnv({ MATIC_HUB_BIND: "localhost" }).refusal !== null);
  const half = listenPlanFromEnv({ MATIC_HUB_BIND: "127.0.0.1", MATIC_HUB_TLS_CERT: "c.pem" });
  check("a certificate without a key (or the reverse) is a misconfiguration, refused even on loopback", half.refusal !== null && /go together/.test(half.refusal) && listenPlanFromEnv({ MATIC_HUB_TLS_KEY: "k.pem" }).refusal !== null);
  const read = (p) => Buffer.from(`contents of ${p}`);
  const full = listenPlanFromEnv({ MATIC_HUB_BIND: "192.168.1.5", MATIC_HUB_TLS_CERT: "c.pem", MATIC_HUB_TLS_KEY: "k.pem" }, read);
  check("bind + certificate + key -> a plan with the two files read, no refusal", full.refusal === null && full.bind === "192.168.1.5" && full.tls?.cert.toString() === "contents of c.pem" && full.tls?.key.toString() === "contents of k.pem");
  const unreadable = listenPlanFromEnv({ MATIC_HUB_BIND: "192.168.1.5", MATIC_HUB_TLS_CERT: "c.pem", MATIC_HUB_TLS_KEY: "k.pem" }, () => { throw new Error("ENOENT: no such file"); });
  check("unreadable TLS files -> refused with the OS's reason, never a plaintext fallback", unreadable.refusal !== null && /ENOENT/.test(unreadable.refusal) && unreadable.tls === null);
  check("TLS on a loopback bind is allowed (a developer testing the LAN shape on one machine)", listenPlanFromEnv({ MATIC_HUB_TLS_CERT: "c.pem", MATIC_HUB_TLS_KEY: "k.pem" }, read).refusal === null);
}

console.log("\n=== 4. the listener banners fit the box (the padding defect, a fifth instance denied) ===");
{
  for (const [name, lines] of [
    ["loopback", listenerBanner({ bind: "127.0.0.1", port: 8787, tls: false })],
    ["LAN, IPv4", listenerBanner({ bind: "192.168.100.250", port: 8787, tls: true })],
    ["LAN, a long IPv6 with a zone", listenerBanner({ bind: "fe80::1234:5678:9abc:def0%12", port: 65535, tls: true })],
  ]) {
    check(`the ${name} listener banner fits the box`, banner(lines).every((l) => l.length === BANNER_WIDTH), lines.filter((l) => l.length > BANNER_WIDTH - 4).join(" | "));
  }
  check("the loopback banner says credentials are OPTIONAL there and names the LAN variables; the LAN banner says REQUIRED and names the console", /OPTIONAL/.test(listenerBanner({ bind: "127.0.0.1", port: 1, tls: false }).join(" ")) && /MATIC_HUB_BIND/.test(listenerBanner({ bind: "127.0.0.1", port: 1, tls: false }).join(" ")) && /REQUIRES/.test(listenerBanner({ bind: "10.0.0.1", port: 1, tls: true }).join(" ")) && /console/.test(listenerBanner({ bind: "10.0.0.1", port: 1, tls: true }).join(" ")));
}

// ---- live: can this machine play both sides of a LAN on the loopback adapter? ----
let canFakeLan = false;
try {
  const probe = http.createServer((req, res) => { res.end(req.socket.remoteAddress); });
  await new Promise((r) => probe.listen(0, "127.0.0.2", r));
  const seen = await request({ host: "127.0.0.2", port: probe.address().port, path: "/", localAddress: "127.0.0.3" });
  await new Promise((r) => probe.close(r));
  canFakeLan = seen.text === "127.0.0.3";
} catch (err) {
  console.log(`  (this machine does not route 127.0.0.2/3: ${err.message})`);
}

console.log("\n=== 5. live, plaintext: a loopback listener refuses a LAN peer; a LAN listener without TLS refuses it too ===");
if (!canFakeLan) {
  skip("live plaintext checks", "127.0.0.2/127.0.0.3 are not routable here");
} else {
  const loop = createHubServer({ provider: stubProvider, log: () => {}, kb: false, admin: false });
  await new Promise((r) => loop.listen(0, "127.0.0.1", r));
  const lp = loop.address().port;
  try {
    const lanPeer = await request({ host: "127.0.0.1", port: lp, path: "/v1/health", localAddress: "127.0.0.3" });
    check("loopback listener, peer 127.0.0.3 -> 403 'loopback connections only' (B0's rule, unchanged)", lanPeer.status === 403 && /loopback connections only/.test(lanPeer.json?.error ?? ""), JSON.stringify(lanPeer.json));
    const me = await request({ host: "127.0.0.1", port: lp, path: "/v1/health" });
    check("…and its own machine gets /v1/health, which says credentials are optional and describes the listener as loopback, no TLS", me.status === 200 && /^optional/.test(me.json?.auth ?? "") && me.json?.listener?.loopback === true && me.json?.listener?.tls === false, JSON.stringify(me.json?.listener));
    const tickets = await request({ host: "127.0.0.1", port: lp, path: "/v1/tickets" });
    check("GET /v1/tickets with no credential -> 401 with the exact sentence, on a LOOPBACK listener too: no requester, no list", tickets.status === 401 && tickets.json?.error === NEEDS_CREDENTIAL && tickets.headers["x-matic-hub-auth"] === "none", JSON.stringify(tickets.json));
    const malformed = await request({ host: "127.0.0.1", port: lp, path: "/v1/turn", method: "POST", body: {}, headers: { authorization: "Bearer not-a-credential" } });
    check("a malformed credential is refused on a loopback listener too — presented means checked — with no database round trip (401, 'begin mdc_')", malformed.status === 401 && /begin mdc_/.test(malformed.json?.error ?? ""), JSON.stringify(malformed.json));
    const basic = await request({ host: "127.0.0.1", port: lp, path: "/v1/turn", method: "POST", body: {}, headers: { authorization: "Basic dXNlcjpwYXNz" } });
    check("a non-Bearer Authorization -> 401: nothing else is understood", basic.status === 401 && /Bearer/.test(basic.json?.error ?? ""));
  } finally { await new Promise((r) => loop.close(r)); }

  const plain = createHubServer({ provider: stubProvider, log: () => {}, kb: false, admin: false });
  await new Promise((r) => plain.listen(0, "127.0.0.2", r));
  const pp = plain.address().port;
  try {
    const refused = await request({ host: "127.0.0.2", port: pp, path: "/v1/health", localAddress: "127.0.0.3" });
    check("a PLAINTEXT listener on 127.0.0.2, peer 127.0.0.3 -> 403 naming TLS: the handler enforces what listenPlanFromEnv refuses at start (belt and braces)", refused.status === 403 && /TLS only \(D283\)/.test(refused.json?.error ?? "") && /127\.0\.0\.2/.test(refused.json?.error ?? ""), JSON.stringify(refused.json));
    const ownMachine = await request({ host: "127.0.0.2", port: pp, path: "/v1/health", localAddress: "127.0.0.1" });
    check("…but a LOOPBACK peer on that same listener is admitted (the gate is about the peer), and /v1/health says credentials are REQUIRED here", ownMachine.status === 200 && /^required/.test(ownMachine.json?.auth ?? "") && ownMachine.json?.listener?.loopback === false, JSON.stringify(ownMachine.json?.auth));
    const turn = await request({ host: "127.0.0.2", port: pp, path: "/v1/turn", method: "POST", body: {}, localAddress: "127.0.0.1" });
    check("…and POST /v1/turn from that loopback peer with NO credential -> 401 naming the bind, the header and POST /v1/enroll: the requirement is the LISTENER's, not the peer's", turn.status === 401 && /127\.0\.0\.2/.test(turn.json?.error ?? "") && /Authorization: Bearer/.test(turn.json?.error ?? "") && /POST \/v1\/enroll/.test(turn.json?.error ?? ""), JSON.stringify(turn.json));
    const enroll = await request({ host: "127.0.0.2", port: pp, path: "/v1/enroll", method: "POST", body: { nope: true }, localAddress: "127.0.0.1" });
    check("…while POST /v1/enroll needs no credential there (400 for the bad body, not 401): it is how a device gets one", enroll.status === 400);
  } finally { await new Promise((r) => plain.close(r)); }
}

console.log("\n=== 6. live, TLS: the LAN shape end to end, with a throwaway certificate ===");
const openssl = spawnSync("openssl", ["version"], { encoding: "utf8" });
if (!canFakeLan) {
  skip("live TLS checks", "127.0.0.2/127.0.0.3 are not routable here");
} else if (openssl.status !== 0) {
  skip("live TLS checks", "openssl is not on PATH, so no throwaway certificate can be minted (Git for Windows ships one at /mingw64/bin/openssl)");
} else {
  const dir = mkdtempSync(join(tmpdir(), "matic-tls-"));
  try {
    const cnf = join(dir, "san.cnf");
    writeFileSync(cnf, "[req]\ndistinguished_name=dn\nx509_extensions=v3\n[dn]\nCN=127.0.0.2\n[v3]\nsubjectAltName=IP:127.0.0.2\n");
    const minted = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"), "-config", cnf, "-subj", "/CN=127.0.0.2"], { encoding: "utf8" });
    check(`(fixture) openssl minted a one-day self-signed certificate into a temp dir (${openssl.stdout.trim()})`, minted.status === 0, minted.stderr.slice(0, 300));
    const plan = listenPlanFromEnv({ MATIC_HUB_BIND: "127.0.0.2", MATIC_HUB_TLS_CERT: join(dir, "cert.pem"), MATIC_HUB_TLS_KEY: join(dir, "key.pem") });
    check("listenPlanFromEnv() reads the real files and produces a LAN plan with no refusal", plan.refusal === null && plan.tls !== null && plan.bind === "127.0.0.2", plan.refusal ?? "");
    const ca = readFileSync(join(dir, "cert.pem"));
    const lan = createHubServer({ provider: stubProvider, log: () => {}, kb: false, admin: false, tls: plan.tls });
    await new Promise((r) => lan.listen(0, plan.bind, r));
    const port = lan.address().port;
    try {
      const health = await request({ tls: true, ca, host: "127.0.0.2", port, path: "/v1/health", localAddress: "127.0.0.3" });
      check("over TLS, peer 127.0.0.3 -> /v1/health 200: the LAN peer is admitted, the listener reports tls: true, loopback: false, and auth 'required'", health.status === 200 && health.json?.hub === "matic-desk-hub" && health.json?.listener?.tls === true && health.json?.listener?.loopback === false && /^required/.test(health.json?.auth ?? ""), JSON.stringify({ status: health.status, listener: health.json?.listener, auth: health.json?.auth }));
      check("…and /v1/health names what a credential proves, in words, for a client that will render 'your tickets'", /per-OS-user enrollment/.test(health.json?.enrollment?.identity ?? ""));
      const index = await request({ tls: true, ca, host: "127.0.0.2", port, path: "/", localAddress: "127.0.0.3" });
      check("GET / over the LAN says LAN LISTENER, credentials REQUIRED, and lists GET /v1/tickets", index.status === 200 && /LAN LISTENER/.test(index.json?.warning ?? "") && /REQUIRES/.test(index.json?.warning ?? "") && index.json?.routes?.some((r) => r.path === "/v1/tickets"), JSON.stringify(index.json?.warning));
      const turn = await request({ tls: true, ca, host: "127.0.0.2", port, path: "/v1/turn", method: "POST", body: { text: "x" }, localAddress: "127.0.0.3" });
      check("POST /v1/turn with NO credential over the LAN -> 401 that names the header and POST /v1/enroll, x-matic-hub-auth none", turn.status === 401 && /Authorization: Bearer/.test(turn.json?.error ?? "") && /POST \/v1\/enroll/.test(turn.json?.error ?? "") && turn.headers["x-matic-hub-auth"] === "none", JSON.stringify(turn.json));
      const unknown = await request({ tls: true, ca, host: "127.0.0.2", port, path: "/v1/turn", method: "POST", body: { text: "x" }, headers: { authorization: `Bearer mdc_${"C".repeat(43)}` }, localAddress: "127.0.0.3" });
      check("a well-formed credential nobody issued -> 401 'not one this hub issued' when the control plane answers, or 503 'could not be checked' when it does not — NEVER a fall-through to unauthenticated", (unknown.status === 401 && /not one this hub issued/.test(unknown.json?.error ?? "")) || (unknown.status === 503 && /could not be checked/.test(unknown.json?.error ?? "")), `${unknown.status} ${JSON.stringify(unknown.json)}`);
      const tickets = await request({ tls: true, ca, host: "127.0.0.2", port, path: "/v1/tickets", localAddress: "127.0.0.3" });
      check("GET /v1/tickets over the LAN with no credential -> 401, the listener's sentence (the requirement fires before the route's own)", tickets.status === 401 && /requires an enrollment credential/.test(tickets.json?.error ?? ""));
      const plaintextToTls = await request({ host: "127.0.0.2", port, path: "/v1/health", localAddress: "127.0.0.3" }).catch((e) => ({ error: e.message }));
      check("a PLAINTEXT request to the TLS listener does not get an answer (a TLS server does not speak HTTP)", plaintextToTls.error !== undefined || plaintextToTls.status >= 400, JSON.stringify(plaintextToTls).slice(0, 120));
    } finally { await new Promise((r) => lan.close(r)); }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

check("isLoopback names exactly the three addresses the set has always named", isLoopback("127.0.0.1") && isLoopback("::1") && isLoopback("::ffff:127.0.0.1") && !isLoopback("127.0.0.2") && !isLoopback("localhost"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
