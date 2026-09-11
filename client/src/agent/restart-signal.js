// @ts-check
/**
 * The restart signal: from collected probes to a score, a row and a sentence.
 *
 * UNPRIVILEGED and PURE. Nothing here touches Windows, the clock or the DOM - every input arrives
 * as an argument, which is what lets `test/restart-signal.test.mjs` drive machines that do not
 * exist. The privileged half is `src/broker/win32/sysinfo.js`; the probe that joins them is
 * `probeMachine()`.
 *
 * It sits beside `prompt.js`'s `escalationReply()` and for the same reason: user-facing prose that
 * has to be generated from evidence belongs in ONE generator, agent-side, where it can be tested
 * headlessly. `renderer.js` cannot be imported by a test (it touches `document` at module scope),
 * so copy that must be asserted cannot live there - that is the precedent `spoken-form.js` set.
 *
 * ===============================================================================================
 * THE PANEL SHOWS CONCLUSIONS, NOT MEASUREMENTS - AND COMMIT CHARGE IS NEITHER
 * ===============================================================================================
 *
 * A measurement can be collected without being displayed, and commit charge is the case that
 * proves it. It is the single most useful input here: it is what distinguishes a machine that needs
 * restarting from one that has merely been up a while. And *"Commit charge 68.8%"* means nothing to
 * an office worker. So it is scored and it is NEVER rendered as a number on any user surface -
 * neither as a row nor inside a sentence. The words it turns into are in `EVIDENCE` below.
 *
 * ===============================================================================================
 * EVERY THRESHOLD IN HERE IS A POLICY PROPOSAL. NONE IS A SOURCED BENCHMARK.
 * ===============================================================================================
 *
 * The spec says so about its own numbers, in its own §6: there is no verified source establishing
 * 30 days - or any figure - as an evidence-based restart interval. It calls itself educated
 * guessing until validated against real ticket outcomes.
 *
 * Which is why these are DEFAULTS IN A CONFIG FILE and not constants in a source file
 * (`config.json`'s `restartPolicy`, `_restartPolicyNote` beside it). The distinction is not
 * cosmetic: a constant is a claim the code makes, and a configurable default is a starting point a
 * tenant can move. `docs/RESTART-SIGNAL.md` records them as unvalidated and says what would
 * validate them - scoring recommendations against whether they actually resolved tickets.
 */

const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 86400000;

/**
 * The score table from the spec's §6, minus the signals this pass does not collect.
 *
 * ABSENT ON PURPOSE: single-process working-set growth (weight 2, "> 50% over session, sustained").
 * It needs the 7-14 day rolling per-process history the spec describes, and that history does not
 * exist. There is room for it here and nothing else has to move when it arrives.
 */
export const DEFAULT_RESTART_POLICY = {
  /** Recommend at this score or above. The spec's figure is 3. */
  recommendAtScore: 3,

  /** Uptime bands, in days. */
  uptimeLongDays: 30,
  uptimeElevatedDays: 14,

  /** Commit charge in use, as a fraction of the commit limit. */
  commitHighFraction: 0.9,
  commitElevatedFraction: 0.75,

  /** `Memory Compression`'s working set, as a fraction of physical RAM. */
  memoryCompressionFraction: 0.15,

  weights: {
    uptimeLong: 3,
    uptimeElevated: 1,
    commitHigh: 3,
    commitElevated: 1,
    memoryCompression: 1,
    pendingFileRenames: 1,
  },

  /**
   * How long the conversation moment stays quiet. All three are the anti-nag rule, which the spec
   * states ("an unprompted restart nag during someone's workday is the fastest way to get the agent
   * dismissed") and which this build needed one clause more of: once DECLINED, do not raise it
   * again this session, and not again for a configurable period.
   */
  raiseSuppressionHours: 24,
  declineSuppressionHours: 168,
  deferHours: 4,
};

/**
 * "41 days", "1 day", "20 hours", "less than an hour". One duration, one wording.
 *
 * The row and the sentence both build on this, so the band and the spoken recommendation cannot
 * describe one machine two ways - the same rule D242 holds for a ticket.
 *
 * @param {number} ms
 */
