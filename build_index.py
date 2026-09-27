#!/usr/bin/env python3
"""Generate Mangayomi repository metadata for the Mkissa anime source."""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPOSITORY = "mangayomi-mkissa-anime"
SOURCE_ID = 2026092701
VERSION = "0.0.4"


def main() -> None:
    if len(sys.argv) != 2 or not re.fullmatch(
        r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?", sys.argv[1]
    ):
        raise SystemExit("Usage: python3 build_index.py YOUR_GITHUB_USERNAME")

    owner = sys.argv[1]
    repository_url = f"https://github.com/{owner}/{REPOSITORY}"
    raw = f"https://raw.githubusercontent.com/{owner}/{REPOSITORY}/main"
    source = {
        "name": "Mkissa",
        "id": SOURCE_ID,
        "baseUrl": "https://mkissa.to",
        "lang": "en",
        "typeSource": "single",
        "iconUrl": "https://mkissa.to/favicon.ico",
        "dateFormat": "",
        "dateFormatLocale": "",
        "isNsfw": False,
        "hasCloudflare": False,
        # Version the raw URL as well as the catalogue entry. This prevents a
        # freshly updated iPhone from receiving an older cached main-branch
        # source while Mangayomi already records the new extension version.
        "sourceCodeUrl": f"{raw}/mkissa.js?v={VERSION}",
        "apiUrl": "https://api.mkissa.net/api",
        "version": VERSION,
        "isManga": False,
        "itemType": 1,
        "isFullData": False,
        "appMinVerReq": "0.9.0",
        "additionalParams": "",
        "sourceCodeLanguage": 1,
        "notes": "Anime source with complete dates and broader search. v0.0.4 uses Mangayomi's iOS-safe Dart HTTP path, races working video hosts, and reports host failures instead of an empty list.",
    }
    (ROOT / "index.json").write_text(
        json.dumps([source], indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (ROOT / "repo.json").write_text(
        json.dumps(
            {"name": "Mkissa Anime", "website": repository_url},
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Mangayomi URL: {raw}/index.json")


if __name__ == "__main__":
    main()
