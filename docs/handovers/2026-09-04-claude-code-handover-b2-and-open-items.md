# Claude Code Handover — 2026-09-04 — one founder decision, then B2

**Repo root:** `C:\Users\Charles\Downloads\maticdesk_bot`. Repo paths below are relative to it;
non-repo paths are absolute.

**Written by** the Claude Code session of 2026-09-03 night → 2026-09-04, **for whoever picks this
up next.** Earlier handovers in this directory run the other way (founder → session); this one
returns the favour, because the session ended with more findings than instructions.

---

## State, verified at the time of writing

| | |
|---|---|
| `main` | **`ea51a29`**, pushed, working tree clean, level with `origin/main` |
| `client/` | `npm.cmd test` = **278 assertions, 0 failed, 0 known open** |
| `server/` | `npm.cmd test` = **76** (33 B0 + 43 B1 static, no database); `npm.cmd run test:db` = **56** (needs `npm.cmd run db:up`) |
| Register | **v2.11, D1–D201, next free D202** |
| Dev database | **not running.** `npm.cmd run db:up` from `server/` brings it back; the pgvector image is cached so it is instant |
| OPEN-5 | **Closed.** Threat model at `../2026-09-03-threat-model-v1.md` |

**Ratified by the founder on 2026-09-04:** D199, D199a (as a revisit trigger only), D200, D201, and
**D167–D192 and D193–D197 as sets.**

**Still proposed:** D130–D150 (the independent design review) and **D152–D160** (§5.7, OPEN-6's
human identity and authorisation model). That second set is Task 1.

---

## Task 1 — the founder decides D152–D160, and there is a reason it comes first

**B1's ratified schema already implements the table shapes of a set nobody has ratified.**

`server/migrations/control/001-control-plane.sql` contains, today, in a migration that has run
against a real PostgreSQL:

| Column or table | The decision it came from | Status |
|---|---|---|
| `admin_users.totp_secret` | D156 — TOTP from day one | Proposed |
| `admin_users.external_issuer`, `.external_subject` | D159, D160 — OIDC federation, alongside local credentials | Proposed |
| `admin_roles`, `admin_role_grants`, `admin_roles.scope` | D152 — roles first-class, permissions never attach to users directly | Proposed |
| `admin_audit.event_class` = `break-glass` \| `vendor-access` | D155, D156 | Proposed |
| `admin_audit.step_up` | D157 — step-up re-authentication | Proposed |
| `vendor_access_grants`, with `level` and a window | D153, D154 — vendor access as a time-boxed grant; three transcript tiers | Proposed |

**This is not a defect and nothing needs undoing.** The shapes are free now and expensive later,
which is D160's whole argument, and B1 was explicitly scoped to establish shapes rather than
features. **But nobody recorded that ratifying B1 implied endorsing them**, and the distinction
stops being academic at Task 2: B2 writes *logic* against those tables, and logic is where a wrong
decision costs real work.

**So: ratify or amend D152–D160 as a set before B2 starts.** It is minutes of founder attention
against days of engineering, which is the same shape as the embedder decision that turned out to
have been waiting on nothing.

**Then record the answer.** Either way it needs a register entry — a ratification note in §5.7, or
new IDs from D202 if anything changes. **Do not quietly treat the built schema as evidence the
decisions were accepted.** That inference is exactly what §5.12 had to correct once already this
session.

---

## Task 2 — B2: local accounts, TOTP, roles, admin-action audit

Days, not weeks, per `../2026-09-03-phase1-plan.md` §3. It sits on B1, which is built, run and
ratified — **and on Task 1.**

Read before starting: register §5.7 (D152–D160), §5.12 (D193–D197 and what B1 actually built), and
`../../server/docs/B1-CONTROL-PLANE.md` — **especially its §6.** §6 is the honest account of what
tenant isolation does and does not prove, and B2 is the first thing to build on top of that claim.

Three things B1 left for B2 rather than guessing at:

