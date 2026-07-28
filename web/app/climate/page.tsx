"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../lib/i18n";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import Link from "next/link";

export default function ClimatePage() {
  const { t, lang, setLang } = useLanguage();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/climate")
      .then(res => res.json())
      .then(res => {
        setData(res.climate);
        setLoading(false);
      });
  }, []);

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-[#f7f6f2] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-700"></div>
      </div>
    );
  }

  // Calculate disasters list
  const allDisasters = data.flatMap((d: any) => d.disasters || []).sort((a: any, b: any) => b.year - a.year);

  return (
    <div className="min-h-screen bg-[#f7f6f2] text-slate-800 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-emerald-900 tracking-tight">Climate & Disaster Risk</h1>
            <p className="text-slate-500 mt-2">National Weather Trends and Vulnerability to Natural Disasters</p>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Temperature Anomaly Chart */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100/50">
            <h2 className="text-xl font-semibold mb-4 text-slate-700">Temperature Anomaly (°C)</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                  <XAxis dataKey="year" tickFormatter={(tick) => tick.toString()} />
                  <YAxis />
                  <Tooltip formatter={(val: number) => [`${val > 0 ? '+' : ''}${val.toFixed(2)}°C`, "Temp Anomaly"]} />
                  <Bar dataKey="temp_anomaly_c" name="Temp Anomaly vs 2000 Baseline">
                    {data.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.temp_anomaly_c > 0 ? '#ef4444' : '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-400 mt-2 italic">Myanmar has seen consistent temperature increases over the last two decades.</p>
          </div>

          {/* Precipitation Chart */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100/50">
            <h2 className="text-xl font-semibold mb-4 text-slate-700">Annual Precipitation (mm)</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                  <XAxis dataKey="year" tickFormatter={(tick) => tick.toString()} />
                  <YAxis domain={['auto', 'auto']} />
                  <Tooltip formatter={(val: number) => [`${val} mm`, "Precipitation"]} />
                  <Legend />
                  <Line type="monotone" dataKey="annual_precipitation_mm" stroke="#0ea5e9" strokeWidth={2} dot={{r: 3}} name="Annual Rainfall" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-400 mt-2 italic">Notice the high volatility, indicating higher risks of both floods and droughts.</p>
          </div>
        </div>

        {/* Disaster Logs */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100/50">
          <h2 className="text-xl font-semibold mb-6 text-slate-700">Major Natural Disasters History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="pb-3 font-semibold text-slate-500">Year</th>
                  <th className="pb-3 font-semibold text-slate-500">Event</th>
                  <th className="pb-3 font-semibold text-slate-500">Type</th>
                  <th className="pb-3 font-semibold text-slate-500">Severity</th>
                  <th className="pb-3 font-semibold text-slate-500">Agri Damage (USD)</th>
                  <th className="pb-3 font-semibold text-slate-500">Affected Regions</th>
                </tr>
              </thead>
              <tbody>
                {allDisasters.map((disaster: any, idx: number) => (
                  <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
                    <td className="py-3 font-medium text-slate-700">{disaster.year}</td>
                    <td className="py-3 text-slate-800">{disaster.event}</td>
                    <td className="py-3">
                      {disaster.type === 'Cyclone' && <span className="inline-block px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">Cyclone</span>}
                      {disaster.type === 'Flood' && <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">Flood</span>}
                      {disaster.type === 'Drought' && <span className="inline-block px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">Drought</span>}
                    </td>
                    <td className="py-3">
                      {disaster.severity === 'Extreme' && <span className="text-red-600 font-semibold">Extreme</span>}
                      {disaster.severity === 'High' && <span className="text-orange-500 font-semibold">High</span>}
                      {disaster.severity === 'Medium' && <span className="text-yellow-600 font-semibold">Medium</span>}
                    </td>
                    <td className="py-3 text-slate-600">${(disaster.agri_damage_usd / 1_000_000).toFixed(0)}M</td>
                    <td className="py-3 text-slate-500 text-xs">{disaster.affected_regions.join(", ")}</td>
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
