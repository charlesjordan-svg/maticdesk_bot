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
check("the delivery is one file with one inline <style>", (delivery.match(/<style\b/g) ?? []).length === 1);
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
// to retune, and an override here would make the delivery a lie without changing a byte of it. It
// IS allowed to add new names under the same prefix — the design handover §2 asks for exactly
// that when the app needs more — so the check is the intersection, not the prefix.
const uiTokensInPanel = new Set([...panelCss.matchAll(/(--matic-ui-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const uiTokensInApp = new Set([...appCss.matchAll(/(--matic-ui-[a-z0-9-]+)\s*:\s*[^;]/g)].map((m) => m[1]));
const redefined = [...uiTokensInApp].filter((t) => uiTokensInPanel.has(t));
check("the app stylesheet redefines no token the delivery declares", redefined.length === 0,
  redefined.join(", ") || "app-only rules may USE a delivered token and may ADD new ones; they may not redefine one");

// ==============================================================================================
console.log("\n=== 3. the token set: 35 names, and no collision with the avatar (acceptance 3) ===");
const uiTokens = new Set([...panelCss.matchAll(/(--matic-ui-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const avatarTokens = new Set([...avatarCss.matchAll(/(--matic-avatar-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
check(`the delivery declares 35 --matic-ui-* tokens (found ${uiTokens.size})`, uiTokens.size === 35);
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
// The delivery's own selectors key off `data-set`, which the app does not have. The open-state
// wash was re-keyed onto `data-band-key` by 63011a4 and the chevron rotation was missed, so a band
// opened with its only state indicator inert. Both halves are checked now (2026-09-10).
check("the open band's trigger is keyed onto the app's own attribute",
  /\[data-band="machine"\] \[data-band-key="machine"\]\.band-trigger/.test(appCss));
check("so is the chevron the delivery rotates when a band is open",
  /\[data-band="machine"\] \[data-band-key="machine"\] \.chev/.test(appCss));
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
  /fixed\("Category",\s*ESCALATION_PLAIN\.category\[[^\]]+\][^,]*,\s*draft\.category\)/.test(rendererCode));
check("the card passes the raw owner alongside the gloss",
  /fixed\("Goes to",[\s\S]{0,200}?draft\.suggestedOwner \?\? ""\)/.test(rendererCode));
check("the raw value is rendered subordinate, never instead of the gloss",
  /el\("span", "raw", raw\)/.test(rendererCode) && /\.ticket-review \.fixed \.raw/.test(appCss));
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
check("…computed from what the probe reported about this environment", /const heard = spokenForm\(text, spokenEnv\);/.test(rendererCode));
check("`say()` is the only thing in the renderer that reaches the voice",
  [...rendererCode.matchAll(/matic\.speak\(/g)].length === 1);
check("all three identifiers are learned where the probe's facts arrive, so a re-read refreshes them",
  /function renderMachine\([\s\S]{0,300}rememberEnvironment\(f\)/.test(rendererCode)
  && /machine: facts\?\.computer, user: facts\?\.user, addresses: \[facts\?\.ip, facts\?\.gateway\]/.test(rendererCode));
// The addresses are THIS machine's two, not a pattern for anything address-shaped: a hub answer may
// legitimately say "try 8.8.8.8", and redacting that destroys the answer rather than protecting
// anyone. `spoken-form.test.mjs` asserts the behaviour; this asserts the renderer supplies literals.
check("…and the addresses handed over are literals from the probe, not a pattern",
  !/\\d\{1,3\}\\\./.test(rendererCode) && !/addresses: \[.*RegExp/.test(rendererCode));
check("all three are still SHOWN, on the surfaces that carry them",
  /\["This computer", f\.computer\]/.test(rendererCode)
  && /\["Signed in as", f\.user\]/.test(rendererCode)
  && /fixed\("Machine", draft\.machineName/.test(rendererCode)
  && /\["This machine's address", f\.ip\]/.test(rendererCode));
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
check("the consent card renders the broker's `detail` verbatim", /el\("p", "exact", r\.detail\)/.test(rendererJs));
check("…and it is set apart rather than hidden, the way the review card's raw value is (D244/D128)",
  /\.consent-verbatim p\.exact/.test(appCss) && /font-family: var\(--matic-ui-font-mono\)/.test(appCss));
check("nothing in the renderer builds consent text from the catalog",
  !/catalog/i.test(rendererCode) && !/listCapabilities/.test(rendererCode));
check("the renderer never uses innerHTML (D130's verbatim rule, mechanically)",
  !/innerHTML/.test(rendererCode));

// D86/D213: a filed ticket has reached nobody, and the surface says so. PINNED AS FACTS, NOT AS
// PHRASING - the wording changed on 2026-09-10 when "the hub" came off the surface (D246), and an
// assertion that breaks on a rewording is pinning the wrong thing.
const caveat = rendererCode.match(/el\("div", "caveat", "([^"]*)"\)/)?.[1] ?? "";
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
const postSend = rendererCode.match(/if \(!filed\.notified\) note\((`[^`]*`)\)/)?.[1] ?? "";
check("the post-send line exists and names the reference", /\$\{filed\.reference\}/.test(postSend));
check("the post-send line does not restate the no-email fact in a second wording",
  Boolean(postSend) && !/email|notif|alert/i.test(postSend), postSend);

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
check("the standing degraded sentence is the delivery's, word for word",
  ["I can't reach your company's guidance or the service desk at the moment",
   "There's no company guidance or service desk connected here"].every((s) => indexHtml.includes(s) && delivery.includes(s)));

// ==============================================================================================
console.log("\n=== 7. the tickets band says what it is, and what it is not (D242) ===");
check("the band exists", indexHtml.includes("band-tickets"));
check("the band is fed by a local read, not a hub lookup", /ticketsFiled\(\)/.test(rendererJs));
check("the band states that progress is not visible from here",
  /Progress not visible/.test(rendererJs) && /isn't something I can do in this build/.test(rendererJs));
check("an empty band says why it is empty rather than showing nothing",
  /I haven't filed any tickets from this machine/.test(rendererJs));
check("a build that cannot file says so instead of showing an empty list",
  /isn't connected to a service desk/.test(rendererJs));

// ==============================================================================================
console.log(`\n${"=".repeat(94)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(94)}`);
if (fail) process.exit(1);
