// @ts-check
/**
 * Renderer. Owns presentation and the consent gesture ONLY.
 *
 * It holds no capability implementation, no Win32 handle, and no policy logic - every
 * privileged step is an IPC call into the Broker (handover §2). If broker logic starts
 * appearing in this file, the Phase 1 refactor becomes a rewrite.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-10 (D240): THIS FILE NOW DRAWS CLAUDE DESIGN'S PANEL, and the rule that shaped the
 * rewrite is one line of the delivery's own notes: **our words stopped reaching the user.**
 *
 * Every line the old renderer printed fell into one of two piles, and they are now routed apart:
 *
 *   OURS      state names, capability ids, template names, provider and source lines, broker
 *             JSON, retrieval internals. These go to the INSPECTOR and the developer log, which
 *             are hidden until asked for. They are not deleted - they are the reason a buyer can
 *             believe the safety story - they are just no longer the user's reading material.
 *
 *   THEIRS    what the system did, did not do, and cannot do: "nothing was filed", "no email was
 *             sent", "whether it was stored is unknown", "the service desk is reachable again".
 *             These stay in the transcript as `.turn-note` lines. Every one of them exists
 *             because of a defect that shipped (D86, D205, D213, 700d920), and tidying them off
 *             the surface to make it calmer would re-open all of them.
 *
 * The avatar is unchanged and still carries the conversational state (D232/v7); what went away is
 * the LABEL under it that printed the state's name.
 */
import { TTSVisemeDriver } from "./vendor/tts-viseme-driver.js";
// The boot line comes from the same persona file as every other social line (D234), so the name
// and the tone are decided in one place. A JSON module, like the avatar manifest.
import persona from "../router/persona.json" with { type: "json" };
// D249: what the VOICE gets when that differs from what the screen gets. Pure and separate so a
// headless test can reach it - renderer.js touches `document` at module scope and no test can.
import { spokenForm } from "./spoken-form.js";

const root = document.documentElement;
const avatar = document.getElementById("avatar");
const transcriptEl = document.getElementById("transcript");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const devlogEl = document.getElementById("devlog");

const insWhen = document.getElementById("insWhen");
const insProposedPlain = document.getElementById("insProposedPlain");
const insProposedData = document.getElementById("insProposedData");
const insCheckedPlain = document.getElementById("insCheckedPlain");
const insCheckedData = document.getElementById("insCheckedData");
const insConsentPlain = document.getElementById("insConsentPlain");
const insConsentData = document.getElementById("insConsentData");
const insDonePlain = document.getElementById("insDonePlain");
const insDoneData = document.getElementById("insDoneData");

const audioEl = new Audio();
const driver = new TTSVisemeDriver(avatar, audioEl);
let voiceReady = false;

// ═══ small DOM helpers ════════════════════════════════════════════════════════════════════════
//
// Built with `textContent`, never innerHTML: every string below is either the user's own sentence,
// the model's, or the broker's, and one of those three is rendered VERBATIM by decision (D130).

/** @param {string} tag @param {string} [cls] @param {string} [text] */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/** The delivery's registration marks. Four `<i>` corners on anything wearing `.bp`. */
function framed(node) {
  for (const c of ["tl", "tr", "bl", "br"]) node.append(el("i", `corner ${c}`));
  return node;
}

/**
 * One turn's worth of transcript. Everything a turn appends goes inside its own wrapper, so the
 * parts of an answer stay together and `scrollIntoView` lands on the turn rather than on whichever
 * fragment was added last.
 */
let currentTurn = null;
function newWrapper() {
  currentTurn = el("div", "transcript-turn");
  transcriptEl.append(currentTurn);
  return currentTurn;
}
function openTurn() {
  // The first thing the USER says retires the first-run panel. `data-scene` has exactly these two
  // values in the app and no control sets it (see index.html) - it is not the harness's switcher.
  // Only this function sets it, so a hub transition or the boot line - neither of which the user
  // asked for - cannot clear the empty state out from under them.
  root.dataset.scene = "live";
  return newWrapper();
}
function turn() { return currentTurn ?? newWrapper(); }
function scrollDown() { transcriptEl.scrollTop = transcriptEl.scrollHeight; }

/** What the user said, as the panel renders it. */
function said(text) {
  const wrap = el("div", "said");
  wrap.append(el("div", "", text));
  turn().append(wrap);
  scrollDown();
}

/** One thing the assistant says. Returns the element so a caller can hang an offer off it. */
function reply(text) {
  const box = framed(el("div", "reply bp"));
  for (const para of String(text).split(/\n{2,}/)) box.append(el("p", "", para));
  turn().append(box);
  scrollDown();
  return box;
}

/**
 * A statement about the SYSTEM, in the user's interest: what was not sent, what is not known,
 * what came back. Not the assistant's voice, and never styled as an error - a decline and a limit
 * are correct outcomes (D205, v7's `declining`), and red is reserved for nothing at all here.
 *
 * @param {string} text
 * @param {{ label?: string, unknown?: boolean }} [opts] `unknown` marks the one flavour that is
 *   not neutral: a fact the user would be harmed by assuming away.
 */
function note(text, { label = "", unknown = false } = {}) {
  const n = el("div", `turn-note${unknown ? " unknown" : ""}`);
  if (label) n.append(el("b", "", label));
  n.append(el("span", "", text));
  turn().append(n);
  scrollDown();
  return n;
}

/** The evidence line, above the thing it justifies. The design's `.why`. */
function why(label, text) {
  const w = el("div", "why");
  w.append(el("span", "", label), el("span", "", text));
  turn().append(w);
  scrollDown();
  return w;
}

function devlog(line) {
  devlogEl.textContent += line + "\n";
}

/** @param {HTMLElement} plainEl @param {HTMLElement} dataEl @param {string} plain @param {unknown} data */
function step(plainEl, dataEl, plain, data) {
  plainEl.textContent = plain;
  dataEl.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
}
const proposed = (plain, data) => step(insProposedPlain, insProposedData, plain, data);
const checked = (plain, data) => step(insCheckedPlain, insCheckedData, plain, data);
const consented = (plain, data) => step(insConsentPlain, insConsentData, plain, data);
const done = (plain, data) => step(insDonePlain, insDoneData, plain, data);

