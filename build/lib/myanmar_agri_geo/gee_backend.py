"""Earth Engine backend for the Myanmar agricultural suitability dataset.

The module deliberately does **not** import :mod:`ee` at import time.  That
makes the data-contract helpers usable in a local/offline test environment and
keeps an Earth Engine login as an explicit runtime action.  Pass an ``ee``
module (or a lightweight fake in tests) to public functions, or let
``require_ee`` import the official ``earthengine-api`` package lazily.

The backend builds one feature image per calendar month and reduces it over a
5 km equal-area grid (EPSG:6933).  It intentionally leaves absent optical
observations masked: a cloudy Sentinel-2 month is represented by null optical
features plus quality bands, never by an implicit interpolation.  ``NDWI`` and
``NDMI`` are canopy/surface-water or canopy/surface-moisture proxies; physical
near-surface soil water is supplied separately from ERA5-Land.

Typical use (after ``earthengine authenticate``)::

    from myanmar_agri_geo.gee_backend import (
        create_5km_grid, create_monthly_export_tasks, initialize_earth_engine,
    )

    ee = initialize_earth_engine(project="my-ee-project")
    grid = create_5km_grid(ee_module=ee)
    tasks = create_monthly_export_tasks(
        "2018-01", "2018-02", grid=grid, folder="myanmar_agri", ee_module=ee,
    )
    for task in tasks:
        task.start()

``end_month`` is exclusive throughout this module.  Therefore use
``"2026-01"`` to export every month from January 2018 through December 2025.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
import argparse
import importlib
import math
from typing import Any, Iterable, Iterator, Mapping, Sequence


# Dataset identifiers are kept in one place so an operator can pin/update a
# collection without changing the compositing logic.  The public Earth Engine
# CHIRPS collection is configurable because availability of a v3 mirror may
# differ by Earth Engine account/project.  Point ``chirps_daily`` at a v3 asset
# when one is provisioned; its band must be named ``precipitation`` in mm/day.
FAO_GAUL_LEVEL0 = "FAO/GAUL/2015/level0"
FAO_GAUL_LEVEL1 = "FAO/GAUL/2015/level1"
SENTINEL2_SR_HARMONIZED = "COPERNICUS/S2_SR_HARMONIZED"
SENTINEL1_GRD = "COPERNICUS/S1_GRD"
CHIRPS_DAILY = "UCSB-CHG/CHIRPS/DAILY"
ERA5_LAND_DAILY_AGGR = "ECMWF/ERA5_LAND/DAILY_AGGR"
SRTM_ELEVATION = "USGS/SRTMGL1_003"
JRC_GLOBAL_SURFACE_WATER = "JRC/GSW1_4/GlobalSurfaceWater"
SOILGRIDS_GEE_PREFIX = "projects/soilgrids-isric"

# Earth Engine's server currently rejects the "EPSG:6933" authority string,
# even though it accepts the equivalent WKT1 definition.  Keep the canonical
# EPSG identifier in user configuration and exported metadata, and resolve it
# to this verified WKT only at Earth Engine API call sites.
_EPSG_6933_WKT1 = (
    'PROJCS["WGS 84 / NSIDC EASE-Grid 2.0 Global",'
    'GEOGCS["WGS 84",'
    'DATUM["WGS_1984",'
    'SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],'
    'AUTHORITY["EPSG","6326"]],'
    'PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],'
    'UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],'
    'AUTHORITY["EPSG","4326"]],'
    'PROJECTION["Cylindrical_Equal_Area"],'
    'PARAMETER["standard_parallel_1",30],'
    'PARAMETER["central_meridian",0],'
    'PARAMETER["false_easting",0],'
    'PARAMETER["false_northing",0],'
    'UNIT["metre",1,AUTHORITY["EPSG","9001"]],'
    'AXIS["Easting",EAST],'
    'AXIS["Northing",NORTH],'
    'AUTHORITY["EPSG","6933"]]'
)


# The CSV writer can use these contracts to generate a data dictionary.  The
# values remain in physical units; train-only normalisation belongs downstream.
FEATURE_UNITS: Mapping[str, str] = {
    "ndvi_median": "unitless (-1 to 1); cloud-masked monthly median",
    "ndwi_mcf_median": "unitless (-1 to 1); McFeeters water/canopy proxy; monthly median",
    "ndmi_median": "unitless (-1 to 1); canopy/surface-moisture proxy; monthly median",
    "s2_scene_count": "scene count per pixel in month",
    "s2_valid_observation_count": "cloud-clear scene count per pixel in month",
    "s2_cloudy_pixel_fraction": "fraction 0 to 1 per pixel; 1 - valid/scene count",
    "s1_vv_db_median": "decibels; monthly median",
    "s1_vh_db_median": "decibels; monthly median",
    "s1_scene_count": "scene count per pixel in month",
    "chirps_precipitation_mm": "millimetres per month",
    "mean_temperature_c": "degrees Celsius; monthly mean of daily mean temperature",
    "min_temperature_c": "degrees Celsius; monthly minimum daily minimum temperature",
    "max_temperature_c": "degrees Celsius; monthly maximum daily maximum temperature",
    "solar_radiation_mj_m2_day": "MJ m^-2 day^-1; monthly mean daily radiation",
    "era5_soil_moisture_m3_m3": "m^3 m^-3; monthly mean",
    "rainfall_normal_1991_2020_mm": (
        "millimetres; 1991-2020 mean for the same calendar month"
    ),
    "rainfall_anomaly_1991_2020_mm": (
        "millimetres; target month minus the 1991-2020 same-month normal"
    ),
    "rainfall_anomaly_1991_2020_pct": (
        "percent; target month relative to the 1991-2020 same-month normal"
    ),
    "temperature_normal_1991_2020_c": (
        "degrees Celsius; 1991-2020 mean for the same calendar month"
    ),
    "temperature_anomaly_1991_2020_c": (
        "degrees Celsius; target month minus the 1991-2020 same-month normal"
    ),
    "elevation_m": "metres above sea level",
    "slope_degrees": "degrees",
    "surface_water_occurrence_pct": "percent (historical occurrence)",
    "surface_water_seasonality_months": "months per year (historical)",
    "distance_to_surface_water_m": "metres; capped distance proxy",
    "soil_ph_h2o_0_30cm": "pH (H2O), thickness-weighted 0-30 cm mean",
    "soil_sand_pct_0_30cm": "percent, thickness-weighted 0-30 cm mean",
    "soil_silt_pct_0_30cm": "percent, thickness-weighted 0-30 cm mean",
    "soil_clay_pct_0_30cm": "percent, thickness-weighted 0-30 cm mean",
    "soil_soc_g_kg_0_30cm": "g kg^-1, thickness-weighted 0-30 cm mean",
    "soil_cec_cmol_kg_0_30cm": "cmol(c) kg^-1, thickness-weighted 0-30 cm mean",
}

SOIL_OUTPUT_BANDS: tuple[str, ...] = (
    "soil_ph_h2o_0_30cm",
    "soil_sand_pct_0_30cm",
    "soil_silt_pct_0_30cm",
    "soil_clay_pct_0_30cm",
    "soil_soc_g_kg_0_30cm",
    "soil_cec_cmol_kg_0_30cm",
)


class EarthEngineUnavailableError(RuntimeError):
    """Raised when an Earth Engine operation is requested without its SDK."""


@dataclass(frozen=True)
class DatasetIds:
    """Earth Engine collection/asset identifiers used by :class:`GEEConfig`.

    ``chirps_daily`` defaults to the public CHIRPS daily collection because it
    is the broadly available Earth Engine endpoint.  A deployment that has a
    CHIRPS v3 asset can supply it here, provided it exposes ``precipitation``
    in mm/day.  This makes the version choice explicit in the export metadata.
    """

    gaul_level0: str = FAO_GAUL_LEVEL0
    gaul_level1: str = FAO_GAUL_LEVEL1
    sentinel2_sr_harmonized: str = SENTINEL2_SR_HARMONIZED
    sentinel1_grd: str = SENTINEL1_GRD
    chirps_daily: str = CHIRPS_DAILY
    era5_land_daily_aggregated: str = ERA5_LAND_DAILY_AGGR
    srtm_elevation: str = SRTM_ELEVATION
    jrc_global_surface_water: str = JRC_GLOBAL_SURFACE_WATER
    soilgrids_asset_prefix: str = SOILGRIDS_GEE_PREFIX


@dataclass(frozen=True)
class GEEConfig:
    """Configuration for equal-area sampling and monthly feature creation.

    The defaults implement the compute-bounded 5 km pilot.  Centroid geometry
    keeps the stable equal-area cell identifiers while avoiding tens of
    thousands of polygon intersections and per-cell administrative lookups in
    every monthly task.  Set ``sampling_geometry="cell"`` for the more
    expensive polygon-mean production path.

    ``tile_size_m`` only labels grid cells for export sharding; it does not
    change feature resolution.
    """

    datasets: DatasetIds = DatasetIds()
    grid_crs: str = "EPSG:6933"
    grid_size_m: int = 5_000
    sample_scale_m: int = 5_000
    tile_size_m: int = 100_000
    geometry_max_error_m: int = 30
    reduce_regions_tile_scale: int = 4
    jrc_water_occurrence_threshold_pct: int = 20
    max_water_distance_m: int = 50_000
    water_distance_scale_m: int = 1_000
    sampling_geometry: str = "centroid"
    include_admin1: bool = False
    include_climate_context: bool = False
    climate_baseline_start_year: int = 1991
    climate_baseline_end_year: int = 2020


def require_ee(ee_module: Any | None = None) -> Any:
    """Return an Earth Engine module, importing it only when needed.

    Parameters
    ----------
    ee_module:
        Optional injected module.  Tests can provide a fake module and runtime
        callers normally omit it.

    Raises
    ------
    EarthEngineUnavailableError
        If ``earthengine-api`` is not installed.
    """

    if ee_module is not None:
        return ee_module
    try:
        return importlib.import_module("ee")
    except ModuleNotFoundError as exc:
        raise EarthEngineUnavailableError(
            "Earth Engine is required for this operation. Install "
            "'earthengine-api', authenticate with 'earthengine authenticate', "
            "and then initialize a project."
        ) from exc


def initialize_earth_engine(
    project: str | None = None, *, ee_module: Any | None = None
) -> Any:
    """Initialize Earth Engine and return its module.

    Authentication is intentionally not attempted automatically.  If the
    current environment has not been authenticated, the error explains the
    required manual ``earthengine authenticate`` step.
    """

    ee = require_ee(ee_module)
    try:
        if project:
            ee.Initialize(project=project)
        else:
            ee.Initialize()
    except Exception as exc:  # Earth Engine errors have several SDK classes.
        raise RuntimeError(
            "Could not initialize Earth Engine. Run 'earthengine authenticate' "
            "and supply a Google Cloud project with Earth Engine enabled."
        ) from exc
    return ee


def _coerce_month_start(value: str | date | datetime) -> date:
    """Parse a monthly boundary into the first day of that month."""

    if isinstance(value, datetime):
        return date(value.year, value.month, 1)
    if isinstance(value, date):
        return date(value.year, value.month, 1)
    if not isinstance(value, str):
        raise TypeError("month values must be YYYY-MM strings, date, or datetime")

    try:
        parsed = datetime.strptime(value, "%Y-%m")
    except ValueError:
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError as exc:
            raise ValueError(f"Invalid month {value!r}; use YYYY-MM") from exc
    return date(parsed.year, parsed.month, 1)


def _month_string(value: str | date | datetime) -> str:
    return _coerce_month_start(value).strftime("%Y-%m")


def iter_month_starts(
    start_month: str | date | datetime,
    end_month: str | date | datetime,
) -> Iterator[date]:
    """Yield month starts from ``start_month`` through exclusive ``end_month``.

    Example: ``iter_month_starts("2018-01", "2018-03")`` yields January and
    February 2018.  This helper is pure Python and can be tested offline.
    """

    current = _coerce_month_start(start_month)
    end = _coerce_month_start(end_month)
    if current >= end:
        raise ValueError("end_month must be later than start_month (exclusive)")
    while current < end:
        yield current
        if current.month == 12:
            current = date(current.year + 1, 1, 1)
        else:
            current = date(current.year, current.month + 1, 1)


def _validate_config(config: GEEConfig) -> None:
    if config.grid_size_m <= 0 or config.sample_scale_m <= 0:
        raise ValueError("grid_size_m and sample_scale_m must be positive")
    if config.tile_size_m < config.grid_size_m:
        raise ValueError("tile_size_m must be at least one grid cell wide")
    if config.tile_size_m % config.grid_size_m:
        raise ValueError("tile_size_m must be an integer multiple of grid_size_m")
    if not 0 <= config.jrc_water_occurrence_threshold_pct <= 100:
        raise ValueError("jrc_water_occurrence_threshold_pct must be 0..100")
    if config.max_water_distance_m <= 0:
        raise ValueError("max_water_distance_m must be positive")
    if config.water_distance_scale_m <= 0:
        raise ValueError("water_distance_scale_m must be positive")
    if config.water_distance_scale_m > config.max_water_distance_m:
        raise ValueError(
            "water_distance_scale_m cannot exceed max_water_distance_m"
        )
    if config.sampling_geometry not in {"centroid", "cell"}:
        raise ValueError("sampling_geometry must be 'centroid' or 'cell'")
    if config.climate_baseline_start_year > config.climate_baseline_end_year:
        raise ValueError(
            "climate_baseline_start_year must not exceed "
            "climate_baseline_end_year"
        )
    if config.include_climate_context and (
        config.climate_baseline_start_year,
        config.climate_baseline_end_year,
    ) != (1991, 2020):
        raise ValueError(
            "the published climate-context contract requires the fixed "
            "1991-2020 normal period"
        )


def _resolve_earth_engine_crs(crs: str) -> str:
    """Return an Earth Engine-compatible CRS without changing its metadata ID."""

    if crs.strip().upper() == "EPSG:6933":
        return _EPSG_6933_WKT1
    return crs


def get_myanmar_boundary(
    *,
    ee_module: Any | None = None,
    datasets: DatasetIds = DatasetIds(),
    country_name: str = "Myanmar",
) -> Any:
    """Return Myanmar's geometry from FAO GAUL 2015 level-0 boundaries.

    The returned geometry is server-side; no ``getInfo`` call is made.  This is
    important for large workflows and makes it safe to compose with image
    collections before launching an export task.
    """

    ee = require_ee(ee_module)
    countries = ee.FeatureCollection(datasets.gaul_level0).filter(
        ee.Filter.eq("ADM0_NAME", country_name)
    )
    return countries.geometry()


def get_myanmar_admin1(
    *, ee_module: Any | None = None, datasets: DatasetIds = DatasetIds()
) -> Any:
    """Return Myanmar's FAO GAUL level-1 administrative features server-side."""

    ee = require_ee(ee_module)
    return ee.FeatureCollection(datasets.gaul_level1).filter(
        ee.Filter.eq("ADM0_NAME", "Myanmar")
    )


