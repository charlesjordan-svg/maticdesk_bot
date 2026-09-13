# Claude Code handback — the ticket lifecycle click-through benchmark, RUN AND PASSED

**Date:** 2026-09-13
**Answers:** `docs/handovers/2026-09-13-claude-code-handover-lifecycle-clickthrough-benchmark.md`
**Repo:** `C:\Users\Charles\Downloads\maticdesk_bot`, branch `main`.
**Register:** updated to **v2.58**, §5.60. **D290–D292 taken. Next free is D293**, and the register's
own "next free ID" line was corrected in the same pass — the trap §5.53a exists for.

**Commits, in order:**

| Commit | What |
|---|---|
| `a38092e` | `test(admin-db)`: the job-id leak check is leaf equality, not a substring |
| `764c77c` | `test(clickthrough)`: the ten-scenario harness, and its red run |
| `607e05e` | `feat(tickets)`: auto-close waits for DELIVERY, and gives up out loud (**D290**) |
| `8a98190` | `fix(admin)`: the Metrics page computes deflection instead of refusing to |
| *(this one)* | the register, the handback, the scorecard, the screenshots, CLAUDE.md |

**Assertion counts — before → after:**

| Suite | P5 baseline | Measured at start | Now |
|---|---|---|---|
| server headless (`npm test`) | 733 | **733** | **750** |
| db (`npm run test:db`) | 661 | **660, and RED** — see §4 | **674** |
| client (`npm test` in `client/`) | 2041 (handover) / 2056 (CLAUDE.md) | **2056** | **2056** |
| click-through (`npm run clickthrough`) | — | **51/59 on the first complete run** | **59/59** |

---

## 1. THE ANSWER IN ONE PARAGRAPH

**Every test passes: 59 of 59, on a clean full run, nothing skipped, quarantined or narrowed.**
The one test the plan predicted would fail did fail — **T8.5, the Friday/Tuesday test** — and the red
run is in `docs/handovers/screenshots/2026-09-13-clickthrough/first-complete-run.log`. A ticket
resolved with the client shut auto-closed itself on a resolution the requester was never shown, never
asked about, and never had the chance to dispute. **D290 is the fix and it is built.** Five more
findings came from *looking at screens* rather than from assertions, which is now eleven straight
click-throughs on this project that have found something. And §13 of the plan called the ending
correctly: the lifecycle works, the delivery model did not, and **its real ceiling is D292** — a
resolution can only be delivered to an app that is running, and the app still quits when its window
closes.

---

## 2. BUILT UNDER FREE REIN — NEEDS RATIFICATION

Three decisions, all **PROPOSED**, all at the top because a founder-shaped decision buried in a diff
is the thing §7.3 forbids.

### D290 — the auto-close clock starts at DELIVERY, not at resolution

**What it does.** Three parts, all built and all tested:

1. **Arm on ack.** The first acknowledgement that the endpoint *showed* the resolution
   (`ticket_entries.read_by_requester_at`, D287) re-binds the clock to `read_at + the tenant's
   interval`. Only the first can: the UPDATE stamps a null column only, so a client cannot keep
   pushing its own ticket's clock back.
2. **Refuse at the handler.** `closeByAutoclose()` has a fourth condition beside D289's binding. The
   gate reads `read_by_requester_at`, never `notified_at` — handed to an app is not shown to a person.
   Undelivered **re-arms**; it never closes and it never fails.
3. **A backstop** (`migrations/tenant/011-autoclose-delivery.sql`). After `MAX_AUTOCLOSE_REARMS` = 3
   of the tenant's own intervals the hub gives up, stamps `resolution_undelivered_at`, leaves the
   ticket **resolved**, and puts it on the console's new **"Resolved, never delivered"** list. A
   ticket that re-arms forever is its own quiet failure.

**Its forcing reason.** Observed, not reasoned. Before this, auto-close converted *unreachability*
into consent, where it is only entitled to convert *silence*. D238 already draws that line in the
other direction.

**What it costs to revert.** One `git revert` of `607e05e`, plus leaving tenant/011's two columns
unused (a migration is never un-applied — `db-static` checksums them). The console's
"Resolved, never delivered" panel and the ticket-page sentences go with it.

