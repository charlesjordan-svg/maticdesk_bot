# Claude Code handover — why she is not responding correctly: one session, read from the log

**Date:** 2026-11-18
**From:** a Cowork session, reading `client/audit/app.log` on `wakanda`.
**Trigger:** Charles, after a live session — *"she is not really responding correctly."*
**Evidence:** conversation `5b9fc18e-36b0-44f8-b658-e49d25b9427c`, session
`3dd770c3-3e1a-4515-b909-effb47728823`, **2026-11-17 23:41:48 → 23:44:09 Z**, 140 s, persona `mira`,
camera on for all 140 s. Seven spoken turns.
**Branch:** `v2-nuance-persona` at `3b76eff`. Register at **D326**; next free **D327** — confirm
against the register's own header.

**This was the first real session after D325 and D326 landed. It is worth reading as their first
measurement, because the instrumentation you built worked: `spoken-turns.mjs` produced the number
without anyone guessing.**

---

## 1. The headline: the knowledge base was never reachable

`client/scripts/spoken-turns.mjs`, run against this log:

```
spoken turns logged: 7
      5  action hers hers
      2  action route work

candidates for the D318 regression (question or action, stayed hers): 5 of 7
asked of the knowledge base: 0 (declined 0; a decline is silent on the voice path, D325)
```

The `[spoken]` lines in full:

```
23:42:02  kind=action route=hers  outcome=hers
23:42:07  kind=action route=route outcome=work
23:42:41  kind=action route=hers  outcome=hers
23:42:51  kind=action route=route outcome=work
23:43:15  kind=action route=hers  outcome=hers
23:43:20  kind=action route=hers  outcome=hers
23:43:34  kind=action route=hers  outcome=hers
```

**Every turn in the session classified as `action`. Not one `question`. Not one `social`.**

So **D325 never fired.** The knowledge base by voice, built that same day, is gated on
`kind === "question"`, and nothing in a real conversation reached that branch. Five of seven turns
were answered by her own model — which has no access to this machine, the knowledge base, or the
tickets. That is the thing Charles heard.

### 1.1 Why everything is `action`

