// @ts-check
/**
 * Background presence (D293–D296, 2026-09-13): the decisions behind the tray icon, in a module
 * that imports nothing from Electron.
 *
 * ===============================================================================================
 * WHY THIS IS A PURE MODULE AND NOT TWENTY LINES IN main.js
 * ===============================================================================================
 *
 * `main.js` has no test file and never will have a useful one: it needs a display, a tray and a
 * Python process to run. This repo's answer to that is already established — `restart-signal.js`,
 * `disk-space.js`, `state-words.js` are pure, a test drives machines and states that do not exist,
 * and the Electron layer is thin wiring. Same here. Given what is true right now — is a window
 * visible, what does `hub-link` say, how many desk entries has `ticket-watch` handed us that nobody
 * has seen — this returns what the tray icon should be, what its tooltip says, what the menu
 * contains, whether the voice may speak and whether an update may be shown. `main.js` applies it
 * and holds no policy. `test/presence.test.mjs` states every outcome without launching Electron.
 *
 * ===============================================================================================
 * THE THREE STATES, AND WHY THERE IS NO FOURTH
 * ===============================================================================================
 *
 * The avatar manifest names four tray reads — resting, working, needsYou, unavailable — "so the day
 * one exists it reads the manifest rather than a second table". This is that day, and it uses three:
 *
 *   idle         running, nothing waiting for the user. The default, and it says nothing.
 *   needsYou     desk entries the endpoint has RECEIVED and NOT YET SHOWN. The whole feature.
 *   unreachable  `hub-link` says unreachable: "quiet" and "cut off" must look different.
 *
 * No "working" — it is rarely visible long enough to read — and no "fine": a mark that says fine is
 * noise (register §5.41: "a mark that says 'fine' is fifteen marks on a healthy machine"). The
 * manifest's own rule stands: the ring is only ever for a state that needs an answer.
 *
 * THE ICON MAY NEVER CLAIM SOMETHING THE APP CANNOT BACK. `hub-link`'s state only ever changes on
 * evidence (D51), so mapping from it directly is already "the last real answer". The one gap is
 * startup, before the first probe has answered (`checking`): the icon keeps whatever it last showed
 * and the tooltip says the check is in progress, rather than claiming reachable or cut off.
 *
 * ===============================================================================================
 * TWO GATES THAT ARE STRUCTURAL, NOT HABITS
 * ===============================================================================================
 *
 *   speech   "muted" whenever no window is visible. D288 is show-only anyway; a voice from an
 *            invisible process is the single worst thing this feature could ship. main.js refuses
 *            `tts:speak`, mutes the window's audio and stops the Piper worker on the strength of
 *            this field — not on a comment.
 *   deliver  "hold" whenever no window is visible. A hidden window's renderer is still alive and
 *            would still SHOW an update and ACK it — and the ack is what the hub stamps as "seen by
 *            the requester" (D287) and what D290 starts the auto-close clock on. An entry shown to a
 *            hidden window is an entry nobody saw. So main.js holds updates while the window is
 *            hidden (`UpdateHold`), and the held count is what turns the icon to needsYou.
 */

/** The only icons this module ever names. A test fails if a fourth appears. */
export const TRAY_STATES = Object.freeze(["idle", "needsYou", "unreachable"]);

/** Menu item ids main.js switches on. Stable strings, not labels, so a label edit changes nothing. */
export const MENU = Object.freeze({ OPEN: "open", AUTOSTART: "autostart", QUIT: "quit" });

/**
 * The one-time notice on the first close (D296). An app that silently refuses to exit is an app
 * people uninstall; this says where it went and how to make it go.
 */
export const FIRST_CLOSE_NOTICE = Object.freeze({
  title: "Matic Desk is still running",
  message: "Matic Desk is still running in the notification area so it can bring you updates from the service desk.",
  detail: "Click its icon there to open it again. Quit it from there when you want it gone.",
});

/** Windows truncates a tooltip past this; a tooltip that ends mid-word is a tooltip that lies. */
export const TOOLTIP_MAX = 127;