**Two numbers in it are proposals, not measurements.** `MAX_AUTOCLOSE_REARMS = 3` — three tries over
three of the customer's own intervals, which at the 72-hour default is nine days: longer than a
holiday weekend, shorter than a fortnight's leave. Both of those are judgements. The 72 hours beside
it was already a proposal (plan v3 §7.6).

### D291 — pre-enrollment tickets stay unmatched, permanently

**Changes no code.** A ticket filed before an enrollment existed has no trustworthy link to it, and
the obvious fix — backfilling `tickets.device_id` by matching `os_username` — grants ticket visibility
on a self-asserted field (D215): authorization by convention, the exact failure `src/tickets/file.js`
refuses a client-supplied tenant to prevent. Written down *because* it changes nothing: the next
person to look at those rows will reach for the backfill, and a row saying "considered, refused, here
is why" is what stops them. **Revert cost: delete a register row.**

The Electron pass photographed it working — five of Charles's own earlier tickets sitting in the band
under *"filed before this machine was enrolled with the service desk, so it can't match them to me"*
(`panel-06-tickets-band-open.png`).

### D292 — background presence. Still yours, and now with evidence

Not built. D290 removes the sharp edge but not the cause: with the app shut, a resolution now waits
instead of closing wrongly — and then waits until the backstop gives up and a human has to chase the
person another way. **The console's "Resolved, never delivered" list is what a service desk sees when
presence is missing**, and this run produced the first real instance of it. The three options and the
recommendation are unchanged from `2026-09-13-autoclose-delivery-gap-and-background-mode.md` §3.

---

## 3. THE SCORECARD

**Every row ends ✅ PASS.**

