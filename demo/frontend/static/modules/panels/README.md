# Panel Modules

This directory contains the public shell's panel-level frontend logic.

The current organizing rule is interaction level:

- word-level panels live under `word/`
- line-level panels live under `line/`
- broader shell panels remain at the top level until they are stable enough to split

## Word-Level Panels

Directory:

```text
word/
```

Main file:

```text
word/word_level_panel.global.js
```

This file owns the Dante Word Locus Layer and its word-centered routes:

- Occurrence Explorer
- Weighted Micro-Context Concurrence
- Exact Local Phrase Expansions
- Contrastive Interpretive Vocabulary
- local word-to-commentary bridges

## Line-Level Panels

Directory:

```text
line/
```

Main file:

```text
line/line_level_panel.global.js
```

This file owns line-level Cross-Canto Echoes and line-centered routes that do not belong to a single selected word.

`line/semantic_panel.global.js` contains line-level semantic / interpretive-field logic where that split is active.

## Top-Level Panels

Top-level panel files remain here when they are still primary shell surfaces:

- `coverage_panel.global.js`: canto and line entry / coverage.
- `records_panel.global.js`: commentary records, card rendering, expansion, comparison hooks, and source-facing reading surface.
- `authority_panel.global.js`: authority-layer interactions.
- `search_bridge.global.js`: search and bridge logic.
- `semantic_panel.global.js`: legacy or shared semantic entrypoint where still needed.
- `loci_panel.global.js`: retained only where the running shell still references it; new word-level work should prefer `word/word_level_panel.global.js`.

## Rule Of Thumb

Do not introduce a new top-level split unless the running interface stops being readable through the current frame:

- poem line
- Dante word
- commentary record
- authority path

The point of the split is to reduce confusion, not to create a taxonomy for its own sake.
