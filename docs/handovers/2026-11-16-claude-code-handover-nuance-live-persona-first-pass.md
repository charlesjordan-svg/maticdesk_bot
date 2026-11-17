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


---

# Second pass — 2026-11-17: the functional analysis arrived

**What changed since §1.** `docs/handovers/2026-11-16-v2-functional-analysis-persona-optimization.md` is on disk — saved and committed (`1103a3c`) by the Cowork session
that wrote it, at this session's request — and was read in full. §1's table is now history: nothing in it
is blocked on a missing document any more. Two commits follow it on the branch.

## A. What it unblocked, and what was built from it

| File | What |
|---|---|
| `client/src/nuance/surface-split.js` | **D305.** The §2.1 table in code, the one builder of `response.create`, the consent floor hold, and the pre-emptive close before a network-dropping capability |
| `client/test/surface-split.test.mjs` | 81 assertions. **This is the enforcement test for Decision D** the handover asks for |
| `server/src/nuance/persona-prompt.txt` | **D306.** The §6 draft, extracted from the document by script, not retyped |
| `server/test/nuance.test.mjs` §8 | 9 assertions pinning the file to the document |
| `server/src/index.js` | The hub uses the shipped prompt unless `MATIC_NUANCE_PROMPT_FILE` overrides it |

Client **2334 assertions across 29 files**; server headless **838 across 8**. All green.

**How the Decision D test works.** Every line in `persona.json` (the test finds them; it holds no list)
must have an entry in `SURFACES`, and a new line with none fails rather than defaulting to speech. Each
pinned, silent or degraded line is then driven through `personaTurn()` and the output is searched for
any six-word run of it. `response.create` may be written once, in that file, and the test looks for it
in the renderer, the main process and the agent too. Six mutations were tried — pinned text sent,
`filing.timeout` given a pointer, a ticket line handed over, the unknown-surface default flipped, the
floor hold removed, `reset_adapter` left off the close list — and **all six were caught**, one of them
at first by crashing the test rather than failing an assertion (fixed, so it now fails properly). A
seventh, harmless edit was run as a control and passed.

## B. Where I argued with the analysis (handover §3.1 invites it)

- **`social.offtopic` stays pinned — I agree with the table.** The handover calls this one arguable.
  The argument for pinning is in the repo: D260 exists because one rephrased scope line taught a
  narrower scope than the truth.
- **The result of an executed change is pinned. The table does not list it; I added it.** "I restarted
  the Print Spooler service" is an outcome claim, and by the analysis's own §2.3 test it is panel text.
  The prompt's CLAIMS block says the same thing from the other side.
- **A long answer is not truncated.** `response.create` takes 2,000 characters. An answer that does not
  fit goes to the screen whole and the persona points at it; half an answer is a wrong answer.
- **`boot` is handed over**, which the table also does not list. Decision A retired the recorded
  greetings from the live channel, so there is nothing pinned left to protect — but this retires D262's
  debugged rotation from the live path, which the plan's §11.3 says deserves to be explicit. It is now.
- **§2.2 says "fall back to the panel and text" after a pre-emptive close. Decision C says the v7
  avatar and Piper.** The two documents disagree and Decision C is later and the founder's:
  `beforeExecute()` returns `degradeTo: "local"`.
