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
  | "machine-state";

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
 *               `consentTokenId` null) and by execute() when consent itself did not check out.
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
  /** Null whenever the decision was made before a token existed. */
  consentTokenId: string | null;
  outcome: "success" | "failed" | "denied" | "refused";
  /** Pre-consent refusals only: which gate fired. Absent on execute-path records. */
  gate?: Gate;
  /** Pre-consent refusals only: every failure, attributed. */
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
 * Proof that a specific user consented to a specific proposal. Single-use, short-lived,
 * bound to a hash of the exact proposal it was minted for - so a validated-then-mutated
 * proposal cannot be executed with a token minted for the original.
 */
export interface ConsentToken {
  id: string;
  proposalHash: string;
  issuedAt: number;
  expiresAt: number;
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

export interface Broker {
  listCapabilities(): Capability[];
  /**
   * Schema + policy + tier. Runs BEFORE any consent prompt is shown.
   * A refusal is audited. `audit: false` is for an implementation re-checking its own work,
   * so one user-visible refusal does not produce two records.
   */
  validate(proposal: Proposal, opts?: { audit?: boolean }): ValidationResult;
  mintConsentToken(proposal: Proposal): ConsentToken;
  /** Re-validates and verifies the token before touching the machine. */
  execute(proposal: Proposal, consentToken: ConsentToken): Promise<ExecutionResult>;
}
