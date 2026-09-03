# Handover — Matic Desk Hub (Server-Side Component)

**Date:** 2026-09-02
**Purpose:** Start hub development in a parallel thread. **This document is self-contained** — it
assumes no prior context.
**Status:** Nothing built. Architecture decided, hosting costed, several questions still open.

---

## 1. What the product is

**Matic Desk** is an AI IT-support assistant for corporate Windows endpoints. It replaces
outsourced L1 service desk work. A user talks to an animated avatar in their taskbar; it diagnoses
the problem, fixes it on the machine, and escalates to a ticketing system when it cannot.

**Target buyer:** small-to-large companies currently paying for offshore L1 support.

### What already exists (the client)

A working demo, built and verified on real hardware:

- **Electron app.** CSS-drawn robot avatar, local Piper TTS with lip-sync.
- **Two-half design.** Unprivileged agent (UI, model client, router) and privileged broker (executes
  four native Win32 primitives: `restart_service`, `flush_dns`, `renew_dhcp`, `reset_adapter`).
- **Tier-0 deterministic router** runs locally *before* any model call. Network recovery works
  offline with no model involved.
- **Consent tokens**, schema-validated parameters, local audit log.
- Standalone mode only — a directly supplied API key, no server.

**The client is deliberately ahead of the hub.** Standalone mode was chosen so the endpoint could be
built and tested before the hub existed.

### What the hub is for

Everything the endpoint cannot do alone: fleet identity, signed content distribution, central audit,
tenant policy, credential custody, and one ITSM connection per customer.

---

## 2. Confirmed customer constraints

From a design-partner meeting on 2026-08-09 and follow-ups. **Single source, one company** — treat
as firm constraints for this customer, not market facts.

| Constraint | Consequence |
|---|---|
| No discrete GPUs in the fleet | No local model on endpoints. Server-side inference or cloud only |
| Disk and memory watched | Endpoint footprint is scrutinised |
| **No local LLM on endpoints** | Confirmed. A 63 MB local TTS model is the only on-device model |
| **Users have no local admin** | The broker is mandatory, not optional |
| **No EDR currently deployed** | Unusual. Assume it will exist by deployment; build accordingly |
| **No privilege-elevation tooling** | Nothing to integrate with. Our broker is the mechanism |
| ServiceNow at the design partner | First ITSM adapter. Most customers will not have it |
| macOS eventually required | Windows first. No decision may foreclose macOS |

---

## 3. The seven invariants — NON-NEGOTIABLE

These are the security architecture. Changing any one requires redesigning the safety model. They
are also the right artifact to put in front of a customer's security reviewer.

| | Rule |
|---|---|
| **H1** | The playbook signing key never lives on the hub |
| **H2** | The hub distributes policy; the endpoint enforces it |
| **H3** | No cloud credentials on the endpoint **in joined mode**. Standalone is a declared, bounded exception capped at risk tier R1 |
| **H3b** | Playbook parameters are schema-constrained, never freeform strings |
| **H3c** | `toolConfig` is a schema-enforcement device, never an executor binding |
| **H3d** | Playbooks are sequences of typed primitives, never scripts |
| **H3e** | The model never authors the text a user consents to — consent wording is catalog data |

**H1 is the one most likely to be violated by convenience.** The hub distributes playbooks, and
playbooks execute privileged operations. If the hub can sign them, then compromising the hub means
remote code execution on every endpoint of every customer. Sign in KMS with a policy that explicitly
denies the hub's task role, or sign offline. The endpoint verifies before executing.

**H2 in practice:** hub compromise should cost confidentiality of history, not control of the fleet.

---

## 4. What the hub owns

| Component | Notes | Priority |
|---|---|---|
| Device enrollment and identity | Per-endpoint identity scoped to a tenant. Foundation for everything else | 1 |
| Signed catalog distribution | Versioned, per-tenant, signature verified on the endpoint. How draft-and-approve authoring reaches machines | 1 |
| Telemetry and audit ingestion | Consent tokens, playbook runs, refusals, outcomes. The entire auditability story | 1 |
| Tenant configuration | Approved playbooks, risk tier policy, redaction rules, model provider selection | 1 |
| Agent release channels | Versioned releases with canary rings | 2 |
| Inference proxy | Single egress point. Holds credentials, meters tokens, versions prompts | 2 |
| ITSM adapter layer | One adapter per system. ServiceNow first. Endpoints never talk to a ticketing system directly | 2 |
| Interaction history | Hub owns its own conversation history | 3 |
| Internal ticket store | ~15 fields, a status machine, a list view. For customers with no ITSM | 3 |

### What the hub must NOT own

- **The conversation loop.** Stays on the endpoint, or offline mode dies.
- **Execution authority.** Stays with the local broker. The hub never decides that an action may run.

