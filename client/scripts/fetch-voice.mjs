/**
 * Fetch the Piper voice model the app speaks with, into client/voices/.
 *
 * The model is 63 MB and is deliberately not committed (see .gitignore). Every machine that runs
 * the app needs the two files below side by side; the worker (scripts/piper_worker.py) loads the
 * .onnx and reads the .onnx.json sidecar from the same path with ".json" appended.
 *
 * Source: the public Piper voices repository on Hugging Face (rhasspy/piper-voices), pinned to the
 * v1.0.0 tag so the bytes cannot change under us. Voice: en_US-amy-low, 16 kHz.
 *
 * Usage:  npm run fetch-voice          (skips files that are already present and the right size)
 *         npm run fetch-voice -- --force
 */
import { createWriteStream, existsSync, mkdirSync, statSync, renameSync, unlinkSync, readFileSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VOICES = join(ROOT, "voices");
const BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/low/";
// Known sizes at tag v1.0.0. The sidecar is served compressed, so its HEAD carries no usable
// content-length; the pinned sizes are what the check falls back to.
const FILES = [
  { name: "en_US-amy-low.onnx", size: 63104526 },
  { name: "en_US-amy-low.onnx.json", size: 4164, json: true },
];
const force = process.argv.includes("--force");

mkdirSync(VOICES, { recursive: true });

for (const { name, size, json } of FILES) {
  const dest = join(VOICES, name);
  const url = BASE + name;
  if (!force && existsSync(dest) && statSync(dest).size === size) {
    console.log(`ok    ${name} already present (${size.toLocaleString()} bytes)`);
    continue;
  }
  console.log(`get   ${name} (${size.toLocaleString()} bytes) <- ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    console.error(`FAIL  ${name}: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const tmp = dest + ".part";
  await pipeline(Readable.fromWeb(/** @type {any} */ (res.body)), createWriteStream(tmp));
  const got = statSync(tmp).size;
  if (got !== size) {
    unlinkSync(tmp);
    console.error(`FAIL  ${name}: got ${got} bytes, expected ${size}. If Hugging Face re-published the tag, update the pinned size here after checking the file.`);
    process.exit(1);
  }
  if (json) {
    try { JSON.parse(readFileSync(tmp, "utf8")); } catch (err) {
      unlinkSync(tmp);
      console.error(`FAIL  ${name}: not valid JSON (${err.message})`);
      process.exit(1);
    }
  }
  renameSync(tmp, dest);
  console.log(`done  ${name}`);
}
console.log(`\nVoice files are in ${VOICES}. config.json already points there (voices/en_US-amy-low.onnx).`);
