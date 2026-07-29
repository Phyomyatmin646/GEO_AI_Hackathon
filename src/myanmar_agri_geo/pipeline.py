"""Local assembly of exported GEE data into a model-ready Geo-CSV dataset."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import json

import numpy as np
import pandas as pd

from .documentation import write_data_dictionary
from .chirps_v3 import attach_chirps_v3_from_cache, expected_cache_paths
from .labeling import add_rule_based_labels, calibrate_with_observed_labels
from .manifest import build_manifest, source_versions_json, write_json
from .resources import write_collabhub_resource_audit, write_external_feature_manifest
from .schema import (
    MONTHLY_FEATURE_COLUMNS,
    OPTIONAL_CLIMATE_CONTEXT_COLUMNS,
    STATIC_FEATURE_COLUMNS,
    required_columns,
    raw_gee_required_columns,
)
from .soilgrids import attach_soilgrids_from_cache
from .splits import add_split_manifest_columns, split_manifest


RAW_COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    "grid_id": ("grid_id", "cell_id", "system:index"),
    "year_month": ("year_month", "month", "period"),
    "longitude": ("longitude", "lon", "centroid_lon"),
    "latitude": ("latitude", "lat", "centroid_lat"),
    "elevation_m": ("elevation_m", "elevation"),
    "slope_degrees": ("slope_degrees", "slope_deg", "slope"),
    "aspect_degrees": ("aspect_degrees", "aspect"),
    "surface_water_occurrence_pct": ("surface_water_occurrence_pct", "water_occurrence_pct", "occurrence"),
    "distance_to_surface_water_m": ("distance_to_surface_water_m", "distance_to_water_m"),
    "soil_ph_h2o_0_30cm": ("soil_ph_h2o_0_30cm", "soil_ph_h2o", "soil_ph_0_30cm"),
    "soil_sand_pct_0_30cm": ("soil_sand_pct_0_30cm", "soil_sand_pct"),
    "soil_silt_pct_0_30cm": ("soil_silt_pct_0_30cm", "soil_silt_pct"),
    "soil_clay_pct_0_30cm": ("soil_clay_pct_0_30cm", "soil_clay_pct"),
    "soil_soc_g_kg_0_30cm": ("soil_soc_g_kg_0_30cm", "soil_soc_g_kg"),
    "soil_cec_cmol_kg_0_30cm": ("soil_cec_cmol_kg_0_30cm", "soil_cec_cmol_kg"),
    "ndvi_median": ("ndvi_median", "s2_ndvi", "ndvi"),
    "ndwi_mcf_median": ("ndwi_mcf_median", "s2_ndwi", "ndwi_median", "ndwi"),
    "ndmi_median": ("ndmi_median", "s2_ndmi", "ndmi"),
    "s2_scene_count": ("s2_scene_count", "sentinel2_scene_count"),
    "s2_valid_observation_count": ("s2_valid_observation_count", "s2_valid_count"),
    "s2_cloudy_pixel_fraction": ("s2_cloudy_pixel_fraction", "s2_cloud_fraction", "cloudy_pixel_fraction"),
    "s1_vv_db_median": ("s1_vv_db_median", "s1_vv_db", "vv_db"),
    "s1_vh_db_median": ("s1_vh_db_median", "s1_vh_db", "vh_db"),
    "s1_scene_count": ("s1_scene_count", "sentinel1_scene_count"),
    "chirps_precipitation_mm": ("chirps_precipitation_mm", "precipitation_mm", "chirps_precipitation"),
    "monthly_rainfall_mm": ("monthly_rainfall_mm", "chirps_precipitation_mm", "precipitation_mm"),
    "annual_rainfall_mm": ("annual_rainfall_mm", "trailing_12m_rainfall_mm"),
    "mean_temperature_c": ("mean_temperature_c", "era5_temperature_2m_c", "temperature_2m_c", "temperature_c"),
    "min_temperature_c": ("min_temperature_c", "temperature_2m_min_c"),
    "max_temperature_c": ("max_temperature_c", "temperature_2m_max_c"),
    "solar_radiation_mj_m2_day": (
        "solar_radiation_mj_m2_day",
        "era5_surface_solar_radiation_mj_m2_day",
        "era5_surface_solar_radiation_mj_m2",
        "surface_solar_radiation_mj_m2_day",
    ),
    "era5_soil_moisture_m3_m3": (
        "era5_soil_moisture_m3_m3",
        "era5_volumetric_soil_water_layer_1",
        "volumetric_soil_water_layer_1",
    ),
    "rainfall_normal_1991_2020_mm": (
        "rainfall_normal_1991_2020_mm",
    ),
    "rainfall_anomaly_1991_2020_mm": (
        "rainfall_anomaly_1991_2020_mm",
    ),
    "rainfall_anomaly_1991_2020_pct": (
        "rainfall_anomaly_1991_2020_pct",
    ),
    "temperature_normal_1991_2020_c": (
        "temperature_normal_1991_2020_c",
    ),
    "temperature_anomaly_1991_2020_c": (
        "temperature_anomaly_1991_2020_c",
    ),
    "admin0_name": ("admin0_name", "ADM0_NAME", "country_name"),
    "admin1_name": ("admin1_name", "ADM1_NAME"),
    "admin2_name": ("admin2_name", "ADM2_NAME"),
}


def _coalesce_aliases(frame: pd.DataFrame, destination: str, aliases: tuple[str, ...]) -> None:
    if destination in frame.columns:
        return
    for source in aliases:
        if source in frame.columns:
            frame[destination] = frame[source]
            return


def normalise_gee_frame(raw: pd.DataFrame) -> pd.DataFrame:
    """Map known Earth Engine export aliases to the public output schema."""

    output = raw.copy()
    for destination, aliases in RAW_COLUMN_ALIASES.items():
        _coalesce_aliases(output, destination, aliases)
    missing = set(raw_gee_required_columns()).difference(output.columns)
    if missing:
        raise ValueError(f"GEE export is missing required identifiers: {sorted(missing)}")
    output["grid_id"] = output["grid_id"].astype(str)
    output["year_month"] = output["year_month"].astype(str).str.slice(0, 7)
    for column in ("longitude", "latitude"):
        output[column] = pd.to_numeric(output[column], errors="coerce")
    return output


def read_gee_exports(raw_dir: str | Path) -> tuple[pd.DataFrame, list[Path]]:
    """Read completed exports and join split static rows by ``grid_id``."""

    directory = Path(raw_dir)
    if not directory.is_dir():
        raise FileNotFoundError(f"Raw GEE export directory does not exist: {directory}")
    files = sorted([*directory.glob("*.csv"), *directory.glob("*.csv.gz")])
    if not files:
        raise FileNotFoundError(
            f"No .csv or .csv.gz files found in {directory}. Download completed GEE Drive exports first."
        )
    frames = [normalise_gee_frame(pd.read_csv(file)) for file in files]
    combined = pd.concat(frames, ignore_index=True)
    if "table_kind" not in combined:
        return combined, files

    kinds = combined["table_kind"].astype("string")
    static_mask = kinds.eq("static")
    if not bool(static_mask.any()):
        return combined, files

    static = combined.loc[static_mask].copy()
    monthly = combined.loc[~static_mask].copy()
    if monthly.empty:
        raise ValueError(
            "Static GEE exports were found, but no monthly dynamic/combined "
            "exports are available for assembly."
        )
    duplicate_static = static["grid_id"].duplicated(keep=False)
    if bool(duplicate_static.any()):
        examples = sorted(static.loc[duplicate_static, "grid_id"].astype(str).unique())[:5]
        raise ValueError(
            "Static GEE exports contain duplicate grid_id values; check "
            f"overlapping shards. Examples: {examples}"
        )

    static_metadata = [
        "admin0_name",
        "admin1_name",
        "admin1_code",
        "source_srtm",
        "source_jrc_water",
        "source_soil",
        "soil_features_in_export",
        "soil_uncertainty_available",
        "soilgrids_native_resolution_m",
    ]
    payload = [
        column
        for column in [*STATIC_FEATURE_COLUMNS, *static_metadata]
        if column in static.columns and static[column].notna().any()
    ]
    # Pandas concatenation creates the union of both schemas, so drop the
    # all-null static placeholders from monthly rows before the many-to-one
    # join to avoid suffixes.
    monthly = monthly.drop(columns=[column for column in payload if column in monthly])
    static_side = static.loc[:, ["grid_id", *payload]]
    merged = monthly.merge(
        static_side,
        on="grid_id",
        how="left",
        validate="many_to_one",
    )
    return merged, files


def _scope_token(value: object) -> str:
    return "".join(character.casefold() for character in str(value) if character.isalnum())


def validate_regional_raw_scope(
    frame: pd.DataFrame,
    raw_files: list[Path],
    config: dict[str, Any],
) -> None:
    """Fail closed when regional raw inputs do not identify the release scope.

    New regional exports should include ``admin1_name``. Frozen pilot exports
    predate that field, so their immutable task filenames remain a secondary
    provenance guard. This does not replace a future point-in-polygon check,
    but it prevents a differently named regional export from being silently
    assembled and relabelled under another release contract.
    """

    release_scope = str(config["project"].get("scope_admin1") or "").strip()
    if not release_scope:
        return
    expected_token = _scope_token(release_scope)
    mismatched_files = [
        path.name
        for path in raw_files
        if expected_token not in _scope_token(path.stem)
    ]
    if mismatched_files:
        raise ValueError(
            "Regional raw input filename does not identify the configured "
            f"project.scope_admin1 {release_scope!r}: {mismatched_files[:5]}"
        )

    if "admin1_name" not in frame:
        return
    observed = (
        frame["admin1_name"]
        .astype("string")
        .dropna()
        .str.strip()
    )
    observed = observed.loc[observed.ne("")]
    if observed.empty:
        return
    allowed = {release_scope}
    if release_scope == "Bago":
        allowed.update({"Bago (E)", "Bago (W)"})
    unexpected = sorted(set(observed.astype(str)).difference(allowed))
    if unexpected:
        raise ValueError(
            "GEE export contains admin1_name values outside the configured "
            f"regional release scope {release_scope!r}: {unexpected[:5]}"
        )


def _calculate_trailing_rainfall(frame: pd.DataFrame) -> pd.Series:
    """Calculate an honest 12-observation trailing sum where GEE did not export it."""

    result = pd.Series(np.nan, index=frame.index, dtype=float)
    ordered = frame.loc[:, ["grid_id", "year_month", "monthly_rainfall_mm"]].copy()
    ordered["_original_index"] = ordered.index
    ordered["_date"] = pd.to_datetime(ordered["year_month"] + "-01", errors="coerce")
    ordered["monthly_rainfall_mm"] = pd.to_numeric(ordered["monthly_rainfall_mm"], errors="coerce")
    ordered = ordered.sort_values(["grid_id", "_date"])
    rolling = ordered.groupby("grid_id", sort=False)["monthly_rainfall_mm"].transform(
        lambda values: values.rolling(window=12, min_periods=12).sum()
    )
    result.loc[ordered["_original_index"].to_numpy()] = rolling.to_numpy()
    return result


def _derive_water_availability(frame: pd.DataFrame) -> pd.Series:
    """Make a documented 0–100 water-access proxy without treating NDWI as soil moisture."""

    components: list[tuple[pd.Series, float]] = []
    if "era5_soil_moisture_m3_m3" in frame:
        value = pd.to_numeric(frame["era5_soil_moisture_m3_m3"], errors="coerce")
        components.append((((value - 0.05) / 0.35).clip(0, 1), 0.40))
    if "distance_to_surface_water_m" in frame:
        value = pd.to_numeric(frame["distance_to_surface_water_m"], errors="coerce")
        components.append(((1 - value / 50_000).clip(0, 1), 0.25))
    if "surface_water_occurrence_pct" in frame:
        value = pd.to_numeric(frame["surface_water_occurrence_pct"], errors="coerce")
        components.append(((value / 100).clip(0, 1), 0.20))
    if "annual_rainfall_mm" in frame:
        value = pd.to_numeric(frame["annual_rainfall_mm"], errors="coerce")
        components.append(((value / 2_000).clip(0, 1), 0.15))
    weighted = pd.Series(0.0, index=frame.index)
    available_weight = pd.Series(0.0, index=frame.index)
    for values, weight in components:
        present = values.notna()
        weighted.loc[present] += values.loc[present] * weight
        available_weight.loc[present] += weight
    return (100 * weighted / available_weight.where(available_weight > 0)).round(2)


def enrich_physical_features(frame: pd.DataFrame, config: dict[str, Any]) -> pd.DataFrame:
    """Derive only transparent, unit-preserving composite features."""

    output = frame.copy()
    if "chirps_precipitation_mm" not in output and "monthly_rainfall_mm" in output:
        output["chirps_precipitation_mm"] = output["monthly_rainfall_mm"]
    if "monthly_rainfall_mm" not in output and "chirps_precipitation_mm" in output:
        output["monthly_rainfall_mm"] = output["chirps_precipitation_mm"]
    if "annual_rainfall_mm" not in output:
        output["annual_rainfall_mm"] = _calculate_trailing_rainfall(output)
    else:
        annual = pd.to_numeric(output["annual_rainfall_mm"], errors="coerce")
        output["annual_rainfall_mm"] = annual.where(annual.notna(), _calculate_trailing_rainfall(output))
    # The final target-month rainfall may have been replaced from the
    # authoritative local CHIRPS v3 monthly cache after the GEE export. Rebuild
    # rainfall anomalies from that final value so the released columns remain
    # algebraically consistent with one another.
    if (
        "rainfall_normal_1991_2020_mm" in output
        and "monthly_rainfall_mm" in output
    ):
        rainfall = pd.to_numeric(output["monthly_rainfall_mm"], errors="coerce")
        rainfall_normal = pd.to_numeric(
            output["rainfall_normal_1991_2020_mm"], errors="coerce"
        )
        rainfall_anomaly = rainfall - rainfall_normal
        output["rainfall_anomaly_1991_2020_mm"] = rainfall_anomaly
        output["rainfall_anomaly_1991_2020_pct"] = (
            rainfall_anomaly.divide(rainfall_normal.where(rainfall_normal != 0))
            * 100.0
        )
    # Support a raw J/m²/day value only when a source exporter explicitly uses
    # that unambiguous column name; avoid unit guesses for unknown fields.
    if "solar_radiation_mj_m2_day" not in output and "solar_radiation_j_m2_day" in output:
        output["solar_radiation_mj_m2_day"] = pd.to_numeric(output["solar_radiation_j_m2_day"], errors="coerce") / 1_000_000
    output["water_availability_score"] = _derive_water_availability(output)
    return output


def attach_project_context(frame: pd.DataFrame, config: dict[str, Any]) -> pd.DataFrame:
    """Attach trusted country scope without inventing lower-level geography.

    Older exports omitted ``admin0_name`` when the optional, expensive admin-1
    lookup was disabled. The export geometry and configuration are still
    explicitly restricted to ISO3 MMR. Fill only that deterministic country
    context, record its origin, and reject conflicting source values.
    """

    output = frame.copy()
    iso3 = str(config["project"].get("iso3", "")).strip().upper()
    country = str(config["project"].get("country_name", "")).strip()
    if iso3 != "MMR" or country.casefold() != "myanmar":
        raise ValueError(
            "Project context can only attach admin0_name for the configured Myanmar/ISO3 MMR scope."
        )
    if "admin0_name" in output:
        admin0 = output["admin0_name"].astype("string")
    else:
        admin0 = pd.Series(pd.NA, index=output.index, dtype="string")
    blank = admin0.isna() | admin0.str.strip().eq("")
    conflict = ~blank & admin0.str.strip().str.casefold().ne("myanmar")
    if bool(conflict.any()):
        examples = sorted(admin0.loc[conflict].dropna().astype(str).unique())[:5]
        raise ValueError(
            "GEE export contains admin0 values that conflict with the Myanmar project scope: "
            f"{examples}"
        )
    output["admin0_name"] = admin0.mask(blank, country)
    output["admin0_source"] = np.where(
        blank, "project_scope_config", "source_export"
    )
    return output


def _soil_columns_present(frame: pd.DataFrame) -> bool:
    required = [
        "soil_ph_h2o_0_30cm",
        "soil_sand_pct_0_30cm",
        "soil_silt_pct_0_30cm",
        "soil_clay_pct_0_30cm",
        "soil_soc_g_kg_0_30cm",
        "soil_cec_cmol_kg_0_30cm",
    ]
    return all(column in frame and pd.to_numeric(frame[column], errors="coerce").notna().any() for column in required)


def attach_soil_if_needed(frame: pd.DataFrame, config: dict[str, Any]) -> pd.DataFrame:
    """Use local/WebDAV SoilGrids only when GEE's community assets did not provide soil."""

    output = frame.copy()
    if _soil_columns_present(output):
        output["soil_data_status"] = output.get("soil_data_status", "gee_community_asset")
        return output
    soil_config = dict(config["soilgrids"])
    soil_config["webdav_base_url"] = config["sources"]["soilgrids_webdav"]
    return attach_soilgrids_from_cache(output, soil_config, cache_dir=config["project"]["soil_cache_dir"])


