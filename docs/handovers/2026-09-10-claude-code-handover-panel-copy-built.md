# Claude Code handover — panel copy and vocabulary, BUILT

**Answers** [`2026-09-10-claude-code-handover-panel-copy.md`](2026-09-10-claude-code-handover-panel-copy.md).
**Repo:** `C:\Users\Charles\Downloads\maticdesk_bot`, `main`, one commit on top of `63011a4`.
**Register:** §5.29, **D244–D245**. **Design items:**
[`2026-09-10-claude-design-handover-panel-copy-followups.md`](2026-09-10-claude-design-handover-panel-copy-followups.md).

**Client tests: 923 assertions across 16 files, all green** (was 869 / 16 — the floor the handover
set). `npm.cmd run panel:check` clean.

**Two of the handover's four observations were already answered in the code**, which its own honesty
ledger predicted (*"If the code contradicts an observation, the code wins"*). One of those two still
needed work, in a way the screenshot could not have shown. Details in §1c and §1d below.

---

## 1. The four items

### 1a. `needs_human_judgement` — glossed, not hidden (D244)

**Done as asked.** `CATEGORY` now reads **"needs a person"**, with `needs_human_judgement` under it,
smaller and at the colour every other fixed row uses. Hiding the field was not on the table: the card
is the payload view, D128 requires the user to see what is being sent, and a field they are approving
cannot be the one that disappears.

**Checked every other enum that can reach the card, as asked.** There are exactly two: `category` and
`suggestedOwner`. Both are glossed now and both show the stored value.

