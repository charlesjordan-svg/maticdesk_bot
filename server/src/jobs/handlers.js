// @ts-check
/**
 * The job handlers this hub process knows, by job type. D270.
 *
 * EMPTY ON PURPOSE. The runtime (src/jobs/runner.js) exists before its first job type does,
 * because the lifecycle plan's P0.5 is "give control.job_queue a runtime" and its P5 is the first
 * job — `ticket.autoclose`, which needs the resolution-binding rule (plan §7.6) that does not exist
 * yet. A job of a type that is not in this map is NOT claimed by this process: it stays `queued`
 * for a hub that knows it (failing it would destroy work during a rolling restart), and the runner
 * logs how many such jobs are due whenever the figure changes, so an empty or outdated registry
 * is visible in the hub's log rather than silent in the table.
 *
 * THE CONTRACT EVERY ENTRY HERE SIGNS
 *
 *   1. At-least-once, never exactly-once. The runner can run a job twice: a process that dies
 *      after the handler finished but before finish() committed leaves the row `running`, the
 *      reaper returns it to `queued`, and the next tick runs it again. A handler therefore
 *      RE-CHECKS ITS PRECONDITION from the row it is about, inside the tenant transaction it is
 *      given, and does nothing if the world has moved on. For auto-close that means: the ticket is
 *      still `resolved`, and by the SAME resolution that enqueued this job.
 *   2. It receives `(job, client)` where `client` is already inside `withTenant(job.tenantSchema)`.
 *      It never opens its own connection and never names a schema; that is the one door (D143).
 *   3. The job row carries a REFERENCE (`job.refId`, a uuid into that tenant's schema), never data.
 *      Everything the handler needs it reads through `client`. If a job type seems to need a
 *      payload, the answer is a row in the tenant's schema and a reference to it (D196).
 *   4. It throws to fail. The runner records the message (first 500 characters) on the row as
 *      `last_error` — so the message is a sentence, not a dump: this is the cross-tenant table, and
 *      an error string is the easiest place for customer data to leak into it.
 *
 * @type {Record<string, (job: import("../db/jobs.js").Job, client: import("pg").PoolClient) => Promise<void>>}
 */
export const JOB_HANDLERS = Object.freeze({});
