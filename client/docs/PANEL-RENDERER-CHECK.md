# Panel renderer check — RUN 2026-09-11, and what is still Charles's

**Written 2026-09-10 with the panel integration (D240–D243); revised the same day for the
re-export (D252), which redrew most of what is described below.** Same shape as
[`AVATAR-RENDERER-CHECK.md`](AVATAR-RENDERER-CHECK.md) and
[`D130-RENDERER-CHECK.md`](D130-RENDERER-CHECK.md): the renderer is not covered by `npm test`,
because no headless test can see a screen, so this is the list a person looks at.

**What the building session already saw, and where.** It drove the panel through
`src/renderer/panel/panel-check.html` — the real `renderer.js`, a fake bridge — and watched: the
first-run panel, the boot greeting, the consent flow end to end, the machine band, the tickets
band, the inspector overlay with its payloads wrapped, dark mode, the escalation offer answered
with its own buttons, the ticket review card, a filed ticket, a citation, and a hub transition
from reachable to unreachable. §7 of the handover says what that does and does not establish.

**MOST OF THIS WAS RUN ON 2026-09-11 (D254, register §5.37)** — in Electron, against the real
broker, the real probe and a real hub on `mistral-small:24b`, driven over the Chrome DevTools
Protocol with screenshots of the actual window. **Seven straight click-throughs on this project have
now found something and this one found six things**, two of which are fixed. What it established
and what it could not are in
[`docs/handovers/2026-09-11-claude-code-handover-panel-electron-click-through.md`](../../docs/handovers/2026-09-11-claude-code-handover-panel-electron-click-through.md).

**THREE ITEMS ARE STILL YOURS, AND THEY ARE THE ONES A PERSON HAS TO DO.** They are marked
**[CHARLES]** below:

