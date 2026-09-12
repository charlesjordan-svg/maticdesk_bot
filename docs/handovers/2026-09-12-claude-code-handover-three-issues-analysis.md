# Analysis — the three issues, against best practice

> **FILED 2026-09-12, SUPERSEDED by `2026-09-12-ticket-lifecycle-plan-v3.md`. EVERY D-NUMBER IN THIS
> DOCUMENT IS VOID** (register §5.53a). Kept for the record; do not work from it or cite an ID from it.

**Date:** 2026-09-12
**Status:** ANALYSIS AND RECOMMENDATION. Nothing built.
**Companion to:** `2026-09-12-claude-code-handover-ticket-comments-and-notification.md` (the plan).
**Proposes:** D253–D256, and **supersedes one recommendation in the plan** — see §0.

**Knowledge cutoff:** May 2026. Vendor behaviour and OWASP edition content may have moved; every
external claim is dated, sourced and listed in §5.

---

## 0. What this analysis changed

One of the three recommendations in the plan does not survive contact with the relevant standard.

> **§5.1 of the plan recommended scoping the requester read-back route to "references the endpoint
> already holds." That recommendation is withdrawn.** It fails OWASP API1:2023's stated prevention
> guidance, for a reason specific to this codebase: our ticket reference is *deliberately sequential
> and human-readable*, so "references you already hold" is not a meaningful restriction. §2 below
> replaces it.

The other two hold up, and both get sharper solutions than the plan gave them.

| Issue | Plan said | This analysis says |
|---|---|---|
| 1. Dead `close_note` column | Wire it up in P0 | Wire it up, **rename it**, and add a structural test that makes this class of defect impossible to reintroduce |
| 2. Device key / read-back | Reference-list scoping | **Withdrawn.** Mint a per-install bearer secret at enrollment — the smallest thing that is an authorization check rather than an obscurity check |
| 3. Unwatched requester comments | Counter + honest copy | **Make the comment change the ticket's state.** The queue is the notification. Counter becomes an *age*, not a count |

---

## 1. Issue 1 — a column with no writer, and a migration comment that says otherwise

### 1.1 What it is

`migrations/tenant/004-session-outcomes.sql` adds `tickets.close_note` and its comment asserts the
console offers it, that the detail page reads it, and that the CLI reads it. None of the three is
true. `setTicketState()` accepts a `note` option that no caller ever passes; `getTicket()` returns a
`closeNote` that no renderer ever prints.

### 1.2 Why it is worse than a stale comment

Because of where it sits. A migration comment is read by the next person who touches the schema,
*before* they read the code — which is precisely the reader least able to check it. This one also
carries D239's rationale for the column existing at all, so a future writer has every reason to trust
it and no prompt to verify it.

### 1.3 What best practice says

