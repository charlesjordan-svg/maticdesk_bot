/**
 * <matic-bot-avatar> — standalone Web Component.
 *
 * Lifted out of the Claude Design harness (support.js / _ds bundle / .dc.html template syntax).
 * Zero dependencies, zero CDN calls, works in any HTML host (Electron, WebView2, a plain browser).
 * cfg()/renderVals() below are carried over verbatim from MaticBotAvatar.dc.html — same field names,
 * same behavior, already verified there — only the render target changed (real DOM instead of {{ }}
 * template bindings).
 *
 * Usage:
 *   <script type="module" src="matic-bot-avatar.js"></script>
 *   <matic-bot-avatar state="idle"></matic-bot-avatar>
 *   <script type="module">
 *     const el = document.querySelector('matic-bot-avatar');
 *     el.state = 'speaking';   // conversational state
 *     el.viseme = 'open';      // live mouth shape — see TTSVisemeDriver for driving this from audio
 *   </script>
 */

const SHAPES = ["closed", "narrow", "wideFlat", "roundSmall", "roundLarge", "open"];

const PHONEME_BUCKETS = {
  // Each bucket lists the ASCII stand-ins used by hand-authored demo data (v4's showcase page)
  // alongside the real IPA characters espeak-ng/Piper actually emit — confirmed by running Piper
  // with alignment extraction and inspecting its raw phoneme output directly (not assumed).
  closed: ["p", "b", "m", "_", "", "sil"],
  narrow: ["f", "v", "s", "z", "T", "D", "θ", "ð", "t", "d", "n", "l", "ɾ", "ts", "dz"],
  wideFlat: ["e", "E", "ɛ", "eI", "S", "ʃ", "Z", "ʒ", "tS", "tʃ", "dZ", "dʒ", "k", "g", "ɡ", "N", "ŋ", "i", "i:", "iː", "I", "ɪ", "j"],
  roundSmall: ["u", "U", "ʊ", "u:", "uː", "w", "r", "ɹ", "3:", "ɜː", "@", "ə"],
  roundLarge: ["o", "O", "ɔː", "o:", "OI", "ɔɪ", "oU", "oʊ", "ɒ"],
  open: ["a", "A", "ɑ", "ɑː", "a:", "aI", "aɪ", "aU", "aʊ", "V", "ʌ", "h", "æ", "ɐ"]
};
const PHONEME_MAP = {};
for (const shape in PHONEME_BUCKETS) for (const p of PHONEME_BUCKETS[shape]) PHONEME_MAP[p] = shape;

const OVR_MAP = {
  sil: "closed", PP: "closed", nn: "narrow", FF: "narrow", SS: "narrow",
  TH: "narrow", DD: "narrow", kk: "wideFlat", ih: "wideFlat", E: "wideFlat",
  CH: "wideFlat", RR: "roundSmall", ou: "roundSmall", oh: "roundLarge", aa: "open"
};

export function resolveViseme(v) {
  if (!v || v === "auto") return null;
  if (SHAPES.indexOf(v) >= 0) return v;
  if (OVR_MAP[v]) return OVR_MAP[v];
  if (PHONEME_MAP[v]) return PHONEME_MAP[v];
  return "closed";
}

