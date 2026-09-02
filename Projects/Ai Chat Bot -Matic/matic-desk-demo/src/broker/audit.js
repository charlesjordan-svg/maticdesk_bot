// @ts-check
/**
 * Append-only audit log. Every execution attempt writes one record - capability, parameters,
 * consent token id, timestamp, outcome (§6). Successes AND failures; a broker that only logs
 * what worked is not an audit log.
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
  }

  /** @returns {Promise<string>} the audit record id */
  async record(entry) {
    const rec = { auditId: randomUUID(), at: new Date().toISOString(), ...entry };
    const line = JSON.stringify(rec);
    // Console is the fallback if the file write fails - losing the record silently would be
    // worse than a noisy demo (cut-order item 1).
    this.onLog(`[audit] ${line}`);
    try {
      await mkdir(dirname(this.path), { recursive: true });
      await appendFile(this.path, line + "\n", "utf8");
    } catch (err) {
      this.onLog(`[audit] FILE WRITE FAILED (record above is the only copy): ${err.message}`);
    }
    return rec.auditId;
  }
}
