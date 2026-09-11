# Claude Code handover — the hub URL out of the spoken line, BUILT

**Asked for** directly, against the honesty ledger of
[`2026-09-10-claude-code-handover-panel-copy-built.md`](2026-09-10-claude-code-handover-panel-copy-built.md)
§5, which listed this as seen and out of scope: *"fix the hub URL leaking into the spoken failure
line. do the recommended."*

**Repo:** `C:\Users\Charles\Downloads\maticdesk_bot`, `main`, one commit on top of `a7f0b00`.
**Register:** §5.30, **D246**. **Client tests: 1012 assertions across 16 files, all green** (was 923).

---

## 1. What was wrong

`HubClient.fileTicket()` returned one `error` field, and the renderer **spoke it**. So a user whose
ticket had just failed heard, in Matic's voice:

> Could not reach the hub at http://127.0.0.1:8787: fetch failed. Nothing was sent.

Our word for the thing, our port number, and Node's phrasing — on the surface D240 exists to have
cleared.

**Five outcomes can reach that field and every one of them was ours:**

| where | what it said |
|---|---|
| `main.js` IPC | "This build cannot file tickets - no hub provider is configured." |
| `main.js` IPC | "The draft was incomplete, so nothing was sent." |
| `hub-client.js` | "No hub URL is configured, so nothing was sent." |
| `hub-client.js` | `body?.error ?? \`HTTP ${res.status}\`` — the hub's own log-facing error string, or **a bare status code, spoken** |
| `hub-client.js` | "The hub did not answer within 30s…" / "Could not reach the hub at …" |

---

## 2. The fix — two fields, two audiences

`fileTicket()` returns **`error`** (what the user is TOLD) and **`detail`** (what WENT WRONG).

- `error` comes from **`persona.filing`** — five keys, one per outcome. They are persona data because
  the avatar says them out loud (D234), which means `test/persona.test.mjs` now checks them against
  the capability-word and outcome-claim rules like every other spoken line.
- `detail` is the URL, the route, the HTTP status, the hub's own error text, the exception message.
  It goes to the **inspector**, the **developer log** and the **egress record**, and is never spoken.

**Nothing was deleted.** Every diagnostic that was in `error` is in `detail`, and `detail` is now the
*richer* of the two, because it can name the route without having to read well:

```
POST http://127.0.0.1:8787/v1/ticket failed: fetch failed
POST http://127.0.0.1:8787/v1/ticket refused: tenant devco does not exist
POST http://127.0.0.1:8787/v1/ticket timed out after 30s; it may or may not have been stored
```

`test/hub-client.test.mjs` drives all five paths and asserts, on each, that `error` contains none of
`{hub, a URL, an HTTP status, a Node error name, 127.0.0.1}`, that it is a member of
`persona.filing`, and that `detail` is non-empty.

**The timeout line claims neither outcome.** A timeout is the one case where nothing is known, and
that distinction is carried by `filed` (`false` = nothing stored, `null` = unknown), which the
renderer's note reads. So the spoken line is free to be short, and a test asserts it does not assert.

---

## 3. The sweep found two more, and they matter more

Writing the check for one string returned three. **"The hub" was also on the review card and in the
tickets band** — both read far more often than any failure, and the card is the one screen in the app
where a user is asked to approve data leaving the machine, naming its destination in our word.

| | before | now |
|---|---|---|
| card | "This is stored on **the hub** for IT to pick up. No email is sent **in this build**, so nobody is alerted automatically." | "This is stored for **the service desk** to pick up. No email goes out, so nobody is alerted automatically — someone has to come and look." |
| band | "Stored on **the hub** for IT to pick up. No email was sent, so nobody was alerted automatically." | "Stored for **the service desk** to pick up. No email went out, so nobody was alerted automatically." |

**Every fact survives** — stored, someone must come for it, no email, nobody alerted. That matters
because D245 made the card the single place the no-email fact is stated, so it is the one string that
may not lose any of it.

**Two assertions broke, and they were wrong to exist in that form.** Both pinned the *phrasing*
(`/No email is sent in this build/`). They pin the *facts* now, which is what CLAUDE.md's rule about
`escalationReply` already said: *"Pin the contract, never the phrasing."*

