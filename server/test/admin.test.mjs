/**
 * The admin console's pure parts, WITHOUT a database: TOTP against RFC 6238's published vectors,
 * password hashing, base32, HTML escaping, cookies and CSRF, and D154's tier function.
 *
 * Run: node test/admin.test.mjs        (from server/; part of `npm test`)
 *
 * The live console — login, permissions, audit rows, the ticket slice against real rows — is
 * test/admin-db.test.mjs (`npm run test:db`), which needs PostgreSQL.
 */
import {
  base32Decode, base32Encode, hashPassword, hotp, otpauthUri, totpCode, totpStep, verifyPassword, verifyTotp,
  randomToken, safeEqual, TOTP_DIGITS,
} from "../src/admin/auth.js";
import { esc, html, raw, page, notYet, Safe } from "../src/admin/html.js";
import { parseCookies, sessionCookie, clearedCookie, csrfToken, csrfValid, cookieSecure, COOKIE_NAME } from "../src/admin/session.js";
import { tierOf, transcriptAccess } from "../src/admin/tiers.js";
import { DESTINATIONS, PERMISSIONS } from "../src/admin/permissions.js";
import { route } from "../src/admin/route.js";
import { BYPASS_ENV, bypassBannerLine, bypassStatus } from "../src/admin/dev-bypass.js";
import { loginPage } from "../src/admin/pages/login.js";
import { NEXT_STATES, TICKET_STATES } from "../src/tickets/query.js";

let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}
function throws(label, fn, pattern) {
  try { fn(); fail++; console.log(`  FAIL  ${label} — it did NOT throw`); }
  catch (err) {
    if (pattern.test(err.message)) { pass++; console.log(`  PASS  ${label}`); }
    else { fail++; console.log(`  FAIL  ${label} — wrong message: ${err.message}`); }
  }
}

console.log("=== 1. TOTP against RFC 6238 Appendix B (SHA-1, secret '12345678901234567890') ===");
// The RFC publishes 8-digit codes; a 6-digit verifier shows the last six. Time -> expected 8-digit.
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");
const VECTORS = [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"]];
for (const [t, eight] of VECTORS) {
  const want = eight.slice(-TOTP_DIGITS);
  check(`T=${t} -> ${want}`, totpCode(RFC_SECRET, t * 1000) === want, totpCode(RFC_SECRET, t * 1000));
}
check("the step for T=59 is 1 (30-second steps)", totpStep(59_000) === 1);
check("hotp is deterministic per counter", hotp(RFC_SECRET, 1) === hotp(RFC_SECRET, 1) && hotp(RFC_SECRET, 1) !== hotp(RFC_SECRET, 2));

console.log("\n=== 2. verifyTotp: skew window, replay, shape ===");
const NOW = 1_700_000_000_000;
const step = totpStep(NOW);
check("the current code verifies and returns its step", verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step), { now: NOW }) === step);
check("one step behind verifies", verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), { now: NOW }) === step - 1);
check("one step ahead verifies", verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step + 1), { now: NOW }) === step + 1);
check("two steps behind does NOT", verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 2), { now: NOW }) === null);
check("REPLAY: the same step again is refused when lastStep >= it (RFC 6238 §5.2)", verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step), { now: NOW, lastStep: step }) === null);
check("and the step after is accepted", verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step + 1), { now: NOW, lastStep: step }) === step + 1);
check("a code with spaces is tolerated ('123 456' shape)", verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step).replace(/^(\d{3})/, "$1 "), { now: NOW }) === step);
check("five digits are refused", verifyTotp(RFC_SECRET, "12345", { now: NOW }) === null);
check("letters are refused", verifyTotp(RFC_SECRET, "12345a", { now: NOW }) === null);
check("a non-string is refused", verifyTotp(RFC_SECRET, 123456, { now: NOW }) === null);

