# Claude Code Handover — 2026-09-05 — the admin console scaffold

**Repo root:** `C:\Users\Charles\Downloads\maticdesk_bot`.
**Register:** v2.18, D1–D219, next free D220.

**Founder direction:** all admin functionality lives in one place, extremely intuitive, covering
tickets, a metrics dashboard, KB ingestion, agent approval (with auto-approve), and a view of
connected agents. Build the scaffold so those can be added to it.

**Why this matters more than it looks:** `04-TEAM-REVIEW` §9 A5 is *"one IT person can maintain a
catalog"*, and §10's stop condition is *"catalog authoring stays engineer-only, meaning content cost
scales with headcount."* This console is the instrument that tests A5. It is not a convenience layer.

---

## 0. Current state — no console exists

Five routes: `GET /`, `GET /v1/health`, `POST /v1/ask`, `POST /v1/turn`, `POST /v1/ticket`.
`GET /` is a JSON diagnostic index. **All admin function is CLI** — `bin/tickets.mjs`, `bin/kb.mjs`,
`bin/kb-floor.mjs`, `bin/db.mjs`. No HTML, no session, no auth (`x-matic-hub-auth: none`, correctly
advertised).

### What each requested feature can actually show today

| Feature | Data source | State |
|---|---|---|
| **Tickets** | `tenant/003-tickets.sql`, `POST /v1/ticket`, `bin/tickets.mjs` | **Real.** Build this first |
| **KB ingestion** | `src/kb/ingest.js`, `chunk.js`, `embed.js`, `bin/kb.mjs` | **Real.** UI over working code |
| **Metrics** | `tenant/002-session-outcome.sql` exists | **Partial.** Confirm whether outcomes are being *written* — D83's confirmation turn was approved on 2026-09-05 and may not be built. If not, the table is empty and the dashboard has nothing |
| **Agent approval / auto-approve** | `devices`, `enrollment_requests` in `control/001` | **No source.** Nothing populates them. Needs device identity and enrollment — B3, 6–8 engineer-weeks |
| **Connected agents** | Same | **No source.** Same blocker |

**The scaffold must make the empty ones visibly not-yet rather than fake.** An admin screen showing
"0 connected agents" when the concept does not exist teaches the operator the product is broken. It
should say "device enrollment is not in this build" — the same discipline as *"nothing was filed"*
and `x-matic-hub-auth: none`, which is a pattern this codebase already applies well.

---

## 1. B2 is the gate, and it is now first

Local accounts, TOTP, roles, admin-action audit. Deferred on founder direction when the goal was the
agent answering questions; **it is a prerequisite now.**

Nothing blocks it: D152–D160 are ratified and the tables exist in `control/001-control-plane.sql`
(`admin_users` with `totp_secret`, `admin_roles`, `admin_role_grants`, `admin_audit` with
`event_class` and `step_up`, `vendor_access_grants`). Days of work, and the schema is already the
shape the decisions describe.

**Four things not to skip, and each is cheap now:**

- **TOTP from day one** (D156). The console reads audit containing employee transcripts and the
  users table. A password alone will not survive a security review.
- **Admin-action audit from the first request** (D156). Who revoked what, who read which transcript.
  Retrofitting an audit trail is how you end up with gaps you cannot explain.
- **Roles carry permissions; permissions never attach to users** (D152).
- **D146's three transcript tiers.** Aggregate metrics to any admin; transcripts for **escalated**
  sessions to the assignee and tenant admin; **unescalated transcripts to nobody.** Sessions that
  resolved without a ticket were addressed to the avatar alone. Build this into the query layer now —
  it is a legal exposure in jurisdictions requiring employee notice, not only a security control, and
  it is far harder to add once screens read freely.

**Watch D158.** Ratified but inert — author ≠ approver governs catalog changes, and D149 deferred
catalog distribution. If an approval workflow appears in B2, that is Phase 2 scope arriving through
the back door.

---

## 2. Technology — server-rendered HTML, no build step

**Recommendation: plain server-rendered HTML from the existing Node service, progressively enhanced
with a little JavaScript. No framework, no bundler, no build step.**

Three reasons, all from the project's own constraints:

- **§5's dependency discipline.** "Every extra daemon is a pager" applies to a build toolchain too. A
  bundler is a thing that breaks on someone else's machine during an install.
