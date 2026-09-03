# Decision Register — Additions D91–D124, Invariants H5–H6

**Date:** 2026-09-02
**Numbering base:** the authoritative register runs to **D41** (`ASK-IT-questionnaire.xlsx`, not yet
on disk — see §0).
**Covers:** Bedrock removal, model selection after hardening, update distribution, notifications and
alerts, client menu structure, knowledge-base sync, and three conflicts found against
`PHASE1-TICKETING.md`.

---

## 0. Numbering and merge instructions

The two earlier decision files from this session numbered from D35 and **collide with existing
D35–D41**. Apply this map when merging:

| Earlier file | Old range | Merge as |
|---|---|---|
| `...decisions-D35-D46-kb-connectivity-inference.md` and `...D53-D67...`, consolidated into `...decision-register-consolidated.md` | D35–D83 | **D42–D90** (add 7 to every ID) |
| This document | — | **D91–D124** as written |

Cross-references inside the consolidated register also need +7. **This is bookkeeping that should be
done once, inside the workbook, not maintained across three markdown files.** The workbook exists
only as a download artifact in the chat `3D avatar with Amazon Bedrock architecture`; until it is on
disk, this fragmentation persists and is the main risk to the register's usefulness.

---

## 1. Invariants added

| ID | Rule |
|---|---|
| **H5** | **Hub-supplied text that reaches the user is inert and attributed.** Applies to announcements, alerts, and escalation payloads. Plain text only — no links, no HTML, no actions, no buttons. Rendered in chrome visually distinct from the agent's own voice and attributed to IT, never spoken by the avatar as its own words. |
| **H6** | **Signed content carries a freshness bound.** A not-valid-after or minimum-acceptable-version floor, so an endpoint can detect staleness the hub never advertises. |

**Why H5.** Announcements are hub-supplied text rendered inside a trusted taskbar agent. That is
content, not policy, so H2 and H4 do not reach it. A compromised hub could push *"IT needs you to
re-enter your password here"* to every endpoint in a UI users are trained to trust, without
violating any invariant.

The same gap already exists in shipped code. `HANDOVER-2026-09-02-post-demo.md` §2 records that
**escalations are not re-validated by the broker** — they go to the inspector and the transcript
speaks the owner aloud, which is why the client enforces those enums itself. Under D46 (now D53) the
hub returns the structured proposal, so a compromised hub could place arbitrary text into an
escalation payload and have the avatar say it. H5 covers both surfaces. It is the analogue of H3e
one layer out: H3e stops the *model* authoring consent text; H5 stops the *hub* authoring anything
that reaches the user unvalidated.

**Why H6.** A compromised or failing hub can harm by **omission** — pinning a fleet to an old,
vulnerable version by simply never advertising a new one. This violates no invariant and is
indistinguishable from "there are no updates." Because H1 keeps the signing key off the hub, the hub
cannot forge a fresher bound, so the endpoint can detect the silence. Same shape as the H4 gap:
policy that only narrows, content that must not go quietly stale.

---

## 2. Bedrock removal

**Scope confirmed: Amazon Bedrock the service is out. Cloud inference is not.** The Anthropic API
direct remains available. Most of hub spec §11 becomes a provider swap rather than a redesign.

| ID | Decision |
|---|---|
| **D91** | **Amazon Bedrock is removed as the managed inference path.** Cloud inference continues via the Anthropic API directly. |
| **D92** | **Consequence — the model stack loses two of three members.** Nova Lite (vendor-diversity fallback) and the Bedrock routing for Haiku/Sonnet go with it. Haiku 4.5 and Sonnet 5 remain reachable directly. D53c (was D46c) — Haiku→Sonnet escalation on the hub — survives; only its transport changes. |
| **D93** | **Consequence — region choice is now free.** us-east-1 was selected because it was the only US commercial region with In-Region support across both the Anthropic and Nova families. That constraint is gone. **Region should now follow data residency** (OPEN-3), not model availability. Partly moots C5. |
| **D94** | **Consequence — hub spec §8 item 4 resolves itself.** §12's OpenAI-compatible adapter and §11's managed inference were described as two products. One of them no longer exists. §12 is now the only self-hosted path and the Anthropic API the only managed one. |
| **D95** | **Consequence — the largest unverified item in the project is retired.** Bedrock per-token pricing has been the missing denominator for the whole commercial case. It comes out of the verification register and out of the Fable prompt's Part A3. **A cost model is still required** — Anthropic API pricing now replaces it and is itself unverified. |

