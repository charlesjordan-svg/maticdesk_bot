/**
 * Background presence (D293–D296, 2026-09-13): the tray, the process lifetime, Start with Windows
 * and the first-close notice - every outcome stated without launching Electron.
 *
 * This file IS the falsifiable list of
 * `docs/handovers/2026-09-13-claude-code-handover-background-presence.md` §4, in order:
 *
 *   §1  every tray state from constructed inputs (presence.js is pure)
 *   §2  settings: the default, the toggle, and the Task Manager trap - the OS wins a disagreement
 *   §3  speech: nothing can be spoken while no window is visible, and main.js is built that way
 *   §4  THE D292 DETECTOR, proven in both directions - if `window-all-closed` ever again quits or
 *       stops the poll, this fails with a message naming D292 and the copy that depends on it
 *   §5  copy: the "while I'm on screen" family cannot come back while background mode is on
 *   §6  the icons on disk
 *
 * Where a criterion is about what main.js DOES, it is checked by scanning source with comments
 * removed, the way restart-signal.test.mjs and enrollment.test.mjs do - main.js has no test of its
 * own and a structural check is the honest substitute, as D274's detector is on the server side.
 */
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { presence, closeOutcome, UpdateHold, TRAY_STATES, MENU, FIRST_CLOSE_NOTICE, TOOLTIP_MAX } from "../src/main/presence.js";
import { SettingsStore, resolveAutostart, SETTINGS_DEFAULTS, SETTINGS_FILENAME } from "../src/main/settings.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SRC = join(ROOT, "src");

