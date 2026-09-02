// @ts-check
/**
 * The four primitives (§6). PRIVILEGED - imported only by a Broker implementation.
 *
 * Each executor receives parameters that have ALREADY been schema-validated and policy-checked
 * by the broker, and returns machine detail for the audit record. Each throws on failure; the
 * broker turns that into an honest ExecutionResult - no executor ever reports a fake success.
 */
import { restartService, queryService } from "../win32/scm.js";
import { flushDnsCache, renewDhcp, resetAdapter, listAdapters, getInterfaceStatus } from "../win32/net.js";

export const EXECUTORS = {
  async restart_service({ serviceName }) {
    const detail = await restartService(serviceName);
    return {
      message: `Restarted the ${serviceName} service — it went ${detail.stateBefore} → ${detail.stateAfter}.`,
      detail,
    };
  },

  async flush_dns() {
    const detail = flushDnsCache();
    return { message: "Flushed the DNS resolver cache.", detail };
  },

  async renew_dhcp({ adapterIndex }) {
    const detail = renewDhcp(adapterIndex);
    const after = listAdapters().find((a) => a.index === adapterIndex);
    return {
      message: after?.hasIp
        ? `Renewed the DHCP lease — this machine now has ${after.ip}.`
        : "Renewed the DHCP lease, but the adapter still has no IP address.",
      detail: { ...detail, ipAfter: after?.ip ?? null, gatewayAfter: after?.gateway ?? null },
    };
  },

  async reset_adapter({ adapterId }) {
    const adapter = listAdapters().find((a) => a.guid === adapterId);
    if (!adapter) throw new Error(`adapter ${adapterId} is not in the live adapter list`);
    const detail = await resetAdapter(adapter.index);
    const after = listAdapters().find((a) => a.guid === adapterId);
    return {
      message: detail.operationalAfter
        ? `Reset the ${adapter.description} adapter — it is back up${after?.hasIp ? ` on ${after.ip}` : " but has no IP yet"}.`
        : `Reset the ${adapter.description} adapter, but it has not come back up yet.`,
      detail: { ...detail, description: adapter.description, ipAfter: after?.ip ?? null },
    };
  },
};

/** Read-only probes for the tier-0 router and the diagnose panel. Unelevated-safe. */
export function probeMachine() {
  const services = {};
  for (const name of ["spooler", "audiosrv", "dnscache", "dhcp"]) {
    try {
      services[name] = queryService(name);
    } catch (err) {
      services[name] = { name, error: err.message };
    }
  }
  let adapters = [];
  try {
    adapters = listAdapters();
  } catch { /* an empty list is itself the signal */ }

  // Link state matters: a Bluetooth PAN or Wi-Fi Direct adapter is DHCP-enabled and has no IP
  // permanently, which would otherwise look identical to an unplugged Ethernet port.
  adapters = adapters.map((a) => {
    try {
      const link = getInterfaceStatus(a.index);
      return { ...a, adminUp: link.adminUp, linkUp: link.operational };
    } catch {
      return { ...a, adminUp: null, linkUp: null };
    }
  });

  const primary = adapters.filter((a) => a.dhcpEnabled && a.hasGateway);
  return {
    services,
    adapters,
    primary,
    // Adapters worth acting on: DHCP-managed and either carrying a link or already routing.
    // This is what keeps the router off the permanently-idle virtual adapters.
    actionable: adapters.filter((a) => a.dhcpEnabled && (a.linkUp || a.hasGateway)),
    online: primary.some((a) => a.hasIp && !a.isApipa && a.hasGateway),
  };
}
