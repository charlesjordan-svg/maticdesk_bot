# CLAUDE.md — read before doing anything in this repo

**Then read [`PROJECT_START_HERE.md`](PROJECT_START_HERE.md)** — it is the index of status, documents
and blockers, and it is kept current. This file only tells you how to work here.

## Layout (since 2026-09-03)

| Path | What |
|---|---|
| `client/` | The Windows endpoint: Electron agent + privileged broker + four Win32 primitives. Runnable. All `npm` commands run **from `client/`**. **The avatar is the v7 bust since 2026-09-10 (D232):** `src/renderer/avatar/` holds Claude Design's delivery VERBATIM (`matic-avatar.svg`, `.css`, `.manifest.json`, the harness) plus `<matic-avatar>` (`matic-avatar-element.js`), its manifest-reading model (`avatar-model.js`) and the phoneme table that drives the mouth (`viseme-map.js`). **The manifest IS the state table** — nothing in code lists the twelve states, and `test/avatar.test.mjs` fails if the CSS pairings, the generated `matic-avatar.assets.js`, or a state literal drift. **The end-user panel is Claude Design's delivery since 2026-09-10 (D240–D243), and the delivery on disk is the RE-EXPORT of the same day (D252):** `src/renderer/panel/` holds `matic-desk-panel.html` VERBATIM, the GENERATED `matic-panel.css` (`npm.cmd run panel:build`; `test/panel.test.mjs` fails while it is stale), the hand-written `matic-panel.app.css`, and `panel-check.html` — the real renderer against a fake bridge. **The re-export is the first buildable one** (515 classes against the first two exports' 0) and it draws the four surfaces the app had been approximating, so **`matic-panel.app.css` is 123 lines where it was 280** — the stage becoming a window, two display hooks, one label, and the four `--matic-ui-live-*` VALUES, which are the one delivered-token exception and are granted by the delivery in writing. **Its 32 invented class names are ADOPTED, not renamed to ours** (`tr-grid`/`tr-label`/`tr-value`): renaming the delivery to match names the app invented is the inversion D241 exists to prevent. **The developer surface is now an INSPECTOR, hidden by default**: state names, capability ids, source lines and broker JSON go there and to the developer log, and what stayed in the transcript is every line about what the system did NOT do. **The restart signal is built since 2026-09-11 (D256):** `src/broker/win32/sysinfo.js` reads the boot instant, the three pending-reboot flags, commit charge, `Memory Compression` and the two boot events by **native calls only** (it is `win32/*`, so no PowerShell and no shell at all), and `src/agent/restart-signal.js` — pure, so a test can drive machines that do not exist — holds the thresholds, the score and the words. **It adds ONE row** ("Last restarted: 2 days ago", the fact and no advice) and one conversation moment. **Commit charge is scored and never rendered as a number**, and cannot be: it is not in the object the renderer receives. `docs/RESTART-SIGNAL.md`. **`src/agent/hub-link.js` (D233)** is the connectivity monitor: D49's three states, D51's hysteresis, shape-checked `GET /v1/health`, every real request reported by `HubClient`. Not authenticated (D50 needs D61). |
| `server/` | The hub. **THREE API ROUTES since 2026-09-04, plus the admin console at `/admin` since 2026-09-09.** `POST /v1/turn` is B0's walking skeleton: proposes a machine change, one provider (Ollama), **stateless — a test fails if it imports `src/db/`, and B7a did not touch it** (D206). `POST /v1/ask` is B7a: answers a question from the knowledge base, and IS stateful. **No authentication and no tenancy on either, loudly** (`x-matic-hub-auth: none`, loopback only, a startup banner). **B1 control plane** (D143, D193–D197): `migrations/`, `src/db/`, the job queue, `bin/db.mjs`. **B7a knowledge base** (D203–D207): `migrations/control/002-generic-kb.sql`, `src/kb/`, `bin/kb.mjs`. `pg` is the only dependency. **B6-lite ticket store** (D213): `POST /v1/ticket` files a ticket into a tenant schema and **NOTIFIES NOBODY** — there is no outbound email, so per D86 it is a record and not a queue; `migrations/tenant/003-tickets.sql`, `src/tickets/`, `bin/tickets.mjs`. **A tenant is required and a fresh database has none.** **B2 admin console** (D221–D224, 2026-09-09): `GET /admin` — server-rendered HTML in the same process, **no framework, no build step, no new dependency**; local accounts with scrypt + **mandatory TOTP**, roles carrying permissions (`control.admin_role_permissions`, migration `control/003`), admin-action audit from the first request, server-side sessions. **Home is the review queue** (D177). Tickets fully working through `src/tickets/query.js`, **which the CLI also reads** (D224). **Knowledge is real since 2026-09-09 (D226–D229):** `GET /admin/knowledge/search` runs BOTH retrieval legs unfused plus the fusion (`src/admin/kb-search.js`, composing `src/kb/retrieve.js` — it writes no retrieval SQL of its own), and `POST /admin/knowledge/ingest` pastes a bundle in through `ingestAndEmbed()`, **the same function `bin/kb.mjs ingest` calls**, which refuses the embed step rather than put a second embedding model in the corpus. **Chunk text is shown for the chunks the model actually receives, and for no others** (**D226**, decided narrower than asked; the narrowing is structural — `sentText` is null below the top 5 and the legs are stripped of text before they leave `kb-search.js`). `MATIC_KB_LOG_QUERIES` **stays off**: **D227 is deferred behind D229, a retention policy for logged question text** — so every gap row still reads "Question text was not logged", and that is a named cost, not an oversight. **The article editor is real since 2026-09-09 (D230):** a structured form — `problem`, `symptoms[]`, `keywords[]`, `guidance[]`, `escalateWhen[]`, `doNotAttempt[]`, `cause`, one entry per line on the arrays — not a markdown editor, so no sanitiser and no new dependency were needed; `body` (markdown, `type: "reference"` only) stays uneditable and is shown back unedited. `GET /admin/knowledge/new`, `GET /admin/knowledge/:id/edit`, `POST /admin/knowledge/save`, all `knowledge.write`, all writing through `ingestAndEmbed()` like the paste-a-bundle form (D228); every save lands `lifecycle = 'unvalidated'`; `kb.article.write`/`.refused` audits the id and the changed field names, never text. **The review queue's answer form remains an honest stub** — a separate piece of scope (wiring a gap directly to a draft), not gated on a sanitiser decision any more. **Wears the Industry design system since 2026-09-09 (D225)** — one stylesheet in `src/admin/html.js`, registration marks reserved for the gap card and the honest stub, the three Barlow faces self-hosted from `/admin/assets/` (allow-listed in `src/admin/assets.js`; never fetched, never inlined). `src/admin/`, `bin/admin.mjs`. **It is not in `GET /`'s route list and must not be added to it.** **B3 device enrollment (D231, 2026-09-10):** a FOURTH API route, `POST /v1/enroll` — the pending queue, auto-approve with a per-tenant toggle (D80), a rotatable time-boxed enrollment secret (D81), rate limiting with a volume-based fallback to the queue (D83), and bulk revocation by batch (D83a), all composing ONE function, `submitEnrollment()` in `src/devices/enrollment.js` (D224's pattern again — the console's real Agents page, `bin/devices.mjs`, and the route all call it). **Device identity is deliberately NOT built**: no TPM key (D60), no broker custody (D64 — needs the named-pipe transport, D200/D201, which is designed and not built), no token exchange (D61). A device on the Agents page is KNOWN (it presented a valid secret once), not PROVEN. `migrations/control/004-device-enrollment.sql` adds the per-tenant toggle column and a foreign key B1 left off `enrollment_requests.decided_by`. Docs: `server/docs/B1-CONTROL-PLANE.md`, `server/docs/B7a-KNOWLEDGE-BASE.md`, `server/docs/B6-TICKET-STORE.md`, `server/docs/B2-ADMIN-CONSOLE.md`, `server/docs/B3-DEVICE-ENROLLMENT.md`. |
| `docs/decisions/DECISION-REGISTER.md` | **The** decision register, **v2.41. D1–D256** (D236–D239 are taken by the hub-side work of 2026-09-10 and are NOT YET SECTIONED — read commits `b5d9cf7` and `24f8f3e` before assuming they are free), invariants H1–H6, conflicts, open items OPEN-1–OPEN-9 (**OPEN-5 closed 2026-09-03**). Cite it by this path. `docs/decisions/sources/` is superseded material with old numbering — never cite it, **except the dated ratification notes**, which are records of a founder decision rather than superseded design. |
| `docs/` | Cross-cutting documents: the threat model (`2026-09-03-threat-model-v1.md` — adversaries A1–A11, gaps G1–G10, and the source of the G3/G4 labels other documents cite), the Phase 1 plan, the handover answers. |
| `research/` | Measured research the product is built from, filed here so a citation in code resolves. `2026-09-11-endpoint-telemetry-spec.md` is the endpoint telemetry spec behind **D256** — uptime, pending-reboot flags, disk, memory, VRAM, audio and camera, **all of it measured on ONE machine on ONE day** and it says so. `client/docs/RESTART-SIGNAL.md` records which of its numbers this build corrected (the event log is 1.2–5.9 ms, not slow; the HKLM reads need no elevation) and which of its findings are deliberately not built. |
| `docs/handovers/` | Handovers, kept for the record. **Start with the newest: `2026-09-11-claude-code-handover-restart-signal-built.md`** — **the restart signal, probe to sentence (D256).** Native collection only (`win32/*`'s rule is stricter than the spec's and it corrected two of the spec's measurements: the event log is **1.2–5.9 ms** by XPath, and the HKLM reads need no elevation); **`LastBootUpTime` reported exactly**, because `BootTime − BootTimeBias` matched WMI to the millisecond and `GetTickCount64` resolved which value is which; **no tick counter, and a test pins it.** It adds ONE row and one conversation moment, holds the Design handover because nine rows is not obviously a different layout from eight, and **reads nothing from the consent store.** **The eighth straight click-through found something and it was mine:** the evidence clause named the configured BAND, so a machine up 1.35 days was told it had not been restarted "in more than a fortnight" — every copy rule passed and the evidence was false. **1498 / 19 client assertions.** Before it: `2026-09-11-claude-code-handover-hub-markdown.md` — **the hub's markdown is read as DATA and built as NODES, never interpreted (D255).** A real answer reached the screen as "…is `Ctrl + Y`." with the backticks showing. `src/renderer/model-prose.js` returns runs and the renderer appends a text node or a `<code>` per run, so **no HTML is parsed, none is produced and nothing can inject** — the only shape available, because D130 forbids `innerHTML`. Both layers: the hub's `answer` tool now asks for plain sentences *because the reply is spoken as well as shown*, and the renderer is right on the turn a model ignores its prompt. **The load-bearing restraint is that single `*` and `_` are NOT emphasis** — `needs_human_judgement` is on the review card and a naive rule makes it `needshumanjudgement`. The case note is NOT transformed though it is model-written, because the card says *"Sent exactly as it reads."* Two of my own CSS defects found by measuring (`--matic-ui-hair` is a WIDTH, not a colour), and **app.css grew 123 → 155 lines, logged in the file as the next design ask.** Before it: `2026-09-11-claude-code-handover-panel-electron-click-through.md` — **the panel click-through RUN in Electron (D254)**, against the real broker, the real probe and a live hub, driven over the DevTools Protocol with screenshots of the real window. **Seven straight click-throughs on this project have found something and this one found six.** Two fixed, both D244/§5.29a's vocabulary rule in strings its sweep missed — the degraded REPLY named only the service desk (and the question that lands there is the kind the GUIDANCE would have answered), and the RECOVERY note named one thing where the LOSS note six lines above it named two. Four reported, three of which cannot be fixed in the renderer: the hub's markdown renders as visible backticks (D130 forbids `innerHTML`, so it is a decision, not a patch), the citation shows the article's slug because `/v1/ask` returns no title, the model's `reasoning` renders twice, and its proposal still names the mechanism. **It proved D249, D247, D250 and D253 against the real thing for the first time.** And it hit §10.5's trap FOUR times without letting any of it into a report. Before it: `2026-09-11-claude-code-handover-card-cannot-claim-sent.md` — **the review card can no longer say "sent" before the service desk has answered (D253).** It wrote "Sent by you" on the CLICK, before `fileTicket()` had been called, so a failed filing left the card claiming it had been sent three lines above a note saying nothing was filed — `700d920`'s defect one turn later, on the one screen where a user approves data leaving the machine. **The fix is a contract change, not a better string:** `reviewTicket()` resolves `{ approved, report }`, the click writes "Sending…", and the caller — the only holder of `filed` — writes the outcome, on both branches and before either speaks. **Three endings because D213 has three**; `filed === null` is a timeout and reads "Sent, not confirmed", because neither of the others is a fact there. **A second defect of the same class was found by CANCELLING the card rather than reading it** — the card's note and the transcript's said one fact in two wordings, adjacent (D245). Seven mutations probed, all seven caught, and one of them caught a trap in the TEST: reading the whole send handler for "Sent by you" passes on the defect, because `report` is defined inside it and carries that string legitimately. Before it: `2026-09-10-claude-code-handover-panel-re-export-built.md` — the panel RE-EXPORT integrated (D252). The third export is the first buildable one — **515 classes against the previous two's 0, 36 inline styles against 242, 38,392 characters of CSS against 2,293** — so D251's fallback was not taken and D241 stands. **Its 32 invented names are ADOPTED rather than renamed to ours**, because renaming the delivery to match names the app invented is the inversion D241 exists to prevent, and `matic-panel.app.css` is **123 lines where it was 280**: the section headed "surfaces the delivery did not draw" is gone, because it drew them. Both unasked-for token changes kept — **all six contrast figures re-derived here and every one matches**, and their third find is a gap in OUR analysis (dark `ink-quiet` fails on `surface-2`, the review card's own ground, which §5.29b never measured because the card had not been drawn). Carries the four live tokens' named exception and why its test cannot outlive its justification; the `aria-expanded` keying that makes the visual and announced states one thing; the two markup changes CSS could not make; and the one defect found by looking, which was ours — a `<textarea>` does not inherit a font, so the user's own words rendered in a monospace box one line tall. **Two things it does NOT do: the "Sent by you" label still precedes `fileTicket()`, and nobody has watched any of it in Electron.** Before it: `2026-09-10-claude-code-handover-machine-name-not-spoken.md` — D249 and D250 both, since the second answers a question the first left open — D249: the machine's name, the signed-in account and this machine's own addresses are shown and never said. Carries the finding that two of the three were NOT being spoken but only by accident, the reason the addresses are literals rather than a pattern, and the record of a mutation probe that was wrong twice before it was right. Before it: `2026-09-10-claude-code-handover-broker-strings-audit.md` — the broker's strings audited (D247; **D248 proposed, awaiting Charles**). Ten findings, the sharpest being that the demo's own success line named the service by its registry key. Includes the note that the Scenario 1 money line's WORDING changed (the before → after pair did not). Before it: `2026-09-10-claude-code-handover-panel-vocabulary-built.md` — the hub URL out of the spoken line (D246). `fileTicket()` returns `error` (the user's sentence, persona data) and `detail` (ours, to the inspector and the log); the sweep written for it found "the hub" on the review card and in the tickets band too, and the failed-filing branch had never been run at all. Before it: `2026-09-10-claude-code-handover-panel-copy-built.md` — the panel's copy and vocabulary (D244–D245): a closed enum reaching the user is GLOSSED and not hidden, the no-email fact is said once on the card, the idle status can no longer be read as a claim about services, and the unreachable transition now agrees with `agent.js`. Two of its four observations were already answered in code. The DESIGN items it deliberately did not fix are in `2026-09-10-claude-design-handover-panel-copy-followups.md`, **which is the file the next Design delivery reads** — and Claude Design ANSWERED it the same night. **That delivery is accepted as design and cannot be built from**: it is a canvas export with 0 classes, 242 inline styles and a 2.3 KB style block, and `matic-panel.css` is generated from that block. **A SECOND export then arrived and the entire difference between the two was one line** — a Google Fonts `<link>`, which is itself a regression on a machine that is routinely offline. So the request is re-sent as ONE PAGE: `2026-09-10-claude-design-request-buildable-export.md` (a worked before/after, the 90-name class contract, one self-test — open it with the network off), with the tickets-band constraint the first brief failed to give them (D242: the endpoint knows what it FILED, never a status) and one contrast value to pick. **D251: if that export is not buildable either, D241 ENDS for the panel** — the delivery becomes reference, and the app implements the written decisions itself. §5.34a says what that costs. **It was not needed: the third export IS buildable and is integrated (D252, §5.35), so D241 stands and §5.34a is unspent.** The request document is kept as the record of what was asked and of the one-page form that finally got it. — rewritten at the end of 2026-09-10 as the complete brief once D244–D250 had accumulated more for it. Its §1 is the largest ask: **four surfaces the delivery never drew at all** — `.turn-note`, `.ticket-review`, `.todo-card`, `.transcript-turn` — are now permanent parts of the product and are our approximations. It also carries `63011a4`'s two deviations, the one string where the app's copy diverges, the consent card's exact-call treatment (and D248 behind it), and answers two of the four screenshot items (the disclosure square is not a checkbox; the label column is 3.53:1 in light and passes in dark). Before it: `2026-09-10-claude-code-handover-panel-integration-built.md` — the end-user panel INTEGRATED (D240–D243), the §7 audit answered, and §4's tickets-band question built as a proposed decision awaiting Charles. It answers `2026-09-10-claude-code-handover-panel-integration.md`, and Claude Design's delivery brief is `2026-09-10-claude-design-handover-agent-panel.md`. Before it: `2026-09-10-claude-code-handover-avatar-integration-built.md` — the v7 avatar INTEGRATED (D232), the phoneme comparison RUN against real Piper output (keep the debugged table; five bare vowels added), the connectivity model BUILT client-side and the reconnect question answered (D233), the tray scoped and not built. It answers `2026-09-09-claude-code-handover-avatar-integration.md`. Before it: `2026-09-09-claude-code-handover-kb-ingestion-and-search-built.md` — Knowledge ingestion and search BUILT, and **two founder questions open as proposed decisions D226/D227** (chunk text on the page; question logging on the dev hub). It answers `2026-09-09-claude-code-handover-kb-ingestion-and-search.md`, which set the five tasks. Before those: `2026-09-09-claude-code-handover-admin-console-scaffold-built.md` (B2 built; it answers `2026-09-05-claude-code-handover-admin-console-scaffold.md`), and Claude Design's `2026-09-09-claude-design-handback-admin-console.md`. Before those: `2026-09-05-claude-code-handover-demo-prep-done.md`, then `2026-09-04-claude-code-handover-b7a-built.md`. The one before it (`2026-09-04-claude-code-handover-unblock-and-b7a.md`) set the tasks that produced it, and `2026-09-04-claude-code-handover-b2-and-open-items.md` before that. The 2026-09-03 ones run founder → session; the 2026-09-04 ones run the other way. |
| `server/docs/` | Hub-side documents. `2026-09-03-B0-walking-skeleton-spec.md` is the B0 spike's spec; read its status block before citing any number in it, and §5a for what its acceptance list actually maps to. |
| `docs/kb/` | The generic knowledge base (`generic-kb-v2.json`) and its rules (D162). An article never names a capability or says what the bot does. Also the schema findings and **the KB architecture document** — retrieval, authoring UX and client UI, merged into the register as D167–D192. **Every D-number written inside that document is void**; it carries a banner saying so. |
| `tools/launchers/` | **Stage tooling, not product (D220, 2026-09-05).** `start-hub.cmd`/`.ps1` preflights (Docker, Postgres, migrations, tenant, **corpus chunk count**, Ollama, exact model tags, VRAM, port), starts the hub in its own window, warms both models and one turn on each route, prints READY. `start-agent.cmd`/`.ps1` checks the hub first, then runs `client/scripts/start-elevated.ps1`. `install-shortcuts.ps1` puts both on the Desktop. `docs/DEMO-DAY.md` is the one-page recovery card; `client/docs/DEMO-CLICKTHROUGH.md` is the hub-mode click-through Charles runs. |
| `Projects/`, `.obsidian/` | The founder's Obsidian notes. Not product code. |

