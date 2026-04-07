from __future__ import annotations

import time

import requests
from bs4 import BeautifulSoup, Tag


SEARCH_URL = "https://dante.dartmouth.edu/search_view.php"


def build_search_params(
    first_seen_line: str,
    *,
    cantica: str = "1",
    canto: str = "1",
) -> dict[str, str]:
    return {
        "query": "",
        "language": "any",
        "cantica": cantica,
        "canto": canto,
        "line": first_seen_line,
        "commentary[]": "0",
        "cmd": "Search",
    }


def rate_limited_get(
    session: requests.Session,
    url: str,
    *,
    delay_seconds: float,
    params: dict[str, str] | None = None,
) -> requests.Response:
    time.sleep(delay_seconds)
    response = session.get(url, params=params, timeout=30)
    response.raise_for_status()
    return response


def replay_search(
    session: requests.Session,
    first_seen_line: str,
    *,
    delay_seconds: float,
    cantica: str = "1",
    canto: str = "1",
) -> None:
    rate_limited_get(
        session,
        SEARCH_URL,
        params=build_search_params(first_seen_line, cantica=cantica, canto=canto),
        delay_seconds=delay_seconds,
    )


def normalize_block_text(tag: Tag) -> str:
    return tag.get_text(" ", strip=True)


def extract_record_text(html: str) -> tuple[str, str]:
    if "Your session has timed out." in html:
        raise RuntimeError("session_timed_out")

    soup = BeautifulSoup(html, "html.parser")

    commentary_pre = soup.select_one("pre.commentarytercet")
    if commentary_pre is not None:
        text = commentary_pre.get_text("\n", strip=True)
        if not text:
            raise RuntimeError("empty_commentary_text")
        return text, "pre.commentarytercet"

    main_content = soup.find("td", id="content") or soup
    commentary_paragraphs = main_content.select("p.commentarytext")
    if commentary_paragraphs:
        paragraphs = [normalize_block_text(tag) for tag in commentary_paragraphs]
        paragraphs = [paragraph for paragraph in paragraphs if paragraph]
        if not paragraphs:
            raise RuntimeError("empty_commentary_text")
        return "\n".join(paragraphs), "p.commentarytext"

    raise RuntimeError("malformed_page_missing_supported_commentary_block")


def fetch_one_record(
    session: requests.Session,
    row: dict[str, str],
    *,
    delay_seconds: float,
    max_attempts: int,
    search_already_replayed: bool,
    cantica: str = "1",
    canto: str = "1",
) -> tuple[str, int, str]:
    last_error: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            if attempt > 1 or not search_already_replayed:
                replay_search(
                    session,
                    row["first_seen_line"],
                    delay_seconds=delay_seconds,
                    cantica=cantica,
                    canto=canto,
                )
            detail_response = rate_limited_get(
                session,
                row["result_url"],
                delay_seconds=delay_seconds,
            )
            text, template_used = extract_record_text(detail_response.text)
            return text, len(text), template_used
        except (requests.RequestException, RuntimeError) as exc:
            last_error = exc

    if last_error is None:
        raise RuntimeError("unknown_fetch_failure")
    raise last_error