def get_myanmar_admin1_region(
    admin1_name: str,
    *,
    ee_module: Any | None = None,
    datasets: DatasetIds = DatasetIds(),
) -> Any:
    """Return one named Myanmar GAUL level-1 geometry server-side."""

    if not admin1_name or not admin1_name.strip():
        raise ValueError("admin1_name is required")
    ee = require_ee(ee_module)
    return get_myanmar_admin1(ee_module=ee, datasets=datasets).filter(
        ee.Filter.eq("ADM1_NAME", admin1_name.strip())
    ).geometry()


def _as_geometry(region: Any, ee: Any) -> Any:
    """Coerce a Geometry/Feature/FeatureCollection-compatible region to Geometry."""

    return ee.Geometry(region)


def create_5km_grid(
    region: Any | None = None,
    *,
    config: GEEConfig = GEEConfig(),
    include_admin1: bool | None = None,
    ee_module: Any | None = None,
) -> Any:
    """Create a stable 5 km equal-area grid for a Myanmar region.

    In the default ``centroid`` mode the output feature geometry is the full
    equal-area cell's centroid, filtered to the requested region.  This is the
    competition/pilot path: it preserves 5 km identifiers and samples source
    rasters at 5 km scale without materialising clipped polygons.  In
    ``cell`` mode, output geometries are clipped cell polygons and sampling
    computes polygon means.

    ``grid_id`` is derived from the global equal-area cell and is therefore
    stable across modes and repeated runs.  Administrative lookup is disabled
    by default because it can be attached once during local assembly instead
    of being repeated in every Earth Engine task.
    """

    _validate_config(config)
    ee = require_ee(ee_module)
    region_geometry = _as_geometry(
        region if region is not None else get_myanmar_boundary(ee_module=ee, datasets=config.datasets),
        ee,
    )
    earth_engine_crs = _resolve_earth_engine_crs(config.grid_crs)
    projection = ee.Projection(earth_engine_crs).atScale(config.grid_size_m)
    raw_grid = ee.FeatureCollection(
        region_geometry.coveringGrid(projection, config.grid_size_m)
    )
    cells_per_tile = config.tile_size_m // config.grid_size_m
    max_error = config.geometry_max_error_m
    use_centroids = config.sampling_geometry == "centroid"
    attach_admin1 = config.include_admin1 if include_admin1 is None else include_admin1

    def annotate_cell(cell: Any) -> Any:
        cell = ee.Feature(cell)
        full_cell_geometry = cell.geometry()
        centre = full_cell_geometry.centroid(max_error)
        centre_6933 = centre.transform(projection, max_error)
        centre_wgs84 = centre.transform("EPSG:4326", max_error)
        xy = ee.List(centre_6933.coordinates())
        lon_lat = ee.List(centre_wgs84.coordinates())
        # ``projection`` has already been scaled to one projection unit per
        # grid cell by ``atScale(grid_size_m)``.  Earth Engine therefore
        # returns grid-cell coordinates here (for example 1799.5), not metre
        # coordinates.  Dividing by ``grid_size_m`` a second time collapses
        # thousands of cells onto the same ID.
        grid_x = ee.Number(xy.get(0)).floor()
        grid_y = ee.Number(xy.get(1)).floor()
        tile_x = grid_x.divide(cells_per_tile).floor()
        tile_y = grid_y.divide(cells_per_tile).floor()
        grid_id = (
            ee.String("mm_")
            .cat(grid_x.format("%d"))
            .cat("_")
            .cat(grid_y.format("%d"))
        )
        tile_id = (
            ee.String("tile_")
            .cat(tile_x.format("%d"))
            .cat("_")
            .cat(tile_y.format("%d"))
        )
        output_geometry = (
            centre
            if use_centroids
            else full_cell_geometry.intersection(region_geometry, max_error)
        )
        cell_area_km2: Any = (
            config.grid_size_m * config.grid_size_m / 1_000_000
            if use_centroids
            else output_geometry.area(max_error).divide(1_000_000)
        )
        return ee.Feature(output_geometry).set(
            {
                "grid_id": grid_id,
                "tile_id": tile_id,
                "grid_x": grid_x,
                "grid_y": grid_y,
                "tile_x": tile_x,
                "tile_y": tile_y,
                "latitude": ee.Number(lon_lat.get(1)),
                "longitude": ee.Number(lon_lat.get(0)),
                # The grid is already bounded by the configured Myanmar
                # geometry. Admin-1 lookup is optional, but country context is
                # deterministic and should not disappear with that choice.
                "admin0_name": "Myanmar",
                "grid_cell_size_m": config.grid_size_m,
                "cell_area_km2": cell_area_km2,
                "sampling_geometry": config.sampling_geometry,
            }
        )

    grid = raw_grid.map(annotate_cell)
    if use_centroids:
        # Since mapped feature geometries are points, this removes boundary
        # cells whose centres fall outside the requested region without a
        # costly per-cell polygon intersection.
        grid = grid.filterBounds(region_geometry)
    if not attach_admin1:
        return grid

    admin1 = get_myanmar_admin1(ee_module=ee, datasets=config.datasets)

    def annotate_admin1(cell: Any) -> Any:
        cell = ee.Feature(cell)
        # aggregate_first returns null for an empty match, which is preferable
        # to inventing an admin label for a boundary-edge cell.
        matches = admin1.filterBounds(cell.geometry().centroid(max_error))
        return cell.set(
            {
                "admin0_name": "Myanmar",
                "admin1_name": matches.aggregate_first("ADM1_NAME"),
                "admin1_code": matches.aggregate_first("ADM1_CODE"),
            }
        )

    return grid.map(annotate_admin1)


