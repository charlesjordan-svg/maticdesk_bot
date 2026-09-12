/**
 * The boot greeting: which set, which line, and the cursor that outlives the process. D262.
 *
 * Run: node test/greeting.test.mjs        (from client/; part of `npm test`)
 *
 * WHAT THIS FILE IS ACTUALLY GUARDING, and it is not the copy.
 *
 * Charles, 2026-09-11: *"only one greeting ever played."* Two causes, and the second is why a
 * test here is worth more than a careful reading:
 *
 *   1. `renderer.js` spoke `persona.boot[0]` — a hardcoded index.
 *   2. `social.js`'s rotation cursor is a module-level Map, and **the boot line fires once per
 *      process.** Swapping the hardcoded index for `pickVariant("boot", …)` returns `boot[0]` on
 *      every launch forever — and a test written against a single in-process call would PASS.
 *
 * So §2 below does not check that the picker rotates. It checks that **three successive launches,
 * each starting from what the last one persisted, say three different things.** That is the shape
 * of the bug, and it is the only shape that catches it.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import persona from "../src/router/persona.json" with { type: "json" };
import { pickBootGreeting, bootSetFor, bootLines, BOOT_SETS } from "../src/router/greeting.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT = resolve(HERE, "..");
let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}

/** One launch: read the cursors, pick, hand back what the renderer would have persisted. */
function launch(state, cursors) {
  const r = pickBootGreeting({ ...state, cursors });
  return r;
}

// ==============================================================================================
console.log("=== 1. precedence: the network route chooses the set, and NO hub state ever does ===");
check("no route -> the offline set, whatever the hub says", bootSetFor({ online: false, hubState: "reachable" }) === "offline");
check("no route beats standalone (a machine with no route cannot reach a hub either)", bootSetFor({ online: false, hubState: "standalone" }) === "offline");
check("no route beats unreachable, so the two are never said in one breath (D245)", bootSetFor({ online: false, hubState: "unreachable" }) === "offline");
check("online + reachable -> neutral", bootSetFor({ online: true, hubState: "reachable" }) === "neutral");
// D245, AND THIS IS THE ASSERTION THE ELECTRON RUN BOUGHT. Sets for `standalone` and
// `hubUnreachable` were written, built and then deleted, because the screenshot showed the rail,
// the standing band and the avatar all saying one fact in three wordings. The band states what is
// available; the greeting states what to do next — and with the availability half removed, a
// standalone greeting IS the neutral one. Every hub state maps to neutral ON PURPOSE.
for (const st of ["standalone", "unreachable", "checking", "reachable", undefined]) {
  check(`hub ${st ?? "unknown"} -> neutral: the band and the rail already say it (D245)`, bootSetFor({ online: true, hubState: st }) === "neutral");
}
// `online` unknown must not read as offline. Telling someone their network is down when the panel
// could not be read is the worst mistake this can make.
check("online UNKNOWN is not offline", bootSetFor({ hubState: "checking" }) === "neutral" && bootSetFor({ online: undefined }) === "neutral");

// ==============================================================================================
console.log("\n=== 2. THE BUG: three launches say three different things ===");
// Each launch starts from the cursors the previous launch handed back — which is exactly what a
// module-level Map cannot do, and exactly what the old code got wrong.
{
  let cursors = {};
  const said = [];
  for (let i = 0; i < 3; i++) {
    const r = launch({ online: true, hubState: "reachable" }, cursors);
    said.push(r.line);
    cursors = r.cursors;
  }
  check("three launches, three different lines", new Set(said).size === 3, said.join(" | "));
  check("the first launch speaks boot[0]", said[0] === persona.boot[0], said[0]);
  const wrapped = launch({ online: true, hubState: "reachable" }, cursors);
  check("the fourth launch wraps to the first line", wrapped.line === persona.boot[0], wrapped.line);
}
{
  // EACH SET ROTATES INDEPENDENTLY. Two offline launches must not silently advance the neutral set
  // past lines the user has never heard.
  let cursors = {};
  for (let i = 0; i < 2; i++) cursors = launch({ online: false }, cursors).cursors;
  const back = launch({ online: true, hubState: "reachable" }, cursors);
  check("offline launches do not advance the neutral cursor", back.line === persona.boot[0], back.line);
  check("the offline cursor did advance", cursors.offline === 0, JSON.stringify(cursors));
}

// ==============================================================================================
console.log("\n=== 3. a persisted cursor is untrusted input: it survives a shorter list, and junk ===");
for (const [label, bad] of [["past the end", { neutral: 99 }], ["negative", { neutral: -4 }], ["not a number", { neutral: "banana" }], ["null", { neutral: null }]]) {
  const r = pickBootGreeting({ online: true, hubState: "reachable", cursors: bad });
  check(`a ${label} cursor still yields a real line`, typeof r?.line === "string" && persona.boot.includes(r.line), JSON.stringify(r));
}
check("a missing cursors object is fine", typeof pickBootGreeting({ online: true })?.line === "string");

// ==============================================================================================
console.log("\n=== 4. a missing state set falls back to neutral, never to silence ===");
{
  const stripped = { ...persona, bootState: {} };
  const r = pickBootGreeting({ online: false, cursors: {}, persona: stripped });
  check("no offline set -> the neutral set, not nothing", r?.key === "neutral" && r.line === persona.boot[0], JSON.stringify(r));
  check("no boot lines at all -> null, so the caller says nothing rather than an empty bubble",
    pickBootGreeting({ persona: { boot: [], bootState: {} } }) === null);
  check("boot entries that are not strings are ignored", bootLines("neutral", { boot: ["", "  ", 7, null, "real"] }).join("") === "real");
}

