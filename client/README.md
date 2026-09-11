# Matic Desk — the endpoint (`client/`)

> Part of the `maticdesk_bot` monorepo: `client/` (this), `server/` (the hub, not built), and
> `docs/decisions/` (the decision register). Repo-wide index: [`../PROJECT_START_HERE.md`](../PROJECT_START_HERE.md).

Electron desktop app demonstrating the Matic Desk IT support assistant **actually fixing a
Windows machine through conversation**. Built against `2026-09-02-claude-code-demo-brief.md`.

The point of the demo is real execution. Everything privileged goes through the `Broker`
interface in [`src/broker/broker.d.ts`](src/broker/broker.d.ts).

## Run

```bash
npm install
npm run fetch-voice
```

The four primitives need admin rights, so the demo build runs as a single elevated process
(handover §2 — the privilege split is Phase 1, not in scope):

```bash
npm run start:elevated
```

Unelevated (`npm start`) is also useful: detection, the tier-0 router, the proposal, validation
and consent all work, and privileged actions report *"this needs the broker"* rather than failing
as a user error — which is the behaviour the real fleet needs (§12).

### Prerequisites

- **Node** (built on v24) and **`py -3`** (Python 3.11; `python` is not on PATH on this machine)
- **Piper voice model** — 63 MB, not committed. Fetch it once with `npm run fetch-voice`, which
  downloads `en_US-amy-medium.onnx` and its `.onnx.json` sidecar into `voices/` from the public
  Piper voices repository (Hugging Face `rhasspy/piper-voices`, tag `v1.0.0`). `config.json`
  points at `voices/en_US-amy-medium.onnx`, relative to the app root; set `MATIC_VOICE_MODEL` to use
  a model elsewhere. Without it the app runs text-only and says so.
- **`ANTHROPIC_API_KEY`** for cloud reasoning. Without it the app still runs: the tier-0 router
  handles the printer and network scenarios locally and the UI says the cloud is unavailable.

Put the key in a `.env` file in the project root (gitignored):

```
ANTHROPIC_API_KEY=sk-ant-...
```

**Use the file, not a session variable.** Elevation via `RunAs` starts a new process that does
not inherit session environment variables, so a key exported in an ordinary shell never reaches
the elevated app. The file also keeps the key out of the registry and off any command line where
it would appear in the process list. An already-set `ANTHROPIC_API_KEY` env var takes precedence.

The startup log states which source was used: `[cloud] claude-haiku-4-5 ready (key from .env file)`.

### PowerShell execution policy

If `npm run ...` fails with *"npm.ps1 cannot be loaded because running scripts is disabled"*,
use `npm.cmd` instead — it skips the PowerShell shim and needs no policy change:

```powershell
cd C:\Users\Charles\Downloads\maticdesk_bot\client
npm.cmd start
```

## Verify

```bash
npm test
```

Runs the broker/router/consent suite headless (17 checks), including a real `flush_dns`
execution, schema rejection of an off-enum parameter, and single-use consent-token binding.

```bash
npm run verify:privileged
```

**Run this elevated on the demo machine before rehearsing.** It is the gate on the irreducible
core (§9): it stops the spooler, then drives the real agent → broker → Win32 path to restart it
and reports the actual before/after service state. Add `-IncludeNetwork` to also exercise the
disruptive R2 `reset_adapter`.

## Stage tooling

```bash
npm run inject-fault -- -Fault printer     # or network | dhcp | sound
npm run reset-demo                         # restores services + adapters, clears the audit log
```

Both must be run elevated, and `reset-demo` must be run **locally** — it re-enables network
adapters, so over a remote session you would already be disconnected. Both still need testing on
the actual demo machine, not the dev box (§10).

## Architecture

