# Independent Design Review — Matic Desk Hub

**Date:** 2026-09-02
**Responds to:** `2026-09-02-fable-evaluation-prompt-v2.md`
**Reviewer stance:** Principal Architect, independent. Did not write the design. Fresh session; no chat transcript attached.
**Web access:** yes. Every Part A claim carries a URL and access date. Part A research was run by five parallel research agents against primary vendor documentation; their full reports are reproduced unedited under "Part A — full research reports", and each has its own "Unverified / could not find" list.

---

## 0. Provenance, and two findings about the inputs

### 0.1 Two of the six attachments are not on this machine

| Attachment named in the prompt | Found | Where |
|---|---|---|
| `2026-09-02-hub-server-side-spec-handover.md` | yes | `Downloads\` and `Downloads\Claude Handover Files\` (byte-identical) |
| `2026-09-02-matic-desk-decision-register-consolidated.md` | **no on 2026-09-02; supplied 2026-09-03** in `Claude Code files to Review 9 - 3 2026 1 11 am.zip` with its two source files, now in `Downloads\` | Part C uses it; +7 applied to every ID |
| `2026-09-02-decisions-D91-D124-updates-notifications-kb-sync.md` | **no on 2026-09-02; supplied by the founder on 2026-09-03** and saved to `Downloads\` | Part C and the Part B addendum use it |
| `HANDOVER-2026-09-02-post-demo.md` | yes | `maticdesk_bot\Projects\Ai Chat Bot -Matic\matic-desk-demo\docs\` |
| `BAKEOFF-2026-09-02.md` | yes | same |
| `PHASE1-TICKETING.md` | yes | same |
| `ASK-IT-questionnaire.xlsx` (D1–D41, referenced as "not on disk") | no, as expected | — |

Also read because they bear on the questions: `BROKER-SURFACE.md`, `LOCAL-MODEL-PROVIDER.md`, `2026-09-02-ollama-provider-brief.md`, `HANDOVER-2026-09-02-day4.md`, and the `post-demo` branch source (`in-process-broker.js`, `catalog.json`, `agent.js`, `cloud-client.js`, `openai-compatible-client.js`, `prompt.js`, `main.js`, `broker.d.ts`, `capabilities/index.js`, `eval/cases.json`).

**Consequences for this review.**

- **Part C is complete.** Both decision documents arrived on 2026-09-03, after Part A and Part B were written. Part C compares against C1–C12, H4–H6 as written, D42–D129 and OPEN-1 to OPEN-4, and its C.0 lists seven places where the registers corrected this review.
- **Part B evaluates H4, H5, H6, the egress axis and the update trust model against the prompt's one-line summaries.** The exact texts arrived afterwards. Part B is left as written so the corrections are visible; the addendum after B8 (D91–D124) and Part C §C.0 (consolidated register) record where the real wording corrected me and where it did not.
- **The +7 renumbering is applied in Part C** as "D-new (was D-old)" on first mention. Parts A and B cite no D-numbers.

### 0.2 The bookkeeping is itself a finding, as the prompt invited

Three decision-ID spaces exist: D1–D41 in a spreadsheet not on disk; a consolidated register that starts at D35 and collides with it, requiring a +7 offset that only the reader applies; and a D91–D124 file that is "already correct". Two of the three are not on the machine that holds the code. The post-demo handover records the same pattern for a different file: "`2026-09-02-ollama-provider-brief.md` is still missing. Not on this machine" (it is now in `Claude Handover Files\`). This is the second time in one day that a document a handover depends on was not where the next reader could find it.

The fix is not a numbering convention. It is one directory, checked in, that every handover and every prompt references by relative path, with the decision register as a single file that owns its own numbering. Until then every review of this design, including this one, is a review of a subset.

---

## 1. The three findings that most change what gets built next week

### 1.1 The consent card is drawn by the process the broker does not trust

`main.js`, handler `broker:consentAndExecute`: the renderer sends a `proposal`; the broker mints a token for *that* proposal and executes it. The broker never sees what was displayed. In the demo, one elevated process, this is fine. In Phase 1 the agent is unprivileged on the far side of a named pipe. It can draw the `flush_dns` card, take the click, and send `reset_adapter` with a live adapter GUID. Schema valid, preconditions pass on an offline machine, token minted and bound to the proposal hash, executed, audited as consented. All ten invariants hold. H3e says the model never *authors* consent text; nothing says who *displays* it.

**What changes next week:** the `NamedPipeBroker` design needs a rule that the privileged half can prove the user saw the text it acts on. Cheapest honest version: the broker renders the consent text and returns it with a nonce; the approval binds to the nonce; the audit record stores the broker-rendered text. Strong version: a broker-owned consent window in the user's session. Either way this is a Phase 1 design item, not a hardening item. (B1, H3e.)

### 1.2 The broker is the trust anchor and it is on the slowest update channel, unattested

The consolidated register already puts the device key in the broker (D64, was D57: TPM-backed, agent never sees it, short-lived tokens over the pipe). That is the right call and this review first said otherwise; Part C §C.0 records the correction. What the register then does is put that broker, which now holds the device key, the mode state, enrollment and token minting, on the update channel the vendor cannot drive (D99, D100, D104), and paper over the resulting drift with pipe protocol negotiation (D102). A5 confirms that a per-user Squirrel-updated Electron agent is MITRE T1574.010 by construction and that mTLS is unsupported through Zscaler inspection outright, so D62's rejection of mTLS stands on documentation. What no decision provides is a trustworthy statement of *which broker version is running*: the agent sends the heartbeat, and the agent can say anything.

**What changes next week:** the assertion the broker already signs with the device key (D61) carries broker version, catalog hash and signature-verified state. That is one field set, no new mechanism, and it gives the hub a "minimum broker version" policy (narrowing, H4-legal) instead of protocol negotiation. The update model: one per-machine installer for both halves. D99 forbids the broker updating itself on an EDR argument; the Part B addendum engages that argument and concludes D99 is defensible for the design partner and wrong for the product, because standalone brokers are left with no update path at all and D104 forbids the customer-hub path that satisfies its own isolation reason. (B4, A5, Part B addendum, Part C §C.0 and §C.3 X-2.)

### 1.3 The cost and hosting model is built on facts that are no longer true

Five independent checks, all from primary sources on 2026-09-02:

| Spec assumption | Now |
|---|---|
| Anthropic rate limits are the constraint for a 5,000-endpoint fleet | The constraint is the **monthly spend cap**: $500 Start, $1,000 Build, $200,000 Scale. One hour of a 1,000-RPM Haiku storm is ~$360 uncached. Hitting the cap is a 429 with no `retry-after` until the first of next month. Scale tier is required and is reached by usage history, not payment. |
| Prompt caching will cut routine-turn cost | Haiku 4.5's minimum cacheable prefix is **4,096 tokens**. The shipped system prompt plus five tools is ~1,500 (estimated; confirm with `count_tokens`) plus 496 of tool-use overhead. Caching silently does nothing on the routine model and works on Sonnet 5 (minimum 1,024). |
| us-east-1 for residency | `inference_geo: "us"` is **rejected on Haiku 4.5** (4.6-and-later only); no EU inference or EU at-rest exists on the first-party API. Residency is a model-and-provider question now, not an AWS one. Region: every Phase 1 line item is priced identically in us-east-2, which has no entries on AWS's post-event-summary list against ten for us-east-1. |
| RDS free for 12 months, $200 credits | Legacy offer for accounts created before 2025-07-15. New accounts: $100 credits guaranteed, up to $200, and the Free-plan account closes at six months. |
| Recommended model `mistral-small:24b` (16 GB VRAM) | D97 has already moved the managed-tier pick back to Haiku 4.5 (36/40 after hardening), so the GPU cost applies only to the customer-hosted tier. What remains is C9 in three documents: BAKEOFF §1, the post-demo handover §4 and `LOCAL-MODEL-PROVIDER.md` §3 all still say mistral beats the cloud model. `[VERIFY]` GPU instance pricing was not researched. |

**What changes next week:** the cost model is rebuilt before any hosting commitment: Anthropic Scale tier as a prerequisite, per-tenant workspaces with spend limits, the system prompt either padded past 4,096 tokens (a real option, it is cheap) or caching written off for Haiku, and a GPU line if the managed tier is to run the recommended model. Residency question 18 goes back to the customer reframed. (A3, A4, R-7, R-11.)

### The one place what was asked for is not what is wanted

D128 asks for per-action consent on "data the user did not author in this session", and D127 discloses that "what you type and your machine's network status go to your company's Matic Desk hub." What is wanted is that nothing the user said reaches an audience they did not address. Under D127 the transcript goes to the hub on session disclosure alone; under the interaction session model and D68/D69 that transcript becomes readable by fulfillers in the customer's ITSM. The user typed it to a robot on their own machine. The rule as written lets the audience change with no consent event, and `PHASE1-TICKETING.md` §4 already says the opposite ("the user's own words leave the machine… must be visible in the validation step"). The second instance is H5: it makes hub text inert on its way to the user, and under D53 the hub assembles the model's entire prompt, so the channel that turns hub text into proposals is untouched by it. In both cases the invariant guards the executor and leaves the thing that decides exposed.

---

## Part A — Verification

Five research sections. Each has a lead paragraph stating what the research changes downstream, followed by the full research report with citations. Every claim not confirmed from a retrieved primary source is tagged `[VERIFY]`; where nothing authoritative was found the text says `I do not have a verified source for this.`

### A — summary table

| Question | Answer in one line | Changes |
|---|---|---|
| A1 embedder shared across modes? | Yes: run one Apache-2.0/MIT model (nomic-v1.5, arctic-m-v2.0, gte, Qwen3-0.6B, voyage-4-nano) via TEI CPU images in both; or Voyage 4 hosted + open nano in one claimed vector space `[VERIFY]` | Embedding decision is closeable this week |
| A1 re-embed 10k articles | Under $3 hosted; minutes to hours on CPU for 100–350M models | "Least reversible" is overstated |
| A1 CPU viable? | Runs officially; interactive latency on 1–2 vCPU unmeasured; bulk ingest is a background job | Job queue is on the KB critical path |
| A1 pgvector on db.t4g.micro | One ~25k-chunk tenant with raised `maintenance_work_mem`; not multi-tenant HNSW | Second tenant needs a bigger instance |
| A2 `interaction` REST create? | Yes via Table API with `interaction_agent`; dedicated API undocumented in practice; `interaction` likely not a `task` child `[VERIFY]` | Session model implementable, differently |
| A2 work notes vs comments | `work_notes` ITIL-only, `comments` caller-visible; read via `sys_journal_field` with `element=comments` hard-coded; deny `itil` to the integration account | Structural safety is achievable at the source |
| A2 KB entitlement offline? | Declarative criteria yes; scripted criteria no (Microsoft's connector hits the same wall) | Per-user proxy or fail-closed re-check |
| A2 restricted classes | HR/SecOps/GRC/Legal are `task` children in own scopes; never query `task`; legal table is `sn_lg_ops_request`, not `sn_legal_request` | Adapter design |
| A3 pricing | Haiku $1/$5, Sonnet 5 $2/$10 standing | Cost model can be built |
| A3 rate limits | Tier 1–4 is gone; Start/Build/Scale/Custom; spend cap binds; Scale needed | Commercial prerequisite |
| A3 caching | Haiku min prefix 4,096 tokens; shipped prefix ~2,000 | Caching is off on the routine model |
| A3 residency | No US pin on Haiku 4.5; no EU anywhere; ZDR sales-gated | Question 18 reframed |
| A4 region | Identical pricing; us-east-2 at least as good | Move region |
| A4 free tier | Legacy; not for this account | Year-1 cost is ~$46/mo minus $100–200 credits |
| A4 `max_connections` | ~80–90 usable; pooler not forced at Phase 1 if pools capped | Config item, not a component |
| A5 mTLS vs token | Zscaler: mutual TLS unsupported under inspection; token over TLS survives | Decide token |
| A5 TPM latency | 10–500 ms medians across firmware; P95 ~600 ms in Chrome telemetry | Sign per session |
| A5 EDR | Hash exceptions break on every update (Microsoft says so); use certificate/publisher rules; sign with RSA | Build pipeline |
| A5 MSI | Major upgrades, rollback schedule, broker self-fetches if it must self-update; agent never delivers broker updates | Update model (B4) |

### A — what the research changes, by section

### A1 lead — what the embedding research changes

- **Anthropic has no embeddings API.** The Bedrock exit did not remove an embedding option from the Anthropic path; there was never one. The decision is independent of the chat provider.
- **"Same embedder in both modes" is achievable, and there are two ways.** Run one open-weight, Apache-2.0 or MIT model yourself in both managed and customer-hosted mode via the Hugging Face TEI CPU image (nomic-embed-text-v1.5, arctic-embed-m-v2.0, gte-base/large, Qwen3-Embedding-0.6B, voyage-4-nano). Or use the Voyage 4 family, where the hosted models and the open-weight `voyage-4-nano` are claimed to share one vector space `[VERIFY: vendor claim]`, so managed could call the API and customer-hosted could run nano. Everything hosted-only (OpenAI, Cohere, Gemini, Titan) forecloses migration between modes without a re-embed.
- **Re-embedding is not the switching cost the spec thinks it is.** Ten thousand articles is about 12M tokens: under $3 on every hosted API, and minutes to a few hours of CPU for a 100–350M-parameter model. The real switching costs are operational: re-indexing under load, dual-writing during cutover, and quality regression testing. "Least reversible decision" is true relative to the chat model and false in absolute terms.
- **CPU is viable for the 100–350M class, with a caveat.** TEI officially ships CPU images. Interactive query latency on a 1–2 vCPU Fargate task is unmeasured (`I do not have a verified source for this`); bulk ingest of a tenant is an hours-long background job on a small task, which means the job queue (R-2) is on the critical path for KB sync.
- **Do not put HNSW for more than one small tenant on db.t4g.micro.** 25,000 × 1024-dim rows is ~103 MB raw against a 64 MB default `maintenance_work_mem` and 1 GiB total; 250,000 rows exceeds the instance. Schema-per-tenant with per-tenant HNSW indexes on a micro is a non-starter beyond the pilot. Use Matryoshka truncation to 512 or 256 dims, or `halfvec`, and budget a larger instance for the second tenant.
- **pgvector on RDS is current.** 0.8.2 on PG 15–18; HNSW and iterative scans available; `vector` index limit is 2,000 dims so 3,072-dim models need `halfvec` or truncation.


### A2 lead — what the ServiceNow research changes

- **The session model is implementable, through the Table API, and probably not through the dedicated Interaction API.** `interaction`, `interaction_json_blob` and `interaction_related_record` exist (Interaction Logging, Routing and Queueing plugin, `com.glide.interaction`), and the generic Table API supports create on any table the caller has rights to. The integration account needs `interaction_agent`. The dedicated Interaction Management API exists by URL but its documentation did not render, it is absent from the current REST index, and community reports say it ignores most body fields. Build on `POST /api/now/table/interaction` and treat the dedicated API as unavailable until tested on the customer's instance.
- **`interaction` almost certainly does not extend `task`.** Two independent community sources say so; no doc contradicts it. Consequence: no `correlation_id`, no task SLAs, no task ACLs, and `sys_journal_field` queries keyed on `name=task` will not find interaction work notes. Every place the design assumes interaction behaves like a ticket needs re-checking. `[VERIFY]` with `sys_db_object.super_class` on the customer instance.
- **Work notes versus comments: the field names are confirmed, and the safe read path is not the one the design probably assumed.** `work_notes` is "viewable only by ITIL users"; `comments` is what the caller sees. Journal values are not stored on the incident row. A `GET` on `incident` returns `""` for both with display values off, and a concatenated history string with display values on. The structurally safe design is: never request journal fields on task-table GETs at all; read customer-visible updates only from `sys_journal_field` with `element=comments` hard-coded and not configurable; and give the integration account a role without `itil`, so `work_notes` are ACL-denied at the source regardless of hub bugs. That last control is the one that survives a hub compromise, and it is the one to insist on.
- **KB entitlement cannot be fully evaluated offline.** User Criteria are mostly declarative (users, groups, roles, companies, departments, locations) and could be exported, but the Advanced/script criterion is arbitrary server-side JavaScript. Microsoft's own ServiceNow knowledge connector documents exactly this: its offline mode treats scripted criteria as deny-all. Options: proxy every retrieval per user through the Knowledge Management REST API (`/api/sn_km_api/knowledge/articles`, which the community says returns only what the caller can read), or index offline and re-check each candidate article for the specific user at query time, failing closed on any KB with scripted criteria. The two differ by weeks of work and by whether the hub holds per-user credentials to the customer instance. Reading KB as an end user is Requester activity and should not consume a fulfiller licence; the hub's own account will be one fulfiller. Licensing is `[VERIFY]` against the order form.
- **Restricted classes are `task` children in their own scopes, not `incident` children.** HR (`sn_hr_core_case`), Security Incident Response (`sn_si_incident`), GRC issues, and Legal all sit in the single physical Task table. A query against `task` returns them unless filtered by `sys_class_name` and unless the integration account lacks their scoped roles. Query the child table, never `task`. Also: the design's legal table name `sn_legal_request` does not exist in the docs; the table is `sn_lg_ops_request`.
- **SCIM: ServiceNow is a SCIM server, but pulling from it needs `scim_admin`, which the docs call admin-equivalent.** Do not do that. The hub should be a SCIM 2.0 service provider itself and receive pushes from the customer's IdP, correlating on `externalId` and work email, and use `sys_user` lookups only to resolve `caller_id` at ticket time. RFC 7643 paths are confirmed and listed in the full report.
- **`caller_id` must be set explicitly.** `opened_by` will be the integration account. The affected user is `caller_id`, resolved from `sys_user` by email or username.

### A3 lead — what the Anthropic API research changes

- **Pricing is confirmed and Sonnet 5's price is now standing, not introductory.** Haiku 4.5 $1/$5 per MTok, Sonnet 5 $2/$10, cache read 0.1×. The cost model can be built.
- **The rate-limit tier system in the question is obsolete.** There are no Tier 1–4 deposit thresholds any more. Tiers are Start / Build / Scale / Custom, assigned automatically from usage history, with an unpublished Evaluation tier for new orgs. The binding constraint for a 5,000-endpoint fleet is not RPM or tokens per minute but the **monthly spend cap**: $500 (Start), $1,000 (Build), $200,000 (Scale). One hour of a 1,000-RPM storm on Haiku is roughly $360 uncached. Start's cap is gone in under two hours; Build's in under three. Hitting the cap returns 429 with no `retry-after` until the first of next month. A production fleet needs Scale, which is reached by history plus an in-Console request, not by paying.
- **Caching does not currently work on the routine model, and would not fix the spend problem.** Haiku 4.5's minimum cacheable prefix is 4,096 tokens. The shipped system prompt plus five tool definitions is about 1,500 tokens (estimated from `prompt.js` and `catalog.json`; confirm with `count_tokens`), plus 496 tokens of tool-use system overhead. Below the minimum, `cache_control` silently does nothing. Sonnet 5's minimum is 1,024, so caching works on the expensive model and not the cheap one. Cache reads do not count toward ITPM on either model, so once caching works it relieves token limits, but the spend cap counts dollars.
- **US-only inference is unavailable on Haiku 4.5.** `inference_geo: "us"` is supported on 4.6-and-later models only; Haiku 4.5 returns 400. There is no EU inference or EU at-rest option on the first-party API at all. Workspace geo is US only. So a tenant with a US-only requirement cannot use the routine tier as designed, and a tenant with an EU requirement cannot use the first-party API. Data residency (spec §11, question 18) is not an AWS region question any more; it is a "which models and which provider" question.
- **Default retention is 30 days; Zero Data Retention is sales-gated and per-organisation.** Whether a seed-stage self-serve org gets it is unverified. Batch API and Files API are outside ZDR. Haiku 4.5, Sonnet 5 and Opus 5 are not Covered Models, so the Fable/Mythos 30-day requirement does not apply here.
- **No SLA at any purchasable tier.** Priority Tier is no longer sold. Observed 90-day API uptime on the fetch date was 99.54%, which is about ten hours a quarter. Resilience is the hub's job: retry with backoff on 429/529, admission control from the rate-limit response headers, and the endpoint's offline behaviour.
- **Workspaces are the per-tenant control.** Per-workspace spend limits and rate limits (lower than org, never higher), a per-workspace kill switch (archive), per-workspace `inference_geo` policy. The trade: prompt caches are isolated per workspace, so a per-tenant-workspace design forfeits sharing the common prefix cache across tenants. API keys cannot be created through the Admin API, so tenant onboarding cannot mint keys programmatically.


### A4 lead — what the AWS research changes

- **The "wrong region" caveat is moot.** db.t4g.micro is $0.016/hr single-AZ in both us-east-1 and us-east-2, and every other Phase 1 line item (ALB, Fargate ARM, public IPv4, gp3, RDS Proxy) is priced identically in the two regions. The spec's rates are confirmed current.
- **The free tier the cost model assumes no longer exists for a new account.** The 12-month RDS free tier is a legacy offer for accounts activated before 2025-07-15. A new account gets $100 in credits at sign-up and can earn up to $100 more; on the Free plan the account itself closes after six months. The spec's "~$34 in year 1" and "$200 credits" are stale. Budget ~$46/month from month one on the Paid plan, with $100–200 of credits against it.
- **`max_connections` on db.t4g.micro is roughly 80–90 usable, not 112.** The formula ceiling is 112; the OS reservation is unpublished; reserved slots take a few more. Schema-per-tenant does not multiply connections if one pool serves all tenants via `search_path`. A pooler is not forced at Phase 1 if each Fargate task caps its pool around 10 and tasks stay at four or fewer; it is forced the moment autoscaling or framework-default pool sizes (20–100) appear. RDS Proxy costs $21.90/month on this instance, nearly twice the database itself; a PgBouncer sidecar is the cheap answer, with the caveat that `SET search_path` is session state and needs per-transaction handling.
- **Removing Bedrock removes the only reason to prefer us-east-1.** The Anthropic API has no AWS-region binding. No service the hub uses is us-east-1-only (ACM for CloudFront would be, and the hub has no CloudFront). AWS's own post-event summaries list ten large-scale us-east-1 events and none in us-east-2; that is a curated list and us-east-1 is the largest region, so it reflects exposure as much as reliability, but it points one way. Recommend us-east-2 unless residency question 18 says otherwise, and residency is now an Anthropic question (A3).

### A5 lead — what the endpoint research changes

- **The mTLS question is settled, against mTLS.** Zscaler's own documentation says the service does not support TLS inspection of sites that mandate mutual TLS. Palo Alto documents client authentication as a technical reason decryption fails and auto-excludes the destination for 12 hours after the first failure. Microsoft exempts its own Intune, Defender and attestation endpoints from inspection. In any inspected environment an mTLS design cannot enrol a single device until the customer's network team adds a bypass, which is a days-to-weeks ticket for a new vendor. A signed device token carried in the HTTP layer over ordinary TLS works through inspection, with two consequences: the proxy sees the token (so sign a server nonce, short lifetimes, audience binding), and the agent must not pin the hub certificate (validate against the OS store, which already holds the inspection CA). Publish a stable FQDN list anyway, as Microsoft, Zoom and Slack do.
- **TPM signing is slow enough to shape the protocol.** No authoritative Microsoft or TCG latency figure exists. The best evidence is a peer-reviewed 78-firmware study (ECDSA-P256 sign medians spanning 10–500 ms across vendors, with order-of-magnitude variation between firmware versions of the same vendor) and Chrome's field telemetry for device-bound sessions (P50 200 ms, P95 600 ms). Sign once per session to mint a short-lived token, not once per request, and serialise TPM access. That is also how Chrome's own device-bound-credential design works.
- **TPM is universal on Windows 11 and not on the Windows 10 residue.** Windows 11 requires TPM 2.0; Windows 10 support ended 2025-10-14 but paid ESU runs to 2028, and consumer-weighted web analytics still show Windows 10 at roughly 30% (not a fleet survey). Enrollment needs either a "TPM 2.0 required" support statement or a software-key fallback at a lower trust tier.
- **Failure modes are all "re-enrol", and two of them are worse than that.** TPM clear, re-image, motherboard swap: key gone, re-enrol. Anti-hammering lockout is TPM-global and triggered by Windows Hello PIN failures; a device key created without a TPM authorisation value keeps signing through it, so create it that way `[VERIFY: PCP default]`. Cloned VMs on vSphere 6.7/7 share one vTPM, so two devices present one identity; the hub must detect duplicate keys and force re-enrol. Old Intel fTPM firmware leaks ECDSA nonces to the point of key recovery from nine signatures; record TPM vendor and firmware at enrolment and gate trust on it.
- **The device key belongs in the broker.** `NCRYPT_MACHINE_KEY_FLAG` is documented; whether a non-admin process can create a machine-scoped platform key is not. The LocalSystem service is the natural owner, and the same Microsoft page warns not to create the key from inside `StartService`. This lines up with B1/H3.
- **Hash-based EDR exceptions do not survive updates, and Microsoft says so.** App Control's own docs: a hash rule needs a policy update every time the binary changes; a leaf-certificate or publisher rule does not. Defender supports certificate indicators (leaf only, up to three hours to propagate); CrowdStrike's public API has certificate-based exclusions; SentinelOne has a certificate exclusion type (secondary source). Two build-pipeline consequences: sign with an **RSA** code-signing certificate, because App Control signer rules do not support ECDSA; and keep every broker binary and native DLL under `%ProgramFiles%`, because path rules are only honoured for admin-writable paths. Nothing authoritative exists on Electron or koffi FFI as an EDR false-positive class; treat it as unknown and plan for the certificate-based allowlist conversation.
- **MSI through customer tooling is the only per-machine path for a no-admin fleet, and the broker must never accept an update from the agent.** Intune Win32 and LOB deployments run as SYSTEM. Use major upgrades (new ProductCode each release, `Schedule="afterInstallInitialize"` so a failed upgrade rolls back to the old broker rather than leaving none). Windows Installer stops and restarts the service without a reboot unless a file is held open, so ship the agent's DLLs separately from the broker's. Electron's autoUpdater is Squirrel, per-user under `%LocalAppData%`, no UAC, and Windows does not require signature verification for it to function: a per-user-writable binary is exactly MITRE T1574.010. If the broker must self-update, the broker fetches, Authenticode-verifies against a pinned publisher, and runs `msiexec` itself. Intune's "ignore app version" flag exists because self-updating apps fight MDM pushes; set it if both channels exist.

---

### A — full research reports

Reproduced unedited from the five research agents (headings demoted one level). Each ends with its own unverified list.

## Part A / A1 — Embedding model options for the hub (managed + customer-hosted)

Research date: 2026-09-02. All URLs accessed 2026-09-02 unless stated. Every figure below is taken from a retrieved page; anything not confirmed from a primary source is tagged `[VERIFY]`. Derived arithmetic is labelled "derived" or "estimate".

Conventions: "Primary" = vendor docs / model card / official repo / official pricing page. "Secondary" = blog, aggregator, Q&A.

---

### Q0. Does Anthropic offer an embeddings API?

**No.** The Anthropic docs page (old URL `docs.anthropic.com/en/docs/build-with-claude/embeddings` 301-redirects to `https://platform.claude.com/docs/en/build-with-claude/embeddings`) states: "Anthropic does not offer its own embedding model." It then recommends Voyage AI, while adding "you should assess a variety of embeddings vendors". The page lists the Voyage 4 family (voyage-4-large, voyage-4, voyage-4-lite, voyage-4-nano), previous generation (voyage-3-large, voyage-3.5, voyage-3.5-lite, voyage-code-3, voyage-finance-2, voyage-law-2), multimodal, contextualized (voyage-context-4/3) and rerankers. It explicitly notes voyage-4-nano is an "Open-weight model (Apache 2.0 license) available on Hugging Face." No "last updated" date shown on the page.

Source: https://platform.claude.com/docs/en/build-with-claude/embeddings (primary, accessed 2026-09-02).

---

### Q1. Credible current embedding options

#### Q1a. Hosted-API models

