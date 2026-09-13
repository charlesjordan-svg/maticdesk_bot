# Claude Code handover — the ticket lifecycle click-through benchmark

**Date:** 2026-09-13
**Written by:** a Cowork session, from the repo on `wakanda` (read-only) and the project docs.
**For:** Claude Code, running on Opus, in `C:\Users\Charles\Downloads\maticdesk_bot`, with **Fable
available for escalation**.
**Charles's instruction:** *"create a click through test plan … cover multiple end to end scenarios of
ticket being open and resolved by matic. escalated and resolved by third parties, notes being added
etc. … as it goes through the test plan it should make updates and improvements based on its own
recommendation, continuing repeating the click through test until all test pass … attempt to remove
any barriers by escalating to Fable … the handover should produce a score card of all the tests with
a summary of changes made to achieve the benchmark."*

**Four answers Charles gave when this plan was scoped, and they are binding:**

| Question | Answer |
|---|---|
| How literal is the click-through? | **A scripted harness is the pass/fail gate, AND every scenario also gets one real UI pass** — console in a browser, panel in Electron, screenshots kept. |
| How far may you go when a test fails? | **Free rein, including gated work.** See §7.3 for the one thing free rein does not mean. |
| What is a "third party"? | *"like an Agent for the Desktop Support team who would be working on the ticket making notes, closing tickets etc."* — a **human desk agent in the console**. |
| What is the benchmark? | **100% pass, no exceptions.** Not "pass or blocked". |

---

## 0. Read these first, and re-verify everything below

**Read, in this order, before writing a line:** `CLAUDE.md`, `PROJECT_START_HERE.md`,
`docs/decisions/DECISION-REGISTER.md` (at least §5.53a on void numbering, §5.54–§5.59, and its
"next free ID" line), then the handbacks the lifecycle was built in:
`docs/handovers/2026-09-12-claude-code-handover-ticket-lifecycle-p0-built.md`,
`…-console-honesty-and-p1-built.md`, `…-ticket-lifecycle-p2-built.md`, `…-p3a-built.md`,
`…-p3b-built.md`, `…-p4-built.md`, `…-p5-built.md`, and today's
`docs/handovers/2026-09-13-autoclose-delivery-gap-and-background-mode.md`.

**Then read `client/docs/PANEL-RENDERER-CHECK.md` and `client/docs/DEMO-CLICKTHROUGH.md`.** They are
the house form for a click-through and this one extends them rather than inventing a new shape.

**The honesty rule for this document.** Everything in §1 was read from the working tree on
2026-09-13 from a Cowork session with read-only access. Nothing in it was run. §12 lists every claim
and how it is known. **Re-verify anything you are about to depend on** — that is the standing rule in
this repo and it has caught a false premise in three of the last five passes.

---

## 1. Baseline — what the tree holds as of 2026-09-13

Verified by reading. Counts and file lists are facts; behaviour is quoted from handbacks and headers.