const STYLE = `
:host { display: inline-block; width: 200px; height: 200px; }
.root { position: relative; width: 200px; height: 200px; font-family: 'Barlow', system-ui, sans-serif; }
@keyframes bot-breathe { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
@keyframes bot-bow { 0%,100% { transform: translateY(0) rotate(0deg); } 35%,65% { transform: translateY(4px) rotate(2.5deg); } }
@keyframes bot-wave { 0%,100% { transform: rotate(6deg); } 50% { transform: rotate(-128deg); } }
@keyframes bot-talk { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1.6); } }
@keyframes bot-dot { 0%,100% { opacity: 0.2; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-4px); } }
@keyframes bot-ring { 0% { transform: scale(0.6); opacity: 0.8; } 100% { transform: scale(2); opacity: 0; } }
@keyframes bot-glow { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
@keyframes bot-blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0.12; } }
@keyframes bot-eyeblink { 0%,95.5%,100% { scale: 1 1; } 97.5% { scale: 1 0.08; } }
@keyframes bot-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-2px); } 75% { transform: translateX(2px); } }
@keyframes bot-aperture { 0% { transform: scale(0.8); opacity: 0.9; } 100% { transform: scale(1.5); opacity: 0; } }
@keyframes bot-ingest { 0% { transform: translateY(-34px) scale(1); opacity: 0; } 20% { opacity: 1; } 75% { transform: translateY(0) scale(0.4); opacity: 1; } 100% { transform: translateY(3px) scale(0.12); opacity: 0; } }
@keyframes bot-scan { 0% { transform: translateY(0); opacity: 0; } 20% { opacity: 0.9; } 100% { transform: translateY(32px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .root, .root * { animation-play-state: paused !important; } }
`;

