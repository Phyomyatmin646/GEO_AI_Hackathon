ALTER TABLE crop_market_prices
    ADD COLUMN mapping_version TEXT NOT NULL DEFAULT 'legacy'
    CHECK (mapping_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$');

DROP INDEX crop_market_prices_dedupe_idx;

CREATE UNIQUE INDEX crop_market_prices_dedupe_idx
    ON crop_market_prices (
        mapping_version,
        COALESCE(crop_key, '__unmapped__'),
        commodity_name_raw,
        COALESCE(variety, ''),
        COALESCE(region, ''),
        COALESCE(marketplace, ''),
        source_name,
        source_date,
        quantity,
        unit
    );

CREATE INDEX crop_market_prices_mapping_crop_date_idx
    ON crop_market_prices (mapping_version, crop_key, source_date DESC, fetched_at DESC);

CREATE INDEX crop_market_prices_mapping_source_date_idx
    ON crop_market_prices (mapping_version, source_name, source_date DESC);
