// @ts-check
import personaData from "./persona.json" with { type: "json" };

/**
 * WHICH GREETING THE APP OPENS WITH. D262, 2026-09-11.
 *
 * ==============================================================================================
 * WHY THIS FILE EXISTS: "only one greeting ever played", and it was TWO bugs
 * ==============================================================================================
 *
 * Charles, 2026-09-11: *"Let's remove the old system and replace with new one. The old system
 * wasn't working anyway, only one greeting ever played."* Both causes were read at source before
 * anything was written, and the second is the reason a one-line fix would have been a lie:
 *
 *   1. `renderer.js` spoke `persona.boot[0]` — a HARDCODED INDEX. `persona.boot[1]` had never once
 *      been spoken in the life of the product.
 *   2. The rotation cursor in `social.js` is a module-level `Map`, and its own doc comment says
 *      "per-process, so the rotation survives across turns" — which is correct for the mid-session
 *      "hello" it was written for, and exactly wrong here. **The boot line fires once per process.**
 *      Swapping the hardcoded index for `pickVariant("boot", …)` would have left the cursor at 0 on
 *      every launch, returned `boot[0]` forever, and PASSED ITS TEST.
 *
 * So the cursor for the boot line has to outlive the process. It is not held here: this module is
 * pure, takes the cursors in and hands the next ones back, and the renderer is what persists them
 * (localStorage, the same place the theme lives). That split is what lets a headless test drive
 * every path without a browser.
 *
 * **The in-session rotation in `social.js` is deliberately left alone.** `social.greeting` fires
 * when the user says hello mid-session and the in-memory cursor is right there. Replacing a working
 * mechanism to fix a path that never used it would be the wrong repair.
 *
 * ==============================================================================================
 * WHY THERE ARE TWO SETS AND NOT FOUR — THE CLICK-THROUGH DELETED HALF OF THIS FILE
 * ==============================================================================================
 *
 * Charles asked for a greeting for the special cases — no internet, or no hub — so the app can
 * either start troubleshooting or say plainly what it cannot do right now. Four sets were written:
 * `offline`, `standalone`, `hubUnreachable`, `neutral`. **Then it was run in Electron, and the
 * screenshot settled it.** With no hub configured, one screen carried the fact three times:
 *
 *   the rail     "Working on this machine only — No company guidance or service desk is set up
 *                here. That's normal for this machine."
 *   the band     "ON THIS MACHINE — There's no company guidance or service desk connected here, so
 *                I'll stick to what I can check and fix on this machine itself."
 *   the avatar   "Hi, I'm Matic. There's no service desk connected to this machine, so it's just me
 *                and what I can see here…"
 *
 * `index.html`'s own comment over that band says it: *"what the assistant cannot do right now, SAID
 * ONCE, without apology"*, and D245 is that rule — one fact, one wording, on the surface shown
 * before the user acts. **The band and the rail are that surface, and they are always there.**
 *
 * The division of labour D245 asks for is: **the band says what is available; the greeting says what
 * to do next.** Take the availability half out of a `standalone` greeting and what is left is the
 * neutral boot set — so those states use it, and `bootSetFor` returns `neutral` for every hub state
 * deliberately rather than by omission.
 *
 *   offline   `probe.online === false`. **The one set that survived**, because it does something no
 *             band does: it OFFERS to act. Three of the four capabilities are network faults, so
 *             this is the product's best moment. It names the NETWORK ROUTE, which no other surface
 *             states in a sentence — and deliberately not the guidance or the service desk, which
 *             the band already names. It OFFERS; it never proposes (D198).
 *   neutral   everything else, every hub state included. Claims no state at all.
 *
 * **PRECEDENCE: offline beats every hub state.** A machine with no route cannot reach a hub either,
 * so saying both is saying one fact twice.
 *
 * ==============================================================================================
 * AND THE SECOND REASON, WHICH WOULD HAVE BITTEN EVEN IF D245 DID NOT EXIST
 * ==============================================================================================
 *
 * **At boot the hub state is `checking`, and `checking` is not a state to announce.**
 * `hub-link.js` needs three consecutive probe failures before it will say `unreachable` (D51's
 * hysteresis, so a VPN blip does not flip it). The boot line fires immediately, long before that —
 * measured against a dead hub on 2026-09-11, the greeting went out with `hub=checking`. A
 * state-aware greeting read that early would announce the wrong state, and **announcing "I can't
 * reach the service desk" to a user whose service desk is fine is worse than saying nothing.**
 *
 * `probe.online` has neither problem, which is the other half of why it is the one state kept: it
 * is local, it is known before the first probe, and no other surface states it in a sentence.
 */

/** The sets, in precedence order. `neutral` is last and is the only one that always exists. */
export const BOOT_SETS = /** @type {const} */ (["offline", "neutral"]);

/**
 * Which set this machine's state calls for. Pure, and the whole of the precedence rule.
 *
 * `hubState` is taken and deliberately NOT used to choose a set. It is in the signature because
 * that is the question a reader will arrive with — "why doesn't the greeting mention the hub?" —
 * and the answer belongs at the place someone would go to change it, not three files away. The rail
 * and the standing band state the hub's availability permanently, in the app's settled wording, and
 * D245 gives that fact one wording on one surface. It is still logged by the renderer, because
 * which state the app was in when it spoke is worth knowing even when it changed nothing.
 *
 * @param {{ online?: boolean, hubState?: string }} [state]
 * @returns {"offline"|"neutral"}
 */
export function bootSetFor({ online } = {}) {
  // `online` is only believed when it is explicitly false. Unknown is not offline, and telling
  // someone their network is down when we could not read it is the worst mistake this can make.
  return online === false ? "offline" : "neutral";
}

/**
 * The lines for a set. `neutral` is `persona.boot`; the rest are `persona.bootState[key]`.
 *
 * @param {string} key
 * @param {any} [p]
 * @returns {string[]}
 */
export function bootLines(key, p = personaData) {
  const lines = key === "neutral" ? p?.boot : p?.bootState?.[key];
  return Array.isArray(lines) ? lines.filter((l) => typeof l === "string" && l.trim().length > 0) : [];
}

/**
 * Pick the boot greeting, and hand back the cursors to persist.
 *
 * @param {{
 *   online?: boolean,
 *   hubState?: string,
 *   cursors?: Record<string, number>,
 *   persona?: any,
 * }} [opts]
 * @returns {{ key: string, index: number, line: string, cursors: Record<string, number> } | null}
 *   null only when the persona has no boot lines at all, so a caller says nothing rather than
 *   speaking an empty string.
 */
export function pickBootGreeting({ online, hubState, cursors = {}, persona = personaData } = {}) {
  let key = bootSetFor({ online, hubState });
  let lines = bootLines(key, persona);
  // A state set that is empty or missing falls back to neutral rather than to silence. The degraded
  // sets are the ones a build is most likely to ship without, and the launch must still speak.
  if (lines.length === 0 && key !== "neutral") {
    key = "neutral";
    lines = bootLines(key, persona);
  }
  if (lines.length === 0) return null;

  // A cursor persisted from a build with more lines than this one must not index past the end, and
  // a corrupted value must not throw on the one path that opens the app.
  const raw = Number(cursors?.[key]);
  const index = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) % lines.length : 0;
  // EACH SET ROTATES INDEPENDENTLY. Three offline launches in a row should not silently advance the
  // neutral set past lines the user has never heard.
  return { key, index, line: lines[index], cursors: { ...cursors, [key]: (index + 1) % lines.length } };
}
