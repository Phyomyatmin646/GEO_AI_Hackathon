from __future__ import annotations

import json

import pandas as pd

from myanmar_agri_geo.official_stats import compare_official_statistics


def test_official_statistics_are_compared_as_aggregate_side_table(tmp_path) -> None:
    predictions_path = tmp_path / "predictions.csv"
    official_path = tmp_path / "official.csv"
    comparison_path = tmp_path / "comparison.csv"
    report_path = tmp_path / "report.json"

    pd.DataFrame(
        {
            "admin1": ["Ayeyawaddy", "Bago", "Sagaing"],
            "year": [2024, 2024, 2024],
            "crop_id": ["monsoon_rice"] * 3,
            "predicted_crop_score": [90.0, 75.0, 60.0],
            "predicted_yield_t_ha": [4.5, 3.8, 3.0],
        }
    ).to_csv(predictions_path, index=False)
    pd.DataFrame(
        {
            "admin1": ["Ayeyawaddy", "Bago", "Sagaing"],
            "year": [2024, 2024, 2024],
            "crop_id": ["monsoon_rice"] * 3,
            "official_crop_area_ha": [1_000_000, 700_000, 400_000],
            "official_production_tonnes": [4_600_000, 2_600_000, 1_250_000],
            "official_yield_t_ha": [4.6, 3.7, 3.1],
            "source_org": ["Official test source"] * 3,
            "source_url": ["https://example.gov.mm/statistics"] * 3,
            "retrieved_at": ["2026-07-28"] * 3,
        }
    ).to_csv(official_path, index=False)

    report = compare_official_statistics(
        predictions_path,
        official_path,
        comparison_path=comparison_path,
        report_path=report_path,
    )

    assert report["valid"] is True
    assert report["matched_rows"] == 3
    assert report["overall_score_vs_official_area_spearman"] == 1.0
    assert "evaluation-only" in report["safety_note"]
    assert comparison_path.is_file()
    assert json.loads(report_path.read_text())["matched_rows"] == 3