/** The inspector shows THIS turn. Stamped when a turn opens so "this turn" is not a lie. */
function stampInspector() {
  insWhen.textContent = `This turn · ${new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

// ═══ avatar ═══════════════════════════════════════════════════════════════════════════════════
//
// The element decides what it can actually show at its size (D232: a parked or undersized state is
// refused to idle with a console warning) and reports the outcome on `statechange`. The label that
// used to follow that event is gone from the surface; the event now reaches the developer log,
// where a refusal is still visible to us and no longer prints a state name at the user.
function setState(s) { avatar.state = s; }
avatar.addEventListener("statechange", (e) => {
  const { requested, state, refused } = e.detail;
  if (refused) devlog(`[avatar] ${requested} refused at this size - showing ${state}`);
});

/** The rail's second line while a turn is in flight. The avatar says it too; this says it in words. */
function setBusy(on) { root.dataset.busy = on ? "on" : "off"; }

// ═══ theme ════════════════════════════════════════════════════════════════════════════════════
//
// The ONE harness control that is a real user preference (handover §3). Persisted in localStorage
// and applied before first paint by the inline script in index.html; this half keeps the avatar
// and the toggle's glyph in step with it.
function applyTheme(theme) {
  root.dataset.theme = theme;
  avatar.setAttribute("theme", theme);
  const glyph = document.getElementById("themeGlyph");
  if (glyph) glyph.style.clipPath = theme === "dark" ? "inset(0 0 0 50%)" : "inset(0 50% 0 0)";
  try { localStorage.setItem("matic.theme", theme); } catch { /* storage disabled; the session still works */ }
}
document.getElementById("themeToggle").addEventListener("click", () => {
  applyTheme(root.dataset.theme === "dark" ? "light" : "dark");
});

// ═══ inspector ════════════════════════════════════════════════════════════════════════════════
//
// Hidden by default, opens as `overlay` (acceptance 2 and 8 of the design handover). `data-variant`
// is set in index.html and there is NO control for it: which depth the inspector opens at is a
// build decision, not the user's.
function setInspector(on) { root.dataset.inspector = on ? "on" : "off"; }
document.getElementById("inspectorTrigger").addEventListener("click", () => {
  setInspector(root.dataset.inspector !== "on");
});
document.getElementById("inspectorClose").addEventListener("click", () => setInspector(false));
document.getElementById("scrim").addEventListener("click", () => setInspector(false));

// ═══ the two bands ════════════════════════════════════════════════════════════════════════════

const machineGrid = document.getElementById("machineGrid");
const machineChecked = document.getElementById("machineChecked");
const ticketRows = document.getElementById("ticketRows");
const ticketsNote = document.getElementById("ticketsNote");
const ticketCount = document.getElementById("ticketCount");

/**
 * A Windows service state as a person would say it. `?` means the probe could not read it, which
 * is NOT the same as stopped and must not be rendered as though it were.
 */
function serviceWords(stateName) {
  if (stateName === "RUNNING") return "Running normally";
  if (stateName === "STOPPED") return "Stopped";
  if (stateName === "?" || !stateName) return "Couldn't read it from here";
  return String(stateName).toLowerCase().replace(/_/g, " ");
}

/**
 * The machine band. Same probe the router reasons over (`agent.diagnose().panel`), in the user's
 * words. The address rows are kept even though the delivery's mock does not show them: they are
 * the first two things a support call asks for after the machine name, and dropping information
 * the founder has been reading is a change, not a tidy-up.
 */
function renderMachine(facts) {
  if (!facts) return;
  const f = facts;
  // Learned here because this is the one place the probe's facts arrive, and re-learned every time
  // the band re-reads them. See `spokenForm()`: shown, never said (D249).
  rememberEnvironment(f);
  const rows = [
    ["This computer", f.computer],
    ["Signed in as", f.user],
    ["Printing", serviceWords(f.spooler)],
    ["Sound", serviceWords(f.audio)],
    ["Network adapter", !f.adapter || f.adapter === "none" ? "None found" : f.adapter],
    ["Network", f.online === "yes"
      ? (f.dhcp === "RUNNING" ? "Connected, address given out automatically" : "Connected, address not given out automatically")
      : "Not connected"],
  ];
  if (f.ip && f.ip !== "-") rows.push(["This machine's address", f.ip]);
  if (f.gateway && f.gateway !== "-") rows.push(["Router", f.gateway]);

  machineGrid.replaceChildren();
  for (const [label, value] of rows) {
    const row = el("div", "mrow");
    row.append(el("dt", "", label), el("dd", "", String(value ?? "-")));
    machineGrid.append(row);
  }
  machineChecked.textContent = "Checked just now";
}

/**
 * The panel's name for a service, and the probe key that reports it. The catalog's enum is the
 * authority on which services exist; this table only says how to SAY them and where to read their
 * state. A service missing from here simply gets no evidence line.
 */
const SERVICE_PLAIN = {
  spooler: { label: "Printing", fact: "spooler" },
  audiosrv: { label: "Sound", fact: "audio" },
  dhcp: { label: "Network addresses", fact: "dhcp" },
};

/** The one-line evidence for a service proposal, read from the probe the router also read. */
function evidenceFor(proposal, facts) {
  const known = SERVICE_PLAIN[proposal?.parameters?.serviceName];
  const state = known && facts ? facts[known.fact] : null;
  if (!known || !state || state === "?") return null;
  return `${known.label} — ${serviceWords(state).toLowerCase()}.`;
}

/** "today at 9:14", "yesterday at 16:02", "on Saturday 6 September" - the same phrasing the spoken
 *  answer uses (`social.js: whenSpoken`), so the band and the reply do not describe one ticket two
 *  ways. Kept deliberately coarse: the design asks for no timestamps to the second. */
function whenFiled(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "recently";
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86_400_000);
  if (days <= 0) return `Filed today at ${time}`;
  if (days === 1) return `Filed yesterday at ${time}`;
  return `Filed on ${d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}`;
}

/**
 * THE TICKETS BAND (D242, answering the design handover's §4).
 *
 * It ships, and what it shows is the only thing the endpoint honestly knows: the tickets THIS
 * machine filed and got a reference for, read back from the egress record (D235). It is NOT a
 * status view. The hub's ticket table is not visible from here - that needs a route and a user
 * identity (D54, D68/D69) - so every row says "Filed from this machine" where a status would go,
 * and the band's note says the rest in the same words `persona.tickets.some` speaks.
 *
 * A band that looked like a status view and happened to be empty would be the worse outcome by
 * far: the user would read "no news" where the truth is "no lookup".
 */
function renderTickets(status) {
  const filed = status?.filed ?? [];
  const canFile = status?.canFile === true;

  ticketCount.textContent = filed.length ? String(filed.length) : "";
  ticketRows.replaceChildren();

  for (const t of filed) {
    const row = el("div", "trow");
    const ref = el("div", "tref");
    ref.append(el("b", "", t.reference), el("span", "", whenFiled(t.filedAt)));
    const body = el("div", "tbody");
    body.append(
      el("b", "", t.description || "a problem you described"),
      el("span", "", t.notified
        ? "The service desk was notified when this was filed."
        // Same fact as the card's caveat, in the past tense, and it loses "the hub" for the same
        // reason (D246). The two have to keep agreeing: one describes a ticket about to be sent
        // and the other one already sent, and a user who reads both should not meet two vocabularies.
        : "Stored for the service desk to pick up. No email went out, so nobody was alerted automatically."),
    );
    const stat = el("div", "tstat");
    stat.append(el("b", "", "Filed from here"), el("span", "", "Progress not visible"));
    row.append(ref, body, stat);
    ticketRows.append(row);
  }

  ticketsNote.textContent = !canFile
    ? "This machine isn't connected to a service desk, so there is nothing to file from here and nothing to look up."
    : filed.length === 0
      ? "I haven't filed any tickets from this machine. Tickets raised anywhere else won't show here - looking those up isn't built yet."
      : "This is what I sent from this machine. I can't see how they're getting on - checking a ticket's progress with the service desk isn't something I can do in this build - so quote the reference if you follow one up.";
}

/**
 * The band triggers. Opening the machine band re-reads the probe, because a band headed "Checked
 * just now" that shows the boot's values is a small lie with a support call resting on it.
 */
let bandBusy = false;
async function toggleBand(key) {
  const closing = root.dataset.band === key;
  root.dataset.band = closing ? "none" : key;
  // The open/closed state is announced, not only drawn. Both triggers are real `<button>`s and the
  // square beside the words is a decorative `<span>` - checked 2026-09-10, because the handover
  // asked whether it was a checkbox, which would have been announced as one. It is not. What was
  // genuinely missing is this: a disclosure whose state a screen reader cannot read.
  for (const id of ["machineTrigger", "ticketsTrigger"]) {
    const btn = document.getElementById(id);
    btn.setAttribute("aria-expanded", String(root.dataset.band === btn.dataset.bandKey));
  }
  if (closing || bandBusy) return;
  bandBusy = true;
  try {
    if (key === "machine") renderMachine(await window.matic.diagnose());
    if (key === "tickets") renderTickets(await window.matic.ticketsFiled());
  } catch (err) {
    devlog(`[panel] refreshing the ${key} band failed: ${err.message}`);
  } finally {
    bandBusy = false;
  }
}
for (const id of ["machineTrigger", "ticketsTrigger"]) {
  const btn = document.getElementById(id);
  btn.addEventListener("click", () => toggleBand(btn.dataset.bandKey));
}

// ═══ speech ═══════════════════════════════════════════════════════════════════════════════════

/**
 * THIS MACHINE'S NAME IS SHOWN AND NEVER SAID (D249, 2026-09-10, Charles). The rule, the reasoning
 * and the edge cases are in `spoken-form.js`, which is separate and pure so that a headless test
 * can reach it; this file only learns the name and applies it at the funnel.
 */
/** What the probe reported about THIS environment. Shown everywhere; said nowhere. */
let spokenEnv = {};
function rememberEnvironment(facts) {
  // The addresses are THIS machine's own two, not a pattern for anything address-shaped: a hub
  // answer may legitimately tell someone to try 8.8.8.8, and redacting that destroys the answer.
  spokenEnv = { machine: facts?.computer, user: facts?.user, addresses: [facts?.ip, facts?.gateway] };
}

/**
 * Speaks with real Piper audio + viseme sync. Degrades to mouth-only, never to
 * silence-with-no-signal. Returns the element it wrote, so a caller can hang an offer off the
 * message that made it.
 */
async function say(text, endState = "idle") {
  const box = reply(text);
  // Shown above, said below. The mouth is driven by the timeline the SPOKEN text produced, so the
  // visemes match what is heard rather than what is on screen.
  const heard = spokenForm(text, spokenEnv);
  if (heard !== text) devlog(`[tts] this machine's name, account or address is shown, not spoken (D249)`);
  if (!voiceReady) {
    // Cut-order item 3: text only, keep the mouth moving. The 'speaking' state's own
    // mouth animation runs without a phoneme timeline.
    setState("speaking");
    await new Promise((r) => setTimeout(r, Math.min(600 + text.length * 45, 6000)));
    setState(endState);
    return box;
  }
  const r = await window.matic.speak(heard);
  if (!r.ok) {
    devlog(`[tts] ${r.error}`);
    setState("speaking");
    await new Promise((res) => setTimeout(res, Math.min(600 + text.length * 45, 6000)));
    setState(endState);
    return box;
  }
  const url = URL.createObjectURL(new Blob([r.audio], { type: "audio/wav" }));
  audioEl.src = url;
  try {
    await audioEl.play();
  } catch (err) {
    devlog(`[tts] playback blocked: ${err.message}`);
  }
  driver.speak(r.timeline);
  await new Promise((res) => {
    audioEl.onended = res;
    audioEl.onerror = res;
  });
  driver.stop();
  URL.revokeObjectURL(url);
  setState(endState);
  return box;
}

