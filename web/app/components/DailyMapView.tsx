"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useMemo } from "react";
import { CROP_COLORS } from "../lib/colors";
import { DailyCellPanel } from "./DailyCellPanel";

const DailyMap = dynamic(() => import("./DailyMap"), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center w-full h-full bg-gray-100">Loading Map...</div>,
});

export default function DailyMapView() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [dateStr, setDateStr] = useState<string>("latest");
  const [selectedRegion, setSelectedRegion] = useState<string>("all");
  const [selectedCrop, setSelectedCrop] = useState<string>("all");
  const [minScore, setMinScore] = useState<number>(0);
  
  // Selection
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);

  useEffect(() => {
    const fetchMap = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/v1/daily/${dateStr}/map`);
        if (!res.ok) {
          throw new Error(`Failed to load: ${res.status}`);
        }
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchMap();
  }, [dateStr]);

  const filteredData = useMemo(() => {
    return data.filter((cell) => {
      if (selectedRegion !== "all" && cell.region !== selectedRegion) return false;
      if (selectedCrop !== "all" && cell.top_crop !== selectedCrop) return false;
      if (cell.top_score < minScore) return false;
      return true;
    });
  }, [data, selectedRegion, selectedCrop, minScore]);

  const selectedCell = useMemo(() => {
    if (!selectedCellId) return null;
    return data.find(c => c.index === selectedCellId) || null;
  }, [data, selectedCellId]);

  const regions = ["all", "ayeyawaddy", "bago", "magway", "mandalay", "sagaing", "yangon"];
  const crops = ["all", ...Object.keys(CROP_COLORS).sort()];

  return (
    <div className="flex w-full h-full absolute inset-0">
      {/* Left panel - map */}
      <div className={`flex-1 relative transition-all duration-300 ${selectedCellId ? 'w-2/3' : 'w-full'}`}>
        
        {/* Controls overlay */}
        <div className="absolute top-4 left-4 z-[1000] bg-white p-4 rounded-lg shadow-lg max-w-sm">
          <h2 className="text-lg font-bold mb-4">Filters</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Date / Run</label>
              <select 
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm p-2 border"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
              >
                <option value="latest">Latest Available</option>
                {/* Could fetch available dates here from /latest */}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Region</label>
              <select 
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm p-2 border capitalize"
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
              >
                {regions.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Top Crop</label>
              <select 
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm p-2 border capitalize"
                value={selectedCrop}
                onChange={(e) => setSelectedCrop(e.target.value)}
              >
                {crops.map(c => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Min Score: {minScore}</label>
              <input 
                type="range" min="0" max="100" step="10" 
                value={minScore} 
                onChange={(e) => setMinScore(parseInt(e.target.value))}
                className="w-full mt-2" 
              />
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-xs text-gray-500">
              Showing {filteredData.length} of {data.length} cells
            </div>
            {data.length > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                Data from: {data[0]?.observation_date}
              </div>
            )}
          </div>
        </div>
        
        {/* Map */}
        {loading && <div className="absolute inset-0 bg-white/50 z-50 flex items-center justify-center font-bold">Loading data...</div>}
        {error && <div className="absolute inset-0 bg-white/80 z-50 flex items-center justify-center text-red-600 font-bold p-8 text-center">{error}</div>}
        
        <DailyMap 
          cells={filteredData} 
          selectedId={selectedCellId} 
          onSelect={(id) => setSelectedCellId(id)} 
        />
      </div>
      
      {/* Right panel - details */}
      {selectedCellId && (
        <div className="w-1/3 bg-white border-l border-gray-200 overflow-y-auto relative shadow-2xl z-20">
          <button 
            className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full hover:bg-gray-200"
            onClick={() => setSelectedCellId(null)}
          >
            ✕
          </button>
          <DailyCellPanel cell={selectedCell} />
        </div>
      )}
    </div>
  );
}
