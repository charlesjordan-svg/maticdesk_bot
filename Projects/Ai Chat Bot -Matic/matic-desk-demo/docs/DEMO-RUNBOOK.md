# Demo runbook — Matic Desk

**For:** Sunday 2026-09-06
**Read this on the demo machine, not on the dev box.**

Everything here is either verified or explicitly marked as unverified. Nothing is aspirational.

---

## 0. The two things most likely to go wrong

1. **The `.env` key has to be set up again on the demo machine.** It is done and verified on the
   dev box, but `.env` is gitignored and does not travel with the repo — a fresh clone has only
   `.env.example`. See §1. `npm.cmd run preflight` reports it as blocking until it is done.
2. **Use `-Fault dhcp` for Scenario 2, never `-Fault network`.** Settled by measurement — §3.2.

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

```bash
npm.cmd run inject-fault -- -Fault dhcp
```

**`-Fault dhcp`, not `-Fault network`** — settled by measurement (§3.2). It releases the lease,
leaves the adapter enumerable, and drives the `renew_dhcp` branch, which is the more proportionate
fix to demonstrate anyway.

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

**Verified in the UI, 2026-09-02.** The model escalates, the avatar says it would hand this to
facilities, and the inspector shows the payload.

**Two things to do while it is on screen:**

1. **Point at the EXECUTION panel and read it out.** It says: *"nothing executed — no ticket was
   filed. This is the payload that would be sent to the ITSM integration, which is not built."*
   The transcript now carries a red line saying the same thing, but the panel is the evidence.
2. **Do not type anything else until you have made that point.** The next turn overwrites all
   three inspector panels, and the payload is gone.

The reason this matters: the spoken line is *"I would hand this to facilities."* An audience can
hear that as *"a ticket has been raised."* Nothing was raised, and letting the room believe
otherwise is the one thing §13 exists to prevent.

> **Still unverified:** a cloud-sourced proposal that is a real *capability* — not an escalation —
> has still never been through the consent → execute flow in the UI. Both cloud turns run so far
> ended without executing: one escalated, one was refused by the broker. The renderer branches on
> `proposal.source`, and the `source: cloud` → consent → execute path has never run end to end.

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

### 3.2 Which fault to inject — settled: `-Fault dhcp`

**Measured on the dev box, 2026-09-02, `npm.cmd run check:adapter`:**

```
before:         6 adapters visible, 2 actionable, online=True
disabling Wi-Fi...
while disabled: 3 adapters visible, 1 actionable, online=True
```

**A disabled adapter disappears from the probe.** Confirmed, not inferred. `-Fault network` runs
`Disable-NetAdapter`, and the probe reads adapters through `GetAdaptersInfo`, which omits them.

On this dual-NIC box that is survivable — Ethernet was still there, so the router still had a
candidate. **On a single-NIC demo machine there would be nothing left**, and Scenario 2 would
produce the honest *"I can see no network adapter here that I am able to act on"* instead of a
demo. Correct behaviour, wasted scenario.

So: **`-Fault dhcp`.** It releases the lease, the adapter stays enumerable with a live link, and
tier-0 takes the `renew_dhcp` branch.

Two details worth knowing:

- Disabling one adapter removed **three** entries, not one — Wi-Fi plus the two Microsoft Wi-Fi
  Direct virtual adapters that depend on it. Nothing should assume one disable equals one adapter.
- Six went down, **five** came back: one Wi-Fi Direct virtual adapter did not re-register.
  Cosmetic — all four real adapters returned, `actionable` was back to 2, the machine was online —
  but if you cycle adapters repeatedly in rehearsal, expect the count to drift.

**Re-run `npm.cmd run check:adapter` on the demo machine** if it is a different box. The mechanism
is settled; whether that box has a second adapter to fall back on is not.

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

## 4a. When there is nothing to fix — the offline guidance

Added 2026-09-02, after Ethernet was physically unplugged and Wi-Fi switched off on the dev box.

The four capabilities can restart a service, flush DNS, renew a lease and reset an adapter. **None
of them can plug in a cable or switch a radio on.** So when the machine is offline and no
capability applies, the app says what it can see and hands the job over:

> **Nothing on this machine has a network link.**
> All 2 network adapters are switched on but none has a connection — that is a cable or a radio,
> not something I can fix in software.
>
> ┌ **OVER TO YOU — THINGS I CANNOT CHECK FROM HERE**
> │ 1. **Check the network cable** — both ends, and look for a light on the port.
> │ 2. **Check Wi-Fi is switched on** — Airplane Mode off, physical switch or Fn key.
> │ 3. **Check the adapter is not disabled** — `ncpa.cpl`. A disabled adapter is invisible to me.
> │ *Once you have tried those, tell me and I will take another look.*

Three states, each with its own checks: **no adapter visible at all** (everything disabled — and a
disabled adapter is invisible to the probe, §3.2), **adapters present but nothing has a link** (the
unplugged case), and **a link but no usable address and nothing to act on** (points upstream at the
router).

Guidance only: no proposal, nothing privileged, and it never claims to have acted.

### It took two passes to make this land, which is the point worth telling

The first version answered with a paragraph about what it could not do. The second listed the
checks — but rendered them **before** the headline, in the same grey style used for system logging,
with no call to action. The tester read straight past them: *"I didn't realise those instructions
were for me."*

