# Handback — ticket lifecycle P5, built: a resolved ticket closes on its own, bound to the resolution that started the clock

**Date:** 2026-09-12 (night, Pacific), on Charles's *"do p5"*.
**Answers:** plan v3 §7.6 (auto-close and the runner it needs), §3.1's `resolved` row (a requester
comment cancels the job **for that resolution**), §7.5's confirm row, its §8 row P5 and its §8.4
kill switch; the plan's open questions 5 (interval default — 72 h, as recommended, labelled a
proposal) and 6 (does an auto-close notify the requester — yes, as the same public state change
every other update travels as). `docs/handovers/2026-09-12-ticket-lifecycle-plan-v3.md`.
**Follows:** `docs/handovers/2026-09-12-claude-code-handover-p4-built.md` (D286–D288).
**Register:** `docs/decisions/DECISION-REGISTER.md` §5.59 — **D289** (auto-close), **PROPOSED**;
**D270's ratified condition 2 is DISCHARGED** (the first handler proves at-least-once by running
twice). Register at v2.57, D1–D289; next free is **D290**.
**Commit:** one, code and tests together, because the no-orphan-columns and every-field-has-a-reader
tests fail on a column with no reader and a field with no surface. Then this document and the register.
**Assertions:** server headless **733** across 7 files (was 695); db **661** across 3 (was 625);
client **2041** across 26 (was 2038).

---

## 0. What was done, in one paragraph

When the desk resolves a ticket, the hub now enqueues one `ticket.autoclose` job for `resolved_at`
plus the tenant's interval and writes that job's id and instant on the ticket. When the job runs,
the ticket closes as `closed_by = 'auto'` only if it is still resolved, still bound to that job's id,
and due — all three in the one UPDATE's WHERE under the row lock — and a public state change is
written that the requester's app shows as "closed on its own". Anything else is success with a
sentence: the requester confirmed (already closed), the requester commented (reopened; the
resolution is gone), the desk moved it, or a newer resolution is bound to a newer job. Every one of
those paths also clears the binding in its own UPDATE and withdraws the queued job. The interval is
a per-tenant setting, 72 hours by default and labelled a proposal everywhere it appears, changed on
the console's tickets list under `settings.write` or from the CLI through the same function, and
NULL is the kill switch. D270's condition — the first handler proves at-least-once by running twice
— is discharged in the database suite: the second run finds the binding gone and writes nothing.

---

## 1. Exit criteria — plan v3's P5 row, in order

| # | Criterion | Result |
|---|---|---|
| 1 | A resolved ticket with no response auto-closes after the interval **and not before** | **Yes.** `admin-db` P5 §4: the handler run before the due instant does nothing; run after it closes, `closed_by 'auto'`, one public `state_change`. The due instant is in the UPDATE's WHERE (`auto_close_at <= now()`), not a check-then-act. |
| 2 | A confirm cancels the job | **Yes.** P5 §3: confirm → job `cancelled`, binding cleared, `closed_by 'requester'`. |
| 3 | Resolve → reopen → resolve does **not** close early | **Yes.** P5 §2–3: the reopen cancels the first job and clears the binding; the re-resolve enqueues a SECOND job with a different id and binds to it; `jobs.test` 1b: a job whose id is not the ticket's `auto_close_job_id` says "resolved by a NEWER resolution bound to job N" and does nothing. |
| 4 | The job is bound to the resolution, not the ticket (§7.6) | **Yes.** `tickets.auto_close_job_id` (tenant/010) IS the binding; the handler compares it to its own id. Plan §7.6 offered "store the job id on the ticket, or compare resolved_at"; the first was taken because the queue row has no payload column (D196) and one equality is easier to reason about than two clocks. |
| 5 | Kill switch: interval NULL stops enqueueing; in-flight jobs no-op | **Yes.** P5 §6: `autoclose --off` → resolving enqueues nothing and `autoCloseAt` is null; a job already queued finds `auto_close_job_id` NULL (the binding was never written, or a move cleared it) and does nothing. |
| 6 | D270's condition 2: the first handler runs twice before `ticket.autoclose` ships | **Yes, discharged.** P5 §4 runs the SAME job twice; entry count and `closed_at` unchanged on the second run. |
| 7 | Nothing here fails a job for an unknown type or asserts a tenant in the runner (D270) | **Unchanged.** The registry has one entry; `jobs.test` §2's pins on the runner stand. |

---

## 2. What was built, by file

