// @ts-check
/**
 * The ticket watch (D288; P4, 2026-09-12): the endpoint's poll of its own tickets on the hub, and
 * the one place that decides "an update arrived".
 *
 * WHAT IT DOES, ON A TIMER
 *
 *   1. GET /v1/tickets - every ticket THIS enrollment filed, as the hub sees them (D284). No
 *      credential, no request: `HubClient` returns `no-credential` without touching the network.
 *   2. For each ticket whose `updatedAt` differs from what this machine last saw (or that it has
 *      never seen), GET /v1/tickets/:reference - the public timeline. THAT READ IS THE HAND-OFF:
 *      the hub stamps `notified_at` on every public entry it hands over (D287), so the console's
 *      "handed to the requester's app" is true exactly when this code has the entry in memory.
 *   3. Every public entry the DESK wrote (author not the requester) that the hub has not yet seen
 *      acknowledged (`readByRequesterAt` null) and this process has not yet announced is an
 *      UPDATE. They go to `onUpdate` once per process, grouped by ticket. The renderer shows them,
 *      then calls back `acknowledge(entryIds)`, which POSTs /v1/tickets/ack - the hub stamps
 *      `read_by_requester_at` with ITS clock, and the console's "seen by the requester" is true
 *      exactly when the entry was on this screen.
 *
 * THE HUB IS THE SOURCE OF "UNSEEN", NOT A LOCAL FILE. An earlier draft kept a seen-set on disk and
 * announced whatever was not in it; a fresh install, a cleared userData or a second OS user would
 * then re-announce the whole history, or announce nothing, depending on the file. The hub's
 * `readByRequesterAt` is authoritative and survives all three, and it is also the console's own
 * evidence - so what the requester was shown and what the desk is told they were shown cannot
 * drift. The snapshot file this class keeps (`tickets-seen.json`, beside profile.json) is for the
 * BAND and the spoken answer: state, last update, and whether something is unseen, per reference,
 * so the panel can say "the desk says it's fixed" the moment it opens rather than after the first
 * poll, and can still say what it last knew while the hub is unreachable (labelled as last known).
 *
 * WHAT IT NEVER DOES. It does not speak - nothing here reaches `say()`; Charles chose show-only
 * (2026-09-12). It does not write to a ticket on its own: comment/reopen/confirm are `HubClient`
 * methods this class does not call. It does not poll faster than POLL_FLOOR_MS whatever the config
 * says - a hub that serves a hundred endpoints is a hub asked a hundred times a second by a typo.
 * And it announces an entry at most once per process, even when the ack has not landed yet.
 *
 * Timers, clock and the client are injectable so test/ticket-watch.test.mjs drives the whole
 * machine without a network or a wait, the same way test/hub-link.test.mjs drives HubLink.
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";

/** Default cadence. HubLink probes health at 60 s; a ticket poll is not more urgent than that. */
export const POLL_DEFAULT_MS = 60_000;
/** The floor a config value cannot go under. */
export const POLL_FLOOR_MS = 30_000;
/** Beside profile.json and enrollment.json in per-user userData. */
export const SNAPSHOT_FILENAME = "tickets-seen.json";

/**
 * @typedef {object} TicketSnapshotRow
 * @property {string} reference
 * @property {string} state           the hub's state name; glossed by src/ticket/state-words.js
 * @property {string|null} updatedAt  the hub's updated_at, used to decide whether to re-read the timeline
 * @property {string|null} lastUpdateAt   when the DESK last wrote a public entry (null: it has not)
 * @property {string|null} lastUpdateKind comment | resolution | state_change
 * @property {number} unseen          desk entries the hub has not seen acknowledged
 * @property {string|null} resolutionNotes
 */

/**
 * @typedef {object} TicketSnapshot
 * @property {"never"|"ok"|"no-credential"|"no-hub"|"unreachable"|"refused"} basis  what the last poll established
 * @property {string|null} checkedAt   when the last SUCCESSFUL poll finished
 * @property {string|null} attemptedAt when the last poll of any outcome finished
 * @property {string|null} detail      the transport/refusal detail of the last failure, for the developer log
 * @property {Record<string, TicketSnapshotRow>} tickets  by reference
 */

