# Antica Fiamma: Preliminary Project Dossier

This dossier gathers the basic information needed for a preliminary Digital Humanities discussion of **Antica Fiamma**.

It is not a grant proposal and not a request for infrastructure hosting. It is a compact account of the project as a working scholarly prototype: what problem it addresses, how the interface is organized, what data boundary it observes, and what kind of methodological advice would be useful at the present stage.

## Project In Brief

**Antica Fiamma** is a Dante research interface developed by Ruoci Song. It reorganizes the *Commedia*, commentary records, word-level routes, comparison surfaces, authority structures, and public research rooms around the single poetic line.

The project uses the Dartmouth Dante Project as its commentary source. It does not present itself as a replacement archive. Its purpose is to build an added scholarly reading layer around source materials that already exist elsewhere, keeping the source archive and the interface layer visibly distinct.

Live entrances:

- [anticafiamma.it](https://anticafiamma.it)
- [ddpcommentary.com](https://ddpcommentary.com)

Public repository:

- [github.com/ruocisong/ddp-workbench-public](https://github.com/ruocisong/ddp-workbench-public)

## Scholarly Problem

The project begins from a practical philological problem: commentary traditions are often searchable, but not always easy to read comparatively from the vantage point of a single line.

Antica Fiamma asks what becomes visible when the line is treated as the local reading desk. From one verse, a reader can move toward commentary records, dates, interpretive terms, repeated words, cross-canto echoes, comparison, and authority paths without losing the local textual anchor.

The project therefore treats the interface as a scholarly argument about reading order. Choosing a line, choosing a Dante word, opening a commentary record, comparing commentators, and following an authority are different reading acts. The interface keeps those acts distinct while allowing them to meet.

## Current Public Layers

- **Main Entry**: canto and line entry into the poem.
- **Analysis Layer / Line Snapshot**: a compact orientation layer after a line is selected.
- **Close Reading / Commentary**: record-level reading with source, date, sorting, line span, and full-text expansion.
- **Dante Word Locus Layer**: word-level routes through occurrence, micro-context, phrase expansion, and contrastive interpretive vocabulary.
- **Interpretive Fields**: local commentary-side semantic groupings around a selected line.
- **Cross-Canto Echoes**: text-first relations between lines elsewhere in the *Commedia*.
- **Compare**: side-by-side reading of commentary records.
- **Authority**: author, work, personaggio, and source-facing navigation, including static authority pages.
- **Research Rooms**: public case-study pages, currently including the Fiamma room on Dante's fire vocabulary and motif.

## Present State

The project is a working public prototype. It has:

- a live public interface
- a public GitHub shell
- public documentation for repository structure, data boundary, interface layers, and deployment
- generated static authority pages
- a public research room
- smoke checks for selected front-end paths
- a modular separation between public shell, generated runtime data, and internal research workspace

It is not yet an institutionally maintained DH project. The current repository and documentation are intended to make the prototype inspectable and discussable.

## Data And Rights Position

The commentary source relationship is central. Antica Fiamma uses the Dartmouth Dante Project as the commentary source and credits that relationship explicitly.

The project author has contacted the Dartmouth Dante Project team about formal reuse permission. At the current stage, the project is being documented and discussed carefully rather than promoted as a finalized public data release.

The public repository does not version the heavy runtime commentary payloads. It documents the public shell, selected build logic, deployment path, and data boundary. If formal reuse conditions require a reduced public version, the rights-sensitive commentary layer can be removed, reduced, or replaced while preserving the core interface logic.

See also:

- [data-boundary.md](./data-boundary.md)
- [rights-and-permissions.md](./rights-and-permissions.md)

## Technological Shape

The public shell is a static front-end deployed through Cloudflare Pages. The current browser interface is built with HTML, CSS, and JavaScript. A Python build layer prepares front-end data structures and generated authority pages. Heavy runtime data is excluded from the public repository and delivered separately to the live interface.

The implementation has been developed autonomously with AI-assisted coding support, source control, iterative smoke testing, and manual review. The aim now is to document the implementation choices more explicitly and bring the project closer to DH expectations for inspectability, sustainability, and reuse.

See also:

- [technical-overview.md](./technical-overview.md)

## What Kind Of Advice Would Be Useful

At this stage the project would benefit from methodological and DH-project guidance rather than immediate infrastructure hosting.

Useful forms of advice include:

- how to document the project according to Digital Humanities expectations
- how to state the relation between philological method and interface design
- how to handle source, rights, and attribution boundaries
- how to describe sustainability without implying institutional maintenance has already been granted
- how to decide whether a reduced public version should be prepared while formal permissions remain pending
- how the project might be discussed in a seminar, lab context, or DH advisory setting

The immediate request is therefore not institutional adoption. It is a preliminary conversation about how to make a working Dante DH prototype more legible, safer, and more durable.
