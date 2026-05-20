# Repository Guide

This note explains how to read the public-facing `ddp-workbench-public` repository after the project's current shift into **Antica Fiamma**.

## What This Repository Is

This repository is a public project shell for Antica Fiamma.

It makes four things visible:

- the shape of the live public interface
- the main public pages and reading surfaces
- selected build and deployment logic
- the data and rights boundary around the public shell

It is not the full internal research workspace. It does not version the heavy runtime payloads delivered separately to the live site.

## First Reading Path

If you want to understand the project quickly, read in this order:

- [README.md](../../README.md): project overview, live links, scope, and repository map
- [About](https://ddpcommentary.com/about.html): project framing, source map, data statement, and reuse boundary
- [Guide](https://ddpcommentary.com/guide.html): how to move through Antica Fiamma as a reader
- [Interface Tour](https://ddpcommentary.com/reading-route.html): visual tour of the major panels
- [Authority Layer](https://ddpcommentary.com/authority.html): explanation of author, work, personaggio, and source-facing navigation
- [Fiamma Research Room](https://ddpcommentary.com/research/fiamma.html): public case-study room for Dante's fire vocabulary and motif

Repository notes after that:

- [interface-layers.md](./interface-layers.md)
- [data-boundary.md](./data-boundary.md)
- [DDP_WORKBENCH_PUBLIC_MINIMUM.md](./DDP_WORKBENCH_PUBLIC_MINIMUM.md)

## Main Directories

### [`demo/frontend`](../../demo/frontend)

The public website shell.

It contains:

- `index.html`, the Antica Fiamma entrypoint
- `about.html`, `guide.html`, `reading-route.html`, and `authority.html`
- `research/fiamma.html`, the public fire-motif research room
- static styles and client-side modules
- generated static authority pages under `autore/` and `personaggio/`
- public shell assets such as `_redirects`, `robots.txt`, `sitemap.xml`, and `favicon.svg`

The heavy runtime data layer is intentionally excluded from this public repository.

### [`demo/build_demo_data.py`](../../demo/build_demo_data.py)

The layered frontend-data build entrypoint.

It remains in the public repository for methodological transparency. It helps show how the interface-facing data structures are prepared, but the full generated runtime payloads are not versioned here.

### [`demo/build_authority_static_pages.py`](../../demo/build_authority_static_pages.py)

The generator for static authority-facing HTML pages.

It is included because authority rooms are part of the public interface, not merely an internal experiment.

### [`demo/runtime_checks`](../../demo/runtime_checks)

Smoke checks used to sanity-check the public shell.

The broad shell smoke test verifies that the site structure and key client assets are present. Authority checks inspect the standalone authority layer.

### [`deployment_output/PREPARE_PAGES_SHELL.py`](../../deployment_output/PREPARE_PAGES_SHELL.py)

The packaging script for Cloudflare Pages.

It prepares the static public shell, including current public research pages.

### [`.github/workflows/deploy-pages-shell.yml`](../../.github/workflows/deploy-pages-shell.yml)

The GitHub Actions workflow for deploying the public shell.

### [`src/ddp_scraper`](../../src/ddp_scraper)

Selected source-capture utilities.

These are included for lineage transparency because Antica Fiamma is built on DDP-derived commentary material. Their presence does not mean this repository is a complete data distribution.

## What Is Not Included

This public repository excludes:

- heavy runtime payloads under `demo/frontend/data/`
- report output directories under `demo/frontend/reports/`
- local data snapshots and legacy runtime stores
- internal thread prompts, overnight audits, and review workspaces
- publication drafting folders
- large experimental outputs for semantic or cross-canto research
- local release wrappers and operational clutter not needed for public review

## How To Think About The Boundary

The public repository should feel like the entrance hall: the live interface, public documentation, selected method-facing scripts, and deployment path are visible.

The internal working repository remains the studio floor: heavier generated data, experiments, drafts, audits, and thread-specific working materials live there instead.
