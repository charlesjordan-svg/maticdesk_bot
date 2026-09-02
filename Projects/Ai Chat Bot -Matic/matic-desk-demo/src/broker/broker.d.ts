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
   */
  source: "tier0" | "tier0-state" | "cloud";
}

export interface ValidationResult {
  ok: boolean;
  /** Populated only when ok === false. User-facing, honest about the real reason. */
  errors: string[];
  /** Resolved capability, present only when ok === true. */
  capability?: Capability;
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
  /** Schema + policy + tier. Runs BEFORE any consent prompt is shown. */
  validate(proposal: Proposal): ValidationResult;
  mintConsentToken(proposal: Proposal): ConsentToken;
  /** Re-validates and verifies the token before touching the machine. */
  execute(proposal: Proposal, consentToken: ConsentToken): Promise<ExecutionResult>;
}
