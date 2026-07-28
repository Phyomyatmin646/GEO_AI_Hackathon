"""Build a compact web bundle from a QA-approved real regional feature CSV."""

from __future__ import annotations

from datetime import date
import hashlib
import json
import math
from pathlib import Path
import re
from typing import Any, Mapping

import pandas as pd

from .crop_profiles import CROP_IDS, CROP_PROFILES, SuitabilityResult, score_all_crops


SCHEMA_VERSION = "1.0.0"
DATA_CONTRACT = "myanmar-agri-real-features-rule-based-v1"
DATA_MODE = "real_features_rule_based_recommendations"
# The real regional release has 88 one-hundredth-point round trips because
# source features are serialized at release precision; no larger drift exists.
RULE_SCORE_ROUNDTRIP_TOLERANCE = 0.011
RULE_CONFIDENCE_ROUNDTRIP_TOLERANCE = 0.0001

_SOURCE_NAMES = {
    "sentinel2": "Sentinel-2 Surface Reflectance",
    "sentinel1": "Sentinel-1 Ground Range Detected",
    "chirps": "CHIRPS v3 Monthly",
    "chirps_gee_staging": "CHIRPS GEE Staging",
    "era5_land": "ERA5-Land",
    "soilgrids": "SoilGrids 2.0",
    "srtm": "SRTM Elevation",
    "jrc_surface_water": "JRC Global Surface Water",
}

_FEATURES: tuple[dict[str, str], ...] = (
    {
        "id": "elevation_m",
        "column": "elevation_m",
        "label": "Elevation · ပင်လယ်ရေမျက်နှာပြင်အထက်အမြင့်",
        "unit": "m",
        "source": "srtm",
    },
    {
        "id": "slope_degrees",
        "column": "slope_degrees",
        "label": "Slope · မြေစောင်း",
        "unit": "degrees",
        "source": "srtm",
    },
    {
        "id": "surface_water_occurrence_pct",
        "column": "surface_water_occurrence_pct",
        "label": "Historical surface-water occurrence · သမိုင်းဝင်ရေတည်ရှိမှု",
        "unit": "%",
        "source": "jrc_surface_water",
    },
    {
        "id": "distance_to_surface_water_m",
        "column": "distance_to_surface_water_m",
        "label": "Distance to recurrent surface water · ရေတည်ရာနှင့်အကွာအဝေး",
        "unit": "m",
        "source": "jrc_surface_water",
    },
    {
        "id": "soil_ph_h2o_0_30cm",
        "column": "soil_ph_h2o_0_30cm",
        "label": "Soil pH, 0–30 cm · မြေဆီ pH",
        "unit": "pH",
        "source": "soilgrids",
    },
    {
        "id": "soil_clay_pct_0_30cm",
        "column": "soil_clay_pct_0_30cm",
        "label": "Soil clay, 0–30 cm · မြေစေးပါဝင်မှု",
        "unit": "%",
        "source": "soilgrids",
    },
    {
        "id": "soil_soc_g_kg_0_30cm",
        "column": "soil_soc_g_kg_0_30cm",
        "label": "Soil organic carbon · မြေဆီအော်ဂဲနစ်ကာဗွန်",
        "unit": "g/kg",
        "source": "soilgrids",
    },
    {
        "id": "ndvi_median",
        "column": "ndvi_median",
        "label": "NDVI median · အပင်စိမ်းလန်းမှုညွှန်းကိန်း",
        "unit": "index",
        "source": "sentinel2",
    },
    {
        "id": "ndmi_median",
        "column": "ndmi_median",
        "label": "NDMI median · အပင်စိုထိုင်းမှုညွှန်းကိန်း",
        "unit": "index",
        "source": "sentinel2",
    },
    {
        "id": "s1_vv_db_median",
        "column": "s1_vv_db_median",
        "label": "Sentinel-1 VV median · ရေဒါ VV",
        "unit": "dB",
        "source": "sentinel1",
    },
    {
        "id": "monthly_rainfall_mm",
        "column": "monthly_rainfall_mm",
        "label": "Monthly rainfall · လစဉ်မိုးရေချိန်",
        "unit": "mm",
        "source": "chirps",
    },
    {
        "id": "mean_temperature_c",
        "column": "mean_temperature_c",
        "label": "Mean temperature · ပျမ်းမျှအပူချိန်",
        "unit": "°C",
        "source": "era5_land",
    },
    {
        "id": "solar_radiation_mj_m2_day",
        "column": "solar_radiation_mj_m2_day",
        "label": "Solar radiation · နေရောင်ခြည်စွမ်းအင်",
        "unit": "MJ/m²/day",
        "source": "era5_land",
    },
    {
        "id": "era5_soil_moisture_m3_m3",
        "column": "era5_soil_moisture_m3_m3",
        "label": "Near-surface soil water · မြေမျက်နှာပြင်အနီးစိုထိုင်းဆ",
        "unit": "m³/m³",
        "source": "era5_land",
    },
    {
        "id": "water_availability_score",
        "column": "water_availability_score",
        "label": "Water availability proxy · ရေရရှိနိုင်မှုညွှန်းကိန်း",
        "unit": "score 0–100",
        "source": "derived_water_availability",
    },
)

