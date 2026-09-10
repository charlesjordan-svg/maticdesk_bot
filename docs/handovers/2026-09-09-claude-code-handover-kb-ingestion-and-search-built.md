# Claude Code Handover — 2026-09-09 — KB ingestion and search are BUILT, and both founder questions are ANSWERED

**Repo root:** `C:\Users\Charles\Downloads\maticdesk_bot`. **Branch:** `main`.
**Register:** `docs/decisions/DECISION-REGISTER.md` **v2.23**, D1–D229, next free **D230**.
**Answers:** `docs/handovers/2026-09-09-claude-code-handover-kb-ingestion-and-search.md` (all five tasks).
**Written by** the session that built it. Read `CLAUDE.md` first, then `PROJECT_START_HERE.md`, then this.

---

## 0. State, verified at the time of writing

| | |
|---|---|
| `server/` `npm.cmd test` | **366** assertions, 5 files, 0 failed, no database (was 323) |
| `server/` `npm.cmd run test:db` | **268** assertions, 3 files, 0 failed (was 193). Needs `npm.cmd run db:up` |
| Both suites | Run **twice** each, and the corpus is byte-identical afterwards (`node bin/kb.mjs status`: 6 / 18 / 18) |
| The console | `http://127.0.0.1:8787/admin` — Knowledge now has a real search and a real ingest. Document: `server/docs/B2-ADMIN-CONSOLE.md` **§10** |
| Driven in a browser | Yes, on 2026-09-09, on a throwaway hub on port 8799 with a throwaway tenant: a gap's search link followed, four searches read, four ingests posted (two refusals, one real, one no-op). All state removed afterwards |
| Dev database | Docker `matic-desk-db`; `control` at migration 003; tenant `devco` unchanged, 7 tickets, 3 admins |
| Corpus | **6 articles, 18 chunks, 18 embedded by `snowflake-arctic-embed2:568m`** — unchanged. Everything this pass ingested was removed by id |
| Retrieval log | **33 questions, 14 declined, still 0 with question text.** `MATIC_KB_LOG_QUERIES` has still never been on, and **stays off: D227 is deferred behind D229** (§2) |
| Uncommitted on `main` | the same two pre-existing edits to `client/scripts/start-elevated.ps1` and `tools/launchers/start-agent.ps1`, from before 2026-09-09. **Still not this pass's; leave them or ask Charles.** This pass's own work is uncommitted too — see §5 |

**No migration was written.** Nothing in this pass needed a schema change, and one thing that
arguably wants one is deliberately left as a warning rather than a `CHECK` — §2.

---

## 1. What is built, in one paragraph each

**Ingestion from the browser** (`POST /admin/knowledge/ingest`, `knowledge.write`). A textarea, not
a file picker: `readForm()` parses urlencoded only, there is no multipart parser, and D221 forbids a
dependency for one — the page says so, and a file upload is a second form here later rather than a
different design. One POST validates the bundle whole, writes, refuses a second embedding model,
embeds, and **reports every count**: articles inserted / updated / unchanged, chunks written out of
the bundle's total, chunks embedded, which model embedded them, and the corpus totals after.
Audited as `kb.ingest` with the counts and the model and **never the article text**; a rejected
paste is audited as `kb.ingest.refused` with the reason. The form-body ceiling went from 64 kB to
1 MB, because the generic bundle is 12.7 kB of JSON and ~35 kB once urlencoded — 64 kB would have
fitted that one bundle and refused the second real one.

**Search as the assistant searches** (`GET /admin/knowledge/search`, `knowledge.read`). Both legs
**unfused** plus the fusion, with each chunk's rank in each leg, the fused RRF score, a **"both"**
column, and a mark on the chunks `/v1/ask` would actually send. `src/admin/kb-search.js` composes
`lexicalLeg`, `semanticLeg` and `fuseRRF` and writes **no retrieval SQL of its own** — the console
has to be evidence about the endpoint, not a second implementation. The D207 / D203 / §5.16c caveats
are on the screen, **no threshold is drawn**, and the page reports how many chunks were eligible
under the platform pre-filter at all. Not audited, and `pages/knowledge.js` says why in a heading.