---

## 5. Hard architectural constraints

**Exactly two stateful dependencies: PostgreSQL and object storage. Nothing else.**

- **No Redis.** Job queue in Postgres via `SELECT ... FOR UPDATE SKIP LOCKED`.
- **No Elasticsearch.** Postgres full-text search is ample at pilot scale.
- Object storage for signed catalog bundles and agent binaries.

This is deliberate and load-bearing. It came from evaluating Zammad and Chatwoot, both of which need
Rails + Postgres + Redis + Sidekiq (+ Elasticsearch). For a small team every extra daemon is a pager.
It is *also* what keeps a customer-hosted deployment possible — a container plus Postgres plus object
storage can run on Fargate, in a customer's AWS account, or on a box in their server room.

**Infrastructure-as-code from the first commit.** Terraform or CDK. The hub must deploy into a
customer's own AWS account from the same artifact; a hand-configured box cannot be handed over.

**Twelve-factor, strictly.** Config from environment, no local disk state, no platform-specific
services. This is what makes the Phase 1 → Phase 2 hosting migration an IaC change rather than an
application change.

---

## 6. Multi-tenancy — decide before the first migration

Three options: shared tables with a `tenant_id` column and application-level filtering; shared tables
with row-level security; **schema-per-tenant**.

**Recommendation: schema-per-tenant.**

Application-level `WHERE tenant_id` filtering is what most people build and it fails the same way
everywhere — one missing clause is a cross-tenant leak. Schema-per-tenant is a real boundary,
per-customer export and deletion become trivial (which matters for retention obligations), and a bug
leaks nothing. The cost is migration complexity as tenant count grows, which is a good problem.

**Changing this later means moving production data.** Decide first.

---

## 7. Identity and enrollment

**Open — this is the first thing to design.**

- How does a machine authenticate to the hub? A per-device credential is the obvious answer, and it
  brings enrollment, rotation and revocation — fleet problems, not app problems.
- **The client must never hold a shared secret that would let one machine act as another.**
- mTLS or a signed device token both work. **Decide before the client work starts**, because it
  changes where credentials live and therefore what the broker must protect.

### Enrollment must work like joining a domain

The product has two modes, and the analogy is workgroup vs domain-joined:

| | Standalone (workgroup) | Joined (domain) |
|---|---|---|
| Inference | Local API key | Hub proxy; credential is device identity |
| Catalog | Signed bundle from CDN | Signed bundle via hub. **Same signed artifact** |
| Policy | Conservative defaults in the catalog | Tenant policy from hub |
| Audit | Local file | Streamed to hub |
| Knowledge base | Generic only | Customer KB |
| ITSM | **None** | Full |
| Max risk tier | **R1** | R2 |

Two requirements:

1. **A standalone install must convert to joined without reinstalling.** The agent is already there;
   it acquires an identity and starts taking policy from a new source. Cheap to design in, painful
   to retrofit onto live machines.
2. **A joined machine that loses the hub must NOT fall back to standalone.** That would be a
   security downgrade triggered by a network outage. It degrades to offline mode instead.

**ITSM in standalone is a hard no.** ITSM credentials are org-wide, not per-user — worse on an
endpoint than an API key.

---

## 8. API surface

### Ticketing

- `POST /tickets` with a **client-generated idempotency key**, returning a ticket ID.
  Idempotency keys from day one, not after the first duplicate.
- **Attachments: separate upload returning a handle**, referenced by the ticket. Not inline base64.
  Screenshots are large and a failed retry must not re-send them.
- **Size and type limits enforced server-side**, and the client told what they are rather than
  discovering them by rejection.
- **Versioned from the first release.** This client will be in the field longer than the API is
  stable.

### Reuse the consent flow for ticketing

The endpoint already has: propose → validate → show the user exactly what will happen → single-use
token bound to a proposal hash → execute → audit. **Filing a ticket is the same shape.** Do not
invent a second approval mechanism.

**Give egress its own risk tier.** R1/R2 describe local disruption. *"This leaves the machine"* is a
different thing to ask someone to weigh, and the consent card must say so.

**Screenshots are the risk.** Exact image shown full size before approval; user-chosen region, never
the full desktop by default; opt-in per ticket; nothing captured speculatively; the audit record
stores a hash, never the image.

### Correlation

The audit record should carry the ticket ID and the ticket should carry the audit IDs, so a support
engineer can see which local actions were taken before an escalation.

### Operational

- **What does the client do on 5xx or unreachable?** Refuse plainly, or queue. **A queue is a whole
  subsystem — do not build one by accident.**
- **Rate limiting per device**, so a looping client cannot flood the hub.

---

## 9. Data handling — answer before the first ticket is filed

