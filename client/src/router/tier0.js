// @ts-check
/**
 * Tier-0 deterministic router (§7).
 *
 * Runs LOCALLY, before any cloud call. If it matches with high confidence the cloud is never
 * contacted at all - which is what makes the no-network scenario work with the cable out, and
 * what keeps the printer scenario alive if the API call fails on stage.
 *
 * It reads live machine state from the unprivileged probe and emits the SAME Proposal shape the
 * cloud path emits. The broker cannot tell the two apart, and validates both identically.
 *
 * @typedef {import("../broker/broker.d.ts").Proposal} Proposal
 */

/** Above this, the cloud is not called. */
export const TIER0_CONFIDENCE_THRESHOLD = 0.8;

// Keywords are matched as substrings, so prefer short stems over exhaustive phrase lists:
// "connect" covers "cannot connect", "can't connect", "connection", "disconnected" and
// "connecting" in one entry. An earlier phrase-based list missed "cannot connect" entirely -
// a completely natural thing for someone to say - and returned no proposal at all.
//
// Order matters: the first symptom whose keyword appears wins, so "I can't connect my printer"
// resolves to printer rather than network.
const SYMPTOMS = [
  {
    id: "printer",
    keywords: ["printer", "print", "printing", "printout", "spooler", "queue"],
  },
  {
    id: "sound",
    keywords: ["sound", "audio", "speaker", "headphone", "headset", "volume", "mute", "hear anything", "can't hear", "cant hear", "cannot hear"],
  },
  {
    id: "network",
    keywords: [
      "internet", "network", "offline", "connect", "wifi", "wi-fi", "ethernet",
      "web page", "webpage", "website", "browser", "dns", "dropped", "no service",
      "online", "lan", "vpn",
    ],
  },
];

function matchSymptom(text) {
  const t = text.toLowerCase();
  for (const s of SYMPTOMS) {
    for (const k of s.keywords) if (t.includes(k)) return s.id;
  }
  return null;
}

/**
 * Words that carry no subject of their own. Used by `stateTopicsFor` below — see the long note
 * there for why this is a whitelist and not a blacklist.
 *
 * Three groups, and the second is the one that does the interesting work:
 *
 *   1. Grammar and filler. In every sentence, says nothing about what is wrong.
 *   2. Subjects that MEAN "this whole machine" or "no subject in particular" — "it", "this thing",
 *      "my laptop", "everything". A complaint about the whole machine is a complaint that machine
 *      state can legitimately speak to. That is the entire licence for the state fallback.
 *   3. Complaint words with no subject attached — "broken", "slow", "useless". On their own they
 *      are non-specific; "my CHAIR is broken" is specific because of the noun, not the adjective.
 */
const GENERIC_TOKENS = new Set([
  // 1. grammar and filler
  "i", "im", "ive", "me", "my", "mine", "we", "our", "us", "you", "your",
  "a", "an", "the", "this", "that", "these", "those", "there", "here",
  "is", "are", "was", "were", "be", "been", "being", "am", "do", "does", "did", "doing",
  "have", "has", "had", "get", "gets", "getting", "got", "go", "goes", "going", "went",
  "and", "or", "but", "so", "to", "of", "on", "in", "at", "for", "with", "from", "about",
  "not", "never", "cant", "cannot", "dont", "doesnt", "isnt", "arent", "wont", "didnt", "wouldnt",
  "again", "still", "keep", "keeps", "keeping", "just", "really", "very", "quite", "bit",
  "all", "any", "now", "today", "morning", "afternoon", "please", "why", "what", "how", "when",
  "seems", "seem", "much", "more", "ever", "anymore", "properly", "right", "much", "lot",
  "work", "works", "working", "worked",
  // 2. subjects that mean "the whole machine" or nothing in particular
  "it", "thing", "things", "stuff", "computer", "machine", "laptop", "pc", "desktop", "system",
  "everything", "anything", "something", "nothing", "no",
  // 3. complaint words that carry no subject
  "broken", "break", "breaks", "breaking", "broke", "useless", "rubbish", "terrible", "awful",
  "bad", "wrong", "slow", "sluggish", "laggy", "lagging", "dead", "stuck", "frozen", "freeze",
  "freezes", "freezing", "hang", "hangs", "hanging", "crash", "crashes", "crashing",
  "weird", "strange", "funny", "problem", "problems", "issue", "issues", "trouble", "fault",
  "faulty", "glitch", "glitching", "annoying", "fine", "ok", "okay", "help", "helping",
]);

