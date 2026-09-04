# The named-pipe protocol — design

**Date:** 2026-09-04
**Decisions:** **D200** (the protocol) and **D201** (the transport, and what it costs) — **both
ratified by the founder on 2026-09-04.**
**Replaces:** the "not designed yet" note in `CLAUDE.md`.
**Unblocked by:** D130, implemented and **verified on a screen** on 2026-09-03 (register §10.3a) — the
renderer contract this serialises has now been looked at.
**Status: ratified design. NOTHING IS BUILT.** Ratification settled the shape, not the schedule. The
wire format is now the contract — `execute` takes a nonce and has nowhere to put a proposal, and
changing that needs a new decision rather than a patch. D201's ratification also accepts the named
growth of `BROKER-SURFACE.md`, so §8 item 9 (list the new native calls there **before** code merges)
is now a commitment.

---

> ## The finding, first, because it changes the shape of the work
>
> **Node cannot create the pipe this design needs, and the pipe it *does* create makes the protocol
> impossible. This is now MEASURED, not inferred** — `npm.cmd run verify:pipe`, 2026-09-04.
>
> libuv passes `NULL` as `lpSecurityAttributes` to `CreateNamedPipeW`
> ([source](https://github.com/libuv/libuv/blob/v1.x/src/win/pipe.c)). Microsoft documents what that
> yields: *"the named pipe gets a default security descriptor. The ACLs in the default security
> descriptor for a named pipe grant full control to the LocalSystem account, administrators, and the
> creator owner. They also grant read access to members of the Everyone group and the anonymous
> account."*
>
> **The DACL read off a live Node pipe on this machine, verbatim:**
>
> ```
> O:<creator>D:(A;;FA;;;SY)(A;;FA;;;BA)(A;;FA;;;<creator>)(A;;FR;;;WD)(A;;FR;;;AN)
> ```
>
> | Principal | Mask | Decoded |
> |---|---|---|
> | `SY` LocalSystem | `0x001F01FF` | full control |
> | `BA` Administrators | `0x001F01FF` | full control |
> | creator owner | `0x001F01FF` | full control |
> | **`WD` Everyone** | **`0x00120089`** | READ_DATA, READ_ATTRS, READ_CONTROL, SYNCHRONIZE — **no WRITE_DATA** |
> | **`AN` Anonymous Logon** | **`0x00120089`** | the same |
>
> The broker runs as **LocalSystem**, so the creator-owner ace *is* the `SY` ace and an unprivileged
> agent falls through to `WD`. Exercising the access check against that exact DACL from an
> unelevated token: **`GENERIC_READ` ALLOWED, `GENERIC_WRITE` REFUSED with ERROR_ACCESS_DENIED**,
> and the same for `FILE_WRITE_DATA` and for a duplex open.
>
> **The unprivileged agent can connect and listen, and never speak.** The protocol cannot run on the
> transport we assumed.
>
> Note the **anonymous-logon ace getting read access** on what would be a LocalSystem service's
> pipe, while libuv also omits `PIPE_REJECT_REMOTE_CLIENTS` so the pipe mode does not itself refuse
> remote callers. That is a pre-authentication surface on a privileged service, it is **observed
> rather than argued**, and it is what §4.1 closes.
>
> **This is why D201 exists as a separate decision from D200.** The protocol below is cheap. The
> transport underneath it costs native code, and native code in the privileged half is exactly what
> D98 says to avoid. That tension is real and §5 states it rather than resolving it quietly.

---

## 1. What the pipe carries, and nothing else

**Four methods. They are the `Broker` interface, exactly** (`../src/broker/broker.d.ts`), because the
whole point of that interface is that call sites do not change when `InProcessBroker` becomes
`NamedPipeBroker`.

| Method | Params | Returns |
|---|---|---|
| `listCapabilities` | — | `Capability[]` |
| `validate` | `{ proposal }` | `ValidationResult` |
| `prepareConsent` | `{ proposal, locale }` | `{ ok: true, request }` or `{ ok: false, error }` |
| `execute` | `{ nonce }` | `ExecutionResult` |

**`execute` takes a nonce and there is no field to put a proposal in.** That is the D130 contract on
the wire: the demonstration this whole design answers
(`CONSENT-SURFACE-2026-09-03.md`) was an agent showing one card and sending a different proposal
down the pipe. After D130 there is no second proposal to send, and the schema below has nowhere to
put one. **Adding a parameter to `execute` re-opens the finding.**

**Nothing else goes on this pipe.** No file paths, no command strings, no catalog, no "run this",
no method that takes a capability implementation. The method set is closed: four names, and a
request naming any other name is an error (§6).

The test harness at `../test/helpers/pipe-broker-service.mjs` already speaks this over a real pipe
between real processes — it is where the shape below comes from. Its `__`-prefixed introspection
methods are **test-only and must not exist in the service.**

---

## 2. Framing

**JSON Lines. One JSON object per line, UTF-8, `\n`-terminated.**

```jsonc
// request
{ "v": 1, "id": "9f3c…", "method": "prepareConsent", "params": { "proposal": { … }, "locale": "en" } }
// reply
{ "v": 1, "id": "9f3c…", "result": { … } }
{ "v": 1, "id": "9f3c…", "error": { "code": "invalid-proposal", "message": "…" } }
```

Chosen over a length-prefixed binary framing because the harness proves it works, it is readable in
a log when something goes wrong at a customer site, and the messages are small. **The pipe is byte
mode** (`PIPE_TYPE_BYTE`, which is what libuv uses and what §4 keeps), so a reader must buffer and
split on `\n` rather than assume one read is one message — the harness does this and it is the bug
every naive implementation has.

**Requests are correlated by `id`, and replies may return out of order.** `execute` can take
seconds; `listCapabilities` cannot be stuck behind it.

**Limits, all enforced by the broker, all refusals audited:**

| Limit | Value | Why |
|---|---|---|
| Max line length | 64 KiB | A proposal with validated parameters is small. libuv's buffer is 64 KiB, so this needs no tuning. Over-length: **close the connection**, do not attempt to resynchronise — a stream you have lost framing on is not a stream you can safely resume |
| Max in-flight requests per connection | 8 | The agent's UI has no reason to have more; unbounded in-flight is a memory DoS against a privileged process |
| Idle timeout | 15 min | A connection nobody is using is attack surface |
| Request timeout | none, deliberately | `execute` on a real service restart took **3,064 ms** in the current audit trail. A timeout here would race the machine change and leave the caller believing something did not happen when it did. The **consent** window is the timeout that matters, and the broker already owns it |

---

## 3. Versioning — D133, exactly as written

D133: *"the pipe carries a single protocol version and refuses a mismatch, logging the refusal to the
hub."*

**One integer, `v`. Strict equality. No negotiation, no ranges, no capability flags.** A mismatch is
refused with `error.code: "protocol-version"`, logged locally, and reported to the hub when joined.

The reason there is nothing to negotiate: **D133 ships one per-machine installer that moves both
halves atomically**, so version skew is not a state the system is supposed to reach. A mismatch
therefore means something is wrong — a partial upgrade, a stale service, or something pretending to
be one half — and the correct response is to stop and say so loudly, not to find a common subset.

**Do not add negotiation later as a convenience.** It would re-introduce the skew D133 deleted, and
a version-negotiating pipe is a pipe where an attacker picks the version.

---

## 4. The transport (D201) — and the tension it creates

### 4.1 What the DACL must be

**The broker hosts the pipe** and creates it with an explicit security descriptor:

| Principal | Rights | Why exactly these |
|---|---|---|
| LocalSystem | Full control | It owns the thing |
| Administrators | Full control | Service management and support |
| **The interactive user's logon SID** | `FILE_READ_DATA \| FILE_WRITE_DATA \| SYNCHRONIZE` | The agent must read and write, and nothing else |

**`FILE_GENERIC_WRITE` must NOT be granted, and this is not a style preference.** Microsoft:
*"Because FILE_APPEND_DATA and FILE_CREATE_PIPE_INSTANCE have the same definition, so
FILE_GENERIC_WRITE enables permission to create the pipe. To avoid this problem, use the individual
rights instead of using FILE_GENERIC_WRITE."*

Granting the agent `FILE_GENERIC_WRITE` would hand it **the right to create instances of the
broker's own pipe name** — i.e. to stand up a fake broker that the real agent then talks to. The
individual rights are the difference between an IPC client and an impersonation primitive.

**The logon SID, not the user SID.** Microsoft's own guidance for this exact problem: *"To prevent
remote users or users on a different terminal services session from accessing a named pipe, use the
logon SID on the DACL for the pipe."* This is a pleasing convergence: **the logon SID is already
what D148 reads** to attest the interactive user. The same value that answers "who is this?" also
scopes the pipe to one session.

Plus two flags libuv does not set:

- **`PIPE_REJECT_REMOTE_CLIENTS`** — closes the remote surface outright.
- **`FILE_FLAG_FIRST_PIPE_INSTANCE`** — creation fails if the name already exists, instead of
  quietly joining a name someone else owns. **The broker is a Windows Service that starts at boot,
  before any user session exists, so it wins the race for the name** — and this flag turns losing
  that race into a loud startup failure rather than a silent compromise.

### 4.2 Why not the cheap options

**Node's `net` server, as-is.** Impossible, per the finding above: the agent gets read and no write.

**Harden the DACL after Node creates it.** libuv does request `WRITE_DAC` on the server handle, and
Microsoft says `SetSecurityInfo` is how you change a pipe's descriptor — so this looks viable. Two
problems. **Node does not expose the pipe HANDLE**, so there is nothing to pass to `SetSecurityInfo`;
and even if it did, the pipe would exist with the default DACL for a window before being fixed. A
race in the security of the privileged IPC channel is not a saving.

**Invert it: let the agent host and the broker connect as client.** Genuinely tempting — no native
code at all, because the default DACL grants the *creator owner* (the user) full control and
LocalSystem full control, so both ends work. **It is rejected, and the reason is specific: the pipe
namespace is machine-global.** A name the *user* creates can be squatted by a *different* user's
process before the target logs in, and the broker would then connect to it. Broker-hosted with
`FILE_FLAG_FIRST_PIPE_INSTANCE` at boot has no such window.

### 4.3 The cost, stated plainly

This needs native calls the broker does not make today: `CreateNamedPipeW` with a built security
descriptor, `ConnectNamedPipe`, `ImpersonateNamedPipeClient`, overlapped I/O, and the
SID/ACL construction around them.

**That expands `BROKER-SURFACE.md`, which is the document EDR allowlisting depends on, and D98 says
to keep the broker binary as small and stable as possible.** This design does not pretend otherwise.
The argument for paying it: the privileged half has to have *some* channel, this is the smallest
correct one, and the alternative is not a smaller surface but an incorrect DACL.

**It is also bounded and stable.** These are pipe-lifecycle calls made once at service start. They
do not grow with the catalog, they are not reached by any proposal, and nothing about them is
per-capability — which is the property D98 actually cares about.

---

## 5. What the broker may believe about its peer

**Almost nothing, and the design is built for that.**

The broker can establish the peer's identity from the kernel rather than from anything the peer
says: `ImpersonateNamedPipeClient`, then `GetTokenInformation(TokenUser)`. That yields the SID of the
process on the other end, and it is not forgeable by the agent — which is the same
token-to-SID route the register already corrected D148's wording toward (§10.4: *"no
`WTS_INFO_CLASS` returns a SID"*).

**What that buys, and what it does not:**

- **It buys**: this connection belongs to *that* user, checked against the logon SID the DACL was
  built from. Two users on one machine cannot reach each other's broker channel.
- **It does not buy**: any belief that the peer is *our agent*. Anything running as that user can
  connect. That is **threat-model A1, user-context malware, which is in scope** — and it is exactly
  what `../docs/2026-09-03-consent-protocol-design.md` §5 already concedes: *"Nothing in an
  unprivileged process can be trusted to paint honestly."*

**The consequence is worth stating because it is easy to get backwards: the pipe's DACL is not the
defence against A1, and it cannot be.** A1 runs as the user and is therefore inside the DACL by
construction. What the DACL defends against is *other users*, *remote callers*, and *name
squatting*. **What defends against A1 is D130** — the broker executes only what it rendered, and
`AuditRecord.consentRendered` makes a lying agent attributable after the fact.

**Do not add peer-process verification and call it security.** Checking the client's image path or
signature is defeated by DLL injection into the real signed agent, and would create the impression
of a boundary that is not there. If a real boundary is ever required, the answer is the strong form
already deferred in the consent design §5 — a broker-owned consent window in the user's session —
and that is a decision with its own cost, not a tweak to this one.

---

## 6. Errors

`error.code` is a closed set. The agent maps codes to behaviour; `message` is for humans and logs.

| Code | Meaning | Agent behaviour |
|---|---|---|
| `protocol-version` | `v` mismatch (§3) | Stop. Surface a "this install is inconsistent" state. Do not retry |
| `bad-request` | Not JSON, unknown method, missing params, over-length | Bug. Log loudly |
| `invalid-proposal` | `prepareConsent` refused it | Show the refusal; it is already audited |
| `consent` | Nonce unknown, expired, used or superseded | Show the broker's message. **Do not re-prepare automatically** — a silent retry after a superseded nonce is how a second card appears that the user did not ask for (D198) |
| `unavailable` | Service not running or pipe not found | "This needs the broker" (§12), the same string an unelevated primitive produces today |
| `internal` | Anything else | Honest failure. Never synthesise a success |

**Refusals are audited by the broker, not by the agent** — the agent cannot be trusted to write the
trail about itself. Every `error` reply for `prepareConsent` and `execute` corresponds to an audit
record the broker already wrote.

---

## 7. Lifecycle and sessions

- **One connection per agent instance.** The broker accepts multiple concurrent instances
  (`PIPE_UNLIMITED_INSTANCES`) because fast-user-switching and terminal services are real, but each
  connection is scoped to one logon SID by §4.1.
- **`InProcessBroker` holds one outstanding `ConsentRequest`** (D130 rule 3, D166 supersede). **Over
  a pipe, "session" must mean the connection, not the process.** One outstanding request per
  *connection*, or a second user's card supersedes the first user's — which would be a cross-user
  defect wearing D166's clothing. **This is the single most likely bug in implementing this design.**
- **Broker restart invalidates every nonce**, because the retained proposals were in memory. The
  agent must treat a reconnect as "every card I am showing is dead" and say so, rather than leaving
  an approvable-looking card on screen.
- **The agent reconnects with backoff; the broker never connects outward.**

---

## 8. Acceptance — falsifiable

1. `NamedPipeBroker` passes the existing `consent-surface.test.mjs` **unmodified**, against the
   service on a real pipe. The suite is the D130 acceptance test and it should not need to know
   which implementation it is talking to.
2. An unprivileged process **can** complete `prepareConsent` → `execute` against the LocalSystem
   service. *This is the test that fails today* — it is the finding in the banner, and it is the
   reason D201 exists.
3. A second user's process on the same machine **cannot** open the pipe.
4. A remote connection attempt is refused by the pipe, not by application code.
5. An `execute` request carrying an extra `proposal` field executes **the retained proposal**, and
   the extra field appears nowhere in the audit record.
6. A `v` mismatch is refused, logged, and reported to the hub when joined.
7. A 65 KiB line closes the connection and is audited; the service stays up.
8. Killing and restarting the service leaves no approvable card in the agent.
9. `BROKER-SURFACE.md` lists every new native call **before** the code merges, because that document
   is what a customer's EDR team reads.

---

## 9. Honesty ledger

- **Nothing here is built.** No pipe, no service, no native binding. This is a design document and
  the acceptance list above is what would make it real.
- **The blocker is now measured** (`npm.cmd run verify:pipe`, `scripts/verify-pipe-security.ps1`),
  and it held: read allowed, write refused with ERROR_ACCESS_DENIED. **Two caveats on how.** The
  pipe whose DACL was read was created by a normal user rather than by LocalSystem, so the
  creator-owner ace names that user; the load-bearing ace is `WD` (Everyone), which is identical
  either way, and the LocalSystem case only *removes* the separate creator ace by merging it into
  `SY`. And the access check was exercised against a **reproduction** of that DACL with no ace for
  the caller, not against a real service. **What has still never been run is the real thing: a
  LocalSystem-hosted Node pipe with a standard user's agent on the other end.** That needs an
  elevated window and it is the last mile of this verification.
- **Two bugs in the verification itself, worth recording because both produced a confident wrong
  answer.** Passing `\\.\pipe\name` as a bash argument silently ate the backslashes and produced an
  `EACCES` that looked exactly like the finding being sought — a false positive for the right
  conclusion. And a PowerShell helper that emitted status strings *and* returned a boolean put both
  on the pipeline, so the caller captured an array, every array is truthy, and the verdict inverted
  to "the write was ALLOWED". Neither was caught by the result looking wrong; both were caught by
  the result looking *right for the wrong reason*.
- **`[VERIFY]` how the native calls are made.** koffi, an N-API addon, or a small signed helper —
  not chosen here, and it interacts with D147's requirement that broker binaries and native DLLs sit
  under `%ProgramFiles%` and ship separately from the agent's.
- **The Windows Service itself is out of scope.** Installation, recovery, SCM integration and the
  MSI are Track A work that this design sits inside, and the MSI is blocked on OPEN-9 anyway.
- **No performance claim.** The 3,064 ms figure in §2 is a real number from the current audit trail
  for one `restart_service` execution on this machine; it is used to argue *against* a request
  timeout and is not a benchmark of anything.
- **`ImpersonateNamedPipeClient` has a well-known hazard** — a service that impersonates a client
  and then acts on its behalf can be tricked into using the client's rights, and impersonation must
  be reverted promptly. This design uses it **only to read the peer's SID**, never to perform work.
  Anything that impersonates in order to *act* is a different and more dangerous design.
- **§5's conclusion is the load-bearing one and it is uncomfortable**: this transport does not defend
  against the adversary most likely to matter. It is not supposed to. Saying so here is cheaper than
  discovering later that someone believed it did.

---

## 10. Sources

Retrieved 2026-09-04.

- [libuv `src/win/pipe.c`](https://github.com/libuv/libuv/blob/v1.x/src/win/pipe.c) — the
  `CreateNamedPipeW` call: `NULL` security attributes, no `PIPE_REJECT_REMOTE_CLIENTS`, `WRITE_DAC`
  requested, `FILE_FLAG_FIRST_PIPE_INSTANCE` conditional
- [Named Pipe Security and Access Rights](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights)
  — the default descriptor; the `FILE_GENERIC_WRITE` / `FILE_CREATE_PIPE_INSTANCE` equivalence; the
  logon-SID guidance for cross-session and remote access
- [nodejs/node#30823](https://github.com/nodejs/node/issues/30823) — the request for pipe-permission
  control, **closed `wontfix`**
- `../scripts/verify-pipe-security.ps1` — the experiment, reproducible with `npm.cmd run verify:pipe`
- Register §10.4 — the WTS/token→SID verification that D148's wording still needs to absorb
