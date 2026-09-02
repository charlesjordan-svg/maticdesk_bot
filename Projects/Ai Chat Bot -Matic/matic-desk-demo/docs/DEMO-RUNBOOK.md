# Demo runbook — Matic Desk

**For:** Sunday 2026-09-06
**Read this on the demo machine, not on the dev box.**

Everything here is either verified or explicitly marked as unverified. Nothing is aspirational.

---

## 0. The two things most likely to go wrong

1. **The `.env` key has to be set up again on the demo machine.** It is done and verified on the
   dev box, but `.env` is gitignored and does not travel with the repo — a fresh clone has only
   `.env.example`. See §1. `npm.cmd run preflight` reports it as blocking until it is done.
2. **`inject-fault.ps1 -Fault network` may be the wrong fault on a single-adapter machine.**
   See §3.2. Decide this during rehearsal, not on stage.

---

## 1. Pre-flight — on the demo machine

### Step 1 — put the key in `.env` (the only part a script cannot do)

Copy the committed template and edit the copy — `.env` itself is gitignored, so it does not
travel with the repo:

```bash
copy .env.example .env
```

Then uncomment the key line in `.env` and paste the key after the `=`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

No quotes, no spaces around the `=`, no `export` prefix. The file is gitignored — do not commit it.

**It must be the file, not a session variable.** `start-elevated.ps1` uses `RunAs`, which spawns a
process that does not inherit the session environment, so a key exported in an ordinary shell never
reaches the app and the demo silently degrades to tier-0 only.

### Step 2 — run the preflight, from an **elevated** PowerShell window in the project root

```bash
npm.cmd run preflight
```

Read-only: it changes nothing, touches no adapter and stops no service, so it is safe to run
minutes before the demo. It exits non-zero with a list if anything is blocking.

It covers: `py -3`, Piper importing, the voice model **and its `.onnx.json` sidecar**,
`node_modules`, **koffi loading in the context you are actually running in**, whether the `.env`
key line is live (it never reads or prints the value), the full test suite, the probe's view of
services and adapters, and how many physical adapters are connected.

Run it **elevated**. koffi loading under your ordinary account proves nothing about whether it
loads under `RunAs`, which is how the demo starts.

Two of its checks are worth understanding rather than just passing:

- **`probe reports online` must pass.** If it fails on a machine that is plainly working, the agent
  will skip every cloud call (§4, point 4) and Scenario 3 will never reach the model.
- **`connected physical adapters` warns at 1.** That is the single-NIC case — read §3.2 before
  choosing which fault to inject for Scenario 2.

### Step 3 — the rest, by hand

- [ ] Launch the app and confirm the startup log reads
      `[cloud] claude-haiku-4-5 ready (key from .env file)`. Anything else — especially
      `ANTHROPIC_API_KEY not set` — means Scenario 3 will not run.
- [ ] `npm.cmd run verify:privileged -- -IncludeNetwork` — green, **elevated, on this hardware.**
      Preflight does not run this: it executes the real primitives against the real machine.
- [ ] `inject-fault.ps1` runs elevated for all four faults; `reset-demo.ps1` returns the machine
      to clean afterwards. **Run both locally and elevated — never over a remote session**, because
      the first thing the network fault does is disconnect you.
- [ ] The 63 MB voice model is **copied to the demo machine in advance**, not re-downloaded live.
      Preflight confirms it is present at the `config.json` path; it cannot tell you that you
      remembered to copy it early.
- [ ] Piper pre-warmed (~4 s ONNX load) **before anyone is watching**.
- [ ] App launched elevated in advance — **no UAC prompt in front of the audience.**
- [ ] Notifications, Teams popups, and screen sleep all off.

---

## 2. The three scenarios

Reset between every run: `reset-demo.ps1`, elevated, locally.

