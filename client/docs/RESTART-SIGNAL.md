# The restart signal — what is collected, what is scored, what is shown

**Built 2026-09-11 (D256, register §5.39).** Source: `research/2026-09-11-endpoint-telemetry-spec.md`,
measured on one machine on one day.

Two files do the work, and the split is the design:

| File | What | Privileged? |
|---|---|---|
| `src/broker/win32/sysinfo.js` | the native readings | **yes** — only a `Broker` implementation may import it |
| `src/agent/restart-signal.js` | the thresholds, the score, the words | no, and **pure** — no Windows, no clock, no DOM |

`probeMachine()` joins them: it calls `restartSignals()` and puts the readings on `probe.restart`.
`Agent.diagnose()` turns the uptime into the row's phrase; `Agent.propose()` decides whether there
is a recommendation to raise. `test/restart-signal.test.mjs` is the acceptance list, in order.

---

## 1. The thresholds are UNVALIDATED. Every one of them.

They live in `client/config.json` under `restartPolicy`:

| Key | Default | What it means |
|---|---|---|
| `recommendAtScore` | 3 | recommend at this score or above |
| `uptimeLongDays` | 30 | above this, uptime scores 3 |
| `uptimeElevatedDays` | 14 | from here to `uptimeLongDays`, uptime scores 1 |
| `commitHighFraction` | 0.9 | above this, commit charge scores 3 |
| `commitElevatedFraction` | 0.75 | from here to `commitHighFraction`, commit charge scores 1 |
| `memoryCompressionFraction` | 0.15 | above this share of physical RAM, `Memory Compression` scores 1 |
| `raiseSuppressionHours` | 24 | quiet for this long after the recommendation is made |
| `declineSuppressionHours` | 168 | quiet for this long after it is declined |
| `deferHours` | 4 | quiet for this long after "remind me later" |

**None of these is a sourced benchmark.** The spec's own §6 says there is no verified source
establishing 30 days — or any figure — as an evidence-based restart interval, and calls itself
educated guessing until validated against real ticket outcomes.

They are **configurable defaults and not constants**, and that distinction is the point: a constant
is a claim the code makes, and a default is a starting point a tenant can move. Omitting a key falls
back to `DEFAULT_RESTART_POLICY`; the `weights` object is overridable the same way.

**What would validate them:** score recommendations against whether the restart actually resolved
the ticket. Until that exists, **a changed number is a changed guess** — record it as one.

---

## 2. The score

| Signal | Weight | Condition |
|---|---|---|
| CBS or Windows Update reboot-required flag | **fires alone** | the key exists |
| Uptime | 3 | `> uptimeLongDays` |
| Uptime | 1 | `>= uptimeElevatedDays` |
| Commit in use | 3 | `> commitHighFraction` |
| Commit in use | 1 | `>= commitElevatedFraction` |
| `Memory Compression` working set | 1 | `> memoryCompressionFraction` of physical RAM |
| `PendingFileRenameOperations` | 1 | present — **never alone** |

Three properties a simpler scorer would not have:

1. **A flag that fires alone fires alone.** CBS and Windows Update are Windows telling you outright,
   so the score is not consulted.
2. **`PendingFileRenameOperations` can never produce a recommendation by itself**, and that is
   structural rather than arithmetical. Its weight is 1 against a threshold of 3, so today it could
   not reach the threshold anyway — but both numbers are configurable and both are meant to be
   moved, so the contribution carries `neverAlone` and the recommendation is withheld when nothing
   else contributed. **The spec corrected its own earlier advice on this key:** it had two entries on
   a machine Windows Update had fully rebooted 27 hours earlier that needed nothing at all, and one
   entry on the machine this was built on.
3. **An unreadable probe scores nothing and is listed in `unknown`.** It is never read as healthy.

### Absent on purpose

**Single-process working-set growth** (weight 2 in the spec) needs the 7–14 day rolling per-process
history the spec describes. That history does not exist. There is room for it in the policy and the
table, and nothing else has to move when it arrives.

---

## 3. What reaches a person, and what does not

