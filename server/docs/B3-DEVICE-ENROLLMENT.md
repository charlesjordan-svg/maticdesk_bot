# B3 — device enrollment

**Built 2026-09-10.** Register: [`../../docs/decisions/DECISION-REGISTER.md`](../../docs/decisions/DECISION-REGISTER.md) §5.26, D231.
Phase-1 plan: [`../../docs/2026-03-03-phase1-plan.md`](../../docs/2026-03-03-phase1-plan.md) §3 (B3 row), sized by an external review at 6–8 engineer-weeks.

> ## STATUS, 2026-09-12 (P3b, register §5.57) — ENROLLMENT CREDENTIAL AUTHENTICATION IS BUILT. HARDWARE-BOUND DEVICE IDENTITY AND USER ATTESTATION ARE NOT.
>
> D271 was answered (production on the customer's LAN/WAN) and P3b built on it. A device that becomes
> active holds ONE credential — minted once, shown once, stored as a hash (`control/008`) — and presents
> it as `Authorization: Bearer mdc_…` on every /v1 request; `authenticateDeviceCredential()` checks it
> by hash, refuses a revoked device on its NEXT request, and is `last_seen_at`'s real writer (**D282**).
> A LAN listener exists only over TLS and requires the credential on every route but enroll and health;
> on a loopback listener it is optional but checked when presented (**D283**). Tickets carry the
> enrollment that filed them and a requester reads only those (**D284**, `GET /v1/tickets`). **The
> client enrolls itself at startup** from the secret in `client/config.json` (**D285**), so the sentence
> two blocks below — *"no real device has enrolled"* — is history from that day.
>
> **What it is, in one line:** a per-OS-user enrollment of the software — not a machine, not hardware,
> not a person. **What it is not:** D60's TPM-backed key, D61's signed assertion and token exchange,
> D63/D64's custody. The credential is the weaker step on D61's path; the routes do not move when the
> assertion arrives. The 2026-09-10 status block below is kept as the record of what B3 first built.
>
> `npm.cmd test` **674**, `npm.cmd run test:db` **566**, client **1942**. Both suites green.

> ## STATUS — THE ENROLLMENT MECHANISM IS BUILT. DEVICE AUTHENTICATION IS NOT.
>
> A device can now ask a tenant to join, present a secret, wait in a queue or be auto-approved,
> appear in the console, be revoked alone or in a batch. That is everything the phase-1 plan's B3
> row names: *"Pending queue, auto-approve default with per-tenant toggle, rotatable time-boxed
> secret, rate limiting with automatic fallback to queued approval, bulk revocation by batch."*
>
> **What it is not:** nothing checks that a request claiming to be an enrolled device actually is
> one. That is D61's job — a signed assertion exchanged for a short-lived token — and it depends on
> D60/D64's TPM-backed key in broker custody, reached over the named-pipe transport, which is
> **designed and not built** (D200/D201). Building that this pass would have meant building the pipe
> transport first. §1 below records the cut in full; it is not a corner cut quietly.
>
> `npm.cmd test` **384** (up from 378), `npm.cmd run test:db` **342** (up from 310). Both suites
> green. No device has been enrolled from a real client — every enrollment in this pass came from
> `curl`, the CLI, or the test suite talking to `POST /v1/enroll` directly.

---

## 0. Read this first

Three tables already existed, built by B1 before B3 was scoped (`migrations/control/001-control-plane.sql`):
`control.devices`, `control.enrollment_requests`, `control.enrollment_secrets`. Nothing wrote them.
This pass is the logic — `server/src/devices/enrollment.js` — plus the one migration
(`004-device-enrollment.sql`) the shapes were missing once real code had to run against them: a
per-tenant auto-approve column (D80) and a foreign key `enrollment_requests.decided_by` should
always have had.

**The one entry point is `submitEnrollment()`.** The console, the CLI (`bin/devices.mjs enroll`) and
`POST /v1/enroll` all end up calling the same function in `src/devices/enrollment.js` — the D224
argument one layer over (tickets, then the KB, now devices): when a browser or a real device is
doubted, the terminal is what gets trusted, and that only proves something if none of the three can
disagree about what enrollment is. `test/admin-static.test.mjs` §5b asserts it structurally: nothing
outside that one file touches `control.devices`, `control.enrollment_requests` or
`control.enrollment_secrets`.

---

## 1. What this pass built against, and what it deliberately did not

The device-identity family of decisions (register §3.7–3.8) is one continuous design, and this pass
takes exactly one path through it:

| Decision | What it says | This pass |
|---|---|---|
| **D60** | Device identity is a TPM-backed, non-exportable asymmetric keypair generated at enrollment. | **Not built.** A device presents an opaque `deviceKeyId` string — real in the sense that nothing stops a client from making it a real public key's fingerprint, but nothing here generates, verifies or requires one. |
| **D63** | No-TPM fallback: a software key under DPAPI machine scope. | **Not built either — see below.** This pass is narrower than D63 too: no key is generated on the client side by anything this pass wrote. |
| **D61** | Authentication is a signed assertion exchanged for a short-lived access token, not per-request signing. | **Not built.** There is nothing yet to sign an assertion WITH (no D60/D63 key), so there is nothing for D61's exchange to consume. |
| **D64** | The device key lives broker-side; the agent requests tokens over the named pipe and never sees the key. | **Not applicable yet.** No key exists to place in custody. When one does, D64 says where: `client/src/broker/`, not `client/src/agent/`. |
| **D80** | Auto-approve is the default, with a per-tenant toggle. Auto-approve still writes the pending record and then approves it. | **Built exactly as specified.** `control.tenants.enrollment_auto_approve` (migration 004), read and set through `autoApproveSetting()`/`setAutoApprove()`. One code path (`submitEnrollment()`), policy flag on the end. |
| **D81** | The enrollment secret is the security boundary: rotatable, time-boxed. | **Built.** `createEnrollmentSecret()` mints a new one without revoking the last (rotatable); every secret carries `expires_at` (time-boxed); `secret_hash` is the only thing stored (a database read cannot enrol a device). |
| **D82** | The secret is not baked into the installer; delivered as install-time configuration. | **Honoured by omission.** There is no installer in this build to bake it into. `POST /v1/enroll` and `bin/devices.mjs enroll` both take the secret as a plain argument, which is the shape D82 asks for once one exists. |
| **D83** | Rate limiting and anomaly detection, with automatic fallback to queued approval on anomaly. | **Built, in-process, the same shape as the admin console's login throttle.** Five wrong secrets in a row locks enrollment for the tenant for a minute; more than twenty attempts (right or wrong) in sixty seconds forces every submission into the queue regardless of the auto-approve setting, for the rest of that window. Not real anomaly detection — a volume counter, named honestly as one. |
| **D83a** | Bulk revocation by batch. | **Built.** `revokeDevices({ tenantId, deviceIds })` takes an array; the Agents page's "Revoke selected" posts one form with a checkbox per device. |
| **D146** | TPM implementation facts (no auth value, duplicate-key detection, vendor/firmware gating). | **Not applicable — no TPM code exists yet to apply them to.** |
| **D148** | The broker attests the logged-on user's SID in the signed assertion. | **Not applicable — there is no signed assertion yet (D61).** |

**Why the cut lands exactly here.** D60/D63/D64 form one chain: a real key, held somewhere real,
usable by something real. Building any one of them without the others produces a device identity
that cannot actually be used for D61's exchange — a software key with nowhere trustworthy to live is
not meaningfully better than the opaque string this pass uses, and a broker-held key needs the
named-pipe transport (D200/D201) to be reachable from the agent process at all, which is designed
and not built. Rather than build a partial custody chain that looks more finished than it is, this
pass built the half of B3 that stands on its own: the queue, the secret, the policy, the rate limit,
the revocation. All five are real, tested against a live database, and usable today by an operator
running `bin/devices.mjs` or a script calling `POST /v1/enroll` directly. The next slice is D60/D63's
key generation and D61's exchange, and it is a real slice, not a formality — expect it to need its
own decision about whether to wait for the pipe transport or take a narrower custody model first.

---

## 2. The three routes, one CLI, and the console page

| Surface | What it does |
|---|---|
| `POST /v1/enroll` | The one HTTP entry point. Body: `{ tenant, deviceKeyId, secret, mode? }`. Returns `200 active` (auto-approved or already-enrolled), `202 pending` (queued), `403` (unknown tenant or wrong secret — same message, so a caller cannot enumerate tenant slugs by comparing errors), or `429` (rate-limited). |
| `GET /admin/agents` | `agents.read`. Pending queue, device list with bulk-revoke checkboxes, the auto-approve toggle, and enrollment secrets (mint/list/revoke). |
| `POST /admin/agents/*` | `agents.manage`. Approve/reject a request, revoke devices (bulk), toggle auto-approve, mint/revoke a secret. |
| `bin/devices.mjs` | `create-secret`, `secrets`, `revoke-secret`, `auto-approve [on\|off]`, `pending`, `approve`, `reject`, `list`, `revoke`, `enroll` — the last one calls `submitEnrollment()` directly, so a device can be simulated (or a real one unblocked) from a terminal without a browser. |

**Why `POST /v1/enroll` takes a tenant from the client, when `/v1/ask` and `/v1/ticket` refuse one.**
CLAUDE.md's rule is about an *unauthenticated* claim: with no device auth, any string in the body
becomes the tenancy model by default. This route is different in the one way that matters — the
claim is authenticated by the enrollment secret (D81). A device does not get to say "I am tenant X"
and be believed; it has to also produce the secret only that tenant's operator has (D82). That is
not an exception to the rule, it is the rule working: the secret is what turns an unauthenticated
claim into a checked one. `src/devices/route.js`'s header makes this argument in full.

**The state machine.** Every device is `pending` → `active` (approved, by policy or by hand) or
`pending` → `revoked` (rejected). Rejecting a request revokes the device it created rather than
leaving it stuck `pending` forever — an enrollment secret buys a pending record, not fleet
membership (D66), so a device that was told no can ask again with nothing lost.

---

## 3. Security notes

- **Every enrollment secret is stored as a hash, never the plaintext** (`sha256`, mirroring
  `admin/session.js`'s `sha256(token)` for session cookies). The plaintext is shown exactly once,
  at creation, the same "print it once, never again" discipline `bin/admin.mjs create-user` and
  `reset` already use for passwords and TOTP secrets.
- **A "new article" — sorry, a "new device" — whose id collides is a different problem here than
  in the KB editor**, and it is handled differently: `submitEnrollment()` looks up an existing
  device by `(tenant_id, device_key_id)` and returns its CURRENT status rather than creating a
  duplicate row or upserting over it. Re-submitting an already-active device is a no-op that
  updates `last_seen_at`; nothing is ever silently overwritten.
- **Rate limiting is in-process and resets on restart** — a speed bump, explicitly not a control,
  the same honest framing the admin console's login throttle already uses. The durable record is
  whatever the eventual audit/monitoring story does with repeated `403`s from `/v1/enroll`, which
  does not exist yet.
- **No enumeration via error message.** An unknown tenant slug and a correct tenant with a wrong
  secret return the identical `403` body. A timing side channel between the two paths (a lookup
  that fails fast vs. one that runs a real hash comparison) is not closed — on a loopback-only,
  pre-review hub this is judged not worth the complexity yet, and is named here rather than assumed
  away.
- **`enrollment_requests.decided_by` now has a real foreign key** to `admin_users(id)` (migration
  004) — it was a bare `uuid` since B1, correct for a table nothing wrote yet, wrong once an
  admin's real id is what lands there.

---

## 4. Tests

- `test/admin-static.test.mjs` §5b: the one-query-layer rule for devices (D224's pattern) — only
  `src/devices/enrollment.js` touches the three tables; the CLI, the console page and the HTTP route
  all compose it.
- `test/admin-static.test.mjs`: the Agents page's own rules (imports `enrollment.js`, issues no SQL,
  states plainly that devices are known but not authenticated, and names D61/D200/D201).
- `test/admin-db.test.mjs` **B3-1 through B3-4**, against a live database and a live hub:
  minting/listing/revoking secrets; auto-approve on (the default) then off, and the pending-queue
  path that produces; approve and reject, including that a rejected device ends up `revoked` and
  not stuck; the "same 403 either way" no-enumeration property; bulk revocation by batch; the
  five-failures lockout and the 429 it produces, with a `retryAfterMs`.
- A CLI smoke pass (`bin/devices.mjs create-secret` / `enroll` / `list` / `auto-approve` /
  `pending`) run by hand against a throwaway tenant during development, not committed as an
  automated test — the same functions are already covered by `test/admin-db.test.mjs`'s B3 block,
  and the CLI is a thin wrapper with no logic of its own to test twice.

---

## 5. Honesty ledger

- **Nothing is authenticated.** This is the headline fact and it is stated at the top of this
  document, on the Agents page itself (a `notYet()` block, not a footnote), and in `src/index.js`'s
  file header and startup banner. A device on the Agents page is *known*, not *proven*.
- **No real device has enrolled.** Every enrollment in development and in the test suite came from
  `curl`, `bin/devices.mjs enroll`, or the test suite calling `POST /v1/enroll` directly — nothing
  in `client/` generates a key or calls this endpoint yet. **2026-09-12: no longer true —
  `client/src/agent/enrollment.js` calls it at startup (D285). Still true: nothing generates a key;
  the device key is a random string, and the credential is a bearer secret, not a signature.**
- **Nothing is authenticated — no longer true from 2026-09-12 either (D282):** a presented credential IS
  checked on every request. What is still not authenticated is the machine, the hardware and the person.
- **D83's "anomaly detection" is a volume counter**, not statistical or behavioural anomaly
  detection. It is named that way deliberately rather than dressed up.
- **The timing side-channel between "unknown tenant" and "wrong secret" is not closed**, and B3-2's
  test only checks that the *messages* match, not that the *timing* does.
- **D132's capacity paragraph (Fargate task sizing, ~80 connections, 17 token-exchanges/second) does
  not describe this hub.** This hub is a single local Node process, not a distributed deployment,
  and no capacity planning was done or is needed for what this pass built — there is no token
  exchange yet for D132's numbers to apply to.
- **Nothing here is measured.** No enrollment latency, no rate-limiter tuning against real load — the
  five-failures/sixty-second numbers are copied from the login throttle's already-unmeasured values,
  not derived independently.
