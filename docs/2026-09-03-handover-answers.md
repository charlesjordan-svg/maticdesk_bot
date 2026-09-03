# Answers to the follow-ups handover of 2026-09-03 (after `74ae434`)

**Answers** `Downloads\2026-09-03-claude-code-handover-questions-and-followups.md`. Paths are relative
to the repo root unless absolute. Everything here was checked on this machine on 2026-09-03; nothing
is reconstructed.

---

## Part 1 — Questions

### Q1. Did the bake-off through the hub reproduce 35/40?

**It ran. Through the hub: 33/40. Direct, same session, immediately before: 33/40. Identical on 40
of 40 cases** — same outcome and same proposed capability on every case, per-case latency difference
median 1 ms (mean −67 ms, max +259 ms). `hubProvider` read `"local"` on every hub-path proposal.

**It did not reproduce 35.** The two cases that moved against the recorded §2b baseline are `net-09`
and `prn-03`, both from a correct proposal (`renew_dhcp`, `restart_service`) to *no tool call*
(`finish_reason: stop`) — and **they moved identically on both paths.** So the hub is not altering
the request; the model's answer at temperature 0 differs between Ollama sessions. Zero false actions
reached a user on all three runs (baseline, direct, hub); the one false action (`dns-04`,
`restart_service(dnscache)`) is blocked by the policy gate every time.

The honest figure for `mistral-small:24b` is therefore **33–35/40 across three runs**, and the hub
reproduces whichever the direct path produces. Written up as
`client/docs/BAKEOFF-2026-09-02.md` §2c; result files
`client/eval/results/hub-2026-09-03.mistral-small-24b.json` and
`direct-2026-09-03.mistral-small-24b.json` (gitignored, on this machine). Register §10.3 lists it as
the project's fourth measurement.

### Q2. What are D162–D165, and what is OPEN-9?

From `docs/decisions/DECISION-REGISTER.md` §5.10 and §7:

- **D162** — Generic KB article schema (as in `docs/kb/generic-kb-v2.json`); `platform` is a
  pre-retrieval filter; lifecycle maps to the KCS v6 states; **an article describes the problem and
  what the user can do, never what the bot does, and never names a capability.** Decided.
- **D163** — `doNotAttempt` on articles is a **hypothesis**, by analogy with `whenNotToUse`, to be
  measured the same way before anyone cites it as a safety mechanism. Proposed.
- **D164** — `Proposal.source` gains `"hub"` with `hubProvider` as **the hub's claim, not the
  endpoint's knowledge**; `HubClient` is the third provider; tier-0 never routes through it. Done.
- **D165** — The social / tier-0 conversational layer is **deterministic**: greetings, capability
  questions and off-topic redirects from templates, capability answers generated from the catalog,
  templates never hub-authored (H5). Decided, not built.
- **D166** *(added by this handover's A4)* — a new consent request **supersedes** the outstanding one
  and the supersession is audited; see A4 below.
- **OPEN-9 is the code-signing certificate**, nothing else: in progress with Daniel Chow; RSA per
  D147; cloud-HSM-backed rather than a USB token so two-party approval and an audit trail are
  possible at all; blocks A6, D151 and OPEN-8.

### Q3. Did the three verifications run, and what did they return?

All three ran, plus the two smaller ones, against the publishers' own pages (register §10.4; the
fetched URLs are listed there).

1. **`WTSQueryUserToken` / `WTSQuerySessionInformation` (D148, OPEN-1) — confirmed with one
   correction.** `WTSQueryUserToken` returns the session user's primary token; the caller must run as
   LocalSystem holding `SE_TCB_NAME` ("intended for highly trusted services"). **No `WTS_INFO_CLASS`
   returns a SID** — `WTSUserName` / `WTSDomainName` / `WTSSessionInfo` return strings. The SID is
   `GetTokenInformation(TokenUser)` → `TOKEN_USER.User` on that token. The console session comes from
   `WTSGetActiveConsoleSessionId` (winbase.h, `0xFFFFFFFF` when none) or `WTSEnumerateSessions`.
   **D148's wording should name the token → SID step**; noted on OPEN-1. Sources: learn.microsoft.com
   `wtsapi32/nf-wtsapi32-wtsqueryusertoken`, `...-wtsquerysessioninformationw`,
   `ne-wtsapi32-wts_info_class`, `winbase/nf-winbase-wtsgetactiveconsolesessionid`,
   `securitybaseapi/nf-securitybaseapi-gettokeninformation`.
