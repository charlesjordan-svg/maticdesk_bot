# Claude Code Handover — 2026-09-04 — demo prep, one pass

**Repo root:** `C:\Users\Charles\Downloads\maticdesk_bot`.
**Constraint:** demo is tomorrow. **One pass.** Everything below is scoped to that.
**Register:** v2.18, D1–D219, next free D220.

**Scope freeze.** No pipe work, no B2, no B3, no reranker, no refactors, no new decisions except
recording what this pass does. If something here reveals a defect that cannot be fixed safely
tonight, **record it and leave it** — a known defect is survivable in a demo, a half-fixed one is
not.

---

## 0. Decision for Charles, before anything else

**Which branch is the demo?**

| | `add-matic-desk-demo` | `main` |
|---|---|---|
| State | Frozen, rehearsed | Twelve-plus commits since, hub mode, KB answering, tickets, social layer |
| Renderer | Rehearsed | Clicked through **twice**; each pass found two defects. **The review card has never been rendered** |
| Needs | The app | Docker, Postgres, Ollama with two models, migrations, an ingested corpus, a running hub |
| Failure surface | Small | Five external dependencies before the first word is spoken |

**If the answer is `main`, everything below applies.** If it is the demo branch, only Task 1's agent
launcher matters and the rest can wait.

**A defensible middle:** demo from `main` with the hub, and have the demo branch checked out in a
second folder as a fallback. Task 4 covers that.

---

## Task 1 — two desktop launchers

The ask. Two icons, one for the hub and one for the agent.

**Ship `.cmd` wrappers plus a script that creates the shortcuts**, rather than hand-made `.lnk`
files — the shortcuts are then reproducible on another machine, which matters if the demo runs from
a different laptop.

```
tools/launchers/start-hub.cmd
tools/launchers/start-agent.cmd
tools/launchers/install-shortcuts.ps1     # creates both on the Desktop, with icons
```

Use the existing Electron app icon for the agent. If there is no separate hub icon, use the same one
— **do not spend this pass making artwork.**

### `start-hub.cmd` must preflight, not just launch

This is where the value is. Every one of these has bitten this project already, and each fails in a
way that looks like something else:

| Check | If it fails, say |
|---|---|
| Docker daemon reachable | Which command to run. **Read the output, not the exit code** — the pipe trap |
| Postgres container up and accepting connections | `npm.cmd run db:up`, and how to tell it is actually ready |
| Migrations applied, including `003` | The command |
| **Corpus ingested — count the chunks** | **An empty corpus produces a working hub that declines everything.** That looks like correct behaviour and is the worst failure on this list |
| Ollama reachable | It is not running |
| Both models present, **exact tags** | Which to pull. The dev embedder is D203's **L** variant, not what D199 selected |
| Port free | The EADDRINUSE message already handles this — point at it |

Then start the hub **and wait for `/v1/health` to answer before printing "READY"**. A launcher that
returns before the service is up teaches the operator to guess.

`start-agent.cmd` should check the hub is answering first and say so plainly if not, because
"the agent is broken" and "the hub is not running" look identical from the chair.

**Windows shell rules apply:** no `&&`, PowerShell 5.1 makes it a parser error. Separate lines,
absolute paths.

---

## Task 2 — keep the model warm **(highest value on this list)**

A cold `mistral-small:24b` load is **well over 90 seconds**, and the first turn of a demo is by
definition the first turn after a cold start. Ninety seconds of silence with an avatar on screen is
a dead demo, and the D218 timeout fix stopped it erroring — it did not make it fast.

This project already measured this shape once: 126 s cold against 0.03 s warm, in the PAIR lab work.
It concluded warm-pool management is a hard requirement. It is now a demo requirement.

**Do:**

- Set Ollama's `keep_alive` long enough to hold the model resident for the session. Verify the model
  stays loaded — `ollama ps` — rather than trusting the setting.
- Have `start-hub.cmd` **issue one throwaway inference** after the health check and before printing
  READY, so the model is resident by the time the icon says it is ready. Report how long it took.
- If the embedder is a separate model, warm it too — the first retrieval pays the same cost.

**Then measure a warm first turn end to end and write the number down.** If it is still slow, that
is something to know tonight rather than in front of an audience.

---

## Task 3 — the ticket-path checklist

Two click-throughs, four defects, and the largest unrendered surface is now the review card — the
one place identity leaves the endpoint, with `e2e-ticket.mjs` approving the draft in code.

**Write `client/docs/DEMO-CLICKTHROUGH.md`; Charles runs it.** Same division as D130 and for the
same reason. Keep it to what a demo actually shows, in demo order:

1. A greeting. No consent card.
2. "What can you do?" — **record the answer verbatim** and check it against `catalog.json` by eye.
3. An answered question. Citation appears as a separate source line and is **not spoken**.
4. A declined question. Must read as an answer, not a failure, and print *"nothing was filed"*.
5. A problem that reaches a proposal and a consent card.
6. **Escalation → offer → intake → review card → filed.** The review card edited before sending.
7. The awkward one: an unrecognised reply to the offer passing through as a new problem.

**Anything found here that cannot be fixed safely tonight gets written down, not fixed.**

---

## Task 4 — a one-page recovery card

`docs/DEMO-DAY.md`. One page, for use under pressure, not for reading.

- The launch sequence: hub icon, wait for READY, agent icon.
- **The five failure symptoms and their one-line fixes** — Ollama down, model evicted, Postgres down,
  empty corpus, hub not started. Symptom first, because that is what is visible from the chair.
- **The fallback:** how to switch to the frozen demo branch in a second folder, in one line. Cheap
  insurance. `client/docs/DEMO-RUNBOOK.md` already covers running it.
- What **not** to do live: no `reset-demo` between using the app and reading a record; do not restart
  Ollama unless the model is genuinely gone, because the reload costs the ninety seconds.

---

## Explicitly out of scope tonight

The pipe and the §10.5 experiment. B2. B3. The reranker. The `stateTopicsFor` / catalog coupling
test. The audience audit across schemas. D148 and OPEN-1 wording. All of these are real and none of
them is tomorrow.

---

## Suggested order

1. **Task 2 first.** It is the highest-risk item and it may be a settings change. Knowing early
   whether a warm first turn is acceptable shapes everything else.
2. Task 1, with the preflight checks — most of them are checks Task 2 needed anyway.
3. Task 3's checklist, so Charles can run it while the rest is finished.
4. Task 4, last, written from what Tasks 1–3 actually turned up rather than from what was expected.

---

## Honesty ledger

- **The review card has never been rendered.** It is in the demo path at step 6 of Task 3.
- **The 90-second cold-load figure is quoted from the previous handover, not re-measured.** Task 2
  should produce a real number.
- I have not read the register at v2.18, `server/docs/B6-TICKET-STORE.md`, or
  `client/docs/D130-RENDERER-CHECK.md`. Where they disagree with this, they win.
- **Every prior click-through of this software found defects — two out of two.** Planning a demo on
  the assumption that tomorrow's is the first clean one is not supported by anything.
