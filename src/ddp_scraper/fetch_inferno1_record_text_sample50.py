from __future__ import annotations

import csv
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup


SEARCH_URL = "https://dante.dartmouth.edu/search_view.php"
INPUT_CSV_PATH = Path("data/inferno1_results_index_dedup.csv")
OUTPUT_CSV_PATH = Path("data/inferno1_records_text_sample50.csv")
FAILURES_CSV_PATH = Path("data/inferno1_records_text_sample50_failures.csv")

MAX_RECORDS = 50
REQUEST_DELAY_SECONDS = 0.5
MAX_ATTEMPTS = 3


def read_sample_rows(limit: int = MAX_RECORDS) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    with INPUT_CSV_PATH.open(newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            if row.get("result_url", "").strip():
                rows.append(row)
            if len(rows) >= limit:
                break

    return rows


def build_search_params(first_seen_line: str) -> dict[str, str]:
    return {
        "query": "",
        "language": "any",
        "cantica": "1",
        "canto": "1",
        "line": first_seen_line,
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


def extract_record_text(html: str) -> str:
    if "Your session has timed out." in html:
        raise RuntimeError("session_timed_out")

    soup = BeautifulSoup(html, "html.parser")
    commentary_block = soup.select_one("pre.commentarytercet")
    if commentary_block is None:
        commentary_block = soup.select_one("pre[class^='commentary']")
    if commentary_block is None:
        def has_commentary_class(classes: object) -> bool:
            if not classes:
                return False
            if isinstance(classes, str):
                candidates = [classes]
            else:
                candidates = list(classes)
            return any("commentary" in class_name for class_name in candidates)

        commentary_block = soup.find(
            "pre",
            class_=has_commentary_class,
        )
    if commentary_block is None:
        raise RuntimeError("malformed_page_missing_commentary_block")

    text = commentary_block.get_text("\n", strip=True)
    if not text:
        raise RuntimeError("empty_commentary_text")
    return text


def fetch_one_record(session: requests.Session, row: dict[str, str]) -> tuple[str, int]:
    last_error: Exception | None = None

    for _attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            rate_limited_get(
                session,
                SEARCH_URL,
                params=build_search_params(row["first_seen_line"]),
            )
            detail_response = rate_limited_get(session, row["result_url"])
            text = extract_record_text(detail_response.text)
            return text, len(text)
        except (requests.RequestException, RuntimeError) as exc:
            last_error = exc

    if last_error is None:
        raise RuntimeError("unknown_fetch_failure")
    raise last_error


def write_output_csv(rows: list[dict[str, str]]) -> None:
    OUTPUT_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_CSV_PATH.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(
            csv_file,
            fieldnames=[
                "result_url",
                "commentary_name",
                "cantica",
                "canto",
                "line_info",
                "record_text",
                "extracted_text_length",
                "fetch_status",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


def write_failures_csv(rows: list[dict[str, str]]) -> None:
    FAILURES_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with FAILURES_CSV_PATH.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(
            csv_file,
            fieldnames=[
                "result_url",
                "commentary_name",
                "cantica",
                "canto",
                "line_info",
                "first_seen_line",
                "fetch_status",
                "error_message",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    try:
        sample_rows = read_sample_rows()
        session = requests.Session()
        output_rows: list[dict[str, str]] = []
        failure_rows: list[dict[str, str]] = []
        success_lengths: list[int] = []

        for row in sample_rows:
            try:
                text, extracted_text_length = fetch_one_record(session, row)
                output_rows.append(
                    {
                        "result_url": row["result_url"],
                        "commentary_name": row["commentary_name"],
                        "cantica": row["cantica"],
                        "canto": row["canto"],
                        "line_info": row["line_info"],
                        "record_text": text,
                        "extracted_text_length": extracted_text_length,
                        "fetch_status": "success",
                    }
                )
                success_lengths.append(extracted_text_length)
            except Exception as exc:
                output_rows.append(
                    {
                        "result_url": row["result_url"],
                        "commentary_name": row["commentary_name"],
                        "cantica": row["cantica"],
                        "canto": row["canto"],
                        "line_info": row["line_info"],
                        "record_text": "",
                        "extracted_text_length": 0,
                        "fetch_status": "failed",
                    }
                )
                failure_rows.append(
                    {
                        "result_url": row["result_url"],
                        "commentary_name": row["commentary_name"],
                        "cantica": row["cantica"],
                        "canto": row["canto"],
                        "line_info": row["line_info"],
                        "first_seen_line": row["first_seen_line"],
                        "fetch_status": "failed",
                        "error_message": str(exc),
                    }
                )

        write_output_csv(output_rows)
        write_failures_csv(failure_rows)

        attempted = len(sample_rows)
        succeeded = len(success_lengths)
        failed = len(failure_rows)
        average_length = sum(success_lengths) / succeeded if succeeded else 0.0

        print(
            "success: "
            f"attempted={attempted} "
            f"succeeded={succeeded} "
            f"failed={failed} "
            f"average_extracted_text_length={average_length:.2f}"
        )
    except Exception as exc:  # pragma: no cover - terminal summary path
        print(f"failure: {exc}")
        raise


if __name__ == "__main__":
    main()
