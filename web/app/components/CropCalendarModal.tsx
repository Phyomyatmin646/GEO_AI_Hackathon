"use client";

import { useEffect, useRef, useState } from "react";

import {
  CROP_CALENDAR_MODEL_KEYS,
  isCropCalendarResponse,
  type CropCalendarMonthWindow,
  type CropCalendarRecord,
} from "../lib/crop-calendar-contract";
import { useLanguage } from "../lib/i18n";
import { localizeRegion } from "../lib/localization";
import { cropModelTarget } from "../lib/model-contract";
import { HarvestIcon } from "./HarvestIcon";

const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  my: ["ဇန်", "ဖေ", "မတ်", "ဧ", "မေ", "ဇွန်", "ဇူ", "ဩ", "စက်", "အောက်", "နို", "ဒီ"],
} as const;

type CropCalendarModalProps = {
  cropId: string | null;
  region: string;
  onClose: () => void;
};

type RegionalCropCalendarPanelProps = {
  region: string;
  onSelectCrop: (cropId: string) => void;
};

export function RegionalCropCalendarPanel({
  region,
  onSelectCrop,
}: RegionalCropCalendarPanelProps) {
  const { lang, t } = useLanguage();

  return (
    <section className="home-calendar-panel" aria-labelledby="home-calendar-title">
      <div className="home-calendar-panel-heading">
        <span><HarvestIcon name="calendar" size={19} /></span>
        <div>
          <p className="section-label">
            {lang === "my" ? "Project-local CSV ဒေတာ" : "Project-local CSV data"}
          </p>
          <h3 id="home-calendar-title">
            {lang === "my" ? "ဒေသအလိုက် သီးနှံစိုက်ပျိုးပြက္ခဒိန်" : "Regional crop calendar"}
          </h3>
        </div>
      </div>
      <p className="home-calendar-panel-note">
        {lang === "my"
          ? `${localizeRegion(region, lang)} ဒေသရည်ညွှန်းပြက္ခဒိန်ဖြစ်ပြီး weekly model အဆင့်သတ်မှတ်ချက် မဟုတ်ပါ။ သီးနှံကိုနှိပ်ပြီး စိုက်ပျိုး/ရိတ်သိမ်းကာလကို ကြည့်နိုင်ပါသည်။`
          : `This is a ${localizeRegion(region, lang)} regional reference calendar, not a weekly model ranking. Select a crop to view its planting and harvest windows.`}
      </p>
      <div className="home-calendar-crop-list">
        {CROP_CALENDAR_MODEL_KEYS.map((target) => {
          const cropId = target.slice("crop_suitability_".length);
          return (
            <button type="button" key={target} onClick={() => onSelectCrop(cropId)}>
              <span>{t.modelEvidence.targetLabels[target] ?? cropId.replaceAll("_", " ")}</span>
              <HarvestIcon name="chevron" size={14} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function CropCalendarModal({ cropId, region, onClose }: CropCalendarModalProps) {
  const { lang } = useLanguage();
  const [calendar, setCalendar] = useState<CropCalendarRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const modelKey = cropModelTarget(cropId ?? undefined);
  const open = cropId !== null;

  useEffect(() => {
    if (!open || !modelKey) return;
    const controller = new AbortController();

    async function loadCalendar() {
      setLoading(true);
      setLoadError(false);
      setCalendar(null);
      try {
        const response = await fetch(
          `/api/v1/crop-calendars/${encodeURIComponent(modelKey)}?region=${encodeURIComponent(region)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(`Crop Calendar API returned ${response.status}`);
        const payload: unknown = await response.json();
        if (!isCropCalendarResponse(payload)) throw new Error("Invalid Crop Calendar response");
        if (!controller.signal.aborted) setCalendar(payload.calendar);
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) return;
        setLoadError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadCalendar();
    return () => controller.abort();
  }, [modelKey, open, region]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleDocumentKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  const copy = lang === "my" ? MY_COPY : EN_COPY;
  const primary = calendar?.crop_type === "perennial" ? calendar.establishment : calendar?.planting;
  const secondary = calendar?.crop_type === "perennial" ? calendar.harvest_season : calendar?.harvest;
  const sourceName = calendar?.source?.organization ?? calendar?.source?.title;

  return (
    <div
      className="crop-calendar-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="crop-calendar-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-calendar-modal-title"
        aria-describedby="crop-calendar-modal-boundary"
        aria-busy={loading}
        ref={modalRef}
      >
        <header className="crop-calendar-modal-header">
          <div>
            <span className="crop-calendar-modal-eyebrow">
              <HarvestIcon name="calendar" size={16} />
              {copy.reference}
            </span>
            <h2 id="crop-calendar-modal-title">
              {calendar
                ? (lang === "my" ? calendar.crop_name_mm : calendar.crop_name_en)
                : cropId.replaceAll("_", " ")}
            </h2>
            {calendar && (
              <p>{lang === "my" ? calendar.crop_name_en : calendar.crop_name_mm} · {calendar.region}</p>
            )}
          </div>
          <button type="button" ref={closeButtonRef} onClick={onClose} aria-label={copy.close}>
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="crop-calendar-modal-body">
          {!modelKey || loadError ? (
            <div className="crop-calendar-modal-state is-error" role="alert">
              <HarvestIcon name="alert" size={22} />
              <div><strong>{copy.errorTitle}</strong><p>{copy.errorBody}</p></div>
            </div>
          ) : loading ? (
            <div className="crop-calendar-modal-state" role="status">
              <span className="market-spinner" aria-hidden="true" />
              {copy.loading}
            </div>
          ) : calendar ? (
            <>
              <div className="crop-calendar-modal-meta">
                <span className="crop-calendar-kind">
                  {calendar.crop_type === "annual" ? copy.annual : copy.perennial}
                </span>
                <span className={`crop-calendar-verification is-${calendar.verification.status}`}>
                  {lang === "my" ? calendar.verification.label_mm : calendar.verification.label_en}
                </span>
              </div>

              {calendar.season && <p className="crop-calendar-season">{copy.season}: {calendar.season}</p>}

              <div className="crop-calendar-modal-months" aria-label={copy.timeline}>
                {MONTHS[lang].map((month) => <span key={month}>{month}</span>)}
                <ModalTimelineRow label={calendar.crop_type === "annual" ? copy.planting : copy.establishment} window={primary ?? null} />
                <ModalTimelineRow label={copy.harvest} window={secondary ?? null} harvest />
              </div>

              <dl className="crop-calendar-modal-details">
                <div>
                  <dt>{calendar.crop_type === "annual" ? copy.planting : copy.establishment}</dt>
                  <dd>{windowLabel(primary ?? null, lang) ?? copy.unavailable}</dd>
                </div>
                <div><dt>{copy.harvest}</dt><dd>{windowLabel(secondary ?? null, lang) ?? copy.unavailable}</dd></div>
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

              <div className="crop-calendar-modal-source">
                <span>{copy.updated}: {formatDate(calendar.last_updated, lang)}</span>
                {calendar.source?.url && sourceName ? (
                  <a href={calendar.source.url} target="_blank" rel="noreferrer noopener">
                    {copy.source}: {sourceName}
                  </a>
                ) : <span>{copy.source}: {copy.unavailable}</span>}
              </div>
            </>
          ) : null}
        </div>

        <footer id="crop-calendar-modal-boundary">
          <HarvestIcon name="info" size={16} />
          <span>{copy.boundary}</span>
        </footer>
      </div>
    </div>
  );
}

function ModalTimelineRow({
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
      <strong>{label}</strong>
      {Array.from({ length: 12 }, (_, index) => {
        const active = monthIsActive(index + 1, window);
        return (
          <i
            key={index}
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
  if (start) return `${start} (${lang === "my" ? "စတင်လသာရှိ" : "start only"})`;
  if (end) return `${end} (${lang === "my" ? "အဆုံးလသာရှိ" : "end only"})`;
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
  }).format(new Date(`${value}T00:00:00Z`));
}

const EN_COPY = {
  reference: "Regional reference calendar",
  close: "Close Crop Calendar",
  loading: "Loading Crop Calendar…",
  errorTitle: "Crop Calendar unavailable",
  errorBody: "This crop and region could not be loaded from the local calendar service.",
  annual: "Annual crop",
  perennial: "Perennial crop",
  season: "Season",
  timeline: "Planting and harvest month timeline",
  planting: "Planting",
  establishment: "Establishment",
  harvest: "Harvest",
  duration: "Growing duration",
  firstHarvest: "First harvest",
  days: "days",
  years: "years",
  updated: "Updated",
  source: "Source",
  unavailable: "Not available",
  boundary: "Regional Crop Calendar reference only. It is not a weekly model score or a field-level planting instruction.",
} as const;

const MY_COPY = {
  reference: "ဒေသအလိုက် ရည်ညွှန်းပြက္ခဒိန်",
  close: "သီးနှံစိုက်ပျိုးပြက္ခဒိန်ကို ပိတ်ရန်",
  loading: "သီးနှံစိုက်ပျိုးပြက္ခဒိန် ရယူနေသည်…",
  errorTitle: "သီးနှံစိုက်ပျိုးပြက္ခဒိန် မရရှိနိုင်ပါ",
  errorBody: "ဤသီးနှံနှင့် ဒေသအတွက် local calendar service မှ ဒေတာမရရှိနိုင်ပါ။",
  annual: "တစ်နှစ်ခံသီးနှံ",
  perennial: "နှစ်ရှည်သီးနှံ",
  season: "ရာသီ",
  timeline: "စိုက်ပျိုးနှင့် ရိတ်သိမ်းလများ",
  planting: "စိုက်ပျိုးချိန်",
  establishment: "စတင်စိုက်ပျိုးချိန်",
  harvest: "ရိတ်သိမ်းချိန်",
  duration: "စိုက်ပျိုးကာလ",
  firstHarvest: "ပထမဆုံးရိတ်သိမ်းချိန်",
  days: "ရက်",
  years: "နှစ်",
  updated: "နောက်ဆုံးပြင်ဆင်",
  source: "အရင်းအမြစ်",
  unavailable: "ဒေတာမရှိပါ",
  boundary: "ဒေသအလိုက် Crop Calendar ရည်ညွှန်းအချက်အလက်သာဖြစ်ပြီး weekly model score သို့မဟုတ် ကွင်းအလိုက် စိုက်ပျိုးညွှန်ကြားချက် မဟုတ်ပါ။",
} as const;
