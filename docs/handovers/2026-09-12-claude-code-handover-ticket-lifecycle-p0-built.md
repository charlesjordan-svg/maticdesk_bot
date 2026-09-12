# Handback — ticket lifecycle P0 and P0.5, built

**Date:** 2026-09-12
**Answers:** `2026-09-12-claude-code-handover-ticket-lifecycle-p0.md`, against
`2026-09-12-ticket-lifecycle-plan-v3.md` §0, §6.1, §7.6.
**Register:** §5.53 — **D269** (the note and the no-orphan-columns test) and **D270** (the job
runtime), both PROPOSED. **Every D-number in the plan and the handover is void** (§5.53a): they were
written against a register at D243 when it stood at D268. The plan's "D253" is D269; the runtime half
of its "D248" is D270.
**Commits, in the handover's order:** `2260e24` (an inherited red test, first), `36edecf` (the
failing test, RED ON PURPOSE), `9f14a82` (wire), `a9011c8` (rename), `2c8b47e` (runtime), then this
document and the register.
**Assertions:** headless **513** across 6 files (was 424 across 5, one of them failing); db **432**
across 3 (was 389).

---

## 0. What was done, in one paragraph

Both of the handover's facts checked out against the working tree. `tickets.close_note` had a SELECT
and nothing else, and two comments said otherwise; `runOne()` had one caller and it was a test. The
test that would have caught the first was written before anything else and watched fail on
`closeNote`. Then the note was wired through the console's state form, the detail page and the CLI,
renamed `internal_resolution_note` behind a guard, and every column of the ticket store put under a
test that demands a writer, a reader or a reserved-list entry with a reason. Then the job queue got
a runner, a reaper, a `cancelled` status and its contract in writing. Both suites are green; the
migrations are applied to the dev database; the hub was started against a dead PostgreSQL port and
answered.

---

## 1. P0 — exit criteria, in the handover's order

| # | Criterion | Result |
|---|---|---|
| 1 | The new test FAILS against `close_note` before the fix | **Yes.** `36edecf`, `admin-static` §5c: `FAIL  every field getTicket() returns is rendered by the console's detail page or printed by the CLI's show, or is declared reserved here with a reason  no reader: closeNote`. That commit is red on its own, as asked. |
| 2 | After the fix, the test passes | **Yes**, from `9f14a82` on. |
| 3 | `tickets state MD-1000 … --note "swapped the dock"` then `show MD-1000` prints the note | **Yes**, against `t_devco`: `MD-1000: new -> new (internal note recorded)`, then `internal resolution note (the desk's own record; the requester never sees it): swapped the dock`. The state was set to what it already was so a real dev ticket did not move. |
| 4 | The same note, from the console's state form, on the detail page and in the CLI | **Yes**, `admin-db` §5 against the real HTTP server: POST with `"  swapped the <dock> & re-seated the cable\r\n"` → trimmed on the row, escaped on the page under *Internal resolution note*, printed by `show`, audited `noted: true` with no text; a blank note on the next move keeps it and audits `noted: false`; `state --note` from the CLI appears on the page. |
| 5 | Re-running the migration is a no-op | **Yes.** `npm run migrate`: `t_devco 005-internal-resolution-note, applied 1`; again: `nothing to apply`. `db.test` §4 also runs 005's SQL a second time against a migrated tenant (unchanged), renames the column back, runs it again (renamed forward). |
| 6 | Both suites green, counts up | **Yes**: 513 / 432. |

### 1.1 What the test found beyond the column

- The handover's seed entry `session_id` (D75) is **not** reserved: both store files name it.
- `users.display_name` is **written** — `file.js`'s upsert fills it — so it needed no entry.
- Reserved on `users`: `logon_sid` (D148), `external_id`, `upn` (D55/D145). **Nothing on `tickets`.**
- **Known limit, stated in the test:** the column check is textual and per file, not per table.
  `users.status` passes because `file.js` filters *tenants* by `status`; `users.created_at` passes
  because the ticket INSERT returns its own. The comment says so rather than a list entry pretending
  the check saw them.
- A reserved entry whose column gains code **fails**, so the list can only shrink by being edited.

### 1.2 The one instruction that could not be followed as written

