# B1 — Control-plane schema, migrations and tenant isolation

**Date:** 2026-09-03 (night)
**Decision:** D143. New decisions from building it: **D193–D197** (register §5.12).
**Handover:** [`../../docs/handovers/2026-09-03-claude-code-handover-b1-schema.md`](../../docs/handovers/2026-09-03-claude-code-handover-b1-schema.md) Task 3.

> ## STATUS — BUILT AND RUN. All six exit criteria pass.
>
> **`npm.cmd run test:db`: 56 assertions, 0 failures**, against **PostgreSQL 17.11** with pgvector
> in Docker. Run three times: on a fresh database, again on the same one, and again after
> `db:down` destroyed the volume and `db:up` rebuilt it — the same 56 each time. The CLI
> (`create-tenant`, `status`, `tenants`) was exercised by hand on top.
>
> **`npm.cmd test` is 76 assertions, 0 failures** and needs no database: 33 from the B0 hub and 43
> from `test/db-static.test.mjs`, which enforces every design rule in this document that is a
> property of the source rather than of a running server.
>
> **One real bug was found by running it**, and it was in the test fixture rather than the schema:
> teardown ran before `migrate()`, so on a *fresh* database it hit
> `relation "control.job_queue" does not exist` and the suite died before its first assertion. Fixed
> in both places — `dropTenantForTests()` now checks `to_regclass` before deleting, and the suite
> migrates before it touches anything. **No migration SQL needed a correction**, including
> `tenant/002`'s hand-guarded `ADD CONSTRAINT`, which was flagged here as the least-tested line.
>
> Still not measured: nothing about latency, connection behaviour under load, or migration timing
> against a non-empty schema. The numbers in `pool.js` remain development figures.

---

## 1. What B1 is, and what it deliberately is not

**In:** the schema, a migration runner that reaches the control plane and every tenant schema in
one run, tenant creation, the job queue, and a test that tries to break isolation.

**Out, and each stays visibly out:** enrollment logic (B3), the ticket store, KB tables (B7), audit
ingestion (B5). Those sit *on* this.

**Also out, and this one is load-bearing: `POST /v1/turn` acquired no database.** B0's
statelessness is a property worth keeping, and `test/db-static.test.mjs` §6 fails if `src/turn.js`
or `src/index.js` ever imports anything under `src/db/`.

| File | What |
|---|---|
| `migrations/control/001-control-plane.sql` | tenants, devices, enrollment requests and secrets, releases, job queue, admin users/roles/audit, vendor access grants |
| `migrations/tenant/001-tenant-base.sql` | the per-tenant baseline: its own migration ledger, users, sessions |
| `migrations/tenant/002-session-outcome.sql` | `sessions.outcome`, with the four-outcome CHECK (D89 + D118) |
| `src/db/pool.js` | one pool, and `withControl()` |
| `src/db/tenant.js` | **the security-relevant file.** `assertTenantSchema()` and `withTenant()` |
| `src/db/migrate.js` | the runner. Two ledgers, checksums, one transaction per migration |
| `src/db/tenants.js` | `createTenant()` — row, schema, every migration |
| `src/db/jobs.js` | `enqueue()`, `claim()`, `runOne()` |
| `bin/db.mjs` | `migrate`, `create-tenant`, `tenants`, `status` |

---

## 2. PostgreSQL 17, pinned (D197)

`docker-compose.yml` pins `pgvector/pgvector:pg17`. pgvector 0.8.2 covers PG 15–18 (register
§10.1), and 17 is the current RDS default track.

**The B1 handover asked for a `[VERIFY]` on pgvector's supported versions on RDS. It was already
answered** — register §10.1 records 0.8.2 on PG 15–18, HNSW, a 2,000-dimension index limit, and
that a micro instance holds roughly one 25,000-chunk tenant. No lookup was needed.

The dev container also caps `max_connections=80`, the `db.t4g.micro` figure that killed per-tenant
pollers. Connection exhaustion should surface on a laptop, not in a pilot.

---

## 3. The extension is installed ONCE, database-wide (D193)