- **The tables have no logic behind them.** No password hashing, no TOTP verification, no role
  evaluation, no step-up enforcement. Only CHECK constraints, and those encode decisions rather
  than hygiene — `admin_has_a_credential` and `vendor_transcripts_need_a_window` are both tested.
- **`withTenant()` is the only door to tenant data** and that is enforced by a test, not a
  convention (`server/test/db-static.test.mjs` §5). B2's admin paths are control-plane and mostly
  will not touch it; where they do, use it.
- **D195 is the thing to keep in mind.** `search_path` confines accident, not intent. An admin
  console reading audit that contains employee transcripts (D58, D154) is precisely the caller for
  which that distinction matters.

---

## Task 3 — D201's last mile (needs one elevated window)

The pipe blocker is **measured** — register §10.5, reproducible with `npm.cmd run verify:pipe` from
`client/`. What is *not* done is the real configuration: **a LocalSystem service hosting the pipe,
with a genuine standard-user agent on the other end.**

What was actually done: the DACL was read off a pipe created by a normal *user* (the load-bearing
Everyone ace is identical either way), and the access check ran against a *reproduction* of that
DACL with no ace for the caller. That is strong, and it is not the same as the real thing.

Doing it needs elevation to create a SYSTEM-context process — `schtasks /ru SYSTEM` or equivalent —
which is why this session could not: it ran unelevated, on purpose.

**Run `verify:pipe` UNELEVATED.** The script refuses otherwise and says why: an elevated token has
Administrators *enabled* rather than deny-only, so it satisfies the `(A;;FA;;;BA)` ace and the write
succeeds — the wrong answer, arrived at honestly.

---

## Task 4 — build the pipe (D200/D201), after Task 3

The design is ratified: `../../client/docs/2026-09-04-named-pipe-protocol-design.md`. **Nothing is
built.** Its §8 is a falsifiable acceptance list; item 2 is the one that fails today.

Two things ratification did **not** settle, and both come before code:

1. **How the native calls are made** — koffi, an N-API addon, or a small signed helper. Unchosen,
   and it interacts with D147: broker binaries and native DLLs under `%ProgramFiles%`, agent DLLs
   shipped separately.
2. **`BROKER-SURFACE.md` gets updated first.** Ratifying D201 accepted a *named* growth of that
   document, and §8 item 9 makes it a commitment: the new pipe-lifecycle calls
   (`CreateNamedPipeW`, `ConnectNamedPipe`, `ImpersonateNamedPipeClient`, the SID/ACL construction)
   are listed there **before** any implementation merges. That file is what a customer's EDR team
   reads; discovering it is stale during a security review is the expensive version of this.

---

## Task 5 — small, and one of them is Charles's

- **§3 and §4 of the D130 renderer check** — supersede on screen, and an expired nonce.
  `../../client/docs/D130-RENDERER-CHECK.md` records exactly what §1 and §2 covered and what these
  two do not. **Five minutes, needs no elevation** (the broker writes `consentRendered` on refusals
  and needs-the-broker denials as well as successes). **Charles runs it — no session can see a
  screen.**
- **D148's wording and OPEN-1.** §10.4 confirmed the WTS lookups with a correction: the SID comes
  from `GetTokenInformation(TokenUser)` on the token, **not from any `WTS_INFO_CLASS`**. The
  handover answers say D148's wording should name the token → SID step and that this was "noted on
  OPEN-1". **OPEN-1's row does not carry that note.** Left alone deliberately: the register does not
  silently rewrite a decision's text, so it needs the founder's call — amend D148, or annotate
  OPEN-1.
- **Send Q35 to the design partner** (multilingual). It does not block D199 any more — that was the
  point of choosing arctic — but a "no" would make nomic-embed-text-v1.5 the better answer at less
  than half the parameters, and it is one question.

---

## Out of scope, and why

- **B3, enrollment.** 6–8 engineer-weeks, the largest single item in Phase 1, and it sits on B2.
- **B7, KB retrieval.** Unblocked by D199 now that the embedder is chosen — but the **cross-encoder
  reranker is still unpicked and unretrieved** (§10.2), and review A1 suggests it may matter more to
  retrieval quality than the embedder does. Deciding the embedder did not decide it.
