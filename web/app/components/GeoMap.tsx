"use client";

import { MapContainer, Polygon, TileLayer, Tooltip } from "react-leaflet";
import type { GridCell } from "../lib/pilot-data";
import { CROP_COLORS } from "../lib/colors";

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
      aria-label="Ayeyawaddy real 5 kilometre equal-area pilot grid map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {cells.map((cell) => {
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
              fillOpacity: selected ? 1.0 : abstained ? 0.52 : 0.85,
            }}
            eventHandlers={{ click: () => onSelect(cell.id) }}
          >
            <Tooltip>
              <strong>{cell.id}</strong>
              <br />
              {topCrop === null
                ? "Insufficient evidence — no recommendation"
                : `Top Crop: ${cell.recommendations[0]?.nameEn} (${cell.recommendations[0]?.score.toFixed(1)}/100)`}
              <br />
              Missing: {Math.round((1 - cell.dataCoverage) * 100)}%
            </Tooltip>
          </Polygon>
        );
      })}
    </MapContainer>
  );
}
