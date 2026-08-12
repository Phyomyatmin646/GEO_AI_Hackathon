"use client";

import { useEffect, useState, useMemo } from "react";
import { useLanguage } from "../lib/i18n";
import Link from "next/link";
import { HarvestIcon } from "../components/HarvestIcon";
import { SiteNavigation } from "../components/SiteNavigation";

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

const ITEMS_PER_PAGE = 10;

export default function FAQPage() {
  const { lang, setLang, t } = useLanguage();
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

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

  const totalPages = Math.ceil(faqs.length / ITEMS_PER_PAGE);

  const pagedFaqs = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return faqs.slice(start, start + ITEMS_PER_PAGE);
  }, [faqs, currentPage]);

  // Build visible page numbers (show up to 5 page buttons around current)
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "...")[] = [];
    const delta = 2;
    const left = Math.max(2, currentPage - delta);
    const right = Math.min(totalPages - 1, currentPage + delta);
    pages.push(1);
    if (left > 2) pages.push("...");
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push("...");
    pages.push(totalPages);
    return pages;
  }, [currentPage, totalPages]);

  const titleParts =
    lang === "my"
      ? ["အမေးများသော", "မေးခွန်းများ"]
      : ["Frequently Asked", "Questions"];

  return (
    <main className="app-shell faq-page">
      <header className="faq-topbar">
        <Link href="/" className="faq-brand" aria-label={lang === "my" ? "ပင်မစာမျက်နှာသို့" : "Go to home"}>
          <span
            aria-label={t.header.title}
            className="harvest-brand-logo faq-brand-logo"
            role="img"
          />
        </Link>
        <div className="faq-topbar-actions">
          <button
            onClick={() => {
              setSearch("");
              setCurrentPage(1);
              setLang(lang === "en" ? "my" : "en");
            }}
            className="faq-language-switch"
            aria-label={lang === "en" ? t.dashboard.languageSwitchToMyanmar : t.dashboard.languageSwitchToEnglish}
          >
            <HarvestIcon name="globe" size={20} />
            {lang === "en" ? "Myanmar" : "English"}
          </button>
          <SiteNavigation />
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
            aria-label={t.faq.searchPlaceholder}
            placeholder={t.faq.searchPlaceholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
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
            pagedFaqs.map((faq) => (
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

        {!loading && !loadError && totalPages > 1 && (
          <nav
            className="faq-pagination"
            aria-label={lang === "my" ? "စာမျက်နှာရွေးချယ်ရန်" : "Pagination"}
          >
            <span className="faq-pagination-info">
              {lang === "my"
                ? `${faqs.length} ခု | စာမျက်နှာ ${currentPage} / ${totalPages}`
                : `${faqs.length} results · Page ${currentPage} of ${totalPages}`}
            </span>
            <div className="faq-pagination-controls">
              <button
                className="faq-page-btn faq-page-arrow"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                aria-label={lang === "my" ? "ယခင်စာမျက်နှာ" : "Previous page"}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>

              {pageNumbers.map((pg, idx) =>
                pg === "..." ? (
                  <span key={`ellipsis-${idx}`} className="faq-page-ellipsis">…</span>
                ) : (
                  <button
                    key={pg}
                    className={`faq-page-btn${currentPage === pg ? " faq-page-active" : ""}`}
                    onClick={() => setCurrentPage(pg as number)}
                    aria-current={currentPage === pg ? "page" : undefined}
                    aria-label={
                      lang === "my"
                        ? `စာမျက်နှာ ${pg} သို့ သွားရန်`
                        : `Go to page ${pg}`
                    }
                  >
                    {pg}
                  </button>
                )
              )}

              <button
                className="faq-page-btn faq-page-arrow"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                aria-label={lang === "my" ? "နောက်စာမျက်နှာ" : "Next page"}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>
          </nav>
        )}
      </section>
    </main>
  );
}
