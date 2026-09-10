// @ts-check
/**
 * <matic-avatar> — the bust avatar as a Web Component over the delivered SVG chassis.
 * BUST AVATAR SPECIFICATION v7, Claude Design delivery of 2026-09-09; integrated 2026-09-10 (D232).
 *
 * Replaces `vendor/matic-bot-avatar.js` (CSS-drawn divs, eleven states, no `declining`) and keeps
 * its driving API on purpose, so renderer.js and TTSVisemeDriver did not have to change to speak
 * to it:
 *
 *   el.state  = "declining";   // conversational state - one of the manifest's twelve
 *   el.viseme = "ʃ";           // live mouth shape during speech; null to hand the mouth back
 *
 * plus two attributes the old element did not have:
 *
 *   size="200"                 // pixels; selects the crop band from the manifest (head below 96,
 *                              // nothing below 32) and enforces each state's minSize
 *   theme="light" | "dark"     // the manifest's token swap; dark knocks the field out (v7 §05)
 *
 * WHAT THIS FILE DOES NOT KNOW. No state names, no eye or mouth pairings, no colours, no motion
 * values. `data-state` on the SVG is the whole contract (see matic-avatar.css); which states exist,
 * their floors and what a phoneme means are read from the manifest through avatar-model.js. The
 * only literals here are the CSS hooks the delivery defines (`.mav-mouth`, `data-visemes`,
 * `--matic-breathe-duration`, `--matic-phase`) and the manifest's own default state.
 *
 * SPEECH. `viseme` writes `data-shape` on the mouth group and `data-visemes` on the SVG. The
 * delivery's state rules are guarded with `:not([data-shape])`, so the live mouth wins outright with
 * no need to change state, and removing the attribute gives the state's mouth back. The rig motion
 * is on a different element and a different property (manifest `motion.composition`), so a swap at
 * phoneme rate never restarts it. The phoneme -> shape table is viseme-map.js, NOT the manifest's -
 * that file says why.
 *
 * REFUSALS. A state the manifest marks parked, a state below its minSize, an unknown name, or any
 * state at a size below the floor is REFUSED with a console warning (v7 §05 misuse row) and `idle`
 * is shown instead - or nothing at all below the floor, where the manifest says to use the tray dot.
 * The refusal is visible on the element as `data-refused` and in the `statechange` event, so a host
 * can notice rather than assume.
 */
import { AVATAR_SVG, AVATAR_CSS } from "./matic-avatar.assets.js";
import { DEFAULT_STATE, MANIFEST, cropFor, renderDecision, resolvesAfterMs } from "./avatar-model.js";
import { resolveViseme } from "./viseme-map.js";

const HOST_CSS = `
:host { display: inline-block; line-height: 0; }
:host([hidden]) { display: none; }
svg { display: block; overflow: visible; }
`;

const DEFAULT_SIZE = MANIFEST.spec.artboard.width;

export class MaticAvatar extends HTMLElement {
  static get observedAttributes() { return ["state", "viseme", "size", "theme"]; }

  constructor() {
    super();
    this._requested = DEFAULT_STATE;
    this._effective = DEFAULT_STATE;
    this._viseme = null;
    this._size = DEFAULT_SIZE;
    this._theme = "light";
    this._resolveTimer = null;
    /** Warnings already printed, so a state held for a minute does not print sixty times. */
    this._warned = new Set();

    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = AVATAR_CSS + HOST_CSS;
    shadow.appendChild(style);

    const tpl = document.createElement("template");
    tpl.innerHTML = AVATAR_SVG;
    const svg = tpl.content.firstElementChild;
    if (!(svg instanceof SVGElement)) throw new Error("matic-avatar: the chassis did not parse as SVG - regenerate matic-avatar.assets.js");
    // The delivery's id is for single-instance addressing on a page; inside a shadow root it is
    // already scoped, and dropping it lets the check page mount many without a duplicate-id warning.
    svg.removeAttribute("id");
    shadow.appendChild(svg);
    this._svg = svg;
    this._mouth = svg.querySelector(".mav-mouth") ?? svg.querySelector("#mouth");

    // Idle jitter and start phase: ONCE per mount, stable for its lifetime (manifest motion.breathe).
    // Two avatars breathing in lockstep are an obvious tell that they are one asset.
    const breathe = MANIFEST.motion.breathe;
    const rate = breathe.jitter?.rate ?? 0.05;
    const maxPhase = breathe.randomStartPhase?.maxSeconds ?? 5;
    svg.style.setProperty("--matic-breathe-duration", `${((breathe.durationMs / 1000) * (1 - rate + Math.random() * 2 * rate)).toFixed(2)}s`);
    svg.style.setProperty("--matic-phase", `-${(Math.random() * maxPhase).toFixed(2)}s`);
  }

