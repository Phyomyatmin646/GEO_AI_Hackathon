from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from myanmar_agri_geo.cli import main
from myanmar_agri_geo.gee_backend import (
    GEEConfig,
    _resolve_earth_engine_crs,
    create_5km_grid,
    iter_month_starts,
    sample_feature_image_to_grid,
)


def test_month_iterator_is_exclusive_at_end() -> None:
    values = [item.isoformat() for item in iter_month_starts("2025-11", "2026-02")]
    assert values == ["2025-11-01", "2025-12-01", "2026-01-01"]


def test_cli_plan_and_gee_preflight_are_side_effect_free(capsys) -> None:
    assert main(["plan", "--config", "config/default.yaml"]) == 0
    plan = json.loads(capsys.readouterr().out)
    assert plan["country"] == "Myanmar"
    assert plan["monthly_export_count_without_tiling"] == 96
    assert plan["gee_end_month_exclusive"] == "2026-01"

    assert main(["gee-export", "--config", "config/default.yaml", "--dry-run"]) == 0
    preflight = json.loads(capsys.readouterr().out)
    assert preflight["task_count"] == 96
    assert preflight["end_month_exclusive"] == "2026-01"


def test_resource_audit_command_writes_metadata_only(tmp_path, capsys) -> None:
    assert main(["resource-audit", "--config", "config/default.yaml", "--output-dir", str(tmp_path)]) == 0
    output = json.loads(capsys.readouterr().out)
    assert Path(output["resource_audit"]).is_file()
    assert Path(output["external_feature_manifest"]).is_file()
    assert "no external source values" in output["note"]


def test_epsg_6933_is_resolved_to_verified_wkt_only_for_earth_engine() -> None:
    resolved = _resolve_earth_engine_crs("epsg:6933")

    assert resolved.startswith(
        'PROJCS["WGS 84 / NSIDC EASE-Grid 2.0 Global"'
    )
    assert 'PROJECTION["Cylindrical_Equal_Area"]' in resolved
    assert 'AUTHORITY["EPSG","6933"]' in resolved
    assert _resolve_earth_engine_crs("EPSG:32647") == "EPSG:32647"


def test_grid_creation_passes_resolved_epsg_6933_wkt_to_earth_engine() -> None:
    class FakeProjection:
        def atScale(self, scale: int) -> FakeProjection:
            assert scale == 5_000
            return self

    class FakeFeatureCollection:
        def map(self, _callback: Any) -> FakeFeatureCollection:
            return self

    class FakeRegion:
        def coveringGrid(
            self, projection: FakeProjection, scale: int
        ) -> FakeFeatureCollection:
            assert isinstance(projection, FakeProjection)
            assert scale == 5_000
            return FakeFeatureCollection()

    class FakeEE:
        projection_crs: str | None = None

        def Geometry(self, value: Any) -> Any:
            return value

        def Projection(self, crs: str) -> FakeProjection:
            self.projection_crs = crs
            return FakeProjection()

        def FeatureCollection(self, value: Any) -> Any:
            return value

    fake_ee = FakeEE()
    create_5km_grid(
        FakeRegion(),
        include_admin1=False,
        ee_module=fake_ee,
    )

    assert fake_ee.projection_crs is not None
    assert fake_ee.projection_crs.startswith(
        'PROJCS["WGS 84 / NSIDC EASE-Grid 2.0 Global"'
    )


def test_grid_sampling_passes_resolved_wkt_but_keeps_canonical_metadata() -> None:
    class FakeReducer:
        @staticmethod
        def mean() -> str:
            return "mean"

    class FakeCollection:
        def map(self, _callback: Any) -> FakeCollection:
            return self

    class FakeFeatureImage:
        reduce_regions_kwargs: dict[str, Any] | None = None

        def get(self, name: str) -> str:
            return name

        def reduceRegions(self, **kwargs: Any) -> FakeCollection:
            self.reduce_regions_kwargs = kwargs
            return FakeCollection()

    class FakeEE:
        Reducer = FakeReducer

        @staticmethod
        def FeatureCollection(value: Any) -> Any:
            return value

        @staticmethod
        def Image(value: Any) -> Any:
            return value

    image = FakeFeatureImage()
    config = GEEConfig(grid_crs="EPSG:6933")
    sample_feature_image_to_grid(
        image,
        FakeCollection(),
        config=config,
        ee_module=FakeEE(),
    )

    assert image.reduce_regions_kwargs is not None
    assert image.reduce_regions_kwargs["crs"].startswith(
        'PROJCS["WGS 84 / NSIDC EASE-Grid 2.0 Global"'
    )
    assert config.grid_crs == "EPSG:6933"
