#!/usr/bin/env python3
"""Prepare a Pages-only release folder that excludes heavy runtime data."""

from __future__ import annotations

import shutil
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_ROOT = REPO_ROOT / "demo" / "frontend"
OUTPUT_ROOT = REPO_ROOT / "deployment_output" / "pages_shell_build"


def reset_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def copy_tree(src: Path, dst: Path) -> None:
    shutil.copytree(src, dst, dirs_exist_ok=True)


def main() -> None:
    reset_dir(OUTPUT_ROOT)

    root_files = [
        *sorted(path.name for path in FRONTEND_ROOT.glob("*.html")),
        "robots.txt",
        "sitemap.xml",
        "favicon.svg",
        "_redirects",
    ]

    for filename in root_files:
        source = FRONTEND_ROOT / filename
        if source.exists():
            shutil.copy2(source, OUTPUT_ROOT / filename)

    copy_tree(FRONTEND_ROOT / "static", OUTPUT_ROOT / "static")
    for dirname in ("autore", "personaggio", "research"):
        source = FRONTEND_ROOT / dirname
        if source.exists():
            copy_tree(source, OUTPUT_ROOT / dirname)

    print("Prepared Pages shell release folder:")
    print(f"- {OUTPUT_ROOT}")


if __name__ == "__main__":
    main()
