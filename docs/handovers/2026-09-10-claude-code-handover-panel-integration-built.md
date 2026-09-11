# Claude Code handover — the panel is integrated

**Answers** [`2026-09-10-claude-code-handover-panel-integration.md`](2026-09-10-claude-code-handover-panel-integration.md),
which was written from the harness and a file listing and said so. **Repo:**
`C:\Users\Charles\Downloads\maticdesk_bot`, branch `main`. **Register:** v2.30, §5.28, **D240–D243**
— D236–D239 had already been taken by the hub-side work of the same day (`b5d9cf7`, `24f8f3e`) and
are still unsectioned, so the next free ID is **D244**.

**Client tests: 864 assertions across 16 files, all green** (was 797 / 15). The new file is
`client/test/panel.test.mjs`, 67.

---

## 0. What is on disk now

```
client/src/renderer/
  index.html                     REWRITTEN - the delivered panel, no developer control on it
  renderer.js                    REWRITTEN - same branches, new surface, our words routed away
  panel/
    matic-desk-panel.html        the delivery, VERBATIM, the reference
    matic-panel.css              GENERATED from its <style> block, whole
    matic-panel.app.css          hand-written: the stage becoming a window, + 4 undrawn surfaces
    panel-check.html             the click-through page (real renderer, fake bridge)
    panel-check-bridge.js        that fake bridge
    panel-check-frame.html       GENERATED from index.html
    PANEL-DELIVERY-README.md     how it composes, and the one rule
client/scripts/build-panel-assets.mjs      panel:build / panel:check
client/docs/PANEL-RENDERER-CHECK.md        the list Charles runs
```

```powershell
cd C:\Users\Charles\Downloads\maticdesk_bot\client
npm.cmd test
```

```powershell
cd C:\Users\Charles\Downloads\maticdesk_bot\client
npm.cmd run panel:check
```

---

## 1. The audit the handover asked for (§7), answered

**1. What was `index.html` / `renderer.js`?** A three-column grid: a 300px rail (avatar, state
label, voice pill, hub pill, facts table), the transcript, and a 340px permanently-resident
inspector with four `<pre>` panels plus a developer log. The design is a two-region layout, so
**the markup was replaced rather than adapted** — the old CSS was one inline `<style>` with no
tokens, and nothing in it was worth carrying across. `renderer.js` kept every branch and every
comment that gives a reason; what changed is where each line is written.

**2. Does the avatar element compose with it?** Yes, with no change to the element. The delivery
reserves a 150px square; `<matic-avatar size="150">` fills it, and `theme` is set from the panel's
theme so dark knocks the field out (v7 §05). The element is in a shadow root, so the panel's rules
and the avatar's cannot reach each other — which also answers question 3.

**3. Do the two `prefers-reduced-motion` blocks fight?** No, and they cannot: the panel's `*` rule
stops at the shadow boundary, and the avatar's own block is inside it. Both are present.

**4. What does the machine-state table render, and from where?** `agent.diagnose().panel` —
`{computer, user, online, adapter, ip, gateway, spooler, audio, dhcp}`, where the three services
are Win32 `stateName`s (`RUNNING` / `STOPPED` / `?`). The band renders them in plain words, and
`?` renders as "Couldn't read it from here" rather than as "Stopped", which is not the same fact.
**Two rows were kept that the design's mock does not show** — the machine's address and the router
— because they are the first things a support call asks for after the machine name, and dropping
information the founder has been reading is a change rather than a tidy-up. Say if you want them
gone.

The audit contradicted nothing in the handover.

---

## 2. The decision that shaped everything else

The delivery's own note — **"our words stopped reaching the user"** — is implemented as a routing
rule rather than as a deletion. Every line the renderer writes is now one of two kinds:

- **Ours.** State names, capability ids, template names, `source: tier0 (no cloud call made)`,
  broker JSON, retrieval internals, the Piper status. These go to the **inspector** (four steps,
  each a plain sentence with its payload one click under it) and the **developer log**. They are
  still there — they are the reason a buyer can believe the safety story — they are just not the
  reading material of someone whose printer has stopped.
- **Theirs.** "Nothing was filed." "No email was sent." "Whether it was stored is unknown."
  "The service desk is reachable again." **These stayed in the transcript**, as quiet notes,
  never red. Each one exists because of a shipped defect (D86, D205, D213, `700d920`), and the
  calmer surface is exactly where they would have been lost.

If you change one thing about this integration later, do not let that second list shrink.

---

## 3. Acceptance, item by item