Fowler's *Evolutionary Database Design* frames a database change as **three coordinated changes**:
*"Changing the database schema," "Migrating the data," and "Changing the database access code."*
([martinfowler.com/articles/evodb.html](https://martinfowler.com/articles/evodb.html))

004 did the first, had no data to migrate, and skipped the third — then documented the third as
though it had happened. The same article's operative control is *"All database artifacts are version
controlled with application code"* and *"a large body of automated tests."* Version control we have.
The test that would have caught this, we do not.

**The repo already knows how to do this.** D224 forces all ticket SQL into one file, and
`test/admin-static.test.mjs` §5 fails if that SQL moves. That is a structural test asserting a
documented claim. The discipline exists; it simply was not pointed at columns.

### 1.4 A second problem found while analysing the first: the name is wrong

IBM's ServiceNow integration documentation records that ServiceNow's requester-facing resolution text
is the field literally named **`close_notes`**, paired with `close_code`, both mandatory on Resolved
or Closed.
([IBM Docs](https://www.ibm.com/docs/en/netcoolomnibus/noversion?topic=gateway-servicenow-incident-resolution))

So the plan's D246 — which keeps `close_note` as the **internal** technical account and adds separate
requester-visible resolution notes — would leave us with a field whose name matches the industry's
field name and whose visibility is **the opposite**. That is a trap for three separate readers: the
next engineer, anyone writing the D85 SoR-flip field mapping, and any future ServiceNow integration.

### 1.5 Options

| Option | Verdict |
|---|---|
| Correct the comment, leave the column unwired | Honest, cheap, and leaves a column nothing writes — which P2 has to build anyway. Half a fix |
| Drop the column, re-add in P2 | Churn, and D239's rationale lives in that comment. No |
| Build the field now | Necessary but not sufficient — nothing stops the next one |
| **Build it, rename it, and add the test** | Recommended |

### 1.6 Recommendation

**D253 — `close_note` is renamed `internal_resolution_note`, and every `tickets` column must have a
writer or be on a declared reserved list.**

Three parts, all in P0:

1. **Wire it.** Console state form gains the note field; `statePost()` passes it; the detail page
   renders it; `bin/tickets.mjs state` takes `--note` and `show` prints it. Migration 004's comment
   is rewritten to describe what the code does.
2. **Rename it** to `internal_resolution_note`, so the requester-visible field added in P2 can be
   `resolution_notes` without inverting ServiceNow's meaning of the same word.
3. **Add a no-orphan-columns test** to the existing static-test family: read `tickets`' columns from
   `information_schema`, assert each one appears in `src/tickets/query.js` or `src/tickets/file.js`,
   and fail on any that does not — **unless it is on an explicit reserved list in the test file, with
   a one-line reason.** `logon_sid`, `external_id` and `session_id` are all legitimately reserved
   today; they go on the list with their decision numbers.

The reserved list is the point, not an escape hatch. It turns "this column is deliberately unused"
from a claim in a comment into an entry in a file the test suite reads — the same move D224 made for
SQL, applied to schema.

**Effort:** 0.3–0.5 engineer-weeks including the test. **Verification:** the test fails today against
`close_note` before the fix, and passes after. Prove it in that order.

---

## 2. Issue 2 — the read-back route, and why my earlier recommendation was wrong

### 2.1 What it is

To show a requester their own ticket, the endpoint needs a hub route that returns ticket rows. Those
rows carry a named person's location, contact details and their own account of their problem.
Nothing authenticates the caller: no device auth (D61/D132), no attestation (D148), and B3's status
block is explicit that *"nothing checks that a request claiming to be an enrolled device actually is
one."*

### 2.2 What best practice says — this has a name

OWASP API Security Top 10 (2023) ranks this **API1: Broken Object Level Authorization** — first, and
it is the most-exploited API flaw in the list.

> *"Object level authorization is an access control mechanism that is usually implemented at the code
> level to validate that a user can only access the objects that they should have permissions to
> access."*
>
> *"Attackers can exploit API endpoints that are vulnerable to broken object-level authorization by
> manipulating the ID of an object that is sent within the request."*

Its prevention guidance is two things: an authorization check *"for every database access operation"*
using a client-supplied identifier, and *"prefer the use of random and unpredictable values as GUIDs
for records' IDs."*
([OWASP API1:2023](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/))

### 2.3 Why the plan's recommendation fails that test

I proposed restricting the route to references the endpoint can already name. Read against the above,
that is not an authorization check — it is an unguessability argument. And our identifier is
**sequential by deliberate design**. `003-tickets.sql` says so:

> A separate sequence rather than the uuid, because a person reads this one out on the phone. Starts
> at 1000 so the first ticket is MD-1000 and the format does not change width immediately.

That is the correct decision for a reference a user quotes down a phone line, and it is exactly the
property OWASP tells you not to rely on. `MD-1000` through `MD-1999` is a thousand guesses. The other
two factors do not save it: `os_username` follows an org's naming convention and is guessable, and
`device_key_id` is a string the client asserts and nothing verifies.

**We cannot fix this by choosing a better identifier**, because the identifier's readability is a
product requirement. So the route is either authenticated or it does not exist.

### 2.4 Options

| Option | Why it wins or loses |
|---|---|
| **A. Reference list + (device_key_id, os_username)** *(the plan's)* | **Loses.** Obscurity over a sequential ID. Withdrawn |
| **B. Wait for D61** — TPM-backed key, signed assertion, short-lived token | Correct destination. **Loses as a gate**: it needs D60/D63's key and D64's custody, which need the named-pipe transport (D200/D201) — designed, not built. Blocks P3–P5 behind a multi-month slice, and B3 §1 already argued against building a partial custody chain to get there faster |
| **C. Per-ticket capability secret** — a high-entropy token minted with each ticket, stored hashed, presented on read | A real authorization check, tightest possible blast radius. Grounded in W3C's *Good Practices for Capability URLs* (unguessable, revocable, HTTPS). **Loses on fit**: listing "my tickets" needs every token at once, and a reinstall that loses the local store loses access to the user's own tickets permanently |
| **D. Per-install bearer secret minted at enrollment** | **Recommended.** See below |

### 2.5 Recommendation

**D254 — `POST /v1/enroll` returns a high-entropy per-install secret; the hub stores only its hash;
the endpoint presents it on every request; the read-back route is scoped to the authenticated
device.**

Why this is the right size:

- **It is an authorization check.** The caller proves it holds a secret the hub issued, instead of
  asserting an identifier the hub cannot verify. That is what moves us out of API1:2023 — not the
  choice of identifier.
- **The pattern is already built and tested in this repo, twice.** `enrollment_secrets.secret_hash`
  stores a hash and shows plaintext exactly once; `admin/session.js` does `sha256(token)` for session
  cookies. This is a third instance of a discipline the codebase already has, not a new idea.
- **Revocation already exists and currently revokes nothing meaningful.** `revokeDevices()` and the
  console's bulk-revoke (D83a) are built. Today revoking a device stops nothing, because nothing
  checks device identity. With a token, revocation becomes a real control — the existing feature
  starts doing what its name says.
- **It is a step on D61's path, not a detour.** D61 is a bearer credential presented per request and
  exchanged for a short-lived token. This is the same route shape with a weaker credential. When
  D60/D63/D64 land, the shared secret is replaced by the signed assertion and the routes do not
  change.
- **It improves `POST /v1/ticket` too**, which is unauthenticated today.

**What it must be called, precisely.** This authenticates *a software installation*, not a machine
and not a person. B3's status block should change from "device authentication is not built" to:
*device installation authentication is built; hardware-bound device identity and user attestation are
not (D60, D63, D64, D148).* Anyone with the user's machine and their local store is that device. Say
that on the route, in `/v1/health`, and in the register — the `notified: false` discipline applied to
a credential.

**Two limitations to accept explicitly, not discover later:**

1. **A reinstall is a new device** and sees no earlier tickets from the endpoint. Cross-machine
   history stays a console capability, where an authenticated admin does the join across
   `device_key_id` — which is precisely what D249's pair is for and why it is still worth storing.
   The agent says "tickets filed from this machine," honestly, and that is a sentence we can write.
2. **On a shared machine the token is machine-wide.** `os_username` remains a filter but it is
   client-asserted, so a shared-machine install is machine-scoped in practice. Recommend a per-tenant
   setting that disables requester read-back for machines flagged multi-user, defaulting to on for
   single-user installs. One column, decided now rather than found by a customer.

**Effort:** adds roughly 0.5 engineer-weeks to P3 (hash column on `control.devices`, mint on enroll,
a verification middleware, client-side storage). **Verification:** a request with a valid reference
and a wrong or absent token returns nothing, and says why; a revoked device's token stops working on
the next request.

---

## 3. Issue 3 — a requester comment that lands where nobody is watching

### 3.1 What it is

The moment the panel can accept a comment, a user can report that a problem has got worse, and
nothing tells anyone. The feature manufactures the exact defect class the project has caught three
times: a UI implying a capability that does not exist.

### 3.2 What best practice says

Two things, and the second one is the solution.

**First — communication is an obligation with an interval attached, not a best effort.** The IT
Process Wiki's incident management description has 1st Level Support *"keep[ing] users informed about
their Incidents' status at agreed intervals,"* and defines incident monitoring as existing *"to
continuously monitor the processing status of outstanding Incidents, so that counter-measures may be
introduced as soon as possible if service levels are likely to be breached."*
([IT Process Wiki](https://wiki.en.it-processmaps.com/index.php/Incident_Management))
Atlassian's guide says the same on the other side: teams *"regularly share updates with impacted
internal and external stakeholders"* throughout, not only at closure.
([Atlassian](https://www.atlassian.com/itsm/incident-management))

Both presuppose someone watching. We have no monitoring function and no interval.

**Second — in mainstream tooling, a requester's reply changes the ticket's state.** Zendesk's own
documentation: *"Until a ticket is closed, the requester can reopen the ticket. For example, the
requester may not agree with the agent that the support issue is resolved and reply back to the
ticket solved email notification."* A Solved ticket that the requester replies to goes back to
**Open**, which Zendesk defines as *"the request has been assigned to an agent who is working to
resolve it."*
([Zendesk — About ticket fields](https://support.zendesk.com/hc/en-us/articles/4408886739098-About-ticket-fields))

**That is the mechanism.** The reply is not merely appended and flagged — it moves the ticket back
into the working set. Email is how Zendesk *also* tells you; the state change is how the queue
cannot miss it.

### 3.3 Why this reframes the problem

The plan treated the gap as "the user's comment needs a notification we cannot send." It is better
treated as: **the user's comment needs to change what the queue looks like.** We already have a queue
everybody has agreed is the queue — six surfaces say so. A comment that does not alter it is a
message in a suggestion box; a comment that reopens a ticket is a work item.

That also removes the dependency: making the queue change requires no SMTP, no deliverability, no
bounce handling. It requires a state transition we were already building.

### 3.4 Recommendation

**D255 — a requester comment is a state transition, not an append.**

| Ticket state when the requester comments | Result |
|---|---|
| `resolved` | → `open`. The pending `ticket.autoclose` job is cancelled. Matches Zendesk's reopen behaviour exactly |
| `pending_user` | → `open`. The question has been answered; it is workable again |
| `new` or `open` | Stays, and sets `awaiting_agent_since` if not already set |
| `closed` | Refused. Terminal (D247). The panel offers "raise a new ticket about this," pre-linked via `reopened_from` |

**D256 — the console shows the age of the oldest unanswered requester comment, on every screen.**

Not a count. A count of 3 is ignorable; *"oldest unanswered: 41h"* is not. It goes exactly where the
"NOBODY HAS BEEN EMAILED" limit note already sits, and it is the cheapest available analogue of the
monitoring function the ITIL sources describe. When SLA timers eventually arrive, this is the field
they attach to.

**Supporting: the composer must not promise a response.** Draft copy for the panel: *"This goes to
the IT queue. Nobody is paged — they'll see it next time they open the queue."* Blunt and true, in
the house style.

### 3.5 A confirmation for the fifth state

The plan recommended adding `pending_user` on my own reasoning. It is now sourced: Zendesk defines
**Pending** as *"the assigned agent has a follow-up question for the requester,"* distinguished from
Open, which is active work. The distinction is not our invention and every buyer coming from an ITSM
will expect it. **Recommend adopting it**, and it is now a weaker decision to skip than to take.

### 3.6 The part this does not fix, stated plainly

D255 and D256 make the gap **visible and survivable at pilot scale** — one tenant, a handful of
tickets a week, an IT person who has been told to check the queue. They do not make it *acceptable*
in a sale. Nothing in this design gives an IT lead a response-time commitment, because a pull-based
queue cannot make one.

**Recommend treating D86's outbound email to the IT alias as the gate on the first paying pilot, not
on the demo.** That is a commercial sequencing decision and it is yours; my analysis is only that
these three layers are enough to demo honestly and not enough to sell.

**Effort:** D255 is roughly 0.2 engineer-weeks inside P4 — it is a transition in a code path being
written anyway. D256 is roughly 0.2 inside P1. Both are cheap because the queue already exists.

---

## 4. What changes in the plan

| Plan section | Change |
|---|---|
| §5.1 and D249 | Recommendation withdrawn and replaced by **D254**. D249 stands unchanged as *provenance* — the pair is still stored, still gives cross-machine history in the console, and is still not authentication |
| §6.1 schema | `close_note` → `internal_resolution_note` (**D253**). Add `awaiting_agent_since timestamptz` to `tickets` |
| §6.3 routes | All `/v1/*` ticket routes require the device token; the reference list stops being a security control and becomes what it always was — a convenience for the endpoint's own list |
| §7 P0 | Grows the rename and the no-orphan-columns test. 0.2–0.4 → **0.3–0.5** |
| §7 P1 | Grows D256's age indicator. 1.0–1.5 → **1.2–1.7** |
| §7 P3 | Grows token mint, verify and client storage. 1.0–2.0 → **1.5–2.5** |
| §7 P4 | Grows D255's transitions. 1.0–1.5 → **1.2–1.7** |
| §3.1 | `pending_user` upgraded from "recommended on my reasoning" to "recommended, sourced" |
| **Total P0–P5** | 4.5–7.5 → **roughly 5.2–8.4 engineer-weeks.** Estimates, not measurements |

---

## 5. Verification register

| Claim | Status |
|---|---|
| OWASP API1:2023 BOLA definition, exploitation, and "prefer random and unpredictable values as GUIDs" | Sourced (owasp.org, 2023 edition). A newer edition may exist |
| W3C good practices for capability URLs — unguessability, expiry, revocation, HTTPS, high exposure risk | Sourced (w3.org/TR/capability-urls/). A W3C Note, not a Recommendation |
| Fowler, *Evolutionary Database Design* — three coordinated changes; artifacts version-controlled with application code | Sourced (martinfowler.com). Article predates this codebase by many years; the principle, not the specifics, is what is being applied |
| ServiceNow's requester-facing resolution field is named `close_notes`, paired with `close_code`, mandatory on Resolved/Closed | Sourced (IBM Docs). Vendor default; may have changed |
| Zendesk: requester reply reopens a Solved ticket to Open; Open = assigned and being worked; Pending = agent awaiting requester information | Sourced (Zendesk official docs, article dated 2026-09-01) |
| ITIL 1st-line keeps users informed "at agreed intervals"; incident monitoring exists to pre-empt SLA breach | Sourced (IT Process Wiki — a secondary interpretation of ITIL, not a primary Axelos/PeopleCert text) |
| Atlassian: regular stakeholder updates throughout, not only at closure | Sourced (atlassian.com) |
| That a per-install bearer token is a smaller change than D61's assertion exchange | **Engineering judgement, not measured.** It rests on my reading of B3 §1 and `src/devices/enrollment.js`; the estimate in §2.5 is an estimate |
| Effort revisions in §4 | **Estimates.** Nothing here has been built or measured |
| Guessability of `MD-####` and of `os_username` | **Reasoning, not a test.** Nobody has attempted enumeration against this hub |

---

## 6. Open questions this analysis adds

1. **D254:** accept per-install bearer authentication as an interim, knowing it is not D61 and must be
   named as such — or hold requester read-back until D61? *(I recommend accepting it.)*
2. **§2.5 limitation 2:** shared/multi-user machines — disable requester read-back for them by
   setting, or accept machine-scoped visibility? *(I recommend the setting, defaulting to enabled.)*
3. **D253:** rename `close_note` now, while nothing reads it and the rename is free, or keep the name
   and document the inversion? *(I recommend renaming now — it is never cheaper than today.)*
4. **§3.6:** is D86 email the gate on the first paying pilot? Founder call, and it affects how P6 gets
   sequenced against everything else.
