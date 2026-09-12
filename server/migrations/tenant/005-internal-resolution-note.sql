-- Tenant 005 — the close note gets its real name, and 004's description of it is retracted.
--
-- DECISION PROVENANCE (register §5.7b). Status is the status held WHEN THIS MIGRATION WAS WRITTEN.
--   D269 (PROPOSED 2026-09-12) — `close_note` is renamed `internal_resolution_note`, and every
--     column of the ticket store has code that names it or an entry on a reserved list the test
--     suite reads (test/admin-db.test.mjs §5c, test/admin-static.test.mjs §5c).
--   D239 (DECIDED 2026-09-10) — why the column exists at all: the human's own account of what fixed
--     it needs somewhere to land, on the record whose author writes it. Unchanged by this file.
--   D224 (ratified 2026-09-09) — one query layer; the CLI and the console read the same SQL, so the
--     rename is one line in src/tickets/query.js and both readers follow it.
--
-- WHAT tenant/004 SAID, AND WHY IT IS RETRACTED HERE RATHER THAN EDITED THERE
--
-- 004's close_note block ends: "The console's state form offers it as an optional field when
-- moving to resolved or closed; nothing reads it yet except the ticket's own detail page and the
-- CLI." When that was written, and for the two days after, ALL THREE CLAUSES WERE FALSE: the form
-- had no field, the page did not render the column and the CLI did not print it. The docblock on
-- setTicketState() in src/tickets/query.js said the same thing. A column with no writer and no
-- reader, documented as having both — the defect this project has shipped three times before
-- (D213's surfaces, D253's card, 700d920), this time in a migration comment. Found 2026-09-12 by
-- the ticket-lifecycle plan's review, fixed the same day: the form has the field, statePost() and
-- `bin/tickets.mjs state --note` write it, the detail page and `show` read it, and
-- test/admin-db.test.mjs §5 drives the round trip against a real server.
--
-- 004 is NOT edited to say so. The migration runner stores a checksum of the WHOLE file, comments
-- included, and refuses to run against any tenant whose ledger holds a different one
-- (src/db/migrate.js: "an applied migration must not be edited - write a new one"). Rewriting the
-- paragraph would have stopped every existing tenant from migrating — a worse outcome than a stale
-- paragraph with a retraction one file along. So 004 stays byte-for-byte (test/db-static.test.mjs
-- pins its checksum), and THIS file is the one that describes the world.
--
-- WHY THE RENAME
--
-- ServiceNow's REQUESTER-FACING resolution text is the field named `close_notes` (IBM's integration
-- docs: "Resolution Notes field (table field name: close_notes)"). Ours holds the INTERNAL account —
-- the KB draft loop's eventual input (D168/D239), never shown to the requester. Keeping the
-- industry's name with the opposite visibility is a trap for the next engineer, for D85's
-- system-of-record mapping and for any ServiceNow adapter; the lifecycle plan's P2 adds a
-- requester-visible `resolution_notes` beside this column, and then the two names must not be
-- confusable. It is free to rename while nothing reads it. It is never cheaper than today.
--
-- IDEMPOTENT BY HAND. `ALTER TABLE … RENAME COLUMN` has no IF EXISTS. The B1 runner applies this
-- file to every tenant schema, one of which may be mid-flight, so the guard asks pg_attribute two
-- questions: is the old name present, AND is the new name absent. Both true -> rename. Already
-- renamed -> no-op. A schema created after this file runs 004 (adds close_note) then this (renames
-- it) in the same migration run, and lands in the same place. Same shape as 003's pg_constraint
-- guard, for the same reason. test/db.test.mjs §4 runs this file's SQL a second time against a
-- migrated tenant and asserts nothing changed, then puts close_note back and asserts it renames
-- forward.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute
              WHERE attrelid = (current_schema() || '.tickets')::regclass
                AND attname = 'close_note' AND NOT attisdropped)
     AND NOT EXISTS (SELECT 1 FROM pg_attribute
              WHERE attrelid = (current_schema() || '.tickets')::regclass
                AND attname = 'internal_resolution_note' AND NOT attisdropped)
  THEN
    ALTER TABLE tickets RENAME COLUMN close_note TO internal_resolution_note;
  END IF;
END
$$;
