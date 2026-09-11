/**
 * The restart signal, from probe to sentence.
 *
 * This file IS the acceptance list of `docs/handovers/2026-09-11-claude-code-handover-restart-signal.md`
 * §7, in order, plus the score table and one live read of this machine. Where a criterion is about
 * what the code does NOT do, it is checked by scanning source with comments removed - the files
 * here are heavily commented precisely because the reasons matter, and `grep Get-Counter` over the
 * whole of `sysinfo.js` finds the paragraph explaining why it is never used.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_RESTART_POLICY,
  scoreRestart,
  restartSentence,
  restartAdvice,
  lastRestartedPhrase,
  createRestartGate,
  memoryBand,
  memoryWords,
} from "../src/agent/restart-signal.js";
import { restartSignals, bootInstant } from "../src/broker/win32/sysinfo.js";
import { probeMachine } from "../src/broker/capabilities/index.js";
import { machineBandGroups } from "../src/agent/machine-band.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");

let pass = 0;
let fail = 0;
/** @param {string} name @param {boolean} ok @param {string} [detail] */
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`); }
}

/** A source file with its prose removed, so a rule about CODE is not satisfied or broken by a comment. */
const codeOf = (rel) => readFileSync(join(SRC, rel), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

const sysinfoSource = readFileSync(join(SRC, "broker/win32/sysinfo.js"), "utf8");
const sysinfoCode = codeOf("broker/win32/sysinfo.js");
const signalCode = codeOf("agent/restart-signal.js");
const agentCode = codeOf("agent/agent.js");
const rendererCode = codeOf("renderer/renderer.js");
const preloadCode = codeOf("main/preload.cjs");
const config = JSON.parse(readFileSync(join(SRC, "..", "config.json"), "utf8"));

/** A machine, described. Every field is independently nullable, as the real collector's are. */
const machine = ({ uptimeDays = 1, commit = 0.5, compression = 0.05, cbs = false, wu = false, renames = 0 } = {}) => ({
  boot: uptimeDays === null ? null : { uptimeMs: uptimeDays * 86400000 },
  flags: { readable: true, cbs, windowsUpdate: wu, pendingFileRenames: renames, pendingFileRenameEntries: [] },
  memory: commit === null ? null : { commitUsedFraction: commit, physicalTotalBytes: 34e9 },
  memoryCompression: compression === null ? null : { fractionOfPhysical: compression },
});

// ==============================================================================================
console.log("\n=== 1. uptime comes from LastBootUpTime, and no tick counter is used ===");
//
// `[Environment]::TickCount` is 32-bit and wraps at 49.7 days, so a machine up for 60 days reports
// as freshly booted - the machines that most need flagging are exactly the ones that would report
// clean. This is the check that a later "simplification" to a tick counter cannot pass.
check("the collector names LastBootUpTime as the source it reproduces",
  /LastBootUpTime/.test(sysinfoCode), "the `source` field should say what it is equivalent to");
check("no tick counter is called anywhere in the collector",
  !/GetTickCount(64)?\s*\(/.test(sysinfoCode) && !/\bTickCount\b/.test(sysinfoCode),
  "GetTickCount64 is fine natively and is still not what this reads - an absolute instant is");
check("…nor anywhere else in the agent or the renderer",
  !/TickCount/.test(signalCode) && !/TickCount/.test(agentCode) && !/TickCount/.test(rendererCode));
check("the boot instant is read from SystemTimeOfDayInformation",
  /SystemTimeOfDayInformation/.test(sysinfoCode));
check("…and corrected by BootTimeBias, which is what makes it LastBootUpTime rather than 7.6 s from it",
  /bootTimeBiasMs/.test(sysinfoCode) && /kernelBootTimeMs/.test(sysinfoCode));
check("the raw kernel value is kept alongside it, so the two cannot be silently conflated",
  /kernelBootTimeMs,/.test(sysinfoCode));
// The measurement itself is recorded in the file, because a number nobody can find again is a
// number nobody can re-check.
check("the file records the measurement that established the identity",
  /1788996024500/.test(sysinfoSource), "the exact-match measurement of 2026-09-11");

// ==============================================================================================
console.log("\n=== 2. an unreadable probe cannot produce an uptime of zero ===");
//
// `[Environment]::TickCount64` returned EMPTY on Windows PowerShell 5.1 on the spec's test host
// rather than throwing, so a collector reading it without a null check computes an uptime of zero
// and NEVER FIRES. This build does not read that property, so the criterion is carried at the
// level the defect actually lives at: a value that cannot be read must not become a number.
for (const [label, signals] of [
  ["boot is null", machine({ uptimeDays: null })],
  ["boot has no uptime", { boot: {}, flags: null, memory: null, memoryCompression: null }],
  ["uptime is undefined", { boot: { uptimeMs: undefined }, flags: null, memory: null, memoryCompression: null }],
  ["uptime is NaN", { boot: { uptimeMs: NaN }, flags: null, memory: null, memoryCompression: null }],
  ["uptime is an empty string, as the PowerShell property was", { boot: { uptimeMs: "" }, flags: null, memory: null, memoryCompression: null }],
  ["uptime is negative", { boot: { uptimeMs: -1 }, flags: null, memory: null, memoryCompression: null }],
  ["the whole signal is null", null],
]) {
  const scored = scoreRestart(signals);
  check(`${label}: scores no uptime contribution`, !scored.contributions.some((c) => c.id.startsWith("uptime")));
  check(`${label}: reports uptime as unknown rather than as fine`, scored.unknown.includes("uptime"));
  check(`${label}: the row says "Not known", never a duration`,
    lastRestartedPhrase(signals?.boot?.uptimeMs ?? null) === "Not known",
    `said "${lastRestartedPhrase(signals?.boot?.uptimeMs ?? null)}"`);
}
// And the collector's own guard: a zero or reversed kernel reading returns null rather than a number.
check("the collector returns null for an unreadable boot time rather than a zero",
  /return null;/.test(sysinfoCode.match(/export function bootInstant[\s\S]*?\n}/)?.[0] ?? ""));
check("…and it guards a zero, an epoch and a boot in the future explicitly",
  /bootTime === 0n \|\| currentTime === 0n \|\| currentTime < bootTime/.test(sysinfoCode));
// A real uptime of zero is a legitimate reading and must still be reported as one.
check("a genuinely fresh boot still reads as a fresh boot", lastRestartedPhrase(0) === "Less than an hour ago");

// ==============================================================================================
console.log("\n=== 3. PendingFileRenameOperations alone cannot produce a recommendation ===");
//
// THE TRAP THE SPEC CORRECTED ITSELF ON. That key had two entries on a machine Windows Update had
// fully rebooted 27 hours earlier and which needed nothing at all, and one entry on the machine
// this was built on. Installers, antivirus and update staging populate it routinely and it often
// persists harmlessly.
{
  const alone = scoreRestart(machine({ uptimeDays: 1, commit: 0.1, compression: 0.01, renames: 2 }));
  check("present, and nothing else: no recommendation", alone.recommend === false, `score ${alone.score}`);
  check("…and it did contribute, so this is not passing because it was ignored",
    alone.contributions.some((c) => c.id === "pendingFileRenames"));
  check("…and it is marked as never-alone rather than merely outweighed",
    alone.contributions.find((c) => c.id === "pendingFileRenames")?.neverAlone === true);
  check("…and the scorer says why: nothing corroborated it", alone.corroborated === false);

  // THE POINT OF `neverAlone` BEING STRUCTURAL: the weight and the threshold are both configurable
  // defaults and both are meant to be moved. A tenant who sets the threshold to 1 must still not
  // get a recommendation from this key by itself.
  const withThresholdAtOne = scoreRestart(
    machine({ uptimeDays: 1, commit: 0.1, compression: 0.01, renames: 2 }),
    { ...DEFAULT_RESTART_POLICY, recommendAtScore: 1 }
  );
  check("…even with the threshold configured down to 1", withThresholdAtOne.recommend === false,
    "this is the assertion that arithmetic alone would not survive");
  const withWeightRaised = scoreRestart(
    machine({ uptimeDays: 1, commit: 0.1, compression: 0.01, renames: 2 }),
    { ...DEFAULT_RESTART_POLICY, weights: { ...DEFAULT_RESTART_POLICY.weights, pendingFileRenames: 9 } }
  );
  check("…even with its own weight configured up past the threshold", withWeightRaised.recommend === false);

  // But it DOES corroborate, which is the whole reason it is collected.
  const corroborating = scoreRestart(machine({ uptimeDays: 20, commit: 0.8, renames: 2 }));
  check("it still adds to a score that has other evidence in it", corroborating.score === 3,
    `score ${corroborating.score}`);
  check("…and that combination does recommend", corroborating.recommend === true);
  // And it never appears as a REASON in the sentence: it is corroboration, and it reads as a cause.
  check("it is never quoted as evidence in the sentence",
    !restartSentence(corroborating).includes("swapped out"));
}

// ==============================================================================================
console.log("\n=== 4. no Get-Counter, no PowerShell, no .ps1 ===");
//
// `Get-Counter` terminated the PowerShell host twice during the spec's probe - no output, no
// exception - and it resolves LOCALIZED counter names, so it breaks on non-English Windows. And a
// dropped `.ps1` was blocked by execution policy on the test machine, with
// `-ExecutionPolicy Bypass -File` blocked too by a Group Policy at MachinePolicy scope.
//
// The repo's own rule for `src/broker/win32/*` is stricter than the handover's and is what is
// actually enforced here: native calls only, because spawning a shell is the behaviour EDR flags.
for (const [rel, code] of [
  ["broker/win32/sysinfo.js", sysinfoCode],
  ["agent/restart-signal.js", signalCode],
  ["agent/agent.js", agentCode],
]) {
  check(`${rel}: no Get-Counter`, !/Get-Counter/i.test(code));
  check(`${rel}: no powershell`, !/powershell/i.test(code));
  check(`${rel}: no .ps1`, !/\.ps1\b/.test(code));
  // Named spawns, not `\bexec\(`: that pattern matches `RegExp.prototype.exec(xml)` in the
  // event-log parser, which is a regular expression and not a process.
  check(`${rel}: no shell spawn`, !/child_process|execSync|spawnSync|execFileSync|\bspawn\(/.test(code));
  check(`${rel}: no cmd.exe or wmic`, !/cmd\.exe|wmic/i.test(code));
}
check("the memory reading is a native call, not a counter path",
  /K32GetPerformanceInfo/.test(sysinfoCode));
check("…and it is not a localized counter name", !/\\Memory\\|Committed Bytes/.test(sysinfoCode));

// ==============================================================================================
console.log("\n=== 5. commit charge is collected, and never rendered as a number ===");
{
  const live = restartSignals();
  check("the collector reads commit charge", typeof live.memory?.commitUsedFraction === "number",
    "this is the single most useful input in the score");
  check("…and it scores", scoreRestart(machine({ commit: 0.95 })).contributions.some((c) => c.id === "commitHigh"));

  // THE STRUCTURAL HALF. `panel` is the only object the renderer receives, and it does not carry a
  // commit figure at all - so the rule cannot be broken later by forgetting a condition. That is
  // D226's technique rather than a rule someone has to remember.
  const panel = { ...(probeMachine() ? {} : {}), ...{} };
  void panel;
  // The whole `const panel = { … };` block, read back rather than one literal - it is a multi-line
  // object since the memory row and the volumes joined it, and the rule is about what is IN it.
  const panelBlock = agentCode.match(/const panel = \{[\s\S]*?\n    \};/)?.[0] ?? "";
  check("the panel construction is found", panelBlock.length > 0);
  check("it is built from identity and summary plus derived phrases",
    /\.\.\.identity/.test(panelBlock) && /\.\.\.summary/.test(panelBlock));
  // THE RULE IS ABOUT WHAT THE OBJECT CARRIES, NOT WHAT IT READS. The block legitimately reads
  // `commitUsedFraction` in order to turn it into words; what it may never do is keep it as a
  // FIELD, because a field on `panel` is a field the renderer can print. So this looks for a
  // property key, which is the thing that would actually ship the number.
  check("the panel object the renderer receives carries NO commit figure as a field",
    !/^\s*commit\w*\s*:/m.test(panelBlock), "a `commit…:` key on `panel` is a number one line from a screen");
  check("…and the only mention of commit is the argument it converts to words",
    (panelBlock.match(/commit/gi) ?? []).length === 1 && /memoryWords\([^)]*commitUsedFraction/.test(panelBlock));
  check("…and memory reaches it only through the words function",
    /memory: memoryWords\(/.test(panelBlock));
  check("…and nothing puts raw bytes on it",
    !/Bytes\b/.test(panelBlock), "volumes arrive already reduced to words plus a free-space phrase");
  check("…and `summary` (which is also cloud-facing) carries no memory figure",
    !/commit|physicalTotal|memoryCompression/i.test(agentCode.match(/const summary = \{[\s\S]*?\};/)?.[0] ?? ""));

  // The words it turns into instead. Scored on commit ALONE, so the only clause in the sentence is
  // the memory one and "carries no digit" is exact rather than approximate - the uptime clause
  // legitimately carries a day count, and the row carries one too.
  for (const commit of [0.76, 0.95]) {
    const sentence = restartSentence(scoreRestart(machine({ uptimeDays: 0.5, commit, compression: 0.01 })));
    check(`commit ${commit} alone: the sentence carries no digit at all`, !/\d/.test(sentence), sentence);
    check(`commit ${commit} alone: no percent sign`, !sentence.includes("%"));
    check(`commit ${commit} alone: does not say "commit"`, !/commit/i.test(sentence));
    check(`commit ${commit} alone: no byte or gigabyte figure`, !/\bGB\b|bytes/i.test(sentence));
  }
  // And the words differ by how full it actually is, which is the whole reason a figure is not needed.
  check("95% reads as almost completely full",
    /almost completely full/.test(restartSentence(scoreRestart(machine({ uptimeDays: 0.5, commit: 0.95, compression: 0.01 })))));
  check("76% reads as filling up",
    /filling up/.test(restartSentence(scoreRestart(machine({ uptimeDays: 0.5, commit: 0.76, compression: 0.01 })))));
  // ---- the row says what the number MEANS, which is not the same as showing it ---------------
  //
  // Until 2026-09-11 the reading was scored and completely invisible. Acceptance 5 forbids the
  // FIGURE on a user surface; it does not forbid the conclusion, and "the panel shows conclusions,
  // not measurements" positively asks for one.
  for (const [fraction, band, words] of [
    [0.4, "roomLeft", "Plenty free"],
    [0.749, "roomLeft", "Plenty free"],
    [0.75, "fillingUp", "Filling up"],
    [0.899, "fillingUp", "Filling up"],
    [0.9, "almostFull", "Almost full"],
    [0.97, "almostFull", "Almost full"],
    [null, null, "Not known"],
    [NaN, null, "Not known"],
    [undefined, null, "Not known"],
  ]) {
    check(`commit ${fraction}: band ${band}, row "${words}"`,
      memoryBand(fraction) === band && memoryWords(fraction) === words,
      `band=${memoryBand(fraction)} row="${memoryWords(fraction)}"`);
    check(`…and the row carries no digit`, !/\d/.test(memoryWords(fraction)));
  }
  // ONE BAND FUNCTION, TWO SURFACES. If the row and the sentence had their own bands they could
  // describe one machine two ways at the boundary - D242's rule, one surface along.
  for (const fraction of [0.749, 0.75, 0.899, 0.9]) {
    const sentence = restartSentence(scoreRestart(machine({ uptimeDays: 0.5, commit: fraction, compression: 0.01 })));
    const band = memoryBand(fraction);
    if (band === "almostFull") {
      check(`at ${fraction} the row and the sentence agree on "almost full"`,
        memoryWords(fraction) === "Almost full" && /almost completely full/.test(sentence));
    } else if (band === "fillingUp") {
      check(`at ${fraction} the row and the sentence agree on "filling up"`,
        memoryWords(fraction) === "Filling up" && /filling up/.test(sentence));
    }
  }
  // And the case that made a shared band necessary: a tenant-lowered threshold scores a reading the
  // row honestly calls "Plenty free", so the sentence names NO memory evidence rather than
  // contradicting it.
  {
    const lowered = { ...DEFAULT_RESTART_POLICY, recommendAtScore: 1, commitElevatedFraction: 0.5 };
    const scored = scoreRestart(machine({ uptimeDays: 0.5, commit: 0.6, compression: 0.01 }), lowered);
    check("a tenant-lowered commit threshold still scores", scored.contributions.some((c) => c.id === "commitElevated"));
    check("…but names no evidence the row would contradict",
      scored.contributions.find((c) => c.id === "commitElevated")?.evidence === null);
    check("…and the row reads honestly at that reading", memoryWords(0.6) === "Plenty free");
    check("…and the sentence does not claim memory pressure",
      !/memory/.test(restartSentence(scored)), restartSentence(scored));
  }

  // The renderer is the other half: it may not render a commit figure even if one reached it.
  check("the renderer never reads a commit field", !/commitUsed|commitLimit|commitFraction/i.test(rendererCode));
  check("the renderer never renders a score either", !/restartAdvice\.score|advice\.score/.test(
    rendererCode.replace(/devlog\([^;]*\);/g, "")), "the score may go to the developer log and nowhere else");
}

// ==============================================================================================
console.log("\n=== 6. the thresholds are configurable, and documented as unvalidated ===");
check("config.json carries a restartPolicy", typeof config.restartPolicy === "object" && config.restartPolicy !== null);
for (const key of [
  "recommendAtScore", "uptimeLongDays", "uptimeElevatedDays",
  "commitHighFraction", "commitElevatedFraction", "memoryCompressionFraction",
  "raiseSuppressionHours", "declineSuppressionHours", "deferHours",
]) {
  check(`restartPolicy.${key} is set`, typeof config.restartPolicy?.[key] === "number");
  check(`…and DEFAULT_RESTART_POLICY has it too, so omitting it is safe`,
    typeof DEFAULT_RESTART_POLICY[key] === "number");
}
check("every configured value matches the code default, so the file documents rather than diverges",
  Object.entries(config.restartPolicy).every(([k, v]) => DEFAULT_RESTART_POLICY[k] === v),
  Object.entries(config.restartPolicy).filter(([k, v]) => DEFAULT_RESTART_POLICY[k] !== v).map(([k]) => k).join(", "));
// The note is the part that matters: a number a tenant can move is still a guess, and the file has
// to say so where the number is, not only in a document nobody opens.
const note = String(config._restartPolicyNote ?? "");
check("the config says the numbers are unvalidated", /UNVALIDATED/.test(note));
check("…and that no source establishes 30 days, or any figure", /no verified source/i.test(note));
check("…and what would validate them", /ticket outcomes/i.test(note));
check("…and why they are config rather than constants", /a default is a starting point/i.test(note));
check("the module says the same thing where the defaults are declared",
  /policy proposal/i.test(readFileSync(join(SRC, "agent/restart-signal.js"), "utf8")));
// Overriding one really does change the verdict, which is what "configurable" has to mean.
{
  const fortyDays = machine({ uptimeDays: 40, commit: 0.1, compression: 0.01 });
  check("uptime 40 days scores 3 on the default threshold of 30", scoreRestart(fortyDays).score === 3);
  check("…and 0 when the threshold is configured to 60",
    scoreRestart(fortyDays, { ...DEFAULT_RESTART_POLICY, uptimeLongDays: 60, uptimeElevatedDays: 45 }).score === 0);
}

// ==============================================================================================
console.log("\n=== 7. the row reads plainly and carries no advice ===");
for (const [ms, expected] of [
  [null, "Not known"],
  [0, "Less than an hour ago"],
  [59 * 60000, "Less than an hour ago"],
  [3600000, "1 hour ago"],
  [5 * 3600000, "5 hours ago"],
  [86400000, "1 day ago"],
  [2 * 86400000, "2 days ago"],
  [34.7 * 86400000, "34 days ago"],
]) {
  check(`${ms === null ? "null" : ms + " ms"} reads "${expected}"`, lastRestartedPhrase(ms) === expected,
    `said "${lastRestartedPhrase(ms)}"`);
}
// The spec's own example, exactly: "Last restarted: 2 days ago".
check("the handover's example phrase is what it produces", lastRestartedPhrase(2 * 86400000) === "2 days ago");
// NO ADVICE. The row states a fact; the recommendation is a conversation moment, and a row that
// argues argues every time the band is opened.
const ADVICE = /should|ought|need to|recommend|try |please|restart|overdue|too long|worth /i;
for (const ms of [null, 0, 3600000, 86400000, 40 * 86400000, 400 * 86400000]) {
  const phrase = lastRestartedPhrase(ms);
  check(`"${phrase}" carries no advice`, !ADVICE.test(phrase));
}
// BEHAVIOURAL SINCE D258: the band's rows are built by a pure module now, so this drives it
// rather than pattern-matching renderer source. The renderer only sets what it is handed.
{
  const rows = (uptimeMs) => machineBandGroups({
    identity: { computer: "PC", user: "u" },
    summary: { online: "yes", adapter: "a", ip: "-", gateway: "-", spooler: "RUNNING", audio: "RUNNING", dhcp: "RUNNING" },
    restart: { boot: uptimeMs === null ? null : { uptimeMs }, memory: { commitUsedFraction: 0.4 } },
    volumes: [],
  }).flatMap((g) => g.rows).filter((r) => r.label === "Last restarted");
  check("the band carries exactly one \"Last restarted\" row", rows(86400000).length === 1);
  check("…and its value is the phrase, not a timestamp", rows(2 * 86400000)[0].value === "2 days ago");
  check("…and an unreadable boot time reads \"Not known\"", rows(null)[0].value === "Not known");
  // THE RULE THE WHOLE SEVERITY DESIGN RESTS ON. A renderer that coloured a row by looking at its
  // words would be reading a figure out of a string, and would put the 17.5% false alarm back.
  check("…and the renderer only sets the state it is handed, never reading the value back",
    /row\.dataset\.state = r\.state/.test(rendererCode)
    && !/r\.value\s*===|r\.value\.(?:match|includes|indexOf)/.test(rendererCode));
}

// ==============================================================================================
console.log("\n=== 8. the conversation moment ===");
{
  const scored = scoreRestart(machine({ uptimeDays: 40, commit: 0.95, compression: 0.2, renames: 1 }));
  const sentence = restartSentence(scored);

  // EVERY SHAPE, PRINTED. Three copy defects on 2026-09-11 were found exactly here and none of them
  // would have failed a test that existed at the time: an instruction that said the same thing
  // twice, the signal that fires alone sorted last because its weight is 0, and a capital letter
  // mid-sentence. A table of ids and weights does not show any of that; the sentence does.
  console.log("\n    every shape, as a user would read it:");
  for (const [label, signals] of [
    ["uptime alone", machine({ uptimeDays: 40, commit: 0.4, compression: 0.02 })],
    ["memory alone", machine({ uptimeDays: 0.5, commit: 0.95, compression: 0.02 })],
    ["memory, filling up", machine({ uptimeDays: 0.5, commit: 0.8, compression: 0.02 })],
    ["uptime + compression", machine({ uptimeDays: 40, commit: 0.4, compression: 0.2 })],
    ["all three", machine({ uptimeDays: 40, commit: 0.95, compression: 0.2, renames: 1 })],
    ["a flag that fires alone", machine({ uptimeDays: 0.5, commit: 0.4, compression: 0.02, cbs: true })],
    ["…beside two weight-3 signals", machine({ uptimeDays: 40, commit: 0.95, compression: 0.02, cbs: true })],
    ["hours, not days", machine({ uptimeDays: 0.9, commit: 0.95, compression: 0.02 })],
  ]) {
    console.log(`      ${label}\n        ${restartSentence(scoreRestart(signals))}`);
  }
  // No sentence, in any shape, may carry a stray capital mid-way or repeat the instruction.
  for (const [label, signals] of [
    ["all three", machine({ uptimeDays: 40, commit: 0.95, compression: 0.2, renames: 1 })],
    ["flag beside two heavy signals", machine({ uptimeDays: 40, commit: 0.95, compression: 0.02, cbs: true })],
    ["uptime + compression", machine({ uptimeDays: 40, commit: 0.4, compression: 0.2 })],
  ]) {
    const s = restartSentence(scoreRestart(signals));
    const clauses = s.split(". ")[0];
    // "This"/"Its"/"There" capitalised anywhere but the very start is the mid-sentence defect.
    check(`${label}: no stray capital mid-sentence`,
      !/, (This|Its|There)\b/.test(clauses), clauses);
    check(`${label}: the instruction is said once`,
      (s.match(/Restarting/g) ?? []).length === 1, s);
  }
  console.log(`\n    "${sentence}"\n`);

  // ---- says "restart", never "shut down and turn it back on" --------------------------------
  //
  // THE MOST CONSEQUENTIAL SENTENCE IN THE SPEC. Under Fast Startup a shutdown is a kernel
  // hibernate: it does not clear the session and THE FIX WILL NOT APPLY, so a user who follows the
  // other wording does the work and gets nothing.
  check("it says restart", /restart/i.test(sentence));
  check("it never says shut down", !/shut\s*down|shutdown/i.test(sentence));
  check("it never says turn it back on", !/turn (it|the .*) (back )?on/i.test(sentence));
  check("it never says power off or power down", !/power (it )?(off|down)/i.test(sentence));

  // ---- leads with the evidence, not the instruction ------------------------------------------
  //
  // "Chrome has grown 4 GB since Tuesday and your memory is nearly full" earns compliance in a way
  // "it's been a while" does not.
  check("the first clause is evidence about the machine, not an instruction",
    /^This computer hasn't been restarted/.test(sentence), sentence.slice(0, 40));
  check("the instruction comes after the evidence",
    sentence.indexOf("Restarting") > sentence.indexOf("memory"));
  check("the strongest evidence is first: uptime (3) before memory pressure (1)",
    sentence.indexOf("hasn't been restarted") < sentence.indexOf("compressing"));
  check("every scored reason that is not corroboration is named",
    /\b40 days\b/.test(sentence) && /almost completely full/.test(sentence) && /compressing memory/.test(sentence));
  check("three reasons read as a list, not as a chain of \"and\"s",
    (sentence.match(/, and /g) ?? []).length === 1, sentence);
  check("it does not name a mechanism (D250)",
    !/commit|DNS|DHCP|resolver|Component Based Servicing|Session Manager|registry/i.test(sentence));
  check("it does not name this machine (D249)", !/WAKANDA/i.test(sentence));

  // ---- THE EVIDENCE IS THE READING, NOT THE BAND -------------------------------------------
  //
  // THE DEFECT THIS PINS WAS ON SCREEN. The clauses used to be constants named after the DEFAULT
  // bands, and the bands are configurable defaults a tenant is meant to move. With
  // `uptimeElevatedDays` lowered to 1, the real panel said "This computer hasn't been restarted in
  // more than a fortnight." about a machine that had been up 1.35 days. Every copy rule passed and
  // the evidence was false. Found by driving the app in Electron, not by reading the code.
  {
    const lowered = { ...DEFAULT_RESTART_POLICY, recommendAtScore: 1, uptimeElevatedDays: 1 };
    const upOneDay = scoreRestart(machine({ uptimeDays: 1.35, commit: 0.4, compression: 0.02 }), lowered);
    const said = restartSentence(upOneDay);
    check("a machine up 1.35 days says so, whatever band the tenant put it in",
      /hasn't been restarted in 1 day\b/.test(said), said);
    check("…and does not claim a fortnight", !/fortnight/i.test(said));
    check("…and does not claim a month", !/month/i.test(said));
    // The band still decides WHETHER to speak; only the wording comes from the reading.
    check("the lowered band is what made it speak at all", upOneDay.recommend === true);
    check("…and the shipped band would have stayed silent",
      scoreRestart(machine({ uptimeDays: 1.35, commit: 0.4, compression: 0.02 })).recommend === false);
  }
  for (const [days, expected] of [[0.5, "12 hours"], [1, "1 day"], [15, "15 days"], [41, "41 days"], [400, "400 days"]]) {
    const s = restartSentence(scoreRestart(
      machine({ uptimeDays: days, commit: 0.4, compression: 0.02 }),
      { ...DEFAULT_RESTART_POLICY, recommendAtScore: 1, uptimeElevatedDays: 0 }
    ));
    check(`up ${days} days: the sentence says "${expected}"`, s.includes(expected), s);
  }
  // And the row and the sentence describe one machine the same way (D242's rule, one surface over).
  check("the row and the sentence share one duration wording",
    lastRestartedPhrase(41 * 86400000) === "41 days ago"
    && restartSentence(scoreRestart(machine({ uptimeDays: 41, commit: 0.4, compression: 0.02 }))).includes("41 days"));

  // ---- offers to schedule -------------------------------------------------------------------
  check("it offers to come back to it", /bring this up again/i.test(sentence));
  check("…at a time that suits", /better time/i.test(sentence));
  check("…and leaves the other option open", /leave it with you/i.test(sentence));
  // AND IT DOES NOT PROMISE A RESTART. No capability restarts a machine, so a sentence implying one
  // has been booked would be telling the user something has been arranged that has not.
  check("it never claims it will restart the machine itself",
    !/I(?:'ll| will) restart|I can restart|shall I restart|schedule(?:d)? (?:a |the )?restart/i.test(sentence));
  check("the answer channel is a decision channel and restarts nothing",
    /answerRestart/.test(preloadCode) && !/restart_service/.test(preloadCode));
  check("the agent's answer handler proposes nothing and executes nothing",
    /answerRestartMoment\(answer\) \{/.test(agentCode)
    && !/broker\./.test(agentCode.match(/answerRestartMoment\(answer\) \{[\s\S]*?\n  \}/)?.[0] ?? ""));

  // ---- does not repeat once declined ---------------------------------------------------------
  const HOUR = 3600000;
  {
    const gate = createRestartGate(DEFAULT_RESTART_POLICY);
    const t = 1_700_000_000_000;
    check("a fresh gate allows it", gate.shouldRaise(t) === true);
    gate.raised(t);
    check("having said it once, it stays quiet", gate.shouldRaise(t + HOUR) === false);
    check("…for the configured period", gate.shouldRaise(t + 23 * HOUR) === false);
    check("…and may speak again after it", gate.shouldRaise(t + 25 * HOUR) === true);
  }
  {
    const gate = createRestartGate(DEFAULT_RESTART_POLICY);
    const t = 1_700_000_000_000;
    gate.raised(t);
    gate.declined(t);
    check("declined: not again immediately", gate.shouldRaise(t + 1) === false);
    check("declined: not again in an hour", gate.shouldRaise(t + HOUR) === false);
    check("declined: not again in a day", gate.shouldRaise(t + 25 * HOUR) === false);
    check("declined: not again after the configured window either, because the session decides too",
      gate.shouldRaise(t + 200 * HOUR) === false);
    check("declined: not again a year later", gate.shouldRaise(t + 24 * 365 * HOUR) === false);
    check("declined is recorded as a session fact, not only as a timestamp",
      gate.state().declinedForSession === true);
    // A clock that moved backwards must not reopen it either.
    check("declined: a clock that went backwards does not reopen it", gate.shouldRaise(t - 10 * HOUR) === false);
  }
  {
    const gate = createRestartGate(DEFAULT_RESTART_POLICY);
    const t = 1_700_000_000_000;
    gate.raised(t);
    gate.deferred(t);
    check("deferred: quiet for the shorter window", gate.shouldRaise(t + 3 * HOUR) === false);
    check("deferred: and allowed again after it", gate.shouldRaise(t + 5 * HOUR) === true,
      "a deferral the user asked for must not be silently honoured as the 24-hour suppression");
    check("deferred: and it is not a decline", gate.state().declinedForSession === false);
  }
  {
    // An unrecognised answer must be read as a decline, not as permission to ask again.
    const gate = createRestartGate(DEFAULT_RESTART_POLICY);
    check("the agent maps anything that is not \"later\" to a decline",
      /answer === "later" \? "later" : "declined"/.test(codeOf("main/main.js")));
    void gate;
  }
  // `restartAdvice` is the funnel: a suppressed recommendation has no sentence to speak, so a
  // caller cannot raise one by reading a field it should not have looked at.
  {
    const gate = createRestartGate(DEFAULT_RESTART_POLICY);
    const signals = machine({ uptimeDays: 40, commit: 0.95 });
    const first = restartAdvice(signals, { gate, nowMs: 1000 });
    check("the advice carries a sentence when the score passed and the gate allows it",
      typeof first.sentence === "string" && first.sentence.length > 0);
    gate.declined(1000);
    const second = restartAdvice(signals, { gate, nowMs: 2000 });
    check("…and no sentence at all once declined, though the score is unchanged",
      second.sentence === null && second.recommend === true && second.score === first.score);
  }
  // And the renderer cannot raise one on its own: it speaks `advice.sentence` and nothing else.
  check("the renderer speaks the sentence the agent generated, and writes none of its own",
    /say\(advice\.sentence, "idle"\)/.test(rendererCode));
  check("the renderer raises it only when there is a sentence",
    /moment\?\.sentence && !threw && root\.dataset\.offer !== "pending"/.test(rendererCode));
  check("…and it does not set data-offer, whose hint would promise a typed answer nothing reads",
    !/dataset\.offer = "pending"/.test(rendererCode.match(/function attachRestartChoice[\s\S]*?\n}/)?.[0] ?? ""));
  check("…and it does not submit the answer as a sentence to the router",
    !/submit\(/.test(rendererCode.match(/function attachRestartChoice[\s\S]*?\n}/)?.[0] ?? ""));
  // The moment is provoked, never raised on a timer (D198, and the spec's own anti-nag rule).
  check("nothing schedules the moment on a timer",
    !/setInterval|setTimeout/.test(agentCode.match(/const moment = restartAdvice[\s\S]*?\n    }/)?.[0] ?? "")
    && !/setInterval/.test(signalCode));
  check("the moment is attached after the intake's early returns, so a half-finished ticket is not interrupted",
    agentCode.indexOf("const moment = restartAdvice") > agentCode.indexOf("this.intake.accept(text)"));
}

// ==============================================================================================
console.log("\n=== 9. nothing reads the consent store ===");
//
// The consent store records every app that has EVER used the camera or microphone, with timestamps:
// 87 microphone and 22 webcam entries on the spec's test machine, naming applications and when each
// was last used. That is a behavioural log of what software someone runs and when, and it must
// never enter the panel, a ticket, a snapshot or the service desk's view. Permission state is out
// too, by founder decision, because it lives in the same registry tree - so a future maintainer
// widening the read is one line away. This is the check that catches that line.
const FORBIDDEN = [
  /CapabilityAccessManager/i,
  /ConsentStore/i,
  /\bwebcam\b/i,
  /\bmicrophone\b/i,
  /NonPackaged/i,
  /LastUsedTimeStart|LastUsedTimeStop/i,
];
for (const rel of [
  "broker/win32/sysinfo.js", "broker/win32/scm.js", "broker/win32/net.js",
  "broker/capabilities/index.js", "agent/restart-signal.js", "agent/agent.js", "renderer/renderer.js",
]) {
  const whole = readFileSync(join(SRC, rel), "utf8");
  for (const pattern of FORBIDDEN) {
    check(`${rel}: does not mention ${pattern.source}`, !pattern.test(whole));
  }
}
// The registry reads that DO exist are the three pending-reboot paths and nothing else.
const keys = [...sysinfoCode.matchAll(/"((?:SOFTWARE|SYSTEM)\\\\[^"]+)"/g)].map((m) => m[1]);
check(`the collector opens exactly the three documented keys (${keys.length} found)`, keys.length === 3, keys.join(" | "));
check("…Component Based Servicing", keys.some((k) => /Component Based Servicing\\\\RebootPending$/.test(k)));
check("…Windows Update", keys.some((k) => /WindowsUpdate\\\\Auto Update\\\\RebootRequired$/.test(k)));
check("…Session Manager", keys.some((k) => /Control\\\\Session Manager$/.test(k)));
check("every registry read is under HKEY_LOCAL_MACHINE, never the per-user hive where consent lives",
  !/HKEY_CURRENT_USER|0x80000001/.test(sysinfoCode) && /HKEY_LOCAL_MACHINE/.test(sysinfoCode));

// ==============================================================================================
console.log("\n=== 10. the score table, against machines that do not exist ===");
//
// The spec's §6, minus the signals this pass does not collect. Read as: given this machine, is the
// recommendation right? On the spec's own test machine the score was 1 and silence was correct -
// which a naive 30-day uptime rule would also have got right, and a naive pending-reboot rule
// would NOT.
for (const [label, signals, expectScore, expectRecommend] of [
  ["idle machine, nothing wrong", machine({ uptimeDays: 1, commit: 0.4, compression: 0.02 }), 0, false],
  ["the spec's own test machine: one weak flag", machine({ uptimeDays: 1.14, commit: 0.688, compression: 0.12, renames: 2 }), 1, false],
  ["up 20 days, nothing else", machine({ uptimeDays: 20, commit: 0.4, compression: 0.02 }), 1, false],
  ["up 40 days, nothing else", machine({ uptimeDays: 40, commit: 0.4, compression: 0.02 }), 3, true],
  ["commit at 95%, freshly booted", machine({ uptimeDays: 0.5, commit: 0.95, compression: 0.02 }), 3, true],
  ["commit at 80% and up 20 days", machine({ uptimeDays: 20, commit: 0.8, compression: 0.02 }), 2, false],
  ["…plus memory compression over 15%", machine({ uptimeDays: 20, commit: 0.8, compression: 0.2 }), 3, true],
  ["compression alone", machine({ uptimeDays: 1, commit: 0.4, compression: 0.2 }), 1, false],
  ["everything weak, nothing strong", machine({ uptimeDays: 20, commit: 0.76, compression: 0.16, renames: 1 }), 4, true],
]) {
  const scored = scoreRestart(signals);
  check(`${label}: score ${expectScore}`, scored.score === expectScore, `got ${scored.score}`);
  check(`${label}: ${expectRecommend ? "recommends" : "stays silent"}`, scored.recommend === expectRecommend);
}
// The two flags that fire alone, and the fact that they do it WITHOUT a score.
for (const [label, signals] of [
  ["Component Based Servicing", machine({ uptimeDays: 1, commit: 0.1, compression: 0.01, cbs: true })],
  ["Windows Update", machine({ uptimeDays: 1, commit: 0.1, compression: 0.01, wu: true })],
]) {
  const scored = scoreRestart(signals);
  check(`${label} fires alone on a machine with no other evidence`, scored.recommend === true);
  check(`…and it is recorded as firing alone rather than as reaching the threshold`,
    scored.firesAlone === true && scored.score < scored.recommendAtScore);
  check(`…and the sentence says Windows is waiting for a restart`,
    /Windows is waiting for a restart/.test(restartSentence(scored)));
  // "Windows is waiting for a restart. Restarting it would clear that up." says it twice.
  check(`…and does not then say the same thing again in weaker words`,
    !/clear that up/.test(restartSentence(scored)) && /what lets it finish/.test(restartSentence(scored)),
    restartSentence(scored));
  check(`…and it still says "restart" and never "shut down"`,
    /restart/i.test(restartSentence(scored)) && !/shut\s*down/i.test(restartSentence(scored)));
  check(`…and still offers to come back to it`, /bring this up again/.test(restartSentence(scored)));
  // AND IT LEADS, even beside heavier signals. Its weight is 0 precisely because it does not need
  // one, so ordering by weight alone buried the most decisive evidence last - and the weaker
  // instruction clause came back with it. Found by reading the generated sentence, not the table.
  {
    const alongside = scoreRestart({
      boot: { uptimeMs: 40 * 86400000 },
      flags: { readable: true, cbs: true, windowsUpdate: false, pendingFileRenames: 0 },
      memory: { commitUsedFraction: 0.95, physicalTotalBytes: 34e9 },
      memoryCompression: { fractionOfPhysical: 0.02 },
    });
    const said = restartSentence(alongside);
    check(`…and it LEADS the sentence even beside two weight-3 signals`,
      /^Windows is waiting for a restart/.test(said), said);
    check(`…and the other evidence is still there, after it`,
      /40 days/.test(said) && /almost completely full/.test(said));
    check(`…and the instruction is the one that does not repeat it`,
      /what lets it finish/.test(said) && !/clear that up/.test(said));
  }
}
// Unreadable flags are unknown, not clear.
{
  const scored = scoreRestart({ boot: { uptimeMs: 86400000 }, flags: { readable: false }, memory: null, memoryCompression: null });
  check("unreadable flags are reported unknown rather than scored as clear",
    scored.unknown.includes("pendingRebootFlags") && scored.recommend === false);
  check("…and so is unreadable memory", scored.unknown.includes("commitCharge"));
  check("…and unreadable compression", scored.unknown.includes("memoryCompression"));
}
// Band boundaries, where an off-by-one is invisible by reading.
check("exactly 14 days is the elevated band", scoreRestart(machine({ uptimeDays: 14, commit: 0.1, compression: 0.01 })).score === 1);
check("just under 14 days is nothing", scoreRestart(machine({ uptimeDays: 13.99, commit: 0.1, compression: 0.01 })).score === 0);
check("exactly 30 days is still the elevated band, not the long one",
  scoreRestart(machine({ uptimeDays: 30, commit: 0.1, compression: 0.01 })).score === 1);
check("just over 30 days is the long band", scoreRestart(machine({ uptimeDays: 30.01, commit: 0.1, compression: 0.01 })).score === 3);
check("exactly 75% commit is the elevated band", scoreRestart(machine({ uptimeDays: 1, commit: 0.75, compression: 0.01 })).score === 1);
check("exactly 90% commit is still elevated, not high",
  scoreRestart(machine({ uptimeDays: 1, commit: 0.9, compression: 0.01 })).score === 1);
check("just over 90% is high", scoreRestart(machine({ uptimeDays: 1, commit: 0.9001, compression: 0.01 })).score === 3);
check("exactly 15% compression does not score", scoreRestart(machine({ uptimeDays: 1, commit: 0.1, compression: 0.15 })).score === 0);

// ==============================================================================================
console.log("\n=== 11. and it reads THIS machine (the only part of this file that is a measurement) ===");
{
  const t0 = process.hrtime.bigint();
  const live = restartSignals();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;

  check("the collector returns a boot instant", live.boot !== null);
  if (live.boot) {
    console.log(`    booted   ${new Date(live.boot.bootTimeMs).toISOString()}  (uptime ${(live.boot.uptimeMs / 86400000).toFixed(2)} days)`);
    console.log(`    kernel   ${new Date(live.boot.kernelBootTimeMs).toISOString()}  (BootTimeBias ${live.boot.bootTimeBiasMs} ms)`);
    check("the boot instant is in the past", live.boot.bootTimeMs < Date.now());
    check("the boot instant is not the epoch", live.boot.bootTimeMs > 1_000_000_000_000);
    check("uptime agrees with the boot instant it was computed from",
      Math.abs(live.boot.uptimeMs - (live.boot.nowMs - live.boot.bootTimeMs)) < 2);
    check("the corrected instant is at or before the raw kernel one",
      live.boot.bootTimeMs <= live.boot.kernelBootTimeMs);
    check("SleepTimeBias is carried", typeof live.boot.sleepTimeBiasMs === "number");
  }
  check("the pending-reboot flags are readable unelevated", live.flags?.readable === true);
  if (live.flags?.readable) {
    console.log(`    flags    Component Based Servicing=${live.flags.cbs}  Windows Update=${live.flags.windowsUpdate}`
      + `  pending file renames=${live.flags.pendingFileRenames}`);
    check("the two flags that fire alone are booleans, never null when readable",
      typeof live.flags.cbs === "boolean" && typeof live.flags.windowsUpdate === "boolean");
  }
  check("commit charge reads", typeof live.memory?.commitUsedFraction === "number");
  if (live.memory) {
    console.log(`    memory   commit ${(live.memory.commitUsedFraction * 100).toFixed(1)}% of `
      + `${(live.memory.commitLimitBytes / 1024 ** 3).toFixed(1)} GB limit; `
      + `${live.memory.processCount} processes`);
    check("commit charge is a fraction between 0 and 1",
      live.memory.commitUsedFraction > 0 && live.memory.commitUsedFraction <= 1);
    check("physical memory reads as a plausible size", live.memory.physicalTotalBytes > 1024 ** 3);
  }
  // Memory Compression may legitimately be absent; what must never happen is a zero standing in
  // for "not found". The cross-check against the kernel's own process count is inside the collector.
  if (live.memoryCompression === null) {
    check("Memory Compression absent reads as null, not as zero", true);
  } else {
    console.log(`    compress ${(live.memoryCompression.bytes / 1024 ** 3).toFixed(2)} GB `
      + `= ${(live.memoryCompression.fractionOfPhysical * 100).toFixed(1)}% of physical `
      + `(${live.memoryCompression.processesWalked} processes walked)`);
    check("Memory Compression's working set is non-zero when it is found", live.memoryCompression.bytes > 0);
    check("…and the process walk agreed with the kernel's own count",
      live.memoryCompression.processesWalked === live.memory.processCount);
  }
  // Context only, and never scored or spoken.
  if (live.bootTypeEvent) {
    console.log(`    boot type ${live.bootTypeEvent.bootTypeRaw} at ${live.bootTypeEvent.atIso}`);
    check("the boot type is carried uninterpreted", live.bootTypeEvent.interpreted === false);
    check("…and it gives no weight to the score",
      scoreRestart({ ...machine({ uptimeDays: 1, commit: 0.1, compression: 0.01 }), bootTypeEvent: live.bootTypeEvent }).score === 0);
  }
  if (live.initiatorEvent) {
    console.log(`    initiator ${live.initiatorEvent.reason} / ${live.initiatorEvent.action} at ${live.initiatorEvent.atIso}`);
  }
  // D249: the initiator payload carries this machine's name, so it must not reach a spoken line.
  check("the initiator event is never spoken: no surface reads it",
    !/initiatorEvent/.test(rendererCode) && !/initiatorEvent/.test(signalCode));
  check("nor is the boot type", !/bootTypeEvent/.test(rendererCode) && !/bootTypeEvent/.test(signalCode));

  console.log(`\n    all six readings in ${ms.toFixed(1)} ms (the spec's bar is "well under a second"; its cadence is 5-15 min)`);
  check("the whole collection is well under a second", ms < 1000, `${ms.toFixed(1)} ms`);

  // Idempotent, and no state between calls - the spec's own session lost its connection mid-probe.
  const again = restartSignals();
  check("a second call agrees about the boot instant", again.boot?.bootTimeMs === live.boot?.bootTimeMs);
  check("…and about the flags", again.flags?.cbs === live.flags?.cbs);
  check("the collector keeps no cache to go stale", !/let cached|cache =|_cache/.test(sysinfoCode));

  // And the probe the router and the panel share carries it.
  const probe = probeMachine();
  check("probeMachine() carries the restart readings", probe.restart !== undefined);
  check("…and the panel row is built from them", typeof lastRestartedPhrase(probe.restart?.boot?.uptimeMs) === "string");
  console.log(`    the row would read: "Last restarted: ${lastRestartedPhrase(probe.restart?.boot?.uptimeMs ?? null)}"`);

  // The live advice, gateless, as the band computes it.
  const advice = restartAdvice(probe.restart, { policy: config.restartPolicy });
  console.log(`    score ${advice.score}/${config.restartPolicy.recommendAtScore}`
    + ` -> ${advice.recommend ? "RECOMMEND" : "stay silent"}`
    + ` from ${advice.contributions.map((c) => `${c.id}=${c.weight}`).join(", ") || "nothing"}`
    + `${advice.unknown.length ? `; could not read ${advice.unknown.join(", ")}` : ""}`);
  check("the live advice is internally consistent",
    advice.recommend === (advice.firesAlone || (advice.score >= config.restartPolicy.recommendAtScore
      && advice.contributions.some((c) => !c.neverAlone))));
  check("bootInstant() and restartSignals() agree", bootInstant()?.bootTimeMs === live.boot?.bootTimeMs);
}

// ==============================================================================================
console.log(`\n${"=".repeat(94)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(94)}`);
if (fail) process.exit(1);
