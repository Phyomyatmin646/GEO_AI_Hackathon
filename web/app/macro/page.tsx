"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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

type IndicatorValue = {
  year: number;
  value: number;
  observationStatus: string;
  footnote: string;
};

type Indicator = {
  code: string;
  name: string;
  sourceName: string;
  sourceUrl: string;
  apiUrl: string;
  lastUpdated: string | null;
  unit: string;
  values: IndicatorValue[];
};

type MacroSnapshot = {
  dataContract: string;
  verificationStatus: string;
  country: {
    iso3: string;
    name: string;
  };
  source: {
    organization: string;
    database: string;
    apiDocumentation: string;
    retrievedAt: string;
  };
  indicators: {
    gdp_current_usd: Indicator;
    agriculture_value_added_pct_gdp: Indicator;
    merchandise_exports_current_usd: Indicator;
    merchandise_imports_current_usd: Indicator;
    cereal_production_tonnes: Indicator;
  };
};

function coverage(indicator: Indicator) {
  const first = indicator.values[0]?.year;
  const last = indicator.values.at(-1)?.year;
  return first && last ? `${first}–${last}` : "Not available";
}

function billions(value: number) {
  return `$${(value / 1_000_000_000).toFixed(1)}B`;
}

export default function MacroPage() {
  const { lang, setLang, t } = useLanguage();
  const [data, setData] = useState<MacroSnapshot | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/v1/macro")
      .then((response) => {
        if (!response.ok) throw new Error("Macro request failed");
        return response.json() as Promise<MacroSnapshot>;
      })
      .then(setData)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    document.title =
      lang === "en"
        ? "Economy and Agriculture | Myanmar Agriculture Intelligence"
        : "စီးပွားရေးနှင့် စိုက်ပျိုးရေး | စိုက်ပျိုးမိတ်ဆွေ";
  }, [lang]);

  const copy = lang === "my"
    ? {
      eyebrow: "စိုက်ပျိုးမိတ်ဆွေ · Official statistics",
      title: "မြန်မာ စီးပွားရေးနှင့် စိုက်ပျိုးရေးအညွှန်းများ",
      subtitle: "World Bank WDI မှ official-source records များသာဖြစ်ပြီး AI forecast သို့မဟုတ် demo value မပါဝင်ပါ",
      climate: "ရာသီဥတုအထောက်အထား",
      back: "← မြေပုံသို့ ပြန်သွားမည်",
      badge: "Official-source records",
      refreshed: "Snapshot ရယူသည့်ရက်",
      gdp: "GDP (လက်ရှိ US$)",
      gdpLegend: "GDP",
      agricultureShare: "စိုက်ပျိုးရေး၊ သစ်တောနှင့် ငါးလုပ်ငန်း၏ GDP ပါဝင်မှု",
      agricultureLegend: "GDP ပါဝင်မှု",
      trade: "ကုန်ပစ္စည်း ပို့ကုန်နှင့် သွင်းကုန်",
      exports: "ပို့ကုန်",
      imports: "သွင်းကုန်",
      cereal: "သီးနှံအုပ်စု ထုတ်လုပ်မှုပမာဏ",
      cerealLegend: "Cereal production",
      noForecast: "Graph အားလုံးသည် source တွင်ဖော်ပြထားသောနှစ်များသာဖြစ်ပြီး အနာဂတ် forecast မဆွဲထားပါ။",
      loading: "Official economic data တင်နေသည်…",
      loadError: "Official economic data ကို မတင်နိုင်ပါ။",
    }
    : {
      eyebrow: "Agriculture Companion · Official statistics",
      title: "Myanmar economy and agriculture indicators",
      subtitle: "Official-source records from World Development Indicators; no AI forecasts or demo values",
      climate: "Climate evidence",
      back: "← Back to map",
      badge: "Official-source records",
      refreshed: "Snapshot retrieved",
      gdp: "GDP (current US$)",
      gdpLegend: "GDP",
      agricultureShare: "Agriculture, forestry and fishing value added",
      agricultureLegend: "Share of GDP",
      trade: "Merchandise exports and imports",
      exports: "Exports",
      imports: "Imports",
      cereal: "Cereal production",
      cerealLegend: "Cereal production",
      noForecast: "Every chart stops at the latest year supplied by its source; no future forecast is drawn.",
      loading: "Loading official economic data…",
      loadError: "Official economic data could not be loaded.",
    };

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f6f2] p-8 text-center text-slate-600">
        {error ? copy.loadError : copy.loading}
      </div>
    );
  }

  const {
    gdp_current_usd: gdp,
    agriculture_value_added_pct_gdp: agriculture,
    merchandise_exports_current_usd: exports,
    merchandise_imports_current_usd: imports,
    cereal_production_tonnes: cereal,
  } = data.indicators;

  const tradeByYear = new Map<number, { year: number; exports?: number; imports?: number }>();
  for (const row of exports.values) {
    tradeByYear.set(row.year, { year: row.year, exports: row.value });
  }
  for (const row of imports.values) {
    const existing = tradeByYear.get(row.year) ?? { year: row.year };
    tradeByYear.set(row.year, { ...existing, imports: row.value });
  }
  const tradeValues = [...tradeByYear.values()].sort((a, b) => a.year - b.year);
  const retrievedDate = data.source.retrievedAt.slice(0, 10);

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
              href="/climate"
              className="rounded bg-emerald-50 px-4 py-2 font-medium text-emerald-800 hover:underline"
            >
              {copy.climate}
            </Link>
            <Link href="/" className="font-medium text-emerald-700 hover:underline">
              {copy.back}
            </Link>
          </nav>
        </header>

        <section className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-white px-5 py-4 shadow-sm">
          <span className="inline-flex items-center rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white">
            {copy.badge}
          </span>
          <p className="text-sm text-slate-600">
            {copy.refreshed}: <strong>{retrievedDate}</strong> · {copy.noForecast}
          </p>
        </section>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <section className="rounded-2xl border border-emerald-100/70 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-slate-800">{copy.gdp}</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={gdp.values} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="officialGdpFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(value) => billions(Number(value))} />
                  <Tooltip formatter={(value) => [billions(Number(value)), copy.gdpLegend]} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#047857"
                    strokeWidth={2}
                    fill="url(#officialGdpFill)"
                    name={copy.gdpLegend}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <DataSourceNote
              organization={data.source.organization}
              dataset={gdp.sourceName}
              indicator={`${gdp.name} (${gdp.code})`}
              years={coverage(gdp)}
              unit={gdp.unit}
              citationUrl={gdp.sourceUrl}
              updated={gdp.lastUpdated}
              language={lang}
            />
          </section>

          <section className="rounded-2xl border border-emerald-100/70 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-slate-800">{copy.agricultureShare}</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={agriculture.values} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(value) => `${Number(value).toFixed(0)}%`} />
                  <Tooltip
                    formatter={(value) => [
                      `${Number(value).toFixed(2)}%`,
                      copy.agricultureLegend,
                    ]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#d97706"
                    strokeWidth={3}
                    dot={false}
                    name={copy.agricultureLegend}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <DataSourceNote
              organization={data.source.organization}
              dataset={agriculture.sourceName}
              indicator={`${agriculture.name} (${agriculture.code})`}
              years={coverage(agriculture)}
              unit={agriculture.unit}
              citationUrl={agriculture.sourceUrl}
              updated={agriculture.lastUpdated}
              language={lang}
            />
          </section>

          <section className="rounded-2xl border border-emerald-100/70 bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="mb-4 text-xl font-semibold text-slate-800">{copy.trade}</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tradeValues} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(value) => billions(Number(value))} />
                  <Tooltip
                    formatter={(value, name) => [billions(Number(value)), name]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="exports"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={false}
                    name={copy.exports}
                  />
                  <Line
                    type="monotone"
                    dataKey="imports"
                    stroke="#e11d48"
                    strokeWidth={3}
                    dot={false}
                    name={copy.imports}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <DataSourceNote
                organization="World Trade Organization via World Bank WDI"
                dataset={exports.sourceName}
                indicator={`${exports.name} (${exports.code})`}
                years={coverage(exports)}
                unit={exports.unit}
                citationUrl={exports.sourceUrl}
                updated={exports.lastUpdated}
                language={lang}
              />
              <DataSourceNote
                organization="World Trade Organization via World Bank WDI"
                dataset={imports.sourceName}
                indicator={`${imports.name} (${imports.code})`}
                years={coverage(imports)}
                unit={imports.unit}
                citationUrl={imports.sourceUrl}
                updated={imports.lastUpdated}
                language={lang}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-100/70 bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="mb-4 text-xl font-semibold text-slate-800">{copy.cereal}</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cereal.values} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="year" />
                  <YAxis
                    tickFormatter={(value) => `${(Number(value) / 1_000_000).toFixed(1)}M t`}
                  />
                  <Tooltip
                    formatter={(value) => [
                      `${Number(value).toLocaleString()} metric tons`,
                      copy.cerealLegend,
                    ]}
                  />
                  <Legend />
                  <Bar
                    dataKey="value"
                    fill="#65a30d"
                    name={copy.cerealLegend}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <DataSourceNote
              organization="FAO via World Bank WDI"
              dataset={cereal.sourceName}
              indicator={`${cereal.name} (${cereal.code})`}
              years={coverage(cereal)}
              unit={cereal.unit}
              citationUrl={cereal.sourceUrl}
              updated={cereal.lastUpdated}
              detail="FAO production records distributed through World Development Indicators."
              language={lang}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
