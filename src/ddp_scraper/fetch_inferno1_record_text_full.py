from __future__ import annotations

import argparse
import csv
import time
from collections import Counter
from pathlib import Path

import requests

from ddp_scraper.ddp_detail import fetch_one_record, replay_search
from ddp_scraper.line_info import build_enriched_fieldnames, parse_line_info
from ddp_scraper.ddp_targets import (
    build_full_text_failures_csv_path,
    build_full_text_output_csv_path,
    build_results_dedup_csv_path,
    resolve_output_prefix,
)


CANTICA = "1"
CANTO = "1"
CANTICA_LABELS = {
    "0": "any",
    "1": "Inferno",
    "2": "Purgatorio",
    "3": "Paradiso",
}

REQUEST_DELAY_SECONDS = 0.3
MAX_ATTEMPTS = 3
CHECKPOINT_EVERY = 100
CHECKPOINT_INTERVAL_SECONDS = 300

BASE_OUTPUT_FIELDNAMES = [
    "result_url",
    "commentary_name",
    "cantica",
    "canto",
    "line_info",
    "first_seen_line",
    "record_text",
    "extracted_text_length",
    "fetch_status",
    "extraction_template_used",
]
OUTPUT_FIELDNAMES = build_enriched_fieldnames(BASE_OUTPUT_FIELDNAMES)

FAILURE_FIELDNAMES = [
    "result_url",
    "commentary_name",
    "cantica",
    "canto",
    "line_info",
    "first_seen_line",
    "fetch_status",
    "extraction_template_used",
    "error_message",
]

SANITY_CHECK_SAMPLE_ROWS = 10


def read_input_rows(input_csv_path: Path) -> list[dict[str, str]]:
    with input_csv_path.open(newline="", encoding="utf-8") as csv_file:
        return [row for row in csv.DictReader(csv_file) if row.get("result_url", "").strip()]


