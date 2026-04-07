from __future__ import annotations

import csv
import re
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup, Tag


BASE_URL = "https://dante.dartmouth.edu/"
SEARCH_URL = urljoin(BASE_URL, "search_view.php")
RAW_HTML_PATH = Path("data/test_result_inferno1_line1.html")
CSV_PATH = Path("data/results_index_inferno1_line1.csv")

TEST_CASE_PARAMS = {
    "query": "",
    "language": "any",
    "cantica": "1",
    "canto": "1",
    "line": "1",
    "commentary[]": "0",
    "cmd": "Search",
}

RESULT_REF_RE = re.compile(r"(?P<canto>\d+)\.(?P<line_info>.+)$")


def fetch_results_page() -> str:
    response = requests.get(SEARCH_URL, params=TEST_CASE_PARAMS, timeout=30)
    response.raise_for_status()
    return response.text


def save_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


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


def parse_results_index(html: str) -> tuple[list[dict[str, str]], bool]:
    soup = BeautifulSoup(html, "html.parser")
    anchors = soup.select("a.result")
    rows = [parse_result_row(anchor) for anchor in anchors]

    pagination_text = soup.get_text(" ", strip=True)
    has_pagination = "Result page:" in pagination_text
    return rows, has_pagination


def write_csv(rows: list[dict[str, str]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(
            csv_file,
            fieldnames=[
                "commentary_name",
                "cantica",
                "canto",
                "line_info",
                "result_url",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    try:
        html = fetch_results_page()
        save_text(RAW_HTML_PATH, html)
        rows, _has_pagination = parse_results_index(html)
        write_csv(rows, CSV_PATH)
        print(f"success: parsed {len(rows)} result rows")
    except Exception as exc:  # pragma: no cover - terminal summary path
        print(f"failure: {exc}")
        raise


if __name__ == "__main__":
    main()
