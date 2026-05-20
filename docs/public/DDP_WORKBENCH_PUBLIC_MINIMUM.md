# Antica Fiamma Public Repository Boundary

This file records the intended scope of the public-facing `ddp-workbench-public` repository.

The purpose is no longer to expose the entire working project. The purpose is to keep a clean public shell for Antica Fiamma: enough to understand the live site, inspect the main public layers, and follow the deployment path.

## Keep

- [`README.md`](../../README.md)
- [`demo/frontend`](../../demo/frontend), excluding heavy runtime data, reports, snapshots, and internal experiments
- [`demo/build_authority_static_pages.py`](../../demo/build_authority_static_pages.py)
- [`demo/build_demo_data.py`](../../demo/build_demo_data.py)
- [`demo/runtime_checks/app_shell_smoke.mjs`](../../demo/runtime_checks/app_shell_smoke.mjs)
- [`demo/runtime_checks/authority_interaction_smoke.mjs`](../../demo/runtime_checks/authority_interaction_smoke.mjs)
- [`demo/server.py`](../../demo/server.py)
- [`src/ddp_scraper`](../../src/ddp_scraper), as selected lineage and preparation utilities
- [`deployment_output/PREPARE_PAGES_SHELL.py`](../../deployment_output/PREPARE_PAGES_SHELL.py)
- [`.github/workflows/deploy-pages-shell.yml`](../../.github/workflows/deploy-pages-shell.yml)
- [`pyproject.toml`](../../pyproject.toml)
- [`docs/public`](../../docs/public)

## Exclude Or Keep Internal

- `demo/frontend/data/`
- `demo/frontend/reports/`
- `demo/frontend/data_snapshots/`
- `demo/frontend/data_legacy_pre_page_state_v2/`
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
- Where the live site is
- What public pages a visitor should read first
- How Antica Fiamma relates to the Dartmouth Dante Project
- Which interface layers are present
- What is included in this public repository
- What data is intentionally excluded
- How to preview the shell locally
- How the Cloudflare Pages deployment is prepared

## Public Repo Shape

```text
README.md
demo/
  frontend/
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
```

## Current Position

The public repository should feel like a stable project entrance, not the whole internal studio floor. It can show method and structure without exposing every working note, experiment, or generated payload.
