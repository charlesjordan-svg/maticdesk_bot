# Matic bust avatar — implementable assets

Against `BUST AVATAR SPECIFICATION` V7 · 2026.09.09. The specification is not
restated here and nothing in it was changed.

## Files

| File | What it is |
| --- | --- |
| `matic-avatar.svg` | The single chassis. `viewBox="0 0 200 200"`. All five eye shapes, all nine mouth shapes and all four badge glyphs are present in one coordinate space; CSS shows one of each. No raster, no external reference, no filter. |
| `matic-avatar.css` | Every token, every state rule, every motion value, and the `prefers-reduced-motion` behaviour. Dark panel is a token swap in the same file, not a second stylesheet. |
| `matic-avatar.manifest.json` | Source of truth: twelve states, eye/mouth shape lists, phoneme→mouth table, crop bands, motion table, reduced-motion spec. |
| `matic-avatar-harness.html` | Self-contained acceptance harness. Opens from disk, offline, no build. The SVG and CSS above are inlined verbatim into it — edit the source files and regenerate; do not edit the copies inside the harness. |

## How the client drives it

Set one attribute:

    svg.dataset.state = 'declining';

Eye shape, mouth shape, badge glyph, tip colour, chest mark, accessories, gaze
shift and rig motion all follow from that in CSS. Nothing else is required.

During speech, write the mouth directly at phoneme rate and set `data-visemes`
so the fallback chatter stops:

    svg.dataset.visemes = '';
    svg.querySelector('#mouth').dataset.shape = manifest.phonemeToMouth[p];

`data-shape` on `#mouth` wins over the state's mouth outright — the state rules
are guarded with `:not([data-shape])`, so there is no specificity fight and no
need to clear `data-state`. Remove the attribute and the state's mouth returns.

## States

idle, listening, thinking, speaking, greeting, success, apologising, declining, escalating, error, accept, ingest

## Two things to look at before you build

Both are V7's own reasoning made visible in the harness, not defects:

1. `listening` and `accept` are identical apart from the chest aperture. At 44
   and 32px that aperture is the entire difference between them.
2. `escalating` renders as `thinking` below 96px once the ticket is cropped.
   The manifest carries `minSize: 96` for it; refuse the state below that
   rather than showing it.
