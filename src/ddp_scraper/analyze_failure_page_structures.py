from __future__ import annotations

import csv
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup, Tag


SEARCH_URL = "https://dante.dartmouth.edu/search_view.php"
FAILURES_CSV_PATH = Path("data/inferno1_records_text_sample50_failures.csv")
HTML_OUTPUT_DIR = Path("data/failure_html_samples")
REPORT_CSV_PATH = Path("data/failure_page_structure_report.csv")

MAX_PAGES = 10
REQUEST_DELAY_SECONDS = 0.5
MAX_ATTEMPTS = 3


def read_failure_rows(limit: int = MAX_PAGES) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    with FAILURES_CSV_PATH.open(newline="", encoding="utf-8") as csv_file:
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


def fetch_failure_html(session: requests.Session, row: dict[str, str]) -> str:
    last_error: Exception | None = None

    for _attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            rate_limited_get(session, SEARCH_URL, params=build_search_params(row["first_seen_line"]))
            detail_response = rate_limited_get(session, row["result_url"])
            return detail_response.text
        except requests.RequestException as exc:
            last_error = exc

    if last_error is None:
        raise RuntimeError("unknown_fetch_failure")
    raise last_error


def has_commentary_class(classes: object) -> bool:
    if not classes:
        return False
    if isinstance(classes, str):
        candidates = [classes]
    else:
        candidates = list(classes)
    return any("commentary" in class_name.lower() for class_name in candidates)


def selector_for_tag(tag: Tag) -> str:
    classes = tag.get("class", [])
    if isinstance(classes, str):
        classes = [classes]
    if classes:
        return f"{tag.name}." + ".".join(classes)
    return tag.name


def first_text_snippet(tag: Tag | None, limit: int = 80) -> str:
    if tag is None:
        return ""
    text = " ".join(tag.get_text(" ", strip=True).split())
    return text[:limit]


def classify_html(html: str) -> dict[str, str]:
    soup = BeautifulSoup(html, "html.parser")

    pre_commentarytercet = soup.select_one("pre.commentarytercet")
    pre_commentary = soup.select_one("pre[class^='commentary']") or soup.find("pre", class_=has_commentary_class)
    p_commentary = soup.select_one("p.commentarytext") or soup.find("p", class_=has_commentary_class)
    div_commentary = soup.select_one("div[class*='commentary']") or soup.find("div", class_=has_commentary_class)
    td_commentary = soup.select_one("td[class*='commentary']") or soup.find("td", class_=has_commentary_class)
    plain_pre = soup.find("pre")

    candidate_tags: list[Tag] = []
    for candidate in [pre_commentarytercet, pre_commentary, p_commentary, div_commentary, td_commentary, plain_pre]:
        if candidate is not None and candidate not in candidate_tags:
            candidate_tags.append(candidate)

    candidate_selectors = "; ".join(selector_for_tag(tag) for tag in candidate_tags)
    notes_parts: list[str] = []

    if "Your session has timed out." in html:
        detected_main_container = "session_timeout_page"
        notes_parts.append("session timeout marker found")
    elif pre_commentarytercet is not None:
        detected_main_container = "pre.commentarytercet"
        notes_parts.append(f"snippet={first_text_snippet(pre_commentarytercet)}")
    elif pre_commentary is not None:
        detected_main_container = selector_for_tag(pre_commentary)
        notes_parts.append(f"snippet={first_text_snippet(pre_commentary)}")
    elif p_commentary is not None:
        detected_main_container = selector_for_tag(p_commentary)
        notes_parts.append(f"snippet={first_text_snippet(p_commentary)}")
    elif div_commentary is not None:
        detected_main_container = selector_for_tag(div_commentary)
        notes_parts.append(f"snippet={first_text_snippet(div_commentary)}")
    elif td_commentary is not None:
        detected_main_container = selector_for_tag(td_commentary)
        notes_parts.append(f"snippet={first_text_snippet(td_commentary)}")
    elif plain_pre is not None:
        detected_main_container = "plain_pre"
        notes_parts.append(f"snippet={first_text_snippet(plain_pre)}")
    else:
        detected_main_container = "unknown"
        main_content = soup.find("td", id="content")
        if main_content is not None:
            notes_parts.append(f"content_snippet={first_text_snippet(main_content)}")
        else:
            notes_parts.append("no obvious commentary container found")

    return {
        "detected_main_container": detected_main_container,
        "candidate_selectors": candidate_selectors,
        "contains_pre_commentarytercet": str(pre_commentarytercet is not None).lower(),
        "contains_pre_commentary": str(pre_commentary is not None).lower(),
        "contains_div_commentary": str(div_commentary is not None).lower(),
        "contains_td_commentary": str(td_commentary is not None).lower(),
        "contains_plain_pre": str(plain_pre is not None).lower(),
        "notes": " | ".join(notes_parts),
    }


def write_report(rows: list[dict[str, str]]) -> None:
    REPORT_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with REPORT_CSV_PATH.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(
            csv_file,
            fieldnames=[
                "result_url",
                "detected_main_container",
                "candidate_selectors",
                "contains_pre_commentarytercet",
                "contains_pre_commentary",
                "contains_div_commentary",
                "contains_td_commentary",
                "contains_plain_pre",
                "notes",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    try:
        failure_rows = read_failure_rows()
        session = requests.Session()
        HTML_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        report_rows: list[dict[str, str]] = []
        for index, row in enumerate(failure_rows, start=1):
            html = fetch_failure_html(session, row)
            html_path = HTML_OUTPUT_DIR / f"{index}.html"
            html_path.write_text(html, encoding="utf-8")

            classification = classify_html(html)
            report_rows.append({"result_url": row["result_url"], **classification})

        write_report(report_rows)

        distinct_structure_types = len({row["detected_main_container"] for row in report_rows})
        print(
            "success: "
            f"inspected_failed_pages={len(report_rows)} "
            f"distinct_structure_types={distinct_structure_types}"
        )
    except Exception as exc:  # pragma: no cover - terminal summary path
        print(f"failure: {exc}")
        raise


if __name__ == "__main__":
    main()