| ID | Scenario | Surface | What it proves | First run | Final | Iters | Fixed by | Decision | Eyes | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| T1.1 | deflection | hub | a covered question is answered and cited; NO row appears in tickets | ✅ PASS | ✅ PASS | 1 | *(harness)* the scripted provider returned message content; /v1/ask answers through the `answer` TOOL (D205) | — | panel | — |
| T1.2 | deflection | client | a consented action reports in the catalog's words, not the mechanism's (D250); no ticket filed | ✅ PASS | ✅ PASS | 1 | — | — | panel | — |
| T1.3 | deflection | console | the session outcome is a deflection (D89 counts SESSIONS) and the console's deflection surface reflects it | ❌ FAIL | ✅ PASS | 2 | the Metrics page computes deflection through the sessions store | — | console | `console-04-metrics-deflection.png` |
| T1.4 | deflection | hub | the tickets band count is unchanged and 'where's my ticket?' does not invent one | ✅ PASS | ✅ PASS | 1 | — | — | panel | — |
| T2.1 | the spine | hub | the requester files; a real MD-#### comes back and the band words exist for each state | ✅ PASS | ✅ PASS | 1 | — | — | panel | — |
| T2.2 | the spine | console | the ticket lands in the console queue with provenance (device_key_id, os_username) and state = new | ❌ FAIL | ✅ PASS | 2 | the ticket names the enrollment the Agents page lists; `profile_source` glossed | — | console | `console-08-…-provenance.png` |
| T2.3 | the spine | both | two work notes render in console AND CLI labelled internal, by a LABEL not only a colour | ✅ PASS | ✅ PASS | 1 | — | — | console + panel | — |
| T2.4 | the spine | console | not yet handed -> handed -> seen as the endpoint polls and acks; never 'sent' or 'notified' | ✅ PASS | ✅ PASS | 1 | *(harness)* the check searched for the word "sent" and hit the honest negative "cannot be sent by email" | — | console | — |
| T2.5 | the spine | hub | the reply reaches the requester's read quoted in full, within one poll; nothing is spoken (D288) | ✅ PASS | ✅ PASS | 1 | — | — | panel | — |
| T2.6 | the spine | console | resolve without a code is refused with a sentence; without notes, refused; with both, accepted | ✅ PASS | ✅ PASS | 1 | — | — | console | — |
| T2.7 | the spine | both | the resolved line reads 'closes on its own in 3 days unless you say otherwise'; the console carries the same clock | ✅ PASS | ✅ PASS | 1 | — | — | console + panel | — |
| T2.8 | the spine | both | confirm -> closed, closed_by requester, the resolution kept, the queued auto-close job cancelled | ✅ PASS | ✅ PASS | 1 | *(harness)* D290 binds a SECOND job on the ack, so "exactly one job ever existed" stopped being the property | — | console + panel | — |
| T2.9 | the spine | cli | the timeline is ordered and attributed, and the CLI's show and the console cannot disagree (D224) | ✅ PASS | ✅ PASS | 1 | *(harness)* the CLI's own legend was counted as two timeline entries | — | — | — |
| T3.1 | the desk works it | console | a requester comment on a LIVE ticket starts D276's clock; the console shows an AGE, not a count | ✅ PASS | ✅ PASS | 1 | — | — | console | — |
| T3.2 | the desk works it | hub | the desk's reply clears the clock in the same transaction as the entry | ✅ PASS | ✅ PASS | 1 | — | — | — | — |
| T3.3 | the desk works it | hub | internal work notes are invisible to the requester on every surface | ✅ PASS | ✅ PASS | 1 | — | — | panel | — |
| T3.4 | the desk works it | hub | two requester comments in a row: the age is the OLDEST unanswered, not the newest | ✅ PASS | ✅ PASS | 1 | — | — | — | — |
| T3.5 | the desk works it | client | resolution notes are presented as a QUOTATION, attributed, never in the agent's own voice (D214) | ✅ PASS | ✅ PASS | 1 | — | — | panel | — |
| T4.1 | two agents | console | Agent A work-notes, Agent B resolves; author_label is a snapshot per entry, so both people show | ✅ PASS | ✅ PASS | 1 | — | — | console | — |
| T4.2 | two agents | console | the resolution is authored by whoever resolved (B) — D252 — and nothing claims A owned it | ✅ PASS | ✅ PASS | 1 | *(harness)* the same, for "assigned to" and "cannot be assigned to a person" | — | console | — |
| T4.3 | two agents | hub | the audit log carries ticket.worknote / ticket.comment / ticket.resolve with the right actor on each | ✅ PASS | ✅ PASS | 1 | — | — | — | — |
| T4.4 | two agents | console | suggested_owner routes nothing and NO surface implies it does | ❌ FAIL | ✅ PASS | 2 | "Suggested owner" says nothing routes on it and nobody was told | — | console | `console-02-…-detail.png` |
| T4.5 | two agents | hub | A and B move the same ticket at the same instant: the loser gets a sentence, not a constraint violation | ✅ PASS | ✅ PASS | 1 | — | — | — | — |
| T5.1 | the vendor | console | the vendor exchange is recorded as work notes — the vendor has no account and no surface | ✅ PASS | ✅ PASS | 1 | — | — | console | — |
| T5.2 | the vendor | console | a requester comment arrives while the ticket is with the vendor; the clock starts; the desk can hold it | ✅ PASS | ✅ PASS | 1 | — | — | console | — |
| T5.3 | the vendor | both | referred_to_vendor + requester-visible notes readable by a non-technical person, leaking no vendor detail | ✅ PASS | ✅ PASS | 1 | — | — | console + panel | — |
| T5.4 | the vendor | console | nothing in the product claims a vendor was contacted, because nothing contacted one | ✅ PASS | ✅ PASS | 1 | *(harness)* the gloss is "Referred to a vendor"; the regex wanted "the vendor" | — | console | — |
| T6.1 | the requester disagrees | console | a comment on a RESOLVED ticket reopens it in one transaction and clears the resolution | ✅ PASS | ✅ PASS | 1 | — | — | console | — |
| T6.2 | the requester disagrees | hub | the first auto-close job is cancelled and the binding cleared | ✅ PASS | ✅ PASS | 1 | — | — | — | — |
| T6.3 | the requester disagrees | hub | POST /reopen with a reason does the same and records it; without a reason it is refused | ✅ PASS | ✅ PASS | 1 | — | — | — | — |
| T6.4 | the requester disagrees | hub | re-resolve enqueues a SECOND job; the first, run by hand, says 'resolved by a NEWER resolution' | ✅ PASS | ✅ PASS | 1 | — | — | — | — |
| T6.5 | the requester disagrees | hub | the second handler run twice writes nothing the second time (D270, re-proven end to end) | ✅ PASS | ✅ PASS | 1 | *(harness)* the scenario resolved and jumped to the due instant without the requester ever being shown it — which is now the undelivered path | — | — | — |
| T7.1 | confidentiality | hub | GET /v1/tickets and the timeline read return ONLY the allow-listed fields | ✅ PASS | ✅ PASS | 1 | — | — | — | — |
| T7.2 | confidentiality | panel | the rendered panel DOM contains none of the five internal values | ✅ PASS | ✅ PASS | 1 | (was never the harness's to pass) the Electron DOM grep is the verdict | — | panel | `panel-03/04/05-MD-1020-*.png` |
| T7.3 | confidentiality | hub | the ack payload and every error body carry none of them (404/401/429 included) | ✅ PASS | ✅ PASS | 1 | — | — | — | — |
| T7.4 | confidentiality | hub | adding a column to tickets without adding it to the allow-list FAILS the test | ✅ PASS | ✅ PASS | 1 | — | — | — | — |
| T7.5 | confidentiality | hub | listEntriesForRequester() cannot be made to return an internal entry, including by passing a visibility | ✅ PASS | ✅ PASS | 1 | — | — | — | — |
| T7.6 | confidentiality | hub | the canary is absent from EVERY byte the endpoint ever received across the whole run | ✅ PASS | ✅ PASS | 1 | — | — | — | — |
| T8.1 | closure | both | a resolved ticket auto-closes AFTER the due instant and not before; closed_by auto; one public state change | ✅ PASS | ✅ PASS | 1 | — | — | console + panel | — |
| T8.2 | closure | both | closed is terminal in the console; a comment on a closed ticket is refused WITH the way forward; reopened_from is a real FK | ✅ PASS | ✅ PASS | 1 | — | — | console + panel | — |
| T8.3 | closure | cli | bin/tickets.mjs can still move a closed ticket — the CLI is the correction tool | ✅ PASS | ✅ PASS | 1 | — | — | — | — |
| T8.4 | closure | console | the interval is not retroactive; --off stops new bindings; the panel is gated on settings.write | ✅ PASS | ✅ PASS | 1 | *(harness)* an `it_agent` has no `settings.read` at all, so the panel is absent rather than read-only | — | console | — |
| T8.5 | closure | both | THE FRIDAY/TUESDAY TEST: a resolution the requester was never shown does not close the ticket | ❌ FAIL | ✅ PASS | 2 | **D290** — arm on ack, refuse at the handler, backstop | **D290** | console + panel | `console-03-MD-1013-never-delivered.png` |
| T8.6 | closure | hub | a resolution with read_by_requester_at unstamped does not close; the handler re-arms and says so | ❌ FAIL | ✅ PASS | 2 | **D290**'s handler refusal and re-arm | **D290** | — | `console-03-MD-1013-never-delivered.png` |
| T8.7 | closure | hub | a delivered and acked resolution closes on the interval measured FROM THE ACK, not from resolved_at | ❌ FAIL | ✅ PASS | 2 | **D290**'s arm-on-ack | **D290** | — | — |
| T8.8 | closure | console | an undelivered resolution does not re-arm forever: the backstop fires and it surfaces as 'resolved, never delivered' | ❌ FAIL | ✅ PASS | 2 | **D290**'s backstop and the console's "Resolved, never delivered" list | **D290** | console | `console-01-tickets-queue.png` |
| T9.1 | identity | hub | no credential -> 401 with NEEDS_CREDENTIAL_TO_ACT's sentence; nothing changed | ✅ PASS | ✅ PASS | 1 | — | — | — | — |
| T9.2 | identity | hub | Endpoint B asking for Endpoint A's reference -> 404, the same as no such ticket (never 403) | ✅ PASS | ✅ PASS | 1 | — | — | — | — |
| T9.3 | identity | hub | a revoked enrollment stops working on its NEXT request | ✅ PASS | ✅ PASS | 1 | — | — | — | — |
| T9.4 | identity | hub | 21 writes in a minute -> 429 with retryAfterMs; the read limit's sibling behaves too | ✅ PASS | ✅ PASS | 1 | — | — | — | — |
| T9.5 | identity | console | last_seen_at moves on an authenticated call | ✅ PASS | ✅ PASS | 1 | — | — | console | — |
| T9.6 | identity | hub | D291: pre-enrollment tickets stay unmatched and the copy is honest about why | ✅ PASS | ✅ PASS | 1 | — | — | panel | — |
| T9.7 | identity | hub | D274's detector is still pointed at the real client tree and still fails when flipped by hand | ✅ PASS | ✅ PASS | 1 | — | — | — | — |
| T10.1 | adverse | client | hub stopped mid-filing: 'Not sent', 'Nothing was filed.', no URL or stack on the surface or the voice (D246) | ✅ PASS | ✅ PASS | 1 | *(harness)* `fileTicket()` is HubClient's, not intake.js's | — | panel | — |
| T10.2 | adverse | both | hub stopped after a desk reply: still 'not yet seen'; on recovery the poll delivers the backlog | ✅ PASS | ✅ PASS | 1 | *(harness)* the public `new → open` change is handed over in the same poll as the two replies | — | console + panel | — |
| T10.3 | adverse | client | connection-state copy names the SAME TWO THINGS on loss and on recovery (F1/F2 must not regress) | ✅ PASS | ✅ PASS | 1 | *(harness)* the check read the file's own comments ABOUT the F1/F2 defect as if they were copy | — | panel | — |
| T10.4 | adverse | hub | with MATIC_HUB_BIND on a LAN address the console's dev bypass is REFUSED (D283/D267 guard 2) | ✅ PASS | ✅ PASS | 1 | *(harness)* `bypassStatus()` reports `refused`/`reason`, not `why` | — | console | — |
| T10.5 | adverse | hub | two workers sharing one database do not double-close a ticket (SKIP LOCKED) | ✅ PASS | ✅ PASS | 1 | — | — | — | — |
| T10.6 | adverse | hub | a hub restart mid-job leaves NO row stuck running (the reaper) | ❌ FAIL | ✅ PASS | 2 | *(harness)* `reapStuck()` returns `{requeued, failed}`, not a count; and the claim could take another ticket's due job | — | — | — |

**Total 59 tests, 59 passed, 0 failed.** First-run pass rate **51/59** (86%). 185 assertions, 0 failed. 153 requester-facing responses captured and grepped. Run id `20260913092932`, tenant `clickthrough`, canary `INTERNAL-CANARY-20260913092932`.
**How to read the columns.** *First run* is the first run in which **every one of the 59 tests
executed** — `first-complete-run.log`, kept beside the scorecard. The runs before it were the harness
being built and are not a fair red column; where a row says *(harness)* under "Fixed by", the
assertion was wrong in one of those earlier runs and the note says how. **T7.2 has no first-run cell
because it was never this file's to answer** — the rendered DOM is Electron's, and `results.json`
carries `verdictFrom` saying so on that row alone.

---

## 4. SUMMARY OF CHANGES

### Product fixes

| What was wrong | What it is now | Which test pins it |
|---|---|---|
| **Auto-close closed a ticket on a resolution the requester was never shown.** `resolveTicket()` enqueued a job at `resolved_at + interval` and the handler checked only the job binding. | The clock is armed by the **acknowledgement that the endpoint showed it**; the handler refuses to close an undelivered resolution and re-arms; after three intervals it gives up and hands the ticket to a person. | T8.5, T8.6, T8.7, T8.8; `admin-db` §4b; `jobs.test` 1b |
| **The Metrics page said deflection "cannot be computed"** and that the endpoint creates no sessions — true before D236–D239, false since — while `outcomeCounts()`/`deflectionOf()` sat three files away. It also had the console's only page-level SQL. | It reads through the sessions store, shows the ratio and the four counts, draws it per category (D186), and says the *client* half (D90's confirmation turn) is what is still missing — beside the number rather than instead of it. | T1.3; `admin-static` §6 and §7 |
| **The Metrics lede still said the figure that matters most cannot be computed** — above a panel showing 100%. Found in the screenshot of the page that had just been fixed. | The lede says what each figure is *not*. | eyes: `console-04-metrics-deflection.png` |
| **A deflection of 100% over one session read as a rate.** | "Too few sessions to read as a rate", with the denominator, above the tile. | eyes: same screenshot |
| **A ticket's Identity line showed the device uuid**, which appears on no other screen, so the chain ticket → enrollment → Agents page stopped dead. | It names the `device_key_id` the Agents page lists and links there; the uuid stays, subordinate. | T2.2; `admin-db` P3a |
| **`profile_source` rendered as the raw enum `self_asserted`**, beside four glossed neighbours. | Glossed in words — "self-asserted — typed or read from the machine by the endpoint, believed by nobody". | T2.2 |
| **"Suggested owner: desktop support" said nothing about routing**, so a desk agent could read it as an assignment. | The same cell says nothing routes on it, the ticket has not been sent to that team, and nobody there has been told (OPEN-4). | T4.4 |

