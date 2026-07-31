import { z } from 'zod';

export const ModelManifestSchema = z.object({
  modelId: z.string(),
  displayName: z.string(),
  taskType: z.enum(['classification', 'regression', 'multiclass', 'derived']),
  crop: z.string(),
  region: z.string(),
  version: z.string(),
  status: z.enum(['pending', 'loading', 'ready', 'degraded', 'unavailable']),
  adapterType: z.enum(['http', 'onnx', 'mock']),
  endpoint: z.string().optional(),
  checksum: z.string().optional(),
  requiredFeatures: z.array(z.string()),
  unit: z.string(),
  trainingDataVersion: z.string(),
  supportedDateRange: z.object({
    start: z.string(),
    end: z.string()
  }),
  hasConfidence: z.boolean(),
  timeoutMs: z.number(),
  concurrencyLimit: z.number(),
  owner: z.string(),
  reviewStatus: z.enum(['pending', 'approved', 'rejected'])
});

export const ManifestFileSchema = z.object({
  models: z.array(ModelManifestSchema)
});

export type ModelManifest = z.infer<typeof ModelManifestSchema>;