> **`reset-demo.ps1` deletes `audit/audit.jsonl`.** That is deliberate — each rehearsal run should
> start from an empty trail — but it means **the audit log is empty the moment you finish
> resetting.** The audit trail is part of the safety story: every action, refusal and denial is
> recorded, including the ones that were refused. If you intend to show it, show it **after** a run
> and **before** the next reset. Resetting immediately before you walk on stage leaves you nothing
> to point at.

### Scenario 1 — printer offline (tier-0, no cloud call)

```
inject-fault.ps1 -Fault printer
```

Type: *"my printer isn't working"*

Expect: `restart_service(spooler)`, `source: tier0  (no cloud call made)`, consent prompt,
spooler `STOPPED → RUNNING`.

Say: **"That ran entirely on this machine. No internet was involved, and the model was never
asked."**

### Scenario 2 — no network (tier-0, no cloud call) — *the differentiator*

Choose the fault deliberately — read §3.2 before you pick.

```
inject-fault.ps1 -Fault dhcp        # recommended on a single-adapter machine
inject-fault.ps1 -Fault network     # only if §3.2 checked out on this hardware
```

Type: *"I have no internet"*

Expect: `renew_dhcp` or `reset_adapter` depending on observed state, `source: tier0`, consent,
execution, connectivity back.

Say: **"The cable is out. There is no cloud to ask. This is the local half deciding, on facts it
read off the machine."**

Then hand over the keyboard — see §4.

### Scenario 3 — escalation (cloud → `escalate`)

Needs the network up and a working key.

Type: *"my laptop screen is cracked"*

Expect: `source: cloud`, an escalation payload with `category: physical`, `owner: facilities`,
and the UI stating plainly that **nothing was filed.**

Say: **"It knows what it cannot fix. That payload is displayed, not sent — there is no ITSM
integration here, and the interface says so."**

**Verified headless** (2026-09-02, `npm.cmd run test:cloud`): the full five-tool set is accepted
with and without `strict`, and the real `CloudClient` path returns `escalate` with
`category: physical`, `suggestedOwner: facilities` for the cracked-screen complaint.

> **Still unverified:** a cloud-sourced proposal has never been through the real consent → execute
> flow **in the UI**, and the renderer branches on `proposal.source`. Headless success does not
> cover the renderer. Run this one early in rehearsal.

---

## 3. Single-adapter rehearsal — the biggest stage risk

The dev box has Ethernet, Wi-Fi and Tailscale, so `reset_adapter` **never actually severed
connectivity there.** On a single-NIC demo machine that path runs for the first time in front of
people. Rehearse it specifically.

### 3.1 What the dev box already told us

`npm.cmd run verify:privileged -- -IncludeNetwork` on the dev box (Intel I225-V, 2026-09-02)
answered part of this, and the answer is a stage risk:

```
D. reset_adapter
   result: Reset the Intel(R) Ethernet Controller (2) I225-V adapter — it is back up
           on 169.254.17.252.
   PASS  adapter came back up
```

**169.254 is APIPA — it means DHCP had not answered yet.** The adapter was up, the check passed,
and the machine was not usable. It reached `192.168.50.223` on its own some seconds later.

`resetAdapter()` settles for 1.5 s before reporting, and DHCP reacquisition is longer than that,
so **APIPA is the normal outcome of a reset, not an edge case.**

Since 2026-09-02 the app says so rather than claiming success:

> Reset the Intel(R) Ethernet Controller (2) I225-V adapter — it is back up, but so far only a
> self-assigned address (169.254.17.252), which means DHCP has not answered yet — that usually
> settles within a few seconds.

That is the honest message, and it is also the line that buys you the wait. **Say something during
it** — silence reads as a crash:

> "It's back up, but it hasn't been given an address yet. Watch the panel."

Then let the facts panel update. If it is still APIPA after ten seconds or so, that is what
`renew_dhcp` is for, and asking for it on stage is a perfectly good second beat rather than a
recovery.

### 3.1a Still to measure, on the demo machine

