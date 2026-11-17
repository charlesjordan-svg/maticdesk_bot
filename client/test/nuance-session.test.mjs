/**
 * Opening a live persona conversation, headless (D307, PROPOSED, 2026-11-17).
 *
 * Run: node test/nuance-session.test.mjs        (from client/; part of `npm test`)
 *
 * `src/nuance/nuance-session.js` runs in the MAIN process: it asks the hub for a session token
 * (the hub holds the API key - the client never does), starts the conversation, and follows the
 * conversation's events until the persona is admitted to a room. A stub stands in for Nuance and
 * for the hub. NOTHING HERE CALLS EITHER.
 *
 * Pinned: every way a start can fail comes back as `{ ok: false, degrade: true }` with a reason and
 * NEVER as a throw - the caller's only job on a failure is to carry on with the local face and
 * voice (Decision C) - and the client sends no API key, no prompt and no persona of its own.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openConversation, endConversation, NUANCE_API } from "../src/nuance/nuance-session.js";

const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}

const MINT_OK = { ok: true, token: "st_TOKEN-CANARY", persona: "mira", delegation: "client", camera: false };
/** `script(url, init, n)` -> { status, body } | { throw } */
function net(script) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : null });
    const r = script(String(url), init, calls.length);
    if (r.throw) throw new Error(r.throw);
    return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.body };
  };
  return { calls, fetchImpl };
}
const happy = (events = [[{ type: "preparing" }], [{ type: "admitted", livekit_url: "wss://room.example.test", token: "lk_ROOM" }]]) => {
  let poll = 0;
  return net((url, init) => {
    if (url.endsWith("/conversation") && init.method === "POST") return { status: 201, body: { id: "c-1", status: "preparing" } };
    if (url.includes("/conversation/c-1/events")) return { status: 200, body: { events: events[Math.min(poll++, events.length - 1)] } };
    return { status: 404, body: {} };
  });
};
const open = (o = {}) => {
  const logs = [];
  const n = o.net ?? happy();
  let t = 0;
  const ended = [];
  return openConversation({
    mint: o.mint ?? (async () => MINT_OK), end: async (id) => { ended.push(id); return { ok: true }; }, fetchImpl: n.fetchImpl, log: (s) => logs.push(s),
    now: () => t, sleep: async (ms) => { t += ms; }, admitTimeoutMs: o.admitTimeoutMs ?? 60_000, maxSessionSeconds: o.maxSessionSeconds ?? 600,
  }).then((r) => ({ r, n, logs, ended }));
};

