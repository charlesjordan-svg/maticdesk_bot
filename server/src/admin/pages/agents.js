// @ts-check
/**
 * Agents: device enrollment, real since B3 (2026-09-10). Three things on one page: the pending
 * queue, the device list with bulk revoke, and the enrollment secret(s) that guard `POST /v1/enroll`
 * — plus the per-tenant auto-approve toggle (D80) that decides whether the queue is where a device
 * lands or just where it is recorded having passed through.
 *
 * ===============================================================================================
 * WHAT THIS PAGE DOES NOT CLAIM
 * ===============================================================================================
 *
 * A device on this page is KNOWN to the tenant — it presented a valid enrollment secret once. It is
 * not AUTHENTICATED on every subsequent call: that is D61's signed-assertion-for-a-token exchange,
 * which needs D60/D64's TPM-backed key in broker custody reached over the named-pipe transport
 * (designed, not built — D200/D201), and is the next slice, not this one. `src/devices/enrollment.js`
 * and `server/docs/B3-DEVICE-ENROLLMENT.md` say this at more length; the `notYet()` block below says
 * it here, where an operator reading this screen will actually look.
 *
 * NO BULK-REVOKE JAVASCRIPT. Each device row is a checkbox with its OWN NAME (`device_<id>`), not a
 * shared `name="deviceIds"` — `src/admin/router.js`'s form parser keeps only the LAST value for a
 * repeated key (`Object.fromEntries` over `URLSearchParams`), so a shared name would silently
 * revoke one device no matter how many were checked. Distinct names sidestep that without adding a
 * multi-value form parser for one page (same reasoning as the KB editor's one-line-per-array-entry
 * fields, D230).
 */
import { html, notYet, stat, empty, when, ago, csrfField, limit } from "../html.js";
import { route } from "../route.js";
import {
  listPendingRequests, listDevices, approveEnrollment, rejectEnrollment, revokeDevices,
  setAutoApprove, autoApproveSetting, listEnrollmentSecrets, createEnrollmentSecret, revokeEnrollmentSecret,
} from "../../devices/enrollment.js";

const canManage = (ctx) => ctx.permissions.has("agents.manage");

// ---- rendering ------------------------------------------------------------------------------------

function autoApproveForm(ctx, enabled) {
  if (!canManage(ctx)) {
    return html`<p class="muted">Auto-approve is <strong>${enabled ? "on" : "off"}</strong>. Your role can read this but not change it (<span class="mono">agents.manage</span>).</p>`;
  }
  return html`
<form method="post" action="/admin/agents/auto-approve">
  ${csrfField(ctx.csrf)}
  <input type="hidden" name="enabled" value="${enabled ? "" : "1"}">
  <p class="muted">Auto-approve is <strong>${enabled ? "on" : "off"}</strong> — a new device
    ${enabled ? "joins immediately once its secret checks out" : "waits in the queue below for an admin"}.
    <button class="link" type="submit">Turn it ${enabled ? "off" : "on"}</button></p>
</form>`;
}

function pendingTable(ctx, pending) {
  if (!pending.length) return empty("No enrollment requests are waiting.");
  return html`<table>
    <thead><tr><th>Device</th><th>Requested</th><th></th></tr></thead>
    <tbody>${pending.map((p) => html`<tr>
      <td class="mono">${p.deviceKeyId}</td>
      <td>${when(p.requestedAt)} <span class="muted">(${ago(p.requestedAt)})</span></td>
      <td>${canManage(ctx) ? html`
        <form class="inline" method="post" action="/admin/agents/${p.id}/approve">${csrfField(ctx.csrf)}<button class="primary" type="submit">Approve</button></form>
        <form class="inline" method="post" action="/admin/agents/${p.id}/reject">${csrfField(ctx.csrf)}<button type="submit">Reject</button></form>`
        : ""}</td>
    </tr>`)}</tbody>
  </table>`;
}

