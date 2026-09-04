# Analysis and Plan — 2026-09-04

**Input:** `docs/handovers/2026-09-04-claude-code-handover-b2-and-open-items.md`, read in full.
**State assumed:** `main` at `ea51a29`, register v2.11, D1–D201, next free D202.
**Written by** the chat session of 2026-09-04, for Charles.

---

## 1. The finding that matters most, and it is not in the handover

The handover is a good account of engineering state. Read against the whole project, one thing
stands out that no single session would see:

> **Engineering is not the critical path to a pilot, and everything that is has no owner with a
> date.**

Three gates stand between today and a customer pilot. Only one of them is code.

| Gate | Owner | Status | Lead time |
|---|---|---|---|
| B2 → B3 (enrollment) | Claude Code | Ready to start | Days, then 6–8 engineer-weeks |
| **Code-signing certificate** | Daniel Chow | Purchasing, **no date** | Days to weeks for validation |
| **EDR allowlisting** | Nobody | **Not started** | Weeks, and cannot start without a signed binary |
| **Anthropic Scale tier** | Nobody | **Not started** | Unknown — accrues by usage history |
| Top-30 ticket categories | Design partner | **~7 weeks outstanding** | Unknown |

EDR cannot begin until the certificate exists. The certificate has no date. So **the pilot date is
currently set by Daniel's purchase, not by any engineering decision** — and if EDR review takes six
weeks after a signed binary, that sequence is longer than B2 plus B3 combined.

The Scale tier is worse, because it is not a queue you can join. `docs/decisions/` records that it is
reached through spend history rather than payment. A fleet cannot go from a near-zero account to
5,000 endpoints; the history has to accrue first, and nothing is accruing.

**The structural pattern:** this project moves fast on what it controls and has not started anything
it does not. Four sessions have flagged the two clocks. They remain unstarted while the register
went from D166 to D201. That is not a criticism of the engineering — it is the predictable shape of
a solo founder plus an agent, and it is worth naming because it will not self-correct.

### Plan for §1

1. **Get a date from Daniel this week**, not a status. If the certificate is more than two weeks
   out, that is the number the Phase 1 schedule should be built around.
2. **Start the EDR conversation before the certificate arrives.** Q9 (which EDR products the design
   partner runs) is still unanswered and is a prerequisite — you cannot submit to a vendor you have
   not identified. Ask Q9 and Q35 in the same message.
3. **Start Anthropic spend accruing now.** Run part of the eval loop against `claude-haiku-4-5`
   rather than always Ollama. It scored 36/40, so it gives regression coverage on the shipped model
   *and* accrues history. Cost is small; the alternative is discovering the ceiling during a pilot.
4. **Contact Anthropic sales.** Tier progression, ZDR, and residency (D141) are one conversation.
   A named pilot with a date is a different conversation from an anonymous account.

---

## 2. Task 1 — ratify D152–D160, all nine

None of the nine turns on anything unknown, and B2 needs them settled. The finding was right to
raise, and the distinction it draws is the important one: **B1 being ratified is not evidence that
D152–D160 are.** Same inference error as reading "design filed" as "design implemented."

**Ratify.** Reasoning, briefly:

- **D153/D154 (vendor access, time-boxed, `level` and window).** These came from G2 in the threat
  model — nothing in ten invariants stopped a support engineer reading employee transcripts across
  every customer. It is the gap most likely to be found by someone else first.
- **D155/D156/D159/D160** — break-glass, TOTP, admin audit, OIDC as target, schema not foreclosing
  federation. Standard patterns, and the last is already true in the SQL.
- **D152 (roles carry permissions, never users)** — the alternative becomes unauditable at roughly
  five hundred grants.

### Two amendments to attach rather than inherit silently

**D157's step-up list is a judgment call, not a derivation.** The `step_up` column does not care
what is in it. The proposed set was: fleet-wide device revocation, audit export, transcript access,
policy changes, IdP configuration. **Add one that was missed: creating or modifying a vendor access
grant.** That is the highest-privilege action in the system (D144) and it belongs on the list more
obviously than policy changes do.

**D158 is inert until Phase 2, and B2 must not build for it.** Author ≠ approver governs catalog
changes; D149 deferred catalog distribution out of Phase 1, so there are no drafts to approve. It is
the one decision in the set with no table, which is a good signal. Ratify it — but if B2 starts
building an approval workflow, that is scope arriving through the back door.

---

## 3. A guard for the pattern Task 1 exposed

The specific call was right: federation columns are cheap now and expensive later, which is D160's
own argument. But D160 argued that about *those columns*, not as a general licence, and if migrations
routinely front-run decisions then ratification degrades into rubber-stamping — by the time you are
asked, dropping the table has a cost.

**Cheap fix: when a migration implements a proposed decision, the SQL says so in a comment.**

```sql
-- D153 (PROPOSED as of 001, not ratified) — vendor access as a time-boxed grant
create table vendor_access_grants ( ... );
```

Two benefits. Someone reading `001-control-plane.sql` in six months knows which shapes were bets.
And the next ratification pass can grep for it rather than reconstructing by hand, which is what
this session had to do.

---

## 4. Three things that should stop being treated as resolved

### 4a. B7 is not unblocked

The handover is careful about this and it deserves promoting: **the cross-encoder reranker is
unpicked and unretrieved**, and review A1 suggests it may matter more to retrieval quality than the
embedder does. D199 settled the embedder and that is real progress — but "KB retrieval is unblocked"
is now believed and is not true.

**Plan:** treat the reranker as its own decision with its own retrieval task, at the same level D199
got. It is a Claude Code lookup: candidate models, parameter counts, licences, and CPU viability on
Fargate-class hardware. Until then B7 is blocked, and the Phase 1 plan should say so.

