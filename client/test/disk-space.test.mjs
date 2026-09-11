/**
 * Disk space: the dual threshold, the words, and the rule that it is NOT a restart signal.
 *
 * The measurements it is written against are in `research/2026-09-11-endpoint-telemetry-spec.md` §3
 * and were re-taken on the machine this was built on — five fixed volumes, two of which a naive
 * percentage rule flags and neither of which is in any trouble.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_DISK_POLICY, describeVolume, describeVolumes, spaceWords } from "../src/agent/disk-space.js";
import { scoreRestart } from "../src/agent/restart-signal.js";
import { fixedVolumes } from "../src/broker/win32/sysinfo.js";
import { probeMachine } from "../src/broker/capabilities/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");
const GB = 1024 ** 3;

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`); }
};

const codeOf = (rel) => readFileSync(join(SRC, rel), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

const vol = (root, freeGb, totalGb) => ({
  root, freeBytes: freeGb * GB, totalBytes: totalGb * GB, freeFraction: freeGb / totalGb,
});

// ==============================================================================================
console.log("\n=== 1. it takes BOTH a percentage and an absolute figure ===");
//
// THE MEASUREMENT THIS RULE EXISTS FOR. The spec's five volumes, and this machine's, put two
// volumes under 20% free with 160+ GB of headroom. A percentage rule alone raises two false alarms
// on a machine in perfect health; an absolute rule alone is meaningless on a small disk.
const SPEC_VOLUMES = [
  vol("C:\\", 164.7, 929.9),
  vol("D:\\", 414.2, 1848.9),
  vol("E:\\", 163.0, 931.5),
  vol("F:\\", 1658.9, 3725.9),
  vol("G:\\", 500.6, 1863.0),
];
const described = describeVolumes(SPEC_VOLUMES);
const naiveWouldFire = SPEC_VOLUMES.filter((v) => v.freeFraction < 0.2).length;
check("the spec's own five volumes: a naive \"below 20%\" rule fires twice", naiveWouldFire === 2, `fired ${naiveWouldFire}`);
check("…and the dual threshold flags none of them", described.every((d) => !d.lowOnSpace));
check("…and every one of them reads as healthy", described.every((d) => d.words === "Plenty of room"),
  described.map((d) => `${d.root} ${d.words}`).join(", "));

for (const [label, volume, expectLow] of [
  ["low % but 160 GB free", vol("C:\\", 163, 930), false],
  ["low % but 30 GB free (over the absolute floor)", vol("C:\\", 30, 900), false],
  ["24 GB free but 40% of a tiny disk", vol("C:\\", 24, 60), false],
  ["BOTH: 4% and 8 GB", vol("E:\\", 8, 200), true],
  ["BOTH: 0.6% and 24 GB on a 3.7 TB disk", vol("F:\\", 24, 3725), true],
  ["exactly at both floors is not below them", vol("C:\\", 25, 166.67), false],
]) {
  check(`${label}: ${expectLow ? "flagged" : "not flagged"}`, describeVolume(volume).lowOnSpace === expectLow);
}
check("a percentage alone can NEVER flag, at any size",
  [10, 100, 1000, 10000].every((tb) => !describeVolume(vol("X:\\", tb * 0.01, tb)).lowOnSpace === (tb * 0.01 >= 25)));
check("an absolute figure alone can NEVER flag, at any size",
  !describeVolume(vol("X:\\", 20, 40)).lowOnSpace, "20 GB free is half of a 40 GB disk");

// ==============================================================================================
console.log("\n=== 2. the words, and the figure behind them ===");
for (const [label, volume, words] of [
  ["plenty", vol("C:\\", 163, 930), "Plenty of room"],
  ["getting full", vol("D:\\", 40, 1849), "Getting full"],
  ["almost full", vol("E:\\", 8, 200), "Almost full"],
  ["just over the getting-full line", vol("D:\\", 51, 1849), "Plenty of room"],
]) {
  check(`${label}: "${words}"`, describeVolume(volume).words === words, describeVolume(volume).words);
}
check("the root is the drive letter, not the trailing slash", describeVolume(vol("C:\\", 1, 2)).root === "C:");
for (const [bytes, expected] of [
  [163 * GB, "163 GB"],
  [8 * GB, "8.0 GB"],
  [0.5 * GB, "512 MB"],
  [1658.9 * GB, "1659 GB"],
  [0, "0 MB"],
  [null, "an unknown amount"],
  [NaN, "an unknown amount"],
  [-1, "an unknown amount"],
]) {
  check(`${bytes} reads "${expected}"`, spaceWords(bytes) === expected, spaceWords(bytes));
}
// A DISK FIGURE IS LEGIBLE IN A WAY A COMMIT PERCENTAGE IS NOT, which is why this one is carried
// and that one is forbidden. But it is still a conclusion first.
check("no volume is described by a percentage",
  described.every((d) => !/%/.test(`${d.words} ${d.free}`)));

// ==============================================================================================
console.log("\n=== 3. NEVER AGGREGATED ===");
//
// A machine with 2.9 TB free across five volumes and 8 GB left on C: is in trouble, and a total
// says the opposite. The array is the answer.
check("one entry per volume, in order", described.length === SPEC_VOLUMES.length);
check("…and the roots are the real ones", described.map((d) => d.root).join(",") === "C:,D:,E:,F:,G:");
const diskCode = codeOf("agent/disk-space.js");
check("nothing sums free space", !/reduce|\+=/.test(diskCode));
check("nothing computes a whole-machine total", !/totalFree|aggregate|sumOf/i.test(diskCode));
{
  // The case the rule is FOR: one bad volume among four good ones must still be flagged.
  const mixed = describeVolumes([vol("C:\\", 8, 200), vol("D:\\", 1600, 3725), vol("E:\\", 500, 1863), vol("F:\\", 400, 1848)]);
  check("one bad volume among four good ones is still flagged", mixed.filter((d) => d.lowOnSpace).length === 1);
  check("…and it is the right one", mixed.find((d) => d.lowOnSpace)?.root === "C:");
}

// ==============================================================================================
console.log("\n=== 4. DISK IS NOT A RESTART SIGNAL ===");
//
// A full disk is exactly as full after a restart. The telemetry spec's §6 score table does not list
// disk, and rolling it in would produce the most useless recommendation this product could make.
{
  const healthy = {
    boot: { uptimeMs: 86400000 },
    flags: { readable: true, cbs: false, windowsUpdate: false, pendingFileRenames: 0 },
    memory: { commitUsedFraction: 0.4, physicalTotalBytes: 34e9 },
    memoryCompression: { fractionOfPhysical: 0.02 },
  };
  const withFullDisks = { ...healthy, volumes: [vol("C:\\", 1, 900)], disk: { lowOnSpace: true } };
  check("a machine with a full disk and nothing else scores 0",
    scoreRestart(withFullDisks).score === 0, `scored ${scoreRestart(withFullDisks).score}`);
  check("…and does not recommend a restart", scoreRestart(withFullDisks).recommend === false);
  check("…and the score is identical with and without the disks",
    scoreRestart(withFullDisks).score === scoreRestart(healthy).score);
}
const signalCode = codeOf("agent/restart-signal.js");
check("the restart signal does not import the disk module", !/disk-space/.test(signalCode));
check("…and never mentions a volume or a drive", !/volume|freeBytes|driveLetter/i.test(signalCode));
check("the disk module does not import the restart signal", !/restart-signal/.test(diskCode));
check("…and does not score anything", !/score|weight|recommend/i.test(diskCode));
// The probe keeps them in separate fields, which is what stops a later refactor merging them.
const probeCode = codeOf("broker/capabilities/index.js");
// `\s*` rather than `\n`: this file is CRLF in the working copy (`.gitattributes` normalises on
// add), and a regex that assumes `\n` passes on disk and fails here for a reason that has nothing
// to do with the rule being checked.
check("the probe returns `volumes` separately from `restart`",
  /\brestart,\s*volumes,/.test(probeCode), "if these merge, disk becomes a restart signal by accident");

// ==============================================================================================
console.log("\n=== 5. an unreadable disk is not a healthy disk ===");
check("null reads as no volumes, not as a reassuring row", describeVolumes(null).length === 0);
check("undefined likewise", describeVolumes(undefined).length === 0);
check("a non-array likewise", describeVolumes({ root: "C:" }).length === 0);
check("an empty list stays empty", describeVolumes([]).length === 0);
check("a volume with no total is dropped rather than divided by zero",
  describeVolumes([{ root: "C:\\", freeBytes: 10, totalBytes: 0 }]).length === 0);
check("a volume with a non-numeric free figure is dropped",
  describeVolumes([{ root: "C:\\", freeBytes: null, totalBytes: 100 }]).length === 0);
// And the collector's own guard: a volume it cannot read is skipped, never reported as zero free.
const sysCode = codeOf("broker/win32/sysinfo.js");
check("the collector skips a volume it cannot read rather than reporting zero free",
  /if \(!GetDiskFreeSpaceExW\([\s\S]{0,80}?continue;/.test(sysCode));
check("…and only FIXED drives are read", /DRIVE_FIXED/.test(sysCode) && /GetDriveTypeW\(root\) !== DRIVE_FIXED/.test(sysCode));
check("…and it reports the volume's free space, not this account's quota",
  /totalFree\[0\]/.test(sysCode) && !/freeToCaller\[0\]\)/.test(sysCode));

// ==============================================================================================
console.log("\n=== 6. the thresholds are configurable and documented as unvalidated ===");
const config = JSON.parse(readFileSync(join(SRC, "..", "config.json"), "utf8"));
for (const key of ["lowFraction", "lowBytes", "gettingFullBytes"]) {
  check(`diskPolicy.${key} is set`, typeof config.diskPolicy?.[key] === "number");
  check(`…and DEFAULT_DISK_POLICY has it, so omitting it is safe`, typeof DEFAULT_DISK_POLICY[key] === "number");
}
check("every configured value matches the code default",
  Object.entries(config.diskPolicy).every(([k, v]) => DEFAULT_DISK_POLICY[k] === v));
const note = String(config._diskPolicyNote ?? "");
check("the config says the numbers are unvalidated", /UNVALIDATED/.test(note));
check("…and says why the dual threshold exists", /false alarm/i.test(note));
check("…and says disk is NOT a restart signal", /NOT A RESTART SIGNAL/i.test(note));
// Overriding really changes the verdict.
{
  const c = vol("C:\\", 163, 930);
  check("C: is healthy on the defaults", !describeVolume(c).lowOnSpace);
  check("…and flagged if a tenant raises both floors",
    describeVolume(c, { ...DEFAULT_DISK_POLICY, lowFraction: 0.5, lowBytes: 500 * GB }).lowOnSpace);
  check("…but NOT if they raise only the percentage, which is the whole point",
    !describeVolume(c, { ...DEFAULT_DISK_POLICY, lowFraction: 0.5 }).lowOnSpace);
}

// ==============================================================================================
console.log("\n=== 7. this machine's real disks ===");
{
  const live = fixedVolumes();
  check("the collector reads at least one fixed volume", Array.isArray(live) && live.length > 0);
  const rows = describeVolumes(live);
  for (const [i, r] of rows.entries()) {
    const pct = (live[i].freeFraction * 100).toFixed(1);
    console.log(`    ${r.root}  ${r.words.padEnd(15)} ${r.free.padStart(9)} free  (${pct}%)${r.lowOnSpace ? "  FLAGGED" : ""}`);
  }
  const naive = live.filter((v) => v.freeFraction < 0.2).length;
  const dual = rows.filter((r) => r.lowOnSpace).length;
  console.log(`    a naive "below 20% free" rule would fire on ${naive}; the dual threshold fires on ${dual}`);
  check("every volume has a total larger than its free space", live.every((v) => v.totalBytes >= v.freeBytes));
  check("every volume produced words", rows.every((r) => typeof r.words === "string" && r.words.length > 0));
  check("the probe carries them", Array.isArray(probeMachine().volumes));
  // Not an assertion about THIS machine's health - just that the two rules can disagree, which is
  // the finding the dual threshold exists for and which held on both machines measured.
  if (naive > dual) console.log(`    (the two rules disagree here, which is exactly the case §3 was written for)`);
}

// ==============================================================================================
console.log(`\n${"=".repeat(94)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(94)}`);
if (fail) process.exit(1);
