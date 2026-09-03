// @ts-check
/**
 * Ollama-specific driver for the bake-off.
 *
 * Kept separate from run-bakeoff.mjs on purpose. The runner talks OpenAI-compatible HTTP and knows
 * nothing about Ollama; unloading, warming and keep_alive are Ollama's own API. Putting them here
 * means the runner stays usable against LM Studio, vLLM, a customer's endpoint or OpenAI without
 * carrying vendor calls it cannot use.
 *
 * For each model, in turn: unload everything else, warm it (timed on its own), run every case,
 * then unload it. Sequential and exclusive - two models resident at once on a 24 GB card would
 * measure contention and report it as latency.
 *
 * Usage: node eval/bakeoff-all.mjs gpt-oss:20b gemma4:12b mistral-small:24b
 *        node eval/bakeoff-all.mjs --tag escalate gpt-oss:20b
 */
import { spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OLLAMA = process.env.MATIC_LOCAL_BASE_URL?.replace(/\/v1\/?$/, "") ?? "http://127.0.0.1:11434";

const argv = process.argv.slice(2);
const VALUE_FLAGS = new Set(["--tag", "--cases", "--out", "--base-url"]);
const models = argv.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(argv[i - 1]));
const outIdx = argv.indexOf("--out");
const outBase = outIdx >= 0
  ? argv[outIdx + 1]
  : join(HERE, "results", `bakeoff-${new Date().toISOString().slice(0, 10)}.json`);
// --out is handled here, per model, so it must not be forwarded to the runner.
const passthrough = argv.filter((a, i) => !models.includes(a) && a !== "--out" && argv[i - 1] !== "--out");
const written = [];

if (!models.length) {
  console.error("usage: node eval/bakeoff-all.mjs [--tag T] <model> [model...]");
  process.exit(2);
}

const sh = (args) => {
  try { return execFileSync("ollama", args, { encoding: "utf8" }); } catch { return ""; }
};
const vram = () => {
  try {
    return Number(execFileSync("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"]).toString().trim().split("\n")[0]);
  } catch { return NaN; }
};

/** Everything Ollama currently holds in memory. */
function resident() {
  return sh(["ps"]).split("\n").slice(1).map((l) => l.trim().split(/\s+/)[0]).filter(Boolean);
}

/**
 * Unload everything, then WAIT FOR VRAM TO ACTUALLY COME BACK.
 *
 * nvidia-smi does not report the memory freed the instant ollama stop returns, and an unload this
 * process did not issue (a keep_alive expiring, or a stop run by hand a moment earlier) is still
 * settling too. Sampling early records the outgoing model as the idle baseline and makes every
 * VRAM delta wrong - which is the second time this measurement has been broken, so poll rather
 * than guess a sleep.
 */
async function unloadAll() {
  for (const m of resident()) sh(["stop", m]);
  let prev = vram();
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const now = vram();
    if (Number.isFinite(now) && Number.isFinite(prev) && Math.abs(now - prev) < 100 && resident().length === 0) return;
    prev = now;
  }
}

/**
 * Warm the model and time it. This is COLD LOAD, reported separately and never folded into
 * latency: a first-token number that includes reading 13 GB off disk is not a latency measurement.
 */
async function warm(model) {
  const startedAt = Date.now();
  const res = await fetch(`${OLLAMA}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, prompt: "hi", stream: false, keep_alive: "30m" }),
    signal: AbortSignal.timeout(900000),
  });
  await res.json().catch(() => ({}));
  return { ms: Date.now() - startedAt, ok: res.ok };
}

for (const model of models) {
  console.log(`\n${"#".repeat(80)}`);
  console.log(`# ${model}`);
  console.log("#".repeat(80));

  await unloadAll();
  const idle = vram();
  console.log(`  idle VRAM: ${idle} MiB`);

  let loaded;
  try {
    loaded = await warm(model);
  } catch (err) {
    console.log(`  COLD LOAD FAILED after ${Math.round((err.name === "TimeoutError" ? 900000 : 0) / 1000)}s: ${err.message}`);
    console.log(`  SKIPPED - a model that cannot be loaded cannot be evaluated.`);
    continue;
  }
  if (!loaded.ok) {
    console.log(`  warm request failed - is "${model}" pulled?`);
    continue;
  }

  const placement = sh(["ps"]).split("\n").filter((l) => l.includes(model)).join(" ").trim();
  console.log(`  cold load: ${(loaded.ms / 1000).toFixed(1)}s`);
  console.log(`  placement: ${placement || "unknown"}`);
  // A CPU split is the single best predictor of an unusable model on this hardware: a dense 31B
  // spilling 10% to CPU took 182 s for 8 tokens. Say so before the numbers, not after.
  if (/\d+%\/\d+%\s+CPU\/GPU/.test(placement)) {
    console.log(`  WARNING: this model does not fit entirely in VRAM. Expect latency to be dominated by the CPU share.`);
  }

  // One results file PER MODEL. A single --out shared across models leaves only the last one on
  // disk, silently: each model runs in its own process and writes the whole file.
  const outFor = outBase.replace(/\.json$/, "") + "." + model.replace(/[^a-zA-Z0-9._-]/g, "-") + ".json";
  written.push(outFor);

  const r = spawnSync(process.execPath, [join(HERE, "run-bakeoff.mjs"), ...passthrough, "--out", outFor, model], {
    stdio: "inherit",
    env: { ...process.env, MATIC_COLD_LOAD_MS: String(loaded.ms), MATIC_IDLE_VRAM_MIB: String(idle) },
  });
  if (r.status !== 0) console.log(`  runner exited ${r.status}`);

  await unloadAll();
}

// One combined table across every model that produced results, so a multi-model run is
// comparable without opening N files.
const collected = [];
for (const f of written) {
  try {
    collected.push(...JSON.parse(fs.readFileSync(f, "utf8")).runs.map((r) => r.summary));
  } catch { /* that model was skipped; nothing was written for it */ }
}

if (collected.length) {
  const combined = outBase.replace(/\.json$/, "") + ".combined.json";
  fs.writeFileSync(combined, JSON.stringify({ at: new Date().toISOString(), summaries: collected }, null, 2));
  const cols = ["model", "correct", "FALSE", "over", "none", "repair", "med s", "cold s", "VRAM", "s/correct"];
  const w = [22, 10, 8, 7, 7, 8, 8, 9, 9, 0];
  console.log("\n" + "=".repeat(104));
  console.log(cols.map((c, i) => c.padEnd(w[i])).join(""));
  console.log("-".repeat(104));
  for (const r of collected) {
    console.log([
      r.model.slice(0, 21),
      r.correct + "/" + r.cases,
      String(r.falseActions),
      String(r.overEscalations),
      String(r.noAnswer),
      String(r.repaired),
      (r.medianMs / 1000).toFixed(1),
      r.coldLoadMs ? (r.coldLoadMs / 1000).toFixed(0) : "n/a",
      String(r.vramOverBaselineMiB ?? "n/a"),
      String(r.secondsPerCorrectProposal ?? "n/a"),
    ].map((c, i) => c.padEnd(w[i])).join(""));
  }
  console.log("=".repeat(104));
  console.log("combined: " + combined);
}

console.log("\nall models done; nothing left resident");
