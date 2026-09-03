# PROJECT_START_HERE

**Read this first, every session. Then read the documents it points to — fresh, not from memory.**

**Last updated:** 2026-09-02 (post-demo branch: refusal auditing, provider, bake-off)
**Project home:** `C:\Users\Charles\Downloads\maticdesk_bot\` (Obsidian vault + git, private)

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
| Model bake-off harness (`post-demo`) | **Done, unmerged.** 40 cases; five models measured incl. a cloud baseline. `mistral-small:24b` beats `claude-haiku-4-5` on this task |

**Demo deadline: Sunday 2026-09-06.** Build is frozen; new work goes on a `post-demo` branch.

---

## 3. Where the code lives

| | Path |
|---|---|
| **Canonical repo** | `charlesjordan-svg/maticdesk_bot` @ `add-matic-desk-demo` (**private — keep it that way**) |
| **Working copy** | `Downloads\maticdesk_bot\Projects\Ai Chat Bot -Matic\matic-desk-demo` |
| Avatar component source | `Downloads\matic-avatar-v2\` |
| ~~`Downloads\matic-desk-demo`~~ | Superseded copy — **renamed to `matic-desk-delete` on 2026-09-02.** Safe to remove once the push is confirmed good |

**The vault is an Obsidian vault.** Do not run `npm install` at the vault root, and exclude
`node_modules` in Settings → Files & Links → Excluded files.

---

## 4. Live documents — read the relevant ones each session

### In the demo repo, under `matic-desk-demo\docs\`

| File | What it is |
|---|---|
| `HANDOVER-2026-09-02-day4.md` | **Most current engineering state.** Read this first for code |
| `DEMO-RUNBOOK.md` | Sunday demo: pre-flight, three scenarios, failure playbook |
| `BROKER-SURFACE.md` | Every native API the privileged half touches. The allowlisting document |
| `PHASE1-TICKETING.md` | Ticketing design note |
| `LOCAL-MODEL-PROVIDER.md` | **`post-demo`.** OpenAI-compatible provider: design, and why escalation enums are enforced client-side |
| `BAKEOFF-2026-09-02.md` | **`post-demo`.** First measured model comparison. Read §1 before picking a model |
| `../eval/README.md` | **`post-demo`.** The model eval harness — dataset shape, metrics, what it cannot score |
| `HANDOVER-2026-09-02.md` | Day 1–3 build record |

### Planning artifacts (from Claude sessions, in `Downloads\` or chat outputs)

| File | What it is |
|---|---|
| `2026-09-02-hub-server-side-spec-handover.md` | **Hub specification. Self-contained.** Start any hub thread here |
| `2026-09-02-claude-code-proceed-handover.md` | Current Claude Code work queue + build-freeze rule |
| ~~`2026-09-02-ollama-provider-brief.md`~~ | **NOT ON THIS MACHINE** (searched 2026-09-02; only the proceed handover references it). Its provider content is superseded by hub spec §12 and `LOCAL-MODEL-PROVIDER.md` |
| `2026-09-02-tts-runtime-decision-handover.md` | Piper footprint, Python dependency, positioning language |
| `2026-08-27-designer-note-v4.md` | **Current designer brief.** Supersedes v3 and v2 |
| `2026-09-02-sunday-demo-build-plan.md` | Demo scope and cut lines |
| `ASK-IT-questionnaire.xlsx` | **Decision register (D1–D41), invariants, verified AWS pricing, model matrix, customer questions** |

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

## 5. The seven invariants — non-negotiable

Changing any one requires redesigning the safety model. Full text in the workbook, `Hub scope` tab.

| | Rule |
|---|---|
| H1 | The playbook signing key never lives on the hub |
| H2 | The hub distributes policy; the endpoint enforces it |
| H3 | No cloud credentials on the endpoint in joined mode (standalone: bounded exception, R1 cap) |
| H3b | Playbook parameters are schema-constrained, never freeform |
| H3c | `toolConfig` is a schema device, never an executor binding |
| H3d | Playbooks are typed primitives, never scripts |
| H3e | The model never authors the text a user consents to |

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
| Device authentication mechanism (mTLS vs signed token) | All hub and client identity work | Founder |
| Data residency (customer question 18) | Region choice | Design partner |
| Data retention policy | Cannot file a first ticket without it | Founder |
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
