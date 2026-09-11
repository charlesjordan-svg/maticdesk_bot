/**
 * Build the Claude Design handover bundle into Downloads.
 *
 * Claude Design does not have the repo, so the bundle has to carry everything they need to work:
 * their own last delivery, the app markup and renderer that define the class contract, the 155
 * lines the app adds itself, and - the point of the whole exercise - a SELF-CONTAINED page that
 * shows the band at four sizes plus a problem state, so the growth can be SEEN rather than
 * described.
 *
 * IDENTITY FIELDS ARE PLACEHOLDERS ON PURPOSE. The disk figures are real, because 17.5% free with
 * 163 GB is the entire argument behind the severity constraint; the machine name, account and
 * addresses are not, and D249 says this project treats them as sensitive in a corporate setting.
 */
import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = "C:/Users/Charles/Downloads/maticdesk_bot/";
const PANEL = REPO + "client/src/renderer/panel/";
const OUT = "C:/Users/Charles/Downloads/matic-design-handover-2026-09-11/";

for (const d of ["", "their-last-delivery", "app", "screenshots"]) mkdirSync(join(OUT, d), { recursive: true });

// THE BRIEF ITSELF IS VERSION-CONTROLLED AND COPIED OUT, never written here. Two copies of one
// argument drift, and the drift is invisible until Design answers the older one.
copyFileSync(REPO + "docs/handovers/2026-09-11-claude-design-handover-machine-band-rows-FULL.md",
  join(OUT, "README.md"));

// ---- 1. the files they need ------------------------------------------------------------------
const copies = [
  [PANEL + "matic-desk-panel.html", "their-last-delivery/matic-desk-panel.html"],
  [PANEL + "matic-panel.css", "app/matic-panel.css"],
  [PANEL + "matic-panel.app.css", "app/matic-panel.app.css"],
  [REPO + "client/src/renderer/index.html", "app/index.html"],
  [REPO + "client/src/renderer/renderer.js", "app/renderer.js"],
];
for (const [from, to] of copies) copyFileSync(from, join(OUT, to));
console.log(`copied ${copies.length} files`);

// ---- 2. the class contract, generated rather than hand-listed --------------------------------
const indexHtml = readFileSync(REPO + "client/src/renderer/index.html", "utf8");
const rendererJs = readFileSync(REPO + "client/src/renderer/renderer.js", "utf8");
const panelCss = readFileSync(PANEL + "matic-panel.css", "utf8");
const appCss = readFileSync(PANEL + "matic-panel.app.css", "utf8");

const fromMarkup = new Set();
for (const m of indexHtml.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) if (c) fromMarkup.add(c);
// Classes the RENDERER creates at run time - el(tag, cls, text) and a few literals.
const fromRenderer = new Set();
for (const m of rendererJs.matchAll(/\bel\(\s*"[a-z]+"\s*,\s*"([^"]*)"/g)) {
  for (const c of m[1].split(/\s+/)) if (c) fromRenderer.add(c);
}
const declared = new Set();
for (const m of panelCss.matchAll(/\.([a-zA-Z][\w-]*)/g)) declared.add(m[1]);

const all = [...new Set([...fromMarkup, ...fromRenderer])].sort();
const unstyled = all.filter((c) => !declared.has(c));

writeFileSync(join(OUT, "class-contract.md"), `# The class contract — generated, not hand-listed

Generated from \`app/index.html\` and \`app/renderer.js\` on 2026-09-11. **A rule naming something not
on this list styles nothing.** You may add names; renaming one silently unstyles what it was on.

- **${fromMarkup.size}** classes appear in the app's markup.
- **${fromRenderer.size}** are created by the renderer at run time (\`el(tag, cls, text)\`).
- **${all.length}** distinct names in total.
- **${declared.size}** class selectors are declared in your \`matic-panel.css\`.

## The machine band's own contract — the four that matter for this brief

| name | where it comes from | what it is |
|---|---|---|
| \`mgrid\` | \`index.html\` (\`<dl class="mgrid" id="machineGrid">\`) | the two-column grid. **The app never writes to it except by appending rows.** |
| \`mrow\` | **the renderer**, one per row | the row wrapper |
| \`dt\` / \`dd\` | the renderer, inside each \`.mrow\` | bare elements, no class |

That is the whole of it. The band's content is a list of \`[label, value]\` pairs and the renderer
appends \`.mrow > dt + dd\` for each — so **anything you draw has to be expressible as a label, a
value, and optionally an attribute we set on the row.**

## Names in the app that your stylesheet does not declare (${unstyled.length})

These are either ours (hooks, state attributes) or drawn by \`app/matic-panel.app.css\`. Listed so
nothing here is a surprise; **none of it is a request.**

${unstyled.map((c) => "- `" + c + "`").join("\n")}

## Every name, for reference

${all.map((c) => "`" + c + "`").join(" · ")}
`);
console.log(`class contract: ${all.length} names, ${unstyled.length} not declared in your CSS`);