The client used to live at `Projects/Ai Chat Bot -Matic/matic-desk-demo`. Handovers dated 2026-09-02
and earlier use that path; do not "fix" them, they are records.

## Branches

- `main` — current code. Work here or on feature branches off it.
- `add-matic-desk-demo` — the **frozen demo build**. Rehearsals run from it. Do not merge into it
  without being asked; every code change resets the demo's clean-run counter.
- `post-demo` — merged into `main` on 2026-09-03; historical.

## Decisions

- New decisions are **appended** to the register with the next free ID (**D257 onward**, as of D256), with a status
  (*done* / *decided* / *proposed* / *rejected*) and a forcing reason. **Nobody renumbers.**
- **When a migration implements a decision, the SQL names it AND the status it held when the
  migration was written** (register §5.7b) — `-- D153 (PROPOSED when written; ratified 2026-09-04)`.
  **The comment is appended to, never rewritten**, because a comment that silently tracks current
  status loses the only fact worth recording: that the shape went in before the decision came out.
- Two chat documents dated 2026-09-03 numbered their own content D130–D168 in parallel with the
  register. Those IDs are **void**; the register's §0, §5.6 and §5.11a map them. Do not cite them.
  One of the two (`docs/kb/2026-09-03-kb-architecture-authoring-ux.md`) is now **in the repo** with a
  void-ID banner, merged as D167–D192. The other is still not on disk.