// ═══ the offer affordance (design handover §6) ════════════════════════════════════════════════

/**
 * Yes / No thanks, inside the message that made the offer.
 *
 * WHY THIS IS THE FIX FOR A REAL DEFECT, not decoration. `Agent.propose(text)` was stateless per
 * turn, so "yes please hand to it" arrived as an unrelated new problem (3d1992e). D216's intake
 * remembers the offer and reads the next sentence as an answer - and these buttons send exactly
 * the sentence it is waiting for, down the SAME path as typing. Nothing about the state machine
 * is special-cased for the buttons, which is what keeps the typed path honest too.
 *
 * THERE IS NO "CHANGE MY ANSWER". The delivery has one; the app cannot honour it. A yes files a
 * ticket and a filed ticket cannot be unfiled, so an affordance offering to change it would be
 * offering something the system does not have.
 */
function attachOffer(box) {
  root.dataset.offer = "pending";
  const bar = el("div", "actionbar");
  const pending = el("div", "actions");
  const yes = el("button", "btn btn-primary", "Yes, open a ticket");
  const no = el("button", "btn btn-secondary", "No thanks");
  yes.style.cssText = no.style.cssText = "font-size:var(--matic-ui-text-sm); padding:9px 16px";

  // What would be sent, one click down, in the words the ticket card will show field for field.
  const details = el("details");
  const summary = el("summary");
  summary.append(el("span", "more", "What would you send?"), el("span", "less", "Hide what I'd send"));
  const panel = el("div");
  panel.style.cssText = "margin-top:10px; padding:14px; border:var(--matic-ui-hair) solid var(--matic-ui-line); background:var(--matic-ui-surface); width:100%";
  panel.append(el("div", "", "What I'd send with it"));
  panel.firstChild.setAttribute("style", "font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--matic-ui-ink-quiet); margin-bottom:8px");
  const list = el("div");
  list.style.cssText = "display:flex; flex-direction:column; gap:6px; font-size:var(--matic-ui-text-sm); line-height:1.45; color:var(--matic-ui-ink-muted)";
  for (const line of [
    "What you told me, in your words",
    "What I checked on this machine, and what I found",
    "Anything I tried, and whether it helped",
    "This machine's name and who is signed in",
  ]) list.append(el("span", "", line));
  panel.append(list);
  details.append(summary, panel);

  pending.append(yes, no, details);
  bar.append(pending);
  box.append(bar);
  // The buttons arrive AFTER the message was spoken, so the scroll that followed the message was
  // taken before they existed - and an offer the user has to scroll to find is an offer that gets
  // answered by typing, which is the path D216's escapes exist to survive rather than to invite.
  scrollDown();
  // Nothing is in flight while an offer waits: the rail says so, and says it before the user has
  // to wonder whether the assistant is still working.
  setBusy(false);

  const answer = (text, answered) => {
    // What you answered stays on the message you answered, so scrolling back reads as a record
    // rather than as an offer nobody responded to.
    pending.replaceWith(el("div", "turn-note", answered));
    root.dataset.offer = "none";
    submit(text);
  };
  yes.addEventListener("click", () => answer("yes please", "You said yes"));
  no.addEventListener("click", () => answer("no thanks", "You said no thanks"));
}

// ═══ the ticket review card (D213) ════════════════════════════════════════════════════════════

/**
 * HOW A CLOSED ENUM IS READ, as opposed to how it is stored (D244, 2026-09-10).
 *
 * The review card rendered `category` raw, so `needs_human_judgement` — our enum, in snake_case —
 * was on screen in front of an office worker. Hiding the field would have been the wrong fix: the
 * card is the payload view and D128 requires the user to see what is being sent, so a field they
 * are approving cannot be the field that disappears. The value is GLOSSED instead, with the raw
 * enum kept underneath it and subordinate: the user reads "needs a person", and what will actually
 * be sent is still on the card.
 *
 * THE ENUMS IN `src/agent/prompt.js` ARE THE AUTHORITY; these tables only say how to READ them,
 * exactly as `SERVICE_PLAIN` does for the service names. `test/panel.test.mjs` reads both enum
 * lists out of that file and fails if a member has no plain words here — a new category otherwise
 * reaches the card as itself, which is the defect this table exists to close.
 *
 * The owners are NOT `ESCALATION_OWNER_LABELS`, and the difference is deliberate. That table is
 * the SPOKEN form, so it carries the article the avatar needs ("the identity team"); a label column
 * on a card does not. It used to be `suggestedOwner.replace(/_/g, " ")`, which is correct English
 * for all five of today's members and would silently mis-render the first one that is an acronym
 * (`it_security` → "it security"). A table makes that a decision rather than a coincidence.
 */
