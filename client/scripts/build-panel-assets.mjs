#!/usr/bin/env node
// @ts-check
/**
 * Generate `src/renderer/panel/matic-panel.css` from the delivered harness,
 * `src/renderer/panel/matic-desk-panel.html`, verbatim.
 *
 *   node scripts/build-panel-assets.mjs            write the stylesheet
 *   node scripts/build-panel-assets.mjs --check    exit 1 if the stylesheet on disk is stale
 *
 * THE SAME ARGUMENT AS `build-avatar-assets.mjs`, APPLIED TO THE PANEL.
 *
 * The delivery is one self-contained file with one inline `<style>`. The app needs that CSS as a
 * stylesheet it can link, so there has to be a second copy of those bytes — and this project has a
 * rule about copies: **a copy diverges, a generated one cannot.** So the copy is mechanical, and
 * `test/panel.test.mjs` fails while it is stale.
 *
 * DIRECTION OF TRUTH, AND HOW IT DIFFERS FROM THE AVATAR
 *
 * The avatar's sources are `matic-avatar.svg` + `matic-avatar.css` and its harness is the derived
 * artefact. The panel arrived the other way round: the harness IS the delivery, and there were no
 * separate source files to deliver. So here the delivery is the source and the stylesheet is
 * derived. The practical rule is the same one the avatar README states — **do not hand-edit the
 * generated file** — with one extra consequence worth being explicit about: a design change has to
 * arrive as a NEW DELIVERY, because there is nowhere else for it to come from.
 *
 * WHAT IS *NOT* STRIPPED, AND WHY
 *
 * Nothing. The style block is copied whole, harness chrome (`.harness-head`, `.rail-h`, `.rbtn`,
 * `.stage`, the notes grid) included. Two reasons:
 *
 *   1. **An exact copy is checkable without judgement.** The moment this script decides which rules
 *      the app "needs", the check stops proving the app matches the delivery and starts proving it
 *      matches this script's opinion — and the parts it would have to reason about are exactly the
 *      shared ones (`.segrow` wraps the harness's theme switch AND the tickets band's filter;
 *      the `[data-set]` active-state block styles both rails and the band filters).
 *   2. The unused rules are inert: the app renders no element carrying those classes. They cost
 *      about 2 KB on a `file://` page that loads no network resource at all.
 *
 * App-only rules — the ones that make the design's 1160x800 stage fill a real Electron window, and
 * the surfaces the design did not cover (the D213 ticket review card) — live in
 * `matic-panel.app.css`, which is hand-written, loaded second, and says so at the top.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PANEL_DIR = resolve(HERE, "../src/renderer/panel");
export const DELIVERY = join(PANEL_DIR, "matic-desk-panel.html");
export const PANEL_CSS = join(PANEL_DIR, "matic-panel.css");
export const APP_INDEX = resolve(HERE, "../src/renderer/index.html");
export const CHECK_FRAME = join(PANEL_DIR, "panel-check-frame.html");

const HEADER = [
  "/* GENERATED FILE - DO NOT EDIT.",
  "   Built by scripts/build-panel-assets.mjs from the <style> block of matic-desk-panel.html in",
  "   this directory, verbatim. A design change arrives as a new delivery, not as an edit here:",
  "   drop the new harness in and run `npm.cmd run panel:build`. test/panel.test.mjs fails while",
  "   this file is stale. App-only rules go in matic-panel.app.css, which is loaded after it. */",
  "",
].join("\n");

/**
 * The stylesheet text, built from the delivery as it is on disk right now.
 * @param {string} [deliveryPath]
 */