- **Two IDs are cited in the register but were never defined: `D46b` and `D52a`.** Register §5.11b
  says what to cite instead (`D46` + the `hub-client.test.mjs` pin; `D59a` + `D143`). Do not
  back-fill them — the register does not renumber.
- D130–D150 were assigned on 2026-09-03 from the independent design review; most are *proposed*,
  meaning the founder has not ratified them. Do not treat a proposed decision as settled.
- **Ratified by the founder on 2026-09-04: D199 (the embedder), D199a (as a revisit trigger only),
  D200 and D201 (the pipe protocol and its transport).** Two consequences worth knowing: the pipe
  **wire format is now a contract** — changing `execute`'s shape needs a new decision, not a patch —
  and D201's ratification **accepts a named growth of `BROKER-SURFACE.md`**, so the new pipe
  lifecycle calls must be listed there *before* any implementation merges.
- **Ratified as sets on 2026-09-04: D167–D192** (the KB architecture) **and D193–D197** (B1). Three
  caveats in §5.11c survive that ratification and must not be softened by it: **D173 rests on
  "findability beats volume", which KCS retrieval did NOT confirm** (it is our own argument — do
  not cite KCS for it); the `k ≈ 60` RRF convention is still unretrieved; and nothing in the set is
  measured on our corpus, because there is no corpus. **D174's cross-encoder options ARE now
  retrieved (D207) but it is still not picked, and its CPU viability is still unmeasured** — and
  D207 records why that is a harder question than a parameter count: a cross-encoder costs
  per-query × per-candidate, not per-query.
- **B7a implemented D174's lexical leg, semantic leg and RRF fusion; the cross-encoder is absent**
  (D207). So B7a's retrieval numbers are a floor, not a measurement of the design.
- **Ratified as a set on 2026-09-04: D152–D160** (OPEN-6's human-identity and authorisation model,
  §5.7), as a **separate act** from B1's ratification the same day. Two consequences: **D158
  (author ≠ approver for the catalog) is ratified but INERT in Phase 1** — D149 deferred catalog
  distribution, so there are no drafts to approve, and **if B2 starts building an approval workflow
  that is Phase 2 scope arriving through the back door**; and **D202 is proposed and awaits Charles**
  (§5.7a: step-up for vendor-grant creation, the one item D157's list missed — it gates nothing,
  because `admin_audit.step_up` is indifferent to what is on the list).
- **Still proposed: D130–D150** (the design review) and **D202–D212**. Note that a proposed row's
  status cell reads the same as a ratified set's used to — **never search-and-replace a status
  file-wide.**
- **Q35 is ANSWERED: English only, FOR NOW** (founder, 2026-09-04 — D208, register §5.17). *"For
  now"* is part of the decision: it licenses choosing English-only components where they are
  cheaper, and does **not** license making a later reversal a migration rather than a redeploy.
  `control.kb_chunks.tsv` is already `to_tsvector('english', …)`, which is now backed by a
  decision rather than a default. Two consequences: **D209** makes the reranker pick
  `gte-reranker-modernbert-base` (150M, int8 ONNX) over the 306M multilingual one — selecting
  within D207's own recorded fork; and **D210 records that D199's DECIDING REASON IS SPENT**, since
  that reason was "it removes Q35 from the critical path". D199 stands,
  `nomic-embed-text-v1.5` (137M, same 768 dims) is the pre-argued alternative, and it is **not**
  adopted because no latency measurement exists for either and "for now" can revert.
- **Q35, Q9 and Q39 are cited in the register and defined nowhere in it** — their text is in
  `ASK-IT-questionnaire.xlsx`, which has never been on disk. Same class as `D46b` / `D52a`.
  §5.17 records what Q35 was taken to mean so its answer is unambiguous without the workbook.
- **Do not read a built schema as evidence that the decisions behind it were ratified.** B1's
  ratified schema implemented D152–D160's shapes before those decisions were accepted. That was
  correct (D160 asked for the shapes, and they are cheap now and expensive later) and it is NOT
  evidence of ratification. The same inference error had to be corrected once in §5.12 and once in
  §5.7, which is why §5.7b now puts the provenance in the SQL.
- D1–D41 live only in `ASK-IT-questionnaire.xlsx`, which has never been downloaded. If it turns up,
  it goes into the register verbatim.
- Every document you write names other files **by path**, never by name alone. Two documents were
  declared missing in one day while sitting on disk.
- **A chat-produced document must be confirmed present on disk before any task depends on it.**
  Check the path with `ls` (or `Test-Path`) at the start of the session and say what you found. Seven
  documents have now gone missing between a chat session and the repo, and two of those cost
  partial reviews. Never reconstruct a missing one from memory or from the register. **The four
  that went missing on 2026-09-03 were later supplied by the founder and are filed** (threat
  model, Phase 1 plan, B0 spec, KB schema findings), along with the KB architecture document —
  and filing them changed real conclusions, which is the argument for the rule: the B0 spec's
  acceptance target was wrong, and the KB document held the entire retrieval architecture, which
  the register had recorded nowhere. Still missing:
  `2026-09-03-phase0-decisions-D130-D150.md` and `ASK-IT-questionnaire.xlsx` (D1–D41).

## Commands (Windows)

