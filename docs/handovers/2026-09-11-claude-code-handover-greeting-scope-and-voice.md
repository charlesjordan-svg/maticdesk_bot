# Claude Code Handover — 2026-09-11 — service-desk scope in the persona, and the recorded-greeting question

**Repo root:** `C:\Users\Charles\Downloads\maticdesk_bot`. **Branch:** `main`.
**Register:** `docs/decisions/DECISION-REGISTER.md` — **read it for the next free D-number.** The
2026-09-09 handover said D226; lines dated 2026-09-10/11 reference D234, D235, D244, D245, D246, so
it has moved. Do not guess one.
**Written by** a Cowork session that produced greeting copy and audio, **for** the session that
puts it in the product. Read `CLAUDE.md`, then `PROJECT_START_HERE.md`, then this.

**Companion doc** (copy, scope reasoning, verification register):
project `Matic Desk Ai Chatbot` → `product/2026-09-11-greeting-set-and-voice-spec.md`.

---

## 0. The founder decision that starts this

Charles has widened the product from a **technical** service desk to a **service desk**. The KB may
hold anything the business puts in it — technical procedures, HR processes, facilities, cafeteria
menus — and the assistant handles three verbs against it:

| Verb | Today |
|---|---|
| **Fix** | Shipped. The `catalog.json` capabilities. |
| **Find** | Shipped. Company guidance via the hub's KB. |
| **Request** | **Not built.** Intake for "I need a thing" — provisioned, approved, actioned — routed the same way an incident is. |

He asked for new greetings. The greetings are the smallest part of this.

## 1. What the Cowork session actually found — read this before writing code

**The greetings are already built and already correct-by-test.** `client/src/router/persona.json`
holds `boot` (2 lines) and `social.greeting` (3 lines), rotated in order by
`pickVariant`/`socialReply` in `client/src/router/social.js` (D234). `client/test/persona.test.mjs`
enforces the file's two rules against `client/src/broker/catalog.json`'s own words.

So this is **not** "add a greetings feature." It is an amendment to persona data, plus the much
larger question of what else in the persona and the router the scope change invalidates.

**The persona already contradicts the new scope in three places**, and that matters more than the
greeting copy:

| Key | Current text | Problem |
|---|---|---|
| `role` | "the IT support assistant **on this machine**" | Scope statement, now too narrow |
| `social.offtopic` | "I **only look after this machine**" / "I'm **strictly an IT sort**" | Actively declines the new scope. A user asking about the cafeteria menu gets refused by the persona before the KB is ever consulted. |
| `social.howareyou` | "Anything **on this machine** I can help with?" | Same narrowing, softer |

`capability.boundary` is the one line that already survives: *"Anything beyond that list I can't do
myself — but I can look for your company's guidance on it, or hand it to IT."* That is the shape
the rest should move toward.

---

## 2. The copy

Domain-neutral by decision: the greetings say *fix / find / request* and name **no** knowledge
domain. Reasons, in priority order:

1. Whether a given tenant's KB holds HR content is a deployment fact, not a product fact. A greeting
   naming domains is wrong for every customer who didn't load them.
2. It is the same rule `persona.json` already lives under — a greeting that lists features is a
   claim, and claims drift.
3. Pre-recorded audio cannot be templated. One recorded set stays correct through every KB
   expansion, with no re-record.

**Ordered for in-order rotation** (persona rule 4 — `persona.test.mjs` §4 asserts `greeting[0]` then
`greeting[1]`, so position is behaviour, not taste):

```
1  Hi, I'm Matic. What can I help you fix, find, or request today?
2  Matic here. Fix, find, or request — where do you want to start?
3  Hi, I'm Matic. Tell me what you need in your own words.
4  Hey, I'm Matic. What I can handle, I'll handle. What I can't, I'll get to someone who can.
5  Matic here. What's not working, or what do you need?
6  Hi, I'm Matic. Say what's going on, and I'll take it from there.
```

**Line 4 is boot material, not `social.greeting`.** It sets the escalation expectation, which is
worth spending 4.4 seconds on at first contact and is noise on the fifth "hello" of the day.

### Checked against `persona.test.mjs`, by reading the test — not by running it