**§1.2(d): "Rewrite 004's block."** The migration runner stores a checksum of the whole file,
comments included, and refuses to migrate any tenant whose ledger holds a different one. Editing
004's paragraph — even a comment — would have stopped `t_devco` and every other existing tenant from
migrating. So 004 is byte-for-byte what it was; **`db-static` pins its checksum
(`6c888d52395e288a`)**; and 005's header quotes the false sentence, says all three clauses were
false, and describes the world as it now is. The handover's other lying comment,
`setTicketState()`'s docblock, is rewritten and records what it used to claim. The handover's own
§1.4 ("do not edit 004 in place") and §1.2(d) contradicted each other; the ledger settles it.

### 1.3 What was deliberately not done (as instructed)

No requester-visible `resolution_notes`; the note is not mandatory; the field is not conditional on
the target state; the column test is scoped to the ticket store (extended to `users` because it
cost four lines, not a yak); nothing requester-facing touched. `getTicket()`'s `SELECT t.*` stays,
with a comment on the returned field naming the hazard the plan's §6 records.

---

## 2. P0.5 — exit criteria

| # | Criterion | Result |
|---|---|---|
| 1 | A job with `run_after` in the past runs exactly once with two runners racing | **Yes**, `db.test` §6b: two `createJobRunner()`s, `Promise.all([r1.tick(), r2.tick()])`, the handler saw the job once, inside its tenant, row `done`, `r1.stats.ran + r2.stats.ran === 1`. |
| 2 | A job with `run_after` in the future does not run early | **Yes**: not seen by the handler, still `queued`. |
| 3 | A process killed mid-job leaves no row stuck `running`; the retry count moves | **Yes**: `claim()` then abandon; `reapStuck({ olderThanMs: 600000 })` leaves it (too young); `reapStuck({ olderThanMs: 0 })` returns it to `queued`, `attempts` stays 1 (claim already counted), lock cleared, `last_error` = `reaped: still running after 0 ms with no finish (attempt 1 of 5)`; the next tick runs it, `attempts` 2, `done`. Reaped on the 5th of 5 claims → `failed`, `attempt 5 of 5`. |
| 4 | `cancelJobsFor()` cancels a queued job, is a no-op on a done one, the CHECK accepts `cancelled` | **Yes**, plus: no-op on a **running** one (cancel wins only before the claim), no-op the second time, a cancelled row is not claimable, and `'bogus'` is still refused by `job_status_known`. |
| 5 | The hub still starts with PostgreSQL down | **Yes, run by hand** (PowerShell, `MATIC_DB_URL` → `127.0.0.1:5999`, nothing listening): `/v1/health` answered `ok: true`, `[jobs] the queue is unreachable (connect ECONNREFUSED 127.0.0.1:5999); polling continues every 500 ms and this will say when it is back` printed **exactly once** over several polls, stderr empty. Against the real database the same way: `[hub] jobs: polling control.job_queue every 500 ms as Wakanda:21432; 0 handler(s) registered - this process claims NO jobs and only reports what is waiting; …`, queue empty afterwards. |
| 6 | Both suites green | **Yes.** |

### 2.1 Shape, and why

**In-process**, as recommended: `src/jobs/runner.js` is the loop, `src/index.js` starts it inside
the listen callback after the banners and never awaits it. One process on one machine is today's
deployment, and a second process is a second thing to forget to start. The primitives (`runOne`,
`reapStuck`, `waitingOfOtherTypes`) are injected, so `test/jobs.test.mjs` drives the loop with fakes
on every `npm test` and promoting it to `bin/worker.mjs` is a move of the `start()` call. It lives
under `src/jobs/`, not `src/db/`, because `db-static` §6 forbids `index.js` importing anything under
`src/db/` — the same reason `resolveTicketTenant()` lives in `src/tickets/`.

**The contract is written twice, where it will be read** — the runner's header and
`src/jobs/handlers.js`: **AT-LEAST-ONCE, never exactly-once; idempotency is the handler's job**; a
handler re-checks its precondition from the tenant's rows; `ticket.autoclose` must be bound to the
resolution that enqueued it, or resolve → reopen → resolve closes a five-minute-old resolution with an
older job. `test/jobs.test.mjs` §2 fails if those sentences leave.

