# Sustainability And Maintenance

This note records the current sustainability and maintenance arrangements for **Antica Fiamma**.

It is a public-facing statement of what is already in place: how the site is maintained, how the public repository is bounded, how generated materials are handled, and how future collaborations can be added through explicit agreements.

## Current Maintenance Model

Antica Fiamma is currently maintained by Ruoci Song as an autonomous research project.

The public infrastructure currently includes:

- a primary public domain, [anticafiamma.it](https://anticafiamma.it), registered and paid for by the project author
- a public GitHub repository for the inspectable shell
- a Cloudflare Pages deployment path currently maintained under the author's Cloudflare account on the free tier
- an external runtime data layer for heavy payloads
- local build scripts for generated interface data and authority pages
- public smoke checks for selected interface paths
- documentation for source, data boundary, deployment, and interface structure

This arrangement keeps the working prototype public, inspectable, and maintainable under the author's current project stewardship.

## Hosting And Stewardship

The current site operation remains with the project author. Domain registration, domain payment, Cloudflare account management, deployment configuration, and repository maintenance are all author-maintained at this stage.

This keeps day-to-day infrastructure, domains, deployment, and repository maintenance in a clearly documented author-maintained frame. Scholarly advice, public discussion, or future collaboration can be added without blurring the current operational responsibility.

If an institutional role is defined later, it can be recorded as a separate agreement covering scope, governance, resources, rights, and maintenance.

## Public Repository Boundary

The public repository supports sustainability by keeping the project shell legible and bounded.

It includes:

- public HTML pages
- public styles, modules, and assets
- generated static authority pages
- public research-room assets
- selected build scripts
- smoke checks
- deployment packaging
- public documentation

It excludes:

- heavy runtime data payloads
- generated deployment output
- local snapshots and legacy data stores
- internal research threads
- publication drafts
- local upload state and operational scratch files

This separation makes the repository easier to review, maintain, and share.

## Data And Source Safeguards

The project documents its source relationship with the Dartmouth Dante Project and keeps DDP visible as source archive.

The current public repository keeps heavy runtime commentary payloads outside GitHub. Rights-sensitive layers are therefore separated from the public shell. If source or permission conditions call for a reduced version, the interface can continue as a line-first reading environment with a smaller, rights-cleared, or differently sourced data layer.

## Maintenance Practices Already In Place

Current maintenance practices include:

- Git-based version control
- a separate public repository for the shareable shell
- `.gitignore` rules excluding data payloads, reports, snapshots, and generated build output
- Cloudflare Pages packaging through `deployment_output/PREPARE_PAGES_SHELL.py`
- generated authority pages kept in stable public directories
- public documentation for interface layers and data boundary
- smoke checks for selected front-end behavior
- manual review before public documentation updates are pushed

These measures make the project inspectable as a working DH prototype with an explicit maintenance boundary.

## Consolidation Path

The current consolidation path is staged:

- keep the public shell and runtime data clearly separated
- maintain source attribution and rights documentation
- preserve a reduced public path if source permissions require it, by removing modern commentary material while retaining public-domain commentary layers where available
- keep generated pages and deployment output distinguishable
- expand documentation where new public rooms or interface layers are added
- record any future institutional roles through explicit agreements

The project is therefore sustainable at its present scale as an author-maintained research interface. Any broader institutional frame can build on this documented arrangement.