| # | Item | Status |
|---|---|---|
| 1 | The delivered design renders in the app, light and dark, theme persisting across a restart | **Built.** `localStorage`, applied pre-paint by an inline script; the window is not shown until it has painted, so there is no wrong-colour frame either. **Seen on the check page, not yet in Electron** |
| 2 | Inspector hidden by default, opens as `overlay`, content readable | **Built and seen.** Payloads wrap (`white-space: pre-wrap` + `overflow-x: hidden`); a screenshot of the expanded proposal JSON was the check |
| 3 | All 35 `--matic-ui-*` names present, unchanged, no collision with `--matic-avatar-*` | **Built and tested.** The test counts both sets and compares them |
| 4 | The harness committed verbatim, and a check that fails when the generated artefact is stale | **Built.** `npm run panel:check` covers **two** artefacts and names each stale one rather than stopping at the first |
| 5 | No scene switcher, no inspector-variant control on the end-user surface | **Built and tested.** The harness's hook is `data-set="key:value"`; its complete absence from `index.html` is the assertion |
| 6 | A consent card displays the broker's text byte-for-byte | **Built.** `r.title`, `r.what`, `r.detail`, `r.rollbackNote` and the four explain fields are each assigned with `textContent`; the renderer has no `innerHTML` anywhere and a test enforces that. **The comparison against `consentRendered` is §4 of the click-through and is Charles's to run** |
| 7 | A decline renders without error colouring or apologetic layout, avatar `declining` | **Built and seen** on the check page — the offer's face was `declining` with the offer open, and `escalating` only once a reference existed |
| 8 | The three hub states render, and the unreachable wording matches `agent.js` | **Built and seen** (a live transition, rail + band + transcript line + face). **The wording match is a click-through item**, because only a real hub failure produces `agent.js`'s sentence |
| 9 | `client/` tests pass; the avatar / persona / lip-sync / connectivity work is not regressed | **Green.** 864 / 16, every pre-existing file unchanged and passing |
| 10 | Charles clicks it through in the app | **NOT DONE, and not optional.** `client/docs/PANEL-RENDERER-CHECK.md` |

---

## 4. §4's question is still yours — but it is built

**Does the tickets band ship?** It is built, and it is **D242, proposed.** The band lists what this
machine filed and got a reference for, read from the egress record (D235) over a new read-only
`ticket:filed` channel. Every row says **"Filed from here / Progress not visible"** where a status
would go, and the note under them says progress cannot be checked in this build **in the same words
`persona.tickets.some` speaks** — so the band and the spoken answer cannot describe one ticket two
ways. A build that cannot file says that instead of showing an empty list.

The reasoning for building it rather than waiting: it was cheap, the data was already there, and
the failure mode of the *other* choice is invisible — a status view that is merely empty reads as
"no news" when the truth is "no lookup".

**If the answer is no:** the trigger and the band markup come out of `index.html`, the delivery
keeps it, and the IPC channel stays, because D235's spoken answer already reads the same record.

---

## 5. Five things changed that the handover did not ask for

Each is small, each is reversible, and each is here rather than buried in a diff:

1. **The persona's two fallback lines said "The panel on the left shows what I can see."** There is
   no panel on the left now. Both lines name the band as it is. Same defect class as `700d920`.
2. **The Settings button in the delivery's rail is not rendered.** Nothing is behind it in this
   build, and a control that does nothing is worse than an absent one.
3. **"Change my answer" on an answered offer is not rendered.** A yes files a ticket and a filed
   ticket cannot be unfiled; the affordance would offer something the system does not have.
4. **The rail carries a working line** ("Looking at this now") while a turn is in flight, and drops
   it the moment something is waiting on the user — including while a consent card or a review card
   is open. The avatar carries the same fact; this is it in words.
5. **`BrowserWindow` gets `show: false` + `ready-to-show`.** It removes the launch flash instead of
   guessing a `backgroundColor` that is right for one theme.

---

## 6. What the panel does NOT do yet

- **The bands do not refresh on their own.** The machine band re-reads the probe when it is opened;
  the tickets band re-reads after a filing. Neither polls. That is deliberate (a probe on a timer
  is a cost with no asker) and it is worth knowing before someone reports a stale value.
- **Barlow is named and not shipped.** No webfont is fetched at runtime, by the design's choice, so
  the panel currently renders in `Arial Narrow` / `system-ui`. If the design's typography is
  wanted, the font files have to ship locally — the admin console already self-hosts three Barlow
  faces (D225), so there is a precedent and a licence question that is not mine to answer.
- **The citation block shows the article ids, not a separate guidance body**, because `/v1/ask`
  returns the answer as prose plus ids — there is no second text to display. The block is
  attribution, and it is shown and not spoken (H5), which is what the rule requires.
- **`inline` inspector variant is set in one place and never exercised in the app.** Change
  `data-variant` in `index.html` to see it; nothing else moves.

---

## 7. Honesty ledger

- **The panel was driven, not just written.** `panel-check.html` runs the real `renderer.js` against
  a fake bridge, and this session watched: first run, the boot greeting, a consent flow end to end
  (including the approved card correcting its own "nothing has changed yet" line), both bands, the
  inspector overlay with a payload expanded, dark mode surviving a reload, the escalation offer
  answered by its buttons, the ticket review card, a filed ticket with its D86 note, a citation,
  and a hub transition to unreachable with the face going to `error`.
- **Everything behind that bridge is canned.** No probe, no broker, no hub, no model, no Piper. It
  proves the panel handles those response shapes. It proves nothing about whether the broker
  produces them, and it cannot.
- **Nobody has seen this in Electron.** Acceptance item 10 stands, and six of the last seven
  click-throughs on this project found something.
- **Three defects were found by looking at the screen and are fixed:** the consent card kept saying
  "Nothing has changed yet" after the user approved it; the rail said "Looking at this now" while
  the app was in fact waiting on the user; and an offer's buttons could land below the fold because
  the scroll happened before they were attached.
- **Nothing here is measured.** No render timings, no memory figures. The 864 assertions are a
  count of checks, not a coverage claim, and none of them can see a screen.
- **A narrow window was checked, once, on the check page.** At an 885px client width nothing
  scrolls sideways (`body.scrollWidth === clientWidth`), and the inspector overlay keeps its 440px
  and leaves about 200px of conversation beside it — legible, and tight enough that `inline` would
  be the wrong default on a small screen. That is one measurement at one size in a browser, not a
  responsive pass, and the Electron window's minimum is not set at all.