def filter_grid_to_tile(grid: Any, tile_id: str, *, ee_module: Any | None = None) -> Any:
    """Return a server-side subset of grid features with one ``tile_id``."""

    ee = require_ee(ee_module)
    return ee.FeatureCollection(grid).filter(ee.Filter.eq("tile_id", tile_id))


def list_grid_tile_ids(grid: Any, *, ee_module: Any | None = None) -> list[str]:
    """Fetch sorted tile IDs to the client for explicit export sharding.

    This is intentionally the only convenience helper that calls ``getInfo``.
    Use it once for a grid (roughly 100 km export shards by default), then pass
    the returned list to :func:`create_monthly_export_tasks`.
    """

    ee = require_ee(ee_module)
    values = ee.FeatureCollection(grid).aggregate_array("tile_id").distinct().sort()
    return list(values.getInfo())


def _s2_clear_mask(image: Any) -> Any:
    """Return Sentinel-2 SCL mask excluding clouds, shadows, cirrus and snow."""

    scl = image.select("SCL")
    # Keep SCL 2, 4, 5, 6 and 7.  Mask no-data, saturated/defective, shadow,
    # cloud classes, cirrus and snow/ice.  The optical index image inherits the
    # source band's edge mask as well.
    return (
        scl.neq(0)
        .And(scl.neq(1))
        .And(scl.neq(3))
        .And(scl.neq(8))
        .And(scl.neq(9))
        .And(scl.neq(10))
        .And(scl.neq(11))
    )


