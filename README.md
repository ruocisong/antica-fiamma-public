# DDP Commentary Workbench

A research interface built on top of the Dartmouth Dante Project, designed for line-first reading, commentary comparison, authority navigation, and word-level exploratory routes across the *Commedia*.

Live site:
- [ddpcommentary.com](https://ddpcommentary.com)
- [ddp-workbench.pages.dev](https://ddp-workbench.pages.dev)

## What This Repository Contains

This repository currently serves two roles:

- a public-facing web workbench under [`demo/frontend`](demo/frontend)
- an internal research and build workspace for scraping, data preparation, authority modeling, semantic layers, and deployment tooling

If you are arriving here from the website, the part you most likely want first is:

- [`demo/frontend`](demo/frontend): static shell pages, tour pages, styles, and client-side modules
- [`deployment_output`](deployment_output): Cloudflare Pages shell build preparation
- [`src/ddp_scraper`](src/ddp_scraper): scraper and extraction code for DDP-derived source material

Most internal progress notes, plans, audits, and overnight reports have been moved under:

- [`docs/internal`](docs/internal)

A public-facing repo planning note now lives at:

- [`docs/public/DDP_WORKBENCH_PUBLIC_MINIMUM.md`](docs/public/DDP_WORKBENCH_PUBLIC_MINIMUM.md)

## Project Scope

The workbench is not just a scraper output folder. It includes:

- a canto-level entry surface for line-first reading
- a line snapshot / analysis layer
- close reading and compare surfaces for commentary cards
- Dante word locus tools
- cross-canto echoes and interpretive fields
- authority views for authors, works, and special-case reading contracts

The public Pages shell is intentionally lightweight. Heavy runtime data is stored outside Git and delivered separately.

## Repository Map

- [`demo/frontend`](demo/frontend): website shell, static pages, panel modules, screenshots used by the interface tour
- [`demo/build_demo_data.py`](demo/build_demo_data.py): main frontend-data build entrypoint with layered build profiles
- [`demo/build_authority_static_pages.py`](demo/build_authority_static_pages.py): static author/personaggio page generation
- [`demo/runtime_checks`](demo/runtime_checks): smoke tests and local capture probes
- [`src/ddp_scraper`](src/ddp_scraper): scraping and extraction utilities
- [`authority`](authority): authority-layer build logic and documentation
- [`semantic_thread`](semantic_thread): semantic and cross-canto research workspace
- [`dante_loci`](dante_loci): Dante word locus experiments and reports
- [`deployment_output`](deployment_output): Pages shell packaging output and deployment helpers
- [`docs/internal`](docs/internal): internal reports, audits, plans, and process notes
- [`docs/public`](docs/public): outward-facing planning notes for a cleaner public presentation

## Local Development

### Website shell

Serve the frontend locally:

```bash
cd "/Users/Ruoci/Desktop/fiamma🔥/DDP"
python3 demo/server.py
```

Then open:

- [http://127.0.0.1:8777/](http://127.0.0.1:8777/)

### Python environment

```bash
cd "/Users/Ruoci/Desktop/fiamma🔥/DDP"
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -e .
```

## Deployment

The public shell is deployed through Cloudflare Pages.

Relevant files:

- [`deployment_output/PREPARE_PAGES_SHELL.py`](deployment_output/PREPARE_PAGES_SHELL.py)
- [`.github/workflows/deploy-pages-shell.yml`](.github/workflows/deploy-pages-shell.yml)

For website-only pushes from this mixed workspace, use:

```bash
cd "/Users/Ruoci/Desktop/fiamma🔥/DDP"
bash push_website_release.sh --dry-run
bash push_website_release.sh
```

## Data And Rights

This repository does not version the heavy frontend data payloads under [`demo/frontend/data`](demo/frontend/data). Those are delivered separately.

The interface treats the Dartmouth Dante Project as the source archive and builds an additional reading layer around that source. Public presentation should continue to credit the DDP explicitly and preserve a clear distinction between source archive and interface layer.

## Status

This repository is still an active workbench, not yet a fully cleaned public code release. If you are looking for the leanest possible version to share externally, start with:

- [`docs/public/DDP_WORKBENCH_PUBLIC_MINIMUM.md`](docs/public/DDP_WORKBENCH_PUBLIC_MINIMUM.md)
