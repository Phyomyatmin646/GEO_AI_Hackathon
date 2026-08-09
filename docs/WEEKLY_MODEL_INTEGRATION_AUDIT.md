# Weekly Model Integration Audit

Audit date: 2026-08-09  
Pipeline repository: `myanmar-agri-geo-csv-pipeline`  
Model repository: `GEO_MODEL_SERVER`

## Scope and non-negotiable constraints

This audit was completed before implementation against the checked-out code and artifacts, not only against README files.

- The frontend UI/UX is out of scope and must remain unchanged.
- `daily_gee_monitor.py` and the Early Warning/SMS path remain daily or near-real-time.
- The model repository, including its primary/prototype/fallback behavior, is read-only for this implementation at the user's request.
- No estimator, model artifact, feature meaning, or feature order may be changed.
- The browser must never receive the internal model-server API key or call the model server directly.

## Repository state at audit time

| Repository | Branch | HEAD | Worktree |
|---|---|---|---|
| `myanmar-agri-geo-csv-pipeline` | `feature/final` | `fdef0559373ed689520a9aac5fbec8e0d0dace32` | clean |
| `GEO_MODEL_SERVER` | `feature/geo` | `cab66614b6e72c871d65ab64520a2d7ecc99c6fb` | clean |

## Implemented model-server API

