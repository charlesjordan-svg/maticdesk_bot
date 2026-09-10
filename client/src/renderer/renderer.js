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
const hubPill = document.getElementById("hubPill");
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

/**
 * The avatar's conversational state. The element decides what it can actually show at its size
 * (D232: a parked or undersized state is refused to idle with a console warning) and reports the
 * outcome on `statechange`; the label below the avatar follows THAT event, not this call, so the
 * label is right even when the state was set by something else - the viseme driver sets `speaking`
 * directly, and before this change the label silently stayed on the previous state through every
 * spoken reply.
 */
function setState(s) {
  avatar.state = s;
}
avatar.addEventListener("statechange", (e) => {
  const { requested, state, refused } = e.detail;
  stateLabel.textContent = refused ? `${state} (refused: ${requested})` : state;
});

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
 * THE TICKET REVIEW CARD (D213, 2026-09-04).
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
 *     seen — but letting a user rewrite the case note would turn the ticket into a document with
 *     two authors and no way to tell which sentence came from where. If the case note is wrong,
 *     the description the user can edit is the record that says so.
 *
 * It resolves only on an explicit click. There is no timeout that submits, for the same reason
 * the consent card has none.
 *
 * @param {object} draft
 * @returns {Promise<object|null>} the (possibly edited) draft, or null if the user cancelled
 */
