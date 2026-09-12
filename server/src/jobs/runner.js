// @ts-check
/**
 * The job runner: the loop that gives control.job_queue a runtime. D270 (2026-09-12).
 *
 * WHAT WAS TRUE BEFORE THIS FILE. `src/db/jobs.js` had enqueue/claim/finish/fail/runOne since B1
 * and NOTHING CALLED runOne outside a test. A job put on the queue sat there. The lifecycle plan's
 * v2 said auto-close "needs no new infrastructure"; its review found that false, and this is the
 * infrastructure.
 *
 * ===============================================================================================
 * THE CONTRACT: AT-LEAST-ONCE. IDEMPOTENCY IS THE HANDLER'S JOB. READ THIS BEFORE WRITING ONE.
 * ===============================================================================================
 *
 * This runner guarantees that a due job is handed to exactly one worker at a time (SKIP LOCKED)
 * and that a job left `running` by a process that died is run AGAIN. It does not, and cannot,
 * guarantee a job runs once: a process can die after the handler's work committed and before
 * finish() marked the row, and the only honest recovery is to run it again. So EVERY handler
 * (src/jobs/handlers.js) re-checks its own precondition from the tenant's rows before acting, and
 * treats "the world has moved on" as success, not failure. `ticket.autoclose` will depend on this
 * and P5 will get it wrong if it is not written down here: the job must be bound to the specific
 * resolution that enqueued it, not merely to the ticket, or resolve -> reopen -> resolve closes a
 * five-minute-old resolution with a job meant for an older one.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 *
 *   - It does not assert the tenant. `withTenant()` is the only door and it already asserts, on
 *     the schema name that came off the job row (src/db/tenant.js). A second check here is the
 *     copy a future worker forgets (jobs.js's header says the same).
 *   - It does not decide whether the hub starts. A tick that cannot reach PostgreSQL logs ONCE,
 *     keeps polling, and logs once more when the queue is back. `/v1/health` already reports
 *     corpus errors rather than refusing to boot; the runner must not take that property away.
 *   - It does not run two ticks at once in one process. A tick that finds the previous one still
 *     going returns; the interval is a floor, not a promise.
 *   - It does not retry a handler that threw. runOne() records the row `failed` with the message.
 *     Retry is what the REAPER does, and only for rows a process abandoned (`running` past a
 *     timeout): back to `queued` with the attempt count kept, or `failed` past the cap.
 *   - It does not claim a job it has no handler for. claim() is given the registry's type list, so
 *     a row of another type stays `queued` for a process that knows it — failing it would destroy
 *     work during a rolling restart, and would let a running dev hub fail every job a test suite
 *     enqueues against the same database. The cost is that an unknown type could wait silently;
 *     so it is NOT silent: each tick counts due jobs of other types and the runner logs the figure
 *     whenever it changes. A hub with an EMPTY registry claims nothing and reports everything.
 *
 * SHAPE. In-process, started from src/index.js inside the listen callback, with the loop isolated
 * here and its primitives injectable, so promoting it to `bin/worker.mjs` (a separate process,
 * which a real deployment will want) is a move of the start() call and not a rewrite. In-process
 * was chosen because the current deployment is one process on one machine and a second process is
 * a second thing to forget to start.
 *
 * Configuration (src/index.js reads it): MATIC_JOBS_POLL_MS — default 5000; 0 disables the runner
 * entirely (queued jobs then stay queued, which is exactly what happened before this file).
 */
import { hostname } from "node:os";
import { runOne as realRunOne, reapStuck as realReapStuck, waitingOfOtherTypes as realWaiting } from "../db/jobs.js";

export const DEFAULT_POLL_MS = 5000;
/** Below this a misconfigured value would poll the database in a tight loop. */
export const MIN_POLL_MS = 250;
/** A `running` row older than this with no finish() is treated as abandoned by a dead process. */
export const STUCK_AFTER_MS = 10 * 60_000;
/** Claims a job may receive before the reaper marks it `failed` instead of requeueing it. */
export const MAX_ATTEMPTS = 5;
/** One tick drains at most this many jobs, so a full queue cannot starve the interval. */
export const MAX_JOBS_PER_TICK = 20;

/**
 * The poll interval from the environment. Unset -> default; "0" -> 0 (disabled); anything that is
 * not a non-negative number -> default; a positive number below the floor -> the floor.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {number} milliseconds, or 0 for "do not run"
 */
export function pollIntervalFromEnv(env = process.env) {
  const raw = env.MATIC_JOBS_POLL_MS;
  if (raw === undefined || raw === "") return DEFAULT_POLL_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_POLL_MS;
  if (n === 0) return 0;
  return Math.max(n, MIN_POLL_MS);
}

/**
 * @typedef {object} RunnerStats
 * @property {number} ticks       ticks that actually ran (an overlapping call does not count)
 * @property {number} ran         jobs whose handler completed and were marked done
 * @property {number} failed      jobs whose handler threw (or had no handler) and were marked failed
 * @property {number} reaped      abandoned rows the reaper moved (requeued + failed)
 * @property {number} outages     transitions into "the queue is unreachable"
 * @property {number} waiting     due jobs of types this process has no handler for, as of the last tick
 */

