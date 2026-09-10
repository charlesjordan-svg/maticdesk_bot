#!/usr/bin/env node
// @ts-check
/**
 * Generate `src/renderer/avatar/matic-avatar.assets.js` from the two delivered source files,
 * `matic-avatar.svg` and `matic-avatar.css`, verbatim.
 *
 *   node scripts/build-avatar-assets.mjs            write the module
 *   node scripts/build-avatar-assets.mjs --check    exit 1 if the module on disk is stale
 *
 * WHY A GENERATED MODULE AND NOT A RUNTIME FETCH
 *
 * The renderer is a `file://` page in Electron. `fetch()` of a `file://` URL is refused by Chromium,
 * and the alternatives (XHR, a custom protocol, `webSecurity: false`) each add a moving part to the
 * one surface that must open with nothing else running. The chassis and its stylesheet are text, so
 * they can be carried in a module the page already knows how to load.
 *
 * That module is a COPY, and this project has a rule about copies (the manifest §2 argument, the
 * `stateTopicsFor` vocabulary, the capability answer): a copy diverges, a load cannot. So the copy
 * is mechanical, never hand-edited, and `test/avatar.test.mjs` fails when it is stale — the same
 * shape the delivery's own README asks for ("edit the source files and regenerate; never hand-edit
 * the copies inside the harness").
 *
 * The MANIFEST is not carried this way. It is imported at runtime as a JSON module
 * (`import manifest from "./matic-avatar.manifest.json" with { type: "json" }`), so a note edited in
 * the manifest reaches the UI with no step in between — acceptance item 5 of the avatar handover.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const AVATAR_DIR = resolve(HERE, "../src/renderer/avatar");
export const ASSETS_MODULE = join(AVATAR_DIR, "matic-avatar.assets.js");

const sha = (s) => createHash("sha256").update(s).digest("hex");

/**
 * The module text, built from the source files as they are on disk right now.
 * @param {string} [dir]
 */
export function buildAssetsModule(dir = AVATAR_DIR) {
  const svgSource = readFileSync(join(dir, "matic-avatar.svg"), "utf8");
  const cssSource = readFileSync(join(dir, "matic-avatar.css"), "utf8");
  // The XML prolog is meaningless inside an HTML document and Chromium logs a warning for it when
  // the markup is injected with innerHTML. Everything after it is untouched, including the C2PA
  // metadata block the delivery carries.
  const svgMarkup = svgSource.replace(/^\uFEFF?<\?xml[^>]*\?>/, "");
  return [
    "// GENERATED FILE - DO NOT EDIT.",
    "// Built by scripts/build-avatar-assets.mjs from matic-avatar.svg and matic-avatar.css in this",
    "// directory. Edit THOSE and run `npm.cmd run avatar:build`; test/avatar.test.mjs fails while this",
    "// file is stale. See the script's header for why the chassis is carried as a module at all.",
    `export const AVATAR_SVG_SHA256 = ${JSON.stringify(sha(svgSource))};`,
    `export const AVATAR_CSS_SHA256 = ${JSON.stringify(sha(cssSource))};`,
    `export const AVATAR_SVG = ${JSON.stringify(svgMarkup)};`,
    `export const AVATAR_CSS = ${JSON.stringify(cssSource)};`,
    "",
  ].join("\n");
}

/** True when the module on disk equals what the sources would generate now. */
export function assetsModuleIsCurrent(dir = AVATAR_DIR, modulePath = ASSETS_MODULE) {
  let onDisk = "";
  try { onDisk = readFileSync(modulePath, "utf8"); } catch { return false; }
  return onDisk === buildAssetsModule(dir);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    if (assetsModuleIsCurrent()) {
      console.log(`ok: ${ASSETS_MODULE} matches matic-avatar.svg and matic-avatar.css`);
      process.exit(0);
    }
    console.error(`STALE: ${ASSETS_MODULE} does not match the source files. Run: npm.cmd run avatar:build`);
    process.exit(1);
  }
  writeFileSync(ASSETS_MODULE, buildAssetsModule());
  console.log(`wrote ${ASSETS_MODULE}`);
}