### D96 — the embedding model is now undecided, and it is the most expensive open item

**Titan Text Embeddings V2 was Bedrock.** Hub spec §11 calls the embedding model the least
reversible decision in the system, and D42/D43/D47 (was D35/D36/D40) all rest on it.

This is **not** merely a substitution. D43 (was D37) recorded that query embedding requires a network
call *because* Titan is hosted-only, and D47 (was D40) set the offline floor at "no model, no
customer content" as a consequence. **A self-hostable embedder changes both.** A customer-hosted hub
could embed locally, and offline dense retrieval stops being impossible.

D44 (was D36) — customer KB never at rest on the endpoint — **survives regardless**, because its
other two arguments are independent of the embedder: entitlement must be enforced per-user at query
time, and withdrawn articles must stop being served immediately.

**Recorded as the top open item in the hub design.** Do not let it be settled by whichever library
gets imported first.

### D97 — model selection is now a cost-and-latency decision, not a safety one

`BAKEOFF-2026-09-02.md` §2b: two catalog preconditions and a `whenNotToUse` tool-description field
took **R2 false actions to zero on all five models**, and raised accuracy on every one. That safety
improvement is **model-independent** and shipped as data.

| | correct | reaches user | s/correct |
|---|---|---|---|
| `claude-haiku-4-5` | **36/40** | 0 | 2.0 |
| `mistral-small:24b` | 35/40 | 0 | 1.7 |

**Haiku gained the most from hardening (32 → 36) and now leads on accuracy** while matching mistral
at zero false actions reaching a user. The gap is 0.3 s per correct proposal.

**Documentation conflict (C9).** BAKEOFF §1 still reads *"It beats the cloud model it would replace,
not merely undercuts it."* That was true of the pre-hardening table in the same file. After §2b it is
not. **§1 is the part that will be quoted.** Fix before it reaches a sales conversation.

This also corrects D59b (was D52b), which recorded the customer-hosted-model tier as quality-limited.
The real constraint is hardware: mistral-small needs 16 GB of VRAM, which most SMBs do not have.

---

## 3. Update distribution

Three channels with different privilege, cadence and risk. **Treating them as one update system is
the error**, because the third is dangerous and the first carries nearly all the value.

| Channel | Changes | Privilege | Sensitive to |
|---|---|---|---|
| Content — catalog, generic KB, policy | Often | None | Nothing |
| Agent binary — UI, avatar, model client, router | Sometimes | User | Restart |
| Broker binary — privileged Windows Service | Rarely | Admin | EDR, change control |

| ID | Decision |
|---|---|
| **D98** | **Design rule: anything that can live in signed content does. The broker binary stays as small and stable as possible.** The bake-off is the evidence — the entire R2-to-zero safety improvement shipped as two catalog preconditions and a tool-description field. No binary, no elevation, no EDR re-approval, no restart. The catalog is already the trust root (H3d); making it the update root follows. |
| **D99** | **The broker does not self-update.** A privileged Windows Service that downloads and executes code has a larger blast radius than every playbook combined, and is precisely the behaviour EDR exists to detect. It contradicts the design's own shape — typed primitives, no scripts, nothing freeform. |
| **D100** | **Broker updates ship as an MSI deployed through the customer's existing tooling.** Users have no local admin, so there is no other honest answer. This also routes broker changes through the customer's change process — the same process that grants EDR allowlisting. |
| **D101** | **The agent may self-update.** Unprivileged, user-scoped, changes often. Maps cleanly onto the existing two-process split. |
| **D102** | **The named pipe becomes a version boundary and requires protocol version negotiation.** Agent 1.4 against broker 1.2 must either work or refuse cleanly. Not currently designed anywhere, and it is what makes independent update cadences possible. |
| **D103** | **Content updates ride the existing mechanism** — signed bundle, version in the heartbeat, pushed proactively (D45/D46, was D38/D39). No new channel. |
| **D104** | **The hub advertises binary availability; it does not deliver binaries.** Endpoints must not fetch binaries from our origin — that breaks the customer-hosted isolation story and adds a firewall exception to every deployment. |
| **D105** | **User-facing update UI is status only**, in the Status destination (D116): current version, up-to-date or update-available, last checked. "Check now" forces a heartbeat and nothing more. **If an update requires IT, say so plainly** — never offer a button that fails on a machine where the user has no admin rights. |
| **D106** | **Heartbeat intervals are jittered.** A fleet checking on a fixed interval synchronises into a thundering herd. |
| **D107** | **D59c (was D52c) minimum telemetry must include hub version**, or a security advisory cannot be matched to exposed customer-hosted deployments. |

