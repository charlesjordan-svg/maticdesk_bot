// @ts-check
/**
 * Offline troubleshooting guidance.
 *
 * The four capabilities can restart a service, flush DNS, renew a lease and reset an adapter.
 * NONE of them can plug in a cable or switch a radio on, so there is a real class of network
 * fault where the honest answer is "here is what I can see, and here is what you need to check".
 *
 * Before this existed the app said, in one run-on sentence, that it could not reach the model,
 * that nothing matched, that it could see no adapter it could act on, and that it had no action
 * that would help. All true, all useless to someone whose cable is out. Observed on the dev box
 * on 2026-09-02 by physically unplugging Ethernet and switching Wi-Fi off.
 *
 * This emits GUIDANCE ONLY - no proposal, no capability, nothing privileged. It is derived
 * entirely from the read-only probe, and it never claims to have done anything.
 *
 * Keep the wording short. The message it replaces failed as much on length as on content.
 *
 * @typedef {ReturnType<import("../broker/capabilities/index.js").probeMachine>} Probe
 * @typedef {{headline: string, cause: string, checks: string[]}} OfflineGuidance
 */

/** Adapters that are not real network interfaces a user could plug something into. */
const VIRTUAL = /wi-?fi direct|virtual|tunnel|tap-|loopback|bluetooth|vpn|hyper-v|vmware|virtualbox/i;
const WIRELESS = /wi-?fi|wireless|802\.11|wlan/i;
const WIRED = /ethernet|gigabit|gbe|\bnic\b|i2\d\d|realtek pcie|killer e\d/i;

const CHECK_CABLE =
  "Ethernet: check the cable at both ends - the wall socket or switch, and the back of this machine. Look for a light on the port.";
const CHECK_WIRELESS =
  "Wi-Fi: check it is switched on, that Airplane Mode is off, and that any physical wireless switch or Fn key on the machine is not set to off.";
const CHECK_ENABLED =
  "Network Connections (run ncpa.cpl): check the adapter is not disabled - a disabled adapter is invisible to me entirely.";
const CHECK_UPSTREAM =
  "The router or switch: check it has power and its lights look normal, and whether anyone else nearby has lost connection too.";

/**
 * @param {Probe} probe
 * @returns {OfflineGuidance | null} null when the machine is routing, or when the fault is one
 *   the catalog can actually act on - in which case a proposal is the right answer, not advice.
 */
export function diagnoseOffline(probe) {
  if (probe?.online) return null;

  const adapters = probe?.adapters ?? [];
  const real = adapters.filter((a) => !VIRTUAL.test(a.description ?? ""));

  // ---- Nothing to see at all. Every interface is disabled, or the radio is hard-off. ----
  if (real.length === 0) {
    return {
      headline: "I cannot see a network adapter on this machine at all.",
      cause:
        adapters.length === 0
          ? "Windows is not reporting a single network interface to me."
          : "The only interfaces I can see are virtual ones - nothing physical.",
      // A disabled adapter does not appear in GetAdaptersInfo at all, which is exactly what this
      // looks like from here. Measured 2026-09-02: disabling one adapter removed it from the
      // probe entirely. So "it is disabled" is the first thing to check, not the last.
      checks: [CHECK_ENABLED, CHECK_WIRELESS, CHECK_CABLE],
    };
  }

  // ---- Interfaces exist, but not one of them has a link. This is the unplugged case. ----
  const linkUp = real.filter((a) => a.linkUp);
  if (linkUp.length === 0) {
    const wired = real.filter((a) => WIRED.test(a.description ?? ""));
    const wireless = real.filter((a) => WIRELESS.test(a.description ?? ""));
    const checks = [];
    if (wired.length) checks.push(CHECK_CABLE);
    if (wireless.length) checks.push(CHECK_WIRELESS);
    if (!checks.length) checks.push(CHECK_CABLE, CHECK_WIRELESS);
    checks.push(CHECK_ENABLED);
    return {
      headline: "Nothing on this machine has a network link.",
      cause: `${describe(real)} present, and none of them has a live connection. That is physical - a cable or a radio - and it is not something I can fix from software.`,
      checks,
    };
  }

  // ---- Something has a link. Whether the catalog can help depends on addressing, and the
  //      router decides that. Only speak up when it has nothing to offer. ----
  const actionable = probe?.actionable ?? [];
  if (actionable.length > 0) return null;

  return {
    headline: "This machine has a network link but is not reaching anything.",
    cause: `${describe(linkUp)} connected, but ${linkUp.length === 1 ? "it has" : "they have"} no usable address, and no adapter here is one I can renew or reset.`,
    checks: [CHECK_UPSTREAM, CHECK_ENABLED],
  };
}

/** "One adapter is" / "Two adapters are" - keeps the sentences readable. */
function describe(list) {
  if (list.length === 1) return `One adapter (${list[0].description}) is`;
  return `${list.length} adapters are`;
}
