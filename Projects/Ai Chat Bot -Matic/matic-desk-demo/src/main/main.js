// @ts-check
/**
 * Electron main. This is the ONLY place the broker implementation is named.
 *
 * Phase 1: change `new InProcessBroker(...)` to `new NamedPipeBroker(...)` here and nothing else
 * in the app moves - that is the whole point of the interface in broker.d.ts (§2).
 */
import { app, BrowserWindow, ipcMain, Menu } from "electron";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { TtsService } from "./tts-service.js";
import { InProcessBroker } from "../broker/in-process-broker.js";
import { CloudClient } from "../agent/cloud-client.js";
import { Agent } from "../agent/agent.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

let win = null;
let tts = null;
let broker = null;
let agent = null;

const log = (line) => {
  console.log(line);
  win?.webContents.send("app:log", line);
};

async function createWindow() {
  // No default menu. On stage an accidental Alt keypress dropping the File/Edit/View menu over
  // the avatar is exactly the kind of thing that derails a demo.
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1180,
    height: 800,
    backgroundColor: "#0d1117",
    title: "Matic Desk",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(join(ROOT, "src/renderer/index.html"));
}

/**
 * Load ANTHROPIC_API_KEY from a gitignored .env beside the app, if present.
 *
 * Why this exists: the demo runs elevated, and elevation via ShellExecute/RunAs starts a new
 * process that does NOT inherit session environment variables. A key exported in an ordinary
 * shell therefore never reaches the elevated app. A file avoids that, keeps the key out of the
 * registry, and keeps it off any command line where it would show up in the process list.
 * An already-set environment variable always wins.
 */
function loadEnvFile() {
  if (process.env.ANTHROPIC_API_KEY) return "environment";
  try {
    process.loadEnvFile(join(ROOT, ".env"));
    return process.env.ANTHROPIC_API_KEY ? ".env file" : "none";
  } catch {
    return "none"; // no .env present, which is fine
  }
}

app.whenReady().then(async () => {
  const keySource = loadEnvFile();
  const config = JSON.parse(await readFile(join(ROOT, "config.json"), "utf8"));

  // ---- privileged half ----
  broker = new InProcessBroker({
    catalogPath: join(ROOT, "src/broker/catalog.json"),
    auditPath: join(ROOT, "audit/audit.jsonl"),
    onLog: log,
  });

  // ---- unprivileged half ----
  const cloud = new CloudClient({
    model: config.model,
    capabilities: broker.listCapabilities(),
    onLog: log,
  });
  agent = new Agent({ broker, cloud, onLog: log });
  log(cloud.available
    ? `[cloud] ${config.model} ready (key from ${keySource})`
    : "[cloud] ANTHROPIC_API_KEY not set - tier-0 router only, cloud reasoning unavailable");

  tts = new TtsService(config, { onLog: log });

  // ---- IPC: registered BEFORE the window exists, so the renderer cannot ask for a handler
  // that is not there yet. ----
  ipcMain.handle("tts:status", () => ({ ready: tts.ready, error: tts.readyError, sampleRate: tts.sampleRate }));

  ipcMain.handle("tts:speak", async (_e, text) => {
    const r = await tts.synthesize(String(text ?? ""));
    if (!r.ok) {
      log(`[tts] synthesis failed: ${r.error}`);
      return { ok: false, error: r.error };
    }
    return { ok: true, timeline: r.timeline, audio: r.audio };
  });

  ipcMain.handle("broker:listCapabilities", () => broker.listCapabilities());
  ipcMain.handle("agent:diagnose", () => agent.diagnose().panel);
  ipcMain.handle("agent:propose", async (_e, text) => {
    try {
      return await agent.propose(String(text ?? ""));
    } catch (err) {
      log(`[agent] propose threw: ${err.stack}`);
      return { ok: false, error: err.message, reply: `Something went wrong working that out: ${err.message}` };
    }
  });
  ipcMain.handle("broker:validate", (_e, proposal) => broker.validate(proposal));

  /**
   * The user's Approve click is the consent gesture. The token is minted HERE, in the
   * privileged half, immediately before execution - the renderer never holds a token it
   * could replay, and never mints one for itself.
   */
  ipcMain.handle("broker:consentAndExecute", async (_e, proposal) => {
    try {
      const token = broker.mintConsentToken(proposal);
      log(`[broker] consent token ${token.id} minted for ${proposal.capabilityId}`);
      const result = await broker.execute(proposal, token);
      // Surfaced for the inspector so the audit trail is visible, not just claimed.
      return { ...result, consentTokenId: token.id };
    } catch (err) {
      log(`[broker] ${err.message}`);
      return {
        ok: false,
        capabilityId: proposal?.capabilityId ?? "unknown",
        message: `Refused before doing anything: ${err.message}`,
        detail: {},
        needsBroker: false,
        rollbackWith: null,
        auditId: null,
      };
    }
  });

  await createWindow();

  // ---- voice: started after the window is up so the UI paints immediately rather than waiting
  // on a 63 MB model load. The renderer shows "voice: loading" and waits for this event. ----
  const voiceOk = await tts.start(join(ROOT, "scripts/piper_worker.py"));
  log(voiceOk ? "[tts] voice ready" : `[tts] voice unavailable, running text-only: ${tts.readyError}`);
  win?.webContents.send("tts:ready", { ready: tts.ready, error: tts.readyError, sampleRate: tts.sampleRate });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  tts?.stop();
  if (process.platform !== "darwin") app.quit();
});
