# Claude Code handover — P3a (the requester-safe read shape) and P3b (the credential, GATED)

**Date:** 2026-09-13
**Plan:** `2026-09-12-ticket-lifecycle-plan-v3.md` §6.2, §7.2, §7.3, §7.5 and its §8 row **P3**, plus
`2026-09-12-ticket-lifecycle-plan-v3-addendum-console-honesty.md` (G2, G3).
**Follows:** `2026-09-12-claude-code-handover-ticket-lifecycle-p2-built.md` (D278–D280).
**Numbering:** the register stands at **D280**; its own procedure says *"Take the next free ID (D281
onward, as of 2026-09-12)"*. **Use D281 onward.** Every D-number in plan v1/v2/v3 is void (§5.53a) —
read them as labels, never as IDs.

**This handover splits P3 in two, and the split is the point:**

- **P3a — the requester-safe read shape. UNBLOCKED. Build this now.** Every topology answer needs it,
  because every one of them ends with the panel reading a ticket.
- **P3b — the credential and the transport. GATED on D271.** Do not start. Its shape, its cost and
  whether it is worth building at all depend on an answer that does not exist yet. §4 says what each
  answer does to it.

---

## 0. Why P3a is unblocked when P3 is not

Plan v3 put the credential and the read route in one phase. That was wrong in one respect: **the
hazard that makes a requester route dangerous is independent of who is allowed to call it.**

`getTicket()` does `SELECT t.*`. Any requester-facing route built on that shape ships `summary` —
which `003-tickets.sql` says is *"never shown to the user"*, and which D214 exists because it was once
read aloud to one — plus `what_was_checked` and `internal_resolution_note`. That is true whether the
caller is authenticated, whether the hub is on loopback or a LAN, and whether D271 says same-machine
or hosted.

So the safe row shape and the test that pins it are worth building **before** the decision, not after.
They are also D269's ratified condition, which says the denylist test is written first and **seen
failing** before any requester route exists. P3a is that condition, discharged early.

---

## 1. P3a — what to build

### 1.1 The denylist test, first, and red

**This is commit one, on its own, and it must fail when you write it.** Same discipline as P0's
no-orphan-columns test and D274's detector — both of which earned it: D274's first draft was vacuous
and only surfaced because it was proven in both directions.

The test asserts that **no requester-facing payload may contain** any of:

- `summary` / `whatWasChecked` — the model's case note and its checks (D214, `003-tickets.sql`)
- `internalResolutionNote` (D269)
- any `ticket_entries` row whose `visibility` is `internal`
- any column added later that is not on an explicit **requester-visible allow-list** in the test file

**Allow-list, not denylist, for the ticket row.** A denylist of field names silently admits every
column added after it is written; an allow-list fails closed. Name it a denylist test if you like —
D269's condition uses that word — but implement it as an allow-list with a reason per entry, the same
shape as `RESERVED_COLUMNS`. The entries are, as drafted: `reference`, `state`, `category`,
`createdAt`, `updatedAt`, `resolutionCode`, `resolutionNotes`, `resolvedAt`, `closedAt`, `closedBy`,
`machineName`. **Not** `suggestedOwner` (routing is internal), **not** `sessionId`, **not** the
reporter's own profile fields echoed back.

Write it against `getTicketForRequester()` before that function exists, so the first run fails on the
missing export; then against the real shape. Record the red run in the commit message, as P0 did.

### 1.2 `getTicketForRequester()` and `listEntriesForRequester()`

In `src/tickets/query.js` — D224 holds, and `admin-static` §5 already fails if ticket SQL moves.

- **Named columns only. Never `SELECT t.*`, and never a spread of a row object.** The reason goes in
  the function's header, naming D214 and the 2026-09-04 defect.
- `listEntriesForRequester()` is `listEntries(..., { visibility: "public" })` with the argument fixed,
  not passed through — a requester path with a visibility parameter is a requester path that can be
  called wrong.
