# Claude Code handover — P0.75 (console honesty) and P1 (the timeline, work notes only)

**Date:** 2026-09-12
**Plan:** `2026-09-12-ticket-lifecycle-plan-v3.md` + `2026-09-12-ticket-lifecycle-plan-v3-addendum-console-honesty.md`.
Read the addendum first — it is short and it is why P0.75 exists.
**Follows:** `2026-09-12-claude-code-handover-ticket-lifecycle-p0-built.md` (P0 and P0.5, built, D269/D270).
**Implements:** **D272–D274** (P0.75) and the P1 slice of **D244/D256** — all PROPOSED.
**Numbering:** the register stands at **D271** and its own procedure says *"Take the next free ID
(D272 onward, as of 2026-09-12)"*. Use D272, D273, D274. **Do not reuse any number from plan v1/v2/v3
— §5.53a voids all of them.** (The previous handover got this wrong; that is why the rule is here.)
**Scope:** P0.75 and P1 only. **Do not start P3.** It is gated on D271, which is open and is the
founder's.

---

## 0. What you are doing

**P0.75 — the console stops implying a fleet.** Half a day. Copy and one test. Charles put the
Agents page next to the running panel, read *"0 active devices"* against *"Everything I need is
available"*, and reasonably concluded something was broken. Nothing is: the client has no enrollment
code, so that counter can only ever be 0, and the page never says so.

**P1 — the ticket timeline, work notes only.** `ticket_entries`, the query layer, the console
composer, CLI rendering, the oldest-unanswered indicator, and a retention decision.
**No requester-visible composer ships in this phase**, deliberately — see §2.6.

---

## 1. P0.75 — the Agents page

### 1.1 The facts, verified 2026-09-12

- **No file under `client/src` calls `/v1/enroll`.** Search returns nothing. B3's status block agrees:
  every enrollment in that pass came from curl, the CLI, or the test suite.
- `renderAgents()` in `src/admin/pages/agents.js` computes `active` as
  `devices.filter(d => d.status === "active").length`. Correct, and it will read 0 on every install
  until a client enrolls.
- **`last_seen_at` is written only inside `src/devices/enrollment.js`** — three sites, all on the
  enroll / approve / re-submit paths. Nothing else in `server/src` touches it.
- **Nothing checks device identity on any route.** `index.js`'s `authenticate()` is a no-op hook;
  `agents.js`'s own `notYet()` block says so.
- The page's `notYet()` block is correct and sits **below the secrets panel**, off the first screen.

### 1.2 What to build

**(a) D272 — the caveat above the fold.** Add a `limit()` note immediately after the `<div class="grid">`
of stats, in the same position the Tickets page uses for "NOBODY HAS BEEN EMAILED". Wording is yours,
but it must contain all three facts:

> No Matic Desk endpoint enrolls itself. Nothing in `client/` calls `POST /v1/enroll`, so this page
> lists only devices enrolled by hand — `bin/devices.mjs enroll`, curl, or the test suite. **A running
> endpoint does not appear here, and these counts are not a fleet.**

Keep the existing `notYet()` block exactly as it is. It answers *"is a listed device authenticated"*;
this answers *"why is the list empty"*. Two different questions, both worth an answer.

**(b) D273 — rename the column and qualify the control.**

- `devicesTable()`'s header `<th>Last seen</th>` → **`Last enrollment activity`**, with a muted
  one-liner under the table: *"Not a heartbeat. Nothing updates this when a device talks to the hub,
  because nothing identifies a device on a call (D61)."*
- In the Devices panel, adjacent to the Revoke control (not below the fold): *"Revoking removes the
  row's standing. It does not block anything — no route checks device identity, so a revoked endpoint
  can still ask and file (D61)."*

Both are written as **conditions that revert when P3 lands**. Say so in a code comment so the next
writer knows they are supposed to be temporary.

**(c) D274 — the test that pins the caveat to the client's behaviour.**

In the `admin-static` family, beside P0's reserved-list test:

> Search `client/src` for a call to the enrollment route. **If none exists**, assert the Agents page's
> rendered HTML contains D272's caveat. **If one exists**, fail with a message saying the client now
> enrolls and D272/D273's copy must be revisited.

That inversion is the whole value: the test does not just guard today's copy, it fires the day the
premise changes. Same shape as P0's reserved list — the claim is enforced and can only change by
being edited deliberately.

Match how the existing static tests locate the client tree; if `admin-static` cannot reach outside
`server/`, put it in whichever suite can and say why in the file.

### 1.3 Exit criteria

1. The Agents page's **first screen** carries the never-enrolls caveat. Check it by rendering, not by
   reading the source.
2. The column no longer says "Last seen"; the muted note is present.
3. The revoke caveat sits next to the revoke control.
4. D274's test passes today, and **flipping it by hand** (point the search at a path that does contain
   an enroll call) makes it fail with the "revisit the copy" message. Prove both directions.
5. Both suites green, counts up.

### 1.4 What not to do

- **Do not remove or rewrite the `notYet()` block.** It is correct.
- **Do not hide the Agents page or the counters.** The mechanism is real and tested; the page is what
  proves it. The fix is a sentence, not a deletion.
- **Do not add client enrollment.** That is P3 and it is gated on D271.
- **Do not touch `last_seen_at`'s writers.** Giving it a real writer is P3's job (addendum G2); this
  pass only stops the column claiming to be something it is not.

---

## 2. P1 — the timeline, work notes only

### 2.1 Migration — `tenant/006-ticket-timeline.sql`

