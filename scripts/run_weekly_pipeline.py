#!/usr/bin/env python3
"""Orchestrate weekly export, exact feature construction, and Fastify ingest."""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Callable

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))
sys.path.insert(0, str(PROJECT_ROOT))

from myanmar_agri_geo.weekly.feature_builder import (  # noqa: E402
    FeatureBuilder,
    configured_serving_paths,
)
from myanmar_agri_geo.weekly.validator import (  # noqa: E402
    VALID_REGIONS,
    validate_all_regions,
)
from myanmar_agri_geo.weekly.window import parse_week_start  # noqa: E402

DATA_DIR = Path(os.environ.get("WEEKLY_DATA_DIR", PROJECT_ROOT / "data" / "weekly"))


def _run_stage(name: str, function: Callable[..., Any], *args: Any, **kwargs: Any) -> dict[str, Any]:
    started = time.monotonic()
    try:
        result = function(*args, **kwargs)
    except Exception as exc:
        return {
            "status": "failed",
            "elapsed_seconds": round(time.monotonic() - started, 3),
            "error": str(exc),
        }
    return {
        "status": "succeeded",
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "result": result,
    }


def _write_summary(path: Path, summary: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(summary, indent=2), encoding="utf-8")


def run_pipeline(
    week_start: str,
    regions: list[str],
    *,
    dry_run: bool = False,
    resume: bool = False,
    skip_gee: bool = False,
    data_dir: Path = DATA_DIR,
    serving_parquet_path: Path | None = None,
    spatial_index_path: Path | None = None,
) -> dict[str, Any]:
    window = parse_week_start(week_start)
    normalized_regions = [value.strip().lower() for value in regions]
    invalid = sorted(set(normalized_regions) - VALID_REGIONS)
    if invalid or not normalized_regions:
        raise ValueError(f"invalid weekly regions: {invalid}")
    if len(set(normalized_regions)) != len(normalized_regions):
        raise ValueError("weekly regions must not contain duplicates")
    if not dry_run and set(normalized_regions) != VALID_REGIONS:
        missing = sorted(VALID_REGIONS - set(normalized_regions))
        raise ValueError(
            f"production weekly runs require the complete six-region manifest; missing={missing}"
        )

    configured_features, configured_spatial = configured_serving_paths()
    feature_builder = FeatureBuilder(
        serving_parquet_path or configured_features,
        spatial_index_path or configured_spatial,
    )
    week_dir = Path(data_dir) / window.identifier
    if not dry_run:
        for name in ("raw", "validated", "predictions"):
            (week_dir / name).mkdir(parents=True, exist_ok=True)

    summary: dict[str, Any] = {
        "cadence": "weekly",
        "week_start": window.start.isoformat(),
        "week_end": window.end.isoformat(),
        "timezone": "Asia/Yangon",
        "regions": normalized_regions,
        "dry_run": dry_run,
        "started_at": datetime.now(UTC).isoformat(),
        "stages": {},
    }
    pipeline_started = time.monotonic()

    raw_complete = all((week_dir / "raw" / f"{region}.csv").is_file() for region in normalized_regions)
    if skip_gee or (resume and raw_complete):
        summary["stages"]["gee_export"] = {
            "status": "skipped",
            "reason": "--skip-gee" if skip_gee else "resume",
        }
    else:
        from scripts.export_weekly_gee import main_programmatic

        export_stage = _run_stage(
            "GEE weekly export",
            main_programmatic,
            window.identifier,
            normalized_regions,
            dry_run,
            Path(data_dir),
        )
        summary["stages"]["gee_export"] = export_stage
        if export_stage["status"] == "failed":
            summary["status"] = "failed"
            summary["completed_at"] = datetime.now(UTC).isoformat()
            summary["elapsed_seconds"] = round(time.monotonic() - pipeline_started, 3)
            if not dry_run:
                _write_summary(week_dir / "pipeline_run_summary.json", summary)
            return summary

    raw_complete = all((week_dir / "raw" / f"{region}.csv").is_file() for region in normalized_regions)
    if not raw_complete:
        summary["stages"]["validation"] = {
            "status": "skipped",
            "reason": "dry-run or drive-export produced no raw files",
        }
        summary["stages"]["backend_ingest"] = {
            "status": "skipped",
            "reason": "validation skipped",
        }
        summary["status"] = "dry_run" if dry_run else "queued_to_drive"
        summary["completed_at"] = datetime.now(UTC).isoformat()
        summary["elapsed_seconds"] = round(time.monotonic() - pipeline_started, 3)
        if not dry_run:
            _write_summary(week_dir / "pipeline_run_summary.json", summary)
            print(f"\n[{datetime.now().isoformat()}] \033[92mGEE tasks queued to Google Drive successfully.\033[0m")
            print("Please wait for the Earth Engine tasks to complete, download the CSVs, place them in:")
            print(f"  {week_dir}/raw/")
            print("Then re-run this pipeline with --skip-gee flag.")
        return summary

    validation_stage = _run_stage(
        "weekly CSV validation",
        validate_all_regions,
        window.identifier,
        Path(data_dir),
        normalized_regions,
        feature_builder,
        write_outputs=True,
    )
    summary["stages"]["validation"] = validation_stage
    validation_result = validation_stage.get("result") or {}
    if validation_stage["status"] == "failed" or validation_result.get("invalid_regions"):
        summary["status"] = "failed"
        summary["completed_at"] = datetime.now(UTC).isoformat()
        summary["elapsed_seconds"] = round(time.monotonic() - pipeline_started, 3)
        if not dry_run:
            _write_summary(week_dir / "pipeline_run_summary.json", summary)
        return summary

    from scripts.run_weekly_predictions import run_predictions

    ingest_stage = _run_stage(
        "Fastify weekly ingest",
        run_predictions,
        window.identifier,
        normalized_regions,
        dry_run=dry_run,
        resume=resume,
        data_dir=Path(data_dir),
    )
    summary["stages"]["backend_ingest"] = ingest_stage
    if ingest_stage["status"] != "succeeded":
        summary["status"] = "failed"
    elif dry_run:
        summary["status"] = "dry_run"
    else:
        backend_status = (ingest_stage.get("result") or {}).get("status")
        if backend_status not in {"succeeded", "partially_succeeded", "failed"}:
            ingest_stage["status"] = "failed"
            ingest_stage["error"] = "Fastify returned no valid aggregate run status"
            summary["status"] = "failed"
        else:
            # A completed HTTP request is not the same as a successful model
            # run. Preserve Fastify's application-level status so cron exits
            # non-zero for partial or total regional failure.
            ingest_stage["transport_status"] = "succeeded"
            ingest_stage["status"] = backend_status
            summary["status"] = backend_status
    summary["completed_at"] = datetime.now(UTC).isoformat()
    summary["elapsed_seconds"] = round(time.monotonic() - pipeline_started, 3)
    if not dry_run:
        _write_summary(week_dir / "pipeline_run_summary.json", summary)
    return summary


def _parse_regions(value: str) -> list[str]:
    if value == "all":
        return sorted(VALID_REGIONS)
    return [item.strip().lower() for item in value.split(",") if item.strip()]


def main() -> None:
    parser = argparse.ArgumentParser(description="Weekly GEE → Fastify pipeline")
    parser.add_argument("--week-start", required=True, help="Monday in YYYY-MM-DD format")
    parser.add_argument("--regions", default="all")
    parser.add_argument("--dry-run", action="store_true", help="Never call Fastify")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--skip-gee", action="store_true", help="Use existing raw CSVs")
    parser.add_argument("--features-serving", type=Path)
    parser.add_argument("--spatial-index", type=Path)
    args = parser.parse_args()
    try:
        result = run_pipeline(
            args.week_start,
            _parse_regions(args.regions),
            dry_run=args.dry_run,
            resume=args.resume,
            skip_gee=args.skip_gee,
            serving_parquet_path=args.features_serving,
            spatial_index_path=args.spatial_index,
        )
    except ValueError as exc:
        parser.error(str(exc))
    print(json.dumps(result, indent=2))
    if result["status"] not in {"succeeded", "dry_run"}:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