**`GOES TO` looked right and was wrong underneath.** It was
`draft.suggestedOwner.replace(/_/g, " ")` — which produces correct English for all five of today's
owners **by coincidence**, and mis-renders the first one that is an acronym (`it_security` → "it
security"). It is a table now. The words on screen are unchanged, because the handover called that
shape right; what changed is that they are a decision rather than a transform, and the stored value
is visible beside them.

**The table is `ESCALATION_PLAIN` in `renderer.js`; the enums in `src/agent/prompt.js` stay the
authority.** `test/panel.test.mjs` imports `ESCALATION_CATEGORIES` and `ESCALATION_OWNERS` from that
file and fails on a member with no plain words, on a "gloss" that still contains an underscore, and
on **any** snake_case token in a string the renderer writes at the user. A new category cannot reach
the card as itself without a test failing first.

**It is deliberately NOT `ESCALATION_OWNER_LABELS`.** That table is the SPOKEN form and carries the
article the avatar needs ("the identity team"); a label column does not want it. The two are now
adjacent in purpose and the comment on each says which is which, because confusing them is the
obvious next mistake.

**One judgement call worth flagging.** Subordination is bought by **darkening the gloss** to
`--matic-ui-ink`, not by fading the raw value. §3c below says the label column beside it may already
fail contrast; answering a copy defect by adding a second instance of a suspected accessibility one
is not a trade worth making.

### 1b. The same fact twice — once, on the card (D245)

**Done as asked.** The card's caveat is unchanged and is now the only place the fact is stated. The
post-send line reads:

> Stored as MD-1007. The card above says what that does and does not do.

The reference, and a pointer, and nothing the card already said.

**The card is in the transcript**, which is what makes this safe: D213 names the review card and the
transcript as two of its five surfaces and the card satisfies both, because it stays on screen after
it is answered — which is the whole premise of the defect. **Nothing was deleted from the card.**

Both halves are pinned: the test requires the card's caveat to contain the fact, and requires the
post-send note **not** to mention email, notification or alerting.

### 1c. "Nothing running" — reworded (app-side copy)

**Done.** It reads **"Nothing in progress"**. A task is what is "in progress"; a service is not, so it
cannot be read as a claim about the band of services a few centimetres away.

**The other two sub-lines were left alone** — "Some help unavailable" and "This machine only" describe
capability rather than activity and neither is ambiguous.

**One consequence to know:** the delivery's own word is "Nothing running", so **the app and the
delivery now differ in one string.** That is recorded in the design follow-ups file §3, in
`matic-panel.app.css` §d item 3, and at the line in `index.html`.

### 1d. The hub state — the observation was wrong, and the wording was still not right

**A transition into `unreachable` has produced a transcript note since D240**, and a standing band
sits under the utility bar; the corner indicator was never the only surface. So the observation was
wrong, exactly as the handover's ledger allowed for.

**But "make the two agree" was the real instruction, and they did not.** Checked against `agent.js`
— which answers in that condition from `persona.fallback.hubUnreachable` — the transcript note
disagreed in two ways:

1. **It named only *the service desk*.** The band, the rail and the persona line all name **the
   company's guidance AND the service desk**, which is what is actually lost.
2. **It said *"questions and tickets will wait until it's back"*, and nothing is queued.**
   `HubClient.fileTicket()` returns "nothing was sent" immediately; a question gets the fallback
   reply, not a place in a line. **A user who read "will wait" and stopped re-asking had been told
   something untrue by inference** — which is the harder half of this to notice, because no sentence
   is false on its own.

It now reads:

> I've lost my connection to your company's guidance and the service desk. I can still check and fix
> things on this machine itself; I can't look anything up or file a ticket until it's back.

Says what it cannot do, names both halves, does not apologise, names no internals. Three tests pin
those properties rather than the phrasing.

**On acceptance item 4's wording** — "matching `agent.js`'s wording exactly": `agent.js`'s sentence
is a **reply to a request** ("what you described isn't something I can fix…") and it opens with "I'm
sorry", which §1d itself forbids for the transition. An exact copy is not available and would be
wrong. **They agree on the facts and on the vocabulary, which is what the acceptance is for.** If
that reading is wrong, say so and it changes in one line.

---

## 2. Acceptance

| # | Item | |
|---|---|---|
| 1 | No snake_case enum on the end-user surface; the raw value visible on the card, subordinate to a gloss | **Pass.** Both card enums; a test over every string the renderer writes at the user |
| 2 | The no-email fact appears once per exchange, in one wording, on the card | **Pass.** Tested from both directions |
| 3 | The idle status cannot be read as a claim about services | **Pass.** "Nothing in progress" |
| 4 | Entering unreachable produces one message in the conversation, matching `agent.js` | **Pass on the facts and the vocabulary; not verbatim, and §1d says why** |
| 5 | `npm.cmd test` green, 869 / 16 as the floor | **Pass. 923 / 16** |
| 6 | One commit, named files | **Pass** |
| 7 | Charles clicks it through | **Not done — yours.** `client/docs/PANEL-RENDERER-CHECK.md`, updated with 6.2, 6.4, 6.5, 7.1a and 8.2a for exactly these changes |

---

## 3. Design items — recorded, not fixed (handover §3)

All four are in
[`2026-09-10-claude-design-handover-panel-copy-followups.md`](2026-09-10-claude-design-handover-panel-copy-followups.md),
which also carries `63011a4`'s two deviations forward. **Nothing in §3 was restyled in the app.**
Two of the four are **answered** there rather than left as impressions:

- **3a — the square is NOT a checkbox.** Both triggers are `<button>`; `.glyph-machine` and
  `.glyph-ticket` are decorative `<span>`s with a 1px border. A screen reader announces a button, so
  the accessibility defect that was feared does not exist. The visual ambiguity is real and is
  Design's. **A different, real accessibility gap was found beside it and fixed here, because it is
  ours:** neither trigger carried `aria-expanded`, so the open state was drawn and not announced.
- **3c — 3.53:1 in light, 4.65:1 in dark.** `--matic-ui-ink-quiet` on `--matic-ui-surface`, against
  AA's 4.5:1 for normal text; 11px uppercase is not "large". So the observation was right, and right
  only for light. **This is arithmetic over two declared hex values and is not a measurement** — it
  does not join register §10.3's four numbers.
- **3b — mono for prose** is carried as the question it was asked as, with the argument the other way
  stated: mono signals *verbatim*, which is what D128/D130 want of a payload view. Design decides.
- **3d — the `+`** has `aria-label` and `title` both reading "Show what I proposed, checked and did",
  so it is unlabelled **visually** rather than to a screen reader. The glyph is a crosshair and reads
  as "add", which is the opposite of what it does.

---

## 4. Found by clicking, not by reading

### 4a. The disclosure chevron never rotated — fixed here, and it is ours

The delivery rotates the chevron when a band is open, keyed on `data-set` — the harness's markup
hook, which D240 removed from `index.html` because it belongs to the scene switcher. `63011a4`
re-keyed the open trigger's **wash** onto `data-band-key` and **missed the chevron**, so a band opened
and its only state indicator stayed inert. Restored on the app's own attribute; both halves pinned by
a test. **Not a design change and nothing for a delivery to carry.**

### 4b. Two fixture defects in the check page

- The canned escalation carried **`category: "account"`, which is not a member of
  `ESCALATION_CATEGORIES` at all** — a fixture proving the panel handles a shape nothing can send it.
- The draft that followed a **mailbox-migration** offer described a **docking station**. The one card
  in the app through which user data leaves the machine was demonstrating a payload that did not
  match the conversation three lines above it.

Both now read `needs_human_judgement` and the mailbox scenario — which also makes the check page
exercise the longest enum, the one that shipped the defect.

### 4c. A trap worth recording — it wore the right shape (§10.5's class, again)

§4a was first "confirmed" by reading `getComputedStyle(el).transform` on an element inside the check
page's iframe — **from the parent frame's `window`**, which returns defaults rather than the child's
computed style, and **with the Browser pane hidden**, which freezes an in-flight CSS transition. It
reported an identity matrix in every state, which is exactly what a broken rotation looks like.

**The defect was real and the evidence for it was not.** What settled it was a check that does not
depend on rendering at all: enumerate `document.styleSheets` and ask `el.matches(rule.selectorText)`
in each band state — zero matching rules before the fix, exactly one after. In `CLAUDE.md`'s traps
list now.

---

## 5. Honesty ledger

- **Nobody has watched any of this in Electron.** Everything here was driven through
  `panel-check.html` — the real renderer, a fake bridge — where the probe, the broker, the hub, the
  model and the voice are all canned. `client/docs/PANEL-RENDERER-CHECK.md` is acceptance item 7 and
  it is Charles's.
- **§1d changed a sentence nobody has seen fail.** The "will wait" claim is wrong by inference from
  reading `HubClient.fileTicket()` and the `/v1/ask` path; **no user has been observed misled by it**
  and no hub was stopped under a real session to watch the new line land. The check page's canned
  transition is what was driven.
- **§3c's ratios are computed, not audited.** Two hex values through the WCAG 2.1 formula. No audit
  tool has been run over the panel and no other accessibility question has been asked at all — focus
  order, keyboard traps, reduced motion, the avatar's role in the tree. One contrast column is listed
  because one contrast column was noticed.
- **The gloss wording is a judgement call and is mine.** "needs a person", "a hardware fault",
  "something is down elsewhere", "an account or a licence", "something physical", "something else".
  Nobody has been asked whether those are the right words for an office worker; the test enforces
  that each member HAS words, not that they are good ones.
- **One thing seen and deliberately left, because it is out of this pass's scope.**
  `HubClient.fileTicket()`'s failure string is spoken to the user and says *"Could not reach the hub
  at http://…"* — **"the hub" is our word and the URL is an internal**, on the same end-user surface
  D240 cleared. It is not snake_case so acceptance item 1 does not catch it, and it is agent-side
  prose rather than panel copy. **It is a defect of the same family and it is unfixed.**
- **§4a's fix is in `matic-panel.app.css`**, which the rule says is for app glue and not for design.
  The argument for it being glue is in the comment at the rule: the delivery's intent is unchanged
  and only the attribute it keys off differs, because the app removed a developer control. If that
  reads as a design change it should come out and go into the delivery instead.
- **`.claude/launch.json` is NOT in this commit, and it was damaged and restored during it.** It is
  another session's file, it was untracked, and it was overwritten while setting up a check-page
  server here. Both of its entries are restored verbatim and a third on a free port is added. It
  stays untracked deliberately: every path in it is an absolute `C:UsersCharles…`, which is
  machine state and not product. **If the other session meant to commit it, it should.**
