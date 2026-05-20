# Frontend Modules

This directory contains the split frontend module layer for the public Antica Fiamma shell.

The current browser shell still keeps `demo/frontend/static/app.js` as the main entrypoint. The files here make the runtime structure easier to maintain by separating stable responsibilities into smaller public modules and contract notes.

## Main Areas

- `core/`: shared runtime contracts, DOM helpers, state, routing, loaders, and module registry notes.
- `panels/`: interface panels and interaction-level logic.

## Current Runtime Shape

The public shell uses a hybrid structure:

- `static/app.js` remains the central browser entrypoint.
- Stable panel logic can live under `static/modules/panels/`.
- Word-level logic now lives under `static/modules/panels/word/`.
- Line-level logic now lives under `static/modules/panels/line/`.
- Core files document shared contracts and provide reusable runtime helpers where already stabilized.

## Important Panel Paths

- `panels/word/word_level_panel.global.js`: Dante Word Locus Layer and word-centered panels.
- `panels/line/line_level_panel.global.js`: line-level Cross-Canto Echoes and related line panels.
- `panels/records_panel.global.js`: commentary-card and record-reading surface.
- `panels/authority_panel.global.js`: authority-layer interactions.
- `panels/coverage_panel.global.js`: canto and line coverage surface.

Do not target removed or obsolete paths when updating the live frontend. In particular, new word-level work should target `panels/word/word_level_panel.global.js`, not an older top-level loci-panel path.

## Public Boundary

These modules belong to the public shell because they describe how the visible interface runs. Heavy runtime data consumed by these modules remains outside this public repository.
