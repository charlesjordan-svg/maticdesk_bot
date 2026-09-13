# Handback — P0.75 (console honesty) and P1 (the timeline, work notes only), built

**Date:** 2026-09-12
**Answers:** `docs/handovers/2026-09-12-claude-code-handover-console-honesty-and-p1.md`, against
`docs/handovers/2026-09-12-ticket-lifecycle-plan-v3-addendum-console-honesty.md` and
`docs/handovers/2026-09-12-ticket-lifecycle-plan-v3.md` §7.1–§7.4.
**Follows:** `docs/handovers/2026-09-12-claude-code-handover-ticket-lifecycle-p0-built.md` (D269–D271).
**Register:** `docs/decisions/DECISION-REGISTER.md` §5.54 — **D272–D274** (P0.75), **D275–D277** (P1),
all **PROPOSED**, and **OPEN-12** (ticket record retention). Register at v2.52, D1–D277; next free is
**D278**. **The handover's "D244/D256" for P1 were void** (§5.53a); they are D275 and D276 here.
**Commits, in the handover's order:** `b672a05` (D272), `518621a` (D273), `c5769ca` (D274),
`0d45b62` (D275 + D276 + D277 — one commit, §2.6 says why), then this document and the register.
**Assertions:** headless **562** across 6 files (was 513); db **462** across 3 (was 432).

---

## 0. What was done, in one paragraph

Every fact in both handovers checked out against the working tree: no file under `client/src` calls
`/v1/enroll`; `last_seen_at` on devices has three writers, all in `enrollment.js`; nothing checks
device identity on a call. The Agents page now says, above the fold, that no endpoint enrolls itself
and its counts are not a fleet; its "Last seen" column is "Last enrollment activity" with a
not-a-heartbeat note; the Revoke control says it blocks nothing; and a test renders the page and pins
all of that to `client/src`'s behaviour — proven to fail, loudly and with the right message, when the
search is pointed at a tree that does call the route. Then `ticket_entries` landed with visibility
decided by kind and enforced by the database, `listEntries()` with no default, one composer (work
note, internal), a state-change entry per move, the CLI printing the same rows through the same
function, the age-not-count indicator on both ticket screens saying why it is empty, and retention
decided in the migration header. Both suites green; the dev database migrated; a second `migrate` is
a no-op.

---

## 1. P0.75 — exit criteria, in the handover's order (§1.3)

| # | Criterion | Result |
|---|---|---|
| 1 | The Agents page's **first screen** carries the never-enrolls caveat, checked by rendering | **Yes.** `agentsBody()` is exported and pure; `admin-static` §6a renders it with fake rows and asserts the caveat sits after `class="grid"` and before the first `<div class="panel">`. `admin-db` fetches the real page over HTTP and asserts the same position. |
| 2 | The column no longer says "Last seen"; the muted note is present | **Yes**, both suites: `<th>Last enrollment activity</th>`, no "Last seen" anywhere in the rendered HTML, and the note under the table. |
| 3 | The revoke caveat sits next to the revoke control | **Yes**: `Revoke selected</button>` followed by the span. Also asserted on a read-only role's page, where there is no button but the REVOKED pill is still shown. |
| 4 | D274 passes today, and **flipping it by hand** makes it fail with the "revisit the copy" message | **Yes, both directions.** As the tree stands: `173 passed, 0 failed`. With `CLIENT_SRC` pointed at `server/src`: `139 passed, 1 failed` — `FAIL  THE CLIENT NOW ENROLLS (admin/pages/agents.js, index.js) — D272/D273's copy is FALSE and must be revisited: the never-enrolls caveat, the 'Last enrollment activity' heading and its not-a-heartbeat note, and the revoke-blocks-nothing sentence in src/admin/pages/agents.js. Give last_seen_at its real writer (addendum G2), let revocation mean revocation, then rewrite this block for the new premise.` Reverted. |
| 5 | Both suites green, counts up | **Yes**: `admin-static` 137 → 151 after D274 (→ 173 after P1); `admin-db` 296 → 301 (→ 322). |

### 1.1 Found while building

- **The detector's first draft was vacuous.** I pointed its self-check at `src/devices`, where the
  route appears only in `route.js`'s header comment. Comments are stripped before the search, so it
  found nothing — and the check failed its own run. It now points at `server/src`, where `index.js`
  dispatches on the literal. The failure is the reason the check exists.
