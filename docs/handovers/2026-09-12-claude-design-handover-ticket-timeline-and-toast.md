# Claude Design — a ticket's timeline in the panel, and an update that arrives while the app is behind another window

**Date:** 2026-09-12. **Two surfaces, one question each. Self-contained: Design does not have this
repo, so nothing here depends on a file you may not hold.** Sending this is Charles's act.

**Reads with:** your September panel delivery (`matic-desk-panel.html`), which the app still draws
verbatim, and the export rules in the request of 2026-09-10 (restated in §4 below because they
decide whether what you send can be built at all).

---

## 0. What changed on our side, so the ask makes sense

When you drew the panel, the tickets band could honestly say one thing: which tickets THIS machine
had filed. You drew `.tstat b` in three variants — the default live colour, `.you` (attention) and
`.closed` (quiet) — and we used only the default, with the words "Filed from here / Progress not
visible", because no status was knowable then.

Since 2026-09-12 the endpoint holds a credential, polls the service desk once a minute for its own
tickets, and is HANDED every public entry the desk writes. So:

- the band's rows now carry a status label and a detail line, in your three variants;
- when the desk writes, one line appears in the transcript with the desk's words quoted in full;
- when the window is not in front, the taskbar button flashes;
- nothing is spoken (Charles's decision), and the face does not change.

That is everything the app can do with an update today, and two things it cannot are what this
brief asks you to draw. **We deliberately did not sketch them ourselves** — the panel is your
delivery, and an app that draws a surface and then asks Design to match it inverts the arrangement.

### What the user reads today, so you can decide what to keep

| where | text (produced by the app; the hub's state names never appear) |
|---|---|
| band label (`.tstat b`) | **At the desk** · **Being looked at** · **Waiting on you** (`.you`) · **Closed** (`.closed`) · **Filed from here** (when the desk could not be reached) |
| band detail (`.tstat span`) | New from the service desk, not yet seen here · The desk says it's fixed · Last update from the desk 20 minutes ago · No update from the desk yet · Progress not visible |
| transcript, a reply | The service desk replied on MD-1042: “Try turning the printer off and on.” Replying from this window isn't built yet — quote MD-1042 if you follow it up. |
| transcript, a resolution | The service desk has marked MD-1042 as fixed. Their note: “Reinstalled the driver” If that's not right, the ticket can be reopened — from this window that isn't built yet, so quote MD-1042 if you follow it up. |
| band note | This is what I sent from this machine, with what the service desk showed when I last checked. I check every minute or so while I'm on screen, and nothing is sent to you by email. Quote the reference if you follow one up. |

**The two "isn't built yet" clauses are the gap this brief closes.** They are true today and we
would rather they were not.

---

## 1. The ticket timeline view

**The question:** when a user opens a ticket from the band, what do they see, and where do they
type?

### What the service desk gives the app for one ticket

Eleven fields about the ticket and a list of PUBLIC entries — the desk's internal work notes are
never sent, by design. Each entry has a kind, an author, a time, the text, and two delivery stamps.

| ticket | entries (each) |
|---|---|
| reference (`MD-1042`) · state (`new` `open` `resolved` `closed`) · category · machine name · created · updated · resolution code + notes (when resolved) · resolved at · closed at · closed by (`console_user` or `requester`) | kind: `comment` · `resolution` · `state_change` — author: the desk (an email) or the requester — created — text (up to 4000 chars) — handed-at / seen-at (the hub's clock) |

State names are the hub's and **must not appear on the screen as themselves** (a rule the whole app
follows). The words above are the current glosses; **please review them** — they were chosen to fit
150 px of small capitals and are a first draft.

### What the view has to let the user do

| the user wants to | what the app will call | when it is available |
|---|---|---|
| read the whole public conversation | already built | always |
| reply | `comment(reference, text)` — a public entry; on a resolved ticket this REOPENS it | ticket not closed |
| say the fix worked | `confirm(reference)` — closes the ticket, resolution kept | ticket resolved |
| say the fix did not work | `comment(reference, text)` with a reason — reopens it | ticket resolved |
| follow up a closed ticket | file a NEW ticket that carries `reopenedFrom` | ticket closed |

**Two decisions already made that constrain the drawing:**

1. **A comment on a resolved ticket IS the reopen.** There is no separate "reopen" gesture with an
   empty reason: "Still not fixed" needs words, and those words are the comment. So a resolved
   ticket wants two affirmative actions — *That fixed it* and *Still not fixed* — and the second
   opens the same box a reply uses.
2. **A closed ticket is read-only.** The one action is *Raise a new ticket about this*, which
   pre-fills nothing and links the two tickets on the desk's side.

### Things we would like you to decide

- **Where the view lives.** In the tickets band (a row expands), or as a third scene beside
  first-run and live? The app has exactly two `data-scene` values and no other switcher; a third
  is a real change, not a tweak.
- **How the requester's own entries and the desk's read differently**, given that the desk's carry
  a delivery state ("handed / seen") on the console side and the requester's do not — the user
  never needs to see a stamp about themselves.
- **What "Waiting on you" looks like when it is the one row asking something.** Everything else on
  the band is information; this is a question.
- **The resolution note's prominence.** It is the desk's sentence written FOR the requester (a rule
  we enforce server-side); a comment is conversational.
- **The state words** (§0 table). They are ours only because nobody else had written any.

### What the view must NOT do

- Show a status the desk did not say. The band already falls back to "Filed from here / Progress
  not visible" whenever the last poll could not reach the desk; the view has to degrade the same
  way rather than hide.
- Say "sent", "notified" or "emailed" anywhere. Nothing is emailed; the desk sees a comment in its
  console queue, and that is the whole delivery.
- Put a state name, an author kind or a snake_case value on the screen as itself.
- Offer an action the ticket's state forbids (Confirm on an open ticket; Reply on a closed one). The
  hub refuses these with a 409 and a sentence, and the app will show that sentence — but a button
  that is refused every time it is pressed is a defect.

---

## 2. The toast: an update arrives while the app is not in front

**The question:** what does a user working in another program see when the service desk replies?

Today: the taskbar button flashes (Windows's own attention signal), and when they bring the window
up, the transcript line is waiting. Charles has said an update is **not spoken**.

### Constraints that are decisions, not preferences

- **Shown, not spoken.** The toast is silent. (A sound is a separate decision nobody has made; assume
  none.)
- **It carries the desk's words**, or enough of them to be worth clicking — a toast saying "You have
  an update" teaches the user to dismiss toasts.
- **It never claims an outcome.** "Your ticket was fixed" is the desk's claim, not a fact; the desk
  said "marked as fixed", and the toast says what the desk said.
- **Clicking it brings the panel up on that ticket** — which means it depends on §1 existing. If
  §1 does not exist yet, clicking brings the panel up and the transcript line is there; that is what
  happens today with the taskbar flash.
- **It is a second window.** Electron gives us a frameless, always-on-top `BrowserWindow` we can
  place; it does not give us the Windows notification centre's own toast without a dependency, and
  the app has none. So this is a small window you draw — size, position, how long it stays, whether
  it stacks when two tickets update in the same minute, whether it shows at all when the panel IS
  in front (we think not: the transcript line is enough there).

### The one number you are picking, and why it is a design question

How long the toast stays. Too short and a user who glanced away missed the desk's only sentence;
too long and it is the thing they close without reading. There is no measured answer; whatever you
choose will be a default in `config.json`, movable, and labelled unvalidated like every other number
in this app.

---

## 3. Next steps — both halves, in order (Charles asked for these)

**On your side**
1. §1 first: the timeline view, with the state words reviewed. §2 depends on it.
2. §2 second: the toast window, drawn at the sizes it will actually be — one update, two stacked,
   and one with a long resolution note.
3. Send as a buildable export (§4).

**On ours, when §1 lands**
1. Wire the view to `ticket(reference)` — the read exists and already stamps "handed" on the desk's
   side.
2. Add the ONE channel the app forbids today: a preload call that carries the requester's WORDS to
   `comment()`. A test currently fails if such a channel appears, on purpose — it is there so the
   composer arrives with its view and not before. That test is rewritten when the view lands.
3. *That fixed it* → `confirm()`; *Still not fixed* → `comment()`; *Raise a new ticket* → the existing
   filing flow with `reopenedFrom` set.
4. Refusals (409) shown in the desk's own sentence, beside the button that was pressed.
5. Only THEN the conversational path — "it's fixed" / "it's not fixed" typed or spoken → the same two
   calls — because an intent needs a screen to land on and to be undone from.

**On ours, when §2 lands**
1. A second `BrowserWindow` driven by the same `ticket:update` push the transcript line uses.
2. Click → focus the panel, open the ticket (§1).
3. The duration and the stack rule as `config.json` defaults, labelled unvalidated.

---

## 4. Export rules — restated, because they decide whether it can be built

Unchanged from the request of 2026-09-10; the short form:

- **Every visual decision in the `<style>` block, as class rules.** We copy that block verbatim into
  the app's stylesheet; inline `style=` attributes never reach the app.
- **Class names the app already uses are fixed** (the September delivery's 90 plus the re-export's 32
  invented names, all adopted). You may ADD names — the timeline view and the toast are new surfaces,
  so most of theirs will be new. Renaming an existing one silently unstyles what it was on.
- **No `<link rel="stylesheet" href="https://…">`** — the machine is routinely offline. Name the
  families and let them fall back, as your delivery does.
- **No `<script src>`, no framework, no templating.** Repeated rows: draw two or three literal ones.
- **Your 39 `--matic-ui-*` tokens are the palette**; the app may not redefine one, so a colour that
  is not a token is a colour we cannot use.
- **Check before sending:** open the file with the network off. If it looks right, it is buildable.

Thank you. The band's three `.tstat b` variants turned out to be exactly right two days after you
drew them — we would like the rest of the ticket's life to have the same head start.
