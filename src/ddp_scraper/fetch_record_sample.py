from __future__ import annotations

import csv
from pathlib import Path

import requests
from bs4 import BeautifulSoup


SEARCH_URL = "https://dante.dartmouth.edu/search_view.php"
RESULTS_INDEX_PATH = Path("data/results_index_inferno1_line1.csv")
RAW_HTML_PATH = Path("data/record_detail_sample.html")
TEXT_PATH = Path("data/record_sample.txt")
METADATA_PATH = Path("data/record_sample_metadata.csv")

TEST_CASE_PARAMS = {
    "query": "",
    "language": "any",
    "cantica": "1",
    "canto": "1",
    "line": "1",
    "commentary[]": "0",
    "cmd": "Search",
}


def read_first_result_row() -> dict[str, str]:
    with RESULTS_INDEX_PATH.open(newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            if row.get("result_url", "").strip():
                return row

    raise RuntimeError("No non-empty result_url found in data/results_index_inferno1_line1.csv.")


def fetch_detail_html(result_url: str) -> str:
    session = requests.Session()
    search_response = session.get(SEARCH_URL, params=TEST_CASE_PARAMS, timeout=30)
    search_response.raise_for_status()

    detail_response = session.get(result_url, timeout=30)
    detail_response.raise_for_status()
    return detail_response.text


def extract_record_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    commentary_block = soup.select_one("pre.commentarytercet")
    if commentary_block is None:
        commentary_block = soup.select_one("pre[class^='commentary']")
    if commentary_block is None:
        raise RuntimeError("Could not find the sample commentary text block in the detail page.")

    text = commentary_block.get_text("\n", strip=True)
    if not text:
        raise RuntimeError("The sample commentary text block was found, but it was empty.")
    return text


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def write_metadata(row: dict[str, str], extracted_text_length: int) -> None:
    METADATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    with METADATA_PATH.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(
            csv_file,
            fieldnames=[
                "result_url",
                "commentary_name",
                "cantica",
                "canto",
                "line_info",
                "extracted_text_length",
            ],
        )
        writer.writeheader()
        writer.writerow(
            {
                "result_url": row["result_url"],
                "commentary_name": row["commentary_name"],
                "cantica": row["cantica"],
                "canto": row["canto"],
                "line_info": row["line_info"],
                "extracted_text_length": extracted_text_length,
            }
        )


def main() -> None:
    try:
        row = read_first_result_row()
        html = fetch_detail_html(row["result_url"])
        text = extract_record_text(html)

        write_text(RAW_HTML_PATH, html)
        write_text(TEXT_PATH, text)
        write_metadata(row, len(text))

        print(f"success: extracted text length {len(text)}")
    except Exception as exc:  # pragma: no cover - terminal summary path
        print(f"failure: {exc}")
        raise


if __name__ == "__main__":
    main()