**The plan of record was not implementable.** The handover says *"pgvector must be enabled in the
per-tenant schema template even though KB tables come later (D52a)"* — and `D52a` does not exist in
the register at all (§5.11b; the real citations are **D59a** and **D143**).

More importantly, the instruction cannot be carried out. **A PostgreSQL extension is installed into
a *database*, and its objects live in exactly one schema.** `CREATE EXTENSION vector` in a
per-tenant template succeeds for the first tenant and fails for the second.

What is implementable, and is what `control/001` does:

```sql
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
```

…and every tenant transaction runs with `search_path = <tenant>, extensions`. A tenant table can
then declare `vector(768)` with no qualification, per-tenant HNSW indexes still live inside the
tenant's own schema, and there is **one** extension to upgrade instead of N.

The intent behind the instruction is met exactly: no tenant needs a further migration before it can
hold vectors. `db-static.test.mjs` §3 fails if any tenant migration ever contains `CREATE
EXTENSION`.

---

## 4. Connection handling: `SET LOCAL` inside a transaction (D194)

The handover put the choice plainly: *"With a pooler, setting `search_path` on checkout is unsafe —
a pooled connection can be handed on with a stale path. Either schema-qualify every query, or set
`search_path` inside the transaction. Pick one and enforce it; mixing them is how cross-tenant
leaks happen."*

**The pick is `SET LOCAL search_path` inside a transaction owned by `withTenant()`.**

Why that one and not schema-qualification: **the migration path depends on it.** Exit criteria 3
and 4 require the same tenant migration file to run unchanged against every tenant schema, which is
impossible if every statement names its schema.

`SET LOCAL` is transaction-scoped and reverts at COMMIT or ROLLBACK, so a released connection
carries nothing onward.

**How it is enforced rather than merely intended:**

- **There is no `getTenantClient()`.** No function anywhere returns a connection already pointed at
  a tenant. The only door is `withTenant()`, and it owns the transaction. `db-static.test.mjs` §5
  fails if such an export ever appears.
- `src/db/pool.js` never sets `options: '-c search_path=…'` on the pool. That is the unsafe form,
  and a test asserts its absence.
- `withControl()` pins `search_path` to `extensions` only — **not** `public` — so an unqualified
  table name in a control query is an error rather than an accidental read of whatever happens to
  be on the path.
- The tenant path is `<tenant>, extensions`, also without `public`.

---

## 5. The assertion is the injection defence (D143)

`withTenant()` calls `assertTenantSchema()` **before** it takes a connection. That function does
two things, and both matter:

1. A shape check, `^t_[a-z0-9_]{1,54}$`, matching the CHECK constraint on
   `control.tenants.schema_name`.
2. **A lookup against `control.tenants`**, excluding `offboarding` tenants.

The reason it is a lookup and not just a regex: **`SET` cannot take a bind parameter**, so the
schema name is interpolated into SQL. The allow-list *is* the injection defence. A regex alone
would pass `t_anything` straight through to `SET LOCAL search_path`.

The result is cached after the first success, because this runs before every tenant query and a
round trip per query would make the safe path the slow path — which is how safe paths get removed.
The cache cannot go stale dangerously: `schema_name` is UNIQUE with no rename path, so the cache
can only fail to know about a *new* tenant, and `createTenant()` warms it.

**`jobs.js` does not assert anything.** `claim()` returns a job carrying `tenantSchema` and does not
check it; the check happens because the only way to touch tenant data is `withTenant()`. One place,
every path — rather than an assertion in each worker that a worker written next year would forget
to copy.

---

## 6. What criterion 2 actually proves, and what it does not

Exit criterion 2 is *"a query executed in tenant A's context cannot read tenant B's rows, proven by
a test that tries."* The test tries, and it also tries the other way, because the honest answer has
two halves (D195).

**`search_path` is a name-resolution mechanism, not a permission boundary.**

