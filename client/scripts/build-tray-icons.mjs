#!/usr/bin/env node
// @ts-check
/**
 * Draws the three tray icons (D293) into assets/tray/ as PNGs, with no image library.
 *
 *   npm.cmd run tray:build
 *
 * THREE FORMS, TOLD APART BY SHAPE AND NOT BY HUE. The avatar manifest's `trayReads` says why:
 * "hue is unreadable at 16px on an unknown taskbar background", and its `staticForm` column is
 * the reduced-motion fallback this uses as the ONLY form (a tray icon does not animate):
 *
 *   idle         hollow   a ring                       "present and available, asking for nothing"
 *   needsYou     haloed   a filled dot inside a ring   "the user must answer something"
 *   unreachable  struck   a ring with a slash          "a statement that the assistant cannot work"
 *
 * One light fill with a dark outline, so the same PNG reads on a light or a dark taskbar. 16 px
 * and 32 px (the @2x Electron picks on a scaled display). Supersampled 4x so the curves are not
 * staircases. The PNGs are committed, like the generated avatar assets; test/presence.test.mjs
 * fails if one is missing or is not a PNG of the size named here.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const TRAY_ASSET_DIR = join(HERE, "..", "assets", "tray");
export const TRAY_ICON_FILES = { idle: "idle", needsYou: "needs-you", unreachable: "unreachable" };
export const TRAY_ICON_SIZES = [16, 32];

const FILL = [0xf2, 0xf2, 0xf3];   // the panel's own light ground
const LINE = [0x1f, 0x23, 0x28];   // near-black outline

/**
 * Signed-distance style coverage for one pixel: how much of it is ink, 0..1, by supersampling.
 * @param {"idle"|"needsYou"|"unreachable"} form @param {number} size
 */
function raster(form, size) {
  const SS = 4;
  const out = new Uint8Array(size * size * 4);
  const c = size / 2;
  const R = size * 0.42;          // outer ring radius
  const ringW = Math.max(1.6, size * 0.11);
  const outline = Math.max(0.7, size * 0.05);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let ink = 0, line = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS - c;
          const py = y + (sy + 0.5) / SS - c;
          const d = Math.hypot(px, py);
          // ring body: |d - (R - ringW/2)| <= ringW/2
          const inRing = Math.abs(d - (R - ringW / 2)) <= ringW / 2;
          const onRingEdge = !inRing && Math.abs(d - (R - ringW / 2)) <= ringW / 2 + outline;
          let fill = inRing, edge = onRingEdge;
          if (form === "needsYou") {
            const dot = size * 0.16;
            if (d <= dot) fill = true;
            else if (d <= dot + outline) edge = edge || true;
          }
          if (form === "unreachable") {
            // a slash from upper-left to lower-right across the ring
            const t = (px + py) / Math.SQRT2;   // distance from the anti-diagonal
            const along = (px - py) / Math.SQRT2;
            const slashW = ringW * 0.9;
            if (Math.abs(t) <= slashW / 2 && Math.abs(along) <= R) fill = true;
            else if (Math.abs(t) <= slashW / 2 + outline && Math.abs(along) <= R + outline) edge = edge || true;
          }
          if (fill) ink++;
          else if (edge) line++;
        }
      }
      const n = SS * SS;
      const a = (ink + line) / n;
      const i = (y * size + x) * 4;
      if (a === 0) continue;
      const wf = ink / (ink + line);
      out[i] = Math.round(FILL[0] * wf + LINE[0] * (1 - wf));
      out[i + 1] = Math.round(FILL[1] * wf + LINE[1] * (1 - wf));
      out[i + 2] = Math.round(FILL[2] * wf + LINE[2] * (1 - wf));
      out[i + 3] = Math.round(255 * a);
    }
  }
  return out;
}

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** A minimal RGBA PNG encoder: one IHDR, one IDAT with filter byte 0 per row, IEND. */
export function encodePng(rgba, size) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * size * 4, size * 4).copy(rows, y * (size * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(TRAY_ASSET_DIR, { recursive: true });
  for (const [form, base] of Object.entries(TRAY_ICON_FILES)) {
    for (const size of TRAY_ICON_SIZES) {
      const file = join(TRAY_ASSET_DIR, `${base}${size === 16 ? "" : "@2x"}.png`);
      writeFileSync(file, encodePng(raster(/** @type {any} */ (form), size), size));
      process.stdout.write(`${file}  ${size}x${size}\n`);
    }
  }
}