function durationWords(ms) {
  if (ms < MS_PER_HOUR) return "less than an hour";
  if (ms < MS_PER_DAY) {
    const hours = Math.floor(ms / MS_PER_HOUR);
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  const days = Math.floor(ms / MS_PER_DAY);
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * What each signal is WORTH SAYING as, in the user's words.
 *
 * These are the "lead with the evidence" half of the copy rules, and the reason the spec gives is
 * worth keeping in front of whoever edits them: *"Chrome has grown 4 GB since Tuesday and your
 * memory is nearly full"* earns compliance in a way *"it's been a while"* does not.
 *
 * Each is a whole statement about the machine rather than a fragment, because any of them may be
 * the first thing said - which clause leads depends on the score. **They are stored in NON-LEADING
 * form and `restartSentence()` raises the first character of whichever ends up first**: writing them
 * each ready to lead is what once put a capital T mid-sentence ("…installing an update, This
 * computer hasn't been restarted in 40 days"). Raising one character is also right for "Windows",
 * which is a proper noun and stays capitalised wherever it sits.
 *
 * None carries a number for commit charge, and none names a mechanism (D250): "memory" and not
 * "commit charge", "an update" and not "Component Based Servicing".
 *
 * ===============================================================================================
 * THE EVIDENCE DESCRIBES THE READING, NOT THE BAND IT FELL INTO
 * ===============================================================================================
 *
 * **This was a defect, found by watching the real panel on 2026-09-11 rather than by reading the
 * code.** These clauses were constants named after the DEFAULT bands - "in over a month", "in more
 * than a fortnight" - and the bands are configurable defaults that a tenant is meant to move. With
 * `uptimeElevatedDays` lowered to 1, a machine that had been up **1.35 days** said *"This computer
 * hasn't been restarted in more than a fortnight."* on screen. Every copy rule passed: it said
 * "restart", it led with evidence, it offered to come back. The evidence was simply false.
 *
 * Two acceptance criteria were quietly in conflict - the thresholds must be configurable, and the
 * sentence must lead with the evidence - and a constant cannot satisfy both. So the score still
 * decides WHETHER to speak, from the configured bands, and the reading decides HOW IT IS
 * DESCRIBED, from fixed descriptive ones. Uptime says how long it has actually been; memory is
 * described from where the real fraction sits, which is also why the figure itself never appears.
 */
const EVIDENCE = {
  pendingUpdate: () => "Windows is waiting for a restart to finish installing an update",
  uptime: (uptimeMs) => `this computer hasn't been restarted in ${durationWords(uptimeMs)}`,
  // Descriptive bands over the REAL fraction, deliberately not the configured scoring ones: a
  // tenant who scores at 50% has not thereby made 50% "almost completely full".
  commit: (fraction) => (fraction >= 0.9
    ? "its memory is almost completely full"
    : fraction >= 0.75
      ? "its memory is filling up"
      : "its memory is under pressure"),
  memoryCompression: () => "Windows has started compressing memory to keep up",
  pendingFileRenames: () => "there are files an update has left waiting to be swapped out",
};

/**
 * Score the collected signals.
 *
 * THREE PROPERTIES THIS FUNCTION HAS AND A SIMPLER ONE WOULD NOT:
 *
 * 1. **A flag that fires alone fires alone.** CBS and Windows Update are actionable on their own -
 *    Windows is telling you outright - so they set `firesAlone` and the score is not consulted.
 *
 * 2. **`PendingFileRenameOperations` can never fire alone, and that is structural rather than
 *    arithmetical.** Its weight is 1 and the threshold is 3, so on today's numbers it cannot reach
 *    the threshold by itself anyway - but that is an accident of two configurable values, and both
 *    are meant to be moved. So it carries `neverAlone` and the recommendation is withheld when
 *    nothing else contributed, whatever the numbers say. The spec's correction to its own earlier
 *    advice is the reason: that key had two entries on a machine Windows Update had fully rebooted
 *    27 hours earlier and which needed nothing at all, and one on the machine this was built on.
 *    Installers, antivirus and update staging populate it routinely and it often persists
 *    harmlessly.
 *
 * 3. **An unreadable probe scores nothing and is reported as unknown.** It is never read as
 *    healthy. `null` in, no contribution out, and the id in `unknown` so a person can see which
 *    of the evidence was missing rather than being shown a score that looks complete.
 *
 * @param {any} signals `restartSignals()`'s shape, or any subset of it; every member may be null.
 * @param {any} [policy] defaults to `DEFAULT_RESTART_POLICY`, merged shallowly.
 */
export function scoreRestart(signals, policy = DEFAULT_RESTART_POLICY) {
  const p = { ...DEFAULT_RESTART_POLICY, ...(policy ?? {}) };
  const w = { ...DEFAULT_RESTART_POLICY.weights, ...(policy?.weights ?? {}) };

  /** @type {{id: string, weight: number, evidence: string, neverAlone?: boolean}[]} */
  const contributions = [];
  /** @type {string[]} */
  const unknown = [];
  let firesAlone = false;

  const boot = signals?.boot ?? null;
  const flags = signals?.flags ?? null;
  const memory = signals?.memory ?? null;
  const compression = signals?.memoryCompression ?? null;

  // ---- the flags -----------------------------------------------------------------------------
  if (!flags || flags.readable !== true) {
    unknown.push("pendingRebootFlags");
  } else {
    if (flags.cbs === true || flags.windowsUpdate === true) {
      firesAlone = true;
      // `leads`, because `weight` is 0 and the sentence orders by weight. This signal carries no
      // weight precisely BECAUSE it does not need any - Windows is saying outright that it is
      // waiting - so sorting it by weight buries the most decisive evidence last. It is the one
      // contribution whose position in the sentence is not a function of its score.
      contributions.push({ id: "pendingUpdate", weight: 0, leads: true, evidence: EVIDENCE.pendingUpdate() });
    }
    if (typeof flags.pendingFileRenames === "number" && flags.pendingFileRenames > 0) {
      contributions.push({
        id: "pendingFileRenames",
        weight: w.pendingFileRenames,
        evidence: EVIDENCE.pendingFileRenames(),
        neverAlone: true,
      });
    }
  }

  // ---- uptime --------------------------------------------------------------------------------
  //
  // A null or non-finite uptime is UNKNOWN. This is the check the spec's `TickCount64` finding
  // demands: a collector that reads an empty value, computes zero and reports a freshly-booted
  // machine never fires on the machines that most need it. Zero is a legitimate reading here (a
  // machine really can have just booted) and it is only ever a reading, never a default.
  if (!boot || typeof boot.uptimeMs !== "number" || !Number.isFinite(boot.uptimeMs) || boot.uptimeMs < 0) {
    unknown.push("uptime");
  } else {
    const days = boot.uptimeMs / MS_PER_DAY;
    if (days > p.uptimeLongDays) {
      contributions.push({ id: "uptimeLong", weight: w.uptimeLong, evidence: EVIDENCE.uptime(boot.uptimeMs) });
    } else if (days >= p.uptimeElevatedDays) {
      contributions.push({ id: "uptimeElevated", weight: w.uptimeElevated, evidence: EVIDENCE.uptime(boot.uptimeMs) });
    }
  }

  // ---- commit charge -------------------------------------------------------------------------
  const commit = memory?.commitUsedFraction;
  if (typeof commit !== "number" || !Number.isFinite(commit)) {
    unknown.push("commitCharge");
  } else if (commit > p.commitHighFraction) {
    contributions.push({ id: "commitHigh", weight: w.commitHigh, evidence: EVIDENCE.commit(commit) });
  } else if (commit >= p.commitElevatedFraction) {
    contributions.push({ id: "commitElevated", weight: w.commitElevated, evidence: EVIDENCE.commit(commit) });
  }

  // ---- Memory Compression --------------------------------------------------------------------
  //
  // Windows only grows this under genuine pressure, which is what makes it corroborating rather
  // than decorative: it is the signal that says "42% free RAM" is understating the real picture.
  const compressionFraction = compression?.fractionOfPhysical;
  if (typeof compressionFraction !== "number" || !Number.isFinite(compressionFraction)) {
    unknown.push("memoryCompression");
  } else if (compressionFraction > p.memoryCompressionFraction) {
    contributions.push({ id: "memoryCompression", weight: w.memoryCompression, evidence: EVIDENCE.memoryCompression() });
  }

  const score = contributions.reduce((sum, c) => sum + c.weight, 0);
  const corroborated = contributions.some((c) => !c.neverAlone);
  const recommend = firesAlone || (score >= p.recommendAtScore && corroborated);

  return { score, recommend, firesAlone, corroborated, contributions, unknown, recommendAtScore: p.recommendAtScore };
}

// ===============================================================================================
// The row
// ===============================================================================================

/**
 * "2 days ago". The FACT ONLY - plain, neutral, and carrying no advice.
 *
 * The panel gets one row out of this whole feature and it is this one. It does not say the machine
 * should be restarted, does not say the uptime is long, and does not hint: the recommendation is a
 * conversation moment, and a row that argues is a row that argues every time the band is opened,
 * which is the definition of nagging.
 *
 * `null` reads "Not known". It must never read "just now": an unreadable probe rendered as a fresh
 * restart is the same defect as an unreadable probe scored as healthy, one surface along.
 *
 * @param {number | null | undefined} uptimeMs
 */
export function lastRestartedPhrase(uptimeMs) {
  if (typeof uptimeMs !== "number" || !Number.isFinite(uptimeMs) || uptimeMs < 0) return "Not known";
  const words = durationWords(uptimeMs);
  return `${words[0].toUpperCase()}${words.slice(1)} ago`;
}

// ===============================================================================================
// The conversation moment
// ===============================================================================================

/**
 * The sentence, when the score passes the threshold.
 *
 * FOUR COPY RULES, ALL OF THEM LOAD-BEARING, AND ONE CONSEQUENCE OF WHAT THIS BUILD CAN DO:
 *
 * 1. **It says "restart" and never "shut down and turn it back on".** This is the most
 *    consequential sentence in the spec. Under Fast Startup a shutdown is a kernel hibernate - it
 *    does not clear the session and **the fix will not apply**, so a user who follows the second
 *    wording does the work and gets nothing. `test/restart-signal.test.mjs` fails on the phrase.
 *
 * 2. **It leads with the evidence, not the instruction.** The evidence clauses are ordered by
 *    weight, so the strongest reason is the first thing said.
 *
 * 3. **It offers to schedule it** - and the offer is to RAISE IT AGAIN at a better time, which is
 *    the part of "schedule" this build can actually honour. There is no capability that restarts a
 *    machine: the catalog has `restart_service`, which is a Windows service and not the computer.
 *    So the sentence never says it will do the restart, and never implies a restart has been
 *    booked. Promising to perform one would be the class of defect D213 spent five surfaces
 *    avoiding - telling a user something has been arranged that has not.
 *
 * 4. **It does not nag.** That is `createRestartGate()` below, not this function: a sentence cannot
 *    be un-said, so the restraint has to live in whether it is asked for at all.
 *
 * @param {ReturnType<typeof scoreRestart>} scored
 */
export function restartSentence(scored) {
  // A leading signal first, then by weight, so the strongest reason is the first thing said.
  const ordered = [...scored.contributions]
    .sort((a, b) => (b.leads ? 1 : 0) - (a.leads ? 1 : 0) || b.weight - a.weight);
  const leading = ordered.filter((c) => !c.neverAlone);
  // The never-alone signals are not in the sentence at all. They are too weak to have earned the
  // user's attention on their own and quoting one as a reason invites exactly the wrong inference -
  // it is corroboration, and it reads as a cause.
  const clauses = (leading.length ? leading : ordered).map((c) => c.evidence);

  // "A, B, and C" rather than "A, and B, and C": three reasons is the common case on a machine
  // that has earned the threshold, and a chain of "and"s reads as a list of complaints.
  const joined = clauses.length === 0
    ? "this computer has been running for a while"
    : clauses.length === 1
      ? clauses[0]
      : `${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}`;
  // EVERY CLAUSE IS STORED IN NON-LEADING FORM and the first character is raised here. Writing
  // each one ready to lead is what put a capital T mid-sentence — "…installing an update, This
  // computer hasn't been restarted in 40 days" — because which clause leads depends on the score.
  // Raising one character is right for "Windows", too: it is already capitalised and stays so.
  const evidence = `${joined[0].toUpperCase()}${joined.slice(1)}`;

  // "Windows is waiting for a restart. Restarting it would clear that up." says the same thing
  // twice, and the second half is the weaker wording of the two. When Windows is the one asking,
  // the instruction is that finishing the job is what the restart is FOR.
  const instruction = clauses[0] === EVIDENCE.pendingUpdate()
    ? "Restarting now is what lets it finish."
    : "Restarting it would clear that up.";
  return `${evidence}. ${instruction} I can bring this up again at a better time, or leave it with you.`;
}

/**
 * Whether the moment may be raised at all, and the memory of having raised it.
 *
 * ===============================================================================================
 * A RECOMMENDATION THAT REPEATS IS A NAG REGARDLESS OF HOW WELL IT IS WORDED
 * ===============================================================================================
 *
 * The spec says do not nag and leaves the mechanism open. This is the mechanism, and it has one
 * clause the spec does not state: **once declined, it is not raised again this session, and not
 * again for a configurable period.**
 *
 * `declinedForSession` is a separate fact from the timestamp on purpose. The window is what a
 * persisted gate would honour; the boolean is what THIS process honours, and it cannot be argued
 * out of by a clock that moved.
 *
 * Note also what the gate does NOT do: it never raises anything itself. It only ever answers
 * "may this be said". The moment rides on a turn the user started, because an unprompted surface
 * is a nag by construction and because D198 says a card the user did not provoke is a defect even
 * when every gate behaved correctly.
 *
 * KNOWN LIMIT, STATED RATHER THAN DISCOVERED: this state is in memory and does not survive the app
 * being restarted. "Not again this session" is exact; "not again for a configurable period" holds
 * only while the process lives. Persisting it needs a store that does not exist for this purpose -
 * `profile.js` holds the fields a person supplies for a ticket and this is not one of them. The gap
 * is narrow, because a user who takes the advice restarts the machine and the signal goes with it.
 *
 * @param {any} [policy]
 */
export function createRestartGate(policy = DEFAULT_RESTART_POLICY) {
  const p = { ...DEFAULT_RESTART_POLICY, ...(policy ?? {}) };
  /** @type {number | null} */
  let raisedAtMs = null;
  /** @type {number | null} */
  let declinedAtMs = null;
  /** @type {number | null} */
  let quietUntilMs = null;
  let declinedForSession = false;

  const hours = (h) => Math.max(0, Number(h) || 0) * MS_PER_HOUR;

  return {
    /** @param {number} nowMs */
    shouldRaise(nowMs) {
      if (declinedForSession) return false;
      if (quietUntilMs !== null && nowMs < quietUntilMs) return false;
      if (raisedAtMs !== null && nowMs - raisedAtMs < hours(p.raiseSuppressionHours)) return false;
      return true;
    },
    /** Said. Starts the ordinary quiet period, whatever the user goes on to answer. @param {number} nowMs */
    raised(nowMs) {
      raisedAtMs = nowMs;
    },
    /** "Leave it with you." @param {number} nowMs */
    declined(nowMs) {
      declinedAtMs = nowMs;
      declinedForSession = true;
      quietUntilMs = nowMs + hours(p.declineSuppressionHours);
    },
    /** "Bring it up again later." The one answer that is allowed to shorten the quiet period. @param {number} nowMs */
    deferred(nowMs) {
      quietUntilMs = nowMs + hours(p.deferHours);
      // A deferral is the user asking to be reminded, so it must clear the ordinary suppression as
      // well - otherwise "remind me in four hours" is silently honoured as twenty-four.
      raisedAtMs = null;
    },
    /** For the inspector and the developer log. Never a user surface. */
    state() {
      return { raisedAtMs, declinedAtMs, quietUntilMs, declinedForSession };
    },
  };
}

/**
 * The whole signal, as the panel and the turn need it: the row, the score, and the sentence if
 * there is one to say.
 *
 * `sentence` is null unless the score passed AND the gate allows it, so a caller cannot accidentally
 * speak a suppressed recommendation by reading a field it should not have looked at.
 *
 * @param {any} signals
 * @param {{policy?: any, gate?: any, nowMs?: number}} [opts]
 */
export function restartAdvice(signals, { policy = DEFAULT_RESTART_POLICY, gate = null, nowMs = Date.now() } = {}) {
  const scored = scoreRestart(signals, policy);
  const allowed = scored.recommend && (gate === null || gate.shouldRaise(nowMs));
  return {
    lastRestarted: lastRestartedPhrase(signals?.boot?.uptimeMs ?? null),
    score: scored.score,
    recommend: scored.recommend,
    firesAlone: scored.firesAlone,
    unknown: scored.unknown,
    /** Ids and weights, for the inspector and the developer log. Not a user surface. */
    contributions: scored.contributions,
    sentence: allowed ? restartSentence(scored) : null,
  };
}
