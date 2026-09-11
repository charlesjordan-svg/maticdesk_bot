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
check("the consent card renders the broker's `detail` verbatim", /el\("p", "", r\.detail\)/.test(rendererJs));
check("nothing in the renderer builds consent text from the catalog",
  !/catalog/i.test(rendererCode) && !/listCapabilities/.test(rendererCode));
check("the renderer never uses innerHTML (D130's verbatim rule, mechanically)",
  !/innerHTML/.test(rendererCode));

// D86/D213: a filed ticket has reached nobody, and the surface says so.
check("the no-notification line survives", /No email was sent/.test(rendererJs));
check("an unknown filing outcome is stated as unknown, not as a failure",
  /filed\.filed === null/.test(rendererJs) && /unknown/.test(rendererJs));
// D244: ONCE, though. The card is shown BEFORE the user agrees, so the card is where the fact
// lives; the post-send line carries the reference and nothing the card already said. Both halves
// of this matter - deleting it from the card too would re-open D86/D213.
check("the review card still carries the no-email fact, in full, before the user agrees",
  /el\("div", "caveat", "[^"]*No email is sent in this build[^"]*"\)/.test(rendererCode));
const postSend = rendererCode.match(/if \(!filed\.notified\) note\((`[^`]*`)\)/)?.[1] ?? "";
check("the post-send line exists and names the reference", /\$\{filed\.reference\}/.test(postSend));
check("the post-send line does not restate the no-email fact in a second wording",
  Boolean(postSend) && !/email|notif|alert/i.test(postSend), postSend);

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
