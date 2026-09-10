# B2 — the admin console scaffold

**Built 2026-09-09.** Register: [`../../docs/decisions/DECISION-REGISTER.md`](../../docs/decisions/DECISION-REGISTER.md) §5.23, D221–D224.
Handover it answers: [`../../docs/handovers/2026-09-05-claude-code-handover-admin-console-scaffold.md`](../../docs/handovers/2026-09-05-claude-code-handover-admin-console-scaffold.md).

> ## STATUS — BUILT AND RUN. All eight exit criteria pass against PostgreSQL 17.
>
> **SINCE 2026-09-09, LATER STILL: Knowledge is real — ingestion and search from the browser.**
> That pass has its own section and its own exit criteria: **§10**, register §5.24, D226–D229. The
> assertion counts below are the scaffold's on the day it was built; the current totals are
> **`npm.cmd test` 366** and **`npm.cmd run test:db` 268**.
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
> **Charles clicked through it on 2026-09-09** (signed in as the dev tenant owner; the review queue, its
> badges and the gap cards matched §7). The session that built it cannot enter a password into a form
> (its own rule), so its own checks ran over HTTP from Node. **The design pass was applied the same
> day — §9.**
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
| `src/admin/kb-search.js` | **the console's search**, composed from `src/kb/retrieve.js`'s three exported functions (both legs, then the fusion) and writing no retrieval SQL of its own — §10.1 |
| `src/admin/router.js` | the front door: session → user → permissions → tenant; login/logout; the permission check, then the CSRF check, then the handler; CSP and the other headers |
| `src/admin/html.js` | the `html` tagged template that **escapes every interpolation by default**, the page shell, `notYet()` for stubs |
| `src/admin/pages/` | `login`, `review` (home), `tickets`, `knowledge`, `agents`, `metrics`, `settings` (+ `/admin/settings/audit`) |
| `src/tickets/query.js` | **the shared ticket query layer** — list, count by state, count by category, one ticket, set state, reporters. `bin/tickets.mjs` holds no SQL of its own any more |
| `bin/admin.mjs` | `create-user`, `users`, `roles`, **`reset`** (§10.6), `disable`, `enable`, `audit`, `totp` |
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
6. **Knowledge.** Expect 6 articles / 18 chunks / 18 embedded by `snowflake-arctic-embed2:568m`, a
   **search box at the top**, an **ingest form** near the bottom, and ONE "not yet" box (the editor).
   Then, and this is the part worth the time (§10):
   - Search **my mouse keeps cutting out**. Expect the bluetooth article first, `#1` in **both**
     legs, a **yes** in the "both" column, `0.032787` as its score (that is `2/61` — both legs
     agreed at rank 1), and the two legs shown side by side below with their own scores. Compare
     with `npm.cmd run kb -- legs "my mouse keeps cutting out"` from `server/`: **same articles,
     same ranks, same numbers.** If they differ, that is the finding.
   - Search something nothing covers, e.g. **how do I order a new laptop battery**. Expect zero
     lexical candidates, the dense leg returning everything anyway, five chunks still marked
     **sent**, and a sentence saying exactly that. **Expect no threshold line anywhere.**
   - Switch the platform to **windows** and search **keyboard shortcuts**. Expect the Windows
     reference article, which "any machine" hides on purpose.
   - Paste this into **Bundle JSON** and press the button — it is deliberately broken:
     `{ "articles": [ { "id": "a", "type": "howto", "title": "x" } ] }`. Expect a refusal naming
     `"a"` and its bad type, and the corpus figures unchanged.
   - Then paste a real one-article bundle (copy the shape from `docs/kb/generic-kb-v2.json`).
     Expect a report: inserted / updated / unchanged, chunks written, chunks embedded, the model
     name, and the corpus totals. Check those totals against `npm.cmd run kb:status`.
   - **A test article you ingest stays in the corpus**, and the console has no delete — that is the
     editor's, and the editor needs the sanitiser decision. Remove it by id in `psql`, or give it
     an id you will recognise later.
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

- ~~**Never seen in a browser.**~~ **Superseded 2026-09-09:** Charles clicked through the scaffold
  the day it was built, and the Knowledge screens were driven in a real browser later the same day
  (§10). The line is kept rather than deleted because the *reason* it was written still holds — the
  session that builds a screen cannot type a password into it, so its own checks run over HTTP from
  Node, and a page can pass every assertion and still be unreadable.
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
  authoring, which needs the markdown sanitiser decision (§10.7). A gap row *can* now be searched
  for (§10.1) — but only when its question text was logged, and **today none is** (D227). A visible
  gap is still D160a's value.