| Provider / model | Dims (Matryoshka?) | Max context (tokens) | Licence / terms | Weights downloadable? | Hosted price per 1M tokens | Sources |
|---|---|---|---|---|---|---|
| **OpenAI text-embedding-3-small** | 1536; `dimensions` param shortens (yes) | 8,192 per docs guide | OpenAI API terms (proprietary) | No | **$0.02**; Batch API "50% cost discount", supports `/v1/embeddings` | Guide: https://developers.openai.com/api/docs/guides/embeddings ; pricing: https://developers.openai.com/api/docs/pricing ; batch: https://developers.openai.com/api/docs/guides/batch (all primary). Note: `openai.com/api/pricing/` returned HTTP 403 to the fetcher. |
| **OpenAI text-embedding-3-large** | 3072; shortenable (yes) | 8,192 | OpenAI API terms | No | **$0.13**; batch 50% off | same as above (primary) |
| OpenAI text-embedding-ada-002 (legacy) | 1536; no shortening | 8,192 | OpenAI API terms | No | $0.10 | same (primary) |
| OpenAI — anything newer? | — | — | — | — | Docs guide lists only the text-embedding-3 series; "does not mention any embedding models newer than text-embedding-3." No newer OpenAI embedding model found. | primary guide + search |
| **Voyage AI voyage-4-large** | 1024 default; 256/512/2048 (Matryoshka yes); int8/uint8/binary/ubinary output | 32,000 | Voyage terms (proprietary) | No | **$0.12**; 200M free-tier tokens | https://docs.voyageai.com/docs/pricing (page states "Updated August 26, 2026"); https://docs.voyageai.com/docs/embeddings (primary) |
| **Voyage AI voyage-4** | 1024 default; 256/512/2048 | 32,000 | Voyage terms | No | **$0.06**; 200M free | same |
| **Voyage AI voyage-4-lite** | 1024 default; 256/512/2048 | 32,000 | Voyage terms | No | **$0.02**; 200M free | same |
| **Voyage AI voyage-4-nano** (open weights, listed here because it shares the hosted models' vector space) | 2048/1024/512/256 (Matryoshka yes) | 32,000 | **Apache-2.0** | **Yes** (HF `voyageai/voyage-4-nano`), 340M params (180M non-embedding + 160M embedding) | n/a (self-host) | https://huggingface.co/voyageai/voyage-4-nano ; https://blog.voyageai.com/2026/01/15/voyage-4/ (post dated 2026-01-15) (primary) |
| Voyage voyage-context-4 (contextualized chunk embeddings) | 1024 default; 256/512/2048 | 120,000 | Voyage terms | No | $0.12 | pricing + Anthropic page (primary) |
| Voyage legacy: voyage-3-large / voyage-3.5 / voyage-3.5-lite / voyage-code-3 | 1024 default; 256/512/2048 | 32,000 | Voyage terms | No | $0.18 / $0.06 / $0.02 / $0.18 — legacy models have no free tier | https://docs.voyageai.com/docs/pricing (primary) |
| **Cohere embed-v4.0** | 1536 default; 256/512/1024 selectable ("Matryoshka" per Cohere embeddings doc); float/int8/uint8/binary/ubinary | 128k | Cohere terms (proprietary); on Bedrock billed via AWS Marketplace | No public weights (docs say nothing about downloads) | **$0.12 `[VERIFY]`** — cohere.com/pricing rendered only Model Vault dedicated pricing ($4/hr small, $5/hr medium) to the fetcher; the $0.12/1M figure comes only from secondary aggregators (pricepertoken.com, cloudprice.net) | https://docs.cohere.com/docs/models ; https://docs.cohere.com/docs/embeddings ; https://docs.cohere.com/docs/cohere-embed ; https://cohere.com/pricing ; Bedrock card https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-cohere-embed-v4.html (launch Apr 15 2025, 128K context) |
| Cohere embed-english-v3.0 / embed-multilingual-v3.0 | 1024 (no Matryoshka) | 512 | Cohere terms | No | I do not have a verified source for this. | https://docs.cohere.com/docs/models (primary for dims/context) |
| Cohere embed-*-light-v3.0 | 384 | 512 | Cohere terms | No | I do not have a verified source for this. | same |
| **Google gemini-embedding-001** | 128–3,072 flexible (MRL yes; recommended 768/1536/3072; non-3072 needs manual normalisation) | 2,048 | Gemini API terms | No | **$0.15**; batch $0.075; free tier exists | https://ai.google.dev/gemini-api/docs/embeddings (page "Last updated 2026-08-26 UTC"); https://ai.google.dev/gemini-api/docs/pricing (page "last updated 2026-09-02 UTC") (primary) |
| **Google gemini-embedding-2** (GA, multimodal) | 128–3,072 (MRL yes) | 8,192 text tokens | Gemini API terms | No | **$0.20** text; batch $0.10 | pricing page above; model page https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2 (updated 2026-04-28) (primary) |
| **Amazon Titan Text Embeddings V2** (switching baseline) `amazon.titan-embed-text-v2:0` | 1024 default; 512, 256 (selectable output size) | 8,192 tokens / 50,000 chars | AWS Bedrock terms | No | **$0.02 (= $0.00002 per 1K) `[VERIFY]`** — the Bedrock pricing page is JS-rendered and the fetcher could not extract the Titan row; figure is from secondary sources (cloudprice.net, getmaxim.ai, re:Post thread) | https://docs.aws.amazon.com/bedrock/latest/userguide/titan-embedding-models.html ; https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-titan-text-embeddings-v2.html (launch Apr 30 2024; "Context window: 8K tokens") (primary for specs); https://aws.amazon.com/bedrock/pricing/ (fetched, row not extractable) |

Note on Titan V2 languages: docs say "English (100+ languages in preview)" and warn cross-language queries "will return sub-optimal results."

#### Q1b. Self-hostable models (weights downloadable)

| Model | Params | Dims (Matryoshka?) | Max context (tokens) | Licence (SPDX) | Commercial self-hosting OK? | Sources |
|---|---|---|---|---|---|---|
| **BAAI/bge-m3** | ~568M (derived: pytorch_model.bin = 2,271,145,830 bytes fp32 ÷ 4) | 1024 (no Matryoshka mentioned) | 8,192 | **MIT** | Yes | https://huggingface.co/BAAI/bge-m3 (card last news entry 2024-07-01; API lastModified 2024-07-03); https://huggingface.co/api/models/BAAI/bge-m3?blobs=true |
| **BAAI/bge-large-en-v1.5** | 0.3B (card) | 1024 (no) | 512 | **MIT** — card: "can be used for commercial purposes free of charge" | Yes | https://huggingface.co/BAAI/bge-large-en-v1.5 (API lastModified 2024-02-21) |
| BAAI/bge-base-en-v1.5 / bge-small-en-v1.5 | ~110M / ~45M (Intel blog: 110M, 45M) | 768 / 384 | 512 | MIT | Yes | bge-m3 card spec table; https://huggingface.co/blog/intel-fast-embedding |
| **nomic-ai/nomic-embed-text-v1.5** | 137M (TEI table) / "0.1B" (card) | 768; Matryoshka 512/256/128/64 (yes) | 8,192 | **Apache-2.0** | Yes | https://huggingface.co/nomic-ai/nomic-embed-text-v1.5 (API lastModified 2026-04-07) |
| nomic-ai/nomic-embed-text-v2-moe | 475M total / 305M active | 768; Matryoshka to 256 (yes) | 512 | Apache-2.0 | Yes | https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe |
| **Alibaba-NLP/gte-large-en-v1.5** | 434M | 1024 (no) | 8,192 | **Apache-2.0** | Yes | https://huggingface.co/Alibaba-NLP/gte-large-en-v1.5 ; gte-base-en-v1.5: 137M, 768 dims |
| **Qwen/Qwen3-Embedding-0.6B** | 0.6B (safetensors total 595,776,512) | 1024; user-defined 32–1024 (MRL yes) | 32,000 | **Apache-2.0** | Yes | https://huggingface.co/Qwen/Qwen3-Embedding-0.6B (API lastModified 2026-04-20). Siblings: 4B → 2560 dims; 8B → 4096 dims |
| **intfloat/multilingual-e5-large** | I do not have a verified source for the exact count on the card; TEI lists the `-instruct` sibling at 560M | 1024 (no) | 512 | **MIT** | Yes | https://huggingface.co/intfloat/multilingual-e5-large (API lastModified 2026-04-02); TEI supported-models table |
| intfloat/e5-large-v2 | 24 layers (card); count not stated | 1024 | 512 | MIT | Yes | https://huggingface.co/intfloat/e5-large-v2 |
| **Snowflake/snowflake-arctic-embed-l-v2.0** | 568M (303M non-embedding) | 1024; MRL truncation to 256 (yes) | 8,192 | **Apache-2.0** | Yes | https://www.snowflake.com/en/blog/engineering/snowflake-arctic-embed-2-multilingual/ (2024-12-04, vendor blog); https://huggingface.co/Snowflake/snowflake-arctic-embed-l-v2.0 (API lastModified 2025-07-28); https://github.com/Snowflake-Labs/arctic-embed |
| Snowflake/snowflake-arctic-embed-m-v2.0 | 305M (113M non-embedding) | 768 `[VERIFY]` (blog gives 256 truncated; native dim not stated in retrieved text) ; MRL 256 | 8,192 | Apache-2.0 | Yes | same vendor blog |
| Snowflake/snowflake-arctic-embed-m-v1.5 | 109M | 768; MRL to 256 | 512 | Apache-2.0 | Yes | https://github.com/Snowflake-Labs/arctic-embed |
| **sentence-transformers/all-MiniLM-L6-v2** | 22.7M (safetensors total 22,713,728) | 384 (no) | 256 word pieces (truncates) | **Apache-2.0** | Yes | https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2 (API lastModified 2026-06-01) |
| **jinaai/jina-embeddings-v3** | 570M | 1024; Matryoshka 32–768 (yes) | 8,192 | **CC-BY-NC-4.0** (HF API `license: cc-by-nc-4.0`) | **No** — NonCommercial. Jina's own page marks v3 deprecated, recommends v5. | https://huggingface.co/api/models/jinaai/jina-embeddings-v3 (lastModified 2026-04-08); https://jina.ai/models/jina-embeddings-v3/ (HF HTML page exceeded fetch size limit) |
| **jinaai/jina-embeddings-v4** | 4B (Qwen2.5-VL-3B based) | 2048; Matryoshka 128–2048 | 32,768 | **Qwen Research License** — LICENSE file: "FOR NON-COMMERCIAL PURPOSES ONLY" | **No** | https://huggingface.co/jinaai/jina-embeddings-v4 ; https://huggingface.co/jinaai/jina-embeddings-v4/raw/main/LICENSE |
| jinaai/jina-embeddings-v5-text-small | 677M | 1024; Matryoshka 32–1024 | 32,768 | CC-BY-NC-4.0 | **No** (contact sales) | https://huggingface.co/jinaai/jina-embeddings-v5-text-small |
| **mixedbread-ai/mxbai-embed-large-v1** | 0.3B (card sidebar) | 1024 `[VERIFY]` (card example uses `dimensions=512`, native dim not stated in retrieved text); Matryoshka + binary quantisation supported (card) | 512 `[VERIFY]` — not stated in retrieved card/blog text | **Apache-2.0** | Yes | https://huggingface.co/mixedbread-ai/mxbai-embed-large-v1 ; https://www.mixedbread.com/blog/mxbai-embed-large-v1 (2024-03-08) |
| **google/embeddinggemma-300m** (added; relevant CPU-class open model) | 300M (TEI: 308M) | 768; MRL 512/256/128 | 2,048 | **Gemma Terms of Use** (not SPDX/OSI; commercial use permitted subject to Prohibited Use Policy and flow-down terms; terms page last updated 2026-04-01). Gated on HF. | Yes, with licence-compliance overhead | https://huggingface.co/google/embeddinggemma-300m ; https://ai.google.dev/gemma/terms |
| **voyageai/voyage-4-nano** (see Q1a) | 340M | 2048/1024/512/256 | 32,000 | **Apache-2.0** | Yes | https://huggingface.co/voyageai/voyage-4-nano |

Model-file sizes retrieved (for Q4): all-MiniLM-L6-v2 `model.safetensors` 90,868,376 B (~91 MB), int8 ONNX ~23 MB; bge-m3 `pytorch_model.bin` 2,271,145,830 B (~2.27 GB) and ONNX data ~2.27 GB. Other sizes: HF API did not return `safetensors.total` for bge-large, e5-large, arctic-l-v2, nomic; use params × 4 bytes (fp32) as a derived estimate (e.g. 335M → ~1.3 GB; 137M → ~0.55 GB; 568M → ~2.3 GB).

---

### Q2. Can one embedder serve BOTH the managed hub and the customer-hosted hub?

**Yes — achievable, but only with a downloadable, commercially-licensed model that you also run yourself in the managed environment (or, uniquely, with the Voyage 4 family via its shared vector space).**

Candidates satisfying (a) downloadable weights, (b) licence permitting commercial self-hosting, (c) runnable on CPU in Fargate and in a customer's container (all supported by HF Text Embeddings Inference CPU images — see Q4):

| Candidate | Licence | Runs in TEI CPU image? (per TEI supported-models list) | Notes |
|---|---|---|---|
| voyage-4-nano | Apache-2.0 | Yes (listed as Qwen3 arch, 340M) | Unique hybrid: vendor says Voyage 4 embeddings "can be directly compared and used interchangeably" across nano/lite/4/large. So managed hub could call hosted voyage-4-lite while customer-hosted runs nano, with the SAME vector space. Cross-model retrieval quality is a vendor claim `[VERIFY]` — not independently benchmarked here. |
| BAAI/bge-m3 | MIT | Yes (XLM-RoBERTa) | 568M; heavier on CPU |
| BAAI/bge-large/base/small-en-v1.5 | MIT | Yes (BERT) | 512-token limit; English |
| nomic-embed-text-v1.5 | Apache-2.0 | Yes (NomicBERT, listed) | 137M, 8k ctx, Matryoshka |
| gte-large-en-v1.5 / gte-base-en-v1.5 | Apache-2.0 | Yes (Alibaba GTE, listed) | 8k ctx |
| Qwen3-Embedding-0.6B | Apache-2.0 | Yes (Qwen3, listed; TEI's own CPU quick-start uses this model) | 32k ctx, MRL |
| multilingual-e5-large / e5-large-v2 | MIT | Yes (XLM-RoBERTa / BERT) | 512-token limit |
| snowflake-arctic-embed-m-v2.0 / l-v2.0 | Apache-2.0 | Yes (both listed) | 8k ctx, MRL to 256 |
| all-MiniLM-L6-v2 | Apache-2.0 | Yes (BERT) | tiny; 256-token limit; quality floor |
| mxbai-embed-large-v1 | Apache-2.0 | Yes (BERT) | 512 ctx `[VERIFY]` |
| embeddinggemma-300m | Gemma Terms (non-OSI, commercial OK with restrictions) | Yes (Gemma3, listed, gated) | flow-down licence obligations to customers |

**Excluded** (fail one of the conditions): OpenAI, Cohere embed-v4, Gemini embedding, Titan V2 — hosted-only, no weights. Jina v3 / v4 / v5-text-small — non-commercial licences (CC-BY-NC-4.0 / Qwen Research License).

**Plain statement on the migration trap:** if the managed hub uses a hosted-only model (OpenAI, Voyage hosted, Cohere, Gemini, Titan) and a customer-hosted deployment cannot make outbound API calls, the two modes cannot share vectors; moving a tenant between modes requires a full re-embed of the corpus (and, if both must coexist, two index columns). The only partial exception found is Voyage 4, where the vendor claims nano (self-hosted) and the hosted models share one space — which would allow migration without re-embedding, if the claim holds for your data `[VERIFY]`.

Sources: TEI supported models https://huggingface.co/docs/text-embeddings-inference/en/supported_models ; Voyage 4 blog https://blog.voyageai.com/2026/01/15/voyage-4/ ; model cards as in Q1.

---

### Q3. Re-embedding cost at 10,000 articles

**Assumptions (explicit):** 10,000 articles × ~800 tokens = ~8M raw tokens; chunked to ~400-token chunks with overlap → ~25,000 chunks, ~10–12M embedded tokens. Costs shown for the 12M-token upper bound (multiply by 0.83 for 10M). Prices are per-1M-token figures verified in Q1.

#### Q3a. Hosted-API dollar cost (one full re-embed)

| Model | Price / 1M | Cost @ 12M tokens | Notes |
|---|---|---|---|
| OpenAI text-embedding-3-small | $0.02 | **$0.24** | Batch API (50% off): $0.12 |
| OpenAI text-embedding-3-large | $0.13 | **$1.56** | Batch: $0.78 |
| Voyage voyage-4-lite | $0.02 | **$0.24** | 200M free tokens → effectively $0 for first ~16 such re-embeds |
| Voyage voyage-4 | $0.06 | **$0.72** | same free tier |
| Voyage voyage-4-large | $0.12 | **$1.44** | same free tier |
| Voyage voyage-3.5-lite (legacy) | $0.02 | $0.24 | no free tier |
| Cohere embed-v4.0 | $0.12 `[VERIFY]` | **$1.44 `[VERIFY]`** | price not extracted from vendor page |
| Gemini gemini-embedding-001 | $0.15 | **$1.80** | Batch: $0.90 |
| Gemini gemini-embedding-2 | $0.20 | **$2.40** | Batch: $1.20 |
| Amazon Titan Text Embeddings V2 | $0.02 `[VERIFY]` | **$0.24 `[VERIFY]`** | baseline being replaced |

Conclusion: at this corpus size, hosted re-embedding is a rounding error (well under $3 per tenant even for the most expensive model). Cost is not the deciding factor; lock-in and deployability are.

#### Q3b. Time on CPU for a self-hosted model

**Verified vendor / official-benchmark throughput figures found:**

1. Hugging Face (sentence-transformers maintainer) blog "static-embeddings", 2025-01-15, CPU i7-13700K, GPU RTX 3090, 32 GB RAM; metric = GooAQ query embeddings per second (short query texts; sequence length not stated):
   - all-MiniLM-L6-v2: **1,739.31 sentences/s** CPU (16,942 GPU)
   - bge-base-en-v1.5: **264.83 sentences/s** CPU (4,363 GPU)
   - all-mpnet-base-v2: 270.40 sentences/s CPU
   - bge-m3: **80.63 sentences/s** CPU (1,434 GPU)
   Source: https://huggingface.co/blog/static-embeddings (primary-ish: official HF blog by the sentence-transformers maintainer).
2. Hugging Face + Intel blog "CPU Optimized Embeddings with Optimum Intel and fastRAG", 2024-03-15, Intel Xeon 8480+ (4th gen, 56 cores/socket, one socket used): int8-quantised bge-small/base batch-1 latency "under 10 ms", bge-large "<20 ms"; int8 up to 4.5× faster than fp32; throughput at 256-token sequences peaks at batch 128, ~4× over bf16. Absolute throughput numbers were in charts and not extractable as text. Source: https://huggingface.co/blog/intel-fast-embedding.
3. Snowflake Arctic Embed 2.0 blog: ">100 documents per second" and "sub-10ms query embedding latency" — but on **NVIDIA A10 GPUs**, not CPU. Source: https://www.snowflake.com/en/blog/engineering/snowflake-arctic-embed-2-multilingual/.
4. Nomic's local-inference blog (CPU latency charts) was unreachable (ECONNREFUSED) at access time. I do not have a verified source for nomic CPU throughput.

No vendor publishes tokens/sec on a Fargate-class (1–2 vCPU) CPU for 400-token chunks. **I do not have a verified source for this.**

**Order-of-magnitude ESTIMATE (clearly labelled; not a measurement):**
- The static-embeddings figures are for short queries (GooAQ; assume ~10–20 tokens each). Treating bge-base at 264.83 short sentences/s as roughly 3,000–5,000 tokens/s on a 16-core desktop CPU, 12M tokens ≈ **40–70 minutes** on that class of machine; bge-m3 at 80.63/s ≈ ~1,000–1,500 tokens/s → **~2–3 hours**; all-MiniLM-L6-v2 ≈ 20,000–35,000 tokens/s → **~6–10 minutes**.
- Cross-check by FLOP arithmetic: ~2 × params FLOP/token → bge-base (110M) ≈ 0.22 GFLOP/token → 12M tokens ≈ 2.6 PFLOP. A 2-vCPU Fargate task (≈1 physical core, tens of GFLOPS effective fp32) would need on the order of **7–15 hours**; a 16-core box at ~1 TFLOPS effective ≈ ~45 min (consistent with item above). int8/ONNX quantisation (Intel blog: up to 4.5×) would shorten these proportionally.
- Practical reading: on a small Fargate task, a full 10k-article re-embed with a 100–300M model is an **hours-long background job**, not minutes; with a 568M model (bge-m3, arctic-l-v2) it is a **large fraction of a day** unless you scale out or add a GPU. These are estimates, not vendor figures.

---

### Q4. Does a self-hostable embedder of adequate quality run on CPU?

**Runs: yes, officially supported.**
- HF Text Embeddings Inference ships CPU-only Docker images: `ghcr.io/huggingface/text-embeddings-inference:cpu-1.9` (x86_64) and `cpu-arm64-1.9` (aarch64). Backends: ONNX Runtime ("recommended for x86") and Intel MKL; Apache-2.0 licence. Supported architectures include BERT, XLM-RoBERTa, NomicBERT, Alibaba GTE, Qwen2/Qwen3, MPNet, ModernBERT, Gemma3, JinaBERT, Mistral. TEI's own "local CPU" quick-start uses `Qwen/Qwen3-Embedding-0.6B`. Sources: https://github.com/huggingface/text-embeddings-inference ; https://huggingface.co/docs/text-embeddings-inference/en/supported_models ; https://huggingface.co/docs/text-embeddings-inference/en/local_cpu (all primary).
- sentence-transformers efficiency docs recommend ONNX (int8 dynamic quantisation via Optimum, "faster inference on CPUs") and OpenVINO for CPU; the default quantisation configs (arm64/avx2/avx512/avx512_vnni) give "roughly equivalent speedups". No absolute CPU numbers on that page. Source: https://sbert.net/docs/sentence_transformer/usage/efficiency.html.
- ONNX Runtime threading guidance: default one intra-op thread per physical core; no latency figures. Source: https://onnxruntime.ai/docs/performance/tune-performance/threading.html.
- Qdrant FastEmbed (Apache-2.0) is CPU/ONNX-first with default model bge-small-en-v1.5, but publishes no throughput figures in its README. Source: https://github.com/qdrant/fastembed.
- EmbeddingGemma card: designed for "mobile phones, laptops, or desktops"; no latency figures; activations do not support float16. Source: https://huggingface.co/google/embeddinggemma-300m.

**Model sizes (for container/RAM planning):** all-MiniLM-L6-v2 ~91 MB fp32 / ~23 MB int8 ONNX (verified file sizes); bge-m3 ~2.27 GB fp32 (verified). Derived (params × 4 B): bge-base ~0.44 GB, nomic-v1.5 ~0.55 GB, bge-large / mxbai ~1.3 GB, arctic-l-v2 / multilingual-e5-large ~2.3 GB, Qwen3-0.6B ~2.4 GB fp32 (~1.2 GB bf16).

**"Runs" vs "fast enough":**
- *Interactive query embedding (<200 ms, batch 1):* The only vendor-published CPU latency is Intel/HF on a 56-core Xeon 8480+: int8 bge-small/base <10 ms, bge-large <20 ms. On that hardware <200 ms is trivially met. For a 1–2 vCPU Fargate task no vendor figure exists — **I do not have a verified source for this.** Estimate: a single ~15–30-token query through a 100–150M int8 model on 1–2 vCPUs is plausibly tens of ms; a 568M model plausibly 100–300 ms. Measure before committing.
- *Bulk ingest:* see Q3b — hours on small CPU tasks; acceptable as a background job with a queue, not acceptable synchronously.

Practical sizing hint: smaller models (nomic-v1.5 137M, arctic-m-v2.0 305M, gte-base 137M, embeddinggemma 300M, voyage-4-nano 340M) are the realistic CPU tier; 568M XLM-R-large-class models (bge-m3, arctic-l-v2, multilingual-e5-large) work but cost 3–4× more CPU per token (derived from param ratio and the bge-base vs bge-m3 ratio 264.8/80.6 ≈ 3.3× in the HF benchmark).

---

### Q5. pgvector on Amazon RDS for PostgreSQL

#### Q5a. pgvector versions per RDS PostgreSQL major version
Source: https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-extensions.html and https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-versions.html (primary; no "last updated" date rendered).

| RDS PG major | Latest minor (per versions page) | pgvector in latest minors | Earlier steps |
|---|---|---|---|
| 19 (Beta) | 19 Beta 3 | 0.8.2 | — |
| 18 | 18.6 | **0.8.2** (18.1–18.6) | 18.0 preview: 0.8.0 |
| 17 | 17.11 | **0.8.2** (17.9–17.11) | 17.7–17.8: 0.8.0 (page also cites 0.8.1 at 17.8); 17.4–17.6: 0.8.0; 17.2–17.3: 0.7.4; 17.1: 0.7.3 |
| 16 | 16.15 | **0.8.2** (16.13–16.15) | 16.11–16.12: 0.8.0/0.8.1; 16.8–16.10: 0.8.0; 16.6–16.7: 0.7.3; 16.4–16.5: 0.7.0; 16.3: 0.6.2; 16.2: 0.6.0; 16.1: 0.5.1 |
| 15 | 15.19 | **0.8.2** (15.17–15.19) | 15.15–15.16: 0.8.1; 15.12–15.14: 0.8.0; 15.10–15.11: 0.7.3; 15.8–15.9: 0.7.0; 15.7: 0.6.2; 15.6: 0.6.0; 15.5: 0.5.1; 15.3–15.4: 0.4.x |
| 14 | n/a in fetch | 0.8.0 from 14.14+ (AWS What's New, 2024-11-21). Latest 14.x pgvector version `[VERIFY]` — the extensions page table for 14 was truncated in retrieval. | |
| 13 | n/a | 0.8.0 from 13.17+ (same announcement). Latest `[VERIFY]`. | |

Security note on the versions page: RDS 16.13-R2, 17.9-R2, 18.3-R2 "include fixes for CVE-2026-3172" (pgvector).

#### Q5b. Index types and when HNSW arrived
- pgvector supports **IVFFlat** and **HNSW**. HNSW added in **pgvector 0.5.0, released 2023-08-28** (CHANGELOG). halfvec/sparsevec types and bit indexing: **0.7.0, 2024-04-29**. Iterative index scans: **0.8.0, 2024-10-30**. Latest tagged release per README: **0.8.6** (CHANGELOG shows 0.8.7 unreleased).
- HNSW defaults: `m` = 16, `ef_construction` = 64, `hnsw.ef_search` = 40; parallel build workers 2 by default.
Sources: https://github.com/pgvector/pgvector (README) ; https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md (primary).
- On RDS: HNSW available since pgvector 0.5.x minors (e.g. RDS 16.1 ships 0.5.1). AWS Aurora KB doc: use "pgvector 0.5.0 and higher version that supports HNSW indexing" and recommends `ef_construction=256` for 0.6.0+ (parallel build). Source: https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/AuroraPostgreSQL.VectorDB.html.

#### Q5c. Dimension limits (pgvector README, primary)
| Type | Storage max | Indexable max (HNSW/IVFFlat) |
|---|---|---|
| `vector` (fp32) | 16,000 dims | **2,000 dims** |
| `halfvec` (fp16) | 16,000 dims | **4,000 dims** |
| `bit` | 64,000 dims | 64,000 dims |
| `sparsevec` | 16,000 non-zero elements | 1,000 non-zero elements |
Storage: "Each vector takes 4 * dimensions + 8 bytes." Implication: OpenAI 3-large (3072), Qwen3-Embedding-4B/8B (2560/4096), Gemini at 3072, and Voyage at 2048 exceed the 2,000-dim `vector` index limit — index them as `halfvec` (≤4,000) or truncate via Matryoshka. All 1024-dim candidates are fine.

#### Q5d. Instance-class caveats — db.t4g.micro (1 GiB RAM)
- db.t4g.micro = 2 vCPU, **1 GiB** RAM; db.t4g.small = 2 GiB; db.t4g.medium = 4 GiB. Source: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.DBInstanceClass.Summary.html (primary).
- RDS defaults: `shared_buffers` = `{DBInstanceClassMemory/32768}` (8 KB pages → 25% of RAM ≈ **256 MB** on 1 GiB); `maintenance_work_mem` default "64 MB"; `work_mem` 4 MB. Source: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Tuning.concepts.memory.html (primary). (Secondary sources cite the parameter-group formula `GREATEST({DBInstanceClassMemory*1024/63963136},65536)` kB `[VERIFY]`.)
- pgvector README: "Indexes build significantly faster when the graph fits into maintenance_work_mem"; PostgreSQL emits the notice "hnsw graph no longer fits into maintenance_work_mem after N tuples" when it does not.

**Raw vector size (derived from README formula, 1024 dims × 4 B + 8 B = 4,104 B/row):**

| Rows | Raw `vector(1024)` data | vs 64 MB maintenance_work_mem | vs 256 MB shared_buffers | vs 1 GiB RAM |
|---|---|---|---|---|
| 25,000 (one tenant) | **~103 MB** | exceeds → build spills, slow | fits | fits |
| 100,000 | ~410 MB | exceeds | exceeds | fits, tight (PG + OS need memory too) |
| 250,000 (10 tenants) | **~1.03 GB** | exceeds | exceeds | **exceeds total RAM** |

HNSW index size is at least the vector payload plus neighbour lists (m=16 → up to 32 neighbours on layer 0 per element) — pgvector publishes no exact formula; treat index ≈ 1.0–1.5× raw data as an **estimate**. Conclusion: a db.t4g.micro can *build and hold* a 25k × 1024-dim HNSW index (~100 MB data + index) if `maintenance_work_mem` is raised (needs a custom parameter group) and nothing else competes for RAM, but at ~250k rows the index (~1 GB+) cannot be memory-resident on 1 GiB; queries become I/O-bound and builds crawl. Mitigations verified as available: `halfvec` (halves storage, indexable to 4,000 dims), Matryoshka truncation to 512/256 dims (supported by voyage-4-nano, nomic, Qwen3, arctic, mxbai, OpenAI-3, Gemini, Cohere v4, Titan V2), `bit` binary quantisation with rescoring, or simply db.t4g.small/medium (2/4 GiB).

#### Q5e. pgvector 0.8.x features (iterative index scans) on RDS
Yes. RDS announced pgvector 0.8.0 on **2024-11-21** for PG 17.1+, 16.5+, 15.9+, 14.14+, 13.17+ (China regions also 12.21+), explicitly describing iterative scans: "pgvector will continue to search the index until it hits a configurable threshold." Current RDS minors ship **0.8.2** (settings `hnsw.iterative_scan = strict_order | relaxed_order`). Sources: https://aws.amazon.com/about-aws/whats-new/2024/11/amazon-rds-for-postgresql-pgvector-080/ ; https://www.amazonaws.cn/en/new/2024/amazon-rds-for-postgresql-supports-pgvector-0-8-0/ ; extensions page above (primary).

---

### Bottom-line observations for the review (facts above, judgement here)
1. Anthropic has no embeddings API; the decision is independent of the Bedrock → Anthropic-direct move.
2. Hosted re-embedding cost is negligible (<$3 per 10k-article tenant, every model). The binding constraints are (a) the customer-hosted/no-egress mode and (b) tiny-RDS memory.
3. The only option that lets managed (hosted API) and customer-hosted (local CPU) share one vector space without re-embedding is the Voyage 4 family (hosted voyage-4-lite/4/large + open-weight Apache-2.0 voyage-4-nano), per vendor claim `[VERIFY]`. Otherwise, pick one open-weight model (Apache-2.0/MIT, 100–350M params, Matryoshka, ≥8k context: nomic-v1.5, arctic-m-v2.0, gte-base/large, Qwen3-0.6B, voyage-4-nano) and run it yourself in both modes via TEI CPU images.
4. Avoid Jina v3/v4/v5 (non-commercial licences) and any >2,000-dim default output unless stored as `halfvec` or truncated.
5. db.t4g.micro is adequate for a single ~25k-chunk tenant with a raised `maintenance_work_mem`; it is not adequate for multi-tenant HNSW at 250k × 1024-dim.

---

### Unverified / could not find

| Item | Status |
|---|---|
| Amazon Titan Text Embeddings V2 price $0.02/1M ($0.00002/1K) | `[VERIFY]` — Bedrock pricing page table not extractable (JS); figure from secondary aggregators and a re:Post thread (re:Post returned 403). |
| Cohere embed-v4.0 API price $0.12/1M | `[VERIFY]` — cohere.com/pricing showed only Model Vault hourly pricing to the fetcher; $0.12 is from secondary aggregators. |
| Cohere embed-v3.0 / light-v3.0 API prices | I do not have a verified source for this. |
| mxbai-embed-large-v1 native dims (1024) and 512-token context | `[VERIFY]` — not present in retrieved card/blog text. |
| snowflake-arctic-embed-m-v2.0 native dimension (768) | `[VERIFY]` — vendor blog text only gave the 256-dim truncated figure. |
| multilingual-e5-large / e5-large-v2 exact parameter counts | I do not have a verified source for this (TEI lists the -instruct sibling at 560M). |
| Latest pgvector version on RDS PostgreSQL 14.x and 13.x | `[VERIFY]` — extension table truncated in retrieval; 0.8.0 from 14.14/13.17 is verified via AWS What's New. |
| RDS `maintenance_work_mem` parameter-group formula `GREATEST({DBInstanceClassMemory*1024/63963136},65536)` | `[VERIFY]` — secondary only; AWS memory page states "default value is 64 MB". |
| Voyage 4 cross-model (nano ↔ hosted) retrieval quality | `[VERIFY]` — vendor claim of interchangeable embeddings; no independent benchmark retrieved. |
| Any CPU tokens/sec or latency on Fargate-class (1–2 vCPU) hardware for bge/e5/nomic-class models | I do not have a verified source for this. Only figures found: HF static-embeddings blog (i7-13700K, short queries) and Intel/HF blog (56-core Xeon, batch-1 latency). |
| Nomic CPU latency figures | Nomic blog unreachable (ECONNREFUSED) at access time. |
| HNSW index size formula | pgvector publishes none; 1.0–1.5× raw data is an estimate. |
| OpenAI max input 8,191 vs 8,192 tokens | Guide page rendered "8,192"; model pages did not state a limit. Treat as ~8k. |
| Amazon Titan V2 exact multilingual quality; "100+ languages in preview" | vendor wording only; no benchmark retrieved. |

Pages unreachable / unusable at access time: https://openai.com/api/pricing/ (403); https://repost.aws/... Titan pricing thread (403); https://home.nomic.ai/blog/posts/local-nomic-embed (connection refused); https://aws.amazon.com/blogs/aws/amazon-titan-text-v2-... (404); https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL_pgvector.html (no content); https://huggingface.co/jinaai/jina-embeddings-v3 (HTML >10 MB, used HF API JSON + jina.ai instead); https://aws.amazon.com/bedrock/pricing/ (fetched but pricing table not rendered).

---

## Part A / A2 — ServiceNow adapter research (interaction model, task/incident schema, journal safety, KB entitlement, restricted classes, SCIM)

Research date: 2026-09-02. All URLs below were retrieved on 2026-09-02 unless stated otherwise.

Retrieval note (important for the reader): every `docs.servicenow.com/bundle/...` URL now 301/302-redirects to `www.servicenow.com/docs/...`. Some redirect to a specific page (retrievable); many redirect to the docs home page and return only navigation chrome (not retrievable). Where I could retrieve a `www.servicenow.com/docs/bundle/<release>-...` or `/docs/r/<release>/...` page I cite it as PRIMARY. Where only community/blog/vendor pages were available I say so and mark the claim `[VERIFY]`. `support.servicenow.com` KB articles are JavaScript-rendered and returned no content. `developer.servicenow.com` pages returned "Content not available."

---

### Q1. `interaction` and `interaction_related_record`

#### Existence, plugin, roles — PRIMARY

- Tables (PRIMARY): "Components installed with Interaction Management", Zurich — https://www.servicenow.com/docs/bundle/zurich-servicenow-platform/page/administer/interaction/reference/components-installed-with-interaction-management.html (2026-09-02). Lists exactly three tables:
  - Interaction `[interaction]` — "Table for all interaction records."
  - Interaction JSON blob `[interaction_json_blob]` — "List of records that store context information for each interaction."
  - Interaction related record `[interaction_related_record]` — "List of related records that have been associated with an interaction."
  - The page states the components are installed with the "Interaction Logging, Routing, and Queueing plugin". It does NOT say which table `interaction` extends.
- Plugin ID (PRIMARY): "Interaction Management" concept page — https://www.servicenow.com/docs/r/servicenow-platform/interaction-management/interaction-management.html and the Yokohama bundle copy https://www.servicenow.com/docs/bundle/yokohama-servicenow-platform/page/administer/interaction/concept/interaction-management.html (2026-09-02): "Interaction Logging, Routing, and Queueing plugin (com.glide.interaction)". Definition: "Each interaction represents a request for assistance through a given channel".
- Roles (PRIMARY, same components page): `interaction_admin` ("Configure interactions for users.", contains `interaction_agent`) and `interaction_agent` ("Create and edit interactions. Transfer interactions to different agents or queues.").
- Which apps use it (SECONDARY): ServiceNow Community answer — "Virtual Agent, Agent Chat, and Connect Support use this plugin." https://www.servicenow.com/community/developer-forum/unable-to-create-interaction-from-virtual-agent/m-p/3194440 (2026-09-02).

#### Does `interaction` extend `task`?

- No PRIMARY statement found either way. The Interaction Management docs pages I retrieved never say "extends Task", and the "Important Task table fields"/"Task table structure" pages do not list Interaction among Task children.
- SECONDARY evidence that it does NOT extend `task`:
  - Community (The Machine, Mega Sage, 2024-03-14): "It looks like Interaction doesn't extend task." https://www.servicenow.com/community/developer-forum/is-there-a-way-to-add-a-sla-to-interaction-which-should-close/m-p/2863207 (2026-09-02).
  - Community: interaction is not selectable in the SLA Definition "Table" field, whose reference qualifier only allows task-extending tables. https://www.servicenow.com/community/developer-forum/sla-definition-on-interactions-table/m-p/1864229 (2026-09-02).
- Conclusion: `interaction` is a standalone base table, not a `task` child `[VERIFY]` — design consequence: task-only machinery (SLAs on `task_sla`, `task`-level ACLs, `sys_journal_field.name='task'` assumptions, `correlation_id`) must not be assumed to exist on `interaction`.

#### Key fields (label → element)

- PRIMARY (labels only): "Create an interaction" — http://www.servicenow.com/docs/r/servicenow-platform/interaction-management/create-interactions.html (2026-09-02). Role required: `interaction_agent`. Fields: Type ("Select the type of interaction. For example, chat, phone, and so on."), Opened for ("Select the user who started the interaction."), Assigned to, State, Short description, Work notes.
- PRIMARY (labels only): "Interaction form", Zurich — https://www.servicenow.com/docs/r/zurich/servicenow-platform/interaction-management/interaction-form.html (2026-09-02). Fields: Number, Type ("The type of customer interaction, such as a chat or phone call."), Account, Contact, Consumer, State, Assigned to, Short description, Work notes, Wrap up duration, System wrap up.
- PRIMARY (Virtual Agent behaviour): "Virtual Agent interaction records", Washington DC — https://www.servicenow.com/docs/bundle/washingtondc-servicenow-platform/page/administer/virtual-agent/concept/va-interactions.html (2026-09-02): "an interaction record captures the entire conversation in the Interactions [interaction] table"; Opened for = "Name of the requester. Anonymous users are identified as Guests."; Assigned to = "Live agent name or Virtual Agent"; "Virtual Agent conversations are record type Chat."
- Element names: `opened_for` and `assigned_to` confirmed only SECONDARY, from OOB ACL scripts quoted in community (`current.opened_for == user`, `current.assigned_to`) — https://www.servicenow.com/community/developer-forum/interaction-table-role/m-p/2364209 (2026-09-02). The same post says an OOB ACL grants read to roles `itil`, `interaction_agent`, `sn_esm_agent`. `[VERIFY]`
- `type` vs `channel`: the form label is "Type"; the REST payload seen in community uses `channel` (see REST section). Exact element name `[VERIFY]`.
- Context / channel metadata (PRIMARY): "Interaction context and channel metadata" — https://www.servicenow.com/docs/r/servicenow-platform/interaction-management/interaction-context-channel-metadata.html (2026-09-02): context "stored on the interaction_json_blob table by default, however you can use any table"; channel metadata is "free-form JSON or a reference to another record". Community names the fields "Channel Metadata Table" and "Channel Metadata Record" (reference to `sys_cs_conversation` for VA) — https://www.servicenow.com/community/virtual-agent-nlu-forum/how-interaction-is-associated-with-conversation/m-p/3044253 (search snippet, 2026-09-02). Element names `context_table`/`context_document`/`channel_metadata_table`/`channel_metadata_document` `[VERIFY]` — I do not have a verified source for the exact element names.
- States (PRIMARY): "Interaction states" — https://www.servicenow.com/docs/r/servicenow-platform/interaction-management/interaction-states.html (2026-09-02): New ("An interaction is inserted into the interaction table."), On Hold, Work In Progress, Wrap Up, Closed Complete, Closed Abandoned. Integer values `[VERIFY]` (not shown on the page).

#### `interaction_related_record` cardinality and columns

- PRIMARY (form labels): "Associate a record with an interaction", Xanadu — https://www.servicenow.com/docs/r/xanadu/servicenow-platform/interaction-management/associate-record.html (2026-09-02). Role: `interaction_agent`. Form ("Interaction Related Record") fields: Document table; Record Type (Task or Knowledge); Task (when Record Type = Task); Knowledge article (when Record Type = Knowledge); "ID of related record" (auto-populated). Result: "Task type records associated will appear in the Related Tasks related list".
- Cardinality: one interaction → many related records (it is a related list; each row is one association). One row references one task OR one knowledge article. PRIMARY by inference from the form/related list; not stated numerically.
- Column element names: Only labels are documented. Community says "'Document Table' and 'ID of related record' are populated on insert through the BR 'Set Document Details'" and that the table "references both the Task and Interaction tables" — https://www.servicenow.com/community/servicenow-ai-platform-forum/how-are-records-inserted-in-the-interaction-related-record-when/td-p/1029754 (2026-09-02). So expect columns approximately `interaction` (ref interaction), `task` (ref task), `knowledge` (ref kb_knowledge), `document_table`, `document_id`, plus a record-type choice. Exact names `[VERIFY]` — check `sys_dictionary` where `name=interaction_related_record` on the target instance.
- Population paths (PRIMARY for VA): "Any cases, incidents, or requests created or updated during the conversation are automatically attached to the interaction record as a Related Task." and designers should call `vaSystem.attachRecordToConversation(String tableName, String sysId)`; caveat: "Records created or updated using the Script Action utility are not captured as related tasks" — va-interactions.html above. Manual path is the "Associate Record" UI action (associate-record.html above).

#### REST create path — CRITICAL

1. Dedicated "Interaction Management API":
   - Exists as a documented API page: the URL https://www.servicenow.com/docs/bundle/yokohama-api-reference/page/integrate/inbound-rest/concept/interaction-management-api.html (and Vancouver/Zurich bundle equivalents) resolves, but the returned body was navigation-only on 2026-09-02 — content not retrievable. developer.servicenow.com print view returned "Content not available." Support KB "Understanding the Interaction Management API" (KB1941272, https://support.servicenow.com/kb?id=kb_article_view&sysparm_article=KB1941272) is JS-rendered; not retrievable.
   - Search snippets of KB1941272 say: POST to `https://instancename.service-now.com/api/now/interaction` "designed to facilitate external integrations for creating and managing interactions". `[VERIFY]` — endpoint path from a search snippet only.
   - The Zurich "REST API reference" index page I retrieved (https://www.servicenow.com/docs/r/zurich/api-reference/rest-apis/api-rest.html, 2026-09-02) listed Knowledge Management API, SCIM API and Table API but the extraction did NOT show an Interaction Management API entry — treat existence/support status in current releases as `[VERIFY]`.
   - SECONDARY field evidence: community thread posting a body with `channel`, `subtype`, `state`, `short_description`, `opened_for`, `assignment_group`, `assigned_to`, `work_notes`; the poster reported "records get created only with channel type" (other fields not populated) even as admin — https://www.servicenow.com/community/servicenow-ai-platform-forum/use-oob-interaction-api-to-create-update-close-interaction/td-p/1115406 (2026-09-02). Treat the dedicated API as unreliable for populating fields until tested on the customer instance.
2. Generic Table API `POST /api/now/table/interaction`:
   - PRIMARY (Table API, Zurich): https://www.servicenow.com/docs/r/zurich/api-reference/rest-apis/c_TableAPI.html (2026-09-02): "The Table API provides endpoints that allow you to perform create, read, update, and delete (CRUD) operations on existing tables." Base path `/api/now/table/`. POST body = "Field name and the associated value for each parameter to define in the specified record." Access: "The calling user must have sufficient roles to access the data in the table specified in the request."
   - Nothing in the Table API docs excludes `interaction`. Whether create ACLs on `interaction` permit a plain integration user is governed by the instance's ACLs; community indicates read ACLs keyed on `itil`/`interaction_agent`/`sn_esm_agent` and on `opened_for`/`assigned_to` (see above). Practical prerequisite: give the integration user `interaction_agent` ("Create and edit interactions", PRIMARY role description). Works-in-practice `[VERIFY]` on a PDI/customer instance.
   - Recommendation for the hub: prefer Table API for `interaction` + `interaction_related_record` (uniform auth/ACL model, testable) and treat the dedicated API as optional.
3. Plugin/licensing prerequisites: plugin `com.glide.interaction` must be active (PRIMARY, above). Licensing: I do not have a verified source for this. The Interaction Management docs pages retrieved do not mention subscription/licensing. Note `interaction_agent` is a role that may be classified as a fulfiller role in Subscription Management `[VERIFY]`.

---

### Q2. `task` base table and inheritance to `incident`, `change_request`, `sc_req_item`

#### Task table role and inheritance model — PRIMARY

- "Task table structure", Washington DC — https://www.servicenow.com/docs/r/washingtondc/application-development/table-administration-and-data-management/task-table-structure.html (2026-09-02): "The Task table is a base class that provides fields for the core ITSM applications such as Incident, Problem, and Change Management." and "All applications that extend the Task table share these fields in common".
- "View table extension model", Yokohama — https://www.servicenow.com/docs/bundle/yokohama-platform-administration/page/administer/platform-performance/task/t_TableHierarchyAndTheExtModel.html (2026-09-02): Table per Hierarchy "Defines a single physical table per logical table hierarchy." Task is the example: one physical table holds Task, Incident, Problem and Change records.
- "Table extension and classes" (docs mirror on GitHub of https://www.servicenow.com/docs/r/platform-administration/table-administration-and-data-management/table-extension-and-classes.html; the mirror at https://github.com/ben-vargas/sn-docs/blob/australia/markdown/platform-administration/table-administration-and-data-management/table-extension-and-classes.md was retrieved 2026-09-02 — SECONDARY copy of a PRIMARY page): child classes "derive fields from parent classes"; "Incident records have a sys_class_name value of incident"; the Task table "contains all records from its child classes such as the Change, Incident, and Problem tables."
- `sc_req_item` extending task: not named on the pages I retrieved. `[VERIFY]` (well known, but no primary quote captured).

#### Task fields documented on "Important Task table fields" — PRIMARY

Source: https://www.servicenow.com/docs/bundle/xanadu-platform-administration/page/administer/task-table/reference/r_ImportantTaskTableFields.html (2026-09-02; the Washington DC URL redirects to the same content in the current "Australia" release).

| Label | Element | Type | Doc description (abridged, quotes < 15 words) |
|---|---|---|---|
| Active | `active` | boolean | whether work is still being done or complete |
| Additional comments | `comments` | journal_input | "Displays and allows the entry of comments about the task record." |
| Approval History | `approval_history` | journal | history of approvals |
| Assigned To | `assigned_to` | reference | "Specifies the user assigned to complete the task." |
| Created | `sys_created_on` | glide_date_time | creation timestamp |
| Description | `description` | string | multi-line description |
| Escalation | `escalation` | integer | how long the task has been open |
| Number | `number` | string | identifying number |
| Opened | `opened_at` | glide_date_time | "when a human opened the task record for the first time" |
| Priority | `priority` | integer | priority for the assignee |
| Short Description | `short_description` | string | short description |
| State | `state` | integer | Pending / Open / Work in Progress / Closed variants |
| Sys ID | `sys_id` | GUID | unique record identifier |
| Task Type | `sys_class_name` | sys_class_name | "the type of task, which corresponds to the child class" |
| Time Worked | `time_worked` | timer | timer while form open |
| Watch list | `watch_list` | glide_list | notification recipients |
| Work notes | `work_notes` | journal_input | "comments viewable only by ITIL users" |
| Work notes list | `work_notes_list` | glide_list | work-notes notification recipients |

- Fields the question asked about that are NOT on that documented list: `impact`, `urgency`, `assignment_group`, `opened_by`, `closed_at`, `closed_by`, `close_notes`, `sys_domain`, `correlation_id`, `correlation_display`, `parent`, `company`, `location`, `approval`. They exist on `task` in practice, but I have no PRIMARY page quoting them. `[VERIFY]` each against `sys_dictionary` (`name=task`).
  - `correlation_id` / `correlation_display`: SECONDARY — ServiceNow Community Enterprise Architecture blog says both live on Task; correlation_id is "a string field with a maximum length of 100 characters" and correlation_display is "human-readable correlation information"; the author cites the ServiceNow "Correlation (Zurich)" docs and a "Case API field definitions" docs page — https://www.servicenow.com/community/enterprise-architecture-blog/servicenow-correlation-id-the-small-field-that-makes/ba-p/3585232 (2026-09-02). `[VERIFY]`
- The companion "Journal fields" page (Xanadu) — https://www.servicenow.com/docs/bundle/xanadu-platform-administration/page/administer/task-table/reference/r_JournalFields.html (2026-09-02) — says: Additional comments: "Any user can update."; Work notes: "ITIL users can update."; "Fields of the journal_input type are multi-line text boxes which, upon save, add the comments into the Activity field".

#### Incident-specific fields

- Incident is a Task child (PRIMARY, task-table-structure.html above).
- `category` / `subcategory` (PRIMARY, labels and default choices): "Incident categories and subcategories", Zurich — https://www.servicenow.com/docs/r/zurich/it-service-management/incident-management/r_CategorizingIncidents.html (2026-09-02). Default categories Inquiry / Help, Software, Hardware, Network, Database with subcategories. Element names not printed on page `[VERIFY]` (they are `category`, `subcategory` by long-standing convention).
- Incident states (PRIMARY, labels): "Incident Management state model", Zurich — https://www.servicenow.com/docs/r/zurich/it-service-management/incident-management/c_IncidentManagementStateModel.html (2026-09-02): New, In Progress, On Hold, Resolved, Closed, Canceled; On Hold reasons Awaiting Caller/Change/Problem/Vendor; with Awaiting Caller "the Additional comments becomes mandatory." The page uses the label "State"; the element `incident_state` (and its relationship to `state`) is not printed `[VERIFY]`.
- `caller_id`, `close_code`, `close_notes`: SECONDARY only (community threads, glama MCP tool descriptions). "Incident resolution and closure", Zurich — https://www.servicenow.com/docs/bundle/zurich-it-service-management/page/product/incident-management/concept/c_IncidentResolutionAndRecovery.html (2026-09-02) — discusses resolution code/notes conceptually but the retrieved excerpt did not print element names. `[VERIFY]`
- Data-model diagram page exists but is an image: https://www.servicenow.com/docs/bundle/zurich-it-service-management/page/product/incident-management/reference/incident-mangmt-data-model.html (2026-09-02).

---

### Q3. `opened_by` vs `caller_id`; `correlation_id` / `correlation_display`

- `caller_id` = affected/reporting user; `opened_by` = user who created the record. PRIMARY confirmation NOT found (the retrieved task-field page does not list `opened_by`). SECONDARY: community — when an agent files on behalf of someone, "the caller is the actual user affected" and `opened_by` "is the user who is actually creating the incident" — https://www.servicenow.com/community/developer-forum/what-does-caller-field-means-in-incident-form/m-p/2081758 (search snippet, 2026-09-02). `[VERIFY]`
- `opened_by` defaults to the session user (i.e. the integration account when created via REST): I do not have a verified source for this. `[VERIFY]` — behaviourally consistent with the community threads about record producers overriding Caller with the logged-in user (https://www.servicenow.com/community/developer-forum/caller-field-on-record-producer-for-incident-being-overriden-by/m-p/2125677, 2026-09-02).
- Design implication (independent of the verification): the hub must set `caller_id` explicitly to the end user's `sys_user.sys_id`; `opened_by` will be the integration account. Do not use `opened_by` for "who is affected".
- `correlation_id` / `correlation_display` as the documented external-correlation fields: SECONDARY only (community EA blog above, and ServiceNow Guru https://servicenowguru.com/integration/correlation-id-display-fields/, 2026-09-02, which describes `correlation_id` as the "unique identifier in the other system" and `correlation_display` as a source label). `[VERIFY]` against the Zurich "Correlation" docs the blog cites (URL not captured).

---

### Q4. Work notes vs customer-visible comments — load-bearing

#### Field names and semantics — PRIMARY

- `comments` (label "Additional comments", type `journal_input`) and `work_notes` (label "Work notes", type `journal_input`) — "Important Task table fields" (Xanadu) above. `work_notes`: "comments viewable only by ITIL users". `comments`: "Any user can update." (r_JournalFields.html above).
- Journal field types (PRIMARY): "Journal field type", Washington DC — https://www.servicenow.com/docs/r/washingtondc/platform-administration/c_JournalFields.html (2026-09-02): `journal` ("display the combined inputs below the input box"), `journal_input` ("do not display the combined inputs"), `journal_list` ("merely display the contents of other Journal fields"). Journal values are read in script via `getJournalEntry()`.
- Portal/ESC visibility (SECONDARY): community — callers without a role do not see work notes; end users can only write Additional comments in the standard ticket page — https://www.servicenow.com/community/employee-center-forum/employee-center-comments-updating-work-notes-and-not-additional/m-p/3071398 and https://www.servicenow.com/community/developer-forum/how-to-make-additional-comments-and-work-notes-under-note-tab/m-p/1993028 (2026-09-02). `[VERIFY]` that the OOB `itil` ACL on `task.work_notes` is intact on the customer instance.

#### Storage: `sys_journal_field` — PRIMARY

- "Retrieve journal entries using direct web services", Xanadu — https://www.servicenow.com/docs/bundle/xanadu-api-reference/page/integrate/inbound-soap/concept/retrieving-journal-entries.html (2026-09-02): "make a second soap request against the sys_journal_field table"; "specify the value comments for the element field"; `element_id` receives the record's sys_id. (SOAP page, but the table and column semantics are the same for the Table API.)
- Journal field type page (Washington DC) confirms journal fields "create entries in the Journal Entries [sys_journal_field] table" (search snippet of the same page, 2026-09-02).
- Columns used in practice: `name` (table, e.g. `incident`), `element` (`comments` | `work_notes` | `approval_history`), `element_id` (record sys_id), `value`, `sys_created_on`, `sys_created_by`. `name`/`value` columns are SECONDARY-confirmed (community + Tim Dietrich blog) `[VERIFY]`.

#### What the Table API returns for journal fields

- No PRIMARY statement found in the Table API doc (c_TableAPI.html, Zurich) about journal fields; `sysparm_display_value` is defined only as "Returns the display values for all fields" (`true`) / "actual values from the database" (`false`) / both (`all`).
- SECONDARY, consistent picture:
  - ServiceNow employee (Michael Ritchie): "the actual values are not stored in the task table." and "You won't be able to access them via the incident table API." — https://www.servicenow.com/community/developer-forum/get-incident-work-notes-from-api/m-p/1711812 (2026-09-02).
  - Community (jsamm): the comments field "always returns an empty string" with default settings; with `sysparm_display_value=true` it outputs all comments in one string — https://www.servicenow.com/community/developer-forum/how-to-retrieve-comments-for-an-incident-via-the-rest-api/m-p/1913931 (2026-09-02).
  - Tim Dietrich blog shows a GET on `incident` returning `comments` and `work_notes` as concatenated, double-CR-delimited history strings (i.e., with display values on) and the canonical history query `GET /api/now/table/sys_journal_field?element_id=<sys_id>&element=comments&sysparm_query=ORDERBYDESCsys_created_on` — https://timdietrich.me/blog/servicenow-table-api-comments-work-notes/ (2026-09-02).
  - Net: with `sysparm_display_value=false` journal fields come back `""`; with `true`/`all` they come back as a formatted string that may contain the entire history, not just the latest entry. `[VERIFY]` on target release — the exact rendering (latest-only vs full) is not documented.

#### Structural safety design (recommendation grounded in the above)

1. Never read journal values off `incident`/`task` GETs at all. Always request `sysparm_fields=` with an explicit allow-list that excludes `work_notes`, `comments_and_work_notes`, `work_notes_list`, `approval_history`, and use `sysparm_display_value=false` so any journal field accidentally included is `""`.
2. Read customer-visible updates only via `GET /api/now/table/sys_journal_field?sysparm_query=name=incident^element=comments^element_id=<sys_id>^ORDERBYsys_created_on` (PRIMARY basis: retrieving-journal-entries.html). Hard-code `element=comments`; reject any adapter configuration that can change `element`.
3. Defence in depth on the ServiceNow side: give the integration user a role that has read on `sys_journal_field` but ensure it lacks `itil`, so `work_notes` are ACL-denied for that user regardless of hub bugs (PRIMARY: "comments viewable only by ITIL users"). `[VERIFY]` that the customer's `sys_journal_field` ACLs actually filter by element for non-ITIL users — many instances rely on a query business rule; test with a non-ITIL account.
4. Write side: post customer-facing text to `comments`; post hub telemetry to `work_notes` (PATCH body `{"work_notes": "..."}` / `{"comments": "..."}`, PRIMARY: Table API PATCH body = "Field name and the new value for each parameter to update").

---

### Q5. Knowledge base entitlement (User Criteria) and the Knowledge Management REST API

#### User Criteria on knowledge bases — PRIMARY

- "Control access at the knowledge base level through user criteria", Yokohama — https://www.servicenow.com/docs/bundle/yokohama-servicenow-platform/page/product/knowledge-management/task/t_SelectUserCriteria.html (2026-09-02). Knowledge base fields: Can Read ("Users can read knowledge articles in the knowledge base."), Cannot Read, Can Contribute ("Contribute access to a knowledge base also provides read access"), Cannot Contribute. Roles to manage: "knowledge_manager, knowledge_admin, or admin". A sibling task exists: "Control access at the knowledge article level through user criteria" (article-level criteria confirmed to exist).
- Precedence: "Users who meet both Can Read and Cannot Read criteria are denied read access" — SECONDARY (Now Support KB0997177 title/snippet, https://support.servicenow.com/kb?id=kb_article_view&sysparm_article=KB0997177, 2026-09-02). `[VERIFY]`
- M2M table names `kb_uc_can_read_mtom` / `kb_uc_cannot_read_mtom`: SECONDARY only (community + Microsoft connector docs). `[VERIFY]`
- User criteria record fields (Users, Groups, Roles, Companies, Departments, Locations, Match All, Advanced, Script): SECONDARY — ServiceNow SDK guide https://servicenow.github.io/sdk/guides/user-criteria-guide (2026-09-02): script is "A script to define any additional criteria, and return true or false" and is "available only if Advanced is selected"; scripted criteria "evaluate on every access check with no caching"; the script uses the `user_id` variable. The PRIMARY "User criteria form" page was referenced by https://www.servicenow.com/docs/bundle/xanadu-employee-service-management/page/product/wsd-reservation-management/task/create-user-criteria.html (2026-09-02) but its content was not retrievable. `[VERIFY]`

#### Can the hub evaluate entitlement offline?

- Partially at best. The declarative parts (users/groups/roles/companies/departments/locations, match_all, can/cannot read at KB and article level) are data and could be exported and re-evaluated. The `Advanced`/`script` criterion is arbitrary server-side JavaScript with access to the platform (`user_id`, GlideRecord) and cannot be evaluated outside the instance.
- Independent SECONDARY confirmation of exactly this limitation: Microsoft's ServiceNow Knowledge connector documents a "Simple" flow that "can't evaluate the script" and therefore treats scripted deny criteria as deny-all, and an "Advanced" flow that defers to ServiceNow — https://learn.microsoft.com/en-us/microsoftsearch/servicenow-knowledge-connector (2026-09-02).
- Recommendation: either (a) proxy each retrieval per-user through the customer instance so ServiceNow evaluates criteria, or (b) index offline but at query time re-check each candidate article for the specific user via the instance (e.g. Knowledge API GET by id as that user, or a scripted endpoint calling the KB access API), and fail closed for any KB/article whose criteria include `advanced=true`.

#### Knowledge Management REST API — PRIMARY

- "Knowledge Management REST API", Zurich — https://www.servicenow.com/docs/r/zurich/api-reference/rest-apis/knowledge-api.html and Yokohama https://www.servicenow.com/docs/r/yokohama/api-reference/rest-apis/knowledge-api.html (2026-09-02).
  - Plugin: "You can only use this API when the Knowledge API (sn_km_api) plugin is activated."
  - Endpoints (all GET): `/api/sn_km_api/knowledge/articles` (params `query`, `filter`, `fields`, `kb`, `language`, `limit` default 30, `offset`); `/api/sn_km_api/knowledge/articles/{id}` (sys_id or KB number; returns "Entire HTML content of the article" in `content`, plus `fields`, `number`, `short_description`, `sys_id`, `display_attachments`, attachments, embedded_content, language(s), template, template_table); `/api/sn_km_api/knowledge/articles/featured`; `/api/sn_km_api/knowledge/articles/most_viewed`; `/api/sn_km_api/knowledge/articles/{article_sys_id}/attachments/{attachment_sys_id}`.
  - Access: "The Knowledge Management REST API is publicly accessible and makes any knowledge base that is publicly accessible available to all users, including unauthenticated users." From v1.0.1 admins can set the "Requires Authentication" flag per endpoint. Rate limit "500 per hour for unauthenticated and snc_external users". Scoped KBs: "allow the sn_km_api scope read access from the requesting scope."
  - Does it evaluate user criteria for the caller? The doc text I retrieved does not state it in those words. SECONDARY: community — "The API will only return articles the user can read." — https://www.servicenow.com/community/developer-forum/knowledge-management-rest-api/td-p/3443260 (2026-09-02). `[VERIFY]` (it is consistent with the "publicly accessible knowledge base" wording, which implies the KB's read criteria are applied to the caller).
- Consequence: per-user proxying is possible with this API by authenticating as (or on behalf of) the end user; the hub's own service account would only ever see what that account can read.

#### Licensing: requester vs fulfiller for KB reads

- I do not have a verified PRIMARY source for this. No `servicenow.com/docs` page defining Requester/Fulfiller was retrievable. SECONDARY (ServiceNow Community, quoting ServiceNow subscription definitions): "Requesters do not need subscription."; requesters "can also access the ServiceNow Knowledge Base to perform self-service"; a Fulfiller "performs any function in addition to Business Stakeholder User function or Requester User function" — https://www.servicenow.com/community/developer-forum/what-is-the-link-between-approver-fulfiller-licenses-and-types/m-p/1571998 and https://www.servicenow.com/community/developer-forum/fulfillers-licensed-users/m-p/2186233 (2026-09-02). `[VERIFY]` against the customer's order form / Subscription Management definitions. Working assumption: an end user with no fulfiller role reading KB via the Knowledge API is a Requester and does not consume a fulfiller subscription; the hub's integration account will almost certainly hold fulfiller-class roles (`itil`, `interaction_agent`, etc.) and count as one fulfiller.

---

### Q6. Restricted ticket classes (HR, SecOps, Legal, GRC)

- Table-per-hierarchy consequence (PRIMARY, Q2 sources): any class extending `task` is physically stored in the Task table and is returned by a query against `task` unless filtered by `sys_class_name`. So a hub query `GET /api/now/table/task?...` WILL return HR cases, security incidents, GRC issues etc. if (a) they extend `task` and (b) the integration user's ACLs allow reading them. Filter `sys_class_name=incident` (or `sys_class_nameIN incident,sc_req_item`) and query the child table directly instead of `task`.

#### HR — `sn_hr_core_case`
- PRIMARY existence and scope: "Components installed with Case and Knowledge Management", Zurich Employee Service Management — https://www.servicenow.com/docs/bundle/zurich-employee-service-management/page/product/human-resources/reference/components-installed-with-case-and-knowledge-management.html (2026-09-02). Plugin `com.sn_hr_core`; tables HR Case `[sn_hr_core_case]`, HR Task `[sn_hr_core_task]`, and COE children (`sn_hr_core_case_benefits`, `_compensation`, `_relations`, `_ethics`, `_global_mobility`, `_payroll`, `_talent_management`) which extend the HR case table. It is a separate scoped application (its own `sn_hr_core.*` roles).
- Extends `task` (not `incident`): SECONDARY — "HR case extends from Task Table itself." (Community Alums) https://www.servicenow.com/community/hrsd-forum/we-are-having-task-table-to-which-hr-case-table-extends-and-all/td-p/2462367; "an extension of the Task table, but it is in its own application scope" (Justin W) https://www.servicenow.com/community/developer-forum/hrsd-reporting-best-practice/td-p/2594569 (both 2026-09-02). `[VERIFY]`

#### Security Incident Response — `sn_si_incident`
- PRIMARY existence: "Components installed with Security Incident Response" — https://www.servicenow.com/docs/r/security-management/security-incident-response/installed-with-sir.html (2026-09-02): Security Incident `[sn_si_incident]` "Stores a security incident, the responses to the incident, all linked tasks..."; Security Incident Response Task `[sn_si_task]`; plus templates, enrichment and m2m tables (e.g. `sn_si_m2m_task_affected_user`). Separate scoped app (`sn_si`).
- Extends `task`, not `incident`: the components page does not state the parent. Community says "There is no direct relationship between these tables in ServiceNow by default." (Anand Kumar P) — https://www.servicenow.com/community/developer-forum/is-the-security-incident-response-table-related-to-the-general/m-p/2706824 (2026-09-02). Parent = `task` `[VERIFY]`.

#### Legal Service Delivery
- PRIMARY: "Components installed with Legal Request Management", Xanadu — https://www.servicenow.com/docs/bundle/xanadu-employee-service-management/page/product/legal-request-management/reference/installed-with-legal-request-management.html (2026-09-02). Scope `sn_lg_ops`. The request table is Legal Request `[sn_lg_ops_request]` — "Stores legal requests submitted by a user." Other tables: `sn_lg_ops_practice_area`, `sn_lg_ops_category`, `sn_lg_ops_subcategory` (extend `sys_metadata`), `sn_lg_ops_legal_profile`, `sn_lg_ops_legal_disposition`, `sn_lg_ops_milestone_schedule_span`, integration tables.
- The name `sn_legal_request` used in the hub design does NOT appear in the docs; correct name is `sn_lg_ops_request` (Legal Matter Management uses `sn_lg_ops_legal_matter` per community). Whether `sn_lg_ops_request` extends `task`: not stated on the page `[VERIFY]`.

#### GRC / IRM
- PRIMARY: "Components installed with Policy and Compliance Management", Xanadu — https://www.servicenow.com/docs/bundle/xanadu-governance-risk-compliance/page/product/grc-policy-and-compliance/reference/r_InstallWPolAndCompl.html (2026-09-02): Policy `[sn_compliance_policy]` "Extends the Document [sn_grc_document] table"; Control `[sn_compliance_control]` "Extends the Item [sn_grc_item] table"; Policy Exception `[sn_compliance_policy_exception]`; Authority Document; Control Objective `[sn_compliance_policy_statement]`; Citation. Separate scoped apps (`sn_grc`, `sn_compliance`, `sn_risk`, `sn_audit`).
- Issue `[sn_grc_issue]` extends `task` (via planned_task per one thread): SECONDARY only — https://www.servicenow.com/community/grc-forum/irm-issue-management/m-p/3477122 and https://www.servicenow.com/community/grc-forum/which-grc-task-table-can-be-extend-to-fulfill-task-requirement/m-p/2466602 (2026-09-02). `[VERIFY]`. "Tables installed with GRC" (https://www.servicenow.com/docs/r/governance-risk-compliance/grc-common-functions/tables-installed-with-grc.html, 2026-09-02) was retrievable but the excerpt did not include the Issue table's parent.

#### Net for the hub
- None of these are children of `incident`. HR case, security incident, GRC issue (and probably legal request) are `task` children in their own scopes. A `task`-level query or a `sys_journal_field` query without `name=incident` can leak HR/SecOps/Legal/GRC content to the avatar unless (a) filtered by `sys_class_name`/`name` and (b) the integration account is denied the `sn_hr_core.*`, `sn_si.*`, `sn_lg_ops.*`, `sn_grc.*` roles.

---

### Q7. SCIM 2.0

#### RFC 7643 attribute paths — PRIMARY

Source: https://www.rfc-editor.org/rfc/rfc7643 (2026-09-02).

- Core schema URN (s.4.1): `urn:ietf:params:scim:schemas:core:2.0:User`.
- `userName` (s.4.1.1): "A service provider's unique identifier for the user" — REQUIRED.
- `name.givenName`, `name.familyName` (s.4.1.1, complex `name`; also `formatted`, `middleName`, honorifics).
- `displayName` (s.4.1.1): "The name of the user, suitable for display to end-users."
- `emails` (s.4.1.2, multi-valued): sub-attributes `value`, `display`, `type` (canonical "work", "home", "other"), `primary`. Filter path for the work address: `emails[type eq "work"].value` (value-path filter syntax is defined in RFC 7644 s.3.4.2.2; RFC 7643 s.4.1.2 defines the sub-attributes).
- `active` (s.4.1.1): "A Boolean value indicating the user's administrative status."
- `externalId` (s.3.1, common attribute): "an identifier for the resource as defined by the provisioning client."
- `groups` (s.4.1.2, multi-valued, read-only): sub-attributes `value` (group id), `$ref`, `display`, `type` ("direct" | "indirect"). Path: `groups[].value` (i.e. `groups.value`).
- Enterprise extension URN (s.4.3): `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User`, addressed as a JSON container keyed by the URN, i.e. `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:employeeNumber`, `...:costCenter`, `...:organization`, `...:division`, `...:department`, `...:manager.value` (with `manager.$ref`, `manager.displayName`). Definitions: employeeNumber "A string identifier, typically numeric or alphanumeric"; costCenter "Identifies the name of a cost center"; organization/division/department "Identifies the name of..."; manager is complex (`value` = manager's id).

#### ServiceNow as SCIM server (service provider) — PRIMARY

- "SCIM API", Zurich — https://www.servicenow.com/docs/r/zurich/api-reference/rest-apis/scim-api.html (2026-09-02): endpoints `/api/now/scim/Users`, `/api/now/scim/Groups`, `/api/now/scim/Companies`, `/api/now/scim/CostCenters`, `/api/now/scim/Departments`, `/api/now/scim/Locations`; methods GET (single/multiple), POST, PUT, PATCH, DELETE. Plugin: "SCIM v2 - ServiceNow® Cross-domain Identity Management (com.snc.integration.scim2)". Role: "The scim_admin role is required to access the SCIM-specific tables and the private SCIM endpoints". Schemas: `urn:ietf:params:scim:schemas:core:2.0:User`, `urn:ietf:params:scim:schemas:extension:servicenow:2.0:User`, `urn:ietf:params:scim:schemas:core:2.0:Group`, `urn:ietf:params:scim:schemas:extension:servicenow:2.0:Group`. Whether the IETF enterprise extension URN is also served is not shown in the retrieved excerpt `[VERIFY]` (ServiceNow exposes its own `servicenow:2.0:User` extension; expect department/manager/cost center to be there or under the enterprise URN — check `/api/now/scim/Schemas`).
- "SCIM" concept, Xanadu — https://www.servicenow.com/docs/r/xanadu/platform-security/identity/scim.html (2026-09-02): "The Service Provider provisions users and groups using the SCIM API" and "synchronizes the changes made to identities in the IdP." Also: "The SCIM Client facilitates provisioning and updates on identity resources through CRUD operations exposed by SCIM endpoint on an external system."
- "Explore SCIM provider", Xanadu — https://www.servicenow.com/docs/bundle/xanadu-platform-security/page/integrate/authentication/concept/explore-scim-provider.html (2026-09-02): "The SCIM provider synchronizes the changes made to identities in the IdP, including creating, updating, or deleting records."; requires OAuth 2.0, REST API Provider and REST API Access Policy plugins.
- Entra tutorial, Yokohama — https://www.servicenow.com/docs/bundle/yokohama-platform-security/page/integrate/authentication/task/configure-scim-for-user-provisioning-with-azure-ad.html (2026-09-02): "Configuring SCIM automatically provisions and de-provisions users and groups to ServiceNow by using the providers provisioning service"; warning: "The scim_admin role is equivalent to giving the user the admin role".
- SCIM Client (outbound from ServiceNow) — https://www.servicenow.com/docs/bundle/xanadu-platform-security/page/integrate/authentication/concept/scim-client-app.html (2026-09-02): plugin "SCIM v2 - ServiceNow Cross-domain Identity Management Client (com.snc.integration.scim2.client)".

#### Answer to the design question

- ServiceNow IS a SCIM service provider: the hub could pull users with `GET /api/now/scim/Users` — but only with `scim_admin` (documented as admin-equivalent), which is a poor security posture for an external hub.
- ServiceNow's SCIM role is to *receive* pushes from the IdP (Entra/Okta), not to push to third parties (the SCIM Client exists but is a separate app for ServiceNow-initiated provisioning to external systems).
- Recommended: the hub implements a SCIM 2.0 *service provider* itself and the customer's IdP (Entra/Okta) pushes to both ServiceNow and the hub; correlate users on `externalId` (IdP object id) and/or `userName`/work email, not on ServiceNow `sys_id`. Use ServiceNow Table API `sys_user` lookups (by `email`/`user_name`) only to resolve `caller_id` at ticket time.

---

### Unverified / could not find

Items marked `[VERIFY]` above, consolidated:

1. `interaction` does not extend `task` — community only (two threads); no docs statement. Check `sys_db_object.super_class` for `interaction`.
2. `interaction` element names `opened_for`, `assigned_to`, `type`/`channel`, `context_table`, `context_document`, `channel_metadata_table`, `channel_metadata_document`, state integer values — labels documented, elements not.
3. `interaction_related_record` column names (`interaction`, `task`, `knowledge`, `document_table`, `document_id`, record-type field) — form labels documented; elements not.
4. Interaction Management API: endpoint `POST /api/now/interaction` is from a search snippet of KB1941272; the docs page exists by URL but its content did not render; its absence from the Zurich REST index extraction is unexplained; community reports it ignores most body fields. Whether `POST /api/now/table/interaction` succeeds for an `interaction_agent` user — untested.
5. Licensing/subscription implications of `com.glide.interaction` and `interaction_agent` — I do not have a verified source for this.
6. Task fields not on the documented "Important Task table fields" page: `impact`, `urgency`, `assignment_group`, `opened_by`, `closed_at`, `closed_by`, `close_notes`, `sys_domain`, `correlation_id`, `correlation_display`, `parent`, `company`, `location`, `approval`.
7. `sc_req_item` / `change_request` extend `task` — only Incident/Problem/Change named on retrieved pages.
8. Incident elements `caller_id`, `category`, `subcategory`, `incident_state`, `close_code`, `close_notes` — labels/choices documented, elements only from community.
9. `opened_by` defaults to the session/integration user — I do not have a verified source for this.
10. `correlation_id` (string, 100) / `correlation_display` as the documented correlation fields — community blog citing docs; docs page not retrieved.
11. Exact Table API rendering of journal fields with `sysparm_display_value=true` (latest-only vs full history) — community/blog only; behaviour to test per release.
12. `sys_journal_field` columns `name`, `value` — community/blog only (`element`, `element_id` are documented).
13. Portal/ESC visibility of `work_notes` (hidden from role-less callers) — community only.
14. Knowledge API evaluates the caller's user criteria ("only return articles the user can read") — community only.
15. Knowledge M2M tables `kb_uc_can_read_mtom` etc., user-criteria field list and `advanced`/`script` semantics, "Cannot Read wins" precedence — SDK guide / Support KB snippets / Microsoft docs, not `servicenow.com/docs` text.
16. Requester vs Fulfiller definitions and "requesters do not need subscription" — community only; no `servicenow.com/docs` licensing page retrievable.
17. `sn_hr_core_case`, `sn_si_incident`, `sn_grc_issue`, `sn_lg_ops_request` extend `task` — community only (HR strongest, two threads; SIR and Legal parent not stated anywhere retrieved).
18. ServiceNow SCIM API support for the IETF enterprise extension URN (vs its own `servicenow:2.0:User` extension).

Where `docs.servicenow.com` was not retrievable: every `docs.servicenow.com` URL redirected; of the redirected `www.servicenow.com/docs` targets, the following returned navigation-only shells on 2026-09-02 — Interaction Management API (Yokohama, Vancouver, Zurich bundles), `r_JournalFields.html` (Washington DC `/r/` path; the Xanadu bundle path did work), `tables-installed-with-grc.html` (Vancouver bundle; the `/r/` path did work), `r_CategorizingIncidents.html` and `c_IncidentManagementStateModel.html` (bundle paths; `/r/zurich/` paths did work), SCIM client properties (Vancouver), Components installed with SIR (Vancouver bundle; `/r/` path did work). `support.servicenow.com` KB articles (KB1941272, KB0860915, KB0997177, KB0623654, KB1617099) and `developer.servicenow.com` returned no content.

---

## Part A / A3 — Anthropic API: pricing, rate limits, data handling, availability, fleet-proxy controls

Research date: 2026-09-02. All URLs below were retrieved on 2026-09-02 unless stated. Primary = platform.claude.com docs, anthropic.com legal, privacy.claude.com / support.claude.com help centre. Anything not confirmed from a retrieved primary page is tagged `[VERIFY]`.

Context assumed: seed-stage company, no enterprise contract, self-serve Claude Console org. Hub proxies a 5,000-endpoint fleet; routine turns on `claude-haiku-4-5`, escalations on `claude-sonnet-5`; 3–6k input / <300 output tokens per turn; incident-storm peak 100–250 concurrent sessions at one request per 10–20 s.

---

### Q1. Per-token pricing (live page vs. skill cache)

Source (primary): https://platform.claude.com/docs/en/about-claude/pricing (fetched as `.md`, 2026-09-02). Note: the URL in the skill's `live-sources.md` (`/docs/en/pricing.md`) now returns 404; the page has moved to `/docs/en/about-claude/pricing`. The page carries no explicit "last updated" date. It contains a dated note: Sonnet 5's $2/$10 "introductory pricing through August 31, 2026, is now the standard price" and the scheduled increase to $3/$15 on 2026-09-01 "will not occur".

| Model | Base input | 5m cache write | 1h cache write | Cache read | Output | Batch input | Batch output |
|---|---|---|---|---|---|---|---|
| Claude Haiku 4.5 (`claude-haiku-4-5`) | $1 / MTok | $1.25 | $2 | $0.10 | $5 / MTok | $0.50 | $2.50 |
| Claude Sonnet 5 (`claude-sonnet-5`) | $2 / MTok | $2.50 | $4 | $0.20 | $10 / MTok | $1 | $5 |
| Claude Opus 5 (`claude-opus-5`) — reference | $5 / MTok | $6.25 | $10 | $0.50 | $25 / MTok | $2.50 | $12.50 |
| Claude Fable 5.1 (`claude-fable-5-1`) — reference | $10 / MTok | $12.50 | $20 | $0.25 (0.025x) | $50 / MTok | $5 | $25 |

Multipliers stated on the page: 5-minute cache write 1.25x base input; 1-hour cache write 2x; cache read 0.1x (0.025x on Fable 5.1 / Mythos 5.1); Batch API 50% off input and output; multipliers "stack with other pricing modifiers, including the Batch API discount and data residency". Long context: 4.6+ models bill the full 1M window at standard per-token rates (no >200K surcharge). US-only inference (`inference_geo: "us"`) = 1.1x on all token categories for 4.6-and-later models (Haiku 4.5 is excluded — see Q3c).

Tool-use overhead (same page): the tool-use system prompt adds 496 tokens (`auto`/`none`) on Haiku 4.5 and 354 tokens on Sonnet 5 per request, on top of the tool definitions themselves. Relevant because every fleet turn carries a tool catalog.

Comparison with the skill's cached table (dated 2026-06-24): every base input/output price matches (Haiku 4.5 $1/$5, Sonnet 5 $2/$10, Opus 5 $5/$25, Fable 5.1 $10/$50). One material change in the surrounding text: the Sonnet 5 price is no longer "introductory" — the 2026-09-01 increase was cancelled, so planning can treat $2/$10 as standing. No other differences found.

Per-turn unit costs derived from the table (arithmetic, not a quoted figure): Haiku 4.5 turn at 4,500 in / 300 out, uncached = 4,500 × $1/1M + 300 × $5/1M = $0.0045 + $0.0015 = **$0.0060**. Sonnet 5 same shape = $0.009 + $0.003 = **$0.012**.

---

### Q2. Rate limits, tiers, and whether the planning load fits

Source (primary): https://platform.claude.com/docs/en/api/rate-limits (fetched as `.md`, 2026-09-02). Secondary corroboration for the tier reorganisation date: https://knightli.com/en/2026/06/29/claude-api-rate-limits-rpm-itpm-otpm-429/ (search snippet only; states tiers were consolidated on 2026-06-26) and https://support.claude.com/en/articles/8243635-our-approach-to-rate-limits-for-the-claude-api (help centre, "Last updated June 26, 2026").

#### 2a. Tier structure — the "Tier 1–4" model in the question is stale

The live docs no longer describe Tier 1–4 with deposit thresholds. The current structure is **Start, Build, Scale, Custom**, plus an unpublished **Evaluation** tier for new orgs:

- "Organizations are placed on a tier automatically based on usage history and account standing and can move to a higher tier over time as they use the API."
- "New organizations and organizations with limited usage history may start in the Evaluation tier, with limits below the standard limits shown on this page while account history is established... they increase automatically as your organization builds usage history."
- To go beyond published limits: "Request rate limit increase" on Console > Settings > Rate limits; the help-centre article adds you can request "once you're using at least 50% of your current limits".
- Custom tier: "contact sales through the Rate limits page".

Deposit thresholds and wait times: **I do not have a verified source for this.** No current primary page publishes credit-purchase thresholds ($5/$40/$200/$400) or 7/14-day waits; a secondary source dated 2026-01-09 (https://www.aifreeapi.com/en/posts/claude-api-quota-tiers-limits) described that older Tier 1–4 mechanism, but it pre-dates the June 2026 consolidation. `[VERIFY]` — treat the deposit-based ladder as obsolete unless Anthropic support confirms otherwise.

#### 2b. Monthly spend caps per tier (primary, same page)

| Tier | Monthly spend cap |
|---|---|
| Start | $500 |
| Build | $1,000 |
| Scale | $200,000 |
| Custom | none ("arranged with their account team") |

At the cap: "API usage pauses until 00:00 UTC on the first day of the next month" with HTTP 429 `rate_limit_error`, `error_code: enforced_spend_limit_reached`, **no `retry-after` header** — SDK auto-retries will keep failing. Self-set lower limits return HTTP 400 `invalid_request_error`.

#### 2c. Per-model limits for Haiku 4.5 and Sonnet 5 (primary, same page)

Both models have identical standard limits at each tier; each model has its own separate bucket ("Rate limits are applied separately for each model"; Sonnet 5 "has a separate rate limit and is not part of" the Sonnet 4.x bucket). Limits are shared across `inference_geo` values.

| Tier | RPM | ITPM (uncached input) | OTPM |
|---|---|---|---|
| Start | 1,000 | 2,000,000 | 400,000 |
| Build | 5,000 | 5,000,000 | 1,000,000 |
| Scale | 10,000 | 10,000,000 | 2,000,000 |
| Custom | negotiated | negotiated | negotiated |

Opus 5 (reference): same numbers as Sonnet 5 at every tier. Fable 5.x: 1,000 / 500,000 / 100,000 (Start), 2,000 / 1.5M / 300K (Build), 4,000 / 4M / 800K (Scale).

Enforcement detail: token-bucket; "a rate of 60 requests per minute (RPM) might be enforced as 1 request per second. Short bursts of requests can exceed the limit and trigger rate limit errors." Separate "acceleration limits" can 429 an org whose usage spikes sharply — "ramp up your traffic gradually".

#### 2d. Cache-aware ITPM — does cache-read count?

Primary (same page, "Cache-aware ITPM"): "For most Claude models, only uncached input tokens count toward your ITPM rate limits." Counted: `input_tokens` and `cache_creation_input_tokens`. Not counted: `cache_read_input_tokens` — the only exception listed is **Claude Haiku 3.5** (footnote 4). So for **Haiku 4.5 and Sonnet 5, cache reads do not count toward ITPM.** OTPM counts actual generated tokens only; `max_tokens` does not factor in.

Critical caveat from https://platform.claude.com/docs/en/build-with-claude/prompt-caching (primary, 2026-09-02): the **minimum cacheable prefix on Claude Haiku 4.5 is 4,096 tokens** (Sonnet 5: 1,024; Opus 5 / Fable 5.1: 512). Shorter prefixes "cannot be cached even if marked with `cache_control`. No error is returned". With a 3–6k total turn, the stable prefix (system prompt + tool catalog) on Haiku 4.5 must itself be at least 4,096 tokens or caching silently does nothing and the full input counts toward ITPM. Caches are isolated per workspace on the Claude API.

#### 2e. Arithmetic — does the planning load fit?

Request rate (1 request per 15 s = 4 req/min per session):
- 100 sessions × 4 = **400 RPM**; 250 × 4 = **1,000 RPM**.
- Bounds at 10 s / 20 s cadence: 250 × 6 = 1,500 RPM (worst); 100 × 3 = 300 RPM (best).

Uncached ITPM at ~4,500 input tokens/turn:
- 400 × 4,500 = **1.8M ITPM**; 1,000 × 4,500 = **4.5M ITPM**; worst case 1,500 × 6,000 = 9.0M ITPM.

OTPM at 300 output tokens/turn:
- 400 × 300 = 120K; 1,000 × 300 = 300K; worst 1,500 × 300 = 450K.

Fit against tiers (single model bucket — assume the storm is mostly Haiku 4.5; Sonnet 5 escalations draw from a separate, equal-sized bucket):

| Scenario | Start (1,000 / 2M / 400K) | Build (5,000 / 5M / 1M) | Scale (10,000 / 10M / 2M) |
|---|---|---|---|
| 400 RPM, 1.8M ITPM, 120K OTPM | RPM ok (40%), ITPM ok (90%), OTPM ok | fits | fits |
| 1,000 RPM, 4.5M ITPM, 300K OTPM | **RPM at 100% of cap — bursts will 429; ITPM 225% — fails** | RPM 20%, ITPM 90%, OTPM 30% — fits with little headroom | fits |
| 1,500 RPM, 9.0M ITPM, 450K OTPM | fails | **ITPM 180% — fails**; OTPM ok | RPM 15%, ITPM 90% — fits |

With caching working (Haiku prefix ≥ 4,096 tokens; assume ~3,500 of 4,500 input tokens are cache reads, ~1,000 uncached):
- 1,000 RPM × 1,000 = 1.0M ITPM → fits Start ITPM (50%), but Start RPM is still at 100%; Build/Scale fit comfortably.
- 1,500 RPM × 1,000 = 1.5M ITPM → fits Build (30%) and Scale.
Caching removes the ITPM problem on Build and above but does nothing for RPM, so **Build tier is the minimum that supports the stated peak without an enterprise agreement, and only with caching actually hitting**; Scale is needed for the 1,500-RPM / uncached worst case.

The binding constraint is the **monthly spend cap**, not RPM/ITPM. Cost per Haiku turn ≈ $0.006 uncached (Q1). One hour of a 1,000-RPM storm = 60,000 turns ≈ **$360/hour uncached** (≈ $180/hour if ~3,500 tokens/turn are cache reads at $0.10/MTok: 60,000 × (1,000 × $1 + 3,500 × $0.10 + 300 × $5)/1M ≈ $0.0031 × 60,000 ≈ $186). Start's $500/month cap is exhausted after roughly 1.4 hours of uncached peak; Build's $1,000 after roughly 2.8 hours. When the cap hits, the whole org 429s until the first of next month. **Scale tier ($200K cap) is effectively required for a 5,000-endpoint production fleet**, and placement on Scale is automatic-by-history plus an in-Console increase request — there is no published deposit that buys it.

Rule-of-thumb monthly steady state (arithmetic, assumptions stated): if each endpoint averages 2 routine turns/day (10,000 Haiku turns/day ≈ $60/day uncached ≈ $1,800/month) plus 5% escalations to Sonnet 5 (500 turns/day × $0.012 ≈ $6/day ≈ $180/month), the org is ≈ $2,000/month before caching — above the Build cap on its own.

#### 2f. Message Batches API as an alternative for non-interactive work

Primary: rate-limits page (same) and https://platform.claude.com/docs/en/build-with-claude/batch-processing (2026-09-02).

| Tier | Batch HTTP RPM | Max batch requests in processing queue | Max requests per batch |
|---|---|---|---|
| Start | 1,000 | 200,000 | 100,000 |
| Build | 2,000 | 300,000 | 100,000 |
| Scale | 4,000 | 500,000 | 100,000 |

Batch limits are shared across all models and are separate from Messages API limits ("Usage of the Batches API does not affect rate limits in the Messages API"). A batch is capped at 100,000 requests or 256 MB; "most batches completing within 1 hour"; results available "when all messages have completed or after 24 hours"; results retained 29 days; 50% discount on input and output; prompt caching works best-effort inside batches (use the 1h TTL). All active models are supported; `stream`, `speed`, `max_tokens: 0` and a few others are rejected. Suitable for end-of-shift ticket summarisation, incident post-mortems, KB refresh — not for live turns. Batch is **not ZDR-eligible** (see Q3).

---

### Q3. Data residency and retention

#### 3a. Default retention and Zero Data Retention

- Default: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data-if-we-use-the-claude-developer-platform (primary, article dated July 1, 2026; the `privacy.anthropic.com` URL 301-redirects here): "we automatically delete inputs and outputs on our backend within 30 days". Exceptions listed: user-controlled longer retention (e.g. Files API), custom agreements including ZDR, Usage Policy enforcement, legal obligations. Trust & Safety-flagged content: retained up to 2 years; classifier scores up to 7 years; feedback submissions 5 years.
- ZDR (docs, primary): https://platform.claude.com/docs/en/manage-claude/api-and-data-retention (2026-09-02). "Under a ZDR arrangement, Anthropic does not store customer prompts or responses at rest after the API response is returned. To request ZDR for your organization, contact the Anthropic sales team." ZDR is "enabled per organization"; each org needs separate enablement. Even with ZDR, flagged content may be kept up to 2 years.
- Eligibility: https://privacy.claude.com/en/articles/8956058-i-have-a-zero-data-retention-agreement-with-anthropic-what-products-does-it-apply-to (primary, updated June 9, 2026): customers "reach out to our Sales Team"; requests "reviewed and applied on a per-organization basis"; Console users can check status under Settings > Privacy Controls > Data retention period. Neither page states an enterprise-contract or minimum-spend requirement, but ZDR is sales-gated, not self-serve. Whether a seed-stage self-serve org is granted ZDR: **I do not have a verified source for this.** `[VERIFY]` with Anthropic sales.
- ZDR feature coverage that matters for this design (same docs page, feature-eligibility table): Messages API — Yes; Prompt caching — Yes (KV cache held in memory for the TTL only); Token counting — Yes; Data residency (`inference_geo`) — Yes; **Batch processing — No** (29-day retention); **Files API — No**; Code execution / Managed Agents / MCP connector — No. Under ZDR the API does not block "No" features; using one steps outside ZDR for that data. CORS is unsupported for ZDR orgs — the hub-proxy pattern is the documented answer.
- Also relevant: HIPAA readiness is a separate, self-serve (Console > Settings > Privacy, standard BAA) arrangement that is permanent once enabled and blocks non-eligible features with a 400.

#### 3b. Model training on API data

- Commercial Terms https://www.anthropic.com/legal/commercial-terms (primary; page states "Effective June 17, 2025"): "Anthropic may not train models on Customer Content from Services."
- Privacy centre https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training (primary): "By default, we will not use your inputs or outputs from our commercial products ... to train our models." Exception: explicit opt-in such as thumbs-up/down feedback.
- Docs retention page adds: "Retained data is never used for model training without your express permission."

#### 3c. Inference geography — `inference_geo`

Primary: https://platform.claude.com/docs/en/manage-claude/data-residency (2026-09-02). Note: the skill's guess of `/docs/en/build-with-claude/inference-geo.md` returns 404; this is the correct page.

- Parameter: top-level `inference_geo` on `POST /v1/messages`. Values: `"global"` (default; "any available geography") and `"us"` ("Inference runs only in US-based infrastructure"). "Only `"us"` and `"global"` are available" — **no EU value.**
- Cost: `"us"` is **1.1x on all token categories** (input, output, cache writes, cache reads) for Claude 4.6 and later. Global is standard price.
- Model support: "supported on Claude 4.6 and later models. Requests with `inference_geo` on Claude Opus 4.5, Claude Sonnet 4.5, **Claude Haiku 4.5**, or earlier models return a 400 error." **Consequence for this design: the routine-tier model (Haiku 4.5) cannot be pinned to US inference; only the Sonnet 5 escalation path can.** The Usage API reports `not_available` for those models' geo.
- Response: `usage.inference_geo` reports where inference ran. Rate limits are shared across geos. Batch API supports per-request `inference_geo`.
- Workspace-level controls (Console or Admin API `data_residency` field): `allowed_inference_geos` and `default_inference_geo`, so a hub can enforce US-only for the Sonnet 5 path without touching request code.
- Also supported on the Batch API.

#### 3d. Where Anthropic processes and stores data

- **Workspace geo** (same data-residency page): "Controls where data is stored at rest and where endpoint processing ... happens." Set at workspace creation, immutable, and "Currently, `"us"` is the only available workspace geo." So at-rest storage is US-only; there is no EU workspace option.
- Privacy Policy https://www.anthropic.com/legal/privacy (primary, "Effective July 8, 2026"): "your personal data is transferred to our servers in the US, or to other countries outside the European Economic Area ('EEA') and the UK"; transfers rely on adequacy decisions and EU SCCs. Controller for EU/UK/CH users is Anthropic Ireland, Limited; elsewhere Anthropic PBC.
- DPA https://www.anthropic.com/legal/data-processing-addendum (primary, "Effective February 24, 2025"): incorporates SCCs Modules Two/Three; subprocessor list referenced at https://www.anthropic.com/subprocessors, which redirects to https://trust.anthropic.com/subprocessors — that page is JavaScript-rendered and returned only its title to the fetcher. Specific cloud subprocessors and regions: **I do not have a verified source for this.** `[VERIFY]` manually in a browser.
- Commercial Terms do not specify a processing region; they defer to the DPA.

#### 3e. Fable 5.1 / Covered Models 30-day retention — scope check

Primary: docs page above ("Model-specific data retention requirements") and https://support.claude.com/en/articles/15425695-covered-models (updated within the last day of fetch), plus https://privacy.claude.com/en/articles/15425996-data-retention-practices-for-covered-models.

- Covered Models are exactly: **Claude Mythos 5.1, Claude Fable 5.1, Claude Mythos 5, Claude Fable 5.** They "require 30-day data retention; ZDR is therefore not available for any of them unless expressly authorized by Anthropic." A ZDR org calling one gets `400 invalid_request_error`: "your organization or workspace must have data retention enabled." ZDR orgs can enable 30-day retention for a single workspace to use them.
- The support article states: "These policies apply only to the models listed on this page. All other Claude models continue to operate under your existing agreement and configured retention settings." **Claude Opus 5, Sonnet 5 and Haiku 4.5 are not Covered Models** — the skill's note is confirmed and does not constrain this design.

---

### Q4. Availability commitments, status page, Priority Tier

- **No SLA for the standard tier.** https://platform.claude.com/docs/en/api/service-tiers (primary, 2026-09-02): "The standard tier is the default service tier for all API requests. The API prioritizes these requests alongside all other requests with best-effort availability." Commercial Terms (primary) disclaim: "Anthropic does not warrant...that the Services or Outputs...will be uninterrupted" and exclude liability for "Service Suspension". No uptime percentage is offered to self-serve orgs.
- **Status page:** https://status.claude.com (retrieved 2026-09-02). Components: claude.ai, Claude Console, Claude API (api.anthropic.com), Claude Code, Claude Cowork, Claude for Government. Displayed 90-day uptime on the fetch date: Claude API **99.54%**, Console 99.93%, claude.ai 99.44%. These are observed history, not commitments; no SLA is mentioned on the page. (For planning: 99.54% over 90 days ≈ 10 hours of API downtime per quarter.)
- **Errors to design for** (https://platform.claude.com/docs/en/api/errors, primary): 529 `overloaded_error` "can occur when the API experiences high traffic across all users"; 429 also fires on acceleration limits; SDKs retry transient failures twice by default honouring `retry-after`.
- **Priority Tier:** the service-tiers page now carries a warning: "Priority Tier capacity commitments are no longer available for purchase. Organizations with an existing commitment can continue to use Priority Tier through their contract end date." For existing holders it "targets 99.5% uptime" and consists of committed input/output TPM, a 1/3/6/12-month term, and a specific model version. **Supported models: "all available Claude models except Claude Fable 5.1, Claude Mythos 5.1, Claude Mythos 5, Claude Mythos Preview, Claude Opus 5, and Claude Sonnet 5."** — the skill's statement that Sonnet 5 and Opus 5 are excluded is confirmed; Haiku 4.5 is nominally supported but the product cannot be bought. Cost: the page publishes burn-down rates (cache read 0.1, 5m write 1.25, 1h write 2.0, US-geo 1.1) but **no dollar price**; the Usage/Cost API page says Priority Tier "costs use a different billing model and are not included in the cost endpoint". Priority Tier dollar pricing: **I do not have a verified source for this.** `[VERIFY]` — moot for new buyers. "If you need guaranteed capacity, contact sales."

Net: for a seed-stage org there is no purchasable availability commitment; resilience has to come from the hub (retry with backoff on 429/529, queueing, model fallback, graceful degradation on the endpoint).

---

### Q5. Controls relevant to one API key fronting a whole fleet

All primary, fetched 2026-09-02.

**Workspaces** — https://platform.claude.com/docs/en/manage-claude/workspaces
- Up to 100 workspaces per org by default; API keys can be scoped to a single workspace; every response carries `anthropic-workspace-id`.
- Per-workspace **rate limits** (RPM / ITPM / OTPM per model tier) and **monthly spend limits with alert thresholds**, set in Console; "You can set workspace limits lower than (but not higher than) your organization's limits"; cannot set limits on the Default Workspace; "Organization-wide limits always apply, even if Workspace limits add up to more."
- Prompt caches are isolated per workspace on the Claude API — a per-tenant-workspace design forfeits cross-tenant cache sharing of the common system prompt/tool catalog (trade-off against isolation).
- Files, Batches and Skills are workspace-scoped resources. Archiving a workspace archives all its keys within seconds (irreversible) — a usable kill switch per tenant.
- Workspace `data_residency` (`allowed_inference_geos`, `default_inference_geo`) is settable via Console or Admin API.

**Admin API** — https://platform.claude.com/docs/en/manage-claude/admin-api and https://platform.claude.com/docs/en/manage-claude/admin-api-keys
- "The Admin API is unavailable for individual accounts" — requires a Console **organization** (Settings > Organization). Auth: Admin API key `sk-ant-admin01-...` (created only by org admins, Console > Settings > Admin keys), `org:admin` OAuth token, or a personal/service-account key not scoped to a workspace. Regular workspace keys are rejected.
- Manages members, invites, workspaces and members, API keys, service accounts, federation. **API keys cannot be created via the API**: "You create API keys in the Claude Console. The Admin API can only read, rename, and change the status of existing keys." (Tenant onboarding automation therefore cannot mint keys programmatically.)
- SDK surface `client.beta.organization.*` (beta).

**Usage & Cost API** — https://platform.claude.com/docs/en/manage-claude/usage-cost-api
- `GET /v1/organizations/usage_report/messages` with `bucket_width` `1m`/`1h`/`1d`; filter/group by `api_key_id`, `workspace_id`, `model`, `service_tier`, `context_window`, `inference_geo`; reports uncached input, cached input, cache-creation and output tokens; `1m` granularity up to 1,440 buckets. `GET /v1/organizations/cost_report` daily only, USD cents, group by `workspace_id`/`description`. Data appears "within 5 minutes"; poll at most once per minute sustained. Default workspace shows `workspace_id: null`. Partner integrations listed: Datadog, Grafana Cloud, Honeycomb, CloudZero, Vantage, Harness.

**Rate Limits API** — https://platform.claude.com/docs/en/manage-claude/rate-limits-api
- `GET /v1/organizations/rate_limits` (org) and `/workspaces/{id}/rate_limits` (overrides only) return configured RPM/ITPM/OTPM per model group — explicitly pitched at keeping "gateways and proxies in sync" instead of hard-coding limits. Read-only: "Can I update rate limits with this API? No." Workspace limits are set in Console only.

**Response headers for hub-side throttling** (rate-limits page): `anthropic-ratelimit-requests-{limit,remaining,reset}`, `anthropic-ratelimit-input-tokens-*`, `anthropic-ratelimit-output-tokens-*`, `retry-after`. The `tokens-*` headers reflect the most restrictive limit in effect (e.g. a workspace cap). A hub proxy should read these on every response and shape admission accordingly rather than relying on 429s.

**Spend-limit behaviour to encode in the hub**: tier cap → 429 with no `retry-after` (`enforced_spend_limit_reached`); self-set org/workspace limit → 400 `invalid_request_error` beginning "You have reached your specified API usage limits". Both are month-long outages, not transient.

**Data residency per tenant**: because Haiku 4.5 rejects `inference_geo`, a tenant with a US-only requirement cannot be served by the routine tier at all; the hub would need to route that tenant to Sonnet 5 (1.1x) or a 4.6+ model.

---

### Unverified / could not find

1. `[VERIFY]` Tier-advancement mechanics (credit-deposit thresholds, wait times). Current primary docs say placement is automatic by usage history plus an in-Console increase request; the $5/$40/$200/$400 Tier 1–4 ladder appears only in a secondary source dated 2026-01-09 that pre-dates the 2026-06-26 Start/Build/Scale consolidation. I do not have a verified source for any current deposit threshold.
2. `[VERIFY]` Whether a seed-stage, self-serve organization without an enterprise contract will be granted Zero Data Retention. Primary pages say ZDR is requested through sales and approved per organization; they do not state an enterprise or minimum-spend prerequisite either way.
3. `[VERIFY]` Anthropic's subprocessor list and hosting regions (https://trust.anthropic.com/subprocessors is JS-rendered; only the title was retrievable). At-rest storage is documented as US-only via workspace geo, but the underlying cloud providers/regions were not retrieved.
4. `[VERIFY]` Priority Tier dollar pricing — not published on the service-tiers or pricing pages; product is no longer sold to new customers, so likely irrelevant.
5. `[VERIFY]` Exact date of the Start/Build/Scale tier consolidation (2026-06-26) — taken from a help-centre "last updated" date and a secondary blog; the docs page itself is undated.
6. `[VERIFY]` Status-page 90-day uptime figures are a point-in-time observation on 2026-09-02 and will change; they are not a commitment.
7. `[VERIFY]` Commercial Terms effective date reported by the fetcher as "June 17, 2025" — confirm no newer revision is linked from the legal index.
8. Not found: any EU inference or EU at-rest option on the first-party Claude API (docs affirmatively say only `us`/`global` inference and only `us` workspace geo) — this is a verified absence, not a gap.

---

## Part A / A4 — AWS pricing, RDS connection limits, and region calculus (post-Bedrock)

Research date: 2026-09-02. All prices USD, on-demand, as published by AWS on that date. Unless marked `[VERIFY]`, every number below was read directly from an AWS primary source (docs.aws.amazon.com, aws.amazon.com pricing pages, or the machine-readable pricing feeds that those pages render from: `https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/<service>/USD/current/<file>.json`, manifest publication dates 2026-08-31 and 2026-09-03). The full regional Price List API index (`pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/us-east-1/index.json`) was not pulled; the meteredUnitMaps feed exposes the same `rateCode` values (e.g. `9HPEGXQTDDGH53C9.JRTCKXETXF.6YS6EN2CT7` for db.t4g.micro Single-AZ PostgreSQL us-east-1) and is the data source the pricing pages themselves use.

---

### Q1. RDS for PostgreSQL db.t4g.micro, gp3, and the free tier

#### Q1.1 Prices (on-demand, RDS for PostgreSQL)

Source: `https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/rds/USD/current/rds-postgresql-ondemand.json` (feed behind https://aws.amazon.com/rds/postgresql/pricing/ ; manifest `hawkFilePublicationDate` 2026-09-03T00:28:36Z). Accessed 2026-09-02.

| Item | US East (N. Virginia) us-east-1 | US East (Ohio) us-east-2 | Differ? |
|---|---|---|---|
| db.t4g.micro Single-AZ, $/hr | **0.016** (rateCode 9HPEGXQTDDGH53C9…) | **0.016** (rateCode GGD6FE59WWUNDKDC…) | No |
| db.t4g.micro Multi-AZ, $/hr | **0.032** (rateCode RGZ43Q28J3F87JYA…) | **0.032** (rateCode EHTN9E2TU39SJ75A…) | No |
| gp3 storage Single-AZ, $/GB-month | **0.115** | **0.115** | No |
| gp3 storage Multi-AZ (one standby), $/GB-month | **0.230** | **0.230** | No |
| gp3 storage Multi-AZ readable standbys (cluster), $/GB-month | 0.345 | 0.345 | No |

Feed metadata for db.t4g.micro in both regions: `"Memory":"1 GiB","vCPU":"2","Network Performance":"Up to 5 Gigabit"`.

Monthly (730 h): Single-AZ instance $11.68; Multi-AZ $23.36; 20 GB gp3 Single-AZ $2.30.

**Finding:** The hub cost model's $0.016/hr figure "taken from us-east-2" is identical in us-east-1. The two regions do not differ for any RDS PostgreSQL line item checked (0% delta). The region-of-origin caveat in the cost model can be dropped.

Note: the public pricing page https://aws.amazon.com/rds/postgresql/pricing/ renders these numbers client-side (WebFetch returned only the placeholders), which is why the underlying feed was used.

#### Q1.2 Free tier in 2026

Primary sources, all accessed 2026-09-02:

- https://aws.amazon.com/free/ — new customers get "$100 in credits immediately" and can "earn up to $100 more", i.e. "up to $200 over 6 months". Free plan: "No charges incurred unless you upgrade to a Paid plan." The free-plan account "closes on its own 6 months after you open it or when your credits run out, whichever comes first." Also: "30+ AWS services are always free within monthly usage limits on both the Free and Paid plans."
- https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier.html — "you receive USD $100 in credits after you create an account, regardless of your account plan"; "earn up to an additional USD $100"; free plan is "at no cost for up to six months"; "Paid plan accounts might have Short-term trial and Always Free offerings active. Free account plan only have Always Free offerings active."
- https://aws.amazon.com/free/free-tier-faqs/ — "Existing customers are ineligible for Free Tier credits or the free account plan." Also "Free Tier credits expire 12 months from the date you create your AWS account." (Note: the FAQ's 12-month credit expiry and the free-plan 6-month account closure are both stated; on the Free plan the 6-month closure governs. On the Paid plan, credits last up to 12 months.) After free-plan expiry: "AWS closes your account, and you'll lose access to your resources and data"; data retained 90 days.
- https://aws.amazon.com/rds/free/ — "Free plan is available on db.t3.micro and db.t4g.micro instances" for MySQL, PostgreSQL, MariaDB, SQL Server (Express). "With Free plan, you can explore Aurora and RDS for up to 6 months". Legacy note: "If you activated your free tier account prior to July 15th, 2025, you can continue to use select RDS instances for free up to 12 months after your sign-up date."

**What this means for the hub spec's claims:**

| Hub spec claim | Status (2026-09-02) |
|---|---|
| "RDS free 12 months" (750 hrs/mo micro Single-AZ, 20 GB storage, 20 GB backup) | **Not current for accounts created on/after 2025-07-15.** That 12-month offer is now the "AWS Legacy Free Tier", available only to accounts activated before July 15, 2025 (aws.amazon.com/rds/free). New accounts instead draw down credits. The RDS PostgreSQL pricing page still carries the stale sentence "750 hours on a selection of Single-AZ instance databases, 20 GB of General Purpose SSD (gp2) storage … for one year" (https://aws.amazon.com/rds/postgresql/pricing/, accessed 2026-09-02) — treat that page text as legacy-era copy, not as an entitlement for a new account. |
| "$200 credits" | **Partially current.** $100 is granted at sign-up; the second $100 must be earned via activities ("up to $200"). Budget on $100 guaranteed, $200 best case. |
| Implicit: run for a year on free tier | **Not current.** On the Free plan the account itself closes at 6 months (or when credits are exhausted). A production hub must be on the Paid plan; there, credits apply until exhausted or 12 months, and RDS is billed at the rates in Q1.1 afterwards. |

`[VERIFY]` Whether the "Always Free" list for new accounts includes any RDS allowance: aws.amazon.com/free lists RDS as "Available on both plans" but I did not find a stated always-free RDS hour allowance; the RDS free page frames RDS on the Free plan as credit-funded. I do not have a verified source for an always-free RDS hour quota for post-2025-07-15 accounts.

---

### Q2. max_connections on db.t4g.micro and the pooling question

#### Q2.1 The formula (primary source)

https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Limits.html#RDS_Limits.MaxConnections (accessed 2026-09-02), table row for PostgreSQL:

- Parameter `max_connections`, allowed values 6–262143, default `LEAST({DBInstanceClassMemory/9531392}, 5000)`.
- "`DBInstanceClassMemory` is in bytes." And: "this memory size is smaller than the value in gibibytes (GiB) shown" in the hardware spec table, because of OS/RDS-process reservation.
- The same page's MySQL example shows the effect on small classes: for db.t3.micro MySQL "the default maximum number of connections … is approximately 60" versus the raw-formula ~85.

https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ParamValuesRef.html#USER_FormulaVariables (accessed 2026-09-02): `DBInstanceClassMemory` "subtracts memory reserved for the operating system and the RDS processes"; "always somewhat lower than the memory figures shown in the instance class tables"; division "truncated, not rounded".

#### Q2.2 db.t4g.micro memory (primary source)

https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.DBInstanceClass.Summary.html (accessed 2026-09-02), burstable table: `db.t4g.micro | 2 vCPU | 1 GiB | EBS-optimized only | Up to 2,085 Mbps | Up to 5 Gbps`. (db.t4g.small = 2 GiB; db.t3.micro = 1 GiB.)

#### Q2.3 Computed default

- Nominal: 1 GiB = 1,073,741,824 B ÷ 9,531,392 = 112.65 → **112** (truncated). This is the ceiling.
- Actual: `DBInstanceClassMemory` is lower than 1 GiB by the OS/RDS reservation, so the real default is below 112. AWS does not publish the per-class reserved amount. `[VERIFY]` Commonly observed values for PostgreSQL on db.t3.micro/db.t4g.micro are in the ~80–90 range (e.g. 87); I do not have a verified AWS primary source stating the exact PostgreSQL default for db.t4g.micro. The MySQL analogue on the same doc page (~60 vs ~85 nominal, i.e. ~30% haircut) suggests planning on **roughly 80–90 usable, not 112**. Confirm on a live instance with `SHOW max_connections;`.

Reserved slots that reduce what the application can use:

- `superuser_reserved_connections` — standard PostgreSQL parameter (PostgreSQL default 3). The RDS `postgres` master user is NOT a PostgreSQL superuser (`NOSUPERUSER`; https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.Roles.rds_superuser.html, accessed 2026-09-02), so these slots are unusable by the app.
- `rds.rds_superuser_reserved_connections` — "Sets the number of connection slots reserved for rds_superusers. This parameter is only available in versions 15 and earlier." (https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.Parameters.html, accessed 2026-09-02). `[VERIFY]` Default value 2 — reported by AWS re:Post knowledge-center article (https://repost.aws/knowledge-center/rds-postgresql-error-connection-slots, seen via search snippet only; direct fetch returned HTTP 403). For PostgreSQL 16+, the doc points to upstream `reserved_connections` instead.
- RDS also creates an internal `rds_reserved` role "used internally by Amazon RDS to reserve database connections" (rds_superuser doc above) and internal `rdsadmin` sessions consume slots.

Planning number: **~75–85 application-usable connections on db.t4g.micro** (nominal 112, minus OS haircut, minus ~5 reserved, minus RDS internal sessions). `[VERIFY]` the exact figure on a deployed instance.

#### Q2.4 Does this force a pooler?

Arithmetic for the hub (N Fargate tasks, each with an in-process pool):

| Tasks × pool size | App connections | vs ~80 usable |
|---|---|---|
| 2 × 10 | 20 | fine |
| 3 × 20 (typical ORM default) | 60 | tight; add job-queue worker connections and it is at the edge |
| 4 × 20 + migrations/admin | 80+ | exceeds |
| Any autoscale burst to 6+ tasks × 20 | 120+ | fails ("remaining connection slots are reserved") |

Schema-per-tenant does not by itself multiply connections: one connection can serve any tenant via `SET search_path` / schema-qualified names. It becomes a multiplier only if the pool is partitioned per tenant (avoid that). The Postgres job queue (`SELECT … FOR UPDATE SKIP LOCKED`) needs one long-lived connection per worker loop; count those explicitly.

Conclusion: db.t4g.micro does **not force** a pooler for a "small number of Fargate tasks" if each task's pool is capped at ~10 and total tasks stay ≤4. It **does** force either a pooler or a bigger instance the moment tasks autoscale or the per-task pool is left at framework defaults (often 20–100). A cap of `pool_size ≤ (80 / max_tasks) − workers` should be an explicit configuration item.

#### Q2.5 RDS Proxy: price and applicability

Price (primary source: `https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/rds/USD/current/rds-proxy.json`, the feed behind https://aws.amazon.com/rds/proxy/pricing/, accessed 2026-09-02):

- RDS Proxy (provisioned RDS/Aurora instances): **$0.015 per vCPU-hour** in both us-east-1 (rateCode FRAHVUJVSQ9JH49R…) and us-east-2 (rateCode 4WA5DAGP7VDQZCPB…). Identical.
- Minimum charge, from the pricing page HTML (https://aws.amazon.com/rds/proxy/pricing/, accessed 2026-09-02): pricing "correlates to the number of vCPUs … with a minimum charge for 2 vCPUs." Its own example is an "RDS PostgreSQL t2.small database instance that has 1 vCPU" charged "for the minimum of 2 vCPUs". Also: "10-minute minimum charge following a billable status change".
- db.t4g.micro has 2 vCPUs, so proxy cost = 2 × $0.015 = **$0.030/hr ≈ $21.90/month** — about **1.9× the price of the db.t4g.micro instance itself ($11.68/mo)**.

Instance-class support: I checked https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html (Quotas and limitations, incl. PostgreSQL-specific), rds-proxy-planning.html, rds-proxy-creating.html, Concepts.RDS_Fea_Regions_DB-eng.Feature.RDSProxy.html, and https://aws.amazon.com/rds/proxy/faqs/ (all accessed 2026-09-02). **None of them states that RDS Proxy is unavailable for db.t2.micro / db.t3.micro / db.t4g.micro or for burstable classes.** On the contrary, the planning page says "For DB instances that use smaller AWS instance classes, such as T2 or T3, using a proxy can help avoid out-of-memory conditions", and the pricing page's worked example is a 1-vCPU t2.small. The region table shows RDS Proxy for RDS for PostgreSQL 10–18 "All available versions" in both US East (N. Virginia) and US East (Ohio). So the premise in the question ("RDS Proxy is NOT supported on micro") is **not supported by current AWS documentation**; I found no such restriction. `[VERIFY]` only in the sense that absence of a stated restriction is not the same as an explicit "supported" statement for db.t4g.micro; a console attempt would settle it.

Other relevant RDS Proxy constraints found (rds-proxy.html, accessed 2026-09-02): "RDS Proxy doesn't support session pinning filters for PostgreSQL"; "Any statement with a text size greater than 16 KB causes the proxy to pin the session"; proxy must be in the same VPC; "US East (N. Virginia) Region does not support RDS Proxy in the use1-az3 Availability Zone". `[VERIFY]` Whether `SET search_path` (the natural schema-per-tenant idiom) causes session pinning under RDS Proxy for PostgreSQL — the PostgreSQL-specific pinning page (rds-proxy-pinning.html) was not fetched; if it pins, multiplexing benefit is lost for the hub's access pattern and the proxy becomes an expensive connection cap rather than a pooler.

Recommendation on the pooler question:

1. Cheapest and sufficient at Phase 1 scale: cap in-process pool sizes (see Q2.4) and count worker connections. Cost $0.
2. If multiplexing is needed later: PgBouncer as a sidecar container in each Fargate task (transaction pooling; note `SET search_path` is session state, so use schema-qualified SQL or `search_path` set per transaction) costs only the marginal Fargate CPU/memory (a 0.25 vCPU/0.5 GB sidecar on ARM ≈ $0.0099/hr ≈ $7/mo per task at the Q4 rates), no RDS Proxy fee.
3. RDS Proxy at $21.90/mo is the most expensive option and roughly doubles the database line; it only pays off if you want its failover/IAM features, and its value for a schema-per-tenant workload depends on the pinning question above.
4. Alternatively, db.t4g.small (2 GiB → nominal 225 connections) costs 2× the micro; `[VERIFY]` exact db.t4g.small price was not extracted (only micro was queried from the feed).

---

### Q3. Region calculus after removing Bedrock

#### (a) Do us-east-1 and us-east-2 prices differ for the hub's components?

All from the AWS pricing feeds behind the respective pricing pages, accessed 2026-09-02:

| Component | us-east-1 | us-east-2 | Source feed |
|---|---|---|---|
| RDS PostgreSQL db.t4g.micro Single-AZ | $0.016/hr | $0.016/hr | rds/rds-postgresql-ondemand.json |
| RDS gp3 Single-AZ | $0.115/GB-mo | $0.115/GB-mo | same |
| RDS Proxy | $0.015/vCPU-hr | $0.015/vCPU-hr | rds/rds-proxy.json |
| Fargate Linux/ARM | $0.03238/vCPU-hr, $0.00356/GB-hr | $0.03238/vCPU-hr, $0.00356/GB-hr | ecs/ecs.json ("ARM perCPU per hour", "ARM perGB per hour") |
| Fargate Linux/x86 | $0.04048/vCPU-hr, $0.004445/GB-hr | same | ecs/ecs.json |
| ALB | $0.0225/hr, $0.008/LCU-hr | $0.0225/hr, $0.008/LCU-hr | elb/elb.json ("Application Load Balancer Hours", "… LCU Hours") |
| Public IPv4 (in-use or idle) | $0.005/hr | $0.005/hr | vpc/vpc.json ("Hourly charge for In use Public IPv4 Addresses", "…Idle…") |
| S3 gateway endpoint | free | free | https://aws.amazon.com/vpc/pricing/ : "There are no data processing or hourly charges for using Gateway Type VPC endpoints." |

**Every Phase 1 line item is priced identically in the two regions.** Cost is not a tiebreaker.

#### (b) Anthropic API region binding

https://platform.claude.com/docs/en/api/overview (redirect target of docs.anthropic.com/en/api/overview; accessed 2026-09-02): "The Claude API is a RESTful API at `https://api.anthropic.com`". The doc offers no per-AWS-region endpoint for the direct API; region-specific access exists only via the cloud-platform routes (Amazon Bedrock, "Claude Platform on AWS", Vertex, Foundry), which the hub is no longer using. https://platform.claude.com/docs/en/api/supported-regions (accessed 2026-09-02) defines "supported regions" as "countries, regions, and territories we can currently support access from" — i.e. customer geography, not a hosting region. **From the client's perspective the direct API is region-agnostic; the hub's AWS region has no bearing on API availability or pricing.** `[VERIFY]` Anthropic does not publish api.anthropic.com's serving locations, so any latency difference between us-east-1 and us-east-2 egress to it is unmeasured; I do not have a verified source for this. Expect single-digit-ms differences that are negligible against LLM inference time.

#### (c) Incident history

https://aws.amazon.com/premiumsupport/technology/pes/ (accessed 2026-09-02) lists 18 post-event summaries (2011–2025). Of these, 10 are US-East / US-EAST-1 (Northern Virginia): 2025-10-19 DynamoDB; 2024-07-30 Kinesis; 2023-06-13 Lambda; 2021-12-07 multi-service; 2020-11-25 Kinesis; 2017-02-28 S3; 2015-09-20 DynamoDB; 2012-12-24 ELB; 2012-10-22; 2012-06-29; 2011-04-21 EC2/RDS. **Zero are US East (Ohio).** The remaining eight are Tokyo (2), Seoul, Sydney, EU West, São Paulo, and one multi-region. Caveat: this page is AWS's curated set of large-scale events, not a complete outage log, and us-east-1 is also AWS's oldest and largest region, so the count reflects exposure as much as reliability. `[VERIFY]` any stronger claim (e.g. per-region availability statistics) — I do not have a verified source for comparative uptime figures.

Relevant to the hub: several of those us-east-1 events impaired global control planes (IAM, Route 53, STS default endpoint) and thereby affected customers in other regions; being in us-east-2 does not remove that exposure, but it does remove exposure to the regional data-plane failures (EC2/EBS/RDS/Lambda/DynamoDB/Kinesis) that made up most of the list.

#### (d) Remaining us-east-1-only services the hub might touch

https://docs.aws.amazon.com/whitepapers/latest/aws-fault-isolation-boundaries/global-services.html (accessed 2026-09-02): control planes hosted in us-east-1 include IAM, AWS Organizations, Account Management, Route 53 (public and private DNS), CloudFront, WAF for CloudFront, "Amazon Certificate Manager (ACM) for CloudFront (us-east-1)", Shield Advanced. S3 `CreateBucket`/`DeleteBucket` and a list of bucket-configuration calls also "depend on us-east-1". ELB provisioning depends on the Route 53 control plane in us-east-1.

https://docs.aws.amazon.com/acm/latest/userguide/acm-services.html (accessed 2026-09-02): "To use an ACM certificate with CloudFront, you must request or import the certificate in the US East (N. Virginia) region."

Implications for a hub deployed in us-east-2:

- IAM, Route 53, STS, Organizations are usable from any region; hosting the workload in us-east-1 gives no advantage — their control planes are in us-east-1 regardless, and their data planes are regional/global. The whitepaper's guidance (use regional STS endpoints; pre-provision ELBs, buckets, DNS) applies equally in both regions.
- ACM for an ALB in us-east-2 is issued in us-east-2 — no us-east-1 dependency. Only if the hub later adds CloudFront would one certificate need to live in us-east-1 (a trivial, region-independent step).
- The hub spec (ALB, Fargate, RDS, S3 gateway endpoint, public IPv4, no NAT) uses no single-region service. RDS Proxy, if adopted, is available for RDS for PostgreSQL in us-east-2 (Concepts.RDS_Fea_Regions_DB-eng.Feature.RDSProxy.html, accessed 2026-09-02).

#### Plain statement

**Removing Bedrock removes the only reason to prefer us-east-1.** Prices for every Phase 1 component are identical in us-east-2; the Anthropic direct API has no AWS-region binding; no service the hub uses is us-east-1-only; and the AWS post-event-summary record shows 10 large-scale us-east-1 events versus none in us-east-2. On the evidence, us-east-2 is at least as good and arguably better (fewer regional data-plane incidents, and the design already avoids the us-east-1 control-plane dependencies the whitepaper warns about). The one soft consideration is team familiarity/inertia and any existing artifacts (AMIs, ECR images, ACM certs, S3 buckets) already created in us-east-1 — these are one-time migration costs, not architectural reasons. `[VERIFY]` if the organization has any data-residency or partner constraint that names a specific region — none is recorded in the material reviewed.

---

### Q4. Other Phase 1 rates in us-east-1 — confirmation

All accessed 2026-09-02.

| Hub spec rate | Confirmed value (us-east-1) | Source |
|---|---|---|
| ALB $0.0225/hr | **$0.0225/hr** confirmed; LCU $0.008/LCU-hr | https://aws.amazon.com/elasticloadbalancing/pricing/ (static text: "$0.0225", "$0.008") and elb/elb.json |
| Fargate ARM $0.0000089944/vCPU-s | **confirmed**; pricing-page example text: "CPU cost: $0.0000089944 per vCPU second"; × 3600 = $0.03238/vCPU-hr, matching feed "ARM perCPU per hour" **$0.03238** | https://aws.amazon.com/fargate/pricing/ and ecs/ecs.json |
| Fargate ARM $0.0000009889/GB-s | **confirmed**; page text: "memory cost: $0.0000009889 per GB per second"; × 3600 = $0.00356/GB-hr, matching feed "ARM perGB per hour" **$0.00356** | same |
| Public IPv4 $0.005/hr | **confirmed**; page text "Hourly charge for In-use Public IPv4 Address $0.005" and "Idle Public IPv4 Address $0.005"; feed shows $0.005 for both in-use and idle | https://aws.amazon.com/vpc/pricing/ and vpc/vpc.json |
| S3 gateway endpoint free | confirmed: "no data processing or hourly charges for using Gateway Type VPC endpoints" | https://aws.amazon.com/vpc/pricing/ |

Derived monthly at 730 h for the hub's 0.5 vCPU / 1 GB ARM task: (0.5 × 0.03238 + 1 × 0.00356) × 730 = **$14.42/task-month**. ALB $16.43/mo + IPv4 $3.65/mo (one address) — LCU usage extra.

Cross-check against the Fargate page's own x86 example ("$0.000011244 per vCPU second" → $0.04048/vCPU-hr) matches the feed's x86 "perCPU per hour" $0.04048, confirming the feed-to-page mapping.

---

### Unverified / could not find

1. `[VERIFY]` Exact default `max_connections` for RDS for PostgreSQL on db.t4g.micro. Formula ceiling is 112; AWS does not publish the OS/RDS memory reservation per class. Planning figure ~80–90 is inference from the MySQL example on CHAP_Limits.html. Confirm with `SHOW max_connections;`.
2. `[VERIFY]` Default value of `rds.rds_superuser_reserved_connections` (= 2). Seen only in a search snippet of an AWS re:Post knowledge-center article; direct fetch returned HTTP 403; not stated on docs.aws.amazon.com pages fetched. Parameter applies to PostgreSQL ≤15 only.
3. `[VERIFY]` RDS Proxy explicit support statement for db.t4g.micro. No restriction found in any RDS Proxy doc or FAQ (and the pricing page uses a 1-vCPU t2.small as its example), but no page affirmatively lists supported instance classes.
4. `[VERIFY]` Whether `SET search_path` causes RDS Proxy session pinning for PostgreSQL (rds-proxy-pinning.html not fetched).
5. `[VERIFY]` db.t4g.small hourly price (not extracted from the feed; only db.t4g.micro rows were queried).
6. `[VERIFY]` Any always-free RDS allowance for accounts created on/after 2025-07-15. I do not have a verified source for this; the RDS free page frames Free-plan RDS usage as credit-funded for 6 months.
7. `[VERIFY]` Serving location(s) of api.anthropic.com and any measurable latency difference from us-east-1 vs us-east-2. I do not have a verified source for this.
8. `[VERIFY]` Comparative regional availability statistics beyond the curated post-event summaries list. I do not have a verified source for this.
9. `[VERIFY]` Any organizational data-residency or partner constraint that pins the hub to a named region. None found in the material reviewed.
10. Not fetched: the full AWS Price List API regional index JSON (hundreds of MB). Prices were taken from the meteredUnitMaps feeds that the aws.amazon.com pricing pages render from, which carry the same `rateCode` identifiers; this is a primary AWS source but a different file from the one named in the task brief.

---

## Part A / A5 — Endpoint research: TPM device identity, TLS inspection, EDR allowlisting, MSI update distribution

Research subagent report. All pages retrieved 2026-09-02 unless noted. Claims not confirmed from a retrieved primary source are tagged `[VERIFY]`. Quotations are kept under 15 words.

Context recap: unprivileged Electron agent + privileged broker (Windows Service, four native Win32 network-repair primitives via FFI). Deciding mTLS (per-device client cert) vs signed device token (TPM-backed key signs JWT/nonce). No local admin for users. No EDR yet (will be). Broker ships as MSI via Intune/SCCM; agent may self-update. Hub is cloud HTTPS through the corporate network.

---

### Q1. TPM 2.0 signing via the Platform Crypto Provider (PCP)

#### Q1(a) Official docs: creating TPM-backed keys via CNG/NCrypt; algorithms; user vs machine keys

**What the primary sources say**

- The Microsoft Platform Crypto Provider is the CNG key storage provider that uses the TPM. Microsoft's CNG KSP page (updated 2026-06-23) describes it as a KSP "that utilizes the Trusted Platform Module (TPM)" and shows it opened with `NCryptOpenStorageProvider(&hProvider, MS_PLATFORM_CRYPTO_PROVIDER, 0)`. It states private keys "cannot be extracted, even by malicious software."
  Source: https://learn.microsoft.com/en-us/windows/win32/seccertenroll/cng-key-storage-providers (accessed 2026-09-02).
- The same page lists algorithm tables for the *Software* KSP (RSA 512–16384, ECDSA P256/P384/P521, ECDH, DH, DSA) and the *Smart Card* KSP, but gives **no algorithm table for the Platform Crypto Provider**. So the exact PCP algorithm support (RSA 2048, ECDSA P-256) is **not stated on the current learn.microsoft.com page**.
- Microsoft's TPM Key Attestation article states, for the attestation feature specifically: "TPM key attestation only works for RSA keys" and the template must use "Microsoft Platform Crypto Provider". It also notes "Microsoft Platform Crypto Provider KSP must be used" for attestation and that the KSP has existed "since Windows 8".
  Source: https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/component-updates/tpm-key-attestation (accessed 2026-09-02).
- Microsoft's TPM fundamentals page: "The TPM protects certificates and RSA keys" and "The TPM can also be used for crypto-operations through Cryptography API: Next Generation (CNG)."
  Source: https://learn.microsoft.com/en-us/windows/security/hardware-security/tpm/tpm-fundamentals (accessed 2026-09-02).
- Machine vs user key: `NCryptCreatePersistedKey` documents `NCRYPT_MACHINE_KEY_FLAG`: "The key applies to the local computer. If this flag is not present, the key applies to the current user." The same page warns: "A service must not call this function from its StartService Function" (deadlock risk) — directly relevant to a broker service that creates its key at startup.
  Source: https://learn.microsoft.com/en-us/windows/win32/api/ncrypt/nf-ncrypt-ncryptcreatepersistedkey (accessed 2026-09-02).
- CNG key isolation: "Only the Microsoft KSP is loaded in the key isolation service" (LSA); CNG stores per-user private keys under `%APPDATA%\Microsoft\Crypto\Keys` and Local System keys under `%ALLUSERSPROFILE%\Application Data\Microsoft\Crypto\SystemKeys`.
  Source: https://learn.microsoft.com/en-us/windows/win32/seccng/key-storage-and-retrieval (accessed 2026-09-02).
- The detailed PCP developer guide ("Using the Windows 8 Platform Crypto Provider and Associated TPM Functionality") is acknowledged by Microsoft support (Microsoft Q&A, May 2024) to be on GitHub and to have "not been updated for 9 years"; many `NCRYPT_PCP_*_PROPERTY` values have no documentation.
  Source: https://learn.microsoft.com/en-us/answers/questions/4022641/newest-documentation-for-windows-platform-crypto-p (accessed 2026-09-02).

**Non-admin usability**

- Windows itself gives standard (non-admin) users access to the TPM: the TPM Group Policy page describes per-standard-user throttling of TPM commands that require authorization ("Standard User Individual Lockout Threshold" default 4; "Standard User Total Lockout Threshold" default 9; "Standard User Lockout Duration" default 480 minutes). The existence of these controls confirms standard users can send authorized TPM commands.
  Source: https://learn.microsoft.com/en-us/windows/security/hardware-security/tpm/trusted-platform-module-services-group-policy-settings (accessed 2026-09-02).
- Windows Hello for Business creates and uses TPM-protected keys in the interactive user's context (users are not admins): "User key material is generated and available within the TPM of the device."
  Source: https://learn.microsoft.com/en-us/windows/security/identity-protection/hello-for-business/faq (accessed 2026-09-02).
- Whether a **non-admin user process can create a PCP key with `NCRYPT_MACHINE_KEY_FLAG`** (machine scope) is not documented on any page I retrieved. `[VERIFY]` Design-wise, the privileged broker (LocalSystem) is the natural owner of a machine-scoped PCP key; the unprivileged Electron agent should not hold the device key.
- Explicit PCP support for ECDSA P-256 is not on the current learn.microsoft.com CNG page. `[VERIFY]` (TPM 2.0 firmware support for `ECDSA` on `NIST_P256` was 98% across the 78 firmware versions in the TPMScan dataset — see Q1(b) — so the TPM side is essentially universal; the Windows PCP mapping is the unverified part.)

#### Q1(b) Signing latency: RSA-2048 / ECDSA-P256 on dTPM vs fTPM/Pluton

**Authoritative (Microsoft / TCG) figure:** I do not have a verified source for this. Neither the TCG TPM 2.0 Library specification pages nor any learn.microsoft.com page I retrieved states a signing latency; TCG specifies functionality, not performance.

**Best available sources, with methodology**

1. **Peer-reviewed — TPMScan (IACR TCHES 2024)**, Svenda et al., Masaryk University. Methodology: metadata, keys and "performance characteristics from 78 different TPM versions manufactured by 6 vendors, including recent Pluton-based iTPMs", collected with the open tool `tpm2-algtest`; results reported as median and standard deviation per firmware version (Figure 6, log axes).
   - Figure 6 plots `TPM2_Sign(ECDSA-P256)` medians on an axis spanning **0.01 s to 0.5 s** (10–500 ms) across all firmware, and `TPM2_Create(RSA-2048)` key-generation medians on an axis spanning **3 s to 30 s**. Exact per-vendor ECDSA medians are only in the figure (not in the text), so I cannot quote them. `[VERIFY]` for any specific per-vendor ECDSA number.
   - Text gives some numbers for Pluton iTPMs: AES encrypt/decrypt "median 26 ms vs. 210 ms" (MSFT Pluton vs AMD Pluton); RSA-1024 sign "median 51 ms vs. 207 ms"; RSA-2048 signature time "practically identical for MSFT and AMD iTPMs"; RSA-2048 keygen "median 2129 ms vs. 414 ms". It also notes Intel fTPM version "500.14.x (Comet Lake), which is almost 10x slower" than 500.10.x for ECDSA-P256 signing, and that the Pluton-based AMD 6.24.0.6 is "at least an order of magnitude slower than all older firmware-only AMD fTPMs in almost all operations".
   - Takeaway: signing latency varies by roughly an order of magnitude between firmware versions of the same vendor; you cannot assume "fTPM = fast".
   Source: https://crocs.fi.muni.cz/_media/publications/pdf/2024-ches-tpmscan.pdf (PDF, accessed 2026-09-02); landing page https://crocs.fi.muni.cz/public/papers/tpm_ches2024; TCHES record https://tches.iacr.org/index.php/TCHES/article/view/11444.

2. **Large-sample field telemetry — Google Chrome / WICG DBSC** (Device Bound Session Credentials) README, "TPM considerations": "Currently the latency is (P50: 200ms/ P95: 600ms) for signing operations." Context: ECDSA_P256 on Windows TPMs, gathered from Chrome studies. This is a browser-vendor engineering note, not a paper; sample size and TPM mix are not stated. Secondary but large-population. `[VERIFY]` exact population.
   Source: https://github.com/WICG/dbsc/blob/main/README.md (accessed 2026-09-02).

3. **Blog benchmark (secondary)** — "TPM Performance :(" (S. Kristiansen, Substack). Methodology: 30 iterations, sequential, Linux, several distinct TPMs (firmware/manufacture year not recorded); code at github.com/stiankri/tpm-benchmark. Finding: "single digit signatures per second on most systems" for ECDSA-P256 and RSA-2048; author says Chrome's numbers are "qualitatively similar".
   Source: https://stiankri.substack.com/p/tpm-performance (accessed 2026-09-02).

4. **Vendor community thread (could not retrieve — HTTP 403)** — Infineon OPTIGA TPM SLB9670 community post reportedly gives ECDSA-256 sign ≈ 68.9 ms and RSA-2048 private op ≈ 163.2 ms at 33 MHz. `[VERIFY]` — figure comes only from a search snippet.
   Source: https://community.infineon.com/t5/OPTIGA-TPM/Performance-tests-ecdsa-sig-ver-with-TPM2-0-SLX9670/td-p/349217 (403 on 2026-09-02).

**Design consequence:** budget hundreds of milliseconds (P95 ≈ 600 ms per the Chrome data) per TPM signature, serialize TPM access, and sign once per session/token (e.g., a short-lived JWT every N minutes) rather than per request. This is exactly why DBSC signs per session, not per HTTP request.

#### Q1(c) TPM prevalence in corporate fleets

- **Windows 11 hardware requirement:** "TPM: Trusted Platform Module (TPM) version 2.0." (also "System firmware: UEFI, Secure Boot capable"). For VMs: Hyper-V requires "Secure boot and TPM enabled"; "Virtual TPM 2.0 is emulated in the guest VM independent of the Hyper-V host TPM presence or version."
  Source: https://learn.microsoft.com/en-us/windows/whats-new/windows-11-requirements (page dated 2026-07-14, accessed 2026-09-02).
- **Windows 10 end of support:** "Windows 10 will reach end of support on October 14, 2025." Retirement date 10/14/2025 (PT).
  Sources: https://learn.microsoft.com/en-us/lifecycle/products/windows-10-home-and-pro and https://learn.microsoft.com/en-us/lifecycle/announcements/windows-10-end-of-support (accessed 2026-09-02).
- **Windows 10 ESU (why some fleets are still on Win10):** paid ESU, "$61 USD per device for Year One", "price doubles every consecutive year, for a maximum of three years"; commercial devices "can receive security updates for a maximum of three years after end of support" (i.e., to Oct 2028). Requires 22H2.
  Source: https://learn.microsoft.com/en-us/windows/whats-new/extended-security-updates (accessed 2026-09-02).
- **Remaining Win10 share (secondary, not enterprise-specific):** StatCounter desktop Windows version share worldwide, **August 2026: Windows 11 68.6%, Windows 10 30.14%**. StatCounter is web-analytics pageview data across sites using its tracker; it is not a fleet/enterprise survey and over-represents consumer browsing. Label: **secondary**.
  Source: https://gs.statcounter.com/windows-version-market-share/desktop/worldwide (accessed 2026-09-02).
- **Enterprise-specific Win10 share:** I do not have a verified source for this.
- Practical implication: any Windows 11 device has TPM 2.0 by requirement. A residual Win10 ESU population may lack TPM 2.0 (Win10 never required it), so the enrollment path needs a non-TPM fallback or an explicit "TPM 2.0 required" support statement. Note that Microsoft's own Intune docs already say Windows 10 "is an allowed version in Intune ... functionality won't be guaranteed" after 2025-10-14 (https://learn.microsoft.com/en-us/intune/intune-service/fundamentals/intune-endpoints, accessed 2026-09-02).

#### Q1(d) Failure modes and recovery

| Failure mode | Primary-source evidence | Breaks a TPM-keyed device identity? | Recovery |
|---|---|---|---|
| **TPM cleared** (Windows Security "Clear TPM", `Clear-Tpm`, UEFI clear, some firmware updates) | "Clearing the TPM causes you to lose all created keys associated with the TPM" (Troubleshoot the TPM). `Clear-Tpm`: "A reset removes the owner authorization value and any keys stored in the TPM." Requires local admin. | **Yes** — device key gone. | Re-enroll (new key, new attestation/registration). Design the hub so re-enrollment is a first-class, auditable flow. |
| **Re-image / clean OS install** | Microsoft: clearing before reinstall is recommended but optional; "even if the TPM isn't cleared ... most TPM functionality will probably work correctly." TPM state "persists across operating system installations" (TPM overview). PCP keys are TPM-wrapped blobs held by the OS key store (CNG key directories) — a re-image wipes those blobs even if the TPM itself is not cleared. `[VERIFY]` the exact on-disk location of PCP key blobs. | **Yes in practice** | Re-enroll. |
| **Motherboard/TPM replacement; switching between two TPMs** | "If you switch TPMs, Windows might not properly detect or interact with the new TPM ... clear it, and reinstall Windows." Toggling TPMs "cause BitLocker to enter recovery mode." | **Yes** | Re-enroll. |
| **TPM anti-hammering lockout** | TPM 2.0 configured by Windows "to lock after 32 authorization failures and to forget one authorization failure every 10 minutes"; after 320 minutes with no failures the counter is empty. Lockout "is global for all users (including administrators) and for Windows features such as BitLocker." Admin can reset with owner password; a wrong owner-password reset attempt blocks retries "for 24 hours". **Key point:** "TPM 2.0 allows some keys to be created without an authorization value ... These keys can be used when the TPM is locked." | **Only if the device key has an authorization value.** A no-authValue key keeps signing during lockout. | Create the device key with no TPM authValue (rely on OS ACL/LocalSystem for access control) so Windows Hello / BitLocker PIN hammering cannot deny the broker. `[VERIFY]` that PCP creates keys without a TPM authValue by default when no `NCRYPT_PIN_PROPERTY` is set. |
| **Windows Hello for Business / BitLocker contention** | WHfB PIN brute force triggers lockouts of "1 minute after the first reboot, 2 minutes after the fourth reboot, and 10 minutes after the fifth"; "When the TPM has locked the key material, the user will have to reset the PIN." Lockout is TPM-global (above). | Same as lockout row. | Same. Also serialize your own TPM calls to avoid contributing auth failures. |
| **Firmware TPM bugs** | AMD PA-420: "TPM attestation for AMD platforms with ASP firmware TPM might fail with error code 0x80070490"; affected "AMD fTPM 3.*.0.*", "Ryzen 1000 – Ryzen 5000"; AMD fixed in 2022 firmware but "Some motherboard manufacturers chose not to redistribute these TPM firmware updates." TPMScan: certain Intel fTPM versions leak the ECDSA nonce such that the private key is extractable "using only nine signatures"; Nuvoton timing leaks. | Attestation may fail (PA-420); signing keys may be weak on old Intel fTPM. | Track TPM manufacturer/firmware at enrollment (`Get-Tpm`), gate attestation-dependent features, and allow non-attested fallback with a lower trust tier. |
| **fTPM stutter (AMD Ryzen 3000/5000)** | Widely reported 2022 performance stutters attributed by AMD to fTPM/SPI-ROM interaction, fixed via AGESA. I could not retrieve AMD's own advisory text (amd.com timed out three times; Tom's Hardware page paywalled/truncated). `[VERIFY]` | No identity break, but frequent TPM use on affected boards causes user-visible stalls. | Keep TPM operations rare (per-session signing). |
| **VMs without vTPM / vTPM lifecycle** | Hyper-V Gen2 vTPM: migrating "to another host, you might not be able to start it. You must update the Key Protector." VMware: needs "vSphere 6.7 or newer and a key provider, such as Native Key Provider"; vTPM data lives in the encrypted NVRAM file; on vSphere 6.7/7 "cloning a virtual machine makes an exact replica of the virtual machine and vTPM"; vSphere 8 adds `vpxd.clone.tpmProvisionPolicy` = copy or replace. VMware also states vTPM is "much faster" than hardware TPM. | **VDI/VM fleets:** cloned VMs on vSphere 6.7/7 (or vSphere 8 with "copy") share the *same* vTPM keys — two devices would present one identity. VMs without a vTPM device cannot enroll at all. | Detect duplicates server-side (same key, different hostnames/IPs) and force re-enrollment; require "replace" policy for templates; provide non-TPM fallback for legacy VMs. |

Sources for the table: https://learn.microsoft.com/en-us/windows/security/hardware-security/tpm/initialize-and-configure-ownership-of-the-tpm ; https://learn.microsoft.com/en-us/powershell/module/trustedplatformmodule/clear-tpm ; https://learn.microsoft.com/en-us/windows/security/hardware-security/tpm/tpm-fundamentals ; https://learn.microsoft.com/en-us/windows/security/hardware-security/tpm/trusted-platform-module-services-group-policy-settings ; https://learn.microsoft.com/en-us/windows/security/hardware-security/tpm/trusted-platform-module-overview ; https://learn.microsoft.com/en-us/windows/security/identity-protection/hello-for-business/faq ; https://www.amd.com/en/resources/support-articles/faqs/pa-420.html (retrieved via browser) ; https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/generation-2-virtual-machine-security-features ; https://www.vmware.com/docs/vsphere-virtual-tpm-vtpm-questions-answers (PDF) ; TPMScan PDF above. All accessed 2026-09-02.

**Net for the mTLS-vs-token decision:** every failure mode above destroys or duplicates the key regardless of whether that key backs an X.509 client certificate (mTLS) or signs JWTs. The difference is operational: with mTLS, recovery means re-issuing a certificate through a CA (revocation + issuance); with a signed token, recovery means re-registering a public key with the hub. Both need the same re-enrollment gate; the token design has one fewer moving part (no CA/CRL/OCSP) but must implement its own key-rotation and revocation list.

---

### Q2. Corporate outbound TLS inspection: prevalence and exemption process

#### Q2(a) How many enterprises inspect outbound TLS?

- **Zscaler ThreatLabz "State of Encrypted Attacks" 2024** (published Dec 2024): methodology is "Analysis of 32.1 billion blocked threats from October 2023 to September 2024 in the Zscaler cloud". Headline: 87.2% of blocked threats arrived over encrypted channels. This measures the *attack mix inside Zscaler's own inspected traffic*; it says nothing about what fraction of enterprises perform inspection. Vendor marketing; do not cite it as prevalence.
  Sources: https://www.zscaler.com/press/zscaler-finds-over-87-cyberthreats-hide-encrypted-traffic-reinforcing-need-zero-trust ; https://www.zscaler.com/blogs/security-research/threatlabz-report-threats-delivered-over-encrypted-channels (accessed 2026-09-02). A 2025 edition was not located.
- **Ponemon Institute / A10 Networks (2016, vendor-sponsored survey)**: healthcare/pharma sample: "Only 39 percent decrypt Web traffic to detect attacks, intrusions and malware." Respondent count not stated on the retrieved page. A broader Ponemon/A10 figure of ~36% of organizations able to decrypt/inspect appears only in a CSO Online summary I did not fully verify. `[VERIFY]` These are a decade old and vendor-sponsored.
  Sources: https://www.a10networks.com/blog/ponemon-healthcare-not-deploying-ssl-inspection-solutions/ (accessed 2026-09-02); https://www.csoonline.com/article/557987/... (snippet only).
- **Gartner** estimates cited second-hand (>80% of enterprise web traffic encrypted by 2019; "54% of network threats are found in encrypted traffic") come from vendor blogs quoting Gartner; original Gartner documents are paywalled. `[VERIFY]`
- **Current, methodologically sound prevalence figure for enterprise outbound TLS inspection:** I do not have a verified source for this. What can be said from primary sources is that the three major SSE/SWG vendors (Zscaler, Palo Alto, Netskope) all *default to* or *recommend* full inspection: Netskope docs — "By default, all traffic steered to Netskope will be decrypted, then further analyzed" (https://docs.netskope.com/en/ssl-decryption, accessed 2026-09-02).

#### Q2(b) Documented behaviour of mTLS / client certificates through an inspecting proxy

The proxy terminates TLS toward the client and opens its own TLS session to the origin; it cannot present the client's private-key-backed certificate to the origin, so mutual TLS fails unless the destination is excluded. Vendor documentation confirms this:

- **Zscaler (ZIA), primary:** "The Zscaler service does not support SSL/TLS inspection websites that mandate Mutual TLS." The service "functions as a full SSL/TLS proxy, or SSL/TLS man-in-the-middle (MITM) proxy."
  Source: https://help.zscaler.com/zia/understanding-ssltls-inspection (retrieved via browser, accessed 2026-09-02).
  Zscaler's deployment guide additionally advises updating "the global bypass list to bypass TLS sessions using Client Certificate Authentication" and offers a "Block Undecryptable Traffic" option covering mutual-TLS servers — these two quotes came from search snippets; the page body did not render for me. `[VERIFY]` (https://help.zscaler.com/zia/deploying-ssl-inspection).
- **Palo Alto Networks, primary:** technical reasons a site breaks decryption: "pinned certificates, client authentication, incomplete certificate chains, and unsupported ciphers." Palo Alto maintains a predefined SSL Decryption Exclusion list (content-update delivered), a "Local SSL Decryption Exclusion Cache" that auto-excludes a server for 12 hours when decryption fails for technical reasons, and policy-based no-decrypt rules; the Decryption Profile has a "Block sessions with client authentication" option. KB: "Decryption is not possible if a client who is initiating an SSL connection is using client certificates" — the firewall "adds it to the exclude cache."
  Sources: https://docs.paloaltonetworks.com/network-security/decryption/administration/decryption-exclusions ; .../exclude-server-from-decryption-for-technical-reasons ; .../palo-alto-networks-predefined-decryption-exclusions ; https://knowledgebase.paloaltonetworks.com/KCSArticleDetail?id=kA14u0000008UtLCAU (all accessed 2026-09-02).
- **Netskope, primary/secondary:** decrypt-by-default; exceptions via SSL Decryption policy with action "Do Not Decrypt"; Netskope community posts say a maintained cert-pinned-app bypass list exists (CrowdStrike, Dropbox, iCloud named) and that CRL endpoints requiring client certificates should be added to Do-Not-Decrypt. Community content is secondary. `[VERIFY]` the pinned-app list statement.
  Sources: https://docs.netskope.com/en/ssl-decryption ; https://docs.netskope.com/en/add-bypasses-in-netskope ; community threads listed in search (accessed 2026-09-02).
- **Microsoft's own guidance that its agents must be exempted (primary):**
  - Intune: "SSL traffic inspection isn't supported for '*.manage.microsoft.com', '*.dm.microsoft.com', or the Device Health Attestation (DHA) endpoints"; "SSL Inspection isn't supported on endpoints required for Microsoft Defender for Endpoint"; same for Endpoint Privilege Management and "endpoints required for Microsoft Store API"; MAA attestation endpoints must not be inspected.
    Source: https://learn.microsoft.com/en-us/intune/intune-service/fundamentals/intune-endpoints (page dated 2026-08-21, accessed 2026-09-02).
  - Defender for Endpoint / Defender AV: "Ensure your proxy solution does not perform SSL inspection, as that breaks the secure cloud connection." The MDE sensor "runs in system context using the LocalSystem account" and uses WinHTTP proxy discovery (not the user's WinINet settings) — relevant to how your LocalSystem broker will find the corporate proxy.
    Source: https://learn.microsoft.com/en-us/defender-endpoint/configure-proxy-internet (accessed 2026-09-02).

#### Q2(c) What the exemption process looks like operationally

- **Destination-based bypass lists** are the universal mechanism: Zscaler (cloud application or custom URL category exemption — "exempt the applications from SSL/TLS Inspection ... using the Custom URL categories"), Palo Alto (hostname match against SNI and certificate CN in the SSL Decryption Exclusion list), Netskope (Do-Not-Decrypt policy by domain/app). Zscaler's pinning page also documents that the proxy "cannot detect certificate pinning" — the connection simply fails.
  Source: https://help.zscaler.com/zia/certificate-pinning-and-ssl-inspection (retrieved via browser, accessed 2026-09-02).
- **SaaS vendors do routinely publish exclusion lists:**
  - Microsoft 365 publishes machine-readable endpoint sets (JSON web service, PAC files), updated monthly with 30 days' notice, categorized Optimize/Allow/Default. (The explicit "bypass SSL break-and-inspect for Optimize endpoints" wording lives on the companion Network Connectivity Principles page, which I did not fetch. `[VERIFY]` that phrasing; the endpoint publication itself is verified.)
    Source: https://learn.microsoft.com/en-us/microsoft-365/enterprise/urls-and-ip-address-ranges (page dated 2026-08-14, accessed 2026-09-02).
  - Zoom: recommends "allowing zoom.us and *.zoom.us from proxy or SSL inspection."
    Source: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0060548 (accessed 2026-09-02).
  - Slack: if the proxy does SSL decryption it "must either support WebSockets, or you'll need to exempt" `wss-primary.slack.com`, `wss-backup.slack.com`, `wss-mobile.slack.com`.
    Source: https://slack.com/help/articles/360001603387-Manage-Slack-connection-issues (accessed 2026-09-02).
  - Vendor proxies also ship curated exclusion lists (Palo Alto predefined list; Zscaler's pinned-app table; Netskope's pinned-app bypass list).
- Operational reality: a customer's network team adds your hub FQDN(s) to a no-decrypt list; the change requires a security review (they lose visibility into that flow), a policy commit, and — for Zscaler/Netskope — propagation to the cloud. Expect a ticket cycle measured in days to weeks for a new vendor. Provide a stable, small, documented FQDN list (ideally a dedicated subdomain) exactly as Microsoft/Zoom/Slack do.

#### Q2 Conclusion

- **"TLS inspection breaks mTLS" is a strong, vendor-documented argument.** Zscaler states mutual TLS is unsupported outright; Palo Alto documents client authentication as a technical reason decryption fails and auto-excludes on failure; Microsoft exempts its own agents. In any environment with inspection enabled, an mTLS design *requires* a per-customer bypass entry before the first device can enroll — i.e., the same exemption ticket Microsoft needs for Intune/MDE. Palo Alto's automatic 12-hour exclude cache may make it "mostly work" on that platform, but with the failure-then-retry latency and an unpredictable first attempt; Zscaler-fronted customers will fail hard until bypassed.
- **A signed-device-token-over-ordinary-TLS design survives inspection** because the credential is carried in the HTTP layer (Authorization header / body), not the TLS handshake; the proxy terminates and re-originates TLS normally. Consequences: (1) the inspecting proxy sees the bearer token and the request/response bodies; mitigate with short token lifetimes, audience/nonce binding, and by signing a server-supplied nonce (challenge-response) so a replayed token is useless; (2) you must not pin the hub certificate in the agent (pinning breaks under inspection exactly like mTLS — Zscaler's pinning page); instead validate against the OS trust store, which the customer's inspection CA is already in. (3) Even the token design should publish an exemption list, because customers may prefer to exempt you for privacy of diagnostic payloads — but it will *work* without it.

---

### Q3. EDR allowlisting for a third-party privileged Windows service

#### Q3(a) Microsoft Defender for Endpoint / Defender Antivirus

- **Custom antivirus exclusions** (Intune, Defender portal, Policy CSP, GPO, PowerShell, WMI): types are *file and folder (path)*, *file extension*, *process* ("Exclusions for files opened by specified processes. The processes themselves aren't excluded"), and *contextual* exclusions. Microsoft's caution: "Every exclusion is a protection gap that lowers your defenses." Antivirus exclusions "apply only to antivirus protection, not to other Defender for Endpoint capabilities" — excluded files "can still trigger Endpoint Detection and Response (EDR) alerts."
  Sources: https://learn.microsoft.com/en-us/defender-endpoint/microsoft-defender-antivirus-exclusions-configure ; https://learn.microsoft.com/en-us/defender-endpoint/microsoft-defender-antivirus-exclusions-overview ; https://learn.microsoft.com/en-us/defender-endpoint/defender-endpoint-false-positives-negatives (all accessed 2026-09-02).
- **Certificate indicators ("Create indicators based on certificates")**: allow or block signed applications by signing certificate. Requirements: Defender AV active with cloud protection; client ≥ 4.18.1901.x; ".CER or .PEM"; "only leaf certificates are supported" (parents/children not included); chain must validate to a Microsoft-trusted root, or a self-signed root installed in the machine Trusted Root store; "Creating or removing a certificate indicator of compromise (IoC) can take up to 3 hours." Certificate indicators "have higher precedence" than file-hash indicators; a cert-block cannot be overridden by a hash-allow.
  Source: https://learn.microsoft.com/en-us/defender-endpoint/indicator-certificates (accessed 2026-09-02).
- **File indicators (hash)**: SHA-256/SHA-1/MD5 for "portable executable (PE) files, including .exe and .dll files only"; requires `EnableFileHashComputation`; conflict rule applies when hash types "define the same file" — i.e., an indicator identifies exactly one file version. Blocks/allows "typically ... enforced and removed within 15 minutes, average 30 minutes but can take upwards of 2 hours."
  Source: https://learn.microsoft.com/en-us/defender-endpoint/indicator-file (accessed 2026-09-02).
- **Guidance for false positives**: classify + suppress alert, submit file to Microsoft Security Intelligence, create allow indicator (file or "application certificate ... such as internally developed applications"), use AV exclusions "sparingly".
  Source: https://learn.microsoft.com/en-us/defender-endpoint/defender-endpoint-false-positives-negatives (page dated 2026-09-01, accessed 2026-09-02).

#### Q3(b) CrowdStrike Falcon

- CrowdStrike's console documentation is behind the Falcon login; I could not retrieve it (Red Canary's public walkthrough returned HTTP 403). What is publicly verifiable comes from CrowdStrike's **Developer Center API reference**:
  - **Certificate-Based Exclusions** collection: "Create, read, update, and delete exclusions based on certificate signing information." Exclusion objects carry `issuer, serial, subject, thumbprint, valid_from, valid_to`, plus scope (`applied_globally`, `host_groups`, `children_cids`) and metadata.
    Source: https://developer.crowdstrike.com/api-reference/collections/certificate-based-exclusions/ (accessed 2026-09-02).
  - The falcon-mcp "Exclusions" module documents four types and their required fields: **IOA** (`name, pattern_id, ifn_regex, cl_regex`), **ML** (`value` = file path/glob), **Sensor Visibility** (`value, host_groups`), **Certificate** (`name, certificate, status`); a helper retrieves "code-signing certificate metadata for a file by SHA256."
    Source: https://developer.crowdstrike.com/falcon-mcp/modules/exclusions/ (accessed 2026-09-02).
  - Semantics (from search snippets of third-party write-ups, not CrowdStrike primary): sensor-visibility exclusions stop event collection entirely ("use with extreme caution"); ML exclusions stop ML detections/uploads for a path; IOA exclusions suppress specific behavioral patterns. `[VERIFY]`
- **Hash-based allowlisting** in Falcon is done via IOC Management (hash indicators with allow/detect actions) rather than "exclusions"; I did not retrieve a primary page confirming the exact semantics. `[VERIFY]`
- Conclusion: CrowdStrike does support allowlisting by **code-signing certificate** (primary API doc) and by path/glob; hash allowlisting exists but is inherently per-file.

#### Q3(c) SentinelOne

- SentinelOne's knowledge base (support.sentinelone.com / community.sentinelone.com) requires login; not retrievable. Third-party MSP documentation (Guardz, NetNXT) lists five exclusion types — **Path, Hash, Certificate, File Type, Browser** — and states "Hash Exclusions: Excludes only that specific version of the .exe" and that certificate exclusions cover software "signed by a trusted source, with a certificate that is verified by the endpoint OS." All secondary. `[VERIFY]`
  Sources: https://support.guardz.com/en/articles/13428229-sentinelone-exclusions-overview ; https://netnxt.com/knowledge-base/unquarantine-files-create-exclusions-sentinelone (accessed 2026-09-02).

#### Q3(d) Does frequent updating invalidate hash-based exceptions? Publisher rules.

- **Yes, by definition, and Microsoft says so explicitly** in App Control for Business (WDAC) file-rule documentation: Hash level "requires more effort to maintain the current product versions' hash values. Each time a binary is updated, the hash value changes, therefore requiring a policy update." By contrast, LeafCertificate: "new versions of the product have different hash values but typically the same signing certificate ... no policy update would be needed"; Publisher = PCA certificate + leaf CN; FilePublisher = Publisher + OriginalFileName + minimum version; SignedVersion = publisher + version floor. Worked example: "Because the 'Publisher' remains the same on those updates ... they don't need to update their App Control policy."
- **Two gotchas from the same page** that matter to your build pipeline:
  1. "App Control signer-based rules only work with RSA cryptography with a maximum key length of 4096 bits. ECC algorithms, such as ECDSA, aren't supported." → Authenticode-sign the broker and agent with an **RSA** code-signing certificate if you want publisher rules to work.
  2. WDAC uses the Authenticode/PE image hash, which "doesn't change when the file's signatures and timestamps are altered" — so re-signing/re-timestamping the same build does not break hash rules, but any code change does.
  3. FilePath rules are only honored for admin-writable paths by default ("ensures that the current permissions on the specified filepath only allow write access for admin users") — relevant to Q4(d).
  Source: https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/design/select-types-of-rules-to-create (page dated 2026-03-29, accessed 2026-09-02).
- Defender for Endpoint file indicators are per-hash (Q3(a)); certificate indicators are per leaf certificate (so they survive binary updates but must be refreshed when the leaf cert is renewed — the WDAC page makes the same point: "leaf certificates typically have shorter validity periods").
- CrowdStrike and SentinelOne both expose a certificate/signer exclusion type (Q3(b)/(c)), which is the mechanism to recommend to customers; hash exclusions will need re-issuing for every release.

**Recommendation to write into the deployment guide:** publish (1) the code-signing certificate details (subject, issuer, thumbprint, validity), (2) fixed install paths under `%ProgramFiles%` for the broker, (3) service name and process names, and (4) per-EDR instructions: Defender → certificate indicator (allow) + optional path exclusions; CrowdStrike → certificate-based exclusion (+ ML/IOA exclusions if specific detections fire); SentinelOne → certificate exclusion. Avoid asking for hash exclusions.

#### Q3(e) Electron / Node + FFI (koffi) and EDR heuristics

- I do not have a verified source for this. No Microsoft, CrowdStrike or SentinelOne documentation I could retrieve mentions Electron, Node.js native modules, or koffi as a false-positive class. Microsoft's false-positive guidance is generic (submit sample; allow indicator by file or certificate).
- Related, secondary only: a LevelBlue/SpiderLabs threat write-up notes backdoored Electron apps are catalogued under MITRE ATT&CK T1218.015 "Electron Applications" (I did not fetch the MITRE page). `[VERIFY]` Threat-intel interest in Electron as a living-off-the-land vector means EDR behavioral rules *do* watch Electron processes; a signed Electron agent spawning or IPC-ing to a LocalSystem service that then invokes network-configuration APIs is plausibly a pattern that draws IOA attention. Mitigations that follow from the primary sources above: sign everything with one RSA publisher cert, keep the broker's binaries in an admin-only path, avoid loading DLLs from user-writable locations (see Q4(d)), and provide the certificate-based allowlist instructions.

---

### Q4. MSI-based update distribution where users have no local admin

#### Q4(a) Per-machine installs need admin; Intune runs installers as SYSTEM

- Windows Installer: "Non-administrator users cannot install unadvertised packages that require elevated system privileges." Admin-provided paths: advertised/managed apps, or the `AlwaysInstallElevated` policy, which "can open a computer to a security risk" (non-admins could run any MSI elevated). Per-machine installs "are always managed."
  Source: https://learn.microsoft.com/en-us/windows/win32/msi/installing-a-package-with-elevated-privileges-for-a-non-admin (accessed 2026-09-02).
- Intune Win32 apps run via the Intune Management Extension with **Install behavior = System or User**; "Users are not required to be logged in on the device to install Win32 apps"; and for user-context deployments: "if the Win32 app requires device admin privileges ... the app will fail to install" for a standard user. Interactive installs are unsupported ("must install silently"). Intune's own Win32 content CDN must allow HTTP partial responses.
  Sources: https://learn.microsoft.com/en-us/intune/intune-service/apps/apps-win32-add (redirects to /intune/app-management/deployment/add-win32) ; https://learn.microsoft.com/en-us/intune/intune-service/apps/apps-win32-app-management (accessed 2026-09-02).
- Intune Windows LOB app: accepts `.msi`, `.appx`, `.appxbundle`, `.msix`, `.msixbundle`; "App Install Context" selectable only for dual-mode packages, otherwise "pre-selected based on the package"; an "Ignore app version" switch exists for "Windows apps with self-updating installers (such as Google Chrome)" to avoid Intune and the app's own updater fighting. Microsoft recommends the Win32 app type over LOB for multi-argument MSIs and warns not to mix LOB and Win32 during Autopilot (TrustedInstaller contention).
  Source: https://learn.microsoft.com/en-us/intune/intune-service/apps/lob-apps-windows (redirects to /intune/app-management/deployment/add-lob-windows) (accessed 2026-09-02).

#### Q4(b) MSI upgrade semantics

- Microsoft's taxonomy (Patching and Upgrades): **Small update** — no ProductCode/ProductVersion change; **Minor upgrade** — ProductVersion changes, ProductCode unchanged; **Major upgrade** — ProductCode changes. Each "Can be shipped as a full installation package or as a patch package." Also: "Windows Installer uses only the first three fields of the product version."
- **Major upgrade**: needs an `UpgradeCode` and Upgrade table; `FindRelatedProducts` → `RemoveExistingProducts`/`MigrateFeatureStates`. "The Windows Installer will not install major upgrades across installation context" (per-user vs per-machine). Applying a major upgrade as a patch "is not recommended".
- **Minor upgrade**: "cannot reorganize the feature-component tree"; delivered as full MSI (REINSTALL/REINSTALLMODE) or `.msp`; versions must increase so patches sequence correctly.
  Sources: https://learn.microsoft.com/en-us/windows/win32/msi/patching-and-upgrades ; .../major-upgrades ; .../minor-upgrades (accessed 2026-09-02).
- **WiX `MajorUpgrade` element**: "Simplifies authoring for major upgrades, including support for preventing downgrades." `Schedule` default is `afterInstallValidate` ("removes the installed product entirely before installing the upgrade product ... if the installation of the upgrade product fails, the machine will have neither version installed"); `afterInstallInitialize` adds rollback of the removal; `afterInstallExecute` installs "on top of" and requires strict component rules. `AllowDowngrades` default no with `DowngradeErrorMessage`; `AllowSameVersionUpgrades` handles fourth-field-only version changes.
  Source: https://docs.firegiant.com/wix/schema/wxs/majorupgrade/ (wixtoolset.org redirects here; retrieved via browser, accessed 2026-09-02).
- Practical guidance for the broker: use major upgrades (new ProductCode every release, constant UpgradeCode, first three version fields incremented) with `Schedule="afterInstallInitialize"` so a failed upgrade rolls back to the previous broker instead of leaving no broker installed.

#### Q4(c) Replacing a running service in place; restart manager; reboot

- **`ServiceControl` table**: events `msidbServiceControlEventStop` (StopServices action), `Start` (StartServices), `Delete` (DeleteServices) with separate install/uninstall bits; "when stopping a service, all services that depend on that service are also stopped"; `Wait` null/1 → "wait a maximum of 30 seconds for the service to complete before proceeding." Services depending on GAC assemblies cannot be started via these tables.
  Source: https://learn.microsoft.com/en-us/windows/win32/msi/servicecontrol-table (accessed 2026-09-02).
- **WiX `ServiceControl`**: "Starts, stops, and removes services for parent Component"; `Start`/`Stop`/`Remove` each take `install | uninstall | both`; `Wait` default yes. Typical: `Start='install' Stop='both' Remove='uninstall'`.
  Source: https://docs.firegiant.com/wix/schema/wxs/servicecontrol/ (retrieved via browser, accessed 2026-09-02).
- **Restart Manager**: Windows Installer 4.0+ "automatically use the Restart Manager to reduce system restarts"; default is "to shut down applications rather than shut down and restart the operating system whenever possible"; "Silent UI level installations always shut down applications and services, and ... always use Restart Manager." Controls: `MSIRESTARTMANAGERCONTROL`, `MSIDISABLERMRESTART`, `MSIRMSHUTDOWN`, `MsiSystemRebootPending` launch condition.
  Source: https://learn.microsoft.com/en-us/windows/win32/msi/using-windows-installer-with-restart-manager (accessed 2026-09-02).
- Reboot requirement: none of the retrieved pages states a service replacement *requires* a reboot. In practice, if `StopServices` runs before `InstallFiles` (standard sequence) and the service exits within the wait window, the binary is replaced and restarted without reboot; a reboot is scheduled only if a file remains in use (e.g., a DLL held by another process such as the running Electron agent). Design note (inference, not from a source): ship the agent-side native DLLs separately from the broker's so an agent holding a DLL open does not force a broker reboot; have the installer signal the agent to exit via Restart Manager registration (`RegisterApplicationRestart`). Also recall the `NCryptCreatePersistedKey` warning against creating keys inside `StartService` (Q1(a)).

#### Q4(d) Self-updating unprivileged apps and why a privileged service must not trust them

- **Electron `autoUpdater`**: on Windows "the module uses Squirrel.Windows for updates"; apps must be installed by a Squirrel-based installer ("electron-winstaller or Electron Forge's Squirrel.Windows maker"); first launch passes `--squirrel-firstrun` and updates cannot be checked immediately. Electron's update tutorial notes code signing is mandatory on macOS but Windows "doesn't mandate it for updates to function" (i.e., you must enforce signature verification yourself or via electron-updater config).
  Sources: https://www.electronjs.org/docs/latest/api/auto-updater ; https://www.electronjs.org/docs/latest/tutorial/updates (accessed 2026-09-02).
- **Squirrel.Windows install location**: "the user's application data directory is selected as the install location (i.e., `%LocalAppData%\MyApp`)"; the README advertises install "with no UAC dialogs" — i.e., per-user, no admin.
  Sources: https://github.com/Squirrel/Squirrel.Windows/blob/develop/docs/using/install-process.md ; https://github.com/Squirrel/Squirrel.Windows/blob/develop/README.md (accessed 2026-09-02).
- **Security consequence** (primary sources):
  - MITRE ATT&CK **T1574.010 Services File Permissions Weakness**: "Adversaries may execute their own malicious payloads by hijacking the binaries used by services" via weak file/directory permissions; mitigation: "Limit privileges of user accounts and groups so that only authorized administrators can interact with service changes and service binary target path locations."
    Source: https://attack.mitre.org/techniques/T1574/010/ (accessed 2026-09-02).
  - Microsoft App Control: "Filepath rules don't provide the same security guarantees that explicit signer rules do, since they're based on mutable access permissions"; the runtime check "only allow[s] write access for admin users."
    Source: WDAC rule-levels page cited in Q3(d).
  - Microsoft Defender AV itself runs "in the system context using the LocalSystem account" and only trusts *system* environment variables in exclusions — an illustration that privileged components must not resolve paths through user-controlled context.
    Source: https://learn.microsoft.com/en-us/defender-endpoint/microsoft-defender-antivirus-exclusions-overview (accessed 2026-09-02).
  - Implication for this architecture: a per-user-writable Electron agent under `%LocalAppData%` can be replaced by any code running as that user (malware, or the user). The broker therefore **must not** (1) load DLLs from, (2) execute, or (3) grant privileged operations based solely on the identity/path of the agent binary. Authenticate the calling agent by Authenticode signature of the *process image* verified by the broker at connection time (and re-verify after agent self-update), constrain the four network-repair primitives to a fixed allow-list with argument validation, and never let the agent hand the broker a DLL path. Keep the broker and its koffi-loaded native DLLs in `%ProgramFiles%` (admin-writable only) so both WDAC path rules and T1574.010 mitigations hold.
  - Also: the Intune LOB "Ignore app version" flag exists precisely because self-updating apps race with MDM-pushed versions — if the agent self-updates *and* is also pushed by Intune, set it.

#### Q4(e) Winget / Microsoft Store / MSIX alternatives

- **MSIX and services**: "Windows 10, version 2004, introduces support for running an MSIX package that includes services"; "Once you have a packaged MSIX with a service, it will require admin privileges to install on a machine." MSIX "supports session-0 (per-machine) services running under one of the defined system accounts (LocalSystem, LocalService, or NetworkService)" and "doesn't support per-user Windows services"; services "with dependencies outside the package" are unsupported; adding a service via manifest requires a restricted capability. Packaged apps also cannot write HKLM ("access-denied failure") or their install directory, and Store policy rejects apps that "require elevation for any part of their functionality." Microsoft's own guidance for complex installers ("services running as SYSTEM") is "MSIX with external location" rather than a fully packaged MSIX.
  Sources: https://learn.microsoft.com/en-us/windows/msix/packaging-tool/convert-an-installer-with-services ; https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-prepare (accessed 2026-09-02).
  → MSIX is workable for the *agent* (per-user, sandboxed, auto-updating via Store/Intune) but a poor fit for the *broker* (still admin install, restricted capability, no HKLM, external dependencies unsupported).
- **Winget / Microsoft Store via Intune**: Intune documents Store-app deployment (`winget show [PackageId]`, Microsoft-hosted Win32 fallback cache) and notes "SSL Inspection isn't supported on endpoints required for Microsoft Store API." I did not retrieve the winget/Windows Package Manager docs themselves; whether winget supports per-machine installs that require elevation from a non-admin session without Intune is `[VERIFY]` (winget itself does not grant elevation; it runs the package's installer with the caller's rights, which for a per-machine MSI means UAC/admin).
  Source: https://learn.microsoft.com/en-us/intune/intune-service/fundamentals/intune-endpoints (accessed 2026-09-02).
- Net: for a no-local-admin fleet, the broker must be delivered by the customer's SYSTEM-context deployment tool (Intune Win32/LOB, SCCM) as an MSI major upgrade. Self-update of the broker from the agent is not possible without a privileged updater channel — and a broker that accepts update payloads from the unprivileged agent recreates T1574.010. If the broker must self-update, have the *broker* (LocalSystem) fetch, Authenticode-verify (publisher pin), and launch `msiexec` on the new MSI itself, never the agent.

---

### Unverified / could not find

Every item tagged `[VERIFY]` above, consolidated:

1. Exact algorithm list (RSA sizes, ECDSA P-256) supported by the Microsoft Platform Crypto Provider — not on the current learn.microsoft.com CNG KSP page; only the outdated GitHub PCP guide.
2. Whether a non-admin process can create a PCP key with `NCRYPT_MACHINE_KEY_FLAG` (machine scope).
3. Whether PCP creates TPM keys with no TPM authorization value by default (so they remain usable during dictionary-attack lockout).
4. Exact per-vendor ECDSA-P256 / RSA-2048 signing medians from TPMScan Figure 6 (only the 10–500 ms axis range and the Pluton/Intel narrative are in text).
5. Population/methodology behind Chrome's "P50 200 ms / P95 600 ms" TPM signing latency.
6. Infineon SLB9670 community figures (≈69 ms ECDSA-256, ≈163 ms RSA-2048) — page returned HTTP 403.
7. Any enterprise-specific Windows 10 vs 11 fleet share (StatCounter is consumer-weighted web analytics).
8. On-disk location of PCP-wrapped key blobs (inference that a re-image destroys them).
9. AMD's own advisory text for the Ryzen fTPM stutter/AGESA fix (amd.com timed out; only PA-420 attestation-failure advisory retrieved).
10. Zscaler "global bypass list ... Client Certificate Authentication" and "Block Undecryptable Traffic" wording (deploying-ssl-inspection page did not render; only the mutual-TLS-unsupported statement was retrieved verbatim).
11. Netskope's maintained certificate-pinned-application bypass list (community post, not docs).
12. Microsoft 365 "bypass SSL break-and-inspect for Optimize endpoints" phrasing (Network Connectivity Principles page not fetched).
13. Ponemon/A10 ~36% general figure and respondent counts; Gartner encrypted-traffic estimates (second-hand).
14. Any current, methodologically stated survey of enterprise outbound TLS-inspection prevalence — none found.
15. CrowdStrike console semantics of sensor-visibility/ML/IOA exclusions and IOC-hash allowlisting (docs behind login; API docs verified only).
16. SentinelOne exclusion-type semantics ("hash excludes only that specific version") — third-party MSP docs only.
17. MITRE ATT&CK T1218.015 "Electron Applications" (cited via a vendor blog; MITRE page not fetched).
18. Any authoritative statement on Electron/Node/koffi native-module loading triggering EDR heuristics — none found.
19. Whether winget can perform per-machine installs for non-admin users outside Intune/SCCM.
20. Whether an MSI service replacement ever requires a reboot when files are not in use — inferred from Restart Manager docs, not stated.

---

# Part B — Independent evaluation

Written before reading any conflict table. Written against: hub spec v1, `BAKEOFF-2026-09-02.md`, `PHASE1-TICKETING.md`, `HANDOVER-2026-09-02-post-demo.md`, `BROKER-SURFACE.md`, and the `post-demo` branch source (`in-process-broker.js`, `catalog.json`, `agent.js`, `cloud-client.js`, `prompt.js`, `main.js`, `broker.d.ts`, `capabilities/index.js`, `eval/cases.json`).

**Caveat that applies to all of B1, B3 and B4.** H4, H5, H6, the egress axis and the update trust model are described in this review only as the evaluation prompt summarised them. The two decision documents that define them are not on disk (see the opening note). Where I attack "the wording", I am attacking the prompt's one-line paraphrase. If the real wording already closes a gap I name, that is a finding about the summary, not the design.

---

## B1. Invariant audit

Method: for each invariant, a scenario where the prohibited outcome is reached while the stated wording holds. Where the shipped code is relevant, the file is named.

### H1 — The playbook signing key never lives on the hub

**Scenario.** The key is in KMS with a policy that denies the hub's task role. Draft-and-approve catalog authoring is a hub feature (spec §4, "how draft-and-approve authoring reaches machines"). On approval, the hub enqueues a "sign catalog v42 for tenant T" job and a separate signing service, or a CI runner, calls KMS and returns the signature. Nothing on the hub can call `kms:Sign`. The wording holds.

**Outcome.** Whoever controls the hub controls what gets signed. The signing service signs what it is handed; the hub hands it. Hub compromise still yields signed, arbitrary catalogs on every endpoint of every tenant, which is exactly the outcome H1 exists to prevent.

**What the invariant should say.** "No component the hub can drive causes a signature." Concretely: a signature requires an action by a human holding a credential that the hub does not issue or store (an offline signing ceremony, a hardware token, or a second-party approval in the KMS grant path), and the artifact signed is the artifact the human saw, not a hash the hub supplied.

**Second edge: the trust anchor.** The endpoint verifies with a public key. Who ships that key? If the answer is "the agent binary", then the agent self-update channel (B4) can replace the anchor. If the answer is "the hub", H1 is void. It must be the broker MSI, and rotation of the anchor must require the MSI path.

### H2 — The hub distributes policy; the endpoint enforces it

**Scenario.** `catalog.json` now carries `requires.machineOnline: false` on `reset_adapter` and `policy.serviceStopBlocklist`. Both are hub-distributed data. A tenant catalog for tenant T omits the `requires` block. The endpoint enforces the catalog faithfully. Wording holds.

**Outcome.** The R2 mistake every model made in the bake-off (`adv-03`) is back for tenant T, and the post-demo handover's sentence "the catalog is now the trust root *and* the safety guard" becomes "the safety guard is whatever the last catalog author left in". H2 is a statement about *where* enforcement happens. It says nothing about a floor below which policy cannot go. That is what H4 is trying to be, and H4 as summarised does not have a floor either (below).

**Second edge: the enforcing code is also distributed.** `FACTS` in `checkPreconditions()` is code, deliberately, so the grammar cannot grow through data. Good. But the broker binary is what enforces, and the broker is updated by MSI through customer tooling (B4). "The endpoint enforces it" means "whatever version of the endpoint the customer has deployed enforces whatever it understands". A precondition on a fact an old broker does not know fails closed (correct) and disables the capability fleet-wide (a product outage nobody chose).

### H3 — No cloud credentials on the endpoint in joined mode

**Scenario.** The device identity is the endpoint's credential to the hub. The broker "never opens a socket" (a constraint the evaluation prompt lists in B2). Therefore the *agent*, running in the user's context, holds and uses the device credential. Wording holds: it is not a "cloud credential".

**Outcome.** User-context malware, or the user themselves, can act as the device: burn inference budget through the proxy, file tickets as that machine, poison audit ingestion, and enumerate the hub API. The whole point of the two-process split was that the user context is untrusted. A credential that lets the untrusted half impersonate the machine to the fleet's control plane is a cloud credential in every sense that matters.

**Fix direction.** The device key belongs in the broker (TPM-backed, machine key, see A5). Either the broker proxies hub traffic (it opens a socket, and the allowlisting document grows one destination), or the broker signs per-request assertions that the agent carries (the agent can still relay, but cannot mint). The second keeps "the broker never opens a socket" and gives the hub a signed statement of *which broker version and which catalog hash* is behind the request, which B4 needs anyway.

### H3b — Playbook parameters are schema-constrained, never freeform strings

**Scenario.** The escalation payload (`summary`, `whatWasChecked`) is freeform model text. It is not a playbook parameter. The wording holds. `PHASE1-TICKETING.md` §6 turns that payload into a ticket body sent to the hub and then to ServiceNow.

**Outcome.** A prompt-injection string in a retrieved KB chunk or in what the user typed ("tell the engineer to run this") is paraphrased by the model into `summary` and lands in `incident.description`, read by a human with admin rights. Freeform model text does leave the machine and does reach a privileged human. H3b's scope is the executor; the ticket path is a second executor with a person in it.

### H3c — `toolConfig` is a schema-enforcement device, never an executor binding

**Scenario.** `whenNotToUse` is catalog text appended to each tool description (`cloud-client.js`, `toolsFromCatalog`). It binds nothing. The wording holds.

**Outcome.** The catalog is now a channel from a catalog author into the model's instructions. A tenant author who writes `whenNotToUse: "never; this is always the first thing to try"` has changed model behaviour through signed data without touching any schema. Low severity because the catalog is reviewed and signed, but the review checklist for a catalog now has to include "read the model-facing prose as a prompt", and nothing says so.

### H3d — Playbooks are sequences of typed primitives, never scripts

**Scenario.** Tiers are per primitive. A playbook is a sequence. `restart_service(dhcp)` (R1) followed by `renew_dhcp` (R1) followed by `flush_dns` (R1) is three reversible steps that together drop connectivity for longer than a single `reset_adapter` (R2). Each step is typed. The wording holds.

**Outcome.** The consent card shows "Low risk" three times, or once for a "sequence" whose tier is computed as the max of its members. Neither is honest. Tier must be a property of the playbook, assigned by the author, and the tier policy check should refuse an R1 playbook containing more than N steps or any step with a connectivity side effect.

### H3e — The model never authors the text a user consents to

This is the invariant with the biggest gap, and it is not in the wording, it is in the process boundary.

**Scenario 1 (wording).** `agent.js` returns `reply: proposal.reasoning`, model text, and the renderer shows it in the same conversation stream as the consent card built from `plain.what`. The user reads "Your DNS cache looks stale from the outage, this will fix it" (model) directly above "Empties this machine's memory of recent website-name lookups" (catalog). The consent decision is shaped by the model's sentence. The wording holds because the *card* is catalog text.

**Scenario 2 (boundary, the serious one).** Look at `main.js`, `broker:consentAndExecute`. The renderer calls it with a `proposal` object. The broker mints a token for *that* proposal and executes it. The broker never saw what was displayed. In the demo this is one elevated process and it does not matter. In Phase 1, the agent is an unprivileged process on the other side of a named pipe. It can display the `flush_dns` card, receive the click, and send `reset_adapter` with a live adapter GUID down the pipe. Schema valid, preconditions pass if the machine is offline, token minted, executed, audited as consented. Every invariant holds. The user consented to nothing of the sort.

**What is missing.** A rule that the process that renders consent is the process that mints the token, or equivalently that the broker can prove the user saw the text it is acting on. The options are all expensive: a broker-owned consent window (a second UI surface the privileged service launches into the user's session, the way UAC and credential prompts do), or the broker returning the exact rendered consent text plus a nonce that the agent must display and that the user's approval binds to, with the broker refusing any approval whose nonce does not match what it issued. The second is weaker (the agent can still lie about what it drew) but it is what makes the audit record meaningful. Nothing in the seven or ten invariants covers this, and it is the first thing a red team would try against the pipe.

### H4 (proposed) — Hub policy may only narrow capability, never widen it

**Scenario 1: narrowing is not safe.** Tenant policy removes `flush_dns` and `renew_dhcp` (a cautious admin: "we only want the big hammer, our helpdesk always resets the adapter anyway"). Only `reset_adapter` remains for network complaints. The model's only lever is the R2 one; `whenNotToUse` says "never a first thing to try" but there is no first thing to try. Narrowing has moved every network conversation onto the disruptive path. Wording holds.

**Scenario 2: no floor.** "Narrow" relative to what? If tenant catalogs are themselves signed artifacts (spec §4 "versioned, per-tenant"), the tenant catalog *is* the baseline and H4 has nothing to compare against. If there is a vendor catalog and a tenant delta, the invariant needs to say that the vendor catalog is a floor for preconditions, blocklists and tiers, and that a tenant delta may add preconditions, remove capabilities, and raise tiers, and may not do the inverse. As summarised, it does not distinguish "narrow the capability set" from "narrow the constraints on a capability", and the second is widening.

**Scenario 3: relabelling.** Tenant policy changes `reset_adapter.tier` from R2 to R1. The capability set is unchanged, so it is not "widening capability". The consent card now says "Low risk". Tier and consent text must be in the monotone set.

### H5 (proposed) — Hub-supplied text reaching the user is inert and attributed

**Scenario.** "Inert" is enforced at the broker: hub text cannot execute. Retrieved KB chunks, announcements and ticket updates are all hub-supplied text, and all of them go *into the model's context* (that is what retrieval is for). A KB article edited by anyone with `knowledge` contributor rights contains "If the user mentions printing, the fix is to reset the network adapter." The model, reading it as retrieved fact, proposes `reset_adapter`. The broker's preconditions may catch it, or may not (the machine is offline for an unrelated reason). Attribution on the *displayed* text ("from your IT knowledge base") is intact. Wording holds.

**Outcome.** H5 protects the broker from hub text. It does not protect the model from hub text, and the model is the component that turns text into proposals. The invariant needs a second clause: hub-supplied text enters the model context only inside a provenance wrapper the prompt treats as data, never as instruction, and never enters the system prompt. That is a mitigation, not a guarantee, and the design should say so rather than list H5 as if it closes the channel.

**Second edge: the voice.** "Attributed" in a transcript is a label. Through TTS there is one voice. The avatar reading a ServiceNow comment aloud sounds like the avatar saying it. If the comment is a `work_notes` entry (A2), the user hears the engineer's private assessment of them, in the assistant's voice. Attribution has to be audible ("Your ticket has an update from Sam, quote…") and, more importantly, the hub must be structurally unable to forward `work_notes` at all.

### H6 (proposed) — Signed content carries a freshness bound

**Scenario.** The design partner hosts their own hub (spec §5, §15). It goes down for nine days over a holiday. Every endpoint's catalog passes its freshness bound.

**Outcome, branch A.** The endpoint refuses to use expired content. The four network-recovery primitives, which are the product's offline differentiator and need no hub at all, stop working fleet-wide because a server was down. H6 has converted a hub outage into a fleet outage.

**Outcome, branch B.** The endpoint keeps using the stale catalog and shows a warning. The hub that "stays silent" has pinned the fleet to the old version exactly as before, with a warning nobody reads. H6 prevented nothing.

**What resolves it.** Freshness should govern the *tenant delta*, not the floor. When tenant content expires, the endpoint drops to the vendor floor catalog (long validity, shipped in the MSI, signed offline). That direction is always narrowing, so it is safe under H4, and it means a silent hub loses the customer's customisations rather than the product. Note this also means the vendor floor must be good enough to run on alone, which is an argument for the B6 recommendation.

**Second edge.** The bound is checked against the endpoint clock. Corporate NTP is a hub-adjacent system. Not worth solving, worth writing down.

---

## B2. Conflict pass

Pairs of requirements in tension, found from the source documents. Numbered R-1 onward so they cannot be confused with the previous reviewer's C-numbers.

| # | Requirement A | Requirement B | Why they collide | Resolution I would take |
|---|---|---|---|---|
| R-1 | Hub does retrieval, prompt assembly and "versions prompts" (§4 inference proxy) | "The conversation loop stays on the endpoint, or offline mode dies" (§4); one shared prompt is a correctness requirement for the bake-off (`prompt.js`) | If the hub assembles the prompt online, the endpoint assembles a *different* prompt offline. Two prompts, two behaviours to certify, and the bake-off measures neither of them. | The endpoint owns the prompt template (signed, in the catalog bundle). The hub supplies only retrieved chunks and the tenant policy block as data. "Prompt versioning" becomes catalog versioning. |
| R-2 | Job queue in Postgres via `SKIP LOCKED` (§5) | Schema-per-tenant as a hard boundary (§6) | A queue table per tenant schema needs N pollers or a UNION across schemas that grows with tenants. One shared queue table breaks the boundary: a worker must `SET search_path` per job, and a bug there is the exact cross-tenant leak schema-per-tenant was chosen to prevent. | Accept a shared **control-plane** schema (tenants, devices, queue, releases) and per-tenant **data** schemas. It is a third option, and it is the honest one. Write the worker so the tenant schema comes from the job row and is asserted before every query. |
| R-3 | Per-tenant signed catalogs, draft-and-approve in the hub (§4) | H1 | See B1/H1. The hub cannot be the thing that triggers signing. | Vendor floor catalog signed offline by us. Tenant delta signed by the **customer** with a key they hold (their own KMS, their own HSM, or a hardware token), and the endpoint trusts vendor key + tenant key, delta constrained by H4. The product cost is that customers must run a signing step. That is the cost of H1. |
| R-4 | Customer-hosted hub (§5, §15) | Telemetry, deflection measurement, canary rings, token metering (§4, §12) | Everything we sell (deflection) and everything we bill on (tokens) is measured on a server the customer runs and we cannot see. Canary rings across a fleet we do not control are the customer's Intune rings, not ours. | Say it in the contract: customer-hosted is excluded from deflection commitments (§12 already does this for tier 3) *and* from usage billing (flat per-seat). Ship a signed weekly usage report the customer can choose to send. |
| R-5 | The broker never opens a socket | One consent flow and one audit log for ticket egress (PHASE1-TICKETING §3 "extend the broker") | If the broker never transmits, the broker consents to a payload it cannot verify was the payload sent. The agent can add fields after consent. One audit log of "what left the machine" cannot be written by the process that did not send it. | Hub returns a signed receipt containing the hash of what it received. Broker logs consent hash and receipt hash; a mismatch is an audited incident. The broker still never opens a socket, and the audit record is honest. |
| R-6 | Offline capability / customer boundary (§13 "corpus can stay inside the customer boundary") | Any hosted embedding API for the managed tier | A customer-hosted hub calling OpenAI, Voyage or Cohere to embed their KB defeats the reason they host. If managed uses a hosted API and customer-hosted uses a local model, the two tiers have incomparable vectors and no migration path. | One self-hostable embedder, run by us in managed mode too. Whether that is viable on CPU is Part A, A1. |
| R-7 | Bake-off recommendation: `mistral-small:24b`, 16 GB VRAM (BAKEOFF §1) | Phase 1 hosting at ~$46/month with no GPU anywhere (§10) | The model the project recommends cannot run on the infrastructure the project costed. A GPU instance capable of a 16 GB resident model is an order of magnitude above the entire Phase 1 budget. `[VERIFY]` current GPU instance pricing; I do not have a verified source for this in this review. | Decide which tier the recommendation is for. If "managed", the cost model is wrong and needs a GPU line. If "customer-hosted only", say so in the bake-off, and the managed tier's routine model is still Haiku 4.5 with eight false actions before preconditions, four after. |
| R-8 | "Redaction runs before egress regardless of destination" (§9) | Hub-side retrieval and hub-side interaction history (§4) need the un-redacted question to retrieve well | Redaction on the endpoint removes the names, hostnames and error strings that make retrieval work. Redaction on the hub means un-redacted text has already left the machine. | Redact on the endpoint with a *tenant-configured* rule set (H2: policy is data). Accept the retrieval loss. Never let "we redact on the hub" be the answer; it contradicts §9 in one sentence. |
| R-9 | Standalone installs convert to joined without reinstall (§7) | Agent self-updates, broker updates only via customer tooling (B4 model) | Standalone has no customer tooling. Standalone brokers never update. The divergence B4 worries about is *guaranteed* in the mode the product ships first. | Broker updates itself in standalone mode (signed MSI from CDN, run by the service). Which is the mechanism B4 recommends anyway. |
| R-10 | Idempotency keys from day one (§8) | "Do not build a queue by accident" (§8, PHASE1 §5) | The only reason to have an idempotency key is that you intend to retry. The first retry-after-5xx is a queue of length one with no visibility, no expiry and no cancel. | Choose: refuse on failure and tell the user (no key needed), or build the queue deliberately. The spec currently has the key and not the queue, which is the accident it warns about. |
| R-11 | us-east-1 chosen for Bedrock In-Region coverage (§11) | Bedrock is out | The only stated reason for the region is gone. Data-residency question 18 is still outstanding and the Anthropic API's residency controls are a different mechanism entirely (A3). | Re-decide region on cost and blast radius (A4). Re-open residency as an Anthropic-API question, not an AWS one. |
| R-12 | Per-device rate limiting so a looping client cannot flood the hub (§8) | Incident storms are the product's reason to exist | When a customer's network breaks, endpoints cannot reach the hub, so the hub's storm is not network incidents but everything else (a printer driver push, an Outlook update). Per-device limits do nothing against 5,000 well-behaved devices arriving at once; the constraint is the Anthropic tier ITPM (A3). | Per-tenant concurrency cap at the proxy with a queue-position message to the user, in addition to per-device. Size it from A3 numbers, not from "rate limiting per device". |
| R-13 | `tool_choice: {type: "any"}` forces a tool call (`cloud-client.js`) | Certified model set includes newer models | Forced tool choice is rejected with a 400 on the Fable/Mythos 5.1 tier per the API skill's migration notes `[VERIFY against live docs]`. Haiku 4.5 and Sonnet 5 accept it. Not a today problem; a "swap the model in config" problem, which the design says is free. | Move to `tool_choice: auto` plus an instruction, or structured outputs. Cheap now, a production incident later. |
| R-14 | "macOS eventually required; no decision may foreclose macOS" (§2) | TPM-keyed device identity, MSI updates, named pipe, SCM primitives, Win32 FFI | Every concrete mechanism in the identity, update and execution design is Windows-specific. Nothing forecloses macOS in principle; nothing in the documents names the macOS equivalent of any of it either. | Write the one-page mapping (Secure Enclave, pkg/MDM, XPC, launchd) before locking identity. If TPM-attested identity is chosen, the macOS answer is Secure Enclave attestation, which is a different protocol. |

---

## B3. The egress model

The design (as summarised): egress is a second axis on the catalog, valued `none` / `hub` / `third-party`, orthogonal to R-tier; conversational turns need session-scoped disclosure; assembled payloads need per-action consent, with "data the user did not author" as the boundary.

### Is the axis separation real?

Mostly yes, and the design should keep it. Disruption is a property of the *machine*; egress is a property of the *data*. `reset_adapter` is R2 with no egress; filing a ticket is R0 with egress; a future "send a diagnostics bundle to the NIC vendor" is R0 with third-party egress. Collapsing those onto one scale, as the original `E1` proposal did, would have forced "sends data" to sit above or below "drops your network" on a single ladder, which is meaningless. Two axes is right.

Three things are wrong with the *values*.

1. **`hub` vs `third-party` is the vendor's taxonomy, not the user's.** From where the user sits, "hub" means "my IT department, the vendor's servers, and whichever AI provider the vendor uses". Hub egress *is* third-party egress the moment the hub forwards to Anthropic or ServiceNow, which is what the hub is for. The distinction the consent card needs is the **ultimate audience**: stays on this machine / your IT team can read it / the vendor's servers keep it / an AI provider processes it. Those are the things a user weighs. They are also exactly what the `plain` block already does for R-tiers, so the fix is consent copy per egress value, not a new mechanism.

2. **Retention is missing from the axis.** A turn sent to the inference proxy and retained 30 days (A3) and a ticket filed into ServiceNow, permanent and visible to every fulfiller, are both "hub" egress. They differ more from each other than `none` differs from `hub`. Either retention is a third value on the axis or it is in the consent copy. It cannot be absent.

3. **The axis is declared per capability, but egress is decided per payload.** A ticket with a screenshot and a ticket without one are the same capability with different egress. The design's own screenshot rules (PHASE1 §4) already treat them differently. So the capability declares the *maximum* egress and the consent card must show the *actual* payload, which the design does (step 3 of PHASE1 §6). Say that explicitly, because it means the axis is a ceiling, not a description.

### Is "data the user did not author" a defensible consent boundary?

No. It is the wrong predicate, and it fails on cases the design has already built.

- **The machine-state block.** Every cloud turn sends services, adapter names, IPs, gateway and DHCP state (`prompt.js`, `machineStateBlock`). The user did not author it. By the design's own rule this is an assembled payload needing per-action consent, and it goes out on every turn with none. So there is an unstated exemption for "diagnostic state". The screenshot is also diagnostic state. The exemption is precisely where the screenshot problem lives, and the rule does not draw the line; the exemption does, unwritten.

- **The transcript, in the other direction.** The user *did* author their turns, so session-scoped disclosure suffices and the turns flow to the hub's interaction history (§4) and, via the session model, into ServiceNow `interaction` records readable by fulfillers. But the user said those words to a robot on their own machine, not to their IT department. People tell an assistant things they would never put in a ticket ("I can't focus because my manager keeps…, also the printer"). `PHASE1-TICKETING.md` §4 already sees this: "the user's own words leave the machine… must be visible in the validation step". That sentence and "turns need only session-scoped disclosure" cannot both be true. The design contradicts itself here, and the ticketing note has the better argument.

- **The right predicate is audience change, not authorship.** Data needs per-action consent when it is about to reach an audience the user did not address it to. The user addressed the avatar. The hub's retention store, the inference provider and the ITSM are each a new audience. Under that predicate: machine state to the model is a session-scoped disclosure (the user is asking the assistant to look at the machine; that is the addressed audience); the transcript to the *inference proxy* is session-scoped (same reason); the transcript or its summary into a *ticket* or into *persistent interaction history a fulfiller can open* is per-action, exactly as the ticketing note wants; the screenshot is per-action because its audience is unbounded. The predicate also explains why work notes read aloud are wrong (audience change in the other direction) without a special rule.

- **"Session-scoped" is undefined for an always-on taskbar avatar.** There is no login, no window open/close that means anything. Either a session is a conversation with an explicit start (the user opens the panel and sees the disclosure) and an explicit end (idle timeout, stated), or "session-scoped" means "once per install", which means never. Define it or the whole tier collapses to a one-time EULA.

---

## B4. The update trust model

As summarised: broker updates ship as an MSI through customer tooling; the agent may self-update; the hub advertises binary availability but never delivers binaries; the named pipe is a version boundary with protocol negotiation.

### The failure it creates

**The slowest update channel is attached to the most security-critical component, and the fastest to the one that is untrusted by design.** The broker holds the executors, the validator, the preconditions, the consent token logic and (it should) the device key. It is the half that needs security fixes. It is also the half whose updates depend on a customer's Intune administrator scheduling a deployment. The agent is untrusted by construction (the broker re-validates everything it sends), so an agent security fix is by definition low-stakes. The model is inverted.

**Concrete scenario.** Month 0: fleet at agent 1.4 / broker 1.4. Months 1–5: agent self-updates to 1.9; the customer's packaging team never picks up the broker MSI (they have a quarterly window; the MSI needs re-approval under their change process each time). Month 5: we find that `checkPreconditions()` in 1.4 evaluates `requires` after `checkPolicy()` short-circuits on the blocklist path, so a blocklisted service name with a stale probe can skip a precondition. Fix lands in broker 1.10. Now:

1. **The fix is unenforceable from our side.** The hub cannot deliver it (by rule). The agent cannot deliver it (no admin). Intune can, at the customer's pace.
2. **Protocol negotiation makes the gap invisible.** Agent 1.9 negotiates down to pipe protocol v4 and works. No user sees a difference. Nothing fails. The telemetry says "agent 1.9" because the agent reports its own version. Unless the *broker* reports its version through a channel the agent cannot forge, the hub does not know 1.4 is still running.
3. **Every new safety rule is gated by the slowest customer.** A new `requires` fact, or a change to the precondition grammar, is a broker change. Until the MSI lands, the new catalog either fails closed on the old broker (capability disabled fleet-wide, blamed on us) or the hub must serve version-targeted catalogs (needs step 2's honest version report). The bake-off's whole result, "two catalog rules took R2 false actions to zero", assumes a broker that understands those rules everywhere.
4. **The negotiation surface is itself attack surface.** A downgrade attack on the pipe protocol is now a feature. An agent that can select protocol v1 can select the version with the weakest validation.

**"The hub never delivers binaries" is a conflation.** The rule reads as an H1 corollary (keep the hub away from anything that executes). But H1 is about *signing*. A vendor-signed MSI served from a CDN, with the hub merely advertising version, hash and signature, gives the hub no signing power. The privileged service verifying that signature and running `msiexec` on itself as SYSTEM is how every commercial endpoint agent updates. Refusing this puts the broker on the customer's calendar for no security gain.

### What I would do instead

- **One installer, per machine, both halves.** The agent does not self-update in joined mode. It has no business running a different version from the broker it talks to; the pipe should carry a *single* protocol version and refuse a mismatch, with the broker logging the refusal to the hub. Protocol negotiation is what you build when you have accepted divergence; do not accept it.
- **The broker is the updater.** It fetches the vendor-signed MSI from the CDN the hub advertised, verifies the signature against the anchor shipped in the *previous* MSI, and runs it. Customer tooling remains the *first* install and the opt-out for customers who insist on controlling every package, and those customers accept the divergence risk in writing.
- **The broker attests its posture.** Version, catalog hash, signature-verified flag, TPM present, signed with the device key it holds (B1/H3). This is what lets the hub target catalogs by broker version and what turns "the hub advertises binaries" into a real canary ring.
- **Standalone mode gets the same updater**, which also resolves R-9.

---

## B5. The load-bearing assumption

**The assumption: that privileged local remediation of network and service faults is a large enough share of the design partner's L1 volume to justify building the privileged execution path first.**

Everything expensive rests on it. The broker service, the named pipe, signed catalog distribution, per-tenant catalogs, consent tokens, the risk-tier model, rollback, preconditions, EDR allowlisting, the MSI update story, the TPM device identity (needed so the broker can be trusted), and seven of the ten invariants exist so that the endpoint can safely run four Win32 calls. The hub spec §14 orders the hub work "identity, then signed catalogs, then audit, then tenant config" because those four make joined mode "mean anything", and what they make mean something is the privileged path.

The datum that would confirm or refute it, the top-30 L1 categories with volumes, has been outstanding for three weeks (§15) and every document notes it. Nothing in the project has been re-planned around its absence. That is the shape of a load-bearing assumption: unverified, cheap to verify, and everything above it built as if it were true.

**Why it beats the runners-up.**

- *Schema-per-tenant* (§6): if wrong, the cost is a data migration. Bounded, tens of engineer-days, and it does not invalidate any product decision.
- *The embedding model* (§11): "least reversible" is true relative to the chat model, but A1 shows re-embedding 10,000 articles is cheap in money and hours. It is a schema decision, not a foundation.
- *mTLS vs signed token*: a rewrite of one subsystem. Weeks, not the product.
- *The design partner's constraints are market facts* (§2, §16): genuinely dangerous, but it wastes sales effort before it wastes engineering; the code paths for "no local admin" and "EDR present" are needed for most enterprises regardless.
- *ServiceNow has a REST path for interactions* (A2): if false, the session model changes shape. One adapter.

If the ticket export shows that network and service faults are a small share of L1, and that the bulk is access, accounts, application how-to and hardware, then the privileged path is a feature for a minority of tickets and the deflection story is KB answering and routing. Every model in the bake-off is already at 14–16/16 on the phrasings tier-0 handles with no model at all; the model's contribution is on the judgement cases, and judgement is what a chat surface does. The broker would still be the right *eventual* architecture for the fixes that need it. It would be the wrong *first* thing, and it is currently the only thing.

**What would falsify this.** The export shows network, DNS, DHCP, printer and audio service faults at a third or more of resolvable L1 volume. Then the privileged path is the product and B6's recommendation stands with no qualification.

---

## B6. Scope challenge

### The case for endpoint agent as phase two

A chat surface (Teams app, web panel, or the existing tray avatar with the broker removed) that does KB answering, alert display and ticket creation needs: SSO for the user, the ITSM adapter, retrieval, and a hub. It needs no Windows service, no named pipe, no catalog signing, no consent tokens, no risk tiers, no rollback, no EDR conversation, no MSI change-control negotiation, no TPM. That is the majority of the engineering and seven of the ten invariants gone from the critical path.

The measured evidence points the same way. Three of five models are perfect on the sixteen `tier0-pinned` phrasings the deterministic router already handles with no model; on the six adversarial cases the best result is 3/6; and the whole zero-false-action result came from two catalog rules and a description field, not from any model. The model earns its place on judgement and language, not on picking one of four primitives. Judgement and language are the chat surface's whole job. Meanwhile deflection, the number the company sells, is measurable from day one against the ITSM, which is where a chat-first product lives.

It also removes the single biggest procurement obstacle: a customer's security team can approve a Teams app in an afternoon and a third-party privileged service in a quarter.

### The case against

The demo that exists, that has been rehearsed, and that the design partner has seen, is the cable-out recovery. That is the differentiator by the project's own words ("Scenario 2 is the differentiator"). KB answering and ticket creation are exactly what the ITSM vendors bundle: ServiceNow's own assistant, Microsoft's in Teams, and a dozen venture-funded chat-for-IT products. A seed-stage company does not win a knowledge-chat bake-off against the vendor whose knowledge base it is. It can win "the thing that actually fixed it, offline, with a consent card a security reviewer liked". The privileged path, with its invariants, is the moat and the pitch.

The privileged path is also the part that is *built*. The endpoint works. The four primitives are verified on hardware. The consent flow, audit log and preconditions are tested (204 assertions). Making it phase two means shelving the only working artifact to build the hub, which is the part that does not exist. And offline recovery is the one capability that ships with **no hub at all**, which makes it the fastest thing to put in a customer's hands.

### Recommendation

**Endpoint stays phase one. Hub-distributed privileged content becomes phase two.** These are different things and the current plan conflates them.

Concretely: freeze the four-primitive catalog as a vendor-signed static bundle shipped inside the MSI. No hub catalog distribution, no per-tenant catalogs, no canary rings, no tenant policy engine in the first hub. The endpoint ships joined-lite: device identity, audit shipping, ticket filing, KB retrieval. The first hub is identity + audit ingestion + ITSM adapter + retrieval. That is the chat surface's hub, built for the avatar instead of for Teams, and the four primitives ride along because they are already done and need nothing from the hub to work.

This keeps the differentiator and the built artifact, drops the four most expensive hub components from phase one (signed distribution, tenant catalogs, release channels, policy engine), and makes the phase-one hub something a customer-hosted deployment can run without a signing ceremony. It also means H1, H4 and H6 have nothing to bite on in phase one, because nothing privileged moves over the wire.

**What would change my mind.** Either of two things. The ticket export shows resolvable network and service faults are under roughly one in ten L1 tickets: then the primitives are a demo, not a product, and the chat surface is phase one on its own. Or the design partner's security team, shown `BROKER-SURFACE.md`, says they will not approve a third-party privileged service under any allowlisting: then the executor has to become an integration with *their* remediation tooling, and the whole privileged path is a different product.

---

## B7. Estimate

The hub was estimated at 8–14 engineer-weeks across six components (§14). Nothing in the spec divides that total; "~2 weeks" for item 1 is 8–14 divided by six, which nobody wrote down. Decomposing the first item as the spec names it: device identity, enrollment, issuance, rotation, revocation.

| Sub-item | What it actually contains | Estimate |
|---|---|---|
| Decide mTLS vs signed token | Threat model, the TLS-inspection question (A5), the "where does the key live" question (B1/H3), macOS mapping (R-14). Written decision, not a meeting. | 2–3 days |
| Endpoint key material | TPM-backed key via the platform crypto provider from a Node/Electron service (koffi FFI to NCrypt, or a small native helper), fallback when no TPM or a VM without vTPM, key attestation if wanted, tests on at least three hardware classes. | 1.5–2 weeks |
| Enrollment bootstrap | How the first request is trusted: tenant enrollment token delivered by Intune, admin approval of pending devices, or both. Hub endpoints, admin surface (CLI is fine), abuse controls (an enrollment token that leaks must not enrol 10,000 devices). Standalone → joined conversion (§7). | 1–1.5 weeks |
| Issuance and storage | Tenant and device tables, CSR or JWK intake, credential issuance, status model (pending/active/revoked/rotating), audit of every issuance. | 3–5 days |
| Request authentication | Middleware verifying the device assertion on every request: nonce or timestamp with replay window, clock skew, revocation check that does not add a DB round trip per request, per-device rate limit (§8). | 3–5 days |
| Rotation | Scheduled re-issuance with overlap, recovery when the TPM is cleared or the machine is re-imaged (a re-enrol path that cannot be used to take over an existing device identity), rotation of the *hub's* signing/verification material. | 1 week |
| Revocation | Admin-triggered and automatic (device retired in Intune/SCIM), propagation latency target, what an endpoint does when it learns it is revoked (wipe local state, degrade, message). | 3–4 days |
| IaC, secrets, runbooks, tests | KMS or SSM for hub-side keys, Terraform for all of it, integration tests against a real TPM and a VM, an on-call runbook for "enrollment is failing". | 1 week |

**Total for item 1: roughly 6–8 engineer-weeks**, three to four times the implied two, before any of the other five components. If ALB mutual TLS is used it offloads certificate verification but not enrollment, rotation, revocation or the endpoint key work, so it trims days, not weeks.

I am not producing a competing total for the hub. The point is narrower: the first item alone is in the range the spec gave for the whole hub, and the spec's own §16 already labels the figure "an estimate derived from the component list, not a measurement". Treat 8–14 as a lower bound on item 1 plus item 3, and re-estimate once the B6 scope decision is made, because that decision removes two of the six components from phase one.

---

## B8. What is missing entirely

Things a production system of this kind needs that appear in none of the six documents. Not wrong; absent.

**Security and trust**
- **A threat model.** Ten invariants and no adversary list. Who are we defending against: user-context malware, a malicious end user, a malicious tenant admin, a compromised hub, a malicious insider at the vendor, a compromised KB author, the network path. Each invariant should name which of these it stops. B1 found gaps because nobody wrote the adversaries down.
- **Human identity and authorisation for the hub.** The hub has device identity and no human identity. Who logs in to approve a catalog, revoke a device, read audit, configure a tenant? SSO, roles, MFA, session management, and an audit of *admin* actions. Draft-and-approve is meaningless without this.
- **Key and credential compromise runbooks.** What happens when the signing key, the hub, a tenant's ITSM credential or a device key is compromised. How a bad catalog version is pulled from a fleet faster than H6's freshness bound.
- **The end user's identity on the device.** The hub knows the machine. Tickets need `caller_id`, entitlement checks need the user, multi-user machines, shared kiosks and RDP sessions exist. SCIM tells the hub who the users *are*; nothing says how the endpoint proves *which* one is talking to it.
- **Hub-side abuse and denial-of-service.** WAF, request size limits, per-tenant quotas, what a hostile device can do to the ALB. "Rate limiting per device" is one line.
- **Inference spend controls.** A per-tenant and per-device cap on tokens per day, alerting on anomaly. One looping endpoint against a shared key is a bill, and the Anthropic-side controls (A3) need to be configured deliberately.

**Operations**
- **Observability and on-call.** Logging, metrics, tracing, SLOs, alert routing, who is paged. The word "pager" appears once, as a cost of Redis.
- **Backup, restore and disaster recovery.** RPO/RTO for Postgres and object storage, a *tested* restore, what a tenant is told after a data loss.
- **Tenant offboarding.** Data export format, deletion attestation, retention of audit after contract end, the customer-hosted variant of all of this.
- **A device lab and a compatibility matrix.** `BROKER-SURFACE.md` already flags `SetIfEntry` on virtual adapters. Windows versions, NIC drivers, VDI, ARM64 Windows, TPM types. Nothing describes how the privileged path is tested beyond one dev machine.
- **Clock and time.** Consent TTL, freshness bounds, replay windows and token expiry all assume synchronised clocks. Nothing states the tolerance or what happens outside it.
- **Uninstall and decommission.** Revoke the device, wipe local state, tell the hub, handle the machine that is wiped without telling anyone.

**Product and legal**
- **A data protection assessment and subprocessor list.** Anthropic, AWS, and the ITSM are subprocessors. A DPA template. Where employee conversations are recorded at work, several jurisdictions require works-council or employee notice; nothing mentions it.
- **End-user notice.** What the avatar tells a first-time user about what is recorded and where it goes, in language that survives a privacy review. This is the "session-scoped disclosure" of B3 and it has no text.
- **Accessibility and localisation.** An animated avatar with TTS and a transcript. Screen reader behaviour, keyboard-only consent, high contrast; and every `plain` string is English and signed, so localisation is a catalog-signing event per language.
- **Change management integration.** R2 actions cause user-visible outages. ITIL shops record those as changes. Whether a consented `reset_adapter` should write a change record, or is exempt as a standard change, is a customer conversation nobody has scheduled.
- **The commercial model that the metering must support.** Per seat, per resolved ticket, per token. The inference proxy "meters tokens" but nothing says what is billed, which determines what must be measured and retained.
- **Who supports the support product.** When Matic Desk itself fails on a user's machine, who do they call, and does the avatar know it is the thing that is broken.
- **Liability for actions taken.** The product disables network adapters on consent. A signed consent record is the defence; nothing describes what the record must contain to be one, or how long it is kept.

---

## Addendum to Part B — after reading D91–D129 and H5/H6 as written

Added 2026-09-03, after Part B and the first Part C were written, when the D91–D124 document was supplied. The consolidated register (C1–C8, D42–D90) is still not on disk. Everything below uses only the text of D91–D129, H5 and H6. Part B above is left as written so the corrections are visible rather than absorbed.

### Corrections — things Part B got wrong or overstated against the real wording

1. **"The hub never delivers binaries" is not an H1 conflation. Withdrawn.** D104 states its reason: customer-hosted isolation and no firewall exception to our origin. That is a real reason and I attributed a different one. What survives is narrower and, I think, still decisive: D99 (broker does not self-update), D100 (MSI via customer tooling) and D104 (hub does not deliver binaries) together leave **standalone-mode brokers with no update path at all**. §3's "Deferred" concedes SMB self-contained customers; standalone, the mode the product ships first, is not mentioned. And D104 as written also forbids the one path that satisfies D104's own reason: a customer-hosted hub serving a vendor-signed MSI from its own object store, fetched by the broker, verified against a pinned publisher. No firewall exception, no contact with our origin, no hub signing anything.

2. **The machine-state exemption is written down, in D127. Withdrawn as "unwritten".** What survives: D127 discloses "your machine's network status" at session scope, while D128 lists "machine diagnostics" among the payloads needing per-action consent. In the shipped code both come from the same probe (`agent.diagnose()`). The line is drawn by *payload type*, which is a proxy for the thing that actually matters, the audience. That is the B3 argument in different words, so B3's conclusion stands and its premise was mis-stated.

3. **H5 already says "never spoken by the avatar as its own words".** My audible-attribution edge is narrower than written. What survives is sharper than what I wrote: in the shipped code the escalation `summary` *is* spoken as the avatar's own words (`cloud-client.js`, the `reply` string). Under D53 the hub authors that payload. H5 as written therefore requires the avatar to **stop speaking escalation summaries in joined mode** and render them as attributed IT chrome instead. That is a user-visible change to the demo's third scenario and it appears on no list.

4. **R-7 is half-moot.** D97 has already moved the managed-tier pick back to Haiku 4.5 (36/40 after hardening). The GPU-cost incompatibility applies only to the customer-hosted tier, and the remaining problem is documentation: BAKEOFF §1 still says mistral "beats the cloud model" (C9), and so do the post-demo handover §4 and `LOCAL-MODEL-PROVIDER.md` §3. Three places, not one.

### Where the real wording confirms Part B, with the argument engaged

- **H6 says "detect", not what to do on detection.** Branches A and B in B1 stand; the invariant stops one sentence short of the decision that matters. Of its two mechanisms, the minimum-acceptable-version floor cannot detect silence at all, because the floor arrives inside the content the silent hub is not sending. Only not-valid-after detects omission. And on detection the safe direction is "drop to the vendor floor catalog", which is narrowing and H4-legal, not "refuse" (fleet outage) or "warn" (nothing prevented).

- **D99, engaged on its own terms.** The argument is blast radius and EDR: a privileged service that downloads and executes code is what EDR exists to detect. A5's evidence cuts the other way. Every major endpoint agent updates itself as SYSTEM; Intune has a documented switch precisely for self-updating apps; and EDR allowlisting by code-signing certificate survives updates, which weakens D100's claim that routing through the customer's change process is what keeps allowlisting intact. Fetching a vendor-signed MSI, verifying Authenticode against a pinned publisher, and invoking `msiexec` is the same trust root Intune itself relies on; it is not "downloading and executing code" in the sense D99 means. D99 is a defensible choice for the design partner, who has Intune. It is the wrong default for the product, and its price is D102.

- **D102 protocol negotiation is the cost of D99, and it is a downgrade surface.** B4 stands. Add one gap the register does not close: D103 puts the version in the heartbeat and D107 requires *hub* version in telemetry, but nothing requires the **broker** version to be reported by the broker. The agent sends the heartbeat. An agent can report any broker version it likes. Without a broker-signed posture assertion (version, catalog hash, signature-verified flag, signed with the device key the broker should hold per B1/H3), the hub cannot know which brokers are stale, cannot target catalogs by broker version, and cannot make a "minimum broker version" policy (narrowing, H4-legal) that disables capabilities on stale brokers instead of negotiating around them. That assertion is the minimum I would insist on whether or not D99 stands.

- **D129 is the R-5 resolution, with the hub as verifier. Agree in full.** One addition: the broker's audit record should store the hub's *signed receipt* (payload hash, ticket ID), relayed by the agent, rather than the agent's report that the send succeeded. Forging "sent" is low-harm, but the audit record is the artifact a customer's reviewer will read.

- **R-1 stands, reframed.** Under D47 offline never runs a model, so "offline runs a different prompt" was wrong. But standalone mode assembles the prompt on the endpoint (`prompt.js`) and joined mode assembles it on the hub (D53). Two assemblers, and the bake-off measured the endpoint one. The correctness requirement in `prompt.js` ("one definition, imported by both") now needs to hold across a process boundary and a deployment mode.

- **D96 and A1 together create a new conflict.** D96 hopes a self-hostable embedder makes offline dense retrieval possible on the endpoint. A1 says such embedders exist (100–350M parameters, Apache-2.0/MIT) and run on CPU. Hub spec §2 says no local model on endpoints and "a 63 MB local TTS model is the only on-device model". A 100–350M embedder is 100 MB to 1.4 GB on disk. D96's hope collides with §2, and D44/D112 already rule out customer content offline regardless. What D96 actually enables is offline dense retrieval of the *generic* KB, and only if §2 is renegotiated with the design partner. Say that, or D96 will be read as more than it is.

- **D115 and A4 agree.** 83 heartbeats a second against one Fargate task and a db.t4g.micro with roughly 80 usable connections means the heartbeat must not touch the database per request. Cache the content-version vector in the task; write heartbeat state in batches.

- **D118's proxy is confounded.** Ticket volume in the alerted category during an alert versus baseline measures suppression plus the incident's own effect on people's ability to file tickets. The register's own limitation note ("the VPN is down cannot be delivered to people whose VPN is down") is the same confound from the other side.

### The consent-surface finding (1.1), re-read against D124 and D129

D124 reuses the consent pattern for tickets and D129 puts the broker as minter and the agent as transmitter. D129's elegance is that the hub verifies the payload hash, so an agent that sends something other than what was approved is caught. **That verifier exists only for egress.** For the four privileged local actions there is no hub in the path, so nothing verifies that what the agent *displayed* is what the broker *executed*. The finding is therefore sharper after reading the register: the design has solved the display-integrity problem for the low-disruption path (tickets) and left it open for the high-disruption path (`reset_adapter`). The same trick cannot be reused, because the broker is both the party that must be convinced and the party that acts. It needs a rendering it controls.

---
# Part C — Comparison with the previous reviewer

**Scope.** Complete. The D91–D124 document arrived on 2026-09-03 (morning) and the consolidated register plus its two source files arrived the same day in `Claude Code files to Review 9 - 3 2026 1 11 am.zip`, now extracted to `Downloads\` and `Downloads\review-files-2026-09-03\`. All of C1–C12, H4–H6 as written, D42–D129 and OPEN-1 to OPEN-4 have been read. The two source files were compared with the consolidated register; the register supersedes them faithfully, and one thing the sources say more sharply than the register is noted below (C3).

**Numbering.** The consolidated register numbers D35–D83 and collides with D1–D41 in the spreadsheet. Per its own §0 and the D91–D124 document's §0, add 7. This section cites **D-new (was D-old)** on first mention, then D-new. D91–D129 are cited as written.

**Anchoring check.** Part B was written before any register was read. The evaluation prompt named six B2 areas, so R-1 to R-6 were prompted; R-7 to R-14 were not. Two earlier versions of this Part C, written against partial inputs, are superseded by this one. The corrections in C.0 are the evidence that the comparison is real: where the register was right and I was wrong, it says so first.

---

## C.0 Corrections to this review, after reading the consolidated register

1. **The device key is already broker-side. Finding 1.2 and B1/H3 were wrong about the design and right about the code.** D64 (was D57): "The device key lives broker-side. The agent requests tokens over the existing named pipe and never sees the key." D60 (was D53): keypair generated at enrollment by the broker, TPM-backed via the platform crypto provider. D61 (was D54): signed assertion exchanged for a short-lived token. That is the design B1/H3 asked for, decided a day before I asked for it. What survives, and it is smaller: the agent still holds a bearer token for its lifetime (register §5 leaves that lifetime unset, and D83a (was D76a) makes revocation latency equal to it); nothing puts the broker's version, catalog hash or signature-verified state into the assertion the broker signs, which is the one place it could go for free; and the update inversion (B4) is untouched. Finding 1.2 in section 1 has been rewritten to say this.

2. **H4 as written has a floor. B1/H4 scenario 2 overstated the gap.** The full text: "Maximum risk tier and primitive allowlist are pinned at enrollment or carried in signed content." With C3's probable resolution (vendor-signed catalog is the only signed artifact; per-tenant subset and policy are unsigned config that can only narrow), the floor is the vendor catalog, and the `requires` preconditions and blocklist live in it, so tenant config cannot remove them. That closes my B1/H2 edge too. What survives: H4 pins the *maximum* tier and the *allowlist*, not per-capability tier labels or consent text, so relabelling `reset_adapter` R2→R1 through tenant policy is still not forbidden by the words; and narrowing can still be harmful (remove every R1 network remedy and the model's only lever is R2). Ratify H4 with "tier labels and consent text are part of the signed floor" added.

3. **A session has a defined end. B3 said "undefined"; it is half-defined.** D89 (was D82) and D90 (was D83): three outcomes, and the agent must request end-of-session confirmation. So the end exists. The start does not, and D127's "one clear statement at session start" still needs one.

4. **Redaction placement was already decided the way R-8 recommends.** D53a (was D46a): redaction stays on the endpoint, before the hub call, because hub-side redaction "is decorative". Agree; withdraw R-8 as a conflict, keep it as a confirmation.

5. **Minimum telemetry as a condition of support was already decided.** D59c (was D52c) is R-4's resolution. Withdraw R-4 as a conflict.

6. **Outbound email as a third dependency is in the register and not in my B8.** D86 (was D79) says self-contained mode needs outbound email and that §5's "exactly two stateful dependencies" must be updated rather than quietly broken. I missed it. Credit where due; it also strengthens R-2's point that the two-dependency rule is already bending.

7. **macOS is partly addressed.** D65 (was D58): the device-identity abstraction maps to Secure Enclave. R-14 narrows to MSI, named pipe, SCM primitives and Win32 FFI, which still have no macOS mapping written.

---

## C.1 Conflicts C1–C8 (consolidated register)

| ID | Their statement and status | Verdict | My position |
|---|---|---|---|
| **C1** | Hub must not own the conversation loop vs prompt versioning and D53 (was D46) retrieval and assembly on the hub. Recommended: restate as *model proposes / endpoint validates / broker executes*. | **Agree on the restatement; it is not the whole conflict.** | The restatement carries the security weight, as they say. It does not carry the *measurement* weight: standalone assembles the prompt on the endpoint (`prompt.js`), joined assembles it on the hub, and the bake-off measured the endpoint one. Two assemblers, one measured. The register's own §8 row for spec §8 says the combined call "has no surface defined"; the surface should include the prompt template as a versioned, signed artifact so both assemblers read the same one (R-1). |
| **C2** | Postgres `SKIP LOCKED` queue vs schema-per-tenant. "No third option." Blocks the first migration. | **Disagree that there is no third option.** | Shared control-plane schema (tenants, devices, enrollment queue, releases, job queue) plus per-tenant data schemas. It is the honest option because the queue already crosses the boundary. Worker asserts the tenant schema from the job row before every query. A4 adds the constraint C2 did not have: ~80 usable connections on db.t4g.micro, so N pollers per tenant is not merely ugly, it does not fit. (R-2.) |
| **C3** | H1 vs per-tenant signed catalogs and draft-and-approve. Probable resolution: vendor-signed catalog is the signed artifact; tenant subset and policy are unsigned, endpoint-enforced, narrowing only (H2+H4). | **Agree with the probable resolution and it should be decided, not probable.** Two additions. | (a) The source file D35–D46 §4 says it more sharply than the register: "require a human to sign every customer's catalog edit offline, indefinitely." The resolution means **customers cannot author playbooks, only select and constrain vendor ones**. That is a product statement, and it belongs in the sales deck before a customer asks. (b) B1/H1's edge applies to the vendor pipeline regardless: if the hub can *drive* the signer (a job that a signing service fulfils), key location is irrelevant. The rule needs to be about authority to cause a signature. Customer-held keys (D112's idea, for a different reason) are the eventual answer for tenants who insist on authoring. |
| **C4** | Internal ticket store priority 3 behind a ServiceNow adapter, while most customers lack ServiceNow. Resolved by D73 (was D66): store promoted to core. | **Agree, and it is the largest scope decision in the register.** | The register's own §6 says the product moved from "thin hub" to "knowledge platform, ticketing system, and analytics product" and that the estimate must be rebuilt. B6 is the counterweight: if the store is core, then hub *catalog distribution*, tenant catalogs, release channels and canary rings are the things to defer, and the four primitives ship as a static vendor-signed bundle inside the MSI. OPEN-4's v1 subset (create, assign, state machine, visibility-split comments, attachments, search, dashboard) is the right list; add "email notification to an IT alias" from D86 (was D79) because without it the store is a database nobody looks at. |
| **C5** | Cost model quotes us-east-2; region is us-east-1. Re-price. | **Resolved by A4, and D93 (Bedrock out) makes the question different.** | Every Phase 1 line item is priced identically in both regions, so re-pricing changes nothing. The region is now free (D93), us-east-2 is at least as good (A4), and the replacement question is not an AWS one: US-only inference is unavailable on Haiku 4.5 and there is no EU option on the first-party API (A3). OPEN-3 is a model-and-provider question. |
| **C6** | Spec §3's claim that hub compromise costs confidentiality not control does not hold until H4 is ratified. | **Agree. Ratify H4 with the two amendments in C.0 item 2.** | Also note: even with H4, hub compromise under D53 (was D46) costs the *model's instructions* for every joined endpoint, every turn. The broker's validation is the only thing between a compromised hub and a fleet of wrong-but-valid R1 proposals, each presented to a user for consent with hub-authored `reasoning` text alongside the catalog consent card (B1/H3e scenario 1). "Confidentiality, not control" is still too strong after H4; "confidentiality plus persuasion, not execution" is what H4 buys. |
| **C7** | Inference proxy at priority 2 and §14 item 6, but joined mode requires it under D52/D53 (was D45/D46). | **Agree.** | Under H3 a joined endpoint holds no model credential, so any model use in joined mode goes through the proxy. It is item 2, after identity. B6's phase-one hub is identity, proxy, audit, tickets, KB retrieval. A3 sizes it: Scale tier, per-tenant workspaces, admission control from the rate-limit headers, and a spend cap per tenant. |
| **C8** | Interaction history at priority 3 while the hub receives conversation state every turn under D53. A retention question, not a feature question. | **Agree, and it is also a consent question.** | The register's own D79b (was D72b) says mirroring sessions into the ITSM "means every conversation leaves the endpoint, a categorically different privacy posture", and requires different consent wording. That is the audience argument from B3, already in the register. D125–D128, written later in a different session, flatten it to a session-start disclosure string. **The two registers disagree with each other on this and neither records it** (X-1 below). |

## C.2 Conflicts C9–C12 and D125–D129 (D91–D124 document)

| ID | Verdict | Notes |
|---|---|---|
| **C9** BAKEOFF §1 contradicts §2b | **Agree; verified; in three documents.** | BAKEOFF §1, `HANDOVER-2026-09-02-post-demo.md` §4, `LOCAL-MODEL-PROVIDER.md` §3 all still say mistral beats the cloud model. |
| **C10** → D125–D129 | **Agree on the axis and on D125, D126, D129. Disagree on the D128 predicate.** | B3. And D79b (was D72b) in the consolidated register is on my side of this argument. |
| **C11** identity must not reach the model under hub-side assembly | **Agree; it becomes a hub-side contract test.** | The hub is the component that knows the identity. The rule is "not to the model", not "not to the hub"; the ticket path carries identity by design. |
| **C12** self-asserted profile insufficient for entitlement | **Agree. This is OPEN-1; answer below.** | |
| **D129** broker mints, agent transmits, hub verifies | **Agree in full.** Store the hub's signed receipt in the audit record. | |

## C.3 The cross-register conflicts neither session could see

Each register was written without the other in view. These are tensions between them.

| ID | Between | Conflict |
|---|---|---|
| **X-1** | D79b (was D72b) and D125/D127/D128 | D79b: session mirroring is a categorically different privacy posture needing its own consent wording. D127: a session-start disclosure string covers conversation to the hub. Under D53 every turn reaches the hub and under C8 the hub keeps it. Whether that stored transcript then reaches fulfillers (interaction records, D75/D76 was D68/D69) is exactly D79b's case, and D127 does not cover it. Decide which register wins; I say D79b. |
| **X-2** | D64 (was D57) and D99/D102 | The register put the device key, the mode state (D48 was D41), enrollment and token minting into the broker, making it the trust anchor for everything. The later document put the broker on the slowest update channel with protocol negotiation to paper over drift. The more the broker holds, the worse D99's trade becomes. B4 and the Part B addendum. |
| **X-3** | D61 (was D54) and register §5 | D61 says short token expiry "delivers revocation without CRL machinery"; D83a (was D76a) says revocation is a row delete and tokens expire on their own. Revocation latency therefore equals the token lifetime, which §5 lists as unset. It is a security parameter, not a tuning one, and D83a's bulk revocation is only as fast as it. Set it in the same decision as the heartbeat interval; A5's TPM latency (P95 ~600 ms) says the exchange can happen every few minutes without cost. |
| **X-4** | D45/D46 (was D38/D39) and D104 | Generic KB and catalog bundles are pushed proactively by the hub; binaries are not delivered by the hub. Content yes, code no. That is a coherent line (D110/D111), so this is not a conflict. Recorded because the next reader will ask. |
| **X-5** | D53 (was D46) and H5 | H5 governs hub text reaching the *user*. D53 makes the hub the author of the *model's* entire context. The escalation `summary` is hub-returned text that the shipped code speaks in the avatar's voice; H5 as written forbids that. Nobody has listed the UX change (Part B addendum item 3). |
| **X-6** | D60 (was D53) and A5 | Not a conflict; three additions the register needs. Create the device key with no TPM authorisation value so Windows Hello lockouts do not block the broker (`[VERIFY]` PCP default). Do not create it inside `StartService` (Microsoft documents the deadlock). Detect duplicate public keys across devices, because cloned VMs on vSphere 6.7/7 share one vTPM. |
| **X-7** | Register §6 (rebuild the estimate) and B6 | The register asks for the estimate to be rebuilt after adding a knowledge platform, a ticketing system, email and analytics. B6 asks for the privileged-content distribution half of the hub to be deferred. Both are true; together they say the phase-one hub is identity + proxy + tickets + KB + email, and not catalogs, rings or tenant policy. Neither register draws that conclusion. |

## C.4 Open items OPEN-1 to OPEN-4

| Item | Their framing | My answer |
|---|---|---|
| **OPEN-1** user identity binding | Two alternatives: interactive OIDC sign-in (damages "it's already there"), or accept the endpoint's assertion (blast radius one machine). | **There is a third option, and it is the right one.** The broker runs as LocalSystem and can read the interactive session's logon SID and token (`WTSQueryUserToken` / `WTSQuerySessionInformation`, standard for services that act on behalf of the logged-on user). The broker puts that SID into the assertion it signs with the device key (D61). The hub maps SID → IdP object via SCIM (`externalId`, or the on-premises SID attribute Entra syncs). No interactive sign-in, no self-asserted profile, and the claim is made by the privileged half, not the agent. Blast radius stays one machine, but now the *machine* is asserting, not the user-context process. Shift-worker machines are handled because the SID changes with the session and the broker sees it. C12's profile becomes display-only. |
| **OPEN-2** whose AWS account | Carried from spec §15. | Both, and the register already decided the architecture supports both (D59 was D52). The commercial answer is A3's: customer-hosted hubs cannot be metered or measured by us (R-4, D59c), so they are flat-priced and excluded from deflection commitments. Decide the price list, not the architecture. |
| **OPEN-3** retention and residency | Legal-adjacent; D58 (was D51) added a PII table. | Reframed by A3. Anthropic default retention is 30 days; ZDR is sales-gated per org; there is no EU inference or EU at-rest on the first-party API; US-only inference is not available on Haiku 4.5. So: a US-only tenant cannot use the routine model as certified; an EU-residency tenant cannot use the first-party API at all. Go back to the design partner with those two sentences, not with a region question. |
| **OPEN-4** v1 ticket-store subset | Needs defending in writing. | Their list plus email notification (D86). Defend it by pointing at D86's own sentence: without an ITSM there is no queue; the store plus an email alias *is* the queue. |

## C.5 The register's verification list, answered

Register §9 lists what was unverified. Every item now has an answer in Part A.

| Register §9 item | Answer | Where |
|---|---|---|
| `interaction` / `interaction_related_record` existence, fields, inheritance | Exist (plugin `com.glide.interaction`); fields documented by label; `interaction` almost certainly does **not** extend `task` `[VERIFY on instance]` | A2 Q1 |
| REST create for interaction — load-bearing | Table API `POST /api/now/table/interaction` with `interaction_agent`; dedicated API undocumented in practice | A2 Q1 |
| `task` base fields and inheritance | Documented list retrieved; `caller_id`, `category`, `incident_state` are not on it, confirming D77 (was D70) | A2 Q2 |
| `opened_by` vs `caller_id` | Confirmed (secondary sources only); set `caller_id` explicitly | A2 Q3 |
| `comments` vs `work_notes` — load-bearing | Confirmed: `work_notes` "viewable only by ITIL users"; read via `sys_journal_field` `element=comments`; deny `itil` to the integration account | A2 Q4 |
| KB read criteria evaluable server-side? | Declarative criteria yes, scripted criteria no; Microsoft's connector documents the same wall; per-user proxy via `/api/sn_km_api/knowledge/articles` | A2 Q5 |
| Licensed account per end user for own tickets? | KB reading is Requester activity (secondary sources); `[VERIFY]` against the order form | A2 Q5 |
| Restricted classes | HR, SecOps, GRC, Legal are `task` children in own scopes; never query `task`; legal table is `sn_lg_ops_request` | A2 Q6 |
| SCIM paths vs RFC 7643 | Confirmed and listed; ServiceNow is a SCIM server but pulling needs admin-equivalent `scim_admin`; be a SCIM provider instead | A2 Q7 |
| Per-token pricing | Haiku $1/$5, Sonnet 5 $2/$10, standing; Bedrock and Nova moot | A3 Q1 |
| Titan V2 hosted-only | Moot; Anthropic has no embeddings API; open-weight alternatives listed | A1 |
| db.t4g.micro us-east-1 | $0.016/hr, identical to us-east-2 | A4 Q1 |
| `max_connections` and pooler | ~80–90 usable; pooler not forced if pools capped; RDS Proxy $21.90/mo | A4 Q2 |
| pgvector on RDS | 0.8.2 on PG 15–18; HNSW; 2,000-dim index limit; micro holds one ~25k-chunk tenant | A1 Q5 |
| TPM signing latency (D61 premise "tens of ms") | Worse than the premise: medians 10–500 ms across firmware; P50 200 / P95 600 ms in Chrome telemetry. The token-exchange design is more necessary, not less | A5 Q1b |
| TPM prevalence and failure modes | Universal on Windows 11; ~30% Windows 10 residue (consumer-weighted); clear/re-image/swap = re-enrol; lockout survivable with no-authValue keys; cloned vTPMs duplicate identity | A5 Q1c–d |
| TLS inspection prevalence — strongest argument for D62 (was D55) | Prevalence unmeasured; unnecessary: Zscaler documents mutual TLS as unsupported under inspection, Palo Alto auto-excludes on client-auth failure, Microsoft exempts its own agents. D62 stands on documentation, not statistics | A5 Q2 |
| EDR allowlisting; do updates break hash exceptions | Yes by definition and Microsoft says so; use certificate/publisher rules; sign with RSA; keep binaries under `%ProgramFiles%` | A5 Q3 |
| RFC numbers (private-key JWT, DPoP, HTTP signatures) | RFC 7523 is private-key JWT client authentication; DPoP is RFC 9449; HTTP Message Signatures is RFC 9421 `[VERIFY: from memory; not retrieved in Part A]` | — |

**Outstanding from the design partner, now five weeks:** the top-30 ticket categories. The register's §9 says "every substantive question in these sessions eventually points back at this." B5 says the same thing from the other direction. Nothing in either register, or in this review, substitutes for it.

## C.6 Where I agree with the register without reservation

D48 (was D41) no user mode toggle; D50 (was D43) authenticated heartbeat rather than reachability; D53a redaction on the endpoint; D53b tier-0 on the endpoint; D55 (was D48) SCIM not `sys_user`; D56 (was D49) `sys_id` not a primary key; D62 (was D55) mTLS rejected; D63 (was D56) key-protection level as device state; D66/D80–D83 (was D59/D73–D76) enrollment as a pending record with a rotatable, time-boxed, non-baked secret; D68 (was D61) own-history as read-through; D69 (was D62) visible comments only; D70 (was D63) cross-user similarity deferred; D74 (was D67) split "standalone" into endpoint mode and ITSM posture; D75/D76 (was D68/D69) session as first-class, shape not schema; D79b (was D72b) mirroring changes consent; D86 (was D79) email is a third dependency; D89 (was D82) only confirmed-resolved counts as deflection; D98 content over binaries; D129 broker mints, agent transmits, hub verifies. These are good decisions and most of them are better than the spec they amend.

## C.7 What this review found that neither register contains

- **The consent surface lives in the unprivileged process** (1.1). D64 checks the calling binary's signature for token requests and D129 has the hub verify egress payloads. Nothing verifies that what the agent displayed is what the broker executed for the four privileged local actions, where there is no external verifier. Still the largest finding.
- **The H1 signing-service edge** (B1/H1, C3 above).
- **H6 detects and does not decide** (B1/H6): refuse and the hub outage becomes a fleet outage; warn and nothing is prevented; drop to the vendor floor and it is safe.
- **The broker's version is unattested** (X-2, X-3): add it to the assertion the broker already signs.
- **Haiku 4.5 cannot cache the shipped prompt** (A3); **the spend cap, not rate limits, is the fleet constraint** (A3); **US-only inference is unavailable on the routine model** (A3).
- **Standalone-mode brokers never update** (R-9).
- **The OPEN-1 third option**: broker-attested logon SID (C.4).
- **The two registers disagree on transcript consent and do not know it** (X-1).
- **`interaction` is probably not a `task` child**, and the legal table name is wrong (A2).

---

# Verification register

Every `[VERIFY]` in this review, by location. The five research reports each end with their own consolidated "Unverified / could not find" list; those are authoritative for Part A and are not repeated here.

| Section | Item | Status |
|---|---|---|
| A1 report | 13 items, including Titan V2 and Cohere v4 prices (JS-rendered pricing pages), Voyage 4 cross-model vector-space claim, CPU throughput on Fargate-class hardware | see report |
| A2 report | 18 items, including `interaction` not extending `task`, element names for interaction fields, Interaction Management API endpoint, Table API journal rendering, requester/fulfiller licensing | see report |
| A3 report | 8 items, including tier-advancement mechanics, ZDR eligibility for self-serve orgs, subprocessor list (JS-rendered) | see report |
| A4 report | 10 items, including exact `max_connections` on db.t4g.micro, RDS Proxy pinning under `SET search_path`, api.anthropic.com serving location | see report |
| A5 report | 20 items, including PCP algorithm list, no-authValue default, per-vendor TPM medians, TLS-inspection prevalence (none found), CrowdStrike/SentinelOne semantics (docs behind login), Electron/koffi EDR heuristics (none found) | see report |
| 1.3, R-7 | GPU instance pricing for a 16 GB-resident model | `I do not have a verified source for this.` Not researched; the claim that it exceeds the Phase 1 budget by an order of magnitude is reasoning from the $46/month total, not a quoted price. Per D97 this now applies to the customer-hosted tier only. |
| 1.3, A3 lead | Shipped prompt prefix ~1,500 tokens (system prompt 326 + tools 1,148) | Estimated at 4 characters per token from `prompt.js` output and `catalog.json`. Confirm with `messages.count_tokens` before relying on it. The direction of the finding (below 4,096) is robust to a 2× error. |
| R-13 | Forced `tool_choice` returns 400 on the Fable/Mythos 5.1 tier | From the Claude API skill documentation cached 2026-06-24, not from a live page. Haiku 4.5 and Sonnet 5 accept it; only relevant if the certified set changes. |
| B1/H3e | The pipe-split consent bypass | Reasoned from `main.js` and `broker.d.ts`, not demonstrated. It would take an afternoon to demonstrate against a stub `NamedPipeBroker`. |
| B5 | L1 ticket composition at the design partner | The load-bearing datum. Unknown to everyone, three weeks outstanding. Nothing in this review or any document asserts a number for it. |
| B7 | All sub-estimates | Estimates, not measurements, same as the spec's own. |
| Part C §C.5 | RFC 7523 (private-key JWT client auth), RFC 9449 (DPoP), RFC 9421 (HTTP Message Signatures) | Cited from memory to answer the register's own from-memory citation; not retrieved in Part A. `[VERIFY]` before writing them into a design document. |
| Part C §C.4 | `WTSQueryUserToken` / `WTSQuerySessionInformation` as the broker's route to the logged-on user's SID | Standard Windows service pattern, cited from memory; not retrieved in Part A. `[VERIFY]` against learn.microsoft.com before designing OPEN-1 around it. |
| 0.2 | "Second time in one day a dependency document was missing" | From `HANDOVER-2026-09-02-post-demo.md` §7 and `LOCAL-MODEL-PROVIDER.md`; the brief has since appeared in `Claude Handover Files\`. |

**No performance figure in this review is a measurement.** The bake-off remains the only measured artifact in the project: one machine, 40 hand-written cases, one run pair.

*(end of review)*
