import { describe, it, expect } from 'vitest';
import { ModelManifestSchema } from '../src/schemas/manifest.js';

describe('Manifest Schema Validation', () => {
  it('should validate a correct model manifest', () => {
    const validModel = {
      modelId: "crop_suitability_monsoon_rice",
      displayName: "Monsoon Rice Suitability",
      taskType: "classification",
      crop: "monsoon_rice",
      region: "all",
      version: "1.0.0",
      status: "ready",
      adapterType: "mock",
      requiredFeatures: ["climate"],
      unit: "class",
      trainingDataVersion: "v1",
      supportedDateRange: { start: "2018", end: "2026" },
      hasConfidence: true,
      timeoutMs: 5000,
      concurrencyLimit: 10,
      owner: "Agri",
      reviewStatus: "approved"
    };
    
    const result = ModelManifestSchema.safeParse(validModel);
    expect(result.success).toBe(true);
  });
});
