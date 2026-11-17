# Handback — Matic Desk v2, the Nuance Live persona: first pass

**Date:** 2026-11-16
**Answers:** `docs/handovers/2026-11-16-claude-code-handover-nuance-live-persona.md`, with
`docs/handovers/2026-11-16-v2-nuance-live-avatar-plan.md` beside it (both filed in this pass, verbatim,
from `C:\Users\Charles\Downloads\Nuance Labs\`).
**Branch:** `v2-nuance-persona`, off `main` at `71ba7c4`. Five commits. **Not merged, not pushed.**
**Register:** D297–D304 taken; next free is **D305** (`docs/decisions/DECISION-REGISTER.md` §5.62).

## 0. The short version

- **§5.1 is done, both ways, and its answer is not the one expected.** Spoken forms of the 40 cases
  route like the typed ones: **1 of 120** hand-written variants moved, and **at most 4 of 120** through a
  real recogniser. The thresholds do not need re-tuning for disfluency.
- **Running it found a defect that is not about speech** and is in the shipping client: *"my screen
  went blank"* raised a consent card to clear a network cache. Fixed, test first (**D297**).
- **§5.4's pure half is built**: microphone off by default, only the user turns it on, and the egress
  record says audio left — the fact, never the content.
- **§5.2 is built against a stub** and has minted nothing: the route has no prompt to mint with.
- **§5.3 is not started, and should not be.** Its spec — the functional analysis — **is not on disk.**
  That is the one thing this handback needs from Charles.
- **One number read from the account changes the plan:** `GET /usage` says **`concurrent_sessions: 1`**.

## 1. The document that is missing

The handover names three things to read and says not to start from itself alone. Two were on disk.
The third, `product/2026-11-16-v2-functional-analysis-persona-optimization.md`, **is not**: not in the
repo, not in `C:\Users\Charles\Downloads\Nuance Labs\`, and a search of `C:\Users\Charles` for
`*functional-analysis-persona*` returned nothing. It lives in the Claude project and never reached a disk.

`CLAUDE.md` is unambiguous — *never reconstruct a missing one* — so it was not reconstructed, and
nothing below was built from a guess at its contents. What that costs:

| The handover leans on it for | Consequence here |
|---|---|
| §2.1, the surface split — "the contract" for Decision D | **Not built.** No list of pinned `persona.json` keys exists to test against |
| §2.2, floor hold around consent; pre-emptive close before `reset_adapter` / `renew_dhcp` | **Not built** |
| §2.4, why the degraded channel is the v7 avatar + Piper | Decision C is recorded as Charles's; its reasoning was not read |
| §3.3, `expressiveness` 0.5 | **Not sent at all** — the service default stands |
| §5, why speech shifts the question/action mix | §5.1 did not need it, and measured the shift itself (9 of 40) |
| §6, the draft system prompt | **No prompt exists in the repo.** The mint route answers 503 without one |

## 2. What changed, file by file

| File | What | Cost |
|---|---|---|
| `client/eval/spoken-cases.json` | 160 spoken-form variants (4 kinds × 40 cases) and 12 name probes. Committed **before** the first run (`12f74a1`) | Hand-written by a model; not a sample of users |
| `client/eval/run-spoken-bakeoff.mjs` | Drives the shipping `routeTier0()` and `classify()` in `Agent.propose()`'s order. No model | — |
| `client/eval/asr-roundtrip.py` | Piper → faster-whisper over all 212 sentences. Downloads nothing | ~15 min on this CPU |
| `client/docs/TRANSCRIPT-BAKEOFF-2026-11-16.md` | The numbers and what they do and do not show (`eval/results/` is gitignored) | — |
| `client/src/router/tier0.js` | **D297**: `lan` matches as a whole word; bare `dropped` became three phrases | Changes tier-0. The 16 pinned phrasings and all 40 cases route as before |
| `client/test/router.test.mjs` | §D297: 24 assertions, 17 red before the fix | — |
| `client/src/nuance/mic-policy.js` | New, pure, imports nothing. When the microphone is on | Called by nothing yet |
| `client/src/ticket/egress-audit.js` | Four `persona.*` events, `persona()` with a field allow-list, `personaSessions()` | Extends the record; the ticket half is untouched and a test interleaves the two |
| `client/test/persona-egress.test.mjs` | 48 assertions | — |
| `server/src/nuance/route.js` | New. `POST /v1/nuance/session-token` | Ledger and caps are in memory (**D300**) |
| `server/src/index.js` | Wires and lists the route; reads `MATIC_NUANCE_API_KEY`, `MATIC_NUANCE_PROMPT_FILE`, `MATIC_NUANCE_PERSONA` | Three new environment variables |
| `server/test/nuance.test.mjs` | 79 assertions against a stub upstream | — |
| `docs/2026-09-03-threat-model-v1.md` | Addendum: the open microphone | An addendum, not a re-analysis |

**Tests.** Client **2253 assertions across 28 files** (was 2181 / 27). Server headless **829 across 8**
(was 750 / 7). All green. **The server's database suite was not run** — nothing listens on 5433.

**No new dependency was added to either package.** LiveKit is §5.3's and is not here.

## 3. The bakeoff delta, as a number — §5.1

**Method: both.** Hand-written variants, *and* real ASR output (faster-whisper `base.en` and `small.en`)
over a **synthetic** speaker (Piper). No person spoke and no Nuance transcript was seen, so the ASR
figures are a floor. Full tables: `client/docs/TRANSCRIPT-BAKEOFF-2026-11-16.md`.

| | Differ |
|---|---|
| Hand-written: disfluent + long + vocative, before D297 | **1 of 120** |
| …after D297 | 0 of 120 |
| Hand-written: the complaint asked as a spoken question | **9 of 40** |
| Real ASR, the 40 typed sentences spoken and transcribed | 1 of 40 (`base.en`), 0 of 40 (`small.en`) |
| Real ASR, the 120 variants end to end, after D297 | 3 of 120 (`base.en`), 1 of 120 (`small.en`) |
| Greetings addressed to Matic that stop being social once transcribed | **8 of 12** (`base.en`), 1 of 12 (`small.en`) |
| Sentences in which the name was written "matic" | **8 of 52** (`base.en`), 48 of 52 (`small.en`) |

Three things follow, in order of weight:

1. **The name is the fragile part.** On the smaller recogniser "Matic" came back as `Haymatic`,
   `Medic`, `Maddick`, `Maddock`, `Mattick` — fifteen spellings — and a greeting to the assistant became a
   problem statement for the model. Which recogniser Nuance's resembles is not known. **This is the
   first thing to measure with a real session**, and it bears on the plan's Q7 (does "Mattick" survive).
2. **Speech sends more traffic down the question path**, which `classify.js` itself says "has been
   measured on nothing". Eight of the nine are escalation cases that leave the model for the knowledge
   base. What happens to them there was not run.
3. **Saying only the name does nothing useful.** `"matic"` alone classifies as `action`. Typed, nobody
   sends that; spoken to a face, it is the most natural opening there is. Not fixed: what Matic says
   back is a persona line and a product decision.

## 4. Decisions taken

All in `docs/decisions/DECISION-REGISTER.md` §5.62.

| ID | Decision | Status | Alternatives, and why they lose |
|---|---|---|---|
| **D297** | Tier-0: `lan` is a whole word; bare `dropped` is three phrases | proposed | *Leave it and report* — it puts an unprovoked consent card (D198) on the one path with no model to catch it. *Raise the threshold* — hides one symptom of substring matching and moves every pinned case |
| **D298** | `end_user_id` hashes the tenant and the **enrollment** from the verified credential | proposed | *Hash the D215 profile identity* (the plan) — it is the OS username, self-asserted; see §5 |
| **D299** | `delegation: client` | proposed | *`responses`* — forecloses local models and splits the brain from the degraded channel (plan §4.5). **Neither has been measured**; this follows the plan's reasoning, not evidence |
| **D300** | Mint caps (6 per install per hour, 40 per tenant per day) and the audit ledger are **in memory** | proposed | *A control-plane table now* — the right answer, and owed; PostgreSQL was down, a migration cannot be un-applied, and one never run is not committed. *No caps* — the route is the only place spend is controlled |
| **D301** | Decisions A–D of the handover | **decided — Charles** | His, recorded as his |
| **D302** | The persona is **`mira`** | **decided — Charles** | *"Use Mira for our Nuance avatar."* Answers the plan's Q6 |
| **D303** | Microphone off by default; only a user gesture with a visible window turns it on; hiding the window turns it off; the egress record carries the fact and never the content | default **decided** (handover §3.3/§5.4); mechanism proposed | *Trust the service's default* — it is on someone else's server in a preview API. *Record transcripts for audit* — creates the record the user never agreed to |
| **D304** | §5.3 is not started until the functional analysis is on disk | proposed | *Build the surface split from the handover's summary* — a reconstruction, and the one failure mode the handover names |

## 5. What was overturned — loudly

**One thing, with evidence from the repo: the source of `end_user_id` (D298).** The plan (§1.3) proposes
hashing "D215's `profile.js` identity" and marks it `[VERIFY]`. Verified, and it does not hold:

- D215's identity is the **OS username the client reports**. `CLAUDE.md` says of it: *"the OS username
  stays self-asserted (D215) and is not a scope key"*, and D284 scopes a requester's tickets to the
  enrollment for exactly that reason.
- Nuance attaches its **policy curfew** to `end_user_id`. A user who can choose that string can leave a
  curfew by changing it, or put a colleague into one by borrowing theirs.
- The hub has verified exactly one identity: the enrollment credential (D282). So the id is
  `sha256(tenant, enrollment id)`. It claims what the credential claims — an install, not a person.

**Two things the documents predicted that the run did not bear out.** Neither is a decision overturned;
both are the kind of place the handover asked for.

- *"If classification differs on more than a couple, the thresholds need re-tuning."* It differs on
  one, and that one was a keyword bug. **No re-tuning for disfluency is indicated.**
- The plan sizes the product for a fleet. **The account allows one concurrent session** (§6).

**Nothing in Decisions A–D, the trust root, or the egress record's meaning was changed.**

## 6. What `GET /usage` says — read 2026-11-16, with the supplied key

```json
{"limits":{"concurrent_sessions":1,"daily_credits":60,"api_keys":5,"hourly_conversations":60},
 "credits":{"used":4,"remaining":56,"renews_at":"2026-11-18T00:00:00"},
 "credit_balance":0,"available_credits":56,"active_sessions":0}
```

- **`concurrent_sessions: 1`.** On this plan, a second person who opens a live session while the first
  is in one is refused. Decision C's fallback makes that survivable — they get the v7 avatar — but it
  means "v2" is, today, a one-seat product. This partly answers the plan's Q2 and touches kill
  criterion 5.
- **60 credits a day; 4 already used** before this session and not by it.
- **What a credit buys in time is still not known.** `/usage` does not say.
  `I do not have a verified source for this.` Q2's first half stays with Nuance support.

**On retention (the handover's sixth question).** The docs state no retention period for audio or
transcripts. They do document `GET /conversation/{id}/transcript`, returning per-turn text with word
timings after a conversation ends — so **a transcript of what the user said is stored on Nuance's
side.** For how long: `I do not have a verified source for this.`

## 7. The honesty ledger

**Not built**

- **§5.3, all of it.** No LiveKit, no `nuance-session.js`, no surface split and no test for it, no floor
  hold, no pre-emptive close, no barge-in, no degraded switch. The enforcement test for Decision D does
  not exist.
- **Nothing calls `mic-policy.js`.** No control in the panel, no session to mute. The local audio
  track is not stopped at the source — a mute is a request to the service.
- **The persona prompt.** None in the repo; none invented.
- **A durable mint ledger.** A hub restart forgets the day's count and its audit trail.
- **Per-tenant prompt assembly.** `prompt` is one string.
- **The compositing window.** Blocked on Q1, as instructed.

**Not run**

- **No Nuance session was started and no token was minted.** No credit was spent by this session.
- **The server's database suite** (`npm.cmd run test:db`) — PostgreSQL was down.
- **The hub itself.** The new route was exercised through its handler, not over a socket.
- **Nothing was watched in Electron.** No UI changed.
- `cloud.test.mjs` and `privileged.test.mjs`, as always.

**Not measured**

- Turn latency under either delegation mode. Time to first word. Credits per session. Echo on speakers.
  Idle or active memory. None of these has a number anywhere in this pass.

**Not verified**

- How Nuance's recogniser writes "Matic", whether it punctuates, whether partial transcripts reach the
  client.
- Whether `green_screen` is available (Q1) or `mira` supports it.
- The route's request body against the live API. It was written from the documentation.

**Mistakes made and caught in this pass**

- A mutation probe that broke a file's syntax reported **zero failing assertions** — the test had
  crashed on import. The shape of a pass. Re-run correctly; the mutation was caught.
- One of the mint route's own assertions was wrong (`runtime_tools` contains the string it forbade).
  The code was right; the test was fixed.
- One probe (`end_user_id` per tenant only) did not apply and was **not** re-run; another passed by
  crashing the test rather than failing an assertion. Five route mutations were tried: three caught
  cleanly, one by a crash, one not exercised.

## 8. Verification register

| Claim | How known |
|---|---|
| Spoken-variant routing deltas (§3) | **Measured** — this machine, 2026-11-16, `eval/run-spoken-bakeoff.mjs` |
| ASR transcripts and name spellings | **Measured** — faster-whisper over Piper; synthetic speaker, not Nuance |
| `"my screen went blank"` raised a `flush_dns` card before D297 | **Measured** — `test/router.test.mjs` §D297, red then green |
| Account limits and credits (§6) | **Read** — `GET https://api.nuancelabs.ai/usage`, 2026-11-16 |
| Nuance request/response shapes, error codes, event names | **Read** — docs.nuancelabs.ai and its OpenAPI spec, 2026-11-16. `[VERIFY]` against a live call |
| No event makes the persona say an exact string | **Read** — docs say `response.create` instructions are "a note the persona reads for that reply". Supports Decision D |
| A transcript is stored by Nuance | **Read** — the transcript endpoint is documented. Retention period: **not known** |
| Credit → time | **Not known** |
| Turn latency, either mode | **Not known** |
| `delegation: client` is right (D299) | **Judgement** — the plan's, unmeasured |
| Cap values 6 / 40 (D300) | **Judgement** — sized to stop a loop, not to a budget |
| `micWords()` copy | **Judgement** — never seen on a screen |
| Which recogniser Nuance resembles | **Not known** |
| The functional analysis's contents | **Not read** — not on disk |

## 9. What is needed next, and from whom

1. **Charles: put the functional analysis on disk** (`docs/handovers/`, flat name). §5.3 and the prompt
   both wait on it.
2. **Charles: a view on `concurrent_sessions: 1`.** It may be a plan tier. It decides whether v2 is a
   demo or a product.
3. **Nuance support:** Q1–Q5 and retention are still out.
4. **Then, the cheapest real measurement:** one session with `mira` to hear how the name is
   transcribed. It needs a prompt, so it follows item 1.
5. **Before any deployment:** the mint ledger becomes a table (D300), with PostgreSQL up to run it.

**On whether v2 is the wrong move.** Nothing here says so. Two findings narrow it: one concurrent
session, and a wake word that one of two recognisers could not spell. Neither is a kill criterion as
written, and stopping remains cheap — every commit on this branch either stands alone (D297, the egress
record) or is inert without a key and a prompt.
