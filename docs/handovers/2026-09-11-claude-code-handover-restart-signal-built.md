# Claude Code handover — the restart signal, BUILT

**Answers** [`2026-09-11-claude-code-handover-restart-signal.md`](2026-09-11-claude-code-handover-restart-signal.md).
**Source** `research/2026-09-11-endpoint-telemetry-spec.md`, now filed in the repo — it was in
`Downloads`, not at the path the handover cited, so nothing in the code could have resolved a
citation to it.

**Decision:** D256, register §5.39 (v2.41). **Tests:** 1498 assertions across 19 files, up from
1202 / 18; `client/test/restart-signal.test.mjs` is new (293) and **is the acceptance list, in
order**. **Docs:** `client/docs/RESTART-SIGNAL.md`, and §8a of
`client/docs/PANEL-RENDERER-CHECK.md`, which was run.

---

## 1. What was built

| File | New? | What |
|---|---|---|
| `client/src/broker/win32/sysinfo.js` | **new** | the native readings — boot instant, three pending-reboot flags, commit charge, `Memory Compression`, Events 27 and 1074 |
| `client/src/agent/restart-signal.js` | **new** | pure: the thresholds, the score, the row's phrase, the sentence, the anti-nag gate |
| `client/test/restart-signal.test.mjs` | **new** | the acceptance list, the score table, and one live read of this machine |
| `client/src/broker/capabilities/index.js` | edited | `probeMachine()` carries `restart` |
| `client/src/agent/agent.js` | edited | the row on `panel`, the moment on a provoked turn, `answerRestartMoment()` |
| `client/src/renderer/renderer.js` | edited | the row, the moment, the two-button choice |
| `client/src/main/main.js`, `preload.cjs` | edited | the policy from config, the `restart:answer` channel |
| `client/config.json` | edited | `restartPolicy` + `_restartPolicyNote` |
| `client/src/renderer/panel/panel-check-bridge.js`, `panel-check.html` | edited | the branch is drivable on the check page |
| `client/docs/RESTART-SIGNAL.md` | **new** | the feature, the unvalidated thresholds, what is not built |

---

## 2. The acceptance list, item by item

