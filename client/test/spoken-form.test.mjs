// @ts-check
/**
 * D249 — THIS ENVIRONMENT'S OWN IDENTIFIERS ARE SHOWN AND NEVER SAID.
 *
 * Charles, 2026-09-10: *"Speaking computer names could be tricky especially in a corp environment.
 * Ok to display computername but it should say this pc."* Then *"do the username too"*, then
 * *"fix 2 and 3 as well"* — the address, and the crash note (the last of which is in `renderer.js`
 * and is checked by `panel.test.mjs`).
 *
 * `spokenForm()` is the only thing between a string and the voice. It builds regular expressions at
 * run time from values read off the machine, which is a shape that is wrong in ways reading it does
 * not show — a hyphen is a word boundary, a hostname can contain regex metacharacters, one address
 * can be a prefix of another, an account arrives domain-qualified, and a short name would rewrite
 * ordinary words. Every case below is one of those.
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
/** A realistic corporate environment, as `identify()` + `diagnose()` would report it. */
const ENV = { machine: "FIN-LON-0442", user: "a.petrova", addresses: ["10.0.0.42", "10.0.0.1"] };
const say = (t, env = ENV) => spokenForm(t, env);

console.log("=== 1. the machine's name ===");
{
  check("it is replaced, not removed",
    say("I've filed that from FIN-LON-0442.") === "I've filed that from this PC.", say("I've filed that from FIN-LON-0442."));
  check("case does not matter - a user types it however they like",
    say("what is wrong with fin-lon-0442") === "what is wrong with this PC", say("what is wrong with fin-lon-0442"));
  check("every occurrence, not just the first",
    say("FIN-LON-0442 and FIN-LON-0442") === "this PC and this PC");
  check("a longer name CONTAINING it is left alone - the hyphen is not a boundary",
    say("OLD-FIN-LON-0442 is a different machine") === "OLD-FIN-LON-0442 is a different machine", say("OLD-FIN-LON-0442 is a different machine"));
  check("…and so is a suffix", say("FIN-LON-04421 is too") === "FIN-LON-04421 is too", say("FIN-LON-04421 is too"));
  check("punctuation around it is still a boundary",
    say("(FIN-LON-0442), yes.") === "(this PC), yes.", say("(FIN-LON-0442), yes."));
}

console.log("=== 2. the signed-in account, including the forms a domain puts it in ===");
{
  check("a bare username", say("filed by a.petrova") === "filed by your account", say("filed by a.petrova"));
  check("it survives being dropped into someone else's sentence",
    say("a.petrova is signed in.") === "your account is signed in.", say("a.petrova is signed in."));
  check("DOMAIN\\user - the qualifier goes WITH it, or the domain is what gets read out",
    say("signed in as CORP\\a.petrova") === "signed in as your account", say("signed in as CORP\\a.petrova"));
  check("MACHINE\\user, the local-account form", say("FIN-LON-0442\\a.petrova") === "your account", say("FIN-LON-0442\\a.petrova"));
  check("a UPN takes its domain with it too",
    say("a.petrova@corp.example asked") === "your account asked", say("a.petrova@corp.example asked"));
  check("a forward slash is a qualifier too", say("CORP/a.petrova") === "your account", say("CORP/a.petrova"));
  check("case does not matter here either", say("A.PETROVA") === "your account");
  check("a longer account containing it is left alone", say("a.petrovator") === "a.petrovator", say("a.petrovator"));
  // The user runs BEFORE the machine on purpose: its qualifier clause absorbs the machine prefix in
  // one step. Machine-first would leave "this PC\your account", which is true and reads worse.
  check("a machine-qualified account becomes ONE phrase, not two",
    say("FIN-LON-0442\\a.petrova is signed in") === "your account is signed in", say("FIN-LON-0442\\a.petrova is signed in"));
}

