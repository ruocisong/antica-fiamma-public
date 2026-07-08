# Antica Fiamma: A Source-Accountable Workbench for Line-First Reading in the Dante Commentary Tradition

## Abstract

Large commentary archives are valuable scholarly resources, but they are difficult to use as interactive line-level reading environments. A reader who starts from a passage must often move manually between poem text, search results, commentary records, line spans, chronology, and cited authorities. We present Antica Fiamma, a public web workbench for line-first exploration of Dante's *Commedia* and its commentary tradition. Antica Fiamma compiles span-addressed commentary records into line-keyed, provenance-preserving retrieval objects and serves them through a static browser runtime. The system mounts all 100 cantos as runtime assets, including 14,233 line profiles, 13,230 word profiles, line-to-record payloads, search shards, record stores, fulltext stores, and authority/work/character layers. From a selected line, readers can open commentary records whose spans reach that line, sort and compare witnesses, inspect preserved source wording, and follow word-locus or authority routes without losing the line as the accountable anchor. We evaluate the system through runtime coverage, live source-link checks against the Dartmouth Dante Project, automatic authority-consistency auditing, latency measurements, and a qualitative case study.

## 1 Introduction

Commentary traditions preserve how readers have explained, contested, and transmitted difficult texts. For Dante's *Commedia*, commentary records contain philological notes, theological and classical references, historical explanations, variant emphases, and many centuries of interpretive practice. Digital archives have made these materials searchable, but searchability alone does not solve the problem of line-level scholarly navigation.

The difficulty is a coordination problem. A reader who begins from a line needs to know which commentary records cover that line, what span each record claims, which witness and date the record belongs to, whether the record can be inspected in source wording, and how local references to words, authors, works, or characters can be followed. Existing archive search can retrieve relevant records, especially when the reader already knows a phrase or commentator. It does not necessarily preserve the line as the organizing unit across source records, derived metadata, and comparison views.

Antica Fiamma addresses this problem as a system demonstration. The workbench reorganizes a large Dante commentary corpus into a browser-based, line-first runtime. The system does not generate interpretations of Dante. Instead, it builds inspectable navigation layers over source records: span-to-line retrieval payloads, commentary cards, chronological comparison, lexical search shards, word-locus profiles, and authority/work/character navigation. Its contribution is a source-accountable system architecture for reading with a structured cultural archive, not a new language model or an automatic interpretation engine.

The live demo is available at `https://anticafiamma.it/`. The public artifact is maintained at `https://github.com/ruocisong/antica-fiamma-public`, with rights-safe code, schemas, derived metadata, documentation, screenshots, and an EMNLP 2026 artifact packet. The packet records the frozen internal runtime build commit used for evaluation. A 2.5-minute screencast is submitted as supplementary material.

This paper contributes:

- a public system demonstration for line-first reading of Dante's *Commedia* with its commentary tradition;
- a static architecture for compiling span-addressed commentary records, lexical indexes, word-locus profiles, and authority aliases into browser-side assets;
- an interface model that keeps selected line, record span, witness metadata, and source wording attached during navigation;
- an evaluation package that audits corpus coverage, line-record source links, authority consistency, runtime responsiveness, and a representative line-first case study.

## 2 Task Setting and Positioning

The system targets a reading task common in literary scholarship and computational humanities: starting from a passage, gather and compare the commentary evidence attached to it. The unit of interaction is therefore not a document, a paragraph, or a free-text query. It is a canto-line coordinate such as *Inferno* 26.90 or *Purgatorio* 30.48.

This task has four constraints. First, line spans matter. A commentary record may cover lines 85-92 and remain relevant to line 90 even if it does not repeat that line verbatim. Second, provenance matters. The reader needs commentator, date, line span, source link, and source wording, not only a generated summary. Third, comparison matters. Dense lines often require early and modern witnesses side by side. Fourth, derived routes must remain accountable. A normalized mention of Virgil or the *Aeneid* is useful only if the raw commentary surface and record context remain inspectable.

The target users are Dante scholars, students, teachers, digital philologists, and NLP/DH researchers interested in source-grounded interfaces for cultural archives. For specialists, the system consolidates previously separate navigation steps for moving from a line to many commentary witnesses. For NLP and DH researchers, it offers a case study in building inspectable retrieval and navigation over a structured humanities corpus without replacing interpretation with generated answers.

Compared with existing Dante archives and reading interfaces, Antica Fiamma changes the primary interaction unit. The Dartmouth Dante Project provides indispensable searchable commentary records and stable source pages. Dante Lab supports customizable reading across poem, translation, commentary, and search views. Digital Dante provides a digital edition, commentary, and scholarly interpretation. Antica Fiamma does not replace these resources. It adds a line-first runtime layer: a selected poem line becomes the entry point for span-grounded record retrieval, comparison, word-locus navigation, and authority routes.