let pass = 0;
let fail = 0;
/** @param {string} name @param {boolean} ok @param {string} [detail] */
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`); }
}

/** A source file with its prose removed, so a rule about CODE is not satisfied or broken by a comment. */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");
const codeOf = (rel) => stripComments(readFileSync(join(SRC, rel), "utf8"));

const HUBS = ["standalone", "checking", "reachable", "unreachable"];

// ═══ §1 the tray, from constructed inputs ══════════════════════════════════════════════════════
console.log("\n=== 1. presence(): every tray state from constructed inputs ===");
{
  check("exactly three tray states, and they are idle / needsYou / unreachable - no working, no fine", TRAY_STATES.length === 3 && ["idle", "needsYou", "unreachable"].every((s) => TRAY_STATES.includes(s)));
  const presenceCode = codeOf("main/presence.js");
  check("presence.js's CODE never produces a \"working\" or a \"fine\" or an \"ok\" icon (comments stripped)", !/["'`](working|fine|ok|resting)["'`]/.test(presenceCode));
  check("…and every icon literal in it is one of the three", [...presenceCode.matchAll(/icon = ["']([a-zA-Z]+)["']/g)].every((m) => TRAY_STATES.includes(m[1])));

  const base = { visible: false, hub: "reachable", unread: 0, autostart: true };
  check("running, hub reachable, nothing unread, window hidden -> idle, and the tooltip says nothing is waiting", presence(base).icon === "idle" && /nothing waiting for you/.test(presence(base).tooltip));
  check("one unread desk entry with the window hidden -> needsYou", presence({ ...base, unread: 1 }).icon === "needsYou");
  check("…the tooltip carries the count and the words, singular", /1 update from the service desk waiting for you/.test(presence({ ...base, unread: 1 }).tooltip));
  check("…and plural", /3 updates from the service desk waiting/.test(presence({ ...base, unread: 3 }).tooltip));
  check("UNREAD GOES TO ZERO WHEN THE WINDOW IS SHOWN: the same inputs with visible:true -> idle", presence({ ...base, unread: 3, visible: true }).icon === "idle");
  check("UNREACHABLE OUTRANKS UNREAD: hub unreachable with entries held -> unreachable", presence({ ...base, hub: "unreachable", unread: 5 }).icon === "unreachable");
  check("…and its tooltip says cut off, not quiet", /can't reach the service desk/.test(presence({ ...base, hub: "unreachable" }).tooltip));
  check("unreachable with the window visible is still unreachable (a visible window does not make the hub reachable)", presence({ ...base, hub: "unreachable", visible: true }).icon === "unreachable");
  check("standalone (no hub configured) -> idle, and the tooltip says no service desk is connected", presence({ ...base, hub: "standalone" }).icon === "idle" && /no service desk connected/.test(presence({ ...base, hub: "standalone" }).tooltip));
  check("THE ICON NEVER CLAIMS WHAT THE APP CANNOT BACK: checking (no probe has answered) keeps the PREVIOUS icon", presence({ ...base, hub: "checking", previous: "unreachable" }).icon === "unreachable" && presence({ ...base, hub: "checking", previous: "idle" }).icon === "idle");
  check("…checking with unread held shows needsYou (the entries are real whatever the probe says)", presence({ ...base, hub: "checking", unread: 1, previous: "idle" }).icon === "needsYou");
  check("…checking with no previous answer at all -> idle, and the tooltip says the check is in progress rather than claiming reachable", presence({ ...base, hub: "checking" }).icon === "idle" && /checking the service desk/.test(presence({ ...base, hub: "checking" }).tooltip));
  check("…a previous value that is not a tray state is ignored, not shown", presence({ ...base, hub: "checking", previous: "working" }).icon === "idle");
  check("a negative or non-numeric unread counts as none", presence({ ...base, unread: -2 }).icon === "idle" && presence({ ...base, unread: "lots" }).icon === "idle");

  for (const hub of HUBS) {
    for (const unread of [0, 1, 4]) {
      for (const visible of [true, false]) {
        const p = presence({ visible, hub, unread, autostart: false });
        check(`hub=${hub} unread=${unread} visible=${visible}: icon is one of the three (${p.icon}), tooltip starts with the app's name and is under ${TOOLTIP_MAX} chars`, TRAY_STATES.includes(p.icon) && p.tooltip.startsWith("Matic Desk") && p.tooltip.length <= TOOLTIP_MAX);
      }
    }
  }

  // The menu
  const m = presence(base).menu;
  const ids = m.filter((i) => i.id).map((i) => i.id);
  check("the menu is Open / Start with Windows / Quit, in that order, with separators between", ids.join(",") === `${MENU.OPEN},${MENU.AUTOSTART},${MENU.QUIT}` && m.filter((i) => i.type === "separator").length === 2);
  check("Start with Windows is a CHECKBOX and shows the resolved setting", m.find((i) => i.id === MENU.AUTOSTART).type === "checkbox" && m.find((i) => i.id === MENU.AUTOSTART).checked === true && presence({ ...base, autostart: false }).menu.find((i) => i.id === MENU.AUTOSTART).checked === false);
  check("the open item reads Open when hidden and Show when visible (a click on a visible window shows and focuses; it never toggles)", m.find((i) => i.id === MENU.OPEN).label === "Open Matic Desk" && presence({ ...base, visible: true }).menu.find((i) => i.id === MENU.OPEN).label === "Show Matic Desk");
  check("Quit says the app's name, so a user knows what they are quitting", m.find((i) => i.id === MENU.QUIT).label === "Quit Matic Desk");
  check("no menu item is a toggle-hide and none says 'exit' or 'close' (closing is what the X does, and it does not quit)", m.every((i) => !/toggle|exit|close/i.test(i.label ?? "")));

  // deliver
  check("deliver is \"hold\" whenever no window is visible, for every hub state", HUBS.every((hub) => presence({ visible: false, hub, unread: 0, autostart: false }).deliver === "hold"));
  check("…and \"show\" whenever one is", HUBS.every((hub) => presence({ visible: true, hub, unread: 2, autostart: false }).deliver === "show"));
}

// ═══ closeOutcome and UpdateHold ═══
console.log("\n=== 1b. closing, and what is held while nobody is looking ===");
{
  const first = closeOutcome({ noticeShown: null });
  check("closing NEVER quits: hide true, quit false, on a fresh profile", first.hide === true && first.quit === false);
  check("THE FIRST-CLOSE NOTICE FIRES ON THE FIRST CLOSE and asks to be remembered", first.notice === FIRST_CLOSE_NOTICE && first.remember === true);
  const second = closeOutcome({ noticeShown: true });
  check("…and NOT on the second: two closes, one notice", second.notice === null && second.remember === false && second.hide === true && second.quit === false);
  check("a stored false (never shown) fires it too - only true silences it", closeOutcome({ noticeShown: false }).notice !== null);
  check("the notice says the app is still running, WHERE (the notification area), WHY (updates from the service desk) and HOW TO QUIT", /still running/.test(FIRST_CLOSE_NOTICE.message) && /notification area/.test(FIRST_CLOSE_NOTICE.message) && /service desk/.test(FIRST_CLOSE_NOTICE.message) && /Quit it from there/.test(FIRST_CLOSE_NOTICE.detail));
  check("…and it does not say 'tray', 'minimize' or 'background' - words a user has not been taught", ![FIRST_CLOSE_NOTICE.message, FIRST_CLOSE_NOTICE.detail, FIRST_CLOSE_NOTICE.title].some((s) => /\btray\b|minimi[sz]e|background/i.test(s)));

  const hold = new UpdateHold();
  check("an empty hold counts zero", hold.count === 0 && hold.drain().length === 0);
  hold.hold({ reference: "MD-1", entries: [{ id: "a" }, { id: "b" }] });
  hold.hold({ reference: "MD-2", entries: [{ id: "c" }] });
  check("the count is ENTRIES, not updates: two updates with three entries -> 3", hold.count === 3);
  check("an update with no entries is not held", hold.hold({ reference: "MD-3", entries: [] }) === 3 && hold.hold(null) === 3 && hold.count === 3);
  const drained = hold.drain();
  check("drain returns them oldest first and empties the hold", drained.map((u) => u.reference).join(",") === "MD-1,MD-2" && hold.count === 0 && hold.drain().length === 0);
}

// ═══ §2 settings ═══
console.log("\n=== 2. settings: the store, the default, the toggle, and the Task Manager trap ===");
const dir = mkdtempSync(join(tmpdir(), "matic-presence-"));
try {
  const quiet = () => {};
  const store = new SettingsStore({ dir, onLog: quiet });
  check("the store lives in the injected dir as settings.json - NOT in profile.json (D215's identity file)", store.path === join(dir, SETTINGS_FILENAME) && SETTINGS_FILENAME !== "profile.json");
  check("a fresh profile reads null for both keys - never-stored is distinguishable from false", store.read().openAtLogin === null && store.read().firstCloseNoticeShown === null);
  check("THE DEFAULT IS openAtLogin: true (the founder's, D294)", SETTINGS_DEFAULTS.openAtLogin === true);
  check("…so a fresh profile with a clean OS resolves to ON, registers it, and stores it", (() => { const r = resolveAutostart({ stored: null, os: { registered: false, enabled: false } }); return r.openAtLogin === true && r.apply === true && r.store === true; })());
  store.write({ openAtLogin: false });
  check("the toggle writes and reads back", store.read().openAtLogin === false && JSON.parse(readFileSync(store.path, "utf8")).openAtLogin === false);
  store.write({ firstCloseNoticeShown: true });
  check("a second key merges rather than replaces", store.read().openAtLogin === false && store.read().firstCloseNoticeShown === true);
  store.write({ openAtLogin: "yes", colour: "blue", firstCloseNoticeShown: 1 });
  check("unknown keys and non-boolean values are dropped, not stored", store.read().openAtLogin === false && store.read().firstCloseNoticeShown === true && !("colour" in JSON.parse(readFileSync(store.path, "utf8"))));
  writeFileSync(store.path, "{ not json", "utf8");
  check("a corrupt file reads as empty rather than throwing", store.read().openAtLogin === null && store.read().firstCloseNoticeShown === null);
  rmSync(store.path);

  // resolveAutostart: the whole table
  const on = { registered: true, enabled: true };
  const off = { registered: false, enabled: false };
  const disabled = { registered: true, enabled: false };
  const r = (stored, os) => resolveAutostart({ stored, os });
  check("stored ON, OS enabled -> ON, nothing to apply or store", (() => { const x = r(true, on); return x.openAtLogin === true && !x.apply && !x.store; })());
  check("stored off, OS absent -> off, nothing to apply or store", (() => { const x = r(false, off); return x.openAtLogin === false && !x.apply && !x.store; })());
  check("THE TRAP: stored ON, OS says ABSENT -> resolves to OFF, STORED, and NOTHING IS RE-REGISTERED (the user turned it off in Task Manager)", (() => { const x = r(true, off); return x.openAtLogin === false && x.apply === false && x.store === true && /Task Manager/.test(x.why); })());
  check("…the same when the entry exists but Task Manager shows it DISABLED", (() => { const x = r(true, disabled); return x.openAtLogin === false && x.apply === false && x.store === true; })());
  check("the OS wins the other way too: stored off, OS enabled -> ON, stored, not re-applied", (() => { const x = r(false, on); return x.openAtLogin === true && x.apply === false && x.store === true; })());
  check("a fresh profile with a leftover DISABLED entry adopts the user's decision (off) rather than the default", (() => { const x = r(null, disabled); return x.openAtLogin === false && x.apply === false && x.store === true; })());
  check("a fresh profile with an existing ENABLED entry is ON without re-registering", (() => { const x = r(null, on); return x.openAtLogin === true && x.apply === false && x.store === true; })());
  check("an UNREADABLE OS changes nothing: stored value stands, nothing applied", (() => { const a = r(true, null); const b = r(false, null); return a.openAtLogin === true && !a.apply && b.openAtLogin === false && !b.apply; })());
  check("…and with nothing stored either, the default is reported but NOT applied (do not touch a registry you cannot read)", (() => { const x = r(null, null); return x.openAtLogin === true && x.apply === false; })());
  check("A TEST THAT WOULD FAIL IF THE APP RE-ASSERTED ITSELF: across every stored/OS combination, apply is true ONLY for a fresh profile against a clean OS", (() => {
    let applied = 0, other = 0;
    for (const stored of [null, true, false]) for (const os of [on, off, disabled, null]) {
      const x = r(stored, os);
      if (x.apply) { applied++; if (!(stored === null && os === off)) other++; }
    }
    return applied === 1 && other === 0;
  })());
  check("every outcome carries a `why` a log line can print", [null, true, false].every((s) => [on, off, disabled, null].every((os) => typeof r(s, os).why === "string" && r(s, os).why.length > 10)));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// ═══ §3 speech ═══
console.log("\n=== 3. speech: nothing can be spoken while no window is visible ===");
{
  let muted = 0, total = 0;
  for (const hub of HUBS) for (const unread of [0, 1]) for (const previous of [null, "idle", "needsYou"]) {
    total++;
    if (presence({ visible: false, hub, unread, autostart: true, previous }).speech === "muted") muted++;
  }
  check(`speech is "muted" for EVERY combination with no visible window (${muted}/${total})`, muted === total);
  check("…and \"allowed\" only with a visible window", HUBS.every((hub) => presence({ visible: true, hub, unread: 0, autostart: true }).speech === "allowed"));
  check("visible must be exactly true - a truthy string does not count as a window", presence({ visible: "yes", hub: "reachable", unread: 0, autostart: true }).speech === "muted");

  const main = codeOf("main/main.js");
  const speak = main.match(/ipcMain\.handle\("tts:speak",[\s\S]*?\n  \}\);/)?.[0] ?? "";
  check("main.js's tts:speak handler checks presenceNow().speech BEFORE tts.synthesize - structural, not a comment", speak.indexOf('presenceNow().speech !== "allowed"') !== -1 && speak.indexOf('presenceNow().speech !== "allowed"') < speak.indexOf("tts.synthesize("));
  check("…and refuses with ok:false rather than speaking", /return \{ ok: false, error: "no visible window/.test(speak));
  check("the window's AUDIO is muted on hide (a hidden BrowserWindow can still play sound) and unmuted on show", /setAudioMuted\(true\)/.test(main.match(/function onWindowHidden[\s\S]*?\n\}/)?.[0] ?? "") && /setAudioMuted\(false\)/.test(main.match(/function onWindowShown[\s\S]*?\n\}/)?.[0] ?? ""));
  check("the Piper worker is STOPPED on hide and only started with a window (startVoice checks presence)", /tts\?\.stop\(\)/.test(main.match(/function onWindowHidden[\s\S]*?\n\}/)?.[0] ?? "") && /presenceNow\(\)\.speech !== "allowed"\) return;/.test(main.match(/async function startVoice[\s\S]*?\n\}/)?.[0] ?? ""));
  check("startVoice is called from onWindowShown and from nowhere before a window exists", /void startVoice\(\)/.test(main.match(/function onWindowShown[\s\S]*?\n\}/)?.[0] ?? "") && (main.match(/startVoice\(\)/g) ?? []).length === 2);
  const tts = codeOf("main/tts-service.js");
  check("tts-service survives a restart: a replaced worker's late exit does not mark the new one not-ready, and stop() clears ready", /if \(this\.proc !== null && this\.proc !== proc\) return;/.test(tts) && /this\.proc = null;\s*this\.ready = false;/.test(tts));
}

// ═══ §4 THE D292 DETECTOR ═══
console.log("\n=== 4. the D292 detector: window-all-closed may never again quit or stop the poll - proven both ways ===");

/**
 * The detector. Pointed at main.js's code (comments stripped). Returns the problems it found; an
 * empty list is a pass. Named for the decision it guards so the failure names it too.
 * @param {string} code
 */
function detectBackgroundPresence(code) {
  const problems = [];
  const handler = code.match(/app\.on\("window-all-closed",[\s\S]*?\n\}\);/)?.[0];
  if (!handler) problems.push("no window-all-closed handler found at all");
  else {
    if (/app\.quit\(\)/.test(handler)) problems.push("window-all-closed calls app.quit() - the process dies with its window");
    if (/ticketWatch\??\.stop\(\)/.test(handler)) problems.push("window-all-closed stops the ticket watch - no update can arrive with the window closed");
    if (/hubLink\??\.stop\(\)/.test(handler)) problems.push("window-all-closed stops the hub link");
  }
  if (!/requestSingleInstanceLock\(\)/.test(code)) problems.push("no single-instance lock: with autostart ON a desktop double-click starts a second process");
  if (!/app\.on\("second-instance"/.test(code)) problems.push("no second-instance handler to show the existing window");
  if (!/app\.on\("before-quit"/.test(code) || !/isQuitting = true/.test(code)) problems.push("no before-quit that sets isQuitting - the tray's Quit cannot get a close through");
  const close = code.match(/win\.on\("close",[\s\S]*?\}\);/)?.[0] ?? "";
  if (!/e\.preventDefault\(\)/.test(close) || !/hideToTray\(\)/.test(close)) problems.push("the window's close does not hide to the tray");
  if (!/new Tray\(/.test(code)) problems.push("no Tray is created");
  if (!/setLoginItemSettings\(/.test(code)) problems.push("Start with Windows is not wired");
  if (!/held\.hold\(update\)/.test(code)) problems.push("an update arriving with no visible window is not held - a hidden renderer would show and ACK it, and the console would say 'seen' about a screen nobody saw (D287/D290)");
  return problems;
}

const DEPENDENT_COPY = [
  "client/src/renderer/renderer.js - the tickets band's note (\"I keep checking after you close this window\")",
  "client/src/router/persona.json - tickets.someKnown (\"keep checking after you close this window\")",
  "client/config.json - _ticketPollNote",
  "server/src/admin/pages/tickets.js - the Reply to requester composer, the Resolve form, the flash, notYet(), and the 'Resolved, never delivered' copy",
];
const D292_MESSAGE = (problems) => `D292 (background presence, decided 2026-09-13 - register §5.61, D293) IS BROKEN: ${problems.join("; ")}. Every string below claims the agent keeps working with its window closed and is FALSE again until this is fixed - revisit each, and revert the copy only if the decision is being reversed:\n    ${DEPENDENT_COPY.join("\n    ")}`;

{
  // The handler main.js carried until 2026-09-13, verbatim (handover §1), around a minimal main
  // that has none of the new wiring - the tree D292 was decided against.
  const before = `
app.whenReady().then(async () => { await createWindow(); hubLink.start(); });
app.on("window-all-closed", () => {
  hubLink?.stop();
  ticketWatch?.stop();
  tts?.stop();
  if (process.platform !== "darwin") app.quit();
});
`;
  const problemsBefore = detectBackgroundPresence(before);
  check("THE OTHER DIRECTION: pointed at the pre-D293 handler, the detector FAILS", problemsBefore.length > 0);
  check("…naming the quit, the stopped watch, the missing lock, the missing tray and the missing autostart", /app\.quit/.test(problemsBefore.join()) && /ticket watch/.test(problemsBefore.join()) && /single-instance/.test(problemsBefore.join()) && /Tray/.test(problemsBefore.join()) && /Start with Windows/.test(problemsBefore.join()));
  check("…and its message names D292 and the copy that depends on it", /D292/.test(D292_MESSAGE(problemsBefore)) && DEPENDENT_COPY.every((c) => D292_MESSAGE(problemsBefore).includes(c)));

  // A subtler regression: everything else in place, only the quit put back.
  const live = codeOf("main/main.js");
  const quitOnly = live.replace(/app\.on\("window-all-closed", \(\) => \{\n  tts\?\.stop\(\);\n\}\);/, 'app.on("window-all-closed", () => {\n  tts?.stop();\n  if (process.platform !== "darwin") app.quit();\n});');
  check("…and a tree that only puts `app.quit()` back into the handler is caught on its own (the mutation is real: the replacement changed the source)", quitOnly !== live && detectBackgroundPresence(quitOnly).some((p) => /app\.quit/.test(p)));
  const stopOnly = live.replace(/app\.on\("window-all-closed", \(\) => \{\n  tts\?\.stop\(\);\n\}\);/, 'app.on("window-all-closed", () => {\n  ticketWatch?.stop();\n  tts?.stop();\n});');
  check("…and one that only stops the ticket watch there is caught too", stopOnly !== live && detectBackgroundPresence(stopOnly).some((p) => /ticket watch/.test(p)));

  // THIS DIRECTION: the tree as it stands.
  const problems = detectBackgroundPresence(live);
  check("THE TREE AS IT STANDS PASSES THE DETECTOR", problems.length === 0, problems.length ? D292_MESSAGE(problems) : "");
  check("window-all-closed still stops the VOICE (there is no window to speak from) and nothing else", /tts\?\.stop\(\);/.test(live.match(/app\.on\("window-all-closed",[\s\S]*?\n\}\);/)?.[0] ?? "") && (live.match(/app\.on\("window-all-closed",[\s\S]*?\n\}\);/)?.[0].match(/\.stop\(\)/g) ?? []).length === 1);
  check("before-quit is the one place the hub link and the ticket watch are stopped", (() => { const bq = live.match(/app\.on\("before-quit",[\s\S]*?\n\}\);/)?.[0] ?? ""; return /hubLink\?\.stop\(\)/.test(bq) && /ticketWatch\?\.stop\(\)/.test(bq) && (live.match(/ticketWatch\?\.stop\(\)/g) ?? []).length === 1 && (live.match(/hubLink\?\.stop\(\)/g) ?? []).length === 1; })());
  check("the tray menu's Quit calls app.quit(), and that is the ONLY app.quit() besides the lost-lock exit", (live.match(/app\.quit\(\)/g) ?? []).length === 2 && /if \(!isPrimary\) app\.quit\(\);/.test(live) && /click: \(\) => app\.quit\(\)/.test(live));
  check("a tray click shows the window and never toggles it hidden", /tray\.on\("click", \(\) => void showWindow\(\)\)/.test(live) && !/win\.hide\(\)/.test(live.match(/async function showWindow[\s\S]*?\n\}/)?.[0] ?? ""));
  check("autostart launches to the tray with no window: --background skips createWindow and the startup path does not assume a window exists", /process\.argv\.includes\("--background"\)/.test(live) && /if \(startInBackground\) \{[\s\S]*?\} else \{\s*await createWindow\(\);/.test(live) && /tray = new Tray\(/.test(live) && live.indexOf("tray = new Tray(") < live.indexOf("await createWindow();\n  }"));
  check("the second-instance handler shows the window - but not for a second logon autostart, which asked for presence and not a window", /argv\.includes\("--background"\)\) \{[^}]*return; \}/.test(live.match(/app\.on\("second-instance"[\s\S]*?\n\}\);/)?.[0] ?? "") && /void showWindow\(\);/.test(live.match(/app\.on\("second-instance"[\s\S]*?\n\}\);/)?.[0] ?? ""));
  check("THE OS WINS: startup calls resolveAutostart with what the OS says, applies only when it says to, and re-reads on the tray menu", /resolveAutostart\(\{ stored, os \}\)/.test(live) && /if \(r\.apply\) applyOsAutostart\(r\.openAtLogin\)/.test(live) && /reconcileAutostart\("startup"\)/.test(live) && /reconcileAutostart\("tray menu"\)/.test(live));
  check("the login item is registered with --background so a logon launch can tell itself apart", /args: app\.isPackaged \? \["--background"\]/.test(live));
  check("held updates are delivered only to a renderer that has finished loading (a send before that is silently dropped)", /if \(!rendererReady \|\| !win \|\| win\.isDestroyed\(\)\) return;/.test(live.match(/function deliverHeld[\s\S]*?\n\}/)?.[0] ?? "") && /did-finish-load", \(\) => \{ rendererReady = true; deliverHeld\(\); \}/.test(live));
  check("the direct path holds too when the renderer is not ready or the window is not visible", /if \(!rendererReady \|\| !win \|\| win\.isDestroyed\(\) \|\| presenceNow\(\)\.deliver !== "show"\) \{\s*held\.hold\(update\);/.test(live));
  check("no native OS notification and no balloon (D251 chose against them and nothing here revisits that)", !/new Notification\(|displayBalloon\(/.test(live));
  check("the first-close notice is shown through the app's own dialog, remembered BEFORE it is shown, and only when closeOutcome says so", /if \(out\.remember\) settings\.write\(\{ firstCloseNoticeShown: true \}\);/.test(live) && /if \(out\.notice\) \{[\s\S]*?dialog\.showMessageBox\(/.test(live) && live.indexOf("settings.write({ firstCloseNoticeShown: true })") < live.indexOf("dialog.showMessageBox("));
  check("main.js imports presence and settings from their own modules and defines no icon-state policy of its own", /from "\.\/presence\.js"/.test(live) && /from "\.\/settings\.js"/.test(live) && !/icon = ["']/.test(live));
  check("presence.js imports nothing from Electron", !/from "electron"/.test(readFileSync(join(SRC, "main/presence.js"), "utf8")));
  check("settings.js imports nothing from Electron and nothing from profile.js (its header names profile.js only to say why the preference is NOT there)", !/from "electron"|from "[^"]*profile\.js"/.test(codeOf("main/settings.js")));
}

// ═══ §5 copy ═══
console.log("\n=== 5. copy: the on-screen-only claims are gone, and cannot come back while the detector passes ===");
{
  const renderer = readFileSync(join(SRC, "renderer/renderer.js"), "utf8");
  const note = renderer.match(/ticketsNote\.textContent =[\s\S]*?;/)?.[0] ?? "";
  check("the band's note no longer says \"while I'm on screen\"", !/while I'm on screen/.test(note) && note.length > 0);
  check("…it says the checking continues after the window is closed and where the app is then", /keep checking after you close this window/.test(note) && /notification area/.test(note));
  check("…and still says nothing is emailed (D86) - the premise that changed is presence, not delivery", /nothing is sent to you by email/.test(note));
  const persona = JSON.parse(readFileSync(join(SRC, "router/persona.json"), "utf8"));
  check("the spoken tickets line no longer says \"while this window is open\" and says the checking continues", !/while this window is open/.test(persona.tickets.someKnown) && /keep checking after you close this window/.test(persona.tickets.someKnown));
  check("no persona line anywhere claims the app only works while open", !JSON.stringify(persona).match(/while (this window|I'm|the app) is (open|on screen)/));
  const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
  check("config.json's poll note describes the app running in the notification area, not only the window", /notification area/.test(config._ticketPollNote) && !/while the window is open and/.test(config._ticketPollNote));
  const swept = ["renderer/renderer.js", "router/persona.json", "agent/ticket-watch.js", "main/preload.cjs", "ticket/state-words.js", "router/social.js"]
    .filter((f) => existsSync(join(SRC, f)))
    .map((f) => [f, readFileSync(join(SRC, f), "utf8")])
    .filter(([, s]) => /while I'm on screen|while I'm open|while the app is open|open and polling/.test(s));
  check(`the sweep terms from the handover (§3.1) match nothing in the client's user-facing sources (${swept.map(([f]) => f).join(", ") || "none"})`, swept.length === 0);
  // The console's copy is a HUB-side string the desk reads; it overstated the limitation once this
  // shipped. The mirror of D274's detector: a client test pins a server string to a client premise.
  const consolePage = join(ROOT, "..", "server", "src", "admin", "pages", "tickets.js");
  if (existsSync(consolePage)) {
    const page = readFileSync(consolePage, "utf8");
    check("the console's requester-reach copy no longer says 'open and polling' / 'while their app is open' (server/src/admin/pages/tickets.js)", !/open and polling|while their app is open|while their Matic Desk is open/.test(page));
    check("…and says the app picks it up whenever it is running, naming D293", /whenever it is running/.test(page) && /D293/.test(page));
  }
}

// ═══ §6 icons ═══
console.log("\n=== 6. the three icons are on disk, are PNGs, and are the sizes the tray uses ===");
{
  const files = { idle: "idle", needsYou: "needs-you", unreachable: "unreachable" };
  for (const [state, base] of Object.entries(files)) {
    for (const [size, suffix] of [[16, ""], [32, "@2x"]]) {
      const p = join(ROOT, "assets", "tray", `${base}${suffix}.png`);
      const ok = existsSync(p) && (() => { const b = readFileSync(p); return b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(16) === size && b.readUInt32BE(20) === size; })();
      check(`${state}: ${base}${suffix}.png exists and is a ${size}x${size} PNG`, ok);
    }
  }
  check("main.js maps the three states to exactly these files", /idle: "idle", needsYou: "needs-you", unreachable: "unreachable"/.test(codeOf("main/main.js")));
  const script = readFileSync(join(ROOT, "scripts", "build-tray-icons.mjs"), "utf8");
  check("the build script is in package.json (tray:build) and draws the manifest's static forms - hollow, haloed, struck - not hues", /"tray:build": "node scripts\/build-tray-icons\.mjs"/.test(readFileSync(join(ROOT, "package.json"), "utf8")) && /hollow/.test(script) && /haloed/.test(script) && /struck/.test(script));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
