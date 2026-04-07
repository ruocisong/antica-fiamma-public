from __future__ import annotations

from pathlib import Path


CANTICA_SLUGS = {
    "0": "any",
    "1": "inferno",
    "2": "purgatorio",
    "3": "paradiso",
}

# Full canto line counts for Inferno, Purgatorio, and Paradiso. These counts
# are stable literary metadata and let runners avoid wasteful "empty tail"
# searches past the end of each canto.
#
# Source used during implementation:
# https://www.wisdomportal.com/Dante/Table5-CantoLengths.html
INFERNO_LINE_COUNTS = [
    136, 142, 136, 151, 142, 115, 130, 130, 133, 136, 115, 139, 151, 142,
    124, 136, 136, 136, 133, 130, 139, 151, 148, 151, 151, 142, 136, 142,
    139, 148, 145, 139, 157, 139,
]

PURGATORIO_LINE_COUNTS = [
    136, 133, 145, 139, 136, 151, 136, 139, 145, 139, 142, 136, 154, 151,
    145, 145, 139, 145, 145, 151, 136, 154, 133, 154, 139, 148, 142, 148,
    154, 145, 145, 160, 145,
]

PARADISO_LINE_COUNTS = [
    142, 148, 130, 142, 139, 142, 148, 148, 142, 148, 139, 145, 142, 139,
    148, 154, 142, 136, 148, 148, 142, 154, 139, 154, 139, 142, 148, 139,
    145, 148, 142, 151, 145,
]


def _build_default_line_ranges() -> dict[tuple[str, str], tuple[int, int]]:
    ranges: dict[tuple[str, str], tuple[int, int]] = {}
    for cantica, counts in (
        ("1", INFERNO_LINE_COUNTS),
        ("2", PURGATORIO_LINE_COUNTS),
        ("3", PARADISO_LINE_COUNTS),
    ):
        for canto_number, line_count in enumerate(counts, start=1):
            ranges[(cantica, str(canto_number))] = (1, line_count)
    return ranges


DEFAULT_LINE_RANGES = _build_default_line_ranges()


def build_canto_prefix(cantica: str, canto: str) -> str:
    slug = CANTICA_SLUGS.get(cantica, f"cantica{cantica}")
    return f"{slug}{canto}"


def resolve_output_prefix(
    *,
    cantica: str,
    canto: str,
    output_prefix: str | None,
) -> str:
    if output_prefix:
        return output_prefix
    return str(Path("data") / build_canto_prefix(cantica, canto))


def resolve_line_range(
    *,
    cantica: str,
    canto: str,
    first_line: int | None,
    last_line: int | None,
) -> tuple[int, int]:
    if (first_line is None) != (last_line is None):
        raise ValueError("`--first-line` and `--last-line` must be provided together.")

    if first_line is not None and last_line is not None:
        if first_line < 1 or last_line < 1:
            raise ValueError("Line numbers must be positive integers.")
        if first_line > last_line:
            raise ValueError("`--first-line` cannot be greater than `--last-line`.")
        return first_line, last_line

    default_range = DEFAULT_LINE_RANGES.get((cantica, canto))
    if default_range is None:
        raise ValueError(
            "No default line range is configured for this canto. "
            "Provide `--first-line` and `--last-line` explicitly."
        )
    return default_range


def build_results_raw_csv_path(output_prefix: str) -> Path:
    return Path(f"{output_prefix}_results_index_raw.csv")


def build_results_dedup_csv_path(output_prefix: str) -> Path:
    return Path(f"{output_prefix}_results_index_dedup.csv")


def build_full_text_output_csv_path(output_prefix: str) -> Path:
    return Path(f"{output_prefix}_records_text_full.csv")


def build_full_text_failures_csv_path(output_prefix: str) -> Path:
    return Path(f"{output_prefix}_records_text_full_failures.csv")
