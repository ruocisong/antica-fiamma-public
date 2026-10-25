# Antica Fiamma Public Repository Boundary

This file records the intended scope of the public-facing **Antica Fiamma (AF)** repository.

The public project name is **Antica Fiamma**. The abbreviation **AF** may be used after first mention.

## Public Purpose

The public repository provides:

- a clear project identity;
- live site links for Antica Fiamma;
- a readable map of the public scholarly interface;
- enough source structure to understand the public shell and selected methods;
- enough build and packaging logic to inspect the public artifact without exposing the private production repository;
- a clear boundary around data, rights, generated payloads, and internal research work; and
- stable citation, licence, provenance, and rights documentation.

It keeps the public project entrance separate from the internal studio floor.

## Not A Mirror

The public repository is **not** a mirror of the private production and research repository.

The private repository may contain active development, internal research materials, source-sensitive inputs, generated runtime assets, review traces, release coordination, operational state, private correspondence, publication drafts, and other material that does not belong in a public scholarly object.

The public and private repositories are therefore not expected to share identical file trees, Git histories, commit sequences, or release cadence. Public omission does not imply that a feature is absent from the live AF environment.

A public update should copy or reconstruct only material that has been positively selected for public release. Changing the visibility of the private repository, publishing its full Git history, or treating the private repository as a public-release artifact is outside this repository's publication model.

## Keep

- [`README.md`](../../README.md)
- [`demo/frontend`](../../demo/frontend), excluding heavy runtime data, reports, snapshots, and internal experiments
- [`demo/frontend/README.md`](../../demo/frontend/README.md)
- [`demo/frontend/research`](../../demo/frontend/research)
- [`demo/frontend/autore`](../../demo/frontend/autore)
- [`demo/frontend/personaggio`](../../demo/frontend/personaggio)
- [`demo/frontend/static/modules`](../../demo/frontend/static/modules)
- [`demo/build_authority_static_pages.py`](../../demo/build_authority_static_pages.py)
- [`demo/build_demo_data.py`](../../demo/build_demo_data.py)
- [`demo/runtime_checks`](../../demo/runtime_checks)
- [`demo/server.py`](../../demo/server.py)
- [`deployment_output/PREPARE_PAGES_SHELL.py`](../../deployment_output/PREPARE_PAGES_SHELL.py)
- [`pyproject.toml`](../../pyproject.toml)
- [`docs/public`](../../docs/public)
- [`sample_runtime`](../../sample_runtime), as a rights-safe structural sample
- [`LICENSE`](../../LICENSE), [`LICENSES.md`](../../LICENSES.md), [`CITATION.cff`](../../CITATION.cff), and [`.zenodo.json`](../../.zenodo.json)

## Exclude Or Keep Internal

- complete DDP-derived commentary payloads or reconstructable bulk exports;
- `demo/frontend/data/` when it contains the full generated runtime;
- `demo/frontend/reports/`;
- `demo/frontend/data_snapshots/`;
- `demo/frontend/data_legacy_pre_page_state_v2/`;
- `deployment_output/pages_shell_build/`;
- private or source-sensitive local inputs;
- local visual experiments not linked from the public site;
- authority review buckets and pressure-response documents;
- semantic-thread experiments and overnight outputs;
- summary-layer experiments;
- cross-canto publication workspaces;
- article and conference submission drafts or reviewer-only artifact packets;
- `ops/prompts/`, thread handoffs, internal operating notes, and release-coordination records;
- uploader state, credentials, secrets, environment files, and private deployment wrappers;
- local screenshots, scratch files, caches, and `.DS_Store`.

## Public README Should Answer

- What Antica Fiamma is
- Where the live site is: [anticafiamma.it](https://anticafiamma.it)
- Where the public code repository is: [ruocisong/antica-fiamma-public](https://github.com/ruocisong/antica-fiamma-public)
- What public pages a visitor can read first
- How Antica Fiamma relates to the Dartmouth Dante Project
- Which interface layers are present
- What is included in this public repository
- What data is intentionally excluded
- Why the public repository is not a mirror of the private production repository
- How to preview the shell locally
- How the Cloudflare Pages package is prepared, while production deployment remains private
- Which module README files explain the main repository areas
- How to cite and license the repository artifact
- How the living GitHub repository differs from the fixed Zenodo 1.0.0 archive
- Where to find the rights-safe sample runtime structure

## Public Repo Shape

```text
README.md
demo/
  frontend/
    README.md
    index.html
    about.html
    guide.html
    reading-route.html
    authority.html
    research/
    autore/
    personaggio/
    static/
  build_demo_data.py
  build_authority_static_pages.py
  runtime_checks/
  server.py
deployment_output/
docs/
  public/
sample_runtime/
LICENSE
LICENSES.md
CITATION.cff
.zenodo.json
```

## Current Position

The public repository is maintained as a stable project entrance and inspectable scholarly artifact. It exposes method and structure while keeping working notes, experiments, private history, and source-sensitive generated payloads in the appropriate internal or runtime layers.

The strongest public path is:

- [Antica Fiamma](https://anticafiamma.it)
- [About](https://anticafiamma.it/about.html)
- [Guide](https://anticafiamma.it/guide.html)
- [Interface Tour](https://anticafiamma.it/reading-route.html)
- [Authority Room](https://anticafiamma.it/authority.html)
- [Fiamma Research Room](https://anticafiamma.it/research/fiamma.html)

See [current-status.md](current-status.md) for the living public-repository status after the archived 1.0.0 release.
