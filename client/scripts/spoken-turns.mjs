#!/usr/bin/env node
// @ts-check
/**
 * THE D318 REGRESSION METRIC, AS A NUMBER (handover 2026-11-17 §2.5).
 *
 *   node scripts/spoken-turns.mjs [path to app.log]      default: audit/app.log
 *
 * "Read the transcripts" is right and will not survive a busy week. This counts, from the `[spoken]`
 * lines persona-ui.js writes to audit/app.log - one per spoken turn, with the classifier's kind,
 * the route taken and the outcome, and NEVER the words - how many spoken turns were a `question`
 * or an `action` and stayed hers (answered by her model, not routed and not asked). Those are the
 * candidates for the regression D318 guards against: a reply that asserts a fact about the
 * company, the machine or the tickets, which `persona.json` rule 2 exists to prevent.
 *
 * WHAT THIS CANNOT COUNT, said plainly: whether such a reply DID assert a fact. Her words are in
 * the service's transcript only (GET /conversation/<id>/transcript) and are never written here.
 * So this prints the DENOMINATOR and the list of conversations to read; the numerator is read by a
 * person, from those transcripts, and zero is the only acceptable number for the machine and the
 * tickets.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const path = process.argv[2] ?? join(HERE, "../audit/app.log");

let text;
try { text = readFileSync(path, "utf8"); } catch (err) { console.error(`cannot read ${path}: ${err.message}`); process.exit(2); }

/** @type {Record<string, number>} */
const byKey = {};
/** Since 2026-11-18 a [spoken] line also carries turn=, verb=, decided=+<ms>ms and why=<the classifier's sentence>. */
/** @type {Record<string, number>} */
const byWhy = {};
/** @type {number[]} */
const lags = [];
let withFields = 0;
const conversations = new Set();
let total = 0;
for (const line of text.split("\n")) {
  const admitted = line.match(/\[persona\] conversation (\S+) admitted/);
  if (admitted) conversations.add(admitted[1]);
  const m = line.match(/\[spoken\] kind=(\S+) route=(\S+) outcome=(\S+)/);
  if (!m) continue;
  total++;
  const key = `${m[1]} ${m[2]} ${m[3]}`;
  byKey[key] = (byKey[key] ?? 0) + 1;
  const fields = line.match(/ turn=(\S+) verb=(\S+) decided=\+(\d+|\?)ms why=(.*)$/);
  if (!fields) continue;
  withFields++;
  if (fields[3] !== "?") lags.push(Number(fields[3]));
  // The why is broken down for the lines that did NOT route: those are where "what did the
  // classifier make of this" is the question. Routed lines already say so (the verb, the kind).
  if (m[2] !== "route") {
    const w = `${m[2]}: ${fields[4].replace(/"[^"]*"/g, "\"…\"")}`;
    byWhy[w] = (byWhy[w] ?? 0) + 1;
  }
}

const candidates = Object.entries(byKey).filter(([k]) => /^(question|action) hers /.test(k)).reduce((n, [, c]) => n + c, 0);
const asked = Object.entries(byKey).filter(([k]) => / ask /.test(k)).reduce((n, [, c]) => n + c, 0);
const declined = Object.entries(byKey).filter(([k]) => / ask declined$/.test(k)).reduce((n, [, c]) => n + c, 0);
const answered = Object.entries(byKey).filter(([k]) => / ask answered$/.test(k)).reduce((n, [, c]) => n + c, 0);

console.log(`${path}`);
console.log(`spoken turns logged: ${total}`);
for (const [k, c] of Object.entries(byKey).sort()) console.log(`  ${String(c).padStart(5)}  ${k}`);
if (withFields) {
  console.log("");
  console.log(`why the classifier decided as it did, for the ${withFields} line(s) that carry it (route lines left out; quoted matches elided):`);
  for (const [k, c] of Object.entries(byWhy).sort()) console.log(`  ${String(c).padStart(5)}  ${k}`);
  if (lags.length) {
    const sorted = [...lags].sort((a, b) => a - b);
    console.log(`turn ended -> routing decided: median ${sorted[Math.floor(sorted.length / 2)]} ms, max ${sorted[sorted.length - 1]} ms over ${sorted.length} turn(s) - a gap between two client-side log lines, nothing more`);
  }
}
console.log("");
console.log(`candidates for the D318 regression (question or action, stayed hers): ${candidates} of ${total}`);
console.log(`asked of the knowledge base: ${asked} (answered ${answered}, declined ${declined}; a decline is silent on the voice path, D325/D327)`);
console.log(`conversations in this log to read for the numerator: ${conversations.size}${conversations.size ? " - " + [...conversations].join(", ") : ""}`);
console.log("the numerator - how many of those replies asserted a fact about the company, the machine or the tickets - is read from the service's transcripts by a person. Zero is the only acceptable number for the machine and the tickets.");
