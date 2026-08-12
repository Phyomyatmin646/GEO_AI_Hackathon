"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PilotFeature, Recommendation } from "../lib/pilot-data";
import { useLanguage } from "../lib/i18n";
import {
  homeMapScore,
  homeWeeklyCellMap,
  numericPrediction,
  weeklyCropRecommendations,
  type HomePayload,
  type HomePeriod,
  type HomeWeeklyCell,
} from "../lib/home-data";
import { csvValue } from "../lib/csv-value";
import {
  localizeBilingualLabel,
  localizeBilingualNarrative,
  localizeFactor,
  localizeUnit,
  localizeRegion,
} from "../lib/localization";

function MapLoading() {
  const { t } = useLanguage();
  return <div className="map-loading">{t.dashboard.mapLoading}</div>;
}

const GeoMap = dynamic(() => import("./GeoMap"), {
  ssr: false,
  loading: () => <MapLoading />,
});
import { LiveCropRecommendationPanel } from "./LiveCropRecommendationPanel";
import { ModelEvidencePanel } from "./ModelEvidencePanel";
import { ClimateLivePanel } from "./ClimateLivePanel";
import { CORE_MODEL_TARGETS, cropModelTarget } from "../lib/model-contract";
import { HarvestIcon } from "./HarvestIcon";
import { SiteNavigation } from "./SiteNavigation";
import { NeonWeeklyPredictions } from "./NeonWeeklyPredictions";
import { CropCalendarModal, RegionalCropCalendarPanel } from "./CropCalendarModal";

const CLIMATE_FEATURE_IDS = new Set([
  "rainfall_normal_1991_2020_mm",
  "rainfall_anomaly_1991_2020_mm",
  "rainfall_anomaly_1991_2020_pct",
  "temperature_normal_1991_2020_c",
  "temperature_anomaly_1991_2020_c",
]);
const WEATHER_FEATURE_IDS = new Set([
  "monthly_rainfall_mm",
  "mean_temperature_c",
  "solar_radiation_mj_m2_day",
  "era5_soil_moisture_m3_m3",
]);
const CURRENT_CONDITION_FEATURE_IDS = [
  "mean_temperature_c",
  "era5_soil_moisture_m3_m3",
  "soil_ph_h2o_0_30cm",
  "monthly_rainfall_mm",
] as const;
const DOWNLOAD_FEATURE_IDS = [
  "monthly_rainfall_mm",
  "mean_temperature_c",
  "solar_radiation_mj_m2_day",
  "era5_soil_moisture_m3_m3",
] as const;
const INPUT_SOURCE_IDS = new Set([
  "chirps",
  "chirps_gee_staging",
  "era5_land",
  "fao_gaul",
  "jrc_surface_water",
]);

type SuitabilityTier = "poor" | "moderate" | "good" | "excellent";
type DashboardRecommendation = Omit<Recommendation, "score"> & {
  score: number | null;
  suitabilityTier: SuitabilityTier | null;
  validationStatus: string | null;
};

