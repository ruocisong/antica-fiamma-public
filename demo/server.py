#!/usr/bin/env python3
"""Serve the local digital humanities demo with Python's built-in HTTP server."""

from __future__ import annotations

import argparse
import csv
import gzip
import http.server
import io
import json
import socketserver
import subprocess
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse


SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR / "frontend"
MANIFEST = ROOT / "data" / "manifest.json"
SOURCE_DATA_DIR = SCRIPT_DIR.parent / "data"
ROW_CACHE: dict[str, list[dict]] = {}
COMPRESSIBLE_SUFFIXES = {
    ".css",
    ".html",
    ".js",
    ".json",
    ".map",
    ".md",
    ".svg",
    ".txt",
}


def is_canonical_workbench_route(path: str) -> bool:
    segments = [segment.strip().lower() for segment in str(path or "").split("/") if segment.strip()]
    if len(segments) not in {2, 3}:
        return False
    if segments[0] not in {"inferno", "purgatorio", "paradiso"}:
        return False
    try:
        canto_number = int(segments[1])
    except ValueError:
        return False
    if canto_number < 1:
        return False
    if len(segments) == 3:
        try:
            line_number = int(segments[2])
        except ValueError:
            return False
        if line_number < 1:
            return False
    return True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on")
    parser.add_argument(
        "--sample",
        default="inferno1",
        help="Sample to build if demo data is missing",
    )
    return parser.parse_args()


def ensure_demo_data(sample: str) -> None:
    if MANIFEST.exists():
        return

    subprocess.run(
        [sys.executable, str(SCRIPT_DIR / "build_demo_data.py"), "--sample", sample],
        check=True,
        cwd=SCRIPT_DIR.parent,
    )


class DemoHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:  # type: ignore[override]
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/record":
            self.handle_record_api(parsed.query)
            return
        super().do_GET()

    def do_HEAD(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/record":
            self.handle_record_api(parsed.query, head_only=True)
            return
        super().do_HEAD()

    def send_head(self):  # type: ignore[override]
        parsed = urlparse(self.path)
        path = Path(self.translate_path(parsed.path))
        if path.is_dir():
            for index_name in ("index.html", "index.htm"):
                candidate = path / index_name
                if candidate.exists():
                    path = candidate
                    break

        if (not path.exists() or not path.is_file()) and is_canonical_workbench_route(parsed.path):
            path = ROOT / "index.html"
        elif not path.exists() or not path.is_file():
            return super().send_head()

        if not self.client_accepts_gzip() or path.suffix.lower() not in COMPRESSIBLE_SUFFIXES:
            try:
                handle = path.open("rb")
            except OSError:
                self.send_error(404, "File not found")
                return None
            self.send_response(200)
            self.send_header("Content-Type", self.guess_type(str(path)))
            self.send_header("Content-Length", str(path.stat().st_size))
            self.send_header("Last-Modified", self.date_time_string(path.stat().st_mtime))
            self.end_headers()
            return handle

        try:
            raw_body = path.read_bytes()
        except OSError:
            self.send_error(404, "File not found")
            return None

        body = gzip.compress(raw_body, compresslevel=6)
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(str(path)))
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Vary", "Accept-Encoding")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Last-Modified", self.date_time_string(path.stat().st_mtime))
        self.end_headers()
        return io.BytesIO(body)

    def handle_record_api(self, query: str, head_only: bool = False) -> None:
        params = parse_qs(query)
        sample = (params.get("sample") or [""])[0].strip().lower()
        record_id = (params.get("id") or [""])[0].strip()

        if not sample or not record_id:
            self.send_json({"error": "Missing sample or id"}, status=400)
            return

        row_number = parse_record_row_number(sample, record_id)
        if row_number is None:
            self.send_json({"error": "Invalid record id"}, status=400)
            return

        rows = load_source_rows(sample)
        if row_number < 1 or row_number > len(rows):
            self.send_json({"error": "Record not found"}, status=404)
            return

        row = rows[row_number - 1]
        self.send_json(
            {
                "id": record_id,
                "sample": sample,
                "record_text": row.get("record_text", ""),
            },
            head_only=head_only,
        )

    def send_json(self, payload: dict, status: int = 200, head_only: bool = False) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        gzip_ok = self.client_accepts_gzip()
        if gzip_ok:
            body = gzip.compress(body, compresslevel=6)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        if gzip_ok:
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def client_accepts_gzip(self) -> bool:
        accepted = self.headers.get("Accept-Encoding", "")
        return "gzip" in accepted.lower()


def parse_record_row_number(sample: str, record_id: str) -> int | None:
    prefix = f"{sample}-r"
    if not record_id.startswith(prefix):
        return None
    try:
        return int(record_id[len(prefix) :])
    except ValueError:
        return None


def load_source_rows(sample: str) -> list[dict]:
    if sample in ROW_CACHE:
        return ROW_CACHE[sample]

    path = SOURCE_DATA_DIR / f"{sample}_records_text_full.csv"
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    ROW_CACHE[sample] = rows
    return rows


class ReusableTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


def main() -> None:
    args = parse_args()
    ensure_demo_data(args.sample)

    with ReusableTCPServer(("127.0.0.1", args.port), DemoHandler) as httpd:
        url = f"http://127.0.0.1:{args.port}"
        print(f"Serving demo at {url}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopping server.")


if __name__ == "__main__":
    main()