- **RULE 1 (no capability word).** `capWords` is built from `catalog.json` titles: words ≥3 letters
  not in the STOP list, plus `dns`, `dhcp`, `spooler` added explicitly. None of the six lines
  contains any of those. **Expected pass** — but the rule tightens automatically when a capability
  is added, so re-run rather than trust this paragraph.
- **RULE 2 (no outcome claim).** The `CLAIMS` regexes look for `notified`, `has been told`,
  `\bfixed\b`, `i've sorted|resolved|repaired`, `ticket (has been|is) raised|filed|sent`,
  `it has been contacted|alerted|paged`. The lines use **"fix"**, never **"fixed"** — `\bfixed\b`
  does not match `fix`. **Expected pass.**
- **Shape.** `social.greeting` needs ≥2 lines; six is fine.

**The one judgement call I cannot make for you.** Rule 1's stated spirit is *"a greeting that lists
features is a sales pitch and a claim."* `fix, find, or request` is three modes of interaction, not
three features, and it names nothing from the catalog — which is why I think it is inside the rule.
But it is closer to the line than anything currently in the file, and the person who wrote D165
should agree before it ships. If the answer is no, lines 3, 5 and 6 carry no verb list at all and
can go in alone.

### The claim that is still ahead of the build

Lines **1, 2 and 5** offer to take **requests**, and request intake is not built. Until it is, those
three promise something the assistant will have to decline — the same class of error as the
capability montage cut from the V1 ad, just smaller and spoken.

**Recommendation: ship 3, 4 and 6 now.** None of them says "request". Rotation still has three
lines, the audio for the other three is already rendered and costs nothing to hold, and the rule the
ad work established holds: never advertise a capability that does not exist.

---

## 3. Blast radius — what the scope change touches beyond the greeting

Ordered by how badly it bites if skipped.

1. **`social.offtopic`** — highest priority, and it is not copy-editing. Those two lines are the
   persona's refusal. With the scope widened they refuse things the product now claims. Rewrite so
   the boundary is *"what this company has given me"* rather than *"this machine."*
2. **`classify.js`** — ~~the actual engineering~~ **CHECKED, AND MOSTLY FINE. See §15.1.** This
   item originally warned that a classifier routing "I need a new monitor" to `offtopic` would make
   the new greeting worse than the narrow one. That check has now been run at source: `offtopic` is
   an **allowlist of 13 complete phrases**, not a catch-all, so a request-shaped sentence falls
   through to the KB/proposal path as it should. The warning was overstated and is withdrawn. What
   remains is narrower and is specified as a task in §15.
3. **`role`** and **`social.howareyou`** — narrowing language, straightforward once 1 and 2 are settled.
4. **`capabilityReply()` / `catalog.json`** — D165's generated-not-written rule means "what can you
   do" is machine actions only. Once request intake exists, either the catalog grows a non-machine
   capability kind or the capability answer stays honestly machine-scoped and the *boundary* line
   carries the rest. **Recommend the latter** — do not weaken D165 to make a sentence warmer.
5. **The 3-verb framing is itself a decision** worth a register entry, because it is now load-bearing
   for copy, classifier and catalog at once.

---

## 4. The recorded audio, and the problem nobody has hit yet

Charles wants the greetings **pre-recorded in ElevenLabs** rather than synthesized, so first contact
sounds premium. Six MP3s exist (§6). **This does not drop in.**

`2026-09-02-avatar-bot-piper-verified-handover.md` established how the avatar's mouth works: Piper
1.7.0's `include_alignments=True` yields real per-phoneme sample counts, `synthesize_with_alignment.py`
merges stress/length modifier tokens into the preceding phoneme, and `TTSVisemeDriver` drives the
mouth off that timeline against `audio.currentTime`.

**An ElevenLabs MP3 arrives with no phoneme timeline.** Played as-is, the avatar speaks with its
mouth shut — `resolveViseme` has nothing to resolve. That is a worse first impression than the
Piper voice it was meant to improve on.

Three ways out, in order of how much I'd trust them:

| | Approach | Cost |
|---|---|---|
| **A** | **Bake a timeline per greeting offline** and ship `<name>.mp3` + `<name>.timeline.json` in the existing `[phonemeId, durationMs]` shape. The greeting path loads a prebaked timeline instead of generating one; `TTSVisemeDriver` is untouched. The text is fixed and known, so forced alignment is a solved, one-time, build-time job. | One tool in the build, six JSON files |
| **B** | Run the greeting text through Piper purely for a timeline, play the ElevenLabs audio against it | **Don't.** Different voices, different durations — the mouth desyncs visibly within a sentence |
| **C** | Avatar idle through the greeting | Cheapest, and it undoes the reason for recording at all |

