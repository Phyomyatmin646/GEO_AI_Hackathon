from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pandas as pd
import pytest

from myanmar_agri_geo.crop_profiles import CROP_IDS, flatten_all_crop_results
from myanmar_agri_geo.cli import _build_parser
from myanmar_agri_geo.pilot_bundle import build_web_pilot_bundle


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _row(grid_x: int, grid_y: int) -> dict[str, object]:
    rasterio = pytest.importorskip("rasterio")
    from rasterio.warp import transform

    size = 5_000
    longitude, latitude = transform(
        "EPSG:6933",
        "EPSG:4326",
        [(grid_x + 0.5) * size],
        [(grid_y + 0.5) * size],
    )
    row: dict[str, object] = {
        "sample_id": f"mm_{grid_x}_{grid_y}__2018-01",
        "grid_id": f"mm_{grid_x}_{grid_y}",
        "year_month": "2018-01",
        "longitude": longitude[0],
        "latitude": latitude[0],
        "grid_crs": "EPSG:6933",
        "grid_cell_size_m": size,
        "cell_area_km2": 25,
        "grid_x": grid_x,
        "grid_y": grid_y,
        "period_start": "2018-01-01",
        "period_end": "2018-02-01",
        "admin1_name": None,
        "elevation_m": 12.0,
        "slope_degrees": 1.5,
        "surface_water_occurrence_pct": 42.0,
        "distance_to_surface_water_m": 2_000.0,
        "soil_ph_h2o_0_30cm": 6.2,
        "soil_clay_pct_0_30cm": 31.0,
        "soil_soc_g_kg_0_30cm": 18.0,
        "ndvi_median": 0.72,
        "ndmi_median": 0.28,
        "s1_vv_db_median": -8.5,
        "monthly_rainfall_mm": 88.0,
        "annual_rainfall_mm": None,
        "mean_temperature_c": 27.0,
        "solar_radiation_mj_m2_day": 18.0,
        "era5_soil_moisture_m3_m3": 0.27,
        "water_availability_score": 76.0,
        "feature_missing_fraction": 0.0667,
        "usable_for_training": True,
        "feature_schema_version": "myanmar_agri_geo_v1",
        "sampling_geometry": "centroid",
        "sampling_reducer": "centroid_sample_at_scale",
        "processing_timestamp_utc": "2026-07-28T10:00:00+00:00",
    }
    row.update(flatten_all_crop_results(row))
    return row


def _release_files(
    tmp_path: Path,
    *,
    qa_valid: bool = True,
    rows: list[dict[str, object]] | None = None,
) -> tuple[Path, Path, Path]:
    release_rows = rows or [_row(1819, 404), _row(1820, 405)]
    csv_path = tmp_path / "regional.csv"
    pd.DataFrame(release_rows).to_csv(csv_path, index=False)
    qa_path = tmp_path / "qa.json"
    qa_path.write_text(
        json.dumps(
            {
                "valid": qa_valid,
                "generated_at": "2026-07-28T10:00:01Z",
                "summary": {
                    "row_count": len(release_rows),
                    "warning_count": 1,
                    "error_count": 0,
                },
            }
        ),
        encoding="utf-8",
    )
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "manifest_version": "1.0",
                "processing_timestamp_utc": "2026-07-28T10:00:02+00:00",
                "project": {
                    "name": "regional_pilot",
                    "scope_admin1": "Ayeyawaddy",
                    "release_stage": "regional_pilot",
                    "start_month": "2018-01",
                    "end_month": "2018-01",
                    "grid_size_m": 5_000,
                    "grid_crs": "EPSG:6933",
                },
                "outputs": [
                    {
                        "path": str(csv_path),
                        "sha256": _sha256(csv_path),
                    },
                    {
                        "path": str(qa_path),
                        "sha256": _sha256(qa_path),
                    },
                ],
                "selected_sources": {
                    "chirps": {
                        "dataset_id": "CHIRPS v3",
                        "role": "rainfall",
                        "resolution": "0.05 degree",
                        "source_url": "https://example.test/chirps",
                    },
                    "era5_land": {
                        "dataset_id": "ERA5-Land",
                        "role": "temperature",
                        "resolution": "0.1 degree",
                        "source_url": "https://example.test/era5",
                    },
                },
            }
        ),
        encoding="utf-8",
    )
    return csv_path, qa_path, manifest_path


