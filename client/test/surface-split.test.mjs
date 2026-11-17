/**
 * The surface split - what the live persona may say (D305, PROPOSED, 2026-11-17).
 *
 * Run: node test/surface-split.test.mjs        (from client/; part of `npm test`)
 *
 * docs/handovers/2026-11-16-v2-functional-analysis-persona-optimization.md §2.1 is the contract, and
 * this file is the enforcement mechanism for Decision D (register D301): THE PERSONA CARRIES NO
 * LOAD-BEARING STRING. A Nuance persona always rephrases - there is no "say exactly this" event -
 * so a pinned line handed to it stops being the line. Consent text (D128), the generated capability
 * answer (D165/D212), ticket wording (D288) and filing outcomes (persona.json rule 2) stay on the
 * panel, and what reaches the persona for them is a pointer at the screen.
 *
 * Pinned here:
 *   1. EVERY line in persona.json is classified, and nothing is classified that is not there. A new
 *      persona line with no entry FAILS - it does not default to being spoken.
 *   2. NO pinned line ever reaches `response.create`: every pinned string in persona.json is driven
 *      through the one builder and must not appear in what comes out, whole or in part.
 *   3. `response.create` is built in exactly one place.
 *   4. An unknown surface is pinned. The default is silence about content, never speech.
 *   5. Consent holds the floor; the two capabilities that drop the network close the session first.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import persona from "../src/router/persona.json" with { type: "json" };
import catalog from "../src/broker/catalog.json" with { type: "json" };
import {
  SURFACES, SURFACE_KINDS, POINTERS, INSTRUCTIONS_MAX, NETWORK_DROPPING_CAPABILITIES,
  surfaceOf, personaTurn, beforeExecute, consentRelease,
} from "../src/nuance/surface-split.js";

const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}

/** Every line persona.json holds, as [surface, text]. `$comment` keys and the identity fields are not lines. */
function personaLines() {
  const out = [];
  for (const [group, v] of Object.entries(persona)) {
    if (group.startsWith("$") || ["name", "team", "role", "vocatives"].includes(group)) continue;
    if (Array.isArray(v)) { for (const t of v) out.push([group, String(t)]); continue; }
    for (const [key, val] of Object.entries(v)) {
      if (key.startsWith("$")) continue;
      for (const t of Array.isArray(val) ? val : [val]) out.push([`${group}.${key}`, String(t)]);
    }
  }
  return out;
}
const lines = personaLines();
const instructionsOf = (turn) => turn.event?.response?.instructions ?? "";
/** Any six-word run of `text` appearing in `hay` - a paraphrase-proof "did the line get through". */
function leaks(text, hay) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9{}]+/g, " ").trim();
  const w = norm(text).split(" "), h = ` ${norm(hay)} `;
  if (w.length < 6) return w.length >= 3 && h.includes(` ${w.join(" ")} `);
  for (let i = 0; i + 6 <= w.length; i++) if (h.includes(` ${w.slice(i, i + 6).join(" ")} `)) return true;
  return false;
}

// ==============================================================================================
console.log("=== 1. every persona line is classified, and only those ===");
{
  const surfaces = [...new Set(lines.map(([s]) => s))];
  check("persona.json has lines to classify", lines.length > 30, String(lines.length));
  const missing = surfaces.filter((s) => !Object.hasOwn(SURFACES, s));
  check("no persona.json line is unclassified", missing.length === 0, missing.join(", "));
  const stale = Object.keys(SURFACES).filter((s) => !s.startsWith("@") && !surfaces.includes(s));
  check("no classification names a persona.json key that is gone", stale.length === 0, stale.join(", "));
  check("the kinds are a closed set", Object.values(SURFACES).every((k) => SURFACE_KINDS.includes(k)) && JSON.stringify(SURFACE_KINDS) === JSON.stringify(["persona", "pinned", "silent", "degraded"]));
  check("SURFACES is frozen", Object.isFrozen(SURFACES));

  // The functional analysis §2.1, row by row.
  for (const s of ["social.greeting", "social.howareyou", "social.thanks", "social.farewell", "social.nothingneeded", "boot"]) {
    check(`${s} is handed to the persona`, SURFACES[s] === "persona", SURFACES[s]);
  }
  for (const s of surfaces.filter((x) => /^(capability|tickets|fallback)\./.test(x)).concat(["social.offtopic"])) {
    check(`${s} is pinned`, SURFACES[s] === "pinned", SURFACES[s]);
  }
  for (const s of surfaces.filter((x) => x.startsWith("filing."))) {
    check(`${s} is never spoken`, s === "filing.timeout" ? SURFACES[s] === "silent" : SURFACES[s] === "pinned", SURFACES[s]);
  }
  check("filing.timeout gets NOTHING AT ALL - the most dangerous rephrase in the product", SURFACES["filing.timeout"] === "silent");
  check("bootState.offline cannot be the persona's: offline, there is no persona", SURFACES["bootState.offline"] === "degraded");
  check("consent, an executed change and the machine band are classified too", SURFACES["@consent"] === "pinned" && SURFACES["@execution"] === "pinned" && SURFACES["@machine"] === "silent" && SURFACES["@answer"] === "persona");
}

