// @ts-check
/**
 * Electron main. This is the ONLY place the broker implementation is named.
 *
 * Phase 1: change `new InProcessBroker(...)` to `new NamedPipeBroker(...)` here and nothing else
 * in the app moves - that is the whole point of the interface in broker.d.ts (§2).
 *
 * SINCE 2026-09-13 THE PROCESS OUTLIVES ITS WINDOW (D293–D296, register §5.61). Closing the window
 * hides it to the notification area; the hub link and the ticket poll keep running; quitting is a
 * deliberate act from the tray menu. Every decision about what the tray shows, whether the voice
 * may speak and whether an update may be shown is made in `presence.js`, which is pure; this file
 * applies it. `settings.js` remembers Start with Windows and the first-close notice.
 */
import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, dialog } from "electron";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { TtsService } from "./tts-service.js";
import { presence, closeOutcome, UpdateHold, MENU } from "./presence.js";
import { SettingsStore, resolveAutostart } from "./settings.js";
import { InProcessBroker } from "../broker/in-process-broker.js";
import { CloudClient } from "../agent/cloud-client.js";
import { OpenAICompatibleClient } from "../agent/openai-compatible-client.js";
import { HubClient } from "../agent/hub-client.js";
import { HubLink } from "../agent/hub-link.js";
import { EnrollmentStore, ensureEnrolled, ENROLL_RETRY_MS } from "../agent/enrollment.js";
import { TicketWatch, POLL_DEFAULT_MS } from "../agent/ticket-watch.js";
import { Agent } from "../agent/agent.js";
import { marksIn } from "../agent/machine-band.js";
import { ProfileStore } from "../profile/profile.js";
import { TicketIntake } from "../ticket/intake.js";
import { EgressAudit } from "../ticket/egress-audit.js";
import { openConversation, endConversation } from "../nuance/nuance-session.js";
import { initialMic, micStep, micWords } from "../nuance/mic-policy.js";
import { randomUUID as personaRef } from "node:crypto";
import { appendFileSync as appendVoiceConsent, mkdirSync as makeAuditDir, existsSync, statSync, writeFileSync } from "node:fs";
// The two ways this handler can refuse a ticket are both SPOKEN by the avatar, so their wording is
// persona data (D234/D246) and the reason they failed travels beside it as `detail`.
import persona from "../router/persona.json" with { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

// ---- D293: one process per user. ----
//
// With Start with Windows ON the app is already running when the user double-clicks the desktop
// icon, and before this that started a second one. The lock is per userData directory, so two OS
// users on one machine still get one each. The second launch hands over and exits; the first shows
// its window (below, `second-instance`).
const isPrimary = app.requestSingleInstanceLock();
if (!isPrimary) app.quit();

/**
 * Started by Windows at logon (D294): to the notification area, with no window. The point of
 * autostart is presence, not a window appearing at every logon. The login item is registered with
 * this argument and nothing else uses it.
 */
const startInBackground = process.argv.includes("--background");

let win = null;
let tts = null;
let broker = null;
let agent = null;
// B6-lite (D213, D215, D217). All three stay null on any build that cannot file a ticket, and the
// ticket IPC handlers check that rather than assuming — see the wiring in whenReady.
let profile = null;
let egress = null;
// The live persona (D307). `personaHub` is the hub client when there is one; `personaConfig` is
// config.json's block; `liveSession` is the ONE session this process may have, or null.
let personaHub = null;
let personaConfig = { enabled: false, maxSessionSeconds: 600 };
/** @type {null | { ref: string, conversationId: string, sessionToken: string, openedAtMs: number, mic: any, name: string|null, host: string|null }} */
let liveSession = null;
let hubUrlForTickets = null;
// D233. Always constructed - a build with no hub gets a link that reports `standalone`, so the
// renderer's status pill has one shape to read whatever the provider is.
let hubLink = null;
// D282 (P3b). The enrollment record - device key, device id, credential - in per-user userData
// beside the profile. null on a build with no hub provider.
let enrollment = null;
// D288 (P4). The poll of this enrollment's own tickets on the hub, and the one source of "an update
// arrived". null on a build with no hub provider; it starts polling only once a credential lands.
let ticketWatch = null;
// D293–D296. The tray, the process's own preferences, and what arrived while nobody could see it.
let tray = null;
let settings = null;
/** Set by `before-quit` and nothing else: the one condition under which `close` is allowed to close. */
let isQuitting = false;
/** Desk updates held while no visible window can show them; their count is the tray's needsYou. */
const held = new UpdateHold();
/** The icon the tray is showing, so a repaint is a change and the startup gap keeps the last answer. */
let lastIcon = null;
/** The renderer has run its scripts and registered its listeners - a `send` before that is dropped. */
let rendererReady = false;
/** The resolved Start with Windows value (settings + the OS's answer), what the tray's box shows. */
let autostart = false;

// A FILE AS WELL AS THE CONSOLE (2026-11-17). The app is normally started with no console at all -
// from a shortcut, or at logon - so when the live video failed for Charles there was nothing to
// read: the reason was in a window that does not exist. audit/app.log sits beside the two records
// that already live there, is truncated when it passes 2 MB, and carries what the developer log
// carries: no credential, no token, and nothing anybody said.
const APP_LOG = join(dirname(fileURLToPath(import.meta.url)), "../../audit/app.log");
try {
  makeAuditDir(dirname(APP_LOG), { recursive: true });
  if (existsSync(APP_LOG) && statSync(APP_LOG).size > 2 * 1024 * 1024) writeFileSync(APP_LOG, "");
} catch { /* a log that cannot be written is not a reason to fail to start */ }
const log = (line) => {
  console.log(line);
  try { appendVoiceConsent(APP_LOG, `${new Date().toISOString()} ${line}\n`, "utf8"); } catch { /* same */ }
  // `win` outlives its window: after close the BrowserWindow object is destroyed but the variable
  // still holds it, and `webContents.send` throws "Object has been destroyed". The Piper worker's
  // exit line arrives exactly then (tts.stop() runs on window-all-closed), which is how this became
  // an uncaught-exception dialog on every close (Charles, 2026-09-10). Same guard on hub:link below.
  if (win && !win.isDestroyed()) win.webContents.send("app:log", line);
};

// ---- the live persona: the pure policies, applied (D303, D307) -----------------------------------

/** One microphone event through mic-policy.js, with its egress lines written. Returns what the renderer applies. */
function personaMicEvent(type, extra = {}) {
  if (!liveSession) return { state: "unavailable", words: null, commands: [], refused: "there is no live session" };
  const step = micStep(liveSession.mic, { type, nowMs: Date.now(), windowVisible: windowVisible(), ...extra });
  liveSession.mic = step.mic;
  for (const line of step.egress) egress?.persona(line.event, { sessionRef: liveSession.ref, ...line.detail });
  if (step.refused) log(`[persona] microphone: ${step.refused}`);
  return { state: step.mic.state, words: micWords(step.mic.state), commands: step.commands, ...(step.refused ? { refused: step.refused } : {}) };
}

/** The session is over, for whatever reason. Idempotent. Writes the closing line and ends the conversation. */
function personaOver(reason) {
  if (!liveSession) return;
  const p = liveSession;
  const nowMs = Date.now();
  const step = micStep(p.mic, { type: "session.closed", nowMs, reason });
  for (const line of step.egress) egress?.persona(line.event, { sessionRef: p.ref, ...line.detail });
  egress?.persona("persona.closed", { sessionRef: p.ref, durationMs: Math.max(0, nowMs - p.openedAtMs), audioSentMs: step.mic.audioSentMs, reason: String(reason ?? "unknown").slice(0, 80) });
  liveSession = null;
  log(`[persona] session ${p.ref} over (${reason}) after ${Math.round((nowMs - p.openedAtMs) / 1000)} s; audio was sent for ${Math.round(step.mic.audioSentMs / 1000)} s`);
  // Best effort, and not awaited: the service ends it on its own too, this just stops the clock sooner.
  void endConversation({ conversationId: p.conversationId, end: (id) => personaHub.endNuanceConversation(id) }).then((r) => { if (!r.ok) log(`[persona] the hub could not end conversation ${p.conversationId}: ${r.detail ?? "no reason"}`); });
}

// ---- presence: the pure policy, applied ----------------------------------------------------------

const windowVisible = () => Boolean(win && !win.isDestroyed() && win.isVisible());

/** One object, from what is true right now. Every tray and voice decision below reads this. */
function presenceNow() {
  return presence({ visible: windowVisible(), hub: hubLink?.status().state ?? "standalone", unread: held.count, autostart, previous: lastIcon });
}

const TRAY_ICON_FILES = { idle: "idle", needsYou: "needs-you", unreachable: "unreachable" };
const trayImages = {};
/** `createFromPath` picks up the `@2x` beside it on a scaled display. The PNGs are built by scripts/build-tray-icons.mjs. */
const trayImage = (state) => (trayImages[state] ??= nativeImage.createFromPath(join(ROOT, "assets/tray", `${TRAY_ICON_FILES[state]}.png`)));

/** Repaint the tray from `presenceNow()`. Cheap, idempotent, called on every input change. */
function refreshTray() {
  if (!tray) return;
  const p = presenceNow();
  if (p.icon !== lastIcon) {
    tray.setImage(trayImage(p.icon));
    log(`[presence] tray -> ${p.icon} (${p.tooltip})`);
    lastIcon = p.icon;
  }
  tray.setToolTip(p.tooltip);
  tray.setContextMenu(Menu.buildFromTemplate(p.menu.map((m) => {
    if (m.type === "separator") return { type: "separator" };
    if (m.id === MENU.AUTOSTART) return { label: m.label, type: "checkbox", checked: m.checked === true, click: (item) => setAutostart(item.checked) };
    if (m.id === MENU.QUIT) return { label: m.label, click: () => app.quit() };
    return { label: m.label, click: () => void showWindow() };
  })));
}

// ---- Start with Windows (D294, D295) --------------------------------------------------------------
//
// The OS is asked through Electron's login-item API and reduced to two booleans for the pure
// `resolveAutostart`: is there a Run entry for this executable with our arguments, and does Task
// Manager show it enabled. In development `process.execPath` is electron.exe, so the app path is
// passed as an argument the way `electron .` does; a packaged build needs only `--background`.
const LOGIN_ITEM_NAME = "MaticDesk";
const quoted = (p) => (/\s/.test(p) ? `"${p}"` : p);
const loginItem = () => ({ path: process.execPath, args: app.isPackaged ? ["--background"] : [quoted(app.getAppPath()), "--background"] });

/** @returns {{ registered: boolean, enabled: boolean } | null} null when the OS could not be read. */
function readOsAutostart() {
  try {
    const s = app.getLoginItemSettings(loginItem());
    const items = Array.isArray(s.launchItems) ? s.launchItems : null;
    const mine = items?.find((i) => i.name === LOGIN_ITEM_NAME || (i.args ?? []).includes("--background")) ?? null;
    if (mine) return { registered: true, enabled: mine.enabled !== false };
    if (items) return { registered: false, enabled: false };
    return { registered: s.openAtLogin === true, enabled: s.openAtLogin === true };
  } catch (err) {
    log(`[presence] could not read the OS login-item state: ${err.message}`);
    return null;
  }
}

function applyOsAutostart(on) {
  app.setLoginItemSettings({ ...loginItem(), name: LOGIN_ITEM_NAME, openAtLogin: on, enabled: on });
}

/** Read both sides, let the pure rule decide, apply and store only what it says to. */
function reconcileAutostart(reason) {
  const stored = settings.read().openAtLogin;
  const os = readOsAutostart();
  const r = resolveAutostart({ stored, os });
  if (r.apply) applyOsAutostart(r.openAtLogin);
  if (r.store) settings.write({ openAtLogin: r.openAtLogin });
  autostart = r.openAtLogin;
  const osWords = os ? (os.registered ? `registered, ${os.enabled ? "enabled" : "DISABLED in Task Manager"}` : "absent") : "unreadable";
  log(`[presence] start with Windows: ${autostart ? "ON" : "off"} - ${r.why} (stored ${stored === null ? "nothing" : stored}, OS ${osWords}; ${reason})`);
}

/** The tray's checkbox. The user's click is the decision; it goes to the OS and the store together. */
function setAutostart(on) {
  applyOsAutostart(on === true);
  settings.write({ openAtLogin: on === true });
  autostart = on === true;
  log(`[presence] start with Windows turned ${autostart ? "ON" : "off"} from the tray menu (D294)`);
  refreshTray();
}

// ---- the voice follows the window (D293) -----------------------------------------------------------
//
// STRUCTURAL, NOT A HABIT. Three things make "nothing is ever spoken with no visible window" true:
// `tts:speak` refuses while `presenceNow().speech` is "muted"; the window's audio is muted the
// moment it hides (a hidden BrowserWindow can still play sound); and the Piper worker is stopped
// on hide and started again on show - which also means a background agent is not holding a 63 MB
// model and a Python process for nobody.
let voiceStarting = null;
async function startVoice() {
  if (!tts || tts.ready || voiceStarting) return;
  if (presenceNow().speech !== "allowed") return;
  voiceStarting = (async () => {
    const ok = await tts.start(join(ROOT, "scripts/piper_worker.py"));
    log(ok ? "[tts] voice ready" : `[tts] voice unavailable, running text-only: ${tts.readyError}`);
    if (win && !win.isDestroyed()) win.webContents.send("tts:ready", { ready: tts.ready, error: tts.readyError, sampleRate: tts.sampleRate });
  })().finally(() => { voiceStarting = null; });
  await voiceStarting;
}

/** Held updates reach the renderer only when it is listening AND a person can see the window. */
function deliverHeld() {
  if (!rendererReady || !win || win.isDestroyed()) return;
  if (presenceNow().deliver !== "show") return;
  const updates = held.drain();
  for (const u of updates) win.webContents.send("ticket:update", u);
  if (updates.length) log(`[presence] ${updates.length} held update${updates.length === 1 ? "" : "s"} from the desk shown now that the window is visible (D293)`);
  refreshTray();
}

function onWindowShown() {
  if (!win || win.isDestroyed()) return;
  win.webContents.setAudioMuted(false);
  void startVoice();
  deliverHeld();
  refreshTray();
}

function onWindowHidden() {
  // D293 from both sides: nothing is spoken with no visible window, and nothing is LISTENED to.
  // A live session does not outlive the window - the renderer is told to end it, and the
  // microphone is closed in the record NOW rather than when the renderer gets round to it.
  //
  // MAIN ENDS IT, AND DOES NOT WAIT TO BE TOLD. The first version asked the renderer to close the
  // session and report back, and on 2026-11-17 a window was closed mid-session and no closing
  // line was ever written: a hidden window's renderer is the last thing to rely on for stopping a
  // metered clock and an open microphone. So the record is closed and the conversation ended
  // HERE, and the renderer is told afterwards so it can drop the room and put the face away.
  if (liveSession) {
    personaOver("window-hidden");
    if (win && !win.isDestroyed()) win.webContents.send("persona:end", "window-hidden");
  }
  if (win && !win.isDestroyed()) win.webContents.setAudioMuted(true);
  tts?.stop();
  refreshTray();
  log("[presence] window hidden to the notification area - the hub link and the ticket poll keep running; the voice is stopped and the window's audio is muted (D293)");
}

/**
 * Closing the window (D293, D296): hide, never quit. The one-time notice says where the app went,
 * the first time only; it is its own small window rather than a child of the one being hidden, so
 * the window goes away as the user asked and the notice stays until they read it.
 */
function hideToTray() {
  if (!win || win.isDestroyed()) return;
  const out = closeOutcome({ noticeShown: settings.read().firstCloseNoticeShown });
  if (out.remember) settings.write({ firstCloseNoticeShown: true });
  win.hide();
  if (out.notice) {
    log("[presence] first close on this profile - the one-time notice is shown, and remembered (D296)");
    void dialog.showMessageBox({ type: "info", title: out.notice.title, message: out.notice.message, detail: out.notice.detail, buttons: ["OK"], noLink: true });
  }
}

let creating = null;
/** The tray click, the second instance and macOS's dock: show the window, making one if there is none. */
async function showWindow() {
  if (!win || win.isDestroyed()) {
    creating ??= createWindow().finally(() => { creating = null; });
    await creating;
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

async function createWindow() {
  // No default menu. On stage an accidental Alt keypress dropping the File/Edit/View menu over
  // the avatar is exactly the kind of thing that derails a demo.
  Menu.setApplicationMenu(null);
  rendererReady = false;
  win = new BrowserWindow({
    width: 1180,
    height: 800,
    // The panel's own ground (--matic-ui-ground, light). It is only ever seen behind the page
    // while the page is loading, and `show: false` below means that is now nobody's problem:
    // the window appears when the renderer has painted, so a user whose saved theme is dark
    // never sees a light frame flash. The theme itself is applied before first paint by the
    // inline script at the top of index.html - main holds no opinion about it (D243).
    backgroundColor: "#f2f2f3",
    show: false,
    title: "Matic Desk",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // D293: the X hides. Only `before-quit` (the tray's Quit, or the OS) lets a close through.
  win.on("close", (e) => {
    if (isQuitting) return;
    e.preventDefault();
    hideToTray();
  });
  // A renderer that reloads or dies takes the room with it and cannot say so: main closes the
  // record and ends the conversation, the same as for a hidden window.
  win.webContents.on("did-start-navigation", (_e, _url, _inPlace, isMainFrame) => { if (isMainFrame && liveSession) personaOver("renderer-reloaded"); });
  win.webContents.on("render-process-gone", () => { if (liveSession) personaOver("renderer-gone"); });
  win.on("show", onWindowShown);
  win.on("hide", onWindowHidden);
  win.on("closed", () => { win = null; rendererReady = false; refreshTray(); });
  win.webContents.on("did-finish-load", () => { rendererReady = true; deliverHeld(); });
  win.once("ready-to-show", () => { if (win && !win.isDestroyed()) win.show(); });
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

// A second launch while this one runs: show the window (D293). Not when the second launch is the
// logon autostart itself - that asked for presence, not a window.
app.on("second-instance", (_e, argv) => {
  if (Array.isArray(argv) && argv.includes("--background")) { log("[presence] a second launch at logon found this one already running - nothing to do"); return; }
  log("[presence] a second launch asked for the window - showing this one (D293)");
  void showWindow();
});

app.whenReady().then(async () => {
  if (!isPrimary) return;
  const keySource = loadEnvFile();
  const config = JSON.parse(await readFile(join(ROOT, "config.json"), "utf8"));
  // MATIC_PERSONA=1 turns the live persona on for one launch without editing config.json - the
  // same convenience MATIC_ENROLLMENT_SECRET is for the secret. It still needs the hub and the key.
  personaConfig = {
    enabled: process.env.MATIC_PERSONA === "1" || config.persona?.enabled === true,
    maxSessionSeconds: Number.isInteger(config.persona?.maxSessionSeconds) && config.persona.maxSessionSeconds > 0 ? config.persona.maxSessionSeconds : 600,
  };

  // ---- privileged half ----
  broker = new InProcessBroker({
    catalogPath: join(ROOT, "src/broker/catalog.json"),
    auditPath: join(ROOT, "audit/audit.jsonl"),
    onLog: log,
  });

  // ---- unprivileged half ----
  //
  // Which model provider fills the tier-1 slot is a CONFIG choice, not a code change - all three
  // implement the same propose() contract, and all three hand the broker an ordinary Proposal that
  // is re-validated from scratch. Default "cloud": the demo build talks to Anthropic and sends the
  // same request it always sent.
  //
  //   provider: "cloud"  CloudClient (Anthropic)                              - the default
  //   provider: "local"  OpenAICompatibleClient (Ollama, LM Studio, vLLM...)  - also selected by
  //                      the older `localModel.enabled` or MATIC_LOCAL_MODEL, which still work
  //   provider: "hub"    HubClient -> POST /v1/turn on the B0 hub (server/)  - 2026-09-03
  //   MATIC_PROVIDER overrides config for one run.
  //
  // NOTE: this SWAPS the provider, it does not add a routing tier. Tier-0 runs first regardless
  // (D46b) - a printer complaint never leaves the machine whichever provider is configured.
  const localCfg = { enabled: false, baseUrl: "http://127.0.0.1:11434/v1", model: "", ...(config.localModel ?? {}) };
  const provider = process.env.MATIC_PROVIDER
    || (process.env.MATIC_LOCAL_MODEL ? "local" : null)
    || config.provider
    || (localCfg.enabled ? "local" : "cloud");

  let cloud;
  if (provider === "hub") {
    const hubUrl = process.env.MATIC_HUB_URL || config.hubUrl || "http://127.0.0.1:8787";
    // Configurable, because the right value depends on the model behind the hub and the machine
    // it runs on. The default matches the hub's own upstream timeout — see the HubClient
    // constructor for what the old 90s mismatch did on a cold model.
    const hubTimeoutMs = Number(process.env.MATIC_HUB_TIMEOUT_MS || config.hubTimeoutMs || 300000);
    // The connectivity monitor (D49/D51, D233): a shape-checked GET /v1/health on a jittered
    // cadence, plus every real request's outcome reported by HubClient. It pushes each transition
    // to the renderer, which shows it in the status pill and says so in the transcript - and to
    // the tray, which shows unreachable as its own icon (D293).
    hubLink = new HubLink({
      hubUrl,
      onLog: log,
      onChange: (_prev, _next, status) => {
        if (win && !win.isDestroyed()) win.webContents.send("hub:link", status);
        refreshTray();
      },
    });
    cloud = new HubClient({ hubUrl, capabilities: broker.listCapabilities(), timeoutMs: hubTimeoutMs, onLog: log, link: hubLink });
    hubUrlForTickets = hubUrl;

    // ---- enrollment at startup (D282, D285; P3b, 2026-09-12) - the client half of B3 ----
    //
    // The tenant and its enrollment secret come from config.json (`enrollment`), PLAINTEXT and
    // per install - Charles's decision on 2026-09-12, because there is no installer to deliver it
    // any other way (config.json's _enrollmentNote says the rest) - or from the environment for one
    // run. The credential the hub returns ONCE is kept beside the profile in per-user userData,
    // which is what makes it a per-OS-user enrollment of the software and not a machine identity.
    // HubClient presents it on every request from the moment it lands; a turn that happens first
    // goes unauthenticated, which a loopback hub accepts (D283).
    //
    // Nothing here blocks the window. A pending, throttled or unreachable outcome is retried on a
    // timer; refused and held are not - their fix is a person's, and the log says which.
    enrollment = new EnrollmentStore({ dir: app.getPath("userData"), onLog: log });
    const enrollCfg = {
      tenant: process.env.MATIC_ENROLLMENT_TENANT || config.enrollment?.tenant || null,
      secret: process.env.MATIC_ENROLLMENT_SECRET || config.enrollment?.secret || null,
    };
    const hubClient = cloud;
    personaHub = cloud;
    // ---- the ticket watch (D288; P4, 2026-09-12) ----
    //
    // Polls GET /v1/tickets on a timer (config `ticketPollMs`, default 60 s, floor 30 s), reads a
    // changed ticket's public timeline - which is the hand-off the hub stamps (D287) - and pushes
    // every entry from the desk the hub has not seen acknowledged to the renderer ONCE, as
    // `ticket:update`. Shown, not spoken: Charles chose show-only on 2026-09-12. Nothing here
    // writes to a ticket except the ack of what the renderer says it showed.
    //
    // SINCE D293 THE POLL OUTLIVES THE WINDOW, and that changes what "shown" has to mean. A hidden
    // window's renderer is alive and would show and ack an update nobody saw - and the ack is what
    // the console reports as "seen" (D287) and what starts D290's auto-close clock. So an update
    // is forwarded only while a window is visible and listening; otherwise it is HELD, the tray
    // turns to needsYou, and it is shown the moment the window is.
    ticketWatch = new TicketWatch({
      client: hubClient,
      dir: app.getPath("userData"),
      intervalMs: Number(process.env.MATIC_TICKET_POLL_MS || config.ticketPollMs || POLL_DEFAULT_MS),
      onLog: log,
      onUpdate: (update) => {
        if (!rendererReady || !win || win.isDestroyed() || presenceNow().deliver !== "show") {
          held.hold(update);
          log(`[presence] ${update.entries.length} entr${update.entries.length === 1 ? "y" : "ies"} from the desk on ${update.reference} held - no visible window to show them; the tray says so (D293)`);
          refreshTray();
          return;
        }
        win.webContents.send("ticket:update", update);
        // The taskbar button flashes when the window is not the one in front - the OS's own "look
        // here" for a window that is not focused, and nothing else: no toast, no sound, no
        // speech. Focus clears it. When the window IS focused the transcript line is enough.
        if (!win.isFocused()) {
          win.flashFrame(true);
          win.once("focus", () => { if (win && !win.isDestroyed()) win.flashFrame(false); });
        }
      },
    });
    // WHERE the stored enrollment is looked for, and whether it is there - said once at startup. On
    // 2026-11-17 an app started from the v2 launcher reported no enrollment while a valid file sat in
    // the profile folder, and nothing in the log said which path had been read.
    log(`[enroll] stored enrollment: ${enrollment.path} (${existsSync(enrollment.path) ? "found" : "NOT FOUND"})`);
    const enroll = async () => {
      const r = await ensureEnrolled({ store: enrollment, hubUrl, tenant: enrollCfg.tenant, secret: enrollCfg.secret, onLog: log });
      if (r.credential) { hubClient.setCredential(r.credential); ticketWatch?.start(); }
      log(`[enroll] ${r.state}${r.deviceId ? ` (device ${r.deviceId})` : ""}${r.why ? ` - ${r.why}` : ""}`);
      if (r.retry) setTimeout(enroll, ENROLL_RETRY_MS).unref();
    };
    void enroll();
    log(`[hub] giving the hub up to ${Math.round(hubTimeoutMs / 1000)}s to answer - a cold model load can take over a minute, and giving up early falls back to machine state, which answers the wrong question confidently`);
    log(`[hub] provider "hub" -> ${hubUrl} - sentences that tier-0 cannot resolve go to the hub; where the hub sends them next is the hub's claim`);
  } else if (provider === "local") {
    const model = process.env.MATIC_LOCAL_MODEL || localCfg.model;
    const baseUrl = process.env.MATIC_LOCAL_BASE_URL || localCfg.baseUrl;
    cloud = new OpenAICompatibleClient({
      model,
      baseUrl,
      apiKey: process.env.MATIC_LOCAL_API_KEY,
      capabilities: broker.listCapabilities(),
      onLog: log,
    });
    log(cloud.available
      ? `[local] ${model} at ${baseUrl} - the cloud model is NOT in use this run`
      : "[local] enabled but no model name configured - tier-0 router only");
  } else {
    cloud = new CloudClient({
      model: config.model,
      capabilities: broker.listCapabilities(),
      onLog: log,
    });
    log(cloud.available
      ? `[cloud] ${config.model} ready (key from ${keySource})`
      : "[cloud] ANTHROPIC_API_KEY not set - tier-0 router only, cloud reasoning unavailable");
  }
  // ---- ticket filing (B6-lite, D213/D215/D216/D217) ----
  //
  // WIRED ONLY WHEN THE PROVIDER CAN ACTUALLY FILE. `fileTicket` exists on HubClient and on
  // nothing else, so `provider: "cloud"` — the frozen demo build's configuration — gets no intake
  // and its escalation behaviour is unchanged BY CONSTRUCTION rather than by a flag someone could
  // flip. The agent's escalation branch reads the same duck-type and withholds the offer, so no
  // configuration can reach a state where the assistant offers a ticket it cannot open.
  //
  // The profile lives in Electron's per-user `userData`, which is what makes "kept locally for
  // each user" true on a shared machine without this code knowing anything about accounts.
  let intake = null;
  if (typeof cloud?.fileTicket === "function") {
    profile = new ProfileStore({ dir: app.getPath("userData"), onLog: log });
    // NOT audit/audit.jsonl. That file is the broker's and records what CHANGED on this machine;
    // this one records what LEFT it. See ticket/egress-audit.js.
    egress = new EgressAudit({ path: join(ROOT, "audit/egress.jsonl"), onLog: log });
    intake = new TicketIntake({ profile, onLog: log });
    const gaps = profile.missing();
    log(`[ticket] filing enabled -> ${hubUrlForTickets}/v1/ticket. Profile at ${profile.path}${gaps.length ? ` (will ask for: ${gaps.map((g) => g.label).join(", ")})` : " (complete)"}`);
  } else {
    log(`[ticket] filing is NOT available on provider "${provider}" - escalations will say so rather than offering`);
  }

  // `egress` is read by the D235 ticket-status branch (what THIS machine filed); null on a build
  // that cannot file, and the reply says so.
  // `restartPolicy` is config data because every threshold in it is an unvalidated proposal rather
  // than a measured benchmark - see `config.json`'s `_restartPolicyNote`. Absent, the defaults in
  // `src/agent/restart-signal.js` apply.
  agent = new Agent({ broker, cloud, intake, egress, ticketWatch, restartPolicy: config.restartPolicy ?? null, diskPolicy: config.diskPolicy ?? null, onLog: log });
  hubLink ??= new HubLink({ onLog: log }); // standalone: no URL, never probes

  tts = new TtsService(config, { onLog: log, rootDir: ROOT });

  // ---- the process's own preferences and the tray (D293–D296) ----
  //
  // Built BEFORE the window, because with Start with Windows there may never be one this run:
  // the tray is the app's presence, and the window is something it can show on request.
  settings = new SettingsStore({ dir: app.getPath("userData"), onLog: log });
  reconcileAutostart("startup");
  tray = new Tray(trayImage("idle"));
  lastIcon = "idle";
  tray.on("click", () => void showWindow());
  tray.on("double-click", () => void showWindow());
  // The OS is re-read when the menu is about to be used, so a change made in Task Manager since
  // startup is what the checkbox shows (D295). Reading a registry key is cheap.
  tray.on("right-click", () => { reconcileAutostart("tray menu"); refreshTray(); });
  refreshTray();

  ipcMain.handle("hub:status", () => hubLink.status());

  // ---- the live persona (D307). Summoned by the user; never started by this process on its own.
  ipcMain.handle("persona:status", () => ({ enabled: Boolean(personaConfig.enabled && personaHub?.mintNuanceToken), live: Boolean(liveSession) }));

  ipcMain.handle("persona:start", async () => {
    log("[persona] the user asked for the live video");
    if (!personaConfig.enabled || !personaHub?.mintNuanceToken) return { ok: false, degrade: true, reason: "disabled" };
    if (liveSession) return { ok: false, degrade: true, reason: "already" };
    // D293: a session is speech and a microphone. Neither exists without a visible window.
    if (!windowVisible()) return { ok: false, degrade: true, reason: "no-visible-window" };
    const opened = await openConversation({ mint: () => personaHub.mintNuanceToken(), end: (id) => personaHub.endNuanceConversation(id), maxSessionSeconds: personaConfig.maxSessionSeconds, log });
    if (!opened.ok) {
      log(`[persona] the live video did not start: ${opened.stage}/${opened.reason}`);
      return { ok: false, degrade: true, stage: opened.stage, reason: `${opened.stage}/${opened.reason}` };
    }
    if (!windowVisible()) {
      // It was hidden while the persona warmed up. End what was started; nothing was joined.
      void endConversation({ conversationId: opened.conversationId, end: (id) => personaHub.endNuanceConversation(id) });
      return { ok: false, degrade: true, reason: "no-visible-window" };
    }
    liveSession = { ref: personaRef(), conversationId: opened.conversationId, sessionToken: opened.sessionToken, openedAtMs: Date.now(), mic: initialMic(), name: opened.persona, host: opened.host };
    egress?.persona("persona.opened", { sessionRef: liveSession.ref, persona: opened.persona, host: opened.host, microphone: "off" });
    // The opening mute is the policy's first command (D303 rule 1); the renderer sends it.
    const mic = personaMicEvent("session.opened");
    return { ok: true, livekitUrl: opened.livekitUrl, roomToken: opened.roomToken, persona: opened.persona, mic };
  });

  // The renderer may ask for exactly two things, and `gesture` is true because this channel is
  // only reachable from the microphone button's click handler. Whether the window is visible is
  // read HERE, not taken from the renderer.
  ipcMain.handle("persona:mic", (_e, event) => {
    log(`[persona] the microphone button asked for ${String(event)}${liveSession ? "" : " with no live session"}`);
    if (event !== "user.mute" && event !== "user.unmute") return { state: liveSession?.mic.state ?? "unavailable", words: micWords(liveSession?.mic.state ?? "unavailable"), commands: [], refused: "not a microphone event the window may send" };
    return personaMicEvent(event, { gesture: true });
  });

  // D310. Its own file: the broker owns audit/audit.jsonl (and `execute` takes a nonce and nothing
  // else), and the egress record is about what LEFT the machine. This is neither - it is how a
  // consent card was answered when it was not a click. Never throws; a lost line is logged.
  ipcMain.handle("consent:voice", (_e, d) => {
    const line = {
      at: new Date().toISOString(),
      event: d?.verdict === "approve" ? "consent.approved-by-voice" : "consent.refused-by-voice",
      nonce: typeof d?.nonce === "string" ? d.nonce : null,
      capabilityId: typeof d?.capabilityId === "string" ? d.capabilityId : null,
      // The words that were taken as the answer - six at most by the rule, capped here regardless.
      heard: String(d?.heard ?? "").slice(0, 120),
      sessionRef: liveSession?.ref ?? null,
    };
    try {
      makeAuditDir(join(ROOT, "audit"), { recursive: true });
      appendVoiceConsent(join(ROOT, "audit/voice-consent.jsonl"), JSON.stringify(line) + "\n", "utf8");
    } catch (err) { log(`[consent] COULD NOT WRITE THE VOICE-CONSENT RECORD (${err.message}). The decision still stands: ${line.event}`); }
    log(`[consent] ${line.event} for ${line.capabilityId ?? "?"}`);
    return { ok: true };
  });

  ipcMain.handle("persona:closed", (_e, reason) => { personaOver(typeof reason === "string" ? reason : "closed"); return { ok: true }; });

  // ---- IPC: registered BEFORE the window exists, so the renderer cannot ask for a handler
  // that is not there yet. ----
  ipcMain.handle("tts:status", () => ({ ready: tts.ready, error: tts.readyError, sampleRate: tts.sampleRate }));

  ipcMain.handle("tts:speak", async (_e, text) => {
    // D293: nothing is spoken with no visible window. The renderer of a hidden window can still
    // ask; the answer is the same refusal a missing voice gets, and the renderer's text-only path
    // handles it. `presence.js` owns the rule; this is where it bites.
    if (presenceNow().speech !== "allowed") {
      log("[tts] speak refused: no visible window (D293) - shown, not spoken");
      return { ok: false, error: "no visible window - nothing is spoken from the notification area (D293)" };
    }
    const r = await tts.synthesize(String(text ?? ""));
    if (!r.ok) {
      log(`[tts] synthesis failed: ${r.error}`);
      return { ok: false, error: r.error };
    }
    return { ok: true, timeline: r.timeline, audio: r.audio };
  });

  // ---- ticket filing IPC (D213). THE ONLY PATH BY WHICH USER DATA LEAVES THIS ENDPOINT. ----
  //
  // `ticket:file` takes the draft AS THE RENDERER HAS IT, including any edit the user made on the
  // review card, because the whole point of the card is that the user approves what is actually
  // sent. It is re-checked here rather than trusted: the renderer is presentation only, and a
  // draft that arrives with a missing reporter is a bug worth catching before it becomes a 400.
  ipcMain.handle("ticket:file", async (_e, draft) => {
    // Both refusals are SPOKEN, so both say it in the user's words and keep the reason in `detail`
    // for the inspector and the egress record (D246). "No hub provider is configured" was the old
    // sentence, and it named a thing the person on the other side of it has never heard of.
    if (typeof cloud?.fileTicket !== "function") {
      return { ok: false, filed: false, error: persona.filing.noDestination, detail: "no hub provider is configured on this build" };
    }
    if (!draft || typeof draft !== "object" || !draft.reporter) {
      return { ok: false, filed: false, error: persona.filing.badDraft, detail: "the draft arrived without a reporter" };
    }

    // Persist any edit the user made on the card, so the next ticket does not ask again for a
    // value they have just corrected. Done BEFORE sending: if the send fails, the correction is
    // still theirs to keep.
    profile?.write(draft.reporter);

    // Recorded BEFORE the request. An egress record written only on success would be missing
    // exactly the case worth auditing - data that left and was not acknowledged.
    egress?.submitted(draft, hubUrlForTickets);

    const res = await cloud.fileTicket(draft);
    if (res.ok) {
      egress?.record("ticket.filed", { reference: res.reference, ticketId: res.ticketId, notified: res.notified });
      log(`[ticket] ${res.reference} filed. notified=${res.notified} - do not tell the user IT has been contacted`);
    } else {
      // `detail` is the half worth having here: "POST http://… failed: fetch failed" is what makes
      // this row answerable six weeks later, and `error` on its own is a sentence about feelings.
      egress?.record("ticket.failed", { error: res.error, detail: res.detail, filed: res.filed });
    }
    return res;
  });

  // Read and write the profile directly, so the user can correct it without waiting to be asked.
  ipcMain.handle("profile:get", () => (profile ? { ok: true, path: profile.path, profile: profile.reporter() } : { ok: false, error: "no profile store on this build" }));
  ipcMain.handle("profile:save", (_e, patch) => {
    if (!profile) return { ok: false, error: "no profile store on this build" };
    profile.write(patch ?? {});
    return { ok: true, profile: profile.reporter() };
  });

  // ---- the tickets band (D242) ----
  //
  // THE SAME READ THE D235 TURN MAKES, AVAILABLE WITHOUT A TURN. The band's ROWS are still what
  // this machine filed and got a reference for, from the egress record; since P4 (D288) each row
  // also carries what the hub last said about that ticket, from the watch's snapshot, keyed by
  // the ENROLLMENT CREDENTIAL (D282/D284) - the identity D242 said did not exist, and now does.
  // `canQueryHub` is the truth of the last poll, not a flag: false with no credential, false while
  // the hub is unreachable, and the band says which. `canFile` is the same duck-type the
  // escalation offer uses, so a build that cannot file says so instead of showing an empty list.
  ipcMain.handle("ticket:filed", () => ({
    filed: egress ? egress.filedFromThisMachine() : [],
    canFile: typeof cloud?.fileTicket === "function",
    canQueryHub: ticketWatch?.canQuery ?? false,
    hub: ticketWatch ? ticketWatch.status() : null,
  }));
  // The renderer SHOWED these entries (D287). The watch tells the hub, which stamps its own clock.
  ipcMain.handle("ticket:ack", (_e, entryIds) => ticketWatch ? ticketWatch.acknowledge(Array.isArray(entryIds) ? entryIds : []) : { ok: false, reason: "no-hub", detail: "no ticket watch on this build" });

  ipcMain.handle("broker:listCapabilities", () => broker.listCapabilities());
  ipcMain.handle("agent:diagnose", () => {
    const { panel } = agent.diagnose();
    // The marks, to the developer log only. Which rows the band points at is a verdict worth being
    // able to audit, and it is not a user surface (D256's rule about the score, one signal along).
    const marks = marksIn(panel.groups);
    log(`[band] ${panel.groups.length} groups, ${panel.groups.reduce((n, g) => n + g.rows.length, 0)} rows`
      + `; marked: ${marks.join(", ") || "nothing - a healthy machine carries no mark"}`);
    return panel;
  });
  ipcMain.handle("agent:propose", async (_e, text) => {
    try {
      return await agent.propose(String(text ?? ""));
    } catch (err) {
      // `err.message` is a JavaScript exception and it was SPOKEN (D247). The stack is already in
      // the log above and the message is on `error`, which the renderer puts in the inspector.
      log(`[agent] propose threw: ${err.stack}`);
      return { ok: false, error: err.message, reply: "Something went wrong while I was working that out, and I'd rather stop than guess. Try telling me again, differently." };
    }
  });
  /**
   * What the user did with the restart recommendation (telemetry spec §6's anti-nag rule).
   *
   * A DECISION CHANNEL AND NOTHING ELSE. It restarts nothing, schedules nothing and proposes
   * nothing - the only state it touches is whether the assistant raises the subject again. It is
   * named for what it does so that reading the preload's channel list says so, and an unrecognised
   * answer is read as a decline rather than as permission to ask again.
   */
  ipcMain.handle("restart:answer", (_e, answer) => agent.answerRestartMoment(answer === "later" ? "later" : "declined"));

  ipcMain.handle("broker:validate", (_e, proposal) => broker.validate(proposal));

  /**
   * Consent, step 1 (D130). The broker validates, renders the consent text ITSELF from the signed
   * catalog, and keeps the proposal. The renderer gets back a nonce and the text to paint - it
   * never holds a token, and after this call it never sends a proposal again.
   */
  ipcMain.handle("broker:prepareConsent", (_e, proposal, opts) => {
    try {
      const request = broker.prepareConsent(proposal, { locale: opts?.locale || app.getLocale() || "en" });
      log(`[broker] consent request ${request.nonce} rendered for ${request.capabilityId} (${request.locale})`);
      return { ok: true, request };
    } catch (err) {
      log(`[broker] ${err.message}`);
      return { ok: false, error: err.message };
    }
  });

  /**
   * Consent, step 2 (D130). The user's Approve click is the consent gesture. The renderer sends the
   * nonce and nothing else; the broker runs the proposal it retained for that nonce. The token is
   * minted inside the broker immediately before execution and never crosses this boundary.
   */
  ipcMain.handle("broker:execute", (_e, nonce) => broker.execute(typeof nonce === "string" ? nonce : ""));

  // ---- the window, unless Windows started us at logon (D294) ----
  //
  // The voice starts when the window SHOWS (`onWindowShown`), after the UI has painted rather
  // than before, so the renderer shows "voice: loading" and waits for the event as it always did.
  if (startInBackground) {
    log("[presence] started with Windows - to the notification area, no window (D294). Click the tray icon to open it.");
  } else {
    await createWindow();
  }

  // ---- hub link: probing starts here whether or not a window exists - the tray is somewhere for
  // the first transition to land now. A standalone link's start() is a no-op. ----
  hubLink.start();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void showWindow();
  });
});

// The tray's Quit, or the OS: the one path that lets a close through (D293).
app.on("before-quit", () => {
  isQuitting = true;
  personaOver("quit");
  hubLink?.stop();
  ticketWatch?.stop();
  tts?.stop();
  tray?.destroy();
  tray = null;
});

// D293: closing the last window does NOT quit and does NOT stop the hub link or the ticket poll -
// that was the whole reason a resolution could wait nine days for a person to chase it (D290's
// backstop, register §5.60). The voice is stopped because there is no window to speak from; the
// hub link and the ticket watch keep running until `before-quit`. test/presence.test.mjs fails if
// `app.quit()` or a `stop()` on either of them ever returns to this handler.
app.on("window-all-closed", () => {
  tts?.stop();
});
