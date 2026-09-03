# docs/kb/ — the generic knowledge base

Vendor-authored articles that ship in the signed catalog bundle (D45), safe at rest on the
endpoint and available offline (D46). No entitlement rules, no customer data, no reference to any
catalog capability. Schema and rules: **D162** and **D163** in
[`../decisions/DECISION-REGISTER.md`](../decisions/DECISION-REGISTER.md).

| File | What |
|---|---|
| [`generic-kb-v2.json`](generic-kb-v2.json) | **The six generic articles**, filed 2026-09-03 from `Downloads\generic-kb-v2.json`. v2 supersedes v1 — v1 is not filed and must not be: it carried a VPN article (org-specific, and the only one touching credentials and security controls) and unverified macOS shortcuts. Amended in place on 2026-09-03 after verification — see the `changelog` field. |
| `2026-09-03-generic-kb-schema-and-findings.md` | **Not on disk.** The handover (`Downloads\2026-09-03-claude-code-handover-first-build-steps.md`, Task 0) meant it for this directory; it existed only as a chat artifact and was not found anywhere under the user profile on 2026-09-03. Its §3 (KCS claims) was flagged as unverified memory; the verification that would have corrected it is recorded below and in the register (§10.4) instead. If the document turns up, file it here and apply those corrections to it. |

## The rule every article follows (D162)

**An article describes the problem and what the user can do. It never describes what the bot does
and never names a capability.** The first six articles supplied contained "Bot resets credentials" —
threat-model gap G4 (content reaching the model's context) arriving in the first content ever
written. Nothing in this directory may say what Matic Desk will do; the catalog says that, and the
broker enforces it.

`platform` is a **pre-retrieval filter**, not a display toggle: an article for the wrong platform is
never retrieved, so it can never reach the model's context. `doNotAttempt` is a **hypothesis** (D163),
by analogy with the measured `whenNotToUse` result; it has not been measured and should be tested
the same way.

## Verified 2026-09-03 against primary sources (handover Task 5)

Retrieved from the publishers' own pages; full citations in the register §10.4.

- **KCS v6 (Consortium for Service Innovation).** Article structure is Issue, Environment,
  Resolution, Cause (optional) plus metadata; the four confidence states are exactly
  *Work in Progress (WIP)*, *Not Validated*, *Validated*, *Archived*. Audience is a five-level
  attribute (Internal, Within a Domain, Partners, Customers, Public), not a binary, and KCS allows an
  *Internal Resolution* field hidden on externally visible articles. **What this means for the
  schema:** our `lifecycle` value `unvalidated` maps to KCS *Not Validated*; if the lifecycle is to
  claim KCS alignment it should use the KCS names, and the schema will need an audience attribute
  before any article is customer-visible. Our `problem`/`guidance`/`cause` correspond to
  Issue/Resolution/Cause; we have no Environment field beyond `platform` and `environment`.
- **Windows redo.** Microsoft's own "Keyboard shortcuts in Windows" page lists **Ctrl+Y** and
  contains no Ctrl+Shift+Z; the only Microsoft page documenting Ctrl+Shift+Z as redo is Visual
  Studio's. The v2 article said "Ctrl+Y in Microsoft Office; Ctrl+Shift+Z in most other
  applications" — the second clause was not supportable and has been corrected.
- **macOS show desktop.** Apple: *Command–Mission Control*, *Fn-H* or *Fn-F11*; F-keys need Fn unless
  "Use F1, F2, etc. keys as standard function keys" is on; user-configurable. Out of scope for v2
  (macOS article removed), recorded here for when it returns. Command+F3 appears on no Apple page.
- **Still unverified in v2:** every other row of the Windows shortcuts table (Win+D, Win+Shift+S,
  Ctrl+Shift+Esc, Ctrl+Shift+T and the rest) and every troubleshooting step. `lifecycle` is
  `unvalidated` on all six for that reason. This is signed content users act on; verify before
  signing.