**The gap row links into it.** A gap **with** question text gets "Search the corpus for this" with
`q` and `platform` prefilled; a row without text gets nothing, and a session without
`knowledge.read` gets nothing. The answer form stays drawn and disabled — that is the editor's.

**One ingest for the console and the CLI** (**D228**). `ingestAndEmbed()` in `src/kb/ingest.js` is
called by both. `parseBundle(text, label)` is the shape check, so a pasted textarea and a file on
disk meet the same rules and the message names the offending article either way.
`embeddingModelConflict(status, model)` is the second-model refusal as a pure function.

**`node bin/admin.mjs reset <tenant> <email>`** (Task 5). New password, new authenticator secret,
printed once, on the **same row**; `totp_last_step` cleared; every live session revoked; audited as
`admin.reset`. It does not re-enable a disabled account.

---

## 2. THE TWO FOUNDER QUESTIONS — ANSWERED 2026-09-09, and NEITHER AS ASKED

Both were embedded in the previous handover as questions. Both were put to Charles when the build
was otherwise complete, and **neither came back as a yes or a no** — which is the argument for
having recorded them as decisions rather than resolving them in code. Register §5.24.

**D226 — chunk text on the search page: YES, NARROWED, and built the same day.** The page quotes the
text of the chunks `/v1/ask` would send, and of no others. **The narrower answer is better than the
one proposed:** the sent set is exactly the text that produced — or failed to produce — an answer,
which is the one question the screen exists to answer, so it is the smallest disclosure that answers
it, and D53 holds everywhere else. Every chunk below `DEFAULT_TOP_K` shows its ranks and its score
and no text; `node bin/kb.mjs legs` still prints all of it in a terminal.

**The narrowing is structural, and that matters more than the wording.** `src/admin/kb-search.js`
sets `sentText` only when the chunk was sent, **and strips `text` from the legs, the fusion and the
sent list before they leave the module** — so a page cannot render an unsent chunk's text by
forgetting a condition, because there is none in the view model to render. Four static assertions
and four live ones hold that shape (`admin-static` §5a, `admin-db` KB-4), and the live pair is
asserted from the search RESULT rather than from the markup, so an empty page cannot satisfy both.
**If you widen this, widen it in `kb-search.js` and change those assertions deliberately.**

**D227 — `MATIC_KB_LOG_QUERIES` on the dev and demo hubs: DEFERRED, behind a new D229.** Charles's
reasoning: the question is downstream of one nobody has answered, so turning it on first would
create a table of what employees typed with no rule for how long it is kept — and "we will decide
retention later" is how a log becomes permanent by default. **D229 is that retention policy** and it
is now the gate. **Do not re-litigate D227**; answer D229, and D227 follows from it in a line of
configuration.

**D229 is the cheapest open item in this project**, and worth putting in front of Charles early for
exactly that reason: nothing has been logged yet, so complying with any answer it gives needs no
migration and no deletion. What it has to say: how long a logged question is kept; what deletes it
(the control plane has no scheduled job); whether an answered gap keeps its question; and whether a
customer-hosted hub differs. What it does **not** have to settle: who may read one — D223 already did.

**The cost of the deferral is real and is stated where it lands.** The review queue's one live feed
keeps showing declines without their text, and this pass's "Search the corpus for this" link stays a
dead control on real data. That is a known, recorded cost — not an oversight, and not something to
fix by turning the switch on.

### For the record — the original D226 argument, as it was put

**Was it: may a matched chunk's TEXT be shown on the console's search results?**

- **For:** the page is rendered BY the hub, over loopback, to a session-authenticated admin holding
  `knowledge.read` — one who can already read every article, chunk and vector through
  `node bin/kb.mjs`. Without the text, a result says a chunk ranked #4 and cannot say why, which is
  half of the diagnostic the screen exists to provide.