// ==============================================================================================
console.log("=== 1. the happy path ===");
{
  const { r, n, logs } = await open();
  check("it resolves ok with the room to join", r.ok === true && r.livekitUrl === "wss://room.example.test" && r.roomToken === "lk_ROOM" && r.conversationId === "c-1", JSON.stringify(r));
  check("…and what the hub fixed: the persona, and the host the audio will go to", r.persona === "mira" && r.host === "room.example.test");
  const post = n.calls[0];
  check("the conversation is started on the documented host with the SESSION token", post.url === `${NUANCE_API}/conversation` && post.method === "POST" && post.headers.authorization === "Bearer st_TOKEN-CANARY");
  check("…capped: max_session_seconds is always sent", post.body.max_session_seconds === 600);
  check("…with no green screen, no prompt, no persona and no key of the client's own", Object.keys(post.body).join() === "max_session_seconds");
  const tzNet = happy();
  await openConversation({ mint: async () => ({ ...MINT_OK, camera: true }), end: async () => ({ ok: true }), fetchImpl: tzNet.fetchImpl, maxSessionSeconds: 600, timezone: "America/Chicago", sleep: async () => {}, now: () => 0 });
  check("the user's time zone goes with the conversation when there is one - and nothing else new", JSON.stringify(tzNet.calls[0].body) === JSON.stringify({ max_session_seconds: 600, timezone: "America/Chicago" }));
  check("the events route is followed with the same token until admitted", n.calls.filter((c) => c.url.includes("/events")).length === 2 && n.calls.every((c) => c.headers.authorization === "Bearer st_TOKEN-CANARY"));
  check("no token of either kind is logged", !logs.join("\n").includes("CANARY") && !logs.join("\n").includes("lk_ROOM"));
  const src = readFileSync(join(HERE, "../src/nuance/nuance-session.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check("the client's code holds no API key and reads none", !/nk_|MATIC_NUANCE_API_KEY|process\.env/.test(src));
  check("…and never calls the token-minting endpoint itself", !src.includes("session-tokens"));
}

// ==============================================================================================
console.log("\n=== 2. every failure is a reason to carry on locally, never a throw ===");
{
  const cases = [
    ["the hub refuses: a cap", { mint: async () => ({ ok: false, status: 429, cap: "perDevicePerHour", retryAfterMs: 5000 }) }, "mint", "perDevicePerHour"],
    ["the hub is switched off", { mint: async () => ({ ok: false, status: 503 }) }, "mint", "unavailable"],
    ["the hub call throws", { mint: async () => { throw new Error("ECONNREFUSED"); } }, "mint", "unreachable"],
    ["a mint with no token in it", { mint: async () => ({ ok: true }) }, "mint", "unavailable"],
    ["capacity_unavailable", { net: net(() => ({ status: 429, body: { code: "capacity_unavailable", retry_after_seconds: 12 } })) }, "conversation", "capacity_unavailable"],
    ["concurrency_limit", { net: net(() => ({ status: 409, body: { code: "concurrency_limit" } })) }, "conversation", "concurrency_limit"],
    ["busy", { net: net(() => ({ status: 503, body: { code: "busy" } })) }, "conversation", "busy"],
    ["the network is gone", { net: net(() => ({ throw: "getaddrinfo ENOTFOUND" })) }, "conversation", "unreachable"],
    ["a 201 with no id", { net: net(() => ({ status: 201, body: {} })) }, "conversation", "unavailable"],
    ["it ends before it is admitted", { net: happy([[{ type: "preparing" }], [{ type: "ended", reason: "error" }]]) }, "admit", "ended:error"],
    ["it is never admitted", { net: happy([[]]), admitTimeoutMs: 3000 }, "admit", "timeout"],
    ["admitted with no room in it", { net: happy([[{ type: "admitted" }]]) }, "admit", "unavailable"],
  ];
  for (const [label, o, stage, reason] of cases) {
    let r, threw = false;
    try { ({ r } = await open(o)); } catch { threw = true; }
    check(`${label} -> { ok: false, degrade: true, stage: ${stage}, reason: ${reason} }`, !threw && r.ok === false && r.degrade === true && r.stage === stage && r.reason === reason, JSON.stringify(r));
  }
  const { r } = await open({ net: net(() => ({ status: 429, body: { code: "capacity_unavailable", retry_after_seconds: 12 } })) });
  check("a retry time from the service is carried", r.retryAfterMs === 12_000);
  const t = await open({ net: happy([[]]), admitTimeoutMs: 3000 });
  check("a conversation that was started and never admitted is ENDED, not left running - through the hub", t.ended.join() === "c-1");
  check("…and the client never calls the service's end route itself: its token is refused there (D317)", !t.n.calls.some((c) => c.url.endsWith("/end")));
}

// ==============================================================================================
console.log("\n=== 3. ending one ===");
{
  const asked = [];
  const r = await endConversation({ conversationId: "c-1", end: async (id) => { asked.push(id); return { ok: true }; } });
  check("endConversation asks the HUB to end it (D317: only the API key can)", r.ok === true && asked.join() === "c-1");
  check("a refusal is reported, not thrown", (await endConversation({ conversationId: "c-1", end: async () => ({ ok: false, reason: "refused" }) })).ok === false);
  const bad = await endConversation({ conversationId: "c-1", end: async () => { throw new Error("gone"); } });
  check("…and it never throws", bad.ok === false);
  const src2 = readFileSync(join(HERE, "../src/nuance/nuance-session.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check("nuance-session.js holds no call to the service's end route", !/\/end`/.test(src2));
}

// ==============================================================================================
console.log("\n=== 4. what main.js and the vendored library must keep true ===");
{
  const { createHash } = await import("node:crypto");
  const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const read = (rel) => readFileSync(join(HERE, rel), "utf8");
  const main = strip(read("../src/main/main.js"));
  const at = main.indexOf("function onWindowHidden()");
  const hidden = main.slice(at, at + 900);
  // 2026-11-17: a window was closed mid-session and no closing line was written, because main
  // asked the renderer to end the session and waited to be told.
  check("a hidden window ends the session IN MAIN - it does not wait for the renderer to say so", at > 0 && hidden.includes('personaOver("window-hidden");') && hidden.indexOf('personaOver("window-hidden");') < hidden.indexOf('"persona:end"'), hidden.slice(0, 160));
  check("a renderer that reloads or dies ends it too", main.includes('personaOver("renderer-reloaded")') && main.includes('personaOver("renderer-gone")'));
  check("quitting ends it", main.includes('personaOver("quit")'));
  const start = main.slice(main.indexOf('ipcMain.handle("persona:start"'), main.indexOf('ipcMain.handle("persona:mic"'));
  check("a session is refused with no visible window (D293), before anything is minted", start.includes('reason: "no-visible-window"') && start.indexOf("windowVisible()") < start.indexOf("openConversation("));
  check("…and the egress record's opening line says how the microphone started (D320)", /microphone: startsLive \? "on" : "off"/.test(start));
  check("the window may send two microphone events and no others", main.includes('event !== "user.mute" && event !== "user.unmute"'));
  check("whether the window is visible is read in main, never taken from the renderer", main.includes("windowVisible: windowVisible()"));
  const config = JSON.parse(read("../config.json"));
  check("the repository's config.json ships the live persona OFF", config.persona?.enabled === false && Number.isInteger(config.persona?.maxSessionSeconds));

  const lib = readFileSync(join(HERE, "../src/renderer/vendor/livekit-client.esm.mjs"));
  const sha = createHash("sha256").update(lib).digest("hex");
  check("the vendored library is the file its note says it is (sha256)", read("../src/renderer/vendor/livekit-client.VENDORED.md").includes(sha), sha);
  const importers = ["renderer.js", "persona-ui.js", "persona-stage.js"].filter((f) => read(`../src/renderer/${f}`).includes("./vendor/livekit-client.esm.mjs"));
  check("only persona-stage.js imports it", importers.join() === "persona-stage.js", importers.join());
  check("…and that file is reached by a dynamic import on the first click, never at page load", read("../src/renderer/persona-ui.js").includes('await import("./persona-stage.js")') && !strip(read("../src/renderer/renderer.js")).includes("persona-stage"));
  const stage = strip(read("../src/renderer/persona-stage.js"));
  check("the stage never logs what was said: no transcript or delta reaches devlog", !/devlog\([^;]*evt\.(transcript|delta)/.test(stage));
  check("the stage mutes the local track at the source as well as asking the service", stage.includes('setMicrophoneEnabled(result.state === "live")'));
  check("the stage builds no reply event of its own (the one builder is surface-split.js)", !stage.includes("response.create"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