- `server/migrations/control/009-ticket-autoclose-interval.sql` — `tenants.ticket_autoclose_hours integer DEFAULT 72`, CHECK 1–8760 or NULL.
- `server/migrations/tenant/010-autoclose.sql` — `tickets.auto_close_at timestamptz`, `tickets.auto_close_job_id bigint` (no FK), a partial index.
- `server/src/tickets/query.js` — `AUTOCLOSE_JOB`, `autocloseHoursForSchema()`, `scheduleAutoclose()` (called inside `resolveTicket()`'s transaction after the UPDATE: cancel any queued job for the ticket, enqueue one, write id + instant), `closeByAutoclose()` (the handler's one guarded write); the binding cleared and the job withdrawn in `requesterComment()`'s reopen branch, `confirmResolution()` and `setTicketState()`; `getTicket()` and the requester shape carry `autoCloseAt`.
- `server/src/tickets/autoclose.js` (new) — the setting (`autocloseSetting`, `setAutocloseHours` — refuses out of range, null is off), `createAutocloseHandler()`, `AUTOCLOSE_AUTHOR` (`system`, labelled `auto-close`). No SQL of its own.
- `server/src/jobs/handlers.js` — one entry, `ticket.autoclose`; the header no longer says empty.
- `server/src/admin/pages/tickets.js` — the Auto-close panel on the list (read `settings.read`, form `settings.write`, `POST /admin/tickets/autoclose`, audited `ticket.autoclose.set` / `.refused` with the value); the detail page's "Closes automatically … unless the requester says otherwise" / "Will not close on its own — …"; the Resolve form's "Resolving starts a N-hour clock"; the flash; the closed-by-auto gloss.
- `server/bin/tickets.mjs` — `autoclose [--hours N | --off]`; `show` prints the instant and glosses `auto`; `resolve` prints when it closes or that auto-close is off.
- `client/src/agent/ticket-watch.js` — the snapshot row carries `autoCloseAt`.
- `client/src/ticket/state-words.js` — `untilWords()`; the resolved detail line says "closes on its own in 3 days unless you say otherwise"; a state change labelled `auto-close` reads "closed on its own … If the problem is back, raise a new ticket".

---

## 3. Honesty ledger

1. **One migration was rewritten before commit, and how.** tenant/010 first typed `auto_close_job_id`
   as `uuid`; `control.job_queue.id` is a `bigserial`, and the database suite found it on the first
   resolve (`invalid input syntax for type uuid: "564"` — thirty downstream failures from one cause).
   The column type was corrected by rolling the minutes-old, never-committed ledger row and the two
   columns off the dev tenant by hand and re-migrating, NOT by a tenant/011. The immutability rule
   (`migrate.js`, CLAUDE.md) protects migrations other tenants hold; none did. The committed 010 is
   the only 010 any ledger has ever held. Had it been pushed, the answer would have been tenant/011.
2. **72 hours is a proposal.** Plan v3 §7.6's argument (survive a weekend) and its §9's finding
   (no vendor default from a primary source) are both in control/009's header, on the console panel,
   in the CLI's output and in `autoclose.js`. Nothing has been measured.
3. **"Notify the requester of the close" is answered with the same channel as every update:** a
   public `state_change` the watch shows as "closed on its own". Nobody is emailed (D86). If the
   app is not open, the line waits for the next poll after it opens.
4. **The runner-path check accepts either worker.** A dev hub sharing the database now HAS this
   handler and can claim a due job before the test's `runOne()`; the check says which worker won and
   asserts the ticket's outcome. On this run the test's own worker claimed it. That is a shared-
   database fact, not a defect, and it is why the at-least-once proof runs the handler directly.
5. **The interval is read at resolve time, never re-applied.** Changing it does not move instants
   already shown to requesters; the console says so. A tenant that turns it OFF leaves already-queued
   jobs queued; each will find its ticket still bound and CLOSE it when due — the OFF setting stops
   NEW bindings. The console's flash says exactly that. If Charles wants OFF to also withdraw what is
   queued, that is one `UPDATE control.job_queue … WHERE tenant_schema = … AND status = 'queued'` in
   `setAutocloseHours()` and a decision to record; it was not assumed.
6. **Not watched in a browser.** The console panel, the detail page's new sentence and the Resolve
   form's copy are exercised by `admin-db` reading the rendered HTML; nobody has opened them. The
   client's new words are unit-tested and not seen in Electron (same as P4).
7. **The dev tenant's interval is 72 (the default).** No dev ticket was resolved or closed by this
   work; the dev queue holds no `ticket.autoclose` row.

---

## 4. What is next

- **Ratify or revert D289** (and D286–D288 from P4, which stand on their own).
- **Decide ledger item 5** if OFF should also withdraw queued jobs.
- **The Electron and browser click-throughs** for P4 and P5 together (`client/docs/PANEL-RENDERER-CHECK.md`, and the console pages by hand).
- **D270's condition 1** (promote the runner to a separate worker before a LAN deployment) and the
  console's security review — both owed since P3b, both still owed.
- **Claude Design's answer** to `docs/handovers/2026-09-12-claude-design-handover-ticket-timeline-and-toast.md` — sending it is Charles's act. When the view lands, a resolved ticket's screen should carry the same "closes on its own …" sentence the band does, from `stateDetail()`.
- The lifecycle plan's phases are now built through P5. What remains of it is P6 (email, gated on D86) and the open questions its §9 lists.
