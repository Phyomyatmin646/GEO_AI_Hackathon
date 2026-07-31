import { z } from 'zod';

export const InfrastructureFeaturesSchema = z.object({
  distance_to_road_km: z.number(),
  road_density_km_per_sqkm: z.number(),
  distance_to_railway_km: z.number(),
  railway_density_km_per_sqkm: z.number(),
  distance_to_river_km: z.number(),
  river_density_km_per_sqkm: z.number()
});

export const LandCoverFeaturesSchema = z.object({
  urban_fraction: z.number(),
  builtup_fraction: z.number(),
  cropland_fraction: z.number(),
  non_cropland_fraction: z.number(),
  permanent_water_fraction: z.number(),
  valid_agriculture_mask: z.number(),
  landcover_source_year: z.number()
});

export const MetadataFeaturesSchema = z.object({
  data_source: z.string(),
  source_date: z.string(),
  source_version: z.string(),
  quality_flag: z.number()
});

export const BaseFeaturesSchema = z.object({
  temperature_min: z.number().optional(),
  temperature_max: z.number().optional(),
  temperature_mean: z.number().optional(),
  rainfall_monthly: z.number().optional(),
  humidity: z.number().optional(),
  solar_radiation: z.number().optional(),
  elevation: z.number().optional(),
  slope: z.number().optional(),
  soil_ph: z.number().optional(),
  soil_moisture: z.number().optional(),
  soil_texture: z.string().optional(),
  organic_carbon: z.number().optional(),
  drainage: z.string().optional(),
  ndvi: z.number().optional(),
  evi: z.number().optional(),
  ndwi: z.number().optional(),
  land_surface_temperature: z.number().optional(),
  cloud_percentage: z.number().optional(),
  crop_name: z.string().optional(),
  crop_stage: z.string().optional(),
  planting_date: z.string().optional(),
  harvest_date: z.string().optional(),
  harvested_area: z.number().optional()
});

export const PredictionRequestSchema = z.object({
  requestId: z.string(),
  modelId: z.string().optional(),
  task: z.string().optional(),
  crop: z.string().optional(),
  region: z.string().optional(),
  gridCellId: z.string().optional(),
  features: z.object({
    infrastructure: InfrastructureFeaturesSchema,
    landCover: LandCoverFeaturesSchema,
    metadata: MetadataFeaturesSchema,
    base: BaseFeaturesSchema
  })
}).refine(data => data.modelId || (data.task && data.crop && data.region), "Either modelId OR (task, crop, region) must be provided for model selection");

export const PredictionResponseSchema = z.object({
  requestId: z.string(),
  modelId: z.string(),
  modelVersion: z.string(),
  prediction: z.union([z.number(), z.string(), z.record(z.string(), z.any())]),
  unit: z.string(),
  confidence: z.number().optional(),
  warnings: z.array(z.string()).optional(),
  inputDataVersion: z.string(),
  modelChecksum: z.string(),
  inferenceDurationMs: z.number(),
  timestamp: z.string(),
  resultType: z.enum(['measured', 'derived', 'rule-based', 'model-predicted'])
});

export type PredictionRequest = z.infer<typeof PredictionRequestSchema>;
export type PredictionResponse = z.infer<typeof PredictionResponseSchema>;