const MARKUP = `
<div class="root">
  <div data-role="rig" style="position:absolute;inset:0">

    <div style="position:absolute;left:69px;top:2px;width:8px;height:24px;border-radius:4px 4px 2px 2px;background:linear-gradient(180deg,#8ff0e6,#a78bfa);transform:rotate(-20deg);box-shadow:0 0 6px rgba(140,200,250,0.5)"></div>
    <div style="position:absolute;left:123px;top:2px;width:8px;height:24px;border-radius:4px 4px 2px 2px;background:linear-gradient(180deg,#8ff0e6,#a78bfa);transform:rotate(20deg);box-shadow:0 0 6px rgba(140,200,250,0.5)"></div>

    <div style="position:absolute;left:78px;top:6px;width:44px;height:46px;border-radius:16px 16px 15px 15px;background:linear-gradient(160deg,#67769c,#3a4767 70%,#2c3752);box-shadow:inset 0 2px 4px rgba(255,255,255,0.28),inset 0 -3px 6px rgba(0,0,0,0.35)"></div>
    <div style="position:absolute;left:71px;top:24px;width:12px;height:16px;border-radius:6px;background:linear-gradient(180deg,#8d8bc0,#5a5f8c)"></div>
    <div style="position:absolute;left:117px;top:24px;width:12px;height:16px;border-radius:6px;background:linear-gradient(180deg,#8d8bc0,#5a5f8c)"></div>

    <div style="position:absolute;left:83px;top:12px;width:34px;height:34px;border-radius:11px;background:radial-gradient(circle at 50% 30%,#141824,#080a11 80%);box-shadow:inset 0 0 6px rgba(0,0,0,0.9),0 0 4px rgba(120,200,250,0.25);overflow:hidden">

      <div data-role="eyes-arc" style="display:none"><div style="width:9px;height:5px;border:2px solid currentColor;border-bottom:none;border-radius:9px 9px 0 0;box-shadow:0 0 5px currentColor"></div><div style="width:9px;height:5px;border:2px solid currentColor;border-bottom:none;border-radius:9px 9px 0 0;box-shadow:0 0 5px currentColor"></div></div>
      <div data-role="eyes-round" style="display:none"><div style="width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 6px currentColor"></div><div style="width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 6px currentColor"></div></div>
      <div data-role="eyes-happy" style="display:none"><div style="width:9px;height:5px;border:2px solid currentColor;border-top:none;border-radius:0 0 9px 9px;box-shadow:0 0 5px currentColor"></div><div style="width:9px;height:5px;border:2px solid currentColor;border-top:none;border-radius:0 0 9px 9px;box-shadow:0 0 5px currentColor"></div></div>
      <div data-role="eyes-lowered" style="display:none"><div style="width:9px;height:2px;border-radius:2px;background:currentColor;transform:rotate(11deg);box-shadow:0 0 5px currentColor"></div><div style="width:9px;height:2px;border-radius:2px;background:currentColor;transform:rotate(-11deg);box-shadow:0 0 5px currentColor"></div></div>
      <div data-role="eyes-cross" style="display:none">
        <div style="position:relative;width:8px;height:8px"><div style="position:absolute;top:3px;left:0;width:8px;height:2px;background:currentColor;transform:rotate(45deg);box-shadow:0 0 5px currentColor"></div><div style="position:absolute;top:3px;left:0;width:8px;height:2px;background:currentColor;transform:rotate(-45deg);box-shadow:0 0 5px currentColor"></div></div>
        <div style="position:relative;width:8px;height:8px"><div style="position:absolute;top:3px;left:0;width:8px;height:2px;background:currentColor;transform:rotate(45deg);box-shadow:0 0 5px currentColor"></div><div style="position:absolute;top:3px;left:0;width:8px;height:2px;background:currentColor;transform:rotate(-45deg);box-shadow:0 0 5px currentColor"></div></div>
      </div>

      <div data-role="mouth"></div>
      <div data-role="scan" style="display:none"></div>
    </div>

    <div style="position:absolute;left:92px;top:50px;width:16px;height:8px;background:linear-gradient(180deg,#3d4763,#2a3149);border-radius:3px"></div>

    <div style="position:absolute;left:58px;top:56px;width:26px;height:21px;border-radius:12px 8px 6px 9px;background:linear-gradient(160deg,#7c7cae,#4b5478)"></div>
    <div style="position:absolute;left:116px;top:56px;width:26px;height:21px;border-radius:8px 12px 9px 6px;background:linear-gradient(200deg,#7c7cae,#4b5478)"></div>

    <div style="position:absolute;left:74px;top:57px;width:52px;height:48px;border-radius:12px 12px 10px 10px;background:linear-gradient(160deg,#5e6c92,#3a4667 65%,#333f5e);box-shadow:inset 0 2px 5px rgba(255,255,255,0.22),inset 0 -4px 8px rgba(0,0,0,0.3)"></div>
    <div style="position:absolute;left:80px;top:96px;width:40px;height:20px;border-radius:6px;background:linear-gradient(180deg,#8b89b8,#5f6288)"></div>
    <div style="position:absolute;left:76px;top:114px;width:48px;height:18px;border-radius:8px 8px 14px 14px;background:linear-gradient(180deg,#5a6588,#39435f)"></div>

    <div style="position:absolute;left:58px;top:62px;width:14px;height:72px;transform-origin:50% 8px;transform:rotate(-6deg)">
      <div style="position:absolute;left:0;top:0;width:14px;height:28px;border-radius:7px;background:linear-gradient(180deg,#66719a,#454f72)"></div>
      <div style="position:absolute;left:1px;top:28px;width:12px;height:28px;border-radius:6px;background:linear-gradient(180deg,#7e7cae,#4e5578)"></div>
      <div style="position:absolute;left:0px;top:29px;width:14px;height:4px;border-radius:2px;background:#7cd8f5;box-shadow:0 0 7px #7cd8f5;opacity:0.9"></div>
      <div style="position:absolute;left:1px;top:56px;width:12px;height:16px;border-radius:5px 5px 7px 7px;background:linear-gradient(180deg,#5c6689,#3c4562)"></div>
    </div>

    <div data-role="right-arm" style="position:absolute;left:128px;top:62px;width:14px;height:72px;transform-origin:50% 8px">
      <div style="position:absolute;left:0;top:0;width:14px;height:28px;border-radius:7px;background:linear-gradient(180deg,#66719a,#454f72)"></div>
      <div style="position:absolute;left:1px;top:28px;width:12px;height:28px;border-radius:6px;background:linear-gradient(180deg,#7e7cae,#4e5578)"></div>
      <div style="position:absolute;left:0px;top:29px;width:14px;height:4px;border-radius:2px;background:#7cd8f5;box-shadow:0 0 7px #7cd8f5;opacity:0.9"></div>
      <div style="position:absolute;left:1px;top:56px;width:12px;height:16px;border-radius:5px 5px 7px 7px;background:linear-gradient(180deg,#5c6689,#3c4562)"></div>
    </div>

    <div style="position:absolute;left:81px;top:128px;width:18px;height:36px;border-radius:8px;background:linear-gradient(180deg,#5c6789,#3d4864)"></div>
    <div style="position:absolute;left:101px;top:128px;width:18px;height:36px;border-radius:8px;background:linear-gradient(180deg,#5c6789,#3d4864)"></div>
    <div style="position:absolute;left:82px;top:160px;width:16px;height:14px;border-radius:6px;background:linear-gradient(180deg,#8b89b8,#5f6288)"></div>
    <div style="position:absolute;left:102px;top:160px;width:16px;height:14px;border-radius:6px;background:linear-gradient(180deg,#8b89b8,#5f6288)"></div>
    <div style="position:absolute;left:83px;top:172px;width:15px;height:16px;border-radius:5px;background:linear-gradient(180deg,#4e5878,#333d57)"></div>
    <div style="position:absolute;left:102px;top:172px;width:15px;height:16px;border-radius:5px;background:linear-gradient(180deg,#4e5878,#333d57)"></div>
    <div style="position:absolute;left:78px;top:186px;width:22px;height:11px;border-radius:4px 6px 5px 5px;background:linear-gradient(180deg,#5a6486,#2f3852)"></div>
    <div style="position:absolute;left:100px;top:186px;width:22px;height:11px;border-radius:6px 4px 5px 5px;background:linear-gradient(180deg,#5a6486,#2f3852)"></div>

    <div data-role="hex" style="position:absolute;left:87px;top:62px;width:26px;height:29px">
      <div style="position:absolute;inset:2px;clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);background:#0d1120;display:flex;align-items:center;justify-content:center">
        <span data-role="hex-letter" style="font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:16px;line-height:1">M</span>
      </div>
    </div>

    <div data-role="aperture-group" style="display:none">
      <div data-role="aperture"></div>
      <div data-role="slot"></div>
    </div>

    <div data-role="ingest-group" style="display:none">
      <div data-role="ingest-wrap">
        <div style="width:100%;height:100%;background:#f2f2f3;border:1.5px solid #416180;padding:3px;display:flex;flex-direction:column;gap:3px">
          <div style="height:2px;background:#5980a6;width:100%"></div>
          <div style="height:2px;background:#b7b7ba;width:70%"></div>
          <div style="height:2px;background:#b7b7ba;width:90%"></div>
        </div>
      </div>
    </div>

    <div data-role="dots-group" style="display:none;position:absolute;left:126px;top:0px;display:flex;gap:5px;align-items:flex-end">
      <div data-role="dot0"></div><div data-role="dot1"></div><div data-role="dot2"></div>
    </div>

    <div data-role="rings-group" style="display:none">
      <div data-role="ring0"></div><div data-role="ring1"></div>
    </div>

    <div data-role="badge-group" style="display:none">
      <div data-role="badge"><span data-role="badge-glyph"></span></div>
    </div>

    <div data-role="ticket" style="display:none;position:absolute;left:134px;top:120px;width:42px;height:30px;background:#f2f2f3;border:1.5px solid #416180;box-shadow:0 2px 6px rgba(20,30,50,0.35);transform:rotate(-8deg);padding:5px 6px;flex-direction:column;gap:3px">
      <div style="height:2px;background:#5980a6;width:100%"></div>
      <div style="height:2px;background:#b7b7ba;width:80%"></div>
      <div style="height:2px;background:#b7b7ba;width:60%"></div>
    </div>

  </div>
</div>
`;

