/**
 * The job runner, WITHOUT a database (D270).
 *
 * Run: node test/jobs.test.mjs        (from server/; part of `npm test`)
 *
 * Two halves. §1 drives the loop with FAKE primitives — the same shape src/db/jobs.js exports,
 * injected — so the loop's own properties (drain, cap, overlap, outage-once, handler failure vs
 * database failure, start/stop, disabled) are proven on every run with no Postgres. §2 is the
 * source-level rules: the contract is written where a handler author reads it, the runner asserts
 * no tenant, the hub starts the runner after listen and cannot be stopped from starting by it,
 * and the migration adds exactly the status the cancel needs. The live behaviour — two real
 * runners racing a real row, the real reaper, the real CHECK — is test/db.test.mjs §6b.
 */
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { createJobRunner, pollIntervalFromEnv, DEFAULT_POLL_MS, MIN_POLL_MS, MAX_JOBS_PER_TICK, STUCK_AFTER_MS, MAX_ATTEMPTS } from "../src/jobs/runner.js";
import { JOB_HANDLERS } from "../src/jobs/handlers.js";
import { readMigrations } from "../src/db/migrate.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const jsCode = (js) => js.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
const sqlCode = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A fake queue: a list of jobs handed out in order by a fake runOne that mimics the real one's
 * contract — call the handler inside "a tenant", mark done, or mark failed and RE-THROW.
 */
function fakeQueue(jobs) {
  const q = [...jobs];
  const marks = [];
  const typesSeen = [];
  return {
    marks, typesSeen, left: q,
    reapStuck: async () => ({ requeued: [], failed: [] }),
    waitingOfOtherTypes: async (types) => {
      const other = q.filter((j) => !types.includes(j.type));
      return [...new Set(other.map((j) => j.type))].map((type) => ({ type, n: other.filter((j) => j.type === type).length }));
    },
    // Honours `types` the way the real claim() does: a job of another type is not handed out.
    runOne: async (workerId, handler, { types = null } = {}) => {
      typesSeen.push(types);
      const i = q.findIndex((j) => types === null || types.includes(j.type));
      if (i < 0) return null;
      const [job] = q.splice(i, 1);
      try { await handler(job, { fake: true }); marks.push(`${job.id}:done`); }
      catch (err) { marks.push(`${job.id}:failed:${err.message}`); throw err; }
      return job;
    },
  };
}
const job = (id, type = "t") => ({ id: String(id), type, tenantSchema: "t_fake", refId: null, attempts: 1 });