- **Vendor accounts exist as rows and can do nothing**, which is the intended state until D153's
  grant evaluation is built. The CLI will create one (`--role vendor_staff` with no tenant is not a
  CLI path; the live test creates one directly) so the refusal could be tested.
- **The review card on the endpoint is still unrendered** (carried from the demo-prep handover).
  Unrelated to this pass and still true.

---

## 9. The design pass, applied (2026-09-09, later the same day)

Claude Design answered the brief the same day ([`2026-09-09-admin-console-design-brief.md`](2026-09-09-admin-console-design-brief.md));
the handback is filed at [`../../docs/handovers/2026-09-09-claude-design-handback-admin-console.md`](../../docs/handovers/2026-09-09-claude-design-handback-admin-console.md)
and its artboards at `C:\Users\Charles\Downloads\Claude Handover Files\admin-console-design-handback-2026-09-09\`. **The
design system is the founder's "Industry" system** (register D225): steel on paper, Barlow Condensed
over Barlow, square corners, hairline frames, one accent, registration marks reserved for the gap
card and the honest stub.

**Applied, exactly as handed back:**

- The `CSS` constant in `src/admin/html.js` is the handback's stylesheet plus six lines of
  engineering additions at its foot (the two-column ticket detail, a generic `.row`, and
  `min-width: 0` on the ellipsised question, without which the 1fr column will not shrink).
- `notYet()` wears `marks`; `limit()` is a new component so a limitation sentence is a thing, not
  a paragraph; `page()` gained `bare` for the sign-in page.
- **Review queue:** fourteen cards became a list of native `<details>` rows, the first open. The
  "answer this gap" form is drawn **and disabled**, with the sentence saying why above its buttons
  (the handback's preferred honest state). The hit count is grouped on the normalised question
  text (`groupGaps()` in `queries.js`) and shown only when it is more than one — a gap with no
  text cannot be deduplicated and gets no count rather than a 1. Section count in the rule.
- **Tickets:** the four tiles went; one filters row carries the counts. "Nobody has been emailed" is
  a `limit()`. The detail is two columns with the state select and button on one row under
  "State — the one action on this page", and the limitation gained its second sentence.
- **Sign-in:** the two-column page; the loopback notice is the first thing on it, every word kept.
- **Agents:** the heading dropped "is not in this build" because the CSS kicker now says it — and
  the sentence was put back into the body, because the words stay in the markup, not in a
  stylesheet.
- The CSP gained `img-src data:` (the registration mark and select chevron are inline SVG data
  URIs) and `font-src 'self'` (for §9.1).

**Verified:** `npm.cmd test` 323 and `npm.cmd run test:db` 193 (eight new static rules and five live checks for the self-hosted fonts), all passing —
including the rules the design had to respect (no script on any page, every form still carries its
token, no `raw()`). Every restyled page rendered and inspected as owner and as auditor.

### 9.1 The fonts, shipped

Barlow 400 and 500 and Barlow Condensed 600 (latin subset, woff2, SIL Open Font License 1.1) are
**self-hosted from the hub** at `/admin/assets/` — `src/admin/assets.js` serves them from an
allow-list (a URL is looked up, never turned into a path), with no session required because the
sign-in page uses them, and with a year-long immutable cache. The three `@font-face` blocks in the
stylesheet point at those URLs; the CSP's `font-src 'self'` admits them and nothing else. Chosen
over the handback's inline-base64 suggestion because inline fonts would ride on every page (~65 KB,
uncacheable); the properties that mattered — same origin, offline-safe, no third party — hold either
way. Provenance in `src/admin/assets/SOURCES.md`. Fetched from Google Fonts on 2026-09-09 with the
founder's go-ahead; the files are unmodified.

### 9.2 The handback's two leftovers, done by engineering

The handback's did-not-do list (its §5) left two items that turned out to be engineering-sized, so
they were done here rather than sent back to design:

- **Sticky table headers.** The open decision was the scroll container. Decided: **the page is the
  scroll container** — nothing on the console scrolls inside a box — so a `thead th` sticks to the
  viewport's top with an opaque ground. One rule in the stylesheet. With it, **the ticket list pages
  at 50** (`?page=N`; the pager reuses the filter-row markup and appears only when there is more than
  one page); `listTickets()` gained an `offset`.
- **The audit log.** Given the gap list's row treatment as the handback suggested: a mono actor
  column, hairline rows running to the frame, the entry count in the section rule.

Verified by the existing suites (`npm.cmd test` 323, `npm.cmd run test:db` 193) and by paging the dev
tenant's seven tickets three at a time from a script.

---

## 10. Knowledge, made real: ingestion and search (2026-09-09, later still)

**Register:** [`../../docs/decisions/DECISION-REGISTER.md`](../../docs/decisions/DECISION-REGISTER.md) §5.24, **D226–D229**.
**Handover it answers:** [`../../docs/handovers/2026-09-09-claude-code-handover-kb-ingestion-and-search.md`](../../docs/handovers/2026-09-09-claude-code-handover-kb-ingestion-and-search.md).

> **STATUS — BUILT AND RUN, including in a browser.** `npm.cmd test` **366**, `npm.cmd run test:db`
> **268**, 0 failures, both run twice. The screens were driven in a real browser on 2026-09-09: a
> gap's "Search the corpus for this" link followed, a bundle pasted and ingested, a refusal read.
> **Both founder questions were answered the same day, and neither as asked.** **D226: yes,
> narrowed** — the search page quotes the text of the chunks `/v1/ask` would send and of no others,
> and it was built the same day the answer came. **D227: deferred behind a new D229**, a retention
> policy for logged question text, so `MATIC_KB_LOG_QUERIES` stays off and every gap row still
> reads "Question text was not logged". Nothing here is measured — no ingest timing, no search
> latency.

Knowledge had two honest stubs. It now has two working screens and one honest stub (the editor).

### 10.1 The three routes

| Route | Permission | What it does |
|---|---|---|
| `GET /admin/knowledge` | `knowledge.read` | The corpus: article, chunk and embedded counts, one row per article, **the search form**, and **the ingest form** (drawn only with `knowledge.write`). |
| `GET /admin/knowledge/search?q=…&platform=…` | `knowledge.read` | Both retrieval legs **unfused**, then the fusion. Ranks per leg, the fused RRF score, whether both legs agreed, and which chunks `/v1/ask` would actually send. |
| `POST /admin/knowledge/ingest` | `knowledge.write` | Validate the pasted bundle whole, write, refuse a second embedding model, embed, **report every count**. |

`src/admin/kb-search.js` composes `lexicalLeg`, `semanticLeg` and `fuseRRF` from `src/kb/retrieve.js`
and writes no retrieval SQL of its own. `POST .../ingest` calls `ingestAndEmbed()` in
`src/kb/ingest.js` — **the same function `node bin/kb.mjs ingest` calls** (D228). Both are the D224
argument one layer over: when the browser is doubted the terminal is what gets trusted, and that
only proves something if the two cannot disagree.

**The console's embedder is the endpoint's embedder.** `src/index.js` passes one provider instance to
both `askHandler()` and `adminHandler()`. A console that searched with a different embedder would be
a confident report about a pipeline nobody runs.

### 10.2 Why the search page shows three things instead of one

B7a's spec (§9 item 4) said to test each leg alone before fusing, because **a fusion of one working
leg and one dead leg returns plausible results in a plausible order and looks like a working
system.** The same is true of a search box. So the page carries:

- **the lexical leg alone** — `ts_rank` over the generated `tsvector`, GIN indexed. The leg that
  finds `DisplayLink` and `0x80070005`, which a dense embedder cannot.
- **the semantic leg alone** — cosine over pgvector, HNSW indexed, with the query embedded by the
  hub's own embedder. Its score **is** a magnitude in [-1, 1] and is shown as one.
- **the fusion**, grouped by article, with each chunk's rank in each leg, the fused score, a
  **"both"** column, and a mark on the chunks that would actually reach the model.

When an admin cannot find an article, the useful fact is not "search found nothing" — it is which
half failed. Four figures at the top say how many candidates each leg produced, how many survived
fusion, and how many of those `/v1/ask` would send.

### 10.3 What the screen says out loud, and why each sentence is there

- **The three caveats travel with every result** (CLAUDE.md's Never list): no cross-encoder
  reranker (D207), a dev embedder that is not D199's model (D203), and **no threshold is drawn,
  because one cannot be** — a fused RRF score is `2/61` or `1/(60+rank)`, so it encodes rank and leg
  agreement and carries no similarity magnitude (§5.16c, measured by `npm.cmd run kb:floor`).
- **"any machine" matches articles marked `any` and nothing else.** A `windows` article is invisible
  under it — deliberately, because that is what a machine whose platform probe failed sees, and
  admitting everything on an unknown platform is how a macOS article reaches a Windows user (D162,
  and the `"darwin".includes("win")` trap in §5.16b). The page also reports **how many chunks were
  eligible at all** under the filter, so "the article is not there" and "the article was filtered
  out before either leg saw it" become different readings of a thin result.
- **When the lexical leg is empty, the page says the rows are the dense leg alone**, which has no
  notion of "no match" and returns its nearest neighbours for any question. Five chunks are still
  marked *sent* for a question nothing covers; the decline is the prompt's job alone (D205). That is
  the shape an uncovered question makes, and it is worth a sentence every time rather than a
  footnote.
- **The chunk text on the page is the text the model was given, and only that** (**D226**, founder
  2026-09-09, decided narrower than it was asked). A chunk below the top `DEFAULT_TOP_K` shows its
  ranks and its score and no text. That set is exactly the text that produced — or failed to
  produce — an answer, so it is the smallest disclosure that answers the question the screen exists
  to answer, and D53's rule that chunk text does not leave the hub holds everywhere else. **The
  narrowing is structural, not editorial:** `src/admin/kb-search.js` sets `sentText` only when the
  chunk was sent and strips `text` from the legs, the fusion and the sent list before they leave
  the module, so a page cannot render an unsent chunk's text by forgetting a condition — there is
  none in the view model to render. Not markdown; `raw()` stays unused.
- **Cross-tenant, above the ingest button, in words:** the corpus is `control.kb_*` and generic by
  decision (D45), so ingesting here changes what **every** tenant's assistant answers.

### 10.4 What the ingest reports, and what it refuses

"Done" is what the CLI used to say. An empty corpus is a hub that declines everything and looks
correct doing it (D220, found on demo day), so the report is the feature: articles **inserted /
updated / unchanged** (knowable because of `source_hash`), **chunks written** out of the bundle's
total, **chunks embedded**, **which model embedded them**, and the corpus totals after. Exit
criterion 1 is that those totals equal what `npm.cmd run kb:status` prints, and a live assertion
compares them.

Three refusals, each for a different reason:

- **A bad article anywhere refuses the whole bundle**, before the database is touched, and the
  message names the offending id. A partial corpus is worse than none because it looks loaded.
- **A second embedding model refuses the EMBED step, not the ingest.** `embeddingModelConflict()` is
  a pure function over `corpusStatus()`. The articles and chunks land and retrieve lexically;
  `node bin/kb.mjs reembed` is the deliberate way to change models. `embedPending()` would in fact
  converge on its own — but one batch at a time, so an interrupted run leaves the mixed state, and
  "the fix happens to be the same call" is not a reason to let a browser form start it.
- **The embedder being down refuses nothing.** The ingest succeeds, the page says the chunks
  retrieve lexically only and names `node bin/kb.mjs embed`, and a later embed completes them. The
  same degradation the hub already has.

**Audited as `kb.ingest`** with the bundle id, the counts, the model and any refusal — and **never
the article text** (`src/admin/audit.js`: an audit table that copies the record it audits becomes a
second copy of the record, with a different retention story). A rejected paste is audited as
`kb.ingest.refused` with the reason.

**A search is not audited**, and `pages/knowledge.js` says why in a heading rather than leaving it to
inference: every other console read that got an audit row got one because it names a person, and a
corpus search names nobody — it reads the generic cross-tenant corpus, the same rows
`bin/kb.mjs legs` prints with no audit at all. A row per search would be a log of an admin's typing,
which is the thing D154 exists to constrain, pointed at the wrong person.

### 10.5 Found by running it, not by reading it

The handover's honesty ledger said `ingestBundle()`'s behaviour on a partially-invalid bundle had
never been exercised. It was exercised first, before the error page was designed:

- **Validation covers the whole bundle before the first write.** A bad `type` on the *second* of two
  articles left the corpus untouched. Now asserted with no database (`test/kb-static.test.mjs` §6a)
  and against a live one (`test/admin-db.test.mjs` KB-1).
- **Migration 002 has no `CHECK` on `platform`.** An article stamped `Windows 11` is written,
  indexed, embedded — and **matched by nothing**, because the pre-filter compares the column to
  `'any'` or to the probe's exact word. Legal, invisible, and it looks correct on this page and in
  `kb:status`. Reported at ingest as a warning ("RETRIEVED BY NOTHING") rather than refused:
  enforcing it is a migration and therefore a decision, and that decision is **not** taken here.
- **The report itself had the defect it exists to prevent.** It said "5 chunks written" beside "0
  inserted, 0 updated", because `upsertArticle()` returns an unchanged article's *existing* chunk
  count — right for "how big is this article", wrong for "what did this action do". Split into
  `chunksWritten` and `chunksInBundle`. Found by reading the page after a re-ingest.
- **One backtick inside the stylesheet's own comment ended the template literal** and broke every
  page in the console. `html.js`'s CSS is a JS template string; the comment now says so, next to the
  only new CSS this pass added (`.cols` — two equal columns, so the two legs read as peers rather
  than as a leg and its sidebar).

### 10.6 Also in this pass: `node bin/admin.mjs reset <tenant> <email>`

A new password and a new authenticator secret on the **same row**, printed once, with
`totp_last_step` cleared and every live session revoked; audited as `admin.reset`. Charles lost a
printed secret on day one and the only remedy was `disable` + `create-user` — a new account, whose
predecessor's audit history then belongs to nobody who can sign in.

All three changes move together for the reasons stated in `resetAdminCredentials()`. The one easy to
miss is clearing the replay state: `totp_last_step` holds a step number from the *old* secret, and
leaving it would make the first code from the new authenticator refusable for no reason the person
could work out. It does **not** re-enable a disabled account — a reset is about credentials,
`enable` is about status, and doing both would make one command two decisions.

### 10.7 Honesty ledger for this pass

- **Both founder questions were answered on 2026-09-09, and neither as asked** — which is the
  argument for having recorded them as decisions rather than resolving them in code.
  **D226: yes, but only for the chunks the model receives.** The narrower answer is better than the
  one proposed: the sent set is the text that produced or failed to produce an answer, so it is the
  smallest disclosure that answers the screen's question, and it leaves D53 intact for everything
  else. Built the same day; the narrowing is enforced structurally rather than by remembering.
  **D227: deferred behind D229**, a retention policy for logged question text, on the reasoning that
  a table of what employees typed needs a keeping rule before it has rows in it. The switch stays
  off. **The cost of that is real and lands here:** the review queue's one live feed keeps showing
  declines without their text, and the "Search the corpus for this" link below stays dead on real
  data. D229 is the cheapest open item in the project to answer, because nothing has been logged
  yet, so complying with any answer needs no migration and no deletion.
- **The review queue's gap link is a dead control on today's data.** 33 questions are logged and
  **none has its text**, so "Search the corpus for this" appears on no real row. It was verified
  against a seeded row in a browser and is asserted in the live suite; it becomes useful the moment
  **D229** is answered and D227 follows from it in a line of configuration, and not before.
- **The editor is still a stub**, and so is the review queue's answer form. Both need a markdown
  sanitiser first — admin-authored text shown to *other* admins — and writing one, or taking the
  first dependency since `pg`, is a decision.
- **Retrieval quality is not measured and this screen does not measure it.** Six articles, no
  reranker, a dev embedder that is not the shipped one. The screen makes retrieval *legible*; every
  ordering on it is still a floor.
- **Nothing is timed.** No ingest duration, no search latency, no embedder throughput.
- **The platform warning is a warning.** A bundle can still put an unretrievable article into the
  corpus; the console will tell you that it did.
- **`test/admin-db.test.mjs` embeds under the model name the corpus already uses**, because the KB is
  control-plane and has no test namespace (D45). That is stated at the top of the file. It deletes
  its articles by id in teardown; dropping its tenant would not.
- **No file upload.** There is no multipart parser and D221 forbids a dependency for one, so the
  ingest is a textarea and the page says so. The form body ceiling rose from 64 kB to 1 MB for this,
  and the page states the number.

---

## 11. D229 ratified and logging on (2026-09-09, evening)

The founder ratified D229 as recommended and D227 followed the same evening. From the next hub start
through the launcher, the retrieval log keeps the question text — so a gap in the review queue says
what was asked, and "Search the corpus for this" becomes a live control on real rows.

**The terms, as built:** text is kept **90 days** and then cleared, **the row staying** so no count on
Metrics or the review queue moves. The sweep runs **inside every log write** (`logRetrieval()` in
`src/kb/retrieve.js`); `node bin/kb.mjs prune-questions` is the manual form. The window is
configurable **downward only** through `MATIC_KB_QUESTION_RETENTION_DAYS` (a higher value is held at
90 and the hub says so at startup; 0 logs no text). An answered or dismissed gap clears its text at
once — a term the answer route must honour when it exists. `tools/launchers/start-hub.ps1` sets
`MATIC_KB_LOG_QUERIES=1` for the hub it starts; a hub started by hand logs nothing unless you set it.

**Not retroactive.** The 33 rows written before this evening stay without text; the review queue will
show real sentences from the next question asked.

**Verified:** `test/admin-static.test.mjs` §8b (ten source rules) and a live block in
`test/admin-db.test.mjs` that plants a 100-day-old and a 30-day-old row, logs a fresh one with the
switch on, and watches only the old text vanish; then shortens the window to 7 and watches the 30-day
row go; then sets 400 and sees 90; then sets 0 and sees a row logged with no text.
