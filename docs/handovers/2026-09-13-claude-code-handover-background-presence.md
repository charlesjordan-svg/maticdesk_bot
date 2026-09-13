# Claude Code handover — background presence: the agent minimises to the tray and keeps working

**Date:** 2026-09-13
**Written by:** a Cowork session, from the working tree on `wakanda` (read-only) and the register.
**Answers:** **D292** — the founder's call, open since plan v3 §5.5 and restated with evidence in
`docs/handovers/2026-09-13-autoclose-delivery-gap-and-background-mode.md` §3.
**Charles, 2026-09-13:** *"yes build the Tray + background mode. The Agent will minimize to the task
tray. Options should include toggle to Start with Windows."*
**Numbering:** the register stands at **D292**; next free is **D293** — confirm against the
register's own header before you take one, and update that line in the same pass (§5.60's own note
says the procedure keeps failing there).

---

## 0. The decision, and what it is not

**D292 is ANSWERED: the endpoint keeps running when its window is closed.** Closing the window
minimises the agent to the Windows notification area; the hub link and the ticket poll keep running;
quitting is a deliberate act from the tray. **Start with Windows is a user-visible toggle, ON by
default** — Charles's call, recorded as his in §7.

What this pass is **not**: it is not the panel's ticket timeline (Claude Design's brief, still
Charles's to send), not D251's toast, and not D86's email. Those stay where they are. §5 says why the
toast is deliberately out of scope.

---

## 1. Why this exists — the one-line version, verified today

`client/src/main/main.js`, line 413, read 2026-09-13:

```js
app.on("window-all-closed", () => {
  hubLink?.stop();
  ticketWatch?.stop();
  tts?.stop();
  if (process.platform !== "darwin") app.quit();
});
```

`ticketWatch?.stop()` is the whole problem. **D250** chose in-app notification over email on the
argument that the agent already lives on the user's screen; **P4** built delivery on a poll the
endpoint makes; **P5** built auto-close on a clock; **D290** made that clock wait for evidence of
delivery. Every one of them terminates at a process that exits when someone clicks the X. D290 means
an undelivered resolution no longer closes wrongly — it means the ticket sits, re-arms three times,
and then lands on the console's "Resolved, never delivered" list for a human to chase by some other
channel. Honest, and not a service desk.

**Also verified today:** there is no `Tray` anywhere in `client/src` and no `setLoginItemSettings`.
The only mentions of a tray are comments in `src/renderer/avatar/avatar-model.js` describing a
tray-dot state mapping the design specified and nothing ever called. There is no `second-instance`
handler and no single-instance lock.

---

## 2. What to build

### 2.1 The decisions live in a pure module, not in `main.js`

`main.js` is 23 KB and **has no test file** — there is no `test/main.test.mjs`. This repo's answer to
that is already established: `restart-signal.js`, `disk-space.js` and `state-words.js` are pure, so a
test can drive machines and states that do not exist, and the Electron layer is thin wiring.

Do the same here.

- **`client/src/main/presence.js` (new, pure).** Given the inputs — is a window visible, what does
  `hub-link` say, how many desk entries has `ticket-watch` seen but not shown, has the first-close
  notice been shown before — it returns **what the tray icon should be, what its tooltip says, what
  the menu contains, and whether the first-close notice fires**. It imports nothing from Electron.
- **`client/src/main/settings.js` (new).** The main process's own small JSON store in Electron's
  per-user `userData`, beside the profile — **not inside `src/profile/profile.js`**, which is D215's
  self-asserted *identity* file and has a completely different meaning; putting a machine preference
  in it would be the same category error as the ticket store growing a query against
  `control.devices`.
- **`main.js` wires them and holds no policy.** A test should be able to state every tray outcome
  without launching Electron.

### 2.2 Lifecycle

| Behaviour | Requirement |
|---|---|
| Closing the window | **Hides it. Does not quit.** `window-all-closed` stops nothing except the voice (§2.4). |
| Quitting | Only from the tray menu's **Quit Matic Desk**, or the OS killing it. Use the standard `isQuitting` flag so `close` hides while `before-quit` lets the real exit through. |
| Reopening | Clicking the tray icon shows and focuses the window; a second click on a visible window does nothing (do not toggle-hide — a user clicking an icon expects the app, not a coin flip). |
| **A second launch** | **`app.requestSingleInstanceLock()` and a `second-instance` handler that shows the existing window.** This is not optional now: with autostart ON, the app is already running when the user double-clicks the desktop icon, and today that starts a second one. Neither exists in the tree. |
| First close, once ever | A one-time notice — *"Matic Desk is still running in the notification area so it can bring you updates from the service desk. Quit it from there when you want it gone."* Shown once, remembered in `settings.js`, silent afterwards. **An app that silently refuses to exit is an app people uninstall.** |

### 2.3 Start with Windows

- `app.setLoginItemSettings({ openAtLogin })`, stored in `settings.js`, **default `true`**.
- A **checkable item in the tray menu** — "Start with Windows" — is the Options surface for this
  pass. §5 says why it is not a settings screen in the panel.
