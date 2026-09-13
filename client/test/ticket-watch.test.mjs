/**
 * The ticket watch (D288; P4, 2026-09-12): the poll, the "update arrived" decision, the ack.
 *
 * Headless: a scripted client, captured timers, a temp userData directory. Nothing reaches a
 * network. The property under test throughout is the one the console relies on (D287): an entry
 * is announced ONCE, only when the HUB says it is unseen, and the ack goes back for exactly what
 * was shown.
 *
 * Run: node test/ticket-watch.test.mjs
 */
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TicketWatch, POLL_DEFAULT_MS, POLL_FLOOR_MS, SNAPSHOT_FILENAME } from "../src/agent/ticket-watch.js";
import { stateWords, stateClass, stateDetail, stateSpoken, updateWords, agoWords } from "../src/ticket/state-words.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}
const jsCode = (js) => js.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
const quiet = () => {};

/** A scripted HubClient: `list` and `byRef` are mutable so a scenario moves the hub between polls. */
function fakeClient() {
  const c = {
    calls: [],
    list: { ok: true, tickets: [] },
    byRef: {},
    ackResult: { ok: true, acknowledged: 0 },
    async listTickets() { c.calls.push(["list"]); return c.list; },
    async ticket(ref) { c.calls.push(["ticket", ref]); return c.byRef[ref] ?? { ok: false, reason: "refused", status: 404, detail: `no ticket ${ref}` }; },
    async ack(ids) { c.calls.push(["ack", ids]); return { ...c.ackResult, acknowledged: ids.length }; },
  };
  return c;
}
/** Captured timers: nothing fires unless the test fires it. */
function fakeTimers() {
  const t = { queue: [], id: 0 };
  t.setTimer = (fn, ms) => { const id = ++t.id; t.queue.push({ id, fn, ms }); return id; };
  t.clearTimer = (id) => { t.queue = t.queue.filter((q) => q.id !== id); };
  t.fire = async () => { const q = t.queue.shift(); if (q) await q.fn(); };
  return t;
}
const entry = (id, kind, authorKind, createdAt, over = {}) => ({ id, kind, visibility: "public", body: `${kind} ${id}`, authorKind, authorLabel: authorKind === "requester" ? null : "desk@devco.example", createdAt, notifiedAt: null, readByRequesterAt: null, ...over });

const dir = mkdtempSync(join(tmpdir(), "matic-watch-"));
let T0 = Date.parse("2026-09-12T10:00:00.000Z");
const now = () => T0;

