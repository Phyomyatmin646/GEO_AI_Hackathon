"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Polygon, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { GridCell } from "../lib/pilot-data";
import { useLanguage } from "../lib/i18n";

type Props = {
  cells: GridCell[];
  selectedId: string;
  onSelect: (id: string) => void;
};

const HEAT_STOPS = ["#61b9ea", "#78cbb2", "#f1d35e", "#f49a45", "#ef5c4f"];

function scoreColor(normalized: number | null) {
  if (normalized === null) return "#8b918c";
  const scaled = normalized * (HEAT_STOPS.length - 1);
  const lowerIndex = Math.min(Math.floor(scaled), HEAT_STOPS.length - 2);
  const amount = scaled - lowerIndex;
  const from = HEAT_STOPS[lowerIndex].slice(1).match(/.{2}/g)?.map((part) => parseInt(part, 16)) ?? [0, 0, 0];
  const to = HEAT_STOPS[lowerIndex + 1].slice(1).match(/.{2}/g)?.map((part) => parseInt(part, 16)) ?? [0, 0, 0];
  const channel = (index: number) => Math.round(from[index] + (to[index] - from[index]) * amount);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

function MapViewportSync({ bounds }: { bounds: [[number, number], [number, number]] }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    let frame = 0;
    const syncViewport = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        map.invalidateSize({ animate: false });
        map.fitBounds(bounds, { padding: [24, 24], animate: false });
      });
    };

    syncViewport();
    const observer = new ResizeObserver(syncViewport);
    observer.observe(container);
    window.addEventListener("resize", syncViewport);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", syncViewport);
    };
  }, [bounds, map]);

  return null;
}

export default function GeoMap({ cells, selectedId, onSelect }: Props) {
  const { lang, t } = useLanguage();
  const bounds = useMemo<[[number, number], [number, number]]>(() => (
    cells.length
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
      : [[15.5, 94], [18.7, 96.3]]
  ), [cells]);
  const scorePercentiles = useMemo(() => {
    const scores = cells.flatMap((cell) => {
      const score = cell.recommendations[0]?.score;
      return typeof score === "number" ? [score] : [];
    }).sort((a, b) => a - b);
    const percentiles = new Map<number, number>();
    let groupStart = 0;
    while (groupStart < scores.length) {
      let groupEnd = groupStart;
      while (groupEnd + 1 < scores.length && scores[groupEnd + 1] === scores[groupStart]) {
        groupEnd += 1;
      }
      const midpoint = (groupStart + groupEnd) / 2;
      percentiles.set(scores[groupStart], scores.length > 1 ? midpoint / (scores.length - 1) : 0.72);
      groupStart = groupEnd + 1;
    }
    return percentiles;
  }, [cells]);

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
      <MapViewportSync bounds={bounds} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {cells.map((cell) => {
        const topCrop = cell.recommendations[0]?.id ?? null;
        const topScore = cell.recommendations[0]?.score ?? null;
        const selected = cell.id === selectedId;
        const abstained = cell.recommendationStatus === "insufficient_evidence";
        return (
          <Polygon
            key={cell.id}
            positions={cell.polygon}
            pathOptions={{
              color: selected ? "#17623f" : abstained ? "#7c827d" : "rgba(255,255,255,0.72)",
              weight: selected ? 3.2 : abstained ? 0.75 : 0.55,
              dashArray: abstained ? "3 3" : undefined,
              fillColor: scoreColor(topScore === null ? null : (scorePercentiles.get(topScore) ?? 0.5)),
              fillOpacity: selected ? 0.92 : abstained ? 0.3 : 0.74,
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
