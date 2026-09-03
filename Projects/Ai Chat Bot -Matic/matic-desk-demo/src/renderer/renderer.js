// @ts-check
/**
 * Renderer. Owns presentation and the consent gesture ONLY.
 *
 * It holds no capability implementation, no Win32 handle, and no policy logic - every
 * privileged step is an IPC call into the Broker (handover §2). If broker logic starts
 * appearing in this file, the Phase 1 refactor becomes a rewrite.
 */
import { TTSVisemeDriver } from "./vendor/tts-viseme-driver.js";

const avatar = document.getElementById("avatar");
const stateLabel = document.getElementById("state");
const voicePill = document.getElementById("voicePill");
const factsEl = document.getElementById("facts");
const logEl = document.getElementById("log");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const devlogEl = document.getElementById("devlog");

const proposalJson = document.getElementById("proposalJson");
const validationJson = document.getElementById("validationJson");
const executionJson = document.getElementById("executionJson");
const consentJson = document.getElementById("consentJson");

const audioEl = new Audio();
const driver = new TTSVisemeDriver(avatar, audioEl);
let voiceReady = false;

function setState(s) {
  avatar.state = s;
  stateLabel.textContent = s;
}

/**
 * Checks the USER has to carry out. Rendered as a card rather than chat bubbles because a user
 * missed them completely when they were grey system messages: they read as logging, not as
 * instructions. Same shape as the consent card on purpose - that is the established language
 * for "this one needs you".
 */
function todoCard({ checks, nextStep }) {
  const box = document.createElement("div");
  box.className = "msg todo";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = "Over to you — things I cannot check from here";

  const list = document.createElement("ol");
  for (const c of checks) {
    const li = document.createElement("li");
    const label = document.createElement("b");
    label.textContent = c.label;
    const detail = document.createElement("span");
    detail.textContent = c.detail;
    li.append(label, detail);
    list.append(li);
  }

  const next = document.createElement("div");
  next.className = "next";
  next.textContent = nextStep;

  box.append(title, list, next);
  logEl.append(box);
  logEl.scrollTop = logEl.scrollHeight;
}

function bubble(text, cls = "bot") {
  const d = document.createElement("div");
  d.className = `msg ${cls}`;
  d.textContent = text;
  logEl.append(d);
  logEl.scrollTop = logEl.scrollHeight;
  return d;
}

function devlog(line) {
  devlogEl.textContent += line + "\n";
  devlogEl.scrollTop = devlogEl.scrollHeight;
}

