"""Curated, non-data resource audit for the GeoAI CollabHub catalog.

The catalog contains dashboards, code, tutorials, and data directories as
well as projects.  Keeping this registry outside the physical source catalog
prevents a web page from being mistaken for an observation source.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

import pandas as pd


COLLABHUB_CATALOG_URL = "https://geoai-collabhub.com/resources"

AUDIT_COLUMNS = [
    "record_type", "catalog_section", "resource_id", "resource_name", "url",
    "resource_kind", "decision", "pipeline_role", "candidate_outputs",
    "activation_requirements", "prohibited_use", "status", "notes",
]
EXTERNAL_FEATURE_MANIFEST_COLUMNS = [
    "source_id", "source_name", "source_url", "role", "output_store",
    "candidate_fields", "temporal_grain", "expected_join_keys",
    "unit_or_encoding", "license_requirement", "required_checks", "state", "notes",
]


def _row(*values: str) -> dict[str, str]:
    return dict(zip(AUDIT_COLUMNS, values, strict=True))


# Group rows audit every catalog group. Named records below override the group
# decision when they have a credible agriculture/geospatial role.
COLLABHUB_AUDIT_ROWS: tuple[dict[str, str], ...] = (
    _row(
        "catalog_group", "Partner Spotlight", "partner_spotlight__other_projects", "All other Partner Spotlight projects", COLLABHUB_CATALOG_URL,
        "case study, dashboard, or application", "manual_review_before_use", "No automatic ingestion", "none",
        "Verify a downloadable Myanmar-appropriate release, license, CRS, dates, units, and join keys",
        "Treating a project description, map colour, or dashboard screenshot as a training value", "not_an_input",
        "Only individually reviewed projects below have a conditional role.",
    ),
    _row(
        "catalog_group", "OpenGeoAI API Modules", "opengeoai_api_modules__remaining", "All other OpenGeoAI API modules", "https://opengeoai.org/api/",
        "Python model or utility library", "tooling_only", "Optional implementation helper", "none",
        "Pin package/model version and document input data and inference settings",
        "Registering an API/module page as an observation source", "not_an_input",
        "Modules are code, not Myanmar crop or soil observations.",
    ),
    _row(
        "catalog_group", "Examples & Tutorials", "opengeoai_examples__remaining", "All other OpenGeoAI examples and tutorials", "https://opengeoai.org/examples/",
        "tutorial or notebook", "reference_only", "Implementation reference", "none",
        "Adapt and validate code against the project's own sources", "Using demonstration output as a label or feature", "not_an_input",
        "Tutorials do not establish source coverage, license, or label quality.",
    ),
    _row(
        "catalog_group", "External APIs & Tools", "external_apis_tools__all", "External APIs and GIS tools", COLLABHUB_CATALOG_URL,
        "API, desktop tool, or directory", "tooling_only", "Optional UI/manual QA", "none",
        "Separate provider terms and project-specific implementation", "Adding tool metadata to the training table", "not_an_input",
        "Mapbox, QGIS, and directories are not agronomic source layers.",
    ),
    _row(
        "catalog_group", "MLOps & Serverless Tools", "mlops_serverless__all", "Nuclio, MLRun, and related deployment tools", COLLABHUB_CATALOG_URL,
        "deployment tooling", "deployment_only", "Future inference/deployment", "none",
        "Deploy only after model validation and data-governance review", "Using deployment tooling as a feature source", "not_an_input",
        "Useful after, not during, source assembly.",
    ),
    _row(
        "catalog_group", "Open Datasets", "open_datasets__telecom_and_generic", "Telecom/network datasets and generic dataset directories", COLLABHUB_CATALOG_URL,
        "unrelated data or discovery portal", "exclude_or_discovery_only", "Manual discovery only", "none",
        "Individually verify a newly found agriculture dataset before a separate source review", "Ingesting telecom, traffic, latency, or unverified Kaggle data", "not_an_input",
        "The listed named products are primarily ICT/networking, not Myanmar agriculture layers.",
    ),
    _row(
        "catalog_group", "Interactive Mapping Libraries", "interactive_mapping__all", "Interactive mapping libraries and notebooks", COLLABHUB_CATALOG_URL,
        "visualization library", "visualization_only", "Map/QA presentation", "none",
        "Use only after a valid dataset exists", "Treating visual layers as source observations", "not_an_input",
        "Useful for reviewing final suitability and uncertainty maps.",
    ),
    _row(
        "catalog_group", "Free Learning Resources", "learning_resources__all", "Learning resources", COLLABHUB_CATALOG_URL,
        "course or documentation", "learning_only", "Team enablement", "none",
        "No data ingestion", "Treating learning material as an observation source", "not_an_input", "Does not update the Geo-CSV.",
    ),
    _row(
        "catalog_group", "GeoAI Agent Registry", "geoai_agent_registry__all", "GeoAI retrieval, inspection, workflow, and map-projection agents", COLLABHUB_CATALOG_URL,
        "experimental agent/tooling", "experimental_tooling_only", "Optional operator assistance", "none",
        "Review every generated request, source, and output before use", "Unsupervised retrieval or direct insertion into a training table", "not_an_input",
        "No verified agriculture data endpoint is implied by the registry entry.",
    ),
    _row(
        "resource", "Partner Spotlight", "sig_hydrafloods", "HYDRAFloods", "https://sig-gis.com/hydrafloods/",
        "flood-monitoring software/dashboard", "conditional_feature_candidate", "Optional flood-risk sidecar",
        "ext__hydrafloods__flooded_fraction; ext__hydrafloods__event_flag; ext__hydrafloods__observation_count",
        "Obtain a documented export/API with Myanmar coverage; record dates, license, satellite source, units, processing version, and 5 km aggregation",
        "Physical soil moisture, crop-suitability ground truth, or silently filled cloud gaps", "pending_source_verification",
        "The linked project describes a dashboard and near-real-time flood monitoring; the page itself is not a tabular dataset.",
    ),
    _row(
        "resource", "Partner Spotlight", "sig_mekong_drought_crop_watch", "Mekong Drought & Crop Watch", "https://sig-gis.com/mekong-drought-crop-watch/",
        "drought-monitoring application", "conditional_feature_candidate", "Optional drought hazard/independent validation sidecar",
        "ext__mekong_drought__severity; ext__mekong_drought__anomaly; source_observation_date",
        "Confirm an official downloadable release, Myanmar coverage, date alignment, unit definitions, license, and no post-period leakage",
        "Scraping dashboard text/colours or using it as crop ground truth", "pending_source_verification",
        "Useful regional methodology and possible independent benchmark; not auto-ingested.",
    ),
    _row(
        "resource", "Partner Spotlight", "sig_rlcms", "Regional Land Cover Mapping System", "https://sig-gis.com/rlcms-regional-land-cover-mapping-system/",
        "annual land-cover mapping system", "conditional_feature_candidate", "Annual cropland/land-cover validation sidecar",
        "cropland_fraction; landcover_class; observation_year",
        "Acquire an official Myanmar-compatible release and aggregate by matching observation year only",
        "Copying annual maps into every month or using same-crop map labels as same-model predictors", "pending_source_verification",
        "The catalog describes yearly SERVIR Southeast Asia land-cover maps; release availability and taxonomy still require verification.",
    ),
    _row(
        "resource", "Partner Spotlight", "sig_cambodia_crop_mapping", "Neural Network Crop Mapping in Cambodia", "https://sig-gis.com/cambodia-neural-network-crop/",
        "Cambodia case study", "reference_only", "Architecture, annotation, and evaluation reference", "none",
        "Use only after independently obtaining permitted data and adapting to Myanmar", "Using Cambodian labels as Myanmar ground truth", "not_an_input",
        "Useful for transfer-learning ideas, not direct label ingestion.",
    ),
    _row(
        "resource", "Partner Spotlight", "sig_coconut_suitability", "Coconut Suitability Mapping", "https://sig-gis.com/coconut-suitability-mapping/",
        "Southeast Asia suitability case study", "reference_only", "Suitability-methodology reference", "none",
        "Review methods separately; coconut is not among the configured 11 crops", "Using its model/map as labels for the current crop set", "not_an_input",
        "Regional relevance is useful, but it is a distinct crop and project.",
    ),
    _row(
        "resource", "Partner Spotlight", "sig_collect_earth_online", "Collect Earth Online", "https://sig-gis.com/collect-earth-online-ceo/",
        "human interpretation/labeling platform", "selected_labeling_workflow", "Manual validation and future field-label collection",
        "separate reviewed labels table keyed by grid_id, year_month, crop_id",
        "Documented sampling design, annotator protocol, consent/permission, and holdout separation", "Automatic synthetic labels or labels inserted into feature columns", "not_an_input",
        "Recommended path for building trustworthy local validation labels, not a downloadable input dataset.",
    ),
    _row(
        "resource", "OpenGeoAI API Modules", "opengeoai_water", "OpenGeoAI water module", "https://opengeoai.org/api/water/",
        "water-segmentation model", "selected_optional_processor", "Optional Sentinel-2-derived surface-water/flood sidecar",
        "ext__opengeoai_water__surface_water_fraction; ext__opengeoai_water__valid_pixel_fraction; ext__opengeoai_water__model_version",
        "Run against the project's own cloud-masked Sentinel-2 composites; save model/version/band order/valid-pixel metadata",
        "Calling NDWI/NDMI or segmentation output physical soil moisture", "not_an_input",
        "A processor using existing imagery; retain ERA5-Land for physical soil-water values.",
    ),
    _row(
        "resource", "OpenGeoAI API Modules", "opengeoai_field_delineator", "OpenGeoAI AgricultureFieldDelineator", "https://opengeoai.org/api/geoai/",
        "field-boundary model", "selected_optional_processor", "Field-scale refinement/sampling-design sidecar",
        "field_count_5km; field_coverage_fraction; median_field_area_ha",
        "Run on documented Sentinel-2 inputs and validate boundaries locally before aggregation", "Crop class, yield, or suitability label", "not_an_input",
        "Keep field-derived metrics outside the primary 88-column pilot until validation is complete.",
    ),
    _row(
        "resource", "OpenGeoAI API Modules", "opengeoai_landcover_train", "OpenGeoAI land-cover training utilities", "https://opengeoai.org/api/landcover_train/",
        "training utility", "selected_optional_processor", "Downstream land-cover experiment", "separate model artifacts and metrics",
        "Use spatial/temporal splits and documented reference labels", "Unverified model output as a feature or label", "not_an_input",
        "Useful after a legitimate training-label set is available.",
    ),
    _row(
        "resource", "Examples & Tutorials", "opengeoai_download_sentinel2", "OpenGeoAI Download Sentinel-2 example", "https://opengeoai.org/examples/download_sentinel2/",
        "data-access tutorial", "reference_only", "Alternative acquisition example", "none",
        "Retain current GEE Sentinel-2 SR Harmonized workflow as the canonical source", "Duplicate imagery with undocumented processing differences", "not_an_input",
        "No change to the current Sentinel-2 source contract.",
    ),
    _row(
        "resource", "Examples & Tutorials", "opengeoai_stac_agents", "OpenGeoAI STAC agents example", "https://opengeoai.org/examples/STAC_agents/",
        "retrieval workflow example", "experimental_tooling_only", "Potential future discovery helper", "none",
        "Human approval of each collection, item, license, date, and checksum", "Autonomous ingestion into raw GEE exports", "not_an_input",
        "Useful only under the same provenance gate as any other source.",
    ),
    _row(
        "resource", "Examples & Tutorials", "opengeoai_water_dynamics", "OpenGeoAI Water dynamics example", "https://opengeoai.org/examples/water_dynamics/",
        "water-analysis tutorial", "selected_optional_processor", "Potential flood/water dynamics method", "separate monthly water sidecar",
        "A reproducible implementation with input source/version and independent validation", "Replacing physical soil moisture or claiming irrigation access", "not_an_input",
        "Method reference; does not itself provide Myanmar measurements.",
    ),
    _row(
        "resource", "Examples & Tutorials", "opengeoai_create_training_data", "OpenGeoAI Create training data example", "https://opengeoai.org/examples/create_training_data/",
        "annotation/training-data tutorial", "selected_reference", "Future label-preparation workflow", "separate reviewed label tables",
        "Keep labels geocoded, dated, licensed, and split-safe", "Fabricated labels or random-row validation", "not_an_input",
        "Useful with Collect Earth Online or another documented review process.",
    ),
    _row(
        "resource", "Examples & Tutorials", "opengeoai_export_training_formats", "OpenGeoAI Export training data formats example", "https://opengeoai.org/examples/export_training_data_formats/",
        "export tutorial", "selected_reference", "Conversion after a valid dataset exists", "separate training chips/features",
        "Preserve sample identifiers and split assignments", "Changing source values or labels during export without manifesting it", "not_an_input",
        "Does not update physical-source rows.",
    ),
    _row(
        "resource", "Examples & Tutorials", "opengeoai_train_landcover", "OpenGeoAI Train land-cover classification example", "https://opengeoai.org/examples/train_landcover_classification/",
        "training tutorial", "selected_reference", "Downstream experimental model", "separate model outputs",
        "Use the existing spatial-block and 2025 holdout policy", "Use of same-source crop maps as feature and label", "not_an_input",
        "Not part of primary source assembly.",
    ),
    _row(
        "resource", "OpenGeoAI API Modules", "opengeoai_timm_regress", "OpenGeoAI timm regression module", "https://opengeoai.org/api/timm_regress/",
        "regression model utility", "downstream_model_only", "Suitability/yield experiment after assembly", "separate predictions and model card",
        "Train only after leakage-safe splitting and calibration review", "Treating predictions as observed labels or raw features", "not_an_input",
        "The current rule-based labels remain provisional and are not ground truth.",
    ),
)


def resource_audit_frame() -> pd.DataFrame:
    """Return the stable audited catalog decision table."""

    return pd.DataFrame(COLLABHUB_AUDIT_ROWS, columns=AUDIT_COLUMNS)


def external_feature_manifest_frame() -> pd.DataFrame:
    """Return a conditional external-feature contract, never fabricated values."""

    source_ids = {"sig_hydrafloods", "sig_mekong_drought_crop_watch", "sig_rlcms", "opengeoai_water", "opengeoai_field_delineator"}
    records: list[dict[str, str]] = []
    for item in COLLABHUB_AUDIT_ROWS:
        if item["resource_id"] not in source_ids:
            continue
        annual = item["resource_id"] == "sig_rlcms"
        static = item["resource_id"] == "opengeoai_field_delineator"
        records.append(
            {
                "source_id": item["resource_id"],
                "source_name": item["resource_name"],
                "source_url": item["url"],
                "role": item["pipeline_role"],
                "output_store": "data/processed/external/<source_id>/ or a separate Parquet sidecar",
                "candidate_fields": item["candidate_outputs"],
                "temporal_grain": "annual only" if annual else ("static/campaign; validate date" if static else "monthly/event; use actual observation date"),
                "expected_join_keys": "grid_id + observation_year" if annual else ("grid_id + model_version" if static else "grid_id + year_month"),
                "unit_or_encoding": "source-specific; document before merge",
                "license_requirement": "Verify license, attribution, redistribution rights, and access date before use",
                "required_checks": "CRS; coverage; date alignment; units; duplicate keys; missingness; checksum; leakage review",
                "state": "pending_source_verification",
                "notes": item["notes"],
            }
        )
    return pd.DataFrame(records, columns=EXTERNAL_FEATURE_MANIFEST_COLUMNS)


def write_collabhub_resource_audit(path: str | Path) -> Path:
    """Write catalog decisions; this CSV is metadata only."""

    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    resource_audit_frame().to_csv(destination, index=False)
    return destination


def write_external_feature_manifest(path: str | Path) -> Path:
    """Write a pending-feature contract without pretending source values exist."""

    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    external_feature_manifest_frame().to_csv(destination, index=False)
    return destination


def collabhub_audit_summary(config: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return compact contextual-resource metadata for ``source_manifest.json``."""

    settings = (config or {}).get("resource_audit", {})
    rows = resource_audit_frame()
    selected = rows.loc[
        rows["decision"].isin(
            {"conditional_feature_candidate", "selected_optional_processor", "selected_labeling_workflow", "selected_reference"}
        ),
        ["resource_id", "resource_name", "decision", "status"],
    ].to_dict(orient="records")
    return {
        "catalog_url": settings.get("catalog_url", COLLABHUB_CATALOG_URL),
        "audit_date": str(settings.get("audit_date", "2026-07-27")),
        "audit_scope": "Catalog groups plus named agriculture/geospatial items; group decisions cover unlisted entries.",
        "record_count": int(len(rows)),
        "status_counts": dict(sorted(Counter(rows["status"]).items())),
        "selected_contextual_resources": selected,
        "ingestion_rule": "Only a separately verified, licensed, date-aligned source file may enter an external sidecar. No contextual resource is a primary-table input by this audit alone.",
    }