**Rollback asymmetry, recorded.** Rolling back a signed versioned catalog is trivial. Rolling back a
privileged service is not. A further argument for D98.

**Deferred:** SMB self-contained customers with no deployment tooling will eventually need a broker
updater. It is a second privileged surface with its own review. **Not v1**, and recorded so it is not
added casually.

---

## 4. Knowledge-base changes

**No, a KB edit does not require an app update — and under D44 it requires no distribution at all.**

| ID | Decision |
|---|---|
| **D108** | **Customer KB edits need no sync mechanism.** D44 keeps the customer corpus hub-side and live-retrieved, so an edited article is visible on the next query. No bundle, no signature, no version, no push. This is D44's payoff and it should be stated as such. |
| **D109** | **Generic KB edits ride the signed bundle** (D45) — vendor-authored, changes rarely, no customer edits. |
| **D110** | **The signed/unsigned line and the at-rest/live line are the same line.** Not a coincidence: content at rest on an endpoint must be signed because it is out of our sight; content fetched live over an authenticated channel need not be. |
| **D111** | **General rule: content that can cause an action must be signed. Content that can only inform need not be.** This is why KB edits are trivial and catalog edits are not — and why C3 (per-tenant signing versus H1) bites on playbooks but not on knowledge. |

### D112 — the limitation this creates, stated plainly

**Customer KB content cannot be available offline.** Offline availability requires being at rest,
which requires signing (D110), which requires the vendor signing key (H1) — which is C3. So under the
current model, offline mode reaches generic articles only, never the customer's own.

A per-tenant customer-held signing key would resolve it and introduces key management at the
customer. **Not v1.** Recorded because customers will ask, and the honest answer is a design
consequence rather than an oversight.

### D113 — "no distribution" is not "no work"

A KB edit still requires the hub to **re-embed and update the index**: change detection, incremental
embedding of the changed article only, and immediate vector removal on delete. That last one is what
makes D44's retraction argument true rather than aspirational. Full reindexing on every edit is not
acceptable and should not be how this gets built.

---

## 5. Notifications, announcements and alerts

Three classes with different delivery, entitlement and interruption semantics.

| Class | Audience | Urgency | Delivery |
|---|---|---|---|
| Ticket update | One user, their own ticket | Low | Poll |
| Announcement | Broadcast or segment | Low | Poll |
| Alert — user-impacting incident | Broadcast or segment | High | Latency-sensitive |