### Tests corrected — and proven in both directions

- **`admin-db`'s job-id leak check was a substring match against a bigserial.** It failed a green
  tree on job id 665. Measured on one live response: **6 of the 200 ids in 600–799 appear inside it**
  — a ~3% flake. It is leaf equality over every value plus a refusal of any job-ish key now. Proven
  the other way by adding `auto_close_job_id` to `REQUESTER_COLUMNS` and the shaping function: the
  corrected check fails and names the path (`job 787 at ["ticket.autoCloseJobId"]`), and so do D281's
  allow-list tests. Reverted. **A change to a test, not a fix to the product** (§7.2).
- **Two `admin-static` rules got stronger rather than adjusted**, because the fix removed their
  exception: *"metrics.js is still the only page that issues SQL"* → *"**no** admin page issues SQL at
  all"*, and *"the only admin file that reads `sessions` is metrics.js"* → *"**no** admin file reads
  `sessions` directly"*. Exit criterion 4 is a structural property now rather than a promise about
  one SELECT.
- **`admin-db`'s Metrics assertion pinned the copy the fix removed.** It asserted the page said
  deflection *"cannot be computed"*, and it went on passing after the page was corrected — because the
  LEDE still carried those words. Deterministic, not flaky, and a clean illustration of a test passing
  for the wrong reason: the words it matched had moved to a sentence about something else. It now pins
  what is true of a tenant with **no** sessions, and asserts the page does **not** claim the figure is
  uncomputable. The other direction — a tenant WITH sessions showing a real percentage — is T1.3 and
  `console-04-metrics-deflection.png`.
