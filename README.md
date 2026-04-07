# DDP Commentary Workbench

A public-facing research interface built on top of the Dartmouth Dante Project for line-first reading, commentary comparison, authority navigation, and word-level exploratory routes across the *Commedia*.

Live site:
- [ddpcommentary.com](https://ddpcommentary.com)
- [ddp-workbench.pages.dev](https://ddp-workbench.pages.dev)

## First-Time Visitor Path

If you are arriving here from outside the codebase, the most useful order is:

- [About](https://ddpcommentary.com/about.html): what the project is, how it is framed, and how the source archive is credited
- [Reading Route](https://ddpcommentary.com/reading-route.html): a screenshot-based tour of the interface, panel by panel
- [Guide](https://ddpcommentary.com/guide.html): how to move through the workbench as a reader
- [Live Workbench](https://ddpcommentary.com): the public site itself

If you want the repository-facing explanation after that, go next to:

- [`docs/public/repository-guide.md`](docs/public/repository-guide.md)
- [`docs/public/interface-layers.md`](docs/public/interface-layers.md)
- [`docs/public/data-boundary.md`](docs/public/data-boundary.md)

## What This Public Repository Is

This repository is a public-facing shell for the DDP Commentary Workbench.

It is designed to show:

- what the project is
- how the interface is organized
- how the public shell is deployed
- where the boundary lies between the public interface layer and the heavier runtime data layer

It does **not** version the heavy runtime payloads under `demo/frontend/data/`, which are delivered separately.

## Project Scope

The workbench is organized around a set of linked reading surfaces:

- a canto-level main entry for line-first reading
- an analysis layer with the Line Snapshot
- close reading surfaces for commentary cards
- Dante Word Locus panels for word-level routes
- cross-canto echoes and interpretive fields
- compare surfaces
- authority views for authors, works, and related navigation

If you want to see the shape of the interface before reading code, start with the live site or the panel-by-panel tour:

- [ddpcommentary.com/reading-route.html](https://ddpcommentary.com/reading-route.html)

## Interface Layers

The public shell is built around a sequence of reading layers rather than a single search box.

- **Main Entry**: the canto-level opening surface where a reader enters through a specific line
- **Analysis Layer / Line Snapshot**: the first orientation layer after line selection, showing local pressure, density, and terms before card-by-card reading
- **Close Reading**: the commentary-card surface where dates, ordering, and record-level comparison begin to matter
- **Dante Word Locus Layer**: the word-level route through occurrence tracking, weighted local context, exact phrase expansion, and contrastive vocabulary
- **Interpretive Fields**: local semantic clustering around the selected line
- **Cross-Canto Echoes**: line-to-line resonance elsewhere in the poem
- **Compare**: side-by-side reading surfaces for commentary comparison
- **Authority**: author, work, and source-oriented navigation layered on top of the commentary archive

For a guided visual walkthrough of these layers, start with:

- [Reading Route](https://ddpcommentary.com/reading-route.html)
- [`docs/public/interface-layers.md`](docs/public/interface-layers.md)

## Public / Data Boundary

The workbench is built on top of the Dartmouth Dante Project as its source archive.

This repository presents an additional interface layer around that source archive. It keeps the public shell, selected build logic, and project-facing documentation visible, while leaving the heavy runtime payloads outside version control.

For the explicit repository boundary, see:

- [`docs/public/data-boundary.md`](docs/public/data-boundary.md)

## For Technical Readers

- [`demo/frontend`](demo/frontend): website shell, static pages, interface tour, and screenshots
- [`demo/build_demo_data.py`](demo/build_demo_data.py): frontend-data build entrypoint with layered build profiles
- [`demo/build_authority_static_pages.py`](demo/build_authority_static_pages.py): static author and personaggio page generation
- [`demo/runtime_checks`](demo/runtime_checks): smoke tests used to sanity-check the public shell
- [`deployment_output/PREPARE_PAGES_SHELL.py`](deployment_output/PREPARE_PAGES_SHELL.py): Cloudflare Pages shell packaging
- [`.github/workflows/deploy-pages-shell.yml`](.github/workflows/deploy-pages-shell.yml): Pages deployment workflow
- [`docs/public/interface-layers.md`](docs/public/interface-layers.md): written overview of the public reading surfaces
- [`docs/public/repository-guide.md`](docs/public/repository-guide.md): guide to what is included in this public repository and where to look first
- [`docs/public/data-boundary.md`](docs/public/data-boundary.md): explanation of the public repository's data boundary
- [`docs/public/DDP_WORKBENCH_PUBLIC_MINIMUM.md`](docs/public/DDP_WORKBENCH_PUBLIC_MINIMUM.md): notes on the public-facing repository boundary
- [`src/ddp_scraper`](src/ddp_scraper): supporting project-preparation utilities included for methodological transparency

## What To Look At In Code First

If you are reviewing this repository for the first time, the fastest path is:

- [`demo/frontend/index.html`](demo/frontend/index.html): shell entrypoint
- [`demo/frontend/about.html`](demo/frontend/about.html): project framing, rights, and colophon
- [`demo/frontend/guide.html`](demo/frontend/guide.html): user-facing guide to the interface
- [`demo/frontend/reading-route.html`](demo/frontend/reading-route.html): panel-by-panel visual tour
- [`demo/frontend/static/app.js`](demo/frontend/static/app.js): high-level client bootstrapping
- [`demo/frontend/static/modules`](demo/frontend/static/modules): panel and routing modules
- [`demo/build_demo_data.py`](demo/build_demo_data.py): layered data build entrypoint
- [`demo/build_authority_static_pages.py`](demo/build_authority_static_pages.py): static authority page generation

## Local Development

Serve the frontend locally:

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

## Data And Rights

This repository does not ship the heavy frontend data payloads under `demo/frontend/data/`. Those are delivered separately at runtime.

The interface treats the Dartmouth Dante Project as the source archive and builds an additional reading layer around that source. Public presentation should therefore continue to credit the DDP explicitly and preserve a clear distinction between source archive and interface layer.

## Status

This repository is meant to function as a public-facing project shell: enough to understand the interface, review the main public layers, and follow the deployment path, without exposing the full heavier internal workspace as the primary story.
