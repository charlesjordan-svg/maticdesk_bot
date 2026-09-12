# Addendum to plan v3 — the console implies a fleet it does not have

**Date:** 2026-09-12
**Extends:** `2026-09-12-ticket-lifecycle-plan-v3.md`. Does not supersede it; adds a phase ahead of
P1 and records four gaps in that plan's own coverage.
**Proposes:** **D272–D274**, taking the next free IDs per the register's §"how to add a decision"
procedure (*"Take the next free ID (D272 onward, as of 2026-09-12)"*). The register stands at D271.
**Forcing reason:** Charles opened the Agents page and the panel side by side, read *"0 active
devices"* against *"Everything I need is available"*, and concluded something was broken.

---

## 0. What is actually happening — nothing is broken

Both screens are correct. They are about different things, and the words collide.

**The panel is honest and live-bound.** `renderer.js` sets `root.dataset.hub` from HubLink's state
(`reachable → "ok"`, `unreachable → "unreachable"`, else `"none"`), and the three `.hubcopy`
variants are selected by that attribute; `.hub-checked` spans get a live string computed from
`lastOkAt`. Its own devlog line even prints *"(identified by shape, NOT device-authenticated)"*.
`hub-link.js` states the scope in its header:

> A probe: GET /v1/health, with a SHAPE CHECK on the body… it does NOT make this an authenticated
> heartbeat… this is an IDENTIFIED reachability check, not an authenticated one, and the status says
> so.

So *"Everything I need is available"* means **I can reach the hub, and company guidance and the
ticket route answer.** It makes no claim about being registered anywhere. It is right.

**The console is also correct, and misleading.** `active devices` counts rows in `control.devices`
with `status = 'active'`. The running endpoint is not one — and here is the part that matters:

> **The client has no enrollment code at all.** There is no call to `/v1/enroll` anywhere in
> `client/src`. B3's own status block says every enrollment in that pass came from curl, the CLI, or
> the test suite.

So **"0 active devices" is not a fault and is not temporary. It will read 0 on every install,
forever, no matter how many endpoints are running**, until P3 gives the client enrollment. The page
cannot show the running endpoint. That sentence appears nowhere on the page.

`hub-link.js` also explains why the hub could not know anyway: D114 rules out a persistent
connection, and *"the hub holds NO list of attached agents to signal"*. **The hub has no concept of a
connected agent by design.** The Agents page is an enrollment ledger; the panel is a reachability
lamp. Neither is a fleet view, and the page's title, lede and counters all read like one.

---

## 1. Three specific things the page implies and cannot back

The page already carries a `notYet()` block — *"Nothing here is authenticated yet"* — and it is
correct. It is also **below the fold**, beneath the secrets panel, and it answers a different
question than the one a reader asks at the top of the screen.

| # | What it shows | What is true |
|---|---|---|
| 1 | **"Agents" / "The endpoints enrolled with this tenant" / `0 active devices`** | No shipped endpoint enrolls. This counter can only ever reflect hand-enrolled devices. The `notYet` block explains that enrolled devices are not *authenticated*; nothing says running endpoints are not *enrolled* |
| 2 | **"LAST SEEN — 2026-09-10 06:53 (3 days ago)"** | Not last seen. `last_seen_at` is written **only inside `enrollment.js`**, on the enroll / approve / re-submit paths — verified by search across `server/src`. `demo-laptop-01`'s value equals its ENROLLED value because that is the only thing that ever wrote it. An endpoint talking to the hub every 60 seconds would still show its enrollment date |
| 3 | **"REVOKED" + a Revoke control** | Revoking changes a row and blocks nothing. No route checks device identity, so a revoked endpoint can still `/v1/ask` and `/v1/ticket`. `enrollment.js` says this about itself. An operator reads REVOKED as "access withdrawn" |

Also on screen and worth knowing: **`demo-laptop-01` is a B3 test artifact** — enrolled by hand on
2026-09-10 and revoked, sitting in the tenant a demo would be given from.

**This is the project's signature defect in a new shape.** Not a UI implying an integration that does
not exist — a UI implying a *fleet view* that does not exist. It was found the way the other three
were: by someone looking at the screen.

---

## 2. Gaps in plan v3 that this exposes

| # | Gap | Consequence |
|---|---|---|
| **G1** | **Plan v3 audited the ticket store for "does the UI claim what is true" and never swept the rest of the console.** I read `enrollment.js` and B3's doc while designing D254 and never opened `agents.js` | The same disease was two files away and went unlisted. Metrics and any sessions view deserve the same pass |
| **G2** | **`last_seen_at` has no writer, and the plan never noticed.** Plan v3 listed "revocation becomes a real control" as a D254 benefit and missed its sibling | The moment a credential is presented on every request, stamping `last_seen_at` is one `UPDATE` and the column stops lying. It belongs in P3's scope and was not there |
| **G3** | **Ordering.** Plan v3 treats P3 as the phase that adds identity and says nothing about console surfaces already claiming identity | A page must stop implying enforcement *before* enforcement exists, not after. P3 is gated on D271 and may never happen in its current form; the copy cannot wait on it |
| **G4** | **P0 pinned schema claims with a test; no equivalent pins page claims.** The no-orphan-columns test makes "this column is deliberately unused" an entry the suite reads | The specific case here is testable: while `client/src` contains no enrollment call, the Agents page must carry the never-enrolls caveat. When P3 adds enrollment the test flips and forces the copy to be corrected |