def test_bundle_uses_real_values_rule_scores_and_true_equal_area_polygons(
    tmp_path: Path,
) -> None:
    pytest.importorskip("rasterio")
    from rasterio.warp import transform

    csv_path, qa_path, manifest_path = _release_files(tmp_path)
    output_path = tmp_path / "pilot.json"
    bundle = build_web_pilot_bundle(
        csv_path,
        qa_report_path=qa_path,
        source_manifest_path=manifest_path,
        output_path=output_path,
        max_cells=None,
        top_crops=3,
    )

    assert bundle["schemaVersion"] == "1.0.0"
    assert bundle["meta"]["dataMode"] == "real_features_rule_based_recommendations"
    assert bundle["meta"]["sourceCsvSha256"] == _sha256(csv_path)
    assert bundle["meta"]["qaReportSha256"] == _sha256(qa_path)
    assert bundle["meta"]["sourceManifestSha256"] == _sha256(manifest_path)
    assert bundle["meta"]["rowCount"] == 2
    assert bundle["meta"]["periodStart"] == "2018-01-01"
    assert bundle["meta"]["periodEnd"] == "2018-02-01"
    assert bundle["meta"]["limitations"][0] == (
        "Full QA-approved regional release: all 2 cells."
    )
    derived_source = next(
        source
        for source in bundle["meta"]["sources"]
        if source["id"] == "derived_water_availability"
    )
    assert derived_source["sourceUrl"].startswith("https://")
    cell = bundle["cells"][0]
    assert cell["labelSource"] == "rule_based"
    assert cell["observedLabelCount"] == 0
    assert cell["recommendationStatus"] == "scored"
    assert len(cell["recommendations"]) == 3
    assert cell["recommendations"][0]["why"].startswith("Rule baseline rank #1")
    rainfall = next(
        feature for feature in cell["features"] if feature["id"] == "monthly_rainfall_mm"
    )
    assert rainfall["value"] == 88.0
    assert rainfall["sourceId"] == "chirps"

    polygon = cell["polygon"]
    assert polygon[0] == polygon[-1]
    assert len(polygon) == 5
    latitudes, longitudes = zip(*polygon)
    xs, ys = transform(
        "EPSG:4326",
        "EPSG:6933",
        list(longitudes),
        list(latitudes),
    )
    assert min(xs) == pytest.approx(1819 * 5_000, abs=0.2)
    assert max(xs) == pytest.approx(1820 * 5_000, abs=0.2)
    assert min(ys) == pytest.approx(404 * 5_000, abs=0.2)
    assert max(ys) == pytest.approx(405 * 5_000, abs=0.2)
    json.loads(output_path.read_text(encoding="utf-8"))


def test_bundle_output_is_byte_reproducible_and_sampling_is_deterministic(
    tmp_path: Path,
) -> None:
    csv_path, qa_path, manifest_path = _release_files(tmp_path)
    first = tmp_path / "first.json"
    second = tmp_path / "second.json"
    build_web_pilot_bundle(
        csv_path,
        qa_report_path=qa_path,
        source_manifest_path=manifest_path,
        output_path=first,
        max_cells=1,
    )
    build_web_pilot_bundle(
        csv_path,
        qa_report_path=qa_path,
        source_manifest_path=manifest_path,
        output_path=second,
        max_cells=1,
    )

    assert first.read_bytes() == second.read_bytes()
    assert json.loads(first.read_text())["meta"]["rowCount"] == 1


def test_bundle_refuses_failed_qa(tmp_path: Path) -> None:
    csv_path, qa_path, manifest_path = _release_files(tmp_path, qa_valid=False)
    with pytest.raises(ValueError, match="did not pass QA"):
        build_web_pilot_bundle(
            csv_path,
            qa_report_path=qa_path,
            source_manifest_path=manifest_path,
            output_path=tmp_path / "pilot.json",
        )


def test_bundle_refuses_source_csv_hash_mismatch(tmp_path: Path) -> None:
    csv_path, qa_path, manifest_path = _release_files(tmp_path)
    csv_path.write_text(csv_path.read_text() + "\n", encoding="utf-8")
    with pytest.raises(ValueError, match="SHA-256"):
        build_web_pilot_bundle(
            csv_path,
            qa_report_path=qa_path,
            source_manifest_path=manifest_path,
            output_path=tmp_path / "pilot.json",
        )


def test_bundle_refuses_qa_report_hash_mismatch(tmp_path: Path) -> None:
    csv_path, qa_path, manifest_path = _release_files(tmp_path)
    qa_path.write_text(qa_path.read_text(encoding="utf-8") + "\n", encoding="utf-8")

    with pytest.raises(ValueError, match="QA report SHA-256"):
        build_web_pilot_bundle(
            csv_path,
            qa_report_path=qa_path,
            source_manifest_path=manifest_path,
            output_path=tmp_path / "pilot.json",
        )


