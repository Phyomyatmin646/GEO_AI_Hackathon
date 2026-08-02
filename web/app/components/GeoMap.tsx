"use client";

import { MapContainer, Polygon, TileLayer, Tooltip } from "react-leaflet";
import type { GridCell } from "../lib/pilot-data";
import { CROP_COLORS } from "../lib/colors";
import { useLanguage } from "../lib/i18n";

type Props = {
  cells: GridCell[];
  selectedId: string;
  onSelect: (id: string) => void;
};

function cropColor(cropId: string | null, selected: boolean) {
  if (selected) return "#000000"; // Black for selected
  if (!cropId || !CROP_COLORS[cropId]) return "#8b918c"; // Grey for missing/unknown
  return CROP_COLORS[cropId];
}

export default function GeoMap({ cells, selectedId, onSelect }: Props) {
  const { lang, t } = useLanguage();
  const bounds: [[number, number], [number, number]] = cells.length
    ? [
        [
          Math.min(...cells.map((cell) => cell.latitude)),
          Math.min(...cells.map((cell) => cell.longitude)),
        ],
        [
          Math.max(...cells.map((cell) => cell.latitude)),
          Math.max(...cells.map((cell) => cell.longitude)),
        ],
      ]
    : [[15.5, 94], [18.7, 96.3]];

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [24, 24] }}
      minZoom={6}
      maxZoom={13}
      preferCanvas
      scrollWheelZoom
      className="geo-map"
      aria-label={t.dashboard.mapAria}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {cells.filter((cell) => {
        const waterFeat = cell.features.find((f) => f.id === "surface_water_occurrence_pct");
        const ndviFeat = cell.features.find((f) => f.id === "ndvi_median");
        const vvFeat = cell.features.find((f) => f.id === "s1_vv_db_median");
        
        const water = waterFeat?.value ?? 0;
        const ndvi = ndviFeat?.value ?? null;
        const vv = vvFeat?.value ?? null;
        
        // Exclude cells with significant water
        if (water > 5) return false;
        
        // Exclude urban/roads (non-vegetated). If NDVI is missing, use SAR VV as fallback.
        if (ndvi !== null && ndvi < 0.3) return false;
        if (ndvi === null && vv !== null && vv > -7.0) return false;
        
        return true;
      }).map((cell) => {
        const topCrop = cell.recommendations[0]?.id ?? null;
        const selected = cell.id === selectedId;
        const abstained = cell.recommendationStatus === "insufficient_evidence";
        return (
          <Polygon
            key={cell.id}
            positions={cell.polygon}
            pathOptions={{
              color: selected ? "#ffffff" : abstained ? "#6e756f" : "#f8faf5",
              weight: selected ? 3.0 : abstained ? 0.7 : 0.45,
              dashArray: abstained ? "3 3" : undefined,
              fillColor: cropColor(topCrop, selected),
              fillOpacity: selected ? 0.8 : abstained ? 0.3 : 0.55,
            }}
            eventHandlers={{ click: () => onSelect(cell.id) }}
          >
            <Tooltip>
              <strong>{cell.id}</strong>
              <br />
              {topCrop === null
                ? t.dashboard.tooltipInsufficient
                : `${t.dashboard.tooltipTopCrop}: ${
                    lang === "my"
                      ? cell.recommendations[0]?.nameMm
                      : cell.recommendations[0]?.nameEn
                  } (${cell.recommendations[0]?.score.toFixed(1)}/100)`}
              <br />
              {t.dashboard.tooltipMissing}: {Math.round((1 - cell.dataCoverage) * 100)}%
            </Tooltip>
          </Polygon>
        );
      })}
    </MapContainer>
  );
}
