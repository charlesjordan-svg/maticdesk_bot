# Handback — ticket lifecycle P3b, built: the enrollment credential, the LAN listener over TLS, and the requester's own tickets

**Date:** 2026-09-12 (evening, Pacific), on Charles's *"Start P3b"*.
**Answers:** `docs/handovers/2026-09-13-claude-code-handover-p3a-requester-safe-reads.md` §2 (P3b), which
was **GATED on D271**. D271 was answered by Charles at the start of this pass and is recorded in his
words in the register; two further founder answers followed the same hour (§1 below). Plan v3 §6.2,
§7.3 (the read route only), §7.5 (enrollment only) and its §8 row P3.
**Follows:** `docs/handovers/2026-09-12-claude-code-handover-p3a-built.md` (D281).
**Register:** `docs/decisions/DECISION-REGISTER.md` §5.57 — **D282** (the credential), **D283** (the LAN
listener, TLS or nothing; the console opens too), **D284** (tickets scoped to the enrollment; `GET
/v1/tickets`), **D285** (the secret in `config.json`; the Agents page for endpoints that enroll), all
**PROPOSED**; **D271 DECIDED**; D273 REVERTED; D274 inverted; D281 rekeyed. Register at v2.55, D1–D285;
next free is **D286**.
**Commits, in order:** `a7b4c8e` (the credential), `da7a86b` (`tickets.device_id`), `3eff3f5` (the hub:
credential on the wire, LAN over TLS, the route), `e207a3c` (the client enrolls — turns the D274 detector
RED, by design), `41954ad` (the Agents page for the new premise; detector inverted), then this document
and the register.
**Assertions:** server headless **674** across 7 files (was 607 across 6; `bind.test.mjs` is new); db
**566** across 3 (was 517); client **1942** across 25 files (was 1909 across 24; `enrollment.test.mjs` is new).

---

## 0. What was done, in one paragraph

Charles answered D271 — development on one machine, production on the customer's LAN/WAN — which is the
handover's LAN row, so P3b opened as the credential plus the transport slice. A device that becomes
active now holds one credential, minted once, stored as a hash, refused when revoked, and its
presentation is `last_seen_at`'s first real writer. Tickets record which enrollment filed them, the
requester readers P3a built are rekeyed to that enrollment, and `GET /v1/tickets` returns them behind
the credential with a field saying what the credential proves and does not. The hub can bind a LAN
address, but only over TLS: without a certificate it refuses to start with a banner, and a plaintext
non-loopback peer is refused per request too; on a LAN listener every `/v1` route but enroll and health
requires the credential, and the console — Charles's choice — is reachable from the LAN as well. The
client enrolls at startup from a secret in `config.json` (Charles's choice, plaintext, per install,
EMPTY in the repository and test-guarded), keeps the credential in per-user userData beside the profile,
and presents it on every request. That enrollment turned the Agents page's D274 detector red with the
exact sentence it was written to print; the writer and the enforcement already existed, so the copy was
rewritten third and the detector inverted. Both shapes of the hub were run by hand: the refusal banner,
and a real TLS listener on 127.0.0.2 answering a 127.0.0.3 peer.

---

## 1. The founder's three answers this pass rests on

| Question | Charles, 2026-09-12 | Recorded as |
|---|---|---|
| D271 — where does the hub run relative to the endpoint? | *"Current the hub and endpoint is on machine for development and testing. In production the hub will send on same LAN/WAN as the Agent."* | D271 **DECIDED**. The LAN row of the handover's §2.1 table. |
| How does the enrollment secret reach an endpoint, with no installer? | **config.json** (the recommended option) | **D285.** Plaintext, per install; the repository copy is empty and a test says so. |
| Should the console be reachable over the LAN too, or stay loopback-only? | **Open /admin too** | Part of **D283.** The sign-in and session code has still not had a security review; that review is owed before a customer's network sees the page, and the page says so. |

---

## 2. Exit criteria — the handover's §2.4, in order

