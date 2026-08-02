export const HIGH_IMPORTANCE_TARGETS = [
  "crop_suitability_monsoon_rice",
  "crop_suitability_dry_season_rice",
  "crop_suitability_black_gram",
  "crop_suitability_groundnut",
  "crop_health_score",
  "crop_yield_t_ha",
  "irrigation_need",
  "flood_risk_level",
  "drought_risk_score",
  "heat_stress_risk",
  "agricultural_gdp_forecast",
] as const;

export const MEDIUM_IMPORTANCE_TARGETS = [
  "crop_suitability_maize",
  "crop_suitability_sugarcane",
  "crop_suitability_cassava",
  "crop_suitability_chili",
  "crop_suitability_tomato",
  "crop_suitability_green_gram",
  "crop_suitability_pigeon_pea",
  "crop_suitability_sesame",
  "crop_suitability_rubber",
  "current_month_precipitation_mm",
  "current_month_mean_temperature_c",
  "current_month_solar_rad_mj_m2_day",
  "soil_erosion_risk",
  "surface_water_occurrence",
  "water_scarcity_risk",
  "optimal_planting_month",
  "nitrogen_requirement_level",
  "phosphorus_requirement_level",
  "irrigation_potential",
  "market_integration_score",
  "post_harvest_loss_risk",
  "supply_chain_efficiency",
  "cold_chain_potential",
  "agricultural_land_conversion_risk",
  "urban_encroachment_risk",
] as const;

export const LOW_IMPORTANCE_TARGETS = [
  "crop_suitability_durian",
  "crop_suitability_mangosteen",
  "crop_suitability_longan",
  "crop_suitability_mango",
] as const;

export const CORE_MODEL_TARGETS = [
  ...HIGH_IMPORTANCE_TARGETS,
  ...MEDIUM_IMPORTANCE_TARGETS,
  ...LOW_IMPORTANCE_TARGETS,
] as const;

export const CROP_MODEL_TARGETS = {
  monsoon_rice: "crop_suitability_monsoon_rice",
  dry_season_rice: "crop_suitability_dry_season_rice",
  black_gram: "crop_suitability_black_gram",
  groundnut: "crop_suitability_groundnut",
  maize: "crop_suitability_maize",
  sugarcane: "crop_suitability_sugarcane",
  cassava: "crop_suitability_cassava",
  chili: "crop_suitability_chili",
  tomato: "crop_suitability_tomato",
  green_gram: "crop_suitability_green_gram",
  pigeon_pea: "crop_suitability_pigeon_pea",
  sesame: "crop_suitability_sesame",
  rubber: "crop_suitability_rubber",
  durian: "crop_suitability_durian",
  mangosteen: "crop_suitability_mangosteen",
  longan: "crop_suitability_longan",
  mango: "crop_suitability_mango",
} as const;

export type CoreModelTarget = (typeof CORE_MODEL_TARGETS)[number];
export type CropModelTarget = (typeof CROP_MODEL_TARGETS)[keyof typeof CROP_MODEL_TARGETS];
export type DashboardModelTarget = CoreModelTarget;


export type DashboardCompositeFeature = "crop_recommender";

export type PredictionRequest = {
  request_id?: string;
  sample_id?: string;
  lat?: number;
  lon?: number;
  observation_month?: string;
  targets?: DashboardModelTarget[];
  include_all_targets?: boolean;
  composite_features?: DashboardCompositeFeature[];
};

export type ModelPrediction = {
  value: number | string;
  label: string | null;
  unit: string;
  task_type: "classification" | "regression";
  confidence: number | null;
  confidence_kind: "random_forest_vote_share_uncalibrated" | null;
  probabilities: Record<string, number> | null;
  model_version: string;
  artifact_sha256: string;
  input_schema_sha256: string;
  model_source: "primary" | "prototype";
  deployment_status: "experimental";
  validation_status: "healthy" | "flagged" | "unknown";
  warnings: string[];
};

