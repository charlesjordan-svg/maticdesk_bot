// @ts-check
/**
 * The requester's words for what the hub says about a ticket (D288; P4, 2026-09-12).
 *
 * ONE VOCABULARY FOR THREE SURFACES. The tickets band, the transcript's "an update arrived" line
 * and the spoken answer to "where's my ticket?" all describe the same hub row, and 700d920 is what
 * happens when two surfaces describe one state in their own words: a reply said the hub was
 * unreachable while the pill beside it said reachable. So the words live here, imported by the
 * renderer and by `src/router/social.js`, and neither may gloss a state on its own.
 *
 * THE HUB'S STATE NAMES NEVER REACH A SCREEN (D244). `new`/`open`/`resolved`/`closed` and the
 * entry kinds `comment`/`resolution`/`state_change` are the hub's closed enums; what the user reads
 * is what each means FOR THEM - who holds the ticket now, and what, if anything, they are being
 * asked. Nothing here says "sent", "notified" or "emailed": the requester is reading this because
 * their app polled and was handed the entry (D287), and the desk was not told anything by it.
 *
 * "Resolved" is the one state that asks the requester something - the desk says it is fixed and
 * the ticket waits for them to agree or disagree (D278/D286) - and the words say so, and say that
 * agreeing or disagreeing from THIS window is not built yet (that view is Claude Design's; see the
 * P4 handover). A sentence that invited "say so and I'll close it" with nothing behind it would be
 * this project's signature defect from the other side.
 */

/** @typedef {"new"|"open"|"resolved"|"closed"} HubState */

/**
 * The band's status LABEL for a ticket in `state` - the delivery's `.tstat b`, 150px of small
 * capitals, so two or three words. `stateDetail()` below is the sentence under it.
 * @param {string|null|undefined} state
 */
export function stateWords(state) {
  switch (state) {
    case "new": return "At the desk";
    case "open": return "Being looked at";
    case "resolved": return "Waiting on you";
    case "closed": return "Closed";
    default: return "Filed from here";
  }
}

/**
 * The delivery's own modifier classes on `.tstat b`: `you` (attention colour) for the one state
 * that asks the requester something, `closed` (quiet) for the terminal one. Anything else is the
 * default live colour, which is what "filed" looked like before P4.
 * @param {string|null|undefined} state
 */
export function stateClass(state) {
  return state === "resolved" ? "you" : state === "closed" ? "closed" : "";
}

/**
 * The line under the label. Unseen beats everything - it is the one fact the user may act on -
 * then the resolved state's own sentence, then when the desk last wrote, then that it has not.
 * @param {{ state?: string, unseen?: number, lastUpdateAt?: string|null, autoCloseAt?: string|null }} row
 * @param {Date} [now]
 */
export function stateDetail(row, now = new Date()) {
  if ((row.unseen ?? 0) > 0) return "New from the service desk, not yet seen here";
  if (row.state === "resolved") return row.autoCloseAt ? `The desk says it's fixed — closes on its own ${untilWords(row.autoCloseAt, now)} unless you say otherwise` : "The desk says it's fixed";
  if (row.lastUpdateAt) return `Last update from the desk ${agoWords(row.lastUpdateAt, now)}`;
  return "No update from the desk yet";
}

/**
 * The spoken clause for the same state - a fragment that follows "…, about {description}".
 * @param {string|null|undefined} state
 */
export function stateSpoken(state) {
  switch (state) {
    case "new": return "the service desk has it but hasn't picked it up yet";
    case "open": return "the service desk is looking at it";
    case "resolved": return "the service desk says it's fixed and is waiting to hear whether you agree";
    case "closed": return "it's closed";
    default: return "I can't see how it's getting on";
  }
}

/**
 * One public entry from the desk, as the sentence the transcript shows when it arrives. The desk's
 * own words are quoted in full: a reply to the requester IS the message, and this build has no
 * timeline view to send them to for the rest of it. `body` is the hub's (D275: public entries only).
 *
 * @param {{ kind: string, body: string, authorKind?: string }} entry
 * @param {string} reference
 * @param {string|null|undefined} state  the ticket's state AFTER this entry
 */
export function updateWords(entry, reference, state) {
  const words = String(entry.body ?? "").trim();
  // D289: the hub closed it on its own. The entry is a system state change labelled by the auto-close
  // job; the sentence says nobody at the desk did this, and what to do if the problem is back.
  if (entry.kind === "state_change" && entry.authorKind === "system" && entry.authorLabel === "auto-close") {
    return `${reference} closed on its own: the service desk had marked it fixed and nobody said otherwise in time. If the problem is back, raise a new ticket about it — quote ${reference}.`;
  }
  if (entry.kind === "resolution") {
    return `The service desk has marked ${reference} as fixed. Their note: “${words}” If that's not right, the ticket can be reopened — from this window that isn't built yet, so quote ${reference} if you follow it up.`;
  }
  if (entry.kind === "comment") {
    return `The service desk replied on ${reference}: “${words}” Replying from this window isn't built yet — quote ${reference} if you follow it up.`;
  }
  if (entry.kind === "state_change") {
    return `${reference} has moved on at the service desk: ${stateSpoken(state).replace(/^the service desk/, "the desk")}.`;
  }
  return `${reference} has an update from the service desk: “${words}”`;
}

/**
 * The other direction: "in 2 hours", "tomorrow", "in 3 days", or "any time now" once passed - for
 * D289's "closes on its own …" clause. Coarse for the same reason as agoWords().
 * @param {string|Date|null|undefined} at
 * @param {Date} [now]
 */
export function untilWords(at, now = new Date()) {
  if (!at) return "";
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const s = Math.round((d.getTime() - now.getTime()) / 1000);
  if (s < 90) return "any time now";
  const m = Math.round(s / 60);
  if (m < 60) return `in ${m} minutes`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? "in about an hour" : `in about ${h} hours`;
  const days = Math.round(h / 24);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

/**
 * "just now", "12 minutes ago", "3 hours ago", "yesterday", "4 days ago" - for the band's
 * "Last update" cell. Coarse on purpose: a support call rests on the reference, not the minute.
 * @param {string|Date|null|undefined} at
 * @param {Date} [now]
 */
export function agoWords(at, now = new Date()) {
  if (!at) return "";
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const s = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000));
  if (s < 90) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? "an hour ago" : `${h} hours ago`;
  const days = Math.round(h / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
