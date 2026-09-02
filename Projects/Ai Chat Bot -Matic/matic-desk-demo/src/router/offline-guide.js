// @ts-check
/**
 * Offline troubleshooting guidance.
 *
 * The four capabilities can restart a service, flush DNS, renew a lease and reset an adapter.
 * NONE of them can plug in a cable or switch a radio on, so there is a real class of network
 * fault where the honest answer is "here is what I can see, and here is what YOU need to check".
 *
 * Two rounds of real feedback shaped this, both from unplugging the cable on the dev box:
 *
 * 1. It first answered with a run-on paragraph about what it could not do. True, useless.
 * 2. The replacement listed the checks, and the user did not realise they were instructions:
 *    they rendered before the headline, in the grey system style used for logging, with no call
 *    to action. "I didn't realize those instructions were for me."
 *
 * Hence the shape here: a short headline, a short cause, checks as label + detail so they can be
 * scanned rather than read, and an explicit nextStep. The renderer owns making them look like
 * instructions; this module owns making them short enough to act on.
 *
 * GUIDANCE ONLY - no proposal, no capability, nothing privileged, and it never claims to have
 * done anything. Everything here derives from the read-only probe.
 *
 * @typedef {ReturnType<import("../broker/capabilities/index.js").probeMachine>} Probe
 * @typedef {{label: string, detail: string}} Check
 * @typedef {{headline: string, cause: string, checks: Check[], nextStep: string}} OfflineGuidance
 */

/** Adapters that are not real interfaces a user could plug something into or switch on. */
const VIRTUAL = /wi-?fi direct|virtual|tunnel|tap-|loopback|bluetooth|vpn|hyper-v|vmware|virtualbox/i;
const WIRELESS = /wi-?fi|wireless|802\.11|wlan/i;
const WIRED = /ethernet|gigabit|gbe|\bnic\b|i2\d\d|realtek pcie|killer e\d/i;

const CHECK_CABLE = {
  label: "Check the network cable",
  detail: "Both ends - the wall socket or switch, and the back of this machine. Look for a light on the port.",
};
const CHECK_WIRELESS = {
  label: "Check Wi-Fi is switched on",
  detail: "Airplane Mode off, and look for a physical wireless switch or an Fn key on the keyboard.",
};
const CHECK_ENABLED = {
  label: "Check the adapter is not disabled",
  detail: "Press Windows+R and run ncpa.cpl. A disabled adapter is completely invisible to me.",
};
const CHECK_UPSTREAM = {
  label: "Check the router or switch",
  detail: "Power and lights normal? Has anyone near you lost connection too?",
};

const NEXT_STEP = "Once you have tried those, tell me and I will take another look.";

/**
 * @param {Probe} probe
 * @returns {OfflineGuidance | null} null when the machine is routing, or when the fault is one a
 *   capability can actually act on - there, a proposal is the right answer, not advice.
 */
export function diagnoseOffline(probe) {
  if (probe?.online) return null;

  const adapters = probe?.adapters ?? [];
  const real = adapters.filter((a) => !VIRTUAL.test(a.description ?? ""));

  // ---- Nothing physical visible. Every interface is disabled, or a radio is hard-off. ----
  if (real.length === 0) {
    return {
      headline: "I cannot see a network adapter on this machine at all.",
      cause: "Windows is not reporting one to me, which usually means it is switched off or disabled.",
      // A disabled adapter does not appear in GetAdaptersInfo at all - measured 2026-09-02, when
      // disabling one adapter removed it from the probe entirely. So "it is disabled" is the first
      // thing to check here, not the last.
      checks: [CHECK_ENABLED, CHECK_WIRELESS, CHECK_CABLE],
      nextStep: NEXT_STEP,
    };
  }

  // ---- Interfaces exist, but not one has a link. The unplugged case. ----
  const linkUp = real.filter((a) => a.linkUp);
  if (linkUp.length === 0) {
    const checks = [];
    if (real.some((a) => WIRED.test(a.description ?? ""))) checks.push(CHECK_CABLE);
    if (real.some((a) => WIRELESS.test(a.description ?? ""))) checks.push(CHECK_WIRELESS);
    if (!checks.length) checks.push(CHECK_CABLE, CHECK_WIRELESS);
    checks.push(CHECK_ENABLED);
    return {
      headline: "Nothing on this machine has a network link.",
      cause:
        real.length === 1
          ? "Your one network adapter is switched on but has no connection - that is a cable or a radio, not something I can fix in software."
          : `All ${real.length} network adapters are switched on but none has a connection - that is a cable or a radio, not something I can fix in software.`,
      checks,
      nextStep: NEXT_STEP,
    };
  }

  // ---- Something has a link. If the router has a candidate, a proposal is the right answer. ----
  if ((probe?.actionable ?? []).length > 0) return null;

  return {
    headline: "This machine has a network link but cannot reach anything.",
    cause: "There is a connection, but no usable address on it, and no adapter here that I am able to renew or reset.",
    checks: [CHECK_UPSTREAM, CHECK_ENABLED],
    nextStep: NEXT_STEP,
  };
}