export class MaticBotAvatar extends HTMLElement {
  static get observedAttributes() { return ["state", "viseme"]; }

  constructor() {
    super();
    this._state = "idle";
    this._viseme = null;
    this.jitter = 0.95 + Math.random() * 0.1;
    this.phase = -(Math.random() * 5).toFixed(2);
    this.idleVariant = Math.random() < 0.3 ? "blink" : "plain";
    this._frozen = { hidden: false, reducedMotion: false, idleStatic: false };

    const shadow = this.attachShadow({ mode: "open" });
    const styleEl = document.createElement("style");
    styleEl.textContent = STYLE;
    shadow.appendChild(styleEl);
    const wrap = document.createElement("div");
    wrap.innerHTML = MARKUP;
    shadow.appendChild(wrap.firstElementChild);
    this._q = (role) => shadow.querySelector(`[data-role="${role}"]`);
  }

  get state() { return this._state; }
  set state(v) {
    const prev = this._state;
    this._state = v || "idle";
    if (prev !== this._state) this._armIdleTimer();
    this._render();
  }

  get viseme() { return this._viseme; }
  set viseme(v) {
    this._viseme = v;
    this._render();
  }

  attributeChangedCallback(name, _old, value) {
    if (name === "state") this.state = value;
    if (name === "viseme") this.viseme = value;
  }