- Both take the ticket reference plus whatever identity P3b eventually supplies; **for now they take
  an explicit `osUsername` + `deviceKeyId` pair and are called by nothing.** Building the shape
  without the route is deliberate: the route is P3b's and the route is what D271 gates.
- `getTicket()` keeps `SELECT t.*` for the console. Add a one-line comment on it pointing at the
  requester function and saying why there are two.

### 1.3 Exit criteria

1. The denylist/allow-list test **fails before `getTicketForRequester()` exists** and passes after.
   Both runs recorded. This discharges **D269's ratified condition**.
2. A test proves the requester shape omits `summary`, `whatWasChecked` and `internalResolutionNote`
   for a ticket that has all three populated — not a ticket where they happen to be null.
3. A test proves `listEntriesForRequester()` cannot return an internal entry, on a ticket that has one.
4. Adding a column to `tickets` and not to the allow-list **fails** the test. Prove it by hand, revert.
5. Both suites green, counts up.

### 1.4 What not to do in P3a

- **No routes.** `GET /v1/tickets` is P3b's and is gated. A requester-safe reader with no caller is
  the correct end state for this pass.
- **No client changes.** No enrollment, no polling, no panel view.
- **Do not touch `getTicket()`'s shape.** The console needs those fields; the fix is a second
  function, not a narrower one.
- **Do not weaken D274's detector**, and do not pre-emptively rewrite the Agents page copy. The client
  still does not enrol in P3a.

---

## 2. P3b — GATED. Do not start.

**The gate is D271: where the hub runs relative to the endpoint.** It is open, it is the founder's,
and the register row says what each answer does. The hub binds `127.0.0.1` and *"refuses any
connection whose peer is not loopback anyway"*; TLS is listed as out of scope in `index.js`'s header.

### 2.1 What each answer does to P3b

| D271 answer | What P3b becomes |
|---|---|
| **Same machine** (the demo box) | **P3b is largely theatre and should be re-scoped or dropped.** The only caller that can reach the route already shares the box with the database. Plan v3 §8.2's kill criterion applies: *stop and re-scope rather than build a credential nobody needs.* The panel reads over loopback; the honest framing is a local concern, not a network identity. **D272's Agents-page caveat becomes permanent copy, not temporary** — and D273's two conditions with it |
| **Customer LAN** | P3b as plan v3 describes it, **plus a transport slice that is its own estimate**: the hub must accept non-loopback peers, over TLS. D222's cookie `Secure` flag becomes unconditional the same day. The enrollment secret then travels, and needs a delivery path — and **there is no installer** (B3: *"there is no installer in this build"*), so today's only honest answers are a plaintext `config.json` or a human pasting it. That is a decision, not a default |
| **Hosted** | Everything in the LAN answer, plus residency (D141/D93) and OPEN-9's certificate on the path |

**Do not pick one of these to unblock yourself.** The three differ in cost by more than the phase is
worth, and choosing quietly is how a deployment model gets set by an engineer's convenience — the
failure `src/tickets/file.js`'s tenant refusal exists to prevent, one layer up.

### 2.2 Scope, when it opens (LAN or hosted)

Recorded now so the shape is not re-derived later. All of it needs new IDs from **D281 onward**.

- **Client enrollment at startup** — the half of B3 that was never built. `POST /v1/enroll` once,
  persist the device id and the credential beside the profile. It generates **no key**: an opaque id
  plus an issued secret is all this needs, and calling it a key overstates it (D60/D63 unbuilt).
- **The credential**: minted on enrol, **hash stored, plaintext shown once** — the pattern
  `enrollment_secrets.secret_hash` and `admin/session.js`'s `sha256(token)` already use. Presented on
  every hub request.
- **It is a per-OS-user enrollment credential**, not per-install and not per-machine: `main.js` puts
  the profile in Electron's per-user `userData`, *"which is what makes 'kept locally for each user'
  true on a shared machine"*. Each Windows account enrols separately. Say this on the route, in
  `/v1/health` and in the register — the `notified: false` discipline applied to a credential.
- **`last_seen_at` gets its real writer** (addendum G2) — one `UPDATE` on an authenticated request,
  and the column stops lying.
