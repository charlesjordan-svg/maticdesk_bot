# Claude Code handover — ticket lifecycle, P0 and P0.5

> **FILED AND EXECUTED 2026-09-12.** The handback is
> `2026-09-12-claude-code-handover-ticket-lifecycle-p0-built.md`. **Its D-numbers are VOID** — "D253"
> is register **D269**, the runtime half of "D248" is **D270** (register §5.53a). Three instructions
> could not be followed as written and the handback says why: §1.2(d) "rewrite 004's block" (the
> migration ledger checksums comments; retracted in 005 instead), the D-numbers, and — a reversal
> made mid-build, not an instruction — an unknown job type is left queued and reported rather than
> failed.

**Date:** 2026-09-12
**Plan:** `2026-09-12-ticket-lifecycle-plan-v3.md` (this folder). Read §0, §6.1 and §7.6 before
starting. v1, the analysis, and v2 are superseded — **do not work from them.**
**Scope of this handover:** **P0 and P0.5 only.** Both are unblocked by every open question in the
plan. P1 and P2 are sketched in §6 so you can see where this is going; **do not build them in this
pass.** P3 onward is gated on D257 (deployment topology), which is Charles's decision and is not made.
**Decisions this implements:** D253 (PROPOSED), and the runtime half of D248 (PROPOSED).

---

## 0. Read this first — what you are and are not doing

You are doing **two small, boring, high-value things**:

1. **P0 — making the schema stop lying.** `tickets.close_note` has no writer and no reader, and *two*
   comments in the repo say otherwise. Wire it, rename it, fix both comments, and add a test that
   makes this class of defect impossible to reintroduce.
2. **P0.5 — giving `control.job_queue` a runtime.** The table and the primitives exist. Nothing calls
   `runOne()`. Everything the plan does with auto-close depends on a worker that does not exist.

You are **not** building the comment timeline, resolution notes, notification, the endpoint, or
anything requester-facing. Those are later phases and two of them are gated on a decision Charles has
not made.

**The one thing that would make this pass a failure:** shipping a change that makes a comment,
docblock or UI string describe behaviour that is not there. That is the defect this project has
shipped three times and it is precisely what P0 exists to clean up. Do not add a new one while
removing an old one.

---

## 1. P0 — the dead column and the two lying comments

### 1.1 The facts, verified 2026-09-12

- `migrations/tenant/004-session-outcomes.sql` (tail, the `close_note` block) says: *"The console's
  state form offers it as an optional field when moving to resolved or closed; nothing reads it yet
  except the ticket's own detail page and the CLI."* **All three clauses are false.**
- `src/tickets/query.js`, `setTicketState()`'s docblock repeats the same false claim about the detail
  page and the CLI. **Two lying comments, in the two places a future writer reads first.**
- `src/admin/pages/tickets.js` → `stateBlock()` renders a `<select>` and a submit button. No note field.
- `src/admin/pages/tickets.js` → `statePost()` calls `setTicketState(schema, ref, next)` — the
  `{ note }` options object that `setTicketState()` accepts is never passed by any caller.
- `src/tickets/query.js` → `getTicket()` returns `closeNote`; `detailPage()` never renders it and
  `bin/tickets.mjs show` never prints it.

Net: **a column with no writer and no reader**, documented as if it had both.

### 1.2 What to build

**(a) Rename the column.** `close_note` → `internal_resolution_note`.

The reason is in plan §6.1 and it matters: ServiceNow's *requester-facing* resolution text is the
field named `close_notes` (verified via IBM's integration docs). P2 adds a requester-visible
`resolution_notes`. Keeping ours as `close_note` while it holds the **internal** account gives us the
industry's field name with the opposite visibility — a trap for the next engineer, for D85's SoR-flip
mapping, and for any future ServiceNow integration. It is free to rename today because nothing reads
it. It is never cheaper than today.

Put the rename in a new migration, **not** by editing 004. `ALTER TABLE … RENAME COLUMN` has no
`IF EXISTS`, so guard it the way 003 already guards its constraint adds:

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute
              WHERE attrelid = (current_schema() || '.tickets')::regclass
                AND attname = 'close_note' AND NOT attisdropped)
     AND NOT EXISTS (SELECT 1 FROM pg_attribute
              WHERE attrelid = (current_schema() || '.tickets')::regclass
                AND attname = 'internal_resolution_note' AND NOT attisdropped)
  THEN
    ALTER TABLE tickets RENAME COLUMN close_note TO internal_resolution_note;
  END IF;
