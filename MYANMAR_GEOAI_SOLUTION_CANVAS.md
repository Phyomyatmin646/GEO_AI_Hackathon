# Myanmar Agricultural GeoAI Solution Canvas

This document maps the real-data pipeline to the 10 sections of the ASEAN
GeoAI Solution Canvas. It is an agricultural advisory and research system—not
an automated decision for credit, insurance, land rights, or land conversion.

## Current implementation status

| Canvas section | Status today | Evidence / next gate |
| --- | --- | --- |
| 1. Problem statement | Defined | This document and crop-suitability data contract. |
| 2. Stakeholders & users | Defined | Users, decision scope and review responsibility documented below. |
| 3. Spatial context | Implemented in configuration | Myanmar-only `MMR`, 5 km grid, 2018–2025 monthly period. |
| 4. Data requirements | Real regional pilot complete | Ayeyawaddy January 2018 source rows, checksums, QA and provenance are complete; Myanmar-wide 2018–2025 coverage remains pending. |
| 5. GeoAI intelligence | Rule baseline, observed-label gates and leakage-safe splits implemented | No trained-model accuracy claim until sufficient independent Myanmar labels pass the gate. |
| 6. Solution design | Interactive real-data pilot implemented | The 5 km map/API serves all 1,344 QA-approved pilot cells and shows crop rank, reason, missingness/uncertainty and review capture; no production fixture remains. |
| 7. Technology stack | Core Python/GEE stack and deployable web pilot implemented | The production path is generated only from the QA-passed regional CSV; private hosting remains an explicit deployment step. |
| 8. Ethics, privacy & sustainability | Label privacy/consent/review gates implemented | Protected-area exclusion still requires a verified authoritative layer. |
| 9. Value & impact | KPIs defined | No KPI result is claimed before a real held-out evaluation. |
| 10. Implementation roadmap | Phases 0–1 complete | See the phase gates below; national export and independent observed-label acquisition remain required. |

## 1. Problem statement

Farmers, extension officers and planners need transparent, location- and
season-specific crop screening because Myanmar's monsoon, flooding, water
stress, soil, terrain and sunlight vary by place. The intended output is a
crop shortlist with confidence and limiting factors, not a promise of yield.

## 2. Stakeholders and users

| User | Decision supported | Benefit |
| --- | --- | --- |
| Extension officers and agronomists | Which crops deserve local feasibility review? | Faster, evidence-backed discussion with farmers. |
| Farmers and cooperatives | Which crop options need further local checks? | Burmese-first screening with uncertainty. |
| NGOs and planners | Where are water, flood and climate constraints? | Better targeting of field work and support. |
| Researchers and data stewards | Is the model valid by crop and region? | Reproducibility, provenance and QA. |

Local agronomist knowledge and farmer choice remain the final authority.

## 3. Spatial context

- Area of interest: Myanmar only (`MMR`).
- Pilot unit: 5 km × 5 km equal-area EPSG:6933 cells.
- Time: monthly from 2018-01 through 2025-12.
- Crops: monsoon rice, dry-season rice, maize, sugarcane, cassava, durian,
  mangosteen, longan, mango, chilli and tomato.
- A 5 km result is a screening cell; it is not a private farm boundary.

## 4. Data requirements

Only source observations sampled or clipped inside Myanmar enter the table.
Global products are acceptable only as Myanmar-area extracts and must retain
their source, version, units, resolution, observation date and quality flags.

| Data role | Real source | Use | Important limit |
| --- | --- | --- |
| Vegetation / water proxy | Sentinel-2 SR Harmonized | NDVI, McFeeters NDWI, NDMI, scene and cloud QA | Optical cloud gaps remain null. NDWI/NDMI are not soil moisture. |
| Monsoon support | Sentinel-1 GRD | VV/VH backscatter and coverage | Does not invent missing optical values. |
| Rainfall | CHIRPS v3 final monthly | Monthly and trailing-12-month rain | Use final monthly, not a mixed preliminary product. |
| Climate / solar / soil water | ERA5-Land daily aggregates | Temperature, radiation, physical volumetric soil water | Retain units and known-source caveats. |
| Soil | SoilGrids 0–30 cm | pH, texture, SOC, CEC, uncertainty | Modelled estimates; local samples override them. |
| Terrain / water history | SRTM and JRC surface water | Elevation, slope, water occurrence/distance proxy | Not irrigation rights or a 2022–25 water observation. |
| Cropland support | Dynamic World, Myanmar LAMP/RLCMS | Cropland/water gate, annual cropland fraction, sampling | Not crop-species ground truth. |
| Weak independent crop check | WorldCereal 2021 Myanmar extract | 2021 temporary crop / maize / irrigation validation | One year; not labels for all 11 crops. |
| Aggregate calibration | Myanmar MMSIS / CSO / MOALI statistics | State/region/township aggregate evaluation | Never copy admin statistics into every 5 km row. |
| Strong labels | Consented, geocoded Myanmar field crop/yield records | Calibration and held-out evaluation | Private data stays restricted and consented. |

