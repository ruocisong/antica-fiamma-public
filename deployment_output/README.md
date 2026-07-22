# Deployment Output

This directory contains the public shell packaging script for Cloudflare Pages.

## Source File

- [`PREPARE_PAGES_SHELL.py`](./PREPARE_PAGES_SHELL.py)

The script prepares a Pages-ready static folder from `demo/frontend`.

## Generated Output

The script writes:

```text
deployment_output/pages_shell_build/
```

That folder is generated build output and should not be committed. It is ignored by Git.

## Deployment Shape

This public repository retains the packaging script so the static build method is inspectable. Production deployment is operated from the project's separate private repository. Nothing in this public repository automatically deploys the live site.

The canonical public domain is:

- [anticafiamma.it](https://anticafiamma.it)
