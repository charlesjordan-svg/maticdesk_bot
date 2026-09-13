// @ts-check
/**
 * The main process's own preferences (D294, 2026-09-13): a small JSON file in Electron's per-user
 * `userData`, beside `profile.json`, `enrollment.json` and `tickets-seen.json`.
 *
 * NOT `src/profile/profile.js`. That file is D215's self-asserted IDENTITY — who is reporting a
 * ticket — and a machine preference in it would be the same category error as the ticket store
 * growing a query against `control.devices`. This file holds what the app should DO on this
 * account: start with Windows or not, and whether the first-close notice has been shown.
 *
 * Two values, both booleans, both with a reason:
 *
 *   openAtLogin            Start with Windows. DEFAULT ON — Charles's decision, 2026-09-13, made
 *                          against the recommendation in the analysis (register §5.61 records it as
 *                          his, with the date, so a security review gets a decision rather than an
 *                          engineering default). `null` when it has never been stored, which is how
 *                          `resolveAutostart` tells a fresh profile from a choice.
 *   firstCloseNoticeShown  D296. Once true, the notice is never shown again on this profile.
 *
 * THE OS WINS A DISAGREEMENT — see `resolveAutostart` below. This store is the app's memory of
 * what it last set; the registry is what will actually happen at logon, and a user can change the
 * registry without us (Task Manager > Startup). An app that silently re-adds itself to startup on
 * every launch is one a customer's security team will find, and they will be right.
 *
 * `dir` is injected rather than imported from `electron`, like every other store here, so the
 * module is testable headless. main.js passes `app.getPath("userData")`.
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";

export const SETTINGS_FILENAME = "settings.json";

/** What a fresh profile gets. `openAtLogin: true` is the founder's default (D294). */
export const SETTINGS_DEFAULTS = Object.freeze({ openAtLogin: true, firstCloseNoticeShown: false });

const KEYS = /** @type {const} */ (["openAtLogin", "firstCloseNoticeShown"]);

/** A JSON value read as a boolean, or null when it is not one. Strings are not booleans here. */
const bool = (v) => (v === true || v === false ? v : null);

export class SettingsStore {
  /** @param {{ dir: string, onLog?: (s: string) => void }} deps  `dir` is Electron's userData path */
  constructor({ dir, onLog = () => {} }) {
    this.path = join(dir, SETTINGS_FILENAME);
    this.onLog = onLog;
  }

  /**
   * The stored values. A key that was never written (or a missing or unreadable file) reads as
   * `null`, NOT as its default: the caller decides what a fresh profile means, and for autostart
   * that decision involves the OS (`resolveAutostart`).
   * @returns {{ openAtLogin: boolean|null, firstCloseNoticeShown: boolean|null }}
   */
  read() {
    const empty = { openAtLogin: null, firstCloseNoticeShown: null };
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf8"));
      if (!raw || typeof raw !== "object") return empty;
      const out = { ...empty };
      for (const k of KEYS) out[k] = bool(raw[k]);
      return out;
    } catch (err) {
      if (err.code !== "ENOENT") this.onLog(`[settings] ${this.path} could not be read (${err.message}); treating it as empty`);
      return empty;
    }
  }

  /**
   * Merge and persist KNOWN keys only, booleans only. Written to a temp file and renamed, like the
   * ticket snapshot, so a crash mid-write cannot leave half a file.
   * @param {Partial<Record<typeof KEYS[number], boolean>>} patch
   */
  write(patch) {
    const merged = { ...this.read() };
    for (const k of KEYS) if (patch && bool(patch[k]) !== null) merged[k] = bool(patch[k]);
    /** @type {Record<string, boolean>} */
    const onDisk = {};
    for (const k of KEYS) if (merged[k] !== null) onDisk[k] = /** @type {boolean} */ (merged[k]);
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, JSON.stringify(onDisk, null, 2) + "\n", "utf8");
      renameSync(tmp, this.path);
    } catch (err) {
      this.onLog(`[settings] could not save ${this.path}: ${err.message}`);
    }
    return merged;
  }
}

/**
 * Start with Windows: what the setting IS, given what we stored and what the OS says (D295).
 *
 * The trap this exists for: the store says `true`, the OS says the login item is absent or
 * disabled. That is not drift to be corrected — **the user turned it off in Task Manager's Startup
 * tab**, which is a decision. The OS's answer is adopted and stored; nothing is re-registered.
 * The same rule in the other direction: stored `false`, OS says enabled — someone turned it on
 * there, and we believe them.
 *
 * `os` is the OS read reduced to two booleans by main.js: `registered` (a Run entry for this
 * executable with our arguments exists) and `enabled` (Task Manager shows it enabled). `null`
 * means the OS could not be read — then nothing is touched, and the store's word stands.
 *
 * @param {{ stored: boolean|null, os: { registered: boolean, enabled: boolean } | null }} input
 * @returns {{ openAtLogin: boolean, apply: boolean, store: boolean, why: string }}
 *   `apply` = call setLoginItemSettings; `store` = write the resolved value to settings.
 */
export function resolveAutostart({ stored, os }) {
  const active = os ? os.registered === true && os.enabled === true : null;
  if (os === null) {
    // Cannot see the registry: do not touch it, and do not claim more than the store knows.
    const openAtLogin = stored === null ? SETTINGS_DEFAULTS.openAtLogin : stored;
    return { openAtLogin, apply: false, store: stored === null, why: "the OS login-item state could not be read; nothing was changed" };
  }
  if (stored === null) {
    // A fresh profile. If the OS already has a decision on record (a leftover entry, enabled or
    // disabled by the user), that decision wins over our default; otherwise the default applies
    // and is registered.
    if (os.registered) return { openAtLogin: active === true, apply: false, store: true, why: active ? "fresh profile; the OS already starts it at logon" : "fresh profile; the OS has it registered but DISABLED (Task Manager) - that is the user's decision" };
    return { openAtLogin: SETTINGS_DEFAULTS.openAtLogin, apply: true, store: true, why: "fresh profile; the founder's default (ON, D294) applies and is registered" };
  }
  if (stored === active) return { openAtLogin: stored, apply: false, store: false, why: "the store and the OS agree" };
  // They disagree. The OS wins: it is what will happen at logon, and a person changed it there.
  return { openAtLogin: active === true, apply: false, store: true, why: active ? "the OS says enabled and the store said off - someone turned it on in Windows; adopted" : "the store said on and the OS says absent or disabled - the user turned it off in Task Manager; adopted, NOT re-registered" };
}