/**
 * WHICH STATE BRANCHES THIS SENTENCE ENTITLES US TO ANSWER WITH. Added 2026-09-04 (D219).
 *
 * ==============================================================================================
 * THE DEFECT THIS FIXES
 * ==============================================================================================
 *
 * `routeByState` used to ignore the text entirely — its own doc comment said so — and answer from
 * whatever happened to be wrong on the machine. On a box whose print spooler is stopped, that made
 * *"the screen on my laptop is cracked"* come back as *"the print spooler service is stopped, I
 * can start it again."* Confident, unrelated, and with nothing saying the model was never reached.
 *
 * **The design already knew about this failure mode and had fixed it for exactly one branch.** The
 * `flush_dns` branch is gated on `egressFailed` because an earlier draft fired on `probe.online`
 * alone and answered *"my chair is broken and my monitor is cracked"* with *"I can flush your DNS
 * cache"*. That gate is an EVIDENCE gate: it asks whether an observation supports the proposal.
 *
 * What no gate asked is whether the observation has anything to do with the COMPLAINT. A stopped
 * spooler is a perfectly good observation. It is just not an answer to a cracked screen.
 *
 * ==============================================================================================
 * WHY THE STATE FALLBACK IS STILL RIGHT, AND MUST NOT SIMPLY BE DELETED
 * ==============================================================================================
 *
 * With the cable out there is no cloud to read the sentence, and someone who types "help" or "this
 * thing is useless" must get a proposal rather than silence — the Day-4 exit criterion, and the
 * one scenario that proves the local path. Ignoring the text is the right behaviour **for a
 * sentence that has no subject in it.** It is wrong for a sentence that has one.
 *
 * So the question is not "should we read the text" but "does the text entitle us to ignore it":
 *
 *   - **The sentence names a symptom this catalog knows** (printer / sound / network) — then only
 *     branches about THAT topic may answer. Answering "nothing prints" with "let me reset your
 *     network adapter" is the same non-sequitur wearing different clothes.
 *   - **The sentence names no subject at all** — "help", "nothing works", "my laptop is broken".
 *     Machine state is the best answer available and every branch may speak. Unchanged behaviour.
 *   - **The sentence names something else** — a screen, a chair, a ceiling light, a password.
 *     **Nothing may answer.** The caller falls through to `diagnoseOffline()` guidance and then to
 *     an honest "I cannot help with that from here", which is worth more than a confident answer
 *     to a question nobody asked.
 *
 * ==============================================================================================
 * IT IS A WHITELIST, AND THE DIRECTION OF THE BIAS IS THE DESIGN
 * ==============================================================================================
 *
 * An unrecognised word makes a sentence SPECIFIC, so an unknown subject produces silence from this
 * router rather than a guess. A blacklist ("don't fire when the sentence mentions a chair") would
 * bias the other way and would need every physical object anyone might name.
 *
 * The cost is real and should be stated: a network complaint phrased in words `SYMPTOMS` does not
 * know — *"I can't get to sharepoint"* — now returns null here where it once proposed
 * `renew_dhcp`. **That is not silence.** The caller falls through to `diagnoseOffline(probe)`,
 * which on an offline machine says what is wrong and what to check. Losing a proposal and keeping
 * honest guidance is the trade this project has taken every other time it has come up (D205's
 * decline, "say so; do not reach for a lever" below, "a confident wrong fix is not useful").
 *
 * @param {string} text
 * @returns {Set<string> | "any" | null} the topics allowed to answer, "any", or null for none
 */
export function stateTopicsFor(text) {
  const symptom = matchSymptom(text);
  if (symptom) return new Set([symptom]);

  const tokens = String(text ?? "").toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
  // No words at all is not a subject either, so machine state may speak.
  if (tokens.every((t) => GENERIC_TOKENS.has(t))) return "any";
  return null;
}

/**
 * @param {string} text  what the user typed
 * @param {ReturnType<import("../broker/capabilities/index.js").probeMachine>} probe
 * @returns {{proposal: Proposal, reply: string} | null} null means "fall through to the cloud"
 */