**A is the answer**, and it is genuinely tractable — but note it means the greeting audio pipeline
and the runtime speech pipeline are two different code paths from here on, which is a permanent
maintenance cost that should be taken knowingly rather than discovered later.

---

## 5. The voice seam — a crux decision, not a detail

The greetings are **ElevenLabs "Hazel"** (`voice_id YyqkX0AHv8W5D1vxG9lR`, model
`eleven_turbo_v2_5`). The runtime is **Piper**, `en_US-amy-medium` per `tts-service.js`'s own doc
comment — confirm against `client/config.json`; `MATIC_VOICE_MODEL` overrides it.

**These are two different people.** Matic introduces itself as Hazel and continues as Amy, every
session, forever.

Charles asked whether Piper's settings can be made to match the ElevenLabs voice. **They cannot.**
`length_scale`, `noise_scale`, `noise_w` and `sentence_silence` control how a Piper voice *delivers*
a line — pace, variability, pauses. None of them changes *whose voice it is*. Each Piper voice is a
separately trained ONNX model from its own corpus; there is no inference-time cloning from a
reference sample, and Hazel is proprietary — no weights, no training audio. `[VERIFY]` — asserted
from pre-May-2026 knowledge; confirm against current Piper docs.

**Do not build a Piper voice by training on ElevenLabs output.** Generating a corpus from a paid TTS
service to train a competing local model is what those terms exist to prohibit.
`I do not have a verified source for this.` — nobody in this session read ElevenLabs' current terms.
Legal question, answer before building a dataset, not after.

So the honest options are four:

| | Seam | Offline | Note |
|---|---|---|---|
| **A** ElevenLabs everywhere | None | **Breaks it** | The concession is narrower than it sounds — *voice* could be online-only while reasoning stays local |
| **B** Piper everywhere, greetings pre-rendered from Piper at build time | None | Yes | Amy is the ceiling; kills the premium-intro idea but is consistent and free |
| **C** ElevenLabs greetings + Piper runtime | **Audible every session** | Yes | What the six MP3s implicitly commit to |
| **D** Choose the Piper voice first, re-record greetings in the nearest ElevenLabs voice | Reduced | Yes | Compromise if neither A nor B is acceptable |

This is the build plan's **"offline capability vs. LLM quality"** conflict, which turns out to apply
to TTS as sharply as to the model. **C is currently the default by inaction and is the worst of the
four** — for a product whose pitch is *not having to explain yourself to a stranger*, handing the
user two strangers in the first ten seconds is a real cost.

**Decide §5 before doing §4's work.** If the answer is B, the six MP3s are discarded and the
alignment tooling in §4 is unnecessary — Piper already emits timelines.

---

## 6. Assets, as produced

