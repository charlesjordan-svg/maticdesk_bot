# PROJECT_START_HERE

**Read this first, every session. Then read the documents it points to — fresh, not from memory.**

**Last updated:** 2026-09-03 (repo restructured: `client/`, `server/`, `docs/decisions/`; `post-demo` merged to `main`; register consolidated; consent-surface finding demonstrated; prompt prefix measured; C9 corrected. Evening: register-merge handover applied — D151–D161 and OPEN-8 appended, consent protocol design filed, prompt caching verified live on Sonnet 5)
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
| Hub / server side | **Nothing built.** Spec written, several decisions open |
| Named pipe, Windows Service, catalog signing | **Not built.** Phase 1 |
| ITSM integration | **Not built.** Escalation payload is displayed, never sent |
| Performance measurement | **First numbers measured 2026-09-02** — model bake-off only. Everything else is still a target |
| Refusal auditing (`post-demo`) | **Done, unmerged.** `validate()` audits refusals with the gate that fired |
| Local/OpenAI-compatible provider (`post-demo`) | **Done, unmerged.** Off by default; the demo build still uses Anthropic |
| Model bake-off harness (`post-demo`) | **Done, unmerged.** 40 cases; five models measured incl. a cloud baseline. After hardening `claude-haiku-4-5` leads on accuracy (36/40) and `mistral-small:24b` on speed (35/40, 0.3 s faster), both at zero false actions reaching a user. Managed tier: Haiku (D97). Customer-hosted: mistral. *(Corrected 2026-09-03 — C9/D139; this row previously said mistral beats Haiku.)* |
| Wrong-action rate (`post-demo`) | **Zero false actions reach the user** on mistral, gemma and Haiku; zero R2 on all five. Catalog preconditions + tool-description hardening. See `BAKEOFF-2026-09-02.md` §2b |
| **Decision register** | **One file, checked in, owns the numbering (2026-09-03).** D1–D161, H1–H6, C1–C12, X-1–X-7, OPEN-1–OPEN-8. [`docs/decisions/DECISION-REGISTER.md`](docs/decisions/DECISION-REGISTER.md). D1–D41 still only in the workbook (never downloaded). Two parallel chat documents of 2026-09-03 numbered themselves D130–D168 — **those IDs are void** (register §0, §5.6); the documents themselves were not on disk and were merged from the founder's handover summary |
| Consent-surface finding (review §1.1, **D130**) | **Demonstrated 2026-09-03, open.** Agent shows `flush_dns`, sends `reset_adapter`; stub NamedPipeBroker mints, executes, audits as consented. Regression test in `npm test` (3 expected failures until D130 lands). `docs/CONSENT-SURFACE-2026-09-03.md`. **Design filed 2026-09-03:** `docs/2026-09-03-consent-protocol-design.md` — two-step consent (`prepareConsent` → nonce + broker-rendered text; `execute(nonce)`), changes `broker.d.ts`, **must be settled before the pipe protocol is written**. Not implemented; its §8 wants a second opinion on the retain-the-proposal variant |
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
| `2026-09-03-consent-protocol-design.md` | **Filed 2026-09-03.** The D130 design: two-step consent (`prepareConsent(proposal, {locale})` → nonce + broker-rendered text; `execute(nonce)` runs the proposal the broker retained), the `broker.d.ts` changes, the eight-check acceptance set (§6). Settle before the `NamedPipeBroker` pipe protocol. §8: the retain-the-proposal variant has had no second opinion |
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
| `2026-09-03-claude-code-handover-register-merge.md` | **Founder handover, applied 2026-09-03.** Merge the parallel D130–D168 chat documents into the register (now §0, §5.6–§5.9, D151–D161, OPEN-8), caching on the Sonnet-class path (D161), keep the XFAIL mechanism, file the consent design. **The two chat documents it names — `2026-09-03-phase0-decisions-D130-D150.md` and `2026-09-03-kb-architecture-authoring-ux.md` — were not on disk anywhere under the user profile**; the merge used the handover's own summary. If they turn up: `docs\decisions\sources\`, IDs void |
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
| **Top-30 L1 ticket categories with volumes** | Playbook selection, model-eval golden set | Design partner. **Outstanding 3 weeks** |
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
