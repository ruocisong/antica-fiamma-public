# Repository Guide

This note explains what is included in the public-facing `ddp-workbench-public` repository and how to approach it if you are seeing it for the first time.

## What This Repository Is

This repository is a public project shell for the DDP Commentary Workbench.

It is intended to make three things visible:

- the shape of the live interface
- the main public-facing build and deployment logic
- the project framing and documentation needed to understand what the workbench is

It is **not** a complete dump of the full internal research workspace, and it does **not** version the heavy runtime payloads delivered separately to the live site.

## What To Read First

If you want the shortest path through the project, start here:

- [README.md](../../README.md): project overview, live links, scope, and repository map
- [demo/frontend/about.html](../../demo/frontend/about.html): project framing, data statement, and rights note
- [demo/frontend/reading-route.html](../../demo/frontend/reading-route.html): visual interface tour
- [demo/frontend/guide.html](../../demo/frontend/guide.html): user-facing guide to reading through the workbench
- [data-boundary.md](./data-boundary.md): what is and is not included in this public repository

## Public Pages

The live site has three especially useful public pages:

- [About](https://ddpcommentary.com/about.html): what the project is, how it is framed, how the data is described, and how the source archive is credited
- [Guide](https://ddpcommentary.com/guide.html): how to move through the interface as a reader
- [Reading Route](https://ddpcommentary.com/reading-route.html): a screenshot-based tour of the major panels and reading surfaces

## Repository Structure

### [`demo/frontend`](../../demo/frontend)

This is the public website shell.

It contains:

- the main public HTML pages
- static styles and client-side modules
- interface-tour screenshots
- public-facing assets such as `robots.txt`, `_redirects`, and the sitemap

### [`demo/build_demo_data.py`](../../demo/build_demo_data.py)

This is the layered frontend-data build entrypoint.

In the full project, it helps prepare the interface-facing data structures used by the workbench. In this public repository, it remains because it helps explain how the interface is materially assembled, even though the heavy runtime payloads themselves are not versioned here.

### [`demo/build_authority_static_pages.py`](../../demo/build_authority_static_pages.py)

This script generates the static authority-facing HTML pages.

It is included because the authority section is part of the public shell and not merely a private backend experiment.

### [`demo/runtime_checks`](../../demo/runtime_checks)

This directory contains smoke tests used to sanity-check the public shell.

The most important files here are the broad shell check and the authority interaction check.

### [`deployment_output/PREPARE_PAGES_SHELL.py`](../../deployment_output/PREPARE_PAGES_SHELL.py)

This is the packaging step used to prepare the shell for Cloudflare Pages deployment.

### [`.github/workflows/deploy-pages-shell.yml`](../../.github/workflows/deploy-pages-shell.yml)

This is the GitHub Actions workflow that deploys the public shell.

### [`src/ddp_scraper`](../../src/ddp_scraper)

This directory contains project preparation utilities used in data capture and extraction.

It is included here because the workbench is built on top of DDP-derived source material and the repository should remain honest about that lineage. At the same time, the heavy derived frontend payloads are intentionally kept outside this public repository.

## What Is Not In This Repository

This public repository does not include:

- the heavy runtime payloads under `demo/frontend/data/`
- the full internal research note corpus
- the broader internal workbench structure of the main private-ish working repository

## How To Think About The Boundary

The easiest way to think about this repository is:

- the live interface and its public documentation are here
- selected build and deployment logic is here
- the full operational and research workspace is elsewhere

If you are trying to understand the workbench as a scholarly interface, this repository should be enough to show the public shell, the major reading surfaces, and the basic deployment path.
