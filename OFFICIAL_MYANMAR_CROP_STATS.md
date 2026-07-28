# Official Myanmar crop-statistics side table

ဒီ document သည် primary 5 km/monthly Geo-CSV မဟုတ်ပါ။ Official Myanmar
crop statistics ကို မှန်ကန်သော spatial/temporal scale ဖြင့် **calibration နှင့်
aggregate evaluation side table** အဖြစ် ထားရန် လမ်းညွှန်ပါသည်။ Admin-level
annual total တစ်ခုကို 5 km grid cell အားလုံးသို့ ကူးထည့်ခြင်း မပြုရပါ။

## Verified public source

| Item | Value |
| --- | --- |
| Table | [MMSIS — Sown Acreage, Harvested Acreage and Production of Selected Crops by States and Regions](https://mmsis.gov.mm/statHtml/statHtml.do?conn_path=I2&orgId=195&tblId=DT_YAE_0032_NEW) |
| Source named on table | Settlement and Land Records Department |
| Coverage shown | Annual 2012–2023; state/region-level; unit displayed as Acre |
| Formats | CSV, XLSX, TXT via the public interactive download interface |
| Login | No account/password required for the public table |

The exact exported columns can change with the selections. Retain the original
CSV and XLSX before any cleaning. The official interface can create pivoted or
multi-row-header files, so do not assume a generic CSV parser has already
understood the crop/item/year hierarchy.

## Reproducible download procedure

1. Open the MMSIS table above in a browser.
2. Under `Item`, select `Sown`, `Harvested`, and `Production`.
3. Select the required crop leaves and the 15 State/Region/Nay Pyi Taw areas.
   If `Union` is present, retain it as a separate national aggregate—not as an
   additional admin-1 observation.
4. Select the annual periods needed, normally 2018–2023 for the current pilot,
   then click `Apply`.
5. Click the download icon and save `CSV`; also save the unmodified `XLSX`
   and `TXT` metadata when available.
6. Place the original files under `data/raw/mmsis/` with no edits. On macOS,
   calculate and record a checksum, for example:

   ```bash
   shasum -a 256 data/raw/mmsis/<original-file>.csv
   ```

7. Record the source URL, table ID `DT_YAE_0032_NEW`, selected filters,
   displayed update date, retrieval time, license/terms note and SHA-256.

The [official MMSIS user manual](https://csostat.gov.mm/FileUpload/cso/LatestInformation/User%20Manual%20Guide%20%28www.mmsis.gov.mm%29.pdf)
describes selecting criteria, applying them and choosing a download format.

## Cleaning target — a separate long-form table

Do not put this table in `data/raw/gee/`, which is reserved only for completed
Earth Engine feature exports. After manually reviewing the actual source
headers, normalize it to a separate table such as:

```text
admin1,agri_year_label,year,crop_raw,crop_canonical,measure,value,unit,
source_table_id,source_url,retrieved_at,sha256,selection_filters_json
```

Keep original `crop_raw` and the mapping decision. Preserve `Acre` rather
than guessing hectares; if a conversion is needed, add a new explicitly named
field and record the exact conversion. Reject duplicate
`admin1 + year + crop_canonical + measure` keys unless the source documents
why they differ.

## Crop coverage and safe use

The [CSO Myanmar Agricultural Statistics 2014–15 to 2022–23](https://www.csostat.gov.mm/FileUpload/cso/FileDownload/Myanmar%20%20Agricultural%20Statistics%20%282014-2015%20to%202022-2023%29.pdf)
is an independent official reference for the crop definitions below.

| Project target | Official evidence verified | Safe project use | Do not do this |
| --- | --- | --- | --- |
| Monsoon rice / dry-season rice | Table 3.03 has paddy by state/region/year, but no verified seasonal split | Evaluate a combined paddy aggregate only after crop/year/admin matching | Invent monsoon/dry-season labels from generic paddy. |
| Maize, sugarcane, cassava | Table 3.03 has state/region/year statistics | Aggregate calibration or validation at matching admin/year scale | Broadcast a total across all 5 km cells. |
| Chilli | Crop evidence exists, but the selected MMSIS leaf must be checked in the downloaded file | Use only after raw crop/measure/date values are verified | Assume coverage from a category name alone. |
| Mango, durian | National fruit table evidence | National plausibility check only | Claim a state/grid-level observed label. |
| Tomato | National vegetable table evidence | National plausibility check only | Claim a 5 km/monthly observed label. |
| Mangosteen, longan | Not verified in the cited official report | Keep provisional `rule_based`/low-confidence status | Claim high-accuracy observed labels. |

MMSIS annual results ending in 2023 cannot validate the project's 2025
temporal holdout. The [MMSIS General Reports page](https://mmsis.gov.mm/sub_menu/statistics/fileDb.jsp?code_code=005)
lists newer agriculture-statistics reports, but they must be reviewed and
normalized separately; a PDF is not automatically a clean model table.

## Split and leakage policy

- Crop area, harvested area, production and yield must **never** be predictor
  columns for the crop recommendation model.
- Keep the official statistics in a separate calibration/evaluation dataset.
- Match only like-for-like `admin1 + year + crop` aggregations; document any
  seasonal or unit mismatch.
- Do not calibrate on 2025 or on the same spatial fold used for independent
  model evaluation.
- Field observations intended as strong labels need their own consent,
  provenance, quality flag and held-out split policy.

## Project comparison command

Copy the header-only
[`data/templates/official_crop_stats_template.csv`](data/templates/official_crop_stats_template.csv),
then enter only statistics copied from a traceable official release. Every row
requires `source_org`, `source_url`, and `retrieved_at`.

Prepare an admin/year/crop prediction table with
`admin1,year,crop_id,predicted_crop_score` (and optional
`predicted_yield_t_ha`), then run:

```bash
myanmar-agri-geo compare-official-stats \
  --config config/default.yaml \
  --predictions data/evaluation/admin1_predictions.csv \
  --official data/raw/official/myanmar_crop_statistics.csv
```

The command writes matched comparison rows and a JSON report with coverage,
per-crop rank correlation, and yield error where available. It does not mutate
the 5 km features or observed-label table.