export function routeTier0(text, probe) {
  const symptom = matchSymptom(text);
  if (!symptom) return null;

  if (symptom === "printer") {
    const svc = probe.services.spooler;
    if (svc?.error) return null;
    const stopped = svc.stateName === "STOPPED";
    return {
      proposal: {
        capabilityId: "restart_service",
        parameters: { serviceName: "spooler" },
        reasoning: stopped
          ? "The print spooler service is stopped on this machine, which is why nothing prints."
          : "The print spooler is running but a stalled spooler is the most common cause of a printer showing offline.",
        // Stopped is an observed fact, so it skips the cloud. Running is an educated guess, so
        // it stays under the threshold and lets the cloud have a look first.
        confidence: stopped ? 0.95 : 0.7,
        source: "tier0",
      },
      reply: stopped
        ? "I can see the print spooler service is stopped on this machine. That is why nothing is printing. I can restart it for you."
        : "Your printer showing offline is usually a stalled print spooler. I can restart that service.",
    };
  }

  if (symptom === "sound") {
    const svc = probe.services.audiosrv;
    if (svc?.error) return null;
    const stopped = svc.stateName === "STOPPED";
    return {
      proposal: {
        capabilityId: "restart_service",
        parameters: { serviceName: "audiosrv" },
        reasoning: stopped
          ? "The Windows Audio service is stopped, so nothing can play sound."
          : "Windows Audio is running; restarting it clears the most common cause of silent output.",
        confidence: stopped ? 0.95 : 0.7,
        source: "tier0",
      },
      reply: stopped
        ? "The Windows Audio service is stopped on this machine. I can start it again."
        : "I can restart the Windows Audio service, which clears the usual cause of no sound.",
    };
  }

  // ---- network: adapter state -> IP -> DNS, in that order (§7) ----
  //
  // Only adapters with a live link or an existing route are considered. Without that filter a
  // Bluetooth PAN or Wi-Fi Direct adapter - permanently DHCP-enabled with no IP - looks exactly
  // like an unplugged Ethernet port, and the router proposes renewing a lease on an adapter that
  // was never going to have one.
  const candidates = probe.actionable ?? probe.adapters.filter((a) => a.dhcpEnabled);

  // If the machine is actually routing traffic, adapter surgery is the wrong answer regardless
  // of what the user typed - name resolution is the only sensible local lever left.
  if (probe.online) {
    return {
      proposal: {
        capabilityId: "flush_dns",
        parameters: {},
        reasoning: "Addressing and routing are working, so stale DNS entries are the likely cause.",
        confidence: 0.81,
        source: "tier0",
      },
      reply: "Your addressing and routing look healthy from here, so this is most likely stale DNS. I can flush the resolver cache.",
    };
  }

  // A live link is required, not implied. `actionable` admits an adapter on `hasGateway` alone,
  // and Windows keeps a stale gateway on a Wi-Fi adapter whose radio is off - so without this
  // check the router proposes renewing a lease on a dead radio. Observed 2026-09-02.
  const down = candidates.find((a) => !a.hasIp && a.linkUp);
  // Same for APIPA: a self-assigned address only means anything if there is a link to ask over.
  const apipa = candidates.find((a) => a.isApipa && a.linkUp);

  if (apipa) {
    // 169.254.x.x means DHCP was asked and did not answer. Renewing the lease is the
    // proportionate first move - resetting the adapter is the bigger hammer.
    return {
      proposal: {
        capabilityId: "renew_dhcp",
        parameters: { adapterIndex: apipa.index },
        reasoning: `${apipa.description} has a self-assigned address (${apipa.ip}), so DHCP did not answer.`,
        confidence: 0.9,
        source: "tier0",
      },
      reply: `Your network adapter has fallen back to a self-assigned address, ${apipa.ip}, which means it never got a proper one from the network. I can renew the lease.`,
    };
  }

  if (down) {
    return {
      proposal: {
        capabilityId: "renew_dhcp",
        parameters: { adapterIndex: down.index },
        reasoning: `${down.description} has no IPv4 address at all.`,
        confidence: 0.85,
        source: "tier0",
      },
      reply: `${down.description} has no IP address at all. I can ask the network for a fresh one.`,
    };
  }

  // Offline, but addressing looks present - the adapter has an IP yet nothing routes.
  {
    // Resetting an adapter that has no link cannot create one - that is a cable or a radio,
    // and offline-guide.js handles it. Only bounce something that is actually connected.
    const target = [probe.primary[0], ...candidates].find((a) => a?.linkUp);
    if (!target) return null;
    return {
      proposal: {
        capabilityId: "reset_adapter",
        parameters: { adapterId: target.guid },
        reasoning: `${target.description} has an address but no working route off this machine.`,
        confidence: 0.82,
        source: "tier0",
      },
      reply: `${target.description} has an address but no working route out. Resetting the adapter is the next step, though it will drop every connection on this machine for a few seconds.`,
    };
  }

  // Offline with no adapter worth acting on - there is no local lever, so say nothing rather
  // than propose something that cannot help. The caller falls through to the cloud, or reports
  // honestly that it has nothing.
  return null;
}

