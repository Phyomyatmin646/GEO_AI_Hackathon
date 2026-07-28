"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../lib/i18n";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from "recharts";
import Link from "next/link";
import { CROP_COLORS } from "../lib/colors";

export default function MacroPage() {
  const { dict, lang, setLang } = useLanguage();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/macro")
      .then(res => res.json())
      .then(res => {
        setData(res);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f6f2] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-700"></div>
      </div>
    );
  }

  // Split history and forecast for rendering
  const historyData = data.macro.filter((d: any) => !d.is_forecast);
  const forecastData = data.macro.filter((d: any) => d.is_forecast);
  // We need to connect the lines by putting the last history point in the forecast array
  if (historyData.length > 0 && forecastData.length > 0) {
    forecastData.unshift(historyData[historyData.length - 1]);
  }

  return (
    <div className="min-h-screen bg-[#f7f6f2] text-slate-800 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-emerald-900 tracking-tight">{dict.macro.title}</h1>
            <p className="text-slate-500 mt-2">{dict.macro.subtitle}</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setLang(lang === "en" ? "my" : "en")}
              className="bg-emerald-800 text-white px-4 py-2 rounded shadow hover:bg-emerald-700 transition"
            >
              {lang === "en" ? "မြန်မာ" : "English"}
            </button>
            <Link href="/" className="text-emerald-700 font-medium hover:underline">
              &larr; Back to Map
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {/* GDP Chart */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100/50">
            <h2 className="text-xl font-semibold mb-4 text-slate-700">{dict.macro.gdpTrend}</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorGdp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                  <XAxis dataKey="year" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(tick) => tick.toString()} />
                  <YAxis tickFormatter={(val) => `$${(val / 1e9).toFixed(1)}B`} />
                  <Tooltip formatter={(val: number) => [`$${(val / 1e9).toFixed(2)} Billion`, "GDP"]} labelFormatter={(l) => `Year: ${l}`} />
                  <Legend />
                  <Area data={historyData} type="monotone" dataKey="gdp_usd" stroke="#059669" fillOpacity={1} fill="url(#colorGdp)" name="Historical GDP" />
                  <Area data={forecastData} type="monotone" dataKey="gdp_usd" stroke="#059669" strokeDasharray="5 5" fillOpacity={0} name="AI Forecast" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-400 mt-2 italic">{dict.macro.forecastInfo}</p>
          </div>

          {/* Trade Balance / Exports */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100/50">
            <h2 className="text-xl font-semibold mb-4 text-slate-700">{dict.macro.tradeBalance}</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                  <XAxis dataKey="year" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(tick) => tick.toString()} />
                  <YAxis tickFormatter={(val) => `$${(val / 1e9).toFixed(1)}B`} />
                  <Tooltip formatter={(val: number) => [`$${(val / 1e9).toFixed(2)} Billion`, dict.macro.export]} labelFormatter={(l) => `Year: ${l}`} />
                  <Legend />
                  <Area data={historyData} type="monotone" dataKey="exports_usd" stroke="#2563eb" fillOpacity={1} fill="url(#colorExp)" name="Historical Exports" />
                  <Area data={forecastData} type="monotone" dataKey="exports_usd" stroke="#2563eb" strokeDasharray="5 5" fillOpacity={0} name="Forecast Exports" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Phenology (Crop Calendar) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100/50 mb-8">
          <h2 className="text-xl font-semibold mb-6 text-slate-700">{dict.macro.phenology}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="pb-3 font-semibold text-slate-500">Crop</th>
                  {data.phenology[0]?.calendar.map((m: any) => (
                    <th key={m.month} className="pb-3 font-semibold text-slate-500 text-center w-16">{m.month}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.phenology.map((crop: any) => (
                  <tr key={crop.crop_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
                    <td className="py-3 flex items-center gap-2 font-medium text-slate-700">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: CROP_COLORS[crop.crop_id] }}></span>
                      {crop.crop_name}
                    </td>
                    {crop.calendar.map((m: any, i: number) => (
                      <td key={i} className="py-3 text-center">
                        {m.stage === "Planting" && <span className="inline-block w-full py-1 bg-amber-100 text-amber-700 rounded text-xs">Plant</span>}
                        {m.stage === "Growing" && <span className="inline-block w-full py-1 bg-emerald-100 text-emerald-700 rounded text-xs">Grow</span>}
                        {m.stage === "Harvesting" && <span className="inline-block w-full py-1 bg-blue-100 text-blue-700 rounded text-xs">Harvest</span>}
                        {m.stage === "None" && <span className="inline-block w-full py-1 text-slate-300">-</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
