# Endpoint Telemetry Spec — Uptime, Disk, Memory, VRAM, Audio, Camera

**Date:** 2026-09-11
**Status:** Draft — validated against one machine only
**Test machine:** WAKANDA — Windows 11 Home, build 26200, 31.9 GB RAM, RTX 3090 Ti, 5 fixed volumes

## Purpose

Define the local signals the Matic Desk agent collects to detect the conditions
behind a large share of L1 tickets: **stale uptime**, **low disk**, **memory/VRAM
pressure**, and **the wrong audio device in a meeting** — and the logic for when to recommend a restart.

Every finding below was measured on a real machine on 2026-09-11. Where a claim is
inferred rather than measured, it is marked with a warning.

---

## 1. Uptime

### Primary source

```powershell
(Get-CimInstance Win32_OperatingSystem).LastBootUpTime
```

Returns a real `DateTime`. No elevation required. **Measured:** `2026-09-09 16:20:24`
-> 1d 3h 22m at time of probe.

### Do not use tick counters

| Method | Result on WAKANDA | Verdict |
|---|---|---|
| `Win32_OperatingSystem.LastBootUpTime` | 1.14 days | USE THIS |
| `[Environment]::TickCount` (32-bit) | 98,575,812 ms -> 1.1409 days | Agrees, but **wraps at 49.7 days** |
| `[Environment]::TickCount64` | **returned empty** | Unavailable in this PS host |

Two hard problems here:

- **`TickCount` wraps at 2^32 ms = 49.7 days.** A 30-day threshold built on it would work,
  then silently reset to zero on day 50 — exactly the machines that most need flagging
  would report as freshly booted. This is a real, silent failure mode.
- **`TickCount64` returned an empty value** on Windows PowerShell 5.1 on this host rather
  than throwing. A collector reading it without a null check would compute an uptime of
  zero and never fire.

Use `LastBootUpTime`. If the collector is native rather than PowerShell, call
`GetTickCount64()` from kernel32 directly — the Win32 API is fine, it is the PowerShell
static property that was missing.

### Distinguishing a real restart from Fast Startup — solved

The concern: Windows Fast Startup makes "Shut down" a kernel hibernate, so reported uptime
does not reset and users who power down nightly still show weeks of uptime.

**There is a direct, reliable discriminator.** Event ID **27** from
`Microsoft-Windows-Kernel-Boot` in the System log logs the boot type on every boot:

```
9/9/2026 4:20:25 PM   27   The boot type was 0x0.
```

**NEEDS VERIFICATION — mapping:** `0x0` = full/cold boot, `0x1` = hybrid boot (Fast
Startup), `0x2` = resume from hibernation. Only `0x0` was observed here, and only
consistently — WAKANDA has Fast Startup **disabled** (`HiberbootEnabled = 0`), so a `0x0`
reading is exactly what a cold boot should produce. That is corroborating evidence for the
`0x0` mapping but proves nothing about `0x1` or `0x2`. **Test on a machine with Fast
Startup enabled before shipping.**

This event is the right signal regardless: it tells you what kind of boot actually
happened, rather than inferring it from a config flag that may have changed since.

### Also captured

Event ID **1074** records who initiated the last restart. On WAKANDA:

```
9/9/2026 4:19:31 PM  1074  The process C:\WINDOWS\servicing\TrustedInstaller.exe (WAKANDA) has in...
```

The last restart was a Windows Update reboot. Useful context — it tells the agent the
machine is patched-current and the uptime clock is legitimately young.

---

## 2. Pending-reboot flags

| Flag | WAKANDA | Notes |
|---|---|---|
| `...\Component Based Servicing\RebootPending` | **False** | Reliable when present |
| `...\WindowsUpdate\Auto Update\RebootRequired` | **False** | Reliable when present |
| `...\Session Manager\PendingFileRenameOperations` | **2 entries** | **FALSE POSITIVE** |

**Correction to the initial design advice.** Treating any of the three as sufficient
grounds to recommend a restart is wrong. `PendingFileRenameOperations` has two entries on a
machine that was fully rebooted 27 hours ago by Windows Update and needs nothing. That key
is routinely populated by installers, antivirus, and update staging, and often persists
harmlessly.

**Rule:** CBS and WU flags are actionable on their own. `PendingFileRenameOperations` is a
weak contributing signal only — never fire a recommendation on it alone.

---

## 3. Disk

```powershell
Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3"
```

**Measured:**