console.log("\n=== 3. base32 and the otpauth URI ===");
check("RFC 4648 vector: the RFC secret encodes to GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", base32Encode(RFC_SECRET) === "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", base32Encode(RFC_SECRET));
check("decode round-trips", base32Decode(base32Encode(RFC_SECRET)).equals(RFC_SECRET));
check("decode ignores case, spaces and padding", base32Decode("gezd gnbv GY3TQOJQGEZDGNBVGY3TQOJQ==").equals(RFC_SECRET));
throws("decode refuses a non-base32 character", () => base32Decode("GEZD1"), /not base32/);
const uri = otpauthUri({ secret: RFC_SECRET, email: "a@b.test" });
check("otpauth URI names the issuer, the account, SHA1, 6 digits, 30 s", /^otpauth:\/\/totp\/Matic%20Desk%3Aa%40b\.test\?/.test(uri) && /secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ/.test(uri) && /algorithm=SHA1/.test(uri) && /digits=6/.test(uri) && /period=30/.test(uri), uri);

console.log("\n=== 4. passwords: scrypt, self-describing, constant-time ===");
const stored = hashPassword("correct horse battery staple");
check("the stored form carries its parameters", /^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(stored), stored.slice(0, 40));
check("two hashes of the same password differ (random salt)", hashPassword("correct horse battery staple") !== stored);
check("the right password verifies", verifyPassword("correct horse battery staple", stored) === true);
check("a wrong password does not", verifyPassword("correct horse battery stapl", stored) === false);
check("a malformed stored hash is false, not a throw", verifyPassword("x", "not-a-hash") === false && verifyPassword("x", null) === false && verifyPassword("x", "scrypt$1$1$1$!!$!!") === false);
throws("a short password is refused at hashing time (12 characters minimum)", () => hashPassword("short"), /at least 12/);
check("randomToken is url-safe and long", /^[A-Za-z0-9_-]{40,}$/.test(randomToken()) && randomToken() !== randomToken());
check("safeEqual", safeEqual("abc", "abc") && !safeEqual("abc", "abd") && !safeEqual("abc", "abcd") && !safeEqual("abc", null));

