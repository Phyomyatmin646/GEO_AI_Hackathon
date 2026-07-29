"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DataSourceNote from "../components/DataSourceNote";
import { useLanguage } from "../lib/i18n";

type ClimateSource = {
  id: string;
  organization: string;
  dataset: string;
  indicator: string;
  unit: string;
  nativeResolution: string;
  temporalCoverage: string;
  citationUrl: string;
};

type ClimateSnapshot = {
  dataContract: string;
  generatedAt: string;
  scope: {
    country: string;
    region: string;
    grid: string;
    aggregation: string;
    completeYears: [number, number];
  };
  qa: {
    valid: boolean;
    rowCount: number;
    warningCount: number;
    errorCount: number;
    qaReportSha256: string;
    sourceManifestSha256: string;
    sourceCsvSha256: string;
  };
  sources: ClimateSource[];
  values: Array<{
    year: number;
    annual_rainfall_mm: number;
    mean_temperature_c: number;
    mean_soil_moisture_m3_m3: number | null;
    months: number;
    grid_cell_observations: number;
  }>;
};

export default function ClimatePage() {
  const { lang, setLang, t } = useLanguage();
  const [data, setData] = useState<ClimateSnapshot | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/v1/climate")
      .then((response) => {
        if (!response.ok) throw new Error("Climate request failed");
        return response.json() as Promise<ClimateSnapshot>;
      })
      .then(setData)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    document.title =
      lang === "en"
        ? "Climate Evidence | Myanmar Agriculture Intelligence"
        : "ရာသီဥတုအထောက်အထား | စိုက်ပျိုးမိတ်ဆွေ";
  }, [lang]);

  const copy = lang === "my"
    ? {
      eyebrow: "စိုက်ပျိုးမိတ်ဆွေ · Real climate evidence",
      title: "ဧရာဝတီဒေသ ရာသီဥတုအထောက်အထား",
      subtitle: "QA စစ်ပြီးသော 5 km grid data မှ နှစ်အလိုက် မိုးရေချိန်၊ အပူချိန်နှင့် မြေဆီလွှာအစိုဓာတ်",
      macro: "စီးပွားရေးနှင့် စိုက်ပျိုးရေး",
      back: "← မြေပုံသို့ ပြန်သွားမည်",
      badge: "QA စစ်ပြီး real data",
      scope: "လွှမ်းခြုံမှု",
      scopeText: "ဧရာဝတီ · 5 km equal-area grid · 2019–2025 ပြည့်စုံသောနှစ်များ",
      rainfall: "နှစ်စဉ်ပျမ်းမျှ မိုးရေချိန်",
      rainfallLegend: "မိုးရေချိန်",
      temperature: "နှစ်စဉ်ပျမ်းမျှ အပူချိန်",
      temperatureLegend: "အပူချိန်",
      soilMoisture: "နှစ်စဉ်ပျမ်းမျှ မြေဆီလွှာအစိုဓာတ်",
      soilMoistureLegend: "မြေဆီလွှာအစိုဓာတ်",
      method: "တွက်ချက်နည်း",
      qaTitle: "Data QA နှင့် provenance",
      qaRows: "source rows",
      qaErrors: "QA errors",
      qaWarnings: "QA warnings",
      loading: "Official climate data တင်နေသည်…",
      loadError: "Climate data ကို မတင်နိုင်ပါ။",
    }
    : {
      eyebrow: "Agriculture Companion · Real climate evidence",
      title: "Ayeyawaddy climate evidence",
      subtitle: "Annual rainfall, temperature, and soil moisture aggregated from QA-passed 5 km grid observations",
      macro: "Economy & agriculture",
      back: "← Back to map",
      badge: "QA-passed real data",
      scope: "Coverage",
      scopeText: "Ayeyawaddy · 5 km equal-area grid · complete years 2019–2025",
      rainfall: "Annual mean-area rainfall",
      rainfallLegend: "Rainfall",
      temperature: "Annual mean temperature",
      temperatureLegend: "Temperature",
      soilMoisture: "Annual mean soil moisture",
      soilMoistureLegend: "Soil moisture",
      method: "Method",
      qaTitle: "Data QA and provenance",
      qaRows: "source rows",
      qaErrors: "QA errors",
      qaWarnings: "QA warnings",
      loading: "Loading official climate data…",
      loadError: "Climate data could not be loaded.",
    };

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f6f2] p-8 text-center text-slate-600">
        {error ? copy.loadError : copy.loading}
      </div>
    );
  }

  const chirps = data.sources.find((source) => source.id === "chirps-v3");
  const era5 = data.sources.find((source) => source.id === "era5-land");
  const coverage = `${data.scope.completeYears[0]}–${data.scope.completeYears[1]}`;

  return (
    <main className="min-h-screen bg-[#f7f6f2] p-4 font-sans text-slate-800 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">
              {copy.eyebrow}
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-emerald-950 sm:text-4xl">
              {copy.title}
            </h1>
            <p className="mt-2 max-w-3xl text-slate-600">{copy.subtitle}</p>
          </div>
          <nav className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setLang(lang === "en" ? "my" : "en")}
              className="rounded bg-emerald-800 px-4 py-2 text-white shadow transition hover:bg-emerald-700"
              aria-label={lang === "en" ? t.dashboard.languageSwitchToMyanmar : t.dashboard.languageSwitchToEnglish}
            >
              {lang === "en" ? "Myanmar" : "English"}
            </button>
            <Link
              href="/macro"
              className="rounded bg-emerald-50 px-4 py-2 font-medium text-emerald-800 hover:underline"
            >
              {copy.macro}
            </Link>
            <Link href="/" className="font-medium text-emerald-700 hover:underline">
              {copy.back}
            </Link>
          </nav>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-[auto_1fr]">
          <div className="inline-flex h-fit items-center rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white">
            {copy.badge}
          </div>
          <div className="rounded-xl border border-emerald-100 bg-white px-5 py-4 shadow-sm">
            <p className="font-semibold text-slate-800">{copy.scope}</p>
            <p className="mt-1 text-sm text-slate-600">{copy.scopeText}</p>
          </div>
        </section>

        <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <section className="rounded-2xl border border-emerald-100/70 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-slate-800">{copy.rainfall}</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.values}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="officialRainfallFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(value) => `${Number(value).toLocaleString()} mm`} />
                  <Tooltip
                    formatter={(value) => [
                      `${Number(value).toLocaleString()} mm/year`,
                      copy.rainfallLegend,
                    ]}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="annual_rainfall_mm"
                    stroke="#0284c7"
                    strokeWidth={2}
                    fill="url(#officialRainfallFill)"
                    name={copy.rainfallLegend}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {chirps && (
              <DataSourceNote
                organization={chirps.organization}
                dataset={chirps.dataset}
                indicator={chirps.indicator}
                years={coverage}
                unit={chirps.unit}
                citationUrl={chirps.citationUrl}
                detail={`${chirps.nativeResolution}. ${data.scope.aggregation}`}
                language={lang}
              />
            )}
          </section>

          <section className="rounded-2xl border border-emerald-100/70 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-slate-800">{copy.temperature}</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.values}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="year" />
                  <YAxis domain={["dataMin - 0.5", "dataMax + 0.5"]} tickFormatter={(value) => `${value}°C`} />
                  <Tooltip
                    formatter={(value) => [
                      `${Number(value).toFixed(2)}°C`,
                      copy.temperatureLegend,
                    ]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="mean_temperature_c"
                    stroke="#e11d48"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "#e11d48" }}
                    name={copy.temperatureLegend}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {era5 && (
              <DataSourceNote
                organization={era5.organization}
                dataset={era5.dataset}
                indicator="Mean 2 m air temperature"
                years={coverage}
                unit="°C"
                citationUrl={era5.citationUrl}
                detail={`${era5.nativeResolution}. ${data.scope.aggregation}`}
                language={lang}
              />
            )}
          </section>
        </div>

        <section className="mb-8 rounded-2xl border border-emerald-100/70 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-slate-800">{copy.soilMoisture}</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.values}
                margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="year" />
                <YAxis domain={["dataMin - 0.02", "dataMax + 0.02"]} />
                <Tooltip
                  formatter={(value) => [
                    `${Number(value).toFixed(4)} m³/m³`,
                    copy.soilMoistureLegend,
                  ]}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="mean_soil_moisture_m3_m3"
                  stroke="#7c3aed"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "#7c3aed" }}
                  name={copy.soilMoistureLegend}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {era5 && (
            <DataSourceNote
              organization={era5.organization}
              dataset={era5.dataset}
              indicator="Volumetric soil water layer 1"
              years={coverage}
              unit="m³/m³"
              citationUrl={era5.citationUrl}
              detail={`${era5.nativeResolution}. ${data.scope.aggregation}`}
              language={lang}
            />
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-900 p-6 text-slate-100 shadow-sm">
          <h2 className="text-xl font-semibold">{copy.qaTitle}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-2xl font-bold">{data.qa.rowCount.toLocaleString()}</p>
              <p className="text-sm text-slate-400">{copy.qaRows}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-400">{data.qa.errorCount}</p>
              <p className="text-sm text-slate-400">{copy.qaErrors}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-300">{data.qa.warningCount}</p>
              <p className="text-sm text-slate-400">{copy.qaWarnings}</p>
            </div>
          </div>
          <p className="mt-5 break-all font-mono text-[11px] text-slate-400">
            CSV SHA-256: {data.qa.sourceCsvSha256}
          </p>
        </section>
      </div>
    </main>
  );
}