function devicesTable(ctx, devices) {
  if (!devices.length) return empty("No device has enrolled yet.");
  const manage = canManage(ctx);
  return html`
<form method="post" action="/admin/agents/revoke">
  ${csrfField(ctx.csrf)}
  <table>
    <thead><tr>${manage ? html`<th></th>` : ""}<th>Device</th><th>Mode</th><th>Status</th><th>Enrolled</th><th>Last seen</th></tr></thead>
    <tbody>${devices.map((d) => html`<tr>
      ${manage ? html`<td>${d.status !== "revoked" ? html`<input type="checkbox" name="device_${d.id}" value="1">` : ""}</td>` : ""}
      <td class="mono">${d.deviceKeyId}</td>
      <td>${d.mode}</td>
      <td><span class="pill ${d.status === "active" ? "open" : d.status === "revoked" ? "closed" : ""}">${d.status}</span></td>
      <td>${when(d.enrolledAt)}</td>
      <td>${d.lastSeenAt ? html`${when(d.lastSeenAt)} <span class="muted">(${ago(d.lastSeenAt)})</span>` : html`<span class="muted">never</span>`}</td>
    </tr>`)}</tbody>
  </table>
  ${manage && devices.some((d) => d.status !== "revoked") ? html`<div class="row" style="margin-top:10px"><button type="submit">Revoke selected</button><span class="muted" style="font-size:13px">Bulk, by batch (D83a) — a row with no checkbox is already revoked.</span></div>` : ""}
</form>`;
}