### 2.2 The reversal, made mid-build — unknown types are LEFT, not failed

The runner was first built to **fail** a job whose type it had no handler for, so an outdated
registry would show in `last_error` rather than wait silently. Then: **the dev hub Charles runs polls
the same database the test suite runs against.** With that behaviour it would have failed every
`b1-*` job `db.test.mjs` enqueues within one poll interval — the suite red whenever a hub was up — and
in any real deployment an old hub would destroy a new hub's work during a rolling restart. So
`claim(workerId, { types })` filters by the registry's keys, a hub with an empty registry claims
**nothing**, and the cost — an unknown type could wait silently — is paid in the log: each tick
counts due jobs of other types and prints the figure whenever it changes, and says *"nothing here
fails them"*. The dispatch still guards against a primitive that ignores `types`. Tested both ways.

### 2.3 Not done (as instructed)

No payload column (a static test still forbids the word). No `ticket.autoclose`. No tenant assertion
in the runner — a test asserts `withTenant`, `assertTenantSchema` and `control.tenants` are absent
from it. No retry of a handler that threw; retry belongs to the reaper, for abandoned rows only.

---

## 3. Also found, beside the task

- **`npm test` was red before this pass began**, since `29c4215` (`start:dev`): D267's guard-1
  assertion caught `bin/dev.mjs` naming the bypass variable. It sets it for the child hub and reads
  nothing; exempted by path, with a new assertion pinning that distinction (`2260e24`). The baseline
  was 125 passed, 1 failed in `admin-static`.
- `bin/tickets.mjs show` prints neither `updatedAt` nor `sessionId`. Both are on the detail page, so
  the reader test passes on "at least one reader". Noted, not widened into this pass.
- The register's own header said `2.49` while `CLAUDE.md` said `v2.53`; both now say `2.50`.

---

## 4. Honesty ledger

- **Nothing here is a measurement.** The reaper's ten-minute timeout, the five-attempt cap, the
  twenty-jobs-a-tick drain and the five-second poll are development figures. Two racing runners were
  two `tick()` calls in one process against one Docker PostgreSQL. Nothing has run under load or on
  RDS.
- **The at-least-once contract is two paragraphs until P5 writes the first handler.** The test that
  matters is the one that runs `ticket.autoclose` twice and asserts the second run does nothing.
- **A hub started today makes two queries every five seconds with nothing to do** — the reaper's
  `UPDATE … WHERE status = 'running'` and the waiting count. That is the first background query this
  hub has ever made. `MATIC_JOBS_POLL_MS=0` turns it off; the cost is not measured.
- **The "hub starts with PostgreSQL down" criterion was run by hand, not by a test.** The pool is a
  process singleton, so a headless test cannot point it at a dead port without affecting every other
  file; the runner's outage path IS tested with fakes and live (a runner whose primitives throw).
- **The column check is textual.** §1.1 says which two `users` columns that lets through.
- **Nobody has seen the state form's textarea in a browser.** `admin-db` drives the real HTTP server
  and reads the HTML; a person has not. The console's own stylesheet gives `textarea` a 420 px
  max-width and the field sets `max-width:100%`, matching the Knowledge editor's fields.
- **The reserved list makes a claim about `users.logon_sid`, `external_id` and `upn` that the test
  enforces only negatively** — that no store code names them. It cannot know whether something
  *outside* `src/tickets/` writes them; today nothing does, and that is what "reserved" means.

---

## 5. For Charles

- **D269 and D270 are PROPOSED.** Both built reversibly: the rename is one guarded migration back;
  the runner stops with `MATIC_JOBS_POLL_MS=0` and jobs sit `queued`, which is the state they were in
  yesterday.
- **Your hub now polls the database every five seconds.** It claims nothing and prints one line at
  start saying so. If that line bothers you, `MATIC_JOBS_POLL_MS=0`.
- **The plan's open questions are untouched and still yours** — plan v3 §10, especially its "D257"
  (deployment topology) which gates P3, and §5.5 (tray icon / background mode). P1 and P2 are
  unblocked and were not started, as the handover asked.
- **The plan's D-numbers are void.** When you read it, read the numbers as labels, not IDs. The
  banner on each filed copy says so.
