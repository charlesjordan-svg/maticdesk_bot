# Broker surface — every OS resource the privileged half touches

Maintained per handover §12. This is the allowlisting document: it lists every native API,
service, and registry key the broker calls, so the customer's security team can allowlist the
agent rather than reverse-engineer it.

**Keep this current.** If you add a capability or change an implementation, add the API here in
the same commit. The `apis` array on each capability in `src/broker/catalog.json` is the
machine-readable half of this list; this file is the annotated half.

> **PART OF THIS DOCUMENT DESCRIBES CALLS THAT ARE NOT YET IN THE BINARY.** Everything under
> §`Native APIs` is implemented and running today. **§`Pipe lifecycle (D201 — DESIGNED, NOT
> BUILT)` is not**, and every row in it is marked. It is listed ahead of the code deliberately:
> ratifying D201 accepted a *named* growth of this file, and the design's §8 item 9 made listing
> these calls **before any implementation merges** a commitment rather than a nicety. An EDR team
> reading this should treat that section as "what is coming and why", not as "what runs".

## Design constraints this surface satisfies

- **No interpreter spawning.** The broker never launches `cmd.exe`, `powershell.exe`, `sc.exe`,
  `netsh.exe`, or `ipconfig.exe`. Every action is a direct native call. This is the behaviour EDR
  flags, and although this customer reports no EDR today, that will not hold (§6, §12).
- **No encoded command strings.** No parameter is ever concatenated into a command line. Every
  capability parameter is schema-constrained, and `serviceName` is a closed enum (§5).
- **Called via FFI, not a shim.** Bindings are declared with `koffi` in `src/broker/win32/`.
  There is no helper `.exe` and no PowerShell module in the runtime path. **The pipe-lifecycle
  calls in D201 have not chosen their mechanism yet** — koffi, an N-API addon, or a small signed
  helper are all still open, and the third would make the sentence above false. That choice
  interacts with D147's `%ProgramFiles%` and separate-DLL requirements and is not made.
- **The privileged surface does not grow with the catalog.** This is what D98 actually protects, and
  it is the argument that got D201's exception accepted: the pipe calls are made **once at service
  start**, are not per-capability, and are **not reachable by any proposal**. If a future change
  makes a native call reachable from a capability parameter, that is a different kind of growth and
  needs its own decision.

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

## Pipe lifecycle (D201 — DESIGNED, NOT BUILT)

**Nothing in this section is in the binary yet.** Design and primary sources:
`2026-09-04-named-pipe-protocol-design.md`. Wire format: D200. Register: §5.15, §5.15a, §10.5.

