# Handback — ticket lifecycle P2, built: resolution means something

**Date:** 2026-09-12
**Answers:** `docs/handovers/2026-09-12-ticket-lifecycle-plan-v3.md` §3, §6.1, §7.1–§7.4 and its §8
row **P2**, on Charles's *"Start P2"*. No separate handover existed for this phase; the plan's row and
the P0 handover's §6 sketch (`docs/handovers/2026-09-12-claude-code-handover-ticket-lifecycle-p0.md`)
were the specification.
**Follows:** `docs/handovers/2026-09-12-claude-code-handover-console-honesty-and-p1-built.md` (D272–D277).
**Register:** `docs/decisions/DECISION-REGISTER.md` §5.55 — **D278** (code + notes, refused without
both), **D279** (`closed` terminal in the console; offered only from `resolved`), **D280** (the guard
in the UPDATE), all **PROPOSED**. Register at v2.53, D1–D280; next free is **D281**. The plan's
"D246"/"D247" are void (§5.53a) and are D278/D279 here.
**Commit:** `01e5b12` — one commit for the three, then this document and the register.
**Assertions:** headless **592** across 6 files (was 562); db **498** across 3 (was 462).

---

## 0. What was done, in one paragraph

`resolved` now means something. Reaching it takes a resolution code (one of six, a CHECK) and
resolution notes written for the requester, through one function, `resolveTicket()`, which refuses
with a sentence naming what is missing — from the console's new Resolve form and from
`bin/tickets.mjs resolve` alike — and `setTicketState()` refuses `resolved` as a target so the CLI's
any-state correction cannot make a code-less resolved ticket either. The database holds the rule too.
`closed` is terminal in the console and is offered only from `resolved`, so every ticket the console
closes carries a code. The transition guard moved into the UPDATE: both forms carry the state the
operator saw, the POST handlers read nothing before writing, a stale form gets a 409 naming where the
ticket is now, and a two-operator race was run and lands exactly once. Every label beside the
requester-visible notes says nobody sees them in this build.

---

## 1. Exit criteria — plan v3 §8, row P2, in order

| # | Criterion | Result |
|---|---|---|
| 1 | Moving to `resolved` without code **and** notes is refused **with a sentence, not a constraint violation** | **Yes.** Console: code and no notes → 400 *"MD-… cannot be resolved without resolution notes the requester will read (D278). Nothing was changed."*; code outside the six → 400 naming the six; neither → both clauses joined with "and". State form `next=resolved` → 400 *"Resolving takes more than a state."* CLI: `state <ref> resolved` → exit 1 with the pointer to `resolve`; `resolve --code fixed` with no `--resolution` → exit 1, the same sentence. All three console refusals audited `ticket.resolve.refused` with the code (or null) and whether notes were given — never text. **Run against `t_devco`'s `MD-1000`** too (both CLI refusals; the ticket stayed `new`). |
| 2 | `closed` offers no console forward move; the CLI still moves it | **Yes.** The closed page draws no form and says *"Closed is terminal in this console (D279)"*, naming the CLI; `POST closed → open` from the console → 400 *"closed is terminal here"*. `bin/tickets.mjs state <ref> open` reopens it, clearing `closed_at`/`closed_by` and the current resolution. |
| 3 | The transition guard is in the `UPDATE`, **proven by a concurrent-move test** | **Yes.** `… WHERE t.id = prev.id AND ($n::text IS NULL OR t.state = $n::text)` in both writers. `admin-db` §5d: two concurrent `setTicketState(…, "open", { from: "new" })` on a fresh ticket — exactly one lands, exactly one is refused with *"… is open now, not new: someone moved it after that state was read"*, one `state_change` entry, the winner's internal note on the row. Stale console forms (state and Resolve) → 409, audited `why: "stale"`. |
| — | Both suites green, counts up | **Yes**: 592 / 498. Re-running 007 against a migrated tenant is a no-op (`db.test` §4 snapshots columns and constraints, runs the SQL again, compares; `npm run migrate` twice on the dev database: `applied 1`, then `nothing to apply`). |

---

## 2. What was built

### 2.1 `migrations/tenant/007-resolution.sql`