/**
 * State-only fallback (§2 of the Day-4 brief).
 *
 * `routeTier0` above needs a keyword to match. When someone says "this thing is useless" or just
 * "help" - which is what people actually say, and what the design partner will say if he takes the
 * keyboard - it matches nothing and returns null. That is fine while the cloud is reachable,
 * because the cloud reads the sentence. With the cable out there IS no cloud, and the user got
 * silence on the one scenario that is supposed to prove the local path.
 *
 * So: when there is no keyword and no cloud, propose from what the machine demonstrably IS.
 * This is deliberately NOT called before the cloud - a proposal made without reading the sentence
 * must never pre-empt a model that could have read it. `agent.js` calls it only on the
 * cloud-unavailable path, and every confidence here is below TIER0_CONFIDENCE_THRESHOLD so it
 * could not skip the cloud even if it were called earlier by mistake.
 *
 * **IT NO LONGER IGNORES THE TEXT (D219, 2026-09-04).** It used to, and that produced a confident
 * non-sequitur: a cracked screen answered with the print spooler's state. `stateTopicsFor` above
 * says which branches a given sentence entitles us to answer with, and the whole of that decision
 * — including why deleting this function instead would be wrong — is documented there.
 *
 * The link-state gating from the keyword router is reused unchanged, via `probe.actionable`: an
 * idle Bluetooth PAN or Wi-Fi Direct adapter is still not something to renew a lease on.
 *
 * @param {string} text  what the user typed. **Required**, and the first parameter, so it matches
 *   `routeTier0(text, probe)` — the old signature took the probe first, and a caller that was not
 *   updated would otherwise pass a probe as the text and get a silently narrower answer instead of
 *   an error. This file has been bitten by silent wrong answers often enough; it throws instead.
 * @param {ReturnType<import("../broker/capabilities/index.js").probeMachine>} probe
 * @param {{egressFailed?: boolean}} [evidence] `egressFailed` means the cloud request never left
 *   this machine (an APIConnectionError, not an API rejection). On a box that is otherwise
 *   routing, that is the only observation available here that points at name resolution.
 * @returns {{proposal: Proposal, reply: string} | null} null means "the machine looks fine, there
 *   is no lever in the catalog for what is wrong, or what was described is not something machine
 *   state can speak to" - in which case say so, do not invent.
 */