| # | Criterion | Result |
|---|---|---|
| 1 | P3a's allow-list test still passes against the live route | **Yes.** `admin-static` §5f and `admin-db` §5e pass rekeyed (identity is the enrollment's device id); `admin-db` B3-5 reads the live route and asserts the allow-list keys on the wire and no sentinel from a ticket whose internal fields are populated. |
| 2 | A request with a valid reference and a wrong or absent credential returns nothing **and says why** | **Yes.** Absent → 401 with the exported sentence (names the header and `POST /v1/enroll`); well-formed unknown → 401 *"not one this hub issued"*; malformed → 401 *"they begin mdc_"*; non-Bearer → 401 *"nothing else is understood"*. No `tickets` key on any of them. `x-matic-hub-auth: none`. |
| 3 | A revoked enrollment stops working on its **next** request | **Yes.** B3-5 revokes from the console and the very next `GET /v1/tickets` is 401 *"REVOKED by an administrator"*, and so is its `POST /v1/ticket` — on the loopback listener, where no credential is required: a presented credential is checked everywhere. Twenty refusals from one peer in a minute → 429. |
| 4 | `last_seen_at` moves on an authenticated call and not on enrollment alone | **Yes.** B3-2: enrollment stamps it, then `authenticateDeviceCredential()` moves it further; B3-5: an authenticated `GET /v1/health` moves it. |
| 5 | D274's detector fails, and the Agents page copy is rewritten only after 3 and 4 are true | **Yes, in that order.** Writer and enforcement in `a7b4c8e`/`3eff3f5`; the client commit `e207a3c` printed `FAIL  THE CLIENT NOW ENROLLS (agent/enrollment.js) — D272/D273's copy is FALSE and must be revisited…` `208 passed, 1 failed`; the copy and the inverted detector are `41954ad`. |
| 6 | The tenant on a requester route comes from the credential, not the environment | **Yes.** B3-5 starts a second hub with `ticketTenant: null`: an unauthenticated `POST /v1/ticket` is 503 as before; the same POST with the credential is 201 into the credential's tenant, `GET /v1/tickets` on that hub lists both of the enrollment's tickets, and `POST /v1/session` records into the credential's tenant. |

The handover's §2.2 scope, item by item: client enrollment at startup — built; the credential, hash
stored, plaintext shown once — built; per-OS-user, said on the route, in `/v1/health` and in the register
— built; `last_seen_at`'s writer — built; revocation as enforcement — built; tenant from
`control.devices.tenant_id` — built; `GET /v1/tickets` on P3a's reader with an honesty field — built; a
body cap (the existing 1 MB), a per-enrollment rate limit (60 reads a minute, the poll floor's server
half) and the poll floor — the server half is built, the client's own interval is P4's with the polling
it governs.

---

## 3. What was built, by commit

### 3.1 `a7b4c8e` — the credential (D282)

`migrations/control/008-device-credential.sql`: `devices.credential_hash bytea`, `credential_issued_at`,
a partial unique index. `submitEnrollment()` mints `mdc_` + 43 base64url characters on activation (auto-
approve, or the first submission after a hand approval), returns it once, stores sha256;
`WHERE credential_hash IS NULL` makes "once" a database property; a device that already holds one gets
`credential: null` and a sentence (replacement is revoke-and-re-enroll). `authenticateDeviceCredential()`
looks up by hash, refuses with a named reason, and stamps `last_seen_at`. The route and the CLI carry the
credential once with a handling note and `IDENTITY_NOTE`.

### 3.2 `da7a86b` — `tickets.device_id` (D284)

`migrations/tenant/008-ticket-device.sql`: a bare uuid, no foreign key (tenant/001's argument), a partial
index. `createTicket()` writes it from an option the route fills from a verified credential. The requester
readers are rekeyed: `WHERE t.reference = $1 AND t.device_id = $2`, plus `listTicketsForRequester()`; one
column string and one shaping function serve both. The detail page and `bin/tickets.mjs show` say whether
a ticket was filed with a credential.

### 3.3 `3eff3f5` — the hub (D282, D283, D284)

`authenticate()` filled: peer gate (`admitPeer`), then the credential check on every listener, then the
listener's requirement (`credentialRequired`), then the routes. `x-matic-hub-auth` is `device-credential`
or `none` per response. `listenPlanFromEnv()` — `MATIC_HUB_BIND`, `MATIC_HUB_TLS_CERT`, `MATIC_HUB_TLS_KEY`
— refuses a LAN bind without TLS before anything is built; `createHubServer({ tls })` is HTTPS when given
material. `src/tickets/read.js`: the two requester routes, no SQL, the `identity` field, the rate limit.
`/v1/ticket` and `/v1/session` take the tenant from the credential. The console's login page and every
footer say where the console is reachable from, read from the bound socket. `/v1/health` gains `listener`,
`enrollment` and a policy sentence; GET / and the banners follow it. D267's guard 2 is load-bearing.

### 3.4 `e207a3c` — the client (D282, D285)

`client/src/agent/enrollment.js` (`EnrollmentStore`, `ensureEnrolled`, `newDeviceKeyId`); `HubClient`
presents the credential via one `#headers()`, gains `setCredential()`, `listTickets()` and `ticket()`
(wired to no surface — P4's); `main.js` enrolls after building the client and retries pending, locked and
unreachable on a five-minute timer; `config.json` gains `enrollment: { tenant, secret: "" }` and a note.

### 3.5 `41954ad` — the Agents page (D272 revisited, D273 reverted, D274 inverted)

The above-the-fold note says endpoints enroll themselves at startup and the counts are enrollments per
OS user; "Last seen" returns as a heartbeat with a Credential column beside it; Revoke says it blocks the
next authenticated request and names the loopback exception; the `notYet()` block says what the
credential proves and does not; §6a requires the new copy and fails the day `client/src` stops calling
the route.

---

## 4. Decided beyond the handover, and why (register §5.57a)

- **The credential is optional on a loopback listener and required on a LAN one — decided by the
  listener, not the peer.** The handover's same-machine row says a credential nobody can reach the route
  without is theatre; the LAN row says every request needs one. Both are true of their listener, so the
  hub reads its own bound address (`httpServer.address()`, D267's shape) and applies the row that fits.
  A credential that IS presented is checked on either. Development, the test suites, the launcher's
  warm-up turns and the demo box keep working unauthenticated on loopback; a LAN deployment refuses
  everything but enroll and health without one.
- **The requester's scope is the enrollment, not the OS username.** P3a keyed the readers on the name
  because no device column existed and said the column and the clause would arrive together. They did.
  The name is self-asserted at enrollment and at filing (D215); the enrollment id is something only the
  credential-holder can present. Costs accepted from plan v3 §6.2: a reinstall sees no earlier tickets,
  and a ticket filed without a credential is readable by no requester route.
- **TLS or nothing, enforced twice.** `listenPlanFromEnv()` refuses to start, and `admitPeer()` refuses a
  plaintext non-loopback peer per request, so a server built any other way still cannot serve credentials
  in the clear. The cookie's `Secure` flag became unconditional off loopback by construction (the socket
  is TLS), not by a flag.
- **D267's `MATIC_HUB_HOST` rejection is superseded, with both of its objections met.** It was rejected
  because a host option would have created exposure for the sake of a demo and tripped D222's cookie rule.
  `MATIC_HUB_BIND` exists because D271 made the LAN the production shape, TLS is mandatory off loopback, and
  the cookie is Secure there. Guard 2 now fires in a shipped configuration.
- **One credential per device, replacement is revoke-and-re-enroll.** A re-submission from a device that
  already holds one gets no second copy, whoever presents the enrollment secret and the key, because a
  copy minted to whoever asks is a takeover; the console sees every replacement in its queue.
- **The client makes no request for its own tickets without a credential.** The hub would answer 401 and
  the reason is already known on the endpoint; a request that cannot succeed is noise on the hub.
- **`localhost` is a LAN bind to this hub.** The LOOPBACK set names addresses, and a name that resolves
  to loopback on one machine may not on another; the refusal says to bind `127.0.0.1`.

---

## 5. Verification

- **Red, then green, both recorded, in the order the handover required.** The D274 detector's failure and
  its exact sentence are in `e207a3c`'s message; the writer and enforcement commits precede it; the copy
  commit follows it.
- **Run by hand against the real entry point.** `MATIC_HUB_BIND=0.0.0.0` with no certificate: `THIS HUB
  DID NOT START.` in a box, naming the bind, both variables and D283, exit 1. `MATIC_HUB_BIND=127.0.0.2`
  with a one-day self-signed certificate (openssl, SAN `IP:127.0.0.2`, trusted explicitly as the CA — never
  `rejectUnauthorized: false`): the LAN banner, `[hub] listening on https://127.0.0.2:8799 (TLS)`; from a
  `127.0.0.3` peer, `/v1/health` 200 with `listener: { tls: true, loopback: false }` and `auth: "required
  …"`, `POST /v1/turn` 401 naming the header and `POST /v1/enroll`, an unknown credential 401 *"not one
  this hub issued"* (the control plane was up), plaintext to the TLS port hung up, `/admin/login` 200
  *"Reachable from the network."*, `GET /admin` 303 to sign-in.
- **The LAN path in the suite runs on ONE machine's loopback adapter.** `bind.test.mjs` binds 127.0.0.2
  and connects from 127.0.0.3 — non-loopback to the hub's set, never leaving the machine. No second
  machine, no real network, no CA-issued certificate has been tried. That is the honest limit of what
  "the LAN listener works" means today.
- **Live, against the real console and database:** everything in §2, plus the console's Agents page over
  real revoked rows showing the Credential column, and the login page's copy.
- **Not looked at in a browser by a person.** Rendered and asserted over HTTP.
- **No performance claim.** The rate limit's number (60/min) and the bad-credential throttle (20/min per
  peer) are chosen, not measured; the enrollment retry (5 min) likewise.
