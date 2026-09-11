/**
 * `src/renderer/model-prose.js` — the markers the hub's model writes, and what the panel does with
 * them (D255, register §5.38).
 *
 * The defect this exists for was found in Electron, not here: a real answer rendered as
 * "…is `Ctrl + Y`." with the backticks on screen. Importable and tested for the same reason
 * `spoken-form.js` is — `renderer.js` touches `document` at module scope, so nothing in it can be
 * imported by a headless test, and an untested string transform on the surface the user reads is
 * not something this project ships.
 */
import { proseSegments, plainProse } from "../src/renderer/model-prose.js";

let passed = 0;
let failed = 0;
const check = (what, ok, detail) => {
  if (ok) { passed++; console.log(`  PASS  ${what}`); }
  else { failed++; console.log(`  FAIL  ${what}${detail === undefined ? "" : ` - ${detail}`}`); }
};
const shown = (t) => proseSegments(t).map((r) => (r.code ? `«${r.text}»` : r.text)).join("");

console.log("\n=== 1. the observed defect ===");
const REAL = "The keyboard shortcut to redo something in Windows is `Ctrl + Y`. Some applications also accept `Ctrl + Shift + Z`.";
check("the backticks are gone from what a person reads", !plainProse(REAL).includes("`"), plainProse(REAL));
check("…and every word survives, in order",
  plainProse(REAL) === "The keyboard shortcut to redo something in Windows is Ctrl + Y. Some applications also accept Ctrl + Shift + Z.",
  plainProse(REAL));
check("…and the two shortcuts come back as code runs, for the mono treatment",
  proseSegments(REAL).filter((r) => r.code).map((r) => r.text).join("|") === "Ctrl + Y|Ctrl + Shift + Z");
check("…with the prose between them kept as prose",
  proseSegments(REAL).filter((r) => !r.code).length === 3);

console.log("\n=== 2. what must NOT be touched — this product's own vocabulary ===");
// D244/D128 put these raw values ON THE REVIEW CARD, the one screen where a user approves data
// leaving the machine. A naive `_x_` emphasis rule eats the underscores and the enum becomes a
// word that is not in any enum. A stray `*word*` is a blemish; this would be a lie.
const VOCAB = [
  "needs_human_judgement",
  "server_side_outage",
  "queue=identity_team",
  "restart_service(serviceName=spooler)",
  "Set _the_ value and read it back",
  "the file is called report_final_v2.txt",
];
for (const v of VOCAB) {
  check(`untouched: ${v}`, plainProse(v) === v, plainProse(v));
  check("…and it is one plain run, with nothing marked as code",
    proseSegments(v).length === 1 && proseSegments(v)[0].code === false);
}
// The same restraint for a lone asterisk, which is arithmetic and a wildcard as often as emphasis.
check("a single-asterisk span is left alone too", plainProse("multiply 2 * 3 and *maybe* stop") === "multiply 2 * 3 and *maybe* stop");

console.log("\n=== 3. bold, which is unambiguous and so IS dropped ===");
check("paired double asterisks lose the markers and keep the words",
  plainProse("this is **really** important") === "this is really important");
check("…more than once in a sentence",
  plainProse("**one** and **two**") === "one and two");
check("…and the run stays plain, not code",
  proseSegments("**one**").every((r) => r.code === false));

console.log("\n=== 4. the markers that are NOT a pair — never eat the rest of the line ===");
// A lone marker is a character in a sentence. Hunting for a partner that does not exist is how a
// cosmetic blemish becomes a lost answer.
const UNPAIRED = [
  "press ` to open the console",
  "the value is `unterminated and then some more words",
  "**not closed either, and this sentence still has to arrive",
  "a ** b ** c",
];
for (const u of UNPAIRED) {
  const out = plainProse(u);
  check(`nothing is swallowed: ${u.slice(0, 34)}…`, out.includes(u.replace(/[`*]/g, "").trim().split(/\s+/).pop()), out);
}
check("an unclosed backtick is left exactly as written", plainProse("press ` to open the console") === "press ` to open the console");

console.log("\n=== 5. fences, because a model that was asked for a sentence may still write one ===");
check("a triple-backtick run is ONE code span, not two empty ones round a word",
  shown("run ```ipconfig /flushdns``` now") === "run «ipconfig /flushdns» now");
check("…and a single-backtick span is the same shape", shown("run `ipconfig` now") === "run «ipconfig» now");

console.log("\n=== 6. inside a code span the content is literal ===");
// Mono exists to show a string EXACTLY. Stripping emphasis inside it would corrupt the one thing
// the treatment is for - and `**` is a real glob, a real pointer, and real C.
// NOTE THE INPUT. "a ** b" has only ONE `**` in it, so `strip()` is a no-op on it and this
// assertion passed for the wrong reason until a mutation probe showed the mutation changing
// nothing observable (2026-09-11). The case that actually exercises the rule needs a COMPLETE
// bold pair inside the span.
check("emphasis markers inside code are content, not markup",
  shown("quote `a **b** c` exactly") === "quote «a **b** c» exactly", shown("quote `a **b** c` exactly"));
check("…and an unpaired marker inside code is equally untouched",
  shown("type `a ** b` exactly") === "type «a ** b» exactly");
check("…and an underscore in a quoted identifier survives, obviously",
  shown("the column is `is_active`") === "the column is «is_active»");

console.log("\n=== 7. shapes the renderer relies on ===");
check("empty input still yields one run, so a caller never handles an empty array",
  proseSegments("").length === 1 && proseSegments("")[0].text === "");
for (const odd of [null, undefined, 42]) {
  check(`non-strings do not throw: ${String(odd)}`, (() => { try { proseSegments(odd); return true; } catch { return false; } })());
}
check("the runs always rebuild the plain string exactly",
  [REAL, "**a** `b` c", "plain", ...VOCAB].every((t) => proseSegments(t).map((r) => r.text).join("") === plainProse(t)));
check("a string with no markers at all is returned as one plain run",
  proseSegments("nothing to do here").length === 1 && proseSegments("nothing to do here")[0].code === false);
// The regex is module-scope and global; a stale lastIndex would make the SECOND call on the same
// text return different runs. That is the kind of defect that only shows up in production.
check("calling twice on the same text gives the same answer (no stale lastIndex)",
  JSON.stringify(proseSegments(REAL)) === JSON.stringify(proseSegments(REAL)));

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
