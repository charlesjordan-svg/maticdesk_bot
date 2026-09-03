# server/ — the Matic Desk hub

**B0 walking skeleton, 2026-09-03.** One Node HTTP service, one route, one provider, **no
authentication, loopback only.** Everything else the hub will be is still unbuilt, and nothing here
should be mistaken for a start on it.

| Read | For |
|---|---|
| [`src/index.js`](src/index.js) | The service. Binds `127.0.0.1`, refuses non-loopback peers, warns on every start, stamps `x-matic-hub-auth: none` on every response. `authenticate()` is the slot where the device assertion → token exchange (D61, D132) goes; it authenticates nobody today and says so. |
| [`src/turn.js`](src/turn.js) | `POST /v1/turn`. The endpoint sends the sentence, the machine state and **its** tool schemas; the hub builds the prompt with **`../client/src/agent/prompt.js`** (imported, not reimplemented) and returns the model's tool call as the model returned it. |
| [`src/providers/openai-compatible-provider.js`](src/providers/openai-compatible-provider.js) | The one provider, targeting local Ollama. Provider abstraction from the first commit even though there is one. Same request body as the client's direct path — temperature 0, `max_tokens` 2048, `tool_choice: "required"`. |
| [`test/turn.test.mjs`](test/turn.test.mjs) | Headless, stub provider. Pins pass-through, the no-repair rule, the prompt import, the loopback rule and the auth stamp. |
| [`SPEC-2026-09-02-hub-server-side.md`](SPEC-2026-09-02-hub-server-side.md) | The hub specification, v1. **Partially stale**: the register's §3 and §4 list every delta. Read it with the register open. |
| [`../docs/decisions/DECISION-REGISTER.md`](../docs/decisions/DECISION-REGISTER.md) | Every decision that amends the spec. |

The B0 spec itself (`2026-09-03-B0-walking-skeleton-spec.md`, meant for `server/docs/`) **was not on
disk on 2026-09-03**; this skeleton was built from the summary in
`Downloads\2026-09-03-claude-code-handover-first-build-steps.md` Task 2. Its §5 acceptance list is
therefore unknown here — see `PROJECT_START_HERE.md`.

## Run

```bash
cd server
npm.cmd test                     # headless; no model needed
npm.cmd start                    # http://127.0.0.1:8787 - needs Ollama with mistral-small:24b resident
```

Environment: `MATIC_HUB_PORT` (8787), `MATIC_HUB_UPSTREAM` (`http://127.0.0.1:11434/v1`),
`MATIC_HUB_MODEL` (`mistral-small:24b`), `MATIC_HUB_TIMEOUT_MS` (300000). No config file yet; no
dependencies — `npm install` is not needed.

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

Device auth, tenancy, persistence, KB retrieval, audit ingestion, TLS, spend caps. None has a stub.

## Phase-one scope, as proposed (D149, not yet ratified)

Identity, inference proxy, audit ingestion, internal ticket store with email notification, KB
retrieval. **Not** in phase one: signed catalog distribution, per-tenant catalogs, release channels,
canary rings, a tenant policy engine. The four endpoint primitives ship as a vendor-signed static
bundle inside the MSI and need nothing from the hub.

## Decisions that shape the first real commit

- **Tenancy and queue (D143):** shared control-plane schema plus per-tenant data schemas.
- **Device auth (D60–D65, D146):** broker-held TPM-backed key, signed assertion exchanged for a short-lived token; mTLS rejected on documentation.
- **Region and residency (D141):** us-east-2 unless residency says otherwise.
- **Cost (D138, D140):** Anthropic Scale tier as a prerequisite; per-tenant workspaces.
- **Stack (spec §5):** Postgres with pgvector and object storage as the only stateful dependencies, plus outbound email (D86).

## Layout

```
server/
  README.md
  SPEC-2026-09-02-hub-server-side.md
  package.json
  src/index.js                  the service (bind, loopback rule, auth slot, routes)
  src/turn.js                   POST /v1/turn
  src/providers/                one provider today
  test/turn.test.mjs
  infra/  migrations/           when there is something to put in them
```
