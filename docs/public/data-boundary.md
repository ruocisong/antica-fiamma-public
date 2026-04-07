# Data Boundary

This note explains what the public-facing `ddp-workbench-public` repository does and does not contain at the data level.

## What Is Included Here

This repository includes:

- the public interface shell under [`demo/frontend`](../../demo/frontend)
- selected build scripts that explain how interface-facing structures are prepared
- deployment helpers for the public shell
- public-facing documentation about scope, method, and interface structure

## What Is Not Included Here

This repository does **not** version the heavy runtime payloads delivered to the live interface at runtime.

In particular, the repository does not ship the large frontend data layer under `demo/frontend/data/`.

That means a reader can inspect the public shell and supporting build logic here, but not the full heavy derived payloads that power the live workbench.

## Why The Boundary Exists

The boundary is intentional.

The public repository is meant to expose:

- the shape of the interface
- the scholarly reading surfaces
- the method-facing build logic
- the public deployment path

without turning the repository itself into a distribution point for the full runtime payloads.

## Source Archive And Interface Layer

The workbench is built on top of the Dartmouth Dante Project as its source archive.

This repository therefore represents an additional interface layer, not a replacement source archive. Public presentation should keep that distinction visible and continue to credit the Dartmouth Dante Project explicitly.

## How To Read This Repository

The simplest way to interpret this repository is:

- the interface shell is here
- the public explanatory material is here
- selected build logic is here
- the heavy runtime data layer is elsewhere

That boundary is part of the project design, not an omission caused by an incomplete upload.
