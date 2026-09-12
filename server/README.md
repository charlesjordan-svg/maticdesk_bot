# server/ — the Matic Desk hub

**B0 walking skeleton plus the B1 control plane, 2026-09-03.** One Node HTTP service, one route,
one provider, **no authentication, loopback only** — and, beside it and not wired to it, the
control-plane schema, migration runner and job queue (D143, D193–D197).

**`POST /v1/turn` is still stateless and must stay that way.** B1 deliberately did not retrofit
persistence into it; `test/db-static.test.mjs` §6 fails if `src/turn.js` or `src/index.js` ever
imports anything under `src/db/`. Everything else the hub will be — device auth, tenancy
enforcement, KB retrieval, audit ingestion, TLS, spend caps — is still unbuilt.

**B1's six exit criteria pass**: `npm.cmd run test:db`, 84 assertions on PostgreSQL 17.11 with
pgvector, including against a destroyed-and-rebuilt volume, and since 2026-09-12 the job queue's
RUNTIME (D270: `src/jobs/runner.js`, started by the hub after listen; at-least-once). See
[`docs/B1-CONTROL-PLANE.md`](docs/B1-CONTROL-PLANE.md) — and its §6 before answering any question
about tenant isolation.

| Read | For |
|---|---|
| [`src/index.js`](src/index.js) | The service. Binds `127.0.0.1`, refuses non-loopback peers, warns on every start, stamps `x-matic-hub-auth: none` on every response. `authenticate()` is the slot where the device assertion → token exchange (D61, D132) goes; it authenticates nobody today and says so. |
| [`src/turn.js`](src/turn.js) | `POST /v1/turn`. The endpoint sends the sentence, the machine state and **its** tool schemas; the hub builds the prompt with **`../client/src/agent/prompt.js`** (imported, not reimplemented) and returns the model's tool call as the model returned it. |
| [`src/providers/openai-compatible-provider.js`](src/providers/openai-compatible-provider.js) | The one provider, targeting local Ollama. Provider abstraction from the first commit even though there is one. Same request body as the client's direct path — temperature 0, `max_tokens` 2048, `tool_choice: "required"`. |
| [`test/turn.test.mjs`](test/turn.test.mjs) | Headless, stub provider. Pins pass-through, the no-repair rule, the prompt import, the loopback rule and the auth stamp. 33 assertions. |
| [`docs/B1-CONTROL-PLANE.md`](docs/B1-CONTROL-PLANE.md) | **B1.** The schema, the migration path, and §6 — what tenant isolation actually proves and what it does not. Read §6 before answering a security question about tenancy. |
| [`src/db/tenant.js`](src/db/tenant.js) | **The security-relevant file.** `withTenant()` is the only way to reach a tenant's tables; it asserts the schema against `control.tenants` before it sets `search_path`, because `SET` takes no bind parameter and the allow-list *is* the injection defence. |
| [`test/db-static.test.mjs`](test/db-static.test.mjs) | B1's design rules, no database needed. 60 assertions, in `npm test` — including that tenant/004 is byte-for-byte what the ledgers hold (its checksum is pinned) and that tenant/005's rename is guarded. |
| [`test/db.test.mjs`](test/db.test.mjs) | B1's six exit criteria plus the runtime (§6b). **84 assertions, passing.** Needs Postgres: `npm.cmd run db:up && npm.cmd run test:db`. Creates and removes its own `b1-test-*` tenants, and migrates first, so it is safe on a fresh or an in-use database. |
| [`src/jobs/runner.js`](src/jobs/runner.js) | **The job queue's runtime (D270).** Read its header before writing a handler: AT-LEAST-ONCE, idempotency is the handler's job, a process claims only the types in `src/jobs/handlers.js` and reports what it leaves. |
| [`test/jobs.test.mjs`](test/jobs.test.mjs) | The runner's loop with fake primitives, and its source rules. 67 assertions, in `npm test`. |
| [`docs/2026-09-03-B0-walking-skeleton-spec.md`](docs/2026-09-03-B0-walking-skeleton-spec.md) | The B0 spec, filed 2026-09-03 night. **Read its status block first** — its §5 "35/40" target is superseded — and §5a for what each acceptance item maps to. |
| [`SPEC-2026-09-02-hub-server-side.md`](SPEC-2026-09-02-hub-server-side.md) | The hub specification, v1. **Partially stale**: the register's §3 and §4 list every delta. Read it with the register open. |
| [`../docs/decisions/DECISION-REGISTER.md`](../docs/decisions/DECISION-REGISTER.md) | Every decision that amends the spec. |

The B0 spec was missing when this skeleton was built (it went up from the handover summary in
`Downloads\2026-09-03-claude-code-handover-first-build-steps.md` Task 2) and **has since been filed**
at [`docs/2026-09-03-B0-walking-skeleton-spec.md`](docs/2026-09-03-B0-walking-skeleton-spec.md).
Reading it changed one conclusion: its §5 target of "the bake-off should reproduce 35/40" is wrong —
both paths scored 33/40 and were identical on all 40 cases. Its §5a now maps every acceptance item
to a test.

## Run

