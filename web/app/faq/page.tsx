"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../lib/i18n";
import Link from "next/link";
import { HarvestIcon } from "../components/HarvestIcon";

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

  const titleParts =
    lang === "my"
      ? ["အမေးများသော", "မေးခွန်းများ"]
      : ["Frequently Asked", "Questions"];

  return (
    <main className="app-shell faq-page">
      <header className="faq-topbar">
        <div className="faq-brand">
          <span
            aria-label={t.header.title}
            className="harvest-brand-logo faq-brand-logo"
            role="img"
          />
        </div>
        <div className="faq-topbar-actions">
          <Link href="/" className="faq-dashboard-link">
            {t.faq.backToDashboard}
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M10 17l5-5-5-5M15 12H3" />
              <path d="M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />
            </svg>
          </Link>
          <button
            onClick={() => {
              setSearch("");
              setLang(lang === "en" ? "my" : "en");
            }}
            className="faq-language-switch"
            aria-label={lang === "en" ? t.dashboard.languageSwitchToMyanmar : t.dashboard.languageSwitchToEnglish}
          >
            <HarvestIcon name="globe" size={20} />
            {lang === "en" ? "Myanmar" : "English"}
            <HarvestIcon name="chevron" size={17} />
          </button>
        </div>
      </header>

      <section className="faq-content">
        <div className="faq-intro">
          <h1>
            <span>{titleParts[0]}</span>{" "}
            <strong>{titleParts[1]}</strong>
          </h1>
          <p>{t.faq.subtitle}</p>
        </div>

        <div className="faq-search">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            type="search"
            placeholder={t.faq.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="faq-list">
          {loading ? (
            <div className="faq-state">{t.faq.loading}</div>
          ) : loadError ? (
            <div className="faq-state faq-state-error" role="alert">
              {t.faq.loadError}
            </div>
          ) : faqs.length === 0 ? (
            <div className="faq-state">{t.faq.noResults}</div>
          ) : (
            faqs.map((faq) => (
              <article key={faq.faq_id} className="faq-card">
                <span className="faq-category">
                  {faq.category === "General" ? t.faq.categoryGeneral : faq.category}
                </span>
                <h2>
                  {lang === "en" ? faq.question_en : faq.question_mm}
                </h2>
                <div className="faq-answer">
                  {lang === "en" ? faq.answer_en : faq.answer_mm}
                </div>

                <footer className="faq-card-footer">
                  <span>
                    {t.faq.source}: {faq.source_title} · {faq.source_reference}
                  </span>
                  <span>{t.faq.recordTimestamp}: {new Date(faq.last_reviewed_at).toLocaleDateString(lang === "my" ? "my-MM" : "en-US")}</span>
                </footer>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
