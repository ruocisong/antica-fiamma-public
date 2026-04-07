# Interface Layers

This note describes the public-facing reading surfaces of the DDP Commentary Workbench in the order a first-time visitor is most likely to encounter them.

## Main Entry

The Main Entry is the canto-level opening surface. It presents a line map rather than a global search box and asks the reader to enter the workbench through a specific line.

Its job is to answer a simple first question:

- where should I begin reading commentary for this canto?

## Analysis Layer / Line Snapshot

The Analysis Layer appears as soon as a line is selected.

The Line Snapshot is the first orientation layer between the chosen line and the deeper reading surfaces below it. It gives a compact sense of local density, pressure, representative terms, and immediate reading context before the reader begins moving through commentary cards in detail.

## Close Reading

Close Reading is the main commentary-card surface.

This is where record-level reading begins in earnest: chronology, ordering, range, source differences, and comparison all become materially useful here. The interface moves from orientation to actual commentary handling.

## Dante Word Locus Layer

The Dante Word Locus Layer opens when the reader follows a specific Dante word rather than a whole line. It treats line selection and word selection as different reading acts.

Its public panels include:

- **Occurrence Explorer**: where else the chosen word appears
- **Weighted Micro-Context Concurrence**: which nearby words tend to gather around it
- **Exact Local Phrase Expansions**: whether the word grows into a repeating local phrase
- **Contrastive Interpretive Vocabulary**: which interpretive vocabulary is unusually attached to that word in its local commentary environment

## Interpretive Fields

Interpretive Fields gather local semantic clustering around the selected line.

They are meant to show how commentary pressure organizes itself around a local passage rather than across the whole poem at once.

## Cross-Canto Echoes

Cross-Canto Echoes extend the selected line outward to other lines elsewhere in the *Commedia*.

The aim is not simply to find lexical repetition, but to surface passages that deserve to be read beside the current line as part of a broader interpretive pattern.

## Compare

Compare is the side-by-side reading surface.

It allows commentary records, traditions, or interpretive positions to be read against one another without losing the local line that originally opened the route.

## Authority

Authority is the author-, work-, and source-oriented navigation layer.

It keeps the commentary archive readable not only as a pile of records, but as a structured intellectual network of authors, works, and transmission paths.

## Suggested Reading Order

For a first walkthrough, the most natural order is:

- Main Entry
- Analysis Layer / Line Snapshot
- Close Reading
- Dante Word Locus Layer
- Interpretive Fields
- Cross-Canto Echoes
- Compare
- Authority

For a visual version of this sequence, see:

- [`/demo/frontend/reading-route.html`](../../demo/frontend/reading-route.html)
