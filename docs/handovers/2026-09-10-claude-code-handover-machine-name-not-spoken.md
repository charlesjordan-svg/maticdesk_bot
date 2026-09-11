# Claude Code handover — shown, not spoken (D249), and reports in the user's words (D250)

**Asked for** by Charles, against the running panel: *"Speaking computer names could be tricky
especially in a corp environment. Ok to display computername but it should say this pc."* Then, on
being shown what else was in the same class: *"do the username too"*, and *"fix 2 and 3 as well"*.

**Repo:** `main`. **Register:** §5.32 (**D249**) and §5.33 (**D250**).
**Client tests: 1113 assertions across 17 files, all green** (was 1048 / 16; the new file is
`test/spoken-form.test.mjs`, 36 of them).

---

## 1. First, the finding: two of the three were not being spoken

I looked before I built. The hostname and the account reached exactly four places — the machine
band, the review card, the developer log and the ticket payload — **all shown or sent, none spoken.**

**But it was an accident, not a guarantee**, and that is the argument for the rule. Three unrelated
decisions happened to line up: `probeMachine()` carries neither, `machineStateBlock()` excludes
identity from the prompt **on purpose** (D53/G4), and the catalog's consent text mentions neither.
**The third is only a habit** — Claude Design's own placeholder consent card reads *"…restart the
Print Spooler service on PLACEHOLDER-PC"*, which is exactly the sentence it would arrive through,
and a hub-authored answer from `/v1/ask` is prose nobody here writes.

**The address was different: it WAS spoken.** `renew_dhcp`'s success line says *"Renewed the DHCP
lease — this machine now has 10.0.0.42"*, on every successful lease renewal.

## 2. What was built

`say()` is the only thing in the renderer that reaches the voice. It **renders one string and speaks
another** — the same eye/ear split as D246 and D247. The screen keeps everything.

| on screen | said |
|---|---|
| `FIN-LON-0442` | this PC |
| `a.petrova`, `CORP\a.petrova`, `a.petrova@corp.example` | your account |
| this machine's own IP and gateway | an address |

**"your account" rather than "you"**, because it has to survive dropping into a sentence somebody
else wrote — a hub answer, a reworded catalog line — and a noun phrase does that where a pronoun
does not: *"your account is signed in"* reads, *"you is signed in"* does not.

**"an address" keeps the fact that survives being said aloud.** *Having* one is the whole evidence
that renewing the lease worked; the digits are what a listener cannot use and a synthesiser cannot
read, and they stay on screen where they can be copied.

The rule lives in `client/src/renderer/spoken-form.js`, **pure and separate on purpose**:
`renderer.js` touches `document` at module scope, so no headless test can import it, and a rule kept
there could only ever be checked by reading the source.

## 3. The boundaries are the whole of it

Every one of these is wrong in a way reading the line does not show.

- **A hyphen is a word boundary to a regular expression.** `\bFIN-LON-0442\b` matches happily inside
  `OLD-FIN-LON-0442`. Bounded by the characters a name may *contain* instead, so a different
  machine's name survives.
