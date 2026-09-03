# Claude Code Handover — 2026-09-03 — questions and follow-ups after `74ae434`

**Repo root:** `C:\Users\Charles\Downloads\maticdesk_bot`
All repo paths below are relative to that root. All non-repo paths are absolute.

**Context:** five commits landed and pushed. Two-step consent (D130) is implemented, the XFAILs are
promoted, the B0 hub skeleton is in `server/`, the endpoint has a hub provider, and the register is
at D165 with OPEN-9 added.

**Key files for this handover:**

| Purpose | Path |
|---|---|
| Decision register (authoritative) | `docs/decisions/DECISION-REGISTER.md` |
| Consent protocol design | `client/docs/2026-09-03-consent-protocol-design.md` |
| Attack notes on that design | `client/docs/2026-09-03-consent-protocol-attack-notes.md` |
| The demonstrated finding | `client/docs/CONSENT-SURFACE-2026-09-03.md` |
| Broker contract | `client/src/broker/broker.d.ts` |
| In-process broker | `client/src/broker/in-process-broker.js` |
| Consent regression test | `client/test/consent-surface.test.mjs` |
| Broker unit tests | `client/test/broker.test.mjs` |
| Bake-off runner | `client/eval/run-bakeoff.mjs` |
| Bake-off results | `client/docs/BAKEOFF-2026-09-02.md` |
| Hub entry point | `server/src/index.js` |
| Hub turn handler | `server/src/turn.js` |
| Hub providers | `server/src/providers/` |
| Hub tests | `server/test/turn.test.mjs` |
| Generic KB content | `docs/kb/generic-kb-v2.json` |
| Session orientation | `CLAUDE.md` |

**Referenced but outside the repo** (read-only, do not move without asking):
`C:\Users\Charles\Downloads\Happy People\04-TEAM-REVIEW-AND-DATA-REQUEST.md` — §9 A2 is the source of
the product exit criterion quoted at the end of this document.

---

## Part 1 — Questions

Answer in a short reply, or as a note at `docs/2026-09-03-handover-answers.md`. Where the answer is
"I don't know," say so — do not reconstruct.

### Q1. Did the bake-off through the hub reproduce 35/40? **(the one that matters)**

Commit `80705ef` says "bake-off through the hub." Acceptance rests on `client/eval/run-bakeoff.mjs`
against `mistral-small:24b` with `provider: "hub"` landing within noise of the **35/40**
post-hardening result recorded in `client/docs/BAKEOFF-2026-09-02.md` §2b for the direct path.

- What was the number?
- If it moved: which cases changed, and in which direction?
- If it did not run: say so. This is the single finding B0 exists to produce; everything else in the
  skeleton is scaffolding around it.

A hub that alters the request is exactly the bug this catches, and it is far cheaper to find now than
after retrieval and prompt assembly are layered on top.

### Q2. What are D162–D165, and what is OPEN-9?

Commit `74ae434` names them but not their content. One line each from
`docs/decisions/DECISION-REGISTER.md` is enough. Specifically: does **OPEN-9** correspond to the
code-signing certificate item, or to something else that came out of the work?

### Q3. Did the three verifications run, and what did they return?

From `C:\Users\Charles\Downloads\2026-09-03-claude-code-handover-first-build-steps.md` Task 5:

1. **`WTSQueryUserToken` / `WTSQuerySessionInformation`** as the broker's route to the interactive
   session's logon SID (D148). Blocks A4; it is what closes OPEN-1.
2. **ONNX Runtime on ARM/Graviton** for the embedder shortlist in
   `docs/decisions/sources/2026-09-02-fable-design-review.md` A1. **The one item that could change
   the embedder pick outright**, and the pick blocks all KB retrieval work.
3. **KCS (Consortium for Service Innovation)** — whether §3 of the generic KB schema document holds.
   That document is not in the repo (see A3); its §3 is unverified memory and is labelled as such.

Commit `74ae434` mentions "§10.4 verifications," which suggests some landed. Which, and with what
sources?

### Q4. Was the strong-form `[VERIFY]` resolved?

`client/docs/2026-09-03-consent-protocol-design.md` §5 defers the broker-owned consent window — the
only thing that *prevents* a compromised agent painting different pixels rather than merely making
the lie attributable. The deferral is justified by the cost of session-0 isolation,
`WTSQueryUserToken` and `CreateProcessAsUser`, and **that justification is cited from memory.**

If Q3 item 1 ran, the same APIs are involved and the answer may already be in hand. This matters
because the deferral is currently reasoned rather than evidenced, and it is what a security reviewer
will press on.

### Q5. What did F1 look like in the shipped code?

`client/docs/2026-09-03-consent-protocol-attack-notes.md` F1 says the broker retains a
`structuredClone` of the proposal and returns a clone of the `ConsentRequest`, pinned by
`client/test/broker.test.mjs` §6.

**Confirm both halves are cloned.** Retaining a clone but returning the live `ConsentRequest` object
would leave the same hole facing the other direction.

### Q6. Is `restart_service(spooler)` a fair substitute in the regression test?

The attack notes observe that the original pair is now unstageable: `flush_dns` requires
`machineOnline: true`, `reset_adapter` requires `false`, so no single machine state renders both.
`client/test/consent-surface.test.mjs` therefore shows `restart_service(spooler)` and substitutes
`reset_adapter`.

Sound, but **state it in the test file**: the substitution now tested is a *different pair* from the
one demonstrated in `client/docs/CONSENT-SURFACE-2026-09-03.md`. A future reader comparing the two
will otherwise conclude one of them is wrong.

