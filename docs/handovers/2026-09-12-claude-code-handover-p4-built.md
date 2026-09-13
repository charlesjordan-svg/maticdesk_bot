# Handback — ticket lifecycle P4, built: the requester acts, the console reports delivery, the endpoint polls and shows

**Date:** 2026-09-12 (night, Pacific), on Charles's *"Start P4"*.
**Answers:** plan v3 §3.1–§3.3 (a requester comment reopens; confirm closes; the poll), §7.1, §7.4
(delivery state on every public row), §7.5's ack, and its §8 row P4 — as **option 1** of the three
Charles was offered mid-pass (§1 below). `docs/handovers/2026-09-12-ticket-lifecycle-plan-v3.md`.
**Follows:** `docs/handovers/2026-09-12-claude-code-handover-p3b-built.md` (D282–D285).
**Register:** `docs/decisions/DECISION-REGISTER.md` §5.58 — **D286** (a requester's comment is a
transition; confirm; `reopened_from`), **D287** (the console reports delivery from the hub's stamps;
"Reply to requester"), **D288** (the endpoint polls and SHOWS; the band's hub branch; **revises D242**),
all **PROPOSED**. Register at v2.56, D1–D288; next free is **D289**.
**Commits, in order:** `88e271a` (the hub: comment/confirm/reopen/ack routes, the two stamps),
`06b3d99` (the console composer and delivery state, `reopened_from`, the CLI), `0e4bfb1` (the client:
the watch, the band, the transcript line, the four `HubClient` writes), then this document, the Design
brief and the register.
**Assertions:** server headless **695** across 7 files (was 674); db **625** across 3 (was 566);
client **2038** across 26 files (was 1942 across 25; `ticket-watch.test.mjs` is new).

---

## 0. What was done, in one paragraph

A requester can now comment on their own ticket, and the comment is a transition rather than a note:
on a resolved ticket it reopens (the resolution undone, a public "resolved → open" written), on a live
one it starts the D276 clock, on a closed one it is refused with the way forward — a new ticket that
carries `reopened_from`, which tenant/009 adds as a real foreign key. Confirm takes resolved to
closed by the requester with the resolution kept. The hub stamps two facts on every public entry the
desk writes — when it HANDED the entry to the requester's endpoint (the endpoint read the timeline)
and when the endpoint acknowledged having SHOWN it — and the console renders one of three sentences
from them on every public row, never "sent" or "notified". The console gains the composer P1
refused: "Reply to requester", whose form says the requester sees it only while their Matic Desk app
is open and polling, not email. The endpoint polls its own tickets once a minute (floored at 30 s in
code), reads a changed ticket's timeline, and shows one transcript line per desk entry the hub says is
unseen — the desk's words quoted in full — then acknowledges exactly what it showed; the taskbar
flashes if the window is not in front; nothing is spoken. The tickets band's rows carry the hub's
state and the desk's last write when the last poll saw the hub, and fall back to D242's words when it
did not, from one word-module shared with the spoken "where's my ticket?" answer. The panel view and
the toast are written up for Claude Design, with the next steps, rather than approximated.

---

## 1. The founder's answers this pass rests on

| Question | Charles, 2026-09-12 | Recorded as |
|---|---|---|
| Should an update from the desk be spoken when it arrives? | **Show only** (the recommended option) | **D288.** No `say()`, the face unchanged; a transcript line and a taskbar flash. |
| How should the panel view and the toast be handled in this pass? | First *"Approximate the surfaces in-app"*, then: *"I see the statement about my choice to build rather than describe. tell me about the options and lets work out the description"*, then: *"go with option 1. leave notes about the next steps in your handover."* | **Option 1**, §1.1 below. The Design brief is `docs/handovers/2026-09-12-claude-design-handover-ticket-timeline-and-toast.md`; sending it is Charles's act. |

### 1.1 The three options, and the one taken

| | Build now | Surface an update through | Panel view / toast |
|---|---|---|---|
| **1 — taken** | hub routes, console composer + delivery state, client poll/ack/`HubClient` methods | the EXISTING surfaces: tickets band rows, a transcript line, the taskbar flash | a Claude Design brief WITH next steps |
| 2 | the same | a hand-drawn approximation of the timeline view and the toast in `renderer.js` + app.css | approximated now, redrawn later — the D241 inversion (the app drawing a design and asking Design to match it) |
| 3 | hub + console only | nothing on the endpoint | wait for Design before any client work |

Option 2 was where the pass had started and was stopped, correctly: the panel is Claude Design's
delivery (D240/D241), and the September delivery's own `.tstat b.you` / `.tstat b.closed` classes
show they had already drawn for exactly the status the band now carries. Option 3 would have left the
console's "handed / seen" evidence with no writer.

---

## 2. Exit criteria — plan v3's P4 row, in order

| # | Criterion | Result |
|---|---|---|
| 1 | A requester's comment on a RESOLVED ticket reopens it, in one transaction, with the resolution undone and a public state change written | **Yes.** `requesterComment()` under `FOR UPDATE`; `admin-db` B3-6: resolved → open, `resolution_code`/`resolution_notes`/`resolved_at` null, "resolved → open" entry, the desk's badge gone, the clock started. |
| 2 | A comment on a LIVE ticket starts the "oldest unanswered" clock, and the desk's reply clears it | **Yes.** `COALESCE(awaiting_agent_since, now())` — the oldest comment is the age; `replyToRequester()` clears it in the same transaction as the entry; B3-6 checks both the console reply and the CLI reply. |
| 3 | A comment on a CLOSED ticket is refused with the way forward | **Yes.** 409, the sentence names `reopenedFrom`; `POST /v1/ticket` with `reopenedFrom` accepted only for THIS enrollment's closed ticket (B3-6, both refusals). |
| 4 | Confirm takes resolved → closed by the requester; anything else is refused | **Yes.** `confirmResolution()`: `closed_by = 'requester'`, the code and notes kept, the clock cleared, "resolved → closed" written; 409 from any other state. |
| 5 | The console reports delivery from the hub's stamps and never implies it | **Yes.** `deliveryWords()` — three sentences from `notified_at`/`read_by_requester_at`; B3-6 moves one entry through not-handed → handed (after the endpoint's read) → seen (after the ack) and reads each sentence off the page; `admin-static` §5e fails on "sent"/"notified" copy. |
| 6 | The endpoint polls and an unseen desk entry reaches the user ONCE | **Yes** (headless). `ticket-watch.test.mjs` §2–§5: the requester's own comment and an already-acknowledged entry are not announced; a re-poll re-reads but does not re-announce; a new entry is; the ack goes back for exactly the shown ids. **Not watched in Electron** (§4). |
| 7 | The band and the spoken answer describe one ticket one way | **Yes.** `client/src/ticket/state-words.js` is imported by the renderer and by `social.js`; `panel.test` §7 pins both imports and fails on an inline state gloss in the renderer; `ticket-status.test` §5 reads the words back from the reply. |
| 8 | Nothing is spoken; nothing acts without the user | **Yes.** `panel.test` §7: `applyTicketUpdate()` calls `note()` and never `say()`/`setState()`; `ticket-watch.test` §10: the watch calls `ack()` and never `comment()`/`reopen()`/`confirm()`; the preload has no channel that carries the requester's words. |

