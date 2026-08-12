# Crop Calendar Operations

## Scope and separation

The Crop Calendar is an independent agricultural reference feature:

```text
Canonical Deep Research JSON -> existing Neon PostgreSQL -> Fastify API
                                                      -> server-only web proxy
```

It does not call or modify the model server, prediction endpoints,
`optimal_planting_month`, weekly inference, 5 km grids, GeoJSON, maps, or UI.
The import file is a one-off source; every runtime API read comes from Neon.

## Required source artifact

Import requires the complete canonical JSON as a top-level array containing
exactly 102 records (17 crops × 6 regions). The importer expects the 25 fields
declared by the research report, including explicit `null` values, and accepts
the richer provenance fields when the canonical file contains them.

Do not create a seed from the compact prose matrix. That matrix confirms 102
crop-region cells, 22 `verified` and 80 `needs_verification`, but it omits most
row-level notes, source URLs, season values, and provenance that the report says
exist in the downloadable JSON/CSV. Treating those omitted values as null would
silently change the research dataset.

The following advertised artifacts were not included in the supplied
attachments as of 2026-08-11:

- `myanmar_crop_calendar_17x6_2026-08-10.json`
- `myanmar_crop_calendar_17x6_2026-08-10.csv`
- `myanmar_crop_calendar_sources_2026-08-10.json`

Use the JSON as the canonical import source when it is supplied. Do not import
the CSV in parallel or create a second conflicting dataset.

## Migration

Migration `0005` creates `crop_calendars` with UUID identifiers, exact
crop and region constraints, nullable township/season scopes, annual/perennial
branch checks, source/provenance fields, month and range validation, and a
null-safe unique scope index. Migration `0006` adds active snapshot tracking
and replaces that index with version-aware and active-scope indexes. Neither
migration drops a table, truncates or deletes data, or modifies a
prediction/model table; superseded calendar rows remain stored as inactive.

From `backend/`, with the existing Neon `DATABASE_URL` in the environment:

```bash
npm run db:migrate
```

In this workspace, the equivalent command using the root `.env` was:

```bash
node --env-file=../.env ./node_modules/tsx/dist/cli.mjs src/db/migrate.ts
```

On 2026-08-11 it applied `0004_market_mapping_version.sql`,
`0005_crop_calendars.sql`, and `0006_crop_calendar_active_snapshots.sql` to the
existing Neon database. The post-migration audit returned `data_pending` with
zero active Crop Calendar rows, which is intentional while the authoritative
JSON is missing.

## Validate and import

The importer validates the complete file before opening a database connection.
It requires:

- exact 17 × 6 coverage and no duplicate crop-region pair;
- exact supported model keys, dataset crop names/types, and canonical regions;
- the report's exact 22 `verified` crop-region pairs and 80
  `needs_verification` pairs, with no other statuses in this release;
- the report's 72 annual and 30 perennial rows, 48 annual planting rows,
  44 annual harvest rows, zero populated perennial establishment rows, and
  24 perennial harvest-season rows;
- month values from 1–12 or explicit null;
- valid min/max ranges, dates, statuses, URLs, and UTF-8;
- annual and perennial fields kept separate;
- source name and URL for every `verified` record.

It hashes the raw file, acquires a transaction-scoped advisory lock, and uses a
null-safe UPSERT. Rerunning the same file preserves row UUIDs and does not update
unchanged rows.

```bash
npm run db:import-crop-calendars -- /absolute/path/to/myanmar_crop_calendar_17x6_2026-08-10.json
```

When the root `.env` must be loaded explicitly:

```bash
node --env-file=../.env ./node_modules/tsx/dist/cli.mjs \
  src/db/import-crop-calendars.ts \
  /absolute/path/to/myanmar_crop_calendar_17x6_2026-08-10.json
```

Do not run the importer with a hand-created skeleton or narrative extraction.

## Database audit

After import, run:

```bash
npm run db:audit-crop-calendars
```

The audit reports total active rows, crops, regions, all evidence-status counts,
annual/perennial counts, planting/harvest null coverage, duplicates, rows per
crop and region, exact verified crop-region pair mismatches, source
organizations, and sanitized spot checks for:

- Black Gram + Ayeyarwady
- Monsoon Rice + Ayeyarwady
- Groundnut + Magway
- Sesame + Sagaing
- Mango + Mandalay
- Rubber + Bago
- Durian + Bago
- Longan + Mandalay

The expected row count after a successful canonical import is 102. Any other
count is a failed import/verification condition, not permission to fabricate
missing dates. The command exits nonzero with `data_pending` when no active
snapshot exists and with `invalid` when any required count or distribution
does not match.

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
query parameters are rejected before PostgreSQL is queried.

Records with weak, missing, or unverified agricultural evidence remain HTTP
200 with explicit null fields and their original verification status. A valid
crop/region combination that is physically absent from the database is 404.
When PostgreSQL is not configured, the endpoint fails safely with 503.

Month windows include separate start/end labels. A combined label is emitted
only when both bounds are known, so a sourced partial period such as a September
start never becomes an invented complete season.

The same paths exist as server-only web routes. They forward the backend key on
the server and validate the backend response before returning it. No frontend
component, popup, modal, style, navigation, or map behavior is part of this
feature.

## Naming quality

The canonical Longan model key remains `crop_suitability_longan`. The supplied
research text uses the Burmese label `တညင်း` while the project contains another
label, `လောင်ဂန်`. The importer preserves the source value and attaches a
data-quality note; it does not silently rename the crop. The research text also
differs from existing project labels for Rubber (`ရော်ဘာ` / `ရာဘာ`), Tomato
(`ခရမ်းချဉ်` / `ခရမ်းချဉ်သီး`), and Pigeon Pea
(`ပဲစဉ်းငုံ` / `ပဲစင်းငုံ`). These differences remain source-visible rather
than being silently rewritten during import.