- **Eleven harness assertions were wrong and are listed in the scorecard.** Each is a note on the
  row, in the `*(harness)*` form, so the difference between "the product was wrong" and "my assertion
  was wrong" survives into the record.

### New tests

- **`server/test/clickthrough-e2e.mjs`** — 59 tests, 185 assertions, its own tenant, discovered by
  `npm run clickthrough`. Re-runnable from a cold database; it drops and recreates `t_clickthrough`
  at the start and leaves it in place at the end, so the scorecard is auditable. It writes
  `results.json`, which is what the scorecard above is generated from — the scorecard cannot drift
  from the run.
- **`admin-db` §4b** — D290 end to end against the database: the red case, the re-arm, the backstop
  firing, the console list, the CLI agreeing, and the requester's read carrying none of it.
- **`jobs.test` 1b rewritten** — the handler headless against the new shape, including that an
  undelivered resolution writes **nothing**.
- **`admin-static`** — the four conditions, arm-on-ack, the current-resolution delivery read, the
  give-up, and the console's reader for the list.

### Infrastructure

- One architectural correction the repo's own rules caught: the ticket store had grown a query
  against `control.devices`. `admin-static` §5b is right that that table has one query layer, so
  `deviceKeyIdById()` lives in `src/devices/enrollment.js` and the ticket store asks.