export class TicketWatch {
  /**
   * @param {{
   *   client: { listTickets: () => Promise<any>, ticket: (ref: string) => Promise<any>, ack: (ids: string[]) => Promise<any> },
   *   dir?: string|null,
   *   intervalMs?: number,
   *   onUpdate?: (u: { reference: string, state: string, ticket: object, entries: object[] }) => void,
   *   onLog?: (s: string) => void,
   *   now?: () => number,
   *   setTimer?: (fn: () => void, ms: number) => any,
   *   clearTimer?: (t: any) => void,
   * }} deps
   */
  constructor({
    client,
    dir = null,
    intervalMs = POLL_DEFAULT_MS,
    onUpdate = () => {},
    onLog = () => {},
    now = () => Date.now(),
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (t) => clearTimeout(t),
  }) {
    this.client = client;
    this.path = dir ? join(dir, SNAPSHOT_FILENAME) : null;
    const asked = Number(intervalMs);
    // The floor is a policy, not a clamp to be silent about: the log says when it applied.
    this.intervalMs = Number.isFinite(asked) && asked > 0 ? Math.max(POLL_FLOOR_MS, asked) : POLL_DEFAULT_MS;
    if (Number.isFinite(asked) && asked > 0 && asked < POLL_FLOOR_MS) onLog(`[tickets] ticketPollMs ${asked} is under the ${POLL_FLOOR_MS} ms floor - polling every ${this.intervalMs} ms instead`);
    this.onUpdate = onUpdate;
    this.onLog = onLog;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;

    /** @type {TicketSnapshot} */
    this.snapshot = this.#load();
    /** Entry ids announced this process, so an update is shown once even before its ack lands. */
    this.announced = new Set();
    this.polls = 0;
    this._timer = null;
    this._polling = null;
    this._running = false;
  }

  /** Begin polling. Idempotent. The first poll runs at once. */
  start() {
    if (this._running) return;
    this._running = true;
    this.#schedule(0);
  }

  stop() {
    this._running = false;
    if (this._timer) this.clearTimer(this._timer);
    this._timer = null;
  }

  /** Whether the last poll could see the hub's ticket table at all - the truthful `canQueryHub`. */
  get canQuery() { return this.snapshot.basis === "ok"; }

  /**
   * One poll, now. Returns the snapshot. Concurrent calls share one poll: a band refresh and the
   * timer landing together must not make two request storms.
   */
  poll() {
    if (this._polling) return this._polling;
    this._polling = this.#pollOnce().finally(() => { this._polling = null; });
    return this._polling;
  }

  /**
   * The renderer showed these entries. POST /v1/tickets/ack, and mark them seen in the snapshot
   * so the band stops saying "new" without waiting for the next poll.
   * @param {string[]} entryIds
   */
  async acknowledge(entryIds) {
    const ids = Array.isArray(entryIds) ? entryIds.filter((x) => typeof x === "string" && x) : [];
    if (!ids.length) return { ok: true, acknowledged: 0 };
    const r = await this.client.ack(ids);
    if (r?.ok) {
      for (const row of Object.values(this.snapshot.tickets)) {
        const mine = (row._unseenIds ?? []).filter((id) => !ids.includes(id));
        row.unseen = mine.length;
        row._unseenIds = mine;
      }
      this.#save();
      this.onLog(`[tickets] acknowledged ${r.acknowledged ?? ids.length} shown entr${ids.length === 1 ? "y" : "ies"} to the hub (D287)`);
    } else {
      this.onLog(`[tickets] ack of ${ids.length} entr${ids.length === 1 ? "y" : "ies"} did not land (${r?.reason ?? "?"}): ${r?.detail ?? ""} - the hub still shows them as handed, not seen; the next poll will offer them again`);
    }
    return r;
  }

  /** The band's read: the snapshot without the private id lists. */
  status() {
    /** @type {Record<string, object>} */
    const tickets = {};
    for (const [ref, row] of Object.entries(this.snapshot.tickets)) {
      const { _unseenIds, ...pub } = /** @type {any} */ (row);
      tickets[ref] = pub;
    }
    return { basis: this.snapshot.basis, checkedAt: this.snapshot.checkedAt, attemptedAt: this.snapshot.attemptedAt, detail: this.snapshot.detail, intervalMs: this.intervalMs, tickets };
  }

  // ---- internals ------------------------------------------------------------------------------

