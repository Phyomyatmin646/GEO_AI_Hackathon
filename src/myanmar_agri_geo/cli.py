"""Command-line workflow for the Myanmar agricultural Geo-CSV pipeline."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Sequence

from .config import load_config, months_inclusive, resolved_config
from .chirps_v3 import download_monthly_cache, write_download_manifest
from .manifest import write_json
from .pipeline import assemble_dataset, describe_assembly_plan
from .resources import write_collabhub_resource_audit, write_external_feature_manifest
from .soilgrids import write_vrt_source_manifest


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
    defaults = DatasetIds()
    datasets = DatasetIds(
        gaul_level0=sources.get("fao_gaul_level0", defaults.gaul_level0),
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
    months = months_inclusive(start, _previous_month_string(end_exclusive))
    tile_ids = args.tile_ids or None
    preflight = {
        "start_month": start,
        "end_month_exclusive": end_exclusive,
        "months": len(months),
        "tile_ids": tile_ids,
        "task_count": len(months) * (len(tile_ids) if tile_ids else 1),
        "destination": args.destination,
        "drive_folder": args.folder or config["earth_engine"]["drive_folder"],
        "use_gee_community_soilgrids": bool(config["soilgrids"].get("use_gee_community_assets", True)),
        "will_start_tasks": bool(args.start_tasks),
    }
    if args.dry_run:
        print(json.dumps(preflight, indent=2, ensure_ascii=False))
        return 0
    if not args.start_tasks:
        raise SystemExit("Refusing a non-persistent task creation. Re-run with --start-tasks after --dry-run.")
    if args.destination == "gcs" and not args.bucket:
        raise SystemExit("--bucket is required for --destination gcs")

    from .gee_backend import create_monthly_export_tasks, initialize_earth_engine

    ee = initialize_earth_engine(config["earth_engine"].get("project"))
    tasks = create_monthly_export_tasks(
        start,
        end_exclusive,
        tile_ids=tile_ids,
        config=_gee_config(config),
        destination=args.destination,
        folder=args.folder or config["earth_engine"]["drive_folder"],
        bucket=args.bucket,
        description_prefix=args.prefix or config["project"]["name"],
        include_gee_soil=bool(config["soilgrids"].get("use_gee_community_assets", True)),
        start_tasks=True,
        ee_module=ee,
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
        start_year_month=config["project"]["start_month"],
        end_year_month=config["project"]["end_month"],
    )
    report_path = Path(args.report) if args.report else Path(config["project"]["output_dir"]) / "qa_report.json"
    write_qa_report(report, report_path)
    print(json.dumps({"valid": report["valid"], "errors": report["errors"], "warnings": report["warnings"], "report": str(report_path)}, ensure_ascii=False))
    return 0 if report["valid"] else 1


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
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Run the command-line workflow and return a conventional exit code."""

    args = _build_parser().parse_args(argv)
    return int(args.handler(args))


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
