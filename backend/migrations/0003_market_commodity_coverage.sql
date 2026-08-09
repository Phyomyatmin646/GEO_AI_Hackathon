ALTER TABLE crop_market_prices
    ALTER COLUMN crop_key DROP NOT NULL;

DROP INDEX crop_market_prices_dedupe_idx;

CREATE UNIQUE INDEX crop_market_prices_dedupe_idx
    ON crop_market_prices (
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

CREATE INDEX crop_market_prices_source_date_commodity_idx
    ON crop_market_prices (source_name, source_date DESC, commodity_name_raw);
