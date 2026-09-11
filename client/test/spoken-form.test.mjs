// @ts-check
/**
 * D249 — THIS MACHINE'S NAME IS SHOWN AND NEVER SAID.
 *
 * Charles, 2026-09-10: *"Speaking computer names could be tricky especially in a corp environment.
 * Ok to display computername but it should say this pc."*
 *
 * `spokenForm()` is the only thing between a string and the voice. It is a regular expression built
 * at run time from a value read off the machine, which is a shape that is wrong in ways reading it
 * does not show — a hyphen is a word boundary, a hostname can contain regex metacharacters, and a
 * short one would rewrite ordinary words. Every case below is one of those.
 *
 * WHAT THIS CANNOT CHECK: that `renderer.js` actually calls it on the way to the voice and not on
 * the way to the screen. That is `panel.test.mjs`, by source, because `renderer.js` touches
 * `document` at module scope and cannot be imported here.
 */
import { spokenForm } from "../src/renderer/spoken-form.js";

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`); }
}

console.log("=== 1. the ordinary corporate hostname ===");
{
  const say = (t) => spokenForm(t, "FIN-LON-0442");
  check("it is replaced, not removed",
    say("I've filed that from FIN-LON-0442.") === "I've filed that from this PC.", say("I've filed that from FIN-LON-0442."));
  check("case does not matter - a user types it however they like",
    say("what is wrong with fin-lon-0442") === "what is wrong with this PC", say("what is wrong with fin-lon-0442"));
  check("every occurrence, not just the first",
    say("FIN-LON-0442 and FIN-LON-0442") === "this PC and this PC");
  check("a longer name CONTAINING it is left alone - the hyphen is not a boundary",
    say("OLD-FIN-LON-0442 is a different machine") === "OLD-FIN-LON-0442 is a different machine", say("OLD-FIN-LON-0442 is a different machine"));
  check("…and so is a suffix",
    say("FIN-LON-04421 is too") === "FIN-LON-04421 is too", say("FIN-LON-04421 is too"));
  check("punctuation around it is still a boundary",
    say("(FIN-LON-0442), yes.") === "(this PC), yes.", say("(FIN-LON-0442), yes."));
}

console.log("=== 2. the cases that would do damage ===");
{
  // A two-letter hostname would rewrite every "pc", "it" and "no" in the sentence. Not matching is
  // the lesser harm by a long way, and it is a decision rather than an oversight.
  check("a name under three characters is not matched at all",
    spokenForm("my PC is broken", "PC") === "my PC is broken");
  check("no name known yet - the boot line speaks before the first probe has landed on some paths",
    spokenForm("Hi, I'm Matic.", null) === "Hi, I'm Matic.");
  check("an empty name is the same case", spokenForm("anything", "") === "anything");
  check("whitespace is not a name", spokenForm("anything", "   ") === "anything");
  // A hostname is not supposed to contain these, but this builds a RegExp from a value read off the
  // machine, and an unescaped one is a crash or a wildcard rather than a wrong word.
  check("regex metacharacters in a name are escaped, not executed",
    spokenForm("a.b.c and axbxc", "a.b.c") === "this PC and axbxc", spokenForm("a.b.c and axbxc", "a.b.c"));
  check("a name that is a regex quantifier does not throw",
    (() => { try { return spokenForm("hello", "+++"); } catch { return "THREW"; } })() === "hello");
  check("non-string input does not throw", spokenForm(undefined, "FIN-LON-0442") === "");
}

console.log("=== 3. what it does NOT do ===");
{
  // Scoped to the machine's name, because that is the rule that was asked for. The signed-in user
  // is a separate question and is NOT covered - see the handover's ledger.
  check("it does not touch the signed-in user's name",
    spokenForm("filed by placeholder.user", "PLACEHOLDER-PC") === "filed by placeholder.user");
  check("it does not touch an IP address",
    spokenForm("this machine now has 10.0.0.42", "PLACEHOLDER-PC") === "this machine now has 10.0.0.42");
  check("it leaves a string with no name in it exactly as it was",
    spokenForm("Restarted the Print Spooler service.", "PLACEHOLDER-PC") === "Restarted the Print Spooler service.");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