console.log("=== 3. this machine's own addresses - and ONLY those ===");
{
  check("the address is replaced by the fact that matters, not by nothing",
    say("Renewed the DHCP lease — this machine now has 10.0.0.42.") === "Renewed the DHCP lease — this machine now has an address.",
    say("Renewed the DHCP lease — this machine now has 10.0.0.42."));
  check("the gateway too", say("the router is 10.0.0.1") === "the router is an address", say("the router is 10.0.0.1"));
  // THE SAFETY OF THE WHOLE THING. A knowledge-base answer may legitimately name a public resolver,
  // a print server or a subnet from company guidance; redacting those destroys the answer.
  check("AN ADDRESS THAT IS NOT OURS IS UNTOUCHED - this is not a pattern for anything IP-shaped",
    say("try 8.8.8.8 as your DNS server") === "try 8.8.8.8 as your DNS server", say("try 8.8.8.8 as your DNS server"));
  check("…nor is a different address on the same subnet",
    say("the print server is 10.0.0.99") === "the print server is 10.0.0.99",
    say("the print server is 10.0.0.99"));
  check("a longer address CONTAINING ours is not half-matched",
    say("10.0.0.421 is not it") === "10.0.0.421 is not it", say("10.0.0.421 is not it"));
  check("…and neither is one we are a suffix of",
    say("110.0.0.42 is not it") === "110.0.0.42 is not it", say("110.0.0.42 is not it"));
  check("a full stop after it is still a sentence ending, not a fifth octet",
    say("it has 10.0.0.42.") === "it has an address.", say("it has 10.0.0.42."));
  check("the gateway being a prefix of nothing does not matter, but longest-first is applied",
    spokenForm("10.0.0.1 and 10.0.0.10", { addresses: ["10.0.0.1", "10.0.0.10"] }) === "an address and an address",
    spokenForm("10.0.0.1 and 10.0.0.10", { addresses: ["10.0.0.1", "10.0.0.10"] }));
  check("a placeholder address is not redacted into a claim",
    spokenForm("no address yet", { addresses: ["-", "0.0.0.0", null] }) === "no address yet");

  // THE CASE THAT MOTIVATED THE WHOLE ADDRESS RULE, and the one it could not reach on its own.
  // `renew_dhcp` exists to CHANGE this machine's address, so its success line reports a value the
  // last probe cannot have seen. The renderer folds the broker's `detail` into the environment
  // before anything speaks it (`learnAddressesFrom`, checked in `panel.test.mjs`); what is checked
  // HERE is that a freshly-learned address is redacted exactly like a probed one.
  const afterRenewal = { ...ENV, addresses: [...ENV.addresses, "192.168.50.223"] };
  check("a NEW address, learned from the broker rather than the probe, is redacted too",
    spokenForm("Renewed the DHCP lease — this machine now has 192.168.50.223.", afterRenewal)
      === "Renewed the DHCP lease — this machine now has an address.",
    spokenForm("Renewed the DHCP lease — this machine now has 192.168.50.223.", afterRenewal));
  check("…and the OLD one still is, because both are this machine's",
    spokenForm("was 10.0.0.42, now 192.168.50.223", afterRenewal) === "was an address, now an address");
  // The APIPA case: `probe.test.mjs` asserts the phrase SHOWS the address, because a 169.254 address
  // reading as success is a defect found on real hardware. It is shown and not said.
  const apipa = { ...ENV, addresses: [...ENV.addresses, "169.254.17.252"] };
  // "(an address)" after "a self-assigned address" is worse said aloud than either the digits or
  // nothing, so an address that is the WHOLE of a parenthetical is dropped rather than replaced.
  check("a self-assigned address is not read out digit by digit either",
    spokenForm("but so far only a self-assigned address (169.254.17.252), which means DHCP has not answered", apipa)
      === "but so far only a self-assigned address, which means DHCP has not answered",
    spokenForm("but so far only a self-assigned address (169.254.17.252), which means DHCP has not answered", apipa));
  check("…and the sentence it leaves behind is still a sentence",
    !/\(\s*\)|\s{2,}|\s,/.test(spokenForm("a self-assigned address (169.254.17.252), which means", apipa)));
  check("an address that is NOT the whole parenthetical is still replaced, not dropped",
    spokenForm("(was 10.0.0.42 before)", ENV) === "(was an address before)", spokenForm("(was 10.0.0.42 before)", ENV));
}

console.log("=== 4. the cases that would do damage ===");
{
  // A two-letter hostname would rewrite every "pc", "it" and "no" in the sentence. Not matching is
  // the lesser harm by a long way, and it is a decision rather than an oversight.
  check("a name under three characters is not matched at all",
    spokenForm("my PC is broken", { machine: "PC" }) === "my PC is broken");
  check("nothing known yet - the boot line speaks before the first probe has landed on some paths",
    spokenForm("Hi, I'm Matic.", {}) === "Hi, I'm Matic.");
  check("no argument at all is the same case", spokenForm("Hi, I'm Matic.") === "Hi, I'm Matic.");
  check("an empty name is the same case", spokenForm("anything", { machine: "", user: "" }) === "anything");
  check("whitespace is not a name", spokenForm("anything", { machine: "   " }) === "anything");
  // `identify()` returns "unknown" when there is no passwd entry. Redacting it would turn an honest
  // placeholder into a claim that the user's own account was named.
  check("\"unknown\" is a placeholder, not a name, and is left alone",
    spokenForm("signed in as unknown", { user: "unknown" }) === "signed in as unknown");
  // This builds a RegExp from a value read off the machine. An unescaped metacharacter is a crash
  // or a wildcard, not a wrong word.
  check("regex metacharacters in a name are escaped, not executed",
    spokenForm("a.b.c and axbxc", { machine: "a.b.c" }) === "this PC and axbxc", spokenForm("a.b.c and axbxc", { machine: "a.b.c" }));
  check("a name that is a regex quantifier does not throw",
    (() => { try { return spokenForm("hello", { machine: "+++" }); } catch { return "THREW"; } })() === "hello");
  check("non-string input does not throw", spokenForm(undefined, ENV) === "");
}

console.log("=== 5. all three in one sentence, which is the case nobody writes a test for ===");
{
  const shown = "FIN-LON-0442\\a.petrova is signed in on FIN-LON-0442, which now has 10.0.0.42 via 10.0.0.1.";
  const heard = say(shown);
  check("every identifier goes, and the sentence still parses",
    heard === "your account is signed in on this PC, which now has an address via an address.", heard);
  check("…and the shown string is untouched - this returns a copy, it does not mutate",
    shown === "FIN-LON-0442\\a.petrova is signed in on FIN-LON-0442, which now has 10.0.0.42 via 10.0.0.1.");
  check("a sentence with none of them in it comes back exactly as it was",
    say("Restarted the Print Spooler service — it went STOPPED → RUNNING.") === "Restarted the Print Spooler service — it went STOPPED → RUNNING.");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
