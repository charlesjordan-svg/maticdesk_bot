# docs/decisions/

**Read [`DECISION-REGISTER.md`](DECISION-REGISTER.md). Nothing else in this directory is citable.**

| Path | What it is |
|---|---|
| `DECISION-REGISTER.md` | **The register.** D1–D166, H1–H6, C1–C12, X-1–X-7, R-1–R-14, OPEN-1–OPEN-9, values unset, verification (§10.4 added 2026-09-03 night: five primary-source lookups). Owns the numbering. Created 2026-09-03 by merging the three sources below and folding in the independent review (D150); amended the same evening with D151–D161 and OPEN-8 from the founder's register-merge handover (register §0, §5.6–§5.9). |
| `sources/` | Verbatim copies of the documents the register was built from, kept for provenance. **They use the old numbering** (the consolidated register runs D35–D83; the register has it as D42–D90). Do not cite them; cite the register. |

## Rules

- Reference this file from every handover and every review prompt **by relative path**: `docs/decisions/DECISION-REGISTER.md` from the repo root, `../docs/decisions/DECISION-REGISTER.md` from `client/` or `server/`. A document that names a decision file without a path is how two files went "missing" on 2026-09-02 while sitting on disk.
- New decisions take the next free ID and are appended. Nobody renumbers. See the register's §11.
- Two chat documents of 2026-09-03 (`2026-09-03-phase0-decisions-D130-D150.md`, `2026-09-03-kb-architecture-authoring-ux.md`) assigned D130–D168 in parallel with the register. **Their IDs are void**; the register's §0 and §5.6 say how they were merged. If either turns up, it goes into `sources/` and is not cited.
- D1–D41 are reserved for the workbook (`ASK-IT-questionnaire.xlsx`), which has never been downloaded. Recovering it into the register is the top housekeeping item.
