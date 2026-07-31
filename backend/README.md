# GeoAI Model Inference Backend

This is a production-ready Node.js Fastify backend that serves as the model registry and inference gateway for the Myanmar GeoAI system.

## Architecture

- **Fastify**: High-performance HTTP server.
- **Zod**: Strict validation of incoming GeoAI features.
- **BullMQ + Redis**: Asynchronous batch inference queue.
- **Pluggable Adapters**: Supports HTTP API integration and testing Mocks.

## Requirements
- Node.js >= 22
- Redis (for async queue)

## Setup
1. `npm install`
2. `cp .env.example .env`
3. `npm run dev` (Starts development server on port 8000)

## API Examples

### Get Readiness
```bash
curl http://localhost:8000/health/ready
```

### List Models
```bash
curl http://localhost:8000/api/v1/models
```

### Make Synchronous Prediction
```bash
curl -X POST http://localhost:8000/api/v1/predictions \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "123",
    "modelId": "crop_suitability_monsoon_rice",
    "features": {
      "infrastructure": {
        "distance_to_road_km": 1.2,
        "road_density_km_per_sqkm": 0.5,
        "distance_to_railway_km": 10.0,
        "railway_density_km_per_sqkm": 0.1,
        "distance_to_river_km": 5.0,
        "river_density_km_per_sqkm": 0.2
      },
      "landCover": {
        "urban_fraction": 0.05,
        "builtup_fraction": 0.1,
        "cropland_fraction": 0.6,
        "non_cropland_fraction": 0.25,
        "permanent_water_fraction": 0.0,
        "valid_agriculture_mask": 1,
        "landcover_source_year": 2021
      },
      "metadata": {
        "data_source": "sentinel-2",
        "source_date": "2024-01-01",
        "source_version": "v1",
        "quality_flag": 1
      },
      "base": {
        "temperature_mean": 28.5,
        "elevation": 100
      }
    }
  }'
```

## Adding a New Model

1. Open `models/manifest.json`.
2. Add a new JSON block strictly adhering to the Manifest schema.
3. Set `adapterType` to `"http"` and provide the `endpoint` to your actual Python/PyTorch inference server.
4. Run `npm run test` or `npm run start`. The manifest will be strictly validated on startup.
