# The end-user panel — delivery, and how it composes

Claude Design's delivery of 2026-09-10, against the agent-panel brief; integrated the same day
(**D240–D243**, `docs/decisions/DECISION-REGISTER.md` §5.28). The brief and the delivery's own
reasoning are not restated here, and nothing in the design was changed.

## Files

| File | What it is |
| --- | --- |
| `matic-desk-panel.html` | **The delivery, verbatim.** One file, one inline `<style>`, no network reference of any kind. Six scenes, light and dark, both inspector variants, the three connection states, and the design's own notes at the bottom. Open it from disk; it is the reference for every class the app uses. |
| `matic-panel.css` | **Generated** from that file's `<style>` block by `scripts/build-panel-assets.mjs`. Byte-for-byte the same rules, nothing stripped. |
| `matic-panel.app.css` | **Hand-written**, loaded second. The harness stage becoming a real Electron window, and the four surfaces the delivery did not draw. It uses the tokens and redefines none — `test/panel.test.mjs` fails if it declares a `--matic-ui-*` of its own. |
| `panel-check.html` | The click-through page. Opens from disk, runs the REAL renderer against a FAKE `window.matic`. |
| `panel-check-bridge.js` | That fake bridge. Canned responses in the shapes `Agent.propose()` returns. Never loaded by the app. |
| `panel-check-frame.html` | **Generated** from `src/renderer/index.html` — the check page's inner frame, with the fake bridge inserted and the relative paths rewritten. |

```
npm.cmd run panel:build     # regenerate matic-panel.css and panel-check-frame.html
npm.cmd run panel:check     # are either stale? (exit 1, naming each one)
```

## The one rule

**Do not hand-edit `matic-panel.css` or `panel-check-frame.html`.** They are generated, and
`test/panel.test.mjs` fails while either is stale. This is the avatar's rule
(`../avatar/DELIVERY-README.md`) applied to the panel, and the argument is the same one the project
keeps re-learning: a copy diverges, a generated one cannot.

Where it differs from the avatar is the DIRECTION. The avatar delivered source files and a harness
built from them; the panel delivered a harness and no sources, so here the delivery is the source.
The practical consequence: **a design change arrives as a new delivery**, because there is nowhere
else for it to come from. Drop the new harness in this directory and run `panel:build`.

An APP change — layout glue, a surface the design did not cover — goes in `matic-panel.app.css`,
which is hand-written and says at the top what belongs in it.

## What the app does not take from the harness

Three of the harness's controls are harness devices, and putting them in the app would put the
developer surface back on the end-user panel — the problem this design exists to fix:

| Harness control | In the app |
| --- | --- |
| Scene switcher (first run, capability, offer, consent, citation, decline) | **Not state.** `data-scene` has two values, `first` and `live`, and no control writes anything else. The six scenes are moments the conversation arrives at. |
| `inspectorVariant` (overlay / inline) | **Ours.** `data-variant="overlay"` is set in `index.html`; `inline` is for development and for showing an IT buyer. No control. |
| Theme (light / dark) | **The user's, and persisted** — `localStorage["matic.theme"]`, applied before first paint by the inline script at the top of `index.html`. |

## The 35 tokens

Every `--matic-ui-*` name goes in unchanged and none collides with the avatar's `--matic-avatar-*`
family, which is why both live in one document. The test counts them and compares the two sets. If
the app needs more, add them under the same prefix rather than renaming what exists.

## Fonts

Barlow Condensed and Barlow are **named first and never fetched** — no webfont request is made at
runtime, by the design's own choice. Until the app ships the font files locally, the stack falls
through to `Arial Narrow` / `system-ui`, which is what you are looking at on this machine.
