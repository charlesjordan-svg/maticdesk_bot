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
  /**
   * @param probe Reads live machine state. Injectable ONLY so the state-derived gate can be tested
   *   and measured against known machines - the eval describes fictional ones, and a gate that can
   *   only be exercised against whatever box happens to be running is a gate nobody has checked.
   *   Production passes nothing and gets probeMachine().
   * @param executors The capability implementations. Injectable for the same reason as `probe`,
   *   and for one more: test/consent-surface.test.mjs has to drive a consented `reset_adapter`
   *   all the way through mint -> execute -> audit WITHOUT resetting an adapter on the box running
   *   the test. Production passes nothing and gets the real Win32 primitives.
   */
  constructor({ catalogPath, auditPath, probe = probeMachine, executors = EXECUTORS, onLog = () => {} }) {
    this.onLog = onLog;
    this.probe = probe;
    this.executors = executors;
    this.catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
    this.verifyCatalogSignature();
    // Attach the plain-language risk label to each capability so the consent prompt can show it
    // without shipping the whole catalog to the renderer. Presentation only - nothing here is
    // consulted by validate() or execute().
    for (const c of this.catalog.capabilities) c.tierInfo = this.catalog.tiers?.[c.tier] ?? null;
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

  /**
   * Schema + tier + policy + live machine state. Runs BEFORE any consent prompt is shown, so this
   * is where the demo's `dnscache` refusal is actually decided.
   *
   * A refusal here is audited (§6). It happens before a consent token exists, so the record carries
   * `consentTokenId: null` and names the `gate` that fired - a trail that records what was done but
   * not what was refused is one-sided, and denied attempts are where both attacks and
   * misconfigurations show up first.
   *
   * @param {Proposal} proposal
   * @param {{audit?: boolean}} [opts] `audit:false` for the broker's own internal re-validation
   *   (mintConsentToken, execute), so one refusal is not logged twice under two different gates.
   * @returns {ValidationResult}
   */
  validate(proposal, { audit = true } = {}) {
    const { failures, capability } = this.checkProposal(proposal);
    if (failures.length === 0) return { ok: true, errors: [], capability };

    const errors = failures.map((f) => f.message);
    const result = {
      ok: false,
      errors,
      // The gate that decided it. Checks run in order and the first one to fire is the reason;
      // `reasons` keeps the rest, each still attributed.
      gate: failures[0].gate,
      reasons: failures,
    };
    if (audit) {
      result.auditId = this.audit.recordSync({
        capabilityId: proposal?.capabilityId ?? null,
        parameters: proposal?.parameters ?? null,
        // Where the proposal came from: tier0 / tier0-state / cloud. A cloud proposal being
        // refused reads very differently from a local rule being refused.
        source: proposal?.source ?? null,
        // No token exists yet - that is the whole point of this record.
        consentTokenId: null,
        tier: capability?.tier ?? null,
        outcome: "refused",
        gate: failures[0].gate,
        reasons: failures,
        message: errors.join("; "),
      });
    }
    return result;
  }

  /**
   * The checks themselves, in order, each failure attributed to the gate that produced it.
   *
   * Gates:
   *   catalog          - not a capability this build has loaded and implemented.
   *   schema           - parameters failed the catalog's JSON Schema (the injection gate).
   *   tier-policy      - a tier rule was violated (R2 with no rollback is a catalog bug).
   *   policy-blocklist - an explicit refusal string in catalog.policy.
   *   machine-state    - derived from a live read of this machine, not from the catalog.
   *
   * @returns {{failures: {gate: string, message: string}[], capability?: Capability}}
   */
  checkProposal(proposal) {
    if (!proposal || typeof proposal.capabilityId !== "string") {
      return { failures: [{ gate: "catalog", message: "proposal has no capabilityId" }] };
    }

    const capability = this.catalog.capabilities.find((c) => c.id === proposal.capabilityId);
    if (!capability) {
      return {
        failures: [{ gate: "catalog", message: `capability "${proposal.capabilityId}" is not in the catalog` }],
      };
    }
    if (!this.executors[capability.id]) {
      return {
        failures: [{ gate: "catalog", message: `capability "${capability.id}" has no implementation in this build` }],
        capability,
      };
    }

    const failures = [];

    // 1. Schema. The gate that stops a model-supplied string becoming a call argument.
    for (const message of validateAgainstSchema(capability.parameters, proposal.parameters ?? {})) {
      failures.push({ gate: "schema", message });
    }

    // 2. Tier policy. R2 without a rollback path is a catalog bug, not a runtime choice.
    if (capability.tier === "R2" && !capability.rollback) {
      failures.push({ gate: "tier-policy", message: `tier R2 capability "${capability.id}" has no rollback defined` });
    }

    // 3. Policy + live machine state. Schema-valid is not the same as safe or possible.
    //    Skipped while the parameters are still wrong: probing the machine with a value that
    //    failed the schema tells you nothing.
    if (failures.length === 0) failures.push(...this.checkPolicy(capability, proposal));

    return { failures, capability };
  }

  /**
   * Policy and live-state checks.
   * @returns {{gate: string, message: string}[]}
   */
  checkPolicy(capability, proposal) {
    const failures = [];
    const params = proposal.parameters ?? {};
    const blocked = (message) => failures.push({ gate: "policy-blocklist", message });
    const state = (message) => failures.push({ gate: "machine-state", message });

    if (capability.id === "restart_service") {
      const blocklisted = this.catalog.policy?.serviceStopBlocklist?.[params.serviceName];
      if (blocklisted) {
        // NOTE: the blocklist is checked first and short-circuits. `dnscache` would also trip the
        // state-derived rule below, but the message the user sees is this one - do not claim on
        // stage that it came from observed state (Day-4 ledger).
        blocked(blocklisted);
      } else {
        const probe = this.probe();
        const svc = probe.services[params.serviceName];
        if (svc?.error) {
          state(`cannot read the state of ${params.serviceName}: ${svc.error}`);
        } else if (svc.stateName === "RUNNING" && !svc.canStop) {
          state(
            `the ${params.serviceName} service is running but does not accept stop requests ` +
            `(controls-accepted 0x${svc.controlsAccepted.toString(16)}), so it cannot be restarted`
          );
        }
      }
    }

    if (capability.id === "renew_dhcp") {
      const adapter = this.probe().adapters.find((a) => a.index === params.adapterIndex);
      if (!adapter) {
        state(`adapter index ${params.adapterIndex} is not on this machine`);
      } else if (!adapter.dhcpEnabled) {
        state(`adapter ${adapter.description} has a static address, so there is no DHCP lease to renew`);
      }
    }

    if (capability.id === "reset_adapter") {
      const adapter = this.probe().adapters.find((a) => a.guid === params.adapterId);
      if (!adapter) state(`adapter ${params.adapterId} is not on this machine`);
    }

    // Declarative preconditions from the catalog. Measured 2026-09-02: every model tested - the
    // cloud one included - proposed reset_adapter on a HEALTHY machine when a user asked for it by
    // name. Four of five made that their only R2 mistake. No model choice fixes it, because the
    // model is treating a user's self-diagnosis as an instruction rather than a claim to check.
    //
    // So the machine checks it instead. This is H2 in miniature: policy is data, the endpoint
    // enforces it, and it holds for every model including ones nobody has evaluated yet.
    failures.push(...this.checkPreconditions(capability));

    return failures;
  }

  /**
   * Catalog-declared preconditions on observed machine state.
   *
   * Kept to a deliberately tiny expression language - a named fact and an expected boolean - rather
   * than anything evaluable. A catalog that can express arbitrary logic is a catalog that can
   * express a bug, and it is the trust root (H3d: typed primitives, never scripts).
   *
   * @returns {{gate: string, message: string}[]}
   */
  checkPreconditions(capability) {
    const requires = capability.requires;
    if (!requires) return [];

    const probe = this.probe();
    /** Named facts a precondition may test. Add to this list, never to the catalog's grammar. */
    const FACTS = {
      // "Is this machine routing?" - the fact that separates "something is wrong with the network"
      // from "a user has read something on the internet".
      machineOnline: () => Boolean(probe.online),
    };

    const failures = [];
    for (const [fact, expected] of Object.entries(requires)) {
      const read = FACTS[fact];
      if (!read) {
        // Fail closed. An unknown precondition is a catalog bug, and silently ignoring it would
        // turn a typo into a disabled safety check.
        failures.push({ gate: "precondition", message: `capability "${capability.id}" requires unknown fact "${fact}"` });
        continue;
      }
      const actual = read();
      if (actual !== expected) {
        failures.push({
          gate: "precondition",
          message: capability.requiresExplain?.[fact]
            ?? `${capability.title} is not appropriate here: ${fact} is ${actual}, expected ${expected}`,
        });
      }
    }
    return failures;
  }

  /** @returns {ConsentToken} */
  mintConsentToken(proposal) {
    // audit:false - the broker re-checking its own work. The caller's validate() already logged
    // any refusal; a second record here would double-count one user-visible event.
    const validation = this.validate(proposal, { audit: false });
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
    // audit:false - refuse() below writes this path's record, with the consent token id on it.
    const validation = this.validate(proposal, { audit: false });
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
      const { message, detail } = await this.executors[capability.id](proposal.parameters ?? {});
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