So the order is now headline → cause → card → next step, and the card is deliberately shaped like
the consent prompt, because that is already the established visual language for **this one needs
you**. Same information, and the difference between it working and not working was entirely
presentation.

**This is worth demoing deliberately.** Unplug the cable with no fault injected:

> **"It knows the difference between something it can fix and something you have to go and look at.
> It doesn't guess, it doesn't pretend, and it tells you whose turn it is."**

### The bug this found

Windows keeps a **stale default gateway** on a Wi-Fi adapter after the radio is switched off, so it
stayed in the router's `actionable` set while having no link and no address — and the router
proposed **renewing a DHCP lease on a switched-off radio**, and would have reset it. Neither can
work.

Every adapter action now requires a **live link**, in both the keyword router and the state-only
fallback. Link-down with no address is physical, and goes to the guidance above instead. Scenario 2
is unaffected — `-Fault dhcp` leaves the link up — and a regression test pins that.

---

## 4b. The consent prompt explains itself

Added 2026-09-02, after a tester approved an action and said: *"I feel like I approved that with
not enough information."*

The card had shown the catalog's engineering description — *"Idempotent - no rollback needed"* —
and the label *"tier R1"*. Both accurate, neither useful to the person whose machine it is.

The card now reads **"Permission needed — Low risk"**, describes the action in plain language, and
carries a **"What is this, and why?"** button. Collapsed by default, so the card stays short.
Expanded, it answers four questions, in this order:

| | |
|---|---|
| **Why this, here** | The proposal's own reasoning — the only part specific to *this* problem |
| **What you will notice** | The cost. Amber for the disruptive one. |
| **Can it be undone** | Plainly, including when the answer is "not exactly" |
| **Why it usually helps** | The general case |
| **Risk level** | "Low risk. Affects one thing, and can be undone." |

### The part worth saying out loud on stage

**That text lives in `catalog.json`, not in anything the model generates.**

The explanation a user consents to must not be written by the thing asking for the consent.
Keeping it in the catalog means it is reviewable, it gets signed with the rest of the catalog when
signing is built, and it reads identically whether or not the cloud is reachable — the offline
scenarios get the same explanations as the online ones.

> **"The model can ask for permission. It doesn't get to write the permission slip."**

Tests pin it: every capability must supply all four fields, a jargon list is rejected outright, and
`reset_adapter` must spell out that **every** connection drops and how long it may take to return.

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

### And if you are asked "is that refusal logged?"

**No — not this one, and you should say so.** Verified on 2026-09-02: after the refusal rendered in
the UI, `audit/audit.jsonl` was still empty.

Audit records are written by `execute()` only — outcomes `success`, `refused` and `denied`, each
tied to a consent token. This refusal happens earlier, at `validate()`, before a consent token is
ever minted and before anything is attempted against the machine. The renderer shows it and stops.

The honest answer: **"The audit log records what was attempted against this machine. Nothing was
attempted here — it was refused before it got a consent token. The refusal is in the user's
transcript, not the audit trail. Logging pre-consent refusals is a fair thing to want, and it isn't
built."**

That is a Phase 1 item, not a Sunday item. Do not describe the audit trail as covering refusals
without qualifying it — §7 of the handover claims audit coverage "across successes, refusals and
denials", and that is true of `execute()`, which is where those tests drove it from. It is not
true of the pre-consent path this beat uses.

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

## 6a. The video backup

The playbook below says "play the video" twice. This is how you have one.

**What it is:** a screen recording of a clean end-to-end run, held locally on the demo machine, so
that if the live demo breaks you show the recorded run instead of debugging in front of the design
partner.

### Record from run one

Not after five. If the machine ends up in a bad state late in rehearsal — and Scenario 2 is the one
that can do that — you still have footage of it working. A recording you did not make because you
were planning to make a better one later is the most common way to end up with none.

### Capture the whole window, including the Broker Inspector

The panels are the evidence. A recording of just the chat column loses the consent token, the
validation verdict, and the `CONSENT –` / `EXECUTION –` pair that carries the `dnscache` beat.

**Use Display Capture, not Window Capture.** The app runs elevated, and unelevated recorders often
cannot capture an elevated window — they record a black rectangle. Display capture goes through
desktop duplication and does not care. If you use Xbox Game Bar (`Win`+`Alt`+`R`), **test it
against the elevated app before relying on it**; it is a window recorder and may refuse.

**Record system audio.** The Piper voice is part of the demo, and a silent recording of a talking
avatar is worse than no recording.

### What to capture, in one take

1. Scenario 1 — printer, `source: tier0`, `STOPPED → RUNNING`
2. Scenario 2 — `-Fault dhcp`, the cable out, tier-0 recovering the machine
3. The off-script moment — someone typing "this thing is useless" with no network (§4)
4. The `dnscache` refusal (§5)
5. Scenario 3 — escalation, with the EXECUTION panel visible (§2)

One take per scenario is fine; one take for all five is better, because it shows the machine
surviving the whole sequence.

### The part people get wrong

**Keep the file on the demo machine's local disk.** Not Drive, not YouTube, not a share.

The failure you most need it for is *"the network did not come back"* — and a video that needs the
network to play is worthless in exactly that moment. Have the file open in a player and paused
before you start, on a second desktop or minimised, so recovery is one keystroke rather than a
scramble through Explorer while the room watches.

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
