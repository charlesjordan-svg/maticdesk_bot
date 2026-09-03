# Handover — Day 4

**Date:** 2026-09-02
**Deadline:** Sunday 2026-09-06
**Responds to:** `2026-09-02-claude-code-day4-completion-brief.md`
**Repo:** `charlesjordan-svg/maticdesk_bot` @ `add-matic-desk-demo` (private)
**Working copy:** `C:\Users\Charles\Downloads\maticdesk_bot\Projects\Ai Chat Bot -Matic\matic-desk-demo`

**118 automated checks green.** 17 commits, 21 files, +2,173 / −51.

---

## 1. Status against the Day-4 exit criteria

| | Criterion | |
|---|---|---|
| ✅ | Single canonical repository | Standalone repo still to be **deleted by you** — §2 |
| ✅ | State-only tier-0 fallback, tested off-script | |
| ✅ | Cloud-sourced proposal through the UI | consent → execute → audited |
| ✅ | `dnscache` refusal beat rehearsed | phrasing verified 6/6 |
| ✅ | Scenario 2 fault choice | settled by measurement — use `-Fault dhcp` |
| ✅ | `docs/DEMO-RUNBOOK.md` written, incl. failure playbook | |
| ⬜ | Scenario 2 five times, recovery time measured | needs a stopwatch |
| ⬜ | Five consecutive clean runs | needs the current build |
| ⬜ | Video backup | see runbook §6a |

**The three open items all need a person, a machine and a recording.** Nothing is blocked on code.

---

## 2. Repository — one thing left for you

Both repos held **byte-identical committed content across all 35 files** when reconciled, so nothing
was lost. Canonical is now the clone above; every commit today is pushed.

`C:\Users\Charles\Downloads\matic-desk-demo` is **superseded** and carries a `SUPERSEDED.md` saying
so. Delete it once you are happy the push looks right. Its Day-4 changes exist only as uncommitted
working-tree edits and are already committed here.

Repo confirmed still **private** (anonymous API → 404). Keep it that way — it documents the
customer's security posture.

---

## 3. What was built

### The state-only tier-0 fallback (the one code change the brief asked for)

`routeByState()` in `src/router/tier0.js`, called **only** from the cloud-unavailable path.
Link down → guidance; no lease → `renew_dhcp`; service stopped → `restart_service`. Every
confidence sits below `TIER0_CONFIDENCE_THRESHOLD`, so it cannot pre-empt a reachable model even if
mis-called.

Off-script complaints — *"this thing is useless"*, *"nothing works"*, *"help"* — now produce a
sensible, consented, real fix instead of silence.

Two things fell out of building it:

- The DNS branch first fired on `probe.online` alone, which answered *"my monitor is cracked"* with
  *"I can flush your DNS cache"*. **`broker.test.mjs` case 10 caught it.** It now requires observed
  egress failure. Nothing observably wrong yields no proposal.
- On a machine that is not routing the cloud call is **skipped outright**, not attempted and failed.
  A blackholed connection hangs for the full TCP timeout on every retry.

### Two new stage tools

```bash
npm.cmd run preflight        # read-only; automates the runbook §1 checklist
npm.cmd run check:adapter    # settles the Scenario 2 fault choice, re-enables in a finally
```

### Offline guidance (`src/router/offline-guide.js`)

The four capabilities cannot plug in a cable or switch on a radio. When nothing applies, the app
now says what it sees and hands the job over, as a card that looks like instructions.

### The consent prompt explains itself

Plain-language `what` / `why` / `notice` / `undo` per capability, plus plain tier labels, behind a
**"What is this, and why?"** disclosure. **That text is catalog data, not model output** — the
explanation a user consents to must not be written by the thing asking for the consent.

### Facts panel identity

`computer` and `user`, above the diagnostics. **Deliberately not sent to the model**; two tests
assert the cloud payload carries neither.

---

## 4. Bugs found — every one by using it, not by reading it

| Found by | Bug |
|---|---|
| `verify:privileged` | `reset_adapter` reported success quoting a `169.254` APIPA address |
| Cloud→consent run | A real restart read as `RUNNING → RUNNING`, i.e. a no-op |
| A screenshot | "Nothing was filed" lived in a panel the next turn overwrote |
| Unplugging the cable | Router would renew DHCP on a **switched-off radio** (stale gateway) |
| Unplugging the cable | Offline guidance read as system logging, not instructions |
| Approving `flush_dns` | Consent card explained itself in engineer-speak |
| The fix for that | `display:flex` beat `[hidden]`, so the collapse never collapsed |

**Not one would have surfaced from reading the code.** The lesson for the remaining rehearsal:
run it, do not inspect it.

---

## 5. Deviation from the brief, and why

The brief specified **"adapter link down → `reset_adapter`"**. Reasonable on paper; wrong in
practice, and reality said so within a day.

Windows keeps a **stale default gateway** on a Wi-Fi adapter after the radio is switched off, so it
stayed in `actionable` while having no link and no address. The router would have proposed renewing
a lease on a dead radio, and resetting it. Neither can work.

**Every adapter action now requires a live link**, in both routers. The state-only `dark` branch
additionally requires the adapter to still hold an address — link lost but address retained means
recently working and plausibly wedged, the only case a reset helps. Link-down with no address is
physical, and goes to the guidance instead. Scenario 2 as demoed is unaffected and a regression
test pins that.

