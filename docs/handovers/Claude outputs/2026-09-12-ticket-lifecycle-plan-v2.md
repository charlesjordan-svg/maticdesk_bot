# Ticket lifecycle, comments, resolution notes and requester notification — PLAN v2

> **FILED 2026-09-12, SUPERSEDED by `../2026-09-12-ticket-lifecycle-plan-v3.md`, whose §0 lists what
> the review changed — including that this file's "auto-close needs no new infrastructure" was false.
> EVERY D-NUMBER IN THIS DOCUMENT IS VOID** (register §5.53a). Kept for the record.

**Date:** 2026-09-12
**Status:** PLAN. **Nothing in this document is built.** Every "will" is a proposal.
**Supersedes:** `2026-09-12-claude-code-handover-ticket-comments-and-notification.md` (plan v1) and
`2026-09-12-claude-code-handover-three-issues-analysis.md` (the analysis). Both are kept for
provenance; **this file is the one to read.** Where v1 and this disagree, this wins — v1's §5.1
recommendation was withdrawn, see §6.2.
**Register:** extends §3.9 (D68–D70a), §3.10 (D84–D86a), §3.12 (D73), §5.20 (D213–D218).
**Proposes:** D244–D256, all PROPOSED (the register covers D1–D243).

**Baseline read on 2026-09-12:** `server/src/tickets/{file,query}.js`,
`server/src/admin/pages/tickets.js`, `server/bin/tickets.mjs`,
`server/migrations/tenant/{003,004}*.sql`, `server/src/db/jobs.js`,
`server/docs/{B6-TICKET-STORE,B3-DEVICE-ENROLLMENT}.md`, `client/src/ticket/egress-audit.js`,
`client/src/router/social.js`, `client/src/profile/profile.js`.

**Knowledge cutoff:** May 2026. ITSM vendor behaviour, OWASP edition content and Electron
notification specifics are the parts most likely to have moved; every external claim is dated,
sourced, and listed in §9.

---

## 0. The question, answered first

**Resolved** means *IT believes it is fixed, and the requester has not yet agreed.* A claim awaiting
confirmation. The ticket is live: commentable, and the requester can push it back with one action.

**Closed** means *nobody is coming back to this.* Terminal, reached three ways — the requester
confirmed, a confirmation window expired in silence, or IT closed it with a reason. After closure the
record is read-only and a recurrence is a **new** ticket linked to the old one.

The gap exists for one reason: **the person who fixes a problem is not the person qualified to say it
is fixed.** Collapsing the two hands that judgement to the party with an incentive to close tickets.

Today `resolved` and `closed` are two labels an operator picks between, with identical behaviour, no
required text, and no requester involvement at all.

---

## 1. Baseline — what exists today

Read from the code, not the docs.

| Thing | State today |
|---|---|
| States | `new`, `open`, `resolved`, `closed` — `CHECK` in `003-tickets.sql`, `TICKET_STATES` in `query.js` |
| Transitions | `NEXT_STATES` in `query.js`. Console offers forward moves **and `closed → open`**. The CLI allows any state to any state, deliberately, as the operator's correction tool |
| Comments | **None.** No table, no column, no route, no UI |
| Resolution notes | **None reachable** — see §6.1 |
| Assignment | **None.** `suggested_owner` is a model's hint from a fixed enum, nullable, consumed by nothing |
| Requester notification | **None**, by design, said out loud on six surfaces (D86, `B6-TICKET-STORE.md` §0) |
| Requester ticket view | **None.** `client/src/router/social.js` can say *"you filed MD-1004 on Tuesday about X"* from the endpoint's own egress audit log — a memory of what was sent, not a status |
| Requester identity | Self-asserted `os_username` + a typed profile. `users.logon_sid` NULL. No device auth (D61/D132), no attestation (D148) |
| Job infrastructure | **Exists, unused for tickets.** `control.job_queue` (`src/db/jobs.js`): `{type, tenantSchema, refId, runAfter}`, `FOR UPDATE SKIP LOCKED`. Delayed auto-close needs no new infrastructure |
| Device enrollment | **Half exists.** `POST /v1/enroll`, `control.devices`, hashed rotatable secrets, pending queue, bulk revocation — built and tested (B3, D231). **The client never calls it**, and nothing verifies a request claiming to be a device |

`client/src/ticket/egress-audit.js` states the constraint in its own words:

> It is NOT the ticket's current status: nothing on the endpoint can see the hub's ticket table,
> that needs a route and a user identity that do not exist (D54, D68/D69).

---

## 2. Research — what ITSM practice says

All sources reached and read on 2026-09-12. Vendor behaviour changes; these are dated observations,
not invariants.