console.log("=== 1. the loop, with fake primitives ===");
{
  const ran = [];
  const q = fakeQueue([job(1), job(2), job(3)]);
  const r = createJobRunner({ handlers: { t: async (j) => { ran.push(j.id); } }, primitives: q, log: () => {} });
  const stats = await r.tick();
  check("one tick drains every due job, in order, and stops on null", ran.join(",") === "1,2,3" && stats.ran === 3 && stats.ticks === 1);
  check("each was marked done by the primitive (the runner never marks rows itself)", q.marks.join(",") === "1:done,2:done,3:done");
  check("every claim carried the registry's type list, so the database hands this process only what it can run", q.typesSeen.length === 4 && q.typesSeen.every((t) => Array.isArray(t) && t.join() === "t"), JSON.stringify(q.typesSeen));
}
{
  // An empty registry claims NOTHING - not "claims and fails". This is the hub as shipped today.
  let claims = 0;
  const said = [];
  const r = createJobRunner({ handlers: {}, log: (l) => said.push(l), primitives: {
    reapStuck: async () => ({ requeued: [], failed: [] }),
    waitingOfOtherTypes: async (types) => { check("…and asks what is waiting with an EMPTY type list", Array.isArray(types) && types.length === 0); return [{ type: "ticket.autoclose", n: 2 }]; },
    runOne: async () => { claims++; return null; },
  } });
  await r.tick(); await r.tick();
  check("with no handlers registered, runOne() is never called", claims === 0);
  check("…but what is waiting for a fuller hub is counted and said ONCE while it does not change", r.stats.waiting === 2 && said.filter((l) => /2 due job\(s\) of 1 type\(s\) this process has no handler for are waiting.*ticket\.autoclose \(2\)/.test(l)).length === 1, said.join(" | "));
  check("…and the line says nothing here fails them", said.some((l) => /nothing here fails them/.test(l)));
}
{
  // The waiting line is logged on CHANGE: up, down, and gone.
  const said = [];
  const picture = [[{ type: "x", n: 1 }], [{ type: "x", n: 1 }], [{ type: "x", n: 3 }], [], []];
  const r = createJobRunner({ handlers: {}, log: (l) => said.push(l), primitives: {
    reapStuck: async () => ({ requeued: [], failed: [] }),
    waitingOfOtherTypes: async () => picture.shift() ?? [],
    runOne: async () => null,
  } });
  for (let i = 0; i < 5; i++) await r.tick();
  check("five ticks, three pictures: logged three times - 1 waiting, 3 waiting, none any more", said.length === 3 && /x \(1\)/.test(said[0]) && /x \(3\)/.test(said[1]) && /no due jobs of other types are waiting any more/.test(said[2]), said.join(" | "));
  check("stats.waiting is the latest figure", r.stats.waiting === 0);
}
{
  const q = fakeQueue(Array.from({ length: MAX_JOBS_PER_TICK + 5 }, (_, i) => job(i + 1)));
  const r = createJobRunner({ handlers: { t: async () => {} }, primitives: q, log: () => {} });
  await r.tick();
  check(`a tick runs at most MAX_JOBS_PER_TICK (${MAX_JOBS_PER_TICK}) so a full queue cannot starve the interval`, r.stats.ran === MAX_JOBS_PER_TICK, String(r.stats.ran));
  await r.tick();
  check("the next tick takes the rest", r.stats.ran === MAX_JOBS_PER_TICK + 5);
}
{
  // Handler failure: the primitive has marked the row failed and re-thrown; the loop logs it with
  // the job id and CONTINUES to the next job. It must not mistake this for the database being down.
  const said = [];
  const q = fakeQueue([job(7, "explodes"), job(8, "unknown-type"), job(9, "t")]);
  const r = createJobRunner({
    handlers: { explodes: async () => { throw new Error("boom"); }, t: async () => {} },
    primitives: q, log: (l) => said.push(l),
  });
  await r.tick();
  check("a throwing handler is counted failed, logged with its job id, and the tick goes on to the next job", r.stats.failed === 1 && r.stats.ran === 1 && said.some((l) => /job 7 \(explodes\) failed: boom/.test(l)), said.join(" | "));
  check("a job whose type this process has no handler for is LEFT ON THE QUEUE, not claimed, not failed",
    q.left.length === 1 && q.left[0].id === "8" && !q.marks.some((m) => m.startsWith("8:")), q.marks.join(" | "));
  check("…and is reported as waiting, by type", r.stats.waiting === 1 && said.some((l) => /1 due job\(s\) of 1 type\(s\).*unknown-type \(1\)/.test(l)), said.join(" | "));
  check("the failure was not reported as an outage", r.stats.outages === 0 && !said.some((l) => /unreachable/.test(l)));
}
{
  // The dispatch guard: a primitive that IGNORES `types` and hands over a foreign job still cannot
  // get it marked done for free - the handler lookup throws, the primitive fails the row.
  const q = { marks: [], reapStuck: async () => ({ requeued: [], failed: [] }), waitingOfOtherTypes: async () => [] };
  let handed = false;
  q.runOne = async (w, handler) => {
    if (handed) return null; handed = true;
    const j = job(5, "foreign");
    try { await handler(j, {}); q.marks.push("done"); } catch (err) { q.marks.push(`failed:${err.message}`); throw err; }
    return j;
  };
  const r = createJobRunner({ handlers: { t: async () => {} }, primitives: q, log: () => {} });
  await r.tick();
  check("a foreign job that reaches dispatch anyway is failed with a message naming its type, never marked done", q.marks[0] === 'failed:no handler registered for job type "foreign" in this process' && r.stats.failed === 1, q.marks.join(" | "));
}
{
  // Database failure: the reap (or the claim) throws. tick() resolves, logs ONCE per outage, and
  // logs once more when the queue is back. The hub must keep running through all of it.
  const said = [];
  let downFor = 2;
  const r = createJobRunner({
    handlers: {}, log: (l) => said.push(l), pollMs: 1234,
    primitives: {
      reapStuck: async () => { if (downFor-- > 0) throw new Error("connect ECONNREFUSED 127.0.0.1:5433"); return { requeued: [], failed: [] }; },
      waitingOfOtherTypes: async () => [],
      runOne: async () => null,
    },
  });
  await r.tick(); await r.tick();
  check("two ticks with the database down: tick() resolves both times and says 'unreachable' ONCE, naming the interval", said.filter((l) => /unreachable/.test(l)).length === 1 && /every 1234 ms/.test(said[0]) && r.stats.ticks === 2 && r.stats.outages === 1, said.join(" | "));
  await r.tick();
  check("the first good tick after an outage says the queue is back, once", said.filter((l) => /reachable again/.test(l)).length === 1 && said.length === 2, said.join(" | "));
  await r.tick();
  check("and a healthy tick says nothing at all", said.length === 2);
}
{
  // Claim failure is an outage too (the reap succeeded, the claim could not reach the database),
  // and it is distinguished from a handler failure by whether the handler was ever reached.
  const said = [];
  const r = createJobRunner({ handlers: { t: async () => {} }, log: (l) => said.push(l), primitives: {
    reapStuck: async () => ({ requeued: [], failed: [] }),
    waitingOfOtherTypes: async () => [],
    runOne: async () => { throw new Error("Connection terminated unexpectedly"); },
  } });
  await r.tick();
  check("a claim that throws before any handler ran is an outage, not a failed job", r.stats.outages === 1 && r.stats.failed === 0 && said.some((l) => /unreachable \(Connection terminated/.test(l)), said.join(" | "));
}
{
  // Overlap: a tick that finds the previous one still in a handler returns without doing anything.
  let release;
  const gate = new Promise((r) => { release = r; });
  const q = fakeQueue([job(1), job(2)]);
  const r = createJobRunner({ handlers: { t: async () => { await gate; } }, primitives: q, log: () => {} });
  const first = r.tick();
  const second = await r.tick();
  check("a second tick during the first returns immediately and is not counted", second.ticks === 1 && r.stats.ran === 0);
  release();
  await first;
  check("the first tick then finishes the drain alone", r.stats.ran === 2 && r.stats.ticks === 1);
}
{
  // The reaper's results are logged, with ids, and counted.
  const said = [];
  const r = createJobRunner({ handlers: {}, log: (l) => said.push(l), maxAttempts: 3, primitives: {
    reapStuck: async ({ olderThanMs, maxAttempts }) => ({ requeued: olderThanMs === STUCK_AFTER_MS && maxAttempts === 3 ? ["41"] : [], failed: ["42"] }),
    waitingOfOtherTypes: async () => [],
    runOne: async () => null,
  } });
  await r.tick();
  check("the reaper is called with the configured timeout and cap, and what it moved is logged with ids", r.stats.reaped === 2 && said.some((l) => /reaper: 1 abandoned job\(s\) back to queued \(41\), 1 failed after 3 attempts \(42\)/.test(l)), said.join(" | "));
  check(`the defaults are ${STUCK_AFTER_MS} ms and ${MAX_ATTEMPTS} attempts`, STUCK_AFTER_MS === 600_000 && MAX_ATTEMPTS === 5);
}
{
  // start()/stop(): a real interval, small, and it must not hold the process open.
  const q = { reapStuck: async () => ({ requeued: [], failed: [] }), waitingOfOtherTypes: async () => [], runOne: async () => null };
  const r = createJobRunner({ handlers: {}, primitives: q, pollMs: 15, log: () => {} });
  check("not running before start()", r.running === false);
  check("start() returns true and ticks at once", r.start() === true && r.running === true);
  await sleep(120);
  const ticks = r.stats.ticks;
  check("the interval ticks (at least three in 120 ms at 15 ms)", ticks >= 3, String(ticks));
  check("a second start() is a no-op", r.start() === false);
  check("stop() returns true, and running is false", r.stop() === true && r.running === false);
  await sleep(60);
  check("no ticks after stop()", r.stats.ticks === ticks, `${r.stats.ticks} vs ${ticks}`);
  check("a second stop() is a no-op", r.stop() === false);
  const off = createJobRunner({ handlers: {}, primitives: q, pollMs: 0, log: () => {} });
  check("pollMs 0: start() refuses and nothing runs", off.start() === false && off.running === false && off.stats.ticks === 0);
}
{
  check("the default worker id names the host and the pid, so a locked_by is traceable", createJobRunner({ log: () => {} }).workerId === `${hostname()}:${process.pid}`);
  check("pollIntervalFromEnv: unset -> default", pollIntervalFromEnv({}) === DEFAULT_POLL_MS && DEFAULT_POLL_MS === 5000);
  check("…empty string -> default", pollIntervalFromEnv({ MATIC_JOBS_POLL_MS: "" }) === DEFAULT_POLL_MS);
  check("…'0' -> 0, meaning disabled", pollIntervalFromEnv({ MATIC_JOBS_POLL_MS: "0" }) === 0);
  check("…a positive value below the floor is raised to the floor, not honoured", pollIntervalFromEnv({ MATIC_JOBS_POLL_MS: "1" }) === MIN_POLL_MS && MIN_POLL_MS === 250);
  check("…a sane value is used as given", pollIntervalFromEnv({ MATIC_JOBS_POLL_MS: "30000" }) === 30000);
  check("…garbage and negatives fall back to the default rather than disabling the runner by accident", pollIntervalFromEnv({ MATIC_JOBS_POLL_MS: "soon" }) === DEFAULT_POLL_MS && pollIntervalFromEnv({ MATIC_JOBS_POLL_MS: "-5" }) === DEFAULT_POLL_MS);
}

console.log("\n=== 1b. the ticket.autoclose handler, headless, against a fake tenant client (D289; D270's contract) ===");
{
  const { createAutocloseHandler, AUTOCLOSE_AUTHOR } = await import("../src/tickets/autoclose.js");
  /** A fake pg client: scripted answers per statement shape; records every statement. */
  function fakeClient(script) {
    const seen = [];
    return {
      seen,
      async query(sql, params) {
        seen.push({ sql, params });
        // The lock-and-read the handler decides from (D290 made it the first statement: four
        // conditions cannot be checked in one UPDATE's WHERE when the fourth is on another table).
        if (/SELECT id, reference, state, resolved_at, auto_close_at, auto_close_job_id, auto_close_rearms/.test(sql)) return { rows: script.ticket ?? [] };
        // The delivery stamp on the CURRENT resolution entry — D290's fourth condition.
        if (/SELECT notified_at, read_by_requester_at/.test(sql)) return { rows: script.resolution ?? [] };
        if (/UPDATE tickets/.test(sql)) return { rows: script.update ?? [] };
        if (/INSERT INTO ticket_entries/.test(sql)) return { rows: [{ id: "entry-1", created_at: new Date() }] };
        throw new Error("unexpected statement: " + sql.slice(0, 60));
      },
    };
  }
  const ticketRow = (over = {}) => [{
    id: "22222222-2222-4222-8222-222222222222", reference: "MD-77", state: "resolved",
    resolved_at: new Date("2026-09-10T09:00:00Z"), auto_close_at: new Date("2026-09-11T09:00:00Z"),
    auto_close_job_id: "564", auto_close_rearms: 0, ...over,
  }];
  const SEEN = [{ notified_at: new Date("2026-09-10T09:30:00Z"), read_by_requester_at: new Date("2026-09-10T09:31:00Z") }];
  const NEVER_SEEN = [{ notified_at: null, read_by_requester_at: null }];
  const said = [];
  const handler = createAutocloseHandler({ log: (l) => said.push(l) });
  // A job id is control.job_queue's BIGSERIAL as a string (jobs.js returns String(rows[0].id)); the ticket id is the tenant's uuid.
  const theJob = { id: "564", type: "ticket.autoclose", tenantSchema: "t_fake", refId: "22222222-2222-4222-8222-222222222222", attempts: 1 };

  const bound = fakeClient({ ticket: ticketRow(), resolution: SEEN, update: [{ reference: "MD-77" }] });
  await handler(theJob, bound);
  const lock = bound.seen[0], del = bound.seen[1], upd = bound.seen[2];
  check("it LOCKS the ticket and reads the four things it decides from", /FOR UPDATE/.test(lock.sql) && lock.params[0] === theJob.refId);
  check("…then reads whether the CURRENT resolution was actually SHOWN to the requester (D290's fourth condition)", /kind = 'resolution' AND created_at >= \$2::timestamptz/.test(del.sql) && del.params[1] instanceof Date);
  check("the write is still guarded on state, THIS job's id and the due instant, in the WHERE (D280's rule)", /t\.state = 'resolved' AND t\.auto_close_job_id = \$2::bigint AND t\.auto_close_at <= now\(\)/.test(upd.sql) && upd.params[1] === theJob.id);
  check("…it closes as closed_by 'auto' and clears the binding in the same statement", /closed_by = 'auto'/.test(upd.sql) && /auto_close_at = NULL, auto_close_job_id = NULL/.test(upd.sql));
  const ins = bound.seen[3];
  check("…then writes ONE public state_change entry 'resolved → closed' by the auto-close author (system, labelled)", /INSERT INTO ticket_entries/.test(ins.sql) && ins.params[1] === "state_change" && ins.params[2] === "public" && ins.params[3] === "resolved → closed" && ins.params[4] === "system" && ins.params[7] === "auto-close" && AUTOCLOSE_AUTHOR.label === "auto-close");
  check("…and logs the close naming WHEN THE REQUESTER SAW IT, never the notes", said.length === 1 && /MD-77 resolved -> closed \(closed_by auto\)/.test(said[0]) && /was SHOWN the resolution 2026-09-10T09:31/.test(said[0]) && bound.seen.length === 4, said.join(" | "));

  // D290, THE FRIDAY/TUESDAY CASE, headless. The re-arm and the give-up both reach the queue, so
  // they are proven end to end in admin-db and in test/clickthrough-e2e.mjs (T8.5-T8.8); what is
  // provable here without a database is the thing that matters most: it does NOT close, and it
  // writes NOTHING, when the requester was never shown the resolution.
  said.length = 0;
  const unseen = fakeClient({ ticket: ticketRow(), resolution: NEVER_SEEN });
  await handler(theJob, unseen).catch(() => {});
  check("UNDELIVERED: the ticket is resolved, bound and due, and it is STILL not closed - no UPDATE to closed, no entry", !unseen.seen.some((x) => /closed_by = 'auto'/.test(x.sql)) && !unseen.seen.some((x) => /INSERT INTO ticket_entries/.test(x.sql)), unseen.seen.map((x) => x.sql.slice(0, 40)).join(" | "));
  check("…and it reads the delivery stamp before deciding, rather than closing and apologising later", /SELECT notified_at, read_by_requester_at/.test(unseen.seen[1]?.sql ?? ""));

  said.length = 0;
  const gone = fakeClient({ ticket: ticketRow({ state: "closed", auto_close_job_id: null, auto_close_at: null }) });
  await handler(theJob, gone);
  check("the world moved on (closed already): NO throw, no delivery read, no entry, one log line saying why and that this is success", gone.seen.length === 1 && !gone.seen.some((s) => /INSERT/.test(s.sql)) && /MD-77 is closed, not resolved/.test(said[0]) && /at-least-once: this is success/.test(said[0]), said.join(" | "));
  said.length = 0;
  const newer = fakeClient({ ticket: ticketRow({ auto_close_job_id: "565" }) });
  await handler(theJob, newer);
  check("resolve -> reopen -> resolve: the ticket is resolved by a NEWER resolution bound to another job, so this job does nothing and says so", /resolved by a NEWER resolution bound to job 565/.test(said[0]), said.join(" | "));
  said.length = 0;
  const unbound = fakeClient({ ticket: ticketRow({ auto_close_job_id: null, auto_close_at: null }) });
  await handler(theJob, unbound);
  check("resolved with no binding (interval off, or a move cleared it): nothing to do", /not bound to any job/.test(said[0]), said.join(" | "));
  said.length = 0;
  const early = fakeClient({ ticket: ticketRow({ auto_close_at: new Date("2099-01-01T00:00:00Z") }) });
  await handler(theJob, early);
  check("bound to this job but not yet due: nothing to do, and the line names the instant", /not due until 2099-01-01/.test(said[0]), said.join(" | "));
  check("a job with no reference THROWS (the runner records it failed) - there is nothing it could re-check", await handler({ ...theJob, refId: null }, fakeClient({})).then(() => false, (e) => /carries no ticket reference/.test(e.message)));
  const src = read("src/tickets/autoclose.js"), js = jsCode(src);
  check("autoclose.js holds NO SQL of its own (D224): the guarded UPDATE and the delivery read are closeByAutoclose()'s, in query.js", !/UPDATE tickets|INSERT INTO|SELECT .* FROM tickets/.test(js) && /closeByAutoclose\(client, \{/.test(js));
  check("…and it passes the job's OWN schema and the re-arm cap through, so the handler decides nothing the store does not know", /schema: job\.tenantSchema, ticketId: job\.refId, jobId: job\.id/.test(js) && /maxRearms: MAX_AUTOCLOSE_REARMS/.test(js) && /export const MAX_AUTOCLOSE_REARMS = 3;/.test(js));
  check("…its header records D270's proof, the kill switch, and D290's gate", /AT-LEAST-ONCE, PROVEN/.test(src) && /NULL is the kill switch/.test(src) && /D290/.test(src));
  check("…and the handler reports a re-arm and a give-up as their own outcomes, not as 'nothing to do'", /r\.gaveUp/.test(js) && /r\.rearmed/.test(js) && /GAVE UP/.test(js));
}

console.log("\n=== 2. the rules, in the source ===");
{
  const runnerSrc = read("src/jobs/runner.js"), runnerJs = jsCode(runnerSrc);
  const handlersSrc = read("src/jobs/handlers.js");
  const jobsSrc = read("src/db/jobs.js"), jobsJs = jsCode(jobsSrc);
  const indexSrc = read("src/index.js"), indexJs = jsCode(indexSrc);

  check("the runner's header states the contract in words: AT-LEAST-ONCE, and idempotency is the handler's job", /AT-LEAST-ONCE/.test(runnerSrc) && /IDEMPOTENCY IS THE HANDLER'S JOB/.test(runnerSrc));
  check("…and names the job it is written for and the trap: ticket.autoclose bound to the resolution, not the ticket", /ticket\.autoclose/.test(runnerSrc) && /resolve -> reopen -> resolve/.test(runnerSrc));
  check("the handler registry repeats the contract where a handler author will read it", /At-least-once, never exactly-once/.test(handlersSrc) && /RE-CHECKS ITS PRECONDITION/.test(handlersSrc));
  check("the registry holds exactly ONE handler, ticket.autoclose (P5, D289), and is frozen", Object.keys(JOB_HANDLERS).join(",") === "ticket.autoclose" && Object.isFrozen(JOB_HANDLERS) && typeof JOB_HANDLERS["ticket.autoclose"] === "function");
  check("…registered from src/tickets/autoclose.js by the constant the store enqueues under, so the two names cannot drift", /import \{ AUTOCLOSE_JOB, createAutocloseHandler \} from "\.\.\/tickets\/autoclose\.js"/.test(handlersSrc) && /\[AUTOCLOSE_JOB\]: createAutocloseHandler\(\{ log: console\.log \}\)/.test(handlersSrc) && /export const AUTOCLOSE_JOB = "ticket\.autoclose"/.test(read("src/tickets/query.js")));
  check("…and the registry's header no longer claims to be empty", !/EMPTY ON PURPOSE/.test(handlersSrc) && /ONE ENTRY SINCE P5/.test(handlersSrc));

  check("the runner asserts NO tenant of its own — withTenant() is the one door and it already asserts", !/withTenant|assertTenantSchema|control\.tenants|SCHEMA_SHAPE/.test(runnerJs));
  check("the runner reaches the queue only through src/db/jobs.js's primitives", /from "\.\.\/db\/jobs\.js"/.test(runnerJs) && !/\.query\(|getPool|from "pg"/.test(runnerJs));
  check("the runner hands claim() the registry's type list and skips the claim loop entirely when the list is empty", /runOne\(workerId, dispatch, \{ types \}\)/.test(runnerJs) && /types\.length > 0 && i < maxPerTick/.test(runnerJs));
  check("claim() filters by type only when asked, so B1's callers are unchanged", /\$\{types \? "AND type = ANY\(\$2::text\[\]\)" : ""\}/.test(jobsJs) && /types \? \[workerId, types\] : \[workerId\]/.test(jobsJs));
  check("jobs.js exports waitingOfOtherTypes, counting DUE queued rows of other types", /export async function waitingOfOtherTypes\(types\)/.test(jobsJs) && /status = 'queued' AND run_after <= now\(\) AND NOT \(type = ANY\(\$1::text\[\]\)\)/.test(jobsJs));
  check("the header says why an unknown type is left rather than failed (rolling restarts; a dev hub sharing a test database)", /rolling restart/.test(runnerSrc) && /test suite/.test(runnerSrc));
  check("no payload anywhere in the runtime (D196)", !/payload/i.test(runnerJs) && !/payload/i.test(jsCode(handlersSrc)));
  check("the runner never retries a handler that threw; retry is the reaper's, for abandoned rows only", /does not retry a handler that threw/.test(runnerSrc) && !/retry|attempt/i.test(runnerJs.replace(/maxAttempts|MAX_ATTEMPTS|attempts/g, "")));
  check("the interval timer is unref'd so it cannot keep a closed hub alive", /timer\.unref\(\)/.test(runnerJs));

  check("jobs.js exports cancelJobsFor and reapStuck", /export async function cancelJobsFor\(type, refId\)/.test(jobsJs) && /export async function reapStuck\(\{ olderThanMs, maxAttempts \}\)/.test(jobsJs));
  check("cancelJobsFor moves QUEUED rows only, by type and ref_id, and returns the ids", /status = 'cancelled'[\s\S]*?WHERE type = \$1 AND ref_id = \$2 AND status = 'queued'[\s\S]*?RETURNING id/.test(jobsJs));
  check("the reaper requeues below the cap and fails at it, keeps `attempts`, clears the lock and writes why", /CASE WHEN attempts >= \$2 THEN 'failed' ELSE 'queued' END/.test(jobsJs) && /locked_by\s*=\s*NULL/.test(jobsJs) && /reaped: still running after/.test(jobsJs) && !/attempts\s*=\s*attempts\s*\+\s*1[\s\S]*?WHERE status = 'running'/.test(jobsJs.slice(jobsJs.indexOf("reapStuck"))));
  check("the reaper's timeout is a parameter, so a test can reap at 0 ms and production at ten minutes", /make_interval\(secs => \$1::numeric \/ 1000\)/.test(jobsJs));

  check("src/index.js starts the runner INSIDE the listen callback, after the banners — a hub that is not listening polls nothing", indexJs.indexOf("runner.start()") > indexJs.indexOf("[hub] listening on") && indexJs.indexOf("runner.start()") > indexJs.indexOf("server.listen(port"));
  check("…from src/jobs/, not src/db/ (db-static §6: index.js imports nothing under src/db/)", /from "\.\/jobs\/runner\.js"/.test(indexJs) && /from "\.\/jobs\/handlers\.js"/.test(indexJs) && !/from "\.\/db\//.test(indexJs));
  check("…with the poll interval from the environment, and 0 announced as 'not polling'", /pollIntervalFromEnv\(\)/.test(indexJs) && /NOT polling control\.job_queue/.test(indexJs));
  check("…and the startup line says how many handlers there are and that an unknown type is left queued and reported, not run", /handler\(s\) registered/.test(indexJs) && /unknown type is left queued and reported, not run/.test(indexJs) && /claims NO jobs and only reports/.test(indexJs));
  check("MATIC_JOBS_POLL_MS is documented in index.js's configuration block", /MATIC_JOBS_POLL_MS\s+how often this process polls control\.job_queue/.test(indexSrc));
  check("nothing in the listen callback awaits the runner: a database outage cannot delay 'listening'", !/await runner|await tick|await createJobRunner/.test(indexJs));

  const m007 = readMigrations("control").find((m) => /job-queue-cancelled/.test(m.version));
  check("control/007-job-queue-cancelled.sql exists", Boolean(m007));
  const c007 = sqlCode(m007?.sql ?? "");
  check("it replaces the status CHECK by name, adding exactly 'cancelled' to the four B1 values", /DROP CONSTRAINT IF EXISTS job_status_known/.test(c007) && /ADD CONSTRAINT job_status_known/.test(c007) && /CHECK \(status IN \('queued', 'running', 'done', 'failed', 'cancelled'\)\)/.test(c007));
  check("it adds no column (the table stays references-only, D196)", !/ADD COLUMN/i.test(c007));
  check("it carries decision provenance with the status held when written (register §5.7b)", /DECISION PROVENANCE/.test(m007?.sql ?? "") && /D270 \(PROPOSED 2026-09-12\)/.test(m007?.sql ?? "") && /D196/.test(m007?.sql ?? ""));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