**Why these calls exist at all, in one paragraph an EDR reviewer can check.** The broker is a
LocalSystem service and the agent is an unprivileged process in the user's session; they need a
channel. Node's own named-pipe support cannot provide it: **libuv passes `NULL` as
`lpSecurityAttributes` to `CreateNamedPipeW`, and the resulting default DACL grants Everyone
READ and NO WRITE — so the agent could connect and never speak.** That is **measured, not
reasoned**: `npm.cmd run verify:pipe` reads the DACL off a live Node pipe (Everyone
`0x00120089`, no `FILE_WRITE_DATA`) and watches an access check refuse `GENERIC_WRITE` with
`ERROR_ACCESS_DENIED` (register §10.5). libuv also omits `PIPE_REJECT_REMOTE_CLIENTS`, leaving a
pre-authentication surface on a privileged service, and Node exposes no API to fix either
(nodejs/node#30823, closed `wontfix`). So the pipe must be created natively with an explicit
security descriptor.

### Planned modules

| DLL | Why | Status |
|---|---|---|
| `kernel32.dll` | Pipe creation and lifecycle. **Already loaded** for `GetLastError` | new APIs, existing DLL |
| `advapi32.dll` | SID construction, ACL construction, impersonation. **Already loaded** for the SCM | new APIs, existing DLL |

**No new DLL is loaded.** Both are already in the surface for other reasons, which is worth stating
because "two more DLLs" and "more entry points in DLLs you already allowlisted" are different
conversations with a security team.

### kernel32 — pipe lifecycle

| API | Used by | Privilege | Notes |
|---|---|---|---|
| `CreateNamedPipeW` | broker service start | LocalSystem | **DESIGNED, NOT BUILT.** Called ONCE per instance at service start, never in response to a proposal. `lpSecurityAttributes` carries the descriptor built below — the whole reason this is not `node:net`. Byte-mode pipe (D200: readers buffer and split on `\n`) |
| `ConnectNamedPipe` | broker, per agent connection | LocalSystem | **DESIGNED, NOT BUILT.** Overlapped, so one instance does not block others |
| `DisconnectNamedPipe` | broker, on agent disconnect or protocol violation | LocalSystem | **DESIGNED, NOT BUILT.** Also the response to an over-length line: D200 closes the connection rather than resynchronising a stream whose framing is lost |
| `CloseHandle` | broker, teardown | — | **DESIGNED, NOT BUILT** |
| `GetLastError` | all of the above | — | Already in the surface |

**Flags on `CreateNamedPipeW`, and why each one is not optional:**

| Flag | Why |
|---|---|
| `PIPE_REJECT_REMOTE_CLIENTS` | Closes the remote surface outright. libuv omits it, which is the second half of the finding above |
| `FILE_FLAG_FIRST_PIPE_INSTANCE` | Creation FAILS if the name already exists, instead of quietly joining a name someone else owns. The broker is a service that starts at boot, before any user session, so **it wins the race for the name** — and this flag turns losing that race into a loud startup failure rather than a silent compromise |

### advapi32 — the security descriptor

| API | Used by | Privilege | Notes |
|---|---|---|---|
| `OpenProcessToken` / `OpenThreadToken` | descriptor construction | LocalSystem | **DESIGNED, NOT BUILT.** To reach the interactive session's token |
| `GetTokenInformation(TokenGroups)` | descriptor construction | — | **DESIGNED, NOT BUILT.** To find the **logon SID** (the group with `SE_GROUP_LOGON_ID`) |
| `AllocateAndInitializeSid` / `FreeSid` | descriptor construction | — | **DESIGNED, NOT BUILT.** LocalSystem and Administrators SIDs |
| `SetEntriesInAclW` | descriptor construction | — | **DESIGNED, NOT BUILT.** Builds the DACL from explicit ACEs |
| `InitializeSecurityDescriptor` | descriptor construction | — | **DESIGNED, NOT BUILT** |
| `SetSecurityDescriptorDacl` | descriptor construction | — | **DESIGNED, NOT BUILT** |
| `ImpersonateNamedPipeClient` | broker, per connection | LocalSystem | **DESIGNED, NOT BUILT.** To learn who the peer is from the KERNEL rather than from anything the peer says. **Known hazard:** a service that impersonates must not perform privileged work while impersonating — see the caveat below |
| `GetTokenInformation(TokenUser)` | broker, per connection | — | **DESIGNED, NOT BUILT.** Yields the peer's SID, not forgeable by the agent. **This is the same token→SID route D148 uses**, and the register's §10.4 correction applies: no `WTS_INFO_CLASS` returns a SID |
| `RevertToSelf` | broker, per connection | — | **DESIGNED, NOT BUILT. Called immediately after reading the peer SID, before any privileged work.** Its absence is the hazard, so it is listed as an API rather than left implicit |

### The DACL, exactly

| Trustee | Rights | Why |
|---|---|---|
| `SYSTEM` (LocalSystem) | Full control | The broker owns the pipe |
| `BUILTIN\Administrators` | Full control | Administration and diagnosis |
| **The interactive user's LOGON SID** | `FILE_READ_DATA \| FILE_WRITE_DATA \| SYNCHRONIZE` | The agent must be able to read AND write |

**`FILE_GENERIC_WRITE` MUST NEVER BE GRANTED, and this is the single most important line in this
section.** Microsoft's own documentation notes that `FILE_APPEND_DATA` and
`FILE_CREATE_PIPE_INSTANCE` **are the same bit**. `FILE_GENERIC_WRITE` includes it, so granting
it would hand the unprivileged agent **the right to create instances of the broker's own pipe
name** — turning an IPC client into an impersonation primitive. The three individual rights above
are the difference between an IPC client and a way to become the broker.

**The LOGON SID, not the user SID.** Microsoft's guidance for this exact problem is to use the logon
SID on a pipe's DACL to keep out remote users and users on other terminal-services sessions. It is
also **already the value D148 reads** to attest the interactive user, so the same value answers "who
is this?" and "which session may reach the pipe?".

### What this DACL does NOT defend against, stated here on purpose

**It is not a defence against threat-model A1 (user-context malware), and it cannot be.** A1 runs as
the user, so it is inside the DACL by construction: anything running as that user can open the pipe,
obtain a nonce and approve it. Checking the peer's image path or signature does not fix that —
injection into the real signed agent defeats it — and would manufacture the appearance of a boundary
that is not there.

**What the DACL actually buys:** other users on the same machine cannot reach the channel, remote
callers cannot reach it, and the name cannot be squatted. Those are real (threat model A2/A3-adjacent,
A7, A10) and they are worth the DACL.

**What defends against A1 is D130** — the broker executes only what it rendered, and
`AuditRecord.consentRendered` makes a lying agent attributable after the fact. This paragraph is
here rather than only in the register because **the mistake available to a reader of the transport is
to read a DACL as a trust boundary.**

### Still open, and not settled by D201's ratification

- **The last mile of the measurement.** §10.5 read the DACL off a Node pipe and exercised the access
  check, but **nobody has stood up a real LocalSystem service with a real standard-user agent and
  watched the write fail.** That experiment is minutes, and if the write somehow succeeds, most of
  this section is unnecessary.
- **The mechanism**: koffi vs an N-API addon vs a small signed helper. Interacts with D147.

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
- **The pipe-lifecycle section above is DESIGNED AND NOT BUILT.** Today `InProcessBroker` runs in
  the same process as the agent (`src/broker/in-process-broker.js`), so there is no IPC channel and
  no pipe to allowlist. The section is here because D201's ratification made listing it a
  precondition for the code, not because the code exists.
- **The privilege boundary the pipe is meant to create does not exist yet.** Until
  `NamedPipeBroker` ships, the broker's privileges are the agent's privileges — which is why the
  app runs elevated (`npm.cmd run start:elevated`) and why D130's audit trail, not process
  separation, is what currently makes a proposal attributable.
