# Handover — the panel click-through was run in Electron, and it found six things

**From:** Claude Code session, 2026-09-11
**Decision:** **D254**, register [`docs/decisions/DECISION-REGISTER.md`](../decisions/DECISION-REGISTER.md) §5.37
**Runs:** [`client/docs/PANEL-RENDERER-CHECK.md`](../../client/docs/PANEL-RENDERER-CHECK.md), unrun since it was written and unrun against three deliveries
**Charles:** *"now do the electron click-through"*

---

## 1. What was actually run, and how

The real app: `MATIC_PROVIDER=hub` Electron, the **real in-process broker**, the **real Win32
probe**, and a **real hub** on `mistral-small:24b` with the six-article corpus embedded and hybrid
retrieval live. Not `panel-check.html` — everything behind that page's bridge is canned.

It was driven over the **Chrome DevTools Protocol** (`electron . --remote-debugging-port=9223`),
which gives both hands and eyes: expressions evaluated in the real renderer, and
`Page.captureScreenshot` for PNGs of the actual window. Ten screenshots were taken and looked at.

**Unelevated**, deliberately — that is the branch nobody had rendered.

## 2. Six findings. Two are fixed.

### F1 — FIXED. The degraded reply named only the service desk

`persona.fallback.hubUnreachable` — the reply a **question** gets while the hub is away — said *"I
can't reach the service desk just now"*, directly under a rail and a standing band that both say
*"your company's guidance **or** the service desk"*.

This is D244/§5.29a's exact finding, in a string that sweep did not reach. And it is the worst
string to miss it in: **the question that lands on this line is very often precisely the kind the
GUIDANCE would have answered.** The user is told the one thing they did not need to know and not the
one they did. Found by asking *"what is the policy for requesting a second monitor"* with the hub
down.

### F2 — FIXED. The loss note named two things and the recovery note named one

`renderer.js` announced *"I've lost my connection to your company's guidance and the service desk"*
and then, on recovery, *"The service desk is reachable again."* — so a user watched two things go
and one come back.

The comment directly above the loss branch documents §5.29a's fix and says the line must name *"the
same two things the other two surfaces name"*. **The branch six lines below it was never given the
same treatment.**

**Both now say both**, and there is a new enumerated assertion covering *every* string that
describes the connection state — with the exclusions stated as decisions rather than left implied
(`persona.filing.*` and `fallback.hubNoAnswer` name only the service desk, correctly: those describe
an **action** against the service desk, not the state of the connection). **Three mutations probed,
all three caught**, including reintroducing each defect verbatim.

### F3 — REPORTED. The hub's answers contain markdown and the panel shows the markup

A real KB answer rendered as:

> The keyboard shortcut to redo something in Windows is \`Ctrl + Y\`. Some applications also accept \`Ctrl + Shift + Z\`.

with the backticks **visible on screen**. The renderer is right not to fix this itself — D130 forbids
`innerHTML` and the whole consent-surface argument rests on it. So this is a choice between
constraining the hub's answer prose and a decided, narrow renderer transform. **It needs a decision,
so it is not fixed here.**

### F4 — REPORTED. The citation shows a slug, in a mostly-empty 93px band

The citation block renders `From your company's IT guidance` and then, after a large vertical gap,
`keyboard-shortcuts-windows` — the article's **id**, right-aligned. A user gets a filename where a
document name belongs.

**The renderer cannot do better on today's contract:** `/v1/ask` returns `citedArticleIds` and no
title. Fixing it properly means the hub returning something human, which is a hub-side change.

### F5 — OBSERVATION. The model's reasoning is rendered twice, identically

`proposal.reasoning` appears as the spoken reply in the transcript **and**, byte-identical, on the
consent card under "Why this, here". Weakened by the card's copy sitting inside a collapsed
`<details>`, so a user only meets it if they expand — where they read a sentence they read three
lines earlier. Not fixed; recorded.

### F6 — OBSERVATION. D250 cleaned the report; the model's proposal still names the mechanism

The spoken proposal was *"…this is most likely stale DNS. I can flush the resolver cache."* — one
line above a card whose own words are *"Empties this machine's memory of recent website-name
lookups."* D250 is scoped to what an **executor reports**, and it holds: the report said *"Emptied
this machine's memory of recent website lookups."* But the user hears "resolver cache" anyway, from
the model. That is hub prose (H5, D234) and rewriting it in the renderer is not available.

## 3. One thing observed that I cannot explain, flagged rather than diagnosed

