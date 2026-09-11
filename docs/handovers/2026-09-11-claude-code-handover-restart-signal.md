# Claude Code Handover — the restart signal, end to end

**Repo root:** `C:\Users\Charles\Downloads\maticdesk_bot`. **Branch:** `main` at `99b1bb5`.
**Source:** `research/2026-09-11-endpoint-telemetry-spec.md` — measured on one machine, 2026-09-11.

**Read:** `CLAUDE.md`, the telemetry spec §§1, 2, 4, 6, and whatever `cbb3666`/`3b1db59` record about
where the panel's rows come from. **Nothing else unless a failure points you at it.**

**One commit.** **Finish the markdown work in flight first** (`model-prose.js`); do not start on a
dirty tree.

---

## 0. Founder decisions, 2026-09-11

1. **Panel layout:** format for best readability — Design's call. **But see §5: this pass adds one
   row, not six, so the layout question is probably premature.**
2. **Restart:** **both.** The panel carries the fact; passing the threshold is a conversation moment.
3. **Camera and microphone: out**, on privacy grounds. See §4.
4. As 3.
5. **Core Audio path:** raise it alongside the pipe's native-call decision rather than answering it
   alone. **So audio is not in this pass.**

---

## 1. The principle

**The panel shows conclusions, not measurements.** The current rows already do this — *"Printing:
Stopped"*, not `spooler: STOPPED`. That vocabulary work is done and must not be undone.

**And a measurement can be collected without being displayed.** Commit charge is a scoring input here
and never a row: *"Commit charge 68.8%"* means nothing to an office worker, but it is exactly what
distinguishes a machine that needs restarting from one that has merely been up a while.

---

## 2. What to build

The restart signal, from probe to sentence.

### 2a. Uptime

```powershell
(Get-CimInstance Win32_OperatingSystem).LastBootUpTime
```

**Never a tick counter.** `[Environment]::TickCount` is 32-bit and **wraps at 49.7 days**, so a
machine up for 60 days reports as freshly booted — the machines that most need flagging are precisely
the ones that would report clean. And `TickCount64` **returned empty** on Windows PowerShell 5.1 on
the test host rather than throwing, so a collector without a null check computes zero and never
fires. If the collector is native, `GetTickCount64()` from kernel32 is fine; it is the PowerShell
static property that was missing.

Capture **Event ID 1074** for who initiated the last restart. On the test machine it was Windows
Update, which tells the assistant the machine is patched-current and the clock is legitimately young.
Context for the conversation, not a row.

### 2b. Pending-reboot flags

| Flag | Weight |
|---|---|
| `...\Component Based Servicing\RebootPending` | **Fires alone** |
| `...\WindowsUpdate\Auto Update\RebootRequired` | **Fires alone** |
| `...\Session Manager\PendingFileRenameOperations` | **1, never alone** |

The third is the trap. It had **two entries on a machine rebooted 27 hours earlier by Windows Update
that needed nothing at all**. Installers, antivirus and update staging populate it routinely and it
often persists harmlessly. Treating it as sufficient is wrong.

### 2c. Memory — collected, never rendered

Use `Win32_PerfRawData_PerfOS_Memory` for commit charge and available bytes. Cross-check against
`Win32_OperatingSystem`; on the test machine they agreed (68.8% vs 68.5%).

**Never `Get-Counter`.** It terminated the PowerShell host twice during the spec's probe — no output,
no exception — and it depends on **localized counter names**, which breaks on non-English Windows.
`Win32_PerfRawData_*` gives the same data with stable English property names.

`Memory Compression`'s working set is a useful corroborating signal: Windows only grows it under
genuine pressure.

### 2d. The score

From the spec's §6, minus the signals this pass does not collect:

| Signal | Weight |
|---|---|
| CBS or WU reboot-required flag | **Fires alone** |
| Uptime > 30 days | 3 |
| Uptime 14–30 days | 1 |
| Commit in use > 90% | 3 |
| Commit 75–90% | 1 |
| `Memory Compression` working set > 15% of physical RAM | 1 |
| `PendingFileRenameOperations` present | 1 (never alone) |

Recommend at **score ≥ 3**.

**Every number above is a policy proposal, not a sourced benchmark.** The spec says so plainly:
there is no verified source establishing 30 days — or any figure — as an evidence-based restart
interval. **Make them configurable defaults, not constants**, and record them as unvalidated until
they have been scored against whether recommendations actually resolved tickets.

Single-process working-set growth (weight 2) needs the 7–14 day rolling history the spec describes.
**Not this pass.** Leave room for it.

### 2e. The row

The fact only: *"Last restarted: 2 days ago"*. Plain, neutral, no advice.

### 2f. The conversation moment

When the score passes the threshold. Four copy rules from the spec, all of them load-bearing:

- **Say "restart", never "shut down and turn it back on".** Under Fast Startup a shutdown is a kernel
  hibernate — it does not clear the session and **the fix will not apply.** This is the most
  consequential sentence in the spec.
- **Lead with the evidence, not the instruction.** *"Chrome has grown 4 GB since Tuesday and your
  memory is nearly full"* earns compliance in a way *"it's been a while"* does not.
- **Offer to schedule it.**
- **Do not nag.** The spec's own line: an unprompted restart prompt during someone's workday is the
  fastest way to get the agent dismissed.

**Add a rule the spec does not state and this build needs:** once declined, do not raise it again
this session, and not again for a configurable period. A recommendation that repeats is a nag
regardless of how well it is worded.

