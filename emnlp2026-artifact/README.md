# Antica Fiamma EMNLP 2026 Demo Artifact

Prepared: 2026-07-08

This directory is the reviewer-facing artifact packet for the EMNLP 2026 System Demonstration submission:

**Antica Fiamma: A Source-Accountable Workbench for Line-First Reading in the Dante Commentary Tradition**

## Submission Links

- Live demo: <https://anticafiamma.it>
- Public artifact repository: <https://github.com/ruocisong/antica-fiamma-public>
- Paper draft snapshot: [PAPER_DRAFT.md](PAPER_DRAFT.md)
- Scripted review routes: [ROUTES.md](ROUTES.md)
- Rights and limitations: [RIGHTS_AND_LIMITATIONS.md](RIGHTS_AND_LIMITATIONS.md)
- Screencast: submitted as supplementary MPEG4 with the EMNLP demo submission.

## Frozen Build Boundary

The public repository contains the rights-safe review shell, public documentation, selected code, deployment notes, and sample structures. It does not redistribute the full generated commentary runtime payload through GitHub.

The runtime evaluated in the paper is frozen by internal build commit:

```text
ccfc9851e0ef5a1bd9a602bffb1d48083d45c5b8
```

That commit records the final authority deploy-gate cleanup used by the paper:

- 100/100 record-local authority sidecars fresh against the current extractor, policy, lexicon, store, and fulltext hashes.
- 100/100 canto authority indexes passing consistency checks.
- Author-level mounted work totals matching sidecar-derived counts.
- Zero stale locator-payload warnings.

## Evaluation Packet

The paper reports five artifact-level checks:

- Runtime coverage counts for the mounted 100-canto workbench.
- 50 sampled line-record mappings checked against live Dartmouth Dante Project detail pages.
- 100 sampled record-local author/work mentions checked by automatic authority-consistency predicates.
- Static asset latency timing for a representative line-first route.
- A qualitative case study contrasting search-first archive use with an Antica Fiamma line-first route.

Authority files are framed as automatic consistency audits. They are not correctness labels, extraction precision estimates, or human-study results.

## Public Routes

The three scripted reviewer routes are:

- Route A: <https://anticafiamma.it/inferno/1/1#records-section>
- Route B: <https://anticafiamma.it/inferno/26/90#records-section>
- Route C: <https://anticafiamma.it/purgatorio/30/48#records-section>

## Source Relationship

Antica Fiamma is an interface layer around Dante commentary records associated with the Dartmouth Dante Project and related source structures. The project preserves source links and source boundaries. Full source-derived commentary payloads are governed by their source reuse conditions and are not treated as unrestricted GitHub redistribution material.