- **`CORP\a.petrova` without a qualifier clause becomes `CORP\your account`** — the account redacted
  and the domain read out instead, **the worse half surviving.** The optional `DOMAIN\` prefix and
  `@domain` suffix are consumed as part of the match.
- **An address cannot exclude `.` on its right, because sentences end with one.** So the boundary is
  "not a digit, and not a dot-then-digit" — which lets a full stop through and stops `10.0.0.4`
  matching inside `10.0.0.42`.
- **The name is read off the machine and goes into a `RegExp`**, so it is escaped.
- **Under three characters is not matched at all.** A machine called `PC` would rewrite the word
  "pc" in every sentence, which is worse than the thing being fixed.
- **The user is replaced before the machine**, because its qualifier clause then absorbs a
  `FIN-LON-0442\` prefix in one step rather than leaving `this PC\your account`.

## 4. The addresses are two literal values, never a pattern

It would have been easier to redact anything address-shaped, and it would have been wrong. **A
knowledge-base answer may legitimately tell someone to try `8.8.8.8`**, name a print server, or quote
a subnet out of company guidance. Redacting those destroys the answer rather than protecting anyone.

What is replaced is the small set of literal values the probe reported for *this* machine — its own
address and its gateway. A test asserts `8.8.8.8` comes through untouched, and that is the assertion
worth keeping.

## 5. Item 3: the panel's crash note

`note("Something went wrong inside the panel and this turn stopped: " + err.message)` rendered
*"…stopped: TypeError: Cannot read properties of undefined (reading 'ok')"*. **Shown rather than
spoken, which is why D247's sweep missed it**; found by tripping it with a deliberately malformed
stub while checking the name rule. The stack was already going to the developer log, so nothing is
lost. It now reads:

> That stopped part-way. I don't know how far it got.

**Shortened on Charles's instruction the same day** — *"fix the crash note wording, it's too
wordy"*. What went was a sentence of advice with nothing specific behind it ("so check before you
try the same thing again" — there is no named thing to check) and the word "turn", which is ours for
a conversational exchange and not the user's. **`unknown: true` stays on it**, and so does the
uncertainty: a turn that stopped half-way is exactly the case where a user must not assume nothing
happened, and *"I don't know how far it got"* is the half that had to survive.

**The assertions guarding it broke on that rewording**, because they matched the sentence verbatim —
the third time in this session a check was written against the words instead of the contract. They
pin properties now (exists, flagged `unknown`, no exception, says it stopped, says the outcome is
unknown, avoids "turn", at most sixteen words), and a probe confirms all four mutations are caught:
the wordy version, the original exception-at-the-user defect, dropping the uncertainty, and dropping
the flag.

## 5a. The one address the rule could not reach (asked for separately)

*"Fix the ip in renew_dhcp's message too."* He was right, and the reason is structural rather than
an oversight: **`renew_dhcp` exists to CHANGE this machine's address**, so the value in its success
line is one the last probe cannot have seen — and `spokenEnv` is learned from the last probe. The
single capability whose message is guaranteed to carry an address was the single one the redaction
could not catch. `reset_adapter` is the same, and so is the self-assigned (`169.254.x.x`) phrase.

**The fix is not in the message, and that is deliberate.** `probe.test.mjs` asserts the APIPA phrase
*"still shows the address, rather than hiding it"* — and that assertion has a hardware finding behind
it: `verify-privileged.ps1` once produced *"it is back up on 169.254.17.252"*, which reads as
success and means the opposite. **Taking the digits out of the message would delete that evidence to
solve an audio problem.**

So the renderer folds the broker's `detail` into the environment **before anything speaks the
result**, and a freshly-assigned address is then redacted exactly like a probed one. `detail` is
broker-authored machine detail about this machine — never hub prose — which is what makes reading it
generically safe here while a blanket address pattern stays unsafe in `spokenForm`. It also beats
re-probing: the probe lags the change by design (`resetAdapter()` settles for 1.5 s, and DHCP took
longer than that on real hardware), and the broker already knows the answer.

| | |
|---|---|
| on screen | `Renewed the DHCP lease — this machine now has 192.168.50.223.` |
| to the voice | `Renewed the DHCP lease — this machine now has an address.` |
| on screen | `…back up, but so far only a self-assigned address (169.254.17.252), which means DHCP has not answered yet.` |
| to the voice | `…back up, but so far only a self-assigned address, which means DHCP has not answered yet.` |

**One wording rule came out of it:** an address that is the whole of a parenthetical is DROPPED
rather than replaced, because *"a self-assigned address (an address)"* is worse said aloud than
either the digits or nothing.

## 5b. "DHCP lease" and "DNS resolver cache" — answered (D250, register §5.33)

Left open above; Charles closed it the same day: *"fix the dhcp lease and dns resolver cache wording
too."*

| before | now |
|---|---|
| `Flushed the DNS resolver cache.` | `Emptied this machine's memory of recent website lookups.` |
| `Renewed the DHCP lease — this machine now has 10.0.0.42.` | `Handed the old address back and asked for a new one — this machine now has 10.0.0.42.` |
| `…but it has no IP address yet` | `…but it has no address yet` |
| `…which means DHCP has not answered yet` | `…which means the network has not given it a real one yet` |

