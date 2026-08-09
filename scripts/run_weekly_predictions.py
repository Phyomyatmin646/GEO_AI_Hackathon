#!/usr/bin/env python3
"""Submit validated weekly artifacts to Fastify's authenticated ingest route.

Python does not call ``GEO_MODEL_SERVER``.  Fastify derives trusted CSV paths
from ``WEEKLY_DATA_DIR``, owns model batching/authentication/persistence, and
returns a synchronous run summary.  Only file metadata is submitted here.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable, Mapping

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from myanmar_agri_geo.weekly.feature_builder import (  # noqa: E402
    ALL_75_FEATURES,
    MODEL_INPUT_SCHEMA_SHA256,
    WEEKLY_IDENTITY_COLUMNS,
)
from myanmar_agri_geo.weekly.validator import VALID_REGIONS  # noqa: E402
from myanmar_agri_geo.weekly.window import (  # noqa: E402
    observation_month_for_week,
    parse_week_start,
)

DATA_DIR = Path(os.environ.get("WEEKLY_DATA_DIR", PROJECT_ROOT / "data" / "weekly"))
BACKEND_URL = os.environ.get("BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "")
try:
    BACKEND_TIMEOUT_SECONDS = float(os.environ.get("BACKEND_REQUEST_TIMEOUT_SECONDS", "7200"))
except ValueError as exc:
    raise RuntimeError("BACKEND_REQUEST_TIMEOUT_SECONDS must be numeric") from exc
if not math.isfinite(BACKEND_TIMEOUT_SECONDS) or BACKEND_TIMEOUT_SECONDS <= 0:
    raise RuntimeError("BACKEND_REQUEST_TIMEOUT_SECONDS must be finite and positive")
INTERNAL_INGEST_PATH = "/api/v1/internal/weekly/ingest"
MAX_BACKEND_RESPONSE_BYTES = 1_048_576


class BackendSubmissionError(RuntimeError):
    """Raised when trusted weekly artifacts cannot be submitted safely."""


def _backend_ingest_url(origin: str) -> str:
    parsed = urllib.parse.urlsplit(origin.strip())
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise BackendSubmissionError("BACKEND_URL must be an HTTP(S) origin without credentials or path")
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, INTERNAL_INGEST_PATH, "", ""))


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _parse_bool(value: str, name: str) -> bool:
    normalized = value.strip().lower()
    if normalized in {"true", "1"}:
        return True
    if normalized in {"false", "0"}:
        return False
    raise BackendSubmissionError(f"{name} must be true or false")


def _finite_number(value: str, name: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise BackendSubmissionError(f"{name} is missing or not numeric") from exc
    if not math.isfinite(number):
        raise BackendSubmissionError(f"{name} is missing or non-finite")
    return number


def _integer_number(value: str, name: str) -> int:
    number = _finite_number(value, name)
    if not number.is_integer():
        raise BackendSubmissionError(f"{name} must be an integer")
    return int(number)


def _read_region_metadata(path: Path, region: str, week_start: str) -> dict[str, Any]:
    """Revalidate headers, finite features, identity, and uniform coverage."""

    if not path.is_file():
        raise BackendSubmissionError(f"validated CSV not found for {region}: {path}")
    window = parse_week_start(week_start)
    expected_observation_month = observation_month_for_week(window.start)
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        headers = reader.fieldnames or []
        if headers != WEEKLY_IDENTITY_COLUMNS + ALL_75_FEATURES:
            raise BackendSubmissionError(
                f"{region}: validated header is not identity + exact ordered 75-feature schema"
            )

        row_count = 0
        coverage_metadata: dict[str, Any] | None = None
        seen_grid_ids: set[str] = set()
        for row in reader:
            row_count += 1
            grid_id = row["grid_id"]
            if grid_id in seen_grid_ids:
                raise BackendSubmissionError(f"{region}: duplicate grid_id {grid_id}")
            seen_grid_ids.add(grid_id)
            if row["region"] != region or row["week_start"] != week_start:
                raise BackendSubmissionError(f"{region}: validated identity metadata mismatch")
            if row["week_end"] != window.end.isoformat():
                raise BackendSubmissionError(f"{region}: validated week_end mismatch")
            if row["observation_month"] != expected_observation_month:
                raise BackendSubmissionError(
                    f"{region}: observation_month must contain the interval's last included day"
                )
            if row["feature_schema_sha256"] != MODEL_INPUT_SCHEMA_SHA256:
                raise BackendSubmissionError(f"{region}: feature schema checksum mismatch")

            # Fail closed for every missing/non-finite feature.  In particular,
            # do not replace missing serving values with zero/defaults.
            for feature in ALL_75_FEATURES:
                _finite_number(row[feature], f"{region}.{grid_id}.{feature}")

            try:
                source_coverage = json.loads(row["source_coverage_json"])
                source_dates = json.loads(row["source_observation_dates_json"])
                source_dates_used = json.loads(row["source_dates_used_json"])
            except json.JSONDecodeError as exc:
                raise BackendSubmissionError(f"{region}: invalid coverage JSON") from exc
            candidate = {
                "week_start": row["week_start"],
                "week_end": row["week_end"],
                "observation_days": _integer_number(row["observation_days"], "observation_days"),
                "expected_days": _integer_number(row["expected_days"], "expected_days"),
                "coverage_ratio": _finite_number(row["coverage_ratio"], "coverage_ratio"),
                "is_partial_week": _parse_bool(row["is_partial_week"], "is_partial_week"),
                "source_coverage": source_coverage,
                "source_observation_dates": source_dates,
                "source_dates_used": source_dates_used,
            }
            if coverage_metadata is None:
                coverage_metadata = candidate
            elif coverage_metadata != candidate:
                raise BackendSubmissionError(f"{region}: coverage metadata varies by row")

    if row_count == 0 or coverage_metadata is None:
        raise BackendSubmissionError(f"{region}: validated CSV has zero rows")
    return {
        "region": region,
        "row_count": row_count,
        "source_sha256": _sha256_file(path),
        "coverage_metadata": coverage_metadata,
    }


def _default_http_post(url: str, body: bytes, headers: dict[str, str], timeout: float) -> bytes:
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = response.read(MAX_BACKEND_RESPONSE_BYTES + 1)
            if len(payload) > MAX_BACKEND_RESPONSE_BYTES:
                raise BackendSubmissionError("backend weekly ingest response is too large")
            return payload
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise BackendSubmissionError(f"backend rejected weekly ingest ({exc.code}): {detail}") from exc
    except urllib.error.URLError as exc:
        raise BackendSubmissionError(f"backend weekly ingest failed: {exc.reason}") from exc


def _validate_backend_response(
    response: Any,
    week_start: str,
    week_end: str,
    expected_region_counts: Mapping[str, int],
) -> dict[str, Any]:
    if not isinstance(response, dict):
        raise BackendSubmissionError("backend returned a non-object response")
    required = {
        "run_id", "status", "week_start", "week_end",
        "model_catalog_version", "schema_version", "regions",
        "flagged_models_enabled", "crop_predictions_available",
    }
    missing = sorted(required - set(response))
    if missing:
        raise BackendSubmissionError(f"backend response is missing fields: {missing}")
    if response["week_start"] != week_start or response["week_end"] != week_end:
        raise BackendSubmissionError("backend response week does not match submission")
    if response["status"] not in {"succeeded", "partially_succeeded", "failed"}:
        raise BackendSubmissionError("backend returned an invalid run status")
    if not isinstance(response["flagged_models_enabled"], bool) or not isinstance(
        response["crop_predictions_available"], bool
    ):
        raise BackendSubmissionError("backend returned invalid model-policy flags")
    if response["crop_predictions_available"] != response["flagged_models_enabled"]:
        raise BackendSubmissionError("backend returned inconsistent model-policy flags")
    if not isinstance(response["regions"], list):
        raise BackendSubmissionError("backend response regions must be a list")
    returned_regions: list[str] = []
    for item in response["regions"]:
        if not isinstance(item, dict) or not {"region", "status", "cell_count"} <= set(item):
            raise BackendSubmissionError("backend returned an invalid regional status")
        if item["region"] not in VALID_REGIONS:
            raise BackendSubmissionError("backend returned an unknown regional status")
        if item["status"] not in {"succeeded", "failed"}:
            raise BackendSubmissionError("backend returned an invalid regional status")
        if (
            isinstance(item["cell_count"], bool)
            or not isinstance(item["cell_count"], int)
            or item["cell_count"] < 0
        ):
            raise BackendSubmissionError("backend returned an invalid regional cell count")
        expected_count = expected_region_counts.get(item["region"])
        if expected_count is None:
            raise BackendSubmissionError("backend returned an unknown regional status")
        if item["cell_count"] != (expected_count if item["status"] == "succeeded" else 0):
            raise BackendSubmissionError("backend returned an inconsistent regional cell count")
        returned_regions.append(item["region"])
    if len(set(returned_regions)) != len(returned_regions) or set(returned_regions) != set(
        expected_region_counts
    ):
        raise BackendSubmissionError("backend response regions do not match the submission")
    succeeded = sum(item["status"] == "succeeded" for item in response["regions"])
    expected_status = (
        "succeeded"
        if succeeded == len(returned_regions)
        else "failed"
        if succeeded == 0
        else "partially_succeeded"
    )
    if response["status"] != expected_status:
        raise BackendSubmissionError("backend aggregate status is inconsistent")
    return response


def run_predictions(
    week_start: str,
    regions: list[str],
    *,
    dry_run: bool = False,
    resume: bool = False,
    data_dir: Path | None = None,
    backend_url: str | None = None,
    internal_api_key: str | None = None,
    http_post: Callable[[str, bytes, dict[str, str], float], bytes] = _default_http_post,
) -> dict[str, Any]:
    """Validate local artifacts and submit one metadata-only Fastify ingest."""

    window = parse_week_start(week_start)
    normalized_regions = [region.strip().lower() for region in regions]
    invalid = sorted(set(normalized_regions) - VALID_REGIONS)
    if invalid or len(set(normalized_regions)) != len(normalized_regions):
        raise BackendSubmissionError(f"regions must be unique canonical names; invalid={invalid}")

    root = Path(data_dir or DATA_DIR)
    week_dir = root / window.identifier
    validated_dir = week_dir / "validated"
    predictions_dir = week_dir / "predictions"
    response_path = predictions_dir / "backend_ingest_response.json"
    # Even with --resume, revalidate files and call Fastify. The backend owns
    # idempotency and source-hash checks; a local response file is not trusted
    # as proof that the current artifacts are unchanged.

    region_metadata = [
        _read_region_metadata(validated_dir / f"{region}.csv", region, window.identifier)
        for region in normalized_regions
    ]
    payload = {
        "week_start": window.identifier,
        "week_end": window.end.isoformat(),
        "schema_checksum": MODEL_INPUT_SCHEMA_SHA256,
        "regions": region_metadata,
    }

    if dry_run:
        # Deliberately return before URL/key checks and before http_post.  Tests
        # and operators can rely on dry-run making no network request.
        return {
            "dry_run": True,
            "would_submit": payload,
            "backend_url": _backend_ingest_url(backend_url or BACKEND_URL),
            "resume": resume,
        }

    key = internal_api_key if internal_api_key is not None else INTERNAL_API_KEY
    if not key:
        raise BackendSubmissionError("INTERNAL_API_KEY is required for weekly backend ingest")
    url = _backend_ingest_url(backend_url or BACKEND_URL)
    body = json.dumps(payload, separators=(",", ":"), allow_nan=False).encode("utf-8")
    raw_response = http_post(
        url,
        body,
        {"Content-Type": "application/json", "X-Internal-API-Key": key},
        BACKEND_TIMEOUT_SECONDS,
    )
    try:
        decoded = json.loads(raw_response.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise BackendSubmissionError("backend returned invalid JSON") from exc
    response = _validate_backend_response(
        decoded,
        window.identifier,
        window.end.isoformat(),
        {item["region"]: item["row_count"] for item in region_metadata},
    )
    predictions_dir.mkdir(parents=True, exist_ok=True)
    response_path.write_text(json.dumps(response, indent=2), encoding="utf-8")
    return response


def _parse_regions(value: str) -> list[str]:
    if value == "all":
        return sorted(VALID_REGIONS)
    regions = [item.strip().lower() for item in value.split(",") if item.strip()]
    if not regions:
        raise BackendSubmissionError("at least one region is required")
    return regions


def main() -> None:
    parser = argparse.ArgumentParser(description="Submit weekly artifacts to Fastify")
    parser.add_argument("--week-start", required=True, help="Monday in YYYY-MM-DD format")
    parser.add_argument("--regions", default="all")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    try:
        result = run_predictions(
            args.week_start,
            _parse_regions(args.regions),
            dry_run=args.dry_run,
            resume=args.resume,
        )
    except (BackendSubmissionError, ValueError) as exc:
        parser.error(str(exc))
    print(json.dumps(result, indent=2))
    if not result.get("dry_run") and result.get("status") != "succeeded":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
