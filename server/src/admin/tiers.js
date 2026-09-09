// @ts-check
/**
 * D154's three transcript tiers, as code the query layer consults BEFORE any transcript exists.
 *
 * The handover (§1) asked for this to be built into the query layer now, "far harder to add once
 * screens read freely", and the register calls it a legal exposure in jurisdictions requiring
 * employee notice, not only a security control. There is no transcript storage in this build —
 * `sessions` has no content column (B1-CONTROL-PLANE.md §11) and the endpoint creates no sessions
 * at all — so today this module gates nothing that exists. It exists so that the first screen to
 * read a transcript has to call `transcriptAccess()` and cannot be written without answering the
 * question, and so that exit criterion 4's test has a function to try.
 *
 *   aggregate    metrics over sessions, any admin with metrics.read. Aggregate is not audience.
 *   escalated    the transcript of a session that produced a ticket: the ticket's assignee and the
 *                tenant admin/owner.
 *   unescalated  the transcript of a session that produced no ticket: NOBODY. It was addressed to
 *                the avatar alone. Not the owner, not vendor staff, not break-glass — D154's text
 *                allows "a loudly-audited break-glass event" and this build has no such event, so
 *                the answer here is no, not "no unless".
 *
 * What is DELIBERATELY NOT a tier: a declined question in control.kb_retrieval_log. The founder
 * decided on 2026-09-09 (D223) that a gap record is not a transcript: it is a single question the
 * bot could not answer, logged for D177's review queue, and readable by any admin with review.read.
 * That decision is recorded in the register, not here; this module is the place D154 is enforced
 * and D223 is the place its boundary is drawn.
 */

/** @typedef {"aggregate" | "escalated" | "unescalated"} TranscriptTier */

/**
 * @param {{ escalated: boolean } | null | undefined} session  whether the session produced a ticket
 * @returns {TranscriptTier}
 */
export function tierOf(session) {
  if (!session) return "unescalated";
  return session.escalated ? "escalated" : "unescalated";
}

/**
 * May this principal read this session's transcript?
 *
 * @param {{
 *   tier: TranscriptTier,
 *   permissions: Set<string>|string[],
 *   isAssignee?: boolean,
 *   isTenantAdmin?: boolean,
 * }} q
 * @returns {{ allowed: boolean, why: string }}
 */
export function transcriptAccess({ tier, permissions, isAssignee = false, isTenantAdmin = false }) {
  const has = (p) => (permissions instanceof Set ? permissions.has(p) : permissions.includes(p));
  switch (tier) {
    case "aggregate":
      return has("metrics.read")
        ? { allowed: true, why: "aggregate metrics are open to any admin with metrics.read (D154 tier 1)" }
        : { allowed: false, why: "metrics.read is required for aggregate figures" };
    case "escalated":
      if (isAssignee) return { allowed: true, why: "the ticket's assignee may read the escalated session (D154 tier 2)" };
      if (isTenantAdmin) return { allowed: true, why: "a tenant admin may read an escalated session (D154 tier 2)" };
      return { allowed: false, why: "an escalated session's transcript is for its assignee and the tenant admin only (D154)" };
    case "unescalated":
      return { allowed: false, why: "an unescalated session was addressed to the avatar alone; nobody reads it (D154 tier 3)" };
    default:
      return { allowed: false, why: `unknown tier ${JSON.stringify(tier)}` };
  }
}
