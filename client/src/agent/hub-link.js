// @ts-check
/**
 * HubLink — the endpoint's view of whether the hub is there. D49's three connectivity states,
 * D51's hysteresis, D114's "no persistent connection". Added 2026-09-10 (D233).
 *
 * ==============================================================================================
 * THE RECONNECT QUESTION, ANSWERED THE WAY THE REGISTER ALREADY POINTS
 * ==============================================================================================
 *
 * "How does an agent reconnect to a hub that went away — could the hub signal its previously
 * attached agents?" It cannot, and it does not need to. Endpoints sit behind corporate NAT, VPNs
 * and host firewalls; nothing accepts an inbound connection on them, and D114 rules out a
 * persistent connection in v1 for the reasons it lists (ALB idle timeouts, per-task connection
 * ceilings, reconnect storms). So the hub holds NO list of attached agents to signal — every
 * endpoint comes to the hub on its own cadence, and a hub that restarts is rediscovered by every
 * endpoint within one heartbeat interval, with nothing to replay and nobody to notify.
 *
 * The hub's "signal" is the HEARTBEAT RESPONSE. This client honours `heartbeat.intervalMs` if the
 * hub sends one (bounded, see below), which is the hook for a server-directed cadence — back off the
 * fleet during an incident, tighten it when an alert is pending — without a second channel. The hub
 * does not send that field today; the client is forward-compatible with it and the server half is
 * recorded as the next slice in D233.
 *
 * ==============================================================================================
 * WHAT COUNTS AS EVIDENCE
 * ==============================================================================================
 *
 *   - A probe: GET /v1/health, with a SHAPE CHECK on the body (`ok: true`, `hub: "matic-desk-hub"`).
 *     A captive portal answers 200 to anything (D50), and an HTML login page is not a hub. The
 *     shape check catches that case; it does NOT make this an authenticated heartbeat. D50 asks for
 *     one, and it needs device identity (D60/D61), which is not built (D231). Until it is, this is
 *     an IDENTIFIED reachability check, not an authenticated one, and the status says so.
 *   - A real call: HubClient reports every transport failure (`noteFailure`) and every answered
 *     request (`noteSuccess`, whatever the HTTP status - 5xx means the hub answered). A turn that
 *     failed to reach the hub triggers an immediate probe, so the state follows the evidence rather
 *     than the clock.
 *
 * ==============================================================================================
 * STATES AND TRANSITIONS (D49, D51)
 * ==============================================================================================
 *
 *   standalone    no hub URL configured. Never probes. Terminal for this process.
 *   checking      startup, before the first probe has answered.
 *   reachable     the last probe or real call succeeded.
 *   unreachable   `failuresBeforeUnreachable` consecutive failures (default 3). Left ONLY on a
 *                 success - never on a timer, never on a partial signal (D51).
 *
 * Cadence: reachable -> one probe per `intervalMs` +- `jitterMs` (D132's proposed 60 s +- 15 s).
 * After a failure -> retry in `retryMs` (20 s), so three failures declare unreachable in about a
 * minute rather than D132's "about three minutes": faster to tell the user, still long enough that
 * a VPN blip does not flip the state. Unreachable -> exponential backoff with full jitter from
 * `backoffBaseMs` up to `intervalMs`, so a fleet of endpoints does not hit a recovering hub in
 * lockstep and recovery is still noticed within about one interval. Every value here is a
 * PROPOSED parameter (D132 table, D115: the interval is a capacity parameter, not a UX one).
 *
 * Timers and fetch are injectable so test/hub-link.test.mjs drives the whole machine without a clock.
 */

export const HUB_HEALTH_SHAPE = { hub: "matic-desk-hub" };

/** Bounds on a server-directed interval. Below 5 s is a hub asking to be hammered; above 10 min is a hub asking to be forgotten. */
const SERVER_INTERVAL_MIN_MS = 5_000;
const SERVER_INTERVAL_MAX_MS = 600_000;