function secretsPanel(ctx, secrets, freshSecret) {
  return html`
<div class="panel">
  <h2>Enrollment secrets<span class="count">${secrets.length}</span></h2>
  <p class="muted">What a device presents, alongside its own key, to prove it belongs to this tenant (D81). Rotatable: minting a new one does not revoke the old, so a rollout can hand out the new secret before the old expires.</p>
  ${freshSecret ? html`<div class="flash"><strong>New secret — shown once, then never again:</strong>
    <div class="mono" style="margin-top:6px;font-size:15px;word-break:break-all">${freshSecret.secret}</div>
    <p class="hint" style="margin-top:6px">Expires ${when(freshSecret.expiresAt)}. Put it in the device's install-time configuration (D82) — never in the installer binary.</p></div>` : ""}
  ${secrets.length ? html`<table>
    <thead><tr><th>Issued</th><th>Expires</th><th>State</th><th></th></tr></thead>
    <tbody>${secrets.map((s) => html`<tr>
      <td>${when(s.issuedAt)}</td>
      <td>${when(s.expiresAt)}</td>
      <td>${s.revokedAt ? html`<span class="pill closed">revoked</span>` : s.live ? html`<span class="pill open">live</span>` : html`<span class="pill">expired</span>`}</td>
      <td>${canManage(ctx) && s.live ? html`<form class="inline" method="post" action="/admin/agents/secrets/${s.id}/revoke">${csrfField(ctx.csrf)}<button class="link" type="submit">Revoke</button></form>` : ""}</td>
    </tr>`)}</tbody>
  </table>` : empty("No enrollment secret has ever been minted for this tenant. No device can enroll until one exists.")}
  ${canManage(ctx) ? html`
  <form method="post" action="/admin/agents/secrets/new" style="margin-top:12px">
    ${csrfField(ctx.csrf)}
    <label for="ttlDays">New secret, valid for</label>
    <div class="row">
      <input id="ttlDays" name="ttlDays" type="text" value="30" style="max-width:80px"> <span class="muted">days</span>
      <button class="primary" type="submit">Mint a new secret</button>
    </div>
  </form>` : ""}
</div>`;
}

async function renderAgents(ctx, { freshSecret = null, notice = null } = {}) {
  const tenantId = ctx.tenant.id;
  const [pending, devices, autoApprove, secrets] = await Promise.all([
    listPendingRequests({ tenantId }),
    listDevices({ tenantId }),
    autoApproveSetting({ tenantId }),
    listEnrollmentSecrets({ tenantId }),
  ]);
  const active = devices.filter((d) => d.status === "active").length;
  const revoked = devices.filter((d) => d.status === "revoked").length;

  const body = html`
<h1>Agents</h1>
<p class="lede">The endpoints enrolled with this tenant, the ones waiting for approval, and the secret that lets a new one ask (B3).</p>
${notice ? html`<div class="flash">${notice}</div>` : ""}

<div class="grid">
  ${stat(pending.length, "waiting for approval", null)}
  ${stat(active, "active devices", null)}
  ${stat(revoked, "revoked", null)}
</div>

<div class="panel">
  <h2>Pending requests<span class="count">${pending.length}</span></h2>
  ${autoApproveForm(ctx, autoApprove)}
  ${pendingTable(ctx, pending)}
</div>

<div class="panel">
  <h2>Devices<span class="count">${devices.length}</span></h2>
  ${devicesTable(ctx, devices)}
</div>

${secretsPanel(ctx, secrets, freshSecret)}

${notYet({
  heading: "Nothing here is authenticated yet",
  missing: "A device on this page is KNOWN to the tenant. Nothing checks that a request claiming to be one of these devices actually holds the key that enrolled it.",
  why: "That check is D61's job: a signed assertion exchanged for a short-lived access token, from a TPM-backed key in broker custody (D60/D64/D146). The custody chain needs the named-pipe transport between the agent and a LocalSystem broker, which is designed and not built (D200/D201) — building real device authentication here would mean building that transport first. This pass built the enrollment mechanism the phase-1 plan's B3 row actually names: the pending queue, auto-approve with this toggle, the rotatable secret above, rate limiting with a fallback to the queue on a burst (D83), and bulk revocation.",
  arrives: "the token exchange, after the pipe transport (D200/D201) is built",
})}`;
  await ctx.render(200, body, { title: "Agents", current: "/admin/agents" });
}

// ---- routes ------------------------------------------------------------------------------------

async function agentsPage(ctx) {
  await renderAgents(ctx);
}

async function autoApprovePost(ctx) {
  const enabled = ctx.form.enabled === "1";
  await setAutoApprove({ tenantId: ctx.tenant.id, enabled });
  await ctx.audit("device.auto_approve.set", { detail: { enabled } });
  await renderAgents(ctx, { notice: `Auto-approve is now ${enabled ? "ON" : "OFF"}.` });
}

async function approvePost(ctx) {
  const requestId = ctx.params?.id ?? "";
  const r = await approveEnrollment({ tenantId: ctx.tenant.id, requestId, decidedBy: ctx.user.id });
  if (!r) return renderAgents(ctx, { notice: "That request is no longer pending — someone else may have already decided it." });
  await ctx.audit("device.enroll.approve", { subject: r.deviceKeyId, detail: { requestId, deviceId: r.deviceId } });
  await renderAgents(ctx, { notice: `Approved ${r.deviceKeyId}.` });
}

async function rejectPost(ctx) {
  const requestId = ctx.params?.id ?? "";
  const r = await rejectEnrollment({ tenantId: ctx.tenant.id, requestId, decidedBy: ctx.user.id });
  if (!r) return renderAgents(ctx, { notice: "That request is no longer pending — someone else may have already decided it." });
  await ctx.audit("device.enroll.reject", { subject: r.deviceKeyId, detail: { requestId, deviceId: r.deviceId } });
  await renderAgents(ctx, { notice: `Rejected ${r.deviceKeyId}.` });
}

async function revokePost(ctx) {
  const ids = Object.keys(ctx.form)
    .filter((k) => k.startsWith("device_") && ctx.form[k] === "1")
    .map((k) => k.slice("device_".length));
  if (!ids.length) return renderAgents(ctx, { notice: "Nothing was checked — nothing was revoked." });
  const n = await revokeDevices({ tenantId: ctx.tenant.id, deviceIds: ids });
  await ctx.audit("device.revoke", { detail: { count: n, deviceIds: ids } });
  await renderAgents(ctx, { notice: `Revoked ${n} device(s).` });
}

async function newSecretPost(ctx) {
  const ttlDays = Math.min(Math.max(Number(ctx.form.ttlDays) || 30, 1), 365);
  const s = await createEnrollmentSecret({ tenantId: ctx.tenant.id, ttlDays });
  await ctx.audit("device.secret.create", { subject: s.id, detail: { ttlDays, expiresAt: s.expiresAt } });
  await renderAgents(ctx, { freshSecret: s });
}

async function revokeSecretPost(ctx) {
  const id = ctx.params?.id ?? "";
  const ok = await revokeEnrollmentSecret({ tenantId: ctx.tenant.id, id });
  await ctx.audit("device.secret.revoke", { subject: id, detail: { revoked: ok } });
  await renderAgents(ctx, { notice: ok ? "Secret revoked." : "That secret was already revoked, or does not belong to this tenant." });
}

export const agentsRoutes = [
  route("GET", /^\/admin\/agents\/?$/, "agents.read", agentsPage),
  route("POST", /^\/admin\/agents\/auto-approve\/?$/, "agents.manage", autoApprovePost),
  route("POST", /^\/admin\/agents\/(?<id>[^/]+)\/approve\/?$/, "agents.manage", approvePost),
  route("POST", /^\/admin\/agents\/(?<id>[^/]+)\/reject\/?$/, "agents.manage", rejectPost),
  route("POST", /^\/admin\/agents\/revoke\/?$/, "agents.manage", revokePost),
  route("POST", /^\/admin\/agents\/secrets\/new\/?$/, "agents.manage", newSecretPost),
  route("POST", /^\/admin\/agents\/secrets\/(?<id>[^/]+)\/revoke\/?$/, "agents.manage", revokeSecretPost),
];
