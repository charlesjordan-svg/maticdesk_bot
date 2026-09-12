# Handover — ticket comments, resolution notes, and requester notification

> **FILED 2026-09-12 AS PLAN v1, SUPERSEDED by `2026-09-12-ticket-lifecycle-plan-v3.md`. EVERY
> D-NUMBER IN THIS DOCUMENT IS VOID** (register §5.53a). Kept for the record; do not work from it or
> cite an ID from it.

**Date:** 2026-09-12
**Status:** PLAN. **Nothing in this document is built.** Every "will" below is a proposal.
**Register:** extends §3.9 (D68–D70a), §3.10 (D84–D86a), §3.12 (D73), §5.20 (D213–D218).
**Proposes:** D244–D252 (PROPOSED — the register covers D1–D243).
**Baseline read:** `server/src/tickets/{file,query}.js`, `server/src/admin/pages/tickets.js`,
`server/bin/tickets.mjs`, `server/migrations/tenant/{003,004}*.sql`, `server/docs/B6-TICKET-STORE.md`,
`server/docs/B3-DEVICE-ENROLLMENT.md`, `client/src/ticket/egress-audit.js`, `client/src/router/social.js`.

**Knowledge cutoff:** May 2026. ITSM vendor behaviour (ServiceNow property names and defaults,
Zendesk status semantics, Atlassian guidance) is the part of this document most likely to have moved
since; every vendor claim below is dated and sourced, and the ones I could not source are marked
`[VERIFY]` and collected in §9.

---

## 0. The question, answered first

**Resolved** means *IT believes it is fixed, and the requester has not yet agreed.* It is a claim
awaiting confirmation. The ticket is still live: it can be commented on, and the requester can push
it back with one action.

**Closed** means *nobody is coming back to this.* It is terminal. It is reached one of three ways:
the requester confirmed, a confirmation window expired in silence, or IT closed it explicitly with a
reason. After closure the record is read-only and a recurrence is a **new** ticket linked to the old
one.

The gap between them exists for one reason: **the person who fixes a problem is not the person
qualified to say it is fixed.** Collapsing the two states hands that judgement to the party with an
incentive to close tickets. Every source below says the same thing in different words.

This is also the single most useful thing the 4-state machine already has and does not use: today
`resolved` and `closed` are two labels an operator picks between, with no difference in behaviour,
no required text, and no requester involvement at all.

---

## 1. Baseline — what actually exists today

Read from the code, not from the docs.

| Thing | State today |
|---|---|
| States | `new`, `open`, `resolved`, `closed` — `CHECK` in `003-tickets.sql`, `TICKET_STATES` in `query.js` |
| Transitions | `NEXT_STATES` in `query.js`. Console offers forward moves **and `closed → open`**. The CLI allows any state to any state, deliberately, as the operator's correction tool |
| Comments | **None.** No table, no column, no route, no UI |
| Resolution notes | **None reachable.** See the defect below |
| Assignment | **None.** `suggested_owner` is a model's hint from a fixed enum, nullable, and nothing consumes it |
| Requester-facing notification | **None**, by design and said out loud on six surfaces (D86, `B6-TICKET-STORE.md` §0) |
| Requester-facing ticket view | **None.** `client/src/router/social.js` can say *"you filed MD-1004 on Tuesday about X"* from the endpoint's own egress audit log. It is a memory of what was sent, not a status |
| Requester identity | Self-asserted `os_username` + a typed profile. `users.logon_sid` NULL. No device auth (D61/D132), no attestation (D148) |
| Job infrastructure | **Exists and is unused for tickets.** `control.job_queue` (`src/db/jobs.js`) takes `{type, tenantSchema, refId, runAfter}` with `FOR UPDATE SKIP LOCKED`. A delayed auto-close is a natural fit and needs no new infrastructure |
| Device enrollment | **Half exists.** `POST /v1/enroll`, `control.devices`, secrets, queue, revocation — all built and tested (B3, D231). **The client never calls it**, and nothing verifies that a request claiming to be a device is one |