*"what is the keyboard shortcut to redo something in windows?"* asked **through the app** was
answered from the corpus and cited `keyboard-shortcuts-windows`. The same sentence posted directly
to `POST /v1/ask` **declined** — `answered: false`, and that article was not among the four
retrieved. The app may well send different text; I did not establish that it does. **Recorded as an
open question with the evidence, not as a finding.**

## 4. What passed, on the real thing

| | |
|---|---|
| **D240** | No state name, no voice pill, no facts table, no scene switcher in the rail. The inspector is `display:none` behind `data-inspector="off"` |
| **D252** | The window fills the frame, no stage padding or shadow. Band glyphs are SVG, the inspector's control reads "What I did". **The chevron rotates 180° and `aria-expanded` is `true`/`false` on the right triggers** — the defect found by clicking on 2026-09-10, now confirmed fixed on the real window |
| **D252 §7** | The review card's editable fields render in the panel's own face, at its size, and "what's wrong" is multi-line. The monospace-textarea defect is gone in Electron |
| **D253** | On the real hub: `Nothing has left this machine` → **`Sending…`** → `Sent by you`, reference **MD-1008**, band count 2→3. **With the hub stopped mid-card: → `Not sent`**, spoken *"I couldn't reach the service desk just now"*, note *"Nothing was filed."*, count unchanged |
| **D246** | That same failure put `POST http://127.0.0.1:8787/v1/ticket failed: fetch failed` on `detail` in the inspector and the developer log, and **nothing with a URL reached the surface or the voice** |
| **D247** | `restart_service` unelevated: *"I couldn't do that one from here."* with `OpenServiceW(spooler, STOP|START) failed (Win32 error 5)` on `detail` only |
| **D250** | `flush_dns` ran **for real** and reported *"Emptied this machine's memory of recent website lookups."* — the catalog's words, not Microsoft's |
| **D249** | The "where's my ticket?" reply carried this machine's real name and real address **on screen**, and the app's own log then printed `[tts] this machine's name, account or address is shown, not spoken (D249)`. **The mechanism is proved end to end in the product for the first time** |
| **D244/D245** | The review card's caveat, the glossed `CATEGORY`/`GOES TO` with raw values under them, the folded identity row with D215's self-asserted hint, and the post-send note carrying the reference and nothing the card already said |
| **D242/D235** | The band lists MD-1008/1007/1006 with "FILED FROM HERE / Progress not visible"; **the failed filing is correctly absent**; and the spoken "where's my ticket?" answer names the same three references in the same vocabulary |
| **D51/D49** | `reachable → unreachable` after exactly three failures, the standing band, the rail, and both transition notes. Recovery cleared all of it |
| **D243** | Dark theme survived a full quit and relaunch, and the avatar's field knocks out with it |
| **close** | No uncaught-exception dialog on quit |

Dark-mode contrast was measured on the live elements rather than eyeballed: the lowest is **7.61:1**.

## 5. Three things a session cannot do, and they are Charles's

1. **Anything HEARD.** The redaction was proved to fire at the voice boundary and every string was
   read, but **nobody has listened.** §3a.
2. **The first frame.** `main.js` is right (`show: false`, `ready-to-show`, an opaque
   `backgroundColor`) and a screenshot cannot catch a frame that is not meant to exist. §1.1.
3. **The todo card.** It comes from `diagnoseOffline(probe)`, so it needs this machine **genuinely
   offline**. I would not disconnect your network to see a card. It has still only been seen against
   canned data. §4.

Also not run: the **elevated** success path of `restart_service`, which needs an Administrator
window.

## 6. Honesty ledger

- **`npm.cmd test`: 17/17 files, 1158 assertions, 0 failed** (up from 1144). `panel:check` clean.
- **Three times in this session a bad selector nearly produced a false finding** and was caught by
  checking instead of reporting: `.inspector:not([hidden])` said the inspector was open when it is
  hidden by `display:none`; `innerText` on a collapsed `<details>` returned `""` and made two
  identical strings look different; and `.band` returned the wrong one of two. A fourth was my own
  eye — I read blue text in a screenshot of the caveat and the computed colours are all near-black.
  **§10.5's class, four times, none of it in the product.**
- **This run filed four real tickets** into the `devco` dev tenant (MD-1006 predates it): MD-1007
  through MD-1009 plus one deliberate failure that filed nothing. MD-1009's text deliberately
  contains this machine's name and address — it exists to prove the D249 redaction and can be
  deleted.
- The contrast figures are **arithmetic over rendered colours**, not measurements, and do not join
  register §10.3's four measured numbers.
- **D242 and D248 both remain PROPOSED and await Charles.** Neither was touched.
