# Claude Code handover — Matic Desk v2: the Nuance Live persona

**Date:** 2026-11-16
**For:** Claude Code running Fable, in `charlesjordan-svg/maticdesk_bot`
**Written by:** a Cowork session, from the Nuance Labs docs (read 2026-11-16) and the working tree
on `wakanda` (read 2026-11-16, read-only — nothing was committed).
**Companion documents, both in the Claude project and both written the same day:**
- `product/2026-11-16-v2-nuance-live-avatar-plan.md` — the integration plan
- `product/2026-11-16-v2-functional-analysis-persona-optimization.md` — what the product becomes

**Register:** stands at **D296**; next free is **D297**. Confirm against the register's own header
before you take one — `PROJECT_START_HERE.md` §5.60 records that its next-free line keeps going
stale, and fix that line in the same pass.

---

## 0. Read these first, in this order

1. `CLAUDE.md` — how to work here.
2. `PROJECT_START_HERE.md` — status, blockers, the register's state.
3. The two companion documents above. **They are reasoning, not scripture.** §3 of this handover
   says what you may overturn and what you may not.

Do not start from this handover alone. It assumes you have read the other three.

---

## 1. What you are being asked to do

Replace Matic's speaking face, in the connected case, with a **Nuance Live** persona — a real-time
video persona delivered over WebRTC into a LiveKit room — while keeping the existing v7 avatar and
Piper as the degraded channel.

