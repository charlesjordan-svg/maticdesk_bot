# Claude Design Handover — Matic Desk agent panel

**From:** Charles Jordan
**Attached:** a screenshot of the current panel, running against a live hub.
**Ask:** the look, feel and layout of the end-user panel. The broker inspector becomes hideable.

**Related and settled:** `BUST AVATAR SPECIFICATION` V7 and the delivered avatar assets
(`matic-avatar.svg` / `.css` / `.manifest.json` / harness). **The avatar itself is closed — do not
redesign it, restyle it, or add states.** This is about everything around it.

---

## 1. The problem, stated plainly

**Three of the four regions on screen are diagnostics and one is the product.**

| Region | Who it is for |
|---|---|
| **Broker inspector** — PROPOSAL / VALIDATION / CONSENT / EXECUTION, raw JSON, a `[hub]`/`[router]` log | Us |
| **Machine-state table** — `adapter Intel(R) Ethernet Cont`, `spooler RUNNING`, `dhcp RUNNING`, IP, gateway | Us, mostly |
| **`voice: piper 16000 Hz`** and the `idle` label under the avatar | Us, entirely |
| **The conversation** | **The user** |

The user is a non-technical office worker whose dock has stopped driving two monitors. They do not
need to know the DHCP client service is running, and every JSON card in the inspector has a
horizontal scrollbar, so even the audience that wants it cannot read it.

**The panel is a developer tool with a conversation inside it.** The ask is to invert that.

---

## 2. What the users are like

Not engineers. Office staff — dead docking stations, printers that will not print, files that will
not sync. They have just broken something and are slightly embarrassed about it.

The panel's job is to make them feel helped and to be honest about what it did. Both matter: an IT
buyer will ask what it touched, and a user who feels judged will close it.

---

## 3. Design for the inspector-hidden layout first

**Important, or this comes back:** the default state has **no inspector**. Please design that layout
as the real one, then design the inspector as something that opens *into* it — not as a
three-column layout with one column hidden, which leaves a gap where the third used to be.

The window in the screenshot is about 1160px wide. Two regions fit comfortably; three do not.

---

## 4. The inspector

**Do not delete it.** It is genuinely valuable in two places: demonstrating to an IT lead exactly
what the assistant proposed, validated, consented to and executed, and diagnosing during
development.

**But it is a selling surface, not a debugging surface, and it should be designed as one.** An IT
buyer asking *"what does it actually do to the machine?"* is the audience — not someone reading
JSON.

- **Hidden by default.**
- **Discoverable but not prominent** — please propose the control. A discreet affordance rather than
  a labelled panel.
- **Two audiences, and you may want two presentations:** a readable "what happened" view for a buyer,
  and the raw JSON for us. If one view can serve both, better.
- **The raw JSON must be readable when shown** — currently every card clips horizontally. Wrapping,
  a wider drawer, an overlay, whatever works.
- **The `[hub]` / `[router]` / `[ticket]` log is ours alone.** It can be behind a further step.

---

## 5. The machine-state table — reframe, do not delete

`computer Wakanda`, `spooler RUNNING`, `dhcp RUNNING` is diagnostic output. But the underlying fact
is worth keeping and is a **trust asset**: the assistant is telling the user what it can see, before
it proposes anything.

Suggested direction, but the shape is yours: collapsed by default behind something like *"what I can
see about this machine"*, opening to a plain-language version. `spooler RUNNING` becomes something a
person recognises. Truncation like `Intel(R) Ethernet Cont` mid-word should not happen at all.

It is also the **evidence behind a proposal** — when the assistant offers to restart a stuck print
service, the fact that the service is stopped is the reason. Worth considering whether the relevant
row surfaces at that moment rather than living in a list nobody opens.

---

## 6. Six specific problems visible in the screenshot

**a. The capability answer is one 130-word block.** *"Glad you asked. On this machine I can step in
when a printer or another background Windows service has got stuck…"* — that is the longest string
in the product and the only one that grows as the catalog grows. It needs structure. **The text is
generated from the catalog and is not yours to rewrite**, but how a long generated answer is laid out
is entirely a design question.

**b. An offer with no way to answer it.** *"I can open a ticket for you and include what I've already
checked. Would you like me to?"* — and the only affordance is a text box. The user typed something
unrelated instead, which is exactly the failure this product has already hit once: an offer the
software cannot hear an answer to is worse than no offer. **Please design an explicit
accept/decline affordance for offers.** This has a functional consequence, not just a visual one.

**c. Internal vocabulary is reaching the user.** *"no capability in the catalog covers this —
escalating"* is our language in a grey pill. "Capability", "catalog" and "escalating" are internal
terms. Either that line is for us — in which case it belongs in the inspector — or it needs a
user-facing form.

**d. `idle` is printed under the avatar.** State names are ours. If the user should see a status,
it needs words a person would use.

**e. `voice: piper 16000 Hz`** has no business on an end-user surface. Settings, or gone.

**f. `hub: reachable · last ok 11:16:19 AM`** carries real meaning — the assistant genuinely
degrades when the hub is unreachable, and it must be able to say so. But *"hub"* is our word and a
timestamp to the second is ours too. **The state matters; the wording and the granularity are yours
to fix.** Three states exist: reachable, unreachable, and not-connected-to-one-at-all.

---

## 7. Constraints that are not negotiable

These come from the architecture, not from taste:

- **Electron. Inline SVG and CSS only.** No framework, no bundler, no build step, no WebGL, no
  canvas. Corporate laptops with integrated graphics.
- **The avatar assets are as delivered.** Style around them, not on them.
- **Consent text is rendered by the privileged half of the application and displayed verbatim.** You
  may design the card. **You may not author, paraphrase, shorten or reformat the words inside it.**
- **The capability answer, the article citations and the consent text are all generated.** Design the
  container; the strings are not yours.
- **A citation is shown, never spoken**, and is attributed to the company's guidance rather than
  presented as the assistant's own voice.
- **A decline must not read as a failure.** When the knowledge base does not cover something, saying
  so is the product working correctly. It must never look like an apology or an error.

---

## 8. Deliverables

Same shape as the avatar delivery, which worked well:

1. **A self-contained HTML + CSS harness.** One file, opens from disk, offline, no build. Showing:
   - the default layout, inspector hidden
   - the inspector open
   - the machine-state section collapsed and expanded
   - an offer awaiting an answer, with its affordance
   - a consent card
   - an answer with a citation
   - a decline
   - the long capability answer, laid out
   - first run, with an empty conversation
   - the three hub states
2. **A token set** — colours, type scale, spacing, radii — named consistently and reusable. It should
   sit alongside the avatar's `--matic-avatar-*` tokens without colliding.
3. **`prefers-reduced-motion` behaviour** for anything that moves.
4. **Light and dark**, if light is wanted — please ask rather than assume; the current build is dark
   and there may be no requirement.
5. **A short note on what you changed and why**, so the reasoning survives. Not a specification
   document — the reasoning inline is enough.

**Use placeholder data in the harness.** The screenshot has a real machine name, a real username and
real IP addresses on it.

---

## 9. What not to send back

- Any change to the avatar, its states, or its assets.
- A framework, a build step, or a dependency.
- Rewritten product copy for anything generated — the capability answer, consent text, citations.
- The inspector deleted rather than hidden.
- A three-column layout with a hole in it when the inspector closes.

---

## 10. If something here conflicts

Say so and stop, rather than resolving it in the design. Two of the constraints in §7 exist because
of defects that already shipped once, and a design that quietly works around one of them would
reintroduce it.
