# Ticket lifecycle, comments, resolution notes and requester notification — PLAN v3

> **FILED 2026-09-12. EVERY D-NUMBER IN THIS DOCUMENT IS VOID.** It says "the register covers
> D1–D243" and numbers its proposals D244–D259; the register had reached D268 before it was written,
> so all sixteen collide with decisions already taken (register §5.29–§5.52). **Do not cite an ID
> from this file.** The two items built the same day carry register IDs: this file's "D253" is
> **D269** and the runtime half of its "D248" is **D270** (register §5.53, §5.53a). The rest are
> unassigned until built. **P0 and P0.5 are BUILT** —
> `2026-09-12-claude-code-handover-ticket-lifecycle-p0-built.md` is the handback. The substance
> below is unaffected; only the numbers are wrong.

**Date:** 2026-09-12
**Status:** PLAN. **Nothing in this document is built.**
**Supersedes:** plan v1, the three-issues analysis, and plan v2. **This file is the one to read.**
**Review history:** v1 → analysis (corrected v1's §5.1) → v2 (merged) → **adversarial review** → v3.
The review found one false claim about this codebase in v2 and two mis-aimed risk assessments; §0
lists everything that changed and why.
**Register:** extends §3.9 (D68–D70a), §3.10 (D84–D86a), §3.12 (D73), §5.20 (D213–D218).
**Proposes:** D244–D259, all PROPOSED (the register covers D1–D243). **D257 is a gate, not a task.**

**Knowledge cutoff:** May 2026. Vendor behaviour, OWASP edition content and Electron specifics are
the parts most likely to have moved; every external claim is dated and listed in §9.

---

## 0. What the review changed

Every item below was re-verified against the working tree before being accepted.

| # | Finding | Verified how | Result |
|---|---|---|---|
| 1 | **v2 §1 and §2.5 were false.** "Delayed auto-close needs no new infrastructure" — `control.job_queue` has `enqueue`/`claim`/`finish`/`fail`/`runOne`, but **nothing calls `runOne`**. `src/index.js` never imports `jobs.js`. There is no worker, no scheduler, no reaper, and the status `CHECK` in `control/001` has no `cancelled` value | Content search for `runOne`/`setInterval`/jobs imports across `server/src` returns matches only inside `jobs.js` itself; read `index.js` imports | **Accepted.** New **P0.5** builds the runtime. The claim is corrected in §1 |
| 2 | **The BOLA threat model was aimed at a hub that does not exist.** `src/index.js` binds `127.0.0.1`, *"refuses any connection whose peer is not loopback anyway"*, and lists TLS as out of scope | Read `index.js` header and bind | **Accepted with a reframe.** The analysis is right in the abstract; the blocking question is not identity, it is **deployment topology** — see D257. P3 is gated on it |
| 3 | **The panel cannot receive a notification once closed.** `main.js` `window-all-closed` → `app.quit()` on non-darwin; one `BrowserWindow`; no `Tray` | Read `main.js:350–355` | **Accepted.** Raises a product question bigger than this plan — §5.5 |
| 4 | **"A per-install secret stored beside the profile" was self-contradictory.** `main.js:178–180`: the profile lives in Electron per-user `userData`, *"which is what makes 'kept locally for each user' true on a shared machine"* | Read `main.js:172–186` | **Accepted.** It is a per-**OS-user** credential, which is better than per-install for our purpose. D254 renamed and v2's "multi-user machine" limitation dissolves |
| 5 | **A second lying docblock.** `query.js`'s `setTicketState` docblock says the note is *"not read by anything yet except the detail page and the CLI"* — neither reads it | I quoted that docblock in v1 without noticing | **Accepted.** Added to P0 |
| 6 | **`getTicket()` does `SELECT t.*`.** Reusing it on an endpoint route ships `summary` (D214: never shown to the user), `what_was_checked` and the internal resolution note to the requester | Read `query.js` `getTicket()` | **Accepted.** New **D259**: a wire-level denylist test. This is the single most dangerous defect the review found |
| 7 | **TOCTOU on transitions.** `statePost()` checks `NEXT_STATES` against a `getTicket()` read, then calls `setTicketState()` in a separate transaction | Read `admin/pages/tickets.js` | **Accepted.** The guard moves into `UPDATE ... WHERE state = $from` |
| 8 | **P1 builds "Reply to requester" three phases before anything can deliver it** — deliberately shipping the project's signature defect for 3–4 weeks of calendar | — | **Accepted, and it is the best sequencing catch in the review.** P1 is now work-notes-only |
| 9 | **The console implies delivery and never reports it.** v2 hardened the *requester's* composer copy and left the *IT* composer implying a notification happened | — | **Accepted.** New **D258**. This is a direct hit on my own §6.3 |
| 10 | **Cut `pending_user`** — it touches every count, filter, pill and validator, and auto-closing one produces a closed ticket with **no resolution code**, undermining D246 | — | **Accepted, and I have reversed myself.** I recommended this state twice. The no-resolution-code argument is one I missed and it is decisive. Replaced by a derived badge — §3.1 |
| 11 | **v2 §5.1 "nothing here is new scope" is wrong** — D254 is identity, deferred four times by the register, re-entering as a ticket sub-task | — | **Accepted.** §5.1 rewritten |
| 12 | **v2 §5.4 "the resolution code is the most valuable thing" is wrong** — at a handful of tickets a week the enum yields no distribution for a year; P0 pays back on every phase | — | **Partly accepted.** Split: P0 is the highest-value *work*, the resolution code is the highest-value *data* decision. §5.4 |
| 13 | Cut the toast as runner-up | — | **Rejected.** Minimised is not closed, and the toast serves exactly the case that was asked for. But finding 3 makes *background presence* a real question — §5.5 |
| 14 | Duplicate auto-close jobs; non-idempotent `RENAME COLUMN`; no retention on `ticket_entries`; no body cap / rate limit / poll floor; tenant should come from `control.devices` once authenticated | — | **All accepted.** §8.4 |

---

## 1. Baseline — what exists today

| Thing | State today |
|---|---|
| States | `new`, `open`, `resolved`, `closed` — `CHECK` in `003-tickets.sql`, `TICKET_STATES` in `query.js` |
| Transitions | `NEXT_STATES` in `query.js`; console offers forward moves **and `closed → open`**. The CLI allows any state to any state, deliberately, as the correction tool |
| Comments | **None.** No table, column, route or UI |
| Resolution notes | **None reachable** — §6.1 |
| Assignment | **None.** `suggested_owner` is a model's hint, consumed by nothing |
| Requester notification | **None**, by design, on six surfaces (D86, `B6-TICKET-STORE.md` §0) |
| Requester ticket view | **None.** `social.js` recalls what this machine filed, from the local egress log. Not a status |
| Requester identity | Self-asserted `os_username` + typed profile in per-user `userData`. `logon_sid` NULL. No device auth (D61/D132), no attestation (D148) |
| **Job infrastructure** | **Primitives only, and no runtime.** `control.job_queue` + `enqueue/claim/finish/fail/runOne` exist in `src/db/jobs.js`. **Nothing calls `runOne`; `index.js` never imports it.** No worker, no reaper, no `cancelled` status in the `CHECK`. *(v2 said this needed no new infrastructure. That was false.)* |
| **Hub network posture** | **Loopback only.** `index.js` binds `127.0.0.1` and *"refuses any connection whose peer is not loopback anyway"*. **TLS is explicitly out of scope.** `x-matic-hub-auth: none` on every response |
| **Client lifetime** | **Quits on close.** `main.js` `window-all-closed` → `app.quit()` on non-darwin. One `BrowserWindow`, not always-on-top. No `Tray`, no background presence |
| Device enrollment | **Half exists.** `POST /v1/enroll`, `control.devices`, hashed rotatable secrets, queue, bulk revocation — built and tested (B3, D231). **The client never calls it**; nothing verifies a request claiming to be a device. No installer exists to carry an enrollment secret |

---

## 2. Research — what ITSM practice says

Sources reached and read 2026-09-12. Dated observations, not invariants.

**2.1 Resolution and closure are two activities.** Atlassian separates *Resolution and Recovery* from
*Closure* and puts the requester in the second: *"Only service desk employees are allowed to close
incidents, and the incident owner should check with"* the reporter.
([Atlassian](https://www.atlassian.com/itsm/incident-management)) Advisera: an operator *"declares
that the service is restored and puts the incident record into 'Resolved' status"*, and *"after the
customer confirmation, an incident record can safely be put into 'Closed' status."* The same source
names the escape hatch: *"it has somehow became an industry standard to inform the customer in the
small print of the resolution notification that the resolved incident will be automatically closed if
the resolution is not confirmed in, say, 24 or 48 hours."*
([Advisera](https://advisera.com/20000academy/knowledgebase/incident-resolution-closure-waiting-fat-lady-sing/))

**2.2 Closed is terminal; resolved is not.** Zendesk: *"Solved means that the agent has resolved the
support issue."* — *"Closed means that the ticket is complete and can't be reopened."* — *"Until a
ticket is closed, the requester can reopen the ticket."* — *"Solved tickets are closed, typically, a
number of days after they have been set to Solved (the exact number of days depends on how an
Administrator set this up)."*
([Zendesk](https://support.zendesk.com/hc/en-us/articles/4408886739098-About-ticket-fields))

**2.3 Resolution text is mandatory and has two parts.** IBM on ServiceNow: *"By default, ServiceNow
instances enforce a rule that requires the Resolution Code field (table field name: `close_code`) and
Resolution Notes field (table field name: `close_notes`) to be populated when the incident is set to
Resolved or Closed."*
([IBM Docs](https://www.ibm.com/docs/en/netcoolomnibus/noversion?topic=gateway-servicenow-incident-resolution))
A **code** you can count and **notes** a human reads.

**2.4 The visibility split is real — D69's `[VERIFY]` closes.** ServiceNow carries **Work notes**
(internal) and **Additional comments (Customer visible)** on the same record, both in
`sys_journal_field`.
([community](https://www.servicenow.com/community/servicenow-ai-platform-articles/work-notes-additional-comments-behavior-with-activity-or-always/ta-p/2327824),
[KB0696891](https://support.servicenow.com/kb?id=kb_article_view&sysparm_article=KB0696891))
Steal the vocabulary: *work note* internal, *comment* requester-visible.

**2.5 Auto-close is a scheduled job on a configured interval.** ServiceNow: system property
`glide.ui.autoclose.time` (days), consumed by a job named *Autoclose Incidents*.
([community](https://www.servicenow.com/community/itsm-forum/auto-close-resolved-incidents-after-certain-amount-of-days/m-p/486466))
**We have the table and no runner** — see §1.

**2.6 A requester's reply changes the ticket's state.** Zendesk: a Solved ticket the requester replies
to returns to **Open** (*"assigned to an agent who is working to resolve it"*). **Pending** is *"the
assigned agent has a follow-up question for the requester."* The reply re-enters the working set
rather than being flagged. §6.3 turns this into the answer for the hardest problem in this plan.

**2.7 Communication is an obligation with an interval.** IT Process Wiki: 1st Level Support *"keeps
users informed about their Incidents' status at agreed intervals"*; monitoring exists *"to
continuously monitor the processing status of outstanding Incidents, so that counter-measures may be
introduced as soon as possible if service levels are likely to be breached."*
([IT Process Wiki](https://wiki.en.it-processmaps.com/index.php/Incident_Management))

**2.8 What ITIL does not give you.** Closure is an activity distinct from resolution and requires user
confirmation. ITIL does **not**, from the sources reached, publish a normative list of state *names*.
`[VERIFY]` — no primary Axelos/PeopleCert guide reached (paywalled). **Consequence:** we define the
vocabulary; we do not skip the confirmation step.

---

## 3. What resolved and closed will mean

| | `resolved` | `closed` |
|---|---|---|
| Meaning | IT believes it is fixed; requester has not agreed | Nobody is coming back to this |
| Set by | A console user, explicitly | The requester (confirm), the auto-close job, or a console user with a reason |
| Requires | Resolution code **and** requester-visible resolution notes. Refused without both | Nothing new |
| Requester told | Yes — the notification that matters most | Yes, briefly |
| Requester can reopen | Yes, one action → `open` | **No.** A recurrence is a new linked ticket |
| Comments accepted | Yes, both kinds | No. Read-only |
| Counts as deflection | No — D89 counts *sessions* | No |

`closed` becomes terminal in the console. Reopening stays possible only through `bin/tickets.mjs`,
which already exists and documents itself as the any-state correction tool.

### 3.1 The fifth state — cut, and why I reversed

v1 and v2 recommended adding `pending_user`, the second time on the strength of Zendesk's *Pending*.
**The review argued to cut it and I accept.**

The decisive argument is one I missed: auto-close must apply to `pending_user` too (a question nobody
answers has to age out), and auto-closing one produces a **closed ticket with no resolution code** —
which directly undermines D246, the requirement this plan is built around. A state whose terminal path
breaks the plan's own rule is not a state we have designed properly yet.

The secondary arguments hold too: it touches `TICKET_STATES`, `NEXT_STATES`, every filter, the CSS
pills, the CLI validator, and `countTicketsByCategory`'s hardcoded `state IN ('new','open')` — a
figure the new state would silently vanish from.

**Substitute:** render "awaiting requester" as a **derived badge** — the last public entry is by a
`console_user` and no later requester entry exists. Same information, no schema, no second closure
semantic, and the timeline already carries it. If a real tenant asks for it in a report, add the state
then, with a closure path designed for it.

---

## 4. Decisions

All **PROPOSED**. D244–D252 from the session with Charles; D253–D256 from the best-practice analysis;
D257–D259 from the review.

| ID | Decision |
|---|---|
| **D244** | **A ticket carries a timeline with two visibilities: `comment` (requester-visible) and `work_note` (internal, never surfaced to the end user).** D69 applied, its `[VERIFY]` closed against §2.4 |
| **D245** | **Requester and console user can both add a `comment` while the ticket is live.** Only a console user can add a `work_note`; the requester can never see or be sent one |
| **D246** | **`resolved` requires a resolution code and requester-visible resolution notes.** Refused without both. Separate from the internal technical account feeding the KB draft loop (D168/D239) — two fields, two claims, the D214 argument one layer up |
| **D247** | **`closed` is terminal in the console; the CLI remains the correction tool.** A recurrence is a new ticket carrying `reopened_from` |
| **D248** | **The requester confirms, or the ticket auto-closes after a configured interval** — a delayed `control.job_queue` job, **which requires the runner P0.5 builds.** The job is bound to the specific resolution that created it, not merely to the ticket |
| **D249** | **A ticket records the pair (`device_key_id`, `os_username`) at filing time** — provenance and a machine-to-machine audit trail. **Not authentication** |
| **D250** | **Requester notification is in-app through the panel, not email.** D86's email stays open for the IT-facing half |
| **D251** | **When the panel is not in the foreground, an update raises a toast** — the product's own always-on-top window, not a native OS notification (§7.5). **Does not fire when the app is closed** — see §5.5 |
| **D252** | **Resolution notes are authored by whichever console user resolved the ticket.** No assignment groups this pass |
| **D253** | **`close_note` is renamed `internal_resolution_note`, and every `tickets` column must have a writer or sit on a declared reserved list**, enforced by a test (§6.1) |
| **D254** | **`POST /v1/enroll` returns a high-entropy secret stored hashed; the endpoint presents it on every request; ticket routes are scoped to the authenticated enrollment.** Because it is stored in per-user `userData`, this is a **per-OS-user enrollment credential**, not per-install and not per-machine. Gated on D257 |
| **D255** | **A requester comment is a state transition, not an append** (§6.3) |
| **D256** | **The console shows the *age* of the oldest unanswered requester comment on every screen** — not a count |
| **D257** | **GATE — deployment topology is decided and written down before P3 starts.** Where does the hub run relative to the endpoint? Same machine (the demo), the customer's LAN, or hosted? The hub is loopback-only with TLS out of scope, so the answer determines whether P3/P4 are meaningful, what P3 actually costs, and whether D254's secret would travel in cleartext. **Not an engineering slice — a founder decision** |
| **D258** | **The console reports delivery, it does not imply it.** Every public entry renders its own state — *not yet seen by the requester* / *seen <ago>* — from hub-stamped acks, and the "Reply to requester" composer carries the `notified: false` discipline in words: *"The requester sees this only while their Matic Desk app is open and polling. This is not email."* |
| **D259** | **A wire-level denylist test on every requester-facing route.** The response may never contain `summary`, `whatWasChecked`, `internalResolutionNote`, or any entry with `visibility='internal'`. `getTicket()`'s `SELECT t.*` makes this a live hazard, not a theoretical one |

---

## 5. Overall review

**5.1 This is mostly deferred scope, with one exception that must be named.** D69 and D86 have been in
the register since 2026-09-03 as part of B6 proper. **D254 is not.** It is identity — which the
register deferred four times (D60, D61, D63, D64) — re-entering as a ticket sub-task. Calling that
"not new scope" is how a two-week identity slice avoids the review an identity slice gets. It is new
scope, it is gated on D257, and it should be argued on its own terms.

**5.2 The riskiest phase is P3, and the risk is not what v2 said it was.** v2 aimed P3's kill criterion
at the named-pipe transport (D200/D201). Nothing in D254 needs it. What P3 needs is a hub that accepts
non-loopback peers over TLS, and a way to get an enrollment secret onto an endpoint with **no
installer** (B3: *"there is no installer in this build"*). The kill criterion is rewritten in §8.

**5.3 The weakest part is still the thing we cannot fix in code.** After every phase, a requester's
comment reaches a queue somebody chooses to open. §6.3 makes that visible and survivable; it is not a
response-time commitment. That is a product gap and an IT buyer finds it first.

**5.4 The highest-value *work* is P0; the highest-value *data* decision is the resolution code.** v2
claimed the resolution code was the most valuable thing in the plan. At a handful of tickets a week it
yields no usable distribution for a year, and the plan's own kill criterion concedes the vocabulary
may be wrong. P0 — making the schema stop lying and pointing a structural test at columns — pays back
on every later phase and costs half a week.

**5.5 A product question this plan surfaced and cannot answer.** The pitch is an agent that *lives on
your screen*. The code quits when the window closes. Every notification path in this plan — toast,
poll, panel badge — reaches only a user who has the app open. **Does Matic Desk need a tray icon and
a background mode?** That is not a ticket feature; it is what the product claims to be, and it is
worth deciding before P4 builds notification on top of a process that may not be running.

---

## 6. The three problems

### 6.1 A column with no writer, and two comments that say otherwise

`004-session-outcomes.sql` asserts the console offers `close_note`, the detail page reads it, and the
CLI reads it. All three false: `stateBlock()` renders a select and a button; `statePost()` calls
`setTicketState()` with no options; `getTicket()` returns `closeNote` and no renderer prints it.
**And `query.js`'s `setTicketState` docblock repeats the same false claim** — two lying comments, in
the two places a future writer reads first.

**Best practice.** Fowler's *Evolutionary Database Design* frames a database change as three
coordinated changes: *"Changing the database schema," "Migrating the data," and "Changing the database
access code."* ([martinfowler.com](https://martinfowler.com/articles/evodb.html)) 004 did the first,
skipped the third, and documented the third as done. The repo already knows the fix: D224 forces all
ticket SQL into one file and `test/admin-static.test.mjs` §5 fails if it moves. The discipline exists;
it was never pointed at columns.

**A second problem found while analysing the first.** ServiceNow's *requester-facing* resolution text
is the field named **`close_notes`** (§2.3). Keeping ours as the **internal** note gives us the
industry's field name with the opposite visibility — a trap for the next engineer, for D85's SoR-flip
mapping, and for any ServiceNow integration.

**Recommendation (D253):** wire it, **rename** to `internal_resolution_note`, fix both comments, and
add a **no-orphan-columns test** — read `tickets`' columns from `information_schema`, assert each
appears in `src/tickets/query.js` or `src/tickets/file.js`, fail otherwise **unless on an explicit
reserved list in the test file with a one-line reason**. `logon_sid`, `external_id` and `session_id`
go on it with their decision numbers. The reserved list is the point: it turns "deliberately unused"
from a claim in a comment into an entry the test suite reads.

### 6.2 The read-back route — corrected twice

**The failure mode has a name.** OWASP API Security Top 10 (2023) ranks it **API1: Broken Object Level
Authorization** — first in the list. Prevention is an authorization check *"for every database access
operation"* using a client-supplied identifier, and *"prefer the use of random and unpredictable
values as GUIDs for records' IDs."*
([OWASP](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/))

**Correction 1 (from the analysis).** Plan v1 proposed restricting the route to references the
endpoint already holds. That is an unguessability argument, not an authorization check — and our
identifier is sequential by deliberate design (`003-tickets.sql`: *"a person reads this one out on the
phone"*). `MD-1000`–`MD-1999` is a thousand guesses. Withdrawn.

**Correction 2 (from the review).** The BOLA threat model assumes an attacker who can reach the route.
**This hub binds `127.0.0.1` and refuses non-loopback peers, and TLS is out of scope.** So today the
only caller is a process on the hub's own machine. That does not make the analysis wrong; it makes it
**premature** — and it exposes the real gate:

> **D257.** For an endpoint on a user's desk to poll a hub, the hub must accept non-loopback
> connections. That is a change to the product's deployment model which v2 never named, never
> estimated, and which determines whether D254 is meaningful engineering or theatre. On the demo box,
> where hub and endpoint share a machine, requester read-back needs no network identity at all.

**Recommendation (D254), conditional on D257.** `POST /v1/enroll` returns a high-entropy secret; the
hub stores only the hash; the endpoint sends it on every request; ticket routes are scoped to the
authenticated enrollment. Why this size:

- **It is an authorization check** — the caller proves it holds a secret the hub issued rather than
  asserting an identifier the hub cannot verify.
- **The pattern is built and tested here twice** — `enrollment_secrets.secret_hash` stores a hash and
  shows plaintext once; `admin/session.js` does `sha256(token)` for session cookies `[VERIFY: stated
  in B3's doc and enrollment.js; session.js not opened]`.
- **Revocation already exists and currently revokes nothing meaningful.** `revokeDevices()` and bulk
  revoke (D83a) are built; with a credential, revocation becomes a real control.
- **It is a step on D61's path** — same route shape, weaker credential. When D60/D63/D64 land, the
  secret is replaced by the signed assertion and the routes do not change.
- **It fixes `POST /v1/ticket` too**, which is unauthenticated today.

**What it must be called.** It authenticates **a per-OS-user enrollment of the software** — not a
machine, not hardware, not a person. It is stored in per-user `userData`, so each Windows account
enrolls separately and a shared machine is *already* separated by the storage location (v2's
"multi-user" limitation was wrong and is withdrawn). Anyone who can read that user's `userData` **is**
that enrollment. B3's status block should change to: *enrollment credential authentication is built;
hardware-bound device identity and user attestation are not (D60, D63, D64, D148).*

**Open, and unanswered:** with no installer, how does the enrollment secret reach an endpoint? D82
says install-time configuration; there is no install. Today's only honest answers are a plaintext
`config.json` or a human pasting it. Named here rather than discovered in P3.

**One limitation to accept:** a reinstall (or a cleared `userData`) is a new enrollment and sees no
earlier tickets from the endpoint. Cross-machine history stays a console capability, where an
authenticated admin joins across `device_key_id` — which is what D249's pair is for. The agent says
*"tickets filed from this machine"*, honestly.

### 6.3 A requester comment that lands where nobody is watching

The moment the panel accepts a comment, a user can report a problem has got worse and nothing tells
anyone. The feature manufactures the defect class this project has caught three times.

**Best practice, part one — communication has an interval attached** (§2.7). Monitoring and "agreed
intervals" both presuppose someone watching. We have neither.

**Best practice, part two — the solution.** In mainstream tooling a requester's reply **changes the
ticket's state** (§2.6). Zendesk's Solved → Open on reply is not a flag on a message; it moves the
ticket back into the working set. Email is how Zendesk *also* tells you.

**That reframes the problem:** the comment needs to change **what the queue looks like**, not to
trigger a notification we cannot send. No SMTP, no deliverability, no bounce handling — a transition
in a code path we are writing anyway.

**D255 — the requester's comment is a transition:**

| State when the requester comments | Result |
|---|---|
| `resolved` | → `open`. Cancels the pending `ticket.autoclose` job **for that resolution** |
| `new` or `open` | Stays; sets `awaiting_agent_since` if not already set |
| `closed` | Refused (D247). The panel offers "raise a new ticket about this", pre-linked via `reopened_from` |

**D256 — show the age, not the count.** *"Oldest unanswered: 41h"* on every console screen, where the
"NOBODY HAS BEEN EMAILED" note already sits. A count of 3 is ignorable; an age is not.

**D258 — and the honesty runs both ways.** v2 hardened the requester's composer and left IT's
implying delivery. The console must render per-entry delivery state from hub-stamped acks, and the
"Reply to requester" composer must say what it is: *in-app only, and only while their app is open.*
`notified_at` and `read_by_requester_at` exist in the schema precisely so this is renderable —
v2 put them there and then showed them to nobody.

**What this does not fix.** D255/D256/D258 make the gap visible and survivable at pilot scale. They do
not make it acceptable in a sale. **Recommend treating D86's email as the gate on the first paying
pilot, not on the demo.** Commercial sequencing; yours.

---

## 7. Design

### 7.1 Schema — `tenant/005-ticket-timeline.sql`

**`ticket_entries`:** `id uuid PK`; `ticket_id uuid NOT NULL REFERENCES tickets(id)`;
`kind text NOT NULL CHECK (kind IN ('comment','work_note','state_change','resolution'))`;
`visibility text NOT NULL CHECK (visibility IN ('public','internal'))` — **set by one write path,
never by the caller**; `body text NOT NULL`;
`author_kind text NOT NULL CHECK (author_kind IN ('requester','console_user','agent','system'))`;
`author_user_id uuid REFERENCES users(id)`; `author_admin_user_id uuid` (**no FK** — `control.admin_users`
is control-plane, this is tenant data, D143); `author_label text` (email as at write time, a snapshot);
`created_at timestamptz NOT NULL DEFAULT now()`; `notified_at timestamptz`;
`read_by_requester_at timestamptz` — **hub-stamped on ack, never client-sent**, like everything else
the endpoint asserts.

Indexes: `(ticket_id, created_at)`; partial on `(ticket_id) WHERE author_kind='requester' AND notified_at IS NULL`.

**`tickets`** gains: `resolution_code text` with a `CHECK` (`fixed`, `workaround`, `no_fault_found`,
`duplicate`, `withdrawn_by_user`, `referred_to_vendor`); `resolution_notes text` (requester-visible);
`resolved_at`, `closed_at timestamptz`, `closed_by text` (`requester`|`auto`|`console_user`);
`awaiting_agent_since timestamptz`; `device_key_id text`; `reopened_from uuid REFERENCES tickets(id)`;
and **`close_note` renamed `internal_resolution_note`** behind a `DO $$ … pg_attribute … $$`
idempotency guard — `ALTER TABLE … RENAME COLUMN` has no `IF EXISTS` and 003 already uses that pattern
for constraints.

**No `pending_user`** (§3.1).

**Retention.** `ticket_entries.body` is free-text PII from both sides. The KB question log already has
a 90-day text sweep (D229); tickets and entries have none. **Decide the retention rule in this
migration, not after the table fills.**

### 7.2 Query layer — D224 holds

All new SQL in `src/tickets/query.js`. New: `addEntry()`, `listEntries(schema, ref, {visibility})`,
`resolveTicket()`, `confirmResolution()`, `reopenTicket()`, `oldestUnansweredRequesterComment()`.

**`listEntries()` takes a required visibility argument with no default.** A default is how internal
text reaches a user's screen eighteen months from now.

**`setTicketState()` gains the transition guard**: `UPDATE … WHERE reference = $1 AND state = $from`,
so the check and the write are one statement. The console's `NEXT_STATES` consult becomes a
suggestion; the database becomes the arbiter.

**A requester-safe row shape.** `getTicket()`'s `SELECT t.*` must never reach a requester route. Add an
explicit `getTicketForRequester()` selecting named columns only, and D259's test on top.

### 7.3 Hub routes — all gated on D257

All require the D254 credential; all refuse a client-supplied tenant. **Once authenticated, the tenant
comes from `control.devices.tenant_id`, not `MATIC_TICKET_TENANT`** — keeping the env var load-bearing
under a device identity is how the single-tenant default quietly becomes the tenancy model, which is
the thing `file.js`'s refusal exists to prevent.

| Route | Notes |
|---|---|
| `GET /v1/tickets` | Scoped to the authenticated enrollment. Public entries only, requester-safe columns only (D259). Carries an honesty field naming what the credential does and does not prove |
| `POST /v1/ticket/:reference/comment` | Always `visibility:'public'`, `author_kind:'requester'` — no parameter for anything else. Applies D255. **Body cap and per-enrollment rate limit** |
| `POST /v1/ticket/:reference/confirm` | → `closed`, `closed_by='requester'`, cancels the auto-close job for that resolution |
| `POST /v1/ticket/:reference/reopen` | `resolved → open` with a required reason, recorded as a public comment |
| `POST /v1/tickets/ack` | Stamps `read_by_requester_at` server-side. Feeds D258 |

### 7.4 Console

Timeline (newest last), internal entries distinguished by a **label, not only a colour** — it must
survive a screenshot. **Two separate composers**, never one control with a visibility dropdown.
Resolution code + notes on the state form, shown only for `resolved`, refused without both. D256's age
indicator on every screen. **D258's per-entry delivery state** beside each public entry. `closed`
offers no forward transition. `ticket.comment`, `ticket.worknote`, `ticket.resolve` join the audit log.

### 7.5 Endpoint

Enrollment at startup (the client half of B3, never built) — generates **no key**; an opaque id plus
an issued secret is all D249/D254 need. Polling `GET /v1/tickets` on a configurable interval **with a
floor**, since a misconfigured fleet polling at 1s is the first load this hub will ever see. Panel
ticket view. Toast when not foregrounded (D251) — the product's own always-on-top window plus
`flashFrame()`, not a native OS notification (no `Tray`/`Notification` exists today; native Windows
toasts have packaging requirements `[VERIFY]`; an OS toast looks like every other OS toast).

**Copy discipline.** The resolution note is written by IT *for* the requester, so the avatar may
present it — as a quotation, attributed, never in Hazel's own voice. D214's defect was the assistant
reading a case note aloud as if it were her own thought.

### 7.6 Auto-close — and the runner it needs

On `resolved`: enqueue `ticket.autoclose` with `run_after = resolved_at + interval`. **The job must be
bound to the resolution that created it**, not merely to the ticket: resolve → reopen → resolve
enqueues twice, and the first job would otherwise find `state='resolved'` and close a resolution made
five minutes ago. Store the job id on the ticket, or compare `resolved_at`.

This needs **P0.5**: a worker loop, a `cancelled` status added to `control.job_queue`'s `CHECK`, a
`cancelJobsFor(type, refId)`, and a reaper for rows left `running` by a hub restart.

Interval: a per-tenant setting. §2.1's 24–48h is what the industry does; **72 hours** is the safer
first default for a desk where the user is on the machine — long enough to survive a weekend, which is
exactly when a premature close is most annoying.

---

## 8. Phases

**Estimated engineer-weeks with a range, not measurements.**

| # | Goal | Exit criteria (falsifiable) | Est. |
|---|---|---|---|
| **P0** | Stop the schema lying | The no-orphan-columns test **fails against `close_note` before the fix and passes after**. Both false comments (004 and `query.js`'s docblock) describe the code. `npm run tickets -- show MD-x` prints a note written from the console | 0.3–0.5 |
| **P0.5** | The job queue gets a runtime | A job enqueued with `run_after` in the past runs exactly once; a hub restart mid-job leaves **no** row stuck `running`; `cancelJobsFor()` cancels a queued job and the status `CHECK` accepts `cancelled` | 0.5–1.0 |
| **P1** | The timeline exists — **work notes only** | A work note and a state-change entry render in console and CLI; a test proves `listEntries(visibility:'public')` cannot return an internal row. **No requester-visible composer ships in this phase** | 1.0–1.5 |
| **P2** | Resolution means something | Moving to `resolved` without code **and** notes is refused with a sentence, not a constraint violation. `closed` offers no console forward move; the CLI still moves it. The transition guard is in the `UPDATE`, proven by a concurrent-move test | 0.8–1.2 |
| **D257** | **GATE — deployment topology decided and written down** | A decision exists in the register naming where the hub runs and what the endpoint connects over. **P3 does not start without it** | — |
| **P3** | The endpoint has an identity | A request with a valid reference and a wrong or absent credential returns nothing and says why; a revoked enrollment stops working on its next request; **D259's denylist test passes** | 1.5–2.5 + topology work |
| **P4** | The user sees updates, and IT can see that they did | An IT reply appears in the panel within one poll interval and raises a toast with the panel **minimised**. A requester comment on a `resolved` ticket moves it to `open` in the console. **The console shows "not yet seen" before the ack and "seen <ago>" after** (D258). `/confirm` ships here, with the comment | 1.5–2.0 |
| **P5** | Closure works as §3 says | A resolved ticket with no response auto-closes after the interval **and not before**; a confirm cancels the job; resolve → reopen → resolve does **not** close early | 0.5–0.8 |
| **P6** | *(scoped, not scheduled)* D86 email | — | not estimated |

**Total P0–P5: roughly 6.1–9.5 engineer-weeks**, plus whatever D257 turns out to cost. Up from v2's
5.2–8.4 because the review found real work v2 had assumed away. An estimate, not a commitment.

### 8.1 Contingency and rollback

| # | If it goes wrong | Rollback |
|---|---|---|
| P0 | The test surfaces columns nobody remembers deciding about — that is the test working. Reserved list with a decision number, or delete them | One revert; the guarded rename is reversible while nothing reads the column |
| P0.5 | If an in-process worker in `index.js` proves awkward, a `bin/worker.mjs` run separately is the fallback and matches the existing CLI shape | Stop calling the runner; jobs sit `queued` — which is the state today |
| P1 | If the timeline UI confuses on screen, it is console-only and affects nobody outside IT | `DROP TABLE ticket_entries`; 005 is otherwise additive |
| P2 | The resolution-code enum will be roughly wrong; ship it, revise by migration after ~50 real resolutions | Columns nullable; drop the refusal and it degrades to optional text |
| P3 | **Highest risk.** If the credential cannot be delivered without an installer, stop — a plaintext secret in `config.json` is a decision, not a default | Endpoint sends no credential; routes stay console-only; column nullable |
| P4 | If polling load bites, lengthen the interval before building push | Feature-flag the panel view off |
| P5 | If auto-close fires wrongly **even once** in testing, disable the job and ship confirm/reopen alone | Interval NULL stops enqueueing; in-flight jobs no-op on re-read |

### 8.2 Kill criteria — decided in advance

- **D257 cannot be answered, or the answer is "same machine".** Then P3's identity work is theatre and
  P4's polling is a local IPC problem wearing HTTP. Stop and re-scope rather than build a credential
  nobody needs. *(This replaces v2's kill criterion, which aimed at the named-pipe transport and was
  aimed at the wrong risk.)*
- **Internal text appears anywhere requester-facing in the first real click-through.** Stop everything
  and fix D69's enforcement. This is the one failure an apology does not recover — and D259 is the
  test that must fail first, in CI, before any click-through gets the chance.
- **The resolution-code enum cannot be filled honestly by the first ten real resolutions.** The
  vocabulary is wrong; revise before building anything downstream of it.

### 8.3 What the review says would bite in production

All accepted, all now scheduled: TOCTOU on transitions → guard in the `UPDATE` (P2). `SELECT t.*`
leaking D214's case note to the requester → `getTicketForRequester()` + D259's denylist test (P3).
Duplicate auto-close jobs after resolve/reopen/resolve → bind the job to the resolution (P5).
Non-idempotent `RENAME COLUMN` → `DO $$ … pg_attribute $$` guard (P0). No retention on free-text
entry bodies while KB questions have a 90-day sweep (D229) → decide in 005 (P1). No body cap, no
per-enrollment rate limit, no poll floor → all three in P3/P4. Tenant from `control.devices.tenant_id`
once authenticated, not the env var → P3.

---

## 9. Verification register

| Claim | Status |
|---|---|
| ServiceNow requires `close_code` + `close_notes` on Resolved/Closed out of the box | Sourced (IBM Docs). Vendor default, may have changed |
| ServiceNow `glide.ui.autoclose.time` + *Autoclose Incidents* | Sourced (ServiceNow community). **Default value not established — do not quote a number** |
| ServiceNow work notes vs additional comments visibility | Sourced (ServiceNow community + KB0696891) |
| Zendesk Solved/Closed/Open/Pending; requester reply reopens to Open | Sourced (Zendesk official, article dated 2026-09-01) |
| Zendesk's specific auto-close interval | **Not established. Do not quote 28 days** — that figure appears on a third-party reseller help centre, not Zendesk's |
| ITIL requires user confirmation before closure | Sourced (Atlassian, Advisera) — both secondary |
| ITIL 1st-line informs "at agreed intervals"; monitoring pre-empts SLA breach | Sourced (IT Process Wiki) — secondary interpretation, not primary Axelos/PeopleCert |
| ITIL 4 does not prescribe state names | `[VERIFY]` — inference; no primary guide reached (paywalled) |
| "24 or 48 hours" confirmation window | Sourced (Advisera) as a characterisation of common practice |
| OWASP API1:2023 BOLA definition and unpredictable-GUID guidance | Sourced (owasp.org 2023 edition). A newer edition may exist |
| W3C capability-URL good practices | Sourced (w3.org/TR/capability-urls/) — a Note, not a Recommendation |
| Fowler, *Evolutionary Database Design* | Sourced (martinfowler.com); the principle, not the specifics |
| Native Windows toast requirements from Electron | `[VERIFY]` — believed, unchecked. §7.5's recommendation does not depend on it |
| `admin/session.js` does `sha256(token)` | `[VERIFY]` — asserted by B3's doc and `enrollment.js`; `session.js` not opened by me or by the reviewer |
| Guessability of `MD-####` and `os_username` | **Reasoning, not a test.** No enumeration attempted |
| A per-enrollment credential is smaller than D61's assertion exchange | **Engineering judgement**, from reading B3 §1 and `enrollment.js` |
| §1's table, §6.1, and every finding in §0 | **Verified by reading the files on 2026-09-12** — independently by me and by the reviewer, and the four load-bearing ones re-read after the review |
| All effort figures in §8 | **Estimates.** Nothing has been built or measured |

---

## 10. Open questions

**Blocking:**

1. **D257 — where does the hub run** relative to the endpoint in the first pilot: same machine, the
   customer's LAN, or hosted? P3 and P4 both depend on the answer. *(No recommendation; this is yours.)*
2. **§5.5 — does Matic Desk need a tray icon and a background mode?** It quits when the window closes,
   and the pitch says it lives on your screen. Decide before P4 builds notification on a process that
   may not be running.
3. **§6.2 — with no installer, how does an enrollment secret reach an endpoint?** A plaintext
   `config.json` is an answer, but it should be a decided one.

**Not blocking:**

4. Is D86's email the gate on the **first paying pilot**? *(Recommended: yes; it sequences P6.)*
5. Auto-close interval default — 72 hours? *(Recommended.)*
6. Does an auto-closed ticket notify the requester at close? *(Recommended: a short notice; silence
   looks like a bug.)*
7. Can a requester comment on a `new` ticket nobody has opened, or only from `open` onward?
8. Resolution-code enum — are §7.1's six right, or do you want values separating "we fixed it" from
   "nothing was broken" (`user_educated`, `no_action_required`)? The deflection story may care.
9. Retention for `ticket_entries.body` — mirror D229's 90 days, or different for tickets?
10. Does the avatar **speak** an update proactively, or only show and toast? *(Recommended:
    show-and-toast; an avatar that interrupts is uninstalled.)*

---

## 11. Where this gets built

**Claude Code, in this repo.** A migration, a query layer, a job runner, four hub routes, a console
page, and client work across main and renderer, with tests against a live PostgreSQL.

The panel's ticket timeline and the toast benefit from **Claude Design**, through the existing
Design → Git handover workflow — not drawn in code first.

**P0 and P0.5 are unblocked by every open question above** and can start now. P1 and P2 are unblocked
too. P3 onward waits on D257.
