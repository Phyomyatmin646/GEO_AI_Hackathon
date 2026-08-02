export const MODEL_TARGETS = [
  'crop_health_score',
  'crop_yield_t_ha',
  'irrigation_need',
  'current_month_precipitation_mm',
  'current_month_mean_temperature_c',
  'current_month_solar_rad_mj_m2_day',
  'flood_risk_level',
  'drought_risk_score',
  'heat_stress_risk',
  'optimal_planting_month',
  'nitrogen_requirement_level',
  'phosphorus_requirement_level',
  'soil_erosion_risk',
  'market_integration_score',
  'post_harvest_loss_risk',
  'supply_chain_efficiency',
  'cold_chain_potential',
  'agricultural_land_conversion_risk',
  'urban_encroachment_risk',
  'irrigation_potential',
  'surface_water_occurrence',
  'water_scarcity_risk',
  'agricultural_gdp_forecast',
  'crop_suitability_monsoon_rice',
  'crop_suitability_dry_season_rice',
  'crop_suitability_maize',
  'crop_suitability_sugarcane',
  'crop_suitability_cassava',
  'crop_suitability_durian',
  'crop_suitability_mangosteen',
  'crop_suitability_longan',
  'crop_suitability_mango',
  'crop_suitability_chili',
  'crop_suitability_tomato',
  'crop_suitability_black_gram',
  'crop_suitability_green_gram',
  'crop_suitability_pigeon_pea',
  'crop_suitability_groundnut',
  'crop_suitability_sesame',
  'crop_suitability_rubber',
] as const;

export const COMPOSITE_FEATURES = [
  'crop_recommender',
  'crop_health',
  'economic_roi',
  'risk_alerts',
  'land_use',
] as const;

export type ModelTarget = (typeof MODEL_TARGETS)[number];
export type CompositeFeature = (typeof COMPOSITE_FEATURES)[number];

export const COMPOSITE_DEPENDENCIES: Readonly<
  Record<CompositeFeature, readonly ModelTarget[]>
> = {
  crop_recommender: MODEL_TARGETS.filter((target) =>
    target.startsWith('crop_suitability_'),
  ),
  crop_health: ['crop_health_score'],
  // The model server intentionally returns ROI as unavailable until verified
  // farm-gate prices and cost inputs exist. Do not run unrelated surrogate
  // models merely to produce that safe unavailable response.
  economic_roi: [],
  risk_alerts: [
    'flood_risk_level',
    'drought_risk_score',
    'heat_stress_risk',
    'soil_erosion_risk',
    'water_scarcity_risk',
  ],
  land_use: ['agricultural_land_conversion_risk', 'urban_encroachment_risk'],
};

export function resolveExpectedTargets(input: {
  targets?: readonly ModelTarget[];
  include_all_targets: boolean;
  composite_features?: readonly CompositeFeature[];
}): ModelTarget[] {
  const expected = input.include_all_targets ? [...MODEL_TARGETS] : [...(input.targets ?? [])];
  const seen = new Set<ModelTarget>(expected);
  for (const composite of input.composite_features ?? []) {
    for (const target of COMPOSITE_DEPENDENCIES[composite]) {
      if (!seen.has(target)) {
        expected.push(target);
        seen.add(target);
      }
    }
  }
  return expected;
}
