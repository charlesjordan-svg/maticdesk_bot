# B2 — the admin console scaffold

**Built 2026-09-09.** Register: [`../../docs/decisions/DECISION-REGISTER.md`](../../docs/decisions/DECISION-REGISTER.md) §5.23, D221–D224.
Handover it answers: [`../../docs/handovers/2026-09-05-claude-code-handover-admin-console-scaffold.md`](../../docs/handovers/2026-09-05-claude-code-handover-admin-console-scaffold.md).

> ## STATUS — BUILT AND RUN. All eight exit criteria pass against PostgreSQL 17.
>
> **`npm.cmd test`: 296 assertions, 0 failures, no database** — the 169 that were there plus 65 for
> the console's pure parts (`test/admin.test.mjs`: TOTP against RFC 6238's published vectors,
> scrypt, base32, escaping, cookies, CSRF, D154's tier function) and 62 source rules
> (`test/admin-static.test.mjs`).
>
> **`npm.cmd run test:db`: 188 assertions, 0 failures** — the 108 that were there plus **80 for the
> console end to end** (`test/admin-db.test.mjs`): it creates its own tenant, admins and ticket,
> starts the hub on an ephemeral port, signs in with password + TOTP, tries every page as an owner
> and as an auditor, changes a ticket's state through a CSRF-protected form, compares the page with
> `bin/tickets.mjs`, tries five transcript-shaped URLs, and reads the audit table after each step.
>
> **What has NOT happened: nobody has clicked through it in a browser.** The session that built it
> cannot enter a password into a form (its own rule), so every page was exercised over HTTP from
> Node and the rendered HTML was looked at, not the live site. §7 is the click-through, for Charles.
>
> Nothing here is measured. Login latency, scrypt cost, page render time: not measured.

---

## 0. Read this first

**The console lives in the hub process at `/admin`.** Server-rendered HTML, no framework, no
bundler, no build step, **no new dependency** — `pg` is still the only one (D221). Sign in at
`http://127.0.0.1:8787/admin/login`.

**It is loopback-only, like everything else in the hub, and it says so on the login page.** The
sign-in and session code is real and it has **not had a security review**; the loopback bind is
what stands in for one until it happens (exit criterion 8).

**Home is the review queue** (D177, ratified 2026-09-04 — the handover offered this as a proposal
but it was already decided). It has one feed with data today: the questions the assistant declined.

**Five of the six destinations are honest stubs.** Each says what is missing, why, and which item
supplies it. None shows a zero for a concept that does not exist: the Agents page shows **no count**,
because "0 connected agents" when enrollment is not built teaches the operator the product is broken
(exit criterion 6).

**Tickets is the one fully working slice**: real rows, one ticket's detail, and a state change. It
reads through **the same query module the CLI reads through** (D224), so the two cannot disagree.

---

## 1. Cold start

```bash
cd server
npm.cmd run db:up
npm.cmd run migrate                                  # applies control/003-admin-console.sql
node bin/db.mjs create-tenant devco                  # if there is no tenant yet
node bin/admin.mjs create-user devco you@example.com --role tenant_owner
npm.cmd start
```

`create-user` prints, **once**, an initial password and the authenticator secret (base32, plus an
`otpauth://` URI to paste into an authenticator app). Neither is stored in the clear and neither can
be shown again. There is no QR code in this build; type the secret or paste the URI.

Then open `http://127.0.0.1:8787/admin/login` and sign in with the email, the password and the
six-digit code. **All three, always** (D156). There is no account creation in the browser — §4 says
why.

For Charles, from PowerShell:

```powershell
cd C:\Users\Charles\Downloads\maticdesk_bot\server
node bin/admin.mjs create-user devco charles.jordan@maticdesk.com --role tenant_owner
```