`client/src/ticket/egress-audit.js` states the requester-view constraint in its own words:

> It is NOT the ticket's current status: nothing on the endpoint can see the hub's ticket table,
> that needs a route and a user identity that do not exist (D54, D68/D69).

### 1a. A defect found while reading — fix this regardless of the plan

`migrations/tenant/004-session-outcomes.sql` adds `tickets.close_note` and its own comment says:

> The console's state form offers it as an optional field when moving to resolved or closed;
> nothing reads it yet except the ticket's own detail page and the CLI.

**All three clauses are false.**

- `stateBlock()` in `src/admin/pages/tickets.js` renders a `<select>` and a submit button. There is
  no note field. The screenshot of MD-1008 confirms it.
- `statePost()` calls `setTicketState(schema, ref, next)` with no options object, so the `note`
  parameter `setTicketState()` accepts is never passed by the console.
- `bin/tickets.mjs state` does not pass one either.
- `getTicket()` returns `closeNote`; `detailPage()` never renders it, and `bin/tickets.mjs show`
  never prints it.

So `close_note` is a column with **no writer and no reader**. This is the same defect class the
project has caught three times already — a document implying a feature that does not exist — and it
is currently sitting in a migration comment, which is the most load-bearing kind of comment in the
repo because it is what the next writer reads before touching the schema.

**Fix now, in one commit, ahead of everything else:** either correct the comment to say the column
is reserved and unwired, or build the field. §7's P0 builds it, because P2 needs it anyway.

---

## 2. Research — what ITSM practice actually says

All sources reached and read on 2026-09-12. Vendor product behaviour changes; treat the specifics as
dated observations, not as invariants.

### 2.1 Resolution and closure are two activities, not one

Atlassian's incident management guide separates *Resolution and Recovery* from *Closure*, and puts
the requester in the second one: *"Only service desk employees are allowed to close incidents, and
the incident owner should check with"* the reporter. ([Atlassian](https://www.atlassian.com/itsm/incident-management))