| Thing | State |
|---|---|
| Lifecycle phases | **P0, P0.5, P0.75, P1, P2, P3a, P3b, P4, P5 all built.** P6 (email, D86) is not. |
| Register | D1–D289, PROPOSED from D272 onward mostly unratified. **Next free is D290.** The register's own "next free ID" procedure line was stale as of today's doc — fix it in the same pass you use a number. |
| Topology gate | **D271 was answered 2026-09-12.** `dev-bypass.js`'s header: *"a LAN listener is now the production shape"*, and **D283 added `MATIC_HUB_BIND`**. The dev box still binds loopback. |
| Hub routes (requester) | `src/tickets/requester-routes.js`: `POST /v1/ticket/:ref/comment`, `/reopen`, `/confirm`, `POST /v1/tickets/ack`. **All four need the enrollment credential** (`Authorization: Bearer …`), 401 without, 404 (*"no ticket … readable by this enrollment"*) for another enrollment's ticket, **429 over `WRITES_PER_MINUTE = 20`** per enrollment. |
| Requester read shape | `src/tickets/read.js` + `getTicketForRequester()` / `listEntriesForRequester()` in `query.js`, pinned by an **allow-list** test (D281, discharging D269's condition). |
| Auto-close | `src/tickets/autoclose.js` + `scheduleAutoclose()`/`closeByAutoclose()` in `query.js`; `tickets.auto_close_at`, `tickets.auto_close_job_id` (tenant/010); per-tenant `tenants.ticket_autoclose_hours` **default 72, NULL = off** (control/009); console panel + `POST /admin/tickets/autoclose`; CLI `npm run tickets -- autoclose [--hours N \| --off]`. |
| Job runner | In-process, `src/jobs/runner.js` + `src/jobs/handlers.js` (one handler: `ticket.autoclose`). D270's conditions: in-process is *for now*; at-least-once proven by running the handler twice; unknown types stay queued. |
| Console | `src/admin/pages/tickets.js` — timeline, **two composers** (work note, "Reply to requester"), resolution code + notes refused-without-both, per-entry delivery state (handed / seen / not yet), D276's *oldest unanswered* **age**, auto-close panel. TOTP sign-in, with the **dev bypass `MATIC_ADMIN_INSECURE_NO_TOTP`** (D267) — password never skipped, **refused on a non-loopback listener**. |
| Client | Electron. `client/src/agent/ticket-watch.js` (poll, floored at 30 s), `client/src/ticket/state-words.js`, band rows, transcript line, taskbar flash. **No tray, no background mode** — `main.js` still quits on `window-all-closed` (non-darwin). |
| Tests | `server/test/run-all.mjs` (`npm test`, and the DB suite via `--excluded` — confirm the exact flag from `run-all.mjs`). **Baseline at P5: server headless 733 across 7 files; db 661 across 3; client 2041 across 26.** Your final counts must be ≥ these. |
| Known open hole | **Auto-close treats unreachable as consent** (today's doc, §1). Proposed as **D290**, not built. The Friday/Tuesday scenario is *"reasoned from the code, not observed. Nobody has run it."* **S8 below is the run that observes it.** |
| Known open decisions | **D290** (delivery gate), **D291** (pre-enrollment tickets stay unmatched), **D292** (tray/background — founder's), P5 ledger item 5 (should OFF withdraw queued jobs), and the console security review owed since P3b. |

---

## 2. What this run is, in one paragraph

You will build a repeatable end-to-end harness that drives the real hub, the real database and the
real console over the wire, and you will run ten scenarios through it. Every scenario also gets one
**real click-through** — the console in a browser and the panel in Electron — because the last five
passes shipped copy that no human had looked at, and two of the register's decisions exist because
Charles looked at a screen and concluded the product was broken. When a test fails you fix it, you
re-run the **whole** plan from the top, and you keep going until every test passes. You escalate to
Fable rather than grinding. You finish by writing a handback whose centrepiece is a **scorecard** —
every test, its first result, its final result, and what you changed to get there.

---

## 3. Setup — the rig, and its one rule

**The rule: this run does not touch the dev tenant's data.** `MD-1008`, `MD-1009`, `MD-1010` and the
four pre-enrollment orphans are history, and the P3a handover is explicit that history is not to be
rewritten for tidiness. Create a **dedicated click-through tenant** (schema e.g. `t_clickthrough`),
migrate it, run everything there, and leave it in place at the end so the scorecard is auditable.

1. `cd server && npm run db:up && npm run migrate` — confirm the ledger is at tenant/010 and control/009.
2. Create the click-through tenant through the existing path (`bin/db.mjs` / `src/db/tenants.js`) —
   **not by hand-editing SQL**.
3. Hub on loopback for the whole run (`npm start`, or `npm run start:dev`). **Do not set
   `MATIC_HUB_BIND` to a LAN address for the main run** — the dev bypass is refused off loopback by
   design (D283/D267), and that refusal is itself a test (T10.4), run deliberately and reverted.
4. Two console users via `bin/admin.mjs` — **Agent A** and **Agent B**, both Desktop Support. At least
   one must lack `settings.write` so T8.4 can prove the auto-close panel is permission-gated.
5. `MATIC_ADMIN_INSECURE_NO_TOTP` set **only** in the shell that runs the console click-through, never
   written into a file that could ship, and named in the scorecard as having been used.
6. Two enrollments — **Endpoint A** (the requester's machine) and **Endpoint B** (a second machine,
   for isolation tests) — via `POST /v1/enroll` / `bin/devices.mjs`. Keep both credentials.
7. Electron with CDP, the way the 2026-09-11 click-through did it:
   `electron . --remote-debugging-port=9223`, expressions evaluated in the real renderer and
   `Page.captureScreenshot` for PNGs. `MATIC_PROVIDER=hub`, real broker, real hub.
8. Screenshots to `docs/handovers/screenshots/2026-09-13-clickthrough/<test-id>-<slug>.png`. **Look at
   them.** A captured screenshot nobody opened is not evidence.
9. **Time is controlled by SQL, not by waiting.** Make an auto-close job due by moving `auto_close_at`
   and the queue row's `run_after` backwards; never `sleep` past a 72-hour interval, and never lower
   the interval as a substitute for testing the real one (test both: a short configured interval AND a
   backdated long one).

---

## 4. The cast

| Who | Is | Acts through |
|---|---|---|
| **Requester** | the person at the endpoint | the Electron panel; the four hub POSTs under Endpoint A's credential |
| **Matic** | the agent | the panel's own loop: answer from the KB, propose an action with consent, file a ticket when it cannot resolve |
| **Agent A** | a Desktop Support agent | the console, signed in |
| **Agent B** | a second Desktop Support agent | the console, signed in separately |
| **Vendor** | a third party with **no account and no surface** | Agent A's work notes only, and `resolution_code = 'referred_to_vendor'` |
| **System** | the job runner | `ticket.autoclose` |

---

## 5. The ten scenarios

Each test gets an ID. **Every test has a harness assertion AND, where the column says so, a pair of
human eyes.** "Eyes" means a screenshot you opened and a sentence in the scorecard saying what you saw.

### S1 — Matic resolves it, and no ticket is born (deflection)

| ID | What it proves | Eyes |
|---|---|---|
| T1.1 | A question the KB covers is answered and cited; **no row appears in `tickets`** | panel |
| T1.2 | A consented action (e.g. `flush_dns`) runs and reports in the catalog's words, not the mechanism's (D250); no ticket filed | panel |
| T1.3 | The session outcome is recorded as a deflection (D89 counts **sessions**, not tickets) and the console's deflection surface reflects it | console |
| T1.4 | The tickets band count is unchanged, and "where's my ticket?" does not invent one | panel |

### S2 — Matic cannot fix it, files a ticket, the desk resolves it, the requester confirms

The spine. Everything else is a deviation from this.

| ID | What it proves | Eyes |
|---|---|---|
| T2.1 | The review card fills, the requester sends, the band goes `Nothing has left this machine → Sending… → Sent by you` with a real `MD-####` | panel |
| T2.2 | The ticket lands in the console queue with provenance — `(device_key_id, os_username)` — and `state = new` | console |
| T2.3 | Agent A adds **two work notes**; both render in console and CLI **labelled internal, by a label not only a colour** | both |
| T2.4 | Agent A replies to the requester; the console row reads *not yet seen*, then *handed*, then *seen <ago>* as the endpoint polls and acks. **It never reads "sent" or "notified"** | console |
| T2.5 | The reply appears in the panel within one poll interval, quoted in full, and the taskbar flashes when the window is not in front; **nothing is spoken** (D288) | panel |
| T2.6 | Resolve **without** a code is refused with a sentence; without notes, refused; with both, accepted | console |
| T2.7 | The resolved panel line reads *"closes on its own in 3 days unless you say otherwise"*, and the console's detail page carries the same clock | both |
| T2.8 | The requester confirms → `closed`, `closed_by = 'requester'`, the resolution kept, **the queued auto-close job `cancelled`** | both |
| T2.9 | The whole timeline is ordered, attributed, and the CLI's `show` and the console **cannot disagree** (D224) | — |

### S3 — Escalated to a Desktop Support agent, worked with notes, resolved by the desk

Charles's "third party". This is S2 with the desk doing real work in between.

| ID | What it proves | Eyes |
|---|---|---|
| T3.1 | A requester comment on a **live** ticket starts D276's clock; the console shows an **age**, not a count, on every ticket screen | console |
| T3.2 | Agent A's reply **clears** the clock in the same transaction as the entry | — |
| T3.3 | Agent A's work notes recording an internal diagnosis are invisible to the requester on every surface (S7 is the wire test) | panel |
| T3.4 | Two requester comments in a row: the age is the **oldest** unanswered, not the newest | — |
| T3.5 | Agent A resolves with `fixed` + requester-visible notes; the notes are presented in the panel **as a quotation, attributed**, never in Hazel's own voice (D214) | panel |

### S4 — Handoff between two agents, and the fact that there is no assignment model

| ID | What it proves | Eyes |
|---|---|---|
| T4.1 | Agent A opens and work-notes; Agent B resolves. `author_label` is a **snapshot per entry**, so the timeline shows both people | console |
| T4.2 | The resolution notes are authored by **whoever resolved** (B) — D252 — and nothing claims A owned or assigned it | console |
| T4.3 | The audit log carries `ticket.worknote`, `ticket.comment`, `ticket.resolve` **with the right actor on each** | — |
| T4.4 | `suggested_owner` still routes nothing and **no surface implies it does**. If a surface implies it, that is a defect, not a note | console |
| T4.5 | Concurrency: A and B move the same ticket at the same instant. The guard is in the `UPDATE … WHERE state = $from`; the loser gets a sentence, not a constraint violation, and **not a silent overwrite** | — |

### S5 — Referred to a vendor, resolved on the vendor's answer

The enum value with no workflow behind it. Expect this scenario to produce findings.

| ID | What it proves | Eyes |
|---|---|---|
| T5.1 | Agent A records the vendor exchange as **work notes** (the vendor has no account and no surface) | console |
| T5.2 | A requester comment arrives while the ticket is with the vendor; the clock starts; the desk can hold the ticket without resolving it | console |
| T5.3 | Resolve with `referred_to_vendor` + requester-visible notes. **The notes must be readable by a non-technical person and must not leak the vendor's internal detail** — if the only honest notes are internal, that is a finding about the enum; record it | both |
| T5.4 | Nothing in the product claims a vendor was contacted, because nothing contacted one | console |

### S6 — The requester disagrees: resolved → comment → reopen → re-resolve

The path P5 says does not close early. Prove it, do not trust it.

| ID | What it proves | Eyes |
|---|---|---|
| T6.1 | A comment on a **resolved** ticket reopens it in one transaction: `resolution_code`, `resolution_notes`, `resolved_at` null, a public *"resolved → open"* entry, the desk's badge gone, the clock started | console |
| T6.2 | The **first** auto-close job is cancelled and the binding cleared | — |
| T6.3 | `POST /reopen` with a reason does the same and records the reason as the public comment; **without** a reason it is refused | — |
| T6.4 | Re-resolve enqueues a **second** job with a different id; the first job, run by hand, says *"resolved by a NEWER resolution"* and does nothing | — |
| T6.5 | Run the second handler **twice**; the second run writes nothing (D270's at-least-once condition, re-proven end to end) | — |

### S7 — Confidentiality, end to end, on a ticket that has everything to leak

**This is the kill-criterion scenario.** Plan v3 §8.2: internal text appearing anywhere
requester-facing stops everything. Build the ticket so every field is populated — `summary`,
`what_was_checked`, `internal_resolution_note`, two internal work notes, a `suggested_owner` — and
then look for them everywhere.

| ID | What it proves | Eyes |
|---|---|---|
| T7.1 | `GET /v1/tickets` and the timeline read return **only** the allow-listed fields; none of the five internal values appears in the raw JSON | — |
| T7.2 | The **rendered panel DOM** contains none of them — search the live DOM over CDP, not the source | panel |
| T7.3 | The ack payload and every error body carry none of them (including 404/401/429 bodies) | — |
| T7.4 | Adding a column to `tickets` without adding it to the allow-list **fails** the test. Prove it by hand, revert | — |
| T7.5 | `listEntriesForRequester()` cannot be made to return an internal entry, including by passing a visibility argument | — |
| T7.6 | A work note containing a canary (`INTERNAL-CANARY-<run-id>`) is **absent from every byte** the endpoint receives across the whole run — grep the captured traffic, not one response | — |

### S8 — Closure, terminality, auto-close, and the thing that is actually broken

| ID | What it proves | Eyes |
|---|---|---|
| T8.1 | A resolved ticket with no response auto-closes **after** the due instant and **not before**; `closed_by = 'auto'`; one public state change; the panel reads *"closed on its own …"* | both |
| T8.2 | `closed` is terminal in the console — **no forward transition offered**; a comment on a closed ticket is refused **with the way forward**; a new ticket carries `reopened_from` as a real FK, accepted only for **this** enrollment's closed ticket | both |
| T8.3 | `bin/tickets.mjs` can still move a closed ticket — the CLI is the correction tool and must stay one | — |
| T8.4 | The interval: changing it is **not retroactive**; `--off` stops new bindings; an already-queued job still closes its ticket when due (P5 ledger item 5 — **if you change this, it is a decision, record it**); the panel is gated on `settings.write` | console |
| **T8.5** | **THE FRIDAY/TUESDAY TEST.** Resolve with the **client shut**. Make the job due. Start the client. **As the tree stands this closes a ticket the requester was never shown** — today's doc predicts it and nobody has run it. Run it, capture it, then fix it | both |
| T8.6 | After the fix: a resolution with `read_by_requester_at` unstamped **does not close**; the handler re-arms and says so in its log line | — |
| T8.7 | After the fix: a delivered-and-acked resolution closes on the interval measured **from the ack**, not from `resolved_at` | — |
| T8.8 | After the fix: an undelivered resolution does not re-arm forever — the backstop fires and the ticket surfaces in the console as *resolved, never delivered*, a queue item for a human | console |

**T8.5 is the one test in this plan that is expected to fail on the first run.** Capture the failure
before fixing it — a red run behind the guard is the house rule (D269, D274 and P0's reserved list all
earned it). The fix is specified in today's doc §1.3: arm on ack, refuse at the handler, cap the
re-arm. It needs **D290**.

### S9 — Identity, isolation, and the orphan class

| ID | What it proves | Eyes |
|---|---|---|
| T9.1 | No credential → 401 with `NEEDS_CREDENTIAL_TO_ACT`'s sentence; nothing changed | — |
| T9.2 | Endpoint B asking for Endpoint A's reference → **404, the same as no such ticket** (never 403, which confirms existence) | — |
| T9.3 | A revoked enrollment stops working **on its next request**, and `revokeDevices()` now means something | — |
| T9.4 | 21 writes in a minute → 429 with `retryAfterMs`; the read limit's sibling behaves too; the poll floor (30 s) cannot be argued below | — |
| T9.5 | `last_seen_at` moves on an authenticated call and **not** on enrollment alone | console |
| T9.6 | **D291.** Pre-enrollment tickets stay unmatched and the panel's copy is honest about why. **Do not backfill on `os_username`** — that is authorization by convention, the exact failure `file.js`'s tenant refusal exists to prevent. If this passes, write D291 into the register as a decision that changes no code | panel |
| T9.7 | D274's detector is still pointed at the real client tree and still fails when flipped by hand. **Never narrow it to make something pass** | — |

### S10 — The product under adverse conditions

| ID | What it proves | Eyes |
|---|---|---|
| T10.1 | Hub stopped mid-filing: band reads **`Not sent`**, *"Nothing was filed."*, count unchanged, **no URL or stack reaches the surface or the voice** (D246) | panel |
| T10.2 | Hub stopped after a desk reply: the console still says *not yet seen*; on recovery the poll delivers the backlog and the console moves to *seen* | both |
| T10.3 | Connection-state copy names **the same two things** on loss and on recovery (the F1/F2 defects of 2026-09-11 must not have regressed) | panel |
| T10.4 | With `MATIC_HUB_BIND` set to a LAN address, the console's dev bypass is **refused** (D283/D267 guard 2). Revert immediately after | console |
| T10.5 | Two hubs sharing one database do not double-close a ticket (`SKIP LOCKED`); if only one runner is realistic, say so and test the claim you can test | — |
| T10.6 | A hub restart mid-job leaves **no** row stuck `running` (the reaper) | — |

---

## 6. The harness

- Put it at `server/test/clickthrough-e2e.mjs`, discovered by `run-all` the way `jobs.test.mjs` was,
  and add `"clickthrough": "node test/clickthrough-e2e.mjs"` to `server/package.json`.
- **It drives the product, not its internals.** Requester actions go over HTTP with a real credential;
  desk actions go through the console's own routes with a real session (or through the query layer
  **only** where the console route is genuinely unreachable, and say which in a comment).
- **No SQL of its own except for time travel and fixtures** (D224). If you need a query, it goes in
  `src/tickets/query.js` and `admin-static` §5 is extended to cover it.
- Every test prints its ID. The run ends by writing
  `docs/handovers/screenshots/2026-09-13-clickthrough/results.json` — `{id, name, surface, result,
  iteration, notes}` — which is what the scorecard is generated from, so the scorecard cannot drift
  from the run.
- The harness must be **re-runnable from a cold database** and must leave the click-through tenant in
  a readable end state.

**The UI pass is not optional and is not the harness.** For each test with an "eyes" surface, drive
the real thing: the console in a browser at the loopback address (Claude in Chrome, or Chromium over
CDP), the panel in Electron over CDP as in §3.7. Screenshot, open the screenshot, and write one
sentence about what you saw. Where a thing can only be *heard*, say so — nobody has listened, and that
stays Charles's (the 2026-09-11 click-through's §5 makes the same admission and it is still true).

---

## 7. The loop

### 7.1 One iteration

1. Run the whole plan — harness, then the UI pass for every test with an "eyes" surface. Record every
   result.
2. For each failure: reproduce it, find the cause, **write the failing test first if one does not
   already exist and record the red run**, fix it, re-run that test.
3. When the iteration's fixes are in, **re-run the plan from the top**. A fix is not proven by the one
   test it targeted; three of this repo's worst defects were introduced by a fix to something else.
4. Iterate until every test passes. **The benchmark is 100%, no exceptions.**

### 7.2 Rules that do not bend

- **Never weaken a test, a detector, a denylist or an allow-list to make something pass.** D274's
  detector firing is *the feature*. If a test is wrong, fix the test **and prove it in both
  directions**, and say so in the scorecard as a change to a test rather than a fix to the product.
- **Never invent a resolution, a note or a history.** The P3a handover refused to write a resolution
  for `MD-1009` because nobody had worked it; that standard applies to fixture data too — label
  fixtures as fixtures.
- **Never regenerate a file from scratch** because an edit got stuck. Fix it or `git restore` it.
- `git diff` / `git status`, and actually read them, before every commit.
- One concern per commit, tests with the code they prove, the red run in the message where there was one.

### 7.3 Free rein, and the one thing it does not mean

Charles gave free rein **including gated work**. So: build D290's delivery gate, wire D291, and if a
test genuinely cannot pass without background presence (**D292 — tray, lifecycle, autostart**), build
that too.

What free rein does **not** mean is building a founder-shaped decision silently. Anything you build
that sets product direction — D290, D291, D292, whether `--off` withdraws queued jobs, a retention
rule, anything touching the deployment shape — must:

1. take **the next free register ID** (D290 onward; fix the register's stale "next free" line in the
   same pass), recorded **PROPOSED** with its forcing reason;
2. appear at the **top of the scorecard** under *"Built under free rein — needs ratification"*, with
   one line on what it would cost to revert;
3. be revertible in one revert.

D292 in particular changes what the product *is*, and it is the one place to prefer escalating to
Fable for a recommendation before building (§8). Building it is allowed; building it without saying
so is not.

### 7.4 If the loop stops converging

If the same test fails three iterations running, or two fixes fight each other, **stop iterating and
escalate** (§8). Grinding is the failure mode this plan is trying to avoid.

---

## 8. Escalating to Fable

Fable is available because Charles is running Claude Code on Opus. Use it — it is cheaper than a stuck
loop, and Charles asked for it explicitly.

**Escalate when:**

- the same test has failed twice and the cause is not understood;
- the fix would touch a decision, a detector, or the deployment shape;
- you are choosing between two designs and the choice is not obviously reversible (D290's arm-on-ack
  vs handler-refusal-only, the undelivered backstop's cap, D292's three options);
- you are about to weaken something to make a test pass — **escalate instead**;
- a barrier is environmental (the console will not sign in, Electron will not attach, the DB will not
  migrate) and two attempts have not cleared it.

**How:** spawn a subagent with `model: fable`, and give it, in the prompt: the failing test ID and its
assertion, the evidence (output, screenshot description, the relevant file and line), what you have
already tried, the two or three candidate fixes with your read on each, and the constraints it must
respect (D224, D269/D281's allow-list, D270's conditions, the no-weakening rule, the rule that a
founder-shaped decision must be recorded). Ask for **a recommendation and the reasoning**, not a patch.

**Record every escalation** in the scorecard's escalation ledger: test ID, the question, Fable's
recommendation in its own words, what you did, and whether it worked. An escalation whose advice you
declined is worth more in the record than one you followed silently.

**If Fable cannot unblock it and the answer is genuinely Charles's**, stop and ask him in the session.
He has not said away mode is on; if he turns it on, the relay to Sunny is the path and he will say so.
Do not guess a founder answer to keep the loop moving — that is how a deployment model gets set by an
engineer's convenience, which this repo has now warned about in three separate documents.

---

## 9. The deliverable — the scorecard and the handback

Write `docs/handovers/2026-09-13-claude-code-handover-lifecycle-clickthrough-built.md`, in the house
form (the P4 and P5 handbacks are the models). It must contain, in this order:

**1. Header** — date, what was run, the commits in order, the assertion counts before and after
(baseline: server headless 733 / db 661 / client 2041), and the register range used.

**2. Built under free rein — needs ratification** — every founder-shaped decision you took, with its
new D-number, its forcing reason, and its revert cost. **First, not buried.**

**3. The scorecard** — one row per test, every test, in ID order:

| ID | Scenario | Surface | What it proves | First run | Final | Iters | Fixed by | Decision | Escalated | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| T8.5 | Auto-close | hub + panel | a resolution nobody saw does not close | FAIL | PASS | 2 | arm-on-ack + handler refusal + backstop | D290 | yes | `clickthrough-e2e` T8.5; `T8.5-friday-tuesday.png` |

Plus a summary line: total, passed, first-run pass rate, tests added, iterations run.
**Every row must end PASS.** If one does not, the run is not finished — say so at the top in one
sentence rather than dressing it as a result.

**4. Summary of changes** — grouped by kind: product fixes, copy fixes, new tests, tests corrected
(with both directions proven), infrastructure. One line each: what was wrong, what it is now, which
test pins it.

**5. Escalation ledger** — §8's record.

**6. Honesty ledger** — the house convention, and the most valuable section in every handback this
repo has produced. At minimum: what was never *heard*; what was never run on real hardware, a real LAN
or a second physical machine; what was simulated by SQL time travel rather than waited out; where the
click-through tenant differs from a real one; anything you could not verify; anything you changed
without fully understanding why it worked.

**7. What is next, and what is still Charles's.**

**Also:** update `docs/decisions/DECISION-REGISTER.md` (new decisions + the stale "next free ID" line),
commit the harness and the screenshots, and mirror the handback to
`C:\Users\Charles\Downloads\Claude Handover Files\` if that is still the convention — check, do not
assume.

---

## 10. Definition of done

1. Every test in §5 passes, on a **clean full run** of the whole plan, in one iteration, with no test
   skipped, quarantined, or narrowed.
2. `npm test`, the DB suite and the client suite are all green, with counts **≥** the P5 baseline.
3. The allow-list test, the no-orphan-columns test and D274's detector all still pass, and each has
   been proven in both directions at least once during the run.
4. T8.5 has a recorded red run and a recorded green run.
5. Every test with an "eyes" surface has a screenshot that a human opened.
6. The handback, the scorecard and the register update are written and committed.
7. Every founder-shaped decision is listed at the top of the scorecard, not implied by a diff.

---

## 11. Things that will go wrong, and what to do

| Barrier | Do this |
|---|---|
| Console sign-in (TOTP) | `MATIC_ADMIN_INSECURE_NO_TOTP` on loopback only (§3.5). If it refuses, check the bind before assuming the bypass is broken. |
| Electron will not attach over CDP | The 2026-09-11 run used `--remote-debugging-port=9223` successfully; check the port is free and the app is not already running. Two attempts, then escalate. |
| Waiting 72 hours | You never wait. §3.9. Test both a short configured interval and a backdated long one. |
| The runner races your test | P5's ledger item 4: a dev hub sharing the database can claim a due job before your `runOne()`. Assert **which worker won and the ticket's outcome**, not the mechanism. |
| A migration is wrong | Immutability protects migrations other tenants hold. If only the click-through tenant holds it, correcting in place is defensible **and must be written into the honesty ledger** — P5's item 1 is the precedent and the standard of disclosure. |
| The client does not enroll / the detector fires | D274 firing means the premise changed. Do what its message says; **never** narrow its search. |
| A test's expectation is arguably wrong | Escalate to Fable rather than deciding alone that the product is right and the test is wrong. |

---

## 12. Verification register — what this document claims, and how

| Claim | How known |
|---|---|
| File inventory: `server/src/**`, `server/test/**`, `migrations/control/001–009`, `migrations/tenant/001–010`, `server/bin/**`, `client/docs/**`, `docs/handovers/**` | **Read from the tree on 2026-09-13** (read-only) |
| `server/package.json` scripts (`test`, `test:db`, `migrate`, `tickets`, `admin`, `db:up`) | **Read** |
| `requester-routes.js`: the four routes, credential required on every listener, `WRITES_PER_MINUTE = 20`, `ACTION_PATH`, `ACK_PATH`, the 404-not-403 shape | **Read (first 70 lines) on 2026-09-13** |
| `dev-bypass.js`: `MATIC_ADMIN_INSECURE_NO_TOTP`, password never skipped, guard 2 refuses off loopback, **D271 answered 2026-09-12, D283 added `MATIC_HUB_BIND`, LAN is the production shape** | **Read** |
| Auto-close design, the binding, the 72-hour default, the kill switch, the CLI and console surfaces, ledger items 1–7 | **Read** in `2026-09-12-claude-code-handover-p5-built.md` |
| P4's routes, delivery stamps, poll floor, D286–D288, option 1 | **Read** in `2026-09-12-claude-code-handover-p4-built.md` |
| Assertion baselines 733 / 661 / 2041 | **Quoted** from the P5 handback's header. **Re-measure before relying on them.** |
| The auto-close delivery hole and the Friday/Tuesday prediction | **Quoted** from `2026-09-13-autoclose-delivery-gap-and-background-mode.md`, which itself marks the scenario *"reasoned from the code, not observed"* |
| The 2026-09-11 click-through method (CDP, port 9223, screenshots) and its findings F1–F6 | **Read** in `2026-09-11-claude-code-handover-panel-electron-click-through.md` |
| Register state D1–D289, next free D290, the stale procedure line | **Quoted** from the P5 handback and today's doc. **Verify against the register's own header.** |
| Console page structure, permissions, exact route paths (`POST /admin/tickets/autoclose`), audit event names | **Quoted from handbacks, not read from source.** Verify before depending on any of them. |
| Whether the client currently enrolls, and the exact shape of `read.js` / the allow-list test | **Not read.** Verify first. |
| Every effort or duration implied here | **None is offered.** Nothing in this plan has been run or measured. |

---

## 13. One thing worth saying to Charles at the end

This plan's most likely outcome is that the lifecycle works and the **delivery model** does not — that
T8.5 fails, that the fix is D290, and that the fix's real ceiling is D292, because a resolution can
only be delivered to an app that is running, and the app quits when its window closes. If that is what
the run finds, say it plainly in the handback's "what is next", and do not let a green scorecard imply
the product is finished when what it proves is that the ticket lifecycle is correct on a machine
someone happens to be looking at.
