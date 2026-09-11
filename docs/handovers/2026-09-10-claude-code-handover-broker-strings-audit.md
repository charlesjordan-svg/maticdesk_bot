# Claude Code handover — the broker's strings, AUDITED and fixed

**Asked for** directly, against the honesty ledger of
[`2026-09-10-claude-code-handover-panel-vocabulary-built.md`](2026-09-10-claude-code-handover-panel-vocabulary-built.md)
§6, which said the `error`/`detail` split stopped at `fileTicket` and that the broker-derived strings
were *"likelier to be fine — but 'likelier to be fine' is not 'checked', and nothing tests them."*

**They were not fine.** **Repo:** `main`, one commit on top of `a66ae43`. **Register:** §5.31,
**D247** (done) and **D248** (proposed, awaits Charles).
**Client tests: 1048 assertions across 16 files, all green** (was 1012).

---

## 1. The audit

Everything the renderer can put through `say()` that originates in the broker. Reachability is
stated because it varies enormously, and two of the worst are on the happy path.

| # | String | How it reaches the user | What it contained |
|---|---|---|---|
| **B1** | `exec.message`, successful service restart | **Every successful `restart_service`** | `spooler`, `audiosrv` — registry keys |
| **B2** | `exec.message`, executor threw | Any Win32 failure | `That did not work: OpenServiceW(spooler) failed (Win32 error 5)` |
| **B3** | `exec.message`, `needsBroker` | Unelevated run of a privileged action | `the privileged broker` + the raw Win32 message |
| **B4** | `exec.message`, consent-gate refusals | **Ordinary** — the consent window is 120 s | `no consent nonce was presented - nothing was executed` |
| **B5** | `exec.message`, re-validation at execution | State changed while the card was up | `refused at execution time:` + gate messages (capability ids, GUIDs, control masks) |
| **B6** | `rendered.rollbackNote` | **Every R1/R2 consent card** | `this can be undone with: reset_adapter` |
| **B7** | `rendered.detail` | **Every consent card** | `restart_service(serviceName=spooler)` |
| **B8** | `prepared.error` | `prepareConsent` refusal — **no fallback guarding it** | `refusing to prepare consent for an invalid proposal: …` |
| **B9** | `validation.errors[0]` | Only if a provider returns no `reply` | capability ids, GUIDs, `0x58`, `SERVICE_ACCEPT_STOP`, `Service Control Manager`, `flush_dns` |
| **B10** | `agent:propose` threw | Any unhandled exception in the agent | the raw JavaScript exception message |

The sharpest one is **B1**, because it is the demo. *"Restarted the spooler service"* is said to
someone whose printer has stopped, and `spooler` is a registry key — a user who went looking for that
service in Windows would not find it, because Windows calls it **Print Spooler**.

---

## 2. What was fixed (D247)

The D246 pattern, one layer down: **what the broker SAYS is separate from what the broker KEEPS**,
and nothing was deleted — every diagnostic moved to `detail` and is still in the audit record.

- **B1** — the catalog carries `plain.serviceNames`, mapping each member of the `serviceName` enum to
  **what Windows itself calls it** (`services.msc`'s display name — not our key, and not a euphemism
  we invented). Catalog data for the same reason `plain.*` is: it is text a user reads, so it is
  reviewable and signable. A test fails if an enum member has none.
- **B2 / B3** — plain sentences; `detail.win32` is new and carries the call site. `detail.code` and
  `.call` were already there and the audit record's `error` object is untouched.
- **B4 / B5** — each is a pair now: a spoken sentence, and an audited string that keeps the
  protocol's vocabulary because the record exists to answer what the gate did.
- **B6** — the rollback resolves to the capability's **title**.
- **B8 / B9 / B10** — the renderer and the main process no longer interpolate a diagnostic into
  speech at all. Both are one line up in the inspector, where `checked()` and `consented()` already
  put them, and `prepareConsent`'s refusal now also goes to the developer log.
- **Also**: `say(replyText ?? …)` became `||`. `??` falls back only on `null`/`undefined`, so a
  provider returning an empty `reasoning` made the avatar **speak silence**.

## 3. What was deliberately NOT changed

