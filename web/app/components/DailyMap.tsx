import { MapContainer, Polygon, TileLayer, Tooltip } from "react-leaflet";
import { CROP_COLORS } from "../lib/colors";
import type { DailyMapCellView } from "../lib/daily-map-data";
import "leaflet/dist/leaflet.css";

type Props = {
  cells: DailyMapCellView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export default function DailyMap({ cells, selectedId, onSelect }: Props) {
  const bounds: [[number, number], [number, number]] = cells.length > 0
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
    : [[15.5, 94], [28.6, 101.2]];

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [24, 24] }}
      minZoom={5}
      maxZoom={13}
      preferCanvas
      scrollWheelZoom
      className="w-full h-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {cells.filter((cell) => cell.polygon !== null).map((cell) => {
        const isSelected = selectedId === cell.index;
        const color = cell.color || (cell.topCrop ? CROP_COLORS[cell.topCrop] : undefined) || "#9E9E9E";
        const polyCoords = cell.polygon;
        if (!polyCoords) return null;
        
        return (
          <Polygon
            key={cell.index}
            positions={polyCoords}
            pathOptions={{
              fillColor: color,
              fillOpacity: isSelected ? 0.9 : 0.6,
              color: isSelected ? "#000" : color,
              weight: isSelected ? 2 : 1,
            }}
            eventHandlers={{
              click: () => onSelect(cell.index),
            }}
          >
            <Tooltip sticky>
              <div className="font-sans">
                <div className="font-bold border-b pb-1 mb-1">
                  Grid ID: {cell.index}
                </div>
                <div className="capitalize">Region: {cell.region}</div>
                <div className="capitalize text-blue-600 font-bold">
                  Crop: {(cell.topCrop || "None").replace(/_/g, " ")}
                </div>
                <div>Score: {cell.topScore ?? "—"}</div>
              </div>
            </Tooltip>
          </Polygon>
        );
      })}
    </MapContainer>
  );
}
