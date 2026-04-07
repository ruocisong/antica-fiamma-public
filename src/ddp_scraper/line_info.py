from __future__ import annotations

import csv
import re
from collections import Counter
from pathlib import Path


LINE_INFO_ENRICHMENT_COLUMNS = [
    "line_start",
    "line_end",
    "line_span",
    "line_info_pattern",
    "line_info_parse_status",
]

SINGLE_LINE_RE = re.compile(r"^\s*(\d+)\s*$")
SIMPLE_RANGE_RE = re.compile(r"^\s*(\d+)\s*-\s*(\d+)\s*$")


def classify_line_info_pattern(line_info: str) -> str:
    value = (line_info or "").strip()
    if not value:
        return "empty"
    if SINGLE_LINE_RE.fullmatch(value):
        return "single_line"
    if SIMPLE_RANGE_RE.fullmatch(value):
        return "simple_range"
    return "complex_unparsed"


def parse_line_info(line_info: str) -> dict[str, str]:
    value = (line_info or "").strip()
    pattern = classify_line_info_pattern(value)

    if pattern == "single_line":
        line_number = int(SINGLE_LINE_RE.fullmatch(value).group(1))
        return {
            "line_start": str(line_number),
            "line_end": str(line_number),
            "line_span": "1",
            "line_info_pattern": pattern,
            "line_info_parse_status": "parsed",
        }

    if pattern == "simple_range":
        match = SIMPLE_RANGE_RE.fullmatch(value)
        line_start = int(match.group(1))
        line_end = int(match.group(2))
        if line_end < line_start:
            return {
                "line_start": "",
                "line_end": "",
                "line_span": "",
                "line_info_pattern": "descending_range_unparsed",
                "line_info_parse_status": "unparsed",
            }
        return {
            "line_start": str(line_start),
            "line_end": str(line_end),
            "line_span": str(line_end - line_start + 1),
            "line_info_pattern": pattern,
            "line_info_parse_status": "parsed",
        }

    return {
        "line_start": "",
        "line_end": "",
        "line_span": "",
        "line_info_pattern": pattern,
        "line_info_parse_status": "unparsed",
    }


def build_enriched_fieldnames(fieldnames: list[str]) -> list[str]:
    ordered = [field for field in fieldnames if field not in LINE_INFO_ENRICHMENT_COLUMNS]
    return ordered + LINE_INFO_ENRICHMENT_COLUMNS


def enrich_rows(rows: list[dict[str, str]]) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    pattern_counts: Counter[str] = Counter()
    parsed_counts: Counter[str] = Counter()
    examples: dict[str, str] = {}
    enriched_rows: list[dict[str, str]] = []

    for row in rows:
        enrichment = parse_line_info(row.get("line_info", ""))
        pattern = enrichment["line_info_pattern"]
        pattern_counts[pattern] += 1
        if enrichment["line_info_parse_status"] == "parsed":
            parsed_counts[pattern] += 1
        examples.setdefault(pattern, row.get("line_info", ""))
        enriched_rows.append({**row, **enrichment})

    summary_rows: list[dict[str, str]] = []
    for pattern in sorted(pattern_counts):
        record_count = pattern_counts[pattern]
        parsed_count = parsed_counts.get(pattern, 0)
        summary_rows.append(
            {
                "line_info_pattern": pattern,
                "example_line_info": examples.get(pattern, ""),
                "record_count": str(record_count),
                "parsed_count": str(parsed_count),
                "unparsed_count": str(record_count - parsed_count),
            }
        )

    return enriched_rows, summary_rows


def read_csv_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        return list(reader.fieldnames or []), list(reader)


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fieldnames})