`C:\Users\Charles\Downloads\MaticDesk_Greetings\` — originals, and `normalized\` (ship these).

| File | Line | Dur |
|---|---|---|
| `matic_greeting_01_rule_of_three.mp3` | 1 | 3.30s |
| `matic_greeting_02_short_three.mp3` | 2 | 3.67s |
| `matic_greeting_03_own_words.mp3` | 3 | 3.02s |
| `matic_greeting_04_escalation.mp3` | 4 | 4.37s |
| `matic_greeting_05_shortest.mp3` | 5 | 2.74s |
| `matic_greeting_06_catch_all.mp3` | 6 | 3.58s |

Normalized to **−16 LUFS**, two-pass `loudnorm` with `linear=true`, TP ceiling −1.5 dBTP, matching
the ad VO master. Measured before: −18.31 to −23.03 LUFS (a 4.7 LU spread, audible across a
rotation). After: −16.26 to −17.12 (0.86 LU). Not zero — `linear` mode caps gain to avoid clipping
and short-clip gating is noisy — but under the ~1 LU audibility threshold. True peaks −1.73 dBTP or
lower throughout; nothing clips. Script kept at `MaticDesk_Greetings\normalize.ps1`.

**Render text ≠ display text.** "Matic" was sent to ElevenLabs as **"Mattick"** to force MAT-ik
(rhymes with *attic*) — `eleven_v3` mispronounced it inconsistently on short lines. The respelling
must never reach a user; `persona.json` carries the real spelling.

---

## 7. Decisions to raise

Numbers unknown — read the register. Five candidates, in the order they must be settled:

1. **Matic is a service desk, not a technical service desk.** Three verbs: fix, find, request. This
   is the load-bearing one; everything below depends on it.
2. **The persona names no knowledge domain.** Scope is stated as verbs, never as a domain list —
   an extension of D165's reasoning from capabilities to KB content.
3. **Runtime voice engine and whether the greeting voice may differ from it** (§5). Crux.
4. **Pre-recorded greetings ship with prebaked viseme timelines** (§4 option A) — only if 3 lands
   on ElevenLabs.
5. **`social.offtopic`'s boundary is the company's knowledge, not the machine** (§3.1).

## 8. Verification register

| # | Item | Status |
|---|---|---|
| 1 | Copy passes `persona.test.mjs` rules 1 and 2 | **Expected pass, unrun.** Read from the test, not executed. Run `npm.cmd test` in `client/` |
| 2 | `classify()`'s handling of a request-shaped sentence | **RESOLVED — not blocking.** `offtopic` is a 13-phrase allowlist; a request falls through to the KB/proposal path. §15.1 |
| 3 | Request intake as a capability | **NOT BUILT.** Lines 1, 2, 5 promise it |
| 4 | Piper cannot adopt an ElevenLabs voice | `[VERIFY]` — pre-May-2026 knowledge, confirm against current Piper docs |
| 5 | ElevenLabs terms on training another TTS on its output | **OPEN.** `I do not have a verified source for this.` Legal |
| 6 | ElevenLabs commercial terms for **shipped product audio** | **OPEN.** Different use from the ad; V3 ad register #7 covered the ad only |
| 7 | Runtime voice model actually configured | **OPEN** — `amy-medium` read from a doc comment; confirm in `client/config.json` |
| 8 | Greeting durations and loudness | **RESOLVED** — ffprobe/loudnorm measured, §6 |
| 9 | "Matic" pronunciation | **RESOLVED** — MAT-ik |
| 10 | Next free D-number | **OPEN** — read `DECISION-REGISTER.md`; do not reuse D226 |
| 11 | Whether `fix/find/request` is inside rule 1's spirit | **OPEN** — founder call, §2 |

## 9. Order of work

1. Settle §5. It decides whether the MP3s ship at all.
2. Check §3.2 — `classify()` on a request sentence. If it returns `offtopic`, stop and fix that first.
3. `social.offtopic`, `role`, `social.howareyou` — the contradictions, before the greetings.
4. Greeting copy into `persona.json`: lines 3 and 6 into `social.greeting`, line 4 into `boot`.
   Hold 1, 2 and 5 until request intake ships.
5. Run `npm.cmd test` in `client/`. Rule 1 tightens with the catalog; do not assume §2's reading.
6. Audio path per §4A — only if §5 said ElevenLabs.

---

*Produced in a Cowork session on wakanda, 2026-09-11. Copy, audio and scope reasoning; no repo code
was changed. The companion project doc has the fuller reasoning behind the copy choices.*

---

# ADDENDUM — 2026-09-11, later the same session

Charles: *"Let's remove the old system and replace with new one. The old system wasn't working
anyway, only one greeting ever played. What we do need is a greeting for special cases like if the
user is not connected to internet or if hub is not connected — so we can either kick off
troubleshooting to get connected, or report limited functionality."*

Both halves are addressed below. The first half has a verified cause and it is **not** a design
failure; the second half is mostly already built and needs wiring, not inventing.

## 10. Why only one greeting ever played — found, and it is two bugs

### Bug 1 — the boot line is hardcoded to index 0

`client/src/renderer/renderer.js:1587`:

```js
await say(persona.boot[0], "idle");
```

`persona.boot[1]` — *"Hello again, it's Matic…"* — has never once been spoken. It is written for a
returning user and that selection was never wired. `pickVariant` is not called here at all.

### Bug 2 — the latent one, and the reason a one-line fix is not enough

`social.js` holds the rotation cursor in a module-level `Map`:

```js
const rotation = new Map();
```

Its own doc comment says *"per-process, so the rotation survives across turns"* — true, and exactly
the problem. **The boot line fires once per process.** Swap line 1587 to
`pickVariant("boot", persona.boot)` and the cursor is still 0 on every launch, so it still always
returns `boot[0]`. The test suite would pass. Production would be unchanged.

**Whatever replaces this must persist the cursor across launches**, or pick at random while
excluding the last one played. Six greetings behind a per-process cursor is still one greeting.

> This is why "the old system wasn't working" should not be read as "the design was wrong." The
> copy design and the rotation helper are sound; `social.greeting` genuinely does rotate within a
> session. It is the boot path specifically that never used either.

**In-session rotation is also worth keeping as-is.** `social.greeting` fires when the user says
hello mid-session, and the in-memory cursor is correct there. Do not replace a working mechanism to
fix a path that never used it — fix the boot path and give it persistent state.

## 11. State-aware greetings — the states already exist, do not invent new ones

Everything needed is in the client already:

| Source | What it gives |
|---|---|
| `client/src/agent/hub-link.js` | `state`: `standalone` \| `checking` \| `reachable` \| `unreachable`. Hysteresis: 3 consecutive failures before declaring unreachable, so a VPN blip does not flip it |
| `probe.online` | whether this machine has a working route at all |
| `client/src/router/offline-guide.js` | `diagnoseOffline(probe)` — the troubleshooting Charles wants to "kick off". Headline, cause, scannable checks, explicit next step. Two rounds of real feedback already shaped it |
| `persona.fallback.hubUnreachable` | the established vocabulary for this state — *"your company's guidance or the service desk"* |

**`standalone` and `unreachable` are different states and must read differently.** Nothing is broken
when no hub is configured; something is broken when one is configured and cannot be reached. The
persona already honours this split (`tickets.unavailable` vs `filing.unreachable`); the greeting
must too, or a correctly-configured standalone install sounds faulty on every launch.

### 11.1 Two traps, both worth deciding before writing code

**Trap 1 — `checking` is the state at boot.** The boot line fires immediately; `hub-link` needs up
to three probe failures before it will say `unreachable`. A state-aware greeting read too early
announces the wrong state — and announcing "I can't reach the service desk" to a user whose service
desk is fine is worse than saying nothing about it. Three options: gate the boot line on the first
probe resolving (delays first contact), speak the neutral greeting and let the standing band carry
the state (safe, and probably right), or speak neutral then follow up only on a transition to
`unreachable`. **Recommend the neutral-then-transition shape.** `probe.online` is the exception —
it is local and known immediately, so the offline greeting can be spoken at boot with confidence.

**Trap 2 — D245. The standing band already says this.** The rail and the standing band report
availability, and D245 forbids the spoken line and the note beside it stating one fact twice. A
degraded greeting that announces the hub is unreachable, sitting directly above a band that says
the same thing, is exactly the defect D245 exists to prevent. **Divide the labour:** the band states
*what is available*; the greeting states *what that means for the user and what to do next*. Same
split D244 already worked out for `fallback.hubUnreachable`. Check `serviceWords`
(`client/src/agent/machine-band.js`) and reuse its vocabulary rather than minting a second way to
say one state.

### 11.2 Copy

Rule-1 safe: the test derives `capWords` from **catalog titles and ids only** — I ran that same
derivation against the live `catalog.json` and it yields exactly **`dhcp, dns, spooler`**.
"network", "connection", "adapter" and "service" are all clear (`connection` appears only in
`plain.helpsWith`, which rule 1 does not scan). Rule 2: no line claims an outcome.

**A. `probe.online === false` — this machine has no route.** The most useful moment the product
has: three of the four capabilities are network faults. Offer, never propose — an unprompted
consent card at boot is D198 exactly.

```
A1  Hi, I'm Matic. This machine isn't reaching the network right now, so I can't look anything
    up or reach the service desk. Want me to start there?
