# Antica Fiamma

**Antica Fiamma** is a public-facing Dante research interface by Ruoci Song. It is built with the Dartmouth Dante Project as its commentary source and reorganizes that material into a line-first reading environment for the *Commedia*.

Live site:

- [ddpcommentary.com](https://ddpcommentary.com)
- [ddp-workbench.pages.dev](https://ddp-workbench.pages.dev)

## Start Here

If you are arriving from outside the codebase, these public pages are the best entrance:

- [About](https://ddpcommentary.com/about.html): project framing, source map, data statement, rights posture, and colophon
- [Guide](https://ddpcommentary.com/guide.html): how to move through Antica Fiamma as a reader
- [Interface Tour](https://ddpcommentary.com/reading-route.html): panel-by-panel visual walkthrough of the reading surfaces
- [Authority Layer](https://ddpcommentary.com/authority.html): standalone explanation of the author, work, personaggio, and source-facing layer
- [Fiamma Research Room](https://ddpcommentary.com/research/fiamma.html): a public research room for Dante's fire vocabulary and the wider fire motif

Repository-facing notes:

- [`docs/public/repository-guide.md`](docs/public/repository-guide.md)
- [`docs/public/interface-layers.md`](docs/public/interface-layers.md)
- [`docs/public/data-boundary.md`](docs/public/data-boundary.md)
- [`docs/public/DDP_WORKBENCH_PUBLIC_MINIMUM.md`](docs/public/DDP_WORKBENCH_PUBLIC_MINIMUM.md)

## What This Repository Is

This repository is the public shell for Antica Fiamma. It is meant to show the site, the public reading surfaces, selected build logic, deployment wiring, and outward-facing documentation without exposing the full internal research workspace.

It includes enough code and documentation to understand how the public interface is organized. It does not ship the heavy runtime data payloads that power the live site.

## What Antica Fiamma Does

Antica Fiamma begins from Dante's poem rather than from a detached search form. A reader enters through canto, line, word, commentary card, comparison, or authority path, while the interface keeps the source archive and the added reading layer conceptually separate.

Major public layers include:

- **Main Entry**: canto and line entry into the poem
- **Analysis Layer / Line Snapshot**: local orientation after a line is selected
- **Close Reading**: commentary cards, dates, sorting, ranges, and full text
- **Commentary**: source-aware record reading around the selected line
- **Dante Word Locus Layer**: word-level routes through recurrence, micro-context, phrase growth, and contrastive vocabulary
- **Interpretive Fields**: local commentary-side semantic groupings around a line
- **Cross-Canto Echoes**: text-first line relations elsewhere in the *Commedia*
- **Compare**: side-by-side reading of commentary records
- **Authority**: authors, works, personaggi, commentary sources, and authority rooms
- **Research Rooms**: public case-study pages such as the fire motif room at `/research/fiamma.html`

## Repository Map

- [`demo/frontend`](demo/frontend): public website shell, static pages, styles, modules, authority pages, and research room pages
- [`demo/build_demo_data.py`](demo/build_demo_data.py): layered frontend-data build entrypoint retained for method transparency
- [`demo/build_authority_static_pages.py`](demo/build_authority_static_pages.py): static authority page generator
- [`demo/runtime_checks`](demo/runtime_checks): smoke tests for the public shell
- [`deployment_output/PREPARE_PAGES_SHELL.py`](deployment_output/PREPARE_PAGES_SHELL.py): Cloudflare Pages shell packaging
- [`.github/workflows/deploy-pages-shell.yml`](.github/workflows/deploy-pages-shell.yml): public shell deployment workflow
- [`src/ddp_scraper`](src/ddp_scraper): selected source-capture utilities retained for lineage transparency
- [`docs/public`](docs/public): public-facing repository, interface, and data-boundary notes

## Public / Data Boundary

This repository does not version the heavy frontend runtime payloads under `demo/frontend/data/`. Those payloads are delivered separately to the live site.

The public repository also intentionally excludes internal planning threads, overnight reports, publication drafting workspaces, large experimental outputs, and local operating materials. It is a public project shell, not the full studio floor.

For details, see [`docs/public/data-boundary.md`](docs/public/data-boundary.md).

## Local Preview

Serve the public shell locally:

```bash
cd <repo-root>
python3 demo/server.py
```

Then open:

- [http://127.0.0.1:8777/](http://127.0.0.1:8777/)

Optional Python environment setup:

```bash
cd <repo-root>
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -e .
```

## Deployment

The public shell is deployed through Cloudflare Pages.

Relevant files:

- [`deployment_output/PREPARE_PAGES_SHELL.py`](deployment_output/PREPARE_PAGES_SHELL.py)
- [`.github/workflows/deploy-pages-shell.yml`](.github/workflows/deploy-pages-shell.yml)

## Source And Attribution

Antica Fiamma uses the Dartmouth Dante Project as its commentary source. The project does not present itself as a replacement archive. It builds an added scholarly interface layer around DDP-derived commentary material and keeps that source relationship visible in the public site.

## Status

Antica Fiamma is an active research interface. This public repository is intended to be readable, stable, and externally shareable, while the heavier internal research and build workspace remains outside the public repository boundary.
