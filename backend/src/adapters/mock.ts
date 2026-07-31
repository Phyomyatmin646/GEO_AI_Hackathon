import { IModelAdapter } from './index.js';
import { ModelManifest } from '../schemas/manifest.js';
import { PredictionRequest, PredictionResponse } from '../schemas/prediction.js';

export class MockAdapter implements IModelAdapter {
  async predict(model: ModelManifest, request: PredictionRequest): Promise<PredictionResponse> {
    
    // Simulate inference delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Generate mock prediction based on task type
    let predictionValue: any = 0;
    
    if (model.taskType === 'classification') {
      predictionValue = Math.floor(Math.random() * 4); // e.g. 0 to 3
    } else if (model.taskType === 'regression') {
      predictionValue = Math.random() * 100;
    } else {
      predictionValue = "mock_result";
    }

    return {
      requestId: request.requestId,
      modelId: model.modelId,
      modelVersion: model.version,
      prediction: predictionValue,
      unit: model.unit,
      confidence: model.hasConfidence ? Math.random() : undefined,
      inputDataVersion: request.features.metadata.source_version,
      modelChecksum: model.checksum || "mock-checksum",
      inferenceDurationMs: 100,
      timestamp: new Date().toISOString(),
      resultType: 'model-predicted'
    };
  }
}