| ID | Decision |
|---|---|
| **D114** | **All three ride the heartbeat. No persistent connection in v1.** The heartbeat (D50, was D43) already carries policy and catalog version; add a content-version vector so the endpoint fetches detail only when something changed, keeping the hot path small. A persistent connection brings ALB idle timeouts, per-task connection ceilings and reconnect storms for latency the product does not need. |
| **D115** | **Heartbeat interval is a capacity parameter, not a UX one.** 5,000 endpoints at 60 s is roughly 83 req/s of pure heartbeat against one Fargate task and a `db.t4g.micro`. Interval, fleet size and hub sizing must be decided together. |
| **D116** | **Audience targeting reuses the user schema** (D54–D57, was D47–D50): department, location, manager chain. Those fields move from useful to load-bearing. |
| **D117** | **Interruption policy: badge always; toast only above a severity threshold; never steal focus; alerts auto-expire.** A taskbar agent that pops up unbidden is a known uninstall risk on this project. |
| **D118** | **Alerts require a fourth session outcome: `suppressed`.** D89 (was D82) counts deflection as confirmed-resolved sessions. An alert that prevents a ticket produces **no session at all**, so the highest-leverage deflection in the product is invisible to the metric. Measured as a proxy: ticket volume in the alerted category during an active alert versus baseline. |
| **D119** | **Alerts are the cheapest deflection per engineer-week in the product** — no conversation, no model call, no tokens. **Build order:** after ticket filing (specced in `PHASE1-TICKETING.md`, owed to the honesty ledger), but ahead of cross-user similarity (D70, was D63) and ahead of ticket charts in the dashboard. They are not a large piece of work: once the heartbeat exists they are a content-version field and a rendering surface. |

**Honest limitation, to be stated in the design.** Alerts matter most during incidents, and network
incidents are exactly when the hub is unreachable. *"The VPN is down"* cannot be delivered to people
whose VPN is down.

---

## 6. Client menu

**Principle: the menu is for state you check; the conversation is for problems you solve.** No menu
item for anything the conversation does better.

