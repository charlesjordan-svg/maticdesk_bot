// @ts-check
/**
 * The job queue. B1 (D143).
 *
 * ONE TABLE, DELIBERATELY CROSS-TENANT, CARRYING REFERENCES AND NOT PAYLOADS.
 *
 * `control.job_queue` is the only table in the system that is not tenant-scoped. That is a
 * decision, not an oversight: per-tenant queues would need per-tenant pollers, and a
 * `db.t4g.micro`'s ~80 connections is exactly why those were rejected.
 *
 * The consequence is that this table is the one place a cross-tenant bug can reach, so it holds as
 * little as possible: a job id, a type, a tenant schema name, and a reference id. **No payload.**
 * A bug that leaks a job row leaks a schema name and a uuid; the same bug with a `payload jsonb`
 * column leaks customer data. `enqueue()` has no parameter for one and `control/001` has no column
 * for one — if a future job type seems to need one, the answer is a row in the tenant's own schema
 * and a reference to it.
 *
 * THE ASSERTION IS NOT IN THIS FILE, AND THAT IS THE POINT
 *
 * `claim()` returns a job carrying `tenantSchema`. It does not check it. The check happens because
 * the only way to touch tenant data is `withTenant()`, which asserts against `control.tenants`
 * before it sets `search_path` (src/db/tenant.js). One place, every path — rather than an
 * assertion here that a second worker written next year would forget to copy.
 *
 * WHY `FOR UPDATE SKIP LOCKED`
 *
 * Two workers polling the same queue must not take the same job. `SKIP LOCKED` makes the second
 * worker step over the row the first has locked instead of blocking on it, so concurrency costs
 * nothing and the same job is handed to exactly one worker. That is exit criterion 6.
 *
 * SINCE 2026-09-12 THERE IS A RUNTIME (D270). For eight days these were primitives nobody called:
 * `runOne()` had one caller and it was a test. src/jobs/runner.js is the loop — an in-process
 * poller src/index.js starts inside its listen callback — and this file grew the two pieces it
 * needed: `cancelJobsFor()` (queued rows only; control/007 added the `cancelled` status) and
 * `reapStuck()` (rows left `running` by a process that died go back to `queued`, or to `failed`
 * past a retry cap). The runner's contract is AT-LEAST-ONCE and its header says why every handler
 * must tolerate running twice; read it before writing one.
 */
import { getPool, withControl } from "./pool.js";
import { withTenant } from "./tenant.js";

/**
 * @typedef {object} Job
 * @property {string} id            bigserial, as a string
 * @property {string} type
 * @property {string} tenantSchema  the schema this job is about. UNASSERTED here - see the header
 * @property {string | null} refId  a reference INTO that schema. Never a payload
 * @property {number} attempts
 */

/**
 * Put a job on the queue.
 *
 * @param {{ type: string, tenantSchema: string, refId?: string | null, runAfter?: Date }} job
 * @returns {Promise<string>} the job id
 */
