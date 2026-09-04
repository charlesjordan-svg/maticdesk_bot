# PROJECT_START_HERE

**Read this first, every session. Then read the documents it points to — fresh, not from memory.**

**Last updated:** 2026-09-04 (2026-09-03: repo restructured: `client/`, `server/`, `docs/decisions/`; `post-demo` merged to `main`; register consolidated; consent-surface finding demonstrated; prompt prefix measured; C9 corrected. Evening: register-merge handover applied — D151–D161 and OPEN-8 appended, consent protocol design filed, prompt caching verified live on Sonnet 5. **Night: first-build-steps handover applied — D130 two-step consent implemented and its XFAILs promoted; B0 hub walking skeleton built in `server/` and `HubClient` added; bake-off through the hub identical to direct on 40/40; D162–D165, OPEN-9, register §5.10 and §10.4; generic KB v2 filed in `docs/kb/`. Four of the five documents Task 0 asked for were not on disk — see §4.** **Night, later: the four missing documents were supplied and filed** — threat model and Phase 1 plan to `docs/`, the B0 spec to `server/docs/`, the KB schema findings and the KB architecture document to `docs/kb/`, handovers to `docs/handovers/`. **OPEN-5 is closed.** The KB architecture document's decisions are merged as **D167–D192** (register §5.11) — before that merge the register contained zero occurrences of "hybrid" and zero of "review queue", so the retrieval architecture and the admin home surface were recorded nowhere. Its §3 was rewritten against the retrieved KCS v6 findings. The renderer click-through checklist is at `client/docs/D130-RENDERER-CHECK.md` and is **for Charles to run**. **Then B1 built** (D143): control-plane schema, a migration runner reaching the control plane and every tenant schema in one run, tenant creation, the reference-carrying job queue, and `withTenant()` as the single door — **D193–D197**, including that **pgvector is installed once per database, not per tenant** (the instruction as given could not be carried out) and that **`search_path` is not a permission boundary**, so exit criterion 2 holds against accident and not against intent. **B1's six exit criteria pass** — `npm.cmd run test:db`, 56 assertions on PostgreSQL 17.11 with pgvector, run against a fresh database, a reused one, and a destroyed-and-rebuilt volume. Running it found one bug, in the test fixture rather than the schema; no migration SQL needed a correction. **D130's renderer half is verified on a screen** (§1 and §2; §3 and §4 still open) — register §10.3a. **D198** came out of that same sitting: a greeting produced a consent card, which makes D165's social layer a safety requirement rather than polish, and pins it ahead of the state fallback. **2026-09-04: the embedder is decided — D199, `snowflake-arctic-embed-m-v2.0`, proposed** ([`docs/2026-09-04-embedder-decision.md`](docs/2026-09-04-embedder-decision.md)), which unblocks B7 and clears the last of the Phase 1 plan's two "blocking now" items. Both had in fact been resolvable already: the embedder's gating `[VERIFY]` was confirmed the previous day. **voyage-4-nano is now open-weight and is the one to revisit if its shared-vector-space claim is ever verified (D199a).** **Then the named-pipe protocol was designed — D200–D201** ([`client/docs/2026-09-04-named-pipe-protocol-design.md`](client/docs/2026-09-04-named-pipe-protocol-design.md)), unblocked by D130 having been verified on a screen. It surfaced a blocker: **libuv passes NULL security attributes to `CreateNamedPipeW`, so a LocalSystem-hosted Node pipe grants the unprivileged agent read and no write** — the transport needs native creation with an explicit logon-SID DACL, a costed exception to D98. **That blocker was then MEASURED, not left as a citation** (`npm.cmd run verify:pipe`, register §10.5): the DACL was read off a live Node pipe and the access check refused `GENERIC_WRITE` with ERROR_ACCESS_DENIED. Nothing is built. **Ratified by the founder on 2026-09-04: D199, D199a, D200, D201, and then D167–D192 and D193–D197 as sets** — the embedder, the pipe protocol and its transport, the KB architecture and the B1 control plane are all settled. Three caveats in §5.11c survive that and are not softened by it (D173's premise was not confirmed against KCS; D174's reranker is unretrieved; nothing is measured on our corpus). **Still proposed: D130–D150 and D152–D160** (OPEN-6's identity model) — and note that **B1's ratified schema already contains D152–D160's table shapes** (`totp_secret`, `external_issuer`, `admin_roles`, `event_class`, `step_up`, `vendor_access_grants`), which is not a defect but is not a ratification either: register §5.7. **2026-09-04, later: D152–D160 RATIFIED as a set by the founder** (register §5.7) — a separate act from B1's ratification the same day, which is the distinction §5.7 exists to preserve; **D158 is ratified but INERT in Phase 1** (do not build an approval workflow); **D202 is proposed and awaits Charles** (§5.7a). **§5.7b adds the migration provenance convention** and it is applied retroactively to `001-control-plane.sql`. **Then B7a was built — the knowledge base** ([`server/docs/B7a-KNOWLEDGE-BASE.md`](server/docs/B7a-KNOWLEDGE-BASE.md), register §5.16, D203–D207): `migrations/control/002-generic-kb.sql`, `src/kb/` (chunking, embedding provider, hybrid retrieval, the answer contract), `POST /v1/ask`, `bin/kb.mjs`. **Three of the B7a spec's premises turned out to be wrong and all three changed the build.** (1) **D199's embedder is NOT in Ollama's library** — the tag that exists is the **L** variant, a different architecture, 568M against 305M, 1024 dims, and MTEB-ranked *better*, so **dev latency is a pessimistic proxy and dev quality an optimistic one**; it is a dev runtime choice and **not** an amendment to D199 (D203). (2) **Nothing in this system could return a prose answer** — `tool_choice: "required"` on both providers and HTTP 502 on a no-tool-call — so answers come through an `answer` tool whose `answered` boolean makes the decline a **testable field**, and an answer citing no supplied article is **downgraded to a decline** (D205). (3) Adding a database to `/v1/turn` would have meant deleting the test that keeps it stateless, so questions went to a **second route** (D206). **The reranker is now retrieved and deliberately NOT picked** (D207) — a cross-encoder costs **per-query × per-candidate**, roughly an order of magnitude more work than the embedder, and no latency measurement exists; **so every retrieval number B7a produces is a FLOOR.** **EVERYTHING IS RUN AND PASSING** (a Docker Desktop update to 29.7.2 cleared the engine failure that had blocked the database half): **169** assertions with nothing installed, **108** against PostgreSQL 17.11 (`npm.cmd run test:db`), **30/30** on the spec's §8 acceptance list end to end through a real hub and a real model (`npm.cmd run kb:accept`) **including 5/5 on the negative test**, **18** on the answer contract against `mistral-small:24b` with no database — including 5/5 declines when handed a *relevant-looking* article that does not answer the question, and a prompt-injection inside the article block that does not flip the decline — and `client/`'s **278** unchanged with 0 XFAIL, which closes acceptance item 9. Migration 002 applied clean, and the bare `vector(1024)` resolving inside `control` through `withControl`'s `search_path` went from reasoning to fact. **And the relevance floor is now ANSWERED rather than deferred, with the answer that the mechanism is wrong** (register §5.16c, `npm.cmd run kb:floor`): every fused top score is `2/61` or `1/(60+rank)`, so **an RRF score encodes rank and leg agreement and carries no similarity magnitude** — which is what RRF is *for* and exactly what a floor needs, so the distributions overlap for a reason more articles will not fix. It stays `null` and the prompt carries the decline. `BROKER-SURFACE.md` now lists D201's pipe-lifecycle calls, marked DESIGNED-NOT-BUILT, which was the precondition ratifying D201 accepted. The six traps are now rules in `CLAUDE.md`. **Next session starts here: [`docs/handovers/2026-09-04-claude-code-handover-b7a-built.md`](docs/handovers/2026-09-04-claude-code-handover-b7a-built.md)**.)
**Project home:** `C:\Users\Charles\Downloads\maticdesk_bot\` — git repo `charlesjordan-svg/maticdesk_bot` (private) and Obsidian vault in one. Product code is `client/` and `server/`; notes are `Projects/`.

This file is an **index of pointers, not content**. If you find yourself explaining architecture
here, it belongs in one of the documents below instead. Update the "Last updated" date and the
Status table whenever something material changes.

---

## 1. What the project is

**Matic Desk** — an AI IT-support assistant for corporate Windows endpoints, sold as an alternative
to outsourced L1 service desk. A user talks to an animated avatar in their taskbar; it diagnoses the
problem, fixes it on the machine, and escalates to a ticketing system when it cannot.

Two halves on the endpoint: an **unprivileged agent** (UI, avatar, model client, local router) and a
**privileged broker** (executes typed Win32 primitives). A future **hub** provides fleet identity,
signed content distribution, central audit and ITSM integration.

---

## 2. Status at a glance

| Area | State |
|---|---|
| Working demo (Electron, standalone mode) | **Built and verified.** Three scenarios run end to end |
| Avatar + local TTS (Piper, lip-sync) | **Done.** CSS-drawn, no GPU, resolution independent |
| Broker + four Win32 primitives | **Done** in-process behind the real interface |
| Hub / server side | **B0 walking skeleton built 2026-09-03; the B1 control plane built the same night** (`server/`). B1: `migrations/control/001`, `migrations/tenant/001-002`, `src/db/` (pool, `withTenant`, runner, tenants, jobs), `bin/db.mjs`, `docker-compose.yml` on PostgreSQL 17 + pgvector. **76 assertions pass with no database, and the six exit criteria pass against PostgreSQL 17.11** (`npm.cmd run test:db`, 56 assertions) — [`server/docs/B1-CONTROL-PLANE.md`](server/docs/B1-CONTROL-PLANE.md) §10. Read its §6 before answering any question about tenant isolation: `search_path` confines accident, not intent. `/v1/turn` stayed stateless on purpose. B0 itself:: `POST /v1/turn`, one OpenAI-compatible provider on local Ollama, imports the client's `prompt.js`, faithful pass-through, **no authentication and loud about it**, loopback only. 33 headless assertions. Device auth, tenancy, persistence, KB retrieval, audit ingestion, TLS, spend caps: not built, no stubs. **The B0 spec is now on disk at [`server/docs/2026-09-03-B0-walking-skeleton-spec.md`](server/docs/2026-09-03-B0-walking-skeleton-spec.md)** and carries a supersession block: its §5 target of "should reproduce 35/40" is wrong — both paths scored 33/40 and were identical on all 40 cases. **Its §5 acceptance list is now known and every item is mapped to an existing test in the spec's own §5a** — with three qualifications recorded there, the largest being that item 1 runs headless and has never been clicked through in the renderer. |
| Hub provider on the endpoint (**D164**) | **Done 2026-09-03.** `client/src/agent/hub-client.js`, third provider, `config.provider: "hub"`; default unchanged (`"cloud"`). `Proposal.source: "hub"` + `hubProvider` = the hub's claim, never the endpoint's knowledge. Tier-0 never routes through it (D46b, pinned). **Bake-off through the hub: identical to the direct path on 40 of 40 cases**, median latency delta 1 ms (`client/docs/BAKEOFF-2026-09-02.md` §2c) |
| **Knowledge base / question answering (B7a)** | **Built and verified 2026-09-04.** `POST /v1/ask`: hybrid retrieval (lexical `tsvector` + GIN, semantic pgvector + HNSW, RRF fusion, platform pre-filter in BOTH legs per D162) over the six generic articles, then an `answer` tool that declines when they do not cover the question. [`server/docs/B7a-KNOWLEDGE-BASE.md`](server/docs/B7a-KNOWLEDGE-BASE.md), register §5.16. **Verified:** 169 assertions with nothing installed; **18 against `mistral-small:24b`** (`node test/kb-answer-live.mjs`) — 5/5 declines with no articles, **5/5 declines when handed a relevant-looking article that does not answer the question**, positives still answer and cite, an article it was not given cannot be cited even when the question asks, and an instruction planted inside the article block does not flip the decline (G4). **Against a live PostgreSQL 17.11:** migration 002 applied clean, 6 articles → 18 chunks → 18 embeddings, **108 assertions** (`npm.cmd run test:db`) and **30/30 on the spec's §8 list end to end** (`npm.cmd run kb:accept`), including 5/5 on the negative test through real retrieval. `client/` unchanged at 278, 0 XFAIL — acceptance item 9 closed. **The relevance floor is answered, not deferred: a floor over fused RRF scores cannot work by construction** (§5.16c) and stays `null`. **NO CROSS-ENCODER RERANKER** (D207), and the dev embedder is **not D199's model** (D203) — every retrieval figure is still a floor. **No endpoint caller yet:** `HubClient` speaks `/v1/turn` only, and that is the next step |
| Named pipe, Windows Service, catalog signing | **Not built.** Phase 1. The pipe protocol is designed and ratified (D200–D201) and its **native calls are now listed in [`client/docs/BROKER-SURFACE.md`](client/docs/BROKER-SURFACE.md), marked DESIGNED-NOT-BUILT** — that listing was the precondition D201's ratification accepted, and it is done. Still open: the last mile of §10.5 (a real LocalSystem service with a real standard-user agent) and the mechanism (koffi vs N-API vs a signed helper) |
| ITSM integration | **Not built.** Escalation payload is displayed, never sent |
| Performance measurement | **First numbers measured 2026-09-02** — model bake-off only. Everything else is still a target |
| Refusal auditing (`post-demo`) | **Done, unmerged.** `validate()` audits refusals with the gate that fired |
| Local/OpenAI-compatible provider (`post-demo`) | **Done, unmerged.** Off by default; the demo build still uses Anthropic |
| Model bake-off harness (`post-demo`) | **Done, unmerged.** 40 cases; five models measured incl. a cloud baseline. After hardening `claude-haiku-4-5` leads on accuracy (36/40) and `mistral-small:24b` on speed (35/40, 0.3 s faster), both at zero false actions reaching a user. Managed tier: Haiku (D97). Customer-hosted: mistral. *(Corrected 2026-09-03 — C9/D139; this row previously said mistral beats Haiku.)* |
| Wrong-action rate (`post-demo`) | **Zero false actions reach the user** on mistral, gemma and Haiku; zero R2 on all five. Catalog preconditions + tool-description hardening. See `BAKEOFF-2026-09-02.md` §2b |
| **Decision register** | **One file, checked in, owns the numbering. v2.13 (2026-09-04).** D1–D207 (**next free ID: D208**), H1–H6, C1–C12, X-1–X-7, OPEN-1–OPEN-9; §10.4 holds five primary-source verifications (WTS APIs with a correction, ONNX Runtime on ARM64, KCS v6, Windows redo, macOS show-desktop). [`docs/decisions/DECISION-REGISTER.md`](docs/decisions/DECISION-REGISTER.md). D1–D41 still only in the workbook (never downloaded). Two parallel chat documents of 2026-09-03 numbered themselves D130–D168 — **those IDs are void** (register §0, §5.6). **The second of them (the KB architecture document) was found on 2026-09-03 night, filed at `docs/kb/`, and merged as D167–D192 with a void-ID mapping in §5.11a.** The first (`2026-09-03-phase0-decisions-D130-D150.md`) is still not on disk and remains merged from the handover summary. **Two IDs are cited in the register but were never defined — `D46b` and `D52a`; §5.11b says what to cite instead** |
| Consent-surface finding (review §1.1, **D130**) | **Closed 2026-09-03 (night): two-step consent implemented in `InProcessBroker`.** The design (`client/docs/2026-09-03-consent-protocol-design.md`) was attacked first — `client/docs/2026-09-03-consent-protocol-attack-notes.md`: holds; two implementation requirements (clone the retained proposal; supersede-and-audit the outstanding request). `prepareConsent(proposal, {locale})` renders in the broker and retains; `execute(nonce)` runs what was retained; audit records carry `consentNonce` + `consentRendered`. The three XFAILs passed and were promoted; the five §6 additions pass; `npm test` is 277 assertions, **0 expected failures**. What it does not fix (design §5): a compromised agent can still paint different pixels — now attributable, not prevented |
| Prompt caching (**D140**, **D161**) | **Measured and decided 2026-09-03.** Haiku 4.5: shipped prefix 2,104 tokens vs 4,096 floor — cannot cache; deliberately **not padded** (revisit on volume). Sonnet-class: `cache_control` now set in `src/agent/cloud-client.js` by per-model default, **verified live on Sonnet 5** — 2,412 of 2,801 prompt tokens read from cache on the second call. Shipped Haiku request unchanged. `docs/TOKEN-COUNT-2026-09-03.md` §6, `npm run verify-cache` (two real calls) |

**Demo deadline: Sunday 2026-09-06.** The frozen demo build is branch `add-matic-desk-demo` — **rehearse from that branch**, not from `main`. `post-demo` was merged into `main` on 2026-09-03 (after the restructure below); new work goes on `main` or feature branches off it.

---

## 3. Where the code lives

| | Path |
|---|---|
| **Canonical repo** | `charlesjordan-svg/maticdesk_bot` (**private — keep it that way**). Default branch `main` = current code. `add-matic-desk-demo` = the frozen Sunday demo. |
| **Endpoint (client)** | `client/` — `Downloads\maticdesk_bot\client` on this machine. Was `Projects\Ai Chat Bot -Matic\matic-desk-demo` until 2026-09-03 |
| **Hub (server)** | `server/` — spec and phase-one scope only; nothing built |
| **Decision register** | `docs/decisions/DECISION-REGISTER.md` |
| Avatar component source | `Downloads\matic-avatar-v2\` |
| ~~`Downloads\matic-desk-demo`~~ | Superseded copy — **renamed to `matic-desk-delete` on 2026-09-02.** Safe to remove once the push is confirmed good |

**The vault is an Obsidian vault.** Do not run `npm install` at the vault root, and exclude
`node_modules` in Settings → Files & Links → Excluded files.

---

## 4. Live documents — read the relevant ones each session

### In `client\docs\` (and `docs\decisions\` at the repo root)

| File | What it is |
|---|---|
| `..\..\docs\decisions\DECISION-REGISTER.md` (repo root `docs\decisions\`) | **THE decision register.** D1–D150, invariants H1–H6, conflicts, open items, verification. Read before any design or hub thread. Sources under `docs\decisions\sources\` are superseded and use old numbering |
| `..\..\server\SPEC-2026-09-02-hub-server-side.md` | The hub spec, copied into the repo 2026-09-03 with `server\README.md` giving the phase-one scope (D149) |
| `CONSENT-SURFACE-2026-09-03.md` | **`post-demo`.** The review's largest finding, demonstrated against a stub NamedPipeBroker; what D130 must do; acceptance test |
| `2026-09-03-consent-protocol-design.md` | **Filed 2026-09-03; implemented the same night.** The D130 design: two-step consent (`prepareConsent(proposal, {locale})` → nonce + broker-rendered text; `execute(nonce)` runs the proposal the broker retained), the `broker.d.ts` changes, the eight-check acceptance set (§6) — all passing |
| `2026-09-03-consent-protocol-attack-notes.md` | **The second opinion the design's §8 asked for**, written before implementing. Six probes (F1–F6): the variant holds; F1 (in-process reference mutation → clone on retain) and F2 (second outstanding request → supersede and audit) are pinned in tests; F5 records that the "machine-state" refusal of acceptance item 4 fires the `precondition` gate |
| `../test/hub-client.test.mjs`, `../src/agent/hub-client.js` | **The hub provider (D164)** and the test that pins "tier-0 never routes through the hub" (D46b) against a hub that is not running, plus one live turn when `MATIC_HUB_URL` is set |
| `TOKEN-COUNT-2026-09-03.md` | **`post-demo`.** `count_tokens` on the shipped prompt: 2,104 vs the 4,096 Haiku cache floor; the pad-or-write-off choice |
| `HANDOVER-2026-09-02-post-demo.md` | **Most current engineering state.** Read this first for code. Post-demo branch: refusal auditing, provider, bake-off, hardening |
| `HANDOVER-2026-09-02-day4.md` | Day 4 build record. Current for the FROZEN demo build |
| `DEMO-RUNBOOK.md` | Sunday demo: pre-flight, three scenarios, failure playbook |
| `BROKER-SURFACE.md` | Every native API the privileged half touches. The allowlisting document |
| `PHASE1-TICKETING.md` | Ticketing design note |
| `LOCAL-MODEL-PROVIDER.md` | **`post-demo`.** OpenAI-compatible provider: design, and why escalation enums are enforced client-side |
| `BAKEOFF-2026-09-02.md` | **`post-demo`.** First measured model comparison. Read §1 (corrected 2026-09-03) **and §2b** before picking a model — §2b is the post-hardening result |
| `../eval/README.md` | The model eval harness — dataset shape, metrics, what it cannot score |
| `HANDOVER-2026-09-02.md` | Day 1–3 build record |

### Planning artifacts (from Claude sessions, in `Downloads\` or chat outputs)

| File | What it is |
|---|---|
| `2026-09-02-hub-server-side-spec-handover.md` | **Hub specification, v1.** Now also in the repo as `server\SPEC-2026-09-02-hub-server-side.md`. Partially stale — read with the register's §3–§4 deltas |
| `2026-09-02-claude-code-proceed-handover.md` | Current Claude Code work queue + build-freeze rule |
| `Claude Handover Files\2026-09-02-ollama-provider-brief.md` | **Exists** — found 2026-09-03 (this row and the post-demo handover §7 said it was missing; the search on 2026-09-02 missed the subfolder). Its §5 harness design was **met and exceeded** by `eval/` (40 cases vs ~30 asked, false actions split by tier, s/correct deciding). Provider content superseded by hub spec §12 and `LOCAL-MODEL-PROVIDER.md` |
| `2026-09-02-fable-design-review.md` | **Independent design review (Fable, 2026-09-02/03).** Parts A (verified research), B, C. Source of D130–D150. Copy in `docs\decisions\sources\` |
| `2026-09-03-claude-code-handover-register-merge.md` | **Founder handover, applied 2026-09-03.** Merge the parallel D130–D168 chat documents into the register (now §0, §5.6–§5.9, D151–D161, OPEN-8), caching on the Sonnet-class path (D161), keep the XFAIL mechanism, file the consent design. **The two chat documents it names — `2026-09-03-phase0-decisions-D130-D150.md` and `2026-09-03-kb-architecture-authoring-ux.md` — were not on disk anywhere under the user profile**; the merge used the handover's own summary. **Update: `2026-09-03-kb-architecture-authoring-ux.md` turned up the same night** and is filed at [`docs/kb/2026-09-03-kb-architecture-authoring-ux.md`](docs/kb/2026-09-03-kb-architecture-authoring-ux.md) — in `docs/kb/` rather than `sources/`, because it is the live KB architecture document, with a banner marking its own IDs void. Merged as D167–D192. `2026-09-03-phase0-decisions-D130-D150.md` is still missing; if it turns up, `docs\decisions\sources\`, IDs void |
| `2026-09-03-claude-code-handover-questions-and-followups.md` | **Founder follow-ups after `74ae434`, answered 2026-09-03 (night)** in [`docs/2026-09-03-handover-answers.md`](docs/2026-09-03-handover-answers.md): the hub bake-off number (33/40 on both paths, identical case for case; 35 not reproduced, drift is the model's), D162–D166 and OPEN-9 in one line each, the five verifications with sources, the strong-form `[VERIFY]` resolved, F1 both halves cloned and now tested, the regression-test pair explained in the file, and a headless end-to-end run of hub provider + two-step consent across the three demo scenarios (`client/eval/e2e-hub-consent.mjs`; the Electron renderer itself was NOT clicked through). Commit split verified in worktrees; `.gitattributes` added; D166 recorded |
| `2026-09-03-claude-code-handover-first-build-steps.md` | **Founder handover, applied 2026-09-03 (night).** Tasks 0–5: file five documents, implement D130 (attack first), B0 hub server and client halves, register additions D162–D165 + OPEN-9, five verification lookups. **Task 0: only `generic-kb-v2.json` was on disk** (now `docs/kb/`). **Not on disk anywhere under the user profile, and not reconstructed:** `2026-09-03-threat-model-v1.md` (would close OPEN-5), `2026-09-03-phase1-plan.md`, `2026-09-03-B0-walking-skeleton-spec.md` (the hub was built from the handover's own summary; its §5 acceptance list is therefore unknown), `2026-09-03-generic-kb-schema-and-findings.md`. **Update: all four were supplied and filed on 2026-09-03 (night)** — [`docs/2026-09-03-threat-model-v1.md`](docs/2026-09-03-threat-model-v1.md) (**OPEN-5 closed**; A1–A11, G1–G10, so the G3 and G4 labels other documents cite now resolve), [`docs/2026-09-03-phase1-plan.md`](docs/2026-09-03-phase1-plan.md), [`server/docs/2026-09-03-B0-walking-skeleton-spec.md`](server/docs/2026-09-03-B0-walking-skeleton-spec.md) (**its §5 acceptance list is now known** — see the status row in §2), and [`docs/kb/2026-09-03-generic-kb-schema-and-findings.md`](docs/kb/2026-09-03-generic-kb-schema-and-findings.md) |
| `2026-09-02-matic-desk-decision-register-consolidated.md`, `...decisions-D35-D46...`, `...D53-D67...`, `...D91-D124...` | **Superseded 2026-09-03** by the register above. Old numbering (D35–D83 → D42–D90). Copies in `docs\decisions\sources\` |
| `2026-09-02-tts-runtime-decision-handover.md` | Piper footprint, Python dependency, positioning language |
| `2026-08-27-designer-note-v4.md` | **Current designer brief.** Supersedes v3 and v2 |
| `2026-09-02-sunday-demo-build-plan.md` | Demo scope and cut lines |
| `ASK-IT-questionnaire.xlsx` | **D1–D41, invariants H1–H3e as first written, AWS pricing, model matrix, customer questions.** **Never downloaded** — exists only as a chat artifact in *3D avatar with Amazon Bedrock architecture*. Recovering it into the register is the top housekeeping item |

### In `Downloads\Claude Handover Files\`

Avatar build history: `2026-08-27-avatar-bot-component-handover.md`,
`2026-09-02-avatar-bot-harness-lift-tts-handover.md`,
`2026-09-02-avatar-bot-piper-verified-handover.md`, `2026-09-02-avatar-bot-v4-merge-handover.md`.

*(The `video-production-comfy-voicebox` files in that folder belong to a different project.)*

### Superseded — do not act on

`00-BUILD-PLAN-PROMPT.md` (original prompt) · `Amazon Bedrock archtictecture.md` (**contains
fabricated figures — see the workbook**) · avatar handovers v1–v3 · anything about Chatwoot ·
anything specifying real-time 3D or pre-rendered frame sequences.

---

## 5. The invariants — H1–H6

Changing any one requires redesigning the safety model. **Authoritative text and status in
[`docs/decisions/DECISION-REGISTER.md`](docs/decisions/DECISION-REGISTER.md) §2.** H1–H3e are locked (workbook, `Hub scope` tab); H4, H5, H6 are
proposed and not yet ratified (see D134–D136 for the amendments the review asks for). H3e holds and
is insufficient on its own — D130.

| | Rule |
|---|---|
| H1 | The playbook signing key never lives on the hub |
| H2 | The hub distributes policy; the endpoint enforces it |
| H3 | No cloud credentials on the endpoint in joined mode (standalone: bounded exception, R1 cap) |
| H3b | Playbook parameters are schema-constrained, never freeform |
| H3c | `toolConfig` is a schema device, never an executor binding |
| H3d | Playbooks are typed primitives, never scripts |
| H3e | The model never authors the text a user consents to |
| H4 *(proposed)* | Hub-supplied policy may only narrow endpoint capability, never widen it |
| H5 *(proposed)* | Hub-supplied text reaching the user is inert and attributed |
| H6 *(proposed)* | Signed content carries a freshness bound |

---

## 6. Confirmed customer constraints

From one design-partner meeting (2026-08-09) — **one company, one source.** Firm for this customer;
not market facts.

No discrete GPUs · disk and memory watched · **no local LLM on endpoints** · **users have no local
admin** · **no EDR deployed today** (build as if it exists) · no privilege-elevation tooling ·
ServiceNow at the design partner · macOS eventually required.

---

## 7. What is blocking

| Blocker | Blocks | On whom |
|---|---|---|
| **Top-30 L1 ticket categories with volumes** | Playbook selection, model-eval golden set, the Phase 1 product exit criterion | Design partner. **Outstanding seven weeks** (as of 2026-09-04) |
| **Two unstarted external clocks, and neither has an owner or a date** — the **Anthropic Scale tier** (reached through spend history, not payment, so it has to accrue and nothing is accruing) and the **EDR allowlisting conversation** (cannot begin without a signed binary, and **Q9 — which EDR products the design partner runs — is still unanswered, which is a prerequisite for identifying the vendor at all**) | A pilot at fleet scale. Both have lead time that neither money nor effort compresses later | Founder. Flagged by four sessions; still unstarted |
| **Code-signing certificate (OPEN-9)** — RSA per D147, cloud-HSM-backed, not a USB token | A6 (signed MSI), D151 (standalone self-updater), OPEN-8 (build-pipeline integrity), **and EDR allowlisting, which cannot start without a signed binary** | Founder, with Daniel Chow. In progress, **no date**. **This currently sets the pilot date rather than any engineering decision** — if EDR review takes weeks after a signed binary exists, that sequence is longer than B2 plus B3. **Ask Daniel for a date, not a status.** |
| ~~**Threat model not on disk (OPEN-5)**~~ **CLEARED 2026-09-03 (night)** — supplied and filed at [`docs/2026-09-03-threat-model-v1.md`](docs/2026-09-03-threat-model-v1.md); OPEN-5 closed | — | Done |
| ~~**D130 renderer click-through not done**~~ **§1 and §2 DONE 2026-09-03 (night)** — Charles ran it: a `flush_dns` card approved and executed for real, and all eight displayed fields matched `consentRendered` on screen, with no string on the card that did not come from it. **The D130 guarantee is confirmed on a screen for the first time.** | — | **§3 (supersede) and §4 (expired nonce) are still open** — observed incidentally and not attempted respectively. Neither needs elevation. [`client/docs/D130-RENDERER-CHECK.md`](client/docs/D130-RENDERER-CHECK.md) records exactly what was and was not verified |
| ~~Device authentication mechanism (mTLS vs signed token)~~ **Decided:** signed assertion, mTLS rejected (D60–D65, confirmed by review A5 → D146) | — | Ratify D130–D150 (register §5) |
| Data residency (customer question 18) — **reframed** (D141): no US pin on Haiku 4.5, no EU on the first-party API | Model and provider choice, not region | Design partner, with the two sentences in OPEN-3 |
| Data retention policy | Cannot file a first ticket without it | Founder |
| **Build-pipeline integrity (OPEN-8, new 2026-09-03)** — signing-key custody, attested builds, two-person release | **Shipping standalone** (D151: standalone endpoints self-update from a vendor-signed installer at a pinned URL) | Founder; belongs in the threat model (OPEN-5) |
| Client host / port target (Electron vs WebView2 vs Tauri) | Component lift; binds the macOS port | Founder + measurement |
| Scenario 2 timing · five clean runs · video backup | Sunday demo | Charles, this week |

**Resolved 2026-09-02:** `C:` was down to **0.4 GB free of 930 GB** — no room to record the video
backup, and it had already failed a model download. `OLLAMA_MODELS` had never been set, so Ollama
had put 188 GB in `C:\Users\Charles\.ollama\models`. Moved to `G:\AI\ollama\models` (copy, verified
byte-identical, inference confirmed, source deleted). **C: now has 198 GB free.**

**Note the mechanism.** The Ollama app keeps its own *Model location* setting (Settings → Model
location, stored in `%LOCALAPPDATA%\Ollama\db.sqlite`) and **ignores `OLLAMA_MODELS`**. All three
now point at G:: the app setting (authoritative), the user env var (for the CLI), and a directory
junction at `C:\Users\Charles\.ollama\models`.

**Do not delete the junction.** *Reset to defaults* in that settings pane puts the app back to the
C: path; with the junction that still resolves to G:, without it Ollama looks empty.

**No performance number has ever been measured.** The idle soak (`runIdleSoak()` in
`avatar-instrumentation.js`) has been built and unrun since it was written. It is the oldest open
item in the project.

---

## 8. Working rules

- **Plan on paper before writing code.** Planning is cheaper than rewriting. This has repeatedly
  paid off — the Reallusion licence check alone prevented weeks of wasted animation work.
- **Flag conflicts and unverified claims inline.** Every document carries a verification register
  separating measured from estimated from unverified.
- **Bugs are found by using the software, not reading it.** Seven bugs were caught on Day 4 alone,
  none of which would have surfaced from inspection.
- **State limitations before being asked.** The honesty ledger in each handover exists for this.
- **One canonical copy of everything.** Two repos with the same files and separate history has
  already cost time once.
- **`npm.cmd`, not `npm`** (execution policy). **`py -3`, not `python`** (not on PATH).
- **`.env` is a file, not a session variable** — `RunAs` does not inherit the session environment.

---

## 9. Other project docs in this vault

`Projects\Ai Chat Bot -Matic\`: `Overall Mission.md`, `What makes a good Service Desk Agent..md`,
`Things to add.md`, `Greetings..md`, `HOw.md`.

Unrelated living docs referenced in user preferences: `NAS_ACCESS_HANDOFF.md`,
`CLAUDE_CODE_HANDOFF.md` and `DESIGN_PUBLISH_LOG.md` (bluesbrother.cc — a separate project).