function reviewTicket(draft) {
  const box = document.createElement("div");
  box.className = "msg ticket";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = "Review before sending";
  const lede = document.createElement("div");
  lede.className = "lede";
  lede.textContent = "This is exactly what will be sent. Nothing leaves this machine until you press Send.";
  box.append(title, lede);

  const fields = document.createElement("div");
  fields.className = "fields";

  /** One editable row. Returns a getter, so the submit handler reads the DOM rather than a copy. */
  const editable = (labelText, value, { multiline = false } = {}) => {
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement(multiline ? "textarea" : "input");
    input.value = value ?? "";
    fields.append(label, input);
    return () => input.value;
  };

  /** One read-only row. Rendered in the mono style so "shown, not editable" is legible at a glance. */
  const fixed = (labelText, value) => {
    const label = document.createElement("label");
    label.textContent = labelText;
    const span = document.createElement("div");
    span.className = "fixed";
    span.textContent = value;
    fields.append(label, span);
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

  fixed("Category", draft.category);
  fixed("Goes to", draft.suggestedOwner ? draft.suggestedOwner.replace(/_/g, " ") : "unrouted — IT will decide");
  fixed("Case note", draft.summary);
  if (draft.whatWasChecked) fixed("Already checked", draft.whatWasChecked);

  box.append(fields);

  const caveat = document.createElement("div");
  caveat.className = "caveat";
  // The line that stops the card implying more than filing achieves. This build stores tickets and
  // emails nobody (D86) — and the moment a user reads "sent" they assume somebody was told.
  caveat.textContent = "This is stored on the hub for IT to pick up. No email is sent in this build, so nobody is alerted automatically.";
  box.append(caveat);

  const row = document.createElement("div");
  row.className = "row";
  const send = document.createElement("button");
  send.className = "primary";
  send.textContent = "Send it";
  const cancel = document.createElement("button");
  cancel.className = "danger";
  cancel.textContent = "Cancel";
  row.append(send, cancel);
  box.append(row);

  logEl.append(box);
  box.scrollIntoView({ block: "nearest" });

  return new Promise((resolve) => {
    const done = (result, outcomeText) => {
      row.remove();
      box.classList.add("resolved");
      const outcome = document.createElement("div");
      outcome.className = "outcome";
      outcome.textContent = outcomeText;
      box.append(outcome);
      resolve(result);
    };
    send.onclick = () => done(
      {
        ...draft,
        description: getDescription(),
        reporter: {
          ...r,
          firstName: getFirst(),
          lastName: getLast(),
          location: getLocation(),
          contactId: getContact(),
        },
      },
      "sent by the user",
    );
    cancel.onclick = () => done(null, "cancelled by the user — nothing was sent");
  });
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
    // Scenario 3. Nothing in the catalog fixes this.
    //
    // SINCE D213 THIS BRANCH HAS TWO OUTCOMES, and the difference is `res.canFile`. The disclaimer
    // below was correct from 2026-09-02 until today and must NOT be printed unconditionally now:
    // saying "nothing was filed" one line before offering to file something is the mirror image of
    // the defect it was written to prevent. What both versions share is that neither claims more
    // than happened.
    show(proposalJson, { escalate: true, ...res.escalation });
    show(validationJson, "not applicable — no capability was proposed");
    show(executionJson, res.canFile
      ? "nothing executed — this is an escalation, not a machine change. Nothing has been SENT either: the offer is waiting for an answer."
      : "nothing executed — no ticket was filed. This is the payload that would be sent to the ITSM integration, which is not built.");
    renderFacts(res.facts ?? {});
    bubble("no capability in the catalog covers this — escalating", "sys");
    if (!res.canFile) {
      // The original disclaimer, unchanged, for the configuration it was written for. The avatar
      // saying "I would hand this to facilities" can be heard as "a ticket has been raised", and
      // the next turn overwrites the panel that said otherwise. Observed on the dev box 2026-09-02.
      bubble("nothing was filed — there is no ITSM integration in this build", "sys bad");
    }
    // `declining`, not `escalating` (D232). The avatar is saying it cannot fix this and OFFERING a
    // ticket; nothing has been raised. v7 reserves `escalating` for the confirmation that carries a
    // ticket number - it follows declining, it does not replace it - and its tray read is "none",
    // where an offer waiting for an answer is exactly what "needs you" is for. Held after speaking
    // because the offer is still open.
    setState("declining");
    await say(res.reply, "declining");
    return;
  }

  if (res.ticketIntake) {
    // A question in the ticket interview, or the user declining the offer (D216). No proposal, no
    // validation, and nothing has left the machine — branches before `res.ok` is destructured for
    // the same reason the answer branch does.
    show(proposalJson, {
      ticketIntake: res.ticketIntake.stage,
      note: res.ticketIntake.stage === "cancelled"
        ? "the user declined. Nothing was filed and nothing was sent."
        : `collecting "${res.ticketIntake.field}" for the ticket. Asked because it is not already known (D216).`,
    });
    show(validationJson, "not applicable — nothing was proposed.");
    show(executionJson, "nothing executed, and NOTHING HAS BEEN SENT. The draft is not built until every required detail is known.");
    renderFacts(res.facts ?? {});
    setState("thinking");
    await say(res.reply, "idle");
    setState("idle");
    return;
  }

  if (res.ticketDraft) {
    // THE ONE PLACE USER DATA CAN LEAVE THIS ENDPOINT, and it is gated on a click on a card that
    // shows every field being sent (D213, D217).
    show(proposalJson, { ticketDraft: res.ticketDraft, note: "NOT YET SENT. This is what the card is showing the user." });
    show(validationJson, "not applicable — a ticket is not a machine change, so the broker never sees it.");
    show(executionJson, "awaiting the user's review…");
    renderFacts(res.facts ?? {});
    setState("thinking");
    await say(res.reply, "idle");

    const approved = await reviewTicket(res.ticketDraft);
    if (!approved) {
      show(executionJson, "the user cancelled. NOTHING WAS SENT and nothing was filed.");
      bubble("cancelled — nothing left this machine", "sys");
      setState("idle");
      return;
    }

    setState("thinking");
    const filed = await window.matic.fileTicket(approved);
    if (filed.ok) {
      show(executionJson, { reference: filed.reference, ticketId: filed.ticketId, notified: filed.notified, notifiedWhy: filed.notifiedWhy });
      // THIS is `escalating` (D232): a ticket exists and has a number. The state is held after the
      // reply so the confirmation stays on the face while the user reads the reference.
      setState("escalating");
      await say(`That's filed. Your reference is ${filed.reference} — quote that if you follow it up.`, "escalating");
      // `notified` IS THE HUB'S OWN FIELD AND IT IS REPEATED, NOT INTERPRETED. The hub stores
      // tickets and emails nobody (D86). A user who hears "filed" and assumes someone was paged
      // is the failure this line exists to prevent, and it is a `sys` line rather than the
      // avatar's voice because it is a fact about the system, not something the assistant did.
      if (!filed.notified) bubble(`${filed.reference} is stored for IT to pick up. No email was sent — this build has no outbound notification.`, "sys");
    } else {
      show(executionJson, { error: filed.error, filed: filed.filed });
      // A ticket that could not be sent is a fault on OUR side - the hub, the network - not
      // something the assistant tried and could not help with, so `error`, not `apologising`.
      // `filed: null` means a TIMEOUT — we genuinely do not know. Saying "nothing was filed" there
      // would be a confident guess, and the wrong one leaves a user opening a second ticket.
      setState("error");
      await say(filed.error, "error");
      bubble(filed.filed === null
        ? "the hub did not answer in time — whether the ticket was stored is UNKNOWN"
        : "nothing was filed", "sys bad");
    }
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
    show(proposalJson, {
      socialTemplate: res.social.subkind,
      note: "answered from a client-shipped template (D165). No model was called, and no capability was proposed.",
    });
    show(validationJson, "not applicable — nothing was proposed, so there was nothing to validate.");
    show(executionJson, "nothing executed. This turn never reached the consent path (D198).");
    renderFacts(res.facts ?? {});
    setState("thinking");
    await say(res.reply, "idle");
    setState("idle");
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
      //
      // THE FACE SAYS SO TOO (D232, the point of the avatar pass). Until 2026-09-10 this branch
      // spoke in `speaking` and ended in `idle` with a RED system line - a correct behaviour dressed
      // as a failure at the moment the user's trust is most in play (v7: declining is "the most-seen
      // state and the one to get most right"). `declining` is round eyes, narrow mouth, a `?`
      // badge, no bow: composed, never sorry. Held after the reply because the offer is open, and
      // the system line is plain `sys`, not `sys bad`.
      setState("declining");
      await say(res.reply, "declining");
      bubble("no company guidance covers this — nothing was filed", "sys");
      return;
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
    // A deployment fault - the unprivileged half was asked to do privileged work - so `error`
    // ("a technical fault on our side"), not `escalating`: no ticket was raised (D232).
    setState("error");
    bubble("ACCESS_DENIED — the agent half cannot do this; it needs the privileged broker.", "sys bad");
    await say(exec.message, "idle");
  } else {
    // A fix that ran and did not help is `apologising`, not `error` - v7's placement rule, verbatim:
    // "Do not put error on a failed fix — that is apologising." The assistant tried and could not
    // help; that is relational, not technical (D232).
    setState("apologising");
    await say(exec.message, "idle");
  }
}

