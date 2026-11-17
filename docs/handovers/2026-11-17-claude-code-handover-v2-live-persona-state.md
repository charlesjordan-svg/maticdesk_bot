# Handover — Matic Desk v2, the live persona: where it stands

**Date:** 2026-11-17
**For:** the next session in `charlesjordan-svg/maticdesk_bot`
**Branch:** `v2-nuance-persona`, off `main` at `71ba7c4`. **Pushed. Not merged.**
**Register:** `docs/decisions/DECISION-REGISTER.md` stands at **D321**; next free is **D322** (§5.62 – §5.62l).
**The full account, pass by pass:**
`docs/handovers/2026-11-16-claude-code-handover-nuance-live-persona-first-pass.md` — ten passes, each
with its honesty ledger. This file is the map; that one is the record.

---

## 0. Read these first

1. `CLAUDE.md` — the section **"v2 — the Nuance Live persona"** is the rules, and every one has a
   defect behind it.
2. `docs/handovers/2026-11-16-claude-code-handover-nuance-live-persona.md` — the original brief.
3. `docs/handovers/2026-11-16-v2-functional-analysis-persona-optimization.md` — the spec. **Its §6 is
   the persona's prompt and has been amended four times, each with the evidence beside it.**
4. `client/docs/PERSONA-RENDERER-CHECK.md` — the click-through, row by row: seen, failed, never run.

---

## 1. What v2 is, in one paragraph

A button under the avatar, **Talk face to face**, summons a real-time video persona (Nuance Live,
stock persona `mira`) in place of the v7 bust. She **converses on her own** — greetings, small talk,
general questions — and **hands work to Matic**: anything about this machine, its tickets, what the
assistant can do, or a fix. Matic's router, broker and catalog are unchanged and still decide and act.
When the session ends, for any reason, the v7 bust and Piper are back with the conversation intact.
It ships **off** (`client/config.json` `persona.enabled: false`).

## 2. How to run it

**The Desktop icon *Matic Desk v2 (Live Face)***, which runs
`tools\launchers\start-v2.cmd -KeyFile "<file holding the Nuance API key>"`: PostgreSQL, the hub with
the key in its own environment, a one-day enrollment secret, closes an older Matic Desk in the
notification area, starts the app with the persona on. Docker Desktop must be running.

- **The key lives in a file outside the repo** and is passed by path. It is in no commit; the push
  was scanned for it.
- **The app logs to `client/audit/app.log`** (gitignored). Read it first when something fails: it
  names the stage and the reason.
- **To see what she actually said:** `GET https://api.nuancelabs.ai/conversation/<id>/transcript`
  with the API key; the id is in `app.log`. It holds the user's words too — never copy one into the repo.

## 3. What is decided — the founder's, do not relitigate

| ID | Decision |
|---|---|
| D301 | Stock personas; v2 lives in the Electron client; degrade to the v7 avatar + Piper; the persona carries no load-bearing string — **with the named exceptions below** |
| D302 | The persona is `mira` |
| D308, D309, D311 | She **speaks** the machine summary, the ticket replies and the capability answer, handed to her as text (*relay*) |
| D310 | A **low-risk** fix may be approved by voice; network-dropping fixes keep the button |
| D318 | **Conversation is hers; work is Matic's.** A spoken turn is routed only when it is work |
| D319 | The **camera** is available — allowed per hub, off until the user clicks it |
| D320 | A session **starts with the microphone on**, with one of five hellos |
| D321 | A ticket may be **submitted by voice** at the review card |

**Proposed, awaiting ratification:** D297 (tier-0 keyword fix), D298 (`end_user_id` from the
enrollment), D299 (`delegation: client`), D300 (mint caps in memory), D303's mechanism, D305–D307,
D312–D317.

## 4. Where the code is