---

## 3. What was built, by file

### Hub (`88e271a`, `06b3d99`)
- `server/src/tickets/query.js` — `requesterComment()`, `confirmResolution()`, `replyToRequester()`
  (console user or `system`, refuses `requester`), `markEntriesNotified()`, `ackEntries()`;
  `WRITABLE_KINDS` gains `comment` and `addEntry()` still refuses it; `shapeEntry` carries the two
  stamps; `getTicket()` joins `reopened_from` to its reference. P5's cancel hooks are comments in the
  two transitions.
- `server/src/tickets/requester-routes.js` (new) — the four POSTs; credential REQUIRED on every
  listener; 20 writes/min per enrollment; 404 for another enrollment's reference; 409 with the state.
- `server/src/tickets/read.js` — the detail read stamps `notified_at` before listing and returns
  `handed`.
- `server/src/tickets/file.js` — `reopenedFrom` accepted, resolved under the device inside the insert.
- `server/migrations/tenant/009-reopened-from.sql` — `tickets.reopened_from uuid REFERENCES tickets(id)`.
- `server/src/admin/pages/tickets.js` — two composers; `deliveryWords()`; `awaitingRequester()` derived;
  the "none" indicator says what none means; every "nobody" sentence rewritten; "Follow-up to" link.
- `server/bin/tickets.mjs` — `reply <ref> --body`; per-line delivery marks; the follow-up line.

