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
import { routeTier0, routeByState, TIER0_CONFIDENCE_THRESHOLD } from "../router/tier0.js";

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
    //
    // If the machine is not routing there is no cloud to reach, and trying anyway costs dead
    // air on stage: a blackholed connection hangs for the full TCP timeout on every retry,
    // where a refused one fails in milliseconds. Which of those you get is a property of the
    // room's network, not of this code, so do not gamble on it in front of an audience.
    if (!probe.online) this.onLog("[cloud] skipped - this machine has no working route, so the model is unreachable");
    const cloudResult = probe.online
      ? await this.cloud.propose(text, { probe, summary })
      : { ok: false, error: "This machine is not routing, so no cloud call was attempted." };

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
      // Nothing the user said matched, and there is no cloud to read the sentence. Rather than
      // return silence on the one scenario that is meant to prove the local path, propose from
      // what the machine demonstrably IS. This is the only caller of routeByState, and that is
      // deliberate: a proposal made without reading the sentence must never run ahead of a model
      // that could have read it.
      const byState = routeByState(probe, { egressFailed: cloudResult.reason === "connection" });
      if (byState) {
        this.onLog(`[router] cloud unavailable (${cloudResult.error}) - nothing matched what was typed; proposing from machine state alone`);
        const validation = this.broker.validate(byState.proposal);
        return {
          ok: true,
          proposal: byState.proposal,
          validation,
          facts: summary,
          reply: byState.reply,
        };
      }

      // Genuinely no lever: not routing, and no adapter or stopped service the catalog can act on.
      // Say exactly that, with the state that led to it. Never invent a fix (§13).
      const observed = probe.online
        ? `spooler ${summary.spooler}, audio ${summary.audio}`
        : "this machine is not routing, and I can see no network adapter here that I am able to act on";
      return {
        ok: false,
        error: cloudResult.error,
        facts: summary,
        reply: `I could not reach the model to reason about that, nothing you described matched a local rule, and looking at the machine directly - ${observed} - I have no action in my catalogue that would help. ${cloudResult.error}`,
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