- **Against:** D53 was written before the console existed, so "chunk text never leaves the hub" was
  never tested against a hub-rendered browser page; a page is screenshot-able in a way a terminal is
  not; and the corpus is cross-tenant (D45), so every tenant's admins would read every tenant's
  article text — which is *already* true of `bin/kb.mjs` and of the Knowledge page's article list.
- **How it was answered:** neither of those, but the narrowing above — which is why the question was
  worth asking rather than deciding from the arguments. The "against" column was not overruled; it
  was answered by making the disclosure small enough that it no longer applies to most of the
  corpus.

---

## 3. What running it found — read this before trusting anything about ingestion

The previous handover's ledger said `ingestBundle()`'s behaviour on a partially-invalid bundle had
never been exercised. It was exercised first, against a live database, before the error page was
designed. Four findings, all now covered by assertions:

1. **Validation covers the whole bundle before the first write.** A bad `type` on the *second* of two
   articles leaves the corpus untouched. Good news, and it was not a certainty.
2. **`migrations/control/002-generic-kb.sql` has NO `CHECK` on `platform`.** An article stamped
   `Windows 11` is written, indexed, embedded — and **matched by nothing**, because `platformClause()`
   compares the column to `'any'` or to the probe's exact word, and `windows 11` is a value no
   machine can ever ask for. It is legal, it is invisible, and it looks correct on the Knowledge page
   and in `kb:status`. **Reported at ingest as a warning** (`bundleWarnings()`, "RETRIEVED BY
   NOTHING") **and not refused**, because enforcing it is a migration and therefore a decision.
   **That decision is open and unnumbered.** If you take it, `RETRIEVABLE_PLATFORMS` in
   `src/kb/ingest.js` is the list, and a `CHECK` would have to cope with the corpus as it stands.
3. **The ingest report had the defect it exists to prevent.** It said "5 chunks written" beside "0
   inserted, 0 updated", because `upsertArticle()` returns an *unchanged* article's existing chunk
   count. Split into `chunksWritten` and `chunksInBundle`. Found by reading the page after a
   re-ingest — not by a test, which is the point.
4. **One backtick inside the stylesheet's own comment ended the template literal** and broke every
   page in the console. `src/admin/html.js`'s CSS is a JS template string. The comment now says so.
   Same class as the traps in `CLAUDE.md`: it failed loudly and instantly, which is the lucky half.

---

## 4. Traps and constraints specific to this area

- **The KB is control-plane and cross-tenant (D45), so it has NO test namespace.**
  `test/admin-db.test.mjs` ingests articles whose ids start `b2test-` and **deletes them by id** in
  teardown; dropping its tenant would not touch them. If you add a live KB test, do the same.
- **`test/admin-db.test.mjs`'s stub embedder borrows the corpus's own model name.** That looks
  dishonest and is the only safe choice: `embedPending()` re-embeds every chunk whose model differs
  from the current embedder's, so a stub with its own name would either be refused (and the happy
  path untestable) or would overwrite the **real** corpus's 18 vectors with stub ones. The
  second-model refusal is tested by temporarily setting a different name, which by construction
  cannot write anything. The file says all of this at the top; do not "fix" it.
- **One sign-in per account per test file.** A TOTP code is single-use inside its 30-second step,
  and a second `login()` for the same account in the same step is refused — **which looks exactly
  like a permission bug.** Eleven assertions failed this way while this pass was written. Reuse the
  client; §KB-6's comment says so.
- **`ctx.maxFormBytes`, not an import.** `src/admin/route.js` exists so pages and the router do not
  import each other in a circle. A page needing a router constant gets it on `ctx`.
- **Do not put registration marks on search results** (D225). They stay reserved for the gap card
  and the honest stub. The only new CSS this pass added is `.cols`.
- **Do not draw a threshold, floor or "good match" line on the search results** (§5.16c). If a
  relevance signal is ever wanted, the semantic leg's raw cosine (shown on the leg) or explicit leg
  agreement (the "both" column) are the two candidates, and both are new mechanisms needing a
  decision.