### Client (`0e4bfb1`)
- `client/src/agent/ticket-watch.js` (new) — `TicketWatch`: the poll, the hub-sourced "unseen", the
  ack, the snapshot in userData; injectable timers/clock/client.
- `client/src/ticket/state-words.js` (new) — `stateWords`, `stateClass`, `stateDetail`, `stateSpoken`,
  `updateWords`, `agoWords`: the one vocabulary.
- `client/src/agent/hub-client.js` — `comment()`, `reopen()`, `confirm()`, `ack()` over `#act()`.
- `client/src/main/main.js` — constructs the watch, starts it when a credential lands, `ticket:update`
  push, `flashFrame` when unfocused, `ticket:filed` carries `hub` and a truthful `canQueryHub`,
  `ticket:ack`.
- `client/src/main/preload.cjs` — `onTicketUpdate`, `ackTicketEntries`.
- `client/src/renderer/renderer.js` — the band's hub branch; `applyTicketUpdate()`; the inspector note.
- `client/src/agent/agent.js`, `client/src/router/social.js`, `persona.json` — the D235 answer with the
  hub's view (`someKnown`/`itemKnown`/`unseen`), or the old words when the poll had none.
- `client/config.json` — `ticketPollMs: 60000` and its note.
- `client/src/renderer/panel/matic-panel.app.css` — one rule (the detail line's colour when unseen).

---

## 4. Honesty ledger

1. **Nobody has watched any of this in Electron.** The renderer has no headless coverage; the two
   entry files are syntax-checked and the modules import. The band's hub branch, the transcript line,
   the ack round trip and the taskbar flash have been exercised only by the tests that drive the
   machinery around them. **First thing next session:** a filled-in `enrollment.secret` on the dev box,
   a reply from the console, and the click-through re-run (`client/docs/PANEL-RENDERER-CHECK.md`),
   with screenshots.
2. **"Seen" means on this screen, not read.** The ack fires when the transcript line is appended, which
   can happen with the window behind another. The hub cannot stamp attention.
3. **The console's delivery state is as stale as the poll** — a minute, or the app's whole absence. The
   form says so in words.
4. **The dev endpoint has not enrolled** (the repo's secret is empty), so on the dev box the watch logs
   `no-credential` once and the band shows D242's words. Correct, and not a demonstration.
5. **D242 is revised without ratification.** `panel.test` §7 carries the reasoning; register §5.58b
   says what a revert costs (one commit; the watch stays).
6. **The state words are a first draft** in 150 px of small capitals; the Design brief asks for review.
7. **The connectivity pill still says "reachable" on a LAN hub that refuses every turn** (§5.57d) —
   the watch's `no-credential` basis reaches the developer log and the band's note, not the pill.
8. **No second machine.** Same limit as P3b: everything ran on one machine's loopback.

---

## 5. What is next

- **Ratify or revert D288's revision of D242** (and D286/D287, which stand on their own).
- **The Electron click-through** (§4.1).
- **Claude Design:** the timeline view and the toast — `docs/handovers/2026-09-12-claude-design-handover-ticket-timeline-and-toast.md`.
  Sending it is Charles's act. When it lands, the client work is: a `ticket:timeline` read (the
  `HubClient.ticket()` call already exists), a composer channel that carries the requester's words to
  `comment()` (the ONE channel `panel.test` §7 forbids today, on purpose, until the view exists),
  Confirm / Still not fixed to `confirm()`/`comment()`, and the toast as a second `BrowserWindow`
  driven by the same `ticket:update` push.
- **The conversational path** ("it's fixed" / "it's not fixed" → `confirm()`/`comment()`): a classifier
  subkind, AFTER the view, so the intent has a screen to land on.
- **P5 (auto-close):** `ticket.autoclose` under D270's at-least-once condition, bound to the RESOLUTION
  that enqueued it; the cancel hooks are marked in `requesterComment()` and `confirmResolution()`.
- **P3b's owed items stand:** the console's security review; D270's worker promotion; both before a
  LAN deployment.