These are the questions a customer's IT lead will ask, and the answers need to be written down
*before* there is data, not after.

- What is retained, for how long, and who can read it?
- Is the transcript stored, and separately from the ticket body?
- Are screenshots scanned or redacted, or stored as supplied?
- Is any of it used for training or analytics?
- **Redaction runs before egress regardless of destination** — including to a customer's own internal
  model. "Internal" is not the same as "in scope for this data."

**Data residency is unresolved.** It is question 18 on the outstanding customer list.

---

## 10. Hosting — verified pricing, 2026-08-05

All rates read from AWS pricing pages and AWS's own pricing data feed on 2026-08-05. NAT / endpoint /
RDS figures are US East (Ohio); Fargate is US East (N. Virginia).

### Phase 1 — through pilot, ~$46/month

- **ALB** across two public subnets with an ACM certificate. Agents need inbound TLS; rolling our own
  is worse than $16/month. ALB requires subnets in two AZs but has no per-AZ charge.
- **Fargate ARM**, 0.5 vCPU / 1 GB, in a **public subnet** with a public IP, security group allowing
  inbound **only from the ALB's security group**. This is what removes the NAT Gateway.
- **RDS PostgreSQL db.t4g.micro, single-AZ**, private subnet.
- **S3 gateway endpoint** — free. Take it unconditionally.
- **No NAT, no Multi-AZ, no PrivateLink.**

| Item | Verified rate | Monthly |
|---|---|---|
| ALB base | $0.0225/hr | $16.43 |
| Fargate ARM 0.5 vCPU / 1 GB | $0.0000089944/vCPU-s + $0.0000009889/GB-s | $14.42 |
| Public IPv4 | $0.005/hr | $3.65 |
| RDS db.t4g.micro single-AZ | $0.016/hr | $11.68 — **free 12 months** |
| S3 gateway endpoint | no charge | $0.00 |
| NAT Gateway | avoided | $0.00 (would be $32.85/AZ) |
| **Total** | | **~$46, ~$34 in year 1** |

New AWS accounts get **$200 in credits** (12 months) plus RDS free tier (750 hrs single-AZ, 20 GB
storage, 20 GB backups, 12 months).

### Key findings

- **AWS App Runner is closed to new customers.** AWS docs: *"AWS App Runner is no longer open to new
  customers."* No AWS account exists yet, so it is unavailable. Do not plan around it.
- **NAT Gateway is the biggest avoidable cost** — $32.85/month per AZ before traffic. Interface
  endpoints at $7.30/month each do not replace it, because general internet egress is needed for
  ServiceNow and third-party model providers.
- **ARM/Graviton is ~20% cheaper** than x86 for identical work. Build ARM images from day one — a
  base-image choice now, a rebuild later.
- **RDS T4g runs in Unlimited mode**; CPU credits beyond baseline bill at $0.075/vCPU-hour. A
  burstable instance under sustained load can cost more than the next size up.
- **SSM Parameter Store standard tier is free.** Use it instead of Secrets Manager ($0.40/secret/
  month, which accumulates per tenant). Caveat: 4 KB value limit, no built-in rotation.

### Phase 2 — second or third customer, ~$216/month

Tasks to private subnets, NAT appears, second AZ, RDS Multi-AZ (exactly 2× instance cost), interface
endpoints if security review asks. **Almost all of the increase buys availability, not capability.**

Every step is an IaC change, not an application change — *provided* the twelve-factor rule holds.

---

## 11. Region and models

**Region: us-east-1**, pending the data-residency answer.

It is the only **commercial** US region with In-Region support across the Anthropic and Nova
families. In us-east-2, us-west-1 and us-west-2 those models are geo-only, meaning a request placed
there may be processed in another US region.

### Bedrock has three routing modes, and the mode IS the modelId prefix

| Mode | Residency | modelId |
|---|---|---|
| In-Region | Strictly one region | `anthropic.claude-...` |
| Geo cross-region | Within the US geography | `us.anthropic.claude-...` |
| Global cross-region | Any commercial region | `global.anthropic.claude-...` |

No cross-region surcharge; all priced at source-region rates, and global is sometimes cheaper.

**Consequence: residency posture and model identifier are a single configuration value.** Make the
full modelId — prefix included — **tenant configuration, never hardcoded.** One code path then serves
strict-single-region, US-geo and global customers.

### Certified model set (all In-Region in us-east-1)

- **Claude Haiku 4.5** — routine turns
- **Claude Sonnet 5** — escalation. Also In-Region in us-gov-west-1, giving a public-sector path
- **Amazon Nova Lite** — vendor diversity. Also GovCloud
- **Titan Text Embeddings V2** — embeddings. Widest In-Region US coverage: three commercial regions
  plus both GovCloud regions

