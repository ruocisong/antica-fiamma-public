# Rights-Safe Runtime Sample

This directory provides a small sample of the static runtime asset structure
used by Antica Fiamma.

It is intended for readers of the public repository and related publications
who want to inspect the shape of the static data layer without redistributing
the full commentary corpus.

## What This Sample Shows

- how a public manifest can point to canto, line, record, search, and authority
  assets
- how a line-first payload gathers poem, commentary-span, and panel-facing
  data around a selected line
- how a record store can preserve source-facing metadata while redacting full
  commentary text
- how an authority payload can expose author/work routes without reproducing
  a full source corpus
- how coverage counts can be documented apart from the full runtime data layer

## What This Sample Does Not Include

This sample does not include the full Dartmouth Dante Project-derived
commentary payload used by the live site.

The commentary snippets in this directory are synthetic or redacted examples.
They document runtime structure, not source content.

## Files

- [`manifest.sample.json`](manifest.sample.json): minimal static runtime
  manifest.
- [`line_payload.sample.json`](line_payload.sample.json): line-first JSON
  payload for one synthetic reading route.
- [`record_store.sample.json`](record_store.sample.json): record metadata
  and redacted/synthetic record content.
- [`authority.sample.json`](authority.sample.json): compact author/work
  authority structure.
- [`coverage_counts.csv`](coverage_counts.csv): frozen public-build counts
  from the live runtime layer, without redistributing payload rows.

## Reuse

The sample files are part of the public repository documentation. They may be
used to understand or adapt the static asset pattern, but they do not grant
rights to redistribute source materials from the Dartmouth Dante Project.
