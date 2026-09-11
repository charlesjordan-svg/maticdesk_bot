// @ts-check
/**
 * WHAT THE VOICE GETS, when that differs from what the screen gets.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * D249 (2026-09-10, Charles): **"Speaking computer names could be tricky especially in a corp
 * environment. Ok to display computername but it should say this pc."**
 *
 * A corporate hostname is `FIN-LON-0442` or `SVR-HR-PAYROLL-02`. It carries a department, a site or
 * a function; it is read out in an open-plan office where other people can hear it; and it is
 * unpronounceable, so a synthesiser spells it or mangles it either way. On SCREEN it earns its
 * place — it is how a user knows the assistant means the machine in front of them, and it is on the
 * ticket, where IT needs it.
 *
 * **Nothing spoke it on the day this was written, and that was an accident rather than a
 * guarantee.** Three separate decisions happened to keep it out: `probeMachine()` does not carry
 * the hostname, `machineStateBlock()` excludes identity from the prompt on purpose (D53/G4), and
 * the catalog's consent text does not mention it. Meanwhile the DESIGN's own placeholder consent
 * card reads *"…restart the Print Spooler service on PLACEHOLDER-PC"* — which is exactly the
 * sentence this would arrive through — and a hub-authored answer is prose we do not write at all.
 * So the rule is enforced at the one funnel every spoken string passes through, rather than left
 * resting on three things staying true.
 *
 * This file is PURE and separate from `renderer.js` for one reason: `renderer.js` touches
 * `document` at module scope and no headless test can import it, so a rule that lives there can
 * only ever be checked by reading the source. The cases below — a hyphenated name, a name that is
 * also a substring, case, regex metacharacters, a name too short to be worth matching — are the
 * kind that are wrong in a way reading does not show.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/** Under this many characters is not a name; it is a word that happens to be a hostname. */
const MIN_NAME = 3;

/**
 * Replace this machine's own name with "this PC", for speech only.
 *
 * The boundaries are the characters a hostname may CONTAIN, not `\b`: a hyphen is a word boundary
 * to a regular expression, so `\bFIN-LON-0442\b` would happily match inside `OLD-FIN-LON-04421`.
 *
 * @param {string} text        what is on screen
 * @param {string|null|undefined} machineName  this machine's name, or nothing if it is not known
 * @returns {string} what to send to the voice
 */
export function spokenForm(text, machineName) {
  const name = String(machineName ?? "").trim();
  // A two-letter hostname would rewrite every "pc" and "it" in the sentence, which is worse than
  // the thing being fixed. Not knowing the name is the same case: say what is written.
  if (name.length < MIN_NAME) return String(text ?? "");
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(text ?? "").replace(
    new RegExp(`(?<![A-Za-z0-9-])${escaped}(?![A-Za-z0-9-])`, "gi"),
    "this PC",
  );
}