**Embeddings are the least reversible model decision.** Changing the chat model is config; changing
the embedding model means re-embedding every tenant's corpus. Treat it as a schema decision.

**Gemini is not on Bedrock** — Google's presence there is Gemma (open weights). A customer wanting
Gemini needs a direct integration outside Bedrock. The provider abstraction must therefore support
non-Bedrock providers, not merely different modelIds.

**Pricing for these models is NOT verified.** Pull per-token rates before building a cost model.

---

## 12. Provider abstraction

Build **one `OpenAICompatibleProvider`**, not per-vendor clients. Ollama, LM Studio, vLLM, a
customer's own endpoint and OpenAI all speak it — base URL is the only difference. That single
adapter **is** the customer-hosted tier.

**The interface returns a structured proposal, not a tool call:** given system prompt, conversation,
retrieved chunks and capability catalog, return a proposed capability selection or a natural-language
response. Depending on any vendor's tool-calling dialect welds you to that vendor. The existing
invariant — model proposes, broker validates — is what makes swapping nearly free.

Three tiers to offer:

1. **Managed (default).** We provide inference. We own quality and cost. Best margin.
2. **Bring your own key.** Customer supplies credentials, routed through the hub. Supported only for
   a **named, short list of certified models** — not "any endpoint."
3. **Customer-hosted.** OpenAI-compatible endpoint on their network. Best-effort, excluded from
   deflection commitments, must pass a conformance test.

**The largest hidden cost is the test matrix.** Certify per *tier*, not per customer.

---

## 13. Retrieval

**Do your own retrieval; do not use Bedrock Knowledge Bases initially.** Embed the corpus, keep the
index in something you control, retrieve locally, send only retrieved chunks to the model.

Reasons: chunking, hybrid search and reranking stay tunable (RAG quality is the biggest product
risk); the corpus can stay inside the customer boundary; and it is what makes the model genuinely
interchangeable.

**Note a correction:** an earlier cost argument for this was wrong. OpenSearch Serverless *NextGen*
collections scale to zero with no minimum OCU. But **Classic collections carry a verified 2-OCU
minimum, roughly $350/month standing** at $0.24/OCU-hour. If Bedrock Knowledge Bases is ever used,
**check which collection type it provisions** — the difference is ~$350/month of pure standing cost.

---

## 14. Effort and phasing

**Minimal hub: 8–14 engineer-weeks.** An estimate derived from the component list, not a measurement.

Suggested order:

1. **Identity and enrollment** (§7) — everything else depends on it
2. **Signed catalog distribution** (§4, H1) — the trust root
3. **Audit ingestion** (§4) — including refusals, not just executions
4. **Tenant config** (§4)
5. **ITSM adapter — ServiceNow** (§8)
6. **Inference proxy** (§4)

Items 1–4 are the minimum that makes "joined mode" mean anything.

---

## 15. Decided vs open

### Decided

Two stateful dependencies only · schema-per-tenant · IaC from commit one · ARM images · Fargate +
ALB + RDS single-AZ for Phase 1 · us-east-1 pending residency · certified model set · modelId as
tenant config · own retrieval · one OpenAI-compatible provider adapter · standalone caps at R1 ·
ITSM is hub-only · SSM Parameter Store over Secrets Manager.

### Open — needs a decision

- **Device authentication mechanism** (mTLS vs signed device token). Blocks client work.
- **Whose AWS account** — ours multi-tenant, or the customer's. Design for both.
- **Data retention policy** (§9). Needed before the first ticket.
- **Offline ticket behaviour** — refuse or queue.
- **Data residency** — customer question 18, outstanding.

### Open — needs customer data

- **Top-30 L1 ticket categories with volumes.** Outstanding for three weeks. Blocks playbook
  selection and the model-eval golden set.
- ServiceNow instance details: version, incident table fields as actually used, sanctioned API,
  credential issuance, sandbox access.

---

## 16. Verification register

**Verified against vendor documentation on 2026-08-05:** all AWS pricing in §10; App Runner closed
to new customers; Bedrock regional availability and the three routing modes in §11; OpenSearch
Serverless NextGen vs Classic minimums in §13.

**Verified by reading the client source:** the seven invariants are implemented in the demo; the
broker contract; consent tokens bound to a proposal hash.

**NOT verified:** Bedrock per-token pricing for any model — the cost model rests on this. Ollama's
current structured-output API. Client framework maturity (knowledge cutoff ~May 2026).

**Estimates, not measurements:** the 8–14 engineer-week hub figure; all phasing durations.

**Single-source facts:** every constraint in §2 comes from one design-partner meeting describing one
company. Firm constraints for this customer; not market facts.

**No performance number anywhere in this project has been measured.** Every figure is a target.
