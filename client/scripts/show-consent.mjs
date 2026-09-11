/**
 * Print what the BROKER rendered and kept, for comparison against what was on screen.
 *
 * This is the read half of the D130 renderer check (docs/D130-RENDERER-CHECK.md §2). The guarantee
 * D130 makes is that the Electron renderer displays `consentRendered` verbatim and cannot compose
 * consent text of its own. No automated test can see a screen, so a human compares - and this makes
 * the broker's side of that comparison one command instead of a pasted one-liner.
 *
 * It exists because the one-liner failed twice on the first person to use it: once with ENOENT
 * because `reset-demo` had deleted the audit file, and once with "Illegal return statement" because
 * top-level `return` is not legal in `node -e`. A check nobody can run is not a check.
 *
 *   npm.cmd run show-consent            the most recent rendered card
 *   npm.cmd run show-consent -- --all   every rendered card in the log, oldest first
 *   npm.cmd run show-consent -- -n 3    the last three
 *
 * NOTE: `npm.cmd test` writes to this same log, so a fresh `npm test` run leaves records here that
 * did not come from the app. The `at` timestamp and `source` tell them apart, and `reset-demo`
 * clears the file so a rehearsal starts from an empty trail.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT = join(ROOT, "audit", "audit.jsonl");

/** The eight fields the renderer displays, in the order they appear on the card. */
// `detailPlain` is D248's gloss and sits ABOVE `detail` on the card, so it is listed in the order
// the card draws them. It was missing here until 2026-09-11, which mattered: §4.3 of the renderer
// check compares the card against THIS output field for field, so a field the script does not print
// is a field a wrong value could not be caught in. A record written before D248 has no such key and
// prints as absent, which is the honest reading of an older card.
const DISPLAYED = ["title", "what", "detailPlain", "detail", "rollbackNote", "notice", "undo", "why", "risk"];

if (!existsSync(AUDIT)) {
  console.log(`No audit log at ${AUDIT}.`);
  console.log("Nothing has run yet, or `npm.cmd run reset-demo` cleared it. Use the app first.");
  process.exit(0);
}

const records = readFileSync(AUDIT, "utf8")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line, i) => {
    try { return JSON.parse(line); } catch { console.error(`  (line ${i + 1} is not JSON, skipped)`); return null; }
  })
  .filter(Boolean);

const rendered = records.filter((r) => r.consentRendered);
if (rendered.length === 0) {
  console.log(`${records.length} audit record(s), none carrying a rendered consent card.`);
  console.log("Consent cards are written by prepareConsent(); get one in the app and approve or deny it.");
  process.exit(0);
}

const args = process.argv.slice(2);
const nFlag = args.indexOf("-n");
const count = args.includes("--all") ? rendered.length : nFlag >= 0 ? Number(args[nFlag + 1]) || 1 : 1;
const show = rendered.slice(-count);

console.log(`${records.length} audit record(s), ${rendered.length} with a rendered card. Showing ${show.length}.\n`);

for (const r of show) {
  console.log("=".repeat(78));
  console.log(`${r.at}   ${r.capabilityId}   outcome: ${r.outcome}${r.gate ? `   gate: ${r.gate}` : ""}`);
  if (r.source) console.log(`source: ${r.source}${r.hubProvider ? `   hubProvider (the hub's CLAIM): ${r.hubProvider}` : ""}`);
  console.log(`nonce:  ${r.consentNonce}`);
  if (r.message) console.log(`message: ${r.message}`);
  console.log("-".repeat(78));
  console.log("What the BROKER rendered and kept. The card on screen must match this, field for field:\n");
  for (const field of DISPLAYED) {
    const v = r.consentRendered[field];
    const where = ["notice", "undo", "why", "risk"].includes(field) ? "  [explain panel]" : "";
    if (v === null || v === undefined) {
      console.log(`  ${field.padEnd(13)} (null - this line should NOT appear on the card)${where}`);
    } else {
      console.log(`  ${field.padEnd(13)} ${v}${where}`);
    }
  }
  console.log(`\n  locale        ${r.consentRendered.locale}   (recorded, NOT displayed - see the checklist §5)`);
  console.log();
}

console.log("=".repeat(78));
console.log("Looking for: any string that was visible on the card but is NOT above, and is not the");
console.log("labelled \"Why this, here\" line (that one is proposal.reasoning, the model's own sentence).");
console.log("Anything else means the renderer can compose consent text, which is what D130 forbids.");
console.log("Record the result in docs/D130-RENDERER-CHECK.md.");
