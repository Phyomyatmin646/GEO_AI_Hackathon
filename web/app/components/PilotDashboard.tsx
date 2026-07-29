"use client";

import dynamic from "next/dynamic";
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
import Link from "next/link";

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

  const activeCrop =
    selectedCell?.recommendations.find((crop) => crop.id === activeCropId) ??
    selectedCell?.recommendations[0];

  function saveReview() {
    if (!selectedCell || !activeCrop) return;
    const key = `myay-review-${selectedCell.id}-${activeCrop.id}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        cellId: selectedCell.id,
        cropId: activeCrop.id,
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">{lang === "en" ? "M" : "မ"}</span>
          <span>
            <span className="brand-name">
              {t.header.title.split("|")[0]?.trim()}
            </span>
            <span className="brand-subtitle">
              {t.header.title.split("|")[1]?.trim()}
            </span>
          </span>
        </div>
        <div className="topbar-status">
          <button
            onClick={() => setLang(lang === "en" ? "my" : "en")}
            className="text-sm border px-2 py-1 rounded"
            aria-label={lang === "en" ? t.dashboard.languageSwitchToMyanmar : t.dashboard.languageSwitchToEnglish}
          >
            {lang === "en" ? "Myanmar" : "English"}
          </button>
          <span className="status-dot" aria-hidden="true" />
          <span>{t.dashboard.pilotApiStatus} {payload.meta.qa.valid ? t.dashboard.qaPassed : t.dashboard.qaFailed}</span>
        </div>
      </header>

      <div className="content">
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
            <span className="metric-value">{numberFormatter.format(payload.meta.rowCount)}</span>
            <span className="metric-label">{t.dashboard.metricCells}</span>
          </div>
          <div className="metric">
            <span className="metric-value">{numberFormatter.format(payload.meta.scoredCellCount)}</span>
            <span className="metric-label">{t.dashboard.metricScored}</span>
          </div>
          <div className="metric">
            <span className="metric-value">{numberFormatter.format(payload.meta.abstainedCellCount)}</span>
            <span className="metric-label">{t.dashboard.metricAbstained}</span>
          </div>
          <div className="metric">
            <span className="metric-value">0</span>
            <span className="metric-label">{t.dashboard.metricLabels}</span>
          </div>
        </section>

        <section className="workspace" aria-label={t.dashboard.workspaceAria}>
          <div className="map-panel">
            <div className="map-toolbar">
              <strong>{localizeRegion(payload.meta.region, lang)} · {selectedCell.month}</strong>
              <span>
                {payload.meta.grid.sizeM / 1000} {t.dashboard.mapToolbar}
              </span>
            </div>
            <div className="map-legend" aria-label={t.dashboard.mapLegendAria} style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {Array.from(new Set(payload.cells.map(c => c.recommendations[0]?.id).filter(Boolean))).map(cropId => (
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

          <aside className="detail-panel">
            <div className="panel-kicker">
              <span className="cell-id">{selectedCell.id}</span>
              <span className="badge-stack">
                <span className="badge">
                  {Math.round((1 - selectedCell.dataCoverage) * 100)}% {t.dashboard.missingPercent}
                </span>
                <span className={`badge ${selectedCell.uncertainty !== "low" ? "warning" : ""}`}>
                  {uncertaintyLabel}
                </span>
              </span>
            </div>
            <h2>{localizeRegion(selectedCell.region, lang)} {t.dashboard.pilotCell}</h2>
            <p className="coordinates">
              {selectedCell.latitude.toFixed(4)}, {selectedCell.longitude.toFixed(4)} ·{" "}
              {selectedCell.month} · {payload.meta.grid.cellAreaKm2} km²
            </p>

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
                <p className="section-label">{t.dashboard.topShortlist}</p>
                <div className="recommendations">
                  {selectedCell.recommendations.slice(0, 3).map((crop) => (
                    <button
                      type="button"
                      key={crop.id}
                      className={`crop-card ${crop.id === activeCrop?.id ? "active" : ""}`}
                      onClick={() => selectCrop(crop.id)}
                      aria-pressed={crop.id === activeCrop?.id}
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

            <div className="feature-section">
              <div className="section-heading">
                <h3>{t.cell.features.title}</h3>
                <a
                  className="download-link"
                  href={`/api/v1/cells/${encodeURIComponent(selectedCell.id)}/report.csv?region=${encodeURIComponent(region)}`}
                  download={`${selectedCell.id}_${selectedCell.month}.csv`}
                >
                  {t.dashboard.downloadCsv}
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

              <div className={`feature-group mt-4 border-2 p-2 ${climateFeatures.length === 0
                  ? "opacity-50 border-dashed bg-gray-50"
                  : "border-emerald-100 bg-emerald-50/40"
                }`}>
                <h4 className="text-sm font-semibold mb-2">{t.cell.features.climateTrendTitle}</h4>
                <div className="feature-table">
                  {climateFeatures.length > 0 ? (
                    climateFeatures.map((feature) => (
                      <div className="feature-row" key={feature.id}>
                        <span>
                          {localizeBilingualLabel(feature.label, lang)}
                          <small>{feature.sourceId} · {t.dashboard.climateBaseline}</small>
                        </span>
                        <strong className={feature.value === null ? "missing-value" : ""}>
                          {formatFeatureValue(feature.value, localizeUnit(feature.unit, lang), t.cell.missing)}
                        </strong>
                      </div>
                    ))
                  ) : (
                    <div className="feature-row">
                      <span>
                        {t.cell.features.climateTrendTitle}
                        <small>{t.dashboard.climateBaseline}</small>
                      </span>
                      <strong className="missing-value text-xs italic">
                        {t.cell.features.pendingClimateData}
                      </strong>
                    </div>
                  )}
                </div>
              </div>

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
          </aside>
        </section>

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
            {activeCrop ? (
              <>
                <p>
                  {lang === 'my' ? activeCrop.nameMm : activeCrop.nameEn} {t.dashboard.reviewQuestion}
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