const ESCALATION_PLAIN = {
  category: {
    hardware: "a hardware fault",
    account_or_licensing: "an account or a licence",
    server_side_outage: "something is down elsewhere",
    physical: "something physical",
    needs_human_judgement: "needs a person",
    other: "something else",
  },
  owner: {
    desktop_support: "desktop support",
    network_team: "network team",
    identity_team: "identity team",
    vendor: "vendor",
    facilities: "facilities",
  },
};

/**
 * THE TICKET REVIEW CARD (D213, 2026-09-04). Re-dressed in the panel's language on 2026-09-10;
 * every rule about it is unchanged.
 *
 * The user reviews and edits the complete ticket before anything is sent. That was the founder's
 * instruction and it is also the honest shape for an egress action: the thing you are approving
 * should be the thing that goes, field for field, with nothing assembled afterwards.
 *
 * WHAT IS EDITABLE AND WHAT IS NOT, AND WHY THE DIFFERENCE IS VISIBLE.
 *
 *   - The reporter's details and the problem description are INPUTS. They are the user's own
 *     facts and their own words, and if we have them wrong the ticket is wrong.
 *   - The case note, category and suggested owner are SHOWN BUT FIXED. They are the model's
 *     reading of the problem, and they are displayed so nothing is sent that the user has not
 *     seen - but letting a user rewrite the case note would turn the ticket into a document with
 *     two authors and no way to tell which sentence came from where.
 *
 * It resolves only on an explicit click. There is no timeout that submits, for the same reason
 * the consent card has none.
 *
 * @param {object} draft
 * @returns {Promise<object|null>} the (possibly edited) draft, or null if the user cancelled
 */
function reviewTicket(draft) {
  const box = framed(el("div", "bp ticket-review"));
  const head = el("div", "consent-head");
  head.append(el("b", "", "Review before sending"), el("span", "", "Nothing has left this machine"));
  const body = el("div", "ticket-review-body");
  body.append(el("div", "lede", "This is exactly what will be sent. Nothing leaves this machine until you press Send."));

  const fields = el("div", "fields");
  /** One editable row. Returns a getter, so the submit handler reads the DOM rather than a copy. */
  const editable = (labelText, value, { multiline = false } = {}) => {
    fields.append(el("label", "", labelText));
    const input = el(multiline ? "textarea" : "input", "input");
    input.value = value ?? "";
    fields.append(input);
    return () => input.value;
  };
  /**
   * One read-only row, in the mono style, so "shown, not editable" is legible at a glance.
   * `raw` is the stored value behind a glossed one - shown smaller and underneath, never instead
   * of, because the user is approving the thing that gets sent (D244, D128).
   */
  const fixed = (labelText, value, raw) => {
    // An unglossed member falls back to showing itself, and showing it twice would be worse than
    // the defect this replaces - so the raw line appears only when it says something new.
    const show = Boolean(raw) && raw !== value;
    const box = el("div", `fixed${show ? " glossed" : ""}`, value);
    if (show) box.append(el("span", "raw", raw));
    fields.append(el("label", "", labelText), box);
  };

  const r = draft.reporter ?? {};
  const getFirst = editable("First name", r.firstName);
  const getLast = editable("Last name", r.lastName);
  const getLocation = editable("Location", r.location);
  const getContact = editable("Contact", r.contactId);
  // Not editable: it is a statement about which account is running this software, and a field the
  // user can retype is not that. It is shown because the ticket carries it.
  fixed("OS account", `${r.osUsername ?? "unknown"}  (self-asserted — not authenticated)`);
  fixed("Machine", draft.machineName ?? "-");
  const getDescription = editable("Problem", draft.description, { multiline: true });
  // Both are closed enums and both are glossed. An unknown member falls back to the raw value as
  // the gloss rather than to nothing: a category the card cannot name is still a category the user
  // is about to send, and the test that keeps the tables complete is what stops this being seen.
  fixed("Category", ESCALATION_PLAIN.category[draft.category] ?? draft.category, draft.category);
  fixed("Goes to",
    draft.suggestedOwner
      ? ESCALATION_PLAIN.owner[draft.suggestedOwner] ?? draft.suggestedOwner
      : "unrouted — IT will decide",
    draft.suggestedOwner ?? "");
  fixed("Case note", draft.summary);
  if (draft.whatWasChecked) fixed("Already checked", draft.whatWasChecked);
  body.append(fields);

  // The standing caveat, in the card rather than only in a log line: this is where a user decides
  // whether to send, so it is where the limits of what sending achieves have to be readable.
  // "THE HUB" IS OUR WORD AND IT WAS ON THE CARD (D246). The panel calls it the service desk
  // everywhere else — the rail, the standing band, every persona line — and this was the one place
  // a user was asked to approve an egress while reading our name for the thing it goes to. "In
  // this build" went with it, for the same reason. **Every fact is still here**: it is stored,
  // someone has to come and get it, and no email goes out (D86/D213). This is the single place
  // that fact is stated (D245), so it is the one string that may not lose any of it.
  body.append(el("div", "caveat", "This is stored for the service desk to pick up. No email goes out, so nobody is alerted automatically — someone has to come and look."));

  const row = el("div", "actions");
  const send = el("button", "btn btn-primary", "Send it");
  const cancel = el("button", "btn btn-secondary", "Cancel");
  send.style.cssText = cancel.style.cssText = "font-size:var(--matic-ui-text-sm); padding:9px 16px";
  row.append(send, cancel);
  body.append(row);

  box.append(head, body);
  turn().append(box);
  box.scrollIntoView({ block: "nearest" });
  // Waiting on the person at the keyboard, and the rail says so rather than implying work.
  setBusy(false);

  return new Promise((resolve) => {
    const settle = (result, outcomeText) => {
      row.replaceWith(el("div", "turn-note", outcomeText));
      head.lastElementChild.textContent = result ? "Sent by you" : "Nothing was sent";
      setBusy(Boolean(result));
      resolve(result);
    };
    send.onclick = () => settle(
      {
        ...draft,
        description: getDescription(),
        reporter: { ...r, firstName: getFirst(), lastName: getLast(), location: getLocation(), contactId: getContact() },
      },
      "Sent by you.",
    );
    cancel.onclick = () => settle(null, "Cancelled by you — nothing was sent.");
  });
}

// ═══ consent ══════════════════════════════════════════════════════════════════════════════════

/**
 * Inline consent. Rendered into the conversation so it is always the thing in front of the
 * user, and it scrolls itself into view. Resolves true only on an explicit Approve click -
 * there is no default and no timeout that proceeds.
 *
 * Since D130 (2026-09-03) THE BROKER RENDERS AND THIS FUNCTION DISPLAYS. Every string on the card
 * comes from `request.rendered`, built by the privileged half from the signed catalog and kept by
 * it for the audit record. Nothing here reads the capability or the catalog: if this code could
 * construct consent text, someone would (design rule 2). The one exception is `proposal.reasoning`,
 * which is the model's own sentence and is labelled as such.
 *
 * THE 2026-09-10 REDESIGN CHANGED THE FRAME AND NOT ONE WORD INSIDE IT. `r.title` is the card's
 * heading, `r.what` and `r.detail` are its paragraphs, and each is assigned with `textContent` -
 * not wrapped, not shortened, not sentence-cased. The line beside the heading ("Nothing has
 * changed yet") is ours and is a statement about the system, not about the action.
 */
