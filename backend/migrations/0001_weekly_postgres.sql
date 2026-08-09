CREATE TABLE IF NOT EXISTS pipeline_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cadence TEXT NOT NULL DEFAULT 'weekly' CHECK (cadence = 'weekly'),
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'processing', 'partially_succeeded', 'succeeded', 'failed')
    ),
    schema_version TEXT NOT NULL,
    model_catalog_version TEXT NOT NULL,
    source_manifest_sha256 TEXT NOT NULL CHECK (source_manifest_sha256 ~ '^[0-9a-f]{64}$'),
    regions_expected INTEGER NOT NULL DEFAULT 6 CHECK (regions_expected = 6),
    regions_succeeded INTEGER NOT NULL DEFAULT 0 CHECK (regions_succeeded >= 0),
    regions_failed INTEGER NOT NULL DEFAULT 0 CHECK (regions_failed >= 0),
    cells_succeeded INTEGER NOT NULL DEFAULT 0 CHECK (cells_succeeded >= 0),
    cells_failed INTEGER NOT NULL DEFAULT 0 CHECK (cells_failed >= 0),
    region_results JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (week_end = week_start + 7),
    CHECK (regions_succeeded + regions_failed <= regions_expected),
    CHECK (status <> 'succeeded' OR (regions_succeeded = regions_expected AND regions_failed = 0)),
    CHECK (status <> 'failed' OR regions_succeeded = 0),
    CHECK (
        status <> 'partially_succeeded'
        OR (regions_succeeded > 0 AND regions_failed > 0)
    ),
    UNIQUE (week_start, model_catalog_version, schema_version)
);

CREATE INDEX IF NOT EXISTS pipeline_runs_week_start_idx
    ON pipeline_runs (week_start DESC);
CREATE INDEX IF NOT EXISTS pipeline_runs_status_idx
    ON pipeline_runs (status, created_at);

CREATE TABLE IF NOT EXISTS weekly_region_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_run_id UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
    region TEXT NOT NULL CHECK (
        region IN ('yangon', 'bago', 'mandalay', 'sagaing', 'magway', 'ayeyawaddy')
    ),
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    payload JSONB NOT NULL,
    cell_count INTEGER NOT NULL CHECK (cell_count >= 0),
    source_sha256 TEXT NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
    prediction_sha256 TEXT NOT NULL CHECK (prediction_sha256 ~ '^[0-9a-f]{64}$'),
    model_catalog_version TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    coverage_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK (week_end = week_start + 7),
    CHECK (expires_at > created_at),
    UNIQUE (pipeline_run_id, region)
);

CREATE INDEX IF NOT EXISTS weekly_region_predictions_week_start_idx
    ON weekly_region_predictions (week_start DESC);
CREATE INDEX IF NOT EXISTS weekly_region_predictions_region_idx
    ON weekly_region_predictions (region, week_start DESC);
CREATE INDEX IF NOT EXISTS weekly_region_predictions_expires_at_idx
    ON weekly_region_predictions (expires_at);

CREATE TABLE IF NOT EXISTS crop_market_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crop_key TEXT NOT NULL CHECK (
        crop_key IN (
            'monsoon_rice', 'dry_season_rice', 'black_gram', 'green_gram',
            'maize', 'groundnut', 'chili', 'sesame', 'sugarcane', 'cassava',
            'tomato', 'pigeon_pea', 'rubber', 'mango', 'durian', 'mangosteen',
            'longan'
        )
    ),
    commodity_name_raw TEXT NOT NULL,
    variety TEXT,
    region TEXT,
    marketplace TEXT,
    price_min NUMERIC(20, 6),
    price_max NUMERIC(20, 6),
    currency VARCHAR(8) NOT NULL,
    quantity NUMERIC(20, 6) NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_date DATE NOT NULL,
    source_url TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (price_min IS NOT NULL OR price_max IS NOT NULL),
    CHECK (price_min IS NULL OR price_min >= 0),
    CHECK (price_max IS NULL OR price_max >= 0),
    CHECK (price_min IS NULL OR price_max IS NULL OR price_max >= price_min)
);

CREATE UNIQUE INDEX IF NOT EXISTS crop_market_prices_dedupe_idx
    ON crop_market_prices (
        crop_key,
        commodity_name_raw,
        COALESCE(variety, ''),
        COALESCE(region, ''),
        COALESCE(marketplace, ''),
        source_name,
        source_date,
        quantity,
        unit
    );
CREATE INDEX IF NOT EXISTS crop_market_prices_crop_date_idx
    ON crop_market_prices (crop_key, source_date DESC, fetched_at DESC);
CREATE INDEX IF NOT EXISTS crop_market_prices_source_date_idx
    ON crop_market_prices (source_name, source_date DESC);
