#!/usr/bin/env node
// @ts-check
/**
 * The panel delivery, its generated stylesheet, and the rules the app surface has to keep (D240-D243).
 *
 * WHAT A HEADLESS TEST CAN AND CANNOT DO HERE, SAID ONCE SO NOBODY READS THIS FILE AS COVERAGE:
 * it cannot see a screen. Nothing below proves the panel LOOKS right, that the inspector is
 * readable, or that dark mode is legible - `client/docs/PANEL-RENDERER-CHECK.md` is the list
 * Charles runs for that, and it is not optional (six of the last seven click-throughs found
 * something). What this file CAN do is stop the three regressions that would be invisible until
 * someone looked:
 *
 *   1. the stylesheet drifting from the delivery (the avatar's `assets.js` argument, D241)
 *   2. a developer control - a scene switcher, an inspector-variant toggle - reappearing on the
 *      end-user surface (acceptance 5)
 *   3. our vocabulary leaking back into the markup the user reads (the whole point of D240)
 *
 * Same shape as `test/avatar.test.mjs`: assertions counted, exit 1 at the end, no framework.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPanelCss, panelCssIsCurrent } from "../scripts/build-panel-assets.mjs";
// The enums are the authority on which members exist; the panel only decides how to READ them.
// Importing them rather than restating them is what makes §5a a real check (D244).
import { ESCALATION_CATEGORIES, ESCALATION_OWNERS } from "../src/agent/prompt.js";
import { machineBandGroups } from "../src/agent/machine-band.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RENDERER = resolve(HERE, "../src/renderer");
const PANEL = join(RENDERER, "panel");

let pass = 0;
let fail = 0;
/** @param {string} name @param {boolean} ok @param {string} [detail] */
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`); }
}

const delivery = readFileSync(join(PANEL, "matic-desk-panel.html"), "utf8");
const panelCss = readFileSync(join(PANEL, "matic-panel.css"), "utf8");
const appCss = readFileSync(join(PANEL, "matic-panel.app.css"), "utf8");
const indexHtml = readFileSync(join(RENDERER, "index.html"), "utf8");
const rendererJs = readFileSync(join(RENDERER, "renderer.js"), "utf8");
const avatarCss = readFileSync(join(RENDERER, "avatar/matic-avatar.css"), "utf8");

/**
 * The renderer with its prose removed. Several rules below are about what the CODE does, and this
 * file is heavily commented precisely because the reasons matter - `grep innerHTML` over the whole
 * file finds the comment saying it is never used. Block comments and whole-line comments only: a
 * trailing `// …` is left in, because stripping one safely means parsing string literals, and there
 * is no string in that file containing a `//`.
 */
const rendererCode = rendererJs
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