function askConsent(request, proposal) {
  const r = request.rendered;
  const box = framed(el("div", "bp consent"));

  const head = el("div", "consent-head");
  // The line beside the broker's title is a statement about the SYSTEM and it is kept true: it
  // says "nothing has changed yet" while that is so, and is replaced the moment it stops being so.
  // A card still reading "nothing has changed yet" under the sentence confirming that something
  // did is the same defect class as the hub pill that disagreed with the reply (700d920).
  const headState = el("span", "", "Nothing has changed yet");
  head.append(el("b", "", r.title), headState);

  const verbatim = el("div", "consent-verbatim");
  verbatim.append(el("p", "", r.what));
  // `r.detail` is `capabilityId(param=value)` — "restart_service(serviceName=spooler)" — and it was
  // painted as a paragraph, the same size and face as the plain-language sentence above it. NOT ONE
  // BYTE OF IT IS CHANGED HERE (D130: this is displayed, never authored), and it is NOT hidden: the
  // contract calls it the exact call built from the validated parameters, `docs/D130-RENDERER-CHECK.md`
  // checks it by name, and it is the same disclosure D244 refused to hide on the review card. It is
  // given that card's treatment instead — mono, smaller, underneath — so the sentence a person reads
  // is the sentence, and the exact call is available and subordinate. Whether it should also be
  // GLOSSED is a change to the rendered contract and is D248, proposed, awaiting Charles.
  if (r.detail) verbatim.append(el("p", "exact", r.detail));
  if (r.rollbackNote) {
    // The broker phrases R2's note as a warning; R1's is a quiet reassurance. Same field, and the
    // tier decides the weight it is given - never the colour of a failure.
    const n = el("div", "turn-note" + (request.tier === "R2" ? " unknown" : ""));
    n.append(el("span", "", r.rollbackNote));
    verbatim.append(n);
  }

  // A user approved an action and then said: "I feel like I approved that with not enough
  // information." Everything needed to answer "what is this and why?" was known at that moment,
  // and none of it was on screen. It is one click away now, and collapsed by default so the card
  // does not become another wall of text.
  if (r.notice || r.undo || r.why || r.risk) {
    const details = el("details");
    const summary = el("summary");
    summary.append(el("span", "more", "What is this, and why?"), el("span", "less", "Hide the details"));
    const inner = el("div");
    inner.style.cssText = "margin-top:12px; display:flex; flex-direction:column; gap:12px";
    // `proposal.reasoning` is the only part that is specific to THIS problem, so it goes first.
    for (const [heading, bodyText] of [
      ["Why this, here", proposal.reasoning],
      ["What you will notice", r.notice],
      ["Can it be undone", r.undo],
      ["Why it usually helps", r.why],
      ["Risk level", r.risk],
    ]) {
      if (!bodyText) continue;
      const clause = el("div", "aside-note");
      const h = el("div", "", heading);
      h.setAttribute("style", "font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--matic-ui-ink-quiet); margin-bottom:4px");
      clause.append(h, el("p", "", bodyText));
      inner.append(clause);
    }
    details.append(summary, inner);
    verbatim.append(details);
  }

  const row = el("div", "actions");
  row.style.marginTop = "18px";
  const approve = el("button", "btn btn-primary", "Go ahead");
  const deny = el("button", "btn btn-secondary", "Not now");
  approve.style.cssText = deny.style.cssText = "font-size:var(--matic-ui-text-sm); padding:9px 16px";
  row.append(approve, deny);
  verbatim.append(row);

  box.append(head, verbatim);
  turn().append(box);
  box.scrollIntoView({ block: "nearest" });
  consented("Waiting on the person at the keyboard. Nothing has run.", {
    nonce: request.nonce,
    renderedBy: "broker",
    locale: request.locale,
    expiresAt: new Date(request.expiresAt).toISOString(),
    shownVerbatim: true,
    awaiting: "the user's decision",
  });

  // The card is now waiting on the person, not on us.
  setBusy(false);
  scrollDown();

  return new Promise((resolve) => {
    const settle = (approved) => {
      row.replaceWith(el("div", "turn-note", approved ? "Approved by you." : "Not approved — nothing was changed."));
      headState.textContent = approved ? "You approved this" : "You did not approve this";
      setBusy(approved);
      resolve(approved);
    };
    approve.onclick = () => settle(true);
    deny.onclick = () => settle(false);
  });
}

// ═══ the turn ═════════════════════════════════════════════════════════════════════════════════