- **The dev database is migrated** (`control 008-device-credential, applied 1`; `t_devco
  008-ticket-device, applied 1`). No dev ticket was moved. The running dev endpoint has NOT enrolled: the
  repository's `config.json` carries an empty secret, so on the next start it logs `[enroll] disabled` with
  the command that mints one.

---

## 6. Not built, and what is owed

- **D60/D61/D63/D64.** No TPM key, no signed assertion, no token exchange, no broker custody. The
  credential is the weaker step on D61's path and every surface says so. `docs/B3-DEVICE-ENROLLMENT.md`'s
  status block is updated to the plan's wording: enrollment credential authentication is built;
  hardware-bound device identity and user attestation are not.
- **The console's security review**, owed before a customer's network sees the sign-in page. Charles
  chose to open it; the page says the review has not happened.
- **D270's condition 1 is now live.** The job runner is in-process, and D271 puts the hub on a different
  machine from the endpoint in production. Promotion to a separate worker is owed before a LAN deployment.
  Not built here; recorded in D271's row and §5.57d.
- **P4:** the panel's ticket view, the polling interval (the client half of the poll floor), the toast,
  `POST /v1/ticket/:ref/comment`, confirm, reopen, ack. `HubClient.listTickets()` exists so P4 wires a
  call. **P5:** auto-close.
- **The client's connectivity pill does not know about 401s.** `HubLink` probes `/v1/health`, which is
  public, so a LAN hub that refuses every turn for want of a credential still reads "reachable". The
  `[enroll]` log lines are the only surface that says why. A P4 item.
- **The launcher's warm-up turns** hit `http://127.0.0.1:8787` unauthenticated; on a LAN bind they would
  need the credential or a loopback listener beside it. Not a demo-box concern; noted.
- **`description` stays hidden** from the requester (P3a's choice); P4 decides.
- **No key rotation, no credential expiry.** Replacement is revoke-and-re-enroll, by design for now.

---

## 7. Next, and whose

**P4 is the next unblocked slice** — D271 gates nothing any more. **Charles's, not blocking:** the
resolution-code vocabulary (plan v3 question 8); OPEN-12; `demo-laptop-01`; when to fill in a real
enrollment secret on the dev endpoint (`node bin/devices.mjs create-secret devco --ttl-days 30`, then
`client/config.json`); the console security review before any LAN deployment; D270's worker promotion
before the same.
