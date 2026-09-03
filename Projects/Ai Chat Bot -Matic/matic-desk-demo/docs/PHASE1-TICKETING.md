# Phase 1 — filing tickets to the Hub

**Status: not built. Not for Sunday.** Captured 2026-09-02 while the context was fresh.

Today the escalation payload is **displayed and never sent**, and the UI says so in the transcript
and in the inspector. That is in the honesty ledger and it stays true until this is built.

---

## 1. What was asked for

> We will need to eventually add some kind of user profile so that we can open tickets to the Hub
> (name, user location). User may need to add additional screenshot or notes to the ticket that is
> included with the AI summary of the request/interaction. User should be able to validate ticket
> before sending.

Four parts: **a user profile**, **an AI summary of the interaction**, **user-supplied notes and
screenshots**, and **user validation before anything is sent**.

---

## 2. What already exists to build on

More than it looks.

**The escalation payload.** The `escalate` tool already returns a structured object, and the model
is structurally unable to return anything else:

```json
{
  "summary": "User reports a cracked laptop screen.",
  "category": "physical",
  "whatWasChecked": "Machine is online with all network services running normally...",
  "suggestedOwner": "facilities"
}
```

`category` and `suggestedOwner` are enums. That is most of a ticket already.

**The machine identity.** `agent.identify()` returns computer and user, and `diagnose()` returns
the full probe — services, adapters, addressing. A ticket wants all of that attached.

**The consent pattern.** "User should be able to validate before sending" is *exactly* the shape
already built for privileged actions: propose → validate → show the user precisely what will
happen → single-use consent token bound to a hash of the proposal → execute → audit. The right
answer is almost certainly to reuse it rather than invent a second approval flow.

---

## 3. The decision that shapes everything else

**Does filing a ticket go through the broker?**

The consent-and-audit machinery fits perfectly. But the broker's job so far is *privileged local
actions*, and filing a ticket is an *outbound network action* — a different risk class. A bug in
`restart_service` costs a service restart. A bug in `file_ticket` sends the customer's data
somewhere.

Two coherent answers:

- **Extend the broker.** One consent flow, one audit log, one place a reviewer looks. Costs: the
  broker gains a network egress path, and `BROKER-SURFACE.md` — the allowlisting document — grows
  a destination as well as a set of APIs.
- **A second, parallel flow.** Keeps the privileged half purely local. Costs: two approval
  mechanisms to keep honest, and two audit stories.

**Recommendation: extend the broker, and make egress an explicit capability tier of its own** —
not R1/R2, which describe local disruption, but something like `E1` meaning "this leaves the
machine". The consent card already reads *"Permission needed — Low risk"*; it would read
*"Permission needed — Sends data off this machine"*, which is the honest thing for a user to weigh.

---

## 4. Screenshots are the risk, not the feature

A screenshot captures **whatever is on screen** — another customer's record, an open payslip, a
password manager, an email thread. Attaching one to a ticket sends all of it.

Non-negotiables if this is built:

- The user sees the **exact image** that will be attached, full size, before approving. Not a
  thumbnail, not a description.
- The capture is of a **user-chosen window or region**, never the full desktop by default.
- Attachment is **opt-in per ticket**. Never automatic, never remembered.
- Nothing is captured until the user asks. No pre-emptive screenshots "in case they help".
- The audit record notes **that** an image was attached and its dimensions and hash — never the
  image itself.

The same reasoning applies to the transcript. An "AI summary of the request/interaction" means the
user's own words leave the machine. That is reasonable for a support ticket and it must be
**visible in the validation step**, not summarised out of view.

This is consistent with the line already drawn: the computer name and username are shown in the
panel and deliberately **not** sent to the model, because the model does not need them. Tickets
are the other side of that policy — the Hub *does* need them, so they go, with consent, and the
user sees exactly what.

---

## 5. Open questions

**The user profile — where does name and location come from?**

- Typed by the user: simple, offline-safe, and wrong the moment someone moves desk.
- Read from AD / Entra: correct and self-maintaining, and a new dependency and permission.
- Read from the machine and confirmed by the user on first run: probably the right compromise.

Location is the hard one. A machine does not know which floor it is on. Ask once, store it, and let
the user correct it.

**What happens offline?**

Scenario 2 is the differentiator, and with the cable out there is no Hub to reach. Options: refuse
and say so plainly, or queue and send later. **A queue is a whole subsystem** — durable storage,
retry, deduplication, expiry, and a way for the user to see and cancel what is pending. Do not
build a queue by accident. If tickets cannot be filed offline, say that in the UI and move on.

**Idempotency.** A retried submission must not open a second ticket. Whatever the Hub's API is, a
client-generated key is needed from day one, not added after the first duplicate.

**Where does the ticket ID go?** The user needs it, and the audit record should carry it so a local
action can be tied to a ticket afterwards.

---

## 6. Suggested shape, if and when it is built

1. `escalate` gains an optional follow-up: **"Would you like me to raise this with the Hub?"**
2. A **draft ticket** is assembled locally: profile, machine identity, the escalation payload, the
   relevant transcript, and any notes or screenshot the user adds.
3. The user sees the **complete draft, verbatim** — every field, the full transcript, the actual
   image — and edits or removes anything before approving.
4. Approval mints a **consent token bound to a hash of the exact draft**, as capability consent
   works today. A draft altered after approval cannot ride the old token.
5. Submission is **audited**: what was sent, to where, when, the returned ticket ID — and for the
   screenshot, its hash and dimensions, never its content.

Steps 3 and 4 are the whole point, and they are the part already proven to work.

---

## 7. Not before Sunday

The demo's honesty depends on the escalation payload being **displayed and not sent**, and the UI
saying so. Half-building this would break that, and the audience is a technical IT lead who will
ask what happens to the data.

Until it is built, the honest line stands: *"That payload is displayed, not sent. There's no ITSM
integration here and the interface says so."*