def consumed_source_files(frame: pd.DataFrame, config: dict[str, Any]) -> list[Path]:
    """Return local source files that materially contributed to this run.

    The final manifest hashes these files, so a later reader can distinguish a
    real CHIRPS/SoilGrids/observed-label input from an untracked cache.  GEE
    table exports themselves are recorded separately as raw inputs.
    """

    candidates: list[Path] = []
    if bool(config["chirps_v3"].get("enabled", True)) and "year_month" in frame:
        months = sorted(frame["year_month"].dropna().astype(str).unique())
        candidates.extend(
            path
            for path in expected_cache_paths(config["project"]["chirps_v3_cache_dir"], months)
            if path.is_file()
        )

    soil_status = frame.get("soil_data_status", pd.Series("", index=frame.index)).astype("string")
    if soil_status.str.contains("local|webdav", case=False, na=False).any():
        soil_cache = Path(config["project"]["soil_cache_dir"])
        if soil_cache.is_dir():
            candidates.extend(
                path
                for path in soil_cache.rglob("*")
                if path.is_file() and path.suffix.lower() in {".tif", ".tiff", ".vrt", ".json"}
            )

    observed_path = config["project"].get("observed_labels_path")
    if observed_path:
        candidate = Path(observed_path)
        if candidate.is_file():
            candidates.append(candidate)

    # Resolve and deduplicate without relying on raw strings that may be
    # relative aliases of the same file.
    unique = {path.resolve() for path in candidates if path.is_file()}
    return sorted(unique, key=str)