A2  Matic here. This machine has lost its connection to the network — nothing outside it is
    reachable at the moment. Shall I take a look at that first?
```

Hand the user's yes to the existing path: `diagnoseOffline(probe)` when no capability applies, the
normal proposal flow when one does. Write no new troubleshooting text — §10's module already
learned these lessons the hard way.

**B. `probe.online && hubLink.state === "unreachable"` — limited functionality.** Machine fixes
still work; guidance and filing do not.

```
B1  Hi, I'm Matic. I can't reach your company's guidance or the service desk just now, so I'm
    working from this machine alone. Tell me what's going on and I'll do what I can from here.
B2  Matic here. Your company's guidance and the service desk are both out of reach at the
    moment, and I'll keep trying. Anything on this machine itself, though, and I'm good to go.
```

**C. `hubLink.state === "standalone"` — no hub configured. Not a fault, and must not sound like one.**

```
C1  Hi, I'm Matic. There's no service desk connected to this machine, so it's just me and what
    I can see here. Tell me what's not right and I'll see what I can do.
C2  Matic here. This machine isn't connected to a service desk, so I'm working on my own.
    What can I help with?
```

**D. `checking`, or everything healthy — the neutral set from §2.** No state claim.

### 11.3 Precedence

`probe.online === false` wins over every hub state: a machine with no route cannot reach a hub
either, and saying both is saying one fact twice. Check offline first, hub second, neutral last.

## 12. Audio for the degraded states — deliberately not rendered

No ElevenLabs audio exists for A, B or C. That is a decision, not an omission: §5 is unresolved, and
if it lands on "Piper everywhere" every recorded MP3 is discarded. Rendering six more before that
call would be spending on assets that may not ship.

**Note the irony if the ElevenLabs path wins.** The offline greeting is the one that matters most —
it is the product's best moment — and it is the one a network-dependent TTS could never have
produced at the moment it is needed. Both Piper and a pre-rendered MP3 are local, so both work
offline; what does not work offline is any runtime cloud TTS. If §5 is ever decided in favour of
cloud TTS at runtime, the degraded greetings **must** stay pre-rendered local files, or the machine
with no network is the one machine that cannot be greeted.

## 13. Register additions

| # | Item | Status |
|---|---|---|
| 15 | `renderer.js:1587` hardcodes `persona.boot[0]` | **CONFIRMED BUG** — read at source |
| 16 | Rotation cursor is per-process; boot fires once per process | **CONFIRMED** — a `pickVariant` swap alone does not fix bug 15 |
| 17 | `capWords` = `dhcp, dns, spooler` | **VERIFIED** — derivation re-run against live `catalog.json` |
| 18 | Boot-time `hubLink.state` is `checking`, not yet resolved | **OPEN — design.** §11.1 trap 1 |
| 19 | Degraded greeting vs standing band saying one fact twice (D245) | **OPEN — design.** §11.1 trap 2 |
| 20 | `standalone` must not read as a fault | **OPEN** — §11 |
| 21 | Offline greeting must offer, not propose (D198) | **OPEN — safety.** An unprompted consent card at boot is the D198 defect |
| 22 | Degraded-state audio | **NOT RENDERED** — blocked on §5, intentionally |

## 14. Revised order of work

1. **§5 — the voice decision.** Still first; it gates every audio task below.
2. **Fix bug 15 + 16 together.** Persist the boot cursor across launches, or random-with-exclusion.
   A fix that only addresses 15 will look correct and behave identically in production.
3. ~~**§3.2 — `classify()` on a request-shaped sentence.**~~ **Done — §15.1. Not blocking.**
4. **§11.1 — decide the two traps** before writing state-aware selection.
5. **Persona edits**, in this order: **§15's task first** (`social.offtopic` → `role` →
   `social.howareyou`, one commit, copy supplied), then the neutral greeting set, then the
   state-aware sets. §15 goes first because the greeting states the scope and §15 contradicts it.
6. **Wire A/B/C selection** on `probe.online` then `hubLink.state`, precedence per §11.3, handing
   the user's yes to `diagnoseOffline` rather than to new text.
7. `npm.cmd test` in `client/`. Rule 1 tightens whenever the catalog grows — re-derive, don't trust §11.2.
8. Audio path per §4A, only if §5 said ElevenLabs.

*Addendum produced in the same Cowork session. Bugs 15 and 16 were read at source in
`renderer.js` and `social.js`; nothing was executed and no repo code was changed.*

---

# TASK — `social.offtopic` and the scope language

Added at Charles's request, 2026-09-12. Small, contained, and it should land **before** any new
greeting copy — the greeting states the scope and this line contradicts it.

## 15.1 First, the good news: the classifier is already scope-safe

`classify.js:172-177`. `offtopic` is **not** a catch-all. It fires on an allowlist of 13 complete
phrases:

```
whats the weather · what is the weather · the weather like · the weather forecast
tell me a joke · know any jokes · who won the · whats the score · what is the score
what time is it · whats the time · your favourite · your favorite
who is the president · write me a poem · what do you think of
```

The file's own comment explains why they are complete phrases rather than topic nouns: *"the weather
app won't open", "this printer is a joke", "the news site won't load"* — a bare noun would refuse a
real problem.

**Consequence for the widened scope:** "what's the cafeteria menu", "how do I book leave", "I need a
new monitor" hit **none** of these markers. They fall through to the KB/proposal path, which is
exactly right. §3.2's original warning is withdrawn — no classifier change is needed for scope.

## 15.2 The actual defect: the decline is right, the reason given is wrong

These fire only on the 13 phrases above, where declining **is** correct:

```
"That one's outside my lane, I'm afraid — I only look after this machine. But if anything on it
 is misbehaving, I'm your first stop."
