/**
 * Model prose → what the panel shows, and what the voice says.
 *
 * **THE HUB'S ANSWERS ARE WRITTEN BY A LANGUAGE MODEL, AND LANGUAGE MODELS EMIT MARKDOWN.** Found
 * in Electron on 2026-09-11 (register §5.37): a real knowledge-base answer rendered as
 *
 *     The keyboard shortcut to redo something in Windows is `Ctrl + Y`.
 *
 * with the backticks on screen, because the renderer sets model text with `textContent` — which is
 * correct and is not the bug. `innerHTML` is what D130 forbids and what the whole consent-surface
 * argument rests on, so the panel may never be handed markup to interpret.
 *
 * So this module does the only other thing available: it reads the markers and returns **data** —
 * a list of runs, each plain or code — which `renderer.js` turns into real DOM nodes with
 * `document.createElement`. No HTML is parsed, none is produced, and nothing here can inject
 * anything. The spoken form is the same runs with the markers simply gone.
 *
 * **THIS IS NOT A MARKDOWN RENDERER AND MUST NOT BECOME ONE.** It drops markup that would
 * otherwise be read aloud as punctuation; it does not lay out documents. Headings, tables, links
 * and lists are left exactly as the model wrote them, because a leading "- " reads as a dash and a
 * half-built layout engine in a renderer that may not use `innerHTML` is a worse thing to own than
 * a stray character.
 *
 * **H5 AND D234 ARE NOT IN TENSION WITH THIS.** Hub prose is the hub's and is not ours to rewrite.
 * A backtick is not prose — it is a formatting instruction to a renderer that cannot accept one.
 * Every word survives; only the markers do not. The hub is also asked for plain sentences in
 * `server/src/kb/answer.js`, which lowers how often this fires but cannot make it unnecessary: a
 * model is not a contract, and the panel has to be right on the turn the model ignores its prompt.
 *
 * Kept pure and separate, for the same reason as `spoken-form.js`: `renderer.js` touches `document`
 * at module scope, so no headless test can import it, and an untested string transform on the one
 * surface the user reads is not something this project ships.
 */

/**
 * TWO MARKERS, AND THE THIRD AND FOURTH ARE DELIBERATELY ABSENT.
 *
 * `CODE` matches a run of N backticks, content containing none, and a closing run of N — which is
 * markdown's own rule and is what makes ```x``` behave as one span rather than as two empty ones
 * with a word between them. `BOLD` matches paired double asterisks.
 *
 * **SINGLE `*` AND `_` ARE NOT TREATED AS EMPHASIS, AND THAT IS THE LOAD-BEARING DECISION HERE.**
 * This product's own vocabulary is full of underscores — `server_side_outage`,
 * `needs_human_judgement`, `queue=identity_team`, `restart_service(serviceName=spooler)` — and
 * D244/D128 put those raw values ON THE REVIEW CARD, the one screen where a user approves data
 * leaving the machine. A naive `_x_` rule turns `needs_human_judgement` into `needshumanjudgement`
 * on exactly that screen. **A stray `*word*` is a blemish; a mangled enum is a lie**, so the
 * asymmetry is the whole argument and this is not a place to be thorough.
 */
const CODE = /(`+)([^`]+?)\1(?!`)/g;
const BOLD = /\*\*([^*]+?)\*\*/g;

/** Markers dropped, every word kept. Used for the spoken string and inside each run. */
const strip = (s) => s.replace(BOLD, "$1");

/**
 * Split model prose into runs for the renderer to build nodes from.
 *
 * An UNPAIRED marker is left exactly as the model wrote it — a lone backtick is a character in a
 * sentence, and eating the rest of the line to find a partner that is not there would turn a
 * cosmetic blemish into a lost answer.
 *
 * @param {string} text
 * @returns {{ text: string, code: boolean }[]} at least one run; never an empty array
 */
export function proseSegments(text) {
  const s = String(text ?? "");
  const runs = [];
  let at = 0;
  // Insurance, and knowingly UNTESTABLE: an `exec` loop that runs to `null` resets `lastIndex`
  // itself, so removing this line changes nothing observable and a mutation probe correctly cannot
  // catch it (2026-09-11). It stays because the day this loop gains an early `break`, the second
  // call on the same string would start mid-way through it.
  CODE.lastIndex = 0;
  for (let m = CODE.exec(s); m; m = CODE.exec(s)) {
    if (m.index > at) runs.push({ text: strip(s.slice(at, m.index)), code: false });
    // Inside a code span the content is literal: emphasis markers there are part of what is being
    // quoted, and stripping them would corrupt the very thing mono exists to show exactly.
    runs.push({ text: m[2], code: true });
    at = m.index + m[0].length;
  }
  if (at < s.length) runs.push({ text: strip(s.slice(at)), code: false });
  return runs.length ? runs : [{ text: strip(s), code: false }];
}

/**
 * The same prose with every marker gone and nothing else changed — what the voice is given.
 *
 * Piper reads punctuation it does not recognise as noise or silence, so a backtick is either a
 * stumble or nothing; neither is what the sentence meant. This runs BEFORE `spokenForm()`, so the
 * D249 redaction sees the sentence a person would read rather than a marked-up one.
 *
 * @param {string} text
 * @returns {string}
 */
export function plainProse(text) {
  return proseSegments(text).map((r) => r.text).join("");
}
