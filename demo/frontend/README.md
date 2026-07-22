# Public Frontend Shell

This directory contains the public static shell for **Antica Fiamma**.

Live entrances:

- [anticafiamma.it](https://anticafiamma.it)
- [anticafiamma.it](https://anticafiamma.it)

## Root Pages

- `index.html`: main Antica Fiamma entrypoint.
- `about.html`: project framing, source map, data statement, rights posture, and colophon.
- `guide.html`: reader-facing guide for moving through the interface.
- `reading-route.html`: visual interface tour.
- `authority.html`: public authority-layer page.
- `research/fiamma.html`: public research room for Dante's fire vocabulary and motif.

## Static Assets

- `static/styles.css`: shared public shell styling.
- `static/app.js`: main browser entrypoint for the current shell.
- `static/modules/`: split frontend logic and runtime contract scaffolding.
- `static/assets/`: public visual assets.
- `static/research/`: static assets and small tabular files for public research rooms.
- `static/route-tour/`: screenshots and panels used by the interface tour.

## Generated Authority Pages

- `autore/`: generated author and work rooms.
- `personaggio/`: generated personaggio rooms.

These directories are part of the public interface. They are generated, but they are not private scratch output.

## Not Included Here

The public repository intentionally does not version:

- `data/`
- `reports/`
- `data_snapshots/`
- `data_legacy_pre_page_state_v2/`

Those directories belong to the heavier runtime or local build layer and are outside this public repository boundary.

## Local Preview

From the repository root:

```bash
python3 demo/server.py
```

Then open:

```text
http://127.0.0.1:8777/
```

The live site may include external runtime data not present in this public shell checkout.
