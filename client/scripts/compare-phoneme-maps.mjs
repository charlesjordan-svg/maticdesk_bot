#!/usr/bin/env node
// @ts-check
/**
 * The §3 phoneme comparison from the avatar integration handover, run against REAL Piper output.
 *
 *   npm.cmd run avatar:compare
 *
 * Starts the same `scripts/piper_worker.py` the app runs, speaks a handful of real product strings
 * through the same voice model, and for EVERY phoneme Piper emits compares the two tables:
 *
 *   existing   src/renderer/avatar/viseme-map.js   - the debugged mapping that drives the mouth
 *   manifest   matic-avatar.manifest.json          - the delivery's phonemeToMouth (eSpeak ASCII)
 *
 * Prints every disagreement with the phoneme, both shapes, and how often it occurred; then a
 * verdict. The verdict is what decides whether the manifest's table may replace the existing one
 * (handover §3 step 5): only when it is demonstrated equal or better on real output. Needs the
 * voice model (`npm.cmd run fetch-voice`) and `py -3` with piper installed.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareWithManifest } from "../src/renderer/avatar/viseme-map.js";
import { escalationReply } from "../src/agent/prompt.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = process.env.MATIC_VOICE_MODEL || join(ROOT, "voices/en_US-amy-medium.onnx");

/** Real product strings: what the avatar actually says, not lorem ipsum. */
const STRINGS = [
  ["greeting (renderer.js boot line)", "Matic Desk here. Tell me what's not working and I'll take a look at this machine."],
  ["escalation offer (escalationReply, D214)", escalationReply({ summary: "The user reports a cracked laptop screen.", category: "hardware", whatWasChecked: "Nothing beyond the machine state shown.", suggestedOwner: "field_support" })],
  ["ticket confirmation with a number (renderer.js)", "That's filed. Your reference is MD-1042 - quote that if you follow it up."],
  ["a decline, as the hub phrases one (D205)", "I don't have anything in the company's guidance that covers that, so I won't guess. I can raise a ticket for you if you like - nothing has been filed yet."],
  ["a capability answer, representative (D212)", "I can restart the print spooler, renew the network lease, flush the DNS cache, and reset a stuck network adapter. Anything else I will hand to a person."],
  ["consonant-heavy check line", "The thirty-third thing the technician checked was whether the Ethernet jack had loosened - it usually has, judging by the yellow triangle."],
];

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), "matic-cmp-"));
  const proc = spawn("py", ["-3", join(ROOT, "scripts/piper_worker.py"), MODEL], { stdio: ["pipe", "pipe", "pipe"] });
  proc.stderr.on("data", (d) => process.stderr.write(`[piper] ${d}`));
  const lines = createInterface({ input: proc.stdout });
  const pending = new Map();
  let ready;
  const readyP = new Promise((r) => { ready = r; });
  lines.on("line", (line) => {
    let msg; try { msg = JSON.parse(line); } catch { return; }
    if (Object.hasOwn(msg, "ready")) return ready(msg);
    pending.get(msg.id)?.(msg); pending.delete(msg.id);
  });
  const r = await Promise.race([readyP, new Promise((res) => setTimeout(() => res({ ready: false, error: "worker did not become ready in 60 s" }), 60_000))]);
  if (!r.ready) { console.error(`piper not ready: ${r.error}`); proc.kill(); process.exit(2); }
  console.log(`piper ready: ${r.model} @ ${r.sampleRate} Hz\n`);

  let id = 0;
  const tally = new Map(); // phoneme -> { count, existing, manifest, agree, existingKnown, manifestKnown }
  let total = 0;
  for (const [label, text] of STRINGS) {
    const myId = ++id;
    const res = await new Promise((resolve) => {
      pending.set(myId, resolve);
      proc.stdin.write(JSON.stringify({ id: myId, text, wav: join(tmp, `u${myId}.wav`) }) + "\n");
    });
    if (!res.ok) { console.log(`  ${label}: FAILED ${res.error}`); continue; }
    const seq = res.timeline.map(([p]) => p);
    console.log(`  ${label}\n    ${res.timeline.length} phonemes: ${seq.join(" ")}`);
    for (const p of seq) {
      total++;
      const c = compareWithManifest(p);
      const t = tally.get(p) ?? { ...c, count: 0 };
      t.count++;
      tally.set(p, t);
    }
  }
  proc.stdin.write(JSON.stringify({ cmd: "quit" }) + "\n");
  proc.kill();

  const rows = [...tally.values()].sort((a, b) => b.count - a.count);
  const disagree = rows.filter((x) => !x.agree);
  const unknownExisting = rows.filter((x) => !x.existingKnown);
  const unknownManifest = rows.filter((x) => !x.manifestKnown);

  console.log(`\n${total} phonemes, ${rows.length} distinct.\n`);
  console.log("phoneme  count  existing    manifest    agree  known(existing/manifest)");
  for (const x of rows) {
    console.log(`${x.phoneme.padEnd(8)} ${String(x.count).padStart(5)}  ${x.existing.padEnd(11)} ${x.manifest.padEnd(11)} ${x.agree ? "yes  " : "NO   "}  ${x.existingKnown ? "y" : "n"}/${x.manifestKnown ? "y" : "n"}`);
  }
  const occ = (list) => list.reduce((n, x) => n + x.count, 0);
  console.log(`\nDisagreements: ${disagree.length} distinct phoneme(s), ${occ(disagree)} of ${total} occurrences (${(100 * occ(disagree) / total).toFixed(1)}%).`);
  console.log(`Unknown to the EXISTING table (fell to closed): ${unknownExisting.length} distinct, ${occ(unknownExisting)} occurrences: ${unknownExisting.map((x) => x.phoneme).join(" ") || "none"}`);
  console.log(`Unknown to the MANIFEST table (would fall to closed): ${unknownManifest.length} distinct, ${occ(unknownManifest)} occurrences: ${unknownManifest.map((x) => x.phoneme).join(" ") || "none"}`);

  const verdict = unknownManifest.length > unknownExisting.length
    ? "KEEP THE EXISTING TABLE. The manifest's table does not know what Piper emits; switching would close the mouth on every phoneme listed above."
    : disagree.length === 0
      ? "The tables agree on real output; the switch is safe."
      : "The tables disagree on real output; decide per phoneme by what eSpeak emitted, not by document date.";
  console.log(`\nVERDICT: ${verdict}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
