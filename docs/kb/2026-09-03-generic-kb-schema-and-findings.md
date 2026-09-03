# Generic KB — Ingestion Schema and First Content

**Date:** 2026-09-03
**Content:** `generic-kb-v1.json` — 6 troubleshooting articles + 2 platform reference articles.
**Source:** two JSON files supplied 2026-09-03, restructured. Original values preserved where safe;
every change is listed in §2.
**Classification:** generic KB (D45) — vendor-authored, no entitlement rules, no customer data.
Ships in the signed catalog bundle, safe at rest, available offline (D40).

---

## 1. The finding: three articles instruct the user to do things the product must not

This is the reason the transform is not a mechanical reshape.

### 1a. "Briefly disable local firewalls to test if they are blocking VPN traffic"

**Removed.** An IT assistant that tells users to disable a security control is a
**social-engineering template with a trusted UI around it.** It fails a security review on sight,
and it is the exact shape an attacker would want the product to normalise — "your IT assistant told
you to turn off your firewall" becomes a credible pretext once users have seen the real thing do it.

Replaced with: confirm whether a firewall is in the path, and escalate. Diagnosis without the
destructive step.

### 1b. "Bot checks for VPN client updates, resets credentials"

**Removed.** Credential reset is not one of the four primitives and is nowhere in the catalog. Worse,
the *description field itself* asserts a capability. If a KB article says the bot resets credentials,
two things follow: a user believes it can, and — under D53, where the hub assembles the model's
context from retrieved chunks — **the model reads it as license to propose something.**

That is threat-model **G4** (A5 versus the model context) arriving in the first six articles ever
written. Not hypothetical.

### 1c. Driver and firmware installation

"Updates the GPU driver", "install the latest DisplayLink or OEM firmware updates". **Rewritten as
escalation triggers.** Driver and firmware installation needs admin rights the user does not have
(single-source, §2 constraints), and a failed firmware update bricks a dock. Also worth noting the
design partner's fleet has no discrete GPUs, so "update the GPU driver" is inapplicable there
anyway.

### 1d. "Unlink and relink the local PC"

**Rewritten.** Unlinking a sync client with unsynced local changes is a data-loss path. Kept as an
escalation trigger with the check that precedes it ("verify the files exist in the web interface"),
which is the genuinely useful part.

### The rule this produces

> **A KB article describes the problem and what the user can do. It never describes what the bot
> does, and it never names a capability.**

Capability selection belongs to the tier-0 router and the signed catalog (H3d — typed primitives,
never scripts). Article text that names capabilities creates a path from content into proposals,
which is exactly what H5's second clause and G4 exist to prevent. **No article field in this schema
references a catalog capability.** If that linkage is wanted later it should be a catalog-side
annotation, not article prose.

---

## 2. Every change from the supplied data

