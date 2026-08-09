import { createHash } from 'node:crypto';

import { MODEL_TARGETS, type ModelTarget } from '../catalog.js';

export const WEEKLY_REGIONS = [
  'yangon',
  'bago',
  'mandalay',
  'sagaing',
  'magway',
  'ayeyawaddy',
] as const;

export type WeeklyRegion = (typeof WEEKLY_REGIONS)[number];

export const CROP_KEYS = [
  'monsoon_rice',
  'dry_season_rice',
  'black_gram',
  'green_gram',
  'maize',
  'groundnut',
  'chili',
  'sesame',
  'sugarcane',
  'cassava',
  'tomato',
  'pigeon_pea',
  'rubber',
  'mango',
  'durian',
  'mangosteen',
  'longan',
] as const;

export type CropKey = (typeof CROP_KEYS)[number];

export const MODEL_FEATURE_NAMES = [
  'elevation_m',
  'slope_degrees',
  'aspect_degrees',
  'distance_to_surface_water_m',
  'soil_cec_cmol_kg_0_30cm',
  'soil_clay_pct_0_30cm',
  'soil_sand_pct_0_30cm',
  'soil_silt_pct_0_30cm',
  'soil_soc_g_kg_0_30cm',
  'soil_ph_h2o_0_30cm',
  'surface_water_occurrence_pct',
  'surface_water_seasonality_months',
  'distance_to_road_km',
  'road_density_km_per_sqkm',
  'distance_to_railway_km',
  'railway_density_km_per_sqkm',
  'distance_to_river_km',
  'river_density_km_per_sqkm',
  'urban_fraction',
  'builtup_fraction',
  'cropland_fraction',
  'non_cropland_fraction',
  'permanent_water_fraction',
  'population_density',
  'valid_agriculture_mask',
  'chirps_precipitation_mm',
  'mean_temperature_c',
  'solar_radiation_mj_m2_day',
  'chirps_precipitation_mm_mean',
  'chirps_precipitation_mm_max',
  'chirps_precipitation_mm_min',
  'chirps_precipitation_mm_range',
  'chirps_precipitation_mm_cv',
  'era5_soil_moisture_m3_m3_mean',
  'era5_soil_moisture_m3_m3_max',
  'era5_soil_moisture_m3_m3_min',
  'era5_soil_moisture_m3_m3_cv',
  'mean_temperature_c_mean',
  'mean_temperature_c_max',
  'mean_temperature_c_min',
  'mean_temperature_c_range',
  'ndvi_median_mean',
  'ndvi_median_max',
  'ndvi_median_min',
  'ndvi_median_growing_season_mean',
  'ndwi_mcf_median_mean',
  'ndwi_mcf_median_max',
  's1_vh_db_median_mean',
  's1_vv_db_median_mean',
  'solar_radiation_mj_m2_day_mean',
  'solar_radiation_mj_m2_day_max',
  'data_month',
  'crop_area_pct_monsoon_rice',
  'crop_area_pct_dry_season_rice',
  'crop_area_pct_maize',
  'crop_area_pct_sugarcane',
  'crop_area_pct_cassava',
  'crop_area_pct_durian',
  'crop_area_pct_mangosteen',
  'crop_area_pct_longan',
  'crop_area_pct_mango',
  'crop_area_pct_chili',
  'crop_area_pct_tomato',
  'crop_area_pct_black_gram',
  'crop_area_pct_green_gram',
  'crop_area_pct_pigeon_pea',
  'crop_area_pct_groundnut',
  'crop_area_pct_sesame',
  'crop_area_pct_rubber',
  'region_ayeyawaddy',
  'region_bago',
  'region_magway',
  'region_mandalay',
  'region_sagaing',
  'region_yangon',
] as const;

export type ModelFeatureName = (typeof MODEL_FEATURE_NAMES)[number];
export type ModelFeatureRow = Record<ModelFeatureName, number> & { grid_id: string };

export const MODEL_INPUT_SCHEMA_SHA256 =
  '35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8';
export const AUDITED_MODEL_CATALOG_VERSION =
  '3ea1ea395518c6eda8872129a41cd9f19bd43fbb82e83937871ca28a15fe8795';
export const WEEKLY_SCHEMA_VERSION = 'weekly-model-input-v1';

export const HEALTHY_MODEL_TARGETS = [
  'crop_health_score',
  'crop_yield_t_ha',
  'flood_risk_level',
  'drought_risk_score',
  'nitrogen_requirement_level',
  'phosphorus_requirement_level',
  'soil_erosion_risk',
  'market_integration_score',
  'post_harvest_loss_risk',
  'irrigation_potential',
  'agricultural_gdp_forecast',
] as const satisfies readonly ModelTarget[];

const healthyTargets = new Set<ModelTarget>(HEALTHY_MODEL_TARGETS);

export const FLAGGED_MODEL_TARGETS = MODEL_TARGETS.filter(
  (target) => !healthyTargets.has(target),
);

export function modelTargetsForPolicy(allowFlaggedModels: boolean): ModelTarget[] {
  return allowFlaggedModels ? [...MODEL_TARGETS] : [...HEALTHY_MODEL_TARGETS];
}

export function normalizeRegion(value: string): WeeklyRegion | undefined {
  const normalized = value.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  const alias = normalized === 'ayeyarwady' ? 'ayeyawaddy' : normalized;
  return WEEKLY_REGIONS.find((region) => region === alias);
}

const calculatedFeatureSchema = createHash('sha256')
  .update(JSON.stringify(MODEL_FEATURE_NAMES))
  .digest('hex');

if (MODEL_FEATURE_NAMES.length !== 75 || calculatedFeatureSchema !== MODEL_INPUT_SCHEMA_SHA256) {
  throw new Error('The checked-in model feature contract does not match the audited schema.');
}
