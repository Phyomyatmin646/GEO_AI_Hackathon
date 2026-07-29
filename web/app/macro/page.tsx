"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DataStatusCard from "../components/DataStatusCard";
import { useLanguage } from "../lib/i18n";

type LocalizedText = { en: string; my: string };

type MacroStatus = {
  title: LocalizedText;
  subtitle: LocalizedText;
  macroTrade: {
    status: LocalizedText;
    description: LocalizedText;
    withheld: LocalizedText[];
  };
  publicationRule: {
    title: LocalizedText;
    description: LocalizedText;
  };
};

export default function MacroPage() {
  const { lang, setLang, t } = useLanguage();
  const [data, setData] = useState<MacroStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/v1/macro")
      .then((response) => {
        if (!response.ok) throw new Error("Macro status request failed");
        return response.json() as Promise<MacroStatus>;
      })
      .then(setData)
      .catch(() => setError(true));
  }, []);

  const copy = (text: LocalizedText) => text[lang];

  if (!data) {
    return (
      <div className="min-h-screen bg-[#f7f6f2] flex items-center justify-center p-8 text-center text-slate-600">
        {error
          ? (lang === "en" ? "Macro and trade status could not be loaded." : "စီးပွားရေးနှင့် ကုန်သွယ်မှု အခြေအနေကို မတင်နိုင်ပါ။")
          : (lang === "en" ? "Loading macro and trade status…" : "စီးပွားရေးနှင့် ကုန်သွယ်မှု အခြေအနေကို တင်နေသည်…")}
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
            <Link href="/climate" className="rounded bg-emerald-50 px-4 py-2 font-medium text-emerald-800 hover:underline">
              {lang === "en" ? "Climate evidence" : "ရာသီဥတု အထောက်အထား"}
            </Link>
            <Link href="/" className="font-medium text-emerald-700 hover:underline">
              {lang === "en" ? "← Back to map" : "← မြေပုံသို့ ပြန်သွားမည်"}
            </Link>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <DataStatusCard
            title={lang === "en" ? "Macro and trade series" : "စီးပွားရေးနှင့် ကုန်သွယ်မှု အချက်အလက်များ"}
            status={copy(data.macroTrade.status)}
            description={copy(data.macroTrade.description)}
            items={data.macroTrade.withheld.map(copy)}
          />
          <DataStatusCard
            title={copy(data.publicationRule.title)}
            status={lang === "en" ? "Transparency rule" : "ပွင့်လင်းမြင်သာမှု စည်းမျဉ်း"}
            description={copy(data.publicationRule.description)}
          />
        </div>
      </div>
    </main>
  );
}
