# Antica Fiamma: Preliminary Project Dossier

This dossier gathers the basic information needed for a public Digital Humanities reading of **Antica Fiamma**.

It presents the project as it currently stands: a working scholarly prototype with a live interface, a bounded public repository, documented source relationships, and an explicit maintenance model.

## Project In Brief

**Antica Fiamma** is a Dante research interface developed by Ruoci Song. It reorganizes the *Commedia*, commentary records, word-level routes, comparison surfaces, authority structures, and public research rooms around the single poetic line.

The project uses the Dartmouth Dante Project as its commentary source. It presents DDP as the source archive and Antica Fiamma as an added scholarly reading layer around source materials that already exist elsewhere.

Live entrances:

- [anticafiamma.it](https://anticafiamma.it)

Public repository:

- [ruocisong/antica-fiamma-public](https://github.com/ruocisong/antica-fiamma-public)

## Scholarly Premise

The project begins from a practical philological premise: commentary traditions are often searchable, but not always easy to read comparatively from the vantage point of a single line.

Antica Fiamma asks what becomes visible when the line is treated as the local reading desk. From one verse, a reader can move toward commentary records, dates, interpretive terms, repeated words, cross-canto echoes, comparison, and authority paths without losing the local textual anchor.

The project therefore treats the interface as a scholarly argument about reading order. Choosing a line, choosing a Dante word, opening a commentary record, comparing commentators, and following an authority are different reading acts. The interface keeps those acts distinct while allowing them to meet.

## Current Public Layers

The interface combines reading scales with a parallel authority room:

- **Canto-level entry**: canto browser, line map, density bars, and quick jump into the poem.
- **Line-level reading**: Line Snapshot, local commentary pressure, Interpretive Fields, and Cross-Canto Echoes.
- **Word-level reading**: Dante Word Locus Layer, Occurrence Explorer, Weighted Micro-Context Concurrence, Exact Local Phrase Expansions, and Contrastive Interpretive Vocabulary.
- **Commentary-record reading**: Close Reading cards, source/date metadata, full-text expansion, sorting, and Compare.
- **Authority room**: a parallel author/work/personaggio/source space connected to commentary records, line contexts, source-facing paths, and generated static authority rooms.
- **Research-room reading**: public case-study rooms, currently including the Fiamma room on Dante's fire vocabulary and motif.

These layers and rooms are parallel routes through the same reading infrastructure. They let the user change scale or move into authority navigation without losing the local textual anchor.

## Present State

The project is a working public prototype with:

- a live public interface
- a public GitHub shell
- public documentation for repository structure, data boundary, interface layers, source status, sustainability, and deployment
- generated static authority pages
- a public research room
- smoke checks for selected front-end paths
- a modular separation between public shell, generated runtime data, and internal research workspace

The project is currently author-maintained and presented as an inspectable DH prototype with a documented public shell.

## Data And Rights Position

The commentary source relationship is central. Antica Fiamma uses the Dartmouth Dante Project as the commentary source and credits that relationship explicitly.

The project author holds written authorisation for the current academic, non-profit website use of DDP-derived material. That limited website-use authorisation is not treated as a licence to redistribute the complete commentary corpus through GitHub, Zenodo, or another repository; the public repository therefore excludes the heavy commentary payload.

The public shell, research rooms, static authority pages, build scripts, and documentation remain structurally separable from any single full-text payload. If formal reuse conditions call for a reduced public version, modern commentary material can be removed while retaining the core line-first interface and public-domain commentary layers where available.

See also:

- [data-boundary.md](./data-boundary.md)
- [rights-and-permissions.md](./rights-and-permissions.md)

## Technological Shape

The public shell is a static front-end deployed through Cloudflare Pages. The current browser interface is built with HTML, CSS, and JavaScript. A Python build layer prepares front-end data structures and generated authority pages. Heavy runtime data is excluded from the public repository and delivered separately to the live interface.

The current domains are registered and paid for by the project author. Cloudflare Pages is currently maintained under the author's account on the free tier.

The implementation has been developed autonomously with AI-assisted coding support, source control, smoke testing, and manual review. The current documentation records the implementation choices so that the project is inspectable beyond the author's local working environment.

See also:

- [technical-overview.md](./technical-overview.md)

## Current Scholarly And Methodological Frame

Antica Fiamma is positioned as a working DH prototype grounded in a philological reading premise.

The current public frame emphasizes:

- line-first reading as a scholarly method
- source archive and interface layer as distinct responsibilities
- technical choices documented in public
- runtime data separated from the public repository
- sustainability managed through explicit maintenance boundaries
- future institutional roles recorded through explicit agreements

This frame lets the project be reviewed, discussed, and improved while keeping hosting, maintenance, and rights responsibility explicitly documented.
