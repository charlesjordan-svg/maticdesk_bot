# Claude Code handover — the machine's name is shown, not spoken (D249)

**Asked for** by Charles, against the running panel: *"Speaking computer names could be tricky
especially in a corp environment. Ok to display computername but it should say this pc."*

**Repo:** `main`, one commit on top of `bda684a`. **Register:** §5.32, **D249**.
**Client tests: 1070 assertions across 17 files, all green** (was 1048 / 16 — the new file is
`test/spoken-form.test.mjs`).

---

## 1. First, the finding you should know about: nothing spoke it

I looked before I built. On the day you asked, the hostname reached exactly four places:

| where | shown or said |
|---|---|
| the machine band, "This computer" | shown |
| the review card, "Machine" | shown |
| the developer log | ours |
| the ticket payload | sent, and correctly — IT needs it |

**Nothing spoken contained it.** So the behaviour you were worried about was not happening.

**But it was an accident, not a guarantee**, and that is the argument for building the rule anyway.
Three unrelated decisions happened to line up:

1. `probeMachine()` does not carry the hostname, so it is not in the facts the router reasons over.
2. `machineStateBlock()` excludes identity from the prompt **on purpose** (D53/G4) — `computer` and
   `user` are shown in the panel and never sent to a model, and a test asserts that.
3. The catalog's consent text happens not to mention the machine.

**Point 3 is only a habit.** Claude Design's own placeholder consent card reads *"…restart the Print
Spooler service on PLACEHOLDER-PC"* — which is exactly the sentence this would arrive through — and
a hub-authored answer from `/v1/ask` is prose nobody here writes at all. One reworded catalog entry
and the avatar starts reading your hostname out.

So it is enforced at the funnel rather than left resting on three things staying true.

## 2. What was built

`say()` is the only thing in the renderer that reaches the voice. It now **renders one string and
speaks another** — the same two-audiences split as D246 and D247, with the audiences being the eye
and the ear. The transcript keeps the hostname; the voice gets "this PC".

The rule lives in `client/src/renderer/spoken-form.js`, **pure and separate on purpose**:
`renderer.js` touches `document` at module scope, so no headless test can import it, and a rule kept
there could only ever be checked by reading the source. This one has 16 assertions against it.

**The rule is trivial; the boundaries are not**, and all three of these are things that are wrong in
a way reading the line does not show:

- **A hyphen is a word boundary to a regular expression.** `\bFIN-LON-0442\b` matches happily inside
  `OLD-FIN-LON-0442`. The pattern is bounded by the characters a hostname may *contain* instead, so
  a different machine's name survives intact.
- **The name goes into a `RegExp` and is read off the machine**, so it is escaped. An unescaped
  metacharacter is a crash or a wildcard, not a wrong word.
- **A name under three characters is deliberately not matched at all.** A machine called `PC` would
  otherwise rewrite the word "pc" in every sentence, which is worse than the thing being fixed.

Matching is case-insensitive, because a user types their machine's name however they like.

## 3. Verified

- 16 unit assertions on the boundaries above.
- `panel.test.mjs` pins the **wiring**, which the unit test cannot see: that the transcript gets
  `text`, the voice gets the redacted form, the name is learned where the probe's facts arrive (so
  the band's re-read refreshes it), and that **`say()` is the only caller of `matic.speak` in the
  renderer** — that last one is what makes "the funnel" true rather than asserted.
- Driven on the check page with a reply containing `PLACEHOLDER-PC`, `placeholder.user` and
  `OLD-PLACEHOLDER-PC` in one sentence:

  | | |
  |---|---|
  | on screen | `I've checked PLACEHOLDER-PC and placeholder.user is signed in. OLD-PLACEHOLDER-PC is a different machine.` |
  | to the voice | `I've checked this PC and placeholder.user is signed in. OLD-PLACEHOLDER-PC is a different machine.` |

## 4. What this does NOT cover — three live questions, none of them answered

These are the same class of thing and I have deliberately not extended the rule to them, because you
asked about the machine name and each of these is a judgement call rather than a defect.

1. **The signed-in user's name.** `placeholder.user` is on the review card and in the facts band, and
   the "tricky in a corp environment" argument applies at least as strongly to a person's account
   name as to a machine's. It is not spoken today for the same accidental reasons. **Want the same
   treatment?**
2. **The IP address.** `renew_dhcp`'s success line says *"Renewed the DHCP lease — this machine now
   has 10.0.0.42"*, and **that is spoken.** It is arguably the same class; it is also the most useful
   thing in the sentence, because it is the evidence the fix worked.
3. **The panel's own crash note.** `note("Something went wrong inside the panel and this turn
   stopped: " + err.message)` puts a raw JavaScript exception in front of the user. I found it by
   tripping it with a deliberately malformed stub while verifying this. It is *shown*, not spoken, so
   D247's sweep did not catch it. **Unfixed.**

## 5. Honesty ledger

- **Nobody has heard this.** The check page has no voice — `voiceReady` is false there, so
  `matic.speak()` is never called on it — which means the redaction was verified by the unit test,
  by the wiring assertions, and by applying the real module to the real string in the browser.
  **The only way to confirm the Piper output is to run the app on a machine with a distinctive
  hostname and listen**, and `client/docs/PANEL-RENDERER-CHECK.md` §3a is that check.
- **"this PC" is the literal wording you used**, kept rather than reworded.
- **The mouth is driven by the spoken text**, so the visemes match what is heard rather than what is
  on screen. That is correct and it is also untested — no headless test can see a mouth.
- **The three-character floor is a guess at where the harm crosses over.** Two characters is clearly
  too short to match; four is clearly a real name. Three is a judgement, and a machine genuinely
  called `HUB` or `LAB` would be rewritten.
