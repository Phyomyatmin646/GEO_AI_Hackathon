"""Vectorised, auditable construction of crop-suitability label columns."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .crop_profiles import CROP_PROFILES, DEFAULT_SUITABILITY_THRESHOLD, RULE_BASED_CONFIDENCE_CAP


CANONICAL_FEATURE_ALIASES = {
    "mean_temperature_c": ("mean_temperature_c", "temperature_c", "temperature_2m_c", "temp_c"),
    "monthly_rainfall_mm": ("monthly_rainfall_mm", "chirps_precipitation_mm", "rainfall_mm"),
    "annual_rainfall_mm": ("annual_rainfall_mm", "rainfall_annual_mm"),
    "soil_ph_0_30cm": ("soil_ph_0_30cm", "soil_ph_h2o_0_30cm", "soil_ph"),
    "slope_degrees": ("slope_degrees", "slope_deg", "slope"),
    "solar_radiation_mj_m2_day": ("solar_radiation_mj_m2_day", "surface_solar_radiation_mj_m2_day"),
    "water_availability_score": ("water_availability_score", "water_availability", "water_score"),
}


def _series_for(frame: pd.DataFrame, aliases: tuple[str, ...]) -> pd.Series:
    for name in aliases:
        if name in frame.columns:
            return pd.to_numeric(frame[name], errors="coerce")
    return pd.Series(np.nan, index=frame.index, dtype=float)


def _band_scores(values: pd.Series, minimum: float, ideal_min: float, ideal_max: float, maximum: float) -> pd.Series:
    """Vectorised equivalent of ``SuitabilityBand.score`` with NaNs retained."""

    result = pd.Series(np.nan, index=values.index, dtype=float)
    finite = values.notna() & np.isfinite(values)
    if not finite.any():
        return result
    result.loc[finite & (values <= minimum)] = 0.0
    result.loc[finite & (values >= maximum)] = 0.0
    ideal = finite & values.between(ideal_min, ideal_max, inclusive="both")
    result.loc[ideal] = 100.0
    ascending = finite & (values > minimum) & (values < ideal_min)
    if ideal_min > minimum:
        result.loc[ascending] = 100.0 * (values.loc[ascending] - minimum) / (ideal_min - minimum)
    descending = finite & (values > ideal_max) & (values < maximum)
    if maximum > ideal_max:
        result.loc[descending] = 100.0 * (maximum - values.loc[descending]) / (maximum - ideal_max)
    return result.clip(0, 100)


def add_rule_based_labels(
    frame: pd.DataFrame,
    *,
    crops: list[str] | tuple[str, ...],
    suitability_threshold: float = DEFAULT_SUITABILITY_THRESHOLD,
    minimum_feature_coverage: float = 0.75,
    rule_confidence_cap: float = RULE_BASED_CONFIDENCE_CAP,
) -> pd.DataFrame:
    """Add suitability columns without row-wise Python loops.

    The score is a weighted mean of available agronomic factors only where at
    least ``minimum_feature_coverage`` of profile weight is present.  It is a
    provisional rule label, never an observed crop/yield outcome.
    """

    if not 0 < minimum_feature_coverage <= 1:
        raise ValueError("minimum_feature_coverage must be in (0, 1]")
    if not 0 < rule_confidence_cap <= 0.50:
        raise ValueError("rule_confidence_cap must be in (0, 0.50]")
    output = frame.copy()
    features = {name: _series_for(output, aliases) for name, aliases in CANONICAL_FEATURE_ALIASES.items()}
    for crop in crops:
        if crop not in CROP_PROFILES:
            raise ValueError(f"Unknown configured crop: {crop}")
        profile = CROP_PROFILES[crop]
        weighted_sum = pd.Series(0.0, index=output.index)
        available_weight = pd.Series(0.0, index=output.index)
        for feature_name, band in profile.bands.items():
            factor_score = _band_scores(features[feature_name], band.minimum, band.ideal_min, band.ideal_max, band.maximum)
            present = factor_score.notna()
            weight = profile.weights[feature_name]
            weighted_sum.loc[present] += factor_score.loc[present] * weight
            available_weight.loc[present] += weight
        complete_enough = available_weight >= minimum_feature_coverage
        score = (weighted_sum / available_weight.where(available_weight > 0)).where(complete_enough).round(2)
        output[f"suitability_score__{crop}"] = score
        output[f"is_suitable__{crop}"] = pd.Series(pd.NA, index=output.index, dtype="boolean")
        output.loc[score.notna(), f"is_suitable__{crop}"] = score.loc[score.notna()] >= suitability_threshold
        output[f"label_source__{crop}"] = "rule_based"
        # A rules-only label is deliberately low-confidence.  The cap is
        # configured once at the dataset level and cannot exceed 0.50.
        output[f"label_confidence__{crop}"] = (
            rule_confidence_cap * available_weight
        ).clip(upper=rule_confidence_cap).round(4)
    return output


def _read_observed_labels(path: str | Path) -> pd.DataFrame:
    observed_path = Path(path)
    if not observed_path.is_file():
        raise FileNotFoundError(f"Observed-label file does not exist: {observed_path}")
    observed = pd.read_csv(observed_path)
    required = {"grid_id", "year_month", "crop_id"}
    missing = required.difference(observed.columns)
    if missing:
        raise ValueError(
            "Observed labels must be long-form and include "
            f"{sorted(required)}; missing {sorted(missing)}"
        )
    score_col = next((name for name in ("observed_suitability_score", "observed_score") if name in observed.columns), None)
    bool_col = next((name for name in ("observed_is_suitable", "observed_suitable") if name in observed.columns), None)
    if score_col is None and bool_col is None:
        raise ValueError("Observed labels need observed_suitability_score/observed_score or observed_is_suitable")
    output = observed.loc[:, ["grid_id", "year_month", "crop_id"]].copy()
    if score_col:
        output["observed_score"] = pd.to_numeric(observed[score_col], errors="coerce")
    else:
        truthy = observed[bool_col].astype(str).str.lower().isin(["1", "true", "yes", "y"])
        falsy = observed[bool_col].astype(str).str.lower().isin(["0", "false", "no", "n"])
        output["observed_score"] = np.where(truthy, 100.0, np.where(falsy, 0.0, np.nan))
    output["observed_score"] = output["observed_score"].clip(0, 100)
    duplicate_keys = output.duplicated(["grid_id", "year_month", "crop_id"], keep=False)
    if duplicate_keys.any():
        raise ValueError("Observed labels contain duplicate grid_id/year_month/crop_id keys")
    return output


def calibrate_with_observed_labels(
    frame: pd.DataFrame,
    observed_labels_path: str | Path | None,
    *,
    crops: list[str] | tuple[str, ...],
    suitability_threshold: float,
    calibration_weight: float,
    observed_confidence: float,
) -> pd.DataFrame:
    """Blend supplied observed labels into provisional scores with provenance.

    The observed file never becomes a model input. A provided observed score
    can either calibrate a rule score (``hybrid``) or stand alone where the
    required public environmental feature coverage was insufficient.
    """

    if observed_labels_path is None:
        return frame
    if not 0 <= calibration_weight <= 1:
        raise ValueError("calibration_weight must be between 0 and 1")
    output = frame.copy()
    observed = _read_observed_labels(observed_labels_path)
    for crop in crops:
        crop_obs = observed.loc[observed["crop_id"] == crop, ["grid_id", "year_month", "observed_score"]]
        if crop_obs.empty:
            continue
        temp_name = f"_observed_score__{crop}"
        crop_obs = crop_obs.rename(columns={"observed_score": temp_name})
        output = output.merge(crop_obs, on=["grid_id", "year_month"], how="left", validate="many_to_one")
        rule_col = f"suitability_score__{crop}"
        source_col = f"label_source__{crop}"
        confidence_col = f"label_confidence__{crop}"
        observed_score = output[temp_name]
        has_observed = observed_score.notna()
        has_rule = output[rule_col].notna()
        both = has_observed & has_rule
        output.loc[both, rule_col] = (
            output.loc[both, rule_col] * (1 - calibration_weight) + observed_score.loc[both] * calibration_weight
        ).round(2)
        output.loc[both, source_col] = "hybrid_rule_observed"
        output.loc[both, confidence_col] = (
            output.loc[both, confidence_col] * (1 - calibration_weight) + observed_confidence * calibration_weight
        ).round(4)
        observed_only = has_observed & ~has_rule
        output.loc[observed_only, rule_col] = observed_score.loc[observed_only]
        output.loc[observed_only, source_col] = "observed"
        output.loc[observed_only, confidence_col] = observed_confidence
        labels = output[rule_col].notna()
        output.loc[labels, f"is_suitable__{crop}"] = output.loc[labels, rule_col] >= suitability_threshold
        output = output.drop(columns=[temp_name])
    return output
