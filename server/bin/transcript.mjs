#!/usr/bin/env node
// @ts-check
/**
 * Read a live persona conversation's transcript from the service. (Handover 2026-11-18 §6.)
 *
 *   node bin/transcript.mjs <conversationId> [--key-file <path>] [--json]
 *
 * The conversation id is in the endpoint's log: `client/audit/app.log`, the line
 * `[persona] conversation <id> admitted`. The transcript is the ONLY record of what she said - the
 * endpoint logs event types and counts and never her words (D323) - so every diagnosis of "she is
 * not responding correctly" that is written without one is inferred from classifications and
 * timings. The 2026-11-18 reading was; it says so in its own verification register.
 *
 * THE KEY. It is the hub's (`MATIC_NUANCE_API_KEY`, set by `tools/launchers/start-v2.ps1` from the
 * file `-KeyFile` names) and it is read from, in order: `--key-file <path>`, `MATIC_NUANCE_KEY_FILE`,
 * `MATIC_NUANCE_API_KEY`. It goes upstream in one header and is printed nowhere; the exit message
 * for a refused request carries the HTTP status and never the header.
 *
 * WHAT IS PRINTED HOLDS THE USER'S WORDS. It goes to the terminal and to no file; never paste a
 * transcript, or a line of one, into the repo (CLAUDE.md, v2 section). `--json` prints the service's
 * body as it came, for a shape this script does not know.
 *
 * THE SHAPE IS NOT DOCUMENTED IN THIS REPO. `formatTranscript()` reads the shapes it can - an array
 * of entries, or an object holding one under `transcript`, `messages`, `turns`, `items` or
 * `entries`, each entry with a role-like field and a text-like field - and falls back to the JSON
 * for anything else, so an unexpected shape is shown rather than silently emptied.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NUANCE_BASE_URL } from "../src/nuance/route.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lines for a terminal, from whatever the service returned. Pure.
 * @param {any} body
 * @returns {string[]}
 */
export function formatTranscript(body) {
  const list = Array.isArray(body) ? body
    : body && typeof body === "object" ? ["transcript", "messages", "turns", "items", "entries"].map((k) => body[k]).find((v) => Array.isArray(v)) ?? null
    : null;
  if (!list) return ["(a shape this script does not read - the body as it came:)", JSON.stringify(body, null, 2)];
  if (list.length === 0) return ["(the transcript is empty)"];
  return list.map((e, i) => {
    if (typeof e === "string") return `${String(i + 1).padStart(3)}  ${e}`;
    if (!e || typeof e !== "object") return `${String(i + 1).padStart(3)}  ${JSON.stringify(e)}`;
    const role = ["role", "speaker", "participant", "from", "source"].map((k) => e[k]).find((v) => typeof v === "string") ?? "?";
    const text = ["text", "content", "transcript", "message", "utterance"].map((k) => e[k]).find((v) => typeof v === "string");
    const at = ["timestamp", "created_at", "at", "time"].map((k) => e[k]).find((v) => typeof v === "string" || typeof v === "number");
    const offset = ["offset_ms", "start_ms", "start"].map((k) => e[k]).find((v) => typeof v === "number");
    const when = at !== undefined ? String(at) : offset !== undefined ? `+${(offset / 1000).toFixed(1)}s` : "";
    return `${String(i + 1).padStart(3)}  ${when ? `${when}  ` : ""}${role.padEnd(10)} ${text !== undefined ? text : JSON.stringify(e)}`;
  });
}

/** The key, from the three places it may be, or null. Never logged. */
function readKey(argv, env = process.env) {
  const i = argv.indexOf("--key-file");
  const file = (i >= 0 && argv[i + 1]) || env.MATIC_NUANCE_KEY_FILE || null;
  if (file) {
    try { return readFileSync(file, "utf8").trim() || null; } catch (err) { throw new Error(`the key file could not be read: ${err.message}`); }
  }
  return env.MATIC_NUANCE_API_KEY?.trim() || null;
}

async function main() {
  const argv = process.argv.slice(2);
  const id = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--key-file");
  if (!id || !UUID.test(id)) {
    process.stderr.write("usage: node bin/transcript.mjs <conversationId> [--key-file <path>] [--json]\n  the id is the uuid on the endpoint's `[persona] conversation <id> admitted` line in client/audit/app.log\n");
    process.exitCode = 2;
    return;
  }
  let key;
  try { key = readKey(argv); } catch (err) { process.stderr.write(`${err.message}\n`); process.exitCode = 2; return; }
  if (!key) {
    process.stderr.write("no key: pass --key-file <path>, or set MATIC_NUANCE_KEY_FILE or MATIC_NUANCE_API_KEY (the hub's own variable). Nothing was requested.\n");
    process.exitCode = 2;
    return;
  }
  const url = `${NUANCE_BASE_URL}/conversation/${id}/transcript`;
  let r;
  try {
    r = await fetch(url, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    process.stderr.write(`the service could not be reached: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }
  const raw = await r.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = raw; }
  if (r.status !== 200) {
    process.stderr.write(`the service answered HTTP ${r.status} for conversation ${id}${r.status === 404 ? " - no such conversation for this key" : r.status === 401 || r.status === 403 ? " - the key was refused" : ""}\n${typeof body === "string" ? body.slice(0, 400) : JSON.stringify(body).slice(0, 400)}\n`);
    process.exitCode = 1;
    return;
  }
  if (argv.includes("--json")) { process.stdout.write(JSON.stringify(body, null, 2) + "\n"); return; }
  process.stdout.write(`conversation ${id} - the transcript as the service holds it. It holds the user's words: do not paste it anywhere in the repo.\n`);
  for (const line of formatTranscript(body)) process.stdout.write(line + "\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
