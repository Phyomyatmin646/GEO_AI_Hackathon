#!/usr/bin/env python3
"""
run_daily_predictions.py — Daily batch inference for the 5 km agricultural map.

Reads validated regional CSVs, constructs the 75 model features, sends batches
to the model server's /api/v1/infer/batch endpoint, ranks crop suitability scores,
and writes the final map_recommendations.json.

Usage:
    python scripts/run_daily_predictions.py --date 2026-08-03 --regions all
    python scripts/run_daily_predictions.py --date 2026-08-03 --regions yangon,bago
    python scripts/run_daily_predictions.py --date 2026-08-03 --regions all --batch-size 50
    python scripts/run_daily_predictions.py --date 2026-08-03 --regions all --dry-run
    python scripts/run_daily_predictions.py --date 2026-08-03 --regions all --resume
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
from typing import Any

# ── Project root on sys.path ──────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from myanmar_agri_geo.daily.feature_builder import FeatureBuilder, ALL_75_FEATURES
from myanmar_agri_geo.daily.validator import validate_all_regions, VALID_REGIONS

# ── Config ────────────────────────────────────────────────────────────────────
SERVING_PARQUET = (
    Path.home() / "Desktop" / "GEO_model_server" / "data" / "processed" / "features_serving.parquet"
)
DATA_DIR = PROJECT_ROOT / "data" / "daily"

MODEL_SERVER_URL = "http://localhost:8001"
MODEL_SERVER_API_KEY = ""  # set via env: MODEL_SERVER_API_KEY=...
MODEL_BATCH_SIZE = 100
MODEL_TIMEOUT_S = 120

CROP_SUITABILITY_TARGETS = [
    "crop_suitability_monsoon_rice", "crop_suitability_dry_season_rice",
    "crop_suitability_black_gram", "crop_suitability_green_gram",
    "crop_suitability_maize", "crop_suitability_groundnut",
    "crop_suitability_chili", "crop_suitability_sesame",
    "crop_suitability_sugarcane", "crop_suitability_cassava",
    "crop_suitability_tomato", "crop_suitability_pigeon_pea",
    "crop_suitability_rubber", "crop_suitability_mango",
    "crop_suitability_durian", "crop_suitability_mangosteen",
    "crop_suitability_longan",
]

ALL_40_TARGETS = CROP_SUITABILITY_TARGETS + [
    "crop_health_score", "crop_yield_t_ha", "irrigation_need",
    "flood_risk_level", "drought_risk_score", "heat_stress_risk",
    "agricultural_gdp_forecast",
    "current_month_precipitation_mm", "current_month_mean_temperature_c",
    "current_month_solar_rad_mj_m2_day",
    "soil_erosion_risk", "surface_water_occurrence", "water_scarcity_risk",
    "optimal_planting_month", "nitrogen_requirement_level",
    "phosphorus_requirement_level", "irrigation_potential",
    "market_integration_score", "post_harvest_loss_risk",
    "supply_chain_efficiency", "cold_chain_potential",
    "agricultural_land_conversion_risk", "urban_encroachment_risk",
]

CROP_COLORS: dict[str, str] = {
    "monsoon_rice": "#2E7D32",
    "dry_season_rice": "#66BB6A",
    "black_gram": "#6A1B9A",
    "green_gram": "#8BC34A",
    "maize": "#FDD835",
    "groundnut": "#A1887F",
    "chili": "#E53935",
    "sesame": "#5D4037",
    "sugarcane": "#43A047",
    "cassava": "#D4A373",
    "tomato": "#EF5350",
    "pigeon_pea": "#FF8F00",
    "rubber": "#455A64",
    "mango": "#FFB300",
    "durian": "#9E9D24",
    "mangosteen": "#7B1FA2",
    "longan": "#BF8F00",
}

import os
MODEL_SERVER_API_KEY = os.environ.get("MODEL_SERVER_API_KEY", "")


# ── HTTP batch call ───────────────────────────────────────────────────────────

def _call_batch_infer(
    rows: list[dict[str, Any]],
    targets: list[str],
    observation_month: str,
    dry_run: bool = False,
) -> dict[str, Any] | None:
    """POST rows to /api/v1/infer/batch. Returns the parsed JSON response."""
    url = f"{MODEL_SERVER_URL}/api/v1/infer/batch"
    payload = {
        "rows": rows,
        "targets": targets,
        "observation_month": observation_month,
    }
    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if MODEL_SERVER_API_KEY:
        headers["X-API-Key"] = MODEL_SERVER_API_KEY

    if dry_run:
        print(f"  [DRY-RUN] Would POST {len(rows)} rows to {url}")
        return {"results": [], "successful_rows": 0, "failed_rows": 0}

    req = urllib.request.Request(url, data=body, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=MODEL_TIMEOUT_S) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        print(f"  [ERROR] HTTP {exc.code}: {exc.read().decode('utf-8', errors='replace')[:200]}")
        return None
    except Exception as exc:
        print(f"  [ERROR] Request failed: {exc}")
        return None


# ── Score extraction ──────────────────────────────────────────────────────────

def _extract_score(prediction: dict[str, Any]) -> float:
    """Convert model prediction to a 0-100 suitability score."""
    if not prediction:
        return 0.0
    confidence = prediction.get("confidence")
    if confidence is not None:
        return round(float(confidence) * 100, 2)
    value = prediction.get("value")
    if value is not None:
        try:
            return round(float(value) * 100 if float(value) <= 1 else float(value), 2)
        except (TypeError, ValueError):
            pass
    return 0.0


def _build_cell_record(
    csv_row: dict[str, Any],
    region: str,
    date_str: str,
    batch_result_row: dict[str, Any] | None,
) -> dict[str, Any]:
    """Build a single map cell record in the final JSON format."""
    grid_id = str(csv_row.get("grid_id", ""))
    lat = float(csv_row.get("latitude", 0))
    lon = float(csv_row.get("longitude", 0))
    obs_month = str(csv_row.get("observation_month", date_str[:7]))
    source_date = str(csv_row.get("source_date", date_str))

    try:
        source_age = int((
            datetime.strptime(date_str, "%Y-%m-%d") -
            datetime.strptime(source_date, "%Y-%m-%d")
        ).days)
    except ValueError:
        source_age = 0

    predictions_raw: dict[str, Any] = {}
    crop_scores: list[tuple[str, float]] = []
    errors: dict[str, str] = {}

    if batch_result_row:
        preds = batch_result_row.get("predictions", {})
        errors = batch_result_row.get("errors", {})

        for target, pred in preds.items():
            predictions_raw[target] = pred

        # Extract crop suitability scores
        for target in CROP_SUITABILITY_TARGETS:
            crop_key = target.replace("crop_suitability_", "")
            if target in preds:
                score = _extract_score(preds[target])
                crop_scores.append((crop_key, score))

    crop_scores.sort(key=lambda x: x[1], reverse=True)
    top_crop = crop_scores[0][0] if crop_scores else None
    top_score = crop_scores[0][1] if crop_scores else None

    warnings: list[str] = []
    if source_age > 7:
        warnings.append(f"Satellite data is {source_age} days old")
    if errors:
        warnings.append(f"{len(errors)} model targets failed")
    warnings.append("Experimental prediction — not yet field verified")

    return {
        "index": grid_id,
        "lat": lat,
        "lon": lon,
        "region": region,
        "observation_date": date_str,
        "observation_month": obs_month,
        "source_date": source_date,
        "source_age_days": source_age,
        "top_crop": top_crop,
        "top_score": top_score,
        "color": CROP_COLORS.get(top_crop, "#9E9E9E") if top_crop else "#9E9E9E",
        "recommendations": [[crop, score] for crop, score in crop_scores[:5]],
        "predictions": predictions_raw,
        "model_metadata": {
            "field_validated": False,
            "experimental": True,
            "model_source": "primary",
        },
        "data_quality": {
            "quality_flag": "valid",
            "warnings": warnings,
            "failed_targets": errors,
        },
    }


# ── Main pipeline ──────────────────────────────────────────────────────────────

def run_predictions(
    date_str: str,
    regions: list[str],
    batch_size: int = MODEL_BATCH_SIZE,
    dry_run: bool = False,
    resume: bool = False,
) -> dict[str, Any]:
    """Run batch predictions for all specified regions on a given date.

    Returns a summary dict.
    """
    date_dir = DATA_DIR / date_str
    validated_dir = date_dir / "validated"
    predictions_dir = date_dir / "predictions"
    predictions_dir.mkdir(parents=True, exist_ok=True)

    map_json_path = predictions_dir / "map_recommendations.json"
    if resume and map_json_path.exists():
        print(f"[RESUME] {map_json_path} already exists — skipping.")
        return {"skipped": True, "path": str(map_json_path)}

    builder = FeatureBuilder(SERVING_PARQUET)
    all_cells: list[dict[str, Any]] = []
    summary: dict[str, Any] = {
        "date": date_str,
        "ran_at": datetime.utcnow().isoformat() + "Z",
        "regions": {},
        "totals": {"cells": 0, "successful": 0, "failed": 0},
    }

    obs_month = date_str[:7]  # YYYY-MM

    for region in regions:
        csv_path = validated_dir / f"{region}.csv"
        if not csv_path.exists():
            print(f"[WARN] No validated CSV for {region} at {csv_path}")
            summary["regions"][region] = {"error": "validated CSV not found", "cells": 0}
            continue

        import csv
        with open(csv_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            csv_rows = list(reader)

        if not csv_rows:
            print(f"[SKIP] {region}: empty validated CSV")
            summary["regions"][region] = {"cells": 0, "successful": 0, "failed": 0}
            continue

        print(f"\n[{region}] {len(csv_rows)} cells")

        # Build feature vectors
        print(f"  Building features...")
        feature_rows = builder.build_batch(csv_rows, region)

        # Send batches to model server
        results_by_idx: dict[int, dict[str, Any]] = {}
        n_batches = math.ceil(len(feature_rows) / batch_size)
        n_success = 0
        n_failed = 0

        for b in range(n_batches):
            start = b * batch_size
            end = min(start + batch_size, len(feature_rows))
            batch_features = feature_rows[start:end]

            print(f"  Batch {b+1}/{n_batches} ({end-start} cells)...")
            resp = _call_batch_infer(batch_features, ALL_40_TARGETS, obs_month, dry_run)

            if resp and "results" in resp:
                for result in resp["results"]:
                    global_idx = start + result["row_index"]
                    results_by_idx[global_idx] = result
                n_success += resp.get("successful_rows", 0)
                n_failed += resp.get("failed_rows", 0)
            else:
                n_failed += len(batch_features)
                print(f"  [ERROR] Batch {b+1} failed entirely")

        # Build cell records
        for i, csv_row in enumerate(csv_rows):
            batch_result = results_by_idx.get(i)
            cell = _build_cell_record(csv_row, region, date_str, batch_result)
            all_cells.append(cell)

        summary["regions"][region] = {
            "cells": len(csv_rows),
            "successful": n_success,
            "failed": n_failed,
        }
        summary["totals"]["cells"] += len(csv_rows)
        summary["totals"]["successful"] += n_success
        summary["totals"]["failed"] += n_failed
        print(f"  Done: {n_success} succeeded, {n_failed} failed")

    # Write final JSON
    if not dry_run:
        map_json_path.write_text(json.dumps(all_cells, indent=2), encoding="utf-8")
        print(f"\n[DONE] {len(all_cells)} cells → {map_json_path}")
    else:
        print(f"\n[DRY-RUN] Would write {len(all_cells)} cells to {map_json_path}")

    summary_path = date_dir / "prediction_summary.json"
    if not dry_run:
        summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    return summary


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Run daily batch predictions")
    parser.add_argument("--date", required=True, help="Date in YYYY-MM-DD format")
    parser.add_argument("--regions", default="all", help="Comma-separated regions or 'all'")
    parser.add_argument("--batch-size", type=int, default=MODEL_BATCH_SIZE)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume", action="store_true", help="Skip if output already exists")
    args = parser.parse_args()

    if args.regions == "all":
        regions = sorted(VALID_REGIONS)
    else:
        regions = [r.strip().lower() for r in args.regions.split(",")]
        invalid = set(regions) - VALID_REGIONS
        if invalid:
            print(f"[ERROR] Unknown regions: {invalid}")
            sys.exit(1)

    try:
        datetime.strptime(args.date, "%Y-%m-%d")
    except ValueError:
        print(f"[ERROR] Invalid date format: {args.date} (use YYYY-MM-DD)")
        sys.exit(1)

    print(f"=== Daily Predictions: {args.date} ({', '.join(regions)}) ===")
    t0 = time.time()
    summary = run_predictions(
        args.date, regions,
        batch_size=args.batch_size,
        dry_run=args.dry_run,
        resume=args.resume,
    )
    elapsed = round(time.time() - t0, 1)
    print(f"\nCompleted in {elapsed}s")
    totals = summary.get("totals", {})
    print(f"Cells: {totals.get('cells', 0)} | "
          f"Successful: {totals.get('successful', 0)} | "
          f"Failed: {totals.get('failed', 0)}")


if __name__ == "__main__":
    main()
