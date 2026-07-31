import { ModelManifest } from '../schemas/manifest.js';
import { PredictionRequest, PredictionResponse } from '../schemas/prediction.js';

export interface IModelAdapter {
  predict(model: ModelManifest, request: PredictionRequest): Promise<PredictionResponse>;
}
