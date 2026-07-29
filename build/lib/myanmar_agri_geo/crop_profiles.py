"""Provisional, transparent crop-suitability profiles for Myanmar.

The profiles in this module are deliberately rule based.  They are a useful
baseline for a public-data pilot, not agronomic ground truth: every generated
label is marked ``rule_based`` and carries deliberately limited confidence.
An agronomist should review and calibrate these thresholds with local trials,
crop calendars, irrigation information, and observed yield/crop-area records
before the labels are used as production recommendations.

All feature values are expected to be in their physical units.  This module
does not normalise, impute, or fabricate observations.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Any, Mapping


# The threshold used by the dataset specification.  Keep it central so a
# model-training run can record the rule that produced its binary label.
DEFAULT_SUITABILITY_THRESHOLD = 70.0

# A rule-derived label must not be presented as an observed label.  Its
# confidence is capped below one even when every input is available.
RULE_BASED_CONFIDENCE_CAP = 0.45


@dataclass(frozen=True)
class SuitabilityBand:
    """A transparent trapezoid response curve in native feature units.

    Values in ``[ideal_min, ideal_max]`` receive 100.  Scores decline linearly
    toward 0 at the two hard limits.  Values outside the hard limits receive
    0.  For a one-sided constraint, set the corresponding ideal endpoint equal
    to its hard limit.
    """

    minimum: float
    ideal_min: float
    ideal_max: float
    maximum: float

    def __post_init__(self) -> None:
        if not (self.minimum <= self.ideal_min <= self.ideal_max <= self.maximum):
            raise ValueError(
                "SuitabilityBand values must satisfy "
                "minimum <= ideal_min <= ideal_max <= maximum"
            )

    def score(self, value: float) -> float:
        """Return a 0--100 score for one finite value."""

        if self.ideal_min <= value <= self.ideal_max:
            return 100.0
        if value <= self.minimum or value >= self.maximum:
            # The endpoints are hard limits unless they coincide with an
            # ideal endpoint (which represents a one-sided constraint).
            return 0.0
        if value < self.ideal_min:
            span = self.ideal_min - self.minimum
            return 100.0 if span == 0 else 100.0 * (value - self.minimum) / span
        span = self.maximum - self.ideal_max
        return 100.0 if span == 0 else 100.0 * (self.maximum - value) / span


@dataclass(frozen=True)
class CropProfile:
    """Rule-based suitability thresholds for a single crop or crop season.

    ``monthly_rainfall_mm`` represents the current month.  The annual value is
    a trailing or calendar-year total supplied by the data pipeline.  Water is
    a documented, 0--100 availability index; it is *not* NDWI/NDMI, which are
    canopy/surface-moisture proxies rather than physical soil moisture.
    """

    crop_id: str
    display_name: str
    category: str
    temperature_c: SuitabilityBand
    monthly_rainfall_mm: SuitabilityBand
    annual_rainfall_mm: SuitabilityBand
    soil_ph_0_30cm: SuitabilityBand
    slope_degrees: SuitabilityBand
    solar_radiation_mj_m2_day: SuitabilityBand
    water_availability_score: SuitabilityBand
    weights: Mapping[str, float]
    notes: str

    def __post_init__(self) -> None:
        required = set(_CANONICAL_FEATURES)
        received = set(self.weights)
        if received != required:
            missing = sorted(required - received)
            extra = sorted(received - required)
            raise ValueError(f"weights must cover exactly the canonical features; missing={missing}, extra={extra}")
        total = sum(self.weights.values())
        if any(weight < 0 for weight in self.weights.values()) or abs(total - 1.0) > 1e-9:
            raise ValueError("crop-profile weights must be non-negative and sum to 1.0")

    @property
    def bands(self) -> Mapping[str, SuitabilityBand]:
        """Map canonical data-column names to their scoring bands."""

        return {
            "mean_temperature_c": self.temperature_c,
            "monthly_rainfall_mm": self.monthly_rainfall_mm,
            "annual_rainfall_mm": self.annual_rainfall_mm,
            "soil_ph_0_30cm": self.soil_ph_0_30cm,
            "slope_degrees": self.slope_degrees,
            "solar_radiation_mj_m2_day": self.solar_radiation_mj_m2_day,
            "water_availability_score": self.water_availability_score,
        }


@dataclass(frozen=True)
class SuitabilityResult:
    """The auditable outcome of applying one provisional profile."""

    score: float | None
    is_suitable: bool | None
    label_source: str
    label_confidence: float
    factor_scores: Mapping[str, float | None]
    missing_features: tuple[str, ...]
    profile_version: str = "provisional-rule-v1"

    def as_dataset_fields(self, crop_id: str) -> dict[str, Any]:
        """Return the four stable label columns in the primary dataset table.

        ``profile_version`` and ``missing_features`` remain on this result for
        audit logs/manifests rather than expanding the fixed primary schema.
        """

        return {
            f"suitability_score__{crop_id}": self.score,
            f"is_suitable__{crop_id}": self.is_suitable,
            f"label_source__{crop_id}": self.label_source,
            f"label_confidence__{crop_id}": self.label_confidence,
        }


_CANONICAL_FEATURES = (
    "mean_temperature_c",
    "monthly_rainfall_mm",
    "annual_rainfall_mm",
    "soil_ph_0_30cm",
    "slope_degrees",
    "solar_radiation_mj_m2_day",
    "water_availability_score",
)

# The aliases make the scoring layer tolerant of source-specific names while
# retaining one canonical schema in exports and documentation.
FEATURE_ALIASES: Mapping[str, tuple[str, ...]] = {
    "mean_temperature_c": ("mean_temperature_c", "temperature_c", "temperature_2m_c", "temp_c"),
    "monthly_rainfall_mm": ("monthly_rainfall_mm", "rainfall_mm", "precipitation_mm"),
    "annual_rainfall_mm": ("annual_rainfall_mm", "rainfall_annual_mm", "precipitation_annual_mm"),
    "soil_ph_0_30cm": (
        "soil_ph_0_30cm",
        "soil_ph_h2o_0_30cm",
        "soil_ph",
        "phh2o_0_30cm",
    ),
    "slope_degrees": ("slope_degrees", "slope_deg", "slope"),
    "solar_radiation_mj_m2_day": (
        "solar_radiation_mj_m2_day",
        "solar_radiation_mj_m2_d",
        "surface_solar_radiation_mj_m2_day",
    ),
    "water_availability_score": ("water_availability_score", "water_availability", "water_score"),
}

_STANDARD_WEIGHTS: Mapping[str, float] = {
    "mean_temperature_c": 0.20,
    "monthly_rainfall_mm": 0.12,
    "annual_rainfall_mm": 0.20,
    "soil_ph_0_30cm": 0.15,
    "slope_degrees": 0.10,
    "solar_radiation_mj_m2_day": 0.10,
    "water_availability_score": 0.13,
}


def _profile(
    crop_id: str,
    display_name: str,
    category: str,
    *,
    temperature: tuple[float, float, float, float],
    monthly_rain: tuple[float, float, float, float],
    annual_rain: tuple[float, float, float, float],
    ph: tuple[float, float, float, float],
    slope: tuple[float, float, float, float],
    solar: tuple[float, float, float, float],
    water: tuple[float, float, float, float],
    notes: str,
    weights: Mapping[str, float] = _STANDARD_WEIGHTS,
) -> CropProfile:
    return CropProfile(
        crop_id=crop_id,
        display_name=display_name,
        category=category,
        temperature_c=SuitabilityBand(*temperature),
        monthly_rainfall_mm=SuitabilityBand(*monthly_rain),
        annual_rainfall_mm=SuitabilityBand(*annual_rain),
        soil_ph_0_30cm=SuitabilityBand(*ph),
        slope_degrees=SuitabilityBand(*slope),
        solar_radiation_mj_m2_day=SuitabilityBand(*solar),
        water_availability_score=SuitabilityBand(*water),
        weights=dict(weights),
        notes=notes,
    )


# These bands are deliberately broad, explainable starting points rather than
# a claim of crop-specific local truth.  They must be calibrated by a Myanmar
# agronomist before operational use.
CROP_PROFILES: Mapping[str, CropProfile] = {
    "monsoon_rice": _profile(
        "monsoon_rice", "Monsoon rice (မိုးစပါး)", "rice",
        temperature=(18, 24, 32, 38), monthly_rain=(40, 120, 350, 650), annual_rain=(800, 1_200, 2_500, 4_000),
        ph=(4.5, 5.5, 7.0, 8.5), slope=(0, 0, 3, 12), solar=(8, 14, 22, 30), water=(35, 60, 100, 100),
        notes="Seasonal rainfall and field water retention/irrigation are critical; profile does not replace flood-risk analysis.",
    ),
    "dry_season_rice": _profile(
        "dry_season_rice", "Dry-season rice (နွေစပါး)", "rice",
        temperature=(18, 24, 33, 40), monthly_rain=(0, 20, 180, 450), annual_rain=(500, 800, 2_500, 4_000),
        ph=(4.5, 5.5, 7.0, 8.5), slope=(0, 0, 3, 12), solar=(8, 16, 25, 32), water=(60, 80, 100, 100),
        notes="Requires dependable controlled irrigation; low rainfall is acceptable only where water availability is high.",
    ),
    "maize": _profile(
        "maize", "Maize (ပြောင်း)", "industrial_crop",
        temperature=(10, 18, 30, 35), monthly_rain=(20, 70, 220, 450), annual_rain=(500, 700, 1_500, 2_500),
        ph=(5.0, 5.8, 7.0, 7.8), slope=(0, 0, 8, 18), solar=(10, 16, 25, 32), water=(25, 50, 85, 100),
        notes="Drainage and growth-stage rainfall distribution need local calibration.",
    ),
    "sugarcane": _profile(
        "sugarcane", "Sugarcane (ကြံ)", "industrial_crop",
        temperature=(15, 21, 32, 38), monthly_rain=(20, 80, 280, 500), annual_rain=(900, 1_200, 2_500, 3_500),
        ph=(5.0, 5.8, 7.5, 8.2), slope=(0, 0, 5, 15), solar=(10, 16, 26, 32), water=(35, 60, 95, 100),
        notes="High water demand is represented by the water-availability band; local variety and harvest-season requirements vary.",
    ),
    "cassava": _profile(
        "cassava", "Cassava (ပီလောပီနံ)", "industrial_crop",
        temperature=(18, 22, 30, 35), monthly_rain=(10, 50, 220, 450), annual_rain=(500, 900, 1_800, 3_000),
        ph=(4.0, 5.0, 6.5, 8.0), slope=(0, 0, 10, 20), solar=(10, 16, 27, 33), water=(15, 35, 75, 100),
        notes="Relatively drought-tolerant after establishment; prolonged waterlogging is not captured by this simple profile.",
    ),
    "durian": _profile(
        "durian", "Durian (ဒူးရင်း)", "tropical_fruit",
        temperature=(20, 24, 30, 34), monthly_rain=(40, 120, 300, 550), annual_rain=(1_300, 1_800, 3_000, 4_000),
        ph=(5.0, 5.5, 6.5, 7.5), slope=(0, 1, 12, 25), solar=(8, 14, 22, 30), water=(45, 70, 95, 100),
        notes="Sensitive to waterlogging and wind; drainage, frost risk, and orchard management must be assessed separately.",
    ),
    "mangosteen": _profile(
        "mangosteen", "Mangosteen (မင်းဂွတ်)", "tropical_fruit",
        temperature=(20, 24, 30, 34), monthly_rain=(50, 130, 320, 600), annual_rain=(1_500, 2_000, 3_000, 4_000),
        ph=(5.0, 5.5, 6.5, 7.5), slope=(0, 1, 12, 25), solar=(7, 12, 21, 29), water=(50, 75, 100, 100),
        notes="Needs reliably moist, well-drained conditions; this profile is not a disease or drainage model.",
    ),
    "longan": _profile(
        "longan", "Longan (လောင်ဂန်)", "tropical_fruit",
        temperature=(12, 20, 30, 36), monthly_rain=(10, 50, 220, 450), annual_rain=(700, 1_000, 2_000, 3_000),
        ph=(5.0, 5.5, 7.0, 8.0), slope=(0, 1, 12, 25), solar=(9, 15, 25, 32), water=(30, 55, 85, 100),
        notes="Cool/dry flowering cues and cultivar choice are omitted; calibrate for northern Myanmar microclimates.",
    ),
    "mango": _profile(
        "mango", "Mango (သရက်)", "tropical_fruit",
        temperature=(15, 22, 32, 40), monthly_rain=(5, 40, 220, 500), annual_rain=(500, 800, 2_000, 3_000),
        ph=(4.5, 5.5, 7.5, 8.5), slope=(0, 1, 12, 25), solar=(10, 17, 27, 34), water=(20, 45, 80, 100),
        notes="A dry flowering period can be beneficial; local cultivar and irrigation strategy must be supplied for final advice.",
    ),
    "chili": _profile(
        "chili", "Chili (ငရုတ်)", "vegetable",
        temperature=(15, 20, 30, 35), monthly_rain=(5, 40, 160, 350), annual_rain=(400, 700, 1_500, 2_500),
        ph=(5.0, 6.0, 7.0, 8.0), slope=(0, 0, 5, 15), solar=(10, 16, 26, 33), water=(30, 55, 85, 100),
        notes="Excess rain and poor drainage increase disease risk; disease pressure is outside this profile.",
    ),
    "tomato": _profile(
        "tomato", "Tomato (ခရမ်းချဉ်)", "vegetable",
        temperature=(10, 18, 28, 33), monthly_rain=(0, 25, 120, 300), annual_rain=(300, 600, 1_500, 2_500),
        ph=(5.0, 6.0, 7.0, 7.8), slope=(0, 0, 5, 15), solar=(10, 16, 25, 32), water=(35, 60, 85, 100),
        notes="Cooler, drier production periods are generally preferred; protected cultivation and variety are not modelled.",
    ),
    "rubber": _profile(
        "rubber", "Rubber (ရာဘာ)", "industrial_crop",
        temperature=(20, 25, 30, 35), monthly_rain=(50, 150, 300, 500), annual_rain=(1_500, 2_000, 3_500, 4_500),
        ph=(4.5, 5.0, 6.5, 7.5), slope=(0, 2, 15, 25), solar=(9, 14, 22, 28), water=(40, 70, 100, 100),
        notes="Needs a dry spell for latex collection, but steady rainfall for growth. Wind damage is a risk.",
    ),
    "teak": _profile(
        "teak", "Teak (ကျွန်း)", "timber",
        temperature=(15, 22, 32, 40), monthly_rain=(10, 50, 250, 500), annual_rain=(800, 1_300, 2_500, 3_500),
        ph=(6.0, 6.5, 7.5, 8.5), slope=(0, 2, 15, 30), solar=(10, 15, 25, 30), water=(30, 60, 90, 100),
        notes="Requires a pronounced dry season of 3-5 months for quality timber development. Intolerant of waterlogging.",
    ),
    "oil_palm": _profile(
        "oil_palm", "Oil Palm (ဆီအုန်း)", "industrial_crop",
        temperature=(22, 25, 32, 35), monthly_rain=(100, 150, 350, 550), annual_rain=(1_800, 2_200, 3_500, 4_500),
        ph=(4.0, 5.0, 6.5, 7.5), slope=(0, 0, 8, 15), solar=(12, 16, 25, 30), water=(60, 80, 100, 100),
        notes="Highly sensitive to dry spells > 2 months. Requires evenly distributed rainfall throughout the year.",
    ),
    "cashew": _profile(
        "cashew", "Cashew (သီဟိုဠ်သရက်)", "tropical_fruit",
        temperature=(15, 22, 32, 38), monthly_rain=(0, 20, 200, 400), annual_rain=(500, 1_000, 2_500, 3_500),
        ph=(4.5, 5.5, 6.5, 7.5), slope=(0, 2, 15, 25), solar=(10, 16, 26, 32), water=(20, 40, 80, 100),
        notes="Drought-hardy. Dry weather is essential during flowering and nut development. Sensitive to frost.",
    ),
}

CROP_IDS = tuple(CROP_PROFILES)


def _finite_float(value: Any) -> float | None:
    """Convert a scalar safely without treating booleans as measurements."""

    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if isfinite(number) else None


def _feature_value(features: Mapping[str, Any], canonical_name: str) -> float | None:
    for name in FEATURE_ALIASES[canonical_name]:
        if name in features:
            return _finite_float(features[name])
    return None


def score_crop(
    crop_id: str,
    features: Mapping[str, Any],
    *,
    suitability_threshold: float = DEFAULT_SUITABILITY_THRESHOLD,
    minimum_feature_coverage: float = 0.75,
) -> SuitabilityResult:
    """Score one crop using present, physical-unit features only.

    Missing features are never silently filled.  If weighted coverage is below
    ``minimum_feature_coverage`` (default: 75%), the returned score and binary
    label are ``None``.  Otherwise, available factor scores are reweighted and
    reported together with a low, rule-based confidence value.  This lets a
    pipeline preserve a usable provisional label while retaining auditability.
    """

    if crop_id not in CROP_PROFILES:
        valid = ", ".join(CROP_IDS)
        raise KeyError(f"Unknown crop_id {crop_id!r}; choose one of: {valid}")
    if not 0.0 <= suitability_threshold <= 100.0:
        raise ValueError("suitability_threshold must be between 0 and 100")
    if not 0.0 < minimum_feature_coverage <= 1.0:
        raise ValueError("minimum_feature_coverage must be in (0, 1]")

    profile = CROP_PROFILES[crop_id]
    factor_scores: dict[str, float | None] = {}
    available_weight = 0.0
    weighted_total = 0.0
    missing: list[str] = []
    for feature_name, band in profile.bands.items():
        value = _feature_value(features, feature_name)
        if value is None:
            factor_scores[feature_name] = None
            missing.append(feature_name)
            continue
        factor_score = round(max(0.0, min(100.0, band.score(value))), 4)
        factor_scores[feature_name] = factor_score
        weight = profile.weights[feature_name]
        available_weight += weight
        weighted_total += weight * factor_score

    # Confidence is intentionally capped because these are not observed labels.
    confidence = round(RULE_BASED_CONFIDENCE_CAP * available_weight, 4)
    if available_weight < minimum_feature_coverage:
        return SuitabilityResult(
            score=None,
            is_suitable=None,
            label_source="rule_based",
            label_confidence=confidence,
            factor_scores=factor_scores,
            missing_features=tuple(missing),
        )

    score = round(weighted_total / available_weight, 2)
    return SuitabilityResult(
        score=score,
        is_suitable=score >= suitability_threshold,
        label_source="rule_based",
        label_confidence=confidence,
        factor_scores=factor_scores,
        missing_features=tuple(missing),
    )


def score_all_crops(
    features: Mapping[str, Any],
    *,
    suitability_threshold: float = DEFAULT_SUITABILITY_THRESHOLD,
    minimum_feature_coverage: float = 0.75,
) -> dict[str, SuitabilityResult]:
    """Return auditable provisional results for all 11 target crops."""

    return {
        crop_id: score_crop(
            crop_id,
            features,
            suitability_threshold=suitability_threshold,
            minimum_feature_coverage=minimum_feature_coverage,
        )
        for crop_id in CROP_IDS
    }


def flatten_all_crop_results(
    features: Mapping[str, Any],
    *,
    suitability_threshold: float = DEFAULT_SUITABILITY_THRESHOLD,
    minimum_feature_coverage: float = 0.75,
) -> dict[str, Any]:
    """Return dataset-ready suitability/label columns for all crop profiles."""

    flattened: dict[str, Any] = {}
    for crop_id, result in score_all_crops(
        features,
        suitability_threshold=suitability_threshold,
        minimum_feature_coverage=minimum_feature_coverage,
    ).items():
        flattened.update(result.as_dataset_fields(crop_id))
    return flattened


__all__ = [
    "CROP_IDS",
    "CROP_PROFILES",
    "DEFAULT_SUITABILITY_THRESHOLD",
    "FEATURE_ALIASES",
    "RULE_BASED_CONFIDENCE_CAP",
    "CropProfile",
    "SuitabilityBand",
    "SuitabilityResult",
    "flatten_all_crop_results",
    "score_all_crops",
    "score_crop",
]