- **Revocation becomes enforcement.** `revokeDevices()` and bulk revoke (D83a) are built and currently
  stop nothing; a checked credential is what makes them real.
- **Tenant from `control.devices.tenant_id`**, not `MATIC_TICKET_TENANT`. Keeping the env var
  load-bearing under a device identity is how the single-tenant default becomes the tenancy model.
- **`GET /v1/tickets`** scoped to the authenticated enrolment, built on P3a's reader, with an honesty
  field naming what the credential does and does not prove.
- **A body cap, a per-enrolment rate limit and a poll floor.** A misconfigured fleet polling at 1 s is
  the first load this hub will ever see.

### 2.3 The loop that will fire, and what to do about it

**The moment the client enrols, D274's detector fails on purpose**, with this message:

> THE CLIENT NOW ENROLLS … D272/D273's copy is FALSE and must be revisited: the never-enrolls caveat,
> the "Last enrollment activity" heading and its not-a-heartbeat note, and the revoke-blocks-nothing
> sentence … Give `last_seen_at` its real writer (addendum G2), let revocation mean revocation, then
> rewrite this block for the new premise.

**That failure is the feature.** The response is to do what it says — writer, enforcement, then new
copy — **never** to narrow the detector's search or exempt a path. If the copy is rewritten before the
writer and the enforcement exist, the page goes back to claiming something it cannot back, which is
the defect this whole thread started from.

### 2.4 Exit criteria, when it opens

1. P3a's allow-list test still passes against the live route.
2. A request with a valid reference and a wrong or absent credential returns nothing **and says why**.
3. A revoked enrolment stops working on its **next** request.
4. `last_seen_at` moves on an authenticated call and not on enrolment alone.
5. D274's detector fails, and the Agents page copy is rewritten only after 3 and 4 are true.
6. The tenant on a requester route comes from the credential, not the environment.

---

## 3. Commits

**P3a:**

1. `test: requester payloads carry an allow-list, not whatever getTicket returns (fails)` — the red test alone.
2. `feat(tickets): getTicketForRequester and listEntriesForRequester, named columns only (D281)`

**P3b:** not planned here. When D271 opens, the first commit is still the red test if P3a has not
already discharged it — and if P3a has, say so in the P3b handover rather than writing a second one.

---

## 4. Register

Add P3a's decision as **D281**, PROPOSED, with the forcing reason: *`getTicket()` returns `SELECT t.*`
and D214's case note is in it; the hazard is independent of D271, so the safe shape and its test are
built before the gate opens.* Note in the row that this **discharges D269's ratified condition**.

Update the "next free ID" line.

---

## 5. Verification

- `getTicket()`'s `SELECT t.*` and its returned `closeNote`/`internalResolutionNote` were read from
  `src/tickets/query.js` on 2026-09-12 and are recorded in plan v3 §0 finding 6.
- The hub's loopback bind and TLS-out-of-scope status were read from `src/index.js`'s header on
  2026-09-12.
- `main.js`'s per-user `userData` comment was read on 2026-09-12.
- D274's failure message is quoted from the P0.75/P1 handback, which recorded it from a real run.
- **No performance claim is made.** No estimate in this handover has been measured; P3a is small
  enough that none is offered.

---

## 6. Still the founder's

- **D271**, which gates P3b, P4 and P5.
- **Plan v3 question 8** — the resolution-code vocabulary, shipped as drafted, unreviewed against a
  real buyer.
- **OPEN-12** — how long a ticket record lives.
- **`demo-laptop-01`** — the revoked B3 test row, now correctly described by D272's copy.

**Note on the dev tenant:** `MD-1009` was moved back to `open` on 2026-09-13 because it was
`resolved` with no code and no notes — a state reached before D278 existed, grandfathered by 007's
`NOT VALID` CHECK. **No resolution was invented for it**; nobody ever worked it, and writing
requester-visible text describing a fix that did not happen is the one thing this ticket store must
never do. `MD-1008` is left `closed` without a resolution for the same reason: it is history, and
reopening it to give it one would be less true, not more.