| Volume | Free | Total | % Free |
|---|---|---|---|
| C: | 164.7 GB | 929.9 GB | 17.7% |
| D: | 414.2 GB | 1,848.9 GB | 22.4% |
| E: | 163.0 GB | 931.5 GB | 17.5% |
| F: | 1,658.9 GB | 3,725.9 GB | 44.5% |
| G: | 500.6 GB | 1,863.0 GB | 26.9% |

This validates the dual-threshold design. A naive "flag below 20% free" rule fires on C:
and E: — both of which have **160+ GB of headroom** and are in no trouble at all. A
percentage rule alone would generate two false alarms on a healthy machine.

**Rule:** flag only when **both** `% free < 15%` **and** `absolute free < 25 GB`, and weight
the system volume higher than data volumes. Report per-volume, never aggregate.

---

## 4. Memory

Two sources, cross-checked:

| Metric | `Win32_OperatingSystem` | `Win32_PerfRawData_PerfOS_Memory` |
|---|---|---|
| Commit used | 68.5% | **68.8%** (57.71 / 83.91 GB) |
| Available | 13.5 GB | 13.34 GB |

They agree. Either source is acceptable; `Win32_PerfRawData_PerfOS_Memory` gives raw bytes
and is slightly preferable for trend math.

**Do not use `Get-Counter`.** It terminated the PowerShell host twice during this probe
(process exited with no output and no exception). It also depends on **localized counter
names**, which breaks on non-English Windows. The `Win32_PerfRawData_*` CIM classes expose
the same data with stable English property names and no host stability risk. This matters
for a shipped agent running unattended on machines you do not control.

**Supporting signal:** `Memory Compression` had a 3.91 GB working set — the largest of any
process. Windows only grows this under genuine pressure, so it is a good corroborating
indicator that "42% free RAM" is understating the real picture.

**Scale context:** 575 processes, 463,589 total handles.

---

## 5. VRAM — the WMI trap

**This is the most important finding in the probe.**

```
ADAPTER : NVIDIA GeForce RTX 3090 Ti
  driver: 32.0.16.1088   AdapterRAM (WMI): 4.0 GB      <- WRONG
nvidia-smi:  23,028 MiB total, 19,600 MiB used, 32% util   <- ACTUAL
```

`Win32_VideoController.AdapterRAM` reports **4.0 GB** for a card with **~24 GB**. The
property is a 32-bit `uint32` and saturates at 4 GiB. **It is unusable for any modern GPU.**
An agent trusting it would report a card at 490% VRAM usage.

**Second trap — phantom adapters.** The same query enumerated two virtual displays:

```
ADAPTER : Virtual Desktop Monitor    AdapterRAM: NULL
ADAPTER : Meta Virtual Monitor       AdapterRAM: NULL
```

The collector must filter `AdapterRAM = NULL` entries and non-physical adapters, or it will
divide by zero or report nonsense adapters to the user.

**Rule:**

- NVIDIA -> `nvidia-smi --query-gpu=memory.total,memory.used --format=csv,noheader`
- Otherwise -> DXGI `IDXGIAdapter3::QueryVideoMemoryInfo`, or the
  `\GPU Adapter Memory(*)\Dedicated Usage` perf counter (**untested here** — `Get-Counter`
  was unstable on this host; test via a native perf-counter API instead)
- **Never** `Win32_VideoController.AdapterRAM`

**Note on this machine:** VRAM is at 19,600 / 23,028 MiB = **85% used**. On a workstation
running local inference that is expected and not a fault — which is itself a lesson: VRAM
thresholds need per-machine or per-role baselines, not a global rule.

---

## 6. Restart recommendation logic

**All thresholds below are policy proposals, not sourced benchmarks.** There is no verified
source establishing 30 days — or any figure — as an evidence-based restart interval. Treat
every number as a per-tenant configurable default.

Score-based, requiring corroboration rather than uptime alone:

| Signal | Weight | Condition |
|---|---|---|
| CBS or WU reboot-required flag | **Fires alone** | present |
| Uptime since last **cold** boot | 3 | > 30 days |
| Uptime since last cold boot | 1 | 14-30 days |
| Commit in use | 3 | > 90% |
| Commit in use | 1 | 75-90% |
| `Memory Compression` working set | 1 | > 15% of physical RAM |
| Single-process working-set growth | 2 | > 50% over session, sustained |
| `PendingFileRenameOperations` | 1 | present (never alone) |

Recommend a restart at **score >= 3**. On WAKANDA today the score is **1** — correct
behavior is to stay silent, which is what a naive 30-day uptime rule would also do here,
but which a naive pending-reboot rule would **not**.

### Copy requirements

- Say **"Restart"**, never "shut down and turn it back on." Under Fast Startup, shutdown
  does not clear the kernel session and the fix will not apply.