def validate_explicit_input_csv_target(
    input_csv_path: Path,
    *,
    expected_cantica: str,
    expected_canto: str,
    sample_rows: int = SANITY_CHECK_SAMPLE_ROWS,
) -> None:
    sampled_pairs: list[tuple[str, str]] = []
    expected_cantica_values = {
        expected_cantica,
        CANTICA_LABELS.get(expected_cantica, expected_cantica),
    }

    with input_csv_path.open(newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            if not row.get("result_url", "").strip():
                continue
            csv_cantica = row.get("cantica", "").strip()
            csv_canto = row.get("canto", "").strip()
            sampled_pairs.append((csv_cantica, csv_canto))
            if len(sampled_pairs) >= sample_rows:
                break

    if not sampled_pairs:
        return

    mismatched_pairs = [
        (csv_cantica, csv_canto)
        for csv_cantica, csv_canto in sampled_pairs
        if csv_cantica not in expected_cantica_values or csv_canto != expected_canto
    ]
    if not mismatched_pairs:
        return

    first_csv_cantica, first_csv_canto = mismatched_pairs[0]
    raise ValueError(
        "Input CSV target does not match CLI target: "
        f"CLI cantica/canto=({expected_cantica}, {expected_canto}), "
        f"expected CSV cantica values={sorted(expected_cantica_values)}, "
        f"CSV sample cantica/canto=({first_csv_cantica}, {first_csv_canto}) "
        f"from {input_csv_path}."
    )


def load_existing_output(output_csv_path: Path) -> dict[str, dict[str, str]]:
    if not output_csv_path.exists():
        return {}

    with output_csv_path.open(newline="", encoding="utf-8") as csv_file:
        records: dict[str, dict[str, str]] = {}
        for row in csv.DictReader(csv_file):
            result_url = row.get("result_url", "").strip()
            if not result_url:
                continue
            enrichment = parse_line_info(row.get("line_info", ""))
            for field, value in enrichment.items():
                if not row.get(field):
                    row[field] = value
            records[result_url] = row
        return records


def load_existing_failures(failures_csv_path: Path) -> dict[str, str]:
    if not failures_csv_path.exists():
        return {}

    with failures_csv_path.open(newline="", encoding="utf-8") as csv_file:
        return {
            row["result_url"]: row.get("error_message", "")
            for row in csv.DictReader(csv_file)
            if row.get("result_url", "").strip()
        }


def atomic_write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(path.suffix + ".tmp")
    with temp_path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        filtered_rows = [
            {fieldname: row.get(fieldname, "") for fieldname in fieldnames}
            for row in rows
        ]
        writer.writerows(filtered_rows)
    temp_path.replace(path)


def ordered_output_rows(
    input_rows: list[dict[str, str]],
    records_by_url: dict[str, dict[str, str]],
) -> list[dict[str, str]]:
    ordered: list[dict[str, str]] = []
    for row in input_rows:
        result_url = row["result_url"]
        if result_url in records_by_url:
            ordered.append(records_by_url[result_url])
    return ordered


def build_record_row(
    source_row: dict[str, str],
    *,
    record_text: str,
    extracted_text_length: str,
    fetch_status: str,
    extraction_template_used: str,
    error_message: str = "",
) -> dict[str, str]:
    record = {
        "result_url": source_row["result_url"],
        "commentary_name": source_row["commentary_name"],
        "cantica": source_row["cantica"],
        "canto": source_row["canto"],
        "line_info": source_row["line_info"],
        "first_seen_line": source_row["first_seen_line"],
        "record_text": record_text,
        "extracted_text_length": extracted_text_length,
        "fetch_status": fetch_status,
        "extraction_template_used": extraction_template_used,
    }
    record.update(parse_line_info(source_row["line_info"]))
    if error_message:
        record["error_message"] = error_message
    return record


def failure_rows(records_by_url: dict[str, dict[str, str]]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for row in records_by_url.values():
        if row.get("fetch_status") == "failed":
            rows.append(
                {
                    "result_url": row["result_url"],
                    "commentary_name": row["commentary_name"],
                    "cantica": row["cantica"],
                    "canto": row["canto"],
                    "line_info": row["line_info"],
                    "first_seen_line": row["first_seen_line"],
                    "fetch_status": "failed",
                    "extraction_template_used": row.get("extraction_template_used", "none"),
                    "error_message": row.get("error_message", ""),
                }
            )
    rows.sort(key=lambda row: (int(row["first_seen_line"]), row["result_url"]))
    return rows


def save_checkpoint(
    output_csv_path: Path,
    failures_csv_path: Path,
    input_rows: list[dict[str, str]],
    records_by_url: dict[str, dict[str, str]],
) -> None:
    atomic_write_csv(
        output_csv_path,
        OUTPUT_FIELDNAMES,
        ordered_output_rows(input_rows, records_by_url),
    )
    atomic_write_csv(
        failures_csv_path,
        FAILURE_FIELDNAMES,
        failure_rows(records_by_url),
    )


def format_template_counts(rows: list[dict[str, str]]) -> str:
    counts = Counter(row["extraction_template_used"] for row in rows)
    ordered_items = sorted(counts.items())
    return ",".join(f"{template}:{count}" for template, count in ordered_items)


def summarize_records(records: list[dict[str, str]]) -> tuple[int, int, int, float, str]:
    attempted = len(records)
    succeeded = sum(row["fetch_status"] == "success" for row in records)
    failed = sum(row["fetch_status"] == "failed" for row in records)
    success_lengths = [
        int(row["extracted_text_length"])
        for row in records
        if row["fetch_status"] == "success"
    ]
    average_length = sum(success_lengths) / succeeded if succeeded else 0.0
    template_counts = format_template_counts(records)
    return attempted, succeeded, failed, average_length, template_counts


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch commentary texts for one deduplicated DDP canto index."
    )
    parser.add_argument("--cantica", default=CANTICA, help="DDP cantica value. Default: 1")
    parser.add_argument("--canto", default=CANTO, help="DDP canto value. Default: 1")
    parser.add_argument(
        "--output-prefix",
        default=None,
        help=(
            "Reusable output filename prefix. "
            "Default: data/<cantica_slug><canto>, which remains data/inferno1 for the default run."
        ),
    )
    parser.add_argument(
        "--input-csv-path",
        default=None,
        help="Optional explicit path for the deduplicated results index CSV.",
    )
    parser.add_argument(
        "--output-csv-path",
        default=None,
        help="Optional explicit path for the full text output CSV.",
    )
    parser.add_argument(
        "--failures-csv-path",
        default=None,
        help="Optional explicit path for the full text failures CSV.",
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
        input_csv_path = (
            Path(args.input_csv_path)
            if args.input_csv_path
            else build_results_dedup_csv_path(output_prefix)
        )
        output_csv_path = (
            Path(args.output_csv_path)
            if args.output_csv_path
            else build_full_text_output_csv_path(output_prefix)
        )
        failures_csv_path = (
            Path(args.failures_csv_path)
            if args.failures_csv_path
            else build_full_text_failures_csv_path(output_prefix)
        )
        if args.input_csv_path:
            validate_explicit_input_csv_target(
                input_csv_path,
                expected_cantica=args.cantica,
                expected_canto=args.canto,
            )

        input_rows = read_input_rows(input_csv_path)
        records_by_url = load_existing_output(output_csv_path)
        existing_failure_messages = load_existing_failures(failures_csv_path)
        for result_url, error_message in existing_failure_messages.items():
            if result_url in records_by_url and records_by_url[result_url].get("fetch_status") == "failed":
                records_by_url[result_url]["error_message"] = error_message
        session = requests.Session()

        existing_successes = sum(
            row.get("fetch_status") == "success" for row in records_by_url.values()
        )
        existing_failures = sum(
            row.get("fetch_status") == "failed" for row in records_by_url.values()
        )
        print(
            "resume: "
            f"loaded_successes={existing_successes} "
            f"loaded_failures={existing_failures} "
            f"total_targets={len(input_rows)}",
            flush=True,
        )

        processed_since_checkpoint = 0
        last_checkpoint_time = time.time()
        current_line: str | None = None

        for row in input_rows:
            result_url = row["result_url"]
            existing_row = records_by_url.get(result_url)
            if existing_row is not None and existing_row.get("fetch_status") == "success":
                continue

            if current_line != row["first_seen_line"]:
                replay_search(
                    session,
                    row["first_seen_line"],
                    delay_seconds=REQUEST_DELAY_SECONDS,
                    cantica=args.cantica,
                    canto=args.canto,
                )
                current_line = row["first_seen_line"]

            try:
                text, extracted_text_length, template_used = fetch_one_record(
                    session,
                    row,
                    delay_seconds=REQUEST_DELAY_SECONDS,
                    max_attempts=MAX_ATTEMPTS,
                    search_already_replayed=True,
                    cantica=args.cantica,
                    canto=args.canto,
                )
                records_by_url[result_url] = build_record_row(
                    row,
                    record_text=text,
                    extracted_text_length=str(extracted_text_length),
                    fetch_status="success",
                    extraction_template_used=template_used,
                )
            except Exception as exc:
                records_by_url[result_url] = build_record_row(
                    row,
                    record_text="",
                    extracted_text_length="0",
                    fetch_status="failed",
                    extraction_template_used="none",
                    error_message=str(exc),
                )

            processed_since_checkpoint += 1
            now = time.time()
            if (
                processed_since_checkpoint >= CHECKPOINT_EVERY
                or now - last_checkpoint_time >= CHECKPOINT_INTERVAL_SECONDS
            ):
                save_checkpoint(output_csv_path, failures_csv_path, input_rows, records_by_url)
                attempted_rows = ordered_output_rows(input_rows, records_by_url)
                attempted, succeeded, failed, average_length, _template_counts = summarize_records(
                    attempted_rows
                )
                print(
                    "checkpoint: "
                    f"attempted={attempted} "
                    f"succeeded={succeeded} "
                    f"failed={failed} "
                    f"average_extracted_text_length={average_length:.2f}",
                    flush=True,
                )
                processed_since_checkpoint = 0
                last_checkpoint_time = now

        save_checkpoint(output_csv_path, failures_csv_path, input_rows, records_by_url)
        final_rows = ordered_output_rows(input_rows, records_by_url)
        attempted, succeeded, failed, average_length, template_counts = summarize_records(final_rows)
        print(
            "success: "
            f"attempted={attempted} "
            f"succeeded={succeeded} "
            f"failed={failed} "
            f"average_extracted_text_length={average_length:.2f} "
            f"template_counts={template_counts}",
            flush=True,
        )
    except Exception as exc:  # pragma: no cover - terminal summary path
        print(f"failure: {exc}", flush=True)
        raise


if __name__ == "__main__":
    main()
