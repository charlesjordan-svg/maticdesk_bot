# B6-lite — the ticket store

**Built 2026-09-04.** Register: [`../../docs/decisions/DECISION-REGISTER.md`](../../docs/decisions/DECISION-REGISTER.md) §5.20, D213–D218.

---

## 0. Read this first

**This is not B6.** The Phase 1 plan's B6 is *"ticket store at OPEN-4's subset, **plus outbound
email**"*. OPEN-4's subset is create, assign, a state machine, visibility-split comments (D69),
attachments, search and a dashboard.

**What exists is create, and a four-state machine. There is no email.**

D86 says outbound email is not an enhancement to this store — it is part of it:

> With the hub as SoR there is no assignment group, no on-call rotation, no L2 queue — those came
> free with the ITSM.

So **a ticket filed here is a record, not a queue entry.** Nobody is told. The only thing that
makes a filed ticket discoverable today is somebody running `npm.cmd run tickets -- list`.

That gap is repeated on five surfaces, deliberately:

| Surface | What it says |
|---|---|
| `POST /v1/ticket` response | `notified: false` plus `notifiedWhy` |
| `GET /v1/health` | `tickets.notifies: false` |
| The endpoint's review card | "No email is sent in this build, so nobody is alerted automatically." |
| The endpoint's transcript, after filing | "stored for IT to pick up. No email was sent." |
| `bin/tickets.mjs list` | "NOBODY HAS BEEN EMAILED" on every listing |

**The redundancy is the point.** The failure this project has hit twice — on the dev box on
2026-09-02 and on screen on 2026-09-04 — is a UI implying an integration that does not exist.
Filing into a table nobody watches while saying *"a ticket has been raised"* would be that same
defect wearing a database. Five surfaces means claiming otherwise requires ignoring a value rather
than not knowing one.

---

## 1. Cold start

```bash
cd server
npm.cmd run db:up                        # PostgreSQL 17 + pgvector, loopback, 5433
npm.cmd run migrate                      # control + every tenant schema
node bin/db.mjs create-tenant devco      # REQUIRED - tickets are tenant data (D143)
npm.cmd start                            # http://127.0.0.1:8787
```

**A tenant is required and there is none by default.** `bin/db.mjs tenants` on a fresh database
reports `no tenants`, and without one `/v1/ticket` answers **503 with the command that fixes it**
rather than 404.

Which tenant is chosen, in order:

1. `MATIC_TICKET_TENANT`, if set. Always wins.
2. Otherwise, **the single active tenant, if there is exactly one.** Logged loudly at startup.
3. Otherwise nothing, and `/v1/ticket` answers 503.

Rule 2 is deliberately narrow. It never runs when there is a choice to make, because picking one of
several would be inventing a routing rule nobody decided. It is server-side, so nothing a client
sends can influence it — **a tenant in a request body is still refused with a 400**, exactly as
`/v1/ask` refuses one, for the reason in `src/kb/ask.js`: a client that can name its own tenant *is*
the tenancy model.

---

## 2. The route

`POST /v1/ticket` → `201`

```json
{
  "description": "the screen on my laptop is cracked right across the bottom",
  "summary": "The user reports a cracked screen on their laptop.",
  "whatWasChecked": "Machine is online; no service faults.",
  "machineName": "Wakanda",
  "category": "hardware",
  "suggestedOwner": "desktop_support",
  "reporter": {
    "osUsername": "Charles",
    "firstName": "Ada", "lastName": "Lovelace",
    "location": "HQ, second floor, desk 14",
    "contactId": "ada.lovelace@example.com"
  }
}
```

**`description` and `summary` are different claims and must stay separate** (D214). `description` is
the user's own words — evidence. `summary` is the model's case note, written in the third person for
whoever picks the ticket up, and **it is never spoken to the user**; reading it aloud is precisely
the defect that produced this whole feature.

