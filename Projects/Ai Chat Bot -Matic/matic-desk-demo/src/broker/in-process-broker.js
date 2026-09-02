// @ts-check
/**
 * InProcessBroker - the demo build's Broker implementation (see broker.d.ts).
 *
 * Runs inside the single elevated process. Phase 1 replaces this class with NamedPipeBroker,
 * which serialises the same Proposal / ConsentToken / ExecutionResult objects across a pipe to
 * a Windows Service. Because callers only ever touch the interface, that swap is a constructor
 * change at the wiring site - nothing else moves.
 *
 * @typedef {import("./broker.d.ts").Proposal} Proposal
 * @typedef {import("./broker.d.ts").Capability} Capability
 * @typedef {import("./broker.d.ts").ValidationResult} ValidationResult
 * @typedef {import("./broker.d.ts").ConsentToken} ConsentToken
 * @typedef {import("./broker.d.ts").ExecutionResult} ExecutionResult
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { EXECUTORS, probeMachine } from "./capabilities/index.js";
import { validateAgainstSchema } from "./schema.js";
import { AuditLog } from "./audit.js";

const CONSENT_TTL_MS = 120000;

function sortKeys(obj) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return obj;
  return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, sortKeys(obj[k])]));
}

/** Stable hash over the parts that decide what actually runs. Key order cannot change it. */
function proposalHash(proposal) {
  const canonical = JSON.stringify({
    capabilityId: proposal.capabilityId,
    parameters: sortKeys(proposal.parameters ?? {}),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export class InProcessBroker {
  constructor({ catalogPath, auditPath, onLog = () => {} }) {
    this.onLog = onLog;
    this.catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
    this.verifyCatalogSignature();
    this.audit = new AuditLog(auditPath, { onLog });
    /** @type {Map<string, {proposalHash:string, expiresAt:number, used:boolean}>} */
    this.tokens = new Map();
  }

  verifyCatalogSignature() {
    // TODO(phase1): verify a real detached signature over catalog.json and refuse to load any
    // capability if it does not check out. Stubbed deliberately and loudly - an unsigned catalog
    // is the whole trust root of the privileged half.
    this.onLog("[broker] TODO(phase1): catalog signature verification is STUBBED - catalog loaded unverified");
    this.catalogTrusted = false;
  }

  /** @returns {Capability[]} */
  listCapabilities() {
    return this.catalog.capabilities;
  }

  /** @returns {ValidationResult} */
  validate(proposal) {
    const errors = [];
    if (!proposal || typeof proposal.capabilityId !== "string") {
      return { ok: false, errors: ["proposal has no capabilityId"] };
    }

    const capability = this.catalog.capabilities.find((c) => c.id === proposal.capabilityId);
    if (!capability) {
      return { ok: false, errors: [`capability "${proposal.capabilityId}" is not in the catalog`] };
    }
    if (!EXECUTORS[capability.id]) {
      return { ok: false, errors: [`capability "${capability.id}" has no implementation in this build`] };
    }

    // 1. Schema. The gate that stops a model-supplied string becoming a call argument.
    errors.push(...validateAgainstSchema(capability.parameters, proposal.parameters ?? {}));

    // 2. Tier policy. R2 without a rollback path is a catalog bug, not a runtime choice.
    if (capability.tier === "R2" && !capability.rollback) {
      errors.push(`tier R2 capability "${capability.id}" has no rollback defined`);
    }

    // 3. Policy + live machine state. Schema-valid is not the same as safe or possible.
    if (errors.length === 0) errors.push(...this.checkPolicy(capability, proposal));

    return errors.length ? { ok: false, errors } : { ok: true, errors: [], capability };
  }

  /** Policy and live-state checks. Returns error strings. */
  checkPolicy(capability, proposal) {
    const errors = [];
    const params = proposal.parameters ?? {};

    if (capability.id === "restart_service") {
      const blocked = this.catalog.policy?.serviceStopBlocklist?.[params.serviceName];
      if (blocked) {
        errors.push(blocked);
      } else {
        const probe = probeMachine();
        const svc = probe.services[params.serviceName];
        if (svc?.error) {
          errors.push(`cannot read the state of ${params.serviceName}: ${svc.error}`);
        } else if (svc.stateName === "RUNNING" && !svc.canStop) {
          errors.push(
            `the ${params.serviceName} service is running but does not accept stop requests ` +
            `(controls-accepted 0x${svc.controlsAccepted.toString(16)}), so it cannot be restarted`
          );
        }
      }
    }

    if (capability.id === "renew_dhcp") {
      const adapter = probeMachine().adapters.find((a) => a.index === params.adapterIndex);
      if (!adapter) {
        errors.push(`adapter index ${params.adapterIndex} is not on this machine`);
      } else if (!adapter.dhcpEnabled) {
        errors.push(`adapter ${adapter.description} has a static address, so there is no DHCP lease to renew`);
      }
    }

    if (capability.id === "reset_adapter") {
      const adapter = probeMachine().adapters.find((a) => a.guid === params.adapterId);
      if (!adapter) errors.push(`adapter ${params.adapterId} is not on this machine`);
    }

    return errors;
  }

  /** @returns {ConsentToken} */
  mintConsentToken(proposal) {
    const validation = this.validate(proposal);
    if (!validation.ok) {
      throw new Error(`refusing to mint consent for an invalid proposal: ${validation.errors.join("; ")}`);
    }
    const now = Date.now();
    const token = {
      id: randomUUID(),
      proposalHash: proposalHash(proposal),
      issuedAt: now,
      expiresAt: now + CONSENT_TTL_MS,
    };
    this.tokens.set(token.id, {
      proposalHash: token.proposalHash,
      expiresAt: token.expiresAt,
      used: false,
    });
    return token;
  }

  /** @returns {Promise<ExecutionResult>} */
  async execute(proposal, consentToken) {
    const refuse = async (message) => {
      const auditId = await this.audit.record({
        capabilityId: proposal?.capabilityId ?? null,
        parameters: proposal?.parameters ?? null,
        consentTokenId: consentToken?.id ?? null,
        outcome: "refused",
        message,
      });
      return {
        ok: false,
        capabilityId: proposal?.capabilityId ?? "unknown",
        message,
        detail: {},
        needsBroker: false,
        rollbackWith: null,
        auditId,
      };
    };

    // Re-validate at execution time. State can have changed since the consent prompt was shown.
    const validation = this.validate(proposal);
    if (!validation.ok) return refuse(`refused at execution time: ${validation.errors.join("; ")}`);
    const capability = validation.capability;

    // Consent verification. A token is single-use, time-limited, and bound to the exact proposal
    // it was minted for - so a validated-then-mutated proposal cannot ride an old token.
    const record = consentToken && this.tokens.get(consentToken.id);
    if (!record) return refuse("no valid consent token - nothing was executed");
    if (record.used) return refuse("consent token has already been used");
    if (Date.now() > record.expiresAt) return refuse("consent token has expired");
    if (record.proposalHash !== proposalHash(proposal)) {
      return refuse("consent token does not match this proposal (it changed after consent was given)");
    }
    record.used = true;

    const startedAt = Date.now();
    try {
      const { message, detail } = await EXECUTORS[capability.id](proposal.parameters ?? {});
      const auditId = await this.audit.record({
        capabilityId: capability.id,
        parameters: proposal.parameters ?? {},
        consentTokenId: consentToken.id,
        tier: capability.tier,
        outcome: "success",
        durationMs: Date.now() - startedAt,
        detail,
      });
      return {
        ok: true,
        capabilityId: capability.id,
        message,
        detail,
        needsBroker: false,
        rollbackWith: capability.rollback,
        auditId,
      };
    } catch (err) {
      // Honest failure (§13). ERROR_ACCESS_DENIED is reported as "this needs the broker",
      // never as a user error (§12).
      const needsBroker = Boolean(err.needsBroker);
      const message = needsBroker
        ? `I could not do that from here - this action needs the privileged broker. (${err.message})`
        : `That did not work: ${err.message}`;
      const auditId = await this.audit.record({
        capabilityId: capability.id,
        parameters: proposal.parameters ?? {},
        consentTokenId: consentToken.id,
        tier: capability.tier,
        outcome: needsBroker ? "denied" : "failed",
        durationMs: Date.now() - startedAt,
        error: { message: err.message, code: err.code ?? null, call: err.call ?? null },
      });
      return {
        ok: false,
        capabilityId: capability.id,
        message,
        detail: { code: err.code ?? null, call: err.call ?? null },
        needsBroker,
        rollbackWith: null,
        auditId,
      };
    }
  }
}
