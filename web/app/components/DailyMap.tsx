import { MapContainer, Polygon, TileLayer, Tooltip } from "react-leaflet";
import { CROP_COLORS } from "../lib/colors";
import "leaflet/dist/leaflet.css";

type Props = {
  cells: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export default function DailyMap({ cells, selectedId, onSelect }: Props) {
  const bounds: [[number, number], [number, number]] = cells.length > 0
    ? [
        [
          Math.min(...cells.map((cell) => cell.lat)),
          Math.min(...cells.map((cell) => cell.lon)),
        ],
        [
          Math.max(...cells.map((cell) => cell.lat)),
          Math.max(...cells.map((cell) => cell.lon)),
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
      {cells.filter(cell => cell.polygon).map((cell) => {
        const isSelected = selectedId === cell.index;
        const color = cell.color || CROP_COLORS[cell.top_crop] || "#9E9E9E";
        const polyCoords = cell.polygon;
        
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
                  Crop: {(cell.top_crop || "None").replace(/_/g, ' ')}
                </div>
                <div>Score: {cell.top_score}</div>
              </div>
            </Tooltip>
          </Polygon>
        );
      })}
    </MapContainer>
  );
}