| # | Criterion | Where |
|---|---|---|
| 1 | Uptime from `LastBootUpTime`; a test pins that no tick counter is used | **met, and exactly** — see §3 |
| 2 | An empty `TickCount64` cannot produce an uptime of zero | **met, carried to where the defect lives** — see §4 |
| 3 | `PendingFileRenameOperations` alone cannot recommend | met; 5 assertions, two of which move the threshold and the weight |
| 4 | No `Get-Counter`; no `.ps1` written or executed | met, and stronger: **no shell at all** (`win32/*`'s own rule) |
| 5 | Commit charge collected, never rendered as a number | met **structurally** — it is not in the object the renderer receives |
| 6 | Thresholds configurable and documented as unvalidated | met; `config.json`, and 4 assertions on the note's content |
| 7 | The row reads plainly and carries no advice | met; 14 assertions, including an advice-vocabulary scan |
| 8 | The moment says "restart", leads with evidence, offers to schedule, does not repeat once declined | met — and **§6 is where all four defects were** |
| 9 | Nothing reads the consent store | met; 42 assertions (6 patterns × 7 files) plus "exactly three registry keys" |
| 10 | `npm.cmd test` green | **19/19 files, 1498 assertions** |
| 11 | One commit, named files | done |

**One correction to the handover's own numbers.** §7.10 gives the floor as "869 assertions across 16
files". The actual floor on 2026-09-11 was **1202 across 18**, which is what `CLAUDE.md` recorded and
what the tree was at. The higher figure is the one that was held.

---

## 3. It reports `LastBootUpTime` exactly, and that was measured rather than assumed

The repo forbids `powershell.exe` in `src/broker/win32/*` — "no cmd.exe, no powershell.exe, no
`sc.exe`, no encoded command strings; that is the behaviour EDR flags" — which is stricter than §6 of
the handover and rules out reading the WMI property the way the spec did. So the collector reads
`NtQuerySystemInformation(SystemTimeOfDayInformation)`.

**That is not the same number as WMI's, and `BootTimeBias` from the same struct is exactly the
difference.** To the millisecond, on this machine:

| Source | Epoch ms | |
|---|---|---|
| `SystemTimeOfDayInformation.BootTime` | 1788996032136 | 23:20:32.136Z |
| − `BootTimeBias` | − 7636 | |
| = | **1788996024500** | **23:20:24.500Z** |
| `(Get-CimInstance Win32_OperatingSystem).LastBootUpTime` | **1788996024500** | **23:20:24.500Z** |

An exact match off one machine is a strong claim, so it was checked from a third direction — and the
third source **resolves which value is which** rather than merely agreeing:

| | ms |
|---|---|
| `GetTickCount64()` | 115653312 |
| uptime from the **raw** `BootTime` | 115652828 (**+484**, call latency) |
| uptime from the **corrected** value | 115660464 (−7152) |

**The raw value is the origin the tick counter measures from; `BootTime − BootTimeBias` is
`LastBootUpTime`.** Both are kept (`bootTimeMs`, `kernelBootTimeMs`) so they cannot be silently
conflated, and the measurement is written into the file so it can be re-derived.

**`[VERIFY]`, and it is in §10.2: one machine, one day.** Nothing depends on it being exact — 7.6
seconds against thresholds of 14 and 30 days and a row reading "2 days ago" is a row seconds out,
not a wrong recommendation.

**And there is no tick counter anywhere**, which a test pins. `GetTickCount64()` natively has neither
of the spec's problems and is still not used, because an absolute instant is strictly better than an
interval: it is what the spec's primary source reports, it can be shown, and it cannot be mistaken
for a duration.

---

## 4. Acceptance 2, carried to where the defect actually lives

This build never reads `[Environment]::TickCount64`, so the literal criterion has nothing to attach
to. **The defect it describes is general and is what was pinned instead:** a value that could not be
read must never become a number.

- Every function in `sysinfo.js` returns `null` — never a zero, an empty string or a `false`. The
  boot reader also rejects a zero, an epoch value and a boot in the future explicitly.
- `scoreRestart()` turns `null` into no contribution plus an id in `unknown`. It is never read as
  healthy.
- The row reads **"Not known"**, never "Less than an hour ago" — an unreadable probe rendered as a
  fresh restart is the same defect one surface along.
- A real uptime of zero is still a legitimate reading and still reports as one.

Twenty-one assertions over seven shapes of missing value, including `""` — the shape the PowerShell
property actually returned.

---

## 5. Two of the spec's own measurements are corrected

Both fell out of doing it natively rather than from looking for them.

- **The event-log query is not slow.** The spec's §7 says every probe returned well under a second
  *"except the event-log query"*. As a targeted XPath, reverse direction, one event
  (`EvtQuery`/`EvtNext`/`EvtRender`): **1.2 ms** for Event 1074 and **5.9 ms** for Event 27. The cost
  the spec measured belongs to walking the log, not to reading from it.
- **The pending-reboot registry reads need no elevation.** The spec expected them to. Both HKLM
  key-presence reads and the `Session Manager` value read worked from an unelevated process — as did
  every other reading in the collector.

All six readings together: **24–28 ms**, against the spec's "well under a second" bar and its 5–15
minute cadence. Nothing is cached, because the spec's own session lost its connection mid-probe and a
collector that depends on having run before reports nothing after a reconnect.

---

## 6. THE DEFECTS, and all four were mine

**Found by driving the real panel in Electron, not by reading the code.** Eight straight
click-throughs on this project have now found something.

The evidence clauses were constants named after the **default** bands — *"in over a month"*, *"in
more than a fortnight"*. The bands are configurable defaults **a tenant is meant to move.** With
`uptimeElevatedDays` lowered to 1 so this machine would fire at all, the panel said:

> *"This computer hasn't been restarted in more than a fortnight."*

about a machine that had been up **1.35 days**.

Every copy rule passed. It said "restart". It led with the evidence. It offered to come back. **The
evidence was simply false** — and it is the half of the sentence the spec says earns compliance, so
it is the half that must not be wrong.

**Two acceptance criteria were quietly in conflict** — §7.6 says the thresholds must be configurable,
§7.8 says the sentence must lead with the evidence — and a constant cannot satisfy both. The fix
splits them:

- **the configured band decides WHETHER to speak** (unchanged);
- **the reading decides HOW IT IS DESCRIBED.** Uptime says how long it has actually been, from the
  same `durationWords()` the row uses — so the band and the recommendation cannot describe one
  machine two ways, which is D242's rule one surface over. Memory is described from where the real
  fraction sits, in fixed descriptive words, which is also why no figure is needed.

Pinned by five assertions plus the 1.35-day case itself, and §8a.6 of the click-through is the step
that finds it again.

**Three more, all found the same way — by printing the generated sentence for each combination
rather than by reading the table that produces it.** None would have failed a test that existed at
the time, which is the point:

1. *"Windows is waiting for a restart to finish installing an update. **Restarting it would clear
   that up.**"* — the same thing twice, the second time in weaker words. That branch has its own
   instruction clause now: *"Restarting now is what lets it finish."*
2. **The signal that fires alone was reported last.** Clauses are ordered by weight so the strongest
   reason leads, and the pending-update flag carries weight **0** — precisely because it does not
   need one, since Windows is saying outright that it is waiting. So sorting by weight buried the
   most decisive evidence at the end of the list, behind uptime and memory, and dragged the weaker
   instruction clause back with it. It now carries `leads`, which is the one contribution whose
   position is not a function of its score.
3. **A capital letter mid-sentence.** *"…installing an update, **T**his computer hasn't been
   restarted in 40 days"* — because every clause was written ready to lead, and which one leads
   depends on the score. Clauses are stored in non-leading form now and `restartSentence()` raises
   the first character of whichever ends up first, which is also correct for "Windows": a proper
   noun stays capitalised wherever it sits.

All three are pinned, and the generated sentence for each shape is printed by the test file so the
next person reads what a user would read rather than inferring it.

---

## 7. What the moment can honestly offer

The spec's third copy rule is *"offer to schedule it"*. **No capability in this build restarts a
machine** — the catalog's `restart_service` is a Windows service, not the computer. So the offer is
**to raise it again at a better time, or to leave it with you**, and:

- the sentence never implies a restart has been booked (which would be the class of defect D213 spent
  five surfaces avoiding);
- **there is no button offering to perform one**, and its absence is the honest shape rather than an
  omission;
- the answer goes down its own channel (`restart:answer`) and **not** through `submit()`, because it
  is a decision and not a sentence for the router;
- **the choice does not set `data-offer="pending"`.** That attribute lights the composer's hint
  *"Waiting on your yes or no above — or just type instead"*, and the second half would be a lie —
  D216's intake is not pending for this, so a typed "no thanks" would be routed as a fresh problem
  statement, the exact defect (`3d1992e`) the intake exists to prevent.

**The anti-nag gate** adds the clause the spec does not state: **once declined, not again this
session, and not again for a configurable period.** `declinedForSession` is separate from the
timestamp on purpose, so a clock that moved — in either direction — cannot argue it away. The gate
never raises anything; it only answers "may this be said", and the moment rides on a turn the user
started (D198). It is attached after the intake's early returns, so a turn answering *"and your last
name?"* carries none, and the renderer drops it on a turn that ended with the ticket offer waiting
or a turn that threw.

---

## 8. Design: the handover is held, on purpose

The previous draft assumed the panel would grow from eight rows to about fourteen. **With camera and
microphone out and memory never rendered, this pass adds ONE row**, and a test asserts the count is
nine. Nine is not obviously a different layout from eight, and Charles's instruction was *"format for
best readability"* — a judgement Design cannot make about rows that do not exist.

The question is recorded rather than sent: **what happens to this panel when it reaches roughly a
dozen rows, and does it want grouping or severity?** It goes when there are enough rows to answer it
against something real.

---

## 9. Verified, and how

**Headless:** 19/19 files, 1498 assertions. `restart-signal.test.mjs` also reads THIS machine and
prints what it found, so the numbers below are reproducible by running it.

**In Electron, over the DevTools Protocol** (the D254 method: `--remote-debugging-port`,
`Runtime.evaluate`, `Page.captureScreenshot`), against the real broker and the real probe, with the
policy temporarily lowered and restored. **23 checks:** the row from the real probe, nine rows and no
commit figure anywhere, the band open by computed `display` rather than by an attribute, the sentence
on screen, both buttons, **no button offering a restart**, the composer hint correctly absent, the
decline recorded on the message it answered, and **no recurrence over two further turns** — the
second of which raised a consent card, confirming the two surfaces do not collide.

**Measured on this machine, unelevated, 2026-09-11:**

| Reading | Value |
|---|---|
| `LastBootUpTime` | `2026-09-09T23:20:24.500Z` — exactly WMI's |
| CBS / Windows Update flags | `false` / `false` |
| `PendingFileRenameOperations` | **1 entry** — a staged `gamingservicesproxy` DLL, on a machine needing nothing |
| Commit in use | 72–74% of an 83.9 GB limit |
| `Memory Compression` | 4.4 GB = **13.8%** of physical — just under 15%, so it does not score |
| Event 27 boot type | `0` (Fast Startup disabled here) |
| Event 1074 | `TrustedInstaller.exe` — a Windows Update reboot |
| all six readings | **24–28 ms** |
| **score** | **1 of 3 — stay silent** |

**That last line is the design working.** A naive pending-reboot rule would have recommended a
restart on this machine, and it needed nothing.

**And the process walk checks itself.** `Memory Compression`'s working set comes from raw byte offsets
into an undocumented structure; a moved field would not crash, it would return a plausible number —
register §10.5's class of failure. So `K32GetPerformanceInfo` supplies a process count from a
different kernel call and the walk must match it (623 = 623, 614 = 614, 604 = 604 across runs). On
disagreement it returns null.

---

## 10. Honesty ledger

- **Every finding in the spec is one machine on one day**, and so is every measurement added here —
  the same machine, in fact. A workstation with 32 GB of RAM, a discrete GPU and five volumes, not
  the fleet this ships to.
- **Every threshold is an unsourced proposal.** The spec says so of itself. What would validate them
  is named and not done: scoring recommendations against whether the restart actually resolved the
  ticket. **A changed number is a changed guess.**
- **Event 27's `0x1` and `0x2` are still unverified**, and the Fast Startup question behind them is
  the reason the feature exists. Only `0x0` has ever been observed, and only on machines with Fast
  Startup disabled — the spec's and this one, checked the same day, also `0`. **Also still untested:
  whether `LastBootUpTime` resets across a Fast Startup shutdown**, which decides whether Event 27 is
  a supplement to it or a replacement for it. Settling both needs one machine with Fast Startup on.
- **The `BootTimeBias` identity is one machine, one day**, to the millisecond. It is an identity in an
  undocumented structure and a hypothesis anywhere else.
- **The gate is in memory.** "Not again this session" is exact; the longer window holds only while
  the process lives. Persisting it needs a store that does not exist for the purpose. The gap is
  narrow — a user who takes the advice restarts the machine and the signal goes with it.
- **The recommendation has never fired on a machine that genuinely earned it.** Every sighting used a
  lowered threshold or canned data, because this machine scores 1. The scoring is tested against
  fictional machines; the *judgement* that score 3 is the right line is untested against anything.
- **Nothing HEARD was checked** — §8a.14 is Charles's, like §3a. The sentence was read on screen and
  the day count confirmed as a numeral; whether Piper says "forty days" cleanly is unknown. The
  driver ran with `voiceEnabled: false` so `say()` would not block on a minute of audio.
- **`Memory Compression` at 13.8% did not score**, so the one signal whose threshold this machine sits
  closest to has never been seen to fire either.
- **Camera, microphone, disk, VRAM and per-process history are deliberately absent**, each for a
  different reason; register §5.39i and `RESTART-SIGNAL.md` §7 say which.
- **One commit, named files.** Charles clicks it through.

---

## 11. Follow-up the same day: the boot-type [VERIFY], narrowed as far as a machine can take it

§10 lists Event 27's `0x1` as open. Before assuming that needed a reboot, the **whole retained
history** was read rather than the newest event — `client/scripts/verify-boot-type.mjs`,
`npm.cmd run verify:boot-type`, read-only, and it turns nothing on.

**81 boot events retained here, 2026-07-16 to 2026-09-09, every one `0x0`.** So `0x0` = full boot is
corroborated **81 times rather than once**. And the log carries the control the test needs: three of
the last twelve Event 1074s are a genuine *shut down* or *power off* rather than a restart — the only
actions that could produce a hybrid boot, since a restart is a full boot whatever the setting — and
every boot after them is still `0x0`, which is exactly what `HiberbootEnabled = 0` should mean.

**`0x1` and `0x2` remain unobserved, and a session cannot settle them — structurally, not for want
of effort.** A hybrid boot needs a **power-off followed by a power-on**, and nothing runs between the
shutdown and the hand that presses the button. So the script does the two halves a machine can do —
state before, verdict after — and prints the four-step procedure, which turns this from a note
nobody acts on into two minutes for anyone with a Fast Startup machine.

**Read two things off that second run, and the second is the one that decides the design:** the new
`BootType`, and **whether `LastBootUpTime` moved**. If it did not, uptime survives a Fast Startup
shutdown, a machine someone powers down nightly still looks weeks old to the score, and Event 27 is a
**replacement** for the uptime reading rather than a supplement to it.

**The script deliberately does not offer to turn Fast Startup on.** That changes how a machine shuts
down, and it is its owner's call.

---

## 12. Follow-up: disk per volume, and memory as a conclusion (D257, register §5.40)

Charles, looking at the shipped band: *"Where is the info for memory, hard drives space. was it not
included in this handoff"*. **They had different instructions, and both were his.**

- **Memory was built, scored and deliberately invisible.** §2c of the handover was headed *"Memory —
  collected, never rendered"*, §1 said a measurement can be collected without being displayed, and
  acceptance 5 required it never appear as a number.
- **Disk was excluded outright** — not in §2's "what to build" at all, and §8's ledger said so.

He reversed both, each in the narrower of the two ways offered.

### Memory is a row of WORDS, and acceptance 5 is narrowed rather than broken

`Memory — Plenty free` / `Filling up` / `Almost full` / `Not known`. **The figure is still forbidden
on every user surface and is still absent from the object the renderer receives** — what changed is
that the panel now says what the figure MEANS, which is what *"the panel shows conclusions, not
measurements"* positively asks for. A test asserts the row carries no digit at all.

It goes through `memoryWords()`, and **`memoryBand()` is now one exported function that both the row
and the recommendation's sentence read**, so they cannot disagree at a boundary. That immediately
surfaced a contradiction latent in D256: the scoring bands are configurable and the descriptive ones
are not, so a tenant who sets `commitElevatedFraction` to 0.5 makes a 60%-committed machine SCORE
while the row honestly reads "Plenty free". Rather than invent a clause that contradicts the row,
`EVIDENCE.commit` returns **null** below the descriptive bands — the contribution still counts and
names no evidence, and `restartSentence()` drops clauseless contributions.

### Disk is NOT a restart signal, and four structural checks keep it that way

**A full disk is exactly as full after a restart**, and the spec's §6 score table does not list it.
Rolling it in would produce the most useless recommendation this product could make. So:

- `probeMachine()` returns `volumes` in a **separate field** from `restart`, and a test pins the pair;
- `src/agent/disk-space.js` imports nothing from `restart-signal.js`, and vice versa;
- the disk module contains no `score`, `weight` or `recommend`;
- `scoreRestart()` is asserted to return an **identical score** with and without full disks.

A comment saying "don't" is not a check.

### The dual threshold earns itself a second time

Flag only when free space is below **both** 15% and 25 GB. Re-measured here, the spec's finding
holds exactly:

| Volume | Free | % free | naive <20% | dual threshold |
|---|---|---|---|---|
| C: | 163 GB | 17.5% | **FIRES** | quiet |
| D: | 414 GB | 22.4% | quiet | quiet |
| E: | 163 GB | 17.5% | **FIRES** | quiet |
| F: | 1659 GB | 44.5% | quiet | quiet |
| G: | 501 GB | 26.9% | quiet | quiet |

**Two false alarms on a healthy machine**, from the rule everybody writes first. The inverse is
tested too: 24 GB free on a 3.7 TB disk **is** flagged. This is `PendingFileRenameOperations` one
signal along.

**Per volume, never aggregated** — no `reduce`, no `+=`, and a test says so. The conclusion leads and
the figure follows, and the figure is exactly where disk differs from memory: *"163 GB free"* is
actionable, *"commit charge 68.8%"* is not.

### Verified

**1593 assertions across 20 files**, up from 1498/19; `disk-space.test.mjs` is new (65). Driven in
Electron against the real probe: **28 checks, 15 rows on screen**, memory reading "Plenty free" with
no digit, five disk rows each a conclusion plus a figure, and no aggregate row.

### THE DESIGN HANDOVER IS NOW WARRANTED

§5.39k held it because nine rows is not obviously a different layout from eight, and recorded that
the question — *what happens to this panel at roughly a dozen rows, and does it want grouping or
severity?* — goes **when there are enough rows to answer it against something real.**

The band is now **fifteen rows on this machine**, and the count is a function of the machine rather
than of the design: a two-volume laptop gets twelve, a five-volume workstation fifteen. The
delivery's two-column grid absorbs them and nothing is broken — but five near-identical rows reading
"Plenty of room" is precisely the case the question was recorded for. **That handover is the next
thing to write, and it now has real rows to argue about.**

---

## 13. Claude Design answered, and both stages are integrated (D258, register §5.41)

Charles sent the brief of §5.40e and Claude Design answered **the same day**. Charles: *"integrate
both stages together."* Done.

### The delivery cleared the buildability bar on the first try — the second time running

| | current before | delivery |
|---|---|---|
| `class=` attributes | 515 | **524** |
| inline `style=` | 36 | **36** |
| CSS in the panel's `<style>` block | 36,880 chars | **47,097** |
| `<link>` / `<script>` / remote URLs | 0 / 0 / 0 | **0 / 0 / 0** |
| `--matic-ui-*` values changed | — | **0** (39 before, 39 after) |
| names renamed or dropped | — | **none** |

`npm.cmd run panel:build` accepted it unchanged, and **all twenty test files still passed with it in
place before a line of app code moved** — which is the measurement that matters, because it is what
makes the delivery additive rather than a rewrite. Its header describes four retuned token values;
those are the ones D252 already integrated, so the diff against what we hold is nil. Checked, not
assumed.

### What it asked of us, and where the answer had to live

Two new names (`.mset`, `.mset-volumes`) and **two attributes we set**: `data-group` on the set,
`data-state` on the row. So `src/agent/machine-band.js` is new, pure, and is the one place a mark is
decided — from the code that already owns each threshold:

| row | the verdict comes from |
|---|---|
| Disk space | `describeVolume()` — the dual threshold |
| Memory | `memoryBand()` — the same function the row's words and the recommendation both read |
| Printing / Sound | `serviceRow()` |
| Last restarted | the restart score's own `recommend` |

**The renderer sets what it is handed and branches on no row value anywhere**, and a test pins that.
The delivery's own sentence is the reason: *"Keyed off YOUR verdict, never off the number in the
string. … `data-state="attn"`: your verdict says THIS ONE. 17.5% and 163 GB free is not this, and
never becomes this, because the design cannot see either figure."* A renderer that coloured a row by
reading "Getting full" out of its value would be reading a figure out of a string one layer along,
and would restore the exact false alarm the dual threshold exists to prevent.

**Three states, and only three.** `attn`, `watch`, and `unread` — the last one taking the quiet
token, because a probe that could not read something is a limit and not a warning. A test enumerates
every state the app can produce across every machine shape and every state the delivery draws, and
asserts the two sets are **equal**: neither can grow without the other.

**And no `data-state="ok"`.** Their note: *"A mark that says 'fine' is fifteen marks on a healthy
machine, which is the defect this is fixing, not a fix."* That is D256's argument about the row
carrying no advice, arrived at independently from the other side. A healthy machine is a band with
not one mark on it, and the test drives five healthy shapes to prove it.

### One finding, measured — and it is why both stages shipped together

The delivery says severity is safe to ship alone: *"Ship (1) alone if the wrapper is not worth it
yet; the band does not regress without it."* **It does.** `.mgrid`'s gap goes from `1px 28px` to
`20px 28px`, which is right between **sets** and wrong between **rows** — so on the flat markup the
app built before this pass, 20px lands between every row:

| | before | delivery, flat markup |
|---|---|---|
| row-gap | 1px | **20px** |
| mean row pitch | 39px | **58px** |
| band height, 15 rows | 378px | **521px — 38% taller** |

143px of an 800px window for no gain. Shipping both stages together makes it moot, because with
`.mset` wrappers the 20px separates sets, which is what it is for. **It is recorded rather than
patched:** the alternative is one line in *their* file (`.mgrid:has(.mset)`), and doing it in
`matic-panel.app.css` would be the inversion D241 exists to prevent. Anyone shipping stage 1 alone
in future needs that line first.

A smaller one, noted and not changed: section (1) of their machine-band comment says *"Two drawn
values"*, but the CSS draws three and the band file's artwork uses all three — `watch` is explained
there rather than in the stylesheet.

### Two things that moved on our side

`#machineGrid` is a `<div>` now rather than a `<dl>`, because the `.mset` children are the `<dl>`s.
And `serviceWords()` left `renderer.js` for `machine-band.js`: the band and the proposal's evidence
line both say a service state out loud, and two copies would drift into two surfaces describing one
service differently.

### Verified

**1691 assertions across 21 files**, up from 1595/20; `machine-band.test.mjs` is new (96) and is
where the severity contract is pinned. Driven in Electron on real data — five named groups, and **not
one mark on this healthy machine** — and on the check page for the marks, where all three states
appear and `Disk space (C:)` at 17.5% free stays correctly silent while `D:` at 40 GB is `watch` and
`E:` at 8 GB is `attn`.

`client/docs/PANEL-RENDERER-CHECK.md` §8c is the click-through, and **8c.8 is the step that matters
most**: if the 163 GB drive is ever amber, the false alarm is back.

### The Design question is closed, and what is not

§5.39k asked what happens to this panel at roughly a dozen rows and whether it wants grouping or
severity. **Both, and they are built.** What grouping does NOT do is reduce the count — fifteen rows
are still fifteen, in five sets — but the eye now goes to the set before the row, and the band drops
to one track when the window is narrow, which the flat grid never did.

**D248 is still proposed and still awaits Charles**, untouched by any of this.

---

## 14. D248, ratified and built: the exact call is glossed (register §5.42)

Charles: *"do d248."* Proposed 2026-09-10, left open for a day because it is a change to the
**rendered contract** rather than a patch. **No new ID was taken** — the decision is D248 as
proposed, and nothing about it changed on ratification.

### What the card says now

```
EXACTLY WHAT RUNS   Restart the Print Spooler service.
                    restart_service(serviceName=spooler)
```

The gloss at 13px in the body face at full ink; the exact call beneath it at 12px, mono, muted.
A plain-language line above, the exact call below and subordinate — D248's proposal in its own words.

### It says the one thing nothing else on the card did

`plain.what` describes the **action** and never names its **target**: *"Stops one background Windows
program and starts it again"* never says which, and *"Switches the network adapter off and straight
back on"* never says which adapter. **The exact call was the only field on the card carrying that —
and it carried it as `serviceName=spooler`, our registry key, or as a raw GUID for `reset_adapter`.**

So the gloss is not a restatement. It is the missing half, in the words Windows itself uses.

### Why it needed a decision rather than a patch

`rendered.detailPlain` is a new field, and the **broker** assembles it from catalog text —
`plain.call` (a template) plus `plain.callParams` (naming one of three resolvers per parameter),
exactly as `title` and `rollbackNote` are already assembled. **The renderer could not have done
this:** a renderer authoring consent wording is precisely what D130 forbids, which is why the line
sat undrawn in the delivery for a day with a comment in `renderer.js` explaining why.

The three resolvers are declared **in the catalog** rather than guessed from a parameter's name, so
the mapping stays reviewable beside the text it feeds — the same argument that put
`plain.serviceNames` in the catalog rather than in code (D247).

### Every unknown falls back to the raw value

An adapter gone between probe and render, a service with no mapping, a probe that throws, a resolver
nobody implemented — each yields the value the call actually carries. **That is no worse than the
exact call printed directly beneath it, and far better than naming the wrong adapter**, which is the
one outcome a gloss must never produce. A placeholder naming an absent parameter is left **visible**:
obviously wrong beats invisibly wrong on this screen.

### A capability with no parameters gets no gloss, and that is a decision

`flush_dns()` has nothing to point at, so a gloss there could only restate `plain.what` two lines
below `plain.what` — **D245's defect exactly: one fact, two wordings, adjacent.** `plain.call` is
absent for it, `detailPlain` is `null`, and the renderer draws **no element at all** rather than an
empty labelled row. That is also the delivery's own written fallback for this row.

### What did not change

**`detail` is byte-identical**, still verbatim, still the field `docs/D130-RENDERER-CHECK.md`
compares on screen. D244's rule is that a closed value reaching the user is **glossed, never
hidden** — the same reasoning that kept `needs_human_judgement` on the review card keeps the call
signature here. The four `consentRendered` prose clauses stay verbatim (D255). **And no spoken line
changed:** the gloss is a shown string, and `say()` never reads it.

### Verified

**1724 assertions across 21 files**, up from 1691. `consent-surface.test.mjs` §4c asserts the field
**over the pipe** — D200/D201 make the wire format a contract, so what is checked is the
serialisation, and the audit record is asserted to keep the same string the card was given.
`broker.test.mjs` §12 holds the unit rules, including a probe that throws and a scan that every
placeholder in every template is a real parameter with a declared resolver.

`client/docs/2026-09-04-named-pipe-protocol-design.md` names the field for a transport implementer,
including that **`null` must survive as `null`**. `D130-RENDERER-CHECK.md` has a row for it.

**Nothing in D248 is now open.** D242 (the tickets band) remains the one proposed decision awaiting
Charles.

---

## 15. D242, ratified: the tickets band is permanent (register §5.43)

Charles: *"do d242."* Proposed and **built reversibly** on 2026-09-10, held for the founder because
the design handover's §4 asked him directly. **No new ID** — the decision is D242 as proposed.

### What ratification actually settles

The escape hatch was that the band's trigger and markup came out of `index.html` if the answer was
no, with the IPC channel and the egress read staying because the spoken answer (D235) already used
them. **The answer is yes, so the escape is spent and the band is permanent** — which changes what
the tests owe. It had five assertions, four of them single regexes over renderer source. It has
**twenty**.

### The invariants were re-checked before the status moved

The band has been through two design deliveries since it was built — D252's re-export and D258's
grouped band — so ratifying on the strength of a day-old decision would have been careless. Driven
on the check page and read back from the DOM:

```
PLACEHOLDER-0000   Dock stopped driving the second screen        Filed from here
Filed yesterday    Stored for the service desk to pick up.       Progress not visible
at 9:18 AM         No email went out, so nobody was alerted…
```

All three of D242's clauses hold.

### The pairing is mechanical now, and it was not before

D242 requires the band's note to state the limit *"in the same words `persona.tickets.some`
speaks"*, so the band and the voice cannot describe one ticket two ways. That was two independent
regexes — `/Progress not visible/` and `/isn't something I can do in this build/` — **either of
which would have gone on passing while the other string was edited.** The shared clause is now
extracted from the persona file and matched character for character:

> checking a ticket's progress with the service desk isn't something I can do in this build

Probed in both directions. There is also a check that the band does not state the same fact a
**second, different** way — D245's rule applied inside one surface.

### "No channel that could become a hub lookup" is a check rather than a sentence

`canQueryHub` is carried so the inspector can disclose it, and a lookup keyed on the self-asserted
`osUsername` would be D54's user identity through the back door. The rule: **it may appear in an
inspector payload and may never appear in a condition.** A probe that made it gate a branch was
caught. The preload is scanned too — exactly two ticket channels exist, and **a third is how a
status lookup arrives.**

### The three note branches, and the worse outcome D242 names

*"The user reads 'no news' where the truth is 'no lookup'."* So the cannot-file case and the empty
case are asserted to be **distinct** strings, and all three are scanned for status vocabulary —
`in progress`, `being worked`, `assigned`, `open`, `closed`, `resolved`. A probe that changed one to
*"They are being worked on"* was caught.

### Five mutation probes, all five caught

Two were caught by the **adjacent** assertion rather than the one predicted, which is correct rather
than a miss: a persona edit fails "the spoken answer carries the limit clause" before it can fail
the pairing, and a trigger edit fails the sharper of the two trigger checks. Tree reverted and the
baseline re-run green after each.

**1739 assertions across 21 files**, up from 1724.

### And that clears the queue

**With D248 built the same day, no decision in the register is waiting on Charles.** D202 and
D130–D150 remain proposed, but those are design-review and identity-model items rather than
anything built and held for a yes or no.