**One row**, in the machine band: `Last restarted   2 days ago`. The fact only — plain, neutral, no
advice. It does not say the machine should be restarted and does not hint that it is overdue,
because the recommendation is a conversation moment and **a row that argues argues every time the
band is opened**, which is the definition of nagging. An unreadable probe reads **"Not known"**,
never "Less than an hour ago".

**A memory row of WORDS (D257, 2026-09-11).** `Memory — Plenty free` / `Filling up` / `Almost
full`. Until D257 the reading was scored and completely invisible; Charles asked where it was, and
the answer is that the FIGURE was forbidden, not the meaning.

**The commit figure is still never rendered.** It is the most useful input in the score — it is what
distinguishes a machine that needs restarting from one that has merely been up a while — and
*"Commit charge 68.8%"* means nothing to an office worker. It is not merely a rule someone has to
remember: **the object the renderer receives does not contain it**, so the rule cannot be broken
later by forgetting a condition. That is D226's technique. The row goes through `memoryWords()`,
which is **the same band function the recommendation's sentence reads**, so the row and the sentence
cannot describe one machine two ways.

**Disk, one row per fixed volume (D257).** `Disk space (C:) — Plenty of room — 163 GB free`. See §10.

**Event 1074 (who initiated the last restart) is collected and cannot be spoken.** Its payload
carried `C:\WINDOWS\servicing\TrustedInstaller.exe (WAKANDA)` and `WAKANDA` — the machine's name,
twice — and `NT AUTHORITY\SYSTEM`. D249 says this machine's name and the signed-in account may be
shown and are never said, so it goes to the inspector and the developer log.

**Event 27 (the boot type) is collected, recorded and not interpreted.** See §5 below.

---

## 4. The conversation moment

Four copy rules, all load-bearing, and one consequence of what this build can do.

1. **It says "restart" and never "shut down and turn it back on".** The most consequential sentence
   in the spec: under Fast Startup a shutdown is a kernel hibernate, so it does not clear the session
   and **the fix does not apply** — a user who follows the other wording does the work and gets
   nothing.
2. **It leads with the evidence, not the instruction.** Clauses are ordered by weight so the
   strongest reason is said first — except the pending-update flag, which carries `leads` because
   its weight is **0** precisely so that it does not need one, and ordering it by weight buried the
   one signal Windows states outright. *"Chrome has grown 4 GB since Tuesday and your memory is
   nearly full"* earns compliance in a way *"it's been a while"* does not.
3. **It offers to come back to it** — which is the part of "offer to schedule it" this build can
   honour. **No capability restarts a machine** (`restart_service` is a Windows service, not the
   computer), so the sentence never implies a restart has been booked, and there is no button
   offering to perform one.
4. **It does not nag.** That is the gate, not the sentence.

> This computer hasn't been restarted in 40 days, its memory is almost completely full, and Windows
> has started compressing memory to keep up. Restarting it would clear that up. I can bring this up
> again at a better time, or leave it with you.

### The evidence describes the READING, not the band it fell into

This was a defect and it was on screen. The clauses were constants named after the default bands —
*"in over a month"*, *"in more than a fortnight"* — and the bands are configurable defaults a tenant
is meant to move. With `uptimeElevatedDays` lowered to 1, the real panel said *"This computer hasn't
been restarted in more than a fortnight."* about a machine that had been up **1.35 days**. Every copy
rule passed; the evidence was false.

**The configured band decides whether to speak. The reading decides how it is described.** Uptime
says how long it has actually been, from the same `durationWords()` the row uses — so the band and
the recommendation cannot describe one machine two ways. Memory is described from where the real
fraction sits, in fixed descriptive words, which is also why no figure is needed.

### The gate

`createRestartGate()`. It **never raises anything** — it only answers "may this be said".

- Said once, then quiet for `raiseSuppressionHours`.
- **Declined: not again this session, and not again for `declineSuppressionHours`.** The session fact
  is separate from the timestamp on purpose, so a clock that moved — in either direction — cannot
  argue it away. An unrecognised answer is read as a decline, never as permission to ask again.
- "Remind me later": quiet for `deferHours`, then allowed. A deferral the user asked for must not be
  silently honoured as the 24-hour suppression.

