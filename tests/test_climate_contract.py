from __future__ import annotations

from copy import deepcopy

import pytest
import yaml

from myanmar_agri_geo.config import (
    ConfigError,
    OFFICIAL_CHIRPS_V3_DAILY_RNL,
    load_config,
)
from myanmar_agri_geo.manifest import build_manifest


def _write_config(tmp_path, config: dict) -> None:
    (tmp_path / "project.yaml").write_text(
        yaml.safe_dump(config, sort_keys=False),
        encoding="utf-8",
    )


def test_enabled_climate_context_requires_official_chirps_v3_collection(
    tmp_path,
) -> None:
    config, _ = load_config("config/default.yaml")
    config = deepcopy(config)
    config["climate_context"]["enabled"] = True
    config["sources"]["chirps"] = "UCSB-CHG/CHIRPS/DAILY"
    _write_config(tmp_path, config)

    with pytest.raises(
        ConfigError,
        match="climate_context.enabled requires sources.chirps",
    ):
        load_config(tmp_path / "project.yaml")


def test_disabled_climate_context_preserves_legacy_release_source_contract(
    tmp_path,
) -> None:
    config, _ = load_config("config/default.yaml")
    config = deepcopy(config)
    config["climate_context"]["enabled"] = False
    config["sources"]["chirps"] = "UCSB-CHG/CHIRPS/DAILY"
    _write_config(tmp_path, config)

    loaded, _ = load_config(tmp_path / "project.yaml")

    assert loaded["sources"]["chirps"] == "UCSB-CHG/CHIRPS/DAILY"


def test_source_manifest_records_climate_configuration_and_provenance() -> None:
    config, _ = load_config("config/default.yaml")
    config["climate_context"]["enabled"] = True

    manifest = build_manifest(
        config=config,
        raw_files=(),
        output_files=(),
    )

    climate = manifest["climate_context"]
    assert climate == {
        "enabled": True,
        "baseline_start_year": 1991,
        "baseline_end_year": 2020,
        "baseline_period": "1991-2020",
        "provenance": {
            "status": "configured",
            "rainfall_dataset_id": OFFICIAL_CHIRPS_V3_DAILY_RNL,
            "temperature_dataset_id": "ECMWF/ERA5_LAND/DAILY_AGGR",
            "normal_method": "same_calendar_month_mean",
            "interpretation": (
                "historical_context_not_attribution_forecast_or_projection"
            ),
        },
    }