// ---- hub connectivity (D49/D51, D233) ----
//
// The pill is the persistent surface (D120's Status destination, in miniature). The transcript
// carries each TRANSITION, because D51 says a mid-session capability loss is stated to the user
// rather than silently degraded - and the face carries it too while it is idle: `error` is v7's
// "I've lost my connection to the service desk", the one state that goes static. It is not forced
// over a turn in progress; the next turn's own states take the face back, and the pill keeps the
// fact.
let lastHubState = null;
function applyHubStatus(s) {
  if (!s) return;
  const when = (t) => (t ? new Date(t).toLocaleTimeString() : "never");
  const text = {
    standalone: "hub: standalone (no hub configured)",
    checking: "hub: checking…",
    reachable: `hub: reachable · last ok ${when(s.lastOkAt)}`,
    unreachable: `hub: UNREACHABLE (${s.consecutiveFailures} failures) · last ok ${when(s.lastOkAt)}`,
  }[s.state] ?? `hub: ${s.state}`;
  hubPill.textContent = text;
  hubPill.className = `pill ${s.state === "reachable" ? "on" : s.state === "unreachable" ? "bad" : "off"}`;
  hubPill.title = `${s.basis}${s.authenticated ? "" : " - identified by shape, NOT device-authenticated (D50 needs D61)"}${s.lastError ? `\nlast error: ${s.lastError}` : ""}`;

  if (lastHubState !== null && s.state !== lastHubState) {
    if (s.state === "unreachable") {
      bubble(`I've lost my connection to the service desk (${s.lastError ?? "no answer"}). I can still fix what this machine can fix on its own; questions and tickets will wait until it is back.`, "sys bad");
      if (avatar.state === "idle") setState("error");
    } else if (s.state === "reachable" && lastHubState === "unreachable") {
      bubble("the service desk is reachable again", "sys good");
      if (avatar.state === "error") setState("idle");
    }
  }
  lastHubState = s.state;
}
window.matic.onHubLink(applyHubStatus);

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
  applyHubStatus(await window.matic.hubStatus());

  setState("greeting");
  await say("Matic Desk here. Tell me what's not working and I'll take a look at this machine.", "idle");
  inputEl.focus();
})();
