CREATE TABLE crop_calendars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_key TEXT NOT NULL CHECK (
        model_key IN (
            'crop_suitability_monsoon_rice',
            'crop_suitability_dry_season_rice',
            'crop_suitability_black_gram',
            'crop_suitability_groundnut',
            'crop_suitability_maize',
            'crop_suitability_sugarcane',
            'crop_suitability_cassava',
            'crop_suitability_chili',
            'crop_suitability_tomato',
            'crop_suitability_green_gram',
            'crop_suitability_pigeon_pea',
            'crop_suitability_sesame',
            'crop_suitability_rubber',
            'crop_suitability_durian',
            'crop_suitability_mangosteen',
            'crop_suitability_longan',
            'crop_suitability_mango'
        )
    ),
    crop_name_en TEXT NOT NULL,
    crop_name_mm TEXT NOT NULL,
    crop_type TEXT NOT NULL CHECK (crop_type IN ('annual', 'perennial')),
    region TEXT NOT NULL CHECK (
        region IN ('Ayeyarwady', 'Bago', 'Mandalay', 'Sagaing', 'Magway', 'Yangon')
    ),
    township TEXT,
    season TEXT,

    planting_start_month SMALLINT,
    planting_end_month SMALLINT,
    harvest_start_month SMALLINT,
    harvest_end_month SMALLINT,
    growing_duration_min_days INTEGER,
    growing_duration_max_days INTEGER,

    establishment_start_month SMALLINT,
    establishment_end_month SMALLINT,
    years_to_first_harvest_min NUMERIC,
    years_to_first_harvest_max NUMERIC,
    harvest_season_start_month SMALLINT,
    harvest_season_end_month SMALLINT,

    notes_en TEXT,
    notes_mm TEXT,
    source_code TEXT,
    source_name TEXT,
    source_title TEXT,
    source_url TEXT,
    publication_year SMALLINT,
    evidence_type TEXT,
    geographic_specificity TEXT,
    verification_status TEXT NOT NULL CHECK (
        verification_status IN (
            'verified',
            'needs_verification',
            'insufficient_evidence',
            'not_applicable',
            'not_recommended'
        )
    ),
    confidence NUMERIC,
    last_verified_date DATE,
    last_updated DATE NOT NULL,
    dataset_version TEXT NOT NULL CHECK (dataset_version ~ '^sha256:[0-9a-f]{64}$'),
    data_quality_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (crop_name_en = BTRIM(crop_name_en) AND crop_name_en <> ''),
    CHECK (crop_name_mm = BTRIM(crop_name_mm) AND crop_name_mm <> ''),
    CHECK (
        township IS NULL
        OR (township = BTRIM(township) AND township <> '' AND township !~ '[[:cntrl:]]')
    ),
    CHECK (
        season IS NULL
        OR (season = BTRIM(season) AND season <> '' AND season !~ '[[:cntrl:]]')
    ),
    CHECK (
        source_url IS NULL
        OR (
            source_url = BTRIM(source_url)
            AND source_url ~* '^https?://'
            AND source_url !~ '[[:cntrl:][:space:]]'
        )
    ),
    CHECK (planting_start_month IS NULL OR planting_start_month BETWEEN 1 AND 12),
    CHECK (planting_end_month IS NULL OR planting_end_month BETWEEN 1 AND 12),
    CHECK (harvest_start_month IS NULL OR harvest_start_month BETWEEN 1 AND 12),
    CHECK (harvest_end_month IS NULL OR harvest_end_month BETWEEN 1 AND 12),
    CHECK (establishment_start_month IS NULL OR establishment_start_month BETWEEN 1 AND 12),
    CHECK (establishment_end_month IS NULL OR establishment_end_month BETWEEN 1 AND 12),
    CHECK (harvest_season_start_month IS NULL OR harvest_season_start_month BETWEEN 1 AND 12),
    CHECK (harvest_season_end_month IS NULL OR harvest_season_end_month BETWEEN 1 AND 12),
    CHECK (growing_duration_min_days IS NULL OR growing_duration_min_days > 0),
    CHECK (growing_duration_max_days IS NULL OR growing_duration_max_days > 0),
    CHECK (
        growing_duration_min_days IS NULL
        OR growing_duration_max_days IS NULL
        OR growing_duration_min_days <= growing_duration_max_days
    ),
    CHECK (years_to_first_harvest_min IS NULL OR years_to_first_harvest_min > 0),
    CHECK (years_to_first_harvest_max IS NULL OR years_to_first_harvest_max > 0),
    CHECK (
        years_to_first_harvest_min IS NULL
        OR years_to_first_harvest_max IS NULL
        OR years_to_first_harvest_min <= years_to_first_harvest_max
    ),
    CHECK (publication_year IS NULL OR publication_year BETWEEN 1800 AND 2100),
    CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    CHECK (last_verified_date IS NULL OR last_verified_date <= last_updated),
    CHECK (
        (crop_type = 'annual' AND model_key IN (
            'crop_suitability_monsoon_rice',
            'crop_suitability_dry_season_rice',
            'crop_suitability_black_gram',
            'crop_suitability_groundnut',
            'crop_suitability_maize',
            'crop_suitability_sugarcane',
            'crop_suitability_cassava',
            'crop_suitability_chili',
            'crop_suitability_tomato',
            'crop_suitability_green_gram',
            'crop_suitability_pigeon_pea',
            'crop_suitability_sesame'
        ))
        OR
        (crop_type = 'perennial' AND model_key IN (
            'crop_suitability_rubber',
            'crop_suitability_durian',
            'crop_suitability_mangosteen',
            'crop_suitability_longan',
            'crop_suitability_mango'
        ))
    ),
    CHECK (
        crop_type <> 'annual'
        OR (
            establishment_start_month IS NULL
            AND establishment_end_month IS NULL
            AND years_to_first_harvest_min IS NULL
            AND years_to_first_harvest_max IS NULL
            AND harvest_season_start_month IS NULL
            AND harvest_season_end_month IS NULL
        )
    ),
    CHECK (
        crop_type <> 'perennial'
        OR (
            planting_start_month IS NULL
            AND planting_end_month IS NULL
            AND harvest_start_month IS NULL
            AND harvest_end_month IS NULL
            AND growing_duration_min_days IS NULL
            AND growing_duration_max_days IS NULL
        )
    ),
    CHECK (
        verification_status <> 'verified'
        OR (source_name IS NOT NULL AND source_url IS NOT NULL)
    )
);

CREATE UNIQUE INDEX crop_calendars_scope_unique_idx
    ON crop_calendars (
        model_key,
        region,
        COALESCE(township, ''),
        COALESCE(season, '')
    );

CREATE INDEX crop_calendars_model_region_idx
    ON crop_calendars (model_key, region, last_updated DESC);

CREATE INDEX crop_calendars_region_idx
    ON crop_calendars (region, model_key);

CREATE INDEX crop_calendars_verification_idx
    ON crop_calendars (verification_status, last_updated DESC);