`suggestedOwner` **may be null**, and that is not an error. The model is instructed not to guess, an
unroutable problem is still worth filing, and the queue shows it as `unrouted`.

The enums are checked in three places — client, route, and a database `CHECK`. Not redundancy: the
client's copy stops a model's invention reaching a screen, the route's stops a bad request becoming
a 500 with a constraint violation in it, and the database's is the one no future writer can skip.

---

## 3. Schema

`migrations/tenant/003-tickets.sql`, applied to every tenant schema by the B1 runner.

**`users` was already there.** B1 created it shaped for a directory (D55, D145 SCIM) that does not
exist. 003 adds the self-asserted profile the endpoint can actually supply: `first_name`,
`last_name`, `location`, `contact_id`, `os_username`, `profile_source`.

Two things about that:

- **`profile_source` defaults to `'self_asserted'` and every reader shows it.** `logon_sid` — the
  column that would carry a broker-attested identity (D148) — stays NULL, because the pipe that
  would carry an attestation is designed and not built (D200/D201). There is no device auth either
  (D61/D132). **A ticket's reporter is whoever typed into the profile file.**
- **The profile columns are separate from `external_id`/`upn` on purpose.** When a directory
  arrives it writes those, and these become the fallback — rather than a sync having to overwrite
  whatever a person once typed.

The upsert key is a partial unique index on `os_username WHERE os_username IS NOT NULL`, and the
update uses `COALESCE(EXCLUDED.x, users.x)` so a later ticket with a partial profile **cannot blank
fields the user already gave**. Verified.

`tickets.session_id` is a nullable, non-unique FK. D75 makes a session first-class and distinct from
a ticket, with one session producing zero, one or several. **The endpoint creates no sessions**, so
the column is always NULL — recording that honestly rather than inventing one session per ticket.
D89's `escalated` outcome consequently still has nothing setting it.

References come from `ticket_reference_seq`: `MD-1000`, `MD-1001`, … A rolled-back insert burns a
number, because sequences are non-transactional. That is correct — a reference must never be reused,
and a gap in `MD-####` means nothing to anyone who reads one.

---

## 4. Reading the queue

```bash
npm.cmd run tickets -- list
npm.cmd run tickets -- list --state new --limit 20
npm.cmd run tickets -- show MD-1000
npm.cmd run tickets -- state MD-1000 open
npm.cmd run tickets -- users
```

Until B6 grows email, **this command is the queue.** It exists so that "a ticket was filed" is a
checkable claim rather than a row requiring SQL to see: an unreadable store and no store are the
same thing to the person waiting for help.

---

## 5. What is verified, and what is not

**Verified against PostgreSQL 17.11:**

- Migration 003 applies clean to a new tenant, in the same run as 001 and 002.
- A ticket is stored and returns a reference; the reporter is upserted; a second ticket from the
  same OS user reuses the same `users` row and **does not blank the fields it omitted**.
- A client-supplied tenant is refused (400). An off-list category is refused (400). A missing
  `reporter.osUsername` is refused (400). A null `suggestedOwner` is accepted.
- B1's six exit criteria and B7a's retrieval tests still pass with 003 applied
  (`npm.cmd run test:db`, 108 assertions).
- End to end through a real agent, a real hub and a real model: `npm.cmd run e2e:ticket` from
  `client/`. Escalate → offer → interview → draft → filed, plus a decline and the
  new-problem-after-an-offer case.

**These are pass/fail against a real system. None of them is a performance number** and this
changes nothing about the four measurements in register §10.3.

**NOT verified:**

- **The review card has never been seen on a screen.** `e2e-ticket.mjs` approves the draft in code.
  Whether the card renders its fields correctly is a click-through — and a click-through is what
  produced this entire feature, so the gap is recorded rather than assumed.
- **No load of any kind.** Two tickets in a dev tenant.
- **Nothing about whether the case notes a model writes are actually useful to an IT person.** They
  read plausibly. That is not the same claim.