// ==============================================================================================
console.log("\n=== 5. the sets exist, rotate, and say the right kind of thing ===");
for (const key of BOOT_SETS) {
  check(`${key} has at least two lines (so rotation means something)`, bootLines(key).length >= 2, `got ${bootLines(key).length}`);
}
const ALL = BOOT_SETS.flatMap((k) => bootLines(k));
check("every boot line across every set is a different sentence", new Set(ALL).size === ALL.length);
const FAULT_WORDS = /can't reach|cannot reach|out of reach|isn't reaching|lost (its |my )?connection|not working|unreachable|keep trying/i;
for (const line of bootLines("offline")) check(`offline says plainly what is wrong: "${line.slice(0, 40)}…"`, FAULT_WORDS.test(line), line);

// ==============================================================================================
console.log("\n=== 5b. D245: the greeting may not restate what the standing band and the rail say ===");
// THE ASSERTION THE SCREENSHOT BOUGHT. index.html's band and rail own the words "company
// guidance" and "the service desk" — they say what is available, permanently, before the user acts.
// A spoken line that names either is a second wording of a fact already on screen.
const indexSrc = readFileSync(join(CLIENT, "src/renderer/index.html"), "utf8");
check("the band still owns those words (or this check is pinning nothing)",
  /There's no company guidance or service desk connected here/.test(indexSrc)
  && /I can't reach your company's guidance or the service desk at the moment/.test(indexSrc));
for (const line of ALL) {
  check(`no boot line names what the band names: "${line.slice(0, 40)}…"`, !/service desk|company'?s? guidance/i.test(line), line);
}
// D198. The offline greeting is the product's best moment and the easiest place to repeat its worst
// defect: an unprompted consent card at boot. It must OFFER — end on a question the user answers —
// and never announce an action.
for (const line of bootLines("offline")) {
  check(`offline OFFERS rather than proposes: "${line.slice(0, 40)}…"`, /\?\s*$/.test(line), line);
  check(`offline promises no action of its own: "${line.slice(0, 40)}…"`, !/I'll (fix|renew|flush|restart|reset|sort)/i.test(line), line);
}
// The neutral set must claim no connectivity state at all, or it is a degraded greeting in the
// healthy slot.
for (const line of persona.boot) check(`neutral claims no state: "${line.slice(0, 40)}…"`, !FAULT_WORDS.test(line) && !/service desk|network/i.test(line), line);

// ==============================================================================================
console.log("\n=== 6. request intake is not built, so no shipped line may offer to take one ===");
// The three held-back greetings say "request". Until intake ships, a line that offers it is a
// spoken promise the build cannot keep - the same class of error as the capability montage cut
// from the V1 ad. The held lines live in the persona's $bootComment, which is documentation.
for (const line of [...ALL, ...persona.social.greeting]) {
  check(`no shipped greeting offers to take a request: "${line.slice(0, 40)}…"`, !/\brequest\b/i.test(line), line);
}
// The mid-session hello must not re-introduce Matic by name: the user is already in a conversation
// with it. Introducing itself is the boot line's whole job, and noise on the fifth hello of the day.
for (const line of persona.social.greeting) {
  check(`mid-session hello does not re-introduce: "${line.slice(0, 40)}…"`, !/I'm Matic|Matic here/i.test(line), line);
}
check("the boot lines DO introduce Matic by name", persona.boot.every((l) => /Matic/.test(l)));

// ==============================================================================================
console.log("\n=== 7. the renderer actually uses it (the old bug was one character of source) ===");
const rendererSrc = readFileSync(join(CLIENT, "src/renderer/renderer.js"), "utf8");
check("renderer no longer speaks a hardcoded boot index", !/persona\.boot\s*\[\s*0\s*\]/.test(rendererSrc.replace(/^\s*\*.*$/gm, "")));
check("renderer calls pickBootGreeting", /pickBootGreeting\(/.test(rendererSrc));
check("renderer PERSISTS the cursor (a per-process one is the bug, not the fix)",
  /localStorage\.setItem\(\s*BOOT_CURSOR_KEY/.test(rendererSrc) && /localStorage\.getItem\(\s*BOOT_CURSOR_KEY/.test(rendererSrc));
check("renderer reads the hub state once and passes it to both the band and the greeting",
  /const hub = await window\.matic\.hubStatus\(\);/.test(rendererSrc) && /bootGreeting\(facts, hub\)/.test(rendererSrc));
check("renderer passes `online` as a boolean, never the panel's string", /facts\?\.online === "no" \? false/.test(rendererSrc));
// D245. The renderer already speaks a loss note on the transition INTO unreachable. If the boot
// greeting and that note were the same sentence, a user who launched during an outage would be
// told one fact twice. They are different sentences by construction; this pins it.
const noteLine = rendererSrc.match(/note\(`(I've lost my connection[^`]*)`/)?.[1] ?? "";
check("the loss note exists to compare against", noteLine.length > 40, noteLine);
check("no boot line is the loss note reworded", !ALL.includes(noteLine));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