**2.1 Resolution and closure are two activities.** Atlassian separates *Resolution and Recovery* from
*Closure* and puts the requester in the second: *"Only service desk employees are allowed to close
incidents, and the incident owner should check with"* the reporter.
([Atlassian](https://www.atlassian.com/itsm/incident-management)) Advisera is more explicit about the
handoff: an operator *"declares that the service is restored and puts the incident record into
'Resolved' status"*, and *"after the customer confirmation, an incident record can safely be put into
'Closed' status."*
([Advisera](https://advisera.com/20000academy/knowledgebase/incident-resolution-closure-waiting-fat-lady-sing/))
The same source names the escape hatch for silence: *"it has somehow became an industry standard to
inform the customer in the small print of the resolution notification that the resolved incident will
be automatically closed if the resolution is not confirmed in, say, 24 or 48 hours."*

**2.2 Closed is terminal; resolved is not.** Zendesk: *"Solved means that the agent has resolved the
support issue."* — *"Closed means that the ticket is complete and can't be reopened."* — *"Until a
ticket is closed, the requester can reopen the ticket."* — *"Solved tickets are closed, typically, a
number of days after they have been set to Solved (the exact number of days depends on how an
Administrator set this up)."*
([Zendesk](https://support.zendesk.com/hc/en-us/articles/4408886739098-About-ticket-fields))

**2.3 Resolution text is mandatory and has two parts.** IBM's ServiceNow integration documentation:
*"By default, ServiceNow instances enforce a rule that requires the Resolution Code field (table
field name: `close_code`) and Resolution Notes field (table field name: `close_notes`) to be
populated when the incident is set to Resolved or Closed."*
([IBM Docs](https://www.ibm.com/docs/en/netcoolomnibus/noversion?topic=gateway-servicenow-incident-resolution))
A **code** you can count and **notes** a human reads. We have neither, and the enum half is what makes
resolution data reportable.

**2.4 The visibility split is real — D69's `[VERIFY]` can be closed.** D69 guessed *"believed comments
vs work_notes"*. The guess was right: ServiceNow carries two journal fields on the same record —
**Work notes** (internal) and **Additional comments (Customer visible)** — both in `sys_journal_field`.
([ServiceNow community](https://www.servicenow.com/community/servicenow-ai-platform-articles/work-notes-additional-comments-behavior-with-activity-or-always/ta-p/2327824),
[KB0696891](https://support.servicenow.com/kb?id=kb_article_view&sysparm_article=KB0696891))
**Mark D69's `[VERIFY]` resolved with these citations.** Steal their vocabulary: *work note* for
internal, *comment* for requester-visible. One word for both is how the wrong one gets rendered.

**2.5 Auto-close is a scheduled job on a configured interval.** ServiceNow uses a system property
`glide.ui.autoclose.time` (days) consumed by a job named *Autoclose Incidents*.
([ServiceNow community](https://www.servicenow.com/community/itsm-forum/auto-close-resolved-incidents-after-certain-amount-of-days/m-p/486466))
We have `control.job_queue` with `run_after`. No new infrastructure.

**2.6 A requester's reply changes the ticket's state.** Zendesk again: a Solved ticket the requester
replies to returns to **Open**, defined as *"the request has been assigned to an agent who is working
to resolve it."* And **Pending** is *"the assigned agent has a follow-up question for the requester."*
The reply is not merely appended and flagged — it re-enters the working set. §6.3 turns this into our
answer for the hardest problem in this plan.

**2.7 Communication is an obligation with an interval.** IT Process Wiki: 1st Level Support *"keeps
users informed about their Incidents' status at agreed intervals"*, and incident monitoring exists
*"to continuously monitor the processing status of outstanding Incidents, so that counter-measures
may be introduced as soon as possible if service levels are likely to be breached."*
([IT Process Wiki](https://wiki.en.it-processmaps.com/index.php/Incident_Management))

**2.8 What ITIL does not give you.** ITIL treats closure as an activity distinct from resolution and
requires user confirmation. It does **not**, from the sources I reached, publish a normative list of
state *names*; `resolved`/`closed` as values are a tool convention. `[VERIFY]` — no primary
Axelos/PeopleCert guide reached (paywalled). Treat 2.8 as inference from secondary sources.
**Consequence:** we are free to define the vocabulary. We are not free to skip the confirmation step.

---

## 3. What resolved and closed will mean in Matic Desk

| | `resolved` | `closed` |
|---|---|---|
| Meaning | IT believes it is fixed; requester has not agreed | Nobody is coming back to this |
| Set by | A console user, explicitly | The requester (confirm), the auto-close job, or a console user with a reason |
| Requires | Resolution code **and** requester-visible resolution notes. Refused without both | Nothing new |
| Requester told | Yes — the notification that matters most | Yes, briefly. Closure with no prior resolution gets its own text |
| Requester can reopen | Yes, one action, → `open` | **No.** A recurrence is a new linked ticket |
| Comments accepted | Yes, both kinds | No. Read-only |
| Counts as deflection | No — D89 counts *sessions*; an escalated session is already `escalated` | No |

**Console transitions change.** `NEXT_STATES` currently offers `closed → open`. Closed becomes
terminal in the console; reopening stays possible **only** through `bin/tickets.mjs`, which already
exists and already documents itself as the any-state correction tool. That split is the existing
design applied: *a button is a suggestion and a suggestion should be a sensible one.*

### 3.1 The fifth state — `pending_user`

The comment feature creates a situation four states cannot express: **IT asked the requester a
question and is waiting.** Without a state for it, that ticket sits in `open` looking identical to
active work, and the first ageing report or SLA clock measures the wrong thing.

Not our invention: Zendesk defines **Pending** as exactly this (§2.6), and every buyer arriving from
an ITSM will expect it. It is one value in one `CHECK` now versus a second migration later, and the
auto-close job applies to it too — a question nobody answers has to age out like a resolution nobody
confirms.

**Recommended, sourced. It is now a weaker decision to skip it than to take it.**

---

## 4. Decisions

All **PROPOSED**. D244–D252 come from the 2026-09-12 session with Charles; D253–D256 from the
best-practice analysis in §6.

| ID | Decision |
|---|---|
| **D244** | **A ticket carries a timeline with two visibilities: `comment` (requester-visible) and `work_note` (internal, never surfaced to the end user).** D69 applied, its `[VERIFY]` closed against §2.4. The two words are not interchangeable in code, console, CLI or copy |
| **D245** | **Requester and console user can both add a `comment` while the ticket is live.** Only a console user can add a `work_note`. The requester can never see or be sent a `work_note` |
| **D246** | **`resolved` requires a resolution code and resolution notes.** The console refuses the move without both (§2.3). Resolution notes are requester-visible and separate from the internal technical account that feeds the KB draft loop (D168/D239) — two fields because they are two claims, the same argument D214 makes about `description` vs `summary` |
| **D247** | **`closed` is terminal in the console; the CLI remains the correction tool.** A recurrence is a new ticket carrying `reopened_from` |
| **D248** | **The requester confirms, or the ticket auto-closes after a configured interval.** A delayed `control.job_queue` job (`ticket.autoclose`, `run_after = resolved_at + interval`), not a poller. The resolution notification states the interval, in the small print, per §2.1 |
| **D249** | **A ticket records the pair (`device_key_id`, `os_username`) at filing time.** Per-person history surviving a machine change, and a machine-to-machine audit trail. **Provenance, not authentication** — see D254 |
| **D250** | **Requester notification is in-app through the panel, not email.** The agent already lives on the user's screen; this is the half of D86 satisfiable without SMTP, and the half no ITSM competitor can do. D86's email stays open for the IT-facing half |
| **D251** | **When the panel is not in the foreground, an update raises a toast** — the product's own always-on-top window, not a native OS notification (§7.5) |
| **D252** | **Resolution notes are authored by whichever console user resolved the ticket** (`control.admin_users`, already in the audit trail). No assignment groups this pass |
| **D253** | **`close_note` is renamed `internal_resolution_note`, and every `tickets` column must have a writer or sit on a declared reserved list** enforced by a test (§6.1) |
| **D254** | **`POST /v1/enroll` returns a high-entropy per-install secret; the hub stores only its hash; the endpoint presents it on every request; ticket routes are scoped to the authenticated device.** This authenticates *a software installation* — not a machine, not a person (§6.2) |
| **D255** | **A requester comment is a state transition, not an append** (§6.3) |
| **D256** | **The console shows the *age* of the oldest unanswered requester comment on every screen** — not a count (§6.3) |

---

## 5. Overall review — the shape of this plan, honestly

Before the detail, four judgements about the plan as a whole.

**5.1 This is the smallest honest version of a feature the register already committed to.** Nothing
here is new scope. D69 (visibility-split comments) and D86 (status updates to the requester) have
been in the register since 2026-09-03 as part of B6 proper. What this plan adds is a route through
them that does not require SMTP first.

**5.2 The riskiest phase is P3, and it is risky for a reason worth naming.** Every other phase is
console work or client UI against a hub we control. P3 touches identity, which this project has
deliberately deferred four times (D60, D61, D63, D64) for sound reasons. D254 is a real narrowing of
that deferral and it must not be allowed to grow into a claim about hardware or users. If P3 starts
needing the named-pipe transport, stop — B3 §1 already made that argument and it is still right.

**5.3 The weakest part is the thing we cannot fix in code.** After all six phases, a requester's
comment still reaches a queue somebody has to choose to open. §6.3 makes that visible and survivable;
it does not make it a response-time commitment. That is a product gap, not an engineering one, and it
is the thing an IT buyer will find first.

**5.4 The most valuable thing in the plan is the smallest.** Not the timeline, not the notification —
the **resolution code** (§7.1). Six countable values on every resolved ticket is the first structured
data this product will have about *what actually fixes things*, and it is what D168's KB draft loop
and D89's deflection story both eventually eat. It costs one column and one `CHECK`.

---

## 6. Three problems, analysed against best practice

### 6.1 A column with no writer, and a migration comment that says otherwise

**What it is.** `migrations/tenant/004-session-outcomes.sql` adds `tickets.close_note` and asserts the
console offers it, the detail page reads it, and the CLI reads it. All three are false.
`stateBlock()` renders a select and a button; `statePost()` calls `setTicketState()` with no options,
so the `note` parameter that function accepts is never passed; `getTicket()` returns `closeNote` and
no renderer prints it. **No writer, no reader.**

**Why it is worse than a stale comment.** A migration comment is read by the next person to touch the
schema, *before* they read the code — the reader least able to check it. It also carries D239's
rationale for the column existing, so there is every reason to trust it and no prompt to verify.

**Best practice.** Fowler's *Evolutionary Database Design* frames a database change as three
coordinated changes: *"Changing the database schema," "Migrating the data," and "Changing the database
access code."* ([martinfowler.com](https://martinfowler.com/articles/evodb.html)) 004 did the first,
had no data to migrate, skipped the third, and documented the third as done. The article's operative
controls are version-controlled DB artifacts (we have) and *"a large body of automated tests"* (the
one that catches this, we do not).

**The repo already knows how.** D224 forces all ticket SQL into one file and
`test/admin-static.test.mjs` §5 fails if it moves — a structural test enforcing a documented claim.
The discipline exists; it was never pointed at columns.

**A second problem found while analysing the first.** ServiceNow's *requester-facing* resolution text
is the field named **`close_notes`** (§2.3). Keeping our `close_note` as the **internal** note leaves
us with the industry's field name and the opposite visibility — a trap for the next engineer, for
D85's SoR-flip field mapping, and for any ServiceNow integration.

**Recommendation (D253), three parts, all in P0:**

1. **Wire it** — console form field, `statePost()` passes it, detail page renders it,
   `bin/tickets.mjs state --note` and `show` prints it. Rewrite 004's comment to describe the code.
2. **Rename** to `internal_resolution_note`, freeing `resolution_notes` for the requester-visible
   field in P2 without inverting ServiceNow's meaning.
3. **No-orphan-columns test** — read `tickets`' columns from `information_schema`, assert each appears
   in `src/tickets/query.js` or `src/tickets/file.js`, fail otherwise **unless on an explicit reserved
   list in the test file with a one-line reason.** `logon_sid`, `external_id` and `session_id` go on
   it with their decision numbers.

The reserved list is the point, not an escape hatch: it turns "deliberately unused" from a claim in a
comment into an entry the test suite reads. D224's move, applied to schema.

**Prove it in this order:** the test fails against `close_note` *before* the fix, passes after.

---

### 6.2 The read-back route — and the recommendation this plan withdraws

**What it is.** Showing a requester their ticket needs a hub route returning rows that carry a named
person's location, contact details and their own account of their problem. Nothing authenticates the
caller. B3's status block: *"nothing checks that a request claiming to be an enrolled device actually
is one."*

**This has a name.** OWASP API Security Top 10 (2023) ranks it **API1: Broken Object Level
Authorization** — first in the list.

> *"Object level authorization is an access control mechanism that is usually implemented at the code
> level to validate that a user can only access the objects that they should have permissions to
> access."*
>
> *"Attackers can exploit API endpoints that are vulnerable to broken object-level authorization by
> manipulating the ID of an object that is sent within the request."*

Prevention is two things: an authorization check *"for every database access operation"* using a
client-supplied identifier, and *"prefer the use of random and unpredictable values as GUIDs for
records' IDs."* ([OWASP](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/))

**Why plan v1's recommendation fails.** v1 proposed restricting the route to references the endpoint
already holds. That is not an authorization check — it is an unguessability argument, and our
identifier is **sequential by deliberate design**. `003-tickets.sql`:

> A separate sequence rather than the uuid, because a person reads this one out on the phone. Starts
> at 1000 so the first ticket is MD-1000 and the format does not change width immediately.

Correct for a phone reference; exactly what OWASP says not to rely on. `MD-1000`–`MD-1999` is a
thousand guesses. The other factors do not save it: `os_username` follows an org naming convention,
`device_key_id` is a string the client asserts and nothing verifies. **The identifier cannot be fixed,
because its readability is a product requirement.** So the route is either authenticated or it does
not exist.

**Options.**

| Option | Verdict |
|---|---|
| **A.** Reference list + `(device_key_id, os_username)` — plan v1 | **Withdrawn.** Obscurity over a sequential ID |
| **B.** Wait for D61 — TPM key, signed assertion, short-lived token | Correct destination, **loses as a gate**: needs D60/D63's key and D64's custody, which need the named-pipe transport (D200/D201), designed and not built. Blocks P3–P5 behind a multi-month slice; B3 §1 already argued against rushing a partial custody chain |
| **C.** Per-ticket capability secret, stored hashed, presented on read | A real check with the tightest blast radius, grounded in W3C's *Good Practices for Capability URLs* (unguessable, revocable, HTTPS). **Loses on fit**: listing "my tickets" needs every token at once, and a reinstall loses access to the user's own tickets permanently |
| **D.** Per-install bearer secret minted at enrollment | **Recommended** |

**Recommendation (D254).** `POST /v1/enroll` returns a high-entropy secret; the hub stores only its
hash; the endpoint sends it on every request; ticket routes are scoped to the authenticated device.

Why this size:

- **It is an authorization check.** The caller proves it holds a secret the hub issued rather than
  asserting an identifier the hub cannot verify. That is what moves us out of API1:2023 — not the
  choice of identifier.
- **The pattern is built and tested here twice.** `enrollment_secrets.secret_hash` stores a hash and
  shows plaintext once; `admin/session.js` does `sha256(token)` for session cookies. A third instance
  of an existing discipline, not a new idea.
- **Revocation already exists and currently revokes nothing meaningful.** `revokeDevices()` and the
  console's bulk revoke (D83a) are built; today revoking a device stops nothing. With a token,
  revocation becomes a real control — the existing feature starts doing what its name says.
- **It is a step on D61's path.** D61 is a bearer credential presented per request and exchanged for a
  short-lived token. Same route shape, weaker credential. When D60/D63/D64 land, the secret is
  replaced by the signed assertion and the routes do not change.
- **It fixes `POST /v1/ticket` too**, which is unauthenticated today.

**What it must be called.** This authenticates *a software installation* — not a machine, not a
person. B3's status block should change from "device authentication is not built" to: *device
installation authentication is built; hardware-bound device identity and user attestation are not
(D60, D63, D64, D148).* Anyone with the user's machine and their local store **is** that device. Say
so on the route, in `/v1/health`, and in the register — the `notified: false` discipline applied to a
credential.

**Two limitations to accept now rather than discover later:**

1. **A reinstall is a new device** and sees no earlier tickets from the endpoint. Cross-machine
   history stays a console capability, where an authenticated admin joins across `device_key_id` —
   which is what D249's pair is for. The agent says *"tickets filed from this machine"*, honestly.
2. **On a shared machine the token is machine-wide.** `os_username` remains a filter but is
   client-asserted, so a shared install is machine-scoped in practice. **Recommend a per-tenant
   setting** disabling requester read-back for machines flagged multi-user, defaulting to enabled for
   single-user installs. One column, decided now.

---

### 6.3 A requester comment that lands where nobody is watching

**What it is.** The moment the panel accepts a comment, a user can report that a problem has got
worse and nothing tells anyone. The feature manufactures the defect class this project has caught
three times: a UI implying a capability that does not exist. This time we build it ourselves.

**Best practice, part one — communication has an interval attached** (§2.7). Both the monitoring
function and the "agreed intervals" obligation presuppose someone watching. We have neither.

**Best practice, part two — and this is the solution.** In mainstream tooling a requester's reply
**changes the ticket's state** (§2.6). Zendesk's Solved → Open on reply is not a flag on a message;
it moves the ticket back into the working set. Email is how Zendesk *also* tells you. The state
change is how the queue cannot miss it.

**Why that reframes the problem.** Plan v1 treated this as "the comment needs a notification we cannot
send." Better: **the comment needs to change what the queue looks like.** We already have a queue six
surfaces agree is the queue. A comment that does not alter it is a suggestion box; a comment that
reopens a ticket is a work item. And it removes the dependency — no SMTP, no deliverability, no bounce
handling, just a transition in a code path we are writing anyway.

**Recommendation (D255) — the requester's comment is a transition:**

| State when the requester comments | Result |
|---|---|
| `resolved` | → `open`. Cancels the pending `ticket.autoclose` job. Matches Zendesk's reopen behaviour |
| `pending_user` | → `open`. The question is answered; it is workable again |
| `new` or `open` | Stays; sets `awaiting_agent_since` if not already set |
| `closed` | Refused (D247). The panel offers "raise a new ticket about this", pre-linked via `reopened_from` |

**Recommendation (D256) — show the age, not the count.** *"Oldest unanswered: 41h"* on every console
screen, where the "NOBODY HAS BEEN EMAILED" limit note already sits. A count of 3 is ignorable; an age
is not. It is the cheapest analogue of §2.7's monitoring function, and when SLA timers arrive this is
the field they attach to.

**Supporting — the composer must not promise a response.** Draft panel copy: *"This goes to the IT
queue. Nobody is paged — they'll see it next time they open the queue."* Blunt and true.

**What this does not fix, plainly.** D255 and D256 make the gap **visible and survivable at pilot
scale** — one tenant, a handful of tickets a week, an IT person told to check the queue. They do not
make it *acceptable* in a sale: nothing here gives an IT lead a response-time commitment, because a
pull-based queue cannot make one. **Recommend treating D86's outbound email to the IT alias as the
gate on the first paying pilot, not on the demo.** That is a commercial sequencing call and it is
yours; the engineering claim is only that these layers are enough to demo honestly and not enough to
sell.

---

## 7. Design

### 7.1 Schema — `tenant/005-ticket-timeline.sql`

**`ticket_entries`** — the timeline, one table, two visibilities (D244):

| Column | Notes |
|---|---|
| `id uuid PK` | |
| `ticket_id uuid NOT NULL REFERENCES tickets(id)` | |
| `kind text NOT NULL` | `CHECK (kind IN ('comment','work_note','state_change','resolution'))` |
| `visibility text NOT NULL` | `CHECK (visibility IN ('public','internal'))`. **Set by one write path, never by the caller** — a `work_note` arriving with `visibility='public'` is D69's failure in one bad request |
| `body text NOT NULL` | |
| `author_kind text NOT NULL` | `CHECK (author_kind IN ('requester','console_user','agent','system'))` |
| `author_user_id uuid REFERENCES users(id)` | when the requester wrote it |
| `author_admin_user_id uuid` | **no FK, on purpose** — `control.admin_users` is control-plane, this is tenant data (D143) |
| `author_label text` | the console user's email as at write time. A snapshot, not a join |
| `created_at timestamptz NOT NULL DEFAULT now()` | |
| `notified_at timestamptz` | when the requester was actually told. NULL = not yet |
| `read_by_requester_at timestamptz` | drives "unread" in the panel |

Indexes: `(ticket_id, created_at)`, and partial on `(ticket_id) WHERE author_kind='requester' AND notified_at IS NULL`.

**`tickets`** gains:

- `resolution_code text` — `CHECK (resolution_code IS NULL OR resolution_code IN (...))`. Start short:
  `fixed`, `workaround`, `no_fault_found`, `duplicate`, `withdrawn_by_user`, `referred_to_vendor`.
  Six countable values; extend by migration, never by free text. **§5.4: this is the highest-value
  column in the plan.**
- `resolution_notes text` — requester-visible (D246)
- `resolved_at`, `closed_at timestamptz`, `closed_by text` (`requester` | `auto` | `console_user`)
- `awaiting_agent_since timestamptz` — D256's clock
- `device_key_id text` — D249's other half
- `reopened_from uuid REFERENCES tickets(id)` — D247's link
- `pending_user` added to `tickets_state_known` (§3.1)
- **`close_note` renamed `internal_resolution_note`** (D253), with 004's comment rewritten

### 7.2 Query layer — D224 holds

Everything new in `src/tickets/query.js`. No SQL against `tickets` or `ticket_entries` anywhere else,
so CLI, console, endpoint route and sessions store cannot disagree about what a ticket is.
`test/admin-static.test.mjs` §5 already fails if that rule breaks — extend it to the new table, and
add §6.1's no-orphan-columns test beside it.

New: `addEntry()`, `listEntries(schema, ref, {visibility})`, `resolveTicket()`, `confirmResolution()`,
`reopenTicket()`, `oldestUnansweredRequesterComment(schema)`.

**`listEntries()` takes a required visibility argument with no default.** A default is how internal
text reaches a user's screen eighteen months from now.

### 7.3 Hub routes

All require the D254 device token; all refuse a client-supplied tenant, as `/v1/ask` and `/v1/ticket`
already do.

| Route | Notes |
|---|---|
| `GET /v1/tickets` | Scoped to the authenticated device, filtered by `os_username`. Public entries only. Response carries an honesty field naming what the credential does and does not prove |
| `POST /v1/ticket/:reference/comment` | Requester comment. Always `visibility:'public'`, `author_kind:'requester'` — the route has no parameter for anything else. Applies D255's transition |
| `POST /v1/ticket/:reference/confirm` | → `closed`, `closed_by='requester'`, cancels the auto-close job |
| `POST /v1/ticket/:reference/reopen` | `resolved → open` with a required reason, recorded as a public comment |

### 7.4 Console

- Detail page grows a **timeline**, newest last, internal entries distinguished by a **label, not only
  a colour** — it has to survive a screenshot.
- **Two separate composers**: *Add work note* (internal) and *Reply to requester* (public). Two
  buttons, never one control with a visibility dropdown; a dropdown defaulting wrong is D69's failure
  mode with a UI attached.
- State form gains resolution code + resolution notes, shown **only** when the next state is
  `resolved`; the POST refuses `resolved` without both.
- **D256's age indicator** on every screen, where the limit note sits.
- `ticket.comment`, `ticket.worknote`, `ticket.resolve` join `ticket.state` and `ticket.view` in audit.
- `closed` offers no forward transition (D247).

### 7.5 Endpoint

- **Enrollment at startup.** The client calls `POST /v1/enroll` once, persists the device id and the
  D254 secret beside the profile, and sends the secret on every hub request. This is the client half
  of B3 that was never built. It generates **no key** — an opaque stable id plus an issued secret is
  all D249/D254 need, and calling it a key would overstate it (D60/D63 remain unbuilt).
- **Polling.** `GET /v1/tickets` on an interval. Polling not push: no inbound connection, works
  through every NAT and firewall, hub stays stateless. Interval configurable, default in minutes.
- **Panel ticket view** — the user's tickets with state and public timeline. The first requester-facing
  read of hub data in the product.
- **Toast when not foregrounded** (D251): the product's own small always-on-top `BrowserWindow` plus
  `win.flashFrame()`. Not a native OS notification — there is no `Tray` and no `Notification` anywhere
  in `client/src/main/` today, native Windows toasts have packaging and shortcut requirements
  `[VERIFY]`, and an OS toast looks like every other OS toast. The avatar is the differentiation.
- **Copy discipline.** The resolution note is written by IT *for* the requester, so the avatar may
  present it — as a quotation, attributed, never in Hazel's own voice. D214's defect was the assistant
  reading a case note aloud as if it were her own thought; the same trap is here with a different
  field name.

### 7.6 Auto-close

On `resolved`: `enqueue({ type:'ticket.autoclose', tenantSchema, refId: ticketId, runAfter: resolved_at + interval })`.
The worker **re-reads state before acting** and no-ops if the ticket moved. Interval is a per-tenant
setting with a shipped default. §2.1's 24–48h is what the industry does; for a service desk where the
user is on the machine, **72 hours** is the safer first default — long enough to survive a weekend or
a day off, which is exactly when a premature close is most annoying. One column; your call.

---

## 8. Phases

**Effort is estimated engineer-weeks with a range, not a measurement.** One engineer working with
Claude Code against this repo.

| # | Goal | Scope | Exit criteria (falsifiable) | Est. |
|---|---|---|---|---|
| **P0** | Stop the schema lying | Wire the note into console + CLI; rename `close_note` → `internal_resolution_note`; no-orphan-columns test; rewrite 004's comment | The new test fails against `close_note` **before** the fix and passes after. `npm run tickets -- show MD-x` prints a note written from the console | 0.3–0.5 |
| **P1** | The timeline exists, console-side only | `005` migration, `ticket_entries`, query functions, two composers, CLI rendering, D256's age indicator. **No notification, no endpoint** | A work note and a comment on one ticket render distinguishably in console **and** CLI; a test proves `listEntries(visibility:'public')` cannot return an internal row | 1.2–1.7 |
| **P2** | Resolution means something | `resolution_code`, `resolution_notes`, `resolved_at`/`closed_at`/`closed_by`, refused transitions, `closed` terminal in console | Moving to `resolved` without both fields is refused with a sentence, not a constraint violation. `closed` offers no console forward move; the CLI still moves it | 0.8–1.2 |
| **P3** | The endpoint has an identity | Client enrollment, D254 token mint/verify/storage, `device_key_id` on the insert, `GET /v1/tickets` scoped to the authenticated device, honesty fields, multi-user setting | A request with a valid reference and a wrong or absent token returns nothing and says why; a revoked device's token stops working on its next request | 1.5–2.5 |
| **P4** | The user sees updates | Panel ticket view, polling, requester comment POST with D255's transitions, toast + flashFrame | An IT reply typed in the console appears in the panel within one poll interval and raises a toast with the panel minimised. A requester comment on a `resolved` ticket moves it to `open` in the console | 1.2–1.7 |
| **P5** | Closure works as §3 says | Confirm/reopen routes and panel actions, `ticket.autoclose` job, per-tenant interval, `pending_user` | A resolved ticket with no response auto-closes after the configured interval **and not before**; a confirm cancels the job; a reopen returns it to `open` with the reason in the timeline | 0.5–1.0 |
| **P6** | *(scoped, not scheduled)* D86 email | Outbound to an IT alias, requester email fallback, bounce handling | — | not estimated |

**Total P0–P5: roughly 5.2–8.4 engineer-weeks.** An estimate, not a commitment.

### Contingency and rollback

| # | If it goes wrong | Rollback |
|---|---|---|
| P0 | The no-orphan test surfaces columns nobody remembers deciding about — that is the test working. Put them on the reserved list with a decision number, or delete them | One revert; the rename is the only schema change and it is reversible while nothing reads the column |
| P1 | If two composers confuse on screen, fall back to console-only work notes and delay requester-visible comments to P4, where the panel tests them anyway | `DROP TABLE ticket_entries`; `005` is otherwise additive. Console reverts cleanly |
| P2 | The resolution-code enum will be roughly wrong — nobody has resolved a real ticket in this system. Ship it, revise by migration after ~50 real resolutions | Columns nullable; drop the console's refusal and it degrades to optional text |
| P3 | **Highest-risk phase.** If the token needs the pipe transport (D200/D201) for anything, **stop and re-scope** — do not build a partial custody chain (B3 §1). Fall back to console-side history only and record D249/D254 as half-implemented | Endpoint sends no token; routes stay console-only; the column is nullable |
| P4 | If polling load bites (it should not at pilot scale), lengthen the interval before building push | Feature-flag the panel view off; the hub route is harmless unread |
| P5 | If auto-close fires wrongly even once in testing, **disable the job and ship confirm/reopen alone.** An incorrectly closed ticket is the most damaging bug in this plan — the product telling a user their unfixed problem is finished | Set the interval NULL to stop enqueueing; in-flight jobs no-op on re-read |

### Kill criteria — decided in advance

- **P3 cannot produce a stable installation credential without the pipe transport.** Stop, re-scope,
  and tell the user their ticket list is per-machine — honestly — rather than shipping an identity
  that is not one.
- **Internal text appears anywhere requester-facing in the first real click-through.** Stop everything
  and fix D69's enforcement before another line is written. This is the one failure an apology does
  not recover.
- **The resolution-code enum cannot be filled honestly by the first ten real resolutions** — every one
  lands on `other`/`fixed`. The vocabulary is wrong and §5.4's value proposition is not there; revise
  before building anything downstream of it.

---

## 9. Verification register

| Claim | Status |
|---|---|
| ServiceNow requires `close_code` + `close_notes` on Resolved/Closed out of the box | Sourced (IBM Docs). Vendor default, may have changed |
| ServiceNow `glide.ui.autoclose.time` + *Autoclose Incidents* job | Sourced (ServiceNow community). **Default value not established — do not quote a number** |
| ServiceNow work notes internal vs additional comments customer-visible | Sourced (ServiceNow community + KB0696891) |
| Zendesk Solved/Closed/Open/Pending semantics; requester reply reopens to Open | Sourced (Zendesk official, article dated 2026-09-01) |
| Zendesk's specific auto-close interval | **Not established.** Zendesk says admin-configured; a 28-day figure appears on a third-party reseller help centre, not Zendesk's. **Do not quote 28 days** |
| ITIL requires user confirmation before closure | Sourced (Atlassian, Advisera) — both secondary |
| ITIL 1st-line informs users "at agreed intervals"; monitoring pre-empts SLA breach | Sourced (IT Process Wiki) — a secondary interpretation, not primary Axelos/PeopleCert |
| ITIL 4 does not prescribe state names | `[VERIFY]` — inference from secondary sources; no primary guide reached (paywalled) |
| "24 or 48 hours" as the standard confirmation window | Sourced (Advisera) as a characterisation of common practice, not a measured figure |
| OWASP API1:2023 BOLA definition, exploitation, unpredictable-GUID guidance | Sourced (owasp.org 2023 edition). A newer edition may exist |
| W3C capability-URL good practices | Sourced (w3.org/TR/capability-urls/) — a Note, not a Recommendation |
| Fowler, *Evolutionary Database Design* — three coordinated changes | Sourced (martinfowler.com). The principle is what is applied, not the specifics |
| Native Windows toast requirements from Electron (AppUserModelId, installed shortcut) | `[VERIFY]` — believed, unchecked against current Electron docs. §7.5's recommendation does not depend on it |
| Guessability of `MD-####` and `os_username` | **Reasoning, not a test.** Nobody has attempted enumeration against this hub |
| A per-install bearer token is a smaller change than D61's assertion exchange | **Engineering judgement.** Rests on reading B3 §1 and `src/devices/enrollment.js` |
| Everything in §1 and §6.1 about this repo | Verified by reading the listed files on 2026-09-12 |
| All effort figures in §8 | **Estimates.** Nothing here has been built or measured |

---

## 10. Open questions — one line each

1. §3.1: adopt `pending_user`? *(Recommended, now sourced.)*
2. §6.3: ship the requester comment box with D255/D256 and honest copy, or build D86's IT email first?
   *(Recommended: ship now, email next — but see 3.)*
3. §6.3: is D86's email the gate on the **first paying pilot**? Founder call; it sequences P6 against
   everything else.
4. §6.2: accept per-install bearer authentication as an interim, named as not-D61? *(Recommended.)*
5. §6.2: shared/multi-user machines — a setting that disables requester read-back, or accept
   machine-scoped visibility? *(Recommended: the setting, defaulting to enabled.)*
6. §6.1: rename `close_note` now, while nothing reads it? *(Recommended — never cheaper than today.)*
7. §7.6: auto-close interval default — 72 hours, or something else?
8. Does an auto-closed ticket notify the requester at close, or is the resolution notice the last thing
   they hear? *(Recommended: a short close notice; silence looks like a bug.)*
9. Can a requester comment on a `new` ticket nobody has opened, or only from `open` onward?
10. Resolution-code enum — are §7.1's six right for your buyer, or do you want values separating "we
    fixed it" from "nothing was broken" (`user_educated`, `no_action_required`)? The deflection story
    may care.
11. §7.5: does the avatar **speak** an update proactively, or only show and toast?
    *(Recommended: show-and-toast; an avatar that interrupts is uninstalled.)*

---

## 11. Where this gets built

**Claude Code, in this repo.** A migration, a query layer, four hub routes, a console page, and client
work across main and renderer, with tests that run against a live PostgreSQL. Not a chat window,
which cannot verify its own claims.

The one piece that benefits from **Claude Design** is the panel's ticket timeline and the toast — and
that goes through the existing Design → Git handover workflow, not drawn in code first.
