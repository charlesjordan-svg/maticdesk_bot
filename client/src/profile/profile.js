// @ts-check
/**
 * The local user profile (D215, 2026-09-04).
 *
 * ===============================================================================================
 * WHY A LOCAL FILE AND NOT A DIRECTORY
 * ===============================================================================================
 *
 * A ticket needs to say who is reporting and how to reach them. D54 introduced a user identity
 * entity distinct from device identity for exactly this, and B1's `users` table is already shaped
 * for a directory (D55, D145 SCIM). **That directory does not exist**, and neither does device
 * enrollment (B3, 6-8 engineer-weeks) or the pipe that would carry a broker-attested logon SID
 * (D200/D201, designed and not built).
 *
 * So today the honest source is: the OS for the username, and the person for everything the OS
 * cannot know — their name as they want it written, where they sit, and how IT should reach them.
 * That is what this file holds. The hub keeps the full list (`users`, upserted per ticket);
 * this keeps one person's copy on their own machine.
 *
 * ===============================================================================================
 * SELF-ASSERTED, AND NOTHING PRETENDS OTHERWISE
 * ===============================================================================================
 *
 * A user can type any name into this file. That is not a flaw to be fixed by validation — it is
 * what "no authentication" means, and validation would only disguise it. Every surface that
 * carries a profile field says `self_asserted`: the hub column, the CLI's `show`, and the draft
 * the user approves before anything is sent.
 *
 * `osUsername` is NOT stored here and is never read from here. It is read live from the OS at the
 * moment a ticket is built, because a username copied into a JSON file is a username that can
 * disagree with the account actually running the software — and the one thing this field is for is
 * saying which account that was.
 *
 * ===============================================================================================
 * WHERE IT LIVES
 * ===============================================================================================
 *
 * Electron's `userData`, which is per-OS-user by construction (`%APPDATA%/<app>` on Windows). Two
 * people sharing a machine get two profiles without this module knowing anything about it, which
 * is the property that makes "kept locally for each user" true rather than aspirational.
 *
 * The directory is injected rather than imported from `electron`, so this module is testable
 * headless and has no Electron dependency. main.js passes `app.getPath("userData")`.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import os from "node:os";

/**
 * The fields a person supplies. ORDER MATTERS — the intake asks in this order, and it is the order
 * a person expects to be asked.
 *
 * `required` is what the ENDPOINT will not file without. The hub deliberately accepts a partial
 * profile (see server/src/tickets/file.js): refusing there would make the hub an authority on what
 * a customer's profile must contain, which is a decision no one has taken.
 */
export const PROFILE_FIELDS = [
  { key: "firstName", label: "first name", question: "What is your first name?", required: true },
  { key: "lastName", label: "last name", question: "And your last name?", required: true },
  {
    key: "location",
    label: "location",
    question: "Where are you based? A building, floor or office is enough — it tells IT where to come.",
    required: true,
  },
  {
    key: "contactId",
    label: "contact ID",
    // Deliberately not "email". The hub stores this as free text because "contact id" is whatever
    // an organisation reaches people by, and deciding it is an email address here would be
    // deciding a customer's directory shape from the endpoint.
    question: "How should IT reach you? A work email, phone extension or employee number — whatever your team uses.",
    required: true,
  },
];

export const PROFILE_FILENAME = "profile.json";

/** Trimmed string, or null. Empty and whitespace-only both become null. */
export function clean(v) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * The OS account actually running this process. Read live, never stored — see the header.
 *
 * Falls back to "unknown" rather than throwing, the same way Agent.identify() does: a machine with
 * no passwd entry should still be able to file a ticket, and "unknown" is a true statement about
 * what we could read.
 */
export function osUsername() {
  try { return os.userInfo().username || "unknown"; } catch { return "unknown"; }
}

export class ProfileStore {
  /**
   * @param {{ dir: string, onLog?: (s: string) => void }} deps  `dir` is Electron's userData path
   */
  constructor({ dir, onLog = () => {} }) {
    this.path = join(dir, PROFILE_FILENAME);
    this.onLog = onLog;
  }

  /**
   * The stored profile, or an empty one.
   *
   * A missing file is the NORMAL first run, not an error. A corrupt file is also not fatal: it is
   * logged and treated as empty, so a bad edit costs the user a re-ask rather than a working
   * assistant. Neither case throws — nothing about filing a ticket should be able to break a turn
   * that was going to work.
   *
   * @returns {{ firstName: string|null, lastName: string|null, location: string|null, contactId: string|null }}
   */
  read() {
    const empty = { firstName: null, lastName: null, location: null, contactId: null };
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf8"));
      const out = { ...empty };
      for (const f of PROFILE_FIELDS) out[f.key] = clean(raw?.[f.key]);
      return out;
    } catch (err) {
      if (err.code !== "ENOENT") this.onLog(`[profile] ${this.path} could not be read (${err.message}); treating it as empty`);
      return empty;
    }
  }

  /**
   * Merge and persist. Only known fields are written, so a hand-edited file cannot smuggle extra
   * keys into a ticket by being read back verbatim.
   *
   * @param {object} patch
   */
  write(patch) {
    const merged = { ...this.read() };
    for (const f of PROFILE_FIELDS) {
      if (patch?.[f.key] !== undefined) merged[f.key] = clean(patch[f.key]);
    }
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify(merged, null, 2) + "\n", "utf8");
      this.onLog(`[profile] saved ${this.path}`);
    } catch (err) {
      // Not fatal. A profile that cannot be saved still files THIS ticket; the user is asked again
      // next time, which is annoying and correct, rather than the ticket failing over a disk error.
      this.onLog(`[profile] could not save ${this.path}: ${err.message}. This ticket is unaffected; you may be asked again next time.`);
    }
  }

  /** Which required fields are still missing, in ask order. Empty means nothing to ask. */
  missing() {
    const p = this.read();
    return PROFILE_FIELDS.filter((f) => f.required && !p[f.key]);
  }

  /** The reporter block for POST /v1/ticket. `osUsername` is read live, not stored. */
  reporter() {
    return { ...this.read(), osUsername: osUsername() };
  }
}
