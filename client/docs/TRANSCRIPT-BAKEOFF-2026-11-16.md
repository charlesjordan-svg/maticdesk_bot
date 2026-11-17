# The transcript bakeoff — 2026-11-16

**What it answers.** `client/docs/BAKEOFF-2026-09-02.md` measured the proposal path on 40 cases that
were **typed**. v2's input is **speech**
(`docs/handovers/2026-11-16-claude-code-handover-nuance-live-persona.md` §5.1). Does the endpoint's own
routing — `routeTier0()` then `classify()`, in the order `Agent.propose()` runs them — put a spoken
form of a sentence where it puts the typed one?

**No model is called.** Both functions are local and deterministic. Everything below is a count of
routing outcomes, not a latency, a cost or a quality figure, and none of it is about Nuance's
recogniser, which nobody on this project has seen the output of.

**Reproduce it** (from `client\`):

```powershell
node eval/run-spoken-bakeoff.mjs
py -3 eval/asr-roundtrip.py --out eval/results/spoken-asr.json
node eval/run-spoken-bakeoff.mjs --asr eval/results/spoken-asr.json
```

`eval/results/` is gitignored (results are machine- and run-specific), so the numbers live here.

## 1. Both methods were run

| | Method A | Method B |
|---|---|---|
| What | 160 hand-written spoken-form variants of the 40 cases, four kinds each (`eval/spoken-cases.json`) | Every sentence — the 40 typed, the 160 variants, 12 name probes — **spoken by Piper and transcribed by faster-whisper** (`eval/asr-roundtrip.py`) |
| Is the ASR real | No ASR at all | **Yes** — `base.en` and `small.en`, CPU, int8, beam 5, temperature 0 |
| Is the speaker real | n/a | **No.** One synthetic voice (`en_US-amy-medium`), no room, no microphone, no accent |
| Written before the first run | Yes — commit `12f74a1` holds the variants and the runner, unrun | — |

**Method B is a floor, not the damage.** A clean synthetic voice is the easiest input a recogniser
gets. And Whisper stands in for "an ASR system": what transfers to Nuance is the *class* of change,
not the rate.

An **outcome** is `tier0:<capability><parameters>` when tier-0 clears its 0.8 threshold (no model is
asked) and `classify:<kind>[/<subkind>]` otherwise. Two sentences with one outcome take one path
through the product.

## 2. The delta, as numbers

Counts are *sentences whose outcome differs*. "Before" is the tree at `71ba7c4`; "after" is with
**D297** (§4) applied.

### Method A — hand-written

| Kind | n | Differ, before | Differ, after D297 |
|---|---|---|---|
| disfluent (fillers, repeats, restarts) | 40 | 0 | 0 |
| long (a story in front of the complaint) | 40 | **1** | 0 |
| vocative ("hey matic …") | 40 | 0 | 0 |
| **Headline** | **120** | **1** | **0** |
| asked (the complaint as a spoken question) — reported apart | 40 | **9** | **9** |

### Method B — real ASR, synthetic speaker

| | `base.en` | `small.en` |
|---|---|---|
| The 40 typed sentences, spoken and transcribed: outcome differs | 1 of 40 | 0 of 40 |
| …sentences where the *words* changed at all | 9 of 40 | 8 of 40 |
| The 120 variants, ASR effect alone (heard vs. the same words as written) | 3 of 120 | 1 of 120 |
| …sentences where the words changed at all | 87 of 120 | 46 of 120 |
| The 120 variants, end to end against the typed original, before D297 | 4 of 120 | 2 of 120 |
| The 120 variants, end to end against the typed original, after D297 | 3 of 120 | 1 of 120 |
| Name probes whose outcome differs once transcribed | **8 of 12** | 1 of 12 |
| Sentences carrying the name in which it was written "matic" | **8 of 52** | 48 of 52 |

## 3. What the numbers say

**3.1 Problem statements survive speech.** The handover's bar was "more than a couple". Disfluency,
missing punctuation and long framing moved **1 of 120** hand-written variants and at most **4 of 120**
through a real recogniser — and the recogniser rewrote the words in most of them (87 of 120 on
`base.en`) without moving the route. Substring matching on stems is robust to exactly the noise ASR
adds. **The thresholds do not need re-tuning for disfluency.** That is the opposite of what the
handover expected and it is the measured answer.

**3.2 Every ASR-caused change is one word.** All of them are case `dns-02`: *intranet* was heard as
*internet*, `internet` is a tier-0 network keyword, and an `action` (the model decides) became a
confident tier-0 `flush_dns`. That happens to be the capability `cases.json` expects for `dns-02`,
so it scores as right — **for the wrong reason, with no model consulted.** One homophone is not a
rate; it is a demonstration that a recogniser's vocabulary bias lands on tier-0's keyword list.

**3.3 The question path is where speech moves things — 9 of 40.** People talking to a face ask it
things. Eight of the nine are **escalation cases** that typed go to the model (which escalates and
offers a ticket) and asked go to the **knowledge base**, because `why does`, `how do i`, `who do i`
and `what do i` are question markers and no action verb is present: *"why does outlook keep crashing
every time i open a calendar invite"*, *"my chair is broken and my monitor stand is wobbling who do
i tell"*. The ninth, `aud-02`, loses a confident tier-0 match because *"why cant i hear"* is not the
keyword *"cant hear"*. `classify.js` says of itself that the question path "has been measured on
nothing". **It still has been.** This run shows only that speech sends more traffic down it; what
happens to that traffic there needs a hub, a corpus and a model, and was not run.

**3.4 The name is the fragile part.** `classify()` strips the vocatives `matic` and `matic desk` so
that a greeting addressed to the assistant is a greeting. On `small.en` the name survived in 48 of 52
sentences. On `base.en` it survived in **8 of 52**, written fifteen ways — `Haymatic` (11), `Medic`
(9), `Maddick` (5), `Maddock` (5), `Mattick` (3), `Maddox`, `Matak`, `Madic`, `bi-matic`… — and
**8 of 12** greetings, thanks and farewells addressed to Matic stopped being social and went to the
model as a problem statement. That is D198's defect (a pleasantry reaching the proposal path) through
the recogniser. **Which of those two recognisers Nuance's resembles is not known.** The handover
called this "a feature that silently does not work"; on one of two recognisers, it is.

**3.5 The bare name is not handled at all, typed or spoken.** `"matic"` and `"matic desk"` on their
own classify as `action` — the vocative is stripped, nothing is left, and no social marker matched to
begin with. Typed, nobody sends that. Spoken to a face, saying its name to get its attention is the
most natural opening there is. Not fixed here: what Matic should *say* back is a persona line
(`persona.json`, D234) and a product decision, not a classifier patch.

## 4. D297 — found by this run, and not about speech

The one hand-written variant that moved was *"i dropped my bag on the train this morning and my
laptop screen has a crack across the corner"* → `tier0:flush_dns` at 0.81. Over the threshold, so no
model is asked: the user is shown a **consent card to clear a network cache, for a cracked screen.**

Two tier-0 network keywords did it, and neither needs speech:

- **`lan`** is a substring of b**lan**k, p**lan**, p**lan**ner, **lan**guage.
- **`dropped`** is what people do to laptops, bags and coffee.

On a healthy, online machine, before the fix, each of these *typed* sentences raised that card:
*"my screen went blank"*, *"my second monitor is blank after lunch"*, *"the Teams planner will not
open"*, *"I need to change my language settings"*, *"can you explain the holiday plan"*, *"I dropped
my laptop and the screen is cracked"*, *"I dropped coffee on my keyboard"*.

That is D198's defect — a card the user did not provoke — on the one path with nothing downstream to
catch it. **Fixed, test first** (`test/router.test.mjs` §D297, 17 assertions red before the change):
`lan` matches as a whole word; bare `dropped` is replaced by `dropped out`, `dropping out` and
`keeps dropping`, with `connect`, `wifi` and `vpn` still catching a sentence that names what dropped.
The 16 tier-0-pinned phrasings and the 40 cases route exactly as before.

**Not fixed, and the same class:** `print` is inside finger**print**, blue**print** and s**print**;
`mute` is inside com**mute**; `queue` is a word desks use about tickets. Each produces a *confident*
proposal only when the matching service is genuinely stopped — a state-backed guess rather than an
unprovoked one — so they are recorded here rather than changed without a sentence that shows the harm.

## 5. What this did not do

- **No human spoke.** No microphone, no room, no accent, no second person talking.
- **No Nuance transcript was seen.** Whether its recogniser punctuates, how it writes "Matic", and
  whether it emits partials the router would see mid-sentence are all unknown.
- **The question path was not exercised past the classifier.** §3.3 counts where sentences go, not
  what comes back.
- **The variants are a model's idea of how people talk.** They were fixed before the first run, which
  rules out tuning them to the result; it does not make them a sample of real users.
- **One voice, one speaking rate.** Piper's default synthesis config, not the tuned one the app speaks with.
