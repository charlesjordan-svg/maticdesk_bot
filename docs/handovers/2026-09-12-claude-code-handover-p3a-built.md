# Handback — ticket lifecycle P3a, built: the requester-safe read shape

**Date:** 2026-09-12 (evening, Pacific; the handover is dated 2026-09-13)
**Answers:** `docs/handovers/2026-09-13-claude-code-handover-p3a-requester-safe-reads.md` §0, §1, §3, §4 —
**P3a only.** §2 (P3b — the credential and the transport) is **GATED on D271 and was not started**;
nothing in this pass touches a route, the client, enrollment, or the Agents page.
**Follows:** `docs/handovers/2026-09-12-claude-code-handover-ticket-lifecycle-p2-built.md` (D278–D280).
**Register:** `docs/decisions/DECISION-REGISTER.md` §5.56 — **D281**, PROPOSED. Register at v2.54,
D1–D281; next free is **D282**. **D269's ratified condition is discharged** (its row says so).
**Commits, in the handover's order:** `756ad74` (the allow-list test, **RED ON PURPOSE**), `98f7ea0`
(the two readers), then this document and the register.
**Assertions:** headless **607** across 6 files (was 592); db **517** across 3 (was 498).

---

## 0. What was done, in one paragraph

The handover's premise checked out against the working tree: `getTicket()` does `SELECT t.*`, and
`summary`, `what_was_checked` and `internal_resolution_note` come back with it — the console's
shape, and the right one for the console. The test that pins a requester's shape was written first
and watched fail on the missing export: fourteen headless failures and two live ones, every other
file green. Then `getTicketForRequester()` and `listEntriesForRequester()` were added to the one
query layer — eleven named columns, never `t.*`, never a spread, scoped to the requester's OS
username in the WHERE clause, the public timeline with its visibility argument fixed and the
ownership check first — and the test went green. A twenty-first column was added to `tickets` by
hand to prove the classification fails closed; it did, naming the column, and the probe was
reverted. Nothing calls either function: the route is P3b's, and P3b waits on D271.

---

## 1. Exit criteria — handover §1.3, in order

| # | Criterion | Result |
|---|---|---|
| 1 | The allow-list test **fails before `getTicketForRequester()` exists** and passes after; both runs recorded | **Yes.** `756ad74`, headless: `FAIL  getTicketForRequester() is exported from the one query layer (D224)` and thirteen more, `192 passed, 14 failed`, `SUMMARY — 5/6 file(s) passed`. Live, same commit: `FAIL  getTicketForRequester() and listEntriesForRequester() exist in src/tickets/query.js`, `356 passed, 2 failed`. From `98f7ea0` on: `206 passed, 0 failed` / `372 passed, 0 failed`. **This discharges D269's ratified condition** — written first, seen failing, given a register ID, before any requester route exists. |
| 2 | The requester shape omits `summary`, `whatWasChecked` and `internalResolutionNote` **for a ticket that has all three populated** | **Yes.** `admin-db` §5e files a ticket with `CASE-NOTE-SENTINEL…`, `CHECKED-SENTINEL…` and `INTERNAL-NOTE-SENTINEL…` in the three fields, confirms `getTicket()` returns all three, then asserts the requester object's JSON contains no `SENTINEL`, that its keys are exactly the eleven, and that the reporter's name, location, contact, routing and uuid are absent too. |
| 3 | `listEntriesForRequester()` cannot return an internal entry, **on a ticket that has one** | **Yes.** The same ticket carries a work note (`WORK-NOTE-SENTINEL…`, internal) among four entries; the requester gets three, all public, no work note, no sentinel on the wire. Another OS user gets `[]` for the same reference — public rows included. |
| 4 | Adding a column to `tickets` and not to the allow-list **fails** the test; proven by hand, reverted | **Yes.** `ALTER TABLE "<schema>".tickets ADD COLUMN p3a_probe text` inserted before §5e's `information_schema` read: `FAIL  tickets: every one of its 21 columns is on the requester-visible list or the hidden list — a column on neither FAILS (the allow-list fails closed) unclassified: p3a_probe`, `371 passed, 1 failed`. The probe line was reverted with `git checkout` and is in no commit. |
| 5 | Both suites green, counts up | **Yes**: 607 / 517. |

---

## 2. What was built

### 2.1 The test — commit one, alone, red

**`test/admin-static.test.mjs` §5f** (headless, every `npm test`). `REQUESTER_VISIBLE` — eleven fields,
one reason each: `reference`, `state`, `category`, `machineName`, `createdAt`, `updatedAt`,
`resolutionCode`, `resolutionNotes`, `resolvedAt`, `closedAt`, `closedBy`. Asserts the exports
exist; extracts the returned object literal from `getTicketForRequester()` and requires its keys to
equal the list exactly; requires the object never to name `summary`, `whatWasChecked`,
`internalResolutionNote`, `suggestedOwner`, `sessionId`, `description` or any profile field; reads
the SELECT and requires no `t.*`, no spread, and no column off the list; requires the WHERE to scope
by `u.os_username`; requires the identity to be explicit and to throw when absent; requires **no
device argument** and a header that says why; requires `listEntriesForRequester()` to take no
visibility parameter, to call `listEntries()` with `"public"` fixed, and to check ownership first;
requires `getTicket()` to keep `SELECT t.*` and to point at the requester function; and requires
**nothing to call either function** — with the retirement instruction in the label.