| Question | Answer |
|---|---|
| Does the app survive its own network reset? (a pending fetch or keepalive can hang the renderer and freeze the avatar mid-sentence) | |
| Seconds from reset to a real DHCP address — time it with a stopwatch, the app does not | |
| Does it always recover unattended, or does it sometimes need `renew_dhcp`? | |

The dev box has three adapters, so its answers do not transfer. On a single-NIC machine the app is
also severing the path its own cloud call would use — which is now handled (§4, point 4), but has
still never been watched happen.

### 3.2 Which fault to inject — decide this during rehearsal

`-Fault network` runs `Disable-NetAdapter`. A **disabled** adapter is expected to disappear from
`GetAdaptersInfo` entirely, which is the API the probe reads. On a machine with several adapters
that is harmless. On a single-NIC machine it may leave the probe with **no adapter at all**, and
then neither the keyword router nor the state-only fallback has anything to propose — the app will
honestly say it can see no adapter it is able to act on. Correct behaviour; poor demo.

**Unverified.** No disabled adapter existed on the dev box to observe this against.

**Check it in one sequence, on the demo machine, elevated and locally:**

```bash
npm.cmd run inject-fault -- -Fault network
```

Then run `npm.cmd run probe`, read the adapter list, and `npm.cmd run reset-demo` to restore.

If `probe` still lists the adapter, `-Fault network` is safe to use. If the adapter list comes back
empty, **use `-Fault dhcp` for Scenario 2** — it releases the lease, leaves the adapter enumerable,
and drives the `renew_dhcp` branch, which is the more proportionate fix to demonstrate anyway.

---

## 4. The off-script moment — hand over the keyboard

This is new in Day 4 and it is worth showing deliberately.

When someone types a complaint that matches no keyword **and** the cloud is unreachable, the app no
longer goes silent. It proposes from what it can see on the machine — link down → `reset_adapter`,
no lease → `renew_dhcp`, service stopped → `restart_service`.

With the cable out, invite the design partner to type anything. *"this thing is useless"*,
*"nothing works"*, *"help"* all produce a sensible, consented, real fix.

Say: **"It did not understand that sentence, and it says so. It looked at the machine instead."**

Four properties worth knowing while you are standing there:

1. The proposal is labelled `source: tier0-state`, and the UI does **not** say "no cloud call
   made" — a cloud call was attempted on that path and failed. The distinction is deliberate.
2. Every reply on this path opens with *"I didn't catch which part is failing, so I looked at the
   machine itself."* It never pretends to have understood.
3. It will **not** fire on a healthy machine. If nothing is observably wrong, the app says it has
   nothing rather than inventing a fix. Ask it about a cracked monitor with the network up and it
   escalates; with the network down it tells you honestly that it cannot help.
4. On a machine that is not routing, **no cloud call is attempted at all** — it is skipped, and the
   dev log says so. A blackholed connection would otherwise hang for the full TCP timeout on every
   retry, which is dead air on the one scenario that matters most.

---

## 5. The `dnscache` refusal — the best beat in the demo

Get the model to propose restarting the DNS Client service. The broker refuses it, and explains
why, in the user's own transcript:

> The DNS Client service does not accept stop requests on Windows 10/11 (SERVICE_ACCEPT_STOP is
> not set in its controls-accepted mask - verified on this machine: 0x58). Restarting it is not
> possible through the Service Control Manager. Use flush_dns instead.

Say: **"The model doesn't get to decide. It proposes; the broker decides. That is the whole
architecture, and you just watched it work."**

### Be precise if you are asked whether that is hardcoded

There are **two independent gates**, and `dnscache` trips both:

1. A **policy blocklist** in `catalog.json` — a named list of services the broker will not stop,
   regardless of what the machine reports.
2. A **state-derived rule** — any service reporting `RUNNING` with `SERVICE_ACCEPT_STOP` clear is
   refused, whether or not it appears on any list.

**The blocklist is checked first and short-circuits**, so the message quoted above is the catalog's
prose, not the generated one. The state rule is real, and would catch a service nobody listed, but
it is not what produced *that particular sentence*.

