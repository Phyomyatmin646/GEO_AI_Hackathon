"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DataStatusCard from "../components/DataStatusCard";
import { useLanguage } from "../lib/i18n";

type LocalizedText = { en: string; my: string };

type ClimateStatus = {
  title: LocalizedText;
  subtitle: LocalizedText;
  weatherEvidence: {
    status: LocalizedText;
    description: LocalizedText;
    sources: LocalizedText[];
  };
  climateChange: {
    status: LocalizedText;
    description: LocalizedText;
    withheld: LocalizedText[];
  };
  disasterHistory: {
    status: LocalizedText;
    description: LocalizedText;
  };
};

export default function ClimatePage() {
  const { lang, setLang, t } = useLanguage();
  const [data, setData] = useState<ClimateStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/v1/climate")
      .then((response) => {
        if (!response.ok) throw new Error("Climate status request failed");
        return response.json() as Promise<ClimateStatus>;
      })
      .then(setData)
      .catch(() => setError(true));
  }, []);

  const copy = (text: LocalizedText) => text[lang];

  if (!data) {
    return (
      <div className="min-h-screen bg-[#f7f6f2] flex items-center justify-center p-8 text-center text-slate-600">
        {error
          ? (lang === "en" ? "Climate evidence status could not be loaded." : "ရာသီဥတု အထောက်အထား အခြေအနေကို မတင်နိုင်ပါ။")
          : (lang === "en" ? "Loading climate evidence status…" : "ရာသီဥတု အထောက်အထား အခြေအနေကို တင်နေသည်…")}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f6f2] p-8 font-sans text-slate-800">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-emerald-900">{copy(data.title)}</h1>
            <p className="mt-2 max-w-3xl text-slate-600">{copy(data.subtitle)}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLang(lang === "en" ? "my" : "en")}
              className="rounded bg-emerald-800 px-4 py-2 text-white shadow transition hover:bg-emerald-700"
              aria-label={lang === "en" ? t.dashboard.languageSwitchToMyanmar : t.dashboard.languageSwitchToEnglish}
            >
              {lang === "en" ? "မြန်မာ" : "English"}
            </button>
            <Link href="/macro" className="rounded bg-emerald-50 px-4 py-2 font-medium text-emerald-800 hover:underline">
              {lang === "en" ? "Macro & trade" : "စီးပွားရေးနှင့် ကုန်သွယ်မှု"}
            </Link>
            <Link href="/" className="font-medium text-emerald-700 hover:underline">
              {lang === "en" ? "← Back to map" : "← မြေပုံသို့ ပြန်သွားမည်"}
            </Link>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <DataStatusCard
            title={lang === "en" ? "Regional weather evidence" : "ဒေသအလိုက် ရာသီဥတု အထောက်အထား"}
            status={copy(data.weatherEvidence.status)}
            description={copy(data.weatherEvidence.description)}
            items={data.weatherEvidence.sources.map(copy)}
            tone="available"
          />
          <DataStatusCard
            title={lang === "en" ? "Climate-change analysis" : "ရာသီဥတုပြောင်းလဲမှု ခွဲခြမ်းစိတ်ဖြာချက်"}
            status={copy(data.climateChange.status)}
            description={copy(data.climateChange.description)}
            items={data.climateChange.withheld.map(copy)}
          />
        </div>

        <div className="mt-6">
          <DataStatusCard
            title={lang === "en" ? "Disaster history" : "သဘာဝဘေး ဖြစ်ရပ်မှတ်တမ်း"}
            status={copy(data.disasterHistory.status)}
            description={copy(data.disasterHistory.description)}
          />
        </div>
      </div>
    </main>
  );
}