END
$$;
```

Re-running the migration on a half-migrated tenant must be a no-op. The B1 runner applies migrations
to every tenant schema — assume one is mid-flight.

**(b) Wire the writer.**

- `stateBlock()` gains an optional `<textarea name="note">`, labelled as the **internal** note, with
  copy making clear the requester never sees it. One field, always shown; do not make it conditional
  yet — the conditional-on-`resolved` behaviour arrives in P2 with the *requester-visible* field, and
  two conditionals landing in different phases is how one of them ends up wrong.
- `statePost()` passes it: `setTicketState(schema, ref, next, { note: ctx.form.note })`.
- `bin/tickets.mjs state` gains `--note "…"` and passes it the same way.

`setTicketState()` already trims, caps at 4000 and `COALESCE`s so a later move carrying no note does
not blank an existing one. Do not change that behaviour; it is correct.

**(c) Wire the readers.**

- `detailPage()` renders `internalResolutionNote` in the left column, under the case note, **labelled
  internal** in words, not only by colour — plan §7.4's rule, and it applies here already because this
  is the first internal-only field the page will show.
- `bin/tickets.mjs show` prints it.

**(d) Fix both comments.** Rewrite 004's block and `setTicketState()`'s docblock to describe what the
code now does. Keep D239's rationale for why the column exists — that part was always true and is the
reason the column is worth keeping.

**(e) The no-orphan-columns test** — this is the part that matters most.

Add to the existing static-test family (`test/admin-static.test.mjs` §5 already asserts that nothing
outside `src/tickets/query.js` touches the `tickets` table — put this beside it, or in
`test/db-static.test.mjs` if it needs a live connection for `information_schema`):

> Read every column of `tickets` from `information_schema.columns`. Assert each column name appears
> somewhere in `src/tickets/query.js` or `src/tickets/file.js`. Fail on any that does not — **unless
> it appears on an explicit reserved list declared in the test file, each entry carrying a one-line
> reason and a decision number.**

Seed the reserved list with what is legitimately reserved today:

| Column | Reason |
|---|---|
| `session_id` | D75 — the endpoint creates sessions now; keep only if genuinely unread by both files, otherwise drop from the list |
| `logon_sid` *(on `users`, if you extend the test there)* | D148 — attested identity, pipe transport not built (D200/D201) |
| `external_id`, `upn` *(on `users`)* | D55/D145 — written by a directory sync that does not exist |

Scope the test to `tickets` in this pass. Extending it to `users` is a good idea and will surface more
reserved columns; do that only if it does not turn into a yak-shave.

**The reserved list is the feature, not an escape hatch.** It turns "this column is deliberately
unused" from a claim in a comment into an entry the test suite reads. Same move D224 made for SQL,
applied to schema.

### 1.3 Exit criteria — prove them in this order

1. **The new test FAILS against `close_note` before you fix anything.** Write the test first, run it,
   watch it fail, and put the failure in the commit message or the handback. A test that has only ever
   passed proves nothing about whether it would have caught this.
2. After the fix, the test passes.
3. `npm.cmd run tickets -- state MD-1000 resolved --note "swapped the dock"` then
   `npm.cmd run tickets -- show MD-1000` prints the note.
4. The same note, written from the console's state form, appears on the detail page and in the CLI.
5. Re-running the new migration against an already-migrated tenant is a no-op.
6. `npm.cmd test` and `npm.cmd run test:db` still green, with the assertion counts moving up.

### 1.4 What not to do

- **Do not edit 004 in place** to make its comment true. The migration ran; rewrite the comment to
  describe the world, and put the rename in a new file.
- **Do not add the requester-visible `resolution_notes` field.** That is P2 and it carries a refusal
  rule (D246) that needs its own tests.
- **Do not make the note mandatory.** The mandatory field is the *requester-visible* one in P2.
- **Do not widen the test into a general "every column everywhere" lint.** Scope it to the ticket
  store, where D224 already gives it a natural boundary.

---

## 2. P0.5 — the job queue has no runtime

### 2.1 The facts, verified 2026-09-12

`src/db/jobs.js` exports `enqueue`, `claim`, `finish`, `fail`, `runOne`. `control.job_queue` exists in
`migrations/control/001-control-plane.sql` with `FOR UPDATE SKIP LOCKED` and a `run_after` column.

**Nothing calls `runOne()`.** A content search across `server/src` for `runOne`, `setInterval`, and
imports of `jobs.js` returns matches only inside `jobs.js` itself (plus `test/db.test.mjs`).
`src/index.js` does not import it. There is no worker, no scheduler, and no reaper for rows left
`running` by a restart — `jobs.js`'s own comment says *"a reaper can time out"* in the future tense.

The status `CHECK` in `control/001` is `('queued','running','done','failed')` — **there is no
`cancelled`**, and no `cancel` function.

**Plan v2 claimed auto-close "needs no new infrastructure". That was false**, and it is why P0.5
exists. Everything D248 does depends on this.

### 2.2 What to build

**(a) A runner.** Two acceptable shapes; pick one and say why in the handback:

- an in-process interval started from `src/index.js` (simplest, one process, matches the current
  deployment); or
- `server/bin/worker.mjs`, run separately (matches the existing CLI shape, survives a hub restart
  independently, and is what a real deployment will want).

Recommendation: **in-process for now**, with the loop isolated in its own module
(`src/db/job-runner.js`) so promoting it to `bin/worker.mjs` later is a move, not a rewrite. Whichever
you pick, `src/index.js` must still start when PostgreSQL is down — the hub already has that property
(`/v1/health` reports corpus errors rather than refusing to boot) and the runner must not take it away.

**(b) `cancelled` in the status `CHECK`** — a control-plane migration, plus `cancelJobsFor(type, refId)`
in `jobs.js`. D255 and `/confirm` both need to cancel a pending auto-close; today there is nothing to
call.

**(c) A reaper.** A row `running` with no progress past a timeout goes back to `queued` (with
`attempts` incremented) or to `failed` past a retry cap. Without it, one hub restart mid-job wedges
that job forever and nobody finds out.

**(d) Idempotency is the caller's job, and say so loudly in the runner's header.** The runner
guarantees at-least-once, never exactly-once. Every job type must tolerate running twice. This is not
a note for later — it is the property `ticket.autoclose` depends on, and P5 will get it wrong if the
runner's contract is not written down here.

### 2.3 Exit criteria

1. A job enqueued with `run_after` in the past runs **exactly once** with two runners racing (the
   existing `SKIP LOCKED` test shape extends to this).
2. A job enqueued with `run_after` in the future does **not** run early.
3. Killing the process mid-job and restarting leaves **no** row stuck `running` — the reaper returns
   it and the retry count moves.
4. `cancelJobsFor()` cancels a `queued` job, is a no-op on a `done` one, and the `CHECK` accepts
   `cancelled`.
5. The hub still starts with PostgreSQL down.
6. Both suites green.

### 2.4 What not to do

- **Do not add a `payload` column.** `jobs.js`'s header is explicit: references, never payloads,
  because `control.job_queue` is the one cross-tenant table and a leaked row must leak a schema name
  and a uuid rather than customer data. If a job type seems to need a payload, the answer is a row in
  the tenant's schema and a reference to it.
- **Do not implement `ticket.autoclose` itself.** That is P5, and it needs the resolution-binding rule
  in plan §7.6 that does not exist yet.
- **Do not put an assertion about tenants in the runner.** `withTenant()` is the only door and it
  already asserts; a second check here is the copy that a future worker forgets.

---

## 3. Commits

Small and separable, in this order:

1. `test: no-orphan-columns test for tickets (fails against close_note)` — the failing test alone.
2. `feat(tickets): wire the internal resolution note through console and CLI`
3. `refactor(db): rename close_note to internal_resolution_note, guarded` + both comment fixes
4. `feat(db): job runner, cancel status and reaper for control.job_queue`

Commit 1 standing alone, red, is the evidence for exit criterion 1.3.1. Do not squash it into 2.

---

## 4. Decision provenance

Status is as held when this handover was written; none is ratified.

| ID | Status | What it says |
|---|---|---|
| **D253** | PROPOSED | `close_note` → `internal_resolution_note`; every `tickets` column has a writer or a declared reserved-list entry |
| **D248** | PROPOSED | Requester confirms or the ticket auto-closes on a configured interval, via a delayed `control.job_queue` job. **P0.5 builds only the runtime it needs** |
| D224 | ratified | One query layer; the CLI and the console cannot disagree about the rows |
| D239 | ratified | The close note exists so the human's account of what fixed it has somewhere to land; it is the KB draft loop's eventual input |
| D143 | ratified | One schema per tenant; `control.job_queue` is the deliberate cross-tenant exception |

Add D253 to the register in this pass, marked PROPOSED, with the two false comments quoted as its
forcing reason. That is what the register is for.

---

## 5. Verification

- Everything in §1.1 and §2.1 was **read from the working tree on 2026-09-12** and independently
  re-verified after an adversarial review. Treat the specific function and file names as accurate and
  the line numbers as indicative.
- No performance claim is made anywhere in this handover.
- `[VERIFY]` — `src/admin/session.js` uses `sha256(token)` for session cookies. Asserted by B3's doc
  and `enrollment.js`; the file itself was not opened. It does not affect P0 or P0.5.

---

## 6. What comes next, so you can see the shape

**Not in this pass.**

- **P1** — `tenant/005-ticket-timeline.sql`, `ticket_entries`, **work notes only**. The
  requester-visible composer deliberately does **not** ship until P4, because a "Reply to requester"
  button that reaches nobody for three phases is this project's signature defect, built on purpose.
  P1 also decides retention for free-text entry bodies (D229's 90-day KB sweep is the precedent).
- **P2** — `resolution_code` + requester-visible `resolution_notes`, refused transitions, `closed`
  terminal in the console, and the TOCTOU fix: move the transition guard out of `statePost()`'s
  separate read and into `UPDATE … WHERE reference = $1 AND state = $from`.
- **D257 — GATE.** Deployment topology. The hub binds `127.0.0.1` and refuses non-loopback peers, with
  TLS out of scope. Until Charles decides where the hub runs relative to an endpoint, P3's device
  credential and P4's polling cannot be sized or justified. **Do not start P3.**
- **P3/P4/P5** — enrollment credential, panel view and polling, confirm/reopen and auto-close. See the
  plan.

One thing to carry forward from P1 onward: `getTicket()` does `SELECT t.*`. The moment any
requester-facing route exists, that shape would ship `summary` (D214: never shown to the user),
`what_was_checked` and the internal resolution note to the requester. P3 adds
`getTicketForRequester()` and D259's denylist test. **Nothing in P0/P0.5 touches a requester-facing
route, so it is not a hazard yet** — it is written here so it is not discovered later.