- **The OS wins a disagreement, and this is the trap worth writing down.** If the stored setting says
  `true` and the OS says the login item is absent, **the user turned it off in Task Manager's Startup
  tab**, which is a decision — not drift to be corrected. Read the OS state at startup; where they
  disagree, adopt the OS's answer and update the store. An app that silently re-adds itself to
  startup every launch is one a customer's security team will find, and they will be right.
- Autostart launches the app **to the tray, with no window** — the point is presence, not a window
  appearing at every logon. That means the startup path must not assume `mainWindow` exists.

### 2.4 What the background process may and may not do

| | |
|---|---|
| Keeps running | `hub-link`'s health poll, `ticket-watch`'s ticket poll (60 s, 30 s floor — unchanged; do not add a background interval without a decision), the enrollment credential, the egress log. |
| **Never happens with no visible window** | **Speech.** `tts` stops on hide and only resumes with the window. D288 is show-only anyway; a voice from an invisible process is the single worst thing this feature could ship. Make it structural, not a habit — the check belongs in `presence.js`'s returned state, not in a comment. |
| Also never | Native OS notifications (D251 chose against them and nothing here revisits that), and anything that steals focus. |

### 2.5 The tray icon — three states, and never a fourth

Use the mapping `avatar-model.js` already exports (it was written "so the day one exists"), narrowed:

| State | When | Why this one |
|---|---|---|
| **idle** | running, hub reachable, nothing unread | the default, and it says nothing |
| **needs you** | one or more desk entries the endpoint has received and not yet shown | this is the whole feature: the reason to be in the tray at all |
| **unreachable** | `hub-link` says unreachable | the user should be able to tell "quiet" from "cut off" without opening anything |

**No "working" state and no "fine" state.** A mark that says *fine* is noise — the machine band's
own argument (§5.41: *"a mark that says 'fine' is fifteen marks on a healthy machine"*), and
"working" is rarely visible long enough to read. The tooltip carries the words; the icon carries the
state. **The icon may never claim something the app cannot back** — if the poll has not run since the
app woke, the state is not "idle", it is whatever the last real answer was.

---

## 3. The copy pass — the most likely place this goes wrong

**Every string that says the agent only works while it is on screen becomes FALSE the moment this
ships.** The panel's own line today is *"I check every minute or so **while I'm on screen**"*, and
today it is true. This project's signature defect — four entries in the register with the same shape,
D272 through D274 most recently — is copy that outlives its premise, and this feature changes the
premise for a whole family of strings.

So:

1. **Sweep first, before writing new copy.** `client/src` for "on screen", "while I'm open", "while
   the app is open", "not email", "open and polling" — and the console's "Reply to requester"
   composer, which says the requester sees a reply *only while their Matic Desk app is open and
   polling*. That sentence is hub-side (`server/src/admin/pages/tickets.js`) and it is now wrong in a
   way that **overstates the limitation**, which is the rarer and better kind of wrong — but it is
   still wrong, and the desk reads it.
2. **Rewrite each one to the new premise, and only after the behaviour is real.** Never the other way
   round: that is precisely D274's rule, and §2.3 of the P3b handover records what happens when copy
   moves first.
3. **A detector, in the D274 shape** — the one part of this handover that will still be earning its
   keep in six months. Point a structural test at `main.js`: if `window-all-closed` ever again quits
   unconditionally on non-darwin, **fail with a message naming D292 and the copy that depends on it**.
   Prove it in both directions, as D274 was.

---

## 4. Tests, and what is falsifiable

The client suite is at **2056 assertions across 26 files** (confirm before you start). Your number
must go up, and nothing may be quarantined.

1. **`test/presence.test.mjs` (new).** Every tray state from constructed inputs, including: unread
   goes to zero when the window is shown; unreachable outranks unread; the first-close notice fires
   exactly once across two closes; no state is produced for "working" or "fine".
