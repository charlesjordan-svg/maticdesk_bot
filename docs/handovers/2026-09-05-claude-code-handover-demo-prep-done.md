# Claude Code Handover — 2026-09-05 — demo prep, done

**Answers:** [`2026-09-04-claude-code-handover-demo-prep.md`](2026-09-04-claude-code-handover-demo-prep.md) (now on disk here, copied from `Downloads/`).
**Repo root:** `C:\Users\Charles\Downloads\maticdesk_bot`. **Register:** v2.19, D1–D220, next free **D221**.
**Scope freeze held.** No pipe work, no B2, no B3, no reranker, no refactors. One decision recorded (D220) describing this pass.

---

## 0. The decision (§0 of the handover): `main` with the hub, demo branch as fallback

Taken as the handover's "defensible middle": demo from `main` with the hub; the frozen
`add-matic-desk-demo` checked out in a second folder. **Charles can still overrule this in the
morning** — the fallback is installed and tested, so the cost of switching is one folder.

## 1. What is on disk now

| Path | What |
|---|---|
| `tools/launchers/start-hub.cmd`, `start-hub.ps1` | Preflight → start → warm → READY. `-CheckOnly` runs the checks only |
| `tools/launchers/start-agent.cmd`, `start-agent.ps1` | Hub check in words, then `client/scripts/start-elevated.ps1` (UAC) |
| `tools/launchers/warm-turn.mjs` | One real `/v1/turn` with the endpoint's tool schemas — warms the proposal prompt prefix |
| `tools/launchers/install-shortcuts.ps1`, `matic-desk.ico` | Creates "Matic Desk Hub" / "Matic Desk Agent" on the Desktop. **Created on this machine.** Icon is the existing bot image, converted |
| `client/docs/DEMO-CLICKTHROUGH.md` | Task 3. Seven steps in demo order, every expected string, a §Result to fill in. **For Charles** |
| `docs/DEMO-DAY.md` | Task 4. One page: launch order, the numbers, six symptoms → fixes, the fallback, what not to do live |
| `C:\Users\Charles\Downloads\maticdesk_demo\` | `git worktree` of `add-matic-desk-demo`. `npm.cmd install` done, `.env` copied, `npm.cmd test` green |
| `.gitattributes` | `*.cmd text eol=crlf` |
| `client/eval/e2e-ticket.mjs` | One string: pointed at a doc that never existed, now points at `DEMO-CLICKTHROUGH.md` |
| Register §5.22, `CLAUDE.md`, `PROJECT_START_HERE.md` | D220, the new trap, the launcher commands, the code-map rows |

**Machine state changed outside the repo:** `OLLAMA_KEEP_ALIVE=24h` set as a **user environment
variable** (`HKCU\Environment`), and the Ollama tray app restarted so it took effect (verified:
`ollama ps` → *"24 hours from now"*). Docker Desktop was started. A hub is running in its own
console window on port 8787, started by the launcher. Both models are resident, 100% GPU.

## 2. What was run

- `client/` `npm.cmd test`: 11/11 files. `server/` `npm.cmd test`: 3/3 files. Unchanged code.
- Database: container up, `control` at 002, `t_devco` at 003, corpus 6/18/18 embedded by
  `snowflake-arctic-embed2:568m`, four tickets from 09-04 present. Nothing needed migrating or
  ingesting — the volume survived.
- `eval/e2e-ask.mjs` and `eval/e2e-ticket.mjs` against the live hub and model: as documented.
  **Two more real tickets in `t_devco`: MD-1004, MD-1005.**
- `start-hub.ps1` twice: once with a hub already on 8787 (detected, used, warmed) and once from a
  free port (started, health awaited, warmed). READY both times. `start-agent.ps1 -CheckOnly`: all
  green. `install-shortcuts.ps1`: two `.lnk` on the Desktop.
- Demo-branch worktree: `npm.cmd test` green in its folder.

## 3. What was measured — register §5.22a has the table

The short version: **cold load is 13–15 s with the GPU free, and 190–265 s with a game holding
VRAM**, after which the model sits split across CPU and GPU and every turn is slow. Warm proposal
turns 2.8–3.6 s; warm question turns 4.6–7.7 s; the first call on each route pays ~11–13 s of
prompt-prefix processing, which the launcher now pays instead of the first person to type.

## 4. Found and left (scope freeze)

1. **A declined question says "I can raise a ticket for you" and cannot.** The question path arms
   no intake. Recorded in `DEMO-CLICKTHROUGH.md` §4 and `DEMO-DAY.md` §5 with the instruction not to
   answer "yes please" to a decline on stage. Probable fix (not done): have `Agent.propose()` arm
   the intake on a decline too, with an escalation synthesised from the question — but that is a
   decision about what a declined question *is*, and it is not tonight's.
2. **The review card has still never been rendered.** Step 6 of the click-through is where that
   happens, and it is Charles's step.
3. **Cache thrash between the two prompt prefixes** during a real conversation: not measured.

## 5. Not done, and why

- The click-through itself (Task 3 says Charles runs it). The checklist is written; the §Result
  block is empty.
- No `.env`/API-key work: `provider: "hub"` needs no Anthropic key. The fallback folder has the
  `.env` copied from `client/` because the frozen build is cloud mode.
- **Nothing committed.** Project norm: session work stays uncommitted until Charles asks. Everything
  this pass produced is in the working tree on `main` (`git status` lists it). To keep it:
  ```powershell
  cd C:\Users\Charles\Downloads\maticdesk_bot
  git add -A
  git commit -m "Demo prep: preflighting launchers, a warm resident model, the click-through and the recovery card (D220)"
  ```

## 6. Honesty ledger

- **Every number in §3 is from one machine, one evening, single runs.** They are verifications in
  the sense of register §10.3a, not measurements to quote; §10.3 is unchanged.
- **I did not see the screen.** Every string in `DEMO-CLICKTHROUGH.md` came from the code and from
  headless runs of the same code. The one thing this project has learned is that the seam between
  "the code produces X" and "a person sees X" is where the defects are.
- **The launcher's "already running" branch was tested against a hub *I* started, and the
  "start" branch against a port I freed by killing that hub.** Neither was a stale or foreign
  process on 8787; that branch (FAIL with the `Get-NetTCPConnection` fix) is untested.
- **`start-agent.ps1` was run with `-CheckOnly` only.** The UAC step is `start-elevated.ps1`,
  unchanged, and needs a person.
- **The 265-second load was observed once**, with Age of Empires IV running. I did not reproduce
  it deliberately; I re-measured with the card free and got 14.5 s. The causal story (VRAM
  contention → CPU/GPU split → slow load) is consistent with `ollama ps` and `nvidia-smi` at the
  time, not proven by a controlled pair.
- **Two of my own commands went to the wrong directory** before I noticed (register §5.22b). The
  stray root `package-lock.json` was deleted and `client/package-lock.json` restored from git;
  `git status` is clean apart from this pass's files. The root `.env` dated 2026-09-02 was already
  there and was not touched.