async function handleTurn(text) {
  openTurn();
  stampInspector();
  said(text);
  setBusy(true);
  // An offer is answered by the sentence that follows it, whatever that sentence is (D216 escape 1),
  // so the hint comes down as soon as the user says anything.
  root.dataset.offer = "none";
  proposed("Working on it…", "…");
  checked("—", "—");
  done("Nothing has been changed on this machine this turn.", { executed: false, changes: [] });

  setState("thinking");
  const res = await window.matic.propose(text);
  renderMachine(res.facts);

  if (res.escalation) {
    // Scenario 3. Nothing in the catalog fixes this.
    //
    // SINCE D213 THIS BRANCH HAS TWO OUTCOMES, and the difference is `res.canFile`. The note below
    // was correct from 2026-09-02 until that day and must NOT be printed unconditionally now:
    // saying "nothing was filed" one line before offering to file something is the mirror image of
    // the defect it was written to prevent. What both versions share is that neither claims more
    // than happened.
    proposed("Nothing. The request is outside what this assistant can do here, so it was handed on instead.",
      { escalate: true, ...res.escalation });
    checked("Not applicable — nothing was proposed, so there was nothing to check.",
      "not applicable — no capability was proposed");
    done(res.canFile
      ? "Nothing has been changed, and nothing has been sent: the offer is waiting for an answer."
      : "Nothing has been changed, and no ticket was filed — this build has no ITSM integration.",
      { executed: false, sent: false, canFile: res.canFile === true });
    // `declining`, not `escalating` (D232). The avatar is saying it cannot fix this and OFFERING a
    // ticket; nothing has been raised. v7 reserves `escalating` for the confirmation that carries a
    // ticket number - it follows declining, it does not replace it. Held after speaking because
    // the offer is still open.
    setState("declining");
    const spoken = await say(res.reply, "declining");
    if (res.canFile) {
      // The affordance goes INSIDE the message that made the offer, which is the design's point
      // and D216's: the answer belongs to that sentence, not to the composer.
      attachOffer(spoken);
    } else {
      // The original disclaimer, unchanged in substance, for the configuration it was written for.
      // The avatar saying "I would hand this to facilities" can be heard as "a ticket has been
      // raised". Observed on the dev box 2026-09-02.
      note("Nothing was filed — there is no service desk connected to this build.");
    }
    return;
  }

  if (res.ticketIntake) {
    // A question in the ticket interview, or the user declining the offer (D216). No proposal, no
    // validation, and nothing has left the machine.
    proposed(res.ticketIntake.stage === "cancelled"
      ? "Nothing. The offer was declined."
      : "Nothing. This turn is collecting a detail the ticket needs.",
      {
        ticketIntake: res.ticketIntake.stage,
        note: res.ticketIntake.stage === "cancelled"
          ? "the user declined. Nothing was filed and nothing was sent."
          : `collecting "${res.ticketIntake.field}" for the ticket. Asked because it is not already known (D216).`,
      });
    checked("Not applicable — nothing was proposed.", "not applicable");
    done("Nothing has been changed, and NOTHING HAS BEEN SENT. The draft is not built until every required detail is known.",
      { executed: false, sent: false });
    setState("thinking");
    await say(res.reply, "idle");
    setState("idle");
    return;
  }

  if (res.ticketDraft) {
    // THE ONE PLACE USER DATA CAN LEAVE THIS ENDPOINT, and it is gated on a click on a card that
    // shows every field being sent (D213, D217).
    proposed("A ticket, drafted from what you told me and what I checked. Not sent.",
      { ticketDraft: res.ticketDraft, note: "NOT YET SENT. This is what the card is showing the user." });
    checked("Not applicable — a ticket is not a machine change, so the broker never sees it.", "not applicable");
    done("Waiting on your review.", { executed: false, sent: false });
    setState("thinking");
    await say(res.reply, "idle");

    const approved = await reviewTicket(res.ticketDraft);
    if (!approved) {
      done("You cancelled. NOTHING WAS SENT and nothing was filed.", { executed: false, sent: false, cancelled: true });
      note("Cancelled — nothing left this machine.");
      setState("idle");
      return;
    }

    setState("thinking");
    const filed = await window.matic.fileTicket(approved);
    if (filed.ok) {
      done(`Filed. Reference ${filed.reference}.`,
        { reference: filed.reference, ticketId: filed.ticketId, notified: filed.notified, notifiedWhy: filed.notifiedWhy });
      // THIS is `escalating` (D232): a ticket exists and has a number. The state is held after the
      // reply so the confirmation stays on the face while the user reads the reference.
      setState("escalating");
      await say(`That's filed. Your reference is ${filed.reference} — quote that if you follow it up.`, "escalating");
      // `notified` IS THE HUB'S OWN FIELD AND IT IS REPEATED, NOT INTERPRETED. The hub stores
      // tickets and emails nobody (D86). A user who hears "filed" and assumes someone was paged
      // is the failure this line exists to prevent.
      //
      // IT SAYS THE REFERENCE AND NOTHING THE CARD ALREADY SAID (D245). This line used to restate
      // both halves of the card's caveat — stored for IT to pick up, no email sent — three lines
      // under the card that had just said them, in different words. The card does not go away when
      // it is answered, so the two ended up adjacent, and one fact in two wordings reads as anxious
      // and undercuts the reference it arrives with. The card's wording is the one that survives,
      // because the card is the one shown BEFORE the user agrees, which is where honesty about
      // what sending achieves has to be. The transcript still carries the fact: the card is IN the
      // transcript. Deleting it from BOTH would re-open D86/D213 and is not what this is.
      if (!filed.notified) note(`Stored as ${filed.reference}. The card above says what that does and does not do.`);
      renderTickets(await window.matic.ticketsFiled());
    } else {
      // TWO STRINGS, TWO AUDIENCES (D246). `filed.error` is the assistant's sentence and comes from
      // `persona.filing`; `filed.detail` is the transport diagnostic - the URL, the status, the
      // exception - and it goes HERE and to the developer log, never through `say()`. One field
      // used to do both, so the avatar read a URL and a Node error message aloud.
      done("The ticket could not be sent.", { error: filed.error, detail: filed.detail, filed: filed.filed });
      devlog(`[ticket] filing failed: ${filed.detail ?? "(no detail reported)"}`);
      // A ticket that could not be sent is a fault on OUR side - the service desk, the network -
      // not something the assistant tried and could not help with, so `error`, not `apologising`.
      setState("error");
      await say(filed.error, "error");
      // `filed: null` means a TIMEOUT — we genuinely do not know. Saying "nothing was filed" there
      // would be a confident guess, and the wrong one leaves a user opening a second ticket.
      //
      // THE SPOKEN LINE AND THIS NOTE DIVIDE THE TWO HALVES AND DO NOT OVERLAP (D245). The spoken
      // line is what the assistant could or could not do; this is what it means for the ticket,
      // which is the D86/D213 class of fact and the one that has to survive. They said the timeout
      // fact twice in two wordings until 2026-09-10 - the same defect the review card had.
      note(filed.filed === null
        ? "The service desk did not answer in time, so whether the ticket was stored is unknown. Quote nothing and tell me if you want to try again."
        : "Nothing was filed.", { unknown: filed.filed === null });
    }
    return;
  }

  if (res.ticketStatus) {
    // D235. "Where's my ticket?" answered from this machine's egress record. No proposal, no
    // validation, nothing sent, and - shown as well as spoken - NO status lookup: the hub's ticket
    // table is not visible from the endpoint in this build. The band beside it says the same.
    proposed("Nothing. This turn was answered from this machine's own record of what it has sent.", {
      ticketStatus: res.ticketStatus.filed.map((f) => ({ reference: f.reference, filedAt: f.filedAt, notified: f.notified })),
      canFile: res.ticketStatus.canFile,
      canQueryHub: res.ticketStatus.canQueryHub,
      note: "from audit/egress.jsonl - what THIS machine filed and got a reference for. Current status is NOT known: a hub-side lookup is not built (D54, D68/D69).",
    });
    checked("Not applicable — nothing was proposed.", "not applicable");
    done("Nothing has been changed, and nothing was sent. This answer came from a local record.", { executed: false, sent: false });
    renderTickets(res.ticketStatus);
    setState("thinking");
    await say(res.reply, "idle");
    setState("idle");
    return;
  }

  if (res.social) {
    // D165 / D198. A greeting, a "what can you do", a thanks, a goodbye, or something plainly
    // off-topic. Answered from a client-shipped template with NO provider call and NO PROPOSAL.
    //
    // Branches before everything else for the reason D198 gives: the whole point is that this turn
    // does not reach the code that can offer a consent card. On 2026-09-03 "Hello how are you?"
    // produced a renew_dhcp card, and every gate behaved correctly — which is what made it a
    // safety issue rather than a cosmetic one.
    proposed("Nothing. This turn was a question, answered from what the assistant already knows.", {
      socialTemplate: res.social.subkind,
      note: "answered from a client-shipped template (D165). No model was called, and no capability was proposed.",
    });
    checked("Not applicable — nothing was proposed, so there was nothing to check.", "not applicable");
    done("Nothing has been changed. This turn never reached the consent path (D198).", { executed: false, changes: [] });
    setState("thinking");
    await say(res.reply, "idle");
    setState("idle");
    return;
  }

  if (res.answer) {
    // A QUESTION was answered (or declined) from the knowledge base — D211.
    const { answered, citedArticleIds, retrieval } = res.answer;
    proposed(answered
      ? "Nothing. This turn was answered from your company's written guidance."
      : "Nothing. No company guidance covered it, so it was handed on instead.",
      { answeredFromKnowledgeBase: answered, citedArticleIds, retrieval });
    checked("Not applicable — no capability was proposed. A question changes nothing on this machine.", "not applicable");
    done("Nothing has been changed — this was a question, not an action.", { executed: false, changes: [] });
    setState("thinking");

    if (answered) {
      // THE CITATION IS ATTRIBUTED CHROME, NOT THE AVATAR'S VOICE (H5). It is shown as a source
      // block under the reply and is deliberately NOT spoken and NOT concatenated into it:
      // "according to keyboard-shortcuts-windows, press Win+Shift+S" said aloud is the avatar
      // claiming provenance, where a separate block is the UI attributing it.
      await say(res.reply, "idle");
      if (citedArticleIds.length) {
        const cite = el("div", "citation");
        cite.append(el("span", "from", "From your company's IT guidance"));
        const src = el("div", "src");
        src.append(el("span", "", citedArticleIds.join(", ")));
        cite.append(src);
        turn().append(cite);
        scrollDown();
      }
      setState("idle");
      return;
    }

    // A DECLINE IS A CORRECT ANSWER, not a failure, and the transcript must not dress it as one
    // (D205, B7a §2). THE FACE SAYS SO TOO (D232): `declining` is round eyes, narrow mouth, a `?`
    // badge, no bow — composed, never sorry. Held after the reply because the offer is open.
    setState("declining");
    await say(res.reply, "declining");
    note("No company guidance covers this — nothing was filed.");
    return;
  }

  if (!res.ok) {
    if (res.guidance) {
      // Order matters. These checks first rendered BEFORE the headline and in the grey system
      // style, and a user read straight past them: "I didn't realize those instructions were
      // for me." So: the assistant speaks first and gives the checks context, THEN they appear
      // as a card that looks like something to act on, THEN it says what to do next.
      proposed("Nothing I can do from here — this one needs a pair of hands at the machine.",
        { noCapabilityApplies: true, ...res.guidance });
      checked("Not applicable — nothing was proposed.", "not applicable");
      done("Nothing has been changed on this machine this turn.", { executed: false, changes: [] });
      setState("apologising");
      await say(`${res.guidance.headline} ${res.guidance.cause}`, "idle");
      todoCard(res.guidance);
      return;
    }
    proposed("No proposal.", res.error ?? "no proposal");
    checked("Not applicable — nothing was proposed.", "not applicable");
    // The last resort: it tried and could not help. That is `apologising`, not `idle` (D232 / v7).
    setState("apologising");
    await say(res.reply ?? "I could not work out a safe next step for that.", "idle");
    return;
  }

  const { proposal, validation, reply: replyText } = res;
  proposed(validation.ok
    ? `${validation.capability.title}.`
    : "The model proposed something the broker would not allow.", proposal);
  // Compact on purpose: the full capability object is long enough to push everything below it
  // out of view, and the interesting part is the verdict.
  checked(validation.ok
    ? "Allowed on this machine, and its preconditions hold."
    : `Refused: ${validation.errors.join(" ")}`,
    validation.ok
      ? { ok: true, capability: validation.capability.id, tier: validation.capability.tier, rollback: validation.capability.rollback }
      : { ok: false, errors: validation.errors });
  // "tier0-state" deliberately does NOT get the "no cloud call made" line: a cloud call WAS
  // attempted on that path and failed. Drawing that distinction is the honest thing to show - and
  // since 2026-09-10 it is shown HERE, in the inspector, rather than as a line at the user, who
  // has no use for the word "tier0" and was reading it on every single turn.
  const SOURCE_NOTE = {
    tier0: "  (no cloud call made)",
    "tier0-state": "  (from machine state alone - nothing matched what was typed, and the cloud was unreachable)",
    local: "  (a model running on this machine - the sentence did not leave it)",
    cloud: "  (sent to the Anthropic API)",
    hub: "  (sent to the hub; where it went from there is the hub's claim, not this machine's knowledge)",
  };
  const hubClaim = proposal.source === "hub" ? `; hub claims provider: ${proposal.hubProvider ?? "unstated"}` : "";
  devlog(`[router] source: ${proposal.source}${SOURCE_NOTE[proposal.source] ?? ""}${hubClaim}`);

  if (!validation.ok) {
    // The broker refused the model's proposal. This is the safety invariant working, and it is
    // shown, not hidden (§13) - in plain words here, with the refusal itself in the inspector.
    setState("apologising");
    // THE BROKER'S GATE MESSAGE IS NOT SPOKEN (D247). It names capability ids, adapter GUIDs,
    // Win32 control masks and the Service Control Manager — `validation.errors[0]` used to be the
    // fallback here, so a missing `reply` put a hex mask in the avatar's mouth. It is one line up,
    // in the inspector, where `checked()` already puts it. The fallback is now a sentence.
    await say(replyText || "I can't do that one — it isn't something I'm allowed to do on this machine.", "idle");
    note("I checked that against what I'm allowed to do on this machine, and it isn't allowed. Nothing was changed.");
    return;
  }

  // `||` rather than `??`: a provider that returns an empty `reasoning` gives an empty `reply`, and
  // `??` would have spoken silence. The title is the capability's own name and is fine to say.
  await say(replyText || `I think this is the fix. ${validation.capability.title}.`, "listening");

  // The evidence, at the moment it matters, rather than as a row in a band nobody opens - the
  // design's single largest change to how a proposal reads.
  //
  // IT IS A RESTATEMENT OF A PROBE VALUE AND NOTHING ELSE. Not the model's reasoning (that is
  // labelled as the model's, inside the card), not a claim that the fix will work, and not
  // assembled when the probe has nothing to say about the service in question - in which case
  // there is no line, rather than a line hedged into meaninglessness.
  const evidence = evidenceFor(proposal, res.facts);
  if (evidence) why("Why", evidence);

  // Consent step 1 (D130): the BROKER renders the card and keeps the proposal. From here on the
  // renderer holds a nonce and the text to paint, and never sends the proposal again.
  const prepared = await window.matic.prepareConsent(proposal, navigator.language);
  if (!prepared.ok) {
    consented("The broker refused to render a consent card, so you were never asked.", { error: prepared.error });
    devlog(`[broker] prepareConsent refused: ${prepared.error}`);
    setState("apologising");
    // `prepared.error` is the broker's thrown message — "refusing to prepare consent for an invalid
    // proposal: capability "x" is not in the catalog". It was interpolated straight into speech,
    // with no fallback guarding it (D247). It is in the inspector and the developer log now.
    await say("I can't ask you to approve that one, so I'm not going to do it.", "idle");
    note("Nothing was changed.");
    return;
  }
  const request = prepared.request;

  const approved = await askConsent(request, proposal);
  if (!approved) {
    consented("You did not approve it. The nonce was never presented back and nothing ran.",
      { nonce: request.nonce, approved: false });
    setState("idle");
    await say("Understood, I won't change anything.", "idle");
    return;
  }

  // Consent step 2: the nonce and nothing else. The broker runs what IT rendered.
  setState("accept");
  const exec = await window.matic.execute(request.nonce);
  consented("You approved it, and the broker ran what it had rendered.", {
    nonce: request.nonce,
    singleUse: true,
    brokerExecutedWhatItRendered: true,
    auditId: exec.auditId,
  });
  done(exec.ok ? "Done on this machine." : "It ran and did not help.", exec);

  if (exec.ok) {
    setState("success");
    await say(exec.message, "idle");
  } else if (exec.needsBroker) {
    // A deployment fault - the unprivileged half was asked to do privileged work - so `error`
    // ("a technical fault on our side"), not `escalating`: no ticket was raised (D232).
    setState("error");
    done("It could not run: this half of the app is not allowed to.", exec);
    await say(exec.message, "idle");
    note("That needs the privileged half of this application, which isn't running. Nothing was changed.");
  } else {
    // A fix that ran and did not help is `apologising`, not `error` - v7's placement rule, verbatim:
    // "Do not put error on a failed fix — that is apologising." The assistant tried and could not
    // help; that is relational, not technical (D232).
    setState("apologising");
    await say(exec.message, "idle");
  }
}

