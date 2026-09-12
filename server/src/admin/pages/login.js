// @ts-check
/**
 * The sign-in page. Email, password and authenticator code on ONE form (D156: TOTP is mandatory,
 * so there is no reason to ask for it on a second screen — and a single form means a password
 * alone never produces a partially-authenticated state to reason about).
 *
 * AFTER THE DESIGN PASS (2026-09-09, handback §3): a two-column page. The left half is the one
 * reversed field in the console — steel ground, paper type — carrying the brand and the loopback
 * notice, which is now the FIRST thing on the page rather than a box under the form. Every word of
 * the notice is retained (exit criterion 8). The right half is the form. The page renders without
 * the console's header and nav (`bare`), because there is nobody to show a nav to yet.
 */
import { html } from "../html.js";

/** @param {{ error?: string|null, email?: string }} p */
export function loginPage({ error = null, email = "" }) {
  return html`
<div class="signin">
  <div class="signin-field">
    <div class="brand">Matic Desk<small>Admin console</small></div>
    <div class="note">
      <p><strong>Loopback only.</strong> The hub refuses any connection that is not from this machine, and this console inherits that. It stays so until the sign-in and session code has had a security review.</p>
      <hr>
      <p>Accounts are local (email, password, authenticator). There is no single sign-on yet (D159).</p>
      <p>An account is created with <span class="mono">node bin/admin.mjs create-user</span>, not here.</p>
      <hr>
      <p><strong>Locked out?</strong> The error above is deliberately the same for every cause. The CLI is the way back in.</p>
      <p><span class="mono">admin.mjs totp --user &lt;email&gt;</span> prints the current code — the secret is on the server, so a lost authenticator is not a lost account.</p>
      <p><span class="mono">admin.mjs reset &lt;tenant&gt; &lt;email&gt; --keep-totp</span> sets a new password and leaves the authenticator working. Without that flag it replaces both.</p>
      <p><span class="mono">admin.mjs audit</span> says which factor actually failed.</p>
      <p>Five failures lock an email for one minute. Nothing longer, and nothing to clear.</p>
    </div>
  </div>
  <div class="signin-form">
    <h1>Sign in</h1>
    <p class="lede">Password and a six-digit authenticator code.</p>
    ${error ? html`<div class="error">${error}</div>` : ""}
    <form method="post" action="/admin/login" autocomplete="on">
      <label for="email">Email</label>
      <input id="email" type="email" name="email" value="${email}" required autofocus autocomplete="username">
      <label for="password">Password</label>
      <input id="password" type="password" name="password" required autocomplete="current-password">
      <label for="code">Authenticator code</label>
      <input id="code" type="text" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code" placeholder="6 digits">
      <p class="go"><button class="primary" type="submit">Sign in</button></p>
    </form>
  </div>
</div>`;
}
