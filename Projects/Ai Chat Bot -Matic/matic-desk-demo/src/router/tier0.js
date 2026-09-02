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

  const down = candidates.find((a) => !a.hasIp);
  const apipa = candidates.find((a) => a.isApipa);

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
    const target = probe.primary[0] ?? candidates[0];
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