References: <https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED>,
<https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S1_GRD>,
<https://www.chc.ucsb.edu/data/chirps3>,
<https://developers.google.com/earth-engine/datasets/catalog/ECMWF_ERA5_LAND_DAILY_AGGR>,
<https://docs.isric.org/globaldata/soilgrids/>,
<https://landcovermapping.org/en/>,
<https://esa-worldcereal.org/en/products/global-maps>, and
<https://mmsis.gov.mm/sub_menu/statistics/fileDb.jsp?code_code=005>.

## 5. GeoAI intelligence

1. A transparent crop-profile rule system produces provisional 0–100 scores.
2. Real, documented Myanmar observations calibrate labels only; a rules-only
   record stays `label_source=rule_based` with deliberately low confidence.
3. Train a multi-label crop-suitability or crop-presence model only after
   independent labels are sufficient. Begin with interpretable baselines;
   compare temporal deep learning only when justified by labels.
4. Use spatial-block cross-validation and a 2025 temporal holdout. Never use
   random-row splits or the same crop map as both a target and predictor.
5. Show data coverage, uncertainty, missingness and limiting factors with every
   recommendation.

## 6. Solution design

```text
Official Myanmar-area source extracts
        ↓ source/version/unit/QA retained
5 km monthly feature table (GeoParquet + CSV.gz)
        ↓
Rule baseline → label calibration → spatial/temporal model evaluation
        ↓
Burmese-first map/API: crop rank + confidence + limiting factors
        ↓
Agronomist/farmer review and consented feedback
```

## 7. Technology stack

- Google Earth Engine + Python/Rasterio/GeoPandas for source extraction.
- Raw COG/GeoTIFF caches; compressed CSV for sharing; partitioned Parquet for
  scalable training; source, split and QA manifests for reproducibility.
- Rule baseline, interpretable ML, then LSTM/Temporal Fusion Transformer only
  after field/event labels exist.
- Versioned data, map tiles/API, a Burmese-first interface and monthly release
  monitoring.

## 8. Ethics, privacy and sustainability

- Do not publish names, phone numbers, household data, or exact private farm
  boundaries. Obtain consent and aggregate/fuzz farmer-contributed locations.
- Do not automate credit, insurance, land-rights or enforcement actions.
- Evaluate performance by region, crop and data-coverage group; show gaps.
- Do not recommend clearing forest, wetlands, mangroves, protected areas, or
  other sensitive land. Add policy exclusions only from verified authoritative
  sources.
- Respect licences and attribution, especially for OSM-derived data.

## 9. Value and impact

| Dimension | Acceptance criterion |
| --- | --- |
| Data integrity | Zero duplicate `grid_id + year_month`; all source/version/unit/quality fields present. |
| Coverage | Every defined Myanmar grid cell has a row; missing values retain a reason. |
| Model quality | After independent labels exist: target macro-F1 ≥0.70 and score–yield rank correlation ≥0.60, reported by crop and region. |
| User value | ≥80% of pilot extension users identify the recommendation, uncertainty and limiting factor in a task test. |
| Environmental safety | No recommendation for configured protected/ecologically excluded areas. |

The model criteria are future acceptance tests, not current accuracy claims.

## 10. Implementation roadmap

| Phase | Duration | Output | Gate |
| --- | --- | --- |
| P0 — governance | 2–3 weeks | Source licences, crop profiles, pilot AOIs and data dictionary | Agronomist/data-steward approval. |
| P1 — real feature data | 6–8 weeks | GEE/CHIRPS/SoilGrids Myanmar extracts, QA, manifests, provisional map | Source and schema QA pass. |
| P2 — labels/evaluation | 4–6 weeks | Consented/official observations and spatial+2025 evaluation | No leakage; regional metrics reported. |
| P3 — pilot delivery | 8–12 weeks | Burmese UI/API, user testing, monitoring and versioned releases | Risk and user-comprehension checks pass. |
| P4 — refinement | Ongoing | Field-level calendar data and ASEAN transfer tests | New area/crop only after local validation. |

**Ownership:** technical data steward, agriculture-domain lead, local partner
review group and named source owners for every release.
