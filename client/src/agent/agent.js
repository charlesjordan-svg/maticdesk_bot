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
import os from "node:os";
import { probeMachine } from "../broker/capabilities/index.js";
import { routeTier0, routeByState, TIER0_CONFIDENCE_THRESHOLD } from "../router/tier0.js";
import { classify } from "../router/classify.js";
import { socialReply } from "../router/social.js";
import { diagnoseOffline } from "../router/offline-guide.js";
import { escalationReply } from "./prompt.js";

export class Agent {
  /**
   * @param {{broker: Broker, cloud: any, intake?: any, onLog?: (s:string)=>void}} deps
   *
   * `intake` is OPTIONAL, and its absence is a supported configuration rather than an oversight.
   * Ticket filing needs a hub (`fileTicket` exists on HubClient only) and a place to keep a
   * profile; a headless test or a cloud-provider run has neither, and must still be able to
   * escalate. With no intake the escalation branch behaves as it did before D216: it says what it
   * cannot fix and offers nothing it cannot deliver.
   */
  constructor({ broker, cloud, intake = null, onLog = () => {} }) {
    this.broker = broker;
    this.cloud = cloud;
    this.intake = intake;
    this.onLog = onLog;
  }

  /** Read-only machine state, for the facts panel and the router. Needs no elevation. */
  /**
   * Who and where this is. Ordinary Node calls, no elevation, no native binding.
   *
   * Kept OUT of `summary` on purpose. `summary` is the object handed to the cloud client, and
   * a machine name and a username are the customer's environment, not diagnostic facts the
   * model needs - it reasons about services and adapters. Nothing here is sent anywhere.
   */
  identify() {
    let user = "unknown";
    try { user = os.userInfo().username; } catch { /* no passwd entry; the panel can say unknown */ }
    return { computer: os.hostname(), user };
  }

  /** Read-only machine state, for the facts panel and the router. Needs no elevation. */
  diagnose() {
    const probe = probeMachine();
    const primary = probe.primary[0];
    // `summary` is cloud-facing. `panel` is what the user sees, and may hold more.
    const summary = {
      online: probe.online ? "yes" : "no",
      adapter: primary ? primary.description.slice(0, 22) : "none",
      ip: primary?.ip ?? "-",
      gateway: primary?.gateway ?? "-",
      spooler: probe.services.spooler?.stateName ?? "?",
      audio: probe.services.audiosrv?.stateName ?? "?",
      dhcp: probe.services.dhcp?.stateName ?? "?",
    };
    const identity = this.identify();
    // Identity first: on a support call the first question is always which machine, and who.
    return { probe, summary, identity, panel: { ...identity, ...summary } };
  }

