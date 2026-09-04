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
 *
 * Since D130 (2026-09-03) THE BROKER RENDERS AND THIS FUNCTION DISPLAYS. Every string on the card
 * comes from `request.rendered`, built by the privileged half from the signed catalog and kept by
 * it for the audit record. Nothing here reads the capability or the catalog: if this code could
 * construct consent text, someone would (design rule 2). The one exception is `proposal.reasoning`,
 * which is the model's own sentence and is labelled as such.
 */
function askConsent(request, proposal) {
  const r = request.rendered;
  const box = document.createElement("div");
  box.className = "msg consent";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = r.title;

  const what = document.createElement("div");
  what.className = "what";
  what.textContent = r.what;

  const detail = document.createElement("div");
  detail.className = "outcome";
  detail.textContent = r.detail;

  box.append(title, what, detail);

  if (r.rollbackNote) {
    const note = document.createElement("div");
    // The broker phrases R2's note as a warning; R1's is a quiet reassurance. Same field, styled by tier.
    note.className = request.tier === "R2" ? "warn-box" : "outcome";
    note.textContent = r.rollbackNote;
    box.append(note);
  }

  // A user approved an action and then said: "I feel like I approved that with not enough
  // information." Everything needed to answer "what is this and why?" was known at that moment,
  // and none of it was on screen. It is one click away now, and collapsed by default so the card
  // does not become another wall of text.
  if (r.notice || r.undo || r.why || r.risk) {
    const explainBtn = document.createElement("button");
    explainBtn.className = "explain-btn";
    explainBtn.textContent = "What is this, and why?";

    const explain = document.createElement("div");
    explain.className = "explain";
    explain.hidden = true;

    // `proposal.reasoning` is the only part that is specific to THIS problem, so it goes first.
    const disruptive = request.tier === "R2";
    const sections = [
      ["Why this, here", proposal.reasoning, false],
      ["What you will notice", r.notice, disruptive],
      ["Can it be undone", r.undo, false],
      ["Why it usually helps", r.why, false],
      ["Risk level", r.risk, disruptive],
    ];

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

  if (res.answer) {
    // A QUESTION was answered (or declined) from the knowledge base — D211. Branches BEFORE the
    // `res.ok` destructure below, because an answer has no proposal and no validation: reaching
    // that code would read `validation.ok` off undefined.
    const { answered, citedArticleIds, retrieval } = res.answer;
    show(proposalJson, {
      answeredFromKnowledgeBase: answered,
      // Named `citedArticleIds` here too, rather than flattened into prose, for the reason below.
      citedArticleIds,
      retrieval,
    });
    show(validationJson, "not applicable — no capability was proposed. A question changes nothing on this machine.");
    show(executionJson, "nothing executed — this was a question, not an action.");
    renderFacts(res.facts ?? {});
    setState("thinking");

    if (answered) {
      // THE CITATION IS ATTRIBUTED CHROME, NOT THE AVATAR'S VOICE (H5). It is shown as a source
      // line in the transcript and is deliberately NOT spoken and NOT concatenated into the
      // reply: "according to keyboard-shortcuts-windows, press Win+Shift+S" said aloud is the
      // avatar claiming provenance, where a separate line is the UI attributing it.
      await say(res.reply, "idle");
      if (citedArticleIds.length) bubble(`source: ${citedArticleIds.join(", ")}`, "sys");
    } else {
      // A DECLINE IS A CORRECT ANSWER, not a failure, and the transcript must not dress it as one
      // (D205, B7a §2). The avatar says it does not know and offers a ticket; the system line says
      // plainly that nothing was filed, for the same reason the escalation branch does — the offer
      // can be heard as the act.
      await say(res.reply, "idle");
      bubble("no company guidance covers this — nothing was filed, and there is no ticketing integration in this build", "sys bad");
    }
    setState("idle");
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
    hub: "  (sent to the hub; where it went from there is the hub's claim, not this machine's knowledge)",
  };
  const hubClaim = proposal.source === "hub" ? `; hub claims provider: ${proposal.hubProvider ?? "unstated"}` : "";
  bubble(`source: ${proposal.source}${SOURCE_NOTE[proposal.source] ?? ""}${hubClaim}`, "sys");

  if (!validation.ok) {
    // The broker refused the model's proposal. This is the safety invariant working, and it
    // is shown, not hidden (§13).
    bubble(`broker refused: ${validation.errors.join(" ")}`, "sys bad");
    setState("apologising");
    await say(reply ?? `I can't do that one. ${validation.errors[0]}`, "idle");
    return;
  }

  await say(reply ?? `I think this is the fix. ${validation.capability.title}.`, "listening");

  // Consent step 1 (D130): the BROKER renders the card and keeps the proposal. From here on the
  // renderer holds a nonce and the text to paint, and never sends the proposal again.
  const prepared = await window.matic.prepareConsent(proposal, navigator.language);
  if (!prepared.ok) {
    bubble(`broker refused to render a consent card: ${prepared.error}`, "sys bad");
    setState("apologising");
    await say(`I can't ask you to approve that one. ${prepared.error}`, "idle");
    return;
  }
  const request = prepared.request;
  show(consentJson, {
    nonce: request.nonce,
    renderedBy: "broker",
    locale: request.locale,
    expiresAt: new Date(request.expiresAt).toISOString(),
    awaiting: "the user's decision",
  });

  const approved = await askConsent(request, proposal);
  if (!approved) {
    consentJson.textContent = "denied — the nonce was never presented back; nothing was executed";
    bubble("consent denied — nothing was executed", "sys");
    setState("idle");
    await say("Understood, I won't change anything.", "idle");
    return;
  }

  // Consent step 2: the nonce and nothing else. The broker runs what IT rendered.
  setState("accept");
  const exec = await window.matic.execute(request.nonce);
  show(consentJson, {
    nonce: request.nonce,
    singleUse: true,
    brokerExecutedWhatItRendered: true,
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