  #schedule(ms) {
    if (!this._running) return;
    if (this._timer) this.clearTimer(this._timer);
    // The callback RETURNS the poll promise: setTimeout ignores it, and a test that injects timers
    // can await it - which is how test/ticket-watch.test.mjs fires a tick and then reads the result.
    this._timer = this.setTimer(() => this.poll().finally(() => this.#schedule(this.intervalMs)), ms);
    if (typeof this._timer?.unref === "function") this._timer.unref();
  }

  async #pollOnce() {
    this.polls++;
    const at = new Date(this.now()).toISOString();
    const list = await this.client.listTickets();
    this.snapshot.attemptedAt = at;
    if (!list?.ok) {
      const basis = /** @type {TicketSnapshot["basis"]} */ (list?.reason ?? "unreachable");
      const changed = this.snapshot.basis !== basis;
      this.snapshot.basis = basis;
      this.snapshot.detail = list?.detail ?? null;
      if (changed) this.onLog(`[tickets] cannot read this enrollment's tickets (${basis}): ${list?.detail ?? ""}${this.snapshot.checkedAt ? ` - the band shows what was last known at ${this.snapshot.checkedAt}` : ""}`);
      this.#save();
      return this.snapshot;
    }

    /** @type {Record<string, TicketSnapshotRow>} */
    const next = {};
    const updates = [];
    for (const t of list.tickets ?? []) {
      if (!t?.reference) continue;
      const prev = this.snapshot.tickets[t.reference];
      const updatedAt = t.updatedAt ? new Date(t.updatedAt).toISOString() : null;
      const needsTimeline = !prev || prev.updatedAt !== updatedAt || (prev.unseen ?? 0) > 0;
      /** @type {any} */
      const row = {
        reference: t.reference,
        state: t.state,
        updatedAt,
        lastUpdateAt: prev?.lastUpdateAt ?? null,
        lastUpdateKind: prev?.lastUpdateKind ?? null,
        unseen: prev?.unseen ?? 0,
        resolutionNotes: t.resolutionNotes ?? null,
        _unseenIds: prev?._unseenIds ?? [],
      };
      if (needsTimeline) {
        const detail = await this.client.ticket(t.reference);
        if (detail?.ok) {
          const fromDesk = (detail.entries ?? []).filter((e) => e.visibility !== "internal" && e.authorKind !== "requester");
          const last = fromDesk.at(-1);
          row.lastUpdateAt = last ? new Date(last.createdAt).toISOString() : null;
          row.lastUpdateKind = last?.kind ?? null;
          const unseen = fromDesk.filter((e) => !e.readByRequesterAt);
          row.unseen = unseen.length;
          row._unseenIds = unseen.map((e) => e.id);
          const fresh = unseen.filter((e) => !this.announced.has(e.id));
          if (fresh.length) {
            for (const e of fresh) this.announced.add(e.id);
            updates.push({ reference: t.reference, state: t.state, ticket: detail.ticket ?? t, entries: fresh });
          }
        } else {
          this.onLog(`[tickets] ${t.reference}: the timeline could not be read (${detail?.reason ?? "?"}): ${detail?.detail ?? ""}`);
        }
      }
      next[t.reference] = row;
    }
    this.snapshot.tickets = next;
    this.snapshot.basis = "ok";
    this.snapshot.checkedAt = at;
    this.snapshot.detail = null;
    this.#save();
    for (const u of updates) {
      this.onLog(`[tickets] ${u.reference}: ${u.entries.length} unseen entr${u.entries.length === 1 ? "y" : "ies"} from the desk (${u.entries.map((e) => e.kind).join(", ")}) - shown, not spoken (D288)`);
      try { this.onUpdate(u); } catch (err) { this.onLog(`[tickets] onUpdate threw: ${err.message}`); }
    }
    return this.snapshot;
  }

  /** @returns {TicketSnapshot} */
  #load() {
    const empty = /** @type {TicketSnapshot} */ ({ basis: "never", checkedAt: null, attemptedAt: null, detail: null, tickets: {} });
    if (!this.path) return empty;
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf8"));
      if (!raw || typeof raw !== "object" || typeof raw.tickets !== "object") return empty;
      return { basis: "never", checkedAt: raw.checkedAt ?? null, attemptedAt: null, detail: null, tickets: raw.tickets ?? {} };
    } catch {
      return empty;
    }
  }

  #save() {
    if (!this.path) return;
    try {
      mkdirSync(join(this.path, ".."), { recursive: true });
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, JSON.stringify({ checkedAt: this.snapshot.checkedAt, tickets: this.snapshot.tickets }, null, 2));
      renameSync(tmp, this.path);
    } catch (err) {
      this.onLog(`[tickets] could not save ${this.path}: ${err.message} - the band will rebuild from the hub on the next poll`);
    }
  }
}
