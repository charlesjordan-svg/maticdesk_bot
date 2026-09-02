# Broker surface — every OS resource the privileged half touches

Maintained per handover §12. This is the allowlisting document: it lists every native API,
service, and registry key the broker calls, so the customer's security team can allowlist the
agent rather than reverse-engineer it.

**Keep this current.** If you add a capability or change an implementation, add the API here in
the same commit. The `apis` array on each capability in `src/broker/catalog.json` is the
machine-readable half of this list; this file is the annotated half.

## Design constraints this surface satisfies

- **No interpreter spawning.** The broker never launches `cmd.exe`, `powershell.exe`, `sc.exe`,
  `netsh.exe`, or `ipconfig.exe`. Every action is a direct native call. This is the behaviour EDR
  flags, and although this customer reports no EDR today, that will not hold (§6, §12).
- **No encoded command strings.** No parameter is ever concatenated into a command line. Every
  capability parameter is schema-constrained, and `serviceName` is a closed enum (§5).
- **Called via FFI, not a shim.** Bindings are declared with `koffi` in `src/broker/win32/`.
  There is no helper `.exe` and no PowerShell module in the runtime path.

## Loaded modules

| DLL | Why |
|---|---|
| `advapi32.dll` | Service Control Manager |
| `kernel32.dll` | `GetLastError` only |
| `dnsapi.dll` | DNS resolver cache flush |
| `iphlpapi.dll` | Adapter enumeration, DHCP lease control, interface admin status |

## Native APIs

### advapi32 — Service Control Manager (`src/broker/win32/scm.js`)

| API | Used by | Privilege | Notes |
|---|---|---|---|
| `OpenSCManagerW` | detection + `restart_service` | `SC_MANAGER_CONNECT` (0x0001) | Local machine only; `lpMachineName` is always NULL — the broker never opens a remote SCM |
| `OpenServiceW` | detection | `SERVICE_QUERY_STATUS` (0x0004) | Works unelevated |
| `OpenServiceW` | `restart_service` | `SERVICE_QUERY_STATUS \| SERVICE_START \| SERVICE_STOP` (0x0034) | **Requires elevation.** Unelevated returns `ERROR_ACCESS_DENIED` (5), surfaced as "this needs the broker" |
| `QueryServiceStatus` | detection + `restart_service` | — | Read-only |
| `ControlService` | `restart_service` | needs `SERVICE_STOP` | Only ever sent `SERVICE_CONTROL_STOP` (0x0001). No other control code is used |
| `StartServiceW` | `restart_service` | needs `SERVICE_START` | Always called with `dwNumServiceArgs = 0` and `lpServiceArgVectors = NULL` — **no service arguments are ever passed** |
| `CloseServiceHandle` | all | — | |

### dnsapi (`src/broker/win32/net.js`)

| API | Used by | Privilege | Notes |
|---|---|---|---|
| `DnsFlushResolverCache` | `flush_dns` | none | Verified working unelevated. Idempotent, no rollback needed |

### iphlpapi (`src/broker/win32/net.js`)

| API | Used by | Privilege | Notes |
|---|---|---|---|
| `GetAdaptersInfo` | detection, all network capabilities | none | Read-only. Source of IP/gateway/DHCP state for the tier-0 router |
| `GetInterfaceInfo` | detection, `renew_dhcp` | none | Read-only. Source of the `IP_ADAPTER_INDEX_MAP` the DHCP calls require |
| `GetIfEntry` | detection, `reset_adapter` | none | Read-only link state (`dwOperStatus`, `dwAdminStatus`) |
| `IpReleaseAddress` | `renew_dhcp` | **elevation** | |
| `IpRenewAddress` | `renew_dhcp` | **elevation** | |
| `SetIfEntry` | `reset_adapter` | **elevation** | Only field written is `dwAdminStatus` (1 = UP, 2 = DOWN). Unelevated returns error 5 |

## Windows services referenced

Only these four, and only by the fixed names below — the enum in `catalog.json` is closed.

| Service | Capability | Verified on the dev machine |
|---|---|---|
| `spooler` | `restart_service` | Accepts stop (`controlsAccepted` 0x4c1) |
| `audiosrv` | `restart_service` | Accepts stop (0xc1) |
| `dhcp` | `restart_service` | Accepts stop (0x5) |
| `dnscache` | detection only | **Does NOT accept stop** (0x58 — `SERVICE_ACCEPT_STOP` clear). Blocked by policy; see below |

### Policy block: `dnscache`

`restart_service("dnscache")` is refused by `checkPolicy()` with an explanation, not attempted.
The DNS Client service does not accept stop requests on Windows 10/11, so a restart is simply
not possible through the SCM. The correct remedy for DNS symptoms is `flush_dns`.

The broker also refuses at runtime for *any* service that reports `RUNNING` with
`SERVICE_ACCEPT_STOP` clear, so this is enforced by observed state and not only by the static
blocklist.

## Registry keys

**None.** The broker reads and writes no registry keys. If that changes, list them here with
the access mask.

## Filesystem writes

| Path | Written by | Notes |
|---|---|---|
| `audit/audit.jsonl` | `AuditLog` | Append-only. One JSON record per execution attempt |
| `%TEMP%\matic-tts-*\u*.wav` | `TtsService` | Synthesized speech, read back and discarded |

TODO(phase1): the audit log must be written by the privileged service to a location the
logged-in user cannot modify, and shipped to the hub. A file beside the app is a demo-only
choice.

## Child processes

| Process | Why | In the privileged path? |
|---|---|---|
| `py -3 scripts/piper_worker.py` | Text-to-speech | **No.** Voice only. Never used for any privileged action, and a voice failure degrades to text |

This is the only child process the app spawns. It is not part of the broker.

## Known gaps

- `reset_adapter` uses `SetIfEntry` rather than the WMI/`INetCfg` route named in handover §6.
  Same effect, native, and no COM marshalling. TODO(phase1): confirm coverage across the fleet's
  NIC drivers — `SetIfEntry` can return `ERROR_NOT_SUPPORTED` on some virtual adapters, where
  `INetCfg` is the more general answer. On this machine it returns error 5 (privilege) rather
  than 50 (not supported), which indicates the API is accepted for this NIC.
- Catalog signature verification is stubbed (`verifyCatalogSignature()`), so the trust root of
  the privileged half is currently unverified. TODO(phase1).