export class HubLink {
  /**
   * @param {{
   *   hubUrl?: string,
   *   fetchImpl?: typeof fetch,
   *   intervalMs?: number, jitterMs?: number, retryMs?: number, backoffBaseMs?: number,
   *   probeTimeoutMs?: number, failuresBeforeUnreachable?: number,
   *   onChange?: (prev: string, next: string, status: object) => void,
   *   onLog?: (s: string) => void,
   *   now?: () => number, random?: () => number,
   *   setTimer?: (fn: () => void, ms: number) => any, clearTimer?: (t: any) => void,
   * }} [deps]
   */
  constructor({
    hubUrl = "",
    fetchImpl,
    intervalMs = 60_000,
    jitterMs = 15_000,
    retryMs = 20_000,
    backoffBaseMs = 5_000,
    probeTimeoutMs = 5_000,
    failuresBeforeUnreachable = 3,
    onChange = () => {},
    onLog = () => {},
    now = () => Date.now(),
    random = Math.random,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (t) => clearTimeout(t),
  } = {}) {
    this.hubUrl = String(hubUrl ?? "").replace(/\/+$/, "");
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.intervalMs = intervalMs;
    this.jitterMs = jitterMs;
    this.retryMs = retryMs;
    this.backoffBaseMs = backoffBaseMs;
    this.probeTimeoutMs = probeTimeoutMs;
    this.failuresBeforeUnreachable = failuresBeforeUnreachable;
    this.onChange = onChange;
    this.onLog = onLog;
    this.now = now;
    this.random = random;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;

    /** @type {"standalone"|"checking"|"reachable"|"unreachable"} */
    this.state = this.hubUrl ? "checking" : "standalone";
    this.consecutiveFailures = 0;
    this.lastOkAt = null;
    this.lastFailAt = null;
    this.lastError = null;
    /** What the hub last said about itself, kept as the hub's claim. */
    this.hubInfo = null;
    /** A server-directed interval, if the hub ever sends one. */
    this.serverIntervalMs = null;
    this.probes = 0;
    this._timer = null;
    this._probing = null;
    this._running = false;
    this._nextDueAt = null;
  }

  /** Begin probing. Idempotent. A standalone link starts nothing. */
  start() {
    if (this._running || this.state === "standalone") return;
    this._running = true;
    this._schedule(0);
  }

  stop() {
    this._running = false;
    if (this._timer) this.clearTimer(this._timer);
    this._timer = null;
    this._nextDueAt = null;
  }

  /** The one object every surface reads. */
  status() {
    return {
      state: this.state,
      hubUrl: this.hubUrl || null,
      // Named so that nobody upgrades it in prose: this is reachability of a hub that identifies
      // itself by shape, not a device-authenticated heartbeat (D50 needs D61).
      authenticated: false,
      basis: this.hubUrl ? "GET /v1/health, shape-checked; plus every real call's outcome" : "no hub URL configured",
      consecutiveFailures: this.consecutiveFailures,
      failuresBeforeUnreachable: this.failuresBeforeUnreachable,
      lastOkAt: this.lastOkAt,
      lastFailAt: this.lastFailAt,
      lastError: this.lastError,
      nextProbeInMs: this._nextDueAt === null ? null : Math.max(0, this._nextDueAt - this.now()),
      serverIntervalMs: this.serverIntervalMs,
      hub: this.hubInfo,
    };
  }

  /**
   * HubClient reports a transport failure on a REAL request. Counts as a failure and brings the
   * next probe forward to now - the evidence has arrived, so the clock should not be waited on.
   * @param {string} [why]
   */
  noteFailure(why = "a request did not reach the hub") {
    if (this.state === "standalone") return;
    this._recordFailure(why);
    if (this._running) this._schedule(0);
  }

  /** HubClient reports that the hub ANSWERED a real request (any HTTP status). That is reachability. */
  noteSuccess() {
    if (this.state === "standalone") return;
    this._recordSuccess(null);
  }

  /**
   * One probe, now. Resolves to the outcome; also updates the state machine. Safe to call while
   * a scheduled probe is pending - the two are coalesced.
   * @returns {Promise<{ ok: boolean, why?: string, hub?: object }>}
   */
  async probe() {
    if (this.state === "standalone") return { ok: false, why: "standalone: no hub URL" };
    if (this._probing) return this._probing;
    this._probing = this.#probeOnce().finally(() => { this._probing = null; });
    return this._probing;
  }

