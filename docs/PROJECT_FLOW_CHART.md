# Project Flow Chart

PowerPoint-ready exports:

- PNG: `artifacts/project-flowchart-16x9.png`
- Editable vector: `artifacts/project-flowchart-16x9.svg`

## Logical flow

```mermaid
flowchart LR
    A["Data Input<br/>Satellite · climate · terrain · soils<br/>market · field observations"]
    B["Data Preparation<br/>GEE 5 km grid · Python joins<br/>75-feature schema · QA · checksum"]
    C["GeoAI / Analysis<br/>Rule baseline · 40-target catalog<br/>model batch inference · policy gates"]
    D["Prototype Output<br/>Neon · Fastify · secure BFF<br/>bilingual map and cell detail"]
    E["Validation<br/>Spatial/temporal checks · provenance<br/>agronomist/farmer review · UX test"]

    A --> B --> C --> D --> E
    E -. "field feedback + next weekly run" .-> A

    N["Neon weekly_region_predictions"] --> F["Fastify /api/v1/weekly/latest"]
    F --> G["Next BFF /api/v1/home"]
    G --> H["live.cells[]"]
    H --> I["exact grid_id match"]
    I --> J["clicked 5 km cell detail"]
```

## Presentation narration

1. **Data Input** — official satellite, rainfall, temperature, terrain, water, soil, market and field evidence are collected with provenance.
2. **Data Preparation** — Google Earth Engine and Python standardize the data on a 5 km grid, assemble the exact 75-feature contract, and fail on QA/schema drift.
3. **GeoAI / Analysis** — historical rules and audited model artifacts generate cell-level evidence under explicit validation and model-policy gates.
4. **Prototype Output** — Neon stores regional weekly payloads; Fastify and a secure server-side BFF deliver bilingual map, chart and detail views.
5. **Validation** — technical checks, spatial/temporal holdouts, freshness, agronomist/farmer review and UX testing feed improvements into the next weekly run.

