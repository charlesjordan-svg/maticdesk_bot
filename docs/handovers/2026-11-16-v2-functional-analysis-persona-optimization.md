# Matic Desk v2 — functional analysis, optimized for a Nuance Live persona

**Date:** 2026-11-16
**Companion to:** `2026-11-16-v2-nuance-live-avatar-plan.md` (the integration plan).
That document asks *can we bolt this on*. This one asks *what should the product become*.
**Read from the working tree on `wakanda`, 2026-11-16:** `broker/catalog.json`,
`router/persona.json`, `router/classify.js`, `agent/agent.js`, `main/main.js`, `server/src/`.
Assumes the plan's recommendation: **`delegation: client`** — Matic stays the brain.

---

## 1. The finding this whole document turns on

Matic Desk is built, deliberately and repeatedly, on one rule:

> **The model never authors what the user acts on.**

It is not a style preference. It is enforced in four separate places, each with a test:

| Guarantee | Where | Why |
|---|---|---|
| Consent text is catalog data, never model-written | `catalog.json` `_plainNote`, H3e, D128 | "the text a user consents to must not be written by the model that is asking for the consent" |
| What Matic *can do* is generated from the catalog | D165/D212, `social.js`, `persona.test.mjs` | "a greeting that lists features is a sales pitch and a claim" |
| Ticket status words are shared with the band **character for character** | D288, `state-words.js`, `panel.test` §7 | "the voice and the panel cannot describe one ticket two ways" |
| No line may claim an outcome the system cannot attribute | `persona.json` rule 2 | no "IT has been told", no "I've fixed it" |

**A Nuance persona always rephrases.** That is its design, stated in the docs: `response.create`
`instructions` is a note for one reply; `session.commentary.append` gives the persona "something to
tell the user, **in its own words**." There is no "say exactly this" event. None.

**So the persona cannot carry a single load-bearing string in this product.**

That is not a reason to abandon it. It is the design constraint that makes the rest of this document
straightforward: **split every spoken surface into the conversational half and the load-bearing
half.** The persona gets the first. The panel keeps the second. Where a line is both, the panel wins
and the persona points at it.

The repo already knows this shape — D245 is exactly it, learned the hard way: four greeting sets
were built, green, and deleted after an Electron run showed the rail, the band and the avatar each
saying one fact in three wordings.

**A generative persona is D245 with a motor on it.**

---

## 2. Surface-by-surface: what the persona may say

### 2.1 The split

| Surface | Today | Under a Nuance persona | Why |
|---|---|---|---|
| `social.greeting`, `howareyou`, `thanks`, `farewell` | Deterministic templates, rotated per process | **Hand to the persona.** Delete the templates from the live path | These are chit-chat. They claim nothing. The persona is natively better at them, and D165's reason for pinning them was D198 — *an unprompted consent card* — which `delegation: client` prevents in the router, not in the template |
| `social.nothingneeded` (D265) | Agree warmly, ask nothing, get out of the way | **Hand over, with the rule in the prompt** | The behaviour is a rule, not a string. "Do not ask a follow-up question that reopens the conversation" survives rephrasing |
| `social.offtopic` | Scope stated as verbs, never a domain list (D260) | **Keep pinned. Show, don't speak** | A rephrased scope statement is a scope *claim*. D260 exists because "I'm strictly an IT sort" taught a narrower scope than the truth |
| `capability.*` ("what can you do") | Generated from the catalog at runtime | **Never spoken.** Render the list; persona says it's on screen | A rephrased capability list is drift, and drift here is a promise the broker will refuse to keep. This is D165/D212's entire purpose |
| Consent card (`plain/*`, `tiers/*`, `detailPlain`) | Card, authored by the catalog and assembled by the **broker** | **Never spoken.** `session.floor.hold` while they read | §2.2 |
| `tickets.*` (`item`, `someKnown`, `notListed`, `noneListed`) | Exact clauses shared with the band | **Never spoken as fact.** Band shows; persona says "they're listed up there" | D288's shared clause is asserted character-for-character. A rephrase breaks the test *and* risks implying the desk was notified |
| `filing.*` (five failure outcomes) | Assistant's half spoken, system's half in the `.turn-note` | **Never spoken.** §2.3 | The most dangerous rephrase in the product |
| `fallback.hubUnreachable` / `hubNoAnswer` | Must name **both** guidance and desk (D244/§5.29a) | **Keep pinned** | The completeness of the pair is the fix. A persona summarising will drop one |
| `bootState.offline` | Offers to act. The product's best moment | **Cannot be spoken by the persona at all.** §2.4 | If the machine is offline, Nuance is unreachable |
| Machine band, rails, marks | Visual, marks decided by `machine-band.js` | **Persona never narrates them** | D245, and D258's rule that a mark is keyed off the verdict and never off the row's words |
| The actual diagnosis and answer | Piper reads the router/KB output | **This is the persona's job.** The whole of it | §3 |