`classify.js` resolves in this order: tickets → machine → social (no residue) → **ACTION_VERBS**
(`:423`) → QUESTION_MARKERS (`:427`) → **default to `action`** (`:433`, *"no question marker —
defaulting to the proposal path (the measured one)"*).

Five of the seven came back `route=hers`, which under D326 means **no explicit verb matched**. So
those five hit the `:433` default: no question marker, no action verb. That is ordinary speech —
*"my screen keeps going black"*, *"it's doing that thing again"*, *"nothing happens when I click
it"*. None carries a question marker; none carries an action verb.

**D211's default was built for a box people type problems into, where "unrecognised → proposal
path" sends work to the measured path. On the voice path D326 inverts its effect: unrecognised now
means hers, so the default sends work to the one place that cannot do any.** That is not a defect in
D326 — D326 is right that a defaulted action must not be routed as a proposal. It is that nothing
was put in the gap D326 opened.

---

## 2. The fix: ask the knowledge base on an unrecognised action

**Route to `ask` when `kind === "question"` or when `kind === "action"` carries no verb.**

```js
if (kind === "question") return "ask";
if (kind === "action" && !verb) return "ask";   // the :433 default
if (kind === "action" && verb)  return "route"; // D326, unchanged
return "hers";
```

**Why this is safe, and it is the argument D325 already won:** a decline is silent. An unrecognised
sentence asks the knowledge base, and if the knowledge base has nothing, nothing is said and her
conversational answer stands — exactly today's behaviour. So the change can only *add* a correct
answer; it cannot produce a ticket offer, an escalation or a proposal from a pleasantry, which is
the D318 defect.

**What it costs:** a hub round trip, including a model call on the knowledge base's side, on every
unrecognised sentence — which in this session would have been five of seven. That is a lot of round
trips for small talk. §3 says why that matters more than it looks.

**The cheap mitigation is already proven in the suite:** `kb.test.mjs` shows the **lexical** leg
returns **zero** chunks for off-corpus questions while the dense leg always returns neighbours. Gate
the model call on the lexical leg finding at least one chunk, and an unrecognised pleasantry costs a
retrieval and no model call at all.

**Do not "fix" this by widening QUESTION_MARKERS.** It is tempting and it is the wrong shape:
markers are a list someone maintains against a language people speak freely, and every addition
risks re-breaking D318 by pulling residue-carrying small talk into `question`. The default is the
right place to intervene, because the default is where "I do not recognise this" already lives.

---

## 3. A hand-off took 28 seconds

Measured from the log, this session:

| Hand-off | Answer returned | Gap |
|---|---|---|
| `23:42:07.528` | `23:42:35.811` | **28.3 s** |
| `23:42:58.567` | `23:43:03.144` | 4.6 s |

Twenty-eight seconds of dead air in a live voice conversation. **Charles spoke again at `23:42:33`,
while waiting** — so the conversation interleaved: his next sentence arrived before the answer to
his previous one.

There is a second symptom of the same thing. Mapping turns to `[spoken]` lines by elimination, the
turn at `23:42:58` appears to be classified at `23:43:20` — **a 22-second lag between the turn
ending and its routing decision being logged.** `[VERIFY]` — that mapping is inference from
ordering, not a field in the log; §6 makes it a fact instead of a guess.

**This needs its own measurement before anything else is tuned.** Where the 28 s went is not in the
log: hub round trip, the model, the relay back, or her own speaking time. One run with timestamps on
each leg answers it. Until then **no latency figure should appear in any document** — the two
numbers above are the gap between two client-side log lines and nothing more.

This also bears directly on §2: adding a hub round trip to five of seven turns is only acceptable if
the round trip is not sometimes 28 s. **Measure §3 before shipping §2**, or gate §2 behind the
lexical pre-filter so the common case never reaches the model.

---

## 4. Two ticket offers were dropped as "talked past"

```
23:42:36.760 [ticket] the offer was talked past in conversation - dropped;
             nothing was filed and nothing was sent
23:43:10.990 [ticket] the offer was talked past in conversation - dropped;
             nothing was filed and nothing was sent
```

Both within 35 seconds of each other. The mechanism is working as designed — `main.js`'s
`agent:spoken` drops a pending offer when the next sentence does not answer it, which is the typed
path's escape 1 and exists so a "yes" three sentences later cannot open a ticket nobody is still
discussing.

**But twice in 140 seconds says the sentence that follows an offer is routinely not recognised as
an answer.** Two candidates, and the log cannot tell them apart:

- `intake.answers()` is matching typed affirmatives and missing spoken ones (*"yeah go on then"*,
  *"sure, do that"*, *"please"*), or ASR punctuation is defeating it;
- or the offer was made, the 28-second gap intervened (§3), and by the time Charles answered, the
  conversation had moved on.

Note the ordering: the first drop at `23:42:36.760` lands **less than a second after** the delayed
answer arrived at `23:42:35.811`. That is suspicious enough to look at first.

**Log what the dropped sentence classified as** — not its words — so this distinguishes itself next
time.

---

## 5. The no-sound hint is firing on ordinary pauses

Five times in 140 seconds:

```
23:42:15.339  NO SOUND from the microphone for 10 s while it is on
23:42:23.340  the microphone is picking up sound
23:42:42.340  NO SOUND ...
23:42:49.339  the microphone is picking up sound
23:43:17.340  NO SOUND ...
23:43:28.339  the microphone is picking up sound
23:43:38.339  NO SOUND ...
23:43:39.340  the microphone is picking up sound
23:43:49.339  NO SOUND ...
23:44:02.339  the microphone is picking up sound
```

Every one is followed by sound returning, between 1 and 13 seconds later. The microphone is fine
throughout — `enabled true, muted by the system false, live` on every line.

D323 narrowed this to *"a microphone that has produced nothing"*. **The narrowing is not holding:**
this microphone produced plenty and the hint fired five times. And the longest silences are the ones
§3 explains — the user waiting for an answer. **A hint that fires while the user is waiting for
Matic tells them their microphone is broken when Matic is the thing that is slow.**

Make it a per-session latch: once the microphone has produced sound in this session, the hint is
spent and never fires again.

---

## 6. Make the next session diagnose itself

Three small additions. Everything above cost a careful read of 60 log lines; none of it should have
to be read again.

1. **`[spoken]` carries `verb=` and `why=`.** `classify` already returns `why` — *"action verb
   \"fix\""* versus *"no question marker — defaulting to the proposal path"* — and nothing records
   it. With those two fields, §1.1 is read off the log instead of inferred, and §2's effect is
   visible the moment it ships.
2. **`[spoken]` carries a turn id, and the turn line carries the same one.** That removes the
   elimination-mapping in §3 and makes the turn→decision lag a measured number.
3. **Timestamps on each leg of a hand-off** — handed off, hub asked, hub answered, relayed, she
   began speaking. §3 is unanswerable without this.

**Also worth having: a way to read the service's transcript.** The hub holds the API key and Nuance
exposes a transcript read on it, but there is no route and no CLI, so her actual words are not
reachable from the repo. Everything in this document is inferred from classifications and timings,
**never from what she said.** A `bin/transcript.mjs <conversationId>` would have made this
diagnosis ten minutes instead of an hour — and §4's two candidates would be settled rather than
listed.

---

## 7. Order

| # | Work | Why this order |
|---|---|---|
| 1 | §6.1 and §6.2 — `verb=`, `why=`, turn id on `[spoken]` | Cheapest, and everything else is measured through it |
| 2 | §6.3 + §3 — instrument the hand-off, find the 28 s | Gates §2; and 28 s is on its own enough to make her feel broken |
| 3 | §2 — ask the knowledge base on an unrecognised action, behind the lexical pre-filter | The actual fix for what Charles heard |
| 4 | §5 — latch the no-sound hint per session | Minutes |
| 5 | §4 — log the dropped sentence's classification, then fix what it shows | Needs §6.1 to be diagnosable |
| 6 | §6 — `bin/transcript.mjs` | Pays for itself on the next report like this one |

**§2 is the fix Charles is waiting for, and it is third** because shipping it on top of a
sometimes-28-second round trip would make the session slower without making it right.

---

## 8. Reporting

Charles's standing rules: no invented facts; `I do not have a verified source for this.` where there
is none; `[VERIFY]` inline and a verification register at the end; design targets separated from
measurements; an honesty ledger. Write the test first and watch it fail. `git diff` and `git
status`, read, before anything leaves the tree.

**One rule this document leans on hard: no latency number goes anywhere until §3 is measured.** The
28.3 s and 4.6 s here are gaps between two client-side log lines, and they are labelled as that.

---

## 9. Verification register

| Claim | How known |
|---|---|
| The seven `[spoken]` lines, verbatim; all `kind=action`; five `route=hers` | **Read 2026-11-18** — `client/audit/app.log` |
| 5 of 7 regression candidates; knowledge base asked 0 times | **Run 2026-11-18** — `client/scripts/spoken-turns.mjs` |
| `classify.js` order: verbs at `:423`, question markers at `:427`, default to `action` at `:433` | **Read 2026-11-17** — `router/classify.js` |
| `route=hers` on an `action` implies no verb matched | **Read 2026-11-17** — D326's branch in `turn-routing.js` |
| Hand-off → answer gaps of 28.3 s and 4.6 s | **Measured 2026-11-18** from two client-side log lines. **Where the time went is not known** |
| The 22-second turn→classification lag | **Inference** from ordering, not a logged field. §6.2 settles it |
| Two "talked past" drops, 34 s apart; the first <1 s after the delayed answer | **Read 2026-11-18** |
| Five no-sound hints, each followed by sound returning; device live throughout | **Read 2026-11-18** |
| Session length 140 s, camera on 140 s, audio sent 140 s, persona `mira` | **Read 2026-11-18** |
| Lexical leg returns zero off-corpus; dense leg always returns neighbours | **Read 2026-11-17** — `kb.test.mjs` output |
| **What she actually said** | **Not known.** No transcript route, no CLI, the API key is not in the repo. Everything here is from classifications and timings |
| Which of §4's two candidates is the cause | **Not known.** §4 lists both; neither tested |
| That widening QUESTION_MARKERS would re-break D318 | **Judgement**, not a measurement |
