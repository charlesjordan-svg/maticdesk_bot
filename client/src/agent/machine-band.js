// @ts-check
/**
 * The machine band's structure: which rows, in which groups, and which of them carry a mark.
 *
 * UNPRIVILEGED and PURE, like `restart-signal.js` and `disk-space.js` beside it. Every input
 * arrives as an argument, so `test/machine-band.test.mjs` can drive machines that do not exist —
 * which matters more here than anywhere else in the panel, because `renderer.js` cannot be imported
 * by a test and this is the file that decides what a user is pointed at.
 *
 * ===============================================================================================
 * WHY THE VERDICT IS COMPUTED HERE AND NOT IN THE RENDERER (D258)
 * ===============================================================================================
 *
 * Claude Design's band of 2026-09-11 draws severity from a `data-state` attribute and says, in the
 * delivery itself:
 *
 *   "Keyed off YOUR verdict, never off the number in the string. … data-state='attn': your verdict
 *    says THIS ONE. 17.5% and 163 GB free is not this, and never becomes this, because the design
 *    cannot see either figure."
 *
 * A renderer that looked at the words and coloured anything reading "17.5%" — or anything reading
 * "Getting full" — would be reading a value out of a string one layer along, and would reintroduce
 * exactly the false alarm the dual threshold exists to prevent. So the mark is produced by the code
 * that owns each threshold (`describeVolume` for disk, `memoryBand` for memory) and travels to the
 * renderer as a decided value. **The renderer's job is to set the attribute it is handed and
 * nothing else.**
 *
 * ===============================================================================================
 * THERE IS NO "ok" STATE, AND THAT IS THE DELIVERY'S OWN INSTRUCTION
 * ===============================================================================================
 *
 *   "DO NOT SET data-state='ok'. A mark that says 'fine' is fifteen marks on a healthy machine,
 *    which is the defect this is fixing, not a fix."
 *
 * So `state` is `undefined` for a healthy row, and a healthy machine is a band with not one mark on
 * it. Three values are set, and only three:
 *
 *   attn    our verdict says THIS ONE
 *   watch   worth noticing, not urgent
 *   unread  the probe could not read it — the QUIET token, because a limit is not a warning
 *
 * ===============================================================================================
 * A MARK IS NOT ADVICE
 * ===============================================================================================
 *
 * D256 forbids a row that argues: the row states a fact and the recommendation is a separate
 * conversational moment, because a row that argues argues every time the band is opened. A mark
 * saying "this one" is not that — it is emphasis on a fact, and the delivery puts it in a gutter
 * the row always reserves so the band does not move when a machine goes bad. **No row's WORDS
 * change because of its state.** A test asserts that: the same reading produces the same string
 * whether it is marked or not.
 */

import { memoryBand, memoryWords, lastRestartedPhrase } from "./restart-signal.js";
import { describeVolumes } from "./disk-space.js";

/**
 * A Windows service state as a person would say it.
 *
 * `?` means the probe could not read it, which is NOT the same as stopped and must not be rendered
 * as though it were — the distinction predates this file and is the reason `unread` exists.
 *
 * **ONE AUTHORITY, TWO CALLERS.** This lived in `renderer.js` until D258 and is exported from here
 * now because the band and the proposal's evidence line (`evidenceFor`, still in the renderer) both
 * say a service state out loud. Two copies would drift, and the drift would be two surfaces
 * describing one service differently — D242's rule, one signal along.
 *
 * @param {string | null | undefined} stateName
 */
export function serviceWords(stateName) {
  if (stateName === "RUNNING") return "Running normally";
  if (stateName === "STOPPED") return "Stopped";
  if (stateName === "?" || !stateName) return "Couldn't read it from here";
  return String(stateName).toLowerCase().replace(/_/g, " ");
}

/**
 * A service row, with the mark that goes with its state.
 *
 * STOPPED is `attn` — it is the one service reading that is a live problem. Anything unreadable is
 * `unread` and takes the quiet token, because not knowing is a limit rather than a warning.
 *
 * @param {string} label @param {string | null | undefined} stateName
 */
