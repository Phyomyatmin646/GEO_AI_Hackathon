"""Configuration loading and path resolution for the dataset builder."""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Any

import yaml


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

    project = config["project"]
    for key in ("iso3", "start_month", "end_month", "grid_size_m"):
        if key not in project:
            raise ConfigError(f"Missing project.{key}")
    if project["iso3"] != "MMR":
        raise ConfigError("This pipeline is intentionally scoped to ISO3 MMR")
    if int(project["grid_size_m"]) <= 0:
        raise ConfigError("project.grid_size_m must be positive")
    if str(project["start_month"]) > str(project["end_month"]):
        raise ConfigError("project.start_month must not be after end_month")

    try:
        max_missing = float(config["quality"]["max_missing_feature_fraction"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ConfigError("quality.max_missing_feature_fraction must be a number from 0 through 1") from exc
    if not 0.0 <= max_missing <= 1.0:
        raise ConfigError("quality.max_missing_feature_fraction must be a number from 0 through 1")

    try:
        rule_confidence = float(config["labels"]["default_rule_confidence"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ConfigError("labels.default_rule_confidence must be a number in (0, 0.50]") from exc
    if not 0.0 < rule_confidence <= 0.50:
        raise ConfigError("labels.default_rule_confidence must be a number in (0, 0.50]")

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
