# Handover — post-demo work, 2026-09-02 evening

**Branch:** `post-demo` (17 commits, 25 files, +2769/−129)
**Merged:** nothing. `add-matic-desk-demo` is byte-identical to origin at `0254a8c`.
**Responds to:** `2026-09-02-claude-code-proceed-handover.md`
**Tests:** 7 suites, **204 assertions, 0 failures**

Read `PROJECT_START_HERE.md` first, then this. All three priorities from the proceed handover are
done. The freeze rule was honoured throughout: **nothing here touches the Sunday build.**

---

## 0. The rule still stands

Every code change resets the clean-run counter to zero (Day-4 §9). **Do not merge this before the
demo.** After Sunday, merge and restart clean-run counting from zero.

If you rehearse from this branch by mistake you will get different behaviour — `flush_dns` is now
refused on an offline machine, and `reset_adapter` on a healthy one. Check `git branch --show-current`
before a rehearsal.

---

## 1. Done — Priority 1: refusals are audited

**`280a107`.** Audit records were written by `execute()` only, so every refusal at `validate()` —
including the `dnscache` policy block that is the best beat in the demo — left no trace.

`validate()` now writes a record on every refusal, with `consentTokenId: null` because that is the
point of it. Each carries the capability, parameters as proposed, `proposal.source`, the reason, and
the **gate** that fired: `catalog`, `schema`, `tier-policy`, `policy-blocklist`, `machine-state`, or
`precondition`.

`AuditLog` gained `recordSync()` because `validate()` is synchronous by contract and had to stay so —
the id returns immediately, the write queues, `flush()` awaits it. `mintConsentToken()` and
`execute()` re-validate with `audit: false`, so one refusal produces exactly one record.

Verified against the real `audit/audit.jsonl`, not just a fixture. `test/audit.test.mjs`, 31
assertions.

**One deviation, deliberate.** The brief asked for outcomes `executed`/`failed`/`refused` *and* that
execute-path records be unchanged; those conflict, because execute writes `success` and `denied`. I
kept the existing values. If you want the rename it is a one-line change plus a `stage` field.

## 2. Done — Priority 2: OpenAI-compatible provider

**`df7526b`, `82c6a14`.** `src/agent/openai-compatible-client.js` — one adapter for Ollama, LM
Studio, vLLM, a customer endpoint or OpenAI. Returns an ordinary `Proposal` with `source: "local"`.
Off by default; `config.localModel.enabled` or `MATIC_LOCAL_MODEL` turns it on.

`src/agent/prompt.js` now holds the system prompt, machine-state block and escalation schema, shared
by both providers. **That is a correctness requirement, not tidiness:** the bake-off compares models,
and two providers wording the prompt differently would measure the wording.

**The finding that shaped it:** Ollama does not enforce tool schemas the way Anthropic `strict: true`
does. `gpt-oss:20b` reproducibly returned `suggestedOwner: "Adobe Support"`, which is not in the
enum. Every violation was on `escalate` — and escalations are *not* re-validated by the broker; they
go to the inspector and the transcript speaks the owner aloud. So the client enforces those enums
itself, with one repair turn, and never repeats an invented owner. Capability proposals are passed
through unrepaired on purpose, so the broker refuses and audits them.

`test/local-provider.test.mjs`, 41 assertions, plus a live turn that skips without an endpoint.

## 3. Done — Priority 3: the bake-off harness

**`0ffc06c`.** `eval/` — `cases.json` (40 labelled cases), `states.json`, `run-bakeoff.mjs`
(provider-agnostic), `bakeoff-all.mjs` (Ollama load/warm/unload), `README.md`.

Built as the Phase 3 eval: hand-written cases now, the customer's ticket export later, **runner
unchanged**. It drives the shipping provider rather than a reimplementation.

Metrics: capability accuracy, schema validity against the real broker, false actions **split by risk
tier**, escalation rate, median latency, cold load (separately), peak VRAM, and seconds per correct
proposal as the deciding number.

## 4. Done — results and hardening

**`071cb5e`, `506333e`, `cb5bf41`, `961c2c4`, `e464d01`.** Full detail in
**[`BAKEOFF-2026-09-02.md`](BAKEOFF-2026-09-02.md)**. Headlines:

**`mistral-small:24b` is the recommendation** — 35/40, 1.7 s per correct proposal, zero repair turns,
16 GB. It beats `claude-haiku-4-5`, which the demo ships and hub spec §11 certifies, on accuracy
*and* safety *and* cost. Not merely cheaper: better.

**False actions reaching the user are now zero** on mistral, gemma and Haiku; **zero R2 on all five
models**. Two interventions did it:

| | effect |
|---|---|
| Catalog preconditions (`reset_adapter requires machineOnline:false`, `flush_dns requires machineOnline:true`) | Refuses bad proposals before any consent prompt. Does not improve the model — contains it. Model-independent |
| Tool-description `whenNotToUse` | Halves wrong proposals **and adds 1–4 correct answers** on every model. Genuinely improves the model |