@pytest.mark.parametrize(
    ("column", "value", "error"),
    [
        ("grid_crs", "EPSG:3857", "grid_crs"),
        ("grid_cell_size_m", 10_000, "grid_cell_size_m"),
        ("cell_area_km2", 24, "cell_area_km2"),
    ],
)
def test_bundle_refuses_manifest_grid_mismatch(
    tmp_path: Path,
    column: str,
    value: object,
    error: str,
) -> None:
    row = _row(1819, 404)
    row[column] = value
    csv_path, qa_path, manifest_path = _release_files(tmp_path, rows=[row])

    with pytest.raises(ValueError, match=error):
        build_web_pilot_bundle(
            csv_path,
            qa_report_path=qa_path,
            source_manifest_path=manifest_path,
            output_path=tmp_path / "pilot.json",
        )


@pytest.mark.parametrize(
    ("column", "value", "error"),
    [
        ("year_month", "2018-02", "year_month coverage"),
        ("period_start", "2017-12-01", "period_start"),
        ("period_end", "2018-03-01", "period_end"),
        ("admin1_name", "Yangon", "admin1_name"),
    ],
)
def test_bundle_refuses_manifest_release_scope_mismatch(
    tmp_path: Path,
    column: str,
    value: object,
    error: str,
) -> None:
    row = _row(1819, 404)
    row[column] = value
    csv_path, qa_path, manifest_path = _release_files(tmp_path, rows=[row])

    with pytest.raises(ValueError, match=error):
        build_web_pilot_bundle(
            csv_path,
            qa_report_path=qa_path,
            source_manifest_path=manifest_path,
            output_path=tmp_path / "pilot.json",
        )


def test_low_evidence_cell_abstains_instead_of_recommending(tmp_path: Path) -> None:
    row = _row(1819, 404)
    for column in (
        "mean_temperature_c",
        "monthly_rainfall_mm",
        "annual_rainfall_mm",
        "soil_ph_h2o_0_30cm",
        "slope_degrees",
        "solar_radiation_mj_m2_day",
        "water_availability_score",
    ):
        row[column] = None
    row["feature_missing_fraction"] = 0.8
    row["usable_for_training"] = False
    row.update(flatten_all_crop_results(row))
    csv_path, qa_path, manifest_path = _release_files(tmp_path, rows=[row])

    bundle = build_web_pilot_bundle(
        csv_path,
        qa_report_path=qa_path,
        source_manifest_path=manifest_path,
        output_path=tmp_path / "pilot.json",
    )

    cell = bundle["cells"][0]
    assert cell["recommendationStatus"] == "insufficient_evidence"
    assert cell["recommendations"] == []
    assert cell["uncertainty"] == "high"
    assert bundle["meta"]["abstainedCellCount"] == 1


def test_bundle_refuses_rule_confidence_drift(tmp_path: Path) -> None:
    row = _row(1819, 404)
    row["label_confidence__cassava"] = (
        float(row["label_confidence__cassava"]) + 0.01
    )
    csv_path, qa_path, manifest_path = _release_files(tmp_path, rows=[row])

    with pytest.raises(ValueError, match="Rule-confidence drift"):
        build_web_pilot_bundle(
            csv_path,
            qa_report_path=qa_path,
            source_manifest_path=manifest_path,
            output_path=tmp_path / "pilot.json",
        )


def test_bundle_uses_release_score_within_roundtrip_tolerance(tmp_path: Path) -> None:
    row = _row(1819, 404)
    row["suitability_score__cassava"] = round(
        float(row["suitability_score__cassava"]) - 0.01,
        2,
    )
    csv_path, qa_path, manifest_path = _release_files(tmp_path, rows=[row])

    bundle = build_web_pilot_bundle(
        csv_path,
        qa_report_path=qa_path,
        source_manifest_path=manifest_path,
        output_path=tmp_path / "pilot.json",
        top_crops=len(CROP_IDS),
    )

    cassava = next(
        crop
        for crop in bundle["cells"][0]["recommendations"]
        if crop["id"] == "cassava"
    )
    assert cassava["score"] == row["suitability_score__cassava"]


def test_build_web_pilot_cli_defaults_to_full_release() -> None:
    args = _build_parser().parse_args(
        [
            "build-web-pilot",
            "--input",
            "release.csv",
            "--qa-report",
            "qa.json",
            "--source-manifest",
            "manifest.json",
        ]
    )

    assert args.max_cells is None