def add_quality_fields(frame: pd.DataFrame, config: dict[str, Any]) -> pd.DataFrame:
    """Add explicit no-imputation quality flags and row-level missingness."""

    output = frame.copy()
    # Treat absent feature fields as missing rather than shrinking the
    # denominator. This keeps quality comparable across GEE and local-fallback
    # runs and never fabricates a value.
    for column in STATIC_FEATURE_COLUMNS + MONTHLY_FEATURE_COLUMNS:
        if column not in output:
            output[column] = np.nan
    minimum_observations = int(config["quality"]["min_valid_s2_observations"])
    s2_raw = output["s2_valid_observation_count"] if "s2_valid_observation_count" in output else pd.Series(np.nan, index=output.index)
    s2_count = pd.to_numeric(s2_raw, errors="coerce")
    output["s2_data_status"] = np.where(
        s2_count.isna(), "missing", np.where(s2_count < minimum_observations, "insufficient_valid_observations", "available")
    )
    s1_available = output.get("s1_vv_db_median", pd.Series(np.nan, index=output.index)).notna()
    output["s1_data_status"] = np.where(s1_available, "available", "missing_or_not_requested")
    if "soil_data_status" not in output:
        output["soil_data_status"] = "not_available"
    climate_fields_present = [
        column
        for column in OPTIONAL_CLIMATE_CONTEXT_COLUMNS
        if column in output.columns
    ]
    if len(climate_fields_present) == len(OPTIONAL_CLIMATE_CONTEXT_COLUMNS):
        climate_complete = output[OPTIONAL_CLIMATE_CONTEXT_COLUMNS].notna().all(
            axis=1
        )
        output["climate_context_status"] = np.where(
            climate_complete,
            "historical_same_month_normal_and_anomaly",
            "incomplete_historical_context",
        )
        output["climate_baseline_period"] = "1991-2020"
        output["climate_context_interpretation"] = (
            "historical_context_not_attribution_forecast_or_projection"
        )
    elif climate_fields_present:
        output["climate_context_status"] = "incomplete_historical_context"
        output["climate_baseline_period"] = "1991-2020"
        output["climate_context_interpretation"] = (
            "historical_context_not_attribution_forecast_or_projection"
        )
    else:
        output["climate_context_status"] = "not_in_release"
    tracked = STATIC_FEATURE_COLUMNS + MONTHLY_FEATURE_COLUMNS
    output["feature_missing_fraction"] = output[tracked].isna().mean(axis=1).round(4)
    max_missing = float(config["quality"]["max_missing_feature_fraction"])
    output["usable_for_training"] = (
        output["feature_missing_fraction"].notna()
        & (output["feature_missing_fraction"] <= max_missing)
    ).astype("boolean")
    output["source_versions_json"] = source_versions_json(config)
    output["processing_timestamp_utc"] = datetime.now(timezone.utc).isoformat()
    return output


