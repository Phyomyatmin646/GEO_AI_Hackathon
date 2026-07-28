# Myanmar Agricultural GeoAI Pipeline - Implementation Plan
**Date:** 2026-07-28
**Scope:** Master Roadmap (Steps 2 to 10)

## Phase 1: Data Architecture & FAQ Integration (Steps 2 & 4)
### Step 2: Real-data Architecture
1. Restructure `data/` directories (`raw`, `interim`, `processed`, `labels/observed`, `labels/weak`, `exports`, `manifests`).
2. Update pipeline to save Parquet and CSV in `data/exports/` and source manifests in `data/manifests/`.
3. Standardize missing-value logging (No synthetic data padding).

### Step 4: Bilingual FAQ Module
1. Ingest `Agriculture.csv` into `data/raw/faq/`.
2. Clean and structure the dataset (`faq_id`, `category`, `question_en`, `question_mm`, `answer_en`, `answer_mm`, `sources`, etc.).
3. Build API endpoint `/api/v1/faq` in the Next.js app.
4. Build a dedicated UI page for FAQ search and filtering with full Myanmar/English toggle.

## Phase 2: Ground Truth & Label Architecture (Step 3)
1. Establish data contracts for real observed labels vs weak labels.
2. Refactor the `labeling.py` module to strictly separate rule-based predictions from observed targets.
3. Build a validation script to flag missing/duplicate records, check class imbalances, and emit a Quality Gate report. (Training blocks until this report passes).

## Phase 3: Model Training & Evaluation (Step 5)
1. Implement a true train/val/test split strategy (Spatial and Temporal holdouts - locking 2025 as test set).
2. Develop baseline models (TFT/LSTM for phenology, ViT/CNN/GNN for spatial patterns).
3. Implement evaluation metrics (Macro F1, Precision/Recall, Brier score).
4. Integrate probability calibration and an "insufficient evidence" abstention fallback.

## Phase 4: Product Functions & Maintainability (Steps 6, 7, 8)
1. **Frontend/Backend Separation:** Move from static JSON loading to a proper database-backed API (e.g., Cloudflare D1/SQLite or Postgres via Drizzle ORM).
2. **Product Features:** Add interactive Risk Flags, Historical Visualization, and Feedback forms.
3. **Engineering Hardening:** Implement CI/CD, Unit/Integration testing, Structured Logging, and Docker setup.
4. **10-15 Year Maintainability:** Document schemas, API versioning, data refresh pipelines, and operations manual.

## Phase 5: Final Delivery & Canvas Compliance (Steps 9 & 10)
1. Create `docs/CANVAS_COMPLIANCE_MATRIX.md` mapping hackathon requirements to code evidence.
2. Finalize all API documentation and user guides.
3. Final security/privacy reviews.