Advisera's ITIL write-up is more explicit about the handoff: an operator *"declares that the service
is restored and puts the incident record into 'Resolved' status"*, and *"after the customer
confirmation, an incident record can safely be put into 'Closed' status."*
([Advisera](https://advisera.com/20000academy/knowledgebase/incident-resolution-closure-waiting-fat-lady-sing/))

The same source names the standard escape hatch for silence: *"it has somehow became an industry
standard to inform the customer in the small print of the resolution notification that the resolved
incident will be automatically closed if the resolution is not confirmed in, say, 24 or 48 hours."*

### 2.2 Closed is terminal; resolved is not

Zendesk's own documentation is the cleanest statement of the semantics:

- *"Solved means that the agent has resolved the support issue."*
- *"Closed means that the ticket is complete and can't be reopened."*
- *"Until a ticket is closed, the requester can reopen the ticket."*
- *"Solved tickets are closed, typically, a number of days after they have been set to Solved (the
  exact number of days depends on how an Administrator set this up)."*

([Zendesk — About ticket fields](https://support.zendesk.com/hc/en-us/articles/4408886739098-About-ticket-fields))

Note the two properties we do **not** have: reopen-by-requester, and a configured delay.

### 2.3 Resolution text is mandatory, and it has two parts

IBM's integration documentation for ServiceNow records the out-of-the-box rule: *"By default,
ServiceNow instances enforce a rule that requires the Resolution Code field (table field name:
`close_code`) and Resolution Notes field (table field name: `close_notes`) to be populated when the
incident is set to Resolved or Closed."*
([IBM Docs — ServiceNow incident resolution](https://www.ibm.com/docs/en/netcoolomnibus/noversion?topic=gateway-servicenow-incident-resolution))

Two fields, not one: a **code** (a small enum you can count) and **notes** (prose a human reads).
Matic Desk has neither, and the enum half is what makes resolution data reportable later.

### 2.4 The visibility split is real, and D69's `[VERIFY]` can be closed

D69 says *"Status readback uses customer-visible comments only. Internal work notes are never
surfaced to the end user. `[VERIFY: believed comments vs work_notes]`."*

The guess was right. ServiceNow's model is two journal fields on the same record — **Work notes**
(internal) and **Additional comments (Customer visible)** — both stored in `sys_journal_field`.
([ServiceNow community article](https://www.servicenow.com/community/servicenow-ai-platform-articles/work-notes-additional-comments-behavior-with-activity-or-always/ta-p/2327824);
storage detail confirmed by [ServiceNow KB0696891](https://support.servicenow.com/kb?id=kb_article_view&sysparm_article=KB0696891))

**Recommend marking D69's `[VERIFY]` resolved in the register with these two citations.** The naming
convention worth stealing is theirs: *work note* for internal, *comment* for requester-visible. Using
one word for both is how the wrong one gets rendered.

### 2.5 Auto-close is a scheduled job driven by a configured interval

ServiceNow implements it as a system property `glide.ui.autoclose.time` (in days) consumed by a
scheduled job named *Autoclose Incidents*.
([ServiceNow community, ITSM forum](https://www.servicenow.com/community/itsm-forum/auto-close-resolved-incidents-after-certain-amount-of-days/m-p/486466))

We already have the machinery: `control.job_queue` with `run_after`. No new infrastructure.

### 2.6 What ITIL itself does and does not give you

ITIL describes incident **closure** as an activity distinct from resolution, and requires user
confirmation as part of it. It does **not**, as far as I can establish from the sources I reached,
publish a normative list of ticket state names. `resolved` and `closed` as *state values* are a tool
convention (ServiceNow, Zendesk, Jira), not an ITIL mandate. `[VERIFY]` — I did not reach a primary
Axelos/PeopleCert ITIL 4 practice guide; those are behind a paywall. Treat §2.6 as an inference from
secondary sources, not a sourced claim.

**The practical consequence:** we are free to define the state vocabulary. We are not free to skip
the confirmation step, because that is the part every source agrees on and the part an IT buyer will
recognise as missing.

---

## 3. What resolved and closed will mean in Matic Desk

| | `resolved` | `closed` |
|---|---|---|
| Meaning | IT believes it is fixed; the requester has not agreed yet | Nobody is coming back to this |
| Set by | A console user, explicitly | The requester (confirm), the auto-close job, or a console user with a reason |
| Requires | Resolution code **and** resolution notes. The move is refused without both | Nothing new; the resolution text is already there |
| Requester is told | Yes — this is the notification that matters most | Yes, quietly. A closure with no prior resolution gets its own text |
| Requester can reopen | Yes, one action, back to `open` | **No.** A recurrence is a new ticket, linked |
| Comments accepted | Yes, both kinds | No. Read-only |
| Counts as deflection | No — D89 counts *sessions*, not tickets, and an escalated session is already `escalated` | No |

**Console transitions change.** `NEXT_STATES` currently offers `closed → open`. Under the above,
closed is terminal in the console. Reopening a closed ticket stays possible **only** through
`bin/tickets.mjs`, which already exists as the any-state-to-any-state correction tool and already
documents itself as such. That split is the existing design, applied: *a button is a suggestion and a
suggestion should be a sensible one.*

### 3.1 The fifth state, and why I am recommending it

The comment feature creates a situation the four states cannot express: **IT has asked the requester
a question and is waiting.** Without a state for it, that ticket sits in `open` looking identical to
one being actively worked, and the first person to build an SLA clock or an ageing report will
measure the wrong thing.

**Recommend adding `pending_user`** in the same migration, with the auto-close job applying to it too
(a question nobody answers has to age out, same as a resolution nobody confirms). It is one value in
one `CHECK` now versus a second migration later, and the feature that makes it necessary is the
feature this plan builds.

It is your call and I can build without it — but if we skip it, people will use a comment to say
"waiting on user" and the queue will lie.

---

## 4. Decisions from this session

Your answers, written as register entries. **All PROPOSED.**

| ID | Decision |
|---|---|
| **D244** | **A ticket carries a timeline of entries with two visibilities: `comment` (requester-visible) and `work_note` (internal, never surfaced to the end user).** D69 applied, with D69's `[VERIFY]` closed against §2.4. The words are not interchangeable in code, in the console, in the CLI or in copy. |
| **D245** | **Both the requester and a console user can add a `comment` while the ticket is live.** Only a console user can add a `work_note`. The requester can never see, and is never sent, a `work_note`. |
| **D246** | **`resolved` requires a resolution code and resolution notes.** The console refuses the move without both (§2.3). Resolution notes are a `comment` — written for the requester — and are separate from `close_note`, which stays the internal technical account that feeds the KB draft loop (D168/D239). Two fields because they are two claims: the same argument D214 makes about `description` vs `summary`, one layer up. |
| **D247** | **`closed` is terminal in the console; the CLI remains the correction tool.** A recurrence is a new ticket carrying a link to the old one. |
| **D248** | **The requester confirms, or the ticket auto-closes after a configured interval.** Implemented as a delayed `control.job_queue` job (`ticket.autoclose`, `run_after = resolved_at + interval`), not a poller. The resolution notification says the interval out loud, in the small print, as §2.1 describes. |
| **D249** | **A ticket's requester is identified by the pair (`device_key_id`, `os_username`), recorded at filing time.** This gives per-person history that survives a machine change and a per-machine audit trail on the backend. **It is provenance, not authentication** — see §5.1. |
| **D250** | **Requester notification is in-app, through the panel, not email.** The agent already lives on the user's screen; this is the half of D86 we can satisfy without SMTP, and it is the half no ITSM competitor can do at all. D86's email remains open and unbuilt for the IT-facing half. |
| **D251** | **When the panel is not in the foreground, an update raises a toast.** Built as the product's own always-on-top window, not a native OS notification — see §6.5. |
| **D252** | **Resolution notes are authored by whichever console user resolved the ticket** (`control.admin_users`, already in the audit trail). No assignment groups in this pass; groups are a separate, larger decision. |

---

## 5. Three places where what was asked for is not what is wanted

### 5.1 The agent's key is not a login, and the read-back route must not act as if it is

You said: *"I am assuming the local agent has a unique key that it gets when connecting to the hub.
Tickets are created with a combination of os_username and unique agent id."*

Half of that is true today and the important half is not.

**True:** the hub has real enrollment. `POST /v1/enroll` exists, `control.devices` exists, secrets
are hashed, rotatable and time-boxed, the pending queue and bulk revocation work, and it is all
tested against a live database (B3, D231).

**Not true:** the client never calls it. There is no `enroll` anywhere in `client/src/`. And B3's own
status block says the part that matters here in capitals:

> **THE ENROLLMENT MECHANISM IS BUILT. DEVICE AUTHENTICATION IS NOT.** [...] nothing checks that a
> request claiming to be an enrolled device actually is one.

A `device_key_id` today is *an opaque string a client asserts*. So `(device_key_id, os_username)` as
the key on an **unauthenticated** `GET` route means anyone who can reach the hub and guess or observe
a pair can read that person's tickets — and ticket bodies carry the reporter's name, location,
contact and their own words about their problem. That is a worse exposure than the existing
`POST /v1/ticket`, because writing a ticket for someone else is noisy and reading one is silent.

**The pair is still the right thing to store.** It is exactly right for what you actually want from
it: per-person continuity across a machine swap, and a machine-to-machine audit trail visible in the
console to an authenticated admin. Keep D249 as written — as **provenance**.

**What I recommend instead for the route**, until D61 exists: the endpoint may only fetch references
it can already name. The panel holds its own egress audit log of every `MD-####` it filed, so
`GET /v1/tickets` takes an explicit list of references plus the pair, and returns only rows where
**both** match. That is not authentication either — it is a smaller blast radius, sized to the
guessability of `MD-1000`..`MD-1099` rather than to a username — and it should be labelled as such on
the route, in the response, and in `/v1/health`, the same way `notified: false` is.

Cross-machine history then works the way you described it, with the join happening where there **is**
a real identity: a console user opening the requester's record sees every ticket across every device,
because both columns are on the row. The endpoint on the new machine sees the tickets it knows about,
and the agent can say so honestly.

The real fix is D60/D63's key plus D61's exchange. This plan does not build it, does not pretend to,
and does not foreclose it: when D61 lands, the route drops the reference list and trusts the token.

### 5.2 A requester comment lands where nobody is watching — this is D86 again, pointed the other way

This is the thing I most want you to look at before we build.

Today the store's dishonesty risk is one-directional and well guarded: a ticket is filed, and six
surfaces say nobody was emailed. Fine.

The moment a requester can comment, the direction reverses. The panel will invite a user to type
*"this is now affecting my whole team"* into a ticket, and **nothing will tell anyone in IT.** The
user will have been given a channel that looks like a conversation and behaves like a suggestion box.
That is the 2026-09-02 defect wearing a comment box — a UI implying a capability that does not exist
— and it will be our own feature that creates it.

There is no version of this where the answer is "build it and stay quiet." The options:

1. **Ship with the same honesty discipline** (what §7 does): the queue list grows an unmistakable
   "unanswered requester comments: N" counter that cannot be filtered away; the detail page marks
   unread entries; and the panel's own copy tells the user plainly that IT sees this when they next
   open the queue, with no promise of a response time. Cheap, consistent with everything else in the
   repo, and still a real product gap.
2. **Build D86's email for the IT alias in this pass.** Fixes the gap properly. Adds SMTP,
   deliverability, bounce handling and a third stateful dependency to a plan that is already five
   phases long.

I recommend 1 now and 2 next, but this is a founder decision, not an engineering one: option 1 ships
a feature whose value depends on a human habit we have no way to enforce.

### 5.3 `closed → open` in the console contradicts what closed will mean

Minor, but it is in `NEXT_STATES` today and §3 changes it. Flagging it so it is a decision rather
than a diff someone notices later.

---

## 6. Design

### 6.1 Schema — one new migration, `tenant/005-ticket-timeline.sql`

**`ticket_entries`** (the timeline; one table, two visibilities — D244):

| Column | Notes |
|---|---|
| `id uuid PK` | |
| `ticket_id uuid NOT NULL REFERENCES tickets(id)` | |
| `kind text NOT NULL` | `CHECK (kind IN ('comment','work_note','state_change','resolution'))` |
| `visibility text NOT NULL` | `CHECK (visibility IN ('public','internal'))`. **Set by a trigger or by one write path, never by the caller** — a `work_note` that arrives with `visibility='public'` is the D69 failure in one bad request |
| `body text NOT NULL` | |
| `author_kind text NOT NULL` | `CHECK (author_kind IN ('requester','console_user','agent','system'))` |
| `author_user_id uuid REFERENCES users(id)` | when the requester wrote it |
| `author_admin_user_id uuid` | **no FK on purpose** — `control.admin_users` is control-plane and this is tenant data (D143). Denormalise the label below rather than reaching across |
| `author_label text` | the console user's email as it was at write time. A snapshot, not a join |
| `created_at timestamptz NOT NULL DEFAULT now()` | |
| `notified_at timestamptz` | when the requester was actually told. NULL = not yet, which is what the queue counter counts |
| `read_by_requester_at timestamptz` | drives "unread" in the panel |

Index `(ticket_id, created_at)`, and a partial index on `(ticket_id) WHERE author_kind='requester' AND notified_at IS NULL` for §5.2's counter.

**`tickets`** gains:

- `resolution_code text` — `CHECK (resolution_code IS NULL OR resolution_code IN (...))`. Start small
  and deliberately short: `fixed`, `workaround`, `no_fault_found`, `duplicate`, `withdrawn_by_user`,
  `referred_to_vendor`. Six values you can count; extend by migration, never by free text.
- `resolved_at timestamptz`, `closed_at timestamptz`, `closed_by text` (`requester` | `auto` | `console_user`)
- `device_key_id text` — D249's other half, written at filing time
- `reopened_from uuid REFERENCES tickets(id)` — D247's link
- `pending_user` added to `tickets_state_known` **if §3.1 is adopted**

`close_note` stays, keeps its name, and its migration comment gets rewritten to say what it now is:
the internal technical account for the KB draft loop, distinct from the requester-visible resolution
notes. The rewrite is non-negotiable — see §1a.

### 6.2 Query layer — D224 holds

Everything new goes in `src/tickets/query.js`. No SQL against `tickets` or `ticket_entries` anywhere
else, so the CLI, the console, the endpoint route and the sessions store cannot disagree about what a
ticket is. `test/admin-static.test.mjs` §5 already fails if that rule is broken; extend it to cover
the new table.

New functions: `addEntry()`, `listEntries(schema, ref, {visibility})`, `resolveTicket()`,
`confirmResolution()`, `reopenTicket()`, `unreadRequesterEntries(schema)`.

`listEntries()` takes a **required** visibility argument with no default. A default is how internal
text reaches a user's screen eighteen months from now.

### 6.3 Hub routes

| Route | Notes |
|---|---|
| `GET /v1/tickets` | Body/query: `{ references: [...], deviceKeyId, osUsername }`. Returns only rows matching **all three**. Public entries only. Response carries an `authenticated: false` field and a reason string, the `notified: false` pattern applied to reads (§5.1) |
| `POST /v1/ticket/:reference/comment` | Requester comment. Same triple check. Always `visibility: 'public'`, `author_kind: 'requester'` — the route has no parameter for anything else |
| `POST /v1/ticket/:reference/confirm` | Requester confirms the resolution → `closed`, `closed_by='requester'`, cancels the pending auto-close job |
| `POST /v1/ticket/:reference/reopen` | `resolved → open` with a required reason, recorded as a public comment |

All four refuse a client-supplied tenant, exactly as `/v1/ask` and `/v1/ticket` do.

### 6.4 Console

- Detail page grows a **timeline**, newest last, with internal entries visually distinct in a way
  that survives a screenshot — a label, not only a colour.
- Two separate composers: **Add work note** (internal) and **Reply to requester** (public). Two
  buttons, never one control with a visibility dropdown; a dropdown defaulting wrong is D69's failure
  mode with a UI attached.
- The state form gains resolution code + resolution notes, shown **only** when the selected next
  state is `resolved`, and the POST refuses `resolved` without both.
- Queue page shows the unanswered-requester-comment count from §5.2, on every screen, in the same
  place the "NOBODY HAS BEEN EMAILED" limit note already sits.
- `ticket.comment`, `ticket.worknote` and `ticket.resolve` join `ticket.state` and `ticket.view` in
  the audit log.

### 6.5 Endpoint

- **Enrollment at startup.** New: the client calls `POST /v1/enroll` once, persists the returned
  device identity beside the profile, and sends `deviceKeyId` on every hub request. This is the
  client half of B3 that was never built. It generates **no key** — an opaque stable id is all D249
  needs, and calling it a key would overstate it (D60/D63 remain unbuilt).
- **Polling.** `GET /v1/tickets` on an interval, with the reference list from the egress audit log.
  Polling rather than push: no inbound connection, works through every NAT and firewall, and the hub
  stays stateless. Interval configurable, default in minutes not seconds.
- **Panel ticket view.** A list of the user's tickets with state and the public timeline. This is the
  first requester-facing read of hub data that exists.
- **Toast when not in the foreground** (D251). Built as the product's own small always-on-top
  `BrowserWindow`, plus `win.flashFrame()`. Not a native OS notification: there is no `Tray` and no
  `Notification` anywhere in `client/src/main/` today, native Windows toasts have packaging and
  shortcut requirements for reliable delivery `[VERIFY]`, and an OS toast looks like every other OS
  toast — the avatar is the product's whole differentiation.
- **Copy discipline.** The resolution note is written by IT for the requester, so the avatar may
  present it — but as a quotation, attributed, never in Hazel's own voice. D214's defect was the
  assistant reading a case note aloud as if it were her own thought; the same trap is here with a
  different field name.

### 6.6 Auto-close

On `resolved`: `enqueue({ type: 'ticket.autoclose', tenantSchema, refId: ticketId, runAfter: resolved_at + interval })`.
The worker re-reads state before acting and does nothing if the ticket already moved. Interval is a
per-tenant setting with a shipped default; §2.1's 24–48h is what the industry does, but for a
service desk where the user is on the machine, **72 hours** is the safer first default — long enough
to survive a weekend or a day off, which is exactly when a premature close is most annoying. Your
call; it is one column.

---

## 7. Phases

Effort is **estimated engineer-weeks with a range, not a measurement.** Ranges assume one engineer
working with Claude Code against this repo.

| # | Goal | Scope | Exit criteria (falsifiable) | Est. |
|---|---|---|---|---|
| **P0** | Stop the schema lying | Wire `close_note` into the console state form and render it on the detail page and in `tickets.mjs show`; rewrite migration 004's comment | `npm run tickets -- show MD-x` prints a note written from the console. Migration 004's comment describes what the code does | 0.2–0.4 |
| **P1** | The timeline exists, console-side only | `005` migration, `ticket_entries`, query functions, two composers, CLI rendering. **No notification, no endpoint** | A work note and a comment on the same ticket render distinguishably in the console **and** in the CLI; `listEntries(visibility:'public')` provably cannot return an internal row (test) | 1.0–1.5 |
| **P2** | Resolution means something | `resolution_code`, resolution notes, `resolved_at`/`closed_at`/`closed_by`, refused transitions, `closed` terminal in console | Moving to `resolved` without both fields is refused with a sentence, not a constraint violation. `closed` offers no forward move in the console; the CLI still moves it | 0.8–1.2 |
| **P3** | The endpoint has an identity and can read back | Client-side enrollment, `device_key_id` on the ticket insert, `GET /v1/tickets` with the triple check and its honesty fields | A second machine enrolled by the same person shows that person's earlier tickets in the console's requester record; the route returns nothing for a correct pair with a reference the caller does not hold | 1.0–2.0 |
| **P4** | The user sees updates | Panel ticket view, polling, requester comment POST, toast + flashFrame, unanswered-comment counter in the console | An IT reply typed in the console appears in the panel within one poll interval and raises a toast with the panel minimised. The console's counter increments when the user replies | 1.0–1.5 |
| **P5** | Closure works the way §3 says | Confirm/reopen routes and panel actions, `ticket.autoclose` job, per-tenant interval, `pending_user` if adopted | A resolved ticket with no response auto-closes after the configured interval and not before; a confirm cancels the job; a reopen returns it to `open` with the reason in the timeline | 0.5–1.0 |
| **P6** | *(scoped, not scheduled)* D86 email | Outbound to an IT alias, requester email fallback, bounce handling | — | not estimated |

**Total P0–P5: roughly 4.5–7.5 engineer-weeks.** An estimate, not a commitment.

### Contingency and rollback

| # | If it goes wrong | Rollback |
|---|---|---|
| P0 | — | One revert; no schema change |
| P1 | If the two-composer UI proves confusing on screen, fall back to console-only work notes and delay requester-visible comments to P4, where they are tested with the panel anyway | `DROP TABLE ticket_entries`; `005` is additive, `tickets` untouched. Console reverts cleanly |
| P2 | If the resolution-code enum is wrong (it will be roughly wrong — nobody has resolved a real ticket in this system yet), ship it anyway and change it by migration once there are 50 real resolutions to look at | Columns are nullable; drop the console's refusal and the feature degrades to optional text |
| P3 | **Highest-risk phase.** If client enrollment turns out to need the pipe transport (D200/D201) for anything, stop and re-scope — do **not** build a partial custody chain, per B3 §1's reasoning. Fall back to `os_username` + reference list only, and record that D249 is half-implemented | Endpoint keeps sending no `deviceKeyId`; the column is nullable; the route's triple check becomes a double check |
| P4 | If polling load is a problem (it should not be at pilot scale — a handful of endpoints, minutes apart), lengthen the interval before building push | Feature-flag the panel view off; the hub route is harmless unread |
| P5 | If auto-close fires wrongly even once in testing, disable the job and ship confirm/reopen alone. An incorrectly closed ticket is the single most damaging bug in this plan — it is the product telling a user their unfixed problem is finished | Set the interval to NULL to disable enqueueing; in-flight jobs no-op on a re-read |

### What would make me stop

- P3 cannot produce a stable device id without the pipe transport → stop, re-scope, and tell the user
  their ticket list is per-machine, honestly, rather than building an identity that is not one.
- The first real click-through of the panel timeline shows internal text anywhere → stop everything
  and fix D69's enforcement before another line is written. This is the one failure that is not
  recoverable by an apology.

---

## 8. Open questions — one line each

1. §3.1: add `pending_user` now, or keep four states? *(I recommend adding it.)*
2. §5.2: ship the requester comment box with an honesty caveat, or build D86's IT email first?
   *(I recommend caveat now, email next — but it is your call.)*
3. Auto-close interval default: 72 hours, or something else?
4. Does an auto-closed ticket notify the requester at close, or is the resolution notice the last
   thing they hear? *(I recommend a short close notice; silence looks like a bug.)*
5. Can a requester comment on a `new` ticket that nobody has opened yet, or only from `open` onward?
6. Resolution code enum — are the six in §6.1 the right six for your buyer, or do you want
   `user_educated` / `no_action_required` style values that separate "we fixed it" from "nothing was
   broken"? The deflection story may care about that distinction.
7. Does the avatar **speak** an update proactively, or only show it and speak when engaged?
   *(I recommend show-and-toast only; an avatar that interrupts is uninstalled.)*

---

## 9. Verification register

| Claim | Status |
|---|---|
| ServiceNow requires `close_code` + `close_notes` on Resolved/Closed, out of the box | Sourced (IBM Docs). Vendor default, may have changed since the page was written |
| ServiceNow `glide.ui.autoclose.time` + *Autoclose Incidents* scheduled job | Sourced (ServiceNow community). **Default value not established** — do not quote a number |
| ServiceNow "work notes" internal vs "additional comments" customer-visible | Sourced (ServiceNow community + KB0696891) |
| Zendesk Solved/Closed semantics and requester reopen | Sourced (Zendesk official docs, article dated 2026-09-01) |
| Zendesk's specific auto-close interval | **Not established.** Zendesk's own docs say it is admin-configured; a 28-day figure appears on a third-party reseller help centre, not on Zendesk's. Do not quote 28 days |
| ITIL requires user confirmation before closure | Sourced (Atlassian, Advisera). Both are secondary sources |
| ITIL 4 does not prescribe state names | `[VERIFY]` — inference from secondary sources. No primary Axelos/PeopleCert guide reached (paywalled) |
| "24 or 48 hours" as the industry-standard confirmation window | Sourced (Advisera) as a characterisation of common practice, not as a measured figure |
| Native Windows toast requirements from Electron (AppUserModelId, installed shortcut) | `[VERIFY]` — believed, not checked against current Electron docs. §6.5's recommendation does not depend on it |
| Every statement in §1 about this repo | Verified by reading the files listed in the header on 2026-09-12 |
| Effort estimates in §7 | **Estimates.** Nothing here has been built or measured |

---

## 10. Where this gets built

**Claude Code, in this repo — not a chat session and not Claude Design.** It is a migration, a query
layer, four hub routes, a console page, and client work across the main and renderer processes, with
tests that have to run against a live PostgreSQL. The one piece that would benefit from Claude Design
is the panel's ticket timeline and the toast, and that should go through the existing
Design → Git handover workflow rather than being drawn in code first.