| Capability | Dartmouth Dante Project | Dante Lab / Digital Dante | Antica Fiamma |
|---|---|---|---|
| Primary entry unit | Query, commentator, record, or line fields | Reading pane, edition, commentary, and research view | Canto-line route as runtime key |
| Commentary retrieval | Searchable and linkable source records | Commentary displayed as reading support | Records loaded because spans reach the selected line |
| Comparison | Manual record inspection | Parallel reading and search affordances | Sort and pin witnesses around one line |
| Preserved wording | Available in source records | Available where included | Attached to cards and audit routes |
| Derived navigation | Search and archive metadata | Edition commentary and scholarly aids | Word-locus profiles plus author/work/character routes |

## 3 System Architecture

The pipeline has three stages: offline preprocessing, static asset packaging, and browser runtime interaction. Offline preprocessing converts source-aligned poem and commentary materials into normalized runtime objects. The build prepares poem line objects, line-span mappings, commentary record metadata, preserved fulltext payloads, search structures, word profiles, and authority sidecars. Its main computational operations are span-to-line payload compilation, record deduplication with source identity preservation, lexical indexing and sharding, word-profile construction, authority/work alias normalization, and provenance packaging that keeps raw surfaces attached to source records.

The central abstraction is that canto-line coordinates serve as a join key across layers. A selected line can retrieve poem text, coverage count, reaching record identifiers, commentary cards, fulltext expansions, word-locus panels, and authority mentions. This is what makes line-first reading possible without a live database query or an opaque runtime model call.

Static asset packaging splits the runtime into feature-scoped JSON files. The browser requests precomputed assets such as the global manifest, canto overview, line payload, record store, fulltext store, search index, and authority files. This reduces operational complexity and makes the demo reproducible, while shifting complexity into data preparation and schema control.

Browser runtime interaction renders the reading interface. The client loads the current canto and line payload, displays line-level coverage, opens commentary cards, supports sorting and pinning, expands preserved source wording, and follows derived routes. The runtime is interactive, but the evidence is not generated on demand. The browser assembles frozen artifacts.

![Figure 1: Overall architecture of Antica Fiamma.](figures/figure1_antica_fiamma_architecture.svg)

Figure 1: Antica Fiamma preprocesses source-aligned poem and commentary materials into line objects, span mappings, record stores, fulltext stores, search shards, word profiles, and authority sidecars. Static packaging serves these objects as feature-scoped runtime assets. The browser assembles them into line-first workflows while preserving source links and audit points.

## 4 Data Layers and Demo Workflows

The current public build mounts the complete poem rather than a small curated subset. Table 1 reports the frozen runtime counts generated from `demo/frontend/data` by the evaluation package.

| Measure | Count |
|---|---:|
| Mounted canto shells | 100 |
| Line profiles | 14,233 |
| Word profiles | 13,230 |
| Authority authors | 79 |
| Stable works | 131 |
| Characters | 17 |
| Indexed search lines | 14,233 |
| Commentary-source search pool | 14,306 |
| Unique indexed tokens | 119,579 |
| Runtime record-store entries, summed by canto | 548,698 |

Table 1: Runtime coverage in the frozen evaluation snapshot. The record-store entry count is summed by canto and should not be read as a deduplicated count of commentary documents.

The poem and line layer stores the *Commedia* as addressable canto-line objects. These support line selection, local context display, coverage counts, and stable URLs. The commentary layer stores records associated with canto-line spans. For each selected line, the line payload points to records whose spans reach that line. Per-canto record stores provide card metadata, and fulltext stores provide preserved wording for expansion and audit. The search and word-locus layers provide alternate entry points, while the authority layer normalizes selected commentary surfaces into authors, works, and characters. Record-local evidence remains the unit of accountability.

The live demo foregrounds three workflows:

- Route A: *Inferno* 1.1, `/inferno/1/1#records-section`. This route has 121 attached records and demonstrates basic line-first commentary access.
- Route B: *Inferno* 26.90, `/inferno/26/90#records-section`. This route has 273 attached records and demonstrates dense diachronic comparison around the Ulysses episode.
- Route C: *Purgatorio* 30.48, `/purgatorio/30/48#records-section`. This route has 196 attached records and demonstrates the authority route from Dante's line "conosco i segni de l'antica fiamma" to record-local evidence for Virgil's *Aeneid*.

![Figure 2: Line-first commentary workflow in Antica Fiamma.](figures/figure2_antica_fiamma_line_first_cards.png)

Figure 2: Route A opens *Inferno* 1.1, displays the selected poem line and record count, and surfaces span-grounded commentary cards. Each card keeps witness, date, span, preview text, and comparison action attached to the selected line.

## 5 Evaluation

We evaluate Antica Fiamma as a source-accountable system artifact. We do not claim a controlled user study. Instead, the evaluation asks whether the mounted runtime has broad coverage, whether line-record mappings lead back to expected source records, whether authority routes retain enough record-local evidence to be inspectable, and whether the static assets supporting a demo route have measurable loading behavior.

