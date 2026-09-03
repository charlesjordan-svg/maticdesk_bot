// @ts-check
/**
 * Append-only audit log. Every privileged decision writes one record - capability, parameters,
 * consent token id (null when the decision was made before one existed), timestamp, outcome (§6).
 * Successes AND failures AND refusals; a broker that only logs what worked is not an audit log,
 * and one that logs only what it attempted is a one-sided trail.
 *
 * Two entry points, because the two callers differ in shape, not in what they write:
 *   record()     - async, awaited by execute(), which is already async.
 *   recordSync() - returns the audit id immediately and queues the write, for validate(), which
 *                  is synchronous by contract (broker.d.ts) and must stay that way.
 * Both serialise onto the same chain, so records land in the order they were made. Anything that
 * needs the file to be current - a test, a shutdown - awaits flush().
 *
 * TODO(phase1): in the real system this is written by the privileged service to a location the
 * user cannot modify, and shipped to the hub. A file next to the app is a demo-only choice.
 */
import { appendFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

export class AuditLog {
  constructor(path, { onLog = () => {} } = {}) {
    this.path = path;
    this.onLog = onLog;
    /** Tail of the write chain. Every queued write links onto this; flush() awaits it. */
    this.pending = Promise.resolve();
  }

  /** Stamp the record and emit it to the log sink. Synchronous, so the id exists before any I/O. */
  #stamp(entry) {
    const rec = { auditId: randomUUID(), at: new Date().toISOString(), ...entry };
    // Console is the fallback if the file write fails - losing the record silently would be
    // worse than a noisy demo (cut-order item 1).
    this.onLog(`[audit] ${JSON.stringify(rec)}`);
    return rec;
  }

  #queue(rec) {
    this.pending = this.pending.then(async () => {
      try {
        await mkdir(dirname(this.path), { recursive: true });
        await appendFile(this.path, JSON.stringify(rec) + "\n", "utf8");
      } catch (err) {
        this.onLog(`[audit] FILE WRITE FAILED (record above is the only copy): ${err.message}`);
      }
    });
    return this.pending;
  }

  /** @returns {Promise<string>} the audit record id */
  async record(entry) {
    const rec = this.#stamp(entry);
    await this.#queue(rec);
    return rec.auditId;
  }

  /**
   * Write a record from a synchronous caller. The id is returned immediately; the file write is
   * queued. A caller that must see it on disk awaits flush().
   * @returns {string} the audit record id
   */
  recordSync(entry) {
    const rec = this.#stamp(entry);
    this.#queue(rec);
    return rec.auditId;
  }

  /** Resolves once every record queued so far is on disk (or has reported its write failure). */
  async flush() {
    await this.pending;
  }
}