### 4b. D173 rests on a premise KCS retrieval did not confirm

The honesty ledger flags that D173 depends on "findability beats volume", which the KCS check did
**not** support. That claim was mine, from memory, in a document I labelled unverified throughout.

**Plan:** either find a source or downgrade D173 to a hypothesis, the way D163 (`doNotAttempt`) was
recorded. A ratified decision resting on an unconfirmed premise is worse than an explicit
hypothesis, because the hypothesis invites testing and the decision does not.

### 4c. D199 was ratified with nothing measured on our corpus

Correctly flagged, and its §5 survives ratification. Worth restating because "the embedder is
decided" will harden into "the embedder is settled." **There is no corpus.** Six generic articles is
not a corpus. Re-read that §5 before anyone treats it as permanent.

---

## 5. Task 3's gap is real and worth doing properly

The distinction the handover draws — a *reproduction* of a measured DACL versus the real
configuration — is exactly right, and refusing to run elevated because an elevated token satisfies
the `(A;;FA;;;BA)` ace is the kind of care that makes the measurement trustworthy.

**Plan:** do Task 3 before Task 4, as the handover sequences it. One elevated window, a LocalSystem
service via `schtasks /ru SYSTEM`, a genuine standard-user agent. And keep the rule the script
already enforces — `verify:pipe` runs unelevated or not at all.

**And do `BROKER-SURFACE.md` first, as Task 4 says.** That file is what a customer's EDR team reads,
and per §1 it sits on the longest external clock in the project. Keeping it current costs nothing
now; discovering it stale during a security review is the expensive version.

---

## 6. The traps become working rules

Six traps, each producing a confident wrong answer that looked right. Two are systemic rather than
incidents and belong in `CLAUDE.md` as rules, not in a session note.

| Trap | Rule |
|---|---|
| Pipe path loses backslashes through bash; resulting `EACCES` was **indistinguishable from the finding being sought** | Build Windows paths inside the script. **And assert the path is well-formed before drawing any conclusion from a failure to open it.** A false signal wearing the shape of the expected answer is the one class where care does not help — only an independent check does |
| PowerShell function prints status *and* returns a boolean; caller captures an array; every array is truthy; verdict silently inverts | PowerShell helpers return one thing. Status goes to `Write-Host`. Cast booleans explicitly at the call site. **PowerShell is 7.1% of this repo — this will recur** |
| Approximated an ACL instead of reproducing it | Use the mask you measured |
| `npm test` chained with `&&`, so two environment failures aborted eight other files | Fixed in `4cf06d3`. **Run all, report all, exit non-zero at the end** — a red run should still tell you about the other files |
| `npm.cmd test` writes to the app's audit log; `reset-demo` deletes it | Do not reset between using the app and reading a record |
| `npx.ps1` blocked by execution policy | `npm.cmd run <script>` |

The backslash one was hit **twice**, the second time while writing the notes about it. That is not
carelessness — it is evidence the trap is well-shaped, and the reason it needs a rule rather than
awareness.

---

## 7. Recommended sequence

**This week, Charles:**

1. Ratify D152–D160 with the two §2 amendments. Minutes.
2. Get a **date** from Daniel. Not a status.
3. Send Q9 and Q35 to the design partner in one message, and chase the top-30 a third time.
4. Contact Anthropic sales; start eval spend accruing against Haiku.
5. §3 and §4 of the D130 renderer check. Five minutes, no elevation.
6. Decide D148 — see below.

**This week, Claude Code:**

7. Record Task 1's outcome in §5.7. Add the D-comment convention from §3 to the migration.
8. B2 — local accounts, TOTP, roles, admin-action audit. Days.
9. `BROKER-SURFACE.md` update, before any pipe code.
10. Retrieve the cross-encoder options (§4a) and record as a decision.
11. Move the six traps into `CLAUDE.md` as rules.

**Then:** Task 3 with one elevated window, then Task 4's native-call choice, then the pipe.

### On D148

The register rule not to silently rewrite a decision's text is right, so do not rewrite it.
**Recommendation: leave D148's text, add a dated correction note beneath it, and annotate OPEN-1
with the same correction.** Both readers are served, the history is preserved, and the correction —
the SID comes from `GetTokenInformation(TokenUser)` on the token, not from any `WTS_INFO_CLASS` —
appears where each reader would look.

---

## 8. Still not on disk

- **`ASK-IT-questionnaire.xlsx`** — D1–D41, the original seven invariants with their reasoning, the
  verified AWS pricing. Only a download link in the chat `3D avatar with Amazon Bedrock
  architecture`. **Do not reconstruct it.** The register now runs to D201 on top of forty-one
  decisions nobody can read.
- **`2026-09-03-phase0-decisions-D130-D150.md`** — the source document for the set that is still
  proposed. Same instruction.

That second one is worth a moment: **D130–D150 are still proposed, and the document arguing for them
is not on disk.** Anyone ratifying them is working from the register's summary of an argument they
cannot read. That is survivable for the ones already implemented and merged, and it is not a good
position for the rest.

---

## 9. Honesty ledger

- I have read the handover, the repo layout, and the earlier documents I wrote. **I have not read
  the register itself at v2.11**, `B1-CONTROL-PLANE.md`, the named-pipe protocol design, or
  `docs/2026-09-04-embedder-decision.md`. §2's ratification recommendation rests on my own
  reasoning for D152–D160 plus the handover's account of what B1 built — not on reading §5.7.
- §1's lead-time figures are **structural reasoning, not retrieved facts.** "EDR review takes
  weeks" and "Scale tier accrues over months" are both unverified. The *shape* of the argument —
  that these are unstarted and unowned — is verifiable from the handover and is the part that
  matters.
- The D157 addition in §2 is my judgment, not a derivation from anything.
- No figure in this document is a measurement.