- **A string literal naming the route counts as a call.** Deliberate: a false positive is loud and
  read by a person; a false negative is silent. The flip proof shows both `index.js` (the real
  dispatch) and `agents.js` (the caveat's own `<span class="mono">POST /v1/enroll</span>`) being
  named — the second is why the copy, if the client ever enrolls, must be rewritten rather than
  patched.
- **`html\`\`` escapes apostrophes.** "row's" reaches the browser as `row&#39;s`; three regexes had
  to match the entity. Found by the test failing, not by reading.

### 1.2 Not done, by instruction (§1.4)

`notYet()` untouched. The page and counters kept. No client enrollment. No writer for `last_seen_at`.
The addendum's §6 offer to clean up `demo-laptop-01` (the revoked B3 test row in the demo tenant) was
**not** taken — it is Charles's call, and the row is now correctly described on the page.

---

## 2. P1 — exit criteria, in the handover's order (§2.5)

| # | Criterion | Result |
|---|---|---|
| 1 | A work note and a state-change entry render in the console **and** in the CLI, visibility labelled in both | **Yes**, `admin-db` §5 against the real server. The four earlier moves (three from the console form, one from `bin/tickets.mjs state`) each wrote a public `state_change` entry attributed to the console user's email or to `bin/tickets.mjs`; the work note posted from the console lands trimmed, internal, escaped on the page under *internal — the requester never sees this*, and `show` prints five lines: four `[public]`, one `[INTERNAL]  work note`. |
| 2 | A test proves `listEntries(visibility: 'public')` cannot return an internal row | **Yes**: four rows, none internal, no work note among them — while `"all"` returns five. Also: `listEntries()` with no visibility **throws** (*"no default, on purpose"*), `visibility: "internal"` throws (only `public` and `all` exist), and `addEntry({ kind: "comment" })` throws naming P4. |
| 3 | Re-running 006 against a migrated tenant is a no-op | **Yes.** `npm run migrate`: `t_devco 006-ticket-timeline, applied 1`; again: `nothing to apply`. `db.test` §4 snapshots the catalog (columns of both tables, `ticket_entries`' indexes and constraints), runs 006's SQL again, and compares byte for byte. |
| 4 | The no-orphan-columns test still passes, with `notified_at` / `read_by_requester_at` reserved | **Yes.** Both on `RESERVED_COLUMNS.ticket_entries` with a reason and D275 → P4. `awaiting_agent_since` needed no entry: `oldestUnansweredRequesterComment()` names it. |
| 5 | D256's indicator renders and says something true when there is nothing to show | **Yes** (as **D276**). Both ticket screens: *"Oldest unanswered requester comment: none. No requester can comment in this build — the panel has no ticket view and the hub has no comment route (P4, after D271). When one can, this line carries the age of the oldest comment nobody has answered, never a count."* |
| 6 | Both suites green, counts up | **Yes**: 562 / 462. |

### 2.1 The migration — `migrations/tenant/006-ticket-timeline.sql`

As specified in §2.1, plus two things the specification did not have:

- **Two CHECKs enforce the visibility rule in the database**: `kind <> 'work_note' OR visibility =
  'internal'` and `author_kind <> 'requester' OR visibility = 'public'`. `db.test` §4 proves both
  refuse a direct SQL insert. `query.js`'s `KIND_VISIBILITY` is the one write path; these are what
  hold if that map is ever edited.
- **Retention is decided, not deferred — D277.** The header considers mirroring D229 and refuses it
  with the reason: the KB question is incidental telemetry; a work note is the record, on a ticket
  whose `description` and `internal_resolution_note` have no sweep. Entries live and die with their
  ticket; nothing is swept; the record's retention as a whole is **OPEN-12**.

`db-static` §2b pins the provenance block (D275/D276/D277 PROPOSED, D269 RATIFIED), the CHECKs, the
indexes, `awaiting_agent_since`, the retention paragraph and the "why no requester-visible composer"
paragraph.

### 2.2 The query layer

- `KIND_VISIBILITY` frozen: `work_note → internal`; `comment`, `state_change`, `resolution → public`.
- **`WRITABLE_KINDS = ["work_note", "state_change"]`.** `addEntry()` refuses `comment` (P4) and
  `resolution` (P2). This is plan v3 finding 8 as a line the suite reads rather than a rule to remember.
- `listEntries(schema, ref, { visibility })` — required, no default, `"public"` or `"all"`; the
  public branch filters in SQL.
- `setTicketState(schema, ref, next, { note, author })` writes the `state_change` entry on the same
  client, inside the move's transaction. A move to the same state writes no entry.
- `oldestUnansweredRequesterComment()` reads `awaiting_agent_since`; nothing writes it (P4).
- `admin-static` §5's one-query-layer rule now covers `ticket_entries`; §5d pins all of the above.

### 2.3 The console and the CLI

Timeline panel on the detail page, newest last, each entry labelled in words. One composer, "Add
work note", `tickets.write`, CSRF, audited `ticket.worknote` `{ entry: <id> }` — never the body.
`?worknote=1` flash. The detail page's `notYet()` now names *requester* comments as the missing thing
and no longer claims the ticket cannot be commented on at all. `bin/tickets.mjs show` prints the
timeline; there is **no** CLI work-note command (the one composer is the console's), and the CLI
attributes its own state changes to `bin/tickets.mjs`.

### 2.4 What was decided beyond the handover

- **State changes are public entries.** The plan's §3 says the requester is told when the state moves;
  the entry exists now so P4 has something to deliver. The internal note is never copied into it.
- **A work note on a `closed` ticket is allowed** until P2 makes `closed` terminal in the console.
- **The CLI author is `system` / `bin/tickets.mjs`**, because no person is attached to a CLI call.

### 2.5 Not done, by instruction (§2.6)

No "Reply to requester" composer. No `comment` entries (refused). No resolution code or
requester-visible resolution note. No transition-guard move. Nothing requester-facing. No
`getTicketForRequester()`. D269's condition stands: the wire-level denylist test is written first
and seen failing before any requester route exists.

### 2.6 The one instruction that could not be followed as written

**§3 commits 4 and 5 — the timeline and the indicator as separate commits.** tenant/006 adds
`awaiting_agent_since`, and D269's no-orphan-columns test fails on a column that no store code names.
So the column and its one reader (`oldestUnansweredRequesterComment()`, D276) had to land in the same
commit as the migration, or commit 4 would have been red on the test that exists to catch exactly
that. One commit, `0d45b62`, both slices, the reason in its message.

---

## 3. Verification

- Everything in the handovers' §1.1 / §5 was **re-read from the working tree on 2026-09-12** before
  building: `client/src` searched for the enrollment route (no match, in code or comments),
  `server/src` searched for `last_seen_at` (three device writers in `enrollment.js`; `session.js`'s
  are the admin session's own column), `agents.js` read in full, the register header read for the
  next free ID.
- **Verified on a real HTTP server**: `admin-db` starts the hub on an ephemeral port and drives every
  page and POST above with a cookie jar and CSRF tokens. **Not verified in a browser** by a person
  this pass: the page was rendered and asserted, not looked at.
- **Run against the dev database**: `npm run migrate` twice (applied 1, then nothing); `bin/tickets.mjs
  state MD-1000 open` then `state MD-1000 new` and `show MD-1000` — the timeline prints both moves,
  `[public]`, attributed to `bin/tickets.mjs`. **MD-1000 is back in `new`.**
- **No performance claim is made.** Nothing in this pass is a measurement.
- The three test defects found by running (the vacuous detector, the escaped apostrophe, the
  `[public]` heading counted as an entry) are recorded in register §5.54b. None reached a commit.

---

## 4. Still blocked, still the founder's

**D271 — where the hub runs relative to the endpoint.** Unchanged and unchanged in importance: P3
(the credential, the writer for `last_seen_at`, revocation becoming real), P4 (delivery, the
requester's composer, the writer for `awaiting_agent_since`, `notified_at`, `read_by_requester_at`)
and P5 all wait on it. **P2 does not** — the resolution code, the requester-visible note, `closed`
terminal in the console and the transition guard into the `UPDATE` are unblocked and are the next
slice.

Two smaller things that are his: whether `demo-laptop-01` (a revoked B3 test row in the demo tenant)
is deleted or left with its now-correct description; and **OPEN-12**, the ticket record's retention.