2. **ONNX Runtime on ARM64 / Graviton — confirmed; the embedder pick need not change.** Official CPU
   builds for Linux aarch64 at v1.29.0 (2026-08-12): PyPI `onnxruntime` wheels
   `manylinux_2_28_aarch64` for cp311–cp314; GitHub asset `onnxruntime-linux-aarch64-1.29.0.tgz`;
   `onnxruntime-node` 1.29.0 marks CPU on Linux arm64 supported. No CUDA or WebGPU prebuilts for Linux
   arm64. The onnxruntime.ai install page does not mention ARM64 at all — cite the artifacts, not the
   page. Sources: pypi.org/project/onnxruntime/#files; github.com/microsoft/onnxruntime/releases;
   registry.npmjs.org/onnxruntime-node/latest; the package's README.
3. **KCS v6 — confirmed.** Structure: Issue, Environment, Resolution, Cause (optional), Metadata,
   plus an optional *Internal Resolution* hidden on external articles. States, exactly: "Work in
   Progress (WIP)", "Not Validated", "Validated", "Archived". Audience is five levels (Internal,
   Within a Domain, Partners, Customers, Public), not a binary. Source: KCS v6 Practices Guide,
   Techniques 2.1, 5.1, 5.2, 5.3 at library.serviceinnovation.org. The schema document's §3 cannot be
   corrected because the document is not on disk; the corrections live in `docs/kb/README.md` and D162.

Smaller: **Windows redo is Ctrl+Y** on Microsoft's own shortcuts page, which contains no
Ctrl+Shift+Z (documented only for Visual Studio) — the KB v2 row was corrected in place. **macOS
show-desktop** is Command–Mission Control, Fn-H or Fn-F11 per support.apple.com, user-configurable.

### Q4. Was the strong-form `[VERIFY]` resolved?