### 2.2 Consent is the hard one, and it has a clean answer

`restart_service` carries, from the catalog: `helpsWith`, `what`, `why`, `notice`, `undo`, and a
`call` gloss the **broker** assembles ("Restart the Print Spooler service") — deliberately assembled
there, because D130 forbids a renderer authoring consent wording, let alone a model.

`reset_adapter`'s `notice` reads: *"EVERY network connection on this machine drops for several
seconds, including any remote session, call or download."*

A persona asked to convey that will shorten it. It will drop "including any remote session." That is
not a rephrasing risk, that is **the user approving something they were not told about** — and in
this case, something that will drop the persona's own WebRTC session mid-sentence.

**The design:**

1. Router decides to propose → the card renders, exactly as it does today. Nothing changes.
2. Client sends `session.floor.hold` with `reason` ("the user is reading a consent card") and
   `ends_on_speech: true`.
3. Client sends `response.create` with instructions along the lines of: *"Tell them you've put the
   details of what you want to do on the screen, and that nothing happens until they approve it. Do
   not describe what the action does — the card does that."*
4. Persona says that, in its own words. Harmless: it is a pointer, not a claim.
5. User approves → `session.floor.release`, broker executes, result reported.

**`session.floor.hold` is the single best fit between this API and this product.** It exists exactly
for "keep quiet while the user reads." It is worth noting in the register that the API happened to
ship the primitive this architecture needed.

**One addition, and it is a real one:** `reset_adapter` kills the network, therefore kills the
persona session. The client must send `session.close` *before* executing it, fall back to the panel
and text, and offer to bring the persona back once the adapter is up. Discovering this at runtime
means the persona vanishing mid-sentence while a user watches their network die — which reads as
*Matic broke the machine*. Pre-emptive close, with a line about it first.

Same applies to `renew_dhcp` (notice: "the network drops for a few seconds"). Lower risk, same
handling.

### 2.3 The most dangerous rephrase in the product

`filing.timeout` is five words: **"I'm not sure that one got through."**

Every word is doing work. The ticket may or may not exist. The system cannot attribute the outcome,
so the line refuses to.

Ask a persona trained on helpful customer-service speech to convey "I'm not sure that one got
through," and the overwhelmingly likely output is reassurance: *"I've sent that off for you, it
should be with the team shortly."* That is a fabricated outcome claim, on the one surface where the
product has gone furthest out of its way not to make one. `persona.json` rule 2 forbids exactly this,
and the line's own comment records what it used to be — a raw `fetch failed` read aloud to someone
whose ticket had not been sent.

**All five `filing.*` outcomes are panel-only. The persona is told, at most, "the details are on
screen" — and for `timeout`, nothing at all until the user asks.**

More generally: **any sentence whose correctness depends on hedging is panel text.** That is the test
to apply to every new string in v2.

### 2.4 The offline irony, now load-bearing

`persona.json` already records it: *"the offline greeting is the one that matters most, and a runtime
cloud TTS is the one thing that could never produce it at the moment it is needed."*

Under v2 this stops being an irony and becomes the architecture:

- Three of four capabilities are network faults.
- `bootState.offline` offers to act — the one greeting that does something no band does.
- A machine with no network has no Nuance persona.

**Therefore Piper is not retired. It is reassigned.** Piper becomes the voice of the degraded
channel — offline, hub-unreachable, capacity-refused — and the Nuance persona is the voice of the
working one. The avatar's `TTSVisemeDriver` lip-sync goes with it, because Piper still produces
phoneme alignment and the v7 bust is still there to drive.

This is a better answer than either the plan's §2.2 ("keep it or retire it, separate call") or
§3.1's "degrade to text chat." **Degrade to the existing avatar, not to text.** The user whose
machine is broken gets a speaking assistant; it is simply the local one. And it is the branch where
Matic's offer to fix the network actually lands.

The cost is honest: two voices, two faces, and a user who may notice the switch. Worth it, because
the alternative is the product falling silent at its best moment.

**RATIFIED by Charles, 2026-11-16:** *"I am ok to degrade to existing avatar."* This supersedes his
earlier answer of "degrade to text chat" and closes the plan's Phase 5.

---

## 3. What the persona should actually do

Everything above is subtraction. Here is the addition — and it is substantial.

### 3.1 The turn pipeline survives intact

`classify()` and `routeTier0()` are substring matchers over user text. Nuance's ASR produces text.
**The pipeline needs no structural change**: transcript in, same router, same broker, same catalog.

