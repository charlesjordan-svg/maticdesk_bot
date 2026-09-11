/**
 * The machine band's structure and its marks (D258).
 *
 * This is the file that decides WHAT A USER IS POINTED AT, so it is tested behaviourally against
 * machines that do not exist. `renderer.js` cannot be imported by a test; that is exactly why the
 * verdict lives here and not there.
 *
 * The rules come from Claude Design's delivery of 2026-09-11, in its own words, and from the
 * decisions the panel already carried.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { machineBandGroups, serviceWords, serviceRow, marksIn } from "../src/agent/machine-band.js";
import { describeVolumes } from "../src/agent/disk-space.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");
const GB = 1024 ** 3;

let pass = 0;
let fail = 0;
const check = (n, ok, d = "") => { if (ok) { pass++; console.log(`  ok    ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? " - " + d : ""}`); } };

const codeOf = (rel) => readFileSync(join(SRC, rel), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

const HEALTHY = {
  identity: { computer: "PLACEHOLDER-PC", user: "placeholder.user" },
  summary: {
    online: "yes", adapter: "Fake Gigabit", ip: "10.0.0.42", gateway: "10.0.0.1",
    spooler: "RUNNING", audio: "RUNNING", dhcp: "RUNNING",
  },
  restart: { boot: { uptimeMs: 86400000 }, memory: { commitUsedFraction: 0.4 } },
  volumes: describeVolumes([{ root: "C:\\", freeBytes: 163 * GB, totalBytes: 930 * GB, freeFraction: 163 / 930 }]),
  restartRecommended: false,
};
const band = (over = {}) => machineBandGroups({ ...HEALTHY, ...over });
const rows = (g) => g.flatMap((x) => x.rows);
const row = (g, label) => rows(g).find((r) => r.label === label);

// ==============================================================================================
console.log("\n=== 1. A HEALTHY MACHINE CARRIES NOT ONE MARK ===");
//
// The delivery: "DO NOT SET data-state='ok'. A mark that says 'fine' is fifteen marks on a healthy
// machine, which is the defect this is fixing, not a fix."
{
  const g = band();
  const marked = rows(g).filter((r) => r.state);
  check("nothing is marked on a healthy machine", marked.length === 0,
    marked.map((r) => `${r.label}=${r.state}`).join(", "));
  check("…and `marksIn` reports none", marksIn(g).length === 0);
  check("no row anywhere ever carries state \"ok\"", !rows(g).some((r) => r.state === "ok"));
}
// And across a wide spread of healthy readings, still nothing.
for (const [label, over] of [
  ["freshly booted", { restart: { boot: { uptimeMs: 0 }, memory: { commitUsedFraction: 0.1 } } }],
  ["memory at 74%", { restart: { boot: { uptimeMs: 86400000 }, memory: { commitUsedFraction: 0.74 } } }],
  ["a drive at 17.5% free with 163 GB", {}],
  ["five healthy drives", {
    volumes: describeVolumes(["C", "D", "E", "F", "G"].map((l, i) => ({
      root: `${l}:\\`, freeBytes: [163, 414, 163, 1659, 501][i] * GB,
      totalBytes: [930, 1849, 932, 3726, 1863][i] * GB,
      freeFraction: [163 / 930, 414 / 1849, 163 / 932, 1659 / 3726, 501 / 1863][i],
    }))),
  }],
]) {
  check(`${label}: still not one mark`, rows(band(over)).every((r) => !r.state));
}
// The `ok` state must not be producible at all, by any input — checked at the source too.
check("the word \"ok\" is not a state anywhere in the module", !/state:\s*"ok"/.test(codeOf("agent/machine-band.js")));
check("…nor in the disk module that supplies the volume marks", !/state:\s*"ok"/.test(codeOf("agent/disk-space.js")));

// ==============================================================================================
console.log("\n=== 2. THE MARK COMES FROM THE VERDICT, NEVER FROM THE WORDS ===");
//
// The delivery: "Keyed off YOUR verdict, never off the number in the string. … 17.5% and 163 GB
// free is not this, and never becomes this, because the design cannot see either figure."
//
// THIS IS THE ASSERTION THE WHOLE SEVERITY DESIGN RESTS ON. A percentage-only rule flags two
// healthy volumes on the machine this was built on.
{
  const seventeen = describeVolumes([{ root: "C:\\", freeBytes: 163 * GB, totalBytes: 930 * GB, freeFraction: 163 / 930 }]);
  check("a volume at 17.5% free with 163 GB is UNMARKED", band({ volumes: seventeen }).at(-1).rows[0].state === undefined,
    "if this ever marks, the dual threshold has been bypassed");
  check("…and it still reads \"Plenty of room\"", /Plenty of room/.test(band({ volumes: seventeen }).at(-1).rows[0].value));

  const both = describeVolumes([{ root: "C:\\", freeBytes: 8 * GB, totalBytes: 200 * GB, freeFraction: 0.04 }]);
  check("a volume under BOTH floors is marked attn", band({ volumes: both }).at(-1).rows[0].state === "attn");

  const gettingFull = describeVolumes([{ root: "D:\\", freeBytes: 40 * GB, totalBytes: 1849 * GB, freeFraction: 40 / 1849 }]);
  check("a volume under the absolute floor only is \"watch\", not \"attn\"",
    band({ volumes: gettingFull }).at(-1).rows[0].state === "watch");

  // A tiny disk that is proportionally fine must not be flagged either.
  const tiny = describeVolumes([{ root: "X:\\", freeBytes: 24 * GB, totalBytes: 60 * GB, freeFraction: 0.4 }]);
  check("24 GB free on a 60 GB disk is not attn — the percentage saves it", tiny[0].state !== "attn");
}
// The words never change because of the state. Same reading, same string, marked or not.
{
  const marked = band({ restartRecommended: true });
  const unmarked = band({ restartRecommended: false });
  check("marking a row does not change its words",
    row(marked, "Last restarted").value === row(unmarked, "Last restarted").value);
  check("…and the mark is the only difference",
    row(marked, "Last restarted").state === "attn" && row(unmarked, "Last restarted").state === undefined);
}

// ==============================================================================================
console.log("\n=== 3. `unread` is the quiet state, and it is not a warning ===");
//
// "the probe could not read it. Not a warning: it takes the quiet token, not the attention one."
for (const [label, over, expect] of [
  ["a service the probe could not read", { summary: { ...HEALTHY.summary, spooler: "?" } }, "unread"],
  ["a service with no reading at all", { summary: { ...HEALTHY.summary, spooler: null } }, "unread"],
  ["a stopped service", { summary: { ...HEALTHY.summary, spooler: "STOPPED" } }, "attn"],
  ["an unreadable boot time", { restart: { boot: null, memory: { commitUsedFraction: 0.4 } } }, "unread"],
  ["unreadable memory", { restart: { boot: { uptimeMs: 86400000 }, memory: null } }, "unread"],
]) {
  const g = band(over);
  const r = over.summary ? row(g, "Printing") : row(g, over.restart?.boot === null ? "Last restarted" : "Memory");
  check(`${label}: ${expect}`, r.state === expect, `got ${r.state}`);
}
check("an unreadable service says so rather than reading as stopped",
  row(band({ summary: { ...HEALTHY.summary, spooler: "?" } }), "Printing").value === "Couldn't read it from here");
check("…which is NOT the stopped wording", serviceWords("?") !== serviceWords("STOPPED"));
check("an unreadable boot time reads \"Not known\", never a duration",
  row(band({ restart: { boot: null, memory: { commitUsedFraction: 0.4 } } }), "Last restarted").value === "Not known");

// ==============================================================================================
console.log("\n=== 4. memory's mark follows the same band function as its words ===");
for (const [commit, words, state] of [
  [0.4, "Plenty free", undefined],
  [0.74, "Plenty free", undefined],
  [0.75, "Filling up", "watch"],
  [0.89, "Filling up", "watch"],
  [0.9, "Almost full", "attn"],
  [0.99, "Almost full", "attn"],
  [null, "Not known", "unread"],
]) {
  const r = row(band({ restart: { boot: { uptimeMs: 86400000 }, memory: commit === null ? null : { commitUsedFraction: commit } } }), "Memory");
  check(`commit ${commit}: "${r.value}" / ${r.state}`, r.value === words && r.state === state, `got "${r.value}" / ${r.state}`);
  check(`…and the row still carries no digit`, !/\d/.test(r.value));
}

// ==============================================================================================
console.log("\n=== 5. the groups ===");
{
  const g = band();
  console.log("    " + g.map((x) => `${x.group} (${x.rows.length})`).join(" · "));
  check("five groups on a machine with a drive", g.length === 5);
  check("every group has a name, so every set draws a heading",
    g.every((x) => typeof x.group === "string" && x.group.length > 0));
  check("the storage group is flagged for the delivery's tighter treatment",
    g.at(-1).group === "Storage" && g.at(-1).volumes === true);
  check("…and no other group is", g.slice(0, -1).every((x) => !x.volumes));
  check("identity comes first — on a support call the first question is which machine, and who",
    g[0].rows[0].label === "This computer" && g[0].rows[1].label === "Signed in as");
  // Every label appears exactly once, across every group.
  const labels = rows(g).map((r) => r.label);
  check("no label appears twice", new Set(labels).size === labels.length);
  check("a machine with no drives has no storage group", band({ volumes: [] }).length === 4);
  check("…and still has the other four", band({ volumes: [] }).every((x) => x.group !== "Storage"));
}
// The address rows are conditional, and never marked: `Network` already carries the verdict.
{
  const withNone = band({ summary: { ...HEALTHY.summary, ip: "-", gateway: "-" } });
  check("the address rows drop out when there is no address", !row(withNone, "This machine's address"));
  check("…and the router row with them", !row(withNone, "Router"));
  check("the address rows are never marked",
    !row(band(), "This machine's address").state && !row(band(), "Router").state);
}
// D245: one fact, one surface. The adapter row does not repeat what `Network` says.
{
  const offline = band({ summary: { ...HEALTHY.summary, online: "no", adapter: "none", ip: "-", gateway: "-" } });
  check("a disconnected machine marks `Network`", row(offline, "Network").state === "attn");
  check("…and does NOT also mark the adapter row — that would say one fact twice",
    row(offline, "Network adapter").state === undefined);
  check("…though the adapter row still says none was found", row(offline, "Network adapter").value === "None found");
  check("a connected machine does not mark Network", row(band(), "Network").state === undefined);
}

// ==============================================================================================
console.log("\n=== 6. a mark is not advice (D256) ===");
//
// The row states a fact; the recommendation is a separate conversational moment. A mark says
// "this one"; it may never say "do something".
const ADVICE = /should|ought|need to|recommend|try |please|restart it|free up|delete|clean/i;
for (const over of [
  {},
  { restartRecommended: true },
  { summary: { ...HEALTHY.summary, spooler: "STOPPED", online: "no" } },
  { restart: { boot: { uptimeMs: 60 * 86400000 }, memory: { commitUsedFraction: 0.97 } }, restartRecommended: true },
  { volumes: describeVolumes([{ root: "C:\\", freeBytes: 2 * GB, totalBytes: 200 * GB, freeFraction: 0.01 }]) },
]) {
  const bad = rows(band(over)).filter((r) => ADVICE.test(r.value));
  check(`no row gives advice${Object.keys(over).length ? " (a machine in trouble)" : " (healthy)"}`,
    bad.length === 0, bad.map((r) => `${r.label}: ${r.value}`).join(" | "));
}
// Nor does a group heading.
check("no group heading gives advice", band({ restartRecommended: true }).every((g) => !ADVICE.test(g.group)));
// And no snake_case or internal vocabulary reaches a value (D244/D246).
for (const r of rows(band({ restartRecommended: true, summary: { ...HEALTHY.summary, spooler: "STOPPED" } }))) {
  check(`"${r.value}" carries no snake_case`, !/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/.test(r.value));
  check(`…and does not say "hub" or a URL`, !/\bhubs?\b|https?:\/\//i.test(r.value));
}

// ==============================================================================================
console.log("\n=== 7. only three states are ever produced ===");
{
  const seen = new Set();
  for (const over of [
    {}, { restartRecommended: true },
    { summary: { ...HEALTHY.summary, spooler: "STOPPED", audio: "?", online: "no" } },
    { restart: { boot: null, memory: null } },
    { restart: { boot: { uptimeMs: 1 }, memory: { commitUsedFraction: 0.8 } } },
    { volumes: describeVolumes([
      { root: "C:\\", freeBytes: 8 * GB, totalBytes: 200 * GB, freeFraction: 0.04 },
      { root: "D:\\", freeBytes: 40 * GB, totalBytes: 1849 * GB, freeFraction: 40 / 1849 },
    ]) },
  ]) for (const r of rows(band(over))) if (r.state) seen.add(r.state);
  console.log(`    states produced across every shape: ${[...seen].sort().join(", ")}`);
  check("only attn, watch and unread are ever produced",
    [...seen].every((s) => ["attn", "watch", "unread"].includes(s)), [...seen].join(", "));
  check("…and all three are reachable", seen.has("attn") && seen.has("watch") && seen.has("unread"));
}
// The delivery draws exactly these three and no more.
{
  const panelCss = readFileSync(join(SRC, "renderer/panel/matic-panel.css"), "utf8");
  const drawn = [...new Set([...panelCss.matchAll(/\.mrow\[data-state="([a-z]+)"\]/g)].map((m) => m[1]))].sort();
  console.log(`    states the delivery draws: ${drawn.join(", ")}`);
  check("every state the app sets is one the delivery draws",
    ["attn", "watch", "unread"].every((s) => drawn.includes(s)), drawn.join(", "));
  check("…and the delivery draws no state the app never sets",
    drawn.every((s) => ["attn", "watch", "unread"].includes(s)), drawn.join(", "));
}

// ==============================================================================================
console.log("\n=== 8. the renderer sets what it is handed, and reads nothing back ===");
{
  const rendererCode = codeOf("renderer/renderer.js");
  check("it sets data-state from `r.state`", /row\.dataset\.state = r\.state/.test(rendererCode));
  check("it sets data-group from `set.group`", /dl\.dataset\.group = set\.group/.test(rendererCode));
  check("…only when there is one, so an unnamed set draws no heading", /if \(set\.group\)/.test(rendererCode));
  check("it uses the delivery's volumes class for the volumes group",
    /set\.volumes \? "mset mset-volumes" : "mset"/.test(rendererCode));
  // THE RULE: no branching on a row's words anywhere in the renderer.
  check("it never compares or parses a row VALUE",
    !/r\.value\s*===|r\.value\.(?:match|includes|indexOf|startsWith|test)|\/.*\/\.test\(r\.value/.test(rendererCode),
    "a renderer that coloured on the words would put the 17.5% false alarm back");
  check("`serviceWords` has one home and the renderer imports it",
    !/function serviceWords/.test(rendererCode) && /import \{ serviceWords \} from "\.\.\/agent\/machine-band\.js"/.test(rendererCode));
}
// And `serviceRow` and `serviceWords` cannot drift, because one calls the other.
for (const s of ["RUNNING", "STOPPED", "?", null, "START_PENDING"]) {
  check(`serviceRow("x", ${JSON.stringify(s)}) says exactly what serviceWords says`,
    serviceRow("x", s).value === serviceWords(s));
}

console.log(`\n${"=".repeat(94)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(94)}`);
if (fail) process.exit(1);