_SCORING_FACTORS: Mapping[str, dict[str, str]] = {
    "mean_temperature_c": {
        "column": "mean_temperature_c",
        "label_en": "mean temperature",
        "label_mm": "ပျမ်းမျှအပူချိန်",
        "unit": "°C",
    },
    "monthly_rainfall_mm": {
        "column": "monthly_rainfall_mm",
        "label_en": "monthly rainfall",
        "label_mm": "လစဉ်မိုးရေချိန်",
        "unit": "mm",
    },
    "annual_rainfall_mm": {
        "column": "annual_rainfall_mm",
        "label_en": "trailing 12-month rainfall",
        "label_mm": "နောက်ဆုံး ၁၂ လ မိုးရေချိန်",
        "unit": "mm",
    },
    "soil_ph_0_30cm": {
        "column": "soil_ph_h2o_0_30cm",
        "label_en": "soil pH",
        "label_mm": "မြေဆီ pH",
        "unit": "pH",
    },
    "slope_degrees": {
        "column": "slope_degrees",
        "label_en": "slope",
        "label_mm": "မြေစောင်း",
        "unit": "degrees",
    },
    "solar_radiation_mj_m2_day": {
        "column": "solar_radiation_mj_m2_day",
        "label_en": "solar radiation",
        "label_mm": "နေရောင်ခြည်စွမ်းအင်",
        "unit": "MJ/m²/day",
    },
    "water_availability_score": {
        "column": "water_availability_score",
        "label_en": "water availability",
        "label_mm": "ရေရရှိနိုင်မှု",
        "unit": "score",
    },
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_json(path: Path, description: str) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(f"{description} does not exist: {path}")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{description} must contain a JSON object: {path}")
    return value


def _require_manifested_hash(
    manifest: Mapping[str, Any],
    path: Path,
    actual_sha256: str,
    *,
    description: str,
) -> None:
    outputs = manifest.get("outputs", [])
    if not isinstance(outputs, list):
        raise ValueError("Source manifest outputs must be an array")
    manifested_hashes = {
        str(record.get("sha256", "")).strip().lower()
        for record in outputs
        if isinstance(record, dict)
        and Path(str(record.get("path", ""))).name == path.name
    }
    if not manifested_hashes:
        raise ValueError(f"{description} is not recorded in source_manifest.json outputs")
    if actual_sha256.lower() not in manifested_hashes:
        raise ValueError(f"{description} SHA-256 does not match source_manifest.json")


def _finite_number(value: Any, *, digits: int = 4) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return round(number, digits) if math.isfinite(number) else None


def _boolean(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if pd.isna(value):
        return False
    return str(value).strip().lower() in {"1", "true", "yes"}


def _validate_release_inputs(
    csv_path: Path,
    qa_path: Path,
    manifest_path: Path,
) -> tuple[pd.DataFrame, dict[str, Any], dict[str, Any], str, str, str]:
    if not csv_path.is_file():
        raise FileNotFoundError(f"Source CSV does not exist: {csv_path}")
    qa = _read_json(qa_path, "QA report")
    manifest = _read_json(manifest_path, "Source manifest")
    if qa.get("valid") is not True:
        raise ValueError("Refusing to build a web bundle from a release that did not pass QA")

    csv_sha256 = _sha256(csv_path)
    qa_sha256 = _sha256(qa_path)
    manifest_sha256 = _sha256(manifest_path)
    _require_manifested_hash(
        manifest,
        csv_path,
        csv_sha256,
        description="Source CSV",
    )
    _require_manifested_hash(
        manifest,
        qa_path,
        qa_sha256,
        description="QA report",
    )

    frame = pd.read_csv(csv_path)
    expected_rows = qa.get("summary", {}).get("row_count")
    if expected_rows is not None and int(expected_rows) != len(frame):
        raise ValueError(
            f"QA row count does not match source CSV: expected {expected_rows}, got {len(frame)}"
        )
    required = {
        "sample_id",
        "grid_id",
        "year_month",
        "longitude",
        "latitude",
        "grid_crs",
        "grid_cell_size_m",
        "cell_area_km2",
        "grid_x",
        "grid_y",
        "period_start",
        "period_end",
        "feature_missing_fraction",
        "usable_for_training",
        "feature_schema_version",
        "sampling_geometry",
        "sampling_reducer",
        "processing_timestamp_utc",
        *[str(feature["column"]) for feature in _FEATURES],
        *[str(factor["column"]) for factor in _SCORING_FACTORS.values()],
    }
    for crop_id in CROP_IDS:
        required.update(
            {
                f"suitability_score__{crop_id}",
                f"label_source__{crop_id}",
                f"label_confidence__{crop_id}",
            }
        )
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise ValueError(f"Source CSV is missing pilot-bundle columns: {missing}")
    if frame.empty:
        raise ValueError("Source CSV contains no rows")
    if frame["grid_id"].duplicated().any():
        raise ValueError("Pilot source must contain one row per grid_id")
    return frame, qa, manifest, csv_sha256, qa_sha256, manifest_sha256


def _parse_year_month(value: Any, *, description: str) -> date:
    text = str(value).strip()
    if re.fullmatch(r"\d{4}-\d{2}", text) is None:
        raise ValueError(f"{description} must use YYYY-MM, received {text!r}")
    try:
        return date(int(text[:4]), int(text[5:]), 1)
    except ValueError as exc:
        raise ValueError(f"{description} is invalid: {text!r}") from exc


def _next_month(month: date) -> date:
    return (
        date(month.year + 1, 1, 1)
        if month.month == 12
        else date(month.year, month.month + 1, 1)
    )


def _months_between(start: date, end: date) -> set[date]:
    months: set[date] = set()
    current = start
    while current <= end:
        months.add(current)
        current = _next_month(current)
    return months


def _validate_manifest_row_contract(
    frame: pd.DataFrame,
    project: Mapping[str, Any],
) -> None:
    manifest_crs = str(project.get("grid_crs") or "").strip().upper()
    grid_size = _finite_number(project.get("grid_size_m"), digits=6)
    if manifest_crs != "EPSG:6933" or grid_size is None or grid_size <= 0:
        raise ValueError("Source manifest must identify a positive EPSG:6933 grid")

    row_crs = {
        str(value).strip().upper()
        for value in frame["grid_crs"].dropna()
        if str(value).strip()
    }
    if row_crs != {manifest_crs} or frame["grid_crs"].isna().any():
        raise ValueError(
            f"CSV grid_crs values {sorted(row_crs)} do not match manifest "
            f"grid_crs {manifest_crs}"
        )

    row_sizes = pd.to_numeric(frame["grid_cell_size_m"], errors="coerce")
    if row_sizes.isna().any() or any(
        abs(float(value) - grid_size) > 1e-6 for value in row_sizes
    ):
        raise ValueError(
            "CSV grid_cell_size_m values do not match manifest grid_size_m "
            f"{grid_size:g}"
        )
    expected_area = grid_size * grid_size / 1_000_000
    row_areas = pd.to_numeric(frame["cell_area_km2"], errors="coerce")
    if row_areas.isna().any() or any(
        abs(float(value) - expected_area) > 1e-6 for value in row_areas
    ):
        raise ValueError(
            "CSV cell_area_km2 values do not match the manifest grid area "
            f"{expected_area:g}"
        )

    manifest_start = _parse_year_month(
        project.get("start_month"),
        description="Manifest start_month",
    )
    manifest_end = _parse_year_month(
        project.get("end_month"),
        description="Manifest end_month",
    )
    if manifest_end < manifest_start:
        raise ValueError("Manifest end_month must not precede start_month")
    row_months = {
        _parse_year_month(value, description="CSV year_month")
        for value in frame["year_month"]
    }
    expected_months = _months_between(manifest_start, manifest_end)
    if row_months != expected_months:
        received = sorted(month.strftime("%Y-%m") for month in row_months)
        expected = sorted(month.strftime("%Y-%m") for month in expected_months)
        raise ValueError(
            f"CSV year_month coverage {received} does not match manifest "
            f"coverage {expected}"
        )

    for row_month, period_start, period_end in frame[
        ["year_month", "period_start", "period_end"]
    ].drop_duplicates().itertuples(index=False, name=None):
        month = _parse_year_month(row_month, description="CSV year_month")
        expected_start = month.isoformat()
        expected_end = _next_month(month).isoformat()
        if str(period_start).strip() != expected_start:
            raise ValueError(
                f"CSV period_start {period_start!r} does not match "
                f"year_month {row_month!r}"
            )
        if str(period_end).strip() != expected_end:
            raise ValueError(
                f"CSV period_end {period_end!r} does not match "
                f"year_month {row_month!r}"
            )

    if "admin1_name" in frame.columns:
        populated_admin1 = {
            str(value).strip()
            for value in frame["admin1_name"].dropna()
            if str(value).strip()
        }
        manifest_admin1 = str(project.get("scope_admin1") or "").strip()
        if populated_admin1 and populated_admin1 != {manifest_admin1}:
            raise ValueError(
                f"CSV admin1_name values {sorted(populated_admin1)} do not match "
                f"manifest scope_admin1 {manifest_admin1!r}"
            )


def _select_rows(frame: pd.DataFrame, max_cells: int | None) -> pd.DataFrame:
    ordered = frame.sort_values(["grid_y", "grid_x", "grid_id"]).reset_index(drop=True)
    if max_cells is None or max_cells >= len(ordered):
        return ordered
    if max_cells <= 0:
        raise ValueError("max_cells must be positive or None")
    if max_cells == 1:
        return ordered.iloc[[len(ordered) // 2]].reset_index(drop=True)
    indices = [
        (position * (len(ordered) - 1)) // (max_cells - 1)
        for position in range(max_cells)
    ]
    return ordered.iloc[indices].reset_index(drop=True)


def _cell_polygon_lat_lon(row: Mapping[str, Any]) -> list[list[float]]:
    try:
        from rasterio.warp import transform
    except ImportError as exc:  # pragma: no cover - optional full dependency
        raise RuntimeError(
            "Pilot polygon generation requires the project 'full' dependencies"
        ) from exc

    crs = str(row["grid_crs"]).strip().upper()
    if crs != "EPSG:6933":
        raise ValueError(f"Pilot bundle requires EPSG:6933 cells, received {crs!r}")
    size = float(row["grid_cell_size_m"])
    grid_x = float(row["grid_x"])
    grid_y = float(row["grid_y"])
    if size <= 0 or not grid_x.is_integer() or not grid_y.is_integer():
        raise ValueError(f"Invalid grid geometry metadata for {row['grid_id']!r}")
    expected_id = f"mm_{int(grid_x)}_{int(grid_y)}"
    if str(row["grid_id"]) != expected_id:
        raise ValueError(
            f"grid_id {row['grid_id']!r} disagrees with grid_x/grid_y ({expected_id})"
        )

    x0, x1 = grid_x * size, (grid_x + 1) * size
    y0, y1 = grid_y * size, (grid_y + 1) * size
    xs = [x0, x1, x1, x0, x0]
    ys = [y0, y0, y1, y1, y0]
    longitudes, latitudes = transform(crs, "EPSG:4326", xs, ys)
    centre_lon, centre_lat = transform(
        crs,
        "EPSG:4326",
        [(grid_x + 0.5) * size],
        [(grid_y + 0.5) * size],
    )
    csv_lon = float(row["longitude"])
    csv_lat = float(row["latitude"])
    if abs(centre_lon[0] - csv_lon) > 1e-4 or abs(centre_lat[0] - csv_lat) > 1e-4:
        raise ValueError(
            f"CSV centroid for {row['grid_id']!r} does not match its EPSG:6933 cell"
        )
    return [
        [round(latitude, 6), round(longitude, 6)]
        for longitude, latitude in zip(longitudes, latitudes)
    ]


def _crop_names(display_name: str) -> tuple[str, str]:
    match = re.fullmatch(r"\s*(.*?)\s*\((.*?)\)\s*", display_name)
    return (match.group(1), match.group(2)) if match else (display_name, display_name)


def _factor_text(
    factor_id: str,
    factor_score: float,
    row: Mapping[str, Any],
) -> str:
    metadata = _SCORING_FACTORS[factor_id]
    value = _finite_number(row[metadata["column"]])
    return (
        f"{metadata['label_en']} · {metadata['label_mm']}: "
        f"{value:g} {metadata['unit']} ({factor_score:.1f}/100)"
    )


def _recommendation(
    crop_id: str,
    result: SuitabilityResult,
    row: Mapping[str, Any],
    rank: int,
    *,
    release_score: float,
    release_confidence: float,
) -> dict[str, Any]:
    profile = CROP_PROFILES[crop_id]
    name_en, name_mm = _crop_names(profile.display_name)
    available = [
        (factor_id, float(score))
        for factor_id, score in result.factor_scores.items()
        if score is not None
    ]
    strongest = sorted(available, key=lambda item: (-item[1], item[0]))[:3]
    constraints = sorted(
        [item for item in available if item[1] < 70],
        key=lambda item: (item[1], item[0]),
    )[:2]
    positive_text = [
        _factor_text(factor_id, score, row) for factor_id, score in strongest
    ]
    limiting_text = [
        _factor_text(factor_id, score, row) for factor_id, score in constraints
    ]
    strongest_en = ", ".join(
        _SCORING_FACTORS[factor_id]["label_en"] for factor_id, _ in strongest
    )
    constraint_en = (
        _SCORING_FACTORS[constraints[0][0]]["label_en"]
        if constraints
        else "no severe measured constraint among available rule factors"
    )
    why = (
        f"Rule baseline rank #{rank}: strongest available signals are "
        f"{strongest_en}; {constraint_en}. "
        "This is a provisional screening score, not an observed crop outcome. "
        f"စည်းမျဉ်းအခြေခံ အဆင့် {rank} ဖြစ်ပြီး လယ်ကွင်းစစ်ဆေးချက်မဟုတ်သေးပါ။"
    )
    return {
        "id": crop_id,
        "nameMm": name_mm,
        "nameEn": name_en,
        # Display the QA-approved release values.  Recomputed results above are
        # a drift guard; tiny score differences are possible because the CSV
        # stores source features at release precision.
        "score": release_score,
        "confidence": release_confidence,
        "why": why,
        "positiveFactors": positive_text,
        "limitingFactors": limiting_text,
        "missingFeatures": list(result.missing_features),
    }


def _cell_record(
    row: Mapping[str, Any],
    *,
    region: str,
    top_crops: int,
) -> dict[str, Any]:
    results = score_all_crops(row)
    ranked: list[tuple[str, SuitabilityResult, float, float]] = []
    for crop_id, result in results.items():
        score_column = f"suitability_score__{crop_id}"
        csv_score = _finite_number(row[score_column], digits=6)
        confidence_column = f"label_confidence__{crop_id}"
        csv_confidence = _finite_number(row[confidence_column], digits=6)
        if (
            csv_confidence is None
            or abs(float(result.label_confidence) - csv_confidence)
            > RULE_CONFIDENCE_ROUNDTRIP_TOLERANCE
        ):
            raise ValueError(
                f"Rule-confidence drift for {row['grid_id']} / {crop_id}: "
                f"computed {result.label_confidence}, CSV {csv_confidence}"
            )
        if result.score is None:
            if csv_score is not None:
                raise ValueError(
                    f"Rule-score drift for {row['grid_id']} / {crop_id}: "
                    "generator abstained but CSV contains a score"
                )
            continue
        if (
            csv_score is None
            or abs(float(result.score) - csv_score)
            > RULE_SCORE_ROUNDTRIP_TOLERANCE
        ):
            raise ValueError(
                f"Rule-score drift for {row['grid_id']} / {crop_id}: "
                f"computed {result.score}, CSV {csv_score}"
            )
        if str(row[f"label_source__{crop_id}"]) != "rule_based":
            raise ValueError(
                "Web pilot accepts only rule_based labels until observed labels "
                f"receive a separate release contract ({row['grid_id']} / {crop_id})"
            )
        ranked.append((crop_id, result, csv_score, csv_confidence))

    crop_order = {crop_id: position for position, crop_id in enumerate(CROP_IDS)}
    ranked.sort(key=lambda item: (-item[2], crop_order[item[0]]))
    recommendations = [
        _recommendation(
            crop_id,
            result,
            row,
            rank,
            release_score=release_score,
            release_confidence=release_confidence,
        )
        for rank, (crop_id, result, release_score, release_confidence) in enumerate(
            ranked[:top_crops], start=1
        )
    ]
    missing_fraction = _finite_number(row["feature_missing_fraction"]) or 0.0
    data_coverage = round(max(0.0, min(1.0, 1.0 - missing_fraction)), 4)
    recommendation_status = "scored" if recommendations else "insufficient_evidence"
    uncertainty = (
        "high"
        if recommendation_status == "insufficient_evidence" or data_coverage < 0.65
        else "medium"
    )
    features: list[dict[str, Any]] = []
    for feature in _FEATURES:
        value = _finite_number(row[feature["column"]])
        features.append(
            {
                "id": feature["id"],
                "label": feature["label"],
                "value": value,
                "unit": feature["unit"],
                "status": "available" if value is not None else "missing",
                "sourceId": feature["source"],
            }
        )
    return {
        "id": str(row["grid_id"]),
        "region": region,
        "month": str(row["year_month"]),
        "latitude": round(float(row["latitude"]), 6),
        "longitude": round(float(row["longitude"]), 6),
        "polygon": _cell_polygon_lat_lon(row),
        "dataCoverage": data_coverage,
        "uncertainty": uncertainty,
        "labelSource": "rule_based",
        "observedLabelCount": 0,
        "usableForTraining": _boolean(row["usable_for_training"]),
        "recommendationStatus": recommendation_status,
        "features": features,
        "recommendations": recommendations,
    }


def _source_records(manifest: Mapping[str, Any]) -> list[dict[str, str]]:
    sources: list[dict[str, str]] = []
    selected = manifest.get("selected_sources", {})
    if not isinstance(selected, dict):
        raise ValueError("Source manifest selected_sources must be an object")
    for source_id in sorted(selected):
        record = selected[source_id]
        if not isinstance(record, dict):
            continue
        sources.append(
            {
                "id": str(source_id),
                "name": _SOURCE_NAMES.get(
                    str(source_id), str(source_id).replace("_", " ").title()
                ),
                "datasetId": str(record.get("dataset_id", "")),
                "role": str(record.get("role", "")),
                "resolution": str(record.get("resolution", "")),
                "sourceUrl": str(record.get("source_url", "")),
            }
        )
    sources.append(
        {
            "id": "derived_water_availability",
            "name": "Transparent water-availability proxy",
            "datasetId": "myanmar_agri_geo_pipeline_v1",
            "role": "Derived screening proxy from ERA5 soil water, JRC water proximity, and rainfall",
            "resolution": "5 km grid",
            "sourceUrl": "https://github.com/Phyomyatmin646/GEO_AI_Hackathon",
        }
    )
    return sources


def _period_bounds(
    frame: pd.DataFrame,
    project: Mapping[str, Any],
) -> tuple[str, str]:
    """Return an ISO start and exclusive end date for the release."""

    if {"period_start", "period_end"}.issubset(frame.columns):
        starts = sorted(
            {
                str(value).strip()
                for value in frame["period_start"].dropna()
                if str(value).strip()
            }
        )
        ends = sorted(
            {
                str(value).strip()
                for value in frame["period_end"].dropna()
                if str(value).strip()
            }
        )
        if starts and ends:
            period_start, period_end = starts[0], ends[-1]
        else:
            period_start = period_end = ""
    else:
        period_start = period_end = ""

    if not period_start or not period_end:
        months = sorted(str(value) for value in frame["year_month"].dropna().unique())
        if not months:
            raise ValueError("Source CSV must contain at least one year_month")
        first_year, first_month = (int(part) for part in months[0].split("-"))
        last_year, last_month = (int(part) for part in months[-1].split("-"))
        period_start = date(first_year, first_month, 1).isoformat()
        if last_month == 12:
            exclusive_end = date(last_year + 1, 1, 1)
        else:
            exclusive_end = date(last_year, last_month + 1, 1)
        period_end = exclusive_end.isoformat()

    try:
        parsed_start = date.fromisoformat(period_start)
        parsed_end = date.fromisoformat(period_end)
    except ValueError as exc:
        raise ValueError(
            f"Release period must use ISO YYYY-MM-DD dates: {period_start!r}, "
            f"{period_end!r}"
        ) from exc
    if parsed_end <= parsed_start:
        raise ValueError("Release period_end must be later than period_start")
    return parsed_start.isoformat(), parsed_end.isoformat()


def build_web_pilot_bundle(
    csv_path: str | Path,
    *,
    qa_report_path: str | Path,
    source_manifest_path: str | Path,
    output_path: str | Path,
    max_cells: int | None = None,
    top_crops: int = 3,
) -> dict[str, Any]:
    """Write deterministic web JSON from a QA-approved real regional CSV."""

    if top_crops <= 0 or top_crops > len(CROP_IDS):
        raise ValueError(f"top_crops must be between 1 and {len(CROP_IDS)}")
    source = Path(csv_path)
    qa_path = Path(qa_report_path)
    manifest_path = Path(source_manifest_path)
    (
        frame,
        qa,
        manifest,
        csv_sha256,
        qa_sha256,
        manifest_sha256,
    ) = _validate_release_inputs(source, qa_path, manifest_path)
    selected = _select_rows(frame, max_cells)
    project = manifest.get("project", {})
    if not isinstance(project, dict):
        raise ValueError("Source manifest project must be an object")
    region = str(project.get("scope_admin1") or "").strip()
    if not region:
        raise ValueError("Source manifest must identify project.scope_admin1")
    grid_crs = str(project.get("grid_crs") or "").strip()
    grid_size = int(project.get("grid_size_m") or 0)
    if grid_crs.upper() != "EPSG:6933" or grid_size <= 0:
        raise ValueError("Source manifest must identify a positive EPSG:6933 grid")
    _validate_manifest_row_contract(frame, project)

    cells = [
        _cell_record(row, region=region, top_crops=top_crops)
        for row in selected.to_dict(orient="records")
    ]
    scored_count = sum(
        cell["recommendationStatus"] == "scored" for cell in cells
    )
    summary = qa.get("summary", {})
    period_start, period_end = _period_bounds(frame, project)
    release_id = f"{project.get('name', source.stem)}__{csv_sha256[:12]}"
    bundle: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "meta": {
            "releaseId": release_id,
            "dataContract": DATA_CONTRACT,
            "dataMode": DATA_MODE,
            "region": region,
            "periodStart": period_start,
            "periodEnd": period_end,
            "generatedAt": str(
                manifest.get("processing_timestamp_utc")
                or qa.get("generated_at")
                or ""
            ),
            "rowCount": len(cells),
            "scoredCellCount": scored_count,
            "abstainedCellCount": len(cells) - scored_count,
            "usableCellCount": sum(cell["usableForTraining"] for cell in cells),
            "sourceCsvSha256": csv_sha256,
            "qaReportSha256": qa_sha256,
            "sourceManifestSha256": manifest_sha256,
            "grid": {
                "crs": grid_crs,
                "sizeM": grid_size,
                "cellAreaKm2": round(grid_size * grid_size / 1_000_000, 4),
            },
            "qa": {
                "valid": True,
                "warningCount": int(summary.get("warning_count", 0)),
                "errorCount": int(summary.get("error_count", 0)),
            },
            "sources": _source_records(manifest),
            "splitPolicy": (
                "0.5-degree deterministic spatial folds for 2018–2024; "
                "2025 is a locked temporal holdout."
            ),
            "limitations": [
                (
                    f"Full QA-approved regional release: all {len(frame)} cells."
                    if len(cells) == len(frame)
                    else (
                        f"Compact deterministic web sample: {len(cells)} of "
                        f"{len(frame)} QA-approved regional cells."
                    )
                ),
                "Recommendations are provisional agronomic rules, not trained-model predictions or observed crop outcomes.",
                "Observed-label count is zero; field and agronomist validation remain required.",
                "January 2018 has no trailing 12-month rainfall value, so scoring reweights only sufficiently covered factors.",
                "A 5 km cell is a screening unit, not a farm boundary or yield promise.",
            ],
        },
        "cells": cells,
    }
    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(f"{destination.name}.part")
    try:
        partial.write_text(
            json.dumps(
                bundle,
                ensure_ascii=False,
                allow_nan=False,
                separators=(",", ":"),
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
        partial.replace(destination)
    except Exception:
        partial.unlink(missing_ok=True)
        raise
    return bundle