The checked-out model server implements these routes:

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/v1/infer/batch` | Internal feature-vector batch inference; maximum 500 rows |
| `POST` | `/api/v1/pipeline/run` | Multipart CSV synchronous inference |
| `POST` | `/api/v1/pipeline/run-async` | Multipart CSV background inference |
| `GET` | `/api/v1/pipeline/status/{job_id}` | Background job result/status |
| `GET` | `/api/v1/pipeline/status/{job_id}/download` | Background Parquet download |
| `GET` | `/api/v1/live` | Liveness |
| `GET` | `/api/v1/ready` | Readiness and catalog version |
| `GET` | `/api/v1/health` | Process/model-cache diagnostics |
| `GET` | `/api/v1/models` | Canonical target and crop names |

There is no implemented `POST /api/v1/predict` route in this checkout. The existing Fastify client currently calls that nonexistent route, so coordinate/sample prediction forwarding is not connected to the actual model-server implementation.

The safe existing endpoint for weekly output is `POST /api/v1/infer/batch`; no model-server endpoint needs to be added or changed.

## Authentication contract

- Authentication is controlled by `AUTH_REQUIRED`.
- It is mandatory in `ENVIRONMENT=production` and optional in development.
- The service credential must contain at least 24 characters in production.
- The exact request header is `X-Internal-API-Key` (header matching is case-insensitive).
- Public model-server paths are limited to `/api/v1/live`, `/api/v1/ready`, `/docs`, and `/openapi.json` when authentication is enabled.
- The existing Python daily caller uses `X-API-Key`, which does not satisfy the model-server contract. The Fastify client already uses the correct internal header.

## Batch inference contract

Request:

```json
{
  "rows": [
    {
      "grid_id": "mm_1818_402",
      "elevation_m": 10.0,
      "...": "all remaining model features"
    }
  ],
  "targets": ["crop_health_score"],
  "observation_month": "2026-08"
}
```

Rules enforced by the model server:

- `rows`: 1 to 500 objects.
- Exactly one of a non-empty `targets` array or `include_all_targets=true` is required.
- At most 40 targets are accepted; unknown targets are rejected.
- `observation_month`, when supplied, must use `YYYY-MM` for years 2000–2099.
- Missing artifact-required feature names fail that target for that row.
- Values are converted to floats in the artifact's feature order.
- Infinite values fail the target. NaN values fail models that do not advertise NaN support.
- Per-target failures are returned in `errors`; other targets on the same row may still succeed.

Response:

```json
{
  "api_version": "v1",
  "catalog_version": "unknown",
  "total_rows": 1,
  "successful_rows": 1,
  "failed_rows": 0,
  "results": [
    {
      "row_index": 0,
      "grid_id": "mm_1818_402",
      "predictions": {
        "crop_health_score": {
          "value": 0.5,
          "label": null,
          "unit": "score_0_to_1",
          "task_type": "regression",
          "confidence": null,
          "confidence_kind": null,
          "probabilities": null,
          "model_version": "sha256-...",
          "validation_status": "healthy",
          "warnings": []
        }
      },
      "errors": {}
    }
  ],
  "execution_time_ms": 10.0
}
```

The batch route currently calls a nonexistent `model_catalog.get_catalog()` helper when populating `catalog_version`, catches the error, and returns `"unknown"`. The model repository will not be modified. Fastify must take the authoritative catalog version from `/api/v1/ready`, validate it, and attach it to persisted weekly run metadata.

## Exact model feature contract

All 40 manifest entries declare exactly 75 inputs and the same ordered schema checksum:

```text
35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8
```

The inspected `crop_health_score` artifact contains the same ordered list. The order is:

1. `elevation_m`
2. `slope_degrees`
3. `aspect_degrees`
4. `distance_to_surface_water_m`
5. `soil_cec_cmol_kg_0_30cm`
6. `soil_clay_pct_0_30cm`
7. `soil_sand_pct_0_30cm`
8. `soil_silt_pct_0_30cm`
9. `soil_soc_g_kg_0_30cm`
10. `soil_ph_h2o_0_30cm`
11. `surface_water_occurrence_pct`
12. `surface_water_seasonality_months`
13. `distance_to_road_km`
14. `road_density_km_per_sqkm`
15. `distance_to_railway_km`
16. `railway_density_km_per_sqkm`
17. `distance_to_river_km`
18. `river_density_km_per_sqkm`
19. `urban_fraction`
20. `builtup_fraction`
21. `cropland_fraction`
22. `non_cropland_fraction`
23. `permanent_water_fraction`
24. `population_density`
25. `valid_agriculture_mask`
26. `chirps_precipitation_mm`
27. `mean_temperature_c`
28. `solar_radiation_mj_m2_day`
29. `chirps_precipitation_mm_mean`
30. `chirps_precipitation_mm_max`
31. `chirps_precipitation_mm_min`
32. `chirps_precipitation_mm_range`
33. `chirps_precipitation_mm_cv`
34. `era5_soil_moisture_m3_m3_mean`
35. `era5_soil_moisture_m3_m3_max`
36. `era5_soil_moisture_m3_m3_min`
37. `era5_soil_moisture_m3_m3_cv`
38. `mean_temperature_c_mean`
39. `mean_temperature_c_max`
40. `mean_temperature_c_min`
41. `mean_temperature_c_range`
42. `ndvi_median_mean`
43. `ndvi_median_max`
44. `ndvi_median_min`
45. `ndvi_median_growing_season_mean`
46. `ndwi_mcf_median_mean`
47. `ndwi_mcf_median_max`
48. `s1_vh_db_median_mean`
49. `s1_vv_db_median_mean`
50. `solar_radiation_mj_m2_day_mean`
51. `solar_radiation_mj_m2_day_max`
52. `data_month`
53. `crop_area_pct_monsoon_rice`
54. `crop_area_pct_dry_season_rice`
55. `crop_area_pct_maize`
56. `crop_area_pct_sugarcane`
57. `crop_area_pct_cassava`
58. `crop_area_pct_durian`
59. `crop_area_pct_mangosteen`
60. `crop_area_pct_longan`
61. `crop_area_pct_mango`
62. `crop_area_pct_chili`
63. `crop_area_pct_tomato`
64. `crop_area_pct_black_gram`
65. `crop_area_pct_green_gram`
66. `crop_area_pct_pigeon_pea`
67. `crop_area_pct_groundnut`
68. `crop_area_pct_sesame`
69. `crop_area_pct_rubber`
70. `region_ayeyawaddy`
71. `region_bago`
72. `region_magway`
73. `region_mandalay`
74. `region_sagaing`
75. `region_yangon`

## Temporal semantics

The existing models are not weekly models. Artifact and source-code inspection found that the released rows cover calendar months from 2018-01 through 2026-07. The implemented training-data construction differs from the high-level feature documentation: aggregate fields 29-51 were grouped over each grid's entire available 96-100 month history, not a rolling 12-month window. Those values are repeated on monthly rows. `ndvi_median_growing_season_mean` is also equal to `ndvi_median_mean` in the released serving data.

Therefore, a weekly run must be a weekly refresh of model-compatible monthly inputs:

- CHIRPS current-month precipitation remains month-to-date accumulation; it is not renamed to weekly rainfall.
- Current-month temperature and daily-normalized solar values retain their existing units and meanings.
- Precomputed mean/max/min/range/CV, NDVI, NDWI, Sentinel-1, and soil-moisture fields retain the exact released whole-history values. Weekly observations are recorded separately for provenance and do not overwrite these model fields.
- Crop-area fields remain the released regional constants and the final six fields remain the verified region one-hot vector.
- A cross-month week uses the month containing the last included day (`week_end - 1 day`) for `observation_month` and `data_month`. This avoids silently assigning the run to an earlier month.

True weekly features would require separately versioned/retrained models and are outside this task.

## Artifact and catalog inventory

Manifest catalog version:

```text
3ea1ea395518c6eda8872129a41cd9f19bd43fbb82e83937871ca28a15fe8795
```

Manifest status totals: 40 experimental surrogate models, 11 `healthy`, 29 `flagged`, 0 `unknown`; none are field validated or production approved.

| Model target | Status | Artifact SHA-256 |
|---|---|---|
| `crop_suitability_monsoon_rice` | flagged | `43634acd4be7825ea8d252e69eae861ec46dcf7062ccfc6a315ec139e52ab31d` |
| `crop_suitability_dry_season_rice` | flagged | `c6945e4af63316ac4a86f3890f113b8fdc088efbcbfb389ee87e366d649c3820` |
| `crop_suitability_maize` | flagged | `8e16af4ad619a340b11f8279fd1cf557adf05bb3ab5cd22fef6b19b042c2fa70` |
| `crop_suitability_sugarcane` | flagged | `c693e138bb4486911805dfd5ae789bb7bb270d973b8402ad55032326e2982616` |
| `crop_suitability_cassava` | flagged | `aef51231bc36c06c508e69df6734f1dc8d3e7afbc2cc6721c3010374e94cbd73` |
| `crop_suitability_durian` | flagged | `218fcdc27453829a1e910e0beb665f9e9dc04601266a9dfdfa07fd647667e0a5` |
| `crop_suitability_mangosteen` | flagged | `9324096835454aa263ce5acc80bac93d12bace81351afe3c925ae3249c43d676` |
| `crop_suitability_longan` | flagged | `0871cc313da59c6438c0fae4be30d18cf1fdf11d54f5f4b2e53b5c383e3edd82` |
| `crop_suitability_mango` | flagged | `7cd4fc44f88ab7be4de6df7af365e68e122e025c5809f41a0954daf44281e170` |
| `crop_suitability_chili` | flagged | `fffac11a3bbec22ecd4f5a03de951f8df02600b46733e98344146b91a4c8deab` |
| `crop_suitability_tomato` | flagged | `2caf4eaa5bba0fe2d471ff840c652917d473ff744799886016bf0c22bb867b60` |
| `crop_suitability_black_gram` | flagged | `c299ea57f47be7e1824755e443c3a1088160f15a47e5f2b89b79ca6aafc4d62d` |
| `crop_suitability_green_gram` | flagged | `eb9a8c6cc783f491d4126d33bfc277a8bbf4d2a72cd9655cdd0d81808053e69e` |
| `crop_suitability_pigeon_pea` | flagged | `dab2759945b7994d9fbec131be33b0be19496fbcad4bc392866dbb6ba90ed612` |
| `crop_suitability_groundnut` | flagged | `fbe3498eb44c060c1bd7ca089bda8c68c9351365eda3613b55b4cea967b67bb3` |
| `crop_suitability_sesame` | flagged | `6ca045e4909ef4e88842773c7ea123696d863004f0892df312c76b4eca16221f` |
| `crop_suitability_rubber` | flagged | `50c6822fc8c0ffa454589970fd837f38e84bb1ba321d0df339c00e9759b0f6f7` |
| `crop_health_score` | healthy | `3a102e074fa731a1098b9d975afafc6d738947354a38a62351114e1f9356f7b0` |
| `crop_yield_t_ha` | healthy | `2e15414c5b1bd7476168055ef2a41215881404abaa7c759ad3be53ad2daa2535` |
| `irrigation_need` | flagged | `c49708aeef7154020057b0ef5498c26c5c7e22de76959c47435bdf1b44f3ea71` |
| `current_month_precipitation_mm` | flagged | `2d82ce3fc909084d654ad2ec5352298216f0ab2db6822dd6bce90c3156e5ab5a` |
| `current_month_mean_temperature_c` | flagged | `1275b950ef9c20287bd58a73810eec0c37f3433511176cea43df6d5c64ba656d` |
| `current_month_solar_rad_mj_m2_day` | flagged | `0f637097ccfe28bd8720399f317b11322a46b7d6c19ba5edff6435aec15d8278` |
| `flood_risk_level` | healthy | `f7cdce1da903a8ec3d51557447925076864b0e4878ffdee8e8ed2167668bb2c6` |
| `drought_risk_score` | healthy | `8e31a31d354b8b7f853db3a95c36624253b5169790c7401cf26d96284add12fe` |
| `heat_stress_risk` | flagged | `f3b37417bddd518e2e04f86f7505d4a90008170c44af4d9d5ee24c99df6cc11b` |
| `optimal_planting_month` | flagged | `ff295de0c4108bf31593c085d369aac589c348c9513b22b0a3942b0e61fcf035` |
| `nitrogen_requirement_level` | healthy | `e9723d0a334bebdf59bd07df07953466d58b6b90829d61d9c4746f9dcd033d1d` |
| `phosphorus_requirement_level` | healthy | `afaaf0fba0298e3c71149a12cee43aa927a650155dd77dc42d5e6f456cca6f30` |
| `soil_erosion_risk` | healthy | `b5a2a1c3fdaff06aa97465e89f001b696407263393b3eaf1a45dd75e3fa95d3a` |
| `market_integration_score` | healthy | `34436df87168c765d62bf82e6e6b67ae10ac8ae175f2fbcca50f7458d6e17887` |
| `post_harvest_loss_risk` | healthy | `25ba95182670328a759912cf898416e45c0f4d3864edc9cbb3a0d032f250ac69` |
| `supply_chain_efficiency` | flagged | `707d82088e70330e4b6407ff0a0472f5b62da09d8b539e81326654cad1fecd52` |
| `cold_chain_potential` | flagged | `f1b9c6134e919e4705459f989dd40e87ee78b9b2958e767709108db0221e50c1` |
| `agricultural_land_conversion_risk` | flagged | `b3327ecb8f494dc351e3a11216dcf148d7bded5421576b8619b05918bf548c3c` |
| `urban_encroachment_risk` | flagged | `09dcee3a405e40f34753b04382293f084f74c7650fff9ff819f567e43c505129` |
| `irrigation_potential` | healthy | `6f7c4f300ad5991505363b3d43f7d1843c65aec30e78017dbde54515fb82791f` |
| `surface_water_occurrence` | flagged | `79fa9e7854e4501f23e35922bb2b88799eb34303dfc0cac9d1c357968ebaa00a` |
| `water_scarcity_risk` | flagged | `08ad3e64b2c079064e65c580955e88a2e8d5d057de8a5740ad4974c3d10f1965` |
| `agricultural_gdp_forecast` | healthy | `e9b40183104e5a6010dd3a5714508531500cfd1d77fef47cfcd7e6fbe4a2dd30` |

The audit recomputed the 40 artifact SHA-256 digests and they match the manifest.
It also loaded every declared primary file directly with the repository's Python
3.12.10, scikit-learn 1.9.0, and joblib 1.5.3 environment without invoking the
model manager or prototype directory. All 40/40 deserialize successfully, expose
the exact ordered 75-feature artifact schema, and report `n_features_in_ == 75`;
there were no primary-artifact failures in the audited release.

Serving artifacts:

| Artifact | Rows | SHA-256 |
|---|---:|---|
| `features_serving.parquet` | 1,029,348 | `375f4280ccbb2534268877734805bf113f85517e39994f053ffa5f57c19f6643` |
| `spatial_index.parquet` | 1,029,348 | `045ddb5d1e7d7c4b168ba9d35380bf03121d9230ba62a6d34f9bd37d41518ddc` |

The serving feature file has no identifier column. Its row position is the only linkage to the corresponding row in `spatial_index.parquet`. Full alignment checks passed, including `data_month`, the region one-hot fields, coordinates, and source locator reconstruction. The current complete serving snapshot contains 10,353 canonical grids using `mm_<x>_<y>` IDs.

## Verified live-data blocker

The ordered-name checksum does not cover Arrow dtypes or nullability. Direct inspection found:

- `surface_water_seasonality_months` is null for all 1,029,348 serving rows.
- The other 74 serving features contain no null, NaN, or infinite values.

The implementation plan requires missing/non-finite model features to fail closed. Python and Fastify therefore reject the real rows instead of replacing this feature with zero, a mean, or a heuristic. The weekly architecture, authentication, persistence, and contract tests can be completed, but real regional inference cannot succeed until an authoritative source artifact supplies finite values or a deliberately versioned/retrained model contract is released.

## Runtime, timeout, memory, and cache policy

- Model-server default request concurrency: `MAX_CONCURRENT_REQUESTS=1`.
- Queue setting declared in config: `QUEUE_TIMEOUT_SECONDS=5`, but there is no `server/core/request_queue.py` in this checkout and the batch route does not apply a request queue.
- Execution timeout declared in config: `REQUEST_EXECUTION_TIMEOUT_SECONDS=30`, but the batch route does not wrap execution with that timeout.
- Model cache: thread-safe in-process LRU, bounded by `MAX_LOADED_MODELS` and `MAX_RAM_MB`.
- Example development settings load at most 2 models within 2048 MiB; code defaults are 40 models and 8192 MiB.
- A model is configured to use one inference thread (`n_jobs=1`) when loaded.
- The model manager may evict least-recently-used models and attempts to return freed memory to the OS.
- Redis settings exist in configuration, but the inspected serving path uses the in-process model cache and does not use Redis response caching.
- Fastify should start with one concurrent batch and a 120-second upstream timeout as specified by the implementation plan.

## Existing model fallback behavior (preserved, not modified)

The current model repository contains multiple fallback paths:

- `model_loader.py` may load a prototype artifact after catalog lookup or primary deserialization failure.
- The multipart CSV pipeline may backfill absent feature columns with zero and may use heuristic estimator fallbacks on model failure.
- The batch endpoint is stricter about missing feature names and non-finite values, although it uses the same model manager.

The user's explicit instruction is to leave these model-folder behaviors unchanged. This implementation therefore isolates Fastify to the existing stricter feature-vector batch endpoint, performs validation before the request, filters flagged targets by backend policy unless explicitly allowed, and never edits model-server fallback code. Fastify rejects fallback/prototype metadata or warnings when the endpoint exposes them. One legacy edge remains unobservable outside the unchanged model process: if primary deserialization fails and `model_loader.py` loads a prototype while retaining primary catalog metadata, the batch response does not identify that substitution. The current primary artifacts are audited separately, but an absolute runtime no-fallback guarantee requires a future model-server contract that reports the artifact actually executed.

## Pre-implementation gaps and disposition

1. The weekly Fastify path now uses `/api/v1/infer/batch`, the correct internal header, bounded rows, strict schemas, readiness/catalog pinning, and all primary-release checks observable in the current response. The hidden deserialization-fallback limitation above remains explicit. The older coordinate/sample `POST /api/v1/predictions` contract still has no matching endpoint in the unchanged model repository; it remains a separately documented legacy limitation rather than being silently redirected to a different inference meaning.
2. Python now performs export, alignment, feature construction, and validation, then sends metadata only to authenticated Fastify. It no longer calls the model server directly or sends a filesystem path.
3. The prediction pipeline has been renamed and scheduled weekly using Monday-based Asia/Yangon intervals. Daily GEE monitoring and Early Warning/SMS remain unchanged.
4. The feature builder now reads the two Parquets positionally, selects canonical `mm_*` IDs, verifies region/month alignment, preserves aggregate semantics, and rejects unknown-grid fallback.
5. Fastify now owns PostgreSQL run metadata, regional JSON payloads, seven-day cleanup, partial regional inference status, and the independent market-price module.
6. A legacy `/api/v1/daily/:date/map` compatibility adapter reads weekly PostgreSQL payloads so the existing map UI can remain unchanged.
7. Web inspection found that D1 code is limited to unreferenced helpers/examples and the hosting manifest has no D1 binding. It has not been removed yet because the plan explicitly requires a successful live PostgreSQL migration test first, and no `TEST_DATABASE_URL` or running local PostgreSQL was available during this implementation.
8. The all-null serving feature above remains the intentional live-data blocker. It is not hidden with a fabricated value.
9. Production ingest now requires the complete six-region manifest, verifies CSV coverage/provenance against that manifest, counts only intersecting CHIRPS/ERA5 observation dates, propagates partial/failed status to the scheduler, and can reclaim abandoned processing runs after the configured stale threshold.
