// GeoAI Backend API Client
// Note: This file should ONLY be used in server-side Next.js code (Server Components, API Routes, Server Actions)
// It accesses process.env.BACKEND_URL which is not exposed to the browser.

export interface GeoAIFeatures {
  infrastructure: {
    distance_to_road_km: number;
    road_density_km_per_sqkm: number;
    distance_to_railway_km: number;
    railway_density_km_per_sqkm: number;
    distance_to_river_km: number;
    river_density_km_per_sqkm: number;
  };
  landCover: {
    urban_fraction: number;
    builtup_fraction: number;
    cropland_fraction: number;
    non_cropland_fraction: number;
    permanent_water_fraction: number;
    valid_agriculture_mask: number;
    landcover_source_year: number;
  };
  metadata: {
    data_source: string;
    source_date: string;
    source_version: string;
    quality_flag: number;
  };
  base: any;
}

export interface PredictionRequest {
  requestId: string;
  modelId?: string;
  task?: string;
  crop?: string;
  region?: string;
  gridCellId?: string;
  features: GeoAIFeatures;
}

export interface PredictionResponse {
  requestId: string;
  modelId: string;
  modelVersion: string;
  prediction: number | string | Record<string, any>;
  unit: string;
  confidence?: number;
  warnings?: string[];
  inputDataVersion: string;
  modelChecksum: string;
  inferenceDurationMs: number;
  timestamp: string;
  resultType: string;
}

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export class GeoAIBackendClient {
  
  static async getReadyStatus() {
    const res = await fetch(`${BACKEND_URL}/health/ready`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Backend is not ready');
    return res.json();
  }

  static async listModels() {
    const res = await fetch(`${BACKEND_URL}/api/v1/models`, {
      next: { revalidate: 60 } // cache for 1 minute
    });
    if (!res.ok) throw new Error('Failed to fetch models');
    return res.json();
  }

  static async predict(request: PredictionRequest): Promise<PredictionResponse> {
    const res = await fetch(`${BACKEND_URL}/api/v1/predictions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request)
    });
    
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Prediction failed');
    }
    return data;
  }
}