---

## 3. `[VERIFY]` carried from the spec

**Event ID 27's boot-type mapping.** `0x0` = full boot is corroborated — but only `0x0` was ever
observed, on a machine with Fast Startup **disabled**. `0x1` and `0x2` are **unverified**.

This matters because the whole concern is that Fast Startup makes "Shut down" a kernel hibernate, so
users who power down nightly still show weeks of uptime. Until `0x1` is confirmed on a machine with
Fast Startup enabled, **do not assert a cold-boot distinction anywhere a user reads it.** Collect
Event 27, record it, do not draw a conclusion from it.

Also untested: whether `LastBootUpTime` resets across a Fast Startup shutdown. That determines
whether Event 27 is a supplement or a replacement.

---

## 4. Camera and microphone — deferred, and why

**Out of this pass on privacy grounds.** Three tiers, and the line sits between the second and third:

**Usage history — never, under any circumstance.** The consent store records every app that has ever
used the camera or microphone, with timestamps: 87 microphone entries and 22 webcam entries on the
test machine, naming applications and when each was last used. That is a behavioural log of what
software someone runs and when. **It must never enter the panel, a ticket, a snapshot, or the service
desk's view.** A competitor demonstrating *"here is everything your employee has used their camera
for"* is how this becomes a procurement blocker rather than a feature.

**Permission state — out, by founder decision.** Reading which apps are allowed or denied is a
configuration value the user controls, and *"camera access is turned off for Teams"* is a real
ticket. But it implicitly names installed software and the user's own choices, and it lives in the
same registry tree as the history — so a future maintainer widening the read is one line away. Not
worth it without a disclosure story.

**Device configuration — different in kind, and still worth doing later.** Which microphone is
selected, whether it is muted, what level it sits at. Not behavioural, not historical. It is where
the spec's strongest finding lives: Windows keeps two defaults per direction, meetings take the
**communications** one, and on the test machine that was NVIDIA Broadcast at **0%** while the
multimedia default read Yeti Classic at 76%. A row reporting a single "default microphone" would have
called it healthy while the device every meeting uses was silent. *"Nobody can hear me"* is a top
ticket category.

It is blocked on the Core Audio decision (§0.5) regardless, so nothing is lost by deciding the
privacy question later. **When it returns it will still need a disclosure sentence**, because it names
hardware.

**Do not implement the in-use heuristic, ever, in the form it is usually described.**
`Stop == 0 && Start != 0` returned **five microphone apps as live** on the test machine, with start
times including 2023 and 2024 — orphaned entries from crashed or force-killed apps. If in-use
detection is ever needed it requires `IAudioSessionManager2`.

---

## 5. Design — hold the handover

The previous draft of this pass assumed the panel would grow from eight rows to about fourteen and
that the layout needed Design.

**With camera and microphone out, and memory never rendered, this pass adds one row.** Nine rows is
not obviously a different layout from eight.

**Do not send a Design handover yet.** Record the question — *what happens to this panel when it
reaches roughly a dozen rows, and does it want grouping or severity?* — and send it when there are
enough rows to answer it against something real. Charles's instruction was "format for best
readability", and that is a judgement Design cannot make about rows that do not exist.

---

## 6. Constraints for every probe

- **Never `Get-Counter`**, and never a localized counter path (§2c).
- **Never drop and run a `.ps1`.** Execution policy blocked it on the test machine;
  `-ExecutionPolicy Bypass -File` worked there but a Group Policy at MachinePolicy scope blocks that
  too. Compiled code, or pass work via `-Command`.
- **Idempotent probes, no state in a long-lived shell.** The spec's own session lost its connection
  mid-probe.
- **Cadence 5–15 minutes.** Every probe returned in well under a second except the event-log query.

---

## 7. Acceptance

1. Uptime comes from `LastBootUpTime`; a test pins that no tick counter is used.
2. An empty `TickCount64` cannot produce an uptime of zero — null check present and tested.
3. `PendingFileRenameOperations` alone **cannot** produce a recommendation; a test asserts it.
4. No `Get-Counter`; no `.ps1` written or executed.
5. Commit charge is collected and **never rendered as a number** anywhere on the user surface.
6. Thresholds are configurable and documented as unvalidated.
7. The row reads plainly and carries no advice.
8. The conversation moment says **"restart"**, leads with the evidence, offers to schedule, and
   **does not repeat once declined**.
9. Nothing reads the consent store.
10. `npm.cmd test` in `client/` green — 869 assertions across 16 files as the floor.
11. One commit, named files. Charles clicks it through.

---

## 8. Honesty ledger

- **Every finding in the spec is one machine on one day** — a workstation with 32 GB of RAM, a
  discrete GPU and five volumes, not the fleet this ships to.
- **Every threshold in §2d is a proposal.** None is sourced. §6 of the spec says so itself and calls
  itself educated guessing until validated against real ticket outcomes.
- **Event 27's `0x1` and `0x2` are unverified**, and the Fast Startup question behind them is the
  reason the feature exists.
- **VRAM, disk and per-process history are deliberately absent.** `Win32_VideoController.AdapterRAM`
  is a 32-bit value that reported **4.0 GB for a 24 GB card**, and the target fleet has integrated
  graphics anyway; the disk rule needs both a percentage and an absolute threshold or it fires on
  volumes with 160+ GB free; per-process growth needs rolling history that does not exist yet.