The moment **rides on a turn the user started**. Nothing raises it on a timer: an unprompted restart
prompt during someone's workday is the fastest way to get the agent dismissed, and D198 already says
a surface the user did not provoke is a defect even when every gate behaved correctly. It is attached
after the intake's early returns, so a turn answering *"and your last name?"* carries none. The
renderer drops it in two further cases, both erring towards silence: a turn that ended with the
ticket offer waiting, and a turn that threw.

**KNOWN LIMIT:** the gate is in memory. "Not again this session" is exact; the longer window holds
only while the process lives. Persisting it needs a store that does not exist for the purpose. The
gap is narrow — a user who takes the advice restarts the machine and the signal goes with it.

---

## 5. What the collector must never do

- **Never `Get-Counter`.** It terminated the PowerShell host twice during the spec's probe — no
  output, no exception — and it resolves **localized counter names**, so it breaks on non-English
  Windows. An agent running unattended on machines nobody controls cannot have either property.
- **Never drop and run a `.ps1`**, and in fact **never spawn a shell at all.** Execution policy
  blocked a dropped script on the spec's machine and `-ExecutionPolicy Bypass -File` is blocked too
  by a Group Policy at MachinePolicy scope. `src/broker/win32/*`'s own rule is stricter and is what
  applies: native calls only, because spawning a shell is the behaviour EDR flags.
- **Never a tick counter.** `TickCount` is 32-bit and wraps at **49.7 days**, so a machine up 60 days
  reports as freshly booted — the machines that most need flagging are exactly the ones that would
  report clean. `GetTickCount64()` from kernel32 has neither problem and is still not used, because
  an absolute boot instant is strictly better than an interval.
- **Never return a zero for a value that could not be read.** `TickCount64` returned *empty* on
  Windows PowerShell 5.1 on the spec's host rather than throwing, so a collector without a null check
  computes an uptime of zero and never fires. Every function here returns `null` instead.
- **Never read the consent store.** See §7.
- **Never assert a boot-type conclusion.** `0x0` = full boot is corroborated — **81 observations on
  this machine**, 2026-07-16 to 2026-09-09, and three of the last twelve shutdown events were a
  genuine shut down or power off rather than a restart, each followed by a `0x0` boot. But only
  `0x0` has ever been observed, and only with Fast Startup **disabled**. `0x1` and `0x2` are
  unverified. `lastBootTypeEvent()` returns the raw value plus `interpreted: false`, whose only job
  is to stop a reader mistaking the object for a verdict. **`npm.cmd run verify:boot-type` reports
  this and prints what would settle it** — §9.

### And the walk checks itself

`Memory Compression`'s working set comes from raw byte offsets into an undocumented structure
(`SYSTEM_PROCESS_INFORMATION`). If a future Windows moves a field, the walk does not crash — it reads
a neighbouring quadword and returns a plausible-looking number, which is register §10.5's class of
failure exactly. So `K32GetPerformanceInfo` supplies a process count from a **different** kernel call
and the walk must arrive at the same number; on disagreement the function returns null rather than a
number it cannot vouch for. **Absent is also null and not zero**: Windows may legitimately not be
running the process, and a zero would score as "no memory pressure".

---

## 6. Measured on this machine, 2026-09-11 (unelevated)

