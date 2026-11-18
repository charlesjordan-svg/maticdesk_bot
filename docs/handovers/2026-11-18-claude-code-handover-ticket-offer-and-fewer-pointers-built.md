# Claude Code handback — the 00:12 session's log read, the open-ticket process tightened, and she is handed the words

**Date:** 2026-11-18
**From:** a Claude Code session, on Charles's instruction after a live session with
`2026-11-18-claude-code-handover-spoken-turns-built.md` in place: *"check logs in last session. Tighten the open
ticket process. Reduce the times she says it's on the screen beside you. She should be able to read what's on the
screen beside me and summarize"*, and then: *"Nothing happens when she says let me check that for you, or I'll
take a look at that for you.... she says it and just a blank stare."*
**Branch:** `v2-nuance-persona`. Register at **D330** (§5.62r); next free **D331**, and the register's own
next-free line was updated in the same pass.
**Read first:** `CLAUDE.md` (v2 section, the D329/D330 bullet), `PROJECT_START_HERE.md`, register §5.62r.

---

## 1. The log, read — conversation `c0a946c0…`, 2026-11-18 00:12:54–00:16:27 Z, 213 s, eleven turns

`client/audit/app.log` lines 613–777. Every figure is the gap between two client-side log lines in ONE session,
read off the `[spoken]`, `[handoff]` and `[agent]` lines built the same day. **Not a benchmark.**

**What worked.** Five unrecognised sentences (turns 1, 4, 6, 8 and one more) went to the knowledge base behind
the gate: **65–77 ms** each, no model call, declined in silence (D327). The no-sound hint was withheld on every
ten-second pause (D328). Turn 7, a capability question, was relayed and she began speaking 161 ms after the
relay (D311). Turn 9 matched tier-0 in 76 ms, the consent card was approved by voice at turn 10 (D310) and
`flush_dns` ran.

**Where the dead air is** — the brief's §3, answered:

| Turn | What happened | Gap |
|---|---|---|
| 3 (a question) | asked of the knowledge base WITH the model, declined | **11.8 s** |
| 3 | she handed off 9 s in; `propose()` asked the knowledge base AGAIN | **7.7 s** — ~20 s and two model calls for one question |
| 1, 4, 8 | her hand-off opened **4–14 ms after** the silent decline had checked for one, and stayed open | answered 12 s, 23 s, 14 s later — by the NEXT sentence |
| 2, 5, 11 | those next sentences ("yes", 2 words; 1 word; 4 words) were routed as the stale hand-off's work; the hub's model returned no tool call (502) | 1.3–6.1 s, then she pointed at the screen |
| every relay | she began speaking after the relay | **0.16–0.73 s** |

So the "blank stare" is the stale hand-off: she says she will look into it, the sentence she means was already
declined in silence a few milliseconds earlier, and nothing is looking until the next thing he says — which is
then routed as if it were the problem.

**The offer nothing was waiting for.** Turn 3's decline was relayed in the hub's own words — *"I can raise a
ticket for someone in IT to pick up, if you'd like"* — and turn 4 (one word, presumably yes) was not an answer
to anything: a knowledge-base decline armed no intake, on either path. It went to the knowledge base as an
unrecognised sentence and was declined in silence.

**She pointed at the screen four times:** three hub errors (an untagged `say()`, so the default pointer) and the
executed change (`@execution`, pinned).

## 2. The open-ticket process, tightened — D329, proposed

1. **A knowledge-base decline arms the offer it makes.** `agent.js` `propose()`, question branch: on
   `answered: false`, when this build can file, `intake.offer()` is called with the question as the description,
   a third-person case note saying the written guidance did not cover it, category `needs_human_judgement`, no
   owner; the result carries `answer.offered` and `canFile`. The typed path attaches the same Yes / No thanks
   buttons the escalation offer gets. **"Yes" now opens the draft.** Headless test: `turn-routing.test.mjs` §11
   runs a real `Agent` with a stub hub that declines, says "yes", and gets a draft.
2. **A late hand-off is answered with the sentence it was for.** `persona-ui.js` remembers the last sentence it
   left unrouted (hers, or declined in silence) for 30 s; `persona-stage.js` reports a client hand-off
   (`onHandOff`); with nothing in flight the sentence is re-queued marked `handedOff` and routed outright,
   logged `[spoken] … route=route outcome=handoff`. A routed turn clears the memory. **Cost, named:** `submit()`
   shows that sentence on the panel a second time, beside the answer it now gets.
3. **The knowledge base is asked once.** `askKnowledge()` keeps the hub's answer for 120 s
   (`Agent.ASKED_REUSE_MS`); `propose()` reuses it for the same sentence. A gated decline is never kept, because
   `propose()` does not gate. Test: the stub hub is called once for ask-then-propose, again for a different
   sentence, again after the window.

Also: `res.fallback` names which fallback line the agent chose, so the renderer can tag it (§3).

## 3. Fewer pointers — D330, the founder's