**Yes, by the same lookup.** Microsoft documents session 0 as non-interactive since Vista ("only
system processes and services run in Session 0"), and `CreateProcessAsUser` with the
`WTSQueryUserToken` token as the route for a service to run UI in the user's session — requiring
`SE_INCREASE_QUOTA_NAME` (and possibly `SE_ASSIGNPRIMARYTOKEN_NAME`), `lpDesktop = winsta0\default`,
and explicit profile and environment handling because it loads neither. The strong form is therefore
exactly what design §5 said: the privileged service spawning and owning a UI process inside the
interactive session, with a UI framework of its own. **The deferral is now evidenced, not
reasoned.** The `[VERIFY]` in `client/docs/2026-09-03-consent-protocol-design.md` §8 is struck
through with the finding beside it. Whether a buyer's review requires paying that cost is still open.

### Q5. What did F1 look like in the shipped code?

**Both halves are cloned.** In `client/src/broker/in-process-broker.js` `prepareConsent()`:
`const retained = structuredClone(proposal)` is what the broker keeps and renders from, and the
return is `structuredClone(request)`, which clones `rendered` with it. `execute()` reads only the
retained record. Tests: `client/test/broker.test.mjs` §6–7 mutates the original proposal after
`prepareConsent` (retained side — already pinned) **and now also rewrites `request.rendered.detail`
and `.title` on the returned object and asserts the audit record still carries what the broker
rendered** (return side — added by this handover). Both pass.

### Q6. Is `restart_service(spooler)` a fair substitute in the regression test?

Yes, and **the test file now says so** at the top of its section 2: the pair tested differs from the
pair demonstrated in `client/docs/CONSENT-SURFACE-2026-09-03.md`; neither is wrong; the original
pair cannot be staged against a broker that validates before rendering, because `flush_dns` and
`reset_adapter` have mutually exclusive `machineOnline` preconditions (section 2a shows the refusal);
the property under test — an approval cannot be redirected to an action the broker did not render a
card for — is the same.

### Q7. Do the hub provider and two-step consent work together end to end?

**Together, headless: yes, all three demo scenarios plus the deny-then-retry path, on one turn each,
against a live hub and a real model.** `client/eval/e2e-hub-consent.mjs` (new) drives the shipping
`Agent` → `HubClient` → running B0 hub → `mistral-small:24b` → `InProcessBroker.validate` →
`prepareConsent` → `execute(nonce)` → audit, with stubbed executors and an injected machine so
nothing on the box is touched:

| turn | route | result |
|---|---|---|
| printer, spooler **stopped** | tier-0 (0.95), hub never called | `restart_service` ran under a broker-rendered card; audit has `consentNonce` + `consentRendered` |
| printer, spooler **running** | tier-0 0.7 → **hub** → `source: "hub"`, `hubProvider: "local"` (2.6 s) | broker re-validated, card rendered, executed, audited |
| no internet, APIPA | offline → hub **not** called; tier-0 `renew_dhcp` | executed under consent |
| cracked screen | **hub** → escalation `hardware` / `desktop_support` (1.5 s) | enums held client-side; nothing proposed |
| Deny, then a new question | hub card denied; next card supersedes it | supersession audited (D166); next consent worked |

12 checks, 0 failures. **What was NOT run: the Electron renderer and the avatar.** `npm run
start:elevated` needs a UAC prompt and the voice model, which cannot be driven from this session, so
the three scenarios have not been clicked through in the app with `provider: "hub"`. The pixels and
the elevation are the two things this script does not cover; everything between the sentence and
the audit record is the shipping code path. Run the app for those before anyone calls it done.

Commit split (A1) is verified below, which covers the "split by hand" concern directly.

---

## Part 2 — Actions

### A1. Commit split — verified, both pass

In isolated worktrees (`node_modules` junctioned in, then removed):

| commit | what | `npm test` |
|---|---|---|
| `615fbc7` consent | 8 test files | **247 passed, 0 failed, 0 XFAIL**; `main.js`, `renderer.js`, `preload.cjs` pass `node --check` |
| `7b98a4f` hub server | `server/test/turn.test.mjs` | **33 passed** (depends on the client export it also carries) |
| `80705ef` hub provider | 9 test files | **278 passed** (277 at that commit), `node --check` clean |

No history rewritten; nothing to record against a bisect. Worktrees removed.

### A2. `.gitattributes` and renormalise — done, two commits

As specified (LF for source and docs, CRLF for `.ps1`, binaries named). `CLAUDE.md`'s
"match the file's existing line endings" rule is replaced by "Git normalises on add; do not
hand-convert." The renormalise commit is content-free by construction and separate.

### A3. The four unfiled documents — re-checked, still absent

`Downloads\` and the whole profile were searched again at the start of this session
(`*threat-model*`, `*phase1-plan*`, `*walking-skeleton*`, `*generic-kb-schema*`): **not present.**
Nothing reconstructed. `server/docs/` is not created until there is a file to put in it.

### A4. F2 supersede semantics — recorded as D166

`docs/decisions/DECISION-REGISTER.md` §5.10, **D166**, status done: a new consent request supersedes
the outstanding one and the supersession is audited; refusing the second call would break the
honest Deny-then-ask-again path because the contract has no cancel; neither choice stops the §5
residual, supersede is the one that leaves its forensic signature in the trail. Amends D130's design
rule 3 by specifying it. Next free ID: **D167**.

### A5. `CLAUDE.md` — line added

Under *Decisions*: a chat-produced document must be confirmed present on disk before any task
depends on it; check with `ls` at session start and say what you found; six have gone missing, two
cost partial reviews; never reconstruct one.

### A6. Pipe transport — not started

Q5 and Q7 are answered above. The in-process two-step exchange is confirmed by tests and by the
end-to-end run; the renderer has not been clicked through with the hub. That is the remaining gap
before the pipe protocol is designed around the shape.

---

## Honesty ledger

- Q1 is a two-run comparison on one machine. It answers "does the hop change the request" (no) and
  nothing about a hub on a network or under load.
- Q7's end-to-end run is headless. The renderer and the elevated app were not exercised.
- The commit-split verification ran each commit's own tests. It did not run the Electron app at
  either commit.
- The four missing documents are still missing; OPEN-5 is still open against a threat model that
  exists somewhere other than this disk.