| Reading | Value |
|---|---|
| `LastBootUpTime` (`BootTime − BootTimeBias`) | `2026-09-09T23:20:24.500Z` — **exactly WMI's value** |
| raw `SystemTimeOfDayInformation.BootTime` | `2026-09-09T23:20:32.136Z` (the tick counter's origin) |
| CBS / Windows Update reboot flags | `false` / `false` |
| `PendingFileRenameOperations` | **1 entry** — a staged `gamingservicesproxy` DLL, on a machine needing nothing |
| Commit in use | 72–74% of an 83.9 GB limit |
| `Memory Compression` | 4.4 GB = **13.8%** of physical — just under the 15% threshold, so it does not score |
| Event 27 boot type | `0` (Fast Startup disabled here, so `0x1` is still unverified) |
| Event 1074 | `TrustedInstaller.exe` — a Windows Update reboot |
| **all six readings** | **24–28 ms** |
| **score** | **1 of 3 — stay silent**, from `PendingFileRenameOperations` alone |

That last line is the point of the whole design: **a naive pending-reboot rule would have recommended
a restart on this machine, and it needed nothing.**

Two of the spec's own measurements were corrected by doing this natively:

- **The event-log query is not slow.** The spec says every probe was well under a second *"except the
  event-log query"*. As a targeted XPath in reverse direction fetching one event: **1.2 ms** for Event
  1074 and **5.9 ms** for Event 27. The cost belongs to walking the log, not reading from it.
- **The pending-reboot registry reads need no elevation.** The spec expected them to.

---

## 7. Camera and microphone — out, and nothing reads the consent store

**Founder decision, 2026-09-11, on privacy grounds.** Three tiers, and the line sits between the
second and third.

**Usage history — never, under any circumstance.** The consent store records every app that has ever
used the camera or microphone, with timestamps: 87 microphone and 22 webcam entries on the spec's
machine, naming applications and when each was last used. That is a behavioural log of what software
someone runs and when. It must never enter the panel, a ticket, a snapshot or the service desk's
view.

**Permission state — out, by founder decision.** *"Camera access is turned off for Teams"* is a real
ticket, but it implicitly names installed software and the user's own choices, and **it lives in the
same registry tree as the history** — so a future maintainer widening the read is one line away.

`test/restart-signal.test.mjs` §9 is what catches that line: six patterns across seven files
(`CapabilityAccessManager`, `ConsentStore`, `webcam`, `microphone`, `NonPackaged`,
`LastUsedTimeStart|Stop`), plus an assertion that the collector opens **exactly three** registry
keys, all under HKLM, and never touches the per-user hive where consent lives.

**Device configuration is different in kind and still worth doing later.** Which microphone is
selected, whether it is muted, what level it sits at — not behavioural, not historical. It is where
the spec's strongest finding lives: **Windows keeps two defaults per direction and meetings take the
communications one.** On the spec's machine that was NVIDIA Broadcast at **0%** while the multimedia
default read Yeti Classic at 76%. A row reporting a single "default microphone" would have called it
healthy while the device every meeting uses was silent, and *"nobody can hear me"* is a top ticket
category. It is blocked on the Core Audio decision regardless, and when it returns it still needs a
disclosure sentence, because it names hardware.

**Do not implement the in-use heuristic, ever, in the form it is usually described.**
`Stop == 0 && Start != 0` returned **five microphone apps as live** on the spec's machine, with start
times in 2023 and 2024 — orphaned entries from crashed or force-killed apps. In-use detection needs
`IAudioSessionManager2`.

---

## 8. Driving it

The score on a healthy machine is 0 or 1, so the moment does not fire and cannot be seen by waiting.

**On the check page** (layout only, canned bridge, no broker and no hub):

```bash
npm.cmd run panel:check
```

then serve `client/src` and open `/renderer/panel/panel-check.html`. The row shows immediately;
`next turn: restart recommendation` arms the moment for the following turn. The bridge builds the
sentence by importing the **real** `restartSentence()` rather than carrying a copy, for the same
reason the filing failure lines are the real ones: a copy keeps reading correctly on the day the real
one stops.

**In the real app**, lower the policy in `config.json` — `recommendAtScore: 1` and
`uptimeElevatedDays: 1` will fire on almost any machine — and remember to put it back. That is how
§5.39c's defect was found.

`docs/PANEL-RENDERER-CHECK.md` §9 is the click-through.

---

## 9. Settling the boot type — what a session cannot do, and why

```bash
npm.cmd run verify:boot-type
```

Read-only, and it turns nothing on. It prints `HiberbootEnabled`, this boot's instant and type,
**every** Event 27 still in the System log grouped by type, how the last twelve shutdowns were
initiated, and a verdict.

**As it stands here:** 81 boots retained, all `0x0`, Fast Startup off throughout — so `0x0` = full
boot is corroborated 81 times rather than once. The log also carries the **control**: three of the
last twelve Event 1074s are a genuine shut down or power off rather than a restart — the only
actions that could produce a hybrid boot, since a restart is a full boot whatever the setting — and
every boot after them is `0x0`, which is what the setting being off should mean.

**`0x1` cannot be settled by a session, and that is structural rather than a limit of effort.** A
hybrid boot only happens on **shut down** followed by a power-on. A *restart* is a full boot even
with Fast Startup enabled — that is the entire point of the feature — so the test needs a power
cycle, and nothing runs between the power-off and the hand that presses the button.

The script prints the four steps. **Two things to read off the second run, and the second decides
the design:**

- the new Event 27 `BootType` — if it is `1`, the spec's mapping is confirmed;
- **whether `LastBootUpTime` moved.** If it did not, uptime survives a Fast Startup shutdown, a
  machine someone powers down nightly still looks weeks old to the score, and **Event 27 is a
  replacement for the uptime reading rather than a supplement to it.**

Nothing here turns Fast Startup on. That changes how a machine shuts down, and it is its owner's
call.

---

## 10. Disk (D257, register §5.40)

```
Disk space (C:)   Plenty of room — 163 GB free
Disk space (D:)   Getting full — 40 GB free
Disk space (E:)   Almost full — 8.0 GB free
```

### It is NOT a restart signal, and the code is arranged so it cannot become one

**A full disk is exactly as full after a restart.** The telemetry spec's §6 score table does not
list disk, and rolling it in would produce the most useless recommendation this product could make.
Four structural checks rather than a comment saying "don't":

- `probeMachine()` returns `volumes` in a **separate field** from `restart` (a test pins the pair);
- `src/agent/disk-space.js` imports nothing from `restart-signal.js`, and vice versa;
- the disk module contains no `score`, `weight` or `recommend`;
- `scoreRestart()` is asserted to return an identical score with and without full disks.

### The dual threshold, and the measurement that forced it

**Flag only when free space is below BOTH 15% and 25 GB.** The spec measured five volumes and a
naive *"below 20% free"* rule fired on two of them, **both with more than 160 GB of headroom and in
no trouble whatever.** Re-measured on the machine this was built on, the same day, the same result:

| Volume | Free | Total | % free | naive <20% | dual threshold |
|---|---|---|---|---|---|
| C: | 163 GB | 930 GB | 17.5% | **FIRES** | quiet |
| D: | 414 GB | 1849 GB | 22.4% | quiet | quiet |
| E: | 163 GB | 932 GB | 17.5% | **FIRES** | quiet |
| F: | 1659 GB | 3726 GB | 44.5% | quiet | quiet |
| G: | 501 GB | 1863 GB | 26.9% | quiet | quiet |

**Two false alarms on a healthy machine, from the rule everybody writes first.** A percentage alone
is meaningless on a large disk and an absolute figure alone is meaningless on a small one. The
inverse case is tested too: 24 GB free on a 3.7 TB disk **is** flagged, at 0.6%.

This is `PendingFileRenameOperations` one signal along — the obvious rule fires confidently on
machines that are fine.

### Per volume, never aggregated

A machine with 2.9 TB free across five drives and 8 GB left on C: is in trouble, and a total says
the opposite. `disk-space.js` contains no `reduce` and no `+=`, and a test says so.

### The conclusion leads, and the figure follows

This is where disk differs from memory, and the difference is the whole of acceptance 5:
*"163 GB free"* is a sentence an office worker can act on and is the first thing a support call asks
after which drive; *"commit charge 68.8%"* is neither. So the words decide the meaning and the
number is there to be quoted.

An unreadable volume is **skipped**, never reported as zero free — a zero is "this disk is
completely full", the loudest thing this feature can say. Only FIXED drives are read: a USB stick at
99% full is not a support ticket. And the figure reported is the volume's free space rather than the
calling account's quota — equal on a machine with no quotas, which is exactly why picking the wrong
one would be invisible until someone had them.

### The row count is now a function of the machine

Nine rows became **fifteen** on a five-volume machine: nine, plus memory, plus one per volume.
§5.39k held the Design handover because nine was not obviously a different layout from eight, and
recorded that the question goes when there are enough rows to answer it against something real.
**There are now.**
