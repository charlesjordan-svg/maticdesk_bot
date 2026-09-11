# Claude Code Handover — panel design integration

**Repo root:** `C:\Users\Charles\Downloads\maticdesk_bot`. **Branch:** `main` at `85cba90`.
**Register:** D1–D235, next free **D236** — though the in-flight session-outcomes work will have
taken some; check before assigning.

**Do not start until the current pass is committed.** That work is entirely in `server/` —
`retrieval-mode.sql`, `session-outcomes.sql`, `src/sessions/`, `src/kb/health.js`. **This handover is
entirely `client/src/renderer/`.** No file overlap, but no point creating a merge either.

---

## 0. The delivery

`matic-desk-panel.html` — a self-contained harness for the end-user panel, from Claude Design
against the agent-panel brief.

**Verified mechanically:** 61 KB, one inline `<script>`, and zero occurrences of `src="http`,
`href="http`, `@import`, `unpkg`, `fonts.googleapis`, `text/x-dc`, `data-dc-*`, `<script src`,
`<link`, React, JSX, imports, canvas or WebGL. 35 `--matic-ui-*` tokens. `prefers-reduced-motion`
present.

**Charles clicked through it and it behaves as expected.** That is the seventh click-through on this
project and the first clean one — worth knowing, because it means the defects to expect here are
integration defects, not design defects.

**What it contains:** six scenes (first run, capability, offer, consent, citation, decline), light and
dark, an inspector in `overlay` and `inline` variants, two expandable bands (machine state, tickets),
and the three hub states.

---

## 1. Follow the avatar precedent — it already solved this problem

`client/src/renderer/avatar/` establishes the pattern for taking a design delivery into the app:

- the delivered files kept **verbatim** as the reference
- `matic-avatar.assets.js` **generated** from them rather than hand-copied
- `matic-avatar-harness.html` and `avatar-check.html` kept runnable
- `npm run avatar:check` failing when the generated module goes stale
- `.gitattributes` pinning `svg`, `css` and `html` to LF (`06304ac`) so the check does not report
  stale on a machine where nothing changed

**Do the same for the panel.** Suggested shape, but the naming is yours:

```
client/src/renderer/panel/
  matic-desk-panel.html      <- the delivery, verbatim, the reference
  matic-panel.css            <- extracted, the source of truth for styling
  matic-panel.tokens.js      <- generated, if the app needs the values in JS
```

Plus `npm run panel:check`. **The reason is the one the avatar pass proved: a hand-copy diverges and
a generated one cannot.** The `.gitattributes` rule from `06304ac` already covers `.html` and `.css`,
so that part is done.

**Do not hand-edit the harness.** Edit the extracted source and regenerate, exactly as the avatar
README instructs.

---

## 2. Token names are preserved verbatim

All 35 `--matic-ui-*` names go into the app unchanged. They do not collide with the avatar's
`--matic-avatar-*` family, which is why both can live in one document.

**Do not rename, shorten or re-namespace them.** If the app needs additional tokens, add them under
the same prefix rather than renaming what exists.

---

## 3. Three things in the harness that are *not* app state

The control rail is a harness device. Wiring it wholesale into the app would put a developer surface
back on the end-user panel, which is the problem this design exists to fix.

| Harness control | In the app |
|---|---|
| **Scene switcher** — first run, capability, offer, consent, citation, decline | **Not state at all.** These are conversational moments the app arrives at naturally |
| **`inspectorVariant`** — overlay / inline | **Ours, not the user's.** A build or developer setting. `overlay` is the default; `inline` is for development and for showing an IT buyer |
| **Theme** — light / dark | **A real user preference. Persist it.** The only one of the three that belongs in settings |

**The inspector is hidden by default** and opens as `overlay`. Design the affordance as delivered —
discreet, not a labelled panel.

---

## 4. One question for Charles inside this

**Does the tickets band ship?**

The harness has two expandable bands: machine state and tickets. **Machine state was in the brief;
tickets was not** — Design added it.

There is real data behind it: `85cba90` built ticket status from the egress record, and
`EgressAudit` reads back the tickets that got a reference. So it is implementable today, and it
answers a question users demonstrably ask.