- `server/package.json` gains `"clickthrough"`.

---

## 5. ESCALATION LEDGER

**Empty, and that is a result rather than an omission.** §7.4's trigger — the same test failing three
iterations, or two fixes fighting — never fired. T8.5's cause was understood the moment it failed
(the plan and the 2026-09-13 doc had both named it in advance) and §1.3 of that doc had already
specified the fix, so there was no design fork to escalate. Nothing was weakened to make a test pass;
where a test was wrong it was corrected and proven both ways, and the scorecard says which rows those
were. **The one thing I would have escalated had it come to it** is the `MAX_AUTOCLOSE_REARMS = 3`
figure, and it is instead recorded as a proposal at the top of this document, which is where §7.3
says a founder-shaped number belongs.

---

## 6. HONESTY LEDGER

- **Nothing was heard.** The voice was not listened to on any of it. The panel spoke nothing during
  the ticket lifecycle by design (D288), which is exactly why nothing needed listening to — but the
  boot line, the consent card and the spoken answer were never played. **Still Charles's.**
- **No interval was ever waited out.** Every one was reached by moving `auto_close_at` and
  `job_queue.run_after` backwards in SQL. The panel's *"closes on its own in 3 days"* was photographed
  against a clock that was then moved by hand. The plan asked for both a short configured interval
  and a backdated long one and S8 does both — but **nobody has watched a real 72 hours pass.**