| | Why a session could not do it |
|---|---|
| **§3a — anything HEARD** | Every D249/D250 check about the VOICE. The redaction was proved to fire at the boundary (the app's own log says so, §3a.6) and the strings were read, but **nobody has listened to the audio.** |
| **§1.1 — the first frame** | Whether the window flashes light-before-dark on launch. The mechanism is right in code (`show: false` + `ready-to-show` + a painted `backgroundColor`) and a screenshot cannot catch a frame that is not meant to exist. |
| **§4 — the todo card** | It comes from `diagnoseOffline(probe)`, so it needs THIS MACHINE genuinely offline. A session will not disconnect your network to see a card. It has still only ever been seen against canned data. |
| **§8a.14 — the restart sentence, HEARD** | Same class as §3a. The sentence was read on screen and the day count was checked as a numeral; whether Piper says "forty days" or stumbles on it is not something a session can hear. |

**RUN AGAIN, END TO END, ON 2026-09-11 AFTER THE DAY'S FIVE DECISIONS** (D255–D258 and D248, and
Claude Design's new export). **39 checks in the real app over the DevTools Protocol, plus the seven
branches only the check page can drive.** Everything below passed except what is marked [CHARLES].
Recorded in the register at **§10.3b**, which is the second entry in "verified on a screen" and the
first a session ran rather than the founder.

**The ninth straight click-through found something, and it was in a tool rather than the panel:**
`npm.cmd run show-consent` — the thing
§4.3 tells you to compare the card against, field for field — **did not print `detailPlain`**, the
field D248 added hours earlier. A field the script does not print is a field a wrong value could not
be caught in. Fixed; it now prints it in the order the card draws it.

**One thing that could not be observed rather than passed:** §6.5's *"Sending…"* head. On the check
page the canned bridge resolves within a frame, so the intermediate state is replaced before it can
be sampled. The two outcomes either side of it were confirmed ("Not sent", "Sent, not confirmed"),
and the contract is tested headlessly — but nobody has yet *seen* "Sending…" on screen.

**Three failures in the run were the driver's, not the panel's**, and they are worth knowing because
the next session will hit them too: `querySelector` returns the FIRST match and an earlier turn's
consent card is still in the transcript (§10.5's trap, hit twice); and **an unanswered consent card
keeps the turn in flight**, so every later step silently does nothing until it is answered — the
composer is correctly disabled throughout, which is how you can tell.

**§8a IS NEW AND WAS RUN ON 2026-09-11 (D256, register §5.39)** — in Electron over the DevTools
Protocol against the real broker and the real probe, with the policy temporarily lowered so this
machine would fire. **Twenty-three checks, and it found one defect: the evidence clause named the
configured BAND rather than the reading, so a machine up 1.35 days was told it had not been
restarted "in more than a fortnight".** Fixed, and §8a.6 is the step that finds it again. Eight
straight click-throughs have now found something.

**The panel on disk is Claude Design's re-export (D252).** The steps below are written against the
current build, so a step that does not match what you see is a finding, not a stale document.

## 0. Before starting

```powershell
cd C:\Users\Charles\Downloads\maticdesk_bot\client
npm.cmd test
```

```powershell
cd C:\Users\Charles\Downloads\maticdesk_bot\client
npm.cmd run panel:check
```

Both green. Then start the hub (Desktop icon "Matic Desk Hub") and the agent ("Matic Desk Agent").

If you want the fake-bridge page as well — it is quicker for looking at layout, and it needs no
hub:

```powershell
py -3 -m http.server 8766 --directory C:\Users\Charles\Downloads\maticdesk_bot\client\src --bind 127.0.0.1
```

Then open `http://127.0.0.1:8766/renderer/panel/panel-check.html`. **Everything behind the bridge
on that page is canned** — the machine is PLACEHOLDER-PC and no broker is running. It proves
layout, never behaviour.

## 1. The window opens as itself

| # | Look at | Pass when |
|---|---|---|
| 1.1 | **[CHARLES]** The first frame after launch | No flash of a light window before a dark one (or vice versa). The window is not shown until it has painted. **Not verifiable by a session:** `main.js` does the right thing (`show: false`, shown on `ready-to-show`, an opaque `backgroundColor`) but a screenshot cannot catch a frame that is not supposed to exist. Launch it in dark and watch |
| 1.2 | The whole window | The panel fills it. No stage padding, no drop shadow, no registration marks clipped at the edges |
| 1.3 | The left rail | The avatar at 150px, the brand, and **no state name, no voice pill, no facts table** |
| 1.4 | The transcript | "Tell me what's gone wrong", three openers, and Matic's spoken greeting below them |
| 1.5 | Click an opener | It sends that sentence as if you had typed it |

## 2. The theme (acceptance 1)

| # | Do | Pass when |
|---|---|---|
| 2.1 | Click the circle button at the bottom of the rail | The whole panel changes theme, **and the avatar's field changes with it** (dark knocks the field out — v7 §05) |
| 2.2 | Close the app. Reopen it | It comes back in the theme you left it in |
| 2.3 | In dark, read: the reply text, the band rows, the inspector's JSON, the composer placeholder | All legible. Anything you have to lean in for is a finding |

## 3. The inspector (acceptance 2)

| # | Do | Pass when |
|---|---|---|
| 3.1 | Look at the top-right of the conversation | A thin glyph with the words **"What I did"** beside it. **No panel of JSON is on screen.** It was a bare crosshair until the re-export (D252) — which read as "+" / "add", the opposite of what it does — so if you find an unlabelled crosshair, the build is stale |
| 3.2 | Click it | A drawer opens **over** the conversation, from the right, with a dimmed scrim behind it |
| 3.3 | Read the four steps | Proposed / Checked / Consent / Done, each a sentence you could read aloud to a buyer |
| 3.4 | Expand "Show the data" on each | The payload **wraps**. Nothing is cut off at the right edge, and there is no horizontal scrollbar |
| 3.5 | Expand the developer log | `[router]`, `[hub]`, `[tts]`, `[avatar]` lines — ours, and only here |
| 3.6 | Close it, look at the conversation | Nothing has moved. Nothing was reserved for it |

## 3a. Name, account and address: on screen, not in the voice (D249) — **[CHARLES] for the audio**

**What was established on 2026-09-11 without hearing anything:** the reply to "where's my ticket?"
carried this machine's real name AND its real address on screen, and the app's own developer log
then printed `[tts] this machine's name, account or address is shown, not spoken (D249)` — so the
string that went to the voice was rewritten and the string on screen was not. **That is the
mechanism proved end to end in the product for the first time.** What is left is listening to it.

**This one needs the voice working**, so it is the check that `panel-check.html` cannot do at all —
it has no Piper, so `speak()` is never called there. Run the app on a machine whose hostname is
distinctive and **listen**.

| # | Look at / listen for | Pass when |
|---|---|---|
| 3a.1 | The machine band: "This computer", "Signed in as", "This machine's address" | Your real hostname, account and IP. **Shown is correct for all three** |
| 3a.2 | The review card's identity row — "This machine" | Your real hostname and account, on **one** line since the re-export (D252) drew it that way, with "self-asserted — not authenticated" under it (D215). The same values as the band. They go on the ticket, and IT needs them |
| 3a.3 | Anything the avatar SAYS about the machine | **"this PC"**. Never the hostname, never spelled out |
| 3a.4 | …about the account | **"your account"** |
| 3a.5 | Renew the DHCP lease and listen to the result | **"…now has an address."** Not the digits. *Having one* is the evidence it worked, and that survives. **This is the address the boot probe never saw** — the capability's whole job is to change it — so it is the case the rule could not reach until the broker's own result was folded in |
| 3a.5a | …and look at the transcript for that same turn | **The digits are still there on screen.** If they are gone, that is a defect: `probe.test.mjs` requires a self-assigned `169.254.x.x` to be SHOWN, because one reading as success is a failure found on real hardware |
| 3a.5b | If it lands on a self-assigned address | Spoken: *"…only a self-assigned address, which means DHCP has not answered yet."* **Not "(an address)"** — an address that is the whole of a parenthetical is dropped, not replaced |
| 3a.6 | The developer log | `[tts] this machine's name, account or address is shown, not spoken (D249)` — it only appears when a redaction actually happened, so its absence means no spoken string contained any of them |
| 3a.7 | The transcript, for that same turn | **All three are still there on screen.** Shown and said are two different strings, and only one of them changed |
| 3a.8 | Ask something whose answer names a PUBLIC address (a DNS server, a print server) | **It is spoken normally.** Only this machine's own two addresses are replaced; redacting "try 8.8.8.8" would destroy the answer |

## 3b. A turn that crashes (D249, item 3)

Hard to provoke deliberately, so this is a "if you ever see it" check rather than a step.

| # | Look at | Pass when |
|---|---|---|
| 3b.1 | The note after a turn that stopped | *"That stopped part-way. I don't know how far it got."* **No `TypeError`, no stack, no exception text** — and the uncertainty must be in it, however it is worded |
| 3b.2 | Its styling | The attention colour (`unknown`), because a turn that stopped half-way is exactly the case where you must not assume nothing happened |
| 3b.3 | The developer log | The full stack, unchanged |

## 4. A real fix, with consent (the D130 comparison, again) — **[CHARLES] for the elevated half**

**Run unelevated on 2026-09-11**, which exercised the refusal rather than the success:
`restart_service` came back *"I couldn't do that one from here."* with
`OpenServiceW(spooler, STOP|START) failed (Win32 error 5)` on `detail` in the inspector and nowhere
else — **D247 confirmed against a real Win32 failure.** `flush_dns` DID run for real and reported
*"Emptied this machine's memory of recent website lookups."*, the catalog's own `plain.what` words
rather than "Flushed the DNS resolver cache" — **D250 confirmed against a real execution.** The
elevated success path of `restart_service` still needs an Administrator window.

Ask it something a capability covers — "my printer won't print" with the spooler stopped
(`npm.cmd run inject-fault`).

| # | Look at | Pass when |
|---|---|---|
| 4.1 | Above the card | A **Why** line naming the service and its state, in plain words |
| 4.2 | The card's heading | The broker's title. Beside it, "Nothing has changed yet" |
| 4.3 | The card's words | **Byte-for-byte what `npm.cmd run show-consent` prints.** Not re-wrapped, not shortened, not sentence-cased. This is the check that matters most on the page |
| 4.4 | "What is this, and why?" | Collapsed by default; opens to the model's own reasoning first, labelled as such |
| 4.5 | Approve | The line beside the heading becomes "You approved this", the outcome is recorded on the card, and the reply follows |
| 4.6 | Deny | "You did not approve this", and nothing runs |

## 4a. A fix that does NOT work (D247) — three branches nobody had run

The fake bridge returned success and only success until 2026-09-10, so none of these had been seen.
In the real app: **4a.1 and 4a.2** need a service that will not start (stop the spooler and deny the
account, or run unelevated); **4a.3** just needs you to leave the consent card on screen for more
than two minutes. (On `panel-check.html`: *next fix: fails*, *next fix: needs permission*, *next fix:
consent expired*.)

| # | Look at | Pass when |
|---|---|---|
| 4a.1 | A fix that ran and failed | Spoken: a plain sentence. **No Win32 call, no `OpenServiceW`, no error number, no service key.** It used to say `That did not work: OpenServiceW(spooler) failed (Win32 error 5)` out loud |
| 4a.2 | A fix the unprivileged half may not do | Spoken: short — *"I couldn't do that one from here."* The `.turn-note` under it is what explains. **If the two say the same thing in different words, that is the defect** (it was, once, in this pass) |
| 4a.3 | An approved card that sat too long | Spoken: it timed out and nothing was changed. **Not "no consent nonce was presented"** — that is the protocol's phrasing and belongs in the record |
| 4a.4 | The inspector, on all three | `detail` carries the Win32 call site (`detail.win32`) or the gate's own words (`detail.consent` / `detail.refusal`). **If `detail` is empty, the diagnostic was lost** |
| 4a.5 | A fix that WORKED, on the printer | *"Restarted the **Print Spooler** service — it went STOPPED → RUNNING."* **Not "the spooler service"** — that is the registry key, and a user cannot look it up under that name (D247). The before → after pair must survive; it is the proof |
| 4a.6 | The consent card's third line | `restart_service(serviceName=spooler)`, in mono, smaller, under the plain sentence. **It must still be there** — it is what will run, and D130 requires it on screen. Whether it should also be glossed is D248, proposed |
| 4a.7 | The rollback line on an R2 card | It names the action by its title — *"Disable and re-enable a network adapter"* — not by `reset_adapter` |

## 5. A decline, and an offer you can answer (acceptance 7, handover §6)

Ask for something outside the catalog — "can you move my mailbox to the new server".

| # | Look at | Pass when |
|---|---|---|
| 5.1 | The reply | **No red, no warning colour, no apology layout.** It reads as an answer |
| 5.2 | The avatar | `declining` — round eyes, a `?`, no bow. Held while the offer is open |
| 5.3 | Inside the reply | **Yes, open a ticket** / **No thanks**, and "What would you send?" |
| 5.4 | Above the composer | "Waiting on your yes or no above — or just type instead." |
| 5.5 | The rail | "Nothing in progress". It is waiting on you, and does not imply it is working. **It must not say "Nothing running"** — beside a band listing this machine's services that reads as a claim about them (D244) |
| 5.6 | Click Yes | "You said yes" stays on the message, the sentence goes through the composer path, and the interview or the review card follows |
| 5.7 | Instead, type "yes please" | Identical behaviour. The buttons are not a second code path |

## 6. A ticket, and what filing it does not mean (D86/D213)

| # | Look at | Pass when |
|---|---|---|
| 6.1 | The review card | Every field that will be sent. Your details editable, the case note and category shown and fixed |
| 6.1a | Type into the name, email and "what happened" fields | **The text is in the panel's own face, at the panel's own size, and the long one is several lines tall.** The delivery draws those fields for `<div>`s and sets no `font-family`, so the first integrated build put your words in a monospace box one line high (D252 §7). A browser-default form control is the shape of that defect |
| 6.2 | `CATEGORY` and `GOES TO` (D244) | **Plain words as the value** — "needs a person", "a hardware fault" — with the stored value underneath, smaller. **No snake_case anywhere as the value itself**, and the stored value must still be legible: it is what is being sent |
| 6.3 | The caveat on the card (D246) | "This is stored for **the service desk** to pick up. No email goes out, so nobody is alerted automatically — someone has to come and look." **It must not say "the hub"** — that is our name for it, and this is the one screen where you approve data leaving the machine |
| 6.4 | Send it (D245) | The reference is spoken, and the note under it says **"Stored as MD-xxxx. The card above says what that does and does not do."** — the reference and nothing the card already said. **If the no-email fact appears twice in two wordings, that is the defect** |
| 6.5 | Watch the card's head **while** it sends (D253) | It reads **"Sending…"** first and only then the outcome. **It must never say "Sent by you" before the service desk has answered** — it did until 2026-09-11, so a send that then failed left the card claiming it had been sent, three lines above a note saying nothing was filed |
| 6.5b | The card, after a filing that worked | Still on screen, its caveat unchanged, its head now "Sent by you" |
| 6.5c | The note the card leaves where its buttons were | **"You chose to send this."** — about your DECISION, not about the outcome, because at the moment it is written the outcome is not known. **If it claims the ticket was sent, that is the defect back** |
| 6.6 | The tickets band's count | It has gone up by one |
| 6.7 | The new row in the band | Same fact as the card, in the past tense, and also not "the hub" |

## 6a. A ticket that does NOT get through (D246) — the branch nobody had run

Reaching this in the app needs a hub up enough to make the offer and down enough to refuse the
filing: **start the hub, ask for something outside the catalog, say yes, and stop the hub while the
review card is on screen.** (On `panel-check.html` there are two buttons for it — *next filing:
fails* and *next filing: times out* — which is where it was driven from.)

| # | Look at | Pass when |
|---|---|---|
| 6a.1 | What is SPOKEN | A plain sentence in Matic's voice. **No URL, no port, no "hub", no HTTP status code.** It used to say *"Could not reach the hub at http://127.0.0.1:8787: fetch failed"* out loud |
| 6a.2 | The note under it | "Nothing was filed." — the outcome, which the spoken line does not restate |
| 6a.3 | The inspector's last step | `error` AND `detail`, with the URL and the real reason in `detail`. **If `detail` is missing, the diagnostic has been lost and that is a defect, not a tidy-up** |
| 6a.4 | The developer log | The same `detail` line |
| 6a.5 | Now the TIMEOUT case instead | Spoken: uncertainty, and it must claim **neither** that it was filed nor that it was not. The note beside it carries "whether the ticket was stored is unknown" in the attention colour |
| 6a.6 | The two cases side by side | They do **not** say the same thing. "Nothing was stored" and "we don't know" are different outcomes and a user acts differently on each |
| 6a.7 | **The card's head in each case** (D253) | **"Not sent"** for the refusal, **"Sent, not confirmed"** for the timeout — and neither of them "Sent by you". The card head and the note below it now come from the same `filed` result, so **the card cannot contradict the transcript**, which is what it did until 2026-09-11 |
| 6a.8 | Cancel a card instead, and read both lines | **"Cancelled by you."** where the buttons were, and **"Cancelled — nothing left this machine."** in the transcript. They must not both state the system fact: until 2026-09-11 the first read "Cancelled by you — nothing was sent." and the two said one thing twice, adjacent (D245, D253 §5.36d) |

## 7. The two bands

| # | Do | Pass when |
|---|---|---|
| 7.1 | Open "What I can see about this machine" | Your real machine name and user, printing and sound in plain words, the adapter, and the address rows. "Checked just now" |
| 7.1a | The chevron on the trigger, open and closed | **It points the other way when the band is open.** It did not until 2026-09-10 — the September delivery keyed off a markup hook D240 removed, and only the button's highlight had been re-keyed. The re-export keys **both** the chevron and the open-state wash off `aria-expanded` (D252), which the renderer maintains for screen readers, **so what you see and what a reader announces cannot disagree** — if they ever do, the renderer has stopped setting the attribute |
| 7.1b | The glyph on each trigger | A thin-stroke monitor and a thin-stroke ticket, drawn as SVG. **Not a bordered square** — that read as a checkbox, and both triggers are `<button>`s that toggle a disclosure, not things you tick |
| 7.2 | Stop the spooler, reopen the band | It says Stopped. **The band re-reads the probe when it opens** — if it shows a stale value, that is a finding |
| 7.3 | Open "Tickets I've filed from this machine" | The tickets **this machine** filed, each saying "Filed from here / Progress not visible". The trigger used to read "Tickets you've opened"; the re-export's wording is D242's own constraint said better, since the endpoint knows what it FILED and never what a person opened elsewhere |
| 7.4 | Read the note under them | It says progress cannot be checked in this build, in the same words the spoken answer uses |
| 7.5 | Ask "where's my ticket?" | The spoken answer and the band agree. **Two surfaces describing one thing differently is the defect to look for** |

## 8. The three connection states (acceptance 8)

| # | Do | Pass when |
|---|---|---|
| 8.1 | Hub running | Rail: "Everything I need is available". No band across the top |
| 8.2 | Stop the hub, wait for the link to notice | A line in the transcript saying the connection is lost, a standing band at the top, the rail at "Working with less than usual", and the avatar at `error` if it was idle |
| 8.2a | That transcript line, word by word (D244/§5.29a) | It names **both** the company's guidance and the service desk, the way the band and the rail do. It does **not** apologise, and it does **not** say anything will "wait" — nothing is queued, so a user who stops re-asking has been misled |
| 8.3 | Ask something that needs the hub | **The reply must not contradict the band.** Both say it cannot reach the service desk. This is the 700d920 defect and it is the one to hunt |
| 8.4 | Start the hub again | "The service desk is reachable again", the band goes, the face returns to idle |
| 8.5 | Run with no hub configured at all | "Working on this machine only", grey, no warning colour. It must read as a configuration, not a fault |

## 8a. The restart signal (D256, register §5.39) — **RUN 2026-09-11 over the DevTools Protocol**

The row shows on any machine. **The recommendation does not**, because a healthy machine scores 0 or
1 and silence is the correct behaviour — so seeing the moment at all means arranging for it. Two
ways, and 8a.4 onward needs one of them:

- **Real app:** set `recommendAtScore: 1` and `uptimeElevatedDays: 1` in `client/config.json`, run,
  and **put the file back afterwards.** This is how 8a.6 was found.
- **Check page:** press `next turn: restart recommendation`, then any scenario button.

| # | Do | Pass when |
|---|---|---|
| 8a.1 | Open the machine band and find "Last restarted" | A phrase — "2 days ago", "5 hours ago", "Less than an hour ago". **Never a timestamp, a date or a number of milliseconds** |
| 8a.2 | Read the row for advice | **There is none.** It does not say the machine should be restarted, is overdue, or has been up a long time. A row that argues argues every time the band is opened |
| 8a.3 | Look for a memory figure anywhere in the band | **There is none, on purpose.** Commit charge is the most useful input in the score and is never shown as a number; it is not even in the object the renderer receives |
| 8a.4 | Arm it, then take any ordinary turn | The recommendation arrives **after** the turn's own reply, in its own message, with two buttons |
| 8a.5 | Read the sentence for the word "restart" | It says **"restart"**. It must never say "shut down", "turn it back on" or "power off" — under Fast Startup a shutdown is a kernel hibernate and **the fix does not apply**, so the other wording makes a user do the work for nothing. This is the most consequential sentence in the spec |
| 8a.6 | Check the evidence against the machine you are on | **The duration must be the real one.** This is where the defect was: the clauses were named after the DEFAULT bands, so with the band lowered the panel said *"hasn't been restarted in more than a fortnight"* about a machine up **1.35 days**. Every other copy rule passed and the evidence was false |
| 8a.7 | Read the order of the sentence | Evidence first, instruction second. *"Chrome has grown 4 GB since Tuesday and your memory is nearly full"* earns compliance in a way *"it's been a while"* does not |
| 8a.8 | Look for a button offering to do the restart | **There is none, and its absence is correct.** No capability restarts a machine — `restart_service` is a Windows service, not the computer — so a button offering it would offer something the system does not have |
| 8a.9 | Look at the composer while the choice is waiting | The hint *"Waiting on your yes or no above — or just type instead"* is **NOT** shown. Nothing reads a typed answer to this: D216's intake is not pending, so a typed "no thanks" would be routed as a fresh problem |
| 8a.10 | Press "Leave it with me" | "You said you'd leave it" replaces the buttons, on the message it answered |
| 8a.11 | Take two more turns, on different subjects | **It does not come back.** Once declined, not again this session and not for a week |
| 8a.12 | Restart the app, arm it, and press "Remind me later" instead | "You asked to be reminded later". It stays quiet for `deferHours` and may then return — a deferral the user asked for must not be silently honoured as the 24-hour suppression |
| 8a.13 | Arm it, then ask something that ends in the **ticket offer** | **No recommendation.** Two offers on one screen is how a user learns to click past both |
| 8a.14 | **[CHARLES]** Listen to it | It reads as one sentence, and the day count is spoken as a number rather than spelled out. Nothing HEARD can be checked from a session |
| 8a.15 | Open the inspector and the developer log | The score and the signal ids are there — `[restart] raised at score 2 from …` — and **nowhere a user reads**. The panel shows conclusions, not measurements |

## 8b. Memory and disk in the band (D257, register §5.40) — **RUN 2026-09-11**

Both show on any machine, unlike §8a's recommendation. On a five-volume machine the band is
**fifteen rows**.

| # | Do | Pass when |
|---|---|---|
| 8b.1 | Find the "Memory" row | It reads **"Plenty free"**, **"Filling up"**, **"Almost full"** or **"Not known"**. **Never a percentage, never a GB figure, never a digit at all** — the reading behind it is commit charge, which is the most useful input in the restart score and means nothing to a person as a number |
| 8b.2 | Check it against the recommendation, if you can get one to fire | They must agree. Both go through `memoryWords()`/the same band function, so a machine whose row says "Almost full" cannot have a sentence saying its memory is merely filling up |
| 8b.3 | Count the "Disk space" rows | **One per FIXED volume**, and no more. A USB stick or a network share must not appear; a mounted ISO must not appear |
| 8b.4 | Look for a total | **There is none, and there must never be one.** 2.9 TB free across five drives with 8 GB left on C: is a machine in trouble, and a total says the opposite |
| 8b.5 | Read a disk row | Conclusion first, figure second: **"Plenty of room — 163 GB free"**. The figure is carried here and forbidden on the memory row, and the difference is the point — "163 GB free" is something you can act on |
| 8b.6 | Check a volume sitting under 20% free but with plenty of headroom | It reads **"Plenty of room"**. On this machine C: and E: are both at 17.5% with 163 GB each, and a naive percentage rule would raise two false alarms. **If either reads "Almost full", the dual threshold has been broken** |
| 8b.7 | On the check page, look at D: and E: | The canned volumes are deliberately in three different states — "Plenty of room", "Getting full", "Almost full" — because a real machine shows one word on every drive and the other two are never seen |
| 8b.8 | Fill a drive past both floors (under 15% **and** under 25 GB) | Only then does it read "Almost full" |
| 8b.9 | Ask for a restart recommendation with a full disk | **The disk must not be a reason.** A full disk is exactly as full after a restart, and it is not in the score — if a restart sentence ever mentions a drive, something has merged two signals that must stay apart |

## 8c. The grouped band and its marks (D258, register §5.41) — **RUN 2026-09-11**

Claude Design's addition of 2026-09-11. **The groups show on any machine; the marks only show on a
machine in trouble**, so the check page is the way to see them — its canned machine has a stopped
spooler, memory at 95%, and two drives in different states on purpose.

| # | Do | Pass when |
|---|---|---|
| 8c.1 | Open the machine band | **Five named groups** — Who and where / How this machine is doing / What is running / Network / Storage — each with a small heading above its rows |
| 8c.2 | Read the headings | They are **our words**, set as `data-group` and drawn with `content:attr(...)`. If a heading ever reads like a stylesheet wrote it, something has moved in the wrong direction |
| 8c.3 | Look at Storage | One heading, the volumes compact beneath it. **No total, ever** |
| 8c.4 | On a healthy machine, count the marks | **Zero.** Not one row carries a gutter rule or a coloured value. *"A mark that says 'fine' is fifteen marks on a healthy machine"* |
| 8c.5 | Drag the window narrow | The band drops from two tracks to **one**, and the volumes with it. The flat grid never did this |
| 8c.6 | On the check page, look at the band | **Four rows marked amber** — Last restarted, Memory, Printing, and one drive — with a 2px rule in the gutter and the value in the attention colour |
| 8c.7 | Find `Disk space (D:)` — "Getting full — 40 GB free" | A **quieter grey** mark, not amber. It is worth noticing, not urgent |
| 8c.8 | Find `Disk space (C:)` — "Plenty of room — 163 GB free" | **UNMARKED.** That drive is at 17.5% free. **If it is ever amber, the dual threshold has been bypassed and the false alarm is back** — this is the single most important step in §8c |
| 8c.9 | Compare a marked row's left edge to an unmarked one | **They line up.** The gutter is always reserved, so the band does not shift when a machine goes bad |
| 8c.10 | Squint, or look in greyscale | The marks are still findable — position first, colour second |
| 8c.11 | Read a marked row's words | **They are the same words as when it is unmarked.** A mark says "this one"; it never says "do something". If the wording changes with the state, a row has started giving advice |
| 8c.12 | Look for red anywhere in the band | **There is none, and there should be none.** Nothing here is a failure of the system — a full drive is the machine's news, correctly reported |
| 8c.13 | Stop the spooler for real, reopen the band | `Printing — Stopped`, marked amber. A service the probe **cannot read** says "Couldn't read it from here" and takes the **quiet** mark, not the amber one |
| 8c.14 | Unplug the network, reopen the band | `Network` is marked. **`Network adapter` is NOT**, though it reads "None found" — marking both would say one fact twice (D245) |
| 8c.15 | Open the developer log after opening the band | A `[band]` line naming the groups, the row count and which rows are marked. On a healthy machine it says *"nothing — a healthy machine carries no mark"* |

## 9. What to write down

For anything that fails: what you did, what you saw, and what you expected. A screenshot of the
panel plus the inspector open on the same turn is worth more than a description — the inspector
holds what the panel deliberately no longer says.