// ==============================================================================================
console.log("\n=== 2. no pinned line reaches response.create ===");
{
  let leaked = [], spoke = [];
  for (const [surface, text] of lines) {
    const kind = SURFACES[surface];
    const turn = personaTurn({ surface, text });
    if (kind !== "persona" && leaks(text, JSON.stringify(turn.event ?? {}))) leaked.push(surface);
    if ((kind === "silent" || kind === "degraded") && turn.event !== null) spoke.push(surface);
    if (kind === "pinned" && !Object.values(POINTERS).includes(instructionsOf(turn))) leaked.push(`${surface} (not a pointer)`);
  }
  check(`none of the pinned, silent or degraded lines (${lines.filter(([s]) => SURFACES[s] !== "persona").length}) appears in an event, whole or in part`, leaked.length === 0, [...new Set(leaked)].join(", "));
  check("a silent or degraded surface produces NO event", spoke.length === 0, [...new Set(spoke)].join(", "));

  // The social templates are handed over as a RULE, not as the template's words.
  const social = lines.filter(([s]) => SURFACES[s] === "persona");
  const carried = social.filter(([surface, text]) => leaks(text, instructionsOf(personaTurn({ surface, text }))));
  check("a handed-over social line is not sent either - the persona speaks from a rule, in its own words", carried.length === 0, carried.map(([s]) => s).join(", "));
  check("…and every handed-over surface has a rule to speak from", social.every(([surface]) => instructionsOf(personaTurn({ surface })).length > 20));
  check("nothingneeded's rule says not to reopen the conversation (D265)", /do not ask/i.test(instructionsOf(personaTurn({ surface: "social.nothingneeded" }))));

  // The panel still gets the exact text, always.
  check("the pinned text is returned for the PANEL, character for character", lines.every(([surface, text]) => personaTurn({ surface, text }).panelText === text));

  // Pointers point; they claim nothing.
  const capWords = catalog.capabilities.flatMap((c) => [c.id, c.title, c.plain?.what, c.plain?.helpsWith].filter(Boolean).map(String));
  for (const [name, p] of Object.entries(POINTERS)) {
    check(`pointer "${name}" fits the service's limit and names the screen`, p.length <= INSTRUCTIONS_MAX && /screen/i.test(p), p);
    check(`pointer "${name}" names no capability and claims no outcome`, !capWords.some((w) => leaks(w, p) || p.toLowerCase().includes(w.toLowerCase())) && !/\b(fixed|sent|filed|notified|restart|flush|renew|reset)\b/i.test(p.replace(/do not[^.]*\./gi, "")), p);
  }
  check("POINTERS is frozen", Object.isFrozen(POINTERS));
}

// ==============================================================================================
console.log("\n=== 3. the persona's own job, and the default ===");
{
  const a = personaTurn({ surface: "@answer", text: "Press Windows and Shift and S, then drag over what you want." });
  check("an answer from the router or the knowledge base IS carried to the persona", a.speak === "own" && instructionsOf(a).includes("Press Windows and Shift and S"));
  const long = personaTurn({ surface: "@answer", text: "word ".repeat(600) });
  check("an answer too long for one note is NOT truncated mid-way: it goes to the screen and the persona points", long.speak === "pointer" && Object.values(POINTERS).includes(instructionsOf(long)) && instructionsOf(long).length <= INSTRUCTIONS_MAX);
  check("no event ever exceeds the service's limit", lines.every(([surface, text]) => instructionsOf(personaTurn({ surface, text })).length <= INSTRUCTIONS_MAX));

  for (const s of ["something.new", "", undefined, "filing.somethingAddedLater", "@unknown"]) {
    const t = personaTurn({ surface: s, text: "I have sent that off for you and the team has been told." });
    check(`an unknown surface (${JSON.stringify(s)}) is PINNED: its text is not sent`, surfaceOf(s) === "pinned" && !leaks("I have sent that off for you and the team has been told.", JSON.stringify(t.event ?? {})));
  }
  const m = personaTurn({ surface: "@machine", text: "Printing - Stopped" });
  check("the machine band is never narrated (D245)", m.event === null && m.speak === "none");
  const e = personaTurn({ surface: "@execution", text: "I restarted the Print Spooler service and it is running." });
  check("the result of a change is on the screen, not in the persona's mouth - it is an outcome claim", e.speak === "pointer" && !instructionsOf(e).includes("Print Spooler"));
}