/**
 * @typedef {object} PresenceInput
 * @property {boolean} visible         a window exists and is visible (hidden-to-tray is NOT visible)
 * @property {"standalone"|"checking"|"reachable"|"unreachable"} hub  hub-link's state, verbatim
 * @property {number} unread           desk ENTRIES received and held, not yet shown to a visible window
 * @property {boolean} autostart       what the tray's Start with Windows box should show
 * @property {string|null} [previous]  the icon last shown, for the startup gap
 */

/**
 * @typedef {object} Presence
 * @property {"idle"|"needsYou"|"unreachable"} icon
 * @property {string} tooltip
 * @property {Array<{id?: string, label?: string, type?: "checkbox"|"separator", checked?: boolean}>} menu
 * @property {"allowed"|"muted"} speech
 * @property {"show"|"hold"} deliver
 */

/**
 * The whole policy, from inputs to outputs. Deterministic, and every branch is in the test.
 * @param {PresenceInput} input
 * @returns {Presence}
 */
export function presence({ visible, hub, unread, autostart, previous = null }) {
  const shown = visible === true;
  // Entries are only "waiting" while nobody can see them: a visible window is being shown them.
  const waiting = shown ? 0 : Math.max(0, Number(unread) || 0);

  /** @type {Presence["icon"]} */
  let icon;
  if (hub === "unreachable") icon = "unreachable"; // outranks unread: the desk's words cannot arrive
  else if (waiting > 0) icon = "needsYou";
  else if (hub === "checking" && previous && TRAY_STATES.includes(previous)) icon = /** @type {any} */ (previous);
  else icon = "idle";

  const words = icon === "unreachable"
    ? "can't reach the service desk right now"
    : icon === "needsYou"
      ? `${waiting} update${waiting === 1 ? "" : "s"} from the service desk waiting for you`
      : hub === "standalone"
        ? "running, no service desk connected"
        : hub === "checking"
          ? "running, checking the service desk"
          : "running, nothing waiting for you";
  const tooltip = clip(`Matic Desk — ${words}`, TOOLTIP_MAX);

  return {
    icon,
    tooltip,
    menu: [
      { id: MENU.OPEN, label: shown ? "Show Matic Desk" : "Open Matic Desk" },
      { type: "separator" },
      { id: MENU.AUTOSTART, label: "Start with Windows", type: "checkbox", checked: autostart === true },
      { type: "separator" },
      { id: MENU.QUIT, label: "Quit Matic Desk" },
    ],
    speech: shown ? "allowed" : "muted",
    deliver: shown ? "show" : "hold",
  };
}

/**
 * What closing the window does (D293, D296). It never quits. The notice fires on the first close
 * of this profile's life and never again; `remember` is what main.js writes to settings.
 * @param {{ noticeShown: boolean|null }} state
 * @returns {{ hide: true, quit: false, notice: typeof FIRST_CLOSE_NOTICE | null, remember: boolean }}
 */
export function closeOutcome({ noticeShown }) {
  const first = noticeShown !== true;
  return { hide: true, quit: false, notice: first ? FIRST_CLOSE_NOTICE : null, remember: first };
}

/**
 * Updates from the desk that arrived while no window could show them. Held in order, drained in
 * order when a window can. The count is ENTRIES (what the user has not seen), not updates.
 */
export class UpdateHold {
  constructor() {
    /** @type {Array<{ reference: string, entries: object[] }>} */
    this.queue = [];
  }

  /** @param {{ reference: string, entries?: object[] }} update */
  hold(update) {
    if (!update || !Array.isArray(update.entries) || update.entries.length === 0) return this.count;
    this.queue.push(/** @type {any} */ (update));
    return this.count;
  }

  /** Everything held, oldest first, and the hold is empty afterwards. */
  drain() {
    const out = this.queue;
    this.queue = [];
    return out;
  }

  get count() {
    return this.queue.reduce((n, u) => n + u.entries.length, 0);
  }
}

/** @param {string} s @param {number} max */
function clip(s, max) {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
