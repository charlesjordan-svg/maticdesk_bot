// @ts-check
/**
 * The console's static assets: three font files, served by the hub itself (D225).
 *
 * WHY SELF-HOSTED. The design system's faces are Barlow and Barlow Condensed. D221 forbids an
 * external asset, so the fonts cannot be fetched from Google; the handback proposed inlining them
 * as base64 in the stylesheet, which would add ~65 KB to EVERY page and could never be cached.
 * Serving them from the hub keeps every property that mattered — same origin (the CSP says
 * `font-src 'self'`), works offline, no third party — and lets the browser cache them once.
 *
 * WHY AN ALLOW-LIST AND NOT A DIRECTORY. This is the one place the console reads a file named by
 * a URL, which is the one place a path can escape. The URL is not a path: it is looked up in this
 * map, and anything not in the map is a 404 before the filesystem is consulted. Adding an asset is
 * adding a row here, on purpose.
 *
 * The files are read once at first request and held; they are 22 KB each and never change while
 * the process runs. Long immutable caching is safe for the same reason — a new font is a new
 * filename.
 *
 * Provenance: assets/SOURCES.md. SIL Open Font License 1.1; latin subset as Google Fonts serves it.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ASSET_PREFIX = "/admin/assets/";

/** URL filename -> { file on disk, content type }. The whole list. */
export const ASSETS = Object.freeze({
  "barlow-400.woff2": { file: "barlow-400.woff2", type: "font/woff2" },
  "barlow-500.woff2": { file: "barlow-500.woff2", type: "font/woff2" },
  "barlow-condensed-600.woff2": { file: "barlow-condensed-600.woff2", type: "font/woff2" },
});

/** @type {Map<string, Buffer>} */
const cache = new Map();

/**
 * Answer a GET for an asset, or return false when the URL is not one. No session is needed: the
 * sign-in page uses the fonts before anybody is signed in, and a font file reveals nothing.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} pathname
 * @returns {boolean} handled
 */
export function serveAsset(req, res, pathname) {
  if (!pathname.startsWith(ASSET_PREFIX)) return false;
  const name = pathname.slice(ASSET_PREFIX.length);
  const asset = Object.hasOwn(ASSETS, name) ? ASSETS[name] : null;
  if (!asset || (req.method !== "GET" && req.method !== "HEAD")) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-matic-hub-auth": "none" });
    res.end("no such asset");
    return true;
  }
  let body = cache.get(name);
  if (!body) {
    body = readFileSync(join(HERE, "assets", asset.file));
    cache.set(name, body);
  }
  res.writeHead(200, {
    "content-type": asset.type,
    "content-length": body.length,
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    "x-matic-hub-auth": "none",
  });
  res.end(req.method === "HEAD" ? undefined : body);
  return true;
}
