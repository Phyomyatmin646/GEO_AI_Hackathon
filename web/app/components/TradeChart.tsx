"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from "recharts";

export default function TradeChart({ tradeData, t }: { tradeData: any, t: any }) {
  if (!tradeData || !t) return null;

  return (
    <div className="flex flex-col gap-8">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100/50">
        <h2 className="text-xl font-semibold mb-4 text-slate-700">{t.detailedExports}</h2>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tradeData.exports} margin={{ top: 10, right: 30, left: 0, bottom: 0 }} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0"/>
              <XAxis type="number" tickFormatter={(val) => `$${val}M`} />
              <YAxis type="category" dataKey="category" width={150} />
              <Tooltip formatter={(val: number) => [`$${val} Million`, t.exportValue]} />
              <Legend />
              <Bar dataKey="value_usd_million" fill="#14b8a6" name={t.totalExports} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100/50">
        <h2 className="text-xl font-semibold mb-4 text-slate-700">{t.historicalTradeTrend}</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={tradeData.historical_trend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorExpTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorImpTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
              <XAxis dataKey="year" />
              <YAxis tickFormatter={(val) => `$${val}M`} />
              <Tooltip formatter={(val: number) => [`$${val} Million`, ""]} />
              <Legend />
              <Area type="monotone" dataKey="export_total" stroke="#10b981" fillOpacity={1} fill="url(#colorExpTrend)" name={t.totalExports} />
              <Area type="monotone" dataKey="import_total" stroke="#f43f5e" fillOpacity={1} fill="url(#colorImpTrend)" name={t.totalImports} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