| | Result |
|---|---|
| Unqualified `SELECT … FROM sessions` inside `withTenant(A)` | Sees **only A's rows**. Criterion 2 holds |
| `current_schema()` inside `withTenant(A)` | A's schema |
| A released connection's `search_path` | Carries no tenant |
| **Schema-qualified `SELECT … FROM <B>.sessions` inside `withTenant(A)`** | **Reads B's rows.** The application role owns every schema |

That last row is asserted as a **passing test**, deliberately, so nobody reads criterion 2 as a
stronger guarantee than it is. **The isolation B1 provides is against accidental cross-tenant
access, not against a deliberate one.**

What would make it a real boundary — and what B1 does not build:

- **A database role per tenant**, with `REVOKE USAGE ON SCHEMA` for every other tenant. The real
  boundary, and it collides with the 80-connection ceiling: a pool per role reintroduces exactly
  the arithmetic that killed per-tenant pollers. **Not a schema decision — a pooling decision.**
- **Row-level security.** Does not apply as things stand: RLS gates rows within a shared table, and
  D143 separates tenants by *schema*.

Between here and there, the guarantee rests on `withTenant()` being the only door, which is why
that is asserted in the dependency-free suite rather than left to review.

**A security review will ask this question.** The answer should be the table above, not a claim of
isolation.

---

## 7. The job queue carries references, not payloads (D196)

`control.job_queue` is the one deliberately cross-tenant table, because per-tenant queues need
per-tenant pollers and the connection arithmetic forbids that.

The consequence is that it holds as little as possible: a job id, a type, a tenant schema name, a
reference id. **There is no `payload` column and no `jsonb` anywhere in the table**, and
`enqueue()` has no parameter for one. A bug that leaks a job row leaks a schema name and a uuid; the
same bug with a payload column leaks customer data out of the one table that is not tenant-scoped.

`tenant_schema` is a foreign key to `control.tenants(schema_name)`, so a job cannot name a schema
that does not exist — which gives the worker's assertion something real to assert against.

`claim()` uses `FOR UPDATE SKIP LOCKED`, so a second worker steps over a locked row instead of
blocking on it, and the same job reaches exactly one worker.

`fail()` truncates the error to 500 characters, and the comment says why: an error string is the
most likely accidental route for customer data into the cross-tenant table.

---

## 8. Migrations

Two ledgers: `control.schema_migrations`, and a `schema_migrations` table **inside each tenant
schema**. Per-tenant rather than one central table with a schema column, so a tenant schema carries
its own version and can be dumped, restored or moved while still knowing what it is.

- **One run moves everything.** `migrate()` applies pending control migrations, then pending tenant
  migrations to every schema in `control.tenants`. That is criterion 3, and it is also what makes
  criterion 4 true without anyone remembering anything.
- **Idempotent twice over.** The runner skips applied versions, and every migration file is
  individually re-runnable. The second belt matters because half-applied is the state you are
  actually in when something fails.
- **A changed file is an error, not a skip.** The ledger stores a checksum (line-ending normalised,
  because `.gitattributes` stores LF while the working tree shows CRLF). Editing an applied
  migration is what makes two environments diverge silently, so the runner refuses.
- **One transaction per migration**, so the ledger and the schema always agree about what happened.
- `suspended` tenants are migrated; `offboarding` ones are not. A suspended tenant is expected back,
  and letting its schema fall behind turns reinstatement into a migration project.

---

## 9. Running it

```bash
cd server
npm.cmd install                      # pg is server/'s first dependency
npm.cmd test                         # 76 assertions, no database needed
npm.cmd run db:up                    # docker compose up -d
npm.cmd run migrate                  # control plane + every tenant schema
npm.cmd run db -- create-tenant acme-corp
npm.cmd run db -- status
npm.cmd run test:db                  # the six exit criteria: 56 assertions
npm.cmd run db:down                  # and delete the volume
```

`test:db` creates and removes its own `b1-test-*` tenants, so it is safe to re-run and safe to run
against a database that already has tenants in it. It migrates before it does anything else, so a
brand-new database needs no `migrate` first.

