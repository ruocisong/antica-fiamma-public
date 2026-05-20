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

The GitHub Actions workflow at:

```text
.github/workflows/deploy-pages-shell.yml
```

runs the packaging script and deploys the generated shell to Cloudflare Pages.

The public domains currently presented in documentation are:

- [anticafiamma.it](https://anticafiamma.it)
- [ddpcommentary.com](https://ddpcommentary.com)
