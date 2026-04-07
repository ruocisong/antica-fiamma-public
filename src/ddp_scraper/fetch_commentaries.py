from __future__ import annotations

import csv
import re
from pathlib import Path

import requests
from bs4 import BeautifulSoup


SEARCH_URL = "https://dante.dartmouth.edu/search.php"
OUTPUT_PATH = Path("data/commentaries.csv")


def normalize_label(text: str) -> str:
    collapsed = " ".join(text.split())
    return re.sub(r"\s+([,.;:?!])", r"\1", collapsed)


def fetch_search_page() -> str:
    response = requests.get(SEARCH_URL, timeout=30)
    response.raise_for_status()
    return response.text


def extract_commentary_options(html: str) -> list[tuple[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    select = soup.find("select", attrs={"name": "commentary[]"})
    if select is None:
        raise RuntimeError("Could not find the Commentary select box on the DDP search page.")

    rows: list[tuple[str, str]] = []
    for option in select.find_all("option"):
        value = (option.get("value") or "").strip()
        label = normalize_label(option.get_text(" ", strip=True))
        rows.append((value, label))

    return rows


def write_csv(rows: list[tuple[str, str]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["option_value", "option_label"])
        writer.writerows(rows)


def print_preview(rows: list[tuple[str, str]], limit: int = 10) -> None:
    print("option_value,option_label")
    for value, label in rows[:limit]:
        print(f"{value},{label}")


def main() -> None:
    html = fetch_search_page()
    rows = extract_commentary_options(html)
    write_csv(rows, OUTPUT_PATH)
    print_preview(rows)


if __name__ == "__main__":
    main()