*(005 is taken by P0's rename.)*

`ticket_entries`: `id uuid PK`; `ticket_id uuid NOT NULL REFERENCES tickets(id)`;
`kind text NOT NULL CHECK (kind IN ('comment','work_note','state_change','resolution'))`;
`visibility text NOT NULL CHECK (visibility IN ('public','internal'))`;
`body text NOT NULL`;
`author_kind text NOT NULL CHECK (author_kind IN ('requester','console_user','agent','system'))`;
`author_user_id uuid REFERENCES users(id)`;
`author_admin_user_id uuid` — **no FK**, `control.admin_users` is control-plane and this is tenant
data (D143); `author_label text` — the console user's email as at write time, a snapshot, not a join;
`created_at timestamptz NOT NULL DEFAULT now()`; `notified_at timestamptz`;
`read_by_requester_at timestamptz`.

`tickets` gains `awaiting_agent_since timestamptz` (D256's clock).

Indexes: `(ticket_id, created_at)`; partial on
`(ticket_id) WHERE author_kind = 'requester' AND notified_at IS NULL`.

**`notified_at` and `read_by_requester_at` get no writer in this phase.** They are P4's. Put them on
P0's reserved list with a reason and a decision number, or the no-orphan-columns test will catch them
— **and if it does, that is the test working, not a problem to route around.**

**Retention — decide it here, in the migration** (plan v3 §7.1, addendum G-adjacent). `body` is
free-text PII from both sides. The KB question log already has a 90-day text sweep (D229); tickets
have none. Mirror D229's shape unless there is a reason not to, and if you defer it, say so in the
migration header as a deferral with a decision number rather than leaving it unmentioned.

### 2.2 Query layer — D224 holds

All new SQL in `src/tickets/query.js`. Nothing else touches `ticket_entries`; extend
`admin-static` §5 to cover the new table.

New: `addEntry()`, `listEntries(schema, ref, { visibility })`, `oldestUnansweredRequesterComment(schema)`.

**`listEntries()` takes a required visibility argument with no default, and a test proves
`visibility: 'public'` cannot return an internal row.** A default is how internal text reaches a
user's screen eighteen months from now.

### 2.3 Console

- Timeline on the ticket detail page, newest last. **Internal entries distinguished by a label, not
  only a colour** — it has to survive a screenshot.
- **One composer this phase: "Add work note."** Internal only.
- **D256's indicator**: the age of the oldest unanswered requester comment, on every ticket screen,
  where the "NOBODY HAS BEEN EMAILED" note sits. **An age, not a count** — "3" is ignorable,
  "oldest unanswered: 41h" is not. It will read empty in this phase because no requester can comment
  yet; build it anyway and let it say so.
- `ticket.worknote` joins the audit log.

### 2.4 CLI

`bin/tickets.mjs show` prints the timeline with each entry's visibility labelled. The CLI and the
console must not be able to disagree (D224) — both go through `listEntries()`.

### 2.5 Exit criteria

1. A work note and a state-change entry render in the console **and** in the CLI, visibility labelled
   in both.
2. A test proves `listEntries(visibility: 'public')` cannot return an internal row.
3. Re-running 006 against a migrated tenant is a no-op.
4. The no-orphan-columns test still passes — with `notified_at` / `read_by_requester_at` either
   reserved with reasons or given readers.
5. D256's indicator renders, and says something true when there is nothing to show.
6. Both suites green, counts up.

### 2.6 What not to do — the important one

**Do not build a "Reply to requester" composer.** Plan v3 §0 finding 8: a requester-visible composer
that ships three phases before anything can deliver the message is this project's signature defect,
built deliberately, for three to four weeks of calendar. The requester-visible composer ships in **P4,
with the delivery path and with D258's per-entry delivery state**, or not at all.

Also not this phase: resolution code and requester-visible resolution notes (P2), the transition guard
move (P2), anything requester-facing, and `getTicketForRequester()` (P3).

---

## 3. Commits

1. `feat(admin): the Agents page says no endpoint enrolls itself (D272)`
2. `refactor(admin): last-seen is enrollment activity; revoking blocks nothing (D273)`
3. `test: pin the never-enrolls caveat to the client's behaviour (D274)`
4. `feat(tickets): ticket_entries and the work-note timeline (D244 P1 slice)`
5. `feat(admin): oldest unanswered requester comment, as an age (D256 P1 slice)`

---

## 4. Register

Add D272–D274 in a new section, **PROPOSED**, with the forcing reason recorded as: *Charles read "0
active devices" against a running panel reporting "Everything I need is available" and concluded the
product was broken.* That is the fourth entry in the register whose forcing reason is *someone used
the software*, and the pattern is worth naming again.

Update the register's "next free ID" line to D275 onward.

---

## 5. Verification

Everything in §1.1 was read from the working tree on 2026-09-12: `client/src` searched for the
enrollment route (no match), `server/src` searched for `last_seen_at` (three sites, all in
`enrollment.js`), `agents.js` read in full, `renderer.js`'s hub binding and
`panel/panel-check-frame.html`'s three `.hubcopy` variants read, `main.js` confirmed to load
`index.html` rather than the Design export.

No performance claim is made in this handover. `demo-laptop-01` being a hand-enrolled B3 test row is
**inferred** from matching timestamps and B3's doc, not proven from the row's provenance.

---

## 6. Still blocked, still the founder's

**D271 — where the hub runs relative to the endpoint.** P3, P4 and P5 all wait on it, and so does
every fix that would make the Agents page meaningful rather than merely honest. Plan v3 §5.5 (the app
quits on close, so no notification path reaches a closed panel) is the same thread: the product has no
concept of which endpoints exist and are alive, and D271 is the decision that starts to give it one.
