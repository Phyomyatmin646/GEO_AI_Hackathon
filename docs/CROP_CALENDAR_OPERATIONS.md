# Crop Calendar Operations

## Runtime flow

The Crop Calendar is an independent agricultural reference feature:

```text
Canonical checked-in CSV -> strict startup validator -> in-memory backend snapshot
                                                    -> Fastify API
                                                    -> server-only web proxy
                                                    -> /crop-calendar UI
```

It does not call or modify the model server, prediction endpoints,
`optimal_planting_month`, weekly inference, 5 km grids, GeoJSON, or maps. Crop
Calendar runtime reads do not require Neon/PostgreSQL.

## Canonical source

Runtime requires the complete canonical CSV containing exactly 102 records
(17 crops × 6 regions) with the exact ordered 25-column research header. Empty
CSV fields are converted to explicit nulls before the existing strict dataset
validator runs.

```text
backend/data/crop-calendars/myanmar_crop_calendar_17x6_2026-08-10.csv
SHA-256 4d4eebe478eb540537a433c4628ee2ff253dd9a24e941ca1c412eea25316dd23
```

Do not replace it with a prose-derived skeleton, a partial export, or invented
calendar fields. The 25 source columns are:

```text
crop_id,crop_name_en,crop_name_mm,region,township,crop_type,
planting_start_month,planting_end_month,harvest_start_month,harvest_end_month,
growing_duration_min_days,growing_duration_max_days,
establishment_start_month,establishment_end_month,
years_to_first_harvest_min,years_to_first_harvest_max,
harvest_season_start_month,harvest_season_end_month,season,notes_en,notes_mm,
source_name,source_url,verification_status,last_updated
```

## Startup and replacement

The default `CROP_CALENDAR_CSV_PATH` is
`./data/crop-calendars/myanmar_crop_calendar_17x6_2026-08-10.csv`, resolved from
the backend process working directory. Docker sets the absolute container path.
The backend reads and hashes the file once during startup; requests never reopen
or reparse it.

To replace the release, preserve the exact 25 columns and all 102 crop-region
rows, set `CROP_CALENDAR_CSV_PATH` to the replacement, then restart the backend.
If validation fails, startup fails with a sanitized error and the invalid
snapshot is never served.

The local loader validates the complete file without opening a database
connection. It requires:

- exact 17 × 6 coverage and no duplicate crop-region pair;
- exact supported model keys, dataset crop names/types, and canonical regions;
- the report's exact 22 `verified` crop-region pairs and 80
  `needs_verification` pairs, with no other statuses in this release;
- 72 annual and 30 perennial rows, 48 annual planting rows, 44 annual harvest
  rows, zero populated perennial establishment rows, and 24 perennial
  harvest-season rows;
- month values from 1–12 or explicit null;
- valid min/max ranges, dates, statuses, URLs, and UTF-8;
- annual and perennial fields kept separate;
- source name and URL for every `verified` record.

The raw-file SHA-256 becomes `dataset_version` in every API record. The legacy
PostgreSQL migrations/importer remain in the repository for compatibility, but
the configured local CSV takes precedence for the public API.

## API

Public Fastify endpoints:

```text
GET /api/v1/crop-calendars/crops
GET /api/v1/crop-calendars?region=Ayeyarwady
GET /api/v1/crop-calendars/:modelKey?region=Ayeyarwady
GET /api/v1/crop-calendars/:modelKey?region=Ayeyarwady&season=...
```

`Ayeyarwady`, the legacy `Ayeyawaddy`, and case variants normalize to the
research canonical `Ayeyarwady`. Unknown keys, regions, filters, or repeated
query parameters are rejected before the repository is queried.

Records with weak, missing, or unverified agricultural evidence remain HTTP
200 with explicit null fields and their original verification status. A valid
crop/region combination that is physically absent is 404.

Month windows include separate start/end labels. A combined label is emitted
only when both bounds are known, so a sourced partial period such as a September
start never becomes an invented complete season. Cross-year periods such as
December–January remain intact.

The same paths exist as server-only web routes. They forward the backend key on
the server and validate the backend response before returning it. The bilingual
`/crop-calendar` page provides region, crop-name, and annual/perennial filters,
12-month planting/establishment and harvest timelines, explicit missing/partial
evidence, verification status, update date, and source links.

## Naming quality

The canonical Longan model key remains `crop_suitability_longan`. The supplied
research text uses the Burmese label `တညင်း` while the project contains another
label, `လောင်ဂန်`. The loader preserves the source value and attaches a
data-quality note; it does not silently rename the crop. The research text also
differs from existing project labels for Rubber (`ရော်ဘာ` / `ရာဘာ`), Tomato
(`ခရမ်းချဉ်` / `ခရမ်းချဉ်သီး`), and Pigeon Pea
(`ပဲစဉ်းငုံ` / `ပဲစင်းငုံ`). These differences remain source-visible rather
than being silently rewritten.
