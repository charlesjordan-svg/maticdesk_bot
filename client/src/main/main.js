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
import { OpenAICompatibleClient } from "../agent/openai-compatible-client.js";
import { HubClient } from "../agent/hub-client.js";
import { HubLink } from "../agent/hub-link.js";
import { Agent } from "../agent/agent.js";
import { marksIn } from "../agent/machine-band.js";
import { ProfileStore } from "../profile/profile.js";
import { TicketIntake } from "../ticket/intake.js";
import { EgressAudit } from "../ticket/egress-audit.js";
// The two ways this handler can refuse a ticket are both SPOKEN by the avatar, so their wording is
// persona data (D234/D246) and the reason they failed travels beside it as `detail`.
import persona from "../router/persona.json" with { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

let win = null;
let tts = null;
let broker = null;
let agent = null;
// B6-lite (D213, D215, D217). All three stay null on any build that cannot file a ticket, and the
// ticket IPC handlers check that rather than assuming — see the wiring in whenReady.
let profile = null;
let egress = null;
let hubUrlForTickets = null;
// D233. Always constructed - a build with no hub gets a link that reports `standalone`, so the
// renderer's status pill has one shape to read whatever the provider is.
let hubLink = null;

const log = (line) => {
  console.log(line);
  // `win` outlives its window: after close the BrowserWindow object is destroyed but the variable
  // still holds it, and `webContents.send` throws "Object has been destroyed". The Piper worker's
  // exit line arrives exactly then (tts.stop() runs on window-all-closed), which is how this became
  // an uncaught-exception dialog on every close (Charles, 2026-09-10). Same guard on hub:link below.
  if (win && !win.isDestroyed()) win.webContents.send("app:log", line);
};

async function createWindow() {
  // No default menu. On stage an accidental Alt keypress dropping the File/Edit/View menu over
  // the avatar is exactly the kind of thing that derails a demo.
  Menu.setApplicationMenu(null);
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
  win.on("closed", () => { win = null; });
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
    // to the renderer, which shows it in the status pill and says so in the transcript.
    hubLink = new HubLink({
      hubUrl,
      onLog: log,
      onChange: (_prev, _next, status) => { if (win && !win.isDestroyed()) win.webContents.send("hub:link", status); },
    });
    cloud = new HubClient({ hubUrl, capabilities: broker.listCapabilities(), timeoutMs: hubTimeoutMs, onLog: log, link: hubLink });
    hubUrlForTickets = hubUrl;
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
  agent = new Agent({ broker, cloud, intake, egress, restartPolicy: config.restartPolicy ?? null, diskPolicy: config.diskPolicy ?? null, onLog: log });
  hubLink ??= new HubLink({ onLog: log }); // standalone: no URL, never probes

  tts = new TtsService(config, { onLog: log, rootDir: ROOT });

  ipcMain.handle("hub:status", () => hubLink.status());

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
  // THE SAME READ THE D235 TURN MAKES, AVAILABLE WITHOUT A TURN. The band shows what this machine
  // filed and got a reference for; it is NOT a status view and cannot become one here - a hub-side
  // lookup needs a route and a user identity that do not exist (D54, D68/D69), and keying one on
  // the self-asserted `osUsername` is that identity through the back door (D235). `canFile` is the
  // same duck-type the escalation offer uses, so a build that cannot file says so in the band
  // instead of showing an empty list that reads as "no news".
  ipcMain.handle("ticket:filed", () => ({
    filed: egress ? egress.filedFromThisMachine() : [],
    canFile: typeof cloud?.fileTicket === "function",
    canQueryHub: false,
  }));

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

  await createWindow();

  // ---- hub link: probing starts once the window exists, so the first transition has somewhere
  // to land. A standalone link's start() is a no-op. ----
  hubLink.start();

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
  hubLink?.stop();
  tts?.stop();
  if (process.platform !== "darwin") app.quit();
});
