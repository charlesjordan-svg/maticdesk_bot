/**
 * THE BROKER CONTRACT.
 *
 * This is the seam between the unprivileged agent half (model client, router, UI) and the
 * privileged half (the four Win32 primitives). Everything privileged goes through here.
 *
 * Demo build ships `InProcessBroker` (single elevated process).
 * Phase 1 ships `NamedPipeBroker` (unprivileged agent -> named pipe -> Windows Service).
 * Both implement this interface. Call sites do not change. If you find yourself importing
 * anything from broker/win32/ or broker/capabilities/ outside of an implementation of this
 * interface, that is the refactor-to-a-rewrite bug this file exists to prevent.
 */

/** Risk tier. R1: reversible/idempotent. R2: user-visible disruption, rollback plan mandatory. */
export type Tier = "R1" | "R2";

export interface Capability {
  id: string;
  tier: Tier;
  title: string;
  /** Shown to the user in the consent prompt. Plain language, no jargon. */
  description: string;
  /** JSON Schema. Parameters are ALWAYS schema-constrained - never freeform strings. */
  parameters: object;
  /** Capability id to invoke to undo this, or null if inherently idempotent. */
  rollback: string | null;
  /** Native APIs this capability touches. Feeds docs/BROKER-SURFACE.md (the allowlisting doc). */
  apis: string[];
}

/** What the model produced. Data, never a command. The model proposes; it never executes. */
export interface Proposal {
  capabilityId: string;
  parameters: Record<string, unknown>;
  reasoning: string;
  confidence: number;
  /**
   * "tier0"       = local deterministic router, matched on what the user said.
   * "tier0-state" = local fallback that matched nothing the user said and proposed from observed
   *                 machine state alone, because the cloud was not reachable either.
   * "cloud"       = Anthropic API.
   * "local"       = a model on an OpenAI-compatible endpoint - Ollama, LM Studio, vLLM, or the
   *                 customer’s own. Distinct from "cloud" because it says something different
   *                 about where the sentence went, which is the question a security review asks.
   */
  source: "tier0" | "tier0-state" | "cloud" | "local";
}

/** Which check refused a proposal. Ordered as they run; the first to fire is the reason. */
export type Gate =
  /** Not a capability this build has loaded and implemented. */
  | "catalog"
  /** Parameters failed the catalog JSON Schema - the gate that stops string injection. */
  | "schema"
  /** A tier rule was violated (R2 with no rollback is a catalog bug). */
  | "tier-policy"
  /** An explicit refusal string in catalog.policy - e.g. dnscache cannot be stopped. */
  | "policy-blocklist"
  /** Derived from a live read of this machine, not from the catalog. */
  | "machine-state"
  /**
   * A catalog-declared precondition on observed machine state (`requires.*`) did not hold - also
   * derived from the live probe, but declared as data in the catalog rather than coded in
   * checkPolicy(). In use since 2026-09-02; listed here since 2026-09-03 (it was missing).
   */
  | "precondition"
  /**
   * The consent nonce was unknown, expired, already used, or superseded (D130). Ordered last - it is
   * the only gate that fires after a user gesture.
   */
  | "consent";

export interface ValidationFailure {
  gate: Gate;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  /** Populated only when ok === false. User-facing, honest about the real reason. */
  errors: string[];
  /** Resolved capability, present only when ok === true. */
  capability?: Capability;
  /** The gate that decided the refusal. Present only when ok === false. */
  gate?: Gate;
  /** Every failure, each attributed to its gate. Present only when ok === false. */
  reasons?: ValidationFailure[];
  /**
   * Audit record written for this refusal. Present only when ok === false and the caller did not
   * opt out. A refusal is audited even though nothing was attempted and no token exists: a trail
   * that records only what ran is one-sided, and denied attempts are where attacks and
   * misconfigurations surface first.
   */
  auditId?: string;
}

/**
 * One line of audit/audit.jsonl. Append-only JSONL; readers must tolerate unknown fields.
 *
 * `outcome` is the discriminator:
 *   "refused" - nothing was attempted. Written by validate() (pre-consent, `gate` set,
 *               `consentTokenId` null); by execute() when the nonce did not check out
 *               (`gate: "consent"`) or when re-validation of the retained proposal failed
 *               (`gate` = whichever gate fired); and by prepareConsent() when it supersedes an
 *               outstanding request (`gate: "consent"`, message says so).
 *   "success" - the capability ran and returned.
 *   "failed"  - it ran and threw.
 *   "denied"  - it threw ERROR_ACCESS_DENIED, i.e. this needs the privileged broker (§12).
 */
export interface AuditRecord {
  auditId: string;
  /** ISO 8601. */
  at: string;
  capabilityId: string | null;
  parameters: Record<string, unknown> | null;
  /**
   * Id of the token the broker minted internally at execution time (D130). Null whenever the
   * decision was made before one existed - every refusal, including consent-gate refusals.
   */
  consentTokenId: string | null;
  /** The nonce this record is about (D130). Ties the record to one specific rendering. */
  consentNonce?: string | null;
  /**
   * What the BROKER rendered for that nonce - not what the agent claims it drew (D130). On a
   * consent-gate refusal this is the rendering for the presented nonce if the broker still knows it,
   * otherwise the rendering of the request outstanding at the time: the card on screen at the click.
   * This is the field that lets a post-incident review show that the displayed text and the executed
   * action disagreed, which before D130 was unknowable.
   */
  consentRendered?: ConsentRequest["rendered"] | null;
  outcome: "success" | "failed" | "denied" | "refused";
  /** Refusals only: which gate fired. Absent on success / failed / denied records. */
  gate?: Gate;
  /** Refusals from validation only: every failure, attributed. */
  reasons?: ValidationFailure[];
  /** Pre-consent refusals only: where the proposal came from. */
  source?: Proposal["source"] | null;
  tier?: Tier | null;
  message?: string;
  durationMs?: number;
  detail?: Record<string, unknown>;
  error?: { message: string; code: number | null; call: string | null };
}

