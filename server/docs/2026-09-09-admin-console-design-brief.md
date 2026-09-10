# Admin console — design brief for Claude Design (2026-09-09)

**What this is:** the brief for the UI and aesthetics pass on the admin console, handed over the day
the scaffold was built and clicked through. The console is real: every screen has real data or an
honest, stated reason for having none. The design team is reacting to something true, not to a
mockup of data that does not exist — which is why this pass waited until now (handover §5 of
[`../../docs/handovers/2026-09-05-claude-code-handover-admin-console-scaffold.md`](../../docs/handovers/2026-09-05-claude-code-handover-admin-console-scaffold.md)).

**The canvas:** <https://claude.ai/code/artifact/bec3816b-1019-424a-a5fb-46c70a53a47f> — eleven
artboards, each one a screen exactly as the hub served it on 2026-09-09 (owner's view and auditor's
view), with these asks pinned as notes beside the screens they concern. It is private until shared
from its own share menu.

**What the console is for:** the founder's direction is *all admin functionality in one place,
extremely intuitive*. `04-TEAM-REVIEW` §9 A5 is *"one IT person can maintain a catalog"*, and this
console is the instrument that tests it. The measure is minutes: an admin's few minutes converting
into the product getting better. Read [`B2-ADMIN-CONSOLE.md`](B2-ADMIN-CONSOLE.md) for what is built.

---

## 1. Constraints the design must keep

These are decisions, not preferences. A design that breaks one is not implementable here.

- **Server-rendered HTML, no JavaScript, no framework, no build step, no new dependency** (D221).
  The pages carry a Content-Security-Policy with no script source at all, so nothing on a page can
  run a script. Every form works with scripting off. Hover states and CSS transitions are fine;
  anything that needs a click handler is not.
- **One inline stylesheet**, in `server/src/admin/html.js`. No icon font, no web font that needs a
  fetch, no image that is not inline. A system font stack is the current choice; a Google Font is
  possible only if the team accepts that the PDF export and any offline install falls back.
- **The six-destination information architecture is ratified** (handover §3): Review queue (home,
  D177), Tickets, Knowledge, Agents, Metrics, Settings. Reorder within reason; do not add, remove or
  merge destinations.
- **The words that state a limitation stay as words**, in the place the reader is looking. "Nobody
  has been emailed" on every ticket surface (D213). "self_asserted — not authenticated" on the
  reporter. "Deflection cannot be computed" with its reason. These may be styled; they may not
  become an icon, a tooltip, or a footnote. The project has been burned twice by a UI implying an
  integration that did not exist.
- **No zero for an absent concept.** The Agents page shows no count because enrollment is not built.
  A design that puts "0 devices" on it teaches the operator the product is broken.
- **Roles see less, not greyed-out more.** A destination the role cannot open is not drawn. The
  auditor artboards show what that looks like today.
- **Everything reachable in two clicks. One obvious next action per screen.**

## 2. The three asks (in the order they matter)

### Ask 1 — the review queue's gap card, and where "approve" lives

The review queue is the screen A5 lives or dies on. Today it is fourteen identical cards, each a
decline the assistant logged. That is the right content and the wrong shape: once the hub logs
question text (a configuration switch), each card carries one sentence — the employee's question —
plus what was retrieved and why it was not enough.

Wanted: a **compact list with one card expanded**, not a stack; and a place for the **one-click
approve / "answer this gap"** action D177 asks for. The action is not built yet — design where it
goes and what it looks like when it is one click. Assume four feeds (drafts, gaps, staleness,
duplicates) will all have items eventually; only gaps has items today.

### Ask 2 — counts everywhere

An admin should know where the work is without opening anything. Today there are two badges, on
Review queue and on Tickets. Where does a count belong on each screen, and on each row within a
screen, so that "where is the work" is answered at a glance? Counts must be real or absent; a count
of a thing that does not exist yet is Ask 3's problem.

### Ask 3 — the honest stub

Five screens explain their own emptiness. Today each is a beige dashed box with a heading, one bold
sentence for what is missing, a paragraph for why, and one line for what supplies it. It is honest
and it looks like an error. Make *"not in this build — here is why — here is what supplies it"*
look deliberate: the product knowing what it is, not the product being broken. The same component
has to work for a whole screen (Agents) and for one section of an otherwise live screen (Metrics'
deflection, Knowledge's search).

## 3. Smaller things worth an opinion

- **The ticket queue** at seven rows and at three hundred. The state tiles double as filters.
- **The ticket detail**: the one action is the state change; the reporter block must keep its
  identity caveat in words.
- **The sign-in page** carries the loopback-only notice and must keep it.
- **The audit log** is a table of dotted action names and JSON detail. It is for an auditor; make it
  scannable without hiding the detail.
- **Density and type**: the current 15px system stack and 1100px max width were chosen for
  legibility over density. A denser stance is welcome if it survives a 1366-wide laptop.

## 4. What the team hands back

Artboards on the same canvas (or a new one) plus, for anything the current stylesheet cannot
express, the CSS. Engineering implements as changes to `html.js` and the page templates; there is
no component library to update, which is why exact values (colours, spacing, radii, weights) are
more useful than a mood board.

## 5. What not to spend time on

- Not the information architecture, the role model or the wording of limitations (above).
- Not the KB editor, search, ingestion, agents or metrics dashboards: none exists yet, and designing
  them before their data exists is how the stubs became necessary in the first place. The next
  engineering pass is KB ingestion and search; a second brief follows it.
- Not mobile. The console is a desktop tool for an IT admin.