- **Customer-hosted deployments (D59a).** The hub must install on a customer's own box. "Run `npm
  install` and a Vite build" is a materially worse install story than "run the service."
- **The forms are simple.** A ticket list, an ingest upload, an article editor. None of that needs a
  SPA, and a SPA would need auth tokens where a session cookie is sufficient.

Forms should work without JavaScript; JavaScript makes them nicer. That also means the console
degrades rather than blanks when something fails.

### Security notes specific to adding a browser UI

This is a genuinely new attack surface for the hub and worth getting right at the scaffold stage
rather than after:

- **Session cookies:** `HttpOnly`, `Secure`, `SameSite=Lax`, server-side session store.
- **CSRF tokens on every state-changing form.**
- **XSS in article content is the real one.** Articles are admin-authored markdown rendered back to
  *other* admins. That is untrusted content crossing between users — the same audience problem as
  `summary`, one layer out. Escape by default, and if markdown is rendered, use a sanitiser rather
  than trusting the author.
- **Bind the console the way the hub binds today** until auth is proven: refuse non-loopback, and say
  so on the index page.

---

## 3. Information architecture

Six destinations. Everything reachable in two clicks.

| | Purpose |
|---|---|
| **Review queue** *(home)* | Gaps, drafts, repairs. Badged with a count |
| **Tickets** | Queue, filters, one ticket's detail |
| **Knowledge** | Articles, search, ingest |
| **Agents** | Connected, pending approval, auto-approve setting |
| **Metrics** | Deflection by outcome, category, time |
| **Settings** | Tenant config, admin users, auto-approve toggle |

### One proposal that differs from the order you listed

**Home should be the review queue, not tickets or metrics.**

Tickets and metrics are things an admin *reads*. The review queue is the only screen where the
admin's few minutes convert into the product getting better — approve a draft, answer a gap, repair
a failing article. It is the screen A5 lives or dies on, and putting it behind a click makes it
optional.

It also has content on day one without anyone authoring anything, because **every D205 decline is a
gap candidate with the question attached.** An empty home screen teaches people the tool is not for
them.

Your call — but if tickets is home, the review queue needs a badge visible from every screen.

### What makes it intuitive, concretely

- **One obvious next action per screen.** The review queue is a stack with an approve button, not a
  table with a toolbar.
- **Counts everywhere.** An admin should know where the work is without opening anything.
- **No empty screen without an explanation** of why it is empty and whether that is expected.
- **Admin search runs the same hybrid retrieval the agent uses**, showing rank and score. If the
  admin cannot find an article, neither can the bot. This is the single most useful thing in the
  console and it is free — the retrieval code exists.

---

## 4. Scaffold scope for this pass

**A thin vertical slice, not six empty pages.** Prove login, navigation, layout, audit and one real
data path end to end. Then each subsequent feature is an addition rather than an integration.

**In:**

1. B2: login, TOTP, roles, admin-action audit.
2. Layout and navigation for all six destinations, with five of them as honest stubs naming what is
   missing and why.
3. **Tickets, fully working, read-only.** Real data, real list, one detail view. Chosen because it has
   data today, it is the simplest possible slice, and it exercises the whole stack: session → role
   check → tenant-scoped query → render → audit.
4. `bin/tickets.mjs` and the console read through **the same query layer.** Two code paths to the
   same data diverge, and the CLI is the thing that will be trusted when the console is doubted.

**Out of this pass:** KB ingestion UI (next), metrics, agents, article editing, the rule engine, and
anything in the growth design note.

### Then, in order

**KB ingestion**, because it is the next one with working code behind it. Upload or point at a file,
chunk, embed, report what landed — **and report chunk counts**, since an empty corpus produces a hub
that declines everything and looks correct doing it. Then article search using the agent's retrieval.

**Metrics** after confirming outcomes are being written.

**Agents** last, since it needs B3.

---

## 5. Worth using Claude Design for the layout

"Extremely intuitive" is design work, and iterating on layout and information hierarchy in code is
slow. **Claude Design is the better tool for exploring the review queue and ticket screens** —
canvas, fast iteration, something to react to — then Claude Code implements the chosen direction as
server-rendered HTML.

The parts that need design attention rather than engineering: the review queue's card, what an
"approve" looks like when it is one click, and how a stub screen explains its own emptiness without
looking broken.

---

## 6. Exit criteria — falsifiable

1. An admin logs in with password plus TOTP and reaches the console.
2. A second admin with a read-only role cannot reach a page their role forbids, proven by a test
   that tries.
3. Every admin action appears in `admin_audit` with actor, action and timestamp.
4. **An unescalated session's transcript is not reachable through any console route**, proven by a
   test that tries (D146).
5. The ticket list shows real rows from the tenant schema, and `bin/tickets.mjs` shows the same rows.
6. The five stub destinations each state what is missing and why — no zeroes standing in for absent
   concepts.
7. `server/` tests pass; the console does not appear in `GET /`'s route list as an API surface.
8. The console refuses non-loopback until auth is reviewed, and says so.

---

## 7. Honesty ledger

- **Metrics may have no data.** Whether session outcomes are being written is unverified — check
  before building a dashboard over an empty table.
- **"Connected agents" and "approve agent requests" have no data source and cannot be built
  honestly** in this pass. The tables exist; nothing populates them.
- The IA in §3 is a proposal. The home-screen argument is mine and worth disagreeing with.
- I have not read the register at v2.18, `server/docs/B1-CONTROL-PLANE.md`, or
  `server/docs/B6-TICKET-STORE.md`. Where they disagree with this, they win.
- Nothing here is measured.