She cannot see the panel. "Read what's on the screen" is being handed its exact words, with the guard that she
adds nothing and changes no claim — the relay D308/D309 built. What was pinned is relayed now:

| Surface | Was | Now |
|---|---|---|
| `fallback.hubUnreachable`, `fallback.hubNoAnswer` | pointer (and the `say()` was untagged, so the plainest one) | the exact line, tagged from `res.fallback` |
| `filing.noDestination` / `badDraft` / `unreachable` / `refused` | pointer | the exact line (`filing.timeout` stays silent) |
| `social.offtopic` | pointer | the exact scope statement |
| `@execution` | pointer | the broker's plain-words report (D250), with the guard |
| `@draft` | pointer ("the ticket is on the screen beside you…") | **a summary the renderer builds** (`draftSpoken()`): the user's own words, the category in the card's plain words, who it goes to or "let IT route it", "it stays on this PC until you submit it — press submit, or say 'submit the ticket'" |
| `@consent`, `@consentVoice` | pointer, spoken BEFORE the card was rendered, beside the model's reasoning | **the card's own catalog words**, spoken AFTER `prepareConsent()`: `detailPlain` (D248's gloss) or `what`, the notice, and how to approve — the voice phrase only when voice is allowed (D310). Never the model's reasoning. The floor is still held while they read. |
| three untagged `say()` sites | the plainest pointer | tagged `@refused`, `@consentRefused`, `@consentDeclined`, relayed |

The pointers remain for an answer too long for one note and for an unknown surface. **The prompt is unchanged**,
so no new Nuance setup review. D301-D stands: no load-bearing string is hers to compose; every relayed line is
ours character for character and is also on the panel.

**What is given up:** the spoken consent line no longer carries the model's *"I think this is the fix — have a
look at what it would do"*; that sentence is on the card, labelled as the model's. The local Piper voice says
the catalog line too, so the two channels agree.

## 4. Not fixed, and why

- **The hub's model answering a short sentence with no tool call** (HTTP 502, three times). Those sentences
  reached it only through the stale hand-offs §2.2 fixes; `/v1/turn`'s own handling of a non-tool answer is
  unchanged.
- **7.7–11.8 s per knowledge-base question** on this machine's hub, one model call, with nothing telling her
  or him it is still working. §5.62n recorded the same forty-second silence on 2026-11-17. A "still looking"
  line while the floor is held is a decision not taken here.
- The social-marker finding from the previous handback (§7 there) still stands.

## 5. Needs Charles

One live session, then `client\audit\app.log`:
- after a sentence she hands off, a line `she handed off the sentence she had been left to answer … routed as
  her hand-off's result (D329)` and a `[spoken] … outcome=handoff` — that is the blank stare, answered;
- after a declined question, does "yes" open the draft? (`[ticket]` lines, then the draft card);
- is the consent line she speaks the card's words, and does the floor still hold while you read?
- count the pointers: `grep -c "pinned/pointer" client\audit\app.log` before and after.

## 6. Honesty ledger

- **Nothing seen live.** D329 and D330 are unit-tested (client 33/33 files) and unwatched. The server suite was
  not re-run: no server file changed this pass.
- **The figures in §1 are log-line gaps from one session**, read by hand; they are not latencies of anything in
  isolation and must not be quoted as such.
- **Turn 4 "presumably yes"** is an inference from its length (1 word) and position; the transcript was not read
  (the key is not in the repo; `server/bin/transcript.mjs` exists now and was not run).
- **The second showing of a re-routed sentence on the panel** is a known cost, not fixed.
- **`draftSpoken()` and `consentSpoken()` are source-pinned, not rendered:** no headless test can see the panel
  or hear the line.

## 7. Verification register

| Claim | How known |
|---|---|
| Eleven turns; the per-turn gaps in §1 | **Read 2026-11-18** — `client/audit/app.log` lines 613–777 |
| Three hand-offs opened 4–14 ms after the silent decline's check | **Read** — the `[spoken] … outcome=declined` line and the `[handoff] opened` line that follows it, same second |
| Turn 3 asked the knowledge base twice, 11.8 s then 7.7 s | **Read** — `[agent] askKnowledge answered in 11821 ms`, `[agent] propose answered in 7691 ms` |
| A decline armed no offer | **Read** — turn 4 `route=ask` with no `awaiting`; and `agent.js` had no `intake.offer()` on the question branch |
| D329 (a), (c): behaviour | **Run 2026-11-18** — `turn-routing.test.mjs` §11 against a real `Agent` and `TicketIntake` with a stub hub |
| D329 (b): the late hand-off | **Source-pinned only.** Not seen live |
| D330: every relayed surface, the hold on a relayed consent card, the spoken lines' content | **Run** — `surface-split.test.mjs`, `voice-consent.test.mjs` §3, `turn-routing.test.mjs` §12 (source pins for the renderer) |
| What turn 4 said | **Not known** — one word; the transcript was not read |
| Whether she still answers after the held floor is released | **Not known** — `[VERIFY]` from D325 |