  connectedCallback() {
    this._mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    this._onMq = () => { this._frozen.reducedMotion = this._mq.matches; this._render(); };
    this._mq.addEventListener("change", this._onMq);
    this._onVis = () => { this._frozen.hidden = document.hidden; this._render(); };
    document.addEventListener("visibilitychange", this._onVis);
    this._frozen.reducedMotion = this._mq.matches;
    this._frozen.hidden = document.hidden;
    this._armIdleTimer();
    this._render();
  }

  disconnectedCallback() {
    this._mq.removeEventListener("change", this._onMq);
    document.removeEventListener("visibilitychange", this._onVis);
    clearTimeout(this._idleTimer);
  }

  _armIdleTimer() {
    clearTimeout(this._idleTimer);
    const isIdle = this._state === "idle";
    if (isIdle) {
      this._idleTimer = setTimeout(() => { this._frozen.idleStatic = true; this._render(); }, MaticBotAvatar.IDLE_STATIC_MS);
    } else if (this._frozen.idleStatic) {
      this._frozen.idleStatic = false;
    }
  }

  cfg() {
    const s = this._state ?? "idle";
    const base = {
      face: "#7cd8f5", hex: "#7cd8f5", eyes: "arc", mouth: "smile", shift: [0, 0],
      dots: false, rings: false, badge: null, ticket: false, wave: false,
      shake: false, bow: false, breathe: true, aperture: false, ingest: false,
      blink: false, scan: false
    };
    const map = {
      idle: {},
      listening: { eyes: "round", mouth: "roundSmall", rings: true },
      thinking: { eyes: "arc", mouth: "narrow", shift: [-2, -2], dots: true, face: "#a78bfa", hex: "#a78bfa" },
      speaking: { mouth: "talk" },
      greeting: { mouth: "grin", wave: true },
      success: { eyes: "happy", mouth: "grin", face: "#6ee7a8", hex: "#6ee7a8", badge: ["✓", "#3f8f5e"] },
      apologising: { eyes: "lowered", mouth: "narrow", shift: [0, 2], bow: true, breathe: false, face: "#a8c2d4", hex: "#a8c2d4" },
      escalating: { eyes: "arc", mouth: "narrow", ticket: true, face: "#f0c27a", hex: "#f0c27a", badge: ["→", "#b07b2e"] },
      error: { eyes: "cross", mouth: "wideFlat", face: "#f08a80", hex: "#f08a80", badge: ["!", "#b1554c"], shake: true, breathe: false },
      accept: { eyes: "round", mouth: "roundSmall", shift: [0, 2], aperture: true },
      ingest: { eyes: "arc", mouth: "narrow", shift: [0, 1], ingest: true, blink: true, scan: true }
    };
    return Object.assign(base, map[s] || {});
  }

