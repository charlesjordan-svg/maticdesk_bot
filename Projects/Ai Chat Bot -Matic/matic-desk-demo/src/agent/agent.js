// @ts-check
/**
 * The agent half. UNPRIVILEGED by design.
 *
 * It decides WHAT to propose - tier-0 router first, cloud model only if tier-0 has nothing
 * confident - and then hands the proposal to the broker. It holds no capability implementation
 * and never touches a privileged API itself (§2, §12). Everything it reads about the machine
 * comes from read-only probes that work without admin rights.
 *
 * @typedef {import("../broker/broker.d.ts").Proposal} Proposal
 * @typedef {import("../broker/broker.d.ts").Broker} Broker
 */
import { probeMachine } from "../broker/capabilities/index.js";
import { routeTier0, TIER0_CONFIDENCE_THRESHOLD } from "../router/tier0.js";

export class Agent {
  /** @param {{broker: Broker, cloud: any, onLog?: (s:string)=>void}} deps */
  constructor({ broker, cloud, onLog = () => {} }) {
    this.broker = broker;
    this.cloud = cloud;
    this.onLog = onLog;
  }

  /** Read-only machine state, for the facts panel and the router. Needs no elevation. */
  diagnose() {
    const probe = probeMachine();
    const primary = probe.primary[0];
    return {
      probe,
      summary: {
        online: probe.online ? "yes" : "no",
        adapter: primary ? primary.description.slice(0, 22) : "none",
        ip: primary?.ip ?? "-",
        gateway: primary?.gateway ?? "-",
        spooler: probe.services.spooler?.stateName ?? "?",
        audio: probe.services.audiosrv?.stateName ?? "?",
        dhcp: probe.services.dhcp?.stateName ?? "?",
      },
    };
  }

  /**
   * Produce a validated proposal for what the user described.
   * @returns {Promise<object>}
   */
  async propose(text) {
    const { probe, summary } = this.diagnose();

    // ---- Tier 0: local, deterministic, no network required ----
    const local = routeTier0(text, probe);
    if (local && local.proposal.confidence >= TIER0_CONFIDENCE_THRESHOLD) {
      this.onLog(`[router] tier-0 matched with confidence ${local.proposal.confidence} - no cloud call made`);
      const validation = this.broker.validate(local.proposal);
      return { ok: true, proposal: local.proposal, validation, facts: summary, reply: local.reply };
    }

    // ---- Tier 1: cloud model. The model proposes; it never executes (§5). ----
    const cloudResult = await this.cloud.propose(text, { probe, summary });

    if (!cloudResult.ok) {
      // Cloud unavailable. Fall back to a lower-confidence tier-0 match if there is one,
      // and say plainly that the cloud was not reachable - never pretend otherwise (§13).
      if (local) {
        this.onLog(`[router] cloud unavailable (${cloudResult.error}) - falling back to tier-0 match`);
        const validation = this.broker.validate(local.proposal);
        return {
          ok: true,
          proposal: { ...local.proposal, reasoning: `${local.proposal.reasoning} (local match; the cloud model was not reachable)` },
          validation,
          facts: summary,
          reply: local.reply,
        };
      }
      return {
        ok: false,
        error: cloudResult.error,
        facts: summary,
        reply: `I could not reach the model to reason about that, and I have no local rule that matches it. ${cloudResult.error}`,
      };
    }

    if (cloudResult.escalate) {
      // Scenario 3. Nothing in the catalog fixes this, so the honest answer is a handoff.
      return {
        ok: false,
        error: "escalation",
        escalation: cloudResult.escalation,
        facts: summary,
        reply: cloudResult.reply,
      };
    }

    const validation = this.broker.validate(cloudResult.proposal);
    return {
      ok: true,
      proposal: cloudResult.proposal,
      validation,
      facts: summary,
      reply: cloudResult.reply,
    };
  }
}