The persona is a face, a voice and an ear. **Matic's router remains the brain** (`delegation:
client`). Nuance never sees a tool, never reasons, and never decides anything.

---

## 2. What is decided. Do not relitigate these.

Charles decided these on 2026-11-16. Each is his, recorded as his.

| # | Decision |
|---|---|
| **A** | Accept the stock Nuance personas (`sam`, `sonia`, `mira`). Hazel and the six recorded greeting MP3s retire from the live channel. A Matic-branded face is not available. |
| **B** | v2 lives **inside the existing Electron client**, not as a separate app. |
| **C** | **Degrade to the existing v7 avatar driven by Piper**, not to text chat. Piper is reassigned, not retired. This supersedes Charles's own earlier answer of "text chat" — he changed it after reading the functional analysis §2.4. |
| **D** | The persona carries **no load-bearing string**. Consent text, capability claims, ticket status and filing outcomes stay on the panel. Functional analysis §2.1 is the contract. |

**D is the one that matters most and it is the one most likely to look like overcaution from inside
the code.** It is not. It is the four existing guarantees — catalog-authored consent (H3e/D128),
catalog-generated capability claims (D165/D212), character-for-character ticket wording (D288,
`panel.test` §7), and `persona.json` rule 2 on outcome claims — colliding with an API that has no
"say exactly this" event. Read functional analysis §1 before you form a view on it.

---

## 3. Where your judgment is wanted — and the bar

Everything below is a conclusion reached **from documentation and a read-only pass over the tree**.
None of it was reached from running code. You will have better evidence than the author of these
documents had. **Use it.**

### 3.1 Open by design — your call, with reasons

- **`delegation: client` vs `responses`.** Recommended in plan §4.5 on five arguments, the strongest
  being that `responses` forecloses local models and splits the brain from the degraded channel.
  **Not ratified.** If measurement contradicts it, say so.
- **The shape of the surface split.** Functional analysis §2.1 is a table of judgements about which
  strings are load-bearing. Some are obvious (`filing.timeout`). Some are arguable (`social.offtopic`
  — is a rephrased scope statement really a scope claim?). Argue them.
- **How the degraded switch is presented.** Decision C settles *what* the fallback is, not how the
  handover between two faces and two voices looks to a user mid-session. Nobody has seen it.
- **Where `nuance-session.js` belongs** and how it talks to the renderer across the preload bridge.
  The architecture sketch in plan §5 is a sketch.
- **`expressiveness`** (0–2, default 1). Functional analysis §3.3 recommends starting at 0.5 on a
  register argument. That is a judgement about tone with no measurement behind it.

### 3.2 The bar for overturning something

**Evidence from the repo or from a run beats reasoning from documentation, every time.** If
`classify.js` behaves differently from how the analysis describes it, the code is right. If a
measurement contradicts a recommendation, the measurement wins.

What does *not* clear the bar: "this would be simpler", "the tests are in the way", or an argument
that depends on a Nuance behaviour nobody has observed. The docs are a preview API and they are
incomplete in named places (plan §10) — treat an undocumented behaviour as unknown, not as absent.

**If you overturn something, say so loudly in the handback with the evidence.** A quiet reinterpretation
that makes a requirement satisfiable is the failure mode `00-BUILD-PLAN-PROMPT.md` names explicitly.

### 3.3 Off-limits without Charles

Do not change, in either direction, without asking:

- **The trust root.** `catalog.json`'s `plain/*`, `tiers/*`, `requires/*`, the closed enums, or who
  authors consent text. D128/D130/H3d/H3e.
- **The egress record's meaning.** You may *extend* it (§5.4 below asks you to). You may not narrow
  what it claims.
- **Anything that makes the product claim an outcome it cannot attribute.** `persona.json` rule 2.
- **Microphone defaults.** §5.4.
- **Decisions A–D.**

If a build step appears to require one of these, that is a finding to report, not an obstacle to
route around.

---

## 4. What blocks what

**Five questions are out with Nuance support and unanswered as of this writing** (plan §8):
green-screen availability, credit→time mapping, whether `responses` bills extra, whether its backend
can use a customer-hosted model, and the AI-disclosure label. A sixth was added by the functional
analysis: **transcript and audio retention** — `I do not have a verified source for this`, and it is
the one an enterprise security review will ask first.

| Work | Needs |
|---|---|
| §5.1 transcript bakeoff | **Nothing.** Start here |
| §5.2 hub mint route | An API key in the server's secret store |
| §5.3 client persona mode | §5.2, plus a key |
| §5.4 mic policy + egress | **Nothing.** Can run in parallel with §5.1 |
| Compositing / green-screen | **Blocked on Q1.** Do not build it speculatively |

**Do not build the compositing window until Q1 is answered.** If `green_screen` is not available on
this deployment, that work is worthless and v2 is a windowed persona.

---

## 5. The work

House convention applies throughout: **write the test first and watch it fail.** The register records
several defects that were only caught because someone did. v2 is not the place that lapses.

### 5.1 The transcript bakeoff — start here, it gates the rest

`classify.js` states its bias plainly: every ambiguous sentence resolves to `"action"`, because the
proposal path was measured (40 hand-written cases, five models, `docs/BAKEOFF-2026-09-02.md`) and the
question path was measured on nothing.

**Those 40 cases were typed. v2's input is speech.** Functional analysis §5 argues that speech shifts
the question/action mix toward the path that was never measured, and that disfluency, inconsistent
punctuation and longer utterances all bear on a substring classifier.

**Do:** take the 40 cases, produce realistic spoken-form variants of them (disfluencies, no
punctuation, longer framing), run them through `classify()` and `routeTier0()`, and compare against
the typed results. Also check whether the `vocatives` (`"matic"`, `"matic desk"`) survive ASR-shaped
text — a wake word that mis-transcribes is a feature that silently does not work.

**Report the delta as a number.** If classification differs on more than a couple, the thresholds
need re-tuning before anything ships, and that is a finding worth its own D-number.

**You may do better than this.** If you can get real ASR output rather than hand-written spoken-form
variants, that is a stronger experiment and worth the extra step. Say which you did.

### 5.2 The hub mint route

`POST /v1/nuance/session-token` on the hub. The API key (`nk_…`) **never leaves the server**.

The auth already exists: P3b (D282–D285) ships one enrollment credential per device, and
`server/src/index.js` gates every `/v1` route except enroll and health behind it. This is a new route
behind existing auth. The hub has **no web framework** — `pg` is its only dependency and routing is
hand-rolled `req.url` comparisons — so write it in that house style, not by adding express.

The route owns: prompt assembly (functional analysis §6 is the draft prompt, plus tenant facts),
`interface_setup`, `end_user_id` as a **hash** of the D215 identity, per-tenant mint caps, and the
audit log. **It is the only place credit spend can be controlled.**

`interface_setup` as planned:
```json
{ "delegation": { "type": "client" },
  "video": { "input": { "camera": false } },
  "runtime_tools": { "end_call": true } }
```
`camera: false` removes an entire privacy conversation from every security review. `end_call: true`
is off by default and it stops the credit clock. `stay_quiet` stays on.

### 5.3 Persona mode in the client

`contextIsolation: true`, `nodeIntegration: false` — LiveKit must be **vendored as a bundled ESM
build** under `src/renderer/vendor/`, a pattern the repo already uses. It is the largest dependency
this client has ever taken (today: `@anthropic-ai/sdk` and `koffi`, and nothing else), it is going
into a signed Windows binary, and **code-signing is already a recorded blocker.** Flag what it costs.

Build, with the functional analysis as the spec:

- The surface split (§2.1), **with a test asserting that no `persona.json` key marked pinned is ever
  passed to `response.create`.** That test is the enforcement mechanism for Decision D.
- `session.floor.hold` with a `reason` around every consent card; `session.floor.release` on approve
  or dismiss (§2.2).
- **Pre-emptive `session.close` before `reset_adapter` and `renew_dhcp`** (§2.2). Both drop the
  network, which kills the WebRTC session. If you do not close first, the persona vanishes
  mid-sentence while the user watches their network die, and it reads as Matic breaking the machine.
- Barge-in via `session.output_audio.interrupt` — Piper has none, and this is the largest single
  interaction upgrade in the API for a service desk.
- The degraded switch (Decision C): persona unavailable or lost mid-session → v7 avatar + Piper,
  **history intact**, offline branch reaching `bootState.offline`.
- Echo cancellation verified **on speakers, not headphones**. `/connect` is explicit that without it
  the persona hears itself and answers its own voice.

### 5.4 Microphone policy and the egress record — do not skip this

**The biggest unaddressed finding in either companion document.** `agent.js` deliberately keeps the
machine name and username out of the cloud-facing `summary`; `ticket/egress-audit.js` exists so the
user can see what left the machine. A live persona session streams the user's microphone to a third
party continuously — the colleague in the background, the call they take, the password they read
aloud despite being told not to. None of it passes through `summary`, the consent card or the egress
record, because none of those were built for an open microphone.

**Build:** microphone **off by default** (`session.input_audio.mute` / `unmute`), a visible mic state
in the panel, and the egress record extended to log that a persona session opened, how long it ran,
and that audio was sent — **the fact, not the content.**

`docs/2026-09-03-threat-model-v1.md` predates all of this. It likely needs an entry.

---

## 6. Non-negotiables on how you report

These are Charles's standing rules and they are not negotiable here.

1. **No invented facts.** No fabricated benchmarks, latencies, costs, vendor capabilities, library
   versions or deflection rates. If you have no verified source, write exactly:
   `I do not have a verified source for this.`
2. **Mark every unverified claim inline with `[VERIFY]`** and collect them in a verification register
   at the end, in the house form: claim, and how it is known — *read*, *measured*, *judgement*, or
   *not known*.
3. **Separate design targets from measurements.** "Target: under 300 MB idle RSS" is legitimate.
   "Uses 280 MB" is a fabrication unless you measured it.
4. **State what you did not do.** The honesty ledger is the most load-bearing section of a handback
   in this repo.
5. **Surface conflicts before solving them.** Where two requirements cannot both hold, say so, give
   the trade-off, recommend one. Do not quietly reinterpret one to make it satisfiable.
6. **Any number about Nuance cost, latency or capacity is unknown until measured.** Do not put one in
   a document, a comment or a commit message.

---

## 7. Git

From `CLAUDE.md` and Charles's standing rules: **all edits go through git.** Commit with a real
message. Run `git diff` and `git status` and actually look at them before anything leaves the working
tree, no matter how small the change feels.

Write the handback to `docs/handovers/YYYY-MM-DD-slug.md`, flat naming, per that folder's README.

---

## 8. What a good handback contains

1. **What changed**, file by file, and what it cost.
2. **The bakeoff delta as a number** (§5.1), with which method produced it.
3. **Every decision you took**, numbered from D297, with alternatives and why they lose.
4. **Every decision you overturned**, with the evidence — loudly (§3.2).
5. **The honesty ledger**: what you did not build, did not run, did not measure, and what you were
   unable to verify.
6. **The verification register** (§6.2).
7. **Register and `PROJECT_START_HERE.md` updated** in the same pass, including the next-free line.

---

## 9. One last thing

The two companion documents were written by a session that could read the code but never ran it,
and could read Nuance's documentation but never called the API. They are the best reasoning available
on 2026-11-16 and they will be wrong somewhere.

**The most useful thing you can produce is the place where they are wrong, found by running
something.** That is worth more than a clean implementation of a flawed plan — and the one failure
mode to avoid is implementing something you believe is wrong without saying so.

If you think v2 is the wrong move altogether, say that too. Plan §7 lists kill criteria that were
written precisely so stopping stays available. Stopping is cheap now: Decision C keeps the v7 avatar
and Piper either way, so a halt leaves a working product rather than a hole.