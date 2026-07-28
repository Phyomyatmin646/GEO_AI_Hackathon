from __future__ import annotations

from copy import deepcopy
import json

import pandas as pd

from myanmar_agri_geo.config import load_config, resolved_config
from myanmar_agri_geo.pipeline import (
    assemble_dataset,
    attach_project_context,
    read_gee_exports,
)


def _raw_export_frame() -> pd.DataFrame:
    """Small test fixture; it is not distributed as agricultural training data."""

    common = {
        "grid_id": "MMR_TEST_0001",
        "longitude": 96.15,
        "latitude": 16.82,
        "admin0_name": "Myanmar",
        "elevation_m": 20.0,
        "slope_degrees": 1.2,
        "aspect_degrees": 180.0,
        "surface_water_occurrence_pct": 18.0,
        "distance_to_surface_water_m": 1_200.0,
        "soil_ph_h2o_0_30cm": 6.1,
        "soil_sand_pct_0_30cm": 35.0,
        "soil_silt_pct_0_30cm": 35.0,
        "soil_clay_pct_0_30cm": 30.0,
        "soil_soc_g_kg_0_30cm": 12.0,
        "soil_cec_cmol_kg_0_30cm": 14.0,
        "soil_ph_h2o_uncertainty_pct": 12.0,
        "ndvi_median": 0.63,
        "ndwi_mcf_median": -0.12,
        "ndmi_median": 0.18,
        "s2_scene_count": 4,
        "s2_valid_observation_count": 3,
        "s2_cloudy_pixel_fraction": 0.18,
        "s1_vv_db_median": -11.0,
        "s1_vh_db_median": -17.0,
        "s1_scene_count": 4,
        "chirps_precipitation_mm": 160.0,
        "annual_rainfall_mm": 1_900.0,
        "mean_temperature_c": 27.0,
        "min_temperature_c": 23.0,
        "max_temperature_c": 32.0,
        "solar_radiation_mj_m2_day": 18.5,
        "era5_soil_moisture_m3_m3": 0.27,
    }
    return pd.DataFrame([{**common, "year_month": "2018-01"}, {**common, "year_month": "2025-12"}])


def test_assemble_outputs_all_required_artifacts(tmp_path) -> None:
    config_path = "config/default.yaml"
    config, root = load_config(config_path)
    config = resolved_config(config, root)
    config = deepcopy(config)
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    _raw_export_frame().to_csv(raw_dir / "gee_export.csv", index=False)
    config["project"]["raw_gee_dir"] = str(raw_dir)
    config["project"]["chirps_v3_cache_dir"] = str(tmp_path / "chirps_v3")
    config["project"]["soil_cache_dir"] = str(tmp_path / "soil")
    config["project"]["output_dir"] = str(tmp_path / "out")
    # This test fixture validates assembly mechanics without downloading real
    # rasters; production defaults require the CHIRPS v3 cache.
    config["chirps_v3"]["enabled"] = False

    artifacts = assemble_dataset(config, write_plain_csv=True)

    assert all(path.is_file() for path in artifacts.values())
    output = pd.read_csv(artifacts["csv"])
    assert len(output) == 2
    assert "suitability_score__durian" in output
    assert output["label_source__durian"].eq("rule_based").all()
    assert output["water_availability_score"].between(0, 100).all()
    assert output["usable_for_training"].all()
    assert artifacts["plain_csv"].suffix == ".csv"
    assert pd.read_csv(artifacts["plain_csv"]).equals(output)
    audit = pd.read_csv(artifacts["resource_audit"])
    assert "sig_hydrafloods" in set(audit["resource_id"])
    assert (audit["status"] == "pending_source_verification").any()
    external = pd.read_csv(artifacts["external_feature_manifest"])
    assert external["state"].eq("pending_source_verification").all()
    manifest = json.loads(artifacts["manifest"].read_text(encoding="utf-8"))
    assert manifest["dataset_summary"]["records"] == 2
    assert manifest["contextual_resource_audit"]["catalog_url"] == "https://geoai-collabhub.com/resources"
    qa = json.loads(artifacts["qa_report"].read_text(encoding="utf-8"))
    assert qa["valid"] is True


def test_split_static_and_monthly_exports_join_by_grid_id(tmp_path) -> None:
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    pd.DataFrame(
        [
            {
                "grid_id": "mm_1_2",
                "year_month": "__static__",
                "longitude": 96.0,
                "latitude": 17.0,
                "table_kind": "static",
                "elevation_m": 42.0,
                "soil_ph_h2o_0_30cm": 6.2,
                "source_srtm": "USGS/SRTMGL1_003",
            }
        ]
    ).to_csv(raw_dir / "pilot_static.csv", index=False)
    pd.DataFrame(
        [
            {
                "grid_id": "mm_1_2",
                "year_month": "2018-01",
                "longitude": 96.0,
                "latitude": 17.0,
                "table_kind": "monthly_dynamic",
                "ndvi_median": 0.54,
            }
        ]
    ).to_csv(raw_dir / "pilot_dynamic_2018_01.csv", index=False)

    frame, files = read_gee_exports(raw_dir)

    assert len(files) == 2
    assert len(frame) == 1
    assert frame.loc[0, "year_month"] == "2018-01"
    assert frame.loc[0, "elevation_m"] == 42.0
    assert frame.loc[0, "soil_ph_h2o_0_30cm"] == 6.2
    assert frame.loc[0, "ndvi_median"] == 0.54


def test_project_context_fills_only_trusted_myanmar_admin0() -> None:
    config, _ = load_config("config/default.yaml")
    frame = pd.DataFrame(
        {
            "grid_id": ["mm_1_2", "mm_2_3"],
            "admin0_name": [pd.NA, "Myanmar"],
        }
    )

    output = attach_project_context(frame, config)

    assert output["admin0_name"].eq("Myanmar").all()
    assert output["admin0_source"].tolist() == [
        "project_scope_config",
        "source_export",
    ]


def test_project_context_rejects_conflicting_admin0() -> None:
    config, _ = load_config("config/default.yaml")
    frame = pd.DataFrame(
        {"grid_id": ["mm_1_2"], "admin0_name": ["Thailand"]}
    )

    try:
        attach_project_context(frame, config)
    except ValueError as exc:
        assert "conflict" in str(exc)
    else:  # pragma: no cover - defensive assertion
        raise AssertionError("Expected conflicting admin0_name to be rejected")