- Lead with the evidence, not the instruction: *"Chrome has grown 4 GB since Tuesday and
  your commit charge is at 92%"* earns compliance in a way *"it's been a while"* does not.
- Offer to schedule it. An unprompted restart nag during someone's workday is the fastest
  way to get the agent dismissed.

---

## 7. Architecture notes

- **Collector runs as a privileged helper service**, separate from the agent UI. All probes
  above except pending-reboot registry reads worked unelevated, but a service gives
  consistent access and survives user logoff.
- **Cadence: 5-15 minutes.** Every probe here returned in well under a second except the
  event-log query.
- **Keep 7-14 days of local rolling history.** This is what converts a snapshot into a
  diagnosis. "Your commit charge is at 92%" is a number; "it has climbed every day this week
  and Chrome accounts for all of it" is a finding — and it lets the agent open a ticket
  before the user notices.
- **Avoid `Get-Counter` and any localized-string counter path** in shipped code.
- **Handle the connection dropping.** The device bridge dropped mid-probe during this
  session and the PowerShell session was lost. The collector needs idempotent probes and
  must not hold state in a long-lived shell.

---

## 8. Open items before this ships

1. **Verify Event ID 27 boot-type values `0x1` and `0x2`** on a machine with Fast Startup
   **enabled**. Untested — WAKANDA has it disabled.
2. **Confirm whether `LastBootUpTime` resets across a Fast Startup shutdown.** Also untested
   for the same reason, and it determines whether Event 27 is a supplement or a replacement.
3. Test the full probe set on Windows 10, and on a non-English Windows install.
4. Find a working AMD/Intel VRAM path and test it.
5. Decide the privacy and consent model. This collector reads process names, working sets,
   and volume layout — that is employee-monitoring-adjacent data and needs an explicit
   disclosure story for enterprise buyers before it is a selling point rather than a
   liability.
6. Validate thresholds against real ticket outcomes. Until restart recommendations are
   scored against whether they actually resolved the ticket, section 6 is educated guessing.

---

## 9. Audio devices — default microphone and speaker

Added 2026-09-11 for video-conference troubleshooting ("nobody can hear me"). Measured on
WAKANDA.

### Enumerating endpoints is worthless on its own

`Get-PnpDevice -Class AudioEndpoint` returned **34 endpoints on this machine — 11 of them
microphones** (Yeti Classic, Logitech BRIO, NVIDIA Broadcast, Steam Streaming, Oculus
Virtual Audio, Virtual Desktop Audio, Bigscreen, NexiGo HelloCam, ASUS AI Noise-Cancelling,
Realtek, plus paired-but-absent AirPods and soundcore headphones showing `Status: Unknown`).

A list like that tells the user and the service desk nothing. The only useful facts are
**which endpoint is selected**, **what its level is**, and **whether it is actually
present**. `Win32_SoundDevice` is worse — it lists 16 adapters with no endpoint or default
information at all.

### There is no WMI or PnP path to the default device

| Approach | Result |
|---|---|
| `Get-PnpDevice -Class AudioEndpoint` | Lists endpoints and OK/Unknown status, **no default flag** |
| `Win32_SoundDevice` | Adapters only, no defaults, no levels |
| `AudioDeviceCmdlets` module | **Not installed** (third-party; can't assume it) |
| Core Audio COM (`IMMDeviceEnumerator`) | **Works.** The only reliable path |

The collector must call `IMMDeviceEnumerator::GetDefaultAudioEndpoint`, then
`IAudioEndpointVolume` for mute and level and `IMMDevice::GetState` for presence. Reached
here through a C# `Add-Type` shim; in production this should be native code in the helper
service, not a PowerShell shim.

### Windows keeps TWO defaults per direction, and meeting apps take the other one

This is the finding that makes the feature worth shipping. `GetDefaultAudioEndpoint` takes a
**role**: `eConsole` (0), `eMultimedia` (1), `eCommunications` (2). Teams, Zoom and most
soft-phones request **`eCommunications`**. Windows Sound settings surfaces this as the
separate "Default Communication Device".

Measured on WAKANDA, 2026-09-11:

| Direction | Role | Device | Level |
|---|---|---|---|
| Speaker | console / multimedia | Speakers (Logitech G560) | 56% |
| Speaker | **communications** | **Speakers (Yeti Classic)** | 66% |
| Microphone | console / multimedia | Microphone (Yeti Classic) | 76% |
| Microphone | **communications** | **Microphone (NVIDIA Broadcast)** | **0%** |

Both directions differ by role on this machine, and the communications microphone is at
**zero input level**. A panel row reporting a single "default microphone" would have read
`Yeti Classic, 76%` and called it healthy while the device meetings actually use was
silent.

**Rule:** the user-facing row reports the **communications** device, because that is what a
meeting will get. When the roles differ, say so on the row rather than hiding it. Always
carry the level and mute state — a device at 0% is indistinguishable from no device, and
invisible in a name-only row.

⚠️ **Two honest limits on any conclusion drawn from this:**

1. **The meeting app's own picker beats both Windows roles.** Teams and Zoom store their own
   device selection. A correct Windows communications default does not guarantee the app is
   using it, and vice versa. The object carries `app_can_override: true` so the desk never
   over-trusts the row. Reading the app's own setting (Teams and Zoom both keep it in local
   config) is a worthwhile follow-up but is not covered here.