// ==============================================================================================
console.log("\n=== 4. consent holds the floor ===");
{
  const c = personaTurn({ surface: "@consent", text: "EVERY network connection on this machine drops for several seconds, including any remote session, call or download." });
  check("a consent card is a pointer, and its text does not travel", c.speak === "pointer" && !/network connection|remote session/i.test(JSON.stringify(c.event)));
  check("…the pointer says nothing happens until they approve", /approve/i.test(instructionsOf(c)) && /do not describe/i.test(instructionsOf(c)));
  check("…and the floor is held, with a reason, ending on speech", c.floor?.type === "session.floor.hold" && typeof c.floor.reason === "string" && c.floor.reason.length <= 200 && c.floor.ends_on_speech === true);
  check("the hold goes BEFORE the reply in the order to send", c.send[0] === c.floor && c.send[1] === c.event);
  check("no other surface holds the floor", lines.every(([surface, text]) => personaTurn({ surface, text }).floor === null));
  check("approve or dismiss releases it", consentRelease().type === "session.floor.release" && Object.keys(consentRelease()).join() === "type");
}

// ==============================================================================================
console.log("\n=== 5. a change that drops the network closes the session first ===");
{
  const ids = catalog.capabilities.map((c) => c.id);
  check("the two named capabilities exist in the catalog", NETWORK_DROPPING_CAPABILITIES.every((id) => ids.includes(id)) && [...NETWORK_DROPPING_CAPABILITIES].sort().join() === "renew_dhcp,reset_adapter");
  for (const id of ids) {
    const b = beforeExecute(id);
    const drops = NETWORK_DROPPING_CAPABILITIES.includes(id);
    check(`${id}: ${drops ? "say so, then CLOSE the session before it runs" : "the session stays up"}`, drops
      ? b.closeSession === true && b.send.at(-1)?.type === "session.close" && b.send[0]?.type === "response.create" && b.degradeTo === "local" && b.offerToReturn === true
      : b.closeSession === false && b.send.length === 0);
  }
  // The detector: a capability whose own consent notice says the network drops must be on the list.
  const says = catalog.capabilities.filter((c) => /network[^.]*drops|connection[^.]*drops|drops[^.]*network/i.test(String(c.plain?.notice ?? ""))).map((c) => c.id);
  check("every capability whose catalog notice says the network drops is on the list", says.every((id) => NETWORK_DROPPING_CAPABILITIES.includes(id)) && says.length >= 2, says.join());
  check("an unknown capability closes the session too - unknown is never the permissive branch", beforeExecute("something_new").closeSession === true);
  check("the line before the close claims no outcome and describes no change", !/\b(fixed|restart|reset|renew|adapter|dhcp)\b/i.test(beforeExecute("reset_adapter").send[0].response.instructions));
}

// ==============================================================================================
console.log("\n=== 6. one builder ===");
{
  const dir = join(HERE, "../src/nuance");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const hits = readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => [f, (strip(readFileSync(join(dir, f), "utf8")).match(/response\.create/g) ?? []).length]).filter(([, n]) => n > 0);
  check("`response.create` is written in exactly one file under src/nuance, once", hits.length === 1 && hits[0][0] === "surface-split.js" && hits[0][1] === 1, JSON.stringify(hits));
  const elsewhere = ["../src/renderer/renderer.js", "../src/main/main.js", "../src/agent/agent.js"].filter((f) => strip(readFileSync(join(HERE, f), "utf8")).includes("response.create"));
  check("…and nowhere in the renderer, the main process or the agent", elsewhere.length === 0, elsewhere.join());
  check("surface-split.js imports only persona-free data: nothing from the renderer, the broker's internals or the network", !/from "\.\.\/(renderer|broker\/(win32|capabilities)|main)/.test(readFileSync(join(dir, "surface-split.js"), "utf8")));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
