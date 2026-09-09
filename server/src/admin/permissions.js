// @ts-check
/**
 * The permission vocabulary, and the map from console destination to the permission that opens it.
 *
 * D152: roles carry permissions; permissions never attach to users. The strings here are the ones
 * migrations/control/003-admin-console.sql seeds onto the five roles. A permission that appears
 * here and in no seed is granted to nobody, which is the safe direction to be wrong in.
 */

export const PERMISSIONS = Object.freeze([
  "review.read", "review.act",
  "tickets.read", "tickets.write",
  "knowledge.read", "knowledge.write",
  "metrics.read",
  "agents.read", "agents.manage",
  "settings.read", "settings.write",
  "admins.manage",
  "audit.read",
]);

/**
 * The six destinations (handover §3), in nav order, with the permission that shows each one.
 * The review queue is home (D177). A destination the session's role cannot open is not drawn in
 * the nav at all — a greyed-out link is an invitation to ask for access, and a missing one is a
 * statement about the role.
 */
export const DESTINATIONS = Object.freeze([
  { path: "/admin",           label: "Review queue", permission: "review.read",    badge: "review" },
  { path: "/admin/tickets",   label: "Tickets",      permission: "tickets.read",   badge: "tickets" },
  { path: "/admin/knowledge", label: "Knowledge",    permission: "knowledge.read", badge: null },
  { path: "/admin/agents",    label: "Agents",       permission: "agents.read",    badge: null },
  { path: "/admin/metrics",   label: "Metrics",      permission: "metrics.read",   badge: null },
  { path: "/admin/settings",  label: "Settings",     permission: "settings.read",  badge: null },
]);

/**
 * @param {Set<string>|string[]} granted
 * @param {string} permission
 */
export function has(granted, permission) {
  const set = granted instanceof Set ? granted : new Set(granted);
  return set.has(permission);
}
