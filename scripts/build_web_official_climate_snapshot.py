#!/usr/bin/env python3
"""Build a provenance-backed climate snapshot for the web dashboard."""

from __future__ import annotations

import csv
import hashlib
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "data" / "output" / "gee_2018_2026"
SOURCE_CSV = SOURCE_DIR / "myanmar_agri_suitability.csv"
QA_REPORT = SOURCE_DIR / "qa_report.json"
SOURCE_MANIFEST = SOURCE_DIR / "source_manifest.json"
DESTINATION = ROOT / "web" / "data" / "official" / "climate_ayeyawaddy.json"
FIRST_COMPLETE_YEAR = 2019
LAST_COMPLETE_YEAR = 2025


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def numeric(value: str) -> float | None:
    if not value:
        return None
    return float(value)


def main() -> None:
    qa = json.loads(QA_REPORT.read_text(encoding="utf-8"))
    if not qa.get("valid"):
        raise SystemExit("Refusing to publish climate data because QA did not pass")

    manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    monthly: dict[str, dict[str, float | int]] = defaultdict(
        lambda: {
            "row_count": 0,
            "rainfall_sum": 0.0,
            "rainfall_count": 0,
            "temperature_sum": 0.0,
            "temperature_count": 0,
            "soil_moisture_sum": 0.0,
            "soil_moisture_count": 0,
        }
    )

    with SOURCE_CSV.open(newline="", encoding="utf-8") as source:
        reader = csv.DictReader(source)
        for row in reader:
            year_month = row["year_month"]
            year = int(year_month[:4])
            if year < FIRST_COMPLETE_YEAR or year > LAST_COMPLETE_YEAR:
                continue

            bucket = monthly[year_month]
            bucket["row_count"] += 1

            rainfall = numeric(row["monthly_rainfall_mm"])
            if rainfall is not None:
                bucket["rainfall_sum"] += rainfall
                bucket["rainfall_count"] += 1

            temperature = numeric(row["mean_temperature_c"])
            if temperature is not None:
                bucket["temperature_sum"] += temperature
                bucket["temperature_count"] += 1

            soil_moisture = numeric(row["era5_soil_moisture_m3_m3"])
            if soil_moisture is not None:
                bucket["soil_moisture_sum"] += soil_moisture
                bucket["soil_moisture_count"] += 1

    annual: list[dict[str, float | int]] = []
    for year in range(FIRST_COMPLETE_YEAR, LAST_COMPLETE_YEAR + 1):
        year_months = [monthly.get(f"{year}-{month:02d}") for month in range(1, 13)]
        if any(month is None for month in year_months):
            raise SystemExit(f"Year {year} is incomplete and cannot be published")

        complete_months = [month for month in year_months if month is not None]
        rainfall_means = [
            float(month["rainfall_sum"]) / int(month["rainfall_count"])
            for month in complete_months
            if int(month["rainfall_count"]) > 0
        ]
        temperature_means = [
            float(month["temperature_sum"]) / int(month["temperature_count"])
            for month in complete_months
            if int(month["temperature_count"]) > 0
        ]
        soil_moisture_means = [
            float(month["soil_moisture_sum"]) / int(month["soil_moisture_count"])
            for month in complete_months
            if int(month["soil_moisture_count"]) > 0
        ]

        if len(rainfall_means) != 12 or len(temperature_means) != 12:
            raise SystemExit(f"Year {year} does not have 12 valid climate months")

        annual.append(
            {
                "year": year,
                "annual_rainfall_mm": round(sum(rainfall_means), 2),
                "mean_temperature_c": round(
                    sum(temperature_means) / len(temperature_means),
                    2,
                ),
                "mean_soil_moisture_m3_m3": (
                    round(sum(soil_moisture_means) / len(soil_moisture_means), 4)
                    if soil_moisture_means
                    else None
                ),
                "months": 12,
                "grid_cell_observations": sum(
                    int(month["row_count"]) for month in complete_months
                ),
            }
        )

    selected_sources = manifest["selected_sources"]
    payload = {
        "schemaVersion": "1.0",
        "dataContract": "qa_passed_climate_annual_snapshot",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "scope": {
            "country": "Myanmar",
            "region": "Ayeyawaddy",
            "grid": "5 km equal-area cells",
            "aggregation": (
                "Monthly spatial mean across equal-area cells; annual rainfall is "
                "the sum of 12 monthly means; temperature and soil moisture are "
                "the mean of 12 monthly spatial means."
            ),
            "completeYears": [FIRST_COMPLETE_YEAR, LAST_COMPLETE_YEAR],
        },
        "qa": {
            "valid": True,
            "rowCount": qa["summary"]["row_count"],
            "warningCount": qa["summary"]["warning_count"],
            "errorCount": qa["summary"]["error_count"],
            "qaReportSha256": sha256(QA_REPORT),
            "sourceManifestSha256": sha256(SOURCE_MANIFEST),
            "sourceCsvSha256": sha256(SOURCE_CSV),
        },
        "sources": [
            {
                "id": "chirps-v3",
                "organization": "UCSB Climate Hazards Center",
                "dataset": selected_sources["chirps"]["dataset_id"],
                "indicator": "Annual rainfall",
                "unit": "mm/year",
                "nativeResolution": selected_sources["chirps"]["resolution"],
                "temporalCoverage": selected_sources["chirps"]["temporal_coverage"],
                "citationUrl": selected_sources["chirps"]["source_url"],
            },
            {
                "id": "era5-land",
                "organization": "Copernicus Climate Change Service / ECMWF",
                "dataset": selected_sources["era5_land"]["dataset_id"],
                "indicator": "Mean 2 m temperature and soil moisture",
                "unit": "°C; m³/m³",
                "nativeResolution": selected_sources["era5_land"]["resolution"],
                "temporalCoverage": selected_sources["era5_land"]["temporal_coverage"],
                "citationUrl": selected_sources["era5_land"]["source_url"],
            },
        ],
        "values": annual,
    }

    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    DESTINATION.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {DESTINATION.relative_to(ROOT)} with {len(annual)} annual records")


if __name__ == "__main__":
    main()