- **The LAN was never bound.** T10.4 exercises `bypassStatus()` and `admitPeer()` directly. The hub
  ran on loopback for the entire run, on one machine. There is no second physical machine, so
  "two hubs, one database" (T10.5) is two workers in one process against the real queue: it proves
  `SKIP LOCKED`, not a network partition.
- **The click-through tenant is not a real one.** One reporter, two machine names, nineteen tickets
  filed inside four minutes, and a scripted model standing in for the real one on `/v1/ask` so S1
  tests the contract rather than a model's mood. The KB *is* the real six-article corpus and the
  retrieval leg that matched is the real lexical one; the embedder was deliberately absent.
- **T8.5's red run is recorded; T8.6–T8.8's are not, in the same sense.** They were written as the
  fix's own tests and never existed against the old code — they appear as `FAIL` in
  `first-complete-run.log` because the harness asserted behaviour the tree did not have. That is a
  weaker kind of red than T8.5's, and it is worth saying so.
- **"First run" is the first COMPLETE run.** Six earlier runs exist in which the harness itself was
  still being made to execute; they are not kept, and it would be dishonest to call the seventh the
  first without saying this.
- **The Electron pass filed its ticket by calling `window.matic.fileTicket` from the renderer**,
  which is the real path the review card calls — but it **skipped the review card itself**, so D128's
  "the user sees what is sent" screen was not exercised this run. `client/docs/PANEL-RENDERER-CHECK.md`
  §4 is where that lives and it was run on 2026-09-12.
- **The console was driven with a real authenticator code, not the dev bypass.**
  `MATIC_ADMIN_INSECURE_NO_TOTP` was never set at any point in this run. `bin/admin.mjs totp` is what
  made that practical, and it is the better habit.
- **One thing I changed without fully understanding why it was ever otherwise:** the metrics page's
  own SQL. `outcomeCounts()` has existed since D236–D239 and the page duplicated it; I can see no
  reason in the history, and I have assumed it is simply that the page predates the store's reader.
- **The `Waiting on your yes or no above` string appears in the panel's DOM text but not on screen.**
  I saw it in `textContent` during the Electron pass and it is not in any screenshot. I did not chase
  it; it is most likely a hidden control's label. **Recorded rather than resolved.**
- **Nothing here is a performance measurement.** §10.3's four numbers are unchanged.

---

## 7. WHAT IS NEXT, AND WHAT IS STILL CHARLES'S

**Charles's, in the order they block things:**

1. **D292 — background presence.** The ceiling on everything P4 and P5 built, and now with evidence:
   the "Resolved, never delivered" list is what the desk sees when the endpoint is not running. The
   recommendation stands — tray and background mode, with D86's email still required for the
   IT-facing half.
2. **D290, D291 — ratify or revert.** Both are one revert. D291 is a row.
3. **D288's revision of ratified D242** — still awaiting him, from P4.
4. **The console's security review**, owed since P3b, and **D270's condition 1** (the in-process
   runner, which a LAN deployment outgrows).
5. **Q9 — which EDR products the design partner runs.** Still the critical path on the pilot.

**Next in the code, in my order:**

1. **The requester's timeline view and the toast** — Claude Design's brief is written
   (`2026-09-12-claude-design-handover-ticket-timeline-and-toast.md`) and **sending it is Charles's
   act**. The panel currently says "replying from this window isn't built yet" three times in one
   transcript, and this run photographed all three.
2. **D90's confirmation turn on the client.** The hub has counted deflection since D236–D239 and the
   console now shows it; the client has never created a session, so the figure is real and empty.
   That is the 2026-09-09 handover's §2 and it is the last thing standing between this build and a
   number that means something.
