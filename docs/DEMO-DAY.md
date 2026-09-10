# DEMO DAY — one page, for the chair

**2026-09-06. Demo from `main` with the hub.** Fallback: the frozen demo branch, §4.
Written 2026-09-05 from what the demo-prep pass actually measured, not from what was expected.

---

## 1. Launch — in this order, and wait

1. Close games and anything else using the GPU. **Check:** `nvidia-smi` shows under ~2 GB used.
2. Double-click **Matic Desk Hub**. Read it. It stops at the first red line and says what to run.
   Wait for **READY**. It prints how long the model load and the two throwaway turns took.
3. Double-click **Matic Desk Agent**. Accept UAC. Leave both windows open.
4. `server\`: `npm.cmd run tickets -- list` in a third window. That is the queue.

No shortcuts on this machine? `powershell -ExecutionPolicy Bypass -File C:\Users\Charles\Downloads\maticdesk_bot\tools\launchers\install-shortcuts.ps1`

## 2. The numbers (measured 2026-09-05, this machine, RTX 3090 Ti 24 GB)

| | |
|---|---|
| Cold load, GPU free | **14.5 s** (twice: 12.7 s and 14.5 s) |
| Cold load, GPU shared with a game | **190 s load, 265 s wall**, model split 15/85 CPU/GPU |
| Warm, model resident | 0.3 s for a bare completion |
| First `/v1/turn` after start, model warm | 12.8 s (prompt prefix cold) — the launcher pays this for you |
| Later `/v1/turn` (escalation / proposal) | **2.8–3.6 s** |
| `/v1/ask` (question, retrieval + answer) | **4.6–7.7 s**, first one 11 s |
| Ticket filing (`/v1/ticket`) | under 0.1 s |

The 90-second figure in the old handover is real — **it is what a shared GPU looks like.** Nothing
else in this system is slow.

## 3. Five symptoms and their one-line fixes

| You see (from the chair) | It is | Fix |
|---|---|---|
| Avatar says *"I could not reach the service desk"*, and the pill under the voice pill is red `hub: UNREACHABLE` | **Hub not running** | Hub icon again. The pill goes green within about a minute of the hub coming back; nothing to do on the agent |
| Avatar says *"The service desk answered, but its model did not give me anything I can act on"*, pill green | Hub up, **Ollama down or the model cold** — the dev log shows `HTTP 502 ... no tool call` or a timeout | Hub icon; wait for READY. A first turn on a cold model can take minutes (§5.22a) — the avatar is waiting on the hub, not lost |
| Avatar answers a cracked screen with the spooler | The fallback answered from machine state (D219 narrowed it; still possible) | Say the problem again in a full sentence |
| First turn silent 15 s+, then fine | **Model was evicted** (keep-alive lost) | Live with it once; it is resident after. Never restart Ollama on stage |
| Every turn slow, 10–30 s | **Model split CPU/GPU** — something else holds VRAM | Close it. After the demo: `ollama stop mistral-small:24b`, hub icon again |
| Every question declined, politely | **Empty corpus** — looks correct, is not | `cd server`, `npm.cmd run kb:ingest`. Hub launcher would have caught it |
| Escalation says *"This build cannot open a ticket"* / no offer | **No tenant** or `/v1/ticket` 503 | `cd server`, `node bin/db.mjs create-tenant devco`, restart hub |
| Hub launcher: *"Docker is not answering"* | **Docker Desktop closed** | Start menu → Docker Desktop, wait for the whale, hub icon again |

`PORT 8787 IS ALREADY IN USE` in a hub window = a hub is already running. Use it. The launcher
detects this and says so.

## 4. Fallback — the frozen demo branch

Already checked out, installed, `.env` copied, tests green (2026-09-05) at:

```
C:\Users\Charles\Downloads\maticdesk_demo\Projects\Ai Chat Bot -Matic\matic-desk-demo
```

Run it: `npm.cmd run start:elevated` from that folder. It is **standalone cloud mode** (Anthropic,
no hub, no tickets, no questions) — the three scenarios in `client/docs/DEMO-RUNBOOK.md`. Its voice
model path is `C:/Users/Charles/Downloads/matic-avatar-v2/piper-voices/en_US-amy-low.onnx`.

If that folder is missing: `git -C C:\Users\Charles\Downloads\maticdesk_bot worktree add ..\maticdesk_demo add-matic-desk-demo` then `npm.cmd install` in the folder above.

## 5. Do NOT, live

- **No `reset-demo` between using the app and reading a record.** It deletes `audit\audit.jsonl`.
- **Do not restart Ollama** unless `ollama ps` shows the model genuinely gone. A reload is 15 s
  with the GPU free and minutes without.
- **Do not start a second hub.** Check the hub window first.
- **Do not type the next sentence until you have pointed at the panel.** The next turn overwrites
  all three inspector panels.
- **Do not say "a ticket has been raised" as if someone was told.** Nobody is emailed — the card,
  the transcript, the response and the queue listing all say so (D86, D213). Say: *"It is stored
  on the hub; IT reads the queue. Email is the next build."*
- After a decline (step 4 of the click-through) **do not answer "yes please"** — the spoken offer
  there is not armed (recorded defect, `client/docs/DEMO-CLICKTHROUGH.md` §4). Ask a real problem
  instead; the escalation path *is* armed.

## 6. Where things are

| | |
|---|---|
| Hub | `http://127.0.0.1:8787` — `/v1/health` in a browser shows corpus counts and `tickets.enabled` |
| Queue | `cd C:\Users\Charles\Downloads\maticdesk_bot\server` → `npm.cmd run tickets -- list` / `-- show MD-1004` |
| Egress log (what left the machine) | `client\audit\egress.jsonl` |
| Profile the interview saved | `%APPDATA%\matic-desk-demo\profile.json` (delete it to make the interview ask again) |
| Click-through checklist | `client/docs/DEMO-CLICKTHROUGH.md` |
| Launchers | `tools/launchers/` — `start-hub.ps1 -CheckOnly` runs the checks without starting anything |
