import { z } from 'zod';

import { COMPOSITE_DEPENDENCIES, MODEL_TARGETS } from '../catalog.js';
import { ModelTargetSchema } from './prediction.js';

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, 'expected a SHA-256 digest');
const ValueRangeSchema = z
  .tuple([z.number().finite().nullable(), z.number().finite().nullable()])
  .superRefine(([minimum, maximum], context) => {
    if (minimum !== null && maximum !== null && minimum > maximum) {
      context.addIssue({
        code: 'custom',
        message: 'value_range minimum cannot exceed maximum',
      });
    }
  });
const CatalogClassesSchema = z
  .array(z.union([z.string().min(1).max(200), z.number().finite()]))
  .min(1)
  .max(1_000)
  .refine(
    (classes) => new Set(classes.map(String)).size === classes.length,
    'classification classes must be unique after string conversion',
  );

const ModelCatalogItemCommonSchema = z
  .object({
    model_id: ModelTargetSchema,
    display_name: z.string().min(1).max(200),
    unit: z.string().min(1).max(100),
    model_version: z.string().min(1).max(200),
    artifact_sha256: Sha256Schema,
    input_schema_sha256: Sha256Schema,
    artifact_size_bytes: z.number().int().nonnegative(),
    model_source: z.literal('primary'),
    deployment_status: z.literal('experimental'),
    validation_status: z.enum(['healthy', 'flagged', 'unknown']),
    field_validated: z.literal(false),
    label_source: z.literal('rule_engineered_surrogate'),
    metrics: z.record(z.string(), z.union([z.number().finite(), z.string(), z.null()])),
    warnings: z.array(z.string().min(1).max(1_000)).max(100),
    ready: z.boolean(),
  })
  .strict();

const ClassificationCatalogItemSchema = ModelCatalogItemCommonSchema.extend({
  task_type: z.literal('classification'),
  classes: CatalogClassesSchema,
  value_range: z.null().optional(),
  probability_calibrated: z.literal(false),
});

const RegressionCatalogItemSchema = ModelCatalogItemCommonSchema.extend({
  task_type: z.literal('regression'),
  classes: z.null(),
  value_range: ValueRangeSchema,
  probability_calibrated: z.null(),
});

export const ModelCatalogItemSchema = z.discriminatedUnion('task_type', [
  ClassificationCatalogItemSchema,
  RegressionCatalogItemSchema,
]);

export const ModelCatalogResponseSchema = z
  .object({
    api_version: z.literal('v1'),
    contract_version: z.literal('model-inference-v1'),
    catalog_version: Sha256Schema,
    feature_dataset_sha256: Sha256Schema,
    spatial_index_sha256: Sha256Schema,
    capabilities: z
      .object({
        max_expanded_sync_targets: z.number().int().min(1).max(MODEL_TARGETS.length),
        supports_composite_only_requests: z.literal(true),
        composite_dependencies: z
          .object({
            crop_recommender: z.array(ModelTargetSchema).max(MODEL_TARGETS.length),
            crop_health: z.array(ModelTargetSchema).max(MODEL_TARGETS.length),
            economic_roi: z.array(ModelTargetSchema).max(MODEL_TARGETS.length),
            risk_alerts: z.array(ModelTargetSchema).max(MODEL_TARGETS.length),
            land_use: z.array(ModelTargetSchema).max(MODEL_TARGETS.length),
          })
          .strict(),
      })
      .strict(),
    models: z.array(ModelCatalogItemSchema).length(MODEL_TARGETS.length),
  })
  .strict()
  .superRefine((catalog, context) => {
    const ids = catalog.models.map((model) => model.model_id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        path: ['models'],
        message: 'model catalog contains duplicate model IDs',
      });
    }
    const present = new Set(ids);
    const missing = MODEL_TARGETS.filter((target) => !present.has(target));
    if (missing.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['models'],
        message: `model catalog omitted required targets: ${missing.join(', ')}`,
      });
    }
    for (const composite of Object.keys(COMPOSITE_DEPENDENCIES) as Array<keyof typeof COMPOSITE_DEPENDENCIES>) {
      const actual = catalog.capabilities.composite_dependencies[composite];
      const expected = COMPOSITE_DEPENDENCIES[composite];
      if (
        actual.length !== expected.length ||
        expected.some((target) => !actual.includes(target))
      ) {
        context.addIssue({
          code: 'custom',
          path: ['capabilities', 'composite_dependencies', composite],
          message: `model catalog composite dependency mismatch for ${composite}`,
        });
      }
    }
  });

export const ModelServerReadyResponseSchema = z
  .object({
    status: z.literal('ready'),
    catalog_version: Sha256Schema,
    model_count: z.literal(MODEL_TARGETS.length),
    spatial_rows: z.number().int().positive(),
  })
  .strict();

const ErrorDetailsSchema = z.record(z.string(), z.unknown());

export const ModelServerErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1).max(100),
        message: z.string().min(1).max(2_000),
        request_id: z.string().min(1).max(128),
        retryable: z.boolean(),
        details: z.array(ErrorDetailsSchema).max(100).nullable(),
      })
      .strict(),
  })
  .strict();

export type ModelCatalogResponse = z.infer<typeof ModelCatalogResponseSchema>;
export type ModelServerReadyResponse = z.infer<typeof ModelServerReadyResponseSchema>;
export type ModelServerErrorResponse = z.infer<typeof ModelServerErrorResponseSchema>;