  renderVals() {
    const c = this.cfg();
    const vis = resolveViseme(this._viseme);
    const mouthKey = vis || c.mouth;
    const frozen = this._frozen.hidden || this._frozen.reducedMotion || this._frozen.idleStatic;
    const playState = frozen ? "animation-play-state:paused;" : "";
    const anim = c.shake ? "animation:bot-shake 0.4s ease-in-out infinite;" + playState
      : c.bow ? "animation:bot-bow 3.2s ease-in-out infinite;" + playState
      : (c.breathe ? "animation:bot-breathe " + (4.4 * this.jitter).toFixed(2) + "s ease-in-out " + this.phase + "s infinite;" + playState : "");

    const blinking = this.idleVariant === "blink" && !c.blink && !c.shake && !vis;
    const eyesBox = "position:absolute;left:7px;top:9px;width:20px;display:flex;justify-content:space-between;align-items:center;color:" + c.face
      + ";transform:translate(" + c.shift[0] + "px," + c.shift[1] + "px);transform-origin:50% 50%;"
      + (blinking ? "animation:bot-eyeblink " + (7.3 * this.jitter).toFixed(2) + "s ease-in-out " + this.phase + "s infinite;" + playState : "");

    const C = c.face;
    const mouths = {
      smile: "left:12px;top:22px;width:10px;height:5px;border:2px solid " + C + ";border-top:none;border-radius:0 0 10px 10px;",
      grin: "left:10px;top:21px;width:14px;height:7px;border:2px solid " + C + ";border-top:none;border-radius:0 0 14px 14px;",
      talk: "left:13px;top:21px;width:8px;height:6px;border-radius:2px 2px 6px 6px;background:" + C + ";animation:bot-talk 0.42s ease-in-out infinite;" + playState,
      closed: "left:12px;top:23px;width:10px;height:3px;border:2px solid " + C + ";border-top:none;border-radius:0 0 10px 10px;",
      narrow: "left:14px;top:24px;width:6px;height:2px;border-radius:2px;background:" + C + ";",
      wideFlat: "left:10px;top:24px;width:14px;height:3px;border-radius:2px;background:" + C + ";",
      roundSmall: "left:14px;top:21px;width:6px;height:6px;border-radius:50%;border:2px solid " + C + ";",
      roundLarge: "left:12px;top:19px;width:10px;height:10px;border-radius:50%;border:2px solid " + C + ";",
      open: "left:10px;top:19px;width:14px;height:10px;border-radius:50% 50% 46% 46%;background:" + C + ";"
    };

    return {
      rigStyle: "position:absolute;inset:0;transform-origin:50% 95%;" + anim,
      eyeShown: c.eyes,
      arcEyesStyle: eyesBox,
      roundEyesStyle: eyesBox + "top:11px;",
      happyEyesStyle: eyesBox + "top:10px;",
      loweredEyesStyle: eyesBox + "top:14px;",
      crossEyesStyle: eyesBox + "top:10px;",
      mouthStyle: "position:absolute;box-sizing:border-box;box-shadow:0 0 6px " + C + ";" + mouths[mouthKey],
      showScan: c.scan,
      scanLineStyle: "position:absolute;left:0;top:12px;width:100%;height:2px;background:#7cd8f5;box-shadow:0 0 8px #7cd8f5;animation:bot-scan 1.4s linear infinite;" + playState,
      hexStyle: "position:absolute;left:87px;top:62px;width:26px;height:29px;"
        + "clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);background:" + c.hex
        + ";filter:drop-shadow(0 0 5px " + c.hex + ");"
        + (c.aperture ? "opacity:0.25;" : (c.blink ? "animation:bot-blink 0.4s steps(1,end) infinite;" + playState : "animation:bot-glow 2.6s ease-in-out " + this.phase + "s infinite;" + playState)),
      hexLetterStyle: "font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:16px;line-height:1;color:" + c.hex,
      showAperture: c.aperture,
      apertureStyle: "position:absolute;left:83px;top:58px;width:34px;height:37px;border:2px dashed " + c.hex
        + ";clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);animation:bot-aperture 1.5s ease-out infinite;" + playState,
      slotStyle: "position:absolute;left:91px;top:73px;width:18px;height:6px;border-radius:3px;background:" + c.hex
        + ";box-shadow:0 0 10px " + c.hex + ",inset 0 0 4px rgba(0,0,0,0.5)",
      showIngest: c.ingest,
      ingestWrapStyle: "position:absolute;left:89px;top:56px;width:22px;height:28px;animation:bot-ingest 1.5s ease-in infinite;" + playState,
      showDots: c.dots,
      dotStyle0: "width:7px;height:7px;border-radius:50%;background:#a78bfa;animation:bot-dot 1.1s ease-in-out infinite;" + playState,
      dotStyle1: "width:7px;height:7px;border-radius:50%;background:#a78bfa;animation:bot-dot 1.1s ease-in-out 0.15s infinite;" + playState,
      dotStyle2: "width:7px;height:7px;border-radius:50%;background:#a78bfa;animation:bot-dot 1.1s ease-in-out 0.3s infinite;" + playState,
      showRings: c.rings,
      ringStyle0: "position:absolute;left:61px;top:20px;width:32px;height:24px;border-radius:50%;border:2px solid #7cd8f5;animation:bot-ring 1.6s ease-out infinite;" + playState,
      ringStyle1: "position:absolute;left:107px;top:20px;width:32px;height:24px;border-radius:50%;border:2px solid #7cd8f5;animation:bot-ring 1.6s ease-out 0.4s infinite;" + playState,
      showBadge: !!c.badge,
      showTicket: c.ticket,
      badgeGlyph: c.badge ? c.badge[0] : "",
      badgeStyle: "position:absolute;right:26px;top:0px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;"
        + "font:600 16px 'Barlow',sans-serif;color:#fff;background:" + (c.badge ? c.badge[1] : "#000")
        + ";box-shadow:0 2px 6px rgba(20,30,50,0.35)",
      rightArmStyle: "position:absolute;left:128px;top:62px;width:14px;height:72px;transform-origin:50% 8px;"
        + (c.wave ? "animation:bot-wave 0.9s ease-in-out infinite;" + playState : "transform:rotate(6deg);")
    };
  }