---

## 6. Honesty ledger — additions

Everything from §7 of the previous handover still stands. Three things learned today:

- **The `dnscache` refusal is not audited.** Audit records are written by `execute()` only, tied to
  a consent token. That refusal happens at `validate()`, before a token exists. Verified: the audit
  log was empty afterwards. Previous handover §7 claims audit coverage "across successes, refusals
  and denials" — true of `execute()`, **not** of the pre-consent path the demo beat uses.
- **The `dnscache` refusal message is the catalog blocklist string, not the state-derived one.**
  Both gates exist and it trips both, but the blocklist is checked first and short-circuits. Do not
  claim on stage that the message came from observed state.
- **`reset-demo.ps1` deletes the audit log.** Show the trail after a run, before the next reset.

---

## 7. Phase 1 — planning

### 7.1 Ticketing to the Hub

Full design note: **[`PHASE1-TICKETING.md`](PHASE1-TICKETING.md)**. Summary of the decisions:

- **Reuse the consent flow.** "Validate the ticket before sending" is propose → validate → show the
  user exactly what will happen → single-use token bound to a hash → execute → audit. Do not invent
  a second approval mechanism.
- **Give egress its own tier.** R1/R2 describe local disruption. *"This leaves the machine"* is a
  different thing to ask someone to weigh, and the consent card should say so.
- **Screenshots are the risk.** Exact image shown full size before approval; user-chosen region,
  never the full desktop by default; opt-in per ticket; nothing captured speculatively; audit
  records a hash, never the image.
- **Offline:** either refuse plainly or queue — and **a queue is a whole subsystem**. Do not build
  one by accident.
- **Idempotency keys from day one**, not after the first duplicate ticket.

### 7.2 Server-side — what the Hub has to decide

None of this is designed yet. It is the list of things that will block the client work if left.

**Transport and identity**
- How does a machine authenticate to the Hub? A per-device credential is the obvious answer, and
  it raises enrolment, rotation and revocation — all of which are fleet problems, not app problems.
- **The client must never hold a shared secret that would let one machine file as another.**
- mTLS or a signed device token both work. Decide before the client is written, because it changes
  where credentials live and therefore what the broker has to protect.

**API shape**
- `POST /tickets` with a client-generated idempotency key, returning a ticket ID.
- Attachments: separate upload returning a handle, referenced by the ticket — not inline base64 in
  the ticket body. Screenshots are large and a failed retry should not re-send them.
- **Size and type limits enforced server-side**, and the client told what they are rather than
  discovering them by rejection.
- Versioning from the first release. This client will be in the field longer than the API is stable.

**Data handling — the questions the IT lead will ask**
- What is retained, for how long, and who can read it?
- Is the transcript stored, and is it stored separately from the ticket body?
- Are screenshots scanned or redacted, or stored as supplied?
- Is any of it used for training or analytics? **The answer needs to be written down before the
  first ticket is filed**, not after.

**Operational**
- What does the client do when the Hub returns 5xx, or is unreachable? See the queue question above.
- Rate limiting per device, so a looping client cannot flood the Hub.
- A way to correlate a ticket back to the **local audit record**, so a support engineer can see
  which local actions were taken before the escalation. The audit record should carry the ticket ID
  and the ticket should carry the audit IDs.

### 7.3 The broker as a Windows Service

Still Phase 1, still not built, and unchanged from the original plan — but worth restating since it
is the other "server" in this architecture:

`src/main/main.js` is **the only file that names a broker implementation**. Swapping
`InProcessBroker` for `NamedPipeBroker` there is the entire change at the call sites. The contract
lives in `src/broker/broker.d.ts`.

What that change brings with it:

- **Pipe ACLs.** Only the intended client should be able to open the pipe, and the service must
  verify the caller rather than trusting the connection.
- **The consent token becomes a cross-process artefact.** It is currently minted and redeemed in
  one process. Over a pipe it needs a lifetime, a replay window, and a decision about whether the
  *service* or the *client* owns the timer. It should be the service.
- **Catalog signing stops being optional.** Today an unsigned catalog is loaded with a loud warning.
  A privileged service reading a catalog it cannot verify is a different proposition entirely — the
  catalog becomes the trust root of something running as SYSTEM.
- **Audit moves.** The log must live somewhere the unprivileged user cannot alter. That is a
  service-side responsibility and is currently a file next to the app.
- **Service lifecycle:** install, upgrade, rollback, and what happens to an in-flight consent token
  when the service restarts mid-execution.

---

## 8. Do not

- **Do not add capabilities.** Four is enough; a fifth is untested surface.
- **Do not build ticketing, the named pipe, or the Windows Service before Sunday.** The demo's
  honesty rests on the escalation payload being displayed and not sent.
- **Do not un-stub catalog signing.** It is in the ledger; leave it.
- **Do not make performance claims.** Nothing is benchmarked. Every timing in these documents is a
  single observation.
- **Do not demo from the design partner's machine.**
- **Do not make the repository public.**

---

## 9. First thing on Thursday

**Restart the app**, then start counting the five clean runs from zero. Today changed the renderer,
the catalog and both routers — the runs have to be against the current build.

If the demo machine is a different box: `npm.cmd run preflight` and `npm.cmd run check:adapter`
there, and `.env` set up again — it is gitignored, so a fresh clone gets only `.env.example`.
