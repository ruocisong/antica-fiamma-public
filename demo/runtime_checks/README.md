# Runtime Checks

This directory contains smoke checks for the public Antica Fiamma shell.

These checks are release guards, not a complete test suite. They are meant to catch obvious breakage before a public shell update is pushed or deployed.

## Typical Coverage

- the main static shell loads
- key HTML pages exist
- core frontend assets are reachable
- authority pages and authority interactions have not lost their basic wiring
- line-entry and first-line behavior still work
- selected browser flows can be probed locally

## Running Locally

Start the local server from the repository root:

```bash
python3 demo/server.py
```

Then run the relevant Node-based check, for example:

```bash
node demo/runtime_checks/app_shell_smoke.mjs
```

Some checks expect a browser or a running local server. Read the individual script before using it as a release gate.

## Public Boundary

Only checks that help validate the public shell belong here. Temporary debug probes should be removed before commit.
