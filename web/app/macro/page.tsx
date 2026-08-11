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
import { HarvestIcon } from "../components/HarvestIcon";
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
      dashboard: "Dashboard",
      country: "မြန်မာ",
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
      dashboard: "Dashboard",
      country: "Myanmar",
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
      <div className="chart-page-state">
        <span className="chart-page-state__mark" aria-hidden="true" />
        <p>{error ? copy.loadError : copy.loading}</p>
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
    <main className="chart-page chart-page--macro">
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
            <Link href="/climate" className="chart-tab">{copy.climate}</Link>
            <Link href="/" className="chart-back-link">{copy.back}</Link>
          </nav>
        </header>

        <section className="chart-evidence-banner">
          <span className="chart-evidence-banner__badge">
            <HarvestIcon name="info" size={18} />
            {copy.badge}
          </span>
          <p>
            {copy.refreshed}: <strong>{retrievedDate}</strong> <span aria-hidden="true">·</span> {copy.noForecast}
          </p>
        </section>

        <div className="chart-grid">
          <section className="chart-card">
            <h2>{copy.gdp}</h2>
            <div className="chart-card__plot">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={gdp.values} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="officialGdpFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e79c00" stopOpacity={0.24} />
                      <stop offset="95%" stopColor="#e79c00" stopOpacity={0.015} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e3e5e9" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(value) => billions(Number(value))} />
                  <Tooltip formatter={(value) => [billions(Number(value)), copy.gdpLegend]} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#e79c00"
                    strokeWidth={3}
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

          <section className="chart-card">
            <h2>{copy.agricultureShare}</h2>
            <div className="chart-card__plot">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={agriculture.values} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e3e5e9" />
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
                    stroke="#e79c00"
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

          <section className="chart-card chart-card--wide">
            <h2>{copy.trade}</h2>
            <div className="chart-card__plot chart-card__plot--wide">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tradeValues} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e3e5e9" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(value) => billions(Number(value))} />
                  <Tooltip
                    formatter={(value, name) => [billions(Number(value)), name]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="exports"
                    stroke="#e79c00"
                    strokeWidth={3}
                    dot={false}
                    name={copy.exports}
                  />
                  <Line
                    type="monotone"
                    dataKey="imports"
                    stroke="#8f7840"
                    strokeWidth={3}
                    dot={false}
                    name={copy.imports}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-source-pair">
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

          <section className="chart-card chart-card--wide">
            <h2>{copy.cereal}</h2>
            <div className="chart-card__plot chart-card__plot--wide">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cereal.values} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e3e5e9" />
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
                    fill="#e7b30d"
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