```bash
cd client
npm.cmd install            # npm.cmd, not npm — PowerShell execution policy blocks npm.ps1
#                            (same for npx: `npx.ps1` is blocked, so `npx.cmd`, or just use an npm script)
npm.cmd run fetch-voice    # 63 MB Piper model into client/voices/ (gitignored); needed for speech
npm.cmd test               # ALL files, REPORTS ALL, exits non-zero at the end (test/run-all.mjs):
#                            headless, no key, no admin, no hub: 1498 assertions across 19 files (2026-09-11).
npm.cmd run avatar:build   # regenerate src/renderer/avatar/matic-avatar.assets.js from the delivered SVG + CSS.
#                            NEVER hand-edit the generated file; avatar.test.mjs fails while it is stale.
npm.cmd run avatar:check   # is it stale? (exit 1 if so)
npm.cmd run avatar:compare # §3 of the avatar handover: real product strings through Piper, both phoneme
#                            tables compared per phoneme, with a verdict. Needs the voice model + py -3 piper.
#                            2026-09-10: KEEP THE EXISTING TABLE - the manifest's knows 0 of Piper's IPA.
#                            It also PRINTS what it deliberately does not run and why -
#                            cloud.test.mjs (real API calls, costs money) and privileged.test.mjs
#                            (needs elevation). Both had silently fallen out of the old && chain.
npm.cmd run panel:build   # regenerate src/renderer/panel/matic-panel.css from the DELIVERY's <style> block,
#                            and panel-check-frame.html from src/renderer/index.html. Never hand-edit either.
npm.cmd run panel:check   # are either stale? (exit 1, naming each one)
# The renderer is NOT covered by any of it - no headless test can see a screen.
# client/docs/PANEL-RENDERER-CHECK.md is the panel's click-through. MOSTLY RUN 2026-09-11 (D254) in
#   Electron against the real broker, probe and hub, driven over the DevTools Protocol
#   (`electron . --remote-debugging-port=9223` + Runtime.evaluate + Page.captureScreenshot).
#   §8a (the restart signal, D256) was ADDED AND RUN the same way on 2026-09-11 - 23 checks, and it
#   found one defect. Seeing the recommendation at all needs the policy temporarily lowered
#   (`recommendAtScore: 1`, `uptimeElevatedDays: 1` in config.json - PUT IT BACK), because a healthy
#   machine scores 0 or 1 and silence is correct; or the check page's `next turn` button.
#   FOUR ITEMS ARE STILL CHARLES'S and a session cannot do them: anything HEARD (including §8a.14),
#   the first frame on launch, and the todo card (it needs THIS MACHINE genuinely offline).
#   Elevated restart_service too.
# For layout only, with no hub and no broker:
#   py -3 -m http.server 8766 --directory C:\Users\Charles\Downloads\maticdesk_bot\client\src --bind 127.0.0.1
#   then http://127.0.0.1:8766/renderer/panel/panel-check.html  - EVERYTHING behind its bridge is canned.
# client/docs/D130-RENDERER-CHECK.md is the manual click-through. Its §1 and §2 PASSED on
# 2026-09-03: the card on screen matched consentRendered field for field. §3 (supersede) and
# §4 (expired nonce) are still open. Charles runs it, not you.
npm.cmd run show-consent   # what the broker rendered and kept, for that comparison
npm.cmd run start:elevated # the app; needs .env with ANTHROPIC_API_KEY (see .env.example)
npm.cmd run count-tokens   # measures the shipped prompt prefix against the cache floor
npm.cmd run verify-cache   # TWO REAL CALLS to claude-sonnet-5: proves the cache_control breakpoint works (D161)
npm.cmd run verify:pipe    # D201: reads the DACL Windows gives a Node pipe and exercises the
#                            access check. RUN UNELEVATED - an elevated token has Administrators
#                            enabled rather than deny-only and the write succeeds (wrong answer).

cd ../server
npm.cmd install            # pg - the only dependency
npm.cmd test               # ALL files, REPORTS ALL, exits non-zero at the end (test/run-all.mjs):
#                            B0 hub (49) + B1 source rules (46) + B7a source rules (112)
#                            + B2 console pure parts (65) + B2 source rules (94) = 366
npm.cmd run db:up          # PostgreSQL 17 + pgvector in Docker, loopback, port 5433 (D197)
npm.cmd run migrate        # control plane + every tenant schema in one run
npm.cmd run test:db        # the files that need the database: B1's six exit criteria (56) + B7a retrieval (52)
#                            + B2 console end to end (160: login+TOTP, roles, CSRF, audit, tickets vs the CLI,
#                              self-hosted fonts, and the Knowledge pass - ingest, embedder-down, the
#                              second-model refusal, search vs `kb.mjs legs`, the gap link, admin reset) = 268
#                            THE KB IS CROSS-TENANT (D45), so admin-db.test.mjs ingests articles with
#                            `b2test-` ids and DELETES THEM BY ID: dropping its tenant would not.
npm.cmd run kb:ingest      # the six generic articles -> control.kb_* , then embed them
npm.cmd run kb:status      # what is loaded, and WHICH MODEL embedded it (two models = two spaces)
npm.cmd run kb -- legs "DisplayLink"      # the two retrieval legs, side by side, UNFUSED
npm.cmd run kb -- retrieve "my mouse cuts out" --platform windows
#                            The console shows exactly this at /admin/knowledge/search — same
#                            functions, same ranks, and that equality is a test (admin-db KB-4).
node bin/kb.mjs ingest <bundle.json>      # validate WHOLE, write, refuse a second embedding model,
#                            embed, report. The console's POST /admin/knowledge/ingest calls the
#                            SAME function (D228), which is what makes "the page agrees with
#                            kb:status" a real check rather than two hopeful implementations.
npm.cmd run kb:accept      # B7a's acceptance list end-to-end (30); needs db + Ollama. NEGATIVE TEST FIRST
npm.cmd run kb:answer      # the answer contract against a real model (18). Ollama only, NO database
npm.cmd run kb:floor       # is a relevance floor possible? Answer: NOT over fused RRF scores (§5.16c)
node bin/db.mjs create-tenant devco       # REQUIRED for tickets. A fresh database has NO tenants,
#                            and /v1/ticket answers 503 (with the fix) until one exists (D213)
npm.cmd run tickets -- list               # B6-lite. UNTIL OUTBOUND EMAIL EXISTS, THIS IS THE QUEUE
npm.cmd run tickets -- show MD-1000       # one ticket, including that its reporter is SELF-ASSERTED
node bin/admin.mjs create-user devco you@example.com --role tenant_owner
#                            B2. Prints the initial password and the TOTP secret ONCE. No sign-up page exists.
node bin/admin.mjs users devco            # who can sign in; `roles` lists the five D152 roles and their permissions
node bin/admin.mjs reset devco you@example.com  # NEW PASSWORD AND NEW TOTP SECRET, printed once; the
#                            replay state cleared and every live session revoked. The remedy for a lost
#                            authenticator secret; it keeps the row, so the audit trail stays that person's.
node bin/admin.mjs audit devco --limit 50 # every console action, refusal and record view (D156)
node bin/kb.mjs prune-questions           # D229: clear logged question text older than 90 days (the hub also does this on every write)
node bin/devices.mjs create-secret devco --ttl-days 30    # B3: mint an enrollment secret, printed once
node bin/devices.mjs enroll devco <device-key-id> <secret> # simulate a device; calls the SAME
#                            submitEnrollment() the console and POST /v1/enroll call (D224 pattern)
node bin/devices.mjs pending devco        # the approval queue; approve/reject take a request id
node bin/devices.mjs list devco           # every device; revoke takes one or more device ids (D83a)
# Device IDENTITY is not built (D60/D61/D63/D64) - a device on the Agents page is KNOWN, not PROVEN.
# See server/docs/B3-DEVICE-ENROLLMENT.md.
# MATIC_KB_LOG_QUERIES=1 is set BY THE LAUNCHER (D227). Running `npm.cmd start` by hand logs no text unless you set it.
# then http://127.0.0.1:8787/admin/login in a browser. LOOPBACK ONLY; the login page says so.
ollama pull snowflake-arctic-embed2:568m  # the DEV embedder. NOT D199's model - see D203
npm.cmd start              # http://127.0.0.1:8787 - needs Ollama with mistral-small:24b resident
# OR, for the demo: double-click the Desktop icons, or from anywhere (PowerShell):
#   powershell -ExecutionPolicy Bypass -File C:\Users\Charles\Downloads\maticdesk_bot\tools\launchers\start-hub.ps1 -CheckOnly
# A cold mistral-small:24b load is ~15 s with the GPU FREE and 190-265 s with a game holding VRAM (§5.22a).
# OLLAMA_KEEP_ALIVE=24h is a user env var on this machine; Ollama reads it at START (quit and restart the tray app).
# then, from client/:  MATIC_HUB_URL=http://127.0.0.1:8787 node test/hub-client.test.mjs   (adds one live turn)
#                      MATIC_HUB_URL=http://127.0.0.1:8787 node eval/e2e-hub-consent.mjs    (three demo scenarios, hub + two-step consent, headless)
#                      node eval/run-bakeoff.mjs --hub http://127.0.0.1:8787 mistral-small:24b
#                      npm.cmd run e2e:ticket   (D213: escalate -> offer -> interview -> draft ->
#                                                a REAL ticket. FILES TWO. Use a dev tenant.)
```

- `py -3`, not `python` — `python` is not on PATH. For scripted file edits use `node`, not Python.
- Bash heredocs in this environment mangle backslashes; put multi-line scripts in a file and run it.
- Line endings are governed by `.gitattributes` since 2026-09-03 (LF for source and docs, CRLF for
  `.ps1`). Write whatever your tool writes; Git normalises on add. Do not hand-convert.

## Tests: consent is two-step (D130, landed 2026-09-03)

`client/test/consent-surface.test.mjs` demonstrated the review's largest finding (an unprivileged
agent could show one consent card and send a different proposal down the pipe) and carried the D130
acceptance test as expected failures. **D130 is implemented**: `prepareConsent(proposal, {locale})`
renders the card in the broker and retains the proposal; `execute(nonce)` runs what was retained.
The XFAILs were promoted to hard checks the same day; the file's XFAIL helper and exit-1-on-XPASS
mechanism are kept for the next such decision. Read
`client/docs/2026-09-03-consent-protocol-attack-notes.md` before touching the consent path — it
says why each line is where it is (clone on retain, burn before run, supersede and audit).