def _s2_observation_indicator(image: Any, name: str, *, cloud_free: bool, ee: Any) -> Any:
    """Build a one-valued S2 quality image retaining the desired mask."""

    indicator = ee.Image.constant(1).rename(name).toUint16().updateMask(
        image.select("B8").mask()
    )
    if cloud_free:
        indicator = indicator.updateMask(_s2_clear_mask(image))
    return indicator


def _s2_index_image(image: Any, ee: Any) -> Any:
    """Calculate cloud-masked NDVI/NDWI/NDMI for a Sentinel-2 scene."""

    clear = image.updateMask(_s2_clear_mask(image))
    # Inputs use the same reflectance scale, so normalised differences are
    # scale-invariant.  NDWI is McFeeters-style green/NIR water proxy; NDMI is
    # NIR/SWIR canopy/surface-moisture proxy, not a physical soil-water measure.
    ndvi = clear.normalizedDifference(["B8", "B4"]).rename("ndvi_median")
    ndwi = clear.normalizedDifference(["B3", "B8"]).rename("ndwi_mcf_median")
    ndmi = clear.normalizedDifference(["B8", "B11"]).rename("ndmi_median")
    return ee.Image.cat(ndvi, ndwi, ndmi).toFloat()


def _monthly_sentinel2_features(start: Any, end: Any, region: Any, config: GEEConfig, ee: Any) -> Any:
    """Compose Sentinel-2 index and per-pixel cloud-quality bands for a month."""

    source = (
        ee.ImageCollection(config.datasets.sentinel2_sr_harmonized)
        .filterBounds(region)
        .filterDate(start, end)
    )
    indices = source.map(lambda image: _s2_index_image(image, ee)).median()
    scene_count = source.map(
        lambda image: _s2_observation_indicator(
            image, "s2_scene_count", cloud_free=False, ee=ee
        )
    ).sum().rename("s2_scene_count")
    valid_count = source.map(
        lambda image: _s2_observation_indicator(
            image, "s2_valid_observation_count", cloud_free=True, ee=ee
        )
    ).sum().rename("s2_valid_observation_count")
    # Leave cloud_fraction masked where no scene exists.  If scenes existed but
    # none were clear, indices stay null while cloud_fraction is 1.
    cloud_fraction = (
        ee.Image.constant(1)
        .subtract(valid_count.divide(scene_count))
        .rename("s2_cloudy_pixel_fraction")
        .updateMask(scene_count.gt(0))
        .toFloat()
    )
    return indices.addBands(scene_count).addBands(valid_count).addBands(cloud_fraction)