### Q7. Do the hub provider and two-step consent work together end to end?

Commits `615fbc7` and `80705ef` split four files by hand: `client/src/broker/broker.d.ts`,
`client/src/main/main.js`, `client/src/renderer/renderer.js`, `client/package.json`.

Have all three demo scenarios been run with `provider: "hub"` **and** the new consent flow
simultaneously, or were the two exercised separately?

---

## Part 2 — Actions

### A1. Verify the commit split

```
git worktree add ../verify-615 615fbc7 && cd ../verify-615/client && npm test
git worktree add ../verify-807 80705ef && cd ../verify-807/client && npm test
```

A worktree rather than a detached checkout so the main tree stays clean. Remove both with
`git worktree remove` afterwards.

"Each commit stands on its own" is easy to believe and easy to be wrong about when four files were
split by hand, and bisect value depends on it. **If either fails, do not rewrite history** — record
it in `docs/decisions/DECISION-REGISTER.md` or a note so a future bisect knows.

### A2. Add `.gitattributes`, then renormalise, as two separate commits

Create at `C:\Users\Charles\Downloads\maticdesk_bot\.gitattributes`:

```gitattributes
* text=auto

*.js    text eol=lf
*.mjs   text eol=lf
*.cjs   text eol=lf
*.json  text eol=lf
*.md    text eol=lf
*.ts    text eol=lf
*.py    text eol=lf
*.sh    text eol=lf

*.ps1   text eol=crlf

*.onnx  binary
*.png   binary
*.webp  binary
*.wav   binary
```

`.ps1` is `crlf` deliberately — everything in `client/scripts/` is Windows-only and CRLF is the safer
default there. `.onnx` is listed because of the Piper voice model under `client/voices/`; even
gitignored, a stray `git add` on a binary Git treats as text is unpleasant to undo.

```
git add .gitattributes && git commit -m "Fix line endings with .gitattributes"
git add --renormalize . && git commit -m "Renormalise line endings"
```

Two commits: the second touches many files for no semantic reason and that noise should not sit
inside a reviewable change.

### A3. The four unfiled documents — **confirmed not on disk**

`Downloads\` was searched on 2026-09-03. Present there: `2026-09-03-consent-protocol-design.md`
(already filed), `2026-09-03-code-signing-certificate-handover.md`,
`2026-09-03-code-signing-certificate- DAN REVIIEW.md`,
`2026-09-03-claude-code-handover-register-merge.md`,
`2026-09-03-claude-code-handover-first-build-steps.md`.

**These four are absent from the entire filesystem** and remain chat artifacts that were never
downloaded:

| File | Destination once it exists | Consequence of absence |
|---|---|---|
| `2026-09-03-threat-model-v1.md` | `docs/2026-09-03-threat-model-v1.md` | **OPEN-5 remains open against a threat model that exists.** It generated H5, D152–D154 and OPEN-8 |
| `2026-09-03-phase1-plan.md` | `docs/2026-09-03-phase1-plan.md` | Tracks A/B/C and twelve exit criteria live nowhere |
| `2026-09-03-B0-walking-skeleton-spec.md` | `server/docs/2026-09-03-B0-walking-skeleton-spec.md` | The spec `server/` was built from is not beside it |
| `2026-09-03-generic-kb-schema-and-findings.md` | `docs/kb/2026-09-03-generic-kb-schema-and-findings.md` | `docs/kb/generic-kb-v2.json` is filed without the schema or the safety findings behind it |

**No action is possible on these until Charles downloads them.** Do not reconstruct them from the
register — the threat model in particular contains adversary and gap analysis that exists nowhere
else. Re-check `C:\Users\Charles\Downloads\` at the start of the session in case they have arrived.

`server/docs/` does not exist yet and will need creating.

### A4. Record the F2 supersede semantics in the register

`client/docs/2026-09-03-consent-protocol-attack-notes.md` F2 chose supersede-and-audit over
refuse-the-second, and the reasoning is better than the design spec's rule 3: refusing the second
call breaks the honest path — a user who clicks Deny and types another complaint within 120 s is
refused, and there is no cancel in the contract.

That is a decision, not an implementation detail, and should not live only in attack notes. Add it to
`docs/decisions/DECISION-REGISTER.md`.

### A5. Add a line to `CLAUDE.md`

Chat-produced documents must be confirmed present on disk before a task depends on them. A3 is the
sixth occurrence of a document going missing between a chat session and the repo, and two of those
cost partial reviews.

### A6. Do not start the pipe transport yet

Q5 and Q7 should be answered first. The named-pipe protocol is the next substantial piece of Track A
and its shape depends on the two-step exchange being confirmed correct in-process.

---

## Deliberately out of scope here

- Named-pipe transport, Windows Service, device identity, enrollment — Track A, after the questions.
- **B1, the control-plane schema** — unblocked and the next real piece of Track B, but larger than
  anything here and deserves its own handover.
- The code-signing certificate — with Daniel Chow. Blocks A6 (signed MSI), D151 (standalone
  self-updater) and OPEN-8 (build-pipeline integrity).

## Standing note

The **top-30 ticket categories are six weeks outstanding.** Nothing here is blocked on them. The
Phase 1 exit criteria are — particularly the product criterion, from
`C:\Users\Charles\Downloads\Happy People\04-TEAM-REVIEW-AND-DATA-REQUEST.md` §9 A2: a non-technical
person with a genuinely broken laptop resolves it unassisted three times out of five.
