from __future__ import annotations

import json

from myanmar_agri_geo.soilgrids import write_vrt_source_manifest


def test_webdav_manifest_is_a_lightweight_fallback_not_a_global_raster_download(tmp_path) -> None:
    manifest = write_vrt_source_manifest(
        {
            "webdav_base_url": "https://files.isric.org/soilgrids/latest/data",
            "properties": ["phh2o", "sand"],
            "uncertainty_properties": ["phh2o"],
            "depth_intervals_cm": ["0-5", "5-15", "15-30"],
        },
        tmp_path,
    )
    records = json.loads(manifest.read_text(encoding="utf-8"))
    assert len(records) == 9
    assert records[0]["url"].endswith("phh2o/phh2o_0-5cm_mean.vrt")
    assert any(record["statistic"] == "uncertainty" for record in records)