| Claim checked | Evidence reported | Evaluation artifact |
|---|---|---|
| Complete mounted workbench, not a hand-built slice | Generated counts for canto shells, lines, search entries, authorities, works, and characters | `coverage_counts.md` |
| Line-first retrieval preserves source identity | 50 sampled line-record mappings checked against live Dartmouth Dante Project detail pages | `ddp_live_retrieval_audit.md` |
| Span-grounded mappings are inspectable | 50-row packet with selected line, record span, preview, source URL, and span-containment field | `retrieval_sanity_50.csv` |
| Authority routes are auditable | 100-row consistency packet with raw surface, normalized label, registry evidence, context, and caveated queue | `authority_consistency_100.csv` |
| Live artifact supports interactive review | Static asset timing for the Route A asset set | `latency_report.md` |
| The interface changes the reading route while preserving evidence | Qualitative walkthrough comparing search-first archive use with the line-first path | `case_study.md` |

Table 2: Evaluation contract. The audits separate runtime counts, external source-link checks, automatic consistency packets, latency measurements, and qualitative workflow evidence.

Coverage. The coverage audit freezes the runtime manifest and derived JSON assets. The current build includes all 100 cantos, 14,233 line profiles, 13,230 word profiles, 79 authority authors, 131 stable works, and 17 characters. The search layer includes 14,233 indexed lines, a 14,306-entry commentary-source pool, and 119,579 unique indexed tokens. These counts show that the demo routes are entry points into a complete mounted poem and commentary runtime. They support the infrastructure claim, not a claim about interpretive completeness.

Line-record source-link audit. The central line-first claim depends on record accountability. We sampled 50 line-to-record mappings from runtime line payloads and verified each against the live Dartmouth Dante Project detail page associated with the stored source link. All 50 pages were fetched successfully, and all 50 matched the expected commentary identity and canto-line header. This supports the claim that the sampled line-first routes preserve source identity. It is not a recall estimate over all possible commentary evidence.

Authority consistency audit. Authority navigation introduces a different risk: a normalized author or work label may be attached to an ambiguous surface. We therefore audit a sampled pool of record-local author/work mentions using automatic consistency checks. The packet checks whether each raw surface appears in preserved fulltext, whether registry aliases support the normalized mapping, and whether work bucket/status metadata is strong enough for automatic acceptance.

The automatic audit is not a precision estimate and not a recall estimate. It is a reproducible consistency audit over sampled runtime mentions. In the current fresh packet, 98 of 100 sampled raw surfaces are found directly in preserved fulltext; 92 pass all automatic consistency predicates, and 8 are routed to a caveated queue. The final deploy gate also confirms that 100/100 record-local authority sidecars are fresh against the current extractor, policy, lexicon, store, and fulltext hashes; 100/100 canto authority indexes pass consistency checks; author-level mounted work totals match sidecar-derived counts; and no zero-total locator-payload warnings remain. Ambiguous mappings are therefore exposed as inspectable extraction cases rather than hidden certainty.

Runtime responsiveness. The latency report measures the static assets needed by Route A, including the page shell, manifest, research layer, search index, canto overview, line payload, record store, fulltext store, authority layer, authority index, and authority highlight lexicon. The current report is an artifact-level static timing pass. We use it to identify payload bottlenecks and avoid claiming subjective responsiveness or user task speed.

Case study. The *Inferno* 1.1 case study compares a conventional search-first workflow with the line-first route. In a search-first workflow, a reader begins with a phrase such as "mezzo cammin" and then reconstructs line scope, temporal spread, and source context from individual results. In Antica Fiamma, the reader begins from the poem line. The interface displays commentary density, opens records whose spans reach the line, and supports sorting, comparison, word-locus movement, and authority navigation while preserving the selected line as the accountable anchor. The case study illustrates system behavior; it does not measure user preference or task speed.

## 6 Limitations, Rights, and Release

The system inherits limitations from source archive structure. If a source record has imperfect span metadata, the line-first route can inherit that imperfection. Authority extraction is conservative but imperfect, which is why raw surfaces, record context, and caveated queues remain visible.

The static architecture simplifies deployment and makes artifacts inspectable, but it can create large JSON payloads and requires rebuilds when schemas or data change. The workbench supports scholarly navigation, not automatic interpretation: it does not rank commentators by correctness, adjudicate sources, or produce final readings of Dante.

Rights, licensing, and release boundaries are central. Antica Fiamma is built around commentary records associated with the Dartmouth Dante Project and related source structures. The public demo preserves source links and source boundaries and does not promise unrestricted redistribution of full commentary payloads where rights do not permit it. Code, derived metadata, documentation, screenshots, and rights-safe samples are released through the public repository; source-derived commentary payloads are documented according to their source reuse conditions.

## 7 Conclusion

Antica Fiamma demonstrates how a large Dante commentary archive can be repackaged as a line-first, source-accountable web workbench. Its contribution is an end-to-end system architecture: offline preprocessing, static runtime assets, browser-side interaction, and audit protocols aligned around canto-line evidence. The evaluation shows complete poem coverage, successful sampled source-link checks, an auditable authority layer, and a qualitative case study of line-first reading. The live demo gives reviewers stable routes through the system and shows how computational infrastructure can support close reading while preserving provenance.