// ---- 3. the page that shows the problem -------------------------------------------------------
const FIXED = [
  ["This computer", "PLACEHOLDER-PC"],
  ["Signed in as", "placeholder.user"],
  ["Last restarted", "1 day ago"],
  ["Memory", "Plenty free"],
  ["Printing", "Running normally"],
  ["Sound", "Running normally"],
  ["Network adapter", "Placeholder Gigabit Ether"],
  ["Network", "Connected, address given out automatically"],
  ["This machine's address", "10.0.0.42"],
  ["Router", "10.0.0.1"],
];
// THE WORDS COME FROM THE PRODUCT, NOT FROM ME. Writing them by hand put "Plenty of room - 47 GB
// free" on a sample page, and the real rule calls anything under 50 GB "Getting full" - a wrong
// string in a design brief costs a delivery. This is the same rule the check page's fake bridge
// follows for the filing sentences: a copy keeps reading correctly on the day the real one changes.
const { describeVolume } = await import("file:///C:/Users/Charles/Downloads/maticdesk_bot/client/src/agent/disk-space.js");
const GB = 1024 ** 3;
const disk = (letter, freeGb, totalGb) => {
  const d = describeVolume({
    root: `${letter}:\\`, freeBytes: freeGb * GB, totalBytes: totalGb * GB, freeFraction: freeGb / totalGb,
  });
  return [`Disk space (${d.root})`, `${d.words} — ${d.free} free`];
};

// The real figures from the machine this was written on - these carry the severity argument.
const REAL_FIVE = [
  disk("C", 163, 930), disk("D", 414, 1849), disk("E", 163, 932),
  disk("F", 1659, 3726), disk("G", 501, 1863),
];

const PROBLEM_FIXED = FIXED.map(([l, v]) => {
  if (l === "Last restarted") return [l, "41 days ago"];
  if (l === "Memory") return [l, "Almost full"];
  if (l === "Printing") return [l, "Stopped"];
  return [l, v];
});

const rows = (list) => list.map(([l, v]) =>
  `            <div class="mrow"><dt>${l}</dt><dd>${v}</dd></div>`).join("\n");

const band = (title, note, list) => `
      <section class="sample">
        <h2>${title}</h2>
        <p class="why">${note}</p>
        <div class="frame">
          <div class="band band-machine">
            <div class="band-head">
              <div class="band-title">Here's what I can see</div>
              <div class="band-note" style="margin-left:auto">Checked just now</div>
            </div>
            <dl class="mgrid">
${rows(list)}
            </dl>
          </div>
        </div>
      </section>`;

// Ten drives, and the last two are deliberately NOT all healthy - a 20-row band where every row
// says the same thing would understate the problem, and 47 GB really is "Getting full".
const TEN = [[163, 930], [414, 1849], [163, 932], [1659, 3726], [501, 1863],
             [88, 500], [920, 2000], [240, 1000], [1100, 2000], [47, 500]];
const tenDrives = ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]
  .map((l, i) => disk(l, TEN[i][0], TEN[i][1]));