export function buildPanelCss(deliveryPath = DELIVERY) {
  const html = readFileSync(deliveryPath, "utf8");
  const opens = html.match(/<style\b[^>]*>/g) ?? [];
  if (opens.length !== 1) {
    // Worth failing loudly rather than concatenating: a second <style> in a future delivery means
    // the file's shape changed, and silently gluing them together would hide that.
    throw new Error(`expected exactly one <style> block in ${deliveryPath}, found ${opens.length}`);
  }
  const start = html.indexOf(opens[0]) + opens[0].length;
  const end = html.indexOf("</style>", start);
  if (end < 0) throw new Error(`unterminated <style> block in ${deliveryPath}`);
  // The block opens with a newline after `<style>` and closes with one before `</style>`; both are
  // dropped so the stylesheet begins at the first rule, and the trailing newline is re-added.
  return `${HEADER}${html.slice(start, end).replace(/^\n/, "").replace(/\n$/, "")}\n`;
}

/** True when the stylesheet on disk equals what the delivery would generate now. */
export function panelCssIsCurrent(deliveryPath = DELIVERY, cssPath = PANEL_CSS) {
  let onDisk = "";
  try { onDisk = readFileSync(cssPath, "utf8"); } catch { return false; }
  return onDisk === buildPanelCss(deliveryPath);
}

/**
 * The check page's inner frame: `src/renderer/index.html`, GENERATED, with two differences and no
 * others.
 *
 *   1. `panel-check-bridge.js` is inserted ahead of the module scripts, so `window.matic` exists
 *      before renderer.js reads it. It is a classic script; the renderer's are modules and
 *      therefore deferred, which is what makes the ordering reliable rather than lucky.
 *   2. Relative URLs are rewritten, because the frame sits one directory deeper than the page it
 *      is generated from.
 *
 * WHY GENERATED RATHER THAN WRITTEN. A hand-written check page is a second copy of the panel's
 * markup, and the day it drifts is the day the check page stops checking the app and starts
 * checking itself - the exact failure `matic-avatar.assets.js` is generated to prevent, in the one
 * place where nobody would notice, because both pages would still render something plausible.
 */
export function buildCheckFrame(indexPath = APP_INDEX) {
  const html = readFileSync(indexPath, "utf8");
  const banner = [
    "<!-- GENERATED FILE - DO NOT EDIT. Built by scripts/build-panel-assets.mjs from",
    "     ../index.html, with a fake `window.matic` inserted and the relative paths rewritten.",
    "     Edit index.html and run `npm.cmd run panel:build`. Open panel-check.html, not this. -->",
  ].join("\n");
  return `${banner}\n${html}`
    .replace('<script type="module" src="./avatar/matic-avatar-element.js"></script>',
      '<script src="./panel-check-bridge.js"></script>\n<script type="module" src="../avatar/matic-avatar-element.js"></script>')
    .replace('<script type="module" src="./renderer.js"></script>',
      '<script type="module" src="../renderer.js"></script>')
    .replace('href="./panel/matic-panel.css"', 'href="./matic-panel.css"')
    .replace('href="./panel/matic-panel.app.css"', 'href="./matic-panel.app.css"');
}

/** True when the generated check frame on disk equals what index.html would generate now. */
export function checkFrameIsCurrent(indexPath = APP_INDEX, framePath = CHECK_FRAME) {
  let onDisk = "";
  try { onDisk = readFileSync(framePath, "utf8"); } catch { return false; }
  return onDisk === buildCheckFrame(indexPath);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const stale = [
      panelCssIsCurrent() ? null : PANEL_CSS,
      checkFrameIsCurrent() ? null : CHECK_FRAME,
    ].filter(Boolean);
    if (stale.length === 0) {
      console.log("ok: matic-panel.css matches the delivery, and panel-check-frame.html matches index.html");
      process.exit(0);
    }
    // Every stale file is named, not just the first: the `&&` lesson, in miniature.
    for (const f of stale) console.error(`STALE: ${f}`);
    console.error("Run: npm.cmd run panel:build");
    process.exit(1);
  }
  writeFileSync(PANEL_CSS, buildPanelCss());
  console.log(`wrote ${PANEL_CSS}`);
  writeFileSync(CHECK_FRAME, buildCheckFrame());
  console.log(`wrote ${CHECK_FRAME}`);
}