  /**
   * Produce a validated proposal for what the user described.
   * @returns {Promise<object>}
   */
  async propose(text) {
    const { probe, summary, panel } = this.diagnose();

    // ---- BEFORE EVERYTHING: is this sentence the ANSWER to a question we asked? (D216) --------
    //
    // AHEAD OF TIER-0, AND THAT IS THE WHOLE POINT. When the assistant has just asked "shall I
    // open a ticket?" or "where are you based?", the next sentence means something only in that
    // context. Running tier-0 first would route "yes please hand to it" as a fresh problem
    // statement, which is exactly the defect observed on screen on 2026-09-04.
    //
    // It is safe to put this first ONLY because the intake never traps a turn: an unrecognised
    // answer to the offer returns `passthrough` and the sentence falls through to tier-0 as if
    // this block had not run, a cancel word cancels, and a stale intake expires. See intake.js.
    //
    // Note what this does NOT do: it never proposes a capability and never reaches the broker. A
    // turn that lands here changes nothing on the machine, so D198 is not in play.
    if (this.intake?.isPending) {
      const step = this.intake.accept(text);
      if (step.kind === "question") {
        this.onLog(`[ticket] collecting ${step.field} - no provider call, NO PROPOSAL`);
        return { ok: true, ticketIntake: { stage: "collecting", field: step.field }, facts: panel, reply: step.reply };
      }
      if (step.kind === "cancelled") {
        return { ok: true, ticketIntake: { stage: "cancelled" }, facts: panel, reply: step.reply };
      }
      if (step.kind === "draft") {
        this.onLog("[ticket] draft ready - awaiting the user's review. NOTHING HAS BEEN SENT");
        return { ok: true, ticketDraft: step.draft, facts: panel, reply: step.reply };
      }
      // "passthrough" — deliberately falls through to the ordinary path below.
    }

    // ---- Tier 0: local, deterministic, no network required ----
    const local = routeTier0(text, probe);
    if (local && local.proposal.confidence >= TIER0_CONFIDENCE_THRESHOLD) {
      this.onLog(`[router] tier-0 matched with confidence ${local.proposal.confidence} - no cloud call made`);
      const validation = this.broker.validate(local.proposal);
      return { ok: true, proposal: local.proposal, validation, facts: panel, reply: local.reply };
    }

    // ---- Tier 0.5: is this SOCIAL, a QUESTION, or a request to change the machine? ----
    //
    // AFTER tier-0, so D46b holds: a sentence tier-0 matches with confidence never reaches here.
    // ONE classification for both branches — classifying twice is how the two disagree.
    const kind = classify(text);

    // ---- D165 / D198: the social layer, and it is UNCONDITIONAL. -----------------------------
    //
    // Not gated on the provider, unlike the question branch below. **D198 makes this a safety
    // requirement rather than polish**, and the defect it recorded — "Hello how are you?" produced
    // a `renew_dhcp` consent card — was observed on `provider: "cloud"`, which is exactly the
    // configuration the frozen demo build uses. A social layer that only protected the hub path
    // would leave the observed defect in place on the path it was observed on.
    //
    // It is also the only branch here that needs no network: the templates are client-shipped and
    // deterministic (D165), so a greeting is answered with the cloud unreachable and the hub down,
    // which is the state D198's defect was found in.
    if (kind.kind === "social") {
      // `listCapabilities()` carries `tierInfo` from the catalog's `tiers/*`, so this needs
      // nothing else. Reaching through the broker into `broker.catalog` would be the layering
      // violation broker.d.ts exists to prevent.
      const reply = socialReply(kind.subkind, { capabilities: this.broker.listCapabilities() });
      if (reply) {
        this.onLog(`[router] ${kind.why} - answering from a template, no provider call, NO PROPOSAL`);
        return {
          ok: true,
          // A distinct field, like `answer` and `escalation`. There is no proposal and no
          // validation, so the renderer must branch before it destructures either.
          social: { subkind: kind.subkind },
          facts: panel,
          reply,
        };
      }
      // classify() and the template table disagreed. Fall through rather than say nothing — and the
      // log says so, because a silent disagreement between those two is a bug worth seeing.
      this.onLog(`[router] classified as social/${kind.subkind} but no template exists - falling through`);
    }

    // ---- D211: a question goes to the knowledge base, not to a proposal. ---------------------
    //
    // GATED ON THE PROVIDER BEING ABLE TO ANSWER QUESTIONS, by duck-typing rather than by a flag.
    // `CloudClient` and `OpenAICompatibleClient` have no `ask`, so with `provider: "cloud"` this
    // branch is unreachable and the demo's proposal behaviour is unchanged by construction rather
    // than by configuration. That is why it is a capability check and not a provider-name check.
    //
    // A declined question does NOT fall through to the proposal path. See src/router/classify.js:
    // it would produce a consent card the user never provoked, which is D198's defect.
    if (typeof this.cloud?.ask === "function") {
      if (kind.kind === "question") {
        this.onLog(`[router] classified as a question (${kind.why}) - asking the knowledge base, not proposing`);
        const asked = await this.cloud.ask(text, { probe });
        if (asked.ok) {
          // `ok: true` with `answered: false` is the NORMAL decline (D205), not a failure.
          return {
            ok: true,
            // A distinct field, like `escalation`. The renderer branches on it BEFORE it destructures
            // a proposal, because an answer has no proposal and no validation to show.
            answer: {
              answered: asked.answered,
              citedArticleIds: asked.citedArticleIds ?? [],
              retrieval: asked.retrieval ?? null,
            },
            facts: panel,
            reply: asked.reply,
          };
        }
        // The hub could not be reached. Fall through to the ordinary path rather than inventing an
        // answer: the model may still be able to help, and if it cannot, the existing offline
        // guidance is better than a decline that blames the knowledge base for a network problem.
        this.onLog(`[router] the knowledge base was unreachable (${asked.error}) - falling through to the proposal path`);
      }
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
          facts: panel,
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
          facts: panel,
          reply: byState.reply,
        };
      }

      // Genuinely no lever. Do NOT answer with a paragraph explaining what could not be done -
      // that is what this used to do, and it is useless to someone whose cable is out. Say what
      // is wrong and what to check. Guidance only: no proposal, nothing privileged, no claim to
      // have acted.
      const guidance = diagnoseOffline(probe);
      if (guidance) {
        this.onLog(`[router] no capability applies - returning offline guidance instead`);
        return {
          ok: false,
          error: cloudResult.error,
          guidance,
          facts: panel,
          reply: `${guidance.headline} ${guidance.cause}`,
        };
      }

      return {
        ok: false,
        error: cloudResult.error,
        facts: panel,
        reply: `I could not reach the model, nothing you described matched a local rule, and I cannot see anything wrong on this machine that I am able to fix.`,
      };
    }

    if (cloudResult.escalate) {
      // Scenario 3. Nothing in the catalog fixes this, so the honest answer is a handoff.
      //
      // D216: the handoff is now an OFFER THAT CAN BE ACCEPTED. `cloudResult.reply` already ends
      // in a question (escalationReply, D214); this arms the next turn to hear the answer.
      //
      // `canFile` is duck-typed on the provider, exactly as the `ask` branch above is, and for the
      // same reason: with `provider: "cloud"` there is no `fileTicket`, so the frozen demo build's
      // escalation behaviour is unchanged BY CONSTRUCTION rather than by configuration.
      const canFile = Boolean(this.intake) && typeof this.cloud?.fileTicket === "function";
      if (canFile) {
        this.intake.offer({
          escalation: cloudResult.escalation,
          userText: text,
          machineName: this.identify().computer,
        });
      } else {
        this.onLog("[ticket] escalated, but this configuration cannot file - offering nothing");
      }
      return {
        ok: false,
        error: "escalation",
        escalation: cloudResult.escalation,
        // The renderer needs to know whether the question in `reply` can actually be answered, so
        // it can say "nothing was filed" in the one case where that is still the whole story.
        canFile,
        facts: panel,
        // With no filing path the spoken line must not end in an offer it cannot keep. Regenerated
        // from the same builder the provider used, rather than edited — see escalationReply.
        reply: canFile ? cloudResult.reply : escalationReply(cloudResult.escalation, { canFile: false }),
      };
    }

    const validation = this.broker.validate(cloudResult.proposal);
    return {
      ok: true,
      proposal: cloudResult.proposal,
      validation,
      facts: panel,
      reply: cloudResult.reply,
    };
  }
}