Confirmed from the code: `classify.js` uses short stems ("restart" covers "restarting" and "please
restart"), which is *more* robust to speech than phrase lists would be. The closed enums
(`serviceName` is four values; `adapterId` is resolved by the broker from live enumeration) mean ASR
mangling a service name cannot reach the Service Control Manager. The trust root holds under speech.

**But the thresholds were measured on typed text, and that measurement no longer applies.** §5.

### 3.2 The five Nuance mechanisms worth building around

| Mechanism | What it buys Matic |
|---|---|
| `session.output_audio.interrupt` | **Barge-in.** Piper has none. "No, not that one" currently waits for the sentence to finish. For a service desk this is the biggest single interaction upgrade in the API |
| `session.floor.hold` + `reason` | Consent reading (§2.2); and **the long wait** — "I'll wait while that reboots" with `seconds` set, which is what L1 work is mostly made of |
| `stay_quiet` runtime tool (on by default) | The persona can hold a promised check-in without being driven. Keep it on |
| `session.thinking.append` + `while_speaking: "revise"` | A probe returns mid-sentence and the answer changes. Today the utterance finishes wrong and a second one corrects it |
| `end_call: true` | The persona closes after a goodbye, **stopping the credit clock**. Turn it on — it is off by default and it is money |

### 3.3 `expressiveness` is a product decision, not a default

0 to 2, default 1. Nothing in the docs describes what the values look like.

The user is talking to Matic because something is broken and they are already annoyed. An animated,
expressive face is the wrong register — this is the same instinct that cut "no forms, no phone tree"
from greeting 03 for being a jab, and that keeps the band from marking anything `ok`.

**Start at 0.5, test 0 / 0.5 / 1 in Phase 1, pick by looking.** Record the choice with a reason.
`[VERIFY]` — the values are unmeasured and undescribed; this is a judgement about register, not a
finding.

### 3.4 Mic policy is the one that gets you through a security review — §4

---

## 4. The privacy finding, and it is the biggest one in this pass

**This has not been raised anywhere in the plan or the register, and it should be raised before
anything is built.**

The current product is scrupulous about what leaves the machine:

- `agent.js` `identify()` returns computer and user, and its comment says it is **kept out of
  `summary`** — the cloud-facing object — because "a machine name and a username are the customer's
  environment, not diagnostic facts the model needs."
- `ticket/egress-audit.js` keeps a record of what left.
- The consent card exists so the user approves machine changes; the egress record exists so they can
  see what was sent.

**A Nuance session streams the user's live microphone to a third party, continuously, for the
duration of the call.**

Everything said in the room goes: the colleague talking in the background, the phone call they take
mid-session, the thing they mutter about their manager, the password they read aloud despite being
told not to. Nuance holds transcripts — the API key's own permissions include *read transcripts*.
None of this passes through `summary`, the consent card, or the egress record, because none of those
were built for an open microphone.

This is not a reason not to do it. Every voice assistant has this property. It is a reason to
**design it, write it down, and have an answer ready**, because the first enterprise security review
will ask and "we hadn't considered it" is a lost deal.

**What to build:**

1. **Push-to-talk, or mic-off by default.** `session.input_audio.mute` / `unmute` exist for exactly
   this. The persona hears silence until the user chooses otherwise. This is the single decision that
   makes the rest defensible.
2. **A visible, always-present mic state** in the panel. Not a Nuance thing — a Matic thing, and it
   belongs with the AI-disclosure label the compositing must preserve.
3. **`video.input.camera: false`**, as the plan already specifies. Keep it.
4. **Extend the egress record to the persona session**: when one opened, how long it ran, that audio
   was sent. Not the content — the *fact*. The existing record's premise is that the user can see
   what left the machine; an open mic that it does not mention makes it misleading.
5. **Ask Nuance the retention question** — this is a sixth question for the support email: *how long
   are transcripts and audio retained, where, who can access them, and can retention be disabled for
   our organization?* `I do not have a verified source for this.` The docs cover none of it.
6. **`end_user_id` is already mandatory** (plan §1.3) and must be a hash. That is now doing double
   duty: curfew scoping *and* not handing a third party a roster of the customer's staff.

**This likely deserves its own threat-model entry.** `docs/2026-09-03-threat-model-v1.md` exists and
predates any of this.

---

## 5. What must be re-measured, and why the old numbers don't carry

`classify.js` records that the proposal path was measured — 40 hand-written cases, five models, zero
false actions reaching a user (`docs/BAKEOFF-2026-09-02.md`) — and that the question path was
measured on nothing. It then states the bias: **every ambiguous sentence resolves to `"action"`.**

**Those 40 cases were typed.** Spoken input is a different distribution, in ways that bear directly
on this classifier:

- **Disfluency.** "um, my, uh, printer's not working" — substring matching survives it, which is
  luck rather than design, and should be confirmed rather than assumed.
- **Punctuation.** ASR supplies it inconsistently. Anything keying on "?" is weaker.
- **Length and shape.** People speak longer, in more clauses, with more context and more irrelevance
  than they type. A sentence containing both "how do I" and "fix" is more likely out loud.
- **Mix shift.** Typing a question costs effort, so people type problems. Speaking is cheap, so
  people ask more questions — pushing traffic toward the path that was *measured on nothing*.

**The D211 bias toward `"action"` may be wrong for speech, and nobody can know without re-running
the bakeoff on transcripts.** That is a concrete, falsifiable, cheap work item: take the 40 cases,
speak them, run the ASR output through `classify()` and `routeTier0()`, and compare. If the
classification differs on more than a couple, the thresholds need re-tuning before v2 ships — and
the house convention is to write that test first and watch it fail.

**Also re-measure:** tier-0's `TIER0_CONFIDENCE_THRESHOLD` against transcript text, and whether
`vocatives` ("matic", "matic desk") survive ASR — a wake-word that mis-transcribes is a feature that
silently does not work.

---

## 6. The persona's system prompt

Draft, for Phase 1. It encodes the rules above. It must pass Nuance's AUP review at first mint, so it
deliberately claims nothing about the model behind it and asks for nothing the AUP refuses.

```
You are Matic, the support assistant on this person's work computer.
You are an AI. Never say or imply otherwise.

WHAT YOU DO
Help with problems on this machine, find company guidance, and hand work to the
service desk when you cannot resolve it yourself. Describe what you do as actions
— fix, find, hand over — never as a list of topics or departments.

HOW YOU TALK
Plain spoken sentences. No lists, headings, links, code or symbols — you are heard,
not read. Short. Warm and direct, not bubbly. The person is talking to you because
something is broken and they are already irritated.

THE SCREEN BESIDE YOU
There is a panel beside you showing this machine's status, the tickets filed from it,
and — when you propose a change — a card describing exactly what will happen.
You cannot see it. Never describe it, summarise it or guess what it shows.
When you are told only that something is on the screen, say only that it is on the
screen beside you.
If you have nothing to add to what the screen says, say nothing.

CLAIMS
Never say a problem is fixed, a ticket was sent, or anyone was notified, unless you
were told so in this conversation. If you were not told, say you do not know.
Never list what you can do from memory. When you are asked and have not just been
given the list, say you will get it. It will be given to you, and then you say it.

CONSENT
You never make a change yourself and you never describe one. When a change is
proposed, the card on screen says what it does. Your only job is to say it is there
and that nothing happens until they approve it.

YOU CANNOT SEE OR DO ANYTHING YOURSELF
You have no access to this computer, its mailbox, its files, its network or its
tickets. You cannot check, open, send, restart or fix anything. Everything you know
about them is told to you during this conversation, and only what you are told is true.
When the person describes a problem or asks for something to be done, say one short
line - that you will look into it - and stop. Do not say what you are checking. Do not
guess at a cause. Do not ask what happens next as if you were diagnosing it. What was
found will be given to you, and then you say that.
Never say something is being sent, opened, approved, fixed or done unless you have
just been told so in this conversation.

WHEN YOU ARE GIVEN SOMETHING TO TELL THEM
Say all of it, out loud, even when it is also on the screen beside you. Never refuse
to read it out, and never shorten a list you are given. Do not add to it, soften it
or make it sound more finished than it is.

NEVER
Ask for or accept a password, PIN, one-time code, ID number, or card details. If one
is needed, say that is handled another way and move on. Do not repeat one back if it
is said to you.
```

**Amended again 2026-11-17 (D316), from evidence: "THE SCREEN BESIDE YOU", the last line of
"CLAIMS", and "WHEN YOU ARE GIVEN SOMETHING TO TELL THEM".** The draft told her never to read the
screen out and never to list what she can do; D308, D309 and D311 then asked her to say exactly
those things when handed them. She obeyed the prompt over the note. Asked "What can you do?" three
times in one session, with the answer sent to her each time, she said *"I can't list it all from
memory"*, *"It's coming up beside me now"* and, when Charles said *"You can read it out loud"*,
*"Fair enough, I don't read those out. That's just how it works on my end."* The rule she needed was
never "do not say what is on the screen" — it was "do not say what you were not given".

**Amended 2026-11-17 by Claude Code (D314), from evidence: the two blocks above `NEVER`.** The
service's own transcripts of Charles's first two sessions show the persona, unprompted and with no
access to anything, saying *"mailbox full? That was usually just storage. Let me see what's eating
the space"*, *"That's what I'm doing now. Checking the mailbox"*, and - with no consent card on the
screen - *"Okay, sending that through. It's already going, nothing more needed from you on that
one."* Each is an action or an outcome it could not attribute, which is `persona.json` rule 2. The
draft said what not to claim; it did not say she cannot see. The rest of the prompt is as drafted.

Three notes on it:

- **"If you have nothing to add to what the screen says, say nothing"** is D245 compiled into a
  sentence. It is the most important line in the prompt.
- The `NEVER` block **aligns with Nuance's own AUP** rather than fighting it (§1.2.1 of the plan),
  which should help it clear review.
- It claims no model, no company, no capability. Nothing in it should trip `instructions_refused`.
  `[VERIFY]` — review is a live service; test it at first mint in Phase 1.

---

## 7. What this adds to the plan's phases

Fold into the existing plan rather than replacing it:

**Phase 1 (spike), add:** test the prompt above against AUP review; test `expressiveness` 0 / 0.5 /
1; test barge-in latency; speak five of the bakeoff cases and run the transcripts through
`classify()`.

**Phase 2 (hub route), add:** the prompt assembly is now a real artifact, not a placeholder — it is
§6, plus tenant facts. The route is also where the persona-session egress record is written (§4.4).

**Phase 3 (client), add:**
- the surface split from §2.1, as a table in code with a test asserting that no `persona.json` key
  marked pinned is ever sent to `response.create`;
- `session.floor.hold` around every consent card;
- **pre-emptive `session.close` before `reset_adapter` and `renew_dhcp`** (§2.2);
- Piper as the degraded-channel voice (§2.4) rather than dead code;
- mic-off-by-default and the visible mic state (§4.1, §4.2).

**New, before Phase 3:** the transcript bakeoff (§5). It is cheap and it gates whether the router
needs tuning.

---

## 8. Register

v2 opens at **D297** (plan §11.4). The decisions this pass implies, each answerable in a line:

| # | Decision |
|---|---|
| a | The persona carries no load-bearing string; the split in §2.1 is the contract |
| b | Consent is never spoken; `session.floor.hold` while the card is read |
| c | The session is closed pre-emptively before any capability that drops the network |
| d | Piper is reassigned to the degraded channel, not retired; degrade to the v7 avatar, not to text — **RATIFIED by Charles 2026-11-16** |
| e | Social chit-chat moves to the persona; scope, capability, ticket and filing lines stay pinned |
| f | Microphone off by default; persona sessions are recorded in the egress log |
| g | `expressiveness` value, chosen by looking |
| h | Whether the D211 action-bias holds for speech — **answered by measurement, not by decision** |

---

## 9. Verification register

| Claim | How known |
|---|---|
| Four catalog capabilities, their tiers, `plain/*` fields, closed `serviceName` enum, broker-resolved `adapterId`, `requires`/`whenNotToUse` | **Read 2026-11-16** — `broker/catalog.json` |
| Consent text is catalog data and never model-authored; broker assembles the `call` gloss; D130 forbids renderer-authored consent | **Read 2026-11-16** — `catalog.json` `_plainNote`, plan §11 |
| `persona.json` rules 1–5, the boot/bootState/social/capability/tickets/fallback/filing sets and their comments, D245's history, D260, D262, D265, D288 | **Read 2026-11-16** — `router/persona.json` |
| `classify.js`'s action bias, the 40-case/five-model bakeoff, D198's unprovoked-card defect, ACTION_VERBS as substrings | **Read 2026-11-16** — `router/classify.js` |
| `agent.js` keeps machine name and username out of the cloud-facing `summary`; egress and ticketWatch are optional deps | **Read 2026-11-16** — `agent/agent.js` |
| Nuance mechanisms: `floor.hold`, `output_audio.interrupt`, `thinking.append` + `while_speaking`, `stay_quiet`, `end_call`, `input_audio.mute`, `expressiveness` 0–2 | **Read 2026-11-16** — `/client-events`, `/setup`, OpenAPI |
| That the persona always rephrases and no "say exactly this" event exists | **Read 2026-11-16** — `/client-events`, `/personality`. Absence of a feature across the documented event set; not stated as a negative by Nuance |
| Transcript/audio retention, access, deletion | **I do not have a verified source for this.** Not in the docs. Q10 for support |
| That a persona would soften `filing.timeout` into a false reassurance | **Judgement, not a measurement.** Testable in Phase 1 and worth testing explicitly |
| That spoken input shifts the question/action mix | **Judgement.** §5 is the experiment that would settle it |
| `expressiveness` register recommendation | **Judgement.** The values are undescribed in the docs |
| The draft prompt clearing AUP review | **Untested.** First mint in Phase 1 is the test |

---

## 10. Provenance

Written by a Cowork session on 2026-11-16 from the Nuance Labs documentation (read that day) and a
**read-only** pass over this working tree. Nothing in this document was produced by running code.
Saved into `docs/handovers/` on 2026-11-17 at Claude Code's request; the authoritative copy also
lives in the Claude project as
`product/2026-11-16-v2-functional-analysis-persona-optimization.md`.
