"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from "recharts";

export default function ClimateDisasterChart({ climateData, t }: { climateData: any, t: any }) {
  if (!climateData || !t) return null;

  return (
    <div className="flex flex-col gap-8 mb-8">
      {/* Climate Trends */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100/50">
        <h2 className="text-xl font-semibold mb-4 text-slate-700">{t.climateTrendsTitle}</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={climateData.climate_trends} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
              <XAxis dataKey="decade" />
              <YAxis domain={['dataMin - 0.5', 'dataMax + 0.5']} tickFormatter={(val) => `${val}°C`} />
              <Tooltip formatter={(val: number) => [`${val}°C`, t.avgTemp]} />
              <Legend />
              <Line type="monotone" dataKey="avg_temp_c" stroke="#f43f5e" strokeWidth={3} dot={{ r: 6, fill: "#f43f5e" }} name={t.avgTemp} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Disasters Impact */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100/50">
        <h2 className="text-xl font-semibold mb-4 text-slate-700">{t.historicalDisastersTitle}</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={climateData.natural_disasters} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
              <XAxis dataKey="year" />
              <YAxis tickFormatter={(val) => `${(val / 1e6).toFixed(0)}M`} />
              <Tooltip 
                formatter={(val: number, name: string) => [
                  name === "impact_usd" ? `$${(val / 1e6).toFixed(0)} Million` : `${val.toLocaleString()} ha`, 
                  name === "impact_usd" ? t.financialImpact : t.affectedArea
                ]} 
                labelFormatter={(l, payloads) => {
                  if (payloads && payloads[0]) return `${payloads[0].payload.event} (${l})`;
                  return l;
                }}
              />
              <Legend />
              <Bar dataKey="affected_agri_hectares" fill="#f59e0b" name={t.affectedArea} yAxisId="left" />
              <Bar dataKey="impact_usd" fill="#3b82f6" name={t.totalImpact} yAxisId="right" />
              <YAxis yAxisId="left" orientation="left" stroke="#f59e0b" tickFormatter={(val) => `${(val / 1000).toFixed(0)}k ha`} />
              <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" tickFormatter={(val) => `$${(val / 1e6).toFixed(0)}M`} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-slate-400 mt-2 italic">{t.disasterNote}</p>
      </div>

      {/* Future Risks */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100/50">
        <h2 className="text-xl font-semibold mb-4 text-slate-700">{t.futureRisksTitle}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {climateData.climate_risks.map((risk: any, i: number) => (
            <div key={i} className="p-4 bg-orange-50 rounded-xl border border-orange-100">
              <h3 className="font-semibold text-orange-800 mb-2">{risk.region}</h3>
              <p className="text-sm font-medium text-orange-900">{risk.risk}</p>
              <p className="text-sm text-orange-700 mt-1">{risk.impact}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
