# CollabHub resource audit for the Myanmar agricultural Geo-CSV

Audit source: [GeoAI CollabHub Resources](https://geoai-collabhub.com/resources), reviewed 2026-07-27.

## Result

The catalog is useful, but it is not a ready-made Myanmar agriculture dataset repository. It mixes software, case studies, dashboards, tutorials, generic dataset directories, telecommunications datasets, visualization libraries, and learning resources. None of those descriptions alone is allowed to change a physical value or suitability label in the 5 km monthly primary table.

The pipeline now writes two metadata CSVs:

- `collabhub_resource_audit.csv` — every catalog group has an explicit default decision and named agriculture-relevant items have an individual decision.
- `external_feature_manifest.csv` — the five conditional feature candidates, proposed sidecar fields, keys, and verification gates. Every row starts as `pending_source_verification`; it contains no fabricated observations.

Run the audit without Earth Engine or a source download:

```bash
myanmar-agri-geo resource-audit --config config/default.yaml
```

## Classification of the whole catalog

| Catalog group | Decision for all unlisted items | Why |
| --- | --- | --- |
| Partner Spotlight | Manual review before use | A project page is not a downloadable, licensed source layer. |
| OpenGeoAI API Modules | Tooling only | Modules are Python/model functionality, not observations. |
| Examples & Tutorials | Reference only | Examples are implementation patterns, not authoritative training data. |
| External APIs & Tools | Tooling only | Mapbox/QGIS/directories are interfaces or utilities. |
| MLOps & Serverless Tools | Deployment only | Nuclio/MLRun belong after data and model validation. |
| Open Datasets | Exclude or discovery only | The named products are primarily telecom/network data; discovery portals need a separate source review. |
| Interactive Mapping Libraries | Visualization only | Useful for QA maps, never as source observations. |
| Free Learning Resources | Learning only | No source-data role. |
| GeoAI Agent Registry | Experimental tooling only | Human review remains mandatory for every retrieved source and generated output. |

## Resources worth carrying forward

| Resource | Decision | Correct use | Not allowed |
| --- | --- | --- | --- |
| [HYDRAFloods](https://sig-gis.com/hydrafloods/) | Conditional | Future flood-risk sidecar after a documented Myanmar export/API, date/coverage/license review, and 5 km aggregation. | Soil moisture, crop-suitability ground truth, or dashboard scraping. |
| [Mekong Drought & Crop Watch](https://sig-gis.com/mekong-drought-crop-watch/) | Conditional | Future drought hazard sidecar or independent validation benchmark after an official downloadable release is verified. | Dashboard colours/text as data or crop labels. |
| [Regional Land Cover Mapping System](https://sig-gis.com/rlcms-regional-land-cover-mapping-system/) | Conditional | Annual cropland/land-cover sidecar, joined only on the product's actual year. | Copying an annual map into every month or same-crop target leakage. |
| [Collect Earth Online](https://sig-gis.com/collect-earth-online-ceo/) | Selected workflow | Human-reviewed field/crop validation labels in a separate keyed table. | Synthetic labels or labels inserted into feature columns. |
| [OpenGeoAI water](https://opengeoai.org/api/water/) | Optional processor | Derive a surface-water/flood sidecar from the project's own Sentinel-2 composites and record model/version/valid-pixel metadata. | Calling it physical soil moisture. |
| [AgricultureFieldDelineator](https://opengeoai.org/api/geoai/) | Optional processor | Field-count/coverage/area sidecar after local boundary validation. | A crop/yield/suitability label. |
| OpenGeoAI land-cover/training/export examples | Reference/processor | Downstream model experiments with spatial-block CV and the 2025 holdout. | Unverified predictions as source values or labels. |

Cambodia neural crop mapping and coconut suitability are useful regional methodology references, but neither supplies Myanmar ground truth for this project's 11 target crops.

## Safe update contract

Do not put CollabHub downloads or arbitrary external CSVs in `data/raw/gee/`; that directory accepts only completed GEE exports. A verified additional source must use this layout:

```text
data/raw/external/<source_id>/
data/processed/external/<source_id>/
data/output/external_feature_manifest.csv
```

Before an external feature is promoted:

1. Verify license, source version, access date, geographic coverage, CRS, units, temporal coverage, and redistribution conditions.
2. Aggregate explicitly to the existing 5 km EPSG:6933 grid.
3. Use `grid_id + year_month` for monthly data, `grid_id + observation_year` for annual data, and one row per key.
4. Preserve nulls and quality flags; do not fill cloud/flood gaps silently.
5. Record raw file hash, transform, model version, and field list in the source manifest.
6. Check for target leakage: a crop-area/product label cannot also be a predictor for that crop's suitability model.

The base sources—Sentinel-2/Sentinel-1, final CHIRPS v3, ERA5-Land, SoilGrids, SRTM, JRC surface water, and FAO GAUL—remain the only primary inputs until a conditional source passes those gates.
