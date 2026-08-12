"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLanguage } from "../lib/i18n";
import { HarvestIcon } from "../components/HarvestIcon";
import { SiteNavigation } from "../components/SiteNavigation";
import {
  formatMarketDate,
  formatMarketNumber,
  localizeMarketValue,
} from "../lib/market-localization";

type CommodityPrice = {
  id: string;
  name: string;
  location: string | null;
  marketplace: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  currency: string | null;
  quantity: number | null;
  unit: string | null;
  priceDate: string | null;
  source: string | null;
};

type MarketPayload = {
  label: string;
  recordedAt: string;
  commodities: CommodityPrice[];
};

const PAGE_SIZE = 20;

export function MarketPagination({
  current,
  count,
  onSelect,
}: {
  current: number;
  count: number;
  onSelect: (page: number) => void;
}) {
  const window = (() => {
    if (count <= 7) return Array.from({ length: count }, (_, i) => i);
    const out: (number | "…")[] = [0];
    const start = Math.max(1, current - 1);
    const end = Math.min(count - 2, current + 1);
    if (start > 1) out.push("…");
    for (let p = start; p <= end; p += 1) out.push(p);
    if (end < count - 2) out.push("…");
    out.push(count - 1);
    return out;
  })();

  return (
    <nav className="market-pagination" aria-label="pagination">
      <button
        type="button"
        className="market-page-btn market-page-btn--nav"
        onClick={() => onSelect(current - 1)}
        disabled={current === 0}
        aria-label="Previous page"
      >
        ‹
      </button>
      {window.map((entry, index) =>
        entry === "…" ? (
          <span key={`ellipsis-${index}`} className="market-page-ellipsis">…</span>
        ) : (
          <button
            key={entry}
            type="button"
            className={`market-page-btn ${entry === current ? "market-page-btn--active" : ""}`}
            onClick={() => onSelect(entry)}
            aria-current={entry === current ? "page" : undefined}
          >
            {entry + 1}
          </button>
        ),
      )}
      <button
        type="button"
        className="market-page-btn market-page-btn--nav"
        onClick={() => onSelect(current + 1)}
        disabled={current === count - 1}
        aria-label="Next page"
      >
        ›
      </button>
    </nav>
  );
}