Two dev accounts already exist in `devco` from the build session (`owner@devco.test`,
`auditor@devco.test`); `node bin/admin.mjs users devco` lists them. Their secrets were printed once
to that session's terminal and are not recorded here; disable them (`node bin/admin.mjs disable devco
owner@devco.test`) rather than trying to recover them.

---

## 2. What is built

| Path | What |
|---|---|
| `migrations/control/003-admin-console.sql` | `admin_role_permissions` (the table D152 needed and 001 lacked), `admin_sessions` (hash of the cookie token, never the token), `admin_users.totp_last_step` (replay defence) and `.last_login_at`, the five D152 roles seeded with permissions |
| `src/admin/auth.js` | scrypt password hashing (self-describing parameters), RFC 6238 TOTP over HMAC-SHA1, base32, constant-time compares. `node:crypto` only |
| `src/admin/session.js` | the cookie (`HttpOnly; SameSite=Lax; Path=/admin`, `Secure` when TLS — §5), the server-side store, idle and absolute expiry, per-session CSRF secret |
| `src/admin/audit.js` | `audit()` — one row per action, refusal or record view; a failed audit write fails the action |
| `src/admin/users.js` | admin users, roles, grants; `permissionsFor()` is the one join from user to permission |
| `src/admin/permissions.js` | the permission vocabulary and the six destinations with the permission that opens each |
| `src/admin/tiers.js` | D154's three transcript tiers as a function nothing calls yet — §6 |
| `src/admin/queries.js` | control-plane reads: the gap feed, question counts, the corpus listing, the tenant row |
| `src/admin/router.js` | the front door: session → user → permissions → tenant; login/logout; the permission check, then the CSRF check, then the handler; CSP and the other headers |
| `src/admin/html.js` | the `html` tagged template that **escapes every interpolation by default**, the page shell, `notYet()` for stubs |
| `src/admin/pages/` | `login`, `review` (home), `tickets`, `knowledge`, `agents`, `metrics`, `settings` (+ `/admin/settings/audit`) |
| `src/tickets/query.js` | **the shared ticket query layer** — list, count by state, count by category, one ticket, set state, reporters. `bin/tickets.mjs` holds no SQL of its own any more |
| `bin/admin.mjs` | `create-user`, `users`, `roles`, `disable`, `enable`, `audit`, `totp` |
| `src/index.js` | mounts the console after the loopback refusal and before the API routes; `GET /` names it in a `console` field, **not** in `routes` |

### Roles and permissions (D152), as seeded

| Role | Can |
|---|---|
| `tenant_owner` | everything below, plus `admins.manage` |
| `tenant_admin` | review (read, act), tickets (read, write), knowledge (read, write), metrics, agents (read, manage), settings (read, write), audit |
| `it_agent` | review (read, act), tickets (read, write), knowledge (read, write), metrics |
| `auditor` | audit, metrics, tickets (read), settings (read). **Cannot** open the review queue or the knowledge base, **cannot** change a ticket — the read-only role exit criterion 2 tries |
| `vendor_staff` | **nothing.** D153 makes vendor access a time-boxed grant, never a standing permission. A vendor account is refused at sign-in, by name |

Permissions attach to roles. There is no per-user permission anywhere, and `test/admin-static.test.mjs`
fails if a table or query shaped like one appears.

---

## 3. The eight exit criteria

| # | Criterion | Where | Status |
|---|---|---|---|
| 1 | An admin logs in with password plus TOTP and reaches the console | `admin-db.test.mjs` §1 | **PASS.** Wrong TOTP, wrong password and unknown email all get the same 401 and the same sentence; the right pair gets a 303 and an `HttpOnly; SameSite=Lax; Path=/admin` cookie; the same code a second time is refused (RFC 6238 §5.2) |
| 2 | A read-only role cannot reach a page its role forbids, proven by a test that tries | §2 | **PASS.** The auditor gets 403 on `/admin`, `/admin/knowledge`, `/admin/agents`, and on POSTing a state change even with a valid CSRF token; each refusal is an `access.denied` audit row naming the permission |
| 3 | Every admin action appears in `admin_audit` with actor, action and timestamp | §3, and throughout | **PASS.** `login.failed`, `login.ok`, `ticket.view`, `csrf.refused`, `ticket.state.refused`, `ticket.state` (with `{from, to}`), `access.denied`, `session.logout`; the CLI writes `admin.created` / `admin.disabled` |
| 4 | An unescalated session's transcript is not reachable through any console route | §4, `admin.test.mjs` §7, `admin-static` §7 | **PASS, and see §6.** Five transcript-shaped URLs → 404; the sessions table has no content column; `tiers.js` refuses the unescalated tier unconditionally; the only admin file reading `sessions` selects counts |
| 5 | The ticket list shows real rows and `bin/tickets.mjs` shows the same rows | §5 | **PASS.** `listTickets()` → the page → the CLI (spawned) all carry the same reference; a state change through the form is visible to the CLI |
| 6 | The five stub destinations each state what is missing and why | §6 of the live test, `admin-static` §6 | **PASS.** Agents runs no query at all |
| 7 | `server/` tests pass; the console is not in `GET /`'s route list | §7, `admin-static` §1 | **PASS.** Named in a separate `console` field so a human finds it |
| 8 | The console refuses non-loopback until auth is reviewed, and says so | inherited from `src/index.js` (`turn.test.mjs`), login page text (§8) | **PASS** |

These are pass/fail against a real system. **None is a performance number.**

---

## 4. Things decided while building, and why

- **Same process, `/admin` prefix, not a second port.** One thing to run and one loopback rule
  (D59a: a customer-hosted hub installs by running the service). The API's `x-matic-hub-auth: none`
  is unchanged; console pages carry `admin-session`, and the login page carries `none`.
- **One login form, three fields.** TOTP is mandatory so there is no reason for a second screen,
  and a single form means a password alone never produces a half-authenticated state.
- **Same error for every failure.** "Sign in failed" whether the email is unknown, the password
  wrong or the code wrong, and the password check runs even when there is no user, so response time
  does not say which. The audit row says which (`detail.why`), for the operator.
- **A vendor account is refused at sign-in rather than logged in to nothing.** A grant-evaluation
  path is not built (D153); a vendor who can sign in and see an empty console would be a vendor one
  bug away from seeing a full one.
- **Reads of records naming a person are audited; list views are not.** `ticket.view` yes; the
  tickets list and every aggregate no. The audit records access to people, not clicks.
- **`event_class` is `normal` everywhere; `step_up` is `false` everywhere.** D155's break-glass class
  is for when local accounts are the fallback to federation; today they are the only accounts.
  None of D157's five step-up actions exists in the console yet; `admin_sessions.totp_verified_at`
  is recorded so step-up is a check to add, not a migration.
- **The Agents page runs no query.** Enrollment is B3; the tables are shapes. A count would be a
  lie with a number on it.
- **Metrics shows what it can count and names what it cannot.** Questions asked / answered /
  declined from the retrieval log are real (and hub-wide — see below). Deflection is not computable
  and the page says exactly why: no sessions are created and D90's confirmation turn is unbuilt.
- **No account creation in the browser yet.** A create form hands back two secrets that need a
  one-time display, and creating an admin arguably wants a step-up (D157 "policy changes"). The CLI
  does it until both exist, and the Settings page names the command.
- **The state change is the console's first write, on purpose.** The handover scoped tickets as
  read-only; the founder chose to include it (2026-09-09) so that exit criterion 3 has something
  more than login and logout to audit. The console offers only `NEXT_STATES`; the CLI still allows
  any state, as a correction tool.
- **Gap text is readable by any admin with `review.read` (D223).** The founder decided on
  2026-09-09 that a declined question in the retrieval log is a gap record, not a transcript under
  D154. The question text is only present when `MATIC_KB_LOG_QUERIES=1` was set (the hub default is
  off), and the card says so when it is absent. In the dev database today: 14 declines, 0 with text.

---

## 5. Security notes, and what is deliberately conditional

- **Escaping is the default, not a habit.** `html\`…\`` escapes every interpolation unless it is
  the result of another `html` call or of `raw()`. No page uses `raw()`, and a test fails if one
  does before a sanitiser exists — the day admin-authored markdown is rendered back to other admins
  is the day this matters most (handover §2).
