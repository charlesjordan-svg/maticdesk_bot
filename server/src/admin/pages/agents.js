// @ts-check
/**
 * Agents: connected devices, pending approvals, the auto-approve setting. NONE OF IT EXISTS.
 *
 * control.devices and control.enrollment_requests are shapes (B1) that nothing populates, because
 * device identity and enrollment are B3 — the review decomposed it at 6–8 engineer-weeks. This page
 * therefore shows NO COUNT. "0 connected agents" would teach the operator the product is broken;
 * "device enrollment is not in this build" is the truth, and it is the same discipline as
 * `x-matic-hub-auth: none` (handover §0, exit criterion 6). There is deliberately no query in
 * this file, and test/admin-static.test.mjs asserts that.
 */
import { html, notYet } from "../html.js";
import { route } from "../route.js";

async function agentsPage(ctx) {
  const body = html`
<h1>Agents</h1>
<p class="lede">The endpoints enrolled with this hub, the ones waiting for approval, and whether approval is automatic.</p>
${notYet({
  heading: "Device enrollment is not in this build",
  missing: "No endpoint can identify itself to this hub, so there is nothing to list, approve or revoke.",
  why: "The hub authenticates no device (D61/D132 not built; every API response says x-matic-hub-auth: none). Enrollment is B3 — a signed device token from a TPM-resident key (D60, D146), a pending queue with auto-approve and a per-tenant toggle, a rotatable time-boxed enrollment secret, rate limiting with fallback to queued approval (D83), and bulk revocation by batch (D83a). The review sized it at six to eight engineer-weeks. The tables exist (control.devices, control.enrollment_requests); nothing writes them, and this page will not show you an empty table as if it were a fleet of zero.",
  arrives: "B3 (device enrollment), after B2",
})}
${notYet({
  heading: "Auto-approve",
  missing: "There is no setting to toggle.",
  why: "Auto-approve is the default the enrollment queue will ship with, falling back to queued approval on anomaly (D83). Without an enrollment endpoint the toggle would set a value nothing reads.",
  arrives: "B3",
})}`;
  await ctx.render(200, body, { title: "Agents" });
}

export const agentsRoutes = [
  route("GET", /^\/admin\/agents\/?$/, "agents.read", agentsPage),
];
