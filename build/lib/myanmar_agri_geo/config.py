"""Configuration loading and path resolution for the dataset builder."""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Any

import yaml

from .crop_profiles import CROP_PROFILES


OFFICIAL_CHIRPS_V3_DAILY_RNL = "UCSB-CHC/CHIRPS/V3/DAILY_RNL"


class ConfigError(ValueError):
    """Raised when a required project setting is absent or invalid."""


def load_config(path: str | Path) -> tuple[dict[str, Any], Path]:
    """Load a YAML configuration and return it together with its project root.

    The distributed configuration lives in ``<project>/config/default.yaml``.
    For a custom configuration, relative data paths are resolved against the
    parent of its ``config`` directory when present, otherwise its own parent.
    """

    config_path = Path(path).expanduser().resolve()
    if not config_path.is_file():
        raise ConfigError(f"Configuration file does not exist: {config_path}")
    with config_path.open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle) or {}
    if not isinstance(config, dict):
        raise ConfigError("Top-level YAML configuration must be a mapping")

    for section in ("project", "earth_engine", "sources", "soilgrids", "chirps_v3", "labels", "quality"):
        if section not in config or not isinstance(config[section], dict):
            raise ConfigError(f"Missing mapping section: {section}")
    if "resource_audit" in config and not isinstance(config["resource_audit"], dict):
        raise ConfigError("resource_audit must be a mapping when supplied")
    if "climate_context" in config and not isinstance(
        config["climate_context"], dict
    ):
        raise ConfigError("climate_context must be a mapping when supplied")
    admin1_scope = config["earth_engine"].get("admin1_scope")
    if admin1_scope is not None and (
        not isinstance(admin1_scope, str) or not admin1_scope.strip()
    ):
        raise ConfigError(
            "earth_engine.admin1_scope must be a non-empty exact FAO GAUL "
            "ADM1_NAME when supplied"
        )

    project = config["project"]
    release_scope = project.get("scope_admin1")
    if (
        release_scope
        and admin1_scope
        and str(release_scope).strip() != str(admin1_scope).strip()
    ):
        raise ConfigError(
            "project.scope_admin1 and earth_engine.admin1_scope must match "
            "exactly for a directly exportable regional release"
        )
    for key in ("iso3", "start_month", "end_month", "grid_size_m"):
        if key not in project:
            raise ConfigError(f"Missing project.{key}")
    if project["iso3"] != "MMR":
        raise ConfigError("This pipeline is intentionally scoped to ISO3 MMR")
    if int(project["grid_size_m"]) <= 0:
        raise ConfigError("project.grid_size_m must be positive")
    if str(project["start_month"]) > str(project["end_month"]):
        raise ConfigError("project.start_month must not be after end_month")

    sampling_geometry = str(
        config["earth_engine"].get("sampling_geometry", "centroid")
    )
    if sampling_geometry not in {"centroid", "cell"}:
        raise ConfigError(
            "earth_engine.sampling_geometry must be 'centroid' or 'cell'"
        )
    feature_set = str(config["earth_engine"].get("feature_set", "split"))
    if feature_set not in {"split", "all", "dynamic", "static"}:
        raise ConfigError(
            "earth_engine.feature_set must be split, all, dynamic, or static"
        )

    try:
        max_missing = float(config["quality"]["max_missing_feature_fraction"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ConfigError("quality.max_missing_feature_fraction must be a number from 0 through 1") from exc
    if not 0.0 <= max_missing <= 1.0:
        raise ConfigError("quality.max_missing_feature_fraction must be a number from 0 through 1")

    try:
        min_usable = float(config["quality"].get("min_usable_row_fraction", 1.0))
    except (TypeError, ValueError) as exc:
        raise ConfigError("quality.min_usable_row_fraction must be a number from 0 through 1") from exc
    if not 0.0 <= min_usable <= 1.0:
        raise ConfigError("quality.min_usable_row_fraction must be a number from 0 through 1")

    try:
        rule_confidence = float(config["labels"]["default_rule_confidence"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ConfigError("labels.default_rule_confidence must be a number in (0, 0.50]") from exc
    if not 0.0 < rule_confidence <= 0.50:
        raise ConfigError("labels.default_rule_confidence must be a number in (0, 0.50]")

    crops = config["labels"].get("crops")
    if not isinstance(crops, list) or not crops:
        raise ConfigError("labels.crops must be a non-empty list")
    if any(not isinstance(crop, str) or not crop.strip() for crop in crops):
        raise ConfigError("labels.crops entries must be non-empty strings")
    if len(crops) != len(set(crops)):
        raise ConfigError("labels.crops must not contain duplicates")
    unknown_crops = sorted(set(crops).difference(CROP_PROFILES))
    if unknown_crops:
        raise ConfigError(
            "labels.crops contains unsupported crop profiles: "
            + ", ".join(unknown_crops)
        )

    climate_context = config.get("climate_context", {})
    if bool(climate_context.get("enabled", False)):
        configured_chirps = str(config["sources"].get("chirps", "")).strip()
        if configured_chirps != OFFICIAL_CHIRPS_V3_DAILY_RNL:
            raise ConfigError(
                "climate_context.enabled requires sources.chirps to be "
                f"{OFFICIAL_CHIRPS_V3_DAILY_RNL!r}; received "
                f"{configured_chirps!r}"
            )
        try:
            baseline_start = int(
                climate_context.get("baseline_start_year", 1991)
            )
            baseline_end = int(
                climate_context.get("baseline_end_year", 2020)
            )
        except (TypeError, ValueError) as exc:
            raise ConfigError(
                "climate_context baseline years must be integers"
            ) from exc
        if (baseline_start, baseline_end) != (1991, 2020):
            raise ConfigError(
                "climate_context must use the fixed 1991-2020 normal period"
            )

    root = config_path.parent.parent if config_path.parent.name == "config" else config_path.parent
    return config, root


def resolved_config(config: dict[str, Any], project_root: Path) -> dict[str, Any]:
    """Return a copy with known local paths converted to absolute strings."""

    result = deepcopy(config)
    for key in ("output_dir", "raw_gee_dir", "chirps_v3_cache_dir", "soil_cache_dir", "observed_labels_path"):
        value = result["project"].get(key)
        if value:
            candidate = Path(str(value)).expanduser()
            result["project"][key] = str(candidate if candidate.is_absolute() else project_root / candidate)
    for key in ("external_raw_dir", "external_processed_dir"):
        value = result.get("resource_audit", {}).get(key)
        if value:
            candidate = Path(str(value)).expanduser()
            result["resource_audit"][key] = str(candidate if candidate.is_absolute() else project_root / candidate)
    return result


def months_inclusive(start_month: str, end_month: str) -> list[str]:
    """Return ISO ``YYYY-MM`` values including both endpoints."""

    try:
        start_year, start_m = (int(part) for part in start_month.split("-"))
        end_year, end_m = (int(part) for part in end_month.split("-"))
    except ValueError as exc:
        raise ConfigError("Months must use YYYY-MM") from exc
    if not 1 <= start_m <= 12 or not 1 <= end_m <= 12:
        raise ConfigError("Month number must be from 01 through 12")
    output: list[str] = []
    year, month = start_year, start_m
    while (year, month) <= (end_year, end_m):
        output.append(f"{year:04d}-{month:02d}")
        month += 1
        if month == 13:
            year, month = year + 1, 1
    return output
