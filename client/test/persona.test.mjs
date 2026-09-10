/**
 * The persona file and the rules it lives under. D234, 2026-09-10.
 *
 * Run: node test/persona.test.mjs        (from client/; part of `npm test`)
 *
 * persona.json is the one place the assistant's name and its non-problem-specific lines live. It is
 * DATA, and the two rules the file's own header states are enforced here rather than trusted:
 *
 *   1. Nothing in the persona names a capability. What the assistant can do is generated from the
 *      catalog (D165/D212); a warm sentence that lists features is a claim, and claims drift. The
 *      check is against the catalog's OWN words, so adding a capability tightens the rule for free.
 *   2. Nothing in the persona claims an outcome the system cannot attribute - no "IT has been
 *      notified", no "fixed" (D213, D86, H5).
 *
 * Plus the plumbing: every subkind classify() emits has lines, the rotation works, the two fallback
 * sentences keep the two facts apart, and the widened social markers catch what Charles typed.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import persona from "../src/router/persona.json" with { type: "json" };
import { classify, residue } from "../src/router/classify.js";
import { socialReply, capabilityReply, SOCIAL_SUBKINDS, pickVariant, resetRotation } from "../src/router/social.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT = resolve(HERE, "..");
let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}

// ==============================================================================================
console.log("=== 1. shape: a name, vocatives, a boot line, and lines for every social subkind ===");
check("has a name and a team", typeof persona.name === "string" && persona.name.length > 0 && typeof persona.team === "string");
check("vocatives include the bare name, lowercase", persona.vocatives.includes(persona.name.toLowerCase()));
check("at least one boot line", Array.isArray(persona.boot) && persona.boot.length >= 1);
for (const k of SOCIAL_SUBKINDS) {
  if (k === "capability") continue;
  check(`social.${k} has at least two lines (so rotation means something)`, Array.isArray(persona.social[k]) && persona.social[k].length >= 2, `got ${persona.social[k]?.length}`);
}
for (const k of ["intro", "consent", "noticeOne", "noticeSome", "boundary", "noCatalog"]) check(`capability.${k} exists`, typeof persona.capability[k] === "string" && persona.capability[k].length > 0);
check("capability.intro carries the {abilities} placeholder", persona.capability.intro.includes("{abilities}"));
check("noticeOne/noticeSome carry the {disruptive} placeholder", persona.capability.noticeOne.includes("{disruptive}") && persona.capability.noticeSome.includes("{disruptive}"));
check("fallback has hubUnreachable and hubNoAnswer, and they differ", typeof persona.fallback.hubUnreachable === "string" && typeof persona.fallback.hubNoAnswer === "string" && persona.fallback.hubUnreachable !== persona.fallback.hubNoAnswer);

// ==============================================================================================
console.log("\n=== 2. RULE 1: no persona line names a capability (checked against the catalog's own words) ===");
const catalog = JSON.parse(readFileSync(join(CLIENT, "src/broker/catalog.json"), "utf8"));
const caps = Array.isArray(catalog.capabilities) ? catalog.capabilities : Object.values(catalog).filter((v) => v && typeof v === "object" && v.title);
// Distinctive nouns from the titles: anything 4+ letters that is not a stop word.
const STOP = new Set(["the", "and", "a", "an", "re", "windows", "service", "cache", "lease", "network", "adapter", "restart", "flush", "release", "renew", "disable", "enable", "resolver"]);
const capWords = new Set();
for (const c of caps) for (const w of String(c.title ?? c.id).toLowerCase().split(/[^a-z]+/)) if (w.length >= 3 && !STOP.has(w)) capWords.add(w);
// The words that would actually indicate a claim: the technical nouns. Keep the STOP list honest by
// also requiring the obvious ones explicitly.
for (const w of ["dns", "dhcp", "spooler"]) capWords.add(w);
check(`catalog yields distinctive words to check (${[...capWords].join(", ")})`, capWords.size >= 3);
const socialLines = [
  ...persona.boot,
  ...Object.values(persona.social).flat(),
  persona.capability.consent, persona.capability.boundary, persona.capability.noCatalog,
  ...Object.values(persona.fallback),
  persona.tickets.some, persona.tickets.none, persona.tickets.unavailable,
];
check("tickets.some/none/unavailable/item exist (D235)", ["some", "none", "unavailable", "item"].every((k) => typeof persona.tickets[k] === "string"));
check("every tickets line says status lookup is not built, in some words", [persona.tickets.some, persona.tickets.none, persona.tickets.unavailable].every((l) => /isn't built|isn't something I can do|can't check|can't look up|can't see/.test(l)));
for (const line of socialLines) {
  const hit = [...capWords].find((w) => new RegExp(`\\b${w}\\b`, "i").test(line));
  check(`no capability word in: "${line.slice(0, 60)}…"`, !hit, `names "${hit}"`);
}

// ==============================================================================================
console.log("\n=== 3. RULE 2: no persona line claims an outcome the system cannot attribute ===");
const CLAIMS = [/notified/i, /has been told/i, /\bfixed\b/i, /i(')?ve (sorted|resolved|repaired)/i, /ticket (has been|is) (raised|filed|sent)/i, /it (has|have) been (contacted|alerted|paged)/i];
for (const line of socialLines) {
  const hit = CLAIMS.find((re) => re.test(line));
  check(`no outcome claim in: "${line.slice(0, 60)}…"`, !hit, `matches ${hit}`);
}

// ==============================================================================================
console.log("\n=== 4. the templates read the persona, and rotate ===");
resetRotation();
const g1 = socialReply("greeting"), g2 = socialReply("greeting");
check("first greeting is the first persona line", g1 === persona.social.greeting[0]);
check("second greeting is the SECOND persona line", g2 === persona.social.greeting[1], g2);
resetRotation();
check("rotation wraps", (() => { const n = persona.social.thanks.length; for (let i = 0; i < n; i++) socialReply("thanks"); return socialReply("thanks") === persona.social.thanks[0]; })());
check("pickVariant on an empty list is null, not a crash", pickVariant("x", []) === null);
check("capability reply with no catalog is the persona's noCatalog line", capabilityReply({ capabilities: [] }) === persona.capability.noCatalog);
const capReply = capabilityReply({ capabilities: caps.map((c) => ({ id: c.id, title: c.title, plain: c.plain, tierInfo: { label: c.tier === "R2" ? "disruptive" : "" } })) });
// D235: the list is built from the catalog's plain.helpsWith - what the user HAS, not the mechanism.
check("every catalog capability has a plain.helpsWith (or it is read out by its title, which sounds like a sysadmin)", caps.every((c) => typeof c.plain?.helpsWith === "string" && c.plain.helpsWith.length > 10), caps.filter((c) => !c.plain?.helpsWith).map((c) => c.id).join(","));
check("capability reply contains every helpsWith phrase", caps.every((c) => capReply.includes(c.plain.helpsWith)), capReply);
check("helpsWith phrases are in the user's words: no 'DHCP', no 'DNS', no 'service' jargon", caps.every((c) => !/\b(dhcp|dns|tsv|api|spooler)\b/i.test(c.plain.helpsWith)), caps.map((c) => c.plain.helpsWith).join(" | "));
check("the disruptive one is still NAMED by its precise title (that is what the consent card will say)", /disable and re-enable a network adapter/.test(capReply));
check("without a helpsWith the title is the fallback, not silence", capabilityReply({ capabilities: [{ id: "x", title: "Rotate the frobnicator" }] }).includes("rotate the frobnicator"));
check("capability reply contains the persona's consent line", capReply.includes(persona.capability.consent));
check("no unfilled placeholder leaks", !/\{(abilities|disruptive)\}/.test(capReply));

// ==============================================================================================
console.log("\n=== 5. what Charles typed is social now, and real problems still are not ===");
const SOCIAL_CASES = [
  ["Hello Matic How are you today?", "howareyou"],
  ["hello matic how are you?", "howareyou"],
  ["how are you doing", "howareyou"],
  ["how's it going matic", "howareyou"],
  ["what can you fix?", "capability"],
  ["what kinds of problems can you help with", "capability"],
  ["introduce yourself", "capability"],
  ["good morning matic desk", "greeting"],
  ["hey there", "greeting"],
  ["thanks matic", "thanks"],
  ["nice one", "thanks"],
  ["bye for now", "farewell"],
  ["good night", "farewell"],
];
for (const [t, sub] of SOCIAL_CASES) {
  const r = classify(t);
  check(`"${t}" -> social/${sub}`, r.kind === "social" && r.subkind === sub, `${r.kind}/${r.subkind ?? "-"} (${r.why}) residue="${residue(t.toLowerCase())}"`);
}
for (const t of [
  "hey matic, my printer is broken",
  "hi, my printer is broken",
  "good morning, the wifi is down again",
  "thanks but the printer still won't print",
  "what's up with my printer",
  "hello printer",
  "my desk phone is dead",
  "later today the vpn drops",
]) {
  const r = classify(t);
  check(`"${t}" is NOT social (${r.kind})`, r.kind !== "social", r.why);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
