"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../lib/i18n";
import Link from "next/link";

type FAQItem = {
  faq_id: string;
  category: string;
  question_en: string;
  question_mm: string;
  answer_en: string;
  answer_mm: string;
  source_title: string;
  source_reference: string;
  last_reviewed_at: string;
};

export default function FAQPage() {
  const { lang, setLang, t } = useLanguage();
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchFaqs() {
      setLoading(true);
      setLoadError(false);
      try {
        const res = await fetch(
          `/api/v1/faq?language=${lang}&search=${encodeURIComponent(search)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`FAQ API returned ${res.status}`);
        const json = await res.json();
        if (controller.signal.aborted) return;
        setFaqs(json.data || []);
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        setFaqs([]);
        setLoadError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    // Add simple debounce
    const timeout = setTimeout(() => {
      fetchFaqs();
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [lang, search]);

  useEffect(() => {
    document.title =
      lang === "en"
        ? "Frequently Asked Questions | Myanmar Agriculture Intelligence"
        : "အမေးများသော မေးခွန်းများ | စိုက်ပျိုးမိတ်ဆွေ";
  }, [lang]);

  return (
    <main className="app-shell bg-gray-50 min-h-screen">
      <header className="topbar bg-white shadow-sm flex items-center justify-between p-4 border-b">
        <div className="brand flex items-center gap-3">
          <span className="brand-mark">{lang === "en" ? "M" : "မ"}</span>
          <div>
            <div className="brand-name font-bold">
              {t.header.title.split("|")[0]?.trim()}
            </div>
            <div className="brand-subtitle text-xs text-gray-500">
              {t.header.title.split("|")[1]?.trim()}
            </div>
          </div>
        </div>
        <div className="topbar-status flex items-center gap-4">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            {t.faq.backToDashboard}
          </Link>
          <button
            onClick={() => {
              setSearch("");
              setLang(lang === "en" ? "my" : "en");
            }}
            className="text-sm border px-3 py-1 rounded-md shadow-sm hover:bg-gray-100"
            aria-label={lang === "en" ? t.dashboard.languageSwitchToMyanmar : t.dashboard.languageSwitchToEnglish}
          >
            {lang === "en" ? "Myanmar" : "English"}
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto py-10 px-4">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-3">{t.faq.title}</h1>
          <p className="text-gray-600">{t.faq.subtitle}</p>
        </div>

        <div className="mb-8">
          <input
            type="search"
            placeholder={t.faq.searchPlaceholder}
            className="w-full p-4 rounded-lg border shadow-sm text-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="faq-list space-y-6">
          {loading ? (
            <div className="text-center py-10 text-gray-400">{t.faq.loading}</div>
          ) : loadError ? (
            <div className="text-center py-10 text-red-700 bg-red-50 rounded-lg border border-red-200" role="alert">
              {t.faq.loadError}
            </div>
          ) : faqs.length === 0 ? (
            <div className="text-center py-10 text-gray-500 bg-white rounded-lg border">{t.faq.noResults}</div>
          ) : (
            faqs.map((faq) => (
              <div key={faq.faq_id} className="bg-white p-6 rounded-lg shadow-sm border">
                <span className="inline-block px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded mb-3">
                  {faq.category === "General" ? t.faq.categoryGeneral : faq.category}
                </span>
                <h3 className="text-xl font-semibold mb-3">
                  {lang === "en" ? faq.question_en : faq.question_mm}
                </h3>
                <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {lang === "en" ? faq.answer_en : faq.answer_mm}
                </div>

                <div className="mt-4 flex flex-col gap-1 border-t pt-4 text-xs text-gray-400 sm:flex-row sm:justify-between">
                  <span>
                    {t.faq.source}: {faq.source_title} · {faq.source_reference}
                  </span>
                  <span>{t.faq.recordTimestamp}: {new Date(faq.last_reviewed_at).toLocaleDateString(lang === "my" ? "my-MM" : "en-US")}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
