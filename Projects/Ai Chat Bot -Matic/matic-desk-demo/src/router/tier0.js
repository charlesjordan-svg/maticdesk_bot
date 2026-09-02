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
 * State-only fallback (§2 of the Day-4 brief). Ignores the text entirely.
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
 * The link-state gating from the keyword router is reused unchanged, via `probe.actionable`: an
 * idle Bluetooth PAN or Wi-Fi Direct adapter is still not something to renew a lease on.
 *
 * @param {ReturnType<import("../broker/capabilities/index.js").probeMachine>} probe
 * @param {{egressFailed?: boolean}} [evidence] `egressFailed` means the cloud request never left
 *   this machine (an APIConnectionError, not an API rejection). On a box that is otherwise
 *   routing, that is the only observation available here that points at name resolution.
 * @returns {{proposal: Proposal, reply: string} | null} null means "the machine looks fine, or
 *   there is no lever in the catalog for what is wrong" - in which case say so, do not invent.
 */
export function routeByState(probe, { egressFailed = false } = {}) {
  const preface = "I didn't catch which part is failing, so I looked at the machine itself.";

  // ---- 1. Not routing. The hardest fact on offer, and the Scenario 2 case. ----
  if (!probe.online) {
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
  const STOPPED_SERVICES = [
    { key: "spooler", label: "The print spooler service", effect: "nothing will print" },
    { key: "audiosrv", label: "The Windows Audio service", effect: "nothing will play sound" },
  ];
  for (const { key, label, effect } of STOPPED_SERVICES) {
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
  if (probe.online && egressFailed) {
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
