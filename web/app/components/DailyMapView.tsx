"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useMemo } from "react";
import { CROP_COLORS } from "../lib/colors";
import {
  decodeDailyMapViewPayload,
  type DailyMapCellView,
} from "../lib/daily-map-data";
import { useLanguage } from "../lib/i18n";
import { DailyCellPanel } from "./DailyCellPanel";

const DailyMap = dynamic(() => import("./DailyMap"), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center w-full h-full bg-gray-100">Loading Map...</div>,
});

export default function DailyMapView() {
  const { lang } = useLanguage();
  const [data, setData] = useState<DailyMapCellView[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  
  // Filters
  const [dateStr, setDateStr] = useState<string>("latest");
  const [selectedRegion, setSelectedRegion] = useState<string>("all");
  const [selectedCrop, setSelectedCrop] = useState<string>("all");
  const [minScore, setMinScore] = useState<number>(0);
  
  // Selection
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const fetchMap = async () => {
      setLoading(true);
      setErrorCode(null);
      try {
        const res = await fetch(`/api/v1/daily/${encodeURIComponent(dateStr)}/map`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null) as unknown;
          const code = typeof payload === "object" && payload !== null &&
            "error" in payload && typeof payload.error === "object" && payload.error !== null &&
            "code" in payload.error && typeof payload.error.code === "string"
            ? payload.error.code
            : "DAILY_MAP_UNAVAILABLE";
          throw new Error(code);
        }
        const decoded = decodeDailyMapViewPayload(await res.json() as unknown);
        if (!decoded) throw new Error("DAILY_MAP_INVALID_RESPONSE");
        if (!controller.signal.aborted) {
          setData(decoded);
          setSelectedCellId((current) =>
            current && decoded.some((cell) => cell.index === current) ? current : null,
          );
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setData([]);
        setErrorCode(error instanceof Error ? error.message : "DAILY_MAP_UNAVAILABLE");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void fetchMap();
    return () => controller.abort();
  }, [dateStr]);

  const filteredData = useMemo(() => {
    return data.filter((cell) => {
      if (selectedRegion !== "all" && cell.region !== selectedRegion) return false;
      if (selectedCrop !== "all" && cell.topCrop !== selectedCrop) return false;
      if (cell.topScore === null || cell.topScore < minScore) return false;
      return true;
    });
  }, [data, selectedRegion, selectedCrop, minScore]);

  const selectedCell = useMemo(() => {
    if (!selectedCellId) return null;
    return data.find((cell) => cell.index === selectedCellId) ?? null;
  }, [data, selectedCellId]);

  const regions = ["all", "ayeyawaddy", "bago", "magway", "mandalay", "sagaing", "yangon"];
  const crops = ["all", ...Object.keys(CROP_COLORS).sort()];
  const copy = lang === "my"
    ? {
        filters: "စစ်ထုတ်ရန်",
        date: "ရက် / Run",
        latest: "နောက်ဆုံးရရှိနိုင်သောဒေတာ",
        region: "ဒေသ",
        crop: "ထိပ်ဆုံးသီးနှံ",
        minimum: "အနည်းဆုံးအမှတ်",
        showing: "ပြထားသော cell",
        source: "ဒေတာရက်",
        loading: "ဒေတာရယူနေသည်…",
        empty: "ဤစစ်ထုတ်မှုအတွက် cell မရှိပါ။",
        unavailable: "Daily map ဒေတာကို ယာယီရယူ၍မရပါ။",
        expired: "ရွေးချယ်ထားသော weekly map ဒေတာ သက်တမ်းကုန်သွားပါပြီ။",
        close: "အသေးစိတ်ပိတ်ရန်",
      }
    : {
        filters: "Filters",
        date: "Date / Run",
        latest: "Latest available",
        region: "Region",
        crop: "Top crop",
        minimum: "Minimum score",
        showing: "Showing cells",
        source: "Data from",
        loading: "Loading data…",
        empty: "No cells match these filters.",
        unavailable: "Daily map data is temporarily unavailable.",
        expired: "The selected weekly map data has expired.",
        close: "Close details",
      };
  const errorMessage = errorCode?.includes("EXPIRED") ? copy.expired : copy.unavailable;

  return (
    <div className="flex w-full h-full absolute inset-0">
      {/* Left panel - map */}
      <div className={`flex-1 relative transition-all duration-300 ${selectedCellId ? 'w-2/3' : 'w-full'}`}>
        
        {/* Controls overlay */}
        <div className="absolute top-4 left-4 z-[1000] bg-white p-4 rounded-lg shadow-lg max-w-sm">
          <h2 className="text-lg font-bold mb-4">{copy.filters}</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">{copy.date}</label>
              <select 
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm p-2 border"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
              >
                <option value="latest">{copy.latest}</option>
                {/* Could fetch available dates here from /latest */}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">{copy.region}</label>
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
              <label className="block text-sm font-medium text-gray-700">{copy.crop}</label>
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
              <label className="block text-sm font-medium text-gray-700">{copy.minimum}: {minScore}</label>
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
              {copy.showing}: {filteredData.length} / {data.length}
            </div>
            {data.length > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                {copy.source}: {data[0]?.observationDate}
              </div>
            )}
          </div>
        </div>
        
        {/* Map */}
        {loading && <div className="absolute inset-0 bg-white/50 z-50 flex items-center justify-center font-bold" role="status">{copy.loading}</div>}
        {!loading && errorCode && <div className="absolute inset-0 bg-white/80 z-50 flex items-center justify-center text-red-600 font-bold p-8 text-center" role="alert">{errorMessage}</div>}
        {!loading && !errorCode && filteredData.length === 0 && <div className="absolute inset-0 bg-white/75 z-40 flex items-center justify-center text-gray-700 font-semibold p-8 text-center" role="status">{copy.empty}</div>}
        
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
            aria-label={copy.close}
          >
            ✕
          </button>
          <DailyCellPanel cell={selectedCell} />
        </div>
      )}
    </div>
  );
}
