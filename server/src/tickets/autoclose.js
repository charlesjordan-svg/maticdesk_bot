// @ts-check
/**
 * Auto-close (D289; P5 of the ticket-lifecycle plan, 2026-09-12): the first job type this hub runs.
 *
 * WHAT IT IS. When the desk resolves a ticket, `resolveTicket()` (src/tickets/query.js) enqueues
 * ONE `ticket.autoclose` job to run at `resolved_at + <the tenant's interval>` and writes that
 * job's id and instant on the ticket (tenant/010). If, when the job runs, the ticket is still
 * `resolved` BY THAT RESOLUTION — `auto_close_job_id` still equals the job's own id — the hub closes
 * it as `closed_by = 'auto'` and writes the public state change the requester's app will show.
 * Otherwise it does nothing and that is success: the requester confirmed (closed already),
 * commented (reopened; the resolution is gone), or the desk moved it (any move out of resolved
 * clears the binding). Every one of those paths ALSO cancels the queued job (`cancelJobsFor`), so
 * the handler's check is the guarantee and the cancel is the fast path — the order the queue's
 * header (control/007) and the runner's contract (src/jobs/runner.js) both state.
 *
 * AT-LEAST-ONCE, PROVEN. D270's ratified condition: "the first handler proves at-least-once by
 * running twice before ticket.autoclose ships". test/admin-db.test.mjs P5 runs THIS handler twice
 * on one job — the second run finds the binding gone and closes nothing, writes nothing.
 *
 * THE INTERVAL is per tenant (`control.tenants.ticket_autoclose_hours`, control/009): 72 by default,
 * a PROPOSAL (plan v3 §7.6 — long enough to survive a weekend; no vendor default was established
 * from a primary source), 1–8760, and NULL is the kill switch: nothing enqueued, and a job already
 * on the queue is a no-op because the ticket's binding was never written or has been cleared.
 * The console changes it under `settings.write`; the CLI through the same function (D224).
 *
 * WHAT THE REQUESTER IS TOLD. Nothing is emailed (D86). The ticket row they poll carries
 * `autoCloseAt`, so their band can say "closes on its own <when> unless you say otherwise", and the
 * close itself is a public `state_change` entry the watch shows as an update (D288) — with the
 * author labelled so the endpoint can say it closed on its own and not that the desk did it.
 * The plan's open question 6 ("does an auto-closed ticket notify the requester?") is answered
 * with that entry: a short notice, the same channel as every other update, no new mechanism.
 *
 * ALL TICKET SQL LIVES IN src/tickets/ (D224): the guarded UPDATE is `closeByAutoclose()` in
 * query.js, beside the transitions it must agree with; this file holds the setting and the handler.
 */
import { withControl } from "../db/pool.js";
import { AUTOCLOSE_JOB, closeByAutoclose } from "./query.js";

export { AUTOCLOSE_JOB };

/** Plan v3 §7.6's proposal, and control/009's DEFAULT. Labelled a proposal wherever it is shown. */
export const DEFAULT_AUTOCLOSE_HOURS = 72;
/** control/009's CHECK: a year. "Never" without a magic value. */
export const MAX_AUTOCLOSE_HOURS = 8760;
/** The author every auto-close entry carries — the label is what lets the endpoint say "on its own". */
export const AUTOCLOSE_AUTHOR = Object.freeze({ kind: "system", label: "auto-close" });

/**
 * The tenant's interval in hours, or null when auto-close is OFF for the tenant.
 * @param {{ tenantId: string }} p
 * @returns {Promise<number|null>}
 */
export async function autocloseSetting({ tenantId }) {
  const { rows } = await withControl((c) => c.query(
    "SELECT ticket_autoclose_hours FROM control.tenants WHERE id = $1", [tenantId],
  ));
  return rows[0]?.ticket_autoclose_hours ?? null;
}

/**
 * Set the tenant's interval. `hours` null turns auto-close OFF (the kill switch); a number must be
 * a whole number of hours within control/009's range, or the change is refused with a sentence and
 * nothing is written. Tickets ALREADY resolved keep the instant they were given: the setting is
 * read when a ticket is resolved, not re-applied to the queue — a change of policy is not a
 * retroactive edit of promises already shown to requesters.
 *
 * @param {{ tenantId: string, hours: number|null }} p
 * @returns {Promise<{ ok: true, hours: number|null }|{ ok: false, refused: string }>}
 */
export async function setAutocloseHours({ tenantId, hours }) {
  if (hours !== null) {
    const n = Number(hours);
    if (!Number.isInteger(n) || n < 1 || n > MAX_AUTOCLOSE_HOURS) {
      return { ok: false, refused: `the auto-close interval is a whole number of hours from 1 to ${MAX_AUTOCLOSE_HOURS}, or off; ${JSON.stringify(hours)} is neither. Nothing was changed.` };
    }
    hours = n;
  }
  await withControl((c) => c.query(
    "UPDATE control.tenants SET ticket_autoclose_hours = $2 WHERE id = $1", [tenantId, hours],
  ));
  return { ok: true, hours };
}

/**
 * The `ticket.autoclose` handler, in the shape src/jobs/handlers.js registers: `(job, client)`,
 * `client` already inside `withTenant(job.tenantSchema)`. It never throws for "the world has moved
 * on" — that is the contract's success case — and it logs one line either way, naming the job and
 * the ticket by reference (never the resolution notes: the log is not the cross-tenant table, but
 * the habit is the same).
 *
 * @param {{ log?: (s: string) => void }} [deps]
 * @returns {(job: import("../db/jobs.js").Job, client: import("pg").PoolClient) => Promise<void>}
 */
export function createAutocloseHandler({ log = () => {} } = {}) {
  return async function autoclose(job, client) {
    if (!job.refId) throw new Error(`ticket.autoclose job ${job.id} carries no ticket reference; nothing to close`);
    const r = await closeByAutoclose(client, { ticketId: job.refId, jobId: job.id, author: AUTOCLOSE_AUTHOR });
    if (r.closed) {
      log(`[jobs] ticket.autoclose ${job.id}: ${r.reference} resolved -> closed (closed_by auto) - the requester neither confirmed nor reopened within the interval; a public state change is on the timeline`);
    } else {
      log(`[jobs] ticket.autoclose ${job.id}: nothing to do - ${r.why} (at-least-once: this is success, not failure)`);
    }
  };
}
