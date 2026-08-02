import { z } from 'zod';

import { COMPOSITE_FEATURES, MODEL_TARGETS } from '../catalog.js';

export const ModelTargetSchema = z.enum(MODEL_TARGETS);
export const CompositeFeatureSchema = z.enum(COMPOSITE_FEATURES);

const RequestIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'request_id contains unsupported characters');
const SampleIdSchema = z
  .string()
  .min(1)
  .max(160);
const ObservationMonthSchema = z
  .string()
  .regex(/^20\d{2}-(0[1-9]|1[0-2])$/, 'observation_month must use YYYY-MM (2000-2099)');

function uniqueValues(values: readonly string[] | undefined): boolean {
  return !values || new Set(values).size === values.length;
}

export const PredictionRequestSchema = z
  .object({
    request_id: RequestIdSchema.optional(),
    sample_id: SampleIdSchema.optional(),
    lat: z.number().finite().min(9).max(29).optional(),
    lon: z.number().finite().min(92).max(102).optional(),
    observation_month: ObservationMonthSchema.optional(),
    targets: z
      .array(ModelTargetSchema)
      .min(1)
      .max(MODEL_TARGETS.length)
      .refine(uniqueValues, 'targets must not contain duplicates')
      .optional(),
    include_all_targets: z.boolean().default(false),
    composite_features: z
      .array(CompositeFeatureSchema)
      .max(COMPOSITE_FEATURES.length)
      .refine(uniqueValues, 'composite_features must not contain duplicates')
      .default([]),
  })
  .strict()
  .superRefine((request, context) => {
    const usesSampleId = request.sample_id !== undefined;
    const coordinateFields = [request.lat, request.lon, request.observation_month];
    const usesAnyCoordinateField = coordinateFields.some((value) => value !== undefined);
    const usesAllCoordinateFields = coordinateFields.every((value) => value !== undefined);

    if (usesSampleId && usesAnyCoordinateField) {
      context.addIssue({
        code: 'custom',
        path: ['sample_id'],
        message: 'Use sample_id or lat/lon/observation_month, not both locators',
      });
    } else if (!usesSampleId && !usesAllCoordinateFields) {
      context.addIssue({
        code: 'custom',
        path: ['lat'],
        message: 'Provide exactly one locator: sample_id or lat/lon/observation_month',
      });
    }

    if (request.include_all_targets && request.targets) {
      context.addIssue({
        code: 'custom',
        path: ['targets'],
        message: 'targets must be omitted when include_all_targets is true',
      });
    }

    if (
      !request.include_all_targets &&
      !request.targets &&
      request.composite_features.length === 0
    ) {
      context.addIssue({
        code: 'custom',
        path: ['targets'],
        message: 'Provide targets, composite_features, or set include_all_targets to true',
      });
    }
  });

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, 'expected a SHA-256 digest');
const PredictionValueSchema = z.union([
  z.number().finite(),
  z
    .string()
    .min(1)
    .refine((value) => !/^error\s*:/i.test(value), 'model errors cannot be prediction values'),
]);

const PredictionCommonSchema = z
  .object({
    unit: z.string().min(1).max(100),
    model_version: z.string().min(1).max(200),
    artifact_sha256: Sha256Schema,
    input_schema_sha256: Sha256Schema,
    model_source: z.literal('primary'),
    deployment_status: z.literal('experimental'),
    validation_status: z.enum(['healthy', 'flagged', 'unknown']),
    warnings: z.array(z.string().min(1).max(1_000)).max(100),
  })
  .strict();

const ClassificationPredictionSchema = PredictionCommonSchema.extend({
  value: PredictionValueSchema,
  label: z.string().min(1).max(200),
  task_type: z.literal('classification'),
  confidence: z.number().finite().min(0).max(1).nullable(),
  confidence_kind: z.literal('random_forest_vote_share_uncalibrated'),
  probabilities: z
    .record(z.string().min(1).max(200), z.number().finite().min(0).max(1))
    .nullable(),
}).superRefine((prediction, context) => {
  if (prediction.label !== String(prediction.value)) {
    context.addIssue({
      code: 'custom',
      path: ['label'],
      message: 'classification label must match the prediction value',
    });
  }

  if (prediction.probabilities === null) {
    if (prediction.confidence !== null) {
      context.addIssue({
        code: 'custom',
        path: ['confidence'],
        message: 'confidence must be null when probabilities are unavailable',
      });
    }
    return;
  }

  const entries = Object.entries(prediction.probabilities);
  if (entries.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['probabilities'],
      message: 'probabilities must contain at least one class',
    });
    return;
  }
  if (!Object.hasOwn(prediction.probabilities, prediction.label)) {
    context.addIssue({
      code: 'custom',
      path: ['probabilities'],
      message: 'probabilities must contain the predicted label',
    });
  }
  const values = entries.map(([, value]) => value);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 1) > 1e-4) {
    context.addIssue({
      code: 'custom',
      path: ['probabilities'],
      message: 'classification probabilities must sum to 1',
    });
  }
  const maximum = Math.max(...values);
  if (prediction.confidence === null || Math.abs(prediction.confidence - maximum) > 1e-6) {
    context.addIssue({
      code: 'custom',
      path: ['confidence'],
      message: 'confidence must equal the maximum class probability',
    });
  }
});