**The new wording is not invented — it is the catalog's.** `plain.what` already said *"Empties this
machine's memory of recent website-name lookups"* and *"Hands back this machine's network address and
asks the network for a new one"*, and that is the text on the consent card. So the report now echoes
**the description the user approved**, which is worth more than merely being plainer: they can match
what they were told happened to what they agreed to.

**The catalog TITLES are unchanged** — "Flush the DNS resolver cache", "Release and renew the DHCP
lease". A title is the capability's identity, it is the model's handle on it, and it is what the
inspector and the audit record should say. What changed is which of the two a user hears; the last
place a title reached `say()` (the `I think this is the fix. ${title}.` fallback) no longer names it.

**Also unchanged, deliberately:** `validate().errors` still say things like *"…has a static address,
so there is no DHCP lease to renew"*. That is the gate explaining itself, D247 routed it to the
inspector, and it is not spoken.

**The address in the self-assigned phrase is untouched**, for the reason in §5a — it is the evidence,
`probe.test.mjs` requires it, and D249 keeps it off the voice. `client/docs/DEMO-RUNBOOK.md` quotes
that line and has been updated with it.

## 6. Verified

- **36 unit assertions** on the boundaries, including all three identifiers in one sentence.
- **A mutation probe: ten deliberate weakenings, all ten caught** — each boundary dropped in turn,
  the three-character floor removed, the user/machine ordering swapped, the regex escaping removed,
  the "unknown" guard removed.
- `panel.test.mjs` pins the **wiring** the unit test cannot see, including that **`say()` is the only
  caller of `matic.speak` in the renderer** — that is what makes "the funnel" true rather than
  asserted — and that the crash note carries no exception.
- Driven in the browser against the real renderer:

  | | |
  |---|---|
  | on screen | `PLACEHOLDER-PC\placeholder.user is signed in on PLACEHOLDER-PC, which now has 10.0.0.42 via 10.0.0.1. Try 8.8.8.8 if that fails.` |
  | to the voice | `your account is signed in on this PC, which now has an address via an address. Try 8.8.8.8 if that fails.` |

## 7. Honesty ledger

- **Nobody has HEARD any of it.** The check page has no voice — `voiceReady` is false there, so
  `matic.speak()` is never called — so this was verified by the unit test, the mutation probe, the
  wiring assertions, and by applying the real module to the real on-screen string in a browser.
  `client/docs/PANEL-RENDERER-CHECK.md` §3a is the listen-to-it check and it needs the app.
- **The mutation probe was wrong twice before it was right, and that is the more useful record.**
  Its own escaping was wrong, so two mutations silently applied nothing; then it was mutating the
  **doc comment** rather than the code, because `spoken-form.js` quotes every one of those boundaries
  in its own prose. Both runs printed "MISSED — the tests are weaker than they look", which is the
  shape of a real finding, while proving nothing. §10.5's class, inside the tool built to check for
  it. The probe is in the scratchpad, not the repo.
- **I destroyed my own uncommitted work once during this**, with a `git checkout` used to undo a
  failed probe mutation. Rewritten from context; the tests are what caught that the file had
  reverted.
- **The three-character floor is a guess at where the harm crosses over.** A machine genuinely
  called `HUB` or `LAB` would be rewritten.
- **"unknown" is excluded as a name** — `identify()` returns it when there is no passwd entry, and
  redacting it would turn an honest placeholder into a claim that the user's account was named.
  `none`, `-` and `?` are excluded with it; that list is a guess at the placeholder vocabulary.
- **Not covered:** the machine name and account still go to the hub **on a ticket**, which is
  correct and is D217's egress record. Nothing here changes what leaves the machine — only what is
  said out loud in the room.
- **The mouth is driven by the spoken text**, so the visemes match what is heard rather than what is
  on screen. Correct, and untested — no headless test can see a mouth.