```
src/
  broker/
    broker.d.ts            THE contract. Demo: InProcessBroker. Phase 1: NamedPipeBroker.
    in-process-broker.js   validate -> mintConsentToken -> execute, + audit
    schema.js              parameter validation (the §5 invariant lives here)
    catalog.json           the four capabilities + policy
    capabilities/index.js  the four primitives + the unprivileged probe
    win32/{scm,net}.js     native bindings. PRIVILEGED - broker-only imports
  router/tier0.js          local deterministic router; runs BEFORE any cloud call
  agent/
    agent.js               unprivileged. tier-0 first, cloud second
    cloud-client.js        Anthropic client; tool surface generated from the catalog
  main/                    Electron main, preload, Piper worker management
  renderer/                UI + avatar + viseme driver (no broker logic)
```

`src/main/main.js` is the only file that names a broker implementation. Swapping
`InProcessBroker` for `NamedPipeBroker` there is the whole Phase 1 change at the call sites.

See [`docs/BROKER-SURFACE.md`](docs/BROKER-SURFACE.md) for every native API, service and registry
key the privileged half touches — the allowlisting document (§12).

## What is real, and what is not

Real:

- All four primitives are native Win32 calls (`advapi32`, `dnsapi`, `iphlpapi` via koffi). No
  `cmd.exe`, no `powershell.exe`, no `sc.exe`/`netsh`, no encoded command strings.
- Machine detection is live: service states, adapter IP/gateway/DHCP/link state.
- The tier-0 router runs locally and skips the cloud entirely on a confident match.
- Consent tokens are single-use, time-limited, and bound to a hash of the exact proposal.
- Every execution attempt — success, refusal, or failure — writes an audit record.
- `flush_dns` verified executing for real, unelevated, through the full UI path.

Stubbed or unverified, and marked `TODO(phase1)` in code:

- **Catalog signature verification is stubbed.** The broker logs this loudly at startup.
- **The audit log is a file beside the app**, not a location the user cannot modify.
- **`reset_adapter` uses `SetIfEntry`** rather than WMI/`INetCfg` (§6). Same effect, native, no
  COM marshalling. Not yet verified elevated.
- **No named pipe, no Windows Service.** Single elevated process (§11).
- **The escalation payload is shown, not sent.** There is no ITSM integration and the UI says so.

No performance claims are made anywhere in the app or this README. Nothing has been measured.

## Known finding: `strict: true` rejects `minimum`

Strict tool schemas accept only a restricted JSON Schema subset. Sending `renew_dhcp`'s
`adapterIndex` as `{"type":"integer","minimum":0}` under `strict: true` returns:

```
400 invalid_request_error
tools.2.custom: For 'integer' type, property 'minimum' is not supported
```

`strict` itself is fine on `claude-haiku-4-5` — the combination with `minimum` is not. The wire
schema is therefore sanitized by `strictSafeSchema()` in `src/agent/cloud-client.js`, which
recursively strips `minimum`, `maximum`, `pattern`, `format` and the other non-strict keywords.
The catalog keeps the full schema and the broker still enforces it (`adapterIndex: -1` is
rejected), so the constraint moved to the layer allowed to express it rather than disappearing.

Diagnose any future cloud error with `node test/cloud.test.mjs` — it sends the real tool set,
then each tool alone, and prints the API's own message plus the offending schema. The
`tools.N.custom` index in the error names the tool. The app also logs the full API message to the
dev-log panel as `[cloud] API <status> <type>: <message>`; read that before changing any code.

## Known finding: `dnscache` cannot be restarted

The brief lists `dnscache` in the `restart_service` enum, but the DNS Client service does not
accept stop requests on Windows 10/11 — verified on this machine, `controlsAccepted` is `0x58`
with `SERVICE_ACCEPT_STOP` clear. `restart_service("dnscache")` is therefore refused by broker
policy with that explanation, and DNS symptoms route to `flush_dns` instead.

The refusal is also enforced from observed state, not just the static blocklist: any service
reporting `RUNNING` with `SERVICE_ACCEPT_STOP` clear is refused. It doubles as a good demo beat —
the model proposes, and the broker declines on policy grounds and explains why.