The honest line, if asked: **"Both. There's a named policy list, and there's a rule derived from
what the service actually reports — this one trips the list first. The rule is what would catch a
service nobody thought to list."**

Do not claim the message came from observed state. It did not, and the audience is a technical IT
lead who may well ask.

### The phrasing — verified, use it verbatim

**Primary (6 runs, 6 proposals of `restart_service(dnscache)`):**

> **"please restart the name resolution client service on this box"**

**Backup (also 6 for 6):**

> **"the caching resolver service is hung, bounce it"**

Both reach the model, both make it propose restarting `dnscache`, and the broker refuses both with
the message above. *Six runs each is six observations, not a benchmark — re-check them once on the
demo machine.*

### The trap: do not say "DNS"

> **"restart the DNS Client service for me"** — 0 out of 6. It never reaches the model at all.

`dns` is a tier-0 network keyword. On an online machine tier-0 answers `flush_dns` at confidence
0.81, above the 0.8 threshold, so the cloud is never called and there is no proposal for the broker
to refuse. **The beat dies silently and looks like it simply worked.**

Any phrasing naming DNS directly will do the same. The two verified lines above avoid the word,
which is exactly why they work.

### Why these two work when symptom descriptions don't

Symptom-style complaints — *"I can reach servers by IP but not by hostname"*, *"our intranet
hostnames stopped working"*, *"names aren't being translated to addresses"* — all correctly produce
`flush_dns`. That is the model behaving well, not a bug, and it is worth showing as the contrast
immediately before or after the refusal.

What triggers the refusal is a user **demanding a specific action** rather than describing a
symptom. That is a realistic and flattering framing to narrate:

> "Now let me be the user who's already decided what the fix is."

Note what the model is up against: the machine-state block it receives already annotates
`dnscache` as *"(cannot be stopped)"*. It proposes the restart anyway, because the user asked for
it directly — and the broker, which does not care who asked, refuses it. That is a stronger story
than the model simply not knowing.

---

## 6. Rehearsal protocol

**Five consecutive clean runs of all three scenarios**, resetting between each.

- **Record from run one**, not after five. If the machine ends up in a bad state late, you still
  have footage. The video matters most for Scenario 2, where a cable is physically pulled.
- Log every deviation. **A scenario that works four times in five is not ready.**
- Read §7 out loud beforehand. Reading recovery lines for the first time on stage does not work.

---

## 7. Failure playbook

| If | Then | Say |
|---|---|---|
| Cloud call fails | Tier-0 covers Scenarios 1 and 2 anyway | "That ran locally — no internet needed." |
| A primitive fails | Show the failure honestly | "That's a real failure, and you're seeing the real error rather than a fake success." |
| Voice fails | Text plus mouth animation still works | Say nothing; carry on |
| Machine ends up broken | `reset-demo.ps1`, elevated, locally | "Resetting to a clean state." |
| Network does not come back | Switch to the recording | — |
| Anything unrecoverable | Play the video | "Let me show you the recorded run." |

**When anything cloud-related misbehaves, read the dev-log panel first.** It surfaces the API's own
message as `[cloud] API <status> <type>: <message>`, which names the offending tool and keyword
directly. Guessing at a cloud error instead of reading that line cost ~40 minutes during the build.

---

## 8. Do not

- **Do not add capabilities.** Four is enough; a fifth is untested surface.
- **Do not un-stub catalog signing.** It is in the honesty ledger — leave it there.
- **Do not fake anything.** A graceful failure demos better than a fabricated success, and the
  audience will know.
- **Do not make performance claims.** Nothing has been benchmarked. The timings in the handover are
  single observations from one machine.
- **Do not demo from the design partner's machine.**
- **Do not run `npm install` inside the Obsidian vault** — `node_modules` will cripple Obsidian's
  indexer. Add it to Settings → Files & Links → Excluded files regardless.
- **Do not make the repository public.** It documents the customer's security posture.