| ID | Decision |
|---|---|
| **D120** | **Four destinations: Chat (home), My Tickets, Notices, Status.** Chat is the home surface. My Tickets carries list, status and visible comments (D68/D69, was D61/D62), badged on update. Notices carries announcements and alerts, newest first, badged on unread with alerts pinned. Status carries connection state (D49's three states, was D42), mode, version and update status (D105). |
| **D121** | **Everything else is reachable by asking** — KB search, session history, "what did you do to my machine." Two badges are the entire notification UI. |

---

## 7. Conflicts found against `PHASE1-TICKETING.md`

| ID | Conflict | Status |
|---|---|---|
| **C9** | BAKEOFF §1 vs §2b — see D97. | Open. Documentation fix. |
| **C10** | **PHASE1-TICKETING §3 proposes an egress tier `E1`** — "sends data off this machine" as a capability class distinct from R1/R2. **D53 (was D46) makes every conversational turn an outbound hub call.** Either D53 needs an explicit exemption or E1 means nothing. | **Resolved — D125–D129.** |
| **C11** | **PHASE1-TICKETING §4 records an existing policy D53 may break:** computer name and username are deliberately *not* sent to the model. Under D53 the hub assembles the prompt. That line must be preserved explicitly in the hub contract, not assumed. | Open. |
| **C12** | **PHASE1-TICKETING §5 lands on a user profile "read from the machine and confirmed by the user on first run."** Adequate for filing a ticket. **Not adequate for D44 KB entitlement or D68 ticket history**, where a self-asserted editable profile lets a user claim to be someone else. Same field, two trust requirements. | **Open. This is OPEN-1 with a concrete fork in it.** |

### D122–D124 — screenshots

Absent from the earlier register entirely. `PHASE1-TICKETING.md` §4 is adopted unchanged.

| ID | Decision |
|---|---|
| **D122** | **Screenshot handling per PHASE1-TICKETING §4**, adopted as written: exact image shown full size before approval, user-chosen window or region never full desktop by default, opt-in per ticket and never remembered, nothing captured until asked, audit records hash and dimensions but never the image. |
| **D123** | **Open question created by D53:** under hub-side prompt assembly, does an attached screenshot ever reach the hub as part of conversation state? §4 does not address it because it predates D53. **Must be answered before either is built.** |
| **D124** | **The consent pattern is reused, not reinvented** (PHASE1-TICKETING §2): propose → validate → show exactly what will happen → single-use token bound to a hash of the draft → execute → audit. A draft altered after approval cannot ride the old token. |

---

## 7b. C10 resolved — egress

**The conflict was a category error.** R0–R3 measure **local disruption** — what breaks on this
machine if an action goes wrong. `reset_adapter` is R2 because it drops every connection including a
remote session. That scale says nothing about data. Egress measures **what leaves**: `file_ticket` is
near-R0 locally, changing nothing on the machine, while being the highest-consequence capability in
the catalog for data.

PHASE1-TICKETING §3 senses this — *"not R1/R2, which describe local disruption"* — then places `E1`
alongside them as a fifth rung. **Egress is a second axis, not another tier.**

**And D53 does not create egress; it changes the destination.** Standalone mode already sends the
conversation and machine-state block to a cloud provider on every turn — that is how the shipping
demo works. Joined mode sends the same material to the customer's own hub instead, which is the
better posture for a security-conscious buyer. "Every turn is egress" was already true before D53
existed. The hub made an existing fact visible rather than introducing a new one.

The real question is therefore not *does data leave* — it always does — but **does data leave that
the user did not author and cannot see.**

| ID | Decision |
|---|---|
| **D125** | **No per-turn approval for conversational egress. Decided.** Typing a message and having it sent is the thing the user asked for; consent is implicit in the act. |
| **D126** | **`E1` is dropped as a tier. `egress` becomes a declarative catalog property** valued `none` / `hub` / `third-party`, per capability, orthogonal to R0–R3. It rides the signed catalog, inheriting the trust root, the signing, and the same precondition machinery that took R2 false actions to zero. New property, existing enforcement path. |
| **D127** | **Session-scoped disclosure for conversation.** One clear statement at session start and permanently in Status: *"What you type and your machine's network status go to your company's Matic Desk hub."* In standalone the string names the provider instead. |
| **D128** | **Per-action consent for assembled payloads** — anything containing data the user did not author in this session (machine diagnostics, transcript history, profile, screenshot). This is where PHASE1-TICKETING §6 step 3 belongs, and its wording *"Sends data off this machine"* stands. **The destination is shown, not just the fact** — "your company's hub" and "Anthropic" are materially different to a user and to a security reviewer, and mode determines which. |
| **D129** | **The broker mints and audits; the agent transmits; the hub verifies.** PHASE1-TICKETING §3 recommends extending the broker to file tickets. The instinct — one consent flow, one audit log — is right, but it puts an HTTP client, TLS configuration and destination handling inside the privileged service, which **collides with D98**. Instead: the broker validates the draft, mints a single-use consent token bound to the payload hash, and writes the audit record; the agent performs the send. **The broker never opens a socket.** The agent could in principle send something other than what was approved — closed by the hub rejecting any payload whose hash does not match the token. The hub becomes the integrity check at no cost, because the payload is going there anyway. Ticket filing is joined-only, so a verifier always exists. |

**Cost of being wrong.** If the two-axis model is wrong it errs permissive about conversational
egress — a customer whose security team objects to *any* conversation leaving the endpoint. That
customer's answer is a self-contained hub, which the architecture already supports. The failure mode
has a product answer, not a redesign.

**What would change this:** a design partner stating users must approve each turn. Worth asking
alongside the TLS-inspection question, though it is not how anyone uses a chat interface.

---

## 8. Verification register — net change

**Removed:** Bedrock per-token pricing (D95). ALB mutual TLS (D62, was D55).

**Added:**
- Anthropic API direct pricing — replaces the Bedrock denominator, unverified.
- Candidate embedding models, self-hostable and hosted, with dimensions and licence (D96).
- Whether the `interaction` create API exists — still load-bearing, still unverified.
- `comments` vs `work_notes` field names — still load-bearing, still unverified.

**Corrected in the project's own documents:**
- `2026-09-02-ollama-provider-brief.md` **exists** at `Downloads\Claude Handover Files\`.
  PROJECT_START_HERE §4 and `HANDOVER-2026-09-02-post-demo.md` §7 both state it is missing.
- The brief's §5 harness design **was met and exceeded** — it asked for ~30 cases, false-action rate
  weighted hardest, cost per correct proposal deciding; the harness delivers 40 cases, false actions
  split by risk tier, seconds per correct proposal deciding. §7's divergence concern can be closed.
- `ASK-IT-questionnaire.xlsx` is not missing — it was **never downloaded**. It exists only as a chat
  artifact in `3D avatar with Amazon Bedrock architecture`.

**Unchanged:** every §2 constraint is single-source from one company. Endpoint performance targets
remain unmeasured; the bake-off measures model selection only.