---

## 5. Not done, and what I would do next

**Nothing in this pass is committed.** `git status` shows the source and doc changes on `main`,
alongside the two pre-existing `.ps1` edits that are not this pass's. Committing is the first thing
to do, and `main` is the branch the previous pass merged to — **check with Charles whether this
wants a branch** before pushing.

In rough value order after that:

1. **Put D229 in front of Charles** (§2) — the retention policy for logged question text. It is the
   gate on D227, which is the gate on the review queue's whole value, and it is the cheapest thing
   on this list to answer because nothing has been logged yet. D226 is done and built.
2. **The article editor, and with it the markdown sanitiser decision.** It gates the editor, the
   review queue's answer form, and `raw()` staying unused. It is either "write one" or "take the
   first dependency since `pg`", and it is a decision, not a task. Everything downstream of the
   review queue is behind it.
3. **A file upload for the ingest form**, if anyone wants it: a small multipart parser in
   `src/admin/`, and a second form on the Knowledge page. Not urgent — the textarea works and the
   CLI takes a path.
4. **The `platform` `CHECK`** (§3 item 2), or a deliberate decision to leave it as a warning.
5. **Session outcomes (D89/D90/D188)**, which is what the other three review feeds need. Unchanged
   from the previous handover.

---

## 6. Honesty ledger

- **Both founder questions were asked and answered, and neither answer was one of the options as
  framed.** D226 came back narrower (sent chunks only) and D227 came back as "answer retention
  first". That is the case for putting a question in the register instead of picking the
  conservative side and moving on: two of two would have been wrong, one in each direction — chunk
  text withheld where it is useful, and a switch left off for the wrong reason.
- **D229 is a decision I created rather than one Charles asked for.** He said to record D227 as
  deferred behind a retention decision; giving that decision an ID, a scope and a forcing reason is
  my reading of what "record it so the next session does not re-litigate it" means in this
  register's own convention. If he wanted a note rather than a numbered row, D229 is the thing to
  change.
- **Retrieval quality is still not measured and this pass did not measure it.** Six articles, no
  cross-encoder reranker (D207), a dev embedder that is not D199's model (D203). The new screen
  makes retrieval *legible*; every ordering on it is still a floor, and the screen says so.
- **Nothing is timed.** No ingest duration, no search latency, no embedder throughput. The ingest of
  a two-article bundle felt instant and that is not a measurement.
- **The gap search link has never been exercised on real data**, because no logged decline has its
  question text. It was verified against a row inserted on purpose (removed afterwards) and is
  asserted in the live suite against a row the suite creates.
- **The browser click-through used a throwaway tenant and a throwaway hub on port 8799**, not
  `devco` on 8787, because this session has no credentials for the real dev admins and cannot type a
  password into a form. Every row it created was removed; `kb:status` and the tenant list are back
  where they started. **Charles has not clicked these screens** — `server/docs/B2-ADMIN-CONSOLE.md`
  §7 item 6 is the list, and it now names the numbers to expect.
- **I changed `bin/kb.mjs ingest`'s behaviour**, not only the console's: it now refuses the embed
  step where it would previously have re-embedded the whole corpus to the new model. That is
  consistent with CLAUDE.md's Never list and it is a behaviour change to a command Charles runs.
  `reembed` is unchanged and is the escape hatch.
- **`MAX_FORM_BYTES` is now 1 MB for every console form**, not only the ingest. It is the only
  backstop against an unbounded read in the hub process, and it is 16× looser than it was.
- **`readForm()` still never resolves if a client aborts mid-body.** Pre-existing, unrelated to this
  pass, noticed while reading it, and left alone rather than fixed speculatively.
- **A search is not audited.** That is a deliberate decision with a stated reason, not an omission —
  but it *is* a decision made by this pass without asking, on the argument that every other audited
  read names a person and a corpus search names nobody. If Charles disagrees it is one line.