| | |
|---|---|
| `server/src/nuance/route.js` | Hub: mint a session token; end a conversation (only the API key can). `persona-prompt.txt` beside it is extracted from the functional analysis §6 and pinned to it by a test |
| `client/src/nuance/nuance-session.js` | Main process: mint → start conversation → follow to a room |
| `client/src/nuance/surface-split.js` | **What she may be told to say.** The one builder of a reply event |
| `client/src/nuance/turn-routing.js` | **Who answers a spoken turn** |
| `client/src/nuance/mic-policy.js` | When the microphone is on; the camera's labels |
| `client/src/nuance/voice-consent.js` | What counts as approving a fix or submitting a ticket aloud |
| `client/src/agent/machine-summary.js` | The machine band as a sentence |
| `client/src/renderer/persona-stage.js`, `persona-ui.js` | The room, the face, the controls. Glue — no policy |
| `client/src/main/main.js` | Owns the session's life; applies the policies; writes the records |
| `client/src/ticket/egress-audit.js` | The record of what left: session, audio, video — never content |
| `tools/launchers/start-v2.ps1` | The launcher |

**Tests:** client **2638 assertions across 32 files**; server headless **857 across 8**. All green.
`npm.cmd test` in each.

## 5. What is NOT done — in order of what I would do next

1. **Hear it.** Nothing in the last round was verified live by a session: the unmuted start, the
   varied hello, **voice ticket submit**, and the self-view are unit-tested only. Charles's own
   session opened with the microphone on, which is the one piece seen.
2. **Does she hand real problems over?** D318 rests on her prompt and on a classifier safety net
   that only covers tickets, the machine and capabilities. A problem she neither hands off nor the
   classifier catches is answered by her model, which has no access to anything. **Read transcripts.**
3. **The camera's open questions.** Is the picture recorded when on (not in the docs)? What does she
   do with it? The service runs an **age check** on what it sees and ends the session. This reversed
   the original plan's `camera: false`, and the privacy review that avoided is now owed.
4. **Retention.** Nuance stores a transcript of every conversation, readable with the API key, for a
   period nobody has stated. The threat model has an addendum (G11); it predates the camera.
5. **`concurrent_sessions: 1`** on this account, 60 credits a day, roughly a credit a minute by two
   readings. It is a demo allowance.
6. **The mint ledger is in memory** (D300): a hub restart forgets the caps and the audit trail.
7. **Unexplained:** on Charles's real profile the app reported `enrollment.json … NOT FOUND` while a
   valid file sat at that path and read fine from outside the app. The launcher works around it by
   enrolling afresh each launch. The cause is not known.
8. **The server's database suite is red** (`npm.cmd run test:db`): `db.test` 21 failing, `admin-db`
   failing, in job-claim and time-window assertions this branch does not touch, on a database that
   had been off nine weeks. Not investigated.
9. **Never run with a live face:** the pre-emptive close before `reset_adapter` / `renew_dhcp`;
   talking over her; a refusal by voice.
10. **Design asks:** the summon, microphone, camera and size buttons, the video frame and the
    self-view are app-only approximations the design delivery has never drawn.

## 6. Traps this work fell into

- **One concurrent session.** Read `GET /usage` before any live test. **Never end a conversation
  you did not start** — a session ended Charles's, believing it was its own.
- **The prompt and the surface split must agree.** She refused to read out the capability list three
  times because the prompt still said "never read those out".
- **An `import` inside a comment passes `node --check` and every regex test.** It broke every spoken
  turn for one build. After touching a renderer file, run it in the window and read the developer log.
- **A `sed` whose replacement contains `\n` writes real line breaks here.** One went into a commit.
- **A second launch hands over to the Matic Desk already in the tray.** New environment variables
  then test the old process.
- **Only the API key can end a Nuance conversation.** The client asks the hub.
- **Do not write "Nuance never reasons".** She has her own model and uses it — on purpose, since D318.

## 7. Left on Charles's machine

A Desktop shortcut, *Matic Desk v2 (Live Face)*. PostgreSQL running in Docker. Whatever the launcher
last started (a minimised hub window, the app). `client/audit/` holds `app.log`, `egress.jsonl` and
`voice-consent.jsonl` — all gitignored, all local. One-day enrollment secrets minted during testing
expire on their own.
