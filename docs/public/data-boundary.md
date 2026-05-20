# Data Boundary

This note explains what the public-facing `ddp-workbench-public` repository does and does not contain at the data level.

## Included Here

This repository includes:

- the public Antica Fiamma shell under [`demo/frontend`](../../demo/frontend)
- public static pages such as About, Guide, Interface Tour, Authority, and the Fiamma research room
- generated static authority pages under `autore/` and `personaggio/`
- selected build scripts that explain how interface-facing structures are prepared
- smoke tests for the public shell
- Cloudflare Pages deployment helpers
- public documentation about interface structure, scope, data boundary, and source attribution
- selected source-capture utilities under [`src/ddp_scraper`](../../src/ddp_scraper)

## Not Included Here

This repository does **not** version the heavy runtime payloads delivered to the live interface.

In particular, it excludes:

- `demo/frontend/data/`
- `demo/frontend/reports/`
- local data snapshots and legacy data stores
- internal research thread outputs
- publication drafting folders
- large experimental semantic, summary, and cross-canto workspaces
- local operational scripts that are not needed for public review

## Why The Boundary Exists

The boundary is intentional.

Antica Fiamma is a live research interface with a substantial runtime data layer. The public repository is meant to make the public shell, public documentation, selected method-facing code, and deployment path legible without turning GitHub into the distribution channel for every generated payload.

## Source Archive And Interface Layer

Antica Fiamma is built with the Dartmouth Dante Project as its commentary source.

This repository represents an additional scholarly interface layer. It is not a replacement archive, and it should not obscure the source relationship. The public pages therefore continue to credit the Dartmouth Dante Project explicitly while distinguishing DDP as source archive from Antica Fiamma as reading environment.

## Practical Consequence

A reader can inspect:

- how the public shell is structured
- how the major reading layers are framed
- how selected build and deployment scripts are organized
- how the project describes its source and reuse boundary

A reader should not expect this repository alone to reproduce the full live runtime corpus.