| Change | Why |
|---|---|
| `description` field dropped | Described bot behaviour, not the problem (§1b) |
| `resolution_steps` → `guidance` | Steps a *user* performs; no bot voice |
| Firewall-disable step removed | §1a |
| Credential-reset claim removed | §1b |
| Driver/firmware install steps → `escalateWhen` | §1c |
| Unlink/relink → `escalateWhen` | §1d |
| `priority: P2/P3/P4` dropped | ITSM ticket priority, not a KB property. Priority belongs on the task record (D70's base fields); putting it on an article invites conflation with risk tiers R0–R3, which measure something else entirely |
| `environment` values normalised | Supplied as `"WFH"`, `"Both"`, `"In-Office / WFH"` — three formats, one of them ambiguous. Enum: `any` / `remote` / `office` |
| `platform` split, not flagged | See §3 |
| Shortcuts file → 2 articles, not 13 | See §4 |
| Added `symptoms` | See §5 — highest-value retrieval field |
| Added `doNotAttempt` | See §6 |
| Added `lifecycle: "unvalidated"` | D156. These are authored, not measured |
| Added `provenance` | Auditability of generic content |

---

## 3. Platform: a retrieval filter, not a display toggle

The request was that Mac and Windows users see their own content. Implemented as **metadata
filtering before retrieval, not conditional rendering after it.**

The difference matters. If a Windows user's query retrieves a macOS article and the client hides it,
that article still consumed one of the 3–5 chunks that reach the model (D158) and still competed for
rank. Filtering at query time — a `WHERE platform IN ('windows','any')` clause on both the pgvector
and `tsquery` legs — costs nothing and keeps the retrieved set clean.

**Platform comes from the machine-state probe, not from the user.** It is already collected.

**One honest note:** macOS is post-v1 and out of scope, so macOS articles ship with no client to
display them. That is fine — they cost nothing at rest and the alternative is writing them twice.

---

## 4. The shortcuts file: why 13 shortcuts became 2 articles

Transforming each shortcut into its own article would be the obvious mechanical move and it would
**degrade retrieval measurably.** A document whose entire content is `Copy — Ctrl + C` produces an
embedding with almost no signal, and thirteen of them would crowd the top-k for any query mentioning
a keyboard.

So: **one reference article per platform**, each containing only that platform's shortcuts as a
table. Two articles, each substantial enough to embed usefully, each pre-filtered by §3 so a Windows
user never sees Mac keys at all.

This also introduces a second article type. `type: "reference"` is a lookup table; `type:
"troubleshooting"` is a problem with guidance. They want different retrieval weighting — a reference
article should not rank for "my VPN is broken" — and D155's Problem/Resolution structure does not fit
a lookup at all.

### Shortcut accuracy — `[VERIFY]`

I could not verify these; no web access in this session. Three worth checking before signing:

- **`Redo` on Windows as `Ctrl + Y`** is application-dependent. `Ctrl + Y` in Office, `Ctrl + Shift +
  Z` in many other applications. A single answer will be wrong somewhere.
- **`Show Desktop` on macOS as `F11`** — I believe the current standard is `Cmd + F3` (Mission
  Control), with `F11` depending on the function-key preference. Unconfirmed.
- **`Capture Screenshot` pairing is consistent** — `Win + Shift + S` and `Cmd + Shift + 4` are both
  region capture, correctly matched. `Cmd + Shift + 3` is full-screen, if a second row is wanted.

These are signed content that a user will act on. Worth ten minutes of verification.

---

## 5. `symptoms` — the field that does the most retrieval work

D155 weights Title and Problem above Resolution *because users describe problems, not fixes*. But an
authored title like "VPN Authentication / Tunneling Failure" is written in IT vocabulary, and the
user types "can't get to the shared drive from home."

`symptoms` is an array of **user-phrasing strings**. It feeds the lexical leg directly and gives the
dense leg something written in the register a user actually uses. It is cheap to author — the person
writing the article has just read the ticket that prompted it — and it is the field D160's gap queue
should pre-fill from the unanswered query that created the gap.

`keywords` is separate and holds the opposite: error codes, product names, exact strings
(`DisplayLink`, `OneDrive`, `0x…`). These are precisely the tokens dense embedding fails on and BM25
succeeds on — the reason D158 is hybrid rather than semantic-only.

---

## 6. `doNotAttempt` — borrowed from a measured result

The bake-off's second intervention was `whenNotToUse` on tool descriptions, and it measurably
improved every model, taking R2 false actions to zero. Telling the model what a thing *doesn't* help
with was as valuable as describing what it does.

`doNotAttempt` applies the same idea to knowledge: explicit negative guidance in the article. "Do not
disable the firewall to test this." "Do not unlink the sync client while local changes are pending."

Two benefits. It is a place to put the §1 removals as *positive instruction* rather than silent
omission — so a future author does not helpfully add them back. And under D53, where article text
enters the model's context, it constrains the model in the direction that measurably worked.

**This is a hypothesis by analogy, not a measured result.** It should be tested the way
`whenNotToUse` was: a bake-off run with and without.

---

## 7. Schema

```jsonc
{
  "id": "slug-case-stable-forever",        // stable; retrieval logs and tombstones reference it
  "type": "troubleshooting" | "reference",
  "title": "string",                        // IT vocabulary is fine here
  "category": "network" | "software" | "hardware" | "peripherals" | "account" | "productivity",
  "platform": "windows" | "macos" | "any",  // pre-retrieval filter (§3)
  "environment": "any" | "remote" | "office",
  "lifecycle": "draft" | "unvalidated" | "validated" | "archived",   // D156

  "problem": "string",                      // what the user experiences. Weighted above guidance
  "symptoms": ["user-phrasing", "..."],     // §5 — highest-value retrieval field
  "keywords": ["exact", "strings"],          // §5 — feeds the lexical leg
  "guidance": ["step the USER performs"],    // never bot voice, never names a capability
  "escalateWhen": ["condition"],             // when to hand to a human
  "doNotAttempt": ["explicit negative"],     // §6
  "cause": "string | null",                  // D155; often unknown, and null is honest
  "body": "markdown | null",                 // reference type only: the table

  "provenance": {
    "source": "vendor-authored",
    "authoredOn": "2026-09-03",
    "reviewedBy": null                       // null until a human signs off — D165
  }
}
```

**Not included, deliberately:** any capability reference (§1), ITSM priority (§2), entitlement
expression (generic content has none — that field belongs to customer KB only, D44).

---

## 8. What this content is not

**It is not volume data, and it should not be mistaken for it.** These six articles are a plausible
authored hypothesis about what matters. The top-30 ticket categories — outstanding since early
August, named in B5 as the load-bearing assumption of the whole architecture — is a *measurement* and
this is not a substitute for it.

Concretely: five of the six articles are network, software or peripheral issues that the four Win32
primitives cannot resolve, and all six resolve by **advising the user or escalating**. That is
consistent with the KB-first phasing in D149 and with the bake-off's finding that the model
contributes least where it is most reliable. It is also a small sample of one person's intuition.

`lifecycle: "unvalidated"` (D156) is the honest state for all eight articles until retrieval and
outcome data say otherwise. They are retrievable at reduced ranking weight with a visible confidence
marker, which is exactly the right posture for content nobody has tested.

---

## 9. Honesty ledger

- No web access this session; the shortcut accuracy items in §4 are unverified, and two of them I
  believe are wrong.
- `doNotAttempt` (§6) is reasoning by analogy from a measured result, not itself measured.
- The §1 removals are my judgment about what a security reviewer would object to. The firewall one I
  am confident about; the OneDrive unlink is a data-loss judgment call and a reasonable person might
  keep it with a warning.
- Nothing here is measured. The article set is 8 items and the corpus needs to be orders of magnitude
  larger before retrieval behaviour means anything.
