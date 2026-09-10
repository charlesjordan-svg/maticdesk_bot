// @ts-check
/**
 * Settings: the tenant, its admin users and their roles, the role definitions, and the audit log.
 *
 * Read-only in this pass. Creating an admin is `node bin/admin.mjs create-user` — deliberately not
 * a form yet, because the thing a create form hands back (an initial password and a TOTP secret)
 * needs a one-time display and a step-up on the creator (D157 "policy changes", arguably), and
 * neither is built. The page says so and names the command.
 *
 * The audit log is here (settings.audit, permission audit.read) rather than a seventh nav item:
 * the IA has six destinations and the audit is a thing you go to Settings for.
 */
import { html, notYet, when, ago } from "../html.js";
import { listAdminUsers, listRoles } from "../users.js";
import { recentAudit } from "../audit.js";
import { route } from "../route.js";

async function settingsPage(ctx) {
  const [users, roles] = await Promise.all([listAdminUsers(ctx.tenant.id), listRoles()]);
  const tenantRoles = roles.filter((r) => r.scope === "tenant");

  const body = html`
<h1>Settings</h1>
<p class="lede">${ctx.tenant.displayName}</p>

<div class="grid">
  <div class="panel"><h2>Tenant</h2>
    <dl class="kv">
      <dt>Name</dt><dd>${ctx.tenant.displayName}</dd>
      <dt>Slug</dt><dd class="mono">${ctx.tenant.slug}</dd>
      <dt>Schema</dt><dd class="mono">${ctx.tenant.schemaName}</dd>
      <dt>Status</dt><dd>${ctx.tenant.status}</dd>
      <dt>Created</dt><dd>${when(ctx.tenant.createdAt)}</dd>
    </dl>
  </div>
  <div class="panel"><h2>Sign-in</h2>
    <dl class="kv">
      <dt>Method</dt><dd>Local accounts: password + authenticator code, both required (D155, D156)</dd>
      <dt>Single sign-on</dt><dd class="muted">Not built. Target is OIDC per tenant with the hub as relying party (D159); the schema already has room for it.</dd>
      <dt>Vendor access</dt><dd class="muted">No grants exist and grant evaluation is not built (D153). Vendor accounts are refused at sign-in.</dd>
    </dl>
  </div>
</div>

<div class="panel">
  <h2>Admin users</h2>
  <table><thead><tr><th>Email</th><th>Roles</th><th>Status</th><th>Credentials</th><th>Last sign-in</th><th>Created</th></tr></thead>
  <tbody>${users.map((u) => html`<tr>
    <td>${u.email}${u.id === ctx.user.id ? html` <span class="pill">you</span>` : ""}</td>
    <td>${u.roles.join(", ") || html`<span class="muted">none</span>`}</td>
    <td>${u.status}</td>
    <td class="muted" style="font-size:13px">${u.hasPassword ? "password" : "no password"} · ${u.hasTotp ? "authenticator" : html`<strong class="error" style="padding:0 4px">NO AUTHENTICATOR</strong>`}</td>
    <td>${u.lastLoginAt ? html`${when(u.lastLoginAt)} <span class="muted">(${ago(u.lastLoginAt)})</span>` : html`<span class="muted">never</span>`}</td>
    <td>${when(u.createdAt)}</td>
  </tr>`)}</tbody></table>
  <p class="muted" style="font-size:13px">Add or disable an admin from a terminal in server/: <span class="mono">node bin/admin.mjs create-user ${ctx.tenant.slug} someone@example.com --role it_agent</span>. It prints the initial password and the authenticator secret once. ${ctx.permissions.has("audit.read") ? html`<a href="/admin/settings/audit">Audit log →</a>` : ""}</p>
</div>

<div class="panel">
  <h2>Roles <span class="muted" style="font-weight:400;font-size:13px">— roles carry permissions; a user carries roles and never a permission (D152)</span></h2>
  <table><thead><tr><th>Role</th><th>Permissions</th></tr></thead>
  <tbody>${tenantRoles.map((r) => html`<tr><td class="mono">${r.name}</td><td class="mono" style="font-size:12px">${r.permissions.join("  ")}</td></tr>`)}</tbody></table>
</div>

${notYet({
  heading: "Managing admins, auto-approve, and integrations from this page",
  missing: "Nothing on this page can be changed in the browser yet.",
  why: "Creating an admin returns secrets that need a one-time display and, per D157, a step-up on the person doing it; both are next. The enrollment auto-approve toggle needs B3. An IdP configuration needs D159's federation work.",
  arrives: "the next passes; the CLI covers admin creation until then",
})}`;
  await ctx.render(200, body, { title: "Settings", current: "/admin/settings" });
}

async function auditPage(ctx) {
  const rows = await recentAudit({ tenantId: ctx.tenant.id, limit: 200 });
  const body = html`
<p><a href="/admin/settings">← Settings</a></p>
<h1>Audit log</h1>
<p class="lede">Every admin action, refusal and record view against ${ctx.tenant.displayName} (D156). Newest first.</p>
<h2>Entries<span class="count">last ${rows.length}</span></h2>
<div class="panel" style="padding:0 0 4px">
  <table><thead><tr><th style="padding-inline-start:20px">When</th><th>Who</th><th>Action</th><th>Subject</th><th style="padding-inline-end:20px">Detail</th></tr></thead>
  <tbody>${rows.map((r) => html`<tr>
    <td class="mono" style="padding-inline-start:20px;white-space:nowrap" title="${new Date(r.at).toISOString()}">${when(r.at)}<div class="muted" style="font-size:12px;font-family:var(--body)">${ago(r.at)}</div></td>
    <td class="mono">${r.email ?? html`<span class="muted">—</span>`}</td>
    <td class="mono">${r.action}${r.eventClass !== "normal" ? html` <span class="pill">${r.eventClass}</span>` : ""}${r.stepUp ? html` <span class="pill">step-up</span>` : ""}</td>
    <td class="mono">${r.subject ?? ""}</td>
    <td class="mono muted" style="font-size:12px;padding-inline-end:20px">${r.detail ? JSON.stringify(r.detail) : ""}</td>
  </tr>`)}</tbody></table>
  ${rows.length === 0 ? html`<p class="muted">Nothing yet — which cannot be, since you signed in to read this. If you see this, the audit write is failing and that is a defect.</p>` : ""}
</div>
<p class="muted" style="font-size:13px">Export is not built; it is one of D157's step-up actions and needs that mechanism first.</p>`;
  await ctx.render(200, body, { title: "Audit log", current: "/admin/settings" });
}

export const settingsRoutes = [
  route("GET", /^\/admin\/settings\/?$/, "settings.read", settingsPage),
  route("GET", /^\/admin\/settings\/audit\/?$/, "audit.read", auditPage),
];
