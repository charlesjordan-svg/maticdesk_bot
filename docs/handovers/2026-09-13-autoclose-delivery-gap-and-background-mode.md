# Auto-close treats unreachable as consent — and the two decisions around it

**Date:** 2026-09-13
**Extends:** `2026-09-12-ticket-lifecycle-plan-v3.md` §5.5, §7.6; the P4 and P5 handbacks
(D286–D289); the 2026-09-13 Electron click-through.
**Proposes:** **D290** (the auto-close delivery gate), **D291** (pre-enrollment ticket visibility),
**D292** (background presence — founder's).
**Numbering:** the register's header says **D1–D289**; its "how to add a decision" procedure still
says *"Take the next free ID (**D286 onward**, as of 2026-09-12)"*. **The procedure line is stale** —
P4 took D286–D288 and P5 took D289. Next free is **D290**, and the line needs updating in the same
pass. This is the exact trap that voided plan v1–v3's numbering (§5.53a); it is worth one line of
maintenance to stop it catching the next writer.

---

## 1. The finding: a resolved ticket auto-closes whether or not the requester could ever have seen it

### 1.1 What the code does

`src/tickets/autoclose.js` and `scheduleAutoclose()` in `query.js`, read 2026-09-13:

- `resolveTicket()` enqueues one `ticket.autoclose` job at **`resolved_at` + the tenant's interval**
  and writes the job id onto the ticket.
- When the job runs, `closeByAutoclose()` closes the ticket if `auto_close_job_id` still equals the
  job's own id. That binding is the only condition.

Everything about that is well built — the binding survives resolve → reopen → resolve, at-least-once
is proven by running the handler twice (D270's ratified condition), NULL is a real kill switch, and a
policy change is deliberately not retroactive. **None of it checks whether the requester was ever
told.**

### 1.2 Why that matters here specifically

The clock starts when **the desk writes the resolution**. The requester learns of it only through the
endpoint's poll. And `client/src/main/main.js` still calls `app.quit()` on `window-all-closed`
(non-darwin) — the panel's own copy now admits it: *"I check every minute or so **while I'm on
screen**."*

So the failure is concrete and ordinary:

> A user files a ticket on Friday and closes the app. The desk resolves it Friday afternoon. The
> resolution notice, the *"closes on its own unless you say otherwise"* line, and eventually the
> close notice are all written into a poll the user's machine never makes. On Tuesday they open the
> panel and find the ticket **closed**, having never seen the resolution, never been asked, and never
> had the chance to say it wasn't fixed.

Auto-close is designed to convert *silence* into consent. What it currently converts is
**unreachability** into consent. Those are different facts, and this project has a standing position
on exactly that distinction — D238/tenant-004 gives the user's explicit "no, that did not fix it" its
own timestamp precisely so that *"a non-answer is not recorded as a 'no'"*. The same reasoning applies
in reverse: a notice nobody could receive is not a notice nobody answered.

Plan v3 §8.1 wrote the stakes in advance, before any of this was built:

> If auto-close fires wrongly even once in testing, disable the job and ship confirm/reopen alone. An
> incorrectly closed ticket is the single most damaging bug in this plan — it is the product telling a
> user their unfixed problem is finished.

### 1.3 The fix is cheap, and its columns already exist

P4 built the delivery record: the hub stamps hand-off and ack (D287), and `ticket_entries` carries
`notified_at` and `read_by_requester_at`. Nothing reads them for this purpose yet.

**D290 — the auto-close clock starts at delivery, not at resolution.**

Concretely, two changes, either of which alone closes the hole; I recommend both:

1. **Arm on ack.** `resolveTicket()` enqueues nothing. When the resolution entry's
   `read_by_requester_at` is first stamped, *that* schedules the job at `read_at + interval`. A
   resolution the requester has never seen has no clock. The ticket sits `resolved` — which is true —
   and the console's age indicator (D276) is where it surfaces.
2. **Refuse at the handler.** `closeByAutoclose()` gains one more condition beside the binding: the
   resolution entry must have been delivered. If it has not, the handler **re-arms rather than
   closes**, and says so in its log line. This is the belt to (1)'s braces, and it is the one that
   survives someone later re-introducing an eager enqueue.

**A backstop, because (1) alone can wait forever.** A resolution never delivered must not leave a
ticket `resolved` indefinitely. Give the re-arm a cap — after N re-arms, or M days undelivered, the
job stops re-arming and the ticket surfaces in the console as *"resolved, never delivered"*, which is
a queue item for a human rather than a silent close. That is the honest end state: the desk finds out
it could not reach someone, instead of the ticket quietly agreeing with itself.

**What this does not fix:** a user who is *running* the app but does not read the panel still gets
auto-closed on the interval. That is real silence, and treating it as consent is what the industry
does (plan v3 §2.1). The distinction D290 draws is between "did not answer" and "was never asked".

### 1.4 Verification

| Claim | Status |
|---|---|
| `scheduleAutoclose()` uses `resolvedAt`; `closeByAutoclose()` checks only the job binding | **Verified** — read `src/tickets/autoclose.js` and `src/tickets/query.js` on 2026-09-13 |
| `notified_at` / `read_by_requester_at` exist and P4 stamps them | **Verified** by the P4 handback (D287) and `tenant/006`. **Not** re-read at the row level this pass |
| `main.js` quits on `window-all-closed` | **Verified** 2026-09-12, and corroborated by the panel's own "while I'm on screen" copy in the click-through screenshots |
| The Friday/Tuesday scenario | **Reasoned from the code, not observed.** Nobody has run it. It is a prediction, and it is testable in an afternoon: resolve a ticket with the client shut, wait past a short interval, start the client |

---

## 2. D291 — pre-enrollment tickets: decided, not merely explained

The click-through surfaced the orphan class and the copy now handles it honestly: *"filed before this
machine was enrolled with the service desk, so it can't match them to me and I can't see how they're
getting on."* Good copy, and **there is no register entry** — I searched for `backfill`,
`pre-enrollment` and the copy's own phrase and found nothing.

That silence is a trap, because the obvious fix is wrong. Backfilling `tickets.device_id` by matching
`os_username` would make those four rows light up, and it would do so by **granting ticket visibility
on a self-asserted username** — the thing `src/tickets/file.js` refuses a client-supplied tenant to
prevent, one layer up. Convenience becoming the identity model is the specific failure this codebase
names in three places.

**D291 — pre-enrollment tickets stay unmatched, permanently, and the copy is the answer.** A ticket
filed before an enrollment existed has no trustworthy link to it; `os_username` is self-asserted
(D148's attested identity is unbuilt) and matching on it would be authorization by convention. The
requester can still quote the reference, which is what the reference is for. If this is ever revisited,
the safe form is a **console-side** link made by an authenticated admin — not an automatic join.

Write it down even though it changes no code. The next person to look at those rows will reach for the
backfill, and a row that says "considered, refused, here is why" is what stops them.

---

## 3. D292 — background presence, which is the premise the rest rests on

Plan v3 §5.5 raised this as a product question. It is now load-bearing, and worth restating in the
sharper form the last two phases have given it.

**D250 chose in-app notification over email on one argument**: the agent already lives on the user's
screen, so this is the half of D86 we can satisfy without SMTP, and the half no ITSM competitor can do
at all. That argument is only as strong as the agent's presence. Today the agent is a single window
that exits when closed — so "the channel no competitor has" is a channel that exists only while the
user happens to be looking at it.

Three options, and this is genuinely yours:

| Option | What it costs | What it buys |
|---|---|---|
| **Tray + background mode** — the window closes to a tray icon; the poll keeps running; the toast (D251) can fire | Real client work: tray, lifecycle, a quit that means quit, autostart, and a settings surface for all of it. Plus the first "why is this running in the background" conversation with a customer's security team | The pitch becomes true. D250's argument holds. D290's delivery gate resolves quickly instead of waiting days |
| **Stay foreground-only and lean on D86's email** | SMTP, deliverability, bounce handling — the third stateful dependency, which the register has been deferring since D86 | Notification that reaches people who are not looking at the app. Also the only way to notify the IT alias, who has no endpoint at all |
| **Neither — accept it, keep the honest copy** | Nothing now | Auto-close stays slow and hedged forever; the resolution notice is best-effort; §6.3's "visible and survivable at pilot scale" stays the ceiling |

**My recommendation: tray and background mode, and treat D86's email as still required for the
IT-facing half.** They are not alternatives — the endpoint channel reaches the requester and can never
reach the desk. But if only one gets built this quarter, the tray is the one that makes the existing
five phases work as designed; email makes them work for people who have closed the app.

**D290 does not wait on this.** The delivery gate is correct whatever the answer — it is strictly
better to close on evidence of delivery than on a timer, even if delivery is usually fast.

---

## 4. Suggested order

1. **D290's handler refusal** (§1.3 item 2) — smallest, and it removes the sharp edge on its own.
2. **The Friday/Tuesday test** — run it before and after, so the fix has a red run behind it, the way
   every guard in this project now does.
3. **D290's arm-on-ack** (item 1) and the undelivered backstop.
4. **D291** — one register row, no code.
5. **D292** — founder's, and the answer changes P6's urgency more than it changes P5's.
6. **Housekeeping:** update the register's stale "next free ID" line to D290 onward.