- **`validate().errors` still name capability ids, GUIDs and control masks.** That is the gate
  explaining itself; it goes to the inspector and the audit record, and three test sections assert
  its content. What changed is that the renderer stopped putting one in the avatar's mouth.
- **"Flushed the DNS resolver cache." / "Renewed the DHCP lease."** Jargon-adjacent — and Microsoft's
  names for real things, matching the catalog's own titles. Whether the spoken success line should
  use `plain.what`'s wording instead is product copy, not a defect. **Flagged, not decided.**
- **B7 — the consent card's exact call.** See §4.

## 4. B7 is D248, proposed — and needed no contract change to improve today

`rendered.detail` is `restart_service(serviceName=spooler)`, and **it is deliberate**: `broker.d.ts`
defines it as the exact call built from the validated parameters, `docs/D130-RENDERER-CHECK.md`
checks it by name, and it was verified on screen on 2026-09-03 and ticked.

It is also our identifier and a registry key, in a function-call signature, on the one screen where a
person grants permission — **which is precisely what D244 refused to hide on the review card and
glossed instead.** The same answer applies: plain language above, the exact call below and
subordinate.

**That is a change to the rendered contract** — a new field, which the pipe protocol serialises — so
it is proposed and not done. **What was done needs no decision:** the renderer paints that field in
the review card's raw-value treatment (mono, a step down, subordinate by size and position) instead
of as body prose the same size as the sentence above it. **Not one byte of the text changed.** D130's
verbatim rule is intact and the field-for-field check still passes. If the answer is no, the styling
stands on its own.

## 5. The check page returned success and only success

`execute()` always resolved to a canned *"Printing is running again"*, so **none of the three
failed-fix paths had ever been rendered.** Three one-shot triggers drive them now, and driving them
immediately found a defect **introduced in this pass**: the rewritten `needsBroker` sentence
explained the same thing as the `.turn-note` directly beneath it, in different words — D245's defect,
and it does not read wrong until you see the two together. It is short now; the note explains.

Two fixture defects went with it: the canned consent `rendered.detail` was a paragraph of prose where
the real broker produces `capabilityId(param=value)`, so the card on the check page had never shown
that field in the form the app renders.

`client/docs/PANEL-RENDERER-CHECK.md` has a new **§4a** for all of it, including how to reach each
branch in the real app.

---

## 6. Honesty ledger

- **The Scenario 1 money line changed, and it is a line Charles demos.** `describeServiceRestart`'s
  comment says the wording is "kept verbatim" and a test pinned the whole string. **What that freeze
  was protecting is the BEFORE → AFTER pair** — the three assertions around it are all about a real
  restart not reading as a no-op — and that is untouched. The service NAME was incidental to the
  argument and was our key. **It now reads *"Restarted the Print Spooler service — it went STOPPED →
  RUNNING."* If that is wrong for the demo, it is one line.**
- **Nobody has watched any of this in Electron**, and the privileged path (B2/B3) needs elevation to
  reach at all. `privileged.test.mjs` is not in `npm test` for that reason and was not run.
  Everything here was driven through the fake bridge or through `broker.test.mjs`, which exercises
  the real broker but only `flush_dns` (the one capability that works unelevated).
- **The five new sentences are my wording and nobody has been asked about them.** The tests check
  that each path HAS a line and that it names nothing of ours; they do not check it is a good line.
- **`plain.serviceNames` are Windows' display names as I believe them to be** — Print Spooler,
  Windows Audio, DNS Client, DHCP Client. **Not read off a machine.** Three of the four are unlikely
  to be wrong; none was verified against `services.msc`, and `dnscache`/`dhcp` cannot be restarted
  anyway (one is blocklisted).
- **I did not audit the catalog's `plain.*` prose itself**, only the strings the broker assembles
  around it. The blocklist message (`policy.serviceStopBlocklist.dnscache`) is a fully technical
  paragraph naming `SERVICE_ACCEPT_STOP`, `0x58` and `flush_dns` — it reaches the inspector by
  design, and it can no longer be spoken, but **if a future surface prints a refusal reason it will
  print that.**
- **§5's defect was mine, found by looking.** That is the second time in three passes that driving
  the check page caught something the tests could not, and both times it was a sentence that read
  fine alone.