The `NamedPipeBroker` pipe protocol is **designed** (D200–D201,
`client/docs/2026-09-04-named-pipe-protocol-design.md`) and **not built**. It serialises the
two-step shape: `execute` takes a nonce and the wire schema has nowhere to put a proposal. **Do not
add a parameter to `execute`** and do not reintroduce a one-call `consentAndExecute` — either
re-opens the finding the whole design answers. Two things to know before touching it: **a
LocalSystem-hosted Node pipe gives the unprivileged agent read and no write** — libuv passes NULL
security attributes, and this is **measured, not assumed** (`npm.cmd run verify:pipe`, register
§10.5: `GENERIC_READ` allowed, `GENERIC_WRITE` refused with ERROR_ACCESS_DENIED) — so the transport
needs native creation with an explicit DACL (D201); and **that DACL is not a defence against
user-context malware and cannot be** — D130's audit trail is what covers that (§5.15a).

## Traps this project has actually fallen into — rules, not anecdotes

These are in the register, but the register is not what a session reads first. Every one produced a
**confident wrong answer that looked right.**

- **A FALSE SIGNAL WEARING THE SHAPE OF THE EXPECTED ANSWER IS THE ONE CLASS WHERE CARE DOES NOT
  HELP. Only an independent check does.** Three instances now:
  - A Windows pipe path lost its backslashes through bash, and the resulting `EACCES` was
    **indistinguishable from the finding being sought** (D201's blocker). Hit **twice** — the second
    time while writing the note about the first. **Build Windows paths inside the script, and assert
    a path is well-formed BEFORE drawing any conclusion from a failure to open it.**
  - `"darwin".includes("win")` is **true**. `platformFromProbe` (`server/src/kb/ask.js`) tested
    `win` first and classified every macOS machine as Windows — the exact D162 failure the platform
    pre-filter exists to prevent, arriving through the pre-filter, and it would have PRESENTED AS A
    PASS (the macOS article correctly withheld from a Mac, for entirely the wrong reason). Caught by
    a test asserting `darwin -> macos`, not by reading the line. Register §5.16b.
- **PowerShell helpers return ONE thing.** Status goes to `Write-Host`; cast booleans explicitly at
  the call site (`[bool]`). A function that prints status *and* returns a boolean puts both on the
  pipeline, the caller captures an array, **every array is truthy**, and a verdict silently inverts.
  **PowerShell is 7.1% of this repo — this will recur.**
- **Reproduce a measured ACL exactly; never approximate one.** Use the mask you measured. And
  `verify:pipe` runs **unelevated or not at all** — an elevated token has Administrators enabled
  rather than deny-only, and the write wrongly succeeds.
- **`npm test` runs every file, reports every result, and exits non-zero at the END.** `&&`
  short-circuits, so the first failure hides every later file: two environment failures once aborted
  eight others. `server/` does this via `test/run-all.mjs`. **`client/package.json` still chains
  with `&&` and should be moved to the same shape.**
- **A PIPE REPLACES THE EXIT CODE WITH THE LAST STAGE'S.** `some-command | tail -20` exits 0
  whenever `tail` succeeds, *however hard `some-command` failed* — so anything reporting "exit code
  0" for a piped command is reporting `tail`. Hit on 2026-09-04: a backgrounded
  `docker compose up -d | tail -20` was announced as having completed successfully while its own
  output said it could not reach the Docker daemon, and port 5433 was closed. **Read the output, not
  the status, whenever a command is piped** — or drop the pipe when the exit code is what you care
  about. Same class as the `&&` rule above and as the two false-signal traps: the wrong answer
  arrived wearing the shape of the right one.
- **`npm.cmd test` writes to the app's audit log, and `reset-demo` deletes it.** Do not reset
  between using the app and reading a record.
- **`npm.cmd run <script>`, never `npx.ps1`** — execution policy blocks it. `npm.cmd`, not
  `npm`. `py -3`, not `python`.
- **NEVER HAND CHARLES A COMMAND CHAINED WITH `&&`.** He runs **Windows PowerShell 5.1**, where
  `&&` is a **parser error**, not a fallback: *"The token '&&' is not a valid statement separator in
  this version."* The whole line fails before anything runs. Hit on 2026-09-04 —
  `cd server && npm.cmd run db:up && npm.cmd start` was pasted into an Administrator PowerShell and
  produced two parser errors and no server. The command blocks in this file are fenced ```bash and
  are written for the Bash tool; **a command meant for Charles must be PowerShell, on separate
  lines, with an absolute path** (his prompt is usually `C:\Users\Charles`, not the repo):

  ```powershell
  cd C:\Users\Charles\Downloads\maticdesk_bot\server
  npm.cmd run db:up
  npm.cmd start
  ```

  Sequential-if-success in PowerShell 5.1 is `A; if ($?) { B }`, and unconditional is `A; B` — but
  separate lines are clearer and there is no reason to chain an interactive command anyway.
  `npm.cmd start` blocks, so anything after it never runs regardless.
- **A `cd` THAT FAILS IN A CHAINED COMMAND SILENTLY RUNS THE REST IN THE WRONG DIRECTORY.** Hit twice
  on 2026-09-05: a `cd` to a path that did not exist (the worktree had been created relative to a
  shell sitting in `client/`, so it landed INSIDE the repo) let `npm.cmd install` run at the vault
  root — exactly what `PROJECT_START_HERE.md` §3 forbids — and `npm.cmd test` report green from
  the wrong folder. Caught by `git status`, not by the output. **Guard every directory change:**
  `Set-Location -LiteralPath $d; if ((Get-Location).Path -ne $d) { throw }` in PowerShell, `cd x || exit 1`
  in the Bash tool, and absolute paths for `git worktree add`. Same class as the pipe and `&&` rules.
- **A chat-produced document is not on disk until you have looked.** `ls` the path at the start of
  the session and say what you found. **Never reconstruct a missing one** — from memory or from the
  register's summary of it.
- **`getComputedStyle` FROM THE WRONG `window` RETURNS DEFAULTS, NOT THE ELEMENT'S STYLE — AND A
  HIDDEN BROWSER PANE FREEZES AN IN-FLIGHT CSS TRANSITION.** `panel-check.html` runs the renderer
  inside an iframe; reading `getComputedStyle(el).transform` from the PARENT frame's global on a
  child-document element reported an identity matrix in every state, which is exactly what a broken
  rotation looks like (2026-09-10). The chevron defect being hunted was real and the evidence for it
  was not — §10.5's class again. **Use `frame.contentWindow.getComputedStyle`, and do not read an
  animated property at all while the pane is hidden.** What settled it was a check that does not
  depend on rendering: enumerate `document.styleSheets` and ask `el.matches(rule.selectorText)` in
  each state — zero matching rules before the fix, exactly one after.
- **A HIDDEN ELEMENT IS NOT NECESSARILY `[hidden]`, AND A COLLAPSED `<details>` HAS NO `innerText`
  AT ALL.** Both bit in one session while driving the real panel over the DevTools Protocol
  (2026-09-11, register §5.37e). `.inspector:not([hidden])` reported the inspector OPEN on a
  first-run window — it is hidden by `display:none` behind `[data-inspector="off"]`, so the
  attribute is absent and the negation matches. And `innerText` on a collapsed `<details>` returns
  `""`, which made two **byte-identical** strings compare as different and nearly produced the
  opposite finding. **Use `getComputedStyle(el).display` or the element's own box to ask whether
  something is visible, and `textContent` to compare text you cannot see.** Same family: a
  `querySelector` for a class that exists twice returns the first, which on this panel is the
  machine band whether or not the tickets band is the open one. **Four false findings formed and
  none reported, because each was checked** — that is the only defence §10.5 has ever had.
- **THE `hidden` ATTRIBUTE DOES NOTHING ON AN SVG ELEMENT.** The UA stylesheet's `[hidden]` rule is
  for HTML elements; set `style.display` instead. Hit 2026-09-10: the avatar's below-the-floor
  branch set `hidden` on the `<svg>` and the 24px column of the check page showed a 200px bust —
  found by looking at the page, not by the tests, which cannot see one.
- **A CSS custom property declared ON an element beats one inherited from an ancestor.** The
  avatar's `.mav` rule declares the light tokens on the svg itself, so a theme class on a wrapper
  cannot override them — the delivered harness's own "Dark panel" toggle does exactly that and does
  not knock the field out (2026-09-10). Put the token-swap class on the svg. Same class as the
  `[hidden]` rule above: the wrong answer wearing the right shape, visible only on a screen.
- **"Reconfigured to UTF-8" means ALL THREE STREAMS.** `piper_worker.py` fixed stdout/stderr for
  the IPA and left stdin on the console codepage, so every em dash reached espeak-ng as `â€”` and
  the voice said "a-circumflex euros" mid-sentence (2026-09-10). Text crossing a process boundary on
  Windows is mojibake until proven otherwise; probe it with a non-ASCII character, not with "hello".
- **A "debugged" lookup table is debugged against the keys it was shown.** `viseme-map.js` carried
  `ɜː` and never matched it, because Piper emits the length mark as its OWN row and the worker merges
  it, so the key that arrives is bare `ɜ` — every stressed "work"/"person" closed the mouth for a whole
  syllable. Found by `npm.cmd run avatar:compare`, not by reading the table. **Measure a mapping
  against the real emitter before calling it verified, and keep the script that did it.**

## Never

- Commit `.env`, an API key, or any `.onnx` file. Both are gitignored at two levels; keep it so.
- Claim a performance number. Only four things in this project have been measured: the model
  bake-off (one machine, 40 hand-written cases), the prompt prefix token count, one live
  prompt-cache check on Sonnet 5 (two calls), and the same bake-off through the B0 hub (identical to
  the direct path on 40 of 40 cases, one session). Everything else is a target and the docs say so.
  **Verifications are not measurements and do not lengthen that list.** B1's exit criteria (§10.3a
  family), the D130 renderer check and the D201 pipe DACL are *pass/fail against a real system* —
  they establish that something behaves as claimed, and none of them is a latency, throughput or
  cost figure. The register keeps them in §10.3a/§10.5, apart from §10.3's four numbers, on purpose.
- **Reach a tenant's tables by any route other than `withTenant()`** (`server/src/db/tenant.js`). It
  asserts the schema name against `control.tenants` before setting `search_path`, and `SET` takes no
  bind parameter — so the allow-list is the injection defence, not a tidiness check. Do not add a
  `getTenantClient()`; do not set `search_path` on checkout; do not schema-qualify tenant queries
  (D194 chose the other option, and the migration path depends on it). And do not claim tenant
  isolation: `search_path` stops accidents, not intent (**D195**, `server/docs/B1-CONTROL-PLANE.md`
  §6).
- **Add a payload column to `control.job_queue`** (D196). It is the one cross-tenant table and it
  carries references only. If a job seems to need data, put a row in the tenant's schema and
  reference it.
- Let the hub validate, repair or reshape a proposal. It passes the model's tool call through as
  returned; malformed output is an error. A hub that fixes proposals becomes an authority on
  capabilities (H2). And do not add authentication to the B0 hub piecemeal — its value is in being
  obviously unfinished.
- **Add a database dependency to `server/src/turn.js`** (D206). B7a added `/v1/ask` rather than a
  flag, precisely so the stateless path is not something a later edit can quietly undo, and
  `test/db-static.test.mjs` enforces it. Questions go to `/v1/ask`; proposals go to `/v1/turn`.
- **Return an answer the system cannot attribute to a retrieved article** (D205). `/v1/ask` answers
  through an `answer` tool with an `answered` boolean; a citation of an article that was not
  supplied is dropped, and `answered: true` with no surviving citation is **downgraded to a
  decline** — an unattributable answer is an answer from training wearing the company's authority.
  Do not relax `tool_choice`, and **do not add a general-knowledge fallback when retrieval finds
  nothing.** That is the whole of B7a and there is no flag for it.
- **Set `RELEVANCE_FLOOR` over a fused RRF score** (`server/src/kb/retrieve.js`). It is `null`,
  and that is now **measured rather than deferred** — `npm.cmd run kb:floor`, register §5.16c.
  **A floor over fused RRF scores cannot work by construction:** every top score is `2/61` (both
  legs agreed at rank 1) or `1/(60 + rank)`, so **the score encodes rank and leg agreement and
  carries no similarity magnitude** — discarding magnitude is what RRF is *for* (D174 chose it so a
  `ts_rank` and a cosine never have to be reconciled), and magnitude is exactly what a floor needs.
  The distributions overlap because the dense leg returns **every** chunk for **every** query — a
  dense leg has no "no match" — so an uncovered question's nearest neighbour scores the same
  `1/61` as a correctly-retrieved covered question whose phrasing shares no terms with its article.
  **If a relevance signal is wanted, threshold the raw semantic cosine BEFORE fusion, or use leg
  agreement explicitly** — both are new mechanisms needing a decision, not a value for this constant.
- **Let a client name its own tenant.** `/v1/ask` refuses `tenant`/`tenantId`/`tenantLabel` in
  the request body with a 400. B7a's tenancy is a server-side log label because device
  authentication is not built (D61, D132), and a client-supplied tenant becomes the tenancy model by
  default — which is worse than having none. **`POST /v1/enroll` (B3) is the one deliberate
  exception, not a violation of this rule**: it DOES take a tenant slug from the client, because the
  claim is authenticated by the enrollment secret (D81) — a device does not get believed just for
  saying whose it is, it has to also produce the secret only that tenant has. See
  `src/devices/route.js`'s header before assuming a second route has made the same mistake.
- **Put retrieved chunk text in a system prompt, or let it leave the hub** (G4, D53). Articles go in
  a user-role message inside a delimited block, marked as reference material and not instruction;
  `/v1/ask` returns article IDs and counts, never chunk text.
- **Quote a retrieval quality number from B7a without the caveat.** Six articles, **no
  cross-encoder reranker** (D207), and a dev embedder that is **not D199's model** (D203). Every
  figure is a FLOOR, not a measurement of the design.
- **Embed a corpus with two different models.** Vectors from different models are in different
  spaces and retrieval is then confidently wrong for part of the corpus.
  `control.kb_chunks.embedding_model` exists to make that detectable; `npm.cmd run kb:status`
  reports it, and `node bin/kb.mjs reembed` is the fix.
- **Attach a permission to an admin user, or add a per-user permission table** (D152, D222). Roles
  carry permissions (`control.admin_role_permissions`); users carry roles. `permissionsFor()` in
  `server/src/admin/users.js` is the one join, and `test/admin-static.test.mjs` fails if a table or
  query shaped like a per-user grant appears.
- **Create an admin without a TOTP secret, or add a flag that skips it** (D156, D222).
  `createAdminUser()` always mints one and the login refuses an account without one. The flag
  would be used on the day it mattered.
- **Put the console in `GET /`'s route list, or let a page under `src/admin/pages/` interpolate
  without the `html` tag or use `raw()`** (D221). The console is a browser surface with its own
  session auth, not an API, and the route lists exist to state what carries
  `x-matic-hub-auth: none`. `html\`…\`` escapes every interpolation; `raw()` stays unused — the
  article editor (D230) is a structured form over plain prose and one-line-per-entry lists, not
  markdown, so it needed no exception, and the one field that IS markdown (`body`) is not editable.
- **Let the console write to `control.kb_*` by any route but `ingestAndEmbed()`** (D228,
  `server/src/kb/ingest.js`), or give the console's search its own SQL over `kb_chunks` instead of
  composing `src/kb/retrieve.js`'s three exported functions. Same argument as D224 one layer over:
  exit criterion 1 is "the page's counts equal what `kb:status` prints", which tests nothing unless
  both read the same function. `test/admin-static.test.mjs` §5a fails if either drifts. And the
  embed step is **refused**, never converged, when a second embedding model would appear —
  `node bin/kb.mjs reembed` is the deliberate way to change models.
- **Draw a threshold, floor or "good match" line on the console's search results** (§5.16c). The
  screen shows both legs' ranks, the fused score and whether both legs agreed, and says in words
  that the score carries no similarity magnitude. The semantic leg's cosine IS a magnitude and is
  shown on the leg, where it means something.
- **Show a retrieved chunk's TEXT on a console page for a chunk the model did NOT receive**
  (**D226**, decided 2026-09-09 narrower than it was asked; D53). The sent set — the top
  `DEFAULT_TOP_K` — is quoted on the search page; everything below that line shows ranks and score
  and no text. Do not "improve" this by rendering `text` from the legs or the fusion: those arrays
  are stripped of it in `src/admin/kb-search.js` on purpose, so the rule cannot be broken by
  forgetting a condition, and `test/admin-static.test.mjs` §5a fails if the strip is removed. It is
  not markdown; `raw()` stays unused.
- **Log question text without the sweep, or raise its retention past 90 days** (D229, ratified
  2026-09-09; D227 followed and the demo hub logs). `logRetrieval()` clears text older than the
  window inside every write and `questionRetentionDays()` caps the window at 90 — a customer may
  shorten it, nobody may lengthen it, 0 turns text off. The row stays; only the sentence expires.
  A logged question has no user attached, so deletion is by expiry, not by person — that belongs in
  D127's disclosure wording, which still does not exist.
- **Write SQL against `tickets` anywhere but `server/src/tickets/`** (D224). The CLI and the console
  read through `query.js`; when the console is doubted the CLI is what gets trusted, and that only
  proves something if the two cannot disagree.
- **Make the session cookie's `Secure` flag unconditional without TLS, or bind the hub off loopback
  while it is conditional** (D222, `server/src/admin/session.js`). Today `Secure` is set only when
  the socket is TLS or `MATIC_ADMIN_COOKIE_SECURE=1`, and the loopback refusal is what makes that
  safe. The day the bind changes, the flag becomes unconditional the same day.
- Put broker logic in the renderer, or import `client/src/broker/win32/*` or `capabilities/*` from
  anywhere but a `Broker` implementation. `client/src/broker/broker.d.ts` explains why.
- **Offer a consent card the user did not provoke** (**D198**). A greeting answered with a card is a
  defect even when every gate behaved correctly: it teaches the user that the card is noise to click
  past, and `consent-surface.test.mjs` will still pass on the day it has become furniture.
  **D165's social layer is BUILT as of 2026-09-04** (D212, register §5.19):
  `client/src/router/social.js` plus the social branch of `classify()`, called **unconditionally**
  from `Agent.propose()` ahead of every provider call and of `routeByState()`. The observed case
  ("Hello how are you?" → a `renew_dhcp` card) is the first assertion in
  `client/test/classify.test.mjs` §4. **This removed one source of unprovoked cards, not the
  general possibility** — the rule stands.
- **Let `routeByState` answer a complaint it was not about** (**D219**, §5.21). It reads the
  sentence now — not to route on it, but to decide whether it is ENTITLED to ignore it, which it is
  only when the sentence has no subject in it ("help", "nothing works"). Ignoring the text is right
  for that case and is the Day-4 exit criterion; it is how "my laptop screen is cracked" came back
  as "the print spooler service is stopped". **Its signature is `routeByState(text, probe, evidence)`
  and it THROWS on a non-string**, because a caller passing the probe first would otherwise get a
  silently narrower answer. A new state branch needs a `topic`, or it can never fire.
- **Put the escalation `summary` in anything the avatar says** (**D214**, §5.20). It is schema'd as
  a **case note for the assignee**, third person, and splicing it into the spoken reply is why the
  avatar said *"The user reports a cracked screen."* on 2026-09-04. The spoken line comes from
  `escalationReply()` in `client/src/agent/prompt.js` — one generator, all three providers — and
  three test files assert the reply does not contain `summary` and does end in a question. **Pin
  the contract, never the phrasing:** the assertions that broke when this was fixed were pinning
  wording that had been wrong all along.
- **Tell the user a filed ticket has reached anybody** (**D213**, `server/docs/B6-TICKET-STORE.md`).
  There is **no outbound email**, so per D86 the store is a record and not a queue. `notified:
  false` is on the response, `/v1/health`, the review card, the transcript and every CLI listing —
  five surfaces, so that claiming otherwise means ignoring a value rather than not knowing one.
- **Write a social line, a fallback sentence or the assistant's name anywhere but
  `client/src/router/persona.json`** (**D234**). Greetings, how-are-you, thanks, farewell, off-topic,
  the boot line and the two last-resort sentences are persona DATA, rotated by `social.js`; the
  classifier reads the vocatives from the same file. `test/persona.test.mjs` fails if a persona line
  names a capability (checked against the catalog's own words) or claims an outcome — which is why
  the file holds the NAME and not the capabilities, whatever a request says. Hub prose (declines,
  answers) is H5-attributed and is not the persona's to rewrite.
- **Put a developer control back on the end-user panel** (**D240**). No scene switcher, no
  inspector-variant toggle, no state name, no voice pill, no `source: tier0` line at the user.
  `data-scene` has two values in the app, `first` and `live`; `data-variant` is ours and is set in
  `index.html`; the theme is the one control that IS the user's, and it persists (D243).
  `test/panel.test.mjs` fails on a `data-set` attribute in `index.html` or on our vocabulary inside
  a user-visible string. **And do not delete a line saying what the system did NOT do** to make the
  surface calmer — "nothing was filed", "no email was sent", "whether it was stored is unknown"
  each exist because of a shipped defect (D86, D205, D213, `700d920`).
- **Read the camera or microphone consent store, spend a probe's threshold as a constant, or let a
  row give advice** (**D256**, `client/docs/RESTART-SIGNAL.md`, register §5.39). Four rules, each
  with a shipped-defect or a founder decision behind it. **Nothing reads the consent store** — it
  records every app that has EVER used the camera or microphone with timestamps (87 microphone and
  22 webcam entries on the spec's machine), so it is a behavioural log of what software someone runs
  and when; permission state is out too, by founder decision, **because it lives in the same
  registry tree and a maintainer widening the read is one line away**, and
  `test/restart-signal.test.mjs` §9 is the check that catches that line (six patterns over seven
  files, plus "exactly three registry keys, all under HKLM"). **Every threshold is a CONFIGURABLE
  DEFAULT and never a constant** (`config.json`'s `restartPolicy`): the spec's §6 says of itself
  that no verified source establishes 30 days — or any figure — as an evidence-based restart
  interval, so a constant would be a claim the code makes. **The evidence in the sentence describes
  the READING, not the band it fell into** — the clauses were named after the default bands, and
  with a band lowered the real panel said *"hasn't been restarted in more than a fortnight"* about a
  machine up **1.35 days**; every copy rule passed and the evidence was false, which is the half the
  spec says earns compliance. The band decides WHETHER to speak; the reading decides HOW IT IS SAID,
  from the same `durationWords()` the row uses. **And say "restart", never "shut down and turn it
  back on"** — under Fast Startup a shutdown is a kernel hibernate, so it does not clear the session
  and **the fix does not apply.** Also: no tick counter anywhere (`TickCount` wraps at 49.7 days, so
  the machines that most need flagging are the ones that would report clean), no `Get-Counter` (it
  killed the PowerShell host twice and resolves localized names), **`PendingFileRenameOperations`
  can never fire alone** (two entries on a machine rebooted 27 hours earlier that needed nothing),
  an unreadable probe returns `null` and never a zero, and **nothing is raised on a timer** — the
  moment rides on a turn the user started (D198), and once declined it is not raised again this
  session.
- **Hand the panel markup to interpret, or "tidy" a string the card promises is sent verbatim**
  (**D255**). The hub's answers are written by a model and models emit markdown: one reached the
  screen as `is \`Ctrl + Y\`.` with the backticks showing. The fix is NOT `innerHTML` — D130 forbids
  it and the consent surface rests on that — so `src/renderer/model-prose.js` returns RUNS
  (`[{text, code}]`) and `prose()` appends a text node or a `<code>` per run. **Use `prose()` for
  text a MODEL wrote and `el()` for everything else.** The hub is also asked for plain sentences in
  `server/src/kb/answer.js`, which lowers the rate and cannot replace this: a model is not a
  contract. **SINGLE `*` AND `_` ARE NOT EMPHASIS AND MUST NOT BECOME IT** — `needs_human_judgement`,
  `server_side_outage` and `restart_service(serviceName=spooler)` are on the review card (D244/D128),
  and a naive `_x_` rule makes the first one `needshumanjudgement` on the one screen where a user
  approves data leaving the machine. A stray `*word*` is a blemish; a mangled enum is a lie. **Not
  transformed, on purpose:** the consent card's four `consentRendered` clauses (only
  `proposal.reasoning` goes through it), and **the review card's case note, which IS model-written** —
  the card labels it "Sent exactly as it reads." and D128 requires the user to see what is sent. And
  in `say()` the markers come off BEFORE D249's redaction, with the log comparing `heard !== said`
  rather than `heard !== text`, or the redaction notice fires on any answer containing a backtick.
- **Let a surface describe an egress outcome it has not been told** (**D253**). The review card wrote
  "Sent by you" on the CLICK, before `fileTicket()` had been called — so a failed filing left the card
  claiming it had been sent, three lines above a note saying nothing was filed, with the card still on
  screen. **The card cannot know; only the caller holds `filed`.** `reviewTicket()` resolves
  `{ approved, report }`, the click writes "Sending…" and a note about the DECISION, and `report(filed)`
  writes the outcome — called on BOTH branches and BEFORE either speaks, so the card and the spoken line
  cannot disagree. **Three endings, because D213 has three:** a timeout (`filed === null`) is
  "Sent, not confirmed", and picking either other ending there is the confident guess D213 spent five
  surfaces avoiding. And `persona.filing`'s comment names the split the whole path now uses — **the
  card's note is the DECISION, the transcript's note is the SYSTEM's half** — which is also why the
  cancel note is "Cancelled by you." and not "Cancelled by you — nothing was sent."
- **Speak this machine's name, the signed-in account, or this machine's own address** (**D249**).
  Charles: *"Speaking computer names could be tricky especially in a corp environment. Ok to display
  computername but it should say this pc"*, then *"do the username too"*, then *"fix 2 and 3 as
  well"*. All three may be SHOWN — the machine band, the review card, the address row — and the name
  and account go on the ticket. **None is said.** `say()` is the only thing in the renderer that
  reaches the voice and it renders one string and speaks another; the rule is in
  `src/renderer/spoken-form.js`, kept pure and separate **because `renderer.js` touches `document`
  at module scope and no headless test can import it**. Said as "this PC", "your account" (a noun
  phrase, because it drops into sentences we did not write and *"you is signed in"* does not read)
  and "an address" (having one is the whole evidence a lease renewal worked). **Four things not to
  "simplify", each of which is wrong in a way reading does not show:** the boundary is not `\b` —
  a hyphen is a word boundary, so `OLD-FIN-LON-0442` would match; the optional `DOMAIN\` prefix and
  `@domain` suffix are part of the match, or `CORP\a.petrova` becomes `CORP\your account` with the
  domain read out instead; an address may not exclude `.` on its right, because sentences end; and
  the three-character floor stays, because a machine called `PC` would rewrite the word "pc" in
  every sentence. **The addresses are this machine's own LITERAL values, never a pattern** — a hub
  answer may legitimately say "try 8.8.8.8", and redacting that destroys the answer rather than
  protecting anyone. **And they are re-learned from the broker's `detail` before anything speaks an
  execution result**: `renew_dhcp` exists to CHANGE the address, so its message carries one the last
  probe cannot have seen — the one capability the rule could not reach on its own. The digits stay
  ON SCREEN, because `probe.test.mjs` requires a self-assigned `169.254.x.x` to be shown and that
  requirement has a hardware finding behind it. **Nothing spoke the name or the account before this existed, and that was an
  accident of three unrelated decisions** — one of which is only a habit (the catalog's consent text
  happens not to mention the machine, while the DESIGN's own placeholder card says *"…on
  PLACEHOLDER-PC"*). **The address WAS spoken**, by `renew_dhcp`'s success line.
- **Report what an executor did in the MECHANISM'S name** (**D250**). "Flushed the DNS resolver
  cache", "Renewed the DHCP lease" — those are Microsoft's names for the mechanisms, they are what the
  catalog `title` is for, and they are what the INSPECTOR shows. The report a user hears is written
  in the catalog's `plain.what` words — the same ones on the consent card — so it is **the description
  they approved**, matchable to what they agreed to. Same for `describeAddress`'s phrases, and no
  catalog title reaches `say()` any more. **The TITLES are unchanged and must stay** — a title is the
  capability's identity and the model's handle on it. `validate().errors` keep the mechanism's name
  too (D247): that is the gate explaining itself to the inspector. `broker.test.mjs` §11 runs a real
  `flush_dns` and fails on `DHCP|DNS|resolver|lease|TCP|IP address|APIPA` in a spoken report.
- **Put a machine's own vocabulary in `ExecutionResult.message`** (**D247**). The renderer SPEAKS it
  on every path — success, failure, needs-broker, and every consent-gate refusal. It carried
  `OpenServiceW(spooler) failed (Win32 error 5)`, `no consent nonce was presented`, and
  `refused at execution time: <gate messages>`. Each is a pair now: the spoken sentence, and the
  machine's version on `detail` (`detail.win32`, `detail.consent`, `detail.refusal`) and in the audit
  record. **`validate().errors` are the exception and stay as they are** — capability ids, adapter
  GUIDs and control masks, because that is the gate explaining itself to the inspector; what changed
  is that the renderer no longer interpolates one into `say()`. **And a service is named by what
  WINDOWS calls it** (`plain.serviceNames` in the catalog — `services.msc`'s display name), never by
  its registry key: `spooler` is not a name a user can look up. `broker.test.mjs` §11 and
  `consent-surface.test.mjs` §4b fail on any of it.
- **Return ONE `error` field from a failed egress and let the surface speak it** (**D246**).
  `fileTicket()` returns `error` — what the user is TOLD, from `persona.filing` — and `detail` —
  what WENT WRONG, which is ours: the URL, the HTTP status, the hub's own error text, the exception.
  The renderer speaks the first and routes the second to the inspector, the developer log and the
  egress record. One field doing both jobs is why the avatar said *"Could not reach the hub at
  http://127.0.0.1:8787: fetch failed"* out loud. **Nothing is deleted** — every diagnostic moved to
  `detail`, which is now the richer of the two. Also: **"the hub" is our word for it and the panel
  says "the service desk" to a person** — the rail, the standing band, the review card's caveat, the
  tickets band and every persona line. `test/panel.test.mjs` §5b scans every literal `renderer.js`
  puts in front of a user (an `el()` third argument, a ternary of two in that position, and every
  literal in a `.textContent = …;` statement) and fails on `hub` or a URL; the inspector's payloads
  and `SOURCE_NOTE` are deliberately outside that scan, because that is where those words belong.
  **"In this build" is NOT on that list on purpose:** `persona.tickets.some` says it in exactly those
  words and D242 requires the band and the spoken answer to agree, so changing it on one surface
  breaks the pairing silently.
- **Put a closed enum on the end-user surface as itself, or hide the field to avoid it** (**D244**).
  The review card printed `CATEGORY needs_human_judgement`. It is GLOSSED — plain words as the value,
  the stored value under it and subordinate — because the card is the payload view and D128 requires
  the user to see what is being sent, so a field they are approving cannot be the field that
  disappears. `ESCALATION_PLAIN` in `renderer.js` holds the words; `ESCALATION_CATEGORIES` /
  `ESCALATION_OWNERS` in `src/agent/prompt.js` stay the authority on which members exist, and
  `test/panel.test.mjs` fails on a member with no gloss, a gloss that still has an underscore, or
  any snake_case token in a string the renderer writes at the user. **Do not gloss by de-underscoring**
  — that is right for all five of today's owners by coincidence and wrong for the first acronym
  (`it_security` → "it security"). And **`ESCALATION_OWNER_LABELS` is the SPOKEN form**, carrying the
  article the avatar needs ("the identity team"); it is not the card's table.
- **Say a fact about what the system did NOT do twice in one exchange** (**D245**). The card said
  "no email is sent in this build" and the transcript repeated it three lines later in different
  words, with the card still on screen. **It lives on the surface shown BEFORE the user acts** — the
  card, because that is where honesty about what sending achieves has to be — and the post-send line
  carries the reference and a pointer to it. **This is not a licence to delete such a line**: D213's
  surfaces are intact, the card IS in the transcript, and the test checks both halves (the caveat
  must contain it; the post-send note must not mention email, notification or alerting).
- **Hand-edit `src/renderer/panel/matic-panel.css` or `panel-check-frame.html`** (**D241**). Both are
  generated — `npm.cmd run panel:build` — and a design change ARRIVES AS A NEW DELIVERY, because the
  panel came as a harness with no source files. App-only rules go in `matic-panel.app.css`, which may
  use the 39 `--matic-ui-*` tokens and **may not redefine one**; a test enforces that, because an
  override there makes the delivery a lie without changing a byte of it. **ONE EXCEPTION, GRANTED BY
  THE DELIVERY IN WRITING (D252):** the four `--matic-ui-live-*` values are declared as stand-ins —
  Claude Design does not have `matic-avatar.css` and cannot know them — so the app substitutes
  exactly those four and nothing else. **The test reads the delivery's own words rather than holding
  an allow-list**, so the exception dies the day the delivery stops calling them placeholders.
  `buildPanelCss()` also CHOOSES a `<style>` block now (the re-export labels the contact sheet's own
  chrome `id="sheet-only"`) and still throws on anything it does not recognise: an `id` is the
  DELIVERY's decision, and **this script must never be the thing that decides which rules the app
  needs** — the moment it does, `panel:check` proves the app matches the script's opinion.
  **App.css is 123 lines and its "knowing exceptions" section is EMPTY; keeping it empty is the
  measure of whether the arrangement still works.** If a colour or a spacing looks wrong on screen,
  write a design handover, not an override.
- **Send to `win.webContents` without `isDestroyed()`.** The Piper worker's exit line arrives after
  the window is gone and produced an uncaught-exception dialog on every close (2026-09-10).
- **Add a capability to `catalog.json` without a `plain.helpsWith`** (**D235**) — the phrase, in
  the user's words, that the capability answer is generated from ("a printer or another background
  Windows service has got stuck and needs a nudge", not "restart a Windows service").
  `test/persona.test.mjs` fails on a capability without one. And **do not answer "where's my
  ticket?" from the hub on a self-asserted `osUsername`** — the endpoint answers from its own egress
  record and says status lookup is not built; a hub-side lookup by a name the client typed is D54's
  user identity through the back door.
- **Hand-write a list of what the assistant can do.** The capability answer is generated from
  `broker.listCapabilities()` (D165, D212): a hand-written list is a claim, a generated one is a
  fact, and with an unreadable catalog the assistant promises nothing rather than claiming from
  memory. Read tier labels from `capability.tierInfo`, never from `broker.catalog` — reaching
  through a Broker into its catalog is the layering violation `broker.d.ts` exists to prevent.
- **Type an avatar state name into `client/src/renderer/avatar/`** (**D232**). The manifest is the
  state table; `avatar-model.js` reads it and `test/avatar.test.mjs` fails on a state literal in the
  model or the element. The renderer names states because it DRIVES them — that is the one place.
  Likewise: do not hand-edit `matic-avatar.assets.js` (generated — `npm.cmd run avatar:build`), do not
  edit the SVG or CSS copies inside `matic-avatar-harness.html` (the delivery's own rule), and **do
  not swap `viseme-map.js` for the manifest's `phonemeToMouth`** — `npm.cmd run avatar:compare` is
  the measurement that says why (the manifest's table is eSpeak ASCII; Piper emits IPA), and any
  change to which table drives the mouth re-runs it first.
- **Put `escalating` on an offer, or `error` on a failed fix** (**D232**, v7 placement rules).
  `declining` is "I cannot help with this and here is a ticket if you want one" — the KB decline AND
  the escalation offer, held until the user answers; `escalating` is a ticket that EXISTS and has a
  number; `apologising` is a fix that ran and did not help; `error` is our fault (the hub gone, the
  agent half asked to do privileged work, a filing that failed). The state under the face is the
  element's `statechange` event, not the caller's intent — if it ever reads `idle (refused: …)` the
  call site asked for something the manifest forbids at that size.
- **Read `HubLink`'s state as authentication, or say "the hub signals the agents"** (**D233**).
  It is reachability of a hub that identifies itself by response shape — `status().authenticated` is
  `false` on purpose until D61 exists. And the hub holds no list of endpoints to signal: they come to
  it (D114), so a restarted hub is rediscovered within one interval with nothing to replay. The
  heartbeat RESPONSE is the hub's directive channel; a bounded `heartbeat.intervalMs` is already
  honoured client-side and nothing else is.
- Let the model author consent text. Consent wording is catalog data (`plain/*` in `catalog.json`).
  **Verified on screen 2026-09-03:** the only model-authored string on the card is the labelled
  "Why this, here" line (`proposal.reasoning`). Nothing else on the card came from anywhere but
  `consentRendered`. If you add a string to the card, that stops being true.

## Working rules the project has learned the hard way

- Bugs are found by using the software, not reading it. Run the thing.
- State limitations before being asked; every handover carries an honesty ledger. Keep it.
- Commit messages: what changed and why, in prose. Co-author trailer for Claude:
  `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
