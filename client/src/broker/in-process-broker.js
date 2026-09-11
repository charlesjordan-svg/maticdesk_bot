// @ts-check
/**
 * InProcessBroker - the demo build's Broker implementation (see broker.d.ts).
 *
 * Runs inside the single elevated process. Phase 1 replaces this class with NamedPipeBroker,
 * which serialises the same Proposal / ConsentRequest / ExecutionResult objects across a pipe to
 * a Windows Service. Because callers only ever touch the interface, that swap is a constructor
 * change at the wiring site - nothing else moves.
 *
 * Consent is the two-step exchange of D130 (2026-09-03): prepareConsent() renders and retains,
 * execute(nonce) runs what was retained. See broker.d.ts and
 * docs/2026-09-03-consent-protocol-attack-notes.md for why each line of that path is where it is.
 *
 * @typedef {import("./broker.d.ts").Proposal} Proposal
 * @typedef {import("./broker.d.ts").Capability} Capability
 * @typedef {import("./broker.d.ts").ValidationResult} ValidationResult
 * @typedef {import("./broker.d.ts").ConsentToken} ConsentToken
 * @typedef {import("./broker.d.ts").ConsentRequest} ConsentRequest
 * @typedef {import("./broker.d.ts").ExecutionResult} ExecutionResult
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { EXECUTORS, probeMachine } from "./capabilities/index.js";
import { validateAgainstSchema } from "./schema.js";
import { AuditLog } from "./audit.js";

/** How long a rendered card stays approvable. Unchanged from the pre-D130 ConsentToken. */
const CONSENT_TTL_MS = 120000;
/**
 * How long a burned, expired or superseded nonce stays KNOWN after it expires. A late or replayed
 * click is then refused with the text it was rendered for, rather than as an unknown nonce (attack
 * notes F6). Bounds memory: one outstanding request plus a ten-minute tail.
 */
