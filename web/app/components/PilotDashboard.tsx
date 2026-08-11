"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GridCell } from "../lib/pilot-data";
import { useLanguage } from "../lib/i18n";
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
import { cropModelTarget } from "../lib/model-contract";
import { HarvestIcon } from "./HarvestIcon";

type PilotSource = {
  id: string;
  name: string;
  datasetId: string;
  role: string;
  resolution: string;
  sourceUrl: string;
};

type ApiPayload = {
  schemaVersion: string;
  meta: {
    releaseId: string;
    dataContract: string;
    dataMode: string;
    region: string;
    periodStart: string;
    periodEnd: string;
    generatedAt: string;
    rowCount: number;
    scoredCellCount: number;
    abstainedCellCount: number;
    usableCellCount: number;
    configuredCrops: string[];
    grid: {
      crs: string;
      sizeM: number;
      cellAreaKm2: number;
    };
    qa: {
      valid: boolean;
      warningCount: number;
      errorCount: number;
    };
    sources: PilotSource[];
    splitPolicy: string;
    limitations: string[];
    sourceCsvSha256?: string;
    qaReportSha256?: string;
    sourceManifestSha256?: string;
    artifacts?: Array<{ name: string; sha256: string }>;
  };
  cells: GridCell[];
};

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

export function PilotDashboard() {
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [activeCropId, setActiveCropId] = useState("");
  const [region, setRegion] = useState("ayeyawaddy");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewSaved, setReviewSaved] = useState(false);
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

  const loadPilot = useCallback(async (
    selectedRegion: string,
    signal?: AbortSignal,
  ) => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch(
        `/api/v1/cells?limit=5000&region=${selectedRegion}`,
        { signal },
      );
      if (!response.ok) {
        throw new Error(`Pilot API returned ${response.status}`);
      }
      const value = (await response.json()) as ApiPayload;
      if (!Array.isArray(value.cells) || !value.meta?.releaseId) {
        throw new Error("Pilot API response did not match the expected contract");
      }
      if (
        value.meta.region.trim().toLocaleLowerCase("en") !==
        selectedRegion.trim().toLocaleLowerCase("en")
      ) {
        throw new Error("Pilot API returned a different regional release");
      }
      if (signal?.aborted || requestId !== requestSequence.current) return;
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
      void loadPilot(region, controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(loadTimer);
      controller.abort();
    };
  }, [loadPilot, region]);

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

  const selectedCropId = activeCropId || selectedCell?.recommendations[0]?.id;
  const activeCrop = selectedCell?.recommendations.find(
    (crop) => crop.id === selectedCropId,
  );

  function saveReview() {
    if (!selectedCell) return;
    const key = `myay-review-${selectedCell.id}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        cellId: selectedCell.id,
        note: reviewNote,
        savedAt: new Date().toISOString(),
        source: "device_local_pilot_review",
        entersTrainingData: false,
      }),
    );
    setReviewSaved(true);
  }

  function selectCell(cellId: string) {
    setSelectedId(cellId);
    setActiveCropId("");
    setReviewSaved(false);
    setReviewNote("");
  }

  function selectCrop(cropId: string) {
    setActiveCropId(cropId);
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
          <button type="button" onClick={() => void loadPilot(region)}>
            {t.error.retry}
          </button>
        </div>
      </main>
    );
  }

  const isAbstained = selectedCell.recommendationStatus === "insufficient_evidence";
  const uncertaintyLabel = {
    low: t.dashboard.uncertaintyLow,
    medium: t.dashboard.uncertaintyMedium,
    high: t.dashboard.uncertaintyHigh,
  }[selectedCell.uncertainty];
  const recommendationStatusLabel = isAbstained
    ? t.dashboard.statusInsufficient
    : t.dashboard.statusScored;
  const selectedCropTarget = cropModelTarget(selectedCropId);
  const selectedCropLabel = activeCrop
    ? cropName(activeCrop)
    : selectedCropTarget
      ? (t.modelEvidence.targetLabels[selectedCropTarget] ?? selectedCropId)
      : selectedCropId;
  const climateFeatures = selectedCell.features.filter((feature) =>
    CLIMATE_FEATURE_IDS.has(feature.id),
  );
  const weatherFeatures = selectedCell.features.filter((feature) =>
    WEATHER_FEATURE_IDS.has(feature.id),
  );
  const otherFeatures = selectedCell.features.filter(
    (feature) =>
      !CLIMATE_FEATURE_IDS.has(feature.id) &&
      !WEATHER_FEATURE_IDS.has(feature.id),
  );
  const currentConditionFeatures = CURRENT_CONDITION_FEATURE_IDS.flatMap((featureId) => {
    const feature = selectedCell.features.find((item) => item.id === featureId);
    return feature ? [feature] : [];
  });
  const downloadFeatures = DOWNLOAD_FEATURE_IDS.flatMap((featureId) => {
    const feature = selectedCell.features.find((item) => item.id === featureId);
    return feature ? [feature] : [];
  });
  const inputSources = payload.meta.sources.filter((source) => INPUT_SOURCE_IDS.has(source.id));
  const evidenceSources = payload.meta.sources.filter((source) => !INPUT_SOURCE_IDS.has(source.id));
  const qaCheckCount = 4;
  const qaPassedCount = Math.max(0, qaCheckCount - payload.meta.qa.errorCount);
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
        checks: "စစ်ဆေးမှုစုစုပေါင်း",
        passedFailed: "အောင်မြင် / မအောင်မြင်",
        score: "QA ရမှတ်",
        dataset: "Dataset အချက်အလက်",
        sourceFile: "မူရင်းဖိုင်",
        createdBy: "ဖန်တီးသူ",
        createdDate: "ဖန်တီးသည့်ရက်",
        totalRows: "အတန်းစုစုပေါင်း (CSV)",
        summary: "QA အကျဉ်းချုပ်",
        checksPerformed: "ပြုလုပ်ပြီးသော စစ်ဆေးမှုများ",
        rowValidation: "အတန်းအရေအတွက် စစ်ဆေးမှု",
        completeness: "ကော်လံပြည့်စုံမှု စစ်ဆေးမှု",
        dataTypes: "ဒေတာအမျိုးအစား စစ်ဆေးမှု",
        valueRange: "တန်ဖိုးအကွာအဝေး စစ်ဆေးမှု",
        sources: "အသုံးပြုထားသော ဒေတာရင်းမြစ်များ",
        inputs: "Input ဒေတာ",
        viewSources: "ရင်းမြစ်အားလုံး ကြည့်ရန်",
        viewInputs: "Input အားလုံး ကြည့်ရန်",
        review: "Pilot သုံးသပ်ချက်",
        reviewNotes: "သုံးသပ်ချက် မှတ်စု",
      }
    : {
        back: "Back to results",
        quality: "Quality Assessment",
        csvRows: "CSV ROW COUNT",
        status: "QA STATUS",
        warning: "Warning",
        checks: "TOTAL CHECKS",
        passedFailed: "PASSED / FAILED",
        score: "QA SCORE",
        dataset: "Dataset Information",
        sourceFile: "Source File",
        createdBy: "Created By",
        createdDate: "Created Date",
        totalRows: "Total Rows (CSV)",
        summary: "QA Summary",
        checksPerformed: "Checks Performed",
        rowValidation: "Row count validation",
        completeness: "Column completeness",
        dataTypes: "Data type validation",
        valueRange: "Value range validation",
        sources: "Data Sources Used",
        inputs: "Input Data",
        viewSources: "View All Sources",
        viewInputs: "View All Inputs",
        review: "Pilot Review",
        reviewNotes: "Review Notes",
      };

  return (
    <main className="app-shell harvest-dashboard">
      <header className="topbar harvest-topbar">
        <div className="brand harvest-brand">
          <span
            aria-label={t.header.title}
            className="harvest-brand-logo"
            role="img"
          />
        </div>
        <div className="topbar-status harvest-topbar-status">
          <button
            onClick={() => setLang(lang === "en" ? "my" : "en")}
            className="harvest-language-switch"
            aria-label={lang === "en" ? t.dashboard.languageSwitchToMyanmar : t.dashboard.languageSwitchToEnglish}
          >
            <HarvestIcon name="globe" size={18} />
            {lang === "en" ? "Myanmar" : "English"}
            <HarvestIcon name="chevron" size={16} />
          </button>
          <span className={`harvest-qa-pill ${payload.meta.qa.valid ? "is-passed" : "is-failed"}`}>
            <span className="status-dot" aria-hidden="true" />
            {t.dashboard.pilotApiStatus} {payload.meta.qa.valid ? t.dashboard.qaPassed : t.dashboard.qaFailed}
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
                  onChange={(event) => setRegion(event.target.value)}
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
              <div className="harvest-filter-control harvest-month-control">
                <HarvestIcon name="calendar" size={18} />
                <span>{formatMonthLabel(selectedCell.month)}</span>
                <HarvestIcon name="chevron" size={16} />
              </div>
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
              <h2>{lang === "my" ? "AI အမြင်နှင့် အကြံပြုချက်များ" : "AI insights & recommendations"}</h2>
            </div>
            {isAbstained ? (
              <div className="harvest-insight-copy">
                <strong>{t.dashboard.abstentionTitle}</strong>
                <p>{t.dashboard.abstentionDesc}</p>
              </div>
            ) : activeCrop ? (
              <div className="harvest-insight-copy">
                <strong>
                  {lang === "my" ? "AI အကြံပြုသီးနှံ" : "AI recommendation"}: {selectedCropLabel}
                </strong>
                <p>
                  {localizeBilingualNarrative(activeCrop.why, lang)} · {Math.round(activeCrop.confidence * 100)}% {t.dashboard.ruleConfidence}
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
              <h2>{lang === "my" ? "လက်ရှိပတ်ဝန်းကျင်အခြေအနေ" : "Current conditions"}</h2>
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

          <nav className="harvest-quick-links" aria-label={lang === "my" ? "အခြားစာမျက်နှာများ" : "Related pages"}>
            <Link href="/macro">📊 {t.dashboard.macroLink}</Link>
            <Link href="/climate">🌦 {t.dashboard.climateLink}</Link>
            <Link href="/faq">? {t.dashboard.faqLink}</Link>
          </nav>
        </aside>

        <div className="harvest-main-column">
          <section className="hero">
          <div>
            <p className="eyebrow flex items-center gap-2">
              {t.dashboard.geoAiPilot} ·
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
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
            <div className="flex gap-4 items-center mb-6">
              <Link href="/macro" className="flex items-center gap-2 bg-emerald-50 text-emerald-800 px-4 py-2 rounded-lg font-medium shadow-sm hover:bg-emerald-100 transition border border-emerald-200">
                📊 {t.dashboard.macroLink}
              </Link>
              <Link href="/climate" className="flex items-center gap-2 bg-amber-50 text-amber-800 px-4 py-2 rounded-lg font-medium shadow-sm hover:bg-amber-100 transition border border-amber-200">
                🌩 {t.dashboard.climateLink}
              </Link>
              <Link href="/faq" className="flex items-center gap-2 bg-blue-50 text-blue-800 px-4 py-2 rounded-lg font-medium shadow-sm hover:bg-blue-100 transition border border-blue-200">
                ? {t.dashboard.faqLink}
              </Link>
            </div>
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
              <span className="metric-value">{numberFormatter.format(payload.meta.rowCount)}</span>
              <span className="metric-label">Pilot Cells</span>
              <small>{payload.meta.grid.sizeM / 1000} km grid</small>
            </span>
          </div>
          <div className="metric">
            <span className="metric-icon metric-icon-green"><HarvestIcon name="sprout" size={24} /></span>
            <span className="metric-copy">
              <span className="metric-value">{numberFormatter.format(payload.meta.scoredCellCount)}</span>
              <span className="metric-label">Active Cells</span>
              <small>QA-passed pilot</small>
            </span>
          </div>
          <div className="metric">
            <span className="metric-icon metric-icon-gold"><HarvestIcon name="regions" size={24} /></span>
            <span className="metric-copy">
              <span className="metric-value">{numberFormatter.format(payload.meta.abstainedCellCount)}</span>
              <span className="metric-label">Review Cells</span>
              <small>{payload.meta.qa.warningCount} QA warnings</small>
            </span>
          </div>
          <div className="metric">
            <span className="metric-icon metric-icon-alert"><HarvestIcon name="alert" size={24} /></span>
            <span className="metric-copy">
              <span className="metric-value">0</span>
              <span className="metric-label">Field Labels</span>
              <small>No new labels</small>
            </span>
          </div>
          </section>

          <section className="workspace" id="harvest-results" aria-label={t.dashboard.workspaceAria}>
          <div className="map-panel harvest-map-card">
            <div className="map-toolbar">
              <strong>{localizeRegion(payload.meta.region, lang)}</strong>
              <span>
                {payload.meta.grid.sizeM / 1000} {t.dashboard.mapToolbar} · {t.dashboard.mapLayerSource}
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
              {selectedCell.month} · {payload.meta.grid.cellAreaKm2} km²
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
                <span>{lang === "my" ? "အကြံပြုသီးနှံ အမှတ်" : "Recommended crop score"}</span>
                <strong>{activeCrop ? activeCrop.score.toFixed(1) : "—"}<small>/100</small></strong>
                <p>{activeCrop ? selectedCropLabel : recommendationStatusLabel}</p>
                <small>
                  {activeCrop
                    ? `${t.dashboard.ruleConfidence} ${Math.round(activeCrop.confidence * 100)}% · ${t.dashboard.notModelAccuracy}`
                    : t.dashboard.abstentionDesc}
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
                <a
                  className="download-link"
                  href={`/api/v1/cells/${encodeURIComponent(selectedCell.id)}/report.csv?region=${encodeURIComponent(region)}`}
                  download={`${selectedCell.id}_${selectedCell.month}.csv`}
                >
                  CSV Download <HarvestIcon name="download" size={15} />
                </a>
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
                <span>{lang === "my" ? "Model အထောက်အထားနှင့် အသေးစိတ်အချက်များ" : "Model evidence and full details"}</span>
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
            ) : (
              <>
                <LiveCropRecommendationPanel
                  cell={selectedCell}
                  activeCropId={selectedCropId}
                  onSelectCrop={selectCrop}
                />
                <p className="section-label">{t.dashboard.topShortlist}</p>
                <div className="recommendations">
                  {selectedCell.recommendations.slice(0, 3).map((crop) => (
                    <button
                      type="button"
                      key={crop.id}
                      className={`crop-card ${crop.id === selectedCropId ? "active" : ""}`}
                      onClick={() => selectCrop(crop.id)}
                      aria-pressed={crop.id === selectedCropId}
                    >
                      <span className="crop-card-top">
                        <span className="crop-name">
                          {cropName(crop)}
                        </span>
                        <span className="crop-score">{crop.score.toFixed(1)}</span>
                      </span>
                      <span className="score-track">
                        <span className="score-fill" style={{ width: `${crop.score}%` }} />
                      </span>
                      <span className="confidence-line">
                        {t.dashboard.ruleConfidence} {Math.round(crop.confidence * 100)}% · {t.dashboard.notModelAccuracy}
                      </span>
                    </button>
                  ))}
                </div>

                {activeCrop && (
                  <div className="why-box">
                    <h3>{t.dashboard.whyThisCrop}</h3>
                    <p>{localizeBilingualNarrative(activeCrop.why, lang)}</p>
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
                {t.dashboard.labelSource}: {t.dashboard.labelSourceRuleBased}။ {t.dashboard.observedLabels}:
                {" "}{selectedCell.observedLabelCount}။ {t.dashboard.trainingEligibility}:
                {" "}{selectedCell.usableForTraining ? t.dashboard.qaUsableFeatureRow : t.dashboard.excludedByQa}။
              </p>
            </div>

            <ModelEvidencePanel cell={selectedCell} cropId={selectedCropId} />

            <div className="feature-section">
              <div className="section-heading">
                <h3>{t.cell.features.title}</h3>
                <a
                  className="download-link"
                  href={`/api/v1/cells/${encodeURIComponent(selectedCell.id)}/report.csv?region=${encodeURIComponent(region)}`}
                  download={`${selectedCell.id}_${selectedCell.month}.csv`}
                >
                  {t.dashboard.downloadCsv} <HarvestIcon name="download" size={15} />
                </a>
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
                <ClimateLivePanel cell={selectedCell} />
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
          </aside>
          </section>
        </div>

        <section className="evidence-grid harvest-qa-report" id="harvest-evidence-grid">
          <header className="harvest-qa-report-topbar">
            <a href="#harvest-results" className="harvest-qa-back-link">
              <span aria-hidden="true">←</span>
              {qaText.back}
            </a>
            <div className="harvest-qa-topbar-actions">
              <button
                type="button"
                className="harvest-qa-language"
                onClick={() => setLang(lang === "en" ? "my" : "en")}
                aria-label={lang === "en" ? t.dashboard.languageSwitchToMyanmar : t.dashboard.languageSwitchToEnglish}
              >
                <HarvestIcon name="globe" size={17} />
                {lang === "en" ? "English" : "Myanmar"}
                <HarvestIcon name="chevron" size={15} />
              </button>
              <span className="harvest-qa-api-status">
                <i aria-hidden="true" />
                Real pilot API - QA
              </span>
            </div>
          </header>

          <div className="harvest-qa-heading">
            <h2>63000 QA</h2>
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
              <div><small>{qaText.status}</small><strong className="is-warning">{qaText.warning}</strong></div>
            </article>
            <article>
              <i><HarvestIcon name="cells" size={24} /></i>
              <div><small>{qaText.checks}</small><strong>{qaCheckCount}</strong></div>
            </article>
            <article>
              <i><HarvestIcon name="regions" size={24} /></i>
              <div>
                <small>{qaText.passedFailed}</small>
                <strong><b>{qaPassedCount}</b> / {payload.meta.qa.errorCount}</strong>
              </div>
            </article>
            <article>
              <i><HarvestIcon name="dataset" size={24} /></i>
              <div><small>{qaText.score}</small><strong>{numberFormatter.format(payload.meta.usableCellCount)}</strong></div>
            </article>
          </div>

          <article className="harvest-qa-section harvest-qa-dataset">
            <h3>{qaText.dataset}</h3>
            <dl>
              <div><dt>{qaText.sourceFile}</dt><dd>63data.csv</dd></div>
              <div><dt>{qaText.createdBy}</dt><dd className="is-accent">Real Pilot</dd></div>
              <div><dt>{qaText.createdDate}</dt><dd>{generatedDate}</dd></div>
              <div><dt>{qaText.totalRows}</dt><dd>{numberFormatter.format(payload.meta.rowCount)}</dd></div>
              <div><dt>{qaText.summary}</dt><dd>{qaCheckCount} checks, {payload.meta.qa.errorCount} failed</dd></div>
              <div><dt>{qaText.score}</dt><dd>{numberFormatter.format(payload.meta.usableCellCount)}</dd></div>
            </dl>
            <div className="harvest-qa-checks">
              <h4>{qaText.checksPerformed}</h4>
              <ul>
                {[qaText.rowValidation, qaText.completeness, qaText.dataTypes, qaText.valueRange].map((check) => (
                  <li key={check}><span aria-hidden="true">✓</span>{check}</li>
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
            <button type="button" className="harvest-qa-outline-button">
              <HarvestIcon name="cells" size={16} />
              {qaText.viewSources}
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
                  </div>
                </li>
              ))}
            </ul>
            <button type="button" className="harvest-qa-outline-button harvest-qa-input-button">
              <HarvestIcon name="upload" size={16} />
              {qaText.viewInputs}
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
            <button type="button" onClick={saveReview}>
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
    </main>
  );
}