`resolution_code`, `resolution_notes`, `resolved_at`, `closed_at`, `closed_by`. Three guarded CHECKs:
the six codes; four closers (`requester`, `auto`, `console_user`, **`system`** — the CLI, so a closed
ticket never lies about who closed it); and `tickets_resolved_has_resolution` (`state <> 'resolved'
OR (code AND notes)`), **`NOT VALID`** so a tenant holding an older code-less resolved ticket still
migrates while every new write is bound. `db.test` §4 proves all three refuse what they exist to
refuse and accept a row carrying both. The header puts the two notes side by side.

### 2.2 `src/tickets/query.js`

- `RESOLUTION_CODES` (frozen, six) and `RESOLUTION_CODE_WORDS` — the gloss shared by the console and
  the CLI so one code cannot be worded two ways (D244).
- `resolveTicket(schema, ref, { code, notes, note, author, from })` — the one way to `resolved`.
  Validates first, writes nothing on refusal; otherwise the row, a public `state_change` entry and a
  public `resolution` entry with the notes as its body, in one transaction. `WRITABLE_KINDS` gained
  `resolution`; `comment` is still refused (P4).
- `setTicketState()` refuses `resolved`; takes `from`; clears the current resolution on a move to a
  live state; stamps `closed_at`/`closed_by` on `closed` and clears them on the way out.
- `staleOrMissing()` — when a guarded write matched nothing: null for no ticket, else `{ refused,
  state }` naming where the row is now.
- `NEXT_STATES`: `new → open, resolved`; `open → resolved`; `resolved → closed, open`; `closed → []`.

### 2.3 Console and CLI

The state select never offers `resolved`; from `open` the page says the one move is to resolve. The
Resolve form — code (glossed, required), notes (required), the internal note beside them, hidden
`from` — is drawn only where `NEXT_STATES` offers `resolved`, and says *"Requester-visible — and
delivered to nobody in this build."* The Resolution block on the detail page glosses the code, renders
the notes under *"requester-visible, delivered to nobody yet"*, and shows `Closed <when> by <words>`.
The flash after resolving: *"Resolved. The requester has NOT been told."* `statePost()` and
`resolvePost()` read nothing first. Audits: `ticket.resolve { from, code, noted }`,
`ticket.resolve.refused { from, code|null, notesGiven }`, `ticket.state.refused { …, why: "stale",
now }`. CLI: `resolve <ref> --code <code> --resolution "…" [--note "…"]`; `show` prints the
resolution glossed and says nobody sees it yet; `state` handles a refusal by printing it and exiting 1.

### 2.4 Decided beyond the plan (§5.55c)

`closed_by` has four values. A reopen clears the CURRENT resolution columns; the timeline keeps the
history. The console never closes a live ticket — the resolution is the "reason". A work note on a
closed ticket is still allowed.

### 2.5 Not built (§5.55d)

Nothing requester-facing; no `getTicketForRequester()`, no denylist test (D269's condition stands:
written first, seen failing, before any requester route — that is P3's first commit); no
`confirmResolution()`/`reopenTicket()` (P4); no `reopened_from`; no `ticket.autoclose` (P5). The
resolution-code vocabulary is shipped as drafted; plan v3's question 8 is still Charles's.

---

## 3. Verification

- **Live, against the real server**: every refusal, the resolve round trip on page and CLI, the stale
  409s, closed as terminal, the CLI's correction and resolve, the race — `admin-db` §5 and §5d.
- **Live, against the dev database**: `npm run migrate` twice; two CLI refusals on `MD-1000`, which
  was **not moved**.
- **Not looked at in a browser** by a person this pass. Rendered and asserted over HTTP.
- **No performance claim.** The race is a correctness check, not a measurement.
- **One inherited assertion moved** (§5.55e): the auditor pass assumed the newest ticket was still
  `open`; it now compares the state before and after its forbidden POST.

---

## 4. Next, and whose

**P3 onward waits on D271** (deployment topology — Charles's). When it opens, P3's first commit is
the denylist test, red, per D269's condition. **Charles's, not blocking:** the resolution-code
vocabulary (question 8); `demo-laptop-01`; OPEN-12. **Sunday 2026-09-13** is the team's voice review
(§5.49), unrelated to this slice.
