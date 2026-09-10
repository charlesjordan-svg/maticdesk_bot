# Handover to Claude Design — the Matic Desk admin console (2026-09-09)

**From:** the Claude Code session that built the console. **For:** the Claude Design session doing
the UI and aesthetics pass. **Owner:** Charles Jordan, founder.

Every path below is absolute. Nothing in this document needs the hub to be running; §4 says how to
run it if you want the live pages.

---

## 1. What you are being asked to do, in one paragraph

Take an admin console that **works and is honest but is not yet good to look at**, and give it a
visual system. The console exists, has real data on every screen or a stated reason for having none,
and is built as server-rendered HTML with one inline stylesheet and no JavaScript. Your output is
**artboards plus the CSS that realises them**, constrained by §3, answering the three asks in §5.
Engineering (a Claude Code session) implements your output as changes to one stylesheet and seven
page templates. You are not designing features that do not exist yet.

## 2. Where everything is

| What | Absolute path or URL |
|---|---|
| **The canvas to work on** — eleven artboards, every screen exactly as the hub served it on 2026-09-09, owner's view and auditor's view, with the asks pinned as notes beside the screens they concern | <https://claude.ai/code/artifact/bec3816b-1019-424a-a5fb-46c70a53a47f> |
| **The design brief** — constraints, the three asks, smaller questions, deliverables, what not to do. **Read this first.** | `C:\Users\Charles\Downloads\maticdesk_bot\server\docs\2026-09-09-admin-console-design-brief.md` |
| **What is built and why** — the engineering document: exit criteria, decisions taken while building, security notes, the click-through, the honesty ledger | `C:\Users\Charles\Downloads\maticdesk_bot\server\docs\B2-ADMIN-CONSOLE.md` |
| **The one stylesheet and the page shell** — the CSS you are restyling lives in a single constant in this file, with the `page()` shell, the `notYet()` stub component, `stat()` tiles and the escape-by-default template | `C:\Users\Charles\Downloads\maticdesk_bot\server\src\admin\html.js` |
| **The seven page templates** — the markup each screen renders | `C:\Users\Charles\Downloads\maticdesk_bot\server\src\admin\pages\login.js`, `review.js`, `tickets.js`, `knowledge.js`, `agents.js`, `metrics.js`, `settings.js` |
| **The screens as static HTML files** — the same pages the canvas was built from, openable in any browser with no server. Links between them are rewired to work from disk. `login.html`, then `owner_*.html` (tenant owner) and `auditor_*.html` (read-only role) | `C:\Users\Charles\Downloads\Claude Handover Files\admin-console-as-built-2026-09-09\pages\` |
| **The canvas working files** — one `.dc.html` per artboard, `canvas.json` for layout and notes, and the assembled canvas `matic-desk-admin-console.html` (open it in a browser for a local, view-only copy) | `C:\Users\Charles\Downloads\Claude Handover Files\admin-console-as-built-2026-09-09\canvas\` |
| **The original founder handover** that scoped the console — §3 is the information architecture, §5 says why design comes now | `C:\Users\Charles\Downloads\maticdesk_bot\docs\handovers\2026-09-05-claude-code-handover-admin-console-scaffold.md` |
| **The build handover** — what was done, what was found and left | `C:\Users\Charles\Downloads\maticdesk_bot\docs\handovers\2026-09-09-claude-code-handover-admin-console-scaffold-built.md` |
| **The decision register** — the ratified decisions the design must respect are D177 (home is the review queue), D213 (nobody is emailed), D221–D224 (§5.23, this console) | `C:\Users\Charles\Downloads\maticdesk_bot\docs\decisions\DECISION-REGISTER.md` |
| **The repo and branch** | `C:\Users\Charles\Downloads\maticdesk_bot`, branch `b2-admin-console` at commit `7ccb892` (not merged to `main`, not pushed) |

## 3. Constraints — decisions, not preferences

A design that breaks one of these cannot be implemented. Read them before drawing anything.

1. **Server-rendered HTML. No JavaScript at all.** The pages carry a Content-Security-Policy with no
   script source, so nothing can run a script. Hover states and CSS transitions are fine. Anything
   needing a click handler, a modal, a drag, a live filter or a toast is not. Every form is a plain
   HTML form that works with scripting off.
2. **One inline stylesheet, no external assets.** No icon font, no web font that needs a fetch, no
   image that is not inline SVG. The current type is a system font stack. A Google Font is possible
   only if you accept that the PDF export and any offline install fall back to system fonts.
3. **No framework, no build step, no new dependency.** Plain CSS. Custom properties are fine and the
   current stylesheet uses them.
4. **The six destinations are fixed and ratified**: Review queue (home), Tickets, Knowledge, Agents,
   Metrics, Settings. Reorder within reason. Do not add, remove, rename or merge one.
5. **Words that state a limitation stay as words, where the reader is looking.** "Nobody has been
   emailed" on every ticket surface. "self_asserted — not authenticated" on the reporter.
   "Deflection cannot be computed" with its reason. Style them; do not turn them into an icon, a
   tooltip, a footnote or a colour. This project has twice shipped a UI that implied an integration
   that did not exist, and this is the rule that came out of it.
6. **No zero for an absent concept.** The Agents page shows no count because device enrollment is
   not built. "0 devices" teaches the operator the product is broken. Where a number exists it is
   shown; where the concept does not exist, the screen says so and shows nothing numeric.
7. **A role that sees less sees less, not greyed-out more.** A destination the role cannot open is
   not drawn. The two `auditor_*` artboards show what that looks like today.
8. **Desktop only.** An IT admin at a desk, 1366 to 1920 wide. No mobile.
9. **Everything reachable in two clicks. One obvious next action per screen.**

## 4. The live console, if you want it (optional)

Static files in §2 are enough. If you want to click the real thing, from Windows PowerShell 5.1,
**one line at a time, no `&&`** — it is a parser error in this shell:

```powershell
cd C:\Users\Charles\Downloads\maticdesk_bot\server
npm.cmd run db:up
$env:MATIC_EMBED_PROVIDER = "none"
npm.cmd start
```

Then open <http://127.0.0.1:8787/admin/login>. It is loopback-only by design. Sign-in needs an
email, a password and a six-digit authenticator code. Charles holds the credentials; a Claude session
does not type passwords into a browser and should not be given them. To make a fresh account, from
a second PowerShell window:

```powershell
cd C:\Users\Charles\Downloads\maticdesk_bot\server
node bin/admin.mjs create-user devco someone@example.com --role tenant_owner
```

It prints the password and the authenticator secret once. `node bin/admin.mjs totp <secret>` prints
the current code.

## 5. The asks, in priority order

Full text in the brief (§2 there). In short:

1. **The review queue's gap card, and where "approve" lives.** This is the screen the product's
   economics rest on (an IT person's few minutes turning into a better knowledge base). Today:
   fourteen identical cards. Wanted: a compact list with one card expanded, room for one sentence of
   question text per item once logging is on, and a designed place for a one-click "answer this gap"
   action that is not built yet.
2. **Counts everywhere.** Two badges today (Review queue, Tickets). Where does a count belong on each
   screen and each row so "where is the work" is answered at a glance? Counts are real or absent.
3. **The honest stub.** Five screens explain their own emptiness with a beige dashed box. Make
   "not in this build — here is why — here is what supplies it" look deliberate, not broken. The same
   component must work as a whole screen (Agents) and as one section of a live screen (Metrics).

Smaller: the ticket queue at 7 rows and at 300; the ticket detail's single action; the sign-in
page's loopback notice; the audit log's scannability; density versus the current 15px / 1100px
choice.

## 6. Deliverables

1. **Artboards on the canvas** (or a new canvas, linked back) for: the review queue, one ticket's
   detail, the ticket list, one honest-stub screen, and the sign-in page. Owner's view is enough;
   show one auditor view if the layout changes when destinations are hidden.
2. **The CSS** for anything the current stylesheet cannot express, as a replacement for or patch to
   the `CSS` constant in `C:\Users\Charles\Downloads\maticdesk_bot\server\src\admin\html.js`. Exact
   values — colours, spacing, radii, weights, line heights — are what engineering needs. A mood board
   is not.
3. **Any markup change** described against the page template it belongs to (§2 lists the seven).
   Keep every limitation sentence in the markup.
4. **A short note of what you did not do and why**, in the same spirit as the engineering documents.

Hand back by saving the canvas and telling Charles where the CSS and notes are. Engineering applies
them, reruns the 296 static and 188 database assertions (several of which check the rules in §3, for
example that no page carries a script or an unescaped interpolation), and puts the result in front of
Charles.

## 7. Out of scope

- The information architecture, the role model, the wording of limitations.
- The knowledge editor, search, ingestion, agents, metrics dashboards: none exists yet. A second
  brief follows the next engineering pass.
- Anything that needs JavaScript. If a design idea depends on it, note it as a wish for a later
  decision rather than drawing it as if it were available.
- Mobile.

## 8. Things worth knowing so nothing surprises you

- The ticket rows on the canvas are real. Charles Jordan is the reporter on all seven and his
  contact address is visible on the ticket detail. The canvas is private until shared.
- The gap cards say the question text was not logged. That is true of the development database: the
  hub logs question text only when a configuration switch is on. Design for the card with a sentence
  in it; the empty version is the fallback.
- Frame heights on the canvas are estimates. If a screen shows spare background at the bottom or
  clips, that is the frame, not the page.
- The engineering session that built this could not click through the console in a browser (it does
  not type passwords). Charles did, on 2026-09-09, and signed in as the tenant owner. The screens on
  the canvas are what he saw.