3. **P6 — email (D86)** — still gated, and D292 changes its urgency more than anything else here.

---

## 8. HOW TO RUN IT AGAIN

```bash
cd server
npm.cmd run db:up
npm.cmd run migrate
npm.cmd run clickthrough
```

The UI pass is not the harness and is not automated in the repo: it is a scratch DevTools-Protocol
driver, the method of the 2026-09-11 and 2026-09-12 runs (register §10.3b/c) — Chrome on
`--remote-debugging-port=9222` for the console, `electron.cmd . --remote-debugging-port=9223` for the
panel, `Runtime.evaluate` on the live DOM and `Page.captureScreenshot` for the PNGs. **Read the DOM
with `textContent`, never `innerText`** — CLAUDE.md's own trap caught this run once, silently, and it
reported four console assertions as absent when the text was there.

---

## 9. THE DEMO PATH — checked last, and it found three things

Charles's framing was *"I am preparing the tool for a demo. I need all these tests done and tool
working without error."* So after the benchmark passed, the launcher Charles actually double-clicks
was run: `tools\launchers\start-hub.ps1 -CheckOnly`. It **failed**, and then it lied. Both are fixed.

**1. The preflight failed because this run created a second tenant.** The check was *"more than one
tenant and `MATIC_TICKET_TENANT` unset → FAIL"*. Nothing in the product changed; a green preflight
went red because the database grew a schema. **Any customer hub has more than one tenant**, so a
launcher that only works on a database with exactly one is stage tooling that breaks the first time
the stage is used for anything else. It now **picks** one, says which, and says how to change it:

```
OK    tickets file into t_devco - 2 tenants on this database, and this is the one the demo uses.
      Change it with -Tenant <schema>.
```

A `-Tenant` parameter defaults to `t_devco`; a `MATIC_TICKET_TENANT` already set in the window still
wins, because a value someone typed is a decision and a default is not. It fails only when the name
it was given is not on the database — and then it lists what is.

**2. The fix line named a schema called `t`.** PowerShell's scalar-vs-array trap: a `Where-Object`
matching one thing returns a **string**, and `[0]` on a string is its first character. Two tenants
were reported as `t, t`. The same family as CLAUDE.md's *"PowerShell helpers return ONE thing"* rule,
and caught the only way it can be — by running the thing.

**3. THE ONE THAT MATTERED. Step 7a said "the authenticator code is required (no insecure bypass
set)" while the hub serving the demo had it ON.** Step 7 had just found a hub already running and
said it would use that one; 7a then read **this window's** environment variable. The hub was started
in another window — `npm run start:dev` sets it — so the check answered a question nobody asked.
`GET /v1/health` said `insecureBypass: ACTIVE` a foot below the OK.

CLAUDE.md says, in capitals, *"UNSET IT BEFORE ANY DEMO, DEPLOY OR REVIEW."* The preflight exists so
that sentence does not have to be remembered, and it was the one check that could not see the
failure it was written for. **7a asks the hub now** and only falls back to the environment when no
hub answers:

```
WARN  THE RUNNING HUB reports the insecure bypass as 'ACTIVE' - its admin console does NOT ask
      for an authenticator code.
WARN        It was started in another window, so THIS shell's environment does not tell you that.
```

### What Charles has to do before the demo

**The hub running right now on 8787 (pid 49980) has the bypass ON.** It is not a persisted
environment variable — neither the User nor the Machine scope has it — so it is only that window.
In PowerShell:

```powershell
cd C:\Users\Charles\Downloads\maticdesk_bot\server
npm.cmd start
```

`npm.cmd run start:dev` turns the bypass back on, every time. `npm.cmd start` does not. Then
`tools\launchers\start-hub.ps1 -CheckOnly` will say the authenticator code is required, and it will
have asked the hub rather than assumed.

**Everything else on the demo path is green** and was checked rather than assumed: Docker, the
container, both migration ledgers at control/009 and tenant/011, the corpus at 6 articles / 18 chunks
/ 18 embedded under one model, Ollama with both models present, GPU headroom with `mistral-small:24b`
already resident, and the dev tenant untouched — **`MD-1008`, `MD-1009` and `MD-1010` are exactly
where P3a left them**, which is the one rule §3 of the plan set for this run.
