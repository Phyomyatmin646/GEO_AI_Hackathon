"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { HarvestIcon } from "../components/HarvestIcon";
import { SiteNavigation } from "../components/SiteNavigation";
import type {
  CropCalendarMonthWindow,
  CropCalendarRecord,
  CropCalendarRegion,
  CropCalendarsResponse,
} from "../lib/crop-calendar-contract";
import { useLanguage } from "../lib/i18n";
import { localizeRegion } from "../lib/localization";

const REGIONS: readonly CropCalendarRegion[] = [
  "Ayeyarwady",
  "Bago",
  "Mandalay",
  "Sagaing",
  "Magway",
  "Yangon",
];

const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  my: ["ဇန်", "ဖေ", "မတ်", "ဧ", "မေ", "ဇွန်", "ဇူ", "ဩ", "စက်", "အောက်", "နို", "ဒီ"],
} as const;

type TypeFilter = "all" | "annual" | "perennial";

export default function CropCalendarPage() {
  const { lang, setLang, t } = useLanguage();
  const [region, setRegion] = useState<CropCalendarRegion>("Ayeyarwady");
  const [calendars, setCalendars] = useState<CropCalendarRecord[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const copy = lang === "my" ? MY_COPY : EN_COPY;

  useEffect(() => {
    document.title = `${copy.title} | ${lang === "my" ? "စိုက်ပျိုးမိတ်ဆွေ" : "Myanmar Agriculture Intelligence"}`;
  }, [copy.title, lang]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadCalendars() {
      setLoading(true);
      setLoadError(false);
      try {
        const response = await fetch(
          `/api/v1/crop-calendars?region=${encodeURIComponent(region)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(`Crop Calendar API returned ${response.status}`);
        const payload = (await response.json()) as CropCalendarsResponse;
        if (!Array.isArray(payload.calendars)) throw new Error("Invalid Crop Calendar payload");
        if (!controller.signal.aborted) setCalendars(payload.calendars);
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) return;
        setCalendars([]);
        setLoadError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadCalendars();
    return () => controller.abort();
  }, [region]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return calendars.filter((calendar) => {
      const matchesType = typeFilter === "all" || calendar.crop_type === typeFilter;
      const matchesSearch =
        query === "" ||
        `${calendar.crop_name_en} ${calendar.crop_name_mm} ${calendar.season ?? ""}`
          .toLocaleLowerCase()
          .includes(query);
      return matchesType && matchesSearch;
    });
  }, [calendars, search, typeFilter]);

  return (
    <main className="crop-calendar-page">
      <header className="market-topbar">
        <Link
          href="/"
          className="market-brand"
          aria-label={lang === "my" ? "ပင်မစာမျက်နှာသို့" : "Go to home"}
        >
          <span aria-label={t.header.title} className="harvest-brand-logo" role="img" />
        </Link>
        <nav className="market-topbar-nav" aria-label={copy.pageNavigation}>
          <button
            type="button"
            className="market-lang-btn"
            onClick={() => setLang(lang === "en" ? "my" : "en")}
            aria-label={lang === "en" ? t.dashboard.languageSwitchToMyanmar : t.dashboard.languageSwitchToEnglish}
          >
            <HarvestIcon name="globe" size={16} />
            {lang === "en" ? "Myanmar" : "English"}
          </button>
          <SiteNavigation />
        </nav>
      </header>

      <section className="crop-calendar-content">
        <nav className="market-breadcrumb" aria-label="breadcrumb">
          <Link href="/"><HarvestIcon name="sprout" size={14} />{copy.home}</Link>
          <span aria-hidden="true">›</span>
          <span>{copy.title}</span>
        </nav>

        <div className="crop-calendar-heading">
          <div>
            <span className="crop-calendar-eyebrow"><HarvestIcon name="calendar" size={16} />{copy.referenceData}</span>
            <h1>{copy.title}</h1>
            <p>{copy.subtitle}</p>
          </div>
          <div className="crop-calendar-summary" aria-label={copy.coverageLabel}>
            <strong>{loading ? "—" : calendars.length}</strong>
            <span>{copy.cropsInRegion}</span>
          </div>
        </div>

        <div className="crop-calendar-controls">
          <label>
            <span>{copy.region}</span>
            <select value={region} onChange={(event) => setRegion(event.target.value as CropCalendarRegion)}>
              {REGIONS.map((value) => (
                <option key={value} value={value}>{localizeRegion(value, lang)}</option>
              ))}
            </select>
          </label>
          <label className="crop-calendar-search">
            <span>{copy.searchLabel}</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={copy.searchPlaceholder}
            />
          </label>
          <label>
            <span>{copy.cropType}</span>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}>
              <option value="all">{copy.all}</option>
              <option value="annual">{copy.annual}</option>
              <option value="perennial">{copy.perennial}</option>
            </select>
          </label>
        </div>

        <div className="crop-calendar-legend" aria-label={copy.legend}>
          <span><i className="is-planting" />{copy.planting}</span>
          <span><i className="is-harvest" />{copy.harvest}</span>
          <span><i className="is-partial" />{copy.partialEvidence}</span>
        </div>

        {loading ? (
          <div className="crop-calendar-state" aria-live="polite">
            <span className="market-spinner" />{copy.loading}
          </div>
        ) : loadError ? (
          <div className="crop-calendar-state is-error" role="alert">
            <HarvestIcon name="alert" size={20} />{copy.loadError}
          </div>
        ) : filtered.length === 0 ? (
          <div className="crop-calendar-state">{copy.noResults}</div>
        ) : (
          <div className="crop-calendar-grid">
            {filtered.map((calendar) => (
              <CalendarCard key={`${calendar.model_key}-${calendar.region}-${calendar.season ?? "default"}`} calendar={calendar} lang={lang} />
            ))}
          </div>
        )}

        <p className="crop-calendar-disclaimer">
          <HarvestIcon name="info" size={16} />
          {copy.disclaimer}
        </p>
      </section>
    </main>
  );
}

function CalendarCard({ calendar, lang }: { calendar: CropCalendarRecord; lang: "en" | "my" }) {
  const copy = lang === "my" ? MY_COPY : EN_COPY;
  const primary = calendar.crop_type === "annual" ? calendar.planting : calendar.establishment;
  const secondary = calendar.crop_type === "annual" ? calendar.harvest : calendar.harvest_season;
  const hasTiming = primary !== null || secondary !== null;
  const sourceName = calendar.source?.organization ?? calendar.source?.title;

  return (
    <article className="crop-calendar-card">
      <header>
        <div>
          <span className="crop-calendar-kind">
            {calendar.crop_type === "annual" ? copy.annual : copy.perennial}
          </span>
          <h2>{lang === "my" ? calendar.crop_name_mm : calendar.crop_name_en}</h2>
          <p>{lang === "my" ? calendar.crop_name_en : calendar.crop_name_mm}</p>
        </div>
        <span className={`crop-calendar-verification is-${calendar.verification.status}`}>
          {lang === "my" ? calendar.verification.label_mm : calendar.verification.label_en}
        </span>
      </header>

      {calendar.season && <p className="crop-calendar-season">{copy.season}: {calendar.season}</p>}

      <div className="crop-calendar-months" aria-label={copy.monthTimeline}>
        {MONTHS[lang].map((month) => (
          <span key={month} className="crop-calendar-month-label">{month}</span>
        ))}
        <TimelineRow label={calendar.crop_type === "annual" ? copy.planting : copy.establishment} window={primary} />
        <TimelineRow label={copy.harvest} window={secondary} harvest />
      </div>

      {!hasTiming && <p className="crop-calendar-missing">{copy.noTimingEvidence}</p>}

      <dl className="crop-calendar-details">
        <div>
          <dt>{copy.plantingOrEstablishment}</dt>
          <dd>{windowLabel(primary, lang) ?? copy.unavailable}</dd>
        </div>
        <div>
          <dt>{copy.harvest}</dt>
          <dd>{windowLabel(secondary, lang) ?? copy.unavailable}</dd>
        </div>
        {calendar.growing_duration && (
          <div>
            <dt>{copy.duration}</dt>
            <dd>{numberRange(calendar.growing_duration.min_days, calendar.growing_duration.max_days)} {copy.days}</dd>
          </div>
        )}
        {calendar.first_harvest && (
          <div>
            <dt>{copy.firstHarvest}</dt>
            <dd>{numberRange(calendar.first_harvest.min_years, calendar.first_harvest.max_years)} {copy.years}</dd>
          </div>
        )}
      </dl>

      <footer>
        <span>{copy.updated}: {formatDate(calendar.last_updated, lang)}</span>
        {calendar.source?.url && sourceName ? (
          <a href={calendar.source.url} target="_blank" rel="noreferrer noopener">
            {copy.source}: {sourceName}
          </a>
        ) : (
          <span>{copy.source}: {copy.notProvided}</span>
        )}
      </footer>
    </article>
  );
}

function TimelineRow({
  label,
  window,
  harvest = false,
}: {
  label: string;
  window: CropCalendarMonthWindow | null;
  harvest?: boolean;
}) {
  return (
    <>
      <span className="crop-calendar-row-label">{label}</span>
      {Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        const active = monthIsActive(month, window);
        return (
          <i
            key={month}
            className={active ? `${harvest ? "is-harvest" : "is-planting"}${window?.is_complete ? "" : " is-partial"}` : undefined}
            aria-hidden="true"
          />
        );
      })}
    </>
  );
}

function monthIsActive(month: number, window: CropCalendarMonthWindow | null): boolean {
  if (!window) return false;
  const { start_month: start, end_month: end } = window;
  if (start === null) return end === month;
  if (end === null) return start === month;
  return start <= end ? month >= start && month <= end : month >= start || month <= end;
}

function windowLabel(window: CropCalendarMonthWindow | null, lang: "en" | "my"): string | null {
  if (!window) return null;
  if (window.is_complete) return lang === "my" ? window.label_mm : window.label_en;
  const start = lang === "my" ? window.start_label_mm : window.start_label_en;
  const end = lang === "my" ? window.end_label_mm : window.end_label_en;
  if (start) return `${start} (${lang === "my" ? "စတင်လ" : "start only"})`;
  if (end) return `${end} (${lang === "my" ? "အဆုံးလ" : "end only"})`;
  return null;
}

function numberRange(minimum: number | null, maximum: number | null): string {
  if (minimum !== null && maximum !== null) return minimum === maximum ? String(minimum) : `${minimum}–${maximum}`;
  return String(minimum ?? maximum ?? "—");
}

function formatDate(value: string, lang: "en" | "my"): string {
  return new Intl.DateTimeFormat(lang === "my" ? "my-MM" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

const EN_COPY = {
  pageNavigation: "Page navigation", home: "Home", referenceData: "Local reference dataset",
  title: "Myanmar Crop Calendar", subtitle: "Regional planting and harvest windows for 17 supported crops, served from the project’s validated local CSV.",
  coverageLabel: "Regional crop coverage", cropsInRegion: "crops in this region", region: "Region",
  searchLabel: "Crop search", searchPlaceholder: "Search crop name or season…", cropType: "Crop type",
  all: "All crops", annual: "Annual", perennial: "Perennial", legend: "Timeline legend",
  planting: "Planting", establishment: "Establishment", harvest: "Harvest", partialEvidence: "Partial evidence",
  loading: "Loading crop calendars…", loadError: "Crop Calendar data could not be loaded from the backend. Please retry.",
  noResults: "No crops match these filters.", disclaimer: "Calendar rows marked ‘requires verification’ are reference evidence, not a field-level prediction or guaranteed farming recommendation.",
  season: "Season", monthTimeline: "Twelve-month crop timeline", noTimingEvidence: "No supported month window is available for this crop and region.",
  plantingOrEstablishment: "Planting / establishment", unavailable: "Unavailable", duration: "Growing duration", days: "days",
  firstHarvest: "First harvest", years: "years", updated: "Updated", source: "Source", notProvided: "not provided",
} as const;

const MY_COPY = {
  pageNavigation: "စာမျက်နှာ လမ်းညွှန်", home: "ပင်မစာမျက်နှာ", referenceData: "Project-local ရည်ညွှန်းဒေတာ",
  title: "မြန်မာ သီးနှံစိုက်ပျိုးပြက္ခဒိန်", subtitle: "Project ထဲရှိ စစ်ဆေးပြီး local CSV မှ ရယူထားသော သီးနှံ ၁၇ မျိုး၏ ဒေသအလိုက် စိုက်ပျိုးနှင့် ရိတ်သိမ်းကာလများ။",
  coverageLabel: "ဒေသအလိုက် သီးနှံအရေအတွက်", cropsInRegion: "ဤဒေသရှိ သီးနှံများ", region: "တိုင်း/ဒေသကြီး",
  searchLabel: "သီးနှံရှာရန်", searchPlaceholder: "သီးနှံအမည် သို့မဟုတ် ရာသီ ရှာရန်…", cropType: "သီးနှံအမျိုးအစား",
  all: "အားလုံး", annual: "နှစ်ပတ်လည်သီးနှံ", perennial: "နှစ်ရှည်သီးနှံ", legend: "ကာလပြ အညွှန်း",
  planting: "စိုက်ပျိုးချိန်", establishment: "ပင်တည်ချိန်", harvest: "ရိတ်သိမ်းချိန်", partialEvidence: "အချက်အလက် မပြည့်စုံ",
  loading: "သီးနှံပြက္ခဒိန်များ ရယူနေသည်…", loadError: "Backend မှ သီးနှံပြက္ခဒိန်ဒေတာကို မရယူနိုင်ပါ။ ပြန်စမ်းပါ။",
  noResults: "ရွေးချယ်ထားသော စစ်ထုတ်မှုနှင့် ကိုက်ညီသည့် သီးနှံမရှိပါ။", disclaimer: "‘အတည်ပြုရန်လိုအပ်’ ဟု ဖော်ပြထားသည့် မှတ်တမ်းများသည် ရည်ညွှန်းအထောက်အထားသာဖြစ်ပြီး လယ်ကွင်းအလိုက် ခန့်မှန်းချက် သို့မဟုတ် အာမခံထားသော အကြံပြုချက် မဟုတ်ပါ။",
  season: "ရာသီ", monthTimeline: "၁၂ လ သီးနှံအချိန်ဇယား", noTimingEvidence: "ဤသီးနှံနှင့် ဒေသအတွက် အထောက်အထားရှိသော လကာလ မရရှိသေးပါ။",
  plantingOrEstablishment: "စိုက်ပျိုး / ပင်တည်ချိန်", unavailable: "မရရှိနိုင်", duration: "စိုက်ပျိုးကြာချိန်", days: "ရက်",
  firstHarvest: "ပထမဆုံး ရိတ်သိမ်းချိန်", years: "နှစ်", updated: "နောက်ဆုံးပြင်ဆင်", source: "အရင်းအမြစ်", notProvided: "မဖော်ပြထား",
} as const;
