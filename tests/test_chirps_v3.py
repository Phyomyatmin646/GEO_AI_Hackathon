from __future__ import annotations

import json

import pandas as pd
import pytest

from myanmar_agri_geo.chirps_v3 import (
    attach_chirps_v3_from_cache,
    chirps_v3_filename,
    chirps_v3_url,
    write_download_manifest,
)


def test_chirps_v3_url_and_manifest_follow_the_official_monthly_pattern(tmp_path) -> None:
    assert chirps_v3_filename("2025-07") == "chirps-v3.0.2025.07.tif"
    assert chirps_v3_url("2025-07").endswith("/chirps-v3.0.2025.07.tif")
    path = write_download_manifest(["2018-01", "2025-12"], cache_dir=tmp_path)
    records = json.loads(path.read_text(encoding="utf-8"))
    assert [record["year_month"] for record in records] == ["2018-01", "2025-12"]


def test_chirps_v3_never_silently_falls_back_when_complete_cache_is_required(tmp_path) -> None:
    frame = pd.DataFrame(
        {
            "grid_id": ["MMR_A"],
            "year_month": ["2018-01"],
            "longitude": [96.0],
            "latitude": [16.0],
            "chirps_precipitation_mm": [123.0],
        }
    )
    with pytest.raises(FileNotFoundError):
        attach_chirps_v3_from_cache(frame, cache_dir=tmp_path, require_complete_cache=True)

    explicit_fallback = attach_chirps_v3_from_cache(frame, cache_dir=tmp_path, require_complete_cache=False)
    assert explicit_fallback.loc[0, "chirps_precipitation_mm"] == 123.0
    assert explicit_fallback.loc[0, "rainfall_data_status"] == "gee_chirps_staging_fallback"


def test_chirps_v3_samples_a_cached_geotiff_in_physical_mm(tmp_path) -> None:
    rasterio = pytest.importorskip("rasterio")
    from rasterio.transform import from_origin
    import numpy as np

    path = tmp_path / "chirps-v3.0.2018.01.tif"
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=2,
        width=2,
        count=1,
        dtype="float32",
        crs="EPSG:4326",
        transform=from_origin(95.0, 17.0, 1.0, 1.0),
        nodata=-9999.0,
    ) as dataset:
        dataset.write(np.array([[42.0, 55.0], [60.0, -9999.0]], dtype="float32"), 1)
    frame = pd.DataFrame(
        {
            "grid_id": ["MMR_A"],
            "year_month": ["2018-01"],
            "longitude": [95.5],
            "latitude": [16.5],
            "chirps_precipitation_mm": [0.0],
        }
    )
    output = attach_chirps_v3_from_cache(frame, cache_dir=tmp_path)
    assert output.loc[0, "chirps_precipitation_mm"] == 42.0
    assert output.loc[0, "rainfall_data_status"] == "chirps_v3_cache"
