# Matic Desk

An AI IT-support assistant for corporate Windows endpoints, sold as an alternative to an outsourced
L1 service desk. A user talks to an animated avatar in the taskbar; it diagnoses the problem, fixes
it on the machine through a privileged broker, and escalates to a ticketing system when it cannot.

**Start with [`PROJECT_START_HERE.md`](PROJECT_START_HERE.md).** It is the index: status, where
everything lives, what is blocking, and the working rules.

## Layout

| Path | What | State |
|---|---|---|
| [`client/`](client/) | The endpoint: Electron agent (UI, avatar, model client, local router) and the privileged broker with four Win32 primitives. Runnable today. | **Built.** Demo build on branch `add-matic-desk-demo`; current work on `main`. |
| [`server/`](server/) | The hub: fleet identity, inference proxy, audit ingestion, tickets, KB retrieval. | **Not built.** Spec and phase-one scope in `server/README.md`. |
| [`docs/decisions/`](docs/decisions/) | **The decision register** — D1–D150, invariants H1–H6, conflicts, open items. One file owns the numbering. | Current. Read before any design thread. |
| `Projects/`, `.obsidian/` | Founder's Obsidian notes. Not product code. | — |

## Run the client

```bash
cd client
npm install
npm run start:elevated
```

Prerequisites, the `.env` API key, the voice model and the test suite are in
[`client/README.md`](client/README.md). `npm test` runs headless with no key and no admin rights.

## Rules that are not optional

- The repo is **private**. Keep it that way.
- Never commit `.env`, an API key, or the 63 MB voice model. Both are gitignored.
- Decisions go in `docs/decisions/DECISION-REGISTER.md` with the next free ID. Nobody renumbers.
- Every handover names files **by path**, never by name alone.