const CONSENT_RETAIN_MS = 10 * 60 * 1000;
/** The languages the signed catalog carries. One, today. Anything else falls back (attack notes F4). */
const CATALOG_LOCALES = new Set(["en"]);
const FALLBACK_LOCALE = "en";

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
   *   all the way through prepare -> execute -> audit WITHOUT resetting an adapter on the box
   *   running the test. Production passes nothing and gets the real Win32 primitives.
   * @param clock Injectable ONLY so the 120 s consent window can be tested without waiting 120 s.
   *   Production passes nothing and gets Date.now.
   */
  constructor({ catalogPath, auditPath, probe = probeMachine, executors = EXECUTORS, clock = Date.now, onLog = () => {} }) {
    this.onLog = onLog;
    this.probe = probe;
    this.executors = executors;
    this.clock = clock;
    this.catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
    this.verifyCatalogSignature();
    // Attach the plain-language risk label to each capability so the consent prompt can show it
    // without shipping the whole catalog to the renderer. Presentation only - nothing here is
    // consulted by validate() or execute().
    for (const c of this.catalog.capabilities) c.tierInfo = this.catalog.tiers?.[c.tier] ?? null;
    this.audit = new AuditLog(auditPath, { onLog });
    /**
     * Every consent request this broker has rendered and still remembers, by nonce. The proposal
     * stored here is a COPY - the agent's own object is never retained (attack notes F1).
     * @type {Map<string, {proposal: Proposal, capability: Capability, rendered: ConsentRequest["rendered"], issuedAt: number, expiresAt: number, used: boolean, superseded: boolean}>}
     */
    this.consents = new Map();
    /** The one request that may currently be approved. Null when none is outstanding. */
    this.outstanding = null;
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
   *   (prepareConsent, execute), so one refusal is not logged twice under two different gates.
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

  // ---- consent: the two-step exchange of D130 ----------------------------------------------------

  /**
   * Step 1. Validate, render, retain, hand back a nonce.
   *
   * Throws on an invalid proposal, exactly as mintConsentToken() did: the caller's own validate()
   * already audited the refusal, so this re-check runs with audit:false.
   *
   * @param {Proposal} proposal
   * @param {{locale: string}} opts
   * @returns {ConsentRequest}
   */
  prepareConsent(proposal, opts) {
    const locale = opts?.locale;
    if (typeof locale !== "string" || locale.length === 0) {
      throw new TypeError("prepareConsent requires opts.locale (design rule 5 - localisation is a catalog-signing event, and the parameter is taken now so the contract does not change later)");
    }
    const validation = this.validate(proposal, { audit: false });
    if (!validation.ok) {
      throw new Error(`refusing to prepare consent for an invalid proposal: ${validation.errors.join("; ")}`);
    }
    const capability = /** @type {Capability} */ (validation.capability);

    // A COPY. In this build the agent still holds a reference to the object it passed in; if the
    // broker kept that object, the agent could change the parameters after the card was rendered
    // and before the click (attack notes F1). The pipe build gets this for free; here it is the
    // difference between a guarantee and a convention.
    const retained = structuredClone(proposal);
    // Validate THEN render: `detail` prints parameter values, and they are safe to print only
    // because the schema, blocklist and live-state checks have already accepted them (F4).
    const rendered = this.renderConsent(capability, retained, locale);

    const now = this.clock();
    // One outstanding request per session (design rule 3). A new request supersedes the old one
    // and says so in the trail - see supersedeOutstanding() for why supersede rather than refuse.
    this.supersedeOutstanding(`a new consent request for ${capability.id}`);
    this.pruneConsents(now);

    const nonce = randomUUID();
    const expiresAt = now + CONSENT_TTL_MS;
    this.consents.set(nonce, { proposal: retained, capability, rendered, issuedAt: now, expiresAt, used: false, superseded: false });
    this.outstanding = nonce;

    /** @type {ConsentRequest} */
    const request = { nonce, rendered, expiresAt, capabilityId: capability.id, tier: capability.tier, locale: rendered.locale };
    // Another copy on the way out: the agent may do what it likes with its copy of `rendered`;
    // the one that goes into the audit record is the broker's.
    return structuredClone(request);
  }

  /**
   * The consent text, built here and nowhere else (design rule 1). Everything user-facing comes
   * from the signed catalog's `plain/*` and `tiers/*`; the tier label and the rollback sentence
   * are broker-authored. The renderer paints this verbatim and reads nothing from the catalog.
   *
   * @param {Capability} capability
   * @param {Proposal} proposal already validated
   * @param {string} locale requested
   * @returns {ConsentRequest["rendered"]}
   */
  renderConsent(capability, proposal, locale) {
    // The catalog is signed in one language. An unknown locale cannot select different text, so
    // it falls back, and the request records the locale actually used (attack notes F4).
    const used = CATALOG_LOCALES.has(locale) ? locale : FALLBACK_LOCALE;
    const tierInfo = this.catalog.tiers?.[capability.tier] ?? null;
    const plain = capability.plain ?? {};
    const params = Object.entries(proposal.parameters ?? {}).map(([k, v]) => `${k}=${v}`).join(", ");

    let rollbackNote = null;
    if (capability.rollback !== null && capability.rollback !== undefined) {
      // `capability.rollback` IS A CAPABILITY ID and this sentence is on the consent card, so the
      // card said "this can be undone with: restart_service" (D247). Resolved to that capability's
      // own title, which is catalog data and is already what the assistant says out loud when it
      // proposes one. An id with no capability behind it falls back to itself rather than to
      // silence - the honest fallback, and `validate()` would have refused the proposal first.
      const undoneBy = this.catalog.capabilities?.find((c) => c.id === capability.rollback)?.title ?? capability.rollback;
      rollbackNote = capability.tier === "R2"
        ? `This is disruptive. If it goes wrong, the rollback is: ${undoneBy}.`
        : `If needed, this can be undone with: ${undoneBy}.`;
    }

    return {
      locale: used,
      // "tier R1" means nothing to the person being asked to approve. Say what the risk IS.
      title: tierInfo ? `Permission needed — ${tierInfo.label}` : `Permission needed — tier ${capability.tier}`,
      // The catalog's `description` is written for an engineer; `plain.what` is the same fact for
      // the person whose machine it is.
      what: plain.what ?? capability.description,
      detail: `${capability.id}(${params})`,
      rollbackNote,
      notice: plain.notice ?? null,
      undo: plain.undo ?? null,
      why: plain.why ?? null,
      risk: tierInfo ? `${tierInfo.label}. ${tierInfo.summary}` : null,
    };
  }

  /**
   * Burn the outstanding request, if any, and record that it was never decided.
   *
   * Why supersede rather than refuse the second call (attack notes F2): refusing would block the
   * honest path - a user who clicks Deny and types another complaint inside two minutes would be
   * refused, because there is no cancel in the contract. Neither choice stops a compromised agent
   * from painting one card and approving another; that is design §5. Superseding at least leaves
   * the forensic signature of it in the trail: X rendered, X superseded, Y rendered, Y run, all
   * within a few hundred milliseconds.
   *
   * @param {string} because
   */
  supersedeOutstanding(because) {
    const nonce = this.outstanding;
    this.outstanding = null;
    if (!nonce) return;
    const record = this.consents.get(nonce);
    if (!record || record.used) return;
    record.used = true;
    record.superseded = true;
    this.audit.recordSync({
      capabilityId: record.proposal.capabilityId,
      parameters: record.proposal.parameters ?? {},
      source: record.proposal.source ?? null,
      tier: record.capability.tier,
      consentTokenId: null,
      consentNonce: nonce,
      consentRendered: record.rendered,
      outcome: "refused",
      gate: "consent",
      message: `consent request superseded by ${because} before any decision reached the broker - nothing was executed`,
    });
  }

  /** Forget nonces that have been unapprovable for longer than CONSENT_RETAIN_MS. */
  pruneConsents(now) {
    for (const [nonce, record] of this.consents) {
      if (now > record.expiresAt + CONSENT_RETAIN_MS && nonce !== this.outstanding) this.consents.delete(nonce);
    }
  }

  /**
   * Step 2. Look up -> BURN -> re-validate -> mint internally -> run THE RETAINED proposal.
   *
   * The order is the design (attack notes F3): burning before anything else means a duplicated
   * approval cannot run twice even if re-validation or the executor is slow, and a concurrent
   * second call sees `used` before this one has awaited anything.
   *
   * @param {string} nonce
   * @returns {Promise<ExecutionResult>}
   */
  async execute(nonce) {
    const now = this.clock();
    const record = typeof nonce === "string" ? this.consents.get(nonce) : undefined;
    // What the user is looking at, for the trail: the presented nonce's own rendering if the
    // broker still knows it, otherwise the outstanding card (attack notes F6).
    const shown = record ?? (this.outstanding ? this.consents.get(this.outstanding) : undefined) ?? null;

    /**
     * A consent-gate refusal: audited with the nonce and the text the user actually saw.
     *
     * TWO STRINGS AGAIN (D247). `message` is spoken by the avatar; `audited` is what goes in the
     * record, and it keeps the protocol's own vocabulary because the record is read by someone
     * asking what the gate did. These said "no consent nonce was presented - nothing was executed"
     * out loud, and the expired case is not exotic: the window is 120 seconds and a user who reads
     * a card carefully will meet it.
     */
    const refuseConsent = async (message, audited) => {
      const auditId = await this.audit.record({
        capabilityId: shown?.proposal.capabilityId ?? null,
        parameters: shown?.proposal.parameters ?? null,
        source: shown?.proposal.source ?? null,
        tier: shown?.capability.tier ?? null,
        consentTokenId: null,
        consentNonce: typeof nonce === "string" ? nonce : null,
        consentRendered: shown?.rendered ?? null,
        outcome: "refused",
        gate: "consent",
        message: audited,
      });
      return {
        ok: false,
        capabilityId: shown?.proposal.capabilityId ?? "unknown",
        message,
        detail: { consent: audited },
        needsBroker: false,
        rollbackWith: null,
        auditId,
      };
    };

    // The FIRST string of each pair is SPOKEN; the SECOND is the audit record's, and it keeps the
    // protocol's own words because that record exists to answer what the gate did.
    if (typeof nonce !== "string" || nonce.length === 0) {
      return refuseConsent("I didn't get your approval back, so I've not changed anything.",
        "no consent nonce was presented - nothing was executed");
    }
    if (!record) {
      return refuseConsent("I can't match that back to something I asked you about, so I've not changed anything.",
        "no consent request was issued for this nonce - nothing was executed");
    }
    if (record.used) {
      return record.superseded
        ? refuseConsent("Something else came up before you answered that one, so I've not changed anything.",
          "this consent request was superseded before it was approved - nothing was executed")
        : refuseConsent("That one has already been answered, and I don't act on the same approval twice. Nothing was changed.",
          "this consent has already been used - nothing was executed");
    }
    if (now > record.expiresAt) {
      record.used = true;
      if (this.outstanding === nonce) this.outstanding = null;
      // NOT EXOTIC: the window is 120 seconds and a user who reads the card properly will meet it.
      return refuseConsent("That request timed out while it was waiting, so I've not changed anything. Ask me again and I'll put it back up.",
        "this consent request has expired - nothing was executed");
    }

    // BURN. Single-use, decided here, before any await.
    record.used = true;
    if (this.outstanding === nonce) this.outstanding = null;

    // The proposal that runs is the one the broker kept. Nothing the agent sent can change it.
    const proposal = record.proposal;

    // Re-validate at execution time: state can change inside the 120 s window - a machine can come
    // back online between render and click, which invalidates reset_adapter's precondition.
    // audit:false - the refusal record below is this path's one record, with the nonce on it.
    const validation = this.validate(proposal, { audit: false });
    if (!validation.ok) {
      // The gate messages name capability ids, adapter GUIDs and control masks; they belong in the
      // record and the inspector, not in a sentence the avatar says (D247).
      const audited = `refused at execution time: ${validation.errors.join("; ")}`;
      const message = "Something about this machine changed while you were deciding, and what I checked before no longer holds — so I've not run it. Ask me again and I'll take a fresh look.";
      const auditId = await this.audit.record({
        capabilityId: proposal.capabilityId,
        parameters: proposal.parameters ?? {},
        source: proposal.source ?? null,
        tier: record.capability.tier,
        consentTokenId: null,
        consentNonce: nonce,
        consentRendered: record.rendered,
        outcome: "refused",
        gate: validation.gate,
        reasons: validation.reasons,
        message: audited,
      });
      return { ok: false, capabilityId: proposal.capabilityId, message, detail: { refusal: audited, reasons: validation.reasons }, needsBroker: false, rollbackWith: null, auditId };
    }
    const capability = /** @type {Capability} */ (validation.capability);

    // The token is minted here, internally, for the retained proposal. It never leaves this
    // process; its id goes on the record so the trail keeps its pre-D130 shape.
    /** @type {ConsentToken} */
    const token = { id: randomUUID(), proposalHash: proposalHash(proposal), issuedAt: now, expiresAt: record.expiresAt };

    const startedAt = this.clock();
    try {
      const { message, detail } = await this.executors[capability.id](proposal.parameters ?? {});
      const auditId = await this.audit.record({
        capabilityId: capability.id,
        parameters: proposal.parameters ?? {},
        consentTokenId: token.id,
        consentNonce: nonce,
        consentRendered: record.rendered,
        tier: capability.tier,
        outcome: "success",
        durationMs: this.clock() - startedAt,
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
      //
      // `message` IS SPOKEN BY THE AVATAR AND `err.message` IS A WIN32 CALL SITE (D247). It reads
      // `OpenServiceW(spooler) failed (Win32 error 5)` — an API name, a registry key and an error
      // number, said out loud to someone whose printer had stopped. The same defect D246 fixed one
      // layer up, and the same fix: the sentence says what happened, and the machine detail goes to
      // `detail`, which the inspector shows and the audit record already kept in full (`error`
      // below, untouched). **Nothing is lost** — `detail.win32` is new and `detail.code`/`.call`
      // were already there. "The privileged broker" went with it: the renderer's note beside this
      // line already says "that needs the privileged half of this application", in the user's words
      // and in the place a system statement belongs.
      //
      // THE needsBroker LINE IS SHORT ON PURPOSE, and the first draft of it was not. The renderer
      // puts a `.turn-note` directly beneath it that already says "that needs the privileged half
      // of this application, which isn't running. Nothing was changed." A spoken line explaining
      // the same thing in different words is D245's defect, and driving the check page is what
      // showed it - it does not read wrong until you see the two together.
      const needsBroker = Boolean(err.needsBroker);
      const message = needsBroker
        ? "I couldn't do that one from here."
        : "I tried that and it didn't work. Nothing on this machine was changed by it.";
      const auditId = await this.audit.record({
        capabilityId: capability.id,
        parameters: proposal.parameters ?? {},
        consentTokenId: token.id,
        consentNonce: nonce,
        consentRendered: record.rendered,
        tier: capability.tier,
        outcome: needsBroker ? "denied" : "failed",
        durationMs: this.clock() - startedAt,
        error: { message: err.message, code: err.code ?? null, call: err.call ?? null },
      });
      return {
        ok: false,
        capabilityId: capability.id,
        message,
        // `win32` is the sentence that used to be spoken. It is the one string that answers "why"
        // and it now goes where that question is asked - the inspector and the developer log.
        detail: { code: err.code ?? null, call: err.call ?? null, win32: err.message },
        needsBroker,
        rollbackWith: null,
        auditId,
      };
    }
  }
}