/**
 * INTERNAL TO THE BROKER since D130 (2026-09-03). Minted at step 2 for the proposal the broker
 * retained, immediately before execution; recorded as `AuditRecord.consentTokenId` so the trail
 * shape is unchanged. It never crosses the boundary any more - the agent holds a nonce, never a
 * token, and never a proposal at approval time.
 */
export interface ConsentToken {
  id: string;
  proposalHash: string;
  issuedAt: number;
  expiresAt: number;
}

/**
 * Step 1 of consent (D130). The only thing the agent holds between "show the card" and "the user
 * clicked". Built by the broker from the signed catalog's `plain/*` and `tiers/*`; the agent MUST
 * display `rendered` verbatim and MUST NOT construct consent text of its own.
 */
export interface ConsentRequest {
  /** Single-use, unguessable (UUID v4), short-lived (120 s). */
  nonce: string;
  /** Exactly what must appear on screen. */
  rendered: {
    /** The locale the broker actually rendered in, after fallback. Today always "en". */
    locale: string;
    /** "Permission needed — Low risk". Tier label is broker-authored, not catalog text. */
    title: string;
    /** catalog plain.what */
    what: string;
    /** "flush_dns()" - capabilityId(param=value), built from the VALIDATED parameters. */
    detail: string;
    /** Present when capability.rollback !== null. R2 wording is a warning. */
    rollbackNote: string | null;
    /** catalog plain.notice - what the user will notice. */
    notice: string | null;
    /** catalog plain.undo - can it be undone. */
    undo: string | null;
    /** catalog plain.why - why it usually helps. */
    why: string | null;
    /** "Low risk. Affects one thing, and can be undone." - tier label and summary. */
    risk: string | null;
  };
  /** Epoch ms. Same 120 s window the old ConsentToken used. */
  expiresAt: number;
  /** For the agent's own logging only. Not required at execute time. */
  capabilityId: string;
  tier: Tier;
  /** Same as rendered.locale; surfaced so a caller can log it without opening `rendered`. */
  locale: string;
}

export interface ExecutionResult {
  ok: boolean;
  capabilityId: string;
  /** Human-readable outcome for the transcript. Never fabricated - see §13. */
  message: string;
  /** Machine detail: Win32 error codes, service states, timings. */
  detail: Record<string, unknown>;
  /** True when the failure was ERROR_ACCESS_DENIED, i.e. "this needs the broker" (§12). */
  needsBroker: boolean;
  /** Capability id that can undo this, if it succeeded and is undoable. */
  rollbackWith: string | null;
  auditId: string;
}

/**
 * THE TWO-STEP CONSENT CONTRACT - D130, designed and implemented 2026-09-03.
 *
 * Design: `client/docs/2026-09-03-consent-protocol-design.md`. Attack notes written before
 * implementing it: `client/docs/2026-09-03-consent-protocol-attack-notes.md`. The demonstration it
 * answers: `client/docs/CONSENT-SURFACE-2026-09-03.md` (an agent could show one card and send a
 * different proposal down the pipe). Acceptance: `client/test/consent-surface.test.mjs`.
 *
 * The rule: THE BROKER EXECUTES ONLY WHAT IT RENDERED. The agent receives a nonce and the rendered
 * text, displays the text, and at approval time sends the nonce back. It never sends a proposal at
 * approval time, so there is no second proposal to swap. What it cannot be stopped from doing is
 * painting different pixels than the text it was handed (design §5); after D130 that lie is
 * attributable, because `AuditRecord.consentRendered` says what the privileged half rendered.
 *
 * This shape is what the NamedPipeBroker protocol must serialise: two calls, not one. Both
 * InProcessBroker and NamedPipeBroker implement it.
 */
export interface Broker {
  listCapabilities(): Capability[];
  /**
   * Schema + policy + tier + live machine state. Runs BEFORE any consent prompt is shown.
   * A refusal is audited. `audit: false` is for an implementation re-checking its own work,
   * so one user-visible refusal does not produce two records.
   */
  validate(proposal: Proposal, opts?: { audit?: boolean }): ValidationResult;
  /**
   * Step 1. Re-validates (audit:false - the caller's validate() already logged any refusal),
   * renders the consent text ITSELF from the signed catalog, and RETAINS A COPY of the proposal
   * against a single-use nonce. Throws on an invalid proposal, exactly as mintConsentToken did.
   *
   * One outstanding ConsentRequest per session: a new call supersedes any outstanding one, burns its
   * nonce, and audits the supersession (`gate: "consent"`), so a card replaced under the user's eyes
   * leaves a trace. `locale` is required; an unknown locale falls back to the catalog's language and
   * the request says which was used.
   */
  prepareConsent(proposal: Proposal, opts: { locale: string }): ConsentRequest;
  /**
   * Step 2. The user approved. Looks up the retained proposal, BURNS THE NONCE FIRST, re-validates
   * against live machine state, mints its own token internally, and runs THE PROPOSAL IT RETAINED.
   * Nothing the agent sends here can change what runs. A refusal - unknown, expired, replayed or
   * superseded nonce, or a re-validation failure - is audited with `consentNonce` and
   * `consentRendered`.
   */
  execute(nonce: string): Promise<ExecutionResult>;
}