  async #probeOnce() {
    this.probes++;
    let outcome;
    try {
      const res = await this.fetch(`${this.hubUrl}/v1/health`, {
        method: "GET",
        signal: AbortSignal.timeout(this.probeTimeoutMs),
      });
      const body = await res.json().catch(() => null);
      if (res.status !== 200) {
        outcome = { ok: false, why: `GET /v1/health returned HTTP ${res.status}` };
      } else if (!body || body.ok !== true || body.hub !== HUB_HEALTH_SHAPE.hub) {
        // A 200 that is not shaped like the hub. Captive portals do this; so does anything else
        // squatting on the port. Not a hub, so not reachable (D50's reason for not trusting a TCP
        // connect or a bare 200).
        outcome = { ok: false, why: "GET /v1/health answered 200 but the body is not the hub's (captive portal or another service on the port?)" };
      } else {
        outcome = { ok: true, hub: body };
      }
    } catch (err) {
      const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
      outcome = { ok: false, why: timedOut ? `GET /v1/health did not answer within ${this.probeTimeoutMs} ms` : `GET /v1/health failed: ${err?.message ?? err}` };
    }

    if (outcome.ok) this._recordSuccess(outcome.hub);
    else this._recordFailure(outcome.why);

    if (this._running) this._schedule(this.#nextDelayMs());
    return outcome;
  }

  _recordSuccess(hub) {
    const prev = this.state;
    this.lastOkAt = this.now();
    this.consecutiveFailures = 0;
    this.lastError = null;
    if (hub) {
      this.hubInfo = {
        phase: hub.phase ?? null,
        auth: hub.auth ?? null,
        tenancy: hub.tenancy ?? null,
        provider: hub.provider ?? null,
        tickets: hub.tickets ?? null,
      };
      // Server-directed cadence, if the hub ever sends one. Bounded, and only ever read from a
      // response whose shape passed - a captive portal does not get to set our clock.
      const wanted = Number(hub.heartbeat?.intervalMs);
      this.serverIntervalMs = Number.isFinite(wanted)
        ? Math.min(SERVER_INTERVAL_MAX_MS, Math.max(SERVER_INTERVAL_MIN_MS, wanted))
        : null;
    }
    this.state = "reachable";
    if (prev !== "reachable") this.#changed(prev);
  }

  _recordFailure(why) {
    const prev = this.state;
    this.lastFailAt = this.now();
    this.lastError = why;
    this.consecutiveFailures++;
    // Hysteresis (D51): N consecutive failures to enter; a single success to leave. A link that
    // is already unreachable stays so; one that is reachable or checking waits for N.
    if (prev !== "unreachable" && this.consecutiveFailures >= this.failuresBeforeUnreachable) {
      this.state = "unreachable";
      this.#changed(prev);
    } else if (prev === "reachable") {
      this.onLog(`[hub-link] probe failed (${this.consecutiveFailures}/${this.failuresBeforeUnreachable}): ${why}`);
    }
  }

  #changed(prev) {
    this.onLog(`[hub-link] ${prev} -> ${this.state}${this.lastError ? ` (${this.lastError})` : ""}`);
    this.onChange(prev, this.state, this.status());
  }

  /** The base interval: the hub's directive if it sent one, else ours. */
  #baseIntervalMs() {
    return this.serverIntervalMs ?? this.intervalMs;
  }

  #nextDelayMs() {
    const base = this.#baseIntervalMs();
    if (this.state === "reachable" && this.consecutiveFailures === 0) {
      // +- jitter (D106/D132): a fleet must not heartbeat in lockstep.
      const jitter = (this.random() * 2 - 1) * Math.min(this.jitterMs, base / 2);
      return Math.max(1_000, Math.round(base + jitter));
    }
    if (this.state === "unreachable") {
      // Full-jitter exponential backoff, capped at the interval: quick to notice a recovery that
      // happens soon, gentle on a hub that is down for an hour. Exponent counts failures SINCE the
      // state was entered.
      const since = Math.max(0, this.consecutiveFailures - this.failuresBeforeUnreachable);
      const cap = Math.min(base, this.backoffBaseMs * 2 ** since);
      return Math.max(1_000, Math.round(this.backoffBaseMs + this.random() * Math.max(0, cap - this.backoffBaseMs)));
    }
    // checking, or reachable with a failure just counted: retry soon, so N failures are counted in
    // about a minute rather than N intervals.
    return Math.max(1_000, Math.round(this.retryMs * (0.75 + this.random() * 0.5)));
  }

  _schedule(ms) {
    if (!this._running) return;
    if (this._timer) this.clearTimer(this._timer);
    this._nextDueAt = this.now() + ms;
    this._timer = this.setTimer(() => {
      this._timer = null;
      this._nextDueAt = null;
      void this.probe();
    }, ms);
  }
}