// ==============================================================================================
console.log("\n=== 1. the delivery is intact and self-contained ===");
//
// The design handover's own mechanical verification, kept as a test rather than as a claim in a
// document: a delivery that starts fetching a font or a script is a delivery that stops working
// on a machine with no network, which is the machine this app is for.
// TWO BLOCKS SINCE THE 2026-09-10 RE-EXPORT, and the delivery labels the one that is not the
// panel: `<style id="sheet-only">` is the contact sheet's own chrome. The build script takes the
// unlabelled one. This checks the SHAPE the script depends on rather than a count, because a count
// was what made this fail on a delivery that had done nothing wrong.
const styleOpens = delivery.match(/<style\b[^>]*>/g) ?? [];
const panelStyles = styleOpens.filter((o) => !/\sid=["']sheet-only["']/.test(o));
check("the delivery has exactly one UNLABELLED <style> — the panel's", panelStyles.length === 1, styleOpens.join(" "));
check("…and every other <style> it has is labelled sheet-only",
  styleOpens.length - panelStyles.length === styleOpens.filter((o) => /sheet-only/.test(o)).length);
for (const forbidden of ['src="http', "href=\"http", "@import", "unpkg", "fonts.googleapis", "<script src", "<link"]) {
  check(`the delivery contains no ${forbidden}`, !delivery.includes(forbidden));
}
check("the delivery keeps its prefers-reduced-motion block", delivery.includes("prefers-reduced-motion"));

// ==============================================================================================
console.log("\n=== 2. the stylesheet is GENERATED from it and is not stale (D241) ===");
check("matic-panel.css matches the delivery's <style> block", panelCssIsCurrent(),
  "run: npm.cmd run panel:build");
check("the generated file says it is generated", panelCss.startsWith("/* GENERATED FILE - DO NOT EDIT."));
check("regenerating twice is stable", buildPanelCss() === buildPanelCss());
// The hand-written half is NOT allowed to redefine a DELIVERED token: the values are the design's
// to retune, and an override here would make the delivery a lie without changing a byte of it.
//
// ONE EXCEPTION, AND THE DELIVERY GRANTS IT IN WRITING. The re-export adopted the four
// `--matic-ui-live-*` names and declares them as PLACEHOLDERS, because Claude Design does not have
// `matic-avatar.css` and cannot know the values: *"Substitute the app's values, which are pinned
// to matic-avatar.css by a test. Only the roles are the delivery's."* So the app declares exactly
// those four and nothing else — and the check below reads the delivery's own words, so **the
// exception dies the moment the delivery stops calling them stand-ins** rather than outliving its
// reason as a hard-coded allow-list.
const STAND_INS = ["--matic-ui-live", "--matic-ui-live-deep", "--matic-ui-live-wash", "--matic-ui-live-edge"];
const uiTokensInPanel = new Set([...panelCss.matchAll(/(--matic-ui-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const uiTokensInApp = new Set([...appCss.matchAll(/(--matic-ui-[a-z0-9-]+)\s*:\s*[^;]/g)].map((m) => m[1]));
const redefined = [...uiTokensInApp].filter((t) => uiTokensInPanel.has(t) && !STAND_INS.includes(t));
check("the app stylesheet redefines no token the delivery declares, bar the stand-ins", redefined.length === 0,
  redefined.join(", ") || "app-only rules may USE a delivered token and may ADD new ones; they may not redefine one");
check("the delivery still calls the four live tokens stand-ins — the exception's only justification",
  /placeholders\.\s*Substitute\s*\n?\s*the app's values/.test(delivery) || /are placeholders/.test(delivery), "if this fails the exception above is no longer granted and must be removed");
check("…and the app substitutes all four, since the delivery cannot know them",
  STAND_INS.every((t) => uiTokensInApp.has(t)), STAND_INS.filter((t) => !uiTokensInApp.has(t)).join(", "));

// ==============================================================================================
console.log("\n=== 3. the token set: 35 names, and no collision with the avatar (acceptance 3) ===");
const uiTokens = new Set([...panelCss.matchAll(/(--matic-ui-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const avatarTokens = new Set([...avatarCss.matchAll(/(--matic-avatar-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
// 35 in September; 39 since the re-export adopted the four live names (§2 of the follow-ups).
// Pinned as a number because a token quietly disappearing unstyles things nothing else would catch.
check(`the delivery declares 39 --matic-ui-* tokens (found ${uiTokens.size})`, uiTokens.size === 39);
check("the four live names are the delivery's now, not the app's additions",
  STAND_INS.every((t) => uiTokens.has(t)), STAND_INS.filter((t) => !uiTokens.has(t)).join(", "));
for (const name of ["--matic-ui-ground", "--matic-ui-ink", "--matic-ui-accent", "--matic-ui-attn", "--matic-ui-font-head"]) {
  check(`${name} is present and unrenamed`, uiTokens.has(name));
}
// The app's live palette is the AVATAR's, copied by value (see matic-panel.app.css §d). Copied
// values drift silently, so the copy is pinned to its source here: a new avatar delivery that
// repaints the chassis fails this and the panel cannot go on wearing last month's blue.
const avatarValue = (name) => avatarCss.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1]?.trim();
for (const [uiToken, avatarToken] of [
  ["--matic-ui-live", "--matic-avatar-pod"],
  ["--matic-ui-live-deep", "--matic-avatar-collar"],
  ["--matic-ui-live-wash", "--matic-avatar-field"],
]) {
  const want = avatarValue(avatarToken);
  const got = appCss.match(new RegExp(`${uiToken}\\s*:\\s*([^;]+);`))?.[1]?.trim();
  check(`${uiToken} is still the avatar's ${avatarToken} (${want})`, Boolean(want) && got === want,
    `panel has ${got}, the avatar has ${want} - re-copy it or say why they differ`);
}
// Dark takes two steps up the same family rather than the same values; named so the pairing is
// findable, and checked only for presence, because the reason it differs is a legibility one.
for (const name of ["--matic-avatar-pod-inner", "--matic-avatar-eye-default"]) {
  check(`the dark live palette names its source ${name}`, appCss.includes(name));
}

const collisions = [...uiTokens].filter((t) => avatarTokens.has(t));
check("no --matic-ui-* name collides with a --matic-avatar-* name", collisions.length === 0, collisions.join(", "));
check("the panel declares no --matic-avatar-* token", !/--matic-avatar-[a-z0-9-]+\s*:/.test(panelCss));

// ==============================================================================================
console.log("\n=== 4. the end-user surface carries no developer control (acceptance 5) ===");
check("index.html links the generated stylesheet", indexHtml.includes('href="./panel/matic-panel.css"'));
check("index.html links the app stylesheet after it, so an app rule can win",
  indexHtml.indexOf('href="./panel/matic-panel.app.css"') > indexHtml.indexOf('href="./panel/matic-panel.css"'));
// The harness's rail: six scene buttons, three hub buttons, an inspector-variant switch. Their
// markup hook is `data-set="key:value"`, and its complete absence from the app is the check.
check("no data-set control anywhere in index.html", !indexHtml.includes("data-set="));
check("no scene switcher: the app never writes a scene other than first/live",
  [...rendererJs.matchAll(/dataset\.scene\s*=\s*"([a-z]+)"/g)].every((m) => m[1] === "live"));
check("data-scene starts at first", /data-scene="first"/.test(indexHtml));
check("no inspector-variant control: `variant` is written nowhere in the renderer",
  !/dataset\.variant/.test(rendererJs));
check("the inspector opens as overlay by default (acceptance 2)", /data-variant="overlay"/.test(indexHtml));
check("the inspector is hidden by default (acceptance 2)", /data-inspector="off"/.test(indexHtml));
// THE RE-EXPORT KEYED BOTH HALVES OFF `aria-expanded`, AND THAT IS BETTER THAN WHAT IT REPLACED.
// The September delivery keyed them off `data-set` — the harness's scene-switcher hook, which the
// app removed — so app.css had to re-key the wash onto `data-band-key`, and the first version of
// that missed the chevron entirely: a band opened with its only state indicator inert. Both now
// hang off the attribute the renderer already maintains for screen readers, **so the visual state
// and the announced state cannot disagree** — there is only one of them.
check("the open band's wash is keyed off aria-expanded, in the delivery",
  /\.band-trigger\[aria-expanded="true"\]\s*\{/.test(panelCss));
check("…and so is the chevron's rotation",
  /\.band-trigger\[aria-expanded="true"\] \.chev/.test(panelCss));
check("…and app.css no longer re-keys either of them", !/data-band-key/.test(appCss));
check("the renderer keeps aria-expanded true for the open band and false for the other",
  /setAttribute\("aria-expanded", String\(root\.dataset\.band === btn\.dataset\.bandKey\)\)/.test(rendererCode));
// Not a checkbox - both are `<button>` and the square beside the words is a decorative span. What
// the markup did lack is a disclosure state a screen reader can read.
check("the disclosure triggers are buttons, not inputs",
  /<button class="band-trigger" id="machineTrigger"/.test(indexHtml) && !/type="checkbox"/.test(indexHtml));
check("the disclosure state is announced, and kept in step by toggleBand",
  /id="machineTrigger"[^>]*aria-expanded="false"/.test(indexHtml)
  && /id="ticketsTrigger"[^>]*aria-expanded="false"/.test(indexHtml)
  && /setAttribute\("aria-expanded"/.test(rendererCode));
check("the inspector's payloads wrap rather than clip",
  /pre\s*\{[^}]*white-space:pre-wrap/.test(panelCss) && /pre\s*\{[^}]*overflow-x:hidden/.test(panelCss));

// ==============================================================================================
console.log("\n=== 5. our words do not reach the user (D240) ===");
//
// The old surface printed `idle`, `speaking`, `tier0`, `source: cloud`, `voice: piper 22050 Hz`
// and raw JSON at the person asking why their printer had stopped. Those strings still exist -
// in the inspector and the developer log - so the check is about WHERE they are written, not
// whether they appear in this file at all.
const surfaceWrites = [...rendererJs.matchAll(/\b(say|reply|note|said|why)\(\s*(["`][^"`]*["`])/g)].map((m) => m[2]);
const OURS = /\btier0\b|\bidle\b|\bspeaking\b|\bdeclining\b|\bescalating\b|\bapologising\b|\bnonce\b|\bspooler\b|\baudiosrv\b|\bdhcp\b|capabilityId|socialTemplate|piper/i;
for (const line of surfaceWrites) {
  const hit = line.match(OURS);
  check(`no internal vocabulary in a user-visible string: ${line.slice(0, 52)}…`, !hit, hit ? `says "${hit[0]}"` : "");
}
// ----------------------------------------------------------------------------------------------
console.log("\n--- 5a. no closed enum reaches the user as itself (D244) ---");
//
// `CATEGORY  needs_human_judgement` was on the review card: our enum, in snake_case, in front of
// an office worker. The fix is a GLOSS and not a deletion - the card is the payload view and D128
// requires the user to see what is being sent - so the checks are that every member of every enum
// that can reach the card has plain words, and that the raw value is still passed alongside.
const plainBlock = rendererJs.match(/const ESCALATION_PLAIN = \{[\s\S]*?\n\};/)?.[0] ?? "";
check("the panel has a plain-words table for the escalation enums", plainBlock.length > 0);
/** The plain words for one enum member, or undefined. Keys are bare identifiers in that literal. */
const plainFor = (member) => plainBlock.match(new RegExp(`\\b${member}:\\s*"([^"]+)"`))?.[1];
for (const member of [...ESCALATION_CATEGORIES, ...ESCALATION_OWNERS]) {
  const words = plainFor(member);
  check(`\`${member}\` has plain words on the card`, Boolean(words), "add it to ESCALATION_PLAIN");
  // A gloss that is still snake_case has glossed nothing. This is the check that would have
  // failed on 2026-09-10, and it is the one a new enum member trips.
  check(`\`${member}\`'s gloss is not the enum again`, !words || !/_/.test(words), `says "${words}"`);
}
check("the card passes the raw category alongside the gloss (D128: the user sees what is sent)",
  /glossed\("Category",\s*ESCALATION_PLAIN\.category\[[^\]]+\][^,]*,\s*draft\.category\)/.test(rendererCode));
check("the card passes the raw owner alongside the gloss",
  /glossed\("Goes to",[\s\S]{0,240}?queue=\$\{draft\.suggestedOwner\}/.test(rendererCode));
// The delivery draws `.raw` itself now — mono, a step down, under the plain words — so the app
// supplies the element and no longer carries a rule for it.
check("the raw value is rendered subordinate, never instead of the gloss",
  /cell\.append\(el\("div", "raw", raw\)\)/.test(rendererCode) && /^\.raw \{/m.test(panelCss));
check("…and it appears only when it says something the gloss did not",
  /if \(raw && raw !== value\)/.test(rendererCode));
check("the owner is no longer de-underscored by regular expression",
  !/suggestedOwner\.replace\(/.test(rendererCode));
// And the general form of it, over every string the renderer writes at the user.
for (const line of surfaceWrites) {
  const hit = line.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/);
  check(`no snake_case value in a user-visible string: ${line.slice(0, 52)}…`, !hit, hit ? `says "${hit[0]}"` : "");
}

// ----------------------------------------------------------------------------------------------
console.log("\n--- 5b. \"the hub\" is our name for it, and the user has another one (D246) ---");
//
// The panel says "the service desk" everywhere a person can read — the rail, the standing band,
// every persona line — and said "the hub" in three places: the review card's caveat, the tickets
// band's row, and the spoken line when filing failed. The last one also carried the URL.
//
// `el(tag, cls, text)` is the ONLY way this file puts a string in front of a user; the inspector is
// filled by `step()` onto elements that already exist, and the developer log by `devlog()`. So the
// third argument of every `el()` call is the surface, and it is checkable.
// Three shapes reach a person from this file, and all three are scanned: a literal third argument
// to `el()`, a ternary of two literals in that position (the tickets band picks its row's sentence
// that way), and a literal assigned to `.textContent` (the band notes). **What this cannot see is a
// string built at run time from a variable** - so it is a net, not a proof, and `surfaceWrites`
// above is the other half of it.
const elText = [
  ...[...rendererCode.matchAll(/\bel\(\s*"[a-z]+"\s*,\s*(?:"[^"]*"|`[^`]*`)\s*,\s*(["`])((?:(?!\1).)*)\1/gs)].map((m) => m[2]),
  ...[...rendererCode.matchAll(/\bel\(\s*"[a-z]+"\s*,\s*"[^"]*"\s*,[^)]*?\?\s*"([^"]*)"\s*:\s*"([^"]*)"/gs)].flatMap((m) => [m[1], m[2]]),
  // A whole `.textContent = …;` statement, then every literal in it - the band notes are a nested
  // ternary and only the first branch would be seen otherwise.
  ...[...rendererCode.matchAll(/\.textContent\s*=\s*([^;]+);/g)]
    .flatMap((m) => [...m[1].matchAll(/"([^"]{12,})"/g)].map((q) => q[1])),
];
// DELIBERATELY NOT SCANNED: object-literal values. Those are the INSPECTOR's payloads
// (`proposed(…, { note: "…a hub-side lookup is not built…" })`) and the `SOURCE_NOTE` table that
// feeds `devlog`, and both are where these words are supposed to be.
check(`every user-visible string this can see is found (${elText.length} of them)`, elText.length >= 24);
check("the tickets band's row sentence is in the scanned set", elText.some((s) => /Stored for the service desk/.test(s)));
check("the band notes are in the scanned set", elText.some((s) => /isn't connected to a service desk/.test(s)));
// "In this build" is NOT on this list, and that is a decision. It is jargon-adjacent, but it is the
// honest temporal qualifier D235/D242 chose, and `persona.tickets.some` says it in exactly the same
// words on purpose - the band and the spoken answer must not describe one ticket two ways. Changing
// it here would silently break that pairing.
const THEIRS = /\bhubs?\b|https?:\/\//i;
for (const s of elText) {
  const hit = s.match(THEIRS);
  check(`no internal name on the surface: "${s.slice(0, 48)}…"`, !hit, hit ? `says "${hit[0]}"` : "");
}
// The inspector and the developer log are where those words belong, and they still have them —
// this is a routing rule, not a ban.
check("`hub` still appears in the renderer, in the inspector and the developer log",
  /devlog\(`\[hub\]/.test(rendererCode) && /hub: "  \(sent to the hub/.test(rendererCode));

// ----------------------------------------------------------------------------------------------
// D249: this environment's own identifiers are SHOWN and never SAID. `spoken-form.js` holds the
// rule and `spoken-form.test.mjs` exercises its edge cases; what can only be checked here is the
// WIRING — that `say()` renders one string and speaks another, and that nothing else reaches the
// voice. **That last one is what makes "the funnel" true rather than asserted.**
check("the transcript gets the text as written", /async function say\(text[\s\S]{0,120}const box = reply\(text\);/.test(rendererCode));
check("the VOICE gets the redacted form", /window\.matic\.speak\(heard\)/.test(rendererCode) && !/window\.matic\.speak\(text\)/.test(rendererCode));
check("…computed from what the probe reported about this environment",
  /const heard = spokenForm\([a-z]+, spokenEnv\);/.test(rendererCode));

// ── D255: THE MARKERS COME OFF BEFORE ANY OF THAT, AND THE D249 LOG STILL MEANS WHAT IT SAYS ──
//
// The hub's answers are written by a model and models emit markdown: a real answer reached the
// screen as "…is \`Ctrl + Y\`." (found in Electron, §5.37). The panel may not fix that with
// `innerHTML` — D130 — so `model-prose.js` returns RUNS and the renderer builds a node per run.
//
// **The order matters and so does what the log line compares against.** Stripping runs first, so
// D249's redaction sees the sentence a person would read. And the log fires on
// `heard !== said` — if it compared against `text`, then ANY answer containing a backtick would
// announce a redaction that never happened, and a log line that cries wolf is worse than no line.
check("the spoken string has its markers removed before the D249 redaction runs",
  /const said = plainProse\(text\);[\s\S]{0,80}const heard = spokenForm\(said, spokenEnv\);/.test(rendererCode));
check("…and the D249 log compares against the STRIPPED string, not the original",
  /if \(heard !== said\) devlog/.test(rendererCode) && !/if \(heard !== text\) devlog/.test(rendererCode));
check("the reply builds nodes from runs rather than setting one string",
  /box\.append\(prose\("p", "", para\)\)/.test(rendererCode));
check("…and `prose` never reaches for innerHTML (D130)",
  /function prose\(tag, cls, text\)[\s\S]{0,400}?createTextNode/.test(rendererCode)
  && !/innerHTML/.test(rendererCode));
// The consent card is the one surface where verbatim is the whole guarantee. Only the model's own
// line may be transformed; the four `consentRendered` clauses are compared field for field on
// screen by the D130 click-through and must stay exactly as the broker retained them.
check("on the consent card ONLY the model's own clause goes through prose()",
  /\["Why this, here", proposal\.reasoning, true\]/.test(rendererCode)
  && /\["What you will notice", r\.notice, false\]/.test(rendererCode)
  && /modelWrote \? prose\("p", "", bodyText\) : el\("p", "", bodyText\)/.test(rendererCode));
// The delivery draws no inline treatment, for the same reason it drew no "JUST NOW" label: none of
// the strings it was given carried one. So the app draws it, in section (b), and says so.
// AND THE CASE NOTE IS NOT TRANSFORMED EITHER, for a stronger reason than the consent card's.
// It is model-written, so it is tempting - but the card labels it "Sent exactly as it reads." and
// D128 requires the user to see WHAT IS BEING SENT. The sent value is the raw string, so dropping
// a marker from the display would make the card's own promise false. A marker visible there is
// honest; a tidied one is not.
check("the review card's case note is shown verbatim, markers and all",
  rendererCode.includes('fixedProse("Case note", draft.summary, "Written by me. Sent exactly as it reads.")')
  && !rendererCode.includes('prose("p", "", draft.summary'));
check("the app draws the inline-code treatment the delivery has no rule for",
  /\.reply code\.code/.test(appCss) && /--matic-ui-font-mono/.test(appCss));
check("…using only delivered tokens, declaring none", !/^\s*--matic-ui-(?!live)/m.test(appCss.split("(c) the four live values")[0]));
check("`say()` is the only thing in the renderer that reaches the voice",
  [...rendererCode.matchAll(/matic\.speak\(/g)].length === 1);
check("all three identifiers are learned where the probe's facts arrive, so a re-read refreshes them",
  /function renderMachine\([\s\S]{0,300}rememberEnvironment\(facts\)/.test(rendererCode)
  && /machine: facts\?\.computer, user: facts\?\.user, addresses: \[facts\?\.ip, facts\?\.gateway\]/.test(rendererCode));
// The addresses are THIS machine's, not a pattern for anything address-shaped: a hub answer may
// legitimately say "try 8.8.8.8", and redacting that destroys the answer rather than protecting
// anyone. `spoken-form.test.mjs` asserts the behaviour; this asserts the renderer supplies literals.
check("…and the addresses handed to spokenForm are literals, never a pattern",
  !/addresses: \[.*RegExp/.test(rendererCode));
// THE ONE THE PROBE CANNOT SUPPLY. `renew_dhcp` exists to CHANGE the address, so the value in
// "this machine now has 10.0.0.42" is one `spokenEnv` has never seen — the single capability whose
// message is guaranteed to carry an address is the one the rule could not reach. `exec.detail` is
// broker-authored machine detail about this machine, so anything address-shaped in it is ours.
check("an address the broker just reported is learned from the execution result",
  /function learnAddressesFrom\(detail\)/.test(rendererCode)
  && /\^\\d\{1,3\}\(\\\.\\d\{1,3\}\)\{3\}\$/.test(rendererCode));
check("…and it is learned BEFORE anything says the result", (() => {
  const learn = rendererCode.indexOf("learnAddressesFrom(exec.detail)");
  const speak = rendererCode.indexOf("say(exec.message", learn);
  return learn > 0 && speak > learn;
})());
check("…from the broker's detail, not from a re-probe that may not have caught up",
  /learnAddressesFrom\(exec\.detail\)/.test(rendererCode));
// The digits stay ON SCREEN. `probe.test.mjs` asserts the APIPA phrase "still shows the address,
// rather than hiding it", and that assertion has a hardware finding behind it.
check("the broker's message is NOT rewritten to hide the address",
  !/exec\.message\.replace/.test(rendererCode));
// BEHAVIOURAL SINCE D258. The band's rows moved out of `renderer.js` into a pure module when
// Claude Design's grouped band landed, so this drives that module rather than pattern-matching
// renderer source — the same three facts, checked against what a user is actually shown.
check("all three are still SHOWN, on the surfaces that carry them", (() => {
  const rows = machineBandGroups({
    identity: { computer: "OLD-FIN-LON-0442", user: "CORP\\a.petrova" },
    summary: { online: "yes", adapter: "Fake Gigabit", ip: "10.0.0.42", gateway: "10.0.0.1",
      spooler: "RUNNING", audio: "RUNNING", dhcp: "RUNNING" },
    restart: { boot: { uptimeMs: 2 * 86400000 }, memory: { commitUsedFraction: 0.4 } },
    volumes: [],
  }).flatMap((g) => g.rows);
  const value = (label) => rows.find((r) => r.label === label)?.value;
  return value("This computer") === "OLD-FIN-LON-0442"
    && value("Signed in as") === "CORP\\a.petrova"
    && value("This machine's address") === "10.0.0.42";
})(), "shown is the half D249 keeps — all three must still reach the band verbatim");
// The re-export folds the machine and the account into one row of the review card, which is how it
// drew them: one line of identity, with the hint under it carrying D215's self-asserted caveat.
check("…and the review card still carries both, in the row the delivery drew for them",
  /\$\{draft\.machineName \?\? "-"\} · \$\{r\.osUsername \?\? "unknown"\}/.test(rendererCode)
  && /self-asserted — not authenticated/.test(rendererCode));
// D249 item 3, and it is SHOWN rather than spoken, which is why D247's sweep did not catch it.
//
// PINNED AS PROPERTIES, NOT AS PHRASING. The first version of these assertions matched the sentence
// verbatim and broke the moment it was shortened — the third time in this session that a check was
// written against the words instead of the contract, which is what CLAUDE.md's rule about
// `escalationReply` already says not to do.
const crashNote = rendererCode.match(/catch \(err\) \{[\s\S]{0,400}?note\("([^"]*)",\s*\{ unknown: true \}\)/)?.[1] ?? "";
check("the panel's own crash note exists and is flagged `unknown`", crashNote.length > 0, crashNote);
check("…it carries no JavaScript exception", !/\$\{err/.test(rendererCode.match(/note\("[^"]*", \{ unknown: true \}\)/)?.[0] ?? "") && !/err\.message\}`?, \{ unknown/.test(rendererCode));
check("…it says the turn stopped", /stopped|went wrong|didn't finish/i.test(crashNote), crashNote);
check("…and it says the outcome is UNKNOWN, which is the half that must survive",
  /don't know|do not know|unknown|can't tell/i.test(crashNote), crashNote);
check("…in the panel's own words: no \"turn\", which is ours for a conversational exchange",
  !/\bturn\b/i.test(crashNote), crashNote);
check("…and short enough to read at a glance", crashNote.split(/\s+/).length <= 16, `${crashNote.split(/\s+/).length} words`);
check("the exception still reaches the developer log, in full", /devlog\(`\[panel\] \$\{err\.stack \?\? err\.message\}`\)/.test(rendererCode));

// D247: the renderer must not interpolate a BROKER diagnostic into speech either. Those strings
// name capability ids, adapter GUIDs, Win32 control masks and the Service Control Manager.
check("the broker's gate message is not spoken", !/say\([^)]*validation\.errors/.test(rendererCode));
check("…and it is still shown, one line up, in the inspector", /checked\(validation\.ok[\s\S]{0,200}validation\.errors\.join/.test(rendererCode));
check("the broker's prepareConsent error is not spoken", !/say\([^)]*prepared\.error/.test(rendererCode));
check("…and it goes to the inspector and the developer log",
  /consented\("The broker refused[\s\S]{0,80}error: prepared\.error/.test(rendererCode)
  && /devlog\(`\[broker\] prepareConsent refused/.test(rendererCode));
// `??` only falls back on null/undefined, so an empty `reasoning` from a provider spoke silence.
check("an empty reply falls back to a sentence rather than to silence",
  !/say\(replyText \?\?/.test(rendererCode) && /say\(replyText \|\|/.test(rendererCode));

console.log("\n--- 5 (continued) ---");
check("the state label is gone from the surface", !indexHtml.includes('id="state"'));
check("the voice pill is gone from the surface", !indexHtml.includes('id="voicePill"'));
check("the avatar's refusals go to the developer log, not to a label",
  /statechange[\s\S]{0,400}devlog\(/.test(rendererJs));

// ==============================================================================================
console.log("\n=== 6. the honesty rules the redesign must not have loosened (handover §5) ===");
// D130: the broker's text is DISPLAYED, never authored here. The card's strings come from
// `request.rendered`, and every one of them is assigned as text, not built from parts.
check("the consent card renders the broker's title verbatim", /el\("b", "", r\.title\)/.test(rendererJs));
check("the consent card renders the broker's `what` verbatim", /el\("p", "", r\.what\)/.test(rendererJs));
// D247: still verbatim, and now carrying a class so it can be set apart. The text is untouched —
// `el(tag, cls, text)` puts `r.detail` in as textContent exactly as before.
check("the consent card renders the broker's `detail` verbatim", /el\("div", "raw", r\.detail\)/.test(rendererCode));
// The re-export gives it a labelled row of its own rather than a paragraph in the prose, so the
// treatment is the DELIVERY's now and app.css carries nothing for it.
check("…in the labelled row the delivery drew for it, not as a paragraph of prose",
  /el\("div", "consent-call"\)/.test(rendererCode) && /el\("div", "tr-label", "Exactly what runs"\)/.test(rendererCode)
  && /^\.consent-call \{/m.test(panelCss));
check("…and app.css no longer restyles a delivered paragraph", !/consent-verbatim p/.test(appCss));
// D248 IS RATIFIED AND BUILT (2026-09-11). The gloss is drawn — and the assertions that matter are
// about WHERE THE SENTENCE COMES FROM, because the whole reason this waited for a decision is that
// the renderer is not allowed to author it.
check("D248's gloss is drawn, in the class the delivery drew for it",
  /\.call-gloss/.test(panelCss) && /el\("div", "call-gloss", r\.detailPlain\)/.test(rendererCode));
check("…from the broker's field, never assembled in the renderer",
  /r\.detailPlain/.test(rendererCode)
  && !/detailPlain\s*=|detailPlain\s*\+|serviceNames/.test(rendererCode),
  "the sentence is catalog text the broker assembled — D130 forbids the renderer writing it");
check("…ABOVE the exact call, which stays subordinate by position", (() => {
  const cell = rendererCode.match(/const cell = el\("div"\);[\s\S]*?verbatim\.append\(call\);/)?.[0] ?? "";
  return cell.indexOf("call-gloss") > 0 && cell.indexOf("call-gloss") < cell.indexOf('"raw", r.detail');
})());
check("…and a null gloss draws no element at all, not an empty row",
  /if \(r\.detailPlain\) cell\.append/.test(rendererCode));
// The exact call itself is untouched: D130's verbatim rule, and the field the D130 click-through
// compares on screen. A gloss that replaced it would be hiding the disclosure D244 refused to hide.
check("the exact call is still rendered verbatim beneath the gloss",
  /el\("div", "raw", r\.detail\)/.test(rendererCode) && !/r\.detail\.replace|r\.detail\.slice/.test(rendererCode));
check("nothing in the renderer builds consent text from the catalog",
  !/catalog/i.test(rendererCode) && !/listCapabilities/.test(rendererCode));
check("the renderer never uses innerHTML (D130's verbatim rule, mechanically)",
  !/innerHTML/.test(rendererCode));

// D86/D213: a filed ticket has reached nobody, and the surface says so. PINNED AS FACTS, NOT AS
// PHRASING - the wording changed on 2026-09-10 when "the hub" came off the surface (D246), and an
// assertion that breaks on a rewording is pinning the wrong thing.
// Built from parts since the re-export, because the delivery bolds the load-bearing clause — so
// this reads the whole block back rather than one string literal. The assertions below are
// unchanged: they were already pinned to the FACTS, after being written against the words twice.
const caveat = rendererCode.match(/const caveat = el\("div", "tr-caveat"\);[\s\S]{0,400}?caveat\.append\(p\);/)?.[0] ?? "";
const bandRow = elText.find((s) => /No email went out/.test(s)) ?? "";
// D244/D245: ONCE, though. The card is shown BEFORE the user agrees, so the card is where the fact
// lives; the post-send line carries the reference and nothing the card already said. Both halves
// of this matter - deleting it from the card too would re-open D86/D213.
check("the review card still carries the no-email fact, in full, before the user agrees",
  /\bstored\b/i.test(caveat) && /no email/i.test(caveat) && /nobody is alerted/i.test(caveat), caveat);
check("a filed ticket's row in the band says the same thing in the past tense",
  /\bstored\b/i.test(bandRow) && /no email/i.test(bandRow) && /nobody was alerted/i.test(bandRow), bandRow);
check("neither of them says it in our words", !/\bhub\b/i.test(caveat) && !/\bhub\b/i.test(bandRow));
check("an unknown filing outcome is stated as unknown, not as a failure",
  /filed\.filed === null/.test(rendererJs) && /unknown/.test(rendererJs));
const postSend = rendererCode.match(/if \(!filed\.notified\) note\((`[^`]*`)/)?.[1] ?? "";
check("the post-send line exists and names the reference", /\$\{filed\.reference\}/.test(postSend));
check("the post-send line does not restate the no-email fact in a second wording",
  Boolean(postSend) && !/email|notif|alert/i.test(postSend), postSend);
// The delivery sets a reference in mono, because a string somebody has to quote back is one they
// read character by character.
check("…and the reference in it is marked as one, for the delivery's mono treatment",
  /note\(`Stored as \$\{filed\.reference\}[^`]*`, \{ ref: filed\.reference \}\)/.test(rendererCode)
  && /^\.turn-note \.ref \{/m.test(panelCss));

// ── THE CARD CANNOT SAY "SENT" BEFORE THE HUB HAS ANSWERED (2026-09-11) ──────────────────────
//
// It did until this was written. `reviewTicket()`'s send handler wrote "Sent by you" into the card
// head on the click, before `fileTicket()` had been called, so a filing that then failed left the
// card claiming it had been sent — on the one screen in this product where a user approves data
// leaving the machine, and beside a transcript line saying nothing was filed. Same class as
// 700d920 (two surfaces describing one thing differently), one turn later.
//
// PINNED AS THE CONTRACT, NOT THE WORDS: the click must not write an outcome, the outcome must be
// written from the caller's `filed`, and the caller must report on BOTH branches before it speaks.
const sendHandler = rendererCode.match(/send\.onclick = \(\) => \{[\s\S]*?\n {4}\};/)?.[0] ?? "";
check("the send handler exists to read", Boolean(sendHandler));
// WHAT RUNS ON THE CLICK is everything before `resolve`. The `report` callback is DEFINED inside
// the handler but runs later, with the hub's answer, so the two are read separately — reading the
// whole handler for "Sent by you" finds `report`'s own string and passes on the defect it exists
// to catch.
const onClickNow = sendHandler.split("resolve({")[0];
check("clicking send does NOT write an outcome into the card head",
  Boolean(onClickNow) && !/Sent by you/.test(onClickNow), onClickNow);
check("…it resolves with a `report` the caller must call with the hub's answer",
  /report: \(filed\) => \{/.test(sendHandler));
check("…and the outcome is derived from `filed`, which only the caller has",
  /filed\?\.ok \? "Sent by you"/.test(rendererCode));
// D213's third outcome. A timeout is not a failure and not a success, and the card must not pick
// one: the request went out and nothing came back.
check("a timed-out filing is neither 'sent' nor 'not sent' on the card",
  /filed\?\.filed === null \? "Sent, not confirmed"/.test(rendererCode));
check("the caller reports the outcome BEFORE either branch speaks",
  /const filed = await window\.matic\.fileTicket\(approved\);[\s\S]{0,700}?report\(filed\);[\s\S]{0,40}if \(filed\.ok\)/.test(rendererCode));
check("…and it destructures the card's two-part result rather than the old bare draft",
  /const \{ approved, report \} = await reviewTicket\(res\.ticketDraft\);/.test(rendererCode));
// A cancel has no outcome to report, and the caller must not have to know that before calling.
check("a cancelled card resolves with a report that does nothing",
  /resolve\(\{ approved: null, report: \(\) => \{\} \}\)/.test(rendererCode));
// D245: the card's note is about the DECISION and the head is about the TICKET. The transcript's
// own "Nothing was filed" line is the system's half and is the caller's to write — one fact, one
// surface. So the note the click leaves behind must survive all three outcomes without lying.
const sendNote = onClickNow.match(/answered\("([^"]*)"/)?.[1] ?? "";
check("the note left by the click claims no outcome",
  Boolean(sendNote) && !/\bsent\b/i.test(sendNote) && !/filed|stored|reached/i.test(sendNote), sendNote);
// THE SAME SPLIT ON THE CANCEL PATH, and the defect there was found by cancelling the card rather
// than by reading it (2026-09-11). The card's note said "Cancelled by you — nothing was sent." and
// the caller's said "Cancelled — nothing left this machine." three lines below, with the card still
// on screen: one fact about what the system did not do, in two wordings, adjacent. D245's own shape.
const cancelHandler = rendererCode.match(/cancel\.onclick = \(\) => \{[\s\S]*?\n {4}\};/)?.[0] ?? "";
const cancelNote = cancelHandler.match(/answered\("([^"]*)"/)?.[1] ?? "";
const cancelSystemNote = rendererCode.match(/note\("(Cancelled[^"]*)"\)/)?.[1] ?? "";
check("both halves of the cancel path exist to compare", Boolean(cancelNote) && Boolean(cancelSystemNote));
check("the card's cancel note is the DECISION and states no system fact",
  Boolean(cancelNote) && !/\bsent\b|left this machine|filed/i.test(cancelNote), cancelNote);
check("the transcript's cancel note is the SYSTEM's half and keeps it",
  /left this machine|nothing was sent|nothing was filed/i.test(cancelSystemNote), cancelSystemNote);

// D246: a failed filing has two strings with two audiences. `filed.error` is the assistant's
// sentence and is spoken; `filed.detail` is the URL, the status and the exception, and it goes to
// the inspector and the developer log. The renderer must not put the second one on the surface.
check("the failed-filing branch speaks `error` and never `detail`",
  /say\(filed\.error, "error"\)/.test(rendererCode) && !/say\(filed\.detail/.test(rendererCode));
check("`detail` reaches the inspector", /done\("The ticket could not be sent\.", \{ error: filed\.error, detail: filed\.detail/.test(rendererCode));
check("`detail` reaches the developer log", /devlog\(`\[ticket\] filing failed: \$\{filed\.detail/.test(rendererCode));
// D245/D247: the `needsBroker` branch is the other place a spoken line sits directly above a note.
// The note explains; the spoken line must not explain it again in different words.
const needsBrokerNote = rendererCode.match(/note\("(That needs the privileged half[^"]*)"\)/)?.[1] ?? "";
check("the needs-privilege note is the one that explains it", /privileged half/.test(needsBrokerNote));
check("…and the renderer speaks the broker's short line rather than restating the note",
  /exec\.needsBroker[\s\S]{0,400}say\(exec\.message, "idle"\)[\s\S]{0,120}note\("That needs the privileged half/.test(rendererCode));

// D245 again, on this path: the spoken line and the note beside it divide the two halves. The
// timeout fact used to be stated twice, three lines apart, in two wordings.
check("the note states what it means for the ticket, which is the half that must survive",
  /whether the ticket was stored is unknown/.test(rendererCode) && /"Nothing was filed\."/.test(rendererCode));
const checkPage = readFileSync(join(PANEL, "panel-check.html"), "utf8");
check("the check page can actually drive the failed-filing branch",
  /data-filing="unreachable"/.test(checkPage) && /data-filing="timeout"/.test(checkPage));
// D247: and the three ways an APPROVED fix comes back other than done. The bridge returned success
// and only success until 2026-09-10, so none of them had ever been rendered.
check("…and the three failed-fix branches, all of which are spoken",
  ["failed", "denied", "expired"].every((m) => checkPage.includes(`data-fix="${m}"`)));
// The fake bridge reads the REAL persona lines rather than carrying copies, or it keeps passing on
// the day the real ones change.
check("the fake bridge reads persona.json rather than copying the sentences",
  /fetch\("\.\.\/\.\.\/router\/persona\.json"\)/.test(readFileSync(join(PANEL, "panel-check-bridge.js"), "utf8")));

// D244: the idle status cannot be read as a claim about this machine's services. "Nothing running"
// sat a few centimetres from a band listing them.
check("the idle status says nothing that reads as a machine state",
  indexHtml.includes("Nothing in progress") && !/>Nothing running</.test(indexHtml));

// D244: entering `unreachable` announces itself in the conversation once, and says the same thing
// the standing band and agent.js say. `persona.fallback.hubUnreachable` is agent.js's wording.
const transition = rendererCode.match(/s\.state === "unreachable"\) \{\s*note\((`[^`]*`)/)?.[1] ?? "";
check("entering unreachable produces one message in the conversation", Boolean(transition));
check("it names both halves of what was lost, as the band and agent.js do",
  /guidance/.test(transition) && /service desk/.test(transition), transition);
check("it does not promise a queue: nothing is held while the hub is away",
  !/\bwait\b|\bqueue/i.test(transition), transition);
check("it does not apologise - a limit is not a fault", !/sorry|afraid|apolog/i.test(transition));

// ── EVERY STRING THAT DESCRIBES THE CONNECTION STATE NAMES BOTH HALVES ────────────────────────
//
// The assertion above says the loss note names both "as the band and agent.js do" — and when the
// ELECTRON click-through was finally run (2026-09-11) neither of the other two did. Two strings had
// been missed by D244's sweep and nothing failed, because each was pinned on its own:
//
//   · `persona.fallback.hubUnreachable` — the reply a QUESTION gets while the hub is away. It said
//     only "the service desk", and the question that lands here is very often exactly the kind the
//     GUIDANCE would have answered.
//   · the recovery note — "The service desk is reachable again." So a user watched two things go
//     and one come back, directly under a band that names both.
//
// Enumerated rather than pinned one at a time, so a new connectivity string joins the list or is
// missing from it. **Scoped to strings about the STATE**, which is why the exclusions below are
// named rather than implied: `persona.filing.*` and `fallback.hubNoAnswer` describe an ACTION
// against the service desk, and naming the guidance in those would be wrong, not generous.
const persona = JSON.parse(readFileSync(new URL("../src/router/persona.json", import.meta.url), "utf8"));
const recovery = rendererCode.match(/lastHubState === "unreachable"\) \{[\s\S]{0,600}?note\("([^"]*)"/)?.[1] ?? "";
const CONNECTION_STATE_STRINGS = [
  ["the loss note", transition],
  ["the recovery note", recovery],
  ["the degraded reply (persona.fallback.hubUnreachable)", persona.fallback.hubUnreachable],
  // The rail has SEVERAL hub-unreachable elements: the heading ("Ready, with limits") is a status
  // word and names nothing, which is right. The line that describes the STATE is the service-detail.
  ["the rail's unreachable detail", (indexHtml.match(/service-detail hubcopy hub-unreachable">([^<]*)/) ?? [])[1] ?? ""],
  ["the standing band", (indexHtml.match(/I can't reach your company's guidance[^<]*/) ?? [])[0] ?? ""],
];
for (const [what, sentence] of CONNECTION_STATE_STRINGS) {
  check(`${what} exists to check`, Boolean(sentence), what);
  check(`…and it names BOTH the company's guidance and the service desk`,
    /guidance/i.test(sentence) && /service desk/i.test(sentence), `${what}: ${sentence.slice(0, 130)}`);
}
// The named exclusions, asserted so that "it only says service desk" stays a DECISION here rather
// than becoming the next thing a sweep misses.
check("a FILING failure names only the service desk, because filing is a service-desk action",
  Object.values(persona.filing).filter((v) => typeof v === "string" && /guidance/i.test(v)).length === 0);
check("…and so does hubNoAnswer: if the hub answered at all, nothing was unreachable",
  !/guidance/i.test(persona.fallback.hubNoAnswer));

// D205 / v7: a decline is a result. No error styling, no apology layout, and the face says so.
check("the KB decline drives `declining`, not `error`",
  /if \(answered\)[\s\S]*?setState\("declining"\);[\s\S]{0,120}?say\(res\.reply, "declining"\)/.test(rendererCode));
check("the escalation OFFER is `declining` too, and never `escalating` (D232)",
  /res\.escalation[\s\S]*?setState\("declining"\)[\s\S]{0,200}?say\(res\.reply, "declining"\)/.test(rendererCode));
check("`escalating` is reserved for a ticket that exists and has a reference",
  /filed\.ok[\s\S]{0,400}?setState\("escalating"\)/.test(rendererCode));
check("no error colour is reachable from a decline: the app stylesheet defines no red",
  !/#(e|f)[0-9a-f]{2}[0-3][0-9a-f]{3}/i.test(appCss.replace(/\/\*[\s\S]*?\*\//g, "")));

// 700d920: the panel and the reply must describe one hub state the same way.
check("the panel's three hub states are the delivery's three",
  ["hub-ok", "hub-unreachable", "hub-none"].every((c) => indexHtml.includes(c) && delivery.includes(c)));
check("the renderer maps D49's states onto them and invents no fourth",
  /reachable" \? "ok" : [\s\S]{0,60}"unreachable" : "none"/.test(rendererJs));
// THE DELIVERY IS A CONTACT SHEET OF ONE STATE PER SURFACE, so it carries the unreachable band and
// not the no-service one. The rule is unchanged — the panel and the spoken reply must describe one
// connection state the same way (700d920) — but it can only be checked against the delivery for the
// sentences the delivery actually draws.
const DEGRADED = [
  ["I can't reach your company's guidance or the service desk at the moment", true],
  ["There's no company guidance or service desk connected here", false],
];
for (const [sentence, inDelivery] of DEGRADED) {
  check(`the app carries the standing sentence: "${sentence.slice(0, 44)}…"`, indexHtml.includes(sentence));
  if (inDelivery) check("…and it is the delivery's, word for word", delivery.includes(sentence));
}
check("the no-service sentence is the app's alone, because the sheet draws one state",
  !delivery.includes("There's no company guidance"), "if the delivery gains it, pin it too");

// ==============================================================================================
console.log("\n=== 7. the tickets band says what it is, and what it is not (D242, RATIFIED 2026-09-11; REVISED by D288, PROPOSED 2026-09-12) ===");
//
// D242 was built REVERSIBLY and waited for Charles: if the answer had been no, the trigger and
// markup came out of `index.html`. The answer is yes, so the band is permanent — and these
// assertions are what ratification buys. Three of D242's clauses were true only by inspection
// before; they are mechanical now.
//
// D288 (P4, 2026-09-12) REVISES THREE OF D242's CLAUSES, AND THE PINS BELOW SAY WHICH. D242 said
// the band cannot become a status view because a hub-side lookup "needs a route and a user identity
// that do not exist". Both exist now: GET /v1/tickets (D284) keyed by the enrollment credential
// (D282), the identity D54/D68 asked for - NOT the self-asserted osUsername D242 refused. So the
// rows carry the hub's state and the desk's last write WHEN THE LAST POLL SAW THE HUB, and fall back
// to D242's words when it did not. What D242 protected is kept and pinned: a row shows a status ONLY
// when the hub actually said it, "no lookup" is said in the pre-P4 words whenever it is true, the
// band and the spoken answer share one vocabulary (now a module, not a shared clause), and the
// renderer gates nothing on `canQueryHub`. Charles has not ratified D288; these pins are what he is
// ratifying or reverting.
check("the band exists", indexHtml.includes("band-tickets"));
check("the band is fed by the local read; the hub's view rides on the same payload as `hub` (D288), not a second channel", /ticketsFiled\(\)/.test(rendererJs) && /const hub = status\?\.hub \?\? null;/.test(rendererCode));
check("a status is shown ONLY when the poll's own verdict is ok: `known` is null otherwise, and the row branches on the ROW, never on canQueryHub", /const known = hub && hub\.basis === "ok" && hub\.tickets \? hub\.tickets : null;/.test(rendererCode) && /const h = known\?\.\[t\.reference\] \?\? null;\s*if \(h\) \{/.test(rendererCode));
check("an empty band says why it is empty rather than showing nothing",
  /I haven't filed any tickets from this machine/.test(rendererJs));
check("a build that cannot file says so instead of showing an empty list",
  /isn't connected to a service desk/.test(rendererJs));

// (1) EVERY ROW WITHOUT A HUB VIEW CARRIES BOTH PHRASES, which is what stops the band reading as a
// status view when it is not one. They are drawn as a matched pair — the delivery's own note says
// neither can be dropped without the row looking broken — so both are pinned rather than just the
// one. D288: the pair is the ELSE branch of "did the hub say something about this ticket"; the IF
// branch draws the hub's words from the shared module, in the delivery's own `.tstat b` classes.
check("every row without a hub view says \"Filed from here\"", /el\("b", "", "Filed from here"\)/.test(rendererCode));
check("…and \"Progress not visible\" beside it", /el\("span", "", "Progress not visible"\)/.test(rendererCode));
check("…as one matched pair in the same element, in the else branch", /\} else \{\s*stat\.append\(el\("b", "", "Filed from here"\), el\("span", "", "Progress not visible"\)\);/.test(rendererCode));
check("a row WITH a hub view draws stateWords/stateClass/stateDetail from src/ticket/state-words.js and nothing inline (D288)",
  /el\("b", stateClass\(h\.state\), stateWords\(h\.state\)\)/.test(rendererCode) && /el\("span", "", stateDetail\(h\)\)/.test(rendererCode)
  && /import \{ stateWords, stateClass, stateDetail, updateLines \} from "\.\.\/ticket\/state-words\.js";/.test(rendererJs));
check("…and the spoken answer imports its state words from the SAME module, so the band and the voice cannot describe one ticket two ways",
  /import \{ stateSpoken, agoWords \} from "\.\.\/ticket\/state-words\.js";/.test(readFileSync(join(RENDERER, "..", "router", "social.js"), "utf8")));
check("…the renderer never glosses a hub state by name itself", !/"resolved"\s*\?|=== "resolved"|=== "closed"|case "open"/.test(rendererCode.slice(rendererCode.indexOf("function renderTickets"), rendererCode.indexOf("function applyTicketUpdate"))));

// (2) THE PAIRING WITH THE SPOKEN ANSWER, MADE MECHANICAL. D242 requires the band's note to say the
// limit "in the same words `persona.tickets.some` speaks", so the band and the spoken answer cannot
// describe one ticket two ways. Until ratification that was two independent regexes, either of
// which could have gone on passing while the other string was edited. Now the shared clause is
// extracted from the persona file and looked for in the renderer.
{
  const spoken = persona.tickets?.some ?? "";
  const CLAUSE = "checking a ticket's progress with the service desk isn't something I can do in this build";
  check("the persona's spoken answer carries the limit clause", spoken.includes(CLAUSE), spoken.slice(0, 80));
  check("…and the band's note carries THE SAME clause, character for character",
    rendererJs.includes(CLAUSE),
    "if this fails, the band and the voice have started describing one ticket two ways");
  // The other half of the pairing: the band must not invent a second vocabulary for the same fact.
  check("…and the band does not also say it a second, different way",
    (rendererJs.match(/can't see how they're getting on/g) ?? []).length === 3,
    "three since 2026-09-13: the not-known note, and the two notes for rows the desk cannot match - all the SAME words, which persona.tickets.notListed/noneListed also use");
}

// (3) THE LOOKUP EXISTS NOW (D284/D288) AND IS KEYED ON THE CREDENTIAL, NOT THE OS USERNAME. What
// D242 protected here was the back door - a lookup keyed on the self-asserted `osUsername` - and
// that stays shut: the renderer sends no identity at all (the poll is main's, the credential is
// HubClient's). `canQueryHub` is still disclosed, not acted on: the renderer branches on the hub
// row it was handed, never on the flag, and main derives the flag from the watch's last poll rather
// than writing a literal.
check("`canQueryHub` is disclosed, not acted on: it never gates anything in the renderer",
  !/if\s*\([^)]*canQueryHub|canQueryHub\s*(?:\?|&&|\|\|)|!canQueryHub/.test(rendererCode),
  "the moment it gates a branch, the band has a status view behind a flag");
check("…and the main process DERIVES it from the watch's last poll - never a literal true (D288)",
  /canQueryHub: ticketWatch\?\.canQuery \?\? false/.test(readFileSync(join(RENDERER, "..", "main", "main.js"), "utf8"))
  && !/canQueryHub: true/.test(readFileSync(join(RENDERER, "..", "main", "main.js"), "utf8")));
check("the renderer sends the hub NO identity: no osUsername, no user name, leaves the renderer on a ticket channel",
  !/ticketsFiled\([^)]+\)|ackTicketEntries\([^)]*(osUsername|user)/.test(rendererCode));
check("the preload's ticket channels are file, filed and ack - and ack carries entry ids, which stamp a time on the hub, never words (D287)", (() => {
  const pre = readFileSync(join(RENDERER, "..", "main", "preload.cjs"), "utf8");
  const ticketChannels = [...pre.matchAll(/invoke\("(ticket:[^"]+)"/g)].map((m) => m[1]);
  return ticketChannels.every((c) => c === "ticket:file" || c === "ticket:filed" || c === "ticket:ack") && /ackTicketEntries: \(entryIds\)/.test(pre);
})(), "a channel that carries the requester's WORDS to the hub is the composer, and that is Claude Design's view, not this build");
// D288's own rule: the update is SHOWN, never spoken (Charles, 2026-09-12), and the line does not
// offer an action this window cannot take.
{
  const fn = rendererCode.slice(rendererCode.indexOf("async function applyTicketUpdate"), rendererCode.indexOf("window.matic.onTicketUpdate"));
  check("applyTicketUpdate() exists and is registered on the push", fn.length > 50 && /window\.matic\.onTicketUpdate\(applyTicketUpdate\);/.test(rendererCode));
  check("…it shows (note) and never speaks (no say/setState) - show only; the LINES come from updateLines(), which folds a state change into the resolution that explains it (D245, 2026-09-13 finding)", /for \(const line of updateLines\(u\.entries, u\.reference, u\.state\)\)/.test(fn) && /note\(line, \{ label: "Just now", ref: u\.reference \}\)/.test(fn) && !/\bsay\(|setState\(/.test(fn));
  check("…and it acknowledges exactly the entries it showed, then redraws the band", /ackTicketEntries\(u\.entries\.map\(\(e\) => e\.id\)\)/.test(fn) && (fn.match(/renderTickets\(await window\.matic\.ticketsFiled\(\)\)/g) ?? []).length === 2);
}

// (4) ALL THREE NOTE BRANCHES EXIST AND SAY DIFFERENT THINGS. "no news" where the truth is "no
// lookup" is the worse outcome D242 names by a distance, so the empty case and the cannot-file case
// must not collapse into each other.
{
  const note = rendererCode.match(/ticketsNote\.textContent =[\s\S]*?;/)?.[0] ?? "";
  const branches = [...note.matchAll(/"([^"]{30,})"/g)].map((m) => m[1]);
  check(`the note has six distinct branches (${branches.length} found) - D288 added the known one; the 2026-09-13 Electron run added two more, for when the hub lists only SOME or NONE of the filed rows`, branches.length === 6);
  check("…and none of them is a duplicate", new Set(branches).size === branches.length);
  check("…the cannot-file one says there is nothing to look up",
    branches.some((b) => /nothing to look up/.test(b)));
  check("…the empty one says a ticket raised elsewhere will not show",
    branches.some((b) => /won't show here/.test(b)));
  check("…the known one says when it was checked, how often, and that nothing is emailed (D86)",
    branches.some((b) => /when I last checked/.test(b) && /every minute or so while I'm on screen/.test(b) && /nothing is sent to you by email/.test(b)));
  check("…the fully-known one is chosen by `known && listed === filed.length`, the mixed one by `listed > 0`, the none-listed one by `known` alone, the not-known one by its absence - so the note describes the ROWS it sits under, not the poll that ran (2026-09-13 finding)",
    /: known && listed === filed\.length\s*\? "This is what I sent from this machine, with what the service desk showed/.test(note) && /: known && listed > 0\s*\? "This is what I sent from this machine\. The ones with a status/.test(note) && /: known\s*\? "This is what I sent from this machine\. The service desk can't match any of these/.test(note)
    && /const listed = known \? filed\.filter\(\(t\) => known\[t\.reference\]\)\.length : 0;/.test(rendererCode));
  {
    // The clause the band and the VOICE share for a ticket the desk cannot match - D242's pairing
    // rule applied to the new fact, the same way the limit clause is matched below.
    const shared = "filed before this machine was enrolled with the service desk";
    check("the persona's notListed and noneListed lines carry the shared clause", (persona.tickets?.notListed ?? "").includes(shared) && (persona.tickets?.noneListed ?? "").includes(shared));
    check("…and the band's mixed and none-listed notes carry THE SAME clause, character for character", branches.filter((b) => b.includes(shared)).length === 2);
  }
  check("…and none of the six claims a status the hub did not say",
    !branches.some((b) => /\b(in progress|being worked|assigned|open|closed|resolved)\b/i.test(b)), branches.join(" | "));
}

// (5) THE TRIGGER NAMES WHAT THE ENDPOINT KNOWS — what it FILED, never a status. It read "Tickets
// you've opened" in the September delivery, which claims knowledge of tickets raised anywhere.
check("the trigger says these are the ones filed FROM THIS MACHINE",
  /Tickets I've filed from this machine/.test(indexHtml));
check("…and does not claim to know about tickets opened elsewhere",
  !/Tickets you've opened|your tickets|all your tickets/i.test(indexHtml));

// ==============================================================================================
console.log(`\n${"=".repeat(94)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(94)}`);
if (fail) process.exit(1);