const RegressionPredictionSchema = PredictionCommonSchema.extend({
  value: z.number().finite(),
  label: z.null(),
  task_type: z.literal('regression'),
  confidence: z.null(),
  confidence_kind: z.null(),
  probabilities: z.null(),
});

const CropRecommendationItemSchema = z
  .object({
    crop: z.string().min(1).max(100),
    suitability: z.enum(['poor', 'moderate', 'good', 'excellent']),
    tree_vote_agreement: z.number().finite().min(0).max(1).nullable(),
    color_code: z.string().regex(/^#[a-f0-9]{6}$/i),
  })
  .strict();

const CropRecommenderCompositeSchema = z
  .object({
    status: z.literal('experimental'),
    strict_ranking_available: z.literal(false),
    reason_code: z.literal('CROSS_MODEL_CALIBRATION_REQUIRED'),
    recommendation_basis: z.string().min(1).max(1_000),
    top_suitability_tier: z.enum(['poor', 'moderate', 'good', 'excellent']).nullable(),
    top_recommendations: z.array(CropRecommendationItemSchema).max(5),
    suitability_tiers: z
      .object({
        poor: z.array(CropRecommendationItemSchema),
        moderate: z.array(CropRecommendationItemSchema),
        good: z.array(CropRecommendationItemSchema),
        excellent: z.array(CropRecommendationItemSchema),
      })
      .strict(),
    probability_calibrated: z.literal(false),
    field_validated: z.literal(false),
  })
  .strict();

const CropHealthCompositeSchema = z
  .object({
    status: z.literal('experimental'),
    health_score: z.number().finite().min(0).max(1),
    health_class: z.enum(['Excellent', 'Good', 'Moderate', 'Poor', 'Critical']),
    ndvi_median: z.number().finite().nullable(),
    map_color_hex: z.string().regex(/^#[a-f0-9]{6}$/i),
    field_validated: z.literal(false),
  })
  .strict();

const EconomicRoiCompositeSchema = z
  .object({
    status: z.literal('unavailable'),
    reason_code: z.literal('VERIFIED_ECONOMIC_INPUTS_REQUIRED'),
    message: z.string().min(1).max(1_000),
  })
  .strict();

const RiskAlertsCompositeSchema = z
  .object({
    status: z.literal('experimental'),
    overall_level: z.enum(['low', 'medium', 'high']),
    risk_scores: z
      .object({
        flood: z.number().finite().min(0).max(1),
        drought: z.number().finite().min(0).max(1),
        heat: z.number().finite().min(0).max(1),
        erosion: z.number().finite().min(0).max(1),
        water_scarcity: z.number().finite().min(0).max(1),
      })
      .strict(),
    advisory_status: z.literal('human_review_required'),
    approved_action: z.null(),
    field_validated: z.literal(false),
  })
  .strict();

const LandUseCompositeSchema = z
  .object({
    status: z.literal('experimental'),
    risk_level: z.enum(['low', 'medium', 'high']),
    conversion_risk_score: z.number().finite().min(0).max(1),
    urban_encroachment_score: z.number().finite().min(0).max(1),
    cropland_fraction: z.number().finite().min(0).max(1).nullable(),
    field_validated: z.literal(false),
  })
  .strict();

export const ModelPredictionSchema = z.discriminatedUnion('task_type', [
  ClassificationPredictionSchema,
  RegressionPredictionSchema,
]);

export const PredictionResponseSchema = z
  .object({
    api_version: z.literal('v1'),
    contract_version: z.literal('model-inference-v1'),
    catalog_version: Sha256Schema,
    request_id: RequestIdSchema,
    status: z.literal('success'),
    location: z
      .object({
        sample_id: SampleIdSchema,
        grid_id: z.string().min(1),
        region: z.string().min(1),
        observation_month: ObservationMonthSchema,
        requested_lat: z.number().finite().min(9).max(29).nullable(),
        requested_lon: z.number().finite().min(92).max(102).nullable(),
        matched_lat: z.number().finite().min(9).max(29),
        matched_lon: z.number().finite().min(92).max(102),
        distance_km: z.number().finite().nonnegative(),
      })
      .strict(),
    predictions: z.partialRecord(ModelTargetSchema, ModelPredictionSchema),
    composite_features: z
      .object({
        crop_recommender: CropRecommenderCompositeSchema.optional(),
        crop_health: CropHealthCompositeSchema.optional(),
        economic_roi: EconomicRoiCompositeSchema.optional(),
        risk_alerts: RiskAlertsCompositeSchema.optional(),
        land_use: LandUseCompositeSchema.optional(),
      })
      .strict(),
    provenance: z
      .object({
        feature_dataset_sha256: Sha256Schema,
        spatial_index_sha256: Sha256Schema,
        data_source: z.string().nullable(),
        source_date: z.string().nullable(),
        source_version: z.string().nullable(),
        quality_flag: z.number().int().nullable(),
        label_source: z.literal('rule_engineered_surrogate'),
        field_validated: z.literal(false),
      })
      .strict(),
    execution_metadata: z
      .object({
        response_time_ms: z.number().finite().nonnegative(),
        queue_wait_ms: z.number().finite().nonnegative(),
        cached: z.boolean(),
        models_loaded_count: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export type PredictionRequest = z.infer<typeof PredictionRequestSchema>;
export type PredictionResponse = z.infer<typeof PredictionResponseSchema>;