- **CSP on every console response:** `default-src 'none'; style-src 'unsafe-inline'; form-action
  'self'; base-uri 'none'; frame-ancestors 'none'`. No script source at all, so the pages carry no
  JavaScript and every form works without it. Also `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Cache-Control: no-store`.
- **CSRF: two layers.** `SameSite=Lax` on the cookie, and a per-session token (`HMAC-SHA256(csrf_secret,
  "form")`) as a hidden field on every state-changing form, checked in constant time before the
  handler runs. A `Sec-Fetch-Site` header of anything but `same-origin`/`none` is refused before the
  token is even looked at. **The login form has no token** — there is no session yet — which leaves
  login-CSRF (logging a victim into the attacker's account) to `SameSite=Lax`; a pre-session token
  is the fix and is in the ledger.
- **`Secure` on the cookie is conditional**, and this is the one place the handover's list is not
  followed to the letter: it is set when the socket is TLS or when `MATIC_ADMIN_COOKIE_SECURE=1`
  says TLS is in front. The hub speaks plaintext HTTP on loopback and nothing else, so there is no
  TLS for the flag to bind to, and a console whose login silently fails in one browser is the kind
  of defect this project keeps finding on screen. **The loopback refusal is what makes the
  conditional safe. The day the hub binds to anything else, this must become unconditional** —
  `admin-static.test.mjs` §4 pins that the file says so.
- **Failed-login throttle:** five failures per email lock it for a minute, in-process. A speed bump,
  not a control; the audit row per failure is the durable record.
- **Sessions:** 8 hours idle, 24 absolute, revocable per user (`disable` revokes). The store holds
  `sha256(token)`; a database read logs nobody in.
- **What a security review will ask, and the honest answers:** the code has not been reviewed; the
  transport is plaintext (loopback-only); there is no rate limit that survives a restart; there is
  no step-up; there is no login-CSRF token; tenant isolation is `withTenant()` and D195's caveat
  applies (`search_path` confines accident, not intent).

---

## 6. D154 in the query layer, and what "proven by a test that tries" means today

**There is no transcript storage in this build.** `sessions` has no content column (B1 §11) and the
endpoint creates no sessions at all. So exit criterion 4 is true trivially, and a trivial truth is
not what the criterion is for.

What was built so the first transcript screen has to answer the question: `src/admin/tiers.js`.
Three tiers as data — aggregate, escalated, unescalated — and `transcriptAccess()`, which returns
`allowed: false` for the unescalated tier **unconditionally**: not for the tenant owner, not for the
assignee, not for a session holding every permission at once, and not "unless break-glass", because
this build has no break-glass event. The unit test tries all of those. The static test asserts the
`case "unescalated"` branch returns `false` with no condition in front of it.

What the live test tries: `/admin/sessions`, `/admin/sessions/<uuid>`, `/admin/transcripts`,
`/admin/transcript/1`, `/admin/tickets/MD-1000/transcript` — all 404 — and that the tenant's
`sessions` table has no text-shaped column.

**A ticket is not a transcript.** Its `description` is the reporter's own words, entered through an
escalation the user accepted, and the ticket is by definition escalated (D154 tier 2: assignee and
tenant admin). The console shows it to any role with `tickets.read`, which today includes the
auditor. That is a judgment call recorded here: an auditor reading escalated tickets is within D154's
letter (they are escalated) and arguably outside its spirit (the auditor is neither assignee nor
tenant admin). Assignment does not exist yet, so "assignee" is not a role anyone holds. **Revisit when
assignment lands.**

---

## 7. The click-through — for Charles

No session can see a screen, and this one would not type a password into one. Ten minutes:

1. `node bin/admin.mjs create-user devco <your email> --role tenant_owner` from `server/`. Put the
   otpauth URI into an authenticator app (or type the base32 secret).
2. Open `http://127.0.0.1:8787/admin`. Expect a redirect to the sign-in page with the loopback notice.
3. Sign in with a wrong code once. Expect "Sign in failed." and no hint which field.
4. Sign in properly. Expect the **Review queue** with a red badge on it (14 in the dev database),
   fourteen gap cards each saying the question text was not logged, and the "Drafts, staleness and
   duplicates" box explaining why those feeds are empty.
5. **Tickets.** Expect the seven real tickets (MD-1000…MD-1006), the state tiles, and "Nobody has
   been emailed". Open MD-1006. Expect the reporter block to say **self_asserted — not
   authenticated**. Move it to `open`. Expect a green "State changed to open" and the CLI to agree:
   `npm.cmd run tickets -- show MD-1006`.
6. **Knowledge.** Expect 6 articles / 18 chunks / 18 embedded by `snowflake-arctic-embed2:568m`, and
   two "not yet" boxes (search; ingest and edit).
7. **Agents.** Expect no numbers at all — two boxes saying enrollment is B3.
8. **Metrics.** Expect real question counts, tickets by category, and "Deflection cannot be computed"
   with the D89/D90 reason.
9. **Settings.** Expect your account with "you", the two dev accounts, the roles table, and the link
   to the **Audit log**, which should now list every step you just took, newest first, with your
   email on each.
10. Sign out. Expect the sign-in page; the back button should not show a console page.

If anything on that list does not happen, that is a finding; record it in the handover rather than
adjusting the list.

---

## 8. Honesty ledger

- **Never seen in a browser.** Every assertion above ran over HTTP from Node. The HTML was read and
  rendered from files; the live site was not clicked. §7 is the check.
- **Nothing is measured.** No latency, no scrypt timing, no page weight.
- **The retrieval log is hub-wide, not tenant-scoped**, because `tenant_label` is a development
  label (D61/D132 unbuilt). The gap feed and the question counts are for the hub; the pages say so.
  When device auth lands they gain a `WHERE` clause.
- **The `Secure` cookie flag is conditional** (§5). Correct on plaintext loopback; must become
  unconditional the day the bind changes.
- **No login-CSRF token.** `SameSite=Lax` is the only defence on the login form itself.
- **No step-up (D157).** None of its five actions exists here yet; `totp_verified_at` is recorded
  for when one does.
- **The failed-login throttle is per process.** A restart clears it.
- **The auditor can read escalated tickets** (§6). Within D154's letter; revisit at assignment.
- **The review queue can show gaps and cannot act on them.** D177's one-click approve is article
  authoring, which is the next pass. A visible gap is still D160a's value.
- **Vendor accounts exist as rows and can do nothing**, which is the intended state until D153's
  grant evaluation is built. The CLI will create one (`--role vendor_staff` with no tenant is not a
  CLI path; the live test creates one directly) so the refusal could be tested.
- **The review card on the endpoint is still unrendered** (carried from the demo-prep handover).
  Unrelated to this pass and still true.
