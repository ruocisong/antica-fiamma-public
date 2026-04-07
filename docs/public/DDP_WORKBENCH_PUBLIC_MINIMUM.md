# DDP Workbench Public Repo Minimum

If you want a cleaner public-facing repository or a dedicated `ddp-workbench-public`, this is the minimum recommended scope.

## Keep

- [`README.md`](../../README.md)
- [`demo/frontend`](../../demo/frontend)
- [`demo/build_authority_static_pages.py`](../../demo/build_authority_static_pages.py)
- [`demo/build_demo_data.py`](../../demo/build_demo_data.py)
- [`demo/runtime_checks/app_shell_smoke.mjs`](../../demo/runtime_checks/app_shell_smoke.mjs)
- [`demo/runtime_checks/authority_interaction_smoke.mjs`](../../demo/runtime_checks/authority_interaction_smoke.mjs)
- [`demo/server.py`](../../demo/server.py)
- [`src/ddp_scraper`](../../src/ddp_scraper)
- [`deployment_output/PREPARE_PAGES_SHELL.py`](../../deployment_output/PREPARE_PAGES_SHELL.py)
- [`.github/workflows/deploy-pages-shell.yml`](../../.github/workflows/deploy-pages-shell.yml)
- [`pyproject.toml`](../../pyproject.toml)
- one concise public data / rights note

## Move To Internal Or Exclude

- [`authority/docs/reviews`](../../authority/docs/reviews)
- [`semantic_thread/review`](../../semantic_thread/review)
- [`ops/prompts`](../../ops/prompts)
- [`scripts`](../../scripts)
- uploader utilities at repository top level
- overnight / audit / pressure-response / progress files
- local helper scripts such as staging and release wrappers if you do not want to expose your internal workflow

## Public README Should Answer

- What the workbench is
- Where the live site is
- How it relates to the Dartmouth Dante Project
- What is in repo and what is not
- How to run the frontend locally
- What data is excluded from Git
- What the reuse / attribution posture is

## Public Repo Structure

```text
README.md
demo/
  frontend/
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

## Notes

The current repository is still a full workbench. A public repo should feel like a stable project, not a live internal studio floor.
