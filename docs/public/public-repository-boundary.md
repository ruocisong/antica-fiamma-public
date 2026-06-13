# Antica Fiamma Public Repository Boundary

This file records the intended scope of the public-facing **Antica Fiamma** repository.

The public project name is **Antica Fiamma**.

## Public Purpose

The public repository provides:

- a clear project identity
- live site links for Antica Fiamma
- a readable map of the public interface
- enough source structure to understand the shell
- enough build and deployment logic to understand how the shell reaches Cloudflare Pages
- a clear boundary around data, rights, generated payloads, and internal research work

It keeps the public project entrance separate from the internal studio floor.

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
- [`src/ddp_scraper`](../../src/ddp_scraper), as selected lineage and preparation utilities
- [`deployment_output/PREPARE_PAGES_SHELL.py`](../../deployment_output/PREPARE_PAGES_SHELL.py)
- [`.github/workflows/deploy-pages-shell.yml`](../../.github/workflows/deploy-pages-shell.yml)
- [`pyproject.toml`](../../pyproject.toml)
- [`docs/public`](../../docs/public)
- [`sample_runtime`](../../sample_runtime), as a rights-safe structural sample
- [`LICENSE`](../../LICENSE), [`LICENSES.md`](../../LICENSES.md), [`CITATION.cff`](../../CITATION.cff), and [`.zenodo.json`](../../.zenodo.json)

## Exclude Or Keep Internal

- `demo/frontend/data/`
- `demo/frontend/reports/`
- `demo/frontend/data_snapshots/`
- `demo/frontend/data_legacy_pre_page_state_v2/`
- `deployment_output/pages_shell_build/`
- local visual experiments not linked from the public site
- authority review buckets and pressure-response documents
- semantic-thread experiments and overnight outputs
- summary-layer experiments
- cross-canto publication workspaces
- `ops/prompts/`, thread handoffs, and internal operating notes
- uploader utilities and local release wrappers
- local screenshots, scratch files, and `.DS_Store`

## Public README Should Answer

- What Antica Fiamma is
- Where the live site is: [anticafiamma.it](https://anticafiamma.it) and [ddpcommentary.com](https://ddpcommentary.com)
- What public pages a visitor can read first
- How Antica Fiamma relates to the Dartmouth Dante Project
- Which interface layers are present
- What is included in this public repository
- What data is intentionally excluded
- How to preview the shell locally
- How the Cloudflare Pages deployment is prepared
- Which module README files explain the main repository areas
- How to cite and license the repository artifact
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
src/
  ddp_scraper/
deployment_output/
.github/workflows/
docs/
  public/
sample_runtime/
LICENSE
LICENSES.md
CITATION.cff
.zenodo.json
```

## Current Position

The public repository is maintained as a stable project entrance. It shows method and structure while keeping working notes, experiments, and generated payloads in the appropriate internal or runtime layers.

The strongest public path is now:

- [Antica Fiamma](https://anticafiamma.it)
- [About](https://anticafiamma.it/about.html)
- [Guide](https://anticafiamma.it/guide.html)
- [Interface Tour](https://anticafiamma.it/reading-route.html)
- [Authority Room](https://anticafiamma.it/authority.html)
- [Fiamma Research Room](https://anticafiamma.it/research/fiamma.html)