2. **The 0% reading on a virtual device is unverified as a real fault.** NVIDIA Broadcast is
   a virtual endpoint whose own application may manage level independently of the Windows
   endpoint scalar. This needs confirming in a live call before the agent asserts a problem.

### Execution policy blocks .ps1 files

Running the probe as a script file failed: `running scripts is disabled on this system`
(PowerShell execution policy). `powershell.exe -ExecutionPolicy Bypass -File` worked here,
but a Group Policy set at MachinePolicy scope would block that too.

**Rule:** the collector must not depend on dropping and running `.ps1` files on a managed
endpoint. Ship compiled code in the helper service, or pass work via `-Command`. This is a
general constraint on the whole collector, not just the audio probe.

### Object shape

Audio joins `checks` as a single block carrying both roles per direction:

```
"audio": {
  "status": "healthy",
  "display": "Microphone and speaker both working",
  "meeting_apps_use": "communications",
  "app_can_override": true,
  "microphone": {
    "communications": { "name": "...", "volume_pct": 76, "muted": false, "state": "active" },
    "multimedia":     { "name": "...", "volume_pct": 76, "muted": false, "state": "active" },
    "roles_differ": false
  },
  "speaker": { ... same shape ... },
  "endpoints_present": { "capture": 11, "render": 23 },
  "source": "core_audio_immdevice"
}
```

### Scoring additions

| Signal | Weight | Condition |
|---|---|---|
| Communications mic muted, or level below 10% | **Fires alone** | measured |
| Selected device not present (`state != active`) | **Fires alone** | measured |
| Mic/speaker roles differ | 1 | `roles_differ: true` (informational, never alone) |

A muted or zeroed meeting microphone fires on its own because it is certain, specific, and
the user cannot discover it themselves mid-call — the best possible case for a proactive
agent. Roles differing is deliberately weak: it is often intentional.

### Added to open items

7. Confirm the NVIDIA Broadcast 0% reading against a live call before shipping a fault
   assertion on virtual endpoints.
8. Decide whether to read Teams/Zoom app-level device selection, which would make the row
   authoritative rather than indicative.
9. Test role-differing behaviour on machines with a single audio device, where both roles
   resolve to the same endpoint and the extra copy would be noise.

---

## 10. Camera, live levels, and privacy consent

Added 2026-09-11. Measured on WAKANDA.

### There is no default camera in Windows

Unlike audio, Windows has **no OS-level default camera**. `GetDefaultAudioEndpoint` has no
camera equivalent — every app enumerates and picks its own. So the panel cannot truthfully
say "your camera", only "the cameras that work", and must say so when there is more than
one.

**Cameras span two PnP classes.** Measured:

| Status | Class | Device |
|---|---|---|
| Error | Camera | LoomieLive Camera |
| OK | Camera | NexiGo HelloCam N930W Camera |
| OK | Camera | NexiGo HelloCam N930W IR Camera |
| OK | **Image** | **Logitech BRIO** |
| OK | Image | MB2300 series _D4C41A442362 |

Two traps:

1. **Enumerating only `-Class Camera` misses real webcams.** The Logitech BRIO appears
   under `Image`, not `Camera`. Scan both.
2. **`Image` also contains scanners and printers.** `MB2300 series` is a Canon multifunction
   printer, not a camera. Class alone is not enough — filter on capability, not PnP class.

Also note the IR camera: Windows Hello face-recognition cameras enumerate alongside the
colour camera and must not be offered as a meeting camera.

`LoomieLive Camera` is in `Error` state on this machine — a broken virtual-camera driver.
**Design decision:** a faulted virtual camera should NOT flag the panel, because it is not
the camera a meeting will use. It goes in the object under `faulted` for the service desk
and stays out of the user's row. Same lesson as audio: only the device that will actually
be used matters.

### "Mic level" is two different numbers

This distinction decides the UI.

