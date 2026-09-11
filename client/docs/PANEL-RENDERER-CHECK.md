# Panel renderer check — for Charles to run

**Written 2026-09-10 with the panel integration (D240–D243).** Same shape as
[`AVATAR-RENDERER-CHECK.md`](AVATAR-RENDERER-CHECK.md) and
[`D130-RENDERER-CHECK.md`](D130-RENDERER-CHECK.md): the renderer is not covered by `npm test`,
because no headless test can see a screen, so this is the list a person looks at.

**What the building session already saw, and where.** It drove the panel through
`src/renderer/panel/panel-check.html` — the real `renderer.js`, a fake bridge — and watched: the
first-run panel, the boot greeting, the consent flow end to end, the machine band, the tickets
band, the inspector overlay with its payloads wrapped, dark mode, the escalation offer answered
with its own buttons, the ticket review card, a filed ticket, a citation, and a hub transition
from reachable to unreachable. §7 of the handover says what that does and does not establish.

**What nobody has seen: the panel in Electron, against a real broker, a real probe and a real
hub.** That is this document, and it is the acceptance item the design handover refused to make
optional. Six of the last seven click-throughs on this project found something.

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
| 1.1 | The first frame after launch | No flash of a light window before a dark one (or vice versa). The window is not shown until it has painted |
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
| 3.1 | Look at the top-right of the conversation | A small crosshair. **No panel of JSON is on screen** |
| 3.2 | Click it | A drawer opens **over** the conversation, from the right, with a dimmed scrim behind it |
| 3.3 | Read the four steps | Proposed / Checked / Consent / Done, each a sentence you could read aloud to a buyer |
| 3.4 | Expand "Show the data" on each | The payload **wraps**. Nothing is cut off at the right edge, and there is no horizontal scrollbar |
| 3.5 | Expand the developer log | `[router]`, `[hub]`, `[tts]`, `[avatar]` lines — ours, and only here |
| 3.6 | Close it, look at the conversation | Nothing has moved. Nothing was reserved for it |

## 3a. Name, account and address: on screen, not in the voice (D249)

**This one needs the voice working**, so it is the check that `panel-check.html` cannot do at all —
it has no Piper, so `speak()` is never called there. Run the app on a machine whose hostname is
distinctive and **listen**.

| # | Look at / listen for | Pass when |
|---|---|---|
| 3a.1 | The machine band: "This computer", "Signed in as", "This machine's address" | Your real hostname, account and IP. **Shown is correct for all three** |
| 3a.2 | The review card's "Machine" and "OS account" rows | The same. They go on the ticket, and IT needs them |
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

## 4. A real fix, with consent (the D130 comparison, again)

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
| 6.2 | `CATEGORY` and `GOES TO` (D244) | **Plain words as the value** — "needs a person", "a hardware fault" — with the stored value underneath, smaller. **No snake_case anywhere as the value itself**, and the stored value must still be legible: it is what is being sent |
| 6.3 | The caveat on the card (D246) | "This is stored for **the service desk** to pick up. No email goes out, so nobody is alerted automatically — someone has to come and look." **It must not say "the hub"** — that is our name for it, and this is the one screen where you approve data leaving the machine |
| 6.4 | Send it (D245) | The reference is spoken, and the note under it says **"Stored as MD-xxxx. The card above says what that does and does not do."** — the reference and nothing the card already said. **If the no-email fact appears twice in two wordings, that is the defect** |
| 6.5 | The card, after sending | Still on screen, its caveat unchanged, its heading now "Sent by you" |
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

## 7. The two bands

| # | Do | Pass when |
|---|---|---|
| 7.1 | Open "What I can see about this machine" | Your real machine name and user, printing and sound in plain words, the adapter, and the address rows. "Checked just now" |
| 7.1a | The chevron on the trigger, open and closed | **It points the other way when the band is open.** It did not until 2026-09-10 — the delivery's rule keyed off a markup hook D240 removed, and only the button's highlight had been re-keyed |
| 7.2 | Stop the spooler, reopen the band | It says Stopped. **The band re-reads the probe when it opens** — if it shows a stale value, that is a finding |
| 7.3 | Open "Tickets you've opened" | The tickets **this machine** filed, each saying "Filed from here / Progress not visible" |
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

## 9. What to write down

For anything that fails: what you did, what you saw, and what you expected. A screenshot of the
panel plus the inspector open on the same turn is worth more than a description — the inspector
holds what the panel deliberately no longer says.
