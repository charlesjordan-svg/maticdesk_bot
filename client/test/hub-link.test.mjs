/**
 * HubLink - the endpoint's connectivity state machine. D233, 2026-09-10.
 *
 * Run: node test/hub-link.test.mjs        (from client/; part of `npm test`)
 *
 * No network and no clock: fetch and timers are injected, so every transition below is driven by
 * hand. What is pinned is D49 (three surfaced states), D51 (N failures to enter unreachable, ONE
 * success to leave, never a timer), D50's reason for a shape check (a captive portal's 200 is not a
 * hub), the bounded server-directed interval, and that a fleet's cadence is jittered rather than
 * lockstep.
 */
import { HubLink } from "../src/agent/hub-link.js";

let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}

/** A hand-cranked clock and timer queue. */
function fakeTime() {
  let now = 1_000_000;
  const timers = [];
  let seq = 0;
  return {
    now: () => now,
    setTimer: (fn, ms) => { const t = { id: ++seq, at: now + ms, fn, ms }; timers.push(t); return t.id; },
    clearTimer: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    pending: () => [...timers].sort((a, b) => a.at - b.at),
    /** Run the next due timer (advancing the clock to it) and let its promise chain settle. */
    async runNext() {
      const t = this.pending()[0];
      if (!t) return false;
      timers.splice(timers.indexOf(t), 1);
      now = t.at;
      t.fn();
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      return true;
    },
  };
}

const okBody = { ok: true, hub: "matic-desk-hub", phase: "test", auth: "none" };
const jsonRes = (status, body) => ({ status, json: async () => body });
const htmlRes = () => ({ status: 200, json: async () => { throw new Error("not json"); } });

/** A fetch that answers from a script of outcomes; "down" throws like a refused connection. */
function scriptedFetch(script) {
  const calls = [];
  return {
    calls,
    fetch: async (url) => {
      calls.push(url);
      const next = script.length ? script.shift() : script.default;
      if (next === "down") { const e = new Error("ECONNREFUSED"); e.name = "TypeError"; throw e; }
      if (next === "timeout") { const e = new Error("t/o"); e.name = "TimeoutError"; throw e; }
      if (next === "portal") return htmlRes();
      if (next === "ok") return jsonRes(200, okBody);
      if (next === "wrongshape") return jsonRes(200, { ok: true, service: "something-else" });
      if (next === "500") return jsonRes(500, { ok: false });
      if (typeof next === "object") return jsonRes(200, next);
      throw new Error(`script exhausted`);
    },
  };
}

function make(script, extra = {}) {
  const time = fakeTime();
  const f = scriptedFetch(script);
  const changes = [];
  const link = new HubLink({
    hubUrl: "http://127.0.0.1:8787/",
    fetchImpl: f.fetch,
    now: time.now, setTimer: time.setTimer, clearTimer: time.clearTimer,
    random: () => 0.5,
    onChange: (a, b) => changes.push(`${a}->${b}`),
    ...extra,
  });
  return { link, time, f, changes };
}

// ==============================================================================================
console.log("=== 1. standalone: no URL, no probes, ever ===");
{
  const link = new HubLink({ hubUrl: "", fetchImpl: async () => { throw new Error("must not be called"); } });
  check("state is standalone", link.state === "standalone");
  link.start();
  link.noteFailure("x");
  link.noteSuccess();
  check("start/noteFailure/noteSuccess are no-ops in standalone", link.state === "standalone" && link.status().nextProbeInMs === null);
  check("status says why", /no hub URL/.test(link.status().basis));
}

// ==============================================================================================
console.log("\n=== 2. startup: checking until the first probe answers ===");
{
  const { link, time, f, changes } = make(["ok"]);
  check("trailing slash is stripped from the URL", link.hubUrl === "http://127.0.0.1:8787");
  check("starts in checking", link.state === "checking");
  link.start();
  check("start schedules an immediate probe", time.pending().length === 1 && time.pending()[0].ms === 0);
  await time.runNext();
  check("one GET /v1/health", f.calls.length === 1 && f.calls[0] === "http://127.0.0.1:8787/v1/health");
  check("reachable after one good probe", link.state === "reachable");
  check("onChange fired checking->reachable exactly once", JSON.stringify(changes) === JSON.stringify(["checking->reachable"]));
  check("the hub's self-description is kept as its claim", link.status().hub?.phase === "test" && link.status().hub?.auth === "none");
  check("status is explicit that this is not an authenticated heartbeat", link.status().authenticated === false);
  const next = time.pending()[0];
  check("next probe is interval +- jitter (random 0.5 -> exactly the interval)", next && next.ms === 60_000, `got ${next?.ms}`);
}

