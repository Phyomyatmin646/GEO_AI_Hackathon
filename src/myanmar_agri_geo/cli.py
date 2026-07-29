"""Command-line workflow for the Myanmar agricultural Geo-CSV pipeline."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Sequence

from .config import load_config, months_inclusive, resolved_config
from .chirps_v3 import download_monthly_cache, write_download_manifest
from .manifest import write_json
from .pipeline import assemble_dataset, describe_assembly_plan
from .resources import write_collabhub_resource_audit, write_external_feature_manifest
from .soilgrids import write_vrt_source_manifest


MAX_EXPORT_TASKS_PER_SUBMISSION = 24


def _next_month_string(value: str) -> str:
    year, month = (int(part) for part in value.split("-"))
    if month == 12:
        return f"{year + 1:04d}-01"
    return f"{year:04d}-{month + 1:02d}"


def _load_resolved(path: str) -> tuple[dict[str, Any], Path]:
    config, root = load_config(path)
    return resolved_config(config, root), root


def _gee_config(config: dict[str, Any]) -> Any:
    """Translate user YAML settings to the lazy Earth Engine backend config."""

    from .gee_backend import DatasetIds, GEEConfig

    sources = config["sources"]
    climate_context = config.get("climate_context", {})
    defaults = DatasetIds()
    datasets = DatasetIds(
        gaul_level0=sources.get("fao_gaul_level0", defaults.gaul_level0),
        gaul_level1=sources.get("fao_gaul_level1", defaults.gaul_level1),
        sentinel2_sr_harmonized=sources.get("sentinel2", defaults.sentinel2_sr_harmonized),
        sentinel1_grd=sources.get("sentinel1", defaults.sentinel1_grd),
        chirps_daily=sources.get("chirps", defaults.chirps_daily),
        era5_land_daily_aggregated=sources.get("era5_land", defaults.era5_land_daily_aggregated),
        srtm_elevation=sources.get("srtm", defaults.srtm_elevation),
        jrc_global_surface_water=sources.get("jrc_surface_water", defaults.jrc_global_surface_water),
    )
    return GEEConfig(
        datasets=datasets,
        grid_crs=config["project"]["grid_crs"],
        grid_size_m=int(config["project"]["grid_size_m"]),
        sample_scale_m=int(config["earth_engine"]["export_scale_m"]),
        tile_size_m=int(config["earth_engine"].get("tile_size_m", 100_000)),
        reduce_regions_tile_scale=int(
            config["earth_engine"].get("reduce_regions_tile_scale", 4)
        ),
        water_distance_scale_m=int(
            config["earth_engine"].get("water_distance_scale_m", 1_000)
        ),
        sampling_geometry=str(
            config["earth_engine"].get("sampling_geometry", "centroid")
        ),
        include_admin1=bool(config["earth_engine"].get("include_admin1", False)),
        include_climate_context=bool(climate_context.get("enabled", False)),
        climate_baseline_start_year=int(
            climate_context.get("baseline_start_year", 1991)
        ),
        climate_baseline_end_year=int(
            climate_context.get("baseline_end_year", 2020)
        ),
    )


def command_plan(args: argparse.Namespace) -> int:
    config, _ = _load_resolved(args.config)
    plan = describe_assembly_plan(config)
    plan["monthly_export_count_without_tiling"] = len(
        months_inclusive(config["project"]["start_month"], config["project"]["end_month"])
    )
    plan["gee_end_month_exclusive"] = _next_month_string(config["project"]["end_month"])
    plan["chirps_v3_cache_dir"] = config["project"]["chirps_v3_cache_dir"]
    plan["chirps_v3_required"] = bool(config["chirps_v3"].get("require_complete_cache", True))
    print(json.dumps(plan, indent=2, ensure_ascii=False))
    return 0


def command_prepare_soil(args: argparse.Namespace) -> int:
    config, _ = _load_resolved(args.config)
    soil_config = dict(config["soilgrids"])
    soil_config["webdav_base_url"] = config["sources"]["soilgrids_webdav"]
    destination = write_vrt_source_manifest(soil_config, config["project"]["soil_cache_dir"])
    print(destination)
    return 0


def command_prepare_chirps(args: argparse.Namespace) -> int:
    """Write or explicitly populate the official final-CHIRPS-v3 cache."""

    config, _ = _load_resolved(args.config)
    configured_months = months_inclusive(config["project"]["start_month"], config["project"]["end_month"])
    start_month = args.start_month or config["project"]["start_month"]
    end_month = args.end_month or config["project"]["end_month"]
    months = months_inclusive(start_month, end_month)
    if start_month < config["project"]["start_month"] or end_month > config["project"]["end_month"]:
        raise SystemExit(
            "Requested CHIRPS months must stay inside the configured project period "
            f"{config['project']['start_month']} through {config['project']['end_month']}."
        )
    cache_dir = config["project"]["chirps_v3_cache_dir"]
    base_url = config["sources"]["chirps_v3_monthly_base_url"]
    manifest = write_download_manifest(configured_months, cache_dir=cache_dir, base_url=base_url)
    if not args.download:
        print(manifest)
        return 0
    files = download_monthly_cache(
        months,
        cache_dir=cache_dir,
        base_url=base_url,
        timeout_seconds=int(config["chirps_v3"]["download_timeout_seconds"]),
        overwrite=args.overwrite,
    )
    # download_monthly_cache writes a manifest for its selected slice. Restore
    # the full project-period manifest so cache completeness stays auditable.
    manifest = write_download_manifest(configured_months, cache_dir=cache_dir, base_url=base_url)
    print(
        json.dumps(
            {
                "downloaded_or_cached_files": len(files),
                "selected_start_month": start_month,
                "selected_end_month": end_month,
                "manifest": str(manifest),
            },
            ensure_ascii=False,
        )
    )
    return 0


def command_resource_audit(args: argparse.Namespace) -> int:
    """Write resource-decision metadata without downloading or merging data."""

    config, _ = _load_resolved(args.config)
    destination = Path(args.output_dir or config["project"]["output_dir"])
    audit_path = write_collabhub_resource_audit(destination / "collabhub_resource_audit.csv")
    feature_path = write_external_feature_manifest(destination / "external_feature_manifest.csv")
    print(
        json.dumps(
            {
                "resource_audit": str(audit_path),
                "external_feature_manifest": str(feature_path),
                "note": "Metadata only: no external source values were downloaded or merged.",
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


def command_ee_auth_check(args: argparse.Namespace) -> int:
    """Check existing Earth Engine authorization without starting an export."""

    config, _ = _load_resolved(args.config)
    from .gee_backend import initialize_earth_engine

    try:
        initialize_earth_engine(config["earth_engine"].get("project"))
    except RuntimeError as exc:
        print(
            json.dumps(
                {
                    "earth_engine_ready": False,
                    "next_step": "Run 'earthengine authenticate' yourself, then rerun this command.",
                    "message": str(exc),
                },
                ensure_ascii=False,
            )
        )
        return 1
    print(
        json.dumps(
            {
                "earth_engine_ready": True,
                "project": config["earth_engine"].get("project"),
                "next_step": "Run gee-export --dry-run, review it, then use --start-tasks.",
            },
            ensure_ascii=False,
        )
    )
    return 0


def command_gee_export(args: argparse.Namespace) -> int:
    config, _ = _load_resolved(args.config)
    start = args.start or config["project"]["start_month"]
    end_exclusive = args.end or _next_month_string(config["project"]["end_month"])
    configured_start = config["project"]["start_month"]
    configured_end = config["project"]["end_month"]
    if end_exclusive <= start:
        raise SystemExit(
            "Earth Engine export end month is exclusive and must be later "
            "than the start month."
        )
    selected_end = _previous_month_string(end_exclusive)
    if start < configured_start or selected_end > configured_end:
        raise SystemExit(
            "Refusing to export months outside this release contract. "
            f"Configured period is {configured_start} through {configured_end}; "
            f"requested period is {start} through {selected_end}. Create a new "
            "versioned config for a wider period."
        )
    configured_admin1 = config["earth_engine"].get("admin1_scope")
    admin1_scope = args.admin1 or configured_admin1
    release_scope = config["project"].get("scope_admin1")
    if release_scope and args.admin1 and args.admin1 != configured_admin1:
        raise SystemExit(
            "Refusing an ADM1 override that disagrees with this regional "
            f"release contract. Configured export scope is "
            f"{configured_admin1!r}; requested scope is {args.admin1!r}."
        )
    if release_scope and args.prefix:
        normalized_scope = "".join(
            character.casefold()
            for character in str(release_scope)
            if character.isalnum()
        )
        normalized_prefix = "".join(
            character.casefold()
            for character in args.prefix
            if character.isalnum()
        )
        if normalized_scope not in normalized_prefix:
            raise SystemExit(
                "Refusing an export prefix that omits this regional release "
                f"scope {release_scope!r}. Task filenames are part of the "
                "raw-input provenance guard."
            )
    if release_scope and not admin1_scope:
        raise SystemExit(
            "Refusing to submit a nationwide export from a regional release "
            "config. Set earth_engine.admin1_scope to an exact FAO GAUL "
            "ADM1_NAME, pass --admin1, or use separate part configs for a "
            "composite region such as Bago."
        )
    months = months_inclusive(start, selected_end)
    tile_ids = args.tile_ids or None
    feature_set = args.feature_set or config["earth_engine"].get("feature_set", "split")
    if feature_set not in {"split", "all", "dynamic", "static"}:
        raise SystemExit("earth_engine.feature_set must be split, all, dynamic, or static")
    spatial_shards = len(tile_ids) if tile_ids else 1
    monthly_task_count = (
        len(months) * spatial_shards
        if feature_set in {"split", "all", "dynamic"}
        else 0
    )
    static_task_count = spatial_shards if feature_set in {"split", "static"} else 0
    climate_enabled = bool(
        config.get("climate_context", {}).get("enabled", False)
    )
    preflight = {
        "start_month": start,
        "end_month_exclusive": end_exclusive,
        "months": len(months),
        "tile_ids": tile_ids,
        "admin1_scope": admin1_scope,
        "feature_set": feature_set,
        "sampling_geometry": config["earth_engine"].get(
            "sampling_geometry", "centroid"
        ),
        "monthly_task_count": monthly_task_count,
        "static_task_count": static_task_count,
        "task_count": monthly_task_count + static_task_count,
        "submission_task_limit": MAX_EXPORT_TASKS_PER_SUBMISSION,
        "destination": args.destination,
        "drive_folder": args.folder or config["earth_engine"]["drive_folder"],
        "use_gee_community_soilgrids": bool(config["soilgrids"].get("use_gee_community_assets", True)),
        "climate_context": {
            "enabled": climate_enabled,
            "baseline_period": (
                f"{config.get('climate_context', {}).get('baseline_start_year', 1991)}-"
                f"{config.get('climate_context', {}).get('baseline_end_year', 2020)}"
                if climate_enabled
                else None
            ),
            "interpretation": (
                "historical_context_not_attribution_forecast_or_projection"
                if climate_enabled
                else "not_requested"
            ),
        },
        "will_start_tasks": bool(args.start_tasks),
    }
    if args.dry_run:
        print(json.dumps(preflight, indent=2, ensure_ascii=False))
        return 0
    if not args.start_tasks:
        raise SystemExit("Refusing a non-persistent task creation. Re-run with --start-tasks after --dry-run.")
    if preflight["task_count"] > MAX_EXPORT_TASKS_PER_SUBMISSION:
        raise SystemExit(
            "Refusing an oversized Earth Engine submission containing "
            f"{preflight['task_count']} tasks. Submit at most "
            f"{MAX_EXPORT_TASKS_PER_SUBMISSION} tasks at a time by using a "
            "versioned regional config plus bounded --start/--end periods. "
            "Export static features once, then submit dynamic months in "
            "separate batches."
        )
    if args.destination == "gcs" and not args.bucket:
        raise SystemExit("--bucket is required for --destination gcs")

    from .gee_backend import (
        create_5km_grid,
        create_monthly_export_tasks,
        create_static_export_tasks,
        get_myanmar_admin1_region,
        initialize_earth_engine,
    )

    ee = initialize_earth_engine(config["earth_engine"].get("project"))
    gee_config = _gee_config(config)
    region = (
        get_myanmar_admin1_region(
            admin1_scope, ee_module=ee, datasets=gee_config.datasets
        )
        if admin1_scope
        else None
    )
    grid = create_5km_grid(region, config=gee_config, ee_module=ee)
    prefix = args.prefix or config["project"]["name"]
    if args.admin1:
        scope_slug = "".join(
            character.lower() if character.isalnum() else "_"
            for character in args.admin1
        ).strip("_")
        prefix = f"{prefix}_{scope_slug}"
    common = {
        "grid": grid,
        "region": region,
        "tile_ids": tile_ids,
        "config": gee_config,
        "destination": args.destination,
        "folder": args.folder or config["earth_engine"]["drive_folder"],
        "bucket": args.bucket,
        "description_prefix": prefix,
        "include_gee_soil": bool(
            config["soilgrids"].get("use_gee_community_assets", True)
        ),
        "start_tasks": True,
        "ee_module": ee,
    }
    tasks: list[Any] = []
    if feature_set in {"split", "static"}:
        tasks.extend(create_static_export_tasks(**common))
    if feature_set in {"split", "all", "dynamic"}:
        monthly_feature_set = "dynamic" if feature_set == "split" else feature_set
        tasks.extend(
            create_monthly_export_tasks(
                start,
                end_exclusive,
                feature_set=monthly_feature_set,
                **common,
            )
        )
    # Task IDs are obtained after starting, so this file lets an operator audit
    # the planned exports without attempting to manage authentication for them.
    task_records: list[dict[str, Any]] = []
    for task in tasks:
        try:
            status = task.status()
        except Exception:
            status = {}
        task_records.append(
            {
                "id": status.get("id"),
                "description": status.get("description"),
                "state": status.get("state"),
            }
        )
    plan_path = Path(config["project"]["output_dir"]) / "gee_export_task_plan.json"
    write_json(plan_path, {**preflight, "tasks": task_records})
    print(f"Started {len(tasks)} Earth Engine export task(s).")
    print(plan_path)
    return 0


def _previous_month_string(value: str) -> str:
    year, month = (int(part) for part in value.split("-"))
    if month == 1:
        return f"{year - 1:04d}-12"
    return f"{year:04d}-{month - 1:02d}"


def command_assemble(args: argparse.Namespace) -> int:
    config, _ = _load_resolved(args.config)
    artifacts = assemble_dataset(
        config,
        raw_dir=args.raw_dir,
        output_dir=args.output_dir,
        write_plain_csv=bool(args.plain_csv),
    )
    print(json.dumps({key: str(value) for key, value in artifacts.items()}, indent=2, ensure_ascii=False))
    return 0


def command_validate(args: argparse.Namespace) -> int:
    config, _ = _load_resolved(args.config)
    from .validation import validate_dataset, write_qa_report

    dataset_path = Path(args.input) if args.input else Path(config["project"]["output_dir"]) / f"{config['project']['name']}.csv.gz"
    report = validate_dataset(
        dataset_path,
        expected_crops=config["labels"]["crops"],
        strict_schema=args.strict,
        suitability_threshold=float(config["labels"]["suitability_threshold"]),
        max_feature_missing_fraction=float(config["quality"]["max_missing_feature_fraction"]),
        min_usable_row_fraction=float(
            config["quality"].get("min_usable_row_fraction", 1.0)
        ),
        require_climate_context=bool(
            config.get("climate_context", {}).get("enabled", False)
        ),
        start_year_month=config["project"]["start_month"],
        end_year_month=config["project"]["end_month"],
    )
    report_path = Path(args.report) if args.report else Path(config["project"]["output_dir"]) / "qa_report.json"
    write_qa_report(report, report_path)
    print(json.dumps({"valid": report["valid"], "errors": report["errors"], "warnings": report["warnings"], "report": str(report_path)}, ensure_ascii=False))
    return 0 if report["valid"] else 1


def command_observed_label_template(args: argparse.Namespace) -> int:
    from .observed_labels import write_observed_label_template

    destination = write_observed_label_template(args.output)
    print(destination)
    return 0


def command_validate_observed_labels(args: argparse.Namespace) -> int:
    config, _ = _load_resolved(args.config)
    from .observed_labels import validate_observed_label_file

    output_dir = Path(args.output_dir or config["project"]["output_dir"])
    report = validate_observed_label_file(
        args.input,
        accepted_path=output_dir / "observed_labels_accepted.csv",
        rejected_path=output_dir / "observed_labels_rejected.csv",
        report_path=output_dir / "observed_labels_qa_report.json",
        crops=config["labels"]["crops"],
        start_year_month=config["project"]["start_month"],
        end_year_month=config["project"]["end_month"],
        min_latitude=float(config["quality"]["min_latitude"]),
        max_latitude=float(config["quality"]["max_latitude"]),
        min_longitude=float(config["quality"]["min_longitude"]),
        max_longitude=float(config["quality"]["max_longitude"]),
        grid_size_m=int(config["project"]["grid_size_m"]),
        grid_crs=str(config["project"]["grid_crs"]),
    )
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if report["valid"] else 1


def command_official_stats_template(args: argparse.Namespace) -> int:
    from .official_stats import write_official_stats_template

    destination = write_official_stats_template(args.output)
    print(destination)
    return 0


def command_compare_official_stats(args: argparse.Namespace) -> int:
    config, _ = _load_resolved(args.config)
    from .official_stats import compare_official_statistics

    output_dir = Path(args.output_dir or config["project"]["output_dir"])
    report = compare_official_statistics(
        args.predictions,
        args.official,
        comparison_path=output_dir / "official_stats_comparison_rows.csv",
        report_path=output_dir / "official_stats_comparison_report.json",
    )
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if report["valid"] else 1


def command_download_drive_exports(args: argparse.Namespace) -> int:
    config, _ = _load_resolved(args.config)
    from .drive_exports import download_drive_exports

    records = download_drive_exports(
        folder_id=args.folder_id,
        destination_dir=args.output_dir or config["project"]["raw_gee_dir"],
        filename_prefix=args.prefix,
        overwrite=bool(args.overwrite),
    )
    manifest_path = Path(
        args.manifest
        or Path(config["project"]["output_dir"])
        / "drive_export_download_manifest.json"
    )
    write_json(
        manifest_path,
        {
            "manifest_version": "1.0",
            "processing_timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "drive_folder_id": args.folder_id,
            "filename_prefix": args.prefix,
            "destination_dir": str(
                Path(args.output_dir or config["project"]["raw_gee_dir"])
            ),
            "files": records,
        },
    )
    print(
        json.dumps(
            {
                "matched_files": len(records),
                "downloaded_files": sum(
                    record["status"] == "downloaded" for record in records
                ),
                "verified_existing_files": sum(
                    record["status"] == "verified_existing"
                    for record in records
                ),
                "manifest": str(manifest_path),
                "files": records,
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0 if records else 1


def command_build_web_pilot(args: argparse.Namespace) -> int:
    from .pilot_bundle import build_web_pilot_bundle

    bundle = build_web_pilot_bundle(
        args.input,
        qa_report_path=args.qa_report,
        source_manifest_path=args.source_manifest,
        output_path=args.output,
        max_cells=args.max_cells,
        top_crops=args.top_crops,
    )
    print(
        json.dumps(
            {
                "output": str(args.output),
                "release_id": bundle["meta"]["releaseId"],
                "cells": len(bundle["cells"]),
                "scored_cells": bundle["meta"]["scoredCellCount"],
                "abstained_cells": bundle["meta"]["abstainedCellCount"],
                "source_csv_sha256": bundle["meta"]["sourceCsvSha256"],
                "qa_report_sha256": bundle["meta"]["qaReportSha256"],
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="myanmar-agri-geo",
        description="Build a provenance-aware Myanmar crop-suitability Geo-CSV dataset.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    def config_arg(subparser: argparse.ArgumentParser) -> None:
        subparser.add_argument("--config", default="config/default.yaml", help="YAML configuration path")

    plan = subparsers.add_parser("plan", help="Print the side-effect-free dataset/export plan")
    config_arg(plan)
    plan.set_defaults(handler=command_plan)

    soil = subparsers.add_parser("prepare-soil", help="Create a SoilGrids WebDAV/local-cache source manifest")
    config_arg(soil)
    soil.set_defaults(handler=command_prepare_soil)

    chirps = subparsers.add_parser("prepare-chirps", help="Plan or explicitly download the official CHIRPS v3 monthly cache")
    config_arg(chirps)
    chirps.add_argument("--start-month", help="Inclusive YYYY-MM cache slice; defaults to project start")
    chirps.add_argument("--end-month", help="Inclusive YYYY-MM cache slice; defaults to project end")
    chirps.add_argument("--download", action="store_true", help="Download the configured monthly CHIRPS v3 files into the local cache")
    chirps.add_argument("--overwrite", action="store_true", help="Re-download cache files that already exist")
    chirps.set_defaults(handler=command_prepare_chirps)

    resource_audit = subparsers.add_parser(
        "resource-audit",
        help="Write the CollabHub audit and pending external-feature manifest",
    )
    config_arg(resource_audit)
    resource_audit.add_argument("--output-dir", help="Override directory for metadata CSVs")
    resource_audit.set_defaults(handler=command_resource_audit)

    auth_check = subparsers.add_parser("ee-auth-check", help="Check saved Earth Engine authorization without starting tasks")
    config_arg(auth_check)
    auth_check.set_defaults(handler=command_ee_auth_check)

    export = subparsers.add_parser("gee-export", help="Preflight or start monthly GEE table-export tasks")
    config_arg(export)
    export.add_argument("--start", help="Inclusive export month; defaults to config")
    export.add_argument("--end", help="Exclusive export month; defaults to month after config end")
    export.add_argument("--dry-run", action="store_true", help="Print task plan without using Earth Engine")
    export.add_argument("--start-tasks", action="store_true", help="Explicitly start all tasks after preflight")
    export.add_argument("--destination", choices=("drive", "gcs"), default="drive")
    export.add_argument("--folder", help="Google Drive export folder")
    export.add_argument("--bucket", help="Cloud Storage bucket for GCS exports")
    export.add_argument("--prefix", help="Export-task description prefix")
    export.add_argument(
        "--feature-set",
        choices=("split", "all", "dynamic", "static"),
        help="split exports static features once plus monthly dynamic features",
    )
    export.add_argument(
        "--admin1",
        help="Optional exact FAO GAUL ADM1_NAME for a compute-bounded regional pilot",
    )
    export.add_argument("--tile-id", action="append", dest="tile_ids", help="Repeat for selected 100 km grid shards")
    export.set_defaults(handler=command_gee_export)

    assemble = subparsers.add_parser("assemble", help="Build CSV, Parquet, QA, manifest, and split outputs from completed GEE CSVs")
    config_arg(assemble)
    assemble.add_argument("--raw-dir", help="Override directory containing downloaded GEE CSV/CSV.GZ exports")
    assemble.add_argument("--output-dir", help="Override output directory")
    assemble.add_argument(
        "--plain-csv",
        action="store_true",
        help="Also write an uncompressed .csv compatibility file (can use several GB)",
    )
    assemble.set_defaults(handler=command_assemble)

    validate = subparsers.add_parser("validate", help="Validate a final primary table and write JSON QA")
    config_arg(validate)
    validate.add_argument("--input", help="CSV/CSV.GZ/Parquet file; defaults to configured final CSV")
    validate.add_argument("--report", help="Path for QA JSON; defaults to configured output directory")
    validate.add_argument("--strict", action="store_true", help="Require the complete published schema")
    validate.set_defaults(handler=command_validate)

    observed_template = subparsers.add_parser(
        "observed-label-template",
        help="Write an empty production observed-label CSV contract",
    )
    observed_template.add_argument(
        "--output",
        default="data/templates/observed_labels_template.csv",
        help="Destination CSV path",
    )
    observed_template.set_defaults(handler=command_observed_label_template)

    observed_validate = subparsers.add_parser(
        "validate-observed-labels",
        help="Gate real crop observations by provenance, review, privacy, and split policy",
    )
    config_arg(observed_validate)
    observed_validate.add_argument("--input", required=True, help="Observed-label CSV")
    observed_validate.add_argument(
        "--output-dir",
        help="Accepted/rejected CSV and JSON QA destination",
    )
    observed_validate.set_defaults(handler=command_validate_observed_labels)

    stats_template = subparsers.add_parser(
        "official-stats-template",
        help="Write an empty official aggregate crop-statistics CSV contract",
    )
    stats_template.add_argument(
        "--output",
        default="data/templates/official_crop_stats_template.csv",
        help="Destination CSV path",
    )
    stats_template.set_defaults(handler=command_official_stats_template)

    stats_compare = subparsers.add_parser(
        "compare-official-stats",
        help="Compare admin/year/crop predictions to official aggregate statistics",
    )
    config_arg(stats_compare)
    stats_compare.add_argument("--predictions", required=True)
    stats_compare.add_argument("--official", required=True)
    stats_compare.add_argument("--output-dir")
    stats_compare.set_defaults(handler=command_compare_official_stats)

    drive_download = subparsers.add_parser(
        "download-drive-exports",
        help="Download completed Earth Engine CSV exports from Drive into data/raw/gee",
    )
    config_arg(drive_download)
    drive_download.add_argument("--folder-id", required=True)
    drive_download.add_argument("--prefix", help="Only download filenames containing this prefix")
    drive_download.add_argument("--output-dir")
    drive_download.add_argument(
        "--manifest",
        help="Download-receipt JSON; defaults to the configured output directory",
    )
    drive_download.add_argument("--overwrite", action="store_true")
    drive_download.set_defaults(handler=command_download_drive_exports)

    web_pilot = subparsers.add_parser(
        "build-web-pilot",
        help="Build compact web JSON from a QA-approved real regional CSV",
    )
    web_pilot.add_argument("--input", required=True, help="QA-approved final CSV")
    web_pilot.add_argument("--qa-report", required=True, help="QA JSON for the CSV")
    web_pilot.add_argument(
        "--source-manifest",
        required=True,
        help="Source/provenance manifest containing the CSV SHA-256",
    )
    web_pilot.add_argument(
        "--output",
        default="web/data/pilot_ayeyawaddy_2018_01.json",
        help="Destination compact JSON bundle",
    )
    web_pilot.add_argument(
        "--max-cells",
        type=int,
        default=None,
        help="Optional deterministic sample size; omitted means all QA-approved cells",
    )
    web_pilot.add_argument(
        "--top-crops",
        type=int,
        default=3,
        help="Number of provisional crop recommendations per scored cell",
    )
    web_pilot.set_defaults(handler=command_build_web_pilot)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Run the command-line workflow and return a conventional exit code."""

    args = _build_parser().parse_args(argv)
    return int(args.handler(args))


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