/**
 * Checks the USER has to carry out. Rendered as a card rather than as running text because a user
 * missed them completely when they were grey system messages: they read as logging, not as
 * instructions.
 */
function todoCard({ checks, nextStep }) {
  const box = framed(el("div", "bp todo-card"));
  const head = el("div", "consent-head");
  head.append(el("b", "", "Over to you"), el("span", "", "Things I can't check from here"));
  const list = el("ol");
  for (const c of checks) {
    const li = el("li");
    li.append(el("b", "", c.label), el("span", "", c.detail));
    list.append(li);
  }
  box.append(head, list, el("div", "next", nextStep));
  turn().append(box);
  scrollDown();
}

// ═══ hub connectivity (D49/D51, D233) ═════════════════════════════════════════════════════════
//
// THE RAIL IS THE PERSISTENT SURFACE and the band under the utility bar is the standing sentence;
// the transcript carries each TRANSITION, because D51 says a mid-session capability loss is stated
// to the user rather than silently degraded. The face carries it too while it is idle: `error` is
// v7's "I've lost my connection to the service desk", the one state that goes static. It is not
// forced over a turn in progress; the next turn's own states take the face back.
//
// THE WORDS HERE AND THE WORDS agent.js SAYS IN THE SAME CONDITION MUST AGREE. 700d920 fixed a
// reply claiming the hub was unreachable while the pill beside it said reachable; the same defect
// is available to any panel that describes a state in its own vocabulary.
let lastHubState = null;
function applyHubStatus(s) {
  if (!s) return;
  // D49's three states become the design's three, and `checking` shows as the standalone reading
  // until the first probe answers - the quietest of the three, and never a warning.
  root.dataset.hub = s.state === "reachable" ? "ok" : s.state === "unreachable" ? "unreachable" : "none";

  const since = s.lastOkAt ? Math.round((Date.now() - new Date(s.lastOkAt).getTime()) / 60000) : null;
  const checkedWords = since === null ? "" : since <= 1 ? "Checked a moment ago." : since < 60 ? `Last reached ${since} minutes ago.` : "Last reached over an hour ago.";
  for (const span of document.querySelectorAll(".hub-checked")) span.textContent = checkedWords;

  devlog(`[hub] ${s.state} · ${s.basis}${s.authenticated ? "" : " (identified by shape, NOT device-authenticated - D50 needs D61)"}${s.lastError ? ` · last error: ${s.lastError}` : ""}`);

  if (lastHubState !== null && s.state !== lastHubState) {
    if (s.state === "unreachable") {
      // CHECKED AGAINST agent.js, 2026-09-10 (register §5.29a). The reply it gives in this condition is
      // `persona.fallback.hubUnreachable`, and the standing band under the utility bar is the
      // delivery's sentence; this line used to disagree with both in two ways. It named only the
      // service desk, when what is lost is the company's guidance AND the service desk — the same
      // two things the other two surfaces name. And "questions and tickets will wait until it's
      // back" implies a queue: nothing is held. `HubClient.fileTicket` returns "nothing was sent"
      // immediately, and a question gets the fallback reply, not a place in a line. A user who
      // reads "will wait" and stops re-asking has been told something untrue by inference.
      note(`I've lost my connection to your company's guidance and the service desk. I can still check and fix things on this machine itself; I can't look anything up or file a ticket until it's back.`, { label: "Just now" });
      if (avatar.state === "idle") setState("error");
    } else if (s.state === "reachable" && lastHubState === "unreachable") {
      note("The service desk is reachable again.", { label: "Just now" });
      if (avatar.state === "error") setState("idle");
    }
  }
  lastHubState = s.state;
}
window.matic.onHubLink(applyHubStatus);

