# Claude Code Handover — 2026-09-09 — the next engineering pass: KB ingestion and search in the console

**Repo root:** `C:\Users\Charles\Downloads\maticdesk_bot`. **Branch:** `main` — the admin console
(`b2-admin-console`) was merged on 2026-09-09; the merge commit is the tip.
**Register:** `docs/decisions/DECISION-REGISTER.md` v2.21, D1–D225, next free **D226**.
**Written by** the session that built the console, **for** the session that does the next pass.
Read `CLAUDE.md` first, then `PROJECT_START_HERE.md`, then this.

---

## 0. State, verified at the time of writing

| | |
|---|---|
| `server/` `npm.cmd test` | **323** assertions, 5 files, 0 failed, no database |
| `server/` `npm.cmd run test:db` | **193** assertions, 3 files, 0 failed (needs `npm.cmd run db:up`) |
| The console | `http://127.0.0.1:8787/admin` — built, clicked through by Charles, wearing the Industry design system with self-hosted Barlow (D221–D225). Document: `server/docs/B2-ADMIN-CONSOLE.md` |
| Dev database | Docker container `matic-desk-db`; `control` at migration 003; one tenant `devco` (`t_devco`) with seven tickets MD-1000…MD-1006 and three admins (`owner@devco.test`, `auditor@devco.test`, `charles.jordan@maticdesk.com`) |
| Corpus | 6 articles, 18 chunks, all embedded by `snowflake-arctic-embed2:568m` (the DEV embedder, D203 — not D199's model) |
| Retrieval log | 33 questions, 14 declined, **0 with question text** — `MATIC_KB_LOG_QUERIES` has never been on |
| Uncommitted on `main` | two pre-existing edits to `client/scripts/start-elevated.ps1` and `tools/launchers/start-agent.ps1` from before 2026-09-09. Not this pass's; leave them or ask Charles |

**Founder decisions taken on 2026-09-09 that shape this pass:** a declined question is a gap
record readable by any admin with `review.read`, not a D154 transcript (D223); the console and the
CLI share one ticket query layer (D224); the console wears the Industry design system and its fonts
are self-hosted, never fetched (D225).

## 1. What this pass is

**Make the Knowledge destination real.** Today it shows the corpus (real counts) and two honest
stubs. After this pass an admin can (a) put an article bundle into the corpus from the browser and
see exactly what landed, and (b) search the corpus the way the assistant searches it, seeing what
came back and why. The review queue's gap rows then link into that search.

The handover of 2026-09-05 named this as the next item because it is the next thing with working
code behind it: `server/src/kb/ingest.js` (`readBundle`, `ingestBundle`, `embedPending`,
`corpusStatus`) and `server/src/kb/retrieve.js` (`lexicalLeg`, `semanticLeg`, `fuseRRF`,
`retrieve`) already do everything the two screens need. This pass is UI over working code plus the
audit rows and permission checks the console requires. It is **not** the article editor; §5.

## 2. Tasks, in order

### Task 1 — ingestion from the console (`knowledge.write`)

`POST /admin/knowledge/ingest`. The CLI path is `node bin/kb.mjs ingest <bundle.json>` then embed;
the console does the same and **reports chunk counts**, because an empty corpus is a hub that
declines everything and looks correct doing it (D220 found this on demo day).

- **Input shape — decide before building, and say which.** The router's `readForm()` parses
  `application/x-www-form-urlencoded` only; there is no multipart parser and D221 forbids adding a
  dependency for one. Two honest options: a `<textarea>` the admin pastes the bundle JSON into
  (works today, no new code in the router), or a small multipart parser written in `src/admin/`
  for a real file upload. **Recommendation: the textarea first.** A file upload is a second form
  on the same page later, not a different design.
- **Validate with `readBundle()`'s rules** before touching the database, and show the bundle's
  article ids and titles back before committing? No — one step, one POST: validate, ingest, embed,
  report. A two-step preview is a later refinement.
- **Report what landed**: articles inserted / updated / unchanged (the `source_hash` makes this
  knowable), chunks written, chunks embedded, **which model embedded them**, and the corpus
  totals after. If the embedder is down, ingestion still succeeds and the page says the chunks
  retrieve lexically only until `node bin/kb.mjs embed` runs — the same degradation the hub
  already has (`src/index.js`'s embedder verify).
- **Audit** `kb.ingest` with `{ bundleId, articles, chunks, embedded, model }`. Never the article
  text.
- **Refuse a second embedding model.** If `corpusStatus().models` would become two, refuse the
  embed step and say why (CLAUDE.md "Never": two models, two spaces). The ingest can still land;
  the embed cannot.
- **Tenant scope.** The KB is `control.kb_*`, cross-tenant by decision (D45). Ingesting from a
  tenant admin's console therefore changes what EVERY tenant's assistant answers. Say so on the
  form, in words, above the button. Whether tenant-specific articles should exist is not this
  pass's question; note it in the ledger.

### Task 2 — search as the assistant searches (`knowledge.read`)

`GET /admin/knowledge/search?q=…&platform=…`. A form at the top of the Knowledge page.

- Run **both legs unfused and the fusion**, and show all three: lexical rank, semantic rank, fused
  RRF score per chunk, grouped by article. `bin/kb.mjs legs` already prints the unfused legs; the
  page shows the same thing. If the admin cannot find an article, neither can the assistant, and
  the legs say which half is failing.
- **The caveats travel with every result** (CLAUDE.md "Never" list): no cross-encoder reranker
  (D207), a dev embedder that is not D199's (D203), and `RELEVANCE_FLOOR` is `null` because a floor
  over fused RRF scores cannot work (§5.16c) — so **do not draw a threshold line** on the results.
- **Platform pre-filter** exactly as `/v1/ask` applies it (D162, both legs), with a select for
  `any / windows / macos`.
- **Chunk text on the page — this needs a decision, D226.** D53 says retrieved chunk text never
  leaves the hub to the endpoint. The console is rendered BY the hub and read by an authenticated
  admin who can already read every article through `bin/kb.mjs`, so showing the matched chunk's
  text is defensible — but it is a new reader of chunk text and D53 was written before the
  console existed. **Build the results with article title, id, kind, ranks and score first;
  propose D226 in the register for showing chunk text; add the text only if Charles ratifies it.**
  Until then a result row links to the article on the Knowledge page.
- **Not audited.** A search is not a read of a record naming a person. Say so in the code
  comment, because every other console read of anything was a deliberate audit decision.
- **The escape rule.** Question text and article text are untrusted; everything goes through the
  `html` tag and `raw()` stays unused (a static test fails otherwise). No markdown rendering yet.

### Task 3 — the gap row links into search

On the review queue, a gap row WITH question text gets a link "Search for this" to Task 2's page
with `q` prefilled. Rows without text get nothing, because there is nothing to search for. The
disabled answer form stays disabled — it is the editor's, §5.

### Task 4 — a question for the founder: turn question logging on for the dev hub?

Every gap row today says "Question text was not logged". `MATIC_KB_LOG_QUERIES=1` would change
that for everything asked from now on. D223 settled who may read a logged question; it did not
settle whether the dev hub logs them. **Ask Charles before setting it**, and if he says yes, put it
in `tools/launchers/start-hub.ps1`'s environment so the demo hub logs too, and record the answer
in the register. Do not set it silently: it is the one switch that turns the retrieval log into a
table of what employees typed.

### Task 5 — small: a credential reset in `bin/admin.mjs`

`node bin/admin.mjs reset <tenant> <email>`: new password and new TOTP secret, printed once;
`totp_last_step` cleared; every live session revoked (`revokeUserSessions`); audited as
`admin.reset`. Charles lost a printed secret on day one and the only remedy was a new account.

## 3. Exit criteria — falsifiable

1. A bundle pasted into the console lands in `control.kb_articles` / `kb_chunks`, and the page
   reports article, chunk and embedded counts that equal what `node bin/kb.mjs status` prints.
2. An ingest with the embedder down succeeds, says the chunks are lexical-only, and `kb:status`
   agrees; a later `embed` completes them.
3. An ingest that would introduce a second embedding model is refused with the reason, and the
   corpus still has one model.
4. `kb.ingest` appears in `admin_audit` with actor, counts and model — and no article text.
5. A search for a phrase that `bin/kb.mjs legs` finds shows the same chunks with the same ranks
   on the page; a search for a phrase it does not find shows an empty result **with no
   threshold drawn** and the D207/D203/§5.16c caveats visible.
6. An `auditor` cannot open the search or the ingest form (403, audited); an `it_agent` can do
   both.
7. No page under `src/admin/pages/` uses `raw()`; no script on any page; every POST form carries
   its CSRF token — `test/admin-static.test.mjs` unchanged in spirit and still passing.
8. `npm.cmd test` and `npm.cmd run test:db` pass with the new assertions added to
   `admin-static.test.mjs` and `admin-db.test.mjs` (the live test must ingest a tiny bundle into
   its own run and remove it — note the KB is control-plane, not per-tenant, so teardown must
   delete the articles it inserted by id).

## 4. Constraints that bind this pass

- **D221:** server-rendered HTML, no JavaScript on any page, one stylesheet in
  `src/admin/html.js`, no new dependency, no external asset. The CSP has no script source.
- **D225:** the design system. New screens use the existing components — `.panel`, `.stat`,
  `notYet()`, `limit()`, the `.filters` row, the `.gap`/`<details>` list if a result list wants to
  collapse. Registration marks (`.marks`) stay reserved for the gap card and the honest stub; do
  not put them on search results.
- **Limitations stay as words** where the reader is looking (`limit()`), never an icon or a
  tooltip. "Cross-tenant: this changes what every tenant's assistant answers" is one such sentence.
- **`withTenant()` is the only door to tenant data**; the KB is control-plane and uses
  `withControl()`. Do not add a tenant column to `kb_*` in this pass — that is the tenant-specific
  KB question, which is a decision, not a schema tweak.
- **Never a general-knowledge fallback, never chunk text to the endpoint, never a relevance floor
  over RRF** — all in `CLAUDE.md`'s Never list and all touch this pass.
- **Decisions get IDs from D226.** If Task 2's chunk-text question and Task 4's logging question
  are both decided, that is D226 and D227, appended to the register with forcing reasons.

## 5. Out of scope, and why

- **The article editor** and the review queue's answer form staying enabled. Both need a markdown
  sanitiser first — admin-authored text shown to OTHER admins (brief §3) — and the sanitiser is a
  decision (write one, or the first dependency since `pg`). The form ships disabled with its
  sentence, exactly as now.
- **Session outcomes, Metrics, the other three review feeds** (D89/D90/D188). Nothing writes an
  outcome until the endpoint creates sessions.
- **Agents** — B3.
- **Tenant-specific articles.** D45 makes the corpus cross-tenant; changing that is a decision.
- **Step-up (D157), login-CSRF token, OIDC.** Carried from the B2 ledger; unchanged.

## 6. Where things are

| | |
|---|---|
| The console's document, including the design pass and the fonts | `server/docs/B2-ADMIN-CONSOLE.md` |
| The design brief and Claude Design's handback | `server/docs/2026-09-09-admin-console-design-brief.md`, `docs/handovers/2026-09-09-claude-design-handback-admin-console.md` |
| The knowledge base's document and the retrieval rules | `server/docs/B7a-KNOWLEDGE-BASE.md`, register §5.16 (D203–D207), §5.16c (the floor) |
| Ingestion and retrieval code | `server/src/kb/ingest.js`, `server/src/kb/retrieve.js`, `server/src/kb/chunk.js`, `server/src/kb/embed.js`; CLI `server/bin/kb.mjs` |
| The console's front door, components, pages, tests | `server/src/admin/router.js`, `html.js`, `pages/knowledge.js`, `pages/review.js`; `server/test/admin*.test.mjs` |
| The generic bundle to test ingestion with | `docs/kb/generic-kb-v2.json` (already ingested — a re-ingest is a no-op by `source_hash`, which is itself worth asserting) |

## 7. Honesty ledger

- **This handover was written by the session that built the console, immediately after building
  it.** It knows the console well and the ingestion code only by reading it; `ingestBundle()`'s
  behaviour on a partially-invalid bundle was not exercised. Run it before designing the error page.
- **Nothing is measured.** No ingest timing, no search latency, no embedder throughput.
- **Two founder questions are embedded in the tasks** (chunk text on the page; question logging on
  the dev hub). Neither blocks starting; both block finishing Task 2 and Task 4 as specified.
- **The canvas Claude Design worked on** (`https://claude.ai/code/artifact/bec3816b-1019-424a-a5fb-46c70a53a47f`)
  shows the console BEFORE the design pass. It was not re-seeded with the restyled pages; if the
  design team is engaged again, re-seed from the live pages first.
- **The two dev accounts' secrets are in a previous session's terminal only.** `bin/admin.mjs`
  cannot recover them; Task 5 is the fix, and until then `disable` + `create-user` is the remedy.