**"In this build" was left alone, deliberately.** It is jargon-adjacent — and it is the honest
temporal qualifier D235/D242 chose, and `persona.tickets.some` says it in exactly those words on
purpose, because D242 requires the band and the spoken answer to describe one ticket the same way.
Changing it on one surface would have broken that pairing silently. The test names the decision so
the next reader does not have to re-derive it.

---

## 4. The check that closes the class rather than the instances

`test/panel.test.mjs` §5b scans every literal `renderer.js` puts in front of a person:

- a literal third argument to `el(tag, cls, text)` — the only way this file writes to the DOM;
- a **ternary of two literals** in that position (the band's row picks its sentence that way, and the
  first version of this sweep missed it);
- every literal inside a `.textContent = …;` statement (the band notes are a nested ternary).

32 strings, and it fails on `hub` or a URL in any of them.

**Object-literal values are deliberately NOT scanned.** Those are the inspector's payloads and the
`SOURCE_NOTE` table that feeds `devlog` — this is a routing rule, not a ban, and a test asserting
those words are *gone* would be asserting the wrong thing. A check confirms `hub` is still in the
renderer, in both of those places.

**What it cannot see is a string built at run time from a variable.** `surfaceWrites` (§5) is the
other half, and between them they are a net, not a proof. Said here because it is the kind of limit
that gets forgotten and then relied on.

---

## 5. The branch had never been run

Reaching a failed filing needs a hub **up enough to make the offer** and **down enough to refuse the
filing**, which is why a spoken URL survived two integration passes and a screenshot review.

`panel-check.html` has two one-shot triggers now — *next filing: fails* and *next filing: times
out* — and the fake bridge returns `HubClient`'s failure shapes field for field, **reading the real
sentences out of `persona.json` rather than carrying copies**, because a check page with its own copy
of a string keeps passing on the day the real one changes.

Both were driven:

- **unreachable** → spoken *"I couldn't reach the service desk just now. Tell me if you'd like me to
  try again."*; note *"Nothing was filed."*; inspector and devlog carry
  `POST http://127.0.0.1:8787/v1/ticket failed: fetch failed`.
- **timeout** → spoken *"I'm not sure that one got through."*; note, in the attention style,
  *"The service desk did not answer in time, so whether the ticket was stored is unknown…"*;
  `filed: null` in the inspector.

The two do not say the same thing, which is the point: "nothing was stored" and "we don't know" are
different outcomes and a user acts differently on each.

`client/docs/PANEL-RENDERER-CHECK.md` has a new **§6a** for this, including how to reach it in the
real app (stop the hub while the review card is on screen).

---

## 6. Honesty ledger

- **Still nobody has watched any of this in Electron.** Everything was driven through
  `panel-check.html`, against a fake bridge. The failure shapes it returns are copies of
  `HubClient`'s by inspection, not by sharing code — `client/test/hub-client.test.mjs` is what keeps
  the real ones honest, and the two could drift apart without either failing.
- **The five persona sentences are my wording and nobody has been asked about them.** The tests check
  that each outcome HAS a line and that it names nothing internal; they do not check it is a good
  line. *"The service desk turned that one down"* in particular is doing a lot of work for a case
  that could be a bad tenant slug, a 500, or a malformed draft.
- **I changed the review card's caveat, which D245 made load-bearing.** Every fact is still in it and
  a test checks each one separately, but it is the sentence a user reads immediately before
  approving an egress, and it now reads differently from the one that was reviewed yesterday.
- **"Someone has to come and look" is new information on that card**, not just a rewording — it makes
  explicit what "no email" implied. I think that is right; it is still a change nobody asked for.
- **The §5b sweep is a net with a stated hole** (§4). It found two instances beyond the one that was
  reported, which is evidence it works and not evidence it is complete.
- **The `error`/`detail` split stops at `fileTicket`.** `say(exec.message)`, `say(prepared.error)`
  and `say(\`I can't do that one. ${validation.errors[0]}\`)` in the renderer all speak strings that
  come from the **broker**, and I have not audited those for the same defect. They are catalog-derived
  rather than transport-derived, so they are likelier to be fine — but "likelier to be fine" is not
  "checked", and nothing tests them.