Confidence gating was tested and **rejected** — self-reported confidence overlaps between correct and
false answers on all five models. It looked clean on Haiku and would have done nothing on mistral.

`test/preconditions.test.mjs`, 14 assertions. The broker's machine probe is now injectable, which is
what made the state gate testable and scorable at all.

## 5. Done — environment

**`C:` was full: 0.4 GB free of 930 GB**, which had already failed a model pull and left no room for
the Sunday video backup. `OLLAMA_MODELS` had never been set, so Ollama had 188 GB at the default C:
path. Moved to `G:\AI\ollama\models`; **C: now has 198 GB free.**

Three layers point at G:: the app's own **Model location** setting (authoritative — it ignores
`OLLAMA_MODELS`), the user env var, and a directory junction at the old path. **Do not delete the
junction** — *Reset to defaults* in the Ollama settings pane would otherwise make every model vanish.

---

## 6. Open — yours, not engineering

Unchanged from the proceed handover:

- Rotate the Anthropic API key and update `.env`. **The bake-off used the current key** for 40
  synthetic requests.
- Delete the superseded standalone copy once the push is confirmed.
- `npm.cmd run preflight` and `npm.cmd run check:adapter` on the demo machine.
- **Five clean runs, recording from run one.** Time Scenario 2 recovery into the runbook.
- Record the video backup — there is finally room for it.

## 7. Open — engineering

**Blocked externally**

- **The golden set.** Top-30 L1 ticket categories with volumes, outstanding three weeks. The 40
  hand-written cases are a stand-in; `cases.json` is a data file so the export drops straight in.
- **`2026-09-02-ollama-provider-brief.md` is still missing.** Not on this machine. Its provider
  content is superseded by hub spec §12; its §5 (harness design) was never recovered, so the harness
  is built to my design, not the brief's.

**Known-imperfect, deliberately left**

- **`rst-01` / `rst-02` labels are probably wrong.** All five models proposed a gentler first step
  than the labelled `reset_adapter`. I think the models are right: the dataset encodes *the right
  fix* rather than *the right first step*. **Fix the labels, not the models.**
- `gpt-oss:20b` (4) and `qwen3.6:27b` (1) still let false actions reach the user. Neither is
  recommended; not worth chasing.
- No dollar cost model. Bedrock per-token pricing is unverified (hub spec §11), so "cost per correct
  proposal" is in seconds.
- Every number is one machine, 40 cases, one run pair. Not benchmarks.

**Raised in priority by this work**

- **Catalog signing now matters more than it did this morning.** The catalog carries safety-critical
  policy — `requires` preconditions are the only thing standing between a model and resetting a
  healthy machine's adapter. `verifyCatalogSignature()` is still stubbed. An unsigned catalog was
  always the trust root; it is now the trust root *and* the safety guard. Ledger item, unchanged in
  substance, materially more important.

**Unchanged, still design-only:** ticketing to the hub, named pipe / `NamedPipeBroker`, Windows
Service, ITSM integration. Hub: nothing built.

---

## 8. What I would do next, in order

1. **Sunday.** Merge nothing. Rehearse from `add-matic-desk-demo`.
2. **Merge `post-demo` after the demo**, restart clean-run counting from zero.
3. **Fix the `rst-01`/`rst-02` labels** before anyone quotes the accuracy numbers — they are the one
   place the dataset is arguably wrong, and every model spotted it.
4. **Decide the provider tier question.** You said hub-side; hub spec §12 says the adapter *is* the
   customer-hosted tier and §11 says managed inference is Bedrock. Both are off-endpoint and they are
   different products. The docs currently cover both because I did not want to narrow it for you.
5. **Un-stub catalog signing**, per §7.
6. **Re-run the bake-off against the real export** when it lands. Nothing about the harness changes.
7. **Extend preconditions to the remaining capabilities** only with measurement — two rules got the
   R2 rate to zero, and more rules mean more ways to refuse something legitimate.

---

## 9. Honesty ledger — additions

- **Nothing here is merged.** The Sunday build is unchanged and every claim in the demo runbook still
  holds for it. The runbook's "is that refusal logged?" answer keeps the frozen build's *no*, with
  the post-demo *yes* marked as applying only after merge.
- **"Zero false actions" means zero against 40 hand-written cases on one machine**, with two labels I
  believe are wrong. It is not a production claim.
- **Local models are still not production-ready** and §4's bar has not been met — that needs the real
  export, more than one machine, and numbers that hold twice.
- **Three flaws were found in this harness by reading its output rather than its code**: a VRAM
  column that sampled its baseline after the model loaded; `policy-blocklist` wrongly excluded from
  scoring; and the cloud path sampling at the API default while local models ran at temperature 0,
  which produced a one-case swing that would have been reported as a model difference. All fixed. The
  Day-4 lesson held: the bugs came from using the thing, not reading it.
