import { z } from 'zod';

import { MODEL_TARGETS } from '../catalog.js';
import { CROP_KEYS } from '../contracts/weekly.js';
import { ModelTargetSchema } from './prediction.js';

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, 'expected a SHA-256 digest');

export const ModelCatalogResponseSchema = z
  .object({
    api_version: z.literal('v1'),
    contract_version: z.literal('model-inference-v1'),
    total_targets: z.literal(MODEL_TARGETS.length),
    crops: z.array(z.enum(CROP_KEYS)).length(CROP_KEYS.length),
    targets: z.array(ModelTargetSchema).length(MODEL_TARGETS.length),
  })
  .strict()
  .superRefine((catalog, context) => {
    if (new Set(catalog.targets).size !== MODEL_TARGETS.length) {
      context.addIssue({ code: 'custom', path: ['targets'], message: 'model targets must be unique' });
    }
    if (MODEL_TARGETS.some((target) => !catalog.targets.includes(target))) {
      context.addIssue({
        code: 'custom',
        path: ['targets'],
        message: 'model target catalog is incomplete',
      });
    }
    if (new Set(catalog.crops).size !== CROP_KEYS.length) {
      context.addIssue({ code: 'custom', path: ['crops'], message: 'crop keys must be unique' });
    }
  });

export const ModelServerReadyResponseSchema = z
  .object({
    status: z.literal('ready'),
    catalog_version: Sha256Schema,
    model_targets_count: z.literal(MODEL_TARGETS.length),
  })
  .strict();

const BatchPredictionCommonSchema = z.object({
  unit: z.string().min(1).max(200),
  model_version: z.string().min(1).max(500),
  validation_status: z.enum(['healthy', 'flagged', 'unknown']),
  warnings: z.array(z.string().min(1).max(2_000)).max(100),
});

const BatchClassificationPredictionSchema = BatchPredictionCommonSchema.extend({
  value: z.union([z.number().finite(), z.string().min(1).max(500)]),
  label: z.string().min(1).max(500),
  task_type: z.literal('classification'),
  confidence: z.number().finite().min(0).max(1).nullable(),
  confidence_kind: z.literal('random_forest_vote_share_uncalibrated'),
  probabilities: z
    .record(z.string().min(1).max(500), z.number().finite().min(0).max(1))
    .nullable(),
})
  .strict()
  .superRefine((prediction, context) => {
    if (prediction.label !== String(prediction.value)) {
      context.addIssue({
        code: 'custom',
        path: ['label'],
        message: 'classification label must match value',
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
    const values = Object.values(prediction.probabilities);
    if (
      values.length === 0 ||
      !Object.hasOwn(prediction.probabilities, prediction.label) ||
      Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 1e-4 ||
      prediction.confidence === null ||
      Math.abs(prediction.confidence - Math.max(...values)) > 1e-6
    ) {
      context.addIssue({
        code: 'custom',
        path: ['probabilities'],
        message: 'classification probabilities or confidence are inconsistent',
      });
    }
  });

const BatchRegressionPredictionSchema = BatchPredictionCommonSchema.extend({
  value: z.number().finite(),
  label: z.null(),
  task_type: z.literal('regression'),
  confidence: z.null(),
  confidence_kind: z.null(),
  probabilities: z.null(),
}).strict();

const BatchPredictionSchema = z.discriminatedUnion('task_type', [
  BatchClassificationPredictionSchema,
  BatchRegressionPredictionSchema,
]);

const BatchRowResultSchema = z
  .object({
    row_index: z.number().int().nonnegative(),
    grid_id: z.string().min(1).max(200).nullable(),
    predictions: z.partialRecord(ModelTargetSchema, BatchPredictionSchema),
    errors: z.partialRecord(ModelTargetSchema, z.string().min(1).max(2_000)),
  })
  .strict();

export const BatchInferResponseSchema = z
  .object({
    api_version: z.literal('v1'),
    catalog_version: z.union([Sha256Schema, z.literal('unknown')]),
    total_rows: z.number().int().min(1).max(500),
    successful_rows: z.number().int().nonnegative(),
    failed_rows: z.number().int().nonnegative(),
    results: z.array(BatchRowResultSchema).min(1).max(500),
    execution_time_ms: z.number().finite().nonnegative(),
  })
  .strict()
  .superRefine((response, context) => {
    if (response.results.length !== response.total_rows) {
      context.addIssue({
        code: 'custom',
        path: ['results'],
        message: 'result count must equal total_rows',
      });
    }
    if (response.successful_rows + response.failed_rows !== response.total_rows) {
      context.addIssue({
        code: 'custom',
        path: ['successful_rows'],
        message: 'successful_rows and failed_rows must cover total_rows',
      });
    }
    const indexes = response.results.map((row) => row.row_index);
    if (
      new Set(indexes).size !== indexes.length ||
      indexes.some((rowIndex, index) => rowIndex !== index)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['results'],
        message: 'row_index values must be unique and sequential',
      });
    }
  });

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
export type BatchInferResponse = z.infer<typeof BatchInferResponseSchema>;
export type BatchPrediction = z.infer<typeof BatchPredictionSchema>;
export type ModelServerErrorResponse = z.infer<typeof ModelServerErrorResponseSchema>;
