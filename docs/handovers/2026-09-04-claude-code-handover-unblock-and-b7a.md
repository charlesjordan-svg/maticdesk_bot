# Claude Code Handover — 2026-09-04 — clear the blockers, then B7a

**Repo root:** `C:\Users\Charles\Downloads\maticdesk_bot`. Repo paths are relative to it; non-repo
paths absolute.

**State assumed:** `main` at `ea51a29`, register v2.11, D1–D201, next free D202. B0 built and
measured. B1 built, run against PostgreSQL 17.11, ratified. Dev database not running — `npm.cmd run
db:up` from `server/`.

**Founder direction, 2026-09-04:** *"We need to be able to produce a local agent that can answer
questions and a Hub that it can connect to."* That is B7a and it is now the priority. **B2 is
unblocked by Task 1 but deferred** — see §Priority.

---

## Task 0 — file two documents

Both are chat artifacts in `C:\Users\Charles\Downloads\`. Confirm each exists; **do not reconstruct
either if it is missing** — say so instead.

| Source | Destination |
|---|---|
| `2026-09-04-ratification-D152-D160.md` | `docs/decisions/sources/` |
| `2026-09-04-B7a-answering-questions-spec.md` | `server/docs/` |

Also worth filing if present: `2026-09-04-analysis-and-plan.md` → `docs/`.

---

## Task 1 — record the ratification (this is the register blocker)

**D152–D160 are ratified as a set, as written, by Charles on 2026-09-04.** Flip all nine from
Proposed to Ratified in §5.7. No text changes.

Three things to record alongside, because the finding that produced them should survive:

1. **State in §5.7 that this ratification was a separate act from B1's**, on 2026-09-04. The
   handover's point stands: the built schema in `server/migrations/control/001-control-plane.sql` was
   never evidence these were accepted, and a reader in six months should see that the distinction was
   made rather than assumed.
2. **D202 is proposed, not ratified.** Creating or modifying a `vendor_access_grants` row requires
   step-up re-authentication. Reasoning is in the ratification note. It was omitted from D157's list
   by oversight rather than decision, and D144 makes vendor access the highest-privilege position in
   the system. **Awaiting Charles. Does not block anything** — the `step_up` column exists either
   way.
3. **D158 is ratified but inert in Phase 1.** Author ≠ approver governs catalog changes; D149
   deferred catalog distribution, so there are no drafts to approve. Note it in §5.7 so nobody builds
   an approval workflow against it.

### Then add the provenance convention

Where a migration implements a decision, the SQL says which and what its status was:

```sql
-- D153 (ratified 2026-09-04) — vendor access as a time-boxed grant
create table vendor_access_grants ( ... );
```

Apply retroactively to `001-control-plane.sql` for the nine tables and columns the handover
enumerated. Two reasons: a reader can tell which shapes were bets, and the next ratification pass
can grep for provenance rather than reconstructing it by hand — which is how Task 1's finding
surfaced at all.

---

## Task 2 — two lookups, both blocking

You have network access. Both of these are decisions waiting on retrieval, not on judgement.

### 2a. Is D199's embedder servable through Ollama? **(blocks B7a §4)**

Read `docs/2026-09-04-embedder-decision.md` first — it is the authority on which model and tag D199
actually selected, and the B7a spec defers to it.

Then: **is that model available in Ollama's library, under what tag, and does it match?**

- **If yes:** one runtime serves chat and embeddings in development, no ONNX toolchain, and it is
  also the customer-hosted deployment mode rather than a dev shortcut — the same argument B0 made for
  running the hub locally.
- **If no:** ONNX Runtime. Note that D199's aarch64 confirmation was about Fargate; the dev machine
  is Windows x64, a different build, and worth confirming rather than assuming.

Either way, **put embedding behind a provider interface** matching the chat provider's shape. The
embedder is a schema decision rather than a foundation — re-embedding is cheap — and the interface is
what keeps that true.

### 2b. The cross-encoder reranker **(blocks full B7, not B7a)**

Unpicked and unretrieved (§10.2), and review A1 suggests it may matter more to retrieval quality
than the embedder does. It got none of the attention D199 got.

Retrieve: candidate models, parameter counts, licences, CPU viability on Fargate-class hardware, and
whether any are servable through the same runtime as 2a. **Record as a decision from D203** with the
same rigour as D199, including a "what would change this" section.

**B7a proceeds without it.** But B7a's retrieval numbers are then a floor rather than a measurement
of the design, and that caveat must travel with any number B7a produces.

---

## Task 3 — three carry-overs, small

### 3a. `BROKER-SURFACE.md` before any pipe code

Ratifying D201 accepted a *named* growth of that document and §8 item 9 made it a commitment:
`CreateNamedPipeW`, `ConnectNamedPipe`, `ImpersonateNamedPipeClient`, and the SID/ACL construction
listed **before** any implementation merges.

That file is what a customer's EDR team reads, and per the analysis document it sits on the longest
external clock in the project. Keeping it current costs nothing now.

### 3b. The six traps become rules in `CLAUDE.md`

They are in the register, but the register is not what a session reads first. Two are systemic rather
than incidents:

- **PowerShell helpers return one thing.** Status to `Write-Host`; explicit `[bool]` at the call
  site. A function printing status *and* returning a boolean puts both on the pipeline, the caller
  captures an array, every array is truthy, and a verdict silently inverts. **PowerShell is 7.1% of
  this repo — this will recur.**
- **Assert a Windows path is well-formed before drawing any conclusion from a failure to open it.**
  The backslash trap produced an `EACCES` *indistinguishable from the finding being sought*, and it
  was hit twice — the second time while writing the note about it. A false signal wearing the shape
  of the expected answer is the one class where care does not help; only an independent check does.

Plus: reproduce measured ACLs exactly, `npm test` runs all files and reports all before exiting
non-zero, `npm.cmd test` writes to the app's audit log so do not `reset-demo` between using the app
and reading a record, and `npm.cmd run <script>` rather than `npx.ps1`.

### 3c. D148 and OPEN-1 — **leave for Charles**

§10.4's correction (the SID comes from `GetTokenInformation(TokenUser)`, not from any
`WTS_INFO_CLASS`) is not reflected in D148's text and OPEN-1 carries no note. The recommendation is
to leave D148's text, add a dated correction note beneath it, and annotate OPEN-1 with the same
correction — both readers served, history preserved. **But the register does not silently rewrite a
decision's text, so this needs Charles's word.** Flagged, not done.

---

## Task 4 — B7a

Spec: `server/docs/2026-09-04-B7a-answering-questions-spec.md` once filed. It is complete; three
notes here.

### 4a. One design question the spec left open

**Which schema holds the generic corpus?** B1's migration runner handles a control-plane schema and
per-tenant schemas. Generic KB is a third thing: vendor-authored, cross-tenant, no entitlement rules
(D45).

Two options:

- **Control plane.** Simplest, no new schema category, no runner change. Slightly odd — the control
  plane is operational metadata and this is a content corpus with vectors.
- **A dedicated `generic` schema**, a single special-cased instance under the same runner.

**Recommendation: control plane, for now.** It avoids inventing a third category for six articles,
and moving it later costs a re-embed of six articles, which is nothing. Record the choice and the
reason either way, so a future reader knows it was decided rather than defaulted.

### 4b. The acceptance test that comes first

**Acceptance item 1 is negative: a question with no supporting article produces a decline and an
offer to raise a ticket, with no invented answer.** Test with at least five questions deliberately
outside the six articles.

This is deliberately before any retrieval-quality test. With six articles most questions are not
covered, so a system that answers everything scores well on recall and is unshippable. Confident
invented IT advice presented as company knowledge is worse than "I don't know" — the user acts on it.

The lever is the same one the bake-off measured: telling the model what it must *not* do moved every
model, and it likely matters more here than retrieval ranking does.

### 4c. The hub becomes stateful — deliberately

B1's handover said not to retrofit persistence into `server/src/turn.js`, and that was right then.
**B7a is where it changes.** Two guards:

- **Keep the stateless path runnable behind a flag.** It is also the degraded mode the endpoint sees
  when the KB is unavailable, so it is not throwaway.
- **Provisional tenancy must be loud.** Device authentication does not exist, so the tenant comes
  from configuration. Mark it the way B0 marked missing auth — refuse non-loopback, warn on every
  start — so a header does not quietly become the tenancy model.

Test each retrieval leg alone before fusing them. A broken leg inside an RRF fusion is very hard to
see.

---

## Priority — why B7a and not B2

Task 1 unblocks B2, and B2 is days of work. **It is deferred, not cancelled**, on the founder's
direction above: B7a needs no admin console, no roles and no TOTP, so deferring B2 costs nothing for
this goal.

**Suggested order:** Task 0, Task 1, Task 2a, Task 4, then Task 2b, then Task 3. Task 3a moves ahead
of everything if pipe work becomes likely.

---

## On Charles, not you

- D202 — yes or no.
- D148 and OPEN-1 wording (3c).
- §3 and §4 of `client/docs/D130-RENDERER-CHECK.md`. Five minutes, no elevation, needs a screen.
- **A date from Daniel** on the code-signing certificate. Currently setting the pilot schedule.
- **Q9** (which EDR products the design partner runs — a prerequisite for starting that conversation
  at all) and **Q35** (multilingual), in one message.
- **The top-30 ticket categories.** Roughly seven weeks. Nothing here is blocked on them; the Phase 1
  exit criteria are.
- **Two unstarted clocks:** Anthropic Scale tier and the EDR conversation. Both have lead time that
  neither money nor effort compresses later.

---

## Honesty ledger

- I have **not read** the register at v2.11, `docs/2026-09-04-embedder-decision.md`,
  `server/docs/B1-CONTROL-PLANE.md`, or the named-pipe protocol design. Where those disagree with
  this handover or with the B7a spec, **they win** — particularly on which embedder D199 selected.
- **Nothing in B7a will support a claim that the product answers questions well.** Six articles, no
  reranker, no corpus. Its purpose is to prove the path works and that the system declines when it
  should.
- **`ASK-IT-questionnaire.xlsx` (D1–D41) and `2026-09-03-phase0-decisions-D130-D150.md` are still not
  on disk.** Do not reconstruct either. The second matters more than it looks: **D130–D150 are still
  proposed and the document arguing for them cannot be read**, so anyone ratifying that set is working
  from the register's summary of an argument that no longer exists in full.