**`test/admin-db.test.mjs` §5e** (live). Classifies every column `information_schema` lists for
`tickets` — twenty today — as `REQUESTER_VISIBLE` (column → field) or `REQUESTER_HIDDEN` (one reason
each: `id`, `user_id`, `session_id`, `description`, `summary`, `what_was_checked`, `suggested_owner`,
`internal_resolution_note`, `awaiting_agent_since`); a column on neither fails, both lists must name
real columns, none may be on both. Then the populated-ticket checks above, plus: another OS user →
`null`; unknown reference → `null`; no identity or a blank one → throws naming `osUsername`; a
`visibility` key passed to the entries reader changes nothing. **The import is dynamic** so a missing
export fails these checks rather than the file — the red run reported, it did not crash.

### 2.2 `src/tickets/query.js` — commit two

- `getTicketForRequester(schema, reference, { osUsername })` — eleven named columns, `JOIN users`,
  `WHERE t.reference = $1 AND u.os_username = $2`. Returns `null` for no such ticket **and** for
  someone else's: this layer is not an existence oracle. Throws without an identity.
- `listEntriesForRequester(schema, reference, identity)` — `getTicketForRequester()` first, then
  `listEntries(schema, reference, { visibility: "public" })` with the literal fixed. `[]` otherwise.
- `getTicket()` unchanged in shape; a four-line comment above its SELECT says it is the console's
  shape and where the requester's is (D281).
- The file header gains a paragraph: the requester's readers live here too, are called by nothing,
  and §5f fails the day something calls them before D271 is answered.

### 2.3 Decided beyond the handover, and why (§5.56a)

- **No `deviceKeyId`.** The handover's §1.2 asks for "an explicit `osUsername` + `deviceKeyId`
  pair". `tickets` has no device column (D75: `session_id` nullable, and the endpoint has no
  session), so a `deviceKeyId` parameter would have matched nothing — a check that cannot fire,
  which is the shape D267's guard 2 was found in on 2026-09-12. The function header says so and the
  test requires the absence. When P3b gives a ticket a device to match, the column and the clause
  arrive together.
- **One identity object, not two positional arguments**, so P3b adds a field without touching a
  caller's arity.
- **`description` is hidden**, because the handover's allow-list "as drafted" omits it. The
  requester wrote it; whether P4's view echoes it back is P4's call and one line in two lists.
- **Ownership before public rows.** The handover's `listEntriesForRequester()` was "`listEntries`
  with the argument fixed". Fixed visibility alone would have let any requester read any ticket's
  public timeline — the resolution notes for someone else's problem — so the ownership check comes
  first and the test asserts `[]` for another OS user.
- **The "called by nothing" assertion is deliberate and temporary**, in the shape of D272/D273's
  conditions: it fails the day a route calls the reader, and its label says to retire it in the same
  commit and let the handover's P3b exit criterion 1 (the allow-list holds against the live route)
  take over. It exists so a route cannot be wired before the decision it depends on.

### 2.4 Not built (handover §1.4, §2)

No routes. No client change. No enrollment, no credential, no transport, no `last_seen_at` writer,
no revocation enforcement, no tenant-from-credential. `getTicket()`'s shape untouched. D274's
detector untouched; the Agents page copy untouched — the client still does not enrol. **P3b is
gated on D271 and its three-answer table stands in the handover §2.1; nothing here picks one.**

---

## 3. Verification

- **Red, then green, both recorded** — §1 row 1; the commit messages carry the output.
- **Live, against a real tenant**: the populated-ticket checks, the other-user null, the throws,
  the public-only timeline — `admin-db` §5e, inside the suite's own `b2-test-*` tenant, removed in
  teardown.
- **Exit criterion 4 by hand**: the probe column, the FAIL naming it, the revert — §1 row 4.
- **The dev tenant was read, not moved**: `bin/tickets.mjs list` against `t_devco` shows ten
  tickets, `MD-1009 open` and `MD-1008 closed` as the handover's note describes; 8 new, 1 open,
  0 resolved, 1 closed. No dev ticket was touched by this pass.
- **Not run through a route** — there is none. **Not looked at in a browser** — nothing renders it.
- **No performance claim.** The entries reader makes two round trips; unmeasured, and the second
  is the shared reader on purpose.
- **The handover's date** is 2026-09-13; the work was done 2026-09-12 Pacific, and the register and
  this file say 2026-09-12.

---

## 4. Next, and whose

**P3b, P4 and P5 wait on D271** (deployment topology — Charles's). When it opens, the P3b handover
should say that D269's condition is **already discharged** by `756ad74` rather than asking for a
second red test, and its first act is to retire §5f's "called by nothing" line in the commit that
adds `GET /v1/tickets`. **Charles's, not blocking:** the resolution-code vocabulary (plan v3
question 8); OPEN-12; `demo-laptop-01`. **Sunday 2026-09-13** is the team's voice review (§5.49),
unrelated to this slice.
