"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, Polygon, TileLayer, Tooltip, useMap, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { GridCell } from "../lib/pilot-data";
import { useLanguage } from "../lib/i18n";

type Props = {
  cells: GridCell[];
  selectedId: string;
  onSelect: (id: string) => void;
  overlay?: Record<string, MapCellOverlay>;
};

export type MapCellOverlay = {
  score: number;
  label: string;
  kind: "crop" | "health";
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

export default function GeoMap({ cells, selectedId, onSelect, overlay }: Props) {
  const { lang, t } = useLanguage();
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("currentUser");
      if (stored) setCurrentUser(JSON.parse(stored));
    } catch (e) {
      // ignore
    }
  }, []);
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
      const score = overlay ? overlay[cell.id]?.score : cell.recommendations[0]?.score;
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
  }, [cells, overlay]);

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
        const liveOverlay = overlay?.[cell.id];
        const topCrop = overlay ? (liveOverlay?.label ?? null) : (cell.recommendations[0]?.id ?? null);
        const topScore = overlay ? (liveOverlay?.score ?? null) : (cell.recommendations[0]?.score ?? null);
        const selected = cell.id === selectedId;
        const abstained = overlay
          ? !liveOverlay
          : cell.recommendationStatus === "insufficient_evidence";
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
                : liveOverlay?.kind === "health"
                  ? `${lang === "my" ? "Weekly သီးနှံကျန်းမာရေး" : "Weekly crop health"}: ${topScore?.toFixed(1)}/100`
                  : `${t.dashboard.tooltipTopCrop}: ${
                    liveOverlay
                      ? topCrop.replaceAll("_", " ")
                      :
                    lang === "my"
                      ? cell.recommendations[0]?.nameMm
                      : cell.recommendations[0]?.nameEn
                  } (${topScore?.toFixed(1)}/100)`}
              <br />
              {t.dashboard.tooltipMissing}: {Math.round((1 - cell.dataCoverage) * 100)}%
            </Tooltip>
          </Polygon>
        );
      })}

      {currentUser && currentUser.location?.grid_id && (
        (() => {
          const userCell = cells.find((c) => c.id === currentUser.location.grid_id);
          if (userCell) {
            // Calculate center of polygon roughly
            const lats = userCell.polygon.map(p => p[0]);
            const lngs = userCell.polygon.map(p => p[1]);
            const centerLat = (Math.max(...lats) + Math.min(...lats)) / 2;
            const centerLng = (Math.max(...lngs) + Math.min(...lngs)) / 2;
            
            const customIcon = new L.Icon({
              iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
              iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
              shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
              iconSize: [25, 41],
              iconAnchor: [12, 41],
            });

            return (
              <Marker position={[centerLat, centerLng]} icon={customIcon}>
                <Popup>
                  <strong>{currentUser.username}</strong>
                  <br />
                  Your registered farm location
                  <br />
                  Grid: {currentUser.location.grid_id}
                </Popup>
              </Marker>
            );
          }
          return null;
        })()
      )}
    </MapContainer>
  );
}