| | What it is | When it is meaningful |
|---|---|---|
| **Volume / level** | The slider position (`IAudioEndpointVolume`) | **Always.** Passive check, safe to show |
| **Peak meter** | Live signal (`IAudioMeterInformation::GetPeakValue`) | **Only during capture** |

Sampled 3 seconds per endpoint on an idle machine:

```
MIC     (communications) : NVIDIA Broadcast    peak_max=0%  signal=NO
MIC     (multimedia)     : Yeti Classic        peak_max=0%  signal=NO
SPEAKER (communications) : Yeti Classic        peak_max=0%  signal=NO
SPEAKER (multimedia)     : Logitech G560       peak_max=0%  signal=NO
```

All zero — correctly, because the room was quiet and nothing was playing. **A quiet room and
a dead microphone produce an identical reading.** A passive background peak meter would
either alarm constantly or mean nothing.

**Rule:** the panel row shows the **slider level**, which is always interpretable. The peak
meter is used in exactly two situations:

1. **During an active capture session**, where a sustained 0% peak while an app is capturing
   is a real, confident fault.
2. **In a guided test** the user starts ("Test my microphone and camera" — one affordance for
   the group, not a gauge per row), where the agent asks for a few words and samples the
   peak.

This is the right shape anyway: a user about to join a call wants a ten-second check on
demand, not a meter they have to interpret.

### Privacy consent is a high-value, high-risk signal

`HKCU\...\CapabilityAccessManager\ConsentStore\{webcam,microphone}` holds per-capability and
per-app allow/deny. Measured: both **Allow** globally, no denied apps. "Camera access is
turned off for Teams" is a common L1 ticket and this is where it is visible.

⚠️ **The in-use heuristic does not work as commonly described.** The store carries
`LastUsedTimeStart` / `LastUsedTimeStop` per app, and `Stop == 0 && Start != 0` is widely
cited as "in use right now". On WAKANDA that test returned **five microphone apps as live**,
with start times including `5/26/2023`, `12/6/2024` and `4/28/2026`. These are orphaned
entries where the stop time was never written — a crashed or force-killed app leaves one
behind indefinitely.

**Rule:** never report "in use now" from the consent store alone. Require all three: stop
time zero, start time within minutes, **and** the process actually running — or better,
corroborate with `IAudioSessionManager2` session state, which reports live sessions
directly.

### Privacy: read state, never harvest history

The same store records **every app that has ever used the camera or microphone, with
timestamps** — 87 microphone entries and 22 webcam entries on this machine, naming specific
applications and when each was last used. That is a behavioural log of what software someone
runs and when.

The collector reads the **current permission state** and nothing else. The object carries
`history_withheld: true` to make the omission explicit and auditable. Usage history must
never enter a ticket, a snapshot, or the service desk's view. For an enterprise product this
is not a nicety — a competitor demoing "here is everything your employee has used their
camera for" is how this feature becomes a procurement blocker instead of a selling point.

### Object additions

```
"camera": {
  "status": "healthy",
  "display": "NexiGo HelloCam N930W, working",
  "os_default_exists": false,
  "working": ["NexiGo HelloCam N930W Camera", "Logitech BRIO"],
  "faulted": [{ "name": "LoomieLive Camera", "pnp_status": "Error" }],
  "in_use_by": null,
  "pnp_classes_scanned": ["Camera", "Image"],
  "source": "pnp_enumeration"
},
"permissions": {
  "status": "healthy",
  "display": "Camera and microphone allowed",
  "webcam": "Allow",
  "microphone": "Allow",
  "denied_apps": [],
  "history_withheld": true
}
```

Audio endpoints gain `peak_pct`, plus a `peak_means` field on the audio block recording that
silence and a dead microphone both read zero.

### Scoring additions

| Signal | Weight | Condition |
|---|---|---|
| Camera or microphone denied globally | **Fires alone** | consent store = Deny |
| Denied for a specific meeting app | **Fires alone** | per-app Deny on Teams/Zoom/Meet |
| No working camera enumerated | **Fires alone** | all camera devices faulted or absent |
| Peak 0% sustained during active capture | **Fires alone** | requires live session confirmation |
| Faulted virtual camera driver | 0 | recorded for the desk, never flagged to the user |
| More than one working camera | 0 | informational only — no OS default to be wrong about |

### Added to open items

10. Implement in-use detection via `IAudioSessionManager2` rather than consent-store
    timestamps, and verify against a live Teams and Zoom call.
11. Find a capability-based camera filter that excludes scanners, printers and Windows Hello
    IR cameras without relying on name matching.
12. Decide the consent-history retention stance formally, and get it into the privacy
    disclosure before any pilot. The collector can see far more than it should report.
