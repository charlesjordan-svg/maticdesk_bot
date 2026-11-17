// @ts-check
/**
 * "How is this machine doing?" - the machine band, as a sentence. (D308, the founder's, 2026-11-17.)
 *
 * Charles, after his first live session with the persona, looking at the band: *"enable her
 * ability to ... speak on the info from the 'what I can see about this machine' tab."* Until then
 * the band was shown and never narrated (D245), and a question about it went to the model.
 *
 * WHAT THIS IS BUILT FROM, and it is the whole of the safety argument: the rows
 * `machineBandGroups()` already decided - the same labels, the same words, the same marks the band
 * draws. Nothing here reads a probe, compares a number or holds a threshold, so the sentence and
 * the band cannot describe one machine two ways (D257/D258: the code that owns a threshold decides
 * the mark; this file is handed the verdict).
 *
 * FOUR THINGS IT WILL NOT DO, each an existing rule:
 *   - Name this computer, the signed-in account, this machine's address or the router (D249: shown,
 *     never said). Those rows are left out HERE, by group and by label, and `say()`'s own redaction
 *     is the second guard.
 *   - Give advice. "Memory: almost full" is a fact; "you should restart" is the restart moment's to
 *     raise, on its own rules (D256: a mark is not advice).
 *   - Read a figure the band does not show. It has only the rows.
 *   - Claim anything is FINE that the band did not look at. It says what it can see looks normal.
 */

/** Rows that are shown and never said (D249), by label - the band's own strings. */
const NOT_SPOKEN = new Set(["This computer", "Signed in as", "This machine's address", "Router", "Network adapter"]);
const WHO = "Who and where";
const STORAGE = "Storage";

const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const list = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/**
 * @param {Array<{ group: string, rows: Array<{ label: string, value: string, state?: string }> }> | null | undefined} groups
 * @returns {string}
 */
export function machineSummaryReply(groups) {
  const rows = (groups ?? [])
    .filter((g) => g.group !== WHO)
    .flatMap((g) => g.rows.filter((r) => !NOT_SPOKEN.has(r.label)).map((r) => ({ ...r, group: g.group })));
  if (rows.length === 0) return "I can't read anything about this machine right now, so I can't tell you how it's doing.";

  const stands = rows.filter((r) => r.state === "attn" || r.state === "watch");
  const unread = rows.filter((r) => r.state === "unread");
  const plain = rows.filter((r) => !r.state);
  const out = [];

  if (stands.length) {
    out.push(`${stands.length === 1 ? "One thing stands out" : `${stands.length === 2 ? "Two" : "A few"} things stand out`}: ${list(stands.map((r) => `${lowerFirst(r.label)} — ${lowerFirst(r.value)}`))}.`);
  }
  if (unread.length) out.push(`I couldn't read ${list(unread.map((r) => lowerFirst(r.label)))}.`);

  // The unmarked rows, said briefly. Drives are collapsed to one clause when none is marked: five
  // healthy drives are one fact, not five sentences.
  const drives = plain.filter((r) => r.group === STORAGE);
  const others = plain.filter((r) => r.group !== STORAGE);
  const normal = others.map((r) => `${lowerFirst(r.label)} — ${lowerFirst(r.value)}`);
  if (drives.length) normal.push(drives.length === 1 ? "the drive has room" : `${rows.some((r) => r.group === STORAGE && r.state) ? "the other" : "all"} ${drives.length} drives have room`);
  if (normal.length) out.push(`${stands.length || unread.length ? "The rest of what I can see looks normal" : "Nothing stands out. What I can see looks normal"}: ${list(normal)}.`);

  out.push("It's all on the screen, under what I can see about this machine.");
  return out.join(" ");
}
