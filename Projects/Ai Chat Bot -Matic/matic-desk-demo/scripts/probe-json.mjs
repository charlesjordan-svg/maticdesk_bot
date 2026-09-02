/**
 * Prints probeMachine() as one line of JSON, for preflight.ps1 to parse.
 *
 * This exists as a file rather than an inline `node -e` because the project path contains spaces:
 * in eval mode there is no base path for a relative import, and the URL-encoded specifier fails.
 *
 * Read-only and unprivileged, like the probe itself.
 */
import { probeMachine } from "../src/broker/capabilities/index.js";

const p = probeMachine();
console.log(JSON.stringify({
  online: p.online,
  adapters: p.adapters.length,
  actionable: p.actionable.length,
  primary: p.primary.map((a) => a.description),
  services: Object.fromEntries(
    Object.entries(p.services).map(([k, v]) => [k, v.error ? "ERROR" : v.stateName])
  ),
}));