- **The signed MSI and the EDR submission.** OPEN-9, the code-signing certificate, with Daniel Chow.
- **The strong-form consent window** (a broker-owned UI inside the user's session). Deferred in the
  consent design §5, and §10.4 has since *evidenced* rather than merely reasoned the cost — session 0
  is non-interactive; `WTSQueryUserToken` plus `CreateProcessAsUser` with `lpDesktop =
  winsta0\default` is the route. Revisit only if a security review demands it.

---

## Standing notes

**The top-30 ticket categories are now roughly seven weeks outstanding.** Nothing in Tasks 1–5 is
blocked on them. The **Phase 1 exit criteria** are — particularly A2 from
`C:\Users\Charles\Downloads\Happy People\04-TEAM-REVIEW-AND-DATA-REQUEST.md` §9: a non-technical
person with a genuinely broken laptop resolves it unassisted three times out of five. Phase 1 can be
built without them; it cannot be *evaluated* without them.

**Two clocks nobody has started** (`../2026-09-03-phase1-plan.md` §9 item 5): the Anthropic Scale
tier and the EDR conversation. Both have lead time that neither money nor effort compresses later.

**Also unstarted:** the DPA, the subprocessor list, and D127's session-start disclosure wording,
which does not exist.

---

## Traps this session actually fell into

Every one of these produced a confident wrong answer that looked right. They are in the register too,
but they belong somewhere a person will read.

- **A pipe path through bash loses its backslashes.** `\\.\pipe\name` arrived as `\.\pipe\name`, and
  the resulting `EACCES` was **indistinguishable from the finding being sought** — a false positive
  for the correct conclusion. Build such paths inside the script.
- **A PowerShell function that prints status *and* returns a boolean** puts both on the pipeline. The
  caller captures an array, every array is truthy, and a verdict silently inverts. Use `Write-Host`
  for status.
- **Reproduce an observed ACL exactly, not approximately.** A hand-picked `ReadData + Synchronize`
  refused even `GENERIC_READ`, because `GENERIC_READ` also maps `FILE_READ_ATTRIBUTES` and
  `READ_CONTROL`. Use the mask you measured (`0x120089`).
- **Two `npm test` failures were the test's fault, not the code's**, and because the script chains
  with `&&` either one aborted the remaining eight files — so a run that looked like a broken consent
  surface never reached `consent-surface.test.mjs`. Both are fixed (`4cf06d3`), but the pattern will
  recur: check whether a failure is about the *environment* the test is running in.
- **`npm.cmd test` writes to the same audit log the app does**, and `reset-demo` deletes it. Do not
  reset between using the app and reading a record.
- **`npx.ps1` is blocked by the same execution policy as `npm.ps1`.** Use `npm.cmd run <script>`.

---

## Honesty ledger

- **Everything above is either committed or explicitly flagged as not done.** Tree was clean at
  `ea51a29`.
- **Nothing new was measured this session except two things**, and neither is a performance number:
  B1's six exit criteria (56 assertions, PostgreSQL 17.11) and the D201 pipe DACL (§10.5). §10.3's
  four measurements are unchanged, and `CLAUDE.md` now states that verifications do not lengthen
  that list.
- **D199 was ratified with nothing measured on our corpus**, because there is no corpus. Its §5
  ("what would change this") survives ratification and should be re-read before anyone treats the
  embedder as settled forever.
- **Three caveats survive the D167–D192 ratification** and §5.11c states them: D173 rests on
  "findability beats volume", which KCS retrieval did **not** confirm; D174's cross-encoder and the
  `k ≈ 60` RRF convention are unretrieved; nothing in the set is measured.
- **Task 1's finding was not looked for.** It surfaced while checking which statuses to change, which
  is the second time this session that a bookkeeping check found something substantive — the first
  being that both of the Phase 1 plan's "blocking now" items had already been resolved.
- **`2026-09-03-phase0-decisions-D130-D150.md` and `ASK-IT-questionnaire.xlsx` (D1–D41) are still
  not on disk.** Do not reconstruct either.