console.log("\n=== 5. HTML: escaped by default, Safe passes through ===");
check("esc escapes the five characters", esc(`<a href="x">'&'</a>`) === "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
const payload = `<script>document.cookie</script>`;
const out = html`<p>${payload}</p>`.toString();
check("a tagged interpolation is escaped", out === "<p>&lt;script&gt;document.cookie&lt;/script&gt;</p>", out);
check("an attribute value is escaped too", html`<a title="${`" onmouseover="x`}">t</a>`.toString() === `<a title="&quot; onmouseover=&quot;x">t</a>`);
check("nested html`` is not double-escaped", html`<div>${html`<b>${"<i>"}</b>`}</div>`.toString() === "<div><b>&lt;i&gt;</b></div>");
check("raw() passes through", html`${raw("<hr>")}`.toString() === "<hr>");
check("arrays are joined and each element escaped", html`${["<", ">"]}`.toString() === "&lt;&gt;");
check("null, undefined and false render as nothing", html`[${null}${undefined}${false}]`.toString() === "[]");
check("the result is a Safe, so a page can embed it without re-escaping", html`x` instanceof Safe);
const shell = page({ title: `<t>`, body: html`<h1>B</h1>`, nav: [{ path: "/admin", label: "R", count: 3 }], current: "/admin", who: { email: "a@b", roles: ["r"], tenant: "<T>" }, csrf: "tok" });
check("page() escapes the title and the tenant name", shell.includes("&lt;t&gt; · Matic Desk admin") && shell.includes("&lt;T&gt;") && !shell.includes("<T>"));
check("the nav draws the badge and marks the current destination", /class="current">R<span class="badge ">3<\/span>/.test(shell));
check("the logout form carries the CSRF token", /action="\/admin\/logout"><input type="hidden" name="_csrf" value="tok">/.test(shell));
check("the shell says loopback-only and no-JS in its footer", /Loopback only/.test(shell) && /without JavaScript/.test(shell));
const stub = notYet({ heading: "H", missing: "M", why: "W", arrives: "A" }).toString();
check("notYet names what is missing, why, and when it arrives", /<strong>M<\/strong>/.test(stub) && /W<\/p>/.test(stub) && /Arrives with: A/.test(stub));

console.log("\n=== 6. cookies and CSRF ===");
check("parseCookies", JSON.stringify(parseCookies("a=1; matic_admin=tok; b=x=y")) === JSON.stringify({ a: "1", matic_admin: "tok", b: "x=y" }) && Object.keys(parseCookies(undefined)).length === 0);
const c = sessionCookie("tok", false);
check("the session cookie is HttpOnly, SameSite=Lax, Path=/admin, with a Max-Age", /^matic_admin=tok; /.test(c) && /HttpOnly/.test(c) && /SameSite=Lax/.test(c) && /Path=\/admin/.test(c) && /Max-Age=\d+/.test(c), c);
check("Secure is absent on plaintext loopback and present when asked", !/Secure/.test(c) && /; Secure$/.test(sessionCookie("tok", true)));
check("the cleared cookie has Max-Age=0 and the same attributes", /^matic_admin=; Path=\/admin; HttpOnly; SameSite=Lax; Max-Age=0$/.test(clearedCookie(false)));
check("cookieSecure is true for a TLS socket", cookieSecure({ socket: { encrypted: true } }) === true && cookieSecure({ socket: {} }) === false);
process.env.MATIC_ADMIN_COOKIE_SECURE = "1";
check("…and when MATIC_ADMIN_COOKIE_SECURE=1 says TLS is in front", cookieSecure({ socket: {} }) === true);
delete process.env.MATIC_ADMIN_COOKIE_SECURE;
check("the cookie name is what the router reads", COOKIE_NAME === "matic_admin");
const s1 = { csrfSecret: "secret-one" }, s2 = { csrfSecret: "secret-two" };
check("the CSRF token is deterministic per session", csrfToken(s1) === csrfToken(s1) && csrfToken(s1) !== csrfToken(s2));
check("csrfValid accepts its own token and refuses another session's, an empty one, and a non-string", csrfValid(s1, csrfToken(s1)) && !csrfValid(s1, csrfToken(s2)) && !csrfValid(s1, "") && !csrfValid(s1, undefined));

console.log("\n=== 7. D154's tiers, as code (exit criterion 4's function) ===");
const anyAdmin = new Set(["metrics.read", "tickets.read", "review.read", "admins.manage"]);
check("a session with no ticket is unescalated; null is unescalated", tierOf({ escalated: false }) === "unescalated" && tierOf(null) === "unescalated" && tierOf({ escalated: true }) === "escalated");
check("UNESCALATED: nobody — not the tenant admin, not the assignee, not every permission at once",
  !transcriptAccess({ tier: "unescalated", permissions: anyAdmin, isTenantAdmin: true, isAssignee: true }).allowed
  && !transcriptAccess({ tier: "unescalated", permissions: new Set(PERMISSIONS), isTenantAdmin: true }).allowed);
check("ESCALATED: the assignee may", transcriptAccess({ tier: "escalated", permissions: new Set(), isAssignee: true }).allowed);
check("ESCALATED: the tenant admin may", transcriptAccess({ tier: "escalated", permissions: new Set(), isTenantAdmin: true }).allowed);
check("ESCALATED: anyone else may not, whatever their permissions", !transcriptAccess({ tier: "escalated", permissions: anyAdmin }).allowed);
check("AGGREGATE: metrics.read opens it; its absence closes it", transcriptAccess({ tier: "aggregate", permissions: anyAdmin }).allowed && !transcriptAccess({ tier: "aggregate", permissions: new Set(["tickets.read"]) }).allowed);
check("an unknown tier is refused", !transcriptAccess({ tier: "whatever", permissions: anyAdmin }).allowed);

console.log("\n=== 8. the IA and the routes ===");
check("six destinations, review queue first and home (D177)", DESTINATIONS.length === 6 && DESTINATIONS[0].path === "/admin" && DESTINATIONS[0].permission === "review.read");
check("every destination names a permission from the vocabulary", DESTINATIONS.every((d) => PERMISSIONS.includes(d.permission)));
check("the nav order is the handover's: review, tickets, knowledge, agents, metrics, settings",
  DESTINATIONS.map((d) => d.label).join(",") === "Review queue,Tickets,Knowledge,Agents,Metrics,Settings");
throws("a route without a permission cannot be constructed", () => route("GET", /x/, undefined, async () => {}), /needs a permission/);
check("every NEXT_STATES target is a real state and no state moves to itself",
  Object.entries(NEXT_STATES).every(([from, tos]) => TICKET_STATES.includes(from) && tos.every((t) => TICKET_STATES.includes(t) && t !== from)));

console.log("\n=== 9. the development TOTP bypass: the verdict function, and what the form does (D267) ===");
{
  const ON = { [BYPASS_ENV]: "1" };
  const verdict = (env, boundAddress) => bypassStatus({ env, boundAddress });

  // Guard 1: off unless explicitly set, and only to exactly "1".
  check("unset -> off", verdict({}, "127.0.0.1").on === false);
  check("set to something other than 1 -> off, not 'truthy'",
    verdict({ [BYPASS_ENV]: "true" }, "127.0.0.1").on === false && verdict({ [BYPASS_ENV]: "0" }, "127.0.0.1").on === false);
  check("unset is not 'refused' either — nothing was asked for", verdict({}, "127.0.0.1").refused === false);

  // Guard 2: the listener, not the peer.
  check("set + loopback -> ON", verdict(ON, "127.0.0.1").on === true);
  check("set + ::1 -> ON (loopback has more than one spelling)", verdict(ON, "::1").on === true);
  check("set + ::ffff:127.0.0.1 -> ON", verdict(ON, "::ffff:127.0.0.1").on === true);
  check("set + 0.0.0.0 -> REFUSED, and it says so", verdict(ON, "0.0.0.0").on === false && verdict(ON, "0.0.0.0").refused === true);
  check("set + a routable address -> REFUSED", verdict(ON, "192.168.1.40").on === false && verdict(ON, "192.168.1.40").refused === true);
  // An unreadable address is the branch most likely to be written the wrong way round.
  check("set + an UNKNOWN address -> REFUSED, because not knowing is not a loopback binding",
    verdict(ON, null).on === false && verdict(ON, null).refused === true);
  check("a refusal names the address it refused on", /0\.0\.0\.0/.test(verdict(ON, "0.0.0.0").reason));

  // Guard 5's line, and the distinction the banner must keep.
  check("the banner line is null when nothing was asked for", bypassBannerLine(verdict({}, "127.0.0.1")) === null);
  check("an ACTIVE bypass and a REFUSED one produce DIFFERENT banner lines — 'I set it' is not 'it is on'",
    bypassBannerLine(verdict(ON, "127.0.0.1")) !== bypassBannerLine(verdict(ON, "0.0.0.0"))
    && /REFUSED/.test(bypassBannerLine(verdict(ON, "0.0.0.0"))));

  // The banner is drawn on the BARE sign-in page too, which is the page a locked-out reader sees.
  const bare = page({ title: "t", body: raw("<p>x</p>"), bare: true, insecure: bypassBannerLine(verdict(ON, "127.0.0.1")) });
  check("page(bare) draws the insecure banner", /class="insecure"/.test(bare));
  check("page(bare) without it draws nothing", !/class="insecure"/.test(page({ title: "t", body: raw("<p>x</p>"), bare: true })));
  check("the full page draws it too", /class="insecure"/.test(page({ title: "t", body: raw("<p>x</p>"), insecure: "X" })));

  // THE FORM, not only the copy. With `required` still on the input the browser refuses to submit
  // an empty code and the mode would save nobody anything — the server would never see the request.
  const offPage = String(loginPage({ bypass: verdict({}, "127.0.0.1") }));
  const onPage = String(loginPage({ bypass: verdict(ON, "127.0.0.1") }));
  check("normally the code field is required and patterned", /name="code"[^>]*\srequired[\s>]/.test(offPage) && /pattern="\[0-9\]\{6\}"/.test(offPage));
  check("under the bypass the code field is NOT required", !/name="code"[^>]*\srequired[\s>]/.test(onPage));
  check("…and carries no 6-digit pattern, which would reject an empty submit just as hard", !/pattern="\[0-9\]\{6\}"/.test(onPage));
  check("…and the page says password only", /Password only/.test(onPage));
  const refusedPage = String(loginPage({ bypass: verdict(ON, "0.0.0.0") }));
  check("a REFUSED bypass still demands a code on the form", /name="code"[^>]*\srequired[\s>]/.test(refusedPage));
  check("…and tells the reader why, rather than silently ignoring the variable", /REFUSED/.test(refusedPage));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
