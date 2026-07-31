import fs from 'fs';
import path from 'path';
import { ModelManifest, ManifestFileSchema } from '../schemas/manifest.js';
import { IModelAdapter } from '../adapters/index.js';
import { MockAdapter } from '../adapters/mock.js';
import { HttpAdapter } from '../adapters/http.js';

export class ModelRegistry {
  private models: Map<string, ModelManifest> = new Map();
  private adapters: Map<string, IModelAdapter> = new Map();

  constructor() {
    this.adapters.set('mock', new MockAdapter());
    this.adapters.set('http', new HttpAdapter());
    // onnx could be added here later
  }

  loadManifest(manifestPath: string) {
    try {
      const rawData = fs.readFileSync(manifestPath, 'utf8');
      const jsonData = JSON.parse(rawData);
      
      const parsed = ManifestFileSchema.parse(jsonData);
      
      this.models.clear();
      for (const model of parsed.models) {
        this.models.set(model.modelId, model);
      }
      
      console.log(`Loaded ${this.models.size} models from manifest.`);
    } catch (error) {
      console.error("Failed to load model manifest:", error);
      throw error;
    }
  }

  getModel(modelId: string): ModelManifest | undefined {
    return this.models.get(modelId);
  }

  getAllModels(): ModelManifest[] {
    return Array.from(this.models.values());
  }

  getAdapter(adapterType: string): IModelAdapter {
    const adapter = this.adapters.get(adapterType);
    if (!adapter) {
      throw new Error(`Unsupported adapter type: ${adapterType}`);
    }
    return adapter;
  }
}

// Export a singleton instance
export const registry = new ModelRegistry();
