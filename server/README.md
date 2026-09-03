# server/ — the Matic Desk hub

**Nothing is built here yet.** This directory exists so the hub has a home before the first
commit of code, and so `client/` and `server/` are siblings from day one.

| Read | For |
|---|---|
| [`SPEC-2026-09-02-hub-server-side.md`](SPEC-2026-09-02-hub-server-side.md) | The hub specification, v1. **Partially stale**: the register's §3 and §4 list every delta (Bedrock is out, the internal ticket store is core, three connectivity states, and more). Read it with the register open. |
| [`../docs/decisions/DECISION-REGISTER.md`](../docs/decisions/DECISION-REGISTER.md) | Every decision that amends the spec. D42–D90 (KB, connectivity, inference, identity, enrollment, tickets, dashboard), D91–D129 (Bedrock removal, updates, notifications, egress), D130–D150 (from the independent review). |

## Phase-one scope, as proposed (D149, not yet ratified)

Identity, inference proxy, audit ingestion, internal ticket store with email notification, KB
retrieval. **Not** in phase one: signed catalog distribution, per-tenant catalogs, release channels,
canary rings, a tenant policy engine. The four endpoint primitives ship as a vendor-signed static
bundle inside the MSI and need nothing from the hub.

## Decisions that shape the first commit

- **Tenancy and queue (D143):** shared control-plane schema plus per-tenant data schemas. Unblocks the first migration.
- **Device auth (D60–D65, D146):** broker-held TPM-backed key, signed assertion exchanged for a short-lived token; mTLS rejected on documentation.
- **Region and residency (D141):** us-east-2 unless residency says otherwise; residency is an Anthropic model question.
- **Cost (D138, D140):** Anthropic Scale tier as a prerequisite; per-tenant workspaces; the routine model cannot cache its prompt as shipped.
- **Stack (spec §5):** Postgres with pgvector and object storage as the only stateful dependencies, plus outbound email (D86).

## Layout when code arrives

```
server/
  README.md
  SPEC-2026-09-02-hub-server-side.md
  src/            the hub service
  infra/          Terraform
  migrations/
  test/
```

Unverified vendor claims in the spec carry `[VERIFY]`; the register's §10 says which the 2026-09-02
review confirmed against primary sources.