`MATIC_DB_URL` overrides the connection, default
`postgres://matic:matic@127.0.0.1:5433/matic`. **Port 5433, not 5432**, so that a real local
Postgres cannot be connected to by accident.

`bin/db.mjs` has no production entry point on purpose: a migration against a real control plane is
a release step with a change record, not a script someone runs from a laptop.

---

## 10. Exit criteria

| # | Criterion | Where | Status |
|---|---|---|---|
| 1 | Two tenants exist with separate schemas | `db.test.mjs` §1 | **PASS** (5 assertions) |
| 2 | A query in A's context cannot read B's rows, proven by a test that tries | `db.test.mjs` §2, §2a | **PASS** (14) — **and see §6.** It holds for unqualified access only. The qualified read is asserted as a deliberately passing test labelled a known limit, so the criterion is met in the sense the test states and not in a stronger one |
| 3 | A migration applies to the control plane and both tenant schemas in one run, and is idempotent | `db.test.mjs` §3 | **PASS** (2) |
| 4 | Adding a third tenant applies every existing migration automatically | `db.test.mjs` §4 | **PASS** (5) — including `sessions.outcome` and its four-outcome constraint, which came from a migration written before the tenant existed |
| 5 | A job for B is picked up by a worker that asserts B's schema and sees only B's data | `db.test.mjs` §5 | **PASS** (8) — the worker sees B's three rows, not A's one or C's two |
| 6 | `FOR UPDATE SKIP LOCKED` hands the same job to exactly one of two concurrent workers | `db.test.mjs` §6 | **PASS** (5) — one of two concurrent claims gets the job and the other gets `null` rather than blocking or duplicating; three workers on three jobs take three different ones |

Plus §0 (the PG 17 pin and the single extension), §7 (`vector` resolves unqualified from inside a
tenant transaction), §8 (an edited migration is an error, not a skip) and §9 (the built schema's
constraints, including D153's window requirement and D155/D159's credential rule). **56 assertions,
0 failures.**

The design rules underneath them — one door to a tenant, no payload column, `SET LOCAL` not `SET`,
B0 still stateless, tenant migrations unqualified, the extension installed once — are
`db-static.test.mjs`, **43 assertions, passing**, in `npm test` with no database.

---

## 11. Honesty ledger

- **The schema is now run, but on one machine, once, against an empty database.** 56 assertions
  pass on PostgreSQL 17.11 in Docker. Nothing has been applied to RDS, to a non-empty schema, or
  under concurrency beyond the three-worker `SKIP LOCKED` check.
- **The bug that running it found was in the fixture, not the schema.** Teardown ran before
  `migrate()` and died on a fresh database. Worth recording because it is the failure mode the
  suite is most likely to repeat: a test that only ever runs against a database someone already
  migrated will not notice it has that dependency. It is now run against a destroyed-and-rebuilt
  volume for exactly that reason.
- **`ADD CONSTRAINT` has no `IF NOT EXISTS` in PostgreSQL 17**, which is why `tenant/002` guards it
  with a `DO` block against `pg_constraint`. That guard is the least-tested line in the change.
- **Criterion 2 is weaker than its wording suggests** (§6). This is the finding most worth carrying
  into a security review.
- **The `assertTenantSchema` cache is a judgment call.** It trades a stale-cache risk that the
  UNIQUE-and-no-rename argument closes, against a per-query round trip that would eventually get
  the assertion moved or removed. If tenant renaming is ever introduced, the cache becomes wrong.
- **Nothing here is measured.** No latency, no connection-count behaviour under load, no migration
  timing against a non-empty schema. The connection numbers in `pool.js` are development figures.
- **Control-plane tables beyond `tenants` and `job_queue` are shapes, not features.** Devices,
  enrollment, releases, admin identity and vendor grants exist so later items add rows rather than
  columns; none of them has logic. The CHECK constraints on them do encode real decisions (D153's
  window requirement, D155/D159's credential rule), and those are tested.
- **`sessions` stores no transcript content.** D154 puts transcript access behind the
  audience-change predicate and three tiers; storing the text before that mechanism exists would be
  storing something we have not decided who may read.
