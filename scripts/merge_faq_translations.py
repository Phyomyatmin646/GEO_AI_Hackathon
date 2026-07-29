#!/usr/bin/env python3
"""Validate FAQ translation chunks and rebuild bilingual web data artifacts."""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = REPO_ROOT / "web" / "data" / "faq_processed.json"
DEFAULT_TRANSLATIONS_DIR = (
    REPO_ROOT / "data" / "processed" / "faq-translations"
)
JSON_OUTPUT = REPO_ROOT / "web" / "data" / "faq_processed.json"
CSV_OUTPUTS = (
    REPO_ROOT / "web" / "data" / "faq_processed.csv",
    REPO_ROOT / "data" / "processed" / "faq_processed.csv",
)
EXPECTED_TRANSLATION_KEYS = {
    "index",
    "faq_id",
    "question_en",
    "answer_en",
}
MYANMAR_TEXT = re.compile(r"[\u1000-\u109f]")
ENGLISH_OR_NUMERIC_CONTENT = re.compile(r"[A-Za-z0-9]")
PENDING_TEXT = "pending english translation"


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_translations(directory: Path) -> dict[int, dict[str, Any]]:
    paths = sorted(directory.glob("chunk_*.json"))
    if not paths:
        raise ValueError(f"No translation chunks found in {directory}")

    translations: dict[int, dict[str, Any]] = {}
    for path in paths:
        chunk = load_json(path)
        if not isinstance(chunk, list):
            raise ValueError(f"{path} must contain a JSON array")
        for item in chunk:
            if not isinstance(item, dict):
                raise ValueError(f"{path} contains a non-object entry")
            if set(item) != EXPECTED_TRANSLATION_KEYS:
                raise ValueError(
                    f"{path} entry keys must be exactly "
                    f"{sorted(EXPECTED_TRANSLATION_KEYS)}"
                )
            index = item["index"]
            if not isinstance(index, int) or isinstance(index, bool):
                raise ValueError(f"{path} has a non-integer index: {index!r}")
            if index in translations:
                raise ValueError(f"Duplicate translation index: {index}")
            translations[index] = item
    return translations


def validate_translation(
    *,
    index: int,
    source_record: dict[str, Any],
    translation: dict[str, Any],
) -> None:
    if translation["faq_id"] != source_record["faq_id"]:
        raise ValueError(f"FAQ ID mismatch at index {index}")

    for field in ("question_en", "answer_en"):
        value = translation[field]
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{field} is empty at index {index}")
        if value.strip().lower() == PENDING_TEXT:
            raise ValueError(f"{field} is still pending at index {index}")
        if MYANMAR_TEXT.search(value):
            raise ValueError(f"{field} contains Myanmar text at index {index}")
        if not ENGLISH_OR_NUMERIC_CONTENT.search(value):
            raise ValueError(
                f"{field} contains no English or numeric content at index {index}"
            )


def write_json(path: Path, records: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(records, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def write_csv(path: Path, records: list[dict[str, Any]]) -> None:
    fieldnames = list(records[0])
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)


def merge(source_path: Path, translations_dir: Path) -> list[dict[str, Any]]:
    records = load_json(source_path)
    if not isinstance(records, list) or not records:
        raise ValueError(f"{source_path} must contain a non-empty JSON array")

    translations = load_translations(translations_dir)
    expected_indices = set(range(len(records)))
    actual_indices = set(translations)
    missing = sorted(expected_indices - actual_indices)
    unexpected = sorted(actual_indices - expected_indices)
    if missing or unexpected:
        raise ValueError(
            "Translation coverage mismatch: "
            f"missing={missing[:10]} (total {len(missing)}), "
            f"unexpected={unexpected[:10]} (total {len(unexpected)})"
        )

    merged: list[dict[str, Any]] = []
    for index, source_record in enumerate(records):
        translation = translations[index]
        validate_translation(
            index=index,
            source_record=source_record,
            translation=translation,
        )
        merged.append(
            {
                **source_record,
                "question_en": translation["question_en"].strip(),
                "answer_en": translation["answer_en"].strip(),
                "version": 2.0,
            }
        )
    return merged


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument(
        "--translations-dir",
        type=Path,
        default=DEFAULT_TRANSLATIONS_DIR,
    )
    args = parser.parse_args()

    records = merge(args.source, args.translations_dir)
    write_json(JSON_OUTPUT, records)
    for path in CSV_OUTPUTS:
        write_csv(path, records)

    print(
        f"Merged {len(records)} bilingual FAQ records into "
        f"{JSON_OUTPUT.relative_to(REPO_ROOT)} and {len(CSV_OUTPUTS)} CSV files."
    )


if __name__ == "__main__":
    main()