**But it inherits that commit's honest limitation:** the endpoint knows what it filed, not what
happened to it. Checking progress needs a hub route and a user identity (D54, D68/D69) and is not
built. The band must say so, in the same words the reply already uses — **it must not look like a
status view that is merely empty.**

If the answer is no, leave it in the harness and do not render it. Do not delete it from the
delivery.

---

## 5. What must not change, and why

Each of these exists because of a defect that already shipped:

- **Consent text is rendered by the broker and displayed verbatim** (D130). Style the card. **Do not
  author, paraphrase, shorten or re-wrap the words inside it.** The two-step consent protocol exists
  precisely so the displayed text is the broker's, not the agent's.
- **The capability answer is generated from `plain.helpsWith`** (D235, D165). The design lays out a
  long generated string; it does not supply the string. `test/persona.test.mjs` fails if persona
  copy borrows a catalog word — keep that true.
- **A citation is shown, never spoken**, and is attributed to company guidance rather than the
  avatar's own voice.
- **A decline must not read as a failure.** V7 gives it its own avatar state for this reason. The
  panel styling must not undo it with error colouring or an apologetic layout.
- **The hub-unreachable state must stay honest.** `700d920` fixed a reply claiming the hub was
  unreachable while the pill beside it said reachable. The design's wording — *"says what it can't do
  and doesn't apologise"* — is the correct behaviour; **the panel and the reply must agree.** Two
  surfaces describing one state differently is the defect that shipped.

---

## 6. The offer affordance — sequencing note

The harness's offer scene includes an explicit accept/decline affordance. **That is the mechanism the
confirmation turn needs**, and it is the fix for the class of defect `3d1992e` corrected for
escalation: `Agent.propose(text)` being stateless per turn meant *"yes please hand to it"* arrived as
an unrelated new problem.

**So do the panel before the confirmation turn.** The affordance then exists before the turn that
requires it, rather than being built twice or built inline and refactored.

---

## 7. Audit first

**This handover was written from the harness and the file listing, not from the renderer source.**
Before changing anything:

1. **What is the current structure of `client/src/renderer/index.html` and `renderer.js`?** The design
   is a full-page layout; how much of it can be adopted directly against what exists is unknown to
   me.
2. **How does the avatar element compose with it?** `matic-avatar-element.js` is a custom element; the
   panel design has a slot for it. Confirm the delivery's markup and the element agree.
3. **Do the two `prefers-reduced-motion` blocks compose?** The avatar CSS has one and the panel CSS
   has one. They should not fight.
4. **What does the machine-state table currently render, and where does its data come from?** The
   design reframes it as a collapsed band with plain-language values; the source rows are
   `spooler RUNNING` and the like.

Write the answers down. If the audit contradicts anything above, the audit wins.

---

## 8. Acceptance

1. The panel renders the delivered design in the app, light and dark, with the theme persisting
   across a restart.
2. The inspector is **hidden by default**, opens as `overlay`, and its content is readable — no
   horizontally clipped JSON.
3. All 35 `--matic-ui-*` token names are present and unchanged, and do not collide with
   `--matic-avatar-*`.
4. The harness is committed verbatim and `npm run panel:check` fails if the generated artefact goes
   stale.
5. **No scene switcher, and no inspector-variant control, on the end-user surface.**
6. A consent card displays the broker's text byte-for-byte — provable by comparing against
   `consentRendered` in the audit record.
7. A decline renders without error colouring and without apologetic layout, and the avatar shows
   `declining`.
8. The three hub states render, and the unreachable wording **matches what `agent.js` actually says**
   in that condition.
9. `client/` tests pass. **The avatar, persona, lip-sync and connectivity work from `dcea379`
   through `85cba90` is not regressed** — that is four days of client work in the same files.
10. Charles clicks it through in the app, not in the harness.

---

## 9. Honesty ledger

- **Written from the harness and a file listing.** §7 exists because of that.
- **The harness was verified mechanically and clicked through; the app version has not been seen at
  all.** Item 10 is not optional — six of the last seven click-throughs found something, and the one
  that did not was the harness rather than the app.
- **§4 is a real open question, not a formality.** Design added a band nobody asked for, it happens to
  have data behind it, and shipping it means shipping its limitation legibly.
- **Nothing here is measured.** No render timings, no memory figures.
