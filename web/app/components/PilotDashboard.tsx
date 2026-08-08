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
import { CROP_COLORS } from "../lib/colors";
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

type ReviewVerdict = "agree" | "uncertain" | "disagree";

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

function shortHash(value: string | undefined, notPublished: string) {
  if (!value) return notPublished;
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

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

export function PilotDashboard() {
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [activeCropId, setActiveCropId] = useState("");
  const [region, setRegion] = useState("ayeyawaddy");
  const [verdict, setVerdict] = useState<ReviewVerdict>("uncertain");
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
    if (!selectedCell || !selectedCropId) return;
    const key = `myay-review-${selectedCell.id}-${selectedCropId}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        cellId: selectedCell.id,
        cropId: selectedCropId,
        verdict,
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

  const sourceHash =
    payload.meta.sourceCsvSha256 ??
    payload.meta.artifacts?.find((artifact) => artifact.name.endsWith(".csv"))?.sha256;
  const qaHash =
    payload.meta.qaReportSha256 ??
    payload.meta.artifacts?.find((artifact) => artifact.name.includes("qa_report"))?.sha256;
  const manifestHash =
    payload.meta.sourceManifestSha256 ??
    payload.meta.artifacts?.find((artifact) =>
      artifact.name.includes("source_manifest"),
    )?.sha256;
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
  const mapLegendCropIds = Array.from(
    new Set(
      payload.cells
        .map((cell) => cell.recommendations[0]?.id)
        .filter((cropId): cropId is string => Boolean(cropId)),
    ),
  );

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
                </select>
                <HarvestIcon name="chevron" size={16} />
              </label>
              <div className="harvest-filter-control harvest-month-control">
                <HarvestIcon name="calendar" size={18} />
                <span>{selectedCell.month}</span>
                <HarvestIcon name="chevron" size={16} />
              </div>
            </div>
          </section>

          <article className="harvest-story-card harvest-about-card">
            <div className="harvest-card-title">
              <HarvestIcon name="sprout" size={18} />
              <h2>{lang === "my" ? "Pilot Cell အကြောင်း" : "About the pilot cell"}</h2>
            </div>
            <p>{t.dashboard.heroNoteDesc}</p>
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
                <strong>{selectedCropLabel}</strong>
                <p>{localizeBilingualNarrative(activeCrop.why, lang)}</p>
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
              <strong>{t.dashboard.evidenceStatus} · {recommendationStatusLabel}</strong>
              <span>{t.dashboard.observedLabels}: {selectedCell.observedLabelCount} · {uncertaintyLabel}</span>
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
                  <span>{localizeBilingualLabel(feature.label, lang)}</span>
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
              <span className="metric-label">{t.dashboard.metricCells}</span>
              <small>{payload.meta.grid.sizeM / 1000} km · {payload.meta.grid.crs}</small>
            </span>
          </div>
          <div className="metric">
            <span className="metric-icon metric-icon-green"><HarvestIcon name="sprout" size={24} /></span>
            <span className="metric-copy">
              <span className="metric-value">{numberFormatter.format(payload.meta.scoredCellCount)}</span>
              <span className="metric-label">{t.dashboard.metricScored}</span>
              <small>{t.dashboard.realPilot}</small>
            </span>
          </div>
          <div className="metric">
            <span className="metric-icon metric-icon-gold"><HarvestIcon name="regions" size={24} /></span>
            <span className="metric-copy">
              <span className="metric-value">{numberFormatter.format(payload.meta.abstainedCellCount)}</span>
              <span className="metric-label">{t.dashboard.metricAbstained}</span>
              <small>{payload.meta.qa.warningCount} {lang === "my" ? "သတိပေးချက်" : "QA warnings"}</small>
            </span>
          </div>
          <div className="metric">
            <span className="metric-icon metric-icon-alert"><HarvestIcon name="alert" size={24} /></span>
            <span className="metric-copy">
              <span className="metric-value">0</span>
              <span className="metric-label">{t.dashboard.metricLabels}</span>
              <small>{lang === "my" ? "Field label အသစ်မရှိသေး" : "No new field labels"}</small>
            </span>
          </div>
          </section>

          <section className="workspace" aria-label={t.dashboard.workspaceAria}>
          <div className="map-panel harvest-map-card">
            <div className="map-toolbar">
              <strong>{localizeRegion(payload.meta.region, lang)}</strong>
              <span>
                {payload.meta.grid.sizeM / 1000} {t.dashboard.mapToolbar} · {t.dashboard.mapLayerSource}
              </span>
            </div>
            <div className="map-legend" aria-label={t.dashboard.mapLegendAria}>
              {mapLegendCropIds.map(cropId => (
                <span key={cropId} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.85rem", color: "#4b5563" }}>
                  <i style={{ width: "12px", height: "12px", display: "inline-block", backgroundColor: CROP_COLORS[cropId as string] || "#8b918c", borderRadius: "2px" }} />
                  {(() => {
                    const crop = payload.cells.find((cell) => cell.recommendations[0]?.id === cropId)?.recommendations[0];
                    return crop ? cropName(crop) : cropId;
                  })()}
                </span>
              ))}
              <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.85rem", color: "#4b5563" }}>
                <i style={{ width: "12px", height: "12px", display: "inline-block", backgroundColor: "#8b918c", borderRadius: "2px" }} />
                {t.dashboard.missingUnknown}
              </span>
            </div>
            <GeoMap
              cells={payload.cells}
              selectedId={selectedCell.id}
              onSelect={selectCell}
            />
          </div>

          <aside className="detail-panel harvest-detail-panel">
            <div className="panel-kicker">
              <span className="cell-id">{selectedCell.id}</span>
            </div>
            <h2>{localizeRegion(selectedCell.region, lang)} {t.dashboard.pilotCell}</h2>
            <p className="coordinates">
              {selectedCell.latitude.toFixed(4)}, {selectedCell.longitude.toFixed(4)} ·{" "}
              {payload.meta.grid.cellAreaKm2} km²
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

            <section className="harvest-download-band">
              <div className="harvest-download-heading">
                <div>
                  <span>{lang === "my" ? "ဒေတာရယူရန်" : "Download data"}</span>
                  <small>CHIRPS / ERA5 / SoilGrids</small>
                </div>
                <a
                  className="download-link"
                  href={`/api/v1/cells/${encodeURIComponent(selectedCell.id)}/report.csv?region=${encodeURIComponent(region)}`}
                  download={`${selectedCell.id}_${selectedCell.month}.csv`}
                >
                  CSV {t.dashboard.downloadCsv} <HarvestIcon name="download" size={15} />
                </a>
              </div>
              <div className="harvest-download-values">
                {currentConditionFeatures.slice(0, 4).map((feature) => (
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

        <section className="evidence-grid">
          <article className="evidence-card">
            <p className="card-eyebrow">{t.dashboard.releaseEvidence}</p>
            <h3>{t.dashboard.dataQa}</h3>
            <div className="qa-row">
              <span>{t.dashboard.regionalRows}</span>
              <span>{numberFormatter.format(payload.meta.rowCount)}</span>
            </div>
            <div className="qa-row">
              <span>{t.dashboard.qaGate}</span>
              <span className={payload.meta.qa.valid ? "qa-pass" : "qa-fail"}>
                {payload.meta.qa.valid ? t.dashboard.pass : t.dashboard.fail}
              </span>
            </div>
            <div className="qa-row">
              <span>{t.dashboard.warningsErrors}</span>
              <span>{payload.meta.qa.warningCount} / {payload.meta.qa.errorCount}</span>
            </div>
            <div className="qa-row">
              <span>{t.dashboard.qaUsableRows}</span>
              <span>{numberFormatter.format(payload.meta.usableCellCount)}</span>
            </div>
            <div className="hash-box">
              <span>{t.dashboard.sourceCsvHash}</span>
              <code title={sourceHash}>{shortHash(sourceHash, t.cell.notPublished)}</code>
              <span>{t.dashboard.qaReportHash}</span>
              <code title={qaHash}>{shortHash(qaHash, t.cell.notPublished)}</code>
              <span>{t.dashboard.sourceManifestHash}</span>
              <code title={manifestHash}>{shortHash(manifestHash, t.cell.notPublished)}</code>
            </div>
          </article>

          <article className="evidence-card source-card">
            <p className="card-eyebrow">{t.dashboard.traceableInputs}</p>
            <h3>{t.dashboard.sourceProvenance}</h3>
            <ul className="source-list">
              {payload.meta.sources.map((source) => (
                <li key={source.id}>
                  <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                    {source.name}
                  </a>
                  <span>
                    {t.dashboard.sourceRoles[source.id] ?? source.role} ·{" "}
                    {source.resolution}
                  </span>
                </li>
              ))}
            </ul>
            <p>
              {t.dashboard.period}: {payload.meta.periodStart} → {payload.meta.periodEnd}. {t.dashboard.release}:
              {" "}<code>{payload.meta.releaseId}</code>.
            </p>
          </article>

          <article className="evidence-card">
            <p className="card-eyebrow">{t.dashboard.reviewTitle}</p>
            <h3>{t.dashboard.reviewTitle}</h3>
            {selectedCropId ? (
              <>
                <p>
                  {selectedCropLabel} {t.dashboard.reviewQuestion}
                </p>
                <div className="review-controls">
                  {(["agree", "uncertain", "disagree"] as ReviewVerdict[]).map((value) => (
                    <button
                      type="button"
                      key={value}
                      className={verdict === value ? "selected" : ""}
                      onClick={() => setVerdict(value)}
                    >
                      {t.dashboard[value]}
                    </button>
                  ))}
                </div>
                <textarea
                  className="review-note"
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  placeholder={t.dashboard.reviewPlaceholder}
                />
                <button type="button" className="save-review" onClick={saveReview}>
                  {reviewSaved ? t.dashboard.reviewSaved : t.dashboard.saveReview}
                </button>
                <p className="review-disclaimer">
                  {t.dashboard.reviewDisclaimer}
                </p>
              </>
            ) : (
              <p>
                {t.dashboard.reviewAbstained}
              </p>
            )}
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