export async function enqueue({ type, tenantSchema, refId = null, runAfter }) {
  return withControl(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO control.job_queue (type, tenant_schema, ref_id, run_after)
       VALUES ($1, $2, $3, COALESCE($4, now()))
       RETURNING id`,
      [type, tenantSchema, refId, runAfter ?? null],
    );
    return String(rows[0].id);
  });
}

/**
 * Claim one job, or null if there is nothing due.
 *
 * The lock, the status change and the commit are one transaction: a worker that dies after
 * claiming leaves the row `running` with `locked_at` set, which a reaper can time out. A worker
 * that dies mid-transaction leaves it `queued`, and the next poll takes it.
 *
 * `types` (D270): the job types this worker can run. Given, the claim takes only those and leaves
 * every other row queued for a process that knows them — so a hub with no handler for a type
 * never destroys that type's work by failing it, and a hub with an EMPTY registry claims nothing.
 * Omitted, any type is claimed (the B1 tests, which supply their own handler).
 *
 * @param {string} workerId  identifies the claimer in `locked_by`. Diagnostic, not a credential
 * @param {{ types?: string[] | null }} [opts]
 * @returns {Promise<Job | null>}
 */
export async function claim(workerId, { types = null } = {}) {
  return withControl(async (client) => {
    const { rows } = await client.query(
      `UPDATE control.job_queue
          SET status = 'running',
              locked_by = $1,
              locked_at = now(),
              attempts = attempts + 1,
              updated_at = now()
        WHERE id = (
                SELECT id FROM control.job_queue
                 WHERE status = 'queued' AND run_after <= now()
                   ${types ? "AND type = ANY($2::text[])" : ""}
                 ORDER BY run_after, id
                 FOR UPDATE SKIP LOCKED
                 LIMIT 1
              )
        RETURNING id, type, tenant_schema, ref_id, attempts`,
      types ? [workerId, types] : [workerId],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: String(r.id),
      type: r.type,
      tenantSchema: r.tenant_schema,
      refId: r.ref_id,
      attempts: r.attempts,
    };
  });
}

/** @param {string} id */
export async function finish(id) {
  await getPool().query(
    "UPDATE control.job_queue SET status = 'done', locked_by = NULL, updated_at = now() WHERE id = $1",
    [id],
  );
}

/**
 * @param {string} id
 * @param {string} error  stored as `last_error`. Keep it a message, not a dump: this table is the
 *                        cross-tenant one, and an error string is a place customer data leaks into
 *                        it by accident
 */
export async function fail(id, error) {
  await getPool().query(
    "UPDATE control.job_queue SET status = 'failed', last_error = $2, locked_by = NULL, updated_at = now() WHERE id = $1",
    [id, String(error).slice(0, 500)],
  );
}

/**
 * Run one job: claim it, do the work inside its tenant's schema, mark it done or failed.
 *
 * This is the shape every worker should take, and the reason it lives here rather than in each
 * worker: the handler never sees a connection it did not get from `withTenant`, so it cannot
 * accidentally query outside the tenant it was given.
 *
 * @param {string} workerId
 * @param {(job: Job, client: import("pg").PoolClient) => Promise<void>} handler
 * @param {{ types?: string[] | null }} [opts]  passed to claim(): the types this worker can run
 * @returns {Promise<Job | null>} the job that ran, or null if nothing claimable was due
 */
export async function runOne(workerId, handler, opts = {}) {
  const job = await claim(workerId, opts);
  if (!job) return null;
  try {
    // The assertion happens here, inside withTenant, on a schema name that came off the job row.
    await withTenant(job.tenantSchema, (client) => handler(job, client));
    await finish(job.id);
  } catch (err) {
    await fail(job.id, err instanceof Error ? err.message : String(err));
    throw err;
  }
  return job;
}

/**
 * Withdraw every QUEUED job of `type` about `refId`. Returns the ids it cancelled. D270.
 *
 * Queued only, on purpose. A `running` job is inside a handler and cannot be recalled from here;
 * the handler re-checks its own precondition when it runs, because the runner's contract is
 * at-least-once and it has to anyway (src/jobs/runner.js). So a cancel that arrives after the
 * claim does nothing and returns [] — the caller's precondition check is what protects it, and
 * this function is the fast path, not the guarantee. `done`, `failed` and already-`cancelled`
 * rows are left as the record they are.
 *
 * @param {string} type
 * @param {string} refId  the uuid the job is about. A job with no reference cannot be cancelled by this
 * @returns {Promise<string[]>}
 */
export async function cancelJobsFor(type, refId) {
  const { rows } = await getPool().query(
    `UPDATE control.job_queue
        SET status = 'cancelled', updated_at = now()
      WHERE type = $1 AND ref_id = $2 AND status = 'queued'
      RETURNING id`,
    [type, refId],
  );
  return rows.map((r) => String(r.id));
}

/**
 * Due jobs on the queue whose type is NOT in `types` — the work this process cannot run and is
 * leaving for one that can. The runner reports these so an empty or outdated registry is visible
 * in the log rather than silent in the table. D270.
 *
 * @param {string[]} types
 * @returns {Promise<Array<{ type: string, n: number }>>}
 */
export async function waitingOfOtherTypes(types) {
  const { rows } = await getPool().query(
    `SELECT type, count(*)::int AS n
       FROM control.job_queue
      WHERE status = 'queued' AND run_after <= now() AND NOT (type = ANY($1::text[]))
      GROUP BY type ORDER BY type`,
    [types],
  );
  return rows.map((r) => ({ type: r.type, n: r.n }));
}

/**
 * The reaper. A row `running` for longer than `olderThanMs` belongs to a worker that died between
 * claim() and finish(): it goes back to `queued` so the next tick runs it again, or to `failed`
 * once it has been claimed `maxAttempts` times. `attempts` is NOT touched here — claim() counts
 * every claim, so the figure is already "how many times this has been handed to a worker".
 * `last_error` says it was reaped and on which attempt, so a row that keeps being reaped explains
 * itself. D270.
 *
 * THIS IS WHY EVERY HANDLER MUST BE IDEMPOTENT: the process that died may have done the work and
 * missed only the finish(). The reaper cannot know, so it runs the job again.
 *
 * @param {{ olderThanMs: number, maxAttempts: number }} p
 * @returns {Promise<{ requeued: string[], failed: string[] }>}
 */
export async function reapStuck({ olderThanMs, maxAttempts }) {
  const { rows } = await getPool().query(
    `UPDATE control.job_queue
        SET status     = CASE WHEN attempts >= $2 THEN 'failed' ELSE 'queued' END,
            locked_by  = NULL,
            locked_at  = NULL,
            last_error = 'reaped: still running after ' || $1::text || ' ms with no finish (attempt ' || attempts || ' of ' || $2::text || ')',
            updated_at = now()
      WHERE status = 'running'
        AND locked_at < now() - make_interval(secs => $1::numeric / 1000)
      RETURNING id, status`,
    [olderThanMs, maxAttempts],
  );
  return {
    requeued: rows.filter((r) => r.status === "queued").map((r) => String(r.id)),
    failed: rows.filter((r) => r.status === "failed").map((r) => String(r.id)),
  };
}