  // ---- the driving API, unchanged from the previous element ----

  get state() { return this._requested; }
  set state(v) {
    this._requested = v ? String(v) : DEFAULT_STATE;
    this._apply();
  }

  /** What is actually on screen after refusals - `idle` when the requested state was refused. */
  get effectiveState() { return this._effective; }

  get viseme() { return this._viseme; }
  set viseme(v) {
    this._viseme = v ?? null;
    this._applyViseme();
  }

  get size() { return this._size; }
  set size(v) {
    const n = Number(v);
    this._size = Number.isFinite(n) && n > 0 ? n : DEFAULT_SIZE;
    this._apply();
  }

  get theme() { return this._theme; }
  set theme(v) {
    this._theme = v === "dark" ? "dark" : "light";
    this._applyTheme();
  }

  attributeChangedCallback(name, _old, value) {
    if (name === "state") this.state = value;
    else if (name === "viseme") this.viseme = value;
    else if (name === "size") this.size = value;
    else if (name === "theme") this.theme = value;
  }

  connectedCallback() {
    this._applyTheme();
    this._apply();
    this._applyViseme();
  }

  disconnectedCallback() {
    clearTimeout(this._resolveTimer);
  }

  // ---- internals ----

  _applyTheme() {
    // The token swap has to sit ON the svg: `.mav` declares the light tokens on that element, and a
    // custom property declared on an element beats one inherited from an ancestor. (The delivered
    // harness puts the class on an ancestor; see the integration handover for what that showed.)
    this._svg.classList.toggle("matic-avatar-theme-dark", this._theme === "dark");
    this._svg.classList.toggle("matic-avatar-theme-light", this._theme !== "dark");
  }

  _apply() {
    clearTimeout(this._resolveTimer);
    const decision = renderDecision(this._requested, this._size);
    for (const w of decision.warnings) {
      const key = `${this._requested}@${this._size}:${w}`;
      if (!this._warned.has(key)) { this._warned.add(key); console.warn(w); }
    }

    const crop = cropFor(this._size);
    if (decision.state === null || crop === null) {
      // Below the floor: the manifest says do not render the avatar. Hidden, not shrunk. Via style,
      // not the `hidden` attribute - the UA stylesheet gives that attribute no effect on an SVG
      // element, and the first check-page run showed a 200px bust in the 24px column because of it.
      this._svg.style.display = "none";
      this._effective = decision.state ?? DEFAULT_STATE;
    } else {
      this._svg.style.display = "";
      this._svg.setAttribute("viewBox", crop.viewBox);
      this._svg.setAttribute("width", String(this._size));
      this._svg.setAttribute("height", String(this._size));
      this._svg.setAttribute("data-state", decision.state);
      this._svg.setAttribute("data-crop", crop.crop);
      this._effective = decision.state;

      // A motion that RESOLVES (greeting's two-beat nod) falls back to idle when it is done, as the
      // manifest asks; a looping one holds until the host changes the state.
      const ms = resolvesAfterMs(decision.state);
      if (ms !== null) {
        this._resolveTimer = setTimeout(() => {
          if (this._requested === decision.state) this.state = DEFAULT_STATE;
        }, ms);
      }
    }
    if (decision.refused) this.setAttribute("data-refused", this._requested);
    else this.removeAttribute("data-refused");
    this.setAttribute("data-effective-state", this._effective);

    this.dispatchEvent(new CustomEvent("statechange", {
      detail: { requested: this._requested, state: this._effective, refused: decision.refused, warnings: decision.warnings, size: this._size },
    }));
  }

  _applyViseme() {
    if (!this._mouth) return;
    const shape = resolveViseme(this._viseme);
    if (shape) {
      // Two writes, no transition (the stylesheet forbids one on the mouth): the shape, and the flag
      // that stops the fallback chatter while a stream is bound.
      this._mouth.setAttribute("data-shape", shape);
      this._svg.setAttribute("data-visemes", "");
    } else {
      this._mouth.removeAttribute("data-shape");
      this._svg.removeAttribute("data-visemes");
    }
  }
}

if (!customElements.get("matic-avatar")) customElements.define("matic-avatar", MaticAvatar);