export type PredictionResponse = {
  api_version: "v1";
  contract_version: "model-inference-v1";
  catalog_version: string;
  request_id: string;
  status: "success";
  location: {
    sample_id: string;
    grid_id: string;
    region: string;
    observation_month: string;
    requested_lat: number | null;
    requested_lon: number | null;
    matched_lat: number;
    matched_lon: number;
    distance_km: number;
  };
  predictions: Partial<Record<DashboardModelTarget, ModelPrediction>>;
  composite_features: Record<string, unknown>;
  provenance: {
    feature_dataset_sha256: string;
    spatial_index_sha256: string;
    data_source: string | null;
    source_date: string | null;
    source_version: string | null;
    quality_flag: number | null;
    label_source: "rule_engineered_surrogate";
    field_validated: false;
  };
  execution_metadata: {
    response_time_ms: number;
    queue_wait_ms: number;
    cached: boolean;
    models_loaded_count: number;
  };
};

export type CropTierRecommendation = {
  crop: keyof typeof CROP_MODEL_TARGETS;
  suitability: "poor" | "moderate" | "good" | "excellent";
  tree_vote_agreement: number | null;
  color_code: string;
};

export type CropRecommenderComposite = {
  status: "experimental";
  strict_ranking_available: false;
  reason_code: "CROSS_MODEL_CALIBRATION_REQUIRED";
  recommendation_basis: string;
  top_suitability_tier: "poor" | "moderate" | "good" | "excellent" | null;
  top_recommendations: CropTierRecommendation[];
  suitability_tiers: Record<
    "poor" | "moderate" | "good" | "excellent",
    CropTierRecommendation[]
  >;
  probability_calibrated: false;
  field_validated: false;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPredictionResponse(value: unknown): value is PredictionResponse {
  if (!isRecord(value) || !isRecord(value.location) || !isRecord(value.provenance)) {
    return false;
  }
  if (!isRecord(value.predictions) || !isRecord(value.execution_metadata)) return false;
  if (
    value.api_version !== "v1" ||
    value.contract_version !== "model-inference-v1" ||
    typeof value.catalog_version !== "string" ||
    !/^[a-f0-9]{64}$/i.test(value.catalog_version) ||
    value.status !== "success" ||
    typeof value.request_id !== "string" ||
    value.provenance.field_validated !== false ||
    value.provenance.label_source !== "rule_engineered_surrogate"
  ) {
    return false;
  }
  return Object.values(value.predictions).every(
    (prediction) =>
      isRecord(prediction) &&
      prediction.deployment_status === "experimental" &&
      prediction.model_source === "primary" &&
      (prediction.confidence_kind === null ||
        prediction.confidence_kind === "random_forest_vote_share_uncalibrated") &&
      typeof prediction.model_version === "string" &&
      typeof prediction.artifact_sha256 === "string",
  );
}

export function isCropRecommenderComposite(
  value: unknown,
): value is CropRecommenderComposite {
  if (
    !isRecord(value) ||
    value.status !== "experimental" ||
    value.strict_ranking_available !== false ||
    value.reason_code !== "CROSS_MODEL_CALIBRATION_REQUIRED" ||
    value.probability_calibrated !== false ||
    value.field_validated !== false ||
    !Array.isArray(value.top_recommendations) ||
    !isRecord(value.suitability_tiers)
  ) {
    return false;
  }
  const cropIds = new Set(Object.keys(CROP_MODEL_TARGETS));
  const tiers = new Set(["poor", "moderate", "good", "excellent"]);
  const validItem = (item: unknown): item is CropTierRecommendation =>
    isRecord(item) &&
    typeof item.crop === "string" &&
    cropIds.has(item.crop) &&
    typeof item.suitability === "string" &&
    tiers.has(item.suitability) &&
    (item.tree_vote_agreement === null ||
      (typeof item.tree_vote_agreement === "number" &&
        Number.isFinite(item.tree_vote_agreement) &&
        item.tree_vote_agreement >= 0 &&
        item.tree_vote_agreement <= 1)) &&
    typeof item.color_code === "string";
  if (!value.top_recommendations.every(validItem)) return false;
  const suitabilityTiers = value.suitability_tiers;
  return ["poor", "moderate", "good", "excellent"].every(
    (tier) => Array.isArray(suitabilityTiers[tier]) &&
      suitabilityTiers[tier].every(validItem),
  );
}

export function cropModelTarget(cropId: string | undefined): CropModelTarget | undefined {
  if (!cropId || !(cropId in CROP_MODEL_TARGETS)) return undefined;
  return CROP_MODEL_TARGETS[cropId as keyof typeof CROP_MODEL_TARGETS];
}