**One thread worth naming.** G1–G4, plan v3 §5.5 (the app quits on close, so no notification path
reaches a closed panel), and D271 are the same underlying absence: **the product has no concept of
which endpoints exist and are alive.** The Agents page is where that would surface. Answering D271
and shipping P3 is what makes "active devices" mean something — and it is also what would make the
tray/background-mode question answerable, because an endpoint that enrolls and presents a credential
per request is an endpoint the hub can count.

---

## 3. Decisions

| ID | Decision |
|---|---|
| **D272** | **The Agents page states, above the fold, that no shipped endpoint enrolls itself.** The caveat goes where the reader is looking — beside the counters, in the `limit()` position the Tickets page already uses for "NOBODY HAS BEEN EMAILED" — not only in the `notYet()` block below the secrets panel. It names the fact plainly: nothing in `client/` calls `POST /v1/enroll`, so this page lists only devices enrolled by hand, and a running endpoint does not appear here. The existing `notYet()` block stays; it answers a different question |
| **D273** | **"Last seen" is renamed to what it measures, and revocation says what it does not do.** The column becomes *last enrollment activity* with a muted note that nothing updates it when a device talks to the hub, because nothing identifies a device on a call (D61). The Devices panel carries, adjacent to the Revoke control, the sentence that revoking removes standing and blocks nothing. **Both revert when P3 lands** — that is the point of writing them as conditions rather than permanent copy |
| **D274** | **A structural test pins the caveat to the client's behaviour.** While no file under `client/src` calls the enrollment route, the Agents page must render D272's caveat; when one does, the test fails and the copy must be revisited. Same shape as P0's reserved-list test: the claim is enforced and can only change by being edited deliberately |

All three are **PROPOSED**. None depends on D271, on P3, or on any open question in plan v3.

---

## 4. Revised phase order

| # | Goal | Blocked by | Est. |
|---|---|---|---|
| ~~P0~~ | ~~Stop the schema lying~~ | — | **done** (D269) |
| ~~P0.5~~ | ~~The job queue gets a runtime~~ | — | **done** (D270) |
| **P0.75** | **The console stops implying a fleet** (D272–D274) | nothing | **0.3–0.5** |
| **P1** | The timeline exists — **work notes only** | nothing | 1.0–1.5 |
| **P2** | Resolution means something | nothing | 0.8–1.2 |
| **D271** | **GATE — deployment topology** | **founder** | — |
| P3 | The endpoint has an identity — **and `last_seen_at` gets a writer (G2)** | D271 | 1.5–2.5 + topology |
| P4 | The user sees updates, and IT can see that they did | P3 | 1.5–2.0 |
| P5 | Closure works as §3 says | P4 | 0.5–0.8 |

P0.75 goes first because it costs half a day, depends on nothing, and is the screen a prospect sees.

---

## 5. Verification

| Claim | Status |
|---|---|
| The panel's status line is live-bound to HubLink state | **Verified.** `renderer.js` sets `root.dataset.hub` from `s.state` and rewrites `.hub-checked` from `lastOkAt`; the three `.hubcopy` variants live in `panel/panel-check-frame.html` |
| `main.js` loads the live renderer, not the design export | **Verified.** `createWindow()` loads `index.html`; `panel/matic-desk-panel.html` is the Design export and is not what runs |
| No file under `client/src` calls `/v1/enroll` | **Verified** by search on 2026-09-12, and consistent with B3's own status block |
| `last_seen_at` is written only inside `enrollment.js` | **Verified** by search across `server/src` — three write sites, all on enroll/approve/re-submit paths |
| Nothing checks device identity on `/v1/ask` or `/v1/ticket` | **Verified** — `index.js`'s header and `agents.js`'s `notYet()` both state it; `authenticate()` is a no-op hook |
| `demo-laptop-01` is a hand-enrolled B3 test row | **Inferred**, not proven: its enrolled and last-seen timestamps are identical and B3's doc says every enrollment in that pass came from curl, the CLI or the test suite. Not checked against the row's provenance |
| Effort figures in §4 | **Estimates.** Nothing in P0.75 has been built |

---

## 6. For Charles

- **Nothing is wrong with your install.** The panel is right, the console is right, and the console
  is missing one sentence that would have saved you the double-take.
- **"0 active devices" will stay 0** on every install until P3 gives the client enrollment code —
  which is gated on D271, which is yours.
- **`demo-laptop-01` is a revoked test row from B3** sitting in the tenant you would demo from. Say
  the word and I will have it cleaned up, or left with a note.
- The one question this raises that plan v3 did not: **do you want the Agents page to exist at all
  before P3?** It is a real, working enrollment console for a mechanism nothing uses yet. Keeping it
  with D272's caveat is my recommendation — it is honest, and it is the screen that proves the
  mechanism works when a prospect asks. Hiding it would be tidier and would lose that.