def _ensure_public_schema(frame: pd.DataFrame, crops: list[str]) -> pd.DataFrame:
    """Fill absent optional schema columns with nulls and order all public columns."""

    output = frame.copy()
    for column in required_columns(crops):
        if column not in output:
            output[column] = pd.NA
    optional_extra = [column for column in output.columns if column not in required_columns(crops)]
    return output.loc[:, required_columns(crops) + optional_extra]


def assemble_dataset(
    config: dict[str, Any],
    *,
    raw_dir: str | Path | None = None,
    output_dir: str | Path | None = None,
    write_plain_csv: bool = False,
) -> dict[str, Path]:
    """Assemble source values into QA-gated CSV, Parquet, and provenance files.

    ``write_plain_csv`` is opt-in because a country-wide monthly table can use
    several gigabytes uncompressed.  The default compressed CSV contains the
    same records without producing a redundant compatibility copy.
    """

    raw_location = Path(raw_dir or config["project"]["raw_gee_dir"])
    destination = Path(output_dir or config["project"]["output_dir"])
    destination.mkdir(parents=True, exist_ok=True)
    frame, raw_files = read_gee_exports(raw_location)
    validate_regional_raw_scope(frame, raw_files, config)
    frame = attach_project_context(frame, config)
    if bool(config["chirps_v3"].get("enabled", True)):
        frame = attach_chirps_v3_from_cache(
            frame,
            cache_dir=config["project"]["chirps_v3_cache_dir"],
            base_url=config["sources"]["chirps_v3_monthly_base_url"],
            require_complete_cache=bool(config["chirps_v3"].get("require_complete_cache", True)),
        )
    else:
        # This is an intentional compatibility/pilot mode, not an invisible
        # replacement for the specified CHIRPS v3 final rainfall source.
        frame["rainfall_data_status"] = "gee_chirps_staging_only"
    frame = enrich_physical_features(frame, config)
    frame = attach_soil_if_needed(frame, config)
    frame = add_quality_fields(frame, config)
    crops = list(config["labels"]["crops"])
    frame = add_rule_based_labels(
        frame,
        crops=crops,
        suitability_threshold=float(config["labels"]["suitability_threshold"]),
        rule_confidence_cap=float(config["labels"]["default_rule_confidence"]),
    )
    frame = calibrate_with_observed_labels(
        frame,
        config["project"].get("observed_labels_path"),
        crops=crops,
        suitability_threshold=float(config["labels"]["suitability_threshold"]),
        calibration_weight=float(config["labels"]["calibration_weight"]),
        observed_confidence=float(config["labels"]["observed_label_confidence"]),
    )
    frame = add_split_manifest_columns(frame)
    frame["sample_id"] = frame["grid_id"].astype(str) + "__" + frame["year_month"].astype(str)
    frame = _ensure_public_schema(frame, crops)
    frame = frame.sort_values(["year_month", "grid_id"]).reset_index(drop=True)

    prefix = config["project"]["name"]
    csv_path = destination / f"{prefix}.csv.gz"
    plain_csv_path = destination / f"{prefix}.csv"
    parquet_path = destination / f"{prefix}.parquet"
    split_path = destination / f"{prefix}_split_manifest.csv"
    dictionary_path = destination / "data_dictionary.md"
    resource_audit_path = destination / "collabhub_resource_audit.csv"
    external_feature_manifest_path = destination / "external_feature_manifest.csv"
    manifest_path = destination / "source_manifest.json"
    qa_path = destination / "qa_report.json"

    # Validate the assembled frame before publishing model artifacts.  A failed
    # run leaves its diagnostic QA JSON but never overwrites a release CSV or
    # Parquet with a table that has unacceptably missing source features.
    from .validation import validate_dataset, write_qa_report

    qa_report = validate_dataset(
        frame,
        expected_crops=crops,
        strict_schema=True,
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
    write_qa_report(qa_report, qa_path)
    if not qa_report["valid"]:
        raise ValueError(
            "Assembly QA failed; no final CSV/Parquet was published. "
            f"Inspect {qa_path} for the failed release gate(s)."
        )

    frame.to_csv(csv_path, index=False, compression="gzip")
    if write_plain_csv:
        frame.to_csv(plain_csv_path, index=False)
    try:
        frame.to_parquet(parquet_path, index=False)
    except ImportError as exc:  # pragma: no cover - optional dependency failure
        raise RuntimeError("Parquet output requires `pip install -e '.[full]'` (pyarrow)") from exc
    split_manifest(frame).to_csv(split_path, index=False)
    write_data_dictionary(dictionary_path, crops)
    # These are metadata contracts, not source observations. They make the
    # CollabHub audit reproducible without merging web resources into GEE data.
    write_collabhub_resource_audit(resource_audit_path)
    write_external_feature_manifest(external_feature_manifest_path)

    output_files = [
        csv_path,
        parquet_path,
        split_path,
        dictionary_path,
        resource_audit_path,
        external_feature_manifest_path,
        qa_path,
    ]
    if write_plain_csv:
        output_files.insert(1, plain_csv_path)
    manifest = build_manifest(
        config=config,
        raw_files=raw_files,
        output_files=output_files,
        source_files=consumed_source_files(frame, config),
        frame=frame,
    )
    manifest["qa_summary"] = qa_report
    manifest["plain_csv_requested"] = bool(write_plain_csv)
    write_json(manifest_path, manifest)
    artifacts = {
        "csv": csv_path,
        "parquet": parquet_path,
        "split_manifest": split_path,
        "data_dictionary": dictionary_path,
        "resource_audit": resource_audit_path,
        "external_feature_manifest": external_feature_manifest_path,
        "manifest": manifest_path,
        "qa_report": qa_path,
    }
    if write_plain_csv:
        artifacts["plain_csv"] = plain_csv_path
    return artifacts


def describe_assembly_plan(config: dict[str, Any]) -> dict[str, Any]:
    """Return a side-effect-free description useful before costly GEE exports."""

    return {
        "country": config["project"]["country_name"],
        "iso3": config["project"]["iso3"],
        "period": [config["project"]["start_month"], config["project"]["end_month"]],
        "grid_size_m": config["project"]["grid_size_m"],
        "crops": config["labels"]["crops"],
        "raw_gee_dir": config["project"]["raw_gee_dir"],
        "output_dir": config["project"]["output_dir"],
        "note": "No data is fabricated. GEE exports must finish before assembly.",
    }