export function routeByState(text, probe, { egressFailed = false } = {}) {
  if (typeof text !== "string") {
    throw new TypeError("routeByState(text, probe, evidence): `text` must be a string. The signature changed in D219 - the probe is now the SECOND argument.");
  }

  // Which branches this sentence lets us answer with. `null` means none of them: the user named
  // something machine state cannot be about, and the honest answer is to say nothing here.
  const allowed = stateTopicsFor(text);
  if (allowed === null) return null;
  const may = (topic) => allowed === "any" || allowed.has(topic);

  const preface = "I didn't catch which part is failing, so I looked at the machine itself.";

  // ---- 1. Not routing. The hardest fact on offer, and the Scenario 2 case. ----
  //
  // Everything in this block is a NETWORK answer, so it is gated once here rather than four times
  // below. "Nothing prints" must not be answered with "I can reset your network adapter", even
  // when the adapter genuinely has no address — that is a true observation about the wrong thing.
  if (!probe.online && may("network")) {
    const candidates = probe.actionable ?? [];

    // Link gone, but the adapter still holds an address - it was working moments ago, so the
    // driver may simply be wedged and a down/up can re-negotiate.
    //
    // `hasIp` is doing real work here. Without it this matched a Wi-Fi adapter whose RADIO was
    // switched off: Windows keeps the stale gateway, so `hasGateway` stays true and the adapter
    // stays in `actionable` while having no link and no address. Resetting that cannot create a
    // link, and it would have proposed a disruptive R2 action that could not possibly work.
    // Observed on the dev box 2026-09-02 with Wi-Fi switched off. A link-down adapter with no
    // address is a physical problem - offline-guide.js says so instead.
    const dark = candidates.find((a) => a.linkUp === false && a.hasIp);
    if (dark) {
      return {
        proposal: {
          capabilityId: "reset_adapter",
          parameters: { adapterId: dark.guid },
          reasoning: `${dark.description} is configured but its link is down.`,
          confidence: 0.6,
          source: "tier0-state",
        },
        reply: `${preface} ${dark.description} is configured but has no link. I can reset that adapter, which will drop every connection on this machine for a few seconds.`,
      };
    }

    const apipa = candidates.find((a) => a.isApipa && a.linkUp);
    if (apipa) {
      return {
        proposal: {
          capabilityId: "renew_dhcp",
          parameters: { adapterIndex: apipa.index },
          reasoning: `${apipa.description} holds a self-assigned address (${apipa.ip}), so DHCP did not answer.`,
          confidence: 0.6,
          source: "tier0-state",
        },
        reply: `${preface} ${apipa.description} has fallen back to a self-assigned address, ${apipa.ip}, which means the network never gave it a real one. I can renew the lease.`,
      };
    }

    const noIp = candidates.find((a) => !a.hasIp && a.linkUp);
    if (noIp) {
      return {
        proposal: {
          capabilityId: "renew_dhcp",
          parameters: { adapterIndex: noIp.index },
          reasoning: `${noIp.description} has a link but no IPv4 address.`,
          confidence: 0.6,
          source: "tier0-state",
        },
        reply: `${preface} ${noIp.description} has a live link but no IP address at all. I can ask the network for one.`,
      };
    }

    // Addressed and holding a route on paper, yet nothing gets out.
    const addressed = [probe.primary[0], ...candidates].find((a) => a?.hasIp && a.linkUp);
    if (addressed) {
      return {
        proposal: {
          capabilityId: "reset_adapter",
          parameters: { adapterId: addressed.guid },
          reasoning: `${addressed.description} has an address but no working route off this machine.`,
          confidence: 0.6,
          source: "tier0-state",
        },
        reply: `${preface} ${addressed.description} has an address but nothing is routing through it. Resetting the adapter is the next step, though it will drop every connection here for a few seconds.`,
      };
    }

    // Offline with nothing actionable - fall through. There may still be a stopped service worth
    // fixing, and if not the caller reports the state honestly rather than inventing a lever.
  }

  // ---- 2. A stopped service is observed, not inferred. ----
  // Both entries are the same rule over the same capability, so the audio one costs nothing and
  // covers `inject-fault.ps1 -Fault sound`.
  //
  // `topic` is what each service ANSWERS, and it is the field that stops a stopped spooler being
  // offered as the explanation for a cracked screen. That was the observed defect (D219): the
  // observation was true, well-evidenced, and about something else entirely.
  const STOPPED_SERVICES = [
    { key: "spooler", topic: "printer", label: "The print spooler service", effect: "nothing will print" },
    { key: "audiosrv", topic: "sound", label: "The Windows Audio service", effect: "nothing will play sound" },
  ];
  for (const { key, topic, label, effect } of STOPPED_SERVICES) {
    if (!may(topic)) continue;
    const svc = probe.services?.[key];
    if (!svc || svc.error || svc.stateName !== "STOPPED") continue;
    return {
      proposal: {
        capabilityId: "restart_service",
        parameters: { serviceName: key },
        reasoning: `${label} is stopped on this machine.`,
        confidence: 0.6,
        source: "tier0-state",
      },
      reply: `${preface} ${label} is stopped, which means ${effect}. I can start it again.`,
    };
  }

  // ---- 3. Routing on paper, nothing down, but the machine could not get a request out. ----
  //
  // This branch needs `egressFailed`, and an earlier draft of it did not have that gate: it
  // fired on `probe.online` alone, which made "my chair is broken and my monitor is cracked"
  // come back as "I can flush your DNS cache". That is the failure mode this whole design is
  // supposed to avoid, and an existing test caught it. A route plus a request that never left
  // the machine IS an observation about name resolution; "the machine looks fine" is not.
  //
  // TWO GATES NOW, and they ask different questions. `egressFailed` asks whether an observation
  // supports this proposal; `may("network")` asks whether the observation is about what the user
  // reported. The first was added when this branch answered "my monitor is cracked" with "I can
  // flush your DNS cache" — but a machine that IS failing to get requests out still should not
  // offer name resolution to someone reporting a cracked monitor, and only the second gate stops
  // that. Neither subsumes the other.
  if (probe.online && egressFailed && may("network")) {
    return {
      proposal: {
        capabilityId: "flush_dns",
        parameters: {},
        reasoning: "Addressing, routing and the local services are all healthy, yet a request could not leave this machine - which points at name resolution.",
        confidence: 0.45,
        source: "tier0-state",
      },
      reply: `${preface} Addressing, routing and the local services all look healthy, but nothing I send is getting out - which usually means name resolution. I can flush the DNS cache.`,
    };
  }

  // Nothing observably wrong that this catalog can act on. Say so; do not reach for a lever.
  return null;
}