/**
 * Build a runner. Nothing happens until start() or tick().
 *
 * @param {{
 *   handlers?: Record<string, (job: import("../db/jobs.js").Job, client: import("pg").PoolClient) => Promise<void>>,
 *   pollMs?: number,
 *   workerId?: string,
 *   log?: (line: string) => void,
 *   stuckAfterMs?: number,
 *   maxAttempts?: number,
 *   maxPerTick?: number,
 *   primitives?: { runOne: typeof realRunOne, reapStuck: typeof realReapStuck, waitingOfOtherTypes: typeof realWaiting },
 * }} [opts]
 */
export function createJobRunner({
  handlers = {},
  pollMs = DEFAULT_POLL_MS,
  workerId = `${hostname()}:${process.pid}`,
  log = console.log,
  stuckAfterMs = STUCK_AFTER_MS,
  maxAttempts = MAX_ATTEMPTS,
  maxPerTick = MAX_JOBS_PER_TICK,
  // Injectable so the headless test can drive the loop with fakes; the live test uses the real ones.
  primitives = { runOne: realRunOne, reapStuck: realReapStuck, waitingOfOtherTypes: realWaiting },
} = {}) {
  /** @type {NodeJS.Timeout|null} */
  let timer = null;
  let ticking = false;
  let unreachable = false;
  /** The last "jobs of other types are waiting" line, so it is logged on change and not every tick. */
  let lastWaitingLine = null;
  /** @type {RunnerStats} */
  const stats = { ticks: 0, ran: 0, failed: 0, reaped: 0, outages: 0, waiting: 0 };
  /** The registry's keys: the only types claim() may hand this process. Empty -> claims nothing. */
  const types = Object.keys(handlers);

  /** Set by dispatch() so tick() can tell a handler failure (row already marked) from the database being down. */
  let current = null;
  const dispatch = async (job, client) => {
    current = job;
    const handler = handlers[job.type];
    // Unreachable while claim() honours `types`; kept so a primitive that ignores them still fails
    // the row with a reason rather than running nothing and marking it done.
    if (!handler) throw new Error(`no handler registered for job type ${JSON.stringify(job.type)} in this process`);
    await handler(job, client);
  };

  async function tick() {
    if (ticking) return stats;
    ticking = true;
    stats.ticks++;
    try {
      const reaped = await primitives.reapStuck({ olderThanMs: stuckAfterMs, maxAttempts });
      if (reaped.requeued.length || reaped.failed.length) {
        stats.reaped += reaped.requeued.length + reaped.failed.length;
        log(`[jobs] reaper: ${reaped.requeued.length} abandoned job(s) back to queued (${reaped.requeued.join(",") || "-"}), ${reaped.failed.length} failed after ${maxAttempts} attempts (${reaped.failed.join(",") || "-"})`);
      }
      for (let i = 0; types.length > 0 && i < maxPerTick; i++) {
        current = null;
        let job;
        try {
          job = await primitives.runOne(workerId, dispatch, { types });
        } catch (err) {
          // runOne() has already marked the row failed and re-thrown - IF the handler was reached.
          // If it was not, the claim itself failed: that is the database, not the job.
          if (!current) throw err;
          stats.failed++;
          log(`[jobs] job ${current.id} (${current.type}) failed: ${err instanceof Error ? err.message : String(err)}`);
          continue;
        }
        if (!job) break;
        stats.ran++;
      }
      // What this process is leaving for another. Logged when the picture changes, not per tick.
      const waiting = await primitives.waitingOfOtherTypes(types);
      stats.waiting = waiting.reduce((a, w) => a + w.n, 0);
      const line = stats.waiting === 0
        ? null
        : `[jobs] ${stats.waiting} due job(s) of ${waiting.length} type(s) this process has no handler for are waiting on the queue: ${waiting.map((w) => `${w.type} (${w.n})`).join(", ")}. They run when a hub that knows them polls; nothing here fails them`;
      if (line !== lastWaitingLine) {
        if (line) log(line);
        else if (lastWaitingLine) log("[jobs] no due jobs of other types are waiting any more");
        lastWaitingLine = line;
      }
      if (unreachable) {
        unreachable = false;
        log("[jobs] the queue is reachable again");
      }
    } catch (err) {
      if (!unreachable) {
        unreachable = true;
        stats.outages++;
        log(`[jobs] the queue is unreachable (${err instanceof Error ? err.message : String(err)}); polling continues every ${pollMs} ms and this will say when it is back`);
      }
    } finally {
      ticking = false;
    }
    return stats;
  }

  function start() {
    if (timer) return false;
    if (!(pollMs > 0)) return false;
    timer = setInterval(() => { void tick(); }, pollMs);
    // A timer must not be the thing keeping a process alive after the server closed.
    if (typeof timer.unref === "function") timer.unref();
    void tick();
    return true;
  }

  function stop() {
    if (!timer) return false;
    clearInterval(timer);
    timer = null;
    return true;
  }

  return { start, stop, tick, workerId, stats, get running() { return timer !== null; } };
}