/** Speaks with real Piper audio + viseme sync. Degrades to mouth-only, never to silence-with-no-signal. */
async function say(text, endState = "idle") {
  bubble(text, "bot");
  if (!voiceReady) {
    // Cut-order item 3: text only, keep the mouth moving. The 'speaking' state's own
    // mouth animation runs without a phoneme timeline.
    setState("speaking");
    await new Promise((r) => setTimeout(r, Math.min(600 + text.length * 45, 6000)));
    setState(endState);
    return;
  }
  const r = await window.matic.speak(text);
  if (!r.ok) {
    devlog(`[tts] ${r.error}`);
    setState("speaking");
    await new Promise((res) => setTimeout(res, Math.min(600 + text.length * 45, 6000)));
    setState(endState);
    return;
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
}

function renderFacts(facts) {
  factsEl.innerHTML = "";
  for (const [k, v] of Object.entries(facts ?? {})) {
    const row = document.createElement("div");
    const kk = document.createElement("span");
    kk.textContent = k;
    const vv = document.createElement("b");
    vv.textContent = String(v);
    row.append(kk, vv);
    factsEl.append(row);
  }
}

/**
 * Inline consent. Rendered into the conversation so it is always the thing in front of the
 * user, and it scrolls itself into view. Resolves true only on an explicit Approve click -
 * there is no default and no timeout that proceeds.
 */
function askConsent(capability, proposal) {
  const box = document.createElement("div");
  box.className = "msg consent";

  const title = document.createElement("div");
  title.className = "title";
  // "tier R1" means nothing to the person being asked to approve. Say what the risk IS.
  const tierInfo = capability.tierInfo;
  title.textContent = tierInfo
    ? `Permission needed — ${tierInfo.label}`
    : `Permission needed — tier ${capability.tier}`;

  const what = document.createElement("div");
  what.className = "what";
  // The catalog's `description` is written for an engineer - "Idempotent - no rollback needed".
  // `plain.what` is the same fact for the person whose machine it is.
  what.textContent = capability.plain?.what ?? capability.description;

  const detail = document.createElement("div");
  detail.className = "outcome";
  detail.textContent = `${capability.id}(${Object.entries(proposal.parameters ?? {}).map(([k, v]) => `${k}=${v}`).join(", ")})`;

  box.append(title, what, detail);

  if (capability.tier === "R2") {
    const warn = document.createElement("div");
    warn.className = "warn-box";
    warn.textContent = `This is disruptive. If it goes wrong, the rollback is: ${capability.rollback ?? "none"}.`;
    box.append(warn);
  }

  // A user approved an action and then said: "I feel like I approved that with not enough
  // information." Everything needed to answer "what is this and why?" was known at that moment,
  // and none of it was on screen. It is one click away now, and collapsed by default so the card
  // does not become another wall of text.
  if (capability.plain) {
    const explainBtn = document.createElement("button");
    explainBtn.className = "explain-btn";
    explainBtn.textContent = "What is this, and why?";

    const explain = document.createElement("div");
    explain.className = "explain";
    explain.hidden = true;

    // `proposal.reasoning` is the only part that is specific to THIS problem, so it goes first.
    const sections = [
      ["Why this, here", proposal.reasoning, false],
      ["What you will notice", capability.plain.notice, capability.tier === "R2"],
      ["Can it be undone", capability.plain.undo, false],
      ["Why it usually helps", capability.plain.why, false],
    ];
    if (tierInfo) sections.push(["Risk level", `${tierInfo.label}. ${tierInfo.summary}`, capability.tier === "R2"]);

    for (const [heading, body, emphasise] of sections) {
      if (!body) continue;
      const wrap = document.createElement("div");
      if (emphasise) wrap.className = "danger-note";
      const h = document.createElement("h4");
      h.textContent = heading;
      const para = document.createElement("p");
      para.textContent = body;
      wrap.append(h, para);
      explain.append(wrap);
    }

    explainBtn.addEventListener("click", () => {
      explain.hidden = !explain.hidden;
      explainBtn.textContent = explain.hidden ? "What is this, and why?" : "Hide the details";
      if (!explain.hidden) explain.scrollIntoView({ block: "nearest" });
    });

    box.append(explainBtn, explain);
  }

  const row = document.createElement("div");
  row.className = "row";
  const approve = document.createElement("button");
  approve.className = "primary";
  approve.textContent = "Approve";
  const deny = document.createElement("button");
  deny.className = "danger";
  deny.textContent = "Deny";
  row.append(approve, deny);
  box.append(row);

  logEl.append(box);
  box.scrollIntoView({ block: "nearest" });
  consentJson.textContent = "awaiting the user's decision…";

  return new Promise((resolve) => {
    const done = (approved) => {
      row.remove();
      box.classList.add("resolved");
      const outcome = document.createElement("div");
      outcome.className = "outcome";
      outcome.textContent = approved ? "approved by the user" : "denied by the user";
      box.append(outcome);
      resolve(approved);
    };
    approve.onclick = () => done(true);
    deny.onclick = () => done(false);
  });
}

function show(el, obj) {
  el.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

async function handleTurn(text) {
  bubble(text, "user");
  proposalJson.textContent = "…";
  validationJson.textContent = "—";
  executionJson.textContent = "—";

  setState("thinking");
  const res = await window.matic.propose(text);

  if (res.escalation) {
    // Scenario 3. Nothing in the catalog fixes this. We show the payload that WOULD be sent
    // and say plainly that nothing has been filed - the demo must not imply an integration
    // that does not exist (§13).
    show(proposalJson, { escalate: true, ...res.escalation });
    show(validationJson, "not applicable — no capability was proposed");
    show(executionJson, "nothing executed — no ticket was filed. This is the payload that would be sent to the ITSM integration, which is not built.");
    renderFacts(res.facts ?? {});
    bubble("no capability in the catalog covers this — escalating", "sys");
    // The disclaimer belongs in the TRANSCRIPT, not only in the inspector panel. The avatar says
    // "I would hand this to facilities", which an audience can hear as "a ticket has been
    // raised" - and the next turn overwrites the panel that said otherwise. Observed on the dev
    // box 2026-09-02. The demo must not imply an integration that does not exist.
    bubble("nothing was filed — there is no ITSM integration in this build", "sys bad");
    setState("escalating");
    await say(res.reply, "idle");
    return;
  }

  if (!res.ok) {
    show(proposalJson, res.error ?? "no proposal");
    if (res.guidance) {
      // Order matters. These checks first rendered BEFORE the headline and in the grey system
      // style, and a user read straight past them: "I didn't realize those instructions were
      // for me." So: the assistant speaks first and gives the checks context, THEN they appear
      // as a card that looks like something to act on, THEN it says what to do next.
      show(proposalJson, { noCapabilityApplies: true, ...res.guidance });
      renderFacts(res.facts ?? {});
      setState("apologising");
      await say(`${res.guidance.headline} ${res.guidance.cause}`, "idle");
      todoCard(res.guidance);
      return;
    }
    setState("idle");
    await say(res.reply ?? "I could not work out a safe next step for that.", "idle");
    return;
  }

  const { proposal, validation, facts, reply } = res;
  renderFacts(facts);
  show(proposalJson, proposal);
  // Compact on purpose: the full capability object is long enough to push everything below it
  // out of view, and the interesting part is the verdict.
  show(validationJson, validation.ok
    ? { ok: true, capability: validation.capability.id, tier: validation.capability.tier, rollback: validation.capability.rollback }
    : { ok: false, errors: validation.errors });
  // "tier0-state" deliberately does NOT get the "no cloud call made" line: a cloud call WAS
  // attempted on that path and failed. Drawing that distinction is the honest thing to show.
  const SOURCE_NOTE = {
    tier0: "  (no cloud call made)",
    "tier0-state": "  (from machine state alone - nothing matched what was typed, and the cloud was unreachable)",
    local: "  (a model running on this machine - the sentence did not leave it)",
    cloud: "  (sent to the Anthropic API)",
  };
  bubble(`source: ${proposal.source}${SOURCE_NOTE[proposal.source] ?? ""}`, "sys");

  if (!validation.ok) {
    // The broker refused the model's proposal. This is the safety invariant working, and it
    // is shown, not hidden (§13).
    bubble(`broker refused: ${validation.errors.join(" ")}`, "sys bad");
    setState("apologising");
    await say(reply ?? `I can't do that one. ${validation.errors[0]}`, "idle");
    return;
  }

  await say(reply ?? `I think this is the fix. ${validation.capability.title}.`, "listening");

  const approved = await askConsent(validation.capability, proposal);
  if (!approved) {
    consentJson.textContent = "denied — no token was minted, nothing was executed";
    bubble("consent denied — nothing was executed", "sys");
    setState("idle");
    await say("Understood, I won't change anything.", "idle");
    return;
  }

  setState("accept");
  const exec = await window.matic.consentAndExecute(proposal);
  show(consentJson, {
    consentTokenId: exec.consentTokenId ?? null,
    singleUse: true,
    boundToProposal: true,
    auditId: exec.auditId,
  });
  show(executionJson, exec);

  if (exec.ok) {
    setState("success");
    await say(exec.message, "idle");
  } else if (exec.needsBroker) {
    setState("escalating");
    bubble("ACCESS_DENIED — the agent half cannot do this; it needs the privileged broker.", "sys bad");
    await say(exec.message, "idle");
  } else {
    setState("error");
    await say(exec.message, "idle");
  }
}

sendBtn.onclick = async () => {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = "";
  sendBtn.disabled = inputEl.disabled = true;
  try {
    await handleTurn(text);
  } catch (err) {
    bubble(`renderer error: ${err.message}`, "sys bad");
    setState("error");
  } finally {
    sendBtn.disabled = inputEl.disabled = false;
    inputEl.focus();
  }
};
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendBtn.click();
});

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
  voicePill.textContent = "voice: loading model…";
  const st = await ttsSettled;
  voiceReady = Boolean(st.ready);
  voicePill.textContent = voiceReady ? `voice: piper ${st.sampleRate} Hz` : "voice: text-only";
  voicePill.className = `pill ${voiceReady ? "on" : "off"}`;
  if (!voiceReady && st.error) devlog(`[tts] ${st.error}`);

  const facts = await window.matic.diagnose();
  renderFacts(facts?.summary ?? {});

  setState("greeting");
  await say("Matic Desk here. Tell me what's not working and I'll take a look at this machine.", "idle");
  inputEl.focus();
})();
