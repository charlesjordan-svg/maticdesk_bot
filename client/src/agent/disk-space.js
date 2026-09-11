// @ts-check
/**
 * Disk space: the dual threshold, and the words a person reads.
 *
 * UNPRIVILEGED and PURE, like `restart-signal.js` beside it. The readings come from
 * `fixedVolumes()` in `src/broker/win32/sysinfo.js`.
 *
 * ===============================================================================================
 * THIS IS NOT A RESTART SIGNAL, AND THAT IS THE FIRST THING TO KNOW ABOUT IT
 * ===============================================================================================
 *
 * **Nothing here feeds `scoreRestart()`, and nothing here may.** A full disk is not fixed by
 * restarting, and the telemetry spec's §6 score table does not list it. Rolling disk into the
 * restart score would produce the most useless recommendation this product could make: telling
 * someone to restart a machine that will be exactly as full afterwards.
 *
 * It is a panel row with its own threshold. If a disk recommendation is ever wanted it is a
 * different sentence with a different remedy, and it needs its own decision.
 *
 * ===============================================================================================
 * WHY BOTH A PERCENTAGE AND AN ABSOLUTE FIGURE, AND NEVER JUST ONE
 * ===============================================================================================
 *
 * The spec measured five volumes on a real machine and a naive "below 20% free" rule fired on two
 * of them - **both with more than 160 GB of headroom and in no trouble whatever.** Re-measured on
 * the machine this was built on, 2026-09-11, the same thing happens:
 *
 *   C:  162.6 GB free of 929.9 GB  = 17.5%   a percentage rule FIRES; there is no problem
 *   D:  414.2 GB free of 1848.9 GB = 22.4%
 *   E:  163.0 GB free of 931.5 GB  = 17.5%   a percentage rule FIRES; there is no problem
 *   F: 1658.9 GB free of 3725.9 GB = 44.5%
 *   G:  500.6 GB free of 1863.0 GB = 26.9%
 *
 * **Two false alarms on a healthy machine**, from the rule everybody writes first. A percentage
 * alone is meaningless on a large disk, and an absolute figure alone is meaningless on a small one
 * - so it takes both, and `lowOnSpace` requires both to be true.
 *
 * The same trap as `PendingFileRenameOperations` in `restart-signal.js`, one signal along: the
 * obvious rule fires confidently on machines that are fine.
 */

const GB = 1024 ** 3;

/**
 * **UNVALIDATED, exactly like the restart thresholds.** The spec proposes these two and they are
 * the only figures in the feature; nothing establishes them as evidence-based. They are
 * configurable defaults in `client/config.json` (`diskPolicy`) for the same reason - a constant is
 * a claim the code makes, a default is a starting point a tenant can move.
 *
 * `gettingFullBytes` is NOT the spec's; it is ours, and it exists only to choose a WORD rather than
 * to fire anything. Nothing is flagged on it.
 */
export const DEFAULT_DISK_POLICY = {
  /** Flag only when free space is below this fraction AND below `lowBytes`. */
  lowFraction: 0.15,
  /** …and below this many bytes. 25 GB. */
  lowBytes: 25 * GB,
  /** Below this, the row says "getting full" without flagging anything. 50 GB. */
  gettingFullBytes: 50 * GB,
};

/** "163 GB", "8.4 GB", "870 MB". Whole numbers above 10 GB - nobody needs 162.63. */
export function spaceWords(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "an unknown amount";
  if (bytes < GB) return `${Math.round(bytes / (1024 ** 2))} MB`;
  const gb = bytes / GB;
  return gb >= 10 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`;
}

/**
 * One volume, as a conclusion with the figure behind it.
 *
 * THE CONCLUSION LEADS AND THE NUMBER FOLLOWS. "The panel shows conclusions, not measurements" is
 * the principle, and a disk figure is the case where the measurement is still worth carrying: "163
 * GB free" is a sentence an office worker can act on, unlike "commit charge 68.8%", and it is the
 * first thing a support call asks after "which drive". So the words decide the meaning and the
 * figure is there to be quoted.
 *
 * @param {{root: string, freeBytes: number, totalBytes: number, freeFraction: number}} volume
 * @param {any} [policy]
 */
export function describeVolume(volume, policy = DEFAULT_DISK_POLICY) {
  const p = { ...DEFAULT_DISK_POLICY, ...(policy ?? {}) };
  const low = volume.freeFraction < p.lowFraction && volume.freeBytes < p.lowBytes;
  const gettingFull = !low && volume.freeBytes < p.gettingFullBytes;
  return {
    root: volume.root.slice(0, 2),
    lowOnSpace: low,
    words: low ? "Almost full" : gettingFull ? "Getting full" : "Plenty of room",
    free: spaceWords(volume.freeBytes),
  };
}

/**
 * Every volume, described. **Never aggregated** — the array is the answer.
 *
 * A null or empty reading returns an empty array rather than a reassuring row: a machine whose
 * disks could not be read is not a machine with plenty of room, and the panel simply has nothing
 * to say about it.
 *
 * @param {any[] | null | undefined} volumes
 * @param {any} [policy]
 */
export function describeVolumes(volumes, policy = DEFAULT_DISK_POLICY) {
  if (!Array.isArray(volumes)) return [];
  return volumes
    .filter((v) => v && typeof v.freeBytes === "number" && typeof v.totalBytes === "number" && v.totalBytes > 0)
    .map((v) => describeVolume(v, policy));
}