const page = `<!doctype html>
<html lang="en" data-theme="light" data-band="machine">
<head>
<meta charset="utf-8">
<title>Matic Desk — the machine band at four sizes</title>
<style>
/* ============================================================================================
   YOUR OWN STYLESHEET, INLINED VERBATIM.
   This is matic-panel.css, which npm run panel:build generates by copying your <style> block
   out of matic-desk-panel.html. Nothing below this banner has been edited. It is inlined rather
   than linked so this file opens with the network off and from anywhere on disk.
   ============================================================================================ */
${panelCss}
/* ============================================================================================
   PAGE CHROME FOR THIS SAMPLE ONLY. Not part of the app, not a request, not a design.
   ============================================================================================ */
body { margin:0; background:var(--matic-ui-ground); color:var(--matic-ui-ink);
       font-family:var(--matic-ui-font-body); }
.wrap { max-width:1040px; margin:0 auto; padding:28px 20px 80px; }
h1 { font-family:var(--matic-ui-font-head); font-size:24px; margin:0 0 6px; }
.lede { color:var(--matic-ui-ink-muted); font-size:14px; line-height:1.55; margin:0 0 4px; max-width:70ch; }
.sample { margin-top:38px; }
.sample h2 { font-family:var(--matic-ui-font-head); font-size:17px; margin:0 0 4px; }
.why { color:var(--matic-ui-ink-quiet); font-size:12.5px; line-height:1.5; margin:0 0 10px; max-width:78ch; }
.frame { border:2px solid var(--matic-ui-line); }
.frame .band { display:block; }
.controls { margin:18px 0 0; display:flex; gap:8px; align-items:center; }
.controls button { font:inherit; font-size:13px; padding:6px 12px; cursor:pointer;
       background:var(--matic-ui-surface); color:var(--matic-ui-ink);
       border:var(--matic-ui-hair) solid var(--matic-ui-line); }
.count { font-family:var(--matic-ui-font-mono); font-size:12px; color:var(--matic-ui-ink-quiet); }
</style>
</head>
<body>
<div class="wrap">
  <h1>The machine band, at four sizes and one problem state</h1>
  <p class="lede">Your stylesheet, your markup, your row wrapper. The only thing that changes between
  the five panels below is <strong>how many rows the machine happened to have</strong>. Identity
  values are placeholders; <strong>the disk figures are real</strong>, because they carry the
  constraint in §2 of the brief.</p>
  <div class="controls">
    <button id="t">Light / dark</button>
    <span class="count">self-contained — open it with the network off</span>
  </div>
${band("1 — one drive: the common case on the fleet this ships to (11 rows)",
  "This is close to what you drew: a short, scannable list. Nothing here needs fixing.",
  [...FIXED, disk("C", 163, 930)])}
${band("2 — two drives (12 rows)",
  "Still fine. The grid is square and reads cleanly.",
  [...FIXED, disk("C", 163, 930), disk("D", 414, 1849)])}
${band("3 — five drives: the machine this brief was written on (15 rows)",
  "The drives read ACROSS and wrap — C,D / E,F / G alone in a half-empty final row — and five rows all saying &ldquo;Plenty of room&rdquo; is most of the growth and almost none of the information.",
  [...FIXED, ...REAL_FIVE])}
${band("4 — ten drives: not hypothetical, and the size any design has to survive (20 rows)",
  "A workstation with external drives attached reaches this. The band is now longer than the conversation it sits above.",
  [...FIXED, ...tenDrives])}
${band("5 — five drives, and this machine is in trouble (15 rows)",
  "THE SEVERITY CASE, and the reason §2 of the brief thinks it is worth most. Printing is stopped, memory is almost full, one drive has 8 GB left, and it has not been restarted in 41 days. Find them. Nothing on this panel looks any different from panel 3.",
  [...PROBLEM_FIXED, disk("C", 8, 200), disk("D", 414, 1849),
    disk("E", 163, 932), disk("F", 1659, 3726), disk("G", 501, 1863)])}
</div>
<script>
  document.getElementById("t").addEventListener("click", () => {
    const r = document.documentElement;
    r.dataset.theme = r.dataset.theme === "dark" ? "light" : "dark";
  });
</script>
</body>
</html>
`;
writeFileSync(join(OUT, "band-at-four-sizes.html"), page);
console.log(`band-at-four-sizes.html: ${(page.length / 1024).toFixed(0)} KB, self-contained`);

// ---- 4. the screenshot ------------------------------------------------------------------------
try {
  copyFileSync(
    "C:/Users/Charles/AppData/Local/Temp/claude/C--Users-Charles-Downloads/0f293a8a-8f2e-4b52-a623-16b6ac1eb020/scratchpad/machine-band.png",
    join(OUT, "screenshots/machine-band-15-rows-real-app.png")
  );
  console.log("screenshot copied");
} catch (err) {
  console.log("screenshot NOT copied:", err.message);
}

console.log("\nbundle at " + OUT);