console.log("=== 1. no credential: the poll asks once, is told why, reads no timeline, announces nothing ===");
{
  const client = fakeClient();
  client.list = { ok: false, reason: "no-credential", detail: "this endpoint holds no enrollment credential" };
  const updates = [];
  const logs = [];
  const w = new TicketWatch({ client, dir, onUpdate: (u) => updates.push(u), onLog: (l) => logs.push(l), now });
  await w.poll();
  check("basis no-credential, canQuery false, no ticket() call, no update", w.snapshot.basis === "no-credential" && w.canQuery === false && client.calls.length === 1 && updates.length === 0);
  check("the log says so once and names the detail", logs.filter((l) => /cannot read this enrollment's tickets \(no-credential\)/.test(l)).length === 1 && /enrollment credential/.test(logs.join("\n")), logs.join(" | "));
  await w.poll();
  check("…and not again while nothing changes", logs.filter((l) => /cannot read/.test(l)).length === 1);
  check("status() carries the basis for the band, and checkedAt is still null (no successful poll yet)", w.status().basis === "no-credential" && w.status().checkedAt === null && w.status().attemptedAt !== null);
}

console.log("\n=== 2. the first poll that sees the hub: a changed ticket's timeline is read, the DESK's unseen entries are announced once ===");
const client = fakeClient();
const updates = [];
const logs = [];
const timers = fakeTimers();
const w = new TicketWatch({ client, dir, intervalMs: 60_000, onUpdate: (u) => updates.push(u), onLog: (l) => logs.push(l), now, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
client.list = { ok: true, tickets: [
  { reference: "MD-1", state: "open", updatedAt: "2026-09-12T09:50:00.000Z", resolutionNotes: null },
  { reference: "MD-2", state: "closed", updatedAt: "2026-09-01T09:00:00.000Z", resolutionNotes: "Replaced the cable" },
] };
client.byRef["MD-1"] = { ok: true, ticket: { reference: "MD-1", state: "open" }, entries: [
  entry("s1", "state_change", "console_user", "2026-09-12T09:00:00.000Z", { readByRequesterAt: "2026-09-12T09:01:00.000Z" }),
  entry("r1", "comment", "requester", "2026-09-12T09:30:00.000Z"),
  entry("e1", "comment", "console_user", "2026-09-12T09:50:00.000Z"),
] };
client.byRef["MD-2"] = { ok: true, ticket: { reference: "MD-2", state: "closed" }, entries: [] };
{
  w.start();
  check("start() schedules the first poll at once", timers.queue.length === 1 && timers.queue[0].ms === 0);
  await timers.fire();
  check("one list, then a timeline read for EACH never-seen ticket", client.calls.filter((c) => c[0] === "ticket").map((c) => c[1]).join(",") === "MD-1,MD-2");
  check("ONE update, for MD-1, carrying only the desk's unseen entry: not the requester's own comment, not the entry the hub already saw acknowledged", updates.length === 1 && updates[0].reference === "MD-1" && updates[0].state === "open" && updates[0].entries.map((e) => e.id).join(",") === "e1", JSON.stringify(updates));
  const row = w.status().tickets["MD-1"];
  check("the snapshot row: state, the hub's updatedAt, the desk's last write and its kind, unseen 1", row.state === "open" && row.updatedAt === "2026-09-12T09:50:00.000Z" && row.lastUpdateAt === "2026-09-12T09:50:00.000Z" && row.lastUpdateKind === "comment" && row.unseen === 1, JSON.stringify(row));
  check("MD-2: closed, no desk entry, unseen 0, and the resolution notes carried", w.status().tickets["MD-2"].unseen === 0 && w.status().tickets["MD-2"].lastUpdateAt === null && w.status().tickets["MD-2"].resolutionNotes === "Replaced the cable");
  check("status() strips the private id list", !("_unseenIds" in row) && Object.values(w.status().tickets).every((r) => !("_unseenIds" in r)));
  check("basis ok, canQuery true, checkedAt is the poll's clock", w.canQuery && w.status().checkedAt === new Date(T0).toISOString());
  check("the log says shown, not spoken", logs.some((l) => /MD-1: 1 unseen entry from the desk \(comment\) - shown, not spoken/.test(l)), logs.join(" | "));
  check("the next poll is scheduled on the interval", timers.queue.length === 1 && timers.queue[0].ms === 60_000);
  check("the snapshot is on disk beside the profile, and holds the rows (the unseen ids too, so an ack before the first poll of a new run still has them)", existsSync(join(dir, SNAPSHOT_FILENAME)) && /"MD-1"/.test(readFileSync(join(dir, SNAPSHOT_FILENAME), "utf8")) && /_unseenIds/.test(readFileSync(join(dir, SNAPSHOT_FILENAME), "utf8")));
}

console.log("\n=== 3. the same hub again: the unchanged ticket is not re-read, the unseen one is re-read but NOT re-announced ===");
{
  client.calls.length = 0;
  T0 += 60_000;
  await timers.fire();
  check("MD-2 (unchanged, nothing unseen) was not read; MD-1 (still unseen) was", client.calls.filter((c) => c[0] === "ticket").map((c) => c[1]).join(",") === "MD-1");
  check("no second announcement of e1", updates.length === 1);
}

console.log("\n=== 4. acknowledge(): the ack goes to the hub for exactly what was shown, and the row stops saying unseen without waiting for a poll ===");
{
  client.calls.length = 0;
  const r = await w.acknowledge(["e1", "", 42]);
  check("POST ack with the string ids only", client.calls.length === 1 && client.calls[0][0] === "ack" && client.calls[0][1].join(",") === "e1" && r.ok === true);
  check("MD-1 unseen is 0 in the snapshot at once", w.status().tickets["MD-1"].unseen === 0);
  check("an empty ack sends nothing", (await w.acknowledge([])).acknowledged === 0 && client.calls.length === 1);
  check("the log records it", logs.some((l) => /acknowledged 1 shown entry to the hub \(D287\)/.test(l)));
}

console.log("\n=== 5. the desk writes again: only the NEW entry is announced; a resolution carries the state it left ===");
{
  client.calls.length = 0;
  client.list.tickets[0] = { reference: "MD-1", state: "resolved", updatedAt: "2026-09-12T10:05:00.000Z", resolutionNotes: "Reinstalled the driver" };
  client.byRef["MD-1"].ticket.state = "resolved";
  client.byRef["MD-1"].entries[2].readByRequesterAt = "2026-09-12T10:01:00.000Z";
  client.byRef["MD-1"].entries.push(entry("e2", "resolution", "console_user", "2026-09-12T10:05:00.000Z", { body: "Reinstalled the driver" }));
  T0 += 60_000;
  await timers.fire();
  check("MD-1 was re-read because updatedAt moved", client.calls.some((c) => c[0] === "ticket" && c[1] === "MD-1"));
  check("one more update, e2 only, with the resolved state", updates.length === 2 && updates[1].entries.map((e) => e.id).join(",") === "e2" && updates[1].state === "resolved", JSON.stringify(updates[1]));
  const row = w.status().tickets["MD-1"];
  check("the row: resolved, last update is the resolution, unseen 1, notes carried", row.state === "resolved" && row.lastUpdateKind === "resolution" && row.unseen === 1 && row.resolutionNotes === "Reinstalled the driver");
}

console.log("\n=== 6. the hub goes away: the basis says so, the last known rows stay for the band, nothing is announced ===");
{
  client.list = { ok: false, reason: "unreachable", detail: "GET http://hub.test/v1/tickets failed: fetch failed" };
  T0 += 60_000;
  await timers.fire();
  const s = w.status();
  check("basis unreachable, detail kept, checkedAt is the LAST SUCCESSFUL poll, rows retained", s.basis === "unreachable" && /fetch failed/.test(s.detail) && s.checkedAt === new Date(T0 - 60_000).toISOString() && s.tickets["MD-1"]?.state === "resolved" && updates.length === 2);
  check("canQuery is false while unreachable", w.canQuery === false);
  check("the log says the band shows what was last known", logs.some((l) => /\(unreachable\).*last known at/.test(l)));
  w.stop();
  check("stop() clears the timer", timers.queue.length === 0);
  w.stop();
}

console.log("\n=== 7. a restart: the snapshot comes back from disk for the band, with basis never until the hub is asked again ===");
{
  const w2 = new TicketWatch({ client: fakeClient(), dir, onLog: quiet, now });
  const s = w2.status();
  check("rows and checkedAt restored; basis never; attemptedAt null", s.tickets["MD-1"]?.state === "resolved" && s.tickets["MD-2"]?.state === "closed" && s.checkedAt !== null && s.basis === "never" && s.attemptedAt === null, JSON.stringify(s).slice(0, 200));
  check("canQuery is false until a poll says otherwise", w2.canQuery === false);
  const w3 = new TicketWatch({ client: fakeClient(), dir: null, onLog: quiet, now });
  check("no dir: no file, empty snapshot, no throw", w3.path === null && Object.keys(w3.snapshot.tickets).length === 0);
}

console.log("\n=== 8. the interval: the default, the floor, the log, and one poll at a time ===");
{
  const l = [];
  check("default is a minute", new TicketWatch({ client: fakeClient(), onLog: quiet }).intervalMs === POLL_DEFAULT_MS && POLL_DEFAULT_MS === 60_000);
  const floored = new TicketWatch({ client: fakeClient(), intervalMs: 5_000, onLog: (x) => l.push(x) });
  check("5000 is floored to 30000 and the log says so", floored.intervalMs === POLL_FLOOR_MS && POLL_FLOOR_MS === 30_000 && l.some((x) => /under the 30000 ms floor/.test(x)));
  check("garbage falls back to the default", new TicketWatch({ client: fakeClient(), intervalMs: "soon", onLog: quiet }).intervalMs === POLL_DEFAULT_MS && new TicketWatch({ client: fakeClient(), intervalMs: -1, onLog: quiet }).intervalMs === POLL_DEFAULT_MS);
  const c = fakeClient();
  const w4 = new TicketWatch({ client: c, onLog: quiet, now });
  const [a, b] = await Promise.all([w4.poll(), w4.poll()]);
  check("two concurrent poll() calls share ONE request", a === b && c.calls.filter((x) => x[0] === "list").length === 1);
  check("a throwing onUpdate is logged, not fatal", await (async () => {
    const c2 = fakeClient();
    c2.list = { ok: true, tickets: [{ reference: "MD-9", state: "open", updatedAt: "2026-09-12T09:00:00.000Z" }] };
    c2.byRef["MD-9"] = { ok: true, ticket: {}, entries: [entry("z1", "comment", "console_user", "2026-09-12T09:00:00.000Z")] };
    const l2 = [];
    const w5 = new TicketWatch({ client: c2, onUpdate: () => { throw new Error("boom"); }, onLog: (x) => l2.push(x), now });
    await w5.poll();
    return l2.some((x) => /onUpdate threw: boom/.test(x)) && w5.canQuery;
  })());
}

console.log("\n=== 9. the words: one vocabulary, no enum on the surface, nothing about email or notification ===");
{
  const states = ["new", "open", "resolved", "closed"];
  check("every state has a short label, a class, and a spoken clause; none is the state name itself", states.every((s) => stateWords(s) && stateSpoken(s) && stateWords(s).toLowerCase() !== s && !new RegExp(`\\b${s}\\b`, "i").test(stateSpoken(s).replace(/it's closed/, "")) || s === "closed"));
  check("resolved is the one that asks the requester something, and the delivery's `you` class marks it", /Waiting on you/.test(stateWords("resolved")) && stateClass("resolved") === "you" && stateClass("closed") === "closed" && stateClass("open") === "");
  check("an unknown state falls back to the pre-P4 words", stateWords(null) === "Filed from here" && /can't see how it's getting on/.test(stateSpoken(undefined)));
  const at = new Date("2026-09-12T12:00:00.000Z");
  check("stateDetail: unseen beats everything, then the resolved sentence, then the ago, then 'no update yet'",
    /New from the service desk, not yet seen here/.test(stateDetail({ state: "resolved", unseen: 1 }))
    && stateDetail({ state: "resolved", unseen: 0 }) === "The desk says it's fixed"
    && stateDetail({ state: "open", unseen: 0, lastUpdateAt: "2026-09-12T11:40:00.000Z" }, at) === "Last update from the desk 20 minutes ago"
    && stateDetail({ state: "new", unseen: 0, lastUpdateAt: null }) === "No update from the desk yet");
  check("agoWords is coarse and spoken", agoWords("2026-09-12T11:59:30.000Z", at) === "just now" && agoWords("2026-09-12T09:00:00.000Z", at) === "3 hours ago" && agoWords("2026-09-11T11:00:00.000Z", at) === "yesterday" && agoWords("2026-09-08T11:00:00.000Z", at) === "4 days ago" && agoWords(null) === "" && agoWords("garbage") === "");
  const reply = updateWords({ kind: "comment", body: "Try turning the printer off and on." }, "MD-7", "open");
  const fixed = updateWords({ kind: "resolution", body: "Reinstalled the driver" }, "MD-7", "resolved");
  const moved = updateWords({ kind: "state_change", body: "new → open" }, "MD-7", "open");
  check("a comment is quoted in full with the reference, and says replying here isn't built", /replied on MD-7: “Try turning the printer off and on\.”/.test(reply) && /Replying from this window isn't built yet/.test(reply));
  check("a resolution says fixed, quotes the note, and says reopening here isn't built", /marked MD-7 as fixed/.test(fixed) && /“Reinstalled the driver”/.test(fixed) && /reopened — from this window that isn't built yet/.test(fixed));
  check("a state change is glossed, never the arrow body", /MD-7 has moved on at the service desk: the desk is looking at it\./.test(moved) && !/→|new → open/.test(moved), moved);
  const all = [...states.flatMap((s) => [stateWords(s), stateSpoken(s), stateDetail({ state: s, unseen: 0 })]), reply, fixed, moved];
  check("no surface word says sent, notified, emailed, or names the hub", all.every((s) => !/\b(sent|notified|email|emailed|hub)\b/i.test(s)), all.find((s) => /\b(sent|notified|email|emailed|hub)\b/i.test(s)));
  check("no snake_case reaches a surface", all.every((s) => !/\b[a-z]+_[a-z]+\b/.test(s)));
}

console.log("\n=== 10. what the source says: shown not spoken, ack is the only write, main flashes only an unfocused window ===");
{
  const watch = jsCode(readFileSync(join(ROOT, "src/agent/ticket-watch.js"), "utf8"));
  check("ticket-watch.js speaks nothing and writes nothing but the ack: no say/tts, no comment/reopen/confirm call", !/\bsay\(|tts|speak/.test(watch) && !/client\.(comment|reopen|confirm)\(/.test(watch) && /client\.ack\(/.test(watch));
  check("…and the hub's readByRequesterAt is the unseen test, not a local seen-set", /!e\.readByRequesterAt/.test(watch) && !/\bseenIds\b/.test(watch));
  check("…the requester's own entries and internal ones are never 'from the desk'", /e\.visibility !== "internal" && e\.authorKind !== "requester"/.test(watch));
  const main = jsCode(readFileSync(join(ROOT, "src/main/main.js"), "utf8"));
  check("main.js constructs the watch in userData on the config interval (env overrides), starts it when a credential lands, stops it with the window", /new TicketWatch\(\{/.test(main) && /dir: app\.getPath\("userData"\)/.test(main) && /MATIC_TICKET_POLL_MS \|\| config\.ticketPollMs \|\| POLL_DEFAULT_MS/.test(main) && /hubClient\.setCredential\(r\.credential\); ticketWatch\?\.start\(\);/.test(main) && /ticketWatch\?\.stop\(\)/.test(main));
  check("…pushes ticket:update from onUpdate and flashes the frame ONLY when the window is not focused, clearing it on focus", /win\.webContents\.send\("ticket:update", update\)/.test(main) && /if \(!win\.isFocused\(\)\) \{\s*win\.flashFrame\(true\);/.test(main) && /win\.once\("focus", \(\) => \{ if \(win && !win\.isDestroyed\(\)\) win\.flashFrame\(false\); \}\)/.test(main));
  check("…ticket:filed carries the watch's status and a TRUTHFUL canQueryHub; ticket:ack goes to acknowledge()", /canQueryHub: ticketWatch\?\.canQuery \?\? false/.test(main) && /hub: ticketWatch \? ticketWatch\.status\(\) : null/.test(main) && /ipcMain\.handle\("ticket:ack", \(_e, entryIds\) => ticketWatch \? ticketWatch\.acknowledge\(/.test(main));
  check("…and the Agent receives the watch for the D235 branch", /new Agent\(\{ broker, cloud, intake, egress, ticketWatch,/.test(main));
  const pre = readFileSync(join(ROOT, "src/main/preload.cjs"), "utf8");
  check("the preload exposes the push and the ack, and nothing that writes words", /onTicketUpdate: \(cb\) => ipcRenderer\.on\("ticket:update"/.test(pre) && /ackTicketEntries: \(entryIds\) => ipcRenderer\.invoke\("ticket:ack", entryIds\)/.test(pre) && !/ticket:comment|ticket:reopen|ticket:confirm/.test(pre));
  const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
  check("config.json: ticketPollMs 60000 with a note that names the floor, the env override, show-only and D287", config.ticketPollMs === 60000 && /30000/.test(config._ticketPollNote) && /MATIC_TICKET_POLL_MS/.test(config._ticketPollNote) && /show only/.test(config._ticketPollNote) && /D287/.test(config._ticketPollNote));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
