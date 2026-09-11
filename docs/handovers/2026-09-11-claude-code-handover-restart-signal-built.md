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
