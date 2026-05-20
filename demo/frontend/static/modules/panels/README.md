## Panel Layout

This directory now separates panel logic by interaction level where it is already stable:

- `word/`
  - Dante word-level workbench layers
  - currently includes the Dante Word Locus Layer and its local commentary bridges
  - sub-branches currently include:
    - `Occurrence Explorer`
    - `Weighted Micro-Context Concurrence`
    - `Exact Local Phrase Expansions`
    - `Contrastive Interpretive Vocabulary`
    - `Related local fields`
- `line/`
  - line-level reading layers
  - currently includes:
    - `Local Semantic Fields`
    - `Cross-Canto Echoes`

Top-level panel files remain here when they are still primary workbench shells rather than clearly word-level or line-level:

- `coverage_panel.global.js`
- `records_panel.global.js`
- `authority_panel.global.js`
- `search_bridge.global.js`

The current rule is intentionally simple:

- first divide by `word` vs `line`
- then allow each side to carry its own internal branches

Do not introduce a third top-level split unless the running workbench truly stops being readable through this two-level frame.