"Ha — I'd love to help with that, but I'm strictly an IT sort. Anything wrong with this
 computer, though, and I'm all yours."
```

Under the widened scope both justifications are false. Matic is not *strictly an IT sort* and does
not *only look after this machine*. This is the single moment in the whole product where the user is
explicitly told what the scope is — and it now teaches them a scope narrower than the truth. A user
told "I'm strictly an IT sort" will not come back to ask about leave, and nothing will ever correct
that impression.

## 15.3 Replacement copy

Keeps the two properties the existing lines got right — warmth, and not pretending the question was
unclear (the file's comment: *saying "I did not understand" to a question we understood perfectly is
a small lie that makes the assistant seem stupid*) — and moves the boundary from **the machine** to
**work / what the company has given me.** Names no domain, per §2.

```
O1  That one's outside my lane, I'm afraid — I'm here for work, not the wider world. But
    anything you need from the company or from this machine, I'm your first stop.
O2  Ha — I'd love to, but I stick to what your company's given me to work with. Anything you
    need at work, though, and I'm all yours.
```

**Rule check.** Rule 1: contains none of `dhcp`, `dns`, `spooler` — the complete `capWords` set,
re-derived against the live catalog (§11.2). Rule 2: no outcome claim. Shape: `social.offtopic`
needs ≥2 lines; two supplied.

## 15.4 Same fix, same commit — the other two stale scope statements

| Key | Now | Replace with |
|---|---|---|
| `role` | "the IT support assistant on this machine" | `"the support assistant on this machine"` — drops "IT", keeps the local-agent fact, which is still true and load-bearing |
| `social.howareyou[0]` | "…Anything **on this machine** I can help with?" | "…Anything I can help with?" |
| `social.howareyou[1]` | "…What's going on with **your computer**?" | "…What's going on?" |

`howareyou[2]` ("Can't complain — I've got nothing broken to look at yet…") needs no change; it
claims no scope.

**Do not touch `capability.boundary`.** *"Anything beyond that list I can't do myself — but I can
look for your company's guidance on it, or hand it to IT with everything I've already checked."*
It was already written to the wider shape and is the model the rest should follow.

## 15.5 One thing this task exposes but does not solve

With a KB that may hold anything, "not in the KB" and "not my remit" stop being the same thing. A
cafeteria question on a tenant with no facilities content is **not** off-topic — it is a question
the KB should have answered and did not. Those must not collapse into one reply: the first is a
decline, the second is a **gap record** (D223), which is how the KB learns what it is missing.

The allowlist keeps them apart today, because it declines only 13 phrases and everything else
reaches the KB. That is a happy accident of a narrow allowlist rather than a designed boundary, and
it is worth a register entry before anyone widens the allowlist and quietly starts swallowing real
work questions as off-topic.

## 15.6 Definition of done

1. `persona.json`: `social.offtopic` replaced with O1/O2; `role` and `social.howareyou[0..1]` per §15.4.
2. `npm.cmd test` in `client/` — `persona.test.mjs` green, rules 1 and 2 re-derived not assumed.
3. No change to `classify.js`. If someone thinks one is needed, re-read §15.1 first.
4. Register entry for §15.5's distinction.

**Register additions:** `| 23 | offtopic markers are a 13-phrase allowlist, not a catch-all |
**VERIFIED** — read at source, `classify.js:172` |` and `| 24 | "not in the KB" vs "not my remit"
must not collapse into one reply | **OPEN — design.** §15.5, relates to D223 gap records |`
