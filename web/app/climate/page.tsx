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
import { HarvestIcon } from "../components/HarvestIcon";
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
      dashboard: "Dashboard",
      country: "မြန်မာ",
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
      dashboard: "Dashboard",
      country: "Myanmar",
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
      <div className="chart-page-state chart-page-state--climate">
        <span className="chart-page-state__mark" aria-hidden="true" />
        <p>{error ? copy.loadError : copy.loading}</p>
      </div>
    );
  }

  const chirps = data.sources.find((source) => source.id === "chirps-v3");
  const era5 = data.sources.find((source) => source.id === "era5-land");
  const coverage = `${data.scope.completeYears[0]}–${data.scope.completeYears[1]}`;

  return (
    <main className="chart-page chart-page--climate">
      <header className="chart-topbar">
        <Link href="/" className="chart-brand" aria-label={t.header.title}>
          <span className="harvest-brand-logo chart-brand__logo" role="img" />
        </Link>
        <nav className="chart-topbar__nav" aria-label="Page navigation">
          <button
            type="button"
            className="chart-language"
            onClick={() => setLang(lang === "en" ? "my" : "en")}
            aria-label={lang === "en" ? t.dashboard.languageSwitchToMyanmar : t.dashboard.languageSwitchToEnglish}
          >
            <HarvestIcon name="globe" size={18} />
            <span>{lang === "en" ? "English" : "မြန်မာ"}</span>
            <HarvestIcon name="chevron" size={17} />
          </button>
          <Link href="/" className="chart-topbar__link">{copy.dashboard}</Link>
          <Link href="/" className="chart-topbar__link">{copy.back}</Link>
        </nav>
      </header>

      <div className="chart-page__canvas">
        <header className="chart-hero">
          <p className="chart-hero__eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p className="chart-hero__subtitle">{copy.subtitle}</p>
          <nav className="chart-hero__actions" aria-label="Evidence navigation">
            <span className="chart-tab chart-tab--active">{copy.country}</span>
            <Link href="/macro" className="chart-tab">{copy.macro}</Link>
            <Link href="/" className="chart-back-link">{copy.back}</Link>
          </nav>
        </header>

        <section className="chart-evidence-banner chart-evidence-banner--scope">
          <span className="chart-evidence-banner__badge">{copy.badge}</span>
          <div>
            <strong>{copy.scope}</strong>
            <p>{copy.scopeText}</p>
          </div>
        </section>

        <div className="chart-grid">
          <section className="chart-card">
            <h2>{copy.rainfall}</h2>
            <div className="chart-card__plot">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.values}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="officialRainfallFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#15945f" stopOpacity={0.24} />
                      <stop offset="95%" stopColor="#15945f" stopOpacity={0.015} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#dfe5e2" />
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
                    stroke="#15945f"
                    strokeWidth={3}
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

          <section className="chart-card">
            <h2>{copy.temperature}</h2>
            <div className="chart-card__plot">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.values}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e3e5e9" />
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
                    stroke="#e79c00"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "#e79c00" }}
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
          <section className="chart-card chart-card--wide">
            <h2>{copy.soilMoisture}</h2>
            <div className="chart-card__plot chart-card__plot--wide">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.values}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#dfe5e2" />
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
                    stroke="#15945f"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "#15945f" }}
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
        </div>

        <section className="chart-qa-card">
          <div className="chart-qa-card__heading">
            <span><HarvestIcon name="dataset" size={20} /></span>
            <h2>{copy.qaTitle}</h2>
          </div>
          <div className="chart-qa-card__metrics">
            <div>
              <strong>{data.qa.rowCount.toLocaleString()}</strong>
              <span>{copy.qaRows}</span>
            </div>
            <div>
              <strong className="is-success">{data.qa.errorCount}</strong>
              <span>{copy.qaErrors}</span>
            </div>
            <div>
              <strong className="is-warning">{data.qa.warningCount}</strong>
              <span>{copy.qaWarnings}</span>
            </div>
          </div>
          <p className="chart-qa-card__hash">CSV SHA-256: {data.qa.sourceCsvSha256}</p>
        </section>
      </div>
    </main>
  );
}