def _monthly_sentinel1_features(start: Any, end: Any, region: Any, config: GEEConfig, ee: Any) -> Any:
    """Return monthly mean Sentinel-1 VV/VH dB plus observation count."""

    source = (
        ee.ImageCollection(config.datasets.sentinel1_grd)
        .filterBounds(region)
        .filterDate(start, end)
        .filter(ee.Filter.eq("instrumentMode", "IW"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
    )
    radar = source.select(["VV", "VH"]).median().rename(
        ["s1_vv_db_median", "s1_vh_db_median"]
    )
    scene_count = source.map(
        lambda image: ee.Image.constant(1)
        .rename("s1_scene_count")
        .toUint16()
        .updateMask(image.select("VV").mask())
    ).sum().rename("s1_scene_count")
    return radar.toFloat().addBands(scene_count)


def _monthly_chirps_features(start: Any, end: Any, region: Any, config: GEEConfig, ee: Any) -> Any:
    """Return CHIRPS monthly accumulated rainfall in millimetres."""

    return (
        ee.ImageCollection(config.datasets.chirps_daily)
        .filterBounds(region)
        .filterDate(start, end)
        .select("precipitation")
        .sum()
        .rename("chirps_precipitation_mm")
        .toFloat()
    )


def _monthly_era5_land_features(start: Any, end: Any, region: Any, config: GEEConfig, ee: Any) -> Any:
    """Return monthly ERA5-Land temperature, solar energy and soil water.

    ERA5-Land temperature is converted K -> deg C and accumulated daily solar
    radiation is converted J m^-2 -> MJ m^-2.  Soil water remains physical
    volumetric water content (m^3 m^-3), distinct from NDMI/NDWI proxies.
    """

    source = (
        ee.ImageCollection(config.datasets.era5_land_daily_aggregated)
        .filterBounds(region)
        .filterDate(start, end)
    )
    temperature = (
        source.select("temperature_2m")
        .mean()
        .subtract(273.15)
        .rename("mean_temperature_c")
    )
    radiation = (
        source.select("surface_solar_radiation_downwards_sum")
        .sum()
        .divide(1_000_000)
        .divide(end.difference(start, "day"))
        .rename("solar_radiation_mj_m2_day")
    )
    soil_water = source.select("volumetric_soil_water_layer_1").mean().rename(
        "era5_soil_moisture_m3_m3"
    )
    minimum = (
        source.select("temperature_2m_min")
        .min()
        .subtract(273.15)
        .rename("min_temperature_c")
    )
    maximum = (
        source.select("temperature_2m_max")
        .max()
        .subtract(273.15)
        .rename("max_temperature_c")
    )
    return (
        temperature.toFloat()
        .addBands(minimum.toFloat())
        .addBands(maximum.toFloat())
        .addBands(radiation.toFloat())
        .addBands(soil_water.toFloat())
    )


def _monthly_climate_context_features(
    month_start: date,
    current_rainfall: Any,
    current_temperature: Any,
    region: Any,
    config: GEEConfig,
    ee: Any,
) -> Any:
    """Return same-calendar-month normals and anomalies.

    This is historical climate context, not a forecast, climate-attribution
    result, or future scenario.  Each normal is calculated from complete
    calendar months across the configured baseline.  Rainfall uses the same
    CHIRPS collection as the target-month staging field and temperature uses
    the same ERA5-Land collection as the target-month temperature field, so
    an anomaly never mixes two source families.
    """

    years = ee.List.sequence(
        config.climate_baseline_start_year,
        config.climate_baseline_end_year,
    )
    calendar_month = month_start.month

    def baseline_image(year: Any) -> Any:
        year = ee.Number(year).toInt()
        start = ee.Date.fromYMD(year, calendar_month, 1)
        end = start.advance(1, "month")
        rainfall = (
            ee.ImageCollection(config.datasets.chirps_daily)
            .filterBounds(region)
            .filterDate(start, end)
            .select("precipitation")
            .sum()
            .rename("baseline_rainfall_mm")
        )
        temperature = (
            ee.ImageCollection(config.datasets.era5_land_daily_aggregated)
            .filterBounds(region)
            .filterDate(start, end)
            .select("temperature_2m")
            .mean()
            .subtract(273.15)
            .rename("baseline_temperature_c")
        )
        return rainfall.toFloat().addBands(temperature.toFloat()).set(
            "baseline_year", year
        )

    baseline = ee.ImageCollection.fromImages(years.map(baseline_image))
    rainfall_normal = (
        baseline.select("baseline_rainfall_mm")
        .mean()
        .rename("rainfall_normal_1991_2020_mm")
        .toFloat()
    )
    rainfall_anomaly = (
        ee.Image(current_rainfall)
        .select("chirps_precipitation_mm")
        .subtract(rainfall_normal)
        .rename("rainfall_anomaly_1991_2020_mm")
        .toFloat()
    )
    rainfall_anomaly_pct = (
        rainfall_anomaly.divide(rainfall_normal)
        .multiply(100)
        .updateMask(rainfall_normal.neq(0))
        .rename("rainfall_anomaly_1991_2020_pct")
        .toFloat()
    )
    temperature_normal = (
        baseline.select("baseline_temperature_c")
        .mean()
        .rename("temperature_normal_1991_2020_c")
        .toFloat()
    )
    temperature_anomaly = (
        ee.Image(current_temperature)
        .select("mean_temperature_c")
        .subtract(temperature_normal)
        .rename("temperature_anomaly_1991_2020_c")
        .toFloat()
    )
    return (
        rainfall_normal.addBands(rainfall_anomaly)
        .addBands(rainfall_anomaly_pct)
        .addBands(temperature_normal)
        .addBands(temperature_anomaly)
    )


def _static_terrain_features(region: Any, config: GEEConfig, ee: Any) -> Any:
    """Return SRTM elevation, slope, and aspect in degrees."""

    elevation = ee.Image(config.datasets.srtm_elevation).select("elevation").rename("elevation_m")
    slope = ee.Terrain.slope(elevation).rename("slope_degrees")
    aspect = ee.Terrain.aspect(elevation).rename("aspect_degrees")
    return elevation.toFloat().addBands(slope.toFloat()).addBands(aspect.toFloat()).clip(region)


def _static_jrc_water_features(region: Any, config: GEEConfig, ee: Any) -> Any:
    """Return historical JRC water occurrence, seasonality and distance proxy.

    ``distance_to_surface_water_m`` is distance to recurrent JRC surface
    water (not a hydrologically routed river-network distance).  It is capped
    at ``max_water_distance_m`` to bound computation and make the model input
    scale explicit.
    """

    water = ee.Image(config.datasets.jrc_global_surface_water)
    occurrence = water.select("occurrence").rename("surface_water_occurrence_pct")
    seasonality = water.select("seasonality").rename("surface_water_seasonality_months")
    recurrent_water = occurrence.gte(
        config.jrc_water_occurrence_threshold_pct
    ).unmask(0)
    # A 50 km distance transform on the native 30 m JRC image requires a
    # 1,667-pixel neighbourhood and dominated the original export. Aggregate
    # the binary water mask once to a documented coarser grid first. This
    # retains a useful bounded proximity proxy while making the static,
    # one-time export tractable for the Community tier.
    distance_scale_m = config.water_distance_scale_m
    distance_region = ee.Geometry(region).buffer(config.max_water_distance_m)
    recurrent_water_coarse = (
        recurrent_water.reduceResolution(
            reducer=ee.Reducer.max(), maxPixels=2048
        )
        .clipToBoundsAndScale(
            geometry=distance_region,
            scale=distance_scale_m,
        )
    )
    # fastDistanceTransform returns squared distance in coarse-grid pixels.
    max_distance_pixels = max(
        1, int(math.ceil(config.max_water_distance_m / distance_scale_m))
    )
    distance = (
        recurrent_water_coarse.fastDistanceTransform(
            max_distance_pixels, "pixels", "squared_euclidean"
        )
        .sqrt()
        .multiply(distance_scale_m)
        .min(config.max_water_distance_m)
        .rename("distance_to_surface_water_m")
    )
    return (
        occurrence.toFloat()
        .addBands(seasonality.toFloat())
        .addBands(distance.toFloat())
        .clip(region)
    )


_SOIL_PROPERTIES: tuple[tuple[str, str, float], ...] = (
    # SoilGrids mean asset units are converted exactly as documented for the
    # community GEE assets.  All depths are thickness-weighted over 0-30 cm.
    ("phh2o", "soil_ph_h2o_0_30cm", 1 / 10),
    ("sand", "soil_sand_pct_0_30cm", 1 / 10),
    ("silt", "soil_silt_pct_0_30cm", 1 / 10),
    ("clay", "soil_clay_pct_0_30cm", 1 / 10),
    ("soc", "soil_soc_g_kg_0_30cm", 1 / 10),
    ("cec", "soil_cec_cmol_kg_0_30cm", 1 / 10),
)
_SOIL_0_30_LAYERS: tuple[tuple[str, int], ...] = (
    ("0-5cm", 5),
    ("5-15cm", 10),
    ("15-30cm", 15),
)


def build_soilgrids_0_30cm_image(
    *,
    ee_module: Any | None = None,
    datasets: DatasetIds = DatasetIds(),
) -> Any:
    """Build standardised SoilGrids mean bands weighted over 0-30 cm.

    The public/community assets are expected at
    ``projects/soilgrids-isric/{property}_mean`` with depth bands such as
    ``phh2o_0-5cm_mean``.  It uses only mean assets: quantile assets are not
    assumed to exist, so uncertainty is deliberately marked unavailable in the
    sampled metadata rather than fabricated.

    Conversion factors are: pH ``/10``; sand/silt/clay ``/10`` to percent;
    SOC ``/10`` to g/kg; and CEC ``/10`` to cmol(c)/kg.
    """

    ee = require_ee(ee_module)
    result: Any | None = None
    for property_name, output_name, conversion in _SOIL_PROPERTIES:
        source = ee.Image(f"{datasets.soilgrids_asset_prefix}/{property_name}_mean")
        weighted: Any | None = None
        for depth_name, thickness_cm in _SOIL_0_30_LAYERS:
            layer = source.select(f"{property_name}_{depth_name}_mean").multiply(
                thickness_cm
            )
            weighted = layer if weighted is None else weighted.add(layer)
        standardised = weighted.divide(30).multiply(conversion).rename(output_name).toFloat()
        result = standardised if result is None else result.addBands(standardised)
    return result.set(
        {
            "soil_source": "SoilGrids community GEE mean assets",
            "soil_depth_interval_cm": "0-30",
            "soil_depth_weighting_cm": "5,10,15",
            "soil_uncertainty_available": 0,
            "soil_uncertainty_note": "quantile assets not assumed available",
        }
    )


def _resolve_soil_image(
    soil_image: Any | None,
    *,
    ee: Any,
    config: GEEConfig,
    include_gee_soil: bool = True,
) -> Any | None:
    """Return standardised soil bands from SoilGrids or a caller fallback.

    A local/WebDAV fallback should be downloaded, cached, and uploaded as an
    Earth Engine image by the caller's ingestion stage.  Pass that EE image as
    ``soil_image`` with the six :data:`SOIL_OUTPUT_BANDS`; Earth Engine cannot
    read arbitrary WebDAV URLs directly.  This explicit interface avoids an
    unreliable hidden network fallback during a long export task.
    """

    if soil_image is None and not include_gee_soil:
        return None
    if soil_image is None:
        return build_soilgrids_0_30cm_image(ee_module=ee, datasets=config.datasets)
    return ee.Image(soil_image).select(list(SOIL_OUTPUT_BANDS)).toFloat()


def build_monthly_feature_image(
    month: str | date | datetime,
    region: Any | None = None,
    *,
    config: GEEConfig = GEEConfig(),
    soil_image: Any | None = None,
    soil_source_label: str | None = None,
    soil_uncertainty_available: bool = False,
    include_gee_soil: bool = True,
    feature_set: str = "all",
    ee_module: Any | None = None,
) -> Any:
    """Build a single month's unnormalised Geo-AI predictor image.

    Parameters
    ----------
    month:
        Any date in the desired month, normally ``"YYYY-MM"``.
    region:
        Myanmar geometry by default.  Supplying a smaller region is useful for
        smoke tests and regional exports.
    soil_image:
        Optional already-standardised EE image from a local/WebDAV fallback.
        It must contain :data:`SOIL_OUTPUT_BANDS` in those physical units.
    soil_source_label:
        Provenance copied to sampled rows.  Set this when supplying a fallback
        image, for example ``"soilgrids_webdav_cache_2026-07"``.
    soil_uncertainty_available:
        Whether that supplied fallback carries separately documented
        uncertainty fields.  Mean-only SoilGrids uses ``False``.

    Returns
    -------
    ee.Image
        A masked, physical-unit image.  No global normalisation or cloud-gap
        filling is applied.
    """

    _validate_config(config)
    if feature_set not in {"all", "dynamic"}:
        raise ValueError("feature_set must be 'all' or 'dynamic'")
    ee = require_ee(ee_module)
    month_start = _coerce_month_start(month)
    start = ee.Date(month_start.isoformat())
    end = start.advance(1, "month")
    region_geometry = _as_geometry(
        region if region is not None else get_myanmar_boundary(ee_module=ee, datasets=config.datasets),
        ee,
    )

    sentinel2 = _monthly_sentinel2_features(start, end, region_geometry, config, ee)
    sentinel1 = _monthly_sentinel1_features(start, end, region_geometry, config, ee)
    chirps = _monthly_chirps_features(start, end, region_geometry, config, ee)
    era5 = _monthly_era5_land_features(start, end, region_geometry, config, ee)
    combined = (
        sentinel2.addBands(sentinel1)
        .addBands(chirps)
        .addBands(era5)
    )
    if config.include_climate_context:
        climate_context = _monthly_climate_context_features(
            month_start,
            chirps,
            era5,
            region_geometry,
            config,
            ee,
        )
        combined = combined.addBands(climate_context)
    soil: Any | None = None
    source_label = "separate_static_export"
    if feature_set == "all":
        terrain = _static_terrain_features(region_geometry, config, ee)
        water = _static_jrc_water_features(region_geometry, config, ee)
        soil = _resolve_soil_image(
            soil_image, ee=ee, config=config, include_gee_soil=include_gee_soil
        )
        source_label = soil_source_label or (
            "deferred_to_local_soilgrids_fallback"
            if soil is None
            else "soilgrids_gee_mean_0_30cm"
            if soil_image is None
            else "caller_supplied_soil_image"
        )
        combined = combined.addBands(terrain).addBands(water)
        if soil is not None:
            combined = combined.addBands(soil)
    return combined.clip(region_geometry).set(
        {
            "table_kind": (
                "monthly_combined" if feature_set == "all" else "monthly_dynamic"
            ),
            "year_month": month_start.strftime("%Y-%m"),
            "period_start": month_start.isoformat(),
            "period_end": _next_month(month_start).isoformat(),
            "feature_schema_version": (
                "myanmar_agri_geo_v1_climate_context"
                if config.include_climate_context
                else "myanmar_agri_geo_v1"
            ),
            "grid_crs": config.grid_crs,
            "grid_resolution_m": config.grid_size_m,
            "source_sentinel2": config.datasets.sentinel2_sr_harmonized,
            "source_sentinel1": config.datasets.sentinel1_grd,
            "source_chirps": config.datasets.chirps_daily,
            "source_era5_land": config.datasets.era5_land_daily_aggregated,
            "source_srtm": config.datasets.srtm_elevation,
            "source_jrc_water": config.datasets.jrc_global_surface_water,
            "source_soil": source_label,
            "climate_context_status": (
                "historical_same_month_normal_and_anomaly"
                if config.include_climate_context
                else "not_requested"
            ),
            "climate_baseline_period": (
                f"{config.climate_baseline_start_year}-"
                f"{config.climate_baseline_end_year}"
                if config.include_climate_context
                else None
            ),
            "climate_context_interpretation": (
                "historical_context_not_attribution_forecast_or_projection"
                if config.include_climate_context
                else None
            ),
            "soil_features_in_export": int(feature_set == "all" and soil is not None),
            "soil_uncertainty_available": int(soil_uncertainty_available),
            "s2_native_resolution_m": 10,
            "s1_native_resolution_m": 10,
            "soilgrids_native_resolution_m": 250,
            "chirps_native_resolution_deg": 0.05,
            "era5_land_native_resolution_deg": 0.1,
        }
    )


def build_static_feature_image(
    region: Any | None = None,
    *,
    config: GEEConfig = GEEConfig(),
    soil_image: Any | None = None,
    soil_source_label: str | None = None,
    soil_uncertainty_available: bool = False,
    include_gee_soil: bool = True,
    ee_module: Any | None = None,
) -> Any:
    """Build terrain, water-history and soil bands once per spatial shard."""

    _validate_config(config)
    ee = require_ee(ee_module)
    region_geometry = _as_geometry(
        region
        if region is not None
        else get_myanmar_boundary(ee_module=ee, datasets=config.datasets),
        ee,
    )
    terrain = _static_terrain_features(region_geometry, config, ee)
    water = _static_jrc_water_features(region_geometry, config, ee)
    soil = _resolve_soil_image(
        soil_image, ee=ee, config=config, include_gee_soil=include_gee_soil
    )
    source_label = soil_source_label or (
        "deferred_to_local_soilgrids_fallback"
        if soil is None
        else "soilgrids_gee_mean_0_30cm"
        if soil_image is None
        else "caller_supplied_soil_image"
    )
    combined = terrain.addBands(water)
    if soil is not None:
        combined = combined.addBands(soil)
    return combined.clip(region_geometry).set(
        {
            "table_kind": "static",
            # Retain the common field in raw CSVs.  The local assembler drops
            # this sentinel before joining static rows by grid_id.
            "year_month": "__static__",
            "feature_schema_version": "myanmar_agri_geo_v1",
            "grid_crs": config.grid_crs,
            "grid_resolution_m": config.grid_size_m,
            "source_srtm": config.datasets.srtm_elevation,
            "source_jrc_water": config.datasets.jrc_global_surface_water,
            "source_soil": source_label,
            "soil_features_in_export": int(soil is not None),
            "soil_uncertainty_available": int(soil_uncertainty_available),
            "soilgrids_native_resolution_m": 250,
        }
    )


def _next_month(value: date) -> date:
    """Return the first day of the following month."""

    if value.month == 12:
        return date(value.year + 1, 1, 1)
    return date(value.year, value.month + 1, 1)


def _sample_metadata(feature_image: Any, config: GEEConfig) -> dict[str, Any]:
    """Build constant source/unit metadata copied onto every sampled grid row."""

    return {
        "table_kind": feature_image.get("table_kind"),
        "year_month": feature_image.get("year_month"),
        "period_start": feature_image.get("period_start"),
        "period_end": feature_image.get("period_end"),
        "feature_schema_version": feature_image.get("feature_schema_version"),
        "grid_crs": feature_image.get("grid_crs"),
        "grid_resolution_m": feature_image.get("grid_resolution_m"),
        "source_sentinel2": feature_image.get("source_sentinel2"),
        "source_sentinel1": feature_image.get("source_sentinel1"),
        "source_chirps": feature_image.get("source_chirps"),
        "source_era5_land": feature_image.get("source_era5_land"),
        "source_srtm": feature_image.get("source_srtm"),
        "source_jrc_water": feature_image.get("source_jrc_water"),
        "source_soil": feature_image.get("source_soil"),
        "climate_context_status": feature_image.get("climate_context_status"),
        "climate_baseline_period": feature_image.get("climate_baseline_period"),
        "climate_context_interpretation": feature_image.get(
            "climate_context_interpretation"
        ),
        "soil_features_in_export": feature_image.get("soil_features_in_export"),
        "soil_uncertainty_available": feature_image.get("soil_uncertainty_available"),
        "s2_native_resolution_m": feature_image.get("s2_native_resolution_m"),
        "s1_native_resolution_m": feature_image.get("s1_native_resolution_m"),
        "soilgrids_native_resolution_m": feature_image.get("soilgrids_native_resolution_m"),
        "chirps_native_resolution_deg": feature_image.get("chirps_native_resolution_deg"),
        "era5_land_native_resolution_deg": feature_image.get("era5_land_native_resolution_deg"),
        "processing_date_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "sampling_geometry": config.sampling_geometry,
        "sampling_reducer": (
            "centroid_sample_at_scale"
            if config.sampling_geometry == "centroid"
            else "cell_mean"
        ),
        "sample_scale_m": config.sample_scale_m,
    }


def sample_feature_image_to_grid(
    feature_image: Any,
    grid: Any,
    *,
    config: GEEConfig = GEEConfig(),
    tile_id: str | None = None,
    ee_module: Any | None = None,
) -> Any:
    """Sample an image using the configured centroid or cell geometry.

    Centroid mode is the compute-bounded pilot path; cell mode calculates
    polygon means. ``s2_features_missing`` and ``s1_features_missing`` remain
    explicit rather than being filled.
    """

    _validate_config(config)
    ee = require_ee(ee_module)
    collection = ee.FeatureCollection(grid)
    if tile_id is not None:
        collection = collection.filter(ee.Filter.eq("tile_id", tile_id))
    sampled = ee.Image(feature_image).reduceRegions(
        collection=collection,
        reducer=ee.Reducer.mean(),
        scale=config.sample_scale_m,
        crs=_resolve_earth_engine_crs(config.grid_crs),
        tileScale=config.reduce_regions_tile_scale,
    )
    metadata = _sample_metadata(feature_image, config)

    def attach_metadata(feature: Any) -> Any:
        feature = ee.Feature(feature)
        # IsEqual handles either omitted reducer properties or explicit nulls.
        s2_missing = ee.Algorithms.IsEqual(feature.get("ndvi_median"), None)
        s1_missing = ee.Algorithms.IsEqual(feature.get("s1_vv_db_median"), None)
        return feature.set(metadata).set(
            {
                "s2_features_missing": ee.Number(ee.Algorithms.If(s2_missing, 1, 0)),
                "s1_features_missing": ee.Number(ee.Algorithms.If(s1_missing, 1, 0)),
            }
        )

    return sampled.map(attach_metadata)


def sample_month_to_grid(
    month: str | date | datetime,
    grid: Any,
    region: Any | None = None,
    *,
    config: GEEConfig = GEEConfig(),
    tile_id: str | None = None,
    soil_image: Any | None = None,
    soil_source_label: str | None = None,
    soil_uncertainty_available: bool = False,
    include_gee_soil: bool = True,
    feature_set: str = "all",
    ee_module: Any | None = None,
) -> Any:
    """Build and sample one monthly image; convenience wrapper for exports."""

    ee = require_ee(ee_module)
    image = build_monthly_feature_image(
        month,
        region,
        config=config,
        soil_image=soil_image,
        soil_source_label=soil_source_label,
        soil_uncertainty_available=soil_uncertainty_available,
        include_gee_soil=include_gee_soil,
        feature_set=feature_set,
        ee_module=ee,
    )
    return sample_feature_image_to_grid(
        image, grid, config=config, tile_id=tile_id, ee_module=ee
    )


def create_table_export_task(
    collection: Any,
    *,
    description: str,
    destination: str = "drive",
    folder: str | None = None,
    bucket: str | None = None,
    file_name_prefix: str | None = None,
    selectors: Sequence[str] | None = None,
    ee_module: Any | None = None,
) -> Any:
    """Create, but do not start, a CSV FeatureCollection export task.

    ``destination`` is ``"drive"`` or ``"gcs"``/``"cloud_storage"``.  The
    caller controls task start so it can inspect descriptions and throttle
    submissions.  CSV is intentionally the interchange export; downstream can
    convert it to compressed Parquet without changing server-side features.
    """

    ee = require_ee(ee_module)
    if not description:
        raise ValueError("description is required")
    prefix = file_name_prefix or description
    kwargs: dict[str, Any] = {
        "collection": ee.FeatureCollection(collection),
        "description": description,
        "fileNamePrefix": prefix,
        "fileFormat": "CSV",
    }
    if selectors is not None:
        kwargs["selectors"] = list(selectors)
    if destination == "drive":
        if folder is not None:
            kwargs["folder"] = folder
        return ee.batch.Export.table.toDrive(**kwargs)
    if destination in {"gcs", "cloud_storage"}:
        if not bucket:
            raise ValueError("bucket is required for a Cloud Storage export")
        kwargs["bucket"] = bucket
        return ee.batch.Export.table.toCloudStorage(**kwargs)
    raise ValueError("destination must be 'drive', 'gcs', or 'cloud_storage'")


def create_monthly_export_tasks(
    start_month: str | date | datetime,
    end_month: str | date | datetime,
    *,
    grid: Any | None = None,
    region: Any | None = None,
    tile_ids: Iterable[str] | None = None,
    config: GEEConfig = GEEConfig(),
    destination: str = "drive",
    folder: str | None = None,
    bucket: str | None = None,
    description_prefix: str = "myanmar_agri_geo",
    soil_image: Any | None = None,
    soil_source_label: str | None = None,
    soil_uncertainty_available: bool = False,
    include_gee_soil: bool = True,
    feature_set: str = "all",
    start_tasks: bool = False,
    ee_module: Any | None = None,
) -> list[Any]:
    """Create one CSV task per month and optional deterministic grid tile.

    With no ``tile_ids`` this creates one task per month.  For country-scale
    exports, first call :func:`list_grid_tile_ids` and pass those IDs to create
    roughly 100 km shards.  ``start_tasks=False`` is the safe default; setting
    it to true is an explicit side effect and starts every created task.
    """

    _validate_config(config)
    if feature_set not in {"all", "dynamic"}:
        raise ValueError("feature_set must be 'all' or 'dynamic'")
    ee = require_ee(ee_module)
    region_geometry = _as_geometry(
        region if region is not None else get_myanmar_boundary(ee_module=ee, datasets=config.datasets),
        ee,
    )
    export_grid = grid if grid is not None else create_5km_grid(
        region_geometry, config=config, ee_module=ee
    )
    shard_ids: tuple[str | None, ...] = (
        tuple(tile_ids) if tile_ids is not None else (None,)
    )
    if not shard_ids:
        raise ValueError("tile_ids must contain at least one tile when supplied")

    tasks: list[Any] = []
    for month_start in iter_month_starts(start_month, end_month):
        month_label = month_start.strftime("%Y_%m")
        for tile_id in shard_ids:
            sampled = sample_month_to_grid(
                month_start,
                export_grid,
                region_geometry,
                config=config,
                tile_id=tile_id,
                soil_image=soil_image,
                soil_source_label=soil_source_label,
                soil_uncertainty_available=soil_uncertainty_available,
                include_gee_soil=include_gee_soil,
                feature_set=feature_set,
                ee_module=ee,
            )
            suffix = f"_{tile_id}" if tile_id else ""
            family = "_dynamic" if feature_set == "dynamic" else ""
            description = f"{description_prefix}{family}_{month_label}{suffix}"
            task = create_table_export_task(
                sampled,
                description=description,
                destination=destination,
                folder=folder,
                bucket=bucket,
                file_name_prefix=description,
                ee_module=ee,
            )
            if start_tasks:
                task.start()
            tasks.append(task)
    return tasks


def create_static_export_tasks(
    *,
    grid: Any | None = None,
    region: Any | None = None,
    tile_ids: Iterable[str] | None = None,
    config: GEEConfig = GEEConfig(),
    destination: str = "drive",
    folder: str | None = None,
    bucket: str | None = None,
    description_prefix: str = "myanmar_agri_geo",
    soil_image: Any | None = None,
    soil_source_label: str | None = None,
    soil_uncertainty_available: bool = False,
    include_gee_soil: bool = True,
    start_tasks: bool = False,
    ee_module: Any | None = None,
) -> list[Any]:
    """Create one static-feature task per requested spatial shard."""

    _validate_config(config)
    ee = require_ee(ee_module)
    region_geometry = _as_geometry(
        region
        if region is not None
        else get_myanmar_boundary(ee_module=ee, datasets=config.datasets),
        ee,
    )
    export_grid = (
        grid
        if grid is not None
        else create_5km_grid(region_geometry, config=config, ee_module=ee)
    )
    shard_ids: tuple[str | None, ...] = (
        tuple(tile_ids) if tile_ids is not None else (None,)
    )
    if not shard_ids:
        raise ValueError("tile_ids must contain at least one tile when supplied")
    image = build_static_feature_image(
        region_geometry,
        config=config,
        soil_image=soil_image,
        soil_source_label=soil_source_label,
        soil_uncertainty_available=soil_uncertainty_available,
        include_gee_soil=include_gee_soil,
        ee_module=ee,
    )
    tasks: list[Any] = []
    for tile_id in shard_ids:
        sampled = sample_feature_image_to_grid(
            image, export_grid, config=config, tile_id=tile_id, ee_module=ee
        )
        suffix = f"_{tile_id}" if tile_id else ""
        description = f"{description_prefix}_static{suffix}"
        task = create_table_export_task(
            sampled,
            description=description,
            destination=destination,
            folder=folder,
            bucket=bucket,
            file_name_prefix=description,
            ee_module=ee,
        )
        if start_tasks:
            task.start()
        tasks.append(task)
    return tasks


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create Earth Engine CSV export tasks for the Myanmar 5 km Geo-AI dataset."
    )
    parser.add_argument("--project", help="Google Cloud project with Earth Engine enabled")
    parser.add_argument("--start", required=True, help="Inclusive month, e.g. 2018-01")
    parser.add_argument("--end", required=True, help="Exclusive month, e.g. 2026-01")
    parser.add_argument("--destination", choices=("drive", "gcs"), default="drive")
    parser.add_argument("--folder", help="Google Drive folder for --destination drive")
    parser.add_argument("--bucket", help="Cloud Storage bucket for --destination gcs")
    parser.add_argument("--prefix", default="myanmar_agri_geo", help="Export task name prefix")
    parser.add_argument(
        "--tile-id",
        action="append",
        dest="tile_ids",
        help="Optional tile ID; repeat to create selected shards only",
    )
    parser.add_argument(
        "--start-tasks",
        action="store_true",
        help="Start tasks immediately (otherwise only create and print them)",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entry point for a small, explicit Earth Engine export submission."""

    args = _build_arg_parser().parse_args(argv)
    if args.destination == "gcs" and not args.bucket:
        raise SystemExit("--bucket is required when --destination gcs")
    ee = initialize_earth_engine(args.project)
    tasks = create_monthly_export_tasks(
        args.start,
        args.end,
        tile_ids=args.tile_ids,
        destination=args.destination,
        folder=args.folder,
        bucket=args.bucket,
        description_prefix=args.prefix,
        start_tasks=args.start_tasks,
        ee_module=ee,
    )
    action = "Started" if args.start_tasks else "Created"
    print(f"{action} {len(tasks)} Earth Engine export task(s).")
    for task in tasks:
        # status() makes a service request, so only call it from this explicit
        # command-line interface rather than from library functions.
        try:
            print(task.status().get("description", "<unnamed task>"))
        except Exception:
            print("<task created; status unavailable>")
    return 0


__all__ = [
    "CHIRPS_DAILY",
    "DatasetIds",
    "EarthEngineUnavailableError",
    "FAO_GAUL_LEVEL0",
    "FEATURE_UNITS",
    "GEEConfig",
    "SOIL_OUTPUT_BANDS",
    "build_monthly_feature_image",
    "build_static_feature_image",
    "build_soilgrids_0_30cm_image",
    "create_5km_grid",
    "create_monthly_export_tasks",
    "create_static_export_tasks",
    "create_table_export_task",
    "filter_grid_to_tile",
    "get_myanmar_admin1",
    "get_myanmar_admin1_region",
    "get_myanmar_boundary",
    "initialize_earth_engine",
    "iter_month_starts",
    "list_grid_tile_ids",
    "require_ee",
    "sample_feature_image_to_grid",
    "sample_month_to_grid",
]


if __name__ == "__main__":  # pragma: no cover - exercised by an EE operator.
    raise SystemExit(main())
