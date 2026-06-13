# Antica Fiamma

**Antica Fiamma** is a public Dante research interface by Ruoci Song. It builds a line-first reading environment for the *Commedia* using the Dartmouth Dante Project as its commentary source, while keeping the source archive and the added interface layer visibly distinct.

The project is not a replacement for the Dartmouth Dante Project. It is a scholarly reading layer around DDP-derived commentary material: a way to move from Dante's line, to commentary records, to word routes, to comparison, to authority structures, and back again.

## Live Entrances

- Primary site: [anticafiamma.it](https://anticafiamma.it)
- Current mirror / transition domain: [ddpcommentary.com](https://ddpcommentary.com)

The public repository documents the interface and deployment shell. The full runtime data payloads used by the live site are intentionally not versioned here.

## Publication Artifact

For Code4Lib readers and other reviewers, this repository is the public
artifact for the Antica Fiamma static publication shell. It contains the
website shell, selected build and deployment code, public documentation,
runtime checks, licensing notes, citation metadata, and a rights-safe sample
of the JSON runtime structure.

It does not redistribute the full Dartmouth Dante Project-derived commentary
payload. The live interface keeps the Dartmouth Dante Project visible as the
commentary source archive, while this repository documents the added static
reading layer and its data boundary.

## Best First Reading Path

If you are arriving from outside the codebase, start with the live pages rather than the file tree.

- [About](https://anticafiamma.it/about.html): project framing, source map, data statement, rights posture, and colophon.
- [Guide](https://anticafiamma.it/guide.html): a reader-facing guide to moving through the interface without needing software vocabulary first.
- [Interface Tour](https://anticafiamma.it/reading-route.html): a visual tour of the major panels and how they are used.
- [Authority Room](https://anticafiamma.it/authority.html): the author, work, personaggio, and source-facing room connected to the reading interface.
- [Fiamma Research Room](https://anticafiamma.it/research/fiamma.html): a public case study for Dante's fire vocabulary and the wider fire motif.

Mirror links are available under the same paths at `https://ddpcommentary.com`.

## What Antica Fiamma Does

Antica Fiamma begins from Dante's poem. A reader can enter by canto, line, content word, commentary card, comparison path, authority page, or research room. The central design principle is that these are different scholarly reading acts, not just different UI filters.

The public interface combines reading scales with a parallel authority room:

- **Canto-level entry**: canto browser, line map, density bars, and quick jump into the poem.
- **Line-level reading**: Line Snapshot, local commentary pressure, Interpretive Fields, and Cross-Canto Echoes.
- **Word-level reading**: Dante Word Locus Layer, Occurrence Explorer, Weighted Micro-Context Concurrence, Exact Local Phrase Expansions, and Contrastive Interpretive Vocabulary.
- **Commentary-record reading**: Close Reading cards, source/date metadata, full-text expansion, sorting, and Compare.
- **Authority room**: a parallel author/work/personaggio/source space connected to commentary records, line contexts, source-facing paths, and generated static authority rooms.
- **Research-room reading**: public case-study rooms, beginning with the Fiamma room on Dante's fire vocabulary and motif.

These layers and rooms are parallel entry points into the same reading infrastructure. A reader can move from canto to line, from line to word, from commentary record to authority, or from a research room back to the poem without treating any one surface as the whole project.

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
- citation and licensing metadata for publication reuse
- a rights-safe sample of the static runtime asset structure under [`sample_runtime`](sample_runtime)

Excluded from this public repository:

- the heavy runtime data payloads under `demo/frontend/data/`
- report output under `demo/frontend/reports/`
- local snapshots, legacy runtime stores, or upload state
- internal thread prompts, audits, overnight reports, and review workspaces
- publication drafting folders or private research notebooks
- large experimental outputs that are not part of the public shell

## Repository Map

Start here if you are reading the repository as a project artifact.

- [`docs/public/repository-guide.md`](docs/public/repository-guide.md): how to read this public repository.
- [`docs/public/for-reviewers.md`](docs/public/for-reviewers.md): shortest reading path for a preliminary external review.
- [`docs/public/scheda-progetto.md`](docs/public/scheda-progetto.md): Italian project sheet for a first conversation.
- [`docs/public/project-dossier.md`](docs/public/project-dossier.md): compact dossier for a preliminary DH conversation.
- [`docs/public/interface-layers.md`](docs/public/interface-layers.md): the public interface layers and what each one does.
- [`docs/public/data-boundary.md`](docs/public/data-boundary.md): what is included, what is excluded, and why.
- [`docs/public/rights-and-permissions.md`](docs/public/rights-and-permissions.md): current source, permission, and data-governance posture.
- [`docs/public/technical-overview.md`](docs/public/technical-overview.md): technological and implementative choices.
- [`docs/public/sustainability-and-maintenance.md`](docs/public/sustainability-and-maintenance.md): current maintenance model, hosting boundary, and sustainability arrangements.
- [`docs/public/demo-paths.md`](docs/public/demo-paths.md): short routes for a first demonstration.
- [`docs/public/public-repository-boundary.md`](docs/public/public-repository-boundary.md): the public repository boundary checklist.
- [`sample_runtime/README.md`](sample_runtime/README.md): rights-safe sample of runtime JSON asset structures.
- [`LICENSES.md`](LICENSES.md): code, documentation, article, image, and data reuse boundary.
- [`CITATION.cff`](CITATION.cff): citation metadata for the public artifact.

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
- [`sample_runtime`](sample_runtime): rights-safe structural sample of runtime JSON assets.

## Data And Rights Boundary

Antica Fiamma uses the Dartmouth Dante Project as its commentary source. The public site credits that relationship explicitly and treats DDP as the visible source archive for the commentary layer.

The full text of commentary records belongs to the source context from which it is drawn. This public repository therefore separates the visible interface shell from the heavier runtime data payloads used by the live site. The repository documents the scholarly interface, selected method-facing code, and public deployment path while keeping generated data distribution outside GitHub.

For the detailed boundary, see [`docs/public/data-boundary.md`](docs/public/data-boundary.md).

For license and reuse scope, see [`LICENSES.md`](LICENSES.md). In brief:
source code is released under the MIT License; project documentation by Ruoci
Song is available under CC BY 4.0 unless otherwise noted; source-derived
runtime commentary payloads are not covered by this repository license and are
not redistributed here.

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
