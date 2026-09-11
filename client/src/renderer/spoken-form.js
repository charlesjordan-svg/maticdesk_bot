// @ts-check
/**
 * WHAT THE VOICE GETS, when that differs from what the screen gets.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * D249 (2026-09-10, Charles): **"Speaking computer names could be tricky especially in a corp
 * environment. Ok to display computername but it should say this pc."** Then, the same day:
 * **"do the username too"**, and **"fix 2 and 3 as well"** — the address, and the crash note.
 *
 * THREE IDENTIFIERS OF THIS ENVIRONMENT, and one argument covering all of them. A corporate
 * hostname is `FIN-LON-0442`; a corporate account is `j.okonkwo` or `CORP\a.petrova`; an address is
 * `10.14.203.88`. Each carries a department, a site, a person or a subnet. Each is read out in an
 * open-plan office where other people can hear it. And each is **bad audio** — a synthesiser spells
 * a hostname, mangles a dotted username and reads an address as "ten dot fourteen dot two hundred
 * and three dot eighty-eight", which nobody wants said at them.
 *
 * On SCREEN all three earn their place: the machine name is how a user knows the assistant means
 * the machine in front of them, the account is a fact the ticket carries (D215 labels it
 * self-asserted), and the address is the evidence a network fix worked. **None of them is said.**
 *
 * **Nothing spoke the name or the account when this was written, and that was an accident rather
 * than a guarantee** — `probeMachine()` carries neither, `machineStateBlock()` excludes identity
 * from the prompt on purpose (D53/G4), and the catalog's consent text mentions neither. Meanwhile
 * the DESIGN's own placeholder consent card reads *"…restart the Print Spooler service on
 * PLACEHOLDER-PC"*, which is exactly the sentence it would arrive through. **The address was a
 * different case: it WAS spoken**, by `renew_dhcp`'s success line.
 *
 * This file is PURE and separate from `renderer.js` for one reason: `renderer.js` touches
 * `document` at module scope and no headless test can import it, so a rule that lives there can
 * only ever be checked by reading the source. The cases in `test/spoken-form.test.mjs` — a
 * hyphenated name, a name that is a substring of another, a domain-qualified account, an address
 * that is a prefix of another, case, regex metacharacters, a name too short to be worth matching —
 * are the kind that are wrong in a way reading does not show.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/** Under this many characters is not a name; it is a word that happens to be one. */
const MIN_NAME = 3;

/**
 * What each identifier is SAID as. The machine's wording is Charles's own.
 *
 * "your account" rather than "you": it has to survive dropping into a sentence written by someone
 * else — a hub answer, a reworded catalog line — and a noun phrase does that where a pronoun does
 * not. *"your account is signed in"* reads; *"you is signed in"* does not. It is also accurate by
 * construction, because the only account this replaces is the one running the app.
 *
 * "an address" keeps the fact that survives being said aloud. *"This machine now has 10.0.0.42"*
 * becomes *"this machine now has an address"* — and **having one is the whole evidence** that
 * renewing the lease worked. The digits are what a listener cannot use and a synthesiser cannot
 * read; they stay on screen, where they can be copied.
 */
const SAID_AS = { machine: "this PC", user: "your account", address: "an address" };

/**
 * One NAME's pattern, with the corporate forms folded in.
 *
 * THE BOUNDARIES ARE THE POINT, and each clause is a case that is wrong in a way reading is not:
 *
 *   - `(?<![A-Za-z0-9-])` / `(?![A-Za-z0-9-])` — the characters a name may CONTAIN, not `\b`. A
 *     hyphen IS a word boundary to a regular expression, so `\bFIN-LON-0442\b` matches happily
 *     inside `OLD-FIN-LON-0442`, and a different machine would be renamed.
 *   - `(?:[A-Za-z0-9.-]+[\\/])?` — an optional `CORP\` or `FIN-LON-0442\` qualifier, consumed as
 *     part of the match. Without it, `CORP\a.petrova` becomes `CORP\your account`: the account is
 *     redacted and the domain is read out instead, which is the worse half surviving.
 *   - `(?:@[A-Za-z0-9.-]+)?` — the same for a UPN, `a.petrova@corp.example`.
 *
 * A trailing `.` is deliberately NOT a boundary character, because sentences end.
 */
function patternForName(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9-])(?:[A-Za-z0-9.-]+[\\\\/])?${escaped}(?:@[A-Za-z0-9.-]+)?(?![A-Za-z0-9-])`, "gi");
}

/**
 * ONE OF THIS MACHINE'S OWN ADDRESSES — and only those.
 *
 * **This is deliberately not a pattern for "anything shaped like an address", and that distinction
 * is the whole safety of it.** A knowledge-base answer may legitimately tell someone to try
 * `8.8.8.8`, or name a print server, or quote a subnet from company guidance; redacting those would
 * destroy the answer rather than protect anyone. What is replaced is the small set of literal values
 * the probe reported for THIS machine — its own address and its gateway — which are the only ones
 * that identify the environment the user is sitting in.
 *
 * The boundary is its own problem: `.` cannot be excluded on the right, because sentences end with
 * one, so `10.0.0.4` would otherwise match inside `10.0.0.42`. `(?!\.?[0-9])` says "not followed by
 * a digit, and not followed by a dot-then-digit", which lets a full stop through and nothing else.
 */
function patternForAddress(addr) {
  const escaped = addr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![0-9.])${escaped}(?!\\.?[0-9])`, "g");
}

/** `identify()` returns this when there is no passwd entry. A placeholder, not a name. */
const NOT_A_NAME = new Set(["unknown", "none", "-", "?"]);

/**
 * Replace this environment's own identifiers with what they are SAID as.
 *
 * **The user is replaced before the machine, and that is load-bearing.** Its optional qualifier
 * clause absorbs a `FIN-LON-0442\` prefix, so `FIN-LON-0442\a.petrova` becomes "your account" in one
 * step. Machine first would leave `this PC\a.petrova` and then `this PC\your account` — true, and a
 * worse sentence than either name would have been.
 *
 * @param {string} text  what is on screen
 * @param {{ machine?: string|null, user?: string|null, addresses?: (string|null|undefined)[] }} [env]
 *   as the probe reported them
 * @returns {string} what to send to the voice
 */
export function spokenForm(text, env = {}) {
  let out = String(text ?? "");

  for (const key of /** @type {const} */ (["user", "machine"])) {
    const name = String(env?.[key] ?? "").trim();
    // A two-letter name would rewrite every "pc" or "it" in the sentence, which is worse than the
    // thing being fixed. Not knowing it is the same case: say what is written. And redacting
    // "unknown" would turn an honest placeholder into a claim about the user.
    if (name.length < MIN_NAME || NOT_A_NAME.has(name.toLowerCase())) continue;
    out = out.replace(patternForName(name), SAID_AS[key]);
  }

  // Longest first: a gateway of `10.0.0.1` and an address of `10.0.0.10` can prefix one another,
  // and the boundary above stops a partial match either way — but doing the longer one first means
  // the shorter never has to rely on it.
  const addresses = (env?.addresses ?? [])
    .map((a) => String(a ?? "").trim())
    .filter((a) => /^[0-9a-fA-F.:]{7,45}$/.test(a) && a !== "0.0.0.0")
    .sort((a, b) => b.length - a.length);
  for (const addr of addresses) out = out.replace(patternForAddress(addr), SAID_AS.address);

  return out;
}
