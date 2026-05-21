# Repository Guide

This guide explains how to read the public `ddp-workbench-public` repository now that the project is presented publicly as **Antica Fiamma**.

## Public Identity

Antica Fiamma is the project name.

Live entrances:

- [anticafiamma.it](https://anticafiamma.it)
- [ddpcommentary.com](https://ddpcommentary.com)

The repository name still records an earlier working phase. The public-facing project identity is now Antica Fiamma.

## What This Repository Is For

This repository is a public project shell. It is meant to make the live interface, public documentation, selected method-facing code, and deployment path inspectable.

It is scoped as the public project shell. Large runtime data payloads, local snapshots, thread-specific working notes, publication drafts, and private operating material remain in the internal working environment.

The best metaphor is architectural rather than archival: this repository is the entrance hall and public floor plan, not the whole studio.

## First Reading Path

For a fast external reading, use this order:

- [README.md](../../README.md): project overview, live entrances, public scope, and repository map.
- [About](https://anticafiamma.it/about.html): source map, data statement, rights posture, and colophon.
- [Guide](https://anticafiamma.it/guide.html): practical reading guidance for the live interface.
- [Interface Tour](https://anticafiamma.it/reading-route.html): visual walkthrough of the major panels.
- [Authority Room](https://anticafiamma.it/authority.html): author, work, personaggio, and source-facing navigation connected to the reading interface.
- [Fiamma Research Room](https://anticafiamma.it/research/fiamma.html): public research room for Dante's fire vocabulary and motif.

The same public pages are also reachable from `https://ddpcommentary.com` during the domain transition.

Repository notes after that:

- [for-reviewers.md](./for-reviewers.md)
- [scheda-progetto.md](./scheda-progetto.md)
- [project-dossier.md](./project-dossier.md)
- [interface-layers.md](./interface-layers.md)
- [data-boundary.md](./data-boundary.md)
- [rights-and-permissions.md](./rights-and-permissions.md)
- [technical-overview.md](./technical-overview.md)
- [sustainability-and-maintenance.md](./sustainability-and-maintenance.md)
- [demo-paths.md](./demo-paths.md)
- [public-repository-boundary.md](./public-repository-boundary.md)

## Main Directories

### [`demo/frontend`](../../demo/frontend)

The public website shell.

It contains:

- `index.html`, the Antica Fiamma entrypoint.
- `about.html`, `guide.html`, `reading-route.html`, and `authority.html`.
- `research/fiamma.html`, the public fire-motif research room.
- static styles, images, route-tour assets, and client-side modules.
- generated static authority pages under `autore/` and `personaggio/`.
- public shell assets such as `_redirects`, `robots.txt`, `sitemap.xml`, and `favicon.svg`.

See [`demo/frontend/README.md`](../../demo/frontend/README.md).

### [`demo/frontend/static/modules`](../../demo/frontend/static/modules)

The client-side module area.

The current public shell still uses `static/app.js` as the main browser entrypoint, but stable panel logic and runtime contracts have been split out around line-level, word-level, authority, records, routing, state, and loader responsibilities.

See [`demo/frontend/static/modules/README.md`](../../demo/frontend/static/modules/README.md).

### [`demo/frontend/autore`](../../demo/frontend/autore)

Generated static author and work authority rooms.

These pages make the authority room linkable outside the main reading session. They are public interface pages, not private build artifacts.

See [`demo/frontend/autore/README.md`](../../demo/frontend/autore/README.md).

### [`demo/frontend/personaggio`](../../demo/frontend/personaggio)

Generated static personaggio authority rooms.

These pages keep personaggio navigation separate from author/work navigation unless the data explicitly models the relation.

See [`demo/frontend/personaggio/README.md`](../../demo/frontend/personaggio/README.md).

### [`demo/frontend/research`](../../demo/frontend/research)

Public research rooms.

The first room is the Fiamma research page, which turns a lexical and motif-level research configuration into a public-facing reading path.

See [`demo/frontend/research/README.md`](../../demo/frontend/research/README.md).

### [`demo/build_demo_data.py`](../../demo/build_demo_data.py)

The layered frontend-data build entrypoint.

It is retained for methodological transparency. The generated runtime payloads themselves are excluded from the public repository boundary.

### [`demo/build_authority_static_pages.py`](../../demo/build_authority_static_pages.py)

The generator for static authority-facing HTML pages.

It is included because the authority room is part of the public interface and because the generated pages need an inspectable build path.

### [`demo/runtime_checks`](../../demo/runtime_checks)

Smoke checks and browser probes for the public shell.

These checks are not a full test suite. They are practical release guards for the pages, assets, and interaction paths most likely to break during public-shell updates.

See [`demo/runtime_checks/README.md`](../../demo/runtime_checks/README.md).

### [`deployment_output`](../../deployment_output)

Cloudflare Pages packaging.

Only the packaging script belongs in Git. The generated `pages_shell_build/` folder is build output and remains ignored.

See [`deployment_output/README.md`](../../deployment_output/README.md).

### [`src/ddp_scraper`](../../src/ddp_scraper)

Selected source-capture utilities.

They remain here for lineage transparency. Runtime corpus distribution is handled outside this public repository.

See [`src/ddp_scraper/README.md`](../../src/ddp_scraper/README.md).

## Maintained Outside This Repository

This public repository excludes:

- heavy runtime payloads under `demo/frontend/data/`
- report output directories under `demo/frontend/reports/`
- local data snapshots and legacy runtime stores
- generated deployment output under `deployment_output/pages_shell_build/`
- internal thread prompts, overnight audits, and review workspaces
- publication drafting folders
- large experimental outputs for semantic, summary, authority-review, or cross-canto research
- local uploader state, scratch files, and operating clutter not needed for public review

## Reading The Boundary

The repository is designed for two kinds of visitors:

- A humanities reader can understand what the site is, where to click first, how it relates to DDP, and why the interface matters.
- A technical reader can see the public shell structure, deployment path, selected build logic, and data boundary while recognizing that corpus payloads are maintained separately.

That double audience is intentional.