export function serviceRow(label, stateName) {
  const value = serviceWords(stateName);
  if (stateName === "RUNNING") return { label, value };
  if (stateName === "STOPPED") return { label, value, state: "attn" };
  return { label, value, state: "unread" };
}

/**
 * The band, as groups of rows.
 *
 * The group names are OURS and travel as strings: the delivery draws the heading with
 * `content:attr(data-group)` precisely so that no wording arrives in a stylesheet. A set with no
 * `group` draws no heading and is just a stack, which is the graceful case the delivery promises.
 *
 * @param {{identity: any, summary: any, restart: any, volumes: any[], restartRecommended?: boolean}} f
 * @returns {{group: string, rows: {label: string, value: string, state?: string}[]}[]}
 */
export function machineBandGroups(f) {
  const { identity = {}, summary = {}, restart = null, volumes = [] } = f ?? {};

  const uptimeMs = restart?.boot?.uptimeMs ?? null;
  const commit = restart?.memory?.commitUsedFraction ?? null;
  const band = memoryBand(commit);

  const groups = [
    {
      group: "Who and where",
      rows: [
        { label: "This computer", value: identity.computer ?? "unknown" },
        { label: "Signed in as", value: identity.user ?? "unknown" },
      ],
    },
    {
      group: "How this machine is doing",
      rows: [
        {
          label: "Last restarted",
          value: lastRestartedPhrase(uptimeMs),
          // The RECOMMENDATION is the verdict about restarting, so the mark follows it rather than
          // being a second opinion about uptime. An unreadable boot time is `unread`, not `attn`:
          // not knowing is a limit, and the row already says "Not known".
          state: uptimeMs === null ? "unread" : f.restartRecommended ? "attn" : undefined,
        },
        {
          label: "Memory",
          value: memoryWords(commit),
          // The same band function the row's words and the recommendation's sentence both read, so
          // the mark cannot disagree with either.
          state: band === null ? "unread" : band === "almostFull" ? "attn" : band === "fillingUp" ? "watch" : undefined,
        },
      ],
    },
    {
      group: "What is running",
      rows: [serviceRow("Printing", summary.spooler), serviceRow("Sound", summary.audio)],
    },
    {
      group: "Network",
      rows: [
        {
          label: "Network adapter",
          value: !summary.adapter || summary.adapter === "none" ? "None found" : summary.adapter,
          // Deliberately unmarked even when none is found. The Network row below carries the
          // verdict, and marking both says one thing twice — D245's rule, one surface along.
        },
        {
          label: "Network",
          value: summary.online === "yes"
            ? (summary.dhcp === "RUNNING"
              ? "Connected, address given out automatically"
              : "Connected, address not given out automatically")
            : "Not connected",
          state: summary.online === "yes" ? undefined : "attn",
        },
      ],
    },
  ];

  // The address rows are kept even though the delivery's mock does not show them: they are the
  // first two things a support call asks for after the machine name, and dropping information the
  // founder has been reading is a change rather than a tidy-up. Never marked - they are evidence,
  // and `Network` above has already said whether the connection is good.
  const network = groups[groups.length - 1].rows;
  if (summary.ip && summary.ip !== "-") network.push({ label: "This machine's address", value: summary.ip });
  if (summary.gateway && summary.gateway !== "-") network.push({ label: "Router", value: summary.gateway });

  // Storage, per volume, never aggregated. `describeVolumes` decided each mark where the dual
  // threshold lives; nothing here re-reads a figure.
  const described = Array.isArray(volumes) ? volumes : describeVolumes(volumes);
  if (described.length) {
    groups.push({
      group: "Storage",
      // `volumes: true` is the hook for `.mset-volumes`, the delivery's tighter treatment for the
      // one group whose length is a property of the machine.
      volumes: true,
      rows: described.map((v) => ({
        label: `Disk space (${v.root})`,
        value: `${v.words} — ${v.free} free`,
        state: v.state,
      })),
    });
  }

  return groups;
}

/** Every marked row, for the developer log. Never a user surface. */
export function marksIn(groups) {
  return (groups ?? []).flatMap((g) => g.rows.filter((r) => r.state).map((r) => `${r.label}=${r.state}`));
}
