# Antica Fiamma

**Antica Fiamma** is a public Dante research interface by Ruoci Song. It builds a line-first reading environment for the *Commedia* using the Dartmouth Dante Project as its commentary source, while keeping the source archive and the added interface layer visibly distinct.

The project is not a replacement for the Dartmouth Dante Project. It is a scholarly reading layer around DDP-derived commentary material: a way to move from Dante's line, to commentary records, to word routes, to comparison, to authority structures, and back again.

## Live Entrances

- Primary site: [anticafiamma.it](https://anticafiamma.it)
- Current mirror / transition domain: [ddpcommentary.com](https://ddpcommentary.com)

The public repository documents the interface and deployment shell. The full runtime data payloads used by the live site are intentionally not versioned here.

## Best First Reading Path

If you are arriving from outside the codebase, start with the live pages rather than the file tree.

- [About](https://anticafiamma.it/about.html): project framing, source map, data statement, rights posture, and colophon.
- [Guide](https://anticafiamma.it/guide.html): a reader-facing guide to moving through the interface without needing software vocabulary first.
- [Interface Tour](https://anticafiamma.it/reading-route.html): a visual tour of the major panels and how they are used.
- [Authority Layer](https://anticafiamma.it/authority.html): the author, work, personaggio, and source-facing layer.
- [Fiamma Research Room](https://anticafiamma.it/research/fiamma.html): a public case study for Dante's fire vocabulary and the wider fire motif.

Mirror links are available under the same paths at `https://ddpcommentary.com`.

## What Antica Fiamma Does

Antica Fiamma begins from Dante's poem. A reader can enter by canto, line, content word, commentary card, comparison path, authority page, or research room. The central design principle is that these are different scholarly reading acts, not just different UI filters.

The public interface currently includes:

- **Main Entry**: canto and line entry into the poem.
- **Analysis Layer / Line Snapshot**: a quick orientation layer for density, terms, span, and local commentary pressure after a line is selected.
- **Close Reading / Commentary**: record-level reading with source, date, sorting, full-text expansion, and comparison paths.
- **Dante Word Locus Layer**: word-centered routes through occurrence, micro-context, phrase expansion, and contrastive interpretive vocabulary.
- **Interpretive Fields**: local commentary-side semantic groupings around a selected line.
- **Cross-Canto Echoes**: text-first line relations elsewhere in the *Commedia*.
- **Compare**: a side-by-side surface for holding multiple commentary records together.
- **Authority**: author, work, personaggio, source, and static authority-room navigation.
- **Research Rooms**: public case-study pages built inside the larger interface, beginning with the fire motif room.

## What This Repository Is

This is the public shell for Antica Fiamma. It is designed to make the project legible without exposing the whole internal research workspace.

It contains:

- the public website shell under [`demo/frontend`](demo/frontend)
- public static pages, styles, assets, and client-side modules
- generated public authority pages under `demo/frontend/autore/` and `demo/frontend/personaggio/`
- the public Fiamma research room and its static research assets
- selected build scripts that show how the interface-facing structures are prepared
- smoke tests for checking the public shell
- Cloudflare Pages packaging and deployment wiring
- selected source-capture utilities kept for lineage transparency
- public documentation about the repository, interface layers, and data boundary

It does not contain:

- the heavy runtime data payloads under `demo/frontend/data/`
- report output under `demo/frontend/reports/`
- local snapshots, legacy runtime stores, or upload state
- internal thread prompts, audits, overnight reports, and review workspaces
- publication drafting folders or private research notebooks
- large experimental outputs that are not part of the public shell

## Repository Map

Start here if you are reading the repository as a project artifact.

- [`docs/public/repository-guide.md`](docs/public/repository-guide.md): how to read this public repository.
- [`docs/public/interface-layers.md`](docs/public/interface-layers.md): the public interface layers and what each one does.
- [`docs/public/data-boundary.md`](docs/public/data-boundary.md): what is included, what is excluded, and why.
- [`docs/public/public-repository-boundary.md`](docs/public/public-repository-boundary.md): the public repository boundary checklist.

Module-level guides:

- [`demo/frontend/README.md`](demo/frontend/README.md): website shell, public pages, static assets, and generated authority rooms.
- [`demo/frontend/static/modules/README.md`](demo/frontend/static/modules/README.md): frontend module structure and runtime contract notes.
- [`demo/frontend/static/modules/panels/README.md`](demo/frontend/static/modules/panels/README.md): line-level and word-level panel split.
- [`demo/frontend/research/README.md`](demo/frontend/research/README.md): public research rooms.
- [`demo/frontend/autore/README.md`](demo/frontend/autore/README.md): generated author and work authority pages.
- [`demo/frontend/personaggio/README.md`](demo/frontend/personaggio/README.md): generated personaggio authority pages.
- [`demo/runtime_checks/README.md`](demo/runtime_checks/README.md): smoke checks for the public shell.
- [`deployment_output/README.md`](deployment_output/README.md): Cloudflare Pages shell packaging.
- [`src/ddp_scraper/README.md`](src/ddp_scraper/README.md): selected source-capture utilities and their public boundary.

Main directories:

- [`demo/frontend`](demo/frontend): public site shell.
- [`demo/build_demo_data.py`](demo/build_demo_data.py): layered frontend-data build entrypoint retained for method transparency.
- [`demo/build_authority_static_pages.py`](demo/build_authority_static_pages.py): static authority page generator.
- [`demo/runtime_checks`](demo/runtime_checks): smoke tests and browser probes.
- [`deployment_output/PREPARE_PAGES_SHELL.py`](deployment_output/PREPARE_PAGES_SHELL.py): Cloudflare Pages shell packaging script.
- [`.github/workflows/deploy-pages-shell.yml`](.github/workflows/deploy-pages-shell.yml): GitHub Actions deployment workflow.
- [`src/ddp_scraper`](src/ddp_scraper): selected source-capture utilities.

## Data And Rights Boundary

Antica Fiamma uses the Dartmouth Dante Project as its commentary source. The public site credits that relationship explicitly and treats DDP as the source archive, not as a hidden backend.

The full text of commentary records belongs to the source context from which it is drawn. This public repository therefore separates the visible interface shell from the heavier runtime data payloads used by the live site. The repository is meant to document the scholarly interface, selected method-facing code, and public deployment path; it is not meant to distribute every generated data object.

For the detailed boundary, see [`docs/public/data-boundary.md`](docs/public/data-boundary.md).

## Local Preview

Serve the public shell locally:

```bash
cd <repo-root>
python3 demo/server.py
```

Then open:

```text
http://127.0.0.1:8777/
```

Optional Python environment setup:

```bash
cd <repo-root>
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -e .
```

The local shell may not reproduce the live site completely unless the external runtime data layer is available.

## Deployment

The public shell deploys through Cloudflare Pages.

Relevant files:

- [`deployment_output/PREPARE_PAGES_SHELL.py`](deployment_output/PREPARE_PAGES_SHELL.py)
- [`.github/workflows/deploy-pages-shell.yml`](.github/workflows/deploy-pages-shell.yml)

The packaging script prepares a static shell release folder while excluding runtime data, reports, snapshots, and local-only build residue.

## Status

Antica Fiamma is an active research interface. This repository is meant to be externally readable and stable enough to share, while the full research workspace remains separate.

The public framing may continue to evolve as the project name, domains, research rooms, and reuse posture settle into their final form.
