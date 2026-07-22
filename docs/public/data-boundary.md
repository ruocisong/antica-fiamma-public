# Data Boundary

This note explains the data scope of the public-facing **Antica Fiamma** repository.

## Included Here

This repository includes:

- the public Antica Fiamma shell under [`demo/frontend`](../../demo/frontend)
- public static pages such as About, Guide, Interface Tour, Authority, and the Fiamma research room
- generated static authority pages under `autore/` and `personaggio/`
- public images, styles, client modules, and route-tour assets
- selected build scripts that explain how interface-facing structures are prepared
- smoke tests for the public shell
- inspectable Cloudflare Pages packaging helpers
- public documentation about interface structure, scope, data boundary, and source attribution
- selected source-capture utilities under [`src/ddp_scraper`](../../src/ddp_scraper)
- a rights-safe structural sample of runtime assets under [`sample_runtime`](../../sample_runtime)
- citation and licensing metadata for repository-level reuse

## Maintained Outside This Repository

Heavy runtime payloads delivered to the live interface are maintained outside this public repository.

In particular, it excludes:

- `demo/frontend/data/`
- `demo/frontend/reports/`
- `demo/frontend/data_snapshots/`
- `demo/frontend/data_legacy_pre_page_state_v2/`
- `deployment_output/pages_shell_build/`
- local R2 upload state and generated upload bookkeeping
- internal research thread outputs
- publication drafting folders
- large experimental semantic, summary, authority-review, and cross-canto workspaces
- local operational scripts that are not needed for public review

## Why The Boundary Exists

The boundary is intentional.

Antica Fiamma is a live research interface with a substantial runtime data layer. The public repository makes the public shell, public documentation, selected method-facing code, and static packaging method legible without turning GitHub into either the production deployment repository or the distribution channel for every generated payload.

This keeps the public repo readable. It also keeps the relationship between source archive, interface layer, generated runtime data, and internal research workspace from collapsing into one undifferentiated code dump.

The [`sample_runtime`](../../sample_runtime) directory exists to make the
runtime pattern inspectable without redistributing the full commentary corpus.
It documents representative JSON shapes, coverage counts, and source-boundary
fields while using synthetic or redacted commentary placeholders.

## Source Archive And Interface Layer

Antica Fiamma is built with the Dartmouth Dante Project as its commentary source.

This repository represents an additional scholarly interface layer. The public pages credit the Dartmouth Dante Project explicitly while distinguishing DDP as source archive from Antica Fiamma as reading environment.

## Practical Consequence

A reader can inspect:

- how the public shell is structured
- how the major reading layers are framed
- how public research rooms are added
- how selected build and deployment scripts are organized
- how the project describes its source and reuse boundary

A reader can use this repository to inspect the public shell and documentation while treating the full live runtime corpus as a separately maintained data layer.

The sample runtime files should therefore be read as schema and publication
boundary documentation, not as a substitute for the live data layer or as a
redistribution of Dartmouth Dante Project commentary texts.