// ═══ input ════════════════════════════════════════════════════════════════════════════════════

let turnInFlight = false;
/** The one way a sentence reaches the agent, whether it was typed, clicked as an opener, or
 *  answered with the offer's own buttons. */
async function submit(text) {
  const sentence = String(text ?? "").trim();
  if (!sentence || turnInFlight) return;
  turnInFlight = true;
  inputEl.value = "";
  sendBtn.disabled = inputEl.disabled = true;
  try {
    await handleTurn(sentence);
  } catch (err) {
    // D249: `err.message` is a JavaScript exception — "TypeError: Cannot read properties of
    // undefined (reading 'ok')" — and it was in the note, at the user. Found by tripping it with a
    // malformed stub while checking the machine-name rule; D247's sweep missed it because this is
    // SHOWN rather than spoken. The stack was already going to the developer log, so nothing here
    // is new information and nothing is lost. **`unknown: true` stays**: a turn that stopped
    // half-way is exactly the case where the user must not assume nothing happened.
    note("Something went wrong inside the panel and this turn stopped. I can't tell you how far it got, so check before you try the same thing again.", { unknown: true });
    devlog(`[panel] ${err.stack ?? err.message}`);
    setState("error");
  } finally {
    setBusy(false);
    turnInFlight = false;
    sendBtn.disabled = inputEl.disabled = false;
    scrollDown();
    inputEl.focus();
  }
}

sendBtn.addEventListener("click", () => submit(inputEl.value));
inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(inputEl.value); });
// The first-run openers are real sentences, not shortcuts into a different code path.
for (const b of document.querySelectorAll(".opener")) {
  b.addEventListener("click", () => submit(b.textContent));
}

window.matic.onLog(devlog);

/** Resolves when main reports the voice model has finished loading (or failed). */
const ttsSettled = new Promise((resolve) => {
  window.matic.onTtsReady(resolve);
  // Fallback in case the event fired before this listener attached.
  const poll = setInterval(async () => {
    const s = await window.matic.ttsStatus();
    if (s.ready || s.error) {
      clearInterval(poll);
      resolve(s);
    }
  }, 500);
  setTimeout(() => {
    clearInterval(poll);
    resolve({ ready: false, error: "voice did not load in time" });
  }, 40000);
});

(async () => {
  applyTheme(root.dataset.theme === "dark" ? "dark" : "light");

  const st = await ttsSettled;
  voiceReady = Boolean(st.ready);
  // The voice pill is gone from the surface (it was ours, not theirs). Whether Piper loaded is
  // still worth knowing, so it is a developer-log line - and a failure still degrades to text with
  // the mouth moving, which the user can see without being told.
  devlog(voiceReady ? `[tts] piper ready, ${st.sampleRate} Hz` : `[tts] text-only: ${st.error ?? "the voice model did not load"}`);

  const facts = await window.matic.diagnose();
  renderMachine(facts);
  devlog(`[panel] ${facts?.computer ?? "this machine"} · ${facts?.user ?? "unknown user"} · adapter ${facts?.adapter ?? "-"} · ip ${facts?.ip ?? "-"} · gateway ${facts?.gateway ?? "-"}`);
  renderTickets(await window.matic.ticketsFiled());
  applyHubStatus(await window.matic.hubStatus());

  // The boot line opens the conversation, so it opens a turn - but the first-run panel stays until
  // the USER says something, which is what `openTurn` would retire. So it is spoken into its own
  // turn wrapper without switching the scene.
  currentTurn = el("div", "transcript-turn");
  transcriptEl.append(currentTurn);
  setState("greeting");
  await say(persona.boot[0], "idle");
  inputEl.focus();
})();
