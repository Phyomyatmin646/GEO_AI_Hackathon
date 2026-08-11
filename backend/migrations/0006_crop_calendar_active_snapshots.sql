ALTER TABLE crop_calendars
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

DROP INDEX crop_calendars_scope_unique_idx;

CREATE UNIQUE INDEX crop_calendars_version_scope_unique_idx
    ON crop_calendars (
        model_key,
        region,
        COALESCE(township, ''),
        COALESCE(season, ''),
        dataset_version
    );

CREATE UNIQUE INDEX crop_calendars_active_region_scope_unique_idx
    ON crop_calendars (
        model_key,
        region,
        COALESCE(township, '')
    )
    WHERE is_active;

CREATE INDEX crop_calendars_active_region_idx
    ON crop_calendars (region, model_key, last_updated DESC)
    WHERE is_active;