  _render() {
    if (!this.shadowRoot) return;
    const v = this.renderVals();
    this._q("rig").style.cssText = v.rigStyle;

    const eyeStyles = { arc: v.arcEyesStyle, round: v.roundEyesStyle, happy: v.happyEyesStyle, lowered: v.loweredEyesStyle, cross: v.crossEyesStyle };
    for (const key of ["arc", "round", "happy", "lowered", "cross"]) {
      const shown = v.eyeShown === key;
      this._q("eyes-" + key).style.cssText = eyeStyles[key] + (shown ? "" : ";display:none");
    }

    this._q("mouth").style.cssText = v.mouthStyle;
    this._q("scan").style.cssText = v.scanLineStyle + (v.showScan ? "" : ";display:none");

    this._q("hex").style.cssText = v.hexStyle;
    this._q("hex-letter").style.cssText = v.hexLetterStyle;

    this._q("aperture-group").style.display = v.showAperture ? "block" : "none";
    this._q("aperture").style.cssText = v.apertureStyle;
    this._q("slot").style.cssText = v.slotStyle;

    this._q("ingest-group").style.display = v.showIngest ? "block" : "none";
    this._q("ingest-wrap").style.cssText = v.ingestWrapStyle;

    this._q("dots-group").style.display = v.showDots ? "flex" : "none";
    this._q("dot0").style.cssText = v.dotStyle0;
    this._q("dot1").style.cssText = v.dotStyle1;
    this._q("dot2").style.cssText = v.dotStyle2;

    this._q("rings-group").style.display = v.showRings ? "block" : "none";
    this._q("ring0").style.cssText = v.ringStyle0;
    this._q("ring1").style.cssText = v.ringStyle1;

    this._q("badge-group").style.display = v.showBadge ? "block" : "none";
    this._q("badge").style.cssText = v.badgeStyle;
    this._q("badge-glyph").textContent = v.badgeGlyph;

    this._q("ticket").style.display = v.showTicket ? "flex" : "none";

    this._q("right-arm").style.cssText = v.rightArmStyle;
  }
}

customElements.define("matic-bot-avatar", MaticBotAvatar);
MaticBotAvatar.IDLE_STATIC_MS = 20000;
