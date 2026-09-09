# Claude Code Handover — 2026-09-09 — the admin console scaffold, built

**Answers:** [`2026-09-05-claude-code-handover-admin-console-scaffold.md`](2026-09-05-claude-code-handover-admin-console-scaffold.md) (now on disk here, copied from `Downloads/`).
**Repo root:** `C:\Users\Charles\Downloads\maticdesk_bot`. **Branch:** `b2-admin-console`, off `main` at `da78704`, **not merged, not pushed.**
**Register:** v2.20, D1–D224, next free **D225**. §5.23 is this pass.
**The document:** [`../../server/docs/B2-ADMIN-CONSOLE.md`](../../server/docs/B2-ADMIN-CONSOLE.md). Read its §7 — it is the ten-minute click-through and it is for Charles.

---

## 0. Where the handover was wrong, and what was done about it

The handover said in its ledger that it had not read the register at v2.18, and it showed:

| It said | What is true | Effect |
|---|---|---|
| Register v2.18, next free D220 | v2.19, D220 taken (the demo-prep pass) | This pass is D221–D224 |
| Home = review queue is "my proposal, worth disagreeing with" | **D177, ratified 2026-09-04.** D185 names the retrieval log as its feed | Built as home without asking |
| "Watch D158 — an approval workflow in B2 is Phase 2 through the back door" | D158 is author ≠ approver for the **catalog**. The review queue approves **KB** drafts; D168 separates the two | No conflict. Nothing to watch |
| Metrics "partial — confirm whether outcomes are written" | Confirmed: **nothing writes them.** The endpoint creates no sessions; `t_devco.sessions` has 0 rows; D90's turn is unbuilt | Metrics shows the one real figure (questions asked/answered/declined) and says why deflection cannot be computed |
| `admin_roles` "exists" | It has a name and a scope and **nowhere for a permission to live** | Migration `control/003` adds `admin_role_permissions` |

## 1. Three questions asked before building, and the founder's answers (2026-09-09)

1. **Gap text** — D177 says show gaps; D154 says unescalated transcripts go to nobody; a declined
   question with no ticket is unescalated. Options offered: gated to owner/admin + audited + a
   proposed decision; masked until decided; show to any admin. **Answer: show to any admin.** → D223.
2. **Ticket writes** — the handover scoped tickets read-only, leaving login and logout as the only
   audited actions. **Answer: include the state change.** → D224.
3. **Branch** — **Answer: feature branch, committed, not pushed.** → `b2-admin-console`.

## 2. What is on disk

| Path | What |
|---|---|
| `server/migrations/control/003-admin-console.sql` | role permissions, sessions (token hash), TOTP replay counter, the five D152 roles seeded |
| `server/src/admin/` | `auth.js` (scrypt, RFC 6238 TOTP, base32), `session.js`, `audit.js`, `users.js`, `permissions.js`, `tiers.js` (D154 as a function), `queries.js`, `router.js`, `route.js`, `html.js` (escape-by-default tag), `pages/` × 7 |
| `server/src/tickets/query.js` | **the shared ticket query layer.** `bin/tickets.mjs` now holds no SQL |
| `server/bin/admin.mjs` | `create-user`, `users`, `roles`, `disable`, `enable`, `audit`, `totp` |
| `server/src/index.js` | mounts the console after the loopback refusal; `GET /` names it in a `console` field, not in `routes` |
| `server/test/admin.test.mjs` (65), `admin-static.test.mjs` (62) | in `npm test` — now **296** |
| `server/test/admin-db.test.mjs` (80) | in `npm run test:db` — now **188**. Declared in `run-all.mjs`'s exclusion list with why and how |
| `server/docs/B2-ADMIN-CONSOLE.md` | the document, exit criteria, security notes, click-through, ledger |
| Register §5.23, `CLAUDE.md`, `PROJECT_START_HERE.md`, `server/package.json` (`npm run admin`) | updated |

**Dev database state:** `control` at 003. Two dev admins in `devco`: `owner@devco.test`
(tenant_owner) and `auditor@devco.test` (auditor). Their secrets were printed once to this session's
terminal and are **not** in any file; disable them rather than recover them. MD-1006 was **not**
changed — the state change was exercised on the test's own tenant, which it removed.
Docker Desktop was started by this session (it was down).

## 3. What was run

- `npm.cmd test`: 5/5 files, 296 assertions. `npm.cmd run test:db`: 3/3 files, 188 assertions.
- The hub started with `MATIC_EMBED_PROVIDER=none` and every console page fetched over HTTP as the
  owner and as the auditor; the HTML was saved and inspected. The login page was viewed live in a
  browser. **No password was typed into a browser** — that is the session's own rule, and it is why
  §7 of the document exists.
- Ran three times against the same database; the suite creates and removes its own tenant.

## 4. Found and left

1. **The auditor can read escalated tickets.** Within D154's letter (a ticket is escalated), arguably
   outside its spirit (the auditor is neither assignee nor tenant admin). Assignment does not exist so
   nobody is an assignee. Recorded in the document §6; **revisit when assignment lands.**
2. **The retrieval log is hub-wide, not tenant-scoped** (`tenant_label` is a dev label, D61/D132
   unbuilt). The review page and the Metrics page say so. A `WHERE` clause when device auth lands.
3. **No login-CSRF token** on the sign-in form (no session yet). `SameSite=Lax` is the defence.
4. **`Secure` on the cookie is conditional** on TLS / `MATIC_ADMIN_COOKIE_SECURE=1`. The loopback
   refusal makes that safe; the day the bind changes, the flag becomes unconditional the same day.
   `CLAUDE.md` Never-list carries this.
5. **No step-up (D157).** None of its five actions exists in the console. `totp_verified_at` is
   recorded so it is a check to add.
6. **The review queue shows gaps and cannot act on them.** D177's one-click approve is article
   authoring — the next pass.
7. **The endpoint's review card is still unrendered** (carried from 2026-09-05). Unrelated.

## 5. Next, in the handover's order

1. **Charles clicks through** (`B2-ADMIN-CONSOLE.md` §7, ten minutes). Findings go in a handover, not
   into the list.
2. **KB ingestion and search in the console** — upload or point at a bundle, chunk, embed, **report
   chunk counts**; then admin search running `src/kb/retrieve.js` with rank and score per leg. The
   Knowledge page's two stub boxes name exactly this.
3. **Then the article editor**, which needs a markdown sanitiser before the first article is typed
   into a browser (`raw()` in `html.js` stays unused until then; a test enforces it).
4. **Session outcomes** (D89/D90/D188) before any more of Metrics or the other three review feeds.
5. **Agents last** — B3.

## 6. Honesty ledger

- **Never clicked through in a browser.** Every assertion ran over HTTP from Node; the rendered HTML
  was read, not the live site.
- **Nothing is measured.** No latency, no scrypt timing, no page weight. §10.3's four measurements
  are unchanged.
- **Security-reviewed by nobody.** The loopback bind stands in for the review.
- **The two dev accounts' secrets are in this session's terminal scrollback and nowhere else.**
- **`git status` on `main` still shows two uncommitted launcher `.ps1` edits** from before this
  session. Left alone; they are on `main`, not on this branch.
