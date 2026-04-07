from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path

import requests

from ddp_scraper.ddp_detail import fetch_one_record


INPUT_CSV_PATH = Path("data/inferno1_results_index_dedup.csv")
OUTPUT_CSV_PATH = Path("data/inferno1_records_text_sample50_v2.csv")
FAILURES_CSV_PATH = Path("data/inferno1_records_text_sample50_v2_failures.csv")

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
                "extraction_template_used",
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
                "extraction_template_used",
                "error_message",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


def format_template_counts(rows: list[dict[str, str]]) -> str:
    counts = Counter(row["extraction_template_used"] for row in rows)
    ordered_items = sorted(counts.items())
    return ",".join(f"{template}:{count}" for template, count in ordered_items)


def main() -> None:
    try:
        sample_rows = read_sample_rows()
        session = requests.Session()
        output_rows: list[dict[str, str]] = []
        failure_rows: list[dict[str, str]] = []
        success_lengths: list[int] = []

        for row in sample_rows:
            try:
                text, extracted_text_length, template_used = fetch_one_record(
                    session,
                    row,
                    delay_seconds=REQUEST_DELAY_SECONDS,
                    max_attempts=MAX_ATTEMPTS,
                    search_already_replayed=False,
                )
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
                        "extraction_template_used": template_used,
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
                        "extraction_template_used": "none",
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
                        "extraction_template_used": "none",
                        "error_message": str(exc),
                    }
                )

        write_output_csv(output_rows)
        write_failures_csv(failure_rows)

        attempted = len(sample_rows)
        succeeded = len(success_lengths)
        failed = len(failure_rows)
        average_length = sum(success_lengths) / succeeded if succeeded else 0.0
        template_counts = format_template_counts(output_rows)

        print(
            "success: "
            f"attempted={attempted} "
            f"succeeded={succeeded} "
            f"failed={failed} "
            f"average_extracted_text_length={average_length:.2f} "
            f"template_counts={template_counts}"
        )
    except Exception as exc:  # pragma: no cover - terminal summary path
        print(f"failure: {exc}")
        raise


if __name__ == "__main__":
    main()