```bash
cd server
npm.cmd install                  # pg is server/'s first dependency (B1)
npm.cmd test                     # headless; no model, no database: 33 + 43 = 76 assertions
npm.cmd start                    # http://127.0.0.1:8787 - needs Ollama with mistral-small:24b resident

# B1 — the control plane. Needs Docker.
npm.cmd run db:up                # docker compose up -d   (PostgreSQL 17 + pgvector, port 5433)
npm.cmd run migrate              # control plane, then every tenant schema, in one run
npm.cmd run db -- create-tenant acme-corp
npm.cmd run db -- status
npm.cmd run test:db              # the six exit criteria: 56 assertions
npm.cmd run db:down              # and delete the volume
```

Environment: `MATIC_HUB_PORT` (8787), `MATIC_HUB_UPSTREAM` (`http://127.0.0.1:11434/v1`),
`MATIC_HUB_MODEL` (`mistral-small:24b`), `MATIC_HUB_TIMEOUT_MS` (300000), `MATIC_DB_URL`
(`postgres://matic:matic@127.0.0.1:5433/matic` — **5433, not 5432**, so a real local Postgres cannot
be reached by accident), `MATIC_DB_MAX` (10). No config file yet. **`npm install` IS now needed:**
B1 added `pg`, server/'s first dependency. The B0 hub itself still imports nothing outside Node.

Client side: `client/config.json` `provider: "hub"` (or `MATIC_PROVIDER=hub`) and `hubUrl`. The
provider is `client/src/agent/hub-client.js`; proposals carry `source: "hub"` and `hubProvider`,
**the hub's claim** about where the sentence went next, never the endpoint's knowledge.

Bake-off through the hub: `node eval/run-bakeoff.mjs --hub http://127.0.0.1:8787 mistral-small:24b`
from `client/`, with the hub running and the model warm. Result on 2026-09-03: see
`client/docs/BAKEOFF-2026-09-02.md` §2c.

## Rules this skeleton holds

- **Faithful pass-through.** Malformed provider output is an error (`502`), never a repair, reshape or
  guess. A hub that fixes proposals becomes an authority on capabilities (H2).
- **No catalog on the hub.** The endpoint sends its tool schemas with every turn (D149); the test
  asserts no file under `src/` reads `catalog.json` or imports `broker/`.
- **One prompt.** `systemPrompt`, `machineStateBlock` and the OpenAI tool wrapper are imported from
  the client. Two wordings would measure the wording, not the model.
- **No authentication, loudly.** Do not add a half-built auth layer; it would invite trust.

## Out of scope and visibly so

**For the B0 route:** device auth, tenancy, persistence, KB retrieval, audit ingestion, TLS, spend
caps. None has a stub, and `/v1/turn` reaches none of them.

**For B1:** enrollment logic (B3), the ticket store, KB tables (B7), audit ingestion (B5). The
control-plane tables for devices, enrollment, releases, admin identity and vendor grants are
**shapes, not features** — they exist so later items add rows rather than columns, and none of them
has logic behind it. Their CHECK constraints do encode real decisions (D153's window requirement,
D155/D159's credential rule) and those are tested.

## Phase-one scope, as proposed (D149, not yet ratified)

Identity, inference proxy, audit ingestion, internal ticket store with email notification, KB
retrieval. **Not** in phase one: signed catalog distribution, per-tenant catalogs, release channels,
canary rings, a tenant policy engine. The four endpoint primitives ship as a vendor-signed static
bundle inside the MSI and need nothing from the hub.

## Decisions that shape the first real commit

- **Tenancy and queue (D143): built in B1.** Shared control-plane schema plus per-tenant data schemas; `SET LOCAL search_path` inside the transaction (D194); the job queue carries references, never payloads (D196); pgvector installed once database-wide (D193). **`search_path` is not a permission boundary** — D195, and `docs/B1-CONTROL-PLANE.md` §6.
- **Device auth (D60–D65, D146):** broker-held TPM-backed key, signed assertion exchanged for a short-lived token; mTLS rejected on documentation.
- **Region and residency (D141):** us-east-2 unless residency says otherwise.
- **Cost (D138, D140):** Anthropic Scale tier as a prerequisite; per-tenant workspaces.
- **Stack (spec §5):** Postgres with pgvector and object storage as the only stateful dependencies, plus outbound email (D86).

## Layout

```
server/
  README.md
  SPEC-2026-09-02-hub-server-side.md
  docker-compose.yml            PostgreSQL 17 + pgvector, loopback, port 5433 (D197)
  package.json
  bin/db.mjs                    migrate | create-tenant | tenants | status
  docs/2026-09-03-B0-walking-skeleton-spec.md
  docs/B1-CONTROL-PLANE.md
  migrations/control/           the shared control plane
  migrations/tenant/            the per-tenant template, applied to every schema
  src/index.js                  the service (bind, loopback rule, auth slot, routes)
  src/turn.js                   POST /v1/turn - STATELESS, and stays so
  src/providers/                one provider today
  src/db/pool.js                one pool; withControl()
  src/db/tenant.js              assertTenantSchema(), withTenant() - the only door
  src/db/migrate.js             the runner: two ledgers, checksums, one txn per migration
  src/db/tenants.js             createTenant()
  src/db/jobs.js                enqueue(), claim(), runOne()
  test/turn.test.mjs            33
  test/db-static.test.mjs       43, no database
  test/db.test.mjs              the six exit criteria, needs Postgres
```