function formatFeatureValue(
  value: string | number | boolean | null,
  unit: string,
  missing: string,
) {
  if (value === null) return missing;
  if (typeof value !== "number") return `${String(value)}${unit ? ` ${unit}` : ""}`;
  const absolute = Math.abs(value);
  const decimals = absolute >= 100 ? 1 : absolute >= 10 ? 2 : 3;
  return `${value.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function truthfulCropNarrative(value: string, weekly: boolean) {
  if (weekly) return value;
  return value.replace(/^AI Model\s*·/iu, "Historical rule-based ·");
}

function suitabilityTierLabel(tier: SuitabilityTier | null, lang: "en" | "my"): string | null {
  if (!tier) return null;
  const labels = lang === "my"
    ? { poor: "မသင့်တော်", moderate: "အသင့်အတင့်", good: "ကောင်း", excellent: "အထူးကောင်း" }
    : { poor: "Poor", moderate: "Moderate", good: "Good", excellent: "Excellent" };
  return labels[tier];
}

export function PilotDashboard() {
  const [payload, setPayload] = useState<HomePayload | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [activeCropId, setActiveCropId] = useState("");
  const [calendarCropId, setCalendarCropId] = useState<string | null>(null);
  const [region, setRegion] = useState("ayeyawaddy");
  const [period, setPeriod] = useState<HomePeriod>("latest");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewSaved, setReviewSaved] = useState(false);
  const [showSourceDetails, setShowSourceDetails] = useState(false);
  const [showInputDetails, setShowInputDetails] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const requestSequence = useRef(0);
  const { lang, setLang, t } = useLanguage();
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(lang === "my" ? "my-MM" : "en-US"),
    [lang],
  );
  const cropName = (crop: { nameMm: string; nameEn: string }) =>
    lang === "my" ? crop.nameMm : crop.nameEn;
  const closeCropCalendar = useCallback(() => setCalendarCropId(null), []);

  const loadPilot = useCallback(async (
    selectedRegion: string,
    selectedPeriod: HomePeriod,
    signal?: AbortSignal,
  ) => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setLoadError(false);
    try {
      const [response, geometryResponse] = await Promise.all([
        fetch(
          `/api/v1/home?region=${encodeURIComponent(selectedRegion)}&period=${selectedPeriod}`,
          { signal, cache: "no-store" },
        ),
        fetch(
          `/api/v1/geometry?region=${encodeURIComponent(selectedRegion)}`,
          { signal, cache: "force-cache" }
        )
      ]);
      
      if (!response.ok || !geometryResponse.ok) {
        throw new Error(`Pilot API returned ${response.status}`);
      }
      const value = (await response.json()) as HomePayload;
      if (!Array.isArray(value.cells) || !value.meta?.releaseId || !value.live?.mode) {
        throw new Error("Pilot API response did not match the expected contract");
      }
      if (
        value.meta.region.trim().toLocaleLowerCase("en") !==
        selectedRegion.trim().toLocaleLowerCase("en")
      ) {
        throw new Error("Pilot API returned a different regional release");
      }
      if (signal?.aborted || requestId !== requestSequence.current) return;
      
      const geometryData = await geometryResponse.json() as { geometry: { id: string; polygon: unknown }[] };
      const geometryMap = new Map(geometryData.geometry.map((g) => [g.id, g.polygon]));
      
      // Merge geometry back into cells
      value.cells = value.cells.map((cell) => ({
        ...cell,
        polygon: geometryMap.get(cell.id) || []
      }));
      
      setPayload(value);
      setSelectedId((current) =>
        value.cells.some((cell) => cell.id === current)
          ? current
          : (value.cells.find((cell) => cell.recommendationStatus === "scored")?.id ??
            value.cells[0]?.id ??
            ""),
      );
    } catch (error) {
      if (
        signal?.aborted ||
        (error instanceof DOMException && error.name === "AbortError") ||
        requestId !== requestSequence.current
      ) {
        return;
      }
      setLoadError(true);
    } finally {
      if (!signal?.aborted && requestId === requestSequence.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadTimer = window.setTimeout(() => {
      void loadPilot(region, period, controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(loadTimer);
      controller.abort();
    };
  }, [loadPilot, period, region]);

  useEffect(() => {
    document.title =
      lang === "en"
        ? "Agriculture Companion | Myanmar Agriculture Intelligence"
        : "စိုက်ပျိုးမိတ်ဆွေ | Myanmar Agriculture Intelligence";
  }, [lang]);

  const selectedCell = useMemo(
    () => payload?.cells.find((cell) => cell.id === selectedId) ?? payload?.cells[0],
    [payload, selectedId],
  );

  useEffect(() => {
    if (!selectedCell) return;
    const timer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(`myay-review-${selectedCell.id}`);
        if (!stored) {
          setReviewNote("");
          setReviewSaved(false);
          return;
        }
        const parsed = JSON.parse(stored) as { note?: unknown };
        const note = typeof parsed.note === "string" ? parsed.note : "";
        setReviewNote(note);
        setReviewSaved(note.trim().length > 0);
      } catch {
        setReviewNote("");
        setReviewSaved(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedCell]);

  const weeklyCells = useMemo(
    () => payload ? homeWeeklyCellMap(payload.live) : new Map<string, HomeWeeklyCell>(),
    [payload],
  );
  const selectedWeeklyCell = selectedCell ? weeklyCells.get(selectedCell.id) : undefined;
  const displayRecommendations = useMemo<DashboardRecommendation[]>(() => {
    if (!selectedCell || !payload) return [];
    if (payload.live.mode !== "weekly") {
      return selectedCell.recommendations.map((item) => ({
        ...item,
        suitabilityTier: null,
        validationStatus: null,
      }));
    }
    if (!payload.live.cropPredictionsAvailable) return [];
    return weeklyCropRecommendations(selectedWeeklyCell).map((item) => {
      const historical = selectedCell.recommendations.find((crop) => crop.id === item.cropId);
      return {
        id: item.cropId,
        nameMm: historical?.nameMm ?? item.cropId.replaceAll("_", " "),
        nameEn: historical?.nameEn ?? item.cropId.replaceAll("_", " "),
        score: item.score,
        confidence: item.prediction.confidence ?? 0,
        why: "Persisted weekly model result. လက်ရှိ weekly model မှ သိမ်းထားသောရလဒ်ဖြစ်သည်။",
        positiveFactors: [],
        limitingFactors: item.prediction.warnings,
        missingFeatures: [],
        suitabilityTier: item.suitabilityTier,
        validationStatus: item.prediction.validationStatus,
      };
    });
  }, [payload, selectedCell, selectedWeeklyCell]);
  const selectedCropId = activeCropId || displayRecommendations[0]?.id;
  const activeCrop = displayRecommendations.find(
    (crop) => crop.id === selectedCropId,
  );

  function saveReview() {
    if (!selectedCell || reviewNote.trim().length === 0) return;
    const key = `myay-review-${selectedCell.id}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        cellId: selectedCell.id,
        note: reviewNote.trim(),
        savedAt: new Date().toISOString(),
        source: "device_local_pilot_review",
        entersTrainingData: false,
      }),
    );
    setReviewNote(reviewNote.trim());
    setReviewSaved(true);
  }

  function selectCell(cellId: string) {
    setSelectedId(cellId);
    setActiveCropId("");
    setCalendarCropId(null);
    setReviewSaved(false);
  }

  function selectCrop(cropId: string) {
    setActiveCropId(cropId);
    if (cropModelTarget(cropId)) setCalendarCropId(cropId);
    setReviewSaved(false);
  }

  if (loading) {
    return (
      <main className="state-page">
        <div className="state-card" role="status">
          <span className="state-pulse" aria-hidden="true" />
          <h1>{t.loading.title}</h1>
          <p>{t.loading.description}</p>
        </div>
      </main>
    );
  }

  if (loadError || !payload || !selectedCell) {
    return (
      <main className="state-page">
        <div className="state-card error-card" role="alert">
          <span className="state-symbol" aria-hidden="true">!</span>
          <h1>{t.error.title}</h1>
          <p>{t.error.description}</p>
          <button type="button" onClick={() => void loadPilot(region, period)}>
            {t.error.retry}
          </button>
        </div>
      </main>
    );
  }

  const isWeekly = payload.live.mode === "weekly";
  const isAbstained = !isWeekly && selectedCell.recommendationStatus === "insufficient_evidence";
  const weeklyUnavailable = isWeekly && displayRecommendations.length === 0;
  const uncertaintyLabel = {
    low: t.dashboard.uncertaintyLow,
    medium: t.dashboard.uncertaintyMedium,
    high: t.dashboard.uncertaintyHigh,
  }[selectedCell.uncertainty];
  const recommendationStatusLabel = isAbstained
    ? t.dashboard.statusInsufficient
    : isWeekly
      ? (activeCrop?.validationStatus === "flagged"
          ? (lang === "my" ? "flagged စမ်းသပ်ရလဒ်" : "flagged experimental")
          : (lang === "my" ? "စမ်းသပ်ရလဒ်" : "experimental"))
      : t.dashboard.statusScored;
  const selectedCropTarget = cropModelTarget(selectedCropId);
  const selectedCropLabel = isWeekly && selectedCropTarget
    ? (t.modelEvidence.targetLabels[selectedCropTarget] ?? selectedCropId)
    : activeCrop
      ? cropName(activeCrop)
      : selectedCropTarget
        ? (t.modelEvidence.targetLabels[selectedCropTarget] ?? selectedCropId)
        : selectedCropId;
  const weeklyFeatureTargets: Record<string, string> = {
    monthly_rainfall_mm: "current_month_precipitation_mm",
    mean_temperature_c: "current_month_mean_temperature_c",
    solar_radiation_mj_m2_day: "current_month_solar_rad_mj_m2_day",
  };
  const displayFeatures: PilotFeature[] = selectedCell.features.map((feature) => {
    const target = weeklyFeatureTargets[feature.id];
    const value = target ? numericPrediction(selectedWeeklyCell, target) : null;
    return isWeekly && value !== null ? { ...feature, value, status: "weekly_model" } : feature;
  });
  const climateFeatures = displayFeatures.filter((feature) =>
    CLIMATE_FEATURE_IDS.has(feature.id),
  );
  const weatherFeatures = displayFeatures.filter((feature) =>
    WEATHER_FEATURE_IDS.has(feature.id),
  );
  const otherFeatures = displayFeatures.filter(
    (feature) =>
      !CLIMATE_FEATURE_IDS.has(feature.id) &&
      !WEATHER_FEATURE_IDS.has(feature.id),
  );
  const currentConditionFeatures = CURRENT_CONDITION_FEATURE_IDS.flatMap((featureId) => {
    const feature = displayFeatures.find((item) => item.id === featureId);
    return feature ? [feature] : [];
  });
  const downloadFeatures = DOWNLOAD_FEATURE_IDS.flatMap((featureId) => {
    const feature = displayFeatures.find((item) => item.id === featureId);
    return feature ? [feature] : [];
  });
  const inputSources = payload.meta.sources.filter((source) => INPUT_SOURCE_IDS.has(source.id));
  const evidenceSources = payload.meta.sources.filter((source) => !INPUT_SOURCE_IDS.has(source.id));
  const mapOverlay = Object.fromEntries(
    payload.live.cells.flatMap((cell) => {
      const overlay = homeMapScore(cell);
      return overlay ? [[cell.gridId, overlay] as const] : [];
    }),
  );
  const weeklyPredictionCellCount = payload.live.cells.filter(
    (cell) => Object.keys(cell.predictions).length > 0,
  ).length;
  const weeklyErrorCellCount = payload.live.cells.filter(
    (cell) => Object.keys(cell.errors).length > 0,
  ).length;
  const weeklyCropCellCount = payload.live.cells.filter(
    (cell) => weeklyCropRecommendations(cell).length > 0,
  ).length;
  const qaStatus = payload.meta.qa.valid
    ? payload.meta.qa.warningCount > 0
      ? (lang === "my" ? "အောင်မြင် · သတိပေးချက်ရှိ" : "Passed with warnings")
      : (lang === "my" ? "အောင်မြင်" : "Passed")
    : (lang === "my" ? "မအောင်မြင်" : "Failed");
  const qaTitle = `${localizeRegion(payload.meta.region, lang)} · ${formatMonthLabel(payload.meta.periodStart.slice(0, 7))} QA`;
  const sourceFileName = `${payload.meta.releaseId.split("__")[0]}.csv`;
  const qaChecks = [
    {
      label: lang === "my" ? "Schema နှင့် data contract စစ်ဆေးမှု" : "Schema and data-contract validation",
      passed: payload.meta.qa.valid,
    },
    {
      label: lang === "my" ? "Cell အားလုံးတွက်ချက်ထားမှု" : "Every cell is accounted for",
      passed: payload.meta.scoredCellCount + payload.meta.abstainedCellCount === payload.meta.rowCount,
    },
    {
      label: lang === "my" ? "Source manifest checksum ရှိမှု" : "Source manifest checksum present",
      passed: Boolean(payload.meta.sourceManifestSha256),
    },
    {
      label: lang === "my" ? "Training အသုံးပြုနိုင်မှု အမှတ်အသား" : "Training eligibility recorded",
      passed: payload.meta.usableCellCount <= payload.meta.rowCount,
    },
  ];
  const generatedDate = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(payload.meta.generatedAt));
  const qaText = lang === "my"
    ? {
        back: "ရလဒ်များသို့ ပြန်သွားရန်",
        quality: "အရည်အသွေး စစ်ဆေးမှု",
        csvRows: "CSV အတန်းအရေအတွက်",
        status: "QA အခြေအနေ",
        warning: "သတိပေးချက်",
        warnings: "သတိပေးချက်များ",
        errors: "Error များ",
        usableRows: "အသုံးပြုနိုင်သော အတန်းများ",
        dataset: "Dataset အချက်အလက်",
        sourceFile: "မူရင်းဖိုင်",
        createdBy: "ဖန်တီးသူ",
        createdDate: "ဖန်တီးသည့်ရက်",
        totalRows: "အတန်းစုစုပေါင်း (CSV)",
        summary: "QA အကျဉ်းချုပ်",
        checksPerformed: "အထောက်အထားဖြင့် စစ်ဆေးထားမှုများ",
        sources: "အသုံးပြုထားသော ဒေတာရင်းမြစ်များ",
        inputs: "Input ဒေတာ",
        viewSources: "ရင်းမြစ်အားလုံး ကြည့်ရန်",
        viewInputs: "Input အားလုံး ကြည့်ရန်",
        review: "Pilot သုံးသပ်ချက်",
        reviewNotes: "သုံးသပ်ချက် မှတ်စု",
        localReview: "ဤမှတ်စုကို ယခုစက်ထဲတွင်သာ သိမ်းပြီး backend သို့မပို့ပါ။ Training data ထဲသို့လည်း မဝင်ပါ။",
        showDetails: "ရင်းမြစ်အသေးစိတ် ပြရန်",
        hideDetails: "ရင်းမြစ်အသေးစိတ် ပိတ်ရန်",
      }
    : {
        back: "Back to results",
        quality: "Quality Assessment",
        csvRows: "CSV ROW COUNT",
        status: "QA STATUS",
        warning: "Warning",
        warnings: "WARNINGS",
        errors: "ERRORS",
        usableRows: "USABLE ROWS",
        dataset: "Dataset Information",
        sourceFile: "Source File",
        createdBy: "Created By",
        createdDate: "Created Date",
        totalRows: "Total Rows (CSV)",
        summary: "QA Summary",
        checksPerformed: "Evidence-backed checks",
        sources: "Data Sources Used",
        inputs: "Input Data",
        viewSources: "View All Sources",
        viewInputs: "View All Inputs",
        review: "Pilot Review",
        reviewNotes: "Review Notes",
        localReview: "This note is stored only on this device. It is not sent to the backend or added to training data.",
        showDetails: "Show source details",
        hideDetails: "Hide source details",
      };

  const downloadableCell = selectedCell;
  const downloadablePayload = payload;
  const downloadDisplayedCellCsv = () => {
    const rows: unknown[][] = [
      ["section", "field", "value", "unit", "source", "period"],
      ["metadata", "cell_id", downloadableCell.id, "", "home", isWeekly ? downloadablePayload.live.weekStart : downloadableCell.month],
      ["metadata", "region", downloadableCell.region, "", "home", isWeekly ? downloadablePayload.live.weekStart : downloadableCell.month],
      ...displayFeatures.map((feature) => [
        "feature",
        feature.id,
        feature.value,
        feature.unit,
        feature.status === "weekly_model" ? "persisted_weekly_model" : feature.sourceId,
        isWeekly && feature.status === "weekly_model" ? downloadablePayload.live.weekStart : downloadableCell.month,
      ]),
      ...Object.entries(selectedWeeklyCell?.predictions ?? {}).map(([target, prediction]) => [
        "weekly_prediction",
        target,
        prediction.value,
        prediction.unit,
        prediction.modelVersion ?? "persisted_weekly_model",
        downloadablePayload.live.weekStart,
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvValue).join(",")).join("\r\n")}\r\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${downloadableCell.id}_${isWeekly ? downloadablePayload.live.weekStart : downloadableCell.month}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <main className={`app-shell harvest-dashboard lang-${lang}`}>
      <header className="topbar harvest-topbar">
        <div className="brand harvest-brand">
          <Link href="/" aria-label={lang === "my" ? "ပင်မစာမျက်နှာသို့" : "Go to home"}>
            <span
              aria-label={t.header.title}
              className="harvest-brand-logo"
              role="img"
            />
          </Link>
        </div>
        <div className="topbar-status harvest-topbar-status">
          <button
            onClick={() => setLang(lang === "en" ? "my" : "en")}
            className="harvest-language-switch"
            aria-label={lang === "en" ? t.dashboard.languageSwitchToMyanmar : t.dashboard.languageSwitchToEnglish}
          >
            <HarvestIcon name="globe" size={18} />
            {lang === "en" ? "Myanmar" : "English"}
          </button>
          <SiteNavigation />
          <span className={`harvest-qa-pill ${payload.meta.qa.valid ? "is-passed" : "is-failed"}`}>
            <span className="status-dot" aria-hidden="true" />
            {isWeekly
              ? (lang === "my" ? `Latest weekly · ${payload.live.weekStart}` : `Latest weekly · ${payload.live.weekStart}`)
              : (lang === "my" ? "Historical pilot · Jan 2018" : "Historical pilot · Jan 2018")}
          </span>
        </div>
      </header>

      <div className="content">
        <aside className="harvest-story-rail">
          <section className="harvest-hero-art" aria-label={t.dashboard.geoAiPilot}>
            <div className="harvest-filter-bar">
              <label className="harvest-filter-control">
                <HarvestIcon name="pin" size={19} />
                <span className="sr-only">{t.dashboard.regionFilterAria}</span>
                <select
                  value={region}
                  onChange={(event) => {
                    setRegion(event.target.value);
                    closeCropCalendar();
                  }}
                  aria-label={t.dashboard.regionFilterAria}
                >
                  <option value="ayeyawaddy">{t.dashboard.regionAyeyawaddy}</option>
                  <option value="sagaing">{t.dashboard.regionSagaing}</option>
                  <option value="mandalay">{t.dashboard.regionMandalay}</option>
                  <option value="bago">{t.dashboard.regionBago}</option>
                  <option value="magway">{t.dashboard.regionMagway}</option>
                  <option value="yangon">{t.dashboard.regionYangon}</option>
                </select>
                <HarvestIcon name="chevron" size={16} />
              </label>
              <label className="harvest-filter-control harvest-month-control">
                <HarvestIcon name="calendar" size={18} />
                <span className="sr-only">{lang === "my" ? "ဒေတာကာလ" : "Data period"}</span>
                <select
                  value={period}
                  onChange={(event) => {
                    setPeriod(event.target.value as HomePeriod);
                    closeCropCalendar();
                  }}
                  aria-label={lang === "my" ? "ဒေတာကာလ" : "Data period"}
                >
                  <option value="latest">
                    {isWeekly && payload.live.weekStart
                      ? `${payload.live.weekStart} · Weekly`
                      : (lang === "my" ? "Latest weekly (မရသေး)" : "Latest weekly (unavailable)")}
                  </option>
                  <option value="pilot">{formatMonthLabel(selectedCell.month)} · Historical</option>
                </select>
                <HarvestIcon name="chevron" size={16} />
              </label>
            </div>
          </section>

          <article className="harvest-story-card harvest-about-card">
            <div className="harvest-card-title">
              <HarvestIcon name="sprout" size={18} />
              <h2>{lang === "my" ? "Pilot Cell အကြောင်း" : "About the pilot cell"}</h2>
            </div>
            <p title={t.dashboard.heroNoteDesc}>{t.dashboard.heroNoteDesc}</p>
          </article>

          <article className="harvest-story-card harvest-insight-card">
            <div className="harvest-card-title">
              <HarvestIcon name="lightbulb" size={19} />
              <h2>{isWeekly
                ? (lang === "my" ? "Weekly model အမြင်နှင့် အကြံပြုချက်များ" : "Weekly model insights & recommendations")
                : (lang === "my" ? "Historical rule-based အကြံပြုချက်များ" : "Historical rule-based recommendations")}
              </h2>
            </div>
            {isAbstained ? (
              <div className="harvest-insight-copy">
                <strong>{t.dashboard.abstentionTitle}</strong>
                <p>{t.dashboard.abstentionDesc}</p>
              </div>
            ) : activeCrop ? (
              <div className="harvest-insight-copy">
                <strong>
                  {isWeekly
                    ? (lang === "my" ? "ရွေးချယ်ထားသော weekly သီးနှံအထောက်အထား" : "Selected weekly crop evidence")
                    : (lang === "my" ? "Historical rule-based သီးနှံ" : "Historical rule-based crop")}: {selectedCropLabel}
                </strong>
                <p>
                  {localizeBilingualNarrative(truthfulCropNarrative(activeCrop.why, isWeekly), lang)}
                  {isWeekly
                    ? ` · ${suitabilityTierLabel(activeCrop.suitabilityTier, lang) ?? "—"}${activeCrop.confidence > 0 ? ` · ${Math.round(activeCrop.confidence * 100)}% ${lang === "my" ? "tree-vote agreement (မချိန်ညှိထား)" : "tree-vote agreement (uncalibrated)"}` : ""}`
                    : ` · ${Math.round(activeCrop.confidence * 100)}% ${t.dashboard.ruleConfidence}`}
                </p>
                <div className="factor-list">
                  {activeCrop.positiveFactors.slice(0, 2).map((factor) => (
                    <span className="factor" key={`rail-positive-${factor}`}>✓ {localizeFactor(factor, lang)}</span>
                  ))}
                  {activeCrop.limitingFactors.slice(0, 1).map((factor) => (
                    <span className="factor limiting" key={`rail-limiting-${factor}`}>△ {localizeFactor(factor, lang)}</span>
                  ))}
                </div>
              </div>
            ) : weeklyUnavailable ? (
              <div className="harvest-insight-copy">
                <strong>{lang === "my" ? "Weekly crop model မရနိုင်ပါ" : "Weekly crop model unavailable"}</strong>
                <p>{lang === "my"
                  ? "Production policy အရ flagged crop models ကို မပြထားပါ။ အခြား healthy weekly values များကို map နှင့် condition cards တွင် သုံးထားသည်။"
                  : "Flagged crop models are hidden by production policy. Other healthy weekly values still drive the map and condition cards."}</p>
              </div>
            ) : null}
            <div className="harvest-evidence-note">
              <strong>
                {lang === "my" ? "ဒေတာအထောက်အထားနှင့် QA" : "Evidence & QA"} · {recommendationStatusLabel}
              </strong>
              <span>
                {Math.round(selectedCell.dataCoverage * 100)}% coverage · {t.dashboard.observedLabels}: {selectedCell.observedLabelCount} · {uncertaintyLabel}
              </span>
            </div>
          </article>

          <article className="harvest-story-card harvest-condition-card">
            <div className="harvest-card-title">
              <HarvestIcon name="sun" size={20} />
              <h2>{isWeekly
                ? (lang === "my" ? "နောက်ဆုံး weekly အခြေအနေ" : "Latest weekly conditions")
                : (lang === "my" ? "Historical pilot အခြေအနေ" : "Historical pilot conditions")}
              </h2>
            </div>
            <div className="harvest-condition-list">
              {currentConditionFeatures.map((feature) => (
                <div className="harvest-condition-row" key={`rail-${feature.id}`}>
                  <span className="harvest-condition-label">
                    <i className={`harvest-condition-icon harvest-condition-icon-${feature.id}`}>
                      <HarvestIcon
                        name={
                          feature.id === "mean_temperature_c"
                            ? "thermometer"
                            : feature.id === "era5_soil_moisture_m3_m3"
                              ? "droplet"
                              : feature.id === "soil_ph_h2o_0_30cm"
                                ? "ph"
                                : "rain"
                        }
                        size={14}
                        strokeWidth={1.9}
                      />
                    </i>
                    {localizeBilingualLabel(feature.label, lang)}
                  </span>
                  <strong className={feature.value === null ? "missing-value" : ""}>
                    {formatFeatureValue(feature.value, localizeUnit(feature.unit, lang), t.cell.missing)}
                  </strong>
                </div>
              ))}
            </div>
          </article>

        </aside>

        <div className="harvest-main-column">
          <section className="hero">
          <div>
            <p className="eyebrow flex items-center gap-2">
              {t.dashboard.geoAiPilot} ·
              <select
                value={region}
                onChange={(event) => {
                  setRegion(event.target.value);
                  closeCropCalendar();
                }}
                className="bg-gray-100 border rounded px-2 py-1 text-sm font-semibold text-slate-800"
                aria-label={t.dashboard.regionFilterAria}
              >
                <option value="ayeyawaddy">{t.dashboard.regionAyeyawaddy}</option>
                <option value="sagaing">{t.dashboard.regionSagaing}</option>
                <option value="mandalay">{t.dashboard.regionMandalay}</option>
                <option value="bago">{t.dashboard.regionBago}</option>
                <option value="magway">{t.dashboard.regionMagway}</option>
                <option value="yangon">{t.dashboard.regionYangon}</option>
              </select>
              {t.dashboard.realPilot}
            </p>
            <h1>
              {t.dashboard.heroTitlePre}<em>{t.dashboard.heroTitleEm}</em>
            </h1>
            <p className="hero-copy">
              {t.header.description}
            </p>
          </div>
          <aside className="hero-note real-note">
            <strong>{t.dashboard.heroNoteTitle}</strong>
            <p>{t.dashboard.heroNoteDesc}</p>
          </aside>
          </section>

          <section className="metric-strip" aria-label={t.dashboard.summaryAria}>
          <div className="metric">
            <span className="metric-icon metric-icon-green"><HarvestIcon name="cells" size={23} /></span>
            <span className="metric-copy">
              <span className="metric-value">{numberFormatter.format(isWeekly ? payload.live.cells.length : payload.meta.rowCount)}</span>
              <span className="metric-label">{isWeekly ? "Weekly Cells" : "Pilot Cells"}</span>
              <small>{isWeekly ? `${payload.live.weekStart} run` : `${payload.meta.grid.sizeM / 1000} km grid`}</small>
            </span>
          </div>
          <div className="metric">
            <span className="metric-icon metric-icon-green"><HarvestIcon name="sprout" size={24} /></span>
            <span className="metric-copy">
              <span className="metric-value">{numberFormatter.format(isWeekly ? weeklyPredictionCellCount : payload.meta.scoredCellCount)}</span>
              <span className="metric-label">{isWeekly ? "Model Cells" : "Active Cells"}</span>
              <small>{isWeekly ? "persisted predictions" : "QA-passed pilot"}</small>
            </span>
          </div>
          <div className="metric">
            <span className="metric-icon metric-icon-gold"><HarvestIcon name="regions" size={24} /></span>
            <span className="metric-copy">
              <span className="metric-value">{numberFormatter.format(isWeekly ? weeklyErrorCellCount : payload.meta.abstainedCellCount)}</span>
              <span className="metric-label">Review Cells</span>
              <small>{isWeekly ? "target errors" : `${payload.meta.qa.warningCount} QA warnings`}</small>
            </span>
          </div>
          <div className="metric">
            <span className="metric-icon metric-icon-alert"><HarvestIcon name="alert" size={24} /></span>
            <span className="metric-copy">
              <span className="metric-value">{numberFormatter.format(isWeekly ? weeklyCropCellCount : 0)}</span>
              <span className="metric-label">{isWeekly ? "Crop Predictions" : "Field Labels"}</span>
              <small>{isWeekly
                ? (payload.live.cropPredictionsAvailable ? "production enabled" : "disabled by policy")
                : "No new labels"}</small>
            </span>
          </div>
          </section>

          <section className="workspace" id="harvest-results" aria-label={t.dashboard.workspaceAria}>
          <div className="map-panel harvest-map-card">
            <div className="map-toolbar">
              <strong>{localizeRegion(payload.meta.region, lang)}</strong>
              <span>
                {payload.meta.grid.sizeM / 1000} {t.dashboard.mapToolbar} · {isWeekly
                  ? (weeklyCropCellCount > 0 ? "latest weekly crop suitability" : "latest weekly crop health")
                  : "historical rule score"}
              </span>
            </div>
            <div className="map-legend" aria-label={t.dashboard.mapLegendAria}>
              <span>Low</span>
              <i className="harvest-heat-scale" aria-hidden="true" />
              <span>High</span>
            </div>
            <GeoMap
              cells={payload.cells}
              selectedId={selectedCell.id}
              onSelect={selectCell}
              overlay={isWeekly ? mapOverlay : undefined}
            />
          </div>

          <aside className="detail-panel harvest-detail-panel">
            <section className="harvest-selection-card">
            <div className="panel-kicker">
              <span className="cell-id">{selectedCell.id}</span>
            </div>
            <h2>{localizeRegion(selectedCell.region, lang)} {t.dashboard.pilotCell}</h2>
            <p className="coordinates">
              {selectedCell.latitude.toFixed(4)}, {selectedCell.longitude.toFixed(4)} ·{" "}
              {isWeekly ? payload.live.weekStart : selectedCell.month} · {payload.meta.grid.cellAreaKm2} km²
            </p>
            <span className="badge-stack harvest-selected-status">
              <span className="badge">
                {Math.round((1 - selectedCell.dataCoverage) * 100)}% {t.dashboard.missingPercent}
              </span>
              <span className={`badge ${selectedCell.uncertainty !== "low" ? "warning" : ""}`}>
                {uncertaintyLabel}
              </span>
            </span>

            <div className="harvest-cell-summary">
              <section className="harvest-score-card" aria-label={t.dashboard.evidenceStatus}>
                <span>{isWeekly
                  ? (lang === "my" ? "Weekly model သင့်တော်မှုအဆင့်" : "Weekly model suitability tier")
                  : (lang === "my" ? "Historical rule အမှတ်" : "Historical rule score")}</span>
                <strong>
                  {activeCrop
                    ? (activeCrop.score !== null
                        ? <>{activeCrop.score.toFixed(1)}<small>/100</small></>
                        : suitabilityTierLabel(activeCrop.suitabilityTier, lang) ?? "—")
                    : "—"}
                </strong>
                <p>{activeCrop
                  ? selectedCropLabel
                  : weeklyUnavailable
                    ? (lang === "my" ? "Crop model ပိတ်ထားသည်" : "Crop models disabled")
                    : recommendationStatusLabel}</p>
                <small>
                  {activeCrop
                    ? (isWeekly
                        ? `${activeCrop.validationStatus === "flagged" ? (lang === "my" ? "Flagged စမ်းသပ်ရလဒ်" : "Flagged experimental output") : (lang === "my" ? "စမ်းသပ်ရလဒ်" : "Experimental output")}${activeCrop.confidence > 0 ? ` · ${Math.round(activeCrop.confidence * 100)}% ${lang === "my" ? "tree-vote agreement (မချိန်ညှိထား)" : "tree-vote agreement (uncalibrated)"}` : ""}`
                        : `${t.dashboard.ruleConfidence} ${Math.round(activeCrop.confidence * 100)}% · ${t.dashboard.notModelAccuracy}`)
                    : (weeklyUnavailable
                        ? (lang === "my" ? "Production policy အရ fail-closed" : "Fail-closed by production policy")
                        : t.dashboard.abstentionDesc)}
                </small>
              </section>

              <section className="harvest-summary-conditions" aria-label={lang === "my" ? "အဓိကပတ်ဝန်းကျင်တန်ဖိုးများ" : "Key environmental values"}>
                <h3>{lang === "my" ? "အဓိကအခြေအနေ အချက်များ" : "Key conditions"}</h3>
                {currentConditionFeatures.slice(0, 4).map((feature) => (
                  <div key={`summary-${feature.id}`}>
                    <span>{localizeBilingualLabel(feature.label, lang)}</span>
                    <strong className={feature.value === null ? "missing-value" : ""}>
                      {formatFeatureValue(feature.value, localizeUnit(feature.unit, lang), t.cell.missing)}
                    </strong>
                  </div>
                ))}
              </section>
            </div>
            </section>

            <section className="harvest-download-band">
              <div className="harvest-download-heading">
                <div>
                  <span>Download Data (CHIRPS/ERA5)</span>
                </div>
                {isWeekly ? (
                  <button className="download-link" type="button" onClick={downloadDisplayedCellCsv}>
                    Weekly CSV <HarvestIcon name="download" size={15} />
                  </button>
                ) : (
                  <a
                    className="download-link"
                    href={`/api/v1/cells/${encodeURIComponent(selectedCell.id)}/report.csv?region=${encodeURIComponent(region)}`}
                    download={`${selectedCell.id}_${selectedCell.month}.csv`}
                  >
                    CSV Download <HarvestIcon name="download" size={15} />
                  </a>
                )}
              </div>
              <div className="harvest-download-values">
                {downloadFeatures.map((feature) => (
                  <article key={`download-${feature.id}`}>
                    <span>{localizeBilingualLabel(feature.label, lang)}</span>
                    <strong className={feature.value === null ? "missing-value" : ""}>
                      {formatFeatureValue(feature.value, localizeUnit(feature.unit, lang), t.cell.missing)}
                    </strong>
                    <small>{feature.sourceId}</small>
                  </article>
                ))}
              </div>
            </section>

            <details className="harvest-advanced-details">
              <summary>
                <span>{lang === "my"
                  ? `Model output ${CORE_MODEL_TARGETS.length} ခုလုံးနှင့် အသေးစိတ်ကြည့်ရန်`
                  : `See all ${CORE_MODEL_TARGETS.length} model outputs and evidence`}</span>
                <HarvestIcon name="chevron" size={16} />
              </summary>
              <div className="harvest-advanced-body">

            {isAbstained ? (
              <div className="abstention-card" role="status">
                <span className="abstention-icon" aria-hidden="true">△</span>
                <div>
                  <h3>{t.dashboard.abstentionTitle}</h3>
                  <p>{t.dashboard.abstentionDesc}</p>
                </div>
              </div>
            ) : weeklyUnavailable ? (
              <>
                <LiveCropRecommendationPanel
                  cell={selectedCell}
                  live={payload.live}
                  liveCell={selectedWeeklyCell}
                  activeCropId={selectedCropId}
                  onSelectCrop={selectCrop}
                />
                <RegionalCropCalendarPanel region={payload.meta.region} onSelectCrop={selectCrop} />
              </>
            ) : (
              <>
                <LiveCropRecommendationPanel
                  cell={selectedCell}
                  live={payload.live}
                  liveCell={selectedWeeklyCell}
                  activeCropId={selectedCropId}
                  onSelectCrop={selectCrop}
                />
                <p className="section-label">{t.dashboard.topShortlist}</p>
                <div className="recommendations">
                  {displayRecommendations.slice(0, 3).map((crop) => (
                    <button
                      type="button"
                      key={crop.id}
                      className={`crop-card ${crop.id === selectedCropId ? "active" : ""}`}
                      onClick={() => selectCrop(crop.id)}
                      aria-pressed={crop.id === selectedCropId}
                    >
                      <span className="crop-card-top">
                        <span className="crop-name">
                          {isWeekly && cropModelTarget(crop.id)
                            ? t.modelEvidence.targetLabels[cropModelTarget(crop.id)!]
                            : cropName(crop)}
                        </span>
                        <span className="crop-score">
                          {crop.score !== null ? crop.score.toFixed(1) : suitabilityTierLabel(crop.suitabilityTier, lang)}
                        </span>
                      </span>
                      {crop.score !== null && (
                        <span className="score-track">
                          <span className="score-fill" style={{ width: `${crop.score}%` }} />
                        </span>
                      )}
                      <span className="confidence-line">
                        {isWeekly
                          ? `${lang === "my" ? "Weekly suitability tier" : "Weekly suitability tier"} · ${crop.validationStatus ?? "unknown"}${crop.confidence > 0 ? ` · ${Math.round(crop.confidence * 100)}% ${lang === "my" ? "tree-vote" : "tree vote"}` : ""}`
                          : `${t.dashboard.ruleConfidence} ${Math.round(crop.confidence * 100)}% · ${t.dashboard.notModelAccuracy}`}
                      </span>
                    </button>
                  ))}
                </div>

                {activeCrop && (
                  <div className="why-box">
                    <h3>{t.dashboard.whyThisCrop}</h3>
                    <p>{localizeBilingualNarrative(truthfulCropNarrative(activeCrop.why, isWeekly), lang)}</p>
                    <div className="factor-list">
                      {activeCrop.positiveFactors.map((factor) => (
                        <span className="factor" key={`positive-${factor}`}>✓ {localizeFactor(factor, lang)}</span>
                      ))}
                      {activeCrop.limitingFactors.map((factor) => (
                        <span className="factor limiting" key={`limiting-${factor}`}>△ {localizeFactor(factor, lang)}</span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="uncertainty-box">
              <h3>{t.dashboard.evidenceStatus} · {recommendationStatusLabel}</h3>
              <p>
                {isWeekly
                  ? (lang === "my"
                      ? `Source: persisted weekly run (${payload.live.weekStart} → ${payload.live.weekEnd})။ Crop model: ${payload.live.cropPredictionsAvailable ? "enabled" : "disabled by policy"}။`
                      : `Source: persisted weekly run (${payload.live.weekStart} → ${payload.live.weekEnd}). Crop models: ${payload.live.cropPredictionsAvailable ? "enabled" : "disabled by policy"}.`)
                  : `${t.dashboard.labelSource}: ${t.dashboard.labelSourceRuleBased}။ ${t.dashboard.observedLabels}: ${selectedCell.observedLabelCount}။ ${t.dashboard.trainingEligibility}: ${selectedCell.usableForTraining ? t.dashboard.qaUsableFeatureRow : t.dashboard.excludedByQa}။`}
              </p>
            </div>

            <ModelEvidencePanel
              cell={selectedCell}
              live={payload.live}
              liveCell={selectedWeeklyCell}
              cropId={selectedCropId}
            />

            <div className="feature-section">
              <div className="section-heading">
                <h3>{t.cell.features.title}</h3>
                {isWeekly ? (
                  <button className="download-link" type="button" onClick={downloadDisplayedCellCsv}>
                    Weekly CSV <HarvestIcon name="download" size={15} />
                  </button>
                ) : (
                  <a
                    className="download-link"
                    href={`/api/v1/cells/${encodeURIComponent(selectedCell.id)}/report.csv?region=${encodeURIComponent(region)}`}
                    download={`${selectedCell.id}_${selectedCell.month}.csv`}
                  >
                    {t.dashboard.downloadCsv} <HarvestIcon name="download" size={15} />
                  </a>
                )}
              </div>

              <div className="feature-group mt-4">
                <h4 className="text-sm font-semibold mb-2">{t.cell.features.weatherEvidencetitle}</h4>
                <div className="feature-table">
                  {weatherFeatures.map((feature) => (
                    <div className="feature-row" key={feature.id}>
                      <span>
                        {localizeBilingualLabel(feature.label, lang)}
                        <small>{feature.sourceId}</small>
                      </span>
                      <strong className={feature.value === null ? "missing-value" : ""}>
                        {formatFeatureValue(feature.value, localizeUnit(feature.unit, lang), t.cell.missing)}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="feature-group mt-4">
                <h4 className="text-sm font-semibold mb-2">{t.cell.features.climateTrendTitle}</h4>
                <ClimateLivePanel cell={selectedCell} live={payload.live} liveCell={selectedWeeklyCell} />
              </div>

              {climateFeatures.length > 0 && (
                <div className="feature-group mt-4">
                  <h4 className="text-sm font-semibold mb-2">{t.cell.features.climateTrendTitle}</h4>
                  <div className="feature-table">
                    {climateFeatures.map((feature) => (
                      <div className="feature-row" key={feature.id}>
                        <span>
                          {localizeBilingualLabel(feature.label, lang)}
                          <small>{feature.sourceId}</small>
                        </span>
                        <strong className={feature.value === null ? "missing-value" : ""}>
                          {formatFeatureValue(feature.value, localizeUnit(feature.unit, lang), t.cell.missing)}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="feature-group mt-4">
                <h4 className="text-sm font-semibold mb-2">{t.cell.features.terrainAndSoilTitle}</h4>
                <div className="feature-table">
                  {otherFeatures.map((feature) => (
                    <div className="feature-row" key={feature.id}>
                      <span>
                        {localizeBilingualLabel(feature.label, lang)}
                        <small>{feature.sourceId}</small>
                      </span>
                      <strong className={feature.value === null ? "missing-value" : ""}>
                        {formatFeatureValue(feature.value, localizeUnit(feature.unit, lang), t.cell.missing)}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
              </div>
            </details>

            <NeonWeeklyPredictions
              cell={selectedCell}
              live={payload.live}
              liveCell={selectedWeeklyCell}
            />
          </aside>
          </section>
        </div>

        <section className="evidence-grid harvest-qa-report" id="harvest-evidence-grid">
          <div className="harvest-qa-heading">
            <h2>{qaTitle}</h2>
            <span>
              <HarvestIcon name="cells" size={16} />
              {qaText.quality}
            </span>
          </div>

          <div className="harvest-qa-metrics" aria-label={t.dashboard.summaryAria}>
            <article>
              <i><HarvestIcon name="dataset" size={24} /></i>
              <div><small>{qaText.csvRows}</small><strong>{numberFormatter.format(payload.meta.rowCount)}</strong></div>
            </article>
            <article>
              <i><HarvestIcon name="alert" size={24} /></i>
              <div><small>{qaText.status}</small><strong className={payload.meta.qa.valid ? "is-passed" : "is-warning"}>{qaStatus}</strong></div>
            </article>
            <article>
              <i><HarvestIcon name="cells" size={24} /></i>
              <div><small>{qaText.warnings}</small><strong>{numberFormatter.format(payload.meta.qa.warningCount)}</strong></div>
            </article>
            <article>
              <i><HarvestIcon name="regions" size={24} /></i>
              <div><small>{qaText.errors}</small><strong>{numberFormatter.format(payload.meta.qa.errorCount)}</strong></div>
            </article>
            <article>
              <i><HarvestIcon name="dataset" size={24} /></i>
              <div><small>{qaText.usableRows}</small><strong>{numberFormatter.format(payload.meta.usableCellCount)}</strong></div>
            </article>
          </div>

          <article className="harvest-qa-section harvest-qa-dataset">
            <h3>{qaText.dataset}</h3>
            <dl>
              <div><dt>{qaText.sourceFile}</dt><dd title={sourceFileName}>{sourceFileName}</dd></div>
              <div><dt>{qaText.createdBy}</dt><dd className="is-accent">Pilot data pipeline</dd></div>
              <div><dt>{qaText.createdDate}</dt><dd>{generatedDate}</dd></div>
              <div><dt>{qaText.totalRows}</dt><dd>{numberFormatter.format(payload.meta.rowCount)}</dd></div>
              <div><dt>{qaText.summary}</dt><dd>{payload.meta.qa.warningCount} warnings, {payload.meta.qa.errorCount} errors</dd></div>
              <div><dt>Release ID</dt><dd title={payload.meta.releaseId}>{payload.meta.releaseId.slice(0, 32)}…</dd></div>
            </dl>
            <div className="harvest-qa-checks">
              <h4>{qaText.checksPerformed}</h4>
              <ul>
                {qaChecks.map((check) => (
                  <li key={check.label}>
                    <span aria-hidden="true">{check.passed ? "✓" : "!"}</span>
                    {check.label}
                  </li>
                ))}
              </ul>
            </div>
          </article>

          <article className="harvest-qa-section harvest-qa-sources" id="qa-data-sources">
            <h3>{qaText.sources}</h3>
            <ul>
              {evidenceSources.map((source) => (
                <li key={`report-source-${source.id}`}>
                  <i aria-hidden="true">
                    <HarvestIcon
                      name={
                        source.id === "sentinel1"
                          ? "globe"
                          : source.id === "sentinel2"
                            ? "layers"
                            : source.id === "soilgrids"
                              ? "layers"
                              : source.id === "srtm"
                                ? "dataset"
                                : "link"
                      }
                      size={22}
                    />
                  </i>
                  <div>
                    <a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.name}</a>
                    <span>Resolution: {source.resolution}</span>
                    {source.id === "sentinel2" && <small>Source: SWIR band resampled by Earth Engine composition</small>}
                    {showSourceDetails && (
                      <small>Dataset: {source.datasetId} · Role: {source.role}</small>
                    )}
                    {source.id === "derived_water_availability" && (
                      <small>
                        Period: {payload.meta.periodStart} to {payload.meta.periodEnd} (Released)<br />
                        Source: {payload.meta.releaseId.slice(0, 48)}…
                      </small>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="harvest-qa-outline-button"
              onClick={() => setShowSourceDetails((current) => !current)}
              aria-expanded={showSourceDetails}
            >
              <HarvestIcon name="cells" size={16} />
              {showSourceDetails ? qaText.hideDetails : qaText.showDetails}
            </button>
          </article>

          <article className="harvest-qa-section harvest-qa-inputs">
            <h3>{qaText.inputs}</h3>
            <ul>
              {inputSources.map((source) => (
                <li key={`report-input-${source.id}`}>
                  <i aria-hidden="true"><HarvestIcon name="dataset" size={18} /></i>
                  <div>
                    <a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.name}</a>
                    <span>{source.id === "fao_gaul" ? "Type" : "Resolution"}: {source.resolution}</span>
                    {showInputDetails && (
                      <small>Dataset: {source.datasetId} · Role: {source.role}</small>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="harvest-qa-outline-button harvest-qa-input-button"
              onClick={() => setShowInputDetails((current) => !current)}
              aria-expanded={showInputDetails}
            >
              <HarvestIcon name="upload" size={16} />
              {showInputDetails ? qaText.hideDetails : qaText.showDetails}
            </button>
          </article>

          <article className="harvest-qa-section harvest-qa-review">
            <h3>{qaText.review}</h3>
            <label htmlFor="pilot-review-note">{qaText.reviewNotes}</label>
            <textarea
              id="pilot-review-note"
              value={reviewNote}
              onChange={(event) => {
                setReviewNote(event.target.value);
                setReviewSaved(false);
              }}
              placeholder={t.dashboard.reviewPlaceholder}
            />
            <p className="harvest-review-boundary">{qaText.localReview}</p>
            <button type="button" onClick={saveReview} disabled={reviewNote.trim().length === 0}>
              {reviewSaved ? t.dashboard.reviewSaved : t.dashboard.saveReview}
            </button>
          </article>
        </section>

        <section className="limitations">
          <div>
            <p className="card-eyebrow">{t.dashboard.responsibleUseBoundary}</p>
            <h2>{t.dashboard.limitationsTitle}</h2>
          </div>
          <ul>
            {payload.meta.limitations.map((limitation, index) => (
              <li key={limitation}>
                {t.dashboard.limitations[index] ?? limitation}
              </li>
            ))}
          </ul>
        </section>

        <footer className="footer">
          <span>
            {t.dashboard.footerDisclaimer}
          </span>
          <span>
            {t.dashboard.splitPolicy} · {t.dashboard.syntheticRowsExcluded} · {t.dashboard.contract} {payload.meta.dataContract}
          </span>
        </footer>
      </div>
      <CropCalendarModal
        cropId={calendarCropId}
        region={payload.meta.region}
        onClose={closeCropCalendar}
      />
    </main>
  );
}