// ==============================================================================================
console.log("\n=== 3. hysteresis (D51): three failures to enter unreachable, not two ===");
{
  const { link, time, changes } = make(["ok", "down", "down", "down", "down"]);
  link.start();
  await time.runNext();               // ok -> reachable
  await time.runNext();               // fail 1
  check("after 1 failure still reachable", link.state === "reachable" && link.consecutiveFailures === 1);
  check("a failure brings the next probe forward to the retry cadence (20 s, jittered)", Math.abs(time.pending()[0].ms - 20_000) <= 5_000, `got ${time.pending()[0].ms}`);
  await time.runNext();               // fail 2
  check("after 2 failures still reachable", link.state === "reachable" && link.consecutiveFailures === 2);
  await time.runNext();               // fail 3
  check("after 3 failures UNREACHABLE", link.state === "unreachable");
  check("exactly one transition recorded for the loss", changes.filter((c) => c.endsWith("->unreachable")).length === 1);
  check("lastError says what failed", /failed|ECONNREFUSED/.test(link.status().lastError));
  const backoff = time.pending()[0].ms;
  check("unreachable probes back off, bounded by the interval", backoff >= 5_000 && backoff <= 60_000, `got ${backoff}`);
  await time.runNext();               // fail 4
  check("still unreachable, no second transition", link.state === "unreachable" && changes.filter((c) => c.endsWith("->unreachable")).length === 1);
}

// ==============================================================================================
console.log("\n=== 4. a captive portal's 200 is NOT reachability (D50) ===");
{
  const { link, time } = make(["portal", "wrongshape", "500"]);
  link.start();
  await time.runNext();
  check("HTML at /v1/health counts as a failure", link.consecutiveFailures === 1 && /not the hub|captive/.test(link.lastError));
  await time.runNext();
  check("JSON with the wrong shape counts as a failure", link.consecutiveFailures === 2);
  await time.runNext();
  check("HTTP 500 from the probe counts as a failure", link.consecutiveFailures === 3 && link.state === "unreachable");
}

// ==============================================================================================
console.log("\n=== 5. leaving unreachable takes ONE success, and only a success ===");
{
  const { link, time, changes } = make(["down", "down", "down", "down", "ok"]);
  link.start();
  for (let i = 0; i < 4; i++) await time.runNext();
  check("unreachable after the failures", link.state === "unreachable");
  await time.runNext();               // ok
  check("reachable after one good probe", link.state === "reachable" && link.consecutiveFailures === 0);
  check("transition recorded", changes.at(-1) === "unreachable->reachable");
}

// ==============================================================================================
console.log("\n=== 6. real calls are evidence: HubClient reports through noteFailure / noteSuccess ===");
{
  const { link, time, f } = make(["ok", "down"]);
  link.start();
  await time.runNext();               // reachable
  const before = f.calls.length;
  link.noteFailure("POST /v1/turn did not connect");
  check("a real failure counts as one failure", link.consecutiveFailures === 1);
  check("...and brings a probe forward to NOW", time.pending()[0].ms === 0);
  await time.runNext();
  check("the immediate probe ran", f.calls.length === before + 1);
  link.noteFailure(); link.noteFailure();
  check("three real failures declare unreachable without waiting for a probe", link.state === "unreachable");
  link.noteSuccess();
  check("a real answered request restores reachable at once", link.state === "reachable" && link.consecutiveFailures === 0);
}

// ==============================================================================================
console.log("\n=== 7. server-directed cadence: honoured, bounded, only from a hub-shaped response ===");
{
  const { link, time } = make([{ ...okBody, heartbeat: { intervalMs: 120_000 } }]);
  link.start();
  await time.runNext();
  check("heartbeat.intervalMs from the hub is honoured", link.serverIntervalMs === 120_000 && time.pending()[0].ms === 120_000, `next ${time.pending()[0]?.ms}`);
}
{
  const { link, time } = make([{ ...okBody, heartbeat: { intervalMs: 1 } }]);
  link.start(); await time.runNext();
  check("an absurdly small directive is clamped to 5 s", link.serverIntervalMs === 5_000);
}
{
  const { link, time } = make([{ ...okBody, heartbeat: { intervalMs: 1e9 } }]);
  link.start(); await time.runNext();
  check("an absurdly large directive is clamped to 10 min", link.serverIntervalMs === 600_000);
}
{
  const { link, time } = make([{ ...okBody, heartbeat: { intervalMs: "soon" } }]);
  link.start(); await time.runNext();
  check("a non-numeric directive is ignored", link.serverIntervalMs === null);
}

// ==============================================================================================
console.log("\n=== 8. jitter: a fleet must not heartbeat in lockstep ===");
{
  const lo = make(["ok"], { random: () => 0 });
  lo.link.start(); await lo.time.runNext();
  const hi = make(["ok"], { random: () => 1 });
  hi.link.start(); await hi.time.runNext();
  check("reachable cadence spans interval - jitter .. interval + jitter", lo.time.pending()[0].ms === 45_000 && hi.time.pending()[0].ms === 75_000, `${lo.time.pending()[0].ms} / ${hi.time.pending()[0].ms}`);
}

// ==============================================================================================
console.log("\n=== 9. probes coalesce; stop() stops ===");
{
  const { link, time, f } = make({ default: "ok", length: 0, shift() {} });
  link.start();
  const a = link.probe(); const b = link.probe();
  await Promise.all([a, b]);
  check("two concurrent probe() calls make ONE request", f.calls.length === 1, `made ${f.calls.length}`);
  link.stop();
  check("stop clears the pending timer", time.pending().length === 0 && link.status().nextProbeInMs === null);
  await link.probe();
  check("a manual probe after stop does not reschedule", time.pending().length === 0);
}

// ==============================================================================================
console.log("\n=== 10. timeouts are failures, with a message that says so ===");
{
  const { link, time } = make(["timeout"]);
  link.start(); await time.runNext();
  check("a probe timeout is a failure naming the timeout", link.consecutiveFailures === 1 && /did not answer within/.test(link.lastError));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
