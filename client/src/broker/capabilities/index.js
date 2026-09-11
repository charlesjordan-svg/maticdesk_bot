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
import catalog from "../catalog.json" with { type: "json" };

/**
 * WHAT WINDOWS CALLS THE SERVICE, from the catalog (D247). `serviceName` is a registry key —
 * `spooler`, `audiosrv` — and the broker's report of what it did is SPOKEN to the user, so it said
 * "Restarted the spooler service" to someone whose printer had stopped. A user going to look for
 * that service in Windows would not find it under that name; Windows calls it "Print Spooler".
 *
 * It is catalog data for the same reason `plain.*` is: it is text a user reads, so it is reviewable
 * and signable rather than written wherever it was first needed. An unmapped key falls back to
 * itself — the honest fallback, and `broker.test.mjs` fails before that can ship.
 */
const SERVICE_DISPLAY_NAMES =
  catalog.capabilities.find((c) => c.id === "restart_service")?.plain?.serviceNames ?? {};
const serviceDisplayName = (key) => SERVICE_DISPLAY_NAMES[key] ?? key;

export const EXECUTORS = {
  async restart_service({ serviceName }) {
    const detail = await restartService(serviceName);
    return {
      message: describeServiceRestart(serviceName, detail),
      detail,
    };
  },

  // THESE REPORTS ECHO THE CONSENT TEXT THE USER JUST APPROVED (D250). They used to say "Flushed
  // the DNS resolver cache" and "Renewed the DHCP lease" - Microsoft's names for the mechanisms,
  // which is what the catalog's TITLES are for and what the inspector still shows. The catalog
  // already had the user's version of each, in `plain.what`, and it is the text on the card they
  // read before agreeing: "Empties this machine's memory of recent website-name lookups", "Hands
  // back this machine's network address and asks the network for a new one". A report that echoes
  // the description someone approved is a report they can match to what they agreed to.
  async flush_dns() {
    const detail = flushDnsCache();
    return { message: "Emptied this machine's memory of recent website lookups.", detail };
  },

  async renew_dhcp({ adapterIndex }) {
    const detail = renewDhcp(adapterIndex);
    const after = listAdapters().find((a) => a.index === adapterIndex);
    const addr = describeAddress(after);
    return {
      message: addr.ok
        ? `Handed the old address back and asked for a new one — this machine now has ${after.ip}.`
        : `Handed the old address back and asked for a new one, ${addr.phrase}.`,
      detail: { ...detail, ipAfter: after?.ip ?? null, gatewayAfter: after?.gateway ?? null },
    };
  },

  async reset_adapter({ adapterId }) {
    const adapter = listAdapters().find((a) => a.guid === adapterId);
    if (!adapter) throw new Error(`adapter ${adapterId} is not in the live adapter list`);
    const detail = await resetAdapter(adapter.index);
    const after = listAdapters().find((a) => a.guid === adapterId);
    return {
      message: (() => {
        if (!detail.operationalAfter) return `Reset the ${adapter.description} adapter, but it has not come back up yet.`;
        const addr = describeAddress(after);
        return `Reset the ${adapter.description} adapter — it is back up${addr.ok ? " " : ", "}${addr.phrase}.`;
      })(),
      detail: { ...detail, description: adapter.description, ipAfter: after?.ip ?? null },
    };
  },
};

/**
 * How to describe what a service restart actually did.
 *
 * "it went RUNNING -> RUNNING" is true and reads as a no-op, which is the opposite of what
 * happened: the service WAS stopped and started again, the steps prove it, and the before/after
 * states are identical only because it was healthy to begin with. Observed in the UI on the dev
 * box when Scenario 1 was run without injecting the printer fault first - which is exactly what
 * happens during rehearsal, and what happens on stage if the fault injection is forgotten.
 *
 * The STOPPED -> RUNNING wording is kept verbatim: it is the money line for Scenario 1.
 *
 * WHAT CHANGED ON 2026-09-10 (D247) IS THE NAME AND NOTHING ELSE. These four sentences are SPOKEN,
 * and they named the service by its registry key — "Restarted the spooler service" — which is our
 * key, not a name a user could look up. The before → after pair is untouched, because that pair IS
 * the money line: it is the proof that something happened, and it is the reason the sentence is
 * worth saying at all.
 */
export function describeServiceRestart(serviceName, detail) {
  const { stateBefore, stateAfter, steps = [] } = detail ?? {};
  const svc = serviceDisplayName(serviceName);
  if (stateAfter !== "RUNNING") {
    return `Tried to restart the ${svc} service, but it is ${stateAfter ?? "in an unknown state"} now, not running.`;
  }
  if (stateBefore !== stateAfter) {
    return `Restarted the ${svc} service — it went ${stateBefore} → ${stateAfter}.`;
  }
  if (steps.includes("stopped")) {
    return `Restarted the ${svc} service — it was already running, so it was stopped and started again. It is running now.`;
  }
  return `The ${svc} service is running, but it was not actually stopped and started.`;
}

/**
 * How to describe the address an adapter ended up with, after a renew or a reset.
 *
 * A 169.254.x.x address sets `hasIp`, so a naive check reports it as success - and the message
 * then reads "it is back up on 169.254.17.252", which means the OPPOSITE of success: DHCP has
 * not answered. An IT lead reads 169.254 instantly.
 *
 * resetAdapter() settles for 1.5 s, which is shorter than DHCP reacquisition on this hardware,
 * so APIPA is the NORMAL outcome of a reset rather than an edge case - observed on the Intel
 * I225-V, which came back on 169.254.17.252 and reached 192.168.50.223 only some seconds later.
 *
 * net.js already refuses to report a failed re-enable as a success. This closes the same gap one
 * step further along: a successful re-enable that has not yet produced a usable address.
 *
 * @returns {{ok: boolean, phrase: string}} `ok` means a real, routable-looking lease.
 */
export function describeAddress(after) {
  // D250: "IP" and "DHCP" came out of both phrases. **The ADDRESS stays**, and the check below this
  // one is why: a self-assigned 169.254 address reading as success is a defect found on real
  // hardware, and the value is the evidence. It is shown and not spoken (D249).
  if (!after?.hasIp) return { ok: false, phrase: "but it has no address yet" };
  if (after.isApipa) {
    return {
      ok: false,
      phrase: `but so far only a self-assigned address (${after.ip}), which means the network has not given it a real one yet - that usually settles within a few seconds`,
    };
  }
  return { ok: true, phrase: `on ${after.ip}` };
}

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
