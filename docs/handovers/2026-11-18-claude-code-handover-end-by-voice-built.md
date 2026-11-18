# Claude Code handback — the 00:32 session's log read: she can end the session now, and a hung hub cannot hold the conversation

**Date:** 2026-11-18
**From:** a Claude Code session, on Charles's instruction after a live session with
`2026-11-18-claude-code-handover-ticket-offer-and-fewer-pointers-built.md` in place: *"I just ran a test. A little
better. Check logs. She seems not to have the ability to close the session. I tried several times and she
wouldnt end it.."*
**Branch:** `v2-nuance-persona`. Register at **D332** (§5.62s); next free **D333**, and the register's own
next-free line was updated in the same pass.
**Read first:** `CLAUDE.md` (v2 section, the D331/D332 bullet), register §5.62s.

---

## 1. The log, read — conversation `5fb05ace…`, 2026-11-18 00:32:44–00:36:39 Z, 235 s, 25 turns

`client/audit/app.log` lines 936–1031. Figures are gaps between client-side log lines in one session.

**What worked.** D329's late-hand-off fix fired twice and did what it was built for: turns 1 and 3 were declined
in silence, she handed each off, each was re-routed as the hand-off's result (`[spoken] … outcome=handoff`), and
turn 1 came back as an escalation in 2.8 s with the offer relayed in her own words. The gate held (65–80 ms, no
model call). The no-sound hint was withheld on every pause.

**Then the hub stopped answering.** Turn 3 was submitted to Matic at 00:33:13 and no `propose answered` line
ever followed. From 00:33:37 the hub's health probe timed out at 5 s, three times. The session before this one
(`9de33179`, 537 s, 00:18–00:27) ends with `propose answered in 300 054 ms` — the hub's own 300-second ceiling —
and two turns decided 75 and 88 s after they ended. **Every spoken turn waits for the one before (D312), so turns
4 to 25 — twenty-two sentences, several of them you asking her to end it — waited behind turn 3 and nothing
happened.** That is "she wouldn't end it": nothing could, because nothing after turn 3 was being looked at.

**Read now, after the session:** the hub answers `/v1/health` in 41 ms; Ollama holds `mistral-small:24b` (19 GB)
and the embedder (689 MB) on a 23 028 MiB card with **22 443 MiB in use**. The model is loaded at a 32 768-token
context. That leaves about 600 MiB, which is the thrash cliff this project has met before (§5.22a): a long prompt
pages and a turn takes minutes. `[VERIFY]`: that this is what the 300-second turn was. `/v1/health` embeds one
string through Ollama by design, so it queues behind the paging generation and the hub-link reports a busy hub as
unreachable.

**Also seen:** the camera failed to start (*"Could not start video source"*) and recovered when you clicked the
button off and on; `end_call` is on in the mint, so she COULD end a session herself — and did not, in 25 turns.

## 2. Built — D331, proposed: a spoken request to end the session ends it

`client/src/nuance/session-end.js`, pure: `wantsToEnd(text)` is true for

- the classifier's own `social.farewell` — "goodbye", "bye", "see you", "nothing else" and the rest of
  persona.json's vocabulary, as a whole sentence;
- a verb on the session: end / close / stop / finish / exit / quit / leave / turn off / hang up — with the video,
  session, call, chat or conversation as its object ("end the session", "stop the video", "close this chat");
- a short frozen list: "I'm done", "we're done", "that's all (for now)", "hang up", "end it", "that'll be all".

**Bare "stop" is not one.** It is an ACTION_VERB and "stop the spooler" is work. "I'm done with this printer" is a
complaint; "I'm done" is a goodbye.

persona-ui checks it on the user's finished turn **before the queue and before a consent card's own listener**. It
writes `[spoken] kind=end route=end outcome=end`, waits up to 6 s for her goodbye (she heard the sentence and
answers small talk herself), then calls the same `stop("user")` the button does. The built-in face and voice come
back (Decision C).

## 3. Built — D332, proposed: a hung hub cannot hold the conversation

A routed spoken turn holds the spoken queue for at most 20 s (`ROUTED_WAIT_MS` in persona-ui). The submit itself
goes on: its answer is still relayed as her hand-off's result when it comes, and the spoken-turn flag clears when
the submit finishes, not when the queue stops waiting. Later sentences are taken meanwhile and a line says so.
The hub's own 300-second ceiling is unchanged.

**Tests:** `client/test/turn-routing.test.mjs` §13 — 15 sentences that end, 12 that do not, and the wiring
pinned (the check runs ahead of the queue; the ceiling; the flag). Client **33/33 files**.

## 4. Not fixed, and whose

1. **The hub.** A 300-second turn and a health probe that cannot answer in 5 s are the environment. Two things
   are yours to decide, neither built here:
   - run the model with a smaller context — 32 768 tokens on a 23 GB card with the 24b is the cliff; 8 192 would
     leave room. The number comes from the mint/launcher, so it is a config change, not code;
   - give `/v1/health`'s live embed a timeout, so a busy hub is reported as busy rather than unreachable.
2. **`end_call`.** She holds the tool and did not use it. Whether her prompt's "hand everything over" rule is why is
   `[VERIFY]` against the transcript (`node bin\transcript.mjs 5fb05ace-7ff4-4f47-8dc7-b2adc4cd5871 --key-file …`
   from `server\`). D331 does not depend on it.
3. **The camera's first failure to start.** Recovered by the button; cause not known.

## 5. Needs Charles

- **Read `nvidia-smi` before the next session**, and consider the context size (§4.1). With the card this full the
  hub will do this again whatever the client does.
- One live session, then `client\audit\app.log`: say "end the session" or "goodbye" and look for
  `[spoken] kind=end` followed by `session over (user)`. If a routed turn takes long, look for
  `has been with Matic for 20 s - later spoken turns are taken meanwhile`.

## 6. Honesty ledger

- **Nothing seen live.** D331 and D332 are unit-tested and unwatched.
- **The figures in §1 are log-line gaps from one session**, not latencies of anything in isolation.
- **"The model was paging" is an inference** from 22 443 of 23 028 MiB in use, the 32k context and the project's
  earlier measurement (§5.22a); it was not watched happening.
- **Which of turns 4–25 were "end the session"** is an inference from their lengths and your words; the transcript
  was not read.
- `git diff` and `git status` were read before the commit.

## 7. Verification register

| Claim | How known |
|---|---|
| D329's hand-off fix fired twice and routed the right sentence | **Read** — `[spoken] … outcome=handoff turn=1` and `turn=3`, each 1–2 ms after `[handoff] opened` |
| Turn 3 never got an answer in the session; 22 turns followed with no `[spoken]` line | **Read** — lines 962–1030 |
| A 300 054 ms `propose` in the session before | **Read** — line 907 |
| Health probes timing out at 5 s during the session | **Read** — three `[hub-link] probe failed` lines |
| The hub is healthy now; GPU memory 22 443 / 23 028 MiB; the 24b at a 32k context | **Run 2026-11-18** — `curl /v1/health`, `ollama ps`, `nvidia-smi` |
| Why the hub hung | **Inference**, `[VERIFY]` |
| `wantsToEnd()` on 27 sentences; the wiring | **Run** — `turn-routing.test.mjs` §13 |
| That she ends on "end the session" live, and how long her goodbye takes | **Not known** |
