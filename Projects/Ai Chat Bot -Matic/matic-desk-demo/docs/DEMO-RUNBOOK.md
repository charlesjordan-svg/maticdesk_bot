# Demo runbook — Matic Desk

**For:** Sunday 2026-09-06
**Read this on the demo machine, not on the dev box.**

Everything here is either verified or explicitly marked as unverified. Nothing is aspirational.

---

## 0. The two things most likely to go wrong

1. **There is no `.env` file yet**, so the cloud half is currently dead and Scenario 3 cannot run.
   See §1, first item. This was the top item on the previous handover's list and is still open.
2. **`inject-fault.ps1 -Fault network` may be the wrong fault on a single-adapter machine.**
   See §3.2. Decide this during rehearsal, not on stage.

---

## 1. Pre-flight — on the demo machine, in this order

Each line is a thing to *observe*, not a thing to assume.

- [ ] **`.env` exists in the project root** containing `ANTHROPIC_API_KEY=sk-ant-...`
      **A file, not a session variable.** `RunAs` spawns a process that does not inherit the
      session environment, so an exported key silently never arrives and the app degrades to
      tier-0 only without saying anything you would notice mid-demo.
- [ ] Startup log reads `[cloud] claude-haiku-4-5 ready (key from .env file)`.
      If it reads `ANTHROPIC_API_KEY not set`, stop and fix it — Scenario 3 will not run.
- [ ] `.env` is gitignored. It already is; confirm you did not copy the repo in a way that lost it.
- [ ] `py -3` resolves, Piper imports, and the 63 MB voice model is **copied to disk in advance**,
      at the path in `config.json`. Do not re-download it live.
- [ ] `npm.cmd install` — **`npm.cmd`, not `npm`.** The execution policy blocks npm's `.ps1` shim.
- [ ] `koffi` loads in the **packaged / elevated** context, not only under `npm.cmd start`.
- [ ] `npm.cmd test` — all four suites green.
- [ ] `npm.cmd run verify:privileged -- -IncludeNetwork` — green, **elevated, on this hardware.**
- [ ] `npm.cmd run probe` — read the output. **`online: true` must appear**, and the primary
      adapter list must be non-empty. If `online` is false on a machine that is plainly working,
      the agent will skip every cloud call (§4, point 4) and Scenario 3 will not run.
- [ ] `inject-fault.ps1` runs elevated for all four faults; `reset-demo.ps1` returns the machine
      to clean afterwards. **Run both locally and elevated — never over a remote session**, because
      the first thing the network fault does is disconnect you.
- [ ] Piper pre-warmed (~4 s ONNX load) **before anyone is watching**.
- [ ] App launched elevated in advance — **no UAC prompt in front of the audience.**
- [ ] Notifications, Teams popups, and screen sleep all off.

---

## 2. The three scenarios

Reset between every run: `reset-demo.ps1`, elevated, locally.

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

> **Unverified:** a cloud-sourced proposal has never been through the real consent → execute flow
> in the UI, and the renderer branches on `proposal.source`. Run this one early in rehearsal.

---

## 3. Single-adapter rehearsal — the biggest stage risk

The dev box has Ethernet, Wi-Fi and Tailscale, so `reset_adapter` **never actually severed
connectivity there.** On a single-NIC demo machine that path runs for the first time in front of
people. Rehearse it specifically.

### 3.1 Measure these, and write the answers in

| Question | Answer on the demo machine |
|---|---|
| Does the app survive its own network reset? (a pending fetch or keepalive can hang the renderer and freeze the avatar mid-sentence) | |
| Dead air: adapter down → up → DHCP reacquired, in seconds | |
| Does connectivity return unattended, or does it need a nudge? | |

If the dead air is long, the avatar must say something during the wait. **Silence reads as a
crash.**

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

### Finding a phrasing that triggers it

**Not done — this needs a working API key and has not been rehearsed.** The model has to choose
`restart_service` with `serviceName: "dnscache"` on its own, and that is harder than it sounds:
DNS-flavoured symptom words hit tier-0's network keywords and resolve to `flush_dns` before the
cloud is ever consulted. The phrasing has to miss those keywords while still reading to the model
as a name-resolution problem.

Budget rehearsal time for this, and write the working phrasing in once you have it:

```
Phrasing that works: ______________________________________________
```

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
