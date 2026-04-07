from __future__ import annotations

import argparse
import csv
import re
import time
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup, Tag

from ddp_scraper.ddp_targets import (
    build_results_dedup_csv_path,
    build_results_raw_csv_path,
    resolve_line_range,
    resolve_output_prefix,
)


BASE_URL = "https://dante.dartmouth.edu/"
SEARCH_URL = urljoin(BASE_URL, "search_view.php")

CANTICA = "1"
CANTO = "1"
REQUEST_DELAY_SECONDS = 0.5

RESULT_REF_RE = re.compile(r"(?P<canto>\d+)\.(?P<line_info>.+)$")


def build_search_params(line_number: int, *, cantica: str, canto: str) -> dict[str, str]:
    return {
        "query": "",
        "language": "any",
        "cantica": cantica,
        "canto": canto,
        "line": str(line_number),
        "commentary[]": "0",
        "cmd": "Search",
    }


def rate_limited_get(
    session: requests.Session,
    url: str,
    *,
    params: dict[str, str] | None = None,
) -> requests.Response:
    time.sleep(REQUEST_DELAY_SECONDS)
    response = session.get(url, params=params, timeout=30)
    response.raise_for_status()
    return response


def parse_result_row(anchor: Tag) -> dict[str, str]:
    commentary_name_tag = anchor.find("strong")
    cantica_tags = anchor.find_all("i")
    if commentary_name_tag is None or not cantica_tags:
        raise RuntimeError("Unexpected result row format on the DDP results page.")

    commentary_name = commentary_name_tag.get_text(" ", strip=True)
    cantica = cantica_tags[-1].get_text(" ", strip=True)

    text = anchor.get_text(" ", strip=True)
    tail = text.rsplit(f"{cantica} ", 1)[-1]
    match = RESULT_REF_RE.search(tail)
    if match is None:
        raise RuntimeError(f"Could not parse canto/line reference from result text: {text}")

    href = anchor.get("href")
    if not href:
        raise RuntimeError("Encountered a result row without an href.")

    return {
        "commentary_name": commentary_name,
        "cantica": cantica,
        "canto": match.group("canto"),
        "line_info": match.group("line_info").strip(),
        "result_url": urljoin(BASE_URL, href),
    }


def parse_results_page(html: str) -> tuple[list[dict[str, str]], str | None]:
    soup = BeautifulSoup(html, "html.parser")
    rows = [parse_result_row(anchor) for anchor in soup.select("a.result")]

    next_link = soup.find("a", href=re.compile(r"cmd=nextpage"))
    next_href = next_link.get("href") if next_link else None
    return rows, next_href


def collect_line_results(
    session: requests.Session,
    line_number: int,
    *,
    cantica: str,
    canto: str,
) -> list[dict[str, str]]:
    response = rate_limited_get(
        session,
        SEARCH_URL,
        params=build_search_params(line_number, cantica=cantica, canto=canto),
    )
    all_rows: list[dict[str, str]] = []

    while True:
        page_rows, next_href = parse_results_page(response.text)
        for row in page_rows:
            all_rows.append({"searched_line": str(line_number), **row})

        if not next_href:
            break

        response = rate_limited_get(session, urljoin(BASE_URL, next_href))

    return all_rows


def write_raw_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(
            csv_file,
            fieldnames=[
                "searched_line",
                "commentary_name",
                "cantica",
                "canto",
                "line_info",
                "result_url",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


def deduplicate_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    deduped: list[dict[str, str]] = []
    seen_urls: set[str] = set()

    for row in rows:
        result_url = row["result_url"]
        if result_url in seen_urls:
            continue

        seen_urls.add(result_url)
        deduped.append(
            {
                "commentary_name": row["commentary_name"],
                "cantica": row["cantica"],
                "canto": row["canto"],
                "line_info": row["line_info"],
                "result_url": result_url,
                "first_seen_line": row["searched_line"],
            }
        )

    return deduped


def write_dedup_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(
            csv_file,
            fieldnames=[
                "commentary_name",
                "cantica",
                "canto",
                "line_info",
                "result_url",
                "first_seen_line",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Collect and deduplicate DDP search-result indexes for one canto."
    )
    parser.add_argument("--cantica", default=CANTICA, help="DDP cantica value. Default: 1")
    parser.add_argument("--canto", default=CANTO, help="DDP canto value. Default: 1")
    parser.add_argument(
        "--first-line",
        type=int,
        default=None,
        help="Override the first searched line number.",
    )
    parser.add_argument(
        "--last-line",
        type=int,
        default=None,
        help="Override the last searched line number.",
    )
    parser.add_argument(
        "--output-prefix",
        default=None,
        help=(
            "Reusable output filename prefix. "
            "Default: data/<cantica_slug><canto>, which remains data/inferno1 for the default run."
        ),
    )
    parser.add_argument(
        "--raw-csv-path",
        default=None,
        help="Optional explicit path for the raw per-line index CSV.",
    )
    parser.add_argument(
        "--dedup-csv-path",
        default=None,
        help="Optional explicit path for the deduplicated index CSV.",
    )
    return parser.parse_args()


def main() -> None:
    try:
        args = parse_args()
        output_prefix = resolve_output_prefix(
            cantica=args.cantica,
            canto=args.canto,
            output_prefix=args.output_prefix,
        )
        raw_csv_path = Path(args.raw_csv_path) if args.raw_csv_path else build_results_raw_csv_path(
            output_prefix
        )
        dedup_csv_path = (
            Path(args.dedup_csv_path)
            if args.dedup_csv_path
            else build_results_dedup_csv_path(output_prefix)
        )
        first_line, last_line = resolve_line_range(
            cantica=args.cantica,
            canto=args.canto,
            first_line=args.first_line,
            last_line=args.last_line,
        )
        session = requests.Session()
        raw_rows: list[dict[str, str]] = []

        for line_number in range(first_line, last_line + 1):
            raw_rows.extend(
                collect_line_results(
                    session,
                    line_number,
                    cantica=args.cantica,
                    canto=args.canto,
                )
            )

        deduped_rows = deduplicate_rows(raw_rows)
        write_raw_csv(raw_csv_path, raw_rows)
        write_dedup_csv(dedup_csv_path, deduped_rows)

        print(
            "success: "
            f"searched_lines={last_line - first_line + 1} "
            f"total_raw_hits={len(raw_rows)} "
            f"total_unique_result_urls={len(deduped_rows)}"
        )
    except Exception as exc:  # pragma: no cover - terminal summary path
        print(f"failure: {exc}")
        raise


if __name__ == "__main__":
    main()
