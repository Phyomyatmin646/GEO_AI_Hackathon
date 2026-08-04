#!/usr/bin/env python3
"""
run_daily_pipeline.py — Single orchestrator for the daily GEE inference pipeline.

Runs all stages in sequence:
  1. GEE extraction (export_daily_gee.py)
  2. CSV validation (validator.py)
  3. Batch model inference (run_daily_predictions.py)

Usage:
    python scripts/run_daily_pipeline.py --date 2026-08-03 --regions all
    python scripts/run_daily_pipeline.py --date 2026-08-03 --regions yangon --dry-run
    python scripts/run_daily_pipeline.py --date 2026-08-03 --regions all --resume
    python scripts/run_daily_pipeline.py --date 2026-08-03 --regions all --skip-gee
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))
sys.path.insert(0, str(PROJECT_ROOT))

from myanmar_agri_geo.daily.validator import validate_all_regions, VALID_REGIONS

DATA_DIR = PROJECT_ROOT / "data" / "daily"


def _run_stage(name: str, fn, *args, **kwargs) -> dict:
    print(f"\n{'='*60}")
    print(f"  STAGE: {name}")
    print(f"{'='*60}")
    t0 = time.time()
    try:
        result = fn(*args, **kwargs)
        elapsed = round(time.time() - t0, 1)
        print(f"[OK] {name} completed in {elapsed}s")
        return {"status": "success", "elapsed_s": elapsed, "result": result}
    except SystemExit as exc:
        print(f"[FAIL] {name} exited with code {exc.code}")
        return {"status": "failed", "error": f"SystemExit({exc.code})"}
    except Exception as exc:
        print(f"[FAIL] {name} raised: {exc}")
        return {"status": "failed", "error": str(exc)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Daily GEE → inference pipeline orchestrator")
    parser.add_argument("--date", required=True, help="Date in YYYY-MM-DD format")
    parser.add_argument("--regions", default="all", help="Comma-separated regions or 'all'")
    parser.add_argument("--dry-run", action="store_true", help="Skip writes and model calls")
    parser.add_argument("--resume", action="store_true", help="Skip stages with existing output")
    parser.add_argument("--skip-gee", action="store_true", help="Skip GEE extraction (use existing raw CSVs)")
    parser.add_argument("--batch-size", type=int, default=100)
    args = parser.parse_args()

    try:
        datetime.strptime(args.date, "%Y-%m-%d")
    except ValueError:
        print(f"[ERROR] Invalid date: {args.date}")
        sys.exit(1)

    if args.regions == "all":
        regions = sorted(VALID_REGIONS)
    else:
        regions = [r.strip().lower() for r in args.regions.split(",")]
        invalid = set(regions) - VALID_REGIONS
        if invalid:
            print(f"[ERROR] Unknown regions: {invalid}")
            sys.exit(1)

    date_str = args.date
    print(f"\n{'#'*60}")
    print(f"  DAILY PIPELINE: {date_str}  ({', '.join(regions)})")
    if args.dry_run:
        print(f"  MODE: DRY-RUN (no files written, no model calls)")
    if args.resume:
        print(f"  MODE: RESUME (skipping completed stages)")
    print(f"{'#'*60}")

    pipeline_summary: dict = {
        "date": date_str,
        "regions": regions,
        "started_at": datetime.utcnow().isoformat() + "Z",
        "stages": {},
    }

    t_total = time.time()

    # ── Stage 1: GEE Extraction ───────────────────────────────────────────────
    if not args.skip_gee:
        raw_dir = DATA_DIR / date_str / "raw"
        gee_done = all((raw_dir / f"{r}.csv").exists() for r in regions)
        if args.resume and gee_done:
            print("\n[RESUME] GEE raw CSVs already exist — skipping extraction")
            pipeline_summary["stages"]["gee_export"] = {"status": "skipped", "reason": "resume"}
        else:
            # Import and run GEE export
            from scripts import export_daily_gee  # noqa — dynamic import
            result = _run_stage(
                "GEE Export",
                export_daily_gee.main_programmatic,
                date_str, regions, args.dry_run
            ) if hasattr(export_daily_gee, "main_programmatic") else \
                _run_stage("GEE Export", _invoke_script, "export_daily_gee.py",
                           date_str, regions, args.dry_run)
            pipeline_summary["stages"]["gee_export"] = result
    else:
        print("\n[SKIP] GEE extraction (--skip-gee)")
        pipeline_summary["stages"]["gee_export"] = {"status": "skipped", "reason": "--skip-gee"}

    # ── Stage 2: CSV Validation ───────────────────────────────────────────────
    val_result = _run_stage(
        "CSV Validation",
        validate_all_regions,
        date_str, DATA_DIR, regions, True,
    )
    pipeline_summary["stages"]["validation"] = val_result

    if val_result["status"] == "failed":
        print("\n[ABORT] Validation failed — not proceeding to inference")
        _write_summary(date_str, pipeline_summary)
        sys.exit(1)

    # Check we have at least some valid rows
    totals = (val_result.get("result") or {}).get("totals", {})
    if totals.get("valid", 0) == 0 and not args.dry_run:
        print("\n[ABORT] Zero valid rows after validation — not proceeding to inference")
        _write_summary(date_str, pipeline_summary)
        sys.exit(1)

    # ── Stage 3: Batch Inference ──────────────────────────────────────────────
    from scripts.run_daily_predictions import run_predictions
    infer_result = _run_stage(
        "Batch Inference",
        run_predictions,
        date_str, regions,
        batch_size=args.batch_size,
        dry_run=args.dry_run,
        resume=args.resume,
    )
    pipeline_summary["stages"]["inference"] = infer_result

    # ── Summary ───────────────────────────────────────────────────────────────
    pipeline_summary["elapsed_total_s"] = round(time.time() - t_total, 1)
    pipeline_summary["completed_at"] = datetime.utcnow().isoformat() + "Z"
    _write_summary(date_str, pipeline_summary)

    n_success = sum(
        1 for v in pipeline_summary["stages"].values() if v.get("status") == "success"
    )
    n_fail = sum(
        1 for v in pipeline_summary["stages"].values() if v.get("status") == "failed"
    )
    print(f"\n{'='*60}")
    print(f"  PIPELINE DONE: {n_success} stages OK, {n_fail} failed")
    print(f"  Total time: {pipeline_summary['elapsed_total_s']}s")
    if infer_result.get("status") == "success":
        map_path = DATA_DIR / date_str / "predictions" / "map_recommendations.json"
        print(f"  Map JSON: {map_path}")
    print(f"{'='*60}")

    if n_fail > 0:
        sys.exit(1)


def _invoke_script(script_name: str, date_str: str, regions: list, dry_run: bool) -> dict:
    """Fallback: call script via subprocess."""
    import subprocess
    script_path = PROJECT_ROOT / "scripts" / script_name
    cmd = [sys.executable, str(script_path), "--date", date_str,
           "--regions", ",".join(regions)]
    if dry_run:
        cmd.append("--dry-run")
    result = subprocess.run(cmd, capture_output=False)
    if result.returncode != 0:
        raise RuntimeError(f"{script_name} exited with code {result.returncode}")
    return {"returncode": result.returncode}


def _write_summary(date_str: str, summary: dict) -> None:
    path = DATA_DIR / date_str / "pipeline_run_summary.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    print(f"\n[SUMMARY] Written to {path}")


if __name__ == "__main__":
    main()