- **An unknown capability closes the session.** Not in either document. Unknown is never the
  permissive branch here (D267's rule).

## C. One real mint — observed 2026-11-17

Through the route's own handler, with the supplied key, `mira`, the shipped prompt and a throwaway
enrollment id: **HTTP 201, `warnings: []`**. `GET /usage` read `used: 4` before and after. The token was
not used and expired a minute later; **no conversation was started and no credit was spent.**

What that establishes: the request body the route sends is one the live API accepts (it had only been
written from documentation), `mira` is a valid id, and the prompt was not refused at mint.
What it does not: `[VERIFY]` whether the setup review can still hold or refuse it — the docs list
`app_review_held` as its own outcome — or how the persona behaves under the prompt, which nobody has
heard. The functional analysis's §9 row "the draft prompt clearing AUP review: untested" moves to
"accepted at one mint", not to "cleared".

## D. Decisions — additions to §4

| ID | Decision | Status |
|---|---|---|
| **D304** | §5.3 waits for the functional analysis | **discharged 2026-11-17** |
| **D305** | The surface split: one table, one builder, unknown is pinned | proposed |
| **D306** | The prompt is extracted from the document and pinned to it | proposed |

Next free: **D307**.

## E. The ledger, updated

**Now built that §7 listed as not built:** the surface split and its test; the consent floor hold and
the pre-emptive close, *as decisions a function returns*; the persona prompt.

**Still not built — and this is most of §5.3:**

- **The session.** No LiveKit vendored, no `nuance-session.js`, no `POST /conversation`, no event
  bus, no `<video>`. Nothing calls `personaTurn()`, `micStep()` or `beforeExecute()`.
- **Barge-in**, the **degraded switch** with history intact, the **mic control in the panel**, and
  **echo cancellation on speakers**.
- The **durable mint ledger** (D300) and **per-tenant prompt assembly**.

**Why it stops here.** What remains is the part that cannot be verified by a headless test: a WebRTC
room inside Electron's renderer, a face on a screen, a voice in a room. This repo's rule is that bugs
are found by running the thing, and eleven straight click-throughs have each found something. Vendoring
the largest dependency the client has ever taken into a signed binary, and wiring it to a window nobody
watches, would be the opposite of that. **It needs a session that can drive the Electron window, and
Charles for anything heard.**

**Not run in this pass either:** the database suite (PostgreSQL still down), the hub over a socket,
anything in Electron.

**A lapse to record.** The surface-split test was written before the module but was **not run red
first** — the module was written straight after it. The six mutations are the evidence that the test
can fail; they are not the same thing as having watched it fail first.

## F. Verification register — additions

| Claim | How known |
|---|---|
| The route's request body is accepted by the live API; `mira` is valid | **Observed** — one mint, 2026-11-17, HTTP 201 |
| The prompt is not refused at mint | **Observed** — same call, `warnings: []`. Review outcome beyond mint: **not known** |
| A mint spends no credit | **Observed** — `used: 4` before and after. One call |
| No pinned persona line reaches `response.create` | **Tested** — `surface-split.test.mjs` §2, with six mutations caught |
| That the persona would soften `filing.timeout` | Still the analysis's **judgement**. It is why the line is silent; it has not been tried |
| How the persona behaves under the prompt | **Not known** — nobody has heard it |


---

# Third pass — 2026-11-17: the session, built and run

Charles: *"Build the session."* Three commits (`470e6ac`, `3196ce3`, and the fix that follows it).
Register **D307**; next free **D308**. Click-through: `client/docs/PERSONA-RENDERER-CHECK.md`.

## A. What was built

| File | What |
|---|---|
| `client/src/nuance/nuance-session.js` | Main process. Hub mint → `POST /conversation` → events until admitted. Every failure is `{ degrade: true }`, never a throw |
| `client/src/main/main.js`, `preload.cjs` | Four IPC calls and one event. Main applies `mic-policy.js`, writes the egress lines, and **ends the session itself** on hide, reload, crash or quit |
| `client/src/renderer/persona-stage.js` | The room, the face, the event channel. Glue: sends what `personaTurn()` and main hand it |
| `client/src/renderer/persona-ui.js` | Summon button, microphone button, size button |
| `client/src/renderer/renderer.js` | One block in `say()`; `forPersona()` naming the surface above ten call sites |
| `client/src/renderer/vendor/livekit-client.esm.mjs` | 2.24.1, one file, 1.47 MB, Apache-2.0, sha256 pinned |
| `client/src/agent/hub-client.js` | `mintNuanceToken()` |
| `client/config.json` | `persona: { enabled: false, maxSessionSeconds: 600 }` |
| `client/test/nuance-session.test.mjs` | 39 assertions |

Client **2373 / 30**. Server headless **838 / 8**.

## B. What the run found

Three real sessions with `mira`: one driven by this session with a synthetic microphone, one started by
Charles in the same window (he took it for a live test — it was, and it found the defect), one short
one for the larger face.

1. **It works.** Click → face in a few seconds → greeting in her own words → microphone off and
   confirmed off by the service → on with one click → *"Hello Matic. How are you today"* transcribed,
   routed through Matic's own classifier as `social.howareyou`, answered → end → the bust.
2. **A closed window left a session with no ending** (§C).
3. **Under `delegation: client` the persona did not answer on its own.** Four reply requests, four
   replies, across two spoken turns. This was the largest unknown going in — the docs do not say —
   and it is what makes "Matic's router is the brain" true in practice. One session. `[VERIFY]`
4. **The name survived.** "Matic", twice. Synthetic voice; the bakeoff's worry (§3 of the first pass)
   is not borne out on this recogniser *so far*.
5. **The service draws its own AI mark in the picture**, lower centre. That is the plan's Q5,
   answered by looking: a green-screen composite would have to keep it.
6. **Credits.** `used` read 4 before, 7 after a 160-second session, 8 after Charles's, 9 after an
   11-second one. **Consistent with one credit a minute rounded up; not a rate.** At 60 a day that
   would be about an hour of face per day for the whole organisation, on a plan with one concurrent
   session — which is a demo allowance.
7. **The restart advice rode on a spoken turn** and, being untagged, came out as "it's on the
   screen". Correct by the rule; worth hearing before deciding it is right.
8. **One fact, two wordings.** For a handed-over surface the panel prints the template's sentence
   while she says her own. D245's shape, and a design question nobody has answered.

## C. The defect, and three guards that fired

**No closing line.** Charles closed the window at 03:50 with a session open. The microphone's stretch
was closed in the record (`reason: window-hidden`) and nothing else was: no `persona.closed`, no
duration. Main had asked the renderer to end the session and waited to be told, and a hidden
renderer is the last thing to rely on for stopping a clock. Main now closes the record and ends the
conversation itself, then tells the renderer. **Pinned by a structural test; not re-watched.**

**Guards that fired while wiring it — respected, not loosened:**

- Five tests pin the text of `say(...)` calls. The surface is named on its own line above.
- `restart-signal.test` forbids "microphone" in `renderer.js` (D256: the consent store). The control
  is in `persona-ui.js`, whose header says why that is not a dodge.
- `enrollment.test` pinned "four writes share `#act`". The mint is the fifth; the count and label
  changed. **That one is a test edited to pass, and it is said here so it is not found later.**

## D. Charles asked, mid-run

*"Is there any way to make the … face to face avatar bigger."* **Make the video bigger** (or a click
on the face): the rail widens to 500 px for a 460 × 418 face and the conversation narrows, so
nothing is ever behind it. Remembered across launches. Screenshot `04-larger-face.png`.

## E. The ledger

**Not run — most of the click-through's hard rows:** the capability answer by voice, the consent
hold, the pre-emptive close before a network change, barge-in. Each is built and each is a decision
a tested function returns; **none has been seen with a live face.**

**Not heard.** No person spoke to it through a real microphone in this session's own runs, and
whether the persona hears itself through speakers is unknown.

**Not verified:** the hide fix in a window; that the persona never answers unprompted beyond one
session; what she says under the prompt on anything but a greeting.

**The database suite ran for the first time and is RED:** `kb.test` 52 of 52; `db.test` 87 passed, 21
failed; `admin-db.test` failed. The failures read are in job-claim and time-window assertions, in code
this branch does not touch, against a database that had been off for nine weeks. **That it is stale
data and not this branch is an inference; it was not investigated.**

**Mistakes of mine in this pass.** A diagnostic line inserted with a broken newline made
`persona-stage.js` unloadable for one test run, which then did nothing and looked like a mystery. A
`sed` wrote real line breaks into a regex in `server/src/nuance/route.js` and **that went into commit
`3196ce3`**; the next commit repairs it. For several minutes Charles's own clicks were read as a
phantom caller of the microphone — the policy has none.

**Left running on this machine:** the hub on 8787 with the key in its environment, PostgreSQL in
Docker, and a second Matic Desk on a scratch profile with the persona on. Charles's own tray
instance was not touched.


---

# Fourth pass — 2026-11-17: after Charles talked to it

Charles ran a live session himself (136 s, microphone on for 129 s, a ticket taken by voice through to
its draft) and said: *"she seemed to perform well. Check logs. Please enable her ability to do approve
fixes and speak on the info from the this see about this machine tab and open tickets."* Register
**D308–D310**, §5.62f; next free **D311**. One commit, `66d0d50`.

## A. What his session's logs say

- **It held together.** Opened, microphone on six seconds later by his click, closed by him, the
  egress record complete with a closing line.
- **A ticket was taken by voice**: the offer, yes, first name, last name, location, contact, the draft
  on screen. Nothing was sent.
- **"Hello Maddox, how you doing?"** His first sentence. The recogniser wrote the name as *Maddox*, so
  it was not a greeting; it went to the model and came back as *"I can't fix this one from here — it
  needs desktop support. I can open a ticket for you."* The first pass's bakeoff predicted exactly
  this from a synthetic voice. **A real one did it on the first sentence.**
- **She speaks for herself.** 17 persona replies in that session; the client asked for about 8. And
  `session.delegation.created`, target *client*, arrived at least four times and was logged and
  dropped. So the persona has a model of its own, answers the user directly, and hands things to us
  that we do not pick up. **The third pass said "four requests, four replies — the persona did not
  answer on its own." That was two turns, and it was wrong.**
- **Turns were dropped.** Several finished spoken turns have no routing line after them: `submit()`
  ignores a sentence that arrives while another is in flight.

## B. What was built

| | |
|---|---|
| **D308** — the machine band, spoken when asked | `classify()` `machine` kind; `src/agent/machine-summary.js`; the renderer opens the band and relays the sentence |
| **D309** — open tickets, spoken | the `tickets.*` lines move from *pinned* to a new kind, *relay* |
| **D310** — a low-risk fix approved by voice | `src/nuance/voice-consent.js`; the consent card listens while it is up; `audit/voice-consent.jsonl` |

`client/test/voice-consent.test.mjs`, 95 assertions. Client **2473 / 31**.

**Each reverses something this branch pinned a day earlier**, on the founder's word. What was kept:
the machine sentence is built only from the band's own rows and never names the computer, the account
or an address (D249), and gives no advice (D256); the ticket band is still the wording that counts
(D288); the consent card is still the broker's and approval still presents a nonce and nothing else
(D130, D200).

**Asked before building, because it is the trust root:** what "approve fixes" should mean. Charles
chose *voice, low-risk only* over *voice for every fix* and *she explains, you click*.

## C. Seen

All three, in one session, with `mira` — and D310 by Charles's own voice, unplanned, while this
session's check had a card on screen:

- *"how is my computer doing"* → *"Two things stand out: last restarted — 16 hours ago and memory —
  almost full. The rest of what I can see looks normal: … all 5 drives have room."*
- *"where is my ticket"* → the filed-tickets reply, relayed.
- *"the internet is slow"* → a `flush_dns` card, the floor held. A one-word spoken answer: **ignored
  as unclear.** *"I approve."*: **approved**, *Approved by you, by voice* on the card, the broker ran
  it. `voice-consent.jsonl`'s nonce is the broker audit line's `consentNonce`.

## D. What is NOT fixed, and matters

1. **The name.** Until "Matic" survives a real voice, a greeting can turn into a ticket offer. The
   cheap fix is the recogniser's spellings as vocatives; the catch is that some are real words
   ("medic"). Not done: it wants a list of what Nuance actually writes, from more than one sentence.
2. **Two brains.** The persona answers from its own model. D299's reasoning — and the handover's
   "Nuance never reasons" — does not describe what runs. Either the hand-offs are answered and the
   prompt tells her to hand everything over, or the claim is dropped. **This is the open question on
   the whole design now.**
3. **Dropped turns.**
4. **What she actually says is not captured anywhere** — by design, for the user's words, but it means
   nobody can check a relay against what was relayed. Her own output transcript is a different thing
   from the user's speech and could be kept for testing.

## E. Ledger additions

**Not run:** the capability answer by voice; the pre-emptive close before a network change; talking
over her; a refusal by voice; voice approval of a second capability (`restart_service`).
**Not verified:** that she relays a ticket's state without changing it — the instruction is a request
to a model. **Not heard by this session:** anything.
**A machine change was made on this computer during testing:** the DNS cache was flushed, twice, both
approved by Charles (once by button at 04:12, once by voice at 04:14).


---

# Fifth pass — 2026-11-17: reading what she actually said

Charles: *"What do you recommend? is our model better? Review the logs and make improvements."*
Register **D311–D314**, §5.62g; next free **D315**.

## A. The evidence

The client's logs record event types and word counts, never words — by design. But **Nuance keeps a
transcript of every conversation**, both sides, and serves it to the API key. Those were fetched for
the sessions Charles ran and read turn by turn. Nothing from them is copied into the repo beyond the
short quotations in the register.

## B. Is our model better?

**On substance, yes, clearly. On conversation, hers is. Use each for what it is good at.**

| | The persona's own model | Matic's router |
|---|---|---|
| Knows the machine, the KB, the tickets | **No.** Nothing | Yes |
| The email problem | *"mailbox full? … Let me see what's eating the space."* *"Checking the mailbox."* — **invented** | *"I can't fix this one from here. It needs desktop support. I can open a ticket."* — true |
| "Go ahead", no card on screen | *"Okay, sending that through. It's already going."* — **invented** | nothing to approve, so nothing |
| Small talk, her own name, ending the call | Natural: *"It's Matic, actually."* | Templates |
| A ticket intake | — | Correct, and voiced as *"It's on the screen beside me"* five times (my default, D312) |

The recommendation is **not** "route everything": that was tried by accident and is the five pointers
in a row. It is: **she converses; Matic decides and acts; she is told plainly that she cannot see or
do anything, and says what she is handed.**

## C. What was changed

D311 (proposed, **awaits Charles**) the capability answer is relayed. D312 intake questions are asked,
the draft has its own pointer, a repeated pointer is dropped, spoken turns queue. D313 the name as
recognisers write it, and the name alone. D314 the prompt. Client **2499 / 31**; server 838 / 8.

## D. Checked

The email sentence, replayed through a synthetic microphone on the new prompt: *"Okay, I'll look into
the email problem for you."*, then the router's answer. Typed *"what can you do"*: the catalog's words,
relayed. Typed *"matic"*: a greeting. **Once each.** The amended prompt was accepted at mint.

## E. Not done

- **Her hand-offs are still dropped.** Their shape is now known (`id`, `type`, `target`).
- **A real voice has not been through the new prompt.** Charles's next session is that test.
- **Intake by voice, the queue, the repeat rule and the new vocatives have not been heard**, only
  unit-tested (and the name rule typed once).
- **Retention.** A transcript of everything said is held by the service and readable with the key.
  How long is still not known, and it is now the first thing a security review will find.


---

# Sixth pass — 2026-11-17: said, not read

Charles kept D311 and said the capability answer *"seems not formatted correctly for her speaking
style"*, and asked whether Nuance has embedded codes for expression and intonation. Register **D315**,
§5.62h; next free **D316**.

- **No such codes exist** (read from the docs): no markup, SSML or cues anywhere. The one dial is
  `expressiveness`, 0–2, fixed at mint; this build does not send it.
- **The text was the problem, and it was ours.** One written sentence with a semicolon list; she
  split it at the semicolons and the items lost their "when".
- **D315:** the same catalog phrases in a listener's shape — the count first, one short sentence per
  ability. Generated, not handed to her to reword. The panel is unchanged.
- **The restart suggestion is silent for her.** It had been coming out as a stray "it's on the
  screen beside me" after the answer to a different question.
- **Heard, via the service's transcript:** the new shape, almost word for word.

Client **2517 / 31**. **Not done:** the machine summary and the ticket reply have not been given a
listener's shape — she handled both acceptably in transcript, and neither has been complained of.


---

# Seventh pass — 2026-11-17: "she wouldn't read it"

Charles: *"check the logs. Look for improvements.. She wouldnt read the what can you do request. how do
I launch this v2 is there another icon for it?"* Register **D316**, §5.62i; next free **D317**.

**What the transcript of his fourth session showed.** The answer WAS routed and sent, three times.
She declined to say it: *"I can't list it all from memory"*, *"It's coming up beside me now"*, then
*"I don't read those out. That's just how it works on my end."* **She was following her prompt.** The
draft told her never to read the screen out and never to list what she can do; three founder
decisions later, that is exactly what she was being handed. A prompt and a surface split that
disagree is a failure the tests on either one cannot see.

The same transcript shows the router's answers arriving a turn late — *"Do I have any open tickets
already?"* was answered with the previous turn's escalation — because the client sent them as a
second request to speak while she was already replying; and *"I'm having problems with my network
printer. Can you help me with it?"* was answered with the capability list.

**Fixed (D316):** the prompt; answers to a spoken turn go back as the result of her hand-off; small
talk she heard is left to her; the misfiring marker is gone. **Checked live, twice, synthetic voice:**
*"What can you do?"* → *"I'll get you the list."* → the whole list. The first attempt after the prompt
change exposed the race (the answer was sent before her hand-off arrived and was lost), which is how
the waiting was found to be needed.

**A launcher:** `tools/launchers/start-v2.ps1` / `.cmd`, and a Desktop shortcut that passes the key
file's path. **Not run end to end** — it closes the Matic Desk already in the notification area,
which this session was not permitted to do.

Client **2531 / 31**; server 838 / 8.

**Still open:** a real voice on the new prompt and hand-off path; a hand-off whose answer is silent
(a pinned-silent surface) is left unanswered; her *"Oh okay, opening that ticket now"* — an action
claim — still appeared once in session four, before this prompt.