2. **Settings.** Default is `openAtLogin: true` on a fresh profile; the toggle writes and applies; a
   stored `true` with the OS saying absent resolves to **off, stored** (§2.3's trap), with a test
   that would fail if the app re-asserted itself.
3. **Speech.** A test proves nothing can be spoken while no window is visible.
4. **The D292 detector** (§3.3), proven both ways.
5. **Copy.** Extend whichever existing suite pins panel strings (`panel.test.mjs` / `persona.test.mjs`)
   so the old "while I'm on screen" claim cannot come back while background mode is on.
6. **Both server suites stay green** — this pass should not touch them except the one console string
   in §3.1, which `admin-db` or `admin-static` will have pinned.

**And then the part no test can do — the Electron click-through**, in the house form
(`client/docs/PANEL-RENDERER-CHECK.md`, driven over CDP as every click-through on this project has
been). Falsifiable list:

- Close the window → the process survives, the icon appears, the one-time notice appears **once**.
- **With the window closed**, have the desk reply from the console → the tray goes to *needs you*
  within one poll, **and nothing is spoken**. Open the window → the reply is there, the tray returns
  to idle.
- Resolve a ticket with the window closed, then open it → the resolution is shown and D290's clock
  arms on the ack rather than the backstop firing. **This is the Friday/Tuesday scenario ending the
  way it should**, and it is the proof the feature works.
- Stop the hub → tray goes *unreachable*; start it → back to idle.
- Tray **Quit** → the process is gone (check the process list, not the icon).
- Launch a second instance → the existing window shows, no second process.
- Toggle Start with Windows off → the login item is gone from Task Manager's Startup tab; on → back.
- Screenshots into `docs/handovers/screenshots/2026-09-13-background-presence/`, and **look at them**.

---

## 5. Two scope decisions this handover makes, so you do not have to

**5.1 The toggle lives in the tray menu, not in a settings screen in the panel.** The panel is Claude
Design's delivery (D240/D241) and inventing a settings surface in `matic-panel.app.css` is the exact
inversion D241 exists to prevent — the app drawing a screen and asking Design to match it. A tray
menu is main-process chrome, not the panel, so it ships without a Design round trip. **If Charles
wants a settings screen in the panel later, that is a Design brief**, and it should be written as one.

**5.2 D251's toast is out of scope this pass.** The toast was specified as the product's own
always-on-top window plus `flashFrame()` — and with no window open there is nothing to flash. Making
the toast work from the tray is a real design question (does a hidden window become the toast host?),
and the tray's *needs you* state covers the same need honestly in the meantime. **Record the question,
do not answer it in code.**

---

## 6. Register

- **D292 becomes DECIDED**, with Charles's words as the source. Same ID — nothing about the question
  changed, only that it was answered (the D242/D248 precedent: no new ID on an answer alone).
- **New IDs from D293** for what the answer adds: minimise-to-tray and the process lifetime; the
  **Start with Windows toggle, ON by default**; the three tray states; and the first-close notice.
  Group them as one section with one forcing reason.
- Update the "next free ID" line **in the same pass**.
- Say, in the D293 row, what §7 below says: the default is the founder's, and it is reversible.

---

## 7. Recorded honestly, because it will be asked about in a security review

**Start with Windows defaults to ON, and that is Charles's decision, made on 2026-09-13 against the
recommendation in the session that proposed this work** (which was: ship the tray, leave autostart
off, decide it with a real customer in the room). It is recorded this way so that when a design
partner's security team asks why an agent adds itself to startup, the answer is a decision with a
name and a date rather than an engineering default nobody chose.

What makes it defensible — and what this pass must therefore deliver rather than treat as polish: the
toggle is **visible in the tray menu**, the OS's answer **wins** if the user disables it in Task
Manager (§2.3), the first-close notice tells the user the app is still running the first time it
happens, and quitting is always one click away. A background agent that is honest about being one is
a different product from a background agent that hides.

**Also still true after this ships, and worth one line in the handback:** a user who is signed out,
or whose machine is off, still receives nothing — this raises delivery from *while someone is
looking* to *while the machine is on and they are signed in*, which is most of the gap and not all of
it. **D86's email remains required for the IT-facing half**, which no endpoint channel can ever reach.

---

## 8. Definition of done

1. Closing the window keeps the agent running; the ticket poll delivers a desk reply to a closed
   window and the tray says so; quitting from the tray really quits.
2. Start with Windows is on by default, toggleable from the tray, and the OS wins a disagreement.
3. Nothing is ever spoken with no visible window, and a test proves it.
4. The D292 detector exists and has been seen failing.
5. Every string that claimed the app only works while open has been found and rewritten — **after**
   the behaviour changed, never before.
6. Client suite green and above 2056; both server suites green.
7. The Electron click-through in §4 is run, screenshotted and looked at, with the Friday/Tuesday
   scenario ending correctly.
8. Register updated (D292 DECIDED, D293+ taken, next-free line fixed); handback written in the house
   form with an honesty ledger.

---

## 9. Verification register

| Claim | How known |
|---|---|
| `main.js`'s `window-all-closed` handler, verbatim, including `ticketWatch?.stop()` | **Read 2026-09-13** |
| No `Tray` and no `setLoginItemSettings` anywhere in `client/src`; the only tray mentions are comments in `avatar-model.js` | **Searched 2026-09-13** |
| No `test/main.test.mjs`; the client suite is the 26 files in `client/test/` | **Listed 2026-09-13** |
| Theme and the greeting cursor persist in the renderer's `localStorage`; `profile.js` is D215's identity file and holds no preferences | **Read 2026-09-13** |
| No single-instance lock and no `second-instance` handler | **Searched 2026-09-13** |
| Client at 2056 assertions; poll 60 s with a 30 s floor; D290's backstop at three intervals | **Quoted from the P4/P5 and click-through handbacks — re-measure before relying on them** |
| That autostart-on-by-default will draw a security-review question | **Judgement, not a finding.** No design partner has said so; Q9 is still unanswered |
| Any effort or duration | **None is offered.** Nothing here has been built or measured |