export default function MarketPage() {
  const { lang, setLang, t } = useLanguage();
  const [data, setData] = useState<MarketPayload | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetch("/api/v1/market")
      .then((res) => {
        if (!res.ok) throw new Error("market fetch failed");
        return res.json() as Promise<MarketPayload>;
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    document.title =
      lang === "en"
        ? "Agricultural Market Prices | Myanmar Agriculture Intelligence"
        : "စိုက်ပျိုးရေး ဈေးနှုန်းများ | စိုက်ပျိုးမိတ်ဆွေ";
  }, [lang]);

  const copy =
    lang === "my"
      ? {
          back: "ပင်မစာမျက်နှာ",
          title: "စိုက်ပျိုးရေး ဈေးကွက်ဈေးနှုန်းများ",
          subtitle: "Wisarra မှ နောက်ဆုံးရ ဈေးနှုန်းများ",
          date: "ရက်စွဲ",
          search: "ကုန်ပစ္စည်းနာမည် ရှာဖွေမည်…",
          loading: "ဈေးနှုန်းများ ရယူနေသည်…",
          loadError: "ဈေးနှုန်းများ ရယူ၍မရပါ။ Database ချိတ်ဆက်မှု မရှိပါ။",
          noResults: "ရှာဖွေမှုနှင့် ကိုက်ညီသော ရလဒ်မရှိပါ။",
          cols: {
            no: "အမှတ်",
            name: "အမည်",
            location: "တည်နေရာ",
            marketplace: "ဈေးကွက်",
            min: "အနည်းဆုံး",
            max: "အများဆုံး",
            currency: "ငွေကြေး",
            quantity: "အရေအတွက်",
            unit: "ယူနစ်",
          },
        }
      : {
          back: "Home",
          title: "Agricultural Market Prices",
          subtitle: "Latest commodity prices from Wisarra",
          date: "Date",
          search: "Search commodity name…",
          loading: "Loading market prices…",
          loadError: "Market prices unavailable. Database connection required.",
          noResults: "No results match your search.",
          cols: {
            no: "No.",
            name: "Name",
            location: "Location",
            marketplace: "Marketplace",
            min: "Min",
            max: "Max",
            currency: "Currency",
            quantity: "Quantity",
            unit: "Unit",
          },
        };

  const priceDate = data?.recordedAt ? formatMarketDate(data.recordedAt, lang) : null;

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = (data?.commodities ?? []).filter((commodity) => {
    const localizedName = localizeMarketValue("commodities", commodity.name, "my") ?? "";
    return `${commodity.name} ${localizedName}`.toLocaleLowerCase().includes(normalizedSearch);
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const fmt = (v: number | null) =>
    v !== null ? formatMarketNumber(v, lang) : "—";

  return (
    <main className="market-page">
      {/* ── Topbar ──────────────────────────────────── */}
      <header className="market-topbar">
        <Link href="/" className="market-brand" aria-label={lang === "my" ? "ပင်မစာမျက်နှာသို့" : "Go to home"}>
<span
              aria-label={t.header.title}
              className="harvest-brand-logo"
              role="img"
            />
        </Link>
        <nav className="market-topbar-nav">
          <button
            type="button"
            className="market-lang-btn"
            onClick={() => setLang(lang === "en" ? "my" : "en")}
            aria-label={
              lang === "en"
                ? t.dashboard.languageSwitchToMyanmar
                : t.dashboard.languageSwitchToEnglish
            }
          >
            <HarvestIcon name="globe" size={16} />
            {lang === "en" ? "Myanmar" : "English"}
          </button>
          <SiteNavigation />
        </nav>
      </header>

      {/* ── Content ─────────────────────────────────── */}
      <div className="market-content">
        {/* Breadcrumb */}
        <nav className="market-breadcrumb" aria-label="breadcrumb">
          <Link href="/">
            <HarvestIcon name="sprout" size={14} />
            {copy.back}
          </Link>
          <span aria-hidden="true">›</span>
          <span>{copy.title}</span>
        </nav>

        {/* Page heading */}
        <h1 className="market-title">{copy.title}</h1>

        {priceDate && (
          <div className="market-date-badge">
            <HarvestIcon name="calendar" size={14} />
            {priceDate}
          </div>
        )}

        {/* Search */}
        <div className="market-search-wrap">
          <div className="market-search-box">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <input
              type="search"
              placeholder={copy.search}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              id="market-search"
            />
          </div>
        </div>

        {/* Table card */}
        <div className="market-table-card">
          {loading ? (
            <div className="market-state">
              <span className="market-spinner" />
              {copy.loading}
            </div>
          ) : error ? (
            <div className="market-state market-state-error" role="alert">
              <HarvestIcon name="alert" size={20} />
              {copy.loadError}
            </div>
          ) : filtered.length === 0 ? (
            <div className="market-state">{copy.noResults}</div>
          ) : (
            <>
              <div className="market-table-wrap">
              <table className="market-table">
                <thead>
                  <tr>
                    <th className="market-col-no">{copy.cols.no}</th>
                    <th><HarvestIcon name="sprout" size={13} />{copy.cols.name}</th>
                    <th><HarvestIcon name="pin" size={13} />{copy.cols.location}</th>
                    <th><HarvestIcon name="regions" size={13} />{copy.cols.marketplace}</th>
                    <th><HarvestIcon name="download" size={13} />{copy.cols.min}</th>
                    <th><HarvestIcon name="upload" size={13} />{copy.cols.max}</th>
                    <th><HarvestIcon name="dataset" size={13} />{copy.cols.currency}</th>
                    <th><HarvestIcon name="layers" size={13} />{copy.cols.quantity}</th>
                    <th><HarvestIcon name="info" size={13} />{copy.cols.unit}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, i) => (
                    <tr key={row.id}>
                      <td className="market-row-cell">
                        <span className="market-row-num">
                          {formatMarketNumber(safePage * PAGE_SIZE + i + 1, lang)}
                        </span>
                      </td>
                      <td className="market-name">
                        {localizeMarketValue("commodities", row.name, lang)}
                      </td>
                      <td>{localizeMarketValue("locations", row.location, lang) ?? "—"}</td>
                      <td>{localizeMarketValue("marketplaces", row.marketplace, lang) ?? "—"}</td>
                      <td className="market-num">{fmt(row.minPrice)}</td>
                      <td className="market-num">{fmt(row.maxPrice)}</td>
                      <td>{localizeMarketValue("currencies", row.currency ?? "MMK", lang)}</td>
                      <td className="market-num">{fmt(row.quantity)}</td>
                      <td>{localizeMarketValue("units", row.unit, lang) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {pageCount > 1 && (
                <MarketPagination
                  current={safePage}
                  count={pageCount}
                  onSelect={setPage}
                />
              )}
            </>
          )}
        </div>

        {/* Source note */}
        {data && !loading && !error && (
          <p className="market-source-note">
            {lang === "my"
              ? `Wisarra မှ ရယူသော ဈေးနှုန်းများ · စုစုပေါင်း ${formatMarketNumber(filtered.length, lang)} မျိုး`
              : `Prices sourced from Wisarra · ${filtered.length.toLocaleString()} commodities`}
          </p>
        )}
      </div>
    </main>
  );
}
